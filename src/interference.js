// The field panel — src/field.js worked out on the GPU.
//
// One fragment shader, one triangle covering the panel, and a dozen waves handed
// in as uniforms every frame. The arithmetic per pixel is a sum of cosines, which
// is small enough that the whole thing costs nothing and honest enough that the
// picture really is the sum of the waves rather than an impression of one.

import { wavesFrom, phaseAt } from "./field.js";

// The shader holds a fixed number of slots. Unused ones carry an amplitude of
// zero and are summed anyway — a branch per pixel would cost more than the
// cosine it skips, and a fixed loop keeps this within the oldest GLSL we might
// meet.
const MAX_WAVES = 12;

// One bit of complexity becomes one fringe across the width of the panel,
// whatever that width happens to be. So 3/2 draws two and a half broad bands and
// 81/64 draws twelve fine ones, and it is the same picture on a phone as on a
// desk.
//
// Across the width rather than the height, because the panel is much wider than
// it is tall: measured against the short side, the finer ratios came out as
// dozens of fringes crossing a second wave, which is plaid rather than
// interference.
const FRINGE = Math.PI * 2;

const VERTEX = `
attribute vec2 aCorner;
void main() { gl_Position = vec4(aCorner, 0.0, 1.0); }
`;

// A wave is packed as (x, y, phase, amplitude). Position is measured out from
// the centre in widths, so the picture keeps its proportions and its centre
// whatever size the panel is.
//
// The crest colour and the trough colour are the two accents of the page, so
// where waves reinforce reads warm or cool depending on which way, and the
// nodal lines where they cancel fall back to the page's own background.
const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uSize;
uniform vec4 uWave[${MAX_WAVES}];
uniform vec3 uBg;
uniform vec3 uCrest;
uniform vec3 uTrough;

void main() {
  vec2 here = (gl_FragCoord.xy - 0.5 * uSize) / uSize.x;

  float sum = 0.0;
  float total = 0.0;
  for (int i = 0; i < ${MAX_WAVES}; i++) {
    vec4 wave = uWave[i];
    sum += wave.w * cos(dot(wave.xy, here) + wave.z);
    total += wave.w;
  }

  // Divided by the waves present, so a crowd cannot clip, but never by less
  // than one note's worth, so a single fading note fades instead of blooming
  // back to full contrast on its way out.
  float height = sum / max(total, 1.0);

  // A gentle curve, because the interesting part of an interference picture is
  // the shallow ground between the extremes and a straight ramp buries it.
  float crest = pow(max(height, 0.0), 0.65);
  float trough = pow(max(-height, 0.0), 0.65);

  vec3 shade = mix(uBg, uCrest, crest * 0.85);
  shade = mix(shade, uTrough, trough * 0.5);
  gl_FragColor = vec4(shade, 1.0);
}
`;

function compile(gl, kind, source) {
  const shader = gl.createShader(kind);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(shader));
  }
  return shader;
}

/** "#7fd4c1" as the three numbers a shader wants. */
function rgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}

export class Field {
  /**
   * Fails soft. A browser without WebGL still has every other panel, and the
   * caller checks `ok` and says so rather than leaving a dead rectangle.
   */
  constructor(canvas, palette) {
    this.canvas = canvas;
    this.ok = false;
    this.wasEmpty = false;

    const gl = canvas.getContext("webgl", { alpha: false, depth: false, antialias: false });
    if (!gl) return;

    try {
      const program = gl.createProgram();
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program));
      }
      gl.useProgram(program);

      // One triangle big enough to cover the panel, which needs no index buffer
      // and no second pass over the diagonal that two triangles share.
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const corner = gl.getAttribLocation(program, "aCorner");
      gl.enableVertexAttribArray(corner);
      gl.vertexAttribPointer(corner, 2, gl.FLOAT, false, 0, 0);

      this.gl = gl;
      this.at = {
        size: gl.getUniformLocation(program, "uSize"),
        wave: gl.getUniformLocation(program, "uWave"),
      };
      this.packed = new Float32Array(MAX_WAVES * 4);

      gl.uniform3fv(gl.getUniformLocation(program, "uBg"), rgb(palette.bg));
      gl.uniform3fv(gl.getUniformLocation(program, "uCrest"), rgb(palette.crest));
      gl.uniform3fv(gl.getUniformLocation(program, "uTrough"), rgb(palette.trough));

      this.ok = true;
    } catch (error) {
      console.warn("the field panel could not start:", error.message);
    }
  }

  /** Match the drawing buffer to the panel, at up to twice the CSS resolution. */
  resize() {
    const density = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(this.canvas.clientWidth * density));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * density));
    if (width === this.canvas.width && height === this.canvas.height) return;

    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
    this.gl.uniform2f(this.at.size, width, height);
  }

  /**
   * Draw what is remembered, and hand back the waves that were drawn so the
   * caller can say something about them without working them out twice.
   */
  draw(memory, seconds) {
    const waves = wavesFrom(memory, MAX_WAVES);

    // Nothing sounding is a flat panel, and a flat panel only has to be painted
    // once. The phases go on advancing underneath; there is simply nothing for
    // them to move.
    if (waves.length === 0 && this.wasEmpty) return waves;
    this.wasEmpty = waves.length === 0;

    this.resize();
    this.packed.fill(0);
    waves.forEach((wave, i) => {
      this.packed[i * 4] = wave.x * FRINGE;
      this.packed[i * 4 + 1] = wave.y * FRINGE;
      this.packed[i * 4 + 2] = phaseAt(wave, seconds);
      this.packed[i * 4 + 3] = wave.amp;
    });

    this.gl.uniform4fv(this.at.wave, this.packed);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
    return waves;
  }
}
