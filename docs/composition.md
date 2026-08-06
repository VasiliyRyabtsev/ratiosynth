# Where the music comes from

This is the composing half of ratiosynth, written out for somebody who will never
open the code: what the machine does when it plays itself, and why it is built
that way. The other half — the instrument, the resonators, the pictures — is
described in [DESIGN.md](https://github.com/VasiliyRyabtsev/ratiosynth/blob/master/DESIGN.md),
which is where all of the reasoning lives.

## The idea in one sentence

A pitch is stored as a fraction, never as a frequency — and the number of bits it
takes to write that fraction down is used directly as its improbability. Every
choice the engine makes, at every timescale, is the same rule: simple ratios
happen often, complex ones happen rarely, in exactly the proportion the
arithmetic gives.

## The measurement everything rests on

If a pitch is the fraction 5/4, its *complexity* is log2(5 × 4) ≈ 4.3 —
literally the number of bits needed to write "5 over 4". Now set the probability
of an interval to 2^−complexity, divided by whatever makes the total come to one.
That single step makes "how complicated is this interval" and "how surprising is
this interval" the same quantity. Nothing is tuned: the normalising constant is
forced by probabilities having to sum to one.

There is a catch that turns out to be a feature. That sum only converges if you
restrict yourself to a finite set of primes — 2, 3, 5, 7, perhaps 11 — because
the sum of 1/p over *all* primes diverges. So the prime limit, which in tuning
theory is usually presented as a taste or a convention, is here exactly the
condition under which complexity-in-bits is a probability at all.

That is the whole theory. What follows is that one rule applied at four levels:
notes, rhythms, variations of a phrase, and choices of phrase.

## Where the pitches come from

Not from a scale. Take a handful of factors — 1, 3, 5, 7 — and form every product
of two of them: 1·3, 1·5, 1·7, 3·5, 3·7, 5·7. Fold them all into one octave and
divide everything by the simplest, so that one member becomes 1/1. You get six
pitches: 1/1, 7/6, 5/4, 35/24, 5/3, 7/4. This is Erv Wilson's *hexany*, a
combination product set.

What makes it worth using is what a melodic move becomes. A pitch here is not a
position on a ladder — it is a **set of factors**. Two pitches are neighbours when
their factor sets differ by one element, and the interval between them is then
just the ratio of the factor traded out to the one traded in. "I swapped the 5 for
a 7" is a move with a name and an identity, which can be remembered and repeated;
"I moved up two places" is not. There are no positions here to think in, which is
the point of using it.

## Why there is a drone

The root sounds continuously underneath the whole piece — the root, and the root
an octave below, struck once and then held. This is not accompaniment. It is what
makes the ratios audible as ratios: without a sounding 1/1, small differences
between nearby fractions cannot be heard at all.

It also settles a real problem. In this set the narrow intervals are
arithmetically complex and the simple intervals are wide: the 85-cent gap is
21/20 at 8.7 bits, while the 386-cent gap is 5/4 at 4.3 bits. That is not a quirk
of the hexany but the nature of ratios — two simple fractions lying close together
always differ by something comma-like. So no single weighting can prefer both
"simple" and "nearby". Drone-based traditions solve it the other way round:
against a sounding root a note *means* its ratio to the root, and the step from
the previous note is allowed to be an ugly number because nobody is hearing it as
a ratio. That is the arrangement used here.

A note is therefore drawn by two separate costs added together, both in bits: how
far the destination is from the root, and how far the ear has to jump to reach it.
The second is measured in cents through one constant — 200 cents is worth one bit
— which is the engine's only frankly empirical number. It exists because a line is
only heard as *one* line when consecutive notes are close.

The drone has no fifth, incidentally. A tanpura's second string is not a fifth by
law; it is the note the raga leans on. There is no 3/2 in this hexany, and adding
one puts a beating clash 49 cents away from a note the melody actually plays.

## A phrase is a departure and a return

The engine builds patterns out of the ratio logic and assembles the piece from
them, rather than generating note by note and hoping a pattern emerges.

To invent a phrase: start at the root and draw moves one at a time from the
distribution above. The phrase ends when it arrives back at 1/1 — so closure is
not a rule imposed on it, it is the condition for the phrase being finished. It
must first have used at least as many moves as there are notes currently in play,
which means the opening phrases are bare and they grow as the piece opens out,
with nobody setting a length.

A phrase is then stored as **what it does, not where it goes**: each note as its
ratio to the note the phrase started on. So it has no pitch of its own and can be
played from anywhere, exactly — a just interval transposed by a just interval is
still a just interval, with no rounding and no nearest note. Because it closes on
its own starting pitch, closure survives transposition too.

Crucially, a phrase is invented **once**, as a fixed object: its pitches, its note
lengths and its shape of rises and falls, all three together. This was learned by
its absence. An earlier version used nine distinct phrases across two thousand
statements — genuinely repetitive — and almost none of those restatements
*sounded* like the same phrase, because the rhythm was redrawn each time, each
note's octave was chosen nearest to wherever the voice happened to be, and a
per-note silence gate was punching holes through it. A pattern that cannot be
recognised is not a pattern.

## Rhythm from the same arithmetic

A pitch ratio and a rhythm ratio are the same relationship at different speeds.
3/2 means one wave cycles three times while the other cycles twice; heard
hundreds of times a second that is a chord, and slowed to a few events a second it
is three beats against two.

So every duration is a whole number of one shared unit, and which whole number is
drawn in proportion to 1/n — doubling a note is one bit and common, making it
five-quarters as long is four bits and rare. The same arithmetic that chooses the
pitches. Rests between phrases are whole numbers too: when a rest was scaled by a
fraction, the part slid off the shared grid and stayed off it for the rest of the
piece. The voices move at 1, 1/2 and 1/3 of each other's speed — the harmonic
series used as a tempo relation, so the bass strides while the top fidgets.

## Development: there is one move

Variation is deliberately *not* a list of named devices — backwards, upside down,
a note added, a note held. Those are edits to a *word*: things you would do to any
string of symbols, with nothing about them coming from the numbers, which makes
them a table of hand-picked options in disguise.

Instead there is one move, in two worlds. Either one note of the phrase goes to a
different member of the set, drawn by the complexity of the ratio between where it
was and where it goes; or one note becomes a different whole number of beats and
another note gives up or takes on the difference, drawn by the complexity of that
ratio. Pitch and rhythm are varied by the same rule, the phrase still occupies
exactly the time it did, and closure survives both, because only the inside of the
phrase is touched.

## How the music comes home without being told to

The distance between two phrases is measured in bits: note against note, length
against length, the complexity of the ratio between them, summed. Identical
phrases are nought apart, a phrase and its child a few bits, unrelated phrases
infinitely far — they are not the same shape at all.

A section stores the phrase it *means*. What actually gets played is drawn from
around it, weighted by 2^−(distance from what was meant) — the rule the notes
already follow, one level up. The original is at distance nought, so it is always
the likeliest thing; a child a few bits away is a few times less likely; a
grandchild thinner still, so the family thins out by itself. Measured over ten
minutes: 70% of statements are exactly as intended, 28% are one small change away,
2% further out, and the median distance is zero.

There is no counter deciding when to return and no rule that a variation must be
answered. The music goes back to a shape for exactly the reason it goes back to
the root — home is the most probable place to be.

A **section** is a short run of phrases, remembered and reused as one thing. It is
the same machinery again: a section is a word over phrases as a phrase is a word
over moves. The notion of a level appears nowhere in the mechanism. What differs
is only the rate — a phrase is a few seconds, a section most of a minute, and a
section is forgotten four times faster than a phrase.

## The long shape: unfolding and folding back

The piece does not begin with its whole set of pitches. It admits them one at a
time, simplest against the root first, the way an alap unfolds a raga — so the
most remote note arrives last and lands as an event, and the opening has almost
nothing in it.

There is a subtlety. In a product set the *simplest* members are the ones
*furthest apart*, so admitting them in order of simplicity gives an opening in
which no small interval exists at all and the line can only leap: 3% stepwise
motion, against 47–65% in a corpus of human melody. The piece therefore opens with
the fewest simplest notes that have at least one step between them, where a step
is already defined by the one constant about the ear. Steps went to 56%, and no
new number was needed.

What drives the unfolding is a single counter of whether the piece has just said
something it has said before. When it has settled for long enough — the threshold
is the cube of how many notes are in play, since the phrases available from k
notes grow roughly as a power of k — the piece admits one more note. And when
everything is already in play and it settles again, the same test takes its other
branch: it returns to what it opened with and unfolds again, over the vocabulary
it has built by then. One counter, one threshold, no clock anywhere. Measured over
three hours, the cycles run 60 to 90 minutes.

## Texture, and what a listener can steer

There are two voices by default, sitting in separate register bands that open out
as the piece unfolds. Whether a voice plays a given phrase at all is decided once
per phrase and not per note — silence between phrases is breathing, while holes
shot through one are just a different phrase every time. At the usual settings the
music is sparse, about 1.65 notes a second, with gaps of half a minute or more in
which only the drone sounds. Those long silences are deliberate: filling them in
was written, measured, and reverted, because it flattened the music.

Five controls, each a musical intention rather than a weight: how fast, how
adventurous, how long it remembers, how many parts, how busy.

There is a panel of remembered shapes, each fading with age, and clicking one
**pins** it. That means something exact rather than something approximate: a
pinned shape stops fading, and it sits at distance nought from wherever the music
is — so it is home everywhere, and it can arrive in the middle of a family it has
no relation to at all. Measured, a shape that was 1% of what got played becomes
45% once pinned.

## What happens when you play it yourself

The page is also an instrument. While you play, the generated parts hold back —
carried forward rather than paused, so they do not build up a debt of notes and
discharge it in a burst the moment you stop.

When you stop, what you played is kept, and the joining needed almost no new
machinery, because a played phrase and a written one are the same kind of object.
Each note is divided by the first, the gaps between onsets are rounded to whole
beats of the engine's own grid, and the rises and falls are taken from what you
actually played rather than recomputed. A rising 1/1 9/8 5/4 3/2 2/1 comes back as
0, 204, 386, 702, 1200 cents, exactly.

What it then becomes is the important part. It is not offered as a candidate to be
judged against what the music meant — a played shape is far from anything the
engine wrote, and on that footing it measured 0% of what got played. Nor is it
pinned, which made it 54% of everything for as long as the session lasted: a
looper, not a musician. **A shape somebody played is not a candidate to be judged
against what the music meant. It is a new thing for the music to mean.** So the
piece states it, answers it and states it again, and from there everything already
built does the rest: it is varied one ratio at a time and returned to, because
that is what this engine does with anything it means.

Measured over an hour after playing a rising 1/1 9/8 5/4 3/2 2/1, the shape and
its descendants are 13% of the phrases in the first five minutes, 5% in the next
five, 1% by the fifteenth and nothing after. Played back, then absorbed, then
surviving transformed for a while — which is what happens to a phrase you give a
musician.

## What it deliberately does not do

**Nothing is rounded to a fixed set of notes.** Two ratios that are close but not
equal stay two different pitches, and the small gap between them is the material
this project is made of.

**No tables, no hand-set weights, no predefined patterns.** If a number must
exist, it is derived from the ratios in play.

**No ranking.** This last constraint came from a failure. An earlier engine scored
each candidate note by a weighted sum of terms — roughness against what was
sounding, simplicity against what was remembered, pull toward home, size of the
melodic move — and then picked one. It could not be made to work, and the reason
was structural rather than a matter of weights: a chooser that reliably takes the
cheapest option produces a degenerate distribution however good the cost function
is. It repeated a note four times in a thousand where real melody does it about
one time in six, and it leapt constantly — static and chaotic at the same time,
which is what it sounded like. No setting anywhere in a three-parameter sweep
brought the output inside the range that human music occupies.

The requirement that replaced it is the whole design: **produce a distribution
over what happens next, not a ranking.** And the weights are drawn at their own
strength, because a prior that gets flattened whenever it says something is not a
prior.

---

The reasoning behind every decision above, the measurements that settled them and
the things still open are in
[DESIGN.md](https://github.com/VasiliyRyabtsev/ratiosynth/blob/master/DESIGN.md).
The composing engine is three files in
[explore/ratios/](https://github.com/VasiliyRyabtsev/ratiosynth/tree/master/explore/ratios).
