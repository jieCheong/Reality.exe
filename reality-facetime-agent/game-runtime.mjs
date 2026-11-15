import { diagnostic } from './diagnostics.mjs';
import { MissionEngine, RoutineMissionEngine } from './mission-engine.mjs';
import { VisionClient } from './vision-client.mjs';
import { encodeJpeg } from './frame-sampler.mjs';

/** Per-call orchestration. Renderer and mission engine never own media connections. */
export class GameRuntime {
  constructor({ callerVideo, hud, say, vision = new VisionClient(), now = Date.now, encode = encodeJpeg, intervalMs = 2500, routine = null, onReport = async () => {} }) {
    this.callerVideo = callerVideo; this.hud = hud; this.say = say; this.vision = vision;
    this.now = now; this.encode = encode; this.intervalMs = intervalMs;
    this.routine = routine; this.onReport = onReport;
    this.engine = routine ? new RoutineMissionEngine(routine, { now }) : new MissionEngine(); this.frames = []; this.epoch = 0; this.closed = false;
    this.narratedPhases = new Set();
    this.lastAttempt = -Infinity; this.notBefore = Infinity; this.lastHint = ''; this.lastHintAt = -Infinity;
    this.onFrame = frame => {
      if (!this.started || this.closed || frame.capturedAtMs < this.notBefore) return;
      if (this.frames.length && this.frames.at(-1).generation !== frame.generation) this.invalidate();
      if (!this.frames.some(f => f.generation === frame.generation && f.sequence === frame.sequence)) this.frames.push(frame);
      this.frames = this.frames.slice(-16);
    };
    this.onStatus = status => {
      if (status.state !== 'subscribed') { this.engine.pauseClock?.(this.now()); this.invalidate(); }
      else if (this.started && !this.voiceFailed && this.now() >= this.notBefore) this.engine.resumeClock?.(this.now());
    };
    callerVideo.on('frame', this.onFrame); callerVideo.on('status', this.onStatus);
    this.engine.on('state', state => {
      if (this.lastLoggedRevision !== this.engine.revision) {
        this.lastLoggedRevision = this.engine.revision;
        diagnostic('mission_transition', { phase: state.phase, revision: this.engine.revision, escaped: this.engine.escaped });
      }
      this.updateHud(state);
      if (this.routine && this.engine.escaped) void this.flushReport();
    });
    this.engine.on('message', text => this.announce(text));
  }
  updateHud(state) {
    diagnostic('hud_update', { phase: state.phase, progress: state.missionProgress });
    this.hud.setState({ gameState: { ...state, objective: `${this.vision.allowMock ? '[MOCK VISION] ' : ''}${state.objective}` } });
  }
  invalidate() { this.frames = []; this.epoch++; this.engine.resetEvidence(); this.abort?.abort(); }
  setTheme(theme) {
    if (this.started) throw new Error('Cannot change theme after game start');
    this.theme = { id: theme.id, name: theme.name, missionIntros: { ...theme.missionIntros } };
  }
  pause() { this.engine.pauseClock?.(this.now()); this.speechVersion = (this.speechVersion || 0) + 1; this.voiceFailed = true; this.notBefore = Infinity; this.invalidate(); }
  announce(text, { force = false } = {}) {
    if (this.closed) return Promise.resolve();
    if (!force && !this.voiceFailed && text === this.lastHint && this.now() - this.lastHintAt < 10000) return this.speech || Promise.resolve();
    this.lastHint = text; this.lastHintAt = this.now();
    this.engine.pauseClock?.(this.now()); this.invalidate(); this.notBefore = Infinity;
    const version = this.speechVersion = (this.speechVersion || 0) + 1;
    this.voiceFailed = false;
    const phase = this.engine.phase;
    const missionLine = text.endsWith(this.engine.instruction());
    const intro = missionLine && !this.narratedPhases.has(phase) ? this.theme?.missionIntros[phase] : '';
    const narration = this.theme ? text.replace('I am ORBIT, your AI ship guide. ', '') : text;
    const spoken = `${this.vision.allowMock ? 'Mock vision mode. ' : ''}${intro ? intro + ' ' : ''}${narration}`;
    this.speech = Promise.resolve().then(() => this.say(spoken, { force })).then(() => {
      if (!this.closed && this.speechVersion === version) {
        this.notBefore = this.now(); this.engine.resumeClock?.(this.now()); if (missionLine) this.narratedPhases.add(phase);
      }
    }).catch(() => { if (this.speechVersion === version) this.voiceFailed = true; });
    return this.speech;
  }
  start({ auto = true } = {}) {
    if (this.started || this.closed) return;
    this.started = true;
    this.updateHud(this.engine.hudState());
    this.announce(this.engine.instruction());
    if (auto) this.timer = setInterval(() => { void this.tick(); }, 500);
  }
  tick() {
    if (this.started && !this.closed) this.engine.tick?.(this.now());
    if (!this.started || this.closed || this.pending || this.voiceFailed || this.engine.escaped || this.now() < this.notBefore ||
      this.now() - this.lastAttempt < this.intervalMs) return Promise.resolve(false);
    const requestEpoch = this.epoch;
    this.pending = this.check().catch(() => { if (!this.closed && requestEpoch === this.epoch) this.engine.feedback('My visual link is unavailable. Keep the camera on; I will retry.'); return false; })
      .finally(() => { this.pending = null; });
    return this.pending;
  }
  async check() {
    const request = this.engine.request(), count = request.operation === 'inventory' ? 2 : 3;
    const available = this.frames.filter(f => f.capturedAtMs >= this.notBefore && this.now() - f.capturedAtMs < 5000 && this.callerVideo.isCurrent(f));
    const selected = [];
    for (const frame of available) if (!selected.length || frame.capturedAtMs - selected.at(-1).capturedAtMs >= 200) selected.push(frame);
    if (selected.length < count) return false;
    const batch = selected.slice(-count), epoch = this.epoch;
    this.frames = []; // a second consensus round can only use newly received frames
    this.lastAttempt = this.now(); this.abort = new AbortController();
    const frames = [];
    for (const f of batch) frames.push({ id: `${f.generation}:${f.sequence}`, capturedAtMs: f.capturedAtMs, jpeg: (await this.encode(f)).toString('base64') });
    if (this.closed || this.epoch !== epoch || !batch.every(f => this.callerVideo.isCurrent(f))) return false;
    const startedAt = performance.now();
    diagnostic('verification_started', { operation: request.operation, frames: frames.length, revision: request.revision });
    let result;
    try { result = await this.vision.analyze({ ...request, requestId: this.vision.newRequestId(), frames }, this.abort.signal); }
    catch { diagnostic('verification_finished', { state: 'failed', latencyMs: Math.round(performance.now() - startedAt) }); throw new Error('Vision request failed'); }
    diagnostic('verification_finished', { state: 'complete', provider: this.vision.allowMock ? 'mock' : 'groq', latencyMs: Math.round(performance.now() - startedAt), errors: result.frame_verdicts?.filter(v => v.error).length || 0 });
    if (this.closed || this.epoch !== epoch || this.engine.revision !== request.revision ||
      !batch.every(f => this.callerVideo.isCurrent(f) && this.now() - f.capturedAtMs < 6000)) {
      // A stale result breaks consecutive evidence, including frames queued while
      // waiting. Never reset evidence belonging to a newer epoch or mission.
      if (!this.closed && this.epoch === epoch && this.engine.revision === request.revision) this.invalidate();
      diagnostic('verification_discarded', { state: 'discarded' }); return false;
    }
    const evidenceIndex = result.frame_verdicts?.find(v => v.satisfied && v.confidence >= .7 && !v.error && !v.geometry_override)?.frame_index ?? -1;
    const evidenceFrame = this.routine && evidenceIndex >= 0 && frames[evidenceIndex] ? {
      id: frames[evidenceIndex].id, capturedAtMs: frames[evidenceIndex].capturedAtMs,
      dataUrl: `data:image/jpeg;base64,${frames[evidenceIndex].jpeg}`,
    } : null;
    const accepted = this.engine.apply({ ...request, frameIds: frames.map(f => f.id) }, result, evidenceFrame);
    diagnostic('verification_applied', { accepted, phase: this.engine.phase });
    return accepted;
  }
  flushReport() {
    if (!this.routine) return Promise.resolve();
    this.reportTask ??= Promise.resolve().then(() => this.onReport({ ...this.engine.report(),
      verification: this.vision.allowMock ? 'mock' : 'groq' })).catch(() => {
        this.reportFailed = true; console.error('[routine-report] local save failed');
      });
    return this.reportTask;
  }
  async close() {
    this.engine.pauseClock?.(this.now());
    this.closed = true; clearInterval(this.timer); this.invalidate();
    this.callerVideo.off('frame', this.onFrame); this.callerVideo.off('status', this.onStatus);
    await this.pending;
    if (this.routine && this.started) await this.flushReport();
  }
}
