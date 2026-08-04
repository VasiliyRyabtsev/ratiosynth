// What a melodic line is doing, as numbers.
//
// The point of this file is that the *same* code measures a Hungarian folk
// song and our own output. A line is a list of { cents, start, duration } with
// time in beats, and nothing here knows or cares where it came from. If the
// measurements were computed two different ways the comparison would be
// worthless, so they are computed once.
//
// Everything is measured in cents — hundredths of an octave's twelfth part, but
// used here only as a ruler: a logarithm of the ratio with a convenient scale on
// it, never a set of steps to land on. Nothing rounds to it.
//
// The buckets below are named by the span they cover rather than by a scale
// degree. "Third" and "fifth" belong to a twelve-note keyboard, and using those
// names would quietly invite us to read our own output as if it had degrees. It
// does not: a melody here is ratios against a root, and the only thing an
// interval has is a size.

/** Buckets for interval sizes, in cents. The last one catches everything above. */
export const STEPS = [
  { name: "same", to: 50 },
  { name: "50–150¢", to: 150 },
  { name: "150–250¢", to: 250 },
  { name: "250–450¢", to: 450 },
  { name: "450–550¢", to: 550 },
  { name: "550–650¢", to: 650 },
  { name: "650–750¢", to: 750 },
  { name: "750–1150¢", to: 1150 },
  { name: "octave+", to: Infinity },
];

export function bucketOf(cents) {
  const size = Math.abs(cents);
  return STEPS.findIndex((step) => size < step.to);
}

/**
 * Everything we know how to ask about one line.
 *
 * Returns fractions rather than counts so lines of different lengths can be
 * pooled, plus the counts needed to pool them properly.
 */
export function lineStats(line) {
  if (!line || line.length < 4) return null;

  const intervals = [];
  for (let i = 1; i < line.length; i++) intervals.push(line[i].cents - line[i - 1].cents);

  const sizes = new Array(STEPS.length).fill(0);
  for (const interval of intervals) sizes[bucketOf(interval)]++;

  // Direction, and what happens after a big move. Melodies the world over
  // fill in a leap by turning round, and a line that does not do this sounds
  // like it is wandering rather than going somewhere.
  let up = 0;
  let down = 0;
  let level = 0;
  let leaps = 0;
  let leapsReversed = 0;
  let turns = 0;
  let turnable = 0;
  for (let i = 0; i < intervals.length; i++) {
    const interval = intervals[i];
    if (Math.abs(interval) < 50) level++;
    else if (interval > 0) up++;
    else down++;

    if (Math.abs(interval) >= 450) {
      leaps++;
      const next = intervals[i + 1];
      if (next !== undefined && Math.sign(next) === -Math.sign(interval)) leapsReversed++;
    }
    // Only pairs where the line actually moved both times can turn, so a
    // repeated note must not count against the rate. Counting it would make a
    // corpus with many repeats look far more single-minded than it is.
    if (i > 0) {
      const here = Math.abs(interval) < 50 ? 0 : Math.sign(interval);
      const before = Math.abs(intervals[i - 1]) < 50 ? 0 : Math.sign(intervals[i - 1]);
      if (here !== 0 && before !== 0) {
        turnable++;
        if (here !== before) turns++;
      }
    }
  }

  // Rhythm. Durations relative to the most common one in this line, so a piece
  // written in half notes compares with one written in quavers.
  const durations = line.map((note) => note.duration).filter((d) => d > 0);
  const unit = mode(durations.map((d) => round(d)));
  const relative = durations.map((d) => d / (unit || 1));

  // Silence between notes: how much of the time is nothing sounding.
  let sounding = 0;
  const span = line[line.length - 1].start + line[line.length - 1].duration - line[0].start;
  for (const note of line) sounding += note.duration;

  // Phrases: runs of notes separated by a gap of at least one unit.
  const phrases = [];
  let run = 1;
  for (let i = 1; i < line.length; i++) {
    const gap = line[i].start - (line[i - 1].start + line[i - 1].duration);
    if (gap >= (unit || 1) * 0.75) {
      phrases.push(run);
      run = 1;
    } else run++;
  }
  phrases.push(run);

  const pitches = line.map((note) => note.cents);

  return {
    notes: line.length,
    intervals: intervals.length,
    sizes,
    up,
    down,
    level,
    leaps,
    leapsReversed,
    turns,
    turnable,
    range: Math.max(...pitches) - Math.min(...pitches),
    intervalEntropy: entropy(sizes),
    durationEntropy: entropy(histogram(relative.map((r) => round(r, 4)))),
    distinctDurations: new Set(relative.map((r) => round(r, 4))).size,
    restFraction: span > 0 ? Math.max(0, 1 - sounding / span) : 0,
    phraseLength: mean(phrases),
    phrases: phrases.length,
    recurrence: recurrence(intervals),
    contourReturns: returnsHome(pitches),
    ...tonalWeight(pitches),
    ...longRange(intervals),
  };
}

/**
 * Is there a home note?
 *
 * A line that uses all its pitches equally has no tonic, and music without a
 * tonic sounds like it is going nowhere in particular however well formed it is.
 * Real melody is strongly uneven: a few pitches carry most of the notes.
 *
 * Pitch classes at fifty-cent resolution, so the measure does not care which
 * tuning system produced them.
 */
function tonalWeight(pitches) {
  const counts = new Map();
  for (const pitch of pitches) {
    const cls = Math.round((((pitch % 1200) + 1200) % 1200) / 50);
    counts.set(cls, (counts.get(cls) ?? 0) + 1);
  }
  const tallies = [...counts.values()].sort((a, b) => b - a);
  const total = pitches.length;
  return {
    pitchEntropy: entropy(tallies),
    topPitchShare: tallies[0] / total,
    // How much flatter the real distribution is than a perfectly even one. Zero
    // means every pitch is used equally, which is the aimless case.
    tonalFocus: tallies.length > 1 ? 1 - entropy(tallies) / Math.log2(tallies.length) : 1,
  };
}

/**
 * Does anything come back later?
 *
 * `recurrence` above only sees runs of four, so it cannot tell a piece with
 * phrases from one that merely reuses small gestures. This looks for the line
 * repeating itself at longer distances, which is what a phrase returning is.
 *
 * Reported as the best match found at any lag from eight to sixty-four events,
 * and the lag it was found at.
 */
function longRange(intervals) {
  const coded = intervals.map((v) => Math.sign(v) * bucketOf(v));
  let best = 0;
  let bestLag = 0;
  for (let lag = 8; lag <= 64; lag++) {
    if (coded.length < lag * 2) break;
    let same = 0;
    let seen = 0;
    for (let i = lag; i < coded.length; i++) {
      seen++;
      if (coded[i] === coded[i - lag]) same++;
    }
    if (seen > 0 && same / seen > best) {
      best = same / seen;
      bestLag = lag;
    }
  }
  return { longRange: best, longRangeLag: bestLag };
}

/**
 * How much of the line is made of material heard more than once.
 *
 * Runs of four intervals, quantised to buckets so a slightly different version
 * of the same shape still counts. This is the closest single number to "does
 * anything come back".
 */
function recurrence(intervals, length = 4) {
  if (intervals.length < length * 2) return 0;
  const shapes = [];
  for (let i = 0; i + length <= intervals.length; i++) {
    shapes.push(intervals.slice(i, i + length).map((v) => Math.sign(v) * bucketOf(v)).join(","));
  }
  const counts = new Map();
  for (const shape of shapes) counts.set(shape, (counts.get(shape) ?? 0) + 1);
  let repeated = 0;
  for (const shape of shapes) if (counts.get(shape) > 1) repeated++;
  return repeated / shapes.length;
}

/**
 * How often the line comes back to where it has already been.
 *
 * A line that keeps returning has a home; one that never does is drifting.
 */
function returnsHome(pitches) {
  const seen = new Map();
  let returns = 0;
  for (const pitch of pitches) {
    const key = Math.round(pitch / 50);
    if (seen.has(key)) returns++;
    seen.set(key, true);
  }
  return returns / pitches.length;
}

/** Add one line's numbers into a running total. */
export function pool(total, stats) {
  if (!stats) return total;
  if (!total) {
    return {
      lines: 1,
      notes: stats.notes,
      intervals: stats.intervals,
      sizes: [...stats.sizes],
      up: stats.up,
      down: stats.down,
      level: stats.level,
      leaps: stats.leaps,
      leapsReversed: stats.leapsReversed,
      turns: stats.turns,
      turnable: stats.turnable,
      range: [stats.range],
      intervalEntropy: [stats.intervalEntropy],
      durationEntropy: [stats.durationEntropy],
      distinctDurations: [stats.distinctDurations],
      restFraction: [stats.restFraction],
      phraseLength: [stats.phraseLength],
      recurrence: [stats.recurrence],
      contourReturns: [stats.contourReturns],
      pitchEntropy: [stats.pitchEntropy],
      topPitchShare: [stats.topPitchShare],
      tonalFocus: [stats.tonalFocus],
      longRange: [stats.longRange],
    };
  }
  total.lines++;
  total.notes += stats.notes;
  total.intervals += stats.intervals;
  for (let i = 0; i < total.sizes.length; i++) total.sizes[i] += stats.sizes[i];
  total.up += stats.up;
  total.down += stats.down;
  total.level += stats.level;
  total.leaps += stats.leaps;
  total.leapsReversed += stats.leapsReversed;
  total.turns += stats.turns;
  total.turnable += stats.turnable;
  for (const key of ["range", "intervalEntropy", "durationEntropy", "distinctDurations", "restFraction", "phraseLength", "recurrence", "contourReturns", "pitchEntropy", "topPitchShare", "tonalFocus", "longRange"]) {
    total[key].push(stats[key]);
  }
  return total;
}

/** Turn a pool into the numbers worth printing, with spread as well as middle. */
export function summarise(total) {
  if (!total) return null;
  const share = (n) => n / Math.max(1, total.intervals);
  return {
    lines: total.lines,
    notes: total.notes,
    sizes: total.sizes.map(share),
    up: share(total.up),
    down: share(total.down),
    level: share(total.level),
    leapReversal: total.leaps > 0 ? total.leapsReversed / total.leaps : 0,
    turnRate: total.turns / Math.max(1, total.turnable),
    range: spread(total.range),
    intervalEntropy: spread(total.intervalEntropy),
    durationEntropy: spread(total.durationEntropy),
    distinctDurations: spread(total.distinctDurations),
    restFraction: spread(total.restFraction),
    phraseLength: spread(total.phraseLength),
    recurrence: spread(total.recurrence),
    contourReturns: spread(total.contourReturns),
    pitchEntropy: spread(total.pitchEntropy),
    topPitchShare: spread(total.topPitchShare),
    tonalFocus: spread(total.tonalFocus),
    longRange: spread(total.longRange),
  };
}

/** Middle and edges. The band matters more than the average — see the notes. */
export function spread(values) {
  if (values.length === 0) return { median: 0, low: 0, high: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: quantile(sorted, 0.5),
    low: quantile(sorted, 0.1),
    high: quantile(sorted, 0.9),
  };
}

function quantile(sorted, at) {
  const index = (sorted.length - 1) * at;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return sorted[low] + (sorted[high] - sorted[low]) * (index - low);
}

function histogram(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.values()];
}

function entropy(counts) {
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 0) return 0;
  let bits = 0;
  for (const count of counts) {
    if (count === 0) continue;
    const p = count / total;
    bits -= p * Math.log2(p);
  }
  return bits;
}

function mode(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = values[0];
  let most = 0;
  for (const [value, count] of counts) if (count > most) [best, most] = [value, count];
  return best;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function round(value, places = 0) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}
