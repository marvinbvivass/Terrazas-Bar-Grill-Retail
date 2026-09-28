import { aUnidadesBase } from './stock'
import { redondear } from './money'
import type {
  DiaNegocio,
  MovimientoInventario,
  Presentacion,
  Producto,
  UUID,
} from './types'

/**
 * Entrada de mercancía.
 *
 * Hasta ahora el stock solo sabía bajar: salía al cerrar el día y no había
 * forma de registrar que había entrado nada. Lo único posible era editar el
 * producto y sobrescribir la existencia a mano, que funciona pero no deja
 * rastro de cuándo entró, cuánto, a qué costo ni quién lo recibió — y si
 * alguien tenía el formulario abierto mientras se cerraba el día, al guardar
 * resucitaba la mercancía ya vendida.
 *
 * Una recepción es un documento con sus renglones, que genera movimientos de
 * kardex positivos y recalcula el costo promedio. No se borra: si llegó mal,
 * se corrige con otra entrada, igual que las ventas.
 */

export interface LineaRecepcion {
  id: UUID
  productoId: UUID
  /** En qué presentación llegó: cajas, six-packs o unidades sueltas */
  presentacionId: UUID
  /** Cuántas de esa presentación */
  cantidad: number
  /** Lo mismo en unidades base, que es como vive el stock */
  cantidadBase: number
  /**
   * Lo que costó UNA UNIDAD BASE, no una caja.
   *
   * Se guarda ya convertido porque el costo promedio se lleva en unidad base.
   * Si se guardara el precio de la caja, cada consulta tendría que acordarse
   * de dividir por el factor, y basta que una se olvide para que el margen del
   * negocio salga 36 veces mayor de lo que es.
   */
  costoUnitarioBase: number
  ubicacionId: UUID
}

export interface Recepcion {
  id: UUID
  dia: DiaNegocio
  fecha: number
  /** Quién la recibió */
  usuarioId: UUID
  proveedor: string | null
  /** Número de la factura o guía del proveedor */
  documento: string | null
  lineas: LineaRecepcion[]
  /** Lo que costó todo lo que entró */
  total: number
  unidades: number
  nota: string | null
  creadaOffline: boolean
  sincronizadaEn: number | null
}

export interface EntradaLineaRecepcion {
  producto: Producto
  presentacion: Presentacion
  cantidad: number
  /** Lo que se pagó por UNA de esa presentación (una caja, un six-pack) */
  costoPorPresentacion: number
  ubicacionId: UUID
}

export function lineaDeRecepcion(e: EntradaLineaRecepcion): LineaRecepcion {
  const cantidadBase = aUnidadesBase(e.cantidad, e.presentacion)
  // El factor nunca es cero en una presentación válida, pero si lo fuera,
  // dividir daría Infinity y contaminaría el costo promedio del producto.
  const factor = e.presentacion.factor > 0 ? e.presentacion.factor : 1
  return {
    id: crypto.randomUUID(),
    productoId: e.producto.id,
    presentacionId: e.presentacion.id,
    cantidad: e.cantidad,
    cantidadBase,
    costoUnitarioBase: redondear(e.costoPorPresentacion / factor, 4),
    ubicacionId: e.ubicacionId,
  }
}

export interface DatosRecepcion {
  dia: DiaNegocio
  fecha: number
  usuarioId: UUID
  proveedor?: string | null
  documento?: string | null
  nota?: string | null
  creadaOffline: boolean
}

export function construirRecepcion(
  lineas: LineaRecepcion[],
  datos: DatosRecepcion,
): Recepcion {
  const total = redondear(
    lineas.reduce((s, l) => s + l.costoUnitarioBase * l.cantidadBase, 0),
    2,
  )
  const unidades = redondear(
    lineas.reduce((s, l) => s + l.cantidadBase, 0),
    3,
  )

  return {
    id: crypto.randomUUID(),
    dia: datos.dia,
    fecha: datos.fecha,
    usuarioId: datos.usuarioId,
    proveedor: datos.proveedor?.trim() || null,
    documento: datos.documento?.trim() || null,
    lineas,
    total,
    unidades,
    nota: datos.nota?.trim() || null,
    creadaOffline: datos.creadaOffline,
    sincronizadaEn: null,
  }
}

/** Los asientos de kardex: una entrada por renglón, en positivo */
export function movimientosDeRecepcion(r: Recepcion): MovimientoInventario[] {
  return r.lineas.map((l) => ({
    id: crypto.randomUUID(),
    fecha: r.fecha,
    tipo: 'compra' as const,
    productoId: l.productoId,
    presentacionId: l.presentacionId,
    cantidadPresentacion: l.cantidad,
    // Positivo: entra. La venta usa el mismo campo en negativo.
    cantidadBase: l.cantidadBase,
    ubicacionId: l.ubicacionId,
    ubicacionDestinoId: null,
    costoUnitario: l.costoUnitarioBase,
    documentoTipo: 'recepcion',
    documentoId: r.id,
    usuarioId: r.usuarioId,
    motivo: null,
  }))
}

/**
 * El costo promedio ponderado después de una entrada.
 *
 * Es la media de lo viejo y lo nuevo pesada por cantidad, no la media simple.
 * Si quedaban 10 botellas a 0,60 y entran 100 a 0,80, el costo no es 0,70:
 * es 0,782, porque casi todo lo que hay en el anaquel costó 0,80. Con la media
 * simple el margen que ve el dueño sería más alto que el real justo cuando más
 * mercancía tiene.
 *
 * Casos de borde que importan:
 * - Si no había nada (o el stock estaba en negativo por un descuadre), el costo
 *   pasa a ser el de la entrada: promediar contra una cantidad negativa daría
 *   un costo absurdo, y en algún caso negativo.
 * - Si la entrada es cero, el costo no se toca.
 */
export function costoPromedioTrasEntrada(
  stockActual: number,
  costoActual: number,
  cantidadEntrante: number,
  costoEntrante: number,
): number {
  if (cantidadEntrante <= 0) return redondear(costoActual, 4)
  if (stockActual <= 0) return redondear(costoEntrante, 4)

  const valorViejo = stockActual * costoActual
  const valorNuevo = cantidadEntrante * costoEntrante
  return redondear((valorViejo + valorNuevo) / (stockActual + cantidadEntrante), 4)
}

/**
 * Cuánto entró de cada producto, sumando sus renglones.
 *
 * Un mismo producto puede venir en dos renglones —una caja al anaquel y un
 * six-pack a la nevera— y el costo promedio se calcula UNA vez contra el total
 * que entró. Calcularlo renglón a renglón daría un número distinto según el
 * orden en que se teclearon, que es la clase de error que nadie encuentra.
 */
export function entradaPorProducto(
  r: Recepcion,
): Map<UUID, { cantidadBase: number; costoPromedioEntrada: number }> {
  const acumulado = new Map<UUID, { cantidadBase: number; valor: number }>()

  for (const l of r.lineas) {
    const previo = acumulado.get(l.productoId) ?? { cantidadBase: 0, valor: 0 }
    acumulado.set(l.productoId, {
      cantidadBase: previo.cantidadBase + l.cantidadBase,
      valor: previo.valor + l.costoUnitarioBase * l.cantidadBase,
    })
  }

  const salida = new Map<UUID, { cantidadBase: number; costoPromedioEntrada: number }>()
  for (const [productoId, x] of acumulado) {
    salida.set(productoId, {
      cantidadBase: redondear(x.cantidadBase, 3),
      costoPromedioEntrada: x.cantidadBase > 0 ? redondear(x.valor / x.cantidadBase, 4) : 0,
    })
  }
  return salida
}
