import { inference } from '@livekit/agents';
import { createConfiguredTTS } from './tts-selection.mjs';

export const MODELS = Object.freeze({
  stt: 'deepgram/flux-general-en',
  llm: 'openai/gpt-4.1-mini',
  tts: 'cartesia/sonic-3',
  // Voice in LiveKit's documented Sonic 3 inference example.
  voice: '9626c31c-bec5-4cca-baa8-f8ba9e84c8bc',
});

// This is a user attestation, not an API that can inspect account billing.
// A paid project can charge for the same requests: never infer its plan from keys.
export function requireFreeBuild(env = process.env) {
  if (env.LIVEKIT_FREE_BUILD_CONFIRMED !== 'yes') {
    throw new Error('Live voice is disabled. First confirm the existing LiveKit project is on the free Build plan, has inference credits remaining, and has no paid billing. Then set LIVEKIT_FREE_BUILD_CONFIRMED=yes in .env.local.');
  }
  for (const key of ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']) {
    if (!env[key] || env[key].includes('YOUR_')) {
      throw new Error(`Configure ${key} privately in .env.local.`);
    }
  }
  if (!/^wss:\/\/[^/]+\.livekit\.cloud\/?$/.test(env.LIVEKIT_URL)) {
    throw new Error('This prototype requires the existing LiveKit Cloud project for included inference credits.');
  }
}

export function createVoiceOptions(env = process.env, adapters = inference) {
  requireFreeBuild(env);
  const auth = { apiKey: env.LIVEKIT_API_KEY, apiSecret: env.LIVEKIT_API_SECRET };
  return {
    stt: new adapters.STT({ ...auth, model: MODELS.stt }),
    llm: new adapters.LLM({ ...auth, model: MODELS.llm, modelOptions: { max_tokens: 120 } }),
    tts: createConfiguredTTS(env, auth, MODELS.tts, MODELS.voice, { LiveKitTTS: adapters.TTS }),
    // Flux supplies endpointing. Avoid additional cloud turn/interruption models.
    // First prototype is half duplex; barge-in is intentionally disabled.
    turnHandling: {
      turnDetection: 'stt',
      interruption: { enabled: false },
      preemptiveGeneration: { enabled: false },
    },
  };
}
