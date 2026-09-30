import { describe, expect, it } from 'vitest'
import {
  historialDeTasas,
  idTasaDia,
  tasaExactaDe,
  tasasVigentes,
  variacion,
  type TasaDia,
} from './tasas'

function tasa(dia: string, moneda: 'VES' | 'COP', valor: number): TasaDia {
  return {
    id: idTasaDia(dia, moneda),
    dia,
    moneda,
    tasa: valor,
    registradaEn: Date.parse(`${dia}T08:00:00Z`),
    usuarioId: 'u',
    sincronizadaEn: null,
  }
}

const HISTORIAL = [
  tasa('2026-09-28', 'VES', 36.5),
  tasa('2026-09-28', 'COP', 4100),
  tasa('2026-10-01', 'VES', 38),
  tasa('2026-10-01', 'COP', 4150),
]

describe('qué tasa rige cada día', () => {
  it('la del día, cuando se cargó ese día', () => {
    expect(tasasVigentes('2026-10-01', HISTORIAL)).toEqual({ VES: 38, COP: 4150 })
  })

  it('arrastra la anterior cuando nadie la cargó', () => {
    // El 29 y el 30 nadie tecleó nada: sigue corriendo la del 28.
    expect(tasasVigentes('2026-09-30', HISTORIAL)).toEqual({ VES: 36.5, COP: 4100 })
  })

  it('NUNCA mira hacia adelante', () => {
    // El 29 vale 36,5 aunque el 1 de octubre ya sea 38. Tomar la del futuro
    // reescribiría hacia atrás un cierre que ya se hizo.
    expect(tasasVigentes('2026-09-29', HISTORIAL).VES).toBe(36.5)
  })

  it('antes de la primera tasa cargada no hay ninguna', () => {
    expect(tasasVigentes('2026-09-01', HISTORIAL)).toEqual({})
  })

  it('cada moneda se arrastra por su cuenta', () => {
    const mezcla = [tasa('2026-09-28', 'VES', 36.5), tasa('2026-10-01', 'COP', 4150)]
    expect(tasasVigentes('2026-10-01', mezcla)).toEqual({ VES: 36.5, COP: 4150 })
  })
})

describe('corregir la tasa de un día', () => {
  it('el identificador es día y moneda, así que se sobrescribe', () => {
    expect(idTasaDia('2026-09-28', 'VES')).toBe('2026-09-28::VES')
    // Volver a cargarla corrige la que había en vez de dejar dos.
    expect(tasa('2026-09-28', 'VES', 99).id).toBe(HISTORIAL[0]!.id)
  })

  it('distingue la tasa cargada de la arrastrada', () => {
    expect(tasaExactaDe('2026-09-28', 'VES', HISTORIAL)?.tasa).toBe(36.5)
    // El 30 no tiene tasa propia aunque le rija la del 28.
    expect(tasaExactaDe('2026-09-30', 'VES', HISTORIAL)).toBeUndefined()
  })
})

describe('el historial', () => {
  it('va del día más nuevo al más viejo, con las dos monedas juntas', () => {
    const h = historialDeTasas(HISTORIAL)
    expect(h.map((x) => x.dia)).toEqual(['2026-10-01', '2026-09-28'])
    expect(h[0]?.tasas).toEqual({ VES: 38, COP: 4150 })
  })

  it('se puede limitar', () => {
    expect(historialDeTasas(HISTORIAL, 1)).toHaveLength(1)
  })
})

describe('la variación contra el día cargado anterior', () => {
  it('avisa de un dedo gordo', () => {
    // 36,5 tecleado como 365 salta como +900%, no como un número más.
    const conError = [tasa('2026-09-28', 'VES', 36.5), tasa('2026-10-01', 'VES', 365)]
    expect(variacion('2026-10-01', 'VES', conError)).toBeCloseTo(900, 0)
  })

  it('una subida normal es un número pequeño', () => {
    expect(variacion('2026-10-01', 'VES', HISTORIAL)).toBeCloseTo(4.11, 1)
  })

  it('la primera tasa no tiene con qué compararse', () => {
    expect(variacion('2026-09-28', 'VES', HISTORIAL)).toBeNull()
  })
})
