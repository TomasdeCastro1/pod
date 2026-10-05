import { Router } from 'express';
import { PRIVACY_HTML, TERMS_HTML } from './pages.js';

/** Páginas públicas (sin autenticación) que enlazan la app y las tiendas. */
export function legalRouter(): Router {
  const router = Router();
  const serve = (html: string) => (_req: unknown, res: import('express').Response) => {
    res.type('html').set('Cache-Control', 'public, max-age=300').send(html);
  };
  router.get('/privacidad', serve(PRIVACY_HTML));
  router.get('/terminos', serve(TERMS_HTML));
  return router;
}
