import { isRecord, verdictRound } from './routine-evidence.mjs';
import { diagnostic } from './diagnostics.mjs';
import { MissionEngine, RoutineMissionEngine } from './mission-engine.mjs';
import { VisionClient } from './vision-client.mjs';
import { encodeJpeg } from './frame-sampler.mjs';

const MAX_REPORT_SAVE_ATTEMPTS = 3;

/** Per-call orchestration. Renderer and mission engine never own media connections. */
export class GameRuntime {
  constructor({ callerVideo, hud, say, vision = new VisionClient(), now = Date.now, encode = encodeJpeg, intervalMs = 2500, routine = null, onReport = async () => {} }) {
    this.callerVideo = callerVideo; this.hud = hud; this.say = say; this.vision = vision;
    this.now = now; this.encode = encode; this.intervalMs = intervalMs;
    this.routine = routine; this.onReport = onReport;
    this.engine = routine ? new RoutineMissionEngine(routine, { now }) : new MissionEngine(); this.frames = []; this.epoch = 0; this.closed = false;
    this.narratedPhases = new Set();
    // Routine pause reasons compose: narration/help cannot clear camera or manual pauses.
    this.pauseReasons = new Set(routine ? ['not_started', 'camera'] : []);
    this.cameraState = 'unknown';
    this.reportAttempts = 0; this.reportErrors = []; this.reportSaved = false;
    this.lastAttempt = -Infinity; this.notBefore = Infinity; this.lastHint = ''; this.lastHintAt = -Infinity;
    this.onFrame = frame => {
      if (this.closed) return;
      if (this.routine && this.cameraState !== 'unavailable' && this.isFreshCameraFrame(frame)) {
        this.cameraState = 'available'; this.setPauseReason('camera', false);
      }
      if (!this.started || (this.routine && this.pauseReasons.size) || this.closed || frame.capturedAtMs < this.notBefore) return;
      if (this.frames.length && this.frames.at(-1).generation !== frame.generation) this.invalidate();
      if (!this.frames.some(f => f.generation === frame.generation && f.sequence === frame.sequence)) this.frames.push(frame);
      this.frames = this.frames.slice(-16);
    };
    this.onStatus = status => {
      if (!this.routine) {
        if (status.state !== 'subscribed') this.invalidate();
        return;
      }
      this.cameraState = status.state === 'subscribed' ? 'awaiting_frame' : 'unavailable';
      this.setPauseReason('camera', true); this.invalidate();
      // A subscribed track alone is not proof that usable camera frames arrived.
      const latest = status.state === 'subscribed' ? this.callerVideo.getLatestFrame?.() : null;
      if (latest && this.isFreshCameraFrame(latest)) {
        this.cameraState = 'available'; this.setPauseReason('camera', false);
      }
    };
    callerVideo.on('frame', this.onFrame); callerVideo.on('status', this.onStatus);
    const latest = routine ? callerVideo.getLatestFrame?.() : null;
    if (latest && this.isFreshCameraFrame(latest)) {
      this.cameraState = 'available'; this.setPauseReason('camera', false);
    }
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
  isFreshCameraFrame(frame) {
    const now = this.now();
    return frame && Number.isFinite(frame.capturedAtMs) && frame.capturedAtMs <= now &&
      now - frame.capturedAtMs < 1500 && this.callerVideo.isCurrent(frame);
  }
  setPauseReason(reason, paused) {
    if (!this.routine) return;
    if (paused) this.pauseReasons.add(reason); else this.pauseReasons.delete(reason);
    this.syncRoutineClock();
  }
  syncRoutineClock() {
    if (!this.routine) return;
    if (!this.started || this.closed || this.engine.escaped || this.pauseReasons.size || this.now() < this.notBefore) this.engine.pauseClock(this.now());
    else this.engine.resumeClock(this.now());
  }
  resume() {
    if (this.closed) return Promise.resolve();
    // Keep narration blocking while releasing only the caller's explicit pause.
    this.setPauseReason('narration', true); this.setPauseReason('manual', false);
    return this.announce(this.engine.instruction(), { force: true });
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
  pause() { this.setPauseReason('manual', true); this.setPauseReason('narration', false); this.engine.pauseClock?.(this.now()); this.speechVersion = (this.speechVersion || 0) + 1; this.voiceFailed = true; this.notBefore = Infinity; this.invalidate(); }
  announce(text, { force = false } = {}) {
    if (this.closed) return Promise.resolve();
    if (!force && !this.voiceFailed && text === this.lastHint && this.now() - this.lastHintAt < 10000) return this.speech || Promise.resolve();
    this.lastHint = text; this.lastHintAt = this.now();
    this.setPauseReason('narration', true); this.engine.pauseClock?.(this.now()); this.invalidate(); this.notBefore = Infinity;
    const version = this.speechVersion = (this.speechVersion || 0) + 1;
    this.voiceFailed = false;
    const phase = this.engine.phase;
    const missionLine = text.endsWith(this.engine.instruction());
    const intro = missionLine && !this.narratedPhases.has(phase) ? this.theme?.missionIntros[phase] : '';
    const narration = this.theme ? text.replace('I am ORBIT, your AI ship guide. ', '') : text;
    const spoken = `${this.vision.allowMock ? 'Mock vision mode. ' : ''}${intro ? intro + ' ' : ''}${narration}`;
    this.speech = Promise.resolve().then(() => this.say(spoken, { force })).then(() => {
      if (!this.closed && this.speechVersion === version) {
        this.notBefore = this.now();
        this.setPauseReason('voice_failure', false); this.setPauseReason('narration', false);
        if (missionLine) this.narratedPhases.add(phase);
      }
    }).catch(() => {
      if (this.speechVersion === version) {
        this.voiceFailed = true; this.setPauseReason('voice_failure', true); this.setPauseReason('narration', false);
      }
    });
    return this.speech;
  }
  start({ auto = true } = {}) {
    if (this.started || this.closed) return;
    this.started = true; this.setPauseReason('not_started', false);
    this.updateHud(this.engine.hudState());
    this.announce(this.engine.instruction());
    if (auto) this.timer = setInterval(() => { void this.tick(); }, 500);
  }
  tick() {
    this.syncRoutineClock();
    if (this.started && !this.closed) this.engine.tick?.(this.now());
    if (!this.started || this.closed || this.pending || (this.routine && this.pauseReasons.size) || this.voiceFailed || this.engine.escaped || this.now() < this.notBefore ||
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
    diagnostic('verification_finished', { state: 'complete', provider: this.vision.allowMock ? 'mock' : 'groq', latencyMs: Math.round(performance.now() - startedAt), errors: Array.isArray(result?.frame_verdicts) ? result.frame_verdicts.filter(v => isRecord(v) && v.error).length : 0 });
    if (this.closed || this.epoch !== epoch || this.engine.revision !== request.revision ||
      !batch.every(f => this.callerVideo.isCurrent(f) && this.now() - f.capturedAtMs < 6000)) {
      // A stale result breaks consecutive evidence, including frames queued while
      // waiting. Never reset evidence belonging to a newer epoch or mission.
      if (!this.closed && this.epoch === epoch && this.engine.revision === request.revision) this.invalidate();
      diagnostic('verification_discarded', { state: 'discarded' }); return false;
    }
    if (!isRecord(result) || (request.operation === 'verify' && !verdictRound(result, request.predicate))) {
      this.engine.feedback('I could not check that response. Keep the objects visible and try again.');
      return false;
    }
    const evidenceIndex = (Array.isArray(result.frame_verdicts) ? result.frame_verdicts : []).find(v => isRecord(v) && v.satisfied && v.confidence >= .7 && !v.error && !v.geometry_override)?.frame_index ?? -1;
    const evidenceFrame = this.routine && evidenceIndex >= 0 && frames[evidenceIndex] ? {
      id: frames[evidenceIndex].id, capturedAtMs: frames[evidenceIndex].capturedAtMs,
      dataUrl: `data:image/jpeg;base64,${frames[evidenceIndex].jpeg}`,
    } : null;
    const accepted = this.engine.apply({ ...request, frameIds: frames.map(f => f.id) }, result, evidenceFrame);
    diagnostic('verification_applied', { accepted, phase: this.engine.phase });
    return accepted;
  }
  flushReport() {
    if (!this.routine || !this.started || (!this.closed && !this.engine.escaped)) return Promise.resolve(false);
    if (this.reportSaved) return Promise.resolve(true);
    if (this.reportTask) return this.reportTask;
    if (this.reportAttempts >= MAX_REPORT_SAVE_ATTEMPTS) return Promise.resolve(false);
    // Freeze one final/partial report so retries are idempotent at the atomic writer.
    this.reportSnapshot ??= { ...this.engine.report(), verification: this.vision.allowMock ? 'mock' : 'groq' };
    this.reportAttempts++;
    this.reportTask = Promise.resolve().then(() => this.onReport(structuredClone(this.reportSnapshot))).then(() => {
      this.reportSaved = true; this.reportFailed = false; this.reportError = null; return true;
    }, error => {
      this.reportFailed = true; this.reportError = error; this.reportErrors.push(error);
      console.error('[routine-report] local save failed'); return false;
    }).finally(() => { this.reportTask = null; });
    return this.reportTask;
  }
  close() {
    if (this.closeTask) return this.closeTask;
    this.closed = true; this.setPauseReason('closed', true); this.engine.pauseClock?.(this.now());
    clearInterval(this.timer); this.invalidate();
    this.callerVideo.off('frame', this.onFrame); this.callerVideo.off('status', this.onStatus);
    this.closeTask = (async () => {
      try { await this.pending; }
      finally {
        if (this.routine && this.started) {
          do { await this.flushReport(); }
          while (!this.reportSaved && this.reportAttempts < MAX_REPORT_SAVE_ATTEMPTS);
        }
      }
    })();
    return this.closeTask;
  }
}
