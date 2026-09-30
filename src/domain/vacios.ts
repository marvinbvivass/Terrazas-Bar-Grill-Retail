import { redondear } from './money'
import type { DiaNegocio, Producto, UUID } from './types'

/**
 * Control de vacíos: los envases retornables que circulan.
 *
 * El envase no es del local. Es de la cervecera, y va y viene. Eso crea DOS
 * deudas que no se pueden mezclar porque van en direcciones contrarias:
 *
 *   CON LA COMPAÑÍA — El camión deja mercancía llena y el local queda debiendo
 *   esos envases. La deuda sube al recibir y baja cuando se le entregan vacíos
 *   al camión. Si nadie la lleva, el día que llegue el despacho te cobran los
 *   envases y nadie sabe explicar por qué.
 *
 *   CON LOS CLIENTES — El que se lleva la botella para su casa se lleva un
 *   envase del local. La deuda del cliente sube cuando la botella sale y baja
 *   cuando la trae de vuelta. El que se la toma ahí mismo no debe nada: el
 *   envase se queda.
 *
 * ---------------------------------------------------------------------------
 * El signo
 * ---------------------------------------------------------------------------
 *
 * `cantidad` va con signo y SIEMPRE desde el punto de vista de la deuda:
 * positivo la sube, negativo la baja. Quién debe a quién lo dice `contraparte`,
 * no el signo. Guardarlo al revés —positivo "entra al local"— obligaría a cada
 * consulta a saber de qué lado está mirando, y basta que una se confunda para
 * que el saldo salga invertido.
 */

export type ContraparteVacios = 'compania' | 'cliente'

export interface LineaVacios {
  productoId: UUID
  /** Positivo sube la deuda, negativo la baja */
  cantidad: number
}

export interface MovimientoVacios {
  id: UUID
  dia: DiaNegocio
  fecha: number
  usuarioId: UUID
  contraparte: ContraparteVacios
  /** Obligatorio si la contraparte es un cliente */
  clienteId: UUID | null
  /** Qué lo originó, para poder rastrearlo */
  documentoTipo: 'recepcion' | 'cierre' | 'manual'
  documentoId: UUID | null
  lineas: LineaVacios[]
  nota: string | null
  creadoOffline: boolean
  sincronizadoEn: number | null
}

export interface DatosVacios {
  dia: DiaNegocio
  fecha: number
  usuarioId: UUID
  documentoTipo: MovimientoVacios['documentoTipo']
  documentoId?: UUID | null
  nota?: string | null
  creadoOffline: boolean
}

/** Un renglón tal como se teclea: cuántos salieron y cuántos volvieron */
export interface EntradaVacios {
  productoId: UUID
  /** Envases que se suman a la deuda */
  suman: number
  /** Envases que la bajan */
  restan: number
}

function construir(
  contraparte: ContraparteVacios,
  clienteId: UUID | null,
  entradas: EntradaVacios[],
  datos: DatosVacios,
): MovimientoVacios | null {
  const lineas: LineaVacios[] = []
  for (const e of entradas) {
    const cantidad = redondear((e.suman || 0) - (e.restan || 0), 0)
    if (cantidad === 0) continue
    lineas.push({ productoId: e.productoId, cantidad })
  }
  if (lineas.length === 0) return null

  return {
    id: crypto.randomUUID(),
    dia: datos.dia,
    fecha: datos.fecha,
    usuarioId: datos.usuarioId,
    contraparte,
    clienteId,
    documentoTipo: datos.documentoTipo,
    documentoId: datos.documentoId ?? null,
    lineas,
    nota: datos.nota?.trim() || null,
    creadoOffline: datos.creadoOffline,
    sincronizadoEn: null,
  }
}

/**
 * Lo que pasa con la compañía.
 *
 * `dejados` son los envases que vinieron llenos en este despacho y que el local
 * va a tener que devolver. `devueltos` son los vacíos que se le entregaron al
 * camión en ese mismo viaje, que es cuando de verdad se entregan.
 */
export function vaciosDeCompania(
  entradas: Array<{ productoId: UUID; dejados: number; devueltos: number }>,
  datos: DatosVacios,
): MovimientoVacios | null {
  return construir(
    'compania',
    null,
    entradas.map((e) => ({ productoId: e.productoId, suman: e.dejados, restan: e.devueltos })),
    datos,
  )
}

/**
 * Lo que pasa con un cliente.
 *
 * `seLlevo` son envases que salieron del local con él; `trajo` los que devolvió.
 * Un mismo movimiento puede tener los dos: llega con seis vacíos y se lleva
 * seis llenas, y su deuda no cambia.
 */
export function vaciosDeCliente(
  clienteId: UUID,
  entradas: Array<{ productoId: UUID; seLlevo: number; trajo: number }>,
  datos: DatosVacios,
): MovimientoVacios | null {
  return construir(
    'cliente',
    clienteId,
    entradas.map((e) => ({ productoId: e.productoId, suman: e.seLlevo, restan: e.trajo })),
    datos,
  )
}

// ---------------------------------------------------------------------------
// Saldos
// ---------------------------------------------------------------------------

/** Cuántos envases se le deben a la compañía, por producto */
export function saldoCompania(movimientos: MovimientoVacios[]): Map<UUID, number> {
  return acumular(movimientos.filter((m) => m.contraparte === 'compania'))
}

/** Cuántos envases debe un cliente, por producto */
export function saldoCliente(clienteId: UUID, movimientos: MovimientoVacios[]): Map<UUID, number> {
  return acumular(
    movimientos.filter((m) => m.contraparte === 'cliente' && m.clienteId === clienteId),
  )
}

function acumular(movimientos: MovimientoVacios[]): Map<UUID, number> {
  const mapa = new Map<UUID, number>()
  for (const m of movimientos) {
    for (const l of m.lineas) {
      mapa.set(l.productoId, (mapa.get(l.productoId) ?? 0) + l.cantidad)
    }
  }
  // Los ceros no se muestran: un producto saldado no es una deuda.
  for (const [k, v] of mapa) if (v === 0) mapa.delete(k)
  return mapa
}

export function totalDe(saldo: Map<UUID, number>): number {
  let total = 0
  for (const v of saldo.values()) total += v
  return total
}

export interface DeudorVacios {
  clienteId: UUID
  total: number
  porProducto: Map<UUID, number>
}

/** Los clientes que deben envases, de mayor a menor */
export function deudoresDeVacios(movimientos: MovimientoVacios[]): DeudorVacios[] {
  const clientes = new Set<UUID>()
  for (const m of movimientos) {
    if (m.contraparte === 'cliente' && m.clienteId) clientes.add(m.clienteId)
  }

  return [...clientes]
    .map((clienteId) => {
      const porProducto = saldoCliente(clienteId, movimientos)
      return { clienteId, total: totalDe(porProducto), porProducto }
    })
    .filter((d) => d.total !== 0)
    .sort((a, b) => b.total - a.total)
}

/** Solo los productos marcados como retornables tienen envase que controlar */
export function productosConEnvase(productos: Producto[]): Producto[] {
  return productos.filter((p) => p.retornable && p.activo)
}
