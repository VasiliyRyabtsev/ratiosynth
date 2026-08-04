// The ratio model.
//
// A pitch is stored as a list of prime exponents, never as a frequency.
// The list is indexed by PRIMES, so [-1, 1] means 2^-1 * 3^1 = 3/2.
// Trailing zeros are trimmed, so there is exactly one way to write any ratio
// and two ratios are equal if their arrays are equal.
//
// Nothing here converts to Hz except toHz(), which is meant to be called once,
// at the very end, by the voice that actually makes sound.

export const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31];

const LOG2 = PRIMES.map((p) => Math.log2(p));

/** The ratio 1/1 — no movement at all. */
export const UNISON = Object.freeze([]);

/** Common intervals, for readability at call sites. */
export const OCTAVE = Object.freeze([1]);
export const FIFTH = Object.freeze([-1, 1]);
export const MAJOR_THIRD = Object.freeze([-2, 0, 1]);

// Drop trailing zeros so equal ratios always have identical arrays.
function trim(exponents) {
  let end = exponents.length;
  while (end > 0 && exponents[end - 1] === 0) end--;
  return end === exponents.length ? exponents : exponents.slice(0, end);
}

/** Build a ratio from prime exponents: ratio(-1, 1) is 3/2. */
export function ratio(...exponents) {
  return trim(exponents);
}

/** Multiply two ratios — stacking one interval on top of another. */
export function mul(a, b) {
  const out = new Array(Math.max(a.length, b.length));
  for (let i = 0; i < out.length; i++) out[i] = (a[i] ?? 0) + (b[i] ?? 0);
  return trim(out);
}

/** Divide a by b — the interval that gets you from b to a. */
export function div(a, b) {
  const out = new Array(Math.max(a.length, b.length));
  for (let i = 0; i < out.length; i++) out[i] = (a[i] ?? 0) - (b[i] ?? 0);
  return trim(out);
}

/** Flip an interval upside down: 3/2 becomes 2/3. */
export function inverse(a) {
  return trim(a.map((e) => -e));
}

/** Repeat an interval k times. Three fifths up is pow(FIFTH, 3). */
export function pow(a, k) {
  return trim(a.map((e) => e * k));
}

export function equals(a, b) {
  const x = trim(a);
  const y = trim(b);
  if (x.length !== y.length) return false;
  return x.every((e, i) => e === y[i]);
}

/** The largest prime this ratio uses. 3/2 is 3-limit, 5/4 is 5-limit. */
export function limit(a) {
  const t = trim(a);
  return t.length === 0 ? 1 : PRIMES[t.length - 1];
}

// --- reading and writing ordinary fractions ---

function factorize(n, into, sign) {
  let rest = n;
  for (let i = 0; i < PRIMES.length && rest > 1; i++) {
    while (rest % PRIMES[i] === 0) {
      into[i] = (into[i] ?? 0) + sign;
      rest /= PRIMES[i];
    }
  }
  return rest;
}

/**
 * Turn an ordinary fraction into exponents. fromFraction(3, 2) is [-1, 1].
 * Throws if a factor is a prime we do not carry — better to fail loudly than
 * to silently round, since rounding is the one thing this project refuses.
 */
export function fromFraction(numerator, denominator = 1) {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
    throw new Error(`fromFraction needs whole numbers, got ${numerator}/${denominator}`);
  }
  if (numerator <= 0 || denominator <= 0) {
    throw new Error(`ratios must be positive, got ${numerator}/${denominator}`);
  }
  const out = [];
  const leftNum = factorize(numerator, out, +1);
  const leftDen = factorize(denominator, out, -1);
  if (leftNum > 1 || leftDen > 1) {
    const stuck = leftNum > 1 ? leftNum : leftDen;
    throw new Error(
      `${numerator}/${denominator} needs a prime factor (${stuck}) beyond ${PRIMES.at(-1)}`,
    );
  }
  for (let i = 0; i < out.length; i++) out[i] ??= 0;
  return trim(out);
}

/**
 * Back to an ordinary fraction, already in lowest terms because a prime can
 * only be on one side. BigInt because exponents drift and 3^30 is past what a
 * regular number can hold exactly.
 */
export function toFraction(a) {
  let n = 1n;
  let d = 1n;
  for (let i = 0; i < a.length; i++) {
    const e = a[i];
    if (e > 0) n *= BigInt(PRIMES[i]) ** BigInt(e);
    else if (e < 0) d *= BigInt(PRIMES[i]) ** BigInt(-e);
  }
  return { n, d };
}

/** "3/2", or "1/1" for unison. */
export function format(a) {
  const { n, d } = toFraction(a);
  return `${n}/${d}`;
}

/** Read "3/2", "5/4" or a plain "3". */
export function parse(text) {
  const [n, d = "1"] = String(text).trim().split("/");
  return fromFraction(Number(n), Number(d));
}

// --- turning ratios into quantities ---

const MAX_EXACT = 2 ** 53;

/**
 * The ratio as a plain number: 3/2 gives exactly 1.5.
 *
 * Multiplying the prime powers is exact while the numbers stay small, which
 * covers everything musical. Far out on the lattice it overflows, so there we
 * fall back to powers of two and accept the last-digit error — by then the
 * number is only being used to set a frequency anyway.
 */
export function toNumber(a) {
  let n = 1;
  let d = 1;
  for (let i = 0; i < a.length; i++) {
    const e = a[i];
    if (e > 0) n *= PRIMES[i] ** e;
    else if (e < 0) d *= PRIMES[i] ** -e;
    if (n > MAX_EXACT || d > MAX_EXACT) return 2 ** log2(a);
  }
  return n / d;
}

/** How many octaves up this ratio is, as a fraction of an octave. */
export function log2(a) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * LOG2[i];
  return sum;
}

/**
 * Size in cents — 1200 to the octave.
 *
 * A ruler, not a grid. It is the logarithm of the ratio with a readable scale on
 * it, so that "how far apart" is a number the ear's own sense of distance agrees
 * with. Nothing rounds to it and there are no steps to land on: 386.31 is as
 * ordinary a value here as 400.
 */
export function cents(a) {
  return 1200 * log2(a);
}

/** The one place ratios become frequencies. */
export function toHz(a, referenceHz) {
  return referenceHz * toNumber(a);
}

/** The inverse: what ratio is this frequency, relative to the reference? */
export function nearestCents(hz, referenceHz) {
  return 1200 * Math.log2(hz / referenceHz);
}

// --- how complicated is this ratio ---

/**
 * Complexity: log2 of numerator times denominator. 3/2 scores about 2.6,
 * 32/27 about 9.8. Small means simple means easy to hear as a relationship.
 *
 * Computed from the exponents so it never has to build the big numbers.
 */
export function complexity(a) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]) * LOG2[i];
  return sum;
}

/**
 * How far apart two pitches are — the complexity of the interval between them.
 * Note this is nothing to do with how far apart they sound in pitch: 3/2 is a
 * big leap but a short distance, and 81/80 is a hair's width but a long way.
 */
export function distance(a, b) {
  return complexity(div(a, b));
}

// --- moving around the lattice ---

/** Shift by whole octaves until the ratio sits between 1 and 2. */
export function octaveReduce(a) {
  const octaves = Math.floor(log2(a));
  const out = withOctaves(a, -octaves);
  // Guard against the floor landing wrong when log2 is a hair under a whole
  // number, which happens for exact powers of two.
  const value = log2(out);
  if (value < 0) return withOctaves(out, 1);
  if (value >= 1) return withOctaves(out, -1);
  return out;
}

/** Move up or down by whole octaves. */
export function withOctaves(a, octaves) {
  if (octaves === 0) return trim(a.slice());
  const out = a.slice();
  out[0] = (out[0] ?? 0) + octaves;
  return trim(out);
}

/**
 * Forget which octave this is in — the identity of the note, ignoring height.
 * This is what the lattice display draws: only the 3s and 5s move you around
 * the picture, the 2s just move you up and down.
 */
export function pitchClass(a) {
  if (a.length === 0) return [];
  const out = a.slice();
  out[0] = 0;
  return trim(out);
}

/** Do two pitches differ only by octaves? */
export function sameClass(a, b) {
  return equals(pitchClass(a), pitchClass(b));
}
