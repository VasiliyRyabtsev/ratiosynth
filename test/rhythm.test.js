import test from "node:test";
import assert from "node:assert/strict";

import { chordIntegers, periodsFor, phraseLength } from "../src/rhythm.js";
import { fromFraction } from "../src/ratio.js";

const chord = (...fractions) => fractions.map(([n, d]) => fromFraction(n, d));

test("a major triad is four, five and six", () => {
  // The example from the design, and it falls straight out of the lattice
  // coordinates rather than being written down anywhere.
  assert.deepEqual(chordIntegers(chord([1, 1], [5, 4], [3, 2])), [4, 5, 6]);
});

test("a bare fifth is two against three", () => {
  assert.deepEqual(chordIntegers(chord([1, 1], [3, 2])), [2, 3]);
});

test("the numbers do not care which octave the chord is in", () => {
  const low = chordIntegers(chord([1, 2], [5, 8], [3, 4]));
  const high = chordIntegers(chord([2, 1], [5, 2], [3, 1]));
  assert.deepEqual(low, [4, 5, 6]);
  assert.deepEqual(high, [4, 5, 6]);
});

test("a minor triad gives its own numbers", () => {
  // 10:12:15 — the same relationship upside down, and a longer phrase for it.
  assert.deepEqual(chordIntegers(chord([1, 1], [6, 5], [3, 2]), { cap: 20 }), [10, 12, 15]);
});

test("numbers too big to be a rhythm are dropped", () => {
  const remote = chordIntegers(chord([1, 1], [45, 32], [81, 64]), { cap: 12 });
  assert.ok(remote.every((value) => value <= 12));
});

test("nothing sounding gives nothing", () => {
  assert.deepEqual(chordIntegers([]), []);
  assert.deepEqual(chordIntegers(chord([1, 1])), []);
});

test("periods are handed out slowest first", () => {
  const periods = periodsFor(chord([1, 1], [5, 4], [3, 2]), 3);
  assert.deepEqual(periods, [6, 5, 4]);
  // The bass strides, the top fidgets.
  assert.ok(periods[0] > periods[periods.length - 1]);
});

test("more layers than numbers just reuses them", () => {
  const periods = periodsFor(chord([1, 1], [3, 2]), 5);
  assert.equal(periods.length, 5);
  assert.deepEqual(periods, [3, 2, 3, 2, 3]);
});

test("a chord with no usable numbers still gives a rhythm", () => {
  const periods = periodsFor([], 3);
  assert.equal(periods.length, 3);
  assert.ok(periods.every((period) => period >= 2));
});

test("the phrase is where the layers come back into line", () => {
  assert.equal(phraseLength([4, 5, 6]), 60);
  assert.equal(phraseLength([2, 3]), 6);
  assert.equal(phraseLength([3, 3]), 3);
});

test("an unreasonable phrase is capped rather than allowed", () => {
  assert.ok(phraseLength([7, 11, 13], { cap: 240 }) <= 240);
});

import { euclidean, patternFor } from "../src/rhythm.js";

const show = (pattern) => pattern.map((on) => (on ? "x" : ".")).join("");

test("onsets spread as evenly as they can through a cycle", () => {
  // Three in eight is long-long-short, which is most of the rhythm on earth.
  assert.equal(show(euclidean(3, 8)), "x..x.x..");
  assert.equal(show(euclidean(2, 5)), "x.x..");
  assert.equal(show(euclidean(3, 7)), "x.x.x..");
});

test("a cycle always begins on an onset", () => {
  for (let steps = 2; steps <= 16; steps++) {
    for (let onsets = 1; onsets < steps; onsets++) {
      assert.equal(euclidean(onsets, steps)[0], true, `${onsets} in ${steps} lost its downbeat`);
    }
  }
});

test("you get exactly as many onsets as you asked for", () => {
  for (let steps = 2; steps <= 16; steps++) {
    for (let onsets = 0; onsets <= steps; onsets++) {
      const count = euclidean(onsets, steps).filter(Boolean).length;
      assert.equal(count, onsets, `${onsets} in ${steps} gave ${count}`);
    }
  }
});

test("empty and full cycles are allowed", () => {
  assert.equal(show(euclidean(0, 4)), "....");
  assert.equal(show(euclidean(4, 4)), "xxxx");
});

test("a layer's rhythm is uneven, not a plain pulse", () => {
  for (const period of [3, 4, 5, 6]) {
    const rhythm = patternFor(period, { bars: 2, density: 0.4 });
    const gaps = rhythm.gaps.filter(Boolean);
    assert.ok(
      new Set(gaps).size > 1,
      `period ${period} gave an even pulse: ${show(rhythm.pattern)}`,
    );
  }
});

test("short cycles are stretched until they have room to be uneven", () => {
  assert.ok(patternFor(2, { bars: 1 }).steps >= 8);
  assert.ok(patternFor(3, { bars: 1 }).steps >= 8);
});

test("the gaps say how long each note has, and cover the whole cycle", () => {
  const rhythm = patternFor(6, { bars: 2, density: 0.4 });
  const total = rhythm.gaps.reduce((sum, gap) => sum + gap, 0);
  assert.equal(total, rhythm.steps, "the gaps should account for every step");
  assert.ok(rhythm.gaps.filter(Boolean).length === rhythm.onsets);
});

test("density decides how full the rhythm is", () => {
  const sparse = patternFor(6, { bars: 2, density: 0.2 });
  const full = patternFor(6, { bars: 2, density: 0.8 });
  assert.ok(sparse.onsets < full.onsets);
});
