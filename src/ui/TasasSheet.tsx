import { useState } from 'react'
import { Hoja } from './Hoja'
import { MONEDAS, formatoNumero, parsearMonto } from '../domain/money'
import type { MonedaCodigo } from '../domain/types'
import type { Pos } from '../hooks/usePos'

const EDITABLES: MonedaCodigo[] = ['VES', 'COP']

/**
 * Las tasas del día.
 *
 * Se cargan las dos juntas y no una por barra superior, porque en la práctica
 * se actualizan a la vez: el encargado mira el cambio del día por la mañana y
 * teclea los dos números seguidos.
 *
 * La tasa se expresa como CUÁNTOS BOLÍVARES (o pesos) VALE UN DÓLAR, que es
 * como se dice en la calle. Al revés — dólares por bolívar — sería un número
 * con seis ceros a la derecha de la coma que nadie puede teclear sin error.
 */
export function TasasSheet({ pos, onCerrar }: { pos: Pos; onCerrar: () => void }) {
  const tasas = pos.snapshot?.tasas ?? {}
  const [borrador, setBorrador] = useState<Record<string, string>>(() =>
    Object.fromEntries(EDITABLES.map((m) => [m, tasas[m] ? String(tasas[m]) : ''])),
  )
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setGuardando(true)
    for (const m of EDITABLES) {
      const n = parsearMonto(borrador[m] ?? '')
      if (n > 0 && n !== tasas[m]) await pos.actualizarTasa(m, n)
    }
    setGuardando(false)
    onCerrar()
  }

  return (
    <Hoja
      titulo="Tasas del día"
      onCerrar={onCerrar}
      pie={
        <button
          onClick={() => void guardar()}
          disabled={guardando}
          className="w-full rounded-xl bg-cobre py-3.5 text-[16px] font-bold text-fondo disabled:opacity-60"
        >
          {guardando ? 'Guardando…' : 'Guardar tasas'}
        </button>
      }
    >
      <p className="pb-3 text-[13.5px] leading-relaxed text-tinta2">
        Los precios se cargan en dólares. Estas tasas son las que se usan para verlos y cobrarlos
        en otra moneda.
      </p>

      <div className="flex flex-col gap-3">
        {EDITABLES.map((m) => (
          <label key={m} className="flex flex-col gap-1.5">
            <span className="font-mono text-[11px] tracking-[0.12em] text-apagado uppercase">
              {MONEDAS[m].nombre} por dólar
            </span>
            <div className="flex items-center gap-2 rounded-xl border border-linea bg-panel2 px-3 focus-within:border-cobre">
              <span className="font-mono text-[13px] text-apagado">{MONEDAS[m].simbolo}</span>
              <input
                value={borrador[m] ?? ''}
                onChange={(e) => setBorrador((b) => ({ ...b, [m]: e.target.value }))}
                inputMode="decimal"
                placeholder="0"
                className="tabular w-full bg-transparent py-3 text-right text-[19px] font-bold"
                aria-label={`Tasa de ${MONEDAS[m].nombre}`}
              />
            </div>
            {(tasas[m] ?? 0) > 0 && (
              <span className="text-right text-[12px] text-apagado">
                ahora: {formatoNumero(tasas[m] ?? 0, m)} por $1
              </span>
            )}
          </label>
        ))}
      </div>

      <p className="pt-4 pb-2 text-[12.5px] leading-relaxed text-apagado">
        Si una tasa queda en cero, la aplicación no convierte esa moneda y lo dice en pantalla en
        vez de inventar un número.
      </p>
    </Hoja>
  )
}
