export type Vista = 'venta' | 'cxc' | 'cierre' | 'catalogo'

/**
 * Navegación inferior, como cualquier aplicación de Android.
 *
 * Va abajo y no arriba porque es donde llega el pulgar cuando el teléfono se
 * sostiene con una mano. Cuatro destinos es el máximo que se lee de un vistazo
 * en la anchura de un móvil.
 */
export function NavInferior({
  vista,
  onVista,
  porCobrar,
  catalogoVacio,
}: {
  vista: Vista
  onVista: (v: Vista) => void
  /** Total por cobrar, para la insignia de CXC */
  porCobrar: number
  catalogoVacio: boolean
}) {
  return (
    <nav
      className="pad-abajo shrink-0 border-t border-linea bg-panel"
      aria-label="Secciones"
    >
      <div className="flex">
        <Destino activo={vista === 'venta'} onClick={() => onVista('venta')} icono={<IconoVenta />}>
          Venta
        </Destino>
        <Destino
          activo={vista === 'cxc'}
          onClick={() => onVista('cxc')}
          icono={<IconoCxc />}
          insignia={porCobrar > 0 ? `$${Math.round(porCobrar)}` : undefined}
        >
          CXC
        </Destino>
        <Destino
          activo={vista === 'cierre'}
          onClick={() => onVista('cierre')}
          icono={<IconoCierre />}
        >
          Cierre
        </Destino>
        <Destino
          activo={vista === 'catalogo'}
          onClick={() => onVista('catalogo')}
          icono={<IconoCatalogo />}
          insignia={catalogoVacio ? '!' : undefined}
        >
          Catálogo
        </Destino>
      </div>
    </nav>
  )
}

function Destino({
  activo,
  onClick,
  icono,
  insignia,
  children,
}: {
  activo: boolean
  onClick: () => void
  icono: React.ReactNode
  insignia?: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-current={activo ? 'page' : undefined}
      className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 ${
        activo ? 'text-cobre2' : 'text-apagado'
      }`}
    >
      <span className={`rounded-full px-5 py-1 ${activo ? 'bg-cobre/15' : ''}`}>{icono}</span>
      <span className="text-[11px] font-semibold">{children}</span>
      {insignia && (
        <span className="tabular absolute top-0.5 right-[22%] rounded-full bg-cobre px-1.5 py-px font-mono text-[9.5px] font-bold text-fondo">
          {insignia}
        </span>
      )}
    </button>
  )
}

/* Iconos en línea: 24×24, trazo de 1,8. Sin librería — son cuatro. */
const svg = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function IconoVenta() {
  return (
    <svg {...svg} aria-hidden>
      <path d="M3 6h2l2.2 9.5a2 2 0 0 0 2 1.5h6.9a2 2 0 0 0 2-1.5L20 8H6" />
      <circle cx="9.5" cy="20" r="1.3" />
      <circle cx="17" cy="20" r="1.3" />
    </svg>
  )
}

function IconoCxc() {
  return (
    <svg {...svg} aria-hidden>
      <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5z" />
      <path d="M3 10h18" />
      <path d="M7 14.5h4" />
    </svg>
  )
}

function IconoCierre() {
  return (
    <svg {...svg} aria-hidden>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  )
}

function IconoCatalogo() {
  return (
    <svg {...svg} aria-hidden>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
      <path d="M10 4h8.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H10" />
      <path d="M13.5 8.5h3M13.5 12h3" />
    </svg>
  )
}
