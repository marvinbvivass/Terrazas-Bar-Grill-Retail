import { useMemo, useState } from 'react'
import { formato, parsearMonto } from '../domain/money'
import type { EntradaLineaRecepcion } from '../domain/recepcion'
import type { Presentacion, Producto, UUID } from '../domain/types'
import { UBICACION_FRIO, UBICACION_VENTA_DEFECTO } from '../data/seed'
import type { Pos } from '../hooks/usePos'
import { Hoja } from './Hoja'

interface Renglon {
  key: string
  productoId: UUID
  presentacionId: UUID
  cantidad: string
  /** Lo que costó UNA de esa presentación: una caja, un six-pack */
  costo: string
  ubicacionId: UUID
}

/**
 * Recibir mercancía del proveedor.
 *
 * Se teclea como viene en la factura: tantas cajas de esto, a tanto la caja.
 * El costo se pide POR PRESENTACIÓN y no por unidad porque es lo que dice el
 * papel del proveedor; la división entre 36 la hace el sistema, que es donde no
 * se equivoca.
 *
 * Al guardar sube el stock, queda el asiento de kardex y se recalcula el costo
 * promedio del producto. Antes esto se hacía sobrescribiendo la existencia en
 * el catálogo, sin dejar constancia de nada.
 */
export function HojaRecepcion({ pos, onCerrar }: { pos: Pos; onCerrar: () => void }) {
  const s = pos.snapshot
  const [proveedor, setProveedor] = useState('')
  const [documento, setDocumento] = useState('')
  const [renglones, setRenglones] = useState<Renglon[]>([])
  const [guardando, setGuardando] = useState(false)

  const productos = useMemo(
    () => (s?.productos ?? []).slice().sort((a, b) => a.nombreCorto.localeCompare(b.nombreCorto, 'es')),
    [s],
  )

  const preparados = useMemo(() => {
    if (!s) return []
    const salida: Array<{ renglon: Renglon; entrada: EntradaLineaRecepcion; importe: number }> = []
    for (const r of renglones) {
      const producto = s.productos.find((p) => p.id === r.productoId)
      const presentacion = s.presentacionesPorId.get(r.presentacionId)
      if (!producto || !presentacion) continue
      const cantidad = Math.max(0, Math.floor(parsearMonto(r.cantidad)))
      const costoPorPresentacion = parsearMonto(r.costo)
      if (cantidad <= 0) continue
      salida.push({
        renglon: r,
        entrada: { producto, presentacion, cantidad, costoPorPresentacion, ubicacionId: r.ubicacionId },
        importe: cantidad * costoPorPresentacion,
      })
    }
    return salida
  }, [renglones, s])

  const total = preparados.reduce((x, p) => x + p.importe, 0)
  const unidades = preparados.reduce(
    (x, p) => x + p.entrada.cantidad * p.entrada.presentacion.factor,
    0,
  )
  const sinCosto = preparados.some((p) => p.entrada.costoPorPresentacion <= 0)

  if (!s) return null
  const snap = s

  function presentacionesDe(productoId: UUID): Presentacion[] {
    return (snap.presentacionesPorProducto.get(productoId) ?? []).filter((p) => p.activo)
  }

  function agregarRenglon(producto: Producto) {
    const base = presentacionesDe(producto.id).find((p) => p.esBase)
    if (!base) return
    setRenglones((r) => [
      ...r,
      {
        key: crypto.randomUUID(),
        productoId: producto.id,
        // Se propone la presentación más grande: la mercancía casi siempre
        // llega en cajas, y así el encargado teclea menos.
        presentacionId: presentacionesDe(producto.id).at(-1)?.id ?? base.id,
        cantidad: '',
        costo: '',
        ubicacionId: UBICACION_VENTA_DEFECTO,
      },
    ])
  }

  function cambiar(key: string, cambios: Partial<Renglon>) {
    setRenglones((r) => r.map((x) => (x.key === key ? { ...x, ...cambios } : x)))
  }

  async function guardar() {
    setGuardando(true)
    await pos.recibirMercancia({
      lineas: preparados.map((p) => p.entrada),
      proveedor,
      documento,
    })
    setGuardando(false)
    onCerrar()
  }

  return (
    <Hoja
      titulo="Recibir mercancía"
      onCerrar={onCerrar}
      pie={
        <>
          <div className="flex items-end justify-between gap-3 pb-2">
            <div>
              <p className="font-mono text-[9.5px] tracking-[0.14em] text-apagado uppercase">
                Le pagas al proveedor
              </p>
              <p className="tabular text-[22px] leading-tight font-extrabold">
                {formato(total, 'USD')}
              </p>
            </div>
            <p className="tabular pb-1 text-[12.5px] text-apagado">{unidades} unidades</p>
          </div>
          <button
            onClick={() => void guardar()}
            disabled={guardando || preparados.length === 0}
            className="w-full rounded-xl bg-cobre py-3.5 text-[16px] font-bold text-fondo disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : 'Registrar la entrada'}
          </button>
        </>
      }
    >
      <div className="flex gap-2 pb-3">
        <input
          value={proveedor}
          onChange={(e) => setProveedor(e.target.value)}
          placeholder="Proveedor (opcional)"
          className="min-w-0 flex-1 rounded-xl border border-linea bg-panel2 px-3 py-2.5 placeholder:text-apagado"
          aria-label="Proveedor"
        />
        <input
          value={documento}
          onChange={(e) => setDocumento(e.target.value)}
          placeholder="Factura"
          className="w-28 shrink-0 rounded-xl border border-linea bg-panel2 px-3 py-2.5 placeholder:text-apagado"
          aria-label="Número de factura"
        />
      </div>

      {renglones.length === 0 && (
        <p className="rounded-xl border border-linea bg-panel2 px-4 py-4 text-center text-[13.5px] leading-relaxed text-tinta2">
          Agrega abajo lo que llegó. Pon el costo tal como viene en la factura — por caja o por
          six-pack — y el sistema calcula lo que cuesta cada unidad.
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        {renglones.map((r) => {
          const producto = snap.productos.find((p) => p.id === r.productoId)
          const presentacion = snap.presentacionesPorId.get(r.presentacionId)
          const cantidad = Math.max(0, Math.floor(parsearMonto(r.cantidad)))
          const costo = parsearMonto(r.costo)
          const factor = presentacion?.factor ?? 1
          return (
            <div key={r.key} className="rounded-xl border border-linea bg-panel px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2 pb-2">
                <span className="truncate text-[14.5px] font-semibold">
                  {producto?.nombreCorto ?? 'Producto'}
                </span>
                <button
                  onClick={() => setRenglones((x) => x.filter((y) => y.key !== r.key))}
                  className="shrink-0 text-[18px] leading-none text-alerta"
                  style={{ minHeight: 0 }}
                  aria-label="Quitar renglón"
                >
                  ×
                </button>
              </div>

              <div className="flex gap-2">
                <select
                  value={r.presentacionId}
                  onChange={(e) => cambiar(r.key, { presentacionId: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-linea bg-panel2 px-2 py-2.5 text-[14px]"
                  aria-label="Presentación"
                >
                  {presentacionesDe(r.productoId).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                      {p.factor > 1 ? ` (×${p.factor})` : ''}
                    </option>
                  ))}
                </select>
                <input
                  value={r.cantidad}
                  onChange={(e) => cambiar(r.key, { cantidad: e.target.value })}
                  inputMode="numeric"
                  placeholder="0"
                  className="tabular w-16 rounded-lg border border-linea bg-panel2 py-2.5 text-center font-bold"
                  aria-label="Cuántas"
                />
                <div className="flex w-24 items-center rounded-lg border border-linea bg-panel2 px-2">
                  <span className="font-mono text-[11.5px] text-apagado">$</span>
                  <input
                    value={r.costo}
                    onChange={(e) => cambiar(r.key, { costo: e.target.value })}
                    inputMode="decimal"
                    placeholder="0"
                    className="tabular w-full bg-transparent py-2.5 text-right font-bold"
                    aria-label="Costo por presentación"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2">
                <div className="flex gap-1">
                  <Donde
                    activo={r.ubicacionId === UBICACION_VENTA_DEFECTO}
                    onClick={() => cambiar(r.key, { ubicacionId: UBICACION_VENTA_DEFECTO })}
                  >
                    Al anaquel
                  </Donde>
                  <Donde
                    activo={r.ubicacionId === UBICACION_FRIO}
                    onClick={() => cambiar(r.key, { ubicacionId: UBICACION_FRIO })}
                  >
                    A la nevera
                  </Donde>
                </div>
                {cantidad > 0 && (
                  <p className="tabular text-right text-[11.5px] text-apagado">
                    {cantidad * factor} u.
                    {costo > 0 && ` · ${formato(costo / factor, 'USD')} c/u`}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {sinCosto && (
        <p className="mt-3 rounded-xl border border-ambar/50 bg-ambar/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-ambar">
          Hay renglones sin costo. Puedes guardarlos igual y el stock sube, pero el costo promedio
          de ese producto bajará, y con él el margen que vas a ver en el cierre.
        </p>
      )}

      <div className="pt-3">
        <p className="pb-1.5 font-mono text-[10px] tracking-[0.14em] text-apagado uppercase">
          Agregar producto
        </p>
        {productos.length === 0 ? (
          <p className="text-[13px] text-apagado">No hay productos. Créalos en el catálogo.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {productos.map((p) => (
              <button
                key={p.id}
                onClick={() => agregarRenglon(p)}
                className="rounded-full border border-linea2 px-3 py-1.5 text-[12.5px] text-tinta2"
                style={{ minHeight: 0 }}
              >
                + {p.nombreCorto}
              </button>
            ))}
          </div>
        )}
      </div>
    </Hoja>
  )
}

function Donde({
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
      className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${
        activo ? 'border-cobre bg-cobre/15 text-cobre2' : 'border-linea text-apagado'
      }`}
      style={{ minHeight: 0 }}
    >
      {children}
    </button>
  )
}
