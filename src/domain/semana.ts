import { diaDe, inicioDe, sumarDias } from './dias'
import type {
  DiaNegocio,
  MovimientoInventario,
  Presentacion,
  Producto,
  UUID,
} from './types'

/**
 * La semana de un producto, día por día.
 *
 * Es la vista del cuaderno de toda la vida: los productos en filas, los días en
 * columnas, y en cada cruce lo que salió. Lo que antes se llevaba a mano en
 * Excel y se calculaba restando, aquí sale del kardex — de los mismos asientos
 * que dejaron la venta, la recarga, la merma y el conteo.
 *
 * La diferencia que importa: en el cuaderno, lo vendido se DEDUCÍA restando el
 * conteo de ayer menos el de hoy, así que una botella rota contaba como una
 * botella vendida. Aquí cada movimiento dice lo que fue, y por eso hay una
 * columna de ajustes aparte. Sin ella las cuentas de la semana no cerrarían y
 * parecería que el sistema se equivoca.
 *
 * LA SEMANA EMPIEZA EN LUNES, como en el archivo.
 */

export interface CeldaDia {
  dia: DiaNegocio
  /** Vendido en unidades sueltas, contado en unidades */
  unidades: number
  /** Vendido en cajas o paquetes, contado en bultos — no en unidades */
  bultos: number
  /** Lo vendido ese día en unidades base, sueltas y bultos juntos */
  vendido: number
  /** Lo que entró por recarga, en unidades base */
  entrada: number
  /** Mermas, conteos y devoluciones juntos, en unidades base y con signo */
  ajuste: number
  /** Existencia al terminar el día */
  cierre: number
  /** Todavía no ha llegado: la celda va vacía, no en cero */
  futuro: boolean
}

export interface FilaSemana {
  producto: Producto
  /** Existencia al abrir el lunes */
  apertura: number
  dias: CeldaDia[]
  cierre: number
  /** Total vendido en la semana, en unidades base */
  vendido: number
  /** Total que entró por recargas, en unidades base */
  entrado: number
  /** Si no se movió nada en toda la semana */
  quieto: boolean
}

export interface EntradaSemana {
  lunes: DiaNegocio
  productos: Producto[]
  /**
   * TODOS los movimientos desde el lunes de esa semana hasta ahora.
   *
   * Hacen falta los posteriores a la semana, no solo los suyos: la apertura se
   * calcula hacia atrás desde la existencia de hoy, que es el único número que
   * se conoce con certeza. Guardar la apertura de cada semana en alguna parte
   * sería un segundo sitio donde la verdad puede estar mal.
   */
  movimientos: MovimientoInventario[]
  /** Existencia de HOY, por producto */
  stockActual: (productoId: UUID) => number
  presentacionesPorId: Map<UUID, Presentacion>
  hoy: DiaNegocio
}

/** El lunes de la semana que contiene ese día */
export function lunesDe(dia: DiaNegocio): DiaNegocio {
  // getDay(): 0 domingo … 6 sábado. Se convierte a 0 lunes … 6 domingo.
  const desplazamiento = (new Date(inicioDe(dia)).getDay() + 6) % 7
  return sumarDias(dia, -desplazamiento)
}

/** Los siete días, de lunes a domingo */
export function diasDeLaSemana(lunes: DiaNegocio): DiaNegocio[] {
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i))
}

/** 'del 5 al 11 de octubre' */
export function textoDeLaSemana(lunes: DiaNegocio): string {
  const domingo = sumarDias(lunes, 6)
  const l = new Date(inicioDe(lunes))
  const d = new Date(inicioDe(domingo))
  const mesL = l.toLocaleDateString('es-VE', { month: 'long' })
  const mesD = d.toLocaleDateString('es-VE', { month: 'long' })
  return mesL === mesD
    ? `del ${l.getDate()} al ${d.getDate()} de ${mesD}`
    : `del ${l.getDate()} de ${mesL} al ${d.getDate()} de ${mesD}`
}

function vacia(dia: DiaNegocio, cierre: number, futuro: boolean): CeldaDia {
  return { dia, unidades: 0, bultos: 0, vendido: 0, entrada: 0, ajuste: 0, cierre, futuro }
}

export function construirSemana(e: EntradaSemana): FilaSemana[] {
  const dias = diasDeLaSemana(e.lunes)
  const finDeSemana = dias[6]!

  /*
   * Los movimientos, repartidos por producto y por día.
   *
   * Se agrupa por `diaDe(fecha)` y no por rango de timestamps a propósito: es
   * la misma razón por la que el día de negocio es texto. Un movimiento de las
   * once de la noche no puede caer en el día siguiente porque alguien tenga el
   * teléfono en otro huso.
   */
  const porProducto = new Map<UUID, Map<DiaNegocio, MovimientoInventario[]>>()
  /** Lo ocurrido DESPUÉS de la semana: sirve para retroceder desde hoy */
  const posteriores = new Map<UUID, number>()

  for (const m of e.movimientos) {
    const dia = diaDe(m.fecha)
    if (dia > finDeSemana) {
      posteriores.set(m.productoId, (posteriores.get(m.productoId) ?? 0) + m.cantidadBase)
      continue
    }
    if (dia < e.lunes) continue
    let deEste = porProducto.get(m.productoId)
    if (!deEste) {
      deEste = new Map()
      porProducto.set(m.productoId, deEste)
    }
    const delDia = deEste.get(dia) ?? []
    delDia.push(m)
    deEste.set(dia, delDia)
  }

  return e.productos.map((producto) => {
    const suyos = porProducto.get(producto.id) ?? new Map<DiaNegocio, MovimientoInventario[]>()

    // La existencia al cerrar el domingo: lo de hoy menos lo que pasó después.
    const cierreSemana = e.stockActual(producto.id) - (posteriores.get(producto.id) ?? 0)

    // Y la apertura, quitándole además todo lo de la propia semana.
    let movidoEnLaSemana = 0
    for (const delDia of suyos.values()) {
      for (const m of delDia) movidoEnLaSemana += m.cantidadBase
    }
    const apertura = cierreSemana - movidoEnLaSemana

    let saldo = apertura
    let vendido = 0
    let entrado = 0

    const celdas = dias.map((dia) => {
      if (dia > e.hoy) return vacia(dia, saldo, true)

      const delDia = suyos.get(dia) ?? []
      if (delDia.length === 0) return vacia(dia, saldo, false)

      let unidades = 0
      let bultos = 0
      let vendidoHoy = 0
      let entrada = 0
      let ajuste = 0

      for (const m of delDia) {
        if (m.tipo === 'venta') {
          const pres = m.presentacionId ? e.presentacionesPorId.get(m.presentacionId) : undefined
          // Una venta sale en negativo; aquí se cuenta en positivo, que es como
          // se lee un cuaderno: "el jueves se vendieron 40".
          if (pres && !pres.esBase) bultos += Math.abs(m.cantidadPresentacion)
          else unidades += Math.abs(m.cantidadPresentacion)
          vendidoHoy += Math.abs(m.cantidadBase)
          vendido += Math.abs(m.cantidadBase)
        } else if (m.tipo === 'compra') {
          entrada += m.cantidadBase
          entrado += m.cantidadBase
        } else {
          // Merma, conteo y devoluciones van juntos y con su signo: son las
          // correcciones, y lo que importa de ellas es que se vean aparte de
          // la venta.
          ajuste += m.cantidadBase
        }
        saldo += m.cantidadBase
      }

      return {
        dia,
        unidades,
        bultos,
        vendido: vendidoHoy,
        entrada,
        ajuste,
        cierre: saldo,
        futuro: false,
      }
    })

    return {
      producto,
      apertura,
      dias: celdas,
      cierre: saldo,
      vendido,
      entrado,
      quieto: movidoEnLaSemana === 0 && apertura === 0,
    }
  })
}

/** Lo vendido por día, sumando todos los productos — para el pie de la tabla */
export function totalesPorDia(filas: FilaSemana[]): Array<{ dia: DiaNegocio; vendido: number }> {
  if (filas.length === 0) return []
  return filas[0]!.dias.map((celda, i) => ({
    dia: celda.dia,
    vendido: filas.reduce((s, f) => s + (f.dias[i]?.vendido ?? 0), 0),
  }))
}
