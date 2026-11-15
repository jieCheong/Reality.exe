// Local CPU only; these timings are NOT Groq inference or iPhone latency.
import { performance } from 'node:perf_hooks';
import { writeFile,mkdir } from 'node:fs/promises';
import { loadRoutine } from './routine-contract.mjs';
import { RoutineMissionEngine } from './routine-engine.mjs';
import { renderRoutineFrame } from './routine-game-hud.mjs';
import { encodeJpeg } from './frame-sampler.mjs';
const routine=await loadRoutine(new URL('./examples/routines/morning.json',import.meta.url));
const engine=new RoutineMissionEngine(routine),objects=routine.objects.map((name,i)=>({name,description:name,box_2d:[100,100+i*250,300,200+i*250]}));
const apply=[];let id=0;
for(let i=0;i<40;i++){
 const e=new RoutineMissionEngine(routine);const start=performance.now();
 e.apply({...e.request(),frameIds:[`b${++id}`,`b${++id}`]},{status:'checked',objects});apply.push(performance.now()-start);
}
const state={...engine.hudState(),uiState:'verification_pending',verificationStatus:'pending',verificationMode:'mock'};
for(let i=0;i<3;i++)renderRoutineFrame(state,{tick:i});
const render=[],jpeg=[];let pixels;
for(let i=0;i<25;i++){const start=performance.now();pixels=renderRoutineFrame(state,{tick:i}).pixels;render.push(performance.now()-start);}
for(let i=0;i<10;i++){const start=performance.now();await encodeJpeg({data:pixels,width:540,height:960,format:'rgba',rotation:0});jpeg.push(performance.now()-start);}
const stats=values=>{values.sort((a,b)=>a-b);return {p50Ms:+values[Math.floor(values.length*.5)].toFixed(2),p95Ms:+values[Math.floor(values.length*.95)].toFixed(2),samples:values.length};};
const result={scope:'LOCAL_CPU_ONLY',render:stats(render),engineInventoryApply:stats(apply),jpegEncode:stats(jpeg),frameBudgetMs:1000/15,providerCalls:0,faceTimeCalls:0,
 limitations:'Includes allocation/readback; loopback transport and pure Groq inference are not measured here.'};
await mkdir('.local/routine-game-preview',{recursive:true});await writeFile('.local/routine-game-preview/performance.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
