import { EventEmitter } from 'node:events';
import { RoomEvent, TrackKind, VideoBufferType, VideoStream } from '@livekit/rtc-node';

/** Receives only the Chert bridge camera; never the agent's own avatar. */
export class CallerVideoAdapter extends EventEmitter {
  constructor(room, { streamFactory = track => new VideoStream(track), sampleIntervalMs = 200, now = Date.now } = {}) {
    super();
    this.room = room;
    this.streamFactory = streamFactory;
    this.sampleIntervalMs = sampleIntervalMs;
    this.now = now;
    this.latest = null;
    this.active = null;
    this.selected = null;
    this.identity = null;
    this.closed = false;
    this.sequence = 0;
    this.generation = 0;
    this.pending = new Set();
    this.publications = new Set();
    this.bindings = [];
  }

  matches(pub, participant) {
    return participant?.identity?.startsWith('chert-bridge-') &&
      (!this.identity || participant.identity === this.identity) &&
      pub?.name === 'facetime-remote-video' && pub.kind === TrackKind.KIND_VIDEO;
  }

  /** Register BEFORE ctx.connect(); also scan existing publications after join. */
  start() {
    if (this.started || this.closed) return;
    this.started = true;
    const on = (event, fn) => { this.room.on(event, fn); this.bindings.push([event, fn]); };
    on(RoomEvent.TrackPublished, (pub, p) => this.subscribe(pub, p));
    on(RoomEvent.ParticipantConnected, p => {
      for (const pub of p.trackPublications.values()) this.subscribe(pub, p);
    });
    on(RoomEvent.TrackSubscribed, (track, pub, p) => this.attach(track, pub, p));
    on(RoomEvent.TrackMuted, (pub, p) => this.invalidate(pub, p, 'muted'));
    on(RoomEvent.TrackUnmuted, (pub, p) => this.subscribe(pub, p));
    on(RoomEvent.TrackUnpublished, (pub, p) => this.invalidate(pub, p, 'unpublished'));
    on(RoomEvent.TrackUnsubscribed, (track, pub, p) => {
      if (this.active?.track === track) this.invalidate(pub, p, 'unsubscribed');
    });
    on(RoomEvent.ParticipantDisconnected, p => {
      if (p.identity === this.identity) { this.stopReader('participant_disconnected'); this.identity = null; this.selected = null; }
    });
    on(RoomEvent.Reconnecting, () => this.stopReader('reconnecting'));
    on(RoomEvent.Reconnected, () => this.scan());
    on(RoomEvent.Disconnected, () => { void this.close(); });
    this.scan();
  }

  scan() {
    if (this.closed) return;
    for (const p of this.room.remoteParticipants.values()) {
      for (const pub of p.trackPublications.values()) this.subscribe(pub, p);
    }
  }

  subscribe(pub, participant) {
    if (this.closed || !this.matches(pub, participant)) return;
    this.identity ??= participant.identity;
    this.publications.add(pub);
    if (this.selected !== pub) {
      this.selected = pub;
      this.stopReader('replaced');
    }
    pub.setSubscribed(true);
    if (!pub.muted && pub.track) this.attach(pub.track, pub, participant);
  }

  attach(track, pub, participant) {
    if (this.closed || pub.muted || !this.matches(pub, participant)) return;
    if (this.selected && this.selected !== pub) return;
    this.selected = pub;
    if (this.active?.track === track && this.active.pub === pub) return;
    this.identity ??= participant.identity;
    this.stopReader('replaced');
    const generation = ++this.generation;
    let reader;
    try { reader = this.streamFactory(track).getReader(); }
    catch { this.emit('status', { state: 'error', reason: 'stream_open_failed' }); return; }
    this.active = { reader, track, pub, generation };
    this.emit('status', { state: 'subscribed', participantIdentity: participant.identity, trackSid: pub.sid });
    const task = this.read(reader, pub, participant, generation);
    this.pending.add(task);
    void task.finally(() => this.pending.delete(task));
  }

  async read(reader, pub, participant, generation) {
    let lastSample = -Infinity;
    try {
      while (!this.closed && this.active?.generation === generation) {
        const { done, value } = await reader.read();
        if (done) break;
        if (this.closed || this.active?.generation !== generation || pub.muted) break;
        const capturedAtMs = this.now();
        if (capturedAtMs - lastSample < this.sampleIntervalMs) continue;
        lastSample = capturedAtMs;
        // rtc-node rejects no-op RGBA→RGBA conversion; decoded formats need conversion.
        const rgba = value.frame.type === VideoBufferType.RGBA
          ? value.frame : value.frame.convert(VideoBufferType.RGBA);
        // Copy SDK-owned bytes: consumers may retain this snapshot after decode advances.
        /** @type {import('./part-a-types.js').CallerFrame} */
        const frame = {
          sequence: ++this.sequence, generation, participantIdentity: participant.identity,
          trackSid: pub.sid, timestampUs: value.timestampUs.toString(), capturedAtMs,
          rotation: value.rotation, width: rgba.width, height: rgba.height,
          format: 'rgba', data: new Uint8Array(rgba.data),
        };
        this.latest = frame;
        this.emit('frame', frame);
      }
    } catch {
      if (!this.closed && this.active?.generation === generation) this.emit('status', { state: 'error', reason: 'stream_read_failed' });
    } finally {
      try { await reader.cancel(); } catch { /* track/room may already be gone */ }
      reader.releaseLock();
      if (this.active?.generation === generation) this.stopReader('ended');
    }
  }

  invalidate(pub, participant, reason) {
    // A delayed unpublish for the OLD track must not cancel its replacement.
    if (participant?.identity === this.identity && this.selected === pub) {
      this.stopReader(reason);
      if (reason === 'unpublished') this.selected = null;
    }
  }

  stopReader(reason) {
    const old = this.active;
    this.active = null;
    this.latest = null;
    ++this.generation;
    if (old) void old.reader.cancel().catch(() => {});
    this.emit('status', { state: 'unavailable', reason });
  }

  getLatestFrame(maxAgeMs = 1500) {
    if (!this.active || !this.latest || this.now() - this.latest.capturedAtMs > maxAgeMs) return null;
    return this.latest;
  }

  isCurrent(frame) { return !this.closed && this.active?.generation === frame.generation; }

  async close() {
    if (this.closed) { await Promise.allSettled([...this.pending]); return; }
    this.closed = true;
    for (const [event, fn] of this.bindings) this.room.off(event, fn);
    this.bindings = [];
    this.stopReader('disconnected');
    for (const pub of this.publications) {
      try { pub.setSubscribed(false); } catch { /* already disconnected */ }
    }
    this.publications.clear();
    await Promise.allSettled([...this.pending]);
  }
}
