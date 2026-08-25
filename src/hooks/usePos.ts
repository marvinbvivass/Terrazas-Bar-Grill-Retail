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
import type { Abono, Cliente, DiaNegocio, Pago, Presentacion, Producto, UUID, Venta } from '../domain/types'
import {
  anularVenta,
  cargarMovimientoComercial,
  cargarSnapshot,
  claveExistencia,
  guardarCliente,
  guardarTasa,
  pedirAlmacenamientoPersistente,
  pendientesDeSubir,
  registrarAbono,
  registrarVenta,
  sembrarSiHaceFalta,
  siguienteFolio,
  type Snapshot,
} from '../data/db'
import { UBICACION_FRIO, UBICACION_VENTA_DEFECTO } from '../data/seed'

/**
 * Estado de la aplicación.
 *
 * Ojo con el cambio de modelo: esto ya no es una caja en vivo. El encargado
 * anota las ventas en un cuaderno durante el día y las transcribe al cerrar,
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

  useEffect(() => {
    let vivo = true
    void (async () => {
      await pedirAlmacenamientoPersistente()
      await sembrarSiHaceFalta()
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

  const actualizarTasa = useCallback(async (tasa: number) => {
    await guardarTasa('VES', tasa)
    setSnapshot((s) => (s ? { ...s, tasas: { ...s.tasas, VES: tasa } } : s))
  }, [])

  // -------------------------------------------------------------------------
  // Registrar una venta del cuaderno
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

  const registrar = useCallback(
    async (clienteId: UUID | null): Promise<Venta | null> => {
      if (!snapshot || carrito.lineas.length === 0) return null

      const folio = await siguienteFolio()
      const datos = {
        dia,
        // Sin hora real en el cuaderno, se ancla al mediodía del día de trabajo:
        // así ninguna venta se escapa al día anterior o al siguiente.
        fecha: inicioDe(dia) + 12 * 3600_000,
        usuarioId: snapshot.usuarioId,
        folioProvisional: folio,
        tasas: snapshot.tasas,
        creadaOffline: !navigator.onLine,
      }

      const venta = clienteId
        ? construirVentaCredito(carrito, datos, clienteId)
        : construirVentaContado(carrito, datos)

      const movimientos = aplicarSalidaDeStock(venta)
      await registrarVenta(venta, movimientos)

      setVentas((v) => [...v, venta])
      setPendientes(await pendientesDeSubir())
      setCarrito(carritoVacio())

      const nombre = clientes.find((c) => c.id === clienteId)?.nombre
      setAviso({
        texto: clienteId ? `Fiado a ${nombre ?? 'cliente'}` : 'Venta cargada',
        tono: 'ok',
      })
      return venta
    },
    [snapshot, carrito, dia, clientes, aplicarSalidaDeStock],
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
    },
    [snapshot, dia],
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
    cobrar,
    crearCliente,
    ventasAbiertasDe: (clienteId: UUID) => ventasAbiertas(clienteId, ventas, abonos, dia),
    saldoDe: (clienteId: UUID) => saldoDeCliente(clienteId, ventas, abonos),
  }
}

export type Pos = ReturnType<typeof usePos>
