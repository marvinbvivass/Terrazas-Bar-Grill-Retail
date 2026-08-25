import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore'
import { obtenerFirestore } from './firebase'
import { claveExistencia, db } from './db'
import { movimientosDeVenta } from '../domain/cart'
import { construirSemilla } from './seed'
import type { Abono, Venta } from '../domain/types'
import type { RespuestaSync, Transporte } from './sync'

/**
 * Transporte contra Firestore.
 *
 * IDEMPOTENCIA: el id del documento es el UUID que generó la caja, así que
 * subir la misma venta dos veces escribe en el mismo documento. Pero eso no
 * basta, porque una venta también DESCUENTA STOCK: si se reintenta el envío,
 * un `increment(-6)` ciego descontaría doce botellas en vez de seis.
 *
 * Por eso cada venta sube dentro de una transacción que primero comprueba si el
 * documento ya existe y, si existe, no toca nada más. Ese chequeo es lo que
 * hace seguro reintentar.
 */

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/**
 * Firestore rechaza `undefined`. Los tipos del dominio tienen campos opcionales
 * (marca, contenidoMl, gradoAlcohol…) que llegan como undefined y tumbarían la
 * escritura entera con un error poco descriptivo.
 */
export function limpiar<T>(valor: T): T {
  if (Array.isArray(valor)) return valor.map(limpiar) as unknown as T
  if (valor !== null && typeof valor === 'object' && !(valor instanceof Date)) {
    const salida: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      if (v !== undefined) salida[k] = limpiar(v)
    }
    return salida as T
  }
  return valor
}

const DIAS_A_SINCRONIZAR = 90

function fsdb(): Firestore {
  return obtenerFirestore()
}

const REF_CONTADORES = () => doc(fsdb(), 'config', 'contadores')

// ---------------------------------------------------------------------------
// Subida
// ---------------------------------------------------------------------------

async function subirUnaVenta(venta: Venta): Promise<RespuestaSync> {
  const fs = fsdb()
  const refVenta = doc(fs, 'ventas', venta.id)

  try {
    const numero = await runTransaction(fs, async (tx) => {
      // En una transacción de Firestore todas las lecturas van antes que las
      // escrituras, sin excepción.
      const yaEsta = await tx.get(refVenta)
      if (yaEsta.exists()) {
        // Reintento de algo que ya subió. No se vuelve a descontar stock.
        return (yaEsta.data().numero as number | null) ?? 0
      }

      const contadores = await tx.get(REF_CONTADORES())
      const siguiente = ((contadores.data()?.ventas as number | undefined) ?? 0) + 1

      tx.set(REF_CONTADORES(), { ventas: siguiente }, { merge: true })
      tx.set(refVenta, limpiar({ ...venta, numero: siguiente, sincronizadaEn: Date.now() }))

      for (const m of movimientosDeVenta(venta)) {
        tx.set(doc(fs, 'movimientos', m.id), limpiar(m))
        tx.set(
          doc(fs, 'existencias', claveExistencia(m.productoId, m.ubicacionId)),
          {
            productoId: m.productoId,
            ubicacionId: m.ubicacionId,
            cantidadBase: increment(m.cantidadBase),
          },
          { merge: true },
        )
      }

      return siguiente
    })

    return { id: venta.id, numero, aceptada: true }
  } catch (e) {
    return {
      id: venta.id,
      numero: 0,
      aceptada: false,
      motivo: e instanceof Error ? e.message : 'error al subir',
    }
  }
}

async function subirUnAbono(abono: Abono): Promise<RespuestaSync> {
  const fs = fsdb()
  const ref = doc(fs, 'abonos', abono.id)
  try {
    await runTransaction(fs, async (tx) => {
      const yaEsta = await tx.get(ref)
      if (yaEsta.exists()) return
      tx.set(ref, limpiar(abono))
    })
    return { id: abono.id, numero: 0, aceptada: true }
  } catch (e) {
    return {
      id: abono.id,
      numero: 0,
      aceptada: false,
      motivo: e instanceof Error ? e.message : 'error al subir',
    }
  }
}

// ---------------------------------------------------------------------------
// Bajada
// ---------------------------------------------------------------------------

async function leer<T>(nombre: string): Promise<T[]> {
  const snap = await getDocs(collection(fsdb(), nombre))
  return snap.docs.map((d) => d.data() as T)
}

/**
 * Baja el catálogo y el movimiento reciente.
 *
 * Dos reglas que evitan pisar datos buenos:
 *
 *  - Si el catálogo remoto está vacío, NO se borra el local. Es lo que pasa la
 *    primera vez, antes de sembrar, y borrar ahí dejaría la caja sin productos.
 *  - Las existencias solo se bajan si la cola está vacía. Si hay ventas sin
 *    subir, el stock local ya las descontó y el remoto todavía no: bajarlo
 *    encima haría reaparecer mercancía que ya salió.
 */
async function bajarSnapshot(): Promise<void> {
  const [productos, presentaciones, codigos, categorias, listas, precios, ubicaciones, metodosPago, clientes] =
    await Promise.all([
      leer<Record<string, unknown>>('productos'),
      leer<Record<string, unknown>>('presentaciones'),
      leer<Record<string, unknown>>('codigos'),
      leer<Record<string, unknown>>('categorias'),
      leer<Record<string, unknown>>('listas'),
      leer<Record<string, unknown>>('precios'),
      leer<Record<string, unknown>>('ubicaciones'),
      leer<Record<string, unknown>>('metodosPago'),
      leer<Record<string, unknown>>('clientes'),
    ])

  // Primera vez contra un Firestore vacío: en vez de dejar la caja sin catálogo,
  // se sube el que ya hay en local. Solo actúa si arriba no hay ni un producto,
  // así que cuando estén cargados los 40 de verdad esto no vuelve a correr.
  if (productos.length === 0) {
    await sembrarRemotoSiVacio()
    return
  }

  {
    await db.transaction(
      'rw',
      [db.productos, db.presentaciones, db.codigos, db.categorias, db.listas, db.precios, db.ubicaciones, db.metodosPago],
      async () => {
        await db.productos.clear()
        await db.productos.bulkPut(productos as never[])
        await db.presentaciones.clear()
        await db.presentaciones.bulkPut(presentaciones as never[])
        await db.codigos.clear()
        await db.codigos.bulkPut(codigos as never[])
        await db.categorias.clear()
        await db.categorias.bulkPut(categorias as never[])
        await db.listas.clear()
        await db.listas.bulkPut(listas as never[])
        await db.precios.clear()
        await db.precios.bulkPut(precios as never[])
        if (ubicaciones.length > 0) {
          await db.ubicaciones.clear()
          await db.ubicaciones.bulkPut(ubicaciones as never[])
        }
        if (metodosPago.length > 0) {
          await db.metodosPago.clear()
          await db.metodosPago.bulkPut(metodosPago as never[])
        }
      },
    )
  }

  // Los clientes se mezclan en vez de reemplazarse: uno creado aquí mientras no
  // había señal no puede desaparecer porque el remoto todavía no lo tenga.
  if (clientes.length > 0) await db.clientes.bulkPut(clientes as never[])

  // Ventas y abonos de otros dispositivos
  const desde = new Date()
  desde.setDate(desde.getDate() - DIAS_A_SINCRONIZAR)
  const corte = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, '0')}-${String(desde.getDate()).padStart(2, '0')}`

  const [ventasSnap, abonosSnap] = await Promise.all([
    getDocs(query(collection(fsdb(), 'ventas'), where('dia', '>=', corte))),
    getDocs(query(collection(fsdb(), 'abonos'), where('dia', '>=', corte))),
  ])

  const ventas = ventasSnap.docs.map((d) => d.data() as Venta)
  const abonos = abonosSnap.docs.map((d) => d.data() as Abono)
  if (ventas.length > 0) await db.ventas.bulkPut(ventas)
  if (abonos.length > 0) await db.abonos.bulkPut(abonos)

  // Existencias: solo si no hay nada esperando subir
  if ((await db.outbox.count()) === 0) {
    const existencias = await leer<{ productoId: string; ubicacionId: string; cantidadBase: number }>('existencias')
    if (existencias.length > 0) {
      await db.existencias.clear()
      await db.existencias.bulkPut(
        existencias.map((e) => ({ ...e, id: claveExistencia(e.productoId, e.ubicacionId) })),
      )
    }
  }
}

// ---------------------------------------------------------------------------
// Siembra remota
// ---------------------------------------------------------------------------

/**
 * Sube el catálogo de ejemplo la primera vez, si Firestore está vacío.
 *
 * Es lo que permite abrir la URL recién desplegada y ver algo. Cuando estén
 * cargados los 40 productos de verdad, esta función deja de hacer nada, porque
 * solo actúa si no hay ni un producto arriba.
 */
export async function sembrarRemotoSiVacio(): Promise<'sembrado' | 'ya-habia'> {
  const fs = fsdb()
  const hay = await getDocs(query(collection(fs, 'productos')))
  if (!hay.empty) return 'ya-habia'

  const s = construirSemilla()
  const grupos: Array<[string, Array<Record<string, unknown>>, string]> = [
    ['categorias', s.categorias as never[], 'id'],
    ['ubicaciones', s.ubicaciones as never[], 'id'],
    ['productos', s.productos as never[], 'id'],
    ['presentaciones', s.presentaciones as never[], 'id'],
    ['codigos', s.codigos as never[], 'codigo'],
    ['listas', s.listas as never[], 'id'],
    ['precios', s.precios as never[], 'id'],
    ['metodosPago', s.metodosPago as never[], 'id'],
  ]

  // Los lotes de Firestore aguantan 500 escrituras; los precios pasan de eso.
  for (const [nombre, filas, clave] of grupos) {
    for (let i = 0; i < filas.length; i += 400) {
      const lote = writeBatch(fs)
      for (const fila of filas.slice(i, i + 400)) {
        lote.set(doc(fs, nombre, String(fila[clave])), limpiar(fila))
      }
      await lote.commit()
    }
  }

  const lote = writeBatch(fs)
  for (const e of s.existencias) {
    lote.set(doc(fs, 'existencias', claveExistencia(e.productoId, e.ubicacionId)), limpiar(e))
  }
  const semillaClientes = await db.clientes.toArray()
  for (const c of semillaClientes) lote.set(doc(fs, 'clientes', c.id), limpiar(c))
  lote.set(REF_CONTADORES(), { ventas: 0 }, { merge: true })
  await lote.commit()

  return 'sembrado'
}

/** Sube un cliente creado sin señal */
export async function subirCliente(clienteId: string): Promise<void> {
  const cliente = await db.clientes.get(clienteId)
  if (!cliente) return
  const fs = fsdb()
  await runTransaction(fs, async (tx) => {
    tx.set(doc(fs, 'clientes', cliente.id), limpiar(cliente), { merge: true })
  })
}

export async function hayCatalogoRemoto(): Promise<boolean> {
  const snap = await getDoc(doc(fsdb(), 'config', 'contadores'))
  return snap.exists()
}

// ---------------------------------------------------------------------------

export const transporteFirestore: Transporte = {
  async subirVentas(ventas) {
    const salida: RespuestaSync[] = []
    for (const v of ventas) salida.push(await subirUnaVenta(v))
    return salida
  },
  async subirAbonos(abonos) {
    const salida: RespuestaSync[] = []
    for (const a of abonos) salida.push(await subirUnAbono(a))
    return salida
  },
  bajarSnapshot,
}
