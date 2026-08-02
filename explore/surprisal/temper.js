// Aiming at a surprisal, instead of minimising a cost.
//
// This is the part that answers the measured defect in the current engine: a
// chooser that ranks options by cost and reaches down the list by a fixed amount
// takes its cheapest option nearly every time, and the output collapses into a
// narrow lump whatever the cost function says.
//
// So do not rank and do not minimise. State the goal as a property of the
// *distribution of outcomes*: on average, each event should carry `target` bits
// of surprise under the model that predicted it. Then ask which sampling
// distribution meets that goal while staying as close as possible to what the
// model actually believes.
//
// That question has exactly one answer, and it is forced, not chosen. Minimising
// KL(Q || P) subject to E_Q[-log P] = target gives
//
//     Q(x)  proportional to  P(x)^beta
//
// with beta a Lagrange multiplier. E_Q[-log P] is strictly decreasing in beta
// (its derivative is minus the variance of the surprisal), so there is exactly
// one beta that hits the target, and bisection finds it.
//
// Two facts make this the right shape for music:
//
//   beta -> infinity  is always taking the single most expected option;
//   beta = 0          is ignoring the model entirely and walking at random.
//
// So one named quantity, "bits of surprise per event", slides continuously
// between deterministic and random, and the interesting music is in between.
// Nothing is being balanced against anything.
//
// It also composes across streams for free. Pitch, note length and articulation
// are separate models, but tempering their product by beta is the same as
// tempering each by the same beta, and expected surprisals add. So one beta
// serves all three and their bits combine with no weights — which is the point
// of putting everything in bits in the first place.

const MAX_BETA = 64;

/**
 * Solve for the temperature that makes the expected surprisal hit the target.
 *
 * `streams` is an array of arrays of surprisals in bits, one array per stream.
 * Returns the beta, clamped: below the reachable range means "the model is more
 * certain than the target allows, so be as random as the candidate set permits";
 * above means "even the safest available move is more surprising than asked
 * for", which happens when the music has just gone somewhere new.
 */
export function solveBeta(streams, target) {
  const at = (beta) => streams.reduce((sum, bits) => sum + expected(bits, beta), 0);

  const loose = at(0);
  if (target >= loose) return { beta: 0, expected: loose, clamped: "loose" };

  const tight = at(MAX_BETA);
  if (target <= tight) return { beta: MAX_BETA, expected: tight, clamped: "tight" };

  let low = 0;
  let high = MAX_BETA;
  for (let i = 0; i < 40; i++) {
    const mid = (low + high) / 2;
    if (at(mid) > target) low = mid;
    else high = mid;
  }
  const beta = (low + high) / 2;
  return { beta, expected: at(beta), clamped: null };
}

/** Expected surprisal, in bits, of one stream at a given temperature. */
export function expected(bits, beta) {
  const weights = tempered(bits, beta);
  let total = 0;
  let sum = 0;
  for (let i = 0; i < bits.length; i++) {
    total += weights[i];
    sum += weights[i] * bits[i];
  }
  return total > 0 ? sum / total : 0;
}

/** The sampling weights Q(x) proportional to P(x)^beta, as a normalised array. */
export function tempered(bits, beta) {
  // Surprisal is -log2 P, so P^beta is 2^(-beta * bits). Shift by the smallest
  // value first or a confident model underflows to all zeros.
  let least = Infinity;
  for (const value of bits) if (value < least) least = value;

  const weights = new Array(bits.length);
  let total = 0;
  for (let i = 0; i < bits.length; i++) {
    const w = 2 ** (-beta * (bits[i] - least));
    weights[i] = w;
    total += w;
  }
  if (total <= 0) return bits.map(() => 1 / bits.length);
  for (let i = 0; i < weights.length; i++) weights[i] /= total;
  return weights;
}

/** Draw an index from a normalised weight array. */
export function draw(weights, random) {
  let ticket = random();
  for (let i = 0; i < weights.length; i++) {
    ticket -= weights[i];
    if (ticket <= 0) return i;
  }
  return weights.length - 1;
}

/** Mean and spread of the surprisal actually on offer, for the loudness map. */
export function moments(bits, weights) {
  let mean = 0;
  for (let i = 0; i < bits.length; i++) mean += weights[i] * bits[i];
  let variance = 0;
  for (let i = 0; i < bits.length; i++) variance += weights[i] * (bits[i] - mean) ** 2;
  return { mean, deviation: Math.sqrt(variance) };
}
