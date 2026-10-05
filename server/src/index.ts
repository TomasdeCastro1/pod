import { APP_NAME } from '@app/shared';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { logger } from './logger.js';
import { startPeriodicRecovery, startScanPipeline } from './scans/index.js';
import { getStore } from './storage/index.js';

export const SERVICE_NAME = `${APP_NAME}-server`;

export function start(): void {
  const config = loadConfig();
  const { db } = createDb(config.DATABASE_URL);
  const store = getStore(config);
  // The queue is created here (and hanging scans recovered, plan decision 2) before serving.
  void startScanPipeline({ db, store, config })
    .then(({ queue, recovered }) => {
      if (recovered > 0) logger.info({ event: 'scans.recovered', count: recovered });
      startPeriodicRecovery(db, queue, {
        onRecovered: (count) => logger.info({ event: 'scans.recovered', count }),
        onError: (err) =>
          logger.error({
            event: 'scans.recovery_failed',
            error: err instanceof Error ? err.name : 'unknown',
          }),
      });
      const app = createApp({ db, store, config, scanQueue: queue });
      app.listen(config.PORT, () => {
        logger.info({ event: 'server.listening', service: SERVICE_NAME, port: config.PORT });
      });
    })
    .catch((err: unknown) => {
      logger.fatal({
        event: 'server.start_failed',
        error: err instanceof Error ? err.name : 'unknown',
      });
      process.exitCode = 1;
    });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  start();
}
