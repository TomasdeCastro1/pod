import { pino, type DestinationStream, type Logger } from 'pino';

/** Claves que nunca deben llegar a un log, a cualquier profundidad razonable. */
const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'code',
  'email',
  'token',
  'password',
  'image',
  'imageBase64',
  'extracted',
  'corrections',
  'body',
];

export const REDACT_PATHS: string[] = [
  ...SENSITIVE_KEYS,
  ...SENSITIVE_KEYS.map((k) => `*.${k}`),
  ...SENSITIVE_KEYS.map((k) => `*.*.${k}`),
  'req.headers.authorization',
  'req.headers.cookie',
];

/** Logger estructurado (JSON a stdout) con redacción automática de datos personales. */
export function createLogger(dest?: DestinationStream, level?: string): Logger {
  return pino(
    {
      level:
        level ?? process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
      redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    },
    dest,
  );
}

export const logger: Logger = createLogger();
