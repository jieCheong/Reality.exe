import { appendFileSync, mkdirSync } from 'node:fs';
import { voice } from '@livekit/agents';

// Local timing/count evidence only. No credentials, transcript text or audio.
export function observeCall(session, jobId) {
  mkdirSync('.local', { recursive: true });
  const emit = (event, details = {}) => {
    const record = { at: Date.now(), jobId, event, ...details };
    appendFileSync('.local/call-events.jsonl', JSON.stringify(record) + '\n');
    console.log('[call-evidence]', JSON.stringify(record));
  };
  let finalAt, endOfSpeechAt;
  const on = (name, callback) => session.on(name, callback);
  on(voice.AgentSessionEventTypes.UserInputTranscribed, e => {
    if (!e.isFinal) return;
    finalAt = e.createdAt;
    emit('stt_final', { characters: e.transcript.length });
  });
  on(voice.AgentSessionEventTypes.MetricsCollected, ({ metrics: m }) => {
    const details = {};
    for (const key of ['speechId', 'ttftMs', 'ttfbMs', 'durationMs', 'audioDurationMs',
      'completionTokens', 'promptTokens', 'charactersCount', 'cancelled',
      'endOfUtteranceDelayMs', 'transcriptionDelayMs', 'lastSpeakingTimeMs']) {
      if (m[key] !== undefined) details[key] = m[key];
    }
    if (m.type === 'eou_metrics' && m.lastSpeakingTimeMs > 0) endOfSpeechAt = m.lastSpeakingTimeMs;
    emit(m.type, details);
  });
  on(voice.AgentSessionEventTypes.AgentStateChanged, e => {
    const details = { state: e.newState };
    if (e.newState === 'speaking' && finalAt !== undefined) {
      details.finalTranscriptToSpeakingMs = e.createdAt - finalAt;
      // This is agent-side timing, not when audio reaches the iPhone.
      if (endOfSpeechAt && endOfSpeechAt <= finalAt) details.endOfSpeechToSpeakingMs = e.createdAt - endOfSpeechAt;
      finalAt = undefined;
      endOfSpeechAt = undefined;
    }
    emit('agent_state', details);
  });
  on(voice.AgentSessionEventTypes.Error, e => emit('inference_error', {
    type: e.error?.type, recoverable: e.error?.recoverable,
  }));
  on(voice.AgentSessionEventTypes.Close, e => emit('session_closed', { reason: e.reason }));
  emit('observer_ready');
}
