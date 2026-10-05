# Guideline 3.1.3 de Apple y este esquema de cobro

> **Esto es una interpretación para que Francisco decida, no asesoramiento legal ni una respuesta de Apple.** Escrito de memoria, sin poder consultar el sitio de Apple. Antes de enviar hay que leer el texto vigente en https://developer.apple.com/app-store/review/guidelines/#business (sección 3.1.3 y 3.1.1) porque Apple lo cambia seguido (incluidas las reglas sobre enlaces externos de compra, que varían por país). Si el texto vigente difiere de lo de abajo, manda el texto de Apple.

## Qué dice la sección 3.1 en general

Las funciones o contenidos digitales que se desbloquean dentro de la app deben usar compra dentro de la app (IAP). La sección 3.1.3 enumera excepciones en que se puede cobrar por otros medios, en general sin obligación de ofrecer IAP:

- **(a) Aplicaciones «Reader»:** contenido ya comprado (revistas, música, video, libros).
- **(b) Servicios multiplataforma:** contenido comprado en otra plataforma y accesible en iOS, siempre que también esté disponible por IAP.
- **(c) Servicios empresariales («Enterprise Services»):** si la app se vende directamente a organizaciones o grupos para sus empleados o alumnos (por ejemplo, suscripciones de ventas por volumen o a empresas), se puede cobrar por fuera de la app. Apple aclara que no se puede vender a consumidores individuales o familias con este mecanismo.
- (d) a (f): servicios persona a persona, bienes y servicios consumidos fuera de la app, y apps de un cliente específico; la lista y las letras pueden haber cambiado, verificar.
- Otras letras (por ejemplo gestión de publicidad) no son relevantes acá; verificar la lista completa.

Además, la regla general sobre incitar a pagar fuera de la app (anti-steering, 3.1.1 y 3.1.3) históricamente obliga a no incluir botones, enlaces o textos que dirijan a un mecanismo de compra distinto de IAP, salvo las excepciones de 3.1.3.

## Por qué este esquema encaja en 3.1.3(c)

- El servicio se vende a **empresas** (Punto Sano y otras distribuidoras), no a consumidores. Quien paga es la persona jurídica, con factura mensual (§12 de la especificación).
- Los usuarios de la app son empleados de esa empresa (repartidores, administrativos).
- Las cuentas se crean para miembros de una empresa que ya contrató el servicio.
- La app **no tiene** compras, botones ni enlaces de pago, ni textos que inviten a pagar. La pantalla «Uso y precio» es informativa (aclara que se factura por fuera).
- No se desbloquea contenido digital para un consumidor final por el cual se le cobre.

Mensaje a Apple si lo preguntan: «La app es un servicio empresarial. Se contrata directamente con organizaciones, se factura mensualmente a la empresa fuera de la app, y los usuarios son sus empleados. La app no ofrece compras ni enlaces de pago. Aplica la guideline 3.1.3(c).»

## Puntos débiles y riesgos

1. **«Empresas» debe ser real.** Si cualquier persona puede registrarse y crear su «empresa» sin contrato, un revisor puede ver un servicio para el público general. Mitigación: aclararlo en las notas, y que la descripción diga que el servicio es para empresas contratantes.
2. **Mostrar precios dentro de la app** (Campos a leer, Uso y precio) puede leerse como promoción de un esquema de pago externo. Hoy son informativos y sin enlace; es el punto a vigilar. Alternativa conservadora: mostrar el uso sin importes en dinero.
3. **Interpretación del revisor.** Si Apple no acepta (c), la consecuencia es el rechazo con pedido de IAP (comisión del 15 o 30 %) o de quitar la funcionalidad de cobro. Rechazar no bloquea el piloto: TestFlight y la prueba interna de Android funcionan igual (la revisión de TestFlight externa es más liviana).
4. **Cuentas que se crean solas.** Si un usuario nuevo puede usar el servicio sin que su empresa lo haya contratado, aumenta el riesgo de que se lea como un servicio al público.
5. **Cambios de política.** Las reglas de Apple cambian; releer antes de cada envío.

## Alternativas si Apple rechaza

- Responder en el Resolution Center explicando 3.1.3(c) y adjuntando el contrato modelo con empresas.
- Pasar a distribución de app personalizada (Custom App / Apple Business Manager), que está pensada para apps B2B privadas.
- Ofrecer IAP como último recurso (con la comisión correspondiente).

## Decisión pendiente de Francisco

- [ ] Confirmar leyendo el texto vigente de 3.1.3 y 3.1.1.
- [ ] Decidir si se mantiene el importe en dinero en «Uso y precio» o se muestra solo el consumo.
- [ ] Decidir si el registro de nuevas empresas exige alguna validación o contrato previo.
