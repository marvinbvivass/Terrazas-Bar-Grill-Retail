import { DECIMALES_PRECIO, redondear } from './money'
import type { ProductoForm } from './catalogo'
import type { ProductoSemilla } from '../data/catalogoTerrazas'

/**
 * Convertir el catálogo del Excel en productos de la aplicación.
 *
 * Dos traducciones y ninguna más, porque todo lo demás ya lo hace
 * `armarProducto`: esto solo decide los precios y la forma de la caja, y deja
 * que el catálogo arme la ficha como la armaría si se tecleara a mano. Si esta
 * carga construyera los productos por su cuenta, el día que cambie algo del
 * catálogo habría dos sitios que arreglar y uno se quedaría atrás.
 */

/**
 * Lo que se le pone a un producto que el Excel no tenía tarifado.
 *
 * Un peso. Un producto sin precio no se puede vender, y entrar con un precio
 * evidentemente falso es mejor que entrar con uno creíble pero inventado: a un
 * peso salta a la vista la primera vez que alguien lo mire, mientras que un
 * 3.000 puesto a ojo se queda ahí para siempre.
 */
export const PRECIO_SIN_DEFINIR = 1

export interface ResumenSemilla {
  formularios: ProductoForm[]
  /** Cuántos entraron con el precio de relleno */
  sinPrecio: number
  /** Cuántos llevan envase retornable */
  conVacio: number
}

/**
 * @param tasa Pesos por dólar. Los precios del Excel están en pesos y en la
 *             aplicación viven en dólares, así que aquí se dividen una vez.
 */
export function formulariosDeSemilla(
  semillas: ProductoSemilla[],
  tasa: number,
): ResumenSemilla {
  if (!(tasa > 0)) throw new Error('Hace falta la tasa del peso para convertir los precios')

  let sinPrecio = 0
  let conVacio = 0

  const formularios = semillas.map((s) => {
    const unidadPesos = s.precioUnidad > 0 ? s.precioUnidad : PRECIO_SIN_DEFINIR
    if (s.precioUnidad <= 0) sinPrecio++
    if (s.retornable) conVacio++

    /*
     * El precio de la caja NO se deduce del de la unidad.
     *
     * Una caja de Pilsen vale 62.000 y treinta y seis unidades sueltas valen
     * 90.000: el mayorista paga un 31% menos. Calcularla multiplicando dejaría
     * a quien compra por cajas pagando precio de detal, que es la clase de
     * error que no se nota hasta que el cliente se va a otro sitio.
     */
    const presentaciones =
      s.caja > 1
        ? [
            {
              nombre: 'Caja',
              factor: s.caja,
              precio: enDolares(
                s.precioCaja && s.precioCaja > 0 ? s.precioCaja : unidadPesos * s.caja,
                tasa,
              ),
            },
          ]
        : []

    const form: ProductoForm = {
      id: s.id,
      nombre: s.nombre,
      nombreCorto: s.nombreCorto,
      categoriaId: s.categoriaId,
      contenido: s.contenido,
      unidadContenido: s.contenido ? 'ml' : undefined,
      precioDetal: enDolares(unidadPesos, tasa),
      retornable: s.retornable ?? false,
      stockMin: 0,
      presentaciones,
    }
    return form
  })

  return { formularios, sinPrecio, conVacio }
}

/**
 * De pesos a dólares, con los decimales de un PRECIO y no los de un monto.
 *
 * Con el peso a cuatro mil por dólar, un céntimo son cuarenta pesos: con dos
 * decimales, 2.500 pesos se guardarían como un precio que al volver a pesos da
 * 2.480. Cuatro decimales dejan el error por debajo del peso.
 */
function enDolares(pesos: number, tasa: number): number {
  return redondear(pesos / tasa, DECIMALES_PRECIO)
}
