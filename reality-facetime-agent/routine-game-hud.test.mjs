import { buildRoutineUiDemo } from './routine-ui-demo.mjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createCanvas } from '@napi-rs/canvas';
import { normalizeRoutineHud,routineScreen,formatRoutineTime } from './routine-hud-state.mjs';
import { renderRoutineFrame,drawRoutineGame,routineLayout } from './routine-game-hud.mjs';
import { routinePreviewStates } from './routine-hud-preview.mjs';
import { normalizeGameState,drawFace,WIDTH,HEIGHT } from './spaceship-face.mjs';
import { resolveHudVideoProfile } from './hud-video-profile.mjs';
const {replay,states}=await routinePreviewStates();
const byName=Object.fromEntries(states),hash=p=>createHash('sha256').update(p).digest('hex');

test('portrait routine-game profile is opt-in and leaves existing profiles intact',()=>{
 assert.deepEqual(resolveHudVideoProfile('routine-game'),{name:'routine-game',width:540,height:960,fps:15});
 assert.equal(resolveHudVideoProfile().height,960);assert.equal(resolveHudVideoProfile('juan-original').height,1170);
 assert.equal(resolveHudVideoProfile('landscape-test').width,640);
});
test('both normalization passes preserve every routine contract field and own nested snapshots',()=>{
 const original=structuredClone(byName['mission-2']);const normalized=normalizeGameState(original),twice=normalizeGameState(normalized);
 for(const key of Object.keys(original))assert.ok(Object.hasOwn(normalized,key),key);
 assert.deepEqual(twice,normalized);assert.equal(normalized.currentStep,2);assert.equal(normalized.totalSteps,3);
 assert.equal(normalized.missionName,replay.routine.steps[1].label);assert.equal(normalized.verificationMode,'mock');
 original.routineSteps[0].status='missed';original.lastOutcome.label='changed';original.pauseReasons.push('manual');
 assert.equal(normalized.routineSteps[0].status,'done');assert.notEqual(normalized.lastOutcome.label,'changed');assert.ok(!normalized.pauseReasons.includes('manual'));
});
test('partial malformed display fields fail safely without inventing completion',()=>{
 const s=normalizeRoutineHud({mode:'routine',missionProgress:1,currentStep:99,totalSteps:-1,completedSteps:Infinity,
 routineSteps:[null,{label:9,status:'all_win'}],verificationStatus:'YES!',lastOutcome:{status:'done',stepIndex:99}});
 assert.equal(s.completedSteps,0);assert.equal(s.missionProgress,0);assert.equal(s.lastOutcome,null);assert.equal(s.verificationStatus,'idle');
 assert.equal(s.currentStep,null);assert.ok(s.routineSteps.every(r=>r.status==='pending'));
 assert.equal(normalizeRoutineHud(null).completedSteps,0);
});
test('all required game screens come from actual simulated routine state',()=>{
 const expected={welcome:'welcome',scanning:'scanning','mission-1':'active',checking:'verifying',confirmation:'verifying',
 uncertain:'retry',retry:'retry',verified:'success','mission-2':'active',paused:'paused',missed:'missed','mission-3':'active',complete:'complete'};
 for(const [name,state] of states)assert.equal(routineScreen(normalizeRoutineHud(state)),expected[name],name);
});
test('portrait RGBA frame is upright, opaque, immutable and materially changes across game states',()=>{
 const hashes=new Set();
 for(const [name,state] of states){
  const {pixels}=renderRoutineFrame(state);assert.equal(pixels.length,540*960*4);hashes.add(hash(pixels));
  for(let i=3;i<pixels.length;i+=4)assert.equal(pixels[i],255,name);
 }
 assert.ok(hashes.size>=11);
 const first=renderRoutineFrame(byName['mission-1']).pixels,before=hash(first);
 renderRoutineFrame(byName.complete);assert.equal(hash(first),before);
 assert.equal(drawFace(0,false,byName['mission-1']).length,WIDTH*HEIGHT*4);
});
test('critical portrait content stays within reserved control margins and readable bounds',()=>{
 for(const [,state] of states){
  const {layout,textRuns}=renderRoutineFrame(state,{captureText:true}),safe=layout.safe;
  for(const key of ['header','hero','caption','card','progress','footer']){
   const b=layout[key];assert.ok(b.x>=safe.x&&b.x+b.width<=safe.x+safe.width,key);
   assert.ok(b.y>=safe.y&&b.y+b.height<=safe.y+safe.height,key);
  }
  for(const line of textRuns){
   assert.ok(line.x>=safe.x-1&&line.x+line.width<=safe.x+safe.width+1,`${line.role} horizontal bounds`);
   assert.ok(line.baseline>=safe.y&&line.baseline<=safe.y+safe.height,`${line.role} vertical bounds`);
   if(['mission','instruction','timer','count','feedback'].includes(line.role))assert.ok(line.fontSize>=20,line.role);
  }
 }
});
test('actual mission labels, timers and final report counts reach visible text',()=>{
 for(const n of [1,2,3]){
  const state=byName[`mission-${n}`],{textRuns}=renderRoutineFrame(state,{captureText:true});
  assert.equal(textRuns.filter(t=>t.role==='mission').map(t=>t.text).join(' '),replay.routine.steps[n-1].label);
  assert.ok(textRuns.some(t=>t.role==='timer'&&t.text===formatRoutineTime(state.timeLeftSeconds)));
 }
 const scan=renderRoutineFrame(byName.scanning,{captureText:true}).textRuns.filter(t=>t.role==='instruction').map(t=>t.text).join(' ');
 for(const object of replay.routine.objects)assert.ok(scan.includes(object),object);
 const left=renderRoutineFrame(byName['mission-3'],{captureText:true}).textRuns.filter(t=>t.role==='instruction').map(t=>t.text).join(' ');
 assert.ok(left.includes('camera picture'));
 const {textRuns}=renderRoutineFrame(byName.complete,{captureText:true});
 assert.ok(textRuns.some(t=>t.text==='2 of 3 missions checked'));
 assert.equal(byName.complete.completedSteps,replay.summary.done);
 assert.ok(!textRuns.some(t=>t.text==='3 of 3 missions checked'));
});
test('uncertain evidence and a single positive round cannot render verified success',()=>{
 for(const name of ['uncertain','confirmation','checking']){
  const {screen,textRuns}=renderRoutineFrame(byName[name],{captureText:true});
  assert.notEqual(screen,'success');assert.ok(!textRuns.some(t=>t.text==='Mission checked!'));
 }
 const s=normalizeRoutineHud({...byName.checking,uiState:'mission_verified',verificationStatus:'observed',lastOutcome:null});
 assert.notEqual(routineScreen(s),'success');
});
test('long or unbroken parent text stays clipped and wrapped within the mission card',()=>{
 for(const value of ['W'.repeat(1000),'A very long instruction '.repeat(100)]){
  const {layout,textRuns,pixels}=renderRoutineFrame({...byName['mission-1'],missionName:value,missionInstruction:value},{captureText:true});
  assert.equal(pixels.length,2073600);
  const lines=textRuns.filter(t=>t.role==='mission');assert.ok(lines.length<=2);
  for(const t of lines)assert.ok(t.x+t.width<=layout.card.x+layout.card.width-20);
 }
});
test('countdown formatting is calm and missing time is never a false zero',()=>{
 assert.equal(formatRoutineTime(90),'1:30');assert.equal(formatRoutineTime(65),'1:05');assert.equal(formatRoutineTime(0),'0:00');
 assert.equal(formatRoutineTime(null),'—:—');assert.equal(formatRoutineTime(NaN),'—:—');
});
test('renderer uses no canvas rotation or bitmap scaling, including landscape fallback',()=>{
 for(const [width,height] of [[540,960],[540,1170],[640,360]]){
  const ctx=createCanvas(width,height).getContext('2d');
  ctx.rotate=()=>assert.fail('must not rotate');ctx.scale=()=>assert.fail('must not stretch');ctx.drawImage=()=>assert.fail('must reflow natively');
  const {layout,textRuns}=drawRoutineGame(ctx,5,false,byName['mission-1'],{captureText:true});
  assert.equal(layout.portrait,height>width);
  for(const t of textRuns)assert.ok(t.x>=0&&t.x+t.width<=width&&t.baseline<height);
 }
});
test('ORBIT reacts to listening, speech, waiting, checking, retry, success and completion',()=>{
 const cases=[['mission-1',false,'listening'],['mission-1',true,'speaking'],['paused',false,'waiting'],['checking',false,'verifying'],
  ['retry',false,'retry'],['verified',false,'success'],['complete',false,'complete']];
 for(const [name,speaking,mood] of cases)assert.equal(renderRoutineFrame(byName[name],{speaking}).mood,mood);
 assert.notEqual(hash(renderRoutineFrame(byName.checking,{tick:0}).pixels),hash(renderRoutineFrame(byName.checking,{tick:15}).pixels));
});
test('short outcome toast survives next mission without hiding its current title or changing the engine',()=>{
 const ctx=createCanvas(540,960).getContext('2d'),state=byName['mission-2'],before=JSON.stringify(state);
 const first=drawRoutineGame(ctx,0,false,state,{captureText:true});
 assert.ok(first.textRuns.some(t=>t.role==='outcome'&&t.text==='Mission 1 checked!'));
 assert.ok(first.textRuns.some(t=>t.role==='mission'&&t.text===state.missionName));
 const later=drawRoutineGame(ctx,25,false,state,{captureText:true});assert.ok(!later.textRuns.some(t=>t.role==='outcome'));
 assert.equal(JSON.stringify(state),before);
});
for(const profile of ['routine-game','landscape-test'])test(`existing native video publisher preserves routine fields and frame orientation (${profile})`,()=>{
 const script=`
 import assert from 'node:assert/strict';import {VideoSource,VideoBufferType,dispose} from '@livekit/rtc-node';
 import {createHash} from 'node:crypto';import {publishHud} from './hud-video.mjs';import {WIDTH,HEIGHT,FPS,drawFace} from './spaceship-face.mjs';
 const hashes=[];class Source extends VideoSource {captureFrame(f,ts,rotation){assert.equal(rotation,0);assert.equal(f.width,WIDTH);assert.equal(f.height,HEIGHT);assert.equal(f.type,VideoBufferType.RGBA);assert.equal(f.data.length,WIDTH*HEIGHT*4);hashes.push(createHash('sha256').update(f.data).digest('hex'));super.captureFrame(f,ts,rotation);}}
 let publications=0;const hud=await publishHud({async publishTrack(track,o){publications++;assert.equal(track.source.width,WIDTH);assert.equal(track.source.height,HEIGHT);return {sid:'offline'};},async unpublishTrack(){}},{source:new Source(WIDTH,HEIGHT),fps:1});
 assert.equal(FPS,15);assert.equal(WIDTH,${profile==='routine-game'?540:640});assert.equal(HEIGHT,${profile==='routine-game'?960:360});
 const state=${JSON.stringify(byName['mission-1'])};
 hud.setState({gameState:state});hud.render();const before=hashes.at(-1);
 state.missionName='outside mutation';state.routineSteps[0].label='mutated';hud.render();const original=${JSON.stringify(byName['mission-1'])};assert.equal(hashes.at(-1),createHash('sha256').update(drawFace(2,false,original)).digest('hex'));
 hud.setState({gameState:{...${JSON.stringify(byName['mission-1'])},timeLeftSeconds:47}});hud.render();assert.equal(hashes.at(-1),createHash('sha256').update(drawFace(3,false,{...original,timeLeftSeconds:47})).digest('hex'));assert.notEqual(hashes.at(-1),createHash('sha256').update(drawFace(3,false,original)).digest('hex'));
 assert.equal(publications,1);await hud.close();dispose();`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,HUD_VIDEO_PROFILE:profile},encoding:'utf8',timeout:20000});
 assert.equal(result.status,0,result.stderr);
});

test('separate all-done replay visually verifies each of the three missions and reports three successes',async()=>{
 const allDone=await buildRoutineUiDemo({missSecondStep:false});
 assert.deepEqual(allDone.summary.statuses,['done','done','done']);
 for(let i=1;i<=3;i++)assert.ok(allDone.states.some(s=>s.currentStep===i&&s.routineEvent.name==='mission_verified'));
 const {screen,textRuns}=renderRoutineFrame(allDone.states.at(-1),{captureText:true});
 assert.equal(screen,'complete');assert.ok(textRuns.some(t=>t.text==='3 of 3 missions checked'));
});

test('progress easing stays bounded by authoritative resolved steps and never changes their status',()=>{
 const ctx=createCanvas(540,960).getContext('2d');drawRoutineGame(ctx,0,false,byName['mission-1']);
 const target=byName['mission-2'].resolvedSteps/byName['mission-2'].totalSteps;let previous=0;
 for(let tick=1;tick<20;tick++){
  const frame=drawRoutineGame(ctx,tick,false,byName['mission-2']);assert.ok(frame.displayProgress>=previous);
  assert.ok(frame.displayProgress<=target);assert.equal(frame.state.routineSteps[1].status,'active');previous=frame.displayProgress;
 }
 assert.ok(previous>0);
});
