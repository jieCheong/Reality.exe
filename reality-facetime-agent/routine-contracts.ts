/** Shared parent setup → Jie engine → Juan HUD/report contract. */
export type RoutineCheck = 'HELD_UP' | 'COVERED' | 'HIDDEN' | 'ON_TOP_OF' | 'LEFT_OF' | 'ORDER_LEFT_TO_RIGHT';
export interface RoutineDefinition {
  id: string; name: string; theme: string;
  timer: { startSeconds: number; stepDecreaseSeconds: number; minSeconds: number;
    fakeDonePenaltySeconds: number; missPenaltySeconds: number };
  lives?: number; monsterSeconds?: number;
  objects: string[];
  steps: { label: string; check: RoutineCheck; objects: string[] }[];
}
export interface RoutineEvidenceFrame { id: string; capturedAtMs: number; dataUrl: string }
export interface RoutineStepResult {
  label: string; status: 'done' | 'missed';
  /** Active seconds taken, excluding ORBIT narration and explicit pauses; penalties are not elapsed time. */
  seconds: number; evidence: string; evidenceFrame: RoutineEvidenceFrame | null;
}
export type RoutineEventName = 'scan_started' | 'mission_starting' | 'mission_in_progress' |
  'verification_pending' | 'observation_accepted' | 'verification_cancelled' |
  'mission_verified' | 'evidence_retry' | 'evidence_uncertain' | 'mission_missed' |
  'routine_completed' | 'routine_paused' | 'narration_failed';
export type RoutineUiState = 'scanning' | 'mission_starting' | 'in_progress' |
  'verification_pending' | 'mission_verified' | 'retry' | 'uncertain' | 'mission_missed' |
  'routine_completed' | 'paused';
export interface RoutineHudState {
  selectedTheme?: 'space' | 'odyssey' | 'backrooms' | null;
  themeMenu?: {state:string;candidateId:string|null;themes:{id:string;name:string;description:string}[]};
  elapsedSeconds?: number; lives?: number; maxLives?: number;
  monster?: {visible:boolean;closeness:number}; outcome?: 'failed'|'complete'|null;
  /** Display provenance, never a recognition accuracy claim. */
  verificationMode?: 'mock' | 'groq';
  missionName: string; missionInstruction: string;
  /** One-based while a mission is active; null during scan/completion. */
  currentStep: number | null; totalSteps: number;
  completedSteps: number; resolvedSteps: number;
  uiState: RoutineUiState;
  verificationStatus: 'idle' | 'pending' | 'observed' | 'verified' | 'retry' | 'uncertain';
  confirmationRounds: number; requiredConfirmationRounds: number;
  paused: boolean; pauseReasons: string[];
  narrationStatus: 'idle' | 'speaking' | 'failed' | 'paused';
  routineEvent: { sequence: number; name: RoutineEventName; revision: number; stepIndex: number };
  lastOutcome: { stepIndex: number; label: string; status: 'done' | 'missed' } | null;
  mode: 'routine'; routineId: string; routineName: string; theme: string;
  /** -1 during scan, steps.length after completion. */
  stepIndex: number;
  timeLeftSeconds: number | null; budgetSeconds: number | null;
  routineSteps: { label: string; status: 'pending' | 'active' | 'done' | 'missed' }[];
}
export interface RoutineReport {
  outcome?: 'failed' | 'complete' | null; livesLeft?: number;
  routineId: string; routineName: string; complete: boolean;
  verification: 'mock' | 'groq'; steps: RoutineStepResult[];
}
