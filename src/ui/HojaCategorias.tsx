import { useMemo, useState } from 'react'
import { categoriasEnUso, nuevaCategoria, renombrar } from '../domain/categorias'
import type { Categoria, UUID } from '../domain/types'
import type { Pos } from '../hooks/usePos'
import { Hoja } from './Hoja'

/**
 * Crear, renombrar y borrar categorías.
 *
 * Se abre desde el formulario del producto, que es donde aparece la falta: uno
 * va a cargar las hamburguesas y descubre que no hay dónde ponerlas. Obligar a
 * salir, buscar otra pantalla y volver a empezar el producto es la clase de
 * paseo que termina con todo metido en "Snacks".
 *
 * La categoría recién creada queda elegida al volver.
 */
export function HojaCategorias({
  pos,
  onCerrar,
  onCreada,
}: {
  pos: Pos
  onCerrar: () => void
  onCreada?: (id: UUID) => void
}) {
  const s = pos.snapshot
  const categorias = s?.categorias ?? []

  const [nombre, setNombre] = useState('')
  const [error, setError] = useState<string | null>(null)
  /** La que está esperando el segundo toque para borrarse */
  const [confirmando, setConfirmando] = useState<UUID | null>(null)
  const [textos, setTextos] = useState<Record<UUID, string>>({})

  /*
   * Cuántos productos usa cada una. El snapshot solo trae los activos, así que
   * esto es una pista para la pantalla; quien decide de verdad es la base, que
   * cuenta también los dados de baja y puede negarse.
   */
  const enUso = useMemo(() => categoriasEnUso(s?.productos ?? []), [s])

  async function agregar() {
    const r = nuevaCategoria(nombre, categorias)
    if (!r.ok) {
      setError(r.motivo === 'vacio' ? 'Ponle un nombre' : 'Ya existe una con ese nombre')
      return
    }
    setError(null)
    setNombre('')
    await pos.guardarCategoria(r.categoria)
    onCreada?.(r.categoria.id)
  }

  async function guardarNombre(c: Categoria) {
    const texto = textos[c.id]
    if (texto === undefined || texto.trim() === c.nombre) {
      setTextos((x) => ({ ...x, [c.id]: c.nombre }))
      return
    }
    const r = renombrar(c, texto, categorias)
    if (!r.ok) {
      // Se devuelve el nombre bueno al campo: dejarlo con el texto rechazado
      // hace creer que el cambio se guardó.
      setTextos((x) => ({ ...x, [c.id]: c.nombre }))
      setError(r.motivo === 'vacio' ? 'Ponle un nombre' : 'Ya existe una con ese nombre')
      return
    }
    setError(null)
    await pos.guardarCategoria(r.categoria)
  }

  async function borrar(c: Categoria) {
    if (confirmando !== c.id) {
      setConfirmando(c.id)
      return
    }
    setConfirmando(null)
    const r = await pos.eliminarCategoria(c.id)
    if (!r.ok) {
      setError(
        `No se puede borrar: ${r.productos} ${r.productos === 1 ? 'producto la usa' : 'productos la usan'}`,
      )
    }
  }

  return (
    <Hoja titulo="Categorías" onCerrar={onCerrar}>
      <div className="flex gap-2">
        <input
          value={nombre}
          onChange={(e) => {
            setNombre(e.target.value)
            setError(null)
          }}
          placeholder="Nueva categoría"
          maxLength={28}
          className="min-w-0 flex-1 rounded-xl border border-linea bg-panel2 px-3 py-2.5 placeholder:text-apagado"
          aria-label="Nombre de la categoría nueva"
        />
        <button
          onClick={() => void agregar()}
          disabled={nombre.trim() === ''}
          className="shrink-0 rounded-xl bg-cobre px-4 text-[14px] font-bold text-fondo disabled:opacity-40"
        >
          Agregar
        </button>
      </div>

      {error && (
        <p className="mt-2 rounded-xl border border-ambar/50 bg-ambar/10 px-3 py-2.5 text-[12.5px] leading-relaxed text-ambar">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-1.5 pt-3">
        {categorias.map((c) => {
          const usan = enUso.get(c.id) ?? 0
          const confirma = confirmando === c.id
          return (
            <li
              key={c.id}
              className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${
                confirma ? 'border-alerta bg-alerta/10' : 'border-linea bg-panel2'
              }`}
            >
              <div className="min-w-0 flex-1">
                <input
                  value={textos[c.id] ?? c.nombre}
                  onChange={(e) => setTextos((x) => ({ ...x, [c.id]: e.target.value }))}
                  onBlur={() => void guardarNombre(c)}
                  maxLength={28}
                  className="w-full bg-transparent text-[14.5px] font-semibold"
                  aria-label={`Nombre de ${c.nombre}`}
                />
                <p className="font-mono text-[10.5px] text-apagado">
                  {usan === 0
                    ? 'sin productos'
                    : `${usan} ${usan === 1 ? 'producto' : 'productos'}`}
                </p>
              </div>

              {confirma ? (
                <>
                  <button
                    onClick={() => setConfirmando(null)}
                    className="shrink-0 rounded-lg border border-linea2 px-2.5 py-1.5 text-[12.5px] text-tinta2"
                    style={{ minHeight: 0 }}
                  >
                    No
                  </button>
                  <button
                    onClick={() => void borrar(c)}
                    className="shrink-0 rounded-lg bg-alerta px-3 py-1.5 text-[12.5px] font-bold text-white"
                    style={{ minHeight: 0 }}
                  >
                    Borrar
                  </button>
                </>
              ) : (
                <button
                  onClick={() => void borrar(c)}
                  disabled={usan > 0}
                  title={usan > 0 ? 'Tiene productos' : 'Borrar'}
                  className="shrink-0 px-2 text-[20px] leading-none text-alerta disabled:text-apagado disabled:opacity-40"
                  style={{ minHeight: 0 }}
                  aria-label={`Borrar ${c.nombre}`}
                >
                  ×
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <p className="px-1 pt-4 text-center text-[12px] leading-relaxed text-apagado">
        Una categoría con productos no se puede borrar: quedarían apuntando a algo que no existe y
        desaparecerían de los filtros sin estar dados de baja. Cámbialos de categoría primero.
        Renombrar sí se puede siempre: los productos no se mueven.
      </p>
    </Hoja>
  )
}
