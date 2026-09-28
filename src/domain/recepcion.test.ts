import { describe, expect, it } from 'vitest'
import {
  construirRecepcion,
  costoPromedioTrasEntrada,
  entradaPorProducto,
  lineaDeRecepcion,
  movimientosDeRecepcion,
} from './recepcion'
import { BOTELLA, CAJA36, NEVERA, POLAR, SALA, SIXPACK } from './fixtures'

const DATOS = {
  dia: '2026-09-28',
  fecha: Date.parse('2026-09-28T12:00:00Z'),
  usuarioId: 'u-encargado',
  creadaOffline: false,
}

function linea(presentacion = CAJA36, cantidad = 10, costo = 21.6, ubicacionId = SALA.id) {
  return lineaDeRecepcion({
    producto: POLAR,
    presentacion,
    cantidad,
    costoPorPresentacion: costo,
    ubicacionId,
  })
}

describe('recibir mercancía', () => {
  it('diez cajas son 360 botellas entrando al anaquel', () => {
    const l = linea()
    expect(l.cantidad).toBe(10)
    expect(l.cantidadBase).toBe(360)
  })

  it('el costo se guarda por unidad, no por caja', () => {
    // Una caja de 36 a 21,60 sale a 0,60 la botella.
    expect(linea(CAJA36, 10, 21.6).costoUnitarioBase).toBe(0.6)
    expect(linea(SIXPACK, 5, 3.9).costoUnitarioBase).toBe(0.65)
    expect(linea(BOTELLA, 24, 0.7).costoUnitarioBase).toBe(0.7)
  })

  it('el total es lo que se le paga al proveedor', () => {
    const r = construirRecepcion([linea(CAJA36, 10, 21.6)], DATOS)
    expect(r.total).toBe(216)
    expect(r.unidades).toBe(360)
  })

  it('genera un asiento de kardex POSITIVO por renglón', () => {
    const r = construirRecepcion([linea(CAJA36, 2, 21.6), linea(SIXPACK, 3, 3.9, NEVERA.id)], DATOS)
    const movs = movimientosDeRecepcion(r)

    expect(movs).toHaveLength(2)
    expect(movs.every((m) => m.tipo === 'compra')).toBe(true)
    // Positivo: entra. La venta usa el mismo campo en negativo.
    expect(movs[0]?.cantidadBase).toBe(72)
    expect(movs[1]?.cantidadBase).toBe(18)
    expect(movs[1]?.ubicacionId).toBe(NEVERA.id)
    expect(movs.every((m) => m.documentoId === r.id)).toBe(true)
  })

  it('deja constancia de quién, cuándo y de qué proveedor', () => {
    const r = construirRecepcion([linea()], {
      ...DATOS,
      proveedor: '  Distribuidora Polar  ',
      documento: 'FAC-00123',
    })
    expect(r.proveedor).toBe('Distribuidora Polar')
    expect(r.documento).toBe('FAC-00123')
    expect(r.usuarioId).toBe('u-encargado')
    expect(r.fecha).toBe(DATOS.fecha)
  })

  it('un proveedor en blanco se guarda como nulo, no como cadena vacía', () => {
    const r = construirRecepcion([linea()], { ...DATOS, proveedor: '   ' })
    expect(r.proveedor).toBeNull()
  })
})

describe('el costo promedio', () => {
  it('pondera por cantidad, no hace la media simple', () => {
    // 10 botellas a 0,60 y entran 100 a 0,80.
    const costo = costoPromedioTrasEntrada(10, 0.6, 100, 0.8)
    // La media simple daría 0,70 e inflaría el margen justo cuando más
    // mercancía hay en el anaquel.
    expect(costo).not.toBe(0.7)
    expect(costo).toBeCloseTo(0.7818, 4)
  })

  it('si no había nada, el costo pasa a ser el de la entrada', () => {
    expect(costoPromedioTrasEntrada(0, 0.6, 100, 0.8)).toBe(0.8)
  })

  it('con stock negativo por un descuadre no inventa un costo absurdo', () => {
    // Promediar contra una cantidad negativa puede dar hasta un costo negativo.
    expect(costoPromedioTrasEntrada(-20, 0.6, 100, 0.8)).toBe(0.8)
  })

  it('una entrada de cero no toca el costo', () => {
    expect(costoPromedioTrasEntrada(50, 0.6, 0, 99)).toBe(0.6)
  })

  it('entrar la misma mercancía al mismo precio no mueve el costo', () => {
    expect(costoPromedioTrasEntrada(100, 0.75, 100, 0.75)).toBe(0.75)
  })
})

describe('cuando un producto llega en varios renglones', () => {
  it('se suma todo lo que entró de ese producto', () => {
    const r = construirRecepcion(
      [linea(CAJA36, 2, 21.6), linea(SIXPACK, 4, 3.6, NEVERA.id)],
      DATOS,
    )
    const entrada = entradaPorProducto(r).get(POLAR.id)
    // 72 del anaquel + 24 de la nevera
    expect(entrada?.cantidadBase).toBe(96)
  })

  it('el costo de la entrada es uno solo, no depende del orden en que se teclee', () => {
    const a = construirRecepcion([linea(CAJA36, 2, 21.6), linea(BOTELLA, 72, 0.8)], DATOS)
    const b = construirRecepcion([linea(BOTELLA, 72, 0.8), linea(CAJA36, 2, 21.6)], DATOS)

    const costoA = entradaPorProducto(a).get(POLAR.id)?.costoPromedioEntrada
    const costoB = entradaPorProducto(b).get(POLAR.id)?.costoPromedioEntrada

    expect(costoA).toBe(costoB)
    // 72 a 0,60 y 72 a 0,80 → 0,70
    expect(costoA).toBe(0.7)
  })
})
