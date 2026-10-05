import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { Db } from '../db/client.js';
import { loadConfig } from '../config.js';
import { companies, scans, users } from '../db/schema.js';
import { createTestDb } from '../db/test-db.js';
import { getStore, LocalStore, type ObjectStore } from './index.js';
import { imageKey, thumbKey } from './keys.js';
import { signImageUrl } from './signedUrl.js';

describe('keys', () => {
  it('formato exacto', () => {
    const d = new Date('2026-03-05T12:00:00Z');
    expect(imageKey('c1', d, 's1')).toBe('c1/2026/03/s1.jpg');
    expect(thumbKey('c1', d, 's1')).toBe('c1/2026/03/s1_thumb.jpg');
  });
});

describe('LocalStore', () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'store-'));
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('put/get/exists/delete', async () => {
    const store: ObjectStore = new LocalStore(dir);
    expect(await store.exists('a/b.jpg')).toBe(false);
    await store.put('a/b.jpg', Buffer.from('hola'), 'image/jpeg');
    expect(await store.exists('a/b.jpg')).toBe(true);
    expect((await store.get('a/b.jpg')).toString()).toBe('hola');
    await store.delete('a/b.jpg');
    expect(await store.exists('a/b.jpg')).toBe(false);
  });

  it('rechaza claves que salen del directorio', async () => {
    await expect(new LocalStore(dir).get('../x')).rejects.toThrow();
  });

  it('getStore elige LocalStore con driver local', () => {
    expect(getStore({ STORAGE_DRIVER: 'local', LOCAL_STORAGE_DIR: dir })).toBeInstanceOf(
      LocalStore,
    );
  });
});

describe('GET /files/:scanId/:variant', () => {
  let dir: string;
  let app: ReturnType<typeof createApp>;
  let scanId: string;
  const config = loadConfig({
    DATABASE_URL: 'x',
    ANTHROPIC_API_KEY: 'x',
    JWT_SECRET: 'x',
    ADMIN_TOKEN: 'x',
    SIGNED_URL_SECRET: 'secreto',
    PUBLIC_BASE_URL: 'https://app.test',
  });
  const jpeg = () =>
    sharp({ create: { width: 10, height: 10, channels: 3, background: '#f00' } })
      .jpeg()
      .toBuffer();
  const pathOf = (url: string) => url.replace('https://app.test', '');

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'files-'));
    const store: ObjectStore = new LocalStore(dir);
    const { db } = await createTestDb();
    const [company] = await db
      .insert(companies)
      .values({ nombre: 'ACME', rut: '210000000012', inviteCode: 'ABC123' })
      .returning();
    const [user] = await db.insert(users).values({ email: 'a@b.c' }).returning();
    const capturedAt = new Date('2026-03-05T12:00:00Z');
    const [scan] = await db
      .insert(scans)
      .values({ clientId: 'k1', companyId: company!.id, userId: user!.id, capturedAt })
      .returning();
    scanId = scan!.id;
    const key = imageKey(company!.id, capturedAt, scanId);
    await store.put(key, await jpeg(), 'image/jpeg');
    await db
      .update(scans)
      .set({ imageKey: key })
      .where((await import('drizzle-orm')).eq(scans.id, scanId));
    app = createApp({ db: db as unknown as Db, store, config });
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it('firma válida da 200 image/jpeg', async () => {
    const res = await request(app).get(pathOf(signImageUrl(config, scanId, 'image')));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toBe('private, max-age=300');
  });

  it('URL vencida da 403', async () => {
    const url = signImageUrl(config, scanId, 'image', 300, Date.now() - 600_000);
    expect((await request(app).get(pathOf(url))).status).toBe(403);
  });

  it('firma alterada o variante cambiada da 403', async () => {
    const url = pathOf(signImageUrl(config, scanId, 'image'));
    // Cambia el primer carácter de la firma por otro distinto (si ya era '0', reemplazarlo por '0' no la alteraba).
    const tampered = url.replace(/sig=(.)/, (_m, c: string) => `sig=${c === '0' ? '1' : '0'}`);
    expect((await request(app).get(tampered)).status).toBe(403);
    expect((await request(app).get(url.replace('/image', '/thumb'))).status).toBe(403);
    expect((await request(app).get(`/files/${scanId}/image`)).status).toBe(403);
  });

  it('miniatura inexistente da 404', async () => {
    const res = await request(app).get(pathOf(signImageUrl(config, scanId, 'thumb')));
    expect(res.status).toBe(404);
  });
});
