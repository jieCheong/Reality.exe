import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MissionEngine } from './mission-engine.mjs';
import { VisionClient } from './vision-client.mjs';
import { GameRuntime } from './game-runtime.mjs';
import { EventEmitter } from 'node:events';

const objects = ['bottle', 'notebook', 'pen'].map((name, i) => ({ name, description: name, box_2d: [100, 100 + i*250, 300, 200 + i*250] }));
let sequence = 0;
function apply(engine, result) {
  const request = engine.request();
  request.frameIds = Array.from({ length: request.operation === 'inventory' ? 2 : 3 }, () => `frame-${++sequence}`);
  return engine.apply(request, result);
}
const passing = engine => ({ status: 'checked', satisfied: true, predicate: engine.request().predicate,
  votes_for: 2, votes_total: 3, frame_verdicts: [0,1,2].map(i => ({ frame_index: i, satisfied: i < 2, confidence: .95, error: null, geometry_override: null })) });
function scanned() { const e = new MissionEngine(); apply(e, { status: 'checked', objects }); apply(e, { status: 'checked', objects }); return e; }

test('all missions require two fresh consensus rounds; raw done never progresses state', () => {
  const engine = scanned(); assert.equal(engine.phase, 'POWER');
  assert.equal(engine.apply(engine.request(), { satisfied: true, status: 'checked' }), false);
  for (const phase of ['POWER', 'SECURITY', 'PORTAL']) {
    assert.equal(engine.phase, phase);
    assert.equal(apply(engine, passing(engine)), false);
    assert.equal(apply(engine, passing(engine)), true);
  }
  assert.equal(engine.escaped, true); assert.equal(engine.hudState().missionProgress, 1);
  assert.ok(Object.values(engine.hudState().checkpoints).every(x => x === 'complete'));
});

test('failed, low-confidence, malformed and wrong-predicate verdicts reset the streak', () => {
  for (const mutate of [
    r => { r.satisfied = false; }, r => { r.frame_verdicts[0].confidence = .1; },
    r => { r.frame_verdicts[0].geometry_override = 'wrong boxes'; },
    r => { r.predicate = 'HELD_UP(other)'; }, r => { r.status = 'model_error'; },
    r => { r.frame_verdicts[0].error = 'timeout'; }, r => { r.frame_verdicts[1].frame_index = 0; },
  ]) {
    const engine = scanned(); apply(engine, passing(engine));
    const result = passing(engine); mutate(result); assert.equal(apply(engine, result), false);
    assert.equal(apply(engine, passing(engine)), false, 'one round after failure must not pass');
    assert.equal(engine.phase, 'POWER');
  }
});

test('replayed images, stale revisions and inconsistent inventories cannot complete a stage', () => {
  const engine = scanned(), request = engine.request(); request.frameIds = ['same-a','same-b','same-c'];
  engine.apply(request, passing(engine)); engine.apply(request, passing(engine));
  assert.equal(engine.phase, 'POWER');
  assert.equal(engine.apply({ ...request, revision: -1 }, passing(engine)), false);
  const scan = new MissionEngine(); apply(scan, { status: 'checked', objects });
  apply(scan, { status: 'checked', objects: objects.slice(0,2) });
  assert.equal(scan.phase, 'SCAN');
});

test('HTTP client rejects redirects, remote origins, mock results in real mode, and mismatched receipts', async () => {
  assert.throws(() => new VisionClient({ url: 'https://example.com' }), /loopback/);
  const request = { requestId: 'id', revision: 1, operation: 'verify', frames: [{ id: 'a' }] };
  for (const patch of [{ provider: 'mock' }, { revision: 2 }, { frameIds: ['b'] }, { requestId: 'other' }]) {
    const client = new VisionClient({ fetchImpl: async (_url, options) => {
      assert.equal(options.redirect, 'error');
      return { ok: true, text: async () => JSON.stringify({ ...request, provider: 'groq', frameIds: ['a'], result: {}, ...patch }) };
    } });
    await assert.rejects(client.analyze(request), /Unbound/);
  }
});

test('camera invalidation rejects an in-flight result and detaches on close', async () => {
  const camera = new EventEmitter(); camera.isCurrent = () => true;
  let finish;
  const vision = { newRequestId: () => 'request', analyze: () => new Promise(resolve => { finish = resolve; }) };
  const runtime = new GameRuntime({ callerVideo: camera, hud: { setState() {} }, say: async () => {}, vision,
    now: () => 1000, encode: async () => Buffer.from('jpeg'), intervalMs: 0 });
  runtime.start({ auto: false }); await runtime.speech;
  runtime.notBefore = 0;
  for (let i=0;i<2;i++) camera.emit('frame', { sequence: i, generation: 1, capturedAtMs: 600 + i*200 });
  const pending = runtime.tick();
  await new Promise(resolve => setImmediate(resolve));
  camera.emit('status', { state: 'unavailable' });
  finish({ status: 'checked', objects }); await pending;
  assert.equal(runtime.engine.phase, 'SCAN'); assert.equal(runtime.engine.streak, 0);
  await runtime.close(); assert.equal(camera.listenerCount('frame'), 0);
});
