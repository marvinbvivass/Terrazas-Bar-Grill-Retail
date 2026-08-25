# Cuaderno · Licorería

Control de ventas, inventario y fiado para licorería.

**No es una caja registradora.** El encargado anota las ventas en un cuaderno durante el
día y las transcribe al cerrar, así que todo se registra contra un **día de trabajo** que
el usuario elige, no contra el reloj. Los clientes del sistema son solo los de confianza,
los que llevan fiado: el que paga de contado no hace falta registrarlo.

Sustituye a [`dist-castillo`](https://github.com/marvinbvivass/dist-castillo), del que
conserva el modelo caja/paquete/unidad, los cascos retornables y el multimoneda, y del
que descarta la replicación de catálogo por usuario y el descuento de stock en el cliente.

---

## Arrancar

```bash
npm install
npm run dev      # http://localhost:5173
```

No hace falta backend ni base de datos. La primera vez se siembran 40 productos de
ejemplo en IndexedDB y la caja queda operativa.

```bash
npm test         # 80 pruebas de la lógica de negocio
npm run build    # verifica tipos y compila
```

---

## Las tres pantallas

**Cuaderno** — transcribir el día. Cuadrícula de 40 productos, escáner como atajo, frío
vs. al tiempo por línea y dos escalones de mayoreo que se activan solos. Cada venta se
carga *de contado* (con su pago mixto multimoneda e IGTF) o se *fía* a un cliente. Debajo
del carrito se ve lo que ya se cargó del día, para no perder la cuenta.

**Fiado** — quién debe, cuánto y desde cuándo. Un abono se reparte de la venta más vieja
a la más nueva, o solo entre las que se marquen a mano. Admite pagos parciales: si debe
$12 y abona $5, la venta queda en $7.

**Cierre** — el día en dos cifras, que es lo que evita creer que se vendió más de lo que
se cobró:

| | qué incluye | para qué sirve |
|---|---|---|
| **Entró en caja** | contado del día + cobros de fiados viejos | cuadrar la gaveta |
| **Se vendió** | contado del día + lo que se fio hoy | inventario y margen |

Más el desglose de qué contar por método y por moneda, la cartera total por cobrar y lo
que más se movió.

## Lo que todavía no

Recepción de mercancía, mermas, conteo físico, roles y permisos, reportes históricos, y
el backend real. Están en el plan de fases; el esquema ya los soporta.

---

## Cómo está organizado

```
src/
  domain/          Lógica pura, sin React ni base de datos. Todo con pruebas.
    types.ts       Espejo en TypeScript de esquema_licoreria.sql
    dias.ts        El día de trabajo como texto 'YYYY-MM-DD'
    money.ts       Redondeo, conversión y formato multimoneda
    stock.ts       Conversión presentación ↔ unidad base, desglosar()
    pricing.ts     Motor de precios: puerto de resolver_precio() del SQL
    cart.ts        Carrito, totales, IVA, IGTF, pago mixto, cierre de venta
    credito.ts     Saldos, ventas abiertas y reparto de abonos
    cierre.ts      Las dos cifras del día
  data/
    seed.ts        Los 40 productos de ejemplo
    db.ts          Réplica local en IndexedDB (Dexie) y cola de salida
    sync.ts        Contrato de sincronización. Hoy con transporte de mentira.
  hooks/usePos.ts  Estado de la aplicación
  ui/              Cuaderno, fiado, cierre y sus hojas
```

### Las tres reglas que sostienen todo

**1. El stock vive en unidad base.** Una caja no es un artículo distinto: es una
presentación con factor 24. Nadie "abre" una caja en el sistema, porque entró como 240
unidades. El desglose es aritmética (`desglosar()`), no un movimiento de inventario.

**2. El precio no vive en el producto.** Vive en listas con prioridad, vigencia,
ubicación y cantidad mínima. Por eso la misma botella cuesta 1,00 en el anaquel, 1,25
sacada de la nevera y 0,88 si te llevas 24, sin duplicarse en el catálogo. Añadir un
happy hour es insertar una fila, no desplegar código.

**3. El identificador de la venta lo genera la caja, no el servidor.** Es lo que hace
idempotente el envío: empujar la cola dos veces produce el mismo resultado que empujarla
una, y un corte a mitad del envío no deja ventas duplicadas. El correlativo definitivo lo
asigna el servidor al sincronizar.

**4. Hay tres fechas y son tres cosas distintas.** `dia` es el día de trabajo al que
pertenece la venta y se guarda como texto `'2026-08-25'`, no como timestamp: agrupar por
rango de fechas parece más elegante hasta que una venta de las once de la noche cae en el
cierre del día siguiente porque el servidor está en UTC y el local en UTC-4. `fecha` es
cuándo ocurrió según el cuaderno, y `registradaEn` cuándo se tecleó, que puede ser al día
siguiente.

**5. El saldo de un cliente no se guarda en ninguna parte.** Se calcula sumando sus
ventas a crédito y restando lo abonado. Un saldo almacenado es un saldo que un día se
desincroniza y nadie sabe cuál de los dos números es el bueno.

### Dos decisiones de negocio que están en el código

- **Los precios incluyen IVA** (`PRECIOS_INCLUYEN_IVA` en `cart.ts`). Es como se cotiza en
  el mostrador. El IVA se desglosa hacia atrás para el ticket, no se suma por encima.
- **El IGTF se calcula sobre lo abonado en divisa**, no sobre el total. Si la factura son
  $10 y el cliente paga $6 en efectivo dólar, el IGTF es 3% de 6.

Ambas se cambian en un solo sitio si el negocio funciona distinto.

---

## Conectar el backend

`src/data/sync.ts` define el contrato:

```ts
interface Transporte {
  subirVentas(ventas: Venta[]): Promise<RespuestaSync[]>  // idempotente por venta.id
  bajarSnapshot(): Promise<void>
}
```

Del lado del servidor, subir una venta es un `insert ... on conflict (id) do nothing`,
devolver el correlativo y asentar el kardex. El esquema completo está en
`esquema_licoreria.sql` (40 tablas, validado en PostgreSQL 16).

**Importante:** el motor de precios existe dos veces, en `pricing.ts` y en la función
`resolver_precio()` del SQL. Tienen que dar exactamente el mismo resultado, porque la
caja calcula el precio sin red y el servidor lo revalida al sincronizar. Las pruebas de
`pricing.test.ts` usan los mismos casos que se verificaron contra PostgreSQL.

---

## Pendiente de decidir

- **¿Quién fija la tasa cada día y puede el encargado cambiarla?** Hoy cualquiera la
  edita desde la barra superior.
- **¿Hasta cuándo se puede editar un día ya cerrado?** Ahora mismo se puede volver a
  cualquier fecha y seguir cargando. Si el dueño revisa el cierre y luego alguien agrega
  una venta a ese día, el número que vio deja de ser el número. Falta un cierre que se
  pueda marcar como cerrado.
- **Los iconos de `public/` son marcadores de sitio.** Hay que reemplazarlos por el arte
  real antes de instalar la aplicación en la caja.
