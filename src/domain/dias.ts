import type { DiaNegocio } from './types'

/**
 * El día de negocio.
 *
 * Se guarda como texto 'YYYY-MM-DD' y no como timestamp. Agrupar ventas por
 * rango de timestamps parece más elegante hasta que una venta de las once de
 * la noche cae en el cierre del día siguiente porque el servidor está en UTC y
 * el local en UTC-4. Con texto no hay huso horario que se meta en el medio.
 */

export function diaDe(fecha: Date | number = Date.now()): DiaNegocio {
  const d = typeof fecha === 'number' ? new Date(fecha) : fecha
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

export function hoy(): DiaNegocio {
  return diaDe(new Date())
}

/** Medianoche local del día, para poner una hora razonable a una venta transcrita */
export function inicioDe(dia: DiaNegocio): number {
  const partes = dia.split('-').map(Number)
  const [a, m, d] = [partes[0] ?? 1970, partes[1] ?? 1, partes[2] ?? 1]
  return new Date(a, m - 1, d, 0, 0, 0, 0).getTime()
}

export function sumarDias(dia: DiaNegocio, n: number): DiaNegocio {
  const base = new Date(inicioDe(dia))
  base.setDate(base.getDate() + n)
  return diaDe(base)
}

/** 'lunes 25 de agosto' — para encabezados, no para agrupar */
export function textoLargo(dia: DiaNegocio): string {
  return new Date(inicioDe(dia)).toLocaleDateString('es-VE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/** '25/08' — para listas apretadas */
export function textoCorto(dia: DiaNegocio): string {
  const partes = dia.split('-')
  return `${partes[2]}/${partes[1]}`
}

export function diasDesde(dia: DiaNegocio, referencia: DiaNegocio = hoy()): number {
  return Math.round((inicioDe(referencia) - inicioDe(dia)) / 86_400_000)
}
