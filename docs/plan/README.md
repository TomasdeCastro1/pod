# Plan de ejecución — App de escaneo de comprobantes firmados

Plan para construir la app descrita en [especificacion.md](especificacion.md) usando sesiones de Claude Code con el modelo **Sonnet** (`claude-sonnet-5-5`), una tarea por sesión.

La especificación original estaba pensada para Replit Agent. Este plan mantiene el mismo producto, el mismo stack y las mismas seis etapas de la sección 14, pero las parte en tareas chicas y autocontenidas, cada una con su brief en [briefs/](briefs/).

---

## 1. Cómo usar este plan

1. Hacer primero la tarea humana **T0.1** (repositorio, fotos de muestra, cuentas y claves). Sin ella ninguna sesión puede arrancar.
2. Para cada tarea, abrir una sesión nueva de Claude Code con Sonnet conectada al repositorio y pegar este mensaje:

   > Lee `CLAUDE.md`, `docs/especificacion.md` y el brief `docs/plan/briefs/<archivo>.md`, y ejecuta esa tarea. Trabaja en una rama nueva con el nombre del brief, corre los checks del repo y abre un PR en borrador cuando termines. No hagas nada que el brief marque como fuera de alcance.

3. Revisar y mergear el PR antes de arrancar las tareas que dependen de él (columna «Depende de»).
4. Una etapa no se da por terminada hasta cumplir sus criterios de aceptación (marcados con ✅ en la tabla). Es la misma regla de la sección 14 de la especificación.

La tarea T0.2 copia esta carpeta al repositorio como `docs/plan/` y la especificación como `docs/especificacion.md`, así cada sesión la encuentra sin depender de este proyecto.

**Leyenda de tamaño:** S = una sesión corta, M = una sesión normal, L = sesión larga o con varias iteraciones.
**Quién:** 🤖 = sesión de Sonnet, 👤 = Francisco (no se puede delegar: cuentas, pagos, celular real, tiendas).

---

## 2. Mapa de tareas

### Fase 0 · Preparación

| ID | Tarea | Quién | Depende de | Tamaño |
|---|---|---|---|---|
| [T0.1](briefs/T0.1-prerrequisitos.md) | Prerrequisitos: repo, muestras, cuentas, claves y decisiones | 👤 | — | S |
| [T0.2](briefs/T0.2-esqueleto-monorepo.md) | Esqueleto del monorepo, `CLAUDE.md` y CI | 🤖 | T0.1 | M |

### Fase 1 · Backend y extracción, sin app (etapa 1 de la especificación)

| ID | Tarea | Quién | Depende de | Tamaño |
|---|---|---|---|---|
| [T1.1](briefs/T1.1-servidor-y-esquema.md) | Servidor base y esquema de base de datos (10 tablas) | 🤖 | T0.2 | M |
| [T1.2](briefs/T1.2-seed-catalogo-y-precios.md) | Seed del catálogo de campos, precios y modelos | 🤖 | T1.1 | M |
| [T1.3](briefs/T1.3-utilidades-dominio.md) | Utilidades de dominio: RUT, números, fechas, tipos CFE, cálculo de precio | 🤖 | T0.2 | S |
| [T1.4](briefs/T1.4-lector-qr-dgi.md) | Lector de QR y parser del QR de DGI | 🤖 | T1.3 | M |
| [T1.5](briefs/T1.5-almacenamiento-e-imagenes.md) | Almacenamiento de imágenes, miniaturas y copias para la IA | 🤖 | T1.1 | M |
| [T1.6](briefs/T1.6-prompt-dinamico.md) | Constructor del prompt dinámico | 🤖 | T1.2 | M |
| [T1.7](briefs/T1.7-ia-validaciones-escalado.md) | Llamada a la IA, validaciones, escalado y costo | 🤖 | T1.3, T1.6 | L |
| [T1.8](briefs/T1.8-pipeline-escaneo.md) | Pipeline completo de un escaneo | 🤖 | T1.4, T1.5, T1.7 | M |
| [T1.9](briefs/T1.9-test-samples.md) | `npm run test:samples` y ajuste del prompt ✅ etapa 1 | 🤖 + 👤 | T1.8 | L |

T1.3 puede ir en paralelo con T1.1. T1.4 y T1.5 pueden ir en paralelo entre sí y con T1.6.

### Fase 2 · API REST (completa el backend que necesita la app)

| ID | Tarea | Quién | Depende de | Tamaño |
|---|---|---|---|---|
| [T2.1](briefs/T2.1-login-por-codigo.md) | Login por código al email y JWT | 🤖 | T1.1 | M |
| [T2.2](briefs/T2.2-empresas-y-miembros.md) | Empresas, membresías e invitaciones | 🤖 | T2.1 | M |
| [T2.3](briefs/T2.3-subida-y-consulta-escaneos.md) | Subida idempotente y consulta de escaneos | 🤖 | T1.8, T2.2 | M |
| [T2.4](briefs/T2.4-archivo-api.md) | Listado, búsqueda, CSV, correcciones y borrado | 🤖 | T2.3 | M |
| [T2.5](briefs/T2.5-campos-uso-admin.md) | Campos a leer, uso del mes y endpoints de administración | 🤖 | T2.2 | M |
| [T2.6](briefs/T2.6-deploy-staging.md) | Deploy de staging en Replit | 🤖 + 👤 | T2.3 | S |

T2.4 y T2.5 pueden ir en paralelo. La fase 2 puede arrancar mientras T1.9 itera sobre el prompt.

### Fase 3 · App base (etapa 2)

| ID | Tarea | Quién | Depende de | Tamaño |
|---|---|---|---|---|
| [T3.1](briefs/T3.1-proyecto-expo.md) | Proyecto Expo, pestañas, cliente de API y configuración EAS | 🤖 | T0.2 | M |
| [T3.2](briefs/T3.2-login-y-onboarding.md) | Login, crear o unirse a empresa, empresa activa | 🤖 | T3.1, T2.2 | M |
| [T3.3](briefs/T3.3-pantalla-escanear.md) | Pantalla Escanear: escáner, subida, tarjetas y alertas | 🤖 | T3.2, T2.3 | L |
| [T3.4](briefs/T3.4-build-en-celular-real.md) | Development build en un celular real ✅ etapa 2 | 👤 + 🤖 | T3.3, T2.6 | S |

### Fase 4 · Archivo (etapa 3)

| ID | Tarea | Quién | Depende de | Tamaño |
|---|---|---|---|---|
| [T4.1](briefs/T4.1-archivo-lista.md) | Lista, búsqueda y filtros | 🤖 | T3.2, T2.4 | M |
| [T4.2](briefs/T4.2-archivo-detalle.md) | Detalle, corrección, revisado, compartir, borrar y CSV | 🤖 | T4.1 | M |

### Fase 5 · Perfil (etapa 4)

| ID | Tarea | Quién | Depende de | Tamaño |
|---|---|---|---|---|
| [T5.1](briefs/T5.1-perfil-empresas-miembros.md) | Mis empresas, cambio de empresa, miembros e invitación | 🤖 | T3.2, T2.2 | M |
| [T5.2](briefs/T5.2-campos-y-uso.md) | «Campos a leer» con precio en vivo y «Uso y precio» ✅ etapa 4 | 🤖 | T5.1, T2.5 | M |

Las fases 4 y 5 pueden ir en paralelo.

### Fase 6 · Robustez y requisitos de tienda (etapa 5)

| ID | Tarea | Quién | Depende de | Tamaño |
|---|---|---|---|---|
| [T6.1](briefs/T6.1-cola-sin-conexion.md) | Cola sin conexión y reintentos ✅ etapa 5 | 🤖 | T3.3 | L |
| [T6.2](briefs/T6.2-cuenta-legales-revisores.md) | Eliminar cuenta, política de privacidad, términos y cuenta de revisión | 🤖 | T5.1 | M |
| [T6.3](briefs/T6.3-seguridad-operativa.md) | Logs sin datos personales, recuperación de escaneos colgados, backups | 🤖 + 👤 | T2.6 | S |
| [T6.4](briefs/T6.4-material-de-tiendas.md) | Configuración EAS Submit, textos y formularios de las tiendas | 🤖 + 👤 | T6.2 | M |

### Fase 7 · Piloto y publicación (etapa 6)

| ID | Tarea | Quién | Depende de | Tamaño |
|---|---|---|---|---|
| [T7.1](briefs/T7.1-ampliar-muestras.md) | Ampliar las muestras a 50+ fotos y regresión | 👤 + 🤖 | T1.9 | M |
| [T7.2](briefs/T7.2-piloto-y-publicacion.md) | Piloto de 2 semanas con Punto Sano, ajustes y envío a tiendas | 👤 + 🤖 | todo lo anterior | L |

---

## 3. Qué tiene que hacer Francisco (no lo puede hacer Sonnet)

- **Repositorio en GitHub** conectado a este proyecto. Hoy el proyecto no tiene ninguno y el plan lo necesita desde T0.2.
- **Las 11 fotos de muestra** en `samples/01.jpg` … `samples/11.jpg`, con los nombres de la tabla de la sección 14. Sin ellas no se puede cerrar la etapa 1.
- **Claves y cuentas:** Anthropic (API key), Replit (hosting), Resend (envío de códigos, con dominio verificado), Expo (EAS), Apple Developer (USD 99/año), Google Play Console (USD 25).
- **Secrets del entorno de Claude Code** donde corran las sesiones: al menos `ANTHROPIC_API_KEY` para T1.9 y T7.1, y `EXPO_TOKEN` si se quiere que Sonnet lance builds de EAS.
- **Pruebas en celular real**, TestFlight, prueba interna de Android, piloto con repartidores y envío a las tiendas.

Detalle paso a paso en [T0.1](briefs/T0.1-prerrequisitos.md).

---

## 4. Huecos de la especificación y la decisión que toma el plan

Cada brief ya aplica estas decisiones. Si alguna no te sirve, cámbiala acá y en el brief antes de ejecutarlo.

| # | Hueco | Decisión por defecto |
|---|---|---|
| 1 | El código lo escribe Sonnet en GitHub, no Replit Agent. | Monorepo en GitHub. Replit solo como hosting, importando el repo (T2.6). |
| 2 | El procesamiento de cada foto es asíncrono y Replit puede dormir el servidor. | Cola en el mismo proceso + recuperación al arrancar de escaneos «procesando» viejos. Deploy como **Reserved VM**, no Autoscale. |
| 3 | No está claro que Replit Object Storage dé URLs firmadas. | URLs firmadas propias del backend (token HMAC que vence en 5 min) que sirven la imagen. Funciona igual con cualquier almacenamiento. |
| 4 | Las sesiones de Sonnet no tienen Replit ni Postgres a mano. | Interfaz de almacenamiento con dos implementaciones (Replit y disco local) y tests con PGlite (Postgres en memoria compatible con Drizzle). |
| 5 | `est_in_tokens` y `est_out_tokens` del catálogo no vienen en la especificación. | Se derivan del «Costo IA» de la tabla 7.2: `est_in_tokens` ≈ largo de la instrucción / 4, y `est_out_tokens` = (costo × 1000 − est_in_tokens) / 5, redondeado y con mínimo 3. |
| 6 | `claude-sonnet-5` como modelo secundario. | Variable `MODEL_SECONDARY` con valor por defecto `claude-sonnet-5-5` (el Sonnet más nuevo). Verificar precio vigente antes de cargar `model_prices`. |
| 7 | Dónde guardar el JWT en el celular. | `expo-secure-store`. |
| 8 | «Volver a escanear» reemplaza la foto anterior, pero el reescaneo cuenta como imagen nueva. | El nuevo escaneo guarda `replaces_scan_id`; el anterior se oculta del Archivo pero sigue contando en el uso (ya fue procesado). Se agrega esa columna a `scans`. |
| 9 | `items[]` base solo aplica a devoluciones. | En facturas, `items` se pide solo si hay algún `fact_item_*` activo. |
| 10 | Dónde vive la política de privacidad. | Páginas estáticas servidas por el backend en `/legal/privacidad` y `/legal/terminos`. Francisco revisa el texto (Ley 18.331). |
| 11 | Cuenta de revisión de Apple/Google con login por código. | Variables `REVIEW_EMAIL` y `REVIEW_CODE`: solo ese email acepta ese código fijo. |
| 12 | Package manager y estructura. | npm workspaces: `server/`, `mobile/`, `shared/`, `samples/`, `docs/`. |
| 13 | Notas de crédito por QR. | CFE 102 y 112 emitidos por la empresa → `nota_credito_emitida`. 103 y 113 (notas de débito) → `factura_emitida` con `tipo_cfe` guardado. |

---

## 5. Riesgos que conviene mirar temprano

- **Lectura del QR en papel térmico** (T1.4): zxing puede fallar con fotos de baja calidad. El brief pide probar con varias escalas y binarizaciones antes de dar el QR por ausente. Si igual falla, la IA lee esos datos y el costo sube un poco.
- **Haiku leyendo devoluciones en A4** (T1.9): la especificación ya prevé `ROUTE_PAPER_RETURNS_TO_SECONDARY`. T1.9 decide con datos si activarla.
- **Plugin del escáner** (T3.3): requiere development build; no se puede probar en Expo Go ni en el contenedor de Sonnet. La primera prueba real es T3.4. Si falla, la alternativa de la especificación es `expo-camera` con marco guía.
- **Regla 3.1.3 de Apple** sobre cobro fuera de la app (T6.4): revisarla antes del primer envío.
- **Identificador de la app** (`uy.<empresa>.<app>`): se decide en T0.1 y no se puede cambiar después del primer build.
