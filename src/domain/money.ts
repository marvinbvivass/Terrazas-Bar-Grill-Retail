import type { Moneda, MonedaCodigo } from './types'

/**
 * Dinero. Todo el sistema trabaja en la moneda base (USD) y convierte solo
 * para mostrar y para cobrar.
 *
 * El redondeo no es un detalle: si cada línea se suma sin redondear, el total
 * termina con un céntimo de diferencia contra la suma que hace el cajero a
 * mano, y esa diferencia es la que aparece en el arqueo al cierre.
 * Regla: se redondea el importe de cada línea, y el total es la suma de
 * importes ya redondeados.
 */

export const MONEDAS: Record<MonedaCodigo, Moneda> = {
  USD: { codigo: 'USD', nombre: 'Dólar', decimales: 2, simbolo: '$' },
  VES: { codigo: 'VES', nombre: 'Bolívar', decimales: 2, simbolo: 'Bs' },
  COP: { codigo: 'COP', nombre: 'Peso', decimales: 0, simbolo: 'COL$' },
}

export const MONEDA_BASE: MonedaCodigo = 'USD'

/**
 * Redondeo medio-arriba que no se rompe con los artefactos de coma flotante.
 * `Math.round(1.005 * 100) / 100` da 1 en JavaScript; esto da 1.01.
 */
export function redondear(valor: number, decimales = 2): number {
  if (!Number.isFinite(valor)) return 0
  const signo = valor < 0 ? -1 : 1
  const abs = Math.abs(valor)
  const desplazado = Number(`${abs}e${decimales}`)
  const redondeado = Math.round(
    // corrige el caso en que el desplazamiento ya perdió precisión
    Number.isInteger(desplazado) ? desplazado : Number(desplazado.toFixed(6)),
  )
  const resultado = Number(`${redondeado}e-${decimales}`)
  return resultado === 0 ? 0 : signo * resultado
}

/** Redondea a los decimales que usa esa moneda (el peso colombiano no tiene céntimos) */
export function redondearMoneda(valor: number, moneda: MonedaCodigo): number {
  return redondear(valor, MONEDAS[moneda].decimales)
}

/** Convierte de moneda base a otra moneda usando la tasa dada */
export function convertir(montoBase: number, moneda: MonedaCodigo, tasa: number): number {
  if (moneda === MONEDA_BASE) return redondearMoneda(montoBase, moneda)
  return redondearMoneda(montoBase * tasa, moneda)
}

/** Convierte de otra moneda a la moneda base */
export function aBase(monto: number, moneda: MonedaCodigo, tasa: number): number {
  if (moneda === MONEDA_BASE) return redondear(monto, 2)
  if (tasa <= 0) return 0
  return redondear(monto / tasa, 2)
}

/** Formato para pantalla: $ 12,50 · Bs 456,25 · COL$ 48.000 */
export function formato(monto: number, moneda: MonedaCodigo): string {
  const m = MONEDAS[moneda]
  const texto = redondearMoneda(monto, moneda).toLocaleString('es-VE', {
    minimumFractionDigits: m.decimales,
    maximumFractionDigits: m.decimales,
  })
  return `${m.simbolo} ${texto}`
}

/** Solo el número, sin símbolo. Para campos de entrada y para el ticket. */
export function formatoNumero(monto: number, moneda: MonedaCodigo): string {
  const m = MONEDAS[moneda]
  return redondearMoneda(monto, moneda).toLocaleString('es-VE', {
    minimumFractionDigits: m.decimales,
    maximumFractionDigits: m.decimales,
  })
}

/**
 * Lee lo que el cajero teclea. Acepta coma o punto como decimal, porque en
 * el teclado numérico de una caja lo que hay es una coma y nadie la va a
 * cambiar por el sistema.
 */
export function parsearMonto(texto: string): number {
  const limpio = texto.replace(/[^\d.,-]/g, '').replace(/\.(?=.*[.,])/g, '').replace(',', '.')
  const n = Number.parseFloat(limpio)
  return Number.isFinite(n) ? n : 0
}
