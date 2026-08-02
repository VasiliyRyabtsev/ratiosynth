import test from "node:test";
import assert from "node:assert/strict";

import { GesturePool, applyMove } from "../src/gesture.js";
import { fromFraction, format, cents, UNISON, FIFTH, MAJOR_THIRD, mul, div } from "../src/ratio.js";

const r = (n, d = 1) => fromFraction(n, d);
const UP_FIFTH = FIFTH;
const DOWN_THIRD = div(UNISON, MAJOR_THIRD);

test("a shape is kept and can be had back", () => {
  const pool = new GesturePool();
  const kept = pool.remember([UP_FIFTH, UP_FIFTH, DOWN_THIRD], 0);
  assert.ok(kept);
  assert.equal(pool.pick(0, () => 0.5).id, kept.id);
});

test("a shape that goes nowhere is not worth keeping", () => {
  const pool = new GesturePool();
  assert.equal(pool.remember([], 0), null);
  assert.equal(pool.remember([UP_FIFTH], 0), null, "one move is not a shape");
  assert.equal(pool.remember([UNISON, UNISON], 0), null, "standing still is not a shape");
});

test("shapes fade, so the pool stays current on its own", () => {
  const pool = new GesturePool({ memory: 10 });
  const old = pool.remember([UP_FIFTH, UP_FIFTH], 0);
  assert.equal(pool.weightOf(old, 0), 1);
  assert.ok(Math.abs(pool.weightOf(old, 10) - Math.exp(-1)) < 1e-9);
  assert.ok(pool.weightOf(old, 100) < 0.01);
});

test("a recent shape is picked far more often than a faded one", () => {
  const pool = new GesturePool({ memory: 5 });
  const old = pool.remember([UP_FIFTH, UP_FIFTH], 0);
  const fresh = pool.remember([DOWN_THIRD, DOWN_THIRD], 40);

  let recent = 0;
  for (let i = 0; i < 400; i++) {
    if (pool.pick(40, Math.random).id === fresh.id) recent++;
  }
  assert.ok(recent > 380, `expected the fresh shape nearly always, got ${recent}/400`);
  assert.ok(pool.weightOf(old, 40) < pool.weightOf(fresh, 40));
});

test("pinning stops a shape fading", () => {
  const pool = new GesturePool({ memory: 5 });
  const kept = pool.remember([UP_FIFTH, DOWN_THIRD], 0);
  assert.ok(pool.weightOf(kept, 60) < 0.01);

  pool.pin(kept.id);
  assert.equal(pool.weightOf(kept, 60), 1);
  assert.equal(pool.weightOf(kept, 100000), 1);
});

test("the pool forgets the oldest, but never a pinned shape", () => {
  const pool = new GesturePool({ capacity: 3 });
  const first = pool.remember([UP_FIFTH, UP_FIFTH], 0);
  pool.pin(first.id);

  for (let i = 1; i < 10; i++) pool.remember([UP_FIFTH, DOWN_THIRD], i);

  assert.ok(pool.entries.length <= 3);
  assert.ok(pool.entries.some((entry) => entry.id === first.id), "the pinned one survived");
});

test("shapes can be kept per layer", () => {
  const pool = new GesturePool();
  pool.remember([UP_FIFTH, UP_FIFTH], 0, { tag: "bass" });
  pool.remember([DOWN_THIRD, DOWN_THIRD], 0, { tag: "lead" });

  assert.equal(pool.pick(0, () => 0.5, { tag: "bass" }).tag, "bass");
  assert.equal(pool.pick(0, () => 0.5, { tag: "lead" }).tag, "lead");
  assert.equal(pool.pick(0, () => 0.5, { tag: "nobody" }), null);
});

test("an empty pool has nothing to offer", () => {
  assert.equal(new GesturePool().pick(0, () => 0.5), null);
});

test("a shape moved somewhere else is exactly the same shape", () => {
  // The thing this system is unusually good at. In twelve-tone equal
  // temperament transposition distorts slightly; here it does not at all.
  const wide = -1200;
  const high = 2400;

  const fromHome = [UNISON];
  const fromElsewhere = [r(7, 4)];

  for (const move of [UP_FIFTH, MAJOR_THIRD, DOWN_THIRD]) {
    fromHome.push(applyMove(fromHome.at(-1), move, wide, high));
    fromElsewhere.push(applyMove(fromElsewhere.at(-1), move, wide, high));
  }

  for (let i = 1; i < fromHome.length; i++) {
    const here = div(fromHome[i], fromHome[i - 1]);
    const there = div(fromElsewhere[i], fromElsewhere[i - 1]);
    assert.equal(format(here), format(there), "the same step, wherever it starts");
  }
});

test("a replayed shape is pulled back into the layer's register", () => {
  let at = UNISON;
  for (let i = 0; i < 12; i++) {
    at = applyMove(at, UP_FIFTH, 0, 1200);
    const height = cents(at);
    assert.ok(height >= -1200 && height <= 2400, `ran away to ${height} cents`);
  }
});

test("a move inside the register is left exactly alone", () => {
  const landed = applyMove(UNISON, FIFTH, -1200, 1200);
  assert.equal(format(landed), "3/2");
  assert.equal(format(applyMove(UNISON, MAJOR_THIRD, 0, 1200)), "5/4");
});

test("listing shows the strongest shapes first", () => {
  const pool = new GesturePool({ memory: 10 });
  pool.remember([UP_FIFTH, UP_FIFTH], 0);
  pool.remember([DOWN_THIRD, DOWN_THIRD], 20);

  const list = pool.list(20);
  assert.equal(list.length, 2);
  assert.ok(list[0].weight >= list[1].weight);
});
