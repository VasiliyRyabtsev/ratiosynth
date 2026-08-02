// Scales that have a step.
//
// The problem this solves, measured before it was built: a set of lattice points
// near a centre is not a scale. Twenty-six of them inside a voice's range left
// gaps of 20, 22, 41 and 71 cents — half of them smaller than the ear reads as
// melodic motion at all. So a line moving "one place along" was mostly moving by
// a comma, which sounds like a repeated note and measures as one. Every stuck
// number in the previous version comes from that.
//
// The fix is not to filter the cloud. It is to build the pitches by a method
// that cannot produce a cloud.
//
// Stack one interval repeatedly and reduce each result into the octave. The
// three-distance theorem — a genuine theorem, about points placed by repeatedly
// adding a fixed amount around a circle — guarantees the gaps between adjacent
// pitches take **at most three** distinct sizes, whatever the generator is. At
// particular counts they take exactly **two**. Those counts are the moments of
// symmetry, and a scale with exactly two step sizes is what music everywhere
// actually uses.
//
// So "one step" becomes a real object with a real size, derived from a single
// generating ratio and nothing else. No table, no list of scales, no tuning by
// hand. Change the generator and you get a different world, correctly formed.
//
// Erv Wilson called these Moments of Symmetry; Carey and Clampitt call the same
// objects well-formed scales. Rothenberg's propriety, below, is the companion
// test of whether a listener can tell where they are in one.

import { mul, octaveReduce, cents, equals } from "../../src/ratio.js";

const UNISON = [];
const TOLERANCE = 0.5; // cents; two gaps closer than this are the same gap

/**
 * Stack a generator `count` times and reduce into the octave.
 *
 * Returns the pitches in pitch order, the gaps between them, and how many
 * distinct gap sizes there are. Two means well-formed.
 */
export function generate(generator, count) {
  const pitches = [];
  let at = UNISON;
  for (let i = 0; i < count; i++) {
    pitches.push(octaveReduce(at));
    at = mul(at, generator);
  }

  pitches.sort((a, b) => cents(a) - cents(b));

  const gaps = [];
  for (let i = 0; i < pitches.length; i++) {
    const here = cents(pitches[i]);
    const next = i + 1 < pitches.length ? cents(pitches[i + 1]) : cents(pitches[0]) + 1200;
    gaps.push(next - here);
  }

  return { pitches, gaps, sizes: distinct(gaps) };
}

/** Exactly two step sizes: the definition of a moment of symmetry. */
export function isWellFormed(scale) {
  return scale.sizes.length === 2;
}

/**
 * The counts at which a generator gives a well-formed scale.
 *
 * These are not chosen and not looked up — they are tested for. For a fifth they
 * come out 2, 3, 5, 7, 12 and so on, which is why those numbers keep appearing
 * in music that never agreed on anything else.
 */
export function momentsOfSymmetry(generator, { upTo = 24, from = 3 } = {}) {
  const found = [];
  for (let count = from; count <= upTo; count++) {
    const scale = generate(generator, count);
    if (isWellFormed(scale)) found.push(count);
  }
  return found;
}

/**
 * Rothenberg propriety: can a listener tell where they are?
 *
 * Take every interval spanning k steps, from every starting degree. The scale is
 * **proper** if no k-step interval is ever larger than a (k+1)-step interval,
 * and **strictly proper** if it is always smaller. When that fails, the same
 * heard distance means two different things depending on where you started, and
 * the scale stops being navigable — you cannot tell a third from a fourth.
 *
 * This is what decides whether a well-formed scale is usable, and it is computed
 * rather than judged.
 */
export function propriety(scale, tolerance = TOLERANCE) {
  const n = scale.pitches.length;
  const at = scale.pitches.map(cents);

  // The scale continued upward forever, so an interval that crosses the octave
  // is measured without a special case. Getting this wrong is easy and quiet:
  // an earlier version wrapped by hand and declared every scale improper,
  // including the pentatonic.
  const reach = (j) => at[((j % n) + n) % n] + 1200 * Math.floor(j / n);

  const spans = [];
  for (let k = 1; k < n; k++) {
    const sizes = [];
    for (let i = 0; i < n; i++) sizes.push(reach(i + k) - reach(i));
    spans.push({ k, low: Math.min(...sizes), high: Math.max(...sizes) });
  }

  let strict = true;
  let proper = true;
  for (let i = 0; i + 1 < spans.length; i++) {
    if (spans[i].high > spans[i + 1].low + tolerance) proper = false;
    if (spans[i].high >= spans[i + 1].low - TOLERANCE) strict = false;
  }
  return { proper, strict, spans };
}

/**
 * The best scale a generator can give, at or below a size.
 *
 * Prefers the largest well-formed and proper scale that fits, because a bigger
 * scale can carry more without losing its footing. Falls back to well-formed
 * alone if nothing is proper — some generators simply have no proper scales, and
 * that is a fact about the generator worth surfacing rather than hiding.
 */
export function bestScale(generator, maxSize) {
  const counts = momentsOfSymmetry(generator, { upTo: Math.max(3, maxSize) });
  let fallback = null;
  for (const count of [...counts].reverse()) {
    const scale = generate(generator, count);
    if (!fallback) fallback = scale;
    if (propriety(scale).proper) return scale;
  }
  return fallback ?? generate(generator, Math.max(3, Math.min(7, maxSize)));
}

function distinct(values) {
  const out = [];
  for (const value of values) {
    if (!out.some((seen) => Math.abs(seen - value) < TOLERANCE)) out.push(value);
  }
  return out.sort((a, b) => a - b);
}
