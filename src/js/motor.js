/* Motor de revelado en WebGL2.
   Una "fuente" es la foto subida como textura más cuatro desenfoques que alimentan los ajustes locales:
   S (detalle fino: nitidez y ruido), M (textura), L (claridad) y H (neblina). Un solo sombreador aplica todo
   en este orden: ruido, nitidez, textura, claridad, neblina, exposición y balance de blancos, tono, curva,
   mezcla de color, intensidad y saturación, gradación, máscaras, viñeta y grano.
   La geometría (giro, volteo, enderezar y recorte) es una matriz que lleva cada punto de la salida a la foto. */

const VS = `#version 300 es
in vec2 a; uniform float uVoltear; out vec2 vUV;
void main(){ vUV = vec2(a.x * .5 + .5, uVoltear > .5 ? .5 - a.y * .5 : .5 + a.y * .5); gl_Position = vec4(a, 0., 1.); }`;

/* desenfoque gaussiano separable de 15 muestras */
const FS_DESENFOQUE = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o;
uniform sampler2D uT; uniform vec2 uDir; uniform float uSigma;
void main(){
  vec4 s = vec4(0.); float ws = 0.;
  for (int i = -7; i <= 7; i++) {
    float x = float(i) * uSigma * 3. / 7.; float w = exp(-x * x / (2. * uSigma * uSigma));
    s += texture(uT, vUV + uDir * x) * w; ws += w;
  }
  o = s / ws;
}`;

const FS_REVELADO = `#version 300 es
precision highp float;
in vec2 vUV; out vec4 o;
uniform sampler2D uSrc, uS, uM, uL, uH, uCurva;
uniform mat3 uGeo;
uniform vec2 uSal, uAsp;
uniform float uAntes, uSemilla;
uniform vec4 uA1, uA2, uA3, uA4, uA5, uVin;
uniform vec3 uMez[8];
uniform vec4 uGrad[4];
uniform vec2 uGradMB;
uniform int uNM, uVerM;
uniform vec4 uMG[16], uMA[16];

const float TONOS[8] = float[8](0., 30., 58., 120., 180., 225., 275., 320.);

float lum(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }
vec3 rgb2hsv(vec3 c){
  vec4 K = vec4(0., -1. / 3., 2. / 3., -1.);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y), e = 1e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6. * d + e)), d / (q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1., 2. / 3., 1. / 3., 3.);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6. - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0., 1.), c.y);
}
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float ruidoValor(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  float a = hash(i + uSemilla), b = hash(i + vec2(1., 0.) + uSemilla), c = hash(i + vec2(0., 1.) + uSemilla), d = hash(i + vec2(1., 1.) + uSemilla);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

/* tono sobre la luminancia; todos los valores van de -1 a 1 */
float tono(float L, float con, float alt, float som, float bla, float neg){
  L += bla * .2 * smoothstep(.45, 1., L);
  L += neg * .2 * (1. - smoothstep(0., .55, L));
  L += alt * .32 * smoothstep(.4, 1., L);
  L += som * .32 * (1. - smoothstep(0., .6, L));
  float Lc = clamp(L, 0., 1.), S = Lc * Lc * (3. - 2. * Lc) + (L - Lc);
  return con >= 0. ? mix(L, S, con * .9) : mix(L, .5 + (L - .5) * .55, -con);
}
/* lleva el color a la nueva luminancia: mitad proporcional (conserva saturación) y mitad aditiva (no revienta sombras) */
vec3 aplicarL(vec3 c, float L, float nL){
  return mix(c + (nL - L), c * (nL / max(L, .02)), .5);
}
vec3 balance(float te, float ti){
  vec3 wb = vec3(1. + te * .28, 1., 1. - te * .28) * vec3(1. + ti * .12, 1. - ti * .18, 1. + ti * .12);
  return wb / lum(wb);
}
/* ajustes de una máscara con peso w; a0: exposición, contraste, altas, sombras; a1: temperatura, matiz, saturación, claridad */
vec3 local(vec3 c, float w, vec4 a0, vec4 a1, vec3 det){
  vec3 lin = pow(max(c, 0.), vec3(2.2)) * exp2(a0.x * w) * balance(a1.x * w, a1.y * w);
  c = pow(lin, vec3(1. / 2.2));
  float L = lum(c); c = aplicarL(c, L, tono(L, a0.y * w, a0.z * w, a0.w * w, 0., 0.));
  float L2 = lum(c); c = vec3(L2) + (c - vec3(L2)) * (1. + a1.z * w);
  c += det * a1.w * .9 * 4. * L2 * (1. - L2) * w;
  return c;
}

void main(){
  vec2 uv = (uGeo * vec3(vUV, 1.)).xy;
  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) { o = vec4(vec3(.11), 1.); return; }
  vec3 c = texture(uSrc, uv).rgb;
  if (uAntes > .5) { o = vec4(c, 1.); return; }
  vec3 s = texture(uS, uv).rgb, m = texture(uM, uv).rgb, l = texture(uL, uv).rgb, h = texture(uH, uv).rgb;
  vec3 det = c - l;

  /* reducción de ruido: suaviza donde no hay bordes */
  float nr = uA4.w;
  if (nr > 0.) { float e = length(c - s); c = mix(c, mix(s, m, nr * .35), nr * (1. - smoothstep(.015, .1 + .1 * nr, e))); }
  if (uA5.x > 0.) c += ((m - vec3(lum(m))) - (c - vec3(lum(c)))) * uA5.x;
  /* nitidez, textura y claridad */
  if (uA4.y > 0.) c += (c - mix(s, m, uA4.z * .6)) * uA4.y * 1.6;
  c += (s - m) * uA3.z * 1.3;
  float Lm = lum(c); c += det * uA3.w * .9 * 4. * Lm * (1. - Lm);
  /* neblina: quita o agrega el velo según el canal oscuro del entorno */
  float dh = uA4.x;
  if (dh > 0.) { float t = max(1. - dh * .85 * min(h.r, min(h.g, h.b)), .25); c = (c - .95) / t + .95; }
  else if (dh < 0.) c = mix(c, vec3(.8), -dh * .4);

  /* exposición y balance de blancos en luz lineal */
  vec3 lin = pow(max(c, 0.), vec3(2.2)) * exp2(uA1.x) * balance(uA2.z, uA2.w);
  c = pow(lin, vec3(1. / 2.2));
  /* tono */
  float L = lum(c);
  c = clamp(aplicarL(c, L, tono(L, uA1.y, uA1.z, uA1.w, uA2.x, uA2.y)), 0., 1.);
  /* curva de tonos */
  vec3 k = c * (255. / 256.) + .5 / 256.;
  c = vec3(texture(uCurva, vec2(k.r, .5)).r, texture(uCurva, vec2(k.g, .5)).g, texture(uCurva, vec2(k.b, .5)).b);

  /* mezcla de color por bandas de tono */
  vec3 hsv = rgb2hsv(c), acc = vec3(0.); float ws = 0., hd = hsv.x * 360.;
  for (int i = 0; i < 8; i++) {
    float d = abs(hd - TONOS[i]); d = min(d, 360. - d);
    float w = max(0., 1. - d / 50.); w = w * w * (3. - 2. * w);
    acc += uMez[i] * w; ws += w;
  }
  if (ws > 0.) {
    acc /= max(ws, 1.);
    float sw = smoothstep(.03, .25, hsv.y);
    hsv.x = fract(hsv.x + acc.x * sw * 30. / 360.);
    hsv.y = clamp(hsv.y * (1. + acc.y * sw), 0., 1.);
    c = hsv2rgb(hsv) * (1. + acc.z * .5 * sw * min(1., hsv.y * 1.5));
  }
  /* intensidad (protege lo ya saturado) y saturación */
  float Ls = lum(c), sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
  c = vec3(Ls) + (c - vec3(Ls)) * max(0., 1. + uA3.y + uA3.x * (1. - min(1., sat * 1.4)));

  /* gradación de color: sombras, medios, luces y global */
  float Lg = lum(c), p = .5 + uGradMB.y * .25, wd = .2 + uGradMB.x * .45;
  float wS = 1. - smoothstep(p - wd, p + wd * .3, Lg), wH = smoothstep(p - wd * .3, p + wd, Lg), wM = clamp(1. - wS - wH, 0., 1.);
  c += uGrad[0].rgb * wS + uGrad[1].rgb * wM + uGrad[2].rgb * wH + uGrad[3].rgb;
  c += (uGrad[0].w * wS + uGrad[1].w * wM + uGrad[2].w * wH + uGrad[3].w) * .25;

  /* máscaras: posiciones en la foto original, corregidas por proporción */
  vec2 q = uv * uAsp; float ver = 0.;
  for (int i = 0; i < 8; i++) {
    if (i >= uNM) break;
    vec4 g0 = uMG[i * 2], g1 = uMG[i * 2 + 1];
    float w;
    if (g0.x < .5) {
      vec2 A = g1.xy * uAsp, d = g1.zw * uAsp - A;
      w = 1. - smoothstep(0., 1., dot(q - A, d) / max(dot(d, d), 1e-6));
    } else {
      vec2 v = q - g1.xy * uAsp; float ca = cos(g0.w), sa = sin(g0.w);
      v = vec2(ca * v.x + sa * v.y, -sa * v.x + ca * v.y);
      float e = length(v / max(g1.zw, vec2(1e-4))), f = max(g0.z, .02);
      w = 1. - smoothstep(1. - f, 1., e);
    }
    if (g0.y > .5) w = 1. - w;
    if (i == uVerM) ver = w;
    if (w > 0.) c = local(c, w, uMA[i * 2], uMA[i * 2 + 1], det);
  }
  if (uVerM >= 0) c = mix(c, vec3(1., .18, .22), ver * .45);

  /* viñeta tras el recorte */
  if (uVin.x != 0.) {
    float kr = (uVin.z + 1.) * .5, asp = mix(1., uSal.x / uSal.y, kr);
    float d = length((vUV - .5) * vec2(asp, 1.)) / length(vec2(asp, 1.) * .5);
    float m0 = mix(.2, .9, uVin.y), f = mix(.05, .8, uVin.w);
    float vv = smoothstep(m0 - f * .5, m0 + f * .5, d);
    c = uVin.x < 0. ? c * (1. + uVin.x * vv * .95) : mix(c, vec3(1.), uVin.x * vv * .85);
  }
  /* grano: igual en vista previa y exportación porque se mide sobre el tamaño de salida */
  if (uA5.y > 0.) {
    float cel = (1. + uA5.z * 3.) * max(uSal.x, uSal.y) / 2048.;
    vec2 g = vUV * uSal / cel;
    float n = mix(ruidoValor(g), hash(floor(g * 2.) + uSemilla), uA5.w * .6) - .5, Ln = lum(c);
    c += n * uA5.y * .22 * (.35 + 2.6 * Ln * (1. - Ln));
  }
  o = vec4(clamp(c, 0., 1.), 1.);
}`;

/* ---------- geometría ----------
   Matrices afines [a,b,c,d,e,f]: x' = a x + b y + c, y' = d x + e y + f. Se componen de la salida hacia la foto. */
const afMul = (A, B) => [A[0] * B[0] + A[1] * B[3], A[0] * B[1] + A[1] * B[4], A[0] * B[2] + A[1] * B[5] + A[2],
  A[3] * B[0] + A[4] * B[3], A[3] * B[1] + A[4] * B[4], A[3] * B[2] + A[4] * B[5] + A[5]];
const afAplicar = (M, x, y) => [M[0] * x + M[1] * y + M[2], M[3] * x + M[4] * y + M[5]];
function afInv(M){
  const det = M[0] * M[4] - M[1] * M[3], a = M[4] / det, b = -M[1] / det, d = -M[3] / det, e = M[0] / det;
  return [a, b, -(a * M[2] + b * M[5]), d, e, -(d * M[2] + e * M[5])];
}
/* Tamaño del marco orientado (tras giros de 90°) */
const marcoOrientado = (geo, W, H) => (((geo.rot % 4) + 4) % 4) % 2 ? [H, W] : [W, H];

/* Matriz de la salida (0..1) a la foto (0..1). recorte: el rectángulo a mostrar en el marco orientado */
function matrizGeo(geo, W, H, recorte = geo){
  const k = ((geo.rot % 4) + 4) % 4, [Wo, Ho] = marcoOrientado(geo, W, H), t = geo.angulo * Math.PI / 180;
  const pasos = [
    [recorte.w, 0, recorte.x, 0, recorte.h, recorte.y],         // salida -> marco orientado normalizado
    [Wo, 0, -.5 * Wo, 0, Ho, -.5 * Ho],                         // a píxeles centrados
    [Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t), 0], // enderezar
    [1 / Wo, 0, .5, 0, 1 / Ho, .5],                             // de vuelta a 0..1
    geo.flipH ? [-1, 0, 1, 0, 1, 0] : [1, 0, 0, 0, 1, 0],
    geo.flipV ? [1, 0, 0, 0, -1, 1] : [1, 0, 0, 0, 1, 0],
    [[1, 0, 0, 0, 1, 0], [0, 1, 0, -1, 0, 1], [-1, 0, 1, 0, -1, 1], [0, -1, 1, 1, 0, 0]][k], // deshace el giro de 90°
  ];
  return pasos.reduce((M, P) => afMul(P, M), [1, 0, 0, 0, 1, 0]);
}
/* ¿El recorte cae completo dentro de la foto? */
function recorteValido(geo, W, H, r = geo){
  const M = matrizGeo(geo, W, H, r);
  return [[0, 0], [1, 0], [0, 1], [1, 1]].every(([u, v]) => { const [x, y] = afAplicar(M, u, v); return x > -1e-4 && y > -1e-4 && x < 1 + 1e-4 && y < 1 + 1e-4; });
}
/* Ajusta el recorte para que quepa en la foto: lo encoge alrededor de su centro (y lo acerca al centro si hace falta) */
function encajarRecorte(geo, W, H){
  if (recorteValido(geo, W, H)) return;
  const cx = geo.x + geo.w / 2, cy = geo.y + geo.h / 2;
  for (const centro of [[cx, cy], [.5, .5]]) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 22; i++) {
      const s = (lo + hi) / 2, r = { w:geo.w * s, h:geo.h * s }; r.x = centro[0] - r.w / 2; r.y = centro[1] - r.h / 2;
      if (r.x >= 0 && r.y >= 0 && r.x + r.w <= 1 && r.y + r.h <= 1 && recorteValido(geo, W, H, r)) lo = s; else hi = s;
    }
    if (lo > .02) { const r = { w:geo.w * lo, h:geo.h * lo }; Object.assign(geo, r, { x:centro[0] - r.w / 2, y:centro[1] - r.h / 2 }); return; }
  }
}

const Motor = (() => {
  let gl = null, lienzo, progD, progR, buf, lutTex, lutClave = '', semilla = Math.random() * 100;
  const U = {};

  function compilar(fs){
    const p = gl.createProgram();
    for (const [tipo, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(tipo); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, 'a'); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }
  const ubic = (p, n) => (U[n] = U[n] || {}, U[n][p.__id] ??= gl.getUniformLocation(p, n));

  function textura(w, h, datos = null){
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (datos && !(datos instanceof Uint8Array)) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, datos);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, datos);
    return t;
  }
  function destino(tex){ const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0); return f; }
  function dibujar(){ gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }

  /* Desenfoca entrada (tamaño cualquiera) hacia una textura nueva de w x h; sigma en texeles de salida */
  function desenfocar(entrada, w, h, sigma){
    sigma = clamp(sigma, .6, 24);
    const tmp = textura(w, h), out = textura(w, h), f1 = destino(tmp), f2 = destino(out);
    gl.useProgram(progD); gl.viewport(0, 0, w, h);
    gl.uniform1f(ubic(progD, 'uVoltear'), 0); gl.uniform1f(ubic(progD, 'uSigma'), sigma); gl.uniform1i(ubic(progD, 'uT'), 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, f1); gl.bindTexture(gl.TEXTURE_2D, entrada); gl.uniform2f(ubic(progD, 'uDir'), 1 / w, 0); dibujar();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f2); gl.bindTexture(gl.TEXTURE_2D, tmp); gl.uniform2f(ubic(progD, 'uDir'), 0, 1 / h); dibujar();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(f1); gl.deleteFramebuffer(f2); gl.deleteTexture(tmp);
    return out;
  }

  return {
    get listo(){ return !!gl; },
    get maxLado(){ return gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 4096; },

    iniciar(canvas){
      lienzo = canvas;
      gl = canvas.getContext('webgl2', { antialias:false, premultipliedAlpha:false, preserveDrawingBuffer:false });
      if (!gl) return false;
      let n = 0; progD = compilar(FS_DESENFOQUE); progD.__id = ++n; progR = compilar(FS_REVELADO); progR.__id = ++n;
      buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      lutTex = textura(256, 1, curvaLUT(CURVA_DEF));
      canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); toast('El teléfono liberó la memoria de la foto. Vuelve a abrirla.', 3500); });
      return true;
    },

    /* Sube una imagen (img, canvas o ImageBitmap) reducida a maxLado y prepara sus desenfoques */
    fuente(img, maxLado){
      const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      const k = Math.min(1, Math.min(maxLado, this.maxLado) / Math.max(iw, ih)), w = Math.max(1, Math.round(iw * k)), h = Math.max(1, Math.round(ih * k));
      let datos = img;
      if (k < 1) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(img, 0, 0, w, h); datos = c; }
      const tex = textura(w, h, datos), L = Math.max(w, h);
      const S = desenfocar(tex, w, h, Math.max(.8, L / 1600));
      const mw = Math.ceil(w / 2), mh = Math.ceil(h / 2), M = desenfocar(S, mw, mh, L / 600);
      const lw = Math.ceil(w / 4), lh = Math.ceil(h / 4), Lt = desenfocar(M, lw, lh, L / 240);
      const H = desenfocar(Lt, Math.ceil(w / 8), Math.ceil(h / 8), L / 190);
      return { w, h, tex, S, M, L:Lt, H, liberar(){ [tex, S, M, Lt, H].forEach(t => gl.deleteTexture(t)); } };
    },

    /* Pinta en el lienzo (opciones.destino ausente) o en un búfer propio que se devuelve como píxeles.
       op: { ancho, alto, antes, recorte (rect a mostrar), verMascara, destino:'pixeles' } */
    revelar(f, a, op){
      const W = op.ancho, H = op.alto;
      const clave = JSON.stringify(a.curva);
      if (clave !== lutClave) { gl.bindTexture(gl.TEXTURE_2D, lutTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, curvaLUT(a.curva)); lutClave = clave; }
      let fb = null, tex = null;
      if (op.destino === 'pixeles') { tex = textura(W, H); fb = destino(tex); }
      else { if (lienzo.width !== W || lienzo.height !== H) { lienzo.width = W; lienzo.height = H; } gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
      gl.viewport(0, 0, W, H); gl.useProgram(progR);
      const u = (n, ...v) => gl['uniform' + (v.length === 1 && typeof v[0] !== 'object' ? '1f' : v.length + 'f')](ubic(progR, n), ...v);
      [['uSrc', f.tex], ['uS', f.S], ['uM', f.M], ['uL', f.L], ['uH', f.H], ['uCurva', lutTex]].forEach(([n, t], i) => {
        gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(ubic(progR, n), i);
      });
      const M = matrizGeo(a.geo, f.w, f.h, op.recorte || a.geo), L = Math.max(f.w, f.h);
      gl.uniformMatrix3fv(ubic(progR, 'uGeo'), false, [M[0], M[3], 0, M[1], M[4], 0, M[2], M[5], 1]);
      u('uVoltear', op.destino === 'pixeles' ? 0 : 1);
      u('uSal', W, H); u('uAsp', f.w / L, f.h / L); u('uAntes', op.antes ? 1 : 0); u('uSemilla', semilla);
      const c = k => a[k] / 100;
      u('uA1', a.exposicion, c('contraste'), c('altas'), c('sombras'));
      u('uA2', c('blancos'), c('negros'), c('temperatura'), c('matiz'));
      u('uA3', c('intensidad'), c('saturacion'), c('textura'), c('claridad'));
      u('uA4', c('neblina'), c('nitidez'), (a.nitidez_radio - .5) / 2.5, c('ruido'));
      u('uA5', c('ruido_color'), c('grano'), c('grano_tam'), c('grano_asp'));
      u('uVin', c('vineta'), c('vineta_punto'), c('vineta_redondez'), c('vineta_desv'));
      gl.uniform3fv(ubic(progR, 'uMez'), BANDAS.flatMap(b => [c('m_' + b.k + '_h'), c('m_' + b.k + '_s'), c('m_' + b.k + '_l')]));
      gl.uniform4fv(ubic(progR, 'uGrad'), ZONAS.flatMap(z => {
        const s = c('g_' + z.k + '_s') * .22, [r, g, b] = hsvRgb(a['g_' + z.k + '_h'] / 360), l = .2126 * r + .7152 * g + .0722 * b;
        return [(r - l) * s, (g - l) * s, (b - l) * s, c('g_' + z.k + '_l')];
      }));
      u('uGradMB', c('g_mezcla'), c('g_balance'));
      const ms = a.mascaras.slice(0, 8), mg = new Float32Array(64), ma = new Float32Array(64);
      ms.forEach((m, i) => {
        const g = m.tipo === 'radial' ? [1, m.invertir ? 1 : 0, m.desv / 100, m.ang, m.cx, m.cy, m.rx, m.ry] : [0, m.invertir ? 1 : 0, 0, 0, m.x0, m.y0, m.x1, m.y1];
        mg.set(g, i * 8);
        ma.set([m.a.exposicion, m.a.contraste / 100, m.a.altas / 100, m.a.sombras / 100, m.a.temperatura / 100, m.a.matiz / 100, m.a.saturacion / 100, m.a.claridad / 100], i * 8);
      });
      gl.uniform4fv(ubic(progR, 'uMG'), mg); gl.uniform4fv(ubic(progR, 'uMA'), ma);
      gl.uniform1i(ubic(progR, 'uNM'), ms.length); gl.uniform1i(ubic(progR, 'uVerM'), op.verMascara ?? -1);
      dibujar();
      if (!fb) return null;
      const px = new Uint8ClampedArray(W * H * 4);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); gl.deleteTexture(tex);
      return new ImageData(px, W, H);
    },
  };
})();

/* tono (0..1) a RGB a saturación y brillo completos */
function hsvRgb(h){
  const f = n => { const k = (n + h * 6) % 6; return 1 - Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
}
