import { describe, expect, it } from 'vitest';
import { SERVICE_NAME } from './index.js';

describe('server', () => {
  it('consumes @app/shared', () => {
    expect(SERVICE_NAME).toBe('comprobantes-server');
  });
});
