import { useMemo, useState } from 'react'
import {
  agregar,
  cambiarCantidad,
  carritoVacio,
  recalcular,
  totales,
  type Carrito,
} from '../domain/cart'
import { cuadrar, type Recibido } from '../domain/cuadre'
import { MONEDAS, formato, formatoNumero, parsearMonto } from '../domain/money'
import { inicioDe } from '../domain/dias'
import type { MonedaCodigo, Presentacion, Producto, UUID } from '../domain/types'
import { UBICACION_VENTA_DEFECTO } from '../data/seed'
import type { Pos } from '../hooks/usePos'
import { Precio } from './moneda'
import { ActaCierre } from './ActaCierre'

const MONEDAS_COBRO: MonedaCodigo[] = ['USD', 'VES', 'COP']

type Paso = 1 | 2 | 3

/**
 * Cerrar el día, en tres pasos.
 *
 * El orden es el del papel con el que llega el encargado: primero lo que se
 * vendió, después quién quedó debiendo, y al final cuánto dinero hay. Antes
 * esto eran dos recorridos por la lista de productos —uno para lo de contado y
 * otro para lo fiado— y el botón decía "Cerrar el día" cuando en realidad
 * guardaba una venta suelta y no dejaba acta de nada.
 *
 * La regla que sostiene los tres pasos:
 *
 *     lo que se vendió  =  lo que entró  +  lo que se fio
 *
 * Por eso el fiado se declara aquí y no en otra pantalla: sin esa cifra el
 * cuadre siempre daría faltante y el encargado aprendería a ignorarlo.
 */
export function CierreDiaView({ pos }: { pos: Pos }) {
  const s = pos.snapshot
  const [paso, setPaso] = useState<Paso>(1)
  const [busqueda, setBusqueda] = useState('')
  const [soloCargados, setSoloCargados] = useState(false)
  const [bruto, setBruto] = useState<Carrito>(carritoVacio())
  const [creditos, setCreditos] = useState<Array<{ clienteId: UUID; monto: string }>>([])
  const [montos, setMontos] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)

  const momento = useMemo(() => inicioDe(pos.dia) + 12 * 3600_000, [pos.dia])

  const carrito = useMemo(() => {
    if (!s) return bruto
    // Escalones por cantidad APAGADOS: este carrito es el día entero, no la
    // compra de un cliente. Ver `OpcionesRecalculo` en cart.ts.
    return recalcular(
      bruto,
      s.presentacionesPorId,
      { listas: s.listas, precios: s.precios },
      momento,
      { escalonesPorCantidad: false },
    )
  }, [bruto, s, momento])

  const t = useMemo(() => totales(carrito), [carrito])

  /*
   * Dos mapas y no uno.
   *
   * `porPresentacion` es lo que se teclea: tres cajas son tres, no ciento
   * ocho. `cantidadDe` va en unidades base y es lo que decide si un producto
   * esta "cargado", para ordenarlo arriba y para el filtro. Con un solo mapa
   * habria que elegir entre mostrar mal la casilla o filtrar mal la lista.
   */
  const cantidadPorPresentacion = useMemo(() => {
    const m = new Map<UUID, number>()
    for (const l of carrito.lineas) {
      m.set(l.presentacionId, (m.get(l.presentacionId) ?? 0) + l.cantidad)
    }
    return m
  }, [carrito])

  const cantidadDe = useMemo(() => {
    const m = new Map<UUID, number>()
    for (const l of carrito.lineas) {
      m.set(l.productoId, (m.get(l.productoId) ?? 0) + l.cantidadBase)
    }
    return m
  }, [carrito])

  const creditosLimpios = useMemo(
    () =>
      creditos
        .map((c) => ({ clienteId: c.clienteId, monto: parsearMonto(c.monto) }))
        .filter((c) => c.clienteId && c.monto > 0),
    [creditos],
  )

  const totalCredito = useMemo(
    () => creditosLimpios.reduce((x, c) => x + c.monto, 0),
    [creditosLimpios],
  )

  const recibido: Recibido = useMemo(() => {
    const r: Recibido = {}
    for (const m of MONEDAS_COBRO) {
      const n = parsearMonto(montos[m] ?? '')
      if (n > 0) r[m] = n
    }
    return r
  }, [montos])

  const c = useMemo(
    () =>
      cuadrar({
        totalVendido: t.total,
        credito: totalCredito,
        recibido,
        tasas: s?.tasas ?? {},
      }),
    [t.total, totalCredito, recibido, s],
  )

  /*
   * Lo ya cargado sube arriba. Con ochenta productos y doce vendidos, dejar la
   * lista en orden de catálogo obliga a rebuscar cada línea para comprobarla.
   */
  const visibles = useMemo(() => {
    if (!s) return []
    const q = busqueda.trim().toLowerCase()
    return s.productos
      .filter((p) => !soloCargados || (cantidadDe.get(p.id) ?? 0) > 0)
      .filter(
        (p) =>
          q === '' ||
          p.nombre.toLowerCase().includes(q) ||
          p.nombreCorto.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.marca ?? '').toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const ca = cantidadDe.get(a.id) ?? 0
        const cb = cantidadDe.get(b.id) ?? 0
        if (ca > 0 !== cb > 0) return cb - ca
        return a.nombreCorto.localeCompare(b.nombreCorto, 'es')
      })
  }, [s, busqueda, soloCargados, cantidadDe])

  if (!s) return null
  const snap = s

  // Día ya cerrado: se muestra el acta, no el formulario.
  if (pos.cierreDia) return <ActaCierre pos={pos} acta={pos.cierreDia} />

  /**
   * Pone la cantidad vendida de UNA presentacion.
   *
   * La linea se busca por producto Y presentacion: un mismo producto puede
   * llevar dos renglones el mismo dia --ciento veinte sueltas y tres cajas-- y
   * buscando solo por producto, las cajas sobrescribirian a las sueltas.
   */
  function poner(producto: Producto, presentacion: Presentacion, cantidad: number) {
    setBruto((carro) => {
      const linea = carro.lineas.find(
        (l) => l.productoId === producto.id && l.presentacionId === presentacion.id,
      )
      if (linea) return cambiarCantidad(carro, linea.id, cantidad)
      if (cantidad <= 0) return carro
      return agregar(carro, {
        producto,
        presentacion,
        ubicacionId: UBICACION_VENTA_DEFECTO,
        cantidad,
      })
    })
  }

  function completar(m: MonedaCodigo) {
    const falta = c.esperado - c.totalRecibido
    if (falta <= 0) return
    const tasa = m === 'USD' ? 1 : (snap.tasas[m] ?? 0)
    if (tasa <= 0) return
    const yaHay = parsearMonto(montos[m] ?? '')
    setMontos((x) => ({ ...x, [m]: formatoNumero(yaHay + falta * tasa, m) }))
  }

  async function cerrar() {
    setGuardando(true)
    await pos.cerrarDia({ carrito, recibido, creditos: creditosLimpios })
    setGuardando(false)
  }

  const nadaCargado = carrito.lineas.length === 0 && totalCredito === 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Pasos paso={paso} onPaso={setPaso} />

      {paso === 1 && (
        <>
          <div className="flex shrink-0 items-center gap-2 px-3 pt-2.5">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto…"
              className="min-w-0 flex-1 rounded-xl border border-linea bg-panel2 px-3 py-2.5 placeholder:text-apagado"
              aria-label="Buscar producto"
            />
            <button
              onClick={() => setSoloCargados((v) => !v)}
              className={`shrink-0 rounded-xl border px-3 py-2.5 text-[12.5px] font-semibold ${
                soloCargados ? 'border-cobre bg-cobre/15 text-cobre2' : 'border-linea text-tinta2'
              }`}
            >
              Cargados {cantidadDe.size > 0 && `(${cantidadDe.size})`}
            </button>
          </div>

          <div className="scroll-y mt-2 min-h-0 flex-1 px-3 pb-3">
            {snap.productos.length === 0 ? (
              <p className="px-2 py-10 text-center text-[14px] leading-relaxed text-apagado">
                No hay productos todavía. Cárgalos en el catálogo.
              </p>
            ) : visibles.length === 0 ? (
              <p className="px-2 py-10 text-center text-[14px] text-apagado">
                {soloCargados ? 'Todavía no has cargado nada.' : 'Ningún producto coincide.'}
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {visibles.map((p) => (
                  <FilaProducto
                    key={p.id}
                    producto={p}
                    presentaciones={snap.presentacionesPorProducto.get(p.id) ?? []}
                    cantidadDe={(presId) => cantidadPorPresentacion.get(presId) ?? 0}
                    precioDe={(pres) => precioDe(p, pres, snap, momento)}
                    stock={pos.stockDe(p.id, UBICACION_VENTA_DEFECTO)}
                    onCantidad={(pres, n) => poner(p, pres, n)}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {paso === 2 && (
        <PasoCredito
          pos={pos}
          creditos={creditos}
          onCambio={setCreditos}
          total={totalCredito}
          vendido={t.total}
        />
      )}

      {paso === 3 && (
        <PasoDinero
          cuadre={c}
          montos={montos}
          tasas={snap.tasas}
          onMonto={(m, v) => setMontos((x) => ({ ...x, [m]: v }))}
          onCompletar={completar}
        />
      )}

      {/* Pie fijo: la cuenta del día, siempre a la vista */}
      <div className="shrink-0 border-t border-linea bg-panel px-3 py-2.5">
        <div className="flex items-end justify-between gap-2 pb-2">
          <Cifra etiqueta="Vendido" valor={formato(t.total, 'USD')} grande />
          {totalCredito > 0 && (
            <Cifra etiqueta="Fiado" valor={formato(totalCredito, 'USD')} tono="ambar" />
          )}
          <Cifra etiqueta="Debe entrar" valor={formato(c.esperado, 'USD')} />
        </div>

        {paso < 3 ? (
          <button
            onClick={() => setPaso((paso + 1) as Paso)}
            className="w-full rounded-xl bg-cobre py-3.5 text-[16px] font-bold text-fondo"
          >
            {paso === 1 ? 'Siguiente · ¿quién quedó debiendo?' : 'Siguiente · ¿cuánto entró?'}
          </button>
        ) : (
          <button
            onClick={() => void cerrar()}
            disabled={guardando || nadaCargado}
            className={`w-full rounded-xl py-3.5 text-[16px] font-bold disabled:opacity-40 ${
              c.cuadra ? 'bg-verde text-white' : 'bg-amber-600 text-white'
            }`}
          >
            {guardando
              ? 'Guardando…'
              : nadaCargado
                ? 'No hay nada que cerrar'
                : c.cuadra
                  ? 'Cerrar el día'
                  : `Cerrar con ${c.diferencia < 0 ? 'faltante' : 'sobrante'} de ${formato(Math.abs(c.diferencia), 'USD')}`}
          </button>
        )}
      </div>
    </div>
  )
}

function Pasos({ paso, onPaso }: { paso: Paso; onPaso: (p: Paso) => void }) {
  const nombres: Array<[Paso, string]> = [
    [1, 'Qué se vendió'],
    [2, 'Quién debe'],
    [3, 'Cuánto entró'],
  ]
  return (
    <div className="flex shrink-0 gap-1 border-b border-linea bg-panel px-3 py-2">
      {nombres.map(([n, nombre]) => (
        <button
          key={n}
          onClick={() => onPaso(n)}
          className={`flex-1 rounded-lg py-2 text-[12.5px] font-semibold ${
            paso === n ? 'bg-cobre text-fondo' : 'bg-panel2 text-tinta2'
          }`}
        >
          <span className="tabular opacity-70">{n}</span> {nombre}
        </button>
      ))}
    </div>
  )
}

function PasoCredito({
  pos,
  creditos,
  onCambio,
  total,
  vendido,
}: {
  pos: Pos
  creditos: Array<{ clienteId: UUID; monto: string }>
  onCambio: (c: Array<{ clienteId: UUID; monto: string }>) => void
  total: number
  vendido: number
}) {
  return (
    <div className="scroll-y min-h-0 flex-1 px-3 py-3">
      <p className="pb-3 text-[13.5px] leading-relaxed text-tinta2">
        ¿Alguien se llevó algo sin pagar? Apúntalo aquí con el monto. Si nadie quedó debiendo,
        pasa al siguiente paso.
      </p>

      {pos.clientes.length === 0 ? (
        <p className="rounded-xl border border-linea bg-panel px-4 py-4 text-center text-[13.5px] leading-relaxed text-apagado">
          No hay clientes registrados. Se crean en la sección <b>Clientes</b> del menú.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {creditos.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={c.clienteId}
                onChange={(e) => {
                  const copia = [...creditos]
                  copia[i] = { ...c, clienteId: e.target.value }
                  onCambio(copia)
                }}
                className="min-w-0 flex-1 rounded-xl border border-linea bg-panel2 px-2 py-3 text-[15px]"
              >
                <option value="">Elegir cliente…</option>
                {pos.clientes.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nombre}
                  </option>
                ))}
              </select>
              <div className="flex w-28 shrink-0 items-center rounded-xl border border-linea bg-panel2 px-2">
                <span className="font-mono text-[12px] text-apagado">$</span>
                <input
                  value={c.monto}
                  onChange={(e) => {
                    const copia = [...creditos]
                    copia[i] = { ...c, monto: e.target.value }
                    onCambio(copia)
                  }}
                  inputMode="decimal"
                  placeholder="0"
                  className="tabular w-full bg-transparent py-3 text-right font-bold"
                  aria-label="Monto fiado"
                />
              </div>
              <button
                onClick={() => onCambio(creditos.filter((_, j) => j !== i))}
                className="h-11 w-10 shrink-0 rounded-lg border border-linea text-[18px] text-alerta"
                aria-label="Quitar"
              >
                ×
              </button>
            </div>
          ))}

          <button
            onClick={() => onCambio([...creditos, { clienteId: '', monto: '' }])}
            className="rounded-xl border border-dashed border-linea2 py-3 text-[14.5px] font-semibold text-tinta2"
          >
            + Agregar quien quedó debiendo
          </button>
        </div>
      )}

      {total > vendido && vendido > 0 && (
        <p className="mt-3 rounded-xl border border-alerta/50 bg-alerta/10 px-3 py-2.5 text-[13px] leading-relaxed text-alerta">
          Estás fiando {formato(total, 'USD')} pero solo cargaste {formato(vendido, 'USD')} de
          venta. Revisa el paso 1: falta mercancía por cargar.
        </p>
      )}
    </div>
  )
}

function PasoDinero({
  cuadre,
  montos,
  tasas,
  onMonto,
  onCompletar,
}: {
  cuadre: ReturnType<typeof cuadrar>
  montos: Record<string, string>
  tasas: Record<string, number>
  onMonto: (m: MonedaCodigo, v: string) => void
  onCompletar: (m: MonedaCodigo) => void
}) {
  return (
    <div className="scroll-y min-h-0 flex-1 px-3 py-3">
      <p className="pb-3 text-[13.5px] leading-relaxed text-tinta2">
        Cuenta la gaveta y escribe cuánto hay de cada moneda. Cada monto va en su propia moneda;
        la aplicación lo lleva a dólares con la tasa del día.
      </p>

      <div className="flex flex-col gap-2.5">
        {MONEDAS_COBRO.map((m) => {
          const tasa = m === 'USD' ? 1 : (tasas[m] ?? 0)
          const sinTasa = m !== 'USD' && tasa <= 0
          const n = parsearMonto(montos[m] ?? '')
          return (
            <div key={m}>
              <div
                className={`flex items-center gap-2 rounded-xl border bg-panel2 px-3 ${
                  sinTasa ? 'border-alerta/50' : 'border-linea focus-within:border-cobre'
                }`}
              >
                <span className="w-12 shrink-0 font-mono text-[12.5px] text-apagado">
                  {MONEDAS[m].simbolo}
                </span>
                <input
                  value={montos[m] ?? ''}
                  onChange={(e) => onMonto(m, e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  disabled={sinTasa}
                  className="tabular w-full bg-transparent py-3 text-right font-bold disabled:opacity-40"
                  aria-label={`Recibido en ${MONEDAS[m].nombre}`}
                />
                <button
                  onClick={() => onCompletar(m)}
                  className="shrink-0 rounded-lg border border-linea2 px-2 py-1 font-mono text-[10px] tracking-wider text-tinta2 uppercase"
                  style={{ minHeight: 0 }}
                  title="Poner aquí lo que falta para cuadrar"
                >
                  resto
                </button>
              </div>
              {sinTasa ? (
                <p className="pt-1 pl-1 text-[12px] text-alerta">
                  Sin tasa cargada. Ponla en Tasas del día.
                </p>
              ) : (
                n > 0 &&
                m !== 'USD' && (
                  <p className="pt-1 pr-1 text-right text-[12px] text-apagado">
                    = {formato(n / tasa, 'USD')}
                  </p>
                )
              )}
            </div>
          )
        })}
      </div>

      <div
        className={`mt-4 rounded-xl border px-4 py-3 text-center ${
          cuadre.cuadra
            ? 'border-verde/50 bg-verde/10'
            : cuadre.totalRecibido === 0
              ? 'border-linea bg-panel'
              : 'border-alerta/50 bg-alerta/10'
        }`}
      >
        <p className="font-mono text-[10px] tracking-[0.16em] text-apagado uppercase">
          {cuadre.diferencia === 0
            ? 'Diferencia'
            : cuadre.diferencia < 0
              ? 'Falta en la gaveta'
              : 'Sobra en la gaveta'}
        </p>
        <p
          className={`tabular text-[26px] leading-tight font-extrabold ${
            cuadre.cuadra ? 'text-verde' : 'text-alerta'
          }`}
        >
          {formato(Math.abs(cuadre.diferencia), 'USD')}
        </p>
        {cuadre.faltanTasas && (
          <p className="pt-1 text-[12.5px] text-alerta">
            Falta una tasa: este número no es de fiar.
          </p>
        )}
        {cuadre.cuadra && cuadre.diferencia !== 0 && (
          <p className="pt-1 text-[12px] text-apagado">
            Dentro del redondeo de la moneda. Cuadra.
          </p>
        )}
      </div>
    </div>
  )
}

function precioDe(
  p: Producto,
  presentacion: Presentacion,
  s: NonNullable<Pos['snapshot']>,
  momento: number,
): number {
  const conLinea = agregar(carritoVacio(), {
    producto: p,
    presentacion,
    ubicacionId: UBICACION_VENTA_DEFECTO,
    cantidad: 1,
  })
  const listo = recalcular(
    conLinea,
    s.presentacionesPorId,
    { listas: s.listas, precios: s.precios },
    momento,
    { escalonesPorCantidad: false },
  )
  return listo.lineas[0]?.precioUnitario ?? 0
}

function FilaProducto({
  producto,
  presentaciones,
  cantidadDe,
  precioDe,
  stock,
  onCantidad,
}: {
  producto: Producto
  presentaciones: Presentacion[]
  cantidadDe: (presentacionId: UUID) => number
  precioDe: (presentacion: Presentacion) => number
  stock: number
  onCantidad: (presentacion: Presentacion, cantidad: number) => void
}) {
  const base = presentaciones.find((x) => x.esBase)
  const bultos = presentaciones.filter((x) => !x.esBase && x.activo && x.permiteVenta)

  const cantidadBase = base ? cantidadDe(base.id) : 0
  const enBultos = bultos.reduce((s, b) => s + cantidadDe(b.id) * b.factor, 0)
  const total = cantidadBase + enBultos

  /*
   * Los bultos aparecen solos si ya tienen cantidad; si no, hay que pedirlos.
   *
   * Mostrar siempre una casilla por presentacion llenaria la pantalla de
   * campos vacios: la inmensa mayoria de los dias se vende por unidades y las
   * cajas son la excepcion.
   */
  const [abierto, setAbierto] = useState(enBultos > 0)
  if (!base) return null

  return (
    <div
      className={`rounded-xl border px-2.5 py-2 ${
        total > 0 ? 'border-cobre/60 bg-cobre/[0.07]' : 'border-linea bg-panel'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold">{producto.nombreCorto}</p>
          <div className="flex items-center gap-2">
            <Precio base={precioDe(base)} tamano="chico" />
            <span className={`text-[11.5px] ${stock <= 0 ? 'text-alerta' : 'text-apagado'}`}>
              {stock <= 0 ? 'sin existencia' : `${stock} en stock`}
            </span>
          </div>
        </div>

        <Contador
          valor={cantidadBase}
          etiqueta={producto.nombreCorto}
          onCambio={(n) => onCantidad(base, n)}
        />
      </div>

      {bultos.length > 0 &&
        (abierto ? (
          <div className="mt-2 flex flex-col gap-1.5 border-t border-linea pt-2">
            {bultos.map((b) => (
              <div key={b.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-tinta2">
                    {b.nombre}
                    <span className="pl-1.5 font-mono text-[10.5px] text-apagado">
                      &times;{b.factor}
                    </span>
                  </p>
                  <Precio base={precioDe(b)} tamano="chico" />
                </div>
                <Contador
                  valor={cantidadDe(b.id)}
                  etiqueta={`${b.nombre} de ${producto.nombreCorto}`}
                  onCambio={(n) => onCantidad(b, n)}
                />
              </div>
            ))}
            {enBultos > 0 && (
              <p className="tabular pt-0.5 text-right font-mono text-[10.5px] text-apagado">
                {enBultos} unidades en bultos &middot; {total} en total
              </p>
            )}
          </div>
        ) : (
          <button
            onClick={() => setAbierto(true)}
            className="mt-1.5 text-[12px] font-semibold text-cobre2"
            style={{ minHeight: 0 }}
          >
            + vendi {bultos.map((b) => b.nombre.toLowerCase()).join(' o ')}
          </button>
        ))}
    </div>
  )
}

/** Menos, casilla y mas. El mismo control para unidades y para bultos. */
function Contador({
  valor,
  etiqueta,
  onCambio,
}: {
  valor: number
  etiqueta: string
  onCambio: (n: number) => void
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        onClick={() => onCambio(Math.max(0, valor - 1))}
        disabled={valor === 0}
        className="h-11 w-11 rounded-lg border border-linea text-[20px] text-tinta2 disabled:opacity-25"
        aria-label={`Quitar uno de ${etiqueta}`}
      >
        &minus;
      </button>
      <input
        value={valor === 0 ? '' : String(valor)}
        onChange={(e) => onCambio(Math.max(0, Math.floor(parsearMonto(e.target.value))))}
        inputMode="numeric"
        placeholder="0"
        className="tabular h-11 w-14 rounded-lg border border-linea bg-panel2 text-center font-bold"
        aria-label={`Cantidad vendida de ${etiqueta}`}
      />
      <button
        onClick={() => onCambio(valor + 1)}
        className="h-11 w-11 rounded-lg border border-linea text-[20px] text-tinta2"
        aria-label={`Agregar uno de ${etiqueta}`}
      >
        +
      </button>
    </div>
  )
}

function Cifra({
  etiqueta,
  valor,
  grande,
  tono,
}: {
  etiqueta: string
  valor: string
  grande?: boolean
  tono?: 'ambar'
}) {
  return (
    <div className="min-w-0">
      <p className="truncate font-mono text-[9px] tracking-[0.14em] text-apagado uppercase">
        {etiqueta}
      </p>
      <p
        className={`tabular font-extrabold ${grande ? 'text-[20px]' : 'text-[15px]'} ${
          tono === 'ambar' ? 'text-ambar' : ''
        }`}
      >
        {valor}
      </p>
    </div>
  )
}
