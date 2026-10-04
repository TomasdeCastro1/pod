import { pricePer1000 } from '@app/shared';
import { and, asc, eq } from 'drizzle-orm';
import type { AnyDb } from './db/seed/index.js';
import { companyFields, fieldCatalog, priceSettings } from './db/schema.js';

export type CatalogField = typeof fieldCatalog.$inferSelect;
export type CompanyField = CatalogField & { enabled: boolean };
export type DocType = 'factura' | 'devolucion';

/** Catálogo activo, en el orden de la especificación. */
export async function getCatalog(db: AnyDb): Promise<CatalogField[]> {
  return db
    .select()
    .from(fieldCatalog)
    .where(eq(fieldCatalog.active, true))
    .orderBy(asc(fieldCatalog.sortOrder));
}

/** Base (siempre enabled) más opcionales con el estado que tiene la empresa. */
export async function getCompanyFields(db: AnyDb, companyId: string): Promise<CompanyField[]> {
  const catalog = await getCatalog(db);
  const rows = await db.select().from(companyFields).where(eq(companyFields.companyId, companyId));
  const enabledKeys = new Set(rows.filter((r) => r.enabled).map((r) => r.fieldKey));
  return catalog.map((f) => ({ ...f, enabled: f.isBase || enabledKeys.has(f.key) }));
}

/**
 * Claves que se piden para ese tipo de documento (null = tipo desconocido: todas las
 * habilitadas). No filtra por QR (eso lo hace T1.6). Decisión 9: en facturas `items` se
 * pide solo si hay algún `fact_item_*` activo.
 */
export async function getRequestedFields(
  db: AnyDb,
  companyId: string,
  docType: DocType | null,
): Promise<string[]> {
  const fields = await getCompanyFields(db, companyId);
  const applies = (f: CompanyField) =>
    f.enabled && (docType === null || f.docTypes.includes(docType));
  const keys = fields.filter(applies).map((f) => f.key);
  const hasFactItems = fields.some((f) => f.enabled && f.key.startsWith('fact_item_'));
  const hasItems = keys.includes('items');
  if (docType === 'factura' && !hasItems && hasFactItems) keys.push('items');
  if (docType === 'factura' && hasItems && !hasFactItems) return keys.filter((k) => k !== 'items');
  return keys;
}

/** Precio por 1.000 imágenes: base de price_settings más los opcionales activos de la empresa. */
export async function computePricePer1000(db: AnyDb, companyId: string): Promise<number> {
  const [settings] = await db.select().from(priceSettings).where(eq(priceSettings.id, 1));
  if (!settings) throw new Error('price_settings sin cargar: correr npm run db:seed');
  const rows = await db
    .select({ price: fieldCatalog.pricePer1000Usd })
    .from(companyFields)
    .innerJoin(fieldCatalog, eq(companyFields.fieldKey, fieldCatalog.key))
    .where(
      and(
        eq(companyFields.companyId, companyId),
        eq(companyFields.enabled, true),
        eq(fieldCatalog.active, true),
        eq(fieldCatalog.isBase, false),
      ),
    );
  return pricePer1000(
    Number(settings.basePricePer1000Usd),
    rows.map((r) => Number(r.price)),
  );
}
