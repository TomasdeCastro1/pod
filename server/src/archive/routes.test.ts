import request from 'supertest';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auditLog, scans } from '../db/schema.js';
import { seed, type AnyDb } from '../db/seed/index.js';
import { createTestApp, type TestCtx } from '../test/helpers.js';

let ctx: TestCtx;
let ana: { id: string; auth: string };
let beto: { id: string; auth: string };
let companyId: string;

beforeEach(async () => {
  ctx = await createTestApp();
  await seed(ctx.db as unknown as AnyDb);
  ana = await ctx.createUser('ana@example.com', 'Ana');
  beto = await ctx.createUser('beto@example.com', 'Beto');
  const r = await request(ctx.app)
    .post('/companies')
    .set('Authorization', ana.auth)
    .send({ nombre: 'ACME', rut: '219419590017' });
  companyId = r.body.company.id;
  const code = r.body.company.invite_code ?? (r.body.company.inviteCode as string);
  await request(ctx.app).post('/companies/join').set('Authorization', beto.auth).send({ code });
});
afterEach(async () => {
  await ctx.close();
});

const BASE = Date.parse('2026-09-01T15:00:00Z');

async function insert(i: number, over: Partial<typeof scans.$inferInsert> = {}) {
  const [row] = await ctx.db
    .insert(scans)
    .values({
      clientId: `c-${i}-${Math.random()}`,
      companyId,
      userId: ana.id,
      // Pares con el mismo captured_at para probar el desempate por id.
      capturedAt: new Date(BASE + Math.floor(i / 2) * 3_600_000),
      status: 'listo',
      docType: 'factura_emitida',
      fieldsRequested: ['cliente_nombre', 'forma_pago', 'total'],
      extracted: { cliente_nombre: `Cliente ${i}`, forma_pago: 'contado' },
      clienteNombre: `Cliente ${i}`,
      conformidadNivel: 'completa',
      ...over,
    })
    .returning();
  return row!;
}

const list = (qs = '', auth = ana.auth) =>
  request(ctx.app).get(`/companies/${companyId}/scans${qs}`).set('Authorization', auth);

describe('listado', () => {
  it('pagina 75 escaneos sin duplicados ni saltos', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 75; i++) ids.push((await insert(i)).id);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const qs: string = cursor ? `?limit=20&cursor=${cursor}` : '?limit=20';
      const r = await list(qs);
      expect(r.status).toBe(200);
      seen.push(...r.body.items.map((x: { id: string }) => x.id));
      cursor = r.body.next_cursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(4);
    expect(seen).toHaveLength(75);
    expect(new Set(seen).size).toBe(75);
    expect(new Set(seen)).toEqual(new Set(ids));
    const def = await list();
    expect(def.body.items).toHaveLength(30);
  });

  it('filtra por tipo, conformidad, revisar, fechas y texto; excluye borrados', async () => {
    await insert(0, { clienteNombre: 'Kinko SA', local: 'Portones' });
    await insert(1, { docType: 'devolucion_cliente', conformidadNivel: 'sin_firma' });
    await insert(2, { docType: 'nota_credito_emitida', status: 'revisar' });
    await insert(3, { docType: 'no_reconocido', conformidadNivel: 'dudosa' });
    await insert(4, { selloTexto: 'Recibido conforme', clienteRut: '216981070018' });
    await insert(5, { deletedAt: new Date() });
    const count = async (qs: string) => (await list(qs)).body.items.length;
    expect(await count('')).toBe(5);
    expect(await count('?type=factura')).toBe(3);
    expect(await count('?type=devolucion')).toBe(1);
    expect(await count('?type=otro')).toBe(1);
    expect(await count('?conformidad=sin_firma,dudosa')).toBe(2);
    expect(await count('?conformidad=sin_firma&conformidad=completa')).toBe(4);
    expect(await count('?revisar=true')).toBe(1);
    expect(await count('?q=kinko')).toBe(1);
    expect(await count('?q=portones')).toBe(1);
    expect(await count('?q=conforme')).toBe(1);
    expect(await count('?q=216981')).toBe(1);
    expect(await count('?q=100%25')).toBe(0);
    expect(await count('?type=factura&conformidad=completa&q=kinko')).toBe(1);
    // 15:00Z = 12:00 en Montevideo (UTC-3); i/2 suma horas.
    expect(await count('?from=2026-09-01&to=2026-09-01')).toBe(5);
    expect(await count('?from=2026-09-02')).toBe(0);
    expect(await count('?to=2026-08-31')).toBe(0);
    expect((await list('?limit=0')).status).toBe(400);
    expect((await list('?conformidad=foo')).status).toBe(400);
    expect((await list('?cursor=zzz')).status).toBe(400);
  });

  it('las fechas usan la hora de Uruguay', async () => {
    // 02:00Z del 2 = 23:00 del 1 en Montevideo.
    await insert(0, { capturedAt: new Date('2026-09-02T02:00:00Z') });
    expect((await list('?from=2026-09-01&to=2026-09-01')).body.items).toHaveLength(1);
    expect((await list('?from=2026-09-02')).body.items).toHaveLength(0);
  });

  it('exige ser miembro de la empresa', async () => {
    const out = await ctx.createUser('otro@example.com');
    expect((await list('', out.auth)).status).toBe(404);
  });
});

describe('PATCH /scans/:id', () => {
  it('la corrección cambia la búsqueda y deja extracted intacto', async () => {
    const s = await insert(1);
    const r = await request(ctx.app)
      .patch(`/scans/${s.id}`)
      .set('Authorization', beto.auth)
      .send({ corrections: { cliente_nombre: 'Panadería Lucía', total: '1234,50' } });
    expect(r.status).toBe(200);
    expect(r.body.cliente_nombre).toBe('Panadería Lucía');
    expect(r.body.fields.cliente_nombre).toEqual({ value: 'Panadería Lucía', corrected: true });
    expect((await list('?q=lucía')).body.items).toHaveLength(1);
    expect((await list('?q=Cliente 1')).body.items).toHaveLength(0);
    const [row] = await ctx.db.select().from(scans).where(eq(scans.id, s.id));
    expect(row!.extracted).toEqual(s.extracted);
    expect(row!.total).toBe('1234.50');

    // null borra la corrección y vuelve al valor leído.
    const back = await request(ctx.app)
      .patch(`/scans/${s.id}`)
      .set('Authorization', ana.auth)
      .send({ corrections: { cliente_nombre: null } });
    expect(back.body.cliente_nombre).toBe('Cliente 1');
    expect((await list('?q=Cliente 1')).body.items).toHaveLength(1);

    const logs = await ctx.db.select().from(auditLog).where(eq(auditLog.action, 'scan.correct'));
    expect(logs).toHaveLength(2);
    expect(logs[0]!.detail).toMatchObject({
      changes: { cliente_nombre: { before: 'Cliente 1', after: 'Panadería Lucía' } },
    });
  });

  it('valida claves y valores', async () => {
    const s = await insert(1);
    const patch = (body: unknown) =>
      request(ctx.app)
        .patch(`/scans/${s.id}`)
        .set('Authorization', ana.auth)
        .send(body as object);
    expect((await patch({ corrections: { campo_inexistente: 'x' } })).status).toBe(400);
    expect((await patch({ corrections: { conformidad_nivel: 'x' } })).status).toBe(400);
    expect((await patch({ corrections: { total: 'abc' } })).status).toBe(400);
    expect((await patch({})).status).toBe(400);
    expect((await patch({ corrections: { numero: '55' } })).status).toBe(200);
  });

  it('marca y desmarca revisado', async () => {
    const s = await insert(1);
    const patch = (reviewed: boolean) =>
      request(ctx.app).patch(`/scans/${s.id}`).set('Authorization', beto.auth).send({ reviewed });
    expect((await patch(true)).status).toBe(200);
    let [row] = await ctx.db.select().from(scans).where(eq(scans.id, s.id));
    expect(row!.reviewedBy).toBe(beto.id);
    expect(row!.reviewedAt).not.toBeNull();
    await patch(false);
    [row] = await ctx.db.select().from(scans).where(eq(scans.id, s.id));
    expect(row!.reviewedBy).toBeNull();
    expect(row!.reviewedAt).toBeNull();
  });
});

describe('DELETE /scans/:id', () => {
  it('un miembro recibe 403; un admin borra y desaparece del listado', async () => {
    const s = await insert(1);
    const del = (auth: string) =>
      request(ctx.app).delete(`/scans/${s.id}`).set('Authorization', auth);
    expect((await del(beto.auth)).status).toBe(403);
    expect((await list()).body.items).toHaveLength(1);
    expect((await del(ana.auth)).status).toBe(204);
    expect((await list()).body.items).toHaveLength(0);
    expect((await del(ana.auth)).status).toBe(404);
    const [row] = await ctx.db.select().from(scans).where(eq(scans.id, s.id));
    expect(row!.deletedAt).not.toBeNull();
    const logs = await ctx.db.select().from(auditLog).where(eq(auditLog.action, 'scan.delete'));
    expect(logs).toHaveLength(1);
    const patch = await request(ctx.app)
      .patch(`/scans/${s.id}`)
      .set('Authorization', ana.auth)
      .send({ reviewed: true });
    expect(patch.status).toBe(404);
  });
});

describe('GET /companies/:id/scans.csv', () => {
  const csv = (qs = '') =>
    request(ctx.app)
      .get(`/companies/${companyId}/scans.csv${qs}`)
      .set('Authorization', ana.auth)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

  it('UTF-8 con BOM, separador ; y decimales con coma, respetando filtros', async () => {
    await insert(1, {
      clienteNombre: 'Panadería "La Ñ"',
      extracted: { cliente_nombre: 'Panadería "La Ñ"', forma_pago: 'credito' },
      total: '1727.91',
      numero: '6129',
      serie: 'A',
      status: 'revisar',
    });
    await insert(2, { docType: 'devolucion_cliente', clienteNombre: 'Otro' });
    const r = await csv('?type=factura');
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/text\/csv; charset=utf-8/);
    expect(r.headers['content-disposition']).toMatch(
      /attachment; filename="comprobantes-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    const buf = r.body as Buffer;
    expect([...buf.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = buf.toString('utf8').slice(1);
    const lines = text.trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Fecha de captura;Tipo;Serie;Número');
    expect(lines[0]!.endsWith(';Forma de pago')).toBe(true);
    expect(lines[1]).toContain('A;6129;');
    expect(lines[1]).toContain('"Panadería ""La Ñ"""');
    expect(lines[1]).toContain(';1727,91;completa;sí;no;Ana;credito');
    expect(text).not.toContain('Otro');
  });
});
