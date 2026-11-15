/** Shared parent setup → Jie engine → Juan HUD/report contract. */
export type RoutineCheck = 'SHOW' | 'HELD_UP' | 'COVERED' | 'HIDDEN' | 'ON_TOP_OF' | 'LEFT_OF' | 'ORDER_LEFT_TO_RIGHT';
export interface RoutineDefinition {
  id: string; name: string; theme: string;
  timer: { startSeconds: number; stepDecreaseSeconds: number; minSeconds: number;
    fakeDonePenaltySeconds: number; missPenaltySeconds: number };
  objects: string[];
  /** short: optional HUD checkpoint label, A-Z, up to 6 letters, unique. */
  steps: { label: string; check: RoutineCheck; objects: string[]; short?: string }[];
}
export interface RoutineEvidenceFrame { id: string; capturedAtMs: number; dataUrl: string }
export interface RoutineStepResult {
  label: string; status: 'done' | 'missed';
  /** Active seconds taken, excluding ORBIT narration and explicit pauses; penalties are not elapsed time. */
  seconds: number; evidence: string; evidenceFrame: RoutineEvidenceFrame | null;
}
export interface RoutineHudState {
  mode: 'routine'; routineId: string; routineName: string; theme: string;
  /** -1 during scan, steps.length after completion. */
  stepIndex: number;
  timeLeftSeconds: number | null; budgetSeconds: number | null;
  /** short = the step's short label, or its 1-based number. */
  routineSteps: { label: string; short: string; status: 'pending' | 'active' | 'done' | 'missed' }[];
}
export interface RoutineReport {
  routineId: string; routineName: string; complete: boolean;
  verification: 'mock' | 'groq'; steps: RoutineStepResult[];
}
