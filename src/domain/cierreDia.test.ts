import { describe, expect, it } from 'vitest'
import { construirCierreDia, idDeCierre, type CreditoOtorgado } from './cierreDia'

const TASAS = { VES: 36.5, COP: 4100 }

function credito(monto: number, nombre = 'Juan'): CreditoOtorgado {
  return { clienteId: 'c-1', clienteNombre: nombre, monto, ventaId: 'v-1' }
}

describe('construirCierreDia', () => {
  it('el identificador es el día, para que un día tenga un acta y solo una', () => {
    expect(idDeCierre('2026-09-24')).toBe('cierre-2026-09-24')

    const uno = construirCierreDia(base())
    const otro = construirCierreDia({ ...base(), totalVendido: 999 })
    // Cerrar dos veces el mismo día sobrescribe, no duplica.
    expect(uno.id).toBe(otro.id)
  })

  it('cuadra cuando lo recibido iguala lo vendido', () => {
    const c = construirCierreDia({ ...base(), totalVendido: 100, recibido: { USD: 100 } })
    expect(c.esperado).toBe(100)
    expect(c.totalRecibido).toBe(100)
    expect(c.diferencia).toBe(0)
    expect(c.cuadra).toBe(true)
  })

  it('descuenta el fiado de lo que tenía que entrar en la gaveta', () => {
    const c = construirCierreDia({
      ...base(),
      totalVendido: 100,
      creditos: [credito(30)],
      recibido: { USD: 70 },
    })
    expect(c.totalCredito).toBe(30)
    // Lo que se espera en caja son 70, no 100: los otros 30 salieron fiados.
    expect(c.esperado).toBe(70)
    expect(c.diferencia).toBe(0)
    expect(c.cuadra).toBe(true)
  })

  it('sin restar el fiado, un día con crédito daría faltante y el aviso se volvería ruido', () => {
    const conFiado = construirCierreDia({
      ...base(),
      totalVendido: 100,
      creditos: [credito(30)],
      recibido: { USD: 70 },
    })
    const sinDeclararlo = construirCierreDia({
      ...base(),
      totalVendido: 100,
      creditos: [],
      recibido: { USD: 70 },
    })
    expect(conFiado.cuadra).toBe(true)
    expect(sinDeclararlo.cuadra).toBe(false)
    expect(sinDeclararlo.diferencia).toBe(-30)
  })

  it('suma varias monedas llevándolas a dólares con la tasa del día', () => {
    const c = construirCierreDia({
      ...base(),
      totalVendido: 100,
      recibido: { USD: 20, VES: 36.5 * 50, COP: 4100 * 30 },
    })
    expect(c.totalRecibido).toBe(100)
    expect(c.cuadra).toBe(true)
  })

  it('congela la tasa de cada monto: el acta se lee, no se recalcula', () => {
    const c = construirCierreDia({ ...base(), totalVendido: 50, recibido: { VES: 1825 } })
    const ves = c.recibido.find((r) => r.moneda === 'VES')
    expect(ves).toMatchObject({ monto: 1825, tasa: 36.5, enBase: 50 })
    // Y las tasas del día quedan completas dentro del documento.
    expect(c.tasas).toEqual(TASAS)
  })

  it('el dólar lleva tasa 1, no la del bolívar', () => {
    const c = construirCierreDia({ ...base(), totalVendido: 10, recibido: { USD: 10 } })
    expect(c.recibido[0]).toMatchObject({ moneda: 'USD', tasa: 1, enBase: 10 })
  })

  it('marca el faltante en negativo y el sobrante en positivo', () => {
    const falta = construirCierreDia({ ...base(), totalVendido: 100, recibido: { USD: 90 } })
    const sobra = construirCierreDia({ ...base(), totalVendido: 100, recibido: { USD: 110 } })
    expect(falta.diferencia).toBe(-10)
    expect(sobra.diferencia).toBe(10)
    expect(falta.cuadra).toBe(false)
    expect(sobra.cuadra).toBe(false)
  })

  it('tolera el redondeo del peso, que no tiene moneda física para la diferencia exacta', () => {
    // 4100 pesos = 1 dólar. Un peso suelto no se puede pagar más fino.
    const c = construirCierreDia({
      ...base(),
      totalVendido: 10,
      recibido: { COP: 41000 - 1 },
    })
    expect(Math.abs(c.diferencia)).toBeLessThan(0.01)
    expect(c.cuadra).toBe(true)
  })

  it('no se declara cuadrado si falta una tasa: el número no significaría nada', () => {
    const c = construirCierreDia({
      ...base(),
      totalVendido: 100,
      recibido: { VES: 3650 },
      tasas: {},
    })
    expect(c.cuadra).toBe(false)
  })

  it('el margen sale de todo lo vendido, fiado incluido', () => {
    const c = construirCierreDia({
      ...base(),
      totalVendido: 100,
      costo: 60,
      creditos: [credito(40)],
      recibido: { USD: 60 },
    })
    // La mercancía fiada también salió del inventario y también deja margen.
    expect(c.margen).toBe(40)
    expect(c.cuadra).toBe(true)
  })

  it('guarda el nombre del cliente copiado, para que el acta no cambie después', () => {
    const c = construirCierreDia({ ...base(), creditos: [credito(10, 'Juan Pérez')] })
    expect(c.creditos[0]?.clienteNombre).toBe('Juan Pérez')
  })

  it('nace sin reabrir y sin sincronizar', () => {
    const c = construirCierreDia(base())
    expect(c.reabiertoEn).toBeNull()
    expect(c.sincronizadoEn).toBeNull()
  })
})

function base() {
  return {
    dia: '2026-09-24',
    usuarioId: 'u-1',
    totalVendido: 0,
    unidades: 0,
    costo: 0,
    recibido: {},
    creditos: [] as CreditoOtorgado[],
    tasas: TASAS,
    ahora: 1_700_000_000_000,
  }
}
