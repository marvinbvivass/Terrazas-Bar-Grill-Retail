import { useMemo, useState } from 'react'
import { redondear } from '../domain/money'
import { textoLargo } from '../domain/dias'
import { compararPorOrden } from '../domain/catalogo'
import { desgloseCorto } from '../domain/stock'
import type { Recepcion } from '../domain/recepcion'
import type { UUID } from '../domain/types'
import type { Pos } from '../hooks/usePos'
import { Hoja } from './Hoja'

/**
 * Historial de recargas.
 *
 * Contesta dos preguntas que se hacen de verdad y que la lista corta de
 * Recargar no alcanzaba a responder:
 *
 *   "¿Este despacho ya lo cargué?"  → buscando por proveedor
 *   "¿Cuándo entró Polar por última vez y cuánta?" → filtrando por producto
 *
 * Nada de esto se puede borrar ni editar. Una entrada mal hecha se corrige con
 * otra entrada, igual que las ventas: el inventario tiene que poder explicarse
 * con los movimientos que lo formaron.
 */
export function HistorialRecargas({ pos, onCerrar }: { pos: Pos; onCerrar: () => void }) {
  const [busqueda, setBusqueda] = useState('')
  const [producto, setProducto] = useState<UUID | 'todos'>('todos')
  const [abierta, setAbierta] = useState<Recepcion | null>(null)

  const productos = useMemo(
    () => (pos.snapshot?.productos ?? []).slice().sort(compararPorOrden),
    [pos.snapshot],
  )

  const nombreDe = (id: UUID) =>
    pos.snapshot?.productos.find((p) => p.id === id)?.nombreCorto ?? 'Producto'

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return pos.recepciones
      .filter((r) => producto === 'todos' || r.lineas.some((l) => l.productoId === producto))
      .filter((r) => q === '' || (r.proveedor ?? '').toLowerCase().includes(q))
      .sort((a, b) => b.fecha - a.fecha)
  }, [pos.recepciones, busqueda, producto])

  /*
   * El total de arriba es el de lo FILTRADO, no el de todo.
   *
   * Es lo que hace útil el filtro: con un producto elegido, la cifra contesta
   * cuánto ha entrado de ese producto en todo lo que se ve.
   */
  const unidades = useMemo(() => {
    if (producto === 'todos') {
      return redondear(
        visibles.reduce((s, r) => s + r.unidades, 0),
        3,
      )
    }
    let total = 0
    for (const r of visibles) {
      for (const l of r.lineas) {
        if (l.productoId === producto) total += l.cantidadBase
      }
    }
    return redondear(total, 3)
  }, [visibles, producto])

  /** Lo entrado de un producto también en cajas, que es como llega el camión */
  const enCajas = useMemo(() => {
    if (producto === 'todos') return null
    const presentaciones = pos.snapshot?.presentacionesPorProducto.get(producto) ?? []
    return presentaciones.length > 1 ? desgloseCorto(unidades, presentaciones) : null
  }, [producto, unidades, pos.snapshot])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-baseline justify-between gap-3 border-b border-linea bg-panel px-3 py-1.5">
        <p className="truncate font-mono text-[10px] tracking-[0.14em] text-apagado uppercase">
          {producto === 'todos' ? 'Entró en total' : `Entró de ${nombreDe(producto)}`}
          <span className="tabular pl-2 text-[14px] font-bold tracking-normal text-cobre2 normal-case">
            {unidades} u.
          </span>
        </p>
        {enCajas && (
          <p className="tabular shrink-0 text-right text-[11.5px] text-apagado">{enCajas}</p>
        )}
      </div>

      <div className="shrink-0 px-3 pt-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por proveedor…"
          className="w-full rounded-xl border border-linea bg-panel2 px-3 py-2.5 placeholder:text-apagado"
          aria-label="Buscar entrada"
        />
      </div>

      <div className="flex shrink-0 gap-2 px-3 py-2">
        <select
          value={producto}
          onChange={(e) => setProducto(e.target.value)}
          className={`min-w-0 flex-1 rounded-xl border bg-panel2 px-2.5 py-2.5 text-[13.5px] ${
            producto === 'todos' ? 'border-linea text-tinta2' : 'border-cobre text-cobre2'
          }`}
          aria-label="Filtrar por producto"
        >
          <option value="todos">Todos los productos</option>
          {productos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombreCorto}
            </option>
          ))}
        </select>
        <button
          onClick={onCerrar}
          className="shrink-0 rounded-xl border border-linea2 px-3 py-2.5 text-[13px] font-semibold text-tinta2"
        >
          Volver
        </button>
      </div>

      <div className="scroll-y min-h-0 flex-1 px-3 pb-3">
        {visibles.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13.5px] leading-relaxed text-apagado">
            {pos.recepciones.length === 0
              ? 'Todavía no has registrado ninguna entrada de mercancía.'
              : 'Ninguna entrada coincide con lo que buscas.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {visibles.map((r) => {
              const delProducto =
                producto === 'todos' ? null : r.lineas.filter((l) => l.productoId === producto)
              return (
                <li key={r.id}>
                  <button
                    onClick={() => setAbierta(r)}
                    className="w-full rounded-xl border border-linea bg-panel px-3 py-2.5 text-left"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[14.5px] font-semibold">
                        {r.proveedor ?? 'Sin proveedor'}
                      </span>
                      <span className="tabular shrink-0 text-[15px] font-bold text-cobre2">
                        {r.unidades} u.
                      </span>
                    </div>
                    <p className="truncate pt-0.5 font-mono text-[10.5px] text-apagado">
                      {textoLargo(r.dia)} · {r.lineas.length}{' '}
                      {r.lineas.length === 1 ? 'renglón' : 'renglones'}
                      {!r.sincronizadaEn && ' · sin subir'}
                    </p>
                    {delProducto && delProducto.length > 0 && (
                      <p className="truncate pt-0.5 text-[12.5px] font-semibold text-cobre2">
                        {delProducto.map((l) => `${l.cantidadBase} u.`).join(' · ')}
                      </p>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <p className="px-2 pt-4 text-center text-[12px] leading-relaxed text-apagado">
          Una entrada no se borra ni se edita. Si llegó mal, se corrige con otra entrada: el
          inventario tiene que poder explicarse con los movimientos que lo formaron.
        </p>
      </div>

      {abierta && (
        <Detalle
          recepcion={abierta}
          nombreDe={nombreDe}
          presentacionDe={(id) => pos.snapshot?.presentacionesPorId.get(id)?.nombre ?? '—'}
          onCerrar={() => setAbierta(null)}
        />
      )}
    </div>
  )
}

function Detalle({
  recepcion,
  nombreDe,
  presentacionDe,
  onCerrar,
}: {
  recepcion: Recepcion
  nombreDe: (id: UUID) => string
  presentacionDe: (id: UUID) => string
  onCerrar: () => void
}) {
  return (
    <Hoja titulo={recepcion.proveedor ?? 'Entrada de mercancía'} onCerrar={onCerrar}>
      <div className="flex items-baseline justify-between gap-3 border-b border-linea pb-2">
        <span className="font-mono text-[10.5px] tracking-[0.14em] text-apagado uppercase">
          {textoLargo(recepcion.dia)}
        </span>
        <span className="tabular text-[20px] font-extrabold">{recepcion.unidades} u.</span>
      </div>

      <div className="py-1">
        {recepcion.lineas.map((l) => (
          <div key={l.id} className="flex items-baseline justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold">{nombreDe(l.productoId)}</p>
              <p className="truncate font-mono text-[10.5px] text-apagado">
                {l.cantidad} × {presentacionDe(l.presentacionId)}
              </p>
            </div>
            <span className="tabular shrink-0 text-[14px] font-semibold">{l.cantidadBase} u.</span>
          </div>
        ))}
      </div>

      <div className="border-t border-linea pt-2">
        <p className="text-[12.5px] leading-relaxed text-apagado">
          {recepcion.nota ? `${recepcion.nota}. ` : ''}
          {recepcion.creadaOffline && 'Se registró sin señal. '}
          {recepcion.sincronizadaEn ? 'Ya está en el servidor.' : 'Todavía no ha subido.'}
        </p>
      </div>
    </Hoja>
  )
}
