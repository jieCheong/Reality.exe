import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import { GameRuntime } from './game-runtime.mjs';
import { VisionClient } from './vision-client.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('MOCK end-to-end: camera → JPEG → local Python perception/voting → missions → HUD + scripted voice', { timeout: 30000 }, async () => {
  const python = spawn(process.env.VISION_PYTHON || 'python3', ['vision-service/bridge.py', '--provider', 'mock', '--port', '0'], {
    stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  let runtime;
  const exited = once(python, 'exit');
  const lines = createInterface({ input: python.stdout });
  try {
    const ready = await Promise.race([
      once(lines, 'line').then(([line]) => JSON.parse(line)),
      exited.then(() => { throw new Error('Python mock service exited before startup; install vision-service/requirements.txt and set VISION_PYTHON'); }),
      sleep(5000).then(() => { throw new Error('Python service startup timeout'); }),
    ]);
    const camera = new EventEmitter(); camera.isCurrent = f => f.generation === 1;
    const states = [], spoken = [], replies = [];
    const vision = new VisionClient({ url: `http://127.0.0.1:${ready.port}`, allowMock: true });
    let scenario;
    const analyze = vision.analyze.bind(vision);
    vision.analyze = async (request, signal) => {
      const result = await analyze({ ...request, ...(scenario ? { mockScenario: scenario } : {}) }, signal);
      replies.push(result); return result;
    };
    runtime = new GameRuntime({ callerVideo: camera, hud: { setState: update => states.push(update.gameState) },
      say: async text => spoken.push(text), vision, intervalMs: 0 });
    runtime.start({ auto: false }); await runtime.speech;
    let sequence = 0;
    const pixels = new Uint8Array(160 * 120 * 4);
    let seed = 12345;
    for (let i=0; i<pixels.length; i+=4) { seed=(seed*1664525+1013904223)>>>0; const v=60+seed%140; pixels.set([v,v,v,255],i); }
    async function round() {
      await runtime.speech;
      for (let i=0; i<3; i++) {
        await sleep(220);
        const data = new Uint8Array(pixels); data.fill(60+(++sequence%8)*20,0,400);
        camera.emit('frame', { sequence, generation: 1, participantIdentity: 'chert-bridge-MOCK', trackSid: 'MOCK-video',
          timestampUs: String(Date.now()*1000), capturedAtMs: Date.now(), width:160,height:120,rotation:0,format:'rgba',data });
      }
      await runtime.tick();
    }
    await round(); assert.equal(runtime.engine.phase, 'SCAN');
    await round(); assert.equal(runtime.engine.phase, 'POWER');
    scenario = 'fail'; await round(); assert.equal(runtime.engine.phase, 'POWER');
    assert.ok(spoken.some(text => text.includes('requested position')));
    scenario = undefined;
    for (const phase of ['POWER','SECURITY','HIDE','FIND','PORTAL']) {
      assert.equal(runtime.engine.phase, phase);
      await round(); assert.equal(runtime.engine.phase, phase, 'first passing round cannot advance');
      await round();
    }
    await runtime.speech;
    assert.equal(runtime.engine.escaped, true);
    assert.deepEqual([...new Set(states.map(s => s.phase))], ['SCAN','POWER','SECURITY','HIDE','FIND','PORTAL']);
    assert.equal(states.at(-1).missionProgress, 1);
    assert.ok(states.every(s => s.objective.startsWith('[MOCK VISION]')));
    assert.ok(spoken.some(text => text.includes('Escape complete')));
    assert.ok(replies.filter(r => r.predicate).every(r => r.votes_total === 3));
    console.log(JSON.stringify({ scope: 'MOCK_ONLY_LOCAL_HTTP', phaseUpdates: states.length, utterances: spoken.length,
      visionRounds: replies.length, providerCalls: 0, chertCalls: 0, realWorldVerification: false }));
  } finally {
    await runtime?.close(); lines.close(); python.kill('SIGTERM'); await exited;
  }
});
