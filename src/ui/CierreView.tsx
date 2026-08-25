import { masVendidos } from '../domain/cierre'
import { formato } from '../domain/money'
import { textoLargo } from '../domain/dias'
import type { Pos } from '../hooks/usePos'

/**
 * Cierre del día.
 *
 * La pantalla está partida en dos a propósito, porque son dos preguntas
 * distintas y mezclarlas es lo que hace que un negocio crea que vendió más de
 * lo que cobró:
 *
 *   ENTRÓ EN CAJA   contado del día + cobros de fiados viejos.
 *                   Es contra esto que se cuenta la gaveta.
 *
 *   SE VENDIÓ       contado del día + lo que se fio hoy.
 *                   Es lo que salió del inventario y lo que deja margen.
 */
export function CierreView({ pos }: { pos: Pos }) {
  const c = pos.cierre
  const s = pos.snapshot!
  const tasa = s.tasas.VES ?? 0
  const top = masVendidos(pos.dia, pos.ventas)

  const sinMovimiento = c.entroEnCaja === 0 && c.vendidoHoy === 0 && c.numCobros === 0

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <header className="mb-6">
          <p className="font-mono text-[10px] tracking-[0.16em] text-apagado uppercase">
            Cierre del día
          </p>
          <h1 className="text-2xl font-bold first-letter:uppercase">{textoLargo(pos.dia)}</h1>
        </header>

        {sinMovimiento ? (
          <div className="rounded-xl border border-linea bg-panel px-6 py-10 text-center">
            <p className="text-[15px] text-apagado">
              No hay nada cargado en este día. Ve al cuaderno y transcribe las ventas.
            </p>
          </div>
        ) : (
          <>
            {/* --- Las dos cifras, lado a lado --- */}
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-xl border border-verde/35 bg-panel p-5">
                <p className="font-mono text-[10px] tracking-[0.14em] text-verde uppercase">
                  Entró en caja
                </p>
                <p className="tabular mt-1 text-4xl leading-none font-bold">
                  {formato(c.entroEnCaja, 'USD')}
                </p>
                <p className="tabular mt-1.5 font-mono text-[12px] text-apagado">
                  {formato(c.entroEnCaja * tasa, 'VES')}
                </p>

                <div className="mt-4 space-y-1 border-t border-linea pt-3">
                  <Fila
                    etiqueta={`Contado del día · ${c.numVentasContado} venta${c.numVentasContado === 1 ? '' : 's'}`}
                    valor={formato(c.contado, 'USD')}
                  />
                  <Fila
                    etiqueta={`Cobros de fiado · ${c.numCobros} cobro${c.numCobros === 1 ? '' : 's'}`}
                    valor={formato(c.cobrosCredito, 'USD')}
                    tono={c.cobrosCredito > 0 ? 'cobre' : undefined}
                  />
                  {c.igtf > 0 && (
                    <Fila etiqueta="IGTF cobrado aparte" valor={formato(c.igtf, 'USD')} />
                  )}
                </div>
                <p className="mt-3 text-[12px] leading-snug text-apagado">
                  Contra esta cifra se cuenta la gaveta al cerrar.
                </p>
              </section>

              <section className="rounded-xl border border-linea bg-panel p-5">
                <p className="font-mono text-[10px] tracking-[0.14em] text-apagado uppercase">
                  Se vendió
                </p>
                <p className="tabular mt-1 text-4xl leading-none font-bold">
                  {formato(c.vendidoHoy, 'USD')}
                </p>
                <p className="tabular mt-1.5 font-mono text-[12px] text-apagado">
                  {c.unidades} unidades salieron del inventario
                </p>

                <div className="mt-4 space-y-1 border-t border-linea pt-3">
                  <Fila etiqueta="Contado del día" valor={formato(c.contado, 'USD')} />
                  <Fila
                    etiqueta={`Fiado hoy · ${c.numVentasCredito} venta${c.numVentasCredito === 1 ? '' : 's'}`}
                    valor={formato(c.fiadoHoy, 'USD')}
                    tono={c.fiadoHoy > 0 ? 'ambar' : undefined}
                  />
                  <Fila etiqueta="Costo de lo vendido" valor={formato(c.costoVendido, 'USD')} />
                  <Fila etiqueta="Margen bruto" valor={formato(c.margen, 'USD')} tono="verde" fuerte />
                </div>
                <p className="mt-3 text-[12px] leading-snug text-apagado">
                  Incluye lo fiado: la mercancía salió aunque la plata no haya entrado.
                </p>
              </section>
            </div>

            {/* --- Qué hay que contar en la gaveta --- */}
            {c.porMetodo.length > 0 && (
              <section className="mt-4 rounded-xl border border-linea bg-panel p-5">
                <p className="mb-3 font-mono text-[10px] tracking-[0.14em] text-apagado uppercase">
                  Qué contar, por método
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-[14px]">
                    <thead>
                      <tr className="border-b border-linea">
                        <th className="py-1.5 text-left font-mono text-[9.5px] tracking-[0.1em] text-apagado uppercase">
                          Método
                        </th>
                        <th className="py-1.5 text-right font-mono text-[9.5px] tracking-[0.1em] text-apagado uppercase">
                          En su moneda
                        </th>
                        <th className="py-1.5 text-right font-mono text-[9.5px] tracking-[0.1em] text-apagado uppercase">
                          Equivale a
                        </th>
                        <th className="py-1.5 text-right font-mono text-[9.5px] tracking-[0.1em] text-apagado uppercase">
                          IGTF
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.porMetodo.map((m) => (
                        <tr key={m.metodoId} className="border-b border-linea last:border-0">
                          <td className="py-2 font-semibold">{m.metodoNombre}</td>
                          <td className="tabular py-2 text-right font-bold">
                            {formato(m.enMoneda, m.moneda)}
                          </td>
                          <td className="tabular py-2 text-right text-apagado">
                            {formato(m.enBase, 'USD')}
                          </td>
                          <td className="tabular py-2 text-right text-apagado">
                            {m.igtf > 0 ? formato(m.igtf, 'USD') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-linea pt-3">
                  {c.porMoneda.map((x) => (
                    <p key={x.moneda} className="tabular font-mono text-[12px]">
                      <span className="text-apagado">Total {x.moneda}: </span>
                      <span className="font-semibold">{formato(x.monto, x.moneda)}</span>
                    </p>
                  ))}
                </div>
              </section>
            )}

            {/* --- Cartera --- */}
            <section className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-linea bg-panel p-5">
                <p className="font-mono text-[10px] tracking-[0.14em] text-apagado uppercase">
                  Fiado por cobrar, en total
                </p>
                <p className="tabular mt-1 text-2xl font-bold text-cobre2">
                  {formato(c.carteraAlCierre, 'USD')}
                </p>
                <p className="mt-1 text-[12px] text-apagado">
                  {c.fiadoHoy > 0 ? (
                    <>Hoy se fiaron {formato(c.fiadoHoy, 'USD')} más.</>
                  ) : (
                    <>Hoy no se fio nada.</>
                  )}
                </p>
              </div>

              {top.length > 0 && (
                <div className="rounded-xl border border-linea bg-panel p-5">
                  <p className="mb-2 font-mono text-[10px] tracking-[0.14em] text-apagado uppercase">
                    Lo que más se movió
                  </p>
                  <ul className="space-y-1">
                    {top.slice(0, 5).map((x) => {
                      const p = s.productos.find((y) => y.id === x.productoId)
                      return (
                        <li key={x.productoId} className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-[13.5px]">{p?.nombreCorto ?? '—'}</span>
                          <span className="tabular shrink-0 font-mono text-[11.5px] text-apagado">
                            {x.unidades} und · {formato(x.importe, 'USD')}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function Fila({
  etiqueta,
  valor,
  tono,
  fuerte,
}: {
  etiqueta: string
  valor: string
  tono?: 'cobre' | 'verde' | 'ambar'
  fuerte?: boolean
}) {
  const color =
    tono === 'cobre'
      ? 'text-cobre2'
      : tono === 'verde'
        ? 'text-verde'
        : tono === 'ambar'
          ? 'text-ambar'
          : 'text-tinta2'
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[13px] text-apagado">{etiqueta}</span>
      <span className={`tabular text-[14px] ${fuerte ? 'font-bold' : 'font-semibold'} ${color}`}>
        {valor}
      </span>
    </div>
  )
}
