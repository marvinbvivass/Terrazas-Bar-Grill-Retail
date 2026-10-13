import type { Categoria } from '../domain/types'

/**
 * El catálogo de Terrazas, sacado del Excel con el que se llevaba a mano.
 *
 * Los precios vienen de ese archivo, EN PESOS, que es como los piensa el
 * negocio. Al cargarlos se convierten a dólares con la tasa del día, porque es
 * en dólares como viven los precios: el equivalente en pesos flota solo cuando
 * se mueve la tasa, en vez de quedarse clavado y envejecer en silencio.
 *
 * Los que el Excel no tenía entran en 1 para editarlos después. Un producto
 * sin precio no se puede vender, y entrar con un precio evidentemente falso es
 * mejor que entrar con uno creíble pero inventado: a 1 peso salta a la vista
 * la primera vez que alguien lo mire.
 *
 * ESTE ARCHIVO SE GENERA. Si cambia el Excel, se vuelve a generar; no se edita
 * a mano, o la próxima vez que se regenere se pierde lo que se haya tocado.
 */

export interface ProductoSemilla {
  id: string
  nombre: string
  nombreCorto: string
  categoriaId: string
  orden: number
  contenido?: number
  /** Cuántas unidades trae la caja. 1 = solo se vende suelto. */
  caja: number
  retornable?: boolean
  /** Precio de una unidad, en pesos, tal como está en el Excel */
  precioUnidad: number
  /** Precio de la caja completa, en pesos */
  precioCaja?: number
}

export const CATEGORIAS_TERRAZAS: Categoria[] = [
  { id: 'cat-cerveza', nombre: 'Cerveza', orden: 1 },
  { id: 'cat-sangria', nombre: 'Sangría', orden: 2 },
  { id: 'cat-licores', nombre: 'Licores', orden: 3 },
  { id: 'cat-sinalcohol', nombre: 'Bebidas sin alcohol', orden: 4 },
  { id: 'cat-refrescos', nombre: 'Refrescos', orden: 5 },
]

export const CATALOGO_TERRAZAS: ProductoSemilla[] = [
  { id: 'prod-pilsen-1-4', nombre: 'Cerveza Pilsen 1/4', nombreCorto: 'Pilsen 1/4', categoriaId: 'cat-cerveza', orden: 0, contenido: 222, caja: 36, retornable: true, precioUnidad: 2500, precioCaja: 62000 },
  { id: 'prod-light-1-4', nombre: 'Cerveza Light 1/4', nombreCorto: 'Light 1/4', categoriaId: 'cat-cerveza', orden: 1, contenido: 222, caja: 36, retornable: true, precioUnidad: 2500, precioCaja: 62000 },
  { id: 'prod-solera-light-1-4', nombre: 'Cerveza Solera Light 1/4', nombreCorto: 'Solera Light 1/4', categoriaId: 'cat-cerveza', orden: 2, contenido: 222, caja: 36, retornable: true, precioUnidad: 2500, precioCaja: 62000 },
  { id: 'prod-solera-1-4', nombre: 'Cerveza Solera 1/4', nombreCorto: 'Solera 1/4', categoriaId: 'cat-cerveza', orden: 3, contenido: 222, caja: 36, retornable: true, precioUnidad: 3000, precioCaja: 70000 },
  { id: 'prod-tercio', nombre: 'Cerveza Tercio 330 ml', nombreCorto: 'Tercio', categoriaId: 'cat-cerveza', orden: 4, contenido: 330, caja: 24, retornable: true, precioUnidad: 3000, precioCaja: 58000 },
  { id: 'prod-lata-pilsen-250', nombre: 'Lata Pilsen 250 ml', nombreCorto: 'Lata Pilsen 250', categoriaId: 'cat-cerveza', orden: 5, contenido: 250, caja: 24, precioUnidad: 3000, precioCaja: 54000 },
  { id: 'prod-lata-pilsen-355', nombre: 'Lata Pilsen 355 ml', nombreCorto: 'Lata Pilsen 355', categoriaId: 'cat-cerveza', orden: 6, contenido: 355, caja: 24, precioUnidad: 3500, precioCaja: 65000 },
  { id: 'prod-lata-light-250', nombre: 'Lata Light 250 ml', nombreCorto: 'Lata Light 250', categoriaId: 'cat-cerveza', orden: 7, contenido: 250, caja: 24, precioUnidad: 3000, precioCaja: 54000 },
  { id: 'prod-lata-light-355', nombre: 'Lata Light 355 ml', nombreCorto: 'Lata Light 355', categoriaId: 'cat-cerveza', orden: 8, contenido: 355, caja: 24, precioUnidad: 3500, precioCaja: 65000 },
  { id: 'prod-lata-sol-light-250', nombre: 'Lata Solera Light 250 ml', nombreCorto: 'Lata Sol.Light 250', categoriaId: 'cat-cerveza', orden: 9, contenido: 250, caja: 24, precioUnidad: 3000, precioCaja: 54000 },
  { id: 'prod-lata-sol-light-355', nombre: 'Lata Solera Light 355 ml', nombreCorto: 'Lata Sol.Light 355', categoriaId: 'cat-cerveza', orden: 10, contenido: 355, caja: 24, precioUnidad: 3500, precioCaja: 65000 },
  { id: 'prod-lata-solera-250', nombre: 'Lata Solera 250 ml', nombreCorto: 'Lata Solera 250', categoriaId: 'cat-cerveza', orden: 11, contenido: 250, caja: 24, precioUnidad: 4000, precioCaja: 70000 },
  { id: 'prod-carorena-tinta', nombre: 'Caroreña Tinta 0.75 Lts.', nombreCorto: 'Caroreña Tinta', categoriaId: 'cat-sangria', orden: 12, contenido: 750, caja: 6, precioUnidad: 0, precioCaja: 0 },
  { id: 'prod-carorena-blanca', nombre: 'Caroreña Blanca 0.75 Lts.', nombreCorto: 'Caroreña Blanca', categoriaId: 'cat-sangria', orden: 13, contenido: 750, caja: 6, precioUnidad: 0, precioCaja: 0 },
  { id: 'prod-carorena-toronja', nombre: 'Caroreña Toronja 0.75 Lts.', nombreCorto: 'Caroreña Toronja', categoriaId: 'cat-sangria', orden: 14, contenido: 750, caja: 6, precioUnidad: 0, precioCaja: 0 },
  { id: 'prod-lqm-tinta', nombre: 'La Que Manda Tinta 0.75 Lts.', nombreCorto: 'LQM Tinta', categoriaId: 'cat-sangria', orden: 15, contenido: 750, caja: 6, precioUnidad: 0, precioCaja: 0 },
  { id: 'prod-lqm-blanca', nombre: 'La Que Manda Blanca 0.75 Lts.', nombreCorto: 'LQM Blanca', categoriaId: 'cat-sangria', orden: 16, contenido: 750, caja: 6, precioUnidad: 0, precioCaja: 0 },
  { id: 'prod-lata-carorena-t', nombre: 'Lata Caroreña Tinta 250 ml', nombreCorto: 'Lata Caroreña T.', categoriaId: 'cat-sangria', orden: 17, contenido: 250, caja: 24, precioUnidad: 0, precioCaja: 0 },
  { id: 'prod-lata-carorena-b', nombre: 'Lata Caroreña Blanca 250 ml', nombreCorto: 'Lata Caroreña B.', categoriaId: 'cat-sangria', orden: 18, contenido: 250, caja: 24, precioUnidad: 0, precioCaja: 0 },
  { id: 'prod-lata-lqm-tinta', nombre: 'Lata La Que Manda Tinta 250 ml', nombreCorto: 'Lata LQM Tinta', categoriaId: 'cat-sangria', orden: 19, contenido: 250, caja: 24, precioUnidad: 0, precioCaja: 0 },
  { id: 'prod-lata-lqm-blanca', nombre: 'Lata La Que Manda Blanca 250 ml', nombreCorto: 'Lata LQM Blanca', categoriaId: 'cat-sangria', orden: 20, contenido: 250, caja: 24, precioUnidad: 0, precioCaja: 0 },
  { id: 'prod-lata-mojito', nombre: 'Lata Mojito 355 ml', nombreCorto: 'Lata Mojito', categoriaId: 'cat-sangria', orden: 21, contenido: 355, caja: 24, precioUnidad: 0, precioCaja: 0 },
  { id: 'prod-cacique', nombre: 'Cacique 0.75 Lts.', nombreCorto: 'Cacique', categoriaId: 'cat-licores', orden: 22, contenido: 750, caja: 1, precioUnidad: 0 },
  { id: 'prod-cacique-500', nombre: 'Cacique 500 0.75 Lts.', nombreCorto: 'Cacique 500', categoriaId: 'cat-licores', orden: 23, contenido: 750, caja: 1, precioUnidad: 0 },
  { id: 'prod-santa-teresa', nombre: 'Santa Teresa 0.75 Lts.', nombreCorto: 'Santa Teresa', categoriaId: 'cat-licores', orden: 24, contenido: 750, caja: 1, precioUnidad: 0 },
  { id: 'prod-canamina', nombre: 'Canamina 0.75 Lts.', nombreCorto: 'Canamina', categoriaId: 'cat-licores', orden: 25, contenido: 750, caja: 1, precioUnidad: 0 },
  { id: 'prod-agua-355', nombre: 'Agua Minalva 355 ml', nombreCorto: 'Agua 355', categoriaId: 'cat-sinalcohol', orden: 26, contenido: 355, caja: 1, precioUnidad: 0 },
  { id: 'prod-agua-600', nombre: 'Agua Minalva 600 ml', nombreCorto: 'Agua 600', categoriaId: 'cat-sinalcohol', orden: 27, contenido: 600, caja: 1, precioUnidad: 0 },
  { id: 'prod-gatorade', nombre: 'Gatorade 500 ml', nombreCorto: 'Gatorade', categoriaId: 'cat-sinalcohol', orden: 28, contenido: 500, caja: 1, precioUnidad: 0 },
  { id: 'prod-soda-minalva', nombre: 'Soda Minalva 350 ml', nombreCorto: 'Soda Minalva', categoriaId: 'cat-sinalcohol', orden: 29, contenido: 350, caja: 1, precioUnidad: 0 },
  { id: 'prod-pepsi-2l', nombre: 'Pepsi 2 Lts.', nombreCorto: 'Pepsi 2L', categoriaId: 'cat-refrescos', orden: 30, contenido: 2000, caja: 1, precioUnidad: 0 },
  { id: 'prod-7up-2l', nombre: '7Up 2 Lts.', nombreCorto: '7Up 2L', categoriaId: 'cat-refrescos', orden: 31, contenido: 2000, caja: 1, precioUnidad: 0 },
  { id: 'prod-sabores-2l', nombre: 'Sabores 2 Lts.', nombreCorto: 'Sabores 2L', categoriaId: 'cat-refrescos', orden: 32, contenido: 2000, caja: 1, precioUnidad: 0 },
  { id: 'prod-pepsi-1l', nombre: 'Pepsi 1 Lts.', nombreCorto: 'Pepsi 1L', categoriaId: 'cat-refrescos', orden: 33, contenido: 1000, caja: 1, precioUnidad: 0 },
  { id: 'prod-7up-1l', nombre: '7Up 1 Lts.', nombreCorto: '7Up 1L', categoriaId: 'cat-refrescos', orden: 34, contenido: 1000, caja: 1, precioUnidad: 0 },
  { id: 'prod-sabores-1l', nombre: 'Sabores 1 Lts.', nombreCorto: 'Sabores 1L', categoriaId: 'cat-refrescos', orden: 35, contenido: 1000, caja: 1, precioUnidad: 0 },
]
