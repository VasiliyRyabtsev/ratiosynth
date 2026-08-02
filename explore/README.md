# Explorations — unfinished

Four parallel explorations of a replacement for the weighted-cost engine (see
DESIGN.md §12 for the constraints and for why the old one is being replaced).

**All four were cut off by a session limit at the same moment**, each just after
finishing its reading and just before building. None wrote its design document,
none measured anything, and none should be treated as a result.

What survives:

- `surprisal/` — furthest along, and the only one with a real finding. `prior.js`
  carries the complexity-is-description-length identity now recorded in
  DESIGN.md §12. `performer.js` runs and produces events with five named
  parameters (pulse, surprise, memory, gravity, voices), which is the right
  shape. It is also unfinished: rhythm is a flat pulse, and voices stagnate.
  Measured against the corpus it is currently worse than the engine it means to
  replace on every axis — 70% repeated notes, a range of 702 cents. Not evidence
  against the approach, just an unfinished one.
- `algebra/algebra.js` — group operations on the lattice. Imports cleanly.
  Untested, unmeasured.
- `selfsimilar/word.js` — a substitution-word generator. Imports cleanly.
  Untested, unmeasured.
- `entrainment/` — an empty test directory. Nothing survived.

Nothing here is wired into `src/`, and nothing here should be trusted until it has
a design document and a measurement.
