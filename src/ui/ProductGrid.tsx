import { useEffect, useMemo, useRef, useState } from 'react'
import { formato } from '../domain/money'
import { resolverPrecio } from '../domain/pricing'
import type { Presentacion, Producto, UUID } from '../domain/types'
import { UBICACION_FRIO, UBICACION_VENTA_DEFECTO } from '../data/seed'
import type { Pos } from '../hooks/usePos'

/**
 * Cuadrícula de productos.
 *
 * Con 40 productos, tocar es más rápido que escanear: no hay que buscar el
 * código en la botella ni apuntar la pistola. El escáner sigue estando, pero
 * como atajo: teclea el código en el campo de búsqueda y presiona Enter, que es
 * exactamente lo que hace un lector en modo teclado.
 */
export function ProductGrid({ pos }: { pos: Pos }) {
  const [categoria, setCategoria] = useState<UUID | 'todas'>('todas')
  const [busqueda, setBusqueda] = useState('')
  const [abierto, setAbierto] = useState<UUID | null>(null)
  const campo = useRef<HTMLInputElement>(null)

  const s = pos.snapshot

  // El foco vuelve al campo siempre: es lo que permite escanear en cadena
  useEffect(() => {
    const t = setInterval(() => {
      const activo = document.activeElement
      const esCampo = activo instanceof HTMLInputElement || activo instanceof HTMLTextAreaElement
      if (!esCampo && !abierto) campo.current?.focus()
    }, 800)
    return () => clearInterval(t)
  }, [abierto])

  const visibles = useMemo(() => {
    if (!s) return []
    const q = busqueda.trim().toLowerCase()
    return s.productos
      .filter((p) => categoria === 'todas' || p.categoriaId === categoria)
      .filter(
        (p) =>
          q === '' ||
          p.nombre.toLowerCase().includes(q) ||
          p.nombreCorto.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.marca ?? '').toLowerCase().includes(q),
      )
  }, [s, categoria, busqueda])

  function enviar() {
    const valor = busqueda.trim()
    if (valor === '') return

    // Un código de barras es todo dígitos y largo. Cualquier otra cosa es una búsqueda.
    const pareceCodigo = /^\d{6,14}$/.test(valor)
    if (pareceCodigo) {
      if (pos.agregarPorCodigo(valor)) setBusqueda('')
      return
    }

    // Si la búsqueda deja un solo producto, Enter lo agrega
    if (visibles.length === 1) {
      const p = visibles[0]!
      const base = s?.presentacionesPorProducto.get(p.id)?.find((x) => x.esBase)
      if (base) {
        pos.agregarProducto(p, base, ubicacionSugerida(p.id))
        setBusqueda('')
      }
    }
  }

  function ubicacionSugerida(productoId: UUID): UUID {
    const enSala = pos.stockDisponible(productoId, UBICACION_VENTA_DEFECTO)
    const enNevera = pos.stockDisponible(productoId, UBICACION_FRIO)
    return enSala <= 0 && enNevera > 0 ? UBICACION_FRIO : UBICACION_VENTA_DEFECTO
  }

  if (!s) return null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Búsqueda y escáner */}
      <div className="flex items-center gap-2 border-b border-linea px-3 py-2.5">
        <input
          ref={campo}
          autoFocus
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') enviar()
            if (e.key === 'Escape') setBusqueda('')
          }}
          placeholder="Escanea un código o escribe para buscar…"
          className="flex-1 rounded-md border border-linea bg-panel px-3.5 py-2.5 text-[15px] placeholder:text-apagado focus:border-cobre"
        />
        {busqueda && (
          <button
            onClick={() => setBusqueda('')}
            className="rounded-md border border-linea px-3 py-2.5 text-sm text-tinta2 hover:border-linea2"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Categorías */}
      <div className="flex gap-1.5 overflow-x-auto border-b border-linea px-3 py-2">
        <Tab activo={categoria === 'todas'} onClick={() => setCategoria('todas')}>
          Todas
        </Tab>
        {s.categorias.map((c) => (
          <Tab key={c.id} activo={categoria === c.id} onClick={() => setCategoria(c.id)}>
            {c.nombre}
          </Tab>
        ))}
      </div>

      {/* Cuadrícula */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(158px,1fr))] gap-2.5">
          {visibles.map((p) => (
            <Tile
              key={p.id}
              producto={p}
              pos={pos}
              abierto={abierto === p.id}
              onAbrir={() => setAbierto(abierto === p.id ? null : p.id)}
              onCerrar={() => setAbierto(null)}
              ubicacionSugerida={ubicacionSugerida(p.id)}
            />
          ))}
        </div>
        {visibles.length === 0 && (
          <p className="px-1 py-8 text-center text-sm text-apagado">
            Nada coincide con «{busqueda}».
          </p>
        )}
      </div>
    </div>
  )
}

function Tab({
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
      className={`shrink-0 rounded-md px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
        activo ? 'bg-cobre text-fondo' : 'border border-linea text-tinta2 hover:border-linea2'
      }`}
    >
      {children}
    </button>
  )
}

function Tile({
  producto,
  pos,
  abierto,
  onAbrir,
  onCerrar,
  ubicacionSugerida,
}: {
  producto: Producto
  pos: Pos
  abierto: boolean
  onAbrir: () => void
  onCerrar: () => void
  ubicacionSugerida: UUID
}) {
  const s = pos.snapshot!
  const presentaciones = s.presentacionesPorProducto.get(producto.id) ?? []
  const base = presentaciones.find((p) => p.esBase)
  const otras = presentaciones.filter((p) => !p.esBase && p.permiteVenta)

  const enSala = pos.stockDisponible(producto.id, UBICACION_VENTA_DEFECTO)
  const enNevera = pos.stockDisponible(producto.id, UBICACION_FRIO)
  const total = enSala + enNevera
  const agotado = total <= 0
  const bajo = !agotado && total <= producto.stockMin

  const precio = base
    ? resolverPrecio(
        {
          presentacionId: base.id,
          cantidadBase: 1,
          ubicacionId: ubicacionSugerida,
          tipoCliente: 'detal',
          momento: Date.now(),
        },
        { listas: s.listas, precios: s.precios },
      )
    : null

  return (
    <div className="relative">
      <button
        disabled={agotado || !base}
        onClick={() => base && pos.agregarProducto(producto, base, ubicacionSugerida)}
        className={`flex h-[104px] w-full flex-col justify-between rounded-lg border p-2.5 text-left transition-colors ${
          agotado
            ? 'cursor-not-allowed border-linea bg-panel/40 opacity-45'
            : 'border-linea bg-panel hover:border-cobre hover:bg-panel2 active:bg-panel3'
        }`}
      >
        <span className="line-clamp-2 text-[13.5px] leading-tight font-semibold">
          {producto.nombreCorto}
        </span>

        <span className="flex w-full items-end justify-between gap-1">
          <span className="flex flex-col">
            <span className="tabular text-[17px] leading-none font-bold text-cobre2">
              {precio ? formato(precio.precio, 'USD') : '—'}
            </span>
            <span
              className={`tabular mt-1 font-mono text-[10px] ${
                agotado ? 'text-alerta' : bajo ? 'text-ambar' : 'text-apagado'
              }`}
            >
              {agotado ? 'agotado' : `${total} und`}
            </span>
          </span>
          {enNevera > 0 && (
            <span className="rounded bg-frio/15 px-1.5 py-0.5 font-mono text-[9px] tracking-wider text-frio uppercase">
              frío {enNevera}
            </span>
          )}
        </span>
      </button>

      {/* Otras presentaciones: six-pack, caja, trago */}
      {otras.length > 0 && !agotado && (
        <button
          onClick={onAbrir}
          aria-label={`Presentaciones de ${producto.nombreCorto}`}
          className="absolute top-1.5 right-1.5 rounded border border-linea2 bg-panel2 px-1.5 py-0.5 font-mono text-[10px] text-tinta2 hover:border-cobre hover:text-cobre2"
        >
          ▾
        </button>
      )}

      {abierto && (
        <>
          <div className="fixed inset-0 z-10" onClick={onCerrar} aria-hidden />
          <div className="absolute top-2 right-2 z-20 w-52 overflow-hidden rounded-lg border border-linea2 bg-panel2 shadow-2xl">
            {presentaciones
              .filter((p) => p.permiteVenta)
              .map((p) => (
                <PresentacionItem
                  key={p.id}
                  presentacion={p}
                  producto={producto}
                  pos={pos}
                  ubicacion={ubicacionSugerida}
                  onElegir={onCerrar}
                />
              ))}
            {enNevera > 0 && base && (
              <button
                onClick={() => {
                  pos.agregarProducto(producto, base, UBICACION_FRIO)
                  onCerrar()
                }}
                className="flex w-full items-center justify-between border-t border-linea px-3 py-2.5 text-left text-frio hover:bg-panel3"
              >
                <span className="text-[13px] font-medium">Unidad fría</span>
                <span className="font-mono text-[10px] tracking-wider uppercase">nevera</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function PresentacionItem({
  presentacion,
  producto,
  pos,
  ubicacion,
  onElegir,
}: {
  presentacion: Presentacion
  producto: Producto
  pos: Pos
  ubicacion: UUID
  onElegir: () => void
}) {
  const s = pos.snapshot!
  const precio = resolverPrecio(
    {
      presentacionId: presentacion.id,
      cantidadBase: presentacion.factor,
      ubicacionId: ubicacion,
      tipoCliente: 'detal',
      momento: Date.now(),
    },
    { listas: s.listas, precios: s.precios },
  )

  return (
    <button
      onClick={() => {
        pos.agregarProducto(producto, presentacion, ubicacion)
        onElegir()
      }}
      className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-panel3"
    >
      <span className="flex flex-col">
        <span className="text-[13px] font-medium">{presentacion.nombre}</span>
        <span className="font-mono text-[10px] text-apagado">
          {presentacion.factor >= 1
            ? `${presentacion.factor} und`
            : `${Math.round(1 / presentacion.factor)} por botella`}
        </span>
      </span>
      <span className="tabular text-[13px] font-semibold text-cobre2">
        {precio ? formato(precio.precio, 'USD') : '—'}
      </span>
    </button>
  )
}
