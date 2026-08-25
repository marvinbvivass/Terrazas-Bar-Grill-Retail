import { describe, expect, it } from 'vitest'
import { aPresentacion, aUnidadesBase, desglosar, desgloseCorto } from './stock'
import { BOTELLA, CAJA36, PRESENTACIONES_POLAR, SIXPACK } from './fixtures'
import type { Presentacion } from './types'

describe('conversión presentación ↔ unidad base', () => {
  it('convierte cajas a unidades base', () => {
    expect(aUnidadesBase(10, CAJA36)).toBe(360)
    expect(aUnidadesBase(1, SIXPACK)).toBe(6)
    expect(aUnidadesBase(3, BOTELLA)).toBe(3)
  })

  it('convierte unidades base de vuelta a la presentación', () => {
    expect(aPresentacion(360, CAJA36)).toBe(10)
    expect(aPresentacion(6, SIXPACK)).toBe(1)
  })

  it('soporta presentaciones fraccionadas: un trago de 45ml de una botella de 750', () => {
    const trago: Presentacion = {
      id: 'pres-trago',
      productoId: 'prod-ron',
      nombre: 'Trago 45ml',
      factor: 0.06,
      esBase: false,
      permiteVenta: true,
      permiteCompra: false,
      activo: true,
    }
    // una botella rinde ~16 tragos
    expect(aUnidadesBase(1, trago)).toBe(0.06)
    expect(aUnidadesBase(16, trago)).toBe(0.96)
  })
})

describe('desglosar', () => {
  // Estos son los mismos números que devolvió la función desglosar() del
  // esquema SQL corriendo en PostgreSQL 16.
  it('traduce 312 unidades a 8 cajas + 4 six-packs + 0 sueltas', () => {
    const d = desglosar(312, PRESENTACIONES_POLAR)
    expect(d).toEqual([
      { presentacion: 'Caja x36', presentacionId: CAJA36.id, cantidad: 8 },
      { presentacion: 'Six-pack', presentacionId: SIXPACK.id, cantidad: 4 },
      { presentacion: 'Botella', presentacionId: BOTELLA.id, cantidad: 0 },
    ])
  })

  it('traduce 306 unidades a 8 cajas + 3 six-packs + 0 sueltas', () => {
    const d = desglosar(306, PRESENTACIONES_POLAR).map((x) => x.cantidad)
    expect(d).toEqual([8, 3, 0])
  })

  it('deja el resto en la presentación base', () => {
    const d = desglosar(41, PRESENTACIONES_POLAR).map((x) => x.cantidad)
    expect(d).toEqual([1, 0, 5]) // 36 + 0 + 5
  })

  it('devuelve todo en cero cuando no hay stock', () => {
    expect(desglosar(0, PRESENTACIONES_POLAR).every((d) => d.cantidad === 0)).toBe(true)
  })

  it('ignora las presentaciones fraccionadas: un trago no es unidad de conteo', () => {
    const trago: Presentacion = { ...BOTELLA, id: 'pres-trago', nombre: 'Trago', factor: 0.06, esBase: false }
    const d = desglosar(40, [...PRESENTACIONES_POLAR, trago])
    expect(d.some((x) => x.presentacion === 'Trago')).toBe(false)
  })

  it('el desglose siempre suma la cantidad original', () => {
    for (const total of [0, 1, 5, 35, 36, 37, 231, 232, 359, 1000]) {
      const suma = desglosar(total, PRESENTACIONES_POLAR).reduce((s, d) => {
        const p = PRESENTACIONES_POLAR.find((x) => x.id === d.presentacionId)!
        return s + d.cantidad * p.factor
      }, 0)
      expect(suma).toBe(total)
    }
  })

  it('desgloseCorto salta los ceros', () => {
    expect(desgloseCorto(232, PRESENTACIONES_POLAR)).toBe('6 caja x36 · 2 six-pack · 4 botella')
    expect(desgloseCorto(0, PRESENTACIONES_POLAR)).toBe('0')
  })
})
