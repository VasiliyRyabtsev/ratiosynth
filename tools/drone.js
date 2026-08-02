// Is the drone there, and is it the right drone?
//
//   node tools/drone.js
//
// Three separate bugs were fixed in this drone by reasoning about the code, and
// all three fixes changed nothing, because none of them was the problem. What it
// took was rendering the thing and looking at it. Two questions:
//
//   1. **Can it be heard.** Not "is it in the signal" — it always was — but how
//      loud it is next to the melody, and how much of it survives above the
//      frequency where a small speaker gives up. It had been sitting at 66, 99
//      and 132 Hz, 13 dB down in the band that carries, entirely underneath a
//      melody that starts at 118 Hz.
//   2. **Which second string, if any.** A tanpura's is not a fifth by law; it is
//      the note the raga leans on. This set has no 3/2 in it, and the numbers
//      below say what that costs.

import { roughnessBetween } from "../src/roughness.js";
import { harmonicSeries, makeVoiceModes } from "../src/instrument.js";
import { toHz, withOctaves, cents, complexity } from "../src/ratio.js";
import { productSet } from "../explore/ratios/cps.js";
import { Composer } from "../explore/ratios/compose.js";
import { render, above, rms, decibels, REFERENCE_HZ } from "./render.js";

const SECONDS = 30;
const UNISON = [];
const FIFTH = [-1, 1];

function mulberry(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The drone as the live player would play it, laid out on a timeline. */
function droneEvents(composer) {
  // Struck once and held, so there is exactly one of each string.
  composer.droneNext = 0;
  return (composer.droneDue(0) ?? []).map((string) => ({ ...string, start: 0, duration: SECONDS }));
}

async function balance() {
  const composer = new Composer();
  composer.random = mulberry(3);
  const { events } = composer.perform(SECONDS);

  const strings = droneEvents(composer);
  console.log("  the drone as it stands:");
  for (const string of strings.slice(0, 8)) {
    if (string.start > 0) break;
    console.log(`    ${toHz(string.ratio, REFERENCE_HZ).toFixed(0).padStart(4)} Hz   velocity ${string.velocity}, sustain ${string.sustain}`);
  }

  const melody = await render(events.filter((e) => !e.mute), SECONDS);
  const drone = await render(strings, SECONDS);

  console.log("\n                    all of it   above 150 Hz   above 300 Hz");
  for (const [name, signal] of [["melody", melody], ["drone", drone]]) {
    console.log(
      `    ${name.padEnd(8)} ${rms(signal).toFixed(4).padStart(10)}  ${rms(above(signal, 150)).toFixed(4).padStart(12)}  ${rms(above(signal, 300)).toFixed(4).padStart(12)}`,
    );
  }
  const against = (hz) => decibels(hz ? above(drone, hz) : drone, hz ? above(melody, hz) : melody).toFixed(1);
  console.log(
    `\n    drone against melody: ${against(0)} dB all of it, ${against(150)} dB above 150 Hz, ${against(300)} dB above 300 Hz`,
  );
  console.log("    (a tanpura sits around -6 to -8 dB in the band that carries)");
}

/**
 * Every possible second string, judged against the notes it would accompany.
 *
 * Two numbers per candidate. How near it comes to a melody note in cents, where
 * the danger is landing a few tens of cents away and beating; and the roughness
 * of its partials against each note, where what matters is not the total but
 * whether it is ever *smooth* — a string the melody can land on and lock with.
 */
function strings() {
  const modes = makeVoiceModes(harmonicSeries(12));
  const partials = (hz, amp = 1) => modes.map((m) => ({ hz: hz * m.multiplier, amp: amp * m.amp }));
  const set = productSet([1, 3, 5, 7], 2);

  console.log("\n  the set, in cents and in bits from the root:");
  for (const point of set) {
    console.log(`    ${point.factors.join("·").padEnd(5)} ${String(Math.round(cents(point.ratio))).padStart(4)}c   ${complexity(point.ratio).toFixed(2)} bits`);
  }

  const candidates = [["3/2  (not in the set)", FIFTH], ...set.slice(1).map((p) => [`${p.factors.join("·")}  ${Math.round(cents(p.ratio))}c`, p.ratio])];
  const header = set.map((p) => String(Math.round(cents(p.ratio))).padStart(7)).join("");

  console.log("\n  how near each candidate comes to each melody note, in cents:");
  console.log("    " + "candidate".padEnd(22) + header);
  for (const [name, ratio] of candidates) {
    const gaps = set.map((p) => {
      const gap = Math.abs(cents(ratio) - cents(p.ratio));
      return Math.round(Math.min(gap, 1200 - gap));
    });
    console.log("    " + name.padEnd(22) + gaps.map((g) => String(g).padStart(7)).join(""));
  }

  console.log("\n  roughness against each melody note (lower is smoother):");
  console.log("    " + "candidate".padEnd(22) + header + "   smoothest");
  for (const [name, ratio] of candidates) {
    const droneHz = toHz(withOctaves(ratio, -1), REFERENCE_HZ);
    const row = set.map((p) => roughnessBetween(partials(droneHz, 0.4), partials(toHz(p.ratio, REFERENCE_HZ), 1)));
    console.log(
      "    " + name.padEnd(22) + row.map((r) => r.toFixed(3).padStart(7)).join("") + `   ${Math.min(...row).toFixed(3).padStart(7)}`,
    );
  }
  console.log("\n    A string that is a member of the set locks when the melody");
  console.log("    lands on it. One that is not never locks with anything.");
}

await balance();
strings();
console.log();
