import { db, type Pendiente } from './db'
import type { CierreDia } from '../domain/cierreDia'
import type { Abono, Venta } from '../domain/types'

/**
 * Sincronización.
 *
 * La regla que sostiene todo esto: el UUID del documento lo genera la caja, no
 * el servidor. Por eso empujar la cola dos veces produce el mismo resultado que
 * empujarla una, y un corte a mitad del envío no deja documentos duplicados ni
 * obliga a nadie a revisarlos a mano.
 *
 * El servidor hace `insert ... on conflict (id) do nothing`, devuelve el
 * correlativo definitivo y asienta el kardex.
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
  /** Sube cobros a clientes. Idempotente por `abono.id`. */
  subirAbonos(abonos: Abono[]): Promise<RespuestaSync[]>
  /** Sube productos creados o editados en la caja, con todo lo suyo. */
  subirCatalogo(productoIds: string[]): Promise<void>
  /** Sube clientes de fiado creados en la caja. */
  subirClientes(clienteIds: string[]): Promise<void>
  /** Sube las actas de cierre. Idempotente por `cierre.id`, que es el día. */
  subirCierres(cierres: CierreDia[]): Promise<void>
  /** Baja el catálogo completo. Con pocos productos son unos kilobytes. */
  bajarSnapshot(): Promise<void>
}

/**
 * Transporte de mentira mientras no exista el backend.
 *
 * Deja la cola intacta a propósito: así se puede ver el contador de pendientes
 * subir mientras se carga el día, que es justo el comportamiento que hay
 * que probar antes de conectar nada.
 */
export const transporteLocal: Transporte = {
  async subirVentas() {
    return []
  },
  async subirAbonos() {
    return []
  },
  async subirCatalogo() {
    /* sin backend todavía */
  },
  async subirClientes() {
    /* sin backend todavía */
  },
  async subirCierres() {
    /* sin backend todavía */
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
  const pendientes: Pendiente[] = await db.outbox.orderBy('creadaEn').limit(limite).toArray()
  if (pendientes.length === 0) return { intentadas: 0, aceptadas: 0, rechazadas: 0 }

  const ventas = pendientes.filter((p) => p.tipo === 'venta').map((p) => p.venta)
  const abonos = pendientes.filter((p) => p.tipo === 'abono').map((p) => p.abono)
  const productos = pendientes.filter((p) => p.tipo === 'producto')
  const clientes = pendientes.filter((p) => p.tipo === 'cliente')
  const cierres = pendientes.filter((p) => p.tipo === 'cierre')

  let aceptadas = 0
  let rechazadas = 0

  try {
    // El catálogo va PRIMERO: una venta que menciona un producto que el
    // servidor todavía no conoce es una venta huérfana en los reportes.
    if (productos.length) {
      await transporte.subirCatalogo(productos.map((p) => p.id))
      await db.outbox.bulkDelete(productos.map((p) => p.id))
      aceptadas += productos.length
    }
    if (clientes.length) {
      await transporte.subirClientes(clientes.map((p) => p.id))
      await db.outbox.bulkDelete(clientes.map((p) => p.id))
      aceptadas += clientes.length
    }

    // El acta va DESPUÉS de las ventas del día: si subiera antes y la conexión
    // se cortara a la mitad, el servidor tendría el resumen de un día cuyas
    // ventas todavía no conoce, y cualquier reporte daría números que no
    // cuadran entre sí.
    const subirActas = async () => {
      if (!cierres.length) return
      await transporte.subirCierres(cierres.map((p) => p.cierre))
      await db.transaction('rw', [db.cierres, db.outbox], async () => {
        for (const p of cierres) {
          const guardado = await db.cierres.get(p.id)
          if (guardado) await db.cierres.put({ ...guardado, sincronizadoEn: Date.now() })
          await db.outbox.delete(p.id)
        }
      })
      aceptadas += cierres.length
    }

    const respuestas = [
      ...(ventas.length ? await transporte.subirVentas(ventas) : []),
      ...(abonos.length ? await transporte.subirAbonos(abonos) : []),
    ]

    await subirActas()

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
        // Nunca se descarta un documento por un error de sincronización.
        const fila = await db.outbox.get(r.id)
        if (fila) {
          await db.outbox.put({
            ...fila,
            intentos: fila.intentos + 1,
            ultimoError: r.motivo ?? 'rechazado por el servidor',
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
