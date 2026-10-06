import { DECIMALES_PRECIO, redondear } from './money'
import type { Precio, Presentacion, Producto, UUID } from './types'

/**
 * Cambiar el precio de varios productos a la vez.
 *
 * Tres cervezas al mismo precio son tres visitas al formulario, y cuando sube
 * el proveedor hay que repasar el catálogo entero. Esto se hace en una pantalla.
 *
 * ---------------------------------------------------------------------------
 * Dos formas, y hacen falta las dos
 * ---------------------------------------------------------------------------
 *
 * FIJAR es para igualar: "estas tres cervezas valen lo mismo". Se escribe el
 * precio y se reparte.
 *
 * PORCENTAJE es para la inflación: "sube todo un 10%". Fijar no sirve ahí,
 * porque cada producto parte de un precio distinto y habría que calcular
 * ochenta números a mano.
 */

export type CambioLote =
  | {
      tipo: 'fijar'
      /** El precio de UNA unidad, en moneda base */
      precioBase: number
      /**
       * Mueve también paquetes y cajas, conservando su descuento.
       *
       * Si la caja salía un 17% más barata que la unidad, sigue saliendo un 17%
       * más barata. Sin esto, igualar el precio de la unidad dejaría las cajas
       * con el precio viejo y el mayorista pagando lo de antes.
       */
      mantenerProporcion: boolean
    }
  | { tipo: 'porcentaje'; porcentaje: number }

export interface CambioPrecio {
  /** Id de la fila de precio que hay que reescribir */
  id: UUID
  productoId: UUID
  presentacionId: UUID
  anterior: number
  nuevo: number
}

export interface EntradaLote {
  productos: Producto[]
  presentacionesPorProducto: Map<UUID, Presentacion[]>
  precios: Precio[]
  listaDetal: UUID
  cambio: CambioLote
}

export function calcularCambios(e: EntradaLote): CambioPrecio[] {
  const salida: CambioPrecio[] = []

  for (const producto of e.productos) {
    const presentaciones = e.presentacionesPorProducto.get(producto.id) ?? []
    const base = presentaciones.find((p) => p.esBase)
    if (!base) continue

    const preciosDe = (presentacionId: UUID) =>
      e.precios.find((x) => x.presentacionId === presentacionId && x.listaId === e.listaDetal)

    const precioBase = preciosDe(base.id)
    if (!precioBase) continue

    if (e.cambio.tipo === 'porcentaje') {
      const factor = 1 + e.cambio.porcentaje / 100
      for (const pres of presentaciones) {
        const fila = preciosDe(pres.id)
        if (!fila || fila.precio <= 0) continue
        empujar(salida, fila, producto.id, pres.id, redondear(fila.precio * factor, DECIMALES_PRECIO))
      }
      continue
    }

    // --- fijar ---
    const nuevoUnitario = redondear(e.cambio.precioBase, DECIMALES_PRECIO)
    empujar(salida, precioBase, producto.id, base.id, nuevoUnitario)

    if (!e.cambio.mantenerProporcion || precioBase.precio <= 0) continue

    // La proporción se calcula contra el precio VIEJO de la unidad, no contra
    // el nuevo: es la relación que tenía el bulto con el detal.
    const factor = nuevoUnitario / precioBase.precio
    for (const pres of presentaciones) {
      if (pres.esBase) continue
      const fila = preciosDe(pres.id)
      if (!fila || fila.precio <= 0) continue
      empujar(salida, fila, producto.id, pres.id, redondear(fila.precio * factor, DECIMALES_PRECIO))
    }
  }

  return salida
}

function empujar(
  salida: CambioPrecio[],
  fila: Precio,
  productoId: UUID,
  presentacionId: UUID,
  nuevo: number,
) {
  // Lo que no cambia no se escribe: evita subir al servidor ochenta filas
  // idénticas y deja el resumen diciendo solo lo que de verdad se movió.
  if (nuevo === fila.precio || nuevo <= 0) return
  salida.push({ id: fila.id, productoId, presentacionId, anterior: fila.precio, nuevo })
}
