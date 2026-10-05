# Data Safety (Google Play): respuestas

Base: especificación §13.1 y §13.3. Verificar contra el formulario vigente al cargarlo.

**¿La app recopila o comparte datos de usuario requeridos?** Sí, recopila.

| Categoría / dato | ¿Recopila? | ¿Comparte? | Obligatorio u opcional | Finalidad |
|---|---|---|---|---|
| Información personal: dirección de email | Sí | No | Obligatorio | Funcionalidad de la app, gestión de la cuenta |
| Fotos y videos: fotos | Sí | No | Obligatorio para usar el escáner | Funcionalidad de la app |
| Ubicación: ubicación aproximada y precisa | Sí | No | Opcional | Funcionalidad de la app |
| Actividad en la app: interacciones (imágenes procesadas) | Sí | No | Obligatorio | Funcionalidad de la app, analítica |
| Identificadores: ID de usuario | Sí | No | Obligatorio | Funcionalidad de la app |

- **Compartir:** no se comparten datos con terceros para publicidad. El envío de las imágenes al proveedor de IA y al hosting es procesamiento por cuenta del servicio y no cuenta como «compartir» según la definición de Google (confirmar al completar el formulario).
- **Cifrado en tránsito:** Sí (todo por HTTPS).
- **El usuario puede pedir que se borren sus datos:** Sí, desde la app («Eliminar cuenta», Perfil) y por email de soporte. Se borran los datos personales del usuario; los escaneos quedan en la empresa, dueña de esos comprobantes. Indicarlo en la política.
- **URL para solicitar eliminación de datos (Google la pide):** `https://[DOMINIO]/legal/privacidad` (con la sección de eliminación) o una página específica.
- **Seguimiento / publicidad:** ninguna. Declarar que la app no contiene anuncios.
- **Compras dentro de la app:** ninguna. La app no tiene sistema de pago.
