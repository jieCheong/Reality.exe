import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, after } from 'node:test';
import sharp from 'sharp';
import { RoomEvent as E, TrackKind, TrackSource, VideoBufferType, VideoFrame, dispose } from '@livekit/rtc-node';
import { CallerVideoAdapter } from './caller-video.mjs';
import { FrameSampler, encodeJpeg } from './frame-sampler.mjs';
import { drawHud, publishHud } from './hud-video.mjs';
import { WIDTH, HEIGHT } from './face.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
after(() => dispose());
const camera = (sid = 'camera-1') => ({ sid, name: 'facetime-remote-video', kind: TrackKind.KIND_VIDEO,
  muted: false, track: {}, requests: [], setSubscribed(value) { this.requests.push(value); } });
const participant = (identity = 'chert-bridge-test') => ({ identity, trackPublications: new Map() });
const fixture = () => {
  const room = new EventEmitter(); room.remoteParticipants = new Map();
  const streams = [];
  let clock = 1000;
  const adapter = new CallerVideoAdapter(room, {
    sampleIntervalMs: 0, now: () => clock,
    streamFactory: track => {
      const item = { track, cancelled: false };
      streams.push(item);
      return new ReadableStream({ start(c) { item.controller = c; }, cancel() { item.cancelled = true; } });
    },
  });
  const p = participant(); const pub = camera();
  const send = (stream = streams.at(-1), value = 50) => {
    const data = new Uint8Array(4 * 4 * 4).fill(value);
    const frame = new VideoFrame(data, 4, 4, VideoBufferType.RGBA);
    stream.controller.enqueue({ frame, timestampUs: 123456n, rotation: 0 });
    return data;
  };
  adapter.start();
  return { room, streams, adapter, p, pub, send, advance(ms) { clock += ms; } };
};

test('filters unrelated identities, names and media; subscribes to a late Chert camera', async () => {
  const f = fixture();
  f.room.emit(E.TrackPublished, f.pub, participant('unrelated-avatar'));
  f.room.emit(E.TrackPublished, { ...f.pub, name: 'agent-video' }, f.p);
  f.room.emit(E.TrackPublished, { ...f.pub, kind: TrackKind.KIND_AUDIO }, f.p);
  assert.equal(f.pub.requests.length, 0);
  f.room.emit(E.TrackPublished, f.pub, f.p);
  assert.deepEqual(f.pub.requests, [true]);
  const data = f.send(); await flush();
  const frame = f.adapter.getLatestFrame();
  assert.equal(frame.participantIdentity, f.p.identity);
  assert.equal(frame.timestampUs, '123456');
  assert.equal(frame.format, 'rgba');
  const first = frame.data[0]; data[0] = 250;
  assert.equal(frame.data[0], first, 'SDK buffer is copied');
  f.advance(1600); assert.equal(f.adapter.getLatestFrame(), null, 'old frames expire');
  await f.adapter.close();
  assert.equal(f.room.eventNames().length, 0);
});

test('mute cancels reads and clears cache; unmute resumes; replacement ignores old lifecycle events', async () => {
  const f = fixture(); f.room.emit(E.TrackPublished, f.pub, f.p);
  f.send(); await flush(); const old = f.adapter.getLatestFrame();
  f.pub.muted = true; f.room.emit(E.TrackMuted, f.pub, f.p);
  assert.equal(f.adapter.getLatestFrame(), null);
  assert.equal(f.adapter.isCurrent(old), false);
  assert.equal(f.streams[0].cancelled, true);
  f.pub.muted = false; f.room.emit(E.TrackUnmuted, f.pub, f.p);
  f.send(); await flush(); assert.ok(f.adapter.getLatestFrame());
  const replacement = camera('camera-2');
  f.room.emit(E.TrackPublished, replacement, f.p);
  f.send(undefined, 100); await flush();
  assert.equal(f.adapter.getLatestFrame().trackSid, 'camera-2');
  f.room.emit(E.TrackSubscribed, f.pub.track, f.pub, f.p);
  assert.equal(f.adapter.getLatestFrame().trackSid, 'camera-2', 'late old subscription cannot replace the new camera');
  f.room.emit(E.TrackUnpublished, f.pub, f.p);
  f.room.emit(E.TrackUnsubscribed, f.pub.track, f.pub, f.p);
  assert.equal(f.adapter.getLatestFrame().trackSid, 'camera-2');
  f.room.emit(E.TrackUnpublished, replacement, f.p);
  assert.equal(f.adapter.getLatestFrame(), null);
  await f.adapter.close();
});

test('reconnect rescans existing publications and room disconnect stops all work', async () => {
  const f = fixture(); f.p.trackPublications.set(f.pub.sid, f.pub); f.room.remoteParticipants.set(f.p.identity, f.p);
  f.adapter.scan(); f.send(); await flush();
  f.room.emit(E.Reconnecting); assert.equal(f.adapter.getLatestFrame(), null);
  f.room.emit(E.Reconnected); f.send(); await flush(); assert.ok(f.adapter.getLatestFrame());
  f.room.emit(E.ParticipantDisconnected, f.p); assert.equal(f.adapter.getLatestFrame(), null);
  const p2 = participant('chert-bridge-next'); const pub2 = camera('next');
  f.room.emit(E.TrackPublished, pub2, p2); f.send(); await flush();
  assert.equal(f.adapter.getLatestFrame().participantIdentity, p2.identity);
  f.room.emit(E.Disconnected); await flush();
  assert.equal(f.adapter.getLatestFrame(), null);
  assert.equal(f.room.eventNames().length, 0);
  assert.equal(f.streams.at(-1).cancelled, true);
  await f.adapter.close();
});

test('a failed stream invalidates the last frame instead of reusing stale pixels', async () => {
  const f = fixture(); f.room.emit(E.TrackPublished, f.pub, f.p); f.send(); await flush();
  f.streams.at(-1).controller.error(new Error('decoder stopped'));
  await flush(); assert.equal(f.adapter.getLatestFrame(), null);
  await f.adapter.close();
});

const snapshot = (value, sequence = value) => ({ sequence, generation: 1, participantIdentity: 'chert-bridge-fixture',
  trackSid: 'fixture', timestampUs: String(value * 1000), capturedAtMs: value * 1000,
  width: 8, height: 6, rotation: 0, format: 'rgba', data: new Uint8Array(8 * 6 * 4).fill(value) });

test('debug sampler writes exactly five distinct valid JPEGs and a provenance manifest', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reality-jpeg-'));
  try {
    const sampler = new FrameSampler(directory, { minIntervalMs: 0 });
    await sampler.offer(snapshot(20));
    assert.equal(await sampler.offer(snapshot(20, 99)), null, 'identical pixels are not a distinct image');
    for (const value of [40, 60, 80, 100, 120]) await sampler.offer(snapshot(value));
    assert.equal(sampler.saved.length, 5);
    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
    assert.equal(new Set(manifest.map(item => item.sha256)).size, 5);
    for (const item of manifest) {
      const jpeg = await readFile(item.file);
      assert.deepEqual([...jpeg.subarray(0, 2)], [255, 216]);
      const meta = await sharp(jpeg).metadata();
      assert.equal(meta.format, 'jpeg'); assert.equal(meta.width, 8); assert.equal(meta.height, 6);
    }
    await sampler.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('sampler drops queued work and stale in-flight encoding when a track is replaced', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'reality-stale-'));
  let finish, current = true;
  const sampler = new FrameSampler(directory, { encode: () => new Promise(resolve => { finish = resolve; }) });
  try {
    const saving = sampler.offer(snapshot(30), () => current);
    assert.equal(await sampler.offer(snapshot(50)), null, 'busy encoder does not queue frames');
    current = false; finish(Buffer.from('unused'));
    assert.equal(await saving, null);
    assert.deepEqual(await readdir(directory), []);
    await sampler.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('JPEG encoding honors the installed quarter-turn rotation enum', async () => {
  const frame = { ...snapshot(60), rotation: 1 };
  const meta = await sharp(await encodeJpeg(frame)).metadata();
  assert.equal(meta.width, 6); assert.equal(meta.height, 8);
});

test('HUD visibly changes status and uses one camera publication with clean shutdown', async () => {
  const off = drawHud(0, { reactor: 'offline' });
  const on = drawHud(0, { reactor: 'online' });
  assert.equal(off.length, WIDTH * HEIGHT * 4); assert.notDeepEqual(off, on);
  assert.throws(() => drawHud(0, { reactor: 'unknown' }), /reactor/);
  const captured = []; let published = 0, unpublished = 0, trackClosed = 0, sourceClosed = 0;
  const source = { captureFrame(frame) { captured.push(frame); }, async close() { sourceClosed++; } };
  const track = { async close() { trackClosed++; } };
  const local = {
    async publishTrack(t, opts) { published++; assert.equal(t, track); assert.equal(opts.source, TrackSource.SOURCE_CAMERA); return { sid: 'hud' }; },
    async unpublishTrack(sid) { assert.equal(sid, 'hud'); unpublished++; },
  };
  const hud = await publishHud(local, { fps: 1, source, createTrack: () => track, createFrame: pixels => pixels });
  hud.setState({ reactor: 'online' }); hud.render();
  assert.equal(published, 1); assert.notDeepEqual(captured[0], captured[1]);
  await hud.close(); await hud.close(); hud.render();
  assert.equal(captured.length, 2);
  assert.equal(unpublished, 1); assert.equal(trackClosed, 1); assert.equal(sourceClosed, 1);
});
