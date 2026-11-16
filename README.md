# Procesador de Pólizas · Formato CAD (versión web)

Esta página web genera el **Formato CAD** en PDF a partir de la carpeta de una póliza. También prepara el **correo de Outlook** con la póliza, el CAD y todos los documentos de la carpeta ya adjuntos.

Todo el procesamiento ocurre en el navegador de quien la usa: los documentos **no se suben a ningún servidor**. Vercel solo entrega la página.

## Cómo se usa

1. Escribe tu nombre: va en "Nombre y apellido" del CAD y en la firma del correo. La página lo recuerda para la próxima vez.
2. Si quieres, escribe el correo del destinatario. Si son varios, sepáralos con `;`.
3. Arrastra la carpeta de la póliza, o haz clic para seleccionarla. Puedes soltar varias carpetas a la vez.
4. Revisa los datos que se leyeron automáticamente: póliza, certificado, ramo, folios y tipo de trámite. Si algo está mal, corrígelo en su campo.
5. Elige qué hacer:
   - **Descargar Formato CAD**: descarga `FORMATO_CAD_<póliza>_<certificado>.pdf`.
   - **Preparar correo en Outlook**: descarga un archivo `.eml`. Al abrirlo con Outlook de escritorio (clásico), aparece como un correo nuevo, listo para enviar, con:
     - **Asunto:** `Póliza <número> - <ramo>`
     - **Cuerpo:** "Me permito adjuntar la póliza No. <número>, que corresponde al ramo <ramo>."
     - **Adjuntos:** el Formato CAD, la póliza (+POLIZA) y el resto de archivos de la carpeta.
   - **Copiar texto**: copia el asunto y el cuerpo, por si usas Outlook en el navegador.

> Para que el `.eml` se abra directo en Outlook: en Windows, clic derecho sobre el archivo → **Abrir con** → **Outlook** → marca "Usar siempre esta aplicación". Así se configura una sola vez.

## Reglas (las mismas del aplicativo original en Python)

| Dato | De dónde sale |
|---|---|
| N° póliza | Primer número de 6 o más dígitos debajo de "PÓLIZA N°" en la página 1 del PDF `+POLIZA…` |
| Certificado | Número debajo de "N° CERTIFICADO" en la página 1 |
| Ramo | Texto entre "SEGURO" y "PÓLIZA" |
| Folios | Cantidad de archivos de la carpeta. Se ignoran los archivos ocultos, `Thumbs.db`, `desktop.ini` y los temporales `~$` |
| Tipo de trámite | `PD` si el certificado es 0; `SD` en cualquier otro caso |
| Fecha de entrega | La fecha de hoy, en hora de Colombia |

## Publicar en Vercel (gratis)

Es un sitio estático: no necesita servidor, base de datos ni variables de entorno.

### Opción A: desde GitHub (recomendada)
1. Crea un repositorio en GitHub y sube **el contenido de esta carpeta** (que `index.html` quede en la raíz).
2. Entra a <https://vercel.com>, inicia sesión con GitHub y haz clic en **Add New… → Project**.
3. Importa el repositorio. En *Framework Preset* elige **Other**; no hay que llenar nada más.
4. Haz clic en **Deploy**. Vercel te da un enlace del tipo `https://procesador-polizas.vercel.app`.
5. Cada vez que subas un cambio a GitHub, Vercel publica la nueva versión automáticamente.

### Opción B: con la terminal
1. Instala Node.js (<https://nodejs.org>).
2. Abre una terminal en esta carpeta y ejecuta:
   ```
   npx vercel login
   npx vercel --prod
   ```
3. Acepta las opciones que propone. Al final aparece el enlace público.

### Que cualquiera con el enlace pueda usarla
Vercel puede tener activada la **Deployment Protection**, que pide iniciar sesión en Vercel para ver la página. Revisa en **Project → Settings → Deployment Protection** que la **URL de producción** sea pública. Las protecciones suelen aplicarse solo a las versiones de vista previa (*preview*).

## Contenido

```
index.html               Interfaz
styles.css               Estilos
js/app.js                Lectura de carpetas, interfaz y flujo
js/extract.js            Extracción de póliza, certificado y ramo
js/cad.js                Escritura de los datos sobre la plantilla del Formato CAD
js/metrics.js            Anchos de letra de Calibri y Verdana (para alinear igual que Excel)
js/eml.js                Construcción del correo .eml con adjuntos
assets/plantilla_cad.pdf Formato CAD en blanco (generado desde el PDF exportado por Excel)
vendor/                  pdf.js (Apache 2.0) y pdf-lib (MIT)
vercel.json              Configuración de Vercel
```

## Probarla en tu computador antes de publicar
Por seguridad, el navegador no permite abrir la página haciendo doble clic en `index.html`. Abre una terminal en esta carpeta y ejecuta:
```
python -m http.server 8000
```
Luego entra a <http://localhost:8000>.

## Limitaciones conocidas
- El `.eml` se abre como borrador en **Outlook de escritorio clásico**. El "nuevo Outlook" y Outlook en el navegador pueden abrirlo solo para lectura. En esos casos usa **Copiar texto** y adjunta los archivos manualmente.
- Outlook suele rechazar correos de más de 20–25 MB. La página muestra un aviso si los adjuntos superan 20 MB.
- El CAD usa las mismas fuentes y tamaños de `FORMATO CAD.xlsx`: Calibri 11 para la póliza y el ramo, Verdana 8 para el certificado y los folios, y Verdana 8 negrita para el trámite, el nombre y la fecha. Las fuentes van incrustadas dentro de `assets/plantilla_cad.pdf` (solo los caracteres necesarios, igual que hace Excel al exportar). Si un texto no cabe en su celda, se corta en el borde, como en Excel.
- El drag & drop de carpetas funciona en Chrome, Edge y Firefox de escritorio. En celular solo funciona el botón de selección, si el navegador permite elegir carpetas.
