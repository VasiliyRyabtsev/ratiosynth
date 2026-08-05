// The picture the ratios make. DESIGN §24.
//
// Every note that is sounding, or is still remembered, is drawn as one plane
// wave across the panel, and what you see is the sum of them — the same
// interference two ripples make where they cross on water. Three things about a
// wave, and all three fall out of the ratio itself. Nothing here is chosen.
//
//   which way it runs   Its place on the lattice. Each prime gets one direction,
//                       at the angle of its own pitch class round the octave: the
//                       3 axis points where 3/2 falls, the 5 axis where 5/4
//                       falls. A ratio's exponents then add up to a single arrow.
//
//   how fine it is      The length of that arrow, which is the ratio's own
//                       complexity — the same number that shades its pad. Near
//                       home is a broad slow swell, far out is a fine grain.
//
//   how fast it slides  One turn a second per octave above the root, and the
//                       other way for a note below it. Two notes slide past each
//                       other at the difference between them, so after
//                       1/(that difference, in octaves) seconds they are drawing
//                       the same figure again, moved along. 1/1 against 3/2 is
//                       1.7 seconds; 5/4 against 81/64, a comma apart, is 56. An
//                       interval becomes a length of time you have to sit
//                       through before two ways of reaching one place admit they
//                       are not the same place.
//
// Octaves count, in all three, and this is the one place in the project where
// they do. Everywhere else the question is what a note *is*, and 4/3 is the same
// thing wherever you put it; here the question is what is in the room, and a
// note two octaves up is not the same thing in the room. So 2 takes the same
// rule as every other prime, and it has to: without a step of its own, an octave
// of the root would have an arrow of no length, and a wave of no length that
// slides is not a wave sliding, it is the whole panel flashing.
//
// How fast a wave slides and how fine it is are the same quantity read along
// different directions, so the second the panel animates in is a third direction
// in space — see `fieldAt` at the foot of the file. That is the whole of the
// live view: the panel is a slice, and flying forward at one unit a second is
// watching it.

import { PRIMES, UNISON, cents, sameClass } from "./ratio.js";

const TAU = Math.PI * 2;

/**
 * One step per prime: the prime's pitch class as an angle round the octave, and
 * log2 of the prime as a length — which is what that prime contributes to
 * complexity, so distance from the middle of the picture and distance from home
 * are the same measurement. No case for the octave, which is the point.
 */
export const AXES = PRIMES.map((prime) => {
  const size = Math.log2(prime);
  const angle = TAU * (size - Math.floor(size));
  return { prime, angle, length: size, x: Math.cos(angle) * size, y: Math.sin(angle) * size };
});

/**
 * The arrow a ratio makes on the picture: its exponents, each one taking that
 * many steps along its prime's axis.
 *
 * Its length can never exceed the ratio's complexity and equals it exactly when
 * only one prime is in play, because the steps then all lie along one line. With
 * several primes they point different ways and partly cancel, which is the
 * picture saying that a ratio reached along two axes is nearer home than the
 * size of its numbers suggests.
 */
export function waveVector(a) {
  let x = 0;
  let y = 0;
  for (let i = 0; i < a.length && i < AXES.length; i++) {
    if (!a[i]) continue;
    x += a[i] * AXES[i].x;
    y += a[i] * AXES[i].y;
  }
  return [x, y];
}

/**
 * How fast a note's wave slides, in turns per second: one turn per octave above
 * the root, and the other way below it. The only thing in the picture that is
 * about height rather than lattice position.
 */
export function slideRate(a) {
  return cents(a) / 1200;
}

/**
 * A drone string that only redraws the picture's own origin.
 *
 * The picture is drawn from the root — it is the origin every arrow is measured
 * out from — so a drone string that is an octave of the root redraws the
 * coordinate system, permanently, and adds nothing but an even wash or a sweep
 * of the whole panel that never stops.
 *
 * Only the drone is treated this way. A melody note on 2/1 is an event and
 * belongs in the picture; the drone's is a fixture.
 */
function redrawsTheOrigin(entry) {
  return entry.tag === "drone" && sameClass(entry.ratio, UNISON);
}

/**
 * Turn what the sonority remembers into waves to draw, loudest first.
 *
 * Capped, because the shader holds a fixed number of them and because a dozen
 * overlapping waves is already past what an eye can pick apart. The ones that
 * get dropped are the faintest, which are the ones you could least see.
 */
export function wavesFrom(memory, limit = 12) {
  return memory
    .filter((entry) => entry.weight > 0 && !redrawsTheOrigin(entry))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((entry) => {
      const [x, y] = waveVector(entry.ratio);
      return { x, y, rate: slideRate(entry.ratio), amp: entry.weight };
    });
}

/**
 * Where a wave's phase has got to, in radians, wrapped into one turn so that an
 * hour-old session is as exact as a fresh one. Wrapped up from below as well as
 * down from above, because a note under the root slides backwards.
 */
export function phaseAt(wave, seconds) {
  return (((wave.rate * seconds * TAU) % TAU) + TAU) % TAU;
}

/**
 * The same sum, at a point in the solid the panel is a slice of.
 *
 * A wave's phase at time `t` is `rate × t`, and its phase at position `x` is `x`
 * times how fine it is. Those are the same expression, so the second the panel
 * animates in is a third direction in space, at the scale the two already share:
 * one panel width across is one second along. Give a wave the vector
 * `(x, y, rate)`, sample at `(x, y, t)`, and you have the panel at time `t`
 * exactly — no new axis, no number chosen, because the rate was already a length
 * in disguise. §24's durations become distances.
 *
 * Normalised by the amplitude present the way the shader normalises it, so this
 * and the picture cannot disagree.
 */
export function fieldAt(waves, x, y, z) {
  let sum = 0;
  let total = 0;
  for (const wave of waves) {
    sum += wave.amp * Math.cos(TAU * (wave.x * x + wave.y * y + wave.rate * z));
    total += wave.amp;
  }
  return sum / Math.max(total, 1);
}

/**
 * How fine a wave is in the solid: the length of its full three-part vector.
 *
 * The drawing needs it to know what it cannot draw. A wave whose fringes are
 * closer together than the gap between two samples along a ray cannot be sampled
 * honestly, and drawn anyway it becomes sparkle with nothing to do with the
 * music.
 */
export function grainOf(wave) {
  return Math.hypot(wave.x, wave.y, wave.rate);
}

/**
 * The same waves, sorted into what the solid can hold and what it cannot.
 *
 * A wave with no extent has nowhere to be. On the panel that is an even wash you
 * can see past, and §24 keeps it, because the root agreeing with itself
 * everywhere is a true thing to draw. Inside a solid the same wave is fog: it
 * fills every point equally, every ray saturates, and the picture goes blind.
 *
 * So the root is neither dropped nor drawn — it lights the space instead of
 * filling it, which is the same sentence read in three dimensions. `wash` is how
 * much of what is sounding is root, and the drawing spends it on the empty space
 * rather than on the crests.
 *
 * `total` divides the sum, and never by less than one note's worth, so a single
 * fading note fades instead of blooming back to full contrast on its way out.
 */
export function solidFrom(memory, limit = 8) {
  const all = wavesFrom(memory, limit);
  const waves = all.filter((wave) => grainOf(wave) > 0);

  const carried = all.reduce((sum, wave) => sum + wave.amp, 0);
  const drawn = waves.reduce((sum, wave) => sum + wave.amp, 0);

  return {
    waves,
    total: Math.max(1, drawn),
    wash: carried > 0 ? (carried - drawn) / carried : 0,
  };
}
