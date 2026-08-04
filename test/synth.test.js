// Runs the audio worklet outside the browser, so the sound engine can be
// checked without listening to it. The processor only needs three globals,
// so we can hand it those and render blocks by hand.

import test from "node:test";
import assert from "node:assert/strict";

import { harmonicSeries, makeVoiceModes } from "../src/instrument.js";
import { toHz, fromFraction, FIFTH } from "../src/ratio.js";

const SAMPLE_RATE = 48000;
const BLOCK = 128;

async function loadProcessor() {
  let registered = null;

  globalThis.sampleRate = SAMPLE_RATE;
  globalThis.currentTime = 0;
  globalThis.AudioWorkletProcessor = class {
    constructor() {
      this.port = { postMessage() {}, onmessage: null };
    }
  };
  globalThis.registerProcessor = (_name, ProcessorClass) => {
    registered = ProcessorClass;
  };

  await import("../public/modal-processor.js");
  return registered;
}

const ModalProcessor = await loadProcessor();

function makeSynth(params = {}) {
  const processor = new ModalProcessor();
  processor.port.onmessage({ data: { type: "params", values: params } });
  return processor;
}

function send(processor, message) {
  processor.port.onmessage({ data: message });
}

/** Render seconds of audio and return it as one array. */
function render(processor, seconds, onBlock) {
  const blocks = Math.ceil((seconds * SAMPLE_RATE) / BLOCK);
  const out = new Float32Array(blocks * BLOCK);

  for (let b = 0; b < blocks; b++) {
    const left = new Float32Array(BLOCK);
    const right = new Float32Array(BLOCK);
    processor.process([], [[left, right]]);
    out.set(left, b * BLOCK);
    onBlock?.(b);
  }

  return out;
}

/** How much energy sits at one frequency. Goertzel, so we can ask about a few
 *  frequencies without a whole spectrum. */
function energyAt(signal, hz) {
  const w = (2 * Math.PI * hz) / SAMPLE_RATE;
  const coef = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < signal.length; i++) {
    const s = signal[i] + coef * s1 - s2;
    s2 = s1;
    s1 = s;
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - coef * s1 * s2) / signal.length;
}

/** How top-heavy the sound is: upper partials against the bottom two. */
function tilt(signal, fundamental) {
  const band = (harmonics) =>
    harmonics.reduce((sum, n) => sum + energyAt(signal, fundamental * n), 0);
  return band([5, 6, 7, 8]) / band([1, 2]);
}

function peak(signal, from = 0, to = signal.length) {
  let max = 0;
  for (let i = from; i < to; i++) max = Math.max(max, Math.abs(signal[i]));
  return max;
}

function rms(signal, from = 0, to = signal.length) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += signal[i] * signal[i];
  return Math.sqrt(sum / (to - from));
}

const modes = () =>
  makeVoiceModes(harmonicSeries(8), { detune: 0, decay: 3 }).map((m) => ({
    multiplier: m.multiplier,
    amp: m.amp,
    decay: m.decay,
  }));

test("a struck note makes sound", () => {
  const synth = makeSynth({ drift: 0 });
  send(synth, { type: "noteOn", id: 1, hz: 220, velocity: 0.8, modes: modes() });
  const audio = render(synth, 0.5);
  assert.ok(peak(audio) > 0.01, `expected sound, got peak ${peak(audio)}`);
});

test("it rings at the partials it was given, and not in between", () => {
  const synth = makeSynth({ drift: 0, sustain: 0 });
  send(synth, { type: "noteOn", id: 1, hz: 220, velocity: 0.9, modes: modes() });
  const audio = render(synth, 1);

  const fundamental = energyAt(audio, 220);
  for (const harmonic of [2, 3, 4]) {
    assert.ok(
      energyAt(audio, 220 * harmonic) > fundamental * 0.02,
      `harmonic ${harmonic} is missing`,
    );
  }

  // Between the partials there should be very little.
  assert.ok(energyAt(audio, 300) < fundamental * 0.25, "energy where no partial is");
  assert.ok(energyAt(audio, 520) < fundamental * 0.25, "energy where no partial is");
});

test("the ratio model drives the frequency", () => {
  const synth = makeSynth({ drift: 0 });
  const hz = toHz(FIFTH, 264); // exactly 396
  send(synth, { type: "noteOn", id: 1, hz, velocity: 0.9, modes: modes() });
  const audio = render(synth, 1);

  assert.equal(hz, 396);
  // Sharply peaked at the fifth itself, not smeared across its neighbourhood.
  assert.ok(energyAt(audio, 396) > energyAt(audio, 384));
  assert.ok(energyAt(audio, 396) > energyAt(audio, 408));
});

test("the note decays instead of ringing forever", () => {
  const synth = makeSynth({ drift: 0, decayScale: 0.5 });
  send(synth, { type: "noteOn", id: 1, hz: 220, velocity: 0.8, modes: modes() });
  const audio = render(synth, 3);

  const early = rms(audio, 0, SAMPLE_RATE * 0.2);
  const late = rms(audio, SAMPLE_RATE * 2, SAMPLE_RATE * 2.2);
  assert.ok(late < early * 0.2, `expected decay, got ${early} then ${late}`);
});

test("high partials fade before low ones", () => {
  const synth = makeSynth({ drift: 0 });
  send(synth, { type: "noteOn", id: 1, hz: 220, velocity: 0.9, modes: modes() });
  const audio = render(synth, 2.5);

  const start = audio.subarray(0, SAMPLE_RATE * 0.3);
  const end = audio.subarray(SAMPLE_RATE * 1.5, SAMPLE_RATE * 2.2);

  const brightAtStart = energyAt(start, 1320) / energyAt(start, 220);
  const brightAtEnd = energyAt(end, 1320) / energyAt(end, 220);
  assert.ok(brightAtEnd < brightAtStart, "the sound should darken as it fades");
});

test("louder is brighter", () => {
  // Averaged over four upper partials, because the excitation is noise and a
  // single partial is too jittery to compare between two separate strikes.
  const strike = (velocity) => {
    let total = 0;
    for (let i = 0; i < 3; i++) {
      const synth = makeSynth({ drift: 0 });
      send(synth, { type: "noteOn", id: 1, hz: 220, velocity, modes: modes() });
      total += tilt(render(synth, 0.6), 220);
    }
    return total / 3;
  };

  assert.ok(strike(1) > strike(0.15) * 1.4, "a hard strike should excite the high partials more");
});

test("the attack is noisy and the tail is not", () => {
  const synth = makeSynth({ drift: 0, strike: 20 });
  send(synth, { type: "noteOn", id: 1, hz: 220, velocity: 0.9, modes: modes() });
  const audio = render(synth, 1.5);

  // A real strike puts energy everywhere for a moment, then settles onto the
  // partials. So off-partial energy should be relatively higher at the start.
  const attack = audio.subarray(0, SAMPLE_RATE * 0.03);
  const tail = audio.subarray(SAMPLE_RATE * 0.6, SAMPLE_RATE * 1.2);

  const attackNoise = energyAt(attack, 317) / energyAt(attack, 220);
  const tailNoise = energyAt(tail, 317) / energyAt(tail, 220);
  assert.ok(attackNoise > tailNoise, "the attack should be the noisy part");
});

test("drift keeps the partials moving, and zero drift holds them still", () => {
  // Watch one partial's tuning over time inside a single note, rather than
  // comparing two notes — the excitation is random, the drift should not be.
  const watch = (params) => {
    const synth = makeSynth(params);
    send(synth, { type: "noteOn", id: 1, hz: 220, velocity: 0.9, modes: modes() });
    const samples = [];
    render(synth, 1, (block) => {
      if (block % 40 === 0) samples.push(synth.voices[0].a1[0]);
    });
    return samples;
  };

  const still = watch({ drift: 0 });
  assert.ok(still.every((value) => value === still[0]), "no drift should mean no movement");

  const alive = watch({ drift: 12, driftRate: 3 });
  const spread = Math.max(...alive) - Math.min(...alive);
  assert.ok(spread > 0, "drift should move the tuning");
  // A wobble, not a slide: twelve cents is one percent of an octave.
  assert.ok(spread < 0.0005, `drifted too far, spread ${spread}`);
});

test("releasing a note cuts it short", () => {
  const rung = makeSynth({ drift: 0, damping: 0.5 });
  send(rung, { type: "noteOn", id: 1, hz: 220, velocity: 0.9, modes: modes() });
  const held = render(rung, 2);

  const damped = makeSynth({ drift: 0, damping: 0.5 });
  send(damped, { type: "noteOn", id: 1, hz: 220, velocity: 0.9, modes: modes() });
  render(damped, 0.3);
  send(damped, { type: "noteOff", id: 1 });
  const released = render(damped, 1.7);

  const heldLate = rms(held, SAMPLE_RATE * 1.2, SAMPLE_RATE * 1.8);
  const releasedLate = rms(released, SAMPLE_RATE * 0.9, SAMPLE_RATE * 1.5);
  assert.ok(releasedLate < heldLate * 0.5, "a released note should fade faster");
});

test("voices are reused once they have finished", () => {
  const synth = makeSynth({ drift: 0, decayScale: 0.15 });
  send(synth, { type: "noteOn", id: 1, hz: 220, velocity: 0.9, modes: modes() });
  render(synth, 2.5);
  assert.equal(synth.voices.filter((v) => v.active).length, 0);
});

test("a chord holds every note at once", () => {
  const synth = makeSynth({ drift: 0 });
  const triad = [
    [1, 1],
    [5, 4],
    [3, 2],
  ];

  triad.forEach(([n, d], i) => {
    send(synth, {
      type: "noteOn",
      id: i + 1,
      hz: toHz(fromFraction(n, d), 264),
      velocity: 0.7,
      modes: modes(),
    });
  });

  const audio = render(synth, 1);
  for (const hz of [264, 330, 396]) {
    assert.ok(energyAt(audio, hz) > 0.0005, `${hz} Hz is missing from the chord`);
  }
});

test("a dense chord does not clip", () => {
  const synth = makeSynth({ drift: 0, gain: 0.5 });
  for (let i = 0; i < 12; i++) {
    send(synth, { type: "noteOn", id: i, hz: 180 + i * 40, velocity: 1, modes: modes() });
  }
  const audio = render(synth, 1);
  assert.ok(peak(audio) <= 1, `peak ${peak(audio)} would clip`);
});

test("all-off silences everything", () => {
  const synth = makeSynth({ drift: 0 });
  send(synth, { type: "noteOn", id: 1, hz: 220, velocity: 0.9, modes: modes() });
  render(synth, 0.2);
  send(synth, { type: "allOff" });
  const audio = render(synth, 0.2);
  assert.equal(peak(audio), 0);
});

test("nothing ever comes out as NaN", () => {
  const synth = makeSynth({ drift: 15, sustain: 0.2 });
  send(synth, { type: "noteOn", id: 1, hz: 55, velocity: 1, modes: modes() });
  send(synth, { type: "noteOn", id: 2, hz: 9000, velocity: 1, modes: modes() });
  const audio = render(synth, 1);
  assert.ok(audio.every(Number.isFinite), "found a NaN or an infinity in the output");
});
