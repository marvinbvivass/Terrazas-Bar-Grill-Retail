import { describe, expect, it } from 'vitest'
import {
  deudoresDeVacios,
  productosConEnvase,
  saldoCliente,
  saldoCompania,
  totalDe,
  vaciosDeCliente,
  vaciosDeCompania,
  presentacionDeRetorno,
  type MovimientoVacios,
} from './vacios'
import { BOTELLA, CAJA36, POLAR, PRESENTACIONES_POLAR } from './fixtures'

const DATOS = {
  dia: '2026-09-30',
  fecha: Date.parse('2026-09-30T12:00:00Z'),
  usuarioId: 'u-encargado',
  documentoTipo: 'manual' as const,
  creadoOffline: false,
}

const OTRO = 'prod-solera'

describe('lo que se le debe a la compañía', () => {
  it('el despacho deja cajas debiendo', () => {
    // Diez cajas llenas: diez cajas de vacíos por devolver.
    const m = vaciosDeCompania([{ productoId: POLAR.id, dejados: 10, devueltos: 0 }], DATOS)!
    expect(totalDe(saldoCompania([m]))).toBe(10)
  })

  it('devolverle cajas al camión baja la deuda', () => {
    const despacho = vaciosDeCompania([{ productoId: POLAR.id, dejados: 10, devueltos: 0 }], DATOS)!
    const entrega = vaciosDeCompania([{ productoId: POLAR.id, dejados: 0, devueltos: 8 }], DATOS)!
    expect(totalDe(saldoCompania([despacho, entrega]))).toBe(2)
  })

  it('el mismo viaje puede dejar y recoger a la vez', () => {
    // Llega con diez cajas llenas y se lleva ocho de vacíos del patio.
    const m = vaciosDeCompania([{ productoId: POLAR.id, dejados: 10, devueltos: 8 }], DATOS)!
    expect(totalDe(saldoCompania([m]))).toBe(2)
  })

  it('cada envase se cuenta por separado: la Polar no salda a la Solera', () => {
    const m = vaciosDeCompania(
      [
        { productoId: POLAR.id, dejados: 10, devueltos: 0 },
        { productoId: OTRO, dejados: 0, devueltos: 3 },
      ],
      DATOS,
    )!
    const saldo = saldoCompania([m])
    expect(saldo.get(POLAR.id)).toBe(10)
    expect(saldo.get(OTRO)).toBe(-3)
  })

  it('un renglón que no mueve nada no se guarda', () => {
    expect(vaciosDeCompania([{ productoId: POLAR.id, dejados: 0, devueltos: 0 }], DATOS)).toBeNull()
  })

  it('un despacho que deja y devuelve lo mismo no deja deuda', () => {
    const m = vaciosDeCompania([{ productoId: POLAR.id, dejados: 8, devueltos: 8 }], DATOS)
    expect(m).toBeNull()
  })
})

describe('lo que deben los clientes', () => {
  it('llevarse una caja deja al cliente debiéndola', () => {
    const m = vaciosDeCliente('c-juan', [{ productoId: POLAR.id, seLlevo: 2, trajo: 0 }], DATOS)!
    expect(totalDe(saldoCliente('c-juan', [m]))).toBe(2)
  })

  it('traerlas de vuelta le baja la deuda', () => {
    const salida = vaciosDeCliente('c-juan', [{ productoId: POLAR.id, seLlevo: 5, trajo: 0 }], DATOS)!
    const vuelta = vaciosDeCliente('c-juan', [{ productoId: POLAR.id, seLlevo: 0, trajo: 3 }], DATOS)!
    expect(totalDe(saldoCliente('c-juan', [salida, vuelta]))).toBe(2)
  })

  it('el que llega con vacíos y se lleva llenas no queda debiendo nada', () => {
    // Trae dos cajas, se lleva dos: es el intercambio de toda la vida.
    const m = vaciosDeCliente('c-juan', [{ productoId: POLAR.id, seLlevo: 2, trajo: 2 }], DATOS)
    expect(m).toBeNull()
  })

  it('la deuda de un cliente no se mezcla con la de otro', () => {
    const juan = vaciosDeCliente('c-juan', [{ productoId: POLAR.id, seLlevo: 4, trajo: 0 }], DATOS)!
    const ana = vaciosDeCliente('c-ana', [{ productoId: POLAR.id, seLlevo: 1, trajo: 0 }], DATOS)!
    expect(totalDe(saldoCliente('c-juan', [juan, ana]))).toBe(4)
    expect(totalDe(saldoCliente('c-ana', [juan, ana]))).toBe(1)
  })

  it('la deuda con la compañía no se mezcla con la de los clientes', () => {
    const compania = vaciosDeCompania([{ productoId: POLAR.id, dejados: 10, devueltos: 0 }], DATOS)!
    const juan = vaciosDeCliente('c-juan', [{ productoId: POLAR.id, seLlevo: 2, trajo: 0 }], DATOS)!
    const todos = [compania, juan]

    // Van en direcciones contrarias: una la debe el local, la otra el cliente.
    expect(totalDe(saldoCompania(todos))).toBe(10)
    expect(totalDe(saldoCliente('c-juan', todos))).toBe(2)
  })
})

describe('la lista de quién debe envases', () => {
  it('ordena de mayor a menor y deja fuera a los que están al día', () => {
    const movs: MovimientoVacios[] = [
      vaciosDeCliente('c-juan', [{ productoId: POLAR.id, seLlevo: 4, trajo: 0 }], DATOS)!,
      vaciosDeCliente('c-ana', [{ productoId: POLAR.id, seLlevo: 9, trajo: 0 }], DATOS)!,
      vaciosDeCliente('c-luis', [{ productoId: POLAR.id, seLlevo: 2, trajo: 0 }], DATOS)!,
      vaciosDeCliente('c-luis', [{ productoId: POLAR.id, seLlevo: 0, trajo: 2 }], DATOS)!,
    ]
    const deudores = deudoresDeVacios(movs)
    expect(deudores.map((d) => d.clienteId)).toEqual(['c-ana', 'c-juan'])
    expect(deudores[0]?.total).toBe(9)
  })

  it('no mete a la compañía entre los clientes', () => {
    const movs = [vaciosDeCompania([{ productoId: POLAR.id, dejados: 10, devueltos: 0 }], DATOS)!]
    expect(deudoresDeVacios(movs)).toEqual([])
  })
})

describe('la caja de retorno', () => {
  it('es la presentación más grande que exista', () => {
    expect(presentacionDeRetorno(PRESENTACIONES_POLAR)?.id).toBe(CAJA36.id)
  })

  it('si el producto solo se vende suelto, no hay caja que enseñar', () => {
    expect(presentacionDeRetorno([BOTELLA])).toBeUndefined()
  })
})

describe('qué productos llevan envase', () => {
  it('solo los marcados como retornables', () => {
    const snack = { ...POLAR, id: 'prod-snack', retornable: false }
    const inactivo = { ...POLAR, id: 'prod-viejo', activo: false }
    expect(productosConEnvase([POLAR, snack, inactivo]).map((p) => p.id)).toEqual([POLAR.id])
  })
})
