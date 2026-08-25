import { useState } from 'react'
import { entrar, mensajeDeError } from '../data/firebase'
import { entrarSoloLocal } from '../hooks/useSesion'

/**
 * Pantalla de acceso.
 *
 * No hay registro a propósito. Si cualquiera pudiera crearse una cuenta,
 * cualquiera podría entrar a ver las ventas del local y las deudas de los
 * clientes, porque las reglas de Firestore solo exigen tener sesión. Las
 * cuentas se crean a mano en la consola de Firebase, que para un local con dos
 * o tres personas es exactamente lo que hace falta.
 */
export function Login({ sinConexion }: { sinConexion: boolean }) {
  const [email, setEmail] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setEntrando(true)
    try {
      await entrar(email, clave)
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setEntrando(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center px-4">
      <form
        onSubmit={(e) => void enviar(e)}
        className="w-full max-w-sm rounded-xl border border-linea bg-panel p-6"
      >
        <p className="font-mono text-[10px] tracking-[0.16em] text-cobre2 uppercase">Terrazas Bar Grill</p>
        <h1 className="mt-1 mb-5 text-2xl font-bold">Entrar al sistema</h1>

        {sinConexion && (
          <p className="mb-4 rounded-lg border border-ambar/40 bg-ambar/10 px-3.5 py-2.5 text-[13px] text-ambar">
            No hay conexión. Para entrar por primera vez en este equipo hace falta señal;
            después la sesión queda guardada y ya no.
          </p>
        )}

        <label className="mb-3 block">
          <span className="font-mono text-[10px] tracking-[0.12em] text-apagado uppercase">
            Correo
          </span>
          <input
            autoFocus
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-linea2 bg-panel2 px-3.5 py-2.5 focus:border-cobre"
          />
        </label>

        <label className="block">
          <span className="font-mono text-[10px] tracking-[0.12em] text-apagado uppercase">
            Contraseña
          </span>
          <input
            type="password"
            autoComplete="current-password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            className="mt-1 w-full rounded-md border border-linea2 bg-panel2 px-3.5 py-2.5 focus:border-cobre"
          />
        </label>

        {error && (
          <p role="alert" className="mt-3 text-[13px] text-alerta">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={entrando || !email || !clave}
          className="mt-5 w-full rounded-lg bg-cobre py-3 text-[15px] font-bold text-fondo hover:bg-cobre2 disabled:bg-panel3 disabled:text-apagado"
        >
          {entrando ? 'Entrando…' : 'Entrar'}
        </button>

        <p className="mt-4 text-[12px] leading-snug text-apagado">
          Las cuentas se crean desde la consola de Firebase, en Authentication → Users.
          No hay registro abierto a propósito.
        </p>

        {import.meta.env.DEV && (
          <div className="mt-5 border-t border-linea pt-4">
            <button
              type="button"
              onClick={entrarSoloLocal}
              className="w-full rounded-lg border border-linea2 py-2.5 text-[13.5px] font-semibold text-tinta2 hover:border-cobre hover:text-cobre2"
            >
              Probar sin Firebase
            </button>
            <p className="mt-2 text-[11.5px] leading-snug text-apagado">
              Solo en modo desarrollo. Trabaja contra este equipo y no sincroniza nada. Este
              botón no existe en la versión desplegada.
            </p>
          </div>
        )}
      </form>
    </div>
  )
}
