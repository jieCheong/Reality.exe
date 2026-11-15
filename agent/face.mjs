import { GlobalFonts, createCanvas } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';

// Portrait video close to the screen ratio of recent iPhones (9:19.5).
export const WIDTH = 540;
export const HEIGHT = 1170;
export const FPS = 15;

const fontPath = fileURLToPath(new URL('./assets/Orbitron.ttf', import.meta.url));
if (!GlobalFonts.registerFromPath(fontPath, 'Orbitron')) {
  throw new Error(`Could not load HUD font: ${fontPath}`);
}

const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext('2d');
const COLORS = {
  background: '#07131d',
  panel: '#101f2a',
  panelRaised: '#142733',
  border: '#28404b',
  text: '#eaf4f5',
  muted: '#8ba1a9',
  cyan: '#66e5d1',
  amber: '#ffcb78',
  dim: '#687e87',
};

export function drawFace(tick, speaking) {
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = ctx.createRadialGradient(270, 520, 20, 270, 520, 740);
  glow.addColorStop(0, '#102632');
  glow.addColorStop(1, COLORS.background);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.strokeStyle = '#18303a';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.55;
  for (let x = 18; x < WIDTH; x += 36) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
  for (let y = 18; y < HEIGHT; y += 36) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = COLORS.cyan;
  ctx.font = '700 22px Orbitron';
  ctx.fillText('REALITY.EXE', 32, 75);

  ctx.fillStyle = COLORS.panelRaised;
  ctx.strokeStyle = COLORS.border;
  ctx.beginPath();
  ctx.roundRect(310, 42, 198, 48, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = COLORS.amber;
  ctx.beginPath();
  ctx.arc(328, 66, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COLORS.text;
  ctx.font = '700 12px Orbitron';
  ctx.fillText('HUD PREVIEW', 341, 70);
  drawVoiceIndicator(tick, speaking);

  drawPanel(24, 344, 492, 250);
  ctx.fillStyle = COLORS.cyan;
  ctx.fillRect(50, 378, 4, 28);
  ctx.fillStyle = COLORS.muted;
  ctx.font = '700 18px Orbitron';
  ctx.fillText('OBJECTIVE', 68, 399);
  ctx.fillStyle = COLORS.text;
  ctx.font = '700 42px Orbitron';
  ctx.fillText('SHOW 3 OBJECTS', 50, 490);

  ctx.fillStyle = COLORS.muted;
  ctx.font = '700 16px Orbitron';
  ctx.fillText('CHECKPOINTS', 58, 906);
  drawPanel(32, 926, 476, 154);

  const checkpoints = [
    { label: 'SCAN', x: 78, active: true },
    { label: 'POWER', x: 206, active: false },
    { label: 'SECURITY', x: 334, active: false },
    { label: 'PORTAL', x: 462, active: false },
  ];
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(checkpoints[0].x, 1009);
  ctx.lineTo(checkpoints[checkpoints.length - 1].x, 1009);
  ctx.stroke();

  checkpoints.forEach(({ label, x, active }) => {
    ctx.fillStyle = active ? COLORS.cyan : COLORS.panelRaised;
    ctx.strokeStyle = active ? COLORS.cyan : COLORS.dim;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, 1009, active ? 9 : 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = active ? COLORS.text : COLORS.muted;
    ctx.font = '700 12px Orbitron';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, 1047);
  });
  ctx.textAlign = 'left';

  return new Uint8Array(ctx.getImageData(0, 0, WIDTH, HEIGHT).data);
}

function drawPanel(x, y, width, height) {
  ctx.fillStyle = COLORS.panel;
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 12);
  ctx.fill();
  ctx.stroke();
}

function drawVoiceIndicator(tick, speaking) {
  for (let i = 0; i < 5; i++) {
    const height = speaking ? 5 + ((tick + i * 3) % 12) : 3;
    ctx.fillStyle = speaking ? COLORS.cyan : COLORS.muted;
    ctx.fillRect(458 + i * 7, 66 - height / 2, 3, height);
  }
}
