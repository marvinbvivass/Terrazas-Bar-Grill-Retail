import { formato, formatoNumero } from '../domain/money'
import type { Rol } from '../domain/types'
import type { Pos } from '../hooks/usePos'

export type Vista =
  | 'inicio'
  | 'clientes'
  | 'cxc'
  | 'inventario'
  | 'catalogo'
  | 'tasas'
  | 'cierre'
  | 'historial'

/**
 * Menú principal.
 *
 * El trazado es el de la aplicación de Castillo, que es la que el dueño quiere
 * imitar: una tarjeta translúcida flotando sobre el fondo difuminado, el título
 * centrado, la tasa del día justo debajo y en él una rejilla de dos columnas de
 * botones macizos, cada sección con su color.
 *
 * Que cada botón tenga SU color no es adorno. En una rejilla de siete cajas
 * iguales hay que leer para encontrar la que se busca; con colores fijos la
 * mano va sola a los pocos días, que es como se usa esto de verdad: con prisa y
 * sin mirar.
 *
 * El orden lo decide el uso, no el alfabeto. Cierre va primero y ancho porque
 * es lo que se abre todos los días.
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
  const productos = pos.snapshot?.productos.length ?? 0
  const tasaVes = pos.snapshot?.tasas.VES ?? 0
  const tasaCop = pos.snapshot?.tasas.COP ?? 0
  // Una tasa en 1 es la de arranque, que nadie ha cargado todavía.
  const faltaTasa = tasaVes <= 1 || tasaCop <= 1

  return (
    <div className="scroll-y min-h-0 flex-1 px-3 py-4">
      <div className="mx-auto w-full max-w-lg rounded-2xl border border-linea2/50 bg-panel/85 p-4 text-center shadow-2xl backdrop-blur-md">
        <h1 className="text-[22px] font-bold">Menú Principal</h1>

        <button
          onClick={() => onIr('tasas')}
          className="mt-0.5 mb-3 font-mono text-[12px] font-bold text-tinta2 underline-offset-4 hover:underline"
          style={{ minHeight: 0 }}
        >
          {faltaTasa
            ? '(falta cargar la tasa del día)'
            : `(Bs ${formatoNumero(tasaVes, 'VES')} · COL$ ${formatoNumero(tasaCop, 'COP')})`}
        </button>

        <div className="grid grid-cols-2 gap-2.5">
          <Boton
            onClick={() => onIr('cierre')}
            color="bg-emerald-600 hover:bg-emerald-700"
            ancho
          >
            Cierre del día
          </Boton>

          <Boton onClick={() => onIr('cxc')} color="bg-amber-600 hover:bg-amber-700">
            CXC
            {pos.carteraTotal > 0 && <Insignia>{formato(pos.carteraTotal, 'USD')}</Insignia>}
          </Boton>

          <Boton onClick={() => onIr('clientes')} color="bg-teal-600 hover:bg-teal-700">
            Clientes
          </Boton>

          <Boton onClick={() => onIr('inventario')} color="bg-blue-600 hover:bg-blue-700">
            Inventario
          </Boton>

          <Boton onClick={() => onIr('catalogo')} color="bg-cyan-600 hover:bg-cyan-700">
            Catálogo
            {productos === 0 && <Insignia>vacío</Insignia>}
          </Boton>

          <Boton onClick={() => onIr('tasas')} color="bg-sky-600 hover:bg-sky-700">
            Tasas del día
          </Boton>

          {rol === 'administrador' && (
            <Boton onClick={() => onIr('historial')} color="bg-blue-800 hover:bg-blue-900">
              Historial
            </Boton>
          )}
        </div>

        {/* Las dos cifras del día, que es lo que se mira de pasada al abrir. */}
        <div className="mt-3.5 flex justify-between gap-2 border-t border-linea2/50 pt-3">
          <Cifra etiqueta="Vendido" valor={formato(pos.cierre.vendidoHoy, 'USD')} />
          <Cifra etiqueta="Entró en caja" valor={formato(pos.cierre.entroEnCaja, 'USD')} />
          <Cifra
            etiqueta="Por cobrar"
            valor={formato(pos.carteraTotal, 'USD')}
            tono={pos.carteraTotal > 0 ? 'ambar' : undefined}
          />
        </div>

        {rol !== 'administrador' && (
          <p className="pt-3 text-[11.5px] text-apagado">
            Entraste como encargado. El historial es solo para administradores.
          </p>
        )}
      </div>

      {productos === 0 && (
        <div className="mx-auto mt-3 w-full max-w-lg rounded-xl border border-cobre/50 bg-panel/85 px-4 py-3 text-center backdrop-blur-md">
          <p className="text-[13.5px] font-bold text-cobre2">No hay productos todavía</p>
          <p className="pt-0.5 text-[12.5px] leading-snug text-tinta2">
            Empieza por el catálogo: nombre, categoría, precio y costo.
          </p>
        </div>
      )}
    </div>
  )
}

function Boton({
  onClick,
  color,
  ancho,
  children,
}: {
  onClick: () => void
  color: string
  ancho?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-3.5 text-[14.5px] font-bold text-white shadow-md transition ${color} ${
        ancho ? 'col-span-2' : ''
      } hover:-translate-y-1 active:translate-y-0 active:brightness-90`}
    >
      {children}
    </button>
  )
}

function Insignia({ children }: { children: React.ReactNode }) {
  return (
    <span className="tabular rounded-full bg-white/90 px-2 py-0.5 font-mono text-[10.5px] font-black text-fondo">
      {children}
    </span>
  )
}

function Cifra({
  etiqueta,
  valor,
  tono,
}: {
  etiqueta: string
  valor: string
  tono?: 'ambar'
}) {
  return (
    <div className="min-w-0 flex-1">
      <p className="truncate font-mono text-[9px] tracking-[0.12em] text-apagado uppercase">
        {etiqueta}
      </p>
      <p className={`tabular truncate text-[14px] font-bold ${tono === 'ambar' ? 'text-ambar' : ''}`}>
        {valor}
      </p>
    </div>
  )
}
