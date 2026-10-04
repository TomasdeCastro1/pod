import { APP_NAME } from '@app/shared';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createDb } from './db/client.js';
import { getStore } from './storage/index.js';

export const SERVICE_NAME = `${APP_NAME}-server`;

export function start(): void {
  const config = loadConfig();
  const { db } = createDb(config.DATABASE_URL);
  const app = createApp({ db, store: getStore(config), config });
  app.listen(config.PORT, () => {
    console.log(`${SERVICE_NAME} escuchando en el puerto ${config.PORT}`);
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  start();
}
