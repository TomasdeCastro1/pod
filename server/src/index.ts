import { APP_NAME } from '@app/shared';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { startScanPipeline } from './scans/index.js';
import { getStore } from './storage/index.js';

export const SERVICE_NAME = `${APP_NAME}-server`;

export function start(): void {
  const config = loadConfig();
  const { db } = createDb(config.DATABASE_URL);
  const store = getStore(config);
  // The queue is created here (and hanging scans recovered, plan decision 2) before serving.
  void startScanPipeline({ db, store, config })
    .then(({ queue, recovered }) => {
      if (recovered > 0) console.log(`${SERVICE_NAME}: ${recovered} escaneos re-encolados`);
      const app = createApp({ db, store, config, scanQueue: queue });
      app.listen(config.PORT, () => {
        console.log(`${SERVICE_NAME} escuchando en el puerto ${config.PORT}`);
      });
    })
    .catch((err: unknown) => {
      console.error(`${SERVICE_NAME}: no se pudo iniciar`, err);
      process.exitCode = 1;
    });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  start();
}
