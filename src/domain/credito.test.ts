import { describe, expect, it } from 'vitest'
import {
  abonadoDeVenta,
  construirAbono,
  planificarAbono,
  planificarAbonoDirigido,
  resumirClientes,
  saldoDeCliente,
  ventasAbiertas,
} from './credito'
import { agregar, carritoVacio, construirVentaCredito, crearPago, recalcular } from './cart'
import {
  BOTELLA,
  CATALOGO,
  EFECTIVO_BS,
  POLAR,
  PRESENTACIONES_MAPA,
  SALA,
  TASA_VES,
} from './fixtures'
import type { Abono, Cliente, Venta } from './types'

const JUAN: Cliente = {
  id: 'cli-juan',
  nombre: 'Juan el de la esquina',
  documento: 'V-12345678',
  telefono: '0412-1112233',
  limiteCredito: 30,
  nota: null,
  activo: true,
  creadoEn: 0,
}

const MARIA: Cliente = { ...JUAN, id: 'cli-maria', nombre: 'María', limiteCredito: 0 }

/** Fabrica una venta a crédito de N botellas a $1 en el día indicado */
function fiar(clienteId: string, dia: string, botellas: number): Venta {
  let c = carritoVacio()
  c = agregar(c, { producto: POLAR, presentacion: BOTELLA, ubicacionId: SALA.id, cantidad: botellas })
  c = recalcular(c, PRESENTACIONES_MAPA, CATALOGO, 1_700_000_000_000)
  return construirVentaCredito(
    c,
    {
      dia,
      fecha: new Date(`${dia}T18:00:00`).getTime(),
      usuarioId: 'u1',
      folioProvisional: `P-${dia}`,
      tasas: { VES: TASA_VES },
      creadaOffline: false,
    },
    clienteId,
  )
}

function abonar(clienteId: string, dia: string, ventas: Venta[], abonos: Abono[], monto: number): Abono {
  const plan = planificarAbono(ventasAbiertas(clienteId, ventas, abonos, dia), monto)
  return construirAbono(
    {
      clienteId,
      dia,
      fecha: new Date(`${dia}T10:00:00`).getTime(),
      monto,
      pagos: [crearPago({ metodo: EFECTIVO_BS, montoAplicado: plan.aplicado, tasa: TASA_VES })],
      usuarioId: 'u1',
    },
    plan,
  )
}

describe('venta a crédito', () => {
  it('sale sin pagos y sin IGTF: la plata todavía no entró', () => {
    const v = fiar(JUAN.id, '2026-08-10', 12)
    expect(v.condicion).toBe('credito')
    expect(v.clienteId).toBe(JUAN.id)
    expect(v.pagos).toEqual([])
    expect(v.igtf).toBe(0)
    expect(v.total).toBe(12)
  })

  it('descuenta inventario igual que una de contado: la mercancía sí salió', () => {
    const v = fiar(JUAN.id, '2026-08-10', 12)
    expect(v.lineas[0]!.cantidadBase).toBe(12)
    expect(v.costoTotal).toBe(7.2) // 12 × 0,60
  })

  it('separa el día del cuaderno de cuándo se tecleó', () => {
    const v = fiar(JUAN.id, '2026-08-10', 3)
    expect(v.dia).toBe('2026-08-10')
    expect(v.registradaEn).toBeGreaterThan(v.fecha) // se cargó después
  })
})

describe('saldo del cliente', () => {
  const ventas = [fiar(JUAN.id, '2026-08-10', 12), fiar(JUAN.id, '2026-08-14', 8)]

  it('suma las ventas a crédito abiertas', () => {
    expect(saldoDeCliente(JUAN.id, ventas, [])).toBe(20)
  })

  it('no cuenta las ventas de otro cliente', () => {
    const conMaria = [...ventas, fiar(MARIA.id, '2026-08-12', 5)]
    expect(saldoDeCliente(JUAN.id, conMaria, [])).toBe(20)
    expect(saldoDeCliente(MARIA.id, conMaria, [])).toBe(5)
  })

  it('lista las ventas abiertas de la más vieja a la más nueva', () => {
    const abiertas = ventasAbiertas(JUAN.id, ventas, [], '2026-08-20')
    expect(abiertas.map((x) => x.venta.dia)).toEqual(['2026-08-10', '2026-08-14'])
    expect(abiertas.map((x) => x.antiguedad)).toEqual([10, 6])
  })
})

describe('abonos parciales', () => {
  const ventas = [fiar(JUAN.id, '2026-08-10', 12), fiar(JUAN.id, '2026-08-14', 8)]

  it('un abono se aplica de la venta más vieja a la más nueva', () => {
    // debe 12 y 8; abona 15
    const plan = planificarAbono(ventasAbiertas(JUAN.id, ventas, [], '2026-08-20'), 15)
    expect(plan.aplicado).toBe(15)
    expect(plan.sobrante).toBe(0)
    expect(plan.saldadas).toEqual([ventas[0]!.id]) // la del 10 queda saldada
    expect(plan.parcial).toEqual({ ventaId: ventas[1]!.id, saldoRestante: 5 })
  })

  it('el saldo baja después del abono', () => {
    const abono = abonar(JUAN.id, '2026-08-20', ventas, [], 15)
    expect(saldoDeCliente(JUAN.id, ventas, [abono])).toBe(5)
    expect(abonadoDeVenta(ventas[0]!.id, [abono])).toBe(12)
    expect(abonadoDeVenta(ventas[1]!.id, [abono])).toBe(3)
  })

  it('la venta saldada desaparece de las abiertas, la parcial se queda', () => {
    const abono = abonar(JUAN.id, '2026-08-20', ventas, [], 15)
    const abiertas = ventasAbiertas(JUAN.id, ventas, [abono], '2026-08-20')
    expect(abiertas).toHaveLength(1)
    expect(abiertas[0]!.venta.dia).toBe('2026-08-14')
    expect(abiertas[0]!.saldo).toBe(5)
    expect(abiertas[0]!.abonado).toBe(3)
  })

  it('varios abonos seguidos van cerrando la cuenta', () => {
    const a1 = abonar(JUAN.id, '2026-08-20', ventas, [], 15)
    const a2 = abonar(JUAN.id, '2026-08-25', ventas, [a1], 5)
    expect(saldoDeCliente(JUAN.id, ventas, [a1, a2])).toBe(0)
    expect(ventasAbiertas(JUAN.id, ventas, [a1, a2])).toHaveLength(0)
  })

  it('si paga de más, el sobrante se reporta en vez de tragárselo', () => {
    const plan = planificarAbono(ventasAbiertas(JUAN.id, ventas, [], '2026-08-20'), 25)
    expect(plan.aplicado).toBe(20)
    expect(plan.sobrante).toBe(5)
    expect(plan.saldadas).toHaveLength(2)
  })

  it('un abono nunca deja saldos negativos', () => {
    const abono = abonar(JUAN.id, '2026-08-20', ventas, [], 100)
    expect(saldoDeCliente(JUAN.id, ventas, [abono])).toBe(0)
    expect(abono.monto).toBe(20) // solo se registran los 20 que debía
  })

  it('permite pagar una venta concreta y dejar la otra abierta', () => {
    // "págame la del jueves y déjame la del lunes"
    const abiertas = ventasAbiertas(JUAN.id, ventas, [], '2026-08-20')
    const plan = planificarAbonoDirigido(abiertas, [ventas[1]!.id], 8)
    expect(plan.saldadas).toEqual([ventas[1]!.id])
    expect(plan.aplicaciones).toHaveLength(1)

    const abono = construirAbono(
      {
        clienteId: JUAN.id,
        dia: '2026-08-20',
        fecha: 0,
        monto: 8,
        pagos: [],
        usuarioId: 'u1',
      },
      plan,
    )
    const quedan = ventasAbiertas(JUAN.id, ventas, [abono], '2026-08-20')
    expect(quedan).toHaveLength(1)
    expect(quedan[0]!.venta.dia).toBe('2026-08-10')
  })

  it('un abono de cero no hace nada', () => {
    const plan = planificarAbono(ventasAbiertas(JUAN.id, ventas, [], '2026-08-20'), 0)
    expect(plan.aplicaciones).toHaveLength(0)
    expect(plan.aplicado).toBe(0)
  })
})

describe('resumen de clientes', () => {
  it('ordena por saldo y avisa de quién pasó su límite', () => {
    const ventas = [
      fiar(JUAN.id, '2026-08-10', 12),
      fiar(JUAN.id, '2026-08-14', 25), // Juan debe 37, su límite es 30
      fiar(MARIA.id, '2026-08-18', 6),
    ]
    const r = resumirClientes([JUAN, MARIA], ventas, [])

    expect(r[0]!.cliente.id).toBe(JUAN.id)
    expect(r[0]!.saldo).toBe(37)
    expect(r[0]!.sobreLimite).toBe(true)
    expect(r[0]!.ventasAbiertas).toBe(2)

    expect(r[1]!.saldo).toBe(6)
    expect(r[1]!.sobreLimite).toBe(false) // María no tiene límite declarado
  })

  it('un cliente sin deuda queda en cero, no desaparece', () => {
    const r = resumirClientes([JUAN], [], [])
    expect(r).toHaveLength(1)
    expect(r[0]!.saldo).toBe(0)
    expect(r[0]!.masVieja).toBe(0)
  })
})
