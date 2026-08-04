// The picture the ratios make.
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
//                       the same figure again, moved along. The closer together
//                       they are, the longer that takes: 1/1 against 3/2 is 1.7
//                       seconds, and 5/4 against 81/64 — a comma apart, near
//                       enough the same note on first hearing — is 56. That is
//                       the argument of this whole project, drawn. An interval
//                       becomes a length of time you have to sit through before
//                       two ways of reaching one place admit they are not the
//                       same place.
//
// Octaves count, in all three, and this is the one place in the project where
// they do. Everywhere else a note's identity is its pitch class, because
// everywhere else the question is what a note *is* — and 4/3 is the same thing
// wherever you put it. Here the question is what is in the room, and a note two
// octaves up is not the same thing in the room. So 2 takes the same rule as
// every other prime: folded into one octave it lands on the root, giving it an
// angle of nought and a step of one, and it moves the picture like anything
// else.
//
// It also has to. An octave of the root has no other prime in it, so with the 2s
// left out its arrow has no length — and a wave of no length that slides is not
// a wave sliding, it is the whole panel flashing. Pressing 2/1 strobed at one
// beat a second. Giving the octave its step is what makes the rate safe to vary.

import { PRIMES, UNISON, cents, sameClass } from "./ratio.js";

const TAU = Math.PI * 2;

/**
 * One step per prime: a direction and a length.
 *
 * The angle is the prime's own pitch class as a fraction of the octave — where
 * you would find it if you folded it back down into one octave and laid that
 * octave round a circle. The length is log2 of the prime, which is what that
 * prime contributes to complexity, so distance from the middle of the picture
 * and distance from home are the same measurement.
 *
 * The octave takes the same rule and nothing else: folded down, 2 lands on the
 * root, so its angle is nought and it steps a length of one straight along the
 * first axis. There is no case here, which is the point — see the note on
 * octaves at the top of the file for why it earns its step.
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
 * the root.
 *
 * The root does not move at all. An octave above it turns once a second, an
 * octave below turns once a second the other way. This is the only thing in the
 * picture that is about height rather than lattice position.
 */
export function slideRate(a) {
  return cents(a) / 1200;
}

/**
 * A drone string that only redraws the picture's own origin.
 *
 * The drone is strung root, root an octave down, and 3/2 — and it never stops.
 * Two of those three are octaves of the root, and the picture is already drawn
 * from the root: it is the origin every arrow is measured out from. So those two
 * redraw the coordinate system, permanently, and they are exactly the two that
 * misbehave. 1/1 has no arrow at all and adds nothing but an even wash. 1/2
 * sweeps the whole panel once a second — four times faster than anything the
 * music plays, and for as long as the piece lasts.
 *
 * What survives is the string that is not an octave of the root: the 3/2 the
 * drone is strung for, sweeping once every eight seconds, which sits among the
 * music instead of on top of it. One slot instead of three.
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
