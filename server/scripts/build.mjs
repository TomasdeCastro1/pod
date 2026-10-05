// Compila el servidor a server/dist con esbuild: npm run build -w server
// - Cada entrada es un bundle independiente que queda en una ruta fija
//   (dist/index.js, dist/db/migrate.js, dist/db/seed/run.js), así que
//   `../../drizzle` en migrate.js sigue apuntando a server/drizzle.
// - Las dependencias de node_modules quedan externas (se resuelven en runtime con
//   `npm ci`), salvo @app/shared, que se publica como fuente .ts y se incluye en el bundle.
import { build } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = `${root}dist`;
rmSync(dist, { recursive: true, force: true });

const bundleShared = {
  name: 'bundle-shared',
  setup(b) {
    // Con packages: 'external' esbuild marcaría @app/shared como externo; lo resolvemos nosotros.
    b.onResolve({ filter: /^@app\/shared$/ }, () => ({
      path: fileURLToPath(new URL('../../shared/src/index.ts', import.meta.url)),
    }));
  },
};

await build({
  entryPoints: {
    index: `${root}src/index.ts`,
    'db/migrate': `${root}src/db/migrate.ts`,
    'db/seed/run': `${root}src/db/seed/run.ts`,
    'scripts/seed-review': `${root}scripts/seed-review.ts`,
  },
  outdir: dist,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  packages: 'external',
  plugins: [bundleShared],
  sourcemap: true,
  logLevel: 'info',
});
