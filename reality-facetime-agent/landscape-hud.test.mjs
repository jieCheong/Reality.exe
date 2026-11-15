import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolveHudVideoProfile } from './hud-video-profile.mjs';
test('landscape-test natively renders dynamic HUD and publishes matching 640x360 RGBA', () => {
  assert.deepEqual(resolveHudVideoProfile('landscape-test'),{name:'landscape-test',width:640,height:360,fps:15});
  const script=`
    import assert from 'node:assert/strict';
    import { createHash } from 'node:crypto';
    import { VideoSource, VideoBufferType, TrackSource, dispose } from '@livekit/rtc-node';
    import { drawHud, publishHud } from './hud-video.mjs';
    import { WIDTH, HEIGHT, FPS, HUD_LAYOUT, objectiveLines } from './spaceship-face.mjs';
    import { measureRgbaContent } from './video-geometry.mjs';
    const hash=frame=>createHash('sha256').update(frame).digest('hex');
    assert.equal(WIDTH,640);assert.equal(HEIGHT,360);assert.equal(FPS,15);
    const pixels=drawHud(0);assert.equal(pixels.length,921600);
    const geometry=measureRgbaContent(pixels,WIDTH,HEIGHT);
    assert.equal(geometry.contentWidth,640);assert.equal(geometry.contentHeight,360);
    assert.equal(geometry.opaquePixels,WIDTH*HEIGHT);assert.equal(geometry.blackPixels,0);
    for(const box of Object.values(HUD_LAYOUT)) {assert.ok(box.x>=12&&box.y>=12);assert.ok(box.x+box.width<=WIDTH-12);assert.ok(box.y+box.height<=HEIGHT-12);}
    for(const line of objectiveLines('Long objective '.repeat(100))) {assert.ok(line.width<=550);assert.ok(line.baseline<204);}
    const base={phase:'HAIR',objective:'RESTORE POWER',missionProgress:.3};
    const original=hash(drawHud(0,{gameState:base}));
    for(const update of [{objective:'CHECK REACTOR'},{missionProgress:.8},{checkpoints:{TEETH:'pending',HAIR:'complete'}}]) {
      assert.notEqual(original,hash(drawHud(0,{gameState:{...base,...update}})));
    }
    assert.notEqual(hash(drawHud(0,{speaking:true})),hash(drawHud(1,{speaking:true})));
    const frames=[];let published=0,unpublished=0;
    class Source extends VideoSource {captureFrame(frame,ts,rotation){assert.equal(frame.width,640);assert.equal(frame.height,360);assert.equal(frame.data.length,921600);assert.equal(frame.type,VideoBufferType.RGBA);assert.equal(rotation,0);frames.push(hash(frame.data));super.captureFrame(frame,ts,rotation);}}
    const hud=await publishHud({async publishTrack(track,opts){published++;assert.equal(track.name,'agent-video');assert.equal(track.source.width,640);assert.equal(track.source.height,360);assert.equal(opts.source,TrackSource.SOURCE_CAMERA);return {sid:'offline-only'};},async unpublishTrack(){unpublished++;}},{source:new Source(WIDTH,HEIGHT)});
    const {PHASES}=await import('./routine.mjs');
    for(const phase of PHASES) {hud.setState({gameState:{phase}});hud.render();}
    assert.equal(new Set(frames.slice(1)).size,PHASES.length);assert.equal(published,1);
    await hud.close();assert.equal(unpublished,1);dispose();
  `;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{
    env:{...process.env,HUD_VIDEO_PROFILE:'landscape-test'},encoding:'utf8',timeout:20000,
  });
  assert.equal(result.status,0,result.stderr);
});
