import { useState } from 'react'
import { formatoNumero, parsearMonto } from '../domain/money'
import { hoy, sumarDias, textoLargo } from '../domain/dias'
import { salir } from '../data/firebase'
import type { Pos } from '../hooks/usePos'

export type Vista = 'cuaderno' | 'clientes' | 'cierre' | 'catalogo'

/**
 * Barra superior.
 *
 * Lo más importante de esta barra es el selector de día, y por eso ocupa el
 * centro: como el encargado transcribe el cuaderno cuando puede, muchas veces
 * va a estar cargando el día anterior. Si el día de trabajo no está visible y
 * grande, las ventas del martes terminan en el cierre del miércoles.
 */
export function TopBar({
  pos,
  vista,
  onVista,
}: {
  pos: Pos
  vista: Vista
  onVista: (v: Vista) => void
}) {
  const [editandoTasa, setEditandoTasa] = useState(false)
  const [borrador, setBorrador] = useState('')

  const tasa = pos.snapshot?.tasas.VES ?? 0
  const esHoy = pos.dia === hoy()

  function guardarTasa() {
    const n = parsearMonto(borrador)
    if (n > 0) void pos.actualizarTasa(n)
    setEditandoTasa(false)
  }

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-linea bg-panel px-4 py-2">
      <nav className="flex gap-1" aria-label="Secciones">
        <Tab activo={vista === 'cuaderno'} onClick={() => onVista('cuaderno')}>
          Cuaderno
        </Tab>
        <Tab
          activo={vista === 'clientes'}
          onClick={() => onVista('clientes')}
          insignia={pos.carteraTotal > 0 ? `$${Math.round(pos.carteraTotal)}` : undefined}
        >
          Fiado
        </Tab>
        <Tab activo={vista === 'cierre'} onClick={() => onVista('cierre')}>
          Cierre
        </Tab>
        <Tab
          activo={vista === 'catalogo'}
          onClick={() => onVista('catalogo')}
          insignia={pos.snapshot && pos.snapshot.productos.length === 0 ? 'vacío' : undefined}
        >
          Catálogo
        </Tab>
      </nav>

      {/* Día de trabajo */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => pos.setDia(sumarDias(pos.dia, -1))}
          className="h-8 w-8 rounded border border-linea text-tinta2 hover:border-linea2"
          aria-label="Día anterior"
        >
          ‹
        </button>
        <div className="min-w-[190px] text-center">
          <p className="font-mono text-[9.5px] tracking-[0.14em] text-apagado uppercase">
            {esHoy ? 'Día de trabajo · hoy' : 'Día de trabajo'}
          </p>
          <input
            type="date"
            value={pos.dia}
            max={hoy()}
            onChange={(e) => e.target.value && pos.setDia(e.target.value)}
            className={`w-full bg-transparent text-center text-[14px] font-semibold ${
              esHoy ? 'text-tinta' : 'text-cobre2'
            }`}
            aria-label="Día de trabajo"
          />
        </div>
        <button
          onClick={() => pos.setDia(sumarDias(pos.dia, 1))}
          disabled={esHoy}
          className="h-8 w-8 rounded border border-linea text-tinta2 hover:border-linea2 disabled:opacity-30"
          aria-label="Día siguiente"
        >
          ›
        </button>
        {!esHoy && (
          <button
            onClick={() => pos.setDia(hoy())}
            className="rounded border border-cobre px-2 py-1 font-mono text-[10px] tracking-wider text-cobre2 uppercase"
          >
            Hoy
          </button>
        )}
      </div>

      <span className="hidden text-[12.5px] text-apagado lg:inline">{textoLargo(pos.dia)}</span>

      <div className="ml-auto flex items-center gap-2.5">
        {editandoTasa ? (
          <input
            autoFocus
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            onBlur={guardarTasa}
            onKeyDown={(e) => {
              if (e.key === 'Enter') guardarTasa()
              if (e.key === 'Escape') setEditandoTasa(false)
            }}
            inputMode="decimal"
            className="tabular w-24 rounded border border-cobre bg-panel2 px-2 py-1 text-right text-sm"
            aria-label="Tasa del día"
          />
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

        <button
          onClick={() => void pos.sincronizar(false)}
          disabled={pos.sincronizando || !pos.enLinea}
          title={
            pos.errorSync
              ? `Última sincronización falló: ${pos.errorSync}`
              : pos.ultimaSync
                ? `Al día desde las ${new Date(pos.ultimaSync).toLocaleTimeString('es-VE')}`
                : 'Todavía no ha sincronizado'
          }
          className={`flex items-center gap-2 rounded px-2.5 py-1 disabled:opacity-60 ${
            !pos.enLinea
              ? 'bg-alerta/15 text-alerta'
              : pos.errorSync
                ? 'bg-alerta/15 text-alerta'
                : pos.pendientes > 0
                  ? 'bg-cobre/15 text-cobre2'
                  : 'text-apagado hover:bg-panel2'
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              !pos.enLinea || pos.errorSync
                ? 'bg-alerta'
                : pos.sincronizando
                  ? 'animate-pulse bg-cobre'
                  : 'bg-verde'
            }`}
            aria-hidden
          />
          <span className="font-mono text-[11px] font-medium tracking-[0.08em] uppercase">
            {!pos.enLinea
              ? 'Sin señal'
              : pos.sincronizando
                ? 'Subiendo…'
                : pos.errorSync
                  ? 'Falló al subir'
                  : pos.pendientes > 0
                    ? `${pos.pendientes} por subir`
                    : 'Al día'}
          </span>
        </button>

        <button
          onClick={() => void salir()}
          className="rounded px-2 py-1 font-mono text-[10px] tracking-[0.1em] text-apagado uppercase hover:text-alerta"
          title="Cerrar sesión en este equipo"
        >
          Salir
        </button>
      </div>
    </header>
  )
}

function Tab({
  activo,
  onClick,
  insignia,
  children,
}: {
  activo: boolean
  onClick: () => void
  insignia?: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 rounded-md px-3.5 py-2 text-[14px] font-semibold transition-colors ${
        activo ? 'bg-cobre text-fondo' : 'text-tinta2 hover:bg-panel2 hover:text-tinta'
      }`}
    >
      {children}
      {insignia && (
        <span
          className={`tabular rounded px-1.5 py-px font-mono text-[10px] ${
            activo ? 'bg-fondo/25 text-fondo' : 'bg-cobre/15 text-cobre2'
          }`}
        >
          {insignia}
        </span>
      )}
    </button>
  )
}
