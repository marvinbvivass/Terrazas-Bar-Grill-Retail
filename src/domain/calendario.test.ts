import { describe, expect, it } from 'vitest'
import {
  DIAS_SEMANA,
  mesAnterior,
  mesSiguiente,
  nombreDelMes,
  primerDiaDelMes,
  rejillaDelMes,
} from './calendario'

describe('la rejilla del mes', () => {
  it('siempre trae seis semanas', () => {
    // Siempre 42 celdas: si el alto cambiara al pasar de mes, el botón de
    // abajo saltaría bajo el dedo justo cuando lo van a tocar.
    expect(rejillaDelMes('2026-09-15')).toHaveLength(42)
    expect(rejillaDelMes('2026-02-10')).toHaveLength(42)
  })

  it('empieza en lunes, no en domingo', () => {
    expect(DIAS_SEMANA[0]).toBe('LU')
    // El 1 de septiembre de 2026 es martes: la primera celda es el lunes 31.
    const r = rejillaDelMes('2026-09-15')
    expect(r[0]?.dia).toBe('2026-08-31')
    expect(r[1]?.dia).toBe('2026-09-01')
  })

  it('rellena los huecos con los días del mes vecino y los marca', () => {
    const r = rejillaDelMes('2026-09-15')
    expect(r[0]?.delMes).toBe(false)
    expect(r[1]?.delMes).toBe(true)
    // Septiembre tiene 30 días: del 31 de agosto al 30 de septiembre son 31.
    expect(r.filter((c) => c.delMes)).toHaveLength(30)
  })

  it('un mes que empieza en lunes no lleva relleno delante', () => {
    // El 1 de junio de 2026 es lunes.
    const r = rejillaDelMes('2026-06-10')
    expect(r[0]?.dia).toBe('2026-06-01')
    expect(r[0]?.delMes).toBe(true)
  })

  it('marca hoy y distingue el futuro', () => {
    const r = rejillaDelMes('2026-09-15', '2026-09-15')
    const hoy = r.find((c) => c.esHoy)
    expect(hoy?.dia).toBe('2026-09-15')
    expect(r.find((c) => c.dia === '2026-09-16')?.futuro).toBe(true)
    expect(r.find((c) => c.dia === '2026-09-14')?.futuro).toBe(false)
  })

  it('febrero de un año bisiesto trae sus 29 días', () => {
    expect(rejillaDelMes('2028-02-10').filter((c) => c.delMes)).toHaveLength(29)
  })
})

describe('moverse de mes', () => {
  it('avanza y retrocede sin salirse del calendario', () => {
    expect(mesSiguiente('2026-09-15')).toBe('2026-10-01')
    expect(mesAnterior('2026-09-15')).toBe('2026-08-01')
  })

  it('cruza el fin de año', () => {
    expect(mesSiguiente('2026-12-05')).toBe('2027-01-01')
    expect(mesAnterior('2027-01-20')).toBe('2026-12-01')
  })

  it('no se desborda al pasar de un mes largo a uno corto', () => {
    // Saltando desde el 31 de enero, el mes siguiente tiene que ser febrero y
    // no marzo: por eso se ancla siempre al día 1 antes de sumar.
    expect(mesSiguiente('2026-01-31')).toBe('2026-02-01')
  })

  it('el ancla del mes es siempre el día 1', () => {
    expect(primerDiaDelMes('2026-09-30')).toBe('2026-09-01')
  })
})

describe('el encabezado', () => {
  it('dice el mes y el año en español', () => {
    const texto = nombreDelMes('2026-09-15')
    expect(texto).toContain('septiembre')
    expect(texto).toContain('2026')
  })
})
