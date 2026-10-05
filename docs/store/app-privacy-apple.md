# App Privacy (Apple): respuestas

Base: especificación §13.1 y §13.3. Verificar contra el formulario vigente al cargarlo.

**¿Recopilan datos de esta app?** Sí.

| Tipo de dato | ¿Se recopila? | Vinculado a la identidad | ¿Para seguimiento (tracking)? | Finalidad |
|---|---|---|---|---|
| Información de contacto: dirección de email | Sí | Sí | No | Funcionalidad de la app (inicio de sesión por código) |
| Fotos o videos: fotos (las que sube el usuario) | Sí | Sí | No | Funcionalidad de la app (lectura de comprobantes) |
| Ubicación: ubicación precisa (opcional, el usuario puede negarla) | Sí | Sí | No | Funcionalidad de la app (registrar dónde se fotografió) |
| Datos de uso: interacción con el producto (cantidad de imágenes procesadas) | Sí | Sí | No | Funcionalidad de la app y analítica interna (medición de uso para la facturación a la empresa) |
| Identificadores: ID de usuario | Sí | Sí | No | Funcionalidad de la app |

- **Seguimiento:** ningún dato se usa para seguimiento ni se comparte con terceros para publicidad. No hay SDK de publicidad.
- **Nota:** las fotos pueden incluir firmas y nombres en sellos; no se extraen datos bancarios.
- **Datos no recopilados:** contactos, compras, historial de navegación, salud, finanzas (la app no maneja pagos), mensajes.
- **Procesamiento con IA:** las imágenes se envían a un proveedor de IA (Anthropic) solo para extraer los datos; revisar que la política de privacidad lo mencione y que la respuesta «compartido con terceros» sea coherente (procesador de servicios, no publicidad).
- **URL de la política de privacidad:** `https://[DOMINIO]/legal/privacidad`
- **Eliminación:** la app tiene «Eliminar cuenta» en Perfil.
