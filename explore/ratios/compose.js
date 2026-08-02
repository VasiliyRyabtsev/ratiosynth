// A piece with a fixed root, made of ratios.
//
// This throws away the moving centre, the arc of resting places, modulation, and
// the whole harmonic-rhythm apparatus. All of it existed to manage a root that
// moved, and all of it was fighting itself. Fixing the root deletes the problem
// instead of managing it, which is what raga and maqam practice does and what
// the drone is for.
//
// What is left is smaller:
//
//   - The root sounds throughout. Every pitch is heard against it, which is the
//     only way small differences in ratio become audible at all.
//   - The pitch material is a combination product set. A pitch is a set of
//     factors; a move swaps one factor for another; the interval of that move is
//     the ratio of the two factors. No scale degrees exist anywhere.
//   - A phrase leaves the root and comes back. Arrival is landing on 1/1, which
//     needs no mechanism to define and is the thing this project has never had.
//   - Tension is how many bits a pitch costs against the root, which is a fact
//     about the numbers rather than a setting.
//
// Four parameters:
//
//   pulse     how fast
//   surprise  how adventurous the choice of move is
//   memory    how long a phrase stays in the vocabulary
//   voices    how many parts
//   density   how much of the time a part plays

import { mul, div, cents, equals, octaveReduce, withOctaves, complexity, fromFraction } from "../../src/ratio.js";
import { productSet, movesFrom, allMoves, isRoot, fromRoot } from "./cps.js";

export const DEFAULTS = {
  pulse: 0.32,
  surprise: 2.0,
  // Cents worth one bit — how much the ear wants a line to stay put. Swept
  // against the corpus after the opening-size rule went in: 350 leaves steps at
  // 7%, 180 puts them at 60% and 220 at 51%, against a corpus 47-65%.
  nearness: 200,
  memory: 48,
  voices: 2,
  density: 0.3,

  factors: [1, 3, 5, 7],
  choose: 2,
  subdivision: 2,
  drone: true,
  registerLow: -1400,
  registerHigh: 1600,
};

const UNISON = [];
const FIFTH = [-1, 1]; // 3/2
const COUNTS = [1, 2, 3, 4, 6, 8];

export class Composer {
  constructor(params = {}) {
    this.params = { ...DEFAULTS, ...params };
    this.random = Math.random;
    this.rebuild();
  }

  rebuild() {
    this.set = productSet(this.params.factors, this.params.choose);
    this.root = this.set.find(isRoot) ?? this.set[0];
    this.phrases = new Map();
    this.sections = new Map();
    this.subdivision = Math.max(1, Math.round(this.params.subdivision));
    this.parts = Array.from({ length: Math.max(1, Math.round(this.params.voices)) }, (_, index) => ({
      index,
      tag: `voice${index}`,
      at: this.root,
      octave: 0,
      phrase: null,
      section: null,
      sectionStep: 0,
      base: 0,
      mute: false,
      step: 0,
      next: 0,
    }));
    this.droneNext = 0;

    // Progressive disclosure. The piece does not begin with its whole pitch set;
    // it admits them one at a time, simplest against the root first, the way an
    // alap unfolds a raga. Two things follow for free: the most remote note
    // arrives last and therefore lands as an event, and the opening has almost
    // nothing in it, which is the opposite of a constant stream.
    this.order = [...this.set].sort((a, b) => fromRoot(a) - fromRoot(b));
    // How much to open with: enough that the line can move without leaping.
    //
    // This is not a taste. In a product set the simplest members are the ones
    // furthest apart — 4:5:6:7 puts them 386, 316 and 231 cents from each other
    // — so the first few notes admitted have no small interval between them at
    // all, and a line drawn from them can only leap. Measured, the unfolding was
    // spending most of the piece in that state: 3% of moves were steps against a
    // corpus 47-65%, and it was not the weighting's fault, because opening the
    // whole set at once put steps at 41% with nothing else changed.
    //
    // So the opening is the smallest set of simplest notes that contains one
    // interval the ear will hear as a step, and what counts as a step is already
    // decided by `nearness` — the cents worth one bit. No new number.
    this.admitted = Math.min(this.order.length, this.openingSize());
    this.settled = 0;
  }

  /** The fewest of the simplest notes that have a step between them. */
  openingSize() {
    for (let k = 2; k < this.order.length; k++) {
      for (let i = 0; i < k; i++) {
        for (let j = i + 1; j < k; j++) {
          if (shortestCents(this.order[i].ratio, this.order[j].ratio) < this.params.nearness) return k;
        }
      }
    }
    return this.order.length;
  }

  /** The pitches in play so far. */
  available() {
    return this.order.slice(0, this.admitted);
  }

  /** How far through the unfolding, from 0 at the start to 1 when all are in. */
  progress() {
    const opening = this.openingSize();
    const span = Math.max(1, this.order.length - opening);
    return Math.min(1, (this.admitted - opening) / span);
  }

  setParams(values) {
    const before = `${this.params.factors}|${this.params.choose}|${this.params.voices}`;
    Object.assign(this.params, values);
    this.subdivision = Math.max(1, Math.round(this.params.subdivision));
    if (`${this.params.factors}|${this.params.choose}|${this.params.voices}` !== before) this.rebuild();
  }

  /**
   * A phrase: leave the root, and come back to it.
   *
   * Every move is a factor swap weighted by how simple the exchange is —
   * 2^-complexity of the ratio, the same measure used for everything else. The
   * phrase ends when it reaches the root again, so closure is not a rule imposed
   * on it but the condition for it being finished.
   *
   * A phrase is invented once and then it is a fixed object: pitches, note
   * lengths and the shape of its ups and downs, all three. This is the thing the
   * engine did not have. It had phrases and it reused them constantly — measured
   * over ten minutes, nine distinct phrases and two thousand statements of them —
   * but the note lengths were redrawn on every statement from a six-way
   * distribution, and the octave of each note was chosen from wherever the voice
   * happened to be, so a three-note phrase kept its own rhythm about 2% of the
   * time and its own shape rarely. Almost no restatement came out sounding like
   * the same phrase. There was enormous
   * repetition in the symbols and almost none of it reached the ear. A pattern
   * that cannot be recognised is not a pattern.
   */
  invent() {
    const moves = [];
    let at = this.root;
    // A phrase is not finished the moment it can get home — it is finished when
    // it has used what it has. Measured, closing at the first opportunity gave
    // phrases 2.2 notes long, so 45% of all the intervals in the piece were the
    // jump from one phrase to the next and there was no shape to recognise. Tied
    // to how much material is in play, the opening stays as bare as an alap's
    // and the phrases grow as the set unfolds, with nobody setting a length.
    const least = Math.max(2, this.admitted);

    for (let i = 0; i < least * 3; i++) {
      // Every member is reachable, not only the factor-neighbours.
      //
      // The factor graph connects pitches that share a factor, which is a
      // harmonic relation and has nothing to do with being near. Measured: from
      // 1/1 the four factor-neighbours lie 231, 267, 316 and 386 cents away, so
      // the smallest move the graph allows is a third, and stepwise motion is
      // impossible however it is weighted. Meanwhile the six pitch classes sit
      // only 85 to 267 cents apart — the notes for a step are there, the graph
      // just will not visit them in that order.
      //
      // The interval between any two members is still a ratio of factors, so
      // nothing positional creeps in. A move is still an exchange; it is simply
      // allowed to exchange more than one factor at a time when the ear wants
      // somewhere nearer.
      const options = allMoves(this.available(), at).filter((move) => i === 0 || !isRoot(move.to) || moves.length >= least);
      if (options.length === 0) break;

      // Two costs, both in bits, added.
      //
      // How simple the factor exchange is — pure number logic — and how far the
      // move goes in pitch. The second is the one honest constant in this
      // design, `nearness`: how many cents are worth one bit. It is not scale
      // thinking. Positions and degrees are scale thinking, and there are none
      // here. This is auditory streaming — a line is only heard as one line when
      // consecutive notes are close — and it is the same kind of fact as
      // roughness, which this project already measures and trusts.
      //
      // It is needed because a product set's neighbours are combinatorial, not
      // near: 1/1 and 5/3 differ by one factor and by 884 cents. Without this,
      // 37% of moves were leaps of a fourth or more against a corpus 11%, and
      // the line changed direction 78% of the time.
      //
      // Distance is the shortest way between pitch classes, which is what the
      // octave placement will do anyway.
      // What must be simple is the note's ratio **to the root**, not the ratio
      // between one note and the next.
      //
      // Measured, the interval's own simplicity cannot be what governs melody:
      // in this set the 85-cent gap is 21/20 at 8.7 bits and the 386-cent gap is
      // 5/4 at 4.3, so narrow intervals are complex and simple ones are wide.
      // They are anti-correlated, and no weighting of the two can satisfy both.
      // That is not a fact about product sets — it is the nature of just
      // intonation, since two simple ratios lying close together always differ
      // by something comma-like. It is the reason temperament was invented.
      //
      // The traditions that refuse temperament solve it the other way: against a
      // sounding drone, a note means its ratio to the root, and the step between
      // two notes is allowed to be an ugly number because nobody is listening to
      // it as a ratio. So the destination's distance from the root is the
      // harmonic cost, and how far the ear has to jump is the melodic one. Those
      // two are independent, and both can be satisfied at once.
      const weights = options.map((move) => {
        const leap = shortestCents(at.ratio, move.to.ratio);
        return Math.pow(2, -fromRoot(move.to) - leap / this.params.nearness);
      });
      // Drawn at the weights' own strength, not flattened to hit an entropy
      // target. That target has now destroyed three different structures in this
      // project — it flattened the tonic away, and here it silently reduced the
      // whole thing to a uniform random walk, because four options carry exactly
      // the 2.0 bits it was asking for and so it sampled uniformly every time.
      // A prior that is overridden whenever it says something is not a prior.
      const picked = draw(options, weights, this.random);

      moves.push(picked);
      at = picked.to;
      if (isRoot(at) && moves.length >= least) break;
    }

    // Not home yet: take the shortest way back. In a product set that is almost
    // always a single swap, because these graphs are densely connected.
    if (!isRoot(at) || moves.length < least) {
      const back = allMoves(this.available(), at).find((move) => isRoot(move.to));
      if (back) moves.push(back);
    }

    // A phrase is stored as what it *does*, not where it goes.
    //
    // Each note is kept as its ratio to the note the phrase started on, so the
    // phrase has no pitch of its own and can be played from anywhere. That is
    // one multiplication, and it is exact — no rounding, no nearest degree,
    // because a just interval transposed by a just interval is a just interval.
    //
    // This is where the material comes from. Measured before it: six pitch
    // classes, phrases pinned to the root at both ends, and therefore about six
    // possible phrases in the whole piece. Recurrence sat at 0.97 against a
    // corpus ceiling of 0.70 — not because the engine liked repeating itself but
    // because it had nothing else to say. Letting a shape be played from a
    // different pitch multiplies the material without enlarging the set, and it
    // is the ordinary way music does this: the same figure again, higher.
    const points = [];
    let rel = UNISON;
    for (const move of moves) {
      rel = octaveReduce(mul(rel, move.ratio));
      points.push(rel);
    }
    const counts = moves.map(() => draw(COUNTS, COUNTS.map((n) => 1 / n), this.random));
    return phraseFrom(points, counts);
  }

  /**
   * Where to play a phrase from.
   *
   * The phrase carries the shape; this carries the harmony. Same weighting as
   * everything else — simple against the root, and near where the voice already
   * is — applied one level up, to whole phrases rather than to notes. So the
   * slow layer of the music is a walk over the product set and the fast layer is
   * a shape being moved around on it.
   */
  chooseAnchor(part) {
    const options = this.available();
    if (options.length === 0) return this.root;
    const here = part.at ? part.at : this.root;
    const weights = options.map((point) => {
      const leap = shortestCents(here.ratio, point.ratio);
      return Math.pow(2, -fromRoot(point) - leap / this.params.nearness);
    });
    return draw(options, weights, this.random);
  }

  /**
   * A phrase descended from another one, one ratio away.
   *
   * The first attempt at this was a list of named devices — backwards, upside
   * down, a note added, a note dropped. Those are edits to a *word*; they are
   * what you would do to any string of symbols, and nothing about them comes
   * from the numbers. That is the same mistake as a table of weights, wearing
   * different clothes.
   *
   * There is only one move here. One note of the phrase goes to a different
   * member of the set, chosen by how near it is *in the lattice* — the
   * complexity of the ratio between where it was and where it goes, which is the
   * measure this project uses for everything. So a note is likeliest to shift by
   * a simple ratio and rarely by a strange one, and the size of the change is
   * the arithmetic distance, not a category.
   *
   * The same move, in the additive world where durations live: one note becomes
   * a different whole number of beats and another note gives up or takes on the
   * difference, so the phrase still occupies exactly the time it did. Which new
   * length is likely is again the complexity of the ratio — doubling a note is
   * one bit and therefore common, making it five-quarters as long is four bits
   * and therefore rare. Pitch and rhythm are varied by the same rule.
   *
   * Closure survives both, because only the inside of the phrase is touched.
   */
  vary(phrase) {
    const points = [...phrase.points];
    const counts = [...phrase.counts];

    if (this.random() < 0.5 && points.length >= 3) {
      const i = Math.floor(this.random() * (points.length - 1));
      const others = this.available().filter((m) => !equals(m.ratio, points[i]));
      if (others.length === 0) return null;
      const weights = others.map((m) => Math.pow(2, -complexity(div(m.ratio, points[i]))));
      points[i] = draw(others, weights, this.random).ratio;
    } else {
      const i = Math.floor(this.random() * counts.length);
      const options = COUNTS.filter((n) => n !== counts[i]);
      const weights = options.map((n) => Math.pow(2, -complexity(fromFraction(n, counts[i]))));
      const to = draw(options, weights, this.random);
      const spare = to - counts[i];
      const j = counts.findIndex((c, k) => k !== i && c - spare >= 1);
      if (j < 0) return null;
      counts[i] = to;
      counts[j] -= spare;
    }

    const made = phraseFrom(points, counts);
    return made.id === phrase.id ? null : made;
  }

  /**
   * How far one phrase is from another, in bits.
   *
   * Note against note: the complexity of the ratio between them, summed. Length
   * against length: the same measure on the whole numbers. Two identical phrases
   * are nought apart; a phrase and its child are a few bits apart; unrelated
   * phrases are far. It is the same quantity as a pitch's distance from the
   * root, which is what makes the next part work.
   */
  distance(a, b) {
    if (a === b) return 0;
    if (a.points.length !== b.points.length) return Infinity;
    let bits = 0;
    for (let i = 0; i < a.points.length; i++) bits += complexity(div(a.points[i], b.points[i]));
    for (let i = 0; i < a.counts.length; i++) bits += complexity(fromFraction(a.counts[i], b.counts[i]));
    return bits;
  }

  /**
   * The phrase to actually play, given the one the music meant to play.
   *
   * This is the answer to stepping back to the original, and it is the rule the
   * notes already follow, one level up. A note is drawn towards the root by
   * 2^-(its distance from the root); a phrase is drawn towards the one it is a
   * variation of by 2^-(its distance from that). Nothing else is needed:
   *
   *   - the original has distance nought, so its weight is 1 and it is always
   *     the likeliest thing to hear;
   *   - a child a few bits away is a few times less likely, so variants are
   *     heard as excursions rather than as replacements;
   *   - a grandchild is further still, so the family thins out by itself and the
   *     music cannot drift away and forget where it came from.
   *
   * So the piece departs from a shape and returns to it for exactly the reason
   * it departs from the root and returns to it. There is no counter deciding
   * when to go back, and no rule saying a variation must be answered. It goes
   * back because home is the most probable place to be.
   */
  near(intended) {
    const family = [...this.phrases.values()].filter((p) => this.distance(p, intended) < Infinity);
    const child = this.vary(intended);
    if (child && !this.phrases.has(child.id)) family.push(child);
    const weights = family.map((p) => Math.pow(2, -this.distance(p, intended)));
    const picked = draw(family, weights, this.random);
    if (!this.phrases.has(picked.id)) this.phrases.set(picked.id, picked);
    return picked;
  }

  /** A phrase to build a section out of: one already used, or a new one. */
  choosePhrase() {
    const known = [...this.phrases.values()];
    const fresh = this.invent();
    fresh.count = 1;
    const candidates = known.concat([fresh]);
    const weights = known.map((p) => p.count).concat([1]);

    const picked = sample(candidates, weights, this.params.surprise, this.random);
    const seen = this.phrases.get(picked.id);
    if (seen) seen.count += 1;
    else this.phrases.set(picked.id, picked);

    // Decay makes an old phrase less likely to be built into a new section; it
    // does not delete it. Deleting was quietly costing the piece its material:
    // there are only a handful of possible pitch-words at any stage of the
    // unfolding, so a forgotten phrase gets re-invented under the same name a
    // minute later with a freshly drawn rhythm.
    const keep = Math.exp(-1 / Math.max(1, this.params.memory));
    for (const phrase of this.phrases.values()) phrase.count = Math.max(0.05, phrase.count * keep);
    return seen ?? picked;
  }

  /**
   * A section: a short run of phrases, remembered and reused as one thing.
   *
   * The same machinery one level up, and deliberately the same — the object a
   * section stores is a word over phrases exactly as a phrase is a word over
   * moves. Nothing about the level is written into the mechanism, so there could
   * be a third if it turned out to be wanted. What differs between the levels is
   * only the rate: a phrase is a few seconds, a section is most of a minute, and
   * an ear that has heard AABA once will hear the return of A.
   */
  chooseSection() {
    const known = [...this.sections.values()];
    const length = 2 + Math.floor(this.random() * 3);
    const fresh = { phrases: Array.from({ length }, () => this.choosePhrase()), count: 1 };
    fresh.id = fresh.phrases.map((p) => p.id).join("/");

    const candidates = known.concat([fresh]);
    const weights = known.map((s) => s.count).concat([1]);
    const picked = sample(candidates, weights, this.params.surprise, this.random);

    const seen = this.sections.get(picked.id);
    if (seen) seen.count += 1;
    else this.sections.set(picked.id, picked);

    const keep = Math.exp(-1 / Math.max(1, this.params.memory / 4));
    for (const [k, section] of this.sections) {
      section.count *= keep;
      if (section.count < 0.05 && section !== picked) this.sections.delete(k);
    }
    return seen ?? picked;
  }

  /** The next phrase for a part, taken from its section. */
  nextPhrase(part) {
    if (!part.section || part.sectionStep >= part.section.phrases.length) {
      part.section = this.chooseSection();
      part.sectionStep = 0;
    }
    // What the section stores is the phrase it *means*; what gets played is
    // drawn from around it. So a section restated is recognisably the same
    // section, and most of the time literally the same, but it can come back
    // with one note moved — and the next time, moved back.
    const intended = part.section.phrases[part.sectionStep];
    part.sectionStep += 1;
    const phrase = this.near(intended);

    // A new note is admitted when the piece stops finding new things to say with
    // the ones it has. The threshold is the cube of how many notes are in play:
    // phrases available from k notes grow roughly as a power of k, so a linear
    // threshold exhausts a large set no slower than a small one — measured, that
    // unfolded the whole set inside the first minute and there was nothing to
    // hear. A cube gives each stage a length in proportion to what it contains.
    this.settled = intended.count > 1 ? this.settled + 1 : 0;
    if (this.settled >= Math.pow(this.admitted, 3) && this.admitted < this.order.length) {
      this.admitted += 1;
      this.settled = 0;
    }
    return phrase;
  }

  /**
   * Put a pitch class in a voice's range, nearest to where it already is.
   *
   * Register is not part of a note's identity — 5/4 is 5/4 whichever octave it
   * lands in — so which octave to use is not a musical choice and must not be
   * made by the same machinery that chooses the note. Letting it be a choice was
   * what made octave leaps the commonest move in earlier versions, because an
   * octave is the simplest ratio there is and therefore always won.
   */
  band(part) {
    const { registerLow, registerHigh } = this.params;
    const count = this.parts.length;
    const span = (registerHigh - registerLow) / count;
    // The range opens out as the piece unfolds, the way an alap climbs.
    const reach = 0.55 + 0.45 * this.progress();
    const low = registerLow + span * (count - 1 - part.index);
    return { low, high: low + span * reach };
  }

  /**
   * Which octave a phrase starts in — one decision for the whole phrase.
   *
   * Placing each note separately, nearest to wherever the voice already was, is
   * what destroyed the shape. The same three pitches came out rising one time
   * and falling the next, because an octave is not part of a pitch's identity
   * but it is most of a melody's. So the contour is fixed when the phrase is
   * invented and only the whole thing gets moved, to sit in the voice's band.
   */
  baseFor(phrase, anchor, part) {
    const { low, high } = this.band(part);
    const at = phrase.points.map((p, i) => cents(octaveReduce(mul(anchor.ratio, p))) + 1200 * phrase.octaves[i]);
    const middle = (Math.min(...at) + Math.max(...at)) / 2;
    return Math.round(((low + high) / 2 - middle) / 1200);
  }

  step(part) {
    if (!part.phrase || part.step >= part.phrase.points.length) {
      // Breathe. A phrase that runs straight into the next one is not a phrase,
      // it is a stream — measured, the longest silence anywhere in two minutes
      // was 0.78s and the median gap between onsets was 0.13s. Nothing was ever
      // over. The rest is drawn from the same prior as the note lengths, so it
      // is in the same units and lands on the same grid.
      if (part.phrase) {
        const unit = this.params.pulse / this.subdivision;
        // Long silences early on, closing up as the piece fills in. With two
        // notes in play there is nothing to be busy with, and the space is what
        // makes each new arrival audible.
        const rest = draw(COUNTS, COUNTS.map((n) => 1 / n), this.random);
        const roominess = 2.5 - 1.5 * this.progress();
        part.next += unit * rest * this.slowness(part) * roominess;
      }
      part.phrase = this.nextPhrase(part);
      part.step = 0;
      part.anchor = this.chooseAnchor(part);
      part.at = part.anchor;
      part.opening = true;
      part.base = this.baseFor(part.phrase, part.anchor, part);
      // Whether this part plays at all is now decided once per phrase. It used
      // to be rolled per note, which deleted a quarter of the notes of every
      // phrase at random — a four-note phrase survived whole only a third of the
      // time. Silence between phrases is breathing; holes shot through one are
      // just a different phrase every time.
      part.mute = this.random() >= this.params.density;
    }

    const i = part.step;
    part.step += 1;

    // The phrase's shape, multiplied by where it is being played from. The
    // result is a plain ratio against the root whether or not it is a member of
    // the set — the set is where the music is pulled towards, not a fence round
    // it, and a shape moved to a new pitch is the commonest thing in music.
    const octave = part.base + part.phrase.octaves[i];
    const placed = withOctaves(mul(part.anchor.ratio, part.phrase.points[i]), octave);
    // Multiplied first and placed after, so the shape survives the move exactly.
    // Reducing the product into an octave before applying the phrase's contour
    // wraps whichever notes cross the top, and the phrase comes out with one
    // interval different — measured, 8% of restatements.
    const pitch = octaveReduce(placed);
    part.at = { ratio: pitch };
    part.octave = octave;

    // How long, in whole grid units, so the parts share a beat. Taken from the
    // phrase, because the rhythm is half of what makes it recognisable.
    const unit = this.params.pulse / this.subdivision;
    const duration = unit * part.phrase.counts[i] * this.slowness(part);

    // Loud where the music is far from the root, quiet as it comes home, and a
    // touch more on the first note of a phrase. Measured before this, loudness
    // ran from 0.40 to 0.64 with a spread of 0.098 — near enough flat, which is
    // most of what "intense" meant. Distance is scaled against this set's own
    // range rather than against a fixed number, so it uses the whole span
    // whatever the set is.
    const reach = complexity(pitch);
    const far = Math.max(...this.set.map(fromRoot)) || 1;
    const velocity = Math.min(0.95, 0.26 + 0.5 * (reach / far) + (part.opening ? 0.14 : 0));
    part.opening = false;

    const event = {
      ratio: placed,
      start: part.next,
      duration: duration * 0.92,
      velocity,
      voice: part.index,
      tag: part.tag,
      mute: part.mute,
      phrase: part.phrase.id,
      bits: reach,
      arrived: equals(pitch, UNISON),
    };
    part.next += duration;
    return event;
  }

  /**
   * How much slower this part moves than the top one: 1, 1/2, 1/3 ...
   *
   * The harmonic series, which is where the pitches come from too. Parts moving
   * at the same speed give a texture with no foreground — everything equally
   * busy and equally important, which is a hard texture to write and one nobody
   * chose here. A bass that strides while the top fidgets is the ordinary
   * arrangement, and it also thins the stream out.
   */
  slowness(part) {
    return part.index + 1;
  }

  /** The root, sounding underneath. It is what makes the ratios audible. */
  droneDue(at) {
    if (!this.params.drone || at < this.droneNext) return null;
    this.droneNext = at + this.params.pulse * 16;
    // Root and fifth, the way a tanpura is strung. The fifth is not taken from
    // the product set and does not have to be in it — a drone is not melodic
    // material, it is the reference everything else is heard against, and 3/2 is
    // the reference the ear locks onto most readily.
    // Register and level, both measured by rendering the synth offline rather
    // than guessed — the previous settings were guessed twice and were wrong
    // twice.
    //
    // It used to sit two octaves down, at 66, 99 and 132 Hz. The melody's own
    // range starts at 118 Hz, so the drone was entirely *below* the music, and
    // 66 Hz is where a laptop speaker stops reproducing anything at all. Against
    // the melody it measured 10 dB down overall and 13 dB down in the range a
    // small speaker actually passes. It was in the signal and it was inaudible,
    // which is why three fixes to the code path in a row changed nothing.
    //
    // An octave up puts it at 132, 198 and 264 Hz, inside the music rather than
    // under it, which is where a tanpura sits. At these levels it measures 7 dB
    // below the melody in the band that carries — present, not competing.
    // The root, and the root again an octave up. No fifth.
    //
    // A tanpura's second string is not a fifth by law — it is the note the raga
    // leans on, and it is retuned when the raga has no Pa. This set has no Pa:
    // 3/2 is not a member of the hexany, and it never will be, because the
    // hexany is 1/1, 7/6, 5/4, 35/24, 5/3, 7/4. Measured against the set it was
    // the worst string available. It sits 49 cents from 35/24 — a beating clash
    // with a note the melody actually plays, where nothing else in the set comes
    // within 84 cents of anything. And it was the only candidate with no
    // consonance anywhere: every member of the set locks with itself when the
    // melody lands on it, and 3/2 locks with nothing, because it is nothing the
    // melody can land on.
    //
    // Octaves of the root are the honest drone for this design. The whole reason
    // a melodic step is allowed to be an ugly number is that each note is heard
    // against 1/1, so 1/1 is what should be sounding. If the shimmer of a second
    // string is wanted later, it has to be a member of the set.
    return [
      { ratio: withOctaves(UNISON, -1), velocity: 0.3, sustain: 0.25, tag: "drone" },
      { ratio: withOctaves(UNISON, 0), velocity: 0.21, sustain: 0.175, tag: "drone" },
    ];
  }

  maybeMove() {
    return false; // the root does not move. That is the whole idea.
  }

  perform(seconds) {
    const events = [];
    while (true) {
      const part = this.parts.reduce((soonest, p) => (p.next < soonest.next ? p : soonest));
      if (part.next >= seconds) break;
      const event = this.step(part);
      if (!event) break;
      if (!event.mute) events.push(event);
    }
    events.sort((a, b) => a.start - b.start);
    return { events, moves: [] };
  }
}

/** Draw in proportion to weight, as it stands. */
function draw(options, weights, random) {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let ticket = random() * total;
  for (let i = 0; i < options.length; i++) {
    ticket -= weights[i];
    if (ticket <= 0) return options[i];
  }
  return options[options.length - 1];
}

/** Draw in proportion to weight, sharpened so the entropy is `bits`. */
function sample(options, weights, bits, random) {
  const beta = solve(weights, bits);
  const scaled = weights.map((w) => Math.pow(Math.max(1e-12, w), beta));
  const total = scaled.reduce((sum, w) => sum + w, 0);
  let ticket = random() * total;
  for (let i = 0; i < options.length; i++) {
    ticket -= scaled[i];
    if (ticket <= 0) return options[i];
  }
  return options[options.length - 1];
}

function solve(weights, bits) {
  if (weights.length <= 1) return 1;
  if (entropy(weights, 0) <= bits) return 0;
  let low = 0;
  let high = 1;
  while (entropy(weights, high) > bits && high < 1024) high *= 2;
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    if (entropy(weights, mid) > bits) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function entropy(weights, beta) {
  const scaled = weights.map((w) => Math.pow(Math.max(1e-12, w), beta));
  const total = scaled.reduce((sum, w) => sum + w, 0);
  let bits = 0;
  for (const w of scaled) {
    const p = w / total;
    if (p > 0) bits -= p * Math.log2(p);
  }
  return bits;
}

/**
 * The octave for each note of a phrase, so that it has a fixed shape.
 *
 * Each note goes wherever it is nearest to the one before, starting from the
 * root, and never further than an octave either side of where it began. The
 * result is not a musical choice — it is the smoothest reading of the pitches
 * the phrase already has, worked out once so that every statement of the phrase
 * rises and falls in the same places.
 */
function contourFor(points) {
  const octaves = [];
  let before = 0; // the pitch the phrase is played from, wherever that is
  for (const point of points) {
    let best = 0;
    let gap = Infinity;
    for (let o = -1; o <= 1; o++) {
      const at = cents(point) + 1200 * o;
      if (Math.abs(at - before) < gap) {
        gap = Math.abs(at - before);
        best = o;
      }
    }
    octaves.push(best);
    before = cents(point) + 1200 * best;
  }
  return octaves;
}

/** A phrase, built from its notes and their lengths. */
function phraseFrom(points, counts) {
  // The rhythm is part of the phrase's name, because two phrases on the same
  // notes with different lengths are two phrases.
  return { points, counts, count: 1, octaves: contourFor(points), id: key(points) + " " + counts.join(".") };
}

/** The interval from each note of a phrase to the next. */
function stepsOf(points) {
  const steps = [];
  let before = UNISON;
  for (const point of points) {
    steps.push(div(point, before));
    before = point;
  }
  return steps;
}

/** And back again. */
function pointsOf(steps) {
  const points = [];
  let at = UNISON;
  for (const step of steps) {
    at = octaveReduce(mul(at, step));
    points.push(at);
  }
  return points;
}

/** The shorter way between two pitch classes, in cents. */
function shortestCents(a, b) {
  const d = Math.abs(cents(octaveReduce(div(b, a))));
  return Math.min(d, 1200 - d);
}

function key(ratios) {
  return ratios.map((r) => r.join(",")).join("|");
}
