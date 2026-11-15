import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { mkdtemp,readFile,rm,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRoutine } from './routine-contract.mjs';
import { GameRuntime } from './game-runtime.mjs';
import { createMockSequence } from './routine-sequence-cli.mjs';
import { loadImageSequence,runImageSequence } from './routine-sequence.mjs';
const routine=await loadRoutine(new URL('./examples/routines/mock-desk.json',import.meta.url));
const objects=routine.objects.map((name,i)=>({name,description:name,box_2d:[100,100+i*250,300,200+i*250]}));
let receipt=0;
function verdict(predicate,satisfied=true){return {status:'checked',predicate,satisfied,votes_total:3,votes_for:satisfied?3:0,
 frame_verdicts:[2,0,1].map(frame_index=>({frame_index,satisfied,confidence:.95,error:null,geometry_override:null,model_satisfied:satisfied,boxes:{}}))};}
function setup(encode=async()=>Buffer.from('synthetic')){
 let now=1000,finish,signal,calls=0;const camera=new EventEmitter();camera.isCurrent=f=>f.generation===1;
 const vision={allowMock:true,newRequestId:()=>`r-${++receipt}`,analyze:async(req,s)=>{calls++;signal=s;return new Promise(resolve=>{finish=result=>resolve(result??verdict(req.predicate));});}};
 const game=new GameRuntime({routine,callerVideo:camera,hud:{setState(){}},say:async()=>{},now:()=>now,vision,encode,intervalMs:0});
 const frames=()=>{for(let i=0;i<3;i++)camera.emit('frame',{sequence:++receipt,generation:1,capturedAtMs:now-600+i*200});};
 return {game,camera,frames,advance:n=>{now+=n;},now:()=>now,get calls(){return calls;},get signal(){return signal;},finish:r=>finish(r)};
}
async function ready(x){x.game.start({auto:false});await x.game.speech;
 for(let i=0;i<2;i++)x.game.engine.apply({...x.game.engine.request(),frameIds:[`s${++receipt}`,`s${++receipt}`]},{status:'checked',objects});
 await x.game.speech;x.advance(1000);x.frames();const pending=x.game.tick();await new Promise(r=>setImmediate(r));return {pending};}
for(const positive of [true,false])test(`delayed ${positive?'positive':'negative'} older than six seconds cannot advance or penalize`,async()=>{
 const x=setup();try{const {pending}=await ready(x);const result=verdict(x.game.engine.request().predicate,positive);
 x.advance(6000);x.finish(result);assert.equal(await pending,false);assert.equal(x.game.engine.stepIndex,0);
 assert.equal(x.game.engine.penaltyMs,0);assert.equal(x.game.engine.streak,0);
 }finally{await x.game.close();}
});
for(const action of ['timeout','pause','disconnect','completion','close'])test(`late response after ${action} is discarded and cannot overwrite step/report`,async()=>{
 const x=setup();try{const {pending}=await ready(x);const originalRevision=x.game.engine.revision;
 if(action==='timeout'){x.advance(90000);void x.game.tick();await x.game.speech;}
 if(action==='pause')x.game.pause();
 if(action==='disconnect')x.camera.emit('status',{state:'unavailable'});
 if(action==='completion'){x.advance(90000);x.game.engine.tick();await x.game.speech;
  while(!x.game.engine.escaped){x.game.engine.resumeClock(x.now());x.advance(100000);x.game.engine.tick();await x.game.speech;}}
 let closing;if(action==='close')closing=x.game.close();
 const snapshot=x.game.engine.report();assert.ok(x.signal.aborted);
 x.finish();assert.equal(await pending,false);await closing;
 assert.deepEqual(x.game.engine.report(),snapshot);assert.equal(x.game.engine.penaltyMs,0);
 if(action==='timeout')assert.equal(x.game.engine.revision,originalRevision+1);
 }finally{await x.game.close();}
});
test('encoding that outlives freshness is discarded before provider dispatch',async()=>{
 let release;const x=setup(()=>new Promise(resolve=>{release=()=>resolve(Buffer.from('old'));}));
 try{x.game.start({auto:false});await x.game.speech;x.advance(1000);x.frames();const pending=x.game.tick();
 await Promise.resolve();x.advance(6000);
 // Resolve each sequential encode without opening a provider request.
 for(let i=0;i<2;i++){release();await Promise.resolve();await Promise.resolve();}
 assert.equal(await pending,false);assert.equal(x.calls,0);
 }finally{await x.game.close();}
});
test('capture timestamp is preserved through encoding and request dispatch',async()=>{
 let received;const x=setup();x.game.vision.analyze=async req=>{received=req;return {status:'checked',objects};};
 try{x.game.start({auto:false});await x.game.speech;x.advance(1000);x.frames();const expected=x.game.frames.slice(-2).map(f=>f.capturedAtMs);
 await x.game.tick();assert.deepEqual(received.frames.map(f=>f.capturedAtMs),expected);
 }finally{await x.game.close();}
});
test('image-sequence runner preflights independent files and completes all missions with serialized speech/report photos',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'routine-sequence-'));let now=1000,calls=0,lastRequest;
 try{const file=await createMockSequence(directory);const sequence=await loadImageSequence(file);
 const vision={allowMock:true,newRequestId:()=>`sequence-${++receipt}`,analyze:async req=>{calls++;lastRequest=req;
 return req.operation==='inventory'?{status:'checked',objects}:verdict(req.predicate);}};
 const result=await runImageSequence({sequence,vision,directory,now:()=>now,wait:async ms=>{now+=ms;}});
 assert.equal(calls,8);assert.deepEqual(result.report.steps.map(s=>s.status),['done','done','done']);
 assert.ok(result.report.steps.every(s=>s.evidenceFrame.dataUrl.startsWith('data:image/jpeg;base64,/9j/')));
 assert.equal(result.report.steps[2].evidenceFrame.id,lastRequest.frames[2].id);
 assert.equal(result.report.steps[2].evidenceFrame.capturedAtMs,lastRequest.frames[2].capturedAtMs);
 assert.ok(result.states.some(s=>s.timeLeftSeconds!==null));
 for(let i=0;i<result.speechEvents.length;i+=2){assert.equal(result.speechEvents[i].event,'start');assert.equal(result.speechEvents[i+1].event,'end');}
 assert.deepEqual(JSON.parse(await readFile(join(directory,'report.json'),'utf8')).steps.map(s=>s.status),['done','done','done']);
 const manifest=JSON.parse(await readFile(file,'utf8'));manifest.rounds[1].images[0]=manifest.rounds[0].images[0];
 await writeFile(file,JSON.stringify(manifest));await assert.rejects(loadImageSequence(file),/Repeated image/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('uncertain replay evidence never advances or penalizes the child',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'routine-uncertain-'));let now=1000;
 try{const sequence=await loadImageSequence(await createMockSequence(directory));
 const vision={allowMock:true,newRequestId:()=>`uncertain-${++receipt}`,analyze:async req=>{
 if(req.operation==='inventory')return {status:'checked',objects};
 const v=verdict(req.predicate,false);v.frame_verdicts.forEach(f=>{f.confidence=.3;});return v;}};
 const result=await runImageSequence({sequence,vision,directory,now:()=>now,wait:async ms=>{now+=ms;}});
 assert.equal(result.complete,false);assert.deepEqual(result.report.steps,[]);
 assert.ok(result.states.every(s=>s.timeLeftSeconds===null||s.timeLeftSeconds>=89));
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('real provider cannot use the artificial delayed-response mode',async()=>{
 await assert.rejects(runImageSequence({vision:{allowMock:false},delayMs:100}),/mock-only/);
});
