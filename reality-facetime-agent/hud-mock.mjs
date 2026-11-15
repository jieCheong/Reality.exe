// Display fixtures only. The real game engine owns progression.
export const MOCK_HUD_SEQUENCE = Object.freeze([
  Object.freeze({ phase: 'SCAN', objective: 'SHOW 3 OBJECTS', missionProgress: 0 }),
  Object.freeze({ phase: 'POWER', objective: 'RESTORE REACTOR POWER', missionProgress: 1 / 3 }),
  Object.freeze({ phase: 'SECURITY', objective: 'SHOW YOUR ACCESS KEY', missionProgress: 2 / 3 }),
  Object.freeze({ phase: 'PORTAL', objective: 'OPEN THE PORTAL', missionProgress: 1 }),
]);

/** Opt-in helper; returns a cancellation function. Never starts itself in agent.mjs. */
export function playHudMock(hud, intervalMs = 2000) {
  let index = 0;
  hud.setState({ gameState: MOCK_HUD_SEQUENCE[index] });
  const timer = setInterval(() => {
    index++;
    if (index >= MOCK_HUD_SEQUENCE.length) { clearInterval(timer); return; }
    hud.setState({ gameState: MOCK_HUD_SEQUENCE[index] });
  }, intervalMs);
  return () => clearInterval(timer);
}
