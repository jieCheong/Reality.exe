import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test, after } from 'node:test';
import { GlobalFonts } from '@napi-rs/canvas';
import { VideoSource, VideoBufferType, TrackSource, dispose } from '@livekit/rtc-node';
import { drawFace, normalizeGameState, WIDTH, HEIGHT, FPS, HUD_LAYOUT, objectiveLines } from './spaceship-face.mjs';
import { publishHud } from './hud-video.mjs';
import { MOCK_HUD_SEQUENCE, playHudMock } from './hud-mock.mjs';

after(() => dispose());
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('Juan renderer uses bundled Orbitron and retains the Part A RGBA contract', () => {
  assert.ok(GlobalFonts.has('Orbitron'));
  assert.equal(WIDTH, 540); assert.equal(HEIGHT, 960); assert.equal(FPS, 15);
  const frame = drawFace(0, false);
  assert.ok(frame instanceof Uint8Array);
  assert.equal(frame.length, WIDTH * HEIGHT * 4);
  for (let i = 3; i < frame.length; i += 4) assert.equal(frame[i], 255);
  const before = hash(frame);
  drawFace(9, true, { phase: 'POWER' });
  assert.equal(hash(frame), before, 'subsequent renders cannot mutate earlier buffers');
  assert.notEqual(hash(drawFace(0, false)), hash(drawFace(0, true)), 'speaking indicator still animates');
});

test('mock phases, objective, progress and checkpoint state independently affect pixels', () => {
  assert.deepEqual(MOCK_HUD_SEQUENCE.map(s => s.phase), ['SCAN', 'POWER', 'SECURITY', 'PORTAL']);
  assert.equal(new Set(MOCK_HUD_SEQUENCE.map(s => hash(drawFace(0, false, s)))).size, 4);
  const base = { phase: 'POWER', missionProgress: 0.3, objective: 'RESTORE POWER' };
  const original = hash(drawFace(0, false, base));
  for (const override of [
    { objective: 'CHECK THE REACTOR' }, { missionProgress: 0.8 },
    { checkpoints: { SCAN: 'pending', POWER: 'complete' } },
  ]) assert.notEqual(hash(drawFace(0, false, { ...base, ...override })), original);
  assert.equal(normalizeGameState({ missionProgress: 4 }).missionProgress, 1);
  assert.equal(normalizeGameState({ missionProgress: -2 }).missionProgress, 0);
  assert.equal(drawFace(0, false, { objective: 'Long objective '.repeat(100) }).length, WIDTH * HEIGHT * 4);
  assert.throws(() => normalizeGameState({ phase: 'UNKNOWN' }), /phase/);
  assert.throws(() => normalizeGameState({ missionProgress: NaN }), /finite/);
  assert.throws(() => normalizeGameState({ checkpoints: { SCAN: 'invalid' } }), /checkpoint/);
});

test('isolated video publisher accepts game snapshots on the existing native camera source', async () => {
  const frames = []; let published = 0, unpublished = 0;
  class ObservedVideoSource extends VideoSource {
    captureFrame(frame, timestamp, rotation) {
      assert.equal(rotation, 0);
      assert.equal(frame.data.byteLength, WIDTH * HEIGHT * 4);
      assert.equal(frame.width, WIDTH); assert.equal(frame.height, HEIGHT);
      assert.equal(frame.type, VideoBufferType.RGBA);
      frames.push(hash(frame.data));
      super.captureFrame(frame); // actual local native capture; no room or network
    }
  }
  const source = new ObservedVideoSource(WIDTH, HEIGHT);
  const local = {
    async publishTrack(track, options) {
      published++; assert.equal(track.name, 'agent-video');
      assert.equal(track.source.width, WIDTH); assert.equal(track.source.height, HEIGHT);
      assert.equal(options.source, TrackSource.SOURCE_CAMERA); return { sid: 'isolated-hud' };
    },
    async unpublishTrack(sid) { assert.equal(sid, 'isolated-hud'); unpublished++; },
  };
  const hud = await publishHud(local, { source, fps: 1 });
  try {
    for (const gameState of MOCK_HUD_SEQUENCE) { hud.setState({ gameState }); hud.render(); }
    assert.equal(published, 1, 'state changes never replace the published video track');
    assert.equal(new Set(frames.slice(1)).size, 4);
    assert.throws(() => hud.setState({ gameState: { phase: 'BAD' } }), /phase/);
    const snapshot = { phase: 'POWER', objective: 'UNCHANGED', checkpoints: { POWER: 'active' } };
    hud.setState({ gameState: snapshot }); hud.render();
    snapshot.objective = 'EXTERNAL MUTATION'; snapshot.checkpoints.POWER = 'pending';
    hud.render(); assert.equal(frames.at(-1), frames.at(-2));
    hud.setState({ speaking: true }); hud.render();
    assert.notEqual(frames.at(-1), frames.at(-2));
  } finally { await hud.close(); }
  assert.equal(unpublished, 1);
});

test('mock playback is optional and cancellable', async () => {
  const states = [];
  const stop = playHudMock({ setState(update) { states.push(update.gameState.phase); } }, 5);
  await new Promise(resolve => setTimeout(resolve, 80));
  stop();
  assert.deepEqual(states, ['SCAN', 'POWER', 'SECURITY', 'PORTAL']);
  const count = states.length;
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(states.length, count);
});

 test('portrait layout bounds and wrapped objective stay inside safe panel margins', () => {
  assert.equal(WIDTH / HEIGHT, 9 / 16);
  for (const box of Object.values(HUD_LAYOUT)) {
    assert.ok(box.x >= 24 && box.y >= 24);
    assert.ok(box.x + box.width <= WIDTH - 24);
    assert.ok(box.y + box.height <= HEIGHT - 24);
  }
  for (const objective of ['PLACE BOTTLE ON TOP OF NOTEBOOK', 'W'.repeat(300), 'long objective '.repeat(40)]) {
    const lines = objectiveLines(objective);
    assert.ok(lines.length <= 5);
    for (const line of lines) {
      assert.ok(line.width <= 448);
      assert.ok(line.x + line.width <= 496);
      assert.ok(line.baseline <= 410);
    }
  }
});

test('publisher rejects a mismatched landscape source before publishing', async () => {
  await assert.rejects(publishHud({ publishTrack() { assert.fail('must not publish'); } }, {
    source: { width: 640, height: 360 },
  }), /portrait/);
});
