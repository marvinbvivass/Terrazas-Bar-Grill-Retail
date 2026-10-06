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
import { CONTEXTO_CATALOGO, UBICACION_VENTA_DEFECTO } from '../data/seed'
import { UNIDADES_CONTENIDO, type Producto, type UnidadContenido } from '../domain/types'
import type { Pos } from '../hooks/usePos'

const VACIO: ProductoForm = {
  nombre: '',
  nombreCorto: '',
  categoriaId: 'cat-cerveza',
  precioDetal: 0,
  unidadContenido: 'ml',
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
                const existencia = pos.stockDe(p.id, UBICACION_VENTA_DEFECTO)
                // Sin recepciones el costo es cero y el margen saldría 100%:
                // mejor no enseñar un número que miente.
                const m = precio && p.costoPromedio > 0 ? margen(precio, p.costoPromedio, p.iva) : null

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
                          {m === null ? 'sin costo aún' : `margen ${m}%`}
                        </p>
                      </div>
                      <div className="w-24 text-right">
                        <p className="tabular text-[13px]">{existencia} und</p>
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
  const puedeGuardar = problemas.length === 0 && f.precioDetal > 0

  const set = <K extends keyof ProductoForm>(k: K, v: ProductoForm[K]) => setF((x) => ({ ...x, [k]: v }))

  /*
   * Las presentaciones se manejan por casilla y no por lista libre.
   *
   * El encargado no piensa "agregar una presentación con factor 24": piensa
   * "esto también se vende por caja". La lista libre obligaba a inventar el
   * nombre y acordarse de cuántas trae, y un nombre mal escrito deja al
   * producto con dos cajas distintas.
   */
  const presentaciones = f.presentaciones ?? []
  const indiceDe = (nombre: string) => presentaciones.findIndex((p) => p.nombre === nombre)
  const paquete = presentaciones.find((p) => p.nombre === 'Paquete')
  const caja = presentaciones.find((p) => p.nombre === 'Caja')

  function alternar(nombre: 'Paquete' | 'Caja', activa: boolean, porDefecto: number) {
    setF((x) => {
      const lista = [...(x.presentaciones ?? [])]
      const i = lista.findIndex((p) => p.nombre === nombre)
      if (activa && i === -1) {
        lista.push({ nombre, factor: porDefecto, precio: 0 })
      } else if (!activa && i !== -1) {
        lista.splice(i, 1)
      }
      return { ...x, presentaciones: lista }
    })
  }

  function cambiarPres(i: number, campo: keyof PresentacionForm, valor: string | number) {
    setF((x) => {
      const lista = [...(x.presentaciones ?? [])]
      lista[i] = { ...lista[i]!, [campo]: valor }
      return { ...x, presentaciones: lista }
    })
  }

  async function guardar() {
    setGuardando(true)
    // Las existencias solo se escriben al crear. Al editar no se tocan: el
    // formulario las cargó al abrirse y guardarlas después resucitaría lo que
    // se haya vendido mientras tanto.
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

          <Campo etiqueta="Contenido" ayuda="Opcional. Lo que trae una unidad">
            <div className="flex gap-2">
              <input
                value={f.contenido ?? ''}
                onChange={(e) => set('contenido', Number(e.target.value) || undefined)}
                inputMode="numeric"
                placeholder="222"
                className={`${entrada} flex-1 text-right`}
              />
              {/* La medida va al lado del número: una bolsa de maní no se mide
                  en mililitros, y rellenar el campo con "500 ml" es un dato
                  falso dentro del sistema. */}
              <select
                value={f.unidadContenido ?? 'ml'}
                onChange={(e) => set('unidadContenido', e.target.value as UnidadContenido)}
                className={`${entrada} w-20`}
              >
                {UNIDADES_CONTENIDO.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                  </option>
                ))}
              </select>
            </div>
          </Campo>
        </Bloque>

        {/* --- Precio --- */}
        <Bloque titulo="Precio de venta">
          <Campo etiqueta="Precio de una unidad" ayuda="Tal como lo cobras en el mostrador">
            <input
              value={f.precioDetal || ''}
              onChange={(e) => set('precioDetal', parsearMonto(e.target.value))}
              inputMode="decimal"
              placeholder="1,00"
              className={`${entrada} text-right text-lg font-bold`}
            />
          </Campo>

          <Campo etiqueta="Maneja vacío" ayuda="Cerveza y refresco de casco">
            <Interruptor valor={f.retornable ?? false} onCambio={(v) => set('retornable', v)} />
          </Campo>

          {!esNuevo && (f.costoPromedio ?? 0) > 0 && (
            <p className="col-span-2 rounded-lg bg-panel2 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-tinta2">
              Te cuesta <b>{formato(f.costoPromedio ?? 0, 'USD')}</b> la unidad, calculado con lo
              que le has pagado al proveedor. Deja{' '}
              <b>{margen(f.precioDetal, f.costoPromedio ?? 0, 0)}%</b> de margen.
            </p>
          )}

          {(f.costoPromedio ?? 0) === 0 && (
            <p className="col-span-2 rounded-lg bg-panel2 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-apagado">
              El costo no se escribe aquí: sale solo de las facturas, al recibir mercancía. Hasta
              la primera recepción el margen de este producto se verá como si fuera todo ganancia.
            </p>
          )}
        </Bloque>

        {/* --- Cómo se vende --- */}
        <Bloque titulo="Venta por">
          <div className="col-span-2 flex flex-col gap-2">
            <CasillaVenta activa titulo="Unidad" detalle={`Siempre. ${formato(f.precioDetal, 'USD')} cada una`} />

            <CasillaVenta
              activa={!!paquete}
              titulo="Paquete"
              detalle={paquete ? `${paquete.factor} unidades` : 'Six-pack, bandeja, bolsa…'}
              onCambio={(v) => alternar('Paquete', v, 6)}
            />
            {paquete && (
              <FilaBulto
                nombre="paquete"
                pres={paquete}
                onCambio={(campo, valor) => cambiarPres(indiceDe('Paquete'), campo, valor)}
              />
            )}

            <CasillaVenta
              activa={!!caja}
              titulo="Caja"
              detalle={caja ? `${caja.factor} unidades` : 'Caja, gavera, bulto…'}
              onCambio={(v) => alternar('Caja', v, 24)}
            />
            {caja && (
              <FilaBulto
                nombre="caja"
                pres={caja}
                onCambio={(campo, valor) => cambiarPres(indiceDe('Caja'), campo, valor)}
              />
            )}

            <p className="pt-1 text-[12.5px] leading-relaxed text-apagado">
              Una caja no es otro producto: es la misma unidad contada de otra forma, y el
              inventario sigue siendo uno solo. Al vender tres cajas salen del anaquel las unidades
              que traen dentro.
            </p>
          </div>
        </Bloque>

        {/* --- Aviso de existencia baja --- */}
        <Bloque titulo="Aviso de poca existencia" opcional>
          <Campo etiqueta="Avisarme desde" ayuda="Cuando el inventario baje de aquí">
            <input
              value={f.stockMin || ''}
              onChange={(e) => set('stockMin', Number(e.target.value) || 0)}
              inputMode="numeric"
              className={`${entrada} text-right`}
            />
          </Campo>
          <div className="col-span-2 rounded-lg bg-panel2 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-tinta2">
            Las cantidades no se tocan aquí. Un producto nuevo arranca en cero y sube cuando
            registras la mercancía en <b>Inventario → Recibir mercancía</b>, que deja constancia de
            cuánto llegó, a qué costo y cuándo.
          </div>
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

/**
 * Una forma de venta, como casilla.
 *
 * La unidad va siempre activa y sin poder apagarse: es la presentación base, de
 * la que cuelgan el stock y el precio. Un producto sin unidad no existe.
 */
function CasillaVenta({
  activa,
  titulo,
  detalle,
  onCambio,
}: {
  activa: boolean
  titulo: string
  detalle: string
  onCambio?: (valor: boolean) => void
}) {
  const fija = onCambio === undefined
  return (
    <label
      className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 ${
        activa ? 'border-cobre bg-cobre/10' : 'border-linea bg-panel2'
      } ${fija ? '' : 'cursor-pointer'}`}
    >
      <input
        type="checkbox"
        checked={activa}
        disabled={fija}
        onChange={(e) => onCambio?.(e.target.checked)}
        className="h-5 w-5 shrink-0"
      />
      <span className="min-w-0">
        <span className="block text-[14.5px] font-semibold">{titulo}</span>
        <span className="block text-[12.5px] text-apagado">{detalle}</span>
      </span>
    </label>
  )
}

/** Cuántas trae y a cuánto se vende ese bulto */
function FilaBulto({
  nombre,
  pres,
  onCambio,
}: {
  nombre: string
  pres: PresentacionForm
  onCambio: (campo: keyof PresentacionForm, valor: string | number) => void
}) {
  return (
    <div className="ml-8 flex gap-2 pb-1">
      <label className="flex-1">
        <span className="mb-1 block font-mono text-[10px] tracking-[0.1em] text-apagado uppercase">
          Unidades por {nombre}
        </span>
        <input
          value={pres.factor || ''}
          onChange={(e) => onCambio('factor', Number(e.target.value) || 0)}
          inputMode="numeric"
          className="w-full rounded-lg border border-linea bg-panel2 px-3 py-2.5 text-right font-bold"
        />
      </label>
      <label className="flex-1">
        <span className="mb-1 block font-mono text-[10px] tracking-[0.1em] text-apagado uppercase">
          Precio del {nombre}
        </span>
        <input
          value={pres.precio || ''}
          onChange={(e) => onCambio('precio', parsearMonto(e.target.value))}
          inputMode="decimal"
          className="w-full rounded-lg border border-linea bg-panel2 px-3 py-2.5 text-right font-bold"
        />
      </label>
    </div>
  )
}
