import { redondear } from './money'
import type { Presentacion, UUID } from './types'

/**
 * Conversión entre presentaciones y unidad base.
 *
 * La caja nunca "se abre": entra al inventario como 240 unidades base y sale
 * como 1, 6 o 24. El desglose es aritmética, no un movimiento de stock.
 */

/** 10 cajas × factor 24 = 240 unidades base */
export function aUnidadesBase(cantidad: number, presentacion: Presentacion): number {
  return redondear(cantidad * presentacion.factor, 3)
}

/** 240 unidades base ÷ factor 24 = 10 cajas */
export function aPresentacion(cantidadBase: number, presentacion: Presentacion): number {
  if (presentacion.factor <= 0) return 0
  return redondear(cantidadBase / presentacion.factor, 3)
}

export interface LineaDesglose {
  presentacion: string
  presentacionId: UUID
  cantidad: number
}

/**
 * Traduce el stock base al lenguaje del almacén:
 * 232 botellas → "9 cajas + 2 six-packs + 4 sueltas".
 *
 * Es la misma aritmética que la función `desglosar()` del esquema SQL, y la
 * diferencia entre un conteo físico que cuadra y uno que nadie quiere hacer.
 * Ignora las presentaciones fraccionadas (factor < 1): un trago no es una
 * unidad de conteo.
 */
export function desglosar(cantidadBase: number, presentaciones: Presentacion[]): LineaDesglose[] {
  const ordenadas = presentaciones
    .filter((p) => p.activo && p.factor >= 1)
    .sort((a, b) => b.factor - a.factor)

  let resto = cantidadBase
  const salida: LineaDesglose[] = []

  for (const p of ordenadas) {
    const cantidad = Math.floor(resto / p.factor)
    resto = redondear(resto - cantidad * p.factor, 3)
    salida.push({ presentacion: p.nombre, presentacionId: p.id, cantidad })
  }

  return salida
}

/** El desglose en una línea, saltándose los ceros: "9 cajas · 2 six · 4 und" */
export function desgloseCorto(cantidadBase: number, presentaciones: Presentacion[]): string {
  const partes = desglosar(cantidadBase, presentaciones)
    .filter((d) => d.cantidad > 0)
    .map((d) => `${d.cantidad} ${d.presentacion.toLowerCase()}`)
  return partes.length > 0 ? partes.join(' · ') : '0'
}

export function presentacionBase(presentaciones: Presentacion[]): Presentacion | undefined {
  return presentaciones.find((p) => p.esBase)
}
