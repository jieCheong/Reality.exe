// Display fixtures only. The real game engine owns progression.
import { ROUTINE } from './routine.mjs';
export const MOCK_HUD_SEQUENCE = Object.freeze(ROUTINE.steps.map((s, i, all) =>
  Object.freeze({ phase: s.short, objective: s.hud, missionProgress: i / all.length })));

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
