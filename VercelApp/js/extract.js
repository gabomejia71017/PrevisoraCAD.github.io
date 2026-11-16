// Extracción de datos de la póliza (número, certificado, ramo) a partir del texto del PDF.
// Replica la lógica del aplicativo original en Python (pdfplumber), adaptada a pdf.js.

// Convierte los items de pdf.js en "palabras" con coordenadas tipo pdfplumber (x0, top).
export function itemsToWords(items, pageHeight) {
  const words = [];
  for (const it of items) {
    const str = it.str || '';
    if (!str.trim()) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    const fontH = Math.hypot(it.transform[2], it.transform[3]) || 8;
    const top = pageHeight - y - fontH;
    const len = str.length || 1;
    const re = /\S+/g;
    let m;
    while ((m = re.exec(str))) {
      words.push({
        text: m[0],
        x0: x + (it.width * m.index) / len,
        top,
      });
    }
  }
  // Orden de lectura (arriba→abajo, izquierda→derecha), como pdfplumber
  words.sort((a, b) => (Math.abs(a.top - b.top) > 3 ? a.top - b.top : a.x0 - b.x0));
  return words;
}

export function extraerPoliza(words) {
  for (const w of words) {
    const t = w.text.toUpperCase();
    if (t.includes('POLIZA') || t.includes('PÓLIZA')) {
      const cands = words
        .filter(w2 => Math.abs(w2.x0 - w.x0) < 150 && w2.top > w.top && w2.top < w.top + 150 && /^\d{6,}$/.test(w2.text))
        .sort((a, b) => a.top - b.top);
      if (cands.length) return cands[0].text;
    }
  }
  return '';
}

export function extraerCertificado(words) {
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i].text.toUpperCase();
    const w2 = words[i + 1].text.toUpperCase();
    if (w1.includes('N') && w2.includes('CERTIFICADO')) {
      const ref = words[i + 1];
      const cands = words
        .filter(w => Math.abs(w.x0 - ref.x0) < 40 && w.top > ref.top && w.top < ref.top + 120 && /^\d{1,4}$/.test(w.text))
        .sort((a, b) => a.top - b.top);
      if (cands.length) return cands[0].text;
    }
  }
  return '';
}

export function limpiarTexto(t) {
  return String(t)
    .replace(/_x000d_/g, '')
    .replace(/[\r\n]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extraerRamo(texto) {
  const m = texto.match(/SEGURO\s+(.*?)\s+P[ÓO]LIZA/i);
  return m ? m[1].trim() : '';
}

// Respaldo por texto, por si la posición no funciona en algún formato de póliza.
export function polizaPorTexto(texto) {
  const m = texto.match(/P[ÓO]LIZA\s*N\S*\s.*?\b(\d{6,})\b/i);
  return m ? m[1] : '';
}
export function certificadoPorTexto(texto) {
  const m = texto.match(/\b(?:EXPEDICI[ÓO]N|RENOVACI[ÓO]N|MODIFICACI[ÓO]N|CANCELACI[ÓO]N|PRORROGA|PRÓRROGA)\s+(\d{1,4})\b/i);
  return m ? m[1] : '';
}

export function analizarTexto({ wordsPagina1, textoCompleto }) {
  const texto = limpiarTexto(textoCompleto);
  let poliza = extraerPoliza(wordsPagina1) || polizaPorTexto(texto);
  let certificado = extraerCertificado(wordsPagina1) || certificadoPorTexto(texto);
  const ramo = extraerRamo(texto);
  return { poliza, certificado, ramo };
}

export function tipoTramite(certificado) {
  const n = parseInt(certificado, 10);
  return !isNaN(n) && n === 0 ? 'PD' : 'SD';
}
