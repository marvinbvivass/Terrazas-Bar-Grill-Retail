import type { DiaNegocio, MonedaCodigo } from './types'

/**
 * Las tasas de cambio, día por día.
 *
 * Antes había una sola tasa por moneda —la de hoy— y se pisaba cada mañana. Eso
 * hacía imposible cargar un día atrasado con la tasa que de verdad corría ese
 * día: el lunes se acababa cobrando con el cambio del jueves, y un cierre viejo
 * dejaba de poder releerse porque su tasa ya no existía en ninguna parte.
 *
 * El identificador es día + moneda, así que volver a cargar la tasa de un día
 * corrige la que había en vez de dejar dos contradictorias.
 */

export interface TasaDia {
  /** `YYYY-MM-DD::VES` */
  id: string
  dia: DiaNegocio
  moneda: MonedaCodigo
  /** Cuántos bolívares o pesos vale un dólar ese día */
  tasa: number
  registradaEn: number
  usuarioId: string
  sincronizadaEn: number | null
}

export function idTasaDia(dia: DiaNegocio, moneda: MonedaCodigo): string {
  return `${dia}::${moneda}`
}

/**
 * Las tasas que rigen un día: las de ese día, o las últimas anteriores.
 *
 * Arrastrar la anterior es lo correcto cuando nadie cargó la tasa. El cambio no
 * desaparece porque el encargado no llegara a teclearlo: sigue corriendo el del
 * último día que sí se cargó. Devolver cero dejaría el cierre sin poder
 * convertir nada y marcaría descuadre en cada moneda.
 *
 * Nunca mira hacia adelante. Si el lunes se cargó 36 y el jueves 40, el martes
 * vale 36 — que es lo que se cobró de verdad ese martes. Tomar la del jueves
 * reescribiría hacia atrás un cierre que ya se hizo.
 */
export function tasasVigentes(
  dia: DiaNegocio,
  todas: TasaDia[],
): Record<string, number> {
  const salida: Record<string, number> = {}

  const monedas = new Set(todas.map((t) => t.moneda))
  for (const moneda of monedas) {
    const candidatas = todas
      .filter((t) => t.moneda === moneda && t.dia <= dia)
      .sort((a, b) => b.dia.localeCompare(a.dia))
    const vigente = candidatas[0]
    if (vigente) salida[moneda] = vigente.tasa
  }

  return salida
}

/** La tasa cargada exactamente para ese día, si la hay */
export function tasaExactaDe(
  dia: DiaNegocio,
  moneda: MonedaCodigo,
  todas: TasaDia[],
): TasaDia | undefined {
  return todas.find((t) => t.dia === dia && t.moneda === moneda)
}

export interface DiaConTasas {
  dia: DiaNegocio
  tasas: Partial<Record<MonedaCodigo, number>>
}

/** El historial, del día más nuevo al más viejo, para la pantalla */
export function historialDeTasas(todas: TasaDia[], limite = 60): DiaConTasas[] {
  const porDia = new Map<DiaNegocio, Partial<Record<MonedaCodigo, number>>>()
  for (const t of todas) {
    const fila = porDia.get(t.dia) ?? {}
    fila[t.moneda] = t.tasa
    porDia.set(t.dia, fila)
  }

  return [...porDia.entries()]
    .map(([dia, tasas]) => ({ dia, tasas }))
    .sort((a, b) => b.dia.localeCompare(a.dia))
    .slice(0, limite)
}

/**
 * Cuánto cambió una tasa respecto al día cargado anterior, en porcentaje.
 *
 * Sirve para que un dedo gordo se note: teclear 365 en vez de 36,5 salta a la
 * vista como un +900% y no como un número más en una lista.
 */
export function variacion(
  dia: DiaNegocio,
  moneda: MonedaCodigo,
  todas: TasaDia[],
): number | null {
  const ordenadas = todas
    .filter((t) => t.moneda === moneda)
    .sort((a, b) => a.dia.localeCompare(b.dia))

  const i = ordenadas.findIndex((t) => t.dia === dia)
  if (i <= 0) return null

  const previa = ordenadas[i - 1]
  const actual = ordenadas[i]
  if (!previa || !actual || previa.tasa <= 0) return null

  return ((actual.tasa - previa.tasa) / previa.tasa) * 100
}
