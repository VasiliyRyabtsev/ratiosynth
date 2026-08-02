// Running the audio worklet outside the browser.
//
// The point of this project is a sound, and the sound cannot be reasoned about
// from the code — three separate drone bugs in a row survived being reasoned
// about and died the moment something rendered them. So: hand the processor the
// three globals it wants, feed it a list of events, and get samples back.
//
// It is not a library for making audio. It is a measuring instrument.

import { harmonicSeries, makeVoiceModes } from "../src/instrument.js";
import { toHz } from "../src/ratio.js";

export const SAMPLE_RATE = 48000;
export const BLOCK = 128;
export const REFERENCE_HZ = 264; // what src/main.js uses

let Processor = null;

async function load() {
  if (Processor) return Processor;
  globalThis.sampleRate = SAMPLE_RATE;
  globalThis.currentTime = 0;
  globalThis.AudioWorkletProcessor = class {
    constructor() {
      this.port = { postMessage() {}, onmessage: null };
    }
  };
  globalThis.registerProcessor = (_name, Class) => {
    Processor = Class;
  };
  await import("../public/modal-processor.js");
  return Processor;
}

/**
 * Render events to samples.
 *
 * Each event needs `ratio`, `start`, `duration` and `velocity`, which is what
 * both composers already produce; `sustain` is optional and is what makes a
 * drone a drone rather than a struck bell.
 */
export async function render(events, seconds, { params = {}, modes } = {}) {
  const Class = await load();
  const processor = new Class();
  processor.port.onmessage({ data: { type: "params", values: params } });
  const voice = modes ?? makeVoiceModes(harmonicSeries(12));

  const timeline = [...events].sort((a, b) => a.start - b.start);
  const blocks = Math.ceil((seconds * SAMPLE_RATE) / BLOCK);
  const out = new Float32Array(blocks * BLOCK);
  const sounding = [];
  let cursor = 0;
  let id = 1;

  for (let b = 0; b < blocks; b++) {
    const at = (b * BLOCK) / SAMPLE_RATE;

    while (cursor < timeline.length && timeline[cursor].start <= at) {
      const event = timeline[cursor++];
      const note = id++;
      processor.port.onmessage({
        data: {
          type: "noteOn",
          id: note,
          hz: toHz(event.ratio, REFERENCE_HZ),
          velocity: event.velocity,
          modes: voice,
          sustain: event.sustain,
        },
      });
      sounding.push({ id: note, until: event.start + event.duration });
    }
    for (let i = sounding.length - 1; i >= 0; i--) {
      if (sounding[i].until > at) continue;
      processor.port.onmessage({ data: { type: "noteOff", id: sounding[i].id } });
      sounding.splice(i, 1);
    }

    const left = new Float32Array(BLOCK);
    const right = new Float32Array(BLOCK);
    processor.process([], [[left, right]]);
    out.set(left, b * BLOCK);
  }

  return out;
}

/**
 * What is left of a signal above some frequency.
 *
 * A one-pole high pass, standing in for a small speaker. Crude, and it does not
 * need to be better than crude: the thing it caught was a drone sitting at 66 Hz
 * where a laptop reproduces nothing, which is not a subtle effect.
 */
export function above(signal, hz) {
  const rc = 1 / (2 * Math.PI * hz);
  const a = rc / (rc + 1 / SAMPLE_RATE);
  const out = new Float32Array(signal.length);
  for (let i = 1; i < signal.length; i++) out[i] = a * (out[i - 1] + signal[i] - signal[i - 1]);
  return out;
}

export function rms(signal) {
  let total = 0;
  for (const sample of signal) total += sample * sample;
  return Math.sqrt(total / signal.length);
}

export function peak(signal) {
  let most = 0;
  for (const sample of signal) most = Math.max(most, Math.abs(sample));
  return most;
}

/** How much energy sits at one frequency. Goertzel — no need for a spectrum. */
export function energyAt(signal, hz) {
  const w = (2 * Math.PI * hz) / SAMPLE_RATE;
  const coefficient = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (const sample of signal) {
    const s = sample + coefficient * s1 - s2;
    s2 = s1;
    s1 = s;
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - coefficient * s1 * s2) / signal.length;
}

/** One sound against another, in decibels. */
export function decibels(a, b) {
  return 20 * Math.log10(rms(a) / rms(b));
}
