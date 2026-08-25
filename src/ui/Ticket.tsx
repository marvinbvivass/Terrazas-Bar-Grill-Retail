import { formato } from '../domain/money'
import type { Venta } from '../domain/types'
import type { Pos } from '../hooks/usePos'

/**
 * Ticket.
 *
 * Cuando la venta se hizo sin señal, el folio provisional va marcado como tal:
 * el correlativo definitivo lo asigna el servidor al sincronizar, y fingir que
 * ya lo tiene es la forma más rápida de terminar con dos facturas número 1042.
 */
export function Ticket({ venta, pos, onCerrar }: { venta: Venta; pos: Pos; onCerrar: () => void }) {
  const s = pos.snapshot!
  const tasa = venta.tasas.VES ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden rounded-xl border border-linea2 bg-panel">
        <div className="flex items-center justify-between border-b border-linea px-4 py-3">
          <div>
            <p className="text-[15px] font-bold text-verde">Venta cobrada</p>
            <p className="font-mono text-[10.5px] text-apagado">
              {venta.numero !== null ? (
                <>Factura n.º {venta.numero}</>
              ) : (
                <>Folio provisional {venta.folioProvisional} · pendiente de correlativo</>
              )}
            </p>
          </div>
          {venta.creadaOffline && (
            <span className="rounded bg-cobre/15 px-2 py-1 font-mono text-[9px] tracking-wider text-cobre2 uppercase">
              sin señal
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed">
          <p className="text-apagado">
            {new Date(venta.fecha).toLocaleString('es-VE')} · {s.usuarioNombre}
          </p>

          <div className="my-3 border-t border-dashed border-linea2" />

          {venta.lineas.map((l) => {
            const producto = s.productos.find((p) => p.id === l.productoId)
            const presentacion = s.presentacionesPorId.get(l.presentacionId)
            return (
              <div key={l.id} className="mb-1.5">
                <div className="flex justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate">{producto?.nombreCorto}</span>
                  <span className="tabular">{formato(l.importe, 'USD')}</span>
                </div>
                <div className="tabular text-apagado">
                  {l.cantidad} × {presentacion?.nombre} @ {formato(l.precioUnitario, 'USD')}
                  {l.listaPrecioNombre !== 'Detal' && ` · ${l.listaPrecioNombre}`}
                </div>
              </div>
            )
          })}

          <div className="my-3 border-t border-dashed border-linea2" />

          <Fila etiqueta="Base imponible" valor={formato(venta.subtotal, 'USD')} />
          <Fila etiqueta="IVA 16%" valor={formato(venta.iva, 'USD')} />
          <Fila etiqueta="TOTAL" valor={formato(venta.total, 'USD')} fuerte />
          {tasa > 0 && (
            <Fila etiqueta={`Total Bs @ ${tasa}`} valor={formato(venta.total * tasa, 'VES')} />
          )}
          {venta.igtf > 0 && <Fila etiqueta="IGTF 3%" valor={formato(venta.igtf, 'USD')} />}

          <div className="my-3 border-t border-dashed border-linea2" />

          {venta.pagos.map((p) => (
            <div key={p.id} className="mb-1">
              <Fila etiqueta={p.metodoNombre} valor={formato(p.montoEnMoneda, p.moneda)} />
              {p.referencia && <p className="text-apagado">ref {p.referencia}</p>}
              {p.vuelto > 0 && (
                <Fila etiqueta="Vuelto" valor={formato(p.vuelto, p.moneda)} />
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 border-t border-linea px-4 py-3">
          <button
            onClick={() => window.print()}
            className="flex-1 rounded-lg border border-linea2 py-3 text-[14px] font-semibold text-tinta2 hover:border-cobre hover:text-cobre2"
          >
            Imprimir
          </button>
          <button
            autoFocus
            onClick={onCerrar}
            className="flex-1 rounded-lg bg-cobre py-3 text-[14px] font-bold text-fondo hover:bg-cobre2"
          >
            Siguiente venta
          </button>
        </div>
      </div>
    </div>
  )
}

function Fila({
  etiqueta,
  valor,
  fuerte,
}: {
  etiqueta: string
  valor: string
  fuerte?: boolean
}) {
  return (
    <div className={`flex justify-between gap-2 ${fuerte ? 'text-[13.5px] font-bold' : ''}`}>
      <span className={fuerte ? '' : 'text-apagado'}>{etiqueta}</span>
      <span className="tabular">{valor}</span>
    </div>
  )
}
