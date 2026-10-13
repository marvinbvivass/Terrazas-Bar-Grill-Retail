import { describe, expect, it } from 'vitest'
import { crc32, escribirZip } from './zip'

const texto = (b: Uint8Array) => new TextDecoder().decode(b)

describe('la suma de comprobación', () => {
  it('da el valor conocido del caso de prueba del estándar', () => {
    // '123456789' → 0xCBF43926. Es el ejemplo con el que se verifica cualquier
    // implementación de CRC-32; si esto falla, el ZIP sale corrupto y Excel
    // dice que el archivo está dañado sin decir por qué.
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('de nada es cero', () => {
    expect(crc32(new Uint8Array())).toBe(0)
  })
})

describe('el archivo ZIP', () => {
  const zip = escribirZip([
    { nombre: 'uno.txt', contenido: 'hola' },
    { nombre: 'carpeta/dos.xml', contenido: '<a/>' },
  ])

  it('empieza por la firma que lo identifica', () => {
    expect([...zip.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
  })

  it('termina con el fin del directorio', () => {
    const fin = zip.slice(zip.length - 22, zip.length - 18)
    expect([...fin]).toEqual([0x50, 0x4b, 0x05, 0x06])
  })

  it('lleva dentro los nombres y el contenido', () => {
    const todo = texto(zip)
    expect(todo).toContain('uno.txt')
    expect(todo).toContain('carpeta/dos.xml')
    expect(todo).toContain('hola')
  })

  it('generar dos veces lo mismo da dos archivos idénticos', () => {
    // La fecha de las entradas es fija a propósito: sin eso, dos descargas de
    // la misma semana darían archivos distintos y no habría forma de
    // comprobar en una prueba que el contenido es el que se espera.
    const otro = escribirZip([
      { nombre: 'uno.txt', contenido: 'hola' },
      { nombre: 'carpeta/dos.xml', contenido: '<a/>' },
    ])
    expect([...otro]).toEqual([...zip])
  })

  it('escribe los acentos en UTF-8', () => {
    const z = escribirZip([{ nombre: 'a.txt', contenido: 'canción' }])
    expect(texto(z)).toContain('canción')
  })
})
