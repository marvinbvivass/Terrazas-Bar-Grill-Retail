import { describe, expect, it } from 'vitest'
import { calcularCierre, masVendidos } from './cierre'
import {
  agregar,
  agregarPago,
  carritoVacio,
  construirVentaContado,
  construirVentaCredito,
  crearPago,
  recalcular,
} from './cart'
import { construirAbono, planificarAbono, saldoDeCliente, ventasAbiertas } from './credito'
import {
  BOTELLA,
  CATALOGO,
  EFECTIVO_BS,
  EFECTIVO_USD,
  PAGO_MOVIL,
  POLAR,
  PRESENTACIONES_MAPA,
  SALA,
  TASA_VES,
} from './fixtures'
import type { MetodoPago, Venta } from './types'

const METODOS: MetodoPago[] = [EFECTIVO_USD, EFECTIVO_BS, PAGO_MOVIL]
const JUAN = 'cli-juan'

function carritoDe(botellas: number) {
  let c = carritoVacio()
  c = agregar(c, { producto: POLAR, presentacion: BOTELLA, ubicacionId: SALA.id, cantidad: botellas })
  return recalcular(c, PRESENTACIONES_MAPA, CATALOGO, 1_700_000_000_000)
}

const datos = (dia: string) => ({
  dia,
  fecha: new Date(`${dia}T19:00:00`).getTime(),
  usuarioId: 'u1',
  folioProvisional: 'P-001',
  tasas: { VES: TASA_VES },
  creadaOffline: false,
})

/** Venta de contado pagada con el método indicado */
function contado(dia: string, botellas: number, metodo: MetodoPago = EFECTIVO_BS): Venta {
  let c = carritoDe(botellas)
  const tasa = metodo.moneda === 'USD' ? 1 : TASA_VES
  c = agregarPago(c, crearPago({ metodo, montoAplicado: botellas, tasa }))
  return construirVentaContado(c, datos(dia))
}

function credito(dia: string, botellas: number): Venta {
  return construirVentaCredito(carritoDe(botellas), datos(dia), JUAN)
}

describe('cierre del día', () => {
  it('separa lo que entró en caja de lo que se vendió', () => {
    // Lunes: se venden 30 de contado y se fían 20
    const ventas = [contado('2026-08-24', 30), credito('2026-08-24', 20)]

    const c = calcularCierre({ dia: '2026-08-24', ventas, abonos: [], metodosPago: METODOS })

    expect(c.contado).toBe(30)
    expect(c.fiadoHoy).toBe(20)
    expect(c.cobrosCredito).toBe(0)

    // La gaveta tiene 30, aunque se vendieron 50
    expect(c.entroEnCaja).toBe(30)
    expect(c.vendidoHoy).toBe(50)

    // El inventario salió por las 50 unidades, fiadas incluidas
    expect(c.unidades).toBe(50)
    expect(c.costoVendido).toBe(30) // 50 × 0,60
    expect(c.margen).toBe(20)
  })

  it('el cobro de un crédito viejo entra en la caja del día que se cobra', () => {
    const ventaFiada = credito('2026-08-24', 20)
    const ventaContadoMartes = contado('2026-08-25', 12)

    const abiertas = ventasAbiertas(JUAN, [ventaFiada], [], '2026-08-25')
    const plan = planificarAbono(abiertas, 20)
    const abono = construirAbono(
      {
        clienteId: JUAN,
        dia: '2026-08-25',
        fecha: new Date('2026-08-25T11:00:00').getTime(),
        monto: 20,
        pagos: [crearPago({ metodo: EFECTIVO_BS, montoAplicado: 20, tasa: TASA_VES })],
        usuarioId: 'u1',
      },
      plan,
    )

    const ventas = [ventaFiada, ventaContadoMartes]

    // Lunes: se fiaron 20, no entró nada
    const lunes = calcularCierre({ dia: '2026-08-24', ventas, abonos: [abono], metodosPago: METODOS })
    expect(lunes.entroEnCaja).toBe(0)
    expect(lunes.fiadoHoy).toBe(20)
    expect(lunes.vendidoHoy).toBe(20)

    // Martes: entran los 12 de contado + los 20 que pagó Juan
    const martes = calcularCierre({ dia: '2026-08-25', ventas, abonos: [abono], metodosPago: METODOS })
    expect(martes.contado).toBe(12)
    expect(martes.cobrosCredito).toBe(20)
    expect(martes.entroEnCaja).toBe(32)

    // Pero el martes solo se vendieron 12: los otros 20 salieron el lunes
    expect(martes.vendidoHoy).toBe(12)
    expect(martes.unidades).toBe(12)

    // Y la deuda quedó en cero
    expect(saldoDeCliente(JUAN, ventas, [abono])).toBe(0)
  })

  it('un abono parcial solo mete en caja lo que se abonó', () => {
    const fiada = credito('2026-08-24', 20)
    const plan = planificarAbono(ventasAbiertas(JUAN, [fiada], [], '2026-08-26'), 8)
    const abono = construirAbono(
      {
        clienteId: JUAN,
        dia: '2026-08-26',
        fecha: 0,
        monto: 8,
        pagos: [crearPago({ metodo: PAGO_MOVIL, montoAplicado: 8, tasa: TASA_VES, referencia: '9911' })],
        usuarioId: 'u1',
      },
      plan,
    )

    const c = calcularCierre({ dia: '2026-08-26', ventas: [fiada], abonos: [abono], metodosPago: METODOS })
    expect(c.cobrosCredito).toBe(8)
    expect(c.entroEnCaja).toBe(8)
    expect(c.vendidoHoy).toBe(0) // ese día no se vendió nada
    expect(saldoDeCliente(JUAN, [fiada], [abono])).toBe(12)
  })

  it('desglosa lo que hay que contar en la gaveta por método y por moneda', () => {
    const ventas = [
      contado('2026-08-24', 10, EFECTIVO_USD),
      contado('2026-08-24', 20, EFECTIVO_BS),
    ]
    const c = calcularCierre({ dia: '2026-08-24', ventas, abonos: [], metodosPago: METODOS })

    const usd = c.porMetodo.find((m) => m.moneda === 'USD')!
    const ves = c.porMetodo.find((m) => m.moneda === 'VES')!

    expect(usd.enMoneda).toBe(10.3) // 10 + IGTF 0,30
    expect(usd.igtf).toBe(0.3)
    expect(ves.enMoneda).toBe(730) // 20 × 36,50
    expect(ves.igtf).toBe(0)

    expect(c.igtf).toBe(0.3)
    expect(c.contado).toBe(30)
    // La suma en moneda base tiene que cuadrar contra el contado más el IGTF
    const enBase = c.porMetodo.reduce((s, m) => s + m.enBase, 0)
    expect(Math.round(enBase * 100) / 100).toBe(30.3)
  })

  it('no cuenta ventas de otro día ni las anuladas', () => {
    const ventas = [
      contado('2026-08-24', 10),
      contado('2026-08-25', 99),
      { ...contado('2026-08-24', 50), estado: 'anulada' as const },
    ]
    const c = calcularCierre({ dia: '2026-08-24', ventas, abonos: [], metodosPago: METODOS })
    expect(c.contado).toBe(10)
    expect(c.numVentasContado).toBe(1)
  })

  it('un día sin movimiento da todo en cero, no rompe', () => {
    const c = calcularCierre({ dia: '2026-08-30', ventas: [], abonos: [], metodosPago: METODOS })
    expect(c.entroEnCaja).toBe(0)
    expect(c.vendidoHoy).toBe(0)
    expect(c.porMetodo).toEqual([])
    expect(c.margen).toBe(0)
  })

  it('cuenta ventas, créditos y cobros por separado', () => {
    const fiada = credito('2026-08-24', 5)
    const plan = planificarAbono(ventasAbiertas(JUAN, [fiada], [], '2026-08-24'), 5)
    const abono = construirAbono(
      { clienteId: JUAN, dia: '2026-08-24', fecha: 0, monto: 5, pagos: [], usuarioId: 'u1' },
      plan,
    )
    const ventas = [contado('2026-08-24', 3), contado('2026-08-24', 4), fiada]
    const c = calcularCierre({ dia: '2026-08-24', ventas, abonos: [abono], metodosPago: METODOS })

    expect(c.numVentasContado).toBe(2)
    expect(c.numVentasCredito).toBe(1)
    expect(c.numCobros).toBe(1)
  })
})

describe('más vendidos', () => {
  it('agrupa por producto contando fiado y contado', () => {
    const ventas = [contado('2026-08-24', 10), credito('2026-08-24', 5)]
    const top = masVendidos('2026-08-24', ventas)
    expect(top).toHaveLength(1)
    expect(top[0]!.unidades).toBe(15)
    expect(top[0]!.importe).toBe(15)
  })
})
