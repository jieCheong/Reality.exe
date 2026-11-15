export const GREETING_PROMPT = 'Hi, I am ORBIT! Say good morning to start your morning routine, or good night for your bedtime routine.';
/** "good morning" / "morning" -> 'morning'; "good night" / "goodnight" / "night" -> 'night'; else null. */
export function greetingChoice(text) {
  const t = text.toLowerCase().replace(/[^a-z ]/g, ' ');
  const morning = /\bmorning\b/.test(t), night = /\b(good ?night|night|bedtime)\b/.test(t);
  return morning === night ? null : morning ? 'morning' : 'night';
}

export const WORLDS = Object.freeze([
  Object.freeze({ id: 'space', name: 'Space', words: ['one', '1', 'space', 'moon', 'rocket'] }),
  Object.freeze({ id: 'odyssey', name: 'Odyssey', words: ['two', '2', 'odyssey', 'ocean', 'sea', 'boat'] }),
  Object.freeze({ id: 'backrooms', name: 'Backrooms', words: ['three', '3', 'backrooms', 'backroom', 'back rooms'] }),
]);
export const WORLD_PROMPT = 'Pick your world! Say one for Space, two for Odyssey, or three for Backrooms.';
/** "two" / "ocean" -> 'odyssey'. Null when no world or more than one world is named. */
export function worldChoice(text) {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ')} `;
  const hits = WORLDS.filter(world => world.words.some(w => t.includes(` ${w} `)));
  return hits.length === 1 ? hits[0].id : null;
}

/** Parent installed the routine(s). With both a morning and a night routine, the child's greeting
 *  picks one; with `worlds` on (Juan's themed HUD) the child then picks a world. Otherwise the routine
 *  starts right away. Spoken claims never advance a step. */
export class RoutineSession {
  constructor({ game, speech, routines = null, worlds = false }) {
    this.game = game; this.speech = speech; this.seen = new Set();
    this.routines = routines?.morning && routines?.night ? routines : null;
    this.worlds = worlds === true;
  }
  start() {
    if (this.started || this.closed) return; this.started = true;
    return this.next();
  }
  /** Ask for whatever is still missing (greeting, then world), else start the routine. */
  next() {
    if (this.routines && !this.routine) return this.ask('greeting', 'SAY GOOD MORNING OR GOOD NIGHT', GREETING_PROMPT);
    if (this.worlds && !this.world) return this.ask('world', 'PICK YOUR WORLD: 1 SPACE, 2 ODYSSEY, 3 BACKROOMS', WORLD_PROMPT);
    this.awaiting = null;
    if (this.routine) this.game.setRoutine(this.routine);
    if (this.world) this.game.setTheme({ id: this.world.id, name: this.world.name, missionIntros: {} });
    this.game.start();
  }
  ask(what, objective, prompt) {
    this.awaiting = what; this.prompt = prompt;
    this.game.hud.setState({ gameState: { phase: 'SCAN', objective, missionProgress: 0 } });
    return this.game.announce(prompt, { force: true });
  }
  async handleTranscript(event) {
    if (!event.isFinal || !this.started || this.closed) return;
    const id = event.itemId || `${event.createdAt}:${event.transcript}`;
    if (this.seen.has(id)) return;
    this.seen.add(id); if (this.seen.size > 128) this.seen.delete(this.seen.values().next().value);
    const text = event.transcript.toLowerCase().trim().replace(/[.!?]+$/, '');
    if (['stop','wait','pause'].includes(text)) { this.game.pause(); await this.speech.interrupt(); return; }
    if (this.awaiting) {
      // Choices may be said over ORBIT's prompt; they pick a routine or world, never advance a step.
      // "Good morning, space!" answers both questions at once.
      const greeting = this.routines && !this.routine ? greetingChoice(text) : null;
      const world = this.worlds && !this.world ? worldChoice(text) : null;
      if (greeting) this.routine = this.routines[greeting];
      if (world) this.world = WORLDS.find(w => w.id === world);
      if (greeting || (world && this.awaiting === 'world')) { await this.speech.interrupt(); await this.next(); }
      else if (!this.speech.busy) await this.game.announce(this.prompt, { force: true });
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
