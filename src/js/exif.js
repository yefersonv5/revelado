/* Datos de la cámara (EXIF) de una foto JPG: cámara, objetivo, ISO, apertura, velocidad, distancia focal y
   fecha de captura. Lee solo el comienzo del archivo. Si la foto no los trae (capturas, fotos editadas en
   otras apps o HEIC convertidas), devuelve lo que encuentre o nada. */

async function leerExif(blob){
  try {
    const b = new DataView(await blob.slice(0, 196608).arrayBuffer());
    if (b.getUint16(0) !== 0xFFD8) return null;
    let p = 2;
    while (p + 4 < b.byteLength) {
      const marca = b.getUint16(p), largo = b.getUint16(p + 2);
      if (marca === 0xFFE1 && b.getUint32(p + 4) === 0x45786966) return exifTiff(b, p + 10);
      if ((marca & 0xFF00) !== 0xFF00) break;
      p += 2 + largo;
    }
  } catch (_) {}
  return null;
}

function exifTiff(b, t){
  const le = b.getUint16(t) === 0x4949;
  const u16 = o => b.getUint16(t + o, le), u32 = o => b.getUint32(t + o, le);
  const TAMS = { 1:1, 2:1, 3:2, 4:4, 5:8, 7:1, 9:4, 10:8 };
  const leerIFD = (o, out) => {
    const n = u16(o);
    for (let i = 0; i < n; i++) {
      const e = o + 2 + i * 12, tag = u16(e), tipo = u16(e + 2), cnt = u32(e + 4), tam = (TAMS[tipo] || 1) * cnt;
      const vo = tam > 4 ? u32(e + 8) : e + 8;
      let v;
      if (tipo === 2) { v = ''; for (let k = 0; k < cnt - 1; k++) v += String.fromCharCode(b.getUint8(t + vo + k)); v = v.trim(); }
      else if (tipo === 3) v = u16(vo);
      else if (tipo === 4) v = u32(vo);
      else if (tipo === 5 || tipo === 10) { const nu = tipo === 5 ? u32(vo) : b.getInt32(t + vo, le), de = tipo === 5 ? u32(vo + 4) : b.getInt32(t + vo + 4, le); v = de ? nu / de : 0; }
      out[tag] = v;
    }
  };
  const ifd0 = {}, sub = {};
  leerIFD(u32(4), ifd0);
  if (ifd0[0x8769]) leerIFD(ifd0[0x8769], sub);
  const exp = sub[0x829A], fecha = sub[0x9003] || ifd0[0x0132];
  const d = {
    camara:[ifd0[0x010F], ifd0[0x0110]].filter(Boolean).join(' ').replace(/^(\w+) \1 /i, '$1 ') || '',
    objetivo:sub[0xA434] || '',
    iso:sub[0x8827] ? 'ISO ' + sub[0x8827] : '',
    apertura:sub[0x829D] ? 'ƒ/' + (+sub[0x829D].toFixed(1)) : '',
    velocidad:exp ? (exp >= 1 ? exp + ' s' : '1/' + Math.round(1 / exp) + ' s') : '',
    focal:sub[0x920A] ? Math.round(sub[0x920A]) + ' mm' : '',
  };
  if (fecha && /^\d{4}:\d\d:\d\d \d\d:\d\d/.test(fecha)) { const [f, h] = fecha.split(' '); d.fecha = new Date(f.replace(/:/g, '-') + 'T' + h).getTime(); }
  return Object.values(d).some(Boolean) ? d : null;
}
