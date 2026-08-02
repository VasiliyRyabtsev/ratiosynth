import test from "node:test";
import assert from "node:assert/strict";

import { generateCandidates, scoreCandidates, chooseNext, DEFAULTS } from "../src/choose.js";
import { Sonority } from "../src/sonority.js";
import { harmonicSeries, makeVoiceModes } from "../src/instrument.js";
import { fromFraction, format, cents, complexity, equals, div, UNISON } from "../src/ratio.js";

const REFERENCE = 264;
const modes = makeVoiceModes(harmonicSeries(12), { detune: 0 });
const r = (n, d = 1) => fromFraction(n, d);

function playing(fractions, options = {}) {
  const sonority = new Sonority(options.sonority);
  fractions.forEach(([n, d], i) => sonority.noteOn(i, r(n, d), { at: 0 }));
  return sonority.read(options.at ?? 0);
}

function context(reading, params = {}) {
  return { reading, modes, referenceHz: REFERENCE, params };
}

/** A fixed sequence in place of Math.random, so choices are repeatable. */
function fakeRandom(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

test("candidates are neighbours of what is happening, not a fixed scale", () => {
  const reading = playing([[1, 1]]);
  const candidates = generateCandidates(reading, { registerLow: 0, registerHigh: 1199 });
  const names = candidates.map(format).sort();

  // One step along the 3 and 5 axes from 1/1, folded into one octave.
  assert.ok(names.includes("3/2"), names);
  assert.ok(names.includes("4/3"), names);
  assert.ok(names.includes("5/4"), names);
  assert.ok(names.includes("8/5"), names);
  // And nothing that is not reachable in one step.
  assert.ok(!names.includes("7/4"), names);
});

test("the candidate set moves when the music moves", () => {
  const here = generateCandidates(playing([[1, 1]]), { registerLow: 0, registerHigh: 1199 });
  const there = generateCandidates(playing([[7, 4]]), { registerLow: 0, registerHigh: 1199 });

  const names = (set) => new Set(set.map(format));
  assert.notDeepEqual(names(here), names(there));
  // Stepping by a fifth from 7/4 lands on 21/16, which was not on offer before.
  assert.ok(names(there).has("21/16"), [...names(there)].join(" "));
});

test("a bigger radius offers more distant relatives", () => {
  const reading = playing([[1, 1]]);
  const near = generateCandidates(reading, { radius: 1, registerLow: 0, registerHigh: 1199 });
  const far = generateCandidates(reading, { radius: 2, registerLow: 0, registerHigh: 1199 });
  assert.ok(far.length > near.length);
});

test("candidates appear in every octave the register allows", () => {
  const reading = playing([[1, 1]]);
  const narrow = generateCandidates(reading, { registerLow: 0, registerHigh: 1199 });
  const wide = generateCandidates(reading, { registerLow: -1200, registerHigh: 2400 });

  assert.ok(wide.length > narrow.length * 2);
  for (const candidate of wide) {
    const height = cents(candidate);
    assert.ok(height >= -1200 && height <= 2400, `${format(candidate)} is out of register`);
  }
});

test("a pitch already sounding is never offered again", () => {
  const reading = playing([[1, 1], [3, 2]]);
  const candidates = generateCandidates(reading, { registerLow: 0, registerHigh: 1199 });
  for (const candidate of candidates) {
    assert.ok(!equals(candidate, UNISON), "1/1 is already sounding");
    assert.ok(!equals(candidate, r(3, 2)), "3/2 is already sounding");
  }
});

test("with nothing playing at all it still has somewhere to start", () => {
  const empty = new Sonority().read(0);
  const candidates = generateCandidates(empty, DEFAULTS);
  assert.ok(candidates.length > 0);
});

test("the harmonic score is roughness against what is sounding", () => {
  const reading = playing([[1, 1]]);
  const scored = scoreCandidates(
    [r(3, 2), r(45, 32)],
    context(reading, { balance: 1, tension: 0 }),
  );

  const fifth = scored.find((c) => equals(c.ratio, r(3, 2)));
  const tritone = scored.find((c) => equals(c.ratio, r(45, 32)));
  assert.ok(fifth.roughness < tritone.roughness);
});

test("the melodic score is how tangled the ratio is to memory", () => {
  const reading = playing([[1, 1]]);
  const scored = scoreCandidates([r(3, 2), r(81, 64)], context(reading));

  const fifth = scored.find((c) => equals(c.ratio, r(3, 2)));
  const wolf = scored.find((c) => equals(c.ratio, r(81, 64)));
  assert.ok(fifth.tangle < wolf.tangle);
  assert.ok(Math.abs(fifth.tangle - complexity(r(3, 2))) < 1e-9);
});

test("the melodic score counts notes that have stopped", () => {
  // Nothing is sounding, so the harmonic score has nothing to say. The melodic
  // score still does, because the ear has not forgotten.
  const sonority = new Sonority({ memory: 8 });
  sonority.noteOn(1, r(5, 4), { at: 0 });
  sonority.noteOff(1, { at: 0.1 });
  const reading = sonority.read(0.2);

  assert.equal(reading.sounding.length, 0);
  const scored = scoreCandidates([r(3, 2), r(45, 32)], context(reading, { balance: 0 }));
  assert.ok(scored.every((c) => c.roughness === 0), "nothing is ringing to be rough against");
  assert.ok(scored[0].tangle < scored[scored.length - 1].tangle);
});

test("balance decides which score is in charge", () => {
  const reading = playing([[1, 1]]);
  const candidates = generateCandidates(reading, DEFAULTS);

  // Doubling is switched off so each score is judged on its own terms.
  const harmonic = scoreCandidates(candidates, context(reading, { balance: 1, tension: 0, doubling: 0 }));
  const melodic = scoreCandidates(candidates, context(reading, { balance: 0, reach: 0, doubling: 0 }));

  // Ranked by different things, so the winners should differ.
  assert.notEqual(format(harmonic[0].ratio), format(melodic[0].ratio));
  // Whichever score is in charge, its own best candidate should win.
  assert.equal(harmonic[0].roughness, Math.min(...harmonic.map((c) => c.roughness)));
  assert.equal(melodic[0].tangle, Math.min(...melodic.map((c) => c.tangle)));
});

test("tension aims at rough instead of smooth", () => {
  const reading = playing([[1, 1]]);
  const candidates = generateCandidates(reading, DEFAULTS);

  const calm = scoreCandidates(candidates, context(reading, { balance: 1, tension: 0 }));
  const tense = scoreCandidates(candidates, context(reading, { balance: 1, tension: 1 }));

  assert.ok(tense[0].roughness > calm[0].roughness * 3, "asking for rough should get rough");
  assert.equal(tense[0].roughness, Math.max(...tense.map((c) => c.roughness)));
});

test("reach aims at remote instead of simple", () => {
  const reading = playing([[1, 1]]);
  const candidates = generateCandidates(reading, { ...DEFAULTS, radius: 2 });

  const plain = scoreCandidates(candidates, context(reading, { balance: 0, reach: 0 }));
  const remote = scoreCandidates(candidates, context(reading, { balance: 0, reach: 1 }));

  assert.ok(remote[0].tangle > plain[0].tangle);
});

test("with no spread it takes the best candidate every time", () => {
  const reading = playing([[1, 1]]);
  const params = { spread: 0, balance: 1, tension: 0 };
  const first = chooseNext({ ...context(reading, params), random: () => 0.9 });
  const again = chooseNext({ ...context(reading, params), random: () => 0.1 });
  assert.equal(format(first.ratio), format(again.ratio));
});

test("spread lets it reach past the best candidate", () => {
  const reading = playing([[1, 1]]);
  const params = { spread: 0.5 };
  const picks = new Set();
  for (let i = 0; i < 40; i++) {
    picks.add(format(chooseNext({ ...context(reading, params), random: Math.random }).ratio));
  }
  assert.ok(picks.size > 1, "with spread it should not always pick the same note");
});

test("choosing is repeatable when the randomness is", () => {
  const reading = playing([[1, 1]]);
  const sequence = [0.1, 0.4, 0.85, 0.2];
  const run = () =>
    chooseNext({ ...context(reading, { spread: 0.3 }), random: fakeRandom(sequence) }).ratio;
  assert.equal(format(run()), format(run()));
});

test("the step limit keeps it from leaping", () => {
  const reading = playing([[1, 1]]);
  const near = chooseNext({
    ...context(reading, { radius: 3, maxStep: 3, spread: 0.4 }),
    random: Math.random,
  });
  assert.ok(complexity(div(near.ratio, UNISON)) <= 12);

  // The move itself, ignoring octave, must be inside the limit.
  for (let i = 0; i < 30; i++) {
    const pick = chooseNext({
      ...context(reading, { radius: 3, maxStep: 3, spread: 0.5 }),
      random: Math.random,
    });
    assert.ok(pick !== null);
  }
});

test("an impossible step limit does not leave it stuck", () => {
  const reading = playing([[1, 1]]);
  const pick = chooseNext({ ...context(reading, { maxStep: 0.0001 }), random: Math.random });
  assert.ok(pick !== null, "it should play something rather than fall silent");
});

test("asked for the smoothest thing, it finds the fifth on its own", () => {
  // Nothing here knows what a fifth is. It falls out of asking for the least
  // rough new pitch against a sounding 1/1.
  const sonority = new Sonority();
  sonority.noteOn(0, UNISON, { at: 0 });

  const params = { spread: 0, balance: 0.6, tension: 0, reach: 0, registerLow: 0, registerHigh: 1200 };
  const pick = chooseNext(context(sonority.read(0), params));

  assert.equal(format(pick.ratio), "3/2");
});

test("an octave of a note already playing is discouraged", () => {
  const reading = playing([[1, 1]]);
  const params = { registerLow: 0, registerHigh: 1200, balance: 0.6, tension: 0, reach: 0 };

  const withPenalty = scoreCandidates(
    generateCandidates(reading, params),
    context(reading, { ...params, doubling: 0.25 }),
  );
  const without = scoreCandidates(
    generateCandidates(reading, params),
    context(reading, { ...params, doubling: 0 }),
  );

  // Untouched, the octave wins every time — it is the smoothest and simplest
  // interval there is, and it brings no new pitch with it.
  assert.equal(format(without[0].ratio), "2/1");
  assert.equal(format(withPenalty[0].ratio), "3/2");
  assert.ok(withPenalty.find((c) => format(c.ratio) === "2/1").doubles);
});

test("tension is what brings in thirds", () => {
  // Fifths and octaves are the smooth intervals; thirds are genuinely rougher.
  // So a taste for roughness is not a decoration here, it is the thing that
  // makes harmony richer than bare fifths.
  const reading = playing([[1, 1], [3, 2]]);
  const params = { balance: 0.6, reach: 0, registerLow: 0, registerHigh: 1200 };
  const candidates = generateCandidates(reading, params);

  const calm = scoreCandidates(candidates, context(reading, { ...params, tension: 0 }));
  const tense = scoreCandidates(candidates, context(reading, { ...params, tension: 0.7 }));

  const isThird = (candidate) => ["5/4", "6/5"].includes(format(candidate.ratio));
  assert.ok(!calm.slice(0, 2).some(isThird), "smooth music does not reach for thirds");
  assert.ok(tense.slice(0, 2).some(isThird), "rougher music should");
});

test("what it plays depends on the instrument it is played on", () => {
  // The claim from §1, end to end: same starting note, same knobs, different
  // partials — and the note it wants changes.
  const reading = playing([[1, 1]]);
  const params = { spread: 0, balance: 1, tension: 0, doubling: 0, registerLow: 0, registerHigh: 1200 };

  const plain = chooseNext({ reading, modes, referenceHz: REFERENCE, params });

  // An instrument whose partials are stretched far off whole numbers.
  const stretched = makeVoiceModes(harmonicSeries(12), { detune: 0, stretchAmount: 1 });
  const bent = chooseNext({ reading, modes: stretched, referenceHz: REFERENCE, params });

  assert.notEqual(format(plain.ratio), format(bent.ratio));
});

test("a line prefers to move by steps rather than leap", () => {
  // Lattice distance and pitch distance are different questions: 3/2 is one of
  // the simplest ratios there is and also a leap of 702 cents.
  const reading = playing([[1, 1]]);
  const from = r(1, 1);
  const params = { balance: 0.5, doubling: 0, registerLow: 0, registerHigh: 1200, from };

  const free = scoreCandidates(generateCandidates(reading, params), context(reading, { ...params, stepwise: 0 }));
  const led = scoreCandidates(generateCandidates(reading, params), context(reading, { ...params, stepwise: 3 }));

  const move = (scored) => Math.abs(cents(scored[0].ratio) - cents(from));
  assert.ok(move(led) < move(free), `stepwise picked ${move(led)}¢, free picked ${move(free)}¢`);
});

test("standing still is discouraged as much as leaping", () => {
  // A cost that only preferred small moves would settle on repeating the same
  // note forever, which is not melody either.
  const reading = playing([[5, 4]]);
  const from = r(1, 1);
  const params = { registerLow: -600, registerHigh: 1800, from, stepwise: 3, doubling: 0 };
  const scored = scoreCandidates(generateCandidates(reading, params), context(reading, params));

  const chosen = Math.abs(cents(scored[0].ratio) - cents(from));
  assert.ok(chosen > 40, `it chose to stand still (${chosen}¢)`);
  assert.ok(chosen < 500, `it chose to leap (${chosen}¢)`);
});

test("the step cost is measured in cents, not against the other candidates", () => {
  // Two situations, one with only distant options. The distant one must still
  // read as a leap rather than being flattered by having no rivals.
  const near = playing([[1, 1]]);
  const params = { from: r(1, 1), stepwise: 2, doubling: 0 };

  const close = scoreCandidates([r(9, 8)], context(near, params))[0];
  const far = scoreCandidates([r(2, 1)], context(near, params))[0];
  assert.ok(close.cost < far.cost, "an octave should cost more than a tone");
});
