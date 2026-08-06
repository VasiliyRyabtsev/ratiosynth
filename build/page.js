// Renders docs/composition.md into the page the instrument links to.
//
// The source is Markdown because the page is prose, and prose is easier to write
// and to read in a diff without tags around it. Nothing is written to disk: the
// dev server renders it on request and the build emits it into dist/, so editing
// the prose is a reload and there is no generated file to go stale. That follows
// the rule the deploy workflow already states — nothing built is kept in the
// repository.
//
// Written here rather than taken from a library because the page uses six things
// — headings, paragraphs, bold, italics, links and a rule — and a dependency
// that renders all of Markdown would be larger than the page it renders. What is
// not supported throws rather than passing through as text, so the source cannot
// quietly grow a construction the renderer drops on the floor.
//
// The palette is read out of index.html, the same way tools/favicon.js reads it,
// so the page and the instrument cannot come to disagree about what colour they
// are.

import { readFileSync } from "node:fs";

const SOURCE = new URL("../docs/composition.md", import.meta.url);

/** What the page is called. The footer of index.html has to agree with it. */
export const PAGE = "composition.html";

/** Read a colour out of the stylesheet, so the page and the instrument cannot differ. */
function colour(name) {
  const css = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const found = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!found) throw new Error(`no --${name} in the stylesheet`);
  return found[1];
}

function escape(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The marks that live inside a line.
 *
 * Code spans are lifted out first and put back last, so that a ratio written
 * between backticks cannot have its asterisks or brackets read as marks.
 */
function inline(text) {
  const held = [];
  // Held under a character the source cannot contain. A readable placeholder
  // like " 0 " matches the prose itself — "swapped the 5 for a 7" — and the
  // sentence comes back with a code span in the middle of it.
  let out = escape(text).replace(/`([^`]+)`/g, (_, code) => {
    held.push(code);
    return `\u0000${held.length - 1}\u0000`;
  });

  out = out
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `<a href="${href}">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");

  return out.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${held[Number(i)]}</code>`);
}

/** Markdown to the inside of the page. Blank lines separate blocks; each block is one thing. */
export function renderBody(markdown) {
  const blocks = markdown.trim().split(/\n{2,}/);
  return blocks
    .map((block) => {
      const lines = block.split("\n");
      const heading = lines[0].match(/^(#{1,3}) (.+)$/);
      if (heading) {
        if (lines.length > 1) throw new Error(`a heading is one line: ${lines[0]}`);
        const level = heading[1].length;
        return `<h${level}>${inline(heading[2])}</h${level}>`;
      }
      if (/^-{3,}$/.test(block)) return "<hr>";
      if (lines.every((line) => line.startsWith("- "))) {
        const items = lines.map((line) => `  <li>${inline(line.slice(2))}</li>`);
        return `<ul>\n${items.join("\n")}\n</ul>`;
      }
      if (lines.some((line) => /^\s*[-#>]\s/.test(line))) {
        throw new Error(`this renderer does not know what to do with: ${block.slice(0, 60)}`);
      }
      // A paragraph is written over several lines and read as one, so the source
      // can be wrapped to a sensible width without the wrapping showing.
      return `<p>${inline(lines.join(" "))}</p>`;
    })
    .join("\n\n");
}

/** The whole file: the prose, and the page it sits in. */
export function renderPage(markdown = readFileSync(SOURCE, "utf8")) {
  const body = renderBody(markdown);
  const title = markdown.match(/^# (.+)$/m);
  if (!title) throw new Error("the source needs a top-level heading to name the page by");

  // The instrument is monospace at thirteen pixels throughout, which is right for
  // numbers that have to line up and wrong for three thousand words. So the prose
  // takes the reading face the machine already has, at a size and a measure meant
  // for reading, and keeps everything else: the colours, and monospace wherever a
  // ratio appears.
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escape(title[1])} — ratiosynth</title>
    <link rel="icon" type="image/svg+xml" href="./favicon.svg" />
    <style>
      :root {
        --bg: ${colour("bg")};
        --text: ${colour("text")};
        --dim: ${colour("dim")};
        --line: ${colour("line")};
        --accent: ${colour("accent")};
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 32px 24px 96px;
        background: var(--bg);
        color: var(--text);
        font: 16px/1.65 ui-serif, Georgia, "Times New Roman", serif;
      }
      main { max-width: 34em; margin: 0 auto; }
      h1 { font-size: 26px; line-height: 1.25; font-weight: 600; margin: 0 0 8px; }
      h2 {
        font-size: 15px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: lowercase;
        color: var(--accent);
        font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        margin: 40px 0 10px;
      }
      h3 { font-size: 17px; font-weight: 600; margin: 28px 0 8px; }
      p { margin: 0 0 16px; }
      strong { font-weight: 600; color: #fff; }
      code { font: 13px/1 ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
      a { color: var(--accent); }
      hr { border: 0; border-top: 1px solid var(--line); margin: 40px 0 28px; }
      hr + p { color: var(--dim); font-size: 14px; }
      /* Back to the instrument, at the top where it is found before the reading
         starts and not after three thousand words of it. Inside the column
         rather than above it: a measure set in em is a measure in the element's
         own size, so the same 34em on a monospace link is a narrower box and it
         centres to somewhere the text below does not start. */
      .back {
        display: block;
        margin: 0 0 28px;
        font: 13px/1.5 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
        color: var(--dim);
      }
      .back:hover { color: var(--accent); }
    </style>
  </head>
  <body>
    <main>
      <a class="back" href="./index.html">← the instrument</a>
${body
  .split("\n")
  .map((line) => (line ? `      ${line}` : line))
  .join("\n")}
    </main>
  </body>
</html>
`;
}
