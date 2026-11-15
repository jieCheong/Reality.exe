// Saved handoff samples only. No room, provider, voice or caller camera.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { RoutineMissionEngine } from './mission-engine.mjs';
const routine=JSON.parse(await readFile(new URL('./examples/routines/morning.json',import.meta.url),'utf8'));
let now=1000,sequence=0;const engine=new RoutineMissionEngine(routine,{now:()=>now});
const states=[],messages=[];
engine.on('state',s=>states.push(s));engine.on('message',s=>messages.push(s));
states.push(engine.hudState());messages.push(engine.instruction());
const objects=routine.objects.map((name,i)=>({name,description:'MOCK sample object',box_2d:[100,100+i*250,300,200+i*250]}));
const apply=result=>engine.apply({...engine.request(),frameIds:Array.from({length:engine.phase==='SCAN'?2:3},()=>`MOCK-${++sequence}`)},result,
  {id:`MOCK-${sequence}`,capturedAtMs:now,dataUrl:photo});
const jpeg=await sharp({create:{width:160,height:120,channels:3,background:{r:30,g:80,b:120}}}).jpeg().toBuffer();
const photo=`data:image/jpeg;base64,${jpeg.toString('base64')}`;
const verdict=(pass=true)=>({status:'checked',predicate:engine.request().predicate,satisfied:pass,votes_for:pass?3:0,votes_total:3,
  evidence:'MOCK scripted example, not recognition',frame_verdicts:[0,1,2].map(frame_index=>({frame_index,satisfied:pass,confidence:.95,error:null,geometry_override:null}))});
apply({status:'checked',objects});apply({status:'checked',objects});engine.resumeClock();
now+=2000;engine.tick();apply(verdict(false));engine.resumeClock();now+=1000;
apply(verdict());apply(verdict());engine.resumeClock();
now+=engine.budgetSeconds*1000;engine.tick();engine.resumeClock();
now+=2000;apply(verdict());apply(verdict());
const directory='.local/routine-preview';await mkdir(directory,{recursive:true});
await writeFile(join(directory,'hud-states.json'),JSON.stringify({verification:'mock',states},null,2)+'\n');
await writeFile(join(directory,'report.json'),JSON.stringify({...engine.report(),verification:'mock'},null,2)+'\n');
await writeFile(join(directory,'announcements.json'),JSON.stringify({verification:'mock',messages},null,2)+'\n');
console.log(JSON.stringify({scope:'MOCK_ROUTINE_HANDOFF',directory,steps:engine.results.map(s=>s.status),providerCalls:0,faceTimeCalls:0}));
