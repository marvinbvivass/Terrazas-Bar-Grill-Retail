import { formato } from '../domain/money'
import { siguienteEscalon } from '../domain/pricing'
import { UBICACION_FRIO } from '../data/seed'
import type { Pos } from '../hooks/usePos'

/** El carrito y el total. Es la mitad derecha de la pantalla y no se mueve nunca. */
export function CartPanel({ pos, onCobrar }: { pos: Pos; onCobrar: () => void }) {
  const s = pos.snapshot
  const t = pos.totales
  const tasa = s?.tasas.VES ?? 0

  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-l border-linea bg-panel">
      <div className="flex items-center justify-between border-b border-linea px-4 py-2.5">
        <span className="font-mono text-[10px] tracking-[0.16em] text-apagado uppercase">
          Venta en curso
        </span>
        {pos.carrito.lineas.length > 0 && (
          <button
            onClick={pos.vaciar}
            className="font-mono text-[10px] tracking-[0.1em] text-apagado uppercase hover:text-alerta"
          >
            Vaciar
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {pos.carrito.lineas.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
            <p className="text-sm text-apagado">Toca un producto o escanea un código.</p>
          </div>
        ) : (
          <ul>
            {pos.carrito.lineas.map((l) => {
              const producto = s?.productos.find((p) => p.id === l.productoId)
              const presentacion = s?.presentacionesPorId.get(l.presentacionId)
              const esFrio = l.ubicacionId === UBICACION_FRIO
              const tieneNevera = (pos.stockDe(l.productoId, UBICACION_FRIO) ?? 0) > 0 || esFrio

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
                        <span className="font-mono text-[10.5px] text-apagado">·</span>
                        <span className="tabular font-mono text-[10.5px] text-apagado">
                          {formato(l.precioUnitario, 'USD')} c/u
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

                  {/*
                    El aviso solo aparece cuando el escalón está a la vuelta de
                    la esquina. Decirle al cajero que 23 botellas más de whisky
                    bajan el precio no es información, es ruido en cada línea.
                  */}
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

      {/* Totales */}
      <div className="border-t border-linea px-4 py-3">
        <Fila etiqueta="Base imponible" valor={formato(t.subtotal, 'USD')} />
        <Fila etiqueta="IVA 16% incluido" valor={formato(t.iva, 'USD')} />
        {t.unidades > 0 && (
          <Fila etiqueta="Unidades" valor={String(t.unidades)} />
        )}

        <div className="mt-3 flex items-end justify-between border-t border-linea pt-3">
          <span className="font-mono text-[11px] tracking-[0.12em] text-apagado uppercase">Total</span>
          <div className="text-right">
            <p className="tabular text-3xl leading-none font-bold">{formato(t.total, 'USD')}</p>
            <p className="tabular mt-1 font-mono text-[12px] text-apagado">
              {formato(t.total * tasa, 'VES')}
            </p>
          </div>
        </div>

        <button
          disabled={pos.carrito.lineas.length === 0}
          onClick={onCobrar}
          className="mt-3 w-full rounded-lg bg-cobre py-3.5 text-[15px] font-bold text-fondo transition-colors hover:bg-cobre2 disabled:cursor-not-allowed disabled:bg-panel3 disabled:text-apagado"
        >
          Cobrar · F12
        </button>
      </div>
    </aside>
  )
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span className="text-[12.5px] text-apagado">{etiqueta}</span>
      <span className="tabular text-[13px] text-tinta2">{valor}</span>
    </div>
  )
}
