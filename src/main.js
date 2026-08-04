// The bench. Not the node editor yet — a fixed setup with every parameter on a
// live slider, which is already a playground. Play it by hand with the pads, or
// hand it over and steer while it plays itself.

import { Engine } from "./audio/engine.js";
import { harmonicSeries } from "./instrument.js";
import { Sonority } from "./sonority.js";
import { Composer } from "../explore/ratios/compose.js";
import { LivePlayer } from "../explore/ratios/live.js";
import { fromFraction, format, cents, complexity } from "./ratio.js";

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

const rootKnobs = [
  { name: "pulse", label: "pulse", min: 0.06, max: 1, step: 0.01, value: 0.32, unit: "s" },
  { name: "rootSurprise", label: "settled ← → adventurous", min: 0.5, max: 3.5, step: 0.1, value: 2.0, unit: "bits" },
  { name: "nearness", label: "cents worth one bit", min: 40, max: 600, step: 10, value: 200, unit: "¢" },
  { name: "rootMemory", label: "how long it remembers", min: 8, max: 160, step: 4, value: 48 },
  { name: "rootVoices", label: "parts", min: 1, max: 5, step: 1, value: 2 },
  { name: "rootDensity", label: "how busy", min: 0.2, max: 1, step: 0.05, value: 0.3 },
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
buildKnobs(document.getElementById("rootKnobs"), rootKnobs, () => applyRootParams());


// --- presets ---
//
// Not shortcuts so much as landmarks. The parameter space is enormous and most
// of it does not sound like anything; these are the corners that do.

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
// Two things were wrong with pads and the engine running together. Nothing the
// player did reached the music — it went into the sonority and no further — and
// both were sounding at once, which is not an accompaniment, it is two things
// making music in the same room without listening.
//
// So: while a note is being played the parts hold back, and once the playing
// stops the phrase is handed to the engine as a shape, pinned. From there the
// machinery that already exists does the rest — a pinned shape is at distance
// nought from wherever the music is, so the piece takes it up, varies it by one
// ratio at a time and keeps coming back to it.

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

async function toggleAuto() {
  const button = document.getElementById("auto");

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
  if (rootLive.running) toggleAuto();
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

  drawShape();
  requestAnimationFrame(drawReading);
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
// same element, which is one more thing that has to hold in a panel that is
// redrawn continuously; pressing is decided the moment it happens and there is
// nothing left to go wrong. It also feels quicker, which is the point of a
// control you are meant to use while listening.
document.getElementById("gestures").addEventListener("pointerdown", (event) => {
  const shape = event.target.closest(".shape");
  if (!shape) return;
  const id = shape.dataset.id;
  const phrase = rootComposer.phrases.get(id);
  rootComposer.pin(id, !phrase?.pinned);
});


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
