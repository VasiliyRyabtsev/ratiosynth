# Working on ratiosynth

A browser instrument that tunes itself. Pitches are stored as prime-exponent
ratios and only become frequencies in the voice that makes sound.

**`DESIGN.md` is the source of truth.** It was written before any code and is
kept current: when building something contradicts or corrects the design, the
finding goes back into the relevant section rather than staying in chat. Read the
section that covers what you are about to touch before changing it. It is long,
so the map below is there to save reading all of it.

## Where things are

`src/` is the instrument and the ear. Nothing in it composes.

- `ratio.js` — pitch as prime exponents, ratio arithmetic, `complexity` (the bits
  it takes to write a fraction down), conversion to Hz. Everything depends on it.
- `lattice.js`, `sonority.js` — what is sounding and what it means: memory that
  fades, the estimated tonal centre and how sure it is. DESIGN §4 "The Sonority
  block".
- `roughness.js`, `instrument.js` — how rough two sounds are together, and the
  resonator model. DESIGN §6 "Synthesis", and §12 "Still open" on roughness.
- `field.js`, `interference.js`, `flight.js` — the picture: notes drawn as waves,
  flat and then flown through. `field.js` is the arithmetic and is tested in
  node; the other two are drawing. DESIGN §24 "The field", §25 "Inside the
  field".
- `main.js` — the bench and the live view, wiring and sliders. `audio/engine.js`
  and `public/modal-processor.js` are the audio worklet.

`explore/ratios/` is the composition engine, and the only one.

- `cps.js` — the pitch material: a pitch is a set of factors, a move swaps one
  factor for another.
- `compose.js` — the piece. Fixed root, phrases as transposable objects,
  variation by a single ratio move, a set of notes that unfolds and folds back,
  and what somebody plays taken up as material. DESIGN §§12–23, which run from
  "Still open" to "A phrase has to go somewhere".
- `live.js` — drives it from the wall clock so it can be steered while running.

`tools/` are measuring instruments, not part of the product. `test/` runs with
`node --test` and needs no framework.

## Commands

    npm run dev              the page
    npm test                 node --test, 92 tests, under a second
    node tools/ratios.js     the engine against the corpus: interval sizes,
                             whether a repeated phrase comes back the same,
                             how busy it is, longest gap
    node tools/drone.js      is the drone audible, and which second string
    node tools/corpus.js _dev_data/essen [--by-origin]
    node tools/corpus.js _dev_data/bach/chorales
    node tools/favicon.js    redraws public/favicon.svg from the pad shading;
                             run it after changing that, or the test fails

`tools/render.js` runs the audio worklet outside the browser, so any claim about
the sound can be rendered and measured. `tools/lines.js` measures a corpus melody
and our own output with the same code, which is the point of it.

`_dev_data/` is gitignored and holds the MIDI corpora.

## How to check work here

Nothing about how this sounds can be verified by listening from Claude's side, so
musical and audio claims have to be measured. Run the engine headlessly against a
fake clock and histogram the result; render the worklet and look at the levels.
Several real bugs survived being reasoned about and died the moment something
rendered them.

The corpus is a **bug detector, not a target**. Its value is finding where we sit
outside the range that all human music occupies. Do not optimise toward corpus
averages — that produces something statistically unremarkable. Where we differ
deliberately, a difference is fine.

When the report is impressionistic — "chaotic", "monotonous", "flat" — the cause
has so far always been a missing structure or an unexamined assumption, never a
parameter that wanted a better default. Ask what is absent that music normally
has. A fix shaped like "prefer less of X" has usually been wrong.

## Rules that hold everywhere

**Nothing rounds a pitch to a fixed set of notes**, and nothing names the idea
either, except the one paragraph in DESIGN §2 "No tempering — decided". No
comparison mode, no unit defined against a keyboard, no interval bucket named
after a scale degree. Intervals have sizes and nothing else.

**No tables, no hand-set weights, no predefined patterns.** If a number must
exist, derive it from the ratios in play. When a fix takes the shape "add a term
and pick a weight", stop and look for the missing structure. Five or fewer
parameters, each a musical intention a listener could name. The engine must
produce a distribution over what happens next, not a ranking — that is the defect
that ended the previous engine (DESIGN §12 "Is the composition engine the right
shape at all?").

**Plain language in everything written**, including comments, commit messages and
DESIGN.md. Explain a term the first time it appears. Terse bullet lists are where
this slips; a short paragraph beats a dense one-liner.

**Writing on the page sits against the thing it is about**, and there is at most
a line or two of it. What your hands do goes under the pads, what the picture is
doing goes under the picture. Collected into a footer it is two hundred words
nobody reads. Two ways a line earns nothing: it describes the build rather than
the thing — that a frequency is computed once at the end is true and inaudible —
or it narrates what you can already watch happen. The reasoning does not go on
the page at all; it goes in DESIGN.md, which the footer points at.

**Commit messages carry the finding and the measurement**, not just the change,
in the same voice as DESIGN.md. No `Co-Authored-By` trailer.

**No absolute paths to files.** A leading slash means the root of the web server,
and the published page does not live there — GitHub Pages serves it from
`/ratiosynth/`. This is a quiet one: the dev server *does* serve from the root, so
`/thing.js` works while developing, passes every test, and fails only on the
published page. Write `./thing.js`, or `import.meta.env.BASE_URL` in code that
vite builds, as `src/audio/engine.js` does for the audio worklet.
