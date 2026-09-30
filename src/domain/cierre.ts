import { redondear } from './money'
import type { Abono, DiaNegocio, MetodoPago, MonedaCodigo, Venta } from './types'
import { devueltoACuenta, devueltoEnEfectivo, type Devolucion } from './devolucion'

/**
 * Cierre del día.
 *
 * La distinción que sostiene todo este módulo: una venta a crédito entrega la
 * mercancía un día y el dinero entra otro. Meterlas en el mismo total es la
 * forma más rápida de creer que el negocio vendió más de lo que cobró.
 *
 * Por eso el cierre tiene DOS cifras y no una:
 *
 *   ENTRÓ EN CAJA HOY   = contado del día + cobros de créditos viejos
 *                         Es contra lo que se cuadra la gaveta.
 *
 *   SE VENDIÓ HOY       = contado del día + lo que se fio hoy
 *                         Es lo que salió del inventario y lo que deja margen.
 *
 * Las dos comparten el contado y se separan en todo lo demás.
 */

export interface DesglosePago {
  metodoId: string
  metodoNombre: string
  moneda: MonedaCodigo
  /** Lo que entró en la moneda del método (lo que hay que contar en la gaveta) */
  enMoneda: number
  /** El mismo monto llevado a moneda base, para poder sumar peras con manzanas */
  enBase: number
  igtf: number
}

export interface Cierre {
  dia: DiaNegocio

  // --- Lo que entró en caja -------------------------------------------------
  /** Ventas de contado registradas con fecha de hoy */
  contado: number
  /** Cobros de créditos, sin importar de qué día sea la venta */
  cobrosCredito: number
  /** contado + cobrosCredito. Contra esto se cuadra la gaveta. */
  entroEnCaja: number
  igtf: number
  porMetodo: DesglosePago[]
  porMoneda: Array<{ moneda: MonedaCodigo; monto: number }>

  // --- Lo que se vendió -----------------------------------------------------
  /** Ventas a crédito otorgadas hoy: salió mercancía, no entró plata */
  creditoHoy: number
  /** contado + creditoHoy */
  vendidoHoy: number
  costoVendido: number
  /** vendidoHoy − costoVendido */
  margen: number
  ivaVentas: number

  // --- Devoluciones ---------------------------------------------------------
  /** Devuelto en efectivo: sale de la gaveta */
  devolucionesEfectivo: number
  /** Devuelto a cuenta: baja deuda, no toca la gaveta */
  devolucionesCuenta: number

  // --- Conteos --------------------------------------------------------------
  numVentasContado: number
  numVentasCredito: number
  numCobros: number
  unidades: number

  /** Cuánto se debe en total al cerrar el día, de todos los clientes */
  carteraAlCierre: number
}

export interface EntradaCierre {
  dia: DiaNegocio
  ventas: Venta[]
  abonos: Abono[]
  metodosPago: MetodoPago[]
  /** Saldo total de todos los clientes al terminar el día */
  carteraAlCierre?: number
  /** Mercancía que volvió. Baja lo vendido, y si fue en efectivo, la caja. */
  devoluciones?: Devolucion[]
}

export function calcularCierre(entrada: EntradaCierre): Cierre {
  const { dia, ventas, abonos, metodosPago } = entrada
  const nombreMetodo = new Map(metodosPago.map((m) => [m.id, m]))

  const delDia = ventas.filter((v) => v.dia === dia && v.estado !== 'anulada')
  const contadoDelDia = delDia.filter((v) => v.condicion === 'contado')
  const creditoDelDia = delDia.filter((v) => v.condicion === 'credito')
  const cobrosDelDia = abonos.filter((a) => a.dia === dia)

  const contado = contadoDelDia.reduce((s, v) => redondear(s + v.total, 2), 0)
  const creditoHoy = creditoDelDia.reduce((s, v) => redondear(s + v.total, 2), 0)
  const cobrosCredito = cobrosDelDia.reduce((s, a) => redondear(s + a.monto, 2), 0)

  // Desglose por método: los pagos de las ventas de contado y los de los cobros
  const acumulado = new Map<string, DesglosePago>()
  const sumar = (metodoId: string, moneda: MonedaCodigo, enMoneda: number, enBase: number, igtf: number) => {
    const previo = acumulado.get(metodoId)
    const m = nombreMetodo.get(metodoId)
    acumulado.set(metodoId, {
      metodoId,
      metodoNombre: m?.nombre ?? 'Otro',
      moneda,
      enMoneda: redondear((previo?.enMoneda ?? 0) + enMoneda, 2),
      enBase: redondear((previo?.enBase ?? 0) + enBase, 2),
      igtf: redondear((previo?.igtf ?? 0) + igtf, 2),
    })
  }

  for (const v of contadoDelDia) {
    for (const p of v.pagos) {
      sumar(p.metodoPagoId, p.moneda, p.montoEnMoneda, redondear(p.montoAplicado + p.igtf, 2), p.igtf)
    }
  }
  for (const a of cobrosDelDia) {
    for (const p of a.pagos) {
      sumar(p.metodoPagoId, p.moneda, p.montoEnMoneda, redondear(p.montoAplicado + p.igtf, 2), p.igtf)
    }
  }

  const porMetodo = [...acumulado.values()].sort((a, b) => b.enBase - a.enBase)

  const porMonedaMapa = new Map<MonedaCodigo, number>()
  for (const d of porMetodo) {
    porMonedaMapa.set(d.moneda, redondear((porMonedaMapa.get(d.moneda) ?? 0) + d.enMoneda, 2))
  }

  const igtf = porMetodo.reduce((s, d) => redondear(s + d.igtf, 2), 0)

  // Inventario y margen: cuenta TODO lo que salió hoy, el crédito incluido
  const salidasDelDia = [...contadoDelDia, ...creditoDelDia]
  const costoVendido = salidasDelDia.reduce((s, v) => redondear(s + v.costoTotal, 2), 0)
  const ivaVentas = salidasDelDia.reduce((s, v) => redondear(s + v.iva, 2), 0)
  const unidades = salidasDelDia.reduce(
    (s, v) => redondear(s + v.lineas.reduce((t, l) => t + l.cantidadBase, 0), 3),
    0,
  )

  /*
   * Las devoluciones se restan al final, no se mezclan con las ventas.
   *
   * La que se pagó en efectivo sale de la gaveta y baja las dos cifras. La que
   * fue a cuenta no mueve plata: baja lo vendido y le baja la deuda al cliente,
   * pero la caja del día no se entera. Restarlas las dos de la caja haría que
   * el cierre pidiera contar menos dinero del que hay.
   */
  const devoluciones = entrada.devoluciones ?? []
  const devolucionesEfectivo = devueltoEnEfectivo(dia, devoluciones)
  const devolucionesCuenta = devueltoACuenta(dia, devoluciones)

  // El costo solo se devuelve si la mercancía volvió al anaquel. Lo que entró
  // en mal estado se perdió igual: su costo se queda en el del día.
  const costoDevuelto = redondear(
    devoluciones
      .filter((d) => d.dia === dia && d.vuelveAlStock)
      .reduce((x, d) => x + d.costoTotal, 0),
    2,
  )

  const vendidoHoy = redondear(
    contado + creditoHoy - devolucionesEfectivo - devolucionesCuenta,
    2,
  )

  return {
    dia,
    contado,
    cobrosCredito,
    entroEnCaja: redondear(contado + cobrosCredito - devolucionesEfectivo, 2),
    igtf,
    porMetodo,
    porMoneda: [...porMonedaMapa.entries()].map(([moneda, monto]) => ({ moneda, monto })),
    creditoHoy,
    vendidoHoy,
    costoVendido: redondear(costoVendido - costoDevuelto, 2),
    margen: redondear(vendidoHoy - (costoVendido - costoDevuelto), 2),
    devolucionesEfectivo,
    devolucionesCuenta,
    ivaVentas,
    numVentasContado: contadoDelDia.length,
    numVentasCredito: creditoDelDia.length,
    numCobros: cobrosDelDia.length,
    unidades,
    carteraAlCierre: entrada.carteraAlCierre ?? 0,
  }
}

/** Los productos más vendidos del día, para el reporte del dueño */
export function masVendidos(
  dia: DiaNegocio,
  ventas: Venta[],
  limite = 8,
): Array<{ productoId: string; unidades: number; importe: number }> {
  const mapa = new Map<string, { unidades: number; importe: number }>()

  for (const v of ventas) {
    if (v.dia !== dia || v.estado === 'anulada') continue
    for (const l of v.lineas) {
      const previo = mapa.get(l.productoId) ?? { unidades: 0, importe: 0 }
      mapa.set(l.productoId, {
        unidades: redondear(previo.unidades + l.cantidadBase, 3),
        importe: redondear(previo.importe + l.importe, 2),
      })
    }
  }

  return [...mapa.entries()]
    .map(([productoId, x]) => ({ productoId, ...x }))
    .sort((a, b) => b.importe - a.importe)
    .slice(0, limite)
}
