# CLAUDE.md

App móvil (Expo) + backend Node.js que escanea comprobantes firmados (facturas y devoluciones) y extrae sus datos con IA. La especificación completa está en `docs/especificacion.md` y el plan de ejecución, con un brief por tarea, en `docs/plan/` (índice en `docs/plan/README.md`, briefs en `docs/plan/briefs/`).

## Estructura del monorepo (npm workspaces)

```
server/    Backend Node.js + TypeScript + Express (ESM)
mobile/    App Expo (SDK 57, Expo Router, TypeScript)
shared/    TypeScript compartido (@app/shared): tipos, claves de campos, RUT, precio
samples/   Fotos de prueba 01.jpg … 11.jpg + expected.json (lo crea T1.9)
docs/      Especificación y plan
```

`@app/shared` se consume desde `shared/src/index.ts` (fuente TS directa, sin build).

## Comandos (desde la raíz)

- `npm ci` — instalar dependencias
- `npm run lint` — ESLint
- `npm run typecheck` — `tsc` en cada workspace
- `npm test` — Vitest en cada workspace
- `npm run test:samples` — corre el pipeline contra `samples/` (placeholder hasta T1.9; llama a la API de Anthropic, no corre en CI)
- `npm run format` — Prettier

## Convenciones

- Código y nombres de variables en inglés, salvo las claves de negocio de la especificación (`conformidad_nivel`, `cliente_rut`, etc.), que se usan tal cual.
- Textos de la app en español rioplatense, como en la especificación.
- TypeScript estricto, ESM, Node 20+.
- Validación con zod en todos los bordes (requests, respuestas de la IA, variables de entorno).
- Nada de secretos en el código; variables en `server/.env.example` (sin valores).
- Identificador de la app (provisorio, aún no decidido): `uy.puntosano.comprobantes`. No se puede cambiar después del primer build.

## Regla de trabajo

Una tarea por PR, siguiendo su brief en `docs/plan/briefs/`. No hacer nada que el brief marque como fuera de alcance. Antes de abrir el PR correr `npm run lint && npm run typecheck && npm test`.
