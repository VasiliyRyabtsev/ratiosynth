// Draws the tab icon, and writes it to public/favicon.svg.
//
// It is the pad lattice: the 3s across and the 5s up, the arrangement the page
// offers under "lay the pads out by ratio", with the root in the middle. One dot
// per square, and how big the dot is, is how simply that ratio relates to the
// root — the same `complexity` that shades the pads, against the same ceiling.
// So the icon says the one thing the instrument is about: pitch is a place, and
// some places are nearer home than others.
//
// It is generated rather than drawn so it cannot drift away from the pads it is
// a thumbnail of. Run it after changing how a pad is shaded:
//
//     node tools/favicon.js
//
// The field panel was the obvious thing to shrink and it does not survive being
// shrunk. Interference is a texture, not a shape: at sixteen pixels the fringes
// of 3/2 and 5/4 are a few pixels apart and the icon is a grey-green plaid with
// no centre and no edge. Widen the window and it stops being interference at
// all. Drawn instead, the lattice reads at sixteen pixels and grades properly at
// thirty-two, which is what a tab needs.

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { complexity, mul, pow, THREE_OVER_TWO, FIVE_OVER_FOUR } from "../src/ratio.js";

/**
 * How far out the icon looks, in squares each way from the root.
 *
 * The only number here that is about pixels rather than about music. Two each
 * way is what a sixteen-pixel square holds with a dot per square that can still
 * be seen to change size, and it is far enough that the falloff has almost run
 * out at the edge — so the picture ends because the lattice has gone quiet, not
 * because the icon stopped.
 */
const REACH = 2;

/**
 * The ceiling on complexity, past which a ratio counts as far from home. The
 * same 13 the pads are shaded against — main.js calls it REMOTE.
 *
 * It is the reason two of the twenty-five squares are missing rather than faint:
 * two fifths and two thirds the same way is 225/64, which is past the ceiling.
 * Two fifths and two thirds opposite ways is 36/25, which is not.
 */
const REMOTE = 13;

/**
 * The curve the falloff is bent by, which is the shader's, for the shader's
 * reason: a straight ramp spends most of its range on dots too small to see and
 * buries the shallow ground between the extremes. See FRAGMENT in
 * interference.js, where the same 0.65 does the same job to a brightness.
 */
const GENTLE = 0.65;

/** The square at `across` fifths and `up` thirds, as ratio.js stores a pitch. */
const at = (across, up) => mul(pow(THREE_OVER_TWO, across), pow(FIVE_OVER_FOUR, up));

/** Read a colour out of the stylesheet, so the icon and the page cannot differ. */
function colour(name) {
  const css = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const found = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!found) throw new Error(`no --${name} in the stylesheet`);
  return found[1];
}

export function drawIcon() {
  const across = REACH * 2 + 1;

  // A square each way, so the grid fills the icon and every dot sits in the
  // middle of its own square. The root's dot fills its square exactly, which is
  // what sets the size of all of them: nothing is scaled by eye.
  const cell = 1 / across;
  const widest = cell / 2;

  const dots = [];
  for (let up = REACH; up >= -REACH; up--) {
    for (let step = -REACH; step <= REACH; step++) {
      const near = 1 - complexity(at(step, up)) / REMOTE;
      if (near <= 0) continue;
      const radius = widest * Math.pow(near, GENTLE);
      const x = (step + REACH + 0.5) * cell;
      const y = (REACH - up + 0.5) * cell;
      dots.push(
        `  <circle cx="${x.toFixed(4)}" cy="${y.toFixed(4)}" r="${radius.toFixed(4)}"/>`,
      );
    }
  }

  // A unit square for a viewBox, so the same file is the icon at whatever size
  // it is asked for and nothing in it is measured in pixels.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1">
  <title>ratiosynth — the lattice around the root, each dot as simple as its ratio</title>
  <rect width="1" height="1" fill="${colour("bg")}"/>
  <g fill="${colour("accent")}">
${dots.join("\n")}
  </g>
</svg>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const svg = drawIcon();
  writeFileSync(new URL("../public/favicon.svg", import.meta.url), svg);
  console.log(`public/favicon.svg — ${svg.length} bytes`);
}
