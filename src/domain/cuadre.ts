import { MONEDAS, MONEDA_BASE, aBase, redondear } from './money'
import type { MonedaCodigo } from './types'

/**
 * El cuadre del día: lo que se vendió contra lo que se recibió.
 *
 * El encargado carga al final del día cuánto vendió de cada producto y cuánto
 * dinero entró en cada moneda. Las dos cifras tienen que dar lo mismo, y este
 * módulo es el que las compara.
 *
 * LO QUE VENDIÓ se calcula en dólares, porque los precios se cargan en dólares.
 * LO QUE RECIBIÓ llega en tres monedas distintas y hay que traerlo a dólares
 * con la tasa del día para poder restarlo.
 *
 * ---------------------------------------------------------------------------
 * Por qué existe una tolerancia y no se exige diferencia cero
 * ---------------------------------------------------------------------------
 *
 * El peso colombiano no tiene céntimos. Si la tasa está en 4.000 pesos por
 * dólar, el billete más pequeño que existe vale 1/4000 de dólar, así que
 * cualquier cobro en pesos trae un error de redondeo que NO es un error del
 * encargado: es que no hay moneda física para pagar la diferencia exacta.
 *
 * Exigir cero dejaría al usuario atascado en el cierre por un descuadre que no
 * puede corregir ni contando otra vez. La tolerancia se calcula a partir de las
 * tasas del día, no es un número inventado: es medio billete mínimo de cada
 * moneda, llevado a dólares.
 */

export type Recibido = Partial<Record<MonedaCodigo, number>>

export interface EntradaCuadre {
  /** Lo vendido de contado, en dólares, calculado desde los precios */
  totalVendido: number
  /** Lo que entró, cada monto EN SU MONEDA (no convertido) */
  recibido: Recibido
  /** Tasas del día: cuántos Bs o pesos vale un dólar */
  tasas: Record<string, number>
}

export interface LineaRecibido {
  moneda: MonedaCodigo
  /** Lo tecleado, en su moneda */
  monto: number
  /** Lo mismo llevado a dólares con la tasa del día */
  enBase: number
  /** Falta la tasa de esa moneda: no se puede convertir */
  sinTasa: boolean
}

export interface Cuadre {
  totalVendido: number
  lineas: LineaRecibido[]
  /** Todo lo recibido, ya en dólares */
  totalRecibido: number
  /** recibido − vendido. Positivo sobra, negativo falta. */
  diferencia: number
  /** Margen que se considera redondeo y no descuadre */
  tolerancia: number
  cuadra: boolean
  /** Alguna moneda con monto pero sin tasa cargada: el cuadre no es fiable */
  faltanTasas: boolean
}

/**
 * Medio billete mínimo de cada moneda, en dólares.
 *
 * Con VES a 2 decimales el billete mínimo es 0,01 Bs; con COP a 0 decimales es
 * 1 peso. Se suma solo la parte de las monedas que de verdad se usaron: si el
 * día fue todo en dólares, la tolerancia es la del dólar y nada más.
 */
export function toleranciaDeRedondeo(recibido: Recibido, tasas: Record<string, number>): number {
  let total = 0
  for (const codigo of Object.keys(MONEDAS) as MonedaCodigo[]) {
    const monto = recibido[codigo] ?? 0
    if (monto === 0) continue
    const minimo = Math.pow(10, -MONEDAS[codigo].decimales) / 2
    if (codigo === MONEDA_BASE) {
      total += minimo
      continue
    }
    const tasa = tasas[codigo] ?? 0
    if (tasa > 0) total += minimo / tasa
  }
  // Nunca por debajo de un céntimo: el propio dólar se redondea a dos decimales.
  return redondear(Math.max(total, 0.005), 4)
}

export function cuadrar(entrada: EntradaCuadre): Cuadre {
  const lineas: LineaRecibido[] = []
  let faltanTasas = false

  for (const codigo of Object.keys(MONEDAS) as MonedaCodigo[]) {
    const monto = entrada.recibido[codigo] ?? 0
    if (monto === 0) continue
    const tasa = entrada.tasas[codigo] ?? 0
    const sinTasa = codigo !== MONEDA_BASE && tasa <= 0
    if (sinTasa) faltanTasas = true
    lineas.push({
      moneda: codigo,
      monto,
      enBase: sinTasa ? 0 : aBase(monto, codigo, tasa),
      sinTasa,
    })
  }

  const totalRecibido = redondear(
    lineas.reduce((s, l) => s + l.enBase, 0),
    2,
  )
  const totalVendido = redondear(entrada.totalVendido, 2)
  const diferencia = redondear(totalRecibido - totalVendido, 2)
  const tolerancia = toleranciaDeRedondeo(entrada.recibido, entrada.tasas)

  return {
    totalVendido,
    lineas,
    totalRecibido,
    diferencia,
    tolerancia,
    // Con una tasa sin cargar el cuadre no significa nada: no se declara cuadrado.
    cuadra: !faltanTasas && Math.abs(diferencia) <= tolerancia,
    faltanTasas,
  }
}
