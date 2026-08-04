# ratiosynth — design

A browser-based visual playground for music built on pitch *ratios* rather than
fixed scales. It does both sound synthesis and composition, live and steerable,
with the internal state visible while it runs. No written scores, no notation.

---

## 1. The core idea

Whether two notes sound good together depends on their overtones — the extra
frequencies stacked above every real sound. When overtones line up, we hear
consonance. When they land close but not on top of each other, we hear roughness.

That means **the scale that sounds good depends on the sound you are using.** A
sawtooth wave has overtones at 1, 2, 3, 4, 5× the base pitch, so it likes simple
ratios like 3/2 and 5/4. A bell has strange overtones and likes strange intervals.

So the organizing principle of the whole project:

> **One set of ratios drives both the overtones of the instrument and the pitches
> of the notes.**

Any scale we invent can be made to sound consonant, because the instrument is
built to match it. If an exotic scale sounds bad, the answer is not "that scale
is bad" — it is "that was the wrong sound for it."

This also means the boundary between instrument and score is deliberately blurry.
They read the same numbers.

## 2. Pitch is a ratio, not a frequency

Inside the system a pitch is stored as a **ratio** — as exponents of primes
(2, 3, 5, 7, 11, …), e.g. 3/2 is `[-1, 1]`, 5/4 is `[-2, 0, 1]`. Never as Hz.

Conversion to Hz happens once, at the very end, in the voice that makes sound.

Everything downstream depends on this:

- We can show *why* a note is where it is.
- The whole piece retunes by moving one reference number.
- "Are these two consonant?" is answered structurally, not by measuring.

If pitch becomes a float early, every relationship is destroyed and there is
nothing left to visualize.

### No tempering — decided

Tempering means deliberately treating two nearby but different ratios as the same
note, so the scale closes into a fixed set. Every keyboard instrument does it.
We do not. Two ratios that are close but not equal stay two different pitches, and
the small gap between them is exactly the material this project is made of. Eastern
scales keep those gaps and that is where their character comes from.

So there is no rounding step anywhere, and no fixed set of notes to round *to*.

This paragraph is the only place in the project that names the idea, and that is
deliberate. The rest of the code has no notion of it — not a comparison mode, not
a unit defined against it, not a bucket named after a keyboard degree. Naming a
thing you do not do keeps inviting you to do it: it was worth a sentence here so
it could be worth nothing anywhere else.

### How many primes — decided

The model allows any primes: 7, 11, 13 and beyond are all valid pitch coordinates,
because they are musically interesting and cost nothing to store.

The lattice *display* starts at 5-limit — only 2, 3 and 5 — because that draws
cleanly on a flat screen (right = ×3/2, up = ×5/4). Higher primes need more
directions than a screen has. How to show them is left for later; a note using
them still sounds correctly, it is just harder to place in the picture.

## 3. No fixed scale

We do not pick N notes out of infinity. Instead:

**Each new pitch is chosen by scoring candidates against everything in recent
memory** — not against a fixed home note, and not against a single anchor.

Pitch space is then genuinely infinite and unquantized, but every individual
moment is simple. The ear follows it easily, because the ear compares notes to
their neighbours rather than checking them against a list.

### Two scores, not one

Notes still ringing and notes that have just ended affect a new note by different
mechanisms, and they must be scored separately.

**Harmonic score** — against notes *sounding right now*. Their overtones are
physically in the air together and actually beat against each other. This is about
roughness, and it applies only to notes literally playing.

**Melodic score** — against the recency-weighted memory, *including notes that have
ended*. Those can't beat with anything, but the ear still hears a new note in
relation to them. This is about how simple the ratio is, not about roughness.

The two combine with a balance knob, which is musically meaningful: harmonic-heavy
produces music about chords and blend, melodic-heavy produces music about line and
motion.

**Neither score is something to minimise.** Always picking the smoothest available
note gives the most boring available music. So each score has a *target* rather than
a direction: aim at smooth, aim at rough, or anywhere between. Same for simplicity.
That one change is most of the difference between sterile and alive.

One thing had to be added that the design did not anticipate: **a cost for doubling
a pitch already sounding.** An octave of a note that is playing is the smoothest and
simplest thing on offer every single time, so without a penalty the music stacks
octaves and never finds a new pitch. It is a knob, not a rule.

Scoring against the whole weighted set (rather than picking a ratio to one anchor)
also handles the case where several sounding notes disagree about what is simple —
the weighted scores just sum.

### The mistake that took longest to find

For a long time the melodic score used **lattice distance where it needed pitch
distance**, and they are not the same question. 3/2 is about as simple as a ratio
gets, and it is also a leap of 702 cents. Scoring a move only by how simple the
ratio is therefore *rewarded every line for jumping about*.

Measured over a few hundred notes, the result was 39% repeated notes and 34%
leaps of a fourth or more — static and chaotic at the same time, which is exactly
what it sounded like. Nothing in the design said to do this; it was simply an
assumption never examined.

So a third term: **how far the line moves in pitch**, scored against that line's
own previous note rather than against the sonority as a whole. Its shape matters.
"Prefer small moves" is wrong — it settles on repeating one note forever. The cost
is dear at zero, dear again far out, and cheapest around a step of a hundred-odd
cents. With it, the same measurement gives 62% steps, 34% thirds, and almost no
leaps.

This also clarifies a division of labour that was muddled before. **The field
decides which pitches are available; the chooser decides voice leading.** Once
harmony is constrained by the field, the chooser's real remaining job is how each
line moves through it.

### Sections have to breathe

Every phrase carried identical weight, which reads as flat however good the notes
are. So the time the field stays put is a **section**, and a section swells and
recedes: louder and fuller in the middle, quieter and thinner at its edges. One
knob, and at zero it is exactly as flat as it was before.

One sizing mistake here too. The phrase was defined as the point where every
layer's cycle realigns — the lowest common multiple — which for cycles of 12, 10
and 8 is 120 pulses, half a minute. Sections were running two minutes and no arc
was audible. The phrase is now the longest layer's cycle; full realignment still
happens and is a bonus rather than the unit structure is counted in.

### Drift

Walk up by 3/2 a few times and back down by 5/4 and you don't land where you
started. The pitch centre slowly wanders. This is not a bug to fix — it is a
control:

- One end: free walk, never returns, the centre drifts forever.
- Other end: a gravity that pulls back toward a reference pitch.

No conventional tuning system can even express this knob.

### The harmonic field — added after listening

There is a difference between *not having a fixed scale* and *choosing every note
freshly from the whole neighbourhood*, and the second one is what the first build
actually did. It sounded like churn: the material never stayed still long enough
to be recognised, so nothing related to anything.

So a **field**: a small set of lattice points, held for several phrases, then
deliberately moved — the whole set steps somewhere else. Within a few seconds the
material is consistent; over a minute it has travelled.

This does not contradict "no fixed scale". The set is derived from the lattice
rather than chosen from a list, it is never the same set for long, and nothing in
it is rounded. It is a moving window on infinity.

Two things fall out that are worth having:

- The field around 1/1 comes out as **1/1, 3/2, 4/3, 5/3, 5/4, 6/5, 8/5** —
  both thirds and both sixths, a rich just set — with nothing written down. It
  is what "nearest on the lattice" means.
- Moving the field is a **modulation with nothing approximated**. Shift by 3/2
  and every internal relationship is identical, exactly, because transposition
  here is exact. Roughly four of seven pitches survive a move, so it is heard as
  a pivot rather than a cut. No keyboard can do this.

Speed of movement is the harmonic rhythm, and it is a knob. Holding the field is
what lets material settle; moving it is what stops the music being one chord
forever.

### Constraints are configurable, not built in

Whatever limits comprehensibility — how many relationships at once, how much
recurrence, how far a step may jump on the lattice — these are **parameters in
the playground**, not rules baked into the engine. Exploring the constraint space
is part of the instrument.

## 4. The Sonority block

Choosing pitches against "what's sounding" means information travels *backwards*,
from the voice pool at the output end to the decision blocks upstream. Almost
every interesting block wants it: the pitch chooser, the drift control, voice
allocation, rhythm layers, timbre matching, density control, and all the displays.

Rather than a hidden global, this is an **explicit block you place in the patch**.
Blocks that need it take a visible input from it. "A block only knows its inputs"
stays literally true; this is simply the one block whose contents are derived from
downstream, and it is marked as special so nobody is surprised.

It is *shared*, not global — there can be several. A bass layer can track only
itself while an upper layer tracks everything. That is a genuinely musical control
and it comes free.

The cycle it creates is resolved by a one-tick delay: a new note is chosen against
notes that already started. That is not a workaround, it is what we mean.

### What it holds — two layers

**The facts.** Which notes are sounding, as ratios, with their ages and loudness.
Directly observable, no interpretation.

**The reading.** What those facts imply: where the tonal centre seems to be, how
far pitch has drifted from the reference, current density and tension, which
direction the recent path through the lattice has been heading.

The second layer is inferred, and it is where the musical intelligence lives.
"Pick a simple ratio to what's sounding" gives local coherence but no direction;
"the centre has drifted sharp and density is climbing" is something a process can
actually steer by.

Because it is inferred, it can be **ambiguous** — two candidate centres, roughly
equally supported. That is not a flaw. Ambiguity of centre is one of the strongest
tension devices in music. Report it with a confidence and compose with it.

### Estimating the tonal centre

Every remembered pitch is a point on the lattice. Ask: **which point, treated as the
origin, makes all the current notes have the simplest ratios?**

1. Take candidate origins — the sounding notes themselves, plus nearby *unoccupied*
   lattice points.
2. Express every remembered note as a ratio relative to each candidate.
3. Score each ratio by complexity. Cheap standard measure: for n/d, log2(n × d).
   3/2 scores 2.6, 45/32 scores 10.5. Lower is simpler.
4. Sum, weighted by each note's memory weight.
5. Lowest total wins.

Three things fall out for free:

- **Confidence is the margin** between best and runner-up. Two near-ties means
  genuine ambiguity, now as a number.
- **Drift is measurable** — compare the estimated centre against the reference point
  and that is the input the gravity knob needs.

Both of those work as described. The third thing we expected does not:

- **The centre needn't be a sounding note — but in practice it always is.** The
  hope was that an absent root would be found by testing empty lattice points.
  It cannot be, and the reason is structural: a candidate that *is* one of the
  sounding notes scores zero for that note, and no empty point can beat a free
  zero. Play only 5/4 and 3/2 and the answer comes back 3/2, not the missing 1/1.

  That answer is not wrong — with two notes the root is genuinely ambiguous, and
  3/2 is a defensible reading. But the implied root does not emerge on its
  own. Two ways out, neither taken yet:

  - **Gravity does it already.** Home is an unoccupied point, and turning gravity
    up lets it win. This works today, and it means the mechanism is "pull toward
    a reference", not "discover an implied root".
  - **A different measure would do it properly.** Express the notes as whole
    numbers over a common base and take their greatest common divisor — for
    5/4 and 3/2 that gives 5 and 6 over 4, whose common divisor sits exactly on
    the absent 1/1. This is the classical account of an implied root and it gets
    the right answer directly. What it loses is everything the current measure
    gives: no weighting by memory, no confidence, and one odd note drags the
    answer a long way.

  Worth revisiting when note choice actually depends on it.

### Memory

A note that stopped half a second ago still colours how the next one is heard.
So the sonority is **recency-weighted and includes notes that have already ended**,
with a decay per entry.

Memory length is a knob: short → purely reactive, moment to moment; long →
coherent across a phrase but sluggish to respond.

## 5. Sustain, not drone

The good part of ratio-based tuning — the beating, the way notes lock together and
fuse — takes time to become audible. Short plucky notes throw the point away.

So: discrete voices (general), but **long notes**, long release tails, overlapping
voices. Plus a **background tone** element that dials continuously from full drone
down to nothing. We expect to live somewhere in the middle.

## 6. Synthesis

### Making it sound alive

Four things do most of the work of separating "alive" from "dead":

1. **Per-overtone envelopes.** High overtones must fade faster than low ones. A
   plucked string is bright for a moment then mellow. Uniform decay is what makes
   synthetic sounds obviously synthetic. This one rule is most of the difference.
2. **The attack.** The first ~20 ms — hammer click, bow scrape, breath noise — is
   what identifies an instrument. A very short noise burst at onset goes a long way.

   *Built, with a correction.* Noise alone is not enough: it made the same note come
   out five times louder on one strike than the next. The resonators are extremely
   narrow, so how hard each one gets pushed depends on what the noise happened to
   contain at exactly that frequency, and that is a coin flip. The strike is now a
   clean hit — which contains every frequency equally and so excites every partial
   by a predictable amount — with noise mixed in on top for the sound of contact.
   The mix is a knob. Note-to-note level now varies by a few percent instead of a
   factor of five.
3. **Tiny independent drift.** Each overtone wobbles a few cents, slowly and
   randomly. Not chorus — chorus is a wide obvious smear; this is a barely
   perceptible flutter inside a single voice.
4. **Louder = brighter.** Link loudness to overtone brightness and things feel
   physical.

### Which method

**Modal synthesis is the sweet spot.** Sharp resonators that ring at one pitch,
excited by a short noise burst. Physically that is a struck bell or a plucked
string. Per-overtone decay comes built in, the attack comes from the excitation,
and the resonator frequencies are simply a list of ratios — the same data
structure as the scale.

**Additive** works too, but static additive sounds like a cheap organ. It needs
the four rules above applied explicitly.

**Subtractive is fine and not in conflict.** The rule is:

> Anything that only changes the **loudness** of overtones that already exist is
> safe. Anything that **creates new frequencies** needs care.

Filters only change loudness — use them freely. Distortion invents frequencies
unrelated to our tuning — avoid, or treat as a deliberate effect.

Bonus: a sawtooth's overtones are exactly the harmonic series, and just-intonation
ratios are derived from the harmonic series. So subtractive is already matched to
the ordinary ratios. It stops working exactly where we go exotic (7, 11, 13-limit,
stretched spectra) — that is where modal/additive is required.

Also: a resonant filter peak *is* a pitch, so filter cutoff can be tuned to a
ratio. The filter becomes part of the tuning system rather than sitting outside it.

Wide chorus/detune across voices smears the exact frequency relationships we work
to produce — avoid. Reverb and stereo spread help a lot with many voices; cheap
wins.

### Where the two ratio lists come from

There are two lists of ratios in the system and they are different things:

- **The instrument's overtones** — ratios above *one note's* fundamental.
  Harmonic: 1, 2, 3, 4, 5. Bell-like: 1, 2.7, 5.4, …
- **The scale** — ratios *between different notes*. 3/2, 5/4, 7/4.

The core principle says they should agree. The design question is where each comes
from:

**One source.** A single ratio set; overtones placed at those ratios, playable
pitches at those ratios. Consonant by construction — but nothing ever rubs, and
everything fuses into one enormous tone. This is the sterile failure mode.

**Two sources plus coupling.** Instrument and harmony each have their own list, and
a knob controls how strongly one pulls toward the other. Full coupling collapses to
the single-source case; zero is independent; the interesting territory is between.

**The coupling has a direction, and both directions are wanted:**

- *Instrument follows harmony* — timbre morphs as the chord changes. Always
  consonant, slightly uncanny, a sound that can only exist in software.
- *Harmony follows instrument* — fix a strange instrument and let the good-sounding
  pitches be dictated by it. Closer to how acoustic instruments have always
  constrained musical traditions.

So the control is a **direction plus an amount**. The deviation knob below is the
small, always-on version of this.

### How closely overtones follow the tuning

A perfect match is *too* clean — everything fuses into one giant organ tone and
feels lifeless. Real pianos have slightly stretched, imperfect overtones and sound
better for it.

So: **follow by default, with a deviation knob.** Zero deviation is the pure fused
version; turning it up introduces controlled mismatch that produces beating and
movement. Sterile becomes one end of a control rather than a trap. Expect to live
around 10–20%.

## 7. Rhythm from the same numbers

A pitch ratio and a rhythm ratio are the same relationship at different speeds.
3/2 means one wave cycles three times while the other cycles twice — hundreds of
times a second, so we hear a chord. Slow the identical relationship to a few
events per second and we feel three beats against two.

So if the current harmony is 4:5:6, rhythmic layers can pulse at 4, 5 and 6 events
per bar. Change the harmony and the rhythm follows automatically, because both
read the same list. Composition falls out of the same machinery instead of needing
a separate sequencer — which is also how we avoid ever writing a score.

### Built: the chord sets the rhythm

Getting the numbers out of a chord turned out to be free. Express every sounding
note as a whole number over a common base — which on the lattice is just the
smallest exponent used on each prime — and the chord 1/1, 5/4, 3/2 comes out as
**4, 5, 6** directly. Those become the periods: one part plays every 4 pulses,
another every 5, another every 6.

They come back into line every 60 pulses, and that is a phrase. Nobody chose the
phrase length — it is what those three numbers do together. Change the harmony
and the rhythm changes with it, because they were never separate things.

### Built: patterns, not pulses

The first version gave each layer a plain period — it played every N pulses,
full stop. Three layers at 6, 5 and 4 are polyrhythmic against each other, but
*nothing inside a part was uneven*, so the combined result was a near-even
stream of events. It was monotonous, and it was monotonous by construction.

The fix is to spread a few onsets as evenly as possible through a longer cycle,
which is uneven whenever the count does not divide the cycle. Three in eight
comes out `x..x.x..` — long, long, short — which is the most common rhythm on
earth, and nobody had to write it down.

Three things fell out of it:

- **Note lengths vary for free.** A note lasts until its part's next onset, so
  the sparse places in a pattern give long notes and the busy places give short
  ones. Nobody decides that separately.
- **The pattern repeats exactly**, which is the rhythmic recurrence §8 asks for
  and which the pitch-shape pool alone could not provide.
- **An accent on the first beat of a cycle.** Without one a pattern is only a
  list of onsets; with one it has a shape you can feel.

Two sizing rules were needed. A short cycle has nowhere to be uneven, so cycles
are doubled until they have room. And a count that divides the cycle exactly
spreads out evenly — two in six is just every third step — so it is nudged until
it does not. Layers also get slightly different densities, sparser at the bottom,
which stops two parts that happen to share a cycle length from producing the
identical pattern and locking together.

## 8. Generating moves, recurrence, and sanity

### The generator: cellular automata on the lattice

The lattice already *is* a grid, so an automaton sits on it with no translation.
Cells are lattice points; neighbours are literally the ×3/2 and ×5/4 relations, so a
rule about neighbours is automatically a rule about harmonic relatedness.

Two layers:

- **The automaton proposes.** It evolves over the lattice and lights up regions. It
  knows nothing about music — it just produces structured, evolving patterns.
- **Consonance disposes.** A proposed cell becomes a note only if it scores well
  enough against the sonority and there is room in the density budget.

That separation is what stops the automaton turning into noise: structure comes from
the generator, coherence from the scoring, and neither has to do the other's job.

**Grammars are deprioritised** — the rules have to be hand-authored, which is writing
a score with extra steps. (A grammar over lattice *moves* rather than notes is more
tractable, but still authored, so not first.)

**Random walk is not a competing option.** Weighted-random selection among
well-scoring candidates is the fallback layer under everything else — what happens
when nothing more structured has an opinion.

### What recurs

Recurrence rather than a small pitch inventory is what makes this comprehensible, so
the unit of identity matters.

**A gesture is a shape on the lattice, not a set of pitches.** "Right, right, up-left"
is an identity; start it anywhere and it is recognisably the same gesture.

This system has a property a fixed set of notes cannot have: **transposition is
exact and free.** Move a shape anywhere on the lattice and every interval inside it
is preserved perfectly, because the move is an addition on the exponents and the
distances between them do not change. Nowhere else does a shape survive being
moved. Lattice shape
isn't just *a* candidate for the unit of recurrence — it is what this system is
unusually good at.

Two more carriers, because pitch relations alone are a lot to ask a listener to track:

- **Rhythm.** The most robust carrier there is — survives transposition, register
  change, timbre change. If harmony is fluid, rhythm should be the memorable thing.
- **Register, timbre, density.** A voice that always appears low and always sounds the
  same way is recognisable whatever pitches it plays. Nearly free, does a lot of work.

Many CA rules also produce oscillators — patterns that cycle with a period — so some
recurrence emerges from the generator rather than being imposed.

**How gestures get remembered — decided.** The system does it, you steer. It keeps a
pool of the shapes it has recently played, and when it wants to repeat something it
picks from that pool. Entries fade out over time, the same way the sonority's memory
in §4 fades, so the pool stays current on its own.

Manual control exists but is secondary: a **pin** that stops one entry from fading, so
a shape you liked keeps coming back. That is the whole manual interface — no marking
things out by hand as a precondition for anything working.

This avoids the hard version of the problem. Nothing has to *recognise* a repeated
shape in the output; the system simply remembers what it played and reuses it.

**Built, with two corrections.**

*A repeated shape ran away with the music.* Replaying a shape from wherever the
part happened to be means any shape with net displacement moves the music further
every time it comes round — after a few minutes the ratios were 1296/625 and the
music had wandered off the lattice entirely. Fixed by starting every repeat from a
freshly *chosen* note: same figure, new starting pitch, which is what music does
anyway. There is also a limit that abandons a shape which has carried a part too
far out.

*Nothing pulled the music home.* §3 describes gravity as a knob, but it was only
ever applied to the *estimate* of where the centre is — nothing acted on the notes.
Each step was locally sensible and the sum of them was a wander. Gravity now also
costs candidates by their distance from the reference, which is what §3 meant.

One sizing mistake worth recording: shapes were first recorded per phrase, which
meant a part whose period equalled the phrase length played exactly one note per
phrase and never had a shape to remember at all. Shape length is now its own
parameter, independent of the phrase.

### Density control

Not a voice count — a **roughness budget**. Compute the total roughness of what is
sounding; if adding a note would exceed a threshold, don't add it, or drop something
first. Better than counting voices because it is perceptual: five consonant notes are
clearer than three that clash. Roughness is already computed for the display, so it
is free.

Three layers, cheapest first:

1. **Register spacing.** Low notes clash far more than high ones — a third in the bass
   is mud, the same third two octaves up is fine. Wide at the bottom, narrower toward
   the top. Cheap and remarkably effective.
2. **Roughness budget**, as above.
3. **Hard voice cap** with stealing (oldest or quietest). A backstop so it can never
   run away.

## 9. Visualisation

Boxes and wires are standard and not the point. These four show things no existing
tool shows:

**The lattice.** Pitch as a *position*, not a number. Step right = ×3/2, step up =
×5/4, diagonals combine. Every pitch is a dot; distance between dots is how
related they are. Light up what's sounding, leave a trail as the music walks. You
are watching harmony move through a space.

**The roughness curve.** X = interval size, Y = how rough it sounds *with the
current instrument*. It has valleys — the intervals this sound likes. Plot the
playing notes on it. In the valleys or on the slopes? One glance tells you why the
chord sounds as it does.

**Spectrum with colour-coded overtones.** Standard frequency display, each overtone
coloured by which note owns it. Consonant notes share overtone positions, so you
see two colours stacked on one line. The core idea of the project, as a picture.

**Lissajous figures.** Two notes into an X/Y plot: 3/2 draws a specific closed
loop. In tune it holds still; slightly out it slowly rotates; out of tune it's a
mess. An exactness meter that is also beautiful.

## 10. How it runs

Live and steerable — processes run continuously and are steered in real time,
not configured and rendered.

Consequences:

- No analysis passes that take noticeable time. Expensive things (the roughness
  curve) are cached and updated in the background.
- Event scheduling needs lookahead — compute events some tens of ms ahead of the
  audio clock rather than firing them on time.
- Audio-rate DSP belongs in an AudioWorklet (a bank of partials/resonators), not
  in a large graph of individual Web Audio nodes.
- Two clock domains: audio-rate synthesis, and event-rate composition.
- **The parameters we choose to expose *are* the instrument.** That is the real
  design work of the project.

## 11. Build order — knobs before wires

The visual node editor is a bottomless engineering surface and will consume months
before anything sounds good.

So version one is a **fixed setup** — one instrument, one process, no rewiring —
but every parameter is a live slider you can grab while it plays. That is already
a playground. Only *rewiring* is deferred.

The reason is not just effort. We cannot design good blocks until we've found out
by playing which parameters actually matter. Guessing at block boundaries first
means rebuilding them later.

Rough order:

1. Ratio model (prime-exponent pitch, ratio arithmetic, complexity measure,
   reference conversion). **Done.**
2. One instrument — modal, with the four aliveness rules. **Done.**
3. The Sonority object (facts + reading + memory), including tonal-centre
   estimation. **Done.**
4. Candidate scoring (harmonic + melodic) driving voices from the sonority.
   **Done**, and it needed the roughness model brought forward from §12.
5. Rhythm layers from the same ratios, and separate parts. **Done** — see below.
6. Recurrence: shapes kept and replayed. **Done** — see below.
7. The harmonic field, so the material holds still long enough to be heard.
   **Done** — see §3.
8. Voice leading and section dynamics. **Done** — see §3. This is where the
   melodic-distance mistake was found.
9. The lattice display.
10. Register spacing and roughness budget.
11. Roughness curve, spectrum, Lissajous.
12. CA generator proposing lattice moves.
13. Only then: turn the fixed setup into connectable blocks.

### Where this stands

Everything through step 8 is built and covered by tests, which run with
`node --test` and need no framework. It plays, it holds a key for a while and
modulates, the parts have their own rhythms and lines, shapes recur, and sections
swell. It is **not yet good enough to listen to for pleasure**, and the verdict
after the last round was "a little bit better".

The one structural gap known and not yet closed: **every layer shares a single
instrument**, so the parts blend into a wash and the register separation does far
less work than it should. Giving each layer its own timbre is the obvious next
move, and it is also the point where §6's coupling between overtones and tuning
starts to matter.

### On the number of knobs

There are now more parameters than anyone can hold in their head, which is itself
a symptom: a large space in which most positions do not sound like anything. The
answer is not fewer knobs — the point of the project is that the constraints are
adjustable — but **landmarks**. A handful of presets mark the corners that work,
everything beyond the dozen musical controls folds away, and the full set is one
checkbox away for when it is wanted.

### Why rhythm and recurrence moved forward

They were originally steps 9 and 10, after all the displays. That was wrong, and
listening to step 4 proved it: with the note-choosing machinery finished and no
structure-making machinery at all, it sounded like *"a random sequence of sounds
without inner logic"* — which is exactly what it was. Every note was an
independent decision scored against the ones before it, which is a scored random
walk however good the scoring is.

Nothing recurred, there was no pulse, and there were no separate parts, so there
was nothing for the ear to recognise coming back. The doc had already said as
much in §8; the build order just had it in the wrong place. **Structure before
pictures.**

## 12. Still open

**How do we put a number on "rough"?**

The whole project leans on knowing how rough two notes sound together. We need an
actual formula. The basic effect is simple: two pure tones very close in pitch but
not identical produce a buzzing, unsteady sound. Identical — smooth. Far apart —
smooth. Somewhere in between — worst. So roughness for one pair of tones is a small
bump-shaped curve.

Real notes have many overtones, so you compare every overtone of one note against
every overtone of the other, weight each pair by how loud those overtones are, and
add it all up. That gives a number.

*Built, and it was as low-risk as expected.* The bump is placed at about a quarter
of the distance the ear needs to separate two tones, and widens as pitch falls.
Sweeping an octave puts the valleys exactly on 5/4, 4/3, 3/2 and 5/3 without any of
those being written down anywhere — which is the premise of the project, now
measured rather than assumed. Speed was never the problem it looked like: most pairs
of partials are too far apart to interfere, so a moving window skips them and gives
an identical answer.

Two things worth knowing, both discovered by building it:

- **Roughness cannot tell 5/4 from 81/64.** Twenty-two cents apart, and near enough
  identical in roughness. Physical beating simply does not distinguish them. This is
  not a defect — it is the argument for the melodic score existing at all, since
  simplicity of ratio is the only thing that separates those two.
- **Fifths and octaves are the smooth intervals; thirds are genuinely rougher.** So
  asking only for smoothness gives bare fifths and octaves forever. The taste for
  roughness is not decoration, it is what makes harmony richer than a drone.

**Where does the automaton live?**

The lattice has no edges — it goes on forever in every direction. But a cellular
automaton needs somewhere for its cells to be: either a fixed patch that slides along
to follow the tonal centre, or no boundary at all with only the points in use stored.

*Deliberately postponed.* Too abstract to settle before there is something on screen
to look at and click. It is step 9 of the build order; by then the lattice display
exists and the answer will be obvious from watching it.

**Is the composition engine the right shape at all?**

Answered, and the answer is no. Recorded here because it cost a long time to find
and because the way it was found matters as much as the finding.

The engine in `choose.js` scores each candidate note with a weighted sum of terms
— roughness against what is sounding, simplicity against what is remembered, pull
toward home, size of the melodic move — and then picks one. Measurement against a
corpus of eight thousand folk melodies and the Bach chorales (`tools/`, and see
below on what that corpus is and is not for) found three things.

- **The melodic move curve was invented and wrong.** It made standing still the
  most expensive move available. Real melody repeats a note about one time in six.
  Ours did it four times in a thousand. It also made an octave leap barely dearer
  than a third, so real melody leapt one time in eight where ours leapt one in
  twenty-seven. Everything piled into a single narrow hill of medium-sized moves,
  which is what "chaotic yet monotonous" sounds like from the inside.
- **A voice's own sounding note was counted in the harmony it was judged against.**
  A unison adds no roughness at all, so repeating a note scored as perfectly smooth
  and the harmonic term quietly recommended standing still on every decision. This
  is the same family of error as §4's implied root: a candidate must not be scored
  against itself. **Fixed.**
- **The real defect is structural and survives any weights.** The picker takes its
  cheapest option far more often than not, because the temperature it samples at is
  much smaller than the spread of every cost term. A chooser that reliably takes the
  argument of a minimum produces a degenerate distribution no matter how good the
  cost function is. No setting anywhere in a three-parameter sweep brought the
  output inside the range human music occupies.

So the weighted-sum-of-costs approach is being replaced rather than tuned. The
requirement it failed is worth stating plainly, because it constrains the
replacement: **the aim is a distribution over what happens next, not a ranking.**

A corpus-derived cost curve was tried as a fix and then removed. It works, and it
is the wrong kind of solution: reading the curve off European folk melody smuggles
the diatonic scale into a project founded on refusing that inheritance, and a
fitted table is exactly the sort of thing this design is trying not to contain.

**What the corpus in `_dev_data` is for.**

It is a check on output, never a source of numbers. `tools/lines.js` measures a
Hungarian folk song and our own output with the same code, so the comparison
cannot drift. Its value is finding where we sit outside the range that all human
music occupies — being outside is a bug, being inside is merely the absence of one.
Optimising toward the middle of that range would produce something statistically
unremarkable, which is a good description of beige.

The corpus arrives as MIDI, so its pitches are whole numbers of hundredths — a
limit of the file format, and the reason the buckets are as coarse as they are.
Their edges sit at 50, 250, 450, 750 and 1150 cents, which puts every value the
format can express fifty cents clear of an edge; replacing one with the nearest
simple ratio moves it by at most thirty-three, so nothing can cross. The buckets
are named by the span they cover and not by a scale degree, because our own
intervals have sizes and nothing else — no degrees to be a third or a fifth of.
That independence is the point rather than a lucky escape: a reference that
shifted whenever our own scale logic shifted would not be a reference.

**What replaces it.**

Open, and being explored. The constraints are: no tables, no hand-set weights, no
predefined patterns; five or fewer parameters, each a musical intention a listener
could name rather than a weight balancing two terms; structure emerging from the
ratio algebra at every timescale rather than imposed on it; and steerable while it
plays. Four families are under investigation — self-similarity across timescales,
entrainment between coupled oscillators, prediction and surprise measured in bits,
and the algebra of the lattice itself.

*One result from the exploration is worth recording even though the work was cut
short.* The surprisal branch found an identity that was sitting in `ratio.js`
unnoticed. `complexity(a) = log2(numerator × denominator)` is already there, and
that is **literally the number of bits it takes to write the fraction down**. So
setting the probability of a ratio to `2^-complexity(a) / Z` makes "how complex is
this interval" and "how surprising is this interval" the same measurement, up to a
constant. Nothing is chosen: `Z` is forced by the probabilities having to sum to
one.

There is a second half to it. `Z` only converges for a finite set of primes,
because the sum of `1/p` over all primes diverges. **The prime limit is therefore
not an arbitrary restriction on the tuning system — it is exactly the condition
under which complexity-in-bits is a probability at all.** If that holds up it is
the most satisfying thing the project has turned up: the lattice and the
information measure are one structure seen twice, and a distribution over next
notes comes out of the ratio algebra with no table and no weight anywhere.

## 13. Patterns first

The engine used to generate note by note and hope a pattern emerged. It does the
opposite now: it builds patterns out of the ratio logic and assembles the piece
from them. What follows is what that took, and what it cost.

**The repetition was already there; none of it was audible.** Measured over ten
minutes, the fixed-root engine used *nine* distinct phrases across *two thousand*
statements of them — and almost none of those restatements came out sounding
like the same phrase. Three separate mechanisms downstream were destroying the
identity before it reached the ear:

- note lengths were redrawn on every statement from a six-way distribution, so a
  three-note phrase kept its rhythm about 2% of the time, by chance and only by
  chance;
- each note's octave was chosen nearest to wherever the voice happened to be, so
  the same three pitches came out rising one time and falling the next;
- the density gate was rolled per note, deleting a quarter of the notes of every
  phrase at random — a four-note phrase survived whole a third of the time.

A phrase is now invented once as a fixed object — pitches, note lengths and
contour together — and the density gate decides whole phrases. Restatements are
identical.

**A phrase is stored as what it does, not where it goes.** Each note is kept as
its ratio to the note the phrase started from, so a phrase has no pitch of its
own and can be played from anywhere. Transposition is one multiplication and it
is exact; a just interval moved by a just interval is a just interval, with no
rounding and no nearest degree. Because a phrase closes on its own starting
pitch, closure survives transposition too.

This was not a flourish. With phrases pinned to the root at both ends and six
pitch classes available, there are about six possible phrases in the whole piece,
and recurrence sat at 0.97 against a corpus ceiling of 0.70 — the engine was not
repeating itself because it liked to, but because it had nothing else to say.

**Two levels, one mechanism.** A phrase is a word over moves; a section is a word
over phrases, remembered and reused the same way, decaying four times faster. The
level is nowhere in the code, so there could be a third. What differs is only the
rate.

**The simplest notes are the furthest apart.** 4:5:6:7 puts its members 386, 316
and 231 cents from each other, so a progressive unfolding that admits notes in
order of simplicity spends its whole opening in a state where *no small interval
exists* and the line can only leap. Measured: 3% steps against a corpus 47-65%,
and it was not the weighting's fault — opening the whole set at once put steps at
41% with nothing else changed. So the piece now opens with the fewest simplest
notes that have one step between them, and what counts as a step is already
decided by `nearness`, the cents worth one bit. No new number. Steps went to 56%.

**Still open.** Direction changes are 76% against a corpus 50%: the line zigzags
within a phrase, which is now a property of the invented shapes rather than of
the walk. Recurrence is 0.91 against a ceiling of 0.70 — the vocabulary is seven
phrases where it wants to be dozens, and the reason is still that the material is
small. Long-range repetition, which is the measure of whether anything is
*recognisable*, is in the corpus band for the first time.

## 14. Variation, and how it comes home

The first attempt at development was a list of named devices — backwards, upside
down, a note added, a note dropped, a note held. Those are edits to a *word*.
They are what you would do to any string of symbols and nothing about them comes
from the numbers, which makes them the table of weights again in different
clothes. They were removed.

**There is one move.** One note of a phrase goes to a different member of the
set, chosen by the complexity of the ratio between where it was and where it
goes — so a note shifts by a simple ratio often and a strange one rarely, and how
big the change is *is* the arithmetic distance rather than a category. The same
move in the additive world where durations live: one note becomes a different
whole number of beats and another note gives up or takes on the difference, so
the phrase still occupies the time it did. Which new length is likely is again
the complexity of the ratio — doubling a note is one bit and common, making it
five-quarters as long is four bits and rare. Pitch and rhythm are varied by one
rule. Closure survives both, because only the inside of a phrase is touched.

**Distance between two phrases**, in bits: note against note, the complexity of
the ratio between them, summed; length against length, the same measure on the
whole numbers. Identical phrases are nought apart, a phrase and its child a few
bits, unrelated phrases infinitely far (they are not the same shape at all). It
is the same quantity as a pitch's distance from the root.

**Which is what makes coming home free.** A section stores the phrase it *means*;
what gets played is drawn from around it, weighted by 2^-(distance from what was
meant) — the rule the notes already follow, one level up. The original has
distance nought, so its weight is 1 and it is always the likeliest thing; a child
a few bits away is a few times less likely; a grandchild thinner still, so the
music cannot drift off and forget where it came from. Measured over ten minutes:
70% of statements are exactly as intended, 28% are one small change away, 2%
further, and the median distance is zero.

There is no counter deciding when to return and no rule that a variation must be
answered. The music goes back because home is the most probable place to be —
which is the same sentence as the one about the root, and it is now true at two
levels.

## 15. The drone has no fifth

A tanpura's second string is not a fifth by law. It is the note the raga leans
on, and it is retuned when the raga has no Pa. This set has no Pa: the hexany is
1/1, 7/6, 5/4, 35/24, 5/3, 7/4, and 3/2 is not in it and never will be.

Measured against the set, 3/2 was the worst string available:

- it sits **49 cents from 35/24**, a beating clash with a note the melody
  actually plays, where nothing else in the set comes within 84 cents of
  anything;
- it was the only candidate with no consonance anywhere. Every member of the set
  locks when the melody lands on it — roughness falls to about 0.02 — while 3/2's
  smoothest moment against any melody note was 0.198, because there is no note
  the melody can land on to meet it.

So the drone is the root and the root an octave up, and nothing else. The whole
reason a melodic step is allowed to be an ugly number is that each note is heard
against 1/1, which means 1/1 is what should be sounding. If a second string is
wanted for its shimmer, it has to be a member of the set.

**And the drone changes what density means.** With nothing sounding underneath,
a gap in the melody was silence and the music appeared to stop, which is why the
defaults kept creeping upwards to fill it. With the root sustaining, a gap is
the drone alone — which is a texture rather than an absence — so the piece can
afford to be much emptier. The defaults moved accordingly: pulse 0.26 to 0.32
and density 0.75 to 0.6, which is 1.65 notes a second where it used to be 2.6.

## 16. What the old engine has, and why we cannot use it yet

The old engine sounds chaotic and occasionally produces something jazzy, with
real chords. Both come from one mechanism: **every note is chosen against the
sonority actually sounding** — not against a chord symbol, but against the
partials in the air, by roughness, from the instrument's own spectrum
(`src/choose.js`). Three things make that pay: the pitches come from a small
held field that is periodically transposed exactly, which is modulation with
nothing approximated; the voices share a register, so they can interfere at all;
and the chooser aims at a roughness *target* rather than the minimum, because
always taking the smoothest note gives the most boring music available.

The chaos is the same property from the other side. Every note is re-chosen from
scratch, so nothing recurs — which is what §12 recorded.

**The same criterion was built into the fixed-root engine and then removed
again, because it earned nothing.** A phrase's anchor was scored on how the
whole phrase would sit against what was still sounding, stretched across the
candidates so the worst placement paid a fixed number of bits. It moved the
roughness between parts by about 1%, and the measurement says why:

- the parts sit in separate register bands, **1684 cents apart on average**, and
  roughness hardly varies at that distance, so the term has nothing to choose
  between. Forced into a shared register the same parts sit 303 cents apart,
  roughness goes from 0.42 to 0.58, and the term starts doing real work;
- only **5% of notes are struck together**, so there is barely a vertical to be
  right or wrong about at all.

So the criterion is not wrong, it is premature. Its two preconditions — parts
that share enough register to interfere, and parts that strike together — are
both missing, and both are changes to a texture that has been settled by ear.
Thirty lines of roughness machinery that buys 1% is worse than nothing, because
it looks like the vertical dimension is handled. It is not handled. It is
absent, deliberately, until the texture can support it.

The material is ready when the texture is: the hexany contains **4:5:7**, a
septimal seventh chord, which is the sound in question.

## 17. A rest is a whole number of beats

Every duration in this engine is an integer multiple of the shared unit — that
is what gave the project a pulse in the first place. But the rest between
phrases was then scaled by a fractional roominess, which pushed the part off the
grid and left it there for the rest of the piece.

Measured: **53% of onsets were landing on the shared grid, and 100% do now.**
Nothing else changed. It is one line, and it is the only part of the vertical
experiment worth keeping — found by accident while looking for something else.

## 18. Pinning a shape

The old engine had one manual control worth keeping: a panel of remembered
shapes, each fading with age, and a click to pin one so it stops fading. It was
wired only to the old engine, so the sentence describing it in the page was
false for the engine anyone was actually listening to.

The fixed-root engine now has it, and pinning means something exact here rather
than something approximate. Two things:

- **A pinned shape stops fading.** It is exempt from the decay that makes an old
  phrase less likely to be built into a new section.
- **A pinned shape is at distance nought from wherever the music is.** Phrase
  choice is already a draw weighted by 2^-(distance from what was meant), so
  saying a shape is at distance nought says it is home — not home for the family
  it belongs to, but home everywhere. It becomes as likely as whatever was
  actually meant, and it can arrive in the middle of a family it has no relation
  to at all.

Measured over eight minutes after pinning at the two-minute mark: a shape that
was 1% of what got played becomes **45%** when pinned, or 64% if it was already
the strongest. It is a real handle, not a hint.

This is the only place anything outside the music reaches into it, and it costs
one term in one weighting. The panel shows the vocabulary strongest first, with
the notes each shape moves through and, in small type, how long each is held.

## 19. The drone was a metronome

It restruck every sixteen pulses — 5.12 seconds at the default, forever, exactly
regular. Measured, each restrike jumped the level by 3.6 to 15.5 dB. In a
texture playing 0.65 notes a second that was the loudest and by far the most
regular event in the music, so the music sounded like a metronome, because it
had one.

The restriking was a mistake about this instrument. It was imitating a tanpura's
repeated pluck, but these resonators are driven by a continuous trickle of noise
for as long as a note is held, so they genuinely sustain and never needed
renewing. Holding a drone is one line; the pulse was pure artefact.

It is now struck once, at the start, and held until the piece stops. Nothing
periodic is generated at all, so there is nothing to hear as a beat. Levels were
retuned for a note that no longer decays between strikes — it sits 7.7 dB under
the melody in the band that carries.

**And the sonority panel shows it apart from the rest.** The drone belongs in the
reading: it is sounding, and under this engine every other note means its ratio
to it, so a reading that hid it would describe a harmony that is not the one in
the room. It must never be excluded from anything that chooses notes, for the
same reason. But it is a *constant*, and listing a constant among the variables
buries them — the drone never stops, so it was most of the panel most of the
time. It is shown once, on its own line, and what changes is shown below it.

## 20. Folding back

The unfolding only ever went one way. Over an hour the piece reached its full
set of notes and then stayed there, so the last forty-five minutes had no shape
above the length of a section. The question was when it should fold back up
again, and the answer had to come from the music rather than from a clock.

**First the counter had to mean what it said.** "Settled" is meant to mean the
piece just repeated itself, and it was measuring something else: a phrase's
`count` rises when it is picked to build a *new section* out of, so a phrase
inside a section that repeats for ten minutes could be heard two hundred times
with its count still at one — and every one of those statements reset the
counter to zero. The engine was calling its most repetitive stretches unsettled.
Measured, one run in three never finished unfolding in an hour, and whether it
unfolded at all was close to a coin toss. It now counts statements of a phrase
that has been stated before, which is what the words always meant. All three
seeds now unfold, in the same order, at comparable times.

**Then the fold-back is the other branch of the same test.** Settling long
enough means the piece has run out of things to say with what it has. If there
is a note left to admit, admit it. If there is not — everything is in play and
it has gone on repeating for as long again — then there is nothing left to
reveal, and it returns to what it opened with and unfolds again from there. One
counter, one threshold, no clock, no new parameter. It is the shape of
everything else here: depart, and come home when there is no reason to be away.

A phrase is only offered if every note of it is currently in play. Without that
the fold-back would be inaudible, because the vocabulary keeps every phrase it
ever invented and would go on playing the notes just withdrawn.

Measured over three hours, three seeds: cycles of roughly 60 to 90 minutes,
4 → 5 → 6 → 4, two or three fold-backs each.

**The two halves of the cycle are not the same length, and that is worth
knowing.** The first unfolding takes 20 to 50 minutes, because the vocabulary is
empty and every new shape resets the counter. After a fold-back the counter runs
almost uninterrupted, because everything that fits four notes is already known —
so the return to the opening texture lasts about three minutes before it climbs
again. There is an argument that this is right, since a piece that knows its
material should move through it faster. Whether three minutes is a breath or a
blip is a listening question, not a measurable one.

## 21. What the player plays becomes material

Playing a pad while the engine ran did nothing to the music. The note went into
the sonority and no further, and the engine carried on generating over the top —
two things making music in the same room without listening to each other.

Both halves are now joined, and the joining needed almost no new machinery,
because a played phrase and a written one are the same kind of object.

**While somebody is playing, the parts hold back.** They are carried forward
rather than paused, so they do not build up a debt of notes and discharge it in
a burst the moment the player stops. They simply were not playing during that
time, which is what a musician who is listening does.

**When the playing stops, the phrase is kept.** It arrives as absolute pitches
with times on them; a phrase here is a word of ratios with note lengths and a
contour, which is the same object, so nothing is approximated. Each note is
divided by the first, which makes the shape independent of where it was played.
The gaps between onsets are rounded to whole beats of the engine's own grid. The
ups and downs are taken from what was actually played rather than recomputed,
because the point is to keep what was meant — measured, a rising 1/1 9/8 5/4 3/2
2/1 comes back as 0 204 386 702 1200 cents, exactly.

Where one phrase ends and the next begins is the longest note the engine writes,
eight beats of its own grid. Nothing arbitrary is chosen; it is the unit the
music is already counting in.

**It does not come in pinned.** Pinning throws distance away entirely, which
made a played shape 54% of everything for as long as the session lasted — a
looper, not a musician. But the opposite, letting it merely influence the
weighting, measured 0%: phrase choice is a draw weighted by distance from what
was *meant*, and a played shape is far from anything the engine wrote, different
notes and often a different length, which makes that distance infinite.
Forgiving it four bits changed nothing at all.

Neither is right, and the measurement says why. **A shape somebody played is not
a candidate to be judged against what the music meant. It is a new thing for the
music to mean.** So it becomes an intention: the piece states it, answers it, and
states it again, and from there everything already built does the rest — it is
varied one ratio at a time and returned to, because that is what this engine does
with anything it means.

Three things make it stick, each found by measuring the previous attempt:

- it is weighted as heavily as whatever the piece is most about, not at one.
  Left at one it was stated once and never chosen again, because the vocabulary
  is drawn on in proportion to use and everything else had a running start;
- its children inherit its favour, and with it the right to be heard at all.
  Every variation of a played shape still contains the notes that were played,
  so the rule that a phrase must be built from the notes currently in play threw
  all of them away and the lineage died with the first statement;
- favour fades, so the line of descent is absorbed rather than installed.

Measured over an hour after playing a rising 1/1 9/8 5/4 3/2 2/1: the shape and
its descendants are 13% of the phrases in the first five minutes, 5% in the next
five, 1% by the fifteenth and nothing after. It is played back, then absorbed,
then survives transformed for a while — which is what happens to a phrase you
give a musician.

**That measurement first came out very wrong, and the way it was wrong matters.**
Followed for only a quarter of an hour the lineage looked like a slow tail, but
over a full hour it fell to 1% by the twentieth minute and then *climbed back to
38% by the sixtieth*. Nothing was reviving it. Each fold-back narrows the set,
and two rules then handed the music back to material it had just withdrawn:
sections were being built from phrases that no longer fit, and when nothing in
the vocabulary fitted, the intended phrase was played anyway. Both now defer to
what is in play — sections are built only from shapes that fit, and where nothing
fits the engine writes something rather than reaching for something old. A short
measurement would have called this feature finished.

It appears in the shapes panel, and clicking pins it, which is the same quantity
held open instead of fading.

This is the first time the instrument and the score are the same thing here,
which was in the founding intent and has been missing since.

## 22. One engine

The cell engine and the original weighted-cost engine are gone. Both are in git
history with their own design notes; §12 records why the original was replaced
and §16 what it still had that this one does not.

What that leaves is smaller than it looks. `src/` is now the instrument and the
ear — ratios, the lattice, the resonator model, roughness, the sonority — and
nothing that composes. All the composing is in `explore/ratios/`, three files.
The controls went from five panels to one, and the presets, which were written
in the old engine's vocabulary and had no meaning in this one, were rewritten in
terms of the five things that are left: pulse, how adventurous, cents worth one
bit, how long it remembers, how many parts, how busy.

## 23. A phrase has to go somewhere

A phrase in this engine is one thing: a departure and a return. Everything else
is built on that — a variation varies the departure, `near()` returns to it, and
arrival is landing back on 1/1.

`listen()` did not check it. It required two notes and nothing more, so tapping
the same pad four times became a phrase of four unisons, and that shape then had
a property nothing else had: every note of it is 1/1, so it fits *any* set of
notes. The rule that a phrase must be playable with the notes currently in play
— the rule that makes folding back audible — could never exclude it, while it
thinned out everything else. Measured from a single four-tap gesture: 48% of
every statement in the following twenty minutes was all-1/1, and seven of the
forty-one shapes in the vocabulary were, all descended from it. Over a drone
sounding that same 1/1, what that sounds like is a metronome. It was found in a
real session's shapes panel, where the live shape was `1/1 1/1 1/1 1/1` at full
weight with three variants of itself below it.

So `departs()` is checked where phrases are made — at the door in `listen()`,
and in `vary()`, because a three-note shape can reach all-1/1 in two legal moves
through an intermediate that is fine.

**The long silences were left alone, and that was a decision.** They are real:
two parts each sounding 30% of the time, decided independently per phrase, give
gaps of 35 to 55 seconds, and a gap that long has the music playing inside it
with the sound off, because a muted phrase still burns its own length. Measured,
that also costs the structure — sections were heard whole 10% of the time and
only 29% of the statements driving the unfolding were audible.

Making silence a rest instead of a deletion fixes all of that, and it was
written and measured: sections whole 75%, unfolding 100% audible, longest gap
55s down to 16s. It was reverted anyway, for two reasons that are the point of
this file. It flattened the music — against the same number of notes a second,
minute-scale unevenness fell from 0.31 to 0.11, and busier and sparser passages
are not decoration, they are most of what makes a sparse texture sound alive.
And it knocked the unfolding off its calibration: `settled >= admitted³` had
been fitted against a counter inflated by inaudible statements, so with the
counter corrected the piece stopped unfolding at all, and putting that right
meant refitting the exponent, which meant rescaling every preset.

A change that forces two unrelated constants to be re-fitted is a change
fighting the design rather than following from it. The silences stay until
something derives them.
