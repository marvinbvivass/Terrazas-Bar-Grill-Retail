import { useMemo, useState } from 'react'
import {
  MOTIVOS_DEVOLUCION,
  type EntradaLineaDevolucion,
  type MotivoDevolucion,
} from '../domain/devolucion'
import { formato, parsearMonto } from '../domain/money'
import { compararPorOrden } from '../domain/catalogo'
import type { UUID } from '../domain/types'
import type { Pos } from '../hooks/usePos'
import { Hoja } from './Hoja'

interface Renglon {
  key: string
  productoId: UUID
  presentacionId: UUID
  cantidad: string
  precio: string
}

/**
 * Devolución parcial de un cliente.
 *
 * Antes lo único posible era anular la venta entera, y con el cierre diario eso
 * significa tumbar el día completo para deshacer dos botellas.
 *
 * Dos preguntas deciden todo lo demás, y por eso van arriba: si sale plata de la
 * gaveta o se le baja la deuda, y si la mercancía se puede volver a vender.
 */
export function HojaDevolucion({ pos, onCerrar }: { pos: Pos; onCerrar: () => void }) {
  const s = pos.snapshot
  const [modo, setModo] = useState<'efectivo' | 'cuenta'>('efectivo')
  const [clienteId, setClienteId] = useState<UUID>('')
  const [motivo, setMotivo] = useState<MotivoDevolucion>('mal_estado')
  const [vuelveAlStock, setVuelveAlStock] = useState(false)
  const [renglones, setRenglones] = useState<Renglon[]>([])
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)

  const productos = useMemo(
    () =>
      (s?.productos ?? [])
        .slice()
        .sort(compararPorOrden),
    [s],
  )

  const lineas: EntradaLineaDevolucion[] = useMemo(() => {
    if (!s) return []
    const salida: EntradaLineaDevolucion[] = []
    for (const r of renglones) {
      const producto = s.productos.find((p) => p.id === r.productoId)
      const presentacion = s.presentacionesPorId.get(r.presentacionId)
      const cantidad = Math.max(0, Math.floor(parsearMonto(r.cantidad)))
      const precioUnitario = parsearMonto(r.precio)
      if (!producto || !presentacion || cantidad <= 0) continue
      salida.push({ producto, presentacion, cantidad, precioUnitario })
    }
    return salida
  }, [renglones, s])

  const total = lineas.reduce((x, l) => x + l.cantidad * l.precioUnitario, 0)
  const falta = modo === 'cuenta' && !clienteId

  if (!s) return null
  const snap = s

  function precioSugerido(presentacionId: UUID): number {
    const p = snap.precios.find(
      (x) => x.presentacionId === presentacionId && x.listaId === 'lst-detal',
    )
    return p?.precio ?? 0
  }

  function agregar(productoId: UUID) {
    const base = snap.presentacionesPorProducto.get(productoId)?.find((x) => x.esBase)
    if (!base) return
    setRenglones((r) => [
      ...r,
      {
        key: crypto.randomUUID(),
        productoId,
        presentacionId: base.id,
        cantidad: '',
        precio: String(precioSugerido(base.id)),
      },
    ])
  }

  async function guardar() {
    setGuardando(true)
    await pos.devolver({ lineas, clienteId: clienteId || null, modo, motivo, vuelveAlStock, nota })
    setGuardando(false)
    onCerrar()
  }

  return (
    <Hoja
      titulo="Devolución"
      onCerrar={onCerrar}
      pie={
        <>
          <div className="flex items-end justify-between gap-3 pb-2">
            <div>
              <p className="font-mono text-[9.5px] tracking-[0.14em] text-apagado uppercase">
                {modo === 'efectivo' ? 'Sale de la gaveta' : 'Se le descuenta'}
              </p>
              <p className="tabular text-[22px] leading-tight font-extrabold text-alerta">
                {formato(total, 'USD')}
              </p>
            </div>
            <p className="tabular pb-1 text-[12px] text-apagado">
              {vuelveAlStock ? 'vuelve al anaquel' : 'no se revende'}
            </p>
          </div>
          <button
            onClick={() => void guardar()}
            disabled={guardando || lineas.length === 0 || falta}
            className="w-full rounded-xl bg-alerta py-3.5 text-[16px] font-bold text-white disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : falta ? 'Falta elegir cliente' : 'Registrar devolución'}
          </button>
        </>
      }
    >
      <div className="flex gap-1 pb-3">
        <Opcion activo={modo === 'efectivo'} onClick={() => setModo('efectivo')}>
          Le devuelvo plata
        </Opcion>
        <Opcion activo={modo === 'cuenta'} onClick={() => setModo('cuenta')}>
          Le bajo la deuda
        </Opcion>
      </div>

      <p className="pb-3 text-[12.5px] leading-relaxed text-tinta2">
        {modo === 'efectivo'
          ? 'Sale dinero de la gaveta y el cierre del día lo resta.'
          : 'No sale dinero: se le descuenta de lo que debe en CXC.'}
      </p>

      {(modo === 'cuenta' || pos.clientes.length > 0) && (
        <select
          value={clienteId}
          onChange={(e) => setClienteId(e.target.value)}
          className="mb-3 w-full rounded-xl border border-linea bg-panel2 px-3 py-3 text-[15px]"
          aria-label="Cliente"
        >
          <option value="">{modo === 'cuenta' ? 'Elegir cliente…' : 'Sin cliente (de paso)'}</option>
          {pos.clientes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
              {pos.saldoDe(c.id) > 0 ? ` · debe ${formato(pos.saldoDe(c.id), 'USD')}` : ''}
            </option>
          ))}
        </select>
      )}

      <select
        value={motivo}
        onChange={(e) => setMotivo(e.target.value as MotivoDevolucion)}
        className="w-full rounded-xl border border-linea bg-panel2 px-3 py-3 text-[15px]"
        aria-label="Motivo"
      >
        {MOTIVOS_DEVOLUCION.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nombre}
          </option>
        ))}
      </select>

      <label className="mt-3 flex items-start gap-2.5 rounded-xl border border-linea bg-panel2 px-3 py-3">
        <input
          type="checkbox"
          checked={vuelveAlStock}
          onChange={(e) => setVuelveAlStock(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0"
        />
        <span>
          <span className="block text-[14px] font-semibold">Vuelve al anaquel</span>
          <span className="block pt-0.5 text-[12.5px] leading-relaxed text-tinta2">
            Márcalo solo si se puede volver a vender. Lo que venía en mal estado no entra al
            inventario: si entrara, alguien lo vendería.
          </span>
        </span>
      </label>

      {renglones.length === 0 && (
        <p className="mt-3 rounded-xl border border-linea bg-panel2 px-4 py-4 text-center text-[13.5px] leading-relaxed text-tinta2">
          Agrega abajo lo que devolvió. El precio viene puesto con el de catálogo; cámbialo si se
          lo cobraste distinto.
        </p>
      )}

      <div className="mt-3 flex flex-col gap-2.5">
        {renglones.map((r) => {
          const producto = snap.productos.find((p) => p.id === r.productoId)
          const presentaciones = snap.presentacionesPorProducto.get(r.productoId) ?? []
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
                  value={r.presentacionId}
                  onChange={(e) =>
                    setRenglones((x) =>
                      x.map((y) =>
                        y.key === r.key
                          ? {
                              ...y,
                              presentacionId: e.target.value,
                              precio: String(precioSugerido(e.target.value)),
                            }
                          : y,
                      ),
                    )
                  }
                  className="min-w-0 flex-1 rounded-lg border border-linea bg-panel2 px-2 py-2.5 text-[14px]"
                  aria-label="Presentación"
                >
                  {presentaciones
                    .filter((p) => p.activo)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                        {p.factor > 1 ? ` (×${p.factor})` : ''}
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
                  className="tabular w-16 rounded-lg border border-linea bg-panel2 py-2.5 text-center font-bold"
                  aria-label="Cuántas"
                />
                <div className="flex w-24 items-center rounded-lg border border-linea bg-panel2 px-2">
                  <span className="font-mono text-[11.5px] text-apagado">$</span>
                  <input
                    value={r.precio}
                    onChange={(e) =>
                      setRenglones((x) =>
                        x.map((y) => (y.key === r.key ? { ...y, precio: e.target.value } : y)),
                      )
                    }
                    inputMode="decimal"
                    className="tabular w-full bg-transparent py-2.5 text-right font-bold"
                    aria-label="Precio al que se vendió"
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <input
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder="Nota (opcional)"
        className="mt-3 w-full rounded-xl border border-linea bg-panel2 px-3 py-2.5 placeholder:text-apagado"
        aria-label="Nota"
      />

      <div className="pt-3">
        <p className="pb-1.5 font-mono text-[10px] tracking-[0.14em] text-apagado uppercase">
          Agregar producto
        </p>
        <div className="flex flex-wrap gap-1.5">
          {productos.map((p) => (
            <button
              key={p.id}
              onClick={() => agregar(p.id)}
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

function Opcion({
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
      className={`flex-1 rounded-lg py-2.5 text-[14px] font-semibold ${
        activo ? 'bg-cobre text-fondo' : 'bg-panel2 text-tinta2'
      }`}
    >
      {children}
    </button>
  )
}
