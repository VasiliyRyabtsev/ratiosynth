// Measure a performance with the same ruler as everything else.
import { readFileSync } from "node:fs";
import { cents } from "../../src/ratio.js";
import { lineStats, pool, summarise } from "../../tools/lines.js";
import { Composer } from "./compose.js";

export function profile({ minutes = 8, seed = 1, params = {} } = {}) {
  const composer = new Composer(params);
  composer.random = mulberry(seed);
  const { events, moves } = composer.perform(minutes * 60);

  const pulse = composer.params.pulse;
  const byTag = new Map();
  for (const e of events) {
    if (!byTag.has(e.tag)) byTag.set(e.tag, []);
    byTag.get(e.tag).push({ cents: cents(e.ratio), start: e.start / pulse, duration: Math.max(0.01, e.duration / pulse) });
  }
  let total = null;
  for (const line of byTag.values()) total = pool(total, lineStats(line.sort((a, b) => a.start - b.start)));
  return { summary: summarise(total), events, moves, composer };
}

export function mulberry(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function compare(summaries) {
  const refs = ["essen", "chorales"].map((n) => JSON.parse(readFileSync(`tools/out/${n}.json`, "utf8")).summary);
  const rows = [
    ["repeated notes", (s) => s.sizes[0], 100, 1],
    ["steps", (s) => s.sizes[1] + s.sizes[2], 100, 1],
    ["thirds", (s) => s.sizes[3], 100, 1],
    ["leaps", (s) => s.sizes[4] + s.sizes[5] + s.sizes[6], 100, 1],
    ["octave or more", (s) => s.sizes[8], 100, 1],
    ["direction changes", (s) => s.turnRate, 100, 1],
    ["leap answered by a turn", (s) => s.leapReversal, 100, 1],
  ];
  const bands = [
    ["range, cents", (s) => s.range, 0],
    ["distinct note lengths", (s) => s.distinctDurations, 1],
    ["rhythm variety, bits", (s) => s.durationEntropy, 2],
    ["interval variety, bits", (s) => s.intervalEntropy, 2],
    ["material that recurs", (s) => s.recurrence, 2],
    ["lands on a pitch already used", (s) => s.contourReturns, 2],
  ];
  const mean = (f) => summaries.reduce((sum, s) => sum + f(s), 0) / summaries.length;
  let out = 0;
  console.log("\n  ours      corpus band       what");
  console.log("  " + "-".repeat(62));
  for (const [name, of, scale, places] of rows) {
    const mine = mean(of) * scale;
    const lo = Math.min(...refs.map((r) => of(r) * scale));
    const hi = Math.max(...refs.map((r) => of(r) * scale));
    const ok = mine >= lo && mine <= hi;
    if (!ok) out += Math.min(Math.abs(mine - lo), Math.abs(mine - hi));
    console.log(`${ok ? "  ok " : "  !  "}${mine.toFixed(places).padStart(6)}   ${lo.toFixed(places).padStart(6)} - ${hi.toFixed(places).padEnd(7)}  ${name}`);
  }
  for (const [name, of, places] of bands) {
    const mine = mean((s) => of(s).median);
    const lo = Math.min(...refs.map((r) => of(r).low));
    const hi = Math.max(...refs.map((r) => of(r).high));
    const ok = mine >= lo && mine <= hi;
    console.log(`${ok ? "  ok " : "  !  "}${mine.toFixed(places).padStart(6)}   ${lo.toFixed(places).padStart(6)} - ${hi.toFixed(places).padEnd(7)}  ${name}`);
  }
  return out;
}
