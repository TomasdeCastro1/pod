# Prueba de la cola sin conexión (T6.1)

Requiere un build `preview` instalado en el celular y sesión iniciada con una empresa activa.

1. Con señal, escaneá 1 comprobante: debe pasar a «Procesando…» y luego mostrar el resultado.
2. Activá el modo avión.
3. Escaneá 3 comprobantes distintos. Cada tarjeta de la tira muestra «Pendiente de envío» y
   aparece el aviso «Sin conexión: 3 comprobantes se enviarán solos».
4. (Opcional) Cerrá la app del todo (deslizá para sacarla de recientes) y volvé a abrirla en modo avión:
   las 3 tarjetas siguen ahí como pendientes.
5. Desactivá el modo avión. En pocos segundos las 3 tarjetas pasan a «Procesando…» y después al resultado.
   Si algún comprobante no tiene firma válida, sale el modal con vibración.
6. En la pestaña Archivo verificá que hay exactamente 3 comprobantes nuevos (más el del paso 1), sin duplicados.
7. Cierre de sesión con pendientes: en modo avión escaneá uno, andá a Perfil > Cerrar sesión; tras la
   confirmación habitual debe aparecer «Hay comprobantes sin enviar» con Cancelar / Cerrar sesión igual.
