// Genera el Formato CAD en PDF escribiendo los datos sobre la plantilla oficial
// (la misma hoja que exporta Excel, con las celdas variables vacías).
// Usa las mismas fuentes y tamaños de "FORMATO CAD.xlsx", incrustadas en la plantilla:
//   C12 póliza → Calibri 11 (derecha) · D12 ramo → Calibri 11
//   E12 certificado, F12 folios → Verdana 8 (centrado) · J12 trámite → Verdana 8 negrita (centrado)
//   C39 nombre → Verdana 8 negrita · C41 fecha → Verdana 8 negrita (derecha)
// Requiere pdf-lib cargado como global (window.PDFLib o globalThis.PDFLib).
import { WIDTHS } from './metrics.js';

// Coordenadas en puntos PDF (origen abajo-izquierda), medidas en el PDF exportado por Excel.
// clip = límites de la celda: como en Excel, el texto que no cabe se corta en el borde.
const CAMPOS = {
  poliza:      { font: 'FC',  size: 11, y: 399.33, right: 298.92, clip: [210.8, 300.9] },
  ramo:        { font: 'FC',  size: 11, y: 399.33, left: 302.88,  clip: [300.9, 441.6] },
  certificado: { font: 'FV',  size: 8,  y: 399.33, center: 499.26, clip: [442.8, 554.9] },
  folios:      { font: 'FV',  size: 8,  y: 399.52, center: 577.69, clip: [556.1, 598.4] },
  tipo:        { font: 'FVB', size: 8,  y: 399.33, center: 706.14, clip: [680.5, 730.9] },
  nombre:      { font: 'FVB', size: 8,  y: 125.62, left: 212.05,   clip: [210.8, 441.6] },
  fecha:       { font: 'FVB', size: 8,  y: 92.83,  right: 299.61,  clip: [210.8, 441.6] },
};

// Tabla Windows-1252 para los códigos 0x80–0x9F
const CP1252_EXTRA = {
  0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A, 0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91,
  0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02DC: 0x98,
  0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C, 0x017E: 0x9E, 0x0178: 0x9F,
};

function aCp1252(texto) {
  const bytes = [];
  for (const ch of String(texto ?? '').normalize('NFC')) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x20 && cp <= 0x7e) bytes.push(cp);
    else if (cp >= 0xa0 && cp <= 0xff) bytes.push(cp);
    else if (CP1252_EXTRA[cp]) bytes.push(CP1252_EXTRA[cp]);
    else if (/\s/.test(ch)) bytes.push(0x20);
    // otros caracteres (emojis, etc.) se omiten
  }
  return bytes;
}

function ancho(font, bytes, size) {
  const w = WIDTHS[font];
  return bytes.reduce((s, b) => s + (w[b - 32] || 0), 0) * size / 1000;
}

function hex(bytes) {
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function fechaHoyBogota() {
  const parts = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t).value;
  return `${get('day')}/${get('month')}/${get('year')}`;
}

export async function generarCAD(plantillaBytes, datos) {
  const L = globalThis.PDFLib;
  const doc = await L.PDFDocument.load(plantillaBytes);
  const page = doc.getPage(0);

  const valores = {
    poliza: datos.poliza,
    ramo: datos.ramo,
    certificado: datos.certificado,
    folios: String(datos.folios ?? ''),
    tipo: datos.tipo,
    nombre: (datos.nombre || '').toUpperCase(),
    fecha: datos.fecha || fechaHoyBogota(),
  };

  const ops = [];
  for (const [k, c] of Object.entries(CAMPOS)) {
    const bytes = aCp1252(valores[k]);
    if (!bytes.length) continue;
    const w = ancho(c.font, bytes, c.size);
    let x = c.left;
    if (c.right != null) x = c.right - w;
    if (c.center != null) x = c.center - w / 2;
    const [cx0, cx1] = c.clip;
    ops.push(
      L.pushGraphicsState(),
      L.rectangle(cx0, c.y - 4, cx1 - cx0, c.size + 6),
      L.clip(),
      L.endPath(),
      L.beginText(),
      L.setFontAndSize(c.font, c.size),
      L.setFillingGrayscaleColor(0),
      L.moveText(x, c.y),
      L.showText(L.PDFHexString.of(hex(bytes))),
      L.endText(),
      L.popGraphicsState(),
    );
  }
  page.pushOperators(...ops);

  doc.setTitle(`FORMATO CAD ${valores.poliza}-${valores.certificado}`);
  doc.setProducer('Procesador de Pólizas');
  doc.setCreator('Procesador de Pólizas');
  return await doc.save();
}
