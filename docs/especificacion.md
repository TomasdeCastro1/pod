# Especificación para Replit Agent — App de escaneo de comprobantes firmados

Oct 4, 2026 · @Francisco de Castro

## 1. Resumen del producto

Construir una app móvil para iOS y Android con la que un proveedor fotografía los comprobantes firmados en cada entrega y la app extrae los datos automáticamente, usando el QR de DGI (Uruguay) y un modelo de IA. Se cobra por cada 1.000 imágenes procesadas, y el precio sube según cuántos campos opcionales lee el sistema.

La app tiene tres pantallas: Escanear (se abre directo al iniciar), Archivo y Perfil (con soporte para varias empresas). No se conecta con ningún sistema de facturación: todo sale de la imagen y del QR.

Cómo usar este documento con Replit Agent: construir por etapas, en el orden de la sección 14, y no pasar a la siguiente hasta cumplir sus criterios de aceptación. Las fotos reales de prueba van en la carpeta /samples del proyecto.

Cliente piloto: Punto Sano SRL (RUT 219419590017), proveedor de alimentos que entrega a supermercados, kioscos, cantinas y estaciones de servicio. Genera unos 10.000 comprobantes por año.

Tipos de documento que la app debe reconocer (todos aparecen en las fotos de muestra):

| Documento | Quién lo emite | Formato | QR de DGI |
|---|---|---|---|
| e-Factura (contado o crédito) | La empresa usuaria (ej. Punto Sano) | Papel térmico de 80 mm, largo y angosto | Sí |
| Nota de devolución (ej. Devoto) | El cliente | Hoja A4 impresa | No |
| Egreso de mercadería a proveedor (ej. El Dorado) | El cliente | Papel de imprenta autorizada | No (tiene un QR que no es de DGI) |
| e-Remito de devolución (ej. Frog / Ussel S.A.) | El cliente | Hoja A4 | Sí. Es una devolución aunque el tipo de traslado diga «Venta» |

Principios de diseño:

- Lo más simple posible para el repartidor: abrir, apuntar, listo.
- La IA solo lee los campos que la empresa tiene activados; todo lo que sale del QR no se le pide a la IA.
- La alerta de «comprobante sin firma» tiene que llegar en el momento, mientras el repartidor sigue en el local.

## 2. Alcance de la versión 1

La versión 1 escanea, extrae, alerta y archiva; no concilia ni cobra dentro de la app.

Incluido:

- Escáner con detección de bordes y recorte automático en el celular.
- Lectura del QR de DGI en el servidor.
- Extracción con IA de los campos base más los campos opcionales que active cada empresa.
- Alerta inmediata cuando el comprobante no tiene firma o la firma es dudosa.
- Archivo con búsqueda, filtros, detalle, corrección manual de campos y exportación a CSV.
- Varias empresas por usuario y varios usuarios por empresa (invitación con código).
- Configuración de campos a leer, con el precio por 1.000 imágenes actualizado en vivo.
- Medición de uso mensual por empresa.
- Cola local cuando no hay señal: la foto se envía sola al volver la conexión.
- Publicación en App Store y Google Play.

Fuera de la versión 1:

- Conexión con sistemas de facturación o ERP.
- Pagos dentro de la app. El servicio se factura a las empresas por fuera.
- Conciliación de cuenta corriente, notas de crédito y valorización de devoluciones.
- Agrupar varios RUT de una misma cadena (ej. los dos RUT de Devoto).
- Tabla de equivalencias de productos entre cadenas.
- Procesamiento por lotes nocturno (Batch API).
- Panel web de administración: los precios se editan directo en la base de datos o por un endpoint protegido.

## 3. Stack técnico y arquitectura

App en Expo (React Native) con TypeScript; backend Node.js en Replit con PostgreSQL y almacenamiento de objetos; IA con la API de Anthropic llamada solo desde el servidor.

App móvil:

| Necesidad | Librería |
|---|---|
| Base | Expo (React Native) + TypeScript + Expo Router con 3 pestañas |
| Escáner con recorte automático | react-native-document-scanner-plugin (usa VisionKit en iOS y ML Kit Document Scanner en Android: detecta bordes, recorta y corrige perspectiva en el celular, sin costo) |
| Redimensionar antes de subir | expo-image-manipulator |
| Cola sin conexión | expo-file-system + expo-sqlite + @react-native-community/netinfo |
| Ubicación (opcional) | expo-location |
| Vibración en alertas | expo-haptics |
| Compartir imagen y CSV | expo-sharing |
| Build y publicación | EAS Build y EAS Submit |

El escáner nativo no funciona en Expo Go: hay que usar un development build de EAS desde el principio. Si el plugin del escáner diera problemas, la alternativa es expo-camera con un marco guía en pantalla y recorte en el servidor.

Backend (Replit):

| Necesidad | Herramienta |
|---|---|
| Servidor | Node.js + TypeScript + Express |
| Base de datos | PostgreSQL de Replit con Drizzle ORM |
| Imágenes | Replit Object Storage |
| Redimensionar y miniaturas | sharp |
| Lectura de QR | zxing-wasm |
| IA | @anthropic-ai/sdk |
| Validación de datos | zod |
| Envío de códigos de login por email | Resend (o similar) |

Secrets de Replit: ANTHROPIC_API_KEY, DATABASE_URL, JWT_SECRET, RESEND_API_KEY, ADMIN_TOKEN. La clave de Anthropic nunca se incluye en la app.

Login: email + código de 6 dígitos (sin contraseña). Sin login con Google o Apple en la versión 1; así no es obligatorio implementar «Sign in with Apple».

Recorrido de una foto: App → API del backend (HTTPS) → Object Storage (guarda la imagen) → lector de QR → API de Anthropic → PostgreSQL (guarda el resultado) → App (consulta el resultado).

## 4. Pantallas

Tres pestañas abajo: Escanear (la que se abre al iniciar), Archivo y Perfil. Arriba de todo se ve el nombre de la empresa activa; tocándolo se cambia de empresa.

Primera vez: login por email y código → crear empresa (nombre + RUT) o unirse con un código de invitación → pedido de permiso de cámara → escáner. Desde la segunda vez, la app abre directo en el escáner.

### 4.1 Escanear

- Al abrir la app se muestra el escáner a pantalla completa, sin pasos previos.
- El escáner detecta los bordes del papel y dispara solo cuando el documento está estable; también hay un botón manual.
- Se pueden escanear varios comprobantes seguidos. Cada foto es un comprobante independiente.
- Después de cada captura aparece una miniatura en una tira inferior con el estado «Procesando…». El repartidor puede seguir escaneando mientras tanto.
- Cuando llega el resultado, la miniatura se convierte en una tarjeta con: tipo, cliente, número, total y un indicador de conformidad con color:
  - Verde: completa (firma + sello o aclaración).
  - Amarillo: firma sola.
  - Naranja: dudosa.
  - Rojo: sin firma.
- Si el resultado es sin firma o dudosa, aparece una alerta roja a pantalla completa con vibración: «Este comprobante no tiene una firma válida. Pedí la firma y volvé a escanearlo». Botones: «Volver a escanear» (reemplaza la foto anterior) y «Guardar igual».
- Si no se pudo leer el documento: «No se pudo leer el comprobante. Probá con más luz y el papel estirado», con botón para volver a escanear.
- Sin conexión, la tarjeta dice «Pendiente de envío» y se procesa sola al volver la señal.

### 4.2 Archivo

- Lista de comprobantes de la empresa activa, del más reciente al más antiguo. Cada fila: miniatura, tipo (Factura / Devolución / Otro), cliente, número, fecha, total, indicador de conformidad e ícono si está «a revisar».
- Búsqueda por texto: cliente, número, RUT, texto del sello.
- Filtros: tipo, nivel de conformidad, solo «a revisar», rango de fechas.
- Detalle de un comprobante:
  - Imagen con zoom.
  - Todos los campos leídos (solo los que estaban activos al escanear).
  - Editar cualquier campo. La corrección se guarda aparte; el valor leído por la IA no se pisa.
  - Marcar como revisado.
  - Compartir la imagen.
  - Eliminar (solo administradores).
- Exportar a CSV lo que esté filtrado, con la hoja de compartir del sistema.

### 4.3 Perfil

- Usuario: nombre y email.
- Mis empresas: lista con la activa marcada; tocar una la activa. Botones «Agregar empresa» (nombre + RUT, se valida el dígito verificador) y «Unirme con código».
- Configuración de cada empresa (los miembros la ven, solo los administradores la editan):
  - Datos: nombre y RUT.
  - Campos a leer: ver más abajo.
  - Uso y precio: imágenes procesadas este mes, precio vigente por 1.000 imágenes, importe estimado del mes e historial de los últimos 6 meses.
  - Miembros: lista con rol (administrador / miembro), código de invitación de 6 caracteres que se puede regenerar, quitar miembros.
- Cerrar sesión.
- Eliminar cuenta (obligatorio para App Store).
- Enlaces a política de privacidad y términos.

Pantalla «Campos a leer»:

- Arriba, fijo: «Precio actual: USD XX por 1.000 imágenes». Se actualiza en vivo al prender o apagar campos.
- Campos agrupados por sección (ver catálogo en la sección 7).
- Los campos base aparecen marcados, bloqueados y con la etiqueta «Incluido».
- Cada campo opcional tiene un interruptor y su precio: «+USD 2 / 1.000».
- Al guardar, confirmación: «El nuevo precio aplica a los comprobantes que se escaneen desde ahora».

## 5. Flujo de procesamiento de una foto

Objetivo de tiempo, desde que termina la subida: factura en menos de 3 segundos, devolución en menos de 8.

En el celular:

- El escáner entrega la imagen ya recortada y enderezada.
- Redimensionar a 1.600 px en el lado largo, JPEG calidad 80 (unos 120–150 KB una factura térmica, unos 300 KB una hoja A4).
- Generar un client_id (UUID) y guardar en la cola local: imagen, empresa activa, fecha y hora de captura, ubicación si hay permiso.
- Subir con POST /companies/:id/scans. La subida es idempotente por client_id: si se reintenta, no se duplica ni se cobra dos veces.
- Consultar GET /scans/:id cada 1,5 segundos hasta tener resultado (máximo 30 segundos; después se muestra «Procesando» y se actualiza en el Archivo).

En el servidor:

- Guardar la imagen en Object Storage como {company_id}/{aaaa}/{mm}/{scan_id}.jpg y una miniatura de 300 px como {scan_id}_thumb.jpg.
- Buscar un QR con zxing-wasm sobre la imagen de 1.600 px. Si es de DGI, parsearlo (sección 6). Si no hay QR o no es de DGI, seguir sin datos de QR.
- Preclasificar con el QR:
  - QR de DGI con RUT emisor igual al RUT de la empresa → factura_emitida (o nota_credito_emitida según el tipo de CFE).
  - QR de DGI con otro RUT emisor → devolucion_cliente (caso e-Remito de Frog).
  - Sin QR de DGI → la IA clasifica.
- Preparar la imagen para la IA:
  - Factura preclasificada (térmica, angosta): 1.000 px en el lado largo.
  - Cualquier otro caso: máximo 1.568 px en el lado largo y 1,15 megapíxeles.
  - JPEG calidad 85. Esta copia no se guarda.
- Armar el prompt con los campos activos de la empresa para ese tipo de documento (sección 8) y llamar al modelo primario.
- Validar la respuesta (sección 9). Si no pasa, escalar una vez al modelo secundario.
- Combinar datos del QR + datos de la IA, guardar el resultado, los tokens usados, el costo real y el precio vigente. Estado final: listo, revisar o error.

Regla de cobro: cuenta como imagen procesada todo escaneo que termina en listo o revisar. No cuentan los errores, los reintentos de subida ni las llamadas de escalado.

## 6. Lectura del QR de DGI

El QR de los comprobantes electrónicos (CFE) da gratis y sin errores seis datos: RUT emisor, tipo de CFE, serie, número, total y fecha. Cuando el QR existe, esos datos no se le piden a la IA.

Formato esperado (confirmarlo con las fotos de /samples antes de cerrar el parser):

```
https://www.efactura.dgi.gub.uy/consultaQR/cfe?<RUT emisor>,<tipo CFE>,<serie>,<número>,<total>,<fecha dd/mm/aaaa>,<hash>
```

Reglas del parser:

- Aceptar como QR de DGI solo si el host contiene dgi.gub.uy. Cualquier otro QR (como el del remito de El Dorado) se ignora.
- Decodificar la URL y separar los parámetros por coma después del ?.
- Ser tolerante: si cambia el orden o falta algún parámetro, guardar lo que se pueda y marcar qr_parcial = true.
- Validar el dígito verificador del RUT emisor (sección 9).
- Guardar siempre el texto completo del QR (qr_raw) y lo parseado (qr_data).

Tipos de CFE (verificar contra la documentación de DGI; un código desconocido se guarda como «otro CFE»):

| Código | Comprobante |
|---|---|
| 101 | e-Ticket |
| 102 | Nota de crédito de e-Ticket |
| 103 | Nota de débito de e-Ticket |
| 111 | e-Factura |
| 112 | Nota de crédito de e-Factura |
| 113 | Nota de débito de e-Factura |
| 181 | e-Remito |
| 182 | e-Resguardo |

Casos de prueba con las muestras:

- e-Factura A 6129 de Punto Sano a Bowerey SA: RUT emisor 219419590017, total 1.727,91, fecha 24/09/2026.
- e-Remito S 2213900 de Frog (Ussel S.A.) a Punto Sano: RUT emisor 214214350013, fecha 02/10/2026. Debe preclasificarse como devolución.

## 7. Catálogo de campos

El precio base (sugerido USD 40 por 1.000 imágenes) incluye los campos base; cada campo opcional activado suma entre USD 1 y USD 3 por 1.000. Con todo activado, el precio llega a USD 76 por 1.000.

El catálogo vive en la tabla field_catalog (sección 10) y se carga con un seed a partir de estas tablas. Los precios se cambian en la base de datos, sin publicar una versión nueva de la app.

### 7.1 Campos base (incluidos en el precio base)

| Clave | Campo | Aplica a | De dónde sale | Instrucción para la IA |
|---|---|---|---|---|
| tipo_documento | Tipo de documento | Todos | QR; IA si no hay QR | factura_emitida, nota_credito_emitida, devolucion_cliente, otro o no_reconocido |
| rut_emisor | RUT emisor | Todos | QR; IA si no hay QR | 12 dígitos, solo números |
| tipo_cfe | Tipo de CFE | Solo CFE | QR | — |
| serie | Serie | Todos | QR; IA si no hay QR | Letra(s) de la serie |
| numero | Número | Todos | QR; IA si no hay QR | En devoluciones: «Nro documento» o número del remito |
| fecha_documento | Fecha | Todos | QR; IA si no hay QR | Fecha de emisión en formato AAAA-MM-DD |
| total | Total | Facturas | QR; IA si no hay QR | Número con punto decimal |
| cliente_rut | RUT del cliente | Todos | IA (en devoluciones con QR, sale del QR) | En facturas: RUT del receptor. En devoluciones: RUT de quien devuelve |
| cliente_nombre | Cliente | Todos | IA | Razón social o nombre principal del cliente |
| local | Local o sucursal | Todos | IA | Local o sucursal del cliente (ej. «Kinko», «Portones», «Frog 2») |
| conformidad_nivel | Conformidad | Todos | IA | completa, firma_sola, dudosa o sin_firma (definiciones en la sección 8) |
| sello_texto | Texto del sello | Todos | IA | Todo el texto legible del sello |
| notas_manuscritas | Notas a mano | Todos | IA | Textos escritos a mano que no sean la firma (ej. «faltaron 2») |
| items[]: codigo, descripcion, cantidad | Productos devueltos | Devoluciones | IA | Una entrada por línea; codigo = el código que aparezca en la línea |
| revisar | A revisar | Todos | IA | Lista de campo + motivo breve, solo si algo es dudoso |

Metadatos sin costo de IA: fecha y hora de captura, usuario que escaneó, ubicación (si hay permiso), imagen y miniatura.

Costo estimado de los campos base con Haiku 4.5: USD 1,85 por 1.000 facturas y USD 3,60 por 1.000 devoluciones. Con 15 % de devoluciones y 10 % de escalado al modelo secundario, unos USD 2,50 por 1.000 imágenes.

### 7.2 Campos opcionales

Costo IA = costo extra estimado con Haiku 4.5 por 1.000 documentos del tipo correspondiente (por el aviso de la instrucción en el prompt más los tokens de salida). Si el documento se escala al modelo secundario, ese costo se multiplica por 3.

| Grupo | Clave | Campo | Aplica a | Instrucción para la IA | Costo IA (USD/1.000) | Precio (USD/1.000) |
|---|---|---|---|---|---|---|
| Pago y referencias | forma_pago | Forma de pago | Facturas | contado o credito | 0,07 | +1 |
| Pago y referencias | fecha_vencimiento | Vencimiento de pago | Facturas | Línea «Vencimiento:» debajo de la fecha de emisión. Nunca la fecha de vencimiento del CAE | 0,09 | +2 |
| Pago y referencias | orden_compra | Orden de compra | Facturas | «Número de compra», «OC» u «Orden de compra» | 0,09 | +1 |
| Pago y referencias | moneda | Moneda | Facturas | Código de moneda (ej. UYU, USD) | 0,07 | +1 |
| Totales | subtotal | Subtotal | Facturas | Subtotal impreso | 0,08 | +1 |
| Totales | iva | IVA | Facturas | Monto de IVA impreso | 0,08 | +1 |
| Totales | descuento_pct | Descuento % | Facturas | Porcentaje de descuento impreso | 0,07 | +1 |
| Totales | descuento_monto | Descuento $ | Facturas | Monto de descuento impreso, en positivo | 0,08 | +1 |
| Productos de la factura | fact_item_codigo | Código de producto | Facturas | Código de cada línea (ej. BR1, BPO1) | 0,18 | +2 |
| Productos de la factura | fact_item_descripcion | Descripción | Facturas | Texto de cada línea, tal como está | 0,36 | +3 |
| Productos de la factura | fact_item_cantidad | Cantidad | Facturas | Cantidad de cada línea | 0,16 | +2 |
| Productos de la factura | fact_item_precio_unitario | Precio unitario | Facturas | Precio unitario de cada línea | 0,20 | +2 |
| Productos de la factura | fact_item_importe | Importe de línea | Facturas | Importe de cada línea | 0,20 | +2 |
| Detalle de devoluciones | dev_item_ean | EAN | Devoluciones | Código de barras de 13 dígitos de cada línea | 0,24 | +2 |
| Detalle de devoluciones | dev_item_codigo_cliente | Código de la cadena | Devoluciones | Código interno del cliente en cada línea | 0,18 | +1 |
| Detalle de devoluciones | dev_item_codigo_proveedor | Código del proveedor | Devoluciones | «Referencia proveedor» u otro código del proveedor en cada línea | 0,15 | +1 |
| Detalle de devoluciones | dev_motivo | Motivo | Devoluciones | Motivo de la devolución si figura | 0,08 | +1 |
| Detalle de devoluciones | dev_estado | Estado | Devoluciones | Estado impreso (ej. «Devolu enviado») | 0,08 | +1 |
| Detalle de devoluciones | dev_plazo_retiro_dias | Plazo de retiro | Devoluciones | Días que el documento da para retirar la mercadería | 0,07 | +2 |
| Detalle de devoluciones | dev_exige_nota_credito | Exige nota de crédito | Devoluciones | true si pide al proveedor emitir nota de crédito | 0,07 | +1 |
| Datos del cliente | cliente_razon_social | Razón social | Todos | Razón social completa | 0,12 | +1 |
| Datos del cliente | cliente_nombre_comercial | Nombre comercial | Todos | Nombre de fantasía si es distinto | 0,09 | +1 |
| Datos del cliente | cliente_direccion | Dirección | Todos | Dirección del cliente o del local | 0,12 | +1 |
| Conformidad detallada | firma_nombre | Quién firmó | Todos | Nombre de la persona según sello o aclaración | 0,09 | +1 |
| Conformidad detallada | firma_cargo | Cargo | Todos | Cargo según sello o aclaración (ej. «Jefe de local») | 0,07 | +1 |
| Conformidad detallada | sello_fecha | Fecha del sello | Todos | Fecha que figure en el sello | 0,09 | +1 |
| Conformidad detallada | marcas_control | Tildes de control | Todos | true si hay tildes o marcas junto a los productos | 0,07 | +1 |

Nota sobre el margen: el costo real de cada campo opcional es de centavos por 1.000 imágenes. El precio se fija por el valor que aporta, no por el costo. Los precios de esta tabla son sugerencias para editar.

## 8. Prompt dinámico para la IA

El system prompt se arma en cada llamada con tres partes: un texto fijo, la lista de campos activos para ese tipo de documento y la instrucción de formato. Así la IA solo lee y escribe lo que la empresa paga.

### 8.1 Texto fijo (BASE_PROMPT)

Reemplazar {EMPRESA_NOMBRE} y {EMPRESA_RUT} con los datos de la empresa activa.

```
Sos un sistema que extrae datos de comprobantes comerciales uruguayos para {EMPRESA_NOMBRE} (RUT {EMPRESA_RUT}), un proveedor que entrega mercadería a comercios.

Recibís la foto de UN documento. Respondé solo con un objeto JSON, sin texto antes ni después y sin bloques de código.

DOCUMENTO
- La foto puede incluir otros papeles. Leé solo el documento principal: el más completo y centrado. Nunca mezcles datos de dos documentos.
- La foto puede estar rotada o invertida. Leela igual.

TIPOS DE DOCUMENTO
- factura_emitida: comprobante emitido por el RUT {EMPRESA_RUT} a un cliente.
- nota_credito_emitida: nota de crédito emitida por el RUT {EMPRESA_RUT}.
- devolucion_cliente: documento emitido por un cliente donde {EMPRESA_NOMBRE} figura como proveedor o receptor y se le devuelve mercadería. Incluye notas de devolución, egresos de mercadería a proveedor y e-Remitos emitidos por un cliente, aunque el tipo de traslado diga «Venta».
- otro: cualquier otro documento.
- no_reconocido: ilegible o no es un comprobante.

REGLAS
- No inventes. Si un dato no se lee con seguridad, omitilo y agregalo a revisar.
- Copiá los valores tal como están impresos. No calcules totales, descuentos ni IVA.
- Números en formato uruguayo: 1.416,32 se escribe 1416.32. En remitos, 3,000 significa 3.
- Fechas en formato AAAA-MM-DD. RUT: 12 dígitos, solo números.
- Ignorá la «Fecha de vencimiento» del recuadro del CAE y la «Fecha emisor»: no son fechas del documento.
- No extraigas datos bancarios.

CONFORMIDAD
- completa: firma manuscrita y además un sello o aclaración que identifica el local o la persona.
- firma_sola: firma manuscrita clara, sin sello ni aclaración.
- dudosa: solo un trazo, una raya o una marca que no parece una firma.
- sin_firma: no hay firma ni sello.

REVISAR
- revisar: lista de objetos {campo, motivo}, solo para valores dudosos (ilegible, tapado por un sello, letra ambigua).
```

### 8.2 Campos activos

Agregar al final del system prompt:

```
CAMPOS A EXTRAER
- <clave>: <instrucción>
- <clave>: <instrucción>

...

FORMATO
Un único objeto JSON compacto, sin espacios ni saltos de línea, solo con las claves de CAMPOS A EXTRAER más revisar. Omití las claves sin valor. Si hay productos, van en items como lista de objetos con las claves de producto activas.
```

- Las claves e instrucciones salen de field_catalog: campos base que la IA debe leer + opcionales activos de la empresa, filtrados por el tipo de documento.
- Si el QR ya dio un dato (RUT emisor, serie, número, fecha, total), ese campo no se incluye.
- Si el tipo no está preclasificado, se incluyen los campos de facturas y de devoluciones, y tipo_documento.

### 8.3 Mensaje de usuario

Contenido: la imagen (base64, JPEG) y después un texto con el contexto:

```
Tipo preclasificado por QR: factura_emitida
Datos ya leídos del QR, no los extraigas: serie A, número 6204, total 1994.94, fecha 2026-10-01
```

Si no hay QR, el texto es: «Sin QR de DGI: clasificá el documento».

### 8.4 Parámetros de la llamada

- Modelo: MODEL_PRIMARY (por defecto claude-haiku-4-5-20251001).
- temperature: 0.
- max_tokens: 150 + 2 × la suma de est_out_tokens de los campos pedidos, con tope de 1.500.
- No usar tool use para forzar el JSON: agrega unos 500 tokens ocultos por llamada.
- No usar caché del prompt: con Haiku 4.5 hace falta un mínimo de 4.096 tokens y este prompt tiene menos de 1.000.

Ejemplo de respuesta esperada (e-Factura A 6204 a Mercados Devoto, campos base, con QR leído):

```
{"cliente_rut":"210650500016","cliente_nombre":"MERCADOS DEVOTO S A","local":"LOC. 2, RIVERA 3482","conformidad_nivel":"completa","sello_texto":"JONATHAN MOROTTO JEFE DE LOCAL"}
```

## 9. Validaciones, escalado y alertas

Cada respuesta de la IA pasa por validaciones automáticas; si falla, se reprocesa una sola vez con un modelo más preciso, y si sigue fallando queda «a revisar» para una persona.

### 9.1 Validaciones

- JSON válido y con la forma esperada (esquema zod armado con los campos pedidos). Si no se puede parsear, reintentar una vez con el mismo modelo.
- Dígito verificador del RUT en todo RUT leído. Algoritmo: multiplicar los primeros 11 dígitos por los pesos 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2 y sumar; dígito = 11 − (suma mod 11). Si da 11, el dígito es 0; si da 10, el RUT es inválido. Comprobado con 219419590017 (Punto Sano) y 216981070018 (Bowerey SA).
- QR contra imagen: si la IA leyó un dato que también vino en el QR, deben coincidir. Si no coinciden, gana el QR y se agrega a revisar.
- Tipo contra QR: si el QR dice que el emisor es la empresa, el documento es factura o nota de crédito aunque la IA diga otra cosa.
- Aritmética (solo si están activos los importes de línea y los totales): suma de importes − descuento = subtotal, y subtotal + IVA = total, con tolerancia de ±0,05. Si no cierra, se marca revisar (puede haber productos con IVA mínimo).
- Cantidades de productos: números positivos.

### 9.2 Escalado al modelo secundario

Se reprocesa con MODEL_SECONDARY (por defecto claude-sonnet-5) cuando ocurre cualquiera de estos casos:

- El JSON sigue inválido después del reintento.
- Un RUT no pasa el dígito verificador.
- revisar no está vacío.
- conformidad_nivel es dudosa.
- Es una devolución sin QR de DGI y la variable ROUTE_PAPER_RETURNS_TO_SECONDARY está en true (por defecto false; activarla si las pruebas muestran que Haiku lee mal esas hojas).

Se escala una sola vez. Si después del escalado algo sigue dudoso, el estado queda revisar.

### 9.3 Alertas en la app

| Situación | Mensaje | Acción |
|---|---|---|
| sin_firma o dudosa (después del escalado) | «Este comprobante no tiene una firma válida. Pedí la firma y volvé a escanearlo» | Alerta roja a pantalla completa + vibración |
| no_reconocido | «No se pudo leer el comprobante. Probá con más luz y el papel estirado» | Botón para volver a escanear |
| revisar con otros campos | Ícono de «a revisar» en la tarjeta y en el Archivo | Sin interrumpir al repartidor |
| Error del servidor | «No pudimos procesarlo, lo reintentamos solo» | Reintento automático |

### 9.4 Modelos y precios (configurables)

Tabla model_prices, en USD por millón de tokens (verificar los precios vigentes antes de lanzar):

| Modelo | Entrada | Salida |
|---|---|---|
| claude-haiku-4-5-20251001 | 1,00 | 5,00 |
| claude-sonnet-5 | 3,00 | 15,00 |

El costo real de cada escaneo se calcula con el usage que devuelve la API (tokens de entrada y salida) de todas las llamadas de ese escaneo, incluido el escalado.

## 10. Modelo de datos

Diez tablas en PostgreSQL. Los datos leídos se guardan completos en JSON y los más usados también en columnas propias, para buscar y filtrar rápido.

| Tabla | Columnas | Notas |
|---|---|---|
| users | id, email (único), nombre, created_at, deleted_at | Borrado lógico al eliminar la cuenta, más borrado de datos personales |
| otp_codes | email, code_hash, expires_at (10 min), attempts | Máximo 5 intentos por código |
| companies | id, nombre, rut, invite_code (único, 6 caracteres), created_at | RUT validado con dígito verificador |
| memberships | user_id, company_id, role (admin / miembro), created_at | Clave primaria (user_id, company_id). Quien crea la empresa es admin |
| field_catalog | key, label, group, doc_types (lista), is_base, source (qr_o_ia / ia), instruction, is_item_field, est_in_tokens, est_out_tokens, price_per_1000_usd, sort_order, active | Se carga con el seed de la sección 7 |
| company_fields | company_id, field_key, enabled, updated_by, updated_at | Solo campos opcionales; los base siempre están activos |
| price_settings | base_price_per_1000_usd (40), currency (USD), updated_at | Una sola fila |
| model_prices | model, input_per_mtok_usd, output_per_mtok_usd | Sección 9.4 |
| scans | Ver detalle abajo | Un registro por comprobante escaneado |
| audit_log | id, company_id, user_id, action, detail (JSON), created_at | Cambios de campos, correcciones, borrados |

Columnas de scans:

- Identificación: id, client_id (único), company_id, user_id.
- Captura: captured_at, uploaded_at, lat, lng.
- Archivos: image_key, thumb_key.
- Estado: status (procesando / listo / revisar / error), error_message.
- QR: qr_raw, qr_data (JSON), qr_parcial.
- Resultado: doc_type, extracted (JSON con todo lo leído), corrections (JSON con lo editado a mano), fields_requested (lista de claves pedidas).
- Columnas para buscar: cliente_rut, cliente_nombre, local, numero, serie, fecha_documento, total, conformidad_nivel, sello_texto.
- Costo y precio: model_used, escalated, input_tokens, output_tokens, ai_cost_usd, price_per_1000_snapshot.
- Revisión: reviewed_by, reviewed_at, deleted_at.

Índices: (company_id, captured_at descendente), cliente_rut, numero, conformidad_nivel, y búsqueda de texto sobre cliente_nombre, local y sello_texto.

Regla de lectura: el valor que se muestra es el de corrections si existe; si no, el de extracted.

## 11. API del backend

API REST en JSON. Todo endpoint, salvo los de login, exige Authorization: Bearer <JWT> y verifica que el usuario sea miembro de la empresa que consulta.

| Método | Ruta | Qué hace | Quién |
|---|---|---|---|
| POST | /auth/request-code | Envía un código de 6 dígitos al email | Público |
| POST | /auth/verify | Valida el código y devuelve JWT (30 días) + usuario | Público |
| GET | /me | Usuario y sus empresas con rol | Usuario |
| DELETE | /me | Elimina la cuenta y sus datos personales | Usuario |
| GET | /companies | Empresas del usuario | Usuario |
| POST | /companies | Crea empresa (nombre + RUT); el creador queda como admin | Usuario |
| POST | /companies/join | Se une con código de invitación | Usuario |
| PATCH | /companies/:id | Edita nombre y RUT | Admin |
| POST | /companies/:id/invite-code | Regenera el código de invitación | Admin |
| GET | /companies/:id/members | Lista miembros | Miembro |
| PATCH / DELETE | /companies/:id/members/:userId | Cambia rol o quita miembro | Admin |
| GET | /companies/:id/fields | Catálogo con base, opcionales (activo sí/no y precio) y precio total por 1.000 | Miembro |
| PUT | /companies/:id/fields | Guarda la lista de opcionales activos; devuelve el nuevo precio | Admin |
| POST | /companies/:id/scans | Sube una imagen (multipart: image, client_id, captured_at, lat, lng); devuelve scan_id y estado | Miembro |
| GET | /scans/:id | Estado y resultado de un escaneo | Miembro |
| GET | /companies/:id/scans | Lista con búsqueda y filtros (q, type, conformidad, revisar, from, to) y paginación por cursor | Miembro |
| GET | /companies/:id/scans.csv | CSV con los mismos filtros | Miembro |
| PATCH | /scans/:id | Guarda correcciones o marca como revisado | Miembro |
| DELETE | /scans/:id | Borrado lógico | Admin |
| GET | /scans/:id/image y /scans/:id/thumb | URL firmada que vence en 5 minutos | Miembro |
| GET | /companies/:id/usage?month=AAAA-MM | Imágenes procesadas, precio vigente e importe estimado del mes | Miembro |
| GET | /admin/usage | Uso, costo IA real y precio cobrado por empresa y mes | ADMIN_TOKEN |
| PUT | /admin/field-catalog/:key | Cambia precio, instrucción o estado de un campo | ADMIN_TOKEN |
| PUT | /admin/price-settings | Cambia el precio base | ADMIN_TOKEN |

Notas:

- El costo IA real nunca se muestra a los clientes; solo el precio.
- POST /companies/:id/scans es idempotente: con un client_id repetido devuelve el escaneo existente.
- Límite de tamaño de subida: 5 MB por imagen.
- Límite de uso por IP en los endpoints de login para evitar abuso.

## 12. Precio por 1.000 imágenes y medición de uso

Cada empresa paga por imagen procesada según el precio vigente en el momento de escanear: precio base más la suma de los campos opcionales que tenga activos.

```
\text{precio por 1.000} = \text{precio base} + \sum \text{precio de cada campo opcional activo}
```

Reglas:

- Cada escaneo guarda el precio vigente en price_per_1000_snapshot. Si la empresa cambia los campos a mitad de mes, los escaneos anteriores mantienen su precio.
- Importe del mes = suma de price_per_1000_snapshot / 1.000, solo de escaneos en estado listo o revisar de ese mes.
- No se cobran: errores, reintentos de subida (mismo client_id), llamadas de escalado ni reintentos internos.
- Un comprobante que se vuelve a escanear después de una alerta de «sin firma» cuenta como una imagen nueva.
- El cobro se hace por fuera de la app, con una factura mensual a la empresa. La app no tiene botones ni enlaces de pago.

Ejemplo: Punto Sano activa vencimiento de pago (+2), orden de compra (+1) y plazo de retiro (+2). Precio: 40 + 5 = USD 45 por 1.000. Con unas 830 imágenes al mes, el importe es de unos USD 37 por mes.

Pantalla «Uso y precio» del Perfil:

- Imágenes procesadas este mes.
- Precio vigente por 1.000.
- Importe estimado del mes hasta hoy.
- Historial de los últimos 6 meses (imágenes e importe).

Monitoreo interno (endpoint /admin/usage): por empresa y mes, imágenes, costo IA real, porcentaje escalado, porcentaje «a revisar» y margen. Sirve para ajustar precios y detectar si un cliente tiene fotos de mala calidad que encarecen el procesamiento.

## 13. Publicación en tiendas, seguridad y privacidad

Apple y Google rechazan apps que no cumplen ciertos requisitos básicos; estos tienen que estar implementados desde la etapa 5, no al final.

### 13.1 App Store y Google Play

- Cuentas: Apple Developer Program (USD 99 por año) y Google Play Console (USD 25, pago único).
- Identificador de la app: uy.<empresa>.<app> (definir antes del primer build; no se puede cambiar después).
- Build y envío: EAS Build y EAS Submit. Probar primero con TestFlight (iOS) y prueba interna (Android).
- Textos de permisos en español:
  - Cámara: «Para fotografiar los comprobantes firmados en cada entrega».
  - Ubicación (opcional): «Para registrar dónde se fotografió cada comprobante».
- Eliminar cuenta desde la app: obligatorio en App Store.
- Política de privacidad en una URL pública, enlazada desde la app y las tiendas.
- Formularios de privacidad (App Privacy en Apple, Data Safety en Google): se recolecta email, fotos que sube el usuario, ubicación opcional y datos de uso. No se comparten con terceros para publicidad.
- Cuenta de prueba para los revisores: como el login es por código al email, crear un email de revisión con código fijo (solo para ese email) y una empresa de ejemplo con escaneos cargados. Se informa en las notas de revisión.
- Cobro fuera de la app: el servicio se contrata y factura a empresas por fuera. Antes de enviar, revisar la sección 3.1.3 de las App Review Guidelines de Apple (servicios para empresas) para confirmar que este esquema está permitido, y no mostrar botones ni enlaces de pago.
- Material de la ficha: ícono, capturas de pantalla de iPhone y Android, descripción en español, categoría «Negocios».

### 13.2 Seguridad

- Todo por HTTPS. JWT con vencimiento de 30 días.
- Toda consulta filtrada por membresía: un usuario nunca ve escaneos de una empresa a la que no pertenece.
- Imágenes privadas en Object Storage, servidas con URLs firmadas que vencen en 5 minutos.
- La clave de Anthropic y demás secretos solo en Replit Secrets.
- Los logs no guardan imágenes, códigos de login ni datos personales.
- Backup diario de la base de datos.

### 13.3 Privacidad

- Las fotos incluyen firmas, nombres de personas en sellos y datos bancarios en la adenda de las facturas. La IA no extrae datos bancarios, y solo los miembros de la empresa ven las imágenes.
- Tener en cuenta la Ley 18.331 de protección de datos personales de Uruguay al redactar la política de privacidad.
- Al eliminar una cuenta se borran los datos personales del usuario; los escaneos quedan en la empresa, que es la dueña de esos comprobantes.

## 14. Plan de construcción y criterios de aceptación

Seis etapas, en orden. Primero se prueba que la extracción funciona con fotos reales; recién después se construye la app alrededor.

- Backend y extracción, sin app. Base de datos, seed del catálogo, lector de QR, prompt dinámico, validaciones y escalado. Un script npm run test:samples procesa todas las fotos de /samples y compara con la tabla de abajo.
  - Acepta si: el tipo es correcto en 11 de 11; la conformidad es correcta en al menos 10 de 11; ningún comprobante sin firma queda como completa o firma_sola; los datos del QR coinciden con lo impreso; una factura tarda menos de 3 segundos en promedio.
- App base. Development build de Expo, login por código, crear o unirse a empresa, tres pestañas, escáner que sube y muestra la tarjeta con el resultado y las alertas.
  - Acepta si: desde que se abre la app hasta ver el resultado de una factura pasan menos de 10 segundos en un celular real.
- Archivo. Lista, búsqueda, filtros, detalle con zoom, corrección de campos, marcar revisado y exportar CSV.
- Perfil. Varias empresas, cambio de empresa activa, miembros e invitación, pantalla «Campos a leer» con el precio en vivo, pantalla «Uso y precio».
  - Acepta si: al activar un campo opcional, el siguiente escaneo lo trae y guarda el nuevo precio.
- Robustez y requisitos de tienda. Cola sin conexión, reintentos, eliminar cuenta, política de privacidad, cuenta de prueba para revisores.
  - Acepta si: con el celular en modo avión se escanean 3 comprobantes y se procesan solos al volver la señal, sin duplicados.
- Piloto y publicación. TestFlight y prueba interna de Android con 2 o 3 repartidores de Punto Sano durante 2 semanas; ajustes; envío a las tiendas.

### Resultados esperados con las fotos de muestra

Nombrar los archivos de /samples con el número de esta tabla (01.jpg a 11.jpg).

| # | Documento | Tipo esperado | Conformidad esperada | Productos (devoluciones) |
|---|---|---|---|---|
| 01 | e-Factura A 6129 a Bowerey SA (Kinko) | factura_emitida | completa (sello «BOWEREY S.A. JARDINES») | — |
| 02 | Egreso de mercadería de El Dorado (Polakof y Cía.) | devolucion_cliente | completa (sello Polakof y fecha) | 3 líneas: 16, 2 y 4 unidades |
| 03 | Nota de devolución Devoto B557402 (Portones) | devolucion_cliente | completa | 1 línea: 20 unidades |
| 04 | Nota de devolución Devoto B554954 (Solanas) | devolucion_cliente | completa | 2 líneas: 4 y 2 unidades |
| 05 | e-Factura A 6209 a Sidney SA | factura_emitida | dudosa | — |
| 06 | e-Factura A 6204 a Mercados Devoto | factura_emitida | completa (sello «Jonathan Morotto, Jefe de local») | — |
| 07 | e-Factura A 6195 a Cantina Saludable 2 | factura_emitida | firma_sola | — |
| 08 | e-Factura A 6182 a Porcelli (Molienda Costa Urbana) | factura_emitida | sin_firma | — |
| 09 | e-Remito Frog S 2213961 | devolucion_cliente | completa (sello Frog 06) | 1 línea: 7 unidades |
| 10 | e-Factura A 6184 a Pimentón SRL | factura_emitida | firma_sola | — |
| 11 | e-Remito Frog S 2213900 | devolucion_cliente | completa (sello Frog 2) | 3 líneas: 3, 4 y 4 unidades |

Antes del piloto, sumar al menos 40 fotos más de Punto Sano, de distintos locales y cadenas, con su resultado esperado cargado a mano.
