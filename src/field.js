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
//
// The last of the three is not really a fourth kind of thing. How fast a wave
// slides and how fine it is are the same quantity read along different
// directions, so the second the panel animates in is a third direction in space
// — see `fieldAt` at the foot of the file. That is the whole of the live view:
// the panel is a slice, and flying forward at one unit a second is watching it.

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

/**
 * The same sum, at a point in the solid the panel is a slice of.
 *
 * A wave's phase at time `t` is `rate × t`, and its phase at position `x` is
 * `x` times how fine it is. Those are the same expression, so **the second the
 * panel is animating in is a third direction in space**, at the scale the two
 * already share: one panel width across is one second along. Give a wave the
 * vector `(x, y, rate)` and sample the sum at `(x, y, t)` and you have the panel
 * at time `t`, exactly — no new axis had to be invented and no number chosen,
 * because the rate was already a length in disguise.
 *
 * What that buys is a thing you can move through rather than watch. Flying
 * forward at one unit a second holds the panel still relative to the eye, so
 * everything the picture does under the flight is what it was going to do
 * anyway; and looking ahead is looking at the next few seconds of it. §24's
 * durations become distances — the wait for two notes to come back round is how
 * far away the next repeat of the figure is, so a comma is not a minute of
 * staring but a long tunnel.
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
 * closer together than the gap between two samples along a ray cannot be
 * sampled honestly, and drawing it anyway turns it into sparkle that has
 * nothing to do with the music.
 */
export function grainOf(wave) {
  return Math.hypot(wave.x, wave.y, wave.rate);
}

/**
 * The same waves, sorted into what the solid can hold and what it cannot.
 *
 * A wave with no extent has nowhere to be. On the panel that is an even wash and
 * you can see past it — §24 keeps it deliberately, because the root agreeing
 * with itself everywhere is a true thing to draw. Inside a solid the same wave
 * is fog: it fills every point equally, so every ray saturates and the picture
 * goes blind. Measured, every set containing 1/1 came out at a contrast of 0.00.
 *
 * That is the strobe again, from the other side. §24 found that a wave of no
 * length which *slides* is not a wave sliding but the whole panel flashing, and
 * gave the octave its step to fix it. This is the remaining case: the root
 * itself, whose wave has no length and does not slide either. It cannot be a
 * thing in a picture you move through.
 *
 * So it is not dropped and not drawn — it lights the space instead of filling
 * it, which is the same sentence read in three dimensions. `wash` is how much of
 * what is sounding is root, and the drawing spends it on the empty space rather
 * than on the crests. Hold the root and the corridor glows.
 *
 * `total` divides the sum, and never by less than one note's worth, so a single
 * fading note fades instead of blooming back to full contrast on its way out.
 * That is the panel's rule and it is here for the panel's reason.
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
