import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import { buildRoutineUiDemo } from './routine-ui-demo.mjs';
import { renderRoutineFrame } from './routine-game-hud.mjs';

const findState = (states, name, predicate) => {
  const state = states.find(predicate);
  if (!state) throw new Error(`Missing simulated ${name} state`);
  return state;
};

async function writeNew(path, contents, options = {}) {
  await writeFile(path, contents, { flag: 'wx', ...options });
}

export async function writeRoutineGif(frames, output, delays) {
  const frameDelays = Array.isArray(delays) ? delays : Array(frames.length).fill(delays);
  if (frameDelays.length !== frames.length) {
    throw new Error('GIF delay count must match frame count');
  }
  await sharp(Buffer.concat(frames), {
    raw: { width: 540, height: 960 * frames.length, pageHeight: 960, channels: 4 },
  }).gif({ delay: frameDelays, loop: 0 }).toFile(output);
}

export async function generateFinalDemoAssets(directory = '.local/final-demo/qa') {
  const output = resolve(directory);
  const allowedRoot = resolve('.local/final-demo');
  if (output === allowedRoot || !output.startsWith(`${allowedRoot}${sep}`)) {
    throw new Error('Final demo assets must stay under .local/final-demo in a new directory');
  }
  await mkdir(dirname(output), { recursive: true, mode: 0o700 });
  await mkdir(output, { mode: 0o700 });

  const partial = await buildRoutineUiDemo({ missSecondStep: true });
  const full = await buildRoutineUiDemo({ missSecondStep: false });
  const partialStates = partial.states;
  const fullStates = full.states;
  const snapshots = [
    ['welcome', findState(partialStates, 'welcome', s => s.pauseReasons.includes('not_started'))],
    ['scanning', findState(partialStates, 'scanning', s => s.currentStep === null && !s.pauseReasons.length)],
    ['listening', findState(partialStates, 'listening', s => s.currentStep === 1 && s.uiState === 'in_progress')],
    ['speaking', findState(partialStates, 'speaking', s => s.currentStep === 1 && s.uiState === 'in_progress'), true],
    ['mission-1', findState(partialStates, 'mission 1', s => s.currentStep === 1 && s.uiState === 'in_progress')],
    ['verifying', findState(partialStates, 'verifying', s => s.currentStep === 1 && s.verificationStatus === 'pending')],
    ['confirmation', findState(partialStates, 'confirmation', s => s.currentStep === 1 && s.verificationStatus === 'observed')],
    ['success', findState(partialStates, 'success', s => s.routineEvent.name === 'mission_verified')],
    ['retry', findState(partialStates, 'retry', s => s.routineEvent.name === 'evidence_retry')],
    ['uncertain', findState(partialStates, 'uncertain', s => s.routineEvent.name === 'evidence_uncertain')],
    ['mission-2', findState(partialStates, 'mission 2', s => s.currentStep === 2 && s.uiState === 'in_progress')],
    ['pause', findState(partialStates, 'pause', s => s.routineEvent.name === 'routine_paused')],
    ['timeout', findState(partialStates, 'timeout', s => s.routineEvent.name === 'mission_missed')],
    ['mission-3', findState(partialStates, 'mission 3', s => s.currentStep === 3 && s.uiState === 'in_progress')],
    ['partial-completion', partialStates.at(-1)],
    ['full-completion', fullStates.at(-1)],
  ];

  const rendered = [];
  for (const [index, [name, state, speaking = false]] of snapshots.entries()) {
    const { pixels, screen, layout, textRuns } = renderRoutineFrame(state, {
      width: 540, height: 960, tick: 0, speaking, captureText: true,
    });
    const file = `${String(index + 1).padStart(2, '0')}-${name}.png`;
    const image = sharp(pixels, { raw: { width: 540, height: 960, channels: 4 } });
    await image.clone().png().toFile(resolve(output, file));
    await image.clone().resize(360, 640).png().toFile(resolve(output, `phone-${file}`));
    rendered.push({ name, file, screen, width: 540, height: 960, rotation: 0, layout, textRuns, state });
  }

  const partialFrames = rendered.map(frame => Buffer.from(
    renderRoutineFrame(frame.state, { speaking: frame.name === 'speaking' }).pixels));
  await writeRoutineGif(partialFrames, resolve(output, 'partial-walkthrough.gif'), 1200);

  const fullSequence = [
    fullStates.find(s => s.pauseReasons.includes('not_started')),
    fullStates.find(s => s.currentStep === null && !s.pauseReasons.length),
    ...[1, 2, 3].flatMap(step => [
      findState(fullStates, `mission ${step}`, s => s.currentStep === step && s.uiState === 'in_progress'),
      findState(fullStates, `verification ${step}`, s => s.currentStep === step && s.verificationStatus === 'pending'),
      findState(fullStates, `success ${step}`, s => s.routineEvent.name === 'mission_verified' && s.lastOutcome?.stepIndex === step - 1),
    ]),
    fullStates.at(-1),
  ];
  const fullFrames = fullSequence.map(state => Buffer.from(renderRoutineFrame(state).pixels));
  await writeRoutineGif(fullFrames, resolve(output, 'full-walkthrough.gif'), 1200);
  const checking = findState(partialStates, 'checking', s => s.currentStep === 1 && s.verificationStatus === 'pending');
  const animationFrames = Array.from({ length: 30 }, (_, tick) =>
    Buffer.from(renderRoutineFrame(checking, { tick }).pixels));
  await writeRoutineGif(animationFrames, resolve(output, 'checking-15fps.gif'),
    animationFrames.map((_, index) => index % 3 === 0 ? 60 : 70));

  const thumbnails = await Promise.all(rendered.map(frame =>
    sharp(resolve(output, frame.file)).resize(180, 320).png().toBuffer()));
  await sharp({ create: { width: 720, height: 1280, channels: 4, background: '#0a1029' } })
    .composite(thumbnails.map((input, index) => ({
      input, left: index % 4 * 180, top: Math.floor(index / 4) * 320,
    }))).png().toFile(resolve(output, 'contact-sheet.png'));

  const report = full.report;
  if (!report?.complete || report.steps.length !== 3 || report.steps.some(step => step.status !== 'done')) {
    throw new Error('Simulated full run did not produce three completed engine steps');
  }
  const safeReport = {
    scope: 'MOCK_SIMULATION_ONLY',
    routineId: report.routineId,
    routineName: report.routineName,
    complete: report.complete,
    verification: 'mock',
    realWorldVerification: false,
    providerCalls: 0,
    faceTimeCalls: 0,
    doneCount: report.steps.filter(step => step.status === 'done').length,
    totalSteps: report.steps.length,
    steps: report.steps.map(({ label, status, seconds }) => ({ label, status, seconds })),
  };
  await writeNew(resolve(output, 'mock-completion-report.json'),
    `${JSON.stringify(safeReport, null, 2)}\n`, { mode: 0o600 });
  await writeNew(resolve(output, 'manifest.json'), `${JSON.stringify({
    scope: 'MOCK_ROUTINE_GAME_VISUAL_QA',
    providerCalls: 0,
    faceTimeCalls: 0,
    realWorldVerification: false,
    frames: rendered,
  }, null, 2)}\n`, { mode: 0o600 });

  const titles = JSON.stringify(rendered.map(frame => frame.name));
  const files = JSON.stringify(rendered.map(frame => frame.file));
  await writeNew(resolve(output, 'index.html'), `<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reality.exe · offline routine demo</title>
<style>
body{margin:0;min-height:100vh;box-sizing:border-box;background:#080f24;color:#eaf0ff;font:18px system-ui;display:grid;justify-items:center;align-content:start;padding:20px;gap:12px}
img{display:block;width:min(360px,92vw);height:auto;border-radius:26px;border:1px solid #66749b}
button,select{font:inherit;padding:10px;border-radius:12px;background:#20335a;color:white;border:1px solid #7789b0}
p{max-width:600px;text-align:center;color:#b9c8e8;margin:4px}
</style>
<h1>Reality.exe · morning missions</h1>
<p><strong>OFFLINE MOCK</strong> · simulated engine states and scripted perception; no FaceTime or provider requests.</p>
<div><button id="play" type="button">Play sequence</button>
<select id="states" aria-label="Gameplay state"></select></div>
<img id="frame" alt="Portrait routine game preview">
<p>Native 540×960 source, displayed at 360×640. Real iPhone orientation and FaceTime safe areas are not verified.</p>
<script>
const names=${titles},files=${files},select=document.getElementById('states'),img=document.getElementById('frame');
let index=0,timer;
names.forEach((name,i)=>{const option=document.createElement('option');option.textContent=name;option.value=i;select.append(option)});
function show(){select.value=index;img.src=files[index];img.alt=names[index]+' routine game screen'}
select.onchange=()=>{clearInterval(timer);index=Number(select.value);show()};
document.getElementById('play').onclick=()=>{clearInterval(timer);index=0;show();timer=setInterval(()=>{index=(index+1)%names.length;show()},1500)};
show();
</script></html>\n`, { mode: 0o600 });

  return {
    directory: relative(process.cwd(), output),
    frames: rendered.length,
    partialStatuses: partial.summary.statuses,
    fullStatuses: full.summary.statuses,
    completionReport: relative(process.cwd(), resolve(output, 'mock-completion-report.json')),
    providerCalls: 0,
    faceTimeCalls: 0,
    realWorldVerification: false,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { out: { type: 'string', default: '.local/final-demo/qa' } } });
  console.log(JSON.stringify(await generateFinalDemoAssets(values.out)));
}
