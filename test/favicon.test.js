import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { drawIcon } from "../tools/favicon.js";

// The icon is a committed file that something else generates, which is a shape
// bugs like: change how a pad is shaded, or a colour in the stylesheet, and the
// page and its tab quietly stop agreeing. Nothing would fail, and the difference
// is sixteen pixels wide in a corner of the browser. So the check is that the
// file on disk is still what the tool draws.
test("public/favicon.svg is what tools/favicon.js draws", () => {
  const onDisk = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");
  assert.equal(onDisk, drawIcon(), "run `node tools/favicon.js` to redraw it");
});

// One dot per square within reach, less the two that are past the ceiling on
// complexity: 225/64 and 64/225, two fifths and two thirds the same way.
test("the icon draws the lattice around the root", () => {
  const svg = drawIcon();
  assert.equal(svg.match(/<circle/g).length, 23);

  // The root sits in the middle and its dot fills its square. Five squares
  // across the unit viewBox puts the middle at 0.5 and gives it a radius of 0.1.
  assert.match(svg, /<circle cx="0\.5000" cy="0\.5000" r="0\.1000"\/>/);

  // Nothing else is as large, because nothing else is as simple.
  const radii = [...svg.matchAll(/r="([\d.]+)"/g)].map((found) => Number(found[1]));
  assert.equal(Math.max(...radii), 0.1);
  assert.equal(radii.filter((r) => r === 0.1).length, 1);
});
