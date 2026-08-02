// Rhythm, from the same numbers as the harmony.
//
// A pitch ratio and a rhythm ratio are the same relationship at two different
// speeds. 3/2 as pitch is a fifth; 3/2 as rhythm is three events against two.
// So the chord that is sounding can set the rhythm directly, and the two are
// related by construction rather than by taste.
//
// Getting the numbers out of a chord is the trick. Express every sounding note
// as a whole number over a common base — which on the lattice is just the
// smallest exponent used on each prime — and the chord 1/1, 5/4, 3/2 comes out
// as 4, 5, 6. Those are the periods: one layer plays every 4 pulses, another
// every 5, another every 6.
//
// They come back into line every 60 pulses, and that is a phrase. Nobody chose
// the phrase length; it is what those three numbers do together.

import { div, toFraction } from "./ratio.js";

/**
 * The whole numbers hiding in a chord.
 *
 * Returns them small and sorted. Notes needing a number bigger than the cap are
 * dropped rather than allowed to produce a phrase thousands of pulses long.
 */
export function chordIntegers(ratios, { cap = 12 } = {}) {
  if (ratios.length === 0) return [];

  const width = Math.max(...ratios.map((ratio) => ratio.length));
  const base = [];
  for (let i = 0; i < width; i++) {
    base[i] = Math.min(...ratios.map((ratio) => ratio[i] ?? 0));
  }

  const integers = [];
  for (const ratio of ratios) {
    const { n, d } = toFraction(div(ratio, base));
    if (d !== 1n) continue; // cannot happen with a componentwise minimum, but be sure
    const value = Number(n);
    if (Number.isFinite(value) && value >= 2 && value <= cap) integers.push(value);
  }

  return [...new Set(integers)].sort((a, b) => a - b);
}

/**
 * Periods for a set of layers, taken from the chord if it will give them and
 * falling back to something simple if it will not.
 */
export function periodsFor(ratios, count, options = {}) {
  let integers = chordIntegers(ratios, options);
  if (integers.length < 2) integers = [2, 3, 4, 6];

  // Slowest at the bottom: the bass moves in long strides, the top fidgets.
  const descending = [...integers].sort((a, b) => b - a);
  const periods = [];
  for (let i = 0; i < count; i++) periods.push(descending[i % descending.length]);
  return periods;
}

/** How long until every layer lands on the same pulse again. */
export function phraseLength(periods, { cap = 240 } = {}) {
  if (periods.length === 0) return 1;
  let total = periods[0];
  for (const period of periods) {
    total = lcm(total, period);
    if (total > cap) return cap;
  }
  return total;
}

/**
 * Spread a few onsets as evenly as possible through a cycle.
 *
 * When the count divides the cycle you get something plain — three in six is
 * just every other step. When it does not, you get an uneven pattern that still
 * repeats exactly: three in eight comes out long-long-short, which is the most
 * common rhythm on earth and nobody had to write it down.
 *
 * Rotated so the cycle begins on an onset, which gives the phrase a downbeat.
 */
export function euclidean(onsets, steps) {
  const count = Math.max(0, Math.min(steps, Math.round(onsets)));
  if (count === 0) return new Array(steps).fill(false);
  if (count === steps) return new Array(steps).fill(true);

  const pattern = [];
  let bucket = 0;
  for (let i = 0; i < steps; i++) {
    bucket += count;
    if (bucket >= steps) {
      bucket -= steps;
      pattern.push(true);
    } else {
      pattern.push(false);
    }
  }

  const first = pattern.indexOf(true);
  return first <= 0 ? pattern : pattern.slice(first).concat(pattern.slice(0, first));
}

/**
 * The rhythm of one layer: how long its cycle is, where the onsets fall, and
 * how long each note has before the next one.
 *
 * The cycle length comes from the chord, so the rhythm and the harmony are
 * still the same numbers. How full it is, is a knob.
 */
export function patternFor(period, { bars = 2, density = 0.4, minimum = 8 } = {}) {
  // Short cycles have nowhere to be uneven, so they get doubled until they do.
  let steps = Math.max(2, Math.round(period * Math.max(1, bars)));
  while (steps < minimum) steps *= 2;

  let onsets = Math.max(1, Math.min(steps - 1, Math.round(steps * clamp(density, 0.05, 1))));

  // A count that divides the cycle exactly spreads out evenly — two in six is
  // just every third step — and even is the thing we are trying to escape. So
  // nudge it until it does not divide.
  while (onsets > 1 && onsets < steps - 1 && steps % onsets === 0) onsets++;

  const pattern = euclidean(onsets, steps);

  // How many steps each onset gets before the next one. Sparse places in the
  // pattern give long notes without anyone deciding that separately.
  const gaps = new Array(steps).fill(0);
  for (let i = 0; i < steps; i++) {
    if (!pattern[i]) continue;
    let gap = 1;
    while (gap < steps && !pattern[(i + gap) % steps]) gap++;
    gaps[i] = gap;
  }

  return { steps, onsets, pattern, gaps };
}

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return a;
}

function lcm(a, b) {
  return (a / gcd(a, b)) * b;
}
