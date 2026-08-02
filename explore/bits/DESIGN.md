# Composition from one measure

Status: **promising and not finished.** Sections below marked *superseded* describe the version before well-formed scales; see "Scales that have a step" at the end. The foundation is solid and verified. The
melodic behaviour is better than the engine it replaces on some counts and still
outside the range human music occupies on others. Two of the pieces are honestly
still choices dressed as derivations, and they are named below.

## The one idea

`complexity(a)` in `src/ratio.js` is `log2(numerator × denominator)`, which is
literally the number of bits it takes to write the fraction down. So

    P(a) = 2^-complexity(a) / Z

makes *how complicated is this interval* and *how surprising is this interval*
the same quantity. Nothing is chosen. `Z` is forced by the probabilities having
to add to one, and it has a closed form, because

    2^-complexity([e1..ek]) = ∏ p_i^-|e_i|

so the sum over the whole lattice factorises one axis at a time into

    1 + 2·∑_{m≥1} p^-m  =  1 + 2/(p-1)  =  (p+1)/(p-1)

and `Z` is that product over the primes in play. **Verified numerically against
brute-force summation:** the 2-, 3-, 5- and 7-limits give exactly 3, 6, 9 and 12.

The second half is the better half. That product only converges for a *finite*
set of primes, because the sum of `1/p` over all primes diverges. **A prime limit
is therefore not an arbitrary restriction on the tuning system — it is exactly
the condition under which complexity-in-bits is a probability at all.** The
lattice and the information measure are one structure seen twice.

## What follows from it

Five parameters, each a musical intention:

| | |
|---|---|
| `pulse` | how fast |
| `surprise` | bits per event — how adventurous |
| `memory` | how long a habit lasts |
| `voices` | how many parts |
| `density` | how much of the time a part plays |

Everything that would normally need a knob is derived instead.

**How many pitches are in play.** The smallest set around the centre whose own
probabilities can carry `surprise` bits. Measured: `surprise` 1.6 gives a field
of 4 pitches, 3.4 gives 25. Asking for more adventure widens the harmony on its
own, which is why there is no field-size setting.

**How sharply we sample.** Solved for by bisection, so the entropy of the
distribution equals `surprise`. Not a temperature knob — a consequence of one.

**How loud a note is.** Its surprisal, ranked against what this piece has
recently done. A surprising note is an accented note; that is what an accent
means. No parameter, and it self-scales.

**How long a note lasts.** The same prior read as a duration ratio, on the 2 and
3 axes. The measure that says 3/2 is a simple interval says three-against-two is
a simple rhythm. The self-similarity is not imposed — it is one function called
twice.

**Recurrence.** Habit, as a Dirichlet posterior predictive with the lattice as
base measure: `P(a) ∝ prior(a) + count(a)`. The prior carries the weight of one
observation. Early on the lattice decides; once the piece has habits, the habits
do. What is tallied is **moves, not pitches** — tallying pitches would build a
scale, tallying moves builds a way of moving, and it transposes exactly, which is
only true because nothing is tempered.

## The one correction the measurements forced

The lattice prior is a prior over **harmony**, and using it for melody was wrong.
It says an octave costs 1 bit and a whole tone costs 6.2, which is true of how
they are built and false of how they are heard. Measured, the line leapt twice as
often as any human tradition and almost never stepped.

So melody gets its own description length in the same currency: a pitch can be
named *by position* — "k places along from here" — and that name costs what it
costs to write `k` down. The division of labour: **the lattice decides which
notes exist, the positional code decides which of them comes next.** Giving both
questions one prior was the error.

## Where it actually stands

Against the corpus (`tools/`), at `surprise` 3.4, three seeds, eight minutes each:

| ours | corpus | |
|---|---|---|
| 29.0 | 14–19 | repeated notes |
| 34.9 | 47–65 | steps |
| 23.2 | 7–20 | thirds |
| 10.1 | 11–12 | leaps |
| 59.8 | 50 | direction changes |
| 1234 | 900–1900 | range in cents — **ok** |
| 0.25 | 0–0.70 | material that recurs — **ok** |

Leaps, range and recurrence are in range, and leaps used to be the worst number
in the project. Repeats, steps and direction changes are not: the line still
oscillates around a point rather than travelling. Rhythm carries far too much
variety — 13 distinct note lengths against a corpus 3–6.

**Two measurements are unfair as they stand and should be fixed before being
believed.** Distinct note lengths, recurrence and *lands on a pitch already used*
all depend on how long a line is, and we are comparing eight-minute lines against
fifty-note folk melodies. Ours should be measured in chunks of comparable length.

## What is still a choice pretending to be a derivation

Stated plainly, because the whole point was to avoid these.

- **Elias gamma is *a* prefix-free code for an integer, not *the* code.** A
  different code is a different prior, and the choice visibly sets how often the
  line repeats a note versus stepping. This is the most load-bearing unexamined
  decision in the design.
- **The modulation trigger.** The idea is right — the harmony should move when
  the material can no longer say as much as it could when it was new, which is a
  passage ending rather than a timer expiring. But "one bit below the best seen"
  and "for twenty-four events" are arbitrary, and the behaviour is wildly
  sensitive to them: one version modulated every three seconds, the next twice in
  eight minutes.
- `radius`, `registerLow` and `registerHigh` are still parameters, though they
  describe the world rather than the music.

## What I would do next

Not tune the above. The repeats-versus-steps balance and the modulation trigger
both come down to the same unanswered question: **what is the natural unit of
melodic motion, given only the ratios?** The positional code assumes it is "one
place along in the current field", which makes the answer depend on how big the
field happens to be — and that is almost certainly why the numbers move around so
much. A unit derived from the ratios themselves, rather than from an index into a
list, would settle repeats, steps and probably the modulation trigger at once.


---

# Scales that have a step

This supersedes the field-of-lattice-points described above.

## What was actually wrong

Measured, not guessed. A voice could reach 26 pitches, and the gaps between
adjacent ones were 20, 22, 41, 51 and 71 cents — **thirteen of the twenty-five
gaps were under fifty cents.** So a line moving "one place along" was usually
moving by a comma, which is inaudible as melodic motion and which the measuring
code correctly counts as a repeated note. The stuck repeat, step and direction
figures were all that one fact. A set of nearby lattice points is not a scale; it
is a cloud.

## The fix

Stack one generating ratio and reduce each result into the octave. The
**three-distance theorem** guarantees the gaps take at most three distinct sizes,
whatever the generator; at particular counts they take exactly two. Those counts
are Wilson's moments of symmetry, or Carey and Clampitt's well-formed scales.

Nothing is tabulated. For a fifth the counts come out 3, 5, 7, 12, 17. The
pentatonic falls out as 0/204/408/702/906 with steps of 204 and 294 cents.

**Rothenberg propriety** decides which are usable: a scale is proper when no
k-step interval is ever larger than a (k+1)-step one, so a listener can tell
where they are. Computed, not judged. It reproduces the known results — the
pentatonic and the twelve-note chromatic are strictly proper, and **the
Pythagorean diatonic is improper**, because its augmented fourth at 612 cents
overshoots its diminished fifth.

The scale size is derived: a scale of n notes can say at most log2(n) bits about
what comes next, so `surprise` picks the smallest proper moment of symmetry that
can carry it. And modulation is one step along the generator — in a well-formed
scale that is the move changing exactly one note, which is what makes a key
change hearable as a shift rather than a jump.

`generator` replaces `axes` and `radius`, and unlike them it is something you can
hear.

## The zigzag is the walls

A perfectly symmetric memoryless walk in a box of seven positions reverses
direction **60.7%** of the time. Ours reversed 61%. So the excess was never a
defect in the model — it is what any walk does in a small range.

Which makes the corpus figure the interesting one. Real melodies occupy the same
size range and reverse only 50%, so they must carry **exactly enough forward
momentum to cancel the boundary effect**. Momentum is therefore not a free
parameter: its size is fixed by the range.

That momentum has a description-length argument — a run of identical moves is
cheaper to write down than a run of different ones — so it is one more order of
prediction rather than a new mechanism.

Two bugs on the way to it, both worth remembering. The predictive context was
shared between parts, but the parts interleave, so each line's "previous move"
was another line's move and predicted nothing. And habit was tallied only on
exact ratios, while in a well-formed scale "up one step" is *two* ratios, 90
cents or 114 — so a contour could never become a habit. **Harmony wants the exact
ratio and melody wants the generic step count.** That is the third time this
project has run into the same split, and it should probably now be treated as a
principle rather than a surprise.

## Where it stands, at `surprise` 3.0

| ours | corpus | |
|---|---|---|
| 20.6 | 14–19 | repeated notes — just outside |
| 41.7 | 47–65 | steps — outside |
| 21.4 | 7–20 | thirds — just outside |
| 12.2 | 11–12 | leaps — **in** |
| 55.2 | 56–66 | leap answered by a turn — just outside |
| 60.2 | 50 | direction changes — **the one real gap left** |
| 0.12 | 0–0.70 | material that recurs — **in** |

Everything except direction changes is now in or within a couple of points of the
range human music occupies, from an engine with no tables and no fitted weights.
Direction changes remain the honest failure: the contour tally moved them from 62
to 60, and they need to reach 50.

## Generic and specific are one hierarchy

The split that kept recurring — harmony wants the exact ratio, melody wants the
step count — is not a conflict. It is one address with two coordinates, and every
tradition already names both: a *third* is generic, a *major third* is specific.
Clough and Myerson formalised this; Myhill's property makes it tight, because in
a well-formed scale each generic size maps to exactly **two** specific ratios,
differing by the chroma. So the generic coordinate is a projection with two
fibres, not a blurry approximation.

It dissolves the octave paradox that broke the first design. Specifically an
octave is one bit, trivially simple. Generically it is n steps, the largest move
in the scale. Same object, two coordinates, both correct, no contradiction.

**But merging them is wrong, and the experiment says so.** Recording each move
under the single address (step count, how many large steps) gave numbers
*identical* to recording exact ratios — which is not a coincidence: in a
well-formed scale that address determines the interval. The merged version is the
ratio version. It gained nothing and lost the thing that mattered.

What mattered was the *coarse* level, which throws the chroma away on purpose.
That is what lets a shape learnt at one scale degree count as evidence at
another, which is what makes a motif a motif rather than a coincidence. Measured:
adding it back moved steps from 35.6% to 45.3%.

So the reconciliation is a **hierarchy with back-off**, not a merger. Fine
discriminates, coarse generalises, and the evidence from each adds. That is
ordinary practice in predictive modelling and it is the right shape here for a
musical reason: a transposed motif is the same shape differently coloured, and a
model needs to see both facts at once.

## The parameter space does not contain the answer

Sixty combinations searched — five generators, four values of `surprise`, three of
`memory`, three seeds each (`search.js`). The best was the fifth at `surprise` 3.0
and `memory` 16, scoring 18.0 where zero means nothing out of range. **No setting
anywhere is close.** That rules out the comfortable explanation.

Three things the search found that a single run never would.

**Two new measures say what "not meaningful" means.** Real melodies put a quarter
to a third of their notes on one pitch (0.19–0.37) and repeat themselves at phrase
length (0.21–0.56). We put 11% on the most-used pitch and score 0.15 for
long-range repetition. **Tonal focus sits at 0.01 across the entire parameter
space** against a corpus 0.03–0.15 — no setting produces a home note. These are
much larger misses than any of the melodic-interval numbers, and they are
structural rather than a matter of settings.

**Some generators have no usable scales.** 5/4 and 8/5 score identically whatever
else changes, because their only *proper* moments of symmetry are three and four
notes, and a four-note scale spanning an octave has a 41-cent step — the comma
problem again, in a new place. `scaleFor` silently returns the same tiny scale for
every value of `surprise`. It should say so rather than carry on.

**`memory` barely does anything**, which for a parameter is a bug.

## Why: the information rate is pinned

Measured over four minutes, surprisal per note is **3.14 bits with a variation
between blocks of 0.16** — flat. That is exactly what asking for constant entropy
produces, and it was the design's central idea.

But real music does not hold its information rate constant. Setting up an
expectation *is* a fall in surprisal, and breaking it is a rise; tension and
release are the rate moving. Holding it fixed forbids both. It also forbids a
tonic, because a home note is an *uneven* pitch distribution and constant entropy
is a standing instruction to keep things even.

So `surprise` should be a mean the piece moves around, not a target it is held to,
and the movement is where form comes from. That is one change to how the existing
mechanism is driven, not a new mechanism.

*Not yet established:* an A/B against the sampler with the solver disabled was
run and was invalid — the flag was never implemented, so both arms were the same
code. The flatness measurement above stands on its own, but the causal claim
needs that test done properly.

## The unit was the problem

Every defect left after the well-formed scales turned out to be one defect: **the
unit of generation was a note.** No home pitch, nothing recurring at phrase
length, a contour indistinguishable from a random walk, a `memory` parameter with
nothing coarse enough to remember, and an information rate with no boundaries to
vary across — all five are what you get when the thing being chosen is a single
move.

So the unit is now a **cell: a path through the scale that returns to where it
started.** It needs no length setting because it ends when it closes, which is
also what a phrase does and what nothing in this project had ever done. A cell is
chosen from the piece's own vocabulary or invented, weighted by use, under the
same Dirichlet rule as everything else — so a piece begins with nothing to say,
invents, and increasingly repeats itself.

The tonic is not added anywhere. Every cell begins and ends on its origin, so
origin degrees are used about twice as often as passing ones, and the hierarchy
falls out of the closure.

Measured, the three things that had refused to move for the entire parameter
search moved at once:

|  | before | after | corpus |
|---|---|---|---|
| most-used pitch | 0.11 | 0.23–0.30 | 0.19–0.37 |
| tonal focus | 0.01 | 0.11–0.20 | 0.03–0.15 |
| long-range repetition | 0.15 | 0.14–0.27 | 0.21–0.56 |

One bug found on the way and worth remembering: a cell running past the edge of a
voice's range was being clamped, which silently turns its last moves into repeated
notes. A cell is now only offered if there is room to play it.

## What closure costs

Direction changes got **worse** — from 60% to 64–69%, against a corpus 50%. That
is not a bug and it may not be fixable at this level: a path of eight moves or
fewer that returns to its origin *has* to turn round. Closure and forward motion
pull against each other at short lengths.

Real melody closes too, but over longer spans, and travels within the phrase. So
either cells want to be longer, or closure belongs at a level above the cell — a
sequence of cells closing while individual cells travel. The second is the more
interesting possibility and it is the self-similar idea arriving from a different
direction.

There is also an honest trade-off across `surprise` that did not exist before: low
values give the best home note and repetition (0.30, 0.20, 0.27) and too many
repeated notes (42%); high values fix the repeats and weaken the sense of home.
Nothing yet gets both.

## Three homes is not a home

Vasiliy still heard no tonic while the measurement said tonal focus was in range.
The measurement was not wrong, it was blind: it scores each line separately,
exactly as it scores each chorale voice separately. Measured per voice, ours were
resting firmly on **125, 700 and 1100 cents** — three private homes, each strong,
and a texture with no key at all. In a chorale the four voices *agree*, and a
per-line metric cannot see agreement.

**So a texture-level measure was missing, and adding it was worth more than any
of the line measures.** Do the voices share a most-used pitch class: yes or no.

## Closure one level up

The fix is the same object the cells are, applied to its own output. A shared
**arc** — a closed path over scale degrees — decides where the phrase comes to
rest, and every voice hangs its next cell on that degree in its own octave. Cells
travel; the arc returns. That is closure at the level above, and it is the same
`invent` construction one level higher.

Two things had to be right before it worked.

**A pitch's scale degree must be computed, not counted.** Taking it as
index-modulo-scale-size assumes a voice's range holds a whole number of aligned
octaves. It does not, so that picks essentially arbitrary pitches as resting
places and destroys the very thing it is meant to build.

**The entropy target must not reach the harmonic level.** Passing resting places
through the same sampler that holds surprisal at `surprise` flattened the tonic
away — and it would, because that target is a standing instruction to keep things
even and a tonic *is* unevenness. Resting places are now drawn straight from the
harmonic prior at its own weight. Asking for a rate of surprise is a statement
about the line from moment to moment; it should have no vote on where the music
comes to rest.

That is the general form of a mistake made twice now: **the constant-rate idea
belongs to the line, not to the structure.**

|  | before cells | cells only | with the arc | corpus |
|---|---|---|---|---|
| most-used pitch | 0.11 | 0.30 | 0.27 | 0.19–0.37 |
| tonal focus | 0.01 | 0.20 | 0.14 | 0.03–0.15 |
| long-range repetition | 0.15 | 0.27 | 0.22 | 0.21–0.56 |
| voices agree on a key | — | 0 of 3 | 2 of 3, 3 of 3 at `surprise` 3.4 | 3 of 3 |

Still outside: steps 37–41% against 47–65, direction changes 59–64% against 50,
repeated notes 24–36% against 14–19. The turn rate did improve slightly once cells
could travel between resting places rather than closing on themselves, which is
weak evidence for the level-above idea being right.
