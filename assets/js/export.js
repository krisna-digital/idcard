/* IDCARD STUDIO — export.js
 * Export PNG (dengan metadata DPI) dan PDF (penulis PDF minimal, tanpa pustaka luar).
 * Export memakai renderer yang SAMA dengan preview (IDS.renderCard) — hanya skala px/mm berbeda.
 */
(function (root) {
  'use strict';
  var IDS = root.IDS = root.IDS || {};

  var MM_PER_INCH = 25.4;
  IDS.mmToPt = function (mm) { return mm / MM_PER_INCH * 72; };
  IDS.dpiToPxPerMm = function (dpi) { return dpi / MM_PER_INCH; };
  function f4(n) { return (Math.round(n * 10000) / 10000).toString(); }

  /* ---------- PDF writer minimal ---------- */

  var enc = (typeof TextEncoder !== 'undefined') ? new TextEncoder() : null;
  function strBytes(s) {
    if (enc) return enc.encode(s);
    var a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255; return a;
  }
  function concat(parts) {
    var n = 0; parts.forEach(function (p) { n += p.length; });
    var out = new Uint8Array(n), o = 0; parts.forEach(function (p) { out.set(p, o); o += p.length; });
    return out;
  }

  /**
   * pages: [{ wMm, hMm, imgW, imgH, filter: 'FlateDecode'|'DCTDecode', data: Uint8Array }]
   * Setiap halaman = satu gambar penuh. Ukuran halaman TEPAT sesuai wMm × hMm (tanpa margin).
   * PrintScaling=None agar penampil PDF mencetak ukuran sebenarnya (100%).
   */
  IDS.buildPdf = function (pages, title) {
    var parts = [], offsets = [], pos = 0;
    function push(b) { parts.push(b); pos += b.length; }
    function pushStr(s) { push(strBytes(s)); }
    function obj(n, body) { offsets[n] = pos; pushStr(n + ' 0 obj\n' + body + '\nendobj\n'); }

    pushStr('%PDF-1.4\n'); push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));
    var kids = pages.map(function (_, i) { return (3 + i * 3) + ' 0 R'; }).join(' ');
    obj(1, '<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >> >>');
    obj(2, '<< /Type /Pages /Kids [' + kids + '] /Count ' + pages.length + ' >>');

    pages.forEach(function (p, i) {
      var pg = 3 + i * 3, ct = pg + 1, im = pg + 2;
      var W = f4(IDS.mmToPt(p.wMm)), H = f4(IDS.mmToPt(p.hMm));
      obj(pg, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /TrimBox [0 0 ' + W + ' ' + H + '] ' +
        '/Resources << /XObject << /Im0 ' + im + ' 0 R >> >> /Contents ' + ct + ' 0 R >>');
      var content = 'q ' + W + ' 0 0 ' + H + ' 0 0 cm /Im0 Do Q';
      obj(ct, '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
      offsets[im] = pos;
      pushStr(im + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + p.imgW + ' /Height ' + p.imgH +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /' + p.filter + ' /Length ' + p.data.length + ' >>\nstream\n');
      push(p.data);
      pushStr('\nendstream\nendobj\n');
    });

    var info = 3 + pages.length * 3;
    obj(info, '<< /Title (' + (title || 'IDCARD STUDIO').replace(/[()\\]/g, '') + ') /Producer (IDCARD STUDIO) >>');
    var xref = pos, count = info + 1;
    var x = 'xref\n0 ' + count + '\n0000000000 65535 f \n';
    for (var n = 1; n < count; n++) x += ('0000000000' + offsets[n]).slice(-10) + ' 00000 n \n';
    pushStr(x + 'trailer\n<< /Size ' + count + ' /Root 1 0 R /Info ' + info + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return concat(parts);
  };

  /** Baca MediaBox dari bytes PDF (untuk validasi/tes). Hasil dalam pt. */
  IDS.readMediaBoxes = function (bytes) {
    var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    var re = /\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g, m, out = [];
    while ((m = re.exec(s))) out.push({ w: parseFloat(m[1]), h: parseFloat(m[2]) });
    return out;
  };

  /* ---------- Encode gambar canvas untuk PDF ---------- */

  async function deflate(u8) {
    var cs = new CompressionStream('deflate'), w = cs.writable.getWriter();
    w.write(u8); w.close();
    var buf = await new Response(cs.readable).arrayBuffer();
    return new Uint8Array(buf);
  }

  /** Lossless (Flate) bila didukung; cadangan JPEG kualitas tinggi. */
  IDS.encodeCanvasForPdf = async function (canvas) {
    var w = canvas.width, h = canvas.height;
    if (typeof CompressionStream !== 'undefined') {
      var rgba = canvas.getContext('2d').getImageData(0, 0, w, h).data;
      var rgb = new Uint8Array(w * h * 3);
      for (var i = 0, j = 0; i < rgba.length; i += 4, j += 3) { rgb[j] = rgba[i]; rgb[j + 1] = rgba[i + 1]; rgb[j + 2] = rgba[i + 2]; }
      return { imgW: w, imgH: h, filter: 'FlateDecode', data: await deflate(rgb) };
    }
    var url = canvas.toDataURL('image/jpeg', 0.97), b64 = url.split(',')[1], bin = atob(b64), u8 = new Uint8Array(bin.length);
    for (var k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
    return { imgW: w, imgH: h, filter: 'DCTDecode', data: u8 };
  };

  /* ---------- PNG + metadata DPI ---------- */

  var crcTable = null;
  function crc32(u8) {
    if (!crcTable) { crcTable = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
    var crc = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) crc = crcTable[(crc ^ u8[i]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  /** Sisipkan chunk pHYs (piksel per meter) setelah IHDR sehingga PNG terbuka pada ukuran fisik yang benar. */
  IDS.pngSetDpi = function (png, dpi) {
    var ppm = Math.round(dpi / 0.0254), chunk = new Uint8Array(21), dv = new DataView(chunk.buffer);
    dv.setUint32(0, 9); chunk.set([0x70, 0x48, 0x59, 0x73], 4);            // "pHYs"
    dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;               // unit = meter
    dv.setUint32(17, crc32(chunk.subarray(4, 17)));
    var at = 33; // 8 (signature) + 25 (IHDR)
    return concat([png.subarray(0, at), chunk, png.subarray(at)]);
  };

  /* ---------- Aksi tingkat tinggi ---------- */

  function canvasToPng(canvas) {
    return new Promise(function (res, rej) {
      canvas.toBlob(function (b) { b ? b.arrayBuffer().then(function (a) { res(new Uint8Array(a)); }) : rej(new Error('Gagal membuat PNG')); }, 'image/png');
    });
  }

  IDS.safeName = function (s) { return String(s || 'idcard').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'idcard'; };

  IDS.download = function (bytes, filename, mime) {
    var blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type: mime });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  };

  /** renderSide(side, pxPerMm) -> canvas. */
  IDS.exportPng = async function (renderSide, side, dpi) {
    var canvas = renderSide(side, IDS.dpiToPxPerMm(dpi));
    return IDS.pngSetDpi(await canvasToPng(canvas), dpi);
  };

  IDS.exportPdf = async function (renderSide, mode, dpi, title) {
    var k = IDS.dpiToPxPerMm(dpi), W = IDS.CARD.widthMm, H = IDS.CARD.heightMm, pages = [];
    var front = renderSide('front', k), back = renderSide('back', k);
    if (mode === 'two') {
      var a = await IDS.encodeCanvasForPdf(front), b = await IDS.encodeCanvasForPdf(back);
      pages.push(Object.assign({ wMm: W, hMm: H }, a), Object.assign({ wMm: W, hMm: H }, b));
    } else {
      var gap = 5, c = document.createElement('canvas');
      c.width = front.width + back.width + Math.round(gap * k); c.height = Math.max(front.height, back.height);
      var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(front, 0, 0); ctx.drawImage(back, front.width + Math.round(gap * k), 0);
      var e = await IDS.encodeCanvasForPdf(c);
      pages.push(Object.assign({ wMm: c.width / k, hMm: c.height / k }, e));
    }
    return IDS.buildPdf(pages, title);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = IDS;
})(typeof window !== 'undefined' ? window : globalThis);
