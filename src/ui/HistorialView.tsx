import { useMemo } from 'react'
import { calcularCierre } from '../domain/cierre'
import { formato } from '../domain/money'
import { textoCorto } from '../domain/dias'
import type { Pos } from '../hooks/usePos'

/**
 * Historial de días, solo para el administrador.
 *
 * Es la pantalla que contesta "cómo venimos", que es una pregunta del dueño y
 * no del encargado. Se calcula sobre lo que hay en la copia local del aparato:
 * la sincronización baja el movimiento de los últimos 90 días, así que más
 * atrás de eso no hay nada que mostrar, y conviene que se diga en pantalla en
 * vez de dejar creer que el negocio no vendió nada en marzo.
 */
export function HistorialView({ pos, onVerDia }: { pos: Pos; onVerDia: () => void }) {
  const dias = useMemo(() => {
    const conMovimiento = new Set<string>()
    for (const v of pos.ventas) if (v.estado !== 'anulada') conMovimiento.add(v.dia)
    for (const a of pos.abonos) conMovimiento.add(a.dia)

    return [...conMovimiento]
      .sort((a, b) => b.localeCompare(a))
      .map((dia) =>
        calcularCierre({
          dia,
          ventas: pos.ventas,
          abonos: pos.abonos,
          metodosPago: pos.snapshot?.metodosPago ?? [],
        }),
      )
  }, [pos.ventas, pos.abonos, pos.snapshot])

  const total = useMemo(
    () => ({
      vendido: dias.reduce((s, c) => s + c.vendidoHoy, 0),
      caja: dias.reduce((s, c) => s + c.entroEnCaja, 0),
      margen: dias.reduce((s, c) => s + c.margen, 0),
    }),
    [dias],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {dias.length > 0 && (
        <div className="shrink-0 border-b border-linea bg-panel px-4 py-2.5">
          <p className="font-mono text-[9.5px] tracking-[0.16em] text-apagado uppercase">
            {dias.length} {dias.length === 1 ? 'día con movimiento' : 'días con movimiento'}
          </p>
          <div className="flex gap-5 pt-1">
            <Dato etiqueta="Vendido" valor={formato(total.vendido, 'USD')} />
            <Dato etiqueta="Entró en caja" valor={formato(total.caja, 'USD')} />
            <Dato etiqueta="Margen" valor={formato(total.margen, 'USD')} tono="verde" />
          </div>
        </div>
      )}

      <div className="scroll-y min-h-0 flex-1">
        {dias.length === 0 ? (
          <p className="px-6 py-14 text-center text-[14px] leading-relaxed text-apagado">
            Todavía no hay ningún día cerrado.
            <br />
            Carga la venta de hoy desde Cierre y aparecerá aquí.
          </p>
        ) : (
          <ul>
            {dias.map((c) => (
              <li key={c.dia}>
                <button
                  onClick={() => {
                    pos.setDia(c.dia)
                    onVerDia()
                  }}
                  className={`w-full border-b border-linea px-4 py-3 text-left ${
                    c.dia === pos.dia ? 'bg-panel2' : ''
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[15px] font-semibold">{textoCorto(c.dia)}</span>
                    <span className="tabular text-[16px] font-bold text-cobre2">
                      {formato(c.vendidoHoy, 'USD')}
                    </span>
                  </div>
                  <p className="flex flex-wrap items-center gap-x-3 pt-0.5 font-mono text-[10.5px] text-apagado">
                    <span>caja {formato(c.entroEnCaja, 'USD')}</span>
                    <span className="text-verde">margen {formato(c.margen, 'USD')}</span>
                    {c.creditoHoy > 0 && (
                      <span className="text-ambar">crédito {formato(c.creditoHoy, 'USD')}</span>
                    )}
                    <span>{c.unidades} u.</span>
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="px-6 py-4 text-center text-[12px] leading-relaxed text-apagado">
          Se muestra lo que hay en este aparato. La sincronización baja el movimiento de los
          últimos 90 días.
        </p>
      </div>
    </div>
  )
}

function Dato({
  etiqueta,
  valor,
  tono,
}: {
  etiqueta: string
  valor: string
  tono?: 'verde'
}) {
  return (
    <div>
      <p className="font-mono text-[9px] tracking-[0.14em] text-apagado uppercase">{etiqueta}</p>
      <p className={`tabular text-[14px] font-bold ${tono === 'verde' ? 'text-verde' : ''}`}>
        {valor}
      </p>
    </div>
  )
}
