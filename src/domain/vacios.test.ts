import { describe, expect, it } from 'vitest'
import {
  deudoresDeVacios,
  productosConEnvase,
  saldoCliente,
  saldoCompania,
  totalDe,
  vaciosDeCliente,
  vaciosDeCompania,
  type MovimientoVacios,
} from './vacios'
import { POLAR } from './fixtures'

const DATOS = {
  dia: '2026-09-30',
  fecha: Date.parse('2026-09-30T12:00:00Z'),
  usuarioId: 'u-encargado',
  documentoTipo: 'manual' as const,
  creadoOffline: false,
}

const OTRO = 'prod-solera'

describe('lo que se le debe a la compañía', () => {
  it('el despacho deja envases debiendo', () => {
    const m = vaciosDeCompania([{ productoId: POLAR.id, dejados: 360, devueltos: 0 }], DATOS)!
    expect(totalDe(saldoCompania([m]))).toBe(360)
  })

  it('devolverle vacíos al camión baja la deuda', () => {
    const despacho = vaciosDeCompania([{ productoId: POLAR.id, dejados: 360, devueltos: 0 }], DATOS)!
    const entrega = vaciosDeCompania([{ productoId: POLAR.id, dejados: 0, devueltos: 300 }], DATOS)!
    expect(totalDe(saldoCompania([despacho, entrega]))).toBe(60)
  })

  it('el mismo viaje puede dejar y recoger a la vez', () => {
    // Llega con 360 llenas y se lleva 288 vacíos del patio.
    const m = vaciosDeCompania([{ productoId: POLAR.id, dejados: 360, devueltos: 288 }], DATOS)!
    expect(totalDe(saldoCompania([m]))).toBe(72)
  })

  it('cada envase se cuenta por separado: la Polar no salda a la Solera', () => {
    const m = vaciosDeCompania(
      [
        { productoId: POLAR.id, dejados: 360, devueltos: 0 },
        { productoId: OTRO, dejados: 0, devueltos: 100 },
      ],
      DATOS,
    )!
    const saldo = saldoCompania([m])
    expect(saldo.get(POLAR.id)).toBe(360)
    expect(saldo.get(OTRO)).toBe(-100)
  })

  it('un renglón que no mueve nada no se guarda', () => {
    expect(vaciosDeCompania([{ productoId: POLAR.id, dejados: 0, devueltos: 0 }], DATOS)).toBeNull()
  })

  it('un despacho que deja y devuelve lo mismo no deja deuda', () => {
    const m = vaciosDeCompania([{ productoId: POLAR.id, dejados: 288, devueltos: 288 }], DATOS)
    expect(m).toBeNull()
  })
})

describe('lo que deben los clientes', () => {
  it('llevarse la botella deja al cliente debiendo el envase', () => {
    const m = vaciosDeCliente('c-juan', [{ productoId: POLAR.id, seLlevo: 12, trajo: 0 }], DATOS)!
    expect(totalDe(saldoCliente('c-juan', [m]))).toBe(12)
  })

  it('traerlos de vuelta le baja la deuda', () => {
    const salida = vaciosDeCliente('c-juan', [{ productoId: POLAR.id, seLlevo: 12, trajo: 0 }], DATOS)!
    const vuelta = vaciosDeCliente('c-juan', [{ productoId: POLAR.id, seLlevo: 0, trajo: 5 }], DATOS)!
    expect(totalDe(saldoCliente('c-juan', [salida, vuelta]))).toBe(7)
  })

  it('el que llega con vacíos y se lleva llenas no queda debiendo nada', () => {
    // Trae seis, se lleva seis: es el intercambio de toda la vida.
    const m = vaciosDeCliente('c-juan', [{ productoId: POLAR.id, seLlevo: 6, trajo: 6 }], DATOS)
    expect(m).toBeNull()
  })

  it('la deuda de un cliente no se mezcla con la de otro', () => {
    const juan = vaciosDeCliente('c-juan', [{ productoId: POLAR.id, seLlevo: 12, trajo: 0 }], DATOS)!
    const ana = vaciosDeCliente('c-ana', [{ productoId: POLAR.id, seLlevo: 3, trajo: 0 }], DATOS)!
    expect(totalDe(saldoCliente('c-juan', [juan, ana]))).toBe(12)
    expect(totalDe(saldoCliente('c-ana', [juan, ana]))).toBe(3)
  })

  it('la deuda con la compañía no se mezcla con la de los clientes', () => {
    const compania = vaciosDeCompania([{ productoId: POLAR.id, dejados: 360, devueltos: 0 }], DATOS)!
    const juan = vaciosDeCliente('c-juan', [{ productoId: POLAR.id, seLlevo: 12, trajo: 0 }], DATOS)!
    const todos = [compania, juan]

    // Van en direcciones contrarias: una la debe el local, la otra el cliente.
    expect(totalDe(saldoCompania(todos))).toBe(360)
    expect(totalDe(saldoCliente('c-juan', todos))).toBe(12)
  })
})

describe('la lista de quién debe envases', () => {
  it('ordena de mayor a menor y deja fuera a los que están al día', () => {
    const movs: MovimientoVacios[] = [
      vaciosDeCliente('c-juan', [{ productoId: POLAR.id, seLlevo: 12, trajo: 0 }], DATOS)!,
      vaciosDeCliente('c-ana', [{ productoId: POLAR.id, seLlevo: 30, trajo: 0 }], DATOS)!,
      vaciosDeCliente('c-luis', [{ productoId: POLAR.id, seLlevo: 6, trajo: 0 }], DATOS)!,
      vaciosDeCliente('c-luis', [{ productoId: POLAR.id, seLlevo: 0, trajo: 6 }], DATOS)!,
    ]
    const deudores = deudoresDeVacios(movs)
    expect(deudores.map((d) => d.clienteId)).toEqual(['c-ana', 'c-juan'])
    expect(deudores[0]?.total).toBe(30)
  })

  it('no mete a la compañía entre los clientes', () => {
    const movs = [vaciosDeCompania([{ productoId: POLAR.id, dejados: 360, devueltos: 0 }], DATOS)!]
    expect(deudoresDeVacios(movs)).toEqual([])
  })
})

describe('qué productos llevan envase', () => {
  it('solo los marcados como retornables', () => {
    const snack = { ...POLAR, id: 'prod-snack', retornable: false }
    const inactivo = { ...POLAR, id: 'prod-viejo', activo: false }
    expect(productosConEnvase([POLAR, snack, inactivo]).map((p) => p.id)).toEqual([POLAR.id])
  })
})
