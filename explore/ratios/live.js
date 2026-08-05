// Driving the composer from a real clock.
//
// `Composer.perform` generates a whole stretch at once, which is right for
// measuring and useless for listening. This walks the same parts forward against
// wall time so the thing can be heard and steered while it runs.

export class LivePlayer {
  constructor({ composer, now, play, release }) {
    this.composer = composer;
    this.now = now;
    this.play = play;
    this.release = release;

    this.running = false;
    this.timer = null;
    this.origin = 0;
    this.holding = [];
    // No lookahead. Playing a note early because the timer is about to fire
    // scatters onsets across a window wider than the grid itself, which destroys
    // the beat while every offline measurement stays perfect. A note is played
    // on the first tick at or after its time, so it is always slightly late and
    // never early, by less than the ear resolves.
    this.interval = 8; // ms between ticks: the worst lateness any note can have
  }

  start() {
    if (this.running) return;
    this.origin = this.now();
    for (const part of this.composer.parts) {
      part.next = 0;
      part.cell = null;
      part.phrase = null;
      part.step = 0;
    }
    if (this.composer.droneNext !== undefined) this.composer.droneNext = 0;
    this.running = true;
    this.timer = setInterval(() => this.tick(), this.interval);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.running = false;
    for (const held of this.holding) this.release(held.id);
    this.holding = [];
  }

  setParams(values) {
    this.composer.setParams(values);
  }

  tick() {
    // A timer callback that throws leaves the page looking exactly like a page
    // where somebody pressed stop: no sound, no error, no clue. Whatever went
    // wrong with one tick, the next one gets a fresh try, and the problem says
    // so out loud once rather than never.
    try {
      this.step_();
    } catch (problem) {
      if (!this.complained) {
        this.complained = true;
        console.error("the player hit a problem and is carrying on", problem);
      }
    }
  }

  step_() {
    const at = this.now() - this.origin;

    // Hold back while somebody is playing. The parts are carried forward so they
    // do not pile up a debt of notes and then discharge it in a burst the moment
    // the player stops — they simply were not playing during that time, which is
    // what a musician who is listening does.
    if (this.composer.quietUntil > at) {
      for (const part of this.composer.parts) if (part.next < at) part.next = at;
      return this.sweep();
    }

    // The guard is not politeness: if a parameter change makes every part's
    // duration tiny, this loop would otherwise try to catch up forever inside
    // one timer callback and freeze the page.
    for (let guard = 0; guard < 64; guard++) {
      const part = this.composer.parts.reduce((soonest, p) => (p.next < soonest.next ? p : soonest));
      if (part.next > at) break;

      const event = this.composer.step(part);
      if (!event) break;

      // Whether to sound this note is the composer's decision if it made one.
      const mute = event.mute !== undefined ? event.mute : this.composer.random() >= this.composer.params.density;
      if (!mute) {
        const id = this.play(event.ratio, event.velocity, event.tag);
        if (id !== null && id !== undefined) {
          this.holding.push({ id, until: this.origin + event.start + event.duration });
        }
      }
      this.composer.maybeMove();
    }

    // The drone, if this composer has one. It is not accompaniment: without a
    // sounding root the ratios have nothing to be ratios *of*.
    if (this.composer.droneDue) {
      const drone = this.composer.droneDue(at);
      if (drone) {
        for (const voice of drone) {
          const id = this.play(voice.ratio, voice.velocity, voice.tag, { sustain: voice.sustain ?? 0.5 });
          if (id !== null && id !== undefined) {
            // Held until the piece stops. Releasing a drone kills its sustain,
            // and it could then only be renewed by striking it again — which on
            // a fixed period is a metronome.
            this.holding.push({ id, until: Infinity });
          }
        }
      }
    }

    this.sweep();
  }

  /** Let go of anything whose time is up. */
  sweep() {
    const now = this.now();
    this.holding = this.holding.filter((held) => {
      if (held.until > now) return true;
      this.release(held.id);
      return false;
    });
  }

  /** Keep quiet for a while — somebody else is playing. */
  hush(seconds) {
    if (this.composer.quietUntil === undefined) return;
    this.composer.quietUntil = this.now() - this.origin + seconds;
  }
}
