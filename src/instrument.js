// What the instrument is made of.
//
// A modal instrument is a set of resonances — each one a frequency that rings
// and fades. The important part for this project is that those frequencies are
// a *ratio list*, exactly like the pitches are. That is what makes tuning and
// timbre the same problem: the overtones and the notes are drawn from the same
// kind of thing, so they can be made to agree or deliberately disagree.

import { fromFraction, toNumber } from "./ratio.js";

/**
 * The plain harmonic series: 1, 2, 3, 4, 5 … times the fundamental.
 *
 * What a string or a column of air does, and where just intonation comes from —
 * 3/2 sounds smooth because the third harmonic of the lower note lands on the
 * second harmonic of the upper one. So an instrument built on this list is
 * already in agreement with ordinary ratios.
 */
export function harmonicSeries(count = 16) {
  return Array.from({ length: count }, (_, i) => fromFraction(i + 1));
}

/**
 * Stretch or squash the series away from whole numbers.
 *
 * Real strings do this — stiffness pushes the upper partials sharp, which is why
 * piano tuning is stretched — and it is also the knob that breaks the agreement
 * with ordinary ratios on purpose, when perfect agreement is too clean. Amount 0
 * leaves the list alone. The one place we step outside exact ratios, so it
 * returns plain multipliers.
 */
export function stretch(ratios, amount = 0) {
  return ratios.map((r) => {
    const n = toNumber(r);
    return amount === 0 ? n : n * (1 + amount * Math.log2(n) ** 2 * 0.01);
  });
}

/**
 * Turn a ratio list into modes the synth can ring.
 *
 * Two of the four aliveness rules live here: each partial gets its own decay
 * time, shorter as you go up, because real objects lose their high partials
 * first; and each gets its own small detuning, fixed per instrument, because
 * perfectly aligned partials fuse into something sterile. The other two — the
 * noise burst at the attack and louder meaning brighter — are properties of how
 * a note is struck, so they live in the worklet, along with the moving part of
 * the drift.
 */
export function makeVoiceModes(ratios, options = {}) {
  const {
    ampSlope = 1.0, // how fast partials get quieter going up
    decay = 2.5, // seconds for the fundamental to fade away
    decaySlope = 0.7, // how much faster the upper partials fade
    detune = 3, // cents of fixed per-partial detuning
    stretchAmount = 0,
    seed = 1,
  } = options;

  const multipliers = stretch(ratios, stretchAmount);
  const random = makeRandom(seed);

  return multipliers.map((multiplier, i) => {
    const n = i + 1;
    const cents = (random() * 2 - 1) * detune;
    return {
      multiplier: multiplier * 2 ** (cents / 1200),
      amp: 1 / n ** ampSlope,
      decay: decay / n ** decaySlope,
      ratio: ratios[i],
    };
  });
}

/**
 * Where this instrument's partials actually land, for a note at a given pitch.
 * Sorted by frequency, which is what the roughness sweep expects.
 */
export function partialsAt(modes, hz) {
  return modes
    .map((mode) => ({ hz: hz * mode.multiplier, amp: mode.amp }))
    .sort((a, b) => a.hz - b.hz);
}

// Repeatable pseudo-randomness, so an instrument sounds the same each time it
// is built. The detuning should be arbitrary, not different on every reload.
function makeRandom(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}
