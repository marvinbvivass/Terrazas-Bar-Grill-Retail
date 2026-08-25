import { useState } from 'react'
import { formatoNumero, parsearMonto } from '../domain/money'
import type { Pos } from '../hooks/usePos'

/**
 * Barra de estado. Tiene que responder de un vistazo las tres preguntas que se
 * hace un cajero cuando algo va raro: quién soy, hay señal, y cuántas ventas
 * faltan por subir.
 */
export function StatusBar({ pos }: { pos: Pos }) {
  const [editandoTasa, setEditandoTasa] = useState(false)
  const [borrador, setBorrador] = useState('')

  const tasa = pos.snapshot?.tasas.VES ?? 0

  function guardar() {
    const n = parsearMonto(borrador)
    if (n > 0) void pos.actualizarTasa(n)
    setEditandoTasa(false)
  }

  return (
    <header className="flex items-center gap-4 border-b border-linea bg-panel px-4 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[10px] tracking-[0.16em] text-apagado uppercase">Caja 1</span>
        <span className="text-sm font-semibold">{pos.snapshot?.usuarioNombre ?? '—'}</span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        {/* Tasa del día. Con cortes frecuentes, la tasa cacheada puede quedar vieja. */}
        {editandoTasa ? (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] tracking-[0.12em] text-apagado uppercase">Tasa</span>
            <input
              autoFocus
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              onBlur={guardar}
              onKeyDown={(e) => {
                if (e.key === 'Enter') guardar()
                if (e.key === 'Escape') setEditandoTasa(false)
              }}
              inputMode="decimal"
              className="tabular w-24 rounded border border-cobre bg-panel2 px-2 py-1 text-right text-sm"
            />
          </div>
        ) : (
          <button
            onClick={() => {
              setBorrador(String(tasa))
              setEditandoTasa(true)
            }}
            className="flex items-center gap-1.5 rounded border border-linea px-2.5 py-1 hover:border-linea2"
            title="Cambiar la tasa del día"
          >
            <span className="font-mono text-[10px] tracking-[0.12em] text-apagado uppercase">Tasa</span>
            <span className="tabular text-sm font-semibold">{formatoNumero(tasa, 'VES')}</span>
          </button>
        )}

        {/* Cola de salida */}
        <div
          className={`flex items-center gap-1.5 rounded px-2.5 py-1 ${
            pos.pendientes > 0 ? 'bg-cobre/15 text-cobre2' : 'text-apagado'
          }`}
          title="Ventas cobradas que todavía no llegaron al servidor"
        >
          <span className="font-mono text-[10px] tracking-[0.12em] uppercase">Por subir</span>
          <span className="tabular text-sm font-semibold">{pos.pendientes}</span>
        </div>

        {/* Estado de conexión */}
        <div
          className={`flex items-center gap-2 rounded px-2.5 py-1 ${
            pos.enLinea ? 'bg-verde/12 text-verde' : 'bg-alerta/15 text-alerta'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${pos.enLinea ? 'bg-verde' : 'bg-alerta'}`}
            aria-hidden
          />
          <span className="font-mono text-[11px] font-medium tracking-[0.08em] uppercase">
            {pos.enLinea ? 'En línea' : 'Sin señal · se vende igual'}
          </span>
        </div>
      </div>
    </header>
  )
}
