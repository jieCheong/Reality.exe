import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { validateRoutine, assertRoutineCapabilities, loadRoutine } from './routine-contract.mjs';
import { RoutineMissionEngine, MissionEngine } from './mission-engine.mjs';
import { GameRuntime } from './game-runtime.mjs';
import { RoutineSession } from './routine-session.mjs';
import { SpeechCoordinator } from './speech-coordinator.mjs';
import { routineReportWriter } from './routine-report.mjs';

const fixture = JSON.parse(await readFile(new URL('./examples/routines/morning.json', import.meta.url), 'utf8'));
const objects = fixture.objects.map((name,i) => ({name,description:name,box_2d:[100,100+i*250,300,200+i*250]}));
let sequence=0;
const request = e => ({...e.request(),frameIds:Array.from({length:e.phase==='SCAN'?2:3},()=>`test-${++sequence}`)});
const verdict = (e,pass=true) => ({status:'checked',predicate:e.request().predicate,satisfied:pass,votes_for:pass?3:0,votes_total:3,
  evidence:'Synthetic test verdict',frame_verdicts:[0,1,2].map(frame_index=>({frame_index,satisfied:pass,confidence:.95,error:null,geometry_override:null}))});
const apply = (e,result,evidence=null) => e.apply(request(e),result,evidence);
function ready(routine=fixture) {
  let now=1000;const engine=new RoutineMissionEngine(routine,{now:()=>now});
  apply(engine,{status:'checked',objects});apply(engine,{status:'checked',objects});engine.resumeClock();
  return {engine,advance:ms=>{now+=ms;},now:()=>now};
}

test('parent routine file validates, freezes input, and leaves fixed missions as default',async()=>{
  const r=await loadRoutine(new URL('./examples/routines/morning.json',import.meta.url));
  assert.equal(r.steps.length,3);assert.ok(Object.isFrozen(r.steps[0].objects));
  assert.equal(new MissionEngine().phase,'SCAN');
  const copy=structuredClone(fixture);const validated=validateRoutine(copy);copy.steps[0].objects[0]='changed';
  assert.equal(validated.steps[0].objects[0],'toothbrush');
  for(const modify of [r=>r.objects.push('toothbrush'),r=>r.steps[0].objects=['unscanned'],
    r=>r.steps[0].check='DROP_DATABASE',r=>r.steps[0].objects=['toothbrush','backpack'],
    r=>r.timer.minSeconds=-1,r=>r.timer.startSeconds='90',r=>r.timer.minSeconds=100,
    r=>r.steps[1].objects=['shoes','shoes'],r=>r.objects[0]='name) injection']) {
    const bad=structuredClone(fixture);modify(bad);assert.throws(()=>validateRoutine(bad));
  }
  const hidden=structuredClone(fixture);hidden.steps[0].check='HIDDEN';
  assert.equal(validateRoutine(hidden).steps[0].check,'HIDDEN');assert.throws(()=>assertRoutineCapabilities(validateRoutine(hidden)),/HIDDEN/);
  const large=structuredClone(fixture);large.objects.push('lunchbox');assert.throws(()=>assertRoutineCapabilities(validateRoutine(large)),/three/);
});

test('scan waits for every named object and two matching inventories, then verifies only scanned names',()=>{
  const e=new RoutineMissionEngine(fixture);
  apply(e,{status:'checked',objects:objects.slice(0,2)});assert.equal(e.phase,'SCAN');assert.match(e.instruction(),/shoes/);
  apply(e,{status:'checked',objects});assert.equal(e.phase,'SCAN');
  apply(e,{status:'checked',objects});assert.equal(e.stepIndex,0);
  assert.equal(e.request().predicate,'HELD_UP(toothbrush)');assert.equal(e.catalog.length,3);
  assert.equal(apply(e,{status:'checked',satisfied:true}),false);assert.equal(e.stepIndex,0);
});

test('routine runs all parent steps with two fresh rounds and produces the shared report',()=>{
  const {engine:e,advance}=ready();const photo={id:'receipt',capturedAtMs:1,dataUrl:'data:image/jpeg;base64,ZmFrZQ=='};
  for(let i=0;i<3;i++) {
    assert.equal(e.stepIndex,i);advance(1000);
    assert.equal(apply(e,verdict(e),photo),false);assert.equal(apply(e,verdict(e),photo),true);
    if(i<2)e.resumeClock();
  }
  assert.equal(e.escaped,true);assert.deepEqual(e.report().steps.map(s=>s.status),['done','done','done']);
  assert.deepEqual(Object.keys(e.results[0]),['label','status','seconds','evidence','evidenceFrame']);
  assert.equal(e.results[0].seconds,1);assert.deepEqual(e.results[0].evidenceFrame,photo);
  assert.equal(e.hudState().timeLeftSeconds,null);assert.equal(e.hudState().missionProgress,1);
  assert.ok(!JSON.stringify(e.hudState()).includes('data:image'));
});

test('failed verified check penalizes countdown; network, uncertain and malformed results do not',()=>{
  const {engine:e}=ready();assert.equal(e.timeLeft(),90);
  apply(e,verdict(e,false));assert.equal(e.timeLeft(),85);assert.equal(e.results.length,0);
  const bad=verdict(e,false);bad.frame_verdicts[0].error='provider_error';
  apply(e,bad);assert.equal(e.timeLeft(),85);
  const uncertain=verdict(e,false);uncertain.frame_verdicts.forEach(v=>v.confidence=.4);
  apply(e,uncertain);assert.equal(e.timeLeft(),85);
  const malformed=verdict(e);malformed.votes_for=2;apply(e,malformed);assert.equal(e.timeLeft(),85);
  apply(e,{status:'unstable_scene'});assert.equal(e.timeLeft(),85);
});

test('timeouts mark missed and carry penalties to every later step, respecting hard minimum',()=>{
  const {engine:e,advance}=ready();advance(90000);e.tick();
  assert.equal(e.results[0].status,'missed');assert.equal(e.results[0].evidenceFrame,null);
  assert.equal(e.budgetSeconds,65); // 90 -10 -15
  e.resumeClock();advance(65000);e.tick();assert.equal(e.budgetSeconds,40); // 90 -20 -30
  e.resumeClock();advance(40000);e.tick();assert.equal(e.escaped,true);assert.equal(e.misses,3);
  const short=structuredClone(fixture);short.timer={...short.timer,startSeconds:35,minSeconds:30};
  const x=ready(short);x.advance(35000);x.engine.tick();assert.equal(x.engine.budgetSeconds,30);
});

test('penalty can expire a step; stale/replayed evidence and late positive cannot finish it',()=>{
  const {engine:e,advance}=ready();advance(86000);apply(e,verdict(e,false));
  assert.equal(e.results[0].status,'missed');e.resumeClock();
  const reused=request(e);e.apply(reused,verdict(e));e.apply(reused,verdict(e));assert.equal(e.stepIndex,1);assert.equal(e.streak,0);
  const old=request(e),response=verdict(e);advance(65000);e.apply(old,response);
  assert.equal(e.results[1].status,'missed');assert.equal(e.stepIndex,2);
});

test('clock pauses for speech/manual pauses and reports remaining active seconds',()=>{
  const {engine:e,advance}=ready();advance(2000);e.pauseClock();advance(100000);
  assert.equal(e.timeLeft(),88);e.tick();assert.equal(e.results.length,0);
  e.resumeClock();advance(3000);e.tick();assert.equal(e.hudState().timeLeftSeconds,85);
});

test('runtime timer progresses during pending vision and rejects the late result without overwriting next step',async()=>{
  let now=1000,finish;const camera=new EventEmitter();camera.isCurrent=()=>true;
  const states=[],reports=[],spoken=[];
  const vision={allowMock:true,newRequestId:()=>`id-${++sequence}`,analyze:()=>new Promise(resolve=>{finish=resolve;})};
  const game=new GameRuntime({callerVideo:camera,hud:{setState:s=>states.push(s.gameState)},say:async text=>spoken.push(text),vision,
    now:()=>now,intervalMs:0,encode:async()=>Buffer.from('mock'),routine:fixture,onReport:async r=>reports.push(r)});
  try {
    game.start({auto:false});await game.speech;
    apply(game.engine,{status:'checked',objects});apply(game.engine,{status:'checked',objects});await game.speech;
    now=2000;for(let i=0;i<3;i++)camera.emit('frame',{sequence:i,generation:1,capturedAtMs:now-600+i*200});
    const pending=game.tick();await new Promise(r=>setImmediate(r));
    const response=verdict(game.engine);now=92000;void game.tick();await game.speech;
    finish(response);await pending;
    assert.equal(game.engine.results[0].status,'missed');assert.equal(game.engine.stepIndex,1);
    assert.ok(states.some(s=>s.timeLeftSeconds===65));assert.ok(spoken.some(s=>s.includes('Time is up')));
    assert.ok(!spoken.some(s=>s.includes('visual link is unavailable')));
  } finally {await game.close();}
  assert.equal(reports.length,1);assert.equal(reports[0].complete,false);assert.equal(reports[0].verification,'mock');
});

test('runtime starts countdown only after successful narration and keeps it paused after speech failure',async()=>{
  let now=1000,rejectSpeech=false;const camera=new EventEmitter();camera.isCurrent=()=>true;
  const game=new GameRuntime({callerVideo:camera,hud:{setState(){}},say:async()=>{if(rejectSpeech)throw Error('offline');},
    vision:{allowMock:true},routine:fixture,now:()=>now});
  try {
    game.start({auto:false});await game.speech;rejectSpeech=true;
    apply(game.engine,{status:'checked',objects});apply(game.engine,{status:'checked',objects});await game.speech;
    now+=100000;await game.tick();assert.equal(game.engine.results.length,0);assert.equal(game.engine.timeLeft(),90);
    rejectSpeech=false;await game.announce(game.engine.instruction(),{force:true});now+=1000;await game.tick();
    assert.equal(game.engine.timeLeft(),89);
  } finally {await game.close();}
});

test('routine session handles stop/resume/done without theme placeholders or speech-only wins',async()=>{
  let starts=0,pauses=0,ticks=0,announcements=0;
  const speech=new SpeechCoordinator({speak:async()=>{},interrupt:async()=>{}});
  const game={start(){starts++;},pause(){pauses++;},tick(){ticks++;},announce:async()=>{announcements++;},engine:{instruction:()=> 'instruction'},close:async()=>{}};
  const session=new RoutineSession({game,speech});session.start();session.start();
  for(const [i,text] of ['stop','resume','done','I finished everything'].entries())await session.handleTranscript({isFinal:true,itemId:String(i),transcript:text});
  assert.equal(starts,1);assert.equal(pauses,1);assert.equal(announcements,1);assert.equal(ticks,1);
  await session.close();
});

test('local parent report is written atomically and retains done/missed/photo contract',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'routine-report-'));
  try {
    const writer=routineReportWriter(directory);const {engine:e}=ready();
    apply(e,verdict(e));apply(e,verdict(e),{id:'mock',capturedAtMs:0,dataUrl:'data:image/jpeg;base64,ZmFrZQ=='});
    await writer({...e.report(),verification:'mock'});
    const saved=JSON.parse(await readFile(join(directory,'report.json'),'utf8'));
    assert.equal(saved.verification,'mock');assert.equal(saved.steps[0].status,'done');assert.ok(saved.steps[0].evidenceFrame.dataUrl);
    await assert.rejects(readFile(join(directory,'report.json.tmp')));
  } finally {await rm(directory,{recursive:true,force:true});}
});

test('runtime report uses the positive verdict frame_index even when verdicts are reordered',async()=>{
  let now=1000,sequence=0,expectedId;const reports=[];
  const camera=new EventEmitter();camera.isCurrent=()=>true;
  const routine=structuredClone(fixture);routine.steps=routine.steps.slice(0,1);
  let game;
  const vision={allowMock:true,newRequestId:()=>`request-${sequence}`,analyze:async req=>{
    expectedId=req.frames[2].id;
    return {status:'checked',predicate:req.predicate,satisfied:true,votes_for:2,votes_total:3,
      frame_verdicts:[2,0,1].map(frame_index=>({frame_index,satisfied:frame_index!==1,confidence:.95,error:null,geometry_override:null}))};
  }};
  game=new GameRuntime({callerVideo:camera,hud:{setState(){}},say:async()=>{},vision,routine,now:()=>now,
    intervalMs:0,encode:async f=>Buffer.from(`synthetic-${f.sequence}`),onReport:async report=>reports.push(report)});
  try {
    game.start({auto:false});await game.speech;
    apply(game.engine,{status:'checked',objects});apply(game.engine,{status:'checked',objects});await game.speech;
    for(const time of [2000,4000]){
      now=time;
      for(let i=0;i<3;i++)camera.emit('frame',{sequence:++sequence,generation:1,capturedAtMs:now-600+i*200});
      await game.tick();await game.speech;
    }
    await game.flushReport();
    assert.equal(reports.length,1);assert.equal(reports[0].steps[0].evidenceFrame.id,expectedId);
    assert.equal(reports[0].steps[0].evidenceFrame.dataUrl,`data:image/jpeg;base64,${Buffer.from(`synthetic-${sequence}`).toString('base64')}`);
  } finally {await game.close();}
});
