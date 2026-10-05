import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { createTestApp } from './test/helpers.js';

describe('app', () => {
  it('GET /health devuelve 200', async () => {
    const res = await request(createApp()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('ruta inexistente devuelve el formato de error central', async () => {
    const res = await request(createApp()).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'not_found', message: 'Ruta no encontrada' } });
  });

  it('JSON inválido devuelve 400 con formato de error', async () => {
    const res = await request(createApp())
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('bad_request');
  });

  it('envía encabezados de seguridad y no habilita CORS', async () => {
    const res = await request(createApp())
      .get('/health')
      .set('Origin', 'https://otro-sitio.example');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('GET /health con base responde ok', async () => {
    const ctx = await createTestApp();
    const res = await request(ctx.app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    await ctx.close();
  });

  it('GET /health falla con 503 si la base no responde, sin detalles', async () => {
    const ctx = await createTestApp();
    await ctx.close();
    const res = await request(ctx.app).get('/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'unavailable' });
  });
});
