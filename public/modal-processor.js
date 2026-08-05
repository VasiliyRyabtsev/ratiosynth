// The sound engine. Runs on the audio thread, so it has no imports and no
// allocation in the hot path.
//
// Modal synthesis: instead of building a waveform and filtering it, we model
// the object as a set of resonances and hit it. Each resonance is a two-pole
// filter tuned to one frequency, and each rings and fades on its own. Excite
// the whole set with a short burst of noise and you get a struck sound whose
// attack is noisy and whose tail is pitched — which is what real objects do.
//
// Three of the four aliveness rules live here:
//   - the noise burst at the attack (a strike is never a clean impulse)
//   - a small independent wobble on each partial's frequency
//   - louder means brighter, because a harder strike is a brighter excitation
// The fourth, per-partial decay times, is set up in instrument.js and arrives
// with each note.

const MAX_VOICES = 16;
const MAX_MODES = 32;
const SILENCE = 1e-5; // below this a voice has stopped mattering

// How hard the clean part of the strike hits. Chosen so a note sounds about
// as loud as it did when the excitation was noise alone.
const IMPULSE_LEVEL = 30;

// Two-pole resonator: y[n] = b0*x[n] + a1*y[n-1] + a2*y[n-2].
// With a1 = 2r·cos(w) and a2 = -r² it rings at w and fades at a rate set by r.

class Voice {
  constructor() {
    this.active = false;
    this.id = -1;
    this.held = false;
    this.modeCount = 0;

    // Resonator state and coefficients, one slot per partial.
    this.y1 = new Float32Array(MAX_MODES);
    this.y2 = new Float32Array(MAX_MODES);
    this.a1 = new Float32Array(MAX_MODES);
    this.a2 = new Float32Array(MAX_MODES);
    this.b0 = new Float32Array(MAX_MODES);

    // What each partial is supposed to be doing.
    this.baseW = new Float32Array(MAX_MODES); // angular frequency, no drift
    this.r = new Float32Array(MAX_MODES); // per-sample decay factor
    this.driftPhase = new Float32Array(MAX_MODES);
    this.driftRate = new Float32Array(MAX_MODES);

    this.strikeEnv = 0;
    this.strikeCoef = 0;
    this.impulse = 0;
    this.lowpass = 0;
    this.lowpassCoef = 1;
    this.sustainLevel = 0;
    this.velocity = 1;
    this.peak = 0;
  }

  reset() {
    this.y1.fill(0);
    this.y2.fill(0);
    this.lowpass = 0;
    this.peak = 0;
  }
}

class ModalProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.voices = Array.from({ length: MAX_VOICES }, () => new Voice());
    this.excitation = new Float32Array(256);
    this.voiceOut = new Float32Array(256);

    this.params = {
      gain: 0.25,
      brightness: 3000, // cutoff of the strike noise, in Hz
      strike: 18, // length of the noise burst, in ms
      noise: 0.5, // how much of the strike is noise rather than a clean hit
      drift: 4, // cents of slow wobble per partial
      driftRate: 0.7, // how fast that wobble moves, in Hz
      sustain: 0, // continuous excitation while a note is held
      decayScale: 1,
      damping: 0.25, // how fast a released note is cut short
    };

    this.port.onmessage = (event) => this.handle(event.data);
  }

  handle(message) {
    switch (message.type) {
      case "noteOn":
        this.noteOn(message);
        break;
      case "noteOff":
        this.noteOff(message.id);
        break;
      case "allOff":
        for (const voice of this.voices) {
          voice.active = false;
          voice.held = false;
          voice.reset();
        }
        break;
      case "params":
        Object.assign(this.params, message.values);
        break;
    }
  }

  // Pick a free voice, or the quietest one if they are all busy. Stealing the
  // quietest is the least audible choice.
  allocate() {
    let quietest = null;
    for (const voice of this.voices) {
      if (!voice.active) return voice;
      if (!quietest || voice.peak < quietest.peak) quietest = voice;
    }
    return quietest;
  }

  noteOn({ id, hz, velocity = 1, modes, sustain }) {
    const voice = this.allocate();
    voice.reset();
    voice.active = true;
    voice.held = true;
    voice.id = id;
    voice.velocity = velocity;
    voice.modeCount = Math.min(modes.length, MAX_MODES);
    voice.peak = 1;

    const nyquist = sampleRate * 0.5;

    for (let i = 0; i < voice.modeCount; i++) {
      const mode = modes[i];
      const freq = hz * mode.multiplier;

      // Partials above hearing get no gain at all — they would alias and add
      // nothing. Keeping the slot simplifies the loop.
      if (freq >= nyquist * 0.98) {
        voice.b0[i] = 0;
        voice.a1[i] = 0;
        voice.a2[i] = 0;
        voice.baseW[i] = 0;
        continue;
      }

      const w = (2 * Math.PI * freq) / sampleRate;
      const decay = Math.max(0.005, mode.decay * this.params.decayScale);

      // r is chosen so the mode falls by 60 dB over its decay time.
      const r = Math.exp(-6.9078 / (decay * sampleRate));

      voice.baseW[i] = w;
      voice.r[i] = r;
      voice.a1[i] = 2 * r * Math.cos(w);
      voice.a2[i] = -r * r;
      voice.b0[i] = mode.amp * Math.sin(w) * velocity;

      // Each partial wobbles at its own unrelated speed, so they never lock
      // together into an obvious vibrato.
      voice.driftPhase[i] = Math.random() * Math.PI * 2;
      voice.driftRate[i] = this.params.driftRate * (0.5 + Math.random());
    }

    // The strike, in two parts: a sharp hit, which contains every frequency in
    // equal measure and so excites every partial by a predictable amount, then a
    // burst of noise fading over a few milliseconds for the scrape and rattle of
    // contact. The hit has to be there — these resonators are extremely narrow,
    // so with noise alone how hard each one gets pushed depends on what the noise
    // happened to contain at exactly that frequency, and the same note comes out
    // five times louder on one strike than the next.
    const noise = this.params.noise;
    voice.impulse = IMPULSE_LEVEL * (1 - 0.5 * noise);
    voice.strikeEnv = noise;
    voice.strikeCoef = Math.exp(-1 / ((this.params.strike / 1000) * sampleRate));

    // Louder means brighter. A hard strike excites the high partials; a soft
    // one barely touches them. Doing it by filtering the excitation rather
    // than by scaling partials is both simpler and closer to what happens.
    const cutoff = this.params.brightness * (0.25 + 0.75 * velocity);
    voice.lowpassCoef = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
    // Per note, falling back to the global setting. A drone has to keep
    // sounding, and with one global sustain of zero every note is a struck
    // resonator that decays.
    voice.sustainLevel = (sustain ?? this.params.sustain) * velocity;
  }

  noteOff(id) {
    for (const voice of this.voices) {
      if (!voice.active || voice.id !== id) continue;
      voice.held = false;
      voice.sustainLevel = 0;

      // Cut the ring short by shrinking each mode's decay factor. Without this
      // a released note hangs on for its full decay, which is right for a bell
      // and wrong for anything you want to play.
      const damping = this.params.damping;
      if (damping > 0) {
        for (let i = 0; i < voice.modeCount; i++) {
          const r = 1 - (1 - voice.r[i]) * (1 + damping * 40);
          voice.r[i] = Math.max(0, r);
          voice.a2[i] = -voice.r[i] * voice.r[i];
        }
      }
    }
  }

  // One block of excitation for one voice: the fading noise burst, plus a
  // steady trickle of noise if the note is being sustained.
  fillExcitation(voice, length) {
    const excitation = this.excitation;
    let env = voice.strikeEnv;
    let lowpass = voice.lowpass;
    const coef = voice.lowpassCoef;
    const sustain = voice.sustainLevel;

    for (let n = 0; n < length; n++) {
      const noise = Math.random() * 2 - 1;
      let input = noise * (env + sustain);

      // The hit lands on the first sample after the note starts. Everything
      // downstream — the lowpass, the resonators — smears it into a real
      // attack, so it is never heard as a click.
      if (voice.impulse !== 0) {
        input += voice.impulse;
        voice.impulse = 0;
      }

      lowpass += (input - lowpass) * coef;
      excitation[n] = lowpass;
      env *= voice.strikeCoef;
    }

    voice.strikeEnv = env < SILENCE ? 0 : env;
    voice.lowpass = lowpass;
  }

  renderVoice(voice, length) {
    const out = this.voiceOut;
    out.fill(0, 0, length);
    this.fillExcitation(voice, length);

    const excitation = this.excitation;
    const driftDepth = this.params.drift / 1200;
    const blockTime = length / sampleRate;

    for (let i = 0; i < voice.modeCount; i++) {
      const b0 = voice.b0[i];
      if (b0 === 0) continue;

      // Nudge the partial off its exact frequency by a fraction of a cent, once
      // per block. It is the difference between a sound that breathes and a
      // sound that sits still.
      let a1 = voice.a1[i];
      if (driftDepth !== 0) {
        const phase = voice.driftPhase[i] + voice.driftRate[i] * blockTime * 2 * Math.PI;
        voice.driftPhase[i] = phase % (Math.PI * 2);
        const w = voice.baseW[i] * (1 + driftDepth * Math.sin(phase));
        a1 = 2 * voice.r[i] * Math.cos(w);
        voice.a1[i] = a1;
      }

      const a2 = voice.a2[i];
      let y1 = voice.y1[i];
      let y2 = voice.y2[i];

      for (let n = 0; n < length; n++) {
        const y = b0 * excitation[n] + a1 * y1 + a2 * y2;
        y2 = y1;
        y1 = y;
        out[n] += y;
      }

      voice.y1[i] = y1;
      voice.y2[i] = y2;
    }

    // Track how loud this voice is, for voice stealing and for knowing when
    // it has finished.
    let peak = 0;
    for (let n = 0; n < length; n++) {
      const magnitude = out[n] < 0 ? -out[n] : out[n];
      if (magnitude > peak) peak = magnitude;
    }
    voice.peak = peak;

    // A voice is finished when it has gone quiet and nothing is still feeding
    // it. Holding the key does not keep it alive — a struck note that has rung
    // out is over whether or not you are still leaning on the pad.
    if (peak < SILENCE && voice.strikeEnv === 0 && voice.sustainLevel === 0) {
      voice.active = false;
      voice.held = false;
    }

    return out;
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output[0];
    const length = left.length;

    left.fill(0);

    for (const voice of this.voices) {
      if (!voice.active) continue;
      const rendered = this.renderVoice(voice, length);
      for (let n = 0; n < length; n++) left[n] += rendered[n];
    }

    const gain = this.params.gain;
    const knee = 0.7;
    for (let n = 0; n < length; n++) {
      const x = left[n] * gain;
      const magnitude = x < 0 ? -x : x;

      // Untouched until it gets loud, then bent over so it can never reach 1.
      // A dense chord of twelve voices has to stay inside the same headroom as
      // a single note, and the alternative is a click.
      if (magnitude <= knee) {
        left[n] = x;
      } else {
        const over = (magnitude - knee) / (1 - knee);
        const squashed = knee + (1 - knee) * (1 - Math.exp(-over));
        left[n] = x < 0 ? -squashed : squashed;
      }
    }

    // Same signal to every channel.
    for (let channel = 1; channel < output.length; channel++) {
      output[channel].set(left);
    }

    return true;
  }
}

registerProcessor("modal", ModalProcessor);
