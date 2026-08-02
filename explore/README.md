# Explorations

Two engines live here. Both are wired into `src/main.js` and can be chosen from
the engine selector; neither is a library.

- **`ratios/`** — the current one, and the one the design document is about. A
  fixed root with the root sounding underneath, pitch material from a
  combination product set, phrases as fixed transposable objects, and variation
  by a single ratio move. See DESIGN.md §§12-15.
- **`bits/`** — the cell engine that came before it. A well-formed scale built by
  stacking one generator, with a Dirichlet posterior over moves. Kept because it
  is a genuinely different answer to the same question and it is measurable
  against the same ruler (`bits/measure.js`, `bits/search.js`). `bits/live.js` is
  shared: it is what drives either engine from the wall clock.

Three earlier branches were removed once the work they were reaching for had
been done properly elsewhere. `surprisal/` carried the
complexity-is-description-length identity, which is now recorded in DESIGN.md
§12 and implemented in `bits/prior.js`; `algebra/` and `selfsimilar/` were never
tested, never measured and never wired to anything.
