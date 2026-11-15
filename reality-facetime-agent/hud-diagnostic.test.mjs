import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { VideoFrame, VideoBufferType, dispose } from '@livekit/rtc-node';
import { drawDiagnostic } from './hud-diagnostic.mjs';
import { drawHud, publishHud } from './hud-video.mjs';
import { WIDTH, HEIGHT } from './spaceship-face.mjs';
after(() => dispose());
test('diagnostic pattern reaches the actual SDK frame byte-for-byte without black padding', async () => {
  const pixels=drawDiagnostic(0), frame=new VideoFrame(pixels, WIDTH, HEIGHT, VideoBufferType.RGBA);
  assert.deepEqual(frame.data,pixels); assert.equal(frame.width,540); assert.equal(frame.height,960);
  for(let i=0;i<pixels.length;i+=4) assert.ok(pixels[i] || pixels[i+1] || pixels[i+2]);
  assert.notDeepEqual(pixels,drawDiagnostic(1));
  let captured;
  const hud=await publishHud({async publishTrack(){return {sid:'mock'};},async unpublishTrack(){}}, {
    diagnosticPattern:true, fps:1,
    source:{captureFrame(f,ts,rotation){assert.equal(rotation,0);captured=f;},async close(){}},
    createTrack:()=>({async close(){}}),
  });
  await hud.close(); assert.deepEqual(captured.data,pixels);
});
test('normal HUD has content to every edge rather than a padded landscape canvas', () => {
  const pixels=drawHud(0);
  for(let y=0;y<HEIGHT;y++) for(const x of [0,WIDTH-1]) {
    const i=(y*WIDTH+x)*4; assert.ok(pixels[i] || pixels[i+1] || pixels[i+2]); assert.equal(pixels[i+3],255);
  }
});
