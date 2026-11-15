// Application diagnostics accept fixed labels and numeric counts only, never payloads.
const labels = new Set(['SCAN','POWER','SECURITY','PORTAL','inventory','verify','mock','groq',
  'started','livekit','elevenlabs','none','subscribed','unavailable','error','complete','failed','discarded']);
const fields = new Set(['phase','operation','provider','fallback','state','frames','generation',
  'latencyMs','revision','progress','escaped','accepted','errors']);
const events = new Set(['camera_status','camera_delivery','mission_transition','hud_update',
  'verification_started','verification_finished','verification_applied','verification_discarded',
  'tts_synthesis','tts_selection','speech_playout']);
export function diagnostic(event, details = {}, sink = console.log) {
  if (!events.has(event)) return;
  const safe = {};
  for (const [key, value] of Object.entries(details)) {
    if (!fields.has(key)) continue;
    if (typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean' || labels.has(value)) safe[key] = value;
  }
  sink('[game-diagnostic]', JSON.stringify({ at: Date.now(), event, ...safe }));
}
