// Measure a folder of MIDI files.
//
//   node tools/corpus.js _dev_data/essen
//   node tools/corpus.js _dev_data/bach/chorales
//   node tools/corpus.js _dev_data/essen --by-origin
//
// Writes the pooled numbers to tools/out/<name>.json so the comparison does not
// have to re-read eight thousand files every time.

import { readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";

import { readMidi, voices, monophonic } from "./midi.js";
import { lineStats, pool, summarise } from "./lines.js";

const SEMITONE = 100;

/** A MIDI voice as a line the stats can read: pitch in cents, time in beats. */
export function asLine(voice, division) {
  return voice.map((note) => ({
    cents: note.pitch * SEMITONE,
    start: note.start / division,
    duration: note.duration / division,
    velocity: note.velocity,
  }));
}

export function measureFile(path) {
  const { division, notes } = readMidi(path);
  const parts = voices(notes);
  const results = [];
  for (const part of parts) {
    const line = monophonic(part);
    if (!line) continue;
    const stats = lineStats(asLine(line, division));
    if (stats) results.push(stats);
  }
  return results;
}

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else if (entry.toLowerCase().endsWith(".mid")) found.push(path);
  }
  return found;
}

/** Files named brasil01.mid, brasil02.mid ... all belong to "brasil". */
function originOf(path) {
  return basename(path, ".mid").replace(/[0-9]+[a-z]?$/, "") || "other";
}

function main() {
  const [dir, ...flags] = process.argv.slice(2);
  if (!dir) {
    console.error("usage: node tools/corpus.js <directory> [--by-origin] [--limit N]");
    process.exit(1);
  }

  const limitFlag = flags.indexOf("--limit");
  const limit = limitFlag >= 0 ? Number(flags[limitFlag + 1]) : Infinity;
  const files = walk(dir).slice(0, limit);

  let total = null;
  const byOrigin = new Map();
  let failed = 0;

  for (const path of files) {
    let results;
    try {
      results = measureFile(path);
    } catch {
      failed++;
      continue;
    }
    for (const stats of results) {
      total = pool(total, stats);
      const origin = originOf(path);
      byOrigin.set(origin, pool(byOrigin.get(origin) ?? null, stats));
    }
  }

  const name = basename(dir);
  const summary = summarise(total);
  console.log(`\n${dir} — ${files.length} files, ${failed} unreadable, ${total?.lines ?? 0} lines, ${total?.notes ?? 0} notes\n`);
  report(summary);

  const out = { name, files: files.length, summary };

  if (flags.includes("--by-origin")) {
    out.origins = {};
    const rows = [...byOrigin.entries()]
      .filter(([, value]) => value.notes >= 400)
      .sort((a, b) => b[1].notes - a[1].notes);
    console.log("\nby origin — stepwise means a tone or less, leap means a fourth or more\n");
    console.log("  origin        lines   step%   leap%   turn%   recur%  durations");
    for (const [origin, value] of rows) {
      const s = summarise(value);
      out.origins[origin] = s;
      const step = (s.sizes[1] + s.sizes[2]) * 100;
      const leap = (s.sizes[4] + s.sizes[5] + s.sizes[6] + s.sizes[7] + s.sizes[8]) * 100;
      console.log(
        `  ${origin.padEnd(12)} ${String(value.lines).padStart(6)}  ${step.toFixed(1).padStart(5)}   ${leap.toFixed(1).padStart(5)}   ${(s.turnRate * 100).toFixed(1).padStart(5)}   ${(s.recurrence.median * 100).toFixed(1).padStart(5)}   ${s.distinctDurations.median.toFixed(1).padStart(5)}`,
      );
    }
  }

  mkdirSync(join(import.meta.dirname, "out"), { recursive: true });
  const target = join(import.meta.dirname, "out", `${name}.json`);
  writeFileSync(target, JSON.stringify(out, null, 2));
  console.log(`\nwritten to ${target}`);
}

export function report(summary) {
  if (!summary) return console.log("  nothing to report");
  const pct = (value) => `${(value * 100).toFixed(1)}%`;
  const band = (s, places = 2) =>
    `${s.median.toFixed(places)}  (${s.low.toFixed(places)} – ${s.high.toFixed(places)})`;

  console.log("  interval sizes");
  const names = ["same", "semitone", "tone", "third", "fourth", "tritone", "fifth", "6th–7th", "octave+"];
  for (let i = 0; i < names.length; i++) {
    const share = summary.sizes[i];
    console.log(`    ${names[i].padEnd(10)} ${pct(share).padStart(7)}  ${bar(share)}`);
  }
  console.log(`\n  up ${pct(summary.up)}   down ${pct(summary.down)}   repeated ${pct(summary.level)}`);
  console.log(`  a leap is answered by turning round: ${pct(summary.leapReversal)}`);
  console.log(`  direction changes: ${pct(summary.turnRate)} of the time`);
  console.log("\n  per line — median (10th – 90th percentile)");
  console.log(`    range, cents         ${band(summary.range, 0)}`);
  console.log(`    interval variety     ${band(summary.intervalEntropy)} bits`);
  console.log(`    rhythm variety       ${band(summary.durationEntropy)} bits`);
  console.log(`    distinct note lengths${band(summary.distinctDurations, 1).padStart(8)}`);
  console.log(`    silence              ${band(summary.restFraction)}`);
  console.log(`    notes per phrase     ${band(summary.phraseLength, 1)}`);
  console.log(`    material that recurs ${band(summary.recurrence)}`);
  console.log(`    returns to a pitch   ${band(summary.contourReturns)}`);
}

function bar(share) {
  return "#".repeat(Math.round(share * 60));
}

if (process.argv[1] && process.argv[1].endsWith("corpus.js")) main();
