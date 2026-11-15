export interface DetectedGameObject { name: string; description: string; box_2d: [number, number, number, number] }
export interface MissionRequest {
  requestId: string;
  revision: number;
  operation: 'inventory' | 'verify';
  catalog: DetectedGameObject[];
  predicate?: string;
  frames: { id: string; capturedAtMs: number; jpeg: string }[];
}
export interface FrameVerdict {
  frame_index: number; satisfied: boolean; confidence: number;
  error?: string | null; geometry_override?: string | null;
}
export interface VisionResult {
  status: 'checked' | 'unstable_scene' | 'no_frames' | 'model_error';
  objects?: DetectedGameObject[];
  satisfied?: boolean;
  predicate?: string;
  votes_for?: number;
  votes_total?: number;
  frame_verdicts?: FrameVerdict[];
  correction_hint?: string | null;
}
export interface VisionEnvelope {
  requestId: string; revision: number; operation: 'inventory' | 'verify';
  frameIds: string[]; provider: 'mock' | 'groq'; result: VisionResult;
}
