import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test, before, after, mock } from 'node:test';
import { inference, initializeLogger, voice } from '@livekit/agents';
import { createVoiceOptions, MODELS, requireFreeBuild } from './voice-stack.mjs';
import { greetOnBridgeReady } from './greet.mjs';

const env = {
  LIVEKIT_FREE_BUILD_CONFIRMED: 'yes',
  LIVEKIT_URL: 'wss://offline-fixture.livekit.cloud',
  LIVEKIT_API_KEY: 'offline-fixture-key',
  LIVEKIT_API_SECRET: 'offline-fixture-secret',
};

before(() => {
  initializeLogger({ pretty: false, level: 'silent' });
  // Fail rather than accidentally use credits or contact a provider in tests.
  mock.method(globalThis, 'fetch', () => { throw new Error('Offline test forbids fetch'); });
  for (const adapter of [inference.STT, inference.TTS]) {
    mock.method(adapter.prototype, 'connectWs', () => { throw new Error('Offline test forbids inference sockets'); });
  }
  mock.method(inference.LLM.prototype, '_prewarmImpl', () => { throw new Error('Offline test forbids inference prewarm'); });
});
after(() => mock.restoreAll());

test('live inference fails closed before constructing providers', () => {
  const never = new Proxy({}, { get() { throw new Error('Provider constructed too early'); } });
  assert.throws(() => createVoiceOptions({}, never), /Live voice is disabled/);
  assert.throws(() => requireFreeBuild({ ...env, LIVEKIT_FREE_BUILD_CONFIRMED: 'no' }), /disabled/);
  for (const key of ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']) {
    assert.throws(() => requireFreeBuild({ ...env, [key]: 'YOUR_PLACEHOLDER' }), new RegExp(key));
  }
  assert.throws(() => requireFreeBuild({ ...env, LIVEKIT_URL: 'ws://localhost:7880' }), /Cloud project/);
});

test('installed SDK constructs the selected streaming providers without OpenAI credentials', async () => {
  const opts = createVoiceOptions(env);
  assert.ok(opts.stt instanceof inference.STT);
  assert.ok(opts.llm instanceof inference.LLM);
  assert.ok(opts.tts instanceof inference.TTS);
  assert.equal(opts.stt.model, MODELS.stt);
  assert.equal(opts.llm.model, MODELS.llm);
  assert.equal(opts.tts.model, MODELS.tts);
  assert.equal(opts.stt.capabilities.streaming, true);
  assert.equal(opts.tts.capabilities.streaming, true);
  assert.equal(await opts.stt.vadPromise, undefined);
  // AgentSession prewarms LLMs in its constructor. Suppress that request only
  // for this offline composition test; live startup uses the real prewarm.
  opts.llm.prewarm = () => {};
  const session = new voice.AgentSession(opts);
  assert.equal(session.turnDetection, 'stt');
  assert.equal(session.sessionOptions.turnHandling.interruption.enabled, false);
  assert.equal(session.sessionOptions.turnHandling.preemptiveGeneration.enabled, false);
  assert.equal(session.llm, opts.llm);
  assert.equal(session.stt, opts.stt);
  assert.equal(session.tts, opts.tts);
  await session.close();
  await opts.tts.close();
});

test('Chert greeting waits for bridge readiness, fires once, and unsubscribes', () => {
  const room = new EventEmitter();
  let greetings = 0;
  const stop = greetOnBridgeReady(room, () => { greetings++; });
  for (const metadata of ['', '{bad json', '{}', '{"chert_bridge_ready":false}']) {
    room.metadata = metadata;
    room.emit('roomMetadataChanged');
    assert.equal(greetings, 0);
  }
  room.metadata = '{"chert_bridge_ready":true}';
  room.emit('roomMetadataChanged');
  room.emit('roomMetadataChanged');
  assert.equal(greetings, 1);
  assert.equal(room.listenerCount('roomMetadataChanged'), 0);
  stop();
});

test('a closed room cancels a pending greeting', () => {
  const room = new EventEmitter();
  let greetings = 0;
  const stop = greetOnBridgeReady(room, () => { greetings++; });
  stop();
  room.metadata = '{"chert_bridge_ready":true}';
  room.emit('roomMetadataChanged');
  assert.equal(greetings, 0);
});
