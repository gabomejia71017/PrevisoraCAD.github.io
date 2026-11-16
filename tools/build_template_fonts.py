"""Crea assets/plantilla_cad.pdf: el PDF exportado por Excel sin los datos variables,
con Calibri, Verdana y Verdana Bold incrustadas (solo los caracteres de Windows-1252),
y genera js/metrics.js con los anchos de cada carácter."""
import io, json, sys
from fontTools.ttLib import TTFont
from fontTools import subset
from pypdf import PdfReader, PdfWriter
from pypdf.generic import (ContentStream, NameObject, DictionaryObject, ArrayObject, NumberObject,
                           FloatObject, StreamObject)

SRC_PDF, FONT_DIR, OUT_PDF, OUT_JS = sys.argv[1:5]

# 1) Plantilla sin datos variables
r = PdfReader(SRC_PDF)
w = PdfWriter(clone_from=r)
page = w.pages[0]
cs = ContentStream(page.get_contents(), w)
targets = [(259.88,399.33),(302.88,399.33),(496.72,399.33),(575.15,399.52),(699.98,399.33),(212.05,125.62),(243.08,92.825)]
is_t = lambda x,y: any(abs(x-a)<0.5 and abs(y-b)<0.5 for a,b in targets)
ops, out, i = cs.operations, [], 0
while i < len(ops):
    a, o = ops[i]
    if o == b'BT':
        j = i
        while ops[j][1] != b'ET': j += 1
        tm = [x for x in ops[i:j+1] if x[1] == b'Tm']
        if not (tm and is_t(float(tm[0][0][4]), float(tm[0][0][5]))):
            out.extend(ops[i:j+1])
        i = j + 1; continue
    out.append((a, o)); i += 1
cs.operations = out
page.replace_contents(cs)

# 2) Fuentes
codes = [c for c in range(32, 256)]
def char_of(c):
    try: return bytes([c]).decode('cp1252')
    except UnicodeDecodeError: return None
chars = {c: char_of(c) for c in codes}
unicodes = [ord(ch) for ch in chars.values() if ch]

metrics = {}
fonts_res = page['/Resources']['/Font']
for key, fname, base, tag in [('/FC','calibri.ttf','Calibri','CADAAA'), ('/FV','verdana.ttf','Verdana','CADAAB'), ('/FVB','verdanab.ttf','Verdana-Bold','CADAAC')]:
    full = TTFont(f'{FONT_DIR}/{fname}')
    upm = full['head'].unitsPerEm
    cmap = full.getBestCmap(); hmtx = full['hmtx']
    widths = []
    for c in range(32, 256):
        ch = chars[c]
        g = cmap.get(ord(ch)) if ch else None
        widths.append(round(hmtx[g][0] * 1000 / upm) if g else 0)
    opts = subset.Options()
    opts.drop_tables += ['EBDT','EBLC','EBSC','DSIG','GSUB','GPOS','GDEF','kern','vhea','vmtx','JSTF','MATH','meta']
    opts.name_IDs = [0,1,2,3,4,5,6]
    opts.notdef_outline = True
    opts.layout_features = []
    opts.hinting = True
    sub = subset.Subsetter(opts); sub.populate(unicodes=unicodes); sub.subset(full)
    buf = io.BytesIO(); full.save(buf); data = buf.getvalue()
    hd = full['head']; os2 = full['OS/2']; hh = full['hhea']
    s = lambda v: round(v * 1000 / upm)
    ff = StreamObject(); ff.set_data(data); ff[NameObject('/Length1')] = NumberObject(len(data))
    ff_ref = w._add_object(ff)
    fd = DictionaryObject({
        NameObject('/Type'): NameObject('/FontDescriptor'),
        NameObject('/FontName'): NameObject(f'/{tag}+{base}'),
        NameObject('/Flags'): NumberObject(32),
        NameObject('/FontBBox'): ArrayObject([NumberObject(s(v)) for v in (hd.xMin, hd.yMin, hd.xMax, hd.yMax)]),
        NameObject('/ItalicAngle'): NumberObject(0),
        NameObject('/Ascent'): NumberObject(s(hh.ascent)),
        NameObject('/Descent'): NumberObject(s(hh.descent)),
        NameObject('/CapHeight'): NumberObject(s(getattr(os2, 'sCapHeight', hh.ascent))),
        NameObject('/StemV'): NumberObject(80 if 'Bold' not in base else 140),
        NameObject('/FontFile2'): ff_ref,
    })
    fd_ref = w._add_object(fd)
    font = DictionaryObject({
        NameObject('/Type'): NameObject('/Font'),
        NameObject('/Subtype'): NameObject('/TrueType'),
        NameObject('/BaseFont'): NameObject(f'/{tag}+{base}'),
        NameObject('/FirstChar'): NumberObject(32),
        NameObject('/LastChar'): NumberObject(255),
        NameObject('/Widths'): ArrayObject([NumberObject(x) for x in widths]),
        NameObject('/Encoding'): NameObject('/WinAnsiEncoding'),
        NameObject('/FontDescriptor'): fd_ref,
    })
    fonts_res[NameObject(key)] = w._add_object(font)
    metrics[key[1:]] = widths
    print(key, base, 'subset bytes', len(data))

w.add_metadata({'/Title': 'FORMATO CAD - plantilla', '/Producer': 'Procesador de Polizas'})
w.compress_identical_objects()
with open(OUT_PDF, 'wb') as f: w.write(f)

with open(OUT_JS, 'w') as f:
    f.write('// Anchos (1/1000 em) de los caracteres Windows-1252 32..255 de las fuentes incrustadas en la plantilla.\n')
    f.write('// Generado por build_template_fonts.py a partir de Calibri, Verdana y Verdana Bold.\n')
    f.write('export const WIDTHS = ' + json.dumps(metrics, separators=(',', ':')) + ';\n')
