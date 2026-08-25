import { redondear } from './money'
import type {
  CodigoBarras,
  Existencia,
  Precio,
  Presentacion,
  Producto,
  UUID,
} from './types'

/**
 * Alta y edición de productos.
 *
 * Un producto no es una fila: es un producto, sus presentaciones, un código de
 * barras por presentación, un precio por cada lista que aplique, y su
 * existencia inicial en cada ubicación. Este módulo convierte lo que el
 * encargado teclea en un formulario en todas esas piezas de una vez, para que
 * la interfaz no tenga que saber de listas de precio ni de factores.
 */

export const CATEGORIA_BULTO = new Set([
  'cat-cerveza',
  'cat-mezcla',
  'cat-snacks',
  'cat-cigarrillos',
  'cat-hielo',
])

/** Cuánto baja el precio al por mayor, y desde cuántas unidades */
export const MAYOREO = {
  bulto: { desde: 24, descuento: 0.12 },
  resto: { desde: 6, descuento: 0.08 },
} as const

export interface PresentacionForm {
  nombre: string
  /** Cuántas unidades base trae */
  factor: number
  /** Precio de la presentación completa */
  precio: number
  codigo?: string
}

export interface ProductoForm {
  /** Si viene, se está editando; si no, es alta */
  id?: UUID
  nombre: string
  nombreCorto: string
  categoriaId: UUID
  marca?: string
  contenidoMl?: number
  gradoAlcohol?: number
  codigoBarras?: string
  /** Precio de UNA unidad, con IVA incluido */
  precioDetal: number
  /** Precio de la misma unidad sacada de la nevera. Vacío = mismo que detal. */
  precioFrio?: number
  costo: number
  exento?: boolean
  retornable?: boolean
  stockSala?: number
  stockNevera?: number
  stockMin?: number
  presentaciones?: PresentacionForm[]
  /** Genera el precio de mayor automáticamente. Por defecto sí. */
  conMayoreo?: boolean
}

export interface ProductoArmado {
  producto: Producto
  presentaciones: Presentacion[]
  codigos: CodigoBarras[]
  precios: Precio[]
  existencias: Existencia[]
}

export interface ContextoCatalogo {
  ubicacionSala: UUID
  ubicacionNevera: UUID
  listaDetal: UUID
  listaFrio: UUID
  listaMayorBulto: UUID
  listaMayorResto: UUID
}

function sku(nombre: string, categoriaId: string): string {
  const limpio = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24)
  const cat = categoriaId.replace('cat-', '').slice(0, 3).toUpperCase()
  return `${cat}-${limpio}`
}

export function armarProducto(form: ProductoForm, ctx: ContextoCatalogo): ProductoArmado {
  const productoId = form.id ?? crypto.randomUUID()
  const ahora = Date.now()

  const producto: Producto = {
    id: productoId,
    sku: sku(form.nombreCorto || form.nombre, form.categoriaId),
    nombre: form.nombre.trim(),
    nombreCorto: (form.nombreCorto || form.nombre).trim(),
    categoriaId: form.categoriaId,
    marca: form.marca?.trim() || undefined,
    contenidoMl: form.contenidoMl,
    gradoAlcohol: form.gradoAlcohol,
    iva: form.exento ? 0 : 0.16,
    unidadBase: 'unidad',
    controlaLote: false,
    fraccionable: false,
    retornable: form.retornable ?? false,
    stockMin: form.stockMin ?? 0,
    costoPromedio: redondear(form.costo, 4),
    activo: true,
  }

  // --- Presentación base: la unidad. Siempre existe. ---
  const baseId = `${productoId}-base`
  const presentaciones: Presentacion[] = [
    {
      id: baseId,
      productoId,
      nombre: 'Unidad',
      factor: 1,
      esBase: true,
      permiteVenta: true,
      permiteCompra: false,
      activo: true,
    },
  ]

  const codigos: CodigoBarras[] = []
  if (form.codigoBarras?.trim()) {
    codigos.push({ codigo: form.codigoBarras.trim(), presentacionId: baseId, tipo: 'EAN13' })
  }

  const precios: Precio[] = [
    {
      id: `${baseId}-detal`,
      listaId: ctx.listaDetal,
      presentacionId: baseId,
      precio: redondear(form.precioDetal, 2),
      vigenteDesde: ahora,
      vigenteHasta: null,
    },
  ]

  // Solo si el producto se vende más caro frío. Si no, la lista Frío no tiene
  // fila para él y la resolución cae sola en Detal.
  if (form.precioFrio !== undefined && form.precioFrio > 0) {
    precios.push({
      id: `${baseId}-frio`,
      listaId: ctx.listaFrio,
      presentacionId: baseId,
      precio: redondear(form.precioFrio, 2),
      vigenteDesde: ahora,
      vigenteHasta: null,
    })
  }

  if (form.conMayoreo !== false) {
    const porBulto = CATEGORIA_BULTO.has(form.categoriaId)
    const regla = porBulto ? MAYOREO.bulto : MAYOREO.resto
    precios.push({
      id: `${baseId}-mayor`,
      listaId: porBulto ? ctx.listaMayorBulto : ctx.listaMayorResto,
      presentacionId: baseId,
      precio: redondear(form.precioDetal * (1 - regla.descuento), 2),
      vigenteDesde: ahora,
      vigenteHasta: null,
    })
  }

  // --- Presentaciones extra: six-pack, caja… ---
  for (const p of form.presentaciones ?? []) {
    if (!p.nombre.trim() || p.factor <= 0) continue
    const presId = `${productoId}-${p.factor}`
    presentaciones.push({
      id: presId,
      productoId,
      nombre: p.nombre.trim(),
      factor: p.factor,
      esBase: false,
      permiteVenta: true,
      permiteCompra: p.factor >= 6,
      activo: true,
    })
    if (p.codigo?.trim()) {
      codigos.push({ codigo: p.codigo.trim(), presentacionId: presId, tipo: 'DUN14' })
    }
    precios.push({
      id: `${presId}-detal`,
      listaId: ctx.listaDetal,
      presentacionId: presId,
      // Si no le pusieron precio, se asume proporcional al de la unidad
      precio: redondear(p.precio > 0 ? p.precio : form.precioDetal * p.factor, 2),
      vigenteDesde: ahora,
      vigenteHasta: null,
    })
  }

  // --- Existencia inicial ---
  const existencias: Existencia[] = []
  if ((form.stockSala ?? 0) !== 0) {
    existencias.push({
      productoId,
      ubicacionId: ctx.ubicacionSala,
      cantidadBase: form.stockSala ?? 0,
    })
  }
  if ((form.stockNevera ?? 0) !== 0) {
    existencias.push({
      productoId,
      ubicacionId: ctx.ubicacionNevera,
      cantidadBase: form.stockNevera ?? 0,
    })
  }

  return { producto, presentaciones, codigos, precios, existencias }
}

/** Reconstruye el formulario desde lo que ya está guardado, para poder editar */
export function desarmarProducto(
  producto: Producto,
  presentaciones: Presentacion[],
  codigos: CodigoBarras[],
  precios: Precio[],
  existencias: Map<string, number>,
  ctx: ContextoCatalogo,
): ProductoForm {
  const base = presentaciones.find((p) => p.esBase)
  const extras = presentaciones.filter((p) => !p.esBase && p.activo)

  const precioDe = (presentacionId: string, listaId: string) =>
    precios.find((x) => x.presentacionId === presentacionId && x.listaId === listaId)?.precio

  return {
    id: producto.id,
    nombre: producto.nombre,
    nombreCorto: producto.nombreCorto,
    categoriaId: producto.categoriaId,
    marca: producto.marca,
    contenidoMl: producto.contenidoMl,
    gradoAlcohol: producto.gradoAlcohol,
    codigoBarras: base ? codigos.find((c) => c.presentacionId === base.id)?.codigo : undefined,
    precioDetal: (base && precioDe(base.id, ctx.listaDetal)) ?? 0,
    precioFrio: base ? precioDe(base.id, ctx.listaFrio) : undefined,
    costo: producto.costoPromedio,
    exento: producto.iva === 0,
    retornable: producto.retornable,
    stockSala: existencias.get(`${producto.id}::${ctx.ubicacionSala}`) ?? 0,
    stockNevera: existencias.get(`${producto.id}::${ctx.ubicacionNevera}`) ?? 0,
    stockMin: producto.stockMin,
    presentaciones: extras.map((p) => ({
      nombre: p.nombre,
      factor: p.factor,
      precio: precioDe(p.id, ctx.listaDetal) ?? 0,
      codigo: codigos.find((c) => c.presentacionId === p.id)?.codigo,
    })),
  }
}

export interface ProblemaCatalogo {
  campo: string
  mensaje: string
}

/** Lo que hay que corregir antes de poder guardar */
export function validarProducto(form: ProductoForm): ProblemaCatalogo[] {
  const p: ProblemaCatalogo[] = []
  if (!form.nombre.trim()) p.push({ campo: 'nombre', mensaje: 'Falta el nombre' })
  if (!form.categoriaId) p.push({ campo: 'categoria', mensaje: 'Elige una categoría' })
  if (!(form.precioDetal > 0)) p.push({ campo: 'precioDetal', mensaje: 'El precio tiene que ser mayor que cero' })
  if (form.costo < 0) p.push({ campo: 'costo', mensaje: 'El costo no puede ser negativo' })
  if (form.costo > 0 && form.precioDetal > 0 && form.costo >= form.precioDetal) {
    p.push({ campo: 'costo', mensaje: 'El costo es igual o mayor que el precio: estarías vendiendo a pérdida' })
  }
  if (form.precioFrio !== undefined && form.precioFrio > 0 && form.precioFrio < form.precioDetal) {
    p.push({ campo: 'precioFrio', mensaje: 'El precio frío es menor que el de sala. ¿Seguro?' })
  }
  for (const pr of form.presentaciones ?? []) {
    if (pr.nombre.trim() && !(pr.factor > 1)) {
      p.push({ campo: 'presentaciones', mensaje: `"${pr.nombre}" tiene que traer más de una unidad` })
    }
  }
  return p
}

/** El margen que deja el producto al precio de detal, en porcentaje */
export function margen(precioDetal: number, costo: number, iva: number): number {
  if (precioDetal <= 0) return 0
  const sinIva = iva > 0 ? precioDetal / (1 + iva) : precioDetal
  if (sinIva <= 0) return 0
  return redondear(((sinIva - costo) / sinIva) * 100, 1)
}
