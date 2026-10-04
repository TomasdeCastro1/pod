import express, { type ErrorRequestHandler, type Express } from 'express';
import type { AuthLimits } from './auth/routes.js';
import type { Config } from './config.js';
import type { EmailSender } from './email/index.js';
import type { Db } from './db/client.js';
import type { ObjectStore } from './storage/index.js';
import { authRouter, meRouter } from './auth/routes.js';
import { filesRouter } from './storage/signedUrl.js';

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface AppDeps {
  db: Db;
  store: ObjectStore;
  config: Config;
  /** Opcionales, para tests: email falso y límites de /auth/*. */
  email?: EmailSender;
  authLimits?: Partial<AuthLimits>;
}

/** Sin `deps` solo monta las rutas que no necesitan base ni almacenamiento (tests). */
export function createApp(deps?: AppDeps): Express {
  const app = express();
  // Replit (and most hosts) sit behind one reverse proxy; needed for per-IP rate limits.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  if (deps) {
    app.use(filesRouter(deps));
    app.use('/auth', authRouter(deps));
    app.use('/me', meRouter(deps));
  }

  app.use((_req, _res, next) => {
    next(new HttpError(404, 'not_found', 'Ruta no encontrada'));
  });

  const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
    void next;
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { code: err.code, message: err.message } });
      return;
    }
    const status = (err as { status?: number }).status;
    if (status === 400 || status === 413) {
      res.status(status).json({ error: { code: 'bad_request', message: 'Solicitud inválida' } });
      return;
    }
    // No se loguea el cuerpo del request (puede tener datos personales).
    console.error('Unhandled error:', err instanceof Error ? err.message : 'unknown');
    res.status(500).json({ error: { code: 'internal_error', message: 'Error interno' } });
  };
  app.use(errorHandler);

  return app;
}
