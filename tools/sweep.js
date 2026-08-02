// Try settings and score them against the corpus.
//
//   node tools/sweep.js
//
// This is the loop the whole exercise was for. Rather than picking a number and
// arguing about how it sounds, try thirty of them and keep the one whose output
// sits inside the range real music occupies. Two minutes of measured music per
// setting, a few seconds each.
//
// The score is how far outside the corpus band we are, added up. Zero means
// nothing is out of range. It is a floor, not a goal — see corpus-calibration.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { measure } from "./profile.js";

const CHECKS = [
  { name: "repeat", of: (s) => s.sizes[0], scale: 100 },
  { name: "step", of: (s) => s.sizes[1] + s.sizes[2], scale: 100 },
  { name: "third", of: (s) => s.sizes[3], scale: 100 },
  { name: "leap", of: (s) => s.sizes[4] + s.sizes[5] + s.sizes[6], scale: 100 },
  { name: "wide", of: (s) => s.sizes[7] + s.sizes[8], scale: 100 },
  { name: "turns", of: (s) => s.turnRate, scale: 100 },
  { name: "answer", of: (s) => s.leapReversal, scale: 100 },
];

function bands(references) {
  return CHECKS.map((check) => {
    const values = references.map((ref) => check.of(ref.summary));
    return { name: check.name, of: check.of, scale: check.scale, low: Math.min(...values), high: Math.max(...values) };
  });
}

function score(summary, band) {
  let total = 0;
  const parts = [];
  for (const check of band) {
    const mine = check.of(summary);
    const off = mine < check.low ? check.low - mine : mine > check.high ? mine - check.high : 0;
    total += off * check.scale;
    parts.push({ name: check.name, mine: mine * check.scale, off: off * check.scale });
  }
  return { total, parts };
}

function main() {
  const references = [];
  for (const name of ["essen", "chorales"]) {
    const path = join(import.meta.dirname, "out", `${name}.json`);
    if (existsSync(path)) references.push(JSON.parse(readFileSync(path, "utf8")));
  }
  if (references.length === 0) {
    console.error("run tools/corpus.js first");
    process.exit(1);
  }
  const band = bands(references);

  console.log("\ncorpus bands (percentage points)");
  for (const check of band) {
    console.log(`  ${check.name.padEnd(8)} ${(check.low * 100).toFixed(1).padStart(6)} – ${(check.high * 100).toFixed(1)}`);
  }

  const spreads = [0.45, 0.65, 0.9, 1.3];
  const stepwises = [0.7, 1.0];
  const homings = [0, 0.1, 0.2, 0.35];

  console.log("\n  spread  step  home    repeat   step  third   leap   wide  turns  answer     score");
  console.log("  " + "-".repeat(84));

  const results = [];
  for (const spread of spreads) {
    for (const stepwise of stepwises) {
     for (const homing of homings) {
      // Three seeds, so we are not tuning to one lucky performance.
      const runs = [1, 2, 3].map((seed) =>
        measure({ minutes: 2, seed, choose: { spread, stepwise, homing } }),
      );
      const scores = runs.map((run) => score(run.summary, band));
      const total = scores.reduce((sum, s) => sum + s.total, 0) / scores.length;
      const shown = scores[0].parts.map((part, i) => {
        const average = scores.reduce((sum, s) => sum + s.parts[i].mine, 0) / scores.length;
        const off = scores.reduce((sum, s) => sum + s.parts[i].off, 0) / scores.length;
        return { name: part.name, average, off };
      });

      results.push({ spread, stepwise, homing, total, shown });
      console.log(
        `  ${spread.toFixed(2).padStart(6)}  ${stepwise.toFixed(1).padStart(4)}  ${homing.toFixed(2).padStart(4)}   ` +
          shown.map((s) => `${s.average.toFixed(1).padStart(6)}${s.off > 0.5 ? "*" : " "}`).join("") +
          `  ${total.toFixed(1).padStart(8)}`,
      );
     }
    }
  }

  results.sort((a, b) => a.total - b.total);
  const best = results[0];
  console.log(`\n  best: spread ${best.spread}, stepwise ${best.stepwise}, homing ${best.homing} — score ${best.total.toFixed(1)}`);
  console.log("  still out of range:");
  for (const part of best.shown) {
    if (part.off > 0.5) console.log(`    ${part.name.padEnd(8)} ${part.average.toFixed(1)}  (${part.off.toFixed(1)} points outside)`);
  }
  console.log("\n  * marks a figure outside the corpus band.");
}

main();
