import { useMemo, useState } from 'react'
import { HojaRecepcion } from './HojaRecepcion'
import { HojaMerma } from './HojaMerma'
import { HojaConteo } from './HojaConteo'
import { HojaDevolucion } from './HojaDevolucion'
import { formato, redondear } from '../domain/money'
import type { Pos } from '../hooks/usePos'
import { UBICACION_VENTA_DEFECTO } from '../data/seed'
import { Precio } from './moneda'

type Orden = 'nombre' | 'menos' | 'valor'

/**
 * Inventario: qué hay, dónde, y por dónde entra.
 *
 * El stock sube al recibir mercancía y baja al cerrar el día. Las dos cosas
 * dejan asiento de kardex con fecha, cantidad, costo y quién — que es lo que
 * permite saber si faltan botellas porque se rompieron, se las llevó alguien o
 * nunca llegaron.
 *
 * Las cinco formas en que se mueve: entra al recibir mercancía, sale al cerrar
 * el día, vuelve por una devolución, sale por merma y se corrige con el conteo
 * físico. Las cinco dejan asiento; ninguna toca el stock a mano.
 */
export function InventarioView({ pos }: { pos: Pos }) {
  const [busqueda, setBusqueda] = useState('')
  const [orden, setOrden] = useState<Orden>('menos')
  const [hoja, setHoja] = useState<'ninguna' | 'recibir' | 'merma' | 'conteo' | 'devolucion'>(
    'ninguna',
  )
  const s = pos.snapshot

  const filas = useMemo(() => {
    if (!s) return []
    const q = busqueda.trim().toLowerCase()
    return s.productos
      .filter(
        (p) =>
          q === '' ||
          p.nombre.toLowerCase().includes(q) ||
          p.nombreCorto.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q),
      )
      .map((p) => {
        const total = pos.stockDe(p.id, UBICACION_VENTA_DEFECTO)
        return {
          producto: p,
          total,
          valor: redondear(total * p.costoPromedio, 2),
          bajo: p.stockMin > 0 && total <= p.stockMin,
        }
      })
      .sort((a, b) => {
        if (orden === 'menos') return a.total - b.total
        if (orden === 'valor') return b.valor - a.valor
        return a.producto.nombreCorto.localeCompare(b.producto.nombreCorto, 'es')
      })
  }, [s, pos, busqueda, orden])

  const totales = useMemo(
    () => ({
      unidades: filas.reduce((x, f) => x + f.total, 0),
      valor: redondear(
        filas.reduce((x, f) => x + f.valor, 0),
        2,
      ),
      bajos: filas.filter((f) => f.bajo).length,
    }),
    [filas],
  )

  if (!s) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-linea bg-panel px-4 py-2.5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[9.5px] tracking-[0.16em] text-apagado uppercase">
              Valor del inventario, al costo
            </p>
            <p className="tabular text-[21px] leading-tight font-extrabold text-cobre2">
              {formato(totales.valor, 'USD')}
            </p>
          </div>
          <p className="tabular pb-1 text-right text-[12px] text-apagado">
            {totales.unidades} unidades
            {totales.bajos > 0 && (
              <>
                <br />
                <span className="text-ambar">{totales.bajos} bajo mínimo</span>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="shrink-0 px-3 pt-2.5">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto…"
          className="w-full rounded-xl border border-linea bg-panel2 px-3 py-2.5 placeholder:text-apagado"
          aria-label="Buscar producto"
        />
      </div>

      <div className="flex shrink-0 gap-1.5 px-3 py-2">
        <Chip activo={orden === 'menos'} onClick={() => setOrden('menos')}>
          Menos primero
        </Chip>
        <Chip activo={orden === 'valor'} onClick={() => setOrden('valor')}>
          Más valor
        </Chip>
        <Chip activo={orden === 'nombre'} onClick={() => setOrden('nombre')}>
          Nombre
        </Chip>
      </div>

      <div className="scroll-y min-h-0 flex-1 px-3 pb-3">
        {s.productos.length === 0 ? (
          <p className="px-2 py-12 text-center text-[14px] leading-relaxed text-apagado">
            No hay productos todavía. Cárgalos en el catálogo.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {filas.map((f) => (
              <div
                key={f.producto.id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                  f.total <= 0
                    ? 'border-alerta/40 bg-alerta/[0.06]'
                    : f.bajo
                      ? 'border-ambar/40 bg-ambar/[0.06]'
                      : 'border-linea bg-panel'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-semibold">{f.producto.nombreCorto}</p>
                  <p className="flex items-center gap-2 pt-0.5 font-mono text-[10.5px] text-apagado">
                    {f.producto.stockMin > 0 && <span>mínimo {f.producto.stockMin}</span>}
                    <span>costo {formato(f.producto.costoPromedio, 'USD')}</span>
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={`tabular text-[19px] leading-none font-extrabold ${
                      f.total <= 0 ? 'text-alerta' : f.bajo ? 'text-ambar' : 'text-tinta'
                    }`}
                  >
                    {f.total}
                  </p>
                  <Precio base={f.valor} tamano="chico" className="text-apagado" />
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="px-1 pt-4 text-center text-[12px] leading-relaxed text-apagado">
          El stock sube al recibir mercancía, baja al cerrar el día, vuelve con una devolución y
          se corrige con la merma y el conteo. Todas dejan constancia de cuándo, cuánto y quién.
        </p>
      </div>

      <div className="shrink-0 border-t border-linea bg-panel px-3 py-2.5">
        <button
          onClick={() => setHoja('recibir')}
          disabled={s.productos.length === 0}
          className="w-full rounded-xl bg-cobre py-3.5 text-[16px] font-bold text-fondo disabled:opacity-40"
        >
          + Recibir mercancía
        </button>
        <div className="grid grid-cols-3 gap-2 pt-2">
          <button
            onClick={() => setHoja('conteo')}
            disabled={s.productos.length === 0}
            className="rounded-xl border border-linea2 py-2.5 text-[13px] font-semibold text-tinta2 disabled:opacity-40"
          >
            Conteo
          </button>
          <button
            onClick={() => setHoja('devolucion')}
            disabled={s.productos.length === 0}
            className="rounded-xl border border-linea2 py-2.5 text-[13px] font-semibold text-tinta2 disabled:opacity-40"
          >
            Devolución
          </button>
          <button
            onClick={() => setHoja('merma')}
            disabled={s.productos.length === 0}
            className="rounded-xl border border-alerta/50 py-2.5 text-[13px] font-semibold text-alerta disabled:opacity-40"
          >
            Merma
          </button>
        </div>
      </div>

      {hoja === 'recibir' && <HojaRecepcion pos={pos} onCerrar={() => setHoja('ninguna')} />}
      {hoja === 'merma' && <HojaMerma pos={pos} onCerrar={() => setHoja('ninguna')} />}
      {hoja === 'conteo' && <HojaConteo pos={pos} onCerrar={() => setHoja('ninguna')} />}
      {hoja === 'devolucion' && <HojaDevolucion pos={pos} onCerrar={() => setHoja('ninguna')} />}
    </div>
  )
}

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[12.5px] whitespace-nowrap ${
        activo ? 'border-cobre bg-cobre/15 text-cobre2' : 'border-linea text-tinta2'
      }`}
      style={{ minHeight: 0 }}
    >
      {children}
    </button>
  )
}
