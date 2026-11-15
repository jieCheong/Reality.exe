// Adapted from Juan's agent/face.mjs on branch Juan, commit 0e1b95ff.
// His Orbitron typography, colors, panels, checkpoint rail and voice indicator
// are retained in a native portrait layout for Part A's RGBA camera track.
import { GlobalFonts, createCanvas } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import { LANDSCAPE_LAYOUT, drawLandscape, landscapeObjectiveLines } from './spaceship-landscape.mjs';
import { HUD_VIDEO_PROFILE } from './hud-video-profile.mjs';
import { drawHearts, drawMonster, normalizeLives, normalizeMonster } from './monster.mjs';
export const WIDTH = HUD_VIDEO_PROFILE.width, HEIGHT = HUD_VIDEO_PROFILE.height, FPS = HUD_VIDEO_PROFILE.fps;
const extra = HEIGHT - 960, objectiveOffset = extra / 3, progressOffset = extra * 2 / 3, checkpointOffset = extra;
const landscape = HUD_VIDEO_PROFILE.name === 'landscape-test';
export const STATUS_STRIPE_Y = landscape ? 51 : 144;
export const HUD_LAYOUT = landscape ? LANDSCAPE_LAYOUT : Object.freeze({
  header: Object.freeze({ x: 24, y: 24, width: 492, height: 42 }),
  status: Object.freeze({ x: 24, y: 84, width: 492, height: 44 }),
  objective: Object.freeze({ x: 24, y: 168 + objectiveOffset, width: 492, height: 260 }),
  progress: Object.freeze({ x: 24, y: 452 + progressOffset, width: 492, height: 104 }),
  checkpoints: Object.freeze({ x: 24, y: 608 + checkpointOffset, width: 492, height: 312 }),
});

const fontPath = fileURLToPath(new URL('./assets/Orbitron.ttf', import.meta.url));
if (!GlobalFonts.registerFromPath(fontPath, 'Orbitron')) throw new Error('Could not load the bundled Orbitron HUD font');
export const PHASES = Object.freeze(['SCAN', 'POWER', 'SECURITY', 'HIDE', 'FIND', 'PORTAL']);
const OBJECTIVES = {
  SCAN: 'SHOW 3 OBJECTS', POWER: 'RESTORE REACTOR POWER',
  SECURITY: 'UNLOCK SHIP SECURITY', HIDE: 'ENGAGE CLOAKING', FIND: 'LOCATE THE BEACON',
  PORTAL: 'OPEN THE PORTAL',
};
const COLORS = Object.freeze({
  background: '#07131d', panel: '#101f2a', panelRaised: '#142733',
  border: '#28404b', text: '#eaf4f5', muted: '#8ba1a9',
  cyan: '#66e5d1', amber: '#ffcb78', dim: '#687e87', red: '#ff8a7a',
});
const ROUTINE_STATUS = { done: 'complete', missed: 'missed', active: 'active', pending: 'pending' };

/** Routine mode (Jie's RoutineMissionEngine): its own step list and countdown replace the fixed checkpoints. */
function normalizeRoutine(input) {
  if (input.mode !== 'routine' || !Array.isArray(input.routineSteps)) return null;
  if (input.routineSteps.length < 1 || input.routineSteps.length > 12) throw new Error('HUD routine needs 1 to 12 steps');
  const steps = input.routineSteps.map((s, i) => {
    if (!s || !Object.hasOwn(ROUTINE_STATUS, s.status)) throw new Error('Unknown routine step status');
    const short = typeof s.short === 'string' && /^[A-Z0-9]{1,6}$/.test(s.short) ? s.short : String(i + 1);
    return { short, status: ROUTINE_STATUS[s.status] };
  });
  const t = input.timeLeftSeconds;
  const timeLeft = Number.isFinite(t) && t >= 0 ? Math.min(5999, Math.floor(t)) : null;
  const index = Number.isInteger(input.stepIndex) ? input.stepIndex : -1;
  return { steps, timeLeft, label: input.outcome === 'failed' ? 'MISSION FAILED' : input.outcome === 'complete' ? 'COMPLETE'
      : index >= 0 && index < steps.length ? `STEP ${index + 1} / ${steps.length}` : null,
    lives: normalizeLives(input), monster: normalizeMonster(input) };
}
export const clock = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext('2d');

/** @param {import('./part-a-types.js').GameHudState} [input] */
export function normalizeGameState(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Game HUD state must be an object');
  const phase = input.phase ?? 'SCAN';
  if (!PHASES.includes(phase)) throw new Error('Unknown HUD phase');
  if (input.objective !== undefined && typeof input.objective !== 'string') throw new Error('HUD objective must be text');
  const index = PHASES.indexOf(phase);
  const progress = input.missionProgress ?? index / (PHASES.length - 1);
  if (!Number.isFinite(progress)) throw new Error('HUD missionProgress must be finite');
  const missionProgress = Math.min(1, Math.max(0, progress));
  const checkpoints = Object.fromEntries(PHASES.map((name, i) => {
    const status = input.checkpoints?.[name] ?? (i < index || missionProgress === 1 ? 'complete' : i === index ? 'active' : 'pending');
    if (!['pending', 'active', 'complete'].includes(status)) throw new Error('Unknown checkpoint status');
    return [name, status];
  }));
  return { phase, objective: input.objective?.trim().slice(0, 300) || OBJECTIVES[phase], checkpoints, missionProgress,
    routine: normalizeRoutine(input) };
}

/** Part C renderer: optional display snapshot; no game transitions or inference. */
export function drawFace(tick, speaking = false, gameState = undefined) {
  const state = normalizeGameState(gameState);
  ctx.save();
  try {
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const glow = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 20, WIDTH / 2, HEIGHT / 2, WIDTH);
    glow.addColorStop(0, '#102632'); glow.addColorStop(1, COLORS.background);
    ctx.fillStyle = glow; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.strokeStyle = '#18303a'; ctx.lineWidth = 1; ctx.globalAlpha = 0.55;
    for (let x = 18; x < WIDTH; x += 36) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke(); }
    for (let y = 18; y < HEIGHT; y += 36) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (landscape) {
      drawLandscape(ctx, tick, speaking, state, COLORS, PHASES);
      return new Uint8Array(ctx.getImageData(0, 0, WIDTH, HEIGHT).data);
    }

    ctx.fillStyle = COLORS.cyan; ctx.font = '700 28px Orbitron'; ctx.fillText('REALITY.EXE', 24, 55);
    if (state.routine?.lives) drawHearts(ctx, 516, 44, 26, state.routine.lives.lives, state.routine.lives.max, COLORS);
    drawBox(HUD_LAYOUT.status, true);
    ctx.fillStyle = state.phase === 'SCAN' ? COLORS.amber : COLORS.cyan;
    ctx.beginPath(); ctx.arc(44, 106, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = COLORS.text; ctx.font = '700 16px Orbitron'; ctx.fillText(state.routine?.label ?? state.phase, 61, 112);
    drawVoiceIndicator(tick, speaking);
    ctx.fillStyle = state.phase === 'SCAN' ? COLORS.amber : COLORS.cyan;
    ctx.fillRect(0, STATUS_STRIPE_Y, WIDTH, 4);

    drawBox(HUD_LAYOUT.objective);
    ctx.fillStyle = COLORS.cyan; ctx.fillRect(44, 190 + objectiveOffset, 3, 20);
    ctx.fillStyle = COLORS.muted; ctx.font = '700 16px Orbitron'; ctx.fillText('OBJECTIVE', 60, 207 + objectiveOffset);
    if (state.routine?.timeLeft != null) {  // countdown, amber in the last 10 seconds
      ctx.fillStyle = state.routine.timeLeft <= 10 ? COLORS.amber : COLORS.text; ctx.font = '700 26px Orbitron';
      ctx.textAlign = 'right'; ctx.fillText(clock(state.routine.timeLeft), 496, 210 + objectiveOffset); ctx.textAlign = 'left';
    }
    drawObjective(state.objective);

    drawBox(HUD_LAYOUT.progress);
    ctx.fillStyle = COLORS.muted; ctx.font = '700 14px Orbitron'; ctx.fillText('MISSION PROGRESS', 44, 483 + progressOffset);
    ctx.fillStyle = COLORS.text; ctx.textAlign = 'right'; ctx.fillText(`${Math.round(state.missionProgress * 100)}%`, 496, 483 + progressOffset); ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.border; ctx.fillRect(44, 513 + progressOffset, 452, 12);
    ctx.fillStyle = COLORS.cyan; ctx.fillRect(44, 513 + progressOffset, 452 * state.missionProgress, 12);

    ctx.fillStyle = COLORS.muted; ctx.font = '700 14px Orbitron'; ctx.fillText('CHECKPOINTS', 44, 590 + checkpointOffset);
    drawBox(HUD_LAYOUT.checkpoints);
    ctx.strokeStyle = COLORS.border; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(62, 652 + checkpointOffset); ctx.lineTo(62, 874 + checkpointOffset); ctx.stroke();
    const rail = state.routine ? state.routine.steps.map(s => [s.short, s.status]) : PHASES.map(p => [p, state.checkpoints[p]]);
    const tight = rail.length > 6, gap = rail.length > 1 ? 222 / (rail.length - 1) : 0;
    rail.forEach(([label, status], i) => {
      const x = 62, y = 652 + checkpointOffset + i * gap;
      const color = status === 'active' ? COLORS.amber : status === 'complete' ? COLORS.cyan : status === 'missed' ? COLORS.red : COLORS.dim;
      ctx.fillStyle = status === 'pending' ? COLORS.panelRaised : color; ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, status === 'active' ? (tight ? 8 : 9) : (tight ? 6 : 7), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (status === 'complete') {
        ctx.strokeStyle = COLORS.background; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x - 1, y + 3); ctx.lineTo(x + 4, y - 3); ctx.stroke();
      }
      ctx.fillStyle = status === 'pending' ? COLORS.muted : COLORS.text;
      ctx.font = `700 ${tight ? 15 : 18}px Orbitron`; ctx.fillText(label, 88, y + (tight ? 5 : 6));
      ctx.fillStyle = color; ctx.font = `700 ${tight ? 11 : 12}px Orbitron`; ctx.textAlign = 'right';
      ctx.fillText((status === 'complete' && state.routine ? 'done' : status).toUpperCase(), 496, y + 4); ctx.textAlign = 'left';
    });
    // The time monster lives in the open middle of the checkpoint panel and grows as time runs out.
    const monster = state.routine?.monster;
    if (monster?.visible) drawMonster(ctx, 300, 780 + checkpointOffset, 45 + 70 * monster.closeness, monster.closeness, tick);
    return new Uint8Array(ctx.getImageData(0, 0, WIDTH, HEIGHT).data);
  } finally { ctx.restore(); }
}

function drawBox(box, raised = false) { drawPanel(box.x, box.y, box.width, box.height, raised); }

function drawPanel(x, y, width, height, raised = false) {
  ctx.fillStyle = raised ? COLORS.panelRaised : COLORS.panel; ctx.strokeStyle = COLORS.border; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x, y, width, height, 10); ctx.fill(); ctx.stroke();
}

function drawVoiceIndicator(tick, speaking) {
  for (let i = 0; i < 5; i++) {
    const height = speaking ? 5 + ((tick + i * 3) % 12) : 3;
    ctx.fillStyle = speaking ? COLORS.cyan : COLORS.muted;
    ctx.fillRect(446 + i * 10, 106 - height / 2, 3, height);
  }
}

export function objectiveLines(text) {
  if (landscape) return landscapeObjectiveLines(ctx, text);
  ctx.save();
  ctx.font = '700 26px Orbitron';
  const lines = []; let line = '';
  for (const char of text.replace(/\s+/g, ' ')) {
    if (ctx.measureText(line + char).width > 448) { lines.push(line.trim()); line = char; }
    else line += char;
  }
  if (line) lines.push(line.trim());
  if (lines.length > 5) {
    let last = lines[4];
    while (ctx.measureText(last + '…').width > 448) last = last.slice(0, -1);
    lines[4] = last + '…';
  }
  const result = lines.slice(0, 5).map((text, i) => ({ text, x: 44, baseline: 251 + objectiveOffset + i * 35, width: ctx.measureText(text).width }));
  ctx.restore(); return result;
}
function drawObjective(text) {
  ctx.save();
  ctx.beginPath(); ctx.rect(44, 224 + objectiveOffset, 452, 186); ctx.clip();
  ctx.fillStyle = COLORS.text; ctx.font = '700 26px Orbitron';
  for (const line of objectiveLines(text)) ctx.fillText(line.text, line.x, line.baseline);
  ctx.restore();
}
