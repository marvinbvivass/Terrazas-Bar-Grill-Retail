import type {
  ListaPrecio,
  MetodoPago,
  Precio,
  Presentacion,
  Producto,
  Ubicacion,
} from './types'

/**
 * Escenario de prueba. Es el MISMO caso que se validó contra PostgreSQL 16:
 * cerveza Polar 222ml con botella / six-pack / caja x36, precio 1,00 en sala,
 * 1,25 en nevera y 0,80 desde 36 unidades.
 *
 * Si estos números cambian aquí y no cambian en el esquema SQL, la caja va a
 * calcular offline un precio que el servidor rechaza al sincronizar.
 */

export const SALA: Ubicacion = {
  id: 'ubi-sala',
  nombre: 'Sala',
  tipo: 'sala',
  refrigerado: false,
  permiteVenta: true,
}

export const NEVERA: Ubicacion = {
  id: 'ubi-nevera',
  nombre: 'Nevera',
  tipo: 'refrigerado',
  refrigerado: true,
  permiteVenta: true,
}

export const POLAR: Producto = {
  id: 'prod-polar',
  sku: 'CERV-POL-222',
  nombre: 'Cerveza Polar Pilsen 222ml',
  nombreCorto: 'Polar 222',
  categoriaId: 'cat-cerveza',
  marca: 'Polar',
  contenidoMl: 222,
  iva: 0.16,
  unidadBase: 'botella',
  controlaLote: true,
  fraccionable: false,
  retornable: true,
  stockMin: 72,
  costoPromedio: 0.6,
  activo: true,
}

export const BOTELLA: Presentacion = {
  id: 'pres-botella',
  productoId: POLAR.id,
  nombre: 'Botella',
  factor: 1,
  esBase: true,
  permiteVenta: true,
  permiteCompra: false,
  activo: true,
}

export const SIXPACK: Presentacion = {
  id: 'pres-six',
  productoId: POLAR.id,
  nombre: 'Six-pack',
  factor: 6,
  esBase: false,
  permiteVenta: true,
  permiteCompra: false,
  activo: true,
}

export const CAJA36: Presentacion = {
  id: 'pres-caja',
  productoId: POLAR.id,
  nombre: 'Caja x36',
  factor: 36,
  esBase: false,
  permiteVenta: true,
  permiteCompra: true,
  activo: true,
}

export const PRESENTACIONES_POLAR = [BOTELLA, SIXPACK, CAJA36]

export const LISTA_DETAL: ListaPrecio = {
  id: 'lst-detal',
  nombre: 'Detal',
  moneda: 'USD',
  prioridad: 100,
  cantidadMin: null,
  ubicacionId: null,
  tipoCliente: null,
  activo: true,
}

export const LISTA_FRIO: ListaPrecio = {
  id: 'lst-frio',
  nombre: 'Frío',
  moneda: 'USD',
  prioridad: 50,
  cantidadMin: null,
  ubicacionId: NEVERA.id,
  tipoCliente: null,
  activo: true,
}

export const LISTA_MAYOR: ListaPrecio = {
  id: 'lst-mayor',
  nombre: 'Mayor',
  moneda: 'USD',
  prioridad: 20,
  cantidadMin: 36,
  ubicacionId: null,
  tipoCliente: null,
  activo: true,
}

export const LISTAS = [LISTA_DETAL, LISTA_FRIO, LISTA_MAYOR]

const T0 = 0

export const PRECIOS: Precio[] = [
  { id: 'p1', listaId: LISTA_DETAL.id, presentacionId: BOTELLA.id, precio: 1.0, vigenteDesde: T0, vigenteHasta: null },
  { id: 'p2', listaId: LISTA_FRIO.id, presentacionId: BOTELLA.id, precio: 1.25, vigenteDesde: T0, vigenteHasta: null },
  { id: 'p3', listaId: LISTA_MAYOR.id, presentacionId: BOTELLA.id, precio: 0.8, vigenteDesde: T0, vigenteHasta: null },
  { id: 'p4', listaId: LISTA_DETAL.id, presentacionId: SIXPACK.id, precio: 5.7, vigenteDesde: T0, vigenteHasta: null },
  { id: 'p5', listaId: LISTA_FRIO.id, presentacionId: SIXPACK.id, precio: 7.0, vigenteDesde: T0, vigenteHasta: null },
  { id: 'p6', listaId: LISTA_DETAL.id, presentacionId: CAJA36.id, precio: 30.0, vigenteDesde: T0, vigenteHasta: null },
]

export const CATALOGO = { listas: LISTAS, precios: PRECIOS }

export const PRESENTACIONES_MAPA = new Map(PRESENTACIONES_POLAR.map((p) => [p.id, p]))

export const EFECTIVO_USD: MetodoPago = {
  id: 'mp-usd',
  nombre: 'Efectivo USD',
  moneda: 'USD',
  aplicaIgtf: true,
  requiereReferencia: false,
  esEfectivo: true,
  activo: true,
}

export const EFECTIVO_BS: MetodoPago = {
  id: 'mp-bs',
  nombre: 'Efectivo Bs',
  moneda: 'VES',
  aplicaIgtf: false,
  requiereReferencia: false,
  esEfectivo: true,
  activo: true,
}

export const PAGO_MOVIL: MetodoPago = {
  id: 'mp-pm',
  nombre: 'Pago Móvil',
  moneda: 'VES',
  aplicaIgtf: false,
  requiereReferencia: true,
  esEfectivo: false,
  activo: true,
}

export const TASA_VES = 36.5
