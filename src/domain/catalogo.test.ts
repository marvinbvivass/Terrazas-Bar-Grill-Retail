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
  costo: 0.6,
  retornable: true,
  stock: 312,
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

  it('genera un precio por lista: detal, frío y mayor', () => {
    const a = armarProducto(cerveza, CTX)
    const deBase = a.precios.filter((p) => p.presentacionId.endsWith('-base'))
    expect(deBase.map((p) => p.listaId).sort()).toEqual(['lst-detal', 'lst-mayor'])
  })

  it('el precio de mayor de una cerveza baja 12% y arranca en 24', () => {
    const a = armarProducto(cerveza, CTX)
    const mayor = a.precios.find((p) => p.listaId === 'lst-mayor')!
    expect(mayor.precio).toBe(0.88)
  })

  it('un licor usa el otro escalón: 8% desde 6 unidades', () => {
    const ron: ProductoForm = { ...cerveza, categoriaId: 'cat-ron', precioDetal: 10, costo: 7 }
    const a = armarProducto(ron, CTX)
    const mayor = a.precios.find((p) => p.listaId === 'lst-mayor6')!
    expect(mayor.precio).toBe(9.2)
    expect(a.precios.some((p) => p.listaId === 'lst-mayor')).toBe(false)
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
    // El escalón por cantidad sigue en pie: es del producto, no del sitio.
    expect(precio('ubi-general', 24)?.precio).toBe(0.88)
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

  it('la existencia inicial va a la única ubicación, y omite el cero', () => {
    const a = armarProducto(cerveza, CTX)
    expect(a.existencias).toHaveLength(1)
    expect(a.existencias[0]!.ubicacionId).toBe('ubi-general')
    expect(a.existencias[0]!.cantidadBase).toBe(312)

    expect(armarProducto({ ...cerveza, stock: 0 }, CTX).existencias).toHaveLength(0)
  })

  it('un producto exento no lleva IVA', () => {
    const a = armarProducto({ ...cerveza, exento: true }, CTX)
    expect(a.producto.iva).toBe(0)
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
    const existencias = new Map(a.existencias.map((e) => [`${e.productoId}::${e.ubicacionId}`, e.cantidadBase]))

    const vuelta = desarmarProducto(a.producto, a.presentaciones, a.codigos, a.precios, existencias, CTX)

    expect(vuelta.nombre).toBe(cerveza.nombre)
    expect(vuelta.precioDetal).toBe(1.0)
    expect(vuelta.costo).toBe(0.6)
    expect(vuelta.stock).toBe(312)
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

  it('avisa si el costo se come el precio', () => {
    const malo = validarProducto({ ...cerveza, costo: 1.2 })
    expect(malo[0]!.mensaje).toContain('pérdida')
  })

  it('avisa si el precio frío es menor que el de sala', () => {
    const malo = validarProducto({ ...cerveza, costo: 1.5 })
    expect(malo.some((x) => x.campo === 'costo')).toBe(true)
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
