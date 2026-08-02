// The lattice, read as a probability distribution.
//
// This file exists because of one identity, which is the whole reason this
// branch of the exploration is worth doing at all:
//
//     complexity(a) = log2(numerator x denominator)
//
// is already in src/ratio.js, and it is *literally* the number of bits it takes
// to write the fraction down. If we set
//
//     P(a) = 2^-complexity(a) / Z
//
// then -log2 P(a) = complexity(a) + log2 Z, so "how complicated is this ratio"
// and "how surprising is this ratio" become the same measurement, differing by
// a constant. Nothing here is chosen. Z is forced by the requirement that the
// probabilities add to one, and it has a closed form (see latticeMass).
//
// The catch, and it is a real one: Z only exists for a finite set of primes.
// Over every prime the product diverges, because the sum of 1/p over primes
// diverges. So a prime limit is not an arbitrary restriction on the tuning
// system — it is exactly the condition under which "complexity in bits" is a
// probability at all. See DESIGN.md in this directory.

import { PRIMES, complexity, div } from "../../src/ratio.js";

/**
 * The normalising constant Z for the lattice spanned by the given prime axes.
 *
 * Sum over all integer exponent vectors e of prod p_i^-|e_i|. It factorises,
 * and each factor is a two-sided geometric series:
 *
 *     sum over k in Z of p^-|k|  =  1 + 2/(p-1)
 *
 * so for the 5-limit lattice {2,3,5} it is 3 x 2 x 1.5 = 9 exactly, and for
 * pitch classes {3,5} it is 3 exactly.
 *
 * `axes` are indices into PRIMES: 0 is the prime 2, 1 is 3, 2 is 5.
 */
export function latticeMass(axes) {
  let z = 1;
  for (const axis of axes) z *= 1 + 2 / (PRIMES[axis] - 1);
  return z;
}

/** -log2 P for a single ratio under the bare lattice prior, in bits. */
export function latticeBits(a, axes) {
  return complexity(a) + Math.log2(latticeMass(axes));
}

/**
 * Every lattice point whose complexity is within a budget, cheapest first.
 *
 * This is a *compute* bound, not a musical one. The prior already makes distant
 * points vanishingly unlikely; enumerating them would only waste time. The mass
 * left outside the budget is reported by `missingMass` so the truncation is
 * visible rather than pretended away.
 */
export function pointsWithin(axes, bits) {
  const found = [];
  const walk = (index, point) => {
    if (index === axes.length) {
      const trimmed = trimZeros(point);
      if (complexity(trimmed) <= bits + 1e-9) found.push(trimmed);
      return;
    }
    const axis = axes[index];
    const step = Math.log2(PRIMES[axis]);
    const reach = Math.floor(bits / step);
    for (let e = -reach; e <= reach; e++) {
      const next = point.slice();
      next[axis] = e;
      for (let i = 0; i < next.length; i++) next[i] ??= 0;
      walk(index + 1, next);
    }
  };
  walk(0, []);
  found.sort((a, b) => complexity(a) - complexity(b));
  return found;
}

/** How much probability the enumeration in `pointsWithin` throws away. */
export function missingMass(points, axes) {
  const z = latticeMass(axes);
  let kept = 0;
  for (const point of points) kept += 2 ** -complexity(point) / z;
  return 1 - kept;
}

/**
 * A mixture of lattice priors, one centred on each anchor.
 *
 * This is how "what is already sounding" enters the model. A candidate is
 * likely if it makes a simple ratio with *something* recently heard, and the
 * anchors are weighted by how recently. Because each component is a full,
 * exactly normalised lattice prior shifted to a different origin, the mixture
 * is exactly normalised too, for free — a shifted lattice is the same lattice.
 *
 * Anchors: [{ point, weight }], weights need not be normalised.
 * Returns a function from a lattice point to its probability.
 */
export function mixture(anchors, axes) {
  const z = latticeMass(axes);
  let total = 0;
  for (const anchor of anchors) total += anchor.weight;
  if (total <= 0) return (point) => 2 ** -complexity(point) / z;

  return (point) => {
    let p = 0;
    for (const anchor of anchors) {
      if (anchor.weight <= 0) continue;
      p += (anchor.weight / total) * 2 ** -complexity(div(point, anchor.point));
    }
    return p / z;
  };
}

/**
 * The octave part, measured from the nearest octave rather than from 1/1.
 *
 * This is the prime-2 axis of the same prior — P(o) = 2^-|o| / 3, exactly — but
 * counted from wherever the pitch class lands closest to where the voice already
 * is. That single change is what stops lattice simplicity from being a licence
 * to leap: 3/2 is the second simplest ratio there is and also a jump of 702
 * cents, and DESIGN.md records that conflating the two cost this project months.
 * Counting octaves from the nearest placement folds the leap away and leaves the
 * simplicity, without any second cost term to balance against the first.
 */
export function octaveBits(offset) {
  return Math.abs(offset) + Math.log2(3);
}

function trimZeros(exponents) {
  let end = exponents.length;
  while (end > 0 && exponents[end - 1] === 0) end--;
  return exponents.slice(0, end);
}
