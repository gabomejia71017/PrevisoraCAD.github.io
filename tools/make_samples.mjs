// Genera carpetas de ejemplo con DATOS FICTICIOS para probar el Procesador de Pólizas.
import fs from 'fs';
import path from 'path';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';

const OUT = process.argv[2];
const EJEMPLOS = [
  { carpeta: 'EJEMPLO AU 9000101', poliza: '9000101', cert: '0', ramo: 'AUTOMOVILES', producto: 'POLIZA COLECTIVA', tramite: 'EXPEDICION',
    docs: ['Cupon de pago AU 9000101 (ejemplo).pdf', 'Cedula tomador (ejemplo).pdf', 'Tarjeta de propiedad (ejemplo).pdf'] },
  { carpeta: 'EJEMPLO TRC 9000202', poliza: '9000202', cert: '3', ramo: 'TODO RIESGO CONTRATISTA', producto: 'PÓLIZA DE DAÑOS', tramite: 'RENOVACION',
    docs: ['Cupon de pago TRC 9000202 (ejemplo).pdf', 'RUT (ejemplo).pdf', 'SARLAFT (ejemplo).pdf', 'Camara de comercio (ejemplo).pdf', 'Aceptacion slip (ejemplo).pdf'] },
  { carpeta: 'EJEMPLO PREVIHOGAR 9000303', poliza: '9000303', cert: '7', ramo: 'PREVIHOGAR', producto: 'PÓLIZA MULTIRIESGO', tramite: 'RENOVACION',
    docs: ['Cupon de pago PH 9000303 (ejemplo).pdf', 'Solicitud de renovacion (ejemplo).pdf', 'SARLAFT (ejemplo).pdf'] },
  { carpeta: 'EJEMPLO RC HIDROCARBUROS 9000404', poliza: '9000404', cert: '1', ramo: 'RESPONSABILIDAD CIVIL', producto: 'PÓLIZA RESPONSABILIDAD CIVIL', tramite: 'RENOVACION',
    docs: ['Cupon de pago RCHD 9000404 (ejemplo).pdf', 'Formato RC hidrocarburos (ejemplo).pdf', 'Reporte de inspeccion (ejemplo).pdf', 'Cedula (ejemplo).pdf'] },
];

const PURPLE = rgb(0.353, 0.169, 0.431);
const GRAY = rgb(0.45, 0.45, 0.45);

function marcaDeAgua(page, bold) {
  const { width, height } = page.getSize();
  page.drawText('DATOS FICTICIOS · SOLO PARA PRUEBAS', {
    x: width * 0.1, y: height * 0.22, size: 28, font: bold, color: rgb(0.9, 0.22, 0.56), opacity: 0.16, rotate: degrees(35),
  });
}

async function poliza(e) {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const b = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);
  const T = (t, x, top, size = 9, font = f, color = rgb(0, 0, 0)) => page.drawText(t, { x, y: 792 - top - size, size, font, color });
  // Orden de dibujo pensado para la lectura automática:
  // "PÓLIZA N°" con el número debajo, "N° CERTIFICADO" con el número debajo,
  // y el texto "SEGURO <ramo> PÓLIZA ..." seguido.
  T('PÓLIZA N°', 40, 40, 8, b);
  T(e.poliza, 40, 54, 12, b);
  T('SEGURO', 150, 40, 8, b);
  T(e.ramo, 150, 54, 11, b, PURPLE);
  T(e.producto, 150, 70, 9, f);
  T('N°', 420, 40, 8, b);
  T('CERTIFICADO', 433, 40, 8, b);
  T(e.cert, 433, 54, 11, b);
  T('TIPO DE TRÁMITE', 510, 40, 8, b);
  T(e.tramite, 510, 54, 9, f);
  page.drawLine({ start: { x: 36, y: 792 - 90 }, end: { x: 576, y: 792 - 90 }, thickness: 1, color: GRAY });
  T('DOCUMENTO DE PRUEBA', 40, 110, 14, b, PURPLE);
  const lineas = [
    'Este archivo fue generado para probar el Procesador de Pólizas.',
    'Todos los datos son ficticios: no corresponde a ninguna póliza, cliente ni compañía real.',
    '',
    'TOMADOR:      CLIENTE DE PRUEBA S.A.S.',
    'ASEGURADO:    CLIENTE DE PRUEBA S.A.S.',
    'DIRECCIÓN:    CALLE FALSA 123, MANIZALES, CALDAS',
    'VIGENCIA:     01/01/2026 A 01/01/2027',
  ];
  lineas.forEach((l, i) => T(l, 40, 140 + i * 16, 10));
  marcaDeAgua(page, b);
  doc.setTitle(`Póliza de prueba ${e.poliza}`);
  doc.setProducer('Procesador de Pólizas - ejemplo');
  return doc.save();
}

async function anexo(nombre, e) {
  const doc = await PDFDocument.create();
  const f = await doc.embedFont(StandardFonts.Helvetica);
  const b = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);
  page.drawText(nombre.replace(/\.pdf$/i, '').toUpperCase(), { x: 40, y: 730, size: 16, font: b, color: PURPLE });
  page.drawText(`Documento de ejemplo de la póliza ficticia ${e.poliza} (${e.ramo}).`, { x: 40, y: 700, size: 11, font: f });
  page.drawText('Sirve para comprobar el conteo de folios y los adjuntos del correo.', { x: 40, y: 682, size: 11, font: f });
  marcaDeAgua(page, b);
  doc.setTitle(nombre);
  doc.setProducer('Procesador de Pólizas - ejemplo');
  return doc.save();
}

const manifest = [];
for (const e of EJEMPLOS) {
  const dir = path.join(OUT, e.carpeta);
  fs.mkdirSync(dir, { recursive: true });
  const archivos = [];
  const pol = `+POLIZA ${e.poliza}-${e.cert}.pdf`;
  fs.writeFileSync(path.join(dir, pol), await poliza(e)); archivos.push(pol);
  for (const d of e.docs) { fs.writeFileSync(path.join(dir, d), await anexo(d, e)); archivos.push(d); }
  manifest.push({ carpeta: e.carpeta, ramo: e.ramo, poliza: e.poliza, certificado: e.cert, archivos, zip: `${e.carpeta}.zip` });
}
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest.map(m => [m.carpeta, m.archivos.length])));
