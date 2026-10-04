import express, { type ErrorRequestHandler, type Express } from 'express';

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

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
