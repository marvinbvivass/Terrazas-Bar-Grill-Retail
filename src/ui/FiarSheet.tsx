import { useMemo, useState } from 'react'
import { formato } from '../domain/money'
import type { Pos } from '../hooks/usePos'

/**
 * Elegir a quién se le fía.
 *
 * Los clientes del sistema son solo los de confianza: el que paga de contado no
 * se registra. Por eso esta lista es corta y muestra el saldo de cada uno — es
 * la información que decide si se le fía otra vez o no.
 */
export function FiarSheet({ pos, onCerrar }: { pos: Pos; onCerrar: () => void }) {
  const [busqueda, setBusqueda] = useState('')
  const [creando, setCreando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [limite, setLimite] = useState('')
  const [guardando, setGuardando] = useState(false)

  const total = pos.totales.total

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return pos.resumenClientes.filter(
      (r) => q === '' || r.cliente.nombre.toLowerCase().includes(q),
    )
  }, [pos.resumenClientes, busqueda])

  async function fiarA(clienteId: string) {
    setGuardando(true)
    await pos.registrar(clienteId)
    setGuardando(false)
    onCerrar()
  }

  async function crearYFiar() {
    if (!nombre.trim()) return
    setGuardando(true)
    const cliente = await pos.crearCliente({
      nombre: nombre.trim(),
      documento: null,
      telefono: telefono.trim() || null,
      limiteCredito: Number(limite) || 0,
      nota: null,
    })
    await pos.registrar(cliente.id)
    setGuardando(false)
    onCerrar()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-linea2 bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-linea px-5 py-3">
          <div>
            <h2 className="text-lg font-bold">Fiar esta venta</h2>
            <p className="tabular font-mono text-[11px] text-apagado">
              {formato(total, 'USD')} · día {pos.dia}
            </p>
          </div>
          <button
            onClick={onCerrar}
            className="rounded px-3 py-1.5 font-mono text-[11px] tracking-wider text-apagado uppercase hover:text-tinta"
          >
            Esc
          </button>
        </div>

        {creando ? (
          <div className="space-y-3 px-5 py-4">
            <label className="block">
              <span className="font-mono text-[10px] tracking-[0.12em] text-apagado uppercase">
                Nombre
              </span>
              <input
                autoFocus
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Como lo conocen en el local"
                className="mt-1 w-full rounded-md border border-linea2 bg-panel2 px-3.5 py-2.5 focus:border-cobre"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="font-mono text-[10px] tracking-[0.12em] text-apagado uppercase">
                  Teléfono
                </span>
                <input
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="opcional"
                  className="mt-1 w-full rounded-md border border-linea2 bg-panel2 px-3.5 py-2.5 focus:border-cobre"
                />
              </label>
              <label className="block">
                <span className="font-mono text-[10px] tracking-[0.12em] text-apagado uppercase">
                  Tope de fiado
                </span>
                <input
                  value={limite}
                  onChange={(e) => setLimite(e.target.value)}
                  inputMode="decimal"
                  placeholder="0 = sin tope"
                  className="tabular mt-1 w-full rounded-md border border-linea2 bg-panel2 px-3.5 py-2.5 text-right focus:border-cobre"
                />
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setCreando(false)}
                className="rounded-lg border border-linea2 px-4 py-2.5 text-[14px] text-tinta2 hover:border-linea2"
              >
                Volver
              </button>
              <button
                disabled={!nombre.trim() || guardando}
                onClick={() => void crearYFiar()}
                className="flex-1 rounded-lg bg-cobre py-2.5 text-[14px] font-bold text-fondo disabled:bg-panel3 disabled:text-apagado"
              >
                Crear y fiar
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="border-b border-linea px-5 py-3">
              <input
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar cliente…"
                className="w-full rounded-md border border-linea bg-panel2 px-3.5 py-2.5 placeholder:text-apagado focus:border-cobre"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {visibles.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-apagado">
                  Ningún cliente con ese nombre.
                </p>
              ) : (
                <ul className="divide-y divide-linea">
                  {visibles.map((r) => {
                    const quedaria = r.saldo + total
                    const pasaria = r.cliente.limiteCredito > 0 && quedaria > r.cliente.limiteCredito
                    return (
                      <li key={r.cliente.id}>
                        <button
                          disabled={guardando}
                          onClick={() => void fiarA(r.cliente.id)}
                          className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-panel2 disabled:opacity-50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14.5px] font-semibold">{r.cliente.nombre}</p>
                            <p className="tabular font-mono text-[10.5px] text-apagado">
                              {r.saldo > 0
                                ? `debe ${formato(r.saldo, 'USD')} en ${r.ventasAbiertas} venta${r.ventasAbiertas > 1 ? 's' : ''}`
                                : 'sin deuda'}
                              {r.cliente.limiteCredito > 0 && ` · tope ${formato(r.cliente.limiteCredito, 'USD')}`}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="tabular text-[13px] font-semibold">
                              → {formato(quedaria, 'USD')}
                            </p>
                            {pasaria && (
                              <p className="font-mono text-[9.5px] tracking-wider text-ambar uppercase">
                                pasa del tope
                              </p>
                            )}
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            <div className="border-t border-linea px-5 py-3">
              <button
                onClick={() => setCreando(true)}
                className="w-full rounded-lg border border-linea2 py-2.5 text-[14px] font-semibold text-tinta2 hover:border-cobre hover:text-cobre2"
              >
                Cliente nuevo
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
