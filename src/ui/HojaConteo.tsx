import { useMemo, useState } from 'react'
import { resumirConteo, type EntradaConteo } from '../domain/ajuste'
import { formato, parsearMonto } from '../domain/money'
import { UBICACION_VENTA_DEFECTO } from '../data/seed'
import type { UUID } from '../domain/types'
import type { Pos } from '../hooks/usePos'
import { Hoja } from './Hoja'

/**
 * Conteo físico: contar el anaquel y asentar lo que no cuadre.
 *
 * Se escribe lo CONTADO, que es lo que el encargado tiene delante; el sistema
 * calcula la diferencia contra lo que creía tener y guarda esa diferencia. Al
 * revés —pedirle que escriba la diferencia— obligaría a hacer la resta a mano
 * frente al anaquel, que es donde se equivoca.
 *
 * Los productos que se dejan en blanco NO se tocan. Un bar cuenta las neveras
 * el lunes y el depósito el jueves; si lo no contado se pusiera en cero, el
 * primer conteo parcial borraría medio inventario.
 */
export function HojaConteo({ pos, onCerrar }: { pos: Pos; onCerrar: () => void }) {
  const s = pos.snapshot
  const [contados, setContados] = useState<Record<UUID, string>>({})
  const [nota, setNota] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [soloDescuadrados, setSoloDescuadrados] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const filas = useMemo(() => {
    if (!s) return []
    const q = busqueda.trim().toLowerCase()
    return s.productos
      .filter((p) => q === '' || p.nombreCorto.toLowerCase().includes(q))
      .map((p) => {
        const enSistema = pos.stockDe(p.id, UBICACION_VENTA_DEFECTO)
        const texto = contados[p.id] ?? ''
        const contado = texto.trim() === '' ? null : Math.floor(parsearMonto(texto))
        return {
          producto: p,
          enSistema,
          contado,
          diferencia: contado === null ? null : contado - enSistema,
        }
      })
      .filter((f) => !soloDescuadrados || (f.diferencia !== null && f.diferencia !== 0))
      .sort((a, b) => a.producto.nombreCorto.localeCompare(b.producto.nombreCorto, 'es'))
  }, [s, pos, busqueda, contados, soloDescuadrados])

  const entradas: EntradaConteo[] = useMemo(
    () =>
      filas
        .filter((f) => f.contado !== null)
        .map((f) => ({ producto: f.producto, enSistema: f.enSistema, contado: f.contado! })),
    [filas],
  )

  const resumen = useMemo(() => resumirConteo(entradas), [entradas])
  const contadosCuantos = Object.values(contados).filter((v) => v.trim() !== '').length

  if (!s) return null

  async function guardar() {
    setGuardando(true)
    await pos.registrarConteo(entradas, nota)
    setGuardando(false)
    onCerrar()
  }

  return (
    <Hoja
      titulo="Conteo físico"
      onCerrar={onCerrar}
      pie={
        <>
          <div className="flex items-end justify-between gap-3 pb-2">
            <div>
              <p className="font-mono text-[9.5px] tracking-[0.14em] text-apagado uppercase">
                {resumen.descuadrados === 0 ? 'Todo lo contado cuadra' : 'No cuadran'}
              </p>
              <p
                className={`tabular text-[22px] leading-tight font-extrabold ${
                  resumen.descuadrados === 0 ? 'text-verde' : 'text-alerta'
                }`}
              >
                {resumen.descuadrados}
                <span className="pl-1.5 text-[13px] font-semibold text-apagado">
                  de {contadosCuantos} contados
                </span>
              </p>
            </div>
            {resumen.descuadrados > 0 && (
              <p className="tabular pb-1 text-right text-[11.5px] leading-snug text-apagado">
                {resumen.faltaron > 0 && (
                  <>
                    faltan {resumen.faltaron} · {formato(resumen.valorFaltante, 'USD')}
                  </>
                )}
                {resumen.faltaron > 0 && resumen.sobraron > 0 && <br />}
                {resumen.sobraron > 0 && (
                  <>
                    sobran {resumen.sobraron} · {formato(resumen.valorSobrante, 'USD')}
                  </>
                )}
              </p>
            )}
          </div>
          <button
            onClick={() => void guardar()}
            disabled={guardando || contadosCuantos === 0}
            className="w-full rounded-xl bg-cobre py-3.5 text-[16px] font-bold text-fondo disabled:opacity-40"
          >
            {guardando
              ? 'Guardando…'
              : resumen.descuadrados === 0
                ? 'Todo cuadra'
                : `Ajustar ${resumen.descuadrados} ${resumen.descuadrados === 1 ? 'producto' : 'productos'}`}
          </button>
        </>
      }
    >
      <p className="pb-3 text-[13.5px] leading-relaxed text-tinta2">
        Escribe lo que <b>contaste</b> en el anaquel. Lo que dejes en blanco no se toca, así que
        puedes contar por partes.
      </p>

      <div className="flex gap-2 pb-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto…"
          className="min-w-0 flex-1 rounded-xl border border-linea bg-panel2 px-3 py-2.5 placeholder:text-apagado"
          aria-label="Buscar producto"
        />
        <button
          onClick={() => setSoloDescuadrados((v) => !v)}
          className={`shrink-0 rounded-xl border px-3 py-2.5 text-[12.5px] font-semibold ${
            soloDescuadrados ? 'border-cobre bg-cobre/15 text-cobre2' : 'border-linea text-tinta2'
          }`}
        >
          Descuadrados
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {filas.length === 0 && (
          <p className="px-2 py-8 text-center text-[13.5px] text-apagado">
            {soloDescuadrados ? 'Todo lo contado cuadra.' : 'Ningún producto coincide.'}
          </p>
        )}

        {filas.map((f) => (
          <div
            key={f.producto.id}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
              f.diferencia === null
                ? 'border-linea bg-panel'
                : f.diferencia === 0
                  ? 'border-verde/50 bg-verde/[0.07]'
                  : 'border-alerta/50 bg-alerta/[0.07]'
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-semibold">{f.producto.nombreCorto}</p>
              <p className="font-mono text-[10.5px] text-apagado">
                el sistema dice {f.enSistema}
                {f.diferencia !== null && f.diferencia !== 0 && (
                  <span className={f.diferencia < 0 ? 'text-alerta' : 'text-ambar'}>
                    {' · '}
                    {f.diferencia > 0 ? `sobran ${f.diferencia}` : `faltan ${-f.diferencia}`}
                  </span>
                )}
              </p>
            </div>
            <input
              value={contados[f.producto.id] ?? ''}
              onChange={(e) =>
                setContados((x) => ({ ...x, [f.producto.id]: e.target.value }))
              }
              inputMode="numeric"
              placeholder="—"
              className="tabular h-11 w-20 shrink-0 rounded-lg border border-linea bg-panel2 text-center font-bold"
              aria-label={`Contado de ${f.producto.nombreCorto}`}
            />
          </div>
        ))}
      </div>

      <div className="pt-3">
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota (opcional): quién contó, qué parte…"
          className="w-full rounded-xl border border-linea bg-panel2 px-3 py-2.5 placeholder:text-apagado"
          aria-label="Nota"
        />
      </div>

      <p className="px-1 pt-3 text-center text-[12px] leading-relaxed text-apagado">
        El ajuste no cambia el costo promedio: encontrar seis botellas de menos no cambia lo que
        costaron las que quedan.
      </p>
    </Hoja>
  )
}
