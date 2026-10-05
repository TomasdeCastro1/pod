/** Páginas legales estáticas (decisión 10 del plan). Son BORRADORES: las revisa Francisco o un abogado. */

const DRAFT = 'BORRADOR: revisar antes de publicar';

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.55;max-width:46rem;margin:0 auto;padding:1rem 1rem 3rem;color:#1a1a1a;background:#fff}
h1{font-size:1.6rem}h2{font-size:1.15rem;margin-top:2rem}
.draft{background:#fff3cd;border:1px solid #e0c36a;padding:.75rem 1rem;border-radius:.5rem;font-weight:700}
@media (prefers-color-scheme:dark){body{background:#121212;color:#e8e8e8}.draft{background:#4a3f12;border-color:#8a7420}}
</style>
</head>
<body>
<p class="draft">${DRAFT}</p>
${body}
</body>
</html>
`;
}

export const PRIVACY_HTML = page(
  'Política de privacidad',
  `<h1>Política de privacidad</h1>
<p>Última actualización: [FECHA]</p>

<h2>1. Responsable</h2>
<p>El responsable del tratamiento de los datos personales es [RAZÓN SOCIAL], RUT [RUT DE LA EMPRESA], con domicilio en [DOMICILIO], Uruguay. Contacto: [EMAIL DE CONTACTO].</p>

<h2>2. Qué datos recolectamos</h2>
<ul>
<li><strong>Cuenta:</strong> tu email y, si lo cargás, tu nombre.</li>
<li><strong>Fotos de comprobantes:</strong> las imágenes que sacás o subís de facturas y devoluciones firmadas. Pueden incluir firmas, aclaraciones y sellos con nombres de personas, y datos del cliente que figuran en el comprobante.</li>
<li><strong>Datos leídos de los comprobantes:</strong> lo que el sistema extrae de cada foto (números, fechas, importes, nombre y RUT del cliente, texto del sello, etc.).</li>
<li><strong>Ubicación (opcional):</strong> las coordenadas del lugar donde se fotografió el comprobante, solo si le das permiso a la app.</li>
<li><strong>Datos de uso:</strong> cantidad de imágenes procesadas por empresa y mes, y registros técnicos mínimos para el funcionamiento y la seguridad del servicio.</li>
</ul>
<p>La inteligencia artificial no extrae datos bancarios de los comprobantes, aunque aparezcan impresos en la foto. Los registros técnicos no guardan imágenes, códigos de acceso ni datos personales.</p>

<h2>3. Para qué los usamos</h2>
<p>Para que puedas ingresar con tu email, digitalizar y archivar los comprobantes de tu empresa, verificar su conformidad (firmas y sellos), contabilizar el uso del servicio y mantenerlo seguro. No usamos tus datos para publicidad ni los compartimos con terceros con ese fin.</p>

<h2>4. Quién ve los datos</h2>
<p>Las imágenes y los datos de los comprobantes pertenecen a la empresa y solo los ven los miembros de esa empresa en la app. Las imágenes se guardan en almacenamiento privado y se muestran mediante enlaces firmados que vencen a los pocos minutos.</p>

<h2>5. Proveedores que procesan datos</h2>
<ul>
<li><strong>Hosting y almacenamiento:</strong> [PROVEEDOR DE HOSTING], donde corren el servidor, la base de datos y el almacenamiento de imágenes.</li>
<li><strong>Anthropic:</strong> recibe la imagen de cada comprobante para extraer sus datos mediante inteligencia artificial.</li>
<li><strong>Resend:</strong> envía los emails con el código de acceso.</li>
</ul>
<p>Estos proveedores pueden estar ubicados fuera de Uruguay. [REVISAR: transferencias internacionales de datos y garantías según la Ley 18.331.]</p>

<h2>6. Cuánto tiempo los conservamos</h2>
<p>Los comprobantes y sus datos se conservan mientras la empresa use el servicio, o hasta que la empresa pida su eliminación. Los códigos de acceso vencen a los 10 minutos. [REVISAR: plazos de conservación definitivos.]</p>

<h2>7. Tus derechos</h2>
<p>Conforme a la Ley N.º 18.331 de Protección de Datos Personales de Uruguay, tenés derecho a acceder a tus datos, rectificarlos, actualizarlos, incluirlos y suprimirlos. Para ejercerlos escribinos a [EMAIL DE CONTACTO]. También podés reclamar ante la Unidad Reguladora y de Control de Datos Personales (URCDP).</p>

<h2>8. Cómo eliminar tu cuenta</h2>
<p>Podés eliminar tu cuenta desde la app, en Perfil, «Eliminar cuenta». Se borran tu email y tu nombre, se cierran tus sesiones y se te quita de todas las empresas. Los comprobantes que escaneaste quedan en la empresa, que es la dueña de esos documentos, sin ningún dato que te identifique. Si sos el único administrador de una empresa con más miembros, primero tenés que asignar otro administrador.</p>

<h2>9. Seguridad</h2>
<p>Usamos conexiones cifradas (HTTPS), acceso restringido por empresa y almacenamiento privado de imágenes.</p>

<h2>10. Cambios y contacto</h2>
<p>Si cambiamos esta política, publicaremos la nueva versión en esta página. Consultas: [EMAIL DE CONTACTO].</p>`,
);

export const TERMS_HTML = page(
  'Términos de uso',
  `<h1>Términos de uso</h1>
<p>Última actualización: [FECHA]</p>

<h2>1. Quiénes somos y a quién va dirigido</h2>
<p>La aplicación es ofrecida por [RAZÓN SOCIAL], RUT [RUT DE LA EMPRESA] (en adelante, «el Proveedor») a empresas y a las personas que trabajan para ellas. Al usarla aceptás estos términos en nombre propio y de la empresa a la que pertenecés.</p>

<h2>2. El servicio</h2>
<p>La aplicación permite fotografiar comprobantes firmados (facturas y devoluciones), extraer sus datos con inteligencia artificial, archivarlos y exportarlos. La extracción es automática y puede contener errores: la empresa es responsable de revisar los datos antes de usarlos con fines contables, fiscales o comerciales.</p>

<h2>3. Cuentas y empresas</h2>
<p>El acceso es por código enviado a tu email. Sos responsable de mantener el acceso a tu email y de lo que se haga con tu sesión. Los administradores de cada empresa gestionan sus miembros y su configuración.</p>

<h2>4. Contratación y facturación</h2>
<p>El servicio se contrata y se factura a la empresa fuera de la aplicación, según lo acordado con el Proveedor. La aplicación no realiza cobros ni muestra medios de pago.</p>

<h2>5. Contenido y datos</h2>
<p>Los comprobantes y sus datos son de la empresa. La empresa declara tener derecho a subirlos y a que sean procesados según la <a href="/legal/privacidad">política de privacidad</a>.</p>

<h2>6. Uso aceptable</h2>
<p>No podés usar la aplicación para fines ilícitos, subir contenido que no corresponda a comprobantes de tu actividad, intentar acceder a datos de otras empresas ni interferir con el funcionamiento del servicio.</p>

<h2>7. Disponibilidad y responsabilidad</h2>
<p>Procuramos que el servicio esté disponible, pero no garantizamos que funcione sin interrupciones ni sin errores. [REVISAR: limitación de responsabilidad.]</p>

<h2>8. Baja</h2>
<p>Podés eliminar tu cuenta desde la app en cualquier momento. El Proveedor puede suspender el acceso ante incumplimientos de estos términos.</p>

<h2>9. Ley aplicable</h2>
<p>Estos términos se rigen por las leyes de la República Oriental del Uruguay. [REVISAR: jurisdicción.]</p>

<h2>10. Contacto</h2>
<p>[EMAIL DE CONTACTO]</p>`,
);
