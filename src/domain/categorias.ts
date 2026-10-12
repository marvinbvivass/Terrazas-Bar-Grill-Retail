import type { Categoria, Producto, UUID } from './types'

/**
 * Las categorías del catálogo.
 *
 * Venían fijas desde el primer arranque —cerveza, ron, whisky, snacks…— y eso
 * alcanza para una licorería, pero no para un bar que mañana empieza a vender
 * hamburguesas. Se crean, se renombran y se borran desde el mismo formulario
 * donde se usan.
 *
 * Dos reglas gobiernan todo lo demás:
 *
 * 1. Una categoría con productos NO se borra. El producto quedaría apuntando a
 *    algo que no existe: desaparecería de los filtros por categoría sin estar
 *    dado de baja, y nadie entendería por qué.
 * 2. El id sale del nombre, no de un azar. El código del producto se arma con
 *    las tres primeras letras del id (`CER-POLAR-PILSEN`), así que una
 *    categoría con id aleatorio daría códigos como `A3F-POLAR-PILSEN`.
 */

export type ResultadoCategoria =
  | { ok: true; categoria: Categoria }
  | { ok: false; motivo: 'vacio' | 'repetida' }

/** Sin tildes, sin mayúsculas y sin espacios de sobra: así se comparan */
export function normalizar(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * El id a partir del nombre: "Vinos y espumantes" → `cat-vinos-y-espumantes`.
 *
 * Si ya existe uno igual se le pone un número al final. Pasa al borrar una
 * categoría y volver a crearla con el mismo nombre más tarde, o al escribir
 * "Cerveza" cuando ya hay una "cervezas" —que no es el mismo nombre, pero sí
 * la misma raíz.
 */
export function idDeCategoria(nombre: string, existentes: Categoria[]): UUID {
  const raiz =
    normalizar(nombre)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20) || 'otra'

  const usados = new Set(existentes.map((c) => c.id))
  let id = `cat-${raiz}`
  let n = 2
  while (usados.has(id)) id = `cat-${raiz}-${n++}`
  return id
}

/**
 * Crear una categoría.
 *
 * Se rechaza el nombre repetido mirando el nombre normalizado y no el literal:
 * "Cervezas" y "cervezas " son la misma categoría escrita dos veces, y dos
 * categorías que se leen igual en una lista desplegable son una trampa.
 */
export function nuevaCategoria(nombre: string, existentes: Categoria[]): ResultadoCategoria {
  const limpio = nombre.trim().replace(/\s+/g, ' ')
  if (limpio === '') return { ok: false, motivo: 'vacio' }

  const clave = normalizar(limpio)
  if (existentes.some((c) => normalizar(c.nombre) === clave)) {
    return { ok: false, motivo: 'repetida' }
  }

  const orden = existentes.reduce((x, c) => Math.max(x, c.orden), 0) + 1
  return { ok: true, categoria: { id: idDeCategoria(limpio, existentes), nombre: limpio, orden } }
}

/**
 * Renombrar.
 *
 * El id no cambia: los productos lo llevan escrito. Corregir "Cervesa" sin
 * tocar el id es justo lo que hace falta — los productos siguen donde estaban
 * y solo cambia lo que se lee en pantalla.
 */
export function renombrar(
  categoria: Categoria,
  nombre: string,
  existentes: Categoria[],
): ResultadoCategoria {
  const limpio = nombre.trim().replace(/\s+/g, ' ')
  if (limpio === '') return { ok: false, motivo: 'vacio' }

  const clave = normalizar(limpio)
  const choca = existentes.some((c) => c.id !== categoria.id && normalizar(c.nombre) === clave)
  if (choca) return { ok: false, motivo: 'repetida' }

  return { ok: true, categoria: { ...categoria, nombre: limpio } }
}

/**
 * Cuántos productos usa cada categoría.
 *
 * Cuenta también los dados de baja: su ficha sigue guardada con la categoría
 * escrita, y si se reactivan tiene que seguir existiendo.
 */
export function categoriasEnUso(productos: Producto[]): Map<UUID, number> {
  const cuenta = new Map<UUID, number>()
  for (const p of productos) {
    cuenta.set(p.categoriaId, (cuenta.get(p.categoriaId) ?? 0) + 1)
  }
  return cuenta
}

/** Una categoría con productos no se borra */
export function sePuedeBorrar(categoriaId: UUID, productos: Producto[]): boolean {
  return !productos.some((p) => p.categoriaId === categoriaId)
}
