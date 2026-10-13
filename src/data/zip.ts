/**
 * Un ZIP mínimo, para poder escribir archivos .xlsx.
 *
 * Un .xlsx es un ZIP con unos cuantos XML dentro, así que generar uno desde el
 * navegador necesita o una librería de medio megabyte o esto: ciento y pico de
 * líneas que escriben las entradas SIN COMPRIMIR.
 *
 * Sin comprimir es la decisión que ahorra todo lo demás. El formato ZIP admite
 * el método 0 —almacenado— y Excel lo abre igual; a cambio no hace falta
 * implementar deflate, que es la parte grande. Una semana de este negocio son
 * unas decenas de kilobytes de XML: comprimirlos ahorraría unos pocos, y el
 * archivo se descarga una vez a la semana.
 *
 * La fecha de las entradas es fija a propósito. Así, generar dos veces la misma
 * semana produce dos archivos idénticos byte por byte, que es lo que permite
 * comprobarlo en una prueba.
 */

export interface ArchivoZip {
  nombre: string
  contenido: string
}

/** 1 de enero de 1980, el cero del formato: fecha y hora en formato DOS */
const FECHA_DOS = 0x0021
const HORA_DOS = 0x0000

const TABLA_CRC = (() => {
  const tabla = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabla[i] = c >>> 0
  }
  return tabla
})()

export function crc32(datos: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < datos.length; i++) {
    c = TABLA_CRC[(c ^ datos[i]!) & 0xff]! ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

/** Escribe enteros en little-endian, que es como los lee el formato */
class Buzon {
  private partes: Uint8Array[] = []
  private largo = 0

  bytes(b: Uint8Array): void {
    this.partes.push(b)
    this.largo += b.length
  }

  u16(n: number): void {
    this.bytes(new Uint8Array([n & 0xff, (n >>> 8) & 0xff]))
  }

  u32(n: number): void {
    this.bytes(new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]))
  }

  get posicion(): number {
    return this.largo
  }

  unir(): Uint8Array {
    const salida = new Uint8Array(this.largo)
    let i = 0
    for (const p of this.partes) {
      salida.set(p, i)
      i += p.length
    }
    return salida
  }
}

export function escribirZip(archivos: ArchivoZip[]): Uint8Array {
  const utf8 = new TextEncoder()
  const cuerpo = new Buzon()
  const directorio: Array<{ nombre: Uint8Array; crc: number; largo: number; desde: number }> = []

  for (const a of archivos) {
    const nombre = utf8.encode(a.nombre)
    const datos = utf8.encode(a.contenido)
    const desde = cuerpo.posicion

    cuerpo.u32(0x04034b50) // firma de entrada local
    cuerpo.u16(20) // versión necesaria
    cuerpo.u16(0x0800) // los nombres van en UTF-8
    cuerpo.u16(0) // método 0: almacenado
    cuerpo.u16(HORA_DOS)
    cuerpo.u16(FECHA_DOS)
    cuerpo.u32(crc32(datos))
    cuerpo.u32(datos.length) // comprimido
    cuerpo.u32(datos.length) // sin comprimir: el mismo, claro
    cuerpo.u16(nombre.length)
    cuerpo.u16(0) // sin extras
    cuerpo.bytes(nombre)
    cuerpo.bytes(datos)

    directorio.push({ nombre, crc: crc32(datos), largo: datos.length, desde })
  }

  const inicioDirectorio = cuerpo.posicion
  for (const e of directorio) {
    cuerpo.u32(0x02014b50) // firma de entrada del directorio
    cuerpo.u16(20) // versión que lo creó
    cuerpo.u16(20) // versión necesaria
    cuerpo.u16(0x0800)
    cuerpo.u16(0)
    cuerpo.u16(HORA_DOS)
    cuerpo.u16(FECHA_DOS)
    cuerpo.u32(e.crc)
    cuerpo.u32(e.largo)
    cuerpo.u32(e.largo)
    cuerpo.u16(e.nombre.length)
    cuerpo.u16(0) // extras
    cuerpo.u16(0) // comentario
    cuerpo.u16(0) // disco
    cuerpo.u16(0) // atributos internos
    cuerpo.u32(0) // atributos externos
    cuerpo.u32(e.desde)
    cuerpo.bytes(e.nombre)
  }

  const largoDirectorio = cuerpo.posicion - inicioDirectorio

  cuerpo.u32(0x06054b50) // fin del directorio
  cuerpo.u16(0) // disco
  cuerpo.u16(0) // disco donde empieza el directorio
  cuerpo.u16(directorio.length)
  cuerpo.u16(directorio.length)
  cuerpo.u32(largoDirectorio)
  cuerpo.u32(inicioDirectorio)
  cuerpo.u16(0) // comentario

  return cuerpo.unir()
}
