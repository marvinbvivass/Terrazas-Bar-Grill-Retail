import { useMemo, useState } from 'react'
import { parsearMonto } from '../domain/money'
import { compararPorOrden } from '../domain/catalogo'
import type { EntradaLineaRecepcion } from '../domain/recepcion'
import type { Presentacion, Producto, UUID } from '../domain/types'
import { UBICACION_VENTA_DEFECTO } from '../data/seed'
import type { Pos } from '../hooks/usePos'
import { Hoja } from './Hoja'

interface Renglon {
  key: string
  productoId: UUID
  presentacionId: UUID
  cantidad: string
  ubicacionId: UUID
}

/**
 * Recibir mercancía del proveedor.
 *
 * Una sola pregunta: qué llegó y cuánto. Nada más.
 *
 * Aquí se tecleaba también el número de factura, el costo de cada caja y los
 * vacíos del despacho. Las tres cosas se fueron, y por razones distintas:
 *
 * - La factura es el papel del proveedor, y el papel ya existe. Teclear su
 *   número no mueve una sola botella.
 * - El costo alimentaba un margen que nadie mira. Era el campo que más tiempo
 *   costaba y el primero que se dejaba en blanco cuando había prisa, que es la
 *   peor combinación posible: trabajo cierto a cambio de un número dudoso.
 * - Los vacíos del camión tienen su propia pantalla, donde se ven las dos
 *   deudas juntas. Contarlos aquí obligaba a hacer dos trabajos a la vez justo
 *   cuando el chofer está esperando.
 *
 * Al guardar sube el stock y queda el asiento de kardex. Eso es todo lo que
 * esta pantalla promete y todo lo que hace.
 */
export function HojaRecepcion({ pos, onCerrar }: { pos: Pos; onCerrar: () => void }) {
  const s = pos.snapshot
  const [proveedor, setProveedor] = useState('')
  const [renglones, setRenglones] = useState<Renglon[]>([])
  const [categoria, setCategoria] = useState<UUID | 'todas'>('todas')
  const [guardando, setGuardando] = useState(false)

  /*
   * El filtro por categoría es para el camión que trae una sola cosa.
   * Con sesenta productos en el catálogo, encontrar las cuatro cervezas entre
   * refrescos y snacks es la parte lenta de recibir un despacho de cerveza.
   */
  const productos = useMemo(
    () =>
      (s?.productos ?? [])
        .filter((p) => categoria === 'todas' || p.categoriaId === categoria)
        .slice()
        .sort(compararPorOrden),
    [s, categoria],
  )

  const preparados = useMemo(() => {
    if (!s) return []
    const salida: Array<{ renglon: Renglon; entrada: EntradaLineaRecepcion }> = []
    for (const r of renglones) {
      const producto = s.productos.find((p) => p.id === r.productoId)
      const presentacion = s.presentacionesPorId.get(r.presentacionId)
      if (!producto || !presentacion) continue
      const cantidad = Math.max(0, Math.floor(parsearMonto(r.cantidad)))
      if (cantidad <= 0) continue
      salida.push({
        renglon: r,
        entrada: { producto, presentacion, cantidad, ubicacionId: r.ubicacionId },
      })
    }
    return salida
  }, [renglones, s])

  const unidades = preparados.reduce(
    (x, p) => x + p.entrada.cantidad * p.entrada.presentacion.factor,
    0,
  )

  if (!s) return null
  const snap = s

  function presentacionesDe(productoId: UUID): Presentacion[] {
    return (snap.presentacionesPorProducto.get(productoId) ?? []).filter((p) => p.activo)
  }

  function agregarRenglon(producto: Producto) {
    const base = presentacionesDe(producto.id).find((p) => p.esBase)
    if (!base) return
    setRenglones((r) => [
      ...r,
      {
        key: crypto.randomUUID(),
        productoId: producto.id,
        // Se propone la presentación más grande: la mercancía casi siempre
        // llega en cajas, y así el encargado teclea menos.
        presentacionId: presentacionesDe(producto.id).at(-1)?.id ?? base.id,
        cantidad: '',
        ubicacionId: UBICACION_VENTA_DEFECTO,
      },
    ])
  }

  function cambiar(key: string, cambios: Partial<Renglon>) {
    setRenglones((r) => r.map((x) => (x.key === key ? { ...x, ...cambios } : x)))
  }

  async function guardar() {
    setGuardando(true)
    await pos.recibirMercancia({ lineas: preparados.map((p) => p.entrada), proveedor })
    setGuardando(false)
    onCerrar()
  }

  return (
    <Hoja
      titulo="Recibir mercancía"
      onCerrar={onCerrar}
      pie={
        <>
          <div className="flex items-end justify-between gap-3 pb-2">
            <div>
              <p className="font-mono text-[9.5px] tracking-[0.14em] text-apagado uppercase">
                Entra al inventario
              </p>
              <p className="tabular text-[22px] leading-tight font-extrabold">
                {unidades} {unidades === 1 ? 'unidad' : 'unidades'}
              </p>
            </div>
            <p className="tabular pb-1 text-[12.5px] text-apagado">
              {preparados.length} {preparados.length === 1 ? 'renglón' : 'renglones'}
            </p>
          </div>
          <button
            onClick={() => void guardar()}
            disabled={guardando || preparados.length === 0}
            className="w-full rounded-xl bg-cobre py-3.5 text-[16px] font-bold text-fondo disabled:opacity-40"
          >
            {guardando ? 'Guardando…' : 'Registrar la entrada'}
          </button>
        </>
      }
    >
      <input
        value={proveedor}
        onChange={(e) => setProveedor(e.target.value)}
        placeholder="Proveedor (opcional)"
        className="w-full rounded-xl border border-linea bg-panel2 px-3 py-2.5 placeholder:text-apagado"
        aria-label="Proveedor"
      />

      {renglones.length === 0 && (
        <p className="mt-3 rounded-xl border border-linea bg-panel2 px-4 py-4 text-center text-[13.5px] leading-relaxed text-tinta2">
          Agrega abajo lo que llegó. Dices si vino en cajas, en paquetes o suelto, y cuántas.
        </p>
      )}

      <div className="flex flex-col gap-2.5 pt-3">
        {renglones.map((r) => {
          const producto = snap.productos.find((p) => p.id === r.productoId)
          const presentacion = snap.presentacionesPorId.get(r.presentacionId)
          const cantidad = Math.max(0, Math.floor(parsearMonto(r.cantidad)))
          const factor = presentacion?.factor ?? 1
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
                  onChange={(e) => cambiar(r.key, { presentacionId: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-linea bg-panel2 px-2 py-2.5 text-[14px]"
                  aria-label="Presentación"
                >
                  {presentacionesDe(r.productoId).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                      {p.factor > 1 ? ` (×${p.factor})` : ''}
                    </option>
                  ))}
                </select>
                <input
                  value={r.cantidad}
                  onChange={(e) => cambiar(r.key, { cantidad: e.target.value })}
                  inputMode="numeric"
                  placeholder="0"
                  className="tabular w-20 rounded-lg border border-linea bg-panel2 py-2.5 text-center text-[16px] font-bold"
                  aria-label="Cuántas"
                />
              </div>

              {cantidad > 0 && factor > 1 && (
                <p className="tabular pt-2 text-right text-[11.5px] text-apagado">
                  {cantidad * factor} u.
                </p>
              )}
            </div>
          )
        })}
      </div>

      <div className="pt-4">
        <p className="pb-1.5 font-mono text-[10px] tracking-[0.14em] text-apagado uppercase">
          Agregar producto
        </p>

        {snap.categorias.length > 0 && (
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className={`mb-2 w-full rounded-xl border bg-panel2 px-2.5 py-2.5 text-[13.5px] ${
              categoria === 'todas' ? 'border-linea text-tinta2' : 'border-cobre text-cobre2'
            }`}
            aria-label="Filtrar por categoría"
          >
            <option value="todas">Todas las categorías</option>
            {snap.categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        )}

        {snap.productos.length === 0 ? (
          <p className="text-[13px] text-apagado">No hay productos. Créalos en el catálogo.</p>
        ) : productos.length === 0 ? (
          <p className="text-[13px] text-apagado">No hay productos en esa categoría.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {productos.map((p) => (
              <button
                key={p.id}
                onClick={() => agregarRenglon(p)}
                className="rounded-full border border-linea2 px-3 py-1.5 text-[12.5px] text-tinta2"
                style={{ minHeight: 0 }}
              >
                + {p.nombreCorto}
              </button>
            ))}
          </div>
        )}
      </div>
    </Hoja>
  )
}
