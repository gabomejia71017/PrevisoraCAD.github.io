// Construye un archivo .eml listo para abrir en Outlook como borrador (X-Unsent: 1),
// con asunto, cuerpo y todos los adjuntos.

function b64FromBytes(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
function b64Utf8(str) {
  return b64FromBytes(new TextEncoder().encode(str));
}
function wrap76(s) {
  return s.replace(/.{1,76}/g, '$&\r\n');
}
function encHeader(str) {
  return /^[\x20-\x7E]*$/.test(str) ? str : `=?UTF-8?B?${b64Utf8(str)}?=`;
}
function encParam(name, value) {
  // RFC 2231 para nombres con tildes, más un nombre "simple" para clientes antiguos
  const ascii = value.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'");
  const ext = encodeURIComponent(value).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `${name}="${ascii}"; ${name}*=UTF-8''${ext}`;
}
const MIME = {
  pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', eml: 'message/rfc822',
  msg: 'application/vnd.ms-outlook', zip: 'application/zip', txt: 'text/plain', tif: 'image/tiff', tiff: 'image/tiff',
};
function mimeOf(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  // .eml adjunto como binario para que Outlook no intente reinterpretarlo
  if (ext === 'eml') return 'application/octet-stream';
  return MIME[ext] || 'application/octet-stream';
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/**
 * @param {{to?:string, subject:string, body:string, attachments:{name:string, bytes:Uint8Array}[]}} opts
 * @returns {Blob}
 */
export function construirEml({ to, subject, body, attachments }) {
  const boundary = '----=_Polizas_' + Math.random().toString(36).slice(2);
  const alt = '----=_Alt_' + Math.random().toString(36).slice(2);
  const html = `<html><body style="font-family:Calibri,Arial,sans-serif;font-size:11pt">${escapeHtml(body).replace(/\n/g, '<br>')}</body></html>`;
  const parts = [];
  parts.push(
    'MIME-Version: 1.0',
    'X-Unsent: 1',
    to ? `To: ${to}` : 'To: ',
    `Subject: ${encHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    'This is a multi-part message in MIME format.',
    '',
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    '',
    `--${alt}`,
    'Content-Type: text/plain; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64Utf8(body)),
    `--${alt}`,
    'Content-Type: text/html; charset="utf-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(b64Utf8(html)),
    `--${alt}--`,
    '',
  );
  const head = parts.join('\r\n');
  const chunks = [head];
  for (const a of attachments) {
    chunks.push(
      [
        `--${boundary}`,
        `Content-Type: ${mimeOf(a.name)}; ${encParam('name', a.name)}`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; ${encParam('filename', a.name)}`,
        '',
        '',
      ].join('\r\n'),
    );
    chunks.push(wrap76(b64FromBytes(a.bytes)));
  }
  chunks.push(`--${boundary}--\r\n`);
  return new Blob(chunks, { type: 'message/rfc822' });
}
