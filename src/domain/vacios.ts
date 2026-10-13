import { redondear } from './money'
import type { DiaNegocio, Producto, UUID } from './types'

/**
 * Control de vacíos: los envases retornables que circulan.
 *
 * SE CUENTAN POR CAJAS, no por botellas. Es la unidad en la que los mueve el
 * distribuidor: el camión no recibe cuatrocientas ochenta botellas sueltas,
 * recibe trece gaveras. Contarlos por botella obligaría al encargado a
 * multiplicar frente al camión, que es donde se equivoca, y a cuadrar contra un
 * número que el distribuidor no usa.
 *
 * ---------------------------------------------------------------------------
 * UNA SOLA BOLSA, SIN DISTINGUIR PRODUCTO
 * ---------------------------------------------------------------------------
 *
 * El saldo es un número y no un reparto por producto, porque así funciona el
 * patio: si el camión deja diez cajas de Solera Light y se lleva cinco de
 * Pilsen y cinco de Tercio, se queda en cero. La gavera es la gavera.
 *
 * Llevarlo por producto obligaba a inventar una correspondencia que el negocio
 * no hace —"¿estas cinco cajas contra cuál de las deudas van?"— y producía
 * saldos absurdos: deber diez cajas de una marca y tener cinco a favor de otra,
 * con el patio vacío y las cuentas claras para todo el mundo menos para el
 * sistema.
 *
 * Lo que sí distingue el sistema es QUÉ PRODUCTOS llevan envase: una lata no
 * genera vacío y una botella sí. Eso es del producto; el saldo, no.
 *
 * ---------------------------------------------------------------------------
 * Dos deudas, en direcciones contrarias
 * ---------------------------------------------------------------------------
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
 * Nunca se suman entre sí: que un cliente te deba tres cajas no paga las que le
 * debes al distribuidor.
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
  /** EN CAJAS, con signo. Positivo sube la deuda, negativo la baja. */
  cantidad: number
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

function construir(
  contraparte: ContraparteVacios,
  clienteId: UUID | null,
  suman: number,
  restan: number,
  datos: DatosVacios,
): MovimientoVacios | null {
  const cantidad = redondear((suman || 0) - (restan || 0), 0)
  /*
   * Un movimiento que no mueve nada no se guarda.
   *
   * Diez cajas que entran y diez que salen dejan la deuda igual; un documento
   * en cero solo ensucia el historial de quien después tenga que entenderlo.
   */
  if (cantidad === 0) return null

  return {
    id: crypto.randomUUID(),
    dia: datos.dia,
    fecha: datos.fecha,
    usuarioId: datos.usuarioId,
    contraparte,
    clienteId,
    documentoTipo: datos.documentoTipo,
    documentoId: datos.documentoId ?? null,
    cantidad,
    nota: datos.nota?.trim() || null,
    creadoOffline: datos.creadoOffline,
    sincronizadoEn: null,
  }
}

/**
 * Lo que pasa con la compañía.
 *
 * `dejadas` son las cajas que vinieron llenas en este despacho y que el local
 * va a tener que devolver. `devueltas` son las cajas de vacíos que se le
 * entregaron al camión en ese mismo viaje, que es cuando de verdad se entregan.
 */
export function vaciosDeCompania(
  dejadas: number,
  devueltas: number,
  datos: DatosVacios,
): MovimientoVacios | null {
  return construir('compania', null, dejadas, devueltas, datos)
}

/**
 * Lo que pasa con un cliente.
 *
 * `seLlevo` son cajas que salieron del local con él; `trajo` las que devolvió.
 * Un mismo movimiento puede tener las dos: llega con dos cajas de vacíos y se
 * lleva dos llenas, y su deuda no cambia.
 */
export function vaciosDeCliente(
  clienteId: UUID,
  seLlevo: number,
  trajo: number,
  datos: DatosVacios,
): MovimientoVacios | null {
  return construir('cliente', clienteId, seLlevo, trajo, datos)
}

// ---------------------------------------------------------------------------
// Saldos
// ---------------------------------------------------------------------------

/** Cuántas CAJAS de vacíos se le deben a la compañía */
export function saldoCompania(movimientos: MovimientoVacios[]): number {
  return sumar(movimientos.filter((m) => m.contraparte === 'compania'))
}

/** Cuántas CAJAS de vacíos debe un cliente */
export function saldoCliente(clienteId: UUID, movimientos: MovimientoVacios[]): number {
  return sumar(movimientos.filter((m) => m.contraparte === 'cliente' && m.clienteId === clienteId))
}

function sumar(movimientos: MovimientoVacios[]): number {
  return movimientos.reduce((total, m) => total + m.cantidad, 0)
}

export interface DeudorVacios {
  clienteId: UUID
  total: number
}

/** Los clientes que deben cajas de vacíos, de mayor a menor */
export function deudoresDeVacios(movimientos: MovimientoVacios[]): DeudorVacios[] {
  const clientes = new Set<UUID>()
  for (const m of movimientos) {
    if (m.contraparte === 'cliente' && m.clienteId) clientes.add(m.clienteId)
  }

  return [...clientes]
    .map((clienteId) => ({ clienteId, total: saldoCliente(clienteId, movimientos) }))
    .filter((d) => d.total !== 0)
    .sort((a, b) => b.total - a.total)
}

/**
 * Qué productos llevan envase.
 *
 * El saldo no distingue producto, pero esto sí: sirve para saber si lo que se
 * vendió genera vacío. Una lata no vuelve; una botella de 1/4, sí.
 */
export function productosConEnvase(productos: Producto[]): Producto[] {
  return productos.filter((p) => p.retornable && p.activo)
}
