import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  agregar,
  agregarPago,
  cambiarCantidad,
  carritoVacio,
  construirPagosDelCierre,
  construirVentaContado,
  construirVentaCredito,
  construirVentaCreditoSinLineas,
  construirVentaDelDia,
  movimientosDeVenta,
  quitar,
  quitarPago,
  recalcular,
  totales,
  type Carrito,
} from '../domain/cart'
import { calcularCierre, type Cierre } from '../domain/cierre'
import {
  construirCierreDia,
  type CierreDia,
  type CreditoOtorgado,
} from '../domain/cierreDia'
import type { Recibido } from '../domain/cuadre'
import {
  construirDevolucion,
  type Devolucion,
  type EntradaLineaDevolucion,
  type MotivoDevolucion,
} from '../domain/devolucion'
import {
  deudoresDeVacios,
  saldoCliente,
  saldoCompania,
  totalDe,
  vaciosDeCliente,
  vaciosDeCompania,
  type MovimientoVacios,
} from '../domain/vacios'
import {
  construirConteo,
  construirMerma,
  type EntradaConteo,
  type EntradaMerma,
} from '../domain/ajuste'
import {
  construirRecepcion,
  lineaDeRecepcion,
  type EntradaLineaRecepcion,
  type Recepcion,
} from '../domain/recepcion'
import { construirAbono, resumirClientes, saldoDeCliente, ventasAbiertas, type PlanAbono } from '../domain/credito'
import { hoy, inicioDe } from '../domain/dias'
import { formato } from '../domain/money'
import { tasasVigentes, type TasaDia } from '../domain/tasas'
import type { Abono, Cliente, DiaNegocio, MonedaCodigo, Pago, Presentacion, Producto, UUID, Venta } from '../domain/types'
import {
  anularVenta,
  cargarMovimientoComercial,
  desactivarProducto as desactivarProductoDb,
  guardarProducto as guardarProductoDb,
  guardarOrdenProductos,
  actualizarPreciosEnLote,
  cargarSnapshot,
  cierreDelDia,
  cargarCierres,
  cargarDevoluciones,
  cargarRecepciones,
  guardarMonedaPreferida,
  monedaPreferida,
  cargarTasasDia,
  cargarVacios,
  guardarTasaDia,
  registrarAjuste,
  registrarDevolucion,
  registrarRecepcion,
  registrarVacios,
  claveExistencia,
  guardarCierreDia,
  reabrirCierre,
  guardarCliente,
  pedirAlmacenamientoPersistente,
  pendientesDeSubir,
  registrarAbono,
  registrarVenta,
  prepararConfiguracion,
  siguienteFolio,
  type Snapshot,
} from '../data/db'
import { UBICACION_VENTA_DEFECTO } from '../data/seed'
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
  /** Todas las actas guardadas, para que Historial pueda mirar cualquier día */
  const [cierres, setCierres] = useState<CierreDia[]>([])
  /** El acta del día que se está mirando, si ya se cerró */
  const [cierreDia, setCierreDia] = useState<CierreDia | null>(null)
  /** En qué moneda se mira y se teclea todo. Preferencia del local. */
  const [moneda, setMonedaEstado] = useState<MonedaCodigo>('COP')
  /** Todas las tasas cargadas, de todos los días */
  const [tasasDia, setTasasDia] = useState<TasaDia[]>([])
  /** Entradas de mercancía, para el historial de Recargar */
  const [recepciones, setRecepciones] = useState<Recepcion[]>([])
  /** Devoluciones de cliente, para el cierre y para los saldos */
  const [devoluciones, setDevoluciones] = useState<Devolucion[]>([])
  /** Todos los movimientos de envases retornables */
  const [vacios, setVacios] = useState<MovimientoVacios[]>([])

  /**
   * Un día cerrado no se toca.
   *
   * El acta ya marcaba el día como cerrado en la pantalla de cierre, pero nada
   * impedía moverse a esa fecha y cargar un cobro, una merma o una entrada: si
   * el dueño revisó el lunes y después alguien le agrega algo, el número que
   * vio deja de ser el número y no queda rastro de que cambió.
   *
   * Se bloquea aquí, en el hook, y no en cada pantalla: esconder botones
   * protege lo que se ve, y lo que hay que proteger es el dato.
   */
  const diaCerrado = cierreDia !== null

  /**
   * Volver al día de hoy.
   *
   * La aplicación trabaja siempre en hoy; solo se sale de ahí para cargar un
   * día atrasado a propósito, y de ese estado hay que poder salir de un toque.
   */
  const volverAHoy = useCallback(() => setDia(hoy()), [])

  const fijarMoneda = useCallback(async (m: MonedaCodigo) => {
    setMonedaEstado(m)
    await guardarMonedaPreferida(m)
  }, [])

  const bloqueadoPorCierre = useCallback(() => {
    if (!cierreDia) return false
    setAviso({
      texto: 'Ese día ya está cerrado. Reábrelo desde Cierre para poder cambiarlo.',
      tono: 'error',
    })
    return true
  }, [cierreDia])

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
      const [s, comercial, envases, devs, cambios, actas, entradas, divisa, cola] = await Promise.all([
        cargarSnapshot(),
        cargarMovimientoComercial(),
        cargarVacios(),
        cargarDevoluciones(),
        cargarTasasDia(),
        cargarCierres(),
        cargarRecepciones(),
        monedaPreferida(),
        pendientesDeSubir(),
      ])
      if (!vivo) return
      setSnapshot(s)
      setVentas(comercial.ventas)
      setAbonos(comercial.abonos)
      setClientes(comercial.clientes)
      setVacios(envases)
      setDevoluciones(devs)
      setTasasDia(cambios)
      setCierres(actas)
      setRecepciones(entradas)
      setMonedaEstado(divisa)
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

      const [s2, comercial, envases, devs, cambios, actas, entradas, cola] = await Promise.all([
        cargarSnapshot(),
        cargarMovimientoComercial(),
        cargarVacios(),
        cargarDevoluciones(),
        cargarTasasDia(),
        cargarCierres(),
        cargarRecepciones(),
        pendientesDeSubir(),
      ])
      setSnapshot(s2)
      setVentas(comercial.ventas)
      setAbonos(comercial.abonos)
      setClientes(comercial.clientes)
      setVacios(envases)
      setDevoluciones(devs)
      setTasasDia(cambios)
      setCierres(actas)
      setRecepciones(entradas)
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
      agregarProducto(producto, presentacion, UBICACION_VENTA_DEFECTO, 1)
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
  const vaciar = useCallback(() => setCarrito(carritoVacio()), [])

  const anadirPago = useCallback((pago: Pago) => setCarrito((c) => agregarPago(c, pago)), [])
  const removerPago = useCallback((pagoId: UUID) => setCarrito((c) => quitarPago(c, pagoId)), [])

  /**
   * La tasa se guarda por moneda. Antes solo existía la del bolívar cableada
   * aquí dentro, y el peso no se podía cambiar desde la aplicación.
   */
  /**
   * Carga la tasa de una moneda PARA EL DÍA QUE SE ESTÁ MIRANDO.
   *
   * No para hoy: si el encargado se mueve al lunes y teclea la tasa, es la del
   * lunes. Guardarla siempre en hoy haría que cargar un día atrasado lo cobrara
   * con el cambio de esta mañana.
   */
  const actualizarTasa = useCallback(
    async (moneda: MonedaCodigo, tasa: number, diaDestino?: DiaNegocio) => {
      const objetivo = diaDestino ?? dia
      await guardarTasaDia(objetivo, moneda, tasa, snapshot?.usuarioId ?? 'local')
      const todas = await cargarTasasDia()
      setTasasDia(todas)
      setPendientes(await pendientesDeSubir())
      void sincronizar(true)
    },
    [dia, snapshot, sincronizar],
  )

  /*
   * Las tasas del snapshot son SIEMPRE las del día que se está mirando.
   *
   * Se calculan aquí y se meten dentro del snapshot en vez de exponerlas
   * aparte: el carrito, el cierre y la barra superior ya leen `snapshot.tasas`,
   * y tener dos fuentes de tasas en la aplicación es la forma segura de que un
   * día alguna pantalla convierta con la que no es.
   */
  const tasasVigentesDelDia = useMemo(
    () => (tasasDia.length > 0 ? tasasVigentes(dia, tasasDia) : null),
    [dia, tasasDia],
  )

  useEffect(() => {
    if (!tasasVigentesDelDia) return
    setSnapshot((s) => {
      if (!s) return s
      const iguales =
        Object.keys(tasasVigentesDelDia).length === Object.keys(s.tasas).length &&
        Object.entries(tasasVigentesDelDia).every(([k, v]) => s.tasas[k] === v)
      return iguales ? s : { ...s, tasas: tasasVigentesDelDia }
    })
  }, [tasasVigentesDelDia])

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

  /**
   * Cerrar el día: la operación entera, de una vez.
   *
   * Hace cuatro cosas que tienen que pasar juntas o no pasar:
   *
   *   1. Una venta por cada cliente al que se le fio, sin líneas. Son el saldo
   *      que aparece en CXC.
   *   2. UNA venta con todo lo que salió del inventario, cuyo total es solo lo
   *      que se cobró (ver `construirVentaDelDia`).
   *   3. El acta del día con los montos, las tasas y la diferencia.
   *   4. Todo a la cola de subida.
   *
   * Los créditos van PRIMERO porque la venta del día necesita su id para
   * anotarlos en el acta. Si algo falla a mitad, lo ya escrito se queda: son
   * documentos válidos por sí solos y la cola los subirá igual. Perder la
   * mitad de un cierre es peor que tener un cierre incompleto que se ve.
   */
  const cerrarDia = useCallback(
    async (entrada: {
      carrito: Carrito
      recibido: Recibido
      creditos: Array<{ clienteId: UUID; monto: number }>
      nota?: string | null
    }): Promise<CierreDia | null> => {
      // La pantalla ya enseña el acta en vez del formulario cuando el día está
      // cerrado, pero era la única escritura sin guardia. Si llegara a pasar,
      // crearía un SEGUNDO juego de ventas y el acta apuntaría solo al nuevo:
      // las primeras quedarían contando sin que nada las referencie.
      if (!snapshot || bloqueadoPorCierre()) return null

      const fecha = inicioDe(dia) + 12 * 3600_000
      const datosBase = {
        dia,
        fecha,
        usuarioId: snapshot.usuarioId,
        tasas: snapshot.tasas,
        creadaOffline: !navigator.onLine,
      }

      // 1 · Las deudas
      const otorgados: CreditoOtorgado[] = []
      for (const c of entrada.creditos) {
        if (c.monto <= 0) continue
        const cliente = clientes.find((x) => x.id === c.clienteId)
        if (!cliente) continue
        const folio = await siguienteFolio()
        const venta = construirVentaCreditoSinLineas(
          { ...datosBase, folioProvisional: folio },
          c.clienteId,
          c.monto,
        )
        await registrarVenta(venta, [])
        setVentas((v) => [...v, venta])
        otorgados.push({
          clienteId: c.clienteId,
          clienteNombre: cliente.nombre,
          monto: c.monto,
          ventaId: venta.id,
        })
      }

      const totalCredito = otorgados.reduce((x, c) => x + c.monto, 0)

      // 2 · Lo que salió del inventario
      const t = totales(entrada.carrito)
      let ventaDelDia: Venta | null = null
      if (entrada.carrito.lineas.length > 0) {
        const folio = await siguienteFolio()
        const pagos = construirPagosDelCierre(
          entrada.recibido,
          snapshot.tasas,
          snapshot.metodosPago,
        )
        ventaDelDia = construirVentaDelDia(
          { ...entrada.carrito, pagos },
          { ...datosBase, folioProvisional: folio },
          totalCredito,
        )
        const movimientos = aplicarSalidaDeStock(ventaDelDia)
        await registrarVenta(ventaDelDia, movimientos)
        const registrada = ventaDelDia
        setVentas((v) => [...v, registrada])
      }

      // 3 · El acta
      const acta = construirCierreDia({
        dia,
        usuarioId: snapshot.usuarioId,
        totalVendido: t.total,
        unidades: t.unidades,
        costo: t.costoTotal,
        recibido: entrada.recibido,
        creditos: otorgados,
        tasas: snapshot.tasas,
        ventaDelDiaId: ventaDelDia?.id ?? null,
        nota: entrada.nota ?? null,
      })
      await guardarCierreDia(acta)
      setCierreDia(acta)
      setCierres(await cargarCierres())

      setPendientes(await pendientesDeSubir())
      setAviso({
        texto: acta.cuadra ? 'Día cerrado y cuadrado' : 'Día cerrado con diferencia',
        tono: acta.cuadra ? 'ok' : 'error',
      })
      void sincronizar(true)
      return acta
    },
    [snapshot, dia, clientes, aplicarSalidaDeStock, sincronizar, bloqueadoPorCierre],
  )

  /*
   * El acta se relee al cambiar de día. Sin esto, moverse de hoy a ayer
   * seguiría mostrando el cierre de hoy y el encargado creería que ayer quedó
   * cerrado cuando no lo está.
   */
  useEffect(() => {
    let vivo = true
    void (async () => {
      const acta = await cierreDelDia(dia)
      // Un acta reabierta cuenta como día abierto: se conserva para auditar,
      // pero la pantalla tiene que dejar corregir.
      if (vivo) setCierreDia(acta && !acta.reabiertoEn ? acta : null)
    })()
    return () => {
      vivo = false
    }
  }, [dia])

  /**
   * Registrar una merma: mercancia que se fue sin venderse.
   *
   * Baja el stock y deja el motivo. No toca el costo promedio: que se rompan
   * seis botellas no cambia lo que costaron las que quedan.
   */
  const registrarMerma = useCallback(
    async (entradas: EntradaMerma[], nota?: string | null) => {
      if (!snapshot || bloqueadoPorCierre()) return null
      const ajuste = construirMerma(entradas, {
        dia,
        fecha: inicioDe(dia) + 12 * 3600_000,
        usuarioId: snapshot.usuarioId,
        nota: nota ?? null,
        creadoOffline: !navigator.onLine,
      })
      if (!ajuste) return null

      await registrarAjuste(ajuste)
      setSnapshot(await cargarSnapshot())
      setPendientes(await pendientesDeSubir())
      setAviso({ texto: `Merma registrada: ${formato(ajuste.costoTotal, 'USD')}`, tono: 'ok' })
      void sincronizar(true)
      return ajuste
    },
    [snapshot, dia, sincronizar, bloqueadoPorCierre],
  )

  /**
   * Asentar un conteo fisico.
   *
   * Lo que se guarda es la DIFERENCIA contra lo que decia el sistema, no lo
   * contado: asi el kardex explica el salto en vez de mostrar un numero nuevo
   * salido de la nada. Los productos que no se cuenten no se tocan, para poder
   * contar el anaquel por partes sin poner el resto en cero.
   */
  const registrarConteo = useCallback(
    async (entradas: EntradaConteo[], nota?: string | null) => {
      if (!snapshot || bloqueadoPorCierre()) return null
      const ajuste = construirConteo(entradas, {
        dia,
        fecha: inicioDe(dia) + 12 * 3600_000,
        usuarioId: snapshot.usuarioId,
        nota: nota ?? null,
        creadoOffline: !navigator.onLine,
      })
      if (!ajuste) {
        setAviso({ texto: 'El conteo cuadra: no hay nada que ajustar', tono: 'ok' })
        return null
      }

      await registrarAjuste(ajuste)
      setSnapshot(await cargarSnapshot())
      setPendientes(await pendientesDeSubir())
      setAviso({
        texto: `Conteo asentado: ${ajuste.lineas.length} ${ajuste.lineas.length === 1 ? 'producto' : 'productos'} ajustados`,
        tono: 'ok',
      })
      void sincronizar(true)
      return ajuste
    },
    [snapshot, dia, sincronizar, bloqueadoPorCierre],
  )

  /**
   * Movimiento de envases con la compañia o con un cliente.
   *
   * Devuelve null cuando no habia nada que mover: el que llega con seis vacios
   * y se lleva seis llenas no genera documento, porque su deuda no cambio.
   */
  const registrarVaciosMov = useCallback(
    async (movimiento: MovimientoVacios | null, aviso: string) => {
      if (!movimiento) return null
      await registrarVacios(movimiento)
      setVacios((v) => [...v, movimiento])
      setPendientes(await pendientesDeSubir())
      setAviso({ texto: aviso, tono: 'ok' })
      void sincronizar(true)
      return movimiento
    },
    [sincronizar],
  )

  const moverVaciosCompania = useCallback(
    async (
      entradas: Array<{ productoId: UUID; dejados: number; devueltos: number }>,
      opciones?: { documentoId?: UUID | null; nota?: string | null },
    ) => {
      if (!snapshot || bloqueadoPorCierre()) return null
      const mov = vaciosDeCompania(entradas, {
        dia,
        fecha: inicioDe(dia) + 12 * 3600_000,
        usuarioId: snapshot.usuarioId,
        documentoTipo: opciones?.documentoId ? 'recepcion' : 'manual',
        documentoId: opciones?.documentoId ?? null,
        nota: opciones?.nota ?? null,
        creadoOffline: !navigator.onLine,
      })
      return registrarVaciosMov(mov, 'Vacíos de la compañía actualizados')
    },
    [snapshot, dia, registrarVaciosMov, bloqueadoPorCierre],
  )

  const moverVaciosCliente = useCallback(
    async (
      clienteId: UUID,
      entradas: Array<{ productoId: UUID; seLlevo: number; trajo: number }>,
      opciones?: { documentoTipo?: 'cierre' | 'manual'; documentoId?: UUID | null; nota?: string | null },
    ) => {
      if (!snapshot || bloqueadoPorCierre()) return null
      const mov = vaciosDeCliente(clienteId, entradas, {
        dia,
        fecha: inicioDe(dia) + 12 * 3600_000,
        usuarioId: snapshot.usuarioId,
        documentoTipo: opciones?.documentoTipo ?? 'manual',
        documentoId: opciones?.documentoId ?? null,
        nota: opciones?.nota ?? null,
        creadoOffline: !navigator.onLine,
      })
      const nombre = clientes.find((c) => c.id === clienteId)?.nombre ?? 'cliente'
      return registrarVaciosMov(mov, `Vacíos de ${nombre} actualizados`)
    },
    [snapshot, dia, clientes, registrarVaciosMov, bloqueadoPorCierre],
  )

  /** Envases que el local le debe a la compañia, por producto */
  const vaciosCompania = useMemo(() => saldoCompania(vacios), [vacios])
  /** Clientes que deben envases, de mayor a menor */
  const vaciosDeudores = useMemo(() => deudoresDeVacios(vacios), [vacios])
  /** Todo lo pendiente de envases, para la insignia del menú */
  const vaciosPendientes = useMemo(
    () =>
      Math.max(0, totalDe(vaciosCompania)) +
      vaciosDeudores.reduce((x, d) => x + Math.max(0, d.total), 0),
    [vaciosCompania, vaciosDeudores],
  )

  const vaciosDe = useCallback(
    (clienteId: UUID) => totalDe(saldoCliente(clienteId, vacios)),
    [vacios],
  )

  /**
   * Devolución parcial de un cliente.
   *
   * En efectivo sale plata de la gaveta; a cuenta le baja la deuda y la caja no
   * se entera. Si la mercancía vuelve al anaquel, entra con su asiento.
   */
  const devolver = useCallback(
    async (entrada: {
      lineas: EntradaLineaDevolucion[]
      clienteId?: UUID | null
      modo: 'efectivo' | 'cuenta'
      motivo: MotivoDevolucion
      vuelveAlStock: boolean
      nota?: string | null
    }): Promise<Devolucion | null> => {
      if (!snapshot || bloqueadoPorCierre()) return null

      const devolucion = construirDevolucion(entrada.lineas, {
        dia,
        fecha: inicioDe(dia) + 12 * 3600_000,
        usuarioId: snapshot.usuarioId,
        clienteId: entrada.clienteId ?? null,
        modo: entrada.modo,
        motivo: entrada.motivo,
        vuelveAlStock: entrada.vuelveAlStock,
        nota: entrada.nota ?? null,
        creadaOffline: !navigator.onLine,
      })
      if (!devolucion) {
        setAviso({ texto: 'A cuenta hace falta decir de qué cliente', tono: 'error' })
        return null
      }

      await registrarDevolucion(devolucion)
      setDevoluciones((d) => [...d, devolucion])
      if (devolucion.vuelveAlStock) setSnapshot(await cargarSnapshot())
      setPendientes(await pendientesDeSubir())
      setAviso({
        texto:
          devolucion.modo === 'efectivo'
            ? `Devueltos ${formato(devolucion.total, 'USD')} de la gaveta`
            : `Descontados ${formato(devolucion.total, 'USD')} de la cuenta`,
        tono: 'ok',
      })
      void sincronizar(true)
      return devolucion
    },
    [snapshot, dia, sincronizar, bloqueadoPorCierre],
  )

  const reabrirDia = useCallback(async () => {
    await reabrirCierre(dia)
    // Reabrir anula las ventas de ese cierre y devuelve la mercancía, así que
    // hay que releer: si no, la pantalla seguiría mostrando el stock de
    // después de vender y el encargado cargaría el día sobre datos viejos.
    const comercial = await cargarMovimientoComercial()
    setVentas(comercial.ventas)
    setAbonos(comercial.abonos)
    setSnapshot(await cargarSnapshot())
    setCierreDia(null)
    setCierres(await cargarCierres())
    setPendientes(await pendientesDeSubir())
    setAviso({ texto: 'Día reabierto: puedes corregir y volver a cerrar', tono: 'ok' })
    void sincronizar(true)
  }, [dia, sincronizar])

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
      if (!snapshot || plan.aplicado <= 0 || bloqueadoPorCierre()) return
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
    [snapshot, dia, sincronizar, bloqueadoPorCierre],
  )

  // -------------------------------------------------------------------------
  // Catálogo
  // -------------------------------------------------------------------------

  const recargarCatalogo = useCallback(async () => {
    const s2 = await cargarSnapshot()
    setSnapshot(s2)
    setPendientes(await pendientesDeSubir())
  }, [])

  /**
   * Recibir mercancía del proveedor.
   *
   * Sube el stock, deja el asiento de kardex y recalcula el costo promedio, las
   * tres cosas en una transacción. Después se relee el catálogo porque el costo
   * promedio cambió y el margen que se ve en pantalla sale de ahí.
   */
  const recibirMercancia = useCallback(
    async (entrada: {
      lineas: EntradaLineaRecepcion[]
      proveedor?: string | null
      documento?: string | null
      nota?: string | null
    }): Promise<Recepcion | null> => {
      if (!snapshot || bloqueadoPorCierre()) return null
      const utiles = entrada.lineas.filter((l) => l.cantidad > 0)
      if (utiles.length === 0) return null

      const recepcion = construirRecepcion(utiles.map(lineaDeRecepcion), {
        dia,
        fecha: inicioDe(dia) + 12 * 3600_000,
        usuarioId: snapshot.usuarioId,
        proveedor: entrada.proveedor ?? null,
        documento: entrada.documento ?? null,
        nota: entrada.nota ?? null,
        creadaOffline: !navigator.onLine,
      })

      await registrarRecepcion(recepcion)
      setRecepciones(await cargarRecepciones())
      await recargarCatalogo()
      setPendientes(await pendientesDeSubir())
      setAviso({
        texto: `Entraron ${recepcion.unidades} unidades por ${formato(recepcion.total, 'USD')}`,
        tono: 'ok',
      })
      void sincronizar(true)
      return recepcion
    },
    [snapshot, dia, recargarCatalogo, sincronizar, bloqueadoPorCierre],
  )

  const guardarProducto = useCallback(
    async (armado: Parameters<typeof guardarProductoDb>[0]) => {
      await guardarProductoDb(armado)
      await recargarCatalogo()
      setAviso({ texto: `${armado.producto.nombreCorto} guardado`, tono: 'ok' })
      void sincronizar(true)
    },
    [recargarCatalogo, sincronizar],
  )

  const cambiarPreciosEnLote = useCallback(
    async (cambios: Array<{ id: UUID; precio: number; productoId: UUID }>) => {
      if (cambios.length === 0) return 0
      await actualizarPreciosEnLote(
        cambios.map((c) => ({ id: c.id, precio: c.precio })),
        cambios.map((c) => c.productoId),
      )
      await recargarCatalogo()
      const productos = new Set(cambios.map((c) => c.productoId)).size
      setAviso({
        texto: `Precio cambiado en ${productos} ${productos === 1 ? 'producto' : 'productos'}`,
        tono: 'ok',
      })
      void sincronizar(true)
      return cambios.length
    },
    [recargarCatalogo, sincronizar],
  )

  const ordenarProductos = useCallback(
    async (ids: UUID[]) => {
      await guardarOrdenProductos(ids)
      await recargarCatalogo()
      setAviso({ texto: 'Orden guardado', tono: 'ok' })
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
    setAviso({ texto: `${cliente.nombre} agregado`, tono: 'ok' })
    void sincronizar(true)
    return cliente
  }, [sincronizar])

  const actualizarCliente = useCallback(
    async (cliente: Cliente) => {
      await guardarCliente(cliente)
      setClientes((c) => c.map((x) => (x.id === cliente.id ? cliente : x)))
      setAviso({ texto: 'Cliente actualizado', tono: 'ok' })
      void sincronizar(true)
    },
    [sincronizar],
  )

  /**
   * Dar de baja a un cliente.
   *
   * Se desactiva, no se borra, y solo si no debe nada. Borrar a alguien con
   * saldo dejaría sus ventas a crédito apuntando a un cliente que ya no existe:
   * la deuda desaparecería de la pantalla sin que nadie la haya pagado, que es
   * la peor forma posible de perder plata.
   */
  const eliminarCliente = useCallback(
    async (clienteId: UUID): Promise<boolean> => {
      const saldo = saldoDeCliente(clienteId, ventas, abonos, devoluciones)
      if (saldo > 0) {
        setAviso({ texto: 'No se puede quitar: todavía debe', tono: 'error' })
        return false
      }
      const cliente = clientes.find((c) => c.id === clienteId)
      if (!cliente) return false
      const baja: Cliente = { ...cliente, activo: false }
      await guardarCliente(baja)
      setClientes((c) => c.filter((x) => x.id !== clienteId))
      setAviso({ texto: `${cliente.nombre} dado de baja`, tono: 'ok' })
      void sincronizar(true)
      return true
    },
    [clientes, ventas, abonos, sincronizar],
  )

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
        devoluciones,
      }),
    [dia, ventas, abonos, snapshot, carteraTotal, devoluciones],
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
    vaciar,
    anadirPago,
    removerPago,
    actualizarTasa,
    tasasDia,
    registrar,
    anular,
    guardarProducto,
    ordenarProductos,
    cambiarPreciosEnLote,
    desactivarProducto,
    recargarCatalogo,
    cobrar,
    cerrarDia,
    recibirMercancia,
    recepciones,
    registrarMerma,
    registrarConteo,
    devolver,
    devoluciones,
    moverVaciosCompania,
    moverVaciosCliente,
    vacios,
    vaciosCompania,
    vaciosDeudores,
    vaciosPendientes,
    vaciosDe,
    reabrirDia,
    cierreDia,
    cierres,
    diaCerrado,
    volverAHoy,
    moneda,
    fijarMoneda,
    crearCliente,
    actualizarCliente,
    eliminarCliente,
    ventasAbiertasDe: (clienteId: UUID) => ventasAbiertas(clienteId, ventas, abonos, dia),
    saldoDe: (clienteId: UUID) => saldoDeCliente(clienteId, ventas, abonos, devoluciones),
  }
}

export type Pos = ReturnType<typeof usePos>
