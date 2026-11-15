/** Copied, sampled RGBA snapshot. No inference or verdict is implied. */
export interface CallerFrame {
  sequence: number;
  generation: number;
  participantIdentity: string;
  trackSid: string | undefined;
  /** Decimal microseconds, kept as string for JSON interoperability. */
  timestampUs: string;
  /** Local wall clock; not the caller's capture clock. */
  capturedAtMs: number;
  /** rtc-node VideoRotation enum: 0, 1, 2, 3 = 0°, 90°, 180°, 270°. */
  rotation: number;
  width: number;
  height: number;
  format: 'rgba';
  /** Owned by the snapshot; consumers must not mutate it. */
  data: Uint8Array;
}

export interface CallerVideoStatus {
  state: 'subscribed' | 'unavailable' | 'error';
  reason?: string;
  participantIdentity?: string;
  trackSid?: string;
}

/** Teammate B: consume current camera frames; discard work when isCurrent=false. */
export interface CallerVideoPort {
  on(event: 'frame', listener: (frame: CallerFrame) => void): this;
  on(event: 'status', listener: (status: CallerVideoStatus) => void): this;
  off(event: 'frame', listener: (frame: CallerFrame) => void): this;
  off(event: 'status', listener: (status: CallerVideoStatus) => void): this;
  getLatestFrame(maxAgeMs?: number): CallerFrame | null;
  isCurrent(frame: CallerFrame): boolean;
  close(): Promise<void>;
}

/** Teammate C: supplies display state; this adapter makes no game decisions. */
export interface HudState {
  reactor: 'offline' | 'online';
  speaking: boolean;
}

export interface HudVideoPort {
  setState(update: Partial<HudState>): void;
  render(): void;
  close(): Promise<void>;
}

export interface SavedCallerFrame {
  file: string;
  sha256: string;
  pixelSha256: string;
  sequence: number;
  capturedAtMs: number;
  participantIdentity: string;
  trackSid?: string;
  timestampUs: string;
  rotation: number;
  width: number;
  height: number;
}
