// The bench. Not the node editor yet — a fixed setup with every parameter on a
// live slider, which is already a playground. Play it by hand with the pads, or
// hand it over and steer while it plays itself.

import { Engine } from "./audio/engine.js";
import { harmonicSeries } from "./instrument.js";
import { Sonority } from "./sonority.js";
import { Player } from "./player.js";
import { Composer } from "../explore/bits/compose.js";
import { Composer as RootComposer } from "../explore/ratios/compose.js";
import { LivePlayer } from "../explore/bits/live.js";
import { fromFraction, format, cents, complexity, toNumber } from "./ratio.js";

const engine = new Engine({ referenceHz: 264 });
const sonority = new Sonority({ memory: 4 });

// Audio time once there is audio, wall-clock time before that, so the memory
// decays sensibly either way.
const startedAt = performance.now() / 1000;
const now = () => engine.context?.currentTime ?? performance.now() / 1000 - startedAt;

// A just scale, plus two intervals that no keyboard has ever been able to play.
const SCALE = [
  { fraction: [1, 1], key: "a" },
  { fraction: [9, 8], key: "s" },
  { fraction: [5, 4], key: "d" },
  { fraction: [4, 3], key: "f" },
  { fraction: [3, 2], key: "g" },
  { fraction: [5, 3], key: "h" },
  { fraction: [15, 8], key: "j" },
  { fraction: [2, 1], key: "k" },
  { fraction: [7, 4], key: "z" },
  { fraction: [11, 8], key: "x" },
  { fraction: [81, 64], key: "c" },
].map((entry) => ({ ...entry, ratio: fromFraction(...entry.fraction) }));

// --- parameters ---

const voiceKnobs = [
  { advanced: true, name: "strike", label: "strike", min: 1, max: 120, step: 1, value: 18, unit: "ms" },
  { name: "noise", label: "strike noise", min: 0, max: 1, step: 0.02, value: 0.5 },
  { advanced: true, name: "brightness", label: "brightness", min: 200, max: 9000, step: 50, value: 3000, unit: "Hz" },
  { advanced: true, name: "drift", label: "drift", min: 0, max: 25, step: 0.5, value: 4, unit: "¢" },
  { advanced: true, name: "driftRate", label: "drift rate", min: 0.05, max: 6, step: 0.05, value: 0.7, unit: "Hz" },
  { advanced: true, name: "sustain", label: "sustain (bowing)", min: 0, max: 0.4, step: 0.005, value: 0 },
  { advanced: true, name: "damping", label: "release damping", min: 0, max: 1, step: 0.01, value: 0.25 },
  { advanced: true, name: "gain", label: "output", min: 0, max: 0.6, step: 0.01, value: 0.25 },
];

const bodyKnobs = [
  { advanced: true, name: "count", label: "partials", min: 1, max: 32, step: 1, value: 16, rebuild: true },
  { advanced: true, name: "ampSlope", label: "amp falloff", min: 0.2, max: 2.5, step: 0.05, value: 1, rebuild: true },
  { name: "decay", label: "decay", min: 0.1, max: 8, step: 0.1, value: 2.5, rebuild: true, unit: "s" },
  { advanced: true, name: "decaySlope", label: "high partials fade faster", min: 0, max: 1.6, step: 0.05, value: 0.7, rebuild: true },
  { advanced: true, name: "detune", label: "partial detune", min: 0, max: 20, step: 0.5, value: 3, rebuild: true, unit: "¢" },
  { advanced: true, name: "stretchAmount", label: "stretch", min: 0, max: 1, step: 0.01, value: 0, rebuild: true },
  { advanced: true, name: "reverb", label: "room", min: 0, max: 0.6, step: 0.01, value: 0.25 },
];

const hearingKnobs = [
  { name: "memory", label: "memory", min: 0.2, max: 20, step: 0.1, value: 4, unit: "s" },
  { advanced: true, name: "gravity", label: "gravity toward home", min: 0, max: 2, step: 0.02, value: 0 },
  { advanced: true, name: "radius", label: "search radius", min: 1, max: 3, step: 1, value: 1 },
];

const chooseKnobs = [
  { advanced: true, name: "balance", label: "melodic ← → harmonic", min: 0, max: 1, step: 0.02, value: 0.5 },
  { name: "tension", label: "smooth ← → rough", min: 0, max: 1, step: 0.02, value: 0.3 },
  { advanced: true, name: "reach", label: "simple ← → remote", min: 0, max: 1, step: 0.02, value: 0.2 },
  { advanced: true, name: "spread", label: "decisive ← → wandering", min: 0, max: 0.6, step: 0.01, value: 0.12 },
  { advanced: true, name: "stepRadius", label: "step size", min: 1, max: 3, step: 1, value: 1 },
  { advanced: true, name: "doubling", label: "avoid octaves", min: 0, max: 0.6, step: 0.02, value: 0.25 },
  { name: "homing", label: "pull toward home", min: 0, max: 1, step: 0.02, value: 0.3 },
  { name: "stepwise", label: "steps ← → leaps", min: 0, max: 4, step: 0.1, value: 2 },
  { advanced: true, name: "registerLow", label: "register floor", min: -2400, max: 0, step: 100, value: -1200, unit: "¢" },
  { advanced: true, name: "registerHigh", label: "register ceiling", min: 0, max: 3600, step: 100, value: 1600, unit: "¢" },
];

const playKnobs = [
  { name: "fieldSize", label: "pitches in play", min: 3, max: 12, step: 1, value: 7 },
  { name: "harmonicRhythm", label: "phrases before it moves", min: 1, max: 12, step: 1, value: 4 },
  { name: "pulse", label: "pulse", min: 0.06, max: 1, step: 0.01, value: 0.32, unit: "s" },
  { name: "layers", label: "layers", min: 1, max: 6, step: 1, value: 3 },
  { advanced: true, name: "layerSpread", label: "layers together ← → apart", min: 0, max: 1, step: 0.02, value: 0.75 },
  { name: "recurrence", label: "how often shapes return", min: 0, max: 1, step: 0.02, value: 0.55 },
  { advanced: true, name: "gestureLength", label: "shape length", min: 2, max: 12, step: 1, value: 5 },
  { name: "density", label: "how busy", min: 0.1, max: 0.9, step: 0.02, value: 0.4 },
  { name: "dynamics", label: "swell", min: 0, max: 1, step: 0.02, value: 0.5 },
  { advanced: true, name: "fieldHoming", label: "how far harmony wanders", min: 0, max: 1.5, step: 0.05, value: 0.35 },
  { advanced: true, name: "bars", label: "pattern length", min: 1, max: 4, step: 1, value: 2 },
  { advanced: true, name: "accent", label: "downbeat accent", min: 0, max: 0.8, step: 0.02, value: 0.3 },
  { advanced: true, name: "restChance", label: "dropped notes", min: 0, max: 0.6, step: 0.02, value: 0.1 },
  { name: "hold", label: "note length", min: 0.2, max: 2, step: 0.05, value: 0.9 },
  { advanced: true, name: "swing", label: "off the grid", min: 0, max: 0.3, step: 0.01, value: 0.06 },
  { advanced: true, name: "playVelocity", label: "loudness", min: 0.1, max: 1, step: 0.02, value: 0.7 },
];

// The cell engine. Far fewer controls, because nearly everything it used to
// need a number for is now worked out from the ratios.
const GENERATORS = [[3, 2], [4, 3], [5, 4], [7, 4], [7, 6], [8, 5], [11, 8]];

const rootKnobs = [
  { name: "rootSurprise", label: "settled ← → adventurous", min: 0.5, max: 3.5, step: 0.1, value: 2.0, unit: "bits" },
  { name: "nearness", label: "cents worth one bit", min: 40, max: 600, step: 10, value: 200, unit: "¢" },
  { name: "rootMemory", label: "how long it remembers", min: 8, max: 160, step: 4, value: 48 },
  { name: "rootVoices", label: "parts", min: 1, max: 5, step: 1, value: 2 },
  { name: "rootDensity", label: "how busy", min: 0.2, max: 1, step: 0.05, value: 0.3 },
];

const cellKnobs = [
  { name: "surprise", label: "settled ← → adventurous", min: 1.4, max: 4.6, step: 0.1, value: 3.4, unit: "bits" },
  { name: "notes", label: "notes in the scale", min: 3, max: 12, step: 1, value: 7 },
  { name: "generator", label: "which world", min: 0, max: GENERATORS.length - 1, step: 1, value: 0 },
  { name: "subdivision", label: "beats to a pulse", min: 1, max: 4, step: 1, value: 2 },
  { name: "memory", label: "how long it remembers", min: 8, max: 160, step: 4, value: 48 },
  { name: "voices", label: "parts", min: 1, max: 5, step: 1, value: 3 },
  { name: "cellDensity", label: "how busy", min: 0.2, max: 1, step: 0.05, value: 0.7 },
];

const allKnobs = [...voiceKnobs, ...bodyKnobs, ...hearingKnobs, ...chooseKnobs, ...playKnobs, ...cellKnobs, ...rootKnobs];
const state = {};
for (const knob of allKnobs) state[knob.name] = knob.value;

// --- building the controls ---

function buildKnobs(container, knobs, onChange) {
  for (const knob of knobs) {
    const wrap = document.createElement("div");
    wrap.className = "knob";

    const label = document.createElement("label");
    const name = document.createElement("span");
    name.textContent = knob.label;
    const value = document.createElement("span");
    value.className = "val";
    label.append(name, value);

    const input = document.createElement("input");
    input.type = "range";
    input.min = knob.min;
    input.max = knob.max;
    input.step = knob.step;
    input.value = knob.value;
    knob.input = input;
    if (knob.advanced) wrap.classList.add("advanced");

    const show = () => {
      value.textContent = `${Number(input.value)}${knob.unit ? " " + knob.unit : ""}`;
    };
    show();

    input.addEventListener("input", () => {
      state[knob.name] = Number(input.value);
      show();
      onChange(knob);
    });

    knob.show = show;
    wrap.append(label, input);
    container.append(wrap);
  }
}

function applyVoiceParams() {
  engine.setParams({
    strike: state.strike,
    noise: state.noise,
    brightness: state.brightness,
    drift: state.drift,
    driftRate: state.driftRate,
    sustain: state.sustain,
    damping: state.damping,
    gain: state.gain,
  });
}

function rebuildInstrument() {
  const modes = engine.setInstrument(harmonicSeries(state.count), {
    ampSlope: state.ampSlope,
    decay: state.decay,
    decaySlope: state.decaySlope,
    detune: state.detune,
    stretchAmount: state.stretchAmount,
  });
  drawPartials(modes);
}

buildKnobs(document.getElementById("voiceKnobs"), voiceKnobs, applyVoiceParams);
buildKnobs(document.getElementById("bodyKnobs"), bodyKnobs, (knob) => {
  if (knob.rebuild) rebuildInstrument();
  else if (knob.name === "reverb") engine.setReverb(state.reverb);
  else applyVoiceParams();
});
buildKnobs(document.getElementById("hearingKnobs"), hearingKnobs, () => {
  sonority.setParams({
    memory: state.memory,
    gravity: state.gravity,
    radius: state.radius,
  });
});
buildKnobs(document.getElementById("chooseKnobs"), chooseKnobs, () => {});
buildKnobs(document.getElementById("playKnobs"), playKnobs, () => applyPlayParams());
buildKnobs(document.getElementById("cellKnobs"), cellKnobs, () => applyCellParams());
buildKnobs(document.getElementById("rootKnobs"), rootKnobs, () => applyRootParams());

function applyPlayParams() {
  player.setParams({
    pulse: state.pulse,
    layers: state.layers,
    layerSpread: state.layerSpread,
    recurrence: state.recurrence,
    gestureLength: state.gestureLength,
    restChance: state.restChance,
    density: state.density,
    dynamics: state.dynamics,
    bars: state.bars,
    accent: state.accent,
    fieldSize: state.fieldSize,
    harmonicRhythm: state.harmonicRhythm,
    fieldHoming: state.fieldHoming,
    hold: state.hold,
    swing: state.swing,
    velocity: state.playVelocity,
    registerLow: state.registerLow,
    registerHigh: state.registerHigh,
  });
}

// The chooser reads its parameters fresh on every decision, so moving a slider
// changes the next note rather than requiring anything to be restarted.
function chooseParams() {
  return {
    balance: state.balance,
    tension: state.tension,
    reach: state.reach,
    spread: state.spread,
    radius: state.stepRadius,
    doubling: state.doubling,
    homing: state.homing,
    registerLow: state.registerLow,
    registerHigh: state.registerHigh,
  };
}

// --- presets ---
//
// Not shortcuts so much as landmarks. The parameter space is enormous and most
// of it does not sound like anything; these are the corners that do.

const PRESETS = {
  settled: {
    label: "settled",
    values: {
      pulse: 0.34, layers: 3, fieldSize: 5, harmonicRhythm: 6, recurrence: 0.85,
      tension: 0.14, homing: 0.6, spread: 0.05, restChance: 0.06, hold: 1.15,
      gestureLength: 4, layerSpread: 0.8, balance: 0.55, reach: 0.12,
      density: 0.3, bars: 2, accent: 0.35, dynamics: 0.6, stepwise: 2.6,
      decay: 3.4, decaySlope: 0.8, brightness: 2400, noise: 0.4, memory: 6,
    },
  },
  flowing: {
    label: "flowing",
    values: {
      pulse: 0.26, layers: 3, fieldSize: 7, harmonicRhythm: 4, recurrence: 0.6,
      tension: 0.3, homing: 0.35, spread: 0.12, restChance: 0.12, hold: 0.9,
      gestureLength: 5, layerSpread: 0.75, balance: 0.5, reach: 0.2,
      density: 0.4, bars: 2, accent: 0.3, dynamics: 0.5, stepwise: 2,
      decay: 2.5, decaySlope: 0.7, brightness: 3000, noise: 0.5, memory: 4,
    },
  },
  restless: {
    label: "restless",
    values: {
      pulse: 0.15, layers: 4, fieldSize: 10, harmonicRhythm: 2, recurrence: 0.3,
      tension: 0.6, homing: 0.12, spread: 0.26, restChance: 0.22, hold: 0.6,
      gestureLength: 7, layerSpread: 0.5, balance: 0.4, reach: 0.45,
      density: 0.55, bars: 3, accent: 0.2, dynamics: 0.35, stepwise: 1.2,
      decay: 1.4, decaySlope: 0.6, brightness: 4200, noise: 0.65, memory: 2.5,
    },
  },
  bells: {
    label: "bells",
    values: {
      pulse: 0.5, layers: 2, fieldSize: 6, harmonicRhythm: 8, recurrence: 0.75,
      tension: 0.2, homing: 0.5, spread: 0.08, restChance: 0.3, hold: 1.8,
      gestureLength: 4, layerSpread: 0.9, balance: 0.65, reach: 0.15,
      density: 0.22, bars: 2, accent: 0.45, dynamics: 0.7, stepwise: 2.2,
      decay: 7, decaySlope: 0.45, brightness: 5200, noise: 0.3, memory: 9,
      count: 24, ampSlope: 1.3, stretchAmount: 0.12,
    },
  },
};

function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;

  for (const [key, value] of Object.entries(preset.values)) {
    state[key] = value;
    const knob = allKnobs.find((candidate) => candidate.name === key);
    if (knob?.input) {
      knob.input.value = value;
      knob.show?.();
    }
  }

  applyVoiceParams();
  engine.setReverb(state.reverb);
  sonority.setParams({ memory: state.memory, gravity: state.gravity, radius: state.radius });
  applyPlayParams();
  rebuildInstrument();
}

function buildPresets() {
  const row = document.getElementById("presets");
  for (const [name, preset] of Object.entries(PRESETS)) {
    const button = document.createElement("button");
    button.textContent = preset.label;
    button.addEventListener("click", () => applyPreset(name));
    row.append(button);
  }
}

// --- the partial list ---

function drawPartials(modes) {
  const table = document.getElementById("partials");
  const rows = [
    `<tr><th>ratio</th><th>×</th><th>Hz</th><th>decay</th><th>level</th></tr>`,
  ];

  for (const mode of modes) {
    const hz = mode.multiplier * engine.referenceHz;
    const width = Math.max(1, Math.round(mode.amp * 60));
    rows.push(
      `<tr>
        <td>${mode.ratio ? format(mode.ratio) : "—"}</td>
        <td>${mode.multiplier.toFixed(4)}</td>
        <td>${hz.toFixed(1)}</td>
        <td>${mode.decay.toFixed(2)}s</td>
        <td><span class="bar" style="width:${width}px"></span></td>
      </tr>`,
    );
  }

  table.innerHTML = rows.join("");
}

// --- playing ---

const held = new Map(); // pad element -> voice id

// The A/B comparison, and the only rounding anywhere in the project: round a
// ratio to the nearest twelfth of an octave. Returns null when the toggle is
// off, so the engine does its own exact conversion.
function temperedHz(ratio) {
  if (!document.getElementById("et").checked) return undefined;
  const steps = Math.round(12 * Math.log2(toNumber(ratio)));
  return engine.referenceHz * 2 ** (steps / 12);
}

function buildPads() {
  const container = document.getElementById("pads");

  for (const entry of SCALE) {
    const pad = document.createElement("button");
    pad.className = "pad";
    pad.innerHTML = `
      <div class="r">${format(entry.ratio)}</div>
      <div class="c">${cents(entry.ratio).toFixed(0)}¢ · ${complexity(entry.ratio).toFixed(1)}</div>
      <div class="k">${entry.key}</div>`;

    const down = (event) => {
      event.preventDefault();
      if (held.has(pad)) return;
      pad.classList.add("on");
      startNote(pad, entry.ratio);
    };
    const up = () => {
      pad.classList.remove("on");
      stopNote(pad);
    };

    pad.addEventListener("pointerdown", down);
    pad.addEventListener("pointerup", up);
    pad.addEventListener("pointerleave", up);
    pad.addEventListener("pointercancel", up);

    entry.pad = pad;
    container.append(pad);
  }
}

async function startNote(pad, ratio) {
  held.set(pad, null);
  const id = await noteOnExact(ratio);
  if (held.has(pad)) held.set(pad, id);
  else releaseNote(id);
}

function stopNote(pad) {
  const id = held.get(pad);
  held.delete(pad);
  if (id != null) releaseNote(id);
}

// Audio can only start from a gesture, and any pad counts as one, so every
// entry point goes through here.
let started = false;
async function ensureStarted() {
  await engine.start();
  if (!started) {
    started = true;
    applyVoiceParams();
    engine.setReverb(state.reverb);
  }
  document.getElementById("start").hidden = true;
}

// One place that decides the frequency, so the comparison toggle does not
// leak into the rest of the code.
async function noteOnExact(ratio, velocity = 0.8) {
  await ensureStarted();
  const id = engine.noteOn(ratio, { velocity, hz: temperedHz(ratio) });
  // The sonority is told the ratio, never the frequency — even under the
  // temperament comparison, where the two no longer agree.
  sonority.noteOn(id, ratio, { velocity, at: now() });
  return id;
}

function releaseNote(id) {
  engine.noteOff(id);
  sonority.noteOff(id, { at: now() });
}

// --- letting it play itself ---

const player = new Player({
  sonority,
  now,
  // It plays through exactly the same door the pads do, so the temperament
  // comparison applies to it too.
  play: (ratio, velocity, tag) => {
    const id = engine.noteOn(ratio, { velocity, hz: temperedHz(ratio) });
    sonority.noteOn(id, ratio, { velocity, at: now(), tag });
    return id;
  },
  release: releaseNote,
  instrument: () => ({
    modes: engine.modes,
    referenceHz: engine.referenceHz,
    params: chooseParams(),
  }),
});

const composer = new Composer({ registerLow: -1400, registerHigh: 1600 });

const live = new LivePlayer({
  composer,
  now,
  // Same door the pads and the old engine use, so everything downstream — the
  // temperament comparison, the sonority readout — applies to it unchanged.
  play: (ratio, velocity, tag) => {
    const id = engine.noteOn(ratio, { velocity, hz: temperedHz(ratio) });
    sonority.noteOn(id, ratio, { velocity, at: now(), tag });
    return id;
  },
  release: releaseNote,
});

function applyCellParams() {
  const [n, d] = GENERATORS[Math.round(state.generator)];
  live.setParams({
    pulse: state.pulse,
    surprise: state.surprise,
    notes: state.notes,
    subdivision: state.subdivision,
    memory: state.memory,
    voices: state.voices,
    density: state.cellDensity,
    generator: fromFraction(n, d),
  });
}

const rootComposer = new RootComposer({ registerLow: -1400, registerHigh: 1600 });

const rootLive = new LivePlayer({
  composer: rootComposer,
  now,
  play: (ratio, velocity, tag, options = {}) => {
    const id = engine.noteOn(ratio, { velocity, hz: temperedHz(ratio), ...options });
    sonority.noteOn(id, ratio, { velocity, at: now(), tag });
    return id;
  },
  release: releaseNote,
});

function applyRootParams() {
  rootLive.setParams({
    pulse: state.pulse,
    surprise: state.rootSurprise,
    nearness: state.nearness,
    memory: state.rootMemory,
    voices: state.rootVoices,
    density: state.rootDensity,
  });
}

function engineMode() {
  return document.getElementById("engine")?.value ?? "root";
}

function usingRoot() {
  return engineMode() === "root";
}

function usingCells() {
  return engineMode() === "cells";
}

async function toggleAuto() {
  const button = document.getElementById("auto");

  if (usingRoot()) {
    if (rootLive.running) {
      rootLive.stop();
      button.classList.remove("on");
      button.textContent = "let it play";
      return;
    }
    await ensureStarted();
    applyRootParams();
    rootLive.start();
    button.classList.add("on");
    button.textContent = "stop";
    return;
  }

  if (usingCells()) {
    if (live.running) {
      live.stop();
      button.classList.remove("on");
      button.textContent = "let it play";
      return;
    }
    await ensureStarted();
    applyCellParams();
    live.start();
    button.classList.add("on");
    button.textContent = "stop";
    return;
  }

  if (player.running) {
    player.stop();
    button.classList.remove("on");
    button.textContent = "let it play";
    return;
  }

  await ensureStarted();
  applyPlayParams();
  player.start();
  button.classList.add("on");
  button.textContent = "stop";
}

// --- chords and buttons ---

async function playChord(fractions) {
  await ensureStarted();

  const ids = [];
  for (const [n, d] of fractions) {
    ids.push(await noteOnExact(fromFraction(n, d), 0.75));
  }
  setTimeout(() => ids.forEach(releaseNote), 2600);
}

function showMode() {
  // Only the panel for the engine in use, so there is nothing to wonder about.
  document.body.classList.remove("mode-root", "mode-cells", "mode-old");
  document.body.classList.add(`mode-${engineMode()}`);
}

document.getElementById("engine").addEventListener("change", () => {
  // Switching engines stops whichever is running; they must never both play.
  if (player.running) player.stop();
  if (live.running) live.stop();
  if (rootLive.running) rootLive.stop();
  const button = document.getElementById("auto");
  button.classList.remove("on");
  button.textContent = "let it play";
  showMode();
  // Let it go, so a stray arrow key or scroll cannot switch engines — and
  // switching engines stops the music, which looks from the outside exactly
  // like the music having broken.
  document.getElementById("engine").blur();
});

showMode();

document.getElementById("start").addEventListener("click", ensureStarted);
document.getElementById("auto").addEventListener("click", toggleAuto);

document.getElementById("triad").addEventListener("click", () => {
  playChord([[1, 1], [5, 4], [3, 2]]);
});

document.getElementById("seventh").addEventListener("click", () => {
  playChord([[1, 1], [5, 4], [3, 2], [7, 4]]);
});

document.getElementById("panic").addEventListener("click", () => {
  held.clear();
  document.querySelectorAll(".pad.on").forEach((pad) => pad.classList.remove("on"));
  if (player.running) toggleAuto();
  engine.allOff();
  sonority.clear();
});

// --- keyboard ---

const byKey = new Map(SCALE.map((entry) => [entry.key, entry]));

window.addEventListener("keydown", (event) => {
  if (event.repeat || event.metaKey || event.ctrlKey) return;
  const entry = byKey.get(event.key.toLowerCase());
  if (!entry) return;
  event.preventDefault();
  if (held.has(entry.pad)) return;
  entry.pad.classList.add("on");
  startNote(entry.pad, entry.ratio);
});

window.addEventListener("keyup", (event) => {
  const entry = byKey.get(event.key.toLowerCase());
  if (!entry) return;
  entry.pad.classList.remove("on");
  stopNote(entry.pad);
});

// --- the readout ---

// The two layers are shown separately on purpose: the facts on the bottom row,
// the reading above them. One is observed, the other is guessed at.
function drawReading() {
  const reading = sonority.read(now());
  const { centre, confidence, drift, density, direction } = reading;

  const field = (label, value) => `<div><span class="lbl">${label}</span>${value}</div>`;
  const bits = [];

  if (centre) {
    bits.push(field("centre", `<span class="big">${format(centre)}</span>`));
    bits.push(
      field(
        "sure",
        `<span class="conf"><span style="width:${(confidence * 100).toFixed(0)}%"></span></span>`,
      ),
    );
    bits.push(field("drift", drift.home ? "home" : `${drift.cents.toFixed(0)}¢`));
  } else {
    bits.push(field("centre", "—"));
  }

  bits.push(field("voices", density.voices));
  if (density.voices > 1) bits.push(field("span", `${density.spanCents.toFixed(0)}¢`));

  if (direction && direction.magnitude > 0.05) {
    const arrows = direction.move
      .map((amount, axis) => {
        if (!amount || axis === 0) return null;
        const prime = axis === 1 ? "3" : axis === 2 ? "5" : `p${axis}`;
        return `${amount > 0 ? "+" : ""}${amount.toFixed(1)}×${prime}`;
      })
      .filter(Boolean);
    if (arrows.length) bits.push(field("heading", arrows.join(" ")));
  }

  document.getElementById("reading").innerHTML = bits.join("");

  // The drone apart from the rest.
  //
  // It belongs in the reading — it is sounding, and under the fixed-root engine
  // every other note means its ratio to it, so a reading that hid it would be
  // describing a harmony that is not the one in the room. But it is a constant,
  // and listing a constant among the variables buries the variables: the drone
  // never stops, so it was most of the panel most of the time, and the notes
  // that were actually moving were hard to pick out of it.
  //
  // So it is shown, once, on its own line, and what changes is shown below.
  const drone = reading.memory.filter((entry) => entry.tag === "drone" && entry.sounding);
  document.getElementById("drone").innerHTML = drone.length
    ? `drone <b>${drone.map((entry) => format(entry.ratio)).join(" + ")}</b>`
    : "";

  document.getElementById("memory").innerHTML = reading.memory
    .filter((entry) => entry.tag !== "drone")
    .map((entry) => {
      const width = Math.max(2, Math.round(entry.weight * 34));
      return `<div class="mem${entry.sounding ? " live" : ""}">
        ${format(entry.ratio)}
        <span class="w" style="width:${width}px"></span>
      </div>`;
    })
    .join("");

  drawDecision();
  drawShape();
  requestAnimationFrame(drawReading);
}

// The parts, the pulse they are on, and the shapes it has kept. This is where
// the structure is visible: which layer moves at which speed, where in the
// phrase we are, and what is being repeated.
function drawShape() {
  if (usingRoot()) return drawRootShape();
  const shape = player.describe(now());

  const field = (label, value) => `<div><span class="lbl">${label}</span>${value}</div>`;
  document.getElementById("shape").innerHTML = [
    field("periods", player.periods.join(":") || "—"),
    field("phrase", `${shape.inPhrase + 1}/${shape.phrase}`),
    field("shapes kept", shape.gestures.length),
    field(
      "swell",
      `<span class="conf"><span style="width:${(shape.intensity * 100).toFixed(0)}%"></span></span>`,
    ),
  ].join("");

  document.getElementById("parts").innerHTML = shape.layers
    .map((layer) => {
      const { pattern, steps, onsets } = layer.rhythm;
      const cells = pattern
        .map(
          (on, i) =>
            `<span class="cell${on ? " beat" : ""}${i === layer.place ? " now" : ""}"></span>`,
        )
        .join("");
      return `<div class="part">
        <span class="name">${onsets} of ${steps}</span>
        <span class="grid">${cells}</span>
        <span class="rep">${layer.replaying ? "↻" : ""}</span>
        <span class="pitch">${layer.at ? format(layer.at) : "—"}</span>
      </div>`;
    })
    .join("");

  // Click a shape to pin it, so it stops fading and keeps coming back.
  renderShapes(
    shape.gestures.slice(0, 12).map((gesture) => ({
      id: String(gesture.id),
      label: gesture.moves.map(format).join(" "),
      weight: gesture.weight,
      pinned: gesture.pinned,
      live: false,
    })),
  );
}

/**
 * The shapes panel, updated in place rather than rebuilt.
 *
 * This is not an optimisation. The panel was being written with innerHTML on
 * every animation frame, which destroys and recreates every row sixty times a
 * second — and a browser only fires a click when the press and the release
 * happen on the same element. The row was always gone by the time the button
 * came up, so the click landed on the container instead, `closest(".shape")`
 * found nothing, and pinning silently did nothing at all. In either engine, for
 * as long as the feature has existed.
 *
 * Keeping the elements and changing their attributes fixes it. Moving a node is
 * safe; replacing it is not.
 */
function renderShapes(items) {
  const container = document.getElementById("gestures");
  const existing = new Map([...container.children].map((element) => [element.dataset.id, element]));

  for (const item of items) {
    let element = existing.get(item.id);
    if (element) {
      existing.delete(item.id);
    } else {
      element = document.createElement("div");
      element.dataset.id = item.id;
      element.append(document.createElement("span"), document.createElement("span"));
      element.lastChild.className = "bar";
    }
    element.className = `shape${item.pinned ? " pinned" : ""}${item.live ? " live" : ""}`;
    if (element.firstChild.innerHTML !== item.label) element.firstChild.innerHTML = item.label;
    element.lastChild.style.width = `${Math.round(item.weight * 100)}%`;
    container.append(element); // appending one that is already here just moves it
  }

  for (const element of existing.values()) element.remove();
}

/**
 * The same panel for the fixed-root engine.
 *
 * Its vocabulary is the thing worth seeing — the whole claim of that engine is
 * that it has one and comes back to it — so the shapes list is its phrases,
 * strongest first, with the notes each one moves through and how long they are
 * held. Clicking still pins, and pinning still means the same thing: this shape
 * stops fading, and it becomes as likely to be played as whatever the music
 * meant to play, wherever it is.
 */
function drawRootShape() {
  const shape = rootComposer.describe();

  const field = (label, value) => `<div><span class="lbl">${label}</span>${value}</div>`;
  document.getElementById("shape").innerHTML = [
    field("notes in play", `${shape.admitted}/${shape.of}`),
    field("shapes kept", shape.phrases.length),
    field(
      "unfolded",
      `<span class="conf"><span style="width:${(shape.progress * 100).toFixed(0)}%"></span></span>`,
    ),
  ].join("");

  document.getElementById("parts").innerHTML = shape.parts
    .map(
      (part) => `<div class="part">
        <span class="name">part ${part.index + 1}</span>
        <span class="grid">${part.length ? "•".repeat(part.step) + "·".repeat(Math.max(0, part.length - part.step)) : ""}</span>
        <span class="rep">${part.muted ? "" : "↻"}</span>
        <span class="pitch">${part.anchor ? format(part.anchor) : "—"}</span>
      </div>`,
    )
    .join("");

  const playing = new Set(shape.parts.map((part) => part.playing));
  renderShapes(
    shape.phrases.slice(0, 12).map((phrase) => ({
      id: phrase.id,
      label: phrase.notes.map((note, i) => `${format(note)}<sub>${phrase.counts[i]}</sub>`).join(" "),
      weight: phrase.weight,
      pinned: phrase.pinned,
      live: playing.has(phrase.id),
    })),
  );
}

// On press, not on click. A click needs the press and the release to land on the
// same element, which is one more thing that has to hold in a panel that is
// redrawn continuously; pressing is decided the moment it happens and there is
// nothing left to go wrong. It also feels quicker, which is the point of a
// control you are meant to use while listening.
document.getElementById("gestures").addEventListener("pointerdown", (event) => {
  const shape = event.target.closest(".shape");
  if (!shape) return;
  if (usingRoot()) {
    const id = shape.dataset.id;
    const phrase = rootComposer.phrases.get(id);
    rootComposer.pin(id, !phrase?.pinned);
    return;
  }
  const id = Number(shape.dataset.id);
  const entry = player.gestures.entries.find((candidate) => candidate.id === id);
  player.gestures.pin(id, !entry?.pinned);
});

// The last decision, with the runners-up. The point is to be able to see that
// the choice was scored rather than picked from a list — and to see what it
// turned down.
function drawDecision() {
  const choice = player.lastChoice;
  const decision = document.getElementById("decision");
  const table = document.getElementById("candidates");

  if (!choice) {
    decision.innerHTML = `<div><span class="lbl">nothing chosen yet</span></div>`;
    table.innerHTML = "";
    return;
  }

  const field = (label, value) => `<div><span class="lbl">${label}</span>${value}</div>`;
  decision.innerHTML = [
    field("played", `<span class="big">${format(choice.ratio)}</span>`),
    field("rough", choice.roughness.toFixed(3)),
    field("tangle", choice.tangle.toFixed(2)),
    field("cost", choice.cost.toFixed(3)),
    field("considered", player.lastCandidates.length),
  ].join("");

  const rows = [`<tr><th>ratio</th><th>cents</th><th>rough</th><th>tangle</th><th>cost</th></tr>`];
  for (const candidate of player.lastCandidates.slice(0, 8)) {
    const picked = candidate === choice;
    rows.push(
      `<tr class="${picked ? "chosen" : ""}">
        <td>${format(candidate.ratio)}${candidate.doubles ? " ·8" : ""}</td>
        <td>${cents(candidate.ratio).toFixed(0)}</td>
        <td>${candidate.roughness.toFixed(3)}</td>
        <td>${candidate.tangle.toFixed(2)}</td>
        <td>${candidate.cost.toFixed(3)}</td>
      </tr>`,
    );
  }
  table.innerHTML = rows.join("");
}

buildPresets();
document.getElementById("showAll").addEventListener("change", (event) => {
  document.body.classList.toggle("expert", event.target.checked);
});

// A panel whose controls are all advanced would otherwise sit there as an empty
// heading, so it hides with them.
for (const panel of document.querySelectorAll(".panel")) {
  const knobs = panel.querySelectorAll(".knob");
  if (knobs.length > 0 && [...knobs].every((knob) => knob.classList.contains("advanced"))) {
    panel.classList.add("advanced");
  }
}

buildPads();
rebuildInstrument();
drawReading();
