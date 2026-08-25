import { useMemo, useState } from 'react'
import { formato, redondear } from '../domain/money'
import type { Pos } from '../hooks/usePos'
import { UBICACION_FRIO, UBICACION_VENTA_DEFECTO } from '../data/seed'
import { Precio } from './moneda'

type Orden = 'nombre' | 'menos' | 'valor'

/**
 * Inventario: qué hay y dónde.
 *
 * De solo lectura por ahora, y conviene decirlo en voz alta: las existencias se
 * mueven solas al cargar la venta del día y al dar de alta un producto. Ajustar
 * a mano —conteo físico, mermas, recepción de mercancía— escribe movimientos de
 * kardex que además tienen que subir al servidor, y eso es una pieza aparte que
 * todavía no está.
 */
export function InventarioView({ pos }: { pos: Pos }) {
  const [busqueda, setBusqueda] = useState('')
  const [orden, setOrden] = useState<Orden>('menos')
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
        const sala = pos.stockDe(p.id, UBICACION_VENTA_DEFECTO)
        const nevera = pos.stockDe(p.id, UBICACION_FRIO)
        const total = sala + nevera
        return {
          producto: p,
          sala,
          nevera,
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
                    <span>sala {f.sala}</span>
                    <span className="text-frio">nevera {f.nevera}</span>
                    {f.producto.stockMin > 0 && <span>mín {f.producto.stockMin}</span>}
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
          Las existencias bajan solas al cargar la venta del día. Ajustar a mano (conteo, mermas,
          recepción) todavía no está.
        </p>
      </div>
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
