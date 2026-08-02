// The performer: voices that predict their own continuation and then aim at a
// surprisal instead of minimising a cost.
//
// Each voice keeps three models of itself, all the same machinery from model.js
// over three alphabets, all of which are lattice ratios:
//
//   pitch   the move from its own last note, as a lattice vector plus an octave
//           offset. Transposition-invariant, so a shape learned in one place is
//           recognised in another — which DESIGN.md section 8 says is the thing
//           this tuning system is unusually good at.
//   time    the gap to the next onset, as a ratio to the pulse. A rhythm ratio
//           and a pitch ratio are the same relationship at different speeds
//           (section 7), so this is not an analogy, it is the same code.
//   length  how much of that gap the note actually sounds for. This is what
//           produces phrase gaps and varied note lengths.
//
// Their surprisals are in bits and simply add. One temperature, solved per
// event, holds the total at the target. There is no weight anywhere balancing
// pitch against rhythm, or harmony against melody.
//
// Harmony enters as a prior, not as a second score: a candidate pitch is likely
// if it makes a simple ratio with something recently heard, mixed over
// everything in memory by recency. Consonance *is* predictability here, so the
// "balance" knob the old engine needed has nothing left to balance.

import {
  UNISON,
  cents,
  complexity,
  div,
  equals,
  mul,
  pitchClass,
  toNumber,
  withOctaves,
} from "../../src/ratio.js";

import { latticeMass, mixture, missingMass, pointsWithin } from "./prior.js";
import { Predictor } from "./model.js";
import { draw, moments, solveBeta, tempered } from "./temper.js";

// --- the alphabets ---------------------------------------------------------
//
// Two different kinds of bound live here and they should not be confused.
//
// A *complexity budget* is a compute bound. The prior already makes anything
// beyond it negligible, and `ALPHABETS` below reports exactly how much
// probability is left outside so the truncation is visible.
//
// A *register* is a real bound on the instrument: a pitch too low or too high
// to play, a gap too short or too long to hear as a gap, a note that cannot
// outlast its own next onset. Those are structural, the same way the pitch
// register in the existing engine is structural, so the prior is renormalised
// inside them and the bits stay honest.

const PITCH_AXES = [1, 2]; // the primes 3 and 5 — pitch class only
const TIME_AXES = [0, 1, 2]; // 2, 3 and 5 — a gap needs octaves of time too

const PITCH_MOVES = pointsWithin(PITCH_AXES, 8);
const OCTAVE_OFFSETS = [0, -1, 1, -2, 2];

// The time register: onset gaps from a quarter of a pulse to eight pulses, and
// a note sounding for between an eighth of its gap and all of it.
const TIME_POINTS = inWindow(pointsWithin(TIME_AXES, 8), 0.25, 8);
const LENGTH_POINTS = inWindow(pointsWithin(TIME_AXES, 6), 1 / 8, 1);

const TIME_MASS = massOf(TIME_POINTS, TIME_AXES);
const LENGTH_MASS = massOf(LENGTH_POINTS, TIME_AXES);

export const ALPHABETS = {
  pitchMoves: PITCH_MOVES.length,
  pitchOutsideBudget: missingMass(PITCH_MOVES, PITCH_AXES),
  timePoints: TIME_POINTS.length,
  timeInsideRegister: TIME_MASS,
  lengthPoints: LENGTH_POINTS.length,
  lengthInsideRegister: LENGTH_MASS,
};

function inWindow(points, low, high) {
  return points.filter((p) => {
    const value = toNumber(p);
    return value >= low - 1e-9 && value <= high + 1e-9;
  });
}

function massOf(points, axes) {
  const z = latticeMass(axes);
  return points.reduce((sum, p) => sum + 2 ** -complexity(p) / z, 0);
}

export const DEFAULTS = {
  // The five knobs. Every one of them is something a listener can name.
  pulse: 0.26, // seconds per beat — how fast
  surprise: 3.2, // bits per event — how restless
  memory: 4.0, // seconds — how long a note keeps colouring what follows
  gravity: 0.25, // how strongly it holds a key rather than wandering
  voices: 3, // how thick

  // Not knobs: where the instrument sits and what it can reach.
  reference: UNISON,
  registerLow: -1200,
  registerHigh: 1600,
};

const PRUNE_BELOW = 0.002; // a memory this faint changes no decision
const MAX_ORDER = 6; // context length bound, for memory not for taste

export class Performer {
  constructor({ params = {}, random = Math.random } = {}) {
    this.params = { ...DEFAULTS, ...params };
    this.random = random;
    this.now = 0;
    this.memory = []; // { ratio, velocity, start, end, tag }
    this.trace = []; // one entry per event, for measurement
    this.buildVoices();
  }

  /** Live steering: the next event uses the new values, nothing restarts. */
  setParams(values) {
    const before = Math.round(this.params.voices);
    Object.assign(this.params, values);
    if (Math.round(this.params.voices) !== before) this.buildVoices();
  }

  buildVoices() {
    const count = Math.max(1, Math.round(this.params.voices));
    const { registerLow, registerHigh, reference } = this.params;
    const width = (registerHigh - registerLow) / count;
    const overlap = width * 0.25;

    const existing = this.voices ?? [];
    this.voices = Array.from({ length: count }, (_, index) => {
      if (existing[index]) return existing[index];
      const low = Math.max(registerLow, registerLow + width * index - overlap);
      const high = Math.min(registerHigh, low + width + overlap * 2);
      const centre = (low + high) / 2;

      // Start on the reference, in whichever octave sits in this band.
      const octaves = Math.round((centre - cents(reference)) / 1200);
      return {
        index,
        tag: `voice${index}`,
        band: { low, high },
        at: withOctaves(reference, octaves),
        lastLength: UNISON, // one pulse
        nextOnset: 0,
        lastOnset: 0,
        pitch: new Predictor({ maxOrder: MAX_ORDER }),
        time: new Predictor({ maxOrder: MAX_ORDER }),
        length: new Predictor({ maxOrder: MAX_ORDER }),
      };
    });
  }

  /** How much a remembered note still counts, at time `now`. */
  weightOf(entry, now) {
    const since = entry.end === null ? 0 : Math.max(0, now - entry.end);
    return entry.velocity * Math.exp(-since / this.params.memory);
  }

  /**
   * The pitch prior: a mixture of lattice priors, one centred on each pitch
   * class in memory, weighted by recency, plus the reference weighted by
   * gravity.
   *
   * This is the whole of harmony in this design. There is no roughness term and
   * no separate melodic term — a candidate is expected exactly to the degree
   * that it forms a simple ratio with what has recently been heard.
   */
  pitchPrior(now) {
    const anchors = new Map();
    let total = 0;
    for (const entry of this.memory) {
      const weight = this.weightOf(entry, now);
      if (weight < PRUNE_BELOW) continue;
      const point = pitchClass(entry.ratio);
      const id = point.join(",");
      const found = anchors.get(id);
      if (found) found.weight += weight;
      else anchors.set(id, { point, weight });
      total += weight;
    }

    const home = pitchClass(this.params.reference);
    const id = home.join(",");
    const pull = this.params.gravity * Math.max(total, 1);
    const found = anchors.get(id);
    if (found) found.weight += pull;
    else anchors.set(id, { point: home, weight: pull });

    return mixture([...anchors.values()], PITCH_AXES);
  }

  /**
   * The time prior: a mixture centred on the note lengths the other voices are
   * currently using, plus the pulse itself weighted by gravity.
   *
   * Two voices settle into a simple ratio for the same reason two pitches do,
   * and by the same arithmetic. Polyrhythm is not arranged; it is what this
   * prior finds likely.
   */
  timePrior(now) {
    const anchors = [];
    for (const voice of this.voices) {
      const age = Math.max(0, now - voice.lastOnset);
      const weight = Math.exp(-age / this.params.memory);
      if (weight < PRUNE_BELOW) continue;
      anchors.push({ point: voice.lastLength, weight });
    }
    const total = anchors.reduce((sum, a) => sum + a.weight, 0);
    anchors.push({ point: UNISON, weight: this.params.gravity * Math.max(total, 1) });
    return mixture(anchors, TIME_AXES);
  }

  /** Everything sounding at this instant, as keys, so we never double a pitch. */
  soundingKeys(now, except) {
    const keys = new Set();
    for (const entry of this.memory) {
      if (entry.tag === except) continue;
      if (entry.end !== null && entry.end <= now) continue;
      keys.add(entry.ratio.join(","));
    }
    return keys;
  }

  /**
   * Candidate pitches for one voice.
   *
   * A candidate is a pitch-class move plus an octave offset counted from the
   * *nearest* placement of that pitch class to where the voice already is. That
   * is the one structural decision that keeps lattice simplicity from becoming a
   * licence to leap, and it costs nothing: the octave prior is just the prime-2
   * axis of the same lattice prior, measured from a different origin.
   */
  pitchCandidates(voice, prior, now) {
    const here = cents(voice.at);
    const taken = this.soundingKeys(now, voice.tag);
    const out = [];

    for (const move of PITCH_MOVES) {
      const target = mul(pitchClass(voice.at), move);
      const base = cents(target);
      const nearest = Math.round((here - base) / 1200);
      const classProbability = prior(target);

      for (const offset of OCTAVE_OFFSETS) {
        const ratio = withOctaves(target, nearest + offset);
        const height = cents(ratio);
        if (height < voice.band.low || height > voice.band.high) continue;
        if (taken.has(ratio.join(","))) continue;

        const probability = (classProbability * 2 ** -Math.abs(offset)) / 3;
        out.push({
          ratio,
          symbol: `${move.join(",")}|${offset}`,
          base: probability,
        });
      }
    }

    return out;
  }

  timeCandidates(prior) {
    return TIME_POINTS.map((point) => ({
      point,
      symbol: point.join(","),
      base: prior(point),
    }));
  }

  lengthCandidates() {
    const z = latticeMass(TIME_AXES) * LENGTH_MASS;
    return LENGTH_POINTS.map((point) => ({
      point,
      symbol: point.join(","),
      base: 2 ** -complexity(point) / z,
    }));
  }

  /**
   * Produce the next event, in time order across all voices.
   *
   * Returns { ratio, start, duration, velocity, voice, bits, ... } or null if
   * the voice had nowhere to go (which only happens if a band is empty).
   */
  next() {
    const voice = this.voices.reduce((a, b) => (b.nextOnset < a.nextOnset ? b : a));
    const now = voice.nextOnset;
    this.now = now;
    this.forget(now);

    const pitch = this.pitchCandidates(voice, this.pitchPrior(now), now);
    if (pitch.length === 0) {
      voice.nextOnset += this.params.pulse;
      return null;
    }
    const time = this.timeCandidates(this.timePrior(now));
    const length = this.lengthCandidates();

    // Each stream's surprisal in bits, under its own model of the piece so far.
    const streams = [
      score(voice.pitch, pitch),
      score(voice.time, time),
      score(voice.length, length),
    ];

    // One temperature for all three. Tempering a product by beta is the same as
    // tempering each factor by the same beta, so this is not an approximation.
    const solved = solveBeta(
      streams.map((s) => s.bits),
      this.params.surprise,
    );

    const picks = streams.map((stream) => {
      const weights = tempered(stream.bits, solved.beta);
      const index = draw(weights, this.random);
      return { index, weights, stream };
    });

    const chosen = {
      pitch: pitch[picks[0].index],
      time: time[picks[1].index],
      length: length[picks[2].index],
    };

    const bits = picks.reduce((sum, p) => sum + p.stream.bits[p.index], 0);
    const expected = picks.reduce((sum, p) => sum + moments(p.stream.bits, p.weights).mean, 0);
    const variance = picks.reduce(
      (sum, p) => sum + moments(p.stream.bits, p.weights).deviation ** 2,
      0,
    );
    const deviation = Math.sqrt(variance) || 1;

    // Loudness is not chosen, it is read off the surprise. An event that came
    // out more unexpected than the rest of its own candidate set is played
    // harder. This is the only place in the design where a mapping is asserted
    // rather than derived, and it only sets a level — it never decides a note.
    const velocity = 0.2 + 0.8 / (1 + 2 ** -((bits - expected) / deviation));

    const beats = toNumber(chosen.time.point);
    const duration = beats * toNumber(chosen.length.point) * this.params.pulse;

    const event = {
      ratio: chosen.pitch.ratio,
      start: now,
      duration,
      velocity,
      voice: voice.index,
      tag: voice.tag,
      bits,
      beta: solved.beta,
      clamped: solved.clamped,
      entropy: streams.reduce((sum, s) => sum + s.entropy, 0),
    };

    // Learn from what was actually played, at every order.
    voice.pitch.observe(chosen.pitch.symbol);
    voice.time.observe(chosen.time.symbol);
    voice.length.observe(chosen.length.symbol);

    voice.at = chosen.pitch.ratio;
    voice.lastLength = chosen.time.point;
    voice.lastOnset = now;
    voice.nextOnset = now + beats * this.params.pulse;

    this.memory.push({
      ratio: event.ratio,
      velocity,
      start: now,
      end: now + duration,
      tag: voice.tag,
    });
    this.trace.push(event);

    return event;
  }

  forget(now) {
    if (this.memory.length < 8) return;
    this.memory = this.memory.filter(
      (entry) => entry.end === null || this.weightOf(entry, now) > PRUNE_BELOW,
    );
  }

  /** Play for a while. Returns the events in time order. */
  perform(seconds) {
    const events = [];
    while (this.now < seconds) {
      const event = this.next();
      if (event) events.push(event);
    }
    return events;
  }

  /** What a display would want: where each voice is and how sure it feels. */
  describe() {
    return {
      now: this.now,
      voices: this.voices.map((voice) => ({
        index: voice.index,
        at: voice.at,
        height: cents(voice.at),
        length: voice.lastLength,
        learned: voice.pitch.history.length,
      })),
      recent: this.trace.slice(-16).map((event) => ({
        bits: event.bits,
        beta: event.beta,
        entropy: event.entropy,
      })),
    };
  }
}

/** Surprisal in bits for every candidate, plus how certain the model is. */
function score(predictor, candidates) {
  const symbols = candidates.map((c) => c.symbol);
  const base = new Map(candidates.map((c) => [c.symbol, c.base]));
  const probabilities = predictor.distribution(symbols, (symbol) => base.get(symbol));
  const bits = symbols.map((symbol) => -Math.log2(Math.max(1e-300, probabilities.get(symbol))));
  return { bits, entropy: Predictor.entropy(probabilities) };
}

/** Distance in cents, for anything that wants to look at the output. */
export function heightOf(ratio) {
  return cents(ratio);
}

export { complexity, div, equals };
