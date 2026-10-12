import { describe, expect, it } from 'vitest'
import {
  categoriasEnUso,
  idDeCategoria,
  nuevaCategoria,
  renombrar,
  sePuedeBorrar,
} from './categorias'
import type { Categoria, Producto } from './types'

const CATEGORIAS: Categoria[] = [
  { id: 'cat-cerveza', nombre: 'Cerveza', orden: 1 },
  { id: 'cat-ron', nombre: 'Ron', orden: 2 },
]

function producto(id: string, categoriaId: string, activo = true): Producto {
  return {
    id,
    sku: id,
    nombre: id,
    nombreCorto: id,
    categoriaId,
    iva: 0,
    unidadBase: 'unidad',
    controlaLote: false,
    fraccionable: false,
    retornable: false,
    stockMin: 0,
    costoPromedio: 0,
    activo,
  }
}

describe('crear una categoría', () => {
  it('la pone al final de la lista', () => {
    const r = nuevaCategoria('Hamburguesas', CATEGORIAS)
    expect(r).toEqual({
      ok: true,
      categoria: { id: 'cat-hamburguesas', nombre: 'Hamburguesas', orden: 3 },
    })
  })

  it('el id sale del nombre, para que el código del producto se lea', () => {
    // El sku se arma con las tres primeras letras del id: CER-POLAR-PILSEN.
    // Con un id al azar saldría A3F-POLAR-PILSEN, que no le dice nada a nadie.
    expect(idDeCategoria('Vinos y espumantes', CATEGORIAS)).toBe('cat-vinos-y-espumantes')
  })

  it('no acepta una que ya existe, aunque se escriba distinto', () => {
    // "cervezas " y "Cerveza" se leen igual en una lista desplegable.
    expect(nuevaCategoria('  CERVEZA ', CATEGORIAS).ok).toBe(false)
    expect(nuevaCategoria('Cerveza', CATEGORIAS)).toEqual({ ok: false, motivo: 'repetida' })
  })

  it('no acepta un nombre en blanco', () => {
    expect(nuevaCategoria('   ', CATEGORIAS)).toEqual({ ok: false, motivo: 'vacio' })
  })

  it('borrar una y volver a crearla con el mismo nombre no reusa el id', () => {
    // El id viejo puede seguir escrito en un producto dado de baja; reusarlo
    // metería ese producto en una categoría que no es la suya.
    const viejas: Categoria[] = [...CATEGORIAS, { id: 'cat-hielo', nombre: 'Otra', orden: 3 }]
    const r = nuevaCategoria('Hielo', viejas)
    expect(r.ok && r.categoria.id).toBe('cat-hielo-2')
  })

  it('un nombre sin letras ni números no se queda sin id', () => {
    const r = nuevaCategoria('¿?¡!', CATEGORIAS)
    expect(r.ok && r.categoria.id).toBe('cat-otra')
  })
})

describe('renombrar', () => {
  it('cambia lo que se lee y deja el id quieto', () => {
    // Los productos llevan el id escrito: corregir "Cervesa" no puede moverlos.
    const r = renombrar(CATEGORIAS[0]!, 'Cervezas', CATEGORIAS)
    expect(r).toEqual({
      ok: true,
      categoria: { id: 'cat-cerveza', nombre: 'Cervezas', orden: 1 },
    })
  })

  it('dejarle su propio nombre no es un choque consigo misma', () => {
    expect(renombrar(CATEGORIAS[0]!, 'Cerveza', CATEGORIAS).ok).toBe(true)
  })

  it('no se le puede poner el nombre de otra', () => {
    expect(renombrar(CATEGORIAS[0]!, 'Ron', CATEGORIAS)).toEqual({
      ok: false,
      motivo: 'repetida',
    })
  })
})

describe('borrar', () => {
  const productos = [producto('p1', 'cat-cerveza'), producto('p2', 'cat-ron', false)]

  it('una categoría vacía se borra', () => {
    expect(sePuedeBorrar('cat-whisky', productos)).toBe(true)
  })

  it('una con productos no', () => {
    // El producto quedaría apuntando a algo que no existe: fuera de todos los
    // filtros por categoría, sin estar dado de baja.
    expect(sePuedeBorrar('cat-cerveza', productos)).toBe(false)
  })

  it('tampoco si su único producto está dado de baja', () => {
    // Su ficha sigue guardada con la categoría escrita y puede reactivarse.
    expect(sePuedeBorrar('cat-ron', productos)).toBe(false)
  })

  it('dice cuántos productos la tienen, para poder explicar la negativa', () => {
    const cuenta = categoriasEnUso([...productos, producto('p3', 'cat-cerveza')])
    expect(cuenta.get('cat-cerveza')).toBe(2)
    expect(cuenta.get('cat-ron')).toBe(1)
    expect(cuenta.get('cat-whisky')).toBeUndefined()
  })
})
