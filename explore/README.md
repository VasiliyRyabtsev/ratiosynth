# The engine

`ratios/` is the composition engine, and now the only one.

- `cps.js` — combination product sets. A pitch is a set of factors, a move is an
  exchange of one factor for another, and the interval of that move is the ratio
  of the two. No scale degrees exist anywhere.
- `compose.js` — a fixed root with the root sounding underneath; phrases as
  fixed, transposable objects; variation by a single ratio move; a set of notes
  that unfolds and folds back; and what somebody plays taken up as material.
  DESIGN.md §§12-21 is about this file.
- `live.js` — drives it from the wall clock, which is what makes it steerable
  while it runs rather than a thing that renders and then plays.

Two earlier engines were removed once this one worked: `bits/`, which built a
well-formed scale by stacking a generator and kept a Dirichlet posterior over
moves, and the original weighted-cost engine in `src/`, which chose every note
afresh by scoring candidates. Both are in git history along with their own
design notes; DESIGN.md §12 records why the second was replaced and §16 what the
first still had that this one does not.
