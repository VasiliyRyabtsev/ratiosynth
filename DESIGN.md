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

We do not pick N notes out of infinity. The pitch material is derived from the
ratios rather than listed, and nothing is rounded. Pitch space is then genuinely
unquantized while every individual moment stays simple, because the ear compares
notes to their neighbours rather than checking them against a list.

The machinery that first carried this went with the engine removed in §22: two
scores balanced against each other, a cost curve for the size of a melodic move,
a harmonic field held and then transposed, and sections that swell. The engine
that replaced it fixes the root rather than managing a moving one, and takes its
pitches from a combination product set that unfolds and folds back up again —
§13 onwards. Three findings outlived it.

**Neither score is something to minimise.** Always picking the smoothest
available note gives the most boring available music, so a score wants a target
— aim at smooth, aim at rough, or anywhere between — rather than a direction.
That one change is most of the difference between sterile and alive, and §12
records the shape it takes in the current engine.

**Melodic distance is not lattice distance**, and confusing the two took longest
to find. 3/2 is about as simple as a ratio gets and is also a leap of 702 cents,
so scoring a move by how simple its ratio is *rewards every line for jumping
about*. Measured over a few hundred notes: 39% repeated notes and 34% leaps of a
fourth or more — static and chaotic at the same time, which is exactly what it
sounded like. The shape of the fix matters as much as having one. "Prefer small
moves" is wrong and settles on repeating a single note forever; the cost has to
be dear at zero, dear again far out, and cheapest around a step of a hundred-odd
cents. That is why the current engine scores how far the ear has to jump at all,
as `nearness`, its one honest constant.

**Drift is a control, not a bug.** Walk up by 3/2 a few times and back down by
5/4 and you do not land where you started — the pitch centre slowly wanders. One
end of the knob is a free walk that never returns; the other is a gravity pulling
back toward a reference pitch. No conventional tuning system can even express
this, and it survives as the gravity parameter on §4's estimate.

Whatever else limits comprehensibility — how many relationships at once, how much
recurrence, how far a step may jump — those are parameters in the playground too,
not rules baked into the engine. Exploring the constraint space is part of the
instrument.

## 4. The Sonority block

**Built and still running, but nothing composing reads it any more.** What reads
it is the panel on the page and the picture in §24; the engine does not, because
a fixed root answers "where is the centre" by construction. So the claim below
that this is where the musical intelligence lives was true of the engine removed
in §22 and is not true today — §16 is about what that costs and what would have
to change in the texture before it could be worth having back.

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

Two things fall out for free. **Confidence is the margin** between best and
runner-up, so two near-ties report genuine ambiguity as a number. And **drift is
measurable** — the estimated centre against the reference point is the input the
gravity knob needs.

**The estimate is not a slow-moving thing, and anything reading it has to expect
that.** Over five minutes of the engine playing itself the centre changes 77
times, once every 3.9 seconds, because it lands on whichever sounding note makes
everything simplest and that keeps changing. Fine for a readout; ruinous for
anything that has to move smoothly, as §25 found out.

A third thing we expected does not work. **The centre needn't be a sounding note,
but in practice it always is.** The hope was that an absent root would be found by
testing empty lattice points, and it cannot be, for a structural reason: a
candidate that *is* one of the sounding notes scores zero for that note, and no
empty point can beat a free zero. Play only 5/4 and 3/2 and the answer comes back
3/2, not the missing 1/1. That is not wrong — with two notes the root is
genuinely ambiguous — but the implied root does not emerge on its own.

Two ways out, neither taken yet. Gravity does it already, since home is an
unoccupied point and turning gravity up lets it win, which means the mechanism is
"pull toward a reference" rather than "discover an implied root". Or a different
measure would do it properly: express the notes as whole numbers over a common
base and take their greatest common divisor — for 5/4 and 3/2 that is 5 and 6
over 4, whose common divisor sits exactly on the absent 1/1. That is the
classical account of an implied root and gets the right answer directly, but it
loses everything the current measure gives: no weighting by memory, no
confidence, and one odd note drags the answer a long way. Worth revisiting when
note choice actually depends on it.

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

Getting the numbers out of a chord is free: express every sounding note as a whole
number over a common base, which on the lattice is the smallest exponent used on
each prime, and 1/1, 5/4, 3/2 comes out as **4, 5, 6** directly.

**Half of this is built and half is not.** In the current engine every duration is
a whole number of one shared unit, and which whole number is drawn in proportion
to 1/n — so doubling a note is one bit and common, five-quarters is four bits and
rare, the same arithmetic that chooses pitches (§14). The parts move at 1, 1/2,
1/3 of each other's speed, which is the harmonic series used as a tempo relation.
Whole numbers, and the simple ones more often.

What is missing is the part where the *sounding chord* sets those numbers. The
rhythm is made of small whole numbers; they are just not the ones currently in the
air. Restoring that needs the same precondition as §16 — parts that strike
together often enough for a vertical to exist.

One finding from the version that went with the old engine is worth keeping,
because it will apply again. A part with a plain period plays every N pulses and
*nothing inside it is uneven*, so several such parts still add up to a near-even
stream — monotonous by construction. Spreading a few onsets as evenly as possible
through a longer cycle is uneven whenever the count does not divide the cycle:
three in eight comes out `x..x.x..`, long, long, short, which is the most common
rhythm on earth and nobody had to write it down. Note lengths then vary for free,
since a note lasts until the next onset.

## 8. Generating moves, recurrence, and sanity

**Three parts with three different fates.** The generator has never been built.
Recurrence was built twice, and now works through phrases and sections in
`explore/ratios/compose.js` — §13, §14 and §18. Density control is built in part:
register spacing and the hard voice cap are there, the roughness budget is not,
and §16 says why.

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
moved, so lattice shape is not just *a* candidate for the unit of recurrence — it
is what this system is unusually good at.

Two more carriers, because pitch relations alone are a lot to ask a listener to track:

- **Rhythm.** The most robust carrier there is — survives transposition, register
  change, timbre change. If harmony is fluid, rhythm should be the memorable thing.
- **Register, timbre, density.** A voice that always appears low and always sounds the
  same way is recognisable whatever pitches it plays. Nearly free, does a lot of work.

**How gestures get remembered — decided.** The system does it, you steer. It keeps a
pool of the shapes it has recently played, and when it wants to repeat something it
picks from that pool. Entries fade out over time, the same way the sonority's memory
in §4 fades, so the pool stays current on its own. Manual control is secondary: a
**pin** that stops one entry from fading, so a shape you liked keeps coming back
(§18). That is the whole manual interface.

This avoids the hard version of the problem. Nothing has to *recognise* a repeated
shape in the output; the system simply remembers what it played and reuses it.

One correction, found twice and likely to be found again: **a repeated shape runs
away with the music** if it is replayed from wherever the part happens to be. Any
shape with net displacement moves the music further every time it comes round —
after a few minutes the ratios were 1296/625 and the music had wandered off the
lattice entirely. A repeat has to start from a freshly chosen note: same figure,
new starting pitch, which is what music does anyway.

### Density control

Not a voice count — a **roughness budget**. Compute the total roughness of what is
sounding; if adding a note would exceed a threshold, don't add it, or drop something
first. Better than counting voices because it is perceptual: five consonant notes are
clearer than three that clash.

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

### The pads are the lattice

The first of those exists on the bench, standing still rather than lit up as the
music walks. A button rearranges the pads between the two things they are: rows
under your hands, and points in the grid. The elements themselves never change,
only what holds them, so a note being held survives the switch.

Both axes are numbered by how many of the prime a pad carries, so the square that
holds 5/3 in the rows is at -1 across and +1 up. That is not a scheme invented for
the picture: it is the pitch as §2 stores it, one number per prime, read straight
off the array. The columns have a ceiling as well as a floor, because a grid
stretched to fill a wide window stops looking like a grid.

Laid out by ratio, the pads answer a question the rows could not. A keyboard row
cuts across the grid — the flat side is one line of it, and the bright side is
two, since five of the eight pads on the home row have no 5 in them at all and
sit on the middle line with the number row. That is why the two middle rows
cannot be told apart by naming a prime: both are built on 5, and what separates
them is which way the 5 points. Multiplying by 5 rises and gives the brighter of
a pair, dividing by 5 falls and gives the flatter one, which is why 6/5 is 3/2
with a 5/4 taken off it. A heading cannot carry that; a picture can, so the
headings say only how a row sounds.

Only 3 and 5 get an axis, so anything using 7, 11 or 13 is off the plane entirely
and sits apart from the grid rather than being forced onto it. That is worth
showing rather than tidying away.

**The keys follow the pads.** A grid you cannot play is a diagram, so each line
of the lattice takes a line of the keyboard and each column takes a key along it:
1/1 falls under the left index finger, the line above it lands on `w e r t y`,
the line below on `c v b n`, and the seven with no place on the plane take the
number row. The stagger of a typing keyboard turns out to be close enough to a
lattice that the columns agree both on the screen and under the hand.

This gives a key two meanings, one per arrangement, and that is a hazard where
notes are held rather than triggered: rearranging the pads with a finger down
strands the note, because the key means a different pad by the time it comes up.
So a key releases *the pad it pressed*, remembered from when it went down, and
never whatever it would mean now.

**An octave is not a place in the grid.** Shift lifts a press by an octave and
alt drops it. That settles what to do about 2/1: it is 1/1 played higher, not a
point of its own, so the lattice leaves it out and the rows keep it. Ctrl is the
obvious partner for shift and is not used, because the browser has already taken
it with w, t, n and the number row — all live keys here — and acts on those
before the page sees them. A modifier that works on part of the keyboard is worse
than one that works on none of it.

**Which octave each square is played in.** Everywhere else on the bench a pad is
folded into the octave above the root, and folding is what scrambles a line:
stepping by 3/2 along the middle line and folding gives 0, 702, 204, 906 and 408
cents, which climbs and drops and climbs. Unfolded — a whole 3/2 for a step
across and a whole 5/4 for a step up, so a square at *a* across and *b* up is
exactly (3/2)^a * (5/4)^b — every line climbs from left to right and every column
from bottom to top. The grid then spans 4.1 octaves, from 8/27 at -2106 cents to
81/16 at +2808.

This admits the prime 2 to a picture that is otherwise about 3 and 5, which is
the cost and is worth it: the grid stops being a diagram of relationships and
becomes an instrument with register, where where a pad sits is where it sounds.
The 2 decides nothing but which octave.

Rendered at the corners, the resonator holds up across that span: -3.0 dB at the
top right against 1/1, and the bottom, at 39 Hz with the octave key, is if
anything slightly louder. The top thins rather than aliasing, because the
processor already drops partials that reach the sampling limit, and by 2673 Hz it
has lost enough of them to sit 7.7 dB down. That is an instrument running out of
range, which is what one should do.

Holding an octave key moves the whole keyboard, so the whole keyboard says so:
every pad redraws with the ratio and the distance it would play now, and all of
them take a colour wash — up in the accent, down in the warm one. The wash is
laid over each pad's own background rather than replacing it, so how simply a
ratio relates to the root can still be read underneath, and it is the cue that
survives into §25's view, where the distances are hidden.

A pad already down keeps the face of the note it is sounding while its neighbours
move, because that note did not move. So the pad that lights is the one under
your finger, and it says what it is playing; the ones around it say what they
would play. Those being allowed to differ is the point rather than a sloppiness —
a pad is a place, and the octave is a way of playing it.

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

**Structure before pictures**, and that ordering is the one part of the original
plan that survived the engine it was written for. The displays were meant to come
before rhythm and recurrence, and listening proved that wrong: with the
note-choosing machinery finished and no structure-making machinery at all, it
sounded like *"a random sequence of sounds without inner logic"*, which is exactly
what it was. Nothing recurred, there was no pulse, and there were no separate
parts, so there was nothing for the ear to recognise coming back.

### Where this stands

`src/` is the instrument and the ear: ratios, the lattice, the modal resonators,
roughness, the sonority. It composes nothing. All the composing is three files in
`explore/ratios/` — a combination product set for the material, a fixed root with
the root sounding underneath, phrases as fixed transposable objects, variation by
a single ratio move, a set of notes that unfolds and folds back up, and whatever
somebody plays taken up as material for the piece to mean. That is §§13 to 23.

One picture exists, and it is not one of the four §9 asked for: the sounding
ratios drawn as interfering waves, flat on the bench and flown through in the
live view (§24, §25). What is left to build, in order: the lattice display;
register spacing and the roughness budget; §9's other three pictures; §8's
automaton; and only then the connectable blocks.

Everything is covered by tests that run with `node --test` and need no framework,
and by the measuring tools in `tools/`, which are the only way anything here gets
checked — see §12 on what the corpus is and is not for.

It is **still not good enough to listen to for pleasure.** The gap named here
before — every layer sharing one instrument, so the parts blend into a wash — is
still open and is still the obvious next move, and it is the same precondition
§16 and §7 both wait on: parts that are distinct enough to be heard against each
other at all.

### On the number of knobs

There are more parameters than anyone can hold in their head, which is itself a
symptom: a large space in which most positions do not sound like anything. The
answer is not fewer knobs — the point of the project is that the constraints are
adjustable — but **landmarks**, a handful of presets marking the corners that
work.

Hiding the rest is not part of the answer, and the count was never the problem.
Reported from the bench: *it is not the amount that is confusing, it is the
mental effort to process the layout.* So every control is shown, grouped in the
order the sound is made, with each group headed by a short sentence saying what
its sliders do.

**Naming a thing and then gesturing at it does not work here.** There is no
settled vocabulary for most of this machinery, so the tempting shape is a noun
plus a clause that rescues it — "the strike — how a note is set going", "the body
— what the strike sets going", "the ear — how it finds the centre". Every one of
those is a riddle followed by its answer, and it was written that way three times
before the report came back as *what does this all mean???* The noun was never
the useful part; the clause always was, so the clause is the whole heading.

## 12. Still open

**How do we put a number on "rough"?** *Answered and built.*

Two pure tones very close in pitch but not identical produce a buzzing, unsteady
sound. Identical — smooth. Far apart — smooth. Somewhere in between — worst. So
roughness for one pair of tones is a small bump-shaped curve, placed at about a
quarter of the distance the ear needs to separate two tones and widening as pitch
falls. Real notes have many overtones, so the roughness of two notes is that bump
summed over every pair of partials, each weighted by how loud they are.

Sweeping an octave puts the valleys exactly on 5/4, 4/3, 3/2 and 5/3 without any
of those being written down anywhere — the premise of the project, measured rather
than assumed.

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

*Answered, and the answer was no.* Recorded here because it constrains everything
built since.

The old engine scored each candidate note with a weighted sum of terms —
roughness against what is sounding, simplicity against what is remembered, pull
toward home, size of the melodic move — and then picked one. Measured against the
corpus, three things came out.

- **The melodic move curve was invented and wrong.** It made standing still the
  most expensive move available: real melody repeats a note about one time in six,
  ours did it four times in a thousand. It also made an octave leap barely dearer
  than a third. Everything piled into a single narrow hill of medium-sized moves,
  which is what "chaotic yet monotonous" sounds like from the inside.
- **A voice's own sounding note was counted in the harmony it was judged against.**
  A unison adds no roughness at all, so repeating a note scored as perfectly smooth
  and the harmonic term quietly recommended standing still on every decision. Same
  family of error as §4's implied root: a candidate must not be scored against
  itself.
- **The real defect is structural and survives any weights.** The picker takes its
  cheapest option far more often than not, because the temperature it samples at is
  much smaller than the spread of every cost term. A chooser that reliably takes the
  argument of a minimum produces a degenerate distribution no matter how good the
  cost function is. No setting anywhere in a three-parameter sweep brought the
  output inside the range human music occupies.

So the requirement, stated plainly because it is what any replacement has to
meet: **the aim is a distribution over what happens next, not a ranking.**

The same trap has a second door. Sharpening or flattening those weights to hit an
entropy target is a prior that gets overridden whenever it says something — which
makes it not a prior, and turns the choice of move into a uniform random walk. So
weights are drawn at their own strength.

A cost curve fitted to the corpus is not the way out, and it is worth knowing that
it *works* — the temptation is real. Reading the curve off European folk melody
smuggles the diatonic scale into a project founded on refusing that inheritance,
and a fitted table is exactly the sort of thing this design is trying not to
contain.

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

The engine of §§13 to 23, built to those constraints: no tables, no hand-set
weights, no predefined patterns; five or fewer parameters, each a musical
intention a listener could name rather than a weight balancing two terms;
structure emerging from the ratio algebra at every timescale rather than imposed
on it; and steerable while it plays.

**It rests on an identity that was sitting in `ratio.js` unnoticed.**
`complexity(a) = log2(numerator × denominator)` is **literally the number of bits
it takes to write the fraction down**. So setting the probability of a ratio to
`2^-complexity(a) / Z` makes "how complex is this interval" and "how surprising is
this interval" the same measurement, up to a constant. Nothing is chosen: `Z` is
forced by the probabilities having to sum to one. Everything the engine draws —
which note, which duration, which variation, which phrase — is that one rule at a
different level.

There is a second half to it. `Z` only converges for a finite set of primes,
because the sum of `1/p` over all primes diverges. **The prime limit is therefore
not an arbitrary restriction on the tuning system — it is exactly the condition
under which complexity-in-bits is a probability at all.** The lattice and the
information measure are one structure seen twice, and a distribution over next
notes comes out of the ratio algebra with no table and no weight anywhere.

## 13. Patterns first

The engine builds patterns out of the ratio logic and assembles the piece from
them, rather than generating note by note and hoping a pattern emerges. What that
takes is more than inventing the patterns, and each condition below was found by
its absence.

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

Development is not a list of named devices — backwards, upside down, a note
added, a note dropped, a note held. Those are edits to a *word*: what you would
do to any string of symbols, with nothing about them coming from the numbers,
which makes them the table of weights again in different clothes.

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

So the drone is the root and the root an octave below, and nothing else. The whole
reason a melodic step is allowed to be an ugly number is that each note is heard
against 1/1, which means 1/1 is what should be sounding. If a second string is
wanted for its shimmer, it has to be a member of the set.

**And the drone changes what density means.** With nothing sounding underneath,
a gap in the melody was silence and the music appeared to stop, which is why the
defaults kept creeping upwards to fill it. With the root sustaining, a gap is
the drone alone — which is a texture rather than an absence — so the piece can
afford to be much emptier — 1.65 notes a second rather than the 2.6 the defaults
had crept up to.

## 16. What the old engine has, and why we cannot use it yet

The old engine sounds chaotic and occasionally produces something jazzy, with
real chords. Both come from one mechanism: **every note is chosen against the
sonority actually sounding** — not against a chord symbol, but against the
partials in the air, by roughness, from the instrument's own spectrum. Three
things make that pay: the pitches come from a small held field that is periodically transposed exactly, which is modulation with
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

Measured: **53% of onsets landing on the shared grid, against 100% once the rest
is an integer too.** Nothing else changed, and it is one line. Anything that
scales a duration by a real number does this, wherever it appears.

## 18. Pinning a shape

There is one manual control worth having: a panel of remembered shapes, each
fading with age, and a click to pin one so it stops fading. Pinning means
something exact here rather than something approximate. Two things:

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

Restruck every sixteen pulses — 5.12 seconds, forever, exactly regular — it
jumped the level by 3.6 to 15.5 dB each time. In a texture playing 0.65 notes a
second that is the loudest and by far the most regular event in the music, so the
music sounded like a metronome, because it had one.

The restriking was a mistake about this instrument. It imitates a tanpura's
repeated pluck, but these resonators are driven by a continuous trickle of noise
for as long as a note is held, so they genuinely sustain and never need renewing.
The drone is struck once, at the start, and held until the piece stops. Nothing
periodic is generated at all, so there is nothing to hear as a beat, and the
levels are set for a note that never decays: 7.7 dB under the melody in the band
that carries.

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

**The counter had to be made to mean what it said, twice, and both mistakes are
the same kind.** "Settled" means the piece just repeated itself, and each time it
was found to be measuring something else, the piece stalled at the opening stage
for want of admitting the next note.

First, it counted a phrase being picked to build a *new section* out of, so a
phrase inside a section repeating for ten minutes could be heard two hundred
times with its count still at one — and every one of those statements reset the
counter. The engine was calling its most repetitive stretches unsettled, and one
run in three never finished unfolding in an hour. It now counts statements of a
phrase that has been stated before.

Second, **it counts notes, not phrases.** A phrase is named by its notes *and*
its rhythm, because two rhythms over the same notes really are two phrases — that
is right everywhere else and wrong here. A variation changes the rhythm alone
about half the time, so half of everything invented arrived at this counter as
something new to say. What the gate decides is whether to admit another *note*,
and a fresh rhythm is no evidence either way. Over eight seeds, counting notes
puts 4.6 notes and 10.9 words in play at eight minutes against 4.1 and 9.0, and
at an hour the vocabularies are the same size — so it is not more material in the
end, it is the same material arriving sooner. It costs about 7% more notes a
second, and the step and leap shares do not move. Three seeds showed a five-point
drop in steps and twelve showed that was noise, which is a standing caution about
`tools/ratios.js`: it runs three.

The alternative was to shorten the threshold itself, and it is worth recording
why not. Re-basing the cube on the stage rather than on the notes in play —
1, 8, 27 instead of 64, 125, 216 — gives a slightly wider vocabulary at eight
minutes and costs 17.6 fold-backs per half hour against 0.3. A fold-back every
hundred seconds is not an event any more. The counter was miscounting; the
threshold was not wrong.

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
terms of what is left: how fast, how adventurous, how long it remembers, how many
parts, how busy — and `nearness`, the cents worth one bit, which is the only one
that is a measurement rather than an intention.

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

## 24. The field

§9 asked for four pictures and none of them is built. This is a fifth, and the
one that exists: the notes drawn as waves, and what you see is where the waves
cross.

Each note that is sounding, or is still remembered, is one plane wave. Three
things about that wave, and all three are read off the ratio. Nothing is chosen.

**Which way it runs.** Each prime gets a direction, at the angle of its own pitch
class round the octave — the 3 axis points where 3/2 falls, the 5 axis where 5/4
falls. A ratio's exponents add up to one arrow. This is the lattice, drawn.

**How fine it is.** The length of that arrow. Built on one prime it is exactly the
ratio's complexity — the same number that shades its pad — so the picture's
distance and the pad's distance are one measurement rather than two that happen
to agree. Near home is a broad slow swell; far out is a fine grain. Built on
several primes the steps point different ways and partly cancel, so the arrow
comes out shorter, which is the picture saying that a ratio reached along two
axes is nearer home than the size of its numbers suggests.

**How fast it slides.** One turn a second for every octave above the root, and the
other way round below it. Two notes slide past each other at the difference, so
after 1/(difference in octaves) seconds that pair is drawing the same figure
again, moved along.

That last one has a consequence. Since rate is height, the pair that takes longest
to come back round is the pair *closest together in pitch*, and the wait is simply
one over that gap. An octave takes a second; 5/4 against 81/64, a comma apart and
near enough the same note to the ear at first hearing, takes 56. The picture turns
an interval into a *duration* — and it is imperceptible, which is the subject of
"what the panel is legible for" below.

Two waves that have come round are drawing the identical figure, moved along: a
shared phase step across two waves running different ways is exactly a rigid
translation, since two non-parallel wave vectors make an invertible 2x2. That is
a test, not a hope. Three or more *moving* waves never repeat at all — their
rates are logs of whole numbers, so no common period exists and the picture only
ever comes close.

### What the panel is legible for

*I could never make sense of the picture. It was fun to look at though.* That is
the kind of report §12 warns about — impressionistic, and so about a missing
structure rather than a wording. Two rewrites of the caption did nothing, because
what was missing was not in the caption at all.

**The return period is the wrong thing to sell the panel on.** The arithmetic
above is exact and there are tests for it. The trouble is what it looks like. The
picture translates rigidly — one velocity `v` with `k·v = rate` for every wave,
which is the invertible 2x2 read as a motion — so the visible thing is a drift,
and the drift does not track the interval at all:

| held together | repeats after | drifts at |
|---|---|---|
| 1/1 and 2/1 | 1.0s | 1.000 panel widths/s |
| 1/1 and 5/4 | 3.1s | 0.088 |
| 5/4 and 81/64 (d and 2) | 55.8s | 0.095 |

A pair that comes round in three seconds and a pair that takes fifty-six move
across the panel at the same speed. Nothing about the motion says which you are
looking at. The return is real and it is in view — sampled, the panel at `t=T`
correlates 0.975 with the panel at `t=0` — but seeing it means holding a
fifty-six-second-old image in your head and comparing, with no mark on the panel
to compare against. No eye does that. **It is true, it is tested, it is in front
of you, and it is imperceptible.**

**What is instant is the other two.** How fine the bands are is the arrow's
length, which is the ratio's complexity — the same number that shades the pad.
Which way they lean is the direction, which is which primes and how many of each.
Both are legible in a glance, and everything built the same way lines up:

| ratio | lean | bands across the panel |
|---|---|---|
| 3/2 | 19° | 2.5 |
| 9/8 | 16° | 6.0 |
| 27/16 | 17° | 8.4 |
| 81/64 | 16° | 11.9 |
| 5/4 | 145° | 3.7 |

Stack 3s and the lean holds while the grain gets finer, one countable step at a
time. That is the lattice, drawn, and you can see it in four seconds instead of a
minute.

And it makes the project's argument better than the durations did. 5/4 and 81/64
are 21.5 cents apart — near enough the same note to the ear at first hearing —
and they draw pictures with nothing in common: 3.7 broad bands one way against
11.9 fine ones the other. The panel does not say *these are nearly the same and
here is the tiny difference*. It says *these were reached completely differently,
and here is what that looks like*. Printed as characters, the two are not even
the same kind of image.

**Nor can the number be printed live.** For whichever pair of sounding notes is
closest together it reads as noise, because that pair keeps being replaced by a
different pair: sampled every frame over a normal two-part run it parks on one
value for seconds and then leaps — 14, 14, 14, 13, 13, 13, 56, 56, 56, 11, 56,
13, 56, biggest single-frame jump 45 seconds. The duration is only ever watchable
for two notes held by hand.

(A first attempt at that measurement was wrong in a way worth recording: it built
the whole timeline and *then* sampled the Sonority at earlier times. A note whose
`endedAt` is still in the future has not begun to fade, so every future note
showed up at full weight and the memory looked three times its real size. Feed a
simulated clock forwards, never sideways.)

So the panel teaches the grammar — grain, lean, and that it slides faster the
higher the note. The return period stays in this file as arithmetic with two
tests, and off the panel. This is also the one panel that has to be told what it
means rather than shown: the sonority prints ratios, the shapes print ratios, the
partials are a table, and an unlabelled moving image reads as decoration.

§25 sells the flight on the wait becoming a distance, which is the same claim in
another sense. That has not been re-examined, and the same measurement probably
applies to it.

### The drone is not drawn

The drone never stops, so in a panel whose whole subject is what changes it was a
fixed share of the slots and of the amplitude, permanently. §4's own readout
already sets it apart for that reason.

The rule is not a hand-picked ratio but a property: a drone string in the same
pitch class as the root is left out. The picture is drawn *from* the root — it is
the origin every arrow is measured out from — so a drone string an octave from it
redraws the coordinate system rather than adding to the picture. Measured, that
string also swept the panel once a second, forever, four times faster than
anything the music does, where 3/2 takes 4.3s and 81/64 35s.

A melody note on 2/1 is untouched. That is an event; the drone's is a fixture.

### Octaves count here, and nowhere else

This is the one place in the project where two notes an octave apart are not the
same thing. Everywhere else identity is the pitch class, because everywhere else
the question is what a note *is*, and 4/3 is the same thing wherever you put it —
that is what §4 and `lattice.js` are for. Here the question is what is in the
room, and a note two octaves up is not the same thing in the room. So 2 takes the
same rule as every other prime: folded into one octave it lands on the root,
which gives it an angle of nought and a step of one, and it moves the picture
like anything else.

It was built the other way first, with the 2s left out of all three, and that is
worth recording because of how it failed. An octave of the root has no other
prime in it, so with the 2s left out its arrow has no length — and a wave of no
length that slides is not a wave sliding, it is the whole panel changing
brightness at once. Pressing 2/1 strobed at one beat a second. Octave-blind
direction and octave-aware rate cannot be mixed; the two decisions are one
decision.

The root itself still draws a wave of no extent that does not move: a flat,
steady glow. That is not a case being handled, it is what `cos(0·p + 0)` is, and
it says the right thing. The root agrees with itself everywhere, and everything
else is a departure from it. Hold the root and the whole field leans bright.

### What is not a fact about the ratios

Two numbers, and they are both about the panel rather than the music.

The **scale** — one bit of complexity is one fringe across the panel's width, so
3/2 draws two and a half broad bands and 81/64 twelve fine ones. Across the width
and not the height because the panel is much wider than it is tall, and against
the short side the finer ratios came out as dozens of fringes crossing a second
wave, which is plaid, not interference.

The **cap** — twelve waves, loudest first. The shader holds a fixed number and a
dozen overlapping waves is already past what an eye can separate. What gets
dropped is the faintest, which is what you could least see.

### Checking it without a browser

The same problem as the roughness model and the pad shading: this cannot be
verified by looking, from here. So the arithmetic lives in `src/field.js`, which
is pure and tested in node, and only the drawing lives in `src/interference.js`.
The fragment shader's sum was re-run in node over a grid and printed as
characters to confirm the picture has structure rather than being flat, mush, or
clipped — 4:5:6 came out at 1.33 of a possible 2.00 in contrast, the comma pair
at 1.98, and eight notes at once at 1.16 without clipping. That is also how the
fringe scale was settled, and how the strobe above was found.

## 25. Inside the field

The page was one thing: a bench, where every parameter is a slider and every
panel explains what the engine just did. That is the right shape for finding out
what a knob does and the wrong shape for playing, because you cannot study a
vocabulary and use your hands at the same time. So there are two views now, one
button apart. The bench is unchanged. The live view is the whole page given over
to one picture, the pads, and the little you would still want to read while
playing.

**The picture is the field panel with the eye put inside it, and that took no new
arithmetic at all.** A wave's phase from the clock is its rate times the time; its
phase from a position is that position times how fine it is. Those are the same
expression, so the second §24's panel animates in is a third direction in space,
at the scale the two already share. Hand a wave the vector it has always had —
`(x, y, rate)` — and sample the sum at `(x, y, t)`, and you have the panel at
time `t`, exactly. Not approximately; it is the same sum written twice, and there
are two tests that say so.

Everything else follows from that rather than being chosen:

- **The speed is one unit a second**, forward. At any other speed what is in
  front of the eye is not what the panel would be showing.
- **§24's durations become distances.** The wait for two notes to come back round
  is how far ahead the figure repeats, so the comma pair is not a minute of
  staring but a long tunnel, and 3/2 is a short one. Measured, the comma pair's
  picture moves at a fifth the speed of the hexany's.
- **What is ahead is the next few seconds of the panel**, in perspective, about
  three and a half of them.

**The root is fog.** §24 keeps a wave with no extent deliberately — the root
agrees with itself everywhere, so it draws an even wash, and you can see past a
wash. Inside a solid the same wave fills every point equally, every ray
saturates, and the picture goes blind: measured, every set containing 1/1 came
out at a contrast of 0.00 against a possible 1.00. This is §24's strobe from the
other side, and it has the same answer. A thing with no extent has nowhere to be,
so the root lights the space instead of filling it, which is the same sentence
about it read in three dimensions. Hold the root and the corridor glows.

**And the panel's own curve was wrong here, which was worth finding.** §24 lifts
the shallow ground with a 0.65 power, because on a flat picture that is where the
interesting part is. Used as a *density* the same curve fills space: measured, the
whole march turned to fog and contrast fell to 0.03. A solid has to be mostly
empty or you cannot see into it, so the curve goes the other way — only where the
waves really agree. Crests are what there is and troughs are what you fly along,
which is still the panel's reading of the sign, since where the waves cancel it
already shows the page underneath.

**Some ratios cannot be drawn, and they fade rather than lie.** A ray samples at
intervals, and a wave whose fringes are closer together than that gap cannot be
sampled honestly — drawn anyway it becomes sparkle unrelated to the music. So it
fades out instead. Everything in the engine's own set is comfortably clear of the
limit; only the far-flung pads reach it, and 81/64, the most remote thing on the
bench, sits right on it and comes out faint. That is the honest answer rather
than a lucky one.

**The eye does not move sideways, and that is a decision.** The freedom was once
spent on easing toward wherever §4 estimates the tonal centre to be, so the
picture would move with the harmony instead of running on rails. It made people
dizzy. §4's centre changes every few seconds and each change is a long way — the
hexany's members sit 1.7 to 3.7 units from the root on the picture — so the eye
was sliding sideways at up to **0.92 units a second against a forward speed of
1.00**, then decelerating, then swerving again. Repeated unpredictable sideways
acceleration is how you make somebody sick.

Sitting still on the root's axis is the right answer rather than the absence of
one: §24 draws the whole picture *from* the root, and under this engine every
note means its ratio to it. Nothing was lost, because what makes the picture move
is the waves changing, and they change on every note.

**What is not a fact about the ratios**, on the same terms as §24: how far a ray
steps, how far it goes and where it starts; how solid a crest is, which is one
number and not two, because setting brightness equal to it pins the brightest
possible ray at exactly one so nothing can blow past; how hard the curve is; how
much the root glows; and how wide the lens is. That last one is §24's fringe
scale being re-chosen for a view of a different shape — a page is not a strip —
and it is worth knowing that a near plane and a narrow lens go together. The
march starts eight tenths of a unit ahead of the eye, which costs a little of the
view and settles most of the flicker, and with it the lens can stay at about
ninety degrees and measure *better* than a wide one: the comma pair went from
0.44 to 0.67 in contrast. Width buys sharpness by stretching the edges of the
view, which is exactly where the eye reads speed from.

One bug worth recording because it will happen again. These constants are folded
into the shader source as text, and `${2.0}` in a template comes out as `"2"` —
which GLSL will not take as a float, because it has no implicit conversion from
int. Setting the lens to a round number stopped the whole view compiling. Every
float that goes into the source now goes through a helper that keeps its decimal
point, since the alternative is a rule that holds only while nobody picks a round
number.

All of it was settled the way §24 settled the panel: the march re-run in node
over the sets the engine actually produces, then in a headless browser reading
the pixels back. It lands at a mean of 0.17 to 0.35 with contrast 0.36 to 0.50,
nothing blown and nothing empty, which is dark enough to read text over.

**The live view shows less on purpose**: what you would read while playing, and
nothing that is there to explain what the engine did. Pinning goes with the
latter, even though §18 argues it is the one control worth having, because you
have to see a shape to decide to pin it.

Marching costs far more than slicing, so the view watches its own frame times and
gives up resolution rather than smoothness, and only ever downwards: climbing back
as soon as it is comfortable makes it oscillate between two resolutions, which is
worse than the lower one.
