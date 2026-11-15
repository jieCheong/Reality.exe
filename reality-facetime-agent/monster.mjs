// Original "time monster" and life hearts for routine mode, drawn with canvas paths only.
// The monster is a friendly-scary purple blob: it appears in the last seconds of a step and
// grows and reddens as `closeness` goes from 0 (just appeared) to 1 (time is up).

/** Clamp the engine's monster/lives fields into something safe to draw. */
export function normalizeMonster(input) {
  const m = input?.monster;
  const closeness = Number.isFinite(m?.closeness) ? Math.min(1, Math.max(0, m.closeness)) : 0;
  return { visible: m?.visible === true, closeness };
}
export function normalizeLives(input) {
  const max = Number.isInteger(input?.maxLives) && input.maxLives >= 1 && input.maxLives <= 9 ? input.maxLives : null;
  if (max === null) return null;
  const lives = Number.isInteger(input.lives) ? Math.min(max, Math.max(0, input.lives)) : max;
  return { lives, max };
}

const mix = (a, b, t) => Math.round(a + (b - a) * t);
const bodyColor = t => `rgb(${mix(150, 220, t)},${mix(92, 64, t)},${mix(230, 120, t)})`;

/** cx, cy: center; r: body radius; tick: animation frame. */
export function drawMonster(ctx, cx, cy, r, closeness, tick) {
  ctx.save();
  const wobble = Math.sin(tick / 4) * r * 0.04 * (1 + closeness * 2);
  ctx.translate(cx + wobble, cy);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(0, r * 0.98, r * 0.85, r * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  // horns
  ctx.fillStyle = '#ffcb78';
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(side * r * 0.35, -r * 0.78); ctx.lineTo(side * r * 0.62, -r * 1.22); ctx.lineTo(side * r * 0.7, -r * 0.6); ctx.closePath(); ctx.fill();
  }
  // body: rounded top, wavy bottom edge like drips
  ctx.fillStyle = bodyColor(closeness);
  ctx.beginPath(); ctx.moveTo(-r, r * 0.2);
  ctx.bezierCurveTo(-r, -r * 1.15, r, -r * 1.15, r, r * 0.2);
  const waves = 4;
  for (let i = 0; i < waves; i++) {
    const x0 = r - (2 * r * i) / waves, x1 = r - (2 * r * (i + 1)) / waves;
    const drip = r * (0.8 + 0.12 * Math.sin(tick / 3 + i));
    ctx.quadraticCurveTo((x0 + x1) / 2, drip, x1, r * 0.55);
  }
  ctx.closePath(); ctx.fill();
  // one big eye that looks toward the viewer, pupil narrows as it gets closer
  ctx.fillStyle = '#f4f7f2';
  ctx.beginPath(); ctx.ellipse(0, -r * 0.3, r * 0.36, r * 0.32, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1b1030';
  ctx.beginPath(); ctx.ellipse(Math.sin(tick / 6) * r * 0.08, -r * 0.28, r * (0.14 - closeness * 0.07), r * 0.19, 0, 0, Math.PI * 2); ctx.fill();
  // grin with teeth; opens wider when close
  const open = r * (0.12 + closeness * 0.22);
  ctx.fillStyle = '#2a0f22';
  ctx.beginPath(); ctx.ellipse(0, r * 0.25, r * 0.5, open, 0, 0, Math.PI); ctx.fill();
  ctx.fillStyle = '#f4f7f2';
  const teeth = 5;
  for (let i = 0; i < teeth; i++) {
    const x = -r * 0.4 + (r * 0.8 * i) / (teeth - 1);
    ctx.beginPath(); ctx.moveTo(x - r * 0.06, r * 0.25); ctx.lineTo(x + r * 0.06, r * 0.25); ctx.lineTo(x, r * 0.25 + open * 0.55); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/** Hearts drawn right-to-left ending at `right`. Lost lives are outlines. */
export function drawHearts(ctx, right, cy, size, lives, max, colors) {
  ctx.save();
  for (let i = 0; i < max; i++) {
    const x = right - size / 2 - i * (size + 6), full = max - 1 - i < lives;
    const s = size / 2;
    ctx.beginPath();
    ctx.moveTo(x, cy + s * 0.85);
    ctx.bezierCurveTo(x - s * 1.25, cy - s * 0.05, x - s * 0.7, cy - s * 1.05, x, cy - s * 0.4);
    ctx.bezierCurveTo(x + s * 0.7, cy - s * 1.05, x + s * 1.25, cy - s * 0.05, x, cy + s * 0.85);
    ctx.closePath();
    if (full) { ctx.fillStyle = colors.red; ctx.fill(); }
    else { ctx.strokeStyle = colors.dim; ctx.lineWidth = 2; ctx.stroke(); }
  }
  ctx.restore();
}
