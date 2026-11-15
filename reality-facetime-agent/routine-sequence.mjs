/** Controlled image REPLAY, not a live camera or proof of a physical action. */
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import sharp from 'sharp';
import { loadRoutine } from './routine-contract.mjs';
import { GameRuntime } from './game-runtime.mjs';
import { SpeechCoordinator } from './speech-coordinator.mjs';
import { routineReportWriter } from './routine-report.mjs';

export async function loadImageSequence(file) {
  const bytes=await readFile(file);
  if(bytes.length>64000)throw Error('Sequence exceeds 64 KB');
  const input=JSON.parse(bytes),base=dirname(resolve(file));
  if(!input || typeof input.routine!=='string' || !Array.isArray(input.rounds))throw Error('Invalid sequence');
  const routine=await loadRoutine(resolve(base,input.routine));
  const expected=[-1,-1,...routine.steps.flatMap((_,i)=>[i,i])];
  if(input.rounds.length!==expected.length)throw Error('Sequence requires two inventories and two rounds per step');
  const hashes=new Set(),rounds=[];
  for(const [i,round] of input.rounds.entries()) {
    const count=expected[i]===-1?2:3;
    if(!round || round.stepIndex!==expected[i] || !Array.isArray(round.images) || round.images.length!==count)throw Error('Invalid round order or image count');
    const frames=[];
    for(const path of round.images) {
      if(typeof path!=='string')throw Error('Invalid image path');
      const data=await readFile(resolve(base,path));
      if(data.length>8_000_000)throw Error('Image file too large');
      const {data:rgba,info}=await sharp(data,{limitInputPixels:4_000_000}).rotate().ensureAlpha().raw().toBuffer({resolveWithObject:true});
      const hash=createHash('sha256').update(`${info.width}:${info.height}:`).update(rgba).digest('hex');
      if(hashes.has(hash))throw Error('Repeated image: use independent photographs for every observation');
      hashes.add(hash);
      frames.push({width:info.width,height:info.height,data:new Uint8Array(rgba),format:'rgba',rotation:0});
    }
    rounds.push({stepIndex:round.stepIndex,frames});
  }
  return {routine,rounds};
}

export async function runImageSequence({sequence,vision,directory,delayMs=0,now=Date.now,wait=sleep}) {
  if(!Number.isFinite(delayMs)||delayMs<0||delayMs>10000||(!vision.allowMock&&delayMs))throw Error('Artificial delay is mock-only, 0–10000 ms');
  const camera=new EventEmitter();camera.isCurrent=f=>f.generation===1;
  const states=[],speechEvents=[],roundResults=[];
  const speech=new SpeechCoordinator({now,speak:async text=>{
    speechEvents.push({event:'start',text});await wait(1);speechEvents.push({event:'end',text});
  }});
  const delayed={allowMock:vision.allowMock,newRequestId:()=>vision.newRequestId(),analyze:async(request,signal)=>{
    const result=await vision.analyze(request,signal);
    if(delayMs)await wait(delayMs,undefined,{signal});
    return result;
  }};
  const game=new GameRuntime({callerVideo:camera,hud:{setState:s=>states.push(s.gameState)},
    say:(text,options)=>speech.say(text,options),vision:delayed,routine:sequence.routine,now,intervalMs:0,onReport:routineReportWriter(directory)});
  let receipt=0;
  try {
    game.start();await game.speech;
    for(const round of sequence.rounds) {
      if(game.engine.escaped||game.engine.stepIndex!==round.stepIndex)break;
      await game.speech;
      for(const frame of round.frames) {
        await wait(220);
        // Replay-ingestion time, deliberately NOT claimed as the photo's original capture time.
        camera.emit('frame',{...frame,sequence:++receipt,generation:1,capturedAtMs:now()});
      }
      const task=game.pending ?? game.tick();const accepted=await task;await game.speech;
      roundResults.push({stepIndex:round.stepIndex,accepted:!!accepted,revision:game.engine.revision});
    }
  } finally {
    try {await speech.close();} finally {await game.close();}
  }
  if(!game.reportSaved)throw Error('Local report save failed');
  return {scope:'CONTROLLED_IMAGE_REPLAY',provider:vision.allowMock?'mock':'groq',complete:game.engine.escaped,
    realWorldVerification:false,report:game.engine.report(),states,speechEvents,roundResults};
}
