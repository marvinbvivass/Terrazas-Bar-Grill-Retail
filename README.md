# Caja · Licorería

Punto de venta e inventario para licorería. **Funciona sin conexión desde el primer día**:
la caja lee siempre de una réplica local y el servidor nunca está en el camino crítico
de un cobro.

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
npm test         # 56 pruebas de la lógica de negocio
npm run build    # verifica tipos y compila
```

---

## Lo que ya funciona

- **Cuadrícula de 40 productos** con pestañas por categoría y búsqueda.
- **Escáner** en modo teclado: se teclea el código en el campo de búsqueda y Enter lo
  agrega. Un código de 6 a 14 dígitos se trata como código de barras; cualquier otra
  cosa, como búsqueda.
- **Frío vs. al tiempo** por línea: cambiar la ubicación recalcula el precio solo.
- **Dos escalones de mayoreo**: desde 24 unidades para cerveza y refrescos, desde 6 para
  licores y vinos. Se activan solos a mitad de la venta.
- **Pago mixto multimoneda** con IGTF sobre lo abonado en divisa, vuelto en la moneda
  del método y referencia obligatoria donde toca.
- **Ticket** con folio provisional marcado como tal mientras no haya correlativo.
- **Sin señal**: se vende igual, la venta queda en cola, y recargar la aplicación con el
  módem apagado la levanta igual gracias al service worker.

## Lo que todavía no

Recepción de mercancía, mermas, conteo, turno de caja con arqueo, roles y permisos,
reportes, y el backend real. Están en el plan de fases; el esquema ya los soporta.

---

## Cómo está organizado

```
src/
  domain/          Lógica pura, sin React ni base de datos. Todo con pruebas.
    types.ts       Espejo en TypeScript de esquema_licoreria.sql
    money.ts       Redondeo, conversión y formato multimoneda
    stock.ts       Conversión presentación ↔ unidad base, desglosar()
    pricing.ts     Motor de precios: puerto de resolver_precio() del SQL
    cart.ts        Carrito, totales, IVA, IGTF, pago mixto, cierre de venta
  data/
    seed.ts        Los 40 productos de ejemplo
    db.ts          Réplica local en IndexedDB (Dexie) y cola de salida
    sync.ts        Contrato de sincronización. Hoy con transporte de mentira.
  hooks/usePos.ts  Estado de la caja
  ui/              Cuadrícula, carrito, cobro, ticket, barra de estado
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

- **¿Cuántas cajas van a operar a la vez?** Con una sola, el stock estimado offline es
  prácticamente exacto. Con dos vendiendo sin red al mismo tiempo, ambas pueden vender la
  última botella y hay que decidir qué hace el sistema al reconciliar.
- **¿Quién fija la tasa cada día y puede el cajero cambiarla?** Hoy cualquiera la edita
  desde la barra de estado. Con cortes frecuentes, una tasa cacheada puede quedar vieja.
- **Los iconos de `public/` son marcadores de sitio.** Hay que reemplazarlos por el arte
  real antes de instalar la aplicación en la caja.
