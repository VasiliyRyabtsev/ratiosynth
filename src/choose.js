// Choosing the next note.
//
// There is no scale to pick from. Instead we look at the lattice points around
// what is already happening, score each one, and pick. Two scores, because
// notes affect a new note by two different mechanisms:
//
//   harmonic  against what is sounding *right now*. Those partials are in the
//             air together and physically beat against each other. This is
//             roughness, and it applies only to notes literally playing.
//   melodic   against the recency-weighted memory, including notes that have
//             already stopped. Those cannot beat with anything, but the ear
//             still hears a new note in relation to them. This is about how
//             simple the ratio is.
//
// A balance knob mixes them. Harmonic-heavy makes music about chords and blend;
// melodic-heavy makes music about line and motion.
//
// There is a third thing, and leaving it out was a real mistake for a long
// time: **how far the line moves in pitch**. Lattice distance and pitch
// distance are not the same question. 3/2 is about as simple as a ratio gets
// and it is also a leap of 702 cents, so scoring by simplicity alone rewarded
// every line for jumping about. With a harmonic field deciding which pitches
// are available, the chooser's real remaining job is voice leading.
//
// Neither score is something to minimise. Always picking the smoothest note
// available gives you the most boring music available. So each score has a
// target: aim at smooth, aim at rough, or aim anywhere in between.

import { div, mul, cents, complexity, equals, octaveReduce, pitchClass, toHz } from "./ratio.js";
import { neighbourhood, placeInRegister, key } from "./lattice.js";
import { partialsAt } from "./instrument.js";
import { roughnessBetween } from "./roughness.js";

export const DEFAULTS = {
  balance: 0.5, // 0 all melodic, 1 all harmonic
  tension: 0.15, // where to aim on the roughness range, 0 smoothest
  reach: 0.2, // where to aim on the simplicity range, 0 simplest
  spread: 0.12, // 0 always takes the best, higher wanders
  radius: 1, // how far to step on the lattice
  axes: [1, 2], // which primes may move: 1 is 3, 2 is 5
  registerLow: -1200, // cents from the reference
  registerHigh: 1600,
  maxStep: Infinity, // biggest lattice jump allowed from the last note
  doubling: 0.25, // cost of picking a pitch that is already there, an octave away
  homing: 0.2, // pull back toward the reference; 0 wanders off and never returns
  reference: [], // where "home" is
  field: null, // the pitches in play just now; null means the whole neighbourhood
  from: null, // where this line currently is, so it can move by steps
  stepwise: 2, // how strongly a line prefers to move by steps rather than leap

};

/**
 * The lattice points worth considering.
 *
 * Neighbours of what is sounding and of the estimated centre, in every octave
 * that fits the register. Nothing is enumerated in advance — the set of
 * candidates depends entirely on where the music currently is.
 */
export function generateCandidates(reading, options = {}) {
  const { radius, axes, registerLow, registerHigh, field } = { ...DEFAULTS, ...options };

  // With a harmonic field in force, the pitches in play are decided already and
  // the only question is which octave. Without one, every neighbour of every
  // sounding note is fair game — which is a lot of freedom, and sounds like it.
  if (field && field.length > 0) {
    const inField = new Map();
    for (const point of field) {
      for (const placed of placeInRegister(point, registerLow, registerHigh)) {
        inField.set(key(placed), placed);
      }
    }
    for (const note of reading.sounding) inField.delete(key(note.ratio));
    if (inField.size > 0) return [...inField.values()];
  }

  const bases = [];
  for (const note of reading.sounding) bases.push(note.ratio);
  if (reading.centre) bases.push(reading.centre);
  if (bases.length === 0 && reading.memory.length > 0) {
    bases.push(reading.memory[reading.memory.length - 1].ratio);
  }
  if (bases.length === 0) bases.push([]);

  const found = new Map();

  for (const base of bases) {
    for (const offset of neighbourhood(axes, radius)) {
      const point = mul(pitchClass(base), offset);
      for (const placed of placeInRegister(point, registerLow, registerHigh)) {
        const id = key(placed);
        if (!found.has(id)) found.set(id, placed);
      }
    }
  }

  // Never offer a pitch that is already sounding at exactly that pitch.
  for (const note of reading.sounding) found.delete(key(note.ratio));

  return [...found.values()];
}

/**
 * Score every candidate.
 *
 * The two raw measures are in different units — roughness is a sum of partial
 * collisions, complexity is in bits — so they are each stretched onto 0..1
 * across the candidates actually on offer before being combined. That also
 * makes the knobs mean the same thing whatever the music is doing.
 */
export function scoreCandidates(candidates, context) {
  const { reading, modes, referenceHz } = context;
  const params = { ...DEFAULTS, ...context.params };

  // A voice replaces its own note rather than joining it, so that note must not
  // count as part of the harmony a candidate is judged against. Leaving it in
  // made repeating a note look perfectly smooth, because a unison adds no
  // roughness at all — and so the harmonic term quietly recommended standing
  // still on every single decision. No setting could fix that; the error was in
  // the model, not in the weights.
  const sounding = reading.sounding
    .filter((note) => !(params.from && equals(note.ratio, params.from)))
    .map((note) => ({
      weight: note.weight,
      partials: partialsAt(modes, toHz(note.ratio, referenceHz)),
    }));
  const soundingWeight = sounding.reduce((sum, note) => sum + note.weight, 0);
  const memoryWeight = reading.memory.reduce((sum, note) => sum + note.weight, 0);

  const scored = candidates.map((ratio) => {
    const partials = partialsAt(modes, toHz(ratio, referenceHz));

    let roughness = 0;
    for (const note of sounding) {
      roughness += note.weight * roughnessBetween(partials, note.partials);
    }
    if (soundingWeight > 0) roughness /= soundingWeight;

    let tangle = 0;
    for (const note of reading.memory) {
      tangle += note.weight * complexity(div(ratio, note.ratio));
    }
    if (memoryWeight > 0) tangle /= memoryWeight;

    // How far from home this point is, on the lattice rather than in pitch.
    const fromHome = complexity(octaveReduce(div(ratio, params.reference)));

    // And how far it is in actual pitch from where this line already is.
    //
    // These are not the same question, and conflating them was a real mistake:
    // 3/2 is about as simple as a ratio gets, and it is also a leap of 702
    // cents. Scoring only by simplicity meant every line was rewarded for
    // jumping about. Melodies mostly move by small steps.
    const leap = params.from === null ? 0 : Math.abs(cents(ratio) - cents(params.from));

    return { ratio, roughness, tangle, fromHome, leap };
  });

  const rough = spanOf(scored, "roughness");
  const tangled = spanOf(scored, "tangle");
  const distance = spanOf(scored, "fromHome");

  // Pitch classes already in the air. An octave of a note that is playing is
  // the smoothest and simplest thing on offer every single time, so without
  // this the music would stack octaves and never find a new note.
  const present = new Set(reading.sounding.map((note) => key(pitchClass(note.ratio))));

  for (const candidate of scored) {
    candidate.harmonic = normalise(candidate.roughness, rough);
    candidate.melodic = normalise(candidate.tangle, tangled);
    candidate.doubles = present.has(key(pitchClass(candidate.ratio)));

    // Distance from where the knobs are aiming, not distance from zero.
    //
    // Plus a pull toward home. Scoring only against recent memory means the
    // music happily walks away from where it started and never comes back —
    // each step is locally sensible and the sum of them is a wander. This is
    // §3's gravity, and it needs to act on the notes, not only on the estimate
    // of where the centre is.
    candidate.cost =
      params.balance * Math.abs(candidate.harmonic - params.tension) +
      (1 - params.balance) * Math.abs(candidate.melodic - params.reach) +
      params.homing * normalise(candidate.fromHome, distance) +
      params.stepwise * stepCost(candidate.leap) +
      (candidate.doubles ? params.doubling : 0);
  }

  scored.sort((a, b) => a.cost - b.cost);
  return scored;
}

/**
 * Pick one.
 *
 * Not always the best one — `spread` decides how far down the list it is
 * willing to reach. At zero it takes the top candidate every time, which is
 * both predictable and dull.
 */
export function chooseNext(context) {
  const params = { ...DEFAULTS, ...context.params };
  const random = context.random ?? Math.random;

  let candidates = generateCandidates(context.reading, params);
  candidates = withinStep(candidates, context.reading, params.maxStep);
  if (candidates.length === 0) return null;

  const scored = scoreCandidates(candidates, { ...context, params });

  // The whole ranked list, for anything that wants to show what was turned
  // down. Optional, and nothing here depends on it.
  context.onScored?.(scored);

  if (params.spread <= 0) return scored[0];

  let total = 0;
  const weights = scored.map((candidate) => {
    const weight = Math.exp(-candidate.cost / params.spread);
    total += weight;
    return weight;
  });

  let ticket = random() * total;
  for (let i = 0; i < scored.length; i++) {
    ticket -= weights[i];
    if (ticket <= 0) return scored[i];
  }
  return scored[0];
}

// --- helpers ---

/** Drop candidates that would be too big a jump from the most recent note. */
function withinStep(candidates, reading, maxStep) {
  if (!Number.isFinite(maxStep) || reading.memory.length === 0) return candidates;

  const last = reading.memory[reading.memory.length - 1].ratio;
  const near = candidates.filter(
    (ratio) => complexity(div(pitchClass(ratio), pitchClass(last))) <= maxStep,
  );

  // If the limit rules everything out, ignore it rather than falling silent.
  return near.length > 0 ? near : candidates;
}


function spanOf(scored, key) {
  let low = Infinity;
  let high = -Infinity;
  for (const candidate of scored) {
    if (candidate[key] < low) low = candidate[key];
    if (candidate[key] > high) high = candidate[key];
  }
  return { low, high };
}

// What a line costs to move, by how far it moves in pitch.
//
// Dear at zero, dear again far out, cheapest around a step. This curve is
// invented rather than derived, and measurement showed it is wrong: it makes
// standing still the most expensive move available, where real melody repeats a
// note about one time in six, and it makes an octave leap barely worse than a
// third, where real melody leaps about one time in eight. Our output repeated
// 0.4% and leapt 3.7%. Everything piled into the middle.
//
// It is left here deliberately. A corpus-derived replacement was tried and
// removed: reading the curve off eight thousand folk melodies fixes the numbers
// but smuggles the diatonic scale into a project whose premise is refusing that
// inheritance, and a hand-fitted table is exactly what the design is now trying
// to eliminate. The whole cost-and-weights approach in this file is being
// replaced rather than patched — see DESIGN.md §12.
//
// Absolute, not relative to the other candidates: "small" has to mean small in
// cents, or the nearest available option always looks like a step even when it
// is a leap.
function stepCost(leap) {
  const standingStill = Math.exp(-leap / 70);
  const reaching = 1 - Math.exp(-leap / 400);
  return standingStill + reaching;
}

function normalise(value, { low, high }) {
  return high - low < 1e-12 ? 0 : (value - low) / (high - low);
}

