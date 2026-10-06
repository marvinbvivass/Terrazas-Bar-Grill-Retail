import { describe, expect, it } from 'vitest'
import { calcularCambios, type CambioLote } from './preciosLote'
import type { Precio, Presentacion, Producto, UUID } from './types'

const LISTA = 'lst-detal'

function producto(id: string): Producto {
  return {
    id,
    sku: id,
    nombre: id,
    nombreCorto: id,
    categoriaId: 'cat-cerveza',
    iva: 0,
    unidadBase: 'unidad',
    controlaLote: false,
    fraccionable: false,
    retornable: true,
    stockMin: 0,
    costoPromedio: 0,
    activo: true,
  }
}

function pres(id: string, productoId: string, factor: number, esBase = false): Presentacion {
  return {
    id,
    productoId,
    nombre: esBase ? 'Unidad' : `x${factor}`,
    factor,
    esBase,
    permiteVenta: true,
    permiteCompra: false,
    activo: true,
  }
}

function precio(id: string, presentacionId: string, valor: number): Precio {
  return {
    id,
    listaId: LISTA,
    presentacionId,
    precio: valor,
    vigenteDesde: 0,
    vigenteHasta: null,
  }
}

/** Una cerveza a 1,00 la unidad y 20,00 la caja de 24 */
function escenario() {
  const polar = producto('polar')
  const solera = producto('solera')
  return {
    productos: [polar, solera],
    presentacionesPorProducto: new Map<UUID, Presentacion[]>([
      ['polar', [pres('polar-base', 'polar', 1, true), pres('polar-caja', 'polar', 24)]],
      ['solera', [pres('solera-base', 'solera', 1, true)]],
    ]),
    precios: [
      precio('p1', 'polar-base', 1),
      precio('p2', 'polar-caja', 20),
      precio('p3', 'solera-base', 1.5),
    ],
    listaDetal: LISTA,
  }
}

const correr = (cambio: CambioLote, productos = escenario().productos) =>
  calcularCambios({ ...escenario(), productos, cambio })

describe('igualar el precio de varios productos', () => {
  it('pone el mismo precio a todos los seleccionados', () => {
    const r = correr({ tipo: 'fijar', precioBase: 2, mantenerProporcion: false })
    const unidades = r.filter((x) => x.presentacionId.endsWith('-base'))
    expect(unidades).toHaveLength(2)
    expect(unidades.every((x) => x.nuevo === 2)).toBe(true)
  })

  it('arrastra la caja conservando su descuento', () => {
    // La caja salía a 20 con la unidad a 1: 24 unidades por 20 es un 17% menos.
    // Al doblar la unidad, la caja tiene que doblar también.
    const r = correr({ tipo: 'fijar', precioBase: 2, mantenerProporcion: true })
    expect(r.find((x) => x.presentacionId === 'polar-caja')?.nuevo).toBe(40)
  })

  it('sin arrastrar, la caja se queda como estaba', () => {
    // Es lo que hay que evitar: el mayorista pagando el precio viejo.
    const r = correr({ tipo: 'fijar', precioBase: 2, mantenerProporcion: false })
    expect(r.some((x) => x.presentacionId === 'polar-caja')).toBe(false)
  })

  it('un producto sin precio previo no puede arrastrar proporción', () => {
    const base = escenario()
    const r = calcularCambios({
      ...base,
      precios: [precio('p1', 'polar-base', 0), precio('p2', 'polar-caja', 20)],
      productos: [base.productos[0]!],
      cambio: { tipo: 'fijar', precioBase: 2, mantenerProporcion: true },
    })
    // Se le pone el precio a la unidad y la caja se deja para revisarla a mano.
    expect(r.map((x) => x.presentacionId)).toEqual(['polar-base'])
  })
})

describe('subir todo un porcentaje', () => {
  it('sube la unidad y la caja a la vez', () => {
    const r = correr({ tipo: 'porcentaje', porcentaje: 10 })
    expect(r.find((x) => x.presentacionId === 'polar-base')?.nuevo).toBe(1.1)
    expect(r.find((x) => x.presentacionId === 'polar-caja')?.nuevo).toBe(22)
  })

  it('también sirve para bajar', () => {
    const r = correr({ tipo: 'porcentaje', porcentaje: -20 })
    expect(r.find((x) => x.presentacionId === 'solera-base')?.nuevo).toBe(1.2)
  })

  it('cada producto sube desde SU precio, no desde uno común', () => {
    const r = correr({ tipo: 'porcentaje', porcentaje: 100 })
    expect(r.find((x) => x.presentacionId === 'polar-base')?.nuevo).toBe(2)
    expect(r.find((x) => x.presentacionId === 'solera-base')?.nuevo).toBe(3)
  })
})

describe('lo que no cambia no se escribe', () => {
  it('fijar el mismo precio que ya tenía no genera cambios', () => {
    const base = escenario()
    const r = calcularCambios({
      ...base,
      productos: [base.productos[1]!],
      cambio: { tipo: 'fijar', precioBase: 1.5, mantenerProporcion: true },
    })
    expect(r).toEqual([])
  })

  it('un 0% no mueve nada', () => {
    expect(correr({ tipo: 'porcentaje', porcentaje: 0 })).toEqual([])
  })

  it('nunca deja un precio en cero o negativo', () => {
    const r = correr({ tipo: 'porcentaje', porcentaje: -100 })
    expect(r).toEqual([])
  })
})

describe('el resumen de lo que se va a cambiar', () => {
  it('dice de qué precio a qué precio', () => {
    const base = escenario()
    const r = calcularCambios({
      ...base,
      productos: [base.productos[1]!],
      cambio: { tipo: 'fijar', precioBase: 2, mantenerProporcion: false },
    })
    expect(r[0]).toMatchObject({ productoId: 'solera', anterior: 1.5, nuevo: 2 })
  })
})
