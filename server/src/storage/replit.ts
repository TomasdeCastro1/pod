import { Client } from '@replit/object-storage';
import type { ObjectStore } from './index.js';

/** Replit Object Storage. Mínimo a propósito: no se puede probar fuera de Replit. */
export class ReplitStore implements ObjectStore {
  private readonly client = new Client();

  async put(key: string, buffer: Buffer): Promise<void> {
    const res = await this.client.uploadFromBytes(key, buffer);
    if (!res.ok) throw new Error(`No se pudo guardar el objeto: ${res.error.message}`);
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.downloadAsBytes(key);
    if (!res.ok) throw new Error(`No se pudo leer el objeto: ${res.error.message}`);
    return res.value[0];
  }

  async delete(key: string): Promise<void> {
    const res = await this.client.delete(key);
    if (!res.ok) throw new Error(`No se pudo borrar el objeto: ${res.error.message}`);
  }

  async exists(key: string): Promise<boolean> {
    const res = await this.client.exists(key);
    if (!res.ok) throw new Error(`No se pudo consultar el objeto: ${res.error.message}`);
    return res.value;
  }
}
