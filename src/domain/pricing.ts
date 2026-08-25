import type { ListaPrecio, Precio, PrecioResuelto, TipoCliente, UUID } from './types'

/**
 * Motor de precios. Es el puerto en TypeScript de la función `resolver_precio()`
 * del esquema SQL, y tiene que dar exactamente el mismo resultado: la caja
 * calcula el precio sin red y el servidor lo revalida al sincronizar, así que
 * si las dos implementaciones divergen, las ventas offline se rechazan.
 *
 * Gana la lista ACTIVA de menor `prioridad` cuya ubicación, tipo de cliente y
 * cantidad mínima se cumplan en ese momento. Añadir "happy hour de jueves a
 * sábado" es insertar una fila, no desplegar código.
 */

export interface ContextoPrecio {
  presentacionId: UUID
  /**
   * Cantidad ACUMULADA de ese producto en el carrito, en unidades base.
   * Es acumulada a propósito: así la lista de mayor se activa sola a mitad de
   * la venta, cuando el cliente pasa de 30 a 36 botellas.
   */
  cantidadBase: number
  ubicacionId: UUID
  tipoCliente: TipoCliente
  momento: number
}

export interface CatalogoPrecios {
  listas: ListaPrecio[]
  precios: Precio[]
}

function listaAplica(lista: ListaPrecio, ctx: ContextoPrecio): boolean {
  if (!lista.activo) return false
  if (lista.cantidadMin !== null && ctx.cantidadBase < lista.cantidadMin) return false
  if (lista.ubicacionId !== null && lista.ubicacionId !== ctx.ubicacionId) return false
  if (lista.tipoCliente !== null && lista.tipoCliente !== ctx.tipoCliente) return false
  return true
}

function precioVigente(precio: Precio, momento: number): boolean {
  if (precio.vigenteDesde > momento) return false
  if (precio.vigenteHasta !== null && precio.vigenteHasta <= momento) return false
  return true
}

export function resolverPrecio(
  ctx: ContextoPrecio,
  catalogo: CatalogoPrecios,
): PrecioResuelto | null {
  const listasPorId = new Map(catalogo.listas.map((l) => [l.id, l]))

  const candidatos = catalogo.precios
    .filter((p) => p.presentacionId === ctx.presentacionId)
    .filter((p) => precioVigente(p, ctx.momento))
    .map((p) => ({ precio: p, lista: listasPorId.get(p.listaId) }))
    .filter((c): c is { precio: Precio; lista: ListaPrecio } => c.lista !== undefined)
    .filter((c) => listaAplica(c.lista, ctx))

  if (candidatos.length === 0) return null

  // ORDER BY l.prioridad ASC, pr.vigente_desde DESC
  candidatos.sort(
    (a, b) =>
      a.lista.prioridad - b.lista.prioridad ||
      b.precio.vigenteDesde - a.precio.vigenteDesde,
  )

  const ganador = candidatos[0]!
  return {
    precio: ganador.precio.precio,
    listaId: ganador.lista.id,
    listaNombre: ganador.lista.nombre,
  }
}

/**
 * Todas las listas que podrían aplicar a esta presentación, ordenadas como las
 * evalúa el motor. La caja la usa para mostrarle al cajero por qué salió ese
 * precio y qué pasaría si el cliente se llevara más.
 */
export function preciosDisponibles(
  presentacionId: UUID,
  ubicacionId: UUID,
  momento: number,
  catalogo: CatalogoPrecios,
): Array<{ lista: ListaPrecio; precio: number }> {
  const listasPorId = new Map(catalogo.listas.map((l) => [l.id, l]))
  return catalogo.precios
    .filter((p) => p.presentacionId === presentacionId && precioVigente(p, momento))
    .map((p) => ({ lista: listasPorId.get(p.listaId), precio: p.precio }))
    .filter((c): c is { lista: ListaPrecio; precio: number } => c.lista !== undefined)
    .filter((c) => c.lista.activo)
    .filter((c) => c.lista.ubicacionId === null || c.lista.ubicacionId === ubicacionId)
    .sort((a, b) => a.lista.prioridad - b.lista.prioridad)
}

/**
 * Cuántas unidades base faltan para que se active una lista más barata.
 * Sirve para el aviso de la caja: "6 más y baja a $0,80".
 */
export function siguienteEscalon(
  ctx: ContextoPrecio,
  catalogo: CatalogoPrecios,
): { faltan: number; precio: number; lista: string } | null {
  const actual = resolverPrecio(ctx, catalogo)
  if (!actual) return null

  const listasPorId = new Map(catalogo.listas.map((l) => [l.id, l]))

  const mejores = catalogo.precios
    .filter((p) => p.presentacionId === ctx.presentacionId && precioVigente(p, ctx.momento))
    .map((p) => ({ precio: p, lista: listasPorId.get(p.listaId) }))
    .filter((c): c is { precio: Precio; lista: ListaPrecio } => c.lista !== undefined)
    .filter((c) => c.lista.activo)
    .filter((c) => c.lista.ubicacionId === null || c.lista.ubicacionId === ctx.ubicacionId)
    .filter((c) => c.lista.tipoCliente === null || c.lista.tipoCliente === ctx.tipoCliente)
    // solo las que aún no aplican por cantidad y que además son más baratas
    .filter((c) => c.lista.cantidadMin !== null && c.lista.cantidadMin > ctx.cantidadBase)
    .filter((c) => c.precio.precio < actual.precio)
    .sort((a, b) => a.lista.cantidadMin! - b.lista.cantidadMin!)

  const siguiente = mejores[0]
  if (!siguiente) return null

  return {
    faltan: siguiente.lista.cantidadMin! - ctx.cantidadBase,
    precio: siguiente.precio.precio,
    lista: siguiente.lista.nombre,
  }
}
