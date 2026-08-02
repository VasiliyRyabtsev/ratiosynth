// How rough two sounds are together.
//
// The effect is simple to state. Two pure tones at the same frequency are
// smooth. Move one away and it starts to buzz — the two are close enough to
// interfere but far enough apart to be heard fighting. Keep moving and the
// buzzing fades again, and you hear two separate clean tones. So roughness for
// one pair of pure tones is a bump: zero, up to a peak, back to zero.
//
// Where the peak sits depends on pitch. Low notes need a much wider gap before
// they stop fighting, which is why a chord that sounds fine in the middle of
// the keyboard turns to mud an octave down.
//
// Real notes are not pure tones — they are a stack of partials — so the
// roughness of two notes is the sum over every pair of partials, one from each.
// That is where the whole premise of this project comes from: 3/2 sounds smooth
// because the partials of the two notes land on each other instead of near each
// other.

// The bump. These constants place the peak at about a quarter of the distance
// the ear needs to separate two tones, which is where measured roughness peaks.
const PEAK_AT = 0.24;
const WIDTH_SLOPE = 0.0207;
const WIDTH_BASE = 18.96;
const RISE = 3.5;
const FALL = 5.75;

// The bump's own height, so a worst-case pair of equally loud partials scores 1
// rather than some arbitrary number.
const PEAK_HEIGHT = Math.exp(-RISE * 0.2207) - Math.exp(-FALL * 0.2207);

// Past this the bump has all but vanished, and the pair can be skipped.
const NEGLIGIBLE = 2;

/** Roughness of one pair of pure tones. */
export function pairRoughness(f1, a1, f2, a2) {
  const gap = Math.abs(f1 - f2);
  const lower = f1 < f2 ? f1 : f2;

  // How wide the fighting zone is at this pitch — narrow up high, wide down low.
  const scale = PEAK_AT / (WIDTH_SLOPE * lower + WIDTH_BASE);
  const x = scale * gap;
  if (x > NEGLIGIBLE) return 0;

  return (a1 * a2 * (Math.exp(-RISE * x) - Math.exp(-FALL * x))) / PEAK_HEIGHT;
}

// How far apart two partials can be and still interfere. Comes from solving the
// bump for where it becomes negligible, and it is what lets us skip most pairs.
function reach(hz) {
  return (NEGLIGIBLE * (WIDTH_SLOPE * hz + WIDTH_BASE)) / PEAK_AT;
}

/**
 * Roughness between two sounds, each given as partials sorted by frequency.
 *
 * Most pairs of partials are too far apart to interfere at all, so this sweeps
 * a window through the second sound rather than comparing everything with
 * everything. Same answer, a fraction of the work.
 */
export function roughnessBetween(a, b) {
  let total = 0;
  let low = 0;

  for (let i = 0; i < a.length; i++) {
    const partial = a[i];
    const window = reach(partial.hz);

    while (low < b.length && b[low].hz < partial.hz - window) low++;

    for (let j = low; j < b.length && b[j].hz <= partial.hz + window; j++) {
      total += pairRoughness(partial.hz, partial.amp, b[j].hz, b[j].amp);
    }
  }

  return total;
}

/** Roughness of a sound with itself — its partials fighting each other. */
export function selfRoughness(partials) {
  let total = 0;
  for (let i = 0; i < partials.length; i++) {
    const window = reach(partials[i].hz);
    for (let j = i + 1; j < partials.length && partials[j].hz <= partials[i].hz + window; j++) {
      total += pairRoughness(
        partials[i].hz,
        partials[i].amp,
        partials[j].hz,
        partials[j].amp,
      );
    }
  }
  return total;
}

/** Everything sounding at once, every note against every other, plus each
 *  note's own internal roughness. */
export function totalRoughness(sounds, { includeSelf = true } = {}) {
  let total = 0;
  for (let i = 0; i < sounds.length; i++) {
    if (includeSelf) total += selfRoughness(sounds[i]);
    for (let j = i + 1; j < sounds.length; j++) {
      total += roughnessBetween(sounds[i], sounds[j]);
    }
  }
  return total;
}

/** Slow and obvious version, for checking the fast one. */
export function roughnessBetweenSlow(a, b) {
  let total = 0;
  for (const x of a) {
    for (const y of b) total += pairRoughness(x.hz, x.amp, y.hz, y.amp);
  }
  return total;
}
