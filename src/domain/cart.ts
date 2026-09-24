import { MONEDA_BASE, convertir, redondear, redondearMoneda } from './money'
import { resolverPrecio, type CatalogoPrecios } from './pricing'
import { aUnidadesBase } from './stock'
import type {
  CondicionVenta,
  DiaNegocio,
  LineaVenta,
  MetodoPago,
  MonedaCodigo,
  Pago,
  Presentacion,
  Producto,
  TipoCliente,
  UUID,
  Venta,
} from './types'

/**
 * Carrito y cobro.
 *
 * Dos decisiones de negocio que están codificadas aquí y conviene tener claras:
 *
 * 1. LOS PRECIOS DE LAS LISTAS INCLUYEN IVA. Es como se cotiza en el mostrador
 *    ("la cerveza está en 1,25") y como la ve el cliente en el anaquel. El IVA
 *    se desglosa hacia atrás para el ticket, no se suma por encima.
 *
 * 2. EL IGTF SE CALCULA SOBRE LO QUE SE ABONA EN DIVISA, no sobre el total.
 *    Si la factura son $10 y el cliente paga $6 en efectivo dólar y el resto en
 *    pago móvil, el IGTF es 3% de 6, no de 10. Se cobra por encima del total.
 */

export const PRECIOS_INCLUYEN_IVA = true
export const TASA_IGTF = 0.03

export interface Carrito {
  lineas: LineaVenta[]
  pagos: Pago[]
  tipoCliente: TipoCliente
}

export function carritoVacio(tipoCliente: TipoCliente = 'detal'): Carrito {
  return { lineas: [], pagos: [], tipoCliente }
}

export function estaVacio(c: Carrito): boolean {
  return c.lineas.length === 0
}

// ---------------------------------------------------------------------------
// Líneas
// ---------------------------------------------------------------------------

export interface EntradaLinea {
  producto: Producto
  presentacion: Presentacion
  ubicacionId: UUID
  cantidad: number
}

/**
 * Agrega al carrito. Si ya existe una línea del mismo producto, presentación y
 * ubicación, suma en vez de duplicar: escanear la misma cerveza cinco veces
 * tiene que dar una línea de cinco, no cinco líneas de una.
 */
export function agregar(carrito: Carrito, entrada: EntradaLinea): Carrito {
  const existente = carrito.lineas.find(
    (l) =>
      l.productoId === entrada.producto.id &&
      l.presentacionId === entrada.presentacion.id &&
      l.ubicacionId === entrada.ubicacionId,
  )

  if (existente) {
    return cambiarCantidad(carrito, existente.id, existente.cantidad + entrada.cantidad)
  }

  const linea: LineaVenta = {
    id: crypto.randomUUID(),
    productoId: entrada.producto.id,
    presentacionId: entrada.presentacion.id,
    ubicacionId: entrada.ubicacionId,
    cantidad: entrada.cantidad,
    cantidadBase: aUnidadesBase(entrada.cantidad, entrada.presentacion),
    precioUnitario: 0,
    descuento: 0,
    listaPrecioId: '',
    listaPrecioNombre: '',
    ivaPct: entrada.producto.iva,
    importe: 0,
    costoUnitario: entrada.producto.costoPromedio,
  }

  return { ...carrito, lineas: [...carrito.lineas, linea] }
}

export function cambiarCantidad(carrito: Carrito, lineaId: UUID, cantidad: number): Carrito {
  if (cantidad <= 0) return quitar(carrito, lineaId)
  return {
    ...carrito,
    lineas: carrito.lineas.map((l) => (l.id === lineaId ? { ...l, cantidad } : l)),
  }
}

export function quitar(carrito: Carrito, lineaId: UUID): Carrito {
  return { ...carrito, lineas: carrito.lineas.filter((l) => l.id !== lineaId) }
}

/** Mueve una línea entre nevera y sala. Cambia la ubicación y, con ella, el precio. */
export function cambiarUbicacion(carrito: Carrito, lineaId: UUID, ubicacionId: UUID): Carrito {
  return {
    ...carrito,
    lineas: carrito.lineas.map((l) => (l.id === lineaId ? { ...l, ubicacionId } : l)),
  }
}

/**
 * Recalcula precios de TODAS las líneas.
 *
 * Hay que hacerlo entero cada vez que cambia algo, porque la cantidad que
 * decide el precio es la acumulada del producto en el carrito: al pasar de 30 a
 * 36 botellas, la lista de mayor se activa sola y las 36 se recalculan, no solo
 * las 6 nuevas.
 */
export function recalcular(
  carrito: Carrito,
  presentaciones: Map<UUID, Presentacion>,
  catalogo: CatalogoPrecios,
  momento: number = Date.now(),
): Carrito {
  const acumuladoPorProducto = new Map<UUID, number>()
  for (const l of carrito.lineas) {
    const p = presentaciones.get(l.presentacionId)
    if (!p) continue
    const base = aUnidadesBase(l.cantidad, p)
    acumuladoPorProducto.set(l.productoId, (acumuladoPorProducto.get(l.productoId) ?? 0) + base)
  }

  const lineas = carrito.lineas.map((l): LineaVenta => {
    const presentacion = presentaciones.get(l.presentacionId)
    if (!presentacion) return l

    const cantidadBase = aUnidadesBase(l.cantidad, presentacion)
    const resuelto = resolverPrecio(
      {
        presentacionId: l.presentacionId,
        cantidadBase: acumuladoPorProducto.get(l.productoId) ?? cantidadBase,
        ubicacionId: l.ubicacionId,
        tipoCliente: carrito.tipoCliente,
        momento,
      },
      catalogo,
    )

    const precioUnitario = resuelto?.precio ?? l.precioUnitario
    const importe = redondear(precioUnitario * l.cantidad - l.descuento, 2)

    return {
      ...l,
      cantidadBase,
      precioUnitario,
      listaPrecioId: resuelto?.listaId ?? '',
      listaPrecioNombre: resuelto?.listaNombre ?? '',
      importe,
    }
  })

  return { ...carrito, lineas }
}

// ---------------------------------------------------------------------------
// Totales
// ---------------------------------------------------------------------------

export interface Totales {
  /** Base imponible: total sin IVA */
  subtotal: number
  iva: number
  descuento: number
  /** Lo que dice la etiqueta: subtotal + iva */
  total: number
  costoTotal: number
  /** IGTF acumulado por los pagos en divisa */
  igtf: number
  /** total + igtf: lo que hay que cobrar de verdad */
  aCobrar: number
  /** Suma de lo abonado por los pagos registrados, sin contar IGTF */
  abonado: number
  /** total - abonado. Cero o negativo = la venta está cubierta */
  pendiente: number
  unidades: number
}

export function totales(carrito: Carrito): Totales {
  let total = 0
  let iva = 0
  let descuento = 0
  let costoTotal = 0
  let unidades = 0

  for (const l of carrito.lineas) {
    total = redondear(total + l.importe, 2)
    descuento = redondear(descuento + l.descuento, 2)
    costoTotal = redondear(costoTotal + l.costoUnitario * l.cantidadBase, 2)
    unidades = redondear(unidades + l.cantidadBase, 3)

    if (PRECIOS_INCLUYEN_IVA) {
      const base = l.ivaPct > 0 ? l.importe / (1 + l.ivaPct) : l.importe
      iva = redondear(iva + (l.importe - base), 2)
    } else {
      iva = redondear(iva + l.importe * l.ivaPct, 2)
    }
  }

  if (!PRECIOS_INCLUYEN_IVA) total = redondear(total + iva, 2)

  const subtotal = redondear(total - iva, 2)
  const igtf = carrito.pagos.reduce((s, p) => redondear(s + p.igtf, 2), 0)
  const abonado = carrito.pagos.reduce((s, p) => redondear(s + p.montoAplicado, 2), 0)

  return {
    subtotal,
    iva,
    descuento,
    total,
    costoTotal,
    igtf,
    aCobrar: redondear(total + igtf, 2),
    abonado,
    pendiente: redondear(total - abonado, 2),
    unidades,
  }
}

// ---------------------------------------------------------------------------
// Pagos
// ---------------------------------------------------------------------------

export interface EntradaPago {
  metodo: MetodoPago
  /** Lo que este pago abona a la factura, en moneda base (USD) */
  montoAplicado: number
  /** Tasa de la moneda del método contra la base. 1 si el método es en USD. */
  tasa: number
  /** Solo para efectivo: lo que el cliente puso sobre el mostrador, en la moneda del método */
  entregado?: number | null
  referencia?: string | null
}

export function crearPago(entrada: EntradaPago): Pago {
  const { metodo } = entrada
  const montoAplicado = redondear(entrada.montoAplicado, 2)
  const igtf = metodo.aplicaIgtf ? redondear(montoAplicado * TASA_IGTF, 2) : 0
  const montoEnMoneda = convertir(montoAplicado + igtf, metodo.moneda, entrada.tasa)

  const entregado = entrada.entregado ?? null
  const vuelto =
    metodo.esEfectivo && entregado !== null && entregado > montoEnMoneda
      ? redondearMoneda(entregado - montoEnMoneda, metodo.moneda)
      : 0

  return {
    id: crypto.randomUUID(),
    metodoPagoId: metodo.id,
    metodoNombre: metodo.nombre,
    moneda: metodo.moneda,
    montoAplicado,
    igtf,
    tasa: entrada.tasa,
    montoEnMoneda,
    entregado,
    vuelto,
    referencia: entrada.referencia ?? null,
  }
}

export function agregarPago(carrito: Carrito, pago: Pago): Carrito {
  return { ...carrito, pagos: [...carrito.pagos, pago] }
}

export function quitarPago(carrito: Carrito, pagoId: UUID): Carrito {
  return { ...carrito, pagos: carrito.pagos.filter((p) => p.id !== pagoId) }
}

/**
 * Lo que queda en la gaveta por cada moneda. Es la base del arqueo al cierre.
 *
 * Se suma `montoEnMoneda` y NO se resta el vuelto: `montoEnMoneda` ya es el
 * neto. Si el cliente entrega $20 por una cuenta de $10,30, entran 20 y salen
 * 9,70, y lo que queda son los 10,30 de `montoEnMoneda`. Restar además el
 * vuelto descontaría dos veces y el arqueo cerraría corto todos los días.
 *
 * Esto vale porque el vuelto siempre se da en la moneda del método. El día que
 * se quiera cobrar en bolívares y dar el vuelto en dólares, hay que modelar el
 * vuelto como un movimiento de caja aparte.
 */
export function cobradoPorMoneda(carrito: Carrito): Map<MonedaCodigo, number> {
  const mapa = new Map<MonedaCodigo, number>()
  for (const p of carrito.pagos) {
    mapa.set(p.moneda, redondearMoneda((mapa.get(p.moneda) ?? 0) + p.montoEnMoneda, p.moneda))
  }
  return mapa
}

export function estaPagado(carrito: Carrito): boolean {
  return !estaVacio(carrito) && totales(carrito).pendiente <= 0
}

// ---------------------------------------------------------------------------
// Cierre de la venta
// ---------------------------------------------------------------------------

export interface DatosVenta {
  /** Día de negocio al que pertenece: el que eligió el usuario, no el de hoy */
  dia: DiaNegocio
  /** Cuándo ocurrió la venta */
  fecha: number
  usuarioId: UUID
  folioProvisional: string
  tasas: Record<string, number>
  creadaOffline: boolean
  /** Si es a crédito, hay que decir de quién */
  clienteId?: UUID | null
}

/**
 * Cierra una venta de contado: la que ya se cobró.
 * Los pagos que tenga el carrito son los que entraron en caja ese día.
 */
export function construirVentaContado(carrito: Carrito, datos: DatosVenta): Venta {
  return construir(carrito, datos, 'contado', null)
}

/**
 * Cierra una venta a crédito: salió la mercancía, no entró la plata.
 * Sin pagos: los pagos llegan después, como abonos.
 */
export function construirVentaCredito(
  carrito: Carrito,
  datos: DatosVenta,
  clienteId: UUID,
): Venta {
  return construir({ ...carrito, pagos: [] }, datos, 'credito', clienteId)
}

/**
 * La venta del día: todo lo que salió del inventario en una jornada.
 *
 * ---------------------------------------------------------------------------
 * Aquí las líneas y el total NO suman lo mismo, y es a propósito
 * ---------------------------------------------------------------------------
 *
 * Las LÍNEAS son todo lo que salió del anaquel, fiado incluido: es lo que
 * descuenta existencias y lo que deja margen. El TOTAL es solo lo que se cobró,
 * porque `calcularCierre` suma los totales de las ventas de contado para saber
 * qué debería haber en la gaveta, y meter ahí lo fiado haría cuadrar la caja
 * contra plata que nadie entregó.
 *
 * Lo fiado vive en documentos aparte —una venta a crédito por cliente, sin
 * líneas— que son los que alimentan CXC. Así cada cifra del cierre sale de un
 * solo sitio: vendido = contado + crédito, y caja = contado.
 *
 * Si algún día alguien "arregla" esta asimetría igualando total y líneas, el
 * cierre empezará a pedir en caja el dinero del fiado.
 */
export function construirVentaDelDia(
  carrito: Carrito,
  datos: DatosVenta,
  /** Lo que se fio hoy, en moneda base. Se descuenta del total cobrado. */
  creditoOtorgado: number,
): Venta {
  const venta = construir(carrito, datos, 'contado', null)
  if (creditoOtorgado <= 0) return venta
  return { ...venta, total: redondear(venta.total - creditoOtorgado, 2) }
}

/**
 * La deuda de un cliente por lo que se llevó hoy, como documento aparte.
 *
 * SIN LÍNEAS, y esto es lo que hay que entender: la mercancía ya salió del
 * inventario en la venta del día, que lleva todas las líneas. Si esta venta
 * repitiera los productos, el stock se descontaría dos veces y el margen del
 * día saldría al doble.
 *
 * Lo que este documento aporta es el saldo: cuánto debe este cliente y desde
 * cuándo. Es lo que lee CXC y lo que van bajando los abonos.
 */
export function construirVentaCreditoSinLineas(
  datos: DatosVenta,
  clienteId: UUID,
  monto: number,
): Venta {
  const total = redondear(monto, 2)
  return {
    id: crypto.randomUUID(),
    numero: null,
    folioProvisional: datos.folioProvisional,
    dia: datos.dia,
    fecha: datos.fecha,
    registradaEn: Date.now(),
    condicion: 'credito',
    clienteId,
    moneda: MONEDA_BASE,
    tasas: datos.tasas,
    subtotal: total,
    descuento: 0,
    // El IVA ya lo declaró la venta del día, que es la que tiene las líneas.
    // Contarlo otra vez aquí lo duplicaría en el cierre.
    iva: 0,
    igtf: 0,
    total,
    costoTotal: 0,
    estado: 'registrada',
    usuarioId: datos.usuarioId,
    lineas: [],
    pagos: [],
    creadaOffline: datos.creadaOffline,
    sincronizadaEn: null,
  }
}

/**
 * Los pagos del cierre: un renglón por moneda contada.
 *
 * Sin IGTF. El impuesto se cobra sobre divisa en una venta concreta, y aquí lo
 * que se carga es el total del día ya cobrado; aplicarlo sobre el agregado
 * inventaría un impuesto que nadie cobró en el mostrador.
 */
export function construirPagosDelCierre(
  recibido: Partial<Record<MonedaCodigo, number>>,
  tasas: Record<string, number>,
  metodos: MetodoPago[],
): Pago[] {
  const pagos: Pago[] = []
  for (const moneda of Object.keys(recibido) as MonedaCodigo[]) {
    const monto = recibido[moneda] ?? 0
    if (monto <= 0) continue
    const tasa = moneda === MONEDA_BASE ? 1 : (tasas[moneda] ?? 0)
    if (tasa <= 0) continue
    const metodo =
      metodos.find((x) => x.moneda === moneda && x.esEfectivo) ??
      metodos.find((x) => x.moneda === moneda)
    if (!metodo) continue
    pagos.push({
      id: crypto.randomUUID(),
      metodoPagoId: metodo.id,
      metodoNombre: metodo.nombre,
      moneda,
      montoAplicado: redondear(monto / tasa, 2),
      igtf: 0,
      tasa,
      montoEnMoneda: monto,
      entregado: null,
      vuelto: 0,
      referencia: null,
    })
  }
  return pagos
}

function construir(
  carrito: Carrito,
  datos: DatosVenta,
  condicion: CondicionVenta,
  clienteId: UUID | null,
): Venta {
  const t = totales(carrito)
  return {
    id: crypto.randomUUID(),
    numero: null,
    folioProvisional: datos.folioProvisional,
    dia: datos.dia,
    fecha: datos.fecha,
    registradaEn: Date.now(),
    condicion,
    clienteId,
    moneda: MONEDA_BASE,
    tasas: datos.tasas,
    subtotal: t.subtotal,
    descuento: t.descuento,
    iva: t.iva,
    igtf: condicion === 'credito' ? 0 : t.igtf,
    total: t.total,
    costoTotal: t.costoTotal,
    estado: 'registrada',
    usuarioId: datos.usuarioId,
    lineas: carrito.lineas,
    pagos: carrito.pagos,
    creadaOffline: datos.creadaOffline,
    sincronizadaEn: null,
  }
}

/**
 * Los movimientos de kardex que genera una venta: una salida por línea, con
 * signo negativo y en unidades base.
 */
export function movimientosDeVenta(venta: Venta) {
  return venta.lineas.map((l) => ({
    id: crypto.randomUUID(),
    fecha: venta.fecha,
    tipo: 'venta' as const,
    productoId: l.productoId,
    presentacionId: l.presentacionId,
    cantidadPresentacion: l.cantidad,
    cantidadBase: -l.cantidadBase,
    ubicacionId: l.ubicacionId,
    ubicacionDestinoId: null,
    costoUnitario: l.costoUnitario,
    documentoTipo: 'venta',
    documentoId: venta.id,
    usuarioId: venta.usuarioId,
    motivo: null,
  }))
}
