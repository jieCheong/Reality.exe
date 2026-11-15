import { EventEmitter } from 'node:events';
import { validateRoutine, assertRoutineCapabilities } from './routine-contract.mjs';

const clean = text => typeof text === 'string' ? text.replace(/[\x00-\x1f]/g, ' ').slice(0, 500) : '';
const validObject = o => o && typeof o.name === 'string' && /^[a-z0-9][a-z0-9 -]{0,47}$/.test(o.name) &&
  typeof o.description === 'string' && o.description.length > 0 && o.description.length <= 300 &&
  Array.isArray(o.box_2d) && o.box_2d.length === 4 && o.box_2d.every(Number.isInteger) &&
  0 <= o.box_2d[0] && o.box_2d[0] < o.box_2d[2] && o.box_2d[2] <= 1000 &&
  0 <= o.box_2d[1] && o.box_2d[1] < o.box_2d[3] && o.box_2d[3] <= 1000;

function verdictRound(result, predicate) {
  const frames = result.frame_verdicts;
  if (result.status !== 'checked' || result.predicate !== predicate || typeof result.satisfied !== 'boolean' ||
      result.votes_total !== 3 || !Array.isArray(frames) || frames.length !== 3 ||
      new Set(frames.map(f => f.frame_index)).size !== 3 || frames.some(f => ![0,1,2].includes(f.frame_index) ||
        typeof f.satisfied !== 'boolean' || !Number.isFinite(f.confidence) || f.confidence < 0 || f.confidence > 1)) return null;
  const yes = frames.filter(f => f.satisfied && f.confidence >= .7 && !f.error && !f.geometry_override).length;
  if (result.votes_for !== yes || result.satisfied !== (yes >= 2)) return null;
  return { pass: yes >= 2, conclusiveFailure: frames.every(f => !f.error) &&
    frames.filter(f => !f.satisfied && f.confidence >= .7 || f.geometry_override).length >= 2 };
}

/** Deterministic routine mode. Existing fixed spaceship engine is unchanged. */
export class RoutineMissionEngine extends EventEmitter {
  constructor(routine, { now = Date.now } = {}) {
    super(); this.routine = assertRoutineCapabilities(validateRoutine(routine)); this.now = now;
    this.phase = 'SCAN'; this.revision = 0; this.escaped = false; this.catalog = []; this.stepIndex = -1;
    this.results = []; this.misses = 0; this.usedFrames = new Set(); this.missing = [...this.routine.objects];
    this.clockStarted = null; this.elapsedMs = 0; this.penaltyMs = 0; this.resetEvidence();
  }
  resetEvidence() { this.streak = 0; this.inventoryCandidate = ''; }
  instruction() {
    if (this.escaped) return `Routine finished. You completed ${this.results.filter(r => r.status === 'done').length} of ${this.routine.steps.length} steps. Thank you for trying with ORBIT.`;
    if (this.phase === 'SCAN') return `I am ORBIT, your routine guide. A parent should be with you. I will use the camera to check visible steps and keep a photo of each verified step for your parent. Show me ${this.missing.join(', ') || this.routine.objects.join(', ')} and hold the camera still.`;
    const step = this.routine.steps[this.stepIndex];
    const orientation = ['LEFT_OF','ORDER_LEFT_TO_RIGHT'].includes(step.check) ? ' Left and right mean the edges of the camera picture.' : '';
    return `Step ${this.stepIndex + 1}: ${step.label}. You have ${this.budgetSeconds} seconds.${orientation}`;
  }
  activeElapsed(now = this.now()) { return this.elapsedMs + (this.clockStarted === null ? 0 : Math.max(0, now - this.clockStarted)); }
  pauseClock(now = this.now()) { this.elapsedMs = this.activeElapsed(now); this.clockStarted = null; }
  resumeClock(now = this.now()) { if (this.phase !== 'SCAN' && !this.escaped && this.clockStarted === null) this.clockStarted = now; }
  timeLeft(now = this.now()) { return this.phase === 'SCAN' || this.escaped ? null : Math.max(0, Math.ceil((this.budgetSeconds * 1000 - this.penaltyMs - this.activeElapsed(now)) / 1000)); }
  hudState() {
    return { phase: this.phase, objective: this.escaped ? 'ROUTINE COMPLETE' : this.phase === 'SCAN' ? `SHOW: ${this.missing.join(', ')}` : this.routine.steps[this.stepIndex].label,
      missionProgress: this.results.length / this.routine.steps.length, mode: 'routine', routineId: this.routine.id,
      routineName: this.routine.name, theme: this.routine.theme, stepIndex: this.stepIndex,
      timeLeftSeconds: this.timeLeft(), budgetSeconds: this.budgetSeconds ?? null,
      routineSteps: this.routine.steps.map((step, i) => ({ label: step.label,
        status: this.results[i]?.status || (i === this.stepIndex && !this.escaped ? 'active' : 'pending') })) };
  }
  report() { return { routineId: this.routine.id, routineName: this.routine.name, complete: this.escaped,
    steps: structuredClone(this.results) }; }
  request() {
    const step = this.routine.steps[this.stepIndex];
    return { revision: this.revision, operation: this.phase === 'SCAN' ? 'inventory' : 'verify', catalog: this.catalog,
      ...(step && !this.escaped ? { predicate: `${step.check}(${step.objects.join(', ')})` } : {}) };
  }
  feedback(hint) { this.resetEvidence(); this.emit('message', clean(hint) || 'I cannot check that yet. Keep the objects visible and hold still.'); }
  enterStep(prefix = '') {
    if (this.stepIndex >= this.routine.steps.length) {
      this.escaped = true; this.phase = 'PORTAL'; this.clockStarted = null;
    } else {
      this.phase = 'POWER'; const t = this.routine.timer;
      // minSeconds is the hard floor after both index decrease and carried misses.
      this.budgetSeconds = Math.max(t.minSeconds, t.startSeconds - this.stepIndex * t.stepDecreaseSeconds - this.misses * t.missPenaltySeconds);
      this.clockStarted = null; this.elapsedMs = 0; this.penaltyMs = 0;
    }
    this.revision++; this.resetEvidence(); this.emit('state', this.hudState()); this.emit('message', `${prefix}${this.instruction()}`);
  }
  finishStep(status, result = {}, evidenceFrame = null) {
    this.pauseClock();
    const record = { label: this.routine.steps[this.stepIndex].label, status,
      seconds: Math.round(this.elapsedMs / 100) / 10,
      evidence: status === 'done' ? clean(result.evidence) || 'Verified by two independent passing rounds.' : 'Step timer expired.',
      evidenceFrame: status === 'done' && evidenceFrame ? structuredClone(evidenceFrame) : null };
    this.results.push(record); if (status === 'missed') this.misses++;
    this.emit('step_result', structuredClone(record)); this.stepIndex++; this.enterStep(status === 'done' ? 'Step verified. ' : 'Time is up. Let us move on. ');
  }
  tick(now = this.now()) {
    if (this.phase === 'SCAN' || this.escaped || this.clockStarted === null) return false;
    if (this.budgetSeconds * 1000 - this.penaltyMs - this.activeElapsed(now) <= 0) { this.finishStep('missed'); return true; }
    const seconds = this.timeLeft(now);
    if (seconds !== this.lastSeconds) { this.lastSeconds = seconds; this.emit('state', this.hudState()); }
    return false;
  }
  apply(request, result, evidenceFrame = null) {
    this.tick();
    if (this.escaped || request.revision !== this.revision || request.operation !== this.request().operation || request.predicate !== this.request().predicate) return false;
    const count = request.operation === 'inventory' ? 2 : 3;
    if (!Array.isArray(request.frameIds) || request.frameIds.length !== count || new Set(request.frameIds).size !== count ||
        request.frameIds.some(id => typeof id !== 'string' || this.usedFrames.has(id))) { this.feedback('I need fresh camera observations.'); return false; }
    request.frameIds.forEach(id => this.usedFrames.add(id));
    if (result.status !== 'checked') { this.feedback(result.correction_hint); return false; }
    if (this.phase === 'SCAN') {
      if (!Array.isArray(result.objects) || !result.objects.every(validObject) || new Set(result.objects.map(o => o.name)).size !== result.objects.length) { this.feedback('Show the routine objects clearly.'); return false; }
      this.missing = this.routine.objects.filter(name => !result.objects.some(o => o.name === name));
      if (this.missing.length) { this.emit('state', this.hudState()); this.feedback(`Please show ${this.missing.join(', ')} before we start.`); return false; }
      const selected = this.routine.objects.map(name => result.objects.find(o => o.name === name));
      const signature = selected.map(o => o.name).join('|');
      this.streak = this.inventoryCandidate === signature ? this.streak + 1 : 1; this.inventoryCandidate = signature;
      if (this.streak < 2) return false;
      this.catalog = structuredClone(selected); this.stepIndex = 0; this.enterStep('Routine objects verified. '); return true;
    }
    const round = verdictRound(result, request.predicate);
    if (!round?.pass) {
      this.resetEvidence();
      if (round?.conclusiveFailure) {
        this.penaltyMs += this.routine.timer.fakeDonePenaltySeconds * 1000;
        if (this.timeLeft() === 0) { this.finishStep('missed'); return false; }
        this.emit('state', this.hudState());
      }
      this.feedback(result.correction_hint); return false;
    }
    if (++this.streak < 2) return false;
    this.finishStep('done', result, evidenceFrame); return true;
  }
}
