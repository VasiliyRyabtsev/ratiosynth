import test from "node:test";
import assert from "node:assert/strict";

import { Sonority } from "../src/sonority.js";
import { fromFraction, format, UNISON, FIFTH, MAJOR_THIRD, equals } from "../src/ratio.js";

const r = (n, d = 1) => fromFraction(n, d);

/** Play a set of ratios at the same moment. */
function chord(sonority, fractions, at = 0) {
  return fractions.map(([n, d], i) => {
    const id = i + 1;
    sonority.noteOn(id, r(n, d), { at });
    return id;
  });
}

test("an empty sonority has nothing to say", () => {
  const sonority = new Sonority();
  const reading = sonority.read(0);
  assert.equal(reading.centre, null);
  assert.equal(reading.confidence, 0);
  assert.deepEqual(reading.sounding, []);
  assert.equal(reading.direction, null);
  assert.equal(reading.density.voices, 0);
});

test("the facts are just the facts", () => {
  const sonority = new Sonority();
  sonority.noteOn(1, FIFTH, { velocity: 0.8, at: 0 });
  sonority.noteOn(2, MAJOR_THIRD, { velocity: 0.4, at: 0.5 });

  const reading = sonority.read(1);
  assert.equal(reading.sounding.length, 2);
  assert.equal(reading.sounding[0].weight, 0.8);
  assert.equal(reading.sounding[0].age, 1);
  assert.equal(reading.sounding[1].age, 0.5);
  assert.ok(reading.sounding.every((note) => note.sounding));
});

test("a single note is its own centre", () => {
  const sonority = new Sonority();
  sonority.noteOn(1, FIFTH, { at: 0 });
  assert.equal(format(sonority.read(0).centre), "3/2");
});

test("a major triad is rooted on its root", () => {
  const sonority = new Sonority();
  chord(sonority, [[1, 1], [5, 4], [3, 2]]);

  const reading = sonority.read(0);
  assert.ok(equals(reading.centre, UNISON), `got ${format(reading.centre)}`);
  assert.ok(reading.confidence > 0.3);
});

test("the same triad moved keeps its shape and moves its centre", () => {
  // The same chord built on 3/2 instead of 1/1. In a ratio system this is the
  // identical shape, exactly transposed, so the centre must move with it.
  const sonority = new Sonority();
  chord(sonority, [[3, 2], [15, 8], [9, 8]]);

  const reading = sonority.read(0);
  assert.ok(equals(reading.centre, FIFTH), `got ${format(reading.centre)}`);
});

test("a sounding note is strongly favoured as the centre", () => {
  // Play only the third and fifth of a triad on 1/1. The absent root is a
  // candidate — it is an empty lattice point next to both notes — but it does
  // not win, and cannot: a note sitting on the origin scores complexity zero
  // for itself, which no empty point can match. So the fifth takes it.
  const sonority = new Sonority();
  chord(sonority, [[5, 4], [3, 2]]);

  const reading = sonority.read(0);
  assert.ok(equals(reading.centre, FIFTH), `got ${format(reading.centre)}`);
  assert.ok(
    reading.candidates.some((candidate) => equals(candidate.ratio, UNISON)),
    "the absent root should at least be considered",
  );
});

test("an unoccupied point wins only when gravity puts it there", () => {
  const fractions = [[5, 4], [3, 2]];

  const free = new Sonority({ gravity: 0 });
  chord(free, fractions);
  assert.ok(equals(free.read(0).centre, FIFTH));

  // Gravity is what lets home win against a note that is actually sounding.
  const pulled = new Sonority({ gravity: 0.7 });
  chord(pulled, fractions);
  const centre = pulled.read(0).centre;
  assert.ok(equals(centre, UNISON), `got ${format(centre)}`);
});

test("two notes with no shared root are reported as uncertain", () => {
  const clear = new Sonority();
  chord(clear, [[1, 1], [5, 4], [3, 2]]);

  const murky = new Sonority();
  // A tritone: famously rootless, and here genuinely so.
  chord(murky, [[1, 1], [45, 32]]);

  assert.ok(
    murky.read(0).confidence < clear.read(0).confidence,
    "an ambiguous chord should score lower confidence than a plain triad",
  );
});

test("candidates come back ranked, best first", () => {
  const sonority = new Sonority();
  chord(sonority, [[1, 1], [5, 4], [3, 2]]);

  const { candidates } = sonority.read(0);
  assert.ok(candidates.length > 1);
  for (let i = 1; i < candidates.length; i++) {
    assert.ok(candidates[i].score >= candidates[i - 1].score);
  }
  assert.ok(equals(candidates[0].ratio, UNISON));
});

test("memory fades, and an old note stops counting", () => {
  const sonority = new Sonority({ memory: 2 });
  sonority.noteOn(1, FIFTH, { velocity: 1, at: 0 });
  sonority.noteOff(1, { at: 1 });

  assert.equal(sonority.read(1).memory[0].weight, 1);
  const halfLater = sonority.read(2).memory[0].weight;
  assert.ok(Math.abs(halfLater - Math.exp(-0.5)) < 1e-9);

  // Long enough and it is gone entirely.
  assert.equal(sonority.read(40).memory.length, 0);
  assert.equal(sonority.read(40).centre, null);
});

test("a note that has ended still colours what comes next", () => {
  const sonority = new Sonority({ memory: 4 });
  chord(sonority, [[1, 1], [5, 4]]);
  sonority.noteOff(1, { at: 0.2 });
  sonority.noteOff(2, { at: 0.2 });
  sonority.noteOn(3, FIFTH, { at: 0.3 });

  const reading = sonority.read(0.4);
  assert.equal(reading.sounding.length, 1);
  assert.equal(reading.memory.length, 3);
  // The faded triad still pulls the centre to 1/1, even though the only thing
  // actually sounding is the fifth.
  assert.ok(equals(reading.centre, UNISON), `got ${format(reading.centre)}`);
});

test("memory length changes how long the past matters", () => {
  const build = (memory) => {
    const sonority = new Sonority({ memory });
    chord(sonority, [[1, 1], [5, 4]]);
    sonority.noteOff(1, { at: 0.1 });
    sonority.noteOff(2, { at: 0.1 });
    sonority.noteOn(3, r(7, 4), { at: 2 });
    return sonority.read(2.1);
  };

  const forgetful = build(0.3);
  const retentive = build(30);

  // With a short memory the old triad is gone and the new note stands alone.
  assert.equal(forgetful.memory.length, 1);
  assert.ok(equals(forgetful.centre, r(7, 4)));
  // With a long one it is all still there.
  assert.equal(retentive.memory.length, 3);
});

test("drift measures how far the centre has left home", () => {
  const sonority = new Sonority();
  sonority.noteOn(1, UNISON, { at: 0 });
  assert.ok(sonority.read(0).drift.home);
  assert.equal(sonority.read(0).drift.cents, 0);

  const moved = new Sonority();
  chord(moved, [[3, 2], [15, 8], [9, 8]]);
  const drift = moved.read(0).drift;
  assert.ok(!drift.home);
  // A centre a fifth above home is reported as a fourth below it — the same
  // place, named by the shorter route.
  assert.equal(format(drift.interval), "3/4");
  assert.ok(Math.abs(drift.cents + 498.045) < 0.01);
});

test("drift reports the shorter way round", () => {
  const sonority = new Sonority();
  // A fourth up is the same as a fifth down.
  chord(sonority, [[4, 3], [5, 3], [1, 1]]);
  const drift = sonority.read(0).drift;
  assert.ok(drift.cents <= 600 && drift.cents >= -600, `got ${drift.cents}`);
});

test("gravity pulls the centre toward home", () => {
  const notes = [[9, 8], [45, 32], [27, 16]]; // a triad two fifths from home

  const free = new Sonority({ gravity: 0 });
  chord(free, notes);
  const wandered = free.read(0).centre;

  const pulled = new Sonority({ gravity: 3 });
  chord(pulled, notes);
  const held = pulled.read(0).centre;

  assert.ok(equals(wandered, r(9, 8)), `free walk landed on ${format(wandered)}`);
  assert.ok(equals(held, UNISON), `gravity landed on ${format(held)}`);
});

test("density counts what is sounding, not what is remembered", () => {
  const sonority = new Sonority();
  chord(sonority, [[1, 1], [5, 4], [3, 2]]);
  sonority.noteOff(2, { at: 0.5 });

  const reading = sonority.read(1);
  assert.equal(reading.density.voices, 2);
  assert.equal(reading.memory.length, 3);
  assert.ok(Math.abs(reading.density.spanCents - 701.955) < 0.01);
});

test("direction says which way the music has been walking", () => {
  const sonority = new Sonority();
  // Four steps up by a fifth each time.
  [[1, 1], [3, 2], [9, 8], [27, 16]].forEach(([n, d], i) => {
    sonority.noteOn(i + 1, r(n, d), { at: i * 0.25 });
  });

  const { move, magnitude } = sonority.read(1).direction;
  assert.ok(magnitude > 0.5, "a steady climb should register as movement");
  // Every step added one to the 3 axis and nothing to the 5 axis.
  assert.ok(Math.abs(move[1] - 1) < 1e-9, `3-axis mean was ${move[1]}`);
  assert.ok(!move[2], `5-axis should be untouched, got ${move[2]}`);
});

test("wandering back and forth is not a direction", () => {
  const sonority = new Sonority();
  [[1, 1], [3, 2], [1, 1], [3, 2], [1, 1]].forEach(([n, d], i) => {
    sonority.noteOn(i + 1, r(n, d), { at: i * 0.25 });
  });

  const { magnitude } = sonority.read(1).direction;
  assert.ok(magnitude < 0.4, `going nowhere should read as little movement, got ${magnitude}`);
});

test("one sonority can watch only its own layer", () => {
  // A bass part that tracks itself and ignores everything above it.
  const bass = new Sonority({ accepts: (entry) => entry.tag === "bass" });
  bass.noteOn(1, UNISON, { at: 0, tag: "bass" });
  bass.noteOn(2, r(45, 32), { at: 0, tag: "lead" });

  const reading = bass.read(0);
  assert.equal(reading.memory.length, 1);
  assert.ok(equals(reading.centre, UNISON));
});

test("two sonorities over the same notes can disagree", () => {
  const everything = new Sonority();
  const upperOnly = new Sonority({ accepts: (entry) => entry.tag === "upper" });

  const notes = [
    [UNISON, "lower"],
    [r(4, 3), "lower"],
    [MAJOR_THIRD, "upper"],
    [r(15, 8), "upper"],
  ];

  notes.forEach(([ratio, tag], i) => {
    everything.noteOn(i, ratio, { at: 0, tag });
    upperOnly.noteOn(i, ratio, { at: 0, tag });
  });

  // Heard whole, this is rooted at 1/1. Heard from the upper part alone, the
  // same notes are rooted a third higher — and both readings are correct, for
  // the thing each one is listening to.
  assert.ok(equals(everything.read(0).centre, UNISON), format(everything.read(0).centre));
  assert.ok(equals(upperOnly.read(0).centre, MAJOR_THIRD), format(upperOnly.read(0).centre));
});

test("reading twice does not recompute", () => {
  const sonority = new Sonority();
  chord(sonority, [[1, 1], [5, 4], [3, 2]]);
  assert.equal(sonority.read(0), sonority.read(0));
  sonority.noteOn(9, r(7, 4), { at: 0 });
  assert.notEqual(sonority.read(0), sonority.read(0.1));
});

test("it survives a long stream of notes without growing", () => {
  const sonority = new Sonority({ memory: 1 });
  for (let i = 0; i < 500; i++) {
    sonority.noteOn(i, i % 2 ? FIFTH : MAJOR_THIRD, { at: i * 0.1 });
    sonority.noteOff(i, { at: i * 0.1 + 0.05 });
  }
  const reading = sonority.read(50);
  assert.ok(reading.memory.length < 64);
  assert.ok(reading.centre !== null);
});
