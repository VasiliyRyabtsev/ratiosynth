import test from "node:test";
import assert from "node:assert/strict";

import {
  pairRoughness,
  roughnessBetween,
  roughnessBetweenSlow,
  selfRoughness,
  totalRoughness,
} from "../src/roughness.js";
import { harmonicSeries, makeVoiceModes, partialsAt } from "../src/instrument.js";

const modes = (options = {}) => makeVoiceModes(harmonicSeries(12), { detune: 0, ...options });
const REFERENCE = 264;

/** Roughness between two notes an interval apart, in cents. */
function atInterval(cents, options = {}) {
  const set = modes(options);
  return roughnessBetween(
    partialsAt(set, REFERENCE),
    partialsAt(set, REFERENCE * 2 ** (cents / 1200)),
  );
}

test("two pure tones at the same pitch are smooth", () => {
  assert.equal(pairRoughness(440, 1, 440, 1), 0);
});

test("two pure tones far apart are smooth", () => {
  assert.equal(pairRoughness(220, 1, 3000, 1), 0);
});

test("roughness peaks at a small gap and falls away on both sides", () => {
  const gaps = [0, 2, 5, 10, 15, 20, 30, 50, 100, 200, 400];
  const values = gaps.map((gap) => pairRoughness(440, 1, 440 + gap, 1));

  const peak = values.indexOf(Math.max(...values));
  assert.ok(peak > 0 && peak < gaps.length - 1, "the peak should be in the middle");

  for (let i = 1; i <= peak; i++) assert.ok(values[i] >= values[i - 1], "should rise to the peak");
  for (let i = peak + 1; i < values.length; i++) {
    assert.ok(values[i] <= values[i - 1], "should fall after the peak");
  }
});

test("a worst case pair of equally loud partials scores about 1", () => {
  let worst = 0;
  for (let gap = 0; gap < 200; gap += 0.25) worst = Math.max(worst, pairRoughness(440, 1, 440 + gap, 1));
  assert.ok(Math.abs(worst - 1) < 0.01, `worst pair scored ${worst}`);
});

test("low notes need a wider gap before they stop fighting", () => {
  // The same gap in Hz is much rougher low down than high up — which is why a
  // chord that works in the middle turns to mud an octave below.
  const gap = 25;
  const low = pairRoughness(110, 1, 110 + gap, 1);
  const high = pairRoughness(1760, 1, 1760 + gap, 1);
  assert.ok(low > high, `low ${low} should be rougher than high ${high}`);
});

test("quieter partials contribute less", () => {
  const loud = pairRoughness(440, 1, 455, 1);
  const soft = pairRoughness(440, 0.5, 455, 0.5);
  assert.ok(Math.abs(soft - loud * 0.25) < 1e-12);
});

test("skipping distant pairs gives the same answer as comparing everything", () => {
  const set = modes();
  for (const cents of [0, 100, 386, 498, 702, 1200, 1902]) {
    const a = partialsAt(set, REFERENCE);
    const b = partialsAt(set, REFERENCE * 2 ** (cents / 1200));
    assert.ok(
      Math.abs(roughnessBetween(a, b) - roughnessBetweenSlow(a, b)) < 1e-9,
      `mismatch at ${cents} cents`,
    );
  }
});

test("unison and octave are the smoothest intervals there are", () => {
  const unison = atInterval(0);
  const octave = atInterval(1200);
  const narrow = atInterval(111.73); // 16/15, the narrowest step in the scale

  assert.ok(unison < 0.1);
  assert.ok(octave < 0.1);
  assert.ok(narrow > unison * 10, "a narrow interval should be far rougher");
});

test("3/2 is the smoothest interval that is not a unison or an octave", () => {
  const pure = atInterval(702);
  for (const cents of [112, 204, 316, 386, 498, 590, 814, 884, 1088]) {
    assert.ok(pure < atInterval(cents), `${cents} cents should be rougher than 3/2`);
  }
});

test("the valleys land on simple ratios", () => {
  // This is the claim the whole project rests on, so it is worth asserting
  // directly: sweep an octave, and the smoothest points are the simple ratios.
  const isValley = (cents) =>
    atInterval(cents) < atInterval(cents - 12) && atInterval(cents) < atInterval(cents + 12);

  for (const [cents, name] of [
    [386, "5/4"],
    [498, "4/3"],
    [702, "3/2"],
    [884, "5/3"],
  ]) {
    assert.ok(isValley(cents), `${name} at ${cents} cents should be a valley`);
  }
});

test("roughness cannot tell 5/4 from 81/64, and is not supposed to", () => {
  // Twenty-two cents apart, and near enough identical in roughness. Physical
  // beating does not distinguish them — which is exactly why there is a second,
  // melodic score based on how simple the ratio is.
  const just = atInterval(386.31);
  const pythagorean = atInterval(407.82);
  assert.ok(Math.abs(just - pythagorean) < 0.05, `${just} vs ${pythagorean}`);
});

test("changing the instrument moves where the smooth intervals are", () => {
  // The central claim: tuning and timbre are one problem. Stretch the partials
  // away from whole-number ratios and the smoothest point near 700¢ is no
  // longer 3/2.
  const smoothestNear = (target, options) => {
    let best = Infinity;
    let bestCents = target;
    for (let cents = target - 60; cents <= target + 60; cents += 1) {
      const value = atInterval(cents, options);
      if (value < best) {
        best = value;
        bestCents = cents;
      }
    }
    return bestCents;
  };

  assert.equal(smoothestNear(702, { stretchAmount: 0 }), 702);

  const stretched = smoothestNear(702, { stretchAmount: 1 });
  assert.ok(stretched > 715, `smoothest point moved to ${stretched}, expected well above 702`);

  // And 3/2 itself is measurably worse on that instrument.
  assert.ok(atInterval(702, { stretchAmount: 1 }) > atInterval(702, { stretchAmount: 0 }));
});

test("a sound has some roughness with itself", () => {
  const partials = partialsAt(modes(), 110);
  assert.ok(selfRoughness(partials) > 0, "low harmonics crowd each other");
  // High up the same partials are spread wider apart and interfere less.
  assert.ok(selfRoughness(partialsAt(modes(), 880)) < selfRoughness(partials));
});

test("total roughness adds up every pair in a chord", () => {
  const set = modes();
  const notes = [1, 5 / 4, 3 / 2].map((ratio) => partialsAt(set, REFERENCE * ratio));

  const expected =
    roughnessBetween(notes[0], notes[1]) +
    roughnessBetween(notes[0], notes[2]) +
    roughnessBetween(notes[1], notes[2]);

  assert.ok(Math.abs(totalRoughness(notes, { includeSelf: false }) - expected) < 1e-9);
  assert.ok(totalRoughness(notes) > expected, "including self-roughness should add more");
});

test("a triad in tune beats the same triad slightly out", () => {
  const set = modes();
  const chord = (cents) => cents.map((c) => partialsAt(set, REFERENCE * 2 ** (c / 1200)));

  // 4:5:6 exactly, against the same chord with its 5/4 fourteen cents sharp
  // and its 3/2 two flat — small enough to still read as the same chord, and
  // the model has to notice anyway. This is the whole reason nothing rounds.
  const inTune = totalRoughness(chord([0, 386.31, 701.96]), { includeSelf: false });
  const off = totalRoughness(chord([0, 400, 700]), { includeSelf: false });

  assert.ok(inTune < off, `in tune ${inTune} should beat out of tune ${off}`);
});
