import { describe, expect, it } from 'vitest'
import { aBase, convertir, formato, parsearMonto, redondear, redondearMoneda } from './money'

describe('redondear', () => {
  it('redondea medio-arriba sin romperse con la coma flotante', () => {
    expect(redondear(1.005)).toBe(1.01) // Math.round(1.005*100)/100 daría 1
    expect(redondear(2.675)).toBe(2.68)
    expect(redondear(1.0049)).toBe(1.0)
    expect(redondear(0.1 + 0.2)).toBe(0.3)
  })

  it('maneja negativos y ceros', () => {
    expect(redondear(-1.005)).toBe(-1.01)
    expect(redondear(0)).toBe(0)
    expect(redondear(-0.001)).toBe(0)
  })

  it('acepta otra cantidad de decimales', () => {
    expect(redondear(0.0642857, 6)).toBe(0.064286)
    expect(redondear(123.456, 0)).toBe(123)
  })
})

describe('conversión de moneda', () => {
  it('convierte de dólares a bolívares', () => {
    expect(convertir(10, 'VES', 36.5)).toBe(365)
    expect(convertir(1.25, 'VES', 36.5)).toBe(45.63)
  })

  it('el peso colombiano no tiene céntimos', () => {
    expect(redondearMoneda(48123.6, 'COP')).toBe(48124)
  })

  it('convertir a la moneda base es la identidad', () => {
    expect(convertir(12.5, 'USD', 1)).toBe(12.5)
  })

  it('vuelve de bolívares a dólares', () => {
    expect(aBase(365, 'VES', 36.5)).toBe(10)
  })

  it('una tasa inválida da cero en vez de infinito', () => {
    expect(aBase(365, 'VES', 0)).toBe(0)
  })
})

describe('formato', () => {
  it('usa el símbolo y los decimales de cada moneda', () => {
    expect(formato(12.5, 'USD')).toBe('$ 12,50')
    expect(formato(456.25, 'VES')).toBe('Bs 456,25')
  })
})

describe('parsearMonto', () => {
  it('acepta coma como decimal, que es lo que tiene el teclado de la caja', () => {
    expect(parsearMonto('12,50')).toBe(12.5)
    expect(parsearMonto('12.50')).toBe(12.5)
  })

  it('acepta separadores de miles', () => {
    expect(parsearMonto('1.234,50')).toBe(1234.5)
  })

  it('ignora símbolos y texto', () => {
    expect(parsearMonto('Bs 456,25')).toBe(456.25)
    expect(parsearMonto('')).toBe(0)
    expect(parsearMonto('abc')).toBe(0)
  })
})
