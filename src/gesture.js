// Remembering shapes, so that something can come back.
//
// A gesture is a sequence of *moves*, not a sequence of pitches: "up a fifth,
// up a fifth, down a major third". That makes it a shape rather than a tune,
// and a shape can be started anywhere on the lattice and stay recognisably the
// same thing. This system is unusually good at that — transposition here is
// exact, so a shape moved somewhere else is not approximately the same, it is
// identical in every interval.
//
// Nothing has to *recognise* a repeated shape in the output. The player simply
// keeps what it has played and reuses it, which is the easy half of the problem
// and the half that matters. Entries fade, so the pool stays current on its own;
// pinning one stops it fading, and that is the whole manual interface.

import { mul, cents, withOctaves } from "./ratio.js";

export class GesturePool {
  constructor({ capacity = 16, memory = 90 } = {}) {
    this.capacity = capacity;
    this.memory = memory;
    this.entries = [];
    this.nextId = 1;
  }

  /** Keep a shape. Trivial ones — nothing moved — are not worth keeping. */
  remember(moves, at = 0, { tag = null } = {}) {
    if (!moves || moves.length < 2) return null;
    if (moves.every((move) => move.length === 0)) return null;

    const entry = { id: this.nextId++, moves, at, tag, pinned: false };
    this.entries.push(entry);
    this.forget();
    return entry;
  }

  weightOf(entry, now) {
    if (entry.pinned) return 1;
    return Math.exp(-Math.max(0, now - entry.at) / this.memory);
  }

  /** Drop the faintest once there are too many. Pinned ones are never dropped. */
  forget() {
    if (this.entries.length <= this.capacity) return;
    const loose = this.entries.filter((entry) => !entry.pinned);
    if (loose.length === 0) return;
    const oldest = loose.reduce((a, b) => (a.at <= b.at ? a : b));
    this.entries = this.entries.filter((entry) => entry !== oldest);
  }

  /** One of the remembered shapes, favouring the recent and the pinned. */
  pick(now = 0, random = Math.random, { tag = null } = {}) {
    const usable = this.entries.filter((entry) => tag === null || entry.tag === tag);
    if (usable.length === 0) return null;

    let total = 0;
    const weights = usable.map((entry) => {
      const weight = this.weightOf(entry, now);
      total += weight;
      return weight;
    });
    if (total <= 0) return null;

    let ticket = random() * total;
    for (let i = 0; i < usable.length; i++) {
      ticket -= weights[i];
      if (ticket <= 0) return usable[i];
    }
    return usable[usable.length - 1];
  }

  pin(id, pinned = true) {
    const entry = this.entries.find((candidate) => candidate.id === id);
    if (entry) entry.pinned = pinned;
    return entry ?? null;
  }

  list(now = 0) {
    return this.entries
      .map((entry) => ({ ...entry, weight: this.weightOf(entry, now) }))
      .sort((a, b) => b.weight - a.weight);
  }

  clear() {
    this.entries = [];
  }
}

/**
 * Take one step of a gesture from where we are now.
 *
 * The move is applied exactly — that is the point of storing shapes rather than
 * pitches. Only the octave is adjusted, and only if the result would fall
 * outside the register the layer is allowed to use.
 */
export function applyMove(from, move, low, high) {
  const landed = mul(from, move);
  const height = cents(landed);

  if (height >= low && height <= high) return landed;

  const octaves = Math.round((clamp(height, low, high) - height) / 1200);
  return octaves === 0 ? landed : withOctaves(landed, octaves);
}

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}
