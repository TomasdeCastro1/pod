import { describe, expect, it } from 'vitest';
import { APP_NAME, greet } from './index.js';

describe('shared', () => {
  it('exports the app name', () => {
    expect(APP_NAME).toBe('comprobantes');
  });
  it('greets', () => {
    expect(greet('mundo')).toBe('Hola, mundo');
  });
});
