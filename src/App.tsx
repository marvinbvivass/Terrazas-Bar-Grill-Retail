import { useEffect, useState } from 'react'
import { usePos } from './hooks/usePos'
import { useSesion } from './hooks/useSesion'
import { Login } from './ui/Login'
import { BarraSuperior } from './ui/BarraSuperior'
import { Inicio, type Vista } from './ui/Inicio'
import { CierrePantalla } from './ui/CierrePantalla'
import { ClientesCrudView } from './ui/ClientesCrudView'
import { ClientesView } from './ui/ClientesView'
import { InventarioView } from './ui/InventarioView'
import { HistorialView } from './ui/HistorialView'
import { CatalogoView } from './ui/CatalogoView'
import { TasasSheet } from './ui/TasasSheet'
import { ProveedorMoneda } from './ui/moneda'
import type { Rol } from './domain/types'

export function App() {
  const sesion = useSesion()

  if (sesion.cargando) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-mono text-sm text-apagado">Verificando la sesión…</p>
      </div>
    )
  }

  // La aplicación no se monta sin sesión: las reglas de Firestore rechazarían
  // cada lectura y la pantalla se llenaría de errores en vez de pedir la clave.
  if (!sesion.usuario) return <Login sinConexion={!navigator.onLine} />

  return <Aplicacion rol={sesion.rol} />
}

const TITULOS: Record<Vista, string> = {
  inicio: 'Terrazas Bar Grill',
  clientes: 'Clientes',
  cxc: 'Cuentas por cobrar',
  inventario: 'Inventario',
  catalogo: 'Catálogo',
  tasas: 'Tasas del día',
  cierre: 'Cierre del día',
  historial: 'Historial',
}

function Aplicacion({ rol }: { rol: Rol }) {
  const pos = usePos()
  const [vista, setVista] = useState<Vista>('inicio')

  /*
   * El botón físico de atrás vuelve al menú en vez de salirse de la aplicación.
   * Instalada como PWA, sin esto el gesto más natural del teléfono te expulsa
   * de la pantalla en la que estabas trabajando.
   */
  useEffect(() => {
    if (vista === 'inicio') return
    history.pushState({ vista }, '')
    const volver = () => setVista('inicio')
    window.addEventListener('popstate', volver)
    return () => window.removeEventListener('popstate', volver)
  }, [vista])

  if (pos.cargando) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-mono text-sm text-apagado">Cargando catálogo…</p>
      </div>
    )
  }

  const alMenu = () => setVista('inicio')

  // Historial es solo del administrador. Se comprueba aquí y no solo al pintar
  // el menú: si alguien llega por otro camino, tampoco entra.
  const puedeVerHistorial = rol === 'administrador'

  return (
    <ProveedorMoneda tasas={pos.snapshot?.tasas ?? {}}>
      <div className="flex h-full flex-col">
        <BarraSuperior
          pos={pos}
          rol={rol}
          titulo={TITULOS[vista]}
          onAtras={vista === 'inicio' ? null : alMenu}
        />

        <main className="flex min-h-0 flex-1 flex-col">
          {vista === 'inicio' && <Inicio pos={pos} rol={rol} onIr={setVista} />}
          {vista === 'cierre' && <CierrePantalla pos={pos} />}
          {vista === 'clientes' && <ClientesCrudView pos={pos} />}
          {vista === 'cxc' && <ClientesView pos={pos} />}
          {vista === 'inventario' && <InventarioView pos={pos} />}
          {vista === 'catalogo' && <CatalogoView pos={pos} />}
          {vista === 'historial' &&
            (puedeVerHistorial ? (
              <HistorialView pos={pos} onVerDia={() => setVista('cierre')} />
            ) : (
              <p className="px-6 py-14 text-center text-[14px] text-apagado">
                El historial es solo para administradores.
              </p>
            ))}
        </main>

        {/* Las tasas son una hoja, no una pantalla: son cuatro números que se
            teclean y se cierran, no algo en lo que uno se quede. */}
        {vista === 'tasas' && <TasasSheet pos={pos} onCerrar={alMenu} />}

        {pos.aviso && (
          <div
            role="status"
            className={`fixed inset-x-4 bottom-8 z-40 rounded-xl border px-4 py-3 text-center text-[14px] font-semibold shadow-2xl ${
              pos.aviso.tono === 'ok'
                ? 'border-verde/40 bg-panel2 text-verde'
                : 'border-alerta/40 bg-panel2 text-alerta'
            }`}
          >
            {pos.aviso.texto}
          </div>
        )}
      </div>
    </ProveedorMoneda>
  )
}
