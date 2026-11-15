import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRoutine } from './routine-contract.mjs';
import { RoutineMissionEngine } from './routine-engine.mjs';
import { GameRuntime } from './game-runtime.mjs';
import { RoutineSession } from './routine-session.mjs';
import { routineReportWriter } from './routine-report.mjs';
const routine = await loadRoutine(new URL('./examples/routines/mock-desk.json', import.meta.url));
const objects = routine.objects.map((name,i)=>({name,description:name,box_2d:[100,100+i*250,300,200+i*250]}));
let id=0;
function apply(engine,result) { return engine.apply({...engine.request(),frameIds:Array.from({length:engine.phase==='SCAN'?2:3},()=>`receipt-${++id}`)},result); }
function scan(engine) { apply(engine,{status:'checked',objects});apply(engine,{status:'checked',objects}); }
function verdict(engine) { return {status:'checked',predicate:engine.request().predicate,satisfied:true,votes_total:3,votes_for:3,
  frame_verdicts:[0,1,2].map(frame_index=>({frame_index,satisfied:true,confidence:.95,error:null,geometry_override:null}))}; }
function setup(options={}) {
  let now=1000;const camera=new EventEmitter();camera.isCurrent=f=>f.generation===1;
  const game=new GameRuntime({callerVideo:camera,hud:{setState(){}},say:async()=>{},vision:{allowMock:true},routine,
    now:()=>now,intervalMs:0,encode:async()=>Buffer.from('synthetic'),...options});
  const frame=(offset=0,generation=1)=>camera.emit('frame',{sequence:++id,generation,capturedAtMs:now+offset});
  return {game,camera,frame,advance:ms=>{now+=ms;}};
}
async function start(game) { game.start({auto:false});await game.speech;scan(game.engine);await game.speech; }

test('camera blocks initial narration, help, and explicit resume until a fresh current frame arrives',async()=>{
  const {game,camera,frame,advance}=setup();
  try {
    await start(game);advance(100000);await game.tick();assert.equal(game.engine.timeLeft(),90);
    camera.emit('status',{state:'subscribed'});frame(-2000);frame(0,2);
    await game.announce(game.engine.instruction(),{force:true});await game.resume();
    advance(100000);await game.tick();assert.equal(game.engine.timeLeft(),90);
    frame();advance(1000);await game.tick();assert.equal(game.engine.timeLeft(),89);
  } finally {await game.close();}
});

test('camera mute during narration cannot be overridden by completion, help, or resume',async()=>{
  let finish;const x=setup();const {game,camera,frame,advance}=x;
  try {
    frame();await start(game);
    game.say=()=>new Promise(resolve=>{finish=resolve;});
    const narration=game.announce('replay',{force:true});await Promise.resolve();
    camera.emit('status',{state:'muted'});finish();await narration;
    game.say=async()=>{};
    await game.announce(game.engine.instruction(),{force:true});await game.resume();frame();
    advance(100000);await game.tick();assert.equal(game.engine.timeLeft(),90);
    camera.emit('status',{state:'subscribed'});frame();advance(1000);await game.tick();assert.equal(game.engine.timeLeft(),89);
  } finally {await game.close();}
});

test('camera recovery and help preserve manual pause; only explicit resume releases it',async()=>{
  const {game,camera,frame,advance}=setup();
  try {
    frame();await start(game);game.pause();camera.emit('status',{state:'unpublished'});
    await game.announce(game.engine.instruction(),{force:true});camera.emit('status',{state:'subscribed'});frame();
    advance(100000);await game.tick();assert.equal(game.engine.timeLeft(),90);assert.ok(game.pauseReasons.has('manual'));
    await game.resume();advance(1000);await game.tick();assert.equal(game.engine.timeLeft(),89);
  } finally {await game.close();}
});

test('camera recovery cannot clear a speech failure',async()=>{
  const {game,camera,frame,advance}=setup();
  try {
    frame();await start(game);game.say=async()=>{throw Error('speech offline');};
    await game.announce('retry',{force:true});camera.emit('status',{state:'disconnected'});
    camera.emit('status',{state:'subscribed'});frame();advance(100000);await game.tick();
    assert.equal(game.engine.timeLeft(),90);assert.ok(game.pauseReasons.has('voice_failure'));
    game.say=async()=>{};await game.resume();advance(1000);await game.tick();assert.equal(game.engine.timeLeft(),89);
  } finally {await game.close();}
});

const malformed = [
  ['null verdicts',v=>{v.frame_verdicts=[null,null,null];}],
  ['mixed null verdict',v=>{v.frame_verdicts[1]=null;}],
  ['scalar verdict',v=>{v.frame_verdicts[1]='yes';}],
  ['duplicate frame indexes',v=>{v.frame_verdicts[1].frame_index=0;}],
  ['invalid confidence',v=>{v.frame_verdicts[1].confidence=1.5;}],
  ['malformed error',v=>{v.frame_verdicts[1].error={private:'never log'};}],
  ['inconsistent vote count',v=>{v.votes_for=2;}],
];
for(const [name,mutate] of malformed) test(`malformed evidence: ${name} cannot pass, penalize, or retain consensus`,()=>{
  const engine=new RoutineMissionEngine(routine);scan(engine);apply(engine,verdict(engine));assert.equal(engine.streak,1);
  const bad=verdict(engine);mutate(bad);
  assert.equal(apply(engine,bad),false);assert.equal(engine.streak,0);assert.equal(engine.penaltyMs,0);assert.equal(engine.stepIndex,0);
  assert.equal(apply(engine,verdict(engine)),false);assert.equal(engine.results.length,0);
});
test('null perception envelope fails conservatively',()=>{
  const engine=new RoutineMissionEngine(routine);scan(engine);
  assert.equal(apply(engine,null),false);assert.equal(engine.penaltyMs,0);assert.equal(engine.stepIndex,0);
});
test('runtime handles null verdicts without throwing, penalty, or progression',async()=>{
  const {game,frame,advance}=setup();
  try {
    frame();await start(game);game.vision.newRequestId=()=> 'mock-request';
    game.vision.analyze=async()=>({...verdict(game.engine),frame_verdicts:[null,null,null]});
    advance(1000);frame(-600);frame(-400);frame(-200);
    assert.equal(await game.tick(),false);await game.speech;
    assert.equal(game.engine.penaltyMs,0);assert.equal(game.engine.stepIndex,0);assert.equal(game.engine.streak,0);
    assert.match(game.lastHint,/could not check that response/);
  } finally {await game.close();}
});

test('report saves coalesce, retry atomically from a stable snapshot, and never duplicate success',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'routine-retry-'));const original=Error('disk unavailable');let calls=0;
  const writer=routineReportWriter(directory);
  const {game}=setup({onReport:async report=>{calls++;if(calls===1){report.steps.push({status:'corrupted'});throw original;}await writer(report);}});
  try {
    await start(game);assert.equal(await game.flushReport(),false);assert.equal(calls,0);
    // close starts the first save, retries once, and uses the original snapshot.
    await game.close();assert.equal(calls,2);assert.equal(game.reportErrors[0],original);assert.equal(game.reportSaved,true);
    assert.equal(game.reportFailed,false);assert.deepEqual(JSON.parse(await readFile(join(directory,'report.json'),'utf8')).steps,[]);
    await Promise.all([game.flushReport(),game.flushReport(),game.close()]);assert.equal(calls,2);
    await assert.rejects(readFile(join(directory,'report.json.tmp')));
  } finally {await game.close();await rm(directory,{recursive:true,force:true});}
});
test('concurrent report flushes share one in-flight save',async()=>{
  let release,calls=0;const {game}=setup({onReport:()=>{calls++;return new Promise(resolve=>{release=resolve;});}});
  await start(game);const closing=game.close();await new Promise(resolve=>setImmediate(resolve));
  const a=game.flushReport(),b=game.flushReport();assert.equal(a,b);assert.equal(calls,1);
  release();await Promise.all([closing,a,b]);assert.equal(calls,1);assert.equal(await game.flushReport(),true);
});
test('report retry budget is bounded across close and subsequent flushes',async()=>{
  const original=Error('disk unavailable');let calls=0;const {game}=setup({onReport:async()=>{calls++;throw original;}});
  await start(game);await game.close();await game.flushReport();await game.close();
  assert.equal(calls,3);assert.equal(game.reportAttempts,3);assert.equal(game.reportSaved,false);assert.equal(game.reportError,original);
});
test('game cleanup writes a partial report and detaches camera even if pending work rejects',async()=>{
  const original=Error('pending failed');let saves=0;const {game,camera}=setup({onReport:async()=>{saves++;}});
  await start(game);game.pending=Promise.reject(original);
  await assert.rejects(game.close(),error=>error===original);
  assert.equal(saves,1);assert.equal(camera.listenerCount('frame'),0);assert.equal(camera.listenerCount('status'),0);
});
for(const both of [false,true]) test(`session cleanup preserves speech error and closes game (both fail: ${both})`,async()=>{
  const speechError=Error('speech shutdown'),gameError=Error('game shutdown');let closes=0;
  const session=new RoutineSession({speech:{close(){throw speechError;}},game:{async close(){closes++;if(both)throw gameError;}}});
  const closing=session.close();assert.equal(session.close(),closing);
  await assert.rejects(closing,error=>both ? error instanceof AggregateError && error.cause===speechError && error.errors[1]===gameError : error===speechError);
  assert.equal(closes,1);
});
test('mock routine is explicitly labeled and does not replace parent morning objects',async()=>{
  assert.match(routine.name,/MOCK ONLY/);assert.deepEqual(routine.objects,['bottle','notebook','pen']);
  const morning=await loadRoutine(new URL('./examples/routines/morning.json',import.meta.url));
  assert.deepEqual(morning.objects,['toothbrush','backpack','shoes']);
});
