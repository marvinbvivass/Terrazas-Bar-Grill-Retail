import { useEffect, useState } from 'react'
import { usePos } from './hooks/usePos'
import { StatusBar } from './ui/StatusBar'
import { ProductGrid } from './ui/ProductGrid'
import { CartPanel } from './ui/CartPanel'
import { PaymentSheet } from './ui/PaymentSheet'
import { Ticket } from './ui/Ticket'

export function App() {
  const pos = usePos()
  const [cobrando, setCobrando] = useState(false)

  // F12 cobra, Escape cierra. La caja se opera con las dos manos ocupadas.
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'F12' && pos.carrito.lineas.length > 0 && !pos.ultimaVenta) {
        e.preventDefault()
        setCobrando(true)
      }
      if (e.key === 'Escape') {
        if (pos.ultimaVenta) pos.cerrarTicket()
        else setCobrando(false)
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [pos])

  if (pos.cargando) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-mono text-sm text-apagado">Cargando catálogo…</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <StatusBar pos={pos} />

      <div className="flex min-h-0 flex-1">
        <ProductGrid pos={pos} />
        <CartPanel pos={pos} onCobrar={() => setCobrando(true)} />
      </div>

      {cobrando && !pos.ultimaVenta && (
        <PaymentSheet pos={pos} onCerrar={() => setCobrando(false)} />
      )}

      {pos.ultimaVenta && (
        <Ticket venta={pos.ultimaVenta} pos={pos} onCerrar={pos.cerrarTicket} />
      )}

      {/* Avisos del escáner: confirmación o código desconocido */}
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
