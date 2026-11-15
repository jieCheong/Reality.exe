import type { HudPhase } from './part-a-types.js';

/** Narration/display data only; themes cannot provide predicates, verdicts or progression code. */
export interface ThemeDefinition {
  id: string;
  name: string;
  aliases?: string[];
  intro?: string;
  description?: string;
  missionIntros?: Partial<Record<HudPhase, string>>;
}
export type ThreeThemes = readonly [ThemeDefinition, ThemeDefinition, ThemeDefinition];
export type SelectionState = 'idle' | 'unconfigured' | 'presenting' | 'choosing' | 'confirming' | 'confirming_playout' | 'running' | 'paused' | 'closed';
