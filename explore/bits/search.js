// Search the parameter space instead of changing the model.
//
//   node explore/bits/search.js
//
// Every parameter here is meant to be a musical intention the player sets, so
// finding where they land is not fitting the model — it is finding out what the
// dials do. The model itself is untouched by anything in this file.
//
// Score is how far outside the corpus band each measure sits, in units of the
// band's own width, added up. Zero means nothing is out of range.

import { readFileSync } from "node:fs";
import { fromFraction, format } from "../../src/ratio.js";
import { profile } from "./measure.js";

const SHARES = [
  ["repeat", (s) => s.sizes[0]],
  ["step", (s) => s.sizes[1] + s.sizes[2]],
  ["third", (s) => s.sizes[3]],
  ["leap", (s) => s.sizes[4] + s.sizes[5] + s.sizes[6]],
  ["turns", (s) => s.turnRate],
  ["answer", (s) => s.leapReversal],
];

const BANDS = [
  ["tonal", (s) => s.tonalFocus],
  ["home", (s) => s.topPitchShare],
  ["repeats-later", (s) => s.longRange],
  ["recurs", (s) => s.recurrence],
  ["pitch-bits", (s) => s.pitchEntropy],
  ["range", (s) => s.range],
];

function bands() {
  const refs = ["essen", "chorales"].map((n) => JSON.parse(readFileSync(`tools/out/${n}.json`, "utf8")).summary);
  const out = [];
  for (const [name, of] of SHARES) {
    out.push({ name, of, low: Math.min(...refs.map(of)), high: Math.max(...refs.map(of)), median: false });
  }
  for (const [name, of] of BANDS) {
    out.push({
      name,
      of: (s) => of(s).median,
      low: Math.min(...refs.map((r) => of(r).low)),
      high: Math.max(...refs.map((r) => of(r).high)),
      median: true,
    });
  }
  return out;
}

function score(summary, band) {
  let total = 0;
  const parts = [];
  for (const check of band) {
    const mine = check.of(summary);
    const width = Math.max(1e-9, check.high - check.low);
    const off = mine < check.low ? (check.low - mine) / width : mine > check.high ? (mine - check.high) / width : 0;
    total += off;
    parts.push({ name: check.name, mine, off });
  }
  return { total, parts };
}

const GENERATORS = [
  [3, 2],
  [5, 4],
  [7, 4],
  [7, 6],
  [8, 5],
];

function main() {
  const band = bands();
  const results = [];

  console.log("\n  gen   surprise memory   home  tonal  later  step  turns    score");
  console.log("  " + "-".repeat(66));

  for (const [n, d] of GENERATORS) {
    const generator = fromFraction(n, d);
    for (const surprise of [2.2, 2.6, 3.0, 3.4]) {
      for (const memory of [16, 48, 120]) {
        const runs = [1, 2, 3].map((seed) =>
          profile({ minutes: 4, seed, params: { generator, surprise, memory } }),
        );
        const scores = runs.map((r) => score(r.summary, band));
        const total = scores.reduce((sum, s) => sum + s.total, 0) / scores.length;
        const show = (name) => {
          const i = band.findIndex((b) => b.name === name);
          return scores.reduce((sum, s) => sum + s.parts[i].mine, 0) / scores.length;
        };
        results.push({ n, d, surprise, memory, total, notes: runs[0].composer.field.length });
        console.log(
          `  ${(n + "/" + d).padEnd(5)} ${String(surprise).padStart(6)} ${String(memory).padStart(6)}   ` +
            `${show("home").toFixed(2)}   ${show("tonal").toFixed(2)}   ${show("repeats-later").toFixed(2)}  ` +
            `${(show("step") * 100).toFixed(0).padStart(4)}  ${(show("turns") * 100).toFixed(0).padStart(4)}  ${total.toFixed(2).padStart(7)}`,
        );
      }
    }
  }

  results.sort((a, b) => a.total - b.total);
  console.log("\n  best five:");
  for (const r of results.slice(0, 5)) {
    console.log(`    ${r.n}/${r.d}  surprise ${r.surprise}  memory ${r.memory}  (${r.notes} notes)  score ${r.total.toFixed(2)}`);
  }

  const worst = results[results.length - 1];
  console.log(`    worst was ${worst.n}/${worst.d} surprise ${worst.surprise} memory ${worst.memory}, score ${worst.total.toFixed(2)}`);
}

main();
