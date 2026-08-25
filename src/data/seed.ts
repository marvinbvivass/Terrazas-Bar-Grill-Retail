import type {
  Categoria,
  ListaPrecio,
  MetodoPago,
  Ubicacion,
} from '../domain/types'

/**
 * Configuración inicial del sistema.
 *
 * Aquí NO hay productos ni clientes. Nada de datos inventados: el catálogo lo
 * carga el encargado desde la pantalla Catálogo, y los clientes de fiado se
 * crean al fiar la primera venta.
 *
 * Lo que sí hay es la estructura sin la cual la aplicación no puede funcionar:
 * dónde está la mercancía (sala y nevera), qué listas de precio existen y con
 * qué prioridad, y con qué se puede cobrar. Eso no son datos del negocio, son
 * las piezas del mecanismo — el motor de precios no tiene cómo resolver nada si
 * no existe al menos una lista.
 *
 * Todo esto es editable después; son valores de arranque, no decisiones fijas.
 */

export const UBICACIONES: Ubicacion[] = [
  { id: 'ubi-sala', nombre: 'Sala', tipo: 'sala', refrigerado: false, permiteVenta: true },
  { id: 'ubi-nevera', nombre: 'Nevera', tipo: 'refrigerado', refrigerado: true, permiteVenta: true },
  { id: 'ubi-deposito', nombre: 'Depósito', tipo: 'deposito', refrigerado: false, permiteVenta: false },
]

export const UBICACION_VENTA_DEFECTO = 'ubi-sala'
export const UBICACION_FRIO = 'ubi-nevera'

export const CATEGORIAS: Categoria[] = [
  { id: 'cat-cerveza', nombre: 'Cerveza', orden: 1 },
  { id: 'cat-ron', nombre: 'Ron', orden: 2 },
  { id: 'cat-whisky', nombre: 'Whisky', orden: 3 },
  { id: 'cat-blancos', nombre: 'Vodka y ginebra', orden: 4 },
  { id: 'cat-vino', nombre: 'Vinos', orden: 5 },
  { id: 'cat-licores', nombre: 'Anís y licores', orden: 6 },
  { id: 'cat-mezcla', nombre: 'Mezcladores', orden: 7 },
  { id: 'cat-snacks', nombre: 'Snacks', orden: 8 },
  { id: 'cat-cigarrillos', nombre: 'Cigarrillos', orden: 9 },
  { id: 'cat-hielo', nombre: 'Hielo', orden: 10 },
  { id: 'cat-comida', nombre: 'Comida', orden: 11 },
]

/**
 * Listas de precio. Menor prioridad = gana.
 *
 * Hay dos escalones de mayoreo porque el negocio tiene dos: la cerveza y los
 * refrescos se llevan por caja, y nadie compra 24 botellas de whisky. Un solo
 * umbral de 24 para todo haría que el precio de mayor no se activara nunca en
 * la mitad del catálogo.
 */
export const LISTAS_PRECIO: ListaPrecio[] = [
  { id: 'lst-mayor', nombre: 'Mayor', moneda: 'USD', prioridad: 20, cantidadMin: 24, ubicacionId: null, tipoCliente: null, activo: true },
  { id: 'lst-mayor6', nombre: 'Mayor', moneda: 'USD', prioridad: 25, cantidadMin: 6, ubicacionId: null, tipoCliente: null, activo: true },
  { id: 'lst-frio', nombre: 'Frío', moneda: 'USD', prioridad: 50, cantidadMin: null, ubicacionId: UBICACION_FRIO, tipoCliente: null, activo: true },
  { id: 'lst-detal', nombre: 'Detal', moneda: 'USD', prioridad: 100, cantidadMin: null, ubicacionId: null, tipoCliente: null, activo: true },
]

export const CONTEXTO_CATALOGO = {
  ubicacionSala: UBICACION_VENTA_DEFECTO,
  ubicacionNevera: UBICACION_FRIO,
  listaDetal: 'lst-detal',
  listaFrio: 'lst-frio',
  listaMayorBulto: 'lst-mayor',
  listaMayorResto: 'lst-mayor6',
} as const

export const METODOS_PAGO: MetodoPago[] = [
  { id: 'mp-efectivo-usd', nombre: 'Efectivo $', moneda: 'USD', aplicaIgtf: true, requiereReferencia: false, esEfectivo: true, activo: true },
  { id: 'mp-efectivo-bs', nombre: 'Efectivo Bs', moneda: 'VES', aplicaIgtf: false, requiereReferencia: false, esEfectivo: true, activo: true },
  { id: 'mp-pago-movil', nombre: 'Pago Móvil', moneda: 'VES', aplicaIgtf: false, requiereReferencia: true, esEfectivo: false, activo: true },
  { id: 'mp-punto', nombre: 'Punto de venta', moneda: 'VES', aplicaIgtf: false, requiereReferencia: true, esEfectivo: false, activo: true },
  { id: 'mp-zelle', nombre: 'Zelle', moneda: 'USD', aplicaIgtf: true, requiereReferencia: true, esEfectivo: false, activo: true },
]

/** Tasa de arranque. Se cambia desde la barra superior el primer día. */
export const TASA_VES_INICIAL = 1

export interface ConfiguracionInicial {
  categorias: Categoria[]
  ubicaciones: Ubicacion[]
  listas: ListaPrecio[]
  metodosPago: MetodoPago[]
}

export function configuracionInicial(): ConfiguracionInicial {
  return {
    categorias: CATEGORIAS,
    ubicaciones: UBICACIONES,
    listas: LISTAS_PRECIO,
    metodosPago: METODOS_PAGO,
  }
}
