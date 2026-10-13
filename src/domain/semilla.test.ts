import { describe, expect, it } from 'vitest'
import { PRECIO_SIN_DEFINIR, formulariosDeSemilla } from './semilla'
import { armarProducto } from './catalogo'
import { convertir } from './money'
import { CATALOGO_TERRAZAS, CATEGORIAS_TERRAZAS } from '../data/catalogoTerrazas'
import { CONTEXTO_CATALOGO } from '../data/seed'

const TASA = 4000

const de = (corto: string) => CATALOGO_TERRAZAS.find((p) => p.nombreCorto === corto)!

describe('el catálogo que vino del Excel', () => {
  it('trae los 36 productos del negocio', () => {
    expect(CATALOGO_TERRAZAS).toHaveLength(36)
  })

  it('no repite ningún identificador', () => {
    // Dos productos con el mismo id se pisarían al cargar y quedarían 35.
    const ids = new Set(CATALOGO_TERRAZAS.map((p) => p.id))
    expect(ids.size).toBe(36)
  })

  it('separa los refrescos de dos litros de los de uno', () => {
    // En el Excel aparecen como dos filas llamadas "PEPSI" a secas, una en el
    // bloque de 2 Lts y otra en el de 1 Lts. Con el mismo nombre, en la caja
    // serían dos botones idénticos a precios distintos.
    expect(de('Pepsi 2L').contenido).toBe(2000)
    expect(de('Pepsi 1L').contenido).toBe(1000)
  })

  it('el tercio va en caja de 24, no de 36', () => {
    // En el Excel estaba en el bloque de las de 36 y sus fórmulas lo contaban
    // así: una recarga de 10 cajas sumaba 360 botellas en vez de 240.
    expect(de('Tercio').caja).toBe(24)
  })

  it('llevan envase las botellas de vidrio que el camión se lleva de vuelta', () => {
    /*
     * No lo decide el tamaño de la caja: el tercio viene en caja de 24 y
     * también lleva envase. Lo decide que la botella sea retornable.
     */
    const conVacio = CATALOGO_TERRAZAS.filter((p) => p.retornable)
    expect(conVacio.map((p) => p.nombreCorto)).toEqual([
      'Pilsen 1/4',
      'Light 1/4',
      'Solera Light 1/4',
      'Solera 1/4',
      'Tercio',
    ])
  })

  it('ninguna lata lleva envase', () => {
    // La lata no vuelve: se va a la basura y no genera deuda con nadie.
    const latas = CATALOGO_TERRAZAS.filter((p) => p.nombreCorto.startsWith('Lata'))
    expect(latas.some((p) => p.retornable)).toBe(false)
  })

  it('lleva el contenido de los que no lo decían en el nombre', () => {
    // El Excel no lo traía: "1/4" y "Tercio" son la medida de toda la vida y
    // "Gatorade" a secas no dice nada. Los puso el dueño.
    expect(de('Pilsen 1/4').contenido).toBe(222)
    expect(de('Tercio').contenido).toBe(330)
    expect(de('Gatorade').contenido).toBe(500)
  })

  it('ninguno se queda sin contenido', () => {
    expect(CATALOGO_TERRAZAS.filter((p) => !p.contenido)).toEqual([])
  })

  it('las cinco categorías son las que usa el negocio', () => {
    expect(CATEGORIAS_TERRAZAS.map((c) => c.nombre)).toEqual([
      'Cerveza',
      'Sangría',
      'Licores',
      'Bebidas sin alcohol',
      'Refrescos',
    ])
  })

  it('cada producto apunta a una categoría que existe', () => {
    const ids = new Set(CATEGORIAS_TERRAZAS.map((c) => c.id))
    expect(CATALOGO_TERRAZAS.every((p) => ids.has(p.categoriaId))).toBe(true)
  })

  it('conserva el orden del Excel', () => {
    // Es el orden en que el encargado recorre el depósito; cambiarlo lo
    // obligaría a buscar cada producto en una lista que no reconoce.
    expect(CATALOGO_TERRAZAS.map((p) => p.orden)).toEqual(
      CATALOGO_TERRAZAS.map((_, i) => i),
    )
  })
})

describe('los precios al cargarlos', () => {
  const { formularios, sinPrecio, conVacio } = formulariosDeSemilla(CATALOGO_TERRAZAS, TASA)
  const forma = (corto: string) =>
    formularios.find((f) => f.nombreCorto === corto)!

  it('se guardan en dólares y vuelven a pesos iguales', () => {
    // Pilsen a 2.500 pesos con el dólar a 4.000
    expect(convertir(forma('Pilsen 1/4').precioDetal, 'COP', TASA)).toBe(2500)
  })

  it('la caja conserva su descuento, no se calcula multiplicando', () => {
    /*
     * 36 unidades sueltas son 90.000 pesos; la caja vale 62.000. Deducir el
     * precio de la caja multiplicando dejaría al mayorista pagando precio de
     * detal.
     */
    const caja = forma('Pilsen 1/4').presentaciones![0]!
    expect(caja.factor).toBe(36)
    expect(convertir(caja.precio, 'COP', TASA)).toBe(62000)
  })

  it('los que el Excel no tenía entran en un peso', () => {
    expect(convertir(forma('Caroreña Tinta').precioDetal, 'COP', TASA)).toBe(PRECIO_SIN_DEFINIR)
    expect(sinPrecio).toBe(24)
  })

  it('y su caja sale del precio de relleno, no en cero', () => {
    // Una caja a cero se vendería regalada sin que nada avisara.
    const caja = forma('Caroreña Tinta').presentaciones![0]!
    expect(convertir(caja.precio, 'COP', TASA)).toBe(PRECIO_SIN_DEFINIR * 6)
  })

  it('cuenta cuántos llevan envase, para poder decirlo antes de cargar', () => {
    expect(conVacio).toBe(5)
  })

  it('un producto suelto no inventa una caja', () => {
    expect(forma('Cacique').presentaciones).toEqual([])
  })

  it('sin tasa no se carga nada', () => {
    // Antes que guardar precios convertidos con una tasa inventada, no cargar.
    expect(() => formulariosDeSemilla(CATALOGO_TERRAZAS, 0)).toThrow()
  })
})

describe('los productos armados', () => {
  const { formularios } = formulariosDeSemilla(CATALOGO_TERRAZAS, TASA)
  const armados = formularios.map((f) => armarProducto(f, CONTEXTO_CATALOGO))

  it('salen del mismo armador que el formulario del catálogo', () => {
    // Si esta carga construyera los productos por su cuenta, el día que cambie
    // algo del catálogo habría dos sitios que arreglar y uno se quedaría atrás.
    const pilsen = armados.find((a) => a.producto.nombreCorto === 'Pilsen 1/4')!
    expect(pilsen.producto.iva).toBe(0)
    expect(pilsen.producto.activo).toBe(true)
    expect(pilsen.producto.costoPromedio).toBe(0)
  })

  it('cada uno tiene su unidad y, si vende por caja, su caja', () => {
    const pilsen = armados.find((a) => a.producto.nombreCorto === 'Pilsen 1/4')!
    expect(pilsen.presentaciones.map((p) => p.factor)).toEqual([1, 36])
    const cacique = armados.find((a) => a.producto.nombreCorto === 'Cacique')!
    expect(cacique.presentaciones.map((p) => p.factor)).toEqual([1])
  })

  it('los identificadores son estables, no aleatorios', () => {
    /*
     * Cargar dos veces tiene que dejar 36 productos, no 72. Con un id al azar
     * cada carga crearía un juego nuevo y el anterior quedaría de fantasma en
     * el inventario.
     */
    const otros = formulariosDeSemilla(CATALOGO_TERRAZAS, TASA).formularios.map((f) =>
      armarProducto(f, CONTEXTO_CATALOGO),
    )
    expect(otros.map((a) => a.producto.id)).toEqual(armados.map((a) => a.producto.id))
  })

  it('ninguno se queda sin precio de venta', () => {
    expect(armados.every((a) => a.precios.length > 0 && a.precios[0]!.precio > 0)).toBe(true)
  })
})
