import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MissionEngine } from './mission-engine.mjs';
import { VisionClient } from './vision-client.mjs';
import { GameRuntime } from './game-runtime.mjs';
import { EventEmitter } from 'node:events';
import { DEFAULT_ROUTINE, PHASES, validateRoutine } from './routine.mjs';

let sequence = 0;
function apply(engine, result) {
  const request = engine.request();
  request.frameIds = Array.from({ length: request.operation === 'inventory' ? 2 : 3 }, () => `frame-${++sequence}`);
  return engine.apply(request, result);
}
const passing = engine => ({ status: 'checked', satisfied: true, predicate: engine.request().predicate,
  votes_for: 2, votes_total: 3, frame_verdicts: [0,1,2].map(i => ({ frame_index: i, satisfied: i < 2, confidence: .95, error: null, geometry_override: null })) });
const fresh = () => new MissionEngine();

test('every routine step requires two fresh consensus rounds; raw done never progresses state', () => {
  const engine = fresh(); assert.equal(engine.phase, PHASES[0]);
  assert.equal(engine.apply(engine.request(), { satisfied: true, status: 'checked' }), false);
  for (const phase of PHASES) {
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
    const engine = fresh(); apply(engine, passing(engine));
    const result = passing(engine); mutate(result); assert.equal(apply(engine, result), false);
    assert.equal(apply(engine, passing(engine)), false, 'one round after failure must not pass');
    assert.equal(engine.phase, PHASES[0]);
  }
});

test('replayed images and stale revisions cannot complete a step', () => {
  const engine = fresh(), request = engine.request(); request.frameIds = ['same-a','same-b','same-c'];
  engine.apply(request, passing(engine)); engine.apply(request, passing(engine));
  assert.equal(engine.phase, PHASES[0]);
  assert.equal(engine.apply({ ...request, revision: -1 }, passing(engine)), false);
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
  for (let i=0;i<3;i++) camera.emit('frame', { sequence: i, generation: 1, capturedAtMs: 400 + i*200 });
  const pending = runtime.tick();
  await new Promise(resolve => setImmediate(resolve));
  camera.emit('status', { state: 'unavailable' });
  finish(passing(runtime.engine)); await pending;
  assert.equal(runtime.engine.phase, PHASES[0]); assert.equal(runtime.engine.streak, 0);
  await runtime.close(); assert.equal(camera.listenerCount('frame'), 0);
});

test('routine: 9-step morning default, per-step catalog within the bridge limit, every check well-formed', () => {
  assert.equal(PHASES.length, 9);
  const e = fresh();
  const VALID = /^(SHOW|HELD_UP|COVERED|HIDDEN|ON_TOP_OF|LEFT_OF|ORDER_LEFT_TO_RIGHT)\([a-z ,-]+\)$/;
  assert.match(e.instruction(), /9 steps/);
  while (!e.escaped) {
    const req = e.request();
    assert.match(req.predicate, VALID);
    assert.ok(req.catalog.length <= 3, 'bridge accepts at most 3 objects');
    if (req.predicate.startsWith('SHOW(')) assert.equal(req.catalog.length, 0);
    else for (const name of req.predicate.slice(req.predicate.indexOf('(') + 1, -1).split(', '))
      assert.ok(req.catalog.some(o => o.name === name), `${name} sent with its check`);
    assert.ok(e.hudState().objective.length > 3);
    apply(e, passing(e)); apply(e, passing(e));
  }
  assert.match(e.instruction(), /complete/);
});

test('parent routines: a custom routine runs; malformed ones are rejected with a readable reason', () => {
  const custom = validateRoutine({ name: 'Bedtime', steps: [
    { short: 'PJS', check: 'SHOW', objects: ['pajamas'], say: 'Put on your pajamas and show me.' },
    { short: 'BOOK', check: 'ON_TOP_OF', objects: ['book', 'pillow'], hud: 'Book on pillow' }] });
  const e = new MissionEngine({ routine: custom });
  assert.deepEqual(e.phases, ['PJS', 'BOOK']);
  apply(e, passing(e)); apply(e, passing(e));
  assert.equal(e.request().predicate, 'ON_TOP_OF(book, pillow)'); assert.equal(e.hudState().objective, 'BOOK ON PILLOW');
  apply(e, passing(e)); apply(e, passing(e)); assert.ok(e.escaped);
  for (const [bad, why] of [
    [{ steps: [] }, /1 to 9/],
    [{ steps: Array(10).fill({ check: 'SHOW', objects: ['cup'] }) }, /1 to 9/],
    [{ steps: [{ check: 'TELEPORT', objects: ['cup'] }] }, /unknown check/],
    [{ steps: [{ check: 'ON_TOP_OF', objects: ['cup'] }] }, /takes 2/],
    [{ steps: [{ check: 'SHOW', objects: ['Cup!'] }] }, /lowercase/],
    [{ steps: [{ short: 'A', check: 'SHOW', objects: ['cup'] }, { short: 'A', check: 'SHOW', objects: ['pen'] }] }, /unique/],
  ]) assert.throws(() => validateRoutine(bad), why);
  assert.doesNotThrow(() => validateRoutine(DEFAULT_ROUTINE));
});
