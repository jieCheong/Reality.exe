import { EventEmitter } from 'node:events';
import { HUD_VIDEO_PROFILE } from './hud-video-profile.mjs';
import { ROUTINE, PHASES, predicateFor } from './routine.mjs';

export { PHASES };
// The landscape HUD only fills the screen when the player's phone is sideways.
const ROTATE_HINT = HUD_VIDEO_PROFILE.name === 'landscape-test' ? 'Turn your phone sideways for the full display. ' : '';
const clean = text => String(text || '').replace(/[\x00-\x1f]/g, ' ').slice(0, 180);
const CHEERS = ['Nice work!', 'Great job!', 'You got it!', 'Awesome!', 'Way to go!'];

/**
 * Deterministic routine state. Neither speech nor a raw model YES advances a step:
 * each step needs two fresh verification rounds, each a 2-of-3 frame consensus.
 */
export class MissionEngine extends EventEmitter {
  /** @param {{ routine?: typeof ROUTINE }} [options] inject a routine for tests */
  constructor({ routine = ROUTINE } = {}) {
    super();
    this.routine = routine;
    this.phases = routine.steps.map(s => s.short);
    this.phase = this.phases[0]; this.revision = 0; this.escaped = false;
    this.streak = 0; this.usedFrames = new Set();
  }
  get step() { return this.routine.steps[this.phases.indexOf(this.phase)]; }
  /** Objects the current step is about; the vision bridge accepts at most 3 per check. */
  get catalog() {
    return this.step.check === 'SHOW' ? [] : this.step.objects.map(name => ({ name, description: name, box_2d: [] }));
  }
  resetEvidence() { this.streak = 0; }
  instruction() {
    if (this.escaped) return `${this.routine.name} complete! Every step verified. Have a great day!`;
    if (this.revision === 0) {
      return `I am ORBIT, your mission guide. ${ROTATE_HINT}${this.routine.name} has ${this.phases.length} steps. ${this.step.say}`;
    }
    return this.step.say;
  }
  hudState() {
    const index = this.phases.indexOf(this.phase);
    return {
      phase: this.phase,
      objective: this.escaped ? 'ROUTINE COMPLETE' : this.step.hud,
      missionProgress: this.escaped ? 1 : index / this.phases.length,
      checkpoints: Object.fromEntries(this.phases.map((p, i) =>
        [p, this.escaped || i < index ? 'complete' : i === index ? 'active' : 'pending'])),
    };
  }
  request() {
    return { revision: this.revision, operation: 'verify', catalog: this.catalog, predicate: predicateFor(this.step) };
  }
  feedback(hint) {
    this.resetEvidence();
    this.emit('message', clean(hint) || 'I cannot see that yet. Show me clearly and hold still.');
  }
  apply(request, result) {
    if (this.escaped || request.revision !== this.revision || request.operation !== 'verify' ||
      request.predicate !== this.request().predicate) return false;
    if (!Array.isArray(request.frameIds) || request.frameIds.length !== 3 || new Set(request.frameIds).size !== 3 ||
      request.frameIds.some(id => typeof id !== 'string' || this.usedFrames.has(id))) {
      this.feedback('I need fresh camera frames before checking again.'); return false;
    }
    for (const id of request.frameIds) this.usedFrames.add(id);
    if (result.status !== 'checked') { this.feedback(result.correction_hint); return false; }
    const verdicts = result.frame_verdicts;
    const yes = Array.isArray(verdicts) ? verdicts.filter(v => v.satisfied === true && Number.isFinite(v.confidence) &&
      v.confidence >= 0.7 && v.confidence <= 1 && !v.error && !v.geometry_override) : [];
    if (result.predicate !== request.predicate || result.satisfied !== true || result.votes_total !== 3 ||
      verdicts?.length !== 3 || result.votes_for !== yes.length || yes.length < 2 ||
      new Set(verdicts.map(v => v.frame_index)).size !== 3 || verdicts.some(v => ![0, 1, 2].includes(v.frame_index))) {
      this.feedback(result.correction_hint); return false;
    }
    if (++this.streak < 2) return false;
    const index = this.phases.indexOf(this.phase);
    if (index === this.phases.length - 1) this.escaped = true;
    else this.phase = this.phases[index + 1];
    this.revision++; this.resetEvidence();
    this.emit('state', this.hudState());
    this.emit('message', this.escaped ? this.instruction() : `${CHEERS[index % CHEERS.length]} ${this.instruction()}`);
    return true;
  }
}
