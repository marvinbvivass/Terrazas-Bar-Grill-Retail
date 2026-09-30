import { useState } from 'react'
import { hoy } from '../domain/dias'
import { salir } from '../data/firebase'
import { ChipMoneda } from './moneda'
import type { Pos } from '../hooks/usePos'
import type { Rol } from '../domain/types'

/**
 * Barra superior para teléfono.
 *
 * Cabe en una fila porque en un móvil en vertical no hay ancho para más. Debajo
 * va el día de trabajo, que se puede mover: si no estuviera visible, las ventas
 * terminarían cargadas en la fecha equivocada y el cierre de ayer cambiaría
 * solo.
 */
export function BarraSuperior({
  pos,
  titulo,
  rol,
  onAtras,
}: {
  pos: Pos
  /** Nombre de la pantalla. En el menú va el nombre del negocio. */
  titulo: string
  rol: Rol
  /** null en el menú: no hay a dónde volver */
  onAtras: (() => void) | null
}) {
  const [menu, setMenu] = useState(false)
  const esHoy = pos.dia === hoy()

  const fecha = new Date(`${pos.dia}T12:00:00`)
  const etiqueta = fecha.toLocaleDateString('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <>
      <header className="pad-arriba shrink-0 border-b border-linea bg-panel/85 backdrop-blur-md">
        <div className="flex items-center gap-1 px-2 py-1.5">
          {onAtras ? (
            <button
              onClick={onAtras}
              className="h-10 w-9 text-[24px] leading-none text-tinta2"
              aria-label="Volver al menú"
            >
              ‹
            </button>
          ) : (
            <span className="w-2" />
          )}

          <h1 className="min-w-0 flex-1 truncate text-[17px] font-bold">{titulo}</h1>

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
            con "Al día" en la pantalla de un teléfono es desperdiciarlo. */}
        {/*
          La aplicación trabaja SIEMPRE en el día de hoy. El selector de fecha
          que había aquí se retiró: tenerlo permanente invitaba a dejarlo movido
          sin querer, y entonces la venta siguiente se cargaba en la fecha
          equivocada. Para mirar atrás está Historial, que no cambia el día de
          trabajo. Esta franja solo aparece en el caso excepcional de estar
          cargando un día atrasado a propósito.
        */}
        {!esHoy && (
          <button
            onClick={() => pos.volverAHoy()}
            className="w-full border-t border-ambar/40 bg-ambar/15 px-3 py-1.5 text-center text-[12.5px] font-semibold text-ambar"
          >
            Cargando el {etiqueta} · toca para volver a hoy
          </button>
        )}

        {(!pos.enLinea || pos.errorSync || pos.pendientes > 0) && (
          <div
            className={`px-3 pb-1 text-center font-mono text-[10.5px] tracking-wider uppercase ${
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
          <div className="pad-arriba fixed top-0 right-2 z-50 mt-12 w-56 overflow-hidden rounded-xl border border-linea2 bg-panel2 shadow-2xl">
            <p className="border-b border-linea px-4 py-2 font-mono text-[10px] tracking-[0.12em] text-apagado uppercase">
              {rol === 'administrador' ? 'Administrador' : 'Encargado'}
            </p>
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
