import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectDemoPreflight } from './demo-preflight.mjs';

const env = overrides => ({
  ...process.env,
  ENABLE_GAME: 'yes',
  VISION_MODE: 'mock',
  ROUTINE_FILE: 'examples/routines/mock-desk.json',
  HUD_VIDEO_PROFILE: 'routine-game',
  LIVEKIT_URL: 'wss://local.example',
  LIVEKIT_API_KEY: 'livekit-key-sentinel',
  LIVEKIT_API_SECRET: 'livekit-secret-sentinel',
  GROQ_API_KEY: 'groq-key-sentinel',
  ...overrides,
});
const dependencies = {
  moduleCheck: () => true,
  pythonCheck: async () => ({ PIL: true, pydantic: true, groq: true }),
  portProbe: async () => ({ state: 'free' }),
};

test('preflight validates routine-game output without serializing credential values', async () => {
  const report = await inspectDemoPreflight({
    env: env({}),
    routineFile: 'examples/routines/mock-desk.json',
    profileName: 'routine-game',
    ...dependencies,
  });
  assert.equal(report.ready, true, JSON.stringify(report.issues));
  assert.deepEqual([report.hud.width, report.hud.height, report.hud.rgbaBytes], [540, 960, 540 * 960 * 4]);
  assert.equal(report.routine.stepCount, 3);
  assert.equal(report.sideEffects.providerRequests, 0);
  const serialized = JSON.stringify(report);
  for (const secret of ['livekit-key-sentinel', 'livekit-secret-sentinel', 'groq-key-sentinel']) {
    assert.ok(!serialized.includes(secret));
  }
});

test('preflight refuses non-loopback bridge health checks without making a request', async () => {
  let requests = 0;
  const report = await inspectDemoPreflight({
    env: env({}),
    routineFile: 'examples/routines/mock-desk.json',
    profileName: 'routine-game',
    bridgeUrl: 'https://example.invalid',
    checkBridge: true,
    fetchImpl: async () => { requests++; throw Error('must not fetch'); },
    ...dependencies,
  });
  assert.equal(requests, 0);
  assert.equal(report.bridge.state, 'invalid_local_url');
  assert.ok(report.issues.includes('invalid_vision_bridge_url'));
  assert.equal(report.sideEffects.providerRequests, 0);
});

test('requested bridge verification calls only the local health endpoint', async () => {
  const requests = [];
  const report = await inspectDemoPreflight({
    env: env({}),
    routineFile: 'examples/routines/mock-desk.json',
    profileName: 'routine-game',
    checkBridge: true,
    fetchImpl: async (url, options) => {
      requests.push({ url, redirect: options.redirect });
      return { ok: true, json: async () => ({ provider: 'mock', real_world_verified: false }) };
    },
    ...dependencies,
  });
  assert.equal(report.ready, true, JSON.stringify(report.issues));
  assert.deepEqual(requests, [{ url: 'http://127.0.0.1:8765/health', redirect: 'error' }]);
  assert.equal(report.bridge.state, 'healthy');
  assert.equal(report.sideEffects.providerRequests, 0);
});

test('live mock-mode preflight does not require Groq credentials', async () => {
  const report = await inspectDemoPreflight({
    env: env({ GROQ_API_KEY: undefined }),
    routineFile: 'examples/routines/mock-desk.json',
    profileName: 'routine-game',
    live: true,
    ...dependencies,
  });
  assert.equal(report.ready, true, JSON.stringify(report.issues));
  assert.equal(report.configuration.liveCredentialsPresent.GROQ_API_KEY, null);
});
