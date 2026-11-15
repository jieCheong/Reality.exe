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
