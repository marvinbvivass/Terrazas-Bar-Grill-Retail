import { useMemo, useState } from 'react'
import { MONEDAS, formatoNumero, parsearMonto } from '../domain/money'
import { hoy, textoCorto, textoLargo } from '../domain/dias'
import { Calendario } from './Calendario'
import { historialDeTasas, tasaExactaDe, tasasVigentes, variacion } from '../domain/tasas'
import type { MonedaCodigo } from '../domain/types'
import type { Pos } from '../hooks/usePos'

const EDITABLES: MonedaCodigo[] = ['VES', 'COP']

/**
 * Tasas del día, con calendario.
 *
 * Antes solo existía la tasa de hoy y se pisaba cada mañana, así que cargar un
 * día atrasado lo cobraba con el cambio de esta mañana y un cierre viejo dejaba
 * de poder releerse. Ahora cada día guarda la suya y se puede ir a cualquier
 * fecha a consultarla o corregirla.
 *
 * La fecha de esta pantalla es SUYA y no la barra superior: se viene aquí a
 * arreglar la tasa del martes sin querer mover el día de trabajo, y moverlo
 * sin darse cuenta haría que la próxima venta se cargara en martes.
 */
export function TasasView({ pos }: { pos: Pos }) {
  const [fecha, setFecha] = useState(pos.dia)
  const [borrador, setBorrador] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)

  const historial = useMemo(() => historialDeTasas(pos.tasasDia), [pos.tasasDia])
  const rigen = useMemo(() => tasasVigentes(fecha, pos.tasasDia), [fecha, pos.tasasDia])

  /** Los días que tienen tasa propia, para marcarlos en el calendario */
  const conTasa = useMemo(() => new Set(pos.tasasDia.map((t) => t.dia)), [pos.tasasDia])

  const esHoy = fecha === hoy()
  const futuro = fecha > hoy()

  /** Lo que se muestra en cada casilla: lo tecleado, o lo que rige ese día */
  function valorDe(m: MonedaCodigo): string {
    if (borrador[m] !== undefined) return borrador[m]!
    const exacta = tasaExactaDe(fecha, m, pos.tasasDia)
    return exacta ? String(exacta.tasa) : ''
  }

  function cambiarFecha(nueva: string) {
    setFecha(nueva)
    // El borrador es de la fecha anterior: dejarlo haría que al guardar se
    // copiara la tasa de un día al siguiente sin que nadie lo pidiera.
    setBorrador({})
  }

  async function guardar() {
    setGuardando(true)
    for (const m of EDITABLES) {
      const texto = borrador[m]
      if (texto === undefined) continue
      const n = parsearMonto(texto)
      const exacta = tasaExactaDe(fecha, m, pos.tasasDia)
      if (n > 0 && n !== exacta?.tasa) await pos.actualizarTasa(m, n, fecha)
    }
    setBorrador({})
    setGuardando(false)
  }

  const hayCambios = EDITABLES.some((m) => {
    const texto = borrador[m]
    if (texto === undefined) return false
    const n = parsearMonto(texto)
    return n > 0 && n !== tasaExactaDe(fecha, m, pos.tasasDia)?.tasa
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-linea bg-panel px-3 py-2">
        <span className="truncate text-[15px] font-bold first-letter:uppercase">
          {textoLargo(fecha)}
        </span>
        {!esHoy && (
          <button
            onClick={() => cambiarFecha(hoy())}
            className="shrink-0 rounded-lg border border-cobre px-2.5 py-1 font-mono text-[10px] tracking-wider text-cobre2 uppercase"
            style={{ minHeight: 0 }}
          >
            Hoy
          </button>
        )}
      </div>

      <div className="scroll-y min-h-0 flex-1 px-3 py-3">
        <Calendario valor={fecha} onElegir={cambiarFecha} marcados={conTasa} />

        {/* Leyenda: sin ella el relleno azul es un color bonito y nada más. */}
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-1 pt-2 pb-3">
          <span className="flex items-center gap-1.5 text-[11.5px] text-apagado">
            <span className="h-3.5 w-3.5 rounded-full bg-cobre/20 ring-1 ring-cobre/40" />
            con tasa cargada
          </span>
          <span className="flex items-center gap-1.5 text-[11.5px] text-apagado">
            <span className="h-3.5 w-3.5 rounded-full ring-2 ring-cobre ring-inset" />
            hoy
          </span>
          <span className="flex items-center gap-1.5 text-[11.5px] text-apagado">
            <span className="h-3.5 w-3.5 rounded-full bg-cobre" />
            día que estás viendo
          </span>
        </div>

        <p className="px-1 pb-3 text-center text-[11.5px] leading-relaxed text-apagado">
          {conTasa.size === 0
            ? 'Todavía no has cargado ninguna tasa. Elige un día y escribe el cambio.'
            : `${conTasa.size} ${conTasa.size === 1 ? 'día tiene' : 'días tienen'} tasa propia. Los demás usan la del último día cargado.`}
        </p>

        {futuro && (
          <p className="mb-3 rounded-xl border border-ambar/50 bg-ambar/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-ambar">
            Estás en una fecha futura. Puedes dejar la tasa cargada por adelantado, pero hasta que
            llegue ese día no la va a usar nadie.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {EDITABLES.map((m) => {
            const exacta = tasaExactaDe(fecha, m, pos.tasasDia)
            const rige = rigen[m]
            const cambio = exacta ? variacion(fecha, m, pos.tasasDia) : null
            return (
              <div key={m} className="rounded-xl border border-linea bg-panel px-3 py-3">
                <div className="flex items-baseline justify-between gap-2 pb-1.5">
                  <span className="font-mono text-[11px] tracking-[0.12em] text-apagado uppercase">
                    {MONEDAS[m].nombre} por dólar
                  </span>
                  {cambio !== null && Math.abs(cambio) >= 0.05 && (
                    <span
                      className={`tabular font-mono text-[11px] font-bold ${
                        Math.abs(cambio) > 50 ? 'text-alerta' : 'text-apagado'
                      }`}
                    >
                      {cambio > 0 ? '+' : ''}
                      {cambio.toFixed(1)}%
                    </span>
                  )}
                </div>

                <input
                  value={valorDe(m)}
                  onChange={(e) => setBorrador((x) => ({ ...x, [m]: e.target.value }))}
                  inputMode="decimal"
                  placeholder={rige ? formatoNumero(rige, m) : '0'}
                  className="tabular w-full rounded-lg border border-linea bg-panel2 px-3 py-3 text-right text-[19px] font-bold focus:border-cobre"
                  aria-label={`Tasa de ${MONEDAS[m].nombre} para ${fecha}`}
                />

                <p className="pt-1.5 text-[12px] leading-relaxed text-apagado">
                  {exacta
                    ? 'Cargada para este día.'
                    : rige
                      ? `Sin tasa propia: rige ${formatoNumero(rige, m)}, arrastrada del último día cargado.`
                      : 'Nunca se ha cargado una tasa para esta moneda.'}
                </p>
              </div>
            )
          })}
        </div>

        <p className="px-1 pt-3 text-[12px] leading-relaxed text-apagado">
          Si un día no tiene tasa propia, sigue corriendo la del último día cargado. Nunca se toma
          la de un día posterior: eso reescribiría hacia atrás un cierre que ya se hizo.
        </p>

        {/* Historial */}
        {historial.length > 0 && (
          <section className="mt-4 overflow-hidden rounded-xl border border-linea bg-panel">
            <h2 className="border-b border-linea px-3.5 py-2 font-mono text-[10px] tracking-[0.16em] text-apagado uppercase">
              Días con tasa cargada
            </h2>
            <ul>
              {historial.map((h) => (
                <li key={h.dia}>
                  <button
                    onClick={() => cambiarFecha(h.dia)}
                    className={`flex w-full items-baseline justify-between gap-3 border-b border-linea px-3.5 py-2.5 text-left last:border-b-0 ${
                      h.dia === fecha ? 'bg-cobre/10' : ''
                    }`}
                  >
                    <span className="truncate text-[13.5px] font-semibold">
                      {textoCorto(h.dia)}
                    </span>
                    <span className="tabular shrink-0 font-mono text-[12px] text-tinta2">
                      {h.tasas.VES ? `Bs ${formatoNumero(h.tasas.VES, 'VES')}` : '—'}
                      {' · '}
                      {h.tasas.COP ? `COL$ ${formatoNumero(h.tasas.COP, 'COP')}` : '—'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="shrink-0 border-t border-linea bg-panel px-3 py-2.5">
        <button
          onClick={() => void guardar()}
          disabled={guardando || !hayCambios}
          className="w-full rounded-xl bg-cobre py-3.5 text-[16px] font-bold text-fondo disabled:opacity-40"
        >
          {guardando
            ? 'Guardando…'
            : hayCambios
              ? `Guardar la tasa del ${textoCorto(fecha)}`
              : 'Sin cambios'}
        </button>
      </div>
    </div>
  )
}
