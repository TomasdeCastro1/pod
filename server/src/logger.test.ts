import { describe, expect, it } from 'vitest';
import { createLogger } from './logger.js';

function capture() {
  const lines: string[] = [];
  const log = createLogger({ write: (s: string) => void lines.push(s) }, 'debug');
  return { log, out: () => lines.join('') };
}

describe('logger', () => {
  it('no imprime códigos de login ni emails, a ninguna profundidad habitual', () => {
    const { log, out } = capture();
    log.info({ code: '123456', email: 'ana@example.com' }, 'login');
    log.info({ body: { code: '654321', email: 'beto@example.com' } });
    log.info({ req: { headers: { authorization: 'Bearer abc.def' } }, user: { email: 'x@y.uy' } });
    log.info({ a: { b: { token: 'tok-secreto' } } });
    const text = out();
    for (const secret of ['123456', '654321', 'ana@example.com', 'beto@example.com', 'x@y.uy']) {
      expect(text).not.toContain(secret);
    }
    expect(text).not.toContain('abc.def');
    expect(text).not.toContain('tok-secreto');
    expect(text).toContain('[redacted]');
  });

  it('redacta extracted, corrections e imágenes', () => {
    const { log, out } = capture();
    log.info({ extracted: { cliente_nombre: 'Punto Sano' }, corrections: { total: 5 } });
    log.info({ image: 'AAAA-base64', scan: { extracted: { total: 99 } } });
    const text = out();
    expect(text).not.toContain('Punto Sano');
    expect(text).not.toContain('AAAA-base64');
    expect(text).not.toContain('99');
  });

  it('conserva los campos no sensibles', () => {
    const { log, out } = capture();
    log.info({ event: 'scan.done', scanId: 'abc' });
    expect(out()).toContain('"scanId":"abc"');
  });
});
