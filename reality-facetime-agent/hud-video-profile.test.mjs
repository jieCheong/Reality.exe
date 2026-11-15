import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolveHudVideoProfile } from './hud-video-profile.mjs';
test('video profiles are explicit, immutable, and preserve default geometry', () => {
  assert.deepEqual(resolveHudVideoProfile(),{name:'default',width:540,height:960,fps:15});
  assert.equal(resolveHudVideoProfile('juan-original').height,1170);
  assert.ok(Object.isFrozen(resolveHudVideoProfile()));
  assert.throws(()=>resolveHudVideoProfile('arbitrary'),/HUD_VIDEO_PROFILE/);
});
test('Juan geometry renders and publishes natively with dynamic state, no padding or rotation', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { VideoSource, VideoBufferType, dispose } from '@livekit/rtc-node';
    import { drawFace, WIDTH, HEIGHT, FPS, HUD_LAYOUT, objectiveLines } from './spaceship-face.mjs';
    import { publishHud } from './hud-video.mjs';
    import { drawDiagnostic } from './hud-diagnostic.mjs';
    assert.equal(WIDTH,540); assert.equal(HEIGHT,1170); assert.equal(FPS,15);
    const pixels=drawFace(0); assert.equal(pixels.length,2527200);
    assert.notDeepEqual(pixels,drawFace(0,true,{phase:'POWER',objective:'DYNAMIC',missionProgress:.5}));
    for(let i=0;i<pixels.length;i+=4) {assert.equal(pixels[i+3],255);assert.ok(pixels[i]||pixels[i+1]||pixels[i+2]);}
    for(const box of Object.values(HUD_LAYOUT)) {assert.ok(box.x>=24);assert.ok(box.x+box.width<=516);assert.ok(box.y+box.height<=1146);}
    for(const line of objectiveLines('W'.repeat(300))) {assert.ok(line.width<=448);assert.ok(line.baseline<HUD_LAYOUT.objective.y+HUD_LAYOUT.objective.height);}
    assert.equal(drawDiagnostic(0).length,pixels.length);
    let count=0, published=0;
    class Source extends VideoSource {captureFrame(frame,ts,rotation){assert.equal(frame.width,540);assert.equal(frame.height,1170);assert.equal(frame.type,VideoBufferType.RGBA);assert.equal(frame.data.length,2527200);assert.equal(rotation,0);super.captureFrame(frame,ts,rotation);count++;}}
    const source=new Source(WIDTH,HEIGHT);
    const hud=await publishHud({async publishTrack(track,opts){published++;assert.equal(track.name,'agent-video');assert.equal(track.source.height,1170);assert.deepEqual(Object.keys(opts),['source']);return {sid:'mock'};},async unpublishTrack(){}},{source});
    hud.setState({gameState:{phase:'PORTAL',missionProgress:1}});hud.render();await hud.close();
    assert.equal(count,2);assert.equal(published,1);dispose();
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,HUD_VIDEO_PROFILE:'juan-original'},encoding:'utf8',timeout:20000});
  assert.equal(result.status,0,result.stderr);
});
test('rotated profiles draw the portrait HUD and publish it as a quarter-turned 960x540 frame', () => {
  assert.deepEqual(resolveHudVideoProfile('rotated-ccw'), { name: 'rotated-ccw', width: 960, height: 540, fps: 15, rotate: 'ccw', layoutWidth: 540, layoutHeight: 960 });
  const script = (profile) => `
    import assert from 'node:assert/strict';
    import { drawFace, WIDTH, HEIGHT } from './spaceship-face.mjs';
    assert.equal(WIDTH, 960); assert.equal(HEIGHT, 540);
    const px = drawFace(0, false, { phase: 'POWER' }); assert.equal(px.length, 960 * 540 * 4);
    // The portrait cyan status stripe (y=144..148 across the width) becomes a vertical stripe.
    const at = (x, y) => px.subarray((y * 960 + x) * 4, (y * 960 + x) * 4 + 3);
    const cyan = ([r, g, b]) => g > 180 && b > 160 && r < 140;
    const x = ${profile === 'ccw' ? 146 : 960 - 1 - 146};
    for (const y of [10, 270, 530]) assert.ok(cyan(at(x, y)), 'stripe at ' + y);
  `;
  for (const profile of ['ccw', 'cw']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script(profile)], { env: { ...process.env, HUD_VIDEO_PROFILE: `rotated-${profile}` }, encoding: 'utf8', timeout: 20000 });
    assert.equal(result.status, 0, result.stderr);
  }
});

test("juan-themes profiles: Juan's three worlds with the routine on top, upright or quarter-turned", () => {
  assert.equal(resolveHudVideoProfile('juan-themes').height, 1170);
  assert.deepEqual(resolveHudVideoProfile('juan-themes-rotated-ccw'), { name: 'juan-themes-rotated-ccw', width: 1170, height: 540, fps: 15,
    themes: true, rotate: 'ccw', layoutWidth: 540, layoutHeight: 1170 });
  const script = (w, h) => `
    import assert from 'node:assert/strict';
    import { drawFace, WIDTH, HEIGHT } from './spaceship-face.mjs';
    assert.equal(WIDTH, ${w}); assert.equal(HEIGHT, ${h});
    const steps = ['BED','TEETH'].map((short, i) => ({ label: short, short, status: i ? 'active' : 'done' }));
    const live = theme => ({ phase: 'POWER', mode: 'routine', selectedTheme: theme, objective: 'Brush your teeth', stepIndex: 1,
      timeLeftSeconds: 20, lives: 3, maxLives: 3, monster: { visible: false, closeness: 0 }, outcome: null, routineSteps: steps });
    const hash = px => { let h = 0; for (let i = 0; i < px.length; i += 97) h = (h * 31 + px[i]) >>> 0; return h; };
    const frames = [drawFace(0, false, { phase: 'SCAN', objective: 'PICK YOUR WORLD' }), ...['space','odyssey','backrooms'].map(t => drawFace(0, false, live(t)))];
    for (const px of frames) assert.equal(px.length, ${w} * ${h} * 4);
    assert.equal(new Set(frames.map(hash)).size, 4, 'menu + three distinct worlds');
    const withMonster = drawFace(0, false, { ...live('space'), monster: { visible: true, closeness: .8 } });
    assert.notEqual(hash(withMonster), hash(frames[1]));
  `;
  for (const [profile, w, h] of [['juan-themes', 540, 1170], ['juan-themes-rotated-ccw', 1170, 540], ['juan-themes-rotated-cw', 1170, 540]]) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script(w, h)], { env: { ...process.env, HUD_VIDEO_PROFILE: profile }, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 0, `${profile}: ${result.stderr}`);
  }
});

test("Juan's renderer and art match the hashes pinned from his branch", async () => {
  const { createHash } = await import('node:crypto'); const { readFile } = await import('node:fs/promises');
  const pinned = JSON.parse(await readFile(new URL('./juan-hud/UPSTREAM.json', import.meta.url), 'utf8'));
  for (const [file, sha] of Object.entries(pinned.files))
    assert.equal(createHash('sha256').update(await readFile(new URL(`./juan-hud/${file}`, import.meta.url))).digest('hex'), sha, file);
});

test('juan-original renders every routine screen with Juan artwork and the native portrait geometry', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { drawHud } from './hud-video.mjs';
    import { drawJuanRoutine } from './juan-theme-hud.mjs';
    import { normalizeRoutineHud } from './routine-hud-state.mjs';
    import { HEIGHT, WIDTH } from './spaceship-face.mjs';
    assert.deepEqual([WIDTH,HEIGHT],[540,1170]);
    const snapshots=[
      {mode:'routine',uiState:'scanning',pauseReasons:['not_started']},
      {mode:'routine',uiState:'in_progress',currentStep:1,stepIndex:0,missionName:'Hold up the toothbrush'},
      {mode:'routine',uiState:'verification_pending',currentStep:1,stepIndex:0,verificationStatus:'pending'},
      {mode:'routine',uiState:'uncertain',currentStep:2,stepIndex:1,verificationStatus:'uncertain'},
      {mode:'routine',uiState:'mission_missed',lastOutcome:{stepIndex:1,label:'Place the shoes',status:'missed'}},
      {mode:'routine',uiState:'paused',paused:true,pauseReasons:['manual']},
      {mode:'routine',uiState:'routine_completed',completedSteps:3,totalSteps:3},
    ];
    for(const snapshot of snapshots){
      const actual=drawHud(2,{speaking:true,gameState:snapshot});
      const expected=drawJuanRoutine(2,true,normalizeRoutineHud({...snapshot,selectedTheme:'space'}));
      assert.equal(actual.length,540*1170*4,snapshot.uiState);
      assert.equal(Buffer.compare(Buffer.from(actual),Buffer.from(expected)),0,snapshot.uiState);
    }
    const initial=normalizeRoutineHud({mode:'routine',uiState:'scanning',pauseReasons:['not_started'],selectedTheme:'space'});
    assert.equal(Buffer.compare(Buffer.from(drawHud(0)),Buffer.from(drawJuanRoutine(0,false,initial))),0);
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,HUD_VIDEO_PROFILE:'juan-original'},encoding:'utf8',timeout:20000});
  assert.equal(result.status,0,result.stderr);
});
