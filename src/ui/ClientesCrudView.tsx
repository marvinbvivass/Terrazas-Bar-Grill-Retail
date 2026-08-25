import { useMemo, useState } from 'react'
import { formato } from '../domain/money'
import type { Cliente } from '../domain/types'
import type { Pos } from '../hooks/usePos'
import { HojaCliente } from './HojaCliente'

/**
 * Clientes: agregar, editar y dar de baja.
 *
 * Separada de CXC a propósito. CXC responde "quién me debe y cuánto"; esta
 * responde "quién es quién". Mezclarlas hacía que la única forma de crear un
 * cliente fuera empezar una venta a crédito, que es justo cuando no hay tiempo
 * de escribir un teléfono.
 */
export function ClientesCrudView({ pos }: { pos: Pos }) {
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [creando, setCreando] = useState(false)

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return pos.clientes
      .filter(
        (c) =>
          q === '' ||
          c.nombre.toLowerCase().includes(q) ||
          (c.telefono ?? '').includes(q) ||
          (c.documento ?? '').toLowerCase().includes(q),
      )
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [pos.clientes, busqueda])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-3 pt-3">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar cliente…"
          className="w-full rounded-xl border border-linea bg-panel2 px-3 py-2.5 placeholder:text-apagado"
          aria-label="Buscar cliente"
        />
      </div>

      <ul className="scroll-y mt-2 min-h-0 flex-1">
        {pos.clientes.length === 0 && (
          <li className="px-5 py-12 text-center text-[14px] leading-relaxed text-apagado">
            Todavía no hay clientes.
            <br />
            Solo hacen falta para las ventas a crédito: quien paga de contado no hay que
            registrarlo.
          </li>
        )}

        {pos.clientes.length > 0 && visibles.length === 0 && (
          <li className="px-5 py-10 text-center text-[14px] text-apagado">
            Ningún cliente coincide con «{busqueda.trim()}».
          </li>
        )}

        {visibles.map((c) => {
          const saldo = pos.saldoDe(c.id)
          return (
            <li key={c.id}>
              <button
                onClick={() => setEditando(c)}
                className="w-full border-b border-linea px-4 py-3 text-left"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[15px] font-semibold">{c.nombre}</span>
                  <span
                    className={`tabular shrink-0 text-[14px] font-bold ${
                      saldo > 0 ? 'text-cobre2' : 'text-apagado'
                    }`}
                  >
                    {saldo > 0 ? formato(saldo, 'USD') : 'al día'}
                  </span>
                </div>
                <p className="truncate pt-0.5 font-mono text-[10.5px] text-apagado">
                  {c.telefono ?? 'sin teléfono'}
                  {c.limiteCredito > 0 && ` · tope ${formato(c.limiteCredito, 'USD')}`}
                  {c.nota && ` · ${c.nota}`}
                </p>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="shrink-0 border-t border-linea bg-panel px-3 py-2.5">
        <button
          onClick={() => setCreando(true)}
          className="w-full rounded-xl bg-cobre py-3.5 text-[16px] font-bold text-fondo"
        >
          + Nuevo cliente
        </button>
      </div>

      {creando && <HojaCliente pos={pos} cliente={null} onCerrar={() => setCreando(false)} />}
      {editando && (
        <HojaCliente pos={pos} cliente={editando} onCerrar={() => setEditando(null)} />
      )}
    </div>
  )
}
