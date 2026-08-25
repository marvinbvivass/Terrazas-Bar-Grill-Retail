import { useEffect, useState } from 'react'
import { usePos } from './hooks/usePos'
import { useSesion } from './hooks/useSesion'
import { Login } from './ui/Login'
import { TopBar, type Vista } from './ui/TopBar'
import { ProductGrid } from './ui/ProductGrid'
import { CartPanel } from './ui/CartPanel'
import { PaymentSheet } from './ui/PaymentSheet'
import { FiarSheet } from './ui/FiarSheet'
import { ClientesView } from './ui/ClientesView'
import { CierreView } from './ui/CierreView'
import { CatalogoView } from './ui/CatalogoView'

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
  // cada lectura y la caja se llenaría de errores en vez de pedir la clave.
  if (!sesion.usuario) return <Login sinConexion={!navigator.onLine} />

  return <Caja />
}

function Caja() {
  const pos = usePos()
  const [vista, setVista] = useState<Vista>('cuaderno')
  const [hoja, setHoja] = useState<'ninguna' | 'contado' | 'fiar'>('ninguna')

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') setHoja('ninguna')
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  if (pos.cargando) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-mono text-sm text-apagado">Cargando catálogo…</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar pos={pos} vista={vista} onVista={setVista} />

      {vista === 'cuaderno' && (
        <div className="flex min-h-0 flex-1">
          <ProductGrid pos={pos} />
          <CartPanel
            pos={pos}
            onContado={() => setHoja('contado')}
            onFiar={() => setHoja('fiar')}
          />
        </div>
      )}

      {vista === 'clientes' && <ClientesView pos={pos} />}
      {vista === 'cierre' && <CierreView pos={pos} />}
      {vista === 'catalogo' && <CatalogoView pos={pos} />}

      {hoja === 'contado' && <PaymentSheet pos={pos} onCerrar={() => setHoja('ninguna')} />}
      {hoja === 'fiar' && <FiarSheet pos={pos} onCerrar={() => setHoja('ninguna')} />}

      {pos.aviso && (
        <div
          role="status"
          className={`fixed bottom-5 left-1/2 -translate-x-1/2 rounded-lg border px-4 py-2.5 text-[13.5px] font-semibold shadow-xl ${
            pos.aviso.tono === 'ok'
              ? 'border-verde/40 bg-panel2 text-verde'
              : 'border-alerta/40 bg-panel2 text-alerta'
          }`}
        >
          {pos.aviso.texto}
        </div>
      )}
    </div>
  )
}
