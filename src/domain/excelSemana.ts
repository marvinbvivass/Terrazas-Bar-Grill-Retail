import { letraDeColumna, type Celda, type Estilo, type HojaExcel } from '../data/xlsx'
import { diasDeLaSemana, textoDeLaSemana, type FilaSemana } from './semana'
import { textoCorto } from './dias'
import type { Categoria, DiaNegocio, Presentacion, UUID } from './types'

/**
 * La semana, en una hoja de cálculo.
 *
 * Es el cuaderno de siempre, pero escrito por la aplicación en vez de a mano:
 * los productos en filas, los días en columnas, el saldo arrastrándose de un
 * día al siguiente.
 *
 * LAS FÓRMULAS VAN VIVAS, no los resultados. Podría escribirse el número y
 * listo, pero entonces el archivo sería una foto muerta: nadie podría seguir
 * una cifra con el dedo para ver de dónde sale, que es exactamente para lo que
 * se imprime. Con las fórmulas puestas, cada saldo enseña su cuenta.
 *
 * Y hay una columna que el cuaderno no tenía: MOV. Ahí van las recargas y las
 * correcciones —mermas y conteos— con su signo. En el cuaderno lo vendido se
 * deducía restando el conteo de ayer menos el de hoy, así que una botella rota
 * contaba como vendida. Separarlo es la diferencia entre saber qué se vendió y
 * suponerlo.
 */

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

/** Las cuatro columnas que ocupa cada día */
const POR_DIA = 4
const PRIMERA_DIA = 7

export interface EntradaExcel {
  negocio: string
  lunes: DiaNegocio
  filas: FilaSemana[]
  categorias: Categoria[]
  presentacionesPorProducto: Map<UUID, Presentacion[]>
  /** El precio de una presentación, en la moneda en que se va a escribir */
  precioDe: (presentacionId: UUID) => number
  moneda: string
  /**
   * Las tasas vigentes cada día de la semana.
   *
   * Van en la hoja porque sin ellas las cifras no se pueden repetir. Dentro de
   * tres meses, con el peso en otro sitio, nadie podría reconstruir de dónde
   * salió un precio de esta semana — y una hoja de control que no se puede
   * rehacer es una hoja en la que hay que creer a ciegas.
   */
  tasasPorDia: Array<{ dia: DiaNegocio; tasas: Record<string, number> }>
  /** El día cuya tasa se usó para convertir los precios de la hoja */
  diaDePrecios: DiaNegocio
  /** Cajas que se le deben a la compañía. Una sola bolsa, sin separar marca. */
  vaciosCompania: number
  /** Cajas que deben los clientes, en total */
  vaciosClientes: number
}

const texto = (valor: string, estilo?: Estilo): Celda => ({ tipo: 'texto', valor, estilo })
const numero = (valor: number, estilo?: Estilo): Celda => ({ tipo: 'numero', valor, estilo })
const formula = (f: string, estilo?: Estilo): Celda => ({ tipo: 'formula', formula: f, estilo })

/** La presentación más grande del producto: su caja */
export function cajaDe(presentaciones: Presentacion[]): Presentacion | null {
  const bultos = presentaciones.filter((p) => !p.esBase && p.activo)
  if (bultos.length === 0) return null
  return bultos.reduce((a, b) => (b.factor > a.factor ? b : a))
}

export function construirHojaSemana(e: EntradaExcel): HojaExcel {
  const dias = diasDeLaSemana(e.lunes)
  const celdas: Celda[][] = []
  const combinadas: string[] = []

  const col = (i: number) => letraDeColumna(i)
  const colDia = (d: number) => PRIMERA_DIA + d * POR_DIA
  const colTotales = PRIMERA_DIA + 7 * POR_DIA

  // ---- Fila 1: el título ----
  celdas.push([texto(`${e.negocio} · semana ${textoDeLaSemana(e.lunes)}`, 'fuerte')])

  // ---- Fila 2: los días, cada uno sobre sus cuatro columnas ----
  const fila2: Celda[] = []
  fila2[0] = texto('FECHA', 'apagado')
  fila2[2] = texto('APERTURA', 'apagado')
  fila2[5] = texto(`PRECIOS EN ${e.moneda}`, 'apagado')
  dias.forEach((d, i) => {
    fila2[colDia(i)] = texto(`${DIAS[i]} ${textoCorto(d)}`, 'grupo')
    combinadas.push(`${col(colDia(i))}2:${col(colDia(i) + 3)}2`)
  })
  fila2[colTotales] = texto('TOTAL DE LA SEMANA', 'grupo')
  combinadas.push(`${col(colTotales)}2:${col(colTotales + 2)}2`)
  celdas.push(fila2)

  // ---- Fila 3: los encabezados de columna ----
  const fila3: Celda[] = []
  const encabezado = (i: number, t: string) => {
    fila3[i] = texto(t, 'cabecera')
  }
  encabezado(0, 'Producto')
  encabezado(1, 'Vacío')
  encabezado(2, 'Cj.')
  encabezado(3, 'Unid.')
  encabezado(4, 'T. Unid.')
  encabezado(5, 'PVU')
  encabezado(6, 'PVC')
  for (let d = 0; d < 7; d++) {
    encabezado(colDia(d), 'V. Unid.')
    encabezado(colDia(d) + 1, 'V. Cj.')
    encabezado(colDia(d) + 2, 'Mov.')
    encabezado(colDia(d) + 3, 'Saldo')
  }
  encabezado(colTotales, 'T.V. Unid.')
  encabezado(colTotales + 1, 'T.V. Cj.')
  encabezado(colTotales + 2, 'Ingreso')
  encabezado(colTotales + 3, 'Quedó')
  celdas.push(fila3)

  // ---- Las filas de producto, por categoría y por tamaño de caja ----
  const nombreCategoria = (id: UUID) => e.categorias.find((c) => c.id === id)?.nombre ?? 'Sin categoría'

  const grupos = new Map<string, FilaSemana[]>()
  for (const f of e.filas) {
    const caja = cajaDe(e.presentacionesPorProducto.get(f.producto.id) ?? [])
    const clave = `${f.producto.categoriaId}|${caja?.factor ?? 1}`
    const lista = grupos.get(clave) ?? []
    lista.push(f)
    grupos.set(clave, lista)
  }

  const filasDeProducto: Array<{ fila: FilaSemana; numero: number; factor: number }> = []

  for (const [clave, lista] of grupos) {
    const [categoriaId, factorTexto] = clave.split('|')
    const factor = Number(factorTexto)

    const encabezadoGrupo: Celda[] = []
    encabezadoGrupo[0] = texto(
      factor > 1
        ? `${nombreCategoria(categoriaId!)} — caja de ${factor}`
        : `${nombreCategoria(categoriaId!)} — suelto`,
      'grupo',
    )
    celdas.push(encabezadoGrupo)

    for (const f of lista) {
      const presentaciones = e.presentacionesPorProducto.get(f.producto.id) ?? []
      const base = presentaciones.find((p) => p.esBase)
      const caja = cajaDe(presentaciones)
      const n = celdas.length + 1 // número de fila, que empieza en 1

      const fila: Celda[] = []
      fila[0] = texto(f.producto.nombreCorto)
      // Celda vacía y no cadena vacía: una columna llena de casillas en blanco
      // pesa igual que una llena de datos y se lee peor.
      if (f.producto.retornable) fila[1] = texto('sí', 'fuerte')
      if (factor > 1) {
        fila[2] = numero(Math.floor(f.apertura / factor))
        fila[3] = numero(f.apertura - Math.floor(f.apertura / factor) * factor)
        fila[4] = formula(`(C${n}*${factor})+D${n}`)
      } else {
        fila[4] = numero(f.apertura)
      }
      fila[5] = numero(base ? e.precioDe(base.id) : 0)
      if (caja) fila[6] = numero(e.precioDe(caja.id))

      for (let d = 0; d < 7; d++) {
        const celda = f.dias[d]!
        const c = colDia(d)
        if (!celda.futuro) {
          if (celda.unidades > 0) fila[c] = numero(celda.unidades)
          if (celda.bultos > 0) fila[c + 1] = numero(celda.bultos)
          const movimiento = celda.entrada + celda.ajuste
          if (movimiento !== 0) fila[c + 2] = numero(movimiento)
        }
        // El saldo arrastra desde la apertura el primer día y desde el saldo
        // anterior los demás. Es la cadena que se sigue con el dedo.
        const previo = d === 0 ? `E${n}` : `${col(colDia(d - 1) + 3)}${n}`
        const venta =
          factor > 1
            ? `${col(c)}${n}-(${col(c + 1)}${n}*${factor})`
            : `${col(c)}${n}-${col(c + 1)}${n}`
        fila[c + 3] = formula(`${previo}-${venta}+${col(c + 2)}${n}`, 'apagado')
      }

      const sumaU = Array.from({ length: 7 }, (_, d) => `${col(colDia(d))}${n}`).join('+')
      const sumaCj = Array.from({ length: 7 }, (_, d) => `${col(colDia(d) + 1)}${n}`).join('+')
      fila[colTotales] = formula(sumaU, 'fuerte')
      fila[colTotales + 1] = formula(sumaCj, 'fuerte')
      fila[colTotales + 2] = formula(
        `(${col(colTotales)}${n}*F${n})+(${col(colTotales + 1)}${n}*G${n})`,
        'dinero',
      )
      fila[colTotales + 3] = formula(`${col(colDia(6) + 3)}${n}`, 'fuerte')

      celdas.push(fila)
      filasDeProducto.push({ fila: f, numero: n, factor })
    }
  }

  // ---- El pie: lo vendido cada día y el ingreso de la semana ----
  if (filasDeProducto.length > 0) {
    const primera = filasDeProducto[0]!.numero
    const ultima = filasDeProducto[filasDeProducto.length - 1]!.numero
    const pie: Celda[] = []
    pie[0] = texto('Vendido (unidades)', 'fuerte')
    for (let d = 0; d < 7; d++) {
      const c = colDia(d)
      pie[c] = formula(`SUM(${col(c)}${primera}:${col(c)}${ultima})`, 'fuerte')
    }
    pie[colTotales + 2] = formula(
      `SUM(${col(colTotales + 2)}${primera}:${col(colTotales + 2)}${ultima})`,
      'dinero',
    )
    celdas.push([], pie)
  }

  // ---- Las tasas con las que se miró la semana ----
  const monedasConTasa = [
    ...new Set(e.tasasPorDia.flatMap((t) => Object.keys(t.tasas))),
  ].sort()

  if (monedasConTasa.length > 0) {
    celdas.push([])
    celdas.push([texto('TASAS DEL DÍA', 'grupo')])
    celdas.push([
      texto('Día', 'cabecera'),
      ...monedasConTasa.map((m) => texto(m, 'cabecera')),
    ])
    e.tasasPorDia.forEach((t, i) => {
      celdas.push([
        texto(`${DIAS[i]} ${textoCorto(t.dia)}`),
        ...monedasConTasa.map((m) => (t.tasas[m] ? numero(t.tasas[m]!) : null)),
      ])
    })
    celdas.push([
      texto(
        `Precios de esta hoja en ${e.moneda}, con la tasa del ${textoCorto(e.diaDePrecios)}. ` +
          'La tasa de un día que no se cargó arrastra la última cargada antes.',
        'apagado',
      ),
    ])
  }

  /*
   * Los vacíos, que el cuaderno nunca tuvo.
   *
   * Dos cifras y no un reparto por marca: la gavera es la gavera, y una caja
   * devuelta salda una caja debida sea del producto que sea. Las dos deudas van
   * en direcciones contrarias y por eso van en renglones separados: restarlas
   * daría un número que no significa nada.
   */
  const conVacios = e.filas.filter((f) => f.producto.retornable)
  if (conVacios.length > 0 || e.vaciosCompania !== 0 || e.vaciosClientes !== 0) {
    celdas.push([])
    celdas.push([texto('VACÍOS (en cajas)', 'grupo')])
    celdas.push([
      texto(
        e.vaciosCompania >= 0
          ? 'Cajas que le debemos a la compañía'
          : 'Cajas a favor con la compañía',
        'fuerte',
      ),
      null,
      numero(Math.abs(e.vaciosCompania), 'fuerte'),
    ])
    celdas.push([
      texto('Cajas que deben los clientes', 'fuerte'),
      null,
      numero(e.vaciosClientes, 'fuerte'),
    ])
    celdas.push([
      texto(
        `Llevan envase: ${conVacios.map((f) => f.producto.nombreCorto).join(', ') || 'ninguno'}.`,
        'apagado',
      ),
    ])
  }

  const anchos = [22, 6, 6, 7, 9, 8, 9]
  for (let d = 0; d < 7; d++) anchos.push(8, 7, 7, 9)
  anchos.push(10, 9, 11, 9)

  return {
    nombre: `${textoCorto(e.lunes)} - ${textoCorto(dias[6]!)}`.replace(/\//g, ' '),
    filas: celdas,
    anchos,
    combinadas,
    // La columna del producto y las tres filas de cabecera se quedan quietas
    congelar: 'B4',
  }
}
