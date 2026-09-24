import { useState } from 'react'
import { CierreDiaView } from './CierreDiaView'
import { CierreView } from './CierreView'
import type { Pos } from '../hooks/usePos'

/**
 * El cierre del día, en dos mitades.
 *
 * CARGAR es donde se teclea: cuánto se vendió de cada producto y cuánto entró
 * en cada moneda. RESUMEN es lo que sale de eso: las dos cifras del día, el
 * desglose por método y el margen.
 *
 * Van juntas y no en dos sitios del menú porque son el mismo acto: se carga y
 * se mira si cuadró. Separarlas obligaría a salir y volver a entrar para
 * comprobar lo que se acaba de escribir.
 */
export function CierrePantalla({ pos }: { pos: Pos }) {
  const [parte, setParte] = useState<'cargar' | 'resumen'>('cargar')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 gap-1 border-b border-linea bg-panel px-3 py-2">
        <Mitad activa={parte === 'cargar'} onClick={() => setParte('cargar')}>
          Cargar
        </Mitad>
        <Mitad activa={parte === 'resumen'} onClick={() => setParte('resumen')}>
          Resumen
        </Mitad>
      </div>

      {parte === 'cargar' ? <CierreDiaView pos={pos} /> : <CierreView pos={pos} />}
    </div>
  )
}

function Mitad({
  activa,
  onClick,
  children,
}: {
  activa: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg py-2 text-[14.5px] font-semibold ${
        activa ? 'bg-cobre text-fondo' : 'bg-panel2 text-tinta2'
      }`}
    >
      {children}
    </button>
  )
}
