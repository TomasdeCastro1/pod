import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScanDto } from '@app/shared';
import { ALERT_TEXTS, alertMessage, isBlockingAlert, pickAlert } from './alerts';
import {
  createCaptureManager,
  isRetryableUploadError,
  rescan,
  resizeTarget,
  type CaptureDeps,
} from './manager';
import { pollScan } from './polling';

function dto(p: Partial<ScanDto> = {}): ScanDto {
  return {
    id: 's1',
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
    ...p,
  };
}

describe('pickAlert', () => {
  it('mapea el campo alert del DTO', () => {
    expect(pickAlert(dto({ alert: 'sin_firma' }))).toBe('firma');
    expect(pickAlert(dto({ alert: 'no_reconocido' }))).toBe('no_leido');
    expect(pickAlert(dto({ status: 'error', alert: 'error' }))).toBe('error');
    expect(pickAlert(dto({ status: 'revisar', alert: 'revisar' }))).toBe('revisar');
    expect(pickAlert(dto())).toBeNull();
  });
  it('procesando nunca alerta', () => {
    expect(pickAlert(dto({ status: 'procesando', alert: null }))).toBeNull();
  });
  it('solo firma y no_leido interrumpen; revisar no', () => {
    expect(isBlockingAlert('firma')).toBe(true);
    expect(isBlockingAlert('no_leido')).toBe(true);
    expect(isBlockingAlert('revisar')).toBe(false);
    expect(isBlockingAlert('error')).toBe(false);
    expect(isBlockingAlert(null)).toBe(false);
  });
  it('usa los textos exactos', () => {
    expect(alertMessage('firma')).toBe(
      'Este comprobante no tiene una firma válida. Pedí la firma y volvé a escanearlo',
    );
    expect(ALERT_TEXTS.noReconocido).toBe(
      'No se pudo leer el comprobante. Probá con más luz y el papel estirado',
    );
    expect(ALERT_TEXTS.errorServidor).toBe('No pudimos procesarlo, lo reintentamos solo');
  });
});

describe('pollScan', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('consulta cada 1,5 s hasta el estado final', async () => {
    const getScan = vi
      .fn<() => Promise<ScanDto>>()
      .mockResolvedValueOnce(dto({ status: 'procesando' }))
      .mockResolvedValueOnce(dto({ status: 'procesando' }))
      .mockResolvedValueOnce(dto({ status: 'listo' }));
    const p = pollScan(getScan);
    await vi.advanceTimersByTimeAsync(0);
    expect(getScan).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1499);
    expect(getScan).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(getScan).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1500);
    expect((await p)?.status).toBe('listo');
    expect(getScan).toHaveBeenCalledTimes(3);
  });

  it('se rinde a los 30 s devolviendo null', async () => {
    const getScan = vi
      .fn<() => Promise<ScanDto>>()
      .mockResolvedValue(dto({ status: 'procesando' }));
    const p = pollScan(getScan);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await p).toBeNull();
    const calls = getScan.mock.calls.length;
    expect(calls).toBeGreaterThanOrEqual(20);
    expect(calls).toBeLessThanOrEqual(21);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(getScan).toHaveBeenCalledTimes(calls);
  });

  it('un error de red no corta el polling', async () => {
    const getScan = vi
      .fn<() => Promise<ScanDto>>()
      .mockRejectedValueOnce(new Error('red'))
      .mockResolvedValueOnce(dto());
    const p = pollScan(getScan);
    await vi.advanceTimersByTimeAsync(1500);
    expect((await p)?.status).toBe('listo');
  });
});

describe('createCaptureManager', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(over: Partial<CaptureDeps> = {}) {
    let n = 0;
    const deps: CaptureDeps = {
      prepareImage: vi.fn(async (u: string) => `${u}.small`),
      newId: () => `id-${++n}`,
      getLocation: vi.fn(async () => ({ lat: -34.9, lng: -56.1 })),
      upload: vi.fn(async () => ({ scan_id: 'scan-1', status: 'procesando' as const })),
      getScan: vi.fn(async () => dto({ id: 'scan-1' })),
      ...over,
    };
    return { deps, manager: createCaptureManager(deps) };
  }

  it('redimensiona, sube con el client_id y deja la tarjeta en done', async () => {
    const { deps, manager } = setup();
    manager.enqueueCapture({ companyId: 'c1', imageUri: 'file://a.jpg' });
    expect(manager.getCaptures()[0]?.status).toBe('preparing');
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.upload).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({
        imageUri: 'file://a.jpg.small',
        clientId: 'id-1',
        lat: -34.9,
        replacesScanId: undefined,
      }),
    );
    expect(manager.getCaptures()[0]).toMatchObject({ status: 'done', scanId: 'scan-1' });
  });

  it('no espera más de 2 s por la ubicación', async () => {
    const { deps, manager } = setup({ getLocation: () => new Promise(() => {}) });
    manager.enqueueCapture({ companyId: 'c1', imageUri: 'x' });
    await vi.advanceTimersByTimeAsync(1999);
    expect(deps.upload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(deps.upload).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ lat: undefined, lng: undefined }),
    );
  });

  it('reintenta la subida ante red o 5xx (Pendiente de envío) y no ante 4xx', async () => {
    const upload = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('x'), { status: 503 }))
      .mockRejectedValueOnce(new Error('sin red'))
      .mockResolvedValue({ scan_id: 'scan-1', status: 'procesando' });
    const { manager } = setup({ upload });
    manager.enqueueCapture({ companyId: 'c1', imageUri: 'x' });
    await vi.advanceTimersByTimeAsync(2500);
    expect(manager.getCaptures()[0]?.status).toBe('pending');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(upload).toHaveBeenCalledTimes(3);
    expect(manager.getCaptures()[0]?.status).toBe('done');

    const bad = setup({
      upload: vi.fn().mockRejectedValue(Object.assign(new Error('mal'), { status: 400 })),
    });
    bad.manager.enqueueCapture({ companyId: 'c1', imageUri: 'x' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(bad.manager.getCaptures()[0]).toMatchObject({ status: 'failed', error: 'mal' });
    expect(bad.deps.upload).toHaveBeenCalledTimes(1);
  });

  it('pasa a timeout si el servidor sigue procesando 30 s', async () => {
    const { manager } = setup({ getScan: async () => dto({ status: 'procesando' }) });
    manager.enqueueCapture({ companyId: 'c1', imageUri: 'x' });
    await vi.advanceTimersByTimeAsync(31_000);
    expect(manager.getCaptures()[0]?.status).toBe('timeout');
  });

  it('«Volver a escanear» sube con replaces_scan_id', async () => {
    const { deps, manager } = setup();
    const item = await rescan(manager, async () => 'file://nueva.jpg', {
      companyId: 'c1',
      scanId: 'scan-viejo',
    });
    expect(item?.replacesScanId).toBe('scan-viejo');
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.upload).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ replacesScanId: 'scan-viejo' }),
    );
  });

  it('si cancela el escáner, no sube nada', async () => {
    const { deps, manager } = setup();
    expect(await rescan(manager, async () => null, { companyId: 'c1', scanId: 's' })).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it('notifica a los suscriptores y permite descartar la alerta', async () => {
    const { manager } = setup();
    const l = vi.fn();
    manager.subscribe(l);
    const it = manager.enqueueCapture({ companyId: 'c1', imageUri: 'x' });
    expect(l).toHaveBeenCalled();
    manager.dismissAlert(it.clientId);
    expect(manager.getCaptures()[0]?.alertDismissed).toBe(true);
  });
});

describe('helpers', () => {
  it('resizeTarget achica a 1.600 px y no agranda', () => {
    expect(resizeTarget(3200, 2400)).toEqual({ width: 1600, height: 1200 });
    expect(resizeTarget(1200, 3200)).toEqual({ width: 600, height: 1600 });
    expect(resizeTarget(1000, 800)).toBeNull();
  });
  it('isRetryableUploadError', () => {
    expect(isRetryableUploadError(new Error('red'))).toBe(true);
    expect(isRetryableUploadError({ status: 500 })).toBe(true);
    expect(isRetryableUploadError({ status: 422 })).toBe(false);
  });
});
