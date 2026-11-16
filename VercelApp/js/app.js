import * as pdfjsLib from '../vendor/pdf.min.mjs';
import { itemsToWords, analizarTexto, tipoTramite } from './extract.js';
import { generarCAD, fechaHoyBogota } from './cad.js';
import { construirEml } from './eml.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;

const LIMITE_CORREO_MB = 20;
const IGNORAR = /^(\.|~\$)|^(thumbs\.db|desktop\.ini)$/i;

const $ = sel => document.querySelector(sel);
const dropZone = $('#drop-zone');
const folderInput = $('#folder-input');
const results = $('#results');
const tpl = $('#card-tpl');
const nombreInput = $('#nombre');
const paraInput = $('#para');

// ---------- Preferencias (se recuerdan en este navegador) ----------
const store = {
  get(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};
nombreInput.value = store.get('cad.nombre');
paraInput.value = store.get('cad.para');
nombreInput.addEventListener('input', () => { store.set('cad.nombre', nombreInput.value.trim()); nombreInput.closest('.field').classList.remove('invalid'); refreshAll(); });
paraInput.addEventListener('input', () => store.set('cad.para', paraInput.value.trim()));

let plantillaPromise = null;
function plantilla() {
  plantillaPromise ??= fetch('assets/plantilla_cad.pdf').then(r => {
    if (!r.ok) throw new Error('No se pudo cargar la plantilla del Formato CAD.');
    return r.arrayBuffer();
  });
  return plantillaPromise;
}
plantilla().catch(() => {});

// ---------- Entrada de carpetas ----------
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev =>
  document.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }));
['dragenter', 'dragover'].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.add('dragover')));
['dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.remove('dragover')));

dropZone.addEventListener('click', () => folderInput.click());
dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); folderInput.click(); } });

dropZone.addEventListener('drop', async e => {
  const entries = [...(e.dataTransfer?.items || [])]
    .filter(i => i.kind === 'file')
    .map(i => i.webkitGetAsEntry && i.webkitGetAsEntry())
    .filter(Boolean);
  const sueltos = [];
  for (const entry of entries) {
    if (entry.isDirectory) {
      const files = await leerCarpeta(entry);
      procesarCarpeta(entry.name, files);
    } else {
      sueltos.push(entry.name);
    }
  }
  if (sueltos.length) avisoSuelto(sueltos);
});

folderInput.addEventListener('change', () => {
  const grupos = new Map();
  for (const f of folderInput.files) {
    const rel = f.webkitRelativePath || f.name;
    const raiz = rel.split('/')[0];
    if (!grupos.has(raiz)) grupos.set(raiz, []);
    grupos.get(raiz).push({ file: f, path: rel });
  }
  for (const [nombre, files] of grupos) procesarCarpeta(nombre, files);
  folderInput.value = '';
});

async function leerCarpeta(dirEntry) {
  const out = [];
  async function walk(entry, prefix) {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      out.push({ file, path: prefix + entry.name });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      // readEntries devuelve los archivos por lotes: hay que leer hasta que llegue vacío
      for (;;) {
        const batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const child of batch) await walk(child, prefix + entry.name + '/');
      }
    }
  }
  await walk(dirEntry, '');
  return out;
}

function avisoSuelto(nombres) {
  const card = nuevaTarjeta(nombres.join(', '));
  error(card, 'Arrastra la carpeta completa de la póliza, no archivos sueltos.');
}

// ---------- Procesamiento ----------
function procesarCarpeta(nombreCarpeta, entradas) {
  dropZone.classList.add('compact');
  const archivos = entradas
    .filter(({ file }) => !IGNORAR.test(file.name))
    .sort((a, b) => a.path.localeCompare(b.path, 'es', { numeric: true }));
  const polizas = archivos.filter(({ file }) => /^\+POLIZA/i.test(file.name) && /\.pdf$/i.test(file.name));

  if (!polizas.length) {
    const card = nuevaTarjeta(nombreCarpeta);
    error(card, `La carpeta no contiene una póliza válida (un PDF cuyo nombre empiece por "+POLIZA").`);
    return;
  }
  for (const pol of polizas) {
    const card = nuevaTarjeta(polizas.length > 1 ? `${nombreCarpeta} / ${pol.file.name}` : nombreCarpeta);
    analizarPoliza(card, pol, archivos).catch(err => {
      console.error(err);
      error(card, 'No se pudo leer la póliza. Revisa que el PDF no esté dañado o protegido con contraseña.');
    });
  }
}

function nuevaTarjeta(titulo) {
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.querySelector('.folder-name').textContent = titulo;
  node.querySelector('.folder-name').title = titulo;
  results.prepend(node);
  return node;
}

function error(card, msg) {
  const b = card.querySelector('.badge');
  b.textContent = 'Error';
  b.className = 'badge error';
  const p = card.querySelector('.error');
  p.textContent = msg;
  p.classList.remove('hidden');
}

async function leerTextoPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data, verbosity: 0 });
  const doc = await loadingTask.promise;
  let textoCompleto = '';
  let wordsPagina1 = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    if (p === 1) {
      const [, y0, , y1] = page.view;
      wordsPagina1 = itemsToWords(tc.items, y1 - y0);
    }
    textoCompleto += tc.items.map(i => i.str + (i.hasEOL ? '\n' : ' ')).join('') + '\n';
  }
  await doc.cleanup?.();
  await loadingTask.destroy();
  return { wordsPagina1, textoCompleto };
}

async function analizarPoliza(card, pol, archivos) {
  const datos = analizarTexto(await leerTextoPdf(pol.file));
  const state = {
    archivos,
    poliza: pol,
    valores: {
      poliza: datos.poliza,
      certificado: datos.certificado,
      ramo: datos.ramo,
      folios: String(archivos.length),
      tipo: tipoTramite(datos.certificado),
    },
  };
  card._state = state;

  for (const input of card.querySelectorAll('[data-k]')) {
    input.value = state.valores[input.dataset.k] ?? '';
    input.addEventListener('input', () => {
      state.valores[input.dataset.k] = input.value.trim();
      if (input.dataset.k === 'certificado') {
        state.valores.tipo = tipoTramite(input.value);
        card.querySelector('[data-k="tipo"]').value = state.valores.tipo;
      }
      refresh(card);
    });
  }

  card.querySelector('[data-act="cad"]').addEventListener('click', () => accion(card, descargarCAD));
  card.querySelector('[data-act="mail"]').addEventListener('click', () => accion(card, prepararCorreo));
  card.querySelector('[data-act="copy"]').addEventListener('click', () => copiarTexto(card));

  card.querySelector('.card-body').classList.remove('hidden');
  refresh(card);
}

// ---------- Vista previa y validación ----------
function nombreCAD(v) {
  return `FORMATO_CAD_${v.poliza || 'SIN_NUMERO'}_${v.certificado || '0'}.pdf`;
}
function asunto(v) {
  return `Póliza ${v.poliza}${v.ramo ? ' - ' + v.ramo : ''}`;
}
function cuerpo(v) {
  const firma = nombreInput.value.trim();
  return `Buen día,\n\nMe permito adjuntar la póliza No. ${v.poliza}, que corresponde al ramo ${v.ramo}.\n\nCordialmente,${firma ? '\n\n' + firma : ''}`;
}
function fmtTam(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function refresh(card) {
  const st = card._state;
  if (!st) return;
  const v = st.valores;
  const faltan = [];
  if (!v.poliza) faltan.push('número de póliza');
  if (!v.ramo) faltan.push('ramo');
  if (v.certificado === '') faltan.push('certificado');

  card.querySelector('.subject').textContent = asunto(v);
  card.querySelector('.body').textContent = cuerpo(v);

  const total = st.archivos.reduce((s, a) => s + a.file.size, 0);
  const summary = card.querySelector('.files summary');
  summary.textContent = `${st.archivos.length} archivos en la carpeta (${fmtTam(total)}) · se adjuntarán junto con el Formato CAD`;
  const ul = card.querySelector('.files ul');
  ul.replaceChildren();
  const liCad = document.createElement('li');
  liCad.className = 'cad';
  liCad.innerHTML = '<span></span><span>se genera</span>';
  liCad.firstChild.textContent = nombreCAD(v);
  ul.append(liCad);
  for (const a of st.archivos) {
    const li = document.createElement('li');
    li.innerHTML = '<span></span><span></span>';
    li.children[0].textContent = a.path.split('/').slice(1).join('/') || a.file.name;
    li.children[1].textContent = fmtTam(a.file.size);
    ul.append(li);
  }

  const warn = card.querySelector('.warn');
  const avisos = [];
  if (faltan.length) avisos.push(`No se pudo leer: ${faltan.join(', ')}. Escríbelo en el campo antes de continuar.`);
  if (total / 1024 / 1024 > LIMITE_CORREO_MB) avisos.push(`Los adjuntos suman ${fmtTam(total)}; Outlook suele rechazar correos de más de ${LIMITE_CORREO_MB} MB.`);
  warn.textContent = avisos.join(' ');
  warn.classList.toggle('hidden', !avisos.length);

  const badge = card.querySelector('.badge');
  if (!badge.classList.contains('error')) {
    if (st.listo) { badge.textContent = st.listo; badge.className = 'badge success'; }
    else if (faltan.length) { badge.textContent = 'Revisar datos'; badge.className = 'badge warning'; }
    else { badge.textContent = 'Listo'; badge.className = 'badge success'; }
  }
}
function refreshAll() { results.querySelectorAll('.card').forEach(refresh); }

function validar(card) {
  const v = card._state.valores;
  if (!nombreInput.value.trim()) {
    nombreInput.closest('.field').classList.add('invalid');
    nombreInput.focus();
    alert('Escribe el nombre del funcionario: va en la firma del Formato CAD.');
    return false;
  }
  if (!v.poliza || !v.ramo || v.certificado === '' || !v.folios) {
    alert('Completa el número de póliza, el certificado, el ramo y los folios antes de continuar.');
    return false;
  }
  return true;
}

async function accion(card, fn) {
  if (!validar(card)) return;
  const btns = card.querySelectorAll('.btn');
  btns.forEach(b => (b.disabled = true));
  try {
    await fn(card);
  } catch (err) {
    console.error(err);
    alert('Ocurrió un error: ' + (err?.message || err));
  } finally {
    btns.forEach(b => (b.disabled = false));
  }
}

async function crearCAD(card) {
  const v = card._state.valores;
  const bytes = await generarCAD(await plantilla(), {
    ...v,
    nombre: nombreInput.value.trim(),
    fecha: fechaHoyBogota(),
  });
  return new Uint8Array(bytes);
}

function descargar(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function descargarCAD(card) {
  const v = card._state.valores;
  const pdf = await crearCAD(card);
  descargar(new Blob([pdf], { type: 'application/pdf' }), nombreCAD(v));
  card._state.listo = 'CAD descargado';
  refresh(card);
}

async function prepararCorreo(card) {
  const st = card._state;
  const v = st.valores;
  const cad = await crearCAD(card);
  const adjuntos = [{ name: nombreCAD(v), bytes: cad }];
  // La póliza primero, luego el resto de documentos de la carpeta
  const ordenados = [st.poliza, ...st.archivos.filter(a => a !== st.poliza)];
  for (const a of ordenados) {
    adjuntos.push({ name: a.file.name, bytes: new Uint8Array(await a.file.arrayBuffer()) });
  }
  const eml = construirEml({
    to: paraInput.value.trim().replace(/[;,]\s*/g, ', '),
    subject: asunto(v),
    body: cuerpo(v),
    attachments: adjuntos,
  });
  const archivo = `Correo ${asunto(v)}`.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 120) + '.eml';
  descargar(eml, archivo);
  card._state.listo = 'Correo preparado';
  refresh(card);
}

async function copiarTexto(card) {
  const v = card._state.valores;
  const texto = `${asunto(v)}\n\n${cuerpo(v)}`;
  const btn = card.querySelector('[data-act="copy"]');
  try {
    await navigator.clipboard.writeText(texto);
    btn.textContent = '¡Copiado!';
  } catch {
    prompt('Copia el texto:', texto);
  }
  setTimeout(() => (btn.textContent = 'Copiar texto'), 1500);
}
