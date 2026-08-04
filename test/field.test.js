import test from "node:test";
import assert from "node:assert/strict";

import { AXES, waveVector, slideRate, wavesFrom, phaseAt } from "../src/field.js";
import { PRIMES, complexity, fromFraction, withOctaves } from "../src/ratio.js";

const TAU = Math.PI * 2;
const f = (n, d) => fromFraction(n, d);
const length = ([x, y]) => Math.hypot(x, y);

/** How long two notes take to come back into the same relationship. */
const returnOf = (a, b) => 1 / Math.abs(slideRate(a) - slideRate(b));

/**
 * The field at one point, summed the way the shader sums it. One unit of
 * complexity to one fringe, matching the scale in src/interference.js.
 */
function fieldAt(waves, [x, y], seconds) {
  return waves.reduce(
    (sum, w) => sum + w.amp * Math.cos((w.x * x + w.y * y) * TAU + phaseAt(w, seconds)),
    0,
  );
}

/** The angle between two arrows, in degrees, taking the shorter way round. */
function between(a, b) {
  const cosine = (a[0] * b[0] + a[1] * b[1]) / (length(a) * length(b));
  return (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
}

test("each prime points at its own place inside the octave", () => {
  for (let i = 1; i < AXES.length; i++) {
    const size = Math.log2(PRIMES[i]);
    assert.ok(Math.abs(AXES[i].angle - TAU * (size % 1)) < 1e-12, `prime ${PRIMES[i]}`);
    assert.ok(Math.abs(AXES[i].length - size) < 1e-12);
    assert.ok(Math.abs(Math.hypot(AXES[i].x, AXES[i].y) - size) < 1e-12);
  }
});

test("the octave takes the same rule as every other prime", () => {
  // Folded into one octave, 2 lands on the root: no angle, and a step of one
  // straight along the first axis. No case in the code and none here.
  assert.equal(AXES[0].prime, 2);
  assert.equal(AXES[0].angle, 0);
  assert.equal(AXES[0].length, 1);
  assert.deepEqual([AXES[0].x, AXES[0].y], [1, 0]);
});

test("only the root itself does not ripple", () => {
  assert.deepEqual(waveVector(f(1, 1)), [0, 0]);
  assert.equal(slideRate(f(1, 1)), 0);

  // An octave of the root is a different thing in the room, so it draws
  // something. If it did not, sliding it would flash the whole panel instead of
  // moving anything across it.
  for (const [n, d] of [[2, 1], [1, 2], [4, 1]]) {
    assert.ok(length(waveVector(f(n, d))) > 0, `${n}/${d} should draw a wave`);
    assert.ok(slideRate(f(n, d)) !== 0);
  }
});

test("an octave changes the wave", () => {
  for (const [n, d] of [[3, 2], [5, 4], [7, 4], [81, 64]]) {
    const here = f(n, d);
    for (const octaves of [-2, -1, 1, 3]) {
      const moved = withOctaves(here, octaves);
      assert.notDeepEqual(waveVector(moved), waveVector(here));
      assert.ok(Math.abs(slideRate(moved) - slideRate(here) - octaves) < 1e-12);
    }
  }
});

test("how fine the wave is, is how far from home the ratio is", () => {
  // Built on one prime, every step lies along one line, so the arrow's length is
  // exactly the ratio's complexity — the number that shades its pad. The
  // picture's distance and the pad's distance are one measurement, not two that
  // happen to agree.
  for (const [n, d] of [[2, 1], [1, 4], [3, 1], [9, 1], [5, 1], [11, 1]]) {
    const here = f(n, d);
    assert.ok(Math.abs(length(waveVector(here)) - complexity(here)) < 1e-12, `${n}/${d}`);
  }

  // Built on several, the steps point different ways and partly cancel, so the
  // arrow is shorter. It can never be longer.
  for (const [n, d] of [[3, 2], [5, 4], [15, 8], [45, 32], [7, 5], [81, 64]]) {
    const here = f(n, d);
    assert.ok(length(waveVector(here)) < complexity(here), `${n}/${d}`);
  }
});

test("further out on the lattice is a finer grain", () => {
  const grain = (n, d) => length(waveVector(f(n, d)));
  assert.ok(grain(1, 1) < grain(3, 2));
  assert.ok(grain(3, 2) < grain(9, 8));
  assert.ok(grain(9, 8) < grain(27, 16));
  assert.ok(grain(5, 4) < grain(81, 64));
});

test("a comma apart in pitch is a long way apart on the picture", () => {
  // 5/4 and 81/64 are 21.5 cents apart and could pass for the same note. They
  // are reached along different axes and from different distances, so they draw
  // waves that differ both in which way they run and in how fine they are —
  // which is the thing you can see at a glance, before waiting out the minute it
  // takes them to come back round together.
  const near = waveVector(f(5, 4));
  const far = waveVector(f(81, 64));

  const degrees = between(near, far);
  assert.ok(degrees > 30, `only ${degrees.toFixed(1)} degrees apart`);
  assert.ok(length(far) > 3 * length(near), "and one should be far the finer grain");
});

test("a note slides one turn a second for every octave above the root", () => {
  assert.equal(slideRate(f(1, 1)), 0);
  assert.equal(slideRate(f(2, 1)), 1);
  assert.equal(slideRate(f(4, 1)), 2);
  assert.ok(Math.abs(slideRate(f(3, 2)) - 701.955 / 1200) < 1e-5);
  assert.ok(Math.abs(slideRate(f(3, 1)) - (701.955 + 1200) / 1200) < 1e-5);

  // Below the root it slides the other way.
  assert.equal(slideRate(f(1, 2)), -1);
  assert.ok(slideRate(f(3, 4)) < 0);
});

test("the closer two notes are, the longer they take to come round", () => {
  // The panel's whole argument, and it is just an interval turned upside down.
  assert.equal(returnOf(f(1, 1), f(2, 1)), 1);
  assert.ok(Math.abs(returnOf(f(1, 1), f(3, 2)) - 1.71) < 0.01);
  assert.ok(Math.abs(returnOf(f(5, 4), f(81, 64)) - 55.8) < 0.1);

  // A comma is a twentieth of a semitone, so it takes an order of magnitude
  // longer to come round than 3/2 does.
  assert.ok(returnOf(f(5, 4), f(81, 64)) / returnOf(f(1, 1), f(3, 2)) > 30);

  // Two notes at the very same pitch never separate, so they never come round.
  assert.equal(returnOf(f(3, 2), f(3, 2)), Infinity);
});

test("once a pair has come round it is drawing the same figure, moved along", () => {
  // Worth pinning rather than asserting in a comment. Over that time the two
  // rates differ by exactly one turn, so both phases have stepped by the same
  // amount — and one shared step across two waves running different ways is
  // exactly a translation. Solve for it and the two frames agree everywhere.
  const waves = wavesFrom([
    { ratio: f(5, 4), weight: 0.8 },
    { ratio: f(81, 64), weight: 0.8 },
  ]);
  const period = returnOf(f(5, 4), f(81, 64));
  const [a, b] = waves;

  const step = ((a.rate * period * TAU) % TAU) / TAU;
  const det = a.x * b.y - a.y * b.x;
  const shift = [(step * (b.y - a.y)) / det, (step * (a.x - b.x)) / det];

  for (const [x, y] of [[0, 0], [0.2, -0.1], [-0.37, 0.12], [0.5, 0.5]]) {
    const later = fieldAt(waves, [x, y], period);
    const moved = fieldAt(waves, [x + shift[0], y + shift[1]], 0);
    assert.ok(Math.abs(later - moved) < 1e-9, `at ${x},${y}: ${later} vs ${moved}`);
  }
});

test("the drone keeps one slot, not three", () => {
  // It is strung root, root an octave down, and 3/2, and it never stops. The two
  // that are octaves of the root only redraw the origin the picture is already
  // measured from — and they are the two that misbehave: 1/1 has no arrow at all,
  // and 1/2 sweeps the panel once a second forever.
  const drone = [[1, 2], [3, 4], [1, 1]].map(([n, d]) => ({
    ratio: f(n, d),
    weight: 0.5,
    tag: "drone",
  }));

  const waves = wavesFrom(drone);
  assert.equal(waves.length, 1);
  assert.deepEqual([waves[0].x, waves[0].y], waveVector(f(3, 4)));

  // The same ratios played as notes are events, not fixtures, and stay.
  const played = drone.map((entry) => ({ ...entry, tag: null }));
  assert.equal(wavesFrom(played).length, 3);
});

test("the loudest notes get drawn and the rest are dropped", () => {
  const memory = [
    { ratio: f(1, 1), weight: 0.2 },
    { ratio: f(3, 2), weight: 0.9 },
    { ratio: f(5, 4), weight: 0.5 },
    { ratio: f(7, 4), weight: 0 }, // gone entirely
  ];

  const waves = wavesFrom(memory, 2);
  assert.equal(waves.length, 2);
  assert.deepEqual(waves.map((wave) => wave.amp), [0.9, 0.5]);
  assert.deepEqual([waves[0].x, waves[0].y], waveVector(f(3, 2)));

  assert.equal(wavesFrom(memory).length, 3);
  assert.equal(wavesFrom([]).length, 0);
});

test("phase wraps, so a long session stays as exact as a short one", () => {
  const wave = { rate: 0.5, amp: 1 };
  assert.ok(Math.abs(phaseAt(wave, 1) - Math.PI) < 1e-9);
  for (const seconds of [0.3, 7, 900, 86400]) {
    const phase = phaseAt(wave, seconds);
    assert.ok(phase >= 0 && phase < TAU, `${seconds}s gave ${phase}`);
    assert.ok(Math.abs(Math.cos(phase) - Math.cos(wave.rate * seconds * TAU)) < 1e-9);
  }
});
