import type { Config } from '../config.js';
import { LocalStore } from './local.js';
import { ReplitStore } from './replit.js';

export interface ObjectStore {
  put(key: string, buffer: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export function getStore(
  config: Pick<Config, 'STORAGE_DRIVER' | 'LOCAL_STORAGE_DIR'>,
): ObjectStore {
  if (config.STORAGE_DRIVER === 'replit') return new ReplitStore();
  return new LocalStore(config.LOCAL_STORAGE_DIR ?? '.storage');
}

export { LocalStore } from './local.js';
export { imageKey, thumbKey } from './keys.js';
