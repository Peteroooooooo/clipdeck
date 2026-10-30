// The search glow's light, drawn by one fragment shader over the whole window: a near-white core
// at the edge, a colour band and a soft halo inwards. Colours flow along the edge by arc length
// (so short sides and corners are as smooth as long ones), blend in OKLab (no grey between two
// colours) and add up as light. Four waves at unrelated speeds swell and ebb the band along the
// edge, Siri style. Tuned in docs/search-glow-demo.html.

const PALETTE = ['#3fe0ff', '#4f86ff', '#9b6bff', '#ff6ec4', '#ffa86b', '#6ff2d2']
/** Seconds for the colours to flow once round the window. */
const LAP_S = 3.5
const WAVE_SPEED = 1
const WAVE_AMP = 0.6
/** Width of the colour band and of the halo behind it, CSS px. */
const BAND_PX = 10
const HALO_PX = 10
const BRIGHTNESS = 1
const SATURATION = 1.2

const VERTEX = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uDpr, uRadius, uTime, uPresence, uReach;
uniform vec3 uLab[6];
out vec4 outColor;

const float PI = 3.14159265;
const float TAU = 6.28318531;
const float LAP = ${LAP_S.toFixed(3)};
const float WAVE_SPEED = ${WAVE_SPEED.toFixed(3)};
const float WAVE_AMP = ${WAVE_AMP.toFixed(3)};
const float BAND = ${BAND_PX.toFixed(3)};
const float HALO = ${HALO_PX.toFixed(3)};
const float BRIGHT = ${BRIGHTNESS.toFixed(3)};
const float SAT = ${SATURATION.toFixed(3)};

float sdRoundRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// Position along the edge, 0..1 clockwise from the top centre, by arc length of a rounded
// rectangle with corners of radius rr: every point less than rr deep gets a smooth position;
// the seams between sides only start rr deep, and the light is cut off before that.
float edgePosition(vec2 p, vec2 b, float rr) {
  float w = b.x - rr, h = b.y - rr, q = PI * 0.5 * rr;
  float L = 4.0 * (w + h + q);
  vec2 a = abs(p);
  float s;
  if (a.x > w && a.y > h) {
    if (p.x > 0.0 && p.y < 0.0) { vec2 v = p - vec2(w, -h); s = w + rr * atan(v.x, -v.y); }
    else if (p.x > 0.0)        { vec2 v = p - vec2(w, h);  s = w + q + 2.0 * h + rr * atan(v.y, v.x); }
    else if (p.y > 0.0)        { vec2 v = p - vec2(-w, h); s = 3.0 * w + 2.0 * q + 2.0 * h + rr * atan(-v.x, v.y); }
    else                       { vec2 v = p - vec2(-w, -h); s = 3.0 * w + 3.0 * q + 4.0 * h + rr * atan(-v.y, -v.x); }
  } else if (b.x - a.x < b.y - a.y) {
    s = p.x > 0.0 ? w + q + (p.y + h) : 3.0 * w + 3.0 * q + 2.0 * h + (h - p.y);
  } else {
    s = p.y < 0.0 ? p.x : w + 2.0 * q + 2.0 * h + (w - p.x);
  }
  return fract(s / L);
}

vec3 oklabToLinear(vec3 c) {
  float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  float l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
   -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
   -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}

vec3 palette(float u) {
  float x = fract(u) * 6.0;
  int i = int(floor(x));
  int j = (i + 1) % 6;
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  vec3 c = mix(uLab[i], uLab[j], f);
  c.yz *= SAT;
  return max(oklabToLinear(c), 0.0);
}

vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec2 b = uRes / uDpr * 0.5;
  vec2 p = (gl_FragCoord.xy - uRes * 0.5) / uDpr;
  p.y = -p.y;
  float d = sdRoundRect(p, b, uRadius);
  float coverage = clamp(0.5 - d * uDpr, 0.0, 1.0);
  float e = max(-d, 0.0);
  float rr = min(b.x, b.y) * 0.75;
  // Fixed, not swaying: a swaying cutoff draws a lumpy inner edge. The middle stays clear glass.
  float reach = uReach * (1.0 + 0.06 * sin(TAU * 0.42 * uTime));
  float cutoff = min(HALO * reach * 3.0, rr - 12.0);
  if (coverage <= 0.0 || e >= cutoff) { outColor = vec4(0.0); return; }
  float fade = 1.0 - smoothstep(0.0, cutoff, e);
  fade *= fade;

  float u = edgePosition(p, b, rr);
  float t = uTime * WAVE_SPEED;
  // Whole numbers of waves per lap, so there is no seam where the edge closes.
  float wave = 0.5 * sin(TAU * (2.0 * u + 0.55 * t))
             + 0.32 * sin(TAU * (3.0 * u - 0.80 * t) + 1.7)
             + 0.22 * sin(TAU * (5.0 * u + 1.15 * t) + 0.6)
             + 0.14 * sin(TAU * (7.0 * u - 1.60 * t) + 2.3);
  wave /= 1.18;
  float swell = max(0.22, 1.0 + WAVE_AMP * 1.15 * wave);
  float glint = 0.72 + 0.28 * (0.6 * sin(TAU * (u - 0.31 * t) + 0.9) + 0.4 * sin(TAU * (4.0 * u + 0.67 * t) + 2.1));
  glint *= mix(1.0, swell, 0.35);

  float cu = u - uTime / LAP + 0.035 * sin(TAU * (2.0 * u + 0.17 * uTime));
  vec3 col = palette(cu) * glint;

  float bandW = BAND * swell * reach;
  float haloW = HALO * mix(1.0, swell, 0.7) * reach;
  float core = exp(-e / (1.1 * mix(1.0, swell, 0.4)));
  float band = exp(-pow(e / bandW, 2.0));
  float halo = exp(-e / haloW);
  float haze = exp(-e / (HALO * reach * 1.6));

  // Linear light, tone-mapped: where layers overlap the light turns brighter and whiter.
  vec3 c = col * (1.25 * band + 0.5 * halo + 0.16 * haze) + mix(col, vec3(1.0), 0.7) * core * 1.1;
  c *= BRIGHT * uPresence * fade;
  c = 1.0 - exp(-c * 1.5);

  vec3 s = linearToSrgb(c);
  // Dither: no rings of 8-bit steps in the faint haze.
  s += (hash(gl_FragCoord.xy + fract(uTime * 7.0) * 91.0) - 0.5) / 255.0 * fade;
  s = clamp(s, 0.0, 1.0) * coverage;
  // Premultiplied, alpha = brightest channel: over the dark glass this is the light itself.
  outColor = vec4(s, max(s.r, max(s.g, s.b)));
}`

function srgbToOklab(hex: string): number[] {
  const n = Number.parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((value) => {
    const c = value / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

export interface EdgeGlowFrame {
  /** Seconds since the glow started. */
  time: number
  /** 0 (out) to 1 (fully lit). */
  presence: number
  /** How far in the light reaches, 1 at rest (more while it blooms in). */
  reach: number
}

export interface EdgeGlowRenderer {
  /** Canvas size in device px, the window's corner radius in CSS px. */
  resize(width: number, height: number, dpr: number, radius: number): void
  draw(frame: EdgeGlowFrame): void
  dispose(): void
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('edge glow shader:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

/** Null where WebGL2 is unavailable (then there is simply no glow). */
export function createEdgeGlowRenderer(canvas: OffscreenCanvas): EdgeGlowRenderer | null {
  let gl: WebGL2RenderingContext | null = null
  try {
    gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false, depth: false, stencil: false })
  } catch {
    return null
  }
  if (!gl) return null

  const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
  const program = gl.createProgram()
  if (!vertex || !fragment || !program) return null
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('edge glow program:', gl.getProgramInfoLog(program))
    return null
  }
  gl.useProgram(program)

  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  // One triangle that covers the whole viewport.
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'aPos')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

  const uniform = (name: string) => gl.getUniformLocation(program, name)
  const u = {
    res: uniform('uRes'),
    dpr: uniform('uDpr'),
    radius: uniform('uRadius'),
    time: uniform('uTime'),
    presence: uniform('uPresence'),
    reach: uniform('uReach'),
  }
  gl.uniform3fv(uniform('uLab'), new Float32Array(PALETTE.flatMap(srgbToOklab)))
  gl.clearColor(0, 0, 0, 0)

  return {
    resize(width, height, dpr, radius) {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      gl.viewport(0, 0, width, height)
      gl.uniform2f(u.res, width, height)
      gl.uniform1f(u.dpr, dpr)
      gl.uniform1f(u.radius, radius)
    },
    draw({ time, presence, reach }) {
      gl.clear(gl.COLOR_BUFFER_BIT)
      if (presence <= 0) return
      gl.uniform1f(u.time, time)
      gl.uniform1f(u.presence, presence)
      gl.uniform1f(u.reach, reach)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    dispose() {
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
      gl.deleteShader(vertex)
      gl.deleteShader(fragment)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
