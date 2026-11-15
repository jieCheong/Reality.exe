/** Shared parent setup → Jie engine → Juan HUD/report contract. */
export type RoutineCheck = 'SHOW' | 'DOING' | 'HELD_UP' | 'COVERED' | 'HIDDEN' | 'ON_TOP_OF' | 'LEFT_OF' | 'ORDER_LEFT_TO_RIGHT';
export interface RoutineDefinition {
  id: string; name: string; theme: string;
  /** Timeouts allowed before the mission fails (1-9, default 3). */
  lives?: number;
  /** The monster shows for the last N seconds of each step (0-300, default 25, 0 = off). */
  monsterSeconds?: number;
  /** Which greeting starts this routine when both a morning and a night routine are installed. */
  greeting?: 'morning' | 'night';
  timer: { startSeconds: number; stepDecreaseSeconds: number; minSeconds: number;
    fakeDonePenaltySeconds: number; missPenaltySeconds: number };
  objects: string[];
  /** short: optional HUD checkpoint label, A-Z, up to 6 letters, unique. seconds: optional step time (10-900).
   *  DOING's single argument is an action ("brushing their teeth"), not a routine object. */
  steps: { label: string; check: RoutineCheck; objects: string[]; short?: string; seconds?: number }[];
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
  lives: number; maxLives: number; elapsedSeconds: number;
  /** closeness: 0 when it first appears, 1 when time runs out. */
  monster: { visible: boolean; closeness: number };
  outcome: 'complete' | 'failed' | null;
  /** short = the step's short label, or its 1-based number. */
  routineSteps: { label: string; short: string; status: 'pending' | 'active' | 'done' | 'missed' }[];
}
export interface RoutineReport {
  routineId: string; routineName: string; complete: boolean;
  outcome: 'complete' | 'failed' | null; livesLeft: number;
  verification: 'mock' | 'groq'; steps: RoutineStepResult[];
}
