// The main-thread side of the sound engine.
//
// Its one real job is the boundary this whole project is built around: ratios
// come in, and this is where — and only where — they become frequencies.

import { toHz } from "../ratio.js";

const PROCESSOR_VERSION = 3; // per-note sustain; bumped to evict any stale copy
import { makeVoiceModes, harmonicSeries } from "../instrument.js";

export class Engine {
  constructor({ referenceHz = 264 } = {}) {
    this.referenceHz = referenceHz;
    this.context = null;
    this.node = null;
    this.nextId = 1;
    this.sounding = new Map(); // id -> { ratio, hz, startedAt }
    this.modes = makeVoiceModes(harmonicSeries(16));
  }

  get running() {
    return this.context?.state === "running";
  }

  /** Must be called from a click — browsers will not start audio otherwise. */
  async start() {
    if (this.context) {
      await this.context.resume();
      return;
    }

    const context = new AudioContext({ latencyHint: "interactive" });
    // The version matters. An AudioWorklet module is fetched once per context
    // and cached hard by the browser, so a changed processor is silently ignored
    // — a new field in a message is simply dropped by the old code, and the
    // result measures perfectly offline while making no sound at all. Bump this
    // whenever modal-processor.js changes.
    await context.audioWorklet.addModule(`/modal-processor.js?v=${PROCESSOR_VERSION}`);

    const node = new AudioWorkletNode(context, "modal", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    // A little room around the sound. Modal tones are dry and close-miked on
    // their own, and a plain decaying-noise reverb is enough to sit them in a
    // space without smearing the tuning.
    const reverb = context.createConvolver();
    reverb.buffer = makeRoom(context, 2.2);

    const wet = context.createGain();
    const dry = context.createGain();
    wet.gain.value = 0.25;
    dry.gain.value = 0.85;

    node.connect(dry).connect(context.destination);
    node.connect(reverb).connect(wet).connect(context.destination);

    this.context = context;
    this.node = node;
    this.wet = wet;
    this.dry = dry;
  }

  /**
   * Start a note. Takes a ratio, not a frequency.
   *
   * `hz` overrides the conversion. Nothing in the finished instrument should
   * ever use it — it exists so the page can play a deliberately mistuned
   * version of a pitch for comparison.
   */
  noteOn(ratio, { velocity = 0.8, modes = this.modes, hz = toHz(ratio, this.referenceHz), sustain } = {}) {
    if (!this.node) return null;

    const id = this.nextId++;

    this.node.port.postMessage({
      type: "noteOn",
      id,
      hz,
      velocity,
      // Only sent when a note asks for it; otherwise the global setting stands.
      sustain,
      modes: modes.map((m) => ({ multiplier: m.multiplier, amp: m.amp, decay: m.decay })),
    });

    this.sounding.set(id, { ratio, hz, startedAt: this.context.currentTime });
    return id;
  }

  noteOff(id) {
    if (!this.node || id == null) return;
    this.node.port.postMessage({ type: "noteOff", id });
    this.sounding.delete(id);
  }

  allOff() {
    if (!this.node) return;
    this.node.port.postMessage({ type: "allOff" });
    this.sounding.clear();
  }

  /** Change how the instrument behaves while it is playing. */
  setParams(values) {
    this.node?.port.postMessage({ type: "params", values });
  }

  setReverb(amount) {
    if (!this.wet) return;
    this.wet.gain.value = amount;
    this.dry.gain.value = 1 - amount * 0.6;
  }

  /** Rebuild the instrument's partials. */
  setInstrument(ratios, options) {
    this.modes = makeVoiceModes(ratios, options);
    return this.modes;
  }
}

// An impulse response made of noise that fades away, shaped a bit darker at
// the end because high frequencies die first in a real room.
function makeRoom(context, seconds) {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let lowpass = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const envelope = (1 - t) ** 2.5;
      const noise = Math.random() * 2 - 1;
      lowpass += (noise - lowpass) * (0.35 - 0.25 * t);
      data[i] = lowpass * envelope;
    }
  }

  return buffer;
}
