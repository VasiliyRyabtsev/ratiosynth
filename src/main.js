// The bench. Not the node editor yet — a fixed setup with every parameter on a
// live slider, which is already a playground. Play it by hand with the pads, or
// hand it over and steer while it plays itself.

import { Engine } from "./audio/engine.js";
import { harmonicSeries } from "./instrument.js";
import { Sonority } from "./sonority.js";
import { Composer } from "../explore/ratios/compose.js";
import { LivePlayer } from "../explore/ratios/live.js";
import { fromFraction, format, cents, complexity } from "./ratio.js";
import { Field } from "./interference.js";
import { Flight } from "./flight.js";

const engine = new Engine({ referenceHz: 264 });
const sonority = new Sonority({ memory: 4 });

// Audio time once there is audio, wall-clock time before that, so the memory
// decays sensibly either way.
const startedAt = performance.now() / 1000;
const now = () => engine.context?.currentTime ?? performance.now() / 1000 - startedAt;

// What you can play by hand. Grouped, one group per keyboard row, because a flat
// list of two dozen fractions says nothing about how they relate — and the
// relations are the whole point. Within a row the ratios climb, and the rows are
// drawn in the order their keys sit on the keyboard.
//
// This is not a scale in the sense of a set you must stay inside. The engine
// plays whatever ratio it is handed; these are the ones simple enough to earn a
// key of their own.
//
// The number row and the flat side are here to be heard against the bright side.
// 81/64 is what you get stacking 3/2 four times, and it is not 5/4 — pressing d
// then 2 is that comma. Same for 27/16 against 5/3, 32/27 against 6/5, 16/9
// against 9/5, and 10/9 against 9/8.
const GROUPS = [
  {
    label: "built on 3 alone — 3/2 stacked up",
    keys: [
      { fraction: [32, 27], key: "1" },
      { fraction: [81, 64], key: "2" },
      { fraction: [27, 16], key: "3" },
      { fraction: [16, 9], key: "4" },
    ],
  },
  {
    label: "the flat side, built on 5",
    keys: [
      { fraction: [16, 15], key: "q" },
      { fraction: [10, 9], key: "w" },
      { fraction: [6, 5], key: "e" },
      { fraction: [45, 32], key: "r" },
      { fraction: [8, 5], key: "t" },
      { fraction: [9, 5], key: "y" },
    ],
  },
  {
    label: "the bright side, built on 5",
    keys: [
      { fraction: [1, 1], key: "a" },
      { fraction: [9, 8], key: "s" },
      { fraction: [5, 4], key: "d" },
      { fraction: [4, 3], key: "f" },
      { fraction: [3, 2], key: "g" },
      { fraction: [5, 3], key: "h" },
      { fraction: [15, 8], key: "j" },
      { fraction: [2, 1], key: "k" },
    ],
  },
  {
    label: "built on 7, 11 and 13",
    keys: [
      { fraction: [7, 6], key: "z" },
      { fraction: [11, 9], key: "x" },
      { fraction: [11, 8], key: "c" },
      { fraction: [7, 5], key: "v" },
      { fraction: [13, 8], key: "b" },
      { fraction: [7, 4], key: "n" },
      { fraction: [11, 6], key: "m" },
    ],
  },
].map((group) => ({
  ...group,
  keys: group.keys.map((entry) => ({ ...entry, ratio: fromFraction(...entry.fraction) })),
}));

const SCALE = GROUPS.flatMap((group) => group.keys);

// --- parameters ---

const voiceKnobs = [
  { name: "strike", label: "strike", min: 1, max: 120, step: 1, value: 18, unit: "ms" },
  { name: "noise", label: "strike noise", min: 0, max: 1, step: 0.02, value: 0.5 },
  { name: "brightness", label: "brightness", min: 200, max: 9000, step: 50, value: 2000, unit: "Hz" },
  { name: "drift", label: "drift", min: 0, max: 25, step: 0.5, value: 4, unit: "¢" },
  { name: "driftRate", label: "drift rate", min: 0.05, max: 6, step: 0.05, value: 0.7, unit: "Hz" },
  { name: "sustain", label: "sustain (bowing)", min: 0, max: 0.4, step: 0.005, value: 0.24 },
  { name: "damping", label: "release damping", min: 0, max: 1, step: 0.01, value: 0.25 },
  { name: "gain", label: "output", min: 0, max: 0.6, step: 0.01, value: 0.25 },
];

const bodyKnobs = [
  { name: "count", label: "partials", min: 1, max: 32, step: 1, value: 16, rebuild: true },
  { name: "ampSlope", label: "amp falloff", min: 0.2, max: 2.5, step: 0.05, value: 1, rebuild: true },
  { name: "decay", label: "decay", min: 0.1, max: 8, step: 0.1, value: 2.5, rebuild: true, unit: "s" },
  { name: "decaySlope", label: "high partials fade faster", min: 0, max: 1.6, step: 0.05, value: 0.7, rebuild: true },
  { name: "detune", label: "partial detune", min: 0, max: 20, step: 0.5, value: 3, rebuild: true, unit: "¢" },
  { name: "stretchAmount", label: "stretch", min: 0, max: 1, step: 0.01, value: 0, rebuild: true },
  { name: "reverb", label: "room", min: 0, max: 0.6, step: 0.01, value: 0.25 },
];

const hearingKnobs = [
  { name: "memory", label: "memory", min: 0.2, max: 20, step: 0.1, value: 4, unit: "s" },
  { name: "gravity", label: "gravity toward home", min: 0, max: 2, step: 0.02, value: 0 },
  { name: "radius", label: "search radius", min: 1, max: 3, step: 1, value: 1 },
];

const rootKnobs = [
  { name: "pulse", label: "pulse", min: 0.06, max: 1, step: 0.01, value: 0.32, unit: "s" },
  { name: "rootSurprise", label: "settled ← → adventurous", min: 0.5, max: 3.5, step: 0.1, value: 2.0, unit: "bits" },
  { name: "nearness", label: "cents worth one bit", min: 40, max: 600, step: 10, value: 200, unit: "¢" },
  { name: "rootMemory", label: "how long it remembers", min: 8, max: 160, step: 4, value: 48 },
  { name: "rootVoices", label: "parts", min: 1, max: 5, step: 1, value: 2 },
  { name: "rootDensity", label: "how busy", min: 0.2, max: 1, step: 0.05, value: 0.35 },
];

const allKnobs = [...voiceKnobs, ...bodyKnobs, ...hearingKnobs, ...rootKnobs];
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

    const show = () => {
      value.textContent = `${Number(input.value)}${knob.unit ? " " + knob.unit : ""}`;
    };
    show();

    input.addEventListener("input", () => {
      state[knob.name] = Number(input.value);
      show();
      landmarkLeft();
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
buildKnobs(document.getElementById("rootKnobs"), rootKnobs, () => applyRootParams());


// --- landmarks ---
//
// Not shortcuts so much as landmarks. The parameter space is enormous and most
// of it does not sound like anything; these are the corners that do. They sit on
// top of the sliders they move, and the one you are standing on stays marked
// until a slider moves off it, so the panel says where you are and not only
// where you could go.

const PRESETS = {
  settled: {
    label: "settled",
    values: {
      pulse: 0.4, rootSurprise: 1.4, nearness: 150, rootMemory: 96,
      rootVoices: 2, rootDensity: 0.25,
      decay: 3.4, decaySlope: 0.8, brightness: 2400, noise: 0.4, memory: 6,
    },
  },
  flowing: {
    label: "flowing",
    values: {
      pulse: 0.32, rootSurprise: 2.0, nearness: 200, rootMemory: 48,
      rootVoices: 2, rootDensity: 0.3,
      decay: 2.5, decaySlope: 0.7, brightness: 3000, noise: 0.5, memory: 4,
    },
  },
  restless: {
    label: "restless",
    values: {
      pulse: 0.2, rootSurprise: 3.2, nearness: 300, rootMemory: 16,
      rootVoices: 3, rootDensity: 0.55,
      decay: 1.4, decaySlope: 0.6, brightness: 4200, noise: 0.65, memory: 2.5,
    },
  },
  bells: {
    label: "bells",
    values: {
      pulse: 0.6, rootSurprise: 1.6, nearness: 120, rootMemory: 120,
      rootVoices: 2, rootDensity: 0.2,
      decay: 7, decaySlope: 0.45, brightness: 5200, noise: 0.3, memory: 9,
      count: 24, ampSlope: 1.3, stretchAmount: 0.12,
    },
  },
};

// Which landmark the knobs are standing on, or null once any of them has been
// moved by hand. Set before the knobs are applied, because setting a slider from
// code goes through the same path a hand does.
let landmark = null;

function landmarkLeft() {
  if (!landmark) return;
  landmark = null;
  markLandmark();
}

function markLandmark() {
  for (const button of document.getElementById("presets").children) {
    button.classList.toggle("on", button.dataset.preset === landmark);
  }
}

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
  applyRootParams();
  rebuildInstrument();

  landmark = name;
  markLandmark();
}

function buildPresets() {
  const row = document.getElementById("presets");
  for (const [name, preset] of Object.entries(PRESETS)) {
    const button = document.createElement("button");
    button.dataset.preset = name;
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

// There is no way to leave a pad down, and that is deliberate.
// The keyboard can hold as many pads as you have fingers, and if what you want
// is sound going on while your hands are elsewhere, that is the button at the
// top left.

// A pad carries two facts, and they are not the same kind of fact. How far up it
// is, in cents, is a position — so it is printed, and the pads are ordered by it.
// How simply it relates to the root is not a position at all, so it is drawn
// instead: the simpler the ratio, the brighter the pad.
//
// The ceiling below is a display scale and nothing else — no part of the music
// reads it. It only has to keep the faintest pad readable. 81/64 is the most
// remote thing on this bench at 12.3.
const REMOTE = 13;

// The palette comes back out of the stylesheet rather than being written twice.
const theme = getComputedStyle(document.documentElement);
const colour = (name) => theme.getPropertyValue(name).trim();

/** Blend two hex colours from the palette. */
function mix(from, to, amount) {
  const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const a = channels(from);
  const b = channels(to);
  const t = Math.min(1, Math.max(0, amount));
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(", ")})`;
}

/** Shade one pad by how simply its ratio relates to the root. */
function shade(pad, remoteness) {
  const near = Math.max(0, 1 - remoteness / REMOTE);
  const bg = colour("--bg");
  pad.style.setProperty("--pad-fg", mix(bg, colour("--text"), 0.3 + near * 0.7));
  pad.style.setProperty("--pad-sub", mix(bg, colour("--dim"), 0.35 + near * 0.65));
  pad.style.setProperty("--pad-border", mix(colour("--line"), colour("--dim"), near));
  pad.style.setProperty("--pad-bg", mix(bg, colour("--panel"), 0.2 + near * 0.8));
}

function buildPads() {
  const container = document.getElementById("pads");

  for (const group of GROUPS) {
    const row = document.createElement("div");
    row.className = "padrow";

    const label = document.createElement("div");
    label.className = "padrow-label";
    label.textContent = group.label;
    container.append(label, row);

    for (const entry of group.keys) {
      const remoteness = complexity(entry.ratio);
      const pad = document.createElement("button");
      pad.className = "pad";
      shade(pad, remoteness);
      pad.title = `${format(entry.ratio)} — complexity ${remoteness.toFixed(1)}`;
      pad.innerHTML = `
        <div class="r">${format(entry.ratio)}</div>
        <div class="c">${cents(entry.ratio).toFixed(0)}¢</div>
        <div class="k">${entry.key}</div>`;

      pad.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        press(pad, entry.ratio);
      });
      pad.addEventListener("pointerup", () => release(pad));
      pad.addEventListener("pointerleave", () => release(pad));
      pad.addEventListener("pointercancel", () => release(pad));

      entry.pad = pad;
      row.append(pad);
    }
  }
}

// A pad going down and coming up. One pair for both ways in, a pointer and a
// key, so there is one description of what pressing a pad means.
function press(pad, ratio) {
  if (held.has(pad)) return; // already down, from the other input
  pad.classList.add("on");
  startNote(pad, ratio);
}

function release(pad) {
  pad.classList.remove("on");
  stopNote(pad);
}

/** Let go of everything. */
function releaseAll() {
  for (const pad of document.querySelectorAll(".pad.on")) release(pad);
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

// Audio can only start from a gesture, and every control here is a gesture, so
// there is no button for it — every entry point goes through `ensureStarted`.
//
// The slot always holds one line: asleep, and then what 1/1 is in Hz, which is
// the one number this page otherwise never prints and the one place where ratios
// turn into frequencies.
const status = document.getElementById("status");
const showStatus = () => {
  status.innerHTML = engine.running
    ? `1/1 = <b>${engine.referenceHz} Hz</b>`
    : "no sound yet — press anything";
};
showStatus();

let started = false;
async function ensureStarted() {
  await engine.start();
  if (!started) {
    started = true;
    applyVoiceParams();
    engine.setReverb(state.reverb);
  }
  showStatus();
}

// One place where a pad becomes a sounding note.
async function noteOnExact(ratio, velocity = 0.8) {
  await ensureStarted();
  const id = engine.noteOn(ratio, { velocity });
  // The sonority is told the ratio, never the frequency. Frequencies are a
  // detail of the last step; everything that listens works in ratios.
  sonority.noteOn(id, ratio, { velocity, at: now() });
  heardNote(ratio);
  return id;
}

function releaseNote(id) {
  engine.noteOff(id);
  sonority.noteOff(id, { at: now() });
}

// --- what the player plays becomes material ---
//
// While a note is being played the parts hold back — two things sounding at once
// without listening to each other is not an accompaniment — and once the playing
// stops the phrase is handed to the engine as a shape, pinned. From there the
// machinery that already exists does the rest: a pinned shape is at distance
// nought from wherever the music is, so the piece takes it up, varies it by one
// ratio at a time and keeps coming back to it. DESIGN §21.

let heard = [];
let settle = null;

function heardNote(ratio) {
  heard.push({ ratio, at: now() });

  // The longest note the engine writes is eight beats of its own grid; stop for
  // longer than that and the phrase is over. Nothing arbitrary is being chosen —
  // it is the same unit the music is already counting in.
  const unit = rootComposer.params.pulse / rootComposer.subdivision;
  const gap = unit * 8;

  if (rootLive.running) rootLive.hush(gap);
  clearTimeout(settle);
  settle = setTimeout(() => {
    const played = heard;
    heard = [];
    if (played.length < 2) return; // one note is a note, not a shape
    for (let i = 0; i < played.length; i++) {
      played[i].held = (i + 1 < played.length ? played[i + 1].at : played[i].at + unit) - played[i].at;
    }
    rootComposer.listen(played);
  }, gap * 1000);
}

// --- letting it play itself ---

const rootComposer = new Composer({ registerLow: -1400, registerHigh: 1600 });

const rootLive = new LivePlayer({
  composer: rootComposer,
  now,
  play: (ratio, velocity, tag, options = {}) => {
    const id = engine.noteOn(ratio, { velocity, ...options });
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

// The two captions are the two directions of the same handover, which is what
// this button is: the parts hold back while you play (§21), so the instrument is
// never taken from you, it is lent.
async function toggleAuto() {
  const button = document.getElementById("auto");

  if (rootLive.running) {
    rootLive.stop();
    button.classList.remove("on");
    button.textContent = "let it play itself";
    return;
  }

  await ensureStarted();
  applyRootParams();
  rootLive.start();
  button.classList.add("on");
  button.textContent = "take it back";
}

// --- the transport ---

document.getElementById("auto").addEventListener("click", toggleAuto);

// More than a stop: it cuts what is sounding, hands the instrument back, and
// clears what the ear is holding, so the reading and the field start again from
// nothing.
document.getElementById("panic").addEventListener("click", () => {
  releaseAll();
  held.clear();
  if (rootLive.running) toggleAuto();
  engine.allOff();
  sonority.clear();
});

// --- keyboard ---

const byKey = new Map(SCALE.map((entry) => [entry.key, entry]));

window.addEventListener("keydown", (event) => {
  if (event.repeat || event.metaKey || event.ctrlKey) return;

  // A view that covers the whole page needs a way out that does not involve
  // finding a button.
  if (event.key === "Escape" && performing) {
    perform(false);
    return;
  }

  const entry = byKey.get(event.key.toLowerCase());
  if (!entry) return;
  event.preventDefault();
  press(entry.pad, entry.ratio);
});

window.addEventListener("keyup", (event) => {
  const entry = byKey.get(event.key.toLowerCase());
  if (entry) release(entry.pad);
});

// --- the field ---
//
// The same memory the panel below prints as a list, drawn as the interference of
// the notes in it. See src/field.js for what each wave is and where it comes
// from. It shares the palette with everything else, read back out of the
// stylesheet so the colours are written once.

const fieldNote = document.getElementById("fieldnote");

// Named for the panel rather than called `field`, because the readout functions
// below already use that name for a local formatting helper and one of them
// would silently shadow this.
const fieldView = new Field(document.getElementById("field"), {
  bg: colour("--bg"),
  crest: colour("--accent"),
  trough: colour("--hot"),
});

if (!fieldView.ok) {
  document.getElementById("field").hidden = true;
  fieldNote.textContent = "this panel needs WebGL, and this browser is not offering it.";
}

// No caption: the picture is the readout. How long a pair of notes takes to come
// back round is only watchable for two notes held by hand, and the page says
// that in prose under the bench, once, rather than sixty times a second.
function drawField(reading) {
  if (!fieldView.ok) return;
  fieldView.draw(reading.memory, reading.now);
}

// --- the live view ---
//
// The bench is for finding out what a parameter does; this is for playing. The
// same waves with the eye inside them, the pads, and the little about the state
// you would still want while your hands are busy. Nothing here is a second way
// of doing anything — the pads are the very same elements, moved.

const stage = document.getElementById("stage");
const pads = document.getElementById("pads");
const dock = document.getElementById("dock");

// Where the pads go back to. Remembered rather than searched for, because the
// bench may grow another panel between them and the field.
const padsHome = pads.parentNode;
const padsAfter = pads.nextSibling;

let performing = false;
let flightView = null;

/**
 * Built the first time it is wanted, not on load.
 *
 * It is a second WebGL context and a shader that costs more to compile than the
 * panel's, and most visits to the bench never ask for it.
 */
function flight() {
  if (!flightView) {
    flightView = new Flight(document.getElementById("flight"), {
      bg: colour("--bg"),
      crest: colour("--accent"),
      trough: colour("--hot"),
    });
  }
  return flightView;
}

function perform(wanted) {
  performing = wanted;
  document.body.classList.toggle("live", wanted);
  (wanted ? dock : padsHome).insertBefore(pads, wanted ? null : padsAfter);

  if (wanted && !flight().ok) {
    document.getElementById("liveRead").innerHTML =
      `<div>this view needs WebGL, and this browser is not offering it.</div>`;
  }
}

/**
 * What is worth reading while playing, which is much less than the bench shows.
 * No vocabulary, no parts, no partials — you cannot study those and play at the
 * same time. What is left is where the music thinks it is, how sure of that it
 * is, how far through unfolding, and what is actually sounding.
 */
function drawLive(reading, clock) {
  if (!flightView?.ok) return;
  flightView.draw(reading.memory, reading.now, clock);

  const shape = rootComposer.describe();
  const field = (label, value) => `<div><span class="lbl">${label}</span>${value}</div>`;
  const bar = (amount) =>
    `<span class="conf"><span style="width:${(amount * 100).toFixed(0)}%"></span></span>`;

  document.getElementById("liveRead").innerHTML = [
    field("centre", reading.centre ? `<span class="big">${format(reading.centre)}</span>` : "—"),
    reading.centre ? field("sure", bar(reading.confidence)) : "",
    field("notes in play", `${shape.admitted}/${shape.of}`),
    field("unfolded", bar(shape.progress)),
  ].join("");

  // The drone apart from the rest: it never stops, so listing it among the notes
  // that change buries them.
  const drone = reading.memory.filter((entry) => entry.tag === "drone" && entry.sounding);
  const notes = reading.memory.filter((entry) => entry.tag !== "drone");

  document.getElementById("liveSounding").innerHTML = [
    drone.length ? `<span class="quiet">drone ${drone.map((e) => format(e.ratio)).join(" + ")}</span>` : "",
    ...notes.map(
      (entry) =>
        `<span class="${entry.sounding ? "one" : "gone"}">${format(entry.ratio)}</span>`,
    ),
  ].join("");
}

document.getElementById("perform").addEventListener("click", () => {
  // A click is a gesture, and it is the only thing audio can start from — so
  // arriving here means arriving ready to play rather than needing one more
  // press to find that out.
  ensureStarted();
  perform(true);
});
document.getElementById("leave").addEventListener("click", () => perform(false));

// --- the readout ---

// The two layers are shown separately on purpose: the facts on the bottom row,
// the reading above them. One is observed, the other is guessed at.
function drawBench(reading) {
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

  // The drone apart from the rest. It belongs in the reading — every other note
  // means its ratio to it — but it is a constant, and listing a constant among
  // the variables buries the variables. So it is shown once, on its own line,
  // and what changes is shown below.
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

  drawShape();
}

// One clock, one read of the sonority, and only the view you are looking at gets
// drawn. The flight costs far more than the panel, and the bench's readout is a
// page of innerHTML that nobody is looking at while performing.
function drawReading(clock = 0) {
  const reading = sonority.read(now());
  if (performing) drawLive(reading, clock);
  else {
    drawField(reading);
    drawBench(reading);
  }
  requestAnimationFrame(drawReading);
}

/**
 * The shapes panel, updated in place rather than rebuilt.
 *
 * Not an optimisation. Rewriting it with innerHTML on every animation frame
 * destroys and recreates every row sixty times a second, and a browser only
 * fires a click when the press and the release land on the same element — so
 * pinning silently did nothing at all. Moving a node is safe; replacing it is
 * not.
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
 * The engine's vocabulary, which is the thing worth seeing — its whole claim is
 * that it has one and comes back to it. Phrases strongest first, with the notes
 * each moves through and how long they are held. Clicking pins: the shape stops
 * fading, and becomes as likely to be played as whatever the music meant to
 * play, wherever it is.
 */
function drawShape() {
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
// same element, which is one more thing that has to hold in a panel redrawn
// continuously. It also feels quicker, which is the point of a control you are
// meant to use while listening.
document.getElementById("gestures").addEventListener("pointerdown", (event) => {
  const shape = event.target.closest(".shape");
  if (!shape) return;
  const id = shape.dataset.id;
  const phrase = rootComposer.phrases.get(id);
  rootComposer.pin(id, !phrase?.pinned);
});


buildPresets();
buildPads();
rebuildInstrument();
drawReading();
