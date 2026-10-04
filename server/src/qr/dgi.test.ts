import { describe, expect, it } from 'vitest';
import { parseDgiQr } from './dgi.js';

const BASE = 'https://www.efactura.dgi.gub.uy/consultaQR/cfe?';

describe('parseDgiQr', () => {
  it('parses the expected order', () => {
    const r = parseDgiQr(`${BASE}219419590017,111,A,6129,1727.91,24/09/2026,abcDEF123+/=`);
    expect(r).toEqual({
      isDgi: true,
      partial: false,
      data: {
        rut_emisor: '219419590017',
        tipo_cfe: 111,
        serie: 'A',
        numero: 6129,
        total: 1727.91,
        fecha_documento: '2026-09-24',
      },
    });
  });

  it('parses an e-Remito', () => {
    const r = parseDgiQr(`${BASE}214214350013,181,S,2213900,0.00,02/10/2026,hash`);
    expect(r.data).toMatchObject({
      rut_emisor: '214214350013',
      tipo_cfe: 181,
      serie: 'S',
      numero: 2213900,
      fecha_documento: '2026-10-02',
    });
  });

  it('tolerates a different order', () => {
    const r = parseDgiQr(`${BASE}24/09/2026,A,6129,111,1727.91,219419590017`);
    expect(r.isDgi).toBe(true);
    expect(r.partial).toBe(false);
    expect(r.data).toMatchObject({
      rut_emisor: '219419590017',
      tipo_cfe: 111,
      serie: 'A',
      numero: 6129,
      total: 1727.91,
      fecha_documento: '2026-09-24',
    });
  });

  it('accepts a total without decimals', () => {
    const r = parseDgiQr(`${BASE}219419590017,111,A,6129,1728,24/09/2026`);
    expect(r.data.total).toBe(1728);
    expect(r.data.numero).toBe(6129);
  });

  it('marks partial when values are missing', () => {
    const r = parseDgiQr(`${BASE}219419590017,111,A`);
    expect(r.isDgi).toBe(true);
    expect(r.partial).toBe(true);
    expect(r.data.rut_emisor).toBe('219419590017');
    expect(r.data.numero).toBeUndefined();
  });

  it('marks partial and drops an invalid RUT', () => {
    const r = parseDgiQr(`${BASE}219419590018,111,A,6129,1727.91,24/09/2026`);
    expect(r.isDgi).toBe(true);
    expect(r.partial).toBe(true);
    expect(r.data.rut_emisor).toBeUndefined();
  });

  it('decodes a percent-encoded URL', () => {
    const r = parseDgiQr(`${BASE}219419590017%2C111%2CA%2C6129%2C1727.91%2C24%2F09%2F2026%2Chash`);
    expect(r.partial).toBe(false);
    expect(r.data.numero).toBe(6129);
    expect(r.data.fecha_documento).toBe('2026-09-24');
  });

  it('is DGI with no query, but partial and empty', () => {
    expect(parseDgiQr('https://www.efactura.dgi.gub.uy/consultaQR/cfe')).toEqual({
      isDgi: true,
      partial: true,
      data: {},
    });
  });

  it('rejects foreign hosts, even if the path mentions dgi.gub.uy', () => {
    expect(parseDgiQr('https://eldorado.com.uy/r/123?x=1').isDgi).toBe(false);
    const evil = parseDgiQr('https://evil.example/dgi.gub.uy?219419590017,111,A,1,1.00,24/09/2026');
    expect(evil.isDgi).toBe(false);
    expect(evil.data).toEqual({});
    expect(parseDgiQr('texto cualquiera').isDgi).toBe(false);
  });
});
