import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  agregar,
  agregarPago,
  cambiarCantidad,
  cambiarUbicacion,
  carritoVacio,
  construirVentaContado,
  construirVentaCredito,
  movimientosDeVenta,
  quitar,
  quitarPago,
  recalcular,
  totales,
  type Carrito,
} from '../domain/cart'
import { calcularCierre, type Cierre } from '../domain/cierre'
import { construirAbono, resumirClientes, saldoDeCliente, ventasAbiertas, type PlanAbono } from '../domain/credito'
import { hoy, inicioDe } from '../domain/dias'
import type { Abono, Cliente, DiaNegocio, MonedaCodigo, Pago, Presentacion, Producto, UUID, Venta } from '../domain/types'
import {
  anularVenta,
  cargarMovimientoComercial,
  desactivarProducto as desactivarProductoDb,
  guardarProducto as guardarProductoDb,
  cargarSnapshot,
  claveExistencia,
  guardarCliente,
  guardarTasa,
  pedirAlmacenamientoPersistente,
  pendientesDeSubir,
  registrarAbono,
  registrarVenta,
  prepararConfiguracion,
  siguienteFolio,
  type Snapshot,
} from '../data/db'
import { UBICACION_FRIO, UBICACION_VENTA_DEFECTO } from '../data/seed'
import { bajarSnapshot, configurarTransporte, empujarCola } from '../data/sync'

/** Cada cuánto se intenta sincronizar sola, si hay señal */
const INTERVALO_SYNC = 5 * 60_000

/**
 * Firestore se carga aparte y solo cuando toca sincronizar.
 *
 * Son unos 600 KB de SDK. Cargarlos en el arranque retrasa que se vea la
 * cuadrícula, y con la conexión del local eso se nota. La caja lee de la copia
 * local, así que puede funcionar entera antes de que este trozo termine de
 * bajar; lo único que espera es la subida.
 */
let transporteListo: Promise<void> | null = null
async function prepararTransporte(): Promise<void> {
  transporteListo ??= import('../data/firestore').then(({ transporteFirestore }) => {
    configurarTransporte(transporteFirestore)
  })
  return transporteListo
}

/**
 * Estado de la aplicación.
 *
 * Ojo con el cambio de modelo: esto ya no es una caja en vivo. El encargado
 * carga lo vendido al cerrar la jornada, no venta por venta en el momento,
 * así que TODO se registra contra un "día de trabajo" que el usuario elige, no
 * contra el reloj. Por eso `dia` es estado de primer nivel y no un detalle.
 */
export function usePos() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [dia, setDia] = useState<DiaNegocio>(hoy())
  const [carrito, setCarrito] = useState<Carrito>(carritoVacio())
  const [ventas, setVentas] = useState<Venta[]>([])
  const [abonos, setAbonos] = useState<Abono[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [enLinea, setEnLinea] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const [pendientes, setPendientes] = useState(0)
  const [aviso, setAviso] = useState<{ texto: string; tono: 'ok' | 'error' } | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [ultimaSync, setUltimaSync] = useState<number | null>(null)
  const [errorSync, setErrorSync] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      await pedirAlmacenamientoPersistente()
      await prepararConfiguracion()
      const [s, comercial, cola] = await Promise.all([
        cargarSnapshot(),
        cargarMovimientoComercial(),
        pendientesDeSubir(),
      ])
      if (!vivo) return
      setSnapshot(s)
      setVentas(comercial.ventas)
      setAbonos(comercial.abonos)
      setClientes(comercial.clientes)
      setPendientes(cola)
    })()
    return () => {
      vivo = false
    }
  }, [])

  useEffect(() => {
    const arriba = () => setEnLinea(true)
    const abajo = () => setEnLinea(false)
    window.addEventListener('online', arriba)
    window.addEventListener('offline', abajo)
    return () => {
      window.removeEventListener('online', arriba)
      window.removeEventListener('offline', abajo)
    }
  }, [])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 2800)
    return () => clearTimeout(t)
  }, [aviso])

  /**
   * Sube lo pendiente y baja lo que hayan cargado otros dispositivos.
   *
   * El orden importa: PRIMERO se sube y DESPUÉS se baja. Al revés, una bajada
   * podría pisar el stock local con el remoto antes de que las ventas de esta
   * caja lleguen arriba, y la mercancía ya vendida reaparecería en el anaquel.
   */
  const sincronizar = useCallback(async (silencioso = true) => {
    // En la puerta de desarrollo no hay a dónde sincronizar
    if (import.meta.env.DEV && sessionStorage.getItem('sesion-solo-local') === '1') return
    if (!navigator.onLine) {
      if (!silencioso) setAviso({ texto: 'No hay señal para sincronizar', tono: 'error' })
      return
    }
    setSincronizando(true)
    setErrorSync(null)
    try {
      await prepararTransporte()
      const empuje = await empujarCola()
      await bajarSnapshot()

      const [s2, comercial, cola] = await Promise.all([
        cargarSnapshot(),
        cargarMovimientoComercial(),
        pendientesDeSubir(),
      ])
      setSnapshot(s2)
      setVentas(comercial.ventas)
      setAbonos(comercial.abonos)
      setClientes(comercial.clientes)
      setPendientes(cola)
      setUltimaSync(Date.now())

      if (!silencioso) {
        setAviso({
          texto:
            empuje.aceptadas > 0
              ? `${empuje.aceptadas} documento${empuje.aceptadas > 1 ? 's' : ''} subido${empuje.aceptadas > 1 ? 's' : ''}`
              : 'Todo al día',
          tono: 'ok',
        })
      }
    } catch (e) {
      const texto = e instanceof Error ? e.message : 'falló la sincronización'
      setErrorSync(texto)
      if (!silencioso) setAviso({ texto, tono: 'error' })
    } finally {
      setSincronizando(false)
    }
  }, [])

  // Sincroniza al arrancar, cuando vuelve la señal, y cada tanto.
  useEffect(() => {
    if (!snapshot) return
    void sincronizar(true)
    const alVolver = () => void sincronizar(true)
    window.addEventListener('online', alVolver)
    const reloj = setInterval(() => void sincronizar(true), INTERVALO_SYNC)
    return () => {
      window.removeEventListener('online', alVolver)
      clearInterval(reloj)
    }
    // Solo al montar, cuando el catálogo local ya está cargado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot !== null])

  const catalogoPrecios = useMemo(
    () => ({ listas: snapshot?.listas ?? [], precios: snapshot?.precios ?? [] }),
    [snapshot],
  )

  const aplicar = useCallback(
    (siguiente: Carrito) => {
      if (!snapshot) return
      setCarrito(recalcular(siguiente, snapshot.presentacionesPorId, catalogoPrecios))
    },
    [snapshot, catalogoPrecios],
  )

  // -------------------------------------------------------------------------
  // Stock
  // -------------------------------------------------------------------------

  const stockDe = useCallback(
    (productoId: UUID, ubicacionId: UUID): number =>
      snapshot?.existencias.get(claveExistencia(productoId, ubicacionId)) ?? 0,
    [snapshot],
  )

  const stockDisponible = useCallback(
    (productoId: UUID, ubicacionId: UUID): number => {
      const enCarrito = carrito.lineas
        .filter((l) => l.productoId === productoId && l.ubicacionId === ubicacionId)
        .reduce((s, l) => s + l.cantidadBase, 0)
      return stockDe(productoId, ubicacionId) - enCarrito
    },
    [carrito, stockDe],
  )

  // -------------------------------------------------------------------------
  // Carrito
  // -------------------------------------------------------------------------

  const agregarProducto = useCallback(
    (producto: Producto, presentacion: Presentacion, ubicacionId: UUID, cantidad = 1) => {
      aplicar(agregar(carrito, { producto, presentacion, ubicacionId, cantidad }))
    },
    [aplicar, carrito],
  )

  const agregarPorCodigo = useCallback(
    (codigo: string): boolean => {
      if (!snapshot) return false
      const encontrado = snapshot.codigos.get(codigo.trim())
      if (!encontrado) {
        setAviso({ texto: `El código ${codigo} no está en el catálogo`, tono: 'error' })
        return false
      }
      const presentacion = snapshot.presentacionesPorId.get(encontrado.presentacionId)
      const producto = presentacion
        ? snapshot.productos.find((p) => p.id === presentacion.productoId)
        : undefined
      if (!presentacion || !producto) {
        setAviso({ texto: 'El código apunta a un producto que ya no existe', tono: 'error' })
        return false
      }
      const ubicacion =
        stockDisponible(producto.id, UBICACION_VENTA_DEFECTO) <= 0 &&
        stockDisponible(producto.id, UBICACION_FRIO) > 0
          ? UBICACION_FRIO
          : UBICACION_VENTA_DEFECTO
      agregarProducto(producto, presentacion, ubicacion, 1)
      setAviso({ texto: `${producto.nombreCorto} · ${presentacion.nombre}`, tono: 'ok' })
      return true
    },
    [snapshot, agregarProducto, stockDisponible],
  )

  const cambiarCantidadLinea = useCallback(
    (lineaId: UUID, cantidad: number) => aplicar(cambiarCantidad(carrito, lineaId, cantidad)),
    [aplicar, carrito],
  )
  const quitarLinea = useCallback(
    (lineaId: UUID) => aplicar(quitar(carrito, lineaId)),
    [aplicar, carrito],
  )
  const alternarFrio = useCallback(
    (lineaId: UUID) => {
      const linea = carrito.lineas.find((l) => l.id === lineaId)
      if (!linea) return
      const destino = linea.ubicacionId === UBICACION_FRIO ? UBICACION_VENTA_DEFECTO : UBICACION_FRIO
      aplicar(cambiarUbicacion(carrito, lineaId, destino))
    },
    [aplicar, carrito],
  )
  const vaciar = useCallback(() => setCarrito(carritoVacio()), [])

  const anadirPago = useCallback((pago: Pago) => setCarrito((c) => agregarPago(c, pago)), [])
  const removerPago = useCallback((pagoId: UUID) => setCarrito((c) => quitarPago(c, pagoId)), [])

  /**
   * La tasa se guarda por moneda. Antes solo existía la del bolívar cableada
   * aquí dentro, y el peso no se podía cambiar desde la aplicación.
   */
  const actualizarTasa = useCallback(async (moneda: MonedaCodigo, tasa: number) => {
    await guardarTasa(moneda, tasa)
    setSnapshot((s) => (s ? { ...s, tasas: { ...s.tasas, [moneda]: tasa } } : s))
  }, [])

  // -------------------------------------------------------------------------
  // Registrar la carga del día
  // -------------------------------------------------------------------------

  const aplicarSalidaDeStock = useCallback((venta: Venta) => {
    const movimientos = movimientosDeVenta(venta)
    setSnapshot((s) => {
      if (!s) return s
      const existencias = new Map(s.existencias)
      for (const m of movimientos) {
        const k = claveExistencia(m.productoId, m.ubicacionId)
        existencias.set(k, (existencias.get(k) ?? 0) + m.cantidadBase)
      }
      return { ...s, existencias }
    })
    return movimientos
  }, [])

  /**
   * Registra una carga del día.
   *
   * Recibe el carrito por parámetro en vez de leer el del estado porque la
   * pantalla de venta arma el suyo: se cargan cantidades por producto y se
   * cierra de una vez, no hay un carrito vivo que sobreviva entre pantallas.
   */
  const registrar = useCallback(
    async (aRegistrar: Carrito, clienteId: UUID | null): Promise<Venta | null> => {
      if (!snapshot || aRegistrar.lineas.length === 0) return null

      const folio = await siguienteFolio()
      const datos = {
        dia,
        // Sin hora real de la venta, se ancla al mediodía del día de trabajo:
        // así ninguna venta se escapa al día anterior o al siguiente.
        fecha: inicioDe(dia) + 12 * 3600_000,
        usuarioId: snapshot.usuarioId,
        folioProvisional: folio,
        tasas: snapshot.tasas,
        creadaOffline: !navigator.onLine,
      }

      const venta = clienteId
        ? construirVentaCredito(aRegistrar, datos, clienteId)
        : construirVentaContado(aRegistrar, datos)

      const movimientos = aplicarSalidaDeStock(venta)
      await registrarVenta(venta, movimientos)

      setVentas((v) => [...v, venta])
      setPendientes(await pendientesDeSubir())

      const nombre = clientes.find((c) => c.id === clienteId)?.nombre
      setAviso({
        texto: clienteId ? `Crédito cargado a ${nombre ?? 'cliente'}` : 'Venta del día cargada',
        tono: 'ok',
      })
      // Sin esperar: si hay señal sube ya, y si no, se queda en la cola.
      void sincronizar(true)
      return venta
    },
    [snapshot, dia, clientes, aplicarSalidaDeStock, sincronizar],
  )

  const anular = useCallback(async (ventaId: UUID) => {
    await anularVenta(ventaId)
    const comercial = await cargarMovimientoComercial()
    setVentas(comercial.ventas)
    const s = await cargarSnapshot()
    setSnapshot(s)
    setAviso({ texto: 'Venta anulada y mercancía devuelta al inventario', tono: 'ok' })
  }, [])

  // -------------------------------------------------------------------------
  // Crédito
  // -------------------------------------------------------------------------

  const cobrar = useCallback(
    async (clienteId: UUID, plan: PlanAbono, pagos: Pago[], nota?: string) => {
      if (!snapshot || plan.aplicado <= 0) return
      const abono = construirAbono(
        {
          clienteId,
          dia,
          fecha: inicioDe(dia) + 12 * 3600_000,
          monto: plan.aplicado,
          pagos,
          usuarioId: snapshot.usuarioId,
          nota: nota ?? null,
        },
        plan,
      )
      await registrarAbono(abono)
      setAbonos((a) => [...a, abono])
      setPendientes(await pendientesDeSubir())
      setAviso({ texto: `Cobro registrado en el día ${dia}`, tono: 'ok' })
      void sincronizar(true)
    },
    [snapshot, dia, sincronizar],
  )

  // -------------------------------------------------------------------------
  // Catálogo
  // -------------------------------------------------------------------------

  const recargarCatalogo = useCallback(async () => {
    const s2 = await cargarSnapshot()
    setSnapshot(s2)
    setPendientes(await pendientesDeSubir())
  }, [])

  const guardarProducto = useCallback(
    async (armado: Parameters<typeof guardarProductoDb>[0]) => {
      await guardarProductoDb(armado)
      await recargarCatalogo()
      setAviso({ texto: `${armado.producto.nombreCorto} guardado`, tono: 'ok' })
      void sincronizar(true)
    },
    [recargarCatalogo, sincronizar],
  )

  const desactivarProducto = useCallback(
    async (productoId: UUID) => {
      await desactivarProductoDb(productoId)
      await recargarCatalogo()
      setAviso({ texto: 'Producto dado de baja', tono: 'ok' })
      void sincronizar(true)
    },
    [recargarCatalogo, sincronizar],
  )

  const crearCliente = useCallback(async (datos: Omit<Cliente, 'id' | 'creadoEn' | 'activo'>) => {
    const cliente: Cliente = { ...datos, id: crypto.randomUUID(), creadoEn: Date.now(), activo: true }
    await guardarCliente(cliente)
    setClientes((c) => [...c, cliente])
    return cliente
  }, [])

  // -------------------------------------------------------------------------
  // Derivados
  // -------------------------------------------------------------------------

  const ventasDelDia = useMemo(
    () => ventas.filter((v) => v.dia === dia).sort((a, b) => b.registradaEn - a.registradaEn),
    [ventas, dia],
  )

  const resumenClientes = useMemo(
    () => resumirClientes(clientes, ventas, abonos),
    [clientes, ventas, abonos],
  )

  const carteraTotal = useMemo(
    () => resumenClientes.reduce((s, r) => s + r.saldo, 0),
    [resumenClientes],
  )

  const cierre: Cierre = useMemo(
    () =>
      calcularCierre({
        dia,
        ventas,
        abonos,
        metodosPago: snapshot?.metodosPago ?? [],
        carteraAlCierre: carteraTotal,
      }),
    [dia, ventas, abonos, snapshot, carteraTotal],
  )

  return {
    snapshot,
    cargando: snapshot === null,
    dia,
    setDia,
    carrito,
    totales: useMemo(() => totales(carrito), [carrito]),
    ventas,
    abonos,
    clientes,
    ventasDelDia,
    resumenClientes,
    carteraTotal,
    cierre,
    enLinea,
    pendientes,
    sincronizando,
    ultimaSync,
    errorSync,
    sincronizar,
    aviso,
    setAviso,
    stockDe,
    stockDisponible,
    agregarProducto,
    agregarPorCodigo,
    cambiarCantidadLinea,
    quitarLinea,
    alternarFrio,
    vaciar,
    anadirPago,
    removerPago,
    actualizarTasa,
    registrar,
    anular,
    guardarProducto,
    desactivarProducto,
    recargarCatalogo,
    cobrar,
    crearCliente,
    ventasAbiertasDe: (clienteId: UUID) => ventasAbiertas(clienteId, ventas, abonos, dia),
    saldoDe: (clienteId: UUID) => saldoDeCliente(clienteId, ventas, abonos),
  }
}

export type Pos = ReturnType<typeof usePos>
