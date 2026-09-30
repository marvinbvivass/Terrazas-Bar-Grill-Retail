import { redondear } from './money'
import type {
  DiaNegocio,
  MovimientoInventario,
  Presentacion,
  Producto,
  UUID,
} from './types'
import { aUnidadesBase } from './stock'

/**
 * Devolución de un cliente: mercancía que vuelve.
 *
 * Antes lo único posible era anular la venta entera, y con el modelo de cierre
 * diario eso significa tumbar el día completo para deshacer dos botellas. Una
 * devolución parcial no tenía camino.
 *
 * ---------------------------------------------------------------------------
 * Dos formas de devolver, y la diferencia importa
 * ---------------------------------------------------------------------------
 *
 * EN EFECTIVO — sale plata de la gaveta. Baja lo que entró en caja ese día.
 *
 * A CUENTA — no sale plata: le baja la deuda al cliente. Es lo normal cuando lo
 * que se devuelve venía de un fiado, y confundirlo con el efectivo haría cuadrar
 * la gaveta contra dinero que nunca se movió.
 *
 * En los dos casos la mercancía vuelve al anaquel y el día vendió menos.
 */

export type MotivoDevolucion = 'no_gusto' | 'mal_estado' | 'error_pedido' | 'de_mas' | 'otro'

export const MOTIVOS_DEVOLUCION: Array<{ id: MotivoDevolucion; nombre: string }> = [
  { id: 'mal_estado', nombre: 'Venía en mal estado' },
  { id: 'no_gusto', nombre: 'No le gustó' },
  { id: 'error_pedido', nombre: 'Se despachó lo que no era' },
  { id: 'de_mas', nombre: 'Se llevó de más' },
  { id: 'otro', nombre: 'Otro' },
]

export interface LineaDevolucion {
  id: UUID
  productoId: UUID
  presentacionId: UUID
  /** En la presentación elegida */
  cantidad: number
  /** Lo mismo en unidades base, que es como vuelve al anaquel */
  cantidadBase: number
  /** A cuánto se le había vendido */
  precioUnitario: number
  importe: number
  costoUnitario: number
}

export interface Devolucion {
  id: UUID
  dia: DiaNegocio
  fecha: number
  usuarioId: UUID
  /** Nulo si fue un cliente de paso: en efectivo no hace falta saber quién */
  clienteId: UUID | null
  modo: 'efectivo' | 'cuenta'
  motivo: MotivoDevolucion
  lineas: LineaDevolucion[]
  /** Lo que se le devuelve o se le descuenta */
  total: number
  /** Lo que costó la mercancía que vuelve */
  costoTotal: number
  unidades: number
  /**
   * Si la mercancía vuelve al anaquel para venderse otra vez.
   *
   * Una cerveza devuelta en mal estado no se vuelve a vender: entra al sistema
   * y sale como merma el mismo día. Marcarla como recuperable la dejaría en el
   * stock y alguien la vendería.
   */
  vuelveAlStock: boolean
  nota: string | null
  creadaOffline: boolean
  sincronizadaEn: number | null
}

export interface EntradaLineaDevolucion {
  producto: Producto
  presentacion: Presentacion
  cantidad: number
  /** El precio al que se le vendió */
  precioUnitario: number
}

export interface DatosDevolucion {
  dia: DiaNegocio
  fecha: number
  usuarioId: UUID
  clienteId?: UUID | null
  modo: 'efectivo' | 'cuenta'
  motivo: MotivoDevolucion
  vuelveAlStock: boolean
  nota?: string | null
  creadaOffline: boolean
}

export function construirDevolucion(
  entradas: EntradaLineaDevolucion[],
  datos: DatosDevolucion,
): Devolucion | null {
  const lineas: LineaDevolucion[] = []
  for (const e of entradas) {
    if (e.cantidad <= 0) continue
    const cantidadBase = aUnidadesBase(e.cantidad, e.presentacion)
    lineas.push({
      id: crypto.randomUUID(),
      productoId: e.producto.id,
      presentacionId: e.presentacion.id,
      cantidad: e.cantidad,
      cantidadBase,
      precioUnitario: redondear(e.precioUnitario, 2),
      importe: redondear(e.precioUnitario * e.cantidad, 2),
      costoUnitario: e.producto.costoPromedio,
    })
  }
  if (lineas.length === 0) return null

  // A cuenta hace falta saber a quién se le baja la deuda. Sin cliente no hay
  // cuenta que tocar, y guardarla así dejaría una devolución que no descuenta
  // nada de ningún lado.
  if (datos.modo === 'cuenta' && !datos.clienteId) return null

  return {
    id: crypto.randomUUID(),
    dia: datos.dia,
    fecha: datos.fecha,
    usuarioId: datos.usuarioId,
    clienteId: datos.clienteId ?? null,
    modo: datos.modo,
    motivo: datos.motivo,
    lineas,
    total: redondear(
      lineas.reduce((s, l) => s + l.importe, 0),
      2,
    ),
    costoTotal: redondear(
      lineas.reduce((s, l) => s + l.costoUnitario * l.cantidadBase, 0),
      2,
    ),
    unidades: redondear(
      lineas.reduce((s, l) => s + l.cantidadBase, 0),
      3,
    ),
    vuelveAlStock: datos.vuelveAlStock,
    nota: datos.nota?.trim() || null,
    creadaOffline: datos.creadaOffline,
    sincronizadaEn: null,
  }
}

/**
 * Los asientos de kardex: la mercancía entra, en positivo.
 *
 * Si no vuelve al stock no se genera ninguno. Lo que se rompió o venía malo no
 * entra al anaquel ni un minuto: darle entrada y luego merma dejaría el mismo
 * saldo pero con dos asientos que se contradicen a la vista.
 */
export function movimientosDeDevolucion(
  d: Devolucion,
  ubicacionId: UUID,
): MovimientoInventario[] {
  if (!d.vuelveAlStock) return []
  return d.lineas.map((l) => ({
    id: crypto.randomUUID(),
    fecha: d.fecha,
    tipo: 'devolucion_cliente' as const,
    productoId: l.productoId,
    presentacionId: l.presentacionId,
    cantidadPresentacion: l.cantidad,
    cantidadBase: l.cantidadBase,
    ubicacionId,
    ubicacionDestinoId: null,
    costoUnitario: l.costoUnitario,
    documentoTipo: 'devolucion',
    documentoId: d.id,
    usuarioId: d.usuarioId,
    motivo: d.motivo,
  }))
}

/** Lo devuelto en efectivo un día: sale de la gaveta */
export function devueltoEnEfectivo(dia: DiaNegocio, devoluciones: Devolucion[]): number {
  return redondear(
    devoluciones
      .filter((d) => d.dia === dia && d.modo === 'efectivo')
      .reduce((s, d) => s + d.total, 0),
    2,
  )
}

/** Lo devuelto a cuenta un día: baja deuda, no toca la gaveta */
export function devueltoACuenta(dia: DiaNegocio, devoluciones: Devolucion[]): number {
  return redondear(
    devoluciones
      .filter((d) => d.dia === dia && d.modo === 'cuenta')
      .reduce((s, d) => s + d.total, 0),
    2,
  )
}

/** Cuánto se le ha descontado a un cliente por devoluciones a cuenta */
export function devueltoACuentaDe(clienteId: UUID, devoluciones: Devolucion[]): number {
  return redondear(
    devoluciones
      .filter((d) => d.modo === 'cuenta' && d.clienteId === clienteId)
      .reduce((s, d) => s + d.total, 0),
    2,
  )
}
