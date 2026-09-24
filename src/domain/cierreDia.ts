import { cuadrar, type Recibido } from './cuadre'
import { redondear } from './money'
import type { DiaNegocio, MonedaCodigo, UUID } from './types'

/**
 * El acta del día.
 *
 * Hasta ahora los montos que el encargado tecleaba al cerrar servían un segundo
 * para calcular la diferencia y se tiraban. En ninguna parte quedaba escrito
 * "el 24 de septiembre entraron 180 $, 4.200 Bs y 60.000 pesos, con la tasa a
 * 36,50 y 4.100, y sobraron quince céntimos". Este documento es eso.
 *
 * ---------------------------------------------------------------------------
 * Por qué las tasas van dentro y no se consultan después
 * ---------------------------------------------------------------------------
 *
 * La tasa cambia todos los días. Si el acta guardara solo "4.200 Bs" y el
 * total en dólares se recalculara al abrirla en noviembre, el cierre de
 * septiembre daría otro número — y el dueño estaría revisando una cuenta que
 * nadie hizo nunca. Por eso cada monto lleva pegada la tasa con la que se
 * convirtió y el resultado ya calculado. El acta se lee, no se recalcula.
 *
 * ---------------------------------------------------------------------------
 * El identificador es el día
 * ---------------------------------------------------------------------------
 *
 * `cierre-2026-09-24`, no un UUID al azar. Un día tiene un cierre y solo uno,
 * así que cerrar dos veces el mismo día sobrescribe el mismo documento en vez
 * de dejar dos actas contradictorias, y reintentar el envío al servidor es
 * seguro por la misma razón.
 */

export interface MontoRecibido {
  moneda: MonedaCodigo
  /** Lo que se contó, en su propia moneda */
  monto: number
  /** La tasa de ese día. Congelada: sin esto el acta no se puede releer. */
  tasa: number
  /** El mismo monto en dólares, ya calculado */
  enBase: number
}

export interface CreditoOtorgado {
  clienteId: UUID
  /** Copiado a propósito: si mañana se corrige el nombre, el acta no cambia */
  clienteNombre: string
  /** En dólares */
  monto: number
  /** La venta a crédito que se creó por este renglón */
  ventaId: UUID
}

export interface CierreDia {
  /** `cierre-YYYY-MM-DD` */
  id: string
  dia: DiaNegocio
  cerradoEn: number
  usuarioId: string

  /** Todo lo que salió del inventario */
  totalVendido: number
  /** De eso, lo que se fio */
  totalCredito: number
  /** vendido − fiado: lo que tenía que haber en la gaveta */
  esperado: number
  /** Lo que de verdad se contó, en dólares */
  totalRecibido: number
  /** recibido − esperado */
  diferencia: number
  tolerancia: number
  cuadra: boolean

  recibido: MontoRecibido[]
  creditos: CreditoOtorgado[]
  /** Las tasas del día, tal como estaban al cerrar */
  tasas: Record<string, number>

  unidades: number
  costo: number
  /** vendido − costo */
  margen: number

  nota: string | null
  /** Cuándo se reabrió, si se reabrió. El acta nunca se borra. */
  reabiertoEn: number | null
  sincronizadoEn: number | null
}

export function idDeCierre(dia: DiaNegocio): string {
  return `cierre-${dia}`
}

export interface EntradaCierreDia {
  dia: DiaNegocio
  usuarioId: string
  totalVendido: number
  unidades: number
  costo: number
  recibido: Recibido
  creditos: CreditoOtorgado[]
  tasas: Record<string, number>
  nota?: string | null
  /** Inyectable para las pruebas */
  ahora?: number
}

export function construirCierreDia(e: EntradaCierreDia): CierreDia {
  const totalCredito = redondear(
    e.creditos.reduce((s, c) => s + c.monto, 0),
    2,
  )

  const c = cuadrar({
    totalVendido: e.totalVendido,
    credito: totalCredito,
    recibido: e.recibido,
    tasas: e.tasas,
  })

  const recibido: MontoRecibido[] = c.lineas.map((l) => ({
    moneda: l.moneda,
    monto: l.monto,
    tasa: l.moneda === 'USD' ? 1 : (e.tasas[l.moneda] ?? 0),
    enBase: l.enBase,
  }))

  const totalVendido = redondear(e.totalVendido, 2)
  const costo = redondear(e.costo, 2)

  return {
    id: idDeCierre(e.dia),
    dia: e.dia,
    cerradoEn: e.ahora ?? Date.now(),
    usuarioId: e.usuarioId,
    totalVendido,
    totalCredito,
    esperado: c.esperado,
    totalRecibido: c.totalRecibido,
    diferencia: c.diferencia,
    tolerancia: c.tolerancia,
    cuadra: c.cuadra,
    recibido,
    creditos: e.creditos,
    tasas: e.tasas,
    unidades: redondear(e.unidades, 3),
    costo,
    margen: redondear(totalVendido - costo, 2),
    nota: e.nota ?? null,
    reabiertoEn: null,
    sincronizadoEn: null,
  }
}
