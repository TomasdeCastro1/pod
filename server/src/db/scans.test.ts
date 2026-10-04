import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { effectiveValue } from './scans.js';
import { companies, memberships, scans, users } from './schema.js';
import { createTestDb } from './test-db.js';

describe('effectiveValue', () => {
  it('prefiere corrections sobre extracted', () => {
    const scan = { extracted: { total: 10, local: 'A' }, corrections: { total: 12 } };
    expect(effectiveValue(scan, 'total')).toBe(12);
    expect(effectiveValue(scan, 'local')).toBe('A');
    expect(effectiveValue(scan, 'otro')).toBeUndefined();
  });

  it('respeta una corrección con valor null', () => {
    expect(effectiveValue({ extracted: { a: 1 }, corrections: { a: null } }, 'a')).toBeNull();
  });

  it('tolera JSON ausente', () => {
    expect(effectiveValue({ extracted: null, corrections: null }, 'a')).toBeUndefined();
  });
});

describe('esquema (PGlite)', () => {
  it('inserta empresa, usuario, membresía y escaneo y lo lee de vuelta', async () => {
    const { db, client } = await createTestDb();
    const [company] = await db
      .insert(companies)
      .values({ nombre: 'ACME', rut: '210000000012', inviteCode: 'ABC123' })
      .returning();
    const [user] = await db.insert(users).values({ email: 'a@b.com' }).returning();
    await db
      .insert(memberships)
      .values({ userId: user!.id, companyId: company!.id, role: 'admin' });
    const [inserted] = await db
      .insert(scans)
      .values({
        clientId: 'c-1',
        companyId: company!.id,
        userId: user!.id,
        capturedAt: new Date('2026-01-01T10:00:00Z'),
        total: '123.45',
        extracted: { total: 123.45 },
        fieldsRequested: ['total'],
        conformidadNivel: 'alto',
        clienteNombre: 'Cliente Prueba',
      })
      .returning();
    const [read] = await db.select().from(scans).where(eq(scans.id, inserted!.id));
    expect(read?.status).toBe('procesando');
    expect(read?.total).toBe('123.45');
    expect(read?.extracted).toEqual({ total: 123.45 });
    expect(read?.fieldsRequested).toEqual(['total']);
    expect(read?.replacesScanId).toBeNull();
    await client.close();
  });

  it('la migración crea las 10 tablas y los índices', async () => {
    const { client } = await createTestDb();
    const tables = await client.query<{ tablename: string }>(
      `select tablename from pg_tables where schemaname='public' order by 1`,
    );
    expect(tables.rows.map((r) => r.tablename)).toEqual([
      'audit_log',
      'companies',
      'company_fields',
      'field_catalog',
      'memberships',
      'model_prices',
      'otp_codes',
      'price_settings',
      'scans',
      'users',
    ]);
    const idx = await client.query<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname='public'`,
    );
    const names = idx.rows.map((r) => r.indexname);
    for (const n of [
      'scans_client_id_uq',
      'companies_invite_code_uq',
      'scans_company_captured_idx',
      'scans_cliente_rut_idx',
      'scans_numero_idx',
      'scans_conformidad_idx',
      'scans_search_idx',
    ]) {
      expect(names).toContain(n);
    }
    await client.close();
  });
});
