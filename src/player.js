// Letting it play by itself.
//
// The first version of this was one note after another, each chosen fresh
// against the ones before it. That is a scored random walk, and it sounds like
// one — nothing ever came back, so there was nothing to recognise.
//
// Three things fix that, and all three are the design's own answers:
//
//   a pulse      events land on a grid instead of arriving whenever
//   layers       separate voices, each with its own register and its own
//                period, so the ear can follow a part rather than a stream
//   gestures     shapes that are kept and played again, transposed
//
// The periods come out of the harmony itself (see rhythm.js), so when the chord
// is 4:5:6 the layers move in 4, 5 and 6 — and come back into line every 60
// pulses, which is a phrase nobody had to specify.

import { chooseNext } from "./choose.js";
import { div, cents, complexity } from "./ratio.js";
import { periodsFor, patternFor } from "./rhythm.js";
import { GesturePool, applyMove } from "./gesture.js";
import { HarmonicField } from "./field.js";

export const PLAYER_DEFAULTS = {
  pulse: 0.26, // seconds per step of the grid
  swing: 0.06, // how much each event is nudged off the grid
  layers: 3,
  hold: 0.9, // note length, as a fraction of the layer's own period
  velocity: 0.7,
  velocitySpread: 0.18,
  registerLow: -1200,
  registerHigh: 1600,
  layerSpread: 0.75, // 0 all layers share the register, 1 they are separate bands
  bars: 2, // how long each layer's rhythm is, as a multiple of its own number
  density: 0.4, // how full that rhythm is
  accent: 0.3, // how much louder the first beat of a cycle is
  dynamics: 0.5, // how much a section swells and recedes; 0 is perfectly flat
  recurrence: 0.55, // how often a layer replays a remembered shape
  gestureLength: 5, // events in a shape, whatever the phrase happens to be
  gestureMemory: 90,
  wanderLimit: 26, // abandon a shape that has carried a layer this far out
  restChance: 0.12, // how often a layer simply does not play its turn
  fieldSize: 7, // how many pitches are in play at once
  harmonicRhythm: 4, // phrases before the whole field moves somewhere else
  fieldHoming: 0.35, // how far the harmony is allowed to wander from home
};

export class Player {
  constructor({ sonority, now, play, release, instrument, params = {} }) {
    this.sonority = sonority;
    this.now = now;
    this.play = play;
    this.release = release;
    this.instrument = instrument;

    this.params = { ...PLAYER_DEFAULTS, ...params };
    this.gestures = new GesturePool({ memory: this.params.gestureMemory });
    this.field = new HarmonicField({
      size: this.params.fieldSize,
      homing: this.params.fieldHoming,
    });
    this.phrasesHeld = 0;

    this.running = false;
    this.timer = null;
    this.holding = new Map(); // voice id -> when to let go
    this.step = 0;
    this.periods = [];
    this.phrase = 1;
    this.voices = [];
    this.lastChoice = null;
    this.lastCandidates = [];
    this.random = Math.random;

    this.rebuildLayers();
  }

  setParams(values) {
    const before = this.params.layers;
    Object.assign(this.params, values);
    this.gestures.memory = this.params.gestureMemory;
    this.field.setParams({ size: this.params.fieldSize, homing: this.params.fieldHoming });
    if (this.params.layers !== before) this.rebuildLayers();
  }

  /**
   * One voice per layer, each with its own slice of the register.
   *
   * A part that always lives in the same place and always moves at the same
   * speed is recognisable whatever notes it plays, which is most of what makes
   * a texture readable.
   */
  rebuildLayers() {
    const count = Math.max(1, Math.round(this.params.layers));
    this.voices = Array.from({ length: count }, (_, index) => ({
      index,
      at: null, // where this voice currently is, as a ratio
      period: 2,
      rhythm: null, // its onset pattern, cycle length and gaps
      offset: 0,
      recording: [],
      replaying: null,
      replayAt: 0,
      tag: `layer${index}`,
    }));
    this.retune();
  }

  /** Take the rhythm from the chord that is sounding. */
  retune() {
    const reading = this.sonority.read(this.now());
    const sounding = reading.sounding.map((note) => note.ratio);

    this.periods = periodsFor(sounding, this.voices.length);

    // Each layer gets a pattern rather than a plain "every N pulses". Even
    // spacing was what made the whole thing an undifferentiated stream: the
    // parts were polyrhythmic but nothing inside a part was uneven, so there
    // was no rhythm to recognise, only a texture.
    this.voices.forEach((voice, index) => {
      voice.period = this.periods[index];
      // Sparser at the bottom, busier at the top. Besides being how music
      // usually works, it stops two layers that happen to share a cycle length
      // from producing the identical pattern and locking together.
      const tilt = 0.55 + (0.6 * index) / Math.max(1, this.voices.length - 1);
      voice.rhythm = patternFor(voice.period, {
        bars: this.params.bars,
        density: this.params.density * tilt,
      });
      // Layers start together, so the phrase has a downbeat.
      voice.offset = 0;
    });

    // The phrase is the longest layer's cycle, not where every layer realigns.
    // Realignment is the lowest common multiple, which for cycles of 12, 10 and
    // 8 is 120 pulses — half a minute, far too long to be heard as a unit, and
    // it made sections run for two minutes. Full realignment still happens; it
    // is a bonus rather than the thing structure is counted in.
    this.phrase = Math.max(...this.voices.map((voice) => voice.rhythm.steps));
  }

  /**
   * Where we are in the swell of a section: nothing at the edges, most in the
   * middle.
   *
   * A section is the time the harmonic field stays put, so the music leans into
   * a harmony and then eases off it before moving somewhere else. Without this
   * every phrase carries identical weight, which reads as flat however good the
   * notes are.
   */
  intensity() {
    const span = Math.max(1, Math.round(this.params.harmonicRhythm));
    const within = this.phrase > 0 ? (this.step % this.phrase) / this.phrase : 0;
    const through = clamp((this.phrasesHeld + within) / span, 0, 1);
    return 0.5 - 0.5 * Math.cos(2 * Math.PI * through);
  }

  /** The slice of register this layer is allowed to use. */
  bandFor(voice) {
    const { registerLow, registerHigh, layerSpread } = this.params;
    const count = this.voices.length;
    if (count === 1 || layerSpread <= 0) return { low: registerLow, high: registerHigh };

    const span = registerHigh - registerLow;
    const width = span / count;
    // Bands overlap when the spread is low and separate when it is high.
    const overlap = (1 - layerSpread) * width;
    const low = registerLow + width * voice.index - overlap;
    return {
      low: Math.max(registerLow, low),
      high: Math.min(registerHigh, low + width + overlap * 2),
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.retune();
    this.tick();
  }

  stop({ silence = true } = {}) {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = null;
    if (!silence) return;
    for (const id of this.holding.keys()) this.release(id);
    this.holding.clear();
  }

  tick() {
    if (!this.running) return;
    this.advance();

    const jitter = 1 + (this.random() * 2 - 1) * this.params.swing;
    this.timer = setTimeout(() => this.tick(), this.params.pulse * jitter * 1000);
  }

  /** One pulse of the grid. Exposed so it can be driven by hand or by a test. */
  advance() {
    const now = this.now();
    this.releaseExpired(now);

    // Phrase boundary: take a fresh set of periods from whatever the harmony
    // has become. Shapes are not tied to this — see closeGesture.
    if (this.step % this.phrase === 0) {
      this.retune();

      // Harmonic rhythm: the field stays put for several phrases and then the
      // whole thing steps somewhere else. Holding it is what lets the material
      // settle; moving it is what stops the music being one chord forever.
      if (++this.phrasesHeld >= Math.max(1, Math.round(this.params.harmonicRhythm))) {
        this.phrasesHeld = 0;
        this.field.move(this.random);
      }
    }

    // Thinner at the edges of a section, fuller in the middle — the same swell
    // that drives loudness, so the texture breathes with it rather than only
    // getting louder.
    const swell = this.intensity();
    const thinning = this.params.restChance + this.params.dynamics * (1 - swell) * 0.3;

    for (const voice of this.voices) {
      const place = (this.step + voice.offset) % voice.rhythm.steps;
      if (!voice.rhythm.pattern[place]) continue;
      if (this.random() < thinning) continue;
      this.playLayer(voice, now, place, swell);
    }

    this.step++;
  }

  /**
   * A layer has played enough to have made a shape. Keep it, and decide what
   * to do next.
   *
   * The length of a shape is its own parameter rather than the phrase length.
   * Tying the two together meant a layer whose period equalled the phrase
   * played exactly one note per phrase and never had a shape to remember at all.
   */
  closeGesture(voice, now) {
    if (voice.recording.length >= 2) {
      this.gestures.remember(voice.recording, now, { tag: voice.tag });
    }
    voice.recording = [];

    const replay =
      this.random() < this.params.recurrence
        ? this.gestures.pick(now, this.random, { tag: voice.tag })
        : null;

    voice.replaying = replay;
    voice.replayAt = 0;
    // A repeated shape starts from a note chosen by ear, not from wherever the
    // last one happened to end. Without this, a shape that goes somewhere takes
    // the music with it, further every time it comes round.
    voice.needsAnchor = replay !== null;
  }

  playLayer(voice, now, place = 0, swell = 0.5) {
    const band = this.bandFor(voice);
    const replaying = voice.replaying && !voice.needsAnchor;
    const ratio = replaying
      ? this.nextFromGesture(voice, band)
      : this.chooseFresh(voice, band, now);
    voice.needsAnchor = false;

    if (!ratio) return;

    if (voice.at && !replaying) voice.recording.push(div(ratio, voice.at));
    voice.at = ratio;

    if (!voice.replaying && voice.recording.length >= this.params.gestureLength) {
      this.closeGesture(voice, now);
    }

    const spread = this.params.velocitySpread;
    // Lower layers a touch louder, so the bottom of the texture holds.
    const tilt = 1 - (voice.index / Math.max(1, this.voices.length)) * 0.25;
    // The first beat of a cycle is played harder. Without an accent a pattern
    // is only a list of onsets; with one it has a shape you can feel.
    const stress = place === 0 ? 1 + this.params.accent : 1;
    const breath = 1 + this.params.dynamics * (swell - 0.5);
    const velocity = clamp(
      this.params.velocity * tilt * stress * breath * (1 + (this.random() * 2 - 1) * spread),
      0.05,
      1,
    );

    const id = this.play(ratio, velocity, voice.tag);
    if (id == null) return;

    // A note lasts until the next onset in its own pattern, so the sparse parts
    // of a rhythm give long notes and the busy parts give short ones.
    const gap = voice.rhythm.gaps[place] || 1;
    this.holding.set(id, now + gap * this.params.pulse * this.params.hold);
  }

  /** The next step of a shape this layer is replaying. */
  nextFromGesture(voice, band) {
    const gesture = voice.replaying;
    if (!voice.at) {
      voice.replaying = null;
      return null;
    }

    const move = gesture.moves[voice.replayAt % gesture.moves.length];
    voice.replayAt++;

    const landed = applyMove(voice.at, move, band.low, band.high);

    // A shape that has carried this layer a long way out is not worth
    // finishing. Drop it and let the layer choose by ear again.
    if (complexity(landed) > this.params.wanderLimit) {
      voice.replaying = null;
      return null;
    }

    if (voice.replayAt >= gesture.moves.length) {
      voice.replaying = null;
      voice.recording = [];
    }

    return landed;
  }

  /** A fresh decision, scored against everything that is sounding. */
  chooseFresh(voice, band, now) {
    const { modes, referenceHz, params } = this.instrument();

    const choice = chooseNext({
      reading: this.sonority.read(now),
      modes,
      referenceHz,
      params: {
        ...params,
        registerLow: band.low,
        registerHigh: band.high,
        field: this.field.members,
        // Each part is scored against its own last note, so it has a line
        // rather than merely landing somewhere inside the current harmony.
        from: voice.at,
      },
      random: this.random,
      onScored: (scored) => {
        this.lastCandidates = scored;
      },
    });

    if (!choice) return null;
    this.lastChoice = choice;
    return choice.ratio;
  }

  releaseExpired(now) {
    for (const [id, releaseAt] of this.holding) {
      if (releaseAt > now) continue;
      this.holding.delete(id);
      this.release(id);
    }
  }

  /** What the display needs: where each layer is and what it is doing. */
  describe(now = this.now()) {
    return {
      step: this.step,
      phrase: this.phrase,
      inPhrase: this.step % this.phrase,
      field: { centre: this.field.centre, members: this.field.members, held: this.phrasesHeld },
      intensity: this.intensity(),
      layers: this.voices.map((voice) => ({
        index: voice.index,
        period: voice.period,
        rhythm: voice.rhythm,
        place: (this.step + voice.offset) % voice.rhythm.steps,
        at: voice.at,
        height: voice.at ? cents(voice.at) : null,
        replaying: voice.replaying ? voice.replaying.id : null,
        band: this.bandFor(voice),
      })),
      gestures: this.gestures.list(now),
    };
  }
}

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}
