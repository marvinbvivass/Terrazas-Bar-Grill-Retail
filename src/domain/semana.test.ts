import { describe, expect, it } from 'vitest'
import {
  construirSemana,
  diasDeLaSemana,
  lunesDe,
  textoDeLaSemana,
  totalesPorDia,
} from './semana'
import { inicioDe } from './dias'
import { BOTELLA, CAJA36, POLAR, SALA } from './fixtures'
import type { MovimientoInventario, Presentacion, UUID } from './types'

const LUNES = '2026-10-05'
const PRESENTACIONES = new Map<UUID, Presentacion>([
  [BOTELLA.id, BOTELLA],
  [CAJA36.id, CAJA36],
])

/** Un asiento de kardex: cantidadBase va en negativo cuando sale */
function mov(
  dia: string,
  tipo: MovimientoInventario['tipo'],
  presentacion: Presentacion,
  cantidad: number,
  signo: 1 | -1,
): MovimientoInventario {
  return {
    id: `${dia}-${tipo}-${presentacion.id}-${cantidad}`,
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
    usuarioId: 'u-encargado',
    motivo: null,
  }
}

function correr(movimientos: MovimientoInventario[], stockHoy: number, hoy = '2026-10-11') {
  return construirSemana({
    lunes: LUNES,
    productos: [POLAR],
    movimientos,
    stockActual: () => stockHoy,
    presentacionesPorId: PRESENTACIONES,
    hoy,
  })[0]!
}

describe('en qué semana cae un día', () => {
  it('el miércoles pertenece a su lunes', () => {
    expect(lunesDe('2026-10-07')).toBe('2026-10-05')
  })

  it('el lunes es su propio lunes', () => {
    expect(lunesDe('2026-10-05')).toBe('2026-10-05')
  })

  it('el domingo cierra la semana que empezó seis días antes', () => {
    // El error clásico: con la semana empezando en domingo, el cierre del
    // domingo cae en la semana siguiente y parte el fin de semana en dos.
    expect(lunesDe('2026-10-11')).toBe('2026-10-05')
  })

  it('son siete días, de lunes a domingo', () => {
    const dias = diasDeLaSemana(LUNES)
    expect(dias).toHaveLength(7)
    expect(dias[0]).toBe('2026-10-05')
    expect(dias[6]).toBe('2026-10-11')
  })

  it('se lee como se dice', () => {
    expect(textoDeLaSemana(LUNES)).toBe('del 5 al 11 de octubre')
  })

  it('una semana a caballo entre dos meses nombra los dos', () => {
    expect(textoDeLaSemana('2026-10-26')).toBe('del 26 de octubre al 1 de noviembre')
  })
})

describe('la semana de un producto', () => {
  it('la apertura se calcula hacia atrás desde la existencia de hoy', () => {
    /*
     * Es la decisión de fondo: el único número cierto es lo que hay ahora en
     * el anaquel. Guardar la apertura de cada semana sería un segundo sitio
     * donde la verdad puede estar mal, y cuando dos sitios se contradicen no
     * hay forma de saber cuál tenía razón.
     */
    const movs = [mov('2026-10-06', 'venta', BOTELLA, 40, -1)]
    const fila = correr(movs, 960)
    expect(fila.apertura).toBe(1000)
    expect(fila.cierre).toBe(960)
  })

  it('separa lo vendido suelto de lo vendido por cajas', () => {
    // El cuaderno lo lleva así y no es capricho: dos cajas no son dos.
    const movs = [
      mov('2026-10-06', 'venta', BOTELLA, 40, -1),
      mov('2026-10-06', 'venta', CAJA36, 2, -1),
    ]
    const martes = correr(movs, 888).dias[1]!
    expect(martes.unidades).toBe(40)
    expect(martes.bultos).toBe(2)
    // 40 sueltas + 72 en cajas
    expect(martes.cierre).toBe(888)
  })

  it('la recarga entra en su propia columna', () => {
    const movs = [mov('2026-10-08', 'compra', CAJA36, 10, 1)]
    const fila = correr(movs, 1360)
    expect(fila.dias[3]!.entrada).toBe(360)
    expect(fila.entrado).toBe(360)
    expect(fila.apertura).toBe(1000)
  })

  it('la merma NO se cuenta como venta', () => {
    /*
     * En el cuaderno lo vendido se deducía restando el conteo de ayer menos el
     * de hoy, así que seis botellas rotas aparecían como seis vendidas y el
     * dinero nunca cuadraba. Aquí van en su columna.
     */
    const movs = [
      mov('2026-10-06', 'venta', BOTELLA, 40, -1),
      mov('2026-10-06', 'merma', BOTELLA, 6, -1),
    ]
    const martes = correr(movs, 954).dias[1]!
    expect(martes.unidades).toBe(40)
    expect(martes.ajuste).toBe(-6)
    expect(correr(movs, 954).vendido).toBe(40)
  })

  it('un conteo que encuentra de más deja el ajuste en positivo', () => {
    const movs = [mov('2026-10-07', 'ajuste', BOTELLA, 3, 1)]
    expect(correr(movs, 1003).dias[2]!.ajuste).toBe(3)
  })

  it('cada día cierra donde abre el siguiente', () => {
    // Si esta cadena se rompe, la tabla enseña números que no se pueden seguir
    // con el dedo y deja de servir para cuadrar contra el anaquel.
    const movs = [
      mov('2026-10-06', 'venta', BOTELLA, 40, -1),
      mov('2026-10-07', 'venta', CAJA36, 1, -1),
      mov('2026-10-08', 'compra', CAJA36, 10, 1),
      mov('2026-10-09', 'merma', BOTELLA, 6, -1),
    ]
    const fila = correr(movs, 1278)
    let anterior = fila.apertura
    for (const celda of fila.dias) {
      const movido = celda.entrada + celda.ajuste - celda.unidades - celda.bultos * 36
      expect(celda.cierre).toBe(anterior + movido)
      anterior = celda.cierre
    }
    expect(fila.cierre).toBe(1278)
  })

  it('los días que todavía no llegan van vacíos, no en cero', () => {
    // Un cero dice "no se vendió nada"; el jueves que todavía no ha pasado no
    // dice nada. Enseñarlos igual es lo que hace dudar de la tabla entera.
    const fila = correr([mov('2026-10-06', 'venta', BOTELLA, 40, -1)], 960, '2026-10-07')
    expect(fila.dias[1]!.futuro).toBe(false)
    expect(fila.dias[3]!.futuro).toBe(true)
    // Pero arrastran la existencia, como en el archivo
    expect(fila.dias[6]!.cierre).toBe(960)
  })
})

describe('lo que pasó fuera de la semana', () => {
  it('no se cuela en ella, pero sí corrige la apertura', () => {
    /*
     * Mirar la semana pasada un miércoles: lo vendido desde entonces no puede
     * aparecer en sus columnas, pero sí hay que descontarlo para saber con qué
     * cerró, porque el cálculo parte de la existencia de hoy.
     */
    const movs = [
      mov('2026-10-06', 'venta', BOTELLA, 40, -1),
      mov('2026-10-14', 'venta', BOTELLA, 100, -1),
    ]
    const fila = correr(movs, 860, '2026-10-14')
    expect(fila.apertura).toBe(1000)
    expect(fila.cierre).toBe(960)
    expect(fila.vendido).toBe(40)
  })

  it('lo anterior al lunes tampoco entra', () => {
    const movs = [
      mov('2026-10-01', 'venta', BOTELLA, 500, -1),
      mov('2026-10-06', 'venta', BOTELLA, 40, -1),
    ]
    const fila = correr(movs, 960)
    expect(fila.apertura).toBe(1000)
    expect(fila.vendido).toBe(40)
  })
})

describe('el total vendido de cada día', () => {
  it('cuenta las cajas en unidades, que es como se suman entre productos', () => {
    // La fila enseña "2 cj"; el pie tiene que decir 72, o sumar dos productos
    // con cajas distintas daría un número sin significado.
    const movs = [
      mov('2026-10-06', 'venta', BOTELLA, 40, -1),
      mov('2026-10-06', 'venta', CAJA36, 2, -1),
    ]
    const fila = correr(movs, 888)
    expect(fila.dias[1]!.vendido).toBe(112)
    expect(totalesPorDia([fila])[1]).toEqual({ dia: '2026-10-06', vendido: 112 })
  })
})
