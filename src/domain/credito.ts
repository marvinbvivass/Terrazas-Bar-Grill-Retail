import { redondear } from './money'
import { diaDe, diasDesde } from './dias'
import type { Abono, AplicacionAbono, Cliente, DiaNegocio, Pago, UUID, Venta } from './types'

/**
 * Crédito a clientes de confianza.
 *
 * El saldo NO se guarda en ninguna parte: se calcula sumando las ventas a
 * crédito y restando lo abonado. Un saldo almacenado es un saldo que un día se
 * desincroniza y nadie sabe cuál de los dos números es el bueno.
 *
 * Un abono se reparte entre las ventas abiertas del cliente, de la más vieja a
 * la más nueva. Es como funciona una cuenta de bodega: el cliente no dice "esto
 * es para la del martes", dice "te abono veinte".
 */

export interface VentaConSaldo {
  venta: Venta
  /** Cuánto de esta venta ya se cobró */
  abonado: number
  /** Cuánto falta */
  saldo: number
  /** Días transcurridos desde la venta */
  antiguedad: number
}

export function esCredito(v: Venta): boolean {
  return v.condicion === 'credito' && v.estado !== 'anulada'
}

/** Cuánto se ha abonado a una venta concreta, sumando todos los abonos */
export function abonadoDeVenta(ventaId: UUID, abonos: Abono[]): number {
  let total = 0
  for (const a of abonos) {
    for (const ap of a.aplicaciones) {
      if (ap.ventaId === ventaId) total = redondear(total + ap.monto, 2)
    }
  }
  return total
}

/** Las ventas a crédito de un cliente que todavía deben algo, de la más vieja a la más nueva */
export function ventasAbiertas(
  clienteId: UUID,
  ventas: Venta[],
  abonos: Abono[],
  referencia: DiaNegocio = diaDe(),
): VentaConSaldo[] {
  const delCliente = abonos.filter((a) => a.clienteId === clienteId)
  return ventas
    .filter((v) => v.clienteId === clienteId && esCredito(v))
    .map((venta) => {
      const abonado = abonadoDeVenta(venta.id, delCliente)
      return {
        venta,
        abonado,
        saldo: redondear(venta.total - abonado, 2),
        antiguedad: diasDesde(venta.dia, referencia),
      }
    })
    .filter((x) => x.saldo > 0)
    .sort((a, b) => a.venta.fecha - b.venta.fecha)
}

export function saldoDeCliente(clienteId: UUID, ventas: Venta[], abonos: Abono[]): number {
  return ventasAbiertas(clienteId, ventas, abonos).reduce((s, x) => redondear(s + x.saldo, 2), 0)
}

export interface ResumenCliente {
  cliente: Cliente
  saldo: number
  ventasAbiertas: number
  /** Días de la deuda más vieja. 0 si no debe nada. */
  masVieja: number
  /** El saldo pasó del límite declarado */
  sobreLimite: boolean
}

export function resumirClientes(
  clientes: Cliente[],
  ventas: Venta[],
  abonos: Abono[],
): ResumenCliente[] {
  return clientes
    .filter((c) => c.activo)
    .map((cliente) => {
      const abiertas = ventasAbiertas(cliente.id, ventas, abonos)
      const saldo = abiertas.reduce((s, x) => redondear(s + x.saldo, 2), 0)
      return {
        cliente,
        saldo,
        ventasAbiertas: abiertas.length,
        masVieja: abiertas.length > 0 ? Math.max(...abiertas.map((x) => x.antiguedad)) : 0,
        sobreLimite: cliente.limiteCredito > 0 && saldo > cliente.limiteCredito,
      }
    })
    .sort((a, b) => b.saldo - a.saldo || a.cliente.nombre.localeCompare(b.cliente.nombre))
}

// ---------------------------------------------------------------------------
// Aplicación de un abono
// ---------------------------------------------------------------------------

export interface PlanAbono {
  aplicaciones: AplicacionAbono[]
  /** Cuánto del abono se pudo aplicar */
  aplicado: number
  /** Sobrante: el cliente pagó más de lo que debía */
  sobrante: number
  /** Ventas que quedan saldadas por completo con este abono */
  saldadas: UUID[]
  /** Venta que queda a medias, si la hay */
  parcial: { ventaId: UUID; saldoRestante: number } | null
}

/**
 * Reparte un monto entre las ventas abiertas, de la más vieja a la más nueva.
 *
 * Si el cliente debe 12 y 8, y abona 15: salda la de 12 y deja la de 8 con
 * saldo 5. Si abona 25, quedan las dos saldadas y sobran 5, que la interfaz
 * tiene que mostrar en vez de tragárselos.
 */
export function planificarAbono(abiertas: VentaConSaldo[], monto: number): PlanAbono {
  let restante = redondear(monto, 2)
  const aplicaciones: AplicacionAbono[] = []
  const saldadas: UUID[] = []
  let parcial: PlanAbono['parcial'] = null

  for (const x of abiertas) {
    if (restante <= 0) break
    const aplica = redondear(Math.min(restante, x.saldo), 2)
    if (aplica <= 0) continue

    aplicaciones.push({ ventaId: x.venta.id, monto: aplica })
    restante = redondear(restante - aplica, 2)

    if (aplica >= x.saldo) saldadas.push(x.venta.id)
    else parcial = { ventaId: x.venta.id, saldoRestante: redondear(x.saldo - aplica, 2) }
  }

  const aplicado = aplicaciones.reduce((s, a) => redondear(s + a.monto, 2), 0)
  return { aplicaciones, aplicado, sobrante: restante, saldadas, parcial }
}

/**
 * Reparte el monto solo entre las ventas elegidas a mano.
 *
 * Es el caso de "págame la del martes y déjame la del jueves": el cliente sí
 * dice a cuál va, y el orden por antigüedad no aplica.
 */
export function planificarAbonoDirigido(
  abiertas: VentaConSaldo[],
  ventaIds: UUID[],
  monto: number,
): PlanAbono {
  const elegidas = abiertas.filter((x) => ventaIds.includes(x.venta.id))
  return planificarAbono(elegidas, monto)
}

export interface DatosAbono {
  clienteId: UUID
  dia: DiaNegocio
  fecha: number
  monto: number
  pagos: Pago[]
  usuarioId: UUID
  nota?: string | null
}

export function construirAbono(datos: DatosAbono, plan: PlanAbono): Abono {
  return {
    id: crypto.randomUUID(),
    clienteId: datos.clienteId,
    dia: datos.dia,
    fecha: datos.fecha,
    registradoEn: Date.now(),
    monto: plan.aplicado,
    pagos: datos.pagos,
    aplicaciones: plan.aplicaciones,
    usuarioId: datos.usuarioId,
    nota: datos.nota ?? null,
  }
}
