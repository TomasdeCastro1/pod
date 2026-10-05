# Operación del servidor

Guía para quien administra el backend. Los pasos de Replit son genéricos: la interfaz cambia y todavía no hay un deploy concreto; ajustá los nombres de menús a lo que veas.

## Ver logs

- El servidor escribe un JSON por línea a la salida estándar (`pino`). En Replit se ven en la consola del Deployment (pestaña de logs del deploy publicado) o en la consola del Workspace si corre en desarrollo.
- Cada línea tiene `event` (por ejemplo `scan.done`, `scan.failed`, `scans.recovered`, `http.unhandled`, `health.db_failed`). Filtrá por ese campo para encontrar problemas.
- Nivel: variable opcional `LOG_LEVEL` (`debug`, `info`, `warn`, `error`; por defecto `info`).
- Los logs no incluyen imágenes, códigos de login, emails, tokens ni los campos `extracted` y `corrections`: el logger los reemplaza por `[redacted]`. Si hay que investigar un escaneo, usá su `scanId`.
- `GET /health` devuelve `{"status":"ok"}` o 503 `{"status":"unavailable"}` si la base no responde.

## Restaurar un backup de la base

1. En Replit, abrí la herramienta de base de datos PostgreSQL del proyecto y buscá la sección de backups o restauración a un punto en el tiempo (la disponibilidad depende del plan; confirmarla es una tarea pendiente, ver el brief T6.3).
2. Elegí el punto de restauración (fecha y hora) anterior al problema.
3. Si la restauración crea una base nueva, actualizá `DATABASE_URL` en Secrets con la cadena de la nueva y reiniciá el deploy.
4. Verificá con `GET /health` y entrando a la app con una cuenta de prueba.
5. Al arrancar, el servidor vuelve a encolar los escaneos que quedaron en `procesando` hace más de 2 minutos, y revisa cada 5 minutos si hay otros.
- Si la plataforma no ofrece backups diarios, hay que pedir como tarea aparte un job de `pg_dump` al Object Storage.

## Rotar `JWT_SECRET`

Cambiarlo invalida todas las sesiones: los usuarios tendrán que volver a pedir un código.

1. Generá un valor largo y aleatorio, por ejemplo `openssl rand -base64 48`.
2. Reemplazá `JWT_SECRET` en Replit Secrets.
3. Reiniciá el deploy.
4. Abrí la app: debe pedir login de nuevo. Es lo esperado.

## Rotar `ANTHROPIC_API_KEY`

1. En la consola de Anthropic, creá una clave nueva (no borres la vieja todavía).
2. Reemplazá `ANTHROPIC_API_KEY` en Replit Secrets y reiniciá el deploy.
3. Escaneá un comprobante de prueba y confirmá que llega a `listo`.
4. Recién entonces revocá la clave anterior.

Las demás claves (`ADMIN_TOKEN`, `SIGNED_URL_SECRET`, `RESEND_API_KEY`) se rotan igual: cambiar en Secrets y reiniciar. Cambiar `SIGNED_URL_SECRET` invalida las URLs de imagen ya emitidas (duran 5 minutos).

## Actualizar precios por `/admin/*`

Los endpoints de administración usan el encabezado `Authorization: Bearer <ADMIN_TOKEN>` (no sirve el token de un usuario). Reemplazá `$URL` por la URL pública del servidor.

```bash
# Precio base por 1.000 imágenes
curl -X PUT "$URL/admin/price-settings" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"base_price_per_1000_usd": 40}'

# Precio, instrucción o estado de un campo del catálogo (al menos una de las claves)
curl -X PUT "$URL/admin/field-catalog/<clave_del_campo>" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"price_per_1000_usd": 2, "active": true}'

# Precio de un modelo de IA (para el costo real)
curl -X PUT "$URL/admin/model-prices/<modelo>" \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"input_per_mtok_usd": 1, "output_per_mtok_usd": 5}'

# Uso, costo IA real y margen por empresa y mes
curl "$URL/admin/usage?month=2026-09" -H "Authorization: Bearer $ADMIN_TOKEN"
```

- Los cambios de precio valen para los escaneos nuevos: cada escaneo guarda el precio vigente al momento de escanear.
- Un modelo sin precio cargado deja el costo IA del escaneo en blanco y registra el evento `scan.model_without_price`.
