import { redondear } from './money'
import type { DiaNegocio, MovimientoInventario, Producto, UUID } from './types'

/**
 * Ajustes de inventario: la merma y el conteo físico.
 *
 * Son las dos formas que tiene el anaquel de cambiar sin que haya una venta ni
 * una compra, y hasta ahora no existía ninguna. Una botella rota no tenía cómo
 * salir del sistema, y un conteo que no cuadraba con lo que decía la pantalla
 * no se podía asentar: el encargado solo podía mirar el número equivocado.
 *
 * ---------------------------------------------------------------------------
 * Por qué son dos cosas y no una
 * ---------------------------------------------------------------------------
 *
 * Las dos terminan moviendo existencias, pero responden preguntas distintas y
 * mezclarlas borraría la información que importa.
 *
 * La MERMA dice QUÉ pasó: se rompieron seis, se vencieron dos, el personal se
 * tomó tres. Es una pérdida conocida, con su motivo, y se puede sumar al final
 * del mes para saber cuánto se está yendo por ahí.
 *
 * El CONTEO dice QUE NO CUADRA: había 100 en pantalla y en el anaquel hay 94.
 * No se sabe por qué —de eso se trata— y el sistema no debe inventar una
 * explicación. Si todo se registrara como merma, la diferencia de un conteo
 * quedaría archivada como "rotura" y nadie sabría nunca cuánto se rompe de
 * verdad.
 */

export type MotivoMerma = 'rotura' | 'vencido' | 'consumo' | 'obsequio' | 'robo' | 'otro'

export const MOTIVOS_MERMA: Array<{ id: MotivoMerma; nombre: string }> = [
  { id: 'rotura', nombre: 'Se rompió' },
  { id: 'vencido', nombre: 'Se venció' },
  { id: 'consumo', nombre: 'Consumo del personal' },
  { id: 'obsequio', nombre: 'Obsequio o cortesía' },
  { id: 'robo', nombre: 'Faltante o robo' },
  { id: 'otro', nombre: 'Otro' },
]

export interface LineaAjuste {
  id: UUID
  productoId: UUID
  /**
   * Cuánto cambia el stock, en unidades base y CON SIGNO.
   *
   * Negativo sale, positivo entra. Una merma siempre es negativa; un conteo
   * puede ser de los dos signos, porque aparecer mercancía es tan posible como
   * que falte — y casi siempre significa que algo se cargó mal antes.
   */
  cantidadBase: number
  /** Lo que valía esa mercancía al costo del momento */
  costoUnitario: number
  motivo: MotivoMerma | null
}

export interface AjusteInventario {
  id: UUID
  tipo: 'merma' | 'conteo'
  dia: DiaNegocio
  fecha: number
  usuarioId: UUID
  lineas: LineaAjuste[]
  /**
   * Lo que cuesta el ajuste, siempre en positivo.
   *
   * Es la plata que se fue por la merma, o la que baila en el conteo. Se guarda
   * aparte porque es la cifra que mira el dueño, y recalcularla sumando líneas
   * con signo daría cero en un conteo donde sobran diez y faltan diez, que es
   * justo el caso que hay que ver.
   */
  costoTotal: number
  nota: string | null
  creadoOffline: boolean
  sincronizadoEn: number | null
}

export interface EntradaMerma {
  producto: Producto
  /** Cuántas unidades se perdieron. En positivo: el signo lo pone el sistema. */
  cantidad: number
  motivo: MotivoMerma
}

export interface EntradaConteo {
  producto: Producto
  /** Lo que dice el sistema que hay */
  enSistema: number
  /** Lo que se contó de verdad en el anaquel */
  contado: number
}

export interface DatosAjuste {
  dia: DiaNegocio
  fecha: number
  usuarioId: UUID
  nota?: string | null
  creadoOffline: boolean
}

export function construirMerma(
  entradas: EntradaMerma[],
  datos: DatosAjuste,
): AjusteInventario | null {
  const lineas: LineaAjuste[] = []
  for (const e of entradas) {
    if (e.cantidad <= 0) continue
    lineas.push({
      id: crypto.randomUUID(),
      productoId: e.producto.id,
      // El usuario escribe "se rompieron 6"; el stock baja 6.
      cantidadBase: -e.cantidad,
      costoUnitario: e.producto.costoPromedio,
      motivo: e.motivo,
    })
  }
  if (lineas.length === 0) return null
  return armar('merma', lineas, datos)
}

export function construirConteo(
  entradas: EntradaConteo[],
  datos: DatosAjuste,
): AjusteInventario | null {
  const lineas: LineaAjuste[] = []
  for (const e of entradas) {
    const diferencia = redondear(e.contado - e.enSistema, 3)
    // Lo que ya cuadra no genera asiento. Un movimiento de cero ensucia el
    // kardex y hace creer que alguien tocó ese producto.
    if (diferencia === 0) continue
    lineas.push({
      id: crypto.randomUUID(),
      productoId: e.producto.id,
      cantidadBase: diferencia,
      costoUnitario: e.producto.costoPromedio,
      motivo: null,
    })
  }
  if (lineas.length === 0) return null
  return armar('conteo', lineas, datos)
}

function armar(
  tipo: 'merma' | 'conteo',
  lineas: LineaAjuste[],
  datos: DatosAjuste,
): AjusteInventario {
  const costoTotal = redondear(
    lineas.reduce((s, l) => s + Math.abs(l.cantidadBase) * l.costoUnitario, 0),
    2,
  )
  return {
    id: crypto.randomUUID(),
    tipo,
    dia: datos.dia,
    fecha: datos.fecha,
    usuarioId: datos.usuarioId,
    lineas,
    costoTotal,
    nota: datos.nota?.trim() || null,
    creadoOffline: datos.creadoOffline,
    sincronizadoEn: null,
  }
}

/**
 * Los asientos de kardex del ajuste.
 *
 * La presentación va nula a propósito: una merma o un conteo se cuentan en
 * unidades sueltas, no en cajas. Nadie rompe "media caja".
 */
export function movimientosDeAjuste(
  a: AjusteInventario,
  ubicacionId: UUID,
): MovimientoInventario[] {
  return a.lineas.map((l) => ({
    id: crypto.randomUUID(),
    fecha: a.fecha,
    tipo: a.tipo,
    productoId: l.productoId,
    presentacionId: null,
    cantidadPresentacion: Math.abs(l.cantidadBase),
    cantidadBase: l.cantidadBase,
    ubicacionId,
    ubicacionDestinoId: null,
    costoUnitario: l.costoUnitario,
    documentoTipo: a.tipo,
    documentoId: a.id,
    usuarioId: a.usuarioId,
    motivo: l.motivo,
  }))
}

export interface ResumenConteo {
  /** Productos que no coincidían */
  descuadrados: number
  faltaron: number
  sobraron: number
  /** Valor de lo que falta, en positivo */
  valorFaltante: number
  /** Valor de lo que sobra */
  valorSobrante: number
}

/** Para poder enseñar el resultado antes de guardarlo */
export function resumirConteo(entradas: EntradaConteo[]): ResumenConteo {
  let faltaron = 0
  let sobraron = 0
  let valorFaltante = 0
  let valorSobrante = 0
  let descuadrados = 0

  for (const e of entradas) {
    const d = redondear(e.contado - e.enSistema, 3)
    if (d === 0) continue
    descuadrados++
    if (d < 0) {
      faltaron += -d
      valorFaltante += -d * e.producto.costoPromedio
    } else {
      sobraron += d
      valorSobrante += d * e.producto.costoPromedio
    }
  }

  return {
    descuadrados,
    faltaron: redondear(faltaron, 3),
    sobraron: redondear(sobraron, 3),
    valorFaltante: redondear(valorFaltante, 2),
    valorSobrante: redondear(valorSobrante, 2),
  }
}
