import { describe, expect, it } from 'vitest'
import { limpiar } from './firestore'

/**
 * Firestore rechaza `undefined` con un error que no dice dónde estaba, y los
 * tipos del dominio tienen varios campos opcionales. Sin esta limpieza, subir
 * un producto sin marca tumba la escritura entera de la venta.
 */
describe('limpiar', () => {
  it('quita los undefined de primer nivel', () => {
    expect(limpiar({ a: 1, b: undefined, c: 'x' })).toEqual({ a: 1, c: 'x' })
  })

  it('conserva null, cero, cadena vacía y false', () => {
    // Son valores con significado: `clienteId: null` quiere decir "de contado"
    expect(limpiar({ a: null, b: 0, c: '', d: false })).toEqual({ a: null, b: 0, c: '', d: false })
  })

  it('entra en objetos anidados', () => {
    expect(limpiar({ x: { y: undefined, z: 2 } })).toEqual({ x: { z: 2 } })
  })

  it('entra en los objetos de un arreglo, que es donde viven las líneas de venta', () => {
    const venta = {
      id: 'v1',
      lineas: [
        { productoId: 'p1', cantidad: 2, lote: undefined },
        { productoId: 'p2', cantidad: 1, lote: 'L-9' },
      ],
    }
    expect(limpiar(venta)).toEqual({
      id: 'v1',
      lineas: [
        { productoId: 'p1', cantidad: 2 },
        { productoId: 'p2', cantidad: 1, lote: 'L-9' },
      ],
    })
  })

  it('deja intactos los valores sueltos', () => {
    expect(limpiar(5)).toBe(5)
    expect(limpiar('hola')).toBe('hola')
    expect(limpiar(null)).toBe(null)
  })

  it('un producto real sin marca ni grado queda listo para subir', () => {
    const producto = {
      id: 'prod-1',
      sku: 'HIE-BOL-3K',
      nombre: 'Hielo 3 kg',
      marca: undefined,
      contenidoMl: undefined,
      gradoAlcohol: undefined,
      iva: 0,
      activo: true,
    }
    const limpio = limpiar(producto) as Record<string, unknown>
    expect(Object.values(limpio).every((v) => v !== undefined)).toBe(true)
    expect(limpio).not.toHaveProperty('marca')
    expect(limpio.iva).toBe(0)
  })
})
