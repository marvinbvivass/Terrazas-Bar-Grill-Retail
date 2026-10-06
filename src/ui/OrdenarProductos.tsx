import { useEffect, useState } from 'react'
import type { Producto, UUID } from '../domain/types'
import type { Pos } from '../hooks/usePos'

/**
 * Poner los productos en el orden en que se usan.
 *
 * El orden alfabético no sirve en el mostrador. Lo que más se vende tiene que
 * estar arriba para no buscarlo cada noche, y eso no lo sabe el sistema: lo sabe
 * el encargado. Este orden manda en la pantalla de cierre y en el inventario.
 *
 * Se mueve con flechas y no arrastrando. Arrastrar en un teléfono pelea con el
 * desplazamiento de la lista: se intenta mover un producto y lo que se mueve es
 * la página.
 */
export function OrdenarProductos({ pos }: { pos: Pos }) {
  const productos = pos.snapshot?.productos ?? []
  const [lista, setLista] = useState<Producto[]>([])
  const [guardando, setGuardando] = useState(false)

  // Se parte del orden que ya tienen; los que nunca se ordenaron van al final.
  useEffect(() => {
    setLista(
      [...productos].sort((a, b) => {
        const oa = a.orden ?? Number.MAX_SAFE_INTEGER
        const ob = b.orden ?? Number.MAX_SAFE_INTEGER
        if (oa !== ob) return oa - ob
        return a.nombreCorto.localeCompare(b.nombreCorto, 'es')
      }),
    )
  }, [productos])

  const sucio = lista.some((p, i) => productos.find((x) => x.id === p.id)?.orden !== i)

  function mover(indice: number, salto: number) {
    const destino = indice + salto
    if (destino < 0 || destino >= lista.length) return
    setLista((x) => {
      const copia = [...x]
      const [sacado] = copia.splice(indice, 1)
      copia.splice(destino, 0, sacado!)
      return copia
    })
  }

  function alPrincipio(indice: number) {
    setLista((x) => {
      const copia = [...x]
      const [sacado] = copia.splice(indice, 1)
      copia.unshift(sacado!)
      return copia
    })
  }

  async function guardar() {
    setGuardando(true)
    await pos.ordenarProductos(lista.map((p) => p.id as UUID))
    setGuardando(false)
  }

  if (productos.length === 0) {
    return (
      <p className="px-6 py-12 text-center text-[14px] leading-relaxed text-apagado">
        No hay productos que ordenar. Créalos en el catálogo.
      </p>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="shrink-0 px-4 py-2.5 text-[12.5px] leading-relaxed text-apagado">
        Pon arriba lo que más vendes. Este orden es el que vas a ver al cargar el cierre, así que
        bien puesto se teclea el día entero sin buscar nada.
      </p>

      <ul className="scroll-y min-h-0 flex-1 px-3 pb-3">
        {lista.map((p, i) => (
          <li
            key={p.id}
            className="mb-1.5 flex items-center gap-2 rounded-xl border border-linea bg-panel px-2.5 py-2"
          >
            <span className="tabular w-6 shrink-0 text-center font-mono text-[11px] text-apagado">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">
              {p.nombreCorto}
            </span>

            <button
              onClick={() => alPrincipio(i)}
              disabled={i === 0}
              className="h-10 w-10 shrink-0 rounded-lg border border-linea text-[15px] text-tinta2 disabled:opacity-25"
              aria-label={`Mandar ${p.nombreCorto} al principio`}
              title="Al principio"
            >
              ⇈
            </button>
            <button
              onClick={() => mover(i, -1)}
              disabled={i === 0}
              className="h-10 w-10 shrink-0 rounded-lg border border-linea text-[17px] text-tinta2 disabled:opacity-25"
              aria-label={`Subir ${p.nombreCorto}`}
            >
              ↑
            </button>
            <button
              onClick={() => mover(i, 1)}
              disabled={i === lista.length - 1}
              className="h-10 w-10 shrink-0 rounded-lg border border-linea text-[17px] text-tinta2 disabled:opacity-25"
              aria-label={`Bajar ${p.nombreCorto}`}
            >
              ↓
            </button>
          </li>
        ))}
      </ul>

      <div className="shrink-0 border-t border-linea bg-panel px-3 py-2.5">
        <button
          onClick={() => void guardar()}
          disabled={guardando || !sucio}
          className="w-full rounded-xl bg-cobre py-3.5 text-[16px] font-bold text-fondo disabled:opacity-40"
        >
          {guardando ? 'Guardando…' : sucio ? 'Guardar el orden' : 'Sin cambios'}
        </button>
      </div>
    </div>
  )
}
