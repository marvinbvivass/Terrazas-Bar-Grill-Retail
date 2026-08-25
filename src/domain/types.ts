/**
 * Tipos del dominio. Son el espejo en TypeScript de `esquema_licoreria.sql`.
 * Si cambia una tabla allá, cambia una interfaz aquí.
 *
 * Convenciones que no se negocian:
 *  - Todo el stock se expresa en UNIDAD BASE (1 botella, 1 lata).
 *  - Toda cantidad monetaria del documento va en la MONEDA BASE (USD).
 *  - Todo id es un UUID generado en el cliente, nunca por el servidor.
 */

export type UUID = string

export type MonedaCodigo = 'USD' | 'VES' | 'COP'

export interface Moneda {
  codigo: MonedaCodigo
  nombre: string
  decimales: number
  /** Símbolo corto para la caja: $, Bs, COL$ */
  simbolo: string
}

export type TipoUbicacion = 'deposito' | 'sala' | 'refrigerado' | 'barra' | 'transito'

export interface Ubicacion {
  id: UUID
  nombre: string
  tipo: TipoUbicacion
  refrigerado: boolean
  permiteVenta: boolean
}

export interface Categoria {
  id: UUID
  nombre: string
  orden: number
}

export interface Producto {
  id: UUID
  sku: string
  nombre: string
  /** Nombre corto para el botón de la cuadrícula: cabe en dos líneas */
  nombreCorto: string
  categoriaId: UUID
  marca?: string
  contenidoMl?: number
  gradoAlcohol?: number
  /** Tasa de IVA como fracción: 0.16, o 0 si es exento */
  iva: number
  unidadBase: string
  controlaLote: boolean
  fraccionable: boolean
  mlPorServicio?: number
  retornable: boolean
  stockMin: number
  costoPromedio: number
  activo: boolean
}

/**
 * La conversión caja ↔ unidad ↔ trago vive aquí y en ningún otro lado.
 * `factor` es cuántas unidades base representa esta presentación.
 */
export interface Presentacion {
  id: UUID
  productoId: UUID
  nombre: string
  factor: number
  esBase: boolean
  permiteVenta: boolean
  permiteCompra: boolean
  activo: boolean
}

export type TipoCodigo = 'EAN13' | 'EAN8' | 'UPC' | 'DUN14' | 'interno'

export interface CodigoBarras {
  codigo: string
  presentacionId: UUID
  tipo: TipoCodigo
}

export type TipoCliente = 'detal' | 'mayor'

export interface ListaPrecio {
  id: UUID
  nombre: string
  moneda: MonedaCodigo
  /** Menor número gana */
  prioridad: number
  /** Se activa desde N unidades base. null = siempre */
  cantidadMin: number | null
  /** Ligada a una ubicación (la lista "Frío" apunta a la nevera). null = cualquiera */
  ubicacionId: UUID | null
  tipoCliente: TipoCliente | null
  activo: boolean
}

export interface Precio {
  id: UUID
  listaId: UUID
  presentacionId: UUID
  precio: number
  /** Epoch ms */
  vigenteDesde: number
  vigenteHasta: number | null
}

export interface Existencia {
  productoId: UUID
  ubicacionId: UUID
  cantidadBase: number
}

export interface TasaCambio {
  moneda: MonedaCodigo
  tasa: number
  /** Epoch ms de cuándo se cargó */
  fecha: number
  fuente: string
}

export interface MetodoPago {
  id: UUID
  nombre: string
  moneda: MonedaCodigo
  /** Si es true, el pago genera IGTF sobre el monto abonado */
  aplicaIgtf: boolean
  requiereReferencia: boolean
  /** Si es efectivo, la caja calcula vuelto */
  esEfectivo: boolean
  activo: boolean
}

export type TipoMovimiento =
  | 'compra'
  | 'venta'
  | 'devolucion_cliente'
  | 'devolucion_proveedor'
  | 'merma'
  | 'traslado'
  | 'ajuste'
  | 'apertura_botella'
  | 'obsequio'
  | 'conteo'

export interface MovimientoInventario {
  id: UUID
  fecha: number
  tipo: TipoMovimiento
  productoId: UUID
  presentacionId: UUID | null
  cantidadPresentacion: number
  /** Con signo: positivo entra, negativo sale */
  cantidadBase: number
  ubicacionId: UUID
  ubicacionDestinoId: UUID | null
  costoUnitario: number | null
  documentoTipo: string | null
  documentoId: UUID | null
  usuarioId: UUID
  motivo: string | null
}

// ---------------------------------------------------------------------------
// Venta
// ---------------------------------------------------------------------------

export interface LineaVenta {
  id: UUID
  productoId: UUID
  presentacionId: UUID
  ubicacionId: UUID
  /** Cantidad en la presentación elegida: 2 (cajas) */
  cantidad: number
  /** La misma cantidad traducida a unidad base: 48 (botellas) */
  cantidadBase: number
  precioUnitario: number
  descuento: number
  listaPrecioId: UUID
  listaPrecioNombre: string
  /** Fracción: 0.16 */
  ivaPct: number
  importe: number
  /** Costo congelado al momento de la venta, para que el margen no cambie después */
  costoUnitario: number
}

export interface Pago {
  id: UUID
  metodoPagoId: UUID
  metodoNombre: string
  moneda: MonedaCodigo
  /** Lo que este pago abona a la factura, en MONEDA BASE (USD) */
  montoAplicado: number
  /** IGTF generado por este pago, en moneda base. 0 si el método no lo aplica */
  igtf: number
  /** Tasa usada para convertir de moneda base a la moneda del método */
  tasa: number
  /** Lo que realmente entra por caja en la moneda del método: (montoAplicado + igtf) × tasa */
  montoEnMoneda: number
  /** Solo para efectivo: lo que el cliente puso sobre el mostrador */
  entregado: number | null
  /** Vuelto en la moneda del método */
  vuelto: number
  referencia: string | null
}

/** De contado (entró la plata) o a crédito (salió la mercancía, la plata viene después) */
export type CondicionVenta = 'contado' | 'credito'

export type EstadoVenta = 'registrada' | 'anulada'

/**
 * Una venta del día.
 *
 * Ojo con las tres fechas, porque son tres cosas distintas y confundirlas es
 * lo que hace que un cierre no cuadre:
 *
 *   dia           el día de negocio al que pertenece la venta ('2026-08-25').
 *                 Es texto, no timestamp, a propósito: agrupar por fecha con
 *                 husos horarios es la forma clásica de perder las ventas de
 *                 las once de la noche.
 *   fecha         cuándo ocurrió la venta.
 *   registradaEn  cuándo el encargado la tecleó. Puede ser al día siguiente.
 */
export interface Venta {
  /** UUID generado por la caja. Es lo que hace idempotente el envío al servidor. */
  id: UUID
  numero: number | null
  folioProvisional: string
  dia: DiaNegocio
  fecha: number
  registradaEn: number
  condicion: CondicionVenta
  /** Obligatorio si es a crédito, nulo si es de contado */
  clienteId: UUID | null
  moneda: MonedaCodigo
  /** Tasas congeladas en el documento: sin esto no se puede reconstruir la venta */
  tasas: Record<string, number>
  subtotal: number
  descuento: number
  iva: number
  igtf: number
  total: number
  costoTotal: number
  estado: EstadoVenta
  usuarioId: UUID
  lineas: LineaVenta[]
  /** Vacío mientras la venta a crédito no se haya cobrado */
  pagos: Pago[]
  creadaOffline: boolean
  sincronizadaEn: number | null
}

/** Día de negocio en formato 'YYYY-MM-DD' */
export type DiaNegocio = string

export interface Cliente {
  id: UUID
  nombre: string
  documento: string | null
  telefono: string | null
  /** 0 = sin límite declarado. Solo avisa, no bloquea. */
  limiteCredito: number
  nota: string | null
  activo: boolean
  creadoEn: number
}

/** Parte de un abono que salda una venta concreta */
export interface AplicacionAbono {
  ventaId: UUID
  monto: number
}

/**
 * Un cobro a un cliente de confianza.
 *
 * El monto se reparte entre sus ventas abiertas, de la más vieja a la más
 * nueva. Puede saldar varias, saldar una a medias, o las dos cosas.
 */
export interface Abono {
  id: UUID
  clienteId: UUID
  dia: DiaNegocio
  fecha: number
  registradoEn: number
  /** En moneda base */
  monto: number
  /** Un abono también puede ser mixto: mitad efectivo, mitad pago móvil */
  pagos: Pago[]
  aplicaciones: AplicacionAbono[]
  usuarioId: UUID
  nota: string | null
}

// ---------------------------------------------------------------------------
// Vistas de apoyo para la interfaz
// ---------------------------------------------------------------------------

/** Un producto con todo lo que la cuadrícula necesita para pintarlo y venderlo */
export interface ProductoVendible {
  producto: Producto
  presentaciones: Presentacion[]
  presentacionBase: Presentacion
  /** Existencia por ubicación, en unidades base */
  stockPorUbicacion: Map<UUID, number>
  stockTotal: number
}

export interface PrecioResuelto {
  precio: number
  listaId: UUID
  listaNombre: string
}
