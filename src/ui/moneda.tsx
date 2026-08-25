import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { MONEDAS, convertir, formato } from '../domain/money'
import type { MonedaCodigo } from '../domain/types'

/**
 * En qué moneda se están mirando los precios.
 *
 * Los precios se CARGAN siempre en dólares, porque es lo único estable. Lo que
 * cambia todos los días es la tasa, así que ver el precio en bolívares o en
 * pesos es una operación de pantalla, no un dato guardado: al tocar cualquier
 * precio, toda la aplicación cambia de moneda a la vez.
 *
 * Que sea global y no por producto es a propósito. Si cada precio recordara su
 * propia moneda, media pantalla quedaría en bolívares y la otra media en pesos,
 * y sumar de cabeza lo que lleva el cliente sería imposible.
 */

const ORDEN: MonedaCodigo[] = ['USD', 'VES', 'COP']

interface Ctx {
  moneda: MonedaCodigo
  /** Pasa a la siguiente moneda: $ → Bs → COL$ → $ */
  rotar: () => void
  fijar: (m: MonedaCodigo) => void
  /** Convierte un monto en dólares a la moneda que se está mirando */
  aVista: (montoBase: number) => number
  /** El mismo monto, ya formateado con su símbolo */
  texto: (montoBase: number) => string
  tasas: Record<string, number>
  /** La moneda elegida no tiene tasa cargada: no se puede convertir */
  sinTasa: boolean
}

const MonedaCtx = createContext<Ctx | null>(null)

export function ProveedorMoneda({
  tasas,
  children,
}: {
  tasas: Record<string, number>
  children: React.ReactNode
}) {
  const [moneda, setMoneda] = useState<MonedaCodigo>('USD')

  const rotar = useCallback(() => {
    setMoneda((m) => ORDEN[(ORDEN.indexOf(m) + 1) % ORDEN.length] ?? 'USD')
  }, [])

  const valor = useMemo<Ctx>(() => {
    const tasa = moneda === 'USD' ? 1 : (tasas[moneda] ?? 0)
    const sinTasa = moneda !== 'USD' && tasa <= 0
    const aVista = (base: number) => (sinTasa ? 0 : convertir(base, moneda, tasa))
    return {
      moneda,
      rotar,
      fijar: setMoneda,
      aVista,
      texto: (base: number) => (sinTasa ? `${MONEDAS[moneda].simbolo} —` : formato(aVista(base), moneda)),
      tasas,
      sinTasa,
    }
  }, [moneda, rotar, tasas])

  return <MonedaCtx.Provider value={valor}>{children}</MonedaCtx.Provider>
}

export function useMoneda(): Ctx {
  const ctx = useContext(MonedaCtx)
  if (!ctx) throw new Error('useMoneda fuera de ProveedorMoneda')
  return ctx
}

/**
 * Un precio en pantalla. Se toca y toda la aplicación cambia de moneda.
 *
 * Es un botón de verdad y no un `<span>` con onClick porque en Android el
 * lector de pantalla y el teclado tienen que poder llegar a él: es la única
 * forma de ver el precio en bolívares.
 */
export function Precio({
  base,
  className = '',
  tamano = 'normal',
}: {
  /** El precio en dólares, que es como está guardado */
  base: number
  className?: string
  tamano?: 'normal' | 'grande' | 'chico'
}) {
  const { texto, rotar, moneda } = useMoneda()
  const tam =
    tamano === 'grande' ? 'text-[19px]' : tamano === 'chico' ? 'text-[12.5px]' : 'text-[15px]'

  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        rotar()
      }}
      title="Tocar para ver en otra moneda"
      aria-label={`${texto(base)}. Tocar para cambiar de moneda`}
      className={`tabular ${tam} font-semibold whitespace-nowrap ${
        moneda === 'USD' ? '' : 'text-cobre2'
      } ${className}`}
      style={{ minHeight: 0 }}
    >
      {texto(base)}
    </button>
  )
}

/** Indicador de en qué moneda se está mirando, para la barra superior. */
export function ChipMoneda() {
  const { moneda, rotar, sinTasa } = useMoneda()
  return (
    <button
      onClick={rotar}
      className={`flex items-center gap-1 rounded-full border px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wider ${
        sinTasa
          ? 'border-alerta/50 bg-alerta/10 text-alerta'
          : moneda === 'USD'
            ? 'border-linea2 text-tinta2'
            : 'border-cobre/50 bg-cobre/10 text-cobre2'
      }`}
      style={{ minHeight: 0 }}
      title="Moneda en la que se ven los precios"
    >
      {MONEDAS[moneda].simbolo}
      {sinTasa && <span className="text-[10px]">sin tasa</span>}
    </button>
  )
}
