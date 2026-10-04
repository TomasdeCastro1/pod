import { defineConfig } from 'vitest/config';

// PGlite migrations are slow on a loaded CI runner; the 5 s default flakes.
export default defineConfig({
  test: { testTimeout: 20_000, hookTimeout: 20_000 },
});
