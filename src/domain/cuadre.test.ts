import { describe, expect, it } from 'vitest'
import { cuadrar, toleranciaDeRedondeo } from './cuadre'

const TASAS = { VES: 40, COP: 4000 }

describe('cuadre del día', () => {
  it('cuadra cuando todo se recibió en dólares', () => {
    const c = cuadrar({ totalVendido: 120, recibido: { USD: 120 }, tasas: TASAS })
    expect(c.totalRecibido).toBe(120)
    expect(c.diferencia).toBe(0)
    expect(c.cuadra).toBe(true)
  })

  it('convierte bolívares y pesos a dólares con la tasa del día', () => {
    // 40 Bs = 1 $, 4000 COP = 1 $  →  2000 Bs = 50 $, 40000 COP = 10 $
    const c = cuadrar({
      totalVendido: 100,
      recibido: { USD: 40, VES: 2000, COP: 40000 },
      tasas: TASAS,
    })
    expect(c.totalRecibido).toBe(100)
    expect(c.cuadra).toBe(true)
  })

  it('detecta que falta dinero', () => {
    const c = cuadrar({ totalVendido: 100, recibido: { USD: 90 }, tasas: TASAS })
    expect(c.diferencia).toBe(-10)
    expect(c.cuadra).toBe(false)
  })

  it('detecta que sobra dinero', () => {
    const c = cuadrar({ totalVendido: 100, recibido: { USD: 105 }, tasas: TASAS })
    expect(c.diferencia).toBe(5)
    expect(c.cuadra).toBe(false)
  })

  it('no cuadra si se recibió una moneda cuya tasa no está cargada', () => {
    const c = cuadrar({ totalVendido: 50, recibido: { COP: 200000 }, tasas: { VES: 40 } })
    expect(c.faltanTasas).toBe(true)
    expect(c.cuadra).toBe(false)
  })

  it('ignora las monedas que no se usaron', () => {
    const c = cuadrar({ totalVendido: 10, recibido: { USD: 10, VES: 0 }, tasas: TASAS })
    expect(c.lineas.map((l) => l.moneda)).toEqual(['USD'])
  })
})

describe('tolerancia de redondeo', () => {
  it('perdona el peso que no se puede partir', () => {
    // Con COP a 4000 por dólar, un peso vale 0,00025 $. Medio peso es 0,000125.
    // Una diferencia de un peso tiene que seguir contando como cuadrado.
    const unPesoEnDolares = 1 / 4000
    const c = cuadrar({
      totalVendido: 100,
      recibido: { COP: 400000 - 1 },
      tasas: TASAS,
    })
    expect(Math.abs(c.diferencia)).toBeLessThanOrEqual(unPesoEnDolares)
    expect(c.cuadra).toBe(true)
  })

  it('no perdona una diferencia de verdad', () => {
    const c = cuadrar({ totalVendido: 100, recibido: { COP: 396000 }, tasas: TASAS })
    expect(c.diferencia).toBe(-1)
    expect(c.cuadra).toBe(false)
  })

  it('nunca baja de medio céntimo de dólar', () => {
    expect(toleranciaDeRedondeo({ USD: 10 }, TASAS)).toBeGreaterThanOrEqual(0.005)
  })

  it('solo suma la tolerancia de las monedas usadas', () => {
    const soloDolar = toleranciaDeRedondeo({ USD: 10 }, TASAS)
    const conPesos = toleranciaDeRedondeo({ USD: 10, COP: 4000 }, TASAS)
    expect(conPesos).toBeGreaterThan(soloDolar)
  })
})
