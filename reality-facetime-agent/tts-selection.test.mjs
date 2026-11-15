import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test, before, after, mock } from 'node:test';
import { initializeLogger, tts } from '@livekit/agents';
import { AudioFrame, dispose } from '@livekit/rtc-node';
import { TTS as ElevenTTS } from '@livekit/agents-plugin-elevenlabs';
import { BufferedFallbackTTS, createConfiguredTTS } from './tts-selection.mjs';

before(() => {
  initializeLogger({ pretty: false, level: 'silent' });
  mock.method(globalThis, 'fetch', () => { throw new Error('Provider network forbidden in tests'); });
  mock.method(ElevenTTS.prototype, 'currentConnection', () => { throw new Error('Provider connection forbidden in tests'); });
});
after(() => { mock.restoreAll(); dispose(); });

class FakeProvider extends EventEmitter {
  constructor(value, { fail = false, rate = 24000 } = {}) { super(); this.value = value; this.fail = fail; this.rate = rate; this.calls = 0; }
  stream() {
    this.calls++; const provider = this;
    return {
      pushText() {}, endInput() {}, close() {},
      async *[Symbol.asyncIterator]() {
        yield { requestId: 'mock', segmentId: 'mock', final: true,
          frame: new AudioFrame(new Int16Array(240).fill(provider.value), provider.rate, 1, 240) };
        if (provider.fail) throw new Error('Mock partial-provider failure');
      },
    };
  }
  async close() {}
}
async function collect(adapter) {
  const stream = adapter.stream(); stream.pushText('Mock speech.'); stream.endInput();
  const packets = []; for await (const item of stream) if (typeof item !== 'symbol') packets.push(item);
  return packets;
}

test('existing LiveKit provider stays default; ElevenLabs requires approval and explicit credentials/voice', () => {
  class FakeLiveKit { constructor(options) { this.options = options; } }
  const defaults = createConfiguredTTS({}, {}, 'cartesia/sonic-3', 'existing-voice', { LiveKitTTS: FakeLiveKit });
  assert.equal(defaults.options.voice, 'existing-voice');
  assert.throws(() => createConfiguredTTS({ TTS_PROVIDER: 'elevenlabs' }, {}, '', ''), /approved/);
  assert.throws(() => createConfiguredTTS({ TTS_PROVIDER: 'elevenlabs', ELEVENLABS_REQUESTS_APPROVED: 'yes' }, {}, '', ''), /ELEVEN_API_KEY/);
  assert.throws(() => createConfiguredTTS({ TTS_PROVIDER: 'other' }, {}, '', ''), /Unsupported/);
});

test('real pinned plugin constructs and closes offline with the inspected PCM format', async () => {
  const adapter = createConfiguredTTS({ TTS_PROVIDER: 'elevenlabs', TTS_FALLBACK_PROVIDER: 'none',
    ELEVENLABS_REQUESTS_APPROVED: 'yes', ELEVEN_API_KEY: 'offline-fixture', ELEVEN_VOICE_ID: 'offline-voice' }, {}, '', '');
  assert.ok(adapter instanceof BufferedFallbackTTS);
  assert.ok(adapter.primary instanceof ElevenTTS);
  assert.equal(adapter.primary.model, 'eleven_flash_v2_5');
  assert.equal(adapter.primary.sampleRate, 22050);
  assert.equal(adapter.fallback, null);
  await adapter.close();
});

test('fallback discards partial primary audio, uses the backup, and never probes or replays it', async () => {
  const primary = new FakeProvider(11, { fail: true }), backup = new FakeProvider(22);
  const adapter = new BufferedFallbackTTS(primary, backup);
  const packets = await collect(adapter);
  assert.ok(packets.length > 0); assert.ok(packets.every(p => p.frame.data[0] === 22));
  await collect(adapter);
  assert.equal(primary.calls, 1, 'failed primary remains disabled for this call');
  assert.equal(backup.calls, 2, 'backup is used only for requested utterances');
  await adapter.close();
});

test('buffered output resamples to 24 kHz and all-provider failure emits no partial audio', async () => {
  const adapter = new BufferedFallbackTTS(new FakeProvider(20, { rate: 22050 }));
  const frames = await collect(adapter);
  assert.ok(frames.length); assert.ok(frames.every(p => p.frame.sampleRate === 24000));
  await adapter.close();
  const failed = new BufferedFallbackTTS(new FakeProvider(1, { fail: true }), new FakeProvider(2, { fail: true }));
  let error = false; failed.on('error', () => { error = true; });
  const packets = await collect(failed);
  assert.equal(packets.length, 0); assert.equal(error, true);
  await failed.close();
});
