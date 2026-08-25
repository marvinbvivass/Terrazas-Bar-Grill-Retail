import { useEffect, useMemo, useState } from 'react'
import { crearPago, TASA_IGTF } from '../domain/cart'
import { MONEDAS, convertir, formato, formatoNumero, parsearMonto } from '../domain/money'
import type { MetodoPago } from '../domain/types'
import type { Pos } from '../hooks/usePos'

/**
 * Cómo se pagó la venta que se está transcribiendo.
 *
 * El pago mixto es la operación normal, no la excepción: mitad en efectivo
 * dólar y mitad en pago móvil es como se paga en Venezuela. Por eso se puede
 * agregar un pago tras otro hasta cubrir la venta.
 *
 * Sirve tanto para cargar una venta de contado del cuaderno como para registrar
 * el cobro de un fiado: en los dos casos lo que se captura es plata que entró.
 */
export function PaymentSheet({ pos, onCerrar }: { pos: Pos; onCerrar: () => void }) {
  const s = pos.snapshot!
  const t = pos.totales
  const tasa = s.tasas.VES ?? 1

  const [metodo, setMetodo] = useState<MetodoPago | null>(null)
  const [monto, setMonto] = useState('')
  const [entregado, setEntregado] = useState('')
  const [referencia, setReferencia] = useState('')
  const [cobrando, setCobrando] = useState(false)

  const tasaDe = (m: MetodoPago) => (m.moneda === 'USD' ? 1 : tasa)

  // Al elegir un método se propone el pendiente completo, que es el caso normal
  useEffect(() => {
    if (!metodo) return
    const pendienteEnMoneda = convertir(Math.max(t.pendiente, 0), metodo.moneda, tasaDe(metodo))
    setMonto(pendienteEnMoneda > 0 ? formatoNumero(pendienteEnMoneda, metodo.moneda) : '')
    setEntregado('')
    setReferencia('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metodo])

  /** Lo que el cajero teclea está en la moneda del método; el documento va en dólares */
  const montoAplicado = useMemo(() => {
    if (!metodo) return 0
    const enMoneda = parsearMonto(monto)
    const enBase = metodo.moneda === 'USD' ? enMoneda : enMoneda / tasaDe(metodo)
    // Lo tecleado incluye el IGTF, así que el abono real es lo tecleado entre 1,03
    return metodo.aplicaIgtf ? enBase / (1 + TASA_IGTF) : enBase
  }, [metodo, monto, tasa])

  const previo = useMemo(() => {
    if (!metodo || montoAplicado <= 0) return null
    return crearPago({
      metodo,
      montoAplicado,
      tasa: tasaDe(metodo),
      entregado: entregado ? parsearMonto(entregado) : null,
      referencia: referencia || null,
    })
  }, [metodo, montoAplicado, entregado, referencia, tasa])

  function confirmarPago() {
    if (!previo) return
    if (metodo?.requiereReferencia && !referencia.trim()) return
    pos.anadirPago(previo)
    setMetodo(null)
    setMonto('')
    setEntregado('')
    setReferencia('')
  }

  async function finalizar() {
    setCobrando(true)
    await pos.registrar(null)
    setCobrando(false)
    onCerrar()
  }

  const cubierto = t.pendiente <= 0 && pos.carrito.pagos.length > 0
  const faltaReferencia = Boolean(metodo?.requiereReferencia && !referencia.trim())

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-linea2 bg-panel shadow-2xl">
        <div className="flex items-center justify-between border-b border-linea px-5 py-3">
          <div>
            <h2 className="text-lg font-bold">Cómo pagó</h2>
            <p className="font-mono text-[11px] text-apagado">Venta de contado · día {pos.dia}</p>
          </div>
          <button
            onClick={onCerrar}
            className="rounded px-3 py-1.5 font-mono text-[11px] tracking-wider text-apagado uppercase hover:text-tinta"
          >
            Esc
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* Resumen */}
          <div className="grid grid-cols-3 gap-3">
            <Dato etiqueta="Total de la venta" valor={formato(t.total, 'USD')} />
            <Dato
              etiqueta="IGTF acumulado"
              valor={formato(t.igtf, 'USD')}
              tono={t.igtf > 0 ? 'cobre' : 'normal'}
            />
            <Dato
              etiqueta={t.pendiente > 0 ? 'Pendiente' : 'Cubierto'}
              valor={formato(Math.abs(t.pendiente), 'USD')}
              tono={t.pendiente > 0 ? 'alerta' : 'verde'}
              grande
            />
          </div>

          {t.pendiente > 0 && (
            <p className="tabular mt-2 font-mono text-[12px] text-apagado">
              Pendiente en bolívares: {formato(t.pendiente * tasa, 'VES')}
            </p>
          )}

          {/* Pagos ya registrados */}
          {pos.carrito.pagos.length > 0 && (
            <ul className="mt-4 divide-y divide-linea rounded-lg border border-linea">
              {pos.carrito.pagos.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold">{p.metodoNombre}</p>
                    <p className="tabular font-mono text-[10.5px] text-apagado">
                      abona {formato(p.montoAplicado, 'USD')}
                      {p.igtf > 0 && ` · IGTF ${formato(p.igtf, 'USD')}`}
                      {p.referencia && ` · ref ${p.referencia}`}
                      {p.vuelto > 0 && ` · vuelto ${formato(p.vuelto, p.moneda)}`}
                    </p>
                  </div>
                  <span className="tabular text-[14px] font-bold">
                    {formato(p.montoEnMoneda, p.moneda)}
                  </span>
                  <button
                    onClick={() => pos.removerPago(p.id)}
                    className="font-mono text-[10px] tracking-wider text-apagado uppercase hover:text-alerta"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Elegir método */}
          {!metodo && t.pendiente > 0 && (
            <div className="mt-4">
              <p className="mb-2 font-mono text-[10px] tracking-[0.14em] text-apagado uppercase">
                Con qué paga
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {s.metodosPago.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setMetodo(m)}
                    className="flex flex-col items-start rounded-lg border border-linea bg-panel2 px-3.5 py-3 text-left hover:border-cobre hover:bg-panel3"
                  >
                    <span className="text-[14px] font-semibold">{m.nombre}</span>
                    <span className="mt-0.5 font-mono text-[10px] text-apagado">
                      {MONEDAS[m.moneda].nombre}
                      {m.aplicaIgtf && ' · +IGTF 3%'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Capturar el monto */}
          {metodo && (
            <div className="mt-4 rounded-lg border border-cobre/40 bg-panel2 p-4">
              <div className="flex items-center justify-between">
                <p className="text-[15px] font-bold">{metodo.nombre}</p>
                <button
                  onClick={() => setMetodo(null)}
                  className="font-mono text-[10px] tracking-wider text-apagado uppercase hover:text-tinta"
                >
                  Cambiar
                </button>
              </div>

              <label className="mt-3 block">
                <span className="font-mono text-[10px] tracking-[0.12em] text-apagado uppercase">
                  Monto en {MONEDAS[metodo.moneda].nombre}
                  {metodo.aplicaIgtf && ' (IGTF incluido)'}
                </span>
                <input
                  autoFocus
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !faltaReferencia && confirmarPago()}
                  inputMode="decimal"
                  className="tabular mt-1 w-full rounded-md border border-linea2 bg-panel px-3.5 py-3 text-right text-2xl font-bold focus:border-cobre"
                />
              </label>

              {metodo.esEfectivo && (
                <label className="mt-3 block">
                  <span className="font-mono text-[10px] tracking-[0.12em] text-apagado uppercase">
                    Con cuánto paga (para el vuelto)
                  </span>
                  <input
                    value={entregado}
                    onChange={(e) => setEntregado(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && confirmarPago()}
                    inputMode="decimal"
                    placeholder="opcional"
                    className="tabular mt-1 w-full rounded-md border border-linea2 bg-panel px-3.5 py-2.5 text-right text-lg placeholder:text-[13px] placeholder:font-normal focus:border-cobre"
                  />
                </label>
              )}

              {metodo.requiereReferencia && (
                <label className="mt-3 block">
                  <span className="font-mono text-[10px] tracking-[0.12em] text-apagado uppercase">
                    Referencia
                  </span>
                  <input
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !faltaReferencia && confirmarPago()}
                    placeholder="últimos dígitos"
                    className="mt-1 w-full rounded-md border border-linea2 bg-panel px-3.5 py-2.5 focus:border-cobre"
                  />
                </label>
              )}

              {previo && (
                <div className="mt-3 space-y-1 border-t border-linea pt-3">
                  <FilaPrevia etiqueta="Abona a la factura" valor={formato(previo.montoAplicado, 'USD')} />
                  {previo.igtf > 0 && (
                    <FilaPrevia etiqueta="IGTF 3%" valor={formato(previo.igtf, 'USD')} tono="cobre" />
                  )}
                  <FilaPrevia
                    etiqueta={`Entra en caja (${metodo.moneda})`}
                    valor={formato(previo.montoEnMoneda, metodo.moneda)}
                  />
                  {previo.vuelto > 0 && (
                    <FilaPrevia
                      etiqueta="Vuelto"
                      valor={formato(previo.vuelto, metodo.moneda)}
                      tono="verde"
                    />
                  )}
                </div>
              )}

              <button
                disabled={!previo || faltaReferencia}
                onClick={confirmarPago}
                className="mt-3 w-full rounded-lg border border-cobre py-2.5 text-[14px] font-bold text-cobre2 hover:bg-cobre hover:text-fondo disabled:cursor-not-allowed disabled:border-linea disabled:text-apagado disabled:hover:bg-transparent"
              >
                {faltaReferencia ? 'Falta la referencia' : 'Agregar pago'}
              </button>
            </div>
          )}
        </div>

        {/* Cierre */}
        <div className="flex items-center gap-3 border-t border-linea px-5 py-3.5">
          <div className="flex-1">
            <p className="font-mono text-[10px] tracking-[0.12em] text-apagado uppercase">
              Total a cobrar
            </p>
            <p className="tabular text-2xl leading-tight font-bold">{formato(t.aCobrar, 'USD')}</p>
          </div>
          <button
            disabled={!cubierto || cobrando}
            onClick={() => void finalizar()}
            className="rounded-lg bg-verde px-8 py-3.5 text-[15px] font-bold text-fondo hover:brightness-110 disabled:cursor-not-allowed disabled:bg-panel3 disabled:text-apagado"
          >
            {cobrando ? 'Guardando…' : cubierto ? 'Cargar la venta' : 'Falta cubrir el total'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Dato({
  etiqueta,
  valor,
  tono = 'normal',
  grande,
}: {
  etiqueta: string
  valor: string
  tono?: 'normal' | 'cobre' | 'alerta' | 'verde'
  grande?: boolean
}) {
  const color =
    tono === 'cobre'
      ? 'text-cobre2'
      : tono === 'alerta'
        ? 'text-alerta'
        : tono === 'verde'
          ? 'text-verde'
          : 'text-tinta'
  return (
    <div className="rounded-lg border border-linea bg-panel2 px-3.5 py-2.5">
      <p className="font-mono text-[9.5px] tracking-[0.12em] text-apagado uppercase">{etiqueta}</p>
      <p className={`tabular mt-1 font-bold ${grande ? 'text-xl' : 'text-[17px]'} ${color}`}>
        {valor}
      </p>
    </div>
  )
}

function FilaPrevia({
  etiqueta,
  valor,
  tono,
}: {
  etiqueta: string
  valor: string
  tono?: 'cobre' | 'verde'
}) {
  const color = tono === 'cobre' ? 'text-cobre2' : tono === 'verde' ? 'text-verde' : 'text-tinta2'
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-[12.5px] text-apagado">{etiqueta}</span>
      <span className={`tabular text-[13px] font-semibold ${color}`}>{valor}</span>
    </div>
  )
}
