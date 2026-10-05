# Deploy de staging en Replit

Guía para publicar el backend (`server/`) en Replit con PostgreSQL y Object Storage. Para la operación diaria (logs, backups, rotar secrets) ver [`operacion.md`](operacion.md); no se repite acá.

Las marcas **[Confirmar en Replit]** indican datos de la configuración que no se pudieron verificar contra la documentación actual de Replit: la interfaz y los nombres cambian, ajustalos a lo que veas.

## Qué trae el repositorio

- `.replit` y `replit.nix` en la raíz.
  - Run (desarrollo en el Workspace): `node server/dist/index.js`.
  - Deployment: `deploymentTarget = "gce"` (Reserved VM). Build: `npm ci && npm run build -w server && npm run db:migrate:prod -w server && npm run db:seed:prod -w server`. Run: `node server/dist/index.js`.
  - Puerto: el servidor escucha en `PORT` (3000 por defecto); en el deploy Replit lo inyecta. `[[ports]]` mapea 3000 al 80 externo para el Workspace.
- `npm run build -w server`: compila con esbuild (`server/scripts/build.mjs`) a `server/dist`. Cada entrada es un bundle propio; las dependencias de `node_modules` quedan externas (por eso el build corre `npm ci` primero) y `@app/shared`, que se publica como fuente `.ts`, se incluye dentro del bundle. Se eligió esbuild y no `tsc` porque `tsc` no resuelve `@app/shared` (fuente TS sin build) sin reestructurar el monorepo; el chequeo de tipos sigue siendo `npm run typecheck`.
- Comandos sobre el build compilado (los que usa Replit; los `db:migrate`, `db:seed` y `seed:review` sin sufijo usan `tsx` y son para desarrollo):

| Tarea | Comando en producción |
|---|---|
| Arrancar | `node server/dist/index.js` (`npm run start:prod -w server`) |
| Migrar la base | `npm run db:migrate:prod -w server` |
| Seed del catálogo | `npm run db:seed:prod -w server` (idempotente) |
| Cuenta de revisión | `npm run seed:review:prod -w server` |

La migración lee la carpeta `server/drizzle`, que está en el repositorio: no hace falta copiarla.

## Pasos para Francisco

1. En Replit: «Import from GitHub» con el repositorio.
2. Agregar la base PostgreSQL de Replit y un bucket de Object Storage al Repl. **[Confirmar en Replit]** que el bucket queda como predeterminado: `ReplitStore` usa `new Client()` sin nombre de bucket, así que toma el predeterminado del Repl; si hay más de uno, dejar uno como predeterminado.
3. Cargar los Secrets:
   - `ANTHROPIC_API_KEY`
   - `DATABASE_URL` (lo pone Replit al crear la base; **[Confirmar en Replit]** que el valor está disponible también durante el build del deploy)
   - `JWT_SECRET`, `ADMIN_TOKEN`, `SIGNED_URL_SECRET` (valores largos y aleatorios, por ejemplo `openssl rand -base64 48`)
   - `RESEND_API_KEY`
   - `PUBLIC_BASE_URL` (la URL pública del deploy, sin barra final)
   - `STORAGE_DRIVER=replit`
   - `EMAIL_DRIVER=resend`
   - `REVIEW_EMAIL` y `REVIEW_CODE` (opcionales; solo si se quiere la cuenta de revisión)
   - Opcionales: `EMAIL_FROM`, `LOG_LEVEL`, `MODEL_PRIMARY`, `MODEL_SECONDARY`. Lista completa en `server/.env.example`.
4. Publicar como **Reserved VM** (no Autoscale: el procesamiento en segundo plano necesita el proceso vivo). **[Confirmar en Replit]** que el deploy tomó el build y el run de `.replit`; si la interfaz muestra otros, pegar los de la sección «Qué trae el repositorio». Si la interfaz pide un puerto, es el que Replit inyecta en `PORT`.
5. (Opcional) Cuenta de revisión en staging: con `REVIEW_EMAIL`, `REVIEW_CODE` y `STORAGE_DRIVER=replit` cargados, abrir la Shell del Repl y correr `npm ci && npm run build -w server && npm run seed:review:prod -w server` (desde el Workspace también sirve `npm run seed:review -w server`, que usa `tsx`). Es idempotente. Detalle en [`store/review-notes.md`](store/review-notes.md).
6. Probar `https://<dominio>/health` y pasar la URL a la sesión de T3.x.

## Cómo verificar que funciona

1. `GET https://<dominio>/health` devuelve `{"status":"ok"}`. Si da 503, la base no responde: revisar `DATABASE_URL`.
2. Login real: `POST https://<dominio>/auth/request-code` con `{"email":"tu@email.com"}`; debe llegar el código por email (Resend). Con ese código, `POST /auth/verify` (con `email` y `code`) entrega el token.
3. Un `POST /companies/:id/scans` con `samples/06.jpg` y el token debe terminar en `listo`.
4. En los logs del deploy debe verse `server.listening`; si aparece `server.start_failed`, falta una variable o la base no es alcanzable (el mensaje de configuración inválida lista qué variable falta).

## Notas

- Si el build falla en `db:migrate:prod` con error de conexión, el `DATABASE_URL` no llega al build (ver paso 3).
- Dominio propio y backups quedan para T6.3 (ver `operacion.md`).
