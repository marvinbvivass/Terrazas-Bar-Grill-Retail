import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

/**
 * Conexión con Firebase.
 *
 * La configuración de abajo NO es un secreto: en una aplicación web la apiKey
 * viaja siempre al navegador y Google la trata como un identificador público.
 * Lo que protege los datos son las reglas de Firestore (`firestore.rules`), y
 * por eso exigen sesión iniciada para todo. Si alguna vez alguien relaja esas
 * reglas, las ventas del local y las deudas de los clientes quedan expuestas a
 * cualquiera que abra la URL.
 */
const configuracion = {
  apiKey: 'AIzaSyAiitXEEekD-7FD7kDxDIcRbxlClsF5gHU',
  authDomain: 'ventas-9a210.firebaseapp.com',
  projectId: 'ventas-9a210',
  storageBucket: 'ventas-9a210.firebasestorage.app',
  messagingSenderId: '815890981146',
  appId: '1:815890981146:web:938fe5e09babe511e98ca3',
}

let app: FirebaseApp | null = null
let auth: Auth | null = null
let firestore: Firestore | null = null

export function obtenerApp(): FirebaseApp {
  app ??= initializeApp(configuracion)
  return app
}

export function obtenerAuth(): Auth {
  if (!auth) {
    auth = getAuth(obtenerApp())
    // La sesión sobrevive a cerrar el navegador: el encargado no debería tener
    // que escribir la contraseña cada vez que abre la caja.
    void setPersistence(auth, browserLocalPersistence)
  }
  return auth
}

export function obtenerFirestore(): Firestore {
  firestore ??= getFirestore(obtenerApp())
  return firestore
}

// ---------------------------------------------------------------------------
// Sesión
// ---------------------------------------------------------------------------

export interface Sesion {
  uid: string
  email: string
}

export function observarSesion(cb: (s: Sesion | null) => void): () => void {
  return onAuthStateChanged(obtenerAuth(), (u: User | null) => {
    cb(u ? { uid: u.uid, email: u.email ?? '' } : null)
  })
}

export async function entrar(email: string, clave: string): Promise<void> {
  await signInWithEmailAndPassword(obtenerAuth(), email.trim(), clave)
}

export async function salir(): Promise<void> {
  await signOut(obtenerAuth())
}

/**
 * Traduce los códigos de Firebase a algo que un encargado pueda leer.
 * "auth/invalid-credential" no le dice nada a nadie.
 */
export function mensajeDeError(e: unknown): string {
  const codigo = typeof e === 'object' && e !== null && 'code' in e ? String(e.code) : ''
  switch (codigo) {
    case 'auth/invalid-email':
      return 'Ese correo no tiene forma de correo.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Correo o contraseña incorrectos.'
    case 'auth/too-many-requests':
      return 'Demasiados intentos seguidos. Espera un minuto y vuelve a probar.'
    case 'auth/network-request-failed':
      return 'No hay conexión para verificar la contraseña. Si ya entraste antes en este equipo, la sesión sigue abierta.'
    case 'auth/user-disabled':
      return 'Esta cuenta está desactivada.'
    case 'permission-denied':
      return 'La cuenta no tiene permiso para esto.'
    case 'unavailable':
      return 'Sin conexión con el servidor. Los cambios quedan guardados aquí y suben cuando vuelva.'
    default:
      return e instanceof Error ? e.message : 'Algo falló y no se pudo identificar qué.'
  }
}
