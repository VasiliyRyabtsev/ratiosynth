// The algebra of the lattice, as machinery.
//
// Pitches are prime-exponent vectors, so the set of pitches is the group Z^n
// under addition. This file is the group theory: what the alphabet of moves is,
// which combinations of moves come back to where they started, and how to write
// a word that lands on a given target.
//
// Two coordinate systems are in play and mixing them up is the main hazard:
//
//   full      what src/ratio.js uses — index 0 is the exponent of 2.
//   class     the same thing with the 2s thrown away: index 0 is the exponent
//             of 3, index 1 of 5, and so on. This is the quotient Z^n/<octave>,
//             which is the group of *pitch classes*. All the composing happens
//             here, because the octave is not a harmonic decision, it is a
//             register decision, and separating them is what the quotient is for.
//
// Nothing in this file knows what a note is.

import { PRIMES, complexity, octaveReduce, format } from "../../src/ratio.js";

/** class vector -> full exponent vector, with no 2s in it yet. */
export function toFull(v) {
  const out = [0];
  for (let i = 0; i < v.length; i++) out.push(v[i]);
  return out;
}

/** The ratio between 1 and 2 that stands for this pitch class. */
export function representative(v) {
  return octaveReduce(toFull(v));
}

export function add(a, b) {
  const out = new Array(Math.max(a.length, b.length));
  for (let i = 0; i < out.length; i++) out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  return out;
}

export function negate(a) {
  return a.map((e) => -e);
}

export function isZero(a) {
  return a.every((e) => e === 0);
}

export function keyOf(v) {
  return v.join(",");
}

/**
 * How far this pitch class is from the unison, in bits.
 *
 * complexity() measures log2(numerator x denominator) of a ratio, so 3/2 is
 * 2.58 bits and 15/8 is 6.9. A pitch class has two obvious representatives —
 * 3/2 upward is 4/3 downward — and they score differently, so we take the
 * cheaper of the two. That makes the measure a genuine symmetric distance on
 * the quotient group: cost(v) === cost(-v), which is what "how related are
 * these two notes" has to mean.
 */
export function cost(v) {
  const up = complexity(representative(v));
  const down = complexity(representative(negate(v)));
  return Math.min(up, down);
}

/** Distance between two pitch classes. */
export function between(a, b) {
  return cost(add(a, negate(b)));
}

// --- the alphabet -------------------------------------------------------

/**
 * Every move the music is allowed to make, given one number.
 *
 * A move is a pitch class, and the only non-arbitrary way to cut an infinite
 * group down to a finite alphabet is by distance: keep everything within
 * `horizon` bits of the unison. Nothing is listed; the alphabet is whatever
 * that ball contains, and it changes shape as the horizon moves.
 *
 * Which primes take part is decided the same way and needs no separate setting:
 * 7/4 is 4.81 bits and 9/8 is 6.17, so a horizon of 5 gives you the seventh
 * harmonic before it gives you the whole tone. That is a real claim about which
 * relationships are simpler, and this formalism has to live with it.
 *
 * The identity is in the alphabet. It is the group's neutral element, it costs
 * nothing, and what it sounds like is a repeated note. There is no reason to
 * exclude it that is not a taste we would have had to invent.
 *
 * Moves come in pairs — up a fifth and down a fifth are the same generator with
 * opposite sign — so only one of each pair is stored and the sign lives in the
 * word.
 */
export function alphabet(horizon) {
  // Which primes can appear at all: p/2^k must fit inside the horizon.
  const dims = [];
  for (let i = 1; i < PRIMES.length; i++) {
    if (cost(axis(i - 1, 1, i)) <= horizon) dims.push(i);
    else break;
  }
  const m = dims.length;
  if (m === 0) throw new Error(`horizon ${horizon} admits no primes at all`);

  // How far each axis could possibly go and still be inside the horizon.
  const reach = dims.map((i) => Math.max(1, Math.floor(horizon / Math.log2(PRIMES[i]))));

  const letters = [];
  const seen = new Set();

  const walk = (index, v) => {
    if (index === m) {
      const canonical = firstNonzeroPositive(v) ? v.slice() : negate(v);
      const id = keyOf(canonical);
      if (seen.has(id)) return;
      const c = cost(canonical);
      if (c > horizon) return;
      seen.add(id);
      letters.push({ v: canonical, cost: c, ratio: representative(canonical) });
      return;
    }
    for (let e = -reach[index]; e <= reach[index]; e++) {
      v[index] = e;
      walk(index + 1, v);
    }
    v[index] = 0;
  };
  walk(0, new Array(m).fill(0));

  letters.sort((a, b) => a.cost - b.cost || keyOf(a.v).localeCompare(keyOf(b.v)));
  return { horizon, dims: m, letters };
}

function axis(index, value, _prime) {
  const v = new Array(index + 1).fill(0);
  v[index] = value;
  return v;
}

function firstNonzeroPositive(v) {
  for (const e of v) {
    if (e > 0) return true;
    if (e < 0) return false;
  }
  return true; // the identity
}

// --- which combinations come home ---------------------------------------

/**
 * Integer kernel of the map that takes a count of each move to where you end up.
 *
 * Write the moves as the columns of a matrix A. A word that uses move i exactly
 * x_i times (negative meaning downward) finishes at A x. So the words that
 * finish where they started are exactly the integer solutions of A x = 0 — a
 * subgroup of Z^k, and a subgroup of a free abelian group is free abelian, so it
 * has a basis. Every closed loop in the music is an integer combination of that
 * basis, and there is nothing else.
 *
 * This is the whole reason the family is worth trying. "What does it take to get
 * back home from here" is not a heuristic, it is a linear algebra problem with
 * an exact answer, and the answer is a finite basis you can enumerate.
 *
 * Computed by clearing one row at a time with column operations — Euclid's
 * algorithm across columns — tracking the operations in U. Columns of A that
 * end up zero are the kernel, and the matching columns of U say how they were
 * built.
 */
export function kernelBasis(columns, dims) {
  const k = columns.length;
  const B = columns.map((c) => padded(c, dims));
  const U = [];
  for (let i = 0; i < k; i++) {
    const e = new Array(k).fill(0);
    e[i] = 1;
    U.push(e);
  }

  let pivot = 0;
  for (let r = 0; r < dims && pivot < k; r++) {
    for (;;) {
      const live = [];
      for (let c = pivot; c < k; c++) if (B[c][r] !== 0) live.push(c);
      if (live.length <= 1) break;
      live.sort((a, b) => Math.abs(B[a][r]) - Math.abs(B[b][r]));
      const p = live[0];
      for (let i = 1; i < live.length; i++) {
        const q = live[i];
        const f = Math.trunc(B[q][r] / B[p][r]);
        if (f !== 0) {
          axpy(B[q], B[p], -f);
          axpy(U[q], U[p], -f);
        }
      }
    }
    let only = -1;
    for (let c = pivot; c < k; c++) if (B[c][r] !== 0) only = c;
    if (only >= 0) {
      [B[pivot], B[only]] = [B[only], B[pivot]];
      [U[pivot], U[only]] = [U[only], U[pivot]];
      pivot++;
    }
  }

  return U.slice(pivot);
}

function padded(v, n) {
  const out = new Array(n).fill(0);
  for (let i = 0; i < v.length && i < n; i++) out[i] = v[i];
  return out;
}

function axpy(target, source, factor) {
  for (let i = 0; i < target.length; i++) target[i] += factor * source[i];
}

function l1(v) {
  let sum = 0;
  for (const e of v) sum += Math.abs(e);
  return sum;
}

/**
 * Shorten a basis, because the one that falls out of elimination is long.
 *
 * Repeatedly subtract one basis vector from another whenever that makes it
 * shorter. Crude next to lattice reduction proper, but the vectors here have a
 * handful of entries and it converges in a few passes.
 */
export function shorten(basis) {
  const out = basis.map((b) => b.slice());
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = 0; j < out.length; j++) {
        if (i === j) continue;
        for (const sign of [1, -1]) {
          const trial = out[i].map((e, t) => e + sign * out[j][t]);
          if (l1(trial) < l1(out[i]) && !trial.every((e) => e === 0)) {
            out[i] = trial;
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }
  return out.filter((b) => !b.every((e) => e === 0)).sort((a, b) => l1(a) - l1(b));
}

/**
 * Short closed loops, as vectors of move counts.
 *
 * Small integer combinations of the reduced basis. Only short ones are any use:
 * a loop of forty moves closes on paper and is heard as a wander, so the ear's
 * limit does the pruning that the algebra will not do for us.
 */
export function loops(basis, { maxLength = 20, maxBasis = 7 } = {}) {
  const use = basis.slice(0, maxBasis);
  const found = new Map();

  const walk = (index, acc) => {
    if (index === use.length) {
      const length = l1(acc);
      if (length < 2 || length > maxLength) return;
      const id = keyOf(acc);
      if (!found.has(id)) found.set(id, acc.slice());
      return;
    }
    for (let c = -1; c <= 1; c++) {
      const next = acc.map((e, t) => e + c * use[index][t]);
      walk(index + 1, next);
    }
  };
  walk(0, new Array(use.length === 0 ? 0 : use[0].length).fill(0));

  // A couple of doubled basis vectors, so longer loops are reachable too.
  for (const b of use) {
    for (const c of [2, -2]) {
      const v = b.map((e) => e * c);
      if (l1(v) <= maxLength) found.set(keyOf(v), v);
    }
  }

  return [...found.values()].sort((a, b) => l1(a) - l1(b));
}

/** A move-count vector expanded into the sequence of moves it stands for. */
export function expand(counts, letters) {
  const out = [];
  for (let i = 0; i < counts.length; i++) {
    const n = Math.abs(counts[i]);
    const sign = Math.sign(counts[i]);
    for (let j = 0; j < n; j++) out.push(sign < 0 ? negate(letters[i].v) : letters[i].v.slice());
  }
  return out;
}

/** Everything the group theory has to say about one horizon, computed once. */
export function world(horizon, options = {}) {
  const abc = alphabet(horizon);
  const basis = shorten(kernelBasis(abc.letters.map((l) => l.v), abc.dims));
  return { ...abc, basis, loops: loops(basis, options) };
}

/** For printing: "3/2, 5/4, 5/3, ..." */
export function describe(abc) {
  return abc.letters.map((l) => `${format(l.ratio)}(${l.cost.toFixed(2)})`).join(" ");
}
