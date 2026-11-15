import { diagnostic } from './diagnostics.mjs';
import { EventEmitter } from 'node:events';

export class SpeechInterrupted extends Error {}

/** A single per-call lane for every ORBIT utterance. */
export class SpeechCoordinator extends EventEmitter {
  constructor({ speak, interrupt = async () => {}, now = Date.now }) {
    super(); this.speak = speak; this.stopOutput = interrupt; this.now = now;
    this.queue = []; this.pending = new Map(); this.completed = new Map();
  }
  get busy() { return !!this.active || this.queue.length > 0; }
  say(text, { key = text, force = false } = {}) {
    if (this.closed) return Promise.reject(new Error('Speech coordinator closed'));
    if (this.pending.has(key)) return this.pending.get(key);
    if (!force && this.now() - (this.completed.get(key) ?? -Infinity) < 10000) return Promise.resolve();
    const promise = new Promise((resolve, reject) => this.queue.push({ text, key, resolve, reject, cancelled: false }));
    this.pending.set(key, promise);
    void this.pump();
    return promise;
  }
  async pump() {
    if (this.active || this.closed) return;
    const job = this.queue.shift(); if (!job) return;
    this.active = job;
    try {
      diagnostic('speech_playout', { state: 'started' });
      await this.speak(job.text);
      if (job.cancelled || this.closed) throw new SpeechInterrupted('Speech interrupted');
      this.completed.set(job.key, this.now());
      if (this.completed.size > 64) this.completed.delete(this.completed.keys().next().value);
      diagnostic('speech_playout', { state: 'complete' });
      job.resolve();
    } catch (error) {
      diagnostic('speech_playout', { state: 'failed' });
      job.reject(error);
      // Do not speak queued confirmations/instructions after an earlier utterance failed.
      for (const waiting of this.queue.splice(0)) { this.pending.delete(waiting.key); waiting.reject(error); }
      this.emit('fault', { interrupted: error instanceof SpeechInterrupted });
    } finally {
      this.pending.delete(job.key); this.active = null; void this.pump();
    }
  }
  async interrupt() {
    if (this.active) this.active.cancelled = true;
    const error = new SpeechInterrupted('Speech interrupted');
    for (const job of this.queue.splice(0)) { this.pending.delete(job.key); job.reject(error); }
    await this.stopOutput();
  }
  async close() { this.closed = true; await this.interrupt(); }
}

/** Uses only SpeechHandle APIs verified in installed LiveKit Agents 1.8.0. */
export function sessionSpeechOutput(session) {
  let handle;
  return {
    async speak(text) {
      handle = session.say(text, { allowInterruptions: true });
      const current = handle;
      try {
        await current.waitForPlayout();
        if (current.interrupted) throw new SpeechInterrupted('Speech interrupted');
        if (current.done() && current.exception()) throw new Error('Speech synthesis or playout failed');
      } finally { if (handle === current) handle = null; }
    },
    async interrupt() {
      if (!handle) return;
      const current = handle;
      current.interrupt(true);
      try { await current.waitForPlayout(); } catch { /* caller deliberately stopped output */ }
    },
  };
}
