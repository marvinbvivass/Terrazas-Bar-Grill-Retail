import { describe, expect, it } from 'vitest'
import {
  construirDevolucion,
  devueltoACuenta,
  devueltoACuentaDe,
  devueltoEnEfectivo,
  movimientosDeDevolucion,
} from './devolucion'
import { BOTELLA, CAJA36, POLAR, SALA } from './fixtures'

const DATOS = {
  dia: '2026-09-30',
  fecha: Date.parse('2026-09-30T12:00:00Z'),
  usuarioId: 'u-encargado',
  modo: 'efectivo' as const,
  motivo: 'mal_estado' as const,
  vuelveAlStock: false,
  creadaOffline: false,
}

function linea(cantidad = 2, presentacion = BOTELLA, precioUnitario = 1) {
  return { producto: POLAR, presentacion, cantidad, precioUnitario }
}

describe('devolver parte de lo que se llevó', () => {
  it('no hace falta tumbar el día entero para deshacer dos botellas', () => {
    const d = construirDevolucion([linea(2)], DATOS)!
    expect(d.lineas).toHaveLength(1)
    expect(d.total).toBe(2)
    expect(d.unidades).toBe(2)
  })

  it('devolver una caja devuelve las botellas de dentro', () => {
    const d = construirDevolucion([linea(1, CAJA36, 30)], DATOS)!
    expect(d.unidades).toBe(36)
    // Se le devuelve lo que pagó por la caja, no 36 veces el precio suelto.
    expect(d.total).toBe(30)
  })

  it('cuenta lo que costó la mercancía que vuelve', () => {
    const d = construirDevolucion([linea(10)], DATOS)!
    expect(d.costoTotal).toBe(6)
  })

  it('una devolución vacía no se guarda', () => {
    expect(construirDevolucion([linea(0)], DATOS)).toBeNull()
  })
})

describe('las dos formas de devolver', () => {
  it('en efectivo sale plata de la gaveta', () => {
    const d = construirDevolucion([linea(5)], { ...DATOS, modo: 'efectivo' })!
    expect(devueltoEnEfectivo(DATOS.dia, [d])).toBe(5)
    expect(devueltoACuenta(DATOS.dia, [d])).toBe(0)
  })

  it('a cuenta no sale plata: le baja la deuda al cliente', () => {
    const d = construirDevolucion([linea(5)], {
      ...DATOS,
      modo: 'cuenta',
      clienteId: 'c-juan',
    })!
    expect(devueltoEnEfectivo(DATOS.dia, [d])).toBe(0)
    expect(devueltoACuenta(DATOS.dia, [d])).toBe(5)
    expect(devueltoACuentaDe('c-juan', [d])).toBe(5)
  })

  it('a cuenta sin cliente no se guarda: no habría deuda que bajar', () => {
    const d = construirDevolucion([linea(5)], { ...DATOS, modo: 'cuenta', clienteId: null })
    expect(d).toBeNull()
  })

  it('la devolución de un cliente no le baja la deuda a otro', () => {
    const juan = construirDevolucion([linea(5)], {
      ...DATOS,
      modo: 'cuenta',
      clienteId: 'c-juan',
    })!
    expect(devueltoACuentaDe('c-ana', [juan])).toBe(0)
  })

  it('cada día cuenta lo suyo', () => {
    const hoy = construirDevolucion([linea(5)], DATOS)!
    const ayer = construirDevolucion([linea(3)], { ...DATOS, dia: '2026-09-29' })!
    expect(devueltoEnEfectivo('2026-09-30', [hoy, ayer])).toBe(5)
    expect(devueltoEnEfectivo('2026-09-29', [hoy, ayer])).toBe(3)
  })
})

describe('si la mercancía se puede volver a vender', () => {
  it('lo que vuelve al anaquel genera entrada de inventario', () => {
    const d = construirDevolucion([linea(6)], { ...DATOS, vuelveAlStock: true })!
    const movs = movimientosDeDevolucion(d, SALA.id)
    expect(movs).toHaveLength(1)
    // Positivo: entra. La venta usa el mismo campo en negativo.
    expect(movs[0]?.cantidadBase).toBe(6)
    expect(movs[0]?.tipo).toBe('devolucion_cliente')
  })

  it('lo que venía en mal estado NO entra al anaquel', () => {
    const d = construirDevolucion([linea(6)], { ...DATOS, vuelveAlStock: false })!
    // Darle entrada y luego merma dejaría el mismo saldo pero con dos asientos
    // que se contradicen a la vista.
    expect(movimientosDeDevolucion(d, SALA.id)).toEqual([])
  })

  it('el asiento apunta al documento que lo originó', () => {
    const d = construirDevolucion([linea(6)], { ...DATOS, vuelveAlStock: true })!
    expect(movimientosDeDevolucion(d, SALA.id)[0]?.documentoId).toBe(d.id)
  })

  it('aunque no vuelva al stock, la plata sí se devuelve', () => {
    const d = construirDevolucion([linea(6)], { ...DATOS, vuelveAlStock: false })!
    expect(devueltoEnEfectivo(DATOS.dia, [d])).toBe(6)
  })
})
