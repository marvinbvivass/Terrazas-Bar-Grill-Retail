import { useMemo, useState } from 'react'
import { productosConEnvase, saldoCliente } from '../domain/vacios'
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
 * Y TODO EN UNA SOLA BOLSA, sin distinguir producto. Si el camión deja diez
 * cajas de Solera Light y se lleva cinco de Pilsen y cinco de Tercio, se queda
 * en cero: la gavera es la gavera. Llevarlo por marca obligaba a decidir contra
 * qué deuda iba cada caja devuelta, que es una pregunta que en el patio nadie
 * se hace.
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

  const debemos = pos.vaciosCompania
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

        {debemos !== 0 && (
          <section className="mb-3 rounded-xl border border-linea bg-panel px-3.5 py-3">
            <p className="font-mono text-[10px] tracking-[0.16em] text-apagado uppercase">
              Con la compañía
            </p>
            <p
              className={`tabular pt-1 text-[15px] font-bold ${
                debemos > 0 ? 'text-alerta' : 'text-verde'
              }`}
            >
              {debemos > 0
                ? `${debemos} ${debemos === 1 ? 'caja pendiente' : 'cajas pendientes'} de devolver`
                : `${-debemos} ${debemos === -1 ? 'caja' : 'cajas'} a favor`}
            </p>
            {debemos < 0 && (
              <p className="pt-1 text-[12px] leading-relaxed text-apagado">
                Se devolvieron más de las que se recibieron. Se descuentan del próximo despacho.
              </p>
            )}
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
                  <p className="min-w-0 truncate text-[14px] font-semibold">
                    {pos.clientes.find((c) => c.id === d.clienteId)?.nombre ?? 'Cliente'}
                  </p>
                  <span
                    className={`tabular shrink-0 text-[16px] font-bold ${
                      d.total > 0 ? 'text-ambar' : 'text-verde'
                    }`}
                  >
                    {d.total > 0 ? d.total : `${-d.total} a favor`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="px-1 pt-4 text-center text-[12px] leading-relaxed text-apagado">
          Todo va en cajas, como lo cuenta el camión, y sin separar por marca: una gavera devuelta
          salda una gavera debida, sea del producto que sea. Las dos deudas van en direcciones
          contrarias y no se restan entre sí: que un cliente te deba tres cajas no paga las que le
          debes al distribuidor.
        </p>
      </div>

      <div className="shrink-0 border-t border-linea bg-panel px-3 py-2.5">
        <div className="flex gap-2">
          <button
            onClick={() => setHoja('compania')}
            className="flex-1 rounded-xl bg-cobre py-3 text-[14.5px] font-bold text-fondo"
          >
            Con la compañía
          </button>
          <button
            onClick={() => setHoja('cliente')}
            disabled={pos.clientes.length === 0}
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

/** Dos casillas: lo que dejó el camión y lo que se le devolvió */
function HojaCompania({ pos, onCerrar }: { pos: Pos; onCerrar: () => void }) {
  const [dejadas, setDejadas] = useState('')
  const [devueltas, setDevueltas] = useState('')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)

  const dejo = Math.max(0, Math.floor(parsearMonto(dejadas)))
  const llevo = Math.max(0, Math.floor(parsearMonto(devueltas)))
  const neto = dejo - llevo

  async function guardar() {
    setGuardando(true)
    await pos.moverVaciosCompania(dejo, llevo, { nota })
    setGuardando(false)
    onCerrar()
  }

  return (
    <Hoja
      titulo="Vacíos con la compañía"
      onCerrar={onCerrar}
      pie={
        <>
          <p className="pb-2 text-center text-[13px] text-apagado">
            {neto === 0
              ? 'La deuda queda igual'
              : neto > 0
                ? `Quedas debiendo ${neto} ${neto === 1 ? 'caja' : 'cajas'} más`
                : `Bajas la deuda en ${-neto} ${neto === -1 ? 'caja' : 'cajas'}`}
          </p>
          <button
            onClick={() => void guardar()}
            disabled={guardando || neto === 0}
            className="w-full rounded-xl bg-cobre py-3.5 text-[16px] font-bold text-fondo disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : 'Guardar movimiento'}
          </button>
        </>
      }
    >
      <p className="pb-4 text-[13.5px] leading-relaxed text-tinta2">
        Todo en <b>cajas</b>, sin separar por marca. <b>Dejó</b> son las cajas que vinieron llenas
        en este despacho y vas a tener que devolver. <b>Se llevó</b> son las cajas de vacíos que el
        camión sacó del patio, de la marca que sean.
      </p>

      <div className="flex gap-3">
        <Casilla etiqueta="Dejó" valor={dejadas} onCambio={setDejadas} />
        <Casilla etiqueta="Se llevó" valor={devueltas} onCambio={setDevueltas} />
      </div>

      <input
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Nota (opcional)"
        className="mt-4 w-full rounded-xl border border-linea bg-panel2 px-3 py-2.5 placeholder:text-apagado"
        aria-label="Nota"
      />
    </Hoja>
  )
}

/** Dos casillas: lo que se llevó el cliente y lo que trajo */
function HojaClienteVacios({ pos, onCerrar }: { pos: Pos; onCerrar: () => void }) {
  const [clienteId, setClienteId] = useState<UUID>('')
  const [seLlevo, setSeLlevo] = useState('')
  const [trajo, setTrajo] = useState('')
  const [guardando, setGuardando] = useState(false)

  const deuda = useMemo(
    () => (clienteId ? saldoCliente(clienteId, pos.vacios) : 0),
    [clienteId, pos.vacios],
  )

  const salieron = Math.max(0, Math.floor(parsearMonto(seLlevo)))
  const volvieron = Math.max(0, Math.floor(parsearMonto(trajo)))
  const neto = salieron - volvieron

  async function guardar() {
    if (!clienteId) return
    setGuardando(true)
    await pos.moverVaciosCliente(clienteId, salieron, volvieron)
    setGuardando(false)
    onCerrar()
  }

  return (
    <Hoja
      titulo="Vacíos de un cliente"
      onCerrar={onCerrar}
      pie={
        <>
          {clienteId !== '' && (
            <p className="pb-2 text-center text-[13px] text-apagado">
              {neto === 0 ? 'Su deuda queda igual' : `Queda en ${deuda + neto} cajas`}
            </p>
          )}
          <button
            onClick={() => void guardar()}
            disabled={guardando || !clienteId || neto === 0}
            className="w-full rounded-xl bg-cobre py-3.5 text-[16px] font-bold text-fondo disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : 'Guardar movimiento'}
          </button>
        </>
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

      {clienteId !== '' && (
        <p className="pt-2 text-[12.5px] text-apagado">
          {deuda === 0
            ? 'No debe cajas.'
            : deuda > 0
              ? `Debe ${deuda} ${deuda === 1 ? 'caja' : 'cajas'}.`
              : `Tiene ${-deuda} ${deuda === -1 ? 'caja' : 'cajas'} a favor.`}
        </p>
      )}

      <p className="pt-4 pb-3 text-[13.5px] leading-relaxed text-tinta2">
        En <b>cajas</b>. El que se toma la botella en el local no debe nada: el envase se queda
        aquí.
      </p>

      <div className="flex gap-3">
        <Casilla etiqueta="Se llevó" valor={seLlevo} onCambio={setSeLlevo} />
        <Casilla etiqueta="Trajo" valor={trajo} onCambio={setTrajo} />
      </div>
    </Hoja>
  )
}

function Casilla({
  etiqueta,
  valor,
  onCambio,
}: {
  etiqueta: string
  valor: string
  onCambio: (v: string) => void
}) {
  return (
    <label className="flex-1">
      <span className="block pb-1 text-center font-mono text-[10px] tracking-[0.12em] text-apagado uppercase">
        {etiqueta}
      </span>
      <input
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        inputMode="numeric"
        placeholder="0"
        className="tabular h-14 w-full rounded-xl border border-linea bg-panel2 text-center text-[22px] font-bold"
        aria-label={`${etiqueta}, en cajas`}
      />
    </label>
  )
}
