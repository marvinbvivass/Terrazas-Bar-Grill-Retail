import { useMemo, useState } from 'react'
import {
  agregar,
  cambiarCantidad,
  carritoVacio,
  recalcular,
  totales,
  type Carrito,
} from '../domain/cart'
import { cuadrar, type Recibido } from '../domain/cuadre'
import { MONEDAS, formato, formatoNumero, parsearMonto } from '../domain/money'
import { inicioDe } from '../domain/dias'
import type { MetodoPago, MonedaCodigo, Pago, Producto, UUID } from '../domain/types'
import { UBICACION_FRIO, UBICACION_VENTA_DEFECTO } from '../data/seed'
import type { Pos } from '../hooks/usePos'
import { Hoja } from './Hoja'
import { Precio, useMoneda } from './moneda'

const MONEDAS_COBRO: MonedaCodigo[] = ['USD', 'VES', 'COP']

/**
 * La venta del día.
 *
 * Se carga al final de la jornada: por cada producto, cuánto se vendió; y al
 * cerrar, cuánto dinero entró en cada moneda. Las dos cifras se comparan y la
 * diferencia se muestra en pantalla — es el único control que impide creer que
 * se vendió más de lo que se cobró.
 *
 * El mismo formulario sirve para lo que se dio a crédito, cambiando el selector
 * de arriba. Un crédito lleva los mismos productos, pero no entra plata: se
 * guarda a nombre de un cliente y aparece en CXC hasta que lo pague.
 */
export function VentaDiaView({ pos }: { pos: Pos }) {
  const s = pos.snapshot
  const [modo, setModo] = useState<'contado' | 'credito'>('contado')
  const [clienteId, setClienteId] = useState<UUID | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState<UUID | 'todas'>('todas')
  const [bruto, setBruto] = useState<Carrito>(carritoVacio())
  const [cerrando, setCerrando] = useState(false)

  const momento = useMemo(() => inicioDe(pos.dia) + 12 * 3600_000, [pos.dia])

  const carrito = useMemo(() => {
    if (!s) return bruto
    return recalcular(
      bruto,
      s.presentacionesPorId,
      { listas: s.listas, precios: s.precios },
      momento,
    )
  }, [bruto, s, momento])

  const t = useMemo(() => totales(carrito), [carrito])

  const cantidadDe = useMemo(() => {
    const m = new Map<UUID, number>()
    for (const l of carrito.lineas) m.set(l.productoId, (m.get(l.productoId) ?? 0) + l.cantidad)
    return m
  }, [carrito])

  const visibles = useMemo(() => {
    if (!s) return []
    const q = busqueda.trim().toLowerCase()
    return s.productos
      .filter((p) => categoria === 'todas' || p.categoriaId === categoria)
      .filter(
        (p) =>
          q === '' ||
          p.nombre.toLowerCase().includes(q) ||
          p.nombreCorto.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.marca ?? '').toLowerCase().includes(q),
      )
  }, [s, categoria, busqueda])

  if (!s) return null
  const snap = s

  function ubicacionDe(productoId: UUID): UUID {
    const enSala = pos.stockDisponible(productoId, UBICACION_VENTA_DEFECTO)
    const enNevera = pos.stockDisponible(productoId, UBICACION_FRIO)
    return enSala <= 0 && enNevera > 0 ? UBICACION_FRIO : UBICACION_VENTA_DEFECTO
  }

  function poner(producto: Producto, cantidad: number) {
    const base = snap.presentacionesPorProducto.get(producto.id)?.find((x) => x.esBase)
    if (!base) return
    setBruto((c) => {
      const linea = c.lineas.find((l) => l.productoId === producto.id)
      if (linea) return cambiarCantidad(c, linea.id, cantidad)
      if (cantidad <= 0) return c
      return agregar(c, {
        producto,
        presentacion: base,
        ubicacionId: ubicacionDe(producto.id),
        cantidad,
      })
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Contado o crédito */}
      <div className="flex shrink-0 gap-1 border-b border-linea bg-panel px-3 py-2">
        <Segmento activo={modo === 'contado'} onClick={() => setModo('contado')}>
          Contado
        </Segmento>
        <Segmento activo={modo === 'credito'} onClick={() => setModo('credito')}>
          A crédito
        </Segmento>
      </div>

      {modo === 'credito' && (
        <div className="shrink-0 border-b border-linea bg-panel2 px-3 py-2">
          <label className="flex items-center gap-2">
            <span className="font-mono text-[10.5px] tracking-[0.12em] text-apagado uppercase">
              Cliente
            </span>
            <select
              value={clienteId ?? ''}
              onChange={(e) => setClienteId(e.target.value || null)}
              className="min-w-0 flex-1 rounded-lg border border-linea bg-panel px-2 py-2 text-[15px]"
            >
              <option value="">Elegir…</option>
              {pos.clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          {pos.clientes.length === 0 && (
            <p className="pt-1.5 text-[12.5px] text-apagado">
              Todavía no hay clientes. Se crean en la pestaña CXC.
            </p>
          )}
        </div>
      )}

      <div className="shrink-0 px-3 pt-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto…"
          className="w-full rounded-xl border border-linea bg-panel2 px-3 py-2.5 placeholder:text-apagado"
          aria-label="Buscar producto"
        />
      </div>

      {snap.categorias.length > 0 && (
        <div className="shrink-0 overflow-x-auto px-3 py-2">
          <div className="flex gap-1.5">
            <Pastilla activa={categoria === 'todas'} onClick={() => setCategoria('todas')}>
              Todas
            </Pastilla>
            {snap.categorias.map((c) => (
              <Pastilla key={c.id} activa={categoria === c.id} onClick={() => setCategoria(c.id)}>
                {c.nombre}
              </Pastilla>
            ))}
          </div>
        </div>
      )}

      <div className="scroll-y min-h-0 flex-1 px-3 pb-3">
        {snap.productos.length === 0 && (
          <p className="px-2 py-10 text-center text-[14px] leading-relaxed text-apagado">
            No hay productos todavía.
            <br />
            Cárgalos en la pestaña <span className="font-semibold text-tinta2">Catálogo</span>.
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          {visibles.map((p) => (
            <FilaProducto
              key={p.id}
              producto={p}
              cantidad={cantidadDe.get(p.id) ?? 0}
              precio={precioDe(p, snap, pos, momento)}
              stock={pos.stockDe(p.id, UBICACION_VENTA_DEFECTO) + pos.stockDe(p.id, UBICACION_FRIO)}
              onCantidad={(n) => poner(p, n)}
            />
          ))}
        </div>
      </div>

      {/* Resumen fijo */}
      <div className="shrink-0 border-t border-linea bg-panel px-3 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[10px] tracking-[0.14em] text-apagado uppercase">
              {modo === 'contado' ? 'Vendido de contado' : 'Se lleva a crédito'}
            </p>
            <TotalGrande base={t.total} unidades={t.unidades} />
          </div>
          <button
            onClick={() => setCerrando(true)}
            disabled={carrito.lineas.length === 0 || (modo === 'credito' && !clienteId)}
            className="shrink-0 rounded-xl bg-cobre px-5 py-3 text-[15.5px] font-bold text-fondo disabled:opacity-35"
          >
            {modo === 'contado' ? 'Cobrar' : 'Guardar'}
          </button>
        </div>
      </div>

      {cerrando && modo === 'contado' && (
        <HojaCobro
          pos={pos}
          carrito={carrito}
          onCerrar={() => setCerrando(false)}
          onListo={() => setBruto(carritoVacio())}
        />
      )}

      {cerrando && modo === 'credito' && clienteId && (
        <HojaCredito
          pos={pos}
          carrito={carrito}
          clienteId={clienteId}
          onCerrar={() => setCerrando(false)}
          onListo={() => {
            setBruto(carritoVacio())
            setClienteId(null)
          }}
        />
      )}
    </div>
  )
}

/**
 * El precio de una unidad, resuelto con el mismo motor que usa la venta.
 *
 * Se arma un carrito de una sola línea en vez de leer la tabla de precios a
 * mano: así el precio que se ve en la lista es exactamente el que se va a
 * cobrar, incluida la lista de frío si al producto solo le queda nevera.
 */
function precioDe(
  p: Producto,
  s: NonNullable<Pos['snapshot']>,
  pos: Pos,
  momento: number,
): number {
  const base = s.presentacionesPorProducto.get(p.id)?.find((x) => x.esBase)
  if (!base) return 0
  const enSala = pos.stockDisponible(p.id, UBICACION_VENTA_DEFECTO)
  const ubicacionId = enSala <= 0 ? UBICACION_FRIO : UBICACION_VENTA_DEFECTO
  const conLinea = agregar(carritoVacio(), {
    producto: p,
    presentacion: base,
    ubicacionId,
    cantidad: 1,
  })
  const listo = recalcular(
    conLinea,
    s.presentacionesPorId,
    { listas: s.listas, precios: s.precios },
    momento,
  )
  return listo.lineas[0]?.precioUnitario ?? 0
}

function TotalGrande({ base, unidades }: { base: number; unidades: number }) {
  const { texto, rotar } = useMoneda()
  return (
    <button onClick={rotar} className="block text-left" style={{ minHeight: 0 }}>
      <span className="tabular text-[24px] leading-tight font-extrabold">{texto(base)}</span>
      <span className="pl-2 text-[12px] text-apagado">{unidades} u.</span>
    </button>
  )
}

function FilaProducto({
  producto,
  cantidad,
  precio,
  stock,
  onCantidad,
}: {
  producto: Producto
  cantidad: number
  precio: number
  stock: number
  onCantidad: (n: number) => void
}) {
  const sinStock = stock <= 0
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${
        cantidad > 0 ? 'border-cobre/60 bg-cobre/[0.07]' : 'border-linea bg-panel'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-semibold">{producto.nombreCorto}</p>
        <div className="flex items-center gap-2">
          <Precio base={precio} tamano="chico" />
          <span className={`text-[11.5px] ${sinStock ? 'text-alerta' : 'text-apagado'}`}>
            {sinStock ? 'sin existencia' : `${stock} en stock`}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => onCantidad(Math.max(0, cantidad - 1))}
          disabled={cantidad === 0}
          className="h-11 w-11 rounded-lg border border-linea text-[20px] text-tinta2 disabled:opacity-25"
          aria-label={`Quitar uno de ${producto.nombreCorto}`}
        >
          −
        </button>
        <input
          value={cantidad === 0 ? '' : String(cantidad)}
          onChange={(e) => onCantidad(Math.max(0, Math.floor(parsearMonto(e.target.value))))}
          inputMode="numeric"
          placeholder="0"
          className="tabular h-11 w-14 rounded-lg border border-linea bg-panel2 text-center font-bold"
          aria-label={`Cantidad vendida de ${producto.nombreCorto}`}
        />
        <button
          onClick={() => onCantidad(cantidad + 1)}
          className="h-11 w-11 rounded-lg border border-linea text-[20px] text-tinta2"
          aria-label={`Agregar uno de ${producto.nombreCorto}`}
        >
          +
        </button>
      </div>
    </div>
  )
}

/**
 * El cobro del día: cuánto entró en cada moneda y si cuadra.
 *
 * No bloquea cuando no cuadra. En la vida real un día cierra con diferencia y
 * hay que poder cerrarlo igual; lo que no puede pasar es que la diferencia no
 * se vea. Por eso se muestra grande y en rojo, pero el botón sigue activo.
 */
function HojaCobro({
  pos,
  carrito,
  onCerrar,
  onListo,
}: {
  pos: Pos
  carrito: Carrito
  onCerrar: () => void
  onListo: () => void
}) {
  const snap = pos.snapshot
  const t = totales(carrito)
  const [montos, setMontos] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)

  const tasas = snap?.tasas ?? {}

  const recibido: Recibido = useMemo(() => {
    const r: Recibido = {}
    for (const m of MONEDAS_COBRO) {
      const n = parsearMonto(montos[m] ?? '')
      if (n > 0) r[m] = n
    }
    return r
  }, [montos])

  const c = useMemo(
    () => cuadrar({ totalVendido: t.total, recibido, tasas }),
    [t.total, recibido, tasas],
  )

  /** Rellena la moneda con lo que falta para cuadrar exacto. */
  function completar(m: MonedaCodigo) {
    const faltaBase = t.total - c.totalRecibido
    if (faltaBase <= 0) return
    const tasa = m === 'USD' ? 1 : (tasas[m] ?? 0)
    if (tasa <= 0) return
    const yaHay = parsearMonto(montos[m] ?? '')
    setMontos((x) => ({ ...x, [m]: formatoNumero(yaHay + faltaBase * tasa, m) }))
  }

  async function registrar() {
    if (!snap) return
    setGuardando(true)
    const pagos = construirPagos(recibido, tasas, snap.metodosPago)
    await pos.registrar({ ...carrito, pagos }, null)
    setGuardando(false)
    onListo()
    onCerrar()
  }

  return (
    <Hoja
      titulo="Cobro del día"
      onCerrar={onCerrar}
      pie={
        <button
          onClick={() => void registrar()}
          disabled={guardando}
          className={`w-full rounded-xl py-3.5 text-[16px] font-bold disabled:opacity-60 ${
            c.cuadra ? 'bg-verde text-fondo' : 'bg-cobre text-fondo'
          }`}
        >
          {guardando ? 'Guardando…' : c.cuadra ? 'Cerrar el día' : 'Cerrar con diferencia'}
        </button>
      }
    >
      <div className="flex items-baseline justify-between border-b border-linea pb-2">
        <span className="font-mono text-[10.5px] tracking-[0.14em] text-apagado uppercase">
          Vendido
        </span>
        <span className="tabular text-[21px] font-extrabold">{formato(t.total, 'USD')}</span>
      </div>

      <p className="py-3 text-[13.5px] leading-relaxed text-tinta2">
        Escribe cuánto recibiste en cada moneda. Cada monto va en su propia moneda; la aplicación
        lo lleva a dólares con la tasa del día.
      </p>

      <div className="flex flex-col gap-2.5">
        {MONEDAS_COBRO.map((m) => {
          const tasa = m === 'USD' ? 1 : (tasas[m] ?? 0)
          const sinTasa = m !== 'USD' && tasa <= 0
          const n = parsearMonto(montos[m] ?? '')
          return (
            <div key={m}>
              <div
                className={`flex items-center gap-2 rounded-xl border bg-panel2 px-3 ${
                  sinTasa ? 'border-alerta/50' : 'border-linea focus-within:border-cobre'
                }`}
              >
                <span className="w-12 shrink-0 font-mono text-[12.5px] text-apagado">
                  {MONEDAS[m].simbolo}
                </span>
                <input
                  value={montos[m] ?? ''}
                  onChange={(e) => setMontos((x) => ({ ...x, [m]: e.target.value }))}
                  inputMode="decimal"
                  placeholder="0"
                  disabled={sinTasa}
                  className="tabular w-full bg-transparent py-3 text-right font-bold disabled:opacity-40"
                  aria-label={`Recibido en ${MONEDAS[m].nombre}`}
                />
                <button
                  onClick={() => completar(m)}
                  className="shrink-0 rounded-lg border border-linea2 px-2 py-1 font-mono text-[10px] tracking-wider text-tinta2 uppercase"
                  style={{ minHeight: 0 }}
                  title="Poner aquí lo que falta para cuadrar"
                >
                  resto
                </button>
              </div>
              {sinTasa ? (
                <p className="pt-1 pl-1 text-[12px] text-alerta">
                  Sin tasa cargada. Ponla en ⋮ → Tasas del día.
                </p>
              ) : (
                n > 0 &&
                m !== 'USD' && (
                  <p className="pt-1 pr-1 text-right text-[12px] text-apagado">
                    = {formato(n / tasa, 'USD')}
                  </p>
                )
              )}
            </div>
          )
        })}
      </div>

      <div
        className={`mt-4 rounded-xl border px-3 py-2.5 ${
          c.cuadra ? 'border-verde/40 bg-verde/10' : 'border-alerta/40 bg-alerta/10'
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-tinta2">Recibido</span>
          <span className="tabular text-[15px] font-bold">{formato(c.totalRecibido, 'USD')}</span>
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className={`text-[13px] font-semibold ${c.cuadra ? 'text-verde' : 'text-alerta'}`}>
            {c.cuadra ? 'Cuadra' : c.diferencia < 0 ? 'Falta' : 'Sobra'}
          </span>
          <span
            className={`tabular text-[19px] font-extrabold ${
              c.cuadra ? 'text-verde' : 'text-alerta'
            }`}
          >
            {c.cuadra ? '✓' : formato(Math.abs(c.diferencia), 'USD')}
          </span>
        </div>
      </div>
    </Hoja>
  )
}

function HojaCredito({
  pos,
  carrito,
  clienteId,
  onCerrar,
  onListo,
}: {
  pos: Pos
  carrito: Carrito
  clienteId: UUID
  onCerrar: () => void
  onListo: () => void
}) {
  const t = totales(carrito)
  const [guardando, setGuardando] = useState(false)
  const cliente = pos.clientes.find((c) => c.id === clienteId)
  const saldo = pos.saldoDe(clienteId)

  async function registrar() {
    setGuardando(true)
    await pos.registrar({ ...carrito, pagos: [] }, clienteId)
    setGuardando(false)
    onListo()
    onCerrar()
  }

  return (
    <Hoja
      titulo="Venta a crédito"
      onCerrar={onCerrar}
      pie={
        <button
          onClick={() => void registrar()}
          disabled={guardando}
          className="w-full rounded-xl bg-cobre py-3.5 text-[16px] font-bold text-fondo disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Cargar a la cuenta'}
        </button>
      }
    >
      <p className="py-2 text-[13.5px] leading-relaxed text-tinta2">
        La mercancía sale del inventario, pero no entra dinero. Queda en CXC hasta que se cobre.
      </p>
      <div className="rounded-xl border border-linea bg-panel2 px-3 py-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-apagado">Cliente</span>
          <span className="text-[15px] font-semibold">{cliente?.nombre ?? '—'}</span>
        </div>
        <div className="flex items-center justify-between pt-2">
          <span className="text-[13px] text-apagado">Ya debía</span>
          <span className="tabular text-[15px]">{formato(saldo, 'USD')}</span>
        </div>
        <div className="mt-2 flex items-center justify-between border-t border-linea pt-2">
          <span className="text-[13px] text-apagado">Esta venta</span>
          <span className="tabular text-[17px] font-bold">{formato(t.total, 'USD')}</span>
        </div>
        <div className="flex items-center justify-between pt-2">
          <span className="text-[13px] font-semibold text-cobre2">Queda debiendo</span>
          <span className="tabular text-[19px] font-extrabold text-cobre2">
            {formato(saldo + t.total, 'USD')}
          </span>
        </div>
      </div>
    </Hoja>
  )
}

/**
 * Convierte lo recibido en pagos del documento.
 *
 * El IGTF se deja en cero a propósito: aquí no se cobra factura por factura, se
 * cuadra el total del día. Añadir un 3% sobre lo recibido en divisa haría que
 * la caja nunca cuadrara contra lo que el encargado contó en la gaveta.
 */
function construirPagos(
  recibido: Recibido,
  tasas: Record<string, number>,
  metodos: MetodoPago[],
): Pago[] {
  const pagos: Pago[] = []
  for (const m of MONEDAS_COBRO) {
    const monto = recibido[m] ?? 0
    if (monto <= 0) continue
    const tasa = m === 'USD' ? 1 : (tasas[m] ?? 0)
    if (tasa <= 0) continue
    const metodo =
      metodos.find((x) => x.moneda === m && x.esEfectivo) ?? metodos.find((x) => x.moneda === m)
    if (!metodo) continue
    pagos.push({
      id: crypto.randomUUID(),
      metodoPagoId: metodo.id,
      metodoNombre: metodo.nombre,
      moneda: m,
      montoAplicado: monto / tasa,
      igtf: 0,
      tasa,
      montoEnMoneda: monto,
      entregado: null,
      vuelto: 0,
      referencia: null,
    })
  }
  return pagos
}

function Segmento({
  activo,
  onClick,
  children,
}: {
  activo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg py-2 text-[14.5px] font-semibold ${
        activo ? 'bg-cobre text-fondo' : 'bg-panel2 text-tinta2'
      }`}
    >
      {children}
    </button>
  )
}

function Pastilla({
  activa,
  onClick,
  children,
}: {
  activa: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] whitespace-nowrap ${
        activa ? 'border-cobre bg-cobre/15 text-cobre2' : 'border-linea text-tinta2'
      }`}
      style={{ minHeight: 0 }}
    >
      {children}
    </button>
  )
}
