import { useState } from 'react'
import { formato, parsearMonto } from '../domain/money'
import type { Cliente } from '../domain/types'
import type { Pos } from '../hooks/usePos'
import { Hoja } from './Hoja'

/**
 * Alta y edición de un cliente, en la misma hoja.
 *
 * Solo el nombre es obligatorio. Pedir cédula y teléfono para poder darle
 * crédito a alguien que está esperando en el mostrador es la forma segura de
 * que nadie registre a nadie y las deudas vuelvan al papel.
 */
export function HojaCliente({
  pos,
  cliente,
  onCerrar,
}: {
  pos: Pos
  /** null para crear uno nuevo */
  cliente: Cliente | null
  onCerrar: () => void
}) {
  const [nombre, setNombre] = useState(cliente?.nombre ?? '')
  const [telefono, setTelefono] = useState(cliente?.telefono ?? '')
  const [documento, setDocumento] = useState(cliente?.documento ?? '')
  const [tope, setTope] = useState(cliente?.limiteCredito ? String(cliente.limiteCredito) : '')
  const [nota, setNota] = useState(cliente?.nota ?? '')
  const [guardando, setGuardando] = useState(false)
  const [confirmandoBaja, setConfirmandoBaja] = useState(false)

  const saldo = cliente ? pos.saldoDe(cliente.id) : 0
  const debe = saldo > 0

  async function guardar() {
    const limpio = nombre.trim()
    if (limpio === '') return
    setGuardando(true)
    const datos = {
      nombre: limpio,
      documento: documento.trim() || null,
      telefono: telefono.trim() || null,
      limiteCredito: parsearMonto(tope),
      nota: nota.trim() || null,
    }
    if (cliente) {
      await pos.actualizarCliente({ ...cliente, ...datos })
    } else {
      await pos.crearCliente(datos)
    }
    setGuardando(false)
    onCerrar()
  }

  async function darDeBaja() {
    if (!cliente) return
    setGuardando(true)
    const listo = await pos.eliminarCliente(cliente.id)
    setGuardando(false)
    if (listo) onCerrar()
  }

  return (
    <Hoja
      titulo={cliente ? 'Editar cliente' : 'Nuevo cliente'}
      onCerrar={onCerrar}
      pie={
        <button
          onClick={() => void guardar()}
          disabled={guardando || nombre.trim() === ''}
          className="w-full rounded-xl bg-cobre py-3.5 text-[16px] font-bold text-fondo disabled:opacity-40"
        >
          {guardando ? 'Guardando…' : cliente ? 'Guardar cambios' : 'Crear cliente'}
        </button>
      }
    >
      <div className="flex flex-col gap-3 py-1">
        <Campo etiqueta="Nombre" valor={nombre} onCambio={setNombre} autoFocus={!cliente} />
        <Campo etiqueta="Teléfono (opcional)" valor={telefono} onCambio={setTelefono} tipo="tel" />
        <Campo etiqueta="Cédula o RIF (opcional)" valor={documento} onCambio={setDocumento} />
        <Campo
          etiqueta="Tope de crédito en $ (opcional)"
          valor={tope}
          onCambio={setTope}
          tipo="decimal"
        />
        <Campo etiqueta="Nota (opcional)" valor={nota} onCambio={setNota} />
        <p className="text-[12.5px] leading-relaxed text-apagado">
          El tope solo avisa cuando se pasa; no bloquea la venta.
        </p>
      </div>

      {cliente && (
        <div className="mt-4 border-t border-linea pt-4">
          {debe ? (
            <div className="rounded-xl border border-ambar/40 bg-ambar/10 px-3 py-3">
              <p className="text-[13.5px] font-semibold text-ambar">
                No se puede dar de baja: debe {formato(saldo, 'USD')}
              </p>
              <p className="pt-1 text-[12.5px] leading-relaxed text-tinta2">
                Quitarlo ahora dejaría esa deuda apuntando a un cliente que ya no existe, y
                desaparecería de la pantalla sin que nadie la haya pagado. Cóbrala primero desde
                CXC.
              </p>
            </div>
          ) : confirmandoBaja ? (
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmandoBaja(false)}
                className="flex-1 rounded-xl border border-linea2 py-3 text-[15px] font-semibold text-tinta2"
              >
                Cancelar
              </button>
              <button
                onClick={() => void darDeBaja()}
                disabled={guardando}
                className="flex-1 rounded-xl bg-alerta py-3 text-[15px] font-bold text-fondo disabled:opacity-60"
              >
                Sí, dar de baja
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmandoBaja(true)}
              className="w-full rounded-xl border border-alerta/50 py-3 text-[15px] font-semibold text-alerta"
            >
              Dar de baja
            </button>
          )}
          <p className="pt-2 text-[12px] leading-relaxed text-apagado">
            Dar de baja lo saca de las listas, pero no borra su historial de compras: los cierres
            de días pasados tienen que seguir dando el mismo número.
          </p>
        </div>
      )}
    </Hoja>
  )
}

function Campo({
  etiqueta,
  valor,
  onCambio,
  tipo,
  autoFocus,
}: {
  etiqueta: string
  valor: string
  onCambio: (v: string) => void
  tipo?: 'tel' | 'decimal'
  autoFocus?: boolean
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10.5px] tracking-[0.12em] text-apagado uppercase">
        {etiqueta}
      </span>
      <input
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        autoFocus={autoFocus}
        inputMode={tipo === 'decimal' ? 'decimal' : tipo === 'tel' ? 'tel' : 'text'}
        className="rounded-xl border border-linea bg-panel2 px-3 py-3 focus:border-cobre"
      />
    </label>
  )
}
