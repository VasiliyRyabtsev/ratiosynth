// The Sonority — what the music currently is, and what that seems to mean.
//
// This is the one place information travels backwards: the voices tell it what
// they are doing, and the processes that decide what to play next read it. It
// is an object you make and hold, not a hidden global, and you can have several
// — a bass layer can track only itself while an upper layer tracks everything.
//
// It holds two layers, deliberately separated:
//
//   the facts    what is sounding, as ratios, with ages and loudness.
//                Observable. No interpretation.
//   the reading  where the tonal centre seems to be, how far pitch has drifted,
//                how dense it is, which way it has been heading. Inferred, and
//                allowed to be uncertain.
//
// The cycle — a note is chosen against what is sounding, and then becomes part
// of what is sounding — is resolved by the obvious thing: a new note is scored
// against notes that have already started. That is not a workaround. It is what
// "against what is sounding" means.

import {
  UNISON,
  mul,
  div,
  cents,
  complexity,
  octaveReduce,
  pitchClass,
  withOctaves,
  equals,
} from "./ratio.js";
import { neighbourhood, key } from "./lattice.js";

const PRUNE_BELOW = 0.002; // a memory this faint changes no decision
const MAX_ENTRIES = 64;
const MARGIN_SCALE = 0.35; // bits of advantage that count as "sure"

export class Sonority {
  constructor(options = {}) {
    const {
      memory = 4, // seconds for an ended note to fade from memory
      reference = UNISON, // the lattice point "home" is measured against
      radius = 1, // how far around the notes to look for a centre
      axes = [1, 2], // which primes to search: 1 is 3, 2 is 5
      gravity = 0, // 0 lets the centre wander freely; higher pulls it home
      keepCandidates = 4,
      accepts = null, // optional filter, so one sonority can track one layer
    } = options;

    this.params = { memory, reference, radius, axes, gravity, keepCandidates };
    this.accepts = accepts;

    this.entries = []; // newest last
    this.live = new Map(); // id -> entry
    this.version = 0;
    this.cache = null;
  }

  setParams(values) {
    Object.assign(this.params, values);
    this.cache = null;
  }

  /** A voice started. Ratios only — this block never sees a frequency. */
  noteOn(id, ratio, { velocity = 1, at = 0, tag = null } = {}) {
    const entry = {
      id,
      ratio,
      velocity,
      tag,
      startedAt: at,
      endedAt: null,
    };

    if (this.accepts && !this.accepts(entry)) return null;

    this.entries.push(entry);
    this.live.set(id, entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.shift();

    this.version++;
    this.cache = null;
    return entry;
  }

  /** A voice stopped. It stays in memory and fades. */
  noteOff(id, { at = 0 } = {}) {
    const entry = this.live.get(id);
    if (!entry) return;
    entry.endedAt = at;
    this.live.delete(id);
    this.version++;
    this.cache = null;
  }

  clear() {
    this.entries = [];
    this.live.clear();
    this.version++;
    this.cache = null;
  }

  /**
   * How much a remembered note still counts.
   *
   * While it is sounding it counts fully. Once it has stopped it fades, so a
   * note that ended half a second ago still colours how the next one is heard
   * and one from a minute ago does not.
   */
  weightOf(entry, now) {
    if (entry.endedAt === null) return entry.velocity;
    const since = Math.max(0, now - entry.endedAt);
    return entry.velocity * Math.exp(-since / this.params.memory);
  }

  /** Everything, both layers. Recomputed only when something has changed. */
  read(now = 0) {
    if (this.cache && this.cache.now === now && this.cache.version === this.version) {
      return this.cache.result;
    }

    this.prune(now);

    const memory = this.entries.map((entry) => ({
      ratio: entry.ratio,
      tag: entry.tag,
      weight: this.weightOf(entry, now),
      age: now - entry.startedAt,
      sounding: entry.endedAt === null,
    }));

    const sounding = memory.filter((m) => m.sounding);
    const centre = this.estimateCentre(memory);

    const result = {
      now,
      sounding,
      memory,
      ...centre,
      drift: this.measureDrift(centre.centre),
      density: measureDensity(sounding),
      direction: this.measureDirection(memory),
    };

    this.cache = { now, version: this.version, result };
    return result;
  }

  prune(now) {
    if (this.entries.length === 0) return;
    const kept = this.entries.filter(
      (entry) => entry.endedAt === null || this.weightOf(entry, now) > PRUNE_BELOW,
    );
    if (kept.length !== this.entries.length) this.entries = kept;
  }

  /**
   * Where is home?
   *
   * Ask which lattice point, treated as the origin, makes everything we can
   * remember have the simplest ratios. Try the notes themselves and the
   * unoccupied points around them, express every remembered note relative to
   * each, and score by how tangled those ratios are.
   *
   * Unoccupied points are tested too, but be aware of a bias: a candidate that
   * is itself one of the sounding notes scores zero for that note, and no empty
   * point can match that. So in practice the centre lands on a note that is
   * playing unless gravity pulls it elsewhere. Finding a genuinely absent root
   * would need a different measure — see §4 of the design notes.
   */
  estimateCentre(memory) {
    if (memory.length === 0) {
      return { centre: null, confidence: 0, candidates: [] };
    }

    const totalWeight = memory.reduce((sum, m) => sum + m.weight, 0);
    if (totalWeight <= 0) return { centre: null, confidence: 0, candidates: [] };

    const { gravity, reference, keepCandidates } = this.params;
    const scored = [];

    for (const candidate of this.candidateOrigins(memory)) {
      let score = 0;
      for (const remembered of memory) {
        const interval = octaveReduce(div(remembered.ratio, candidate));
        score += remembered.weight * complexity(interval);
      }
      score /= totalWeight;

      // Gravity: a pull back toward the reference. At zero the centre is free
      // to wander off and never return, which is the whole point of §3 — but
      // it is also what breaks ties, so it earns its place here.
      if (gravity !== 0) {
        score += gravity * complexity(octaveReduce(div(candidate, reference)));
      }

      scored.push({ ratio: candidate, score });
    }

    scored.sort((a, b) => a.score - b.score);

    // Confidence is the gap to the runner-up. Two near-ties is genuine
    // ambiguity of centre, which is a strong musical device, so it is reported
    // as a number rather than hidden behind a winner.
    //
    // Scores are average complexity per note, in bits, and the gaps that
    // separate a clear root from a murky one turn out to be a few tenths of a
    // bit — so that is the scale confidence is measured against.
    const margin = scored.length > 1 ? scored[1].score - scored[0].score : Infinity;
    const confidence = margin === Infinity ? 1 : 1 - Math.exp(-margin / MARGIN_SCALE);

    return {
      centre: scored[0].ratio,
      confidence,
      candidates: scored.slice(0, keepCandidates),
    };
  }

  /** The notes themselves, the points around them, and home. */
  candidateOrigins(memory) {
    const { radius, axes, reference } = this.params;
    const seen = new Map();

    // Octave does not matter for a centre — a root is a root wherever it sits —
    // so points are compared as pitch classes, then folded into one octave so
    // they read as ordinary intervals rather than as 3/1 and 45/1.
    const add = (ratio) => {
      const point = octaveReduce(pitchClass(ratio));
      const id = key(point);
      if (!seen.has(id)) seen.set(id, point);
    };

    add(reference);

    for (const remembered of memory) {
      const base = pitchClass(remembered.ratio);
      for (const offset of neighbourhood(axes, radius)) {
        add(mul(base, offset));
      }
    }

    return [...seen.values()];
  }

  /**
   * How far the centre has wandered from home, and by what interval.
   *
   * Reported as the shorter way round, so a centre 3/2 above home comes
   * back as 4/3 below — that is the correction the gravity knob would
   * have to make, and it is the smaller of the two.
   */
  measureDrift(centre) {
    if (!centre) return null;

    let interval = octaveReduce(div(centre, this.params.reference));
    if (cents(interval) > 600) interval = withOctaves(interval, -1);

    return {
      interval,
      cents: cents(interval),
      complexity: complexity(interval),
      home: equals(interval, UNISON),
    };
  }

  /**
   * Which way the music has been travelling on the lattice.
   *
   * A move is the interval from one note to the next. Averaging the recent ones
   * gives a heading — "it has been walking up by 3/2" — which is something a
   * generator can either follow or deliberately contradict.
   */
  measureDirection(memory) {
    if (memory.length < 2) return null;

    const recent = memory.slice(-8);
    let totalWeight = 0;
    const mean = [];

    for (let i = 1; i < recent.length; i++) {
      const move = div(pitchClass(recent[i].ratio), pitchClass(recent[i - 1].ratio));
      const weight = recent[i].weight;
      if (weight <= 0) continue;
      totalWeight += weight;
      for (let axis = 0; axis < move.length; axis++) {
        mean[axis] = (mean[axis] ?? 0) + move[axis] * weight;
      }
    }

    if (totalWeight === 0) return null;

    for (let axis = 0; axis < mean.length; axis++) {
      mean[axis] = (mean[axis] ?? 0) / totalWeight;
    }

    const magnitude = Math.hypot(...mean.map((value) => value ?? 0));
    return { move: mean, magnitude };
  }
}

// --- helpers ---

function measureDensity(sounding) {
  const weight = sounding.reduce((sum, note) => sum + note.weight, 0);
  if (sounding.length === 0) return { voices: 0, weight: 0, spanCents: 0 };

  const heights = sounding.map((note) => cents(note.ratio));
  return {
    voices: sounding.length,
    weight,
    spanCents: Math.max(...heights) - Math.min(...heights),
  };
}

