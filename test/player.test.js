import test from "node:test";
import assert from "node:assert/strict";

import { Player } from "../src/player.js";
import { Sonority } from "../src/sonority.js";
import { harmonicSeries, makeVoiceModes } from "../src/instrument.js";
import { fromFraction, format, cents, complexity, div, pitchClass } from "../src/ratio.js";

const modes = makeVoiceModes(harmonicSeries(12), { detune: 0 });

/** A player wired to a fake instrument, driven by hand with no audio or timers. */
function makePlayer(playerParams = {}, chooseParams = {}) {
  const sonority = new Sonority({ memory: 4 });
  let clock = 0;
  let nextId = 1;
  const played = [];

  const player = new Player({
    sonority,
    now: () => clock,
    play: (ratio, velocity, tag) => {
      const id = nextId++;
      played.push({ id, ratio, velocity, tag, at: clock, step: player.step });
      sonority.noteOn(id, ratio, { velocity, at: clock, tag });
      return id;
    },
    release: (id) => sonority.noteOff(id, { at: clock }),
    instrument: () => ({
      modes,
      referenceHz: 264,
      params: { registerLow: -1200, registerHigh: 1600, ...chooseParams },
    }),
    params: playerParams,
  });

  return {
    player,
    sonority,
    played,
    run(steps) {
      for (let i = 0; i < steps; i++) {
        player.advance();
        clock += player.params.pulse;
      }
      return played;
    },
    at: () => clock,
  };
}

test("a pulse plays something", () => {
  const rig = makePlayer({ restChance: 0 });
  rig.run(4);
  assert.ok(rig.played.length > 0);
});

test("each layer keeps to its own pattern", () => {
  const rig = makePlayer({ layers: 3, restChance: 0, recurrence: 0 });
  rig.run(48);

  for (const voice of rig.player.voices) {
    const steps = rig.played.filter((note) => note.tag === voice.tag).map((note) => note.step);
    assert.ok(steps.length > 0, `${voice.tag} never played`);
    for (const step of steps) {
      const place = (step + voice.offset) % voice.rhythm.steps;
      assert.ok(voice.rhythm.pattern[place], `${voice.tag} played where its pattern has a rest`);
    }
  }
});

test("a slow layer plays fewer notes than a fast one", () => {
  const rig = makePlayer({ layers: 3, restChance: 0, recurrence: 0 });
  rig.run(60);

  const count = (tag) => rig.played.filter((note) => note.tag === tag).length;
  assert.ok(count("layer0") < count("layer2"), "the bass should move more slowly than the top");
});

test("the rhythm comes from the harmony", () => {
  const rig = makePlayer({ layers: 3 });

  // Hold a plain major triad and the periods come out as 6, 5, 4 — the same
  // numbers as the chord, at a different speed.
  [[1, 1], [5, 4], [3, 2]].forEach(([n, d], i) => {
    rig.sonority.noteOn(100 + i, fromFraction(n, d), { at: 0 });
  });
  rig.player.retune();

  assert.deepEqual(rig.player.periods, [6, 5, 4]);

  // Cycles come from the chord numbers; the phrase is the longest of them.
  const cycles = rig.player.voices.map((voice) => voice.rhythm.steps);
  assert.deepEqual(cycles, [12, 10, 8]);
  assert.equal(rig.player.phrase, 12);
});

test("a different chord gives a different rhythm", () => {
  const rig = makePlayer({ layers: 2 });
  [[1, 1], [3, 2]].forEach(([n, d], i) => {
    rig.sonority.noteOn(200 + i, fromFraction(n, d), { at: 0 });
  });
  rig.player.retune();

  assert.deepEqual(rig.player.periods, [3, 2]);
  assert.ok(rig.player.phrase > 2, "the phrase should span both cycles");
});

test("layers keep to their own part of the register", () => {
  const rig = makePlayer({ layers: 3, layerSpread: 1, restChance: 0, recurrence: 0 });
  rig.run(60);

  const heights = {};
  for (const note of rig.played) {
    (heights[note.tag] ??= []).push(cents(note.ratio));
  }

  const average = (list) => list.reduce((a, b) => a + b, 0) / list.length;
  assert.ok(
    average(heights.layer0) < average(heights.layer2),
    "the bottom layer should sit below the top one",
  );
});

test("with the layers spread apart, the bands do not overlap", () => {
  const rig = makePlayer({ layers: 3, layerSpread: 1 });
  const bands = rig.player.voices.map((voice) => rig.player.bandFor(voice));
  for (let i = 1; i < bands.length; i++) {
    assert.ok(bands[i].low >= bands[i - 1].high - 1e-9, "bands should be separate");
  }
});

test("shapes are kept as phrases go by", () => {
  const rig = makePlayer({ layers: 2, restChance: 0, recurrence: 0 });
  rig.run(120);
  assert.ok(rig.player.gestures.entries.length > 0, "nothing was remembered");
});

test("a remembered shape comes back exactly, somewhere else", () => {
  const rig = makePlayer({ layers: 1, restChance: 0, recurrence: 1 });
  rig.run(200);

  const notes = rig.played.filter((note) => note.tag === "layer0");
  const moves = [];
  for (let i = 1; i < notes.length; i++) {
    moves.push(format(div(notes[i].ratio, notes[i - 1].ratio)));
  }

  // Some run of moves must occur twice, or nothing is recurring at all.
  const runs = new Map();
  for (let i = 0; i + 2 < moves.length; i++) {
    const run = moves.slice(i, i + 3).join(" ");
    runs.set(run, (runs.get(run) ?? 0) + 1);
  }
  assert.ok([...runs.values()].some((count) => count > 1), "no shape ever came back");
});

test("recurrence at zero means nothing is ever replayed", () => {
  const rig = makePlayer({ layers: 2, recurrence: 0, restChance: 0 });
  rig.run(120);
  assert.ok(rig.player.voices.every((voice) => voice.replaying === null));
});

test("a repeated shape does not carry the music away", () => {
  // Every repeat starts from a freshly chosen note, so a shape that goes
  // somewhere cannot take the music further every time it comes round.
  const rig = makePlayer({ layers: 2, recurrence: 1, restChance: 0 }, { homing: 0.3 });
  rig.run(400);

  const worst = Math.max(...rig.played.map((note) => complexity(note.ratio)));
  assert.ok(worst < 30, `wandered out to a complexity of ${worst}`);
});

test("gravity on the field keeps the music near where it started", () => {
  // With a harmonic field deciding which pitches are available, this is what
  // governs wandering — the chooser can only pick among what the field offers.
  const average = (fieldHoming) => {
    const rig = makePlayer({ layers: 2, restChance: 0, fieldHoming, harmonicRhythm: 1 });
    rig.run(600);
    const total = rig.played.reduce((sum, note) => sum + complexity(note.ratio), 0);
    return total / rig.played.length;
  };

  assert.ok(average(1.2) < average(0), "gravity should pull the harmony home");
});

test("rests leave gaps", () => {
  const busy = makePlayer({ layers: 2, restChance: 0 });
  const sparse = makePlayer({ layers: 2, restChance: 0.8 });
  busy.run(80);
  sparse.run(80);
  assert.ok(sparse.played.length < busy.played.length);
});

test("notes are let go on their own", () => {
  const rig = makePlayer({ layers: 2, hold: 0.5, restChance: 0 });
  rig.run(80);
  assert.ok(
    rig.sonority.read(rig.at()).sounding.length < 8,
    "notes should be released rather than piling up",
  );
});

test("stopping releases everything", () => {
  const rig = makePlayer({ layers: 3, hold: 20, restChance: 0 });
  rig.run(12);
  assert.ok(rig.sonority.read(rig.at()).sounding.length > 0);

  rig.player.stop();
  assert.equal(rig.sonority.read(rig.at()).sounding.length, 0);
});

test("changing the layer count rebuilds the parts", () => {
  const rig = makePlayer({ layers: 2 });
  assert.equal(rig.player.voices.length, 2);
  rig.player.setParams({ layers: 4 });
  assert.equal(rig.player.voices.length, 4);
  rig.run(20);
  assert.equal(new Set(rig.played.map((note) => note.tag)).size, 4);
});

test("it describes itself for the display", () => {
  const rig = makePlayer({ layers: 3, restChance: 0 });
  rig.run(30);

  const shape = rig.player.describe(rig.at());
  assert.equal(shape.layers.length, 3);
  assert.ok(shape.phrase >= 1);
  assert.ok(shape.inPhrase < shape.phrase);
  assert.ok(shape.layers.every((layer) => layer.period >= 2));
  assert.ok(Array.isArray(shape.gestures));
});

test("the field holds the material still for a while, then moves it", () => {
  const rig = makePlayer({ layers: 2, harmonicRhythm: 3, restChance: 0 });
  const centres = [];

  for (let i = 0; i < 400; i++) {
    centres.push(format(rig.player.field.centre));
    rig.player.advance();
  }

  const changes = centres.filter((centre, i) => i > 0 && centre !== centres[i - 1]).length;
  assert.ok(changes > 0, "the field never moved");
  assert.ok(changes < 40, `the field moved ${changes} times — that is churn, not harmony`);
});

test("freshly chosen notes come from the field", () => {
  const rig = makePlayer({ layers: 2, recurrence: 0, restChance: 0, harmonicRhythm: 1000 });
  rig.run(80);

  for (const note of rig.played) {
    assert.ok(
      rig.player.field.holds(note.ratio),
      `${format(note.ratio)} is not in the field ${rig.player.field.members.map(format).join(" ")}`,
    );
  }
});

test("a bigger field means more different pitches", () => {
  const distinct = (fieldSize) => {
    const rig = makePlayer({ layers: 2, recurrence: 0, restChance: 0, fieldSize, harmonicRhythm: 1000 });
    rig.run(120);
    const classes = new Set(rig.played.map((note) => format(pitchClass(note.ratio))));
    return classes.size;
  };

  assert.ok(distinct(3) < distinct(9));
});

test("the rhythm is uneven within a part, not just between parts", () => {
  const rig = makePlayer({ layers: 3, restChance: 0 });
  for (const voice of rig.player.voices) {
    const gaps = voice.rhythm.gaps.filter(Boolean);
    assert.ok(new Set(gaps).size > 1, `${voice.tag} plays an even pulse`);
  }
});

test("each layer gets its own pattern", () => {
  const rig = makePlayer({ layers: 3, restChance: 0 });
  const patterns = rig.player.voices.map((voice) => voice.rhythm.pattern.join(""));
  assert.equal(new Set(patterns).size, 3, "two layers came out identical");
});

test("notes last until their part's next onset, so lengths vary", () => {
  const rig = makePlayer({ layers: 1, restChance: 0, recurrence: 0, hold: 1 });
  const lengths = [];
  const release = rig.player.release;
  rig.player.release = (id) => {
    lengths.push(id);
    release(id);
  };
  rig.run(60);

  const gaps = rig.player.voices[0].rhythm.gaps.filter(Boolean);
  assert.ok(new Set(gaps).size > 1, "the part should have long and short notes");
});

test("the first beat of a cycle is played harder", () => {
  const rig = makePlayer({ layers: 1, restChance: 0, accent: 0.5, velocitySpread: 0 });
  rig.run(48);

  const cycle = rig.player.voices[0].rhythm.steps;
  const downbeats = rig.played.filter((note) => note.step % cycle === 0);
  const rest = rig.played.filter((note) => note.step % cycle !== 0);

  assert.ok(downbeats.length > 0 && rest.length > 0);
  const mean = (list) => list.reduce((sum, n) => sum + n.velocity, 0) / list.length;
  assert.ok(mean(downbeats) > mean(rest) * 1.2, "the downbeat should stand out");
});

test("a part's rhythm repeats exactly", () => {
  const rig = makePlayer({ layers: 1, restChance: 0 });
  const cycle = rig.player.voices[0].rhythm.steps;
  rig.run(cycle * 4);

  const steps = rig.played.map((note) => note.step % cycle);
  const places = new Set(steps);
  for (const step of steps) assert.ok(places.has(step));
  // Every onset in the pattern should have been used, several times over.
  assert.equal(places.size, rig.player.voices[0].rhythm.onsets);
});

test("a section swells and recedes", () => {
  const rig = makePlayer({ layers: 2, harmonicRhythm: 4, dynamics: 0.8, restChance: 0 });
  const readings = [];
  for (let i = 0; i < rig.player.phrase * 4; i++) {
    readings.push(rig.player.intensity());
    rig.player.advance();
  }

  assert.ok(Math.min(...readings) < 0.15, "it should get quiet at the edges");
  assert.ok(Math.max(...readings) > 0.85, "and full in the middle");
});

test("the swell is always between nothing and everything", () => {
  const rig = makePlayer({ layers: 3, harmonicRhythm: 3 });
  for (let i = 0; i < 300; i++) {
    const value = rig.player.intensity();
    assert.ok(value >= 0 && value <= 1, `swell went to ${value}`);
    rig.player.advance();
  }
});

test("with dynamics off, every note carries the same weight", () => {
  const spread = (dynamics) => {
    const rig = makePlayer({ layers: 2, dynamics, velocitySpread: 0, accent: 0, restChance: 0 });
    rig.run(200);
    const levels = rig.played.map((note) => note.velocity);
    return Math.max(...levels) - Math.min(...levels);
  };

  assert.ok(spread(0) < 0.2, "flat should mean flat");
  assert.ok(spread(0.8) > spread(0) * 2, "and a swell should not be");
});

test("a section is short enough to be heard as one", () => {
  const rig = makePlayer({ layers: 3, harmonicRhythm: 4 });
  rig.run(40);
  const seconds = rig.player.phrase * rig.player.params.harmonicRhythm * rig.player.params.pulse;
  assert.ok(seconds < 60, `a section lasts ${seconds.toFixed(0)}s, which is not a section`);
});
