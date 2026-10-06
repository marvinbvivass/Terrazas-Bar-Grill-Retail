import { redondear } from './money'
import type {
  CodigoBarras,
  Precio,
  Presentacion,
  Producto,
  UnidadContenido,
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
}

export interface ProductoForm {
  /** Si viene, se está editando; si no, es alta */
  id?: UUID
  nombre: string
  nombreCorto: string
  categoriaId: UUID
  marca?: string
  contenido?: number
  unidadContenido?: UnidadContenido
  gradoAlcohol?: number
  /** Precio de UNA unidad, tal como se cobra */
  precioDetal: number
  /**
   * El costo NO se teclea: lo aprende el sistema de las facturas de recepción.
   *
   * Viaja en el formulario solo para no perderlo al editar. Un producto que ya
   * recibió mercancía tiene un costo promedio calculado contra lo que de verdad
   * se le pagó al proveedor; si al guardar una edición se escribiera cero, el
   * margen de ese producto se iría al 100% y nadie entendería por qué.
   */
  costoPromedio?: number
  /** Lleva envase que va y viene */
  retornable?: boolean
  stockMin?: number
  presentaciones?: PresentacionForm[]
}

export interface ProductoArmado {
  producto: Producto
  presentaciones: Presentacion[]
  codigos: CodigoBarras[]
  precios: Precio[]
}

export interface ContextoCatalogo {
  /**
   * La única ubicación de venta.
   *
   * El sistema llevaba el stock partido entre sala y nevera, y el precio de
   * frío salía de esa separación. El negocio lleva un inventario general: una
   * botella es una botella esté donde esté, y partirla obligaba a registrar
   * traslados que nadie iba a registrar.
   */
  ubicacion: UUID
  listaDetal: UUID
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
    contenido: form.contenido,
    unidadContenido: form.contenido ? (form.unidadContenido ?? 'ml') : undefined,
    gradoAlcohol: form.gradoAlcohol,
    /*
     * Sin IVA.
     *
     * El negocio cobra el precio de la pizarra y no desglosa impuesto en el
     * ticket. Con 0, `subtotal` y `total` coinciden y el cierre deja de
     * arrastrar una base imponible que nadie mira. El motor sigue soportando
     * IVA por si algún día hace falta facturar.
     */
    iva: 0,
    unidadBase: 'unidad',
    controlaLote: false,
    fraccionable: false,
    retornable: form.retornable ?? false,
    stockMin: form.stockMin ?? 0,
    // Se conserva el que ya tenía; para uno nuevo arranca en cero y lo fija la
    // primera recepción.
    costoPromedio: redondear(form.costoPromedio ?? 0, 4),
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

  // Sin códigos de barras: el mostrador no usa escáner y el campo solo era un
  // paso más que rellenar al dar de alta un producto.
  const codigos: CodigoBarras[] = []

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

  /*
   * Ya no se genera precio de mayor automático.
   *
   * Esas listas se activaban por cantidad acumulada, y el único sitio donde hoy
   * se registran ventas es el cierre del día, que lleva los escalones apagados
   * a propósito: su carrito es la jornada entera y no la compra de un cliente.
   * O sea que esas filas no llegaban a aplicarse nunca. Vender más barato por
   * bulto se hace dándole su precio a la presentación de paquete o caja.
   */

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

  /*
   * El alta NO trae existencia.
   *
   * El catálogo dice QUÉ es el producto; cuánto hay es asunto del inventario, y
   * ahí entra por recepción, que deja factura, costo y fecha. Poder teclear una
   * existencia inicial aquí era la puerta trasera por la que el stock cambiaba
   * sin dejar ni un asiento que lo explicara.
   */

  return { producto, presentaciones, codigos, precios }
}

/** Reconstruye el formulario desde lo que ya está guardado, para poder editar */
export function desarmarProducto(
  producto: Producto,
  presentaciones: Presentacion[],
  /** Se conserva en la firma para no tocar a quien llama; ya no se usa. */
  _codigos: CodigoBarras[],
  precios: Precio[],
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
    contenido: producto.contenido,
    unidadContenido: producto.unidadContenido ?? 'ml',
    gradoAlcohol: producto.gradoAlcohol,
    precioDetal: (base && precioDe(base.id, ctx.listaDetal)) ?? 0,
    costoPromedio: producto.costoPromedio,
    retornable: producto.retornable,
    stockMin: producto.stockMin,
    presentaciones: extras.map((p) => ({
      nombre: p.nombre,
      factor: p.factor,
      precio: precioDe(p.id, ctx.listaDetal) ?? 0,
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
