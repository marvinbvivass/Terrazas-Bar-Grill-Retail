import { formato } from '../domain/money'
import type { Rol } from '../domain/types'
import type { Pos } from '../hooks/usePos'
import { useMoneda } from './moneda'

export type Vista =
  | 'inicio'
  | 'clientes'
  | 'cxc'
  | 'inventario'
  | 'catalogo'
  | 'tasas'
  | 'cierre'
  | 'historial'

export interface Destino {
  vista: Vista
  titulo: string
  detalle: string
  /** Solo el administrador lo ve */
  soloAdmin?: boolean
}

/**
 * El menú, que es lo primero que se ve al entrar.
 *
 * Antes la aplicación abría directamente en una pantalla de trabajo con cuatro
 * pestañas abajo, y no había forma de saber dónde estabas ni qué más había.
 * Un menú explícito cuesta un toque más y a cambio deja claro el mapa entero
 * desde el primer segundo.
 */
export function Inicio({
  pos,
  rol,
  onIr,
}: {
  pos: Pos
  rol: Rol
  onIr: (v: Vista) => void
}) {
  const { texto } = useMoneda()
  const productos = pos.snapshot?.productos.length ?? 0
  const sinTasas = !(pos.snapshot?.tasas.VES) || !(pos.snapshot?.tasas.COP)

  return (
    <div className="scroll-y min-h-0 flex-1 px-4 pb-6">
      {/* Resumen del día */}
      <section className="mt-3 rounded-2xl border border-linea bg-gradient-to-br from-panel2 to-panel px-4 py-4">
        <p className="font-mono text-[10px] tracking-[0.18em] text-apagado uppercase">
          Vendido en el día
        </p>
        <p className="tabular pt-0.5 text-[30px] leading-none font-extrabold text-cobre2">
          {texto(pos.cierre.vendidoHoy)}
        </p>
        <div className="flex gap-4 pt-3">
          <Dato etiqueta="Entró en caja" valor={formato(pos.cierre.entroEnCaja, 'USD')} />
          <Dato etiqueta="Por cobrar" valor={formato(pos.carteraTotal, 'USD')} />
        </div>
      </section>

      {sinTasas && (
        <button
          onClick={() => onIr('tasas')}
          className="mt-3 w-full rounded-xl border border-ambar/50 bg-ambar/10 px-4 py-3 text-left"
        >
          <p className="text-[14px] font-bold text-ambar">Falta cargar una tasa</p>
          <p className="pt-0.5 text-[12.5px] leading-snug text-tinta2">
            Sin tasa no se puede ver ni cobrar en esa moneda. Toca para cargarla.
          </p>
        </button>
      )}

      {productos === 0 && (
        <button
          onClick={() => onIr('catalogo')}
          className="mt-3 w-full rounded-xl border border-cobre/50 bg-cobre/10 px-4 py-3 text-left"
        >
          <p className="text-[14px] font-bold text-cobre2">No hay productos todavía</p>
          <p className="pt-0.5 text-[12.5px] leading-snug text-tinta2">
            Empieza por el catálogo: nombre, categoría, precio y costo.
          </p>
        </button>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <Tarjeta
          onClick={() => onIr('cierre')}
          icono={<IcoCierre />}
          titulo="Cierre"
          detalle="Cargar la venta del día y cuadrar"
          destacada
        />
        <Tarjeta
          onClick={() => onIr('cxc')}
          icono={<IcoCxc />}
          titulo="CXC"
          detalle="Quién debe y cobros"
          insignia={pos.carteraTotal > 0 ? formato(pos.carteraTotal, 'USD') : undefined}
        />
        <Tarjeta
          onClick={() => onIr('clientes')}
          icono={<IcoClientes />}
          titulo="Clientes"
          detalle="Agregar, editar y dar de baja"
        />
        <Tarjeta
          onClick={() => onIr('inventario')}
          icono={<IcoInventario />}
          titulo="Inventario"
          detalle="Existencias por producto"
        />
        <Tarjeta
          onClick={() => onIr('catalogo')}
          icono={<IcoCatalogo />}
          titulo="Catálogo"
          detalle="Productos y precios"
          insignia={productos === 0 ? 'vacío' : `${productos}`}
        />
        <Tarjeta
          onClick={() => onIr('tasas')}
          icono={<IcoTasas />}
          titulo="Tasas del día"
          detalle="Bolívar y peso por dólar"
        />
        {rol === 'administrador' && (
          <Tarjeta
            onClick={() => onIr('historial')}
            icono={<IcoHistorial />}
            titulo="Historial"
            detalle="Días anteriores"
            insignia="admin"
          />
        )}
      </div>

      {rol !== 'administrador' && (
        <p className="pt-4 text-center text-[12px] text-apagado">
          Entraste como encargado. El historial es solo para administradores.
        </p>
      )}
    </div>
  )
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="font-mono text-[9.5px] tracking-[0.14em] text-apagado uppercase">{etiqueta}</p>
      <p className="tabular text-[15px] font-bold">{valor}</p>
    </div>
  )
}

function Tarjeta({
  onClick,
  icono,
  titulo,
  detalle,
  insignia,
  destacada,
}: {
  onClick: () => void
  icono: React.ReactNode
  titulo: string
  detalle: string
  insignia?: string
  destacada?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-[112px] flex-col items-start gap-1 rounded-2xl border px-3.5 py-3 text-left ${
        destacada
          ? 'col-span-2 border-cobre/60 bg-cobre/10'
          : 'border-linea bg-panel'
      }`}
    >
      <span className={destacada ? 'text-cobre2' : 'text-cobre'}>{icono}</span>
      <span className="flex w-full items-center justify-between gap-2 pt-0.5">
        <span className="text-[16px] font-bold">{titulo}</span>
        {insignia && (
          <span className="tabular rounded-full bg-cobre/20 px-2 py-0.5 font-mono text-[10px] font-bold text-cobre2">
            {insignia}
          </span>
        )}
      </span>
      <span className="text-[12.5px] leading-snug text-apagado">{detalle}</span>
    </button>
  )
}

const svg = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function IcoCierre() {
  return (
    <svg {...svg} aria-hidden>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  )
}

function IcoCxc() {
  return (
    <svg {...svg} aria-hidden>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5z" />
      <path d="M3 10h18M7 14.5h4" />
    </svg>
  )
}

function IcoClientes() {
  return (
    <svg {...svg} aria-hidden>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.5M18 20a6 6 0 0 0-2.5-4.9" />
    </svg>
  )
}

function IcoInventario() {
  return (
    <svg {...svg} aria-hidden>
      <path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" />
      <path d="M3 7.5 12 12l9-4.5M12 12v9" />
    </svg>
  )
}

function IcoCatalogo() {
  return (
    <svg {...svg} aria-hidden>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
      <path d="M10 4h8.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H10" />
      <path d="M13.5 8.5h3M13.5 12h3" />
    </svg>
  )
}

function IcoTasas() {
  return (
    <svg {...svg} aria-hidden>
      <path d="M4 8h13l-3-3M20 16H7l3 3" />
    </svg>
  )
}

function IcoHistorial() {
  return (
    <svg {...svg} aria-hidden>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3 4v4h4M12 7.5V12l3 2" />
    </svg>
  )
}
