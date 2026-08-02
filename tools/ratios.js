// Measuring the fixed-root engine.
//
//   node tools/ratios.js
//
// Three questions, none of which can be answered by listening for long enough:
//
//   1. Where does it sit against the corpus, measured with the same ruler that
//      measures the corpus (tools/lines.js)?
//   2. When a phrase comes back, does it come back *the same*? This is the one
//      that mattered most. The engine was reusing nine phrases across two
//      thousand statements and almost none of them survived to the ear, because
//      the rhythm and the octaves were redrawn every time. Nothing in the corpus
//      numbers showed it.
//   3. How busy is it, and how long is the longest gap?
//
// The corpus bands come from tools/out/*.json, which tools/corpus.js writes.

import { readFileSync } from "node:fs";
import { cents } from "../src/ratio.js";
import { lineStats, pool, summarise } from "./lines.js";
import { Composer } from "../explore/ratios/compose.js";

const MINUTES = 8;
const SEEDS = [1, 2, 3];

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

/** Run the engine, and watch it while it runs. */
function run(seed, params = {}) {
  const composer = new Composer(params);
  composer.random = mulberry(seed);

  // Every statement of a phrase, so we can ask whether two statements of the
  // same phrase actually sound alike. Voices interleave, so each one's run of
  // notes has to be tracked separately — grouping the merged stream was what
  // made an earlier version of this report wrong.
  const runs = [];
  const open = new Map();
  const step = composer.step.bind(composer);
  composer.step = (part) => {
    const event = step(part);
    if (!event) return event;
    const note = { cents: Math.round(cents(event.ratio)), duration: +event.duration.toFixed(4) };
    const current = open.get(part.index);
    if (current && current.phrase === part.phrase && part.step - 1 === current.notes.length) {
      current.notes.push(note);
    } else {
      const started = { voice: part.index, phrase: part.phrase, notes: [note] };
      runs.push(started);
      open.set(part.index, started);
    }
    return event;
  };

  const seconds = MINUTES * 60;
  const { events } = composer.perform(seconds);
  return { composer, events, runs, seconds };
}

function summary({ composer, events }) {
  const pulse = composer.params.pulse;
  const byTag = new Map();
  for (const event of events) {
    if (!byTag.has(event.tag)) byTag.set(event.tag, []);
    byTag.get(event.tag).push({
      cents: cents(event.ratio),
      start: event.start / pulse,
      duration: Math.max(0.01, event.duration / pulse),
    });
  }
  let total = null;
  for (const line of byTag.values()) total = pool(total, lineStats(line.sort((a, b) => a.start - b.start)));
  return summarise(total);
}

/**
 * How often a phrase, played again, is the same phrase.
 *
 * Pitch is compared as a shape — the intervals, not the absolute pitches —
 * because a phrase moved to another degree of the set is still that phrase, and
 * being able to move it is the whole reason it is stored as ratios.
 */
function identity(runs) {
  const byPhrase = new Map();
  for (const run of runs) {
    // Same phrase in a different voice moves at a different speed, which is
    // intended, so voices are counted apart.
    const key = `${run.phrase.id} @${run.voice}`;
    if (!byPhrase.has(key)) byPhrase.set(key, []);
    byPhrase.get(key).push(run);
  }

  const shape = (run) => run.notes.map((n, i) => (i ? n.cents - run.notes[i - 1].cents : 0)).join(" ");
  const rhythm = (run) => run.notes.map((n) => n.duration).join(" ");

  let restatements = 0;
  let samePitch = 0;
  let sameRhythm = 0;
  let both = 0;
  for (const list of byPhrase.values()) {
    if (list.length < 2) continue;
    for (const other of list.slice(1)) {
      restatements++;
      const p = shape(list[0]) === shape(other);
      const r = rhythm(list[0]) === rhythm(other);
      if (p) samePitch++;
      if (r) sameRhythm++;
      if (p && r) both++;
    }
  }
  return { phrases: byPhrase.size, restatements, samePitch, sameRhythm, both };
}

function busyness({ events, seconds }) {
  const starts = events.map((e) => e.start).sort((a, b) => a - b);
  let longest = 0;
  for (let i = 1; i < starts.length; i++) longest = Math.max(longest, starts[i] - starts[i - 1]);
  return { rate: events.length / seconds, longest };
}

function main() {
  const corpus = ["essen", "chorales"].map((name) =>
    JSON.parse(readFileSync(`tools/out/${name}.json`, "utf8")).summary,
  );
  const takes = SEEDS.map((seed) => run(seed));
  const summaries = takes.map(summary);
  const mean = (of) => summaries.reduce((total, s) => total + of(s), 0) / summaries.length;

  // Shares are single numbers in the corpus; the rest are spreads, and for those
  // the band is the widest the two corpora between them allow.
  const shares = [
    ["repeated notes %", (s) => s.sizes[0] * 100],
    ["steps %", (s) => (s.sizes[1] + s.sizes[2]) * 100],
    ["leaps %", (s) => (s.sizes[4] + s.sizes[5] + s.sizes[6]) * 100],
    ["direction changes %", (s) => s.turnRate * 100],
  ];
  const spreads = [
    ["material that recurs", (s) => s.recurrence],
    ["repeats later on", (s) => s.longRange],
    ["tonal focus", (s) => s.tonalFocus],
    ["top pitch share", (s) => s.topPitchShare],
    ["rhythm variety, bits", (s) => s.durationEntropy],
    ["range, cents", (s) => s.range],
  ];

  console.log(`\n  ${MINUTES} minutes, ${SEEDS.length} seeds, against the corpus\n`);
  console.log("       ours      corpus            what");
  for (const [name, of] of shares) {
    const ours = mean(of);
    const low = Math.min(...corpus.map(of));
    const high = Math.max(...corpus.map(of));
    const ok = ours >= low && ours <= high;
    console.log(
      `  ${ok ? "ok " : " ! "} ${ours.toFixed(0).padStart(6)}   ${low.toFixed(0).padStart(5)} - ${high.toFixed(0).padEnd(7)}    ${name}`,
    );
  }
  for (const [name, of] of spreads) {
    const ours = mean((s) => of(s).median);
    const low = Math.min(...corpus.map((c) => of(c).low));
    const high = Math.max(...corpus.map((c) => of(c).high));
    const ok = ours >= low && ours <= high;
    const places = ours > 20 ? 0 : 2;
    console.log(
      `  ${ok ? "ok " : " ! "} ${ours.toFixed(places).padStart(6)}   ${low.toFixed(places).padStart(5)} - ${high.toFixed(places).padEnd(7)}    ${name}`,
    );
  }

  console.log("\n  when a phrase comes back, is it the same phrase?");
  for (const [i, result] of takes.map((take) => identity(take.runs)).entries()) {
    const share = (n) => `${((100 * n) / Math.max(1, result.restatements)).toFixed(0)}%`;
    console.log(
      `    seed ${SEEDS[i]}: ${String(result.phrases).padStart(3)} phrases, ${String(result.restatements).padStart(4)} restatements — ` +
        `same shape ${share(result.samePitch).padStart(4)}, same rhythm ${share(result.sameRhythm).padStart(4)}, both ${share(result.both).padStart(4)}`,
    );
  }

  console.log("\n  how busy");
  const { params } = takes[0].composer;
  console.log(`    ${params.voices} parts, how-busy ${params.density}, pulse ${params.pulse}s`);
  for (const [i, result] of takes.map(busyness).entries()) {
    console.log(`    seed ${SEEDS[i]}: ${result.rate.toFixed(2)} notes a second, longest gap ${result.longest.toFixed(1)}s`);
  }
  console.log();
}

main();
