import Dexie, { type EntityTable, type Table } from 'dexie'
import type {
  Abono,
  Categoria,
  Cliente,
  CodigoBarras,
  Existencia,
  ListaPrecio,
  MetodoPago,
  MonedaCodigo,
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
import type { CierreDia } from '../domain/cierreDia'
import type { Recepcion } from '../domain/recepcion'
import type { AjusteInventario } from '../domain/ajuste'
import type { MovimientoVacios } from '../domain/vacios'
import { movimientosDeAjuste } from '../domain/ajuste'
import { costoPromedioTrasEntrada, entradaPorProducto, movimientosDeRecepcion } from '../domain/recepcion'
import { idDeCierre } from '../domain/cierreDia'
import { METODOS_PAGO, TASA_COP_INICIAL, TASA_VES_INICIAL, UBICACION_VENTA_DEFECTO, configuracionInicial } from './seed'

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
  // Para productos y clientes solo viaja el id: lo que se sube se lee de la
  // base local en el momento del envío, así siempre sube la última versión.
  | { id: UUID; tipo: 'producto'; intentos: number; ultimoError: string | null; creadaEn: number }
  | { id: UUID; tipo: 'cliente'; intentos: number; ultimoError: string | null; creadaEn: number }
  // El acta del día viaja entera: sus montos y tasas son de ese día y no se
  // pueden releer de la base más tarde sin cambiar de valor.
  | { id: string; tipo: 'cierre'; cierre: CierreDia; intentos: number; ultimoError: string | null; creadaEn: number }
  | { id: UUID; tipo: 'recepcion'; recepcion: Recepcion; intentos: number; ultimoError: string | null; creadaEn: number }
  | { id: UUID; tipo: 'ajuste'; ajuste: AjusteInventario; intentos: number; ultimoError: string | null; creadaEn: number }
  | { id: UUID; tipo: 'vacios'; vacios: MovimientoVacios; intentos: number; ultimoError: string | null; creadaEn: number }

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
  cierres!: EntityTable<CierreDia, 'id'>
  recepciones!: EntityTable<Recepcion, 'id'>
  ajustes!: EntityTable<AjusteInventario, 'id'>
  vacios!: EntityTable<MovimientoVacios, 'id'>
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

    // Versión 2: el acta del día. Dexie necesita una versión nueva para crear
    // una tabla; las que ya existían no hay que repetirlas.
    this.version(2).stores({
      cierres: 'id, dia, cerradoEn',
    })

    // Versión 3: la entrada de mercancía.
    this.version(3).stores({
      recepciones: 'id, dia, fecha',
    })

    /*
     * Versión 4: inventario general.
     *
     * El stock vivía partido entre sala y nevera. Los teléfonos que ya tengan
     * datos traen existencias en las dos, y si no se juntaran, lo que estuviera
     * en la nevera desaparecería de la pantalla: seguiría en la base, sin
     * ninguna ubicación que lo muestre, y el encargado creería que le robaron.
     *
     * Se suman en `ubi-general` y se retira la lista de precio Frío con sus
     * filas: sin la nevera como ubicación, esa lista no se activaría nunca, y
     * dejarla ahí solo sirve para confundir a quien mire los precios mañana.
     */
    this.version(4)
      .stores({})
      .upgrade(async (tx) => {
        const existencias = await tx.table('existencias').toArray()
        const juntas = new Map<string, number>()
        for (const e of existencias) {
          juntas.set(e.productoId, (juntas.get(e.productoId) ?? 0) + (e.cantidadBase ?? 0))
        }

        await tx.table('existencias').clear()
        for (const [productoId, cantidadBase] of juntas) {
          await tx.table('existencias').put({
            id: `${productoId}::ubi-general`,
            productoId,
            ubicacionId: 'ubi-general',
            cantidadBase,
          })
        }

        await tx.table('ubicaciones').clear()
        await tx.table('ubicaciones').put({
          id: 'ubi-general',
          nombre: 'General',
          tipo: 'sala',
          refrigerado: false,
          permiteVenta: true,
        })

        const precios = await tx.table('precios').toArray()
        for (const precio of precios) {
          if (precio.listaId === 'lst-frio') await tx.table('precios').delete(precio.id)
        }
        await tx.table('listas').delete('lst-frio')
      })

    // Versión 5: mermas y conteos físicos.
    this.version(5).stores({
      ajustes: 'id, tipo, dia, fecha',
    })

    // Versión 6: control de envases retornables.
    this.version(6).stores({
      vacios: 'id, contraparte, clienteId, dia, fecha',
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

/**
 * Escribe la configuración de arranque la primera vez.
 *
 * Solo estructura: ubicaciones, categorías, listas de precio y métodos de pago.
 * Ni un producto, ni un cliente. El catálogo lo carga el encargado y los
 * clientes de fiado aparecen al fiar la primera venta.
 */
/**
 * Piezas que se agregaron DESPUÉS de que alguien ya tuviera la aplicación
 * instalada.
 *
 * `prepararConfiguracion` se planta si ya hay listas, así que una instalación
 * vieja nunca vería un método de pago nuevo ni la tasa de una moneda nueva: se
 * quedaría sin poder cobrar en pesos y sin explicación visible. Esto rellena
 * solo lo que falta y no toca lo que el usuario ya haya editado.
 */
async function completarPiezasNuevas(): Promise<void> {
  const metodos = await db.metodosPago.toArray()
  const conocidos = new Set(metodos.map((m) => m.id))
  const faltantes = METODOS_PAGO.filter((m) => !conocidos.has(m.id))
  if (faltantes.length > 0) await db.metodosPago.bulkPut(faltantes)

  const tasas = await db.tasas.toArray()
  const conTasa = new Set(tasas.map((t) => t.moneda))
  const nuevas: Array<TasaCambio & { id: string }> = []
  if (!conTasa.has('VES')) {
    nuevas.push({ id: 'VES', moneda: 'VES', tasa: TASA_VES_INICIAL, fecha: Date.now(), fuente: 'manual' })
  }
  if (!conTasa.has('COP')) {
    nuevas.push({ id: 'COP', moneda: 'COP', tasa: TASA_COP_INICIAL, fecha: Date.now(), fuente: 'manual' })
  }
  if (nuevas.length > 0) await db.tasas.bulkPut(nuevas)
}

export async function prepararConfiguracion(): Promise<void> {
  const yaHay = await db.listas.count()
  if (yaHay > 0) {
    await completarPiezasNuevas()
    return
  }

  const c = configuracionInicial()
  await db.transaction(
    'rw',
    [db.categorias, db.ubicaciones, db.listas, db.metodosPago, db.tasas, db.config],
    async () => {
      await db.categorias.bulkPut(c.categorias)
      await db.ubicaciones.bulkPut(c.ubicaciones)
      await db.listas.bulkPut(c.listas)
      await db.metodosPago.bulkPut(c.metodosPago)
      await db.tasas.bulkPut([
        { id: 'VES', moneda: 'VES', tasa: TASA_VES_INICIAL, fecha: Date.now(), fuente: 'manual' },
        { id: 'COP', moneda: 'COP', tasa: TASA_COP_INICIAL, fecha: Date.now(), fuente: 'manual' },
      ])
      await db.config.bulkPut([
        { clave: 'usuarioId', valor: 'usuario-demo' },
        { clave: 'usuarioNombre', valor: 'Encargado' },
        { clave: 'folioSecuencia', valor: 0 },
      ])
    },
  )
}

/** @deprecated nombre viejo, se mantiene mientras quedan llamadas */
export const sembrarSiHaceFalta = prepararConfiguracion

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
  await db.transaction('rw', [db.clientes, db.outbox], async () => {
    await db.clientes.put(cliente)
    await db.outbox.put({
      id: cliente.id,
      tipo: 'cliente',
      intentos: 0,
      ultimoError: null,
      creadaEn: Date.now(),
    })
  })
}

/**
 * Guarda un producto con todo lo suyo, en una sola transacción.
 *
 * Al editar se BORRAN antes las presentaciones, códigos y precios viejos: si no,
 * quitar un six-pack del formulario lo dejaría vivo en la base y seguiría
 * apareciendo en la caja.
 */
export async function guardarProducto(armado: {
  producto: Producto
  presentaciones: Presentacion[]
  codigos: CodigoBarras[]
  precios: Precio[]
  existencias: Existencia[]
}, opciones: { aplicarExistencias?: boolean } = {}): Promise<void> {
  /*
   * Las existencias solo se escriben al CREAR el producto.
   *
   * Al editar no se tocan, y esto arregla un fallo silencioso: el formulario
   * carga la existencia al abrirse, así que si alguien lo abría a las seis de
   * la tarde (100 botellas), se cerraba el día vendiendo 20, y después guardaba
   * el formulario, la existencia volvía a 100. Las botellas vendidas
   * reaparecían en el anaquel sin que nadie lo notara.
   *
   * Además, escribir la existencia a mano no dejaba asiento de kardex: no había
   * forma de saber si faltaban botellas porque se rompieron, se las llevó
   * alguien o nunca llegaron. Ahora el stock se mueve por recepciones y ventas,
   * que sí dejan rastro.
   */
  const aplicarExistencias = opciones.aplicarExistencias !== false
  await db.transaction(
    'rw',
    [db.productos, db.presentaciones, db.codigos, db.precios, db.existencias, db.outbox],
    async () => {
      const viejas = await db.presentaciones.where('productoId').equals(armado.producto.id).toArray()
      const idsViejos = viejas.map((p) => p.id)

      const codigosViejos = (await db.codigos.toArray()).filter((c) => idsViejos.includes(c.presentacionId))
      await db.codigos.bulkDelete(codigosViejos.map((c) => c.codigo))

      const preciosViejos = (await db.precios.toArray()).filter((p) => idsViejos.includes(p.presentacionId))
      await db.precios.bulkDelete(preciosViejos.map((p) => p.id))

      await db.presentaciones.bulkDelete(idsViejos)

      await db.productos.put(armado.producto)
      await db.presentaciones.bulkPut(armado.presentaciones)
      await db.codigos.bulkPut(armado.codigos)
      await db.precios.bulkPut(armado.precios)
      if (aplicarExistencias) {
        for (const e of armado.existencias) {
          await db.existencias.put({ ...e, id: claveExistencia(e.productoId, e.ubicacionId) })
        }
      }

      await db.outbox.put({
        id: armado.producto.id,
        tipo: 'producto',
        intentos: 0,
        ultimoError: null,
        creadaEn: Date.now(),
      })
    },
  )
}

/** Da de baja un producto sin borrarlo: puede estar en ventas viejas */
export async function desactivarProducto(productoId: UUID): Promise<void> {
  const p = await db.productos.get(productoId)
  if (!p) return
  await db.transaction('rw', [db.productos, db.outbox], async () => {
    await db.productos.put({ ...p, activo: false })
    await db.outbox.put({
      id: productoId,
      tipo: 'producto',
      intentos: 0,
      ultimoError: null,
      creadaEn: Date.now(),
    })
  })
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

/**
 * Guarda el acta del día y la pone en la cola de subida.
 *
 * El identificador es el día, así que volver a cerrar el mismo día sobrescribe
 * el acta anterior en vez de dejar dos contradictorias. Las ventas del día se
 * registran aparte, con `registrarVenta`, porque cada una tiene que mover
 * existencias por su cuenta.
 */
export async function guardarCierreDia(cierre: CierreDia): Promise<void> {
  await db.transaction('rw', [db.cierres, db.outbox], async () => {
    await db.cierres.put(cierre)
    await db.outbox.put({
      id: cierre.id,
      tipo: 'cierre',
      cierre,
      intentos: 0,
      ultimoError: null,
      creadaEn: Date.now(),
    })
  })
}

/**
 * Registra una entrada de mercancía.
 *
 * Todo junto o nada: el documento, sus asientos de kardex, las existencias
 * sumadas y el costo promedio recalculado. Si la mercancía entrara sin su
 * asiento, el anaquel tendría botellas que el kardex no puede explicar.
 *
 * El costo promedio se actualiza UNA vez por producto contra el total que
 * entró, no renglón a renglón: un mismo producto puede llegar en dos renglones
 * —una caja al anaquel y un six-pack a la nevera— y hacerlo por partes daría un
 * costo distinto según el orden en que se tecleó.
 */
export async function registrarRecepcion(recepcion: Recepcion): Promise<void> {
  const movimientos = movimientosDeRecepcion(recepcion)
  const porProducto = entradaPorProducto(recepcion)

  await db.transaction(
    'rw',
    [db.recepciones, db.movimientos, db.existencias, db.productos, db.outbox],
    async () => {
      await db.recepciones.put(recepcion)
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

      for (const [productoId, entrada] of porProducto) {
        const producto = await db.productos.get(productoId)
        if (!producto) continue

        // El stock ANTERIOR a esta entrada, sumando todas las ubicaciones: el
        // costo promedio es del producto, no de un anaquel.
        const todas = await db.existencias.where('productoId').equals(productoId).toArray()
        const despues = todas.reduce((x, e) => x + e.cantidadBase, 0)
        const antes = despues - entrada.cantidadBase

        await db.productos.put({
          ...producto,
          costoPromedio: costoPromedioTrasEntrada(
            antes,
            producto.costoPromedio,
            entrada.cantidadBase,
            entrada.costoPromedioEntrada,
          ),
        })

        // El producto cambió de costo: que suba también.
        await db.outbox.put({
          id: productoId,
          tipo: 'producto',
          intentos: 0,
          ultimoError: null,
          creadaEn: Date.now(),
        })
      }

      await db.outbox.put({
        id: recepcion.id,
        tipo: 'recepcion',
        recepcion,
        intentos: 0,
        ultimoError: null,
        creadaEn: Date.now(),
      })
    },
  )
}

/**
 * Registra una merma o un conteo fisico.
 *
 * El documento, sus asientos y las existencias, todo junto o nada. A diferencia
 * de la recepcion, esto NO toca el costo promedio: encontrar seis botellas de
 * menos no cambia lo que costaron las que quedan. Tocarlo aqui deformaria el
 * margen de todas las ventas siguientes por un problema de conteo.
 */
export async function registrarAjuste(ajuste: AjusteInventario): Promise<void> {
  const movimientos = movimientosDeAjuste(ajuste, UBICACION_VENTA_DEFECTO)

  await db.transaction('rw', [db.ajustes, db.movimientos, db.existencias, db.outbox], async () => {
    await db.ajustes.put(ajuste)
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
      id: ajuste.id,
      tipo: 'ajuste',
      ajuste,
      intentos: 0,
      ultimoError: null,
      creadaEn: Date.now(),
    })
  })
}

/**
 * Guarda un movimiento de envases.
 *
 * No toca existencias: un vacío no es mercancía vendible, es un envase que va y
 * viene. Mezclarlo con el stock haría que el sistema creyera tener cerveza
 * donde solo hay botellas sucias.
 */
export async function registrarVacios(movimiento: MovimientoVacios): Promise<void> {
  await db.transaction('rw', [db.vacios, db.outbox], async () => {
    await db.vacios.put(movimiento)
    await db.outbox.put({
      id: movimiento.id,
      tipo: 'vacios',
      vacios: movimiento,
      intentos: 0,
      ultimoError: null,
      creadaEn: Date.now(),
    })
  })
}

export async function cargarVacios(): Promise<MovimientoVacios[]> {
  return db.vacios.toArray()
}

export async function cargarAjustes(limite = 50): Promise<AjusteInventario[]> {
  return db.ajustes.orderBy('fecha').reverse().limit(limite).toArray()
}

export async function cargarRecepciones(limite = 50): Promise<Recepcion[]> {
  return db.recepciones.orderBy('fecha').reverse().limit(limite).toArray()
}

export async function cierreDelDia(dia: DiaNegocio): Promise<CierreDia | undefined> {
  return db.cierres.get(idDeCierre(dia))
}

export async function cargarCierres(): Promise<CierreDia[]> {
  return db.cierres.toArray()
}

/**
 * Reabre un día para poder corregirlo.
 *
 * Dos cosas, y la segunda es la que importa:
 *
 * 1. El acta NO se borra: se marca como reabierta y se vuelve a subir. Un
 *    cierre que desaparece es un cierre que nadie puede auditar.
 *
 * 2. Se ANULAN las ventas que ese cierre creó —la del día y las de crédito— y
 *    con ellas vuelve la mercancía al anaquel. Sin este paso, reabrir y cerrar
 *    otra vez registraba una segunda venta con las mismas botellas: el stock se
 *    descontaba dos veces, el día aparecía vendiendo el doble y el cliente
 *    quedaba debiendo dos veces lo mismo.
 */
export async function reabrirCierre(dia: DiaNegocio): Promise<void> {
  const actual = await cierreDelDia(dia)
  if (!actual) return

  const aAnular = [actual.ventaDelDiaId, ...actual.creditos.map((c) => c.ventaId)].filter(
    (id): id is UUID => typeof id === 'string' && id.length > 0,
  )
  for (const id of aAnular) await anularVenta(id)

  await guardarCierreDia({ ...actual, reabiertoEn: Date.now() })
}

export async function guardarTasa(moneda: MonedaCodigo, tasa: number): Promise<void> {
  await db.tasas.put({ id: moneda, moneda, tasa, fecha: Date.now(), fuente: 'manual' })
}

/** Solo para desarrollo: vacía la base y vuelve a sembrar. */
export async function reiniciar(): Promise<void> {
  await db.delete()
  await db.open()
  await sembrarSiHaceFalta()
}
