import { formato } from '../domain/money'
import { siguienteEscalon } from '../domain/pricing'
import { UBICACION_FRIO } from '../data/seed'
import type { Venta } from '../domain/types'
import type { Pos } from '../hooks/usePos'

/**
 * La venta que se está transcribiendo, y debajo lo que ya se cargó del día.
 *
 * Ver la lista de lo cargado no es adorno: el encargado está copiando de un
 * cuaderno y necesita saber por dónde va sin volver a contar las rayas.
 */
export function CartPanel({
  pos,
  onContado,
  onFiar,
}: {
  pos: Pos
  onContado: () => void
  onFiar: () => void
}) {
  const s = pos.snapshot
  const t = pos.totales
  const tasa = s?.tasas.VES ?? 0
  const hayLineas = pos.carrito.lineas.length > 0

  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-l border-linea bg-panel">
      <div className="flex items-center justify-between border-b border-linea px-4 py-2.5">
        <span className="font-mono text-[10px] tracking-[0.16em] text-apagado uppercase">
          Venta del cuaderno
        </span>
        {hayLineas && (
          <button
            onClick={pos.vaciar}
            className="font-mono text-[10px] tracking-[0.1em] text-apagado uppercase hover:text-alerta"
          >
            Descartar
          </button>
        )}
      </div>

      <div className="min-h-0 flex-[3] overflow-y-auto">
        {!hayLineas ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-8 text-center">
            <p className="text-sm text-apagado">Toca los productos de la venta que estás copiando.</p>
          </div>
        ) : (
          <ul>
            {pos.carrito.lineas.map((l) => {
              const producto = s?.productos.find((p) => p.id === l.productoId)
              const presentacion = s?.presentacionesPorId.get(l.presentacionId)
              const esFrio = l.ubicacionId === UBICACION_FRIO
              const tieneNevera = pos.stockDe(l.productoId, UBICACION_FRIO) > 0 || esFrio

              const escalon = s
                ? siguienteEscalon(
                    {
                      presentacionId: l.presentacionId,
                      cantidadBase: l.cantidadBase,
                      ubicacionId: l.ubicacionId,
                      tipoCliente: pos.carrito.tipoCliente,
                      momento: Date.now(),
                    },
                    { listas: s.listas, precios: s.precios },
                  )
                : null

              return (
                <li key={l.id} className="border-b border-linea px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold">
                        {producto?.nombreCorto ?? '—'}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[10.5px] text-apagado">
                          {presentacion?.nombre}
                        </span>
                        <span className="tabular font-mono text-[10.5px] text-apagado">
                          · {formato(l.precioUnitario, 'USD')} c/u
                        </span>
                        {l.listaPrecioNombre && l.listaPrecioNombre !== 'Detal' && (
                          <span
                            className={`rounded px-1.5 py-px font-mono text-[9px] tracking-wider uppercase ${
                              l.listaPrecioNombre === 'Frío'
                                ? 'bg-frio/15 text-frio'
                                : 'bg-cobre/15 text-cobre2'
                            }`}
                          >
                            {l.listaPrecioNombre}
                          </span>
                        )}
                      </p>
                    </div>
                    <span className="tabular text-[15px] font-bold">{formato(l.importe, 'USD')}</span>
                  </div>

                  <div className="mt-2 flex items-center gap-1.5">
                    <button
                      onClick={() => pos.cambiarCantidadLinea(l.id, l.cantidad - 1)}
                      className="h-8 w-8 rounded border border-linea text-lg leading-none text-tinta2 hover:border-linea2 hover:text-tinta"
                      aria-label="Quitar uno"
                    >
                      −
                    </button>
                    <span className="tabular w-10 text-center text-[15px] font-semibold">
                      {l.cantidad}
                    </span>
                    <button
                      onClick={() => pos.cambiarCantidadLinea(l.id, l.cantidad + 1)}
                      className="h-8 w-8 rounded border border-linea text-lg leading-none text-tinta2 hover:border-linea2 hover:text-tinta"
                      aria-label="Agregar uno"
                    >
                      +
                    </button>

                    {tieneNevera && (
                      <button
                        onClick={() => pos.alternarFrio(l.id)}
                        className={`ml-1 h-8 rounded border px-2.5 font-mono text-[10px] tracking-wider uppercase ${
                          esFrio
                            ? 'border-frio bg-frio/15 text-frio'
                            : 'border-linea text-apagado hover:border-linea2'
                        }`}
                        title="Cambia entre nevera y anaquel. El precio se recalcula solo."
                      >
                        {esFrio ? 'Frío' : 'Al tiempo'}
                      </button>
                    )}

                    <button
                      onClick={() => pos.quitarLinea(l.id)}
                      className="ml-auto h-8 rounded px-2 font-mono text-[10px] tracking-wider text-apagado uppercase hover:text-alerta"
                    >
                      Quitar
                    </button>
                  </div>

                  {escalon && escalon.faltan <= 12 && (
                    <p className="mt-1.5 font-mono text-[10.5px] text-cobre2">
                      {escalon.faltan} más y baja a {formato(escalon.precio, 'USD')} ({escalon.lista})
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Total y las dos formas de cargarla */}
      <div className="border-t border-linea px-4 py-3">
        <div className="flex items-end justify-between">
          <span className="font-mono text-[11px] tracking-[0.12em] text-apagado uppercase">Total</span>
          <div className="text-right">
            <p className="tabular text-3xl leading-none font-bold">{formato(t.total, 'USD')}</p>
            <p className="tabular mt-1 font-mono text-[12px] text-apagado">
              {formato(t.total * tasa, 'VES')}
            </p>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            disabled={!hayLineas}
            onClick={onContado}
            className="flex-1 rounded-lg bg-cobre py-3.5 text-[15px] font-bold text-fondo transition-colors hover:bg-cobre2 disabled:cursor-not-allowed disabled:bg-panel3 disabled:text-apagado"
          >
            De contado
          </button>
          <button
            disabled={!hayLineas}
            onClick={onFiar}
            className="rounded-lg border border-linea2 px-5 py-3.5 text-[15px] font-bold text-tinta2 hover:border-cobre hover:text-cobre2 disabled:cursor-not-allowed disabled:border-linea disabled:text-apagado"
          >
            Fiar
          </button>
        </div>
      </div>

      <VentasCargadas pos={pos} />
    </aside>
  )
}

/** Lo que ya se transcribió del día, para no perder la cuenta */
function VentasCargadas({ pos }: { pos: Pos }) {
  const lista = pos.ventasDelDia.filter((v) => v.estado !== 'anulada')
  const total = lista.reduce((s, v) => s + v.total, 0)
  const fiadas = lista.filter((v) => v.condicion === 'credito').length

  return (
    <div className="flex min-h-[132px] flex-[2] flex-col border-t border-linea2 bg-panel2">
      <div className="flex items-baseline justify-between px-4 py-2">
        <span className="font-mono text-[10px] tracking-[0.16em] text-apagado uppercase">
          Cargadas · {lista.length}
          {fiadas > 0 && ` · ${fiadas} fiada${fiadas > 1 ? 's' : ''}`}
        </span>
        <span className="tabular text-[13px] font-bold">{formato(total, 'USD')}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {lista.length === 0 ? (
          <p className="px-2 py-3 text-[12.5px] text-apagado">Todavía no has cargado nada de este día.</p>
        ) : (
          <ul className="space-y-1">
            {lista.map((v) => (
              <FilaVenta key={v.id} venta={v} pos={pos} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function FilaVenta({ venta, pos }: { venta: Venta; pos: Pos }) {
  const cliente = pos.clientes.find((c) => c.id === venta.clienteId)
  const unidades = venta.lineas.reduce((s, l) => s + l.cantidadBase, 0)

  return (
    <li className="group flex items-center gap-2 rounded px-2 py-1.5 hover:bg-panel3">
      <span className="tabular font-mono text-[10px] text-apagado">{venta.folioProvisional}</span>
      <span className="min-w-0 flex-1 truncate text-[12.5px]">
        {venta.condicion === 'credito' ? (
          <span className="text-cobre2">Fiado · {cliente?.nombre ?? 'cliente'}</span>
        ) : (
          <span className="text-tinta2">
            {venta.lineas.length} renglón{venta.lineas.length > 1 ? 'es' : ''} · {unidades} und
          </span>
        )}
      </span>
      <span className="tabular text-[12.5px] font-semibold">{formato(venta.total, 'USD')}</span>
      <button
        onClick={() => void pos.anular(venta.id)}
        className="font-mono text-[9.5px] tracking-wider text-apagado uppercase opacity-0 group-hover:opacity-100 hover:text-alerta"
        title="Anula la venta y devuelve la mercancía al inventario"
      >
        Anular
      </button>
    </li>
  )
}
