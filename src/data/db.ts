import Dexie, { type EntityTable, type Table } from 'dexie'
import type {
  Abono,
  Categoria,
  Cliente,
  CodigoBarras,
  Existencia,
  ListaPrecio,
  MetodoPago,
  DiaNegocio,
  MovimientoInventario,
  Precio,
  Presentacion,
  Producto,
  TasaCambio,
  Ubicacion,
  UUID,
  Venta,
} from '../domain/types'
import { CLIENTES_SEMILLA, TASA_VES_INICIAL, construirSemilla } from './seed'

/**
 * Réplica local. Es de donde lee la caja SIEMPRE, haya o no señal.
 *
 * Con 40 productos el catálogo entero pesa unos pocos kilobytes, así que no
 * hace falta SQLite en el navegador ni una solución de replicación: se guarda
 * en IndexedDB, se carga completo a memoria al arrancar, y se vuelve a bajar
 * entero cada vez que vuelve la conexión.
 *
 * Lo único que viaja hacia arriba es la cola de ventas (`outbox`).
 */

export interface Config {
  clave: string
  valor: unknown
}

/** Un documento esperando subir: una venta o un cobro */
export type Pendiente =
  | { id: UUID; tipo: 'venta'; venta: Venta; intentos: number; ultimoError: string | null; creadaEn: number }
  | { id: UUID; tipo: 'abono'; abono: Abono; intentos: number; ultimoError: string | null; creadaEn: number }

/** @deprecated se mantiene el nombre viejo para no romper importaciones */
export type VentaPendiente = Pendiente

class LicoreriaDB extends Dexie {
  categorias!: EntityTable<Categoria, 'id'>
  ubicaciones!: EntityTable<Ubicacion, 'id'>
  productos!: EntityTable<Producto, 'id'>
  presentaciones!: EntityTable<Presentacion, 'id'>
  codigos!: EntityTable<CodigoBarras, 'codigo'>
  listas!: EntityTable<ListaPrecio, 'id'>
  precios!: EntityTable<Precio, 'id'>
  existencias!: EntityTable<Existencia & { id: string }, 'id'>
  metodosPago!: EntityTable<MetodoPago, 'id'>
  tasas!: EntityTable<TasaCambio & { id: string }, 'id'>
  movimientos!: EntityTable<MovimientoInventario, 'id'>
  ventas!: EntityTable<Venta, 'id'>
  clientes!: EntityTable<Cliente, 'id'>
  abonos!: EntityTable<Abono, 'id'>
  // Table y no EntityTable: el outbox guarda una unión discriminada y
  // el InsertType de EntityTable no la sabe estrechar.
  outbox!: Table<Pendiente, string>
  config!: EntityTable<Config, 'clave'>

  constructor() {
    super('licoreria')
    this.version(1).stores({
      categorias: 'id, orden',
      ubicaciones: 'id, tipo',
      productos: 'id, sku, categoriaId, activo',
      presentaciones: 'id, productoId',
      codigos: 'codigo, presentacionId',
      listas: 'id, prioridad',
      precios: 'id, presentacionId, listaId',
      existencias: 'id, productoId, ubicacionId',
      metodosPago: 'id',
      tasas: 'id, moneda',
      movimientos: 'id, productoId, documentoId, fecha',
      ventas: 'id, dia, clienteId, condicion, sincronizadaEn',
      clientes: 'id, nombre, activo',
      abonos: 'id, dia, clienteId',
      outbox: 'id, creadaEn',
      config: 'clave',
    })
  }
}

export const db = new LicoreriaDB()

export const claveExistencia = (productoId: UUID, ubicacionId: UUID) => `${productoId}::${ubicacionId}`

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

/**
 * Pide al navegador que no borre el almacenamiento cuando se quede sin espacio.
 *
 * Sin esto, el sistema operativo puede desalojar IndexedDB y llevarse por
 * delante las ventas que aún no se han subido. Es la razón principal por la que
 * la caja definitiva debería ser la aplicación de escritorio y no el navegador.
 */
export async function pedirAlmacenamientoPersistente(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/** Carga la semilla la primera vez. En producción esto lo reemplaza el snapshot del servidor. */
export async function sembrarSiHaceFalta(): Promise<void> {
  const yaHay = await db.productos.count()
  if (yaHay > 0) return

  const s = construirSemilla()
  await db.transaction(
    'rw',
    [db.categorias, db.ubicaciones, db.productos, db.presentaciones, db.codigos,
     db.listas, db.precios, db.existencias, db.metodosPago, db.tasas,
     db.clientes, db.config],
    async () => {
      await db.categorias.bulkPut(s.categorias)
      await db.ubicaciones.bulkPut(s.ubicaciones)
      await db.productos.bulkPut(s.productos)
      await db.presentaciones.bulkPut(s.presentaciones)
      await db.codigos.bulkPut(s.codigos)
      await db.listas.bulkPut(s.listas)
      await db.precios.bulkPut(s.precios)
      await db.existencias.bulkPut(
        s.existencias.map((e) => ({ ...e, id: claveExistencia(e.productoId, e.ubicacionId) })),
      )
      await db.metodosPago.bulkPut(s.metodosPago)
      await db.tasas.bulkPut([
        { id: 'VES', moneda: 'VES', tasa: TASA_VES_INICIAL, fecha: Date.now(), fuente: 'manual' },
      ])
      await db.clientes.bulkPut(CLIENTES_SEMILLA)
      await db.config.bulkPut([
        { clave: 'usuarioId', valor: 'usuario-demo' },
        { clave: 'usuarioNombre', valor: 'Encargado' },
        { clave: 'folioSecuencia', valor: 0 },
      ])
    },
  )
}

// ---------------------------------------------------------------------------
// Instantánea en memoria
// ---------------------------------------------------------------------------

export interface Snapshot {
  categorias: Categoria[]
  ubicaciones: Ubicacion[]
  productos: Producto[]
  presentaciones: Presentacion[]
  presentacionesPorId: Map<UUID, Presentacion>
  presentacionesPorProducto: Map<UUID, Presentacion[]>
  codigos: Map<string, CodigoBarras>
  listas: ListaPrecio[]
  precios: Precio[]
  existencias: Map<string, number>
  metodosPago: MetodoPago[]
  tasas: Record<string, number>
  usuarioId: UUID
  usuarioNombre: string
}

/** Carga todo el catálogo a memoria. Con 40 productos esto es instantáneo. */
export async function cargarSnapshot(): Promise<Snapshot> {
  const [categorias, ubicaciones, productos, presentaciones, codigos, listas, precios, existencias, metodosPago, tasas, config] =
    await Promise.all([
      db.categorias.toArray(),
      db.ubicaciones.toArray(),
      db.productos.toArray(),
      db.presentaciones.toArray(),
      db.codigos.toArray(),
      db.listas.toArray(),
      db.precios.toArray(),
      db.existencias.toArray(),
      db.metodosPago.toArray(),
      db.tasas.toArray(),
      db.config.toArray(),
    ])

  const presentacionesPorProducto = new Map<UUID, Presentacion[]>()
  for (const p of presentaciones) {
    const lista = presentacionesPorProducto.get(p.productoId) ?? []
    lista.push(p)
    presentacionesPorProducto.set(p.productoId, lista)
  }
  for (const lista of presentacionesPorProducto.values()) lista.sort((a, b) => a.factor - b.factor)

  const cfg = new Map(config.map((c) => [c.clave, c.valor]))

  return {
    categorias: categorias.sort((a, b) => a.orden - b.orden),
    ubicaciones,
    productos: productos.filter((p) => p.activo),
    presentaciones,
    presentacionesPorId: new Map(presentaciones.map((p) => [p.id, p])),
    presentacionesPorProducto,
    codigos: new Map(codigos.map((c) => [c.codigo, c])),
    listas,
    precios,
    existencias: new Map(existencias.map((e) => [e.id, e.cantidadBase])),
    metodosPago: metodosPago.filter((m) => m.activo),
    tasas: Object.fromEntries(tasas.map((t) => [t.moneda, t.tasa])),
    usuarioId: (cfg.get('usuarioId') as string) ?? 'usuario-demo',
    usuarioNombre: (cfg.get('usuarioNombre') as string) ?? 'Cajero',
  }
}

// ---------------------------------------------------------------------------
// Registro de venta
// ---------------------------------------------------------------------------

/** Folio provisional correlativo local: P-014. Se imprime mientras no haya número real. */
export async function siguienteFolio(): Promise<string> {
  const fila = await db.config.get('folioSecuencia')
  const n = ((fila?.valor as number) ?? 0) + 1
  await db.config.put({ clave: 'folioSecuencia', valor: n })
  return `P-${String(n).padStart(3, '0')}`
}

/**
 * Asienta la venta localmente y la deja en la cola de salida.
 *
 * Todo en una sola transacción: o queda la venta, sus movimientos, el descuento
 * de stock y la entrada en la cola, o no queda nada. Una venta cobrada que no
 * llegó a la cola es una venta que nadie va a volver a ver.
 */
export async function registrarVenta(
  venta: Venta,
  movimientos: MovimientoInventario[],
): Promise<void> {
  await db.transaction('rw', [db.ventas, db.movimientos, db.existencias, db.outbox], async () => {
    await db.ventas.put(venta)
    await db.movimientos.bulkPut(movimientos)

    for (const m of movimientos) {
      const id = claveExistencia(m.productoId, m.ubicacionId)
      const actual = await db.existencias.get(id)
      await db.existencias.put({
        id,
        productoId: m.productoId,
        ubicacionId: m.ubicacionId,
        cantidadBase: (actual?.cantidadBase ?? 0) + m.cantidadBase,
      })
    }

    await db.outbox.put({
      id: venta.id,
      tipo: 'venta',
      venta,
      intentos: 0,
      ultimoError: null,
      creadaEn: Date.now(),
    })
  })
}

/**
 * Registra un cobro a un cliente.
 *
 * No toca inventario: la mercancía salió el día de la venta a crédito. Aquí
 * solo entra dinero.
 */
export async function registrarAbono(abono: Abono): Promise<void> {
  await db.transaction('rw', [db.abonos, db.outbox], async () => {
    await db.abonos.put(abono)
    await db.outbox.put({
      id: abono.id,
      tipo: 'abono',
      abono,
      intentos: 0,
      ultimoError: null,
      creadaEn: Date.now(),
    })
  })
}

export async function guardarCliente(cliente: Cliente): Promise<void> {
  await db.clientes.put(cliente)
}

/** Ventas y cobros que necesita la vista de crédito y la de cierre */
export async function cargarMovimientoComercial(): Promise<{ ventas: Venta[]; abonos: Abono[]; clientes: Cliente[] }> {
  const [ventas, abonos, clientes] = await Promise.all([
    db.ventas.toArray(),
    db.abonos.toArray(),
    db.clientes.toArray(),
  ])
  return { ventas, abonos, clientes }
}

export async function ventasDelDia(dia: DiaNegocio): Promise<Venta[]> {
  return db.ventas.where('dia').equals(dia).toArray()
}

export async function anularVenta(ventaId: UUID): Promise<void> {
  await db.transaction('rw', [db.ventas, db.movimientos, db.existencias], async () => {
    const venta = await db.ventas.get(ventaId)
    if (!venta || venta.estado === 'anulada') return
    await db.ventas.put({ ...venta, estado: 'anulada' })

    // Devuelve el inventario: un asiento nuevo, nunca se borra el viejo
    const movs = await db.movimientos.where('documentoId').equals(ventaId).toArray()
    for (const m of movs) {
      const id = claveExistencia(m.productoId, m.ubicacionId)
      const actual = await db.existencias.get(id)
      await db.existencias.put({
        id,
        productoId: m.productoId,
        ubicacionId: m.ubicacionId,
        cantidadBase: (actual?.cantidadBase ?? 0) - m.cantidadBase,
      })
    }
  })
}

export async function pendientesDeSubir(): Promise<number> {
  return db.outbox.count()
}

export async function guardarTasa(moneda: string, tasa: number): Promise<void> {
  await db.tasas.put({ id: moneda, moneda: moneda as 'VES', tasa, fecha: Date.now(), fuente: 'manual' })
}

/** Solo para desarrollo: vacía la base y vuelve a sembrar. */
export async function reiniciar(): Promise<void> {
  await db.delete()
  await db.open()
  await sembrarSiHaceFalta()
}
