import { useMemo, useState } from 'react'
import { calcularCierre, masVendidos } from '../domain/cierre'
import { MONEDAS, formato, formatoNumero } from '../domain/money'
import { hoy, textoLargo } from '../domain/dias'
import { saldoCliente, totalDe } from '../domain/vacios'
import type { DiaNegocio } from '../domain/types'
import type { Pos } from '../hooks/usePos'
import { Calendario } from './Calendario'

/**
 * Historial: mirar cualquier día sin mover el día de trabajo.
 *
 * Esta pantalla es la respuesta a por qué la barra superior ya no lleva
 * selector de fecha. Tenerlo permanente invitaba a dejarlo movido sin querer, y
 * entonces la venta siguiente se cargaba en la fecha equivocada. Aquí se puede
 * rebuscar todo lo que haga falta porque NADA de lo que se toca aquí cambia
 * dónde se va a registrar lo próximo.
 *
 * Los números salen del acta cuando el día está cerrado, y se recalculan cuando
 * no lo está. No es lo mismo: el acta lleva las tasas congeladas de ese día, y
 * un recálculo de hoy usaría las de hoy. Por eso se avisa de cuál se está
 * viendo.
 */
export function HistorialView({ pos, onCargarDia }: { pos: Pos; onCargarDia: () => void }) {
  const [dia, setDia] = useState<DiaNegocio>(hoy())

  const acta = useMemo(() => pos.cierres.find((c) => c.dia === dia && !c.reabiertoEn), [pos.cierres, dia])

  const cierre = useMemo(
    () =>
      calcularCierre({
        dia,
        ventas: pos.ventas,
        abonos: pos.abonos,
        metodosPago: pos.snapshot?.metodosPago ?? [],
        devoluciones: pos.devoluciones,
      }),
    [dia, pos.ventas, pos.abonos, pos.snapshot, pos.devoluciones],
  )

  /** Días que tienen algo que mirar, para marcarlos en el calendario */
  const conMovimiento = useMemo(() => {
    const dias = new Set<DiaNegocio>()
    for (const v of pos.ventas) if (v.estado !== 'anulada') dias.add(v.dia)
    for (const a of pos.abonos) dias.add(a.dia)
    for (const d of pos.devoluciones) dias.add(d.dia)
    for (const c of pos.cierres) dias.add(c.dia)
    return dias
  }, [pos.ventas, pos.abonos, pos.devoluciones, pos.cierres])

  const top = useMemo(() => masVendidos(dia, pos.ventas, 5), [dia, pos.ventas])

  const productosDelDia = useMemo(
    () =>
      top.map((t) => ({
        ...t,
        nombre: pos.snapshot?.productos.find((p) => p.id === t.productoId)?.nombreCorto ?? '—',
      })),
    [top, pos.snapshot],
  )

  const devolucionesDelDia = useMemo(
    () => pos.devoluciones.filter((d) => d.dia === dia),
    [pos.devoluciones, dia],
  )

  const vaciosDelDia = useMemo(
    () => pos.vacios.filter((m) => m.dia === dia && m.contraparte === 'cliente'),
    [pos.vacios, dia],
  )

  const hayAlgo = conMovimiento.has(dia)

  return (
    <div className="scroll-y min-h-0 flex-1 px-3 py-3">
      <Calendario valor={dia} onElegir={setDia} marcados={conMovimiento} maximo={hoy()} />

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-1 pt-2 pb-3">
        <span className="flex items-center gap-1.5 text-[11.5px] text-apagado">
          <span className="h-3.5 w-3.5 rounded-full bg-cobre/20 ring-1 ring-cobre/40" />
          con movimiento
        </span>
        <span className="flex items-center gap-1.5 text-[11.5px] text-apagado">
          <span className="h-3.5 w-3.5 rounded-full bg-cobre" />
          día que estás viendo
        </span>
      </div>

      <h2 className="px-1 pb-2 text-[16px] font-bold first-letter:uppercase">{textoLargo(dia)}</h2>

      {!hayAlgo ? (
        <p className="rounded-xl border border-linea bg-panel px-4 py-8 text-center text-[13.5px] leading-relaxed text-apagado">
          Ese día no tiene movimiento registrado.
        </p>
      ) : (
        <>
          <div
            className={`rounded-xl border px-4 py-3 text-center ${
              acta
                ? acta.cuadra
                  ? 'border-verde/50 bg-verde/10'
                  : 'border-ambar/50 bg-ambar/10'
                : 'border-linea bg-panel'
            }`}
          >
            <p className="font-mono text-[10px] tracking-[0.16em] text-apagado uppercase">
              {acta ? 'Día cerrado' : 'Día sin cerrar'}
            </p>
            {acta ? (
              <p className={`text-[17px] font-extrabold ${acta.cuadra ? 'text-verde' : 'text-ambar'}`}>
                {acta.cuadra
                  ? 'Cuadró'
                  : `${acta.diferencia < 0 ? 'Faltó' : 'Sobró'} ${formato(Math.abs(acta.diferencia), 'USD')}`}
              </p>
            ) : (
              <p className="pt-0.5 text-[12.5px] leading-relaxed text-tinta2">
                Hay movimiento pero nadie cerró el día, así que no hay acta ni arqueo de la gaveta.
              </p>
            )}
          </div>

          <Bloque titulo="Las dos cifras">
            <Renglon etiqueta="Se vendió" valor={formato(cierre.vendidoHoy, 'USD')} fuerte />
            <Renglon etiqueta="Entró en caja" valor={formato(cierre.entroEnCaja, 'USD')} fuerte />
            {cierre.creditoHoy > 0 && (
              <Renglon etiqueta="Se fio" valor={formato(cierre.creditoHoy, 'USD')} tono="ambar" />
            )}
            {cierre.cobrosCredito > 0 && (
              <Renglon
                etiqueta="Cobros de fiados viejos"
                valor={formato(cierre.cobrosCredito, 'USD')}
              />
            )}
            <Renglon etiqueta="Costo de lo vendido" valor={formato(cierre.costoVendido, 'USD')} />
            <Renglon etiqueta="Margen" valor={formato(cierre.margen, 'USD')} tono="verde" fuerte />
            <Renglon etiqueta="Unidades que salieron" valor={String(cierre.unidades)} />
          </Bloque>

          {acta && acta.recibido.length > 0 && (
            <Bloque titulo="Lo que se contó en la gaveta">
              {acta.recibido.map((r) => (
                <Renglon
                  key={r.moneda}
                  etiqueta={`${MONEDAS[r.moneda].simbolo} ${formatoNumero(r.monto, r.moneda)}${
                    r.moneda === 'USD' ? '' : ` · tasa ${formatoNumero(r.tasa, 'VES')}`
                  }`}
                  valor={formato(r.enBase, 'USD')}
                />
              ))}
            </Bloque>
          )}

          {!acta && cierre.porMoneda.length > 0 && (
            <Bloque titulo="Lo que entró, por moneda">
              {cierre.porMoneda.map((m) => (
                <Renglon
                  key={m.moneda}
                  etiqueta={MONEDAS[m.moneda].nombre}
                  valor={`${MONEDAS[m.moneda].simbolo} ${formatoNumero(m.monto, m.moneda)}`}
                />
              ))}
            </Bloque>
          )}

          {acta && acta.creditos.length > 0 && (
            <Bloque titulo="Quedaron debiendo">
              {acta.creditos.map((c) => (
                <Renglon
                  key={c.ventaId}
                  etiqueta={c.clienteNombre}
                  valor={formato(c.monto, 'USD')}
                  tono="ambar"
                />
              ))}
            </Bloque>
          )}

          {productosDelDia.length > 0 && (
            <Bloque titulo="Lo que más se movió">
              {productosDelDia.map((p) => (
                <Renglon
                  key={p.productoId}
                  etiqueta={`${p.nombre} · ${p.unidades} u.`}
                  valor={formato(p.importe, 'USD')}
                />
              ))}
            </Bloque>
          )}

          {devolucionesDelDia.length > 0 && (
            <Bloque titulo="Devoluciones">
              {devolucionesDelDia.map((d) => (
                <Renglon
                  key={d.id}
                  etiqueta={
                    d.modo === 'efectivo' ? 'Se devolvió plata' : 'Se bajó deuda a un cliente'
                  }
                  valor={formato(d.total, 'USD')}
                  tono="alerta"
                />
              ))}
            </Bloque>
          )}

          {vaciosDelDia.length > 0 && (
            <Bloque titulo="Vacíos de clientes">
              {vaciosDelDia.map((m) => {
                const cliente = pos.clientes.find((c) => c.id === m.clienteId)
                const cajas = totalDe(saldoCliente(m.clienteId ?? '', [m]))
                return (
                  <Renglon
                    key={m.id}
                    etiqueta={cliente?.nombre ?? 'Cliente'}
                    valor={`${cajas > 0 ? '+' : ''}${cajas} ${Math.abs(cajas) === 1 ? 'caja' : 'cajas'}`}
                    tono={cajas > 0 ? 'ambar' : 'verde'}
                  />
                )
              })}
            </Bloque>
          )}

          {acta && (
            <p className="px-2 pt-3 text-center text-[12px] leading-relaxed text-apagado">
              Los montos de la gaveta salen del acta, con las tasas congeladas de ese día. Por eso
              un cierre viejo sigue dando el mismo número aunque el cambio haya subido.
            </p>
          )}
        </>
      )}

      {/*
        La única forma de salir del día de hoy, y es a propósito que esté aquí
        escondida detrás de una confirmación en vez de en la barra superior.
        Sin ella, olvidarse de cerrar una noche significaría perder ese día para
        siempre; con un selector permanente arriba, el riesgo era dejarlo movido
        sin darse cuenta y cargar la venta en la fecha equivocada.
      */}
      {dia < hoy() && !acta && (
        <div className="mt-4 rounded-xl border border-ambar/50 bg-ambar/10 px-4 py-3">
          <p className="text-[13.5px] font-bold text-ambar">¿Se te quedó sin cerrar?</p>
          <p className="pt-0.5 pb-2.5 text-[12.5px] leading-relaxed text-tinta2">
            Puedes cargarlo ahora. La aplicación pasará a trabajar en esa fecha hasta que la
            devuelvas a hoy, y te lo va a recordar con una franja arriba.
          </p>
          <button
            onClick={() => {
              pos.setDia(dia)
              onCargarDia()
            }}
            className="w-full rounded-xl bg-amber-600 py-2.5 text-[14.5px] font-bold text-white"
          >
            Cargar este día
          </button>
        </div>
      )}

      <p className="px-2 pt-4 pb-2 text-center text-[12px] leading-relaxed text-apagado">
        Mirar aquí no cambia el día de trabajo: lo próximo que cargues sigue yendo a hoy.
      </p>
    </div>
  )
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-3 overflow-hidden rounded-xl border border-linea bg-panel">
      <h2 className="border-b border-linea px-3.5 py-2 font-mono text-[10px] tracking-[0.16em] text-apagado uppercase">
        {titulo}
      </h2>
      <div className="px-3.5 py-1.5">{children}</div>
    </section>
  )
}

function Renglon({
  etiqueta,
  valor,
  tono,
  fuerte,
}: {
  etiqueta: string
  valor: string
  tono?: 'verde' | 'ambar' | 'alerta'
  fuerte?: boolean
}) {
  const color =
    tono === 'verde'
      ? 'text-verde'
      : tono === 'ambar'
        ? 'text-ambar'
        : tono === 'alerta'
          ? 'text-alerta'
          : ''
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="min-w-0 truncate text-[13.5px] text-tinta2">{etiqueta}</span>
      <span
        className={`tabular shrink-0 ${fuerte ? 'text-[16px] font-extrabold' : 'text-[14px] font-semibold'} ${color}`}
      >
        {valor}
      </span>
    </div>
  )
}
