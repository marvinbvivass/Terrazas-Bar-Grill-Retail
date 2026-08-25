import { useEffect, useState } from 'react'
import { observarSesion, type Sesion } from '../data/firebase'

/**
 * Puerta de desarrollo.
 *
 * Sirve para probar la caja entera sin haber desplegado Firebase todavía: se
 * trabaja contra la copia local y no se sincroniza nada.
 *
 * `import.meta.env.DEV` es false en `npm run build`, así que este camino
 * desaparece del bundle de producción — no es una puerta trasera que quede
 * abierta en el sitio publicado. Hay una comprobación de esto en las pruebas.
 */
const CLAVE_LOCAL = 'sesion-solo-local'

export function entrarSoloLocal(): void {
  if (!import.meta.env.DEV) return
  sessionStorage.setItem(CLAVE_LOCAL, '1')
  window.dispatchEvent(new Event('sesion-local'))
}

export function salirSoloLocal(): void {
  sessionStorage.removeItem(CLAVE_LOCAL)
  window.dispatchEvent(new Event('sesion-local'))
}

function haySesionLocal(): boolean {
  if (!import.meta.env.DEV) return false
  try {
    return sessionStorage.getItem(CLAVE_LOCAL) === '1'
  } catch {
    return false
  }
}

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
  const [local, setLocal] = useState(haySesionLocal)

  useEffect(() => {
    const cambio = () => setLocal(haySesionLocal())
    window.addEventListener('sesion-local', cambio)
    return () => window.removeEventListener('sesion-local', cambio)
  }, [])

  useEffect(() => {
    return observarSesion((usuario) => setEstado({ cargando: false, usuario }))
  }, [])

  if (import.meta.env.DEV && local) {
    return { cargando: false, usuario: { uid: 'local', email: 'solo-local' } }
  }
  return estado
}
