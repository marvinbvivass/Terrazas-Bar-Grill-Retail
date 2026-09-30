import { diaDe, hoy, inicioDe } from './dias'
import type { DiaNegocio } from './types'

/**
 * La rejilla de un mes, para pintar un calendario.
 *
 * Se arma aquí y no en la pantalla porque tiene dos trampas que conviene tener
 * probadas y no descubrir en producción.
 *
 * LA SEMANA EMPIEZA EN LUNES. `getDay()` de JavaScript devuelve 0 para domingo
 * porque viene del calendario estadounidense; aquí el lunes es el primero. Sin
 * corregirlo, cada mes aparece desplazado un día y nadie entiende por qué el
 * cierre del martes cae en la columna del lunes.
 *
 * LOS HUECOS SE RELLENAN con los días del mes vecino, en gris. Dejarlos en
 * blanco parece más limpio hasta que el 1 cae en domingo y la primera fila se
 * ve casi vacía.
 */

export interface CeldaCalendario {
  dia: DiaNegocio
  /** El número que se pinta */
  numero: number
  /** Del mes que se está mirando, o de un mes vecino */
  delMes: boolean
  esHoy: boolean
  /** Todavía no ha llegado */
  futuro: boolean
}

export const DIAS_SEMANA = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'] as const

/** 'septiembre de 2026' */
export function nombreDelMes(ancla: DiaNegocio): string {
  return new Date(inicioDe(ancla)).toLocaleDateString('es-VE', {
    month: 'long',
    year: 'numeric',
  })
}

/** El día 1 del mes de esa fecha, para usarlo de ancla */
export function primerDiaDelMes(dia: DiaNegocio): DiaNegocio {
  const [a, m] = dia.split('-')
  return `${a}-${m}-01`
}

export function mesSiguiente(ancla: DiaNegocio): DiaNegocio {
  const d = new Date(inicioDe(primerDiaDelMes(ancla)))
  d.setMonth(d.getMonth() + 1)
  return diaDe(d)
}

export function mesAnterior(ancla: DiaNegocio): DiaNegocio {
  const d = new Date(inicioDe(primerDiaDelMes(ancla)))
  d.setMonth(d.getMonth() - 1)
  return diaDe(d)
}

/**
 * Las seis semanas del mes, siempre 42 celdas.
 *
 * Siempre seis filas y no las que hagan falta: si la rejilla cambiara de alto
 * al pasar de mes, el botón que hay debajo saltaría bajo el dedo justo cuando
 * el usuario va a tocarlo.
 */
export function rejillaDelMes(ancla: DiaNegocio, referencia: DiaNegocio = hoy()): CeldaCalendario[] {
  const primero = new Date(inicioDe(primerDiaDelMes(ancla)))
  const mes = primero.getMonth()

  // getDay(): 0 domingo … 6 sábado. Se convierte a 0 lunes … 6 domingo.
  const desplazamiento = (primero.getDay() + 6) % 7

  const inicio = new Date(primero)
  inicio.setDate(inicio.getDate() - desplazamiento)

  const celdas: CeldaCalendario[] = []
  for (let i = 0; i < 42; i++) {
    const fecha = new Date(inicio)
    fecha.setDate(fecha.getDate() + i)
    const dia = diaDe(fecha)
    celdas.push({
      dia,
      numero: fecha.getDate(),
      delMes: fecha.getMonth() === mes,
      esHoy: dia === referencia,
      futuro: dia > referencia,
    })
  }
  return celdas
}
