// Measure our own output with exactly the same ruler as the corpus.
//
//   node tools/profile.js                  — the default settings
//   node tools/profile.js --preset flowing --minutes 6
//   node tools/profile.js --against essen  — print the differences that matter
//
// Runs the player headlessly on a fake clock. No audio, no browser, no waiting:
// ten minutes of music takes about a second to measure.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { Player } from "../src/player.js";
import { Sonority } from "../src/sonority.js";
import { harmonicSeries, makeVoiceModes } from "../src/instrument.js";
import { cents } from "../src/ratio.js";
import { lineStats, pool, summarise, spread } from "./lines.js";
import { report } from "./corpus.js";

const modes = makeVoiceModes(harmonicSeries(12), { detune: 0 });

/**
 * Play for a while and collect what each layer did, as lines the stats can read.
 *
 * Deterministic when given a seed, so a change can be compared against the run
 * before it rather than against noise.
 */
export function performance({ minutes = 8, params = {}, choose = {}, seed = 1 } = {}) {
  const sonority = new Sonority({ memory: 4 });
  let clock = 0;
  let nextId = 1;
  const events = new Map(); // id -> event
  const played = [];

  const player = new Player({
    sonority,
    now: () => clock,
    play: (ratio, velocity, tag) => {
      const id = nextId++;
      const event = { id, ratio, velocity, tag, start: clock, end: null };
      events.set(id, event);
      played.push(event);
      sonority.noteOn(id, ratio, { velocity, at: clock, tag });
      return id;
    },
    release: (id) => {
      const event = events.get(id);
      if (event) event.end = clock;
      sonority.noteOff(id, { at: clock });
    },
    instrument: () => ({
      modes,
      referenceHz: 264,
      params: { registerLow: -1200, registerHigh: 1600, ...choose },
    }),
    params,
  });

  player.random = mulberry(seed);

  const pulse = player.params.pulse;
  const steps = Math.round((minutes * 60) / pulse);
  for (let i = 0; i < steps; i++) {
    player.advance();
    clock += pulse;
  }

  // A note still held at the end stops at the end.
  for (const event of played) if (event.end === null) event.end = clock;

  return { played, seconds: clock, pulse, player };
}

/** Group by layer, and put it in the units the corpus is in: cents and beats. */
export function linesOf({ played, pulse }) {
  const byTag = new Map();
  for (const event of played) {
    if (!byTag.has(event.tag)) byTag.set(event.tag, []);
    byTag.get(event.tag).push({
      cents: cents(event.ratio),
      start: event.start / pulse,
      duration: Math.max(0.01, (event.end - event.start) / pulse),
      velocity: event.velocity,
    });
  }
  return [...byTag.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([tag, line]) => ({ tag, line: line.sort((a, b) => a.start - b.start) }));
}

/**
 * Loudness variation, which the corpus cannot tell us about — MIDI velocity in
 * these files is mostly typed in rather than played — but which we can at least
 * check is not zero.
 */
function dynamics(played) {
  const velocities = played.map((event) => event.velocity);
  if (velocities.length === 0) return { spread: 0, range: 0 };
  const average = velocities.reduce((sum, v) => sum + v, 0) / velocities.length;
  const variance = velocities.reduce((sum, v) => sum + (v - average) ** 2, 0) / velocities.length;
  return {
    spread: Math.sqrt(variance),
    range: Math.max(...velocities) - Math.min(...velocities),
    average,
  };
}

export function measure(options = {}) {
  const run = performance(options);
  const lines = linesOf(run);

  // Each layer is measured as its own line, the way a chorale's four parts are.
  let total = null;
  const perLayer = [];
  for (const { tag, line } of lines) {
    const stats = lineStats(line);
    if (!stats) continue;
    total = pool(total, stats);
    perLayer.push({ tag, notes: line.length, stats });
  }

  return {
    summary: summarise(total),
    perLayer,
    seconds: run.seconds,
    notes: run.played.length,
    dynamics: dynamics(run.played),
    run,
  };
}

/** The numbers where the corpora agree with each other, so a gap is meaningful. */
const CHECKS = [
  { name: "repeated notes", of: (s) => s.sizes[0], kind: "share" },
  { name: "steps (tone or less)", of: (s) => s.sizes[1] + s.sizes[2], kind: "share" },
  { name: "thirds", of: (s) => s.sizes[3], kind: "share" },
  { name: "leaps (fourth or more)", of: (s) => s.sizes[4] + s.sizes[5] + s.sizes[6] + s.sizes[7], kind: "share" },
  { name: "octave or more", of: (s) => s.sizes[8], kind: "share" },
  { name: "direction changes", of: (s) => s.turnRate, kind: "share" },
  { name: "leap answered by a turn", of: (s) => s.leapReversal, kind: "share" },
  { name: "range of a line, cents", of: (s) => s.range, kind: "band", places: 0 },
  { name: "distinct note lengths", of: (s) => s.distinctDurations, kind: "band", places: 1 },
  { name: "rhythm variety, bits", of: (s) => s.durationEntropy, kind: "band" },
  { name: "interval variety, bits", of: (s) => s.intervalEntropy, kind: "band" },
  { name: "material that recurs", of: (s) => s.recurrence, kind: "band" },
  { name: "notes landing on a pitch already used", of: (s) => s.contourReturns, kind: "band" },
  { name: "silence", of: (s) => s.restFraction, kind: "band" },
];

function compare(ours, references) {
  console.log("\n  ours      corpus band        what");
  console.log("  " + "-".repeat(70));
  for (const check of CHECKS) {
    const mine = check.of(ours);
    const theirs = references.map((ref) => check.of(ref.summary));

    let mineValue;
    let low;
    let high;
    if (check.kind === "share") {
      mineValue = mine * 100;
      low = Math.min(...theirs) * 100;
      high = Math.max(...theirs) * 100;
    } else {
      mineValue = mine.median;
      low = Math.min(...theirs.map((t) => t.low));
      high = Math.max(...theirs.map((t) => t.high));
    }

    const places = check.places ?? (check.kind === "share" ? 1 : 2);
    const inside = mineValue >= low && mineValue <= high;
    // How far outside, measured in widths of the corpus band, so "a bit out"
    // and "on another planet" do not look the same.
    const width = Math.max(1e-6, high - low);
    const off = inside ? 0 : (mineValue < low ? low - mineValue : mineValue - high) / width;
    const mark = inside ? "  ok " : off > 2 ? " !!! " : off > 0.5 ? "  !! " : "  !  ";

    console.log(
      `${mark}${mineValue.toFixed(places).padStart(7)}   ${low.toFixed(places).padStart(7)} – ${high.toFixed(places).padEnd(8)}  ${check.name}` +
        (inside ? "" : `   — ${off.toFixed(1)}× the band outside`),
    );
  }
  console.log("\n  ok = inside the range real music occupies. ! = outside it.");
  console.log("  Being inside is not a goal, it is the absence of a bug. Being");
  console.log("  outside by a lot is worth explaining.");
}

const PRESETS = {
  settled: { pulse: 0.34, layers: 3, density: 0.3, recurrence: 0.7, harmonicRhythm: 6 },
  flowing: { pulse: 0.26, layers: 3, density: 0.45, recurrence: 0.55, harmonicRhythm: 4 },
  restless: { pulse: 0.18, layers: 4, density: 0.6, recurrence: 0.35, harmonicRhythm: 3 },
};

function main() {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => {
    const at = args.indexOf(`--${name}`);
    return at >= 0 ? args[at + 1] : fallback;
  };

  const presetName = flag("preset", null);
  const params = presetName ? PRESETS[presetName] ?? {} : {};
  const minutes = Number(flag("minutes", 8));
  const seed = Number(flag("seed", 1));

  const result = measure({ minutes, params, seed });
  console.log(
    `\nours — ${presetName ?? "defaults"}, ${minutes} minutes, ${result.notes} notes across ${result.perLayer.length} layers\n`,
  );
  report(result.summary);
  console.log(
    `\n  loudness: average ${result.dynamics.average.toFixed(2)}, spread ${result.dynamics.spread.toFixed(3)}, range ${result.dynamics.range.toFixed(2)}`,
  );

  console.log("\n  per layer");
  for (const layer of result.perLayer) {
    const s = layer.stats;
    const share = (n) => `${((n / s.intervals) * 100).toFixed(0)}%`;
    console.log(
      `    ${layer.tag}  ${String(layer.notes).padStart(4)} notes   repeat ${share(s.sizes[0]).padStart(4)}   step ${share(s.sizes[1] + s.sizes[2]).padStart(4)}   leap ${share(s.sizes[4] + s.sizes[5] + s.sizes[6] + s.sizes[7] + s.sizes[8]).padStart(4)}   range ${s.range.toFixed(0).padStart(5)}c   lengths ${s.distinctDurations}`,
    );
  }

  const references = [];
  for (const name of ["essen", "chorales"]) {
    const path = join(import.meta.dirname, "out", `${name}.json`);
    if (existsSync(path)) references.push(JSON.parse(readFileSync(path, "utf8")));
  }
  if (references.length > 0) {
    console.log(`\nagainst ${references.map((r) => r.name).join(" and ")}`);
    compare(result.summary, references);
  } else {
    console.log("\nno corpus measured yet — run tools/corpus.js first");
  }
}

/** A small deterministic generator, so two runs can actually be compared. */
function mulberry(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

if (process.argv[1] && process.argv[1].endsWith("profile.js")) main();
