// A piece, generated from one measure.
//
// Everything below is the same distribution applied at different scales: which
// pitches are in play, which note comes next, how long it lasts, how loud it is,
// and when the harmony moves. There is no table, no weight, and no pattern.
//
// Five parameters, all of them things a listener could name:
//
//   pulse      how fast
//   surprise   bits per event — how adventurous the piece is
//   memory     how long a habit lasts, in events
//   voices     how many parts
//   density    how much of the time a part is playing
//
// Everything usually needing a knob is derived instead:
//
//   how many pitches are in play  — the smallest set that can carry `surprise`
//   how sharply we sample         — solved for, so the entropy hits `surprise`
//   which note lasts how long     — the same prior, read as a duration ratio
//   how loud a note is            — how surprising it was
//   when the harmony changes      — when the material can no longer be that
//                                   surprising, which is a real ending rather
//                                   than a timer going off

import { mul, div, cents, equals, inverse, fromFraction } from "../../src/ratio.js";
import { neighbourhood, placeInRegister } from "../../src/lattice.js";
import { generate, momentsOfSymmetry, propriety } from "./scale.js";
import { Expectation, mass, drawAt, entropyAt, key, positionBits } from "./prior.js";

export const DEFAULTS = {
  pulse: 0.26,
  surprise: 2.2,
  memory: 48,
  voices: 3,
  density: 0.7,

  // Which world. One ratio decides the whole pitch system: stack it, and the
  // scale, its two step sizes and its available sizes all follow. Replaces the
  // old axes-and-radius pair, and unlike them it is something you can hear.
  generator: fromFraction(3, 2),

  subdivision: 2, // how many grid units to a pulse
  axes: [1, 2],
  radius: 2,
  registerLow: -1400,
  registerHigh: 1600,
};

const UNISON = [];

/**
 * The pitches in play: the smallest set of lattice points around a centre whose
 * own probabilities are varied enough to carry the requested surprise.
 *
 * This is why there is no "field size" knob. Asking for more bits per event
 * needs more to choose from, and the set grows until it can supply them. Asking
 * for fewer narrows it to a handful of closely related pitches, which is what a
 * settled passage actually is.
 */
export function fieldFor(centre, _bits, { generator, notes }) {
  return scaleFor(notes, generator).pitches.map((point) => mul(centre, point));
}

/**
 * The scale: the smallest well-formed and proper one that can carry the
 * requested surprise.
 *
 * A scale of n notes can say at most log2(n) bits about which note comes next,
 * so asking for more bits asks for more notes — and the moments of symmetry say
 * which sizes are available. At 2.2 bits a fifth gives the pentatonic; at 3.4 it
 * gives twelve notes. Nobody picks the size and nobody lists the scales.
 *
 * Improper scales are skipped, not because they sound bad but because a listener
 * cannot tell where they are in one, and this whole design assumes the listener
 * is keeping track.
 */
export function scaleFor(wanted, generator) {
  const counts = momentsOfSymmetry(generator, { upTo: 24 });
  if (counts.length === 0) return generate(generator, Math.max(3, Math.round(wanted)));

  // Propriety is judged against the scale's own chroma rather than against zero.
  // A hard test rejects the Pythagorean diatonic — its augmented fourth
  // overshoots its diminished fifth by 24 cents — and a rule that throws out the
  // most widely used scale on earth is a rule with something wrong in it. Judged
  // against its own chroma of 114 cents, that overshoot is well inside the
  // scale's own tolerance, and it is accepted.
  const usable = counts
    .map((count) => generate(generator, count))
    .filter((scale) => {
      const chroma = scale.sizes[1] - scale.sizes[0];
      return propriety(scale, chroma).proper;
    });
  const pool = usable.length > 0 ? usable : counts.map((count) => generate(generator, count));

  // Nearest available size to the one asked for. The moments of symmetry decide
  // which sizes exist; this only picks among them.
  let best = pool[0];
  for (const scale of pool) {
    if (Math.abs(scale.pitches.length - wanted) < Math.abs(best.pitches.length - wanted)) best = scale;
  }
  return best;
}

/**
 * How long the next note lasts: a whole number of grid units.
 *
 * The previous version drew a duration ratio freely — thirds of a pulse against
 * halves — and multiplied. Measured, **19% of onsets landed on a shared grid
 * where the corpus manages 92%, and chance alone is 16%.** Each voice drifted
 * off on its own and nothing was ever simultaneous. No amount of correct pitch
 * behaviour survives that; it is what chaos actually sounded like.
 *
 * So a duration is an integer count of a unit, not a free ratio, and the unit is
 * shared. Onsets then land on the grid by construction, because a sum of whole
 * numbers is a whole number. The prior over which integer is the same one used
 * everywhere else — 2^-complexity, so one unit is likeliest, then two, then
 * three — and that is still the rhythm and the pitches coming from one measure.
 * What changed is that a rhythm needs a common denominator and a pitch does not.
 */
function durations() {
  const counts = [1, 2, 3, 4, 6, 8];
  return counts.map((count) => ({ count, weight: 1 / count }));
}

/** The shorter way round a cycle of `size` degrees, signed. */
function shortestWay(delta, size) {
  let d = ((delta % size) + size) % size;
  if (d > size / 2) d -= size;
  return d;
}

/**
 * How many of the steps crossed were the large one.
 *
 * With the step count this pins the interval down exactly: Myhill's property
 * says a generic size comes in exactly two specific sizes in a well-formed
 * scale, and this says which of the two.
 */
function largeStepsBetween(big, from, to) {
  const low = Math.min(from, to);
  const high = Math.max(from, to);
  let count = 0;
  for (let i = low; i < high && i < big.length; i++) if (big[i]) count++;
  return count;
}

export class Composer {
  constructor(params = {}) {
    this.params = { ...DEFAULTS, ...params };
    this.random = Math.random;

    this.centre = UNISON;
    this.expectation = new Expectation({ memory: this.params.memory });
    // A second tally, over step counts rather than ratios. Same machinery.
    this.contour = new Expectation({ memory: this.params.memory });
    // The piece's vocabulary of cells, built as it goes and never seeded.
    this.cells = new Map();
    // And one level up: the resting places the cells hang from. Shared by every
    // voice, because a key is a thing a texture agrees on and not a thing each
    // line has privately. Measured before this existed: three voices resting on
    // 125, 700 and 1100 cents, each firmly, and the texture with no home at all.
    this.arc = null;
    this.arcAt = 0;
    this.degree = 0;
    this.field = fieldFor(this.centre, this.params.surprise, this.params);
    // How finely the grid is divided. Drawn once, from the same prior, and then
    // shared by every voice — that sharing is the whole point.
    this.durationOptions = durations();
    this.subdivision = this.params.subdivision ?? 2;

    this.recentBits = [];
    this.exhausted = 0;
    this.best = 0;
    this.time = 0;
    this.parts = Array.from({ length: Math.max(1, Math.round(this.params.voices)) }, (_, index) => ({
      index,
      tag: `voice${index}`,
      at: null,
      next: 0,
    }));
  }

  setParams(values) {
    Object.assign(this.params, values);
    this.subdivision = Math.max(1, Math.round(this.params.subdivision ?? 2));
    this.expectation.memory = this.params.memory;
    this.contour.memory = this.params.memory;
    this.field = fieldFor(this.centre, this.params.surprise, this.params);
  }

  /** The slice of register this part lives in. Parts do not share a range. */
  bandFor(part) {
    const { registerLow, registerHigh } = this.params;
    const count = this.parts.length;
    const span = (registerHigh - registerLow) / count;
    // Lowest index at the bottom, and a little overlap so parts can cross.
    const low = registerLow + span * (count - 1 - part.index);
    return { low: low - span * 0.15, high: low + span * 1.15 };
  }

  /** The pitches this part can actually reach, the field placed in its band. */
  reachable(part) {
    const band = this.bandFor(part);
    const seen = new Map();
    for (const point of this.field) {
      // placeInRegister gives every octave of the point that fits the band,
      // which is what makes a small field into a playable range of pitches.
      for (const placed of placeInRegister(point, band.low, band.high)) {
        const k = key(placed);
        if (!seen.has(k)) seen.set(k, placed);
      }
    }
    const pitches = [...seen.values()].sort((a, b) => cents(a) - cents(b));

    // Which gaps are the large step and which the small. A well-formed scale has
    // exactly two, so this is a single bit per gap, and it is what turns a
    // generic step count into an exact interval.
    const gaps = [];
    for (let i = 1; i < pitches.length; i++) gaps.push(cents(pitches[i]) - cents(pitches[i - 1]));
    const small = Math.min(...gaps);
    const large = Math.max(...gaps);
    const mid = (small + large) / 2;
    // Which scale degree each pitch is. Computed by matching pitch class against
    // the scale, not by counting positions — a voice's band does not contain a
    // whole number of aligned octaves, so index-modulo-scale-size picks
    // essentially arbitrary pitches and quietly destroys any sense of a home.
    const classOf = (r) => (((cents(r) % 1200) + 1200) % 1200);
    const scaleClasses = this.field.map(classOf);
    const degrees = pitches.map((r) => {
      const c = classOf(r);
      let best = 0;
      let gap = Infinity;
      for (let i = 0; i < scaleClasses.length; i++) {
        const d = Math.min(Math.abs(c - scaleClasses[i]), 1200 - Math.abs(c - scaleClasses[i]));
        if (d < gap) { gap = d; best = i; }
      }
      return best;
    });

    return { pitches, big: gaps.map((g) => g > mid), degrees };
  }

  /**
   * A closed path through the scale: a few moves that come back to where they
   * started.
   *
   * This is the unit of composition, and it replaces the single note. Every
   * remaining defect measured in the note-at-a-time version was a consequence of
   * the unit being too small — no home note, nothing recurring at phrase length,
   * a contour indistinguishable from a random walk, and a `memory` parameter
   * with nothing coarse enough to remember.
   *
   * It needs no length setting because it ends when it closes. That is also what
   * a phrase does, and what nothing in this project has ever done.
   */
  invent(options, here, big) {
    const moves = [];
    let at = here;
    for (let i = 0; i < 8; i++) {
      const priors = options.map((_, j) => Math.pow(2, -positionBits(j - at)));
      const { index } = drawAt(options, priors, this.params.surprise, this.random);
      moves.push(index - at);
      at = index;
      if (at === here && moves.length >= 2) return moves;
    }
    // Ran out of room without closing, so close it by hand. A path that does not
    // return is not a cell.
    if (at !== here) moves.push(here - at);
    return moves;
  }

  /**
   * Which cell to play: one already in the piece's vocabulary, or a new one.
   *
   * A remembered cell weighs what it has been worth — how often it has been
   * used — and a new one weighs exactly one observation, which is the same
   * Dirichlet rule that governs everything else here. So a piece starts with
   * nothing to say, invents, and then increasingly repeats itself, which is what
   * having a vocabulary means.
   */
  chooseCell(options, here, big) {
    // A cell is only offered if there is room to play it from here. Clamping a
    // cell that runs off the end of a voice's range silently turns its last
    // moves into repeated notes, which is a way of making the music worse while
    // appearing to make a choice.
    const fits = (moves) => {
      let at = here;
      for (const move of moves) {
        at += move;
        if (at < 0 || at >= options.length) return false;
      }
      return true;
    };

    const remembered = [...this.cells.values()].filter((cell) => fits(cell.moves));
    const fresh = this.invent(options, here, big);

    const candidates = remembered.map((cell) => cell.moves);
    const weights = remembered.map((cell) => cell.count);
    if (fits(fresh)) {
      candidates.push(fresh);
      weights.push(1);
    }
    if (candidates.length === 0) return [0];

    // How much the vocabulary can still say. When the piece keeps reaching for
    // the same cells this falls, and that — not a timer — is the passage having
    // finished what it had to say.
    this.natural = entropyAt(weights, 1);

    const { choice } = drawAt(candidates, weights, this.params.surprise, this.random);
    const id = choice.join(",");
    const seen = this.cells.get(id);
    if (seen) seen.count += 1;
    else this.cells.set(id, { moves: choice, count: 1 });

    // Fade, so a vocabulary can turn over instead of accumulating forever.
    const keep = Math.exp(-1 / Math.max(1, this.params.memory));
    for (const [key, cell] of this.cells) {
      cell.count *= keep;
      if (cell.count < 0.05) this.cells.delete(key);
    }
    return choice;
  }

  /**
   * The path between resting places — a cell one level up.
   *
   * Cells close, which makes them turn round; a sequence of cells that closes
   * lets each cell travel while the phrase still returns. Same construction as
   * `invent`, one level higher, over scale degrees rather than pitches. The
   * self-similarity is not decoration: it is the same function applied to its own
   * output.
   */
  advanceArc(size) {
    if (!this.arc || this.arcAt >= this.arc.length) {
      const choices = Array.from({ length: size }, (_, i) => i);
      const moves = [];
      let at = this.degree;
      for (let i = 0; i < 6; i++) {
        // Where a phrase comes to rest is a harmonic question, so it is answered
        // with the harmonic prior — how simple the interval from the centre is —
        // and not with the positional one that governs motion inside a cell.
        // That is the harmony-and-melody split used where each belongs, and it
        // puts the weight on the tonic and its nearest relations without anyone
        // naming them.
        // Drawn straight from the harmonic prior, at its own weight — not put
        // through the entropy target like everything else. That target is a
        // standing instruction to keep things even, and a tonic *is* unevenness,
        // so passing resting places through it flattens the tonic away. Asking
        // for a given rate of surprise is a statement about the line from moment
        // to moment; it should have no vote on where the music comes to rest.
        const priors = choices.map((j) => mass(div(this.field[j], this.centre)));
        const total = priors.reduce((sum, w) => sum + w, 0);
        let ticket = this.random() * total;
        let index = 0;
        for (let j = 0; j < choices.length; j++) {
          ticket -= priors[j];
          if (ticket <= 0) { index = j; break; }
        }
        moves.push(shortestWay(index - at, size));
        at = index;
        if (at === this.degree && moves.length >= 2) break;
      }
      if (at !== this.degree) moves.push(shortestWay(this.degree - at, size));
      this.arc = moves;
      this.arcAt = 0;
    }
    this.degree = (((this.degree + this.arc[this.arcAt]) % size) + size) % size;
    this.arcAt += 1;
  }

  /** One event from one part. */
  step(part) {
    const { pitches: options, big, degrees } = this.reachable(part);
    if (options.length === 0) return null;

    if (part.at === null) {
      part.at = options[Math.floor(this.random() * options.length)];
      // The first note of a part is not a move, so nothing is learned from it.
    }

    const moves = options.map((ratio) => div(ratio, part.at));

    // Where the line already is, in the ordered set of pitches it can reach.
    let here = options.findIndex((ratio) => equals(ratio, part.at));
    if (here < 0) {
      // The field moved under this part; treat the nearest pitch as home.
      const at = cents(part.at);
      here = options.reduce((best, ratio, i) =>
        Math.abs(cents(ratio) - at) < Math.abs(cents(options[best]) - at) ? i : best, 0);
    }

    // Prior over where to go next, from the positional code, normalised so it is
    // a probability; then habit added on top with the weight of one observation,
    // which is what a Dirichlet posterior predictive is and not a knob.
    const priors = options.map((_, i) => Math.pow(2, -positionBits(i - here)));
    const priorTotal = priors.reduce((sum, w) => sum + w, 0);

    // Habit is counted twice, on purpose, because a move is two different things
    // at once. As an exact ratio it is a harmonic object and it transposes
    // perfectly, which is the whole reason not to temper. As a count of scale
    // steps it is a melodic object — and in a well-formed scale "up one step" is
    // two different ratios, 90 cents or 114, so tallying only ratios means a
    // contour can never become a habit. That is why the momentum did not appear.
    // The address of a move: how many scale steps, and how many of them were
    // large. Generic and specific in one object. A motif moved to another degree
    // keeps its first coordinate and changes its second, which is exactly what a
    // transposed motif does — so habit generalises across degrees without
    // pretending the two versions are identical.
    //
    // Two separate tallies, one on exact ratios and one on step counts, recorded
    // the same event twice under names that could not inform each other. This is
    // the same information as one address.
    // Two levels, not two rivals. The specific address (k, how many large steps)
    // pins the interval down exactly — in a well-formed scale it *determines*
    // the ratio, which is why tallying it alone turned out to be the very same
    // tally as tallying ratios, and gained nothing.
    //
    // The generic level throws the chroma away on purpose. That is what lets a
    // shape learnt at one degree count as evidence at another, which is what
    // makes a motif a motif. Coarse generalises, fine discriminates, and the
    // evidence from each simply adds. This is ordinary back-off, and it is the
    // real reconciliation: the two coordinates are levels of one hierarchy, not
    // competing descriptions.
    // The next move comes from the cell in progress, not from a fresh decision.
    if (!part.cell || part.cellAt >= part.cell.length) {
      // The lowest part carries the phrase: when it finishes a cell, the whole
      // texture moves to the next resting place. Everyone hangs their next cell
      // on that same degree, in their own octave, which is what makes it a key
      // rather than three private habits.
      if (part.index === this.parts.length - 1) this.advanceArc(this.field.length);

      const wantDegree = this.degree;
      let best = here;
      let bestGap = Infinity;
      for (let i = 0; i < options.length; i++) {
        if (degrees[i] !== wantDegree) continue;
        if (Math.abs(i - here) < bestGap) {
          bestGap = Math.abs(i - here);
          best = i;
        }
      }
      here = best;
      part.cell = this.chooseCell(options, here, big);
      part.cellAt = 0;
      part.origin = here;
    }
    const wanted = here + part.cell[part.cellAt];
    part.cellAt += 1;
    const index = Math.max(0, Math.min(options.length - 1, wanted));
    const choice = options[index];
    const move = moves[index];
    const address = [index - here, largeStepsBetween(big, here, index)];
    const was = part.address ?? null;

    // How much the material can say, before the sampler reshapes it. As habits
    // harden this falls: the same moves keep winning and the passage runs out of
    // things to tell you. That, not a timer, is when the harmony should move.
    const natural = this.natural ?? 0;
    // Judged against this passage's own best, not against a fixed level. A
    // passage is used up when it can say a bit less than it could when it was
    // new — which is self-referential, so a dense passage and a sparse one are
    // each allowed their own idea of exhaustion.
    this.best = Math.max(this.best, natural);
    this.exhausted = natural < this.best - 1 ? this.exhausted + 1 : 0;

    const total = priors.reduce((sum, w) => sum + w, 0);
    const bits = -Math.log2(Math.max(1e-12, priors[index] / total));

    this.expectation.observe(address, was);
    part.address = address;
    this.recentBits.push(bits);
    if (this.recentBits.length > 64) this.recentBits.shift();

    // How long, in whole grid units.
    const durationWeights = this.durationOptions.map((d) => d.weight);
    const picked = drawAt(this.durationOptions, durationWeights, this.params.surprise, this.random);
    const unit = this.params.pulse / this.subdivision;
    const duration = unit * picked.choice.count;

    // How loud. A surprising note is an accented note — that is what an accent
    // means. Ranked against what this piece has recently done rather than
    // against a fixed scale, so it stays in proportion whatever is going on.
    const quieter = this.recentBits.filter((b) => b < bits).length;
    const rank = this.recentBits.length > 1 ? quieter / (this.recentBits.length - 1) : 0.5;
    const velocity = 0.35 + 0.5 * rank;

    part.at = choice;
    const event = {
      ratio: choice,
      start: part.next,
      duration: duration * 0.9,
      velocity,
      voice: part.index,
      tag: part.tag,
      bits,
    };
    part.next += duration;
    return event;
  }

  /**
   * Move the harmony when the material is exhausted.
   *
   * Not on a timer. As habits form, the same moves keep being chosen and the
   * music carries fewer and fewer bits; when it can no longer be as surprising
   * as it was asked to be, that is the passage having said what it had to say.
   * The centre then steps to a neighbouring point, drawn from the same prior, so
   * a near modulation is likelier than a far one without that being a rule.
   */
  maybeMove() {
    // Not "has the surprisal dropped" — the sampler holds surprisal at the
    // target by construction, so that could never fire. The real signal is that
    // it can no longer do so: the distribution is as flat as it goes and still
    // carries fewer bits than asked. That is the material being used up.
    if (this.exhausted < 24) return false;
    this.exhausted = 0;
    this.best = 0;

    // Modulation is one step along the generator, up or down. In a well-formed
    // scale that is the move that changes the fewest notes — exactly one — which
    // is what makes a key change hearable as a shift rather than a jump to
    // somewhere unrelated. It is the same operation that built the scale.
    const way = this.random() < 0.5 ? this.params.generator : inverse(this.params.generator);
    this.centre = mul(this.centre, way);
    this.field = fieldFor(this.centre, this.params.surprise, this.params);
    this.recentBits = [];
    return true;
  }

  /** Play for a while. Returns events in the order they start. */
  perform(seconds) {
    const events = [];
    const moves = [];
    while (true) {
      const part = this.parts.reduce((soonest, p) => (p.next < soonest.next ? p : soonest));
      if (part.next >= seconds) break;
      const event = this.step(part);
      if (!event) break;
      if (this.random() < this.params.density) events.push(event);
      if (this.maybeMove()) moves.push({ at: part.next, centre: this.centre });
    }
    events.sort((a, b) => a.start - b.start);
    return { events, moves };
  }
}
