import { db } from './db'
import type { Rol } from '../domain/types'

/**
 * Quién puede hacer qué.
 *
 * Hay dos papeles: ADMINISTRADOR, que ve el historial de días cerrados, y
 * ENCARGADO, que carga la venta del día y cobra. El papel vive en Firestore, en
 * `usuarios/{uid}`, para que sea el mismo en todos los aparatos: si viviera en
 * el teléfono, reinstalar la aplicación sería ascenderse solo.
 *
 * ---------------------------------------------------------------------------
 * Cómo se reparte el primero
 * ---------------------------------------------------------------------------
 *
 * La primera cuenta que entra cuando todavía no hay ningún usuario registrado
 * se queda de administrador; las siguientes entran como encargado. No hay otra
 * forma de arrancar sin pedirle a alguien que edite Firestore a mano, y eso es
 * exactamente lo que este proyecto trata de evitar.
 *
 * ---------------------------------------------------------------------------
 * Hasta dónde llega esto y hasta dónde no
 * ---------------------------------------------------------------------------
 *
 * Esto ordena la aplicación, NO la blinda. Lo que de verdad decide qué puede
 * escribir cada quien son las reglas de Firestore. Un encargado no ve el botón
 * de Historial, pero esconder un botón nunca ha protegido un dato: la regla del
 * servidor es la que cuenta, y está en `firestore.rules`.
 *
 * El papel se guarda también aquí al lado, en la copia local, porque la
 * aplicación tiene que abrir sin señal. Si no hay copia y no hay red, se asume
 * ENCARGADO: ante la duda, el permiso más pequeño.
 */

const CLAVE_ROL = 'rolUsuario'
const CLAVE_UID = 'rolUsuarioUid'

export const ROL_POR_DEFECTO: Rol = 'encargado'

/** Lo que se sabe del papel sin haber hablado con el servidor todavía. */
export async function rolEnCache(uid: string): Promise<Rol | null> {
  const [rol, deQuien] = await Promise.all([db.config.get(CLAVE_ROL), db.config.get(CLAVE_UID)])
  // Si la copia local es de OTRA cuenta, no vale: en un equipo compartido el
  // encargado heredaría el papel del dueño con solo abrir la aplicación.
  if (!rol || deQuien?.valor !== uid) return null
  return rol.valor === 'administrador' ? 'administrador' : 'encargado'
}

async function guardarEnCache(uid: string, rol: Rol): Promise<void> {
  await db.config.bulkPut([
    { clave: CLAVE_ROL, valor: rol },
    { clave: CLAVE_UID, valor: uid },
  ])
}

export async function olvidarRol(): Promise<void> {
  await db.config.bulkDelete([CLAVE_ROL, CLAVE_UID])
}

/**
 * Resuelve el papel contra Firestore y lo deja en la copia local.
 *
 * El SDK de Firestore se carga aquí dentro y no arriba: son cientos de
 * kilobytes que no hacen falta para pintar la primera pantalla.
 */
export async function resolverRol(uid: string, email: string): Promise<Rol> {
  const [{ obtenerFirestore }, firestore] = await Promise.all([
    import('./firebase'),
    import('firebase/firestore'),
  ])
  const { collection, doc, getDoc, getDocs, limit, query, setDoc } = firestore
  const fs = obtenerFirestore()

  const propio = doc(fs, 'usuarios', uid)
  const yaEsta = await getDoc(propio)
  if (yaEsta.exists()) {
    const rol: Rol = yaEsta.data().rol === 'administrador' ? 'administrador' : 'encargado'
    await guardarEnCache(uid, rol)
    return rol
  }

  // Nadie registrado todavía: quien llega primero manda.
  const alguno = await getDocs(query(collection(fs, 'usuarios'), limit(1)))
  const rol: Rol = alguno.empty ? 'administrador' : 'encargado'

  await setDoc(propio, { uid, email, rol, creadoEn: Date.now() })
  await guardarEnCache(uid, rol)
  return rol
}

export interface UsuarioRegistrado {
  uid: string
  email: string
  rol: Rol
}

/** Todos los usuarios que han entrado alguna vez. Para la pantalla del administrador. */
export async function listarUsuarios(): Promise<UsuarioRegistrado[]> {
  const [{ obtenerFirestore }, { collection, getDocs }] = await Promise.all([
    import('./firebase'),
    import('firebase/firestore'),
  ])
  const snap = await getDocs(collection(obtenerFirestore(), 'usuarios'))
  return snap.docs.map((d) => {
    const v = d.data()
    return {
      uid: d.id,
      email: String(v.email ?? ''),
      rol: v.rol === 'administrador' ? 'administrador' : 'encargado',
    }
  })
}

/** Cambia el papel de otra cuenta. Las reglas solo lo permiten a un administrador. */
export async function cambiarRol(uid: string, rol: Rol): Promise<void> {
  const [{ obtenerFirestore }, { doc, updateDoc }] = await Promise.all([
    import('./firebase'),
    import('firebase/firestore'),
  ])
  await updateDoc(doc(obtenerFirestore(), 'usuarios', uid), { rol })
}
