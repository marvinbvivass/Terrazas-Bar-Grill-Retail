import { useMemo, useState } from 'react'
import { presentacionDeRetorno, productosConEnvase, saldoCliente, totalDe } from '../domain/vacios'
import { parsearMonto } from '../domain/money'
import type { UUID } from '../domain/types'
import type { Pos } from '../hooks/usePos'
import { Hoja } from './Hoja'

/**
 * Vacíos: los envases retornables que circulan.
 *
 * TODO SE CUENTA EN CAJAS, que es como los mueve el distribuidor: el camión no
 * recibe cuatrocientas ochenta botellas sueltas, recibe trece gaveras.
 *
 * Dos deudas que van en direcciones contrarias y nunca se suman entre sí. El
 * local le debe cajas a la compañía; los clientes le deben cajas al local.
 * Verlas juntas en un solo número sería como restar lo que debes de lo que te
 * deben y creer que estás en paz.
 */
export function VaciosView({ pos }: { pos: Pos }) {
  const [hoja, setHoja] = useState<'ninguna' | 'compania' | 'cliente'>('ninguna')
  const s = pos.snapshot

  const conEnvase = useMemo(() => productosConEnvase(s?.productos ?? []), [s])
  const nombreDe = (id: UUID) => s?.productos.find((p) => p.id === id)?.nombreCorto ?? 'Producto'

  const debemos = totalDe(pos.vaciosCompania)
  const nosDeben = pos.vaciosDeudores.reduce((x, d) => x + d.total, 0)

  if (!s) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid shrink-0 grid-cols-2 gap-px border-b border-linea bg-linea">
        <Cabecera
          etiqueta="Cajas que le debemos al camión"
          valor={debemos}
          tono={debemos > 0 ? 'alerta' : 'verde'}
        />
        <Cabecera
          etiqueta="Cajas que deben los clientes"
          valor={nosDeben}
          tono={nosDeben > 0 ? 'ambar' : 'verde'}
        />
      </div>

      <div className="scroll-y min-h-0 flex-1 px-3 py-3">
        {conEnvase.length === 0 && (
          <p className="rounded-xl border border-linea bg-panel px-4 py-4 text-center text-[13.5px] leading-relaxed text-apagado">
            Ningún producto está marcado como retornable. Marca la casilla en el catálogo de los
            que llevan envase y aparecerán aquí.
          </p>
        )}

        {pos.vaciosCompania.size > 0 && (
          <section className="mb-3 overflow-hidden rounded-xl border border-linea bg-panel">
            <h2 className="border-b border-linea px-3.5 py-2 font-mono text-[10px] tracking-[0.16em] text-apagado uppercase">
              Cajas pendientes con la compañía
            </h2>
            <div className="px-3.5 py-1">
              {[...pos.vaciosCompania].map(([productoId, cantidad]) => (
                <div key={productoId} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="truncate text-[13.5px]">{nombreDe(productoId)}</span>
                  <span
                    className={`tabular shrink-0 text-[15px] font-bold ${
                      cantidad > 0 ? 'text-alerta' : 'text-verde'
                    }`}
                  >
                    {cantidad > 0
                      ? `${cantidad} ${cantidad === 1 ? 'caja' : 'cajas'}`
                      : `${-cantidad} a favor`}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="overflow-hidden rounded-xl border border-linea bg-panel">
          <h2 className="border-b border-linea px-3.5 py-2 font-mono text-[10px] tracking-[0.16em] text-apagado uppercase">
            Clientes con cajas pendientes
          </h2>
          {pos.vaciosDeudores.length === 0 ? (
            <p className="px-3.5 py-5 text-center text-[13px] text-apagado">
              Ningún cliente debe cajas.
            </p>
          ) : (
            <ul>
              {pos.vaciosDeudores.map((d) => (
                <li
                  key={d.clienteId}
                  className="flex items-baseline justify-between gap-3 border-b border-linea px-3.5 py-2.5 last:border-b-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">
                      {pos.clientes.find((c) => c.id === d.clienteId)?.nombre ?? 'Cliente'}
                    </p>
                    <p className="truncate font-mono text-[10.5px] text-apagado">
                      {[...d.porProducto]
                        .map(([pid, n]) => `${nombreDe(pid)} ${n}`)
                        .join(' · ')}
                    </p>
                  </div>
                  <span className="tabular shrink-0 text-[16px] font-bold text-ambar">
                    {d.total}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="px-1 pt-4 text-center text-[12px] leading-relaxed text-apagado">
          Todo va en cajas, como lo cuenta el camión. Las dos deudas van en direcciones
          contrarias y no se restan entre sí: que un cliente te deba tres cajas no paga las que le
          debes al distribuidor.
        </p>
      </div>

      <div className="shrink-0 border-t border-linea bg-panel px-3 py-2.5">
        <div className="flex gap-2">
          <button
            onClick={() => setHoja('compania')}
            disabled={conEnvase.length === 0}
            className="flex-1 rounded-xl bg-cobre py-3 text-[14.5px] font-bold text-fondo disabled:opacity-40"
          >
            Con la compañía
          </button>
          <button
            onClick={() => setHoja('cliente')}
            disabled={conEnvase.length === 0 || pos.clientes.length === 0}
            className="flex-1 rounded-xl border border-linea2 py-3 text-[14.5px] font-semibold text-tinta2 disabled:opacity-40"
          >
            Con un cliente
          </button>
        </div>
      </div>

      {hoja === 'compania' && <HojaCompania pos={pos} onCerrar={() => setHoja('ninguna')} />}
      {hoja === 'cliente' && <HojaClienteVacios pos={pos} onCerrar={() => setHoja('ninguna')} />}
    </div>
  )
}

function Cabecera({
  etiqueta,
  valor,
  tono,
}: {
  etiqueta: string
  valor: number
  tono: 'alerta' | 'ambar' | 'verde'
}) {
  const color = tono === 'alerta' ? 'text-alerta' : tono === 'ambar' ? 'text-ambar' : 'text-verde'
  return (
    <div className="bg-panel px-3.5 py-2.5">
      <p className="font-mono text-[9px] tracking-[0.14em] text-apagado uppercase">{etiqueta}</p>
      <p className={`tabular text-[24px] leading-tight font-extrabold ${color}`}>{valor}</p>
    </div>
  )
}

/** Movimiento con la compañía: lo que dejó el camión y lo que se le devolvió */
function HojaCompania({ pos, onCerrar }: { pos: Pos; onCerrar: () => void }) {
  const conEnvase = productosConEnvase(pos.snapshot?.productos ?? [])
  const [campos, setCampos] = useState<Record<string, { dejados: string; devueltos: string }>>({})
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)

  const entradas = conEnvase.map((p) => ({
    productoId: p.id,
    dejados: Math.max(0, Math.floor(parsearMonto(campos[p.id]?.dejados ?? ''))),
    devueltos: Math.max(0, Math.floor(parsearMonto(campos[p.id]?.devueltos ?? ''))),
  }))
  const hayAlgo = entradas.some((e) => e.dejados !== e.devueltos)

  async function guardar() {
    setGuardando(true)
    await pos.moverVaciosCompania(entradas, { nota })
    setGuardando(false)
    onCerrar()
  }

  return (
    <Hoja
      titulo="Vacíos con la compañía"
      onCerrar={onCerrar}
      pie={
        <button
          onClick={() => void guardar()}
          disabled={guardando || !hayAlgo}
          className="w-full rounded-xl bg-cobre py-3.5 text-[16px] font-bold text-fondo disabled:opacity-40"
        >
          {guardando ? 'Guardando…' : 'Guardar movimiento'}
        </button>
      }
    >
      <p className="pb-3 text-[13.5px] leading-relaxed text-tinta2">
        Todo en <b>cajas</b>. <b>Dejó</b> son las cajas que vinieron llenas en este despacho y
        vas a tener que devolver. <b>Se llevó</b> son las cajas de vacíos que el camión sacó del
        patio.
      </p>

      <div className="flex flex-col gap-2">
        <div className="flex gap-2 px-1 pb-0.5">
          <span className="flex-1" />
          <span className="w-20 text-center font-mono text-[9.5px] tracking-[0.12em] text-apagado uppercase">
            Dejó (cajas)
          </span>
          <span className="w-20 text-center font-mono text-[9.5px] tracking-[0.12em] text-apagado uppercase">
            Se llevó (cajas)
          </span>
        </div>
        {conEnvase.map((p) => (
          <div key={p.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
              {p.nombreCorto}
              <CajaDe pos={pos} productoId={p.id} />
            </span>
            <input
              value={campos[p.id]?.dejados ?? ''}
              onChange={(e) =>
                setCampos((x) => ({
                  ...x,
                  [p.id]: { devueltos: x[p.id]?.devueltos ?? '', dejados: e.target.value },
                }))
              }
              inputMode="numeric"
              placeholder="0"
              className="tabular h-11 w-20 rounded-lg border border-linea bg-panel2 text-center font-bold"
              aria-label={`Cajas que dejó de ${p.nombreCorto}`}
            />
            <input
              value={campos[p.id]?.devueltos ?? ''}
              onChange={(e) =>
                setCampos((x) => ({
                  ...x,
                  [p.id]: { dejados: x[p.id]?.dejados ?? '', devueltos: e.target.value },
                }))
              }
              inputMode="numeric"
              placeholder="0"
              className="tabular h-11 w-20 rounded-lg border border-linea bg-panel2 text-center font-bold"
              aria-label={`Cajas que se llevó de ${p.nombreCorto}`}
            />
          </div>
        ))}
      </div>

      <input
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Nota (opcional): número de guía, chofer…"
        className="mt-3 w-full rounded-xl border border-linea bg-panel2 px-3 py-2.5 placeholder:text-apagado"
        aria-label="Nota"
      />
    </Hoja>
  )
}

/** Movimiento con un cliente: lo que se llevó y lo que trajo */
function HojaClienteVacios({ pos, onCerrar }: { pos: Pos; onCerrar: () => void }) {
  const conEnvase = productosConEnvase(pos.snapshot?.productos ?? [])
  const [clienteId, setClienteId] = useState<UUID>('')
  const [campos, setCampos] = useState<Record<string, { seLlevo: string; trajo: string }>>({})
  const [guardando, setGuardando] = useState(false)

  const deuda = useMemo(
    () => (clienteId ? saldoCliente(clienteId, pos.vacios) : new Map<UUID, number>()),
    [clienteId, pos.vacios],
  )

  const entradas = conEnvase.map((p) => ({
    productoId: p.id,
    seLlevo: Math.max(0, Math.floor(parsearMonto(campos[p.id]?.seLlevo ?? ''))),
    trajo: Math.max(0, Math.floor(parsearMonto(campos[p.id]?.trajo ?? ''))),
  }))
  const hayAlgo = entradas.some((e) => e.seLlevo !== e.trajo)

  async function guardar() {
    if (!clienteId) return
    setGuardando(true)
    await pos.moverVaciosCliente(clienteId, entradas)
    setGuardando(false)
    onCerrar()
  }

  return (
    <Hoja
      titulo="Vacíos de un cliente"
      onCerrar={onCerrar}
      pie={
        <button
          onClick={() => void guardar()}
          disabled={guardando || !clienteId || !hayAlgo}
          className="w-full rounded-xl bg-cobre py-3.5 text-[16px] font-bold text-fondo disabled:opacity-40"
        >
          {guardando ? 'Guardando…' : 'Guardar movimiento'}
        </button>
      }
    >
      <select
        value={clienteId}
        onChange={(e) => setClienteId(e.target.value)}
        className="w-full rounded-xl border border-linea bg-panel2 px-3 py-3 text-[15px]"
        aria-label="Cliente"
      >
        <option value="">Elegir cliente…</option>
        {pos.clientes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>

      {clienteId && (
        <p className="pt-2 text-[12.5px] text-apagado">
          {deuda.size === 0
            ? 'No debe cajas.'
            : `Debe ${[...deuda]
                .map(
                  ([pid, n]) =>
                    `${n} ${n === 1 ? 'caja' : 'cajas'} de ${
                      pos.snapshot?.productos.find((p) => p.id === pid)?.nombreCorto ?? ''
                    }`,
                )
                .join(', ')}.`}
        </p>
      )}

      <div className="flex flex-col gap-2 pt-3">
        <div className="flex gap-2 px-1 pb-0.5">
          <span className="flex-1" />
          <span className="w-20 text-center font-mono text-[9.5px] tracking-[0.12em] text-apagado uppercase">
            Se llevó (cajas)
          </span>
          <span className="w-20 text-center font-mono text-[9.5px] tracking-[0.12em] text-apagado uppercase">
            Trajo (cajas)
          </span>
        </div>
        {conEnvase.map((p) => (
          <div key={p.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
              {p.nombreCorto}
              <CajaDe pos={pos} productoId={p.id} />
            </span>
            <input
              value={campos[p.id]?.seLlevo ?? ''}
              onChange={(e) =>
                setCampos((x) => ({
                  ...x,
                  [p.id]: { trajo: x[p.id]?.trajo ?? '', seLlevo: e.target.value },
                }))
              }
              inputMode="numeric"
              placeholder="0"
              className="tabular h-11 w-20 rounded-lg border border-linea bg-panel2 text-center font-bold"
              aria-label={`Cajas que se llevó de ${p.nombreCorto}`}
            />
            <input
              value={campos[p.id]?.trajo ?? ''}
              onChange={(e) =>
                setCampos((x) => ({
                  ...x,
                  [p.id]: { seLlevo: x[p.id]?.seLlevo ?? '', trajo: e.target.value },
                }))
              }
              inputMode="numeric"
              placeholder="0"
              className="tabular h-11 w-20 rounded-lg border border-linea bg-panel2 text-center font-bold"
              aria-label={`Cajas que trajo de ${p.nombreCorto}`}
            />
          </div>
        ))}
      </div>

      <p className="px-1 pt-3 text-center text-[12px] leading-relaxed text-apagado">
        Todo en cajas. El que llega con dos cajas de vacíos y se lleva dos llenas no queda
        debiendo nada: escribe dos y dos, y no se guarda movimiento.
      </p>
    </Hoja>
  )
}

/** De cuántas unidades es la caja de ese producto, como referencia */
function CajaDe({ pos, productoId }: { pos: Pos; productoId: UUID }) {
  const pres = presentacionDeRetorno(pos.snapshot?.presentacionesPorProducto.get(productoId) ?? [])
  if (!pres) return null
  return (
    <span className="pl-1.5 font-mono text-[10px] text-apagado">
      {pres.nombre} &times;{pres.factor}
    </span>
  )
}
