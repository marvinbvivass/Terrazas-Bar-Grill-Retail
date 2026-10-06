import { useMemo, useState } from 'react'
import { MOTIVOS_MERMA, type EntradaMerma, type MotivoMerma } from '../domain/ajuste'
import { formato, parsearMonto } from '../domain/money'
import { compararPorOrden } from '../domain/catalogo'
import { UBICACION_VENTA_DEFECTO } from '../data/seed'
import type { UUID } from '../domain/types'
import type { Pos } from '../hooks/usePos'
import { Hoja } from './Hoja'

interface Renglon {
  key: string
  productoId: UUID
  cantidad: string
  motivo: MotivoMerma
}

/**
 * Registrar una merma: mercancía que se fue sin venderse.
 *
 * El motivo es obligatorio y va por renglón, no por documento. Seis botellas
 * rotas y dos cortesías al cliente de la mesa cinco son cosas distintas, y
 * guardarlas bajo una sola etiqueta impide contestar la pregunta que se acaba
 * haciendo el dueño: cuánto se rompe, cuánto se regala y cuánto se bebe el
 * personal.
 */
export function HojaMerma({ pos, onCerrar }: { pos: Pos; onCerrar: () => void }) {
  const s = pos.snapshot
  const [renglones, setRenglones] = useState<Renglon[]>([])
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const productos = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return (s?.productos ?? [])
      .filter((p) => q === '' || p.nombreCorto.toLowerCase().includes(q))
      .slice()
      .sort(compararPorOrden)
  }, [s, busqueda])

  const entradas: EntradaMerma[] = useMemo(() => {
    if (!s) return []
    const salida: EntradaMerma[] = []
    for (const r of renglones) {
      const producto = s.productos.find((p) => p.id === r.productoId)
      const cantidad = Math.max(0, Math.floor(parsearMonto(r.cantidad)))
      if (!producto || cantidad <= 0) continue
      salida.push({ producto, cantidad, motivo: r.motivo })
    }
    return salida
  }, [renglones, s])

  const perdida = entradas.reduce((x, e) => x + e.cantidad * e.producto.costoPromedio, 0)

  if (!s) return null

  async function guardar() {
    setGuardando(true)
    await pos.registrarMerma(entradas, nota)
    setGuardando(false)
    onCerrar()
  }

  return (
    <Hoja
      titulo="Registrar merma"
      onCerrar={onCerrar}
      pie={
        <>
          <div className="flex items-end justify-between gap-3 pb-2">
            <div>
              <p className="font-mono text-[9.5px] tracking-[0.14em] text-apagado uppercase">
                Se perdió
              </p>
              <p className="tabular text-[22px] leading-tight font-extrabold text-alerta">
                {formato(perdida, 'USD')}
              </p>
            </div>
            <p className="tabular pb-1 text-[12.5px] text-apagado">
              {entradas.reduce((x, e) => x + e.cantidad, 0)} unidades
            </p>
          </div>
          <button
            onClick={() => void guardar()}
            disabled={guardando || entradas.length === 0}
            className="w-full rounded-xl bg-alerta py-3.5 text-[16px] font-bold text-white disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : 'Descontar del inventario'}
          </button>
        </>
      }
    >
      {renglones.length === 0 && (
        <p className="rounded-xl border border-linea bg-panel2 px-4 py-4 text-center text-[13.5px] leading-relaxed text-tinta2">
          Agrega abajo lo que se perdió y di por qué. El motivo importa: es lo que después permite
          saber cuánto se rompe, cuánto se regala y cuánto se bebe el personal.
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        {renglones.map((r) => {
          const producto = s.productos.find((p) => p.id === r.productoId)
          const cantidad = Math.max(0, Math.floor(parsearMonto(r.cantidad)))
          const enStock = producto ? pos.stockDe(producto.id, UBICACION_VENTA_DEFECTO) : 0
          return (
            <div key={r.key} className="rounded-xl border border-linea bg-panel px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2 pb-2">
                <span className="truncate text-[14.5px] font-semibold">
                  {producto?.nombreCorto ?? 'Producto'}
                </span>
                <button
                  onClick={() => setRenglones((x) => x.filter((y) => y.key !== r.key))}
                  className="shrink-0 text-[18px] leading-none text-alerta"
                  style={{ minHeight: 0 }}
                  aria-label="Quitar renglón"
                >
                  ×
                </button>
              </div>

              <div className="flex gap-2">
                <select
                  value={r.motivo}
                  onChange={(e) =>
                    setRenglones((x) =>
                      x.map((y) =>
                        y.key === r.key ? { ...y, motivo: e.target.value as MotivoMerma } : y,
                      ),
                    )
                  }
                  className="min-w-0 flex-1 rounded-lg border border-linea bg-panel2 px-2 py-2.5 text-[14px]"
                  aria-label="Motivo"
                >
                  {MOTIVOS_MERMA.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
                <input
                  value={r.cantidad}
                  onChange={(e) =>
                    setRenglones((x) =>
                      x.map((y) => (y.key === r.key ? { ...y, cantidad: e.target.value } : y)),
                    )
                  }
                  inputMode="numeric"
                  placeholder="0"
                  className="tabular w-20 rounded-lg border border-linea bg-panel2 py-2.5 text-center font-bold"
                  aria-label="Cuántas se perdieron"
                />
              </div>

              {cantidad > enStock && (
                <p className="pt-1.5 text-[12px] text-ambar">
                  Solo hay {enStock} en el sistema. Se puede guardar igual, pero el stock quedará
                  en negativo — señal de que falta cargar una entrada.
                </p>
              )}
            </div>
          )
        })}
      </div>

      <div className="pt-3">
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Nota (opcional)"
          className="w-full rounded-xl border border-linea bg-panel2 px-3 py-2.5 placeholder:text-apagado"
          aria-label="Nota"
        />
      </div>

      <div className="pt-3">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto…"
          className="mb-2 w-full rounded-xl border border-linea bg-panel2 px-3 py-2.5 placeholder:text-apagado"
          aria-label="Buscar producto"
        />
        <div className="flex flex-wrap gap-1.5">
          {productos.map((p) => (
            <button
              key={p.id}
              onClick={() =>
                setRenglones((x) => [
                  ...x,
                  { key: crypto.randomUUID(), productoId: p.id, cantidad: '', motivo: 'rotura' },
                ])
              }
              className="rounded-full border border-linea2 px-3 py-1.5 text-[12.5px] text-tinta2"
              style={{ minHeight: 0 }}
            >
              + {p.nombreCorto}
            </button>
          ))}
        </div>
      </div>
    </Hoja>
  )
}
