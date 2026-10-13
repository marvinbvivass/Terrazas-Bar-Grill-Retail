import { escribirZip } from './zip'

/**
 * Escribir un .xlsx.
 *
 * Lo justo para sacar una hoja de cálculo de verdad —con sus fórmulas vivas,
 * no una tabla muerta— sin arrastrar una librería de medio megabyte a una
 * aplicación que se instala en un teléfono.
 *
 * Las fórmulas se escriben SIN valor calculado. Excel las recalcula al abrir y
 * enseña el resultado; si se escribiera un valor y la fórmula no cuadrara con
 * él, el archivo mentiría hasta que alguien tocara una celda. Así el número que
 * se ve siempre sale de la fórmula que está al lado.
 */

export type Estilo = 'normal' | 'fuerte' | 'cabecera' | 'grupo' | 'apagado' | 'dinero'

export type Celda =
  | { tipo: 'texto'; valor: string; estilo?: Estilo }
  | { tipo: 'numero'; valor: number; estilo?: Estilo }
  | { tipo: 'formula'; formula: string; estilo?: Estilo }
  | null

export interface HojaExcel {
  nombre: string
  filas: Celda[][]
  /** Ancho de cada columna, en caracteres. Las que falten van por defecto. */
  anchos?: number[]
  /** Rangos combinados, como 'A1:C1' */
  combinadas?: string[]
  /** Celda a partir de la cual se desplaza: 'B4' deja fija la columna A y tres filas */
  congelar?: string
}

const ESTILOS: Estilo[] = ['normal', 'fuerte', 'cabecera', 'grupo', 'apagado', 'dinero']

export function letraDeColumna(indice: number): string {
  let n = indice + 1
  let salida = ''
  while (n > 0) {
    const resto = (n - 1) % 26
    salida = String.fromCharCode(65 + resto) + salida
    n = Math.floor((n - resto) / 26)
  }
  return salida
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function celdaXml(ref: string, celda: Celda): string {
  if (!celda) return ''
  const s = celda.estilo ? ` s="${ESTILOS.indexOf(celda.estilo)}"` : ''
  if (celda.tipo === 'formula') {
    return `<c r="${ref}"${s}><f>${escapar(celda.formula)}</f></c>`
  }
  if (celda.tipo === 'numero') {
    // Un NaN o un infinito escrito tal cual deja el archivo ilegible para Excel
    const v = Number.isFinite(celda.valor) ? celda.valor : 0
    return `<c r="${ref}"${s}><v>${v}</v></c>`
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapar(celda.valor)}</t></is></c>`
}

function hojaXml(hoja: HojaExcel): string {
  const filas = hoja.filas
    .map((celdas, i) => {
      const contenido = celdas
        .map((c, j) => celdaXml(`${letraDeColumna(j)}${i + 1}`, c))
        .join('')
      return contenido === '' ? '' : `<row r="${i + 1}">${contenido}</row>`
    })
    .join('')

  const cols = hoja.anchos?.length
    ? `<cols>${hoja.anchos
        .map((ancho, i) => `<col min="${i + 1}" max="${i + 1}" width="${ancho}" customWidth="1"/>`)
        .join('')}</cols>`
    : ''

  const panel = hoja.congelar
    ? `<pane xSplit="${columnaDe(hoja.congelar)}" ySplit="${filaDe(hoja.congelar)}" topLeftCell="${hoja.congelar}" activePane="bottomRight" state="frozen"/>`
    : ''

  const combinadas = hoja.combinadas?.length
    ? `<mergeCells count="${hoja.combinadas.length}">${hoja.combinadas
        .map((r) => `<mergeCell ref="${r}"/>`)
        .join('')}</mergeCells>`
    : ''

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0">${panel}</sheetView></sheetViews>${cols}<sheetData>${filas}</sheetData>${combinadas}</worksheet>`
}

/** 'B4' → 1 columna congelada */
function columnaDe(ref: string): number {
  const letras = ref.replace(/[0-9]/g, '')
  let n = 0
  for (const l of letras) n = n * 26 + (l.charCodeAt(0) - 64)
  return n - 1
}

function filaDe(ref: string): number {
  return Number(ref.replace(/[^0-9]/g, '')) - 1
}

const ESTILOS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="9"/><color rgb="FF555555"/><name val="Calibri"/></font><font><sz val="9"/><color rgb="FF888888"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF1F4E79"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEDEDED"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F1"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="4" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`

export function construirXlsx(hojas: HojaExcel[]): Uint8Array {
  const refs = hojas
    .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
    .join('')

  const archivos = [
    {
      nombre: '[Content_Types].xml',
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${hojas
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    },
    {
      nombre: '_rels/.rels',
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      nombre: 'xl/workbook.xml',
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas
        .map((h, i) => `<sheet name="${escapar(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
    },
    {
      nombre: 'xl/_rels/workbook.xml.rels',
      contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${refs}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    },
    { nombre: 'xl/styles.xml', contenido: ESTILOS_XML },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, contenido: hojaXml(h) })),
  ]

  return escribirZip(archivos)
}

/** Dispara la descarga en el navegador */
export function descargar(nombre: string, datos: Uint8Array): void {
  const blob = new Blob([datos as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Sin esto el blob se queda en memoria hasta que se recargue la página
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
