import { describe, expect, it } from 'vitest'
import {
  construirConteo,
  construirMerma,
  movimientosDeAjuste,
  resumirConteo,
} from './ajuste'
import { POLAR, SALA } from './fixtures'

const DATOS = {
  dia: '2026-09-30',
  fecha: Date.parse('2026-09-30T12:00:00Z'),
  usuarioId: 'u-encargado',
  creadoOffline: false,
}

// POLAR cuesta 0,60 la botella
const OTRO = { ...POLAR, id: 'prod-otro', nombreCorto: 'Otro', costoPromedio: 2 }

describe('merma', () => {
  it('se escribe en positivo y el stock baja', () => {
    const a = construirMerma([{ producto: POLAR, cantidad: 6, motivo: 'rotura' }], DATOS)!
    expect(a.lineas[0]?.cantidadBase).toBe(-6)
  })

  it('cuenta lo que costó lo que se perdió', () => {
    const a = construirMerma([{ producto: POLAR, cantidad: 6, motivo: 'rotura' }], DATOS)!
    expect(a.costoTotal).toBe(3.6)
  })

  it('guarda el motivo por línea, para poder sumar roturas aparte de cortesías', () => {
    const a = construirMerma(
      [
        { producto: POLAR, cantidad: 6, motivo: 'rotura' },
        { producto: OTRO, cantidad: 2, motivo: 'obsequio' },
      ],
      DATOS,
    )!
    expect(a.lineas.map((l) => l.motivo)).toEqual(['rotura', 'obsequio'])
    // 6 × 0,60 + 2 × 2,00
    expect(a.costoTotal).toBe(7.6)
  })

  it('una merma de cero no se guarda', () => {
    expect(construirMerma([{ producto: POLAR, cantidad: 0, motivo: 'rotura' }], DATOS)).toBeNull()
  })
})

describe('conteo físico', () => {
  it('asienta la diferencia, no lo contado', () => {
    // La pantalla decía 100 y en el anaquel hay 94.
    const a = construirConteo([{ producto: POLAR, enSistema: 100, contado: 94 }], DATOS)!
    expect(a.lineas[0]?.cantidadBase).toBe(-6)
  })

  it('también sirve cuando sobra mercancía', () => {
    const a = construirConteo([{ producto: POLAR, enSistema: 100, contado: 103 }], DATOS)!
    expect(a.lineas[0]?.cantidadBase).toBe(3)
  })

  it('lo que ya cuadra no genera asiento', () => {
    const a = construirConteo(
      [
        { producto: POLAR, enSistema: 100, contado: 100 },
        { producto: OTRO, enSistema: 10, contado: 8 },
      ],
      DATOS,
    )!
    // Un movimiento de cero ensucia el kardex y hace creer que alguien tocó
    // ese producto.
    expect(a.lineas).toHaveLength(1)
    expect(a.lineas[0]?.productoId).toBe(OTRO.id)
  })

  it('si todo cuadra no se guarda nada', () => {
    expect(construirConteo([{ producto: POLAR, enSistema: 100, contado: 100 }], DATOS)).toBeNull()
  })

  it('el conteo no lleva motivo: de eso se trata', () => {
    const a = construirConteo([{ producto: POLAR, enSistema: 100, contado: 94 }], DATOS)!
    // Archivarlo como "rotura" haría imposible saber cuánto se rompe de verdad.
    expect(a.lineas[0]?.motivo).toBeNull()
  })

  it('el costo del descuadre no se cancela cuando sobra tanto como falta', () => {
    const a = construirConteo(
      [
        { producto: POLAR, enSistema: 100, contado: 90 },
        { producto: POLAR, enSistema: 0, contado: 10 },
      ],
      DATOS,
    )!
    // Sumar líneas con signo daría cero, y es justo el caso que hay que ver:
    // hay veinte botellas bailando.
    expect(a.costoTotal).toBe(12)
  })
})

describe('el resumen que se enseña antes de guardar', () => {
  it('separa lo que falta de lo que sobra', () => {
    const r = resumirConteo([
      { producto: POLAR, enSistema: 100, contado: 94 },
      { producto: OTRO, enSistema: 10, contado: 12 },
      { producto: POLAR, enSistema: 5, contado: 5 },
    ])
    expect(r.descuadrados).toBe(2)
    expect(r.faltaron).toBe(6)
    expect(r.sobraron).toBe(2)
    expect(r.valorFaltante).toBe(3.6)
    expect(r.valorSobrante).toBe(4)
  })

  it('un conteo que cuadra entero no reporta nada', () => {
    const r = resumirConteo([{ producto: POLAR, enSistema: 100, contado: 100 }])
    expect(r.descuadrados).toBe(0)
    expect(r.valorFaltante).toBe(0)
  })
})

describe('los asientos de kardex', () => {
  it('llevan el tipo del ajuste, para poder separarlos después', () => {
    const merma = construirMerma([{ producto: POLAR, cantidad: 6, motivo: 'rotura' }], DATOS)!
    const conteo = construirConteo([{ producto: POLAR, enSistema: 100, contado: 94 }], DATOS)!

    expect(movimientosDeAjuste(merma, SALA.id)[0]?.tipo).toBe('merma')
    expect(movimientosDeAjuste(conteo, SALA.id)[0]?.tipo).toBe('conteo')
  })

  it('van sin presentación: nadie rompe media caja', () => {
    const a = construirMerma([{ producto: POLAR, cantidad: 6, motivo: 'rotura' }], DATOS)!
    const m = movimientosDeAjuste(a, SALA.id)[0]
    expect(m?.presentacionId).toBeNull()
    expect(m?.cantidadBase).toBe(-6)
    expect(m?.ubicacionId).toBe(SALA.id)
  })

  it('apuntan al documento que los originó', () => {
    const a = construirMerma([{ producto: POLAR, cantidad: 6, motivo: 'rotura' }], DATOS)!
    expect(movimientosDeAjuste(a, SALA.id).every((m) => m.documentoId === a.id)).toBe(true)
  })
})
