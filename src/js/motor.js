/* Motor de revelado en WebGL2.
   Una "fuente" es la foto subida como textura más cuatro desenfoques que alimentan los ajustes locales:
   S (detalle fino: nitidez y ruido), M (textura), L (claridad) y H (neblina). Un solo sombreador aplica todo
   en este orden, como Lightroom:
     geometría (recorte, enderezar, transformación y distorsión) > aberración cromática > Quitar >
     desenfoque de lente > ruido > nitidez > desfleco > textura y claridad > neblina > viñeteado del objetivo >
     exposición y balance de blancos > tono > curva (perfil, paramétrica y de puntos) > mezcla de color o
     blanco y negro > intensidad y saturación > gradación > máscaras > viñeta > grano > avisos de recorte. */

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
uniform sampler2D uSrc, uS, uM, uL, uH, uCurva, uPincel;
uniform highp sampler2D uManchas;
uniform mat3 uGeo1, uGeo2;
uniform vec2 uWo, uSal, uAsp;
uniform vec4 uW1, uW2;
uniform float uAntes, uSemilla, uDiv, uAvisos;
uniform vec4 uA1, uA2, uA3, uA4, uA5, uA6, uVin, uOpt, uOpt2, uDes, uDes2;
uniform vec3 uMez[8];
uniform vec4 uGrad[4];
uniform vec2 uGradMB;
uniform int uNM, uVerM, uNS;
uniform vec4 uMG[24], uMA[32];

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
/* transformación de geometría en el marco orientado (0..1): escala, desplazamiento, aspecto, rotación,
   perspectiva vertical y horizontal, y distorsión de barril o cojín */
vec2 deformar(vec2 o){
  vec2 P = (o - .5) * uWo;
  P = P / uW1.x - vec2(uW2.z, -uW2.w) * .25;
  if (uW1.y > 0.) P.x /= 1. + uW1.y * .3; else P.y /= 1. - uW1.y * .3;
  float cr = cos(uW1.z), sr = sin(uW1.z); P = vec2(cr * P.x - sr * P.y, sr * P.x + cr * P.y);
  P /= 1. - uW2.x * .9 * P.y - uW2.y * .9 * P.x;
  P *= 1. + uW1.w * dot(P, P) * 1.2;
  return P / uWo + .5;
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
vec3 aplicarL(vec3 c, float L, float nL){ return mix(c + (nL - L), c * (nL / max(L, .02)), .5); }
vec3 balance(float te, float ti){
  vec3 wb = vec3(1. + te * .28, 1., 1. - te * .28) * vec3(1. + ti * .12, 1. - ti * .18, 1. + ti * .12);
  return wb / lum(wb);
}
vec3 neblina(vec3 c, float dh, vec3 h){
  if (dh > 0.) { float t = max(1. - dh * .85 * min(h.r, min(h.g, h.b)), .25); return (c - .95) / t + .95; }
  return mix(c, vec3(.8), -dh * .4);
}
/* ajustes de una máscara con peso w.
   a0: temperatura, matiz, exposición, contraste; a1: altas, sombras, blancos, negros;
   a2: saturación, textura, claridad, neblina; a3: nitidez, ruido, color (tono 0..1), color (intensidad) */
vec3 local(vec3 c, float w, vec4 a0, vec4 a1, vec4 a2, vec4 a3, vec3 det, vec3 s, vec3 m, vec3 h){
  if (a3.y > 0.) c = mix(c, s, a3.y * w * .8);
  c = a3.x >= 0. ? c + (c - s) * a3.x * w * 1.5 : mix(c, m, -a3.x * w);
  c += (s - m) * a2.y * w * 1.3;
  float Lm = lum(c); c += det * a2.z * .9 * 4. * Lm * (1. - Lm) * w;
  if (a2.w != 0.) c = neblina(c, a2.w * w, h);
  vec3 lin = pow(max(c, 0.), vec3(2.2)) * exp2(a0.z * w) * balance(a0.x * w, a0.y * w);
  c = pow(lin, vec3(1. / 2.2));
  float L = lum(c); c = aplicarL(c, L, tono(L, a0.w * w, a1.x * w, a1.y * w, a1.z * w, a1.w * w));
  float L2 = lum(c); c = vec3(L2) + (c - vec3(L2)) * max(0., 1. + a2.x * w);
  if (a3.w > 0.) { vec3 col = hsv2rgb(vec3(a3.z, 1., 1.)); c += (col - vec3(lum(col))) * a3.w * .3 * w; }
  return c;
}

void main(){
  /* geometría: de la salida al marco orientado, transformación y de ahí a la foto */
  vec2 po = (uGeo1 * vec3(vUV, 1.)).xy;
  vec2 uv = (uGeo2 * vec3(deformar(po), 1.)).xy;
  if (uv.x < 0. || uv.y < 0. || uv.x > 1. || uv.y > 1.) { o = vec4(vec3(.11), 1.); return; }
  vec3 c = texture(uSrc, uv).rgb;
  if (uAntes > .5 || (uDiv >= 0. && vUV.x < uDiv)) { o = vec4(c, 1.); return; }
  vec3 s = texture(uS, uv).rgb, m = texture(uM, uv).rgb, l = texture(uL, uv).rgb, h = texture(uH, uv).rgb;

  /* aberración cromática: el rojo y el azul se corrigen en escala radial */
  if (uOpt.x != 0.) { float k = uOpt.x * .003; c.r = texture(uSrc, .5 + (uv - .5) * (1. + k)).r; c.b = texture(uSrc, .5 + (uv - .5) * (1. - k)).b; }

  /* Quitar: cada mancha copia otra zona; en modo recuperar, iguala el color y la luz del entorno */
  for (int i = 0; i < 64; i++) {
    if (i >= uNS) break;
    vec4 t0 = texelFetch(uManchas, ivec2(i * 2, 0), 0), t1 = texelFetch(uManchas, ivec2(i * 2 + 1, 0), 0);
    float dist = length((uv - t0.xy) * uAsp);
    if (dist >= t0.z) continue;
    float w = (1. - smoothstep(t0.z * (1. - t0.w), t0.z, dist)) * t1.w;
    vec2 uv2 = uv + (t1.xy - t0.xy);
    vec3 cc = texture(uSrc, uv2).rgb, ss = texture(uS, uv2).rgb;
    if (t1.z > .5) { vec3 corr = texture(uM, uv).rgb - texture(uM, uv2).rgb; cc += corr; ss += corr; }
    c = mix(c, cc, w); s = mix(s, ss, w);
  }
  vec3 c0 = c, det = c - l;

  /* desenfoque de lente: todo lo que está fuera del área de enfoque se suaviza */
  if (uDes.x > 0.) {
    vec2 v = (uv - uDes.yz) * uAsp; float ca = cos(uDes2.z), sa = sin(uDes2.z);
    v = vec2(ca * v.x + sa * v.y, -sa * v.x + ca * v.y);
    float e = length(v / max(uDes2.xy, vec2(1e-4))), f = max(uDes.w, .02);
    float b = smoothstep(1. - f, 1. + f, e) * uDes.x;
    vec3 bl = mix(m, l, smoothstep(.3, 1., b));
    float k = smoothstep(0., .35, b);
    c = mix(c, bl, k); s = mix(s, bl, k); det *= 1. - k;
  }

  /* reducción de ruido: suaviza donde no hay bordes; el detalle sube el umbral de lo que se respeta */
  float nr = uA4.w;
  if (nr > 0.) { float e = length(c - s); c = mix(c, mix(s, m, nr * .35), nr * (1. - smoothstep(.015, mix(.24, .06, uA6.z) * (.6 + nr), e))); }
  if (uA5.x > 0.) c += ((m - vec3(lum(m))) - (c - vec3(lum(c)))) * uA5.x;
  /* nitidez con radio, detalle (cuánto halo se permite) y máscara (solo en bordes) */
  if (uA4.y > 0.) {
    vec3 d = c - mix(s, m, uA4.z * .6); float lim = mix(.03, .3, uA6.x);
    d = clamp(d * mix(.7, 1.3, uA6.x), -lim, lim);
    float wm = uA6.y > 0. ? smoothstep(uA6.y * .06, uA6.y * .06 + .05, length(s - m)) : 1.;
    c += d * uA4.y * 1.6 * wm;
  }
  /* desfleco: apaga orillas púrpura y verde junto a bordes de alto contraste */
  if (uOpt.y + uOpt.z > 0.) {
    float e = clamp(length(c - m) * 6., 0., 1.); float hd = rgb2hsv(c).x * 360.;
    float wp = 1. - smoothstep(10., 45., abs(hd - 295.)), wg = 1. - smoothstep(10., 40., abs(hd - 120.));
    c = mix(c, vec3(lum(c)), clamp(e * (uOpt.y * wp + uOpt.z * wg) * 1.5, 0., 1.));
  }
  /* textura, claridad y neblina */
  c += (s - m) * uA3.z * 1.3;
  float Lm = lum(c); c += det * uA3.w * .9 * 4. * Lm * (1. - Lm);
  if (uA4.x != 0.) c = neblina(c, uA4.x, h);

  /* exposición, balance de blancos y viñeteado del objetivo en luz lineal */
  vec3 lin = pow(max(c, 0.), vec3(2.2)) * exp2(uA1.x) * balance(uA2.z, uA2.w);
  if (uOpt.w != 0.) { float rr = length((uv - .5) * uAsp) / length(uAsp * .5); lin *= 1. + uOpt.w * 1.2 * pow(rr, 1. + 3. * uOpt2.x); }
  c = pow(lin, vec3(1. / 2.2));
  /* tono */
  float L = lum(c);
  c = clamp(aplicarL(c, L, tono(L, uA1.y, uA1.z, uA1.w, uA2.x, uA2.y)), 0., 1.);
  /* curva de tonos (incluye la del perfil y la paramétrica) */
  vec3 k = c * (255. / 256.) + .5 / 256.;
  c = vec3(texture(uCurva, vec2(k.r, .5)).r, texture(uCurva, vec2(k.g, .5)).g, texture(uCurva, vec2(k.b, .5)).b);

  /* mezcla de color por bandas de tono; en blanco y negro, la luminancia de cada banda arma la mezcla de grises */
  vec3 hsv = rgb2hsv(c), acc = vec3(0.); float ws = 0., hd = hsv.x * 360.;
  for (int i = 0; i < 8; i++) {
    float d = abs(hd - TONOS[i]); d = min(d, 360. - d);
    float w = max(0., 1. - d / 50.); w = w * w * (3. - 2. * w);
    acc += uMez[i] * w; ws += w;
  }
  acc /= max(ws, 1.);
  if (uOpt2.y > .5) {
    c = vec3(clamp(lum(c) * (1. + acc.z * .9 * smoothstep(.02, .2, hsv.y)), 0., 1.));
  } else {
    if (ws > 0.) {
      float sw = smoothstep(.03, .25, hsv.y);
      hsv.x = fract(hsv.x + acc.x * sw * 30. / 360.);
      hsv.y = clamp(hsv.y * (1. + acc.y * sw), 0., 1.);
      c = hsv2rgb(hsv) * (1. + acc.z * .5 * sw * min(1., hsv.y * 1.5));
    }
    /* intensidad (protege lo ya saturado) y saturación */
    float Ls = lum(c), sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
    c = vec3(Ls) + (c - vec3(Ls)) * max(0., 1. + uA3.y + uA3.x * (1. - min(1., sat * 1.4)));
  }

  /* gradación de color: sombras, medios, luces y global */
  float Lg = lum(c), p = .5 + uGradMB.y * .25, wd = .2 + uGradMB.x * .45;
  float wS = 1. - smoothstep(p - wd, p + wd * .3, Lg), wH = smoothstep(p - wd * .3, p + wd, Lg), wM = clamp(1. - wS - wH, 0., 1.);
  c += uGrad[0].rgb * wS + uGrad[1].rgb * wM + uGrad[2].rgb * wH + uGrad[3].rgb;
  c += (uGrad[0].w * wS + uGrad[1].w * wM + uGrad[2].w * wH + uGrad[3].w) * .25;

  /* máscaras: 0 lineal, 1 radial, 2 pincel, 3 rango de luminancia, 4 rango de color */
  vec2 q = uv * uAsp; float ver = 0.;
  for (int i = 0; i < 8; i++) {
    if (i >= uNM) break;
    vec4 g0 = uMG[i * 3], g1 = uMG[i * 3 + 1], g2 = uMG[i * 3 + 2];
    float w, t = g0.x;
    if (t < .5) {
      vec2 A = g1.xy * uAsp, d = g1.zw * uAsp - A;
      w = 1. - smoothstep(0., 1., dot(q - A, d) / max(dot(d, d), 1e-6));
    } else if (t < 1.5) {
      vec2 v = q - g1.xy * uAsp; float ca = cos(g0.w), sa = sin(g0.w);
      v = vec2(ca * v.x + sa * v.y, -sa * v.x + ca * v.y);
      float e = length(v / max(g1.zw, vec2(1e-4))), f = max(g2.x, .02);
      w = 1. - smoothstep(1. - f, 1., e);
    } else if (t < 2.5) {
      vec4 pc = texture(uPincel, uv); w = g0.w < .5 ? pc.r : g0.w < 1.5 ? pc.g : g0.w < 2.5 ? pc.b : pc.a;
    } else if (t < 3.5) {
      float L0 = lum(c0), sv = max(g2.z, .01);
      w = smoothstep(g2.x - sv, g2.x, L0) * (1. - smoothstep(g2.y, g2.y + sv, L0));
    } else {
      vec3 a = c0 - vec3(lum(c0)), b = g2.rgb - vec3(lum(g2.rgb));
      float d = length(a - b) * 2. + abs(lum(c0) - lum(g2.rgb)) * .5;
      w = 1. - smoothstep(g1.x * .5, g1.x, d);
    }
    if (g0.y > .5) w = 1. - w;
    w *= g0.z;
    if (i == uVerM) ver = w;
    if (w > 0.) c = local(c, w, uMA[i * 4], uMA[i * 4 + 1], uMA[i * 4 + 2], uMA[i * 4 + 3], det, s, m, h);
  }
  if (uVerM >= 0) c = mix(c, vec3(1., .18, .22), ver * .45);

  /* viñeta tras el recorte, con prioridad de altas luces */
  if (uVin.x != 0.) {
    float kr = (uVin.z + 1.) * .5, asp = mix(1., uSal.x / uSal.y, kr);
    float d = length((vUV - .5) * vec2(asp, 1.)) / length(vec2(asp, 1.) * .5);
    float m0 = mix(.2, .9, uVin.y), f = mix(.05, .8, uVin.w);
    float vv = smoothstep(m0 - f * .5, m0 + f * .5, d);
    c = uVin.x < 0. ? c * (1. + uVin.x * vv * .95 * (1. - uA6.w * smoothstep(.55, 1., lum(c)))) : mix(c, vec3(1.), uVin.x * vv * .85);
  }
  /* grano: igual en vista previa y exportación porque se mide sobre el tamaño de salida */
  if (uA5.y > 0.) {
    float cel = (1. + uA5.z * 3.) * max(uSal.x, uSal.y) / 2048.;
    vec2 g = vUV * uSal / cel;
    float n = mix(ruidoValor(g), hash(floor(g * 2.) + uSemilla), uA5.w * .6) - .5, Ln = lum(c);
    c += n * uA5.y * .22 * (.35 + 2.6 * Ln * (1. - Ln));
  }
  c = clamp(c, 0., 1.);
  /* avisos de recorte: rojo donde se queman las luces y azul donde se pierden las sombras */
  if (uAvisos > .5) { if (max(c.r, max(c.g, c.b)) > .996) c = vec3(1., .15, .15); else if (max(c.r, max(c.g, c.b)) < .006) c = vec3(.1, .35, 1.); }
  o = vec4(c, 1.);
}`;

/* ---------- geometría ----------
   Matrices afines [a,b,c,d,e,f]: x' = a x + b y + c, y' = d x + e y + f. Se componen de la salida hacia la foto
   en dos tramos: salida > marco orientado (recorte y enderezar) y marco orientado > foto (volteos y giros de 90°).
   Entre los dos va la transformación de Geometría, igual que en el sombreador. */
const afMul = (A, B) => [A[0] * B[0] + A[1] * B[3], A[0] * B[1] + A[1] * B[4], A[0] * B[2] + A[1] * B[5] + A[2],
  A[3] * B[0] + A[4] * B[3], A[3] * B[1] + A[4] * B[4], A[3] * B[2] + A[4] * B[5] + A[5]];
const afAplicar = (M, x, y) => [M[0] * x + M[1] * y + M[2], M[3] * x + M[4] * y + M[5]];
function afInv(M){
  const det = M[0] * M[4] - M[1] * M[3], a = M[4] / det, b = -M[1] / det, d = -M[3] / det, e = M[0] / det;
  return [a, b, -(a * M[2] + b * M[5]), d, e, -(d * M[2] + e * M[5])];
}
const aGL = M => [M[0], M[3], 0, M[1], M[4], 0, M[2], M[5], 1];
/* Tamaño del marco orientado (tras giros de 90°) */
const marcoOrientado = (geo, W, H) => (((geo.rot % 4) + 4) % 4) % 2 ? [H, W] : [W, H];

function matrizSalida(geo, W, H, recorte = geo){
  const [Wo, Ho] = marcoOrientado(geo, W, H), t = geo.angulo * Math.PI / 180;
  return [
    [recorte.w, 0, recorte.x, 0, recorte.h, recorte.y],         // salida -> marco orientado normalizado
    [Wo, 0, -.5 * Wo, 0, Ho, -.5 * Ho],                         // a píxeles centrados
    [Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t), 0], // enderezar
    [1 / Wo, 0, .5, 0, 1 / Ho, .5],                             // de vuelta a 0..1
  ].reduce((M, P) => afMul(P, M), [1, 0, 0, 0, 1, 0]);
}
function matrizFoto(geo){
  const k = ((geo.rot % 4) + 4) % 4;
  return [
    geo.flipH ? [-1, 0, 1, 0, 1, 0] : [1, 0, 0, 0, 1, 0],
    geo.flipV ? [1, 0, 0, 0, -1, 1] : [1, 0, 0, 0, 1, 0],
    [[1, 0, 0, 0, 1, 0], [0, 1, 0, -1, 0, 1], [-1, 0, 1, 0, -1, 1], [0, -1, 1, 1, 0, 0]][k], // deshace el giro de 90°
  ].reduce((M, P) => afMul(P, M), [1, 0, 0, 0, 1, 0]);
}

/* Parámetros de la transformación (los mismos que recibe el sombreador) */
function paramGeo(a, W, H, sinRestriccion = false){
  const [Wo, Ho] = marcoOrientado(a.geo, W, H), L = Math.max(Wo, Ho);
  const p = { wo:[Wo / L, Ho / L], esc:a.escala / 100, asp:a.aspecto / 100, rot:a.rotar * Math.PI / 180, dist:a.distorsion / 100,
    ver:a.vertical / 100, hor:a.horizontal / 100, dx:a.desp_x / 100, dy:a.desp_y / 100 };
  if (a.restringir && !sinRestriccion) p.esc *= escalaRestringida(p);
  return p;
}
function deformar(o, p){
  let x = (o[0] - .5) * p.wo[0], y = (o[1] - .5) * p.wo[1];
  x = x / p.esc - p.dx * .25; y = y / p.esc + p.dy * .25;
  if (p.asp > 0) x /= 1 + p.asp * .3; else y /= 1 - p.asp * .3;
  const c = Math.cos(p.rot), s = Math.sin(p.rot); [x, y] = [c * x - s * y, s * x + c * y];
  const w = 1 - p.ver * .9 * y - p.hor * .9 * x; x /= w; y /= w;
  const r = 1 + p.dist * (x * x + y * y) * 1.2; x *= r; y *= r;
  return [x / p.wo[0] + .5, y / p.wo[1] + .5];
}
const geoNeutra = p => p.esc === 1 && !p.asp && !p.rot && !p.dist && !p.ver && !p.hor && !p.dx && !p.dy;
/* "Restringir recorte": cuánto acercar para que la transformación no deje bordes vacíos */
function escalaRestringida(p){
  if (geoNeutra(p)) return 1;
  const borde = []; for (let i = 0; i <= 16; i++) { const t = i / 16; borde.push([t, 0], [t, 1], [0, t], [1, t]); }
  const cabe = k => { const q = Object.assign({}, p, { esc:p.esc * k }); return borde.every(o => { const [x, y] = deformar(o, q); return x >= -1e-4 && y >= -1e-4 && x <= 1 + 1e-4 && y <= 1 + 1e-4; }); };
  if (cabe(1)) return 1;
  let lo = 1, hi = 4; for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (cabe(m)) hi = m; else lo = m; }
  return hi;
}

/* Cadena completa de la salida (0..1 de lo que se ve) a la foto (0..1) y de vuelta */
function cadenaGeo(a, W, H, recorte = a.geo){
  const M1 = matrizSalida(a.geo, W, H, recorte), M2 = matrizFoto(a.geo), p = paramGeo(a, W, H), I1 = afInv(M1), I2 = afInv(M2);
  return {
    ida:(u, v) => { const o = deformar(afAplicar(M1, u, v), p); return afAplicar(M2, o[0], o[1]); },
    vuelta:(x, y) => {
      const t = afAplicar(I2, x, y); let o = t.slice();
      if (!geoNeutra(p)) for (let i = 0; i < 12; i++) { const d = deformar(o, p); o = [o[0] + t[0] - d[0], o[1] + t[1] - d[1]]; } /* inversa por aproximaciones */
      return afAplicar(I1, o[0], o[1]);
    },
  };
}
/* ¿El recorte cae completo dentro de la foto enderezada? (la transformación de Geometría va aparte:
   sus bordes vacíos los resuelve Restringir recorte, como en Lightroom) */
function recorteValido(a, W, H, r = a.geo){
  const M = afMul(matrizFoto(a.geo), matrizSalida(a.geo, W, H, r));
  return [[0, 0], [1, 0], [0, 1], [1, 1]].every(([u, v]) => { const [x, y] = afAplicar(M, u, v); return x > -1e-4 && y > -1e-4 && x < 1 + 1e-4 && y < 1 + 1e-4; });
}
/* Ajusta el recorte para que quepa en la foto: lo encoge alrededor de su centro (y lo acerca al centro si hace falta) */
function encajarRecorte(a, W, H){
  const geo = a.geo;
  if (recorteValido(a, W, H)) return;
  const cx = geo.x + geo.w / 2, cy = geo.y + geo.h / 2;
  for (const centro of [[cx, cy], [.5, .5]]) {
    let lo = 0, hi = 1;
    for (let i = 0; i < 22; i++) {
      const s = (lo + hi) / 2, r = { w:geo.w * s, h:geo.h * s }; r.x = centro[0] - r.w / 2; r.y = centro[1] - r.h / 2;
      if (r.x >= 0 && r.y >= 0 && r.x + r.w <= 1 && r.y + r.h <= 1 && recorteValido(a, W, H, r)) lo = s; else hi = s;
    }
    if (lo > .02) { const r = { w:geo.w * lo, h:geo.h * lo }; Object.assign(geo, r, { x:centro[0] - r.w / 2, y:centro[1] - r.h / 2 }); return; }
  }
}

const Motor = (() => {
  let gl = null, lienzo, progD, progR, buf, lutTex, lutClave = '', pincelTex, pincelClave = '', manchasTex, manchasClave = '', semilla = Math.random() * 100;
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

  /* Máscaras de pincel: hasta 4, cada una en un canal (R, G, B, A) de una sola textura en el espacio de la foto */
  function actualizarPincel(mascaras, asp){
    const pinceles = mascaras.filter(m => m.tipo === 'pincel').slice(0, 4);
    const clave = JSON.stringify([asp, pinceles.map(m => m.trazos)]);
    if (clave === pincelClave) return; pincelClave = clave;
    const W = Math.max(1, Math.round(1024 * asp[0])), H = Math.max(1, Math.round(1024 * asp[1]));
    const datos = new Uint8Array(W * H * 4);
    pinceles.forEach((m, canal) => {
      const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
      for (const t of m.trazos) {
        const r = Math.max(1, t.r * 1024);
        x.globalCompositeOperation = t.borrar ? 'destination-out' : 'source-over'; x.globalAlpha = t.flujo;
        for (const [px, py] of t.p) {
          const g = x.createRadialGradient(px * W, py * H, 0, px * W, py * H, r);
          g.addColorStop(0, '#fff'); g.addColorStop(clamp(t.dureza, 0, .98), '#fff'); g.addColorStop(1, 'rgba(255,255,255,0)');
          x.fillStyle = g; x.beginPath(); x.arc(px * W, py * H, r, 0, Math.PI * 2); x.fill();
        }
      }
      const d = x.getImageData(0, 0, W, H).data;
      for (let i = 0; i < W * H; i++) datos[i * 4 + canal] = d[i * 4 + 3];
    });
    gl.bindTexture(gl.TEXTURE_2D, pincelTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, datos);
  }
  /* Manchas de Quitar en una textura de datos: (x, y, radio, desvanecer) y (origen x, origen y, modo, opacidad) */
  function actualizarManchas(manchas){
    const clave = JSON.stringify(manchas); if (clave === manchasClave) return; manchasClave = clave;
    const n = Math.max(1, Math.min(64, manchas.length)), d = new Float32Array(n * 8);
    manchas.slice(0, 64).forEach((m, i) => d.set([m.x, m.y, m.r, m.desv / 100, m.sx, m.sy, m.modo === 'clonar' ? 0 : 1, m.opac / 100], i * 8));
    gl.bindTexture(gl.TEXTURE_2D, manchasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, n * 2, 1, 0, gl.RGBA, gl.FLOAT, d);
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
      lutTex = textura(256, 1, curvaLUT(CURVA_DEF)); pincelTex = textura(1, 1, new Uint8Array(4));
      manchasTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, manchasTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      actualizarManchas([]); manchasClave = '';
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
      const M = desenfocar(S, Math.ceil(w / 2), Math.ceil(h / 2), L / 600);
      const Lt = desenfocar(M, Math.ceil(w / 4), Math.ceil(h / 4), L / 240);
      const H = desenfocar(Lt, Math.ceil(w / 8), Math.ceil(h / 8), L / 190);
      return { w, h, tex, S, M, L:Lt, H, liberar(){ [tex, S, M, Lt, H].forEach(t => gl.deleteTexture(t)); } };
    },

    /* Pinta en el lienzo o, con destino 'pixeles', en un búfer propio que se devuelve como ImageData.
       op: { ancho, alto, antes, recorte (rect a mostrar), verMascara, division, avisos, destino } */
    revelar(f, a, op){
      const W = op.ancho, H = op.alto, e = ajustesEfectivos(a);
      const clave = JSON.stringify([a.curva, e.curvaPerfil]);
      if (clave !== lutClave) { gl.bindTexture(gl.TEXTURE_2D, lutTex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, curvaLUT(a.curva, e.curvaPerfil)); lutClave = clave; }
      const L = Math.max(f.w, f.h), asp = [f.w / L, f.h / L];
      actualizarPincel(a.mascaras.slice(0, 8), asp); actualizarManchas(a.manchas);
      let fb = null, tex = null;
      if (op.destino === 'pixeles') { tex = textura(W, H); fb = destino(tex); }
      else { if (lienzo.width !== W || lienzo.height !== H) { lienzo.width = W; lienzo.height = H; } gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
      gl.viewport(0, 0, W, H); gl.useProgram(progR);
      const u = (n, ...v) => gl['uniform' + v.length + 'f'](ubic(progR, n), ...v);
      [['uSrc', f.tex], ['uS', f.S], ['uM', f.M], ['uL', f.L], ['uH', f.H], ['uCurva', lutTex], ['uPincel', pincelTex], ['uManchas', manchasTex]].forEach(([n, t], i) => {
        gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); gl.uniform1i(ubic(progR, n), i);
      });
      const pg = paramGeo(a, f.w, f.h);
      gl.uniformMatrix3fv(ubic(progR, 'uGeo1'), false, aGL(matrizSalida(a.geo, f.w, f.h, op.recorte || a.geo)));
      gl.uniformMatrix3fv(ubic(progR, 'uGeo2'), false, aGL(matrizFoto(a.geo)));
      u('uWo', ...pg.wo); u('uW1', pg.esc, pg.asp, pg.rot, pg.dist); u('uW2', pg.ver, pg.hor, pg.dx, pg.dy);
      u('uVoltear', op.destino === 'pixeles' ? 0 : 1);
      u('uSal', W, H); u('uAsp', ...asp); u('uAntes', op.antes ? 1 : 0); u('uSemilla', semilla);
      u('uDiv', op.division ?? -1); u('uAvisos', op.avisos ? 1 : 0);
      const c = k => e[k] / 100;
      u('uA1', e.exposicion, c('contraste'), c('altas'), c('sombras'));
      u('uA2', c('blancos'), c('negros'), c('temperatura'), c('matiz'));
      u('uA3', c('intensidad'), c('saturacion'), c('textura'), c('claridad'));
      u('uA4', c('neblina'), c('nitidez'), (e.nitidez_radio - .5) / 2.5, c('ruido'));
      u('uA5', c('ruido_color'), c('grano'), c('grano_tam'), c('grano_asp'));
      u('uA6', c('nitidez_detalle'), c('nitidez_mascara'), c('ruido_detalle'), c('vineta_altas'));
      u('uVin', c('vineta'), c('vineta_punto'), c('vineta_redondez'), c('vineta_desv'));
      u('uOpt', c('aberracion'), c('desfleco_purpura'), c('desfleco_verde'), c('vineteado_lente'));
      u('uOpt2', c('vineteado_punto'), e.bn, 0, 0);
      const d = a.desenfoque; u('uDes', d.cant / 100, d.cx, d.cy, d.desv / 100); u('uDes2', d.rx, d.ry, d.ang, 0);
      gl.uniform3fv(ubic(progR, 'uMez'), BANDAS.flatMap(b => [c('m_' + b.k + '_h'), c('m_' + b.k + '_s'), c('m_' + b.k + '_l')]));
      gl.uniform4fv(ubic(progR, 'uGrad'), ZONAS.flatMap(z => {
        const s = c('g_' + z.k + '_s') * .22, [r, g, b] = hsvRgb(e['g_' + z.k + '_h'] / 360), l = .2126 * r + .7152 * g + .0722 * b;
        return [(r - l) * s, (g - l) * s, (b - l) * s, c('g_' + z.k + '_l')];
      }));
      u('uGradMB', c('g_mezcla'), c('g_balance'));
      const ms = a.mascaras.slice(0, 8), mg = new Float32Array(96), ma = new Float32Array(128);
      let canal = 0;
      ms.forEach((m, i) => {
        const base = [0, m.invertir ? 1 : 0, m.cant / 100, 0];
        let g1 = [0, 0, 0, 0], g2 = [0, 0, 0, 0];
        if (m.tipo === 'lineal') g1 = [m.x0, m.y0, m.x1, m.y1];
        if (m.tipo === 'radial') { base[0] = 1; base[3] = m.ang; g1 = [m.cx, m.cy, m.rx, m.ry]; g2 = [m.desv / 100, 0, 0, 0]; }
        if (m.tipo === 'pincel') { base[0] = 2; base[3] = canal++; }
        if (m.tipo === 'luminancia') { base[0] = 3; g2 = [m.desde / 100, m.hasta / 100, m.suav / 100 * .5, 0]; }
        if (m.tipo === 'color') { base[0] = 4; g1 = [.05 + m.tol / 100 * .6, 0, 0, 0]; g2 = m.col ? [...m.col, 0] : [0, 0, 0, 0]; if (!m.col) base[2] = 0; }
        mg.set([...base, ...g1, ...g2], i * 12);
        const x = m.a;
        ma.set([x.temperatura / 100, x.matiz / 100, x.exposicion, x.contraste / 100, x.altas / 100, x.sombras / 100, x.blancos / 100, x.negros / 100,
          x.saturacion / 100, x.textura / 100, x.claridad / 100, x.neblina / 100, x.nitidez / 100, x.ruido / 100, x.color_h / 360, x.color_s / 100], i * 16);
      });
      gl.uniform4fv(ubic(progR, 'uMG'), mg); gl.uniform4fv(ubic(progR, 'uMA'), ma);
      gl.uniform1i(ubic(progR, 'uNM'), ms.length); gl.uniform1i(ubic(progR, 'uVerM'), op.verMascara ?? -1);
      gl.uniform1i(ubic(progR, 'uNS'), Math.min(64, a.manchas.length));
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
