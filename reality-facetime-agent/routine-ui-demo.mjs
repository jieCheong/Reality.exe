// Jie-owned contract replay: no renderer, camera, room, voice provider or vision API.
import { EventEmitter } from 'node:events';
import { mkdir,writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRoutine } from './routine-contract.mjs';
import { GameRuntime } from './game-runtime.mjs';
import { SpeechCoordinator } from './speech-coordinator.mjs';

export async function buildRoutineUiDemo({ missSecondStep = true, lives, monsterSeconds = 0 } = {}) {
  const base=await loadRoutine(new URL('./examples/routines/morning.json',import.meta.url));
  const routine=lives===undefined?base:{...base,lives,monsterSeconds};
  let now=1000,receipt=0,scenario='pass',report;
  const states=[],announcements=[],events=[];
  const camera=new EventEmitter();camera.isCurrent=f=>f.generation===1;
  const objects=routine.objects.map((name,i)=>({name,description:'MOCK routine prop',box_2d:[100,100+i*250,300,200+i*250]}));
  const speech=new SpeechCoordinator({now:()=>now,speak:async text=>{announcements.push({text,state:structuredClone(states.at(-1))});}});
  const vision={allowMock:true,newRequestId:()=>`ui-${receipt}`,analyze:async req=>{
    if(req.operation==='inventory')return {status:'checked',objects};
    const yes=scenario==='pass';
    return {status:'checked',predicate:req.predicate,satisfied:yes,votes_total:3,votes_for:yes?3:0,
      frame_verdicts:[0,1,2].map(frame_index=>({frame_index,satisfied:yes,confidence:scenario==='uncertain'?.3:.95,error:null,geometry_override:null}))};
  }};
  const game=new GameRuntime({callerVideo:camera,hud:{setState:update=>{
    const state=structuredClone(update.gameState);states.push(state);
    if(events.at(-1)?.sequence!==state.routineEvent.sequence)events.push({...state.routineEvent});
  }},routine,vision,now:()=>now,intervalMs:0,encode:async()=>Buffer.from('MOCK no camera'),
    say:(text,options)=>speech.say(text,options),onReport:async r=>{report=r;}});
  const round=async()=>{
    await game.speech;now+=1000;
    for(let i=0;i<3;i++)camera.emit('frame',{sequence:++receipt,generation:1,capturedAtMs:now-600+i*200});
    await game.tick();await game.speech;
  };
  try {
    game.updateHud(game.engine.hudState()); // Actual pre-bridge welcome snapshot.
    game.start({auto:false});await game.speech;
    await round();await round();
    scenario='uncertain';await round();scenario='fail';await round();
    scenario='pass';await round();await round();
    game.pause();await game.resume();
    // Exercise a missed second step and successful final step in the same replay.
    if (missSecondStep) { now+=game.engine.timeLeft()*1000;await game.tick();await game.speech; }
    else { await round();await round(); }
    await round();await round();await game.flushReport();
    return {scope:'MOCK_ROUTINE_UI_CONTRACT',routine,states,events,announcements,report:structuredClone(report),
      summary:{complete:game.engine.escaped,statuses:report.steps.map(s=>s.status),done:report.steps.filter(s=>s.status==='done').length},
      providerCalls:0,faceTimeCalls:0};
  } finally {await speech.close();await game.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=await buildRoutineUiDemo();const directory='.local/routine-ui-preview';
  await mkdir(directory,{recursive:true,mode:0o700});
  await writeFile(join(directory,'states.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({scope:result.scope,directory,states:result.states.length,events:result.events.map(e=>e.name),...result.summary,providerCalls:0,faceTimeCalls:0}));
}
