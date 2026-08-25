import { useMemo, useState } from 'react'
import { crearPago, TASA_IGTF } from '../domain/cart'
import { planificarAbono, planificarAbonoDirigido, type VentaConSaldo } from '../domain/credito'
import { MONEDAS, convertir, formato, formatoNumero, parsearMonto } from '../domain/money'
import { textoCorto } from '../domain/dias'
import type { MetodoPago, Pago, UUID } from '../domain/types'
import type { Pos } from '../hooks/usePos'
import { HojaCliente } from './HojaCliente'

/**
 * CXC · cuentas por cobrar: quién debe, cuánto, desde cuándo, y cómo se cobra.
 *
 * Un abono se reparte de la venta más vieja a la más nueva, que es como
 * funciona una cuenta de bodega. Si el cliente quiere pagar una venta concreta,
 * se marcan a mano y el reparto se limita a esas.
 */
export function ClientesView({ pos }: { pos: Pos }) {
  const [abierto, setAbierto] = useState<UUID | null>(null)
  const [creando, setCreando] = useState(false)

  const resumen = pos.resumenClientes
  const activo = resumen.find((r) => r.cliente.id === abierto) ?? null

  /*
   * Lista o detalle, nunca los dos a la vez.
   *
   * La versión anterior ponía una columna de 340 px al lado del detalle, que
   * en un teléfono en vertical no cabe: dejaba el detalle en unos 40 px de
   * ancho. En móvil el patrón es entrar y volver.
   */
  if (activo) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <button
          onClick={() => setAbierto(null)}
          className="flex shrink-0 items-center gap-1.5 border-b border-linea bg-panel px-3 py-2 text-left text-[14px] text-tinta2"
        >
          <span className="text-[18px] leading-none">‹</span> Todas las cuentas
        </button>
        <CuentaCliente key={activo.cliente.id} pos={pos} clienteId={activo.cliente.id} />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-baseline justify-between border-b border-linea bg-panel px-4 py-3">
        <span className="font-mono text-[10px] tracking-[0.16em] text-apagado uppercase">
          Por cobrar
        </span>
        <span className="tabular text-[19px] font-bold text-cobre2">
          {formato(pos.carteraTotal, 'USD')}
        </span>
      </div>

      <ul className="scroll-y min-h-0 flex-1">
        {resumen.length === 0 && (
          <li className="px-4 py-10 text-center text-[14px] leading-relaxed text-apagado">
            Todavía no hay clientes con crédito.
            <br />
            Créalos aquí y después cárgales ventas desde Venta → A crédito.
          </li>
        )}
        {resumen.map((r) => (
          <li key={r.cliente.id}>
            <button
              onClick={() => setAbierto(r.cliente.id)}
              className="w-full border-b border-linea px-4 py-3 text-left"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[15px] font-semibold">{r.cliente.nombre}</span>
                <span
                  className={`tabular text-[15px] font-bold ${
                    r.saldo > 0 ? 'text-cobre2' : 'text-apagado'
                  }`}
                >
                  {formato(r.saldo, 'USD')}
                </span>
              </div>
              <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[10.5px] text-apagado">
                {r.saldo > 0 ? (
                  <>
                    <span>
                      {r.ventasAbiertas} venta{r.ventasAbiertas > 1 ? 's' : ''}
                    </span>
                    {r.masVieja > 0 && <span>· más vieja {r.masVieja} d</span>}
                  </>
                ) : (
                  <span>al día</span>
                )}
                {r.sobreLimite && (
                  <span className="rounded bg-ambar/15 px-1.5 py-px tracking-wider text-ambar uppercase">
                    pasó el tope
                  </span>
                )}
              </p>
            </button>
          </li>
        ))}
      </ul>

      <div className="shrink-0 border-t border-linea bg-panel px-3 py-2.5">
        <button
          onClick={() => setCreando(true)}
          className="w-full rounded-xl border border-cobre py-3 text-[15px] font-bold text-cobre2"
        >
          + Nuevo cliente
        </button>
      </div>

      {creando && <HojaCliente pos={pos} cliente={null} onCerrar={() => setCreando(false)} />}
    </div>
  )
}

function CuentaCliente({ pos, clienteId }: { pos: Pos; clienteId: UUID }) {
  const cliente = pos.clientes.find((c) => c.id === clienteId)!
  const abiertas = pos.ventasAbiertasDe(clienteId)
  const saldo = abiertas.reduce((s, x) => s + x.saldo, 0)

  const [elegidas, setElegidas] = useState<UUID[]>([])
  const [monto, setMonto] = useState('')
  const [cobrando, setCobrando] = useState(false)

  const montoNum = parsearMonto(monto)

  // Sin ventas marcadas, el abono va de la más vieja a la más nueva.
  // Con ventas marcadas, solo a esas.
  const plan = useMemo(() => {
    if (montoNum <= 0) return null
    return elegidas.length > 0
      ? planificarAbonoDirigido(abiertas, elegidas, montoNum)
      : planificarAbono(abiertas, montoNum)
  }, [abiertas, elegidas, montoNum])

  const totalElegidas = abiertas
    .filter((x) => elegidas.includes(x.venta.id))
    .reduce((s, x) => s + x.saldo, 0)

  function alternar(ventaId: UUID) {
    setElegidas((prev) => {
      const siguiente = prev.includes(ventaId)
        ? prev.filter((x) => x !== ventaId)
        : [...prev, ventaId]
      const total = abiertas
        .filter((x) => siguiente.includes(x.venta.id))
        .reduce((s, x) => s + x.saldo, 0)
      setMonto(total > 0 ? formatoNumero(total, 'USD') : '')
      return siguiente
    })
  }

  async function registrarCobro(pagos: Pago[]) {
    if (!plan) return
    setCobrando(true)
    await pos.cobrar(clienteId, plan, pagos)
    setCobrando(false)
    setMonto('')
    setElegidas([])
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-linea px-5 py-3.5">
        <div>
          <h2 className="text-xl font-bold">{cliente.nombre}</h2>
          <p className="font-mono text-[11px] text-apagado">
            {cliente.telefono ?? 'sin teléfono'}
            {cliente.limiteCredito > 0 && ` · tope ${formato(cliente.limiteCredito, 'USD')}`}
            {cliente.nota && ` · ${cliente.nota}`}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] tracking-[0.12em] text-apagado uppercase">Debe</p>
          <p className="tabular text-2xl leading-tight font-bold text-cobre2">
            {formato(saldo, 'USD')}
          </p>
          <p className="tabular font-mono text-[11px] text-apagado">
            {formato(saldo * (pos.snapshot?.tasas.VES ?? 0), 'VES')}
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {abiertas.length === 0 ? (
          <p className="py-8 text-center text-sm text-apagado">
            Este cliente está al día. No debe nada.
          </p>
        ) : (
          <>
            <div className="mb-2 flex items-baseline justify-between">
              <p className="font-mono text-[10px] tracking-[0.14em] text-apagado uppercase">
                Ventas sin pagar
              </p>
              {elegidas.length > 0 && (
                <button
                  onClick={() => {
                    setElegidas([])
                    setMonto('')
                  }}
                  className="font-mono text-[10px] tracking-wider text-apagado uppercase hover:text-tinta"
                >
                  Quitar selección
                </button>
              )}
            </div>

            <ul className="divide-y divide-linea rounded-lg border border-linea">
              {abiertas.map((x) => (
                <FilaVentaAbierta
                  key={x.venta.id}
                  x={x}
                  pos={pos}
                  elegida={elegidas.includes(x.venta.id)}
                  saldara={plan?.saldadas.includes(x.venta.id) ?? false}
                  parcialDe={plan?.parcial?.ventaId === x.venta.id ? plan.parcial.saldoRestante : null}
                  onAlternar={() => alternar(x.venta.id)}
                />
              ))}
            </ul>

            {elegidas.length > 0 && (
              <p className="tabular mt-2 font-mono text-[11px] text-cobre2">
                {elegidas.length} venta{elegidas.length > 1 ? 's' : ''} marcada
                {elegidas.length > 1 ? 's' : ''} · {formato(totalElegidas, 'USD')}
              </p>
            )}
          </>
        )}
      </div>

      {abiertas.length > 0 && (
        <FormularioCobro
          pos={pos}
          monto={monto}
          onMonto={setMonto}
          saldo={saldo}
          plan={plan}
          cobrando={cobrando}
          onCobrar={registrarCobro}
        />
      )}
    </div>
  )
}

function FilaVentaAbierta({
  x,
  pos,
  elegida,
  saldara,
  parcialDe,
  onAlternar,
}: {
  x: VentaConSaldo
  pos: Pos
  elegida: boolean
  saldara: boolean
  parcialDe: number | null
  onAlternar: () => void
}) {
  const resumen = x.venta.lineas
    .map((l) => {
      const p = pos.snapshot?.productos.find((y) => y.id === l.productoId)
      return `${l.cantidad}× ${p?.nombreCorto ?? '?'}`
    })
    .join(', ')

  return (
    <li>
      <button
        onClick={onAlternar}
        className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors ${
          elegida ? 'bg-cobre/8' : 'hover:bg-panel2'
        }`}
      >
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] ${
            elegida ? 'border-cobre bg-cobre text-fondo' : 'border-linea2'
          }`}
          aria-hidden
        >
          {elegida ? '✓' : ''}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2">
            <span className="tabular font-mono text-[11px] text-apagado">
              {textoCorto(x.venta.dia)}
            </span>
            <span className="truncate text-[13px] text-tinta2">{resumen}</span>
          </p>
          <p className="font-mono text-[10px] text-apagado">
            hace {x.antiguedad} día{x.antiguedad === 1 ? '' : 's'}
            {x.abonado > 0 && ` · ya abonó ${formato(x.abonado, 'USD')}`}
          </p>
        </div>

        <div className="text-right">
          <p className="tabular text-[14px] font-bold">{formato(x.saldo, 'USD')}</p>
          {saldara && (
            <p className="font-mono text-[9.5px] tracking-wider text-verde uppercase">queda saldada</p>
          )}
          {parcialDe !== null && (
            <p className="font-mono text-[9.5px] tracking-wider text-ambar uppercase">
              queda en {formato(parcialDe, 'USD')}
            </p>
          )}
        </div>
      </button>
    </li>
  )
}

function FormularioCobro({
  pos,
  monto,
  onMonto,
  saldo,
  plan,
  cobrando,
  onCobrar,
}: {
  pos: Pos
  monto: string
  onMonto: (v: string) => void
  saldo: number
  plan: ReturnType<typeof planificarAbono> | null
  cobrando: boolean
  onCobrar: (pagos: Pago[]) => void
}) {
  const s = pos.snapshot!
  const tasa = s.tasas.VES ?? 1
  const [metodo, setMetodo] = useState<MetodoPago>(s.metodosPago[0]!)
  const [referencia, setReferencia] = useState('')

  const tasaDe = (m: MetodoPago) => (m.moneda === 'USD' ? 1 : tasa)
  const faltaReferencia = metodo.requiereReferencia && !referencia.trim()

  function cobrar() {
    if (!plan || plan.aplicado <= 0 || faltaReferencia) return
    const pago = crearPago({
      metodo,
      montoAplicado: plan.aplicado,
      tasa: tasaDe(metodo),
      referencia: referencia || null,
    })
    onCobrar([pago])
    setReferencia('')
  }

  const enMoneda = plan
    ? convertir(plan.aplicado * (metodo.aplicaIgtf ? 1 + TASA_IGTF : 1), metodo.moneda, tasaDe(metodo))
    : 0

  return (
    <div className="border-t border-linea bg-panel px-5 py-3.5">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="block font-mono text-[10px] tracking-[0.12em] whitespace-nowrap text-apagado uppercase">
            Abona $
          </span>
          <input
            value={monto}
            onChange={(e) => onMonto(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && cobrar()}
            inputMode="decimal"
            placeholder="0,00"
            className="tabular mt-1 w-32 rounded-md border border-linea2 bg-panel2 px-3 py-2.5 text-right text-xl font-bold focus:border-cobre"
          />
        </label>

        <button
          onClick={() => onMonto(formatoNumero(saldo, 'USD'))}
          className="rounded-md border border-linea2 px-3 py-2.5 font-mono text-[11px] tracking-wider text-tinta2 uppercase hover:border-cobre hover:text-cobre2"
        >
          Todo
        </button>

        <label className="block min-w-[150px] flex-1">
          <span className="font-mono text-[10px] tracking-[0.12em] text-apagado uppercase">
            Con qué paga
          </span>
          <select
            value={metodo.id}
            onChange={(e) => setMetodo(s.metodosPago.find((m) => m.id === e.target.value)!)}
            className="mt-1 w-full rounded-md border border-linea2 bg-panel2 px-3 py-2.5 text-[14px] focus:border-cobre"
          >
            {s.metodosPago.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre} ({MONEDAS[m.moneda].simbolo})
              </option>
            ))}
          </select>
        </label>

        {metodo.requiereReferencia && (
          <label className="block">
            <span className="font-mono text-[10px] tracking-[0.12em] text-apagado uppercase">
              Referencia
            </span>
            <input
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              placeholder="últimos dígitos"
              className="mt-1 w-32 rounded-md border border-linea2 bg-panel2 px-3 py-2.5 focus:border-cobre"
            />
          </label>
        )}

        <button
          disabled={!plan || plan.aplicado <= 0 || faltaReferencia || cobrando}
          onClick={cobrar}
          className="ml-auto rounded-lg bg-verde px-6 py-3 text-[14px] font-bold text-fondo hover:brightness-110 disabled:cursor-not-allowed disabled:bg-panel3 disabled:text-apagado"
        >
          {cobrando ? 'Guardando…' : `Cobrar en el día ${pos.dia}`}
        </button>
      </div>

      {plan && plan.aplicado > 0 && (
        <p className="tabular mt-2 font-mono text-[11px] text-apagado">
          Entra {formato(enMoneda, metodo.moneda)}
          {metodo.aplicaIgtf && ` (incluye IGTF ${formato(plan.aplicado * TASA_IGTF, 'USD')})`}
          {' · '}
          {plan.saldadas.length > 0 && `salda ${plan.saldadas.length} venta${plan.saldadas.length > 1 ? 's' : ''}`}
          {plan.parcial && `${plan.saldadas.length > 0 ? ' y deja' : 'deja'} una en ${formato(plan.parcial.saldoRestante, 'USD')}`}
          {plan.sobrante > 0 && (
            <span className="text-ambar"> · sobran {formato(plan.sobrante, 'USD')}, no se registran</span>
          )}
        </p>
      )}
    </div>
  )
}
