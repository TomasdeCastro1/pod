import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../app.js';

describe('páginas legales', () => {
  it.each(['/legal/privacidad', '/legal/terminos'])(
    '%s responde 200 con HTML y borrador',
    async (p) => {
      const res = await request(createApp()).get(p);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
      expect(res.text).toContain('BORRADOR: revisar antes de publicar');
      expect(res.text).toContain('[EMAIL DE CONTACTO]');
    },
  );

  it('la política menciona la Ley 18.331 y a los proveedores', async () => {
    const res = await request(createApp()).get('/legal/privacidad');
    for (const t of ['18.331', 'Anthropic', 'Resend', 'Eliminar cuenta'])
      expect(res.text).toContain(t);
  });
});
