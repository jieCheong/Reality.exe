/** Parent already selected routine/theme. Spoken claims never directly advance it. */
export class RoutineSession {
  constructor({ game, speech }) { this.game = game; this.speech = speech; this.seen = new Set(); }
  start() { if (this.started || this.closed) return; this.started = true; this.game.start(); }
  async handleTranscript(event) {
    if (!event.isFinal || !this.started || this.closed) return;
    const id = event.itemId || `${event.createdAt}:${event.transcript}`;
    if (this.seen.has(id)) return;
    this.seen.add(id); if (this.seen.size > 128) this.seen.delete(this.seen.values().next().value);
    const text = event.transcript.toLowerCase().trim().replace(/[.!?]+$/, '');
    if (['stop','wait','pause'].includes(text)) { this.game.pause(); await this.speech.interrupt(); return; }
    if (this.speech.busy) return;
    if (text === 'resume') await this.game.resume();
    else if (['repeat','help','hint'].includes(text)) await this.game.announce(this.game.engine.instruction(), { force: true });
    else if (text === 'done') await this.game.tick(); // still requires camera/consensus/freshness
  }
  close() {
    if (this.closeTask) return this.closeTask;
    this.closed = true;
    // Stop timers/verification even if stopping audio throws or takes longer.
    this.closeTask = Promise.allSettled([
      Promise.resolve().then(() => this.speech.close()),
      Promise.resolve().then(() => this.game.close()),
    ]).then(results => {
      const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, 'Routine session cleanup failed', { cause: errors[0] });
    });
    return this.closeTask;
  }
}
