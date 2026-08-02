// The lattice, read as a probability distribution.
//
// `complexity(a)` in ratio.js is log2(numerator x denominator), which is
// literally the number of bits it takes to write the fraction down. So
//
//     P(a) = 2^-complexity(a) / Z
//
// makes "how complicated is this interval" and "how surprising is this interval"
// the same quantity. Nothing is chosen here. Z is forced by the probabilities
// having to add to one, and it has a closed form:
//
//     2^-complexity([e1..ek]) = prod p_i^-|e_i|
//
// so the sum over the whole lattice factorises one axis at a time into
//
//     1 + 2*sum_{m>=1} p^-m  =  1 + 2/(p-1)  =  (p+1)/(p-1)
//
// and Z is the product of that over the primes in play. For the 2-, 3-, 5- and
// 7-limits it comes out at exactly 3, 6, 9 and 12.
//
// The catch is the interesting part. That product only converges for a finite
// set of primes, because the sum of 1/p over all primes diverges. **A prime
// limit is therefore not an arbitrary restriction on the tuning system — it is
// exactly the condition under which complexity-in-bits is a probability at
// all.** The lattice and the information measure turn out to be one structure
// seen twice.

import { PRIMES, complexity, div } from "../../src/ratio.js";

/** Z for a lattice spanned by the first `limit` primes. Exact, not summed. */
export function partition(limit) {
  let z = 1;
  for (let i = 0; i < limit; i++) z *= (PRIMES[i] + 1) / (PRIMES[i] - 1);
  return z;
}

/** Unnormalised probability of a ratio: 2 to the minus its description length. */
export function mass(ratio) {
  return Math.pow(2, -complexity(ratio));
}

/** Surprisal in bits of moving from one pitch to another. */
export function bitsBetween(from, to) {
  return complexity(div(to, from));
}

/**
 * What the piece expects to happen next.
 *
 * Two sources, combined the way Bayes says to combine them and not by any
 * weight we choose. The lattice prior says what is simple. The tally says what
 * this piece has actually been doing. The posterior predictive of a Dirichlet
 * with the lattice as its base measure is
 *
 *     P(a) = (prior(a) + count(a)) / (1 + total)
 *
 * where the prior carries the weight of exactly one observation, which is the
 * usual uninformative choice and not a knob. Early on the lattice decides; once
 * the piece has habits, the habits decide. A vocabulary forms on its own, and
 * so does the pull to reuse it — which is what recurrence is.
 *
 * What gets tallied is **moves**, not pitches. Counting pitches would build a
 * scale; counting moves builds a way of moving, and it transposes exactly,
 * which is only true because nothing is tempered.
 */
export class Expectation {
  constructor({ memory = 60 } = {}) {
    this.memory = memory; // in events; older ones fade
    this.counts = new Map();
    this.pairs = new Map();
    this.previous = null;
    this.total = 0;
  }

  /** Fade everything, so old habits stop mattering without a hard cutoff. */
  age() {
    if (this.total === 0) return;
    const keep = Math.exp(-1 / Math.max(1, this.memory));
    this.total = 0;
    for (const [key, count] of this.counts) {
      const faded = count * keep;
      if (faded < 1e-3) this.counts.delete(key);
      else {
        this.counts.set(key, faded);
        this.total += faded;
      }
    }
    for (const [key, count] of this.pairs) {
      const faded = count * keep;
      if (faded < 1e-3) this.pairs.delete(key);
      else this.pairs.set(key, faded);
    }
  }

  observe(move, after = null) {
    const k = key(move);
    this.counts.set(k, (this.counts.get(k) ?? 0) + 1);
    // And the same move in the context of the one before it. Saying "again"
    // is shorter than naming a new move, so a run of identical moves is cheaper
    // to describe than a run of different ones — which is what a melodic
    // contour is. Measured: a memoryless walk in a range this size reverses
    // direction 61% of the time, and real melody reverses 50%, so the missing
    // structure is exactly enough momentum to cancel the walls. It is not a
    // parameter; it is one more order of prediction.
    // The context is the move this same part made last, not whatever move any
    // part happened to make last — the parts interleave, so a shared context is
    // three lines' moves shuffled together, which predicts nothing. This was
    // wrong at first and the momentum simply did not appear.
    if (after !== null) {
      const pair = key(after) + "|" + k;
      this.pairs.set(pair, (this.pairs.get(pair) ?? 0) + 1);
    }
    this.total += 1;
    this.age();
  }

  /** Unnormalised expectation of a move, prior and habit together. */
  weightOf(move) {
    return mass(move) + (this.counts.get(key(move)) ?? 0);
  }

  /**
   * Habit, at both orders. Evidence from "this move happens" and from "this
   * move follows the one just made" simply adds, which is what evidence does.
   */
  countOf(move, after = null) {
    const k = key(move);
    const plain = this.counts.get(k) ?? 0;
    const following = after === null ? 0 : (this.pairs.get(key(after) + "|" + k) ?? 0);
    return plain + following;
  }

  /** Surprisal in bits of a move, given a set of alternatives. */
  surprisalOf(move, alternatives) {
    let total = 0;
    for (const other of alternatives) total += this.weightOf(other);
    const p = this.weightOf(move) / total;
    return -Math.log2(Math.max(1e-12, p));
  }
}

export function key(ratio) {
  const trimmed = [...ratio];
  while (trimmed.length && trimmed[trimmed.length - 1] === 0) trimmed.pop();
  return trimmed.join(",");
}

/**
 * Draw from a set of options in proportion to their weight, but at a chosen
 * temperature.
 *
 * The temperature is not a taste knob. It is solved for, so that the entropy of
 * the distribution we actually sample from equals the number of bits per event
 * the piece is asked to carry. That is the whole steering mechanism: say how
 * surprising the music should be, and the sampling sharpness follows.
 */
export function drawAt(options, weights, targetBits, random) {
  const beta = solveTemperature(weights, targetBits);
  const scaled = weights.map((w) => Math.pow(Math.max(1e-12, w), beta));
  const total = scaled.reduce((sum, w) => sum + w, 0);
  let ticket = random() * total;
  for (let i = 0; i < options.length; i++) {
    ticket -= scaled[i];
    if (ticket <= 0) return { choice: options[i], index: i, beta };
  }
  return { choice: options[options.length - 1], index: options.length - 1, beta };
}

/**
 * Find the exponent that gives a distribution of the requested entropy.
 *
 * Entropy falls monotonically as beta rises, from log2(n) at beta = 0 to zero
 * when one option takes everything, so a bisection always lands. If the target
 * is more bits than the options can carry we return the flattest distribution
 * available rather than failing — the music simply cannot be that surprising
 * with so little to choose from, and that is worth knowing rather than hiding.
 */
export function solveTemperature(weights, targetBits) {
  if (weights.length <= 1) return 1;
  if (entropyAt(weights, 0) <= targetBits) return 0; // as flat as it goes

  let low = 0;
  let high = 1;
  while (entropyAt(weights, high) > targetBits && high < 1024) high *= 2;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (entropyAt(weights, mid) > targetBits) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

export function entropyAt(weights, beta) {
  const scaled = weights.map((w) => Math.pow(Math.max(1e-12, w), beta));
  const total = scaled.reduce((sum, w) => sum + w, 0);
  let bits = 0;
  for (const w of scaled) {
    const p = w / total;
    if (p > 0) bits -= p * Math.log2(p);
  }
  return bits;
}

/**
 * What it costs to say "the next note is k places along from this one".
 *
 * The lattice prior is a prior over *harmony*: it says an octave costs one bit
 * and a whole tone costs six, which is true of how the two are built and false
 * of how they are heard. Measured, it gave a line that leapt twice as often as
 * any human tradition and almost never stepped.
 *
 * So melody gets its own description, in the same currency. A pitch can be named
 * by its position relative to where the line already is, and the cost of that
 * name is what it costs to write the integer k down. Elias gamma is the standard
 * prefix-free code for a positive integer and takes 2*floor(log2 n)+1 bits, plus
 * one more bit to say which way. Nothing here is fitted: it is the length of the
 * shortest self-delimiting name for "k places along".
 *
 * The result has the shape melody actually has. Staying costs one bit, the
 * nearest neighbours four, and the cost climbs slowly and without limit — so a
 * big leap is rare rather than banned, which is what the corpus shows.
 *
 * The division of labour is worth stating plainly: **the lattice decides which
 * notes exist, and this decides which of them comes next.** Harmony and melody
 * are answering different questions, and giving them one prior was the error.
 */
export function positionBits(k) {
  const n = Math.abs(k) + 1;
  const gamma = 2 * Math.floor(Math.log2(n)) + 1;
  return gamma + (k === 0 ? 0 : 1);
}
