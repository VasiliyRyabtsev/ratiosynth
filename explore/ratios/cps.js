// Combination product sets: pitches that are sets of factors.
//
// Take a handful of factors — 1, 3, 5, 7 — and make every product of two of
// them. That is six pitches, and it is Erv Wilson's Hexany. Six factors taken
// three at a time gives twenty, the Eikosany. Nothing in this construction knows
// what a scale degree is, and that is the point of using it.
//
// What makes it worth the trouble is what a *move* becomes. Two pitches are
// neighbours when their factor sets differ by a single element, and the interval
// between them is then the ratio of the factor swapped out to the one swapped
// in. Exchange 5 for 7 and you have moved by 7/5. So a melodic move is not a
// displacement of n positions — it is an operation with a name and an identity,
// and its size is a plain ratio of two small whole numbers.
//
// This is the answer to scale-degree thinking leaking in everywhere. There are
// no positions here to think in.

import { fromFraction, mul, div, octaveReduce, complexity, cents, equals } from "../../src/ratio.js";

const UNISON = [];

/**
 * Every product of `choose` factors, as pitches.
 *
 * Normalised so that one of them is 1/1 — otherwise the set floats free of any
 * root, and a root is the whole point of what this is being used for. The one
 * chosen is the simplest, which is the note the set is most obviously "about".
 */
export function productSet(factors, choose) {
  const points = [];
  const walk = (start, taken) => {
    if (taken.length === choose) {
      points.push([...taken]);
      return;
    }
    for (let i = start; i < factors.length; i++) walk(i + 1, [...taken, i]);
  };
  walk(0, []);

  const made = points.map((subset) => {
    let ratio = UNISON;
    for (const i of subset) ratio = mul(ratio, fromFraction(factors[i], 1));
    return { subset, ratio: octaveReduce(ratio) };
  });

  // Put the simplest member at 1/1 and read everything else against it.
  let home = made[0];
  for (const point of made) if (complexity(point.ratio) < complexity(home.ratio)) home = point;

  return made
    .map((point) => ({
      subset: point.subset,
      factors: point.subset.map((i) => factors[i]),
      ratio: octaveReduce(div(point.ratio, home.ratio)),
    }))
    .sort((a, b) => cents(a.ratio) - cents(b.ratio));
}

/**
 * The moves available from a pitch: swap one factor for one it does not have.
 *
 * Returned with the ratio of the exchange, which is the interval, and with the
 * two factors named — because "I traded the 5 for a 7" is a thing that can be
 * remembered and repeated, and "I moved up two places" is not.
 */
export function movesFrom(set, point) {
  const here = new Set(point.subset);
  const out = [];
  for (const other of set) {
    if (other === point) continue;
    const theirs = new Set(other.subset);
    const gone = [...here].filter((i) => !theirs.has(i));
    const gained = [...theirs].filter((i) => !here.has(i));
    if (gone.length !== 1 || gained.length !== 1) continue;
    out.push({
      to: other,
      dropped: point.factors[point.subset.indexOf(gone[0])],
      taken: other.factors[other.subset.indexOf(gained[0])],
      ratio: octaveReduce(div(other.ratio, point.ratio)),
    });
  }
  return out;
}

/** How far a pitch is from the root, in bits. This is the tension. */
export function fromRoot(point) {
  return complexity(point.ratio);
}

/** Is this the root? Arrival, with nothing else needed to define it. */
export function isRoot(point) {
  return equals(point.ratio, UNISON);
}

/** The whole neighbour graph, for inspection. */
export function describe(set) {
  return set.map((point) => ({
    factors: point.factors.join("·"),
    cents: cents(point.ratio),
    bits: fromRoot(point),
    neighbours: movesFrom(set, point).length,
  }));
}

/**
 * Every other member, with the interval to it.
 *
 * `movesFrom` gives only the single-factor exchanges, which is the harmonic
 * relation. This gives all of them, because a melody needs to be able to go
 * somewhere near and the nearest pitch is often not a factor-neighbour. The
 * interval is still a ratio of the factors involved either way.
 */
export function allMoves(set, point) {
  const here = new Set(point.subset);
  return set
    .filter((other) => other !== point)
    .map((other) => {
      const gone = point.subset.filter((i) => !other.subset.includes(i));
      const gained = other.subset.filter((i) => !here.has(i));
      return {
        to: other,
        dropped: gone.map((i) => point.factors[point.subset.indexOf(i)]).join("&") || "-",
        taken: gained.map((i) => other.factors[other.subset.indexOf(i)]).join("&") || "-",
        ratio: octaveReduce(div(other.ratio, point.ratio)),
      };
    });
}
