// The live view — the same waves, marched through instead of sliced. DESIGN §25.
//
// There is no arithmetic here that the panel does not already have. A wave's
// phase from the clock is `rate × t` and its phase from a position is that
// position times how fine it is; those are one expression, so the second the
// panel animates in is a third direction in space. Give a wave the vector
// `(x, y, rate)` — which is what `wavesFrom` has always handed back — and the
// solid at `z = t` is the panel at time `t`, exactly. See `fieldAt` in
// src/field.js, and the test that pins it.
//
// So the flight is not a second picture of the music. It is the same picture
// with the eye put inside it. Three things follow, none of them chosen:
//
//   the speed        One unit a second, forward. Any other speed and what is in
//                    front of the eye is not what the panel would be showing.
//                    It also makes §24's durations distances: the wait for two
//                    notes to come back round is how far ahead the figure
//                    repeats, so a comma is a long tunnel and 3/2 a short one.
//
//   what is ahead    The next few seconds of the panel, in perspective. The
//                    depth marched is about three and a half seconds of it.
//
//   where the eye is On the root's own axis, and not moving. §24 draws the whole
//                    picture *from* the root, and under this engine every note
//                    means its ratio to it, so that axis is where the eye
//                    belongs. Easing it towards the estimated tonal centre made
//                    people dizzy: the centre changes every four seconds or so,
//                    and each change strafed the eye sideways nearly as fast as
//                    it flies forward.
//
// The root itself has no extent, so in a solid it is fog and blinds everything.
// It lights the space instead of filling it — §24's "the root agrees with itself
// everywhere" read in three dimensions. Hold the root and the corridor glows.

import { solidFrom, grainOf } from "./field.js";

// Fewer than the panel's twelve, because the flight sums them seventy times over
// per pixel instead of once. What gets dropped is the faintest, as there.
const MAX_WAVES = 8;

// How far a ray steps, and how many times. Their product is how far ahead you
// can see: three and a half units, which is three and a half seconds of panel.
//
// The step is what decides which ratios can be drawn at all: a wave finer than
// the gap between two samples cannot be sampled honestly, so it fades out
// instead — the `visible` term below. At this step everything the engine's own
// set contains is comfortably sampled, and only the far-flung pads reach the
// limit and come out faint.
const STEP = 0.05;
const STEPS = 70;

// How far ahead the march starts. The eye is inside the solid, and the material
// it is standing in is both meaninglessly magnified and the fastest-sweeping
// thing in the picture — what is nearest always crosses the view quickest.
// Looking at the field rather than through the part you are standing in costs a
// little of the view and settles most of the flicker.
const NEAR = 0.8;

// Settled by looking — see the note at the foot of the file.
const WIDEN = 2.0;

/**
 * A number, written so GLSL will take it as a float.
 *
 * `${2.0}` in a template comes out as "2", and GLSL ES has no implicit
 * conversion from int to float — so `const float WIDEN = 2;` does not compile
 * and the whole view fails to start. Every float folded into the source below
 * goes through here.
 */
const glsl = (value) => (Number.isInteger(value) ? value.toFixed(1) : String(value));

const VERTEX = `
attribute vec2 aCorner;
void main() { gl_Position = vec4(aCorner, 0.0, 1.0); }
`;

// The numbers in here that are not facts about the ratios were settled by
// running the march in node over the sets the music actually produces and
// reading off the contrast. See the note at the foot of this file.
const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec2 uSize;
uniform vec4 uWave[${MAX_WAVES}];
uniform float uGrain[${MAX_WAVES}];
uniform float uTotal;
uniform float uWash;
uniform vec3 uEye;
uniform vec3 uBg;
uniform vec3 uCrest;
uniform vec3 uTrough;
uniform float uDither;

const float TAU = 6.283185307179586;
const float STEP = ${glsl(STEP)};

// How solid a crest is, and how brightly it burns. They are one number, not two:
// a ray through an unbroken crest settles at brightness/solidity whatever the
// solidity, so setting them equal pins the brightest possible ray at exactly one
// and nothing can blow past it.
const float SOLIDITY = 1.8;

// Only where the waves really agree. The panel's own 0.65 power lifts the
// shallow ground so a flat picture shows it, but as a *density* that fills space
// it turns the whole march into fog. A solid has to be mostly empty or you
// cannot see into it, so the curve goes the other way.
const float HARDNESS = 3.0;

// How much the root lights the space it cannot fill.
const float WASH = 0.25;

// How wide the lens is: the panel's own fringe scale, re-chosen for a view of a
// different shape. It changes how much of the picture you are looking at and
// nothing about the picture. At one, the same structure arrives magnified until
// it is clouds.
const float WIDEN = ${glsl(WIDEN)};

// Where the march begins, ahead of the eye.
const float NEAR = ${glsl(NEAR)};

// The sum, at one point in the solid, with anything too fine to sample faded out
// rather than aliased. The blur handed in is the gap between samples here: the
// step along the ray, widened by how far a pixel has spread by this distance.
float fieldAt(vec3 p, float blur) {
  float sum = 0.0;
  for (int i = 0; i < ${MAX_WAVES}; i++) {
    float visible = clamp(1.0 - uGrain[i] * blur, 0.0, 1.0);
    sum += uWave[i].w * visible * cos(TAU * dot(uWave[i].xyz, p));
  }
  return sum / uTotal;
}

void main() {
  // The panel's own framing: one unit ahead is one panel width across.
  vec2 screen = (gl_FragCoord.xy - 0.5 * uSize) / uSize.x;
  vec3 ray = normalize(vec3(screen * WIDEN, 1.0));

  // Start each ray at a different point inside its first step, or every ray
  // crosses the same crests together and the picture bands.
  float grit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453 + uDither);

  float travelled = NEAR + grit * STEP;
  float through = 1.0;
  vec3 lit = vec3(0.0);

  for (int i = 0; i < ${STEPS}; i++) {
    vec3 here = uEye + ray * travelled;
    float height = fieldAt(here, STEP + travelled * WIDEN / uSize.x);

    // Crests are what there is; troughs are what you fly along. That is the
    // panel's reading of the sign — where the waves cancel it shows the page
    // underneath — and in a solid the page underneath is empty space.
    float agree = max(height, 0.0);
    float solid = pow(agree, HARDNESS);

    // The two accents still mean how strongly the waves agree: the edge of a
    // crest is cool, its core runs warm. Mixed on the hardened figure and not
    // the raw height, because half of every crest is above the halfway mark, so
    // mixing on that puts the warm accent over almost the whole picture.
    lit += mix(uCrest, uTrough, solid) * solid * through * STEP * SOLIDITY;
    through *= exp(-SOLIDITY * solid * STEP);

    travelled += STEP;
    if (through < 0.004) break;
  }

  // What is left of the ray shows the space it travelled through — the page,
  // lit by however much root is being held.
  gl_FragColor = vec4(mix(uBg, uCrest, uWash * WASH) * through + lit, 1.0);
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

export class Flight {
  /**
   * Fails soft, the same way the panel does. A browser that cannot run this
   * still has the bench, and the caller checks `ok` and says so.
   */
  constructor(canvas, palette) {
    this.canvas = canvas;
    this.ok = false;

    // Marching is expensive in a way slicing is not, so the view watches its own
    // frame times and gives up resolution rather than smoothness. It only ever
    // goes down: climbing back up as soon as it is comfortable makes it oscillate
    // between two resolutions, which is more distracting than the lower one.
    this.scale = 1;
    this.slow = 0;
    this.lastFrame = 0;

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
        grain: gl.getUniformLocation(program, "uGrain"),
        total: gl.getUniformLocation(program, "uTotal"),
        wash: gl.getUniformLocation(program, "uWash"),
        eye: gl.getUniformLocation(program, "uEye"),
        dither: gl.getUniformLocation(program, "uDither"),
      };
      this.packed = new Float32Array(MAX_WAVES * 4);
      this.grains = new Float32Array(MAX_WAVES);

      gl.uniform3fv(gl.getUniformLocation(program, "uBg"), rgb(palette.bg));
      gl.uniform3fv(gl.getUniformLocation(program, "uCrest"), rgb(palette.crest));
      gl.uniform3fv(gl.getUniformLocation(program, "uTrough"), rgb(palette.trough));

      this.ok = true;
    } catch (error) {
      console.warn("the live view could not start:", error.message);
    }
  }

  /** Match the drawing buffer to the page, at whatever resolution it can afford. */
  resize() {
    const width = Math.max(1, Math.round(this.canvas.clientWidth * this.scale));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * this.scale));
    if (width === this.canvas.width && height === this.canvas.height) return;

    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
    this.gl.uniform2f(this.at.size, width, height);
  }

  /**
   * Give up resolution rather than smoothness.
   *
   * Three slow frames in a row, not one: a single long frame is usually the page
   * doing something else, and dropping resolution for it would leave the view
   * permanently coarser than it needs to be.
   */
  keepUp(clock) {
    if (this.lastFrame) {
      const took = clock - this.lastFrame;
      this.slow = took > 26 ? this.slow + 1 : 0;
      if (this.slow >= 3 && this.scale > 0.4) {
        this.scale = Math.max(0.4, this.scale - 0.2);
        this.slow = 0;
      }
    }
    this.lastFrame = clock;
  }

  /**
   * Draw what is remembered.
   *
   * The eye takes no arguments: it sits on the root's axis and moves forward at
   * the clock, both forced. See the head of the file.
   */
  draw(memory, seconds, clock = 0) {
    this.keepUp(clock);
    this.resize();

    // The sorting is arithmetic and lives in src/field.js, where node can test
    // it. Only the drawing is here.
    const { waves, total, wash } = solidFrom(memory, MAX_WAVES);

    this.packed.fill(0);
    this.grains.fill(0);
    waves.forEach((wave, i) => {
      this.packed[i * 4] = wave.x;
      this.packed[i * 4 + 1] = wave.y;
      this.packed[i * 4 + 2] = wave.rate;
      this.packed[i * 4 + 3] = wave.amp;
      this.grains[i] = grainOf(wave);
    });

    this.gl.uniform4fv(this.at.wave, this.packed);
    this.gl.uniform1fv(this.at.grain, this.grains);
    this.gl.uniform1f(this.at.total, total);
    this.gl.uniform1f(this.at.wash, wash);
    this.gl.uniform3f(this.at.eye, 0, 0, seconds);
    this.gl.uniform1f(this.at.dither, (clock / 1000) % 1);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);

    return waves;
  }
}

// Checking it without a browser, the same way §24 checked the panel.
//
// The march is re-run in node over the sets the engine actually produces, and
// the constants above are where the contrast came out best across all of them at
// once — from 0.75 for the hexany opening down to 0.38 for the drone alone,
// which is one quiet note and correctly dim. Two failures were found this way
// rather than by looking, and both are recorded above: the fog the root made,
// and the panel's own 0.65 curve flattening the march when used as a density.
//
// The motion is measured too, because §24's strobe was exactly a picture that
// changed all at once instead of streaming. Between two moments a tenth of a
// second apart, pixels move by 0.04 while the frame as a whole shifts by 0.015,
// so most of what changes is structure going past. The root alone does not move
// at all, and the comma pair moves at a fifth the speed of the hexany — the long
// tunnel turning up in the measurement rather than in the prose.
