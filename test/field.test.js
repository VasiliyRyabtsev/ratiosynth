import test from "node:test";
import assert from "node:assert/strict";

import { fieldAround, HarmonicField } from "../src/field.js";
import { fromFraction, format, complexity, div, octaveReduce, UNISON, FIFTH } from "../src/ratio.js";
import { key } from "../src/lattice.js";

const r = (n, d = 1) => fromFraction(n, d);
const names = (points) => points.map(format);

test("the field around home is a plain just set", () => {
  // Nothing here is written down. It is simply what "nearest on the lattice"
  // means, and it comes out as both thirds and both sixths.
  assert.deepEqual(names(fieldAround(UNISON, { size: 7 })), [
    "1/1",
    "3/2",
    "4/3",
    "5/3",
    "5/4",
    "6/5",
    "8/5",
  ]);
});

test("it is ordered simplest first", () => {
  const field = fieldAround(UNISON, { size: 9 });
  const distances = field.map((point) => complexity(octaveReduce(div(point, UNISON))));
  for (let i = 1; i < distances.length; i++) {
    assert.ok(distances[i] >= distances[i - 1], "should get further out, not nearer");
  }
  assert.equal(format(field[0]), "1/1", "the centre is always in its own field");
});

test("size decides how many pitches are in play", () => {
  for (const size of [3, 5, 7, 12]) {
    assert.equal(fieldAround(UNISON, { size }).length, size);
  }
});

test("the same field somewhere else is the same relationships", () => {
  // Transposition is exact here, so the field on 3/2 must have identical
  // internal distances to the field on 1/1.
  const home = fieldAround(UNISON, { size: 7 });
  const moved = fieldAround(FIFTH, { size: 7 });

  const shape = (field) =>
    field.map((point) => complexity(octaveReduce(div(point, field[0]))).toFixed(6));

  assert.deepEqual(shape(home), shape(moved));
});

test("a field knows what is in it", () => {
  const field = new HarmonicField({ size: 7 });
  assert.ok(field.holds(r(3, 2)));
  assert.ok(field.holds(r(3, 4)), "octave does not matter");
  assert.ok(field.holds(r(6, 1)));
  assert.ok(!field.holds(r(45, 32)));
  assert.ok(!field.holds(r(7, 4)));
});

test("moving keeps most of the field, so it is heard as a modulation", () => {
  const field = new HarmonicField({ size: 7 });

  for (let i = 0; i < 20; i++) {
    const before = field.members;
    field.move(Math.random);
    const kept = field.overlapWith(before);
    assert.ok(kept >= 2, `only ${kept} of 7 pitches survived the move`);
    assert.ok(kept < 7, "a move should actually change something");
  }
});

test("moving lands somewhere new every time", () => {
  const field = new HarmonicField({ size: 7 });
  for (let i = 0; i < 20; i++) {
    const before = field.centre;
    field.move(Math.random);
    assert.notEqual(key(field.centre), key(before));
  }
});

test("gravity keeps the field from wandering off", () => {
  const distance = (homing) => {
    const field = new HarmonicField({ size: 7, homing });
    let total = 0;
    for (let i = 0; i < 200; i++) {
      field.move(Math.random);
      total += complexity(octaveReduce(div(field.centre, UNISON)));
    }
    return total / 200;
  };

  assert.ok(distance(0.8) < distance(0), "gravity should hold it near home");
});

test("with gravity on it keeps coming back home", () => {
  const field = new HarmonicField({ size: 7, homing: 0.6 });
  let visits = 0;
  for (let i = 0; i < 120; i++) {
    field.move(Math.random);
    if (key(field.centre) === key(UNISON)) visits++;
  }
  assert.ok(visits > 5, `only came home ${visits} times in 120 moves`);
});

test("preferring simple steps means it modulates by fifths and thirds", () => {
  const field = new HarmonicField({ size: 7, homing: 0 });
  const steps = new Set();
  for (let i = 0; i < 60; i++) {
    const from = field.centre;
    field.move(Math.random);
    steps.add(format(octaveReduce(div(field.centre, from))));
  }
  // Every move is one step on the lattice, so these are the only options.
  for (const step of steps) {
    assert.ok(
      ["3/2", "4/3", "5/4", "8/5", "5/3", "6/5", "15/8", "16/15"].includes(step),
      `unexpected modulation by ${step}`,
    );
  }
});

test("changing the size rebuilds the field in place", () => {
  const field = new HarmonicField({ size: 5 });
  const centre = field.centre;
  field.setParams({ size: 9 });
  assert.equal(field.members.length, 9);
  assert.equal(key(field.centre), key(centre), "the centre should not move");
});
