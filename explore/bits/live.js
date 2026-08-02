// Driving the composer from a real clock.
//
// `Composer.perform` generates a whole stretch at once, which is right for
// measuring and useless for listening. This walks the same parts forward against
// wall time so the thing can be heard and steered while it runs — which was
// always the point, and which it had never actually done.

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
    // scatters onsets across a window wider than the grid itself — measured, it
    // took a rhythm that was 100% on the grid offline down to 0% live, which is
    // to say it destroyed the beat entirely while every offline number stayed
    // perfect. A note is played on the first tick at or after its time, so it is
    // always slightly late and never early, and the lateness is smaller than the
    // ear resolves.
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
    const at = this.now() - this.origin;

    // The guard is not politeness: if a parameter change makes every part's
    // duration tiny, this loop would otherwise try to catch up forever inside
    // one timer callback and freeze the page.
    for (let guard = 0; guard < 64; guard++) {
      const part = this.composer.parts.reduce((soonest, p) => (p.next < soonest.next ? p : soonest));
      if (part.next > at) break;

      const event = this.composer.step(part);
      if (!event) break;

      // Whether to sound this note is the composer's decision if it made one.
      // The fixed-root engine decides it once per phrase, because rolling it per
      // note punched holes in phrases and no phrase came out twice the same.
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
    // sounding root the ratios have nothing to be ratios *of*, and the whole
    // reason a step is allowed to be an ugly number is that nobody is hearing it
    // as an interval — they are hearing each note against the root.
    if (this.composer.droneDue) {
      const drone = this.composer.droneDue(at);
      if (drone) {
        for (const voice of drone) {
          const id = this.play(voice.ratio, voice.velocity, voice.tag, { sustain: voice.sustain ?? 0.5 });
          if (id !== null && id !== undefined) {
            this.holding.push({ id, until: this.now() + this.composer.params.pulse * 17 });
          }
        }
      }
    }

    const now = this.now();
    this.holding = this.holding.filter((held) => {
      if (held.until > now) return true;
      this.release(held.id);
      return false;
    });
  }
}
