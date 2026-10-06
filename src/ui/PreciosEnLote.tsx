import { useMemo, useState } from 'react'
import { calcularCambios, type CambioLote } from '../domain/preciosLote'
import { compararPorOrden } from '../domain/catalogo'
import { DECIMALES_PRECIO, MONEDAS, aBase, parsearMonto } from '../domain/money'
import type { UUID } from '../domain/types'
import type { Pos } from '../hooks/usePos'
import { useMoneda } from './moneda'

/**
 * Cambiar el precio de varios productos a la vez.
 *
 * Tres cervezas al mismo precio son tres visitas al formulario, y cuando sube
 * el proveedor hay que repasar el catálogo entero.
 *
 * Nada se escribe hasta confirmar, y antes se enseña exactamente qué precio
 * cambia y a cuánto. Un cambio masivo que se aplica sin que se vea lo que va a
 * pasar es la clase de botón que nadie se atreve a tocar dos veces.
 */
export function PreciosEnLote({ pos, onCerrar }: { pos: Pos; onCerrar: () => void }) {
  const { moneda, tasas, texto: enMoneda } = useMoneda()
  const s = pos.snapshot

  const [elegidos, setElegidos] = useState<Set<UUID>>(new Set())
  const [modo, setModo] = useState<'fijar' | 'porcentaje'>('fijar')
  const [valor, setValor] = useState('')
  const [proporcion, setProporcion] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [categoria, setCategoria] = useState<UUID | 'todas'>('todas')
  const [guardando, setGuardando] = useState(false)

  const tasa = moneda === 'USD' ? 1 : (tasas[moneda] ?? 0)
  const sinTasa = moneda !== 'USD' && tasa <= 0

  const productos = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return (s?.productos ?? [])
      .filter((p) => categoria === 'todas' || p.categoriaId === categoria)
      .filter((p) => q === '' || p.nombreCorto.toLowerCase().includes(q))
      .slice()
      .sort(compararPorOrden)
  }, [s, busqueda, categoria])

  const cambio: CambioLote = useMemo(() => {
    const n = parsearMonto(valor)
    return modo === 'fijar'
      ? {
          tipo: 'fijar',
          precioBase: aBase(n, moneda, tasa, DECIMALES_PRECIO),
          mantenerProporcion: proporcion,
        }
      : { tipo: 'porcentaje', porcentaje: n }
  }, [modo, valor, proporcion, moneda, tasa])

  const cambios = useMemo(() => {
    if (!s || elegidos.size === 0 || parsearMonto(valor) === 0) return []
    return calcularCambios({
      productos: s.productos.filter((p) => elegidos.has(p.id)),
      presentacionesPorProducto: s.presentacionesPorProducto,
      precios: s.precios,
      listaDetal: 'lst-detal',
      cambio,
    })
  }, [s, elegidos, valor, cambio])

  const productosTocados = new Set(cambios.map((c) => c.productoId)).size

  if (!s) return null
  const snap = s

  function alternar(id: UUID) {
    setElegidos((x) => {
      const copia = new Set(x)
      if (copia.has(id)) copia.delete(id)
      else copia.add(id)
      return copia
    })
  }

  function precioDe(productoId: UUID): number {
    const base = snap.presentacionesPorProducto.get(productoId)?.find((p) => p.esBase)
    if (!base) return 0
    return snap.precios.find((x) => x.presentacionId === base.id && x.listaId === 'lst-detal')?.precio ?? 0
  }

  async function aplicar() {
    setGuardando(true)
    await pos.cambiarPreciosEnLote(
      cambios.map((c) => ({ id: c.id, precio: c.nuevo, productoId: c.productoId })),
    )
    setGuardando(false)
    onCerrar()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-fondo">
      <header className="pad-arriba shrink-0 border-b border-linea bg-panel">
        <div className="flex items-center gap-2 px-3 py-2">
          <button onClick={onCerrar} className="h-10 w-9 text-[24px] leading-none text-tinta2">
            ‹
          </button>
          <h1 className="flex-1 text-[17px] font-bold">Precios en lote</h1>
          <span className="tabular font-mono text-[12px] text-apagado">
            {elegidos.size} elegidos
          </span>
        </div>
      </header>

      <div className="shrink-0 border-b border-linea bg-panel px-3 pb-2.5">
        <div className="flex gap-1 pb-2">
          <Modo activo={modo === 'fijar'} onClick={() => setModo('fijar')}>
            Poner el mismo precio
          </Modo>
          <Modo activo={modo === 'porcentaje'} onClick={() => setModo('porcentaje')}>
            Subir o bajar %
          </Modo>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[13px] text-apagado">
            {modo === 'fijar' ? MONEDAS[moneda].simbolo : '%'}
          </span>
          <input
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            inputMode="decimal"
            placeholder={modo === 'fijar' ? '0' : '10'}
            disabled={modo === 'fijar' && sinTasa}
            className="tabular min-w-0 flex-1 rounded-lg border border-linea bg-panel2 px-3 py-2.5 text-right text-[16px] font-bold disabled:opacity-40"
            aria-label={modo === 'fijar' ? 'Precio nuevo' : 'Porcentaje'}
          />
        </div>

        {modo === 'fijar' ? (
          <label className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              checked={proporcion}
              onChange={(e) => setProporcion(e.target.checked)}
              className="h-5 w-5"
            />
            <span className="text-[12.5px] leading-snug text-tinta2">
              Mover también paquetes y cajas, conservando su descuento
            </span>
          </label>
        ) : (
          <p className="pt-2 text-[12.5px] leading-relaxed text-apagado">
            Cada producto sube desde su propio precio. Pon un número negativo para bajar.
          </p>
        )}
      </div>

      <div className="flex shrink-0 gap-2 px-3 pt-2.5">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar…"
          className="min-w-0 flex-1 rounded-xl border border-linea bg-panel2 px-3 py-2 placeholder:text-apagado"
          aria-label="Buscar producto"
        />
        <button
          onClick={() =>
            setElegidos((x) =>
              x.size === productos.length ? new Set() : new Set(productos.map((p) => p.id)),
            )
          }
          className="shrink-0 rounded-xl border border-linea2 px-3 py-2 text-[12.5px] font-semibold text-tinta2"
        >
          {elegidos.size === productos.length ? 'Ninguno' : 'Todos'}
        </button>
      </div>

      <div className="shrink-0 px-3 pt-2">
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className={`w-full rounded-xl border bg-panel2 px-2.5 py-2.5 text-[13.5px] ${
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
      </div>

      <ul className="scroll-y mt-2 min-h-0 flex-1 px-3 pb-3">
        {productos.map((p) => {
          const elegido = elegidos.has(p.id)
          const nuevo = cambios.find(
            (c) => c.productoId === p.id && c.presentacionId.endsWith('-base'),
          )
          return (
            <li key={p.id}>
              <button
                onClick={() => alternar(p.id)}
                className={`mb-1.5 flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left ${
                  elegido ? 'border-cobre bg-cobre/10' : 'border-linea bg-panel'
                }`}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[12px] font-bold ${
                    elegido ? 'border-cobre bg-cobre text-white' : 'border-linea2'
                  }`}
                >
                  {elegido ? '✓' : ''}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">
                  {p.nombreCorto}
                </span>
                <span className="tabular shrink-0 text-right text-[13px]">
                  {nuevo ? (
                    <>
                      <span className="text-apagado line-through">{enMoneda(nuevo.anterior)}</span>
                      <span className="pl-1.5 font-bold text-cobre2">{enMoneda(nuevo.nuevo)}</span>
                    </>
                  ) : (
                    <span className={elegido ? 'text-tinta2' : 'text-apagado'}>
                      {enMoneda(precioDe(p.id))}
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="pad-abajo shrink-0 border-t border-linea bg-panel px-3 py-2.5">
        {cambios.length > 0 && (
          <p className="pb-2 text-center text-[12.5px] text-apagado">
            {cambios.length} {cambios.length === 1 ? 'precio' : 'precios'} en {productosTocados}{' '}
            {productosTocados === 1 ? 'producto' : 'productos'}
            {modo === 'fijar' &&
              proporcion &&
              cambios.length > productosTocados &&
              ' · incluye paquetes y cajas'}
          </p>
        )}
        <button
          onClick={() => void aplicar()}
          disabled={guardando || cambios.length === 0}
          className="w-full rounded-xl bg-cobre py-3.5 text-[16px] font-bold text-fondo disabled:opacity-40"
        >
          {guardando
            ? 'Guardando…'
            : cambios.length === 0
              ? elegidos.size === 0
                ? 'Elige productos'
                : 'Sin cambios que aplicar'
              : `Aplicar a ${productosTocados} ${productosTocados === 1 ? 'producto' : 'productos'}`}
        </button>
      </div>
    </div>
  )
}

function Modo({
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
      className={`flex-1 rounded-lg py-2 text-[13px] font-semibold ${
        activo ? 'bg-cobre text-fondo' : 'bg-panel2 text-tinta2'
      }`}
    >
      {children}
    </button>
  )
}
