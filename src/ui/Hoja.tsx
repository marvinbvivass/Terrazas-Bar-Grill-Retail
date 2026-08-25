import { useEffect } from 'react'

/**
 * Hoja inferior, el patrón de diálogo de Android.
 *
 * Sube desde abajo y se cierra tocando fuera o con el botón físico de atrás.
 * En un teléfono sostenido con una mano, lo que queda al alcance del pulgar es
 * el borde inferior; un diálogo centrado obliga a recolocar la mano.
 */
export function Hoja({
  titulo,
  onCerrar,
  children,
  pie,
}: {
  titulo: string
  onCerrar: () => void
  children: React.ReactNode
  pie?: React.ReactNode
}) {
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') onCerrar()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onCerrar])

  /*
   * El botón de atrás de Android cierra la hoja en vez de salirse de la
   * aplicación. Sin esto, el gesto más natural del teléfono te expulsa de la
   * pantalla en la que estabas trabajando.
   */
  useEffect(() => {
    history.pushState({ hoja: true }, '')
    function atras() {
      onCerrar()
    }
    window.addEventListener('popstate', atras)
    return () => {
      window.removeEventListener('popstate', atras)
      if (history.state?.hoja) history.back()
    }
  }, [onCerrar])

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        aria-label="Cerrar"
        onClick={onCerrar}
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className="pad-abajo relative flex max-h-[88%] flex-col rounded-t-2xl border-t border-linea2 bg-panel shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between px-4 pt-3 pb-2">
          <div className="absolute top-1.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-linea2" />
          <h2 className="pt-1 text-[17px] font-bold">{titulo}</h2>
          <button
            onClick={onCerrar}
            className="-mr-2 rounded-full px-3 text-[22px] leading-none text-apagado"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>
        <div className="scroll-y min-h-0 flex-1 px-4 pb-3">{children}</div>
        {pie && <div className="shrink-0 border-t border-linea px-4 py-3">{pie}</div>}
      </div>
    </div>
  )
}
