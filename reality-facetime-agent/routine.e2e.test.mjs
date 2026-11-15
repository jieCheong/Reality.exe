// Actual loopback HTTP and JPEG pipeline; synthetic images, FakeVision, speech/HUD spies.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { EventEmitter, once } from 'node:events';
import { createInterface } from 'node:readline';
import { GameRuntime } from './game-runtime.mjs';
import { VisionClient } from './vision-client.mjs';
import { SpeechCoordinator } from './speech-coordinator.mjs';
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));

test('MOCK routine end-to-end: scan → fail/penalty → all parent steps → evidence report', {timeout:30000}, async()=>{
  const python=spawn(process.env.VISION_PYTHON||'python3',['vision-service/bridge.py','--provider','mock','--port','0'],{
    stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'},
  });
  const exited=once(python,'exit');const lines=createInterface({input:python.stdout});let game;
  const speech=new SpeechCoordinator({speak:async text=>spoken.push(text)}),spoken=[],reports=[],states=[];
  try {
    const ready=await Promise.race([once(lines,'line').then(([line])=>JSON.parse(line)),
      exited.then(()=>{throw Error('Mock vision service exited before startup');}),sleep(5000).then(()=>{throw Error('Mock startup timeout');})]);
    const routine={id:'mock-routine',name:'MOCK ONLY routine',theme:'space',
      timer:{startSeconds:90,stepDecreaseSeconds:10,minSeconds:30,fakeDonePenaltySeconds:5,missPenaltySeconds:15},
      objects:['bottle','notebook','pen'],steps:[
        {label:'Show the pen',check:'HELD_UP',objects:['pen']},
        {label:'Bottle on notebook',check:'ON_TOP_OF',objects:['bottle','notebook']},
        {label:'Notebook left of pen',check:'LEFT_OF',objects:['notebook','pen']},
      ]};
    const camera=new EventEmitter();camera.isCurrent=f=>f.generation===1;
    const vision=new VisionClient({url:`http://127.0.0.1:${ready.port}`,allowMock:true});
    const analyze=vision.analyze.bind(vision);let scenario,rounds=0;
    vision.analyze=async(request,signal)=>{rounds++;return analyze({...request,...(scenario?{mockScenario:scenario}:{})},signal);};
    game=new GameRuntime({callerVideo:camera,hud:{setState:update=>states.push(update.gameState)},
      say:(text,options)=>speech.say(text,options),vision,routine,intervalMs:0,onReport:async report=>reports.push(report)});
    game.start({auto:false});await game.speech;
    let sequence=0,seed=12345;const pixels=new Uint8Array(160*120*4);
    for(let i=0;i<pixels.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const v=60+seed%140;pixels.set([v,v,v,255],i);}
    async function round(){
      await game.speech;
      for(let i=0;i<3;i++){
        await sleep(220);const data=new Uint8Array(pixels);data.fill(60+(++sequence%8)*20,0,400);
        camera.emit('frame',{sequence,generation:1,participantIdentity:'chert-bridge-MOCK',trackSid:'MOCK-video',
          timestampUs:String(Date.now()*1000),capturedAtMs:Date.now(),width:160,height:120,rotation:0,format:'rgba',data});
      }
      await game.tick();
    }
    await round();assert.equal(game.engine.phase,'SCAN');await round();await game.speech;
    assert.equal(game.engine.stepIndex,0);
    scenario='fail';await round();await game.speech;assert.equal(game.engine.stepIndex,0);assert.equal(game.engine.penaltyMs,5000);
    scenario=undefined;
    for(let i=0;i<3;i++){
      assert.equal(game.engine.stepIndex,i);await round();assert.equal(game.engine.stepIndex,i);
      await round();await game.speech;
    }
    await game.flushReport();
    assert.equal(game.engine.escaped,true);assert.equal(reports.length,1);
    assert.equal(reports[0].complete,true);assert.equal(reports[0].verification,'mock');
    assert.deepEqual(reports[0].steps.map(s=>s.status),['done','done','done']);
    assert.ok(reports[0].steps.every(s=>s.evidenceFrame.dataUrl.startsWith('data:image/jpeg;base64,/9j/')));
    assert.ok(states.some(s=>s.timeLeftSeconds!==null));assert.equal(states.at(-1).missionProgress,1);
    assert.ok(spoken.some(text=>text.includes('camera')));assert.ok(spoken.some(text=>text.includes('Step verified')));
    assert.ok(spoken.some(text=>text.includes('Routine finished')));
    console.log(JSON.stringify({scope:'MOCK_ROUTINE_LOCAL_HTTP',visionRounds:rounds,completedSteps:3,
      reportPhotos:reports[0].steps.length,providerCalls:0,faceTimeCalls:0,realWorldVerification:false}));
  } finally {await speech.close();await game?.close();lines.close();python.kill('SIGTERM');await exited;}
});
