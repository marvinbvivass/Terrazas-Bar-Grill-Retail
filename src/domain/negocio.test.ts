import { describe, expect, it } from 'vitest'
import {
  agregar,
  carritoVacio,
  construirPagosDelCierre,
  construirVentaCreditoSinLineas,
  construirVentaDelDia,
  recalcular,
  totales,
} from './cart'
import { calcularCierre } from './cierre'
import { construirCierreDia } from './cierreDia'
import {
  construirAbono,
  planificarAbono,
  planificarAbonoDirigido,
  saldoDeCliente,
  ventasAbiertas,
} from './credito'
import {
  BOTELLA,
  CAJA36,
  CATALOGO,
  EFECTIVO_BS,
  EFECTIVO_USD,
  POLAR,
  PRESENTACIONES_MAPA,
  SALA,
  SIXPACK,
  TASA_VES,
} from './fixtures'
import type { Venta } from './types'

/**
 * El día a día del negocio, simulado de punta a punta.
 *
 * Estas pruebas no comprueban una función suelta: recorren las situaciones que
 * de verdad ocurren en el mostrador —el que se lleva una caja, el que queda
 * debiendo, el que abona a medias, el día que no cuadra— y verifican que las
 * dos cuentas que le importan al dueño siguen bien:
 *
 *   LO QUE HAY EN LA GAVETA   y   LO QUE HAY EN EL ANAQUEL
 *
 * Si alguna de estas falla, el negocio está perdiendo plata o inventario sin
 * que nadie se entere. Por eso están escritas con el vocabulario del local y
 * no con el del código.
 */

const TASAS = { VES: TASA_VES, COP: 4100 }
const DIA = '2026-09-28'
const AYER = '2026-09-27'
const METODOS = [EFECTIVO_USD, EFECTIVO_BS]

function datos(dia = DIA) {
  return {
    dia,
    fecha: Date.parse(`${dia}T12:00:00Z`),
    usuarioId: 'u-encargado',
    folioProvisional: `F-${dia}`,
    tasas: TASAS,
    creadaOffline: false,
  }
}

/** Arma el carrito del día: cuántas botellas salieron */
function vender(cantidad: number, presentacion = BOTELLA) {
  let c = carritoVacio()
  if (cantidad > 0) {
    c = agregar(c, { producto: POLAR, presentacion, ubicacionId: SALA.id, cantidad })
  }
  // Escalones apagados: esto simula la pantalla de cierre, que es donde el
  // encargado carga el día. Para el precio de mostrador está `vialMostrador`.
  return recalcular(c, PRESENTACIONES_MAPA, CATALOGO, Date.parse(`${DIA}T12:00:00Z`), {
    escalonesPorCantidad: false,
  })
}

/** Una compra de un cliente en el mostrador: aquí los escalones SÍ aplican */
function mostrador(cantidad: number, presentacion = BOTELLA, ubicacionId = SALA.id) {
  const c = agregar(carritoVacio(), { producto: POLAR, presentacion, ubicacionId, cantidad })
  return recalcular(c, PRESENTACIONES_MAPA, CATALOGO, Date.parse(`${DIA}T12:00:00Z`))
}

describe('el precio que se cobra', () => {
  it('al que se lleva una caja entera se le hace el precio de mayor solo', () => {
    // La lista de mayor arranca en 36 unidades.
    expect(mostrador(24).lineas[0]?.precioUnitario).toBe(1.0)
    // Nadie tuvo que acordarse de aplicar el descuento.
    expect(mostrador(36).lineas[0]?.precioUnitario).toBe(0.8)
  })

  it('EN EL CIERRE los escalones no se aplican, y esto evita regalar un 20%', () => {
    // El carrito del cierre es el día entero. Si en la jornada salieron 200
    // botellas de una en una, NO es una venta al por mayor: son doscientas
    // ventas al detal. Con los escalones activos el sistema las cobraría todas
    // a 0,80 y el negocio declararía un 20% menos de lo que vendió.
    const delDia = recalcular(
      agregar(carritoVacio(), {
        producto: POLAR,
        presentacion: BOTELLA,
        ubicacionId: SALA.id,
        cantidad: 200,
      }),
      PRESENTACIONES_MAPA,
      CATALOGO,
      Date.parse(`${DIA}T12:00:00Z`),
      { escalonesPorCantidad: false },
    )
    expect(delDia.lineas[0]?.precioUnitario).toBe(1.0)
    expect(totales(delDia).total).toBe(200)
  })

  it('el six-pack y la caja tienen su propio precio, no el de la botella por seis', () => {
    const six = mostrador(1, SIXPACK)
    const caja = mostrador(1, CAJA36)
    expect(six.lineas[0]?.precioUnitario).toBe(5.7)
    expect(six.lineas[0]?.cantidadBase).toBe(6)
    expect(caja.lineas[0]?.precioUnitario).toBe(30)
    expect(caja.lineas[0]?.cantidadBase).toBe(36)
  })

  it('una caja no es otro artículo: son 36 botellas saliendo del mismo montón', () => {
    const caja = mostrador(1, CAJA36)
    const sueltas = mostrador(36)
    expect(caja.lineas[0]?.cantidadBase).toBe(sueltas.lineas[0]?.cantidadBase)
  })
})

describe('un día normal, todo de contado', () => {
  it('cuadra cuando lo contado en la gaveta es lo que se vendió', () => {
    const carrito = vender(45) // 45 botellas a 1,00
    const t = totales(carrito)
    expect(t.total).toBe(45)

    // El encargado cuenta: 20 $ y el resto en bolívares
    const recibido = { USD: 20, VES: 25 * TASA_VES }
    const acta = construirCierreDia({
      dia: DIA,
      usuarioId: 'u-encargado',
      totalVendido: t.total,
      unidades: t.unidades,
      costo: t.costoTotal,
      recibido,
      creditos: [],
      tasas: TASAS,
    })

    expect(acta.esperado).toBe(45)
    expect(acta.totalRecibido).toBe(45)
    expect(acta.cuadra).toBe(true)
  })

  it('el margen del día sale de lo vendido menos lo que costó', () => {
    const carrito = vender(100)
    const t = totales(carrito)
    // 100 botellas a 1,00 con costo 0,60
    expect(t.total).toBe(100)
    expect(t.costoTotal).toBe(60)

    const acta = construirCierreDia({
      dia: DIA,
      usuarioId: 'u',
      totalVendido: t.total,
      unidades: t.unidades,
      costo: t.costoTotal,
      recibido: { USD: 100 },
      creditos: [],
      tasas: TASAS,
    })
    expect(acta.margen).toBe(40)
  })

  it('el inventario baja exactamente lo que salió, ni una botella más', () => {
    const carrito = vender(42)
    const venta = construirVentaDelDia(
      { ...carrito, pagos: construirPagosDelCierre({ USD: 42 }, TASAS, METODOS) },
      datos(),
      0,
    )
    const salida = venta.lineas.reduce((s, l) => s + l.cantidadBase, 0)
    expect(salida).toBe(42)
  })
})

describe('el que queda debiendo', () => {
  it('lo fiado no se le pide a la gaveta', () => {
    const carrito = vender(50) // 50 dólares
    const t = totales(carrito)

    const acta = construirCierreDia({
      dia: DIA,
      usuarioId: 'u',
      totalVendido: t.total,
      unidades: t.unidades,
      costo: t.costoTotal,
      recibido: { USD: 35 },
      creditos: [{ clienteId: 'c-juan', clienteNombre: 'Juan', monto: 15, ventaId: 'v-juan' }],
      tasas: TASAS,
    })

    expect(acta.totalVendido).toBe(50)
    expect(acta.totalCredito).toBe(15)
    expect(acta.esperado).toBe(35)
    expect(acta.cuadra).toBe(true)
  })

  it('la mercancía fiada salió del anaquel igual, y deja su margen', () => {
    const carrito = vender(50)
    const t = totales(carrito)
    const acta = construirCierreDia({
      dia: DIA,
      usuarioId: 'u',
      totalVendido: t.total,
      unidades: t.unidades,
      costo: t.costoTotal,
      recibido: { USD: 35 },
      creditos: [{ clienteId: 'c-juan', clienteNombre: 'Juan', monto: 15, ventaId: 'v-juan' }],
      tasas: TASAS,
    })
    // 50 vendidos − 30 de costo, aunque 15 todavía no se hayan cobrado.
    expect(acta.margen).toBe(20)
    expect(acta.unidades).toBe(50)
  })

  it('la deuda no descuenta el stock por segunda vez', () => {
    const credito = construirVentaCreditoSinLineas(datos(), 'c-juan', 15)
    // Sin líneas no hay movimiento de inventario que aplicar.
    expect(credito.lineas).toHaveLength(0)
    expect(credito.total).toBe(15)
    expect(credito.costoTotal).toBe(0)
  })

  it('el cierre no cuenta dos veces lo fiado', () => {
    const carrito = vender(50)
    const creditoJuan = construirVentaCreditoSinLineas(datos(), 'c-juan', 15)
    const ventaDia = construirVentaDelDia(
      { ...carrito, pagos: construirPagosDelCierre({ USD: 35 }, TASAS, METODOS) },
      datos(),
      15,
    )

    const c = calcularCierre({
      dia: DIA,
      ventas: [ventaDia, creditoJuan],
      abonos: [],
      metodosPago: METODOS,
    })

    expect(c.contado).toBe(35) // lo que hay que contar en la gaveta
    expect(c.creditoHoy).toBe(15)
    expect(c.vendidoHoy).toBe(50) // lo que salió del anaquel
    expect(c.entroEnCaja).toBe(35)
    expect(c.unidades).toBe(50) // no 100
  })
})

describe('cobrar lo que deben', () => {
  const juan = () => construirVentaCreditoSinLineas(datos(AYER), 'c-juan', 20)

  it('un abono a medias deja la deuda al día siguiente', () => {
    const venta = juan()
    const abiertas = ventasAbiertas('c-juan', [venta], [])
    const plan = planificarAbono(abiertas, 5)
    const abono = construirAbono(
      {
        dia: DIA,
        fecha: Date.now(),
        clienteId: 'c-juan',
        usuarioId: 'u',
        monto: 5,
        pagos: construirPagosDelCierre({ USD: 5 }, TASAS, METODOS),
      },
      plan,
    )

    expect(plan.aplicado).toBe(5)
    expect(saldoDeCliente('c-juan', [venta], [abono])).toBe(15)
  })

  it('el abono empieza por la deuda más vieja', () => {
    const vieja = construirVentaCreditoSinLineas(datos(AYER), 'c-juan', 12)
    const nueva = construirVentaCreditoSinLineas(datos(DIA), 'c-juan', 8)
    const plan = planificarAbono(ventasAbiertas('c-juan', [vieja, nueva], []), 15)

    expect(plan.saldadas).toContain(vieja.id)
    expect(plan.parcial?.ventaId).toBe(nueva.id)
    expect(plan.parcial?.saldoRestante).toBe(5)
  })

  it('si paga de más, el vuelto se ve en vez de tragárselo', () => {
    const venta = juan()
    const plan = planificarAbono(ventasAbiertas('c-juan', [venta], []), 25)
    expect(plan.aplicado).toBe(20)
    expect(plan.sobrante).toBe(5)
  })

  it('"págame la del martes y déjame la del jueves" también se puede', () => {
    const martes = construirVentaCreditoSinLineas(datos(AYER), 'c-juan', 12)
    const jueves = construirVentaCreditoSinLineas(datos(DIA), 'c-juan', 8)
    const plan = planificarAbonoDirigido(
      ventasAbiertas('c-juan', [martes, jueves], []),
      [jueves.id],
      8,
    )
    expect(plan.saldadas).toEqual([jueves.id])
  })

  it('cobrar un fiado viejo entra en la caja de hoy pero no es venta de hoy', () => {
    const deudaDeAyer = juan()
    const abiertas = ventasAbiertas('c-juan', [deudaDeAyer], [])
    const abono = construirAbono(
      {
        dia: DIA,
        fecha: Date.now(),
        clienteId: 'c-juan',
        usuarioId: 'u',
        monto: 20,
        pagos: construirPagosDelCierre({ USD: 20 }, TASAS, METODOS),
      },
      planificarAbono(abiertas, 20),
    )

    const c = calcularCierre({
      dia: DIA,
      ventas: [deudaDeAyer],
      abonos: [abono],
      metodosPago: METODOS,
    })

    expect(c.cobrosCredito).toBe(20)
    expect(c.entroEnCaja).toBe(20)
    // Lo importante: NO infla las ventas del día. La mercancía salió ayer.
    expect(c.vendidoHoy).toBe(0)
    expect(c.margen).toBe(0)
  })
})

describe('cuando el día no cuadra', () => {
  it('avisa del faltante en vez de dejarlo pasar', () => {
    const acta = cerrar({ vendido: 100, recibido: { USD: 97 } })
    expect(acta.cuadra).toBe(false)
    expect(acta.diferencia).toBe(-3)
  })

  it('avisa también del sobrante, que suele ser un cobro mal anotado', () => {
    const acta = cerrar({ vendido: 100, recibido: { USD: 104 } })
    expect(acta.cuadra).toBe(false)
    expect(acta.diferencia).toBe(4)
  })

  it('no se declara cuadrado si falta la tasa: ese número no significa nada', () => {
    const acta = construirCierreDia({
      dia: DIA,
      usuarioId: 'u',
      totalVendido: 100,
      unidades: 0,
      costo: 0,
      recibido: { VES: 3650 },
      creditos: [],
      tasas: {},
    })
    expect(acta.cuadra).toBe(false)
  })

  it('el céntimo que no existe en pesos no bloquea el cierre', () => {
    const acta = cerrar({ vendido: 10, recibido: { COP: 40999 } })
    expect(acta.cuadra).toBe(true)
  })
})

describe('mezcla de monedas en la misma gaveta', () => {
  it('suma dólares, bolívares y pesos con la tasa de ese día', () => {
    const acta = cerrar({
      vendido: 100,
      recibido: { USD: 40, VES: 30 * TASA_VES, COP: 30 * 4100 },
    })
    expect(acta.totalRecibido).toBe(100)
    expect(acta.cuadra).toBe(true)
  })

  it('el acta guarda la tasa usada, para que el cierre no cambie meses después', () => {
    const acta = cerrar({ vendido: 36.5, recibido: { VES: 36.5 * TASA_VES } })
    const ves = acta.recibido.find((r) => r.moneda === 'VES')
    expect(ves?.tasa).toBe(TASA_VES)
    expect(ves?.enBase).toBe(36.5)
  })

  it('el desglose dice cuánto contar de cada cosa en la gaveta', () => {
    const carrito = vender(45)
    const venta = construirVentaDelDia(
      {
        ...carrito,
        pagos: construirPagosDelCierre({ USD: 20, VES: 25 * TASA_VES }, TASAS, METODOS),
      },
      datos(),
      0,
    )
    const c = calcularCierre({ dia: DIA, ventas: [venta], abonos: [], metodosPago: METODOS })

    const usd = c.porMoneda.find((m) => m.moneda === 'USD')
    const ves = c.porMoneda.find((m) => m.moneda === 'VES')
    expect(usd?.monto).toBe(20)
    expect(ves?.monto).toBe(25 * TASA_VES)
  })
})

describe('corregir lo que se hizo mal', () => {
  it('anular una venta la deja marcada, no la borra', () => {
    const carrito = vender(10)
    const venta: Venta = construirVentaDelDia(
      { ...carrito, pagos: construirPagosDelCierre({ USD: 10 }, TASAS, METODOS) },
      datos(),
      0,
    )
    const anulada: Venta = { ...venta, estado: 'anulada' }

    const c = calcularCierre({ dia: DIA, ventas: [anulada], abonos: [], metodosPago: METODOS })
    // Deja de contar para el día…
    expect(c.vendidoHoy).toBe(0)
    // …pero el documento sigue existiendo para poder auditarlo.
    expect(anulada.id).toBe(venta.id)
  })
})

function cerrar(x: { vendido: number; recibido: Record<string, number>; credito?: number }) {
  return construirCierreDia({
    dia: DIA,
    usuarioId: 'u',
    totalVendido: x.vendido,
    unidades: 0,
    costo: 0,
    recibido: x.recibido,
    creditos: [],
    tasas: TASAS,
  })
}
