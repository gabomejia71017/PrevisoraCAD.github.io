// Genera el Formato CAD en PDF escribiendo los datos sobre la plantilla oficial
// (la misma hoja que exportaba Excel, con las celdas variables vacías).
// Requiere pdf-lib cargado como global (window.PDFLib o globalThis.PDFLib).

const POS = {
  // Coordenadas en puntos PDF (origen abajo-izquierda), tomadas del PDF que generaba Excel
  poliza:      { right: 299.1, y: 399.33, size: 10, bold: false },          // Col. 4 (alineado a la derecha)
  ramo:        { left: 302.9, y: 399.33, size: 10, bold: false, maxW: 136 }, // Col. 5
  certificado: { center: 499.3, y: 399.33, size: 8.5, bold: false, maxW: 108 }, // Col. 6
  folios:      { center: 577.7, y: 399.52, size: 8.5, bold: false, maxW: 38 },  // Col. 7
  tipo:        { center: 706.1, y: 399.33, size: 8.5, bold: true,  maxW: 46 },  // Col. 9
  nombre:      { left: 212.05, y: 125.62, size: 8.5, bold: true, maxW: 215 },
  fecha:       { center: 271.1, y: 92.83, size: 8.5, bold: true },
};

// Reduce la letra hasta un mínimo legible; si aún no cabe, recorta (como hace Excel al llegar al borde de la celda)
function ajustar(font, text, size, maxW, minSize = 7) {
  if (!maxW) return { text, size };
  let s = size;
  while (s > minSize && font.widthOfTextAtSize(text, s) > maxW) s -= 0.25;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t, s) > maxW) t = t.slice(0, -1);
  return { text: t.trimEnd(), size: s };
}

export function fechaHoyBogota() {
  const parts = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t).value;
  return `${get('day')}/${get('month')}/${get('year')}`;
}

// Quita caracteres que la fuente estándar no puede dibujar
function seguro(text) {
  return String(text ?? '').normalize('NFC').replace(/[^\x20-\x7E -ÿ]/g, '');
}

export async function generarCAD(plantillaBytes, datos) {
  const { PDFDocument, StandardFonts, rgb } = globalThis.PDFLib;
  const doc = await PDFDocument.load(plantillaBytes);
  const page = doc.getPage(0);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const valores = {
    poliza: datos.poliza,
    ramo: datos.ramo,
    certificado: datos.certificado,
    folios: String(datos.folios),
    tipo: datos.tipo,
    nombre: (datos.nombre || '').toUpperCase(),
    fecha: datos.fecha || fechaHoyBogota(),
  };

  for (const [k, pos] of Object.entries(POS)) {
    const raw = seguro(valores[k]);
    if (!raw) continue;
    const font = pos.bold ? bold : regular;
    const { text, size } = ajustar(font, raw, pos.size, pos.maxW);
    const w = font.widthOfTextAtSize(text, size);
    let x = pos.left;
    if (pos.right != null) x = pos.right - w;
    if (pos.center != null) x = pos.center - w / 2;
    page.drawText(text, { x, y: pos.y, size, font, color: rgb(0, 0, 0) });
  }

  doc.setTitle(`FORMATO CAD ${valores.poliza}-${valores.certificado}`);
  doc.setProducer('Procesador de Pólizas');
  return await doc.save();
}
