// A piece with a fixed root, made of ratios.
//
// The root sounds throughout, so every pitch is heard against it — which is the
// only way small differences in ratio become audible at all. The pitch material
// is a combination product set: a pitch is a set of factors, a move swaps one
// factor for another, and the interval of that move is the ratio of the two
// factors. No scale degrees exist anywhere. A phrase leaves the root and comes
// back, and arrival is landing on 1/1. Tension is how many bits a pitch costs
// against the root, which is a fact about the numbers rather than a setting.
//
// The parameters:
//
//   pulse     how fast
//   surprise  how adventurous the choice of move is
//   memory    how long a phrase stays in the vocabulary
//   voices    how many parts
//   density   how much of the time a part plays
//
// DESIGN §§12–23 for why the piece is shaped this way.

import { mul, div, cents, equals, octaveReduce, withOctaves, complexity, fromFraction } from "../../src/ratio.js";
import { productSet, allMoves, isRoot, fromRoot } from "./cps.js";

export const DEFAULTS = {
  pulse: 0.32,
  surprise: 2.0,
  nearness: 200, // cents worth one bit — how much the ear wants a line to stay put
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
    // While somebody is playing, the parts hold back. Two things making music at
    // once without listening to each other is not an accompaniment.
    this.quietUntil = 0;
    this.wanted = null;

    // Progressive disclosure. The piece does not begin with its whole pitch set;
    // it admits them one at a time, simplest against the root first, the way an
    // alap unfolds a raga. So the most remote note arrives last and lands as an
    // event, and the opening has almost nothing in it.
    this.order = [...this.set].sort((a, b) => fromRoot(a) - fromRoot(b));
    this.admitted = Math.min(this.order.length, this.openingSize());
    this.settled = 0;
    // Which words of notes the piece has stated, ignoring how long the notes
    // were held. This is what decides whether it has said something new; see
    // `nextPhrase`. It survives a fold-back — a second unfolding is over material
    // the piece already has — but not a change of set, where the old words are
    // not words any more.
    this.saidWords = new Map();
  }

  /**
   * The fewest of the simplest notes that have a step between them.
   *
   * In a product set the simplest members are the ones furthest apart, so the
   * first few notes admitted may have no small interval between them at all and
   * a line drawn from them can only leap. What counts as a step is already
   * decided by `nearness`, so no new number is needed.
   */
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
   * The phrase ends when it reaches the root again, so closure is not a rule
   * imposed on it but the condition for it being finished.
   *
   * A phrase is invented once and then it is a fixed object: pitches, note
   * lengths and the shape of its ups and downs, all three. A pattern that cannot
   * be recognised is not a pattern, and redrawing any of the three on each
   * statement is what stops it being recognised.
   */
  invent() {
    const moves = [];
    let at = this.root;
    // A phrase is not finished the moment it can get home — it is finished when
    // it has used what it has. Tied to how much material is in play, the opening
    // stays as bare as an alap's and the phrases grow as the set unfolds, with
    // nobody setting a length.
    const least = Math.max(2, this.admitted);

    for (let i = 0; i < least * 3; i++) {
      // Every member is reachable, not only the factor-neighbours. The factor
      // graph connects pitches that share a factor, which is a harmonic relation
      // and has nothing to do with being near — from 1/1 its nearest neighbour
      // is 231 cents away, so stepwise motion would be impossible however it is
      // weighted. The interval between any two members is still a ratio of
      // factors, so nothing positional creeps in; a move is simply allowed to
      // exchange more than one factor at a time.
      const options = allMoves(this.available(), at).filter((move) => i === 0 || !isRoot(move.to) || moves.length >= least);
      if (options.length === 0) break;

      // Two costs, both in bits, added: how far the destination is from the
      // root, and how far the move goes in pitch. The second is measured in
      // `nearness`, the cents worth one bit — auditory streaming, the fact that
      // a line is only heard as one line when consecutive notes are close.
      //
      // They have to be separate. In this set the 85-cent gap is 21/20 at 8.7
      // bits and the 386-cent gap is 5/4 at 4.3: narrow intervals are complex
      // and simple ones are wide, and no weighting of one quantity can satisfy
      // both. That is the nature of ratios, since two simple ratios lying close
      // together always differ by something comma-like. Drone-based traditions
      // solve it the other way round — against a sounding root a note means its
      // ratio to the root, and the step between two notes is allowed to be an
      // ugly number because nobody is listening to it as a ratio.
      const weights = options.map((move) => {
        const leap = shortestCents(at.ratio, move.to.ratio);
        return Math.pow(2, -fromRoot(move.to) - leap / this.params.nearness);
      });
      // Drawn at the weights' own strength, not flattened to hit an entropy
      // target. A prior that is overridden whenever it says something is not a
      // prior — see DESIGN §12.
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

    // A phrase is stored as what it *does*, not where it goes: each note as its
    // ratio to the note the phrase started on. So the phrase has no pitch of its
    // own and can be played from anywhere, exactly — a just interval transposed
    // by a just interval is a just interval. That is where the material comes
    // from, since a set this size holds only a handful of phrases pinned to the
    // root at both ends.
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
   * the notes — simple against the root, and near where the voice already is —
   * applied to whole phrases. So the slow layer of the music is a walk over the
   * product set and the fast layer is a shape being moved around on it.
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
   * There is only one move. Either one note goes to a different member of the
   * set, drawn by the complexity of the ratio between where it was and where it
   * goes; or one note becomes a different whole number of beats and another
   * gives up or takes on the difference, drawn by the complexity of that ratio.
   * Pitch and rhythm are varied by the same rule, and the phrase still occupies
   * exactly the time it did. Closure survives both, because only the inside of
   * the phrase is touched.
   *
   * Not a list of named devices — backwards, upside down, a note added. Those
   * are edits to a *word*, and nothing about them comes from the numbers.
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
      // The compensating note has to stay a sensible length. The phrase's total
      // is invariant, so nothing stops one note absorbing the others over many
      // generations — and a note lasting 43 beats is a prime the ratio type does
      // not carry, so measuring the distance to it would throw.
      const longest = COUNTS[COUNTS.length - 1];
      const j = counts.findIndex((c, k) => k !== i && c - spare >= 1 && c - spare <= longest);
      if (j < 0) return null;
      counts[i] = to;
      counts[j] -= spare;
    }

    const made = phraseFrom(points, counts);
    if (made.id === phrase.id) return null;
    // A three-note shape can reach all-1/1 in two moves through an intermediate
    // that is legal, so guarding only where phrases come in would not hold.
    if (!departs(points)) return null;
    // A child inherits its parent's favour, and with it the right to be heard at
    // all. Without this a played shape is stated once and can go nowhere: every
    // variation of it still contains the notes that were played, so the rule
    // that a phrase must be built from the notes currently in play throws all of
    // them away. Favour fades on its own, so a line of descent is absorbed
    // rather than cut.
    made.favour = phrase.favour;
    made.from = phrase.from ?? phrase.id;
    return made;
  }

  /**
   * How far one phrase is from another, in bits.
   *
   * Note against note, and length against length: the complexity of the ratio
   * between them, summed. It is the same quantity as a pitch's distance from the
   * root, which is what makes `near` work.
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
   * The rule the notes already follow, one level up. A note is drawn towards the
   * root by 2^-(its distance from the root); a phrase is drawn towards the one
   * it is a variation of by 2^-(its distance from that). The original has
   * distance nought and is always likeliest; a child is a few times less likely;
   * a grandchild further still, so the family thins out by itself. The piece
   * departs from a shape and returns to it for exactly the reason it departs
   * from the root and returns to it — no counter decides when to go back.
   */
  near(intended) {
    // Only shapes made of notes currently in play — otherwise folding back would
    // change nothing audible, since the vocabulary keeps every phrase it ever
    // invented. Pinning is the listener saying "that one", and it is the only
    // way anything outside the music reaches in: a pinned shape is home
    // everywhere, so it can arrive in the middle of a family it has no relation
    // to.
    let family = [...this.phrases.values()].filter(
      (p) => p.pinned || p.favour > 0 || (this.fits(p) && this.distance(p, intended) < Infinity),
    );
    // Nothing fits: write something that does, rather than playing the intention
    // anyway and drifting back into material the piece has just withdrawn.
    if (family.length === 0) return this.invent();
    const child = this.vary(intended);
    if (child && !this.phrases.has(child.id)) family.push(child);

    // Favour is distance forgiven, in bits, and it fades. Pinning is the same
    // quantity held open: a pinned shape is simply always home.
    const weights = family.map((p) =>
      Math.pow(2, -(p.pinned ? 0 : Math.max(0, this.distance(p, intended) - p.favour))),
    );
    const picked = draw(family, weights, this.random);
    if (!this.phrases.has(picked.id)) this.phrases.set(picked.id, picked);
    return picked;
  }

  /** A phrase to build a section out of: one already used, or a new one. */
  choosePhrase() {
    const known = [...this.phrases.values()].filter((p) => p.pinned || p.favour > 0 || this.fits(p));
    const fresh = this.invent();
    fresh.count = 1;
    const candidates = known.concat([fresh]);
    const weights = known.map((p) => p.count).concat([1]);

    const picked = sample(candidates, weights, this.params.surprise, this.random);
    const seen = this.phrases.get(picked.id);
    if (seen) seen.count += 1;
    else this.phrases.set(picked.id, picked);

    // Decay makes an old phrase less likely to be built into a new section; it
    // does not delete it. There are only a handful of possible pitch-words at
    // any stage of the unfolding, so a deleted phrase gets re-invented under the
    // same name a minute later with a freshly drawn rhythm.
    const keep = Math.exp(-1 / Math.max(1, this.params.memory));
    for (const phrase of this.phrases.values()) {
      if (phrase.pinned) continue; // pinned is exactly this: it stops fading
      phrase.count = Math.max(0.05, phrase.count * keep);
    }
    return seen ?? picked;
  }

  /**
   * A section: a short run of phrases, remembered and reused as one thing.
   *
   * The same machinery one level up, and deliberately the same — a section is a
   * word over phrases exactly as a phrase is a word over moves. Nothing about
   * the level is written into the mechanism. What differs is only the rate: a
   * phrase is a few seconds, a section is most of a minute.
   */
  chooseSection() {
    // Something was just played. Say it, answer it, say it again.
    if (this.wanted) {
      const shape = this.wanted;
      this.wanted = null;
      const strongest = Math.max(1, ...[...this.sections.values()].map((s) => s.count));
      const section = { phrases: [shape, this.choosePhrase(), shape], count: strongest };
      section.id = section.phrases.map((phrase) => phrase.id).join("/");
      const seen = this.sections.get(section.id);
      if (seen) {
        seen.count += 1;
        return seen;
      }
      this.sections.set(section.id, section);
      return section;
    }

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

    // Settled means the piece just said something it has said before. It has to
    // be about what was *played* rather than about `count`, which rises when a
    // phrase is picked to build a section and says nothing about how often that
    // section is then heard. And it is about the *notes*: what this gate decides
    // is whether to admit another note, and a fresh rhythm over the same notes
    // is no evidence either way.
    phrase.said = (phrase.said ?? 0) + 1;
    const word = key(phrase.points);
    const saidBefore = this.saidWords.get(word) ?? 0;
    this.saidWords.set(word, saidBefore + 1);
    this.settled = saidBefore > 0 ? this.settled + 1 : 0;

    const fade = Math.exp(-1 / Math.max(1, this.params.memory));
    for (const known of this.phrases.values()) {
      if (known.favour > 0) known.favour = known.favour > 0.05 ? known.favour * fade : 0;
    }

    // One counter, and the fold-back is the other branch of it. Settling long
    // enough means the piece has run out of things to say with what it has: if
    // there is something left to admit, admit it; if everything is already in
    // play, return to what it opened with and unfold again, over the vocabulary
    // it has built. The alternative was a clock, and this project has no clocks.
    //
    // The threshold is the cube of how many notes are in play, because the
    // phrases available from k notes grow roughly as a power of k — a linear
    // threshold exhausts a large set no slower than a small one.
    if (this.settled >= Math.pow(this.admitted, 3)) {
      this.admitted = this.admitted < this.order.length ? this.admitted + 1 : this.openingSize();
      this.settled = 0;
    }
    return phrase;
  }

  /** The band of pitch this voice sits in, in cents. */
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
   * Register is not part of a note's identity, so which octave to use is not a
   * musical choice and must not be made by the machinery that chooses the note:
   * an octave is the simplest ratio there is, so as a choice it always won and
   * octave leaps became the commonest move. But an octave is most of a melody's
   * identity, so placing each note separately makes the same three pitches come
   * out rising one time and falling the next. The contour is fixed when the
   * phrase is invented, and only the whole thing gets moved.
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
      // it is a stream. The rest is drawn from the same prior as the note
      // lengths, so it is in the same units and lands on the same grid.
      if (part.phrase) {
        const unit = this.params.pulse / this.subdivision;
        // Long silences early on, closing up as the piece fills in. With two
        // notes in play there is nothing to be busy with, and the space is what
        // makes each new arrival audible.
        const rest = draw(COUNTS, COUNTS.map((n) => 1 / n), this.random);
        const roominess = 2.5 - 1.5 * this.progress();
        // Rounded, so the rest is a whole number of beats like every other
        // duration here. Scaling by a fractional roominess pushed the part off
        // the shared grid and left it there for good.
        part.next += unit * Math.max(1, Math.round(rest * roominess)) * this.slowness(part);
      }
      part.phrase = this.nextPhrase(part);
      part.step = 0;
      part.anchor = this.chooseAnchor(part);
      part.at = part.anchor;
      part.opening = true;
      part.base = this.baseFor(part.phrase, part.anchor, part);
      // Whether this part plays at all is decided once per phrase. Rolled per
      // note it deleted a quarter of the notes of every phrase at random:
      // silence between phrases is breathing, but holes shot through one are
      // just a different phrase every time.
      part.mute = this.random() >= this.params.density;
    }

    const i = part.step;
    part.step += 1;

    // The phrase's shape, multiplied by where it is being played from. The
    // result is a plain ratio against the root whether or not it is a member of
    // the set — the set is where the music is pulled towards, not a fence round
    // it. Multiplied first and placed after, so the shape survives the move
    // exactly: reducing the product into an octave first wraps whichever notes
    // cross the top and changes one of the phrase's intervals.
    const octave = part.base + part.phrase.octaves[i];
    const placed = withOctaves(mul(part.anchor.ratio, part.phrase.points[i]), octave);
    const pitch = octaveReduce(placed);
    part.at = { ratio: pitch };
    part.octave = octave;

    // How long, in whole grid units, so the parts share a beat. Taken from the
    // phrase, because the rhythm is half of what makes it recognisable.
    const unit = this.params.pulse / this.subdivision;
    const duration = unit * part.phrase.counts[i] * this.slowness(part);

    // Loud where the music is far from the root, quiet as it comes home, and a
    // touch more on the first note of a phrase. Distance is scaled against this
    // set's own range rather than a fixed number, so it uses the whole span
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
   * at the same speed give a texture with no foreground; a bass that strides
   * while the top fidgets is the ordinary arrangement, and it also thins the
   * stream out.
   */
  slowness(part) {
    return part.index + 1;
  }

  /**
   * The root, sounding underneath. It is what makes the ratios audible.
   *
   * Struck once and then held for as long as the piece lasts. These resonators
   * are driven by a continuous trickle of noise while a note is held, so they
   * genuinely sustain and never need renewing — and a strike on a fixed period
   * is a metronome, which is what the old sixteen-pulse renewal made it.
   *
   * The root, and the root again an octave up. No 3/2: a tanpura's second string
   * is not a fifth by law, it is the note the raga leans on, and this set has no
   * 3/2 in it. Against this hexany 3/2 sits 49 cents from 35/24 — a beating
   * clash with a note the melody plays — and locks with nothing, because it is
   * nothing the melody can land on. The whole reason a melodic step is allowed
   * to be an ugly number is that each note is heard against 1/1, so 1/1 is what
   * should be sounding. See DESIGN §15.
   *
   * The register and levels were settled by rendering the synth offline. An
   * octave lower put the drone entirely underneath the melody and below where a
   * laptop speaker reproduces anything; here it sits among the music, 7 dB below
   * the melody in the band that carries.
   */
  droneDue(at) {
    if (!this.params.drone || at < this.droneNext) return null;
    this.droneNext = Infinity;
    return [
      { ratio: withOctaves(UNISON, -1), velocity: 0.3, sustain: 0.2, tag: "drone" },
      { ratio: withOctaves(UNISON, 0), velocity: 0.21, sustain: 0.14, tag: "drone" },
    ];
  }

  /**
   * Keep something the player played.
   *
   * It arrives as absolute pitches with times on them, and a phrase here is a
   * word of ratios with note lengths and a contour — the same object, so nothing
   * has to be approximated. Each note is divided by the first, the gaps between
   * onsets are rounded to whole beats of the engine's grid, and the ups and
   * downs are taken from what was played rather than recomputed, because the
   * point is to keep what was meant.
   *
   * It comes in pinned, which already means "at distance nought from wherever
   * the music is" and exempts it from the rule that a phrase must be built from
   * the notes currently in play. Somebody who plays a note has said they want
   * it. See DESIGN §21.
   */
  listen(played) {
    if (!played || played.length < 2) return null;
    const unit = this.params.pulse / this.subdivision;
    const home = played[0].ratio;

    const points = played.map((note) => octaveReduce(div(note.ratio, home)));
    const octaves = played.map((note, i) =>
      Math.round((cents(div(note.ratio, home)) - cents(points[i])) / 1200),
    );
    const counts = played.map((note, i) => {
      const span = i + 1 < played.length ? played[i + 1].at - note.at : note.held ?? unit;
      return Math.max(1, Math.round(span / unit));
    });

    // Somebody tapping the same pad four times has played a rhythm, and a rhythm
    // on one pitch is not a shape this engine has anywhere to put. Left in, it
    // takes over: every note of it is 1/1, so it is the one shape that can be
    // played with *any* set of notes and no fold-back ever excludes it — and
    // over a drone sounding that same 1/1, it is a metronome.
    if (!departs(points)) return null;

    const phrase = phraseFrom(points, counts, octaves);
    const known = this.phrases.get(phrase.id) ?? phrase;
    // Four bits nearer than it is. A phrase and the variants it is heard against
    // sit two to four bits apart, so four puts a played shape ahead of them
    // without silencing them — it leads, it does not take over — and it fades at
    // the same rate as everything else, so it is absorbed rather than installed.
    known.favour = 4;
    known.from = known.id;
    known.said = (known.said ?? 0) + 1;
    // Level with whatever the piece is most about. The vocabulary is drawn on in
    // proportion to use, and left at one this had a running start against it and
    // was never chosen again.
    known.count = Math.max(1, ...[...this.phrases.values()].map((p) => p.count));
    this.phrases.set(known.id, known);

    // And the piece means to play it. Adding it to the vocabulary is not enough:
    // phrase choice is a draw weighted by distance from what was *meant*, and a
    // played shape is far from anything the engine wrote. A shape somebody
    // played is not a candidate to be measured against what the music meant — it
    // is a new thing for the music to mean, and from there everything else
    // follows on its own.
    this.wanted = known;
    for (const part of this.parts) part.section = null;
    return known;
  }

  /** Is every note of this shape one of the notes currently in play? */
  fits(phrase) {
    const inPlay = this.available();
    return phrase.points.every((point) => inPlay.some((member) => equals(member.ratio, point)));
  }

  /** Hold a shape in the vocabulary, or let it go again. */
  pin(id, on = true) {
    const phrase = this.phrases.get(id);
    if (phrase) phrase.pinned = on;
    return phrase;
  }

  /**
   * What the piece is made of just now, for looking at.
   *
   * The vocabulary is the interesting thing to show: this engine's whole claim
   * is that it has one, and that it comes back to it. Weight is how strongly a
   * shape is currently drawn on, against whichever is drawn on most.
   */
  describe() {
    const phrases = [...this.phrases.values()].sort((a, b) => b.count - a.count);
    const most = Math.max(1e-9, ...phrases.map((p) => p.count));
    return {
      admitted: this.admitted,
      of: this.order.length,
      progress: this.progress(),
      phrases: phrases.map((phrase) => ({
        id: phrase.id,
        notes: phrase.points,
        counts: phrase.counts,
        weight: phrase.count / most,
        pinned: phrase.pinned,
      })),
      parts: this.parts.map((part) => ({
        index: part.index,
        playing: part.phrase ? part.phrase.id : null,
        muted: part.mute,
        anchor: part.anchor ? part.anchor.ratio : null,
        step: part.step,
        length: part.phrase ? part.phrase.points.length : 0,
      })),
    };
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
 * root, and never further than an octave either side. Not a musical choice — the
 * smoothest reading of the pitches the phrase already has, worked out once so
 * that every statement rises and falls in the same places.
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
function phraseFrom(points, counts, octaves) {
  return {
    points,
    counts,
    count: 1,
    pinned: false,
    favour: 0, // bits nearer than it really is, and fading
    octaves: octaves ?? contourFor(points),
    // The rhythm is part of the name, because two phrases on the same notes with
    // different lengths are two phrases.
    id: key(points) + " " + counts.join("."),
  };
}

/**
 * Does this shape go anywhere?
 *
 * The one thing a phrase in this engine is: a departure and a return. A word of
 * notes that are all the same pitch has no departure, so there is nothing for a
 * variation to vary and nothing for a return to return to.
 */
function departs(points) {
  return points.some((point) => !equals(point, points[0]));
}

/** The shorter way between two pitch classes, in cents. */
function shortestCents(a, b) {
  const d = Math.abs(cents(octaveReduce(div(b, a))));
  return Math.min(d, 1200 - d);
}

function key(ratios) {
  return ratios.map((r) => r.join(",")).join("|");
}
