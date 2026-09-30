import { useMemo, useState } from 'react'
import {
  DIAS_SEMANA,
  mesAnterior,
  mesSiguiente,
  nombreDelMes,
  primerDiaDelMes,
  rejillaDelMes,
} from '../domain/calendario'
import { hoy, textoLargo } from '../domain/dias'
import type { DiaNegocio } from '../domain/types'

/**
 * Calendario de mes, dibujado por la aplicación.
 *
 * El selector nativo del teléfono abre un diálogo del sistema con sus propios
 * colores y su propio idioma, y encima tapa la pantalla entera. Este se ve
 * siempre, usa la paleta de la aplicación y —lo que de verdad importa— puede
 * marcar los días que tienen algo cargado, cosa que el nativo no sabe hacer.
 */
export function Calendario({
  valor,
  onElegir,
  marcados,
  maximo,
}: {
  valor: DiaNegocio
  onElegir: (dia: DiaNegocio) => void
  /** Días con algo cargado: se les pone un punto debajo */
  marcados?: Set<DiaNegocio>
  /** Último día que se puede elegir. Sin esto se puede ir al futuro. */
  maximo?: DiaNegocio
}) {
  const [ancla, setAncla] = useState(() => primerDiaDelMes(valor))
  const referencia = hoy()

  // Si el valor cambia desde fuera (un botón "Hoy", un renglón del historial),
  // el calendario tiene que saltar a ese mes en vez de quedarse donde estaba.
  const [ultimoValor, setUltimoValor] = useState(valor)
  if (valor !== ultimoValor) {
    setUltimoValor(valor)
    setAncla(primerDiaDelMes(valor))
  }

  const celdas = useMemo(() => rejillaDelMes(ancla, referencia), [ancla, referencia])

  return (
    <div className="rounded-xl border border-linea bg-panel">
      <div className="flex items-center justify-between gap-2 border-b border-linea px-2 py-2">
        <button
          onClick={() => setAncla(mesAnterior(ancla))}
          className="h-9 w-9 rounded-lg text-[19px] text-tinta2"
          aria-label="Mes anterior"
        >
          ‹
        </button>
        <span className="text-[14.5px] font-bold first-letter:uppercase">
          {nombreDelMes(ancla)}
        </span>
        <button
          onClick={() => setAncla(mesSiguiente(ancla))}
          className="h-9 w-9 rounded-lg text-[19px] text-tinta2"
          aria-label="Mes siguiente"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 px-1.5 pt-2">
        {DIAS_SEMANA.map((d) => (
          <span
            key={d}
            className="pb-1 text-center font-mono text-[10px] tracking-[0.06em] text-apagado"
          >
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5 px-1.5 pb-2">
        {celdas.map((c) => {
          const elegido = c.dia === valor
          const bloqueado = maximo !== undefined && c.dia > maximo
          const marcado = marcados?.has(c.dia) ?? false

          return (
            <button
              key={c.dia}
              onClick={() => !bloqueado && onElegir(c.dia)}
              disabled={bloqueado}
              aria-label={textoLargo(c.dia)}
              aria-current={elegido ? 'date' : undefined}
              className={[
                'relative flex aspect-square items-center justify-center rounded-full text-[14px]',
                /*
                 * Un día con dato cargado se rellena, no se marca con un punto
                 * y ya. El punto de cuatro píxeles que había antes existía en
                 * el código y no se veía en el teléfono, que para el caso es lo
                 * mismo que no estar. El relleno se distingue de un vistazo y
                 * el punto queda de refuerzo.
                 */
                elegido
                  ? 'bg-cobre font-bold text-white'
                  : marcado
                    ? 'bg-cobre/20 font-bold text-cobre2'
                    : c.delMes
                      ? 'font-medium text-tinta'
                      : 'text-apagado/60',
                // Hoy lleva aro, y se puede combinar con el relleno de arriba.
                c.esHoy && !elegido ? 'ring-2 ring-cobre ring-inset font-bold' : '',
                bloqueado ? 'opacity-25' : '',
              ].join(' ')}
              style={{ minHeight: 0 }}
            >
              {c.numero}
              {marcado && (
                <span
                  className={`absolute bottom-[3px] h-1.5 w-1.5 rounded-full ${
                    elegido ? 'bg-white' : 'bg-cobre'
                  }`}
                />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
