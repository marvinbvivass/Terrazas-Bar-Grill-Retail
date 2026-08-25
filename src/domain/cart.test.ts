import { describe, expect, it } from 'vitest'
import {
  agregar,
  agregarPago,
  cambiarCantidad,
  cambiarUbicacion,
  carritoVacio,
  cobradoPorMoneda,
  construirVenta,
  crearPago,
  estaPagado,
  movimientosDeVenta,
  quitar,
  recalcular,
  totales,
} from './cart'
import {
  BOTELLA,
  CAJA36,
  CATALOGO,
  EFECTIVO_BS,
  EFECTIVO_USD,
  NEVERA,
  PAGO_MOVIL,
  POLAR,
  PRESENTACIONES_MAPA,
  SALA,
  SIXPACK,
  TASA_VES,
} from './fixtures'
import { redondear } from './money'

const MOMENTO = 1_700_000_000_000

function carritoCon(entradas: Array<{ presentacion: typeof BOTELLA; ubicacionId: string; cantidad: number }>) {
  let c = carritoVacio()
  for (const e of entradas) {
    c = agregar(c, { producto: POLAR, presentacion: e.presentacion, ubicacionId: e.ubicacionId, cantidad: e.cantidad })
  }
  return recalcular(c, PRESENTACIONES_MAPA, CATALOGO, MOMENTO)
}

describe('carrito', () => {
  it('agrega una línea con su precio resuelto', () => {
    const c = carritoCon([{ presentacion: BOTELLA, ubicacionId: SALA.id, cantidad: 2 }])
    expect(c.lineas).toHaveLength(1)
    expect(c.lineas[0]!.precioUnitario).toBe(1.0)
    expect(c.lineas[0]!.importe).toBe(2.0)
    expect(c.lineas[0]!.listaPrecioNombre).toBe('Detal')
  })

  it('escanear el mismo producto cinco veces da una línea de cinco, no cinco líneas', () => {
    let c = carritoVacio()
    for (let i = 0; i < 5; i++) {
      c = agregar(c, { producto: POLAR, presentacion: BOTELLA, ubicacionId: SALA.id, cantidad: 1 })
    }
    c = recalcular(c, PRESENTACIONES_MAPA, CATALOGO, MOMENTO)
    expect(c.lineas).toHaveLength(1)
    expect(c.lineas[0]!.cantidad).toBe(5)
  })

  it('la misma cerveza fría y al tiempo son dos líneas con precios distintos', () => {
    const c = carritoCon([
      { presentacion: BOTELLA, ubicacionId: SALA.id, cantidad: 1 },
      { presentacion: BOTELLA, ubicacionId: NEVERA.id, cantidad: 1 },
    ])
    expect(c.lineas).toHaveLength(2)
    expect(c.lineas[0]!.precioUnitario).toBe(1.0)
    expect(c.lineas[1]!.precioUnitario).toBe(1.25)
    expect(totales(c).total).toBe(2.25)
  })

  it('cambiar la ubicación de una línea recalcula su precio', () => {
    let c = carritoCon([{ presentacion: BOTELLA, ubicacionId: SALA.id, cantidad: 1 }])
    expect(c.lineas[0]!.precioUnitario).toBe(1.0)
    c = recalcular(cambiarUbicacion(c, c.lineas[0]!.id, NEVERA.id), PRESENTACIONES_MAPA, CATALOGO, MOMENTO)
    expect(c.lineas[0]!.precioUnitario).toBe(1.25)
    expect(c.lineas[0]!.listaPrecioNombre).toBe('Frío')
  })

  it('quitar una línea la saca del total', () => {
    let c = carritoCon([
      { presentacion: BOTELLA, ubicacionId: SALA.id, cantidad: 2 },
      { presentacion: SIXPACK, ubicacionId: SALA.id, cantidad: 1 },
    ])
    expect(totales(c).total).toBe(7.7)
    c = recalcular(quitar(c, c.lineas[1]!.id), PRESENTACIONES_MAPA, CATALOGO, MOMENTO)
    expect(totales(c).total).toBe(2.0)
  })

  it('poner la cantidad en cero equivale a quitar la línea', () => {
    let c = carritoCon([{ presentacion: BOTELLA, ubicacionId: SALA.id, cantidad: 3 }])
    c = cambiarCantidad(c, c.lineas[0]!.id, 0)
    expect(c.lineas).toHaveLength(0)
  })
})

describe('el precio de mayor se activa solo a mitad de la venta', () => {
  it('al pasar de 30 a 36 botellas se recalculan las 36, no solo las 6 nuevas', () => {
    let c = carritoCon([{ presentacion: BOTELLA, ubicacionId: SALA.id, cantidad: 30 }])
    expect(c.lineas[0]!.precioUnitario).toBe(1.0)
    expect(totales(c).total).toBe(30.0)

    c = recalcular(cambiarCantidad(c, c.lineas[0]!.id, 36), PRESENTACIONES_MAPA, CATALOGO, MOMENTO)
    expect(c.lineas[0]!.precioUnitario).toBe(0.8)
    expect(totales(c).total).toBe(28.8) // 36 × 0,80, no 30 × 1 + 6 × 0,80
  })

  it('la cantidad que decide el precio es la acumulada del producto, sumando líneas', () => {
    // 20 en sala + 16 en nevera = 36 unidades base del mismo producto
    const c = carritoCon([
      { presentacion: BOTELLA, ubicacionId: SALA.id, cantidad: 20 },
      { presentacion: BOTELLA, ubicacionId: NEVERA.id, cantidad: 16 },
    ])
    // Mayor (prioridad 20) gana en ambas líneas, incluso en la de la nevera
    expect(c.lineas[0]!.precioUnitario).toBe(0.8)
    expect(c.lineas[1]!.precioUnitario).toBe(0.8)
  })

  it('una caja de 36 activa el mayoreo por sí sola en las botellas sueltas', () => {
    const c = carritoCon([
      { presentacion: CAJA36, ubicacionId: SALA.id, cantidad: 1 },
      { presentacion: BOTELLA, ubicacionId: SALA.id, cantidad: 2 },
    ])
    expect(c.lineas[0]!.cantidadBase).toBe(36)
    expect(c.lineas[1]!.precioUnitario).toBe(0.8)
  })
})

describe('IVA incluido en el precio', () => {
  it('desglosa el IVA hacia atrás, no lo suma por encima', () => {
    const c = carritoCon([{ presentacion: BOTELLA, ubicacionId: SALA.id, cantidad: 10 }])
    const t = totales(c)
    expect(t.total).toBe(10.0)
    expect(t.iva).toBe(redondear(10 - 10 / 1.16, 2)) // 1,38
    expect(t.subtotal).toBe(redondear(10 - t.iva, 2)) // 8,62
    expect(redondear(t.subtotal + t.iva, 2)).toBe(t.total)
  })

  it('un producto exento no genera IVA', () => {
    let c = carritoVacio()
    c = agregar(c, {
      producto: { ...POLAR, id: 'prod-exento', iva: 0 },
      presentacion: { ...BOTELLA, productoId: 'prod-exento' },
      ubicacionId: SALA.id,
      cantidad: 1,
    })
    c = recalcular(c, PRESENTACIONES_MAPA, CATALOGO, MOMENTO)
    expect(totales(c).iva).toBe(0)
  })
})

describe('pago mixto multimoneda e IGTF', () => {
  it('el IGTF se calcula sobre lo abonado en divisa, no sobre el total', () => {
    const c = carritoCon([{ presentacion: BOTELLA, ubicacionId: SALA.id, cantidad: 10 }])
    expect(totales(c).total).toBe(10)

    // de esos $10 se abonan solo 6 en efectivo dólar
    const pago = crearPago({ metodo: EFECTIVO_USD, montoAplicado: 6, tasa: 1 })
    expect(pago.igtf).toBe(0.18) // 3% de 6, no de 10
    expect(pago.montoEnMoneda).toBe(6.18)
  })

  it('el pago móvil en bolívares no genera IGTF', () => {
    const pago = crearPago({ metodo: PAGO_MOVIL, montoAplicado: 4, tasa: TASA_VES, referencia: '1234' })
    expect(pago.igtf).toBe(0)
    expect(pago.montoEnMoneda).toBe(146.0) // 4 × 36,50
  })

  it('mitad en efectivo dólar y mitad en pago móvil cubre la factura', () => {
    let c = carritoCon([{ presentacion: BOTELLA, ubicacionId: SALA.id, cantidad: 10 }])
    expect(totales(c).pendiente).toBe(10)

    c = agregarPago(c, crearPago({ metodo: EFECTIVO_USD, montoAplicado: 6, tasa: 1 }))
    expect(totales(c).pendiente).toBe(4)
    expect(estaPagado(c)).toBe(false)

    c = agregarPago(c, crearPago({ metodo: PAGO_MOVIL, montoAplicado: 4, tasa: TASA_VES, referencia: '9876' }))
    const t = totales(c)
    expect(t.pendiente).toBe(0)
    expect(t.igtf).toBe(0.18)
    expect(t.aCobrar).toBe(10.18)
    expect(estaPagado(c)).toBe(true)
  })

  it('calcula el vuelto en la moneda del método de pago', () => {
    // factura de $10 pagada con un billete de $20
    const pago = crearPago({ metodo: EFECTIVO_USD, montoAplicado: 10, tasa: 1, entregado: 20 })
    expect(pago.igtf).toBe(0.3)
    expect(pago.montoEnMoneda).toBe(10.3)
    expect(pago.vuelto).toBe(9.7)
  })

  it('calcula el vuelto en bolívares cuando se paga en bolívares', () => {
    // $4 al cambio son Bs 146; el cliente da Bs 200
    const pago = crearPago({ metodo: EFECTIVO_BS, montoAplicado: 4, tasa: TASA_VES, entregado: 200 })
    expect(pago.montoEnMoneda).toBe(146)
    expect(pago.vuelto).toBe(54)
  })

  it('el arqueo cuenta lo que QUEDA en la gaveta, no lo que el cliente entregó', () => {
    let c = carritoCon([{ presentacion: BOTELLA, ubicacionId: SALA.id, cantidad: 10 }])
    const usd = crearPago({ metodo: EFECTIVO_USD, montoAplicado: 6, tasa: 1, entregado: 10 })
    const bs = crearPago({ metodo: EFECTIVO_BS, montoAplicado: 4, tasa: TASA_VES, entregado: 200 })
    c = agregarPago(agregarPago(c, usd), bs)

    // entran 10 y salen 3,82 de vuelto → quedan 6,18
    expect(usd.vuelto).toBe(3.82)
    expect(bs.vuelto).toBe(54)

    const caja = cobradoPorMoneda(c)
    expect(caja.get('USD')).toBe(6.18)
    expect(caja.get('VES')).toBe(146) // 200 entregados − 54 de vuelto

    // el arqueo tiene que cuadrar contra lo que dice el documento
    const t = totales(c)
    const enDolares = caja.get('USD')! + caja.get('VES')! / TASA_VES
    expect(redondear(enDolares, 2)).toBe(t.aCobrar)
  })

  it('un pago de más deja el pendiente en negativo y la venta cubierta', () => {
    let c = carritoCon([{ presentacion: BOTELLA, ubicacionId: SALA.id, cantidad: 5 }])
    c = agregarPago(c, crearPago({ metodo: PAGO_MOVIL, montoAplicado: 6, tasa: TASA_VES }))
    expect(totales(c).pendiente).toBe(-1)
    expect(estaPagado(c)).toBe(true)
  })
})

describe('cierre de la venta', () => {
  it('congela tasas, costo y totales en el documento', () => {
    let c = carritoCon([{ presentacion: BOTELLA, ubicacionId: NEVERA.id, cantidad: 6 }])
    c = agregarPago(c, crearPago({ metodo: EFECTIVO_USD, montoAplicado: 7.5, tasa: 1 }))

    const venta = construirVenta(c, {
      turnoId: 'turno-1',
      usuarioId: 'user-1',
      folioProvisional: 'P-014',
      tasas: { VES: TASA_VES },
      creadaOffline: true,
      fecha: MOMENTO,
    })

    expect(venta.total).toBe(7.5)
    expect(venta.numero).toBeNull() // el correlativo lo pone el servidor
    expect(venta.folioProvisional).toBe('P-014')
    expect(venta.creadaOffline).toBe(true)
    expect(venta.tasas.VES).toBe(TASA_VES)
    expect(venta.costoTotal).toBe(3.6) // 6 × 0,60, congelado
    expect(venta.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('genera un movimiento de kardex por línea, con signo negativo y en unidades base', () => {
    const c = carritoCon([
      { presentacion: CAJA36, ubicacionId: SALA.id, cantidad: 1 },
      { presentacion: BOTELLA, ubicacionId: NEVERA.id, cantidad: 2 },
    ])
    const venta = construirVenta(c, {
      turnoId: 'turno-1',
      usuarioId: 'user-1',
      folioProvisional: 'P-015',
      tasas: {},
      creadaOffline: false,
    })
    const movs = movimientosDeVenta(venta)

    expect(movs).toHaveLength(2)
    expect(movs[0]!.cantidadBase).toBe(-36)
    expect(movs[0]!.cantidadPresentacion).toBe(1)
    expect(movs[1]!.cantidadBase).toBe(-2)
    expect(movs[1]!.ubicacionId).toBe(NEVERA.id)
    expect(movs.every((m) => m.documentoId === venta.id)).toBe(true)
  })

  it('cada venta lleva un UUID distinto: es lo que la hace idempotente al sincronizar', () => {
    const c = carritoCon([{ presentacion: BOTELLA, ubicacionId: SALA.id, cantidad: 1 }])
    const datos = {
      turnoId: 't',
      usuarioId: 'u',
      folioProvisional: 'P-1',
      tasas: {},
      creadaOffline: true,
    }
    expect(construirVenta(c, datos).id).not.toBe(construirVenta(c, datos).id)
  })
})
