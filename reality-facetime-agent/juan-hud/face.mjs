import { GlobalFonts, createCanvas, loadImage } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';

// Portrait video close to the screen ratio of recent iPhones (9:19.5).
export const WIDTH = 540;
export const HEIGHT = 1170;
export const FPS = 15;

export const THEMES = Object.freeze({
  space: Object.freeze({
    name: 'SPACE MISSION',
    shortName: 'SPACE',
    description: 'RESTORE THE SHIP',
    checkpoints: ['SCAN', 'POWER', 'SECURITY', 'PORTAL'],
  }),
  odyssey: Object.freeze({
    name: 'ODYSSEY',
    shortName: 'ODYSSEY',
    description: 'FIND YOUR WAY HOME',
    missions: ['Voyage'],
    checkpoints: ['SCAN', 'VOYAGE', 'CHALLENGE', 'HOME'],
  }),
  backrooms: Object.freeze({
    name: 'BACKROOMS',
    shortName: 'BACKROOMS',
    description: 'FIND THE EXIT',
    checkpoints: ['SCAN', 'SEARCH', 'SURVIVE', 'EXIT'],
  }),
});

const fontPath = fileURLToPath(new URL('./assets/Orbitron.ttf', import.meta.url));
if (!GlobalFonts.registerFromPath(fontPath, 'Orbitron')) {
  throw new Error(`Could not load HUD font: ${fontPath}`);
}
const odysseyFontPath = fileURLToPath(new URL('./assets/GFSDidot-Regular.ttf', import.meta.url));
if (!GlobalFonts.registerFromPath(odysseyFontPath, 'GFSDidot')) {
  throw new Error(`Could not load Odyssey font: ${odysseyFontPath}`);
}
const spaceFontPath = fileURLToPath(new URL('./assets/Michroma-Regular.ttf', import.meta.url));
if (!GlobalFonts.registerFromPath(spaceFontPath, 'Michroma')) {
  throw new Error(`Could not load Space font: ${spaceFontPath}`);
}
const backroomsFontPath = fileURLToPath(new URL('./assets/IBMPlexSansCondensed-Regular.ttf', import.meta.url));
if (!GlobalFonts.registerFromPath(backroomsFontPath, 'BackroomsSans')) {
  throw new Error(`Could not load Backrooms font: ${backroomsFontPath}`);
}
const backroomsBoldFontPath = fileURLToPath(new URL('./assets/IBMPlexSansCondensed-SemiBold.ttf', import.meta.url));
if (!GlobalFonts.registerFromPath(backroomsBoldFontPath, 'BackroomsSansBold')) {
  throw new Error(`Could not load Backrooms bold font: ${backroomsBoldFontPath}`);
}
const backroomsBackgroundPath = fileURLToPath(new URL('./assets/backrooms-wall.webp', import.meta.url));
const backroomsBackground = await loadImage(backroomsBackgroundPath);
const odysseyBackgroundPath = fileURLToPath(new URL('./assets/odyssey-sea.webp', import.meta.url));
const odysseyBackground = await loadImage(odysseyBackgroundPath);
const spaceBackgroundPath = fileURLToPath(new URL('./assets/space-moon.webp', import.meta.url));
const spaceBackground = await loadImage(spaceBackgroundPath);

const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext('2d');
const SPACE_COLORS = {
  background: '#eaf4fa',
  backgroundDeep: '#dceaf4',
  panel: '#f8fcff',
  panelRaised: '#dceaf4',
  border: '#12395e',
  text: '#102f50',
  muted: '#4d6c88',
  grid: '#8eaac0',
  accent: '#d6322b',
  line: '#8ca7bb',
};
const BACKROOMS_COLORS = {
  panel: '#f6efcc',
  border: '#6e6441',
  text: '#302f26',
  muted: '#615b43',
  accent: '#8d7c49',
  line: '#9c8d5c',
};
const ODYSSEY_COLORS = {
  paper: '#e8d9ba',
  paperLight: '#f2e7cd',
  paperDark: '#dfcfad',
  border: '#866b45',
  borderLight: '#ad9166',
  text: '#4d6378',
  muted: '#64788a',
  active: '#536d82',
};
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

export function drawFace(tick, speaking, themeId = null, result = null) {
  const theme = themeId === null ? null : THEMES[themeId];
  if (themeId !== null && !theme) throw new RangeError(`Unknown HUD theme: ${themeId}`);
  if (result !== null) {
    if (!theme) throw new RangeError('Game result requires a selected theme.');
    if (typeof result !== 'object' || Array.isArray(result)) {
      throw new TypeError('Game result must include task and time statistics.');
    }
    if (!Number.isSafeInteger(result.tasksCompleted) || result.tasksCompleted < 0) {
      throw new RangeError('Completed task count must be a non-negative safe integer.');
    }
    if (!Number.isSafeInteger(result.elapsedSeconds) || result.elapsedSeconds < 0) {
      throw new RangeError('Elapsed seconds must be a non-negative safe integer.');
    }
    if (result.timedOutTasks !== undefined &&
        (!Number.isSafeInteger(result.timedOutTasks) || result.timedOutTasks < 0)) {
      throw new RangeError('Timed-out task count must be a non-negative safe integer.');
    }
  }

  if (themeId === 'odyssey') {
    drawOdyssey(tick, speaking, theme, result);
    return new Uint8Array(ctx.getImageData(0, 0, WIDTH, HEIGHT).data);
  }
  if (themeId === 'space') {
    drawSpace(tick, speaking, theme, result);
    return new Uint8Array(ctx.getImageData(0, 0, WIDTH, HEIGHT).data);
  }
  if (themeId === 'backrooms') {
    drawBackrooms(tick, speaking, theme, result);
    return new Uint8Array(ctx.getImageData(0, 0, WIDTH, HEIGHT).data);
  }

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
  ctx.fillText(theme ? theme.shortName : 'CHOOSE THEME', 341, 70);
  drawVoiceIndicator(tick, speaking);

  if (theme) {
    drawObjective();
  } else {
    drawThemeSelection();
  }

  drawCheckpoints(theme ? theme.checkpoints : ['SCAN', 'STAGE 1', 'STAGE 2', 'ESCAPE']);

  return new Uint8Array(ctx.getImageData(0, 0, WIDTH, HEIGHT).data);
}

function drawSpace(tick, speaking, theme, result) {
  const blur = 2;
  const bleed = blur * 3;
  const scale = Math.max(
    (WIDTH + bleed * 2) / spaceBackground.width,
    (HEIGHT + bleed * 2) / spaceBackground.height,
  );
  const imageWidth = spaceBackground.width * scale;
  const imageHeight = spaceBackground.height * scale;
  ctx.save();
  ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(
    spaceBackground,
    (WIDTH - imageWidth) / 2,
    (HEIGHT - imageHeight) / 2,
    imageWidth,
    imageHeight,
  );
  ctx.restore();

  drawSpacePanel(24, 42, 235, 48);
  ctx.fillStyle = SPACE_COLORS.text;
  ctx.font = '17px Michroma';
  ctx.textAlign = 'left';
  ctx.fillText('REALITY.EXE', 32, 75);

  ctx.fillStyle = SPACE_COLORS.panelRaised;
  ctx.strokeStyle = SPACE_COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(310, 42, 198, 48, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = SPACE_COLORS.accent;
  ctx.beginPath();
  ctx.arc(328, 66, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = SPACE_COLORS.text;
  ctx.font = '12px Michroma';
  ctx.fillText(theme.shortName, 341, 70);
  drawSpaceVoiceIndicator(tick, speaking);

  if (result && result.timedOutTasks > 3) {
    drawSpaceFailure(result);
  } else if (result) {
    drawSpaceCompletion(result);
  } else {
    drawSpaceObjective();
  }
  drawSpaceCheckpoints(theme.checkpoints, Boolean(result) && !(result.timedOutTasks > 3));
}

function drawSpaceObjective() {
  drawSpacePanel(24, 344, 492, 250);
  ctx.fillStyle = SPACE_COLORS.accent;
  ctx.fillRect(50, 378, 4, 28);
  ctx.fillStyle = SPACE_COLORS.muted;
  ctx.font = '12px Michroma';
  ctx.fillText('OBJECTIVE', 68, 399);
  ctx.fillStyle = SPACE_COLORS.text;
  ctx.font = '23px Michroma';
  ctx.fillText('SHOW 3 OBJECTS', 50, 486);
}

function drawSpaceCompletion(completion) {
  drawSpacePanel(24, 300, 492, 476);
  ctx.fillStyle = SPACE_COLORS.accent;
  ctx.fillRect(50, 355, 4, 28);
  ctx.fillStyle = SPACE_COLORS.muted;
  ctx.font = '12px Michroma';
  ctx.fillText('MISSION COMPLETE', 68, 376);
  ctx.fillStyle = SPACE_COLORS.text;
  ctx.font = '24px Michroma';
  ctx.textAlign = 'center';
  drawCelebrationSparkle(70, 446, 8, SPACE_COLORS.accent);
  drawCelebrationSparkle(470, 446, 8, SPACE_COLORS.accent);
  ctx.fillText('CONGRATS, PILOT!', 270, 448);
  ctx.fillStyle = SPACE_COLORS.muted;
  ctx.font = '16px Michroma';
  ctx.fillText("YOU'VE RETURNED HOME", 270, 498);
  ctx.font = '11px Michroma';
  ctx.fillText('ALL OBJECTIVES SECURED', 270, 529);
  ctx.textAlign = 'left';

  drawCompletionStats(completion, drawSpacePanel, {
    labelFont: '10px Michroma',
    valueFont: '22px Michroma',
    labelColor: SPACE_COLORS.muted,
    valueColor: SPACE_COLORS.text,
  });
}

function drawSpaceFailure(result) {
  drawSpacePanel(24, 300, 492, 476);
  ctx.fillStyle = SPACE_COLORS.accent;
  ctx.fillRect(50, 355, 4, 28);
  ctx.fillStyle = SPACE_COLORS.muted;
  ctx.font = '12px Michroma';
  ctx.fillText('MISSION OVER', 68, 376);
  ctx.fillStyle = SPACE_COLORS.text;
  ctx.font = '24px Michroma';
  ctx.textAlign = 'center';
  ctx.fillText("TIME'S UP, PILOT!", 270, 448);
  ctx.fillStyle = SPACE_COLORS.muted;
  ctx.font = '13px Michroma';
  ctx.fillText('MISSION ENDED - TRY AGAIN!', 270, 498);
  ctx.font = '10px Michroma';
  ctx.fillText(timeoutSummary(result.timedOutTasks), 270, 529, 420);
  drawLostLives(270, 551, SPACE_COLORS.accent);
  ctx.textAlign = 'left';

  drawCompletionStats(result, drawSpacePanel, {
    labelFont: '10px Michroma',
    valueFont: '22px Michroma',
    labelColor: SPACE_COLORS.muted,
    valueColor: SPACE_COLORS.text,
  });
}

function drawSpaceCheckpoints(labels, completed) {
  drawSpacePanel(32, 884, 476, 196);
  ctx.fillStyle = SPACE_COLORS.muted;
  ctx.font = '13px Michroma';
  ctx.fillText('CHECKPOINTS', 58, 906);

  const checkpoints = labels.map((label, index) => ({
    label,
    x: 78 + index * 128,
    active: completed || index === 0,
  }));
  ctx.strokeStyle = SPACE_COLORS.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(checkpoints[0].x, 1009);
  ctx.lineTo(checkpoints[checkpoints.length - 1].x, 1009);
  ctx.stroke();

  checkpoints.forEach(({ label, x, active }) => {
    ctx.fillStyle = active ? SPACE_COLORS.accent : SPACE_COLORS.panel;
    ctx.strokeStyle = active ? SPACE_COLORS.accent : SPACE_COLORS.border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, 1009, active ? 9 : 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = active ? SPACE_COLORS.text : SPACE_COLORS.muted;
    ctx.font = '10px Michroma';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, 1047);
  });
  ctx.textAlign = 'left';
}

function drawCompletionStats(completion, drawPanel, styles) {
  drawPanel(58, 578, 204, 142);
  drawPanel(278, 578, 204, 142);

  ctx.textAlign = 'center';
  ctx.fillStyle = styles.labelColor;
  ctx.font = styles.labelFont;
  ctx.fillText('TASKS COMPLETED', 160, 620, 184);
  ctx.fillText('TOTAL TIME', 380, 620, 184);
  ctx.fillStyle = styles.valueColor;
  ctx.font = styles.valueFont;
  ctx.fillText(String(completion.tasksCompleted), 160, 682, 184);
  ctx.fillText(formatElapsedTime(completion.elapsedSeconds), 380, 682, 184);
  ctx.textAlign = 'left';
}

function drawCelebrationSparkle(x, y, radius, color) {
  const innerRadius = radius * 0.18;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - radius);
  ctx.lineTo(x + innerRadius, y - innerRadius);
  ctx.lineTo(x + radius, y);
  ctx.lineTo(x + innerRadius, y + innerRadius);
  ctx.lineTo(x, y + radius);
  ctx.lineTo(x - innerRadius, y + innerRadius);
  ctx.lineTo(x - radius, y);
  ctx.lineTo(x - innerRadius, y - innerRadius);
  ctx.closePath();
  ctx.fill();
}

function timeoutSummary(timeoutCount) {
  return `${timeoutCount} TIMEOUTS - 3 LIVES LOST`;
}

function drawLostLives(centerX, centerY, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  for (const offset of [-28, 0, 28]) {
    ctx.beginPath();
    ctx.moveTo(centerX + offset - 5, centerY - 5);
    ctx.lineTo(centerX + offset + 5, centerY + 5);
    ctx.moveTo(centerX + offset + 5, centerY - 5);
    ctx.lineTo(centerX + offset - 5, centerY + 5);
    ctx.stroke();
  }
}

function formatElapsedTime(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedMinutes = String(minutes).padStart(2, '0');
  const paddedSeconds = String(seconds).padStart(2, '0');
  return hours > 0
    ? `${hours}:${paddedMinutes}:${paddedSeconds}`
    : `${paddedMinutes}:${paddedSeconds}`;
}

function drawSpacePanel(x, y, width, height) {
  ctx.fillStyle = SPACE_COLORS.panel;
  ctx.strokeStyle = SPACE_COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 8);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = SPACE_COLORS.line;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 5, y + 5, width - 10, height - 10);
  ctx.fillStyle = SPACE_COLORS.accent;
  ctx.fillRect(x + width - 36, y, 36, 3);
}

function drawSpaceVoiceIndicator(tick, speaking) {
  for (let i = 0; i < 5; i++) {
    const height = speaking ? 5 + ((tick + i * 3) % 12) : 3;
    ctx.fillStyle = speaking ? SPACE_COLORS.accent : SPACE_COLORS.muted;
    ctx.fillRect(458 + i * 7, 66 - height / 2, 3, height);
  }
}

function drawBackrooms(tick, speaking, theme, result) {
  const blur = 5;
  const bleed = blur * 3;
  const scale = Math.max(
    (WIDTH + bleed * 2) / backroomsBackground.width,
    (HEIGHT + bleed * 2) / backroomsBackground.height,
  );
  const imageWidth = backroomsBackground.width * scale;
  const imageHeight = backroomsBackground.height * scale;
  ctx.save();
  ctx.filter = `blur(${blur}px)`;
  ctx.drawImage(
    backroomsBackground,
    (WIDTH - imageWidth) / 2,
    (HEIGHT - imageHeight) / 2,
    imageWidth,
    imageHeight,
  );
  ctx.restore();

  drawBackroomsPanel(24, 42, 235, 48);
  ctx.fillStyle = BACKROOMS_COLORS.text;
  ctx.font = '22px BackroomsSansBold';
  ctx.textAlign = 'left';
  ctx.fillText('REALITY.EXE', 32, 75);

  drawBackroomsPanel(310, 42, 198, 48);
  ctx.fillStyle = BACKROOMS_COLORS.accent;
  ctx.beginPath();
  ctx.arc(328, 66, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = BACKROOMS_COLORS.text;
  ctx.font = '16px BackroomsSansBold';
  ctx.fillText(theme.shortName, 341, 70);
  drawBackroomsVoiceIndicator(tick, speaking);

  if (result && result.timedOutTasks > 3) {
    drawBackroomsFailure(result);
  } else if (result) {
    drawBackroomsCompletion(result);
  } else {
    drawBackroomsObjective();
  }
  drawBackroomsCheckpoints(theme.checkpoints, Boolean(result) && !(result.timedOutTasks > 3));
}

function drawBackroomsObjective() {
  drawBackroomsPanel(24, 344, 492, 250);
  ctx.fillStyle = BACKROOMS_COLORS.accent;
  ctx.fillRect(50, 378, 4, 28);
  ctx.fillStyle = BACKROOMS_COLORS.muted;
  ctx.font = '17px BackroomsSansBold';
  ctx.fillText('OBJECTIVE', 68, 399);
  ctx.fillStyle = BACKROOMS_COLORS.text;
  ctx.font = '34px BackroomsSansBold';
  ctx.fillText('SHOW 3 OBJECTS', 50, 486);
}

function drawBackroomsCompletion(completion) {
  drawBackroomsPanel(24, 300, 492, 476);
  ctx.fillStyle = BACKROOMS_COLORS.accent;
  ctx.fillRect(50, 355, 4, 28);
  ctx.fillStyle = BACKROOMS_COLORS.muted;
  ctx.font = '17px BackroomsSansBold';
  ctx.fillText('ESCAPE COMPLETE', 68, 378);
  ctx.fillStyle = BACKROOMS_COLORS.text;
  ctx.font = '43px BackroomsSansBold';
  ctx.textAlign = 'center';
  drawCelebrationSparkle(70, 446, 8, BACKROOMS_COLORS.accent);
  drawCelebrationSparkle(470, 446, 8, BACKROOMS_COLORS.accent);
  ctx.fillText("YOU'VE ESCAPED!", 270, 448);
  ctx.fillStyle = BACKROOMS_COLORS.muted;
  ctx.font = '25px BackroomsSansBold';
  ctx.fillText('CONGRATS, EXPLORER!', 270, 498);
  ctx.font = '17px BackroomsSans';
  ctx.fillText('YOU FOUND YOUR WAY OUT', 270, 529);
  ctx.textAlign = 'left';

  drawCompletionStats(completion, drawBackroomsPanel, {
    labelFont: '16px BackroomsSansBold',
    valueFont: '31px BackroomsSansBold',
    labelColor: BACKROOMS_COLORS.muted,
    valueColor: BACKROOMS_COLORS.text,
  });
}

function drawBackroomsFailure(result) {
  drawBackroomsPanel(24, 300, 492, 476);
  ctx.fillStyle = BACKROOMS_COLORS.accent;
  ctx.fillRect(50, 355, 4, 28);
  ctx.fillStyle = BACKROOMS_COLORS.muted;
  ctx.font = '17px BackroomsSansBold';
  ctx.fillText('GAME OVER', 68, 378);
  ctx.fillStyle = BACKROOMS_COLORS.text;
  ctx.font = '43px BackroomsSansBold';
  ctx.textAlign = 'center';
  ctx.fillText("TIME'S UP!", 270, 448);
  ctx.fillStyle = BACKROOMS_COLORS.muted;
  ctx.font = '22px BackroomsSansBold';
  ctx.fillText('THE EXIT SLIPPED AWAY!', 270, 498);
  ctx.font = '15px BackroomsSans';
  ctx.fillText(timeoutSummary(result.timedOutTasks), 270, 529, 420);
  drawLostLives(270, 551, BACKROOMS_COLORS.accent);
  ctx.textAlign = 'left';

  drawCompletionStats(result, drawBackroomsPanel, {
    labelFont: '16px BackroomsSansBold',
    valueFont: '31px BackroomsSansBold',
    labelColor: BACKROOMS_COLORS.muted,
    valueColor: BACKROOMS_COLORS.text,
  });
}

function drawBackroomsCheckpoints(labels, completed) {
  drawBackroomsPanel(32, 884, 476, 196);
  ctx.fillStyle = BACKROOMS_COLORS.muted;
  ctx.font = '16px BackroomsSansBold';
  ctx.fillText('CHECKPOINTS', 58, 906);

  const checkpoints = labels.map((label, index) => ({
    label,
    x: 78 + index * 128,
    active: completed || index === 0,
  }));
  ctx.strokeStyle = BACKROOMS_COLORS.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(checkpoints[0].x, 1009);
  ctx.lineTo(checkpoints[checkpoints.length - 1].x, 1009);
  ctx.stroke();

  checkpoints.forEach(({ label, x, active }) => {
    ctx.fillStyle = active ? BACKROOMS_COLORS.accent : BACKROOMS_COLORS.panel;
    ctx.strokeStyle = active ? BACKROOMS_COLORS.accent : BACKROOMS_COLORS.border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, 1009, active ? 9 : 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = BACKROOMS_COLORS.text;
    ctx.font = '14px BackroomsSans';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, 1047);
  });
  ctx.textAlign = 'left';
}

function drawBackroomsPanel(x, y, width, height) {
  ctx.fillStyle = BACKROOMS_COLORS.panel;
  ctx.strokeStyle = BACKROOMS_COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 5);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = BACKROOMS_COLORS.line;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 5, y + 5, width - 10, height - 10);
}

function drawBackroomsVoiceIndicator(tick, speaking) {
  for (let i = 0; i < 5; i++) {
    const height = speaking ? 5 + ((tick + i * 3) % 12) : 3;
    ctx.fillStyle = speaking ? BACKROOMS_COLORS.accent : BACKROOMS_COLORS.muted;
    ctx.fillRect(458 + i * 7, 66 - height / 2, 3, height);
  }
}

function drawOdyssey(tick, speaking, theme, result) {
  const scale = Math.max(WIDTH / odysseyBackground.width, HEIGHT / odysseyBackground.height);
  const imageWidth = odysseyBackground.width * scale;
  const imageHeight = odysseyBackground.height * scale;
  ctx.drawImage(
    odysseyBackground,
    (WIDTH - imageWidth) / 2,
    (HEIGHT - imageHeight) / 2,
    imageWidth,
    imageHeight,
  );
  drawOdysseyFrame();

  ctx.fillStyle = ODYSSEY_COLORS.text;
  ctx.font = '26px GFSDidot';
  ctx.textAlign = 'left';
  ctx.fillText('REALITY.EXE', 38, 72);
  ctx.textAlign = 'center';
  ctx.font = '24px GFSDidot';
  ctx.fillText(theme.name, 354, 72);
  ctx.textAlign = 'left';
  drawOdysseyVoiceIndicator(tick, speaking);

  if (result && result.timedOutTasks > 3) {
    drawOdysseyFailure(result);
  } else if (result) {
    drawOdysseyCompletion(result);
  } else {
    drawOdysseyObjective(theme);
  }
  drawOdysseyCheckpoints(theme.checkpoints, Boolean(result) && !(result.timedOutTasks > 3));
}

function drawOdysseyObjective(theme) {
  drawOdysseyPanel(32, 300, 476, 476);
  drawGreekMeander(54, 314, 432, 15, ODYSSEY_COLORS.border);
  ctx.fillStyle = ODYSSEY_COLORS.muted;
  ctx.font = '20px GFSDidot';
  ctx.fillText('OBJECTIVES', 58, 379);
  ctx.fillStyle = ODYSSEY_COLORS.text;
  ctx.font = '38px GFSDidot';
  ctx.fillText('SHOW 3 OBJECTS', 54, 445);
  ctx.strokeStyle = ODYSSEY_COLORS.borderLight;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(58, 475);
  ctx.lineTo(482, 475);
  ctx.stroke();
  drawOdysseyMissions(theme.missions);
  drawGreekMeander(54, 747, 432, 15, ODYSSEY_COLORS.border);
}

function drawOdysseyCompletion(completion) {
  drawOdysseyPanel(32, 300, 476, 476);
  drawGreekMeander(54, 314, 432, 15, ODYSSEY_COLORS.border);
  ctx.fillStyle = ODYSSEY_COLORS.muted;
  ctx.font = '22px GFSDidot';
  ctx.fillText('VOYAGE COMPLETE!', 58, 379);
  ctx.fillStyle = ODYSSEY_COLORS.text;
  ctx.font = '39px GFSDidot';
  ctx.textAlign = 'center';
  drawCelebrationSparkle(70, 446, 8, ODYSSEY_COLORS.active);
  drawCelebrationSparkle(470, 446, 8, ODYSSEY_COLORS.active);
  ctx.fillText('CONGRATS, HERO!', 270, 448);
  ctx.fillStyle = ODYSSEY_COLORS.muted;
  ctx.font = '25px GFSDidot';
  ctx.fillText("YOU'VE RETURNED HOME", 270, 496);
  ctx.font = '18px GFSDidot';
  ctx.fillText('YOUR JOURNEY IS COMPLETE', 270, 530);
  ctx.textAlign = 'left';
  ctx.strokeStyle = ODYSSEY_COLORS.borderLight;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(58, 546);
  ctx.lineTo(482, 546);
  ctx.stroke();
  drawCompletionStats(completion, drawOdysseyPanel, {
    labelFont: '18px GFSDidot',
    valueFont: '28px GFSDidot',
    labelColor: ODYSSEY_COLORS.muted,
    valueColor: ODYSSEY_COLORS.text,
  });
  drawGreekMeander(54, 747, 432, 15, ODYSSEY_COLORS.border);
}

function drawOdysseyFailure(result) {
  drawOdysseyPanel(32, 300, 476, 476);
  drawGreekMeander(54, 314, 432, 15, ODYSSEY_COLORS.border);
  ctx.fillStyle = ODYSSEY_COLORS.muted;
  ctx.font = '22px GFSDidot';
  ctx.fillText('OUT OF TIME', 58, 379);
  ctx.fillStyle = ODYSSEY_COLORS.text;
  ctx.font = '39px GFSDidot';
  ctx.textAlign = 'center';
  ctx.fillText('VOYAGE OVER, HERO!', 270, 448);
  ctx.fillStyle = ODYSSEY_COLORS.muted;
  ctx.font = '23px GFSDidot';
  ctx.fillText("TIME'S UP - TRY AGAIN!", 270, 496);
  ctx.font = '16px GFSDidot';
  ctx.fillText(timeoutSummary(result.timedOutTasks), 270, 529, 420);
  drawLostLives(270, 551, ODYSSEY_COLORS.border);
  ctx.textAlign = 'left';
  ctx.strokeStyle = ODYSSEY_COLORS.borderLight;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(58, 540);
  ctx.lineTo(482, 540);
  ctx.stroke();
  drawCompletionStats(result, drawOdysseyPanel, {
    labelFont: '18px GFSDidot',
    valueFont: '28px GFSDidot',
    labelColor: ODYSSEY_COLORS.muted,
    valueColor: ODYSSEY_COLORS.text,
  });
  drawGreekMeander(54, 747, 432, 15, ODYSSEY_COLORS.border);
}

function drawOdysseyCheckpoints(labels, completed) {
  drawOdysseyPanel(32, 884, 476, 196);
  ctx.fillStyle = ODYSSEY_COLORS.muted;
  ctx.font = '20px GFSDidot';
  ctx.fillText('CHECKPOINTS', 58, 906);
  drawGreekMeander(54, 934, 432, 12, ODYSSEY_COLORS.border);

  const checkpoints = labels.map((label, index) => ({
    label,
    x: 78 + index * 128,
    active: completed || index === 0,
  }));
  ctx.strokeStyle = ODYSSEY_COLORS.borderLight;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(checkpoints[0].x, 1009);
  ctx.lineTo(checkpoints[checkpoints.length - 1].x, 1009);
  ctx.stroke();
  checkpoints.forEach(({ label, x, active }) => {
    ctx.fillStyle = active ? ODYSSEY_COLORS.active : ODYSSEY_COLORS.paperLight;
    ctx.strokeStyle = active ? ODYSSEY_COLORS.active : ODYSSEY_COLORS.border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, 1009, active ? 9 : 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = active ? ODYSSEY_COLORS.text : ODYSSEY_COLORS.muted;
    ctx.font = '16px GFSDidot';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, 1047);
  });
  ctx.textAlign = 'left';
}

function drawOdysseyFrame() {
  ctx.strokeStyle = ODYSSEY_COLORS.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 16, WIDTH - 32, HEIGHT - 32);
  ctx.strokeStyle = ODYSSEY_COLORS.borderLight;
  ctx.lineWidth = 1;
  ctx.strokeRect(23, 23, WIDTH - 46, HEIGHT - 46);
  drawGreekMeander(54, 112, 432, 16, ODYSSEY_COLORS.border);
  drawGreekMeander(54, 1094, 432, 16, ODYSSEY_COLORS.border);
}

function drawGreekMeander(x, y, width, height, color) {
  const step = 18;
  const count = Math.floor(width / step);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'miter';
  for (let i = 0; i < count; i++) {
    const left = x + i * step;
    ctx.beginPath();
    ctx.moveTo(left, y + height);
    ctx.lineTo(left, y);
    ctx.lineTo(left + step, y);
    ctx.lineTo(left + step, y + height);
    ctx.lineTo(left + 4, y + height);
    ctx.lineTo(left + 4, y + 4);
    ctx.lineTo(left + step - 4, y + 4);
    ctx.lineTo(left + step - 4, y + height - 4);
    ctx.stroke();
  }
}

function drawOdysseyPanel(x, y, width, height) {
  ctx.fillStyle = ODYSSEY_COLORS.paperLight;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = ODYSSEY_COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, width, height);
  ctx.strokeStyle = ODYSSEY_COLORS.borderLight;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 5, y + 5, width - 10, height - 10);
}

function drawOdysseyVoiceIndicator(tick, speaking) {
  for (let i = 0; i < 5; i++) {
    const height = speaking ? 5 + ((tick + i * 3) % 12) : 3;
    ctx.fillStyle = speaking ? ODYSSEY_COLORS.active : ODYSSEY_COLORS.muted;
    ctx.fillRect(458 + i * 7, 66 - height / 2, 3, height);
  }
}

function drawOdysseyMissions(missions) {
  ctx.font = '25px GFSDidot';
  missions.forEach((mission, index) => {
    const y = 528 + index * 48;
    ctx.fillStyle = ODYSSEY_COLORS.active;
    ctx.beginPath();
    ctx.arc(72, y - 8, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ODYSSEY_COLORS.text;
    ctx.fillText(mission, 90, y);
  });
}

function drawThemeSelection() {
  drawPanel(24, 260, 492, 512);
  ctx.fillStyle = COLORS.cyan;
  ctx.fillRect(50, 286, 4, 28);
  ctx.fillStyle = COLORS.text;
  ctx.font = '700 18px Orbitron';
  ctx.fillText('CHOOSE YOUR WORLD', 68, 308);

  const choices = [
    { id: '01', ...THEMES.space, image: spaceBackground, cropX: 0, cropY: 210, cropWidth: 520 },
    { id: '02', ...THEMES.odyssey, image: odysseyBackground, cropX: 0, cropY: 245, cropWidth: 430 },
    { id: '03', ...THEMES.backrooms, image: backroomsBackground, cropX: 0, cropY: 430, cropWidth: 720 },
  ];
  choices.forEach(({ id, name, description, image, cropX, cropY, cropWidth }, index) => {
    const y = 334 + index * 136;
    drawThemeChoiceCard(image, cropX, cropY, cropWidth, 50, y, 440, 112);
    ctx.fillStyle = COLORS.cyan;
    ctx.font = '700 14px Orbitron';
    ctx.fillText(id, 72, y + 34);
    ctx.fillStyle = COLORS.text;
    ctx.font = '700 20px Orbitron';
    ctx.fillText(name, 116, y + 39);
    ctx.fillStyle = COLORS.muted;
    ctx.font = '12px Orbitron';
    ctx.fillText(description, 116, y + 72);
  });
}

function drawThemeChoiceCard(image, cropX, cropY, cropWidth, x, y, width, height) {
  const sourceHeight = cropWidth * height / width;
  const boundedY = Math.max(0, Math.min(cropY, image.height - sourceHeight));
  const bleed = 9;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 12);
  ctx.clip();
  ctx.filter = 'blur(2px)';
  ctx.drawImage(
    image,
    cropX,
    boundedY,
    cropWidth,
    sourceHeight,
    x - bleed,
    y - bleed,
    width + bleed * 2,
    height + bleed * 2,
  );
  ctx.filter = 'none';
  const shade = ctx.createLinearGradient(x, y, x + width, y);
  shade.addColorStop(0, 'rgba(7, 19, 29, 0.60)');
  shade.addColorStop(0.55, 'rgba(7, 19, 29, 0.42)');
  shade.addColorStop(1, 'rgba(7, 19, 29, 0.24)');
  ctx.fillStyle = shade;
  ctx.fillRect(x, y, width, height);
  ctx.restore();

  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 12);
  ctx.stroke();
}

function drawObjective() {
  drawPanel(24, 344, 492, 250);
  ctx.fillStyle = COLORS.cyan;
  ctx.fillRect(50, 378, 4, 28);
  ctx.fillStyle = COLORS.muted;
  ctx.font = '700 18px Orbitron';
  ctx.fillText('OBJECTIVE', 68, 399);
  ctx.fillStyle = COLORS.text;
  ctx.font = '700 42px Orbitron';
  ctx.fillText('SHOW 3 OBJECTS', 50, 490);
}

function drawCheckpoints(labels) {
  ctx.fillStyle = COLORS.muted;
  ctx.font = '700 16px Orbitron';
  ctx.fillText('CHECKPOINTS', 58, 906);
  drawPanel(32, 926, 476, 154);

  const checkpoints = labels.map((label, index) => ({
    label,
    x: 78 + index * 128,
    active: index === 0,
  }));
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
