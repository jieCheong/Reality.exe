import { diagnostic } from './diagnostics.mjs';
import { inference, tts } from '@livekit/agents';
import { AudioFrame, AudioResampler } from '@livekit/rtc-node';
import { TTS as ElevenLabsTTS } from '@livekit/agents-plugin-elevenlabs';

/** Only ElevenLabs mode uses this adapter. Default Cartesia path stays untouched. */
export class BufferedFallbackTTS extends tts.TTS {
  label = 'orbit.BufferedFallbackTTS';
  constructor(primary, fallback = null) {
    super(24000, 1, { streaming: true, alignedTranscript: false });
    this.primary = primary; this.fallback = fallback; this.primaryFailed = false;
    // Inner errors are handled here; only failure of all options reaches the session.
    this.ignoreError = () => {};
    for (const provider of [primary, fallback].filter(Boolean)) provider.on('error', this.ignoreError);
  }
  stream(options = {}) { return new BufferedStream(this, options.connOptions); }
  async close() {
    for (const provider of [this.primary, this.fallback].filter(Boolean)) {
      try { await provider.close(); } finally { provider.off('error', this.ignoreError); }
    }
  }
}

class BufferedStream extends tts.SynthesizeStream {
  label = 'orbit.BufferedStream';
  constructor(owner, options) {
    super(owner, { ...options, maxRetry: 0, timeoutMs: 5000, retryIntervalMs: 0 });
    this.owner = owner;
  }
  onStreamDone() { this.active?.close(); }
  async render(text) {
    const providers = this.owner.primaryFailed && this.owner.fallback ? [this.owner.fallback]
      : [this.owner.primary, this.owner.fallback].filter(Boolean);
    for (const provider of providers) {
      if (this.abortSignal.aborted) return;
      let error, expired = false, resampler, samples = 0;
      const buffered = [];
      const onError = event => { error = event.error || new Error('TTS provider failed'); };
      provider.on('error', onError);
      const cancel = () => this.active?.close();
      this.abortSignal.addEventListener('abort', cancel, { once: true });
      let timer;
      try {
        this.active = provider.stream({ connOptions: { maxRetry: 0, timeoutMs: 5000, retryIntervalMs: 0 } });
        this.active.pushText(text); this.active.endInput();
        const deadline = new Promise((_, reject) => {
          timer = setTimeout(() => { expired = true; cancel(); reject(new Error('TTS deadline')); }, provider === this.owner.primary ? 2500 : 5000);
        });
        await Promise.race([deadline, (async () => {
          for await (const packet of this.active) {
            if (typeof packet === 'symbol') continue;
            if (packet.frame.channels !== 1) throw new Error('Expected mono TTS');
            if (packet.frame.sampleRate !== 24000) resampler ??= new AudioResampler(packet.frame.sampleRate, 24000, 1);
            const frames = resampler ? resampler.push(packet.frame) : [packet.frame];
            for (const frame of frames) {
              samples += frame.samplesPerChannel;
              if (samples > 24000 * 60) throw new Error('TTS utterance too long');
              buffered.push({ ...packet, frame: new AudioFrame(new Int16Array(frame.data), 24000, 1, frame.samplesPerChannel) });
            }
          }
          if (resampler) for (const frame of resampler.flush()) buffered.push({ requestId: '', segmentId: '', final: true, frame });
        })()]);
        if (error || expired || !buffered.length) throw new Error('Incomplete TTS synthesis');
        if (this.abortSignal.aborted) return;
        // Nothing is published until a whole segment succeeds: fallback cannot replay partial words.
        for (const packet of buffered) this.queue.put(packet);
        diagnostic('tts_synthesis', { provider: provider === this.owner.primary ? 'elevenlabs' : 'livekit', state: 'complete' });
        return;
      } catch {
        if (this.abortSignal.aborted) return;
        diagnostic('tts_synthesis', { provider: provider === this.owner.primary ? 'elevenlabs' : 'livekit', state: 'failed' });
        if (provider === this.owner.primary) this.owner.primaryFailed = true;
      } finally {
        clearTimeout(timer); cancel(); resampler?.close(); provider.off('error', onError);
        this.abortSignal.removeEventListener('abort', cancel);
      }
    }
    throw new Error('Configured TTS options failed');
  }
  async run() {
    let text = '';
    for await (const value of this.input) {
      if (this.abortSignal.aborted) return;
      if (typeof value === 'string') {
        text += value;
        if (text.length > 1500) throw new Error('ORBIT utterance exceeds 1500 characters');
      } else if (text.trim()) { this.markStarted(); await this.render(text); text = ''; }
    }
    if (text.trim()) { this.markStarted(); await this.render(text); }
    this.queue.put(tts.SynthesizeStream.END_OF_STREAM);
  }
}

export function createConfiguredTTS(env, auth, model, voice, adapters = {}) {
  const LiveKitTTS = adapters.LiveKitTTS || inference.TTS;
  const provider = env.TTS_PROVIDER || 'livekit';
  const fallback = env.TTS_FALLBACK_PROVIDER || 'livekit';
  if (!['livekit', 'elevenlabs'].includes(provider) || !['livekit', 'none'].includes(fallback)) throw new Error('Unsupported TTS provider configuration');
  diagnostic('tts_selection', { provider, fallback: provider === 'livekit' ? 'none' : fallback });
  if (provider === 'livekit') return new LiveKitTTS({ ...auth, model, voice });
  if (env.ELEVENLABS_REQUESTS_APPROVED !== 'yes') throw new Error('ElevenLabs is disabled until explicitly approved');
  for (const key of ['ELEVEN_API_KEY', 'ELEVEN_VOICE_ID']) {
    if (!env[key] || env[key].startsWith('YOUR_')) throw new Error(`Configure ${key} privately before selecting ElevenLabs`);
  }
  const ElevenTTS = adapters.ElevenTTS || ElevenLabsTTS;
  return new BufferedFallbackTTS(new ElevenTTS({ apiKey: env.ELEVEN_API_KEY, voiceId: env.ELEVEN_VOICE_ID,
    model: env.ELEVEN_MODEL || 'eleven_flash_v2_5', encoding: 'pcm_22050', enableLogging: false }),
  fallback === 'livekit' ? new LiveKitTTS({ ...auth, model, voice }) : null);
}
