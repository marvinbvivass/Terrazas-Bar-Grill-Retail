import { describe, expect, it } from 'vitest'
import { cajaDe, construirHojaSemana } from './excelSemana'
import { construirSemana } from './semana'
import { inicioDe } from './dias'
import { BOTELLA, CAJA36, POLAR, SALA, SIXPACK } from './fixtures'
import type { Celda } from '../data/xlsx'
import type { Categoria, MovimientoInventario, Presentacion, UUID } from './types'

const LUNES = '2026-10-05'
const CATEGORIAS: Categoria[] = [{ id: 'cat-cerveza', nombre: 'Cerveza', orden: 1 }]
const PRESENTACIONES = new Map<UUID, Presentacion>([
  [BOTELLA.id, BOTELLA],
  [CAJA36.id, CAJA36],
])

function mov(
  dia: string,
  tipo: MovimientoInventario['tipo'],
  presentacion: Presentacion,
  cantidad: number,
  signo: 1 | -1,
): MovimientoInventario {
  return {
    id: `${dia}-${tipo}-${presentacion.id}-${cantidad}-${signo}`,
    fecha: inicioDe(dia) + 12 * 3600_000,
    tipo,
    productoId: POLAR.id,
    presentacionId: presentacion.id,
    cantidadPresentacion: cantidad,
    cantidadBase: signo * cantidad * presentacion.factor,
    ubicacionId: SALA.id,
    ubicacionDestinoId: null,
    costoUnitario: null,
    documentoTipo: null,
    documentoId: null,
    usuarioId: 'u',
    motivo: null,
  }
}

function hoja(movimientos: MovimientoInventario[], stockHoy: number, vacios = new Map<UUID, number>()) {
  const filas = construirSemana({
    lunes: LUNES,
    productos: [POLAR],
    movimientos,
    stockActual: () => stockHoy,
    presentacionesPorId: PRESENTACIONES,
    hoy: '2026-10-11',
  })
  return construirHojaSemana({
    negocio: 'Terrazas',
    lunes: LUNES,
    filas,
    categorias: CATEGORIAS,
    presentacionesPorProducto: new Map([[POLAR.id, [BOTELLA, CAJA36]]]),
    precioDe: (id) => (id === CAJA36.id ? 62000 : 2500),
    moneda: 'COP',
    vaciosCompania: vacios,
    vaciosClientes: 0,
  })
}

/** La fila del producto: la primera después del encabezado de grupo */
function filaProducto(h: ReturnType<typeof hoja>): Celda[] {
  return h.filas[4]!
}

function valor(c: Celda | undefined): unknown {
  if (!c) return null
  return c.tipo === 'formula' ? c.formula : c.valor
}

describe('cuál es la caja de un producto', () => {
  it('es la presentación más grande, no la primera que aparezca', () => {
    // Con six-pack y caja, la caja manda: es la unidad en la que llega el
    // camión y en la que se cuenta el depósito.
    expect(cajaDe([BOTELLA, SIXPACK, CAJA36])?.id).toBe(CAJA36.id)
  })

  it('un producto que solo se vende suelto no tiene caja', () => {
    expect(cajaDe([BOTELLA])).toBeNull()
  })
})

describe('la hoja de la semana', () => {
  const h = hoja([mov('2026-10-06', 'venta', BOTELLA, 40, -1)], 960)

  it('se llama como la semana que contiene', () => {
    expect(h.nombre).toBe('05 10 - 11 10')
  })

  it('deja quietos el producto y las cabeceras al rodar de lado', () => {
    // Nueve columnas por día no caben en ninguna pantalla; sin la primera
    // columna fija uno pierde la fila a los dos deslizamientos.
    expect(h.congelar).toBe('B4')
  })

  it('reparte la apertura en cajas y sueltas', () => {
    const fila = filaProducto(h)
    expect(valor(fila[2])).toBe(27) // 1000 / 36 = 27 cajas
    expect(valor(fila[3])).toBe(28) // y 28 sueltas
    expect(valor(fila[4])).toBe('(C5*36)+D5')
  })

  it('escribe los precios de la unidad y de la caja', () => {
    const fila = filaProducto(h)
    expect(valor(fila[5])).toBe(2500)
    expect(valor(fila[6])).toBe(62000)
  })
})

describe('las fórmulas van vivas', () => {
  it('el saldo del primer día sale de la apertura', () => {
    // Si se escribiera el resultado en vez de la cuenta, el archivo sería una
    // foto muerta: nadie podría seguir la cifra con el dedo, que es justo para
    // lo que se imprime.
    const fila = filaProducto(hoja([], 1000))
    expect(valor(fila[10])).toBe('E5-H5-(I5*36)+J5')
  })

  it('cada día arrastra del saldo del día anterior', () => {
    const fila = filaProducto(hoja([], 1000))
    expect(valor(fila[14])).toBe('K5-L5-(M5*36)+N5')
  })

  it('la caja se resta multiplicada por lo que trae', () => {
    // El error que tenía el archivo a mano: restar dos cajas como si fueran
    // dos botellas.
    const fila = filaProducto(hoja([], 1000))
    expect(valor(fila[10])).toContain('*36')
  })

  it('un producto suelto no multiplica por nada', () => {
    const h = construirHojaSemana({
      negocio: 'T',
      lunes: LUNES,
      filas: construirSemana({
        lunes: LUNES,
        productos: [{ ...POLAR, retornable: false }],
        movimientos: [],
        stockActual: () => 3,
        presentacionesPorId: new Map([[BOTELLA.id, BOTELLA]]),
        hoy: '2026-10-11',
      }),
      categorias: CATEGORIAS,
      presentacionesPorProducto: new Map([[POLAR.id, [BOTELLA]]]),
      precioDe: () => 1,
      moneda: 'COP',
      vaciosCompania: new Map(),
      vaciosClientes: 0,
    })
    expect(valor(filaProducto(h)[10])).toBe('E5-H5-I5+J5')
    // Y su apertura va entera en la columna de unidades
    expect(valor(filaProducto(h)[4])).toBe(3)
  })
})

describe('lo que el cuaderno no tenía', () => {
  it('las recargas y las correcciones van en su propia columna', () => {
    /*
     * En el cuaderno lo vendido se deducía restando el conteo de ayer menos el
     * de hoy, así que seis botellas rotas contaban como seis vendidas.
     */
    const h = hoja(
      [
        mov('2026-10-06', 'venta', BOTELLA, 40, -1),
        mov('2026-10-06', 'merma', BOTELLA, 6, -1),
        mov('2026-10-08', 'compra', CAJA36, 10, 1),
      ],
      1314,
    )
    const fila = filaProducto(h)
    // Lunes ocupa las columnas 7 a 10, martes 11 a 14, jueves 19 a 22
    expect(valor(fila[11])).toBe(40) // vendido suelto el martes
    expect(valor(fila[13])).toBe(-6) // y la merma aparte, en Mov.
    expect(valor(fila[21])).toBe(360) // la recarga del jueves
  })

  it('dice qué productos manejan vacío', () => {
    expect(valor(filaProducto(hoja([], 1000))[1])).toBe('sí')
  })

  it('lleva al pie las cajas pendientes con la compañía', () => {
    const h = hoja([], 1000, new Map([[POLAR.id, 13]]))
    const texto = JSON.stringify(h.filas)
    expect(texto).toContain('VACÍOS')
    expect(texto).toContain('le debemos')
  })
})

describe('los días que no han llegado', () => {
  it('no escriben ceros, pero el saldo sigue arrastrando', () => {
    // Un cero dice "no se vendió nada"; el día que todavía no pasó no dice
    // nada, y escribirlo en cero convierte una semana a medias en una semana
    // malísima.
    const filas = construirSemana({
      lunes: LUNES,
      productos: [POLAR],
      movimientos: [],
      stockActual: () => 1000,
      presentacionesPorId: PRESENTACIONES,
      hoy: '2026-10-07',
    })
    const h = construirHojaSemana({
      negocio: 'T',
      lunes: LUNES,
      filas,
      categorias: CATEGORIAS,
      presentacionesPorProducto: new Map([[POLAR.id, [BOTELLA, CAJA36]]]),
      precioDe: () => 1,
      moneda: 'COP',
      vaciosCompania: new Map(),
      vaciosClientes: 0,
    })
    const fila = filaProducto(h)
    // El jueves no ha llegado: sin venta escrita, pero con su fórmula de saldo
    expect(fila[19]).toBeUndefined()
    expect(valor(fila[22])).toContain('-')
  })
})
