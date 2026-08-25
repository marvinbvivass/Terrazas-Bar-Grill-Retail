import { useState } from 'react'
import { usePos } from './hooks/usePos'
import { useSesion } from './hooks/useSesion'
import { Login } from './ui/Login'
import { BarraSuperior } from './ui/BarraSuperior'
import { NavInferior, type Vista } from './ui/NavInferior'
import { VentaDiaView } from './ui/VentaDiaView'
import { ClientesView } from './ui/ClientesView'
import { CierreView } from './ui/CierreView'
import { CatalogoView } from './ui/CatalogoView'
import { ProveedorMoneda } from './ui/moneda'

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

  return <Aplicacion />
}

function Aplicacion() {
  const pos = usePos()
  const [vista, setVista] = useState<Vista>('venta')

  if (pos.cargando) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-mono text-sm text-apagado">Cargando catálogo…</p>
      </div>
    )
  }

  return (
    <ProveedorMoneda tasas={pos.snapshot?.tasas ?? {}}>
      <div className="flex h-full flex-col">
        <BarraSuperior pos={pos} />

        <main className="flex min-h-0 flex-1 flex-col">
          {vista === 'venta' && <VentaDiaView pos={pos} />}
          {vista === 'cxc' && <ClientesView pos={pos} />}
          {vista === 'cierre' && <CierreView pos={pos} />}
          {vista === 'catalogo' && <CatalogoView pos={pos} />}
        </main>

        <NavInferior
          vista={vista}
          onVista={setVista}
          porCobrar={pos.carteraTotal}
          catalogoVacio={(pos.snapshot?.productos.length ?? 0) === 0}
        />

        {pos.aviso && (
          <div
            role="status"
            className={`fixed inset-x-4 bottom-24 z-40 rounded-xl border px-4 py-3 text-center text-[14px] font-semibold shadow-2xl ${
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
