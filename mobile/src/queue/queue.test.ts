import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScanDto } from '@app/shared';
import { backoffMs, createCaptureQueue, offlineNotice, type QueueDeps } from './queue';
import { sqliteStore, type SqlDb } from './sqliteStore';
import type { CaptureRow, CaptureStore } from './types';

function dto(p: Partial<ScanDto> = {}): ScanDto {
  return {
    id: 'scan-1',
    status: 'listo',
    doc_type: 'factura_emitida',
    conformidad_nivel: 'completa',
    cliente_nombre: null,
    local: null,
    serie: null,
    numero: null,
    fecha_documento: null,
    total: null,
    revisar: [],
    fields: {},
    captured_at: '2026-01-01T00:00:00.000Z',
    thumb_url: null,
    alert: null,
    reviewed: false,
    reviewed_at: null,
    ...p,
  };
}

/** SQLite falso: guarda las filas en memoria (sobrevive a "reiniciar la app" si se reutiliza). */
function memStore(initial: CaptureRow[] = []): CaptureStore & { rows: CaptureRow[] } {
  const rows = [...initial];
  return {
    rows,
    async init() {},
    async insert(r) {
      if (!rows.some((x) => x.client_id === r.client_id)) rows.unshift(r);
    },
    async update(id, p) {
      const i = rows.findIndex((x) => x.client_id === id);
      if (i >= 0) rows[i] = { ...rows[i]!, ...p };
    },
    async list() {
      return rows.map((r) => ({ ...r }));
    },
    async remove(ids) {
      for (const id of ids) {
        const i = rows.findIndex((x) => x.client_id === id);
        if (i >= 0) rows.splice(i, 1);
      }
    },
  };
}

function row(p: Partial<CaptureRow> = {}): CaptureRow {
  return {
    client_id: 'old-1',
    company_id: 'c1',
    file_uri: 'file:///captures/old-1.jpg',
    captured_at: '2026-01-01T00:00:00.000Z',
    lat: null,
    lng: null,
    replaces_scan_id: null,
    state: 'pendiente',
    scan_id: null,
    attempts: 0,
    last_error: null,
    created_at: new Date().toISOString(),
    ...p,
  };
}

function setup(over: Partial<QueueDeps> = {}, store = memStore()) {
  let n = 0;
  const deps: QueueDeps = {
    store,
    prepareImage: vi.fn(async (u: string) => `${u}.small`),
    persistFile: vi.fn(async (_u: string, id: string) => `file:///captures/${id}.jpg`),
    deleteFile: vi.fn(async () => {}),
    newId: () => `id-${++n}`,
    getLocation: vi.fn(async () => ({ lat: -34.9, lng: -56.1 })),
    upload: vi.fn(async () => ({ scan_id: 'scan-1', status: 'procesando' as const })),
    getScan: vi.fn(async () => dto()),
    ...over,
  };
  return { deps, store, queue: createCaptureQueue(deps) };
}

const errStatus = (status: number) => Object.assign(new Error(`http ${status}`), { status });

describe('cola de capturas', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('mueve el archivo, inserta la fila antes de subir y termina en done borrando el archivo', async () => {
    const order: string[] = [];
    const store = memStore();
    const insert = store.insert.bind(store);
    store.insert = async (r) => {
      order.push('insert');
      return insert(r);
    };
    const { deps, queue } = setup(
      {
        upload: vi.fn(async () => {
          order.push('upload');
          return { scan_id: 'scan-1', status: 'procesando' as const };
        }),
      },
      store,
    );
    const it = queue.enqueueCapture({ companyId: 'c1', imageUri: 'file://a.jpg' });
    expect(queue.getCaptures()[0]?.status).toBe('preparing');
    await vi.advanceTimersByTimeAsync(0);
    expect(order).toEqual(['insert', 'upload']);
    expect(deps.persistFile).toHaveBeenCalledWith('file://a.jpg.small', it.clientId);
    expect(deps.upload).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({
        imageUri: `file:///captures/${it.clientId}.jpg`,
        clientId: it.clientId,
        lat: -34.9,
      }),
    );
    expect(queue.getCaptures()[0]).toMatchObject({ status: 'done', scanId: 'scan-1' });
    expect(deps.deleteFile).toHaveBeenCalledWith(`file:///captures/${it.clientId}.jpg`);
    expect(store.rows[0]).toMatchObject({ state: 'subido', scan_id: 'scan-1', file_uri: '' });
  });

  it('no espera más de 2 s por la ubicación', async () => {
    const { deps, queue } = setup({ getLocation: () => new Promise(() => {}) });
    queue.enqueueCapture({ companyId: 'c1', imageUri: 'x' });
    await vi.advanceTimersByTimeAsync(1999);
    expect(deps.upload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(deps.upload).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ lat: undefined, lng: undefined }),
    );
  });

  it('backoff exponencial 2 s, 4 s, 8 s ante red o 5xx; la fila sigue pendiente', async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new Error('sin red'))
      .mockRejectedValueOnce(errStatus(503))
      .mockRejectedValueOnce(errStatus(500))
      .mockResolvedValue({ scan_id: 'scan-1', status: 'procesando' });
    const { store, queue } = setup({ upload });
    queue.enqueueCapture({ companyId: 'c1', imageUri: 'x' });
    await vi.advanceTimersByTimeAsync(0);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(queue.getCaptures()[0]?.status).toBe('pending');
    expect(store.rows[0]).toMatchObject({ state: 'pendiente', attempts: 1, last_error: 'sin red' });
    await vi.advanceTimersByTimeAsync(1999);
    expect(upload).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(upload).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(3999);
    expect(upload).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(upload).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(7999);
    expect(upload).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(upload).toHaveBeenCalledTimes(4);
    expect(queue.getCaptures()[0]?.status).toBe('done');
    expect(store.rows[0]?.attempts).toBe(4);
  });

  it('el backoff tiene tope de 5 min', () => {
    expect(backoffMs(1)).toBe(2000);
    expect(backoffMs(4)).toBe(16_000);
    expect(backoffMs(9)).toBe(300_000);
    expect(backoffMs(30)).toBe(300_000);
  });

  it('kick(true) (vuelve la conexión) reintenta sin esperar el backoff', async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new Error('sin red'))
      .mockResolvedValue({ scan_id: 'scan-1', status: 'procesando' });
    const { queue } = setup({ upload });
    queue.enqueueCapture({ companyId: 'c1', imageUri: 'x' });
    await vi.advanceTimersByTimeAsync(0);
    expect(upload).toHaveBeenCalledTimes(1);
    queue.kick(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(queue.getCaptures()[0]?.status).toBe('done');
  });

  it('4xx no reintentable: fallido con mensaje y no reintenta', async () => {
    const { store, deps, queue } = setup({ upload: vi.fn().mockRejectedValue(errStatus(422)) });
    queue.enqueueCapture({ companyId: 'c1', imageUri: 'x' });
    await vi.advanceTimersByTimeAsync(600_000);
    expect(deps.upload).toHaveBeenCalledTimes(1);
    expect(queue.getCaptures()[0]).toMatchObject({ status: 'failed', error: 'http 422' });
    expect(store.rows[0]).toMatchObject({ state: 'fallido', last_error: 'http 422' });
  });

  it('3 capturas sin conexión se guardan, y al volver la señal se suben solas sin duplicados', async () => {
    let online = false;
    const sent: string[] = [];
    const upload = vi.fn(async (_c: string, p: { clientId: string }) => {
      if (!online) throw new TypeError('Network request failed');
      if (!sent.includes(p.clientId)) sent.push(p.clientId);
      return { scan_id: `scan-${p.clientId}`, status: 'procesando' as const };
    });
    const { store, queue } = setup({ upload });
    for (let i = 0; i < 3; i++) queue.enqueueCapture({ companyId: 'c1', imageUri: `f${i}` });
    await vi.advanceTimersByTimeAsync(5000);
    expect(store.rows).toHaveLength(3);
    expect(store.rows.every((r) => r.state === 'pendiente')).toBe(true);
    expect(queue.pendingCount()).toBe(3);
    online = true;
    queue.kick(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual(['id-1', 'id-2', 'id-3']);
    expect(queue.getCaptures().every((c) => c.status === 'done')).toBe(true);
    expect(store.rows.every((r) => r.state === 'subido')).toBe(true);
  });

  it('al arrancar: una fila «subiendo» vuelve a pendiente y se reenvía con el mismo client_id', async () => {
    const store = memStore([
      row({ client_id: 'viejo', state: 'subiendo', attempts: 1 }),
      row({ client_id: 'cola', state: 'pendiente', created_at: '2026-02-01T00:00:00.000Z' }),
    ]);
    const { deps, queue } = setup({}, store);
    await queue.start();
    await vi.advanceTimersByTimeAsync(0);
    const ids = (deps.upload as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => (c[1] as { clientId: string }).clientId,
    );
    expect(ids.sort()).toEqual(['cola', 'viejo']);
    expect(store.rows.every((r) => r.state === 'subido')).toBe(true);
  });

  it('al arrancar retoma el polling de lo subido y descarta lo ya terminado', async () => {
    const store = memStore([
      row({ client_id: 'a', state: 'subido', scan_id: 'sa' }),
      row({ client_id: 'b', state: 'subido', scan_id: 'sb', file_uri: '' }),
    ]);
    const { deps, queue } = setup({ getScan: vi.fn(async () => dto({ id: 'sa' })) }, store);
    await queue.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.getCaptures().map((c) => c.clientId)).toEqual(['a']);
    expect(queue.getCaptures()[0]?.status).toBe('done');
    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.deleteFile).toHaveBeenCalledWith('file:///captures/old-1.jpg');
  });

  it('si la subida falla a mitad no se pierde nada: la fila y el archivo quedan', async () => {
    const { store, deps, queue } = setup({ upload: vi.fn().mockRejectedValue(new Error('corte')) });
    queue.enqueueCapture({ companyId: 'c1', imageUri: 'x' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({
      state: 'pendiente',
      file_uri: 'file:///captures/id-1.jpg',
    });
    expect(deps.deleteFile).not.toHaveBeenCalled();
    // "Se cierra la app": una cola nueva sobre el mismo almacenamiento retoma la captura.
    const second = setup({}, store);
    await second.queue.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(second.deps.upload).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ clientId: 'id-1' }),
    );
    expect(store.rows[0]?.state).toBe('subido');
  });

  it('la captura queda asociada a la empresa activa al capturar', async () => {
    const { deps, queue } = setup({
      upload: vi
        .fn()
        .mockRejectedValueOnce(new Error('x'))
        .mockResolvedValue({ scan_id: 's', status: 'procesando' }),
    });
    queue.enqueueCapture({ companyId: 'empresa-A', imageUri: 'x' });
    await vi.advanceTimersByTimeAsync(0);
    queue.kick(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.upload).toHaveBeenLastCalledWith('empresa-A', expect.anything());
  });

  it('si no se puede mover el archivo ni redimensionar, sube igual desde donde está', async () => {
    const { deps, queue } = setup({
      prepareImage: vi.fn().mockRejectedValue(new Error('x')),
      persistFile: vi.fn().mockRejectedValue(new Error('x')),
    });
    queue.enqueueCapture({ companyId: 'c1', imageUri: 'file://a.jpg' });
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.upload).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ imageUri: 'file://a.jpg' }),
    );
  });

  it('pasa a timeout si el servidor sigue procesando 30 s', async () => {
    const { queue } = setup({ getScan: async () => dto({ status: 'procesando' }) });
    queue.enqueueCapture({ companyId: 'c1', imageUri: 'x' });
    await vi.advanceTimersByTimeAsync(31_000);
    expect(queue.getCaptures()[0]?.status).toBe('timeout');
  });

  it('clearAll borra filas y archivos', async () => {
    const { store, deps, queue } = setup({ upload: vi.fn().mockRejectedValue(new Error('x')) });
    queue.enqueueCapture({ companyId: 'c1', imageUri: 'x' });
    await vi.advanceTimersByTimeAsync(0);
    await queue.clearAll();
    expect(store.rows).toHaveLength(0);
    expect(queue.getCaptures()).toHaveLength(0);
    expect(deps.deleteFile).toHaveBeenCalledWith('file:///captures/id-1.jpg');
  });

  it('notifica a los suscriptores y permite descartar la alerta', async () => {
    const { queue } = setup();
    const l = vi.fn();
    queue.subscribe(l);
    const it = queue.enqueueCapture({ companyId: 'c1', imageUri: 'x' });
    expect(l).toHaveBeenCalled();
    queue.dismissAlert(it.clientId);
    expect(queue.getCaptures()[0]?.alertDismissed).toBe(true);
  });
});

describe('offlineNotice', () => {
  it('avisa solo sin conexión y con pendientes', () => {
    expect(offlineNotice(true, 0)).toBeNull();
    expect(offlineNotice(false, 3)).toBeNull();
    expect(offlineNotice(true, 1)).toBe('Sin conexión: 1 comprobante se enviará solo');
    expect(offlineNotice(true, 3)).toBe('Sin conexión: 3 comprobantes se enviarán solos');
  });
});

describe('sqliteStore', () => {
  it('crea la tabla y arma el SQL con parámetros', async () => {
    const calls: { sql: string; params?: unknown[] }[] = [];
    const db: SqlDb = {
      execAsync: async (sql) => void calls.push({ sql }),
      runAsync: async (sql, params) => void calls.push({ sql, params }),
      getAllAsync: async <T>() => [] as T[],
    };
    const s = sqliteStore(async () => db);
    await s.init();
    expect(calls[0]?.sql).toContain('CREATE TABLE IF NOT EXISTS captures');
    await s.insert(row());
    expect(calls[1]?.sql).toMatch(/^INSERT OR IGNORE INTO captures/);
    expect(calls[1]?.params).toHaveLength(12);
    await s.update('x', { state: 'subido', scan_id: 's' });
    expect(calls[2]).toEqual({
      sql: 'UPDATE captures SET state = ?, scan_id = ? WHERE client_id = ?',
      params: ['subido', 's', 'x'],
    });
  });
});
