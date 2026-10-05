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

## Acceso para Google Play (App access)

En «Acceso a la app» elegir «Todo o algunas funciones están restringidas» y cargar las mismas credenciales (email y código de revisión) con la instrucción: «Ingresar con el email, escribir el código fijo en la pantalla de código. No se recibe ningún email.»

## Declaraciones de pagos y modelo de negocio

- **Apple, pregunta sobre compras/suscripciones:** la app no ofrece compras dentro de la app. Si el revisor pregunta (guideline 3.1.1 / 3.1.3), responder que es un servicio para empresas que se contrata y factura por fuera de la app, y que la app no muestra botones, enlaces ni textos que inviten a pagar. El argumento está desarrollado en `guideline-3.1.3.md` (interpretación pendiente de decisión de Francisco).
- **Google Play:** declarar que la app no tiene compras dentro de la app y no contiene anuncios.
- La pantalla «Uso y precio» del Perfil solo informa el consumo y el importe estimado, con la leyenda «El importe se factura una vez por mes, por fuera de la app». No tiene ningún botón de pago.
- **Permisos:** cámara (escanear comprobantes) y ubicación opcional (registrar dónde se fotografió). Ambos con texto explicativo en español.
- **Cifrado (exportación):** `ITSAppUsesNonExemptEncryption` está en `false` (solo HTTPS estándar).
