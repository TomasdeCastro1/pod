# Notas para los revisores de App Store y Google Play

Texto para pegar en «Notas de revisión» (Apple) y «Instrucciones de acceso» (Google). Reemplazar los valores entre corchetes por los reales, que son los de las variables `REVIEW_EMAIL` y `REVIEW_CODE` del backend de producción.

## Preparación (una sola vez, antes de enviar)

1. Definir `REVIEW_EMAIL` y `REVIEW_CODE` en los Secrets del backend (por ejemplo `revision@[DOMINIO]` y un código de 6 dígitos).
2. Con `DATABASE_URL`, `REVIEW_EMAIL` y el almacenamiento configurados, correr `npm run seed:review -w server`. Es idempotente: se puede repetir sin duplicar nada. Crea el usuario, la empresa «Empresa Demo» (RUT válido) y 13 escaneos de ejemplo ya procesados, sin llamar a la IA.
3. Verificar en la app que el login con ese email y código entra y muestra la empresa demo.

## Texto de las notas

> La app inicia sesión con un código enviado por email. Para la revisión hay una cuenta de prueba con código fijo, que no necesita recibir ningún email:
>
> - Email: [REVIEW_EMAIL]
> - Código: [REVIEW_CODE]
>
> Qué probar:
> 1. Ingresar con el email y el código. Se abre la empresa «Empresa Demo», que ya tiene comprobantes de ejemplo.
> 2. En la pestaña de archivo, ver la lista de comprobantes (facturas, notas de crédito y devoluciones, con distintos niveles de conformidad y alertas), abrir uno para ver el detalle y la imagen, buscar y filtrar.
> 3. En la pestaña de escáner, sacar una foto (cualquier documento sirve para probar el flujo). El resultado de la lectura aparece en unos segundos.
> 4. En Perfil: ver la empresa, sus miembros y los enlaces a la política de privacidad y los términos de uso. «Eliminar cuenta» está en Perfil.
>
> Esta cuenta es solo para revisión. Eliminarla en la app anula su acceso hasta que se vuelva a correr el script de carga.
>
> El servicio es para empresas y se contrata y factura fuera de la aplicación; la app no tiene compras ni enlaces de pago.

## Notas internas

- Para restaurar la cuenta de revisión después de que un revisor la elimine, volver a correr `npm run seed:review -w server` (crea un usuario nuevo con el mismo email).
- La política de privacidad y los términos están en `/legal/privacidad` y `/legal/terminos` del backend; son borradores y hay que completarlos y revisarlos antes de enviar (T6.4 usa esas URLs).
