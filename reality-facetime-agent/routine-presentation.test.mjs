import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { loadRoutine } from './routine-contract.mjs';
import { RoutineMissionEngine } from './routine-engine.mjs';
import { RoutinePresentation } from './routine-presentation.mjs';
import { GameRuntime } from './game-runtime.mjs';
import { buildRoutineUiDemo } from './routine-ui-demo.mjs';
const routine=await loadRoutine(new URL('./examples/routines/morning.json',import.meta.url));
const replay=await buildRoutineUiDemo();

test('runtime sends authoritative mission names, step counts, countdown and progress to the HUD port',()=>{
 for(const state of replay.states){
  assert.equal(state.mode,'routine');assert.equal(state.totalSteps,3);
  if(state.currentStep!==null)assert.equal(state.missionName,routine.steps[state.currentStep-1].label);
  assert.equal(state.missionProgress,state.resolvedSteps/3);
  assert.ok(state.completedSteps<=state.resolvedSteps);
  assert.equal(state.currentStep===null,state.stepIndex<0||state.stepIndex===3);
 }
 for(let i=0;i<3;i++)assert.ok(replay.states.some(s=>s.currentStep===i+1&&Number.isInteger(s.timeLeftSeconds)));
});
test('simulated morning replay exposes start, pending, uncertain, retry, verified, missed and completion events',()=>{
 const names=new Set(replay.events.map(e=>e.name));
 for(const name of ['scan_started','mission_starting','mission_in_progress','verification_pending','observation_accepted',
  'evidence_retry','evidence_uncertain','mission_verified','mission_missed','routine_completed','routine_paused'])assert.ok(names.has(name),name);
 assert.deepEqual(replay.summary.statuses,['done','missed','done']);
 assert.equal(replay.summary.done,2);
});
test('one passing observation cannot announce a verified mission',()=>{
 const observed=replay.states.filter(s=>s.verificationStatus==='observed'&&s.currentStep!==null);
 assert.ok(observed.length);
 for(const s of observed){assert.equal(s.confirmationRounds,1);assert.equal(s.requiredConfirmationRounds,2);
  assert.equal(s.routineSteps[s.currentStep-1].status,'active');}
 const verified=replay.states.filter(s=>s.routineEvent.name==='mission_verified');
 assert.ok(verified.length);for(const s of verified)assert.equal(s.lastOutcome.status,'done');
});
test('outcome persists after next mission starts; missed steps never become verified wins',()=>{
 const next=replay.states.find(s=>s.currentStep===3&&s.routineEvent.name==='mission_starting');
 assert.equal(next.lastOutcome.stepIndex,1);assert.equal(next.lastOutcome.status,'missed');
 const final=replay.states.at(-1);assert.equal(final.uiState,'routine_completed');assert.equal(final.currentStep,null);
 assert.equal(final.completedSteps,2);assert.equal(final.resolvedSteps,3);assert.match(final.missionInstruction,/2 of 3/);
 assert.equal(final.routineSteps[1].status,'missed');
});
test('spoken instructions and starting mission snapshots agree for every step',()=>{
 for(let i=0;i<3;i++){
  const line=replay.announcements.find(a=>a.text.includes(`Step ${i+1}: ${routine.steps[i].label}`));
  assert.ok(line);assert.equal(line.state.missionName,routine.steps[i].label);
  assert.equal(line.state.currentStep,i+1);assert.equal(line.state.narrationStatus,'speaking');
 }
 assert.ok(replay.announcements.some(a=>a.text.includes('completed 2 of 3')));
});
test('display snapshots contain no photos, raw evidence or caller identifiers and cannot mutate the engine',()=>{
 const engine=new RoutineMissionEngine(routine);const presenter=new RoutinePresentation(engine);
 const snapshot=presenter.snapshot(engine.hudState());snapshot.routineSteps[0].label='changed';snapshot.routineEvent.sequence=999;
 assert.equal(engine.routine.steps[0].label,routine.steps[0].label);assert.notEqual(presenter.event.sequence,999);
 const serialized=JSON.stringify(replay.states);
 for(const forbidden of ['data:image','evidenceFrame','capturedAtMs','participantIdentity','trackSid'])assert.ok(!serialized.includes(forbidden),forbidden);
});
test('countdown refreshes keep event IDs stable and invalid event names are rejected',()=>{
 const engine=new RoutineMissionEngine(routine);const presenter=new RoutinePresentation(engine);
 const first=presenter.snapshot(engine.hudState());const second=presenter.snapshot(engine.hudState());
 assert.deepEqual(first.routineEvent,second.routineEvent);assert.throws(()=>presenter.transition('LLM_GUESSED_SUCCESS'));
});
test('pending request cancelled by pause cannot publish a verified HUD event on late completion',async()=>{
 let now=1000,finish,receipt=0;const states=[],camera=new EventEmitter();camera.isCurrent=()=>true;
 const game=new GameRuntime({callerVideo:camera,hud:{setState:s=>states.push(s.gameState)},routine,now:()=>now,intervalMs:0,
  encode:async()=>Buffer.from('mock'),say:async()=>{},vision:{allowMock:true,newRequestId:()=> 'cancel',analyze:()=>new Promise(r=>{finish=r;})}});
 try{game.start({auto:false});await game.speech;now+=1000;
  for(let i=0;i<3;i++)camera.emit('frame',{sequence:++receipt,generation:1,capturedAtMs:now-600+i*200});
  const task=game.tick();await new Promise(r=>setImmediate(r));
  assert.ok(states.some(s=>s.verificationStatus==='pending'));game.pause();const lastId=states.at(-1).routineEvent.sequence;
  finish({status:'checked',objects:[]});await task;
  assert.equal(states.at(-1).uiState,'paused');assert.equal(states.at(-1).routineEvent.sequence,lastId);
  assert.equal(game.engine.stepIndex,-1);assert.equal(states.some(s=>s.routineEvent.name==='mission_verified'),false);
 }finally{await game.close();}
});
test('narration failure holds the timer and exposes a recoverable display state',async()=>{
 const camera=new EventEmitter();camera.isCurrent=()=>true;const states=[];
 const game=new GameRuntime({callerVideo:camera,hud:{setState:s=>states.push(s.gameState)},routine,vision:{allowMock:true},say:async()=>{throw Error('speech failed');}});
 try{game.start({auto:false});await game.speech;const s=states.at(-1);
  assert.equal(s.narrationStatus,'failed');assert.equal(s.uiState,'paused');assert.equal(s.routineEvent.name,'narration_failed');
  assert.ok(s.pauseReasons.includes('voice_failure'));assert.equal(game.engine.results.length,0);
 }finally{await game.close();}
});
