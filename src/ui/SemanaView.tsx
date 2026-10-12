import { useEffect, useMemo, useState } from 'react'
import {
  construirSemana,
  diasDeLaSemana,
  lunesDe,
  textoDeLaSemana,
  totalesPorDia,
  type FilaSemana,
} from '../domain/semana'
import { compararPorOrden } from '../domain/catalogo'
import { desgloseCorto } from '../domain/stock'
import { inicioDe, sumarDias } from '../domain/dias'
import { cargarMovimientosDesde } from '../data/db'
import { UBICACION_VENTA_DEFECTO } from '../data/seed'
import type { DiaNegocio, MovimientoInventario, Presentacion, UUID } from '../domain/types'
import type { Pos } from '../hooks/usePos'

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

/**
 * La semana, como el cuaderno.
 *
 * Los productos en filas, los días en columnas, y en cada cruce lo que salió.
 * Es la pantalla que se mira con el inventario delante para cuadrar contra lo
 * que hay apilado, y de ahí sale el Excel de la semana.
 *
 * SE MIRA, NO SE ESCRIBE. Lo vendido se carga en el cierre del día, que es
 * donde además se cuenta el dinero. Si se pudiera teclear aquí, un día ya
 * cerrado cambiaría de cifras sin que su acta cambiara con él, y el cuadre de
 * ese día —lo que de verdad protege la caja— quedaría apuntando al vacío. Para
 * corregir un día se toca su columna y se abre su cierre.
 */
export function SemanaView({ pos, onIrAlDia }: { pos: Pos; onIrAlDia?: (dia: DiaNegocio) => void }) {
  const [lunes, setLunes] = useState<DiaNegocio>(() => lunesDe(pos.dia))
  const [movimientos, setMovimientos] = useState<MovimientoInventario[] | null>(null)
  const [soloMovidos, setSoloMovidos] = useState(true)
  const [categoria, setCategoria] = useState<UUID | 'todas'>('todas')

  const s = pos.snapshot

  useEffect(() => {
    let vivo = true
    setMovimientos(null)
    void cargarMovimientosDesde(inicioDe(lunes)).then((m) => {
      if (vivo) setMovimientos(m)
    })
    return () => {
      vivo = false
    }
  }, [lunes])

  const filas = useMemo(() => {
    if (!s || !movimientos) return []
    return construirSemana({
      lunes,
      productos: s.productos.slice().sort(compararPorOrden),
      movimientos,
      stockActual: (id) => pos.stockDe(id, UBICACION_VENTA_DEFECTO),
      presentacionesPorId: s.presentacionesPorId,
      hoy: pos.dia,
    })
  }, [s, movimientos, lunes, pos])

  const visibles = useMemo(
    () =>
      filas
        .filter((f) => categoria === 'todas' || f.producto.categoriaId === categoria)
        .filter((f) => !soloMovidos || !f.quieto),
    [filas, categoria, soloMovidos],
  )

  const totales = useMemo(() => totalesPorDia(visibles), [visibles])
  const dias = useMemo(() => diasDeLaSemana(lunes), [lunes])
  const esLaDeHoy = lunes === lunesDe(pos.dia)

  if (!s) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-linea bg-panel px-2 py-1.5">
        <button
          onClick={() => setLunes(sumarDias(lunes, -7))}
          className="shrink-0 px-2 text-[20px] leading-none text-tinta2"
          style={{ minHeight: 0 }}
          aria-label="Semana anterior"
        >
          ‹
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-[13.5px] font-semibold">
          {textoDeLaSemana(lunes)}
          {esLaDeHoy && <span className="pl-1.5 text-[11px] text-cobre2">esta semana</span>}
        </p>
        <button
          onClick={() => setLunes(sumarDias(lunes, 7))}
          disabled={esLaDeHoy}
          className="shrink-0 px-2 text-[20px] leading-none text-tinta2 disabled:opacity-25"
          style={{ minHeight: 0 }}
          aria-label="Semana siguiente"
        >
          ›
        </button>
      </div>

      <div className="flex shrink-0 gap-2 px-3 py-2">
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className={`min-w-0 flex-1 rounded-xl border bg-panel2 px-2.5 py-2.5 text-[13.5px] ${
            categoria === 'todas' ? 'border-linea text-tinta2' : 'border-cobre text-cobre2'
          }`}
          aria-label="Filtrar por categoría"
        >
          <option value="todas">Todas las categorías</option>
          {s.categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <button
          onClick={() => setSoloMovidos((x) => !x)}
          className={`shrink-0 rounded-xl border px-3 py-2.5 text-[12.5px] font-semibold ${
            soloMovidos ? 'border-cobre text-cobre2' : 'border-linea2 text-tinta2'
          }`}
        >
          {soloMovidos ? 'Solo lo movido' : 'Todo'}
        </button>
      </div>

      {movimientos === null ? (
        <p className="px-4 py-12 text-center text-[13.5px] text-apagado">Cargando la semana…</p>
      ) : visibles.length === 0 ? (
        <p className="px-4 py-12 text-center text-[13.5px] leading-relaxed text-apagado">
          {filas.length === 0
            ? 'No hay productos en el catálogo.'
            : 'Esta semana no se movió nada de lo que estás filtrando.'}
        </p>
      ) : (
        /*
         * La tabla rueda de lado y la primera columna se queda quieta.
         *
         * Nueve columnas no caben en un teléfono, y sin el nombre a la vista
         * uno pierde la fila a los dos deslizamientos.
         */
        <div className="scroll-y min-h-0 flex-1">
          <div className="overflow-x-auto">
            <table className="w-max min-w-full border-collapse text-[12.5px]">
              <thead className="sticky top-0 z-10 bg-panel">
                <tr className="border-b border-linea2">
                  <th className="sticky left-0 z-20 bg-panel px-2.5 py-1.5 text-left font-mono text-[9.5px] tracking-[0.1em] text-apagado uppercase">
                    Producto
                  </th>
                  <th className="px-2 py-1.5 text-right font-mono text-[9.5px] tracking-[0.1em] text-apagado uppercase">
                    Abrió
                  </th>
                  {dias.map((d, i) => (
                    <th
                      key={d}
                      className={`px-2 py-1.5 text-center font-mono text-[9.5px] tracking-[0.1em] uppercase ${
                        d === pos.dia ? 'text-cobre2' : 'text-apagado'
                      }`}
                    >
                      {onIrAlDia && d <= pos.dia ? (
                        <button
                          onClick={() => onIrAlDia(d)}
                          className="underline decoration-dotted underline-offset-2"
                          style={{ minHeight: 0 }}
                          title="Ir al cierre de ese día"
                        >
                          {DIAS[i]}
                        </button>
                      ) : (
                        DIAS[i]
                      )}
                    </th>
                  ))}
                  <th className="px-2.5 py-1.5 text-right font-mono text-[9.5px] tracking-[0.1em] text-apagado uppercase">
                    Quedó
                  </th>
                </tr>
              </thead>

              <tbody>
                {visibles.map((f) => (
                  <Fila
                    key={f.producto.id}
                    fila={f}
                    hoy={pos.dia}
                    presentaciones={s.presentacionesPorProducto.get(f.producto.id) ?? []}
                  />
                ))}
              </tbody>

              <tfoot className="sticky bottom-0 bg-panel">
                <tr className="border-t border-linea2">
                  <td className="sticky left-0 z-20 bg-panel px-2.5 py-1.5 font-mono text-[9.5px] tracking-[0.1em] text-apagado uppercase">
                    Unidades
                  </td>
                  <td />
                  {totales.map((t) => (
                    <td
                      key={t.dia}
                      className="tabular px-2 py-1.5 text-center text-[12.5px] font-bold text-cobre2"
                    >
                      {t.vendido > 0 ? t.vendido : ''}
                    </td>
                  ))}
                  <td className="tabular px-2.5 py-1.5 text-right text-[12.5px] font-bold text-cobre2">
                    {visibles.reduce((x, f) => x + f.vendido, 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className="px-3 pt-3 pb-4 text-center text-[12px] leading-relaxed text-apagado">
            <b>u</b> son unidades sueltas, <b>cj</b> bultos completos, <b>+</b> lo que entró por
            recarga y <b>±</b> las mermas y los conteos. Lo vendido se carga en el cierre del día;
            aquí solo se mira. Toca el nombre de un día para ir a su cierre.
          </p>
        </div>
      )}
    </div>
  )
}

function Fila({
  fila,
  hoy,
  presentaciones,
}: {
  fila: FilaSemana
  hoy: DiaNegocio
  presentaciones: Presentacion[]
}) {
  // El cierre tambien en cajas: es como se cuenta contra lo que hay apilado en
  // el deposito, que es para lo que se imprime esta tabla.
  const enCajas = presentaciones.length > 1 ? desgloseCorto(fila.cierre, presentaciones) : null
  return (
    <tr className="border-b border-linea/60">
      <th
        scope="row"
        className="sticky left-0 z-10 max-w-[7.5rem] truncate bg-fondo px-2.5 py-1.5 text-left text-[13px] font-semibold"
      >
        {fila.producto.nombreCorto}
      </th>
      <td className="tabular px-2 py-1.5 text-right text-apagado">{fila.apertura}</td>

      {fila.dias.map((c) => (
        <td
          key={c.dia}
          className={`px-2 py-1.5 text-center whitespace-nowrap ${
            c.dia === hoy ? 'bg-cobre/[0.07]' : ''
          }`}
        >
          {c.futuro ? (
            <span className="text-apagado">·</span>
          ) : (
            <span className="tabular inline-flex gap-1.5">
              {c.unidades > 0 && <span>{c.unidades}</span>}
              {c.bultos > 0 && <span className="font-bold text-cobre2">{c.bultos}cj</span>}
              {c.entrada > 0 && <span className="text-verde">+{c.entrada}</span>}
              {c.ajuste !== 0 && (
                <span className="text-alerta">
                  {c.ajuste > 0 ? '+' : '−'}
                  {Math.abs(c.ajuste)}
                </span>
              )}
              {c.unidades === 0 && c.bultos === 0 && c.entrada === 0 && c.ajuste === 0 && (
                <span className="text-apagado">—</span>
              )}
            </span>
          )}
        </td>
      ))}

      <td className="px-2.5 py-1.5 text-right whitespace-nowrap">
        <span className="tabular font-bold">{fila.cierre}</span>
        {enCajas && (
          <span className="block font-mono text-[9.5px] text-apagado">{enCajas}</span>
        )}
      </td>
    </tr>
  )
}
