import { EventEmitter } from 'node:events';
import { isRecord, verdictRound } from './routine-evidence.mjs';
import { validateRoutine, assertRoutineCapabilities, scansFirst } from './routine-contract.mjs';

const clean = text => typeof text === 'string' ? text.replace(/[\x00-\x1f]/g, ' ').slice(0, 500) : '';
const validObject = o => o && typeof o.name === 'string' && /^[a-z0-9][a-z0-9 -]{0,47}$/.test(o.name) &&
  typeof o.description === 'string' && o.description.length > 0 && o.description.length <= 300 &&
  Array.isArray(o.box_2d) && o.box_2d.length === 4 && o.box_2d.every(Number.isInteger) &&
  0 <= o.box_2d[0] && o.box_2d[0] < o.box_2d[2] && o.box_2d[2] <= 1000 &&
  0 <= o.box_2d[1] && o.box_2d[1] < o.box_2d[3] && o.box_2d[3] <= 1000;

/** Deterministic routine mode. Existing fixed spaceship engine is unchanged. */
export class RoutineMissionEngine extends EventEmitter {
  constructor(routine, { now = Date.now } = {}) {
    super(); this.routine = assertRoutineCapabilities(validateRoutine(routine)); this.now = now;
    this.phase = 'SCAN'; this.revision = 0; this.escaped = false; this.catalog = []; this.stepIndex = -1;
    this.results = []; this.misses = 0; this.usedFrames = new Set(); this.missing = [...this.routine.objects];
    this.clockStarted = null; this.elapsedMs = 0; this.penaltyMs = 0; this.resetEvidence();
    // Lives: each timed-out step costs one; at zero the monster wins and the mission is unsuccessful.
    this.maxLives = this.routine.lives; this.lives = this.maxLives; this.outcome = null;
    // More than 3 objects: no opening scan; start at step 1 and send each step's own objects.
    this.scanFirst = scansFirst(this.routine);
    if (!this.scanFirst) { this.stepIndex = 0; this.setupStep(); }
  }
  resetEvidence() { this.streak = 0; this.inventoryCandidate = ''; }
  instruction() {
    if (this.escaped && this.outcome === 'failed') return `Oh no, the monster caught up! Mission unsuccessful. You finished ${this.results.filter(r => r.status === 'done').length} of ${this.routine.steps.length} steps. That is okay, we can try again next time.`;
    if (this.escaped) return `Routine finished. You completed ${this.results.filter(r => r.status === 'done').length} of ${this.routine.steps.length} steps. Thank you for trying with ORBIT.`;
    const intro = 'I am ORBIT, your routine guide. A parent should be with you. I will use the camera to check visible steps and keep a photo of each verified step for your parent.';
    if (this.phase === 'SCAN') return `${intro} Show me ${this.missing.join(', ') || this.routine.objects.join(', ')} and hold the camera still.`;
    const step = this.routine.steps[this.stepIndex];
    const orientation = ['LEFT_OF','ORDER_LEFT_TO_RIGHT'].includes(step.check) ? ' Left and right mean the edges of the camera picture.' : '';
    const opening = !this.scanFirst && this.revision === 0 ? `${intro} ${this.routine.name} has ${this.routine.steps.length} steps. ` : '';
    return `${opening}Step ${this.stepIndex + 1}: ${step.label}. You have ${this.timeLeft() ?? this.budgetSeconds} seconds.${orientation}`;
  }
  activeElapsed(now = this.now()) { return this.elapsedMs + (this.clockStarted === null ? 0 : Math.max(0, now - this.clockStarted)); }
  pauseClock(now = this.now()) { this.elapsedMs = this.activeElapsed(now); this.clockStarted = null; }
  resumeClock(now = this.now()) { if (this.phase !== 'SCAN' && !this.escaped && this.clockStarted === null) this.clockStarted = now; }
  msLeft(now = this.now()) { return this.budgetSeconds * 1000 - this.penaltyMs - this.activeElapsed(now); }
  timeLeft(now = this.now()) { return this.phase === 'SCAN' || this.escaped ? null : Math.max(0, Math.ceil(this.msLeft(now) / 1000)); }
  /** Monster shows for the last `monsterSeconds` of a step; closeness 0 (just appeared) -> 1 (caught you). */
  monster(now = this.now()) {
    const window = this.routine.monsterSeconds * 1000;
    if (this.phase === 'SCAN' || this.escaped || !window) return { visible: this.outcome === 'failed', closeness: this.outcome === 'failed' ? 1 : 0 };
    const left = Math.max(0, this.msLeft(now));
    return left > window ? { visible: false, closeness: 0 } : { visible: true, closeness: Math.round((1 - left / window) * 100) / 100 };
  }
  hudState() {
    return { phase: this.phase, objective: this.outcome === 'failed' ? 'MISSION UNSUCCESSFUL' : this.escaped ? 'ROUTINE COMPLETE' : this.phase === 'SCAN' ? `SHOW: ${this.missing.join(', ')}` : this.routine.steps[this.stepIndex].label,
      missionProgress: this.results.length / this.routine.steps.length, mode: 'routine', routineId: this.routine.id,
      routineName: this.routine.name, theme: this.routine.theme, stepIndex: this.stepIndex,
      timeLeftSeconds: this.timeLeft(), budgetSeconds: this.budgetSeconds ?? null,
      lives: this.lives, maxLives: this.maxLives, monster: this.monster(), outcome: this.outcome,
      routineSteps: this.routine.steps.map((step, i) => ({ label: step.label, short: step.short ?? `${i + 1}`,
        status: this.results[i]?.status || (i === this.stepIndex && !this.escaped ? 'active' : 'pending') })) };
  }
  report() { return { routineId: this.routine.id, routineName: this.routine.name, complete: this.escaped && this.outcome !== 'failed',
    outcome: this.outcome, livesLeft: this.lives,
    steps: structuredClone(this.results) }; }
  request() {
    const step = this.routine.steps[this.stepIndex];
    // Without an opening scan, each check carries only its step's objects (SHOW needs none).
    const catalog = this.scanFirst || !step ? this.catalog
      : ['SHOW','DOING'].includes(step.check) ? [] : step.objects.map(name => ({ name, description: name }));
    return { revision: this.revision, operation: this.phase === 'SCAN' ? 'inventory' : 'verify', catalog,
      ...(step && !this.escaped ? { predicate: `${step.check}(${step.objects.join(', ')})` } : {}) };
  }
  feedback(hint) { this.resetEvidence(); this.emit('message', clean(hint) || 'I cannot check that yet. Keep the objects visible and hold still.'); }
  enterStep(prefix = '') {
    if (this.lives <= 0) {
      this.escaped = true; this.outcome = 'failed'; this.phase = 'PORTAL'; this.clockStarted = null;
    } else if (this.stepIndex >= this.routine.steps.length) {
      this.escaped = true; this.outcome = 'complete'; this.phase = 'PORTAL'; this.clockStarted = null;
    } else this.setupStep();
    this.revision++; this.resetEvidence(); this.emit('state', this.hudState()); this.emit('message', `${prefix}${this.instruction()}`);
  }
  setupStep() {
    this.phase = 'POWER'; const t = this.routine.timer; const step = this.routine.steps[this.stepIndex];
    // A parent-set step time replaces the decreasing schedule; minSeconds stays the hard floor after carried misses.
    const base = step.seconds ?? t.startSeconds - this.stepIndex * t.stepDecreaseSeconds;
    this.budgetSeconds = Math.max(t.minSeconds, base - this.misses * t.missPenaltySeconds);
    this.clockStarted = null; this.elapsedMs = 0; this.penaltyMs = 0; this.monsterWarned = false;
  }
  finishStep(status, result = {}, evidenceFrame = null) {
    this.pauseClock();
    const record = { label: this.routine.steps[this.stepIndex].label, status,
      seconds: Math.round(this.elapsedMs / 100) / 10,
      evidence: status === 'done' ? clean(result.evidence) || 'Verified by two independent passing rounds.' : 'Step timer expired.',
      evidenceFrame: status === 'done' && evidenceFrame ? structuredClone(evidenceFrame) : null };
    this.results.push(record); if (status === 'missed') { this.misses++; this.lives = Math.max(0, this.lives - 1); }
    const lifeLine = this.lives === 1 ? 'You have 1 life left. ' : `You have ${this.lives} lives left. `;
    this.emit('step_result', structuredClone(record)); this.stepIndex++;
    this.enterStep(status === 'done' ? 'Step verified. ' : this.lives > 0 ? `Time is up, the monster got that one! ${lifeLine}Let us move on. ` : '');
  }
  tick(now = this.now()) {
    if (this.phase === 'SCAN' || this.escaped || this.clockStarted === null) return false;
    if (this.budgetSeconds * 1000 - this.penaltyMs - this.activeElapsed(now) <= 0) { this.finishStep('missed'); return true; }
    const seconds = this.timeLeft(now);
    if (seconds !== this.lastSeconds) { this.lastSeconds = seconds; this.emit('state', this.hudState()); }
    if (!this.monsterWarned && this.routine.monsterSeconds && seconds <= this.routine.monsterSeconds && seconds < this.budgetSeconds) {
      this.monsterWarned = true; this.emit('message', `Uh oh, a monster is coming! Hurry: ${this.routine.steps[this.stepIndex].label}.`);
    }
    return false;
  }
  apply(request, result, evidenceFrame = null) {
    this.tick();
    if (!isRecord(request) || !isRecord(result)) { this.resetEvidence(); return false; }
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
