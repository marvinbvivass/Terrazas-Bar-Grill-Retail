import { useEffect, useState } from 'react'
import { observarSesion, type Sesion } from '../data/firebase'

export interface EstadoSesion {
  cargando: boolean
  usuario: Sesion | null
}

/**
 * Estado de la sesión.
 *
 * `cargando` importa: Firebase tarda un momento en decidir si hay sesión
 * guardada, y sin ese estado la aplicación parpadea mostrando el login a
 * alguien que ya había entrado.
 */
export function useSesion(): EstadoSesion {
  const [estado, setEstado] = useState<EstadoSesion>({ cargando: true, usuario: null })

  useEffect(() => {
    return observarSesion((usuario) => setEstado({ cargando: false, usuario }))
  }, [])

  return estado
}
