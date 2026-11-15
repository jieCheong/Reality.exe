export const GREETING_PROMPT = 'Hi, I am ORBIT! Say good morning to start your morning routine, or good night for your bedtime routine.';
/** "good morning" / "morning" -> 'morning'; "good night" / "goodnight" / "night" -> 'night'; else null. */
export function greetingChoice(text) {
  const t = text.toLowerCase().replace(/[^a-z ]/g, ' ');
  const morning = /\bmorning\b/.test(t), night = /\b(good ?night|night|bedtime)\b/.test(t);
  return morning === night ? null : morning ? 'morning' : 'night';
}

/** Parent installed the routine(s). With both a morning and a night routine, the child's greeting
 *  picks one; otherwise the single routine starts right away. Spoken claims never advance a step. */
export class RoutineSession {
  constructor({ game, speech, routines = null }) {
    this.game = game; this.speech = speech; this.seen = new Set();
    this.routines = routines?.morning && routines?.night ? routines : null;
  }
  start() {
    if (this.started || this.closed) return; this.started = true;
    if (!this.routines) { this.game.start(); return; }
    this.awaitingGreeting = true;
    this.game.hud.setState({ gameState: { phase: 'SCAN', objective: 'SAY GOOD MORNING OR GOOD NIGHT', missionProgress: 0 } });
    return this.game.announce(GREETING_PROMPT, { force: true });
  }
  choose(choice) {
    this.awaitingGreeting = false;
    this.game.setRoutine(this.routines[choice]); this.game.start();
  }
  async handleTranscript(event) {
    if (!event.isFinal || !this.started || this.closed) return;
    const id = event.itemId || `${event.createdAt}:${event.transcript}`;
    if (this.seen.has(id)) return;
    this.seen.add(id); if (this.seen.size > 128) this.seen.delete(this.seen.values().next().value);
    const text = event.transcript.toLowerCase().trim().replace(/[.!?]+$/, '');
    if (['stop','wait','pause'].includes(text)) { this.game.pause(); await this.speech.interrupt(); return; }
    if (this.awaitingGreeting) {
      // A greeting may be said over ORBIT's prompt; it is a choice, not a progress claim.
      const choice = greetingChoice(text);
      if (choice) { await this.speech.interrupt(); this.choose(choice); }
      else if (!this.speech.busy) await this.game.announce(GREETING_PROMPT, { force: true });
      return;
    }
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
