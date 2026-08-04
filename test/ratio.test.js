import test from "node:test";
import assert from "node:assert/strict";

import {
  PRIMES,
  UNISON,
  OCTAVE,
  THREE_OVER_TWO,
  FIVE_OVER_FOUR,
  ratio,
  mul,
  div,
  inverse,
  pow,
  equals,
  limit,
  fromFraction,
  toFraction,
  format,
  parse,
  toNumber,
  log2,
  cents,
  toHz,
  nearestCents,
  complexity,
  distance,
  octaveReduce,
  withOctaves,
  pitchClass,
  sameClass,
} from "../src/ratio.js";

const COMMA = fromFraction(81, 80); // the syntonic comma, the classic near-miss

test("fractions round-trip through exponents", () => {
  assert.deepEqual(fromFraction(3, 2), [-1, 1]);
  assert.deepEqual(fromFraction(5, 4), [-2, 0, 1]);
  assert.deepEqual(fromFraction(7, 4), [-2, 0, 0, 1]);
  assert.deepEqual(fromFraction(1, 1), []);
  assert.deepEqual(fromFraction(2), [1]);

  for (const [n, d] of [[3, 2], [5, 4], [81, 80], [16, 9], [11, 8], [1, 1]]) {
    assert.equal(format(fromFraction(n, d)), `${n}/${d}`);
  }
});

test("fractions are always in lowest terms", () => {
  assert.equal(format(fromFraction(6, 4)), "3/2");
  assert.equal(format(fromFraction(100, 50)), "2/1");
});

test("bad input fails loudly rather than rounding", () => {
  assert.throws(() => fromFraction(37, 32), /beyond 31/);
  assert.throws(() => fromFraction(1.5, 2), /whole numbers/);
  assert.throws(() => fromFraction(-3, 2), /positive/);
  assert.throws(() => fromFraction(3, 0), /positive/);
});

test("parse reads plain text", () => {
  assert.deepEqual(parse("3/2"), THREE_OVER_TWO);
  assert.deepEqual(parse(" 5/4 "), FIVE_OVER_FOUR);
  assert.deepEqual(parse("2"), OCTAVE);
});

test("intervals stack and unstack", () => {
  // 3/2 on top of 3/2 is 9/4.
  assert.equal(format(mul(THREE_OVER_TWO, THREE_OVER_TWO)), "9/4");
  assert.equal(format(pow(THREE_OVER_TWO, 2)), "9/4");
  // 3/2 divided by 5/4 is 6/5, which completes the triad.
  assert.equal(format(div(THREE_OVER_TWO, FIVE_OVER_FOUR)), "6/5");
  assert.equal(format(inverse(THREE_OVER_TWO)), "2/3");
  assert.deepEqual(mul(THREE_OVER_TWO, inverse(THREE_OVER_TWO)), UNISON);
  assert.deepEqual(pow(THREE_OVER_TWO, 0), UNISON);
});

test("four 3/2s miss 5/4 by a comma", () => {
  // The reason no fixed scale can be right: go up by 3/2 four times, drop two
  // octaves, and you land next to 5/4 but not on it.
  const stacked = octaveReduce(pow(THREE_OVER_TWO, 4));
  assert.equal(format(stacked), "81/64");
  assert.equal(format(div(stacked, FIVE_OVER_FOUR)), "81/80");
  assert.ok(Math.abs(cents(COMMA) - 21.5) < 0.1);
});

test("equality ignores trailing zeros", () => {
  assert.ok(equals(ratio(-1, 1), [-1, 1, 0, 0]));
  assert.ok(!equals(THREE_OVER_TWO, FIVE_OVER_FOUR));
  assert.deepEqual(ratio(-1, 1, 0, 0), [-1, 1]);
});

test("limit reports the largest prime in play", () => {
  assert.equal(limit(UNISON), 1);
  assert.equal(limit(OCTAVE), 2);
  assert.equal(limit(THREE_OVER_TWO), 3);
  assert.equal(limit(FIVE_OVER_FOUR), 5);
  assert.equal(limit(fromFraction(7, 4)), 7);
  assert.equal(limit(fromFraction(11, 8)), 11);
});

test("ratios become exact numbers", () => {
  assert.equal(toNumber(UNISON), 1);
  assert.equal(toNumber(OCTAVE), 2);
  assert.equal(toNumber(THREE_OVER_TWO), 1.5);
  assert.equal(toNumber(FIVE_OVER_FOUR), 1.25);
  assert.equal(toNumber(inverse(THREE_OVER_TWO)), 2 / 3);
});

test("very distant ratios still give a usable number", () => {
  // Far enough out that the whole numbers no longer fit exactly.
  const far = pow(THREE_OVER_TWO, 40);
  const value = toNumber(far);
  assert.ok(Number.isFinite(value) && value > 0);
  assert.ok(Math.abs(Math.log2(value) - log2(far)) < 1e-9);
});

test("cents match the usual figures", () => {
  assert.equal(cents(UNISON), 0);
  assert.equal(cents(OCTAVE), 1200);
  assert.ok(Math.abs(cents(THREE_OVER_TWO) - 701.955) < 0.001);
  assert.ok(Math.abs(cents(FIVE_OVER_FOUR) - 386.314) < 0.001);
});

test("complexity says how tangled a ratio is", () => {
  assert.equal(complexity(UNISON), 0);
  assert.ok(complexity(THREE_OVER_TWO) < complexity(FIVE_OVER_FOUR));
  assert.ok(complexity(FIVE_OVER_FOUR) < complexity(fromFraction(81, 64)));
  // It is log2(numerator * denominator), computed without building them.
  assert.ok(Math.abs(complexity(COMMA) - Math.log2(81 * 80)) < 1e-9);
});

test("distance is about relatedness, not pitch height", () => {
  // 3/2 is a big leap but a close relation.
  const aThreeTwoApart = distance(THREE_OVER_TWO, UNISON);
  // A comma is almost the same pitch but a distant relation.
  const aCommaApart = distance(fromFraction(81, 64), FIVE_OVER_FOUR);
  assert.ok(cents(THREE_OVER_TWO) > 700 && cents(COMMA) < 22);
  assert.ok(aThreeTwoApart < aCommaApart);
  assert.equal(distance(THREE_OVER_TWO, THREE_OVER_TWO), 0);
});

test("octave reduction lands inside one octave", () => {
  for (const r of [pow(THREE_OVER_TWO, 4), pow(THREE_OVER_TWO, -3), FIVE_OVER_FOUR, OCTAVE, UNISON]) {
    const reduced = octaveReduce(r);
    const value = toNumber(reduced);
    assert.ok(value >= 1 && value < 2, `${format(r)} reduced to ${format(reduced)}`);
    assert.ok(sameClass(r, reduced));
  }
  assert.deepEqual(octaveReduce(OCTAVE), UNISON);
  assert.equal(format(octaveReduce(pow(THREE_OVER_TWO, 4))), "81/64");
});

test("octaves move a pitch without changing what it is", () => {
  assert.equal(format(withOctaves(THREE_OVER_TWO, 1)), "3/1");
  assert.equal(format(withOctaves(THREE_OVER_TWO, -1)), "3/4");
  assert.deepEqual(withOctaves(THREE_OVER_TWO, 0), THREE_OVER_TWO);
  assert.ok(sameClass(THREE_OVER_TWO, withOctaves(THREE_OVER_TWO, 3)));
});

test("pitch class drops the octave", () => {
  assert.deepEqual(pitchClass(THREE_OVER_TWO), [0, 1]);
  assert.deepEqual(pitchClass(OCTAVE), UNISON);
  assert.deepEqual(pitchClass(UNISON), UNISON);
  assert.ok(!sameClass(THREE_OVER_TWO, FIVE_OVER_FOUR));
});

test("frequencies appear only at the end", () => {
  assert.equal(toHz(UNISON, 220), 220);
  assert.equal(toHz(OCTAVE, 220), 440);
  assert.equal(toHz(THREE_OVER_TWO, 440), 660);
  assert.ok(Math.abs(nearestCents(660, 440) - cents(THREE_OVER_TWO)) < 1e-9);
});

test("a just major triad is 4:5:6", () => {
  const triad = [UNISON, FIVE_OVER_FOUR, THREE_OVER_TWO].map((r) => toHz(r, 264));
  assert.deepEqual(triad, [264, 330, 396]);
  assert.deepEqual(triad.map((hz) => hz / 66), [4, 5, 6]);
});

test("big exponents stay exact as fractions", () => {
  const { n, d } = toFraction(pow(THREE_OVER_TWO, 20));
  assert.equal(n, 3n ** 20n);
  assert.equal(d, 2n ** 20n);
});

test("the prime list is in order and starts at 2", () => {
  assert.equal(PRIMES[0], 2);
  for (let i = 1; i < PRIMES.length; i++) assert.ok(PRIMES[i] > PRIMES[i - 1]);
});
