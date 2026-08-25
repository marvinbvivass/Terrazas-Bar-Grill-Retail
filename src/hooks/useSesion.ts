import { useEffect, useState } from 'react'
import { observarSesion, type Sesion } from '../data/firebase'
import { ROL_POR_DEFECTO, olvidarRol, resolverRol, rolEnCache } from '../data/roles'
import type { Rol } from '../domain/types'

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
  rol: Rol
  /** Todavía no se ha confirmado el papel contra el servidor */
  resolviendoRol: boolean
}

/**
 * Estado de la sesión.
 *
 * `cargando` importa: Firebase tarda un momento en decidir si hay sesión
 * guardada, y sin ese estado la aplicación parpadea mostrando el login a
 * alguien que ya había entrado.
 */
export function useSesion(): EstadoSesion {
  const [estado, setEstado] = useState<{ cargando: boolean; usuario: Sesion | null }>({
    cargando: true,
    usuario: null,
  })
  const [local, setLocal] = useState(haySesionLocal)
  const [rol, setRol] = useState<Rol>(ROL_POR_DEFECTO)
  const [resolviendoRol, setResolviendoRol] = useState(false)

  useEffect(() => {
    const cambio = () => setLocal(haySesionLocal())
    window.addEventListener('sesion-local', cambio)
    return () => window.removeEventListener('sesion-local', cambio)
  }, [])

  useEffect(() => {
    return observarSesion((usuario) => setEstado({ cargando: false, usuario }))
  }, [])

  /*
   * El papel se resuelve en dos tiempos a propósito.
   *
   * Primero se lee la copia local, que es instantánea y funciona sin señal, y
   * la aplicación ya se puede usar. Después se pregunta al servidor y, si
   * cambió, se corrige. Esperar al servidor para pintar la primera pantalla
   * dejaría la aplicación en blanco cada vez que la conexión del local está
   * lenta, que es casi siempre.
   */
  const uid = estado.usuario?.uid
  const email = estado.usuario?.email ?? ''

  useEffect(() => {
    if (!uid) {
      setRol(ROL_POR_DEFECTO)
      void olvidarRol()
      return
    }

    let vivo = true
    setResolviendoRol(true)
    void (async () => {
      const enCache = await rolEnCache(uid)
      if (vivo && enCache) setRol(enCache)
      try {
        const confirmado = await resolverRol(uid, email)
        if (vivo) setRol(confirmado)
      } catch {
        // Sin señal o sin permiso: se queda con lo que hubiera en la copia
        // local, y si no había nada, con el papel más pequeño.
        if (vivo && !enCache) setRol(ROL_POR_DEFECTO)
      } finally {
        if (vivo) setResolviendoRol(false)
      }
    })()

    return () => {
      vivo = false
    }
  }, [uid, email])

  if (import.meta.env.DEV && local) {
    // En la puerta de desarrollo se entra como administrador para poder ver
    // todas las pantallas sin haber montado Firebase.
    return {
      cargando: false,
      usuario: { uid: 'local', email: 'solo-local' },
      rol: 'administrador',
      resolviendoRol: false,
    }
  }
  return { ...estado, rol, resolviendoRol }
}
