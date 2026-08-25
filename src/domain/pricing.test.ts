import { describe, expect, it } from 'vitest'
import { preciosDisponibles, resolverPrecio, siguienteEscalon } from './pricing'
import { BOTELLA, CATALOGO, LISTA_MAYOR, NEVERA, SALA, SIXPACK } from './fixtures'

const ctxBase = {
  presentacionId: BOTELLA.id,
  cantidadBase: 1,
  ubicacionId: SALA.id,
  tipoCliente: 'detal' as const,
  momento: 1_700_000_000_000,
}

describe('resolverPrecio', () => {
  // Los tres casos de abajo son exactamente los que se verificaron contra
  // PostgreSQL 16 llamando a resolver_precio(). Si divergen, la caja calcula
  // offline un precio que el servidor rechaza.
  it('una botella en sala cuesta 1,00 (lista Detal)', () => {
    const r = resolverPrecio(ctxBase, CATALOGO)
    expect(r?.precio).toBe(1.0)
    expect(r?.listaNombre).toBe('Detal')
  })

  it('la misma botella sacada de la nevera cuesta 1,25 (lista Frío)', () => {
    const r = resolverPrecio({ ...ctxBase, ubicacionId: NEVERA.id }, CATALOGO)
    expect(r?.precio).toBe(1.25)
    expect(r?.listaNombre).toBe('Frío')
  })

  it('36 botellas o más cuestan 0,80 (lista Mayor)', () => {
    const r = resolverPrecio({ ...ctxBase, cantidadBase: 36 }, CATALOGO)
    expect(r?.precio).toBe(0.8)
    expect(r?.listaNombre).toBe('Mayor')
  })

  it('35 botellas todavía no alcanzan el mayoreo', () => {
    expect(resolverPrecio({ ...ctxBase, cantidadBase: 35 }, CATALOGO)?.precio).toBe(1.0)
  })

  it('gana la prioridad más baja: mayor (20) le gana a frío (50)', () => {
    const r = resolverPrecio({ ...ctxBase, cantidadBase: 36, ubicacionId: NEVERA.id }, CATALOGO)
    expect(r?.listaNombre).toBe('Mayor')
    expect(r?.precio).toBe(0.8)
  })

  it('el six-pack tiene su propio precio, no es 6 × la botella', () => {
    expect(resolverPrecio({ ...ctxBase, presentacionId: SIXPACK.id }, CATALOGO)?.precio).toBe(5.7)
    expect(
      resolverPrecio({ ...ctxBase, presentacionId: SIXPACK.id, ubicacionId: NEVERA.id }, CATALOGO)?.precio,
    ).toBe(7.0)
  })

  it('devuelve null si la presentación no tiene ninguna lista aplicable', () => {
    expect(resolverPrecio({ ...ctxBase, presentacionId: 'pres-inexistente' }, CATALOGO)).toBeNull()
  })

  it('ignora las listas desactivadas', () => {
    const catalogo = {
      ...CATALOGO,
      listas: CATALOGO.listas.map((l) => (l.id === LISTA_MAYOR.id ? { ...l, activo: false } : l)),
    }
    expect(resolverPrecio({ ...ctxBase, cantidadBase: 100 }, catalogo)?.precio).toBe(1.0)
  })

  it('respeta la vigencia: un precio futuro no aplica todavía', () => {
    const futuro = ctxBase.momento + 86_400_000
    const catalogo = {
      ...CATALOGO,
      precios: [
        ...CATALOGO.precios,
        {
          id: 'p-nuevo',
          listaId: 'lst-detal',
          presentacionId: BOTELLA.id,
          precio: 1.4,
          vigenteDesde: futuro,
          vigenteHasta: null,
        },
      ],
    }
    expect(resolverPrecio(ctxBase, catalogo)?.precio).toBe(1.0)
    expect(resolverPrecio({ ...ctxBase, momento: futuro + 1 }, catalogo)?.precio).toBe(1.4)
  })

  it('un precio vencido deja de aplicar', () => {
    const catalogo = {
      ...CATALOGO,
      precios: CATALOGO.precios.map((p) =>
        p.id === 'p1' ? { ...p, vigenteHasta: ctxBase.momento - 1 } : p,
      ),
    }
    expect(resolverPrecio(ctxBase, catalogo)).toBeNull()
  })
})

describe('siguienteEscalon', () => {
  it('avisa cuánto falta para el precio de mayor', () => {
    const e = siguienteEscalon({ ...ctxBase, cantidadBase: 30 }, CATALOGO)
    expect(e).toEqual({ faltan: 6, precio: 0.8, lista: 'Mayor' })
  })

  it('no avisa nada cuando ya se alcanzó el mejor precio', () => {
    expect(siguienteEscalon({ ...ctxBase, cantidadBase: 40 }, CATALOGO)).toBeNull()
  })
})

describe('preciosDisponibles', () => {
  it('lista las listas aplicables por ubicación, ordenadas por prioridad', () => {
    const enSala = preciosDisponibles(BOTELLA.id, SALA.id, ctxBase.momento, CATALOGO)
    expect(enSala.map((p) => p.lista.nombre)).toEqual(['Mayor', 'Detal'])

    const enNevera = preciosDisponibles(BOTELLA.id, NEVERA.id, ctxBase.momento, CATALOGO)
    expect(enNevera.map((p) => p.lista.nombre)).toEqual(['Mayor', 'Frío', 'Detal'])
  })
})
