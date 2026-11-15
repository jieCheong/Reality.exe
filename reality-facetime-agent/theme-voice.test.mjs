import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { SpeechCoordinator, SpeechInterrupted, sessionSpeechOutput } from './speech-coordinator.mjs';
import { ThemeSelection, validateThemes, matchTheme } from './theme-selection.mjs';
import { THEMES } from './themes.mjs';
import { GameRuntime } from './game-runtime.mjs';

// Test content only. None of these names are available in the production registry.
const fixtures = [
  { id: 'mock-a', name: 'Mock Alpha', aliases: ['alpha'], intro: 'Test introduction.', missionIntros: { POWER: 'Test power narration.' } },
  { id: 'mock-b', name: 'Mock Beta', aliases: ['beta'] },
  { id: 'mock-c', name: 'Mock Gamma', aliases: ['gamma'] },
];
const flush = () => new Promise(resolve => setImmediate(resolve));
let item = 0;
const transcript = (text, isFinal = true) => ({ transcript: text, isFinal, itemId: `mock-${++item}`, createdAt: Date.now() });
function setup({ speak, interrupt } = {}) {
  const spoken = [], calls = [];
  const speech = new SpeechCoordinator({ speak: speak || (async text => spoken.push(text)), interrupt });
  const game = { started: false, engine: { instruction: () => 'Test mission.' },
    setTheme(theme) { calls.push(theme.id); }, start() { this.started = true; calls.push('start'); },
    announce() { calls.push('repeat'); }, pause() { calls.push('pause'); }, async close() {} };
  const flow = new ThemeSelection({ themes: fixtures, speech, game });
  return { flow, speech, game, spoken, calls };
}

test('production has no placeholder themes; invalid or ambiguous catalogs fail closed', async () => {
  assert.deepEqual(THEMES, []);
  assert.throws(() => validateThemes([]), /three/);
  assert.throws(() => validateThemes([fixtures[0], fixtures[0], fixtures[2]]), /duplicate/);
  assert.throws(() => validateThemes([fixtures[0], { ...fixtures[1], aliases: ['alpha'] }, fixtures[2]]), /Ambiguous/);
  const f = setup(); f.flow.rawThemes = THEMES;
  await f.flow.start();
  assert.equal(f.flow.state, 'unconfigured'); assert.equal(f.game.started, false);
  await f.flow.handleTranscript(transcript('one')); assert.equal(f.game.started, false);
  await f.flow.close();
});

test('spoken number/name selection requires explicit confirmation and starts once', async () => {
  const f = setup(); await f.flow.start();
  assert.equal(f.flow.state, 'choosing'); assert.equal(f.game.started, false);
  await f.flow.handleTranscript(transcript('one or two'));
  await f.flow.handleTranscript(transcript('alpha', false));
  assert.equal(f.flow.state, 'choosing');
  await f.flow.handleTranscript(transcript('I choose alpha'));
  assert.equal(f.flow.state, 'confirming'); assert.equal(f.game.started, false);
  const event = transcript('yes'); await f.flow.handleTranscript(event); await f.flow.handleTranscript(event);
  assert.equal(f.flow.state, 'running'); assert.deepEqual(f.calls, ['mock-a', 'start']);
  await f.flow.handleTranscript(transcript('two')); assert.deepEqual(f.calls, ['mock-a','start']);
  assert.ok(f.spoken[0].includes('Mock Alpha') && f.spoken[0].includes('Mock Gamma'));
  await f.flow.close();
});

test('declining a choice returns to the menu; partial and unrelated speech never starts', async () => {
  const f = setup(); await f.flow.start();
  await f.flow.handleTranscript(transcript('two'));
  await f.flow.handleTranscript(transcript('no'));
  assert.equal(f.flow.state, 'choosing'); assert.equal(f.flow.candidate, null);
  await f.flow.handleTranscript(transcript('three'));
  await f.flow.handleTranscript(transcript('yes or no'));
  assert.equal(f.game.started, false);
  assert.equal(matchTheme('option second', validateThemes(fixtures)).id, 'mock-b');
  await f.flow.close();
});

test('failed confirmation speech pauses selection and requires a fresh yes after retry', async () => {
  let failure = false;
  const f = setup({ speak: async () => { if (failure) throw new Error('mock TTS failure'); } });
  await f.flow.start(); await f.flow.handleTranscript(transcript('beta'));
  failure = true; await f.flow.handleTranscript(transcript('yes'));
  assert.equal(f.flow.state, 'paused'); assert.equal(f.game.started, false);
  failure = false; await f.flow.handleTranscript(transcript('repeat'));
  assert.equal(f.flow.state, 'confirming'); assert.equal(f.game.started, false);
  await f.flow.handleTranscript(transcript('yes')); assert.equal(f.game.started, true);
  await f.flow.close();
});

test('stop during confirmation cannot start a game from an obsolete playout promise', async () => {
  let finish, blocked = false;
  const f = setup({ speak: async () => { if (blocked) await new Promise(resolve => { finish = resolve; }); }, interrupt: async () => { finish?.(); } });
  await f.flow.start(); await f.flow.handleTranscript(transcript('one'));
  blocked = true; const confirming = f.flow.handleTranscript(transcript('yes')); await flush();
  await f.flow.handleTranscript(transcript('stop')); await confirming;
  assert.equal(f.flow.state, 'paused'); assert.equal(f.game.started, false);
  blocked = false; await f.flow.handleTranscript(transcript('resume'));
  assert.equal(f.flow.state, 'confirming'); assert.equal(f.game.started, false);
  await f.flow.close();
});

test('speech lane serializes utterances, coalesces duplicates, and retries only on request', async () => {
  const resolvers = []; let active = 0, maximum = 0;
  const speech = new SpeechCoordinator({ speak: async () => { maximum = Math.max(maximum, ++active); await new Promise(r => resolvers.push(r)); active--; } });
  const first = speech.say('first'); const duplicate = speech.say('first'); const second = speech.say('second');
  assert.equal(first, duplicate); assert.equal(active, 1);
  resolvers.shift()(); await first; await flush(); assert.equal(active, 1);
  resolvers.shift()(); await second; assert.equal(maximum, 1);
  await speech.say('second'); assert.equal(resolvers.length, 0, 'recent completed phrase is suppressed');
  await speech.close();
});

test('session speaker detects interrupted and failed SpeechHandles', async () => {
  for (const mode of ['interrupted','failed']) {
    const output = sessionSpeechOutput({ say: () => ({ waitForPlayout: async () => {}, interrupted: mode === 'interrupted',
      done: () => true, exception: () => mode === 'failed' ? new Error('mock') : null }) });
    await assert.rejects(output.speak('test'), mode === 'interrupted' ? SpeechInterrupted : Error);
  }
});

test('theme is narration-only; mission authority, voice-failure gating and resume remain deterministic', async () => {
  const camera = new EventEmitter(); camera.isCurrent = () => true;
  let fail = true; const spoken = [];
  const speech = new SpeechCoordinator({ speak: async text => { spoken.push(text); if (fail) throw new Error('mock speech failure'); } });
  const runtime = new GameRuntime({ callerVideo: camera, hud: { setState() {} }, say: (text, options) => speech.say(text, options),
    vision: { allowMock: true }, now: () => 1000 });
  runtime.setTheme(validateThemes(fixtures)[0]); runtime.start({ auto: false }); await runtime.speech;
  assert.equal(runtime.voiceFailed, true); assert.equal(await runtime.tick(), false); assert.equal(runtime.engine.phase, 'SCAN');
  fail = false; await runtime.announce(runtime.engine.instruction(), { force: true });
  assert.equal(runtime.voiceFailed, false); assert.equal(runtime.notBefore, 1000);
  runtime.pause(); assert.equal(runtime.notBefore, Infinity);
  await runtime.announce(runtime.engine.instruction(), { force: true });
  assert.equal(runtime.engine.apply(runtime.engine.request(), { status: 'checked', satisfied: true }), false);
  assert.equal(runtime.engine.phase, 'SCAN');
  await runtime.speech; await runtime.close(); await speech.close();
});

test('mock confirmed theme flows through every deterministic mission with one speech lane', async () => {
  const camera = new EventEmitter(); camera.isCurrent = () => true;
  let clock = 1000, sequence = 0, requests = 0;
  const spoken = [], hud = [];
  const speech = new SpeechCoordinator({ speak: async text => spoken.push(text), now: () => clock });
  const vision = { allowMock: true, newRequestId: () => `mock-${++requests}`, async analyze(request) {
    if (request.operation === 'inventory') return { status: 'checked', objects: ['bottle','notebook','pen'].map((name, i) =>
      ({ name, description: name, box_2d: [100,100+i*200,300,200+i*200] })) };
    return { status: 'checked', predicate: request.predicate, satisfied: true, votes_for: 3, votes_total: 3,
      frame_verdicts: [0,1,2].map(frame_index => ({ frame_index, satisfied: true, confidence: .95 })) };
  } };
  const game = new GameRuntime({ callerVideo: camera, hud: { setState: update => hud.push(update.gameState) },
    say: (text, options) => speech.say(text, options), vision, now: () => clock, intervalMs: 0,
    encode: async f => Buffer.from(`mock-${f.sequence}`) });
  const start = game.start.bind(game); game.start = () => start({ auto: false });
  const flow = new ThemeSelection({ themes: fixtures, speech, game });
  await flow.start(); assert.equal(await game.tick(), false); assert.equal(requests, 0);
  await flow.handleTranscript(transcript('one')); await flow.handleTranscript(transcript('yes')); await game.speech;
  for (let round=0;round<8;round++) {
    for (let i=0;i<3;i++) { clock += 220; camera.emit('frame', { sequence: ++sequence, generation: 1, capturedAtMs: clock }); }
    await game.tick(); await game.speech;
  }
  assert.equal(game.engine.escaped, true); assert.equal(hud.at(-1).missionProgress, 1);
  assert.equal(spoken.filter(text => text.includes('Test power narration.')).length, 1);
  assert.equal(spoken.filter(text => text.includes('Escape complete')).length, 1);
  assert.equal(game.theme.id, 'mock-a');
  await flow.close();
});
