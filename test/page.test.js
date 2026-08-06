import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PAGE, renderBody, renderPage } from "../build/page.js";

// The prose is rendered at both ends of the build and never written to disk, so
// there is nothing here that can go stale. What can still part company is the
// name: the footer links to a page the build has to emit under exactly that name,
// and the two are written in different files.
test("the footer links to the page the build emits", () => {
  const bench = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(bench.includes(`href="./${PAGE}"`), `nothing on the bench links to ${PAGE}`);
});

test("the prose renders", () => {
  const html = renderPage();
  assert.match(html, /<h1>Where the music comes from<\/h1>/);
  assert.doesNotMatch(html, /undefined/);
});

test("the marks the prose uses come out as tags", () => {
  assert.equal(renderBody("## a heading"), "<h2>a heading</h2>");
  assert.equal(renderBody("**loud** and *quiet*"), "<p><strong>loud</strong> and <em>quiet</em></p>");
  assert.equal(renderBody("[there](./there.html)"), '<p><a href="./there.html">there</a></p>');
  assert.equal(renderBody("---"), "<hr>");
  assert.equal(renderBody("- one\n- two"), "<ul>\n  <li>one</li>\n  <li>two</li>\n</ul>");
});

// A paragraph is wrapped in the source and is one line of prose on the page.
test("a wrapped paragraph is read as one", () => {
  assert.equal(renderBody("a sentence\nover two lines"), "<p>a sentence over two lines</p>");
});

// Whatever holds a code span while the other marks are applied must be something
// the prose cannot contain. A readable placeholder matches the prose itself —
// this file's own text has " 5 " and " 7 " in it — and the sentence comes back
// with a code span in the middle of it.
test("a bare number in the prose is not mistaken for a code span", () => {
  assert.equal(renderBody("swapped the 5 for a 7"), "<p>swapped the 5 for a 7</p>");
  assert.equal(renderBody("`5/4` is 4.3 bits"), "<p><code>5/4</code> is 4.3 bits</p>");
});

test("angle brackets in the prose stay prose", () => {
  assert.equal(renderBody("a < b & c"), "<p>a &lt; b &amp; c</p>");
});

// Silently passing an unsupported construction through as text puts raw
// Markdown on a published page, which is the one failure nobody sees in a diff.
test("something the renderer does not know throws", () => {
  assert.throws(() => renderBody("> a quotation"), /does not know/);
  assert.throws(() => renderBody("# a heading\nwith a second line"), /one line/);
  assert.throws(() => renderPage("no heading at all"), /top-level heading/);
});

// The published page lives under /ratiosynth/, so a leading slash points at the
// wrong host root. This is the failure that passes every test and only breaks
// once it is deployed, so it is worth one test of its own.
test("nothing on the page is addressed from the root of a server", () => {
  const html = renderPage();
  const targets = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((found) => found[1]);
  assert.ok(targets.length > 0);
  for (const target of targets) assert.doesNotMatch(target, /^\//, `${target} starts at the root`);
  assert.ok(targets.includes("./index.html"), "the page has to lead back to the instrument");
});
