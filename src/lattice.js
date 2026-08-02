// Getting around the lattice.
//
// The lattice is the space pitches live in: one axis per prime. A step along
// the 3 axis multiplies by 3, a step along the 5 axis multiplies by 5, and
// octaves are usually ignored because they do not change what a note is.
//
// Neighbours here are literal: the point next to 1/1 along the 3 axis is 3/2.
// That is what makes a cellular automaton on this grid a sensible idea later —
// the grid already exists, and adjacency already means something musical.

import { cents, octaveReduce, withOctaves } from "./ratio.js";

/**
 * Every combination of small steps along the given prime axes.
 *
 * With the default of one step along the 3 and 5 axes, this is the eight points
 * surrounding a note plus the note itself. Axis 1 is the prime 3, axis 2 is 5.
 */
export function neighbourhood(axes, radius) {
  let combinations = [[]];

  for (const axis of axes) {
    const next = [];
    for (const partial of combinations) {
      for (let step = -radius; step <= radius; step++) {
        const offset = partial.slice();
        offset[axis] = step;
        next.push(offset);
      }
    }
    combinations = next;
  }

  return combinations.map((offset) => {
    const filled = [];
    for (let i = 0; i < offset.length; i++) filled[i] = offset[i] ?? 0;
    return filled;
  });
}

/**
 * Every octave of this pitch class that fits between two heights, given in
 * cents from the reference.
 */
export function placeInRegister(point, low, high) {
  const base = octaveReduce(point);
  const height = cents(base);
  const out = [];

  const first = Math.ceil((low - height) / 1200);
  const last = Math.floor((high - height) / 1200);
  for (let octave = first; octave <= last; octave++) {
    out.push(withOctaves(base, octave));
  }

  return out;
}

/** A stable string key for a lattice point, for deduplicating. */
export function key(point) {
  return point.join(",");
}
