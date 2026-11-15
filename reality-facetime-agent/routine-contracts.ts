/** Shared parent setup → Jie engine → Juan HUD/report contract. */
export type RoutineCheck = 'HELD_UP' | 'COVERED' | 'HIDDEN' | 'ON_TOP_OF' | 'LEFT_OF' | 'ORDER_LEFT_TO_RIGHT';
export interface RoutineDefinition {
  id: string; name: string; theme: string;
  timer: { startSeconds: number; stepDecreaseSeconds: number; minSeconds: number;
    fakeDonePenaltySeconds: number; missPenaltySeconds: number };
  objects: string[];
  steps: { label: string; check: RoutineCheck; objects: string[] }[];
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
  routineSteps: { label: string; status: 'pending' | 'active' | 'done' | 'missed' }[];
}
export interface RoutineReport {
  routineId: string; routineName: string; complete: boolean;
  verification: 'mock' | 'groq'; steps: RoutineStepResult[];
}
