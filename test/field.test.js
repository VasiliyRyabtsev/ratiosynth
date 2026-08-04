import test from "node:test";
import assert from "node:assert/strict";

import {
  AXES,
  waveVector,
  slideRate,
  wavesFrom,
  phaseAt,
  fieldAt,
  grainOf,
  solidFrom,
} from "../src/field.js";
import { PRIMES, complexity, fromFraction, withOctaves } from "../src/ratio.js";

const TAU = Math.PI * 2;
const f = (n, d) => fromFraction(n, d);
const length = ([x, y]) => Math.hypot(x, y);

/** How long two notes take to come back into the same relationship. */
const returnOf = (a, b) => 1 / Math.abs(slideRate(a) - slideRate(b));

/**
 * The panel at one point, summed the way src/interference.js sums it: one unit
 * of complexity to one fringe, and the phase worked out from the clock.
 */
function panelAt(waves, [x, y], seconds) {
  const total = waves.reduce((sum, w) => sum + w.amp, 0);
  const sum = waves.reduce(
    (acc, w) => acc + w.amp * Math.cos((w.x * x + w.y * y) * TAU + phaseAt(w, seconds)),
    0,
  );
  return sum / Math.max(total, 1);
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
    const later = panelAt(waves, [x, y], period);
    const moved = panelAt(waves, [x + shift[0], y + shift[1]], 0);
    assert.ok(Math.abs(later - moved) < 1e-9, `at ${x},${y}: ${later} vs ${moved}`);
  }
});

test("the second the panel animates in is a third direction in space", () => {
  // The claim the live view is built on, and the reason it needed no arithmetic
  // of its own: a wave's phase from the clock and its phase from a position are
  // the same expression, so the solid sampled at z = t *is* the panel at time t.
  // Nothing is approximated here — the two are the same sum written twice.
  const waves = wavesFrom([
    { ratio: f(1, 1), weight: 0.9 },
    { ratio: f(5, 4), weight: 0.7 },
    { ratio: f(3, 2), weight: 0.5 },
    { ratio: f(81, 64), weight: 0.3 },
  ]);

  for (const seconds of [0, 0.4, 3.7, 41, 900]) {
    for (const [x, y] of [[0, 0], [0.2, -0.1], [-0.37, 0.12], [0.5, 0.5]]) {
      const solid = fieldAt(waves, x, y, seconds);
      assert.ok(
        Math.abs(solid - panelAt(waves, [x, y], seconds)) < 1e-9,
        `at ${x},${y} after ${seconds}s`,
      );
    }
  }
});

test("flying one unit a second is the panel playing at its own speed", () => {
  // Which is what fixes the flight's speed: it is not a number anybody picked,
  // it is the only speed at which the picture in front of the eye is the picture
  // the panel would be showing. So the wait for two notes to come back round is
  // also how far ahead the figure repeats — a comma is a long tunnel.
  const waves = wavesFrom([
    { ratio: f(1, 1), weight: 0.8 },
    { ratio: f(3, 2), weight: 0.8 },
  ]);
  const period = returnOf(f(1, 1), f(3, 2));

  for (const [x, y] of [[0, 0], [0.18, 0.24], [-0.4, 0.05]]) {
    const here = fieldAt(waves, x, y, 0);
    const ahead = fieldAt(waves, x, y, period);
    assert.ok(Math.abs(here - ahead) < 1e-9, `at ${x},${y}`);
  }

  // And nowhere short of it, or the tunnel would be shorter than the interval
  // says.
  assert.ok(Math.abs(fieldAt(waves, 0, 0, 0) - fieldAt(waves, 0, 0, period / 2)) > 0.5);
});

test("a wave finer than the gap between samples is dropped, not drawn", () => {
  // The drawing samples along a ray at intervals, and a wave whose fringes are
  // closer together than that gap cannot be sampled honestly. Grain is the
  // length of the whole three-part vector, so it can only be larger than the
  // panel's own — the flight sees the pitch axis the panel folds into its clock.
  for (const [n, d] of [[3, 2], [5, 4], [81, 64], [2, 1]]) {
    const [wave] = wavesFrom([{ ratio: f(n, d), weight: 1 }]);
    assert.ok(grainOf(wave) >= length([wave.x, wave.y]), `${n}/${d}`);
    assert.ok(Math.abs(grainOf(wave) - Math.hypot(wave.x, wave.y, wave.rate)) < 1e-12);
  }

  // And the order is the one the pads are shaded in: further out is finer.
  const grain = (n, d) => grainOf(wavesFrom([{ ratio: f(n, d), weight: 1 }])[0]);
  assert.ok(grain(3, 2) < grain(9, 8));
  assert.ok(grain(5, 4) < grain(81, 64));
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

test("the root lights the solid instead of filling it", () => {
  // The panel can afford a wave with no extent: it is an even wash and you see
  // past it. A solid cannot — it is fog at every point equally, so every ray
  // saturates and the picture goes blind. Measured before this split, every set
  // containing 1/1 came out at a contrast of 0.00 against a possible 1.00.
  const { waves, wash, total } = solidFrom([
    { ratio: f(1, 1), weight: 0.8 },
    { ratio: f(5, 4), weight: 0.8 },
    { ratio: f(3, 2), weight: 0.8 },
  ]);

  assert.equal(waves.length, 2, "the root is not one of the things in the room");
  assert.ok(!waves.some((wave) => grainOf(wave) === 0));
  assert.ok(Math.abs(wash - 1 / 3) < 1e-12, "and a third of what sounds is root");

  // What is drawn divides the sum, so taking the root out of the picture does
  // not also dim what is left of it.
  assert.ok(Math.abs(total - 1.6) < 1e-12);
});

test("only the root washes — its octaves are things in the room", () => {
  // 2/1 has an arrow and 1/1 does not, which is the distinction §24 had to make
  // to stop the panel strobing. The same line does the work here.
  const { waves, wash } = solidFrom([
    { ratio: f(2, 1), weight: 0.5 },
    { ratio: f(1, 2), weight: 0.5 },
    { ratio: f(4, 1), weight: 0.5 },
  ]);
  assert.equal(waves.length, 3);
  assert.equal(wash, 0);

  // And with nothing at all there is nothing to divide by and nothing to glow.
  const empty = solidFrom([]);
  assert.deepEqual(empty.waves, []);
  assert.equal(empty.wash, 0);
  assert.equal(empty.total, 1);
});

test("a lone fading note fades, rather than blooming on its way out", () => {
  // The panel's rule, kept for the panel's reason: dividing by the amplitude
  // present would restore full contrast to the last quiet note in the room.
  const { total, wash } = solidFrom([{ ratio: f(3, 2), weight: 0.05 }]);
  assert.equal(total, 1);
  assert.equal(wash, 0);

  // The root fading out on its own takes its glow down with it, for the same
  // reason — but it is a proportion, so a lone root still lights the space.
  assert.equal(solidFrom([{ ratio: f(1, 1), weight: 0.05 }]).wash, 1);
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
