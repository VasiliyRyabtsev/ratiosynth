// The harmonic field — which pitches are in play just now.
//
// §3 says we do not pick N notes out of infinity, and that stands. But there is
// a difference between *not having a fixed scale* and *choosing every note
// freshly from the whole neighbourhood*, and the second one is what made the
// music churn: the material never settled long enough to be recognised.
//
// So: a small set of lattice points, held for several phrases, then deliberately
// *moved* — the whole set steps somewhere else on the lattice. Within a few
// seconds the material is consistent; over a minute it has travelled. That is a
// moving window on infinity, not a scale, and none of it is tempered.
//
// The move is the interesting part. Because transposition is exact here, shifting
// the field by 3/2 gives the identical set of relationships somewhere else — a
// modulation with nothing approximated, which no keyboard can do.

import { UNISON, mul, div, complexity, octaveReduce, pitchClass, equals } from "./ratio.js";
import { neighbourhood, key } from "./lattice.js";

export const FIELD_DEFAULTS = {
  size: 7, // how many pitches are in play at once
  radius: 2, // how far around the centre to look for them
  axes: [1, 2],
  reference: UNISON,
  homing: 0.35, // how strongly the field is pulled back toward the reference
  stepBias: 1.4, // how strongly it prefers simple modulations
};

/**
 * The pitches around a centre, simplest first.
 *
 * For a centre of 1/1 and a size of seven this gives 1/1, 3/2, 4/3, 5/3, 5/4,
 * 6/5, 8/5 — both thirds and both sixths, which is a rich but perfectly plain
 * just set. Nothing about it is written down; it is what "nearest on the
 * lattice" means.
 */
export function fieldAround(centre, options = {}) {
  const { size, radius, axes } = { ...FIELD_DEFAULTS, ...options };

  const seen = new Map();
  for (const offset of neighbourhood(axes, radius)) {
    const point = octaveReduce(pitchClass(mul(centre, offset)));
    const id = key(point);
    if (!seen.has(id)) seen.set(id, point);
  }

  return [...seen.values()]
    .map((point) => ({ point, distance: complexity(octaveReduce(div(point, centre))) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, Math.max(1, Math.round(size)))
    .map((entry) => entry.point);
}

export class HarmonicField {
  constructor(options = {}) {
    this.params = { ...FIELD_DEFAULTS, ...options };
    this.centre = options.centre ?? UNISON;
    this.members = fieldAround(this.centre, this.params);
    this.moves = 0;
  }

  setParams(values) {
    Object.assign(this.params, values);
    this.members = fieldAround(this.centre, this.params);
  }

  /** Is this pitch class part of the current field? */
  holds(ratio) {
    const point = octaveReduce(pitchClass(ratio));
    return this.members.some((member) => equals(member, point));
  }

  /**
   * Move the whole field one step on the lattice.
   *
   * Simple moves are preferred, so the new field overlaps the old one and the
   * change is heard as a modulation rather than as a cut. Gravity keeps it from
   * walking away and never coming back.
   */
  move(random = Math.random) {
    const { axes, reference, homing, stepBias } = this.params;

    const options = [];
    for (const offset of neighbourhood(axes, 1)) {
      const candidate = octaveReduce(pitchClass(mul(this.centre, offset)));
      if (equals(candidate, this.centre)) continue;

      const step = complexity(octaveReduce(div(candidate, this.centre)));
      const fromHome = complexity(octaveReduce(div(candidate, reference)));
      options.push({ candidate, cost: stepBias * step + homing * fromHome });
    }

    if (options.length === 0) return this.centre;

    const lowest = Math.min(...options.map((option) => option.cost));
    let total = 0;
    const weights = options.map((option) => {
      const weight = Math.exp(-(option.cost - lowest));
      total += weight;
      return weight;
    });

    let ticket = random() * total;
    let chosen = options[options.length - 1].candidate;
    for (let i = 0; i < options.length; i++) {
      ticket -= weights[i];
      if (ticket <= 0) {
        chosen = options[i].candidate;
        break;
      }
    }

    this.centre = chosen;
    this.members = fieldAround(this.centre, this.params);
    this.moves++;
    return this.centre;
  }

  /** How much of the field survives a move — how smooth the modulation is. */
  overlapWith(other) {
    const mine = new Set(this.members.map(key));
    return other.filter((point) => mine.has(key(point))).length;
  }
}
