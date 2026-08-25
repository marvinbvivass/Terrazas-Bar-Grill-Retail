import { useMemo, useState } from 'react'
import {
  armarProducto,
  desarmarProducto,
  margen,
  validarProducto,
  type PresentacionForm,
  type ProductoForm,
} from '../domain/catalogo'
import { formato, parsearMonto } from '../domain/money'
import { CONTEXTO_CATALOGO, UBICACION_FRIO, UBICACION_VENTA_DEFECTO } from '../data/seed'
import type { Producto } from '../domain/types'
import type { Pos } from '../hooks/usePos'

const VACIO: ProductoForm = {
  nombre: '',
  nombreCorto: '',
  categoriaId: 'cat-cerveza',
  precioDetal: 0,
  costo: 0,
  stockSala: 0,
  stockNevera: 0,
  stockMin: 0,
  presentaciones: [],
}

/**
 * Catálogo: dar de alta y editar productos.
 *
 * La aplicación arranca sin ni un producto a propósito, así que esta pantalla
 * es por donde se empieza. Un producto son en realidad cinco cosas —ficha,
 * presentaciones, códigos, precios por lista y existencia inicial—, pero el
 * formulario pide solo lo que el encargado sabe de memoria y arma el resto.
 */
export function CatalogoView({ pos }: { pos: Pos }) {
  const [editando, setEditando] = useState<ProductoForm | null>(null)
  const [busqueda, setBusqueda] = useState('')

  const s = pos.snapshot
  const productos = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return (s?.productos ?? [])
      .filter((p) => q === '' || p.nombre.toLowerCase().includes(q) || p.nombreCorto.toLowerCase().includes(q))
      .sort((a, b) => a.nombreCorto.localeCompare(b.nombreCorto))
  }, [s, busqueda])

  function editar(p: Producto) {
    if (!s) return
    const pres = s.presentacionesPorProducto.get(p.id) ?? []
    const idsPres = new Set(pres.map((x) => x.id))
    setEditando(
      desarmarProducto(
        p,
        pres,
        [...s.codigos.values()].filter((c) => idsPres.has(c.presentacionId)),
        s.precios.filter((x) => idsPres.has(x.presentacionId)),
        s.existencias,
        CONTEXTO_CATALOGO,
      ),
    )
  }

  if (editando) {
    return (
      <Editor
        pos={pos}
        inicial={editando}
        onCerrar={() => setEditando(null)}
      />
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl px-6 py-6">
        <header className="mb-5 flex items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[0.16em] text-apagado uppercase">Catálogo</p>
            <h1 className="text-2xl font-bold">
              {productos.length === 0 ? 'Todavía no hay productos' : `${productos.length} producto${productos.length === 1 ? '' : 's'}`}
            </h1>
          </div>
          <button
            onClick={() => setEditando({ ...VACIO, categoriaId: s?.categorias[0]?.id ?? 'cat-cerveza' })}
            className="rounded-lg bg-cobre px-5 py-2.5 text-[14px] font-bold text-fondo hover:bg-cobre2"
          >
            Producto nuevo
          </button>
        </header>

        {productos.length === 0 ? (
          <div className="rounded-xl border border-linea bg-panel px-6 py-10">
            <p className="text-[15px] text-tinta2">
              El sistema arranca vacío a propósito: no hay productos de mentira que después haya
              que borrar.
            </p>
            <p className="mt-3 text-[14px] text-apagado">
              Carga los primeros con <strong className="text-tinta2">Producto nuevo</strong>. Solo
              hacen falta el nombre, la categoría, el precio de una unidad y lo que te cuesta a ti.
              Todo lo demás —las presentaciones, el precio de mayor, el código de barras— se puede
              agregar después sin rehacer nada.
            </p>
          </div>
        ) : (
          <>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar…"
              className="mb-3 w-full rounded-md border border-linea bg-panel px-3.5 py-2.5 placeholder:text-apagado focus:border-cobre"
            />
            <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-panel">
              {productos.map((p) => {
                const pres = s?.presentacionesPorProducto.get(p.id) ?? []
                const base = pres.find((x) => x.esBase)
                const precio = base
                  ? s?.precios.find((x) => x.presentacionId === base.id && x.listaId === 'lst-detal')?.precio
                  : undefined
                const enSala = pos.stockDe(p.id, UBICACION_VENTA_DEFECTO)
                const enNevera = pos.stockDe(p.id, UBICACION_FRIO)
                const m = precio ? margen(precio, p.costoPromedio, p.iva) : 0

                return (
                  <li key={p.id}>
                    <button
                      onClick={() => editar(p)}
                      className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-panel2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14.5px] font-semibold">{p.nombreCorto}</p>
                        <p className="truncate font-mono text-[10.5px] text-apagado">
                          {p.nombre}
                          {pres.length > 1 && ` · ${pres.length} presentaciones`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="tabular text-[14px] font-bold text-cobre2">
                          {precio !== undefined ? formato(precio, 'USD') : '—'}
                        </p>
                        <p className="tabular font-mono text-[10px] text-apagado">
                          margen {m}%
                        </p>
                      </div>
                      <div className="w-24 text-right">
                        <p className="tabular text-[13px]">{enSala + enNevera} und</p>
                        {enNevera > 0 && (
                          <p className="tabular font-mono text-[10px] text-frio">{enNevera} frío</p>
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

function Editor({
  pos,
  inicial,
  onCerrar,
}: {
  pos: Pos
  inicial: ProductoForm
  onCerrar: () => void
}) {
  const [f, setF] = useState<ProductoForm>(inicial)
  const [guardando, setGuardando] = useState(false)
  const esNuevo = !inicial.id

  const problemas = validarProducto(f)
  const puedeGuardar = problemas.filter((p) => p.campo !== 'precioFrio' && p.campo !== 'costo').length === 0 && f.precioDetal > 0
  const m = margen(f.precioDetal, f.costo, f.exento ? 0 : 0.16)

  const set = <K extends keyof ProductoForm>(k: K, v: ProductoForm[K]) => setF((x) => ({ ...x, [k]: v }))

  function cambiarPres(i: number, campo: keyof PresentacionForm, valor: string | number) {
    setF((x) => {
      const lista = [...(x.presentaciones ?? [])]
      lista[i] = { ...lista[i]!, [campo]: valor }
      return { ...x, presentaciones: lista }
    })
  }

  async function guardar() {
    setGuardando(true)
    await pos.guardarProducto(armarProducto(f, CONTEXTO_CATALOGO))
    setGuardando(false)
    onCerrar()
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-6">
        <header className="mb-5 flex items-center justify-between">
          <h1 className="text-2xl font-bold">{esNuevo ? 'Producto nuevo' : f.nombreCorto || 'Editar producto'}</h1>
          <button
            onClick={onCerrar}
            className="rounded px-3 py-1.5 font-mono text-[11px] tracking-wider text-apagado uppercase hover:text-tinta"
          >
            Volver
          </button>
        </header>

        {/* --- Identidad --- */}
        <Bloque titulo="Qué es">
          <Campo etiqueta="Nombre completo" ancho="col-span-2">
            <input
              autoFocus
              value={f.nombre}
              onChange={(e) => {
                const v = e.target.value
                setF((x) => ({
                  ...x,
                  nombre: v,
                  // El nombre corto se autocompleta mientras no lo toquen
                  nombreCorto: x.nombreCorto === '' || x.nombreCorto === x.nombre.slice(0, 16) ? v.slice(0, 16) : x.nombreCorto,
                }))
              }}
              placeholder="Cerveza Polar Pilsen 222 ml"
              className={entrada}
            />
          </Campo>

          <Campo etiqueta="Nombre corto" ayuda="El que va en el botón">
            <input
              value={f.nombreCorto}
              onChange={(e) => set('nombreCorto', e.target.value)}
              maxLength={18}
              placeholder="Polar Pilsen"
              className={entrada}
            />
          </Campo>

          <Campo etiqueta="Categoría">
            <select
              value={f.categoriaId}
              onChange={(e) => set('categoriaId', e.target.value)}
              className={entrada}
            >
              {pos.snapshot?.categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </Campo>

          <Campo etiqueta="Código de barras" ayuda="Opcional: sin él se toca en pantalla">
            <input
              value={f.codigoBarras ?? ''}
              onChange={(e) => set('codigoBarras', e.target.value)}
              inputMode="numeric"
              placeholder="7591234000018"
              className={entrada}
            />
          </Campo>

          <Campo etiqueta="Contenido ml" ayuda="Opcional">
            <input
              value={f.contenidoMl ?? ''}
              onChange={(e) => set('contenidoMl', Number(e.target.value) || undefined)}
              inputMode="numeric"
              className={entrada}
            />
          </Campo>
        </Bloque>

        {/* --- Precio --- */}
        <Bloque titulo="Cuánto cuesta">
          <Campo etiqueta="Precio de una unidad" ayuda="Con el IVA ya incluido, como lo cobras">
            <input
              value={f.precioDetal || ''}
              onChange={(e) => set('precioDetal', parsearMonto(e.target.value))}
              inputMode="decimal"
              placeholder="1,00"
              className={`${entrada} text-right text-lg font-bold`}
            />
          </Campo>

          <Campo etiqueta="Precio frío" ayuda="Solo si lo cobras más caro de la nevera">
            <input
              value={f.precioFrio || ''}
              onChange={(e) => set('precioFrio', parsearMonto(e.target.value) || undefined)}
              inputMode="decimal"
              placeholder="igual que arriba"
              className={`${entrada} text-right`}
            />
          </Campo>

          <Campo etiqueta="Lo que te cuesta" ayuda="Por unidad. Sin esto no hay margen">
            <input
              value={f.costo || ''}
              onChange={(e) => set('costo', parsearMonto(e.target.value))}
              inputMode="decimal"
              placeholder="0,60"
              className={`${entrada} text-right`}
            />
          </Campo>

          <div className="col-span-2 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg bg-panel2 px-3.5 py-2.5">
            <span className="font-mono text-[10px] tracking-[0.12em] text-apagado uppercase">Margen</span>
            <span className={`tabular text-lg font-bold ${m <= 0 ? 'text-alerta' : m < 15 ? 'text-ambar' : 'text-verde'}`}>
              {m}%
            </span>
            <span className="font-mono text-[11px] text-apagado">
              El mayoreo se calcula solo: {f.categoriaId === 'cat-cerveza' || f.categoriaId === 'cat-mezcla' || f.categoriaId === 'cat-snacks' || f.categoriaId === 'cat-cigarrillos' || f.categoriaId === 'cat-hielo'
                ? '12% menos desde 24 unidades'
                : '8% menos desde 6 unidades'}
            </span>
          </div>

          <Campo etiqueta="Exento de IVA">
            <Interruptor valor={f.exento ?? false} onCambio={(v) => set('exento', v)} />
          </Campo>
          <Campo etiqueta="Envase retornable" ayuda="Cerveza de casco">
            <Interruptor valor={f.retornable ?? false} onCambio={(v) => set('retornable', v)} />
          </Campo>
        </Bloque>

        {/* --- Presentaciones --- */}
        <Bloque titulo="Six-packs y cajas" opcional>
          <div className="col-span-2">
            <p className="mb-2 text-[13px] text-apagado">
              Solo si además de por unidad lo vendes por paquete. Una caja no es otro producto: es
              la misma botella contada de otra forma, así que el stock sigue siendo uno solo.
            </p>
            {(f.presentaciones ?? []).map((p, i) => (
              <div key={i} className="mb-2 flex flex-wrap items-end gap-2">
                <label className="flex-1">
                  <span className={etiqueta}>Nombre</span>
                  <input
                    value={p.nombre}
                    onChange={(e) => cambiarPres(i, 'nombre', e.target.value)}
                    placeholder="Six-pack"
                    className={entrada}
                  />
                </label>
                <label className="w-28">
                  <span className={etiqueta}>Trae</span>
                  <input
                    value={p.factor || ''}
                    onChange={(e) => cambiarPres(i, 'factor', Number(e.target.value) || 0)}
                    inputMode="numeric"
                    placeholder="6"
                    className={`${entrada} text-right`}
                  />
                </label>
                <label className="w-32">
                  <span className={etiqueta}>Precio total</span>
                  <input
                    value={p.precio || ''}
                    onChange={(e) => cambiarPres(i, 'precio', parsearMonto(e.target.value))}
                    inputMode="decimal"
                    placeholder="5,70"
                    className={`${entrada} text-right`}
                  />
                </label>
                <button
                  onClick={() => set('presentaciones', (f.presentaciones ?? []).filter((_, j) => j !== i))}
                  className="h-[42px] rounded-md border border-linea px-3 font-mono text-[10px] tracking-wider text-apagado uppercase hover:border-alerta hover:text-alerta"
                >
                  Quitar
                </button>
              </div>
            ))}
            <button
              onClick={() => set('presentaciones', [...(f.presentaciones ?? []), { nombre: '', factor: 0, precio: 0 }])}
              className="mt-1 rounded-md border border-linea2 px-3.5 py-2 text-[13px] font-semibold text-tinta2 hover:border-cobre hover:text-cobre2"
            >
              Agregar presentación
            </button>
          </div>
        </Bloque>

        {/* --- Stock --- */}
        <Bloque titulo={esNuevo ? 'Cuánto tienes hoy' : 'Existencia'}>
          <Campo etiqueta="En la sala" ayuda="Unidades en el anaquel">
            <input
              value={f.stockSala || ''}
              onChange={(e) => set('stockSala', Number(e.target.value) || 0)}
              inputMode="numeric"
              className={`${entrada} text-right`}
            />
          </Campo>
          <Campo etiqueta="En la nevera">
            <input
              value={f.stockNevera || ''}
              onChange={(e) => set('stockNevera', Number(e.target.value) || 0)}
              inputMode="numeric"
              className={`${entrada} text-right`}
            />
          </Campo>
          <Campo etiqueta="Avisarme desde" ayuda="Cuando baje de aquí">
            <input
              value={f.stockMin || ''}
              onChange={(e) => set('stockMin', Number(e.target.value) || 0)}
              inputMode="numeric"
              className={`${entrada} text-right`}
            />
          </Campo>
          {!esNuevo && (
            <p className="col-span-2 text-[12.5px] text-ambar">
              Ojo: cambiar estos números aquí es un ajuste directo de inventario, no una compra.
              Lo correcto para una entrada de mercancía será el módulo de recepción.
            </p>
          )}
        </Bloque>

        {problemas.length > 0 && (
          <ul className="mb-4 space-y-1 rounded-lg border border-ambar/40 bg-ambar/10 px-4 py-3">
            {problemas.map((p, i) => (
              <li key={i} className="text-[13px] text-ambar">{p.mensaje}</li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-3 pb-8">
          <button
            disabled={!puedeGuardar || guardando}
            onClick={() => void guardar()}
            className="rounded-lg bg-cobre px-6 py-3 text-[15px] font-bold text-fondo hover:bg-cobre2 disabled:cursor-not-allowed disabled:bg-panel3 disabled:text-apagado"
          >
            {guardando ? 'Guardando…' : esNuevo ? 'Crear producto' : 'Guardar cambios'}
          </button>
          <button onClick={onCerrar} className="px-3 py-3 text-[14px] text-apagado hover:text-tinta">
            Cancelar
          </button>
          {!esNuevo && (
            <button
              onClick={async () => {
                await pos.desactivarProducto(inicial.id!)
                onCerrar()
              }}
              className="ml-auto font-mono text-[10px] tracking-wider text-apagado uppercase hover:text-alerta"
              title="Deja de aparecer en la caja, pero se conserva en las ventas viejas"
            >
              Dar de baja
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const entrada =
  'mt-1 w-full rounded-md border border-linea2 bg-panel2 px-3.5 py-2.5 text-[14px] focus:border-cobre'
const etiqueta = 'font-mono text-[10px] tracking-[0.12em] text-apagado uppercase'

function Bloque({
  titulo,
  opcional,
  children,
}: {
  titulo: string
  opcional?: boolean
  children: React.ReactNode
}) {
  return (
    <section className="mb-4 rounded-xl border border-linea bg-panel p-5">
      <h2 className="mb-3 flex items-baseline gap-2 text-[15px] font-bold">
        {titulo}
        {opcional && (
          <span className="font-mono text-[9.5px] tracking-wider text-apagado uppercase">opcional</span>
        )}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function Campo({
  etiqueta: et,
  ayuda,
  ancho,
  children,
}: {
  etiqueta: string
  ayuda?: string
  ancho?: string
  children: React.ReactNode
}) {
  return (
    <label className={`block ${ancho ?? ''}`}>
      <span className={etiqueta}>{et}</span>
      {children}
      {ayuda && <span className="mt-1 block text-[11.5px] text-apagado">{ayuda}</span>}
    </label>
  )
}

function Interruptor({ valor, onCambio }: { valor: boolean; onCambio: (v: boolean) => void }) {
  return (
    <div className="mt-1 flex gap-1.5">
      {[false, true].map((v) => (
        <button
          key={String(v)}
          onClick={() => onCambio(v)}
          className={`flex-1 rounded-md border py-2.5 text-[13px] font-semibold ${
            valor === v ? 'border-cobre bg-cobre/15 text-cobre2' : 'border-linea text-apagado hover:border-linea2'
          }`}
        >
          {v ? 'Sí' : 'No'}
        </button>
      ))}
    </div>
  )
}
