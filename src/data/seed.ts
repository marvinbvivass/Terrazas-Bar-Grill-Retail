import type {
  Categoria,
  Cliente,
  CodigoBarras,
  Existencia,
  ListaPrecio,
  MetodoPago,
  Precio,
  Presentacion,
  Producto,
  Ubicacion,
} from '../domain/types'

/**
 * Catálogo semilla: 40 productos de una licorería venezolana.
 *
 * Sirve para tres cosas: que la aplicación arranque con algo real desde el
 * primer día, que las pruebas de interfaz tengan datos con los que discutir,
 * y que se vea cómo se carga el catálogo definitivo. Se reemplaza por los
 * productos de verdad en la fase 0, que con 40 filas es una tarde de trabajo.
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
]

export const LISTAS_PRECIO: ListaPrecio[] = [
  // Menor prioridad = gana. Mayor(20) le gana a Frío(50) le gana a Detal(100).
  //
  // Hay dos escalones de mayoreo porque el negocio tiene dos: la cerveza y los
  // refrescos se llevan por caja, y nadie compra 24 botellas de whisky. Poner
  // un solo umbral de 24 para todo hace que el precio de mayor no se active
  // nunca en la mitad del catálogo.
  { id: 'lst-mayor', nombre: 'Mayor', moneda: 'USD', prioridad: 20, cantidadMin: 24, ubicacionId: null, tipoCliente: null, activo: true },
  { id: 'lst-mayor6', nombre: 'Mayor', moneda: 'USD', prioridad: 25, cantidadMin: 6, ubicacionId: null, tipoCliente: null, activo: true },
  { id: 'lst-frio', nombre: 'Frío', moneda: 'USD', prioridad: 50, cantidadMin: null, ubicacionId: UBICACION_FRIO, tipoCliente: null, activo: true },
  { id: 'lst-detal', nombre: 'Detal', moneda: 'USD', prioridad: 100, cantidadMin: null, ubicacionId: null, tipoCliente: null, activo: true },
]

/** Lo que se lleva por caja: umbral 24 y 12% de descuento */
const CATEGORIAS_BULTO = new Set(['cat-cerveza', 'cat-mezcla', 'cat-snacks', 'cat-cigarrillos', 'cat-hielo'])

export const METODOS_PAGO: MetodoPago[] = [
  { id: 'mp-efectivo-usd', nombre: 'Efectivo $', moneda: 'USD', aplicaIgtf: true, requiereReferencia: false, esEfectivo: true, activo: true },
  { id: 'mp-efectivo-bs', nombre: 'Efectivo Bs', moneda: 'VES', aplicaIgtf: false, requiereReferencia: false, esEfectivo: true, activo: true },
  { id: 'mp-pago-movil', nombre: 'Pago Móvil', moneda: 'VES', aplicaIgtf: false, requiereReferencia: true, esEfectivo: false, activo: true },
  { id: 'mp-punto', nombre: 'Punto de venta', moneda: 'VES', aplicaIgtf: false, requiereReferencia: true, esEfectivo: false, activo: true },
  { id: 'mp-zelle', nombre: 'Zelle', moneda: 'USD', aplicaIgtf: true, requiereReferencia: true, esEfectivo: false, activo: true },
]

// ---------------------------------------------------------------------------
// Definición compacta del catálogo
// ---------------------------------------------------------------------------

interface DefPresentacion {
  nombre: string
  factor: number
  /** Precio detal de esta presentación. Si falta, se calcula como factor × precio base */
  precio?: number
  codigo?: string
}

interface DefProducto {
  sku: string
  nombre: string
  corto: string
  categoria: string
  marca?: string
  ml?: number
  grado?: number
  /** Precio detal de la unidad base, con IVA incluido */
  precio: number
  costo: number
  /** Precio de la misma unidad sacada de la nevera. Solo lo que se vende frío. */
  precioFrio?: number
  codigo?: string
  presentaciones?: DefPresentacion[]
  retornable?: boolean
  exento?: boolean
  fraccionable?: boolean
  mlPorServicio?: number
  stockMin: number
  stockSala: number
  stockNevera?: number
}

const CATALOGO: DefProducto[] = [
  // ---- Cerveza -----------------------------------------------------------
  { sku: 'CER-POL-222', nombre: 'Polar Pilsen 222 ml', corto: 'Polar Pilsen', categoria: 'cat-cerveza', marca: 'Polar', ml: 222, grado: 4.5, precio: 1.0, precioFrio: 1.25, costo: 0.6, retornable: true, codigo: '7591234000018', stockMin: 72, stockSala: 264, stockNevera: 48,
    presentaciones: [{ nombre: 'Six-pack', factor: 6, precio: 5.7 }, { nombre: 'Caja x36', factor: 36, precio: 30, codigo: '17591234000015' }] },
  { sku: 'CER-POL-250', nombre: 'Polar Light 250 ml', corto: 'Polar Light', categoria: 'cat-cerveza', marca: 'Polar', ml: 250, grado: 4.0, precio: 1.1, precioFrio: 1.35, costo: 0.68, retornable: true, codigo: '7591234000025', stockMin: 48, stockSala: 144, stockNevera: 36,
    presentaciones: [{ nombre: 'Six-pack', factor: 6, precio: 6.3 }, { nombre: 'Caja x24', factor: 24, precio: 24 }] },
  { sku: 'CER-SOL-330', nombre: 'Solera Verde 330 ml', corto: 'Solera Verde', categoria: 'cat-cerveza', marca: 'Solera', ml: 330, grado: 5.0, precio: 1.5, precioFrio: 1.8, costo: 0.95, codigo: '7591234000032', stockMin: 48, stockSala: 96, stockNevera: 24,
    presentaciones: [{ nombre: 'Six-pack', factor: 6, precio: 8.5 }, { nombre: 'Caja x24', factor: 24, precio: 33 }] },
  { sku: 'CER-ZUL-355', nombre: 'Zulia 355 ml', corto: 'Zulia', categoria: 'cat-cerveza', marca: 'Zulia', ml: 355, grado: 4.6, precio: 1.3, precioFrio: 1.6, costo: 0.82, codigo: '7591234000049', stockMin: 48, stockSala: 72, stockNevera: 24,
    presentaciones: [{ nombre: 'Six-pack', factor: 6, precio: 7.4 }, { nombre: 'Caja x24', factor: 24, precio: 29 }] },
  { sku: 'CER-COR-355', nombre: 'Corona Extra 355 ml', corto: 'Corona', categoria: 'cat-cerveza', marca: 'Corona', ml: 355, grado: 4.5, precio: 2.5, precioFrio: 3.0, costo: 1.7, codigo: '7501064191305', stockMin: 24, stockSala: 48, stockNevera: 24,
    presentaciones: [{ nombre: 'Six-pack', factor: 6, precio: 14 }] },
  { sku: 'CER-HEI-330', nombre: 'Heineken 330 ml', corto: 'Heineken', categoria: 'cat-cerveza', marca: 'Heineken', ml: 330, grado: 5.0, precio: 2.6, precioFrio: 3.1, costo: 1.8, codigo: '8712000023003', stockMin: 24, stockSala: 36, stockNevera: 24,
    presentaciones: [{ nombre: 'Six-pack', factor: 6, precio: 14.5 }] },

  // ---- Ron ---------------------------------------------------------------
  { sku: 'RON-CAC-500', nombre: 'Cacique Añejo 500 ml', corto: 'Cacique 500', categoria: 'cat-ron', marca: 'Cacique', ml: 500, grado: 40, precio: 7.5, costo: 5.2, codigo: '7591234010017', stockMin: 6, stockSala: 24 },
  { sku: 'RON-CAC-750', nombre: 'Cacique Añejo 750 ml', corto: 'Cacique 750', categoria: 'cat-ron', marca: 'Cacique', ml: 750, grado: 40, precio: 10.5, costo: 7.4, codigo: '7591234010024', stockMin: 6, stockSala: 30, fraccionable: true, mlPorServicio: 45,
    presentaciones: [{ nombre: 'Caja x12', factor: 12, precio: 118 }] },
  { sku: 'RON-CAC-500R', nombre: 'Cacique 500 Reserva 750 ml', corto: 'Cacique 500 R.', categoria: 'cat-ron', marca: 'Cacique', ml: 750, grado: 40, precio: 17.0, costo: 12.5, codigo: '7591234010031', stockMin: 4, stockSala: 12 },
  { sku: 'RON-STE-1796', nombre: 'Santa Teresa 1796 700 ml', corto: 'S. Teresa 1796', categoria: 'cat-ron', marca: 'Santa Teresa', ml: 700, grado: 40, precio: 34.0, costo: 26.0, codigo: '7591234010048', stockMin: 3, stockSala: 8 },
  { sku: 'RON-STE-GRA', nombre: 'Santa Teresa Gran Reserva 750 ml', corto: 'S. Teresa G.R.', categoria: 'cat-ron', marca: 'Santa Teresa', ml: 750, grado: 40, precio: 14.5, costo: 10.4, codigo: '7591234010055', stockMin: 6, stockSala: 18 },
  { sku: 'RON-PAM-ANI', nombre: 'Pampero Aniversario 700 ml', corto: 'Pampero Aniv.', categoria: 'cat-ron', marca: 'Pampero', ml: 700, grado: 40, precio: 29.0, costo: 22.0, codigo: '7591234010062', stockMin: 3, stockSala: 6 },
  { sku: 'RON-PAM-ESP', nombre: 'Pampero Especial 750 ml', corto: 'Pampero Esp.', categoria: 'cat-ron', marca: 'Pampero', ml: 750, grado: 40, precio: 11.0, costo: 7.8, codigo: '7591234010079', stockMin: 6, stockSala: 24 },
  { sku: 'RON-DIP-750', nombre: 'Diplomático Reserva 750 ml', corto: 'Diplomático', categoria: 'cat-ron', marca: 'Diplomático', ml: 750, grado: 40, precio: 42.0, costo: 33.0, codigo: '7591234010086', stockMin: 2, stockSala: 6 },

  // ---- Whisky ------------------------------------------------------------
  { sku: 'WHI-BUC-750', nombre: "Buchanan's Deluxe 12 años 750 ml", corto: "Buchanan's 12", categoria: 'cat-whisky', marca: "Buchanan's", ml: 750, grado: 40, precio: 46.0, costo: 37.0, codigo: '5000281005744', stockMin: 3, stockSala: 9 },
  { sku: 'WHI-OLD-750', nombre: 'Old Parr 12 años 750 ml', corto: 'Old Parr', categoria: 'cat-whisky', marca: 'Old Parr', ml: 750, grado: 40, precio: 44.0, costo: 35.5, codigo: '5000281004310', stockMin: 3, stockSala: 8 },
  { sku: 'WHI-JW-RED', nombre: 'Johnnie Walker Red Label 750 ml', corto: 'JW Red', categoria: 'cat-whisky', marca: 'Johnnie Walker', ml: 750, grado: 40, precio: 24.0, costo: 18.5, codigo: '5000267014005', stockMin: 4, stockSala: 12 },
  { sku: 'WHI-JW-BLK', nombre: 'Johnnie Walker Black Label 750 ml', corto: 'JW Black', categoria: 'cat-whisky', marca: 'Johnnie Walker', ml: 750, grado: 40, precio: 48.0, costo: 39.0, codigo: '5000267024004', stockMin: 3, stockSala: 7 },
  { sku: 'WHI-CHI-750', nombre: 'Chivas Regal 12 años 750 ml', corto: 'Chivas 12', categoria: 'cat-whisky', marca: 'Chivas', ml: 750, grado: 40, precio: 45.0, costo: 36.0, codigo: '5000299225004', stockMin: 3, stockSala: 6 },
  { sku: 'WHI-SOM-750', nombre: 'Something Special 750 ml', corto: 'Something Sp.', categoria: 'cat-whisky', marca: 'Something Special', ml: 750, grado: 40, precio: 27.0, costo: 21.0, codigo: '5000281004013', stockMin: 4, stockSala: 10 },

  // ---- Vodka y ginebra ---------------------------------------------------
  { sku: 'VOD-ABS-750', nombre: 'Absolut Original 750 ml', corto: 'Absolut', categoria: 'cat-blancos', marca: 'Absolut', ml: 750, grado: 40, precio: 22.0, costo: 16.8, codigo: '7312040017027', stockMin: 3, stockSala: 9 },
  { sku: 'VOD-SMI-750', nombre: 'Smirnoff Red 750 ml', corto: 'Smirnoff', categoria: 'cat-blancos', marca: 'Smirnoff', ml: 750, grado: 37.5, precio: 14.0, costo: 10.2, codigo: '5410316465007', stockMin: 4, stockSala: 12 },
  { sku: 'GIN-GOR-750', nombre: "Gordon's London Dry Gin 750 ml", corto: "Gordon's", categoria: 'cat-blancos', marca: "Gordon's", ml: 750, grado: 37.5, precio: 19.0, costo: 14.5, codigo: '5000289020428', stockMin: 3, stockSala: 6 },
  { sku: 'TEQ-JOS-750', nombre: 'José Cuervo Especial 750 ml', corto: 'J. Cuervo', categoria: 'cat-blancos', marca: 'José Cuervo', ml: 750, grado: 38, precio: 26.0, costo: 20.0, codigo: '7501035042018', stockMin: 3, stockSala: 6 },

  // ---- Vinos -------------------------------------------------------------
  { sku: 'VIN-CAS-750', nombre: 'Casillero del Diablo Cabernet 750 ml', corto: 'Casillero Cab.', categoria: 'cat-vino', marca: 'Concha y Toro', ml: 750, grado: 13.5, precio: 12.0, costo: 8.6, codigo: '7804320550015', stockMin: 6, stockSala: 18 },
  { sku: 'VIN-GAT-750', nombre: 'Gato Negro Merlot 750 ml', corto: 'Gato Negro', categoria: 'cat-vino', marca: 'San Pedro', ml: 750, grado: 13, precio: 8.5, costo: 5.9, codigo: '7804300010102', stockMin: 6, stockSala: 24 },
  { sku: 'VIN-SAN-750', nombre: 'Sangría Pomar 750 ml', corto: 'Sangría Pomar', categoria: 'cat-vino', marca: 'Pomar', ml: 750, grado: 7, precio: 6.5, precioFrio: 7.5, costo: 4.3, codigo: '7591234020016', stockMin: 6, stockSala: 18, stockNevera: 6 },
  { sku: 'VIN-ESP-750', nombre: 'Espumante Pomar Brut 750 ml', corto: 'Pomar Brut', categoria: 'cat-vino', marca: 'Pomar', ml: 750, grado: 11.5, precio: 15.0, precioFrio: 16.5, costo: 11.0, codigo: '7591234020023', stockMin: 4, stockSala: 8, stockNevera: 4 },

  // ---- Anís y licores ----------------------------------------------------
  { sku: 'LIC-ANI-750', nombre: 'Anís Cartujo 750 ml', corto: 'Anís Cartujo', categoria: 'cat-licores', marca: 'Cartujo', ml: 750, grado: 45, precio: 9.5, costo: 6.6, codigo: '7591234030015', stockMin: 4, stockSala: 12 },
  { sku: 'LIC-BAI-750', nombre: "Baileys Original 750 ml", corto: 'Baileys', categoria: 'cat-licores', marca: 'Baileys', ml: 750, grado: 17, precio: 23.0, costo: 17.5, codigo: '5011013100132', stockMin: 3, stockSala: 6 },
  { sku: 'LIC-JAG-700', nombre: 'Jägermeister 700 ml', corto: 'Jägermeister', categoria: 'cat-licores', marca: 'Jägermeister', ml: 700, grado: 35, precio: 25.0, costo: 19.0, codigo: '4067700015167', stockMin: 3, stockSala: 6 },
  { sku: 'LIC-COC-750', nombre: 'Ponche Crema 750 ml', corto: 'Ponche Crema', categoria: 'cat-licores', marca: 'Ponche Crema', ml: 750, grado: 14, precio: 11.0, costo: 7.9, codigo: '7591234030022', stockMin: 4, stockSala: 10 },

  // ---- Mezcladores -------------------------------------------------------
  { sku: 'MEZ-COC-2L', nombre: 'Coca-Cola 2 L', corto: 'Coca-Cola 2L', categoria: 'cat-mezcla', marca: 'Coca-Cola', ml: 2000, precio: 2.4, precioFrio: 2.8, costo: 1.6, codigo: '7591234040014', stockMin: 12, stockSala: 36, stockNevera: 12 },
  { sku: 'MEZ-COC-1_5', nombre: 'Coca-Cola 1,5 L', corto: 'Coca-Cola 1,5L', categoria: 'cat-mezcla', marca: 'Coca-Cola', ml: 1500, precio: 1.9, precioFrio: 2.2, costo: 1.25, codigo: '7591234040021', stockMin: 12, stockSala: 24, stockNevera: 12 },
  { sku: 'MEZ-SOD-1_5', nombre: 'Soda Canada Dry 1,5 L', corto: 'Soda 1,5L', categoria: 'cat-mezcla', marca: 'Canada Dry', ml: 1500, precio: 1.6, precioFrio: 1.9, costo: 1.05, codigo: '7591234040038', stockMin: 12, stockSala: 24, stockNevera: 12 },
  { sku: 'MEZ-AGU-600', nombre: 'Agua Minalba 600 ml', corto: 'Agua 600', categoria: 'cat-mezcla', marca: 'Minalba', ml: 600, precio: 0.8, precioFrio: 1.0, costo: 0.45, codigo: '7591234040045', stockMin: 24, stockSala: 60, stockNevera: 24 },

  // ---- Snacks, cigarrillos, hielo ---------------------------------------
  { sku: 'SNK-PAP-150', nombre: 'Papas Margarita 150 g', corto: 'Papas 150g', categoria: 'cat-snacks', marca: 'Margarita', precio: 2.2, costo: 1.5, codigo: '7591234050013', stockMin: 12, stockSala: 30 },
  { sku: 'SNK-MAN-100', nombre: 'Maní salado 100 g', corto: 'Maní 100g', categoria: 'cat-snacks', precio: 1.5, costo: 0.95, codigo: '7591234050020', stockMin: 12, stockSala: 40 },
  { sku: 'CIG-BEL-20', nombre: 'Belmont caja x20', corto: 'Belmont', categoria: 'cat-cigarrillos', marca: 'Belmont', precio: 3.5, costo: 2.7, codigo: '7591234060012', stockMin: 20, stockSala: 60,
    presentaciones: [{ nombre: 'Cartón x10', factor: 10, precio: 33 }] },
  { sku: 'CIG-LUC-20', nombre: 'Lucky Strike caja x20', corto: 'Lucky Strike', categoria: 'cat-cigarrillos', marca: 'Lucky Strike', precio: 3.8, costo: 2.95, codigo: '7591234060029', stockMin: 20, stockSala: 40,
    presentaciones: [{ nombre: 'Cartón x10', factor: 10, precio: 36 }] },
  { sku: 'HIE-BOL-3K', nombre: 'Hielo en bolsa 3 kg', corto: 'Hielo 3kg', categoria: 'cat-hielo', precio: 1.5, costo: 0.7, exento: true, codigo: '7591234070011', stockMin: 10, stockSala: 0, stockNevera: 40 },
]

// ---------------------------------------------------------------------------
// Expansión a las tablas del dominio
// ---------------------------------------------------------------------------

export interface DatosSemilla {
  categorias: Categoria[]
  ubicaciones: Ubicacion[]
  productos: Producto[]
  presentaciones: Presentacion[]
  codigos: CodigoBarras[]
  listas: ListaPrecio[]
  precios: Precio[]
  existencias: Existencia[]
  metodosPago: MetodoPago[]
}

export function construirSemilla(): DatosSemilla {
  const productos: Producto[] = []
  const presentaciones: Presentacion[] = []
  const codigos: CodigoBarras[] = []
  const precios: Precio[] = []
  const existencias: Existencia[] = []

  let secuencia = 0
  const idPrecio = () => `prc-${++secuencia}`

  for (const def of CATALOGO) {
    const productoId = `prod-${def.sku}`

    productos.push({
      id: productoId,
      sku: def.sku,
      nombre: def.nombre,
      nombreCorto: def.corto,
      categoriaId: def.categoria,
      marca: def.marca,
      contenidoMl: def.ml,
      gradoAlcohol: def.grado,
      iva: def.exento ? 0 : 0.16,
      unidadBase: 'unidad',
      controlaLote: def.categoria === 'cat-cerveza' || def.categoria === 'cat-mezcla',
      fraccionable: def.fraccionable ?? false,
      mlPorServicio: def.mlPorServicio,
      retornable: def.retornable ?? false,
      stockMin: def.stockMin,
      costoPromedio: def.costo,
      activo: true,
    })

    // Presentación base: la unidad
    const baseId = `pres-${def.sku}-base`
    presentaciones.push({
      id: baseId,
      productoId,
      nombre: 'Unidad',
      factor: 1,
      esBase: true,
      permiteVenta: true,
      permiteCompra: false,
      activo: true,
    })
    if (def.codigo) codigos.push({ codigo: def.codigo, presentacionId: baseId, tipo: 'EAN13' })

    precios.push({ id: idPrecio(), listaId: 'lst-detal', presentacionId: baseId, precio: def.precio, vigenteDesde: 0, vigenteHasta: null })
    if (def.precioFrio !== undefined) {
      precios.push({ id: idPrecio(), listaId: 'lst-frio', presentacionId: baseId, precio: def.precioFrio, vigenteDesde: 0, vigenteHasta: null })
    }
    // Precio de mayor. Cerveza y refrescos: desde 24, 12% abajo.
    // Licores y vinos: desde 6 (media caja), 8% abajo.
    const porBulto = CATEGORIAS_BULTO.has(def.categoria)
    precios.push({
      id: idPrecio(),
      listaId: porBulto ? 'lst-mayor' : 'lst-mayor6',
      presentacionId: baseId,
      precio: Math.round(def.precio * (porBulto ? 0.88 : 0.92) * 100) / 100,
      vigenteDesde: 0,
      vigenteHasta: null,
    })

    // Presentación fraccionada para lo que se sirve por trago
    if (def.fraccionable && def.mlPorServicio && def.ml) {
      const tragoId = `pres-${def.sku}-trago`
      const factor = Math.round((def.mlPorServicio / def.ml) * 1e6) / 1e6
      presentaciones.push({
        id: tragoId, productoId, nombre: `Trago ${def.mlPorServicio}ml`, factor,
        esBase: false, permiteVenta: true, permiteCompra: false, activo: true,
      })
      // El trago se vende con margen: la botella rinde ~16 y se cobra el doble
      const precioTrago = Math.round((def.precio / (def.ml / def.mlPorServicio)) * 2 * 100) / 100
      precios.push({ id: idPrecio(), listaId: 'lst-detal', presentacionId: tragoId, precio: precioTrago, vigenteDesde: 0, vigenteHasta: null })
    }

    for (const p of def.presentaciones ?? []) {
      const presId = `pres-${def.sku}-${p.factor}`
      presentaciones.push({
        id: presId, productoId, nombre: p.nombre, factor: p.factor,
        esBase: false, permiteVenta: true, permiteCompra: p.factor >= 6, activo: true,
      })
      if (p.codigo) codigos.push({ codigo: p.codigo, presentacionId: presId, tipo: 'DUN14' })
      const precio = p.precio ?? Math.round(def.precio * p.factor * 100) / 100
      precios.push({ id: idPrecio(), listaId: 'lst-detal', presentacionId: presId, precio, vigenteDesde: 0, vigenteHasta: null })
    }

    if (def.stockSala > 0) {
      existencias.push({ productoId, ubicacionId: 'ubi-sala', cantidadBase: def.stockSala })
    }
    if (def.stockNevera) {
      existencias.push({ productoId, ubicacionId: UBICACION_FRIO, cantidadBase: def.stockNevera })
    }
  }

  return {
    categorias: CATEGORIAS,
    ubicaciones: UBICACIONES,
    productos,
    presentaciones,
    codigos,
    listas: LISTAS_PRECIO,
    precios,
    existencias,
    metodosPago: METODOS_PAGO,
  }
}

export const TASA_VES_INICIAL = 36.5

// ---------------------------------------------------------------------------
// Clientes de confianza
// ---------------------------------------------------------------------------

/**
 * Los clientes del sistema NO son todos los que compran: son solo los que
 * llevan fiado. El que paga de contado no hace falta registrarlo.
 */
export const CLIENTES_SEMILLA: Cliente[] = [
  { id: 'cli-1', nombre: 'Juan Pérez', documento: 'V-12345678', telefono: '0412-1112233', limiteCredito: 50, nota: 'Vecino, paga los viernes', activo: true, creadoEn: 0 },
  { id: 'cli-2', nombre: 'María González', documento: 'V-9876543', telefono: '0414-5556677', limiteCredito: 30, nota: null, activo: true, creadoEn: 0 },
  { id: 'cli-3', nombre: 'Taller El Rápido', documento: 'J-407654321', telefono: '0416-9998877', limiteCredito: 120, nota: 'Compran para los almuerzos del taller', activo: true, creadoEn: 0 },
  { id: 'cli-4', nombre: 'Carlos el barbero', documento: null, telefono: '0424-3334455', limiteCredito: 0, nota: null, activo: true, creadoEn: 0 },
]
