// The alphabet of moves — the only material the piece is made of.
//
// Everything in this experiment comes out of one small list of ratios. The list
// is not written down anywhere: it is the N simplest lattice points there are,
// found by enumerating and sorting. "Simplest" is ratio.js's own complexity
// measure, so the ordering is the project's, not mine.
//
// Because complexity(w) equals complexity(1/w), the list always arrives in
// up/down pairs — 3/2 and 4/3, then 5/4 and 8/5, then 7/4 and 8/7. That matters:
// a list of only upward moves would make the music climb forever.
//
// Each move is used twice, and this is the whole point of the experiment:
//
//   as a pitch    the note goes up (or down) by that ratio
//   as a rhythm   the ratio n/d divides a span into n pulses grouped into d
//                 runs, so 3/2 is "three pulses in two groups" — long, short.
//
// One number, two readings, and they are never allowed to disagree.

import {
  PRIMES,
  complexity,
  cents,
  octaveReduce,
  pitchClass,
  toFraction,
  format,
} from "../../src/ratio.js";

// How far the enumeration looks. Not a musical setting — just far enough that
// the sort has more candidates than any sane `reach` will ask for.
const MAX_STEPS = 3;
const AXES = [1, 2, 3, 4, 5]; // primes 3, 5, 7, 11, 13

/** Every lattice point (ignoring octaves) within a few steps of home. */
function enumeratePoints() {
  let points = [[]];
  for (const axis of AXES) {
    const next = [];
    for (const point of points) {
      for (let step = -MAX_STEPS; step <= MAX_STEPS; step++) {
        const out = point.slice();
        for (let i = out.length; i < axis; i++) out[i] = 0;
        out[axis] = step;
        next.push(out);
      }
    }
    points = next;
  }
  return points
    .map((p) => pitchClass(p))
    .filter((p) => p.length > 0)
    .filter((p) => p.reduce((sum, e) => sum + Math.abs(e), 0) <= MAX_STEPS);
}

/**
 * A move, ready for both of its jobs.
 *
 *   ratio     the lattice move itself, signed: 4/3 is genuinely downward
 *   n, d      the same interval written upward and inside one octave, so the
 *             rhythm reading always has n > d and the run lengths are 1 or 2
 */
function describe(point) {
  const up = octaveReduce(point); // lands in [1, 2)
  const { n, d } = toFraction(up);
  return {
    ratio: point,
    cents: cents(octaveReduce(point)),
    complexity: complexity(point),
    n: Number(n),
    d: Number(d),
    name: format(point),
    rhythmName: `${n}/${d}`,
  };
}

/**
 * The word: the `reach` simplest moves there are.
 *
 * `reach` is the only harmonic setting in the system. Small means the piece is
 * built of fifths and fourths; larger lets thirds in, then sevenths, then the
 * higher primes. It is not a scale — nothing here is a set of pitches, only a
 * set of relationships, and every pitch the piece reaches is a product of them.
 */
export function wordFor(reach = 4) {
  const wanted = Math.max(2, Math.round(reach));
  const all = enumeratePoints()
    .map(describe)
    // Simplest first. Ties (a move and its inverse) go upward-first, purely so
    // the list is reproducible.
    .sort((a, b) => a.complexity - b.complexity || b.cents - a.cents);
  return all.slice(0, wanted);
}

/** Average number of children a node has — used to size the hierarchy. */
export function meanBranching(word) {
  return word.reduce((sum, move) => sum + move.d, 0) / word.length;
}

export { PRIMES };
