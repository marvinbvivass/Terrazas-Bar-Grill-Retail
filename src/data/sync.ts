import { db, type VentaPendiente } from './db'
import type { Venta } from '../domain/types'

/**
 * Sincronización.
 *
 * La regla que sostiene todo esto: el UUID de la venta lo generó la caja, no el
 * servidor. Por eso empujar la cola dos veces produce el mismo resultado que
 * empujarla una, y un corte a mitad del envío no deja ventas duplicadas ni
 * obliga a nadie a revisarlas a mano.
 *
 * El servidor hace `insert ... on conflict (id) do nothing`, devuelve el
 * correlativo definitivo y asienta el kardex. Aquí solo queda guardar el número
 * y sacar la venta de la cola.
 */

export interface RespuestaSync {
  id: string
  numero: number
  aceptada: boolean
  motivo?: string
}

export interface Transporte {
  /** Sube un lote de ventas. Debe ser idempotente por `venta.id`. */
  subirVentas(ventas: Venta[]): Promise<RespuestaSync[]>
  /** Baja el catálogo completo. Con 40 productos son unos pocos kilobytes. */
  bajarSnapshot(): Promise<void>
}

/**
 * Transporte de mentira mientras no exista el backend.
 *
 * Deja la cola intacta a propósito: así se puede ver el contador de pendientes
 * subir mientras se vende, que es justo el comportamiento que hay que probar
 * antes de conectar nada.
 */
export const transporteLocal: Transporte = {
  async subirVentas() {
    return []
  },
  async bajarSnapshot() {
    /* sin backend todavía */
  },
}

let transporte: Transporte = transporteLocal

export function configurarTransporte(t: Transporte): void {
  transporte = t
}

export interface ResultadoEmpuje {
  intentadas: number
  aceptadas: number
  rechazadas: number
}

export async function empujarCola(limite = 50): Promise<ResultadoEmpuje> {
  const pendientes: VentaPendiente[] = await db.outbox.orderBy('creadaEn').limit(limite).toArray()
  if (pendientes.length === 0) return { intentadas: 0, aceptadas: 0, rechazadas: 0 }

  let aceptadas = 0
  let rechazadas = 0

  try {
    const respuestas = await transporte.subirVentas(pendientes.map((p) => p.venta))

    for (const r of respuestas) {
      if (r.aceptada) {
        await db.transaction('rw', [db.ventas, db.outbox], async () => {
          const venta = await db.ventas.get(r.id)
          if (venta) {
            await db.ventas.put({ ...venta, numero: r.numero, sincronizadaEn: Date.now() })
          }
          await db.outbox.delete(r.id)
        })
        aceptadas++
      } else {
        // Se queda en la cola con el motivo, para que alguien la mire.
        // Nunca se descarta una venta cobrada por un error de sincronización.
        const fila = await db.outbox.get(r.id)
        if (fila) {
          await db.outbox.put({
            ...fila,
            intentos: fila.intentos + 1,
            ultimoError: r.motivo ?? 'rechazada por el servidor',
          })
        }
        rechazadas++
      }
    }
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : 'sin conexión'
    for (const p of pendientes) {
      await db.outbox.put({ ...p, intentos: p.intentos + 1, ultimoError: mensaje })
    }
    return { intentadas: pendientes.length, aceptadas: 0, rechazadas: 0 }
  }

  return { intentadas: pendientes.length, aceptadas, rechazadas }
}

export async function bajarSnapshot(): Promise<void> {
  await transporte.bajarSnapshot()
}
