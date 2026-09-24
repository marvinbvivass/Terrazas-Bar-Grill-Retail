import { useState } from 'react'
import { MONEDAS, formato, formatoNumero } from '../domain/money'
import type { CierreDia } from '../domain/cierreDia'
import type { Pos } from '../hooks/usePos'

/**
 * El acta de un día ya cerrado.
 *
 * Se lee, no se recalcula: todos los números salen del documento guardado, con
 * las tasas que tenía ese día. Si se recalcularan con la tasa de hoy, el cierre
 * de septiembre daría otro número en noviembre y el dueño estaría revisando una
 * cuenta que nadie hizo nunca.
 */
export function ActaCierre({ pos, acta }: { pos: Pos; acta: CierreDia }) {
  const [confirmando, setConfirmando] = useState(false)

  const cerradoEl = new Date(acta.cerradoEn).toLocaleString('es-VE', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="scroll-y min-h-0 flex-1 px-3 py-3">
      <div
        className={`rounded-2xl border px-4 py-4 text-center ${
          acta.cuadra ? 'border-verde/50 bg-verde/10' : 'border-amber-500/50 bg-amber-500/10'
        }`}
      >
        <p className="font-mono text-[10px] tracking-[0.18em] text-apagado uppercase">
          Día cerrado
        </p>
        <p
          className={`text-[19px] font-extrabold ${acta.cuadra ? 'text-verde' : 'text-ambar'}`}
        >
          {acta.cuadra ? 'Cuadró' : `${acta.diferencia < 0 ? 'Faltó' : 'Sobró'} ${formato(Math.abs(acta.diferencia), 'USD')}`}
        </p>
        <p className="pt-0.5 text-[12px] text-apagado">Cerrado el {cerradoEl}</p>
      </div>

      <Bloque titulo="La cuenta">
        <Renglon etiqueta="Se vendió" valor={formato(acta.totalVendido, 'USD')} fuerte />
        {acta.totalCredito > 0 && (
          <Renglon etiqueta="Se fio" valor={`− ${formato(acta.totalCredito, 'USD')}`} tono="ambar" />
        )}
        <Renglon etiqueta="Debía entrar" valor={formato(acta.esperado, 'USD')} />
        <Renglon etiqueta="Entró" valor={formato(acta.totalRecibido, 'USD')} fuerte />
        <Renglon
          etiqueta="Diferencia"
          valor={formato(acta.diferencia, 'USD')}
          tono={acta.cuadra ? 'verde' : 'alerta'}
        />
      </Bloque>

      {acta.recibido.length > 0 && (
        <Bloque titulo="Lo que se contó">
          {acta.recibido.map((r) => (
            <Renglon
              key={r.moneda}
              etiqueta={`${MONEDAS[r.moneda].simbolo} ${formatoNumero(r.monto, r.moneda)}${
                r.moneda === 'USD' ? '' : `  ·  tasa ${formatoNumero(r.tasa, 'VES')}`
              }`}
              valor={formato(r.enBase, 'USD')}
            />
          ))}
        </Bloque>
      )}

      {acta.creditos.length > 0 && (
        <Bloque titulo="Quedaron debiendo">
          {acta.creditos.map((cr) => (
            <Renglon
              key={cr.ventaId}
              etiqueta={cr.clienteNombre}
              valor={formato(cr.monto, 'USD')}
              tono="ambar"
            />
          ))}
        </Bloque>
      )}

      <Bloque titulo="El día">
        <Renglon etiqueta="Unidades que salieron" valor={String(acta.unidades)} />
        <Renglon etiqueta="Costo de lo vendido" valor={formato(acta.costo, 'USD')} />
        <Renglon etiqueta="Margen" valor={formato(acta.margen, 'USD')} tono="verde" fuerte />
      </Bloque>

      <p className="px-2 pt-4 text-center text-[12px] leading-relaxed text-apagado">
        {acta.sincronizadoEn
          ? 'El acta está guardada en el servidor.'
          : 'El acta está guardada aquí y sube cuando haya señal.'}
      </p>

      <div className="pt-3 pb-2">
        {confirmando ? (
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmando(false)}
              className="flex-1 rounded-xl border border-linea2 py-3 text-[15px] font-semibold text-tinta2"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                setConfirmando(false)
                void pos.reabrirDia()
              }}
              className="flex-1 rounded-xl bg-amber-600 py-3 text-[15px] font-bold text-white"
            >
              Sí, reabrir
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmando(true)}
            className="w-full rounded-xl border border-linea2 py-3 text-[15px] font-semibold text-tinta2"
          >
            Reabrir el día para corregir
          </button>
        )}
        <p className="px-2 pt-2 text-center text-[11.5px] leading-relaxed text-apagado">
          Reabrir no borra esta acta: queda marcada como reabierta. Un cierre que desaparece es un
          cierre que nadie puede auditar.
        </p>
      </div>
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
      <span className={`tabular shrink-0 ${fuerte ? 'text-[16px] font-extrabold' : 'text-[14px] font-semibold'} ${color}`}>
        {valor}
      </span>
    </div>
  )
}
