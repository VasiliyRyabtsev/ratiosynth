import test from "node:test";
import assert from "node:assert/strict";

import {
  PRIMES,
  UNISON,
  OCTAVE,
  FIFTH,
  MAJOR_THIRD,
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
  assert.deepEqual(parse("3/2"), FIFTH);
  assert.deepEqual(parse(" 5/4 "), MAJOR_THIRD);
  assert.deepEqual(parse("2"), OCTAVE);
});

test("intervals stack and unstack", () => {
  // A fifth on top of a fifth is 9/4, a ninth.
  assert.equal(format(mul(FIFTH, FIFTH)), "9/4");
  assert.equal(format(pow(FIFTH, 2)), "9/4");
  // 3/2 divided by 5/4 is 6/5, the minor third that completes the triad.
  assert.equal(format(div(FIFTH, MAJOR_THIRD)), "6/5");
  assert.equal(format(inverse(FIFTH)), "2/3");
  assert.deepEqual(mul(FIFTH, inverse(FIFTH)), UNISON);
  assert.deepEqual(pow(FIFTH, 0), UNISON);
});

test("four fifths miss a major third by a comma", () => {
  // The reason no fixed scale can be right: go up four fifths, drop two
  // octaves, and you land next to 5/4 but not on it.
  const fourFifths = octaveReduce(pow(FIFTH, 4));
  assert.equal(format(fourFifths), "81/64");
  assert.equal(format(div(fourFifths, MAJOR_THIRD)), "81/80");
  assert.ok(Math.abs(cents(COMMA) - 21.5) < 0.1);
});

test("equality ignores trailing zeros", () => {
  assert.ok(equals(ratio(-1, 1), [-1, 1, 0, 0]));
  assert.ok(!equals(FIFTH, MAJOR_THIRD));
  assert.deepEqual(ratio(-1, 1, 0, 0), [-1, 1]);
});

test("limit reports the largest prime in play", () => {
  assert.equal(limit(UNISON), 1);
  assert.equal(limit(OCTAVE), 2);
  assert.equal(limit(FIFTH), 3);
  assert.equal(limit(MAJOR_THIRD), 5);
  assert.equal(limit(fromFraction(7, 4)), 7);
  assert.equal(limit(fromFraction(11, 8)), 11);
});

test("ratios become exact numbers", () => {
  assert.equal(toNumber(UNISON), 1);
  assert.equal(toNumber(OCTAVE), 2);
  assert.equal(toNumber(FIFTH), 1.5);
  assert.equal(toNumber(MAJOR_THIRD), 1.25);
  assert.equal(toNumber(inverse(FIFTH)), 2 / 3);
});

test("very distant ratios still give a usable number", () => {
  // Far enough out that the whole numbers no longer fit exactly.
  const far = pow(FIFTH, 40);
  const value = toNumber(far);
  assert.ok(Number.isFinite(value) && value > 0);
  assert.ok(Math.abs(Math.log2(value) - log2(far)) < 1e-9);
});

test("cents match the usual figures", () => {
  assert.equal(cents(UNISON), 0);
  assert.equal(cents(OCTAVE), 1200);
  assert.ok(Math.abs(cents(FIFTH) - 701.955) < 0.001);
  assert.ok(Math.abs(cents(MAJOR_THIRD) - 386.314) < 0.001);
});

test("complexity says how tangled a ratio is", () => {
  assert.equal(complexity(UNISON), 0);
  assert.ok(complexity(FIFTH) < complexity(MAJOR_THIRD));
  assert.ok(complexity(MAJOR_THIRD) < complexity(fromFraction(81, 64)));
  // It is log2(numerator * denominator), computed without building them.
  assert.ok(Math.abs(complexity(COMMA) - Math.log2(81 * 80)) < 1e-9);
});

test("distance is about relatedness, not pitch height", () => {
  // A fifth is a big leap but a close relation.
  const aFifthApart = distance(FIFTH, UNISON);
  // A comma is almost the same pitch but a distant relation.
  const aCommaApart = distance(fromFraction(81, 64), MAJOR_THIRD);
  assert.ok(cents(FIFTH) > 700 && cents(COMMA) < 22);
  assert.ok(aFifthApart < aCommaApart);
  assert.equal(distance(FIFTH, FIFTH), 0);
});

test("octave reduction lands inside one octave", () => {
  for (const r of [pow(FIFTH, 4), pow(FIFTH, -3), MAJOR_THIRD, OCTAVE, UNISON]) {
    const reduced = octaveReduce(r);
    const value = toNumber(reduced);
    assert.ok(value >= 1 && value < 2, `${format(r)} reduced to ${format(reduced)}`);
    assert.ok(sameClass(r, reduced));
  }
  assert.deepEqual(octaveReduce(OCTAVE), UNISON);
  assert.equal(format(octaveReduce(pow(FIFTH, 4))), "81/64");
});

test("octaves move a pitch without changing what it is", () => {
  assert.equal(format(withOctaves(FIFTH, 1)), "3/1");
  assert.equal(format(withOctaves(FIFTH, -1)), "3/4");
  assert.deepEqual(withOctaves(FIFTH, 0), FIFTH);
  assert.ok(sameClass(FIFTH, withOctaves(FIFTH, 3)));
});

test("pitch class drops the octave", () => {
  assert.deepEqual(pitchClass(FIFTH), [0, 1]);
  assert.deepEqual(pitchClass(OCTAVE), UNISON);
  assert.deepEqual(pitchClass(UNISON), UNISON);
  assert.ok(!sameClass(FIFTH, MAJOR_THIRD));
});

test("frequencies appear only at the end", () => {
  assert.equal(toHz(UNISON, 220), 220);
  assert.equal(toHz(OCTAVE, 220), 440);
  assert.equal(toHz(FIFTH, 440), 660);
  assert.ok(Math.abs(nearestCents(660, 440) - cents(FIFTH)) < 1e-9);
});

test("a just major triad is 4:5:6", () => {
  const triad = [UNISON, MAJOR_THIRD, FIFTH].map((r) => toHz(r, 264));
  assert.deepEqual(triad, [264, 330, 396]);
  assert.deepEqual(triad.map((hz) => hz / 66), [4, 5, 6]);
});

test("big exponents stay exact as fractions", () => {
  const { n, d } = toFraction(pow(FIFTH, 20));
  assert.equal(n, 3n ** 20n);
  assert.equal(d, 2n ** 20n);
});

test("the prime list is in order and starts at 2", () => {
  assert.equal(PRIMES[0], 2);
  for (let i = 1; i < PRIMES.length; i++) assert.ok(PRIMES[i] > PRIMES[i - 1]);
});
