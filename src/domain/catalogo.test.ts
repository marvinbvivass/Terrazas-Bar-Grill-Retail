import { describe, expect, it } from 'vitest'
import { armarProducto, desarmarProducto, margen, validarProducto, type ContextoCatalogo, type ProductoForm } from './catalogo'
import { resolverPrecio } from './pricing'

const CTX: ContextoCatalogo = {
  ubicacion: 'ubi-general',
  listaDetal: 'lst-detal',
  listaMayorBulto: 'lst-mayor',
  listaMayorResto: 'lst-mayor6',
}

const LISTAS = [
  { id: 'lst-mayor', nombre: 'Mayor', moneda: 'USD' as const, prioridad: 20, cantidadMin: 24, ubicacionId: null, tipoCliente: null, activo: true },
  { id: 'lst-mayor6', nombre: 'Mayor', moneda: 'USD' as const, prioridad: 25, cantidadMin: 6, ubicacionId: null, tipoCliente: null, activo: true },
  { id: 'lst-detal', nombre: 'Detal', moneda: 'USD' as const, prioridad: 100, cantidadMin: null, ubicacionId: null, tipoCliente: null, activo: true },
]

const cerveza: ProductoForm = {
  nombre: 'Cerveza Polar Pilsen 222 ml',
  nombreCorto: 'Polar Pilsen',
  categoriaId: 'cat-cerveza',
  precioDetal: 1.0,
  costoPromedio: 0.6,
  retornable: true,
  contenido: 222,
  unidadContenido: 'ml',
  stockMin: 72,
  presentaciones: [{ nombre: 'Six-pack', factor: 6, precio: 5.7 }],
}

describe('armar un producto desde el formulario', () => {
  it('crea la unidad como presentación base, siempre', () => {
    const a = armarProducto(cerveza, CTX)
    const base = a.presentaciones.filter((p) => p.esBase)
    expect(base).toHaveLength(1)
    expect(base[0]!.factor).toBe(1)
    expect(base[0]!.nombre).toBe('Unidad')
  })

  it('la unidad lleva un solo precio: el de venta', () => {
    const a = armarProducto(cerveza, CTX)
    const deBase = a.precios.filter((p) => p.presentacionId.endsWith('-base'))
    expect(deBase.map((p) => p.listaId)).toEqual(['lst-detal'])
  })

  it('no genera precio de mayor automático', () => {
    // Esas listas se activaban por cantidad acumulada, y el cierre del día
    // lleva los escalones apagados porque su carrito es la jornada entera.
    // Vender más barato por bulto se hace poniéndole precio a la caja.
    const a = armarProducto(cerveza, CTX)
    expect(a.precios.some((p) => p.listaId.startsWith('lst-mayor'))).toBe(false)
  })

  it('el mismo precio en cualquier ubicación: el inventario es general', () => {
    const a = armarProducto(cerveza, CTX)
    const base = a.presentaciones.find((p) => p.esBase)!
    const cat = { listas: LISTAS, precios: a.precios }
    const momento = Date.now() + 1000
    const precio = (ubicacionId: string, cantidadBase: number) =>
      resolverPrecio({ presentacionId: base.id, cantidadBase, ubicacionId, tipoCliente: 'detal', momento }, cat)

    expect(precio('ubi-general', 1)?.precio).toBe(1.0)
    expect(precio('ubi-general', 1)?.listaNombre).toBe('Detal')
    // Y sigue siendo el mismo llevando dos docenas: el descuento por bulto se
    // hace con el precio de la caja, no con un escalón automático.
    expect(precio('ubi-general', 24)?.precio).toBe(1.0)
  })

  it('ya no se generan códigos de barras', () => {
    const a = armarProducto(cerveza, CTX)
    expect(a.codigos).toHaveLength(0)
  })

  it('una presentación sin precio se cobra proporcional a la unidad', () => {
    const f: ProductoForm = { ...cerveza, presentaciones: [{ nombre: 'Six-pack', factor: 6, precio: 0 }] }
    const a = armarProducto(f, CTX)
    const six = a.precios.find((p) => p.presentacionId.endsWith('-6'))!
    expect(six.precio).toBe(6.0)
  })

  it('dar de alta un producto NO mueve existencias', () => {
    // El catálogo dice qué es el producto; cuánto hay es asunto del inventario
    // y entra por recepción, que deja factura, costo y fecha.
    expect('existencias' in armarProducto(cerveza, CTX)).toBe(false)
  })

  it('el contenido lleva su medida al lado', () => {
    const a = armarProducto(cerveza, CTX)
    expect(a.producto.contenido).toBe(222)
    expect(a.producto.unidadContenido).toBe('ml')

    const mani = armarProducto({ ...cerveza, contenido: 40, unidadContenido: 'g' }, CTX)
    expect(mani.producto.unidadContenido).toBe('g')
  })

  it('sin contenido no se inventa una medida', () => {
    const a = armarProducto({ ...cerveza, contenido: undefined }, CTX)
    expect(a.producto.contenido).toBeUndefined()
    expect(a.producto.unidadContenido).toBeUndefined()
  })

  it('los productos no llevan IVA: el negocio cobra el precio de la pizarra', () => {
    expect(armarProducto(cerveza, CTX).producto.iva).toBe(0)
  })

  it('el costo NO se teclea, se conserva el que ya tenía', () => {
    // Lo fija la recepción contra lo que se le pagó al proveedor. Si al editar
    // se escribiera cero, el margen de ese producto se iría al 100%.
    expect(armarProducto(cerveza, CTX).producto.costoPromedio).toBe(0.6)
    const nuevo = armarProducto({ ...cerveza, costoPromedio: undefined }, CTX)
    expect(nuevo.producto.costoPromedio).toBe(0)
  })

  it('el SKU sale del nombre corto, sin acentos ni signos', () => {
    const a = armarProducto({ ...cerveza, nombreCorto: 'Anís Cartujo 750' }, CTX)
    expect(a.producto.sku).toMatch(/^CER-/)
    expect(a.producto.sku).not.toMatch(/[íÍ ]/)
  })

  it('al editar conserva el id, no crea un producto nuevo', () => {
    const a = armarProducto({ ...cerveza, id: 'prod-fijo' }, CTX)
    expect(a.producto.id).toBe('prod-fijo')
    expect(a.presentaciones[0]!.id).toBe('prod-fijo-base')
  })
})

describe('ida y vuelta del formulario', () => {
  it('lo que se guarda se puede volver a editar sin perder nada', () => {
    const a = armarProducto({ ...cerveza, id: 'prod-1' }, CTX)
    const vuelta = desarmarProducto(a.producto, a.presentaciones, a.codigos, a.precios, CTX)

    expect(vuelta.nombre).toBe(cerveza.nombre)
    expect(vuelta.precioDetal).toBe(1.0)
    expect(vuelta.costoPromedio).toBe(0.6)
    expect(vuelta.presentaciones).toEqual([{ nombre: 'Six-pack', factor: 6, precio: 5.7 }])
  })
})

describe('validación', () => {
  it('acepta un producto bien llenado', () => {
    expect(validarProducto(cerveza)).toEqual([])
  })

  it('exige nombre, categoría y precio', () => {
    const malo = validarProducto({ ...cerveza, nombre: '  ', categoriaId: '', precioDetal: 0 })
    expect(malo.map((x) => x.campo).sort()).toEqual(['categoria', 'nombre', 'precioDetal'])
  })


  it('una presentación de una sola unidad no tiene sentido', () => {
    const malo = validarProducto({ ...cerveza, presentaciones: [{ nombre: 'Pack', factor: 1, precio: 2 }] })
    expect(malo.some((x) => x.campo === 'presentaciones')).toBe(true)
  })
})

describe('margen', () => {
  it('descuenta el IVA antes de calcularlo', () => {
    // 1,00 con IVA son 0,862 sin IVA; contra un costo de 0,60 el margen es 30,4%
    expect(margen(1.0, 0.6, 0.16)).toBe(30.4)
  })

  it('sin IVA el cálculo es directo', () => {
    expect(margen(1.0, 0.5, 0)).toBe(50)
  })

  it('un precio en cero no revienta', () => {
    expect(margen(0, 5, 0.16)).toBe(0)
  })
})
