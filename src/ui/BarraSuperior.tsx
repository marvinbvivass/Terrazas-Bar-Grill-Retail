import { useState } from 'react'
import { hoy, sumarDias } from '../domain/dias'
import { salir } from '../data/firebase'
import { ChipMoneda } from './moneda'
import { TasasSheet } from './TasasSheet'
import type { Pos } from '../hooks/usePos'

/**
 * Barra superior para teléfono.
 *
 * Cabe en una sola fila porque en un móvil en vertical no hay ancho para más.
 * Lo único que ocupa el centro es el día de trabajo: como el día se puede
 * cambiar, si no está visible las ventas terminan cargadas en la fecha
 * equivocada y el cierre de ayer cambia solo.
 */
export function BarraSuperior({ pos }: { pos: Pos }) {
  const [tasas, setTasas] = useState(false)
  const [menu, setMenu] = useState(false)
  const esHoy = pos.dia === hoy()

  const fecha = new Date(`${pos.dia}T12:00:00`)
  const etiqueta = esHoy
    ? 'Hoy'
    : fecha.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <>
      <header className="pad-arriba shrink-0 border-b border-linea bg-panel">
        <div className="flex items-center gap-1 px-2 py-2">
          <button
            onClick={() => pos.setDia(sumarDias(pos.dia, -1))}
            className="h-10 w-9 rounded-lg text-[20px] text-tinta2"
            aria-label="Día anterior"
          >
            ‹
          </button>

          <div className="min-w-0 flex-1 text-center">
            <p className="font-mono text-[9px] tracking-[0.16em] text-apagado uppercase">
              Día de trabajo
            </p>
            <label className="relative block">
              <span
                className={`block truncate text-[15px] font-bold ${esHoy ? 'text-tinta' : 'text-cobre2'}`}
              >
                {etiqueta}
              </span>
              {/* El input nativo va encima e invisible: abre el calendario de
                  Android al tocar, sin heredar su aspecto de escritorio. */}
              <input
                type="date"
                value={pos.dia}
                max={hoy()}
                onChange={(e) => e.target.value && pos.setDia(e.target.value)}
                className="absolute inset-0 h-full w-full opacity-0"
                aria-label="Elegir día de trabajo"
              />
            </label>
          </div>

          <button
            onClick={() => pos.setDia(sumarDias(pos.dia, 1))}
            disabled={esHoy}
            className="h-10 w-9 rounded-lg text-[20px] text-tinta2 disabled:opacity-25"
            aria-label="Día siguiente"
          >
            ›
          </button>

          <ChipMoneda />

          <button
            onClick={() => void pos.sincronizar(false)}
            disabled={pos.sincronizando || !pos.enLinea}
            aria-label={estadoSync(pos)}
            title={estadoSync(pos)}
            className="flex h-10 w-8 items-center justify-center"
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                !pos.enLinea || pos.errorSync
                  ? 'bg-alerta'
                  : pos.sincronizando
                    ? 'animate-pulse bg-cobre'
                    : pos.pendientes > 0
                      ? 'bg-ambar'
                      : 'bg-verde'
              }`}
            />
          </button>

          <button
            onClick={() => setMenu((v) => !v)}
            className="h-10 w-8 text-[19px] leading-none text-apagado"
            aria-label="Más opciones"
          >
            ⋮
          </button>
        </div>

        {/* Una franja solo cuando hay algo que decir. Ocupar alto permanente
            con "Al día" en una pantalla de teléfono es desperdiciarlo. */}
        {(!pos.enLinea || pos.errorSync || pos.pendientes > 0) && (
          <div
            className={`px-3 pb-1.5 text-center font-mono text-[10.5px] tracking-wider uppercase ${
              pos.errorSync || !pos.enLinea ? 'text-alerta' : 'text-ambar'
            }`}
          >
            {estadoSync(pos)}
          </div>
        )}
      </header>

      {menu && (
        <>
          <button
            className="fixed inset-0 z-40"
            aria-label="Cerrar menú"
            onClick={() => setMenu(false)}
          />
          <div className="pad-arriba fixed top-0 right-2 z-50 mt-12 w-52 overflow-hidden rounded-xl border border-linea2 bg-panel2 shadow-2xl">
            <OpcionMenu
              onClick={() => {
                setMenu(false)
                setTasas(true)
              }}
            >
              Tasas del día
            </OpcionMenu>
            <OpcionMenu
              onClick={() => {
                setMenu(false)
                void pos.sincronizar(true)
              }}
            >
              Sincronizar ahora
            </OpcionMenu>
            <OpcionMenu peligro onClick={() => void salir()}>
              Cerrar sesión
            </OpcionMenu>
          </div>
        </>
      )}

      {tasas && <TasasSheet pos={pos} onCerrar={() => setTasas(false)} />}
    </>
  )
}

function estadoSync(pos: Pos): string {
  if (!pos.enLinea) return 'Sin señal · se guarda aquí'
  if (pos.sincronizando) return 'Subiendo…'
  if (pos.errorSync) return `Falló al subir: ${pos.errorSync}`
  if (pos.pendientes > 0) return `${pos.pendientes} por subir`
  return 'Al día'
}

function OpcionMenu({
  onClick,
  peligro,
  children,
}: {
  onClick: () => void
  peligro?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full border-b border-linea px-4 py-3 text-left text-[15px] last:border-b-0 ${
        peligro ? 'text-alerta' : 'text-tinta'
      }`}
    >
      {children}
    </button>
  )
}
