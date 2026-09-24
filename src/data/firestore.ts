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
import { configuracionInicial } from './seed'
import type { CierreDia } from '../domain/cierreDia'
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

  // Firestore recién creado: se sube la CONFIGURACIÓN (ubicaciones, categorías,
  // listas, métodos de pago) para que el motor de precios tenga con qué
  // trabajar. Productos no se inventa ninguno: los carga el encargado.
  await subirConfiguracionSiFalta()

  if (productos.length === 0) {
    // Catálogo vacío arriba. No se borra el local, que puede tener productos
    // recién creados esperando en la cola.
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
// Configuración y catálogo
// ---------------------------------------------------------------------------

/**
 * Sube la configuración de arranque si Firestore no la tiene.
 *
 * Son las piezas sin las que nada funciona: dónde está la mercancía, qué listas
 * de precio existen y con qué se cobra. No son datos del negocio, así que no
 * hay riesgo de "dato falso": son la estructura del mecanismo.
 */
export async function subirConfiguracionSiFalta(): Promise<boolean> {
  const fs = fsdb()
  const marca = await getDoc(doc(fs, 'config', 'sistema'))
  if (marca.exists()) return false

  const c = configuracionInicial()
  const lote = writeBatch(fs)
  for (const x of c.categorias) lote.set(doc(fs, 'categorias', x.id), limpiar(x))
  for (const x of c.ubicaciones) lote.set(doc(fs, 'ubicaciones', x.id), limpiar(x))
  for (const x of c.listas) lote.set(doc(fs, 'listas', x.id), limpiar(x))
  for (const x of c.metodosPago) lote.set(doc(fs, 'metodosPago', x.id), limpiar(x))
  lote.set(doc(fs, 'config', 'contadores'), { ventas: 0 }, { merge: true })
  lote.set(doc(fs, 'config', 'sistema'), { preparado: true, fecha: Date.now() })
  await lote.commit()
  return true
}

/**
 * Sube un producto completo: la ficha, sus presentaciones, sus códigos, sus
 * precios y su existencia inicial.
 *
 * La existencia se escribe con `set` y no con `increment`: es el conteo que
 * declaró el encargado, no un movimiento. Reenviarlo deja el mismo número.
 */
export async function subirProducto(productoId: string): Promise<void> {
  const fs = fsdb()
  const [producto, presentaciones, precios, existencias] = await Promise.all([
    db.productos.get(productoId),
    db.presentaciones.where('productoId').equals(productoId).toArray(),
    db.precios.toArray(),
    db.existencias.where('productoId').equals(productoId).toArray(),
  ])
  if (!producto) return

  const idsPres = new Set(presentaciones.map((p) => p.id))
  const codigos = (await db.codigos.toArray()).filter((c) => idsPres.has(c.presentacionId))
  const susPrecios = precios.filter((p) => idsPres.has(p.presentacionId))

  const lote = writeBatch(fs)
  lote.set(doc(fs, 'productos', producto.id), limpiar(producto))
  for (const p of presentaciones) lote.set(doc(fs, 'presentaciones', p.id), limpiar(p))
  for (const c of codigos) lote.set(doc(fs, 'codigos', c.codigo), limpiar(c))
  for (const p of susPrecios) lote.set(doc(fs, 'precios', p.id), limpiar(p))
  for (const e of existencias) {
    lote.set(
      doc(fs, 'existencias', e.id),
      { productoId: e.productoId, ubicacionId: e.ubicacionId, cantidadBase: e.cantidadBase },
      { merge: true },
    )
  }
  await lote.commit()
}

/** Sube un cliente creado sin señal */
export async function subirCliente(clienteId: string): Promise<void> {
  const cliente = await db.clientes.get(clienteId)
  if (!cliente) return
  await writeBatch(fsdb()).set(doc(fsdb(), 'clientes', cliente.id), limpiar(cliente), { merge: true }).commit()
}

export async function hayCatalogoRemoto(): Promise<boolean> {
  const snap = await getDoc(doc(fsdb(), 'config', 'contadores'))
  return snap.exists()
}

// ---------------------------------------------------------------------------

/**
 * Sube las actas de cierre.
 *
 * `merge: false` a propósito, al revés que el resto: el acta es el documento
 * completo de un día y tiene que quedar exactamente como se cerró. Con merge,
 * reabrir un día y cerrarlo con menos renglones de fiado dejaría arriba los
 * renglones viejos mezclados con los nuevos.
 */
export async function subirCierres(cierres: CierreDia[]): Promise<void> {
  if (cierres.length === 0) return
  const lote = writeBatch(fsdb())
  for (const c of cierres) {
    lote.set(doc(fsdb(), 'cierres', c.id), limpiar({ ...c, sincronizadoEn: Date.now() }))
  }
  await lote.commit()
}

export const transporteFirestore: Transporte = {
  async subirCierres(cierres) {
    await subirCierres(cierres)
  },
  async subirCatalogo(productoIds) {
    await subirConfiguracionSiFalta()
    for (const id of productoIds) await subirProducto(id)
  },
  async subirClientes(clienteIds) {
    for (const id of clienteIds) await subirCliente(id)
  },
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
