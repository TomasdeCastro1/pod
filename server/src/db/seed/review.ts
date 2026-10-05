import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import sharp from 'sharp';
import { companies, memberships, scans, users } from '../schema.js';
import { generateInviteCode } from '../../companies/inviteCode.js';
import { makeThumb } from '../../images.js';
import { imageKey, thumbKey } from '../../storage/keys.js';
import type { ObjectStore } from '../../storage/index.js';
import type { AnyDb } from './index.js';

export const DEMO_COMPANY_NAME = 'Empresa Demo';
/** RUT con dígito verificador válido. */
export const DEMO_COMPANY_RUT = '210000000000';

type Conformidad = 'completa' | 'firma_sola' | 'dudosa' | 'sin_firma';

interface Sample {
  docType: string;
  status: 'listo' | 'revisar' | 'error';
  conformidad: Conformidad | null;
  tipoCfe?: number;
  serie?: string;
  numero?: string;
  cliente?: string;
  clienteRut?: string;
  local?: string;
  total?: string;
  sello?: string;
  revisar?: Array<{ campo: string; motivo: string }>;
  error?: string;
}

/** Resultados escritos a mano: no se llama a la IA. */
const SAMPLES: Sample[] = [
  {
    docType: 'factura_emitida',
    status: 'listo',
    conformidad: 'completa',
    tipoCfe: 111,
    serie: 'A',
    numero: '1001',
    cliente: 'Almacén Don Pepe',
    clienteRut: '215555550010',
    local: 'Local Centro',
    total: '4520.00',
    sello: 'Recibido conforme. J. Pérez',
  },
  {
    docType: 'factura_emitida',
    status: 'listo',
    conformidad: 'completa',
    tipoCfe: 111,
    serie: 'A',
    numero: '1002',
    cliente: 'Supermercado El Sol',
    clienteRut: '216666660017',
    local: 'Sucursal Pocitos',
    total: '12890.50',
    sello: 'Recibido. Supermercado El Sol',
  },
  {
    docType: 'factura_emitida',
    status: 'listo',
    conformidad: 'firma_sola',
    tipoCfe: 111,
    serie: 'A',
    numero: '1003',
    cliente: 'Kiosco La Esquina',
    clienteRut: '217777770013',
    local: 'Kiosco Cordón',
    total: '1830.00',
  },
  {
    docType: 'factura_emitida',
    status: 'revisar',
    conformidad: 'dudosa',
    tipoCfe: 111,
    serie: 'A',
    numero: '1004',
    cliente: 'Panadería Los Pinos',
    clienteRut: '218888880028',
    local: 'Local Carrasco',
    total: '3275.00',
    revisar: [{ campo: 'total', motivo: 'El importe escrito a mano no coincide con el impreso' }],
  },
  {
    docType: 'factura_emitida',
    status: 'listo',
    conformidad: 'sin_firma',
    tipoCfe: 111,
    serie: 'A',
    numero: '1005',
    cliente: 'Farmacia Central',
    clienteRut: '219999990016',
    local: 'Local Tres Cruces',
    total: '7640.00',
  },
  {
    docType: 'factura_emitida',
    status: 'listo',
    conformidad: 'completa',
    tipoCfe: 111,
    serie: 'A',
    numero: '1006',
    cliente: 'Restaurante La Costa',
    clienteRut: '210101010028',
    local: 'Rambla Sur',
    total: '9980.00',
    sello: 'Recibido conforme. M. Silva',
  },
  {
    docType: 'nota_credito_emitida',
    status: 'listo',
    conformidad: 'completa',
    tipoCfe: 112,
    serie: 'A',
    numero: '201',
    cliente: 'Almacén Don Pepe',
    clienteRut: '215555550010',
    local: 'Local Centro',
    total: '980.00',
    sello: 'Devolución recibida. J. Pérez',
  },
  {
    docType: 'nota_credito_emitida',
    status: 'revisar',
    conformidad: 'firma_sola',
    tipoCfe: 112,
    serie: 'A',
    numero: '202',
    cliente: 'Supermercado El Sol',
    clienteRut: '216666660017',
    local: 'Sucursal Pocitos',
    total: '1450.00',
    revisar: [{ campo: 'numero', motivo: 'Número poco legible' }],
  },
  {
    docType: 'devolucion_cliente',
    status: 'listo',
    conformidad: 'completa',
    cliente: 'Kiosco La Esquina',
    clienteRut: '217777770013',
    local: 'Kiosco Cordón',
    total: '620.00',
    sello: 'Devolución conforme. A. Díaz',
  },
  {
    docType: 'devolucion_cliente',
    status: 'listo',
    conformidad: 'sin_firma',
    cliente: 'Panadería Los Pinos',
    local: 'Local Carrasco',
    total: '410.00',
  },
  {
    docType: 'otro',
    status: 'listo',
    conformidad: 'dudosa',
    cliente: 'Cliente sin identificar',
    local: 'Sin dato',
  },
  { docType: 'no_reconocido', status: 'listo', conformidad: null },
  {
    docType: 'factura_emitida',
    status: 'error',
    conformidad: null,
    error: 'No pudimos leer este comprobante. Probá sacar la foto de nuevo.',
  },
];

const BASE_KEYS = [
  'tipo_documento',
  'rut_emisor',
  'tipo_cfe',
  'serie',
  'numero',
  'fecha_documento',
  'total',
  'cliente_rut',
  'cliente_nombre',
  'local',
  'conformidad_nivel',
  'sello_texto',
];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** JPEG sintético con aspecto de comprobante (no es un documento real). */
async function syntheticImage(n: number, s: Sample): Promise<Buffer> {
  const lines = [
    'COMPROBANTE DE EJEMPLO',
    s.docType.replace(/_/g, ' '),
    `${s.serie ?? ''} ${s.numero ?? ''}`.trim() || `Nº ${n}`,
    s.cliente ?? '',
    s.total ? `Total $ ${s.total}` : '',
    s.sello ? `Sello: ${s.sello}` : '',
    s.conformidad === 'completa' || s.conformidad === 'firma_sola' ? '~ firma ~' : '',
  ].filter(Boolean);
  const text = lines
    .map(
      (l, i) =>
        `<text x="60" y="${140 + i * 80}" font-size="40" font-family="sans-serif" fill="#222">${esc(l)}</text>`,
    )
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1400"><rect width="1000" height="1400" fill="#f6f3ea"/><rect x="30" y="30" width="940" height="1340" fill="none" stroke="#999" stroke-width="4"/>${text}</svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

export interface SeedReviewResult {
  userId: string;
  companyId: string;
  scans: number;
}

/**
 * Crea (de forma idempotente) el usuario de revisión, «Empresa Demo» y los escaneos de ejemplo,
 * ya procesados. No llama a la IA. Volver a correrlo no duplica nada.
 */
export async function seedReview(
  db: AnyDb,
  store: ObjectStore,
  opts: { email: string; now?: Date },
): Promise<SeedReviewResult> {
  const email = opts.email.trim().toLowerCase();
  const now = opts.now ?? new Date();

  let [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);
  if (!user) {
    [user] = await db.insert(users).values({ email, nombre: 'Revisor' }).returning();
  }
  if (!user) throw new Error('No se pudo crear el usuario de revisión');
  const userId = user.id;

  const [existing] = await db
    .select({ id: companies.id })
    .from(memberships)
    .innerJoin(companies, eq(companies.id, memberships.companyId))
    .where(and(eq(memberships.userId, userId), eq(companies.nombre, DEMO_COMPANY_NAME)))
    .limit(1);
  let companyId = existing?.id;
  if (!companyId) {
    for (let i = 0; i < 10 && !companyId; i++) {
      const rows = await db
        .insert(companies)
        .values({
          nombre: DEMO_COMPANY_NAME,
          rut: DEMO_COMPANY_RUT,
          inviteCode: generateInviteCode(),
        })
        .onConflictDoNothing()
        .returning({ id: companies.id });
      companyId = rows[0]?.id;
    }
    if (!companyId) throw new Error('No se pudo crear la empresa demo');
  }
  await db.insert(memberships).values({ userId, companyId, role: 'admin' }).onConflictDoNothing();

  let created = 0;
  for (const [i, s] of SAMPLES.entries()) {
    const n = i + 1;
    const clientId = `review-demo-${companyId}-${String(n).padStart(2, '0')}`;
    const [found] = await db
      .select({ id: scans.id })
      .from(scans)
      .where(eq(scans.clientId, clientId));
    if (found) continue;

    const capturedAt = new Date(now.getTime() - (n * 7 + 2) * 3_600_000);
    const id = randomUUID();
    const image = await syntheticImage(n, s);
    const imgKey = imageKey(companyId, capturedAt, id);
    const thbKey = thumbKey(companyId, capturedAt, id);
    await store.put(imgKey, image, 'image/jpeg');
    await store.put(thbKey, await makeThumb(image), 'image/jpeg');

    const fecha = capturedAt.toISOString().slice(0, 10);
    const extracted: Record<string, unknown> = {
      tipo_documento: s.docType,
      ...(s.tipoCfe && { tipo_cfe: s.tipoCfe, rut_emisor: '219999990016' }),
      ...(s.serie && { serie: s.serie }),
      ...(s.numero && { numero: s.numero }),
      ...(s.status !== 'error' && s.docType !== 'no_reconocido' && { fecha_documento: fecha }),
      ...(s.total && { total: Number(s.total) }),
      ...(s.clienteRut && { cliente_rut: s.clienteRut }),
      ...(s.cliente && { cliente_nombre: s.cliente }),
      ...(s.local && { local: s.local }),
      ...(s.conformidad && { conformidad_nivel: s.conformidad }),
      ...(s.sello && { sello_texto: s.sello }),
      revisar: s.revisar ?? [],
    };
    const inserted = await db
      .insert(scans)
      .values({
        id,
        clientId,
        companyId,
        userId,
        capturedAt,
        uploadedAt: capturedAt,
        imageKey: imgKey,
        thumbKey: thbKey,
        status: s.status,
        errorMessage: s.error ?? null,
        docType: s.status === 'error' ? null : s.docType,
        extracted: s.status === 'error' ? null : extracted,
        fieldsRequested: BASE_KEYS,
        clienteRut: s.clienteRut ?? null,
        clienteNombre: s.cliente ?? null,
        local: s.local ?? null,
        numero: s.numero ?? null,
        serie: s.serie ?? null,
        fechaDocumento:
          s.status === 'error' ? null : ((extracted.fecha_documento as string | undefined) ?? null),
        total: s.total ?? null,
        conformidadNivel: s.conformidad,
        selloTexto: s.sello ?? null,
        modelUsed: null,
        escalated: false,
        pricePer1000Snapshot: '40',
      })
      .onConflictDoNothing({ target: scans.clientId })
      .returning({ id: scans.id });
    if (inserted.length > 0) created++;
  }

  const total = (
    await db.select({ id: scans.id }).from(scans).where(eq(scans.companyId, companyId))
  ).length;
  void created;
  return { userId, companyId, scans: total };
}
