import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScanDto } from '@app/shared';
import { ALERT_TEXTS, alertMessage, isBlockingAlert, pickAlert } from './alerts';
import { isRetryableUploadError, rescan, resizeTarget } from './manager';
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
    reviewed: false,
    reviewed_at: null,
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
    expect(isRetryableUploadError({ status: 401 })).toBe(true);
  });
});

describe('rescan', () => {
  it('«Volver a escanear» encola con replaces_scan_id', async () => {
    const enqueueCapture = vi.fn((i) => ({ ...i, clientId: 'x' }));
    await rescan({ enqueueCapture }, async () => 'file://nueva.jpg', {
      companyId: 'c1',
      scanId: 'scan-viejo',
    });
    expect(enqueueCapture).toHaveBeenCalledWith({
      companyId: 'c1',
      imageUri: 'file://nueva.jpg',
      replacesScanId: 'scan-viejo',
    });
  });
  it('si cancela el escáner, no encola nada', async () => {
    const enqueueCapture = vi.fn();
    expect(
      await rescan({ enqueueCapture }, async () => null, { companyId: 'c', scanId: 's' }),
    ).toBeNull();
    expect(enqueueCapture).not.toHaveBeenCalled();
  });
});
