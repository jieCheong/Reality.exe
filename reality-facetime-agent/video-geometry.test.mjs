import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureRgbaContent } from './video-geometry.mjs';
import { drawHud, publishHud } from './hud-video.mjs';
import { WIDTH, HEIGHT } from './spaceship-face.mjs';
test('geometry detector distinguishes embedded content from full-frame HUD',()=>{
  const data=new Uint8Array(20*10*4);
  for(let y=3;y<8;y++)for(let x=5;x<15;x++)data.set([40,50,60,255],(y*20+x)*4);
  assert.deepEqual(measureRgbaContent(data,20,10),{contentX:5,contentY:3,contentWidth:10,contentHeight:5,blackPixels:150,opaquePixels:50});
  const result=measureRgbaContent(drawHud(0),WIDTH,HEIGHT);
  assert.equal(result.contentX,0);assert.equal(result.contentY,0);
  assert.equal(result.contentWidth,WIDTH);assert.equal(result.contentHeight,HEIGHT);
  assert.equal(result.blackPixels,0);assert.equal(result.opaquePixels,WIDTH*HEIGHT);
});
test('invalid buffers and mismatched native frames fail before publication',async()=>{
  assert.throws(()=>measureRgbaContent(new Uint8Array(4),2,2));
  let published=false,closed=false;
  await assert.rejects(publishHud({async publishTrack(){published=true;}},{
    source:{width:WIDTH,height:HEIGHT,async close(){closed=true;},captureFrame(){assert.fail();}},
    createTrack:()=>({async close(){}}),createFrame:()=>({width:640,height:360}),
  }),/geometry/);
  assert.equal(published,false);assert.equal(closed,true);
});
