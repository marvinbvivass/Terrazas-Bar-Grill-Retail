import { describe, expect, it } from 'vitest'
import {
  deudoresDeVacios,
  productosConEnvase,
  saldoCliente,
  saldoCompania,
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

describe('lo que se le debe a la compañía', () => {
  it('el despacho deja cajas debiendo', () => {
    // Diez cajas llenas: diez cajas de vacíos por devolver.
    expect(saldoCompania([vaciosDeCompania(10, 0, DATOS)!])).toBe(10)
  })

  it('entregarle vacíos al camión baja la deuda', () => {
    const despacho = vaciosDeCompania(10, 0, DATOS)!
    const entrega = vaciosDeCompania(0, 8, DATOS)!
    expect(saldoCompania([despacho, entrega])).toBe(2)
  })

  it('un mismo viaje deja unas y se lleva otras', () => {
    expect(saldoCompania([vaciosDeCompania(10, 8, DATOS)!])).toBe(2)
  })

  it('devolver de más deja saldo a favor', () => {
    // Pasa de verdad: se juntan vacíos de semanas anteriores y se entregan de
    // golpe. El saldo negativo es el crédito, y esconderlo en cero perdería
    // cajas que el local tiene derecho a descontar del próximo despacho.
    expect(saldoCompania([vaciosDeCompania(5, 12, DATOS)!])).toBe(-7)
  })

  it('un movimiento que no mueve nada no se guarda', () => {
    expect(vaciosDeCompania(0, 0, DATOS)).toBeNull()
    expect(vaciosDeCompania(8, 8, DATOS)).toBeNull()
  })
})

describe('la gavera es la gavera', () => {
  it('se devuelven vacíos de otras marcas y la deuda se salda igual', () => {
    /*
     * El caso que define todo este módulo: el camión deja diez cajas de Solera
     * Light y se lleva cinco de Pilsen y cinco de Tercio. En el patio queda
     * cero, y en el sistema también.
     *
     * Llevarlo por producto daría "debes 10 de Solera y tienes 5 a favor de
     * Pilsen y 5 de Tercio": tres saldos, ninguno cierto.
     */
    const despacho = vaciosDeCompania(10, 0, DATOS)!
    const pilsen = vaciosDeCompania(0, 5, DATOS)!
    const tercio = vaciosDeCompania(0, 5, DATOS)!
    expect(saldoCompania([despacho, pilsen, tercio])).toBe(0)
  })

  it('el saldo es un número, no un reparto', () => {
    const saldo = saldoCompania([vaciosDeCompania(13, 0, DATOS)!])
    expect(typeof saldo).toBe('number')
  })
})

describe('lo que deben los clientes', () => {
  it('llevarse botellas para la casa deja cajas debiendo', () => {
    expect(saldoCliente('c-juan', [vaciosDeCliente('c-juan', 2, 0, DATOS)!])).toBe(2)
  })

  it('traerlas de vuelta baja la deuda', () => {
    const salida = vaciosDeCliente('c-juan', 5, 0, DATOS)!
    const vuelta = vaciosDeCliente('c-juan', 0, 3, DATOS)!
    expect(saldoCliente('c-juan', [salida, vuelta])).toBe(2)
  })

  it('el que trae dos y se lleva dos queda igual', () => {
    expect(vaciosDeCliente('c-juan', 2, 2, DATOS)).toBeNull()
  })

  it('la deuda de uno no se mezcla con la de otro', () => {
    const juan = vaciosDeCliente('c-juan', 4, 0, DATOS)!
    const ana = vaciosDeCliente('c-ana', 1, 0, DATOS)!
    expect(saldoCliente('c-juan', [juan, ana])).toBe(4)
    expect(saldoCliente('c-ana', [juan, ana])).toBe(1)
  })
})

describe('las dos deudas no se tocan', () => {
  it('lo del camión y lo de los clientes van por separado', () => {
    // Van en direcciones contrarias: que un cliente te deba tres cajas no paga
    // las que le debes al distribuidor.
    const compania = vaciosDeCompania(10, 0, DATOS)!
    const juan = vaciosDeCliente('c-juan', 2, 0, DATOS)!
    const todos: MovimientoVacios[] = [compania, juan]
    expect(saldoCompania(todos)).toBe(10)
    expect(saldoCliente('c-juan', todos)).toBe(2)
  })
})

describe('la lista de deudores', () => {
  it('va del que más debe al que menos, y sin los que ya saldaron', () => {
    const movs = [
      vaciosDeCliente('c-juan', 4, 0, DATOS)!,
      vaciosDeCliente('c-ana', 9, 0, DATOS)!,
      vaciosDeCliente('c-luis', 2, 0, DATOS)!,
      vaciosDeCliente('c-luis', 0, 2, DATOS)!,
    ]
    expect(deudoresDeVacios(movs)).toEqual([
      { clienteId: 'c-ana', total: 9 },
      { clienteId: 'c-juan', total: 4 },
    ])
  })

  it('lo de la compañía no convierte a nadie en deudor', () => {
    expect(deudoresDeVacios([vaciosDeCompania(10, 0, DATOS)!])).toEqual([])
  })
})

describe('qué productos llevan envase', () => {
  it('solo los retornables que siguen activos', () => {
    // El saldo no distingue producto, pero esto sí: una lata no vuelve.
    const lata = { ...POLAR, id: 'p-lata', retornable: false }
    const inactivo = { ...POLAR, id: 'p-viejo', activo: false }
    expect(productosConEnvase([POLAR, lata, inactivo]).map((p) => p.id)).toEqual([POLAR.id])
  })
})
