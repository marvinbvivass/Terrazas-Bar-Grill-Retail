import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  agregar,
  agregarPago,
  cambiarCantidad,
  cambiarUbicacion,
  carritoVacio,
  construirVenta,
  movimientosDeVenta,
  quitar,
  quitarPago,
  recalcular,
  totales,
  type Carrito,
} from '../domain/cart'
import type { Pago, Presentacion, Producto, UUID, Venta } from '../domain/types'
import {
  cargarSnapshot,
  claveExistencia,
  guardarTasa,
  pedirAlmacenamientoPersistente,
  pendientesDeSubir,
  registrarVenta,
  sembrarSiHaceFalta,
  siguienteFolio,
  type Snapshot,
} from '../data/db'
import { UBICACION_FRIO, UBICACION_VENTA_DEFECTO } from '../data/seed'

export interface EstadoPos {
  cargando: boolean
  snapshot: Snapshot | null
  carrito: Carrito
  enLinea: boolean
  pendientes: number
  ultimaVenta: Venta | null
  aviso: { texto: string; tono: 'ok' | 'error' } | null
}

export function usePos() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [carrito, setCarrito] = useState<Carrito>(carritoVacio())
  const [enLinea, setEnLinea] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  const [pendientes, setPendientes] = useState(0)
  const [ultimaVenta, setUltimaVenta] = useState<Venta | null>(null)
  const [aviso, setAviso] = useState<EstadoPos['aviso']>(null)

  // Arranque: sembrar si hace falta y cargar todo el catálogo a memoria
  useEffect(() => {
    let vivo = true
    void (async () => {
      await pedirAlmacenamientoPersistente()
      await sembrarSiHaceFalta()
      const s = await cargarSnapshot()
      if (!vivo) return
      setSnapshot(s)
      setPendientes(await pendientesDeSubir())
    })()
    return () => {
      vivo = false
    }
  }, [])

  // Estado de conexión. Es lo primero que mira el cajero cuando algo va raro.
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
    const t = setTimeout(() => setAviso(null), 2600)
    return () => clearTimeout(t)
  }, [aviso])

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

  /** Stock ya descontado por lo que hay en el carrito, que es lo que el cajero necesita ver */
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
        setAviso({ texto: `Código ${codigo} no está en el catálogo`, tono: 'error' })
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
      // Si el producto tiene stock en nevera y no en sala, se despacha frío
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

  // -------------------------------------------------------------------------
  // Pagos
  // -------------------------------------------------------------------------

  const anadirPago = useCallback((pago: Pago) => setCarrito((c) => agregarPago(c, pago)), [])
  const removerPago = useCallback((pagoId: UUID) => setCarrito((c) => quitarPago(c, pagoId)), [])

  const actualizarTasa = useCallback(async (tasa: number) => {
    await guardarTasa('VES', tasa)
    setSnapshot((s) => (s ? { ...s, tasas: { ...s.tasas, VES: tasa } } : s))
  }, [])

  // -------------------------------------------------------------------------
  // Cierre
  // -------------------------------------------------------------------------

  const cobrar = useCallback(async (): Promise<Venta | null> => {
    if (!snapshot || carrito.lineas.length === 0) return null

    const folio = await siguienteFolio()
    const venta = construirVenta(carrito, {
      turnoId: snapshot.turnoId,
      usuarioId: snapshot.usuarioId,
      folioProvisional: folio,
      tasas: snapshot.tasas,
      creadaOffline: !navigator.onLine,
    })

    const movimientos = movimientosDeVenta(venta)
    await registrarVenta(venta, movimientos)

    // Refleja el descuento de stock en la copia en memoria
    setSnapshot((s) => {
      if (!s) return s
      const existencias = new Map(s.existencias)
      for (const m of movimientos) {
        const k = claveExistencia(m.productoId, m.ubicacionId)
        existencias.set(k, (existencias.get(k) ?? 0) + m.cantidadBase)
      }
      return { ...s, existencias }
    })

    setPendientes(await pendientesDeSubir())
    setUltimaVenta(venta)
    setCarrito(carritoVacio())
    return venta
  }, [snapshot, carrito])

  const t = useMemo(() => totales(carrito), [carrito])

  return {
    snapshot,
    carrito,
    totales: t,
    enLinea,
    pendientes,
    ultimaVenta,
    aviso,
    setAviso,
    cargando: snapshot === null,
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
    cobrar,
    cerrarTicket: () => setUltimaVenta(null),
  }
}

export type Pos = ReturnType<typeof usePos>
