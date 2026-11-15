// No voice/media/provider SDK is opened here. Real uploads require TWO explicit gates:
// this runner's approval flag and the separately approved Python bridge's real mode.
import { parseArgs } from 'node:util';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import sharp from 'sharp';
import { VisionClient } from './vision-client.mjs';
import { loadImageSequence, runImageSequence } from './routine-sequence.mjs';

export async function createMockSequence(directory) {
  const routine=resolve('examples/routines/mock-desk.json');let receipt=0,seed=12345;
  const pixels=new Uint8Array(160*120*3);
  for(let i=0;i<pixels.length;i++){seed=(seed*1664525+1013904223)>>>0;pixels[i]=60+seed%140;}
  const rounds=[];
  for(const stepIndex of [-1,-1,0,0,1,1,2,2]) {
    const images=[];
    for(let i=0;i<(stepIndex<0?2:3);i++) {
      const image=new Uint8Array(pixels);image.fill(50+(++receipt)*6,0,600);
      const name=`synthetic-${receipt}.jpg`;
      await writeFile(join(directory,name),await sharp(image,{raw:{width:160,height:120,channels:3}}).jpeg().toBuffer(),{flag:'wx',mode:0o600});images.push(name);
    }
    rounds.push({stepIndex,images});
  }
  const file=join(directory,'manifest.json');
  await writeFile(file,JSON.stringify({routine:relative(directory,routine),rounds},null,2),{flag:'wx',mode:0o600});
  return file;
}

async function main() {
  const {values}=parseArgs({options:{provider:{type:'string',default:'mock'},manifest:{type:'string'},
    'allow-provider-calls':{type:'boolean',default:false},'dry-run':{type:'boolean',default:false},'delay-ms':{type:'string',default:'0'}}});
  if(!['mock','groq'].includes(values.provider))throw Error('Unsupported provider');
  const delayMs=Number(values['delay-ms']);
  if(!Number.isFinite(delayMs)||delayMs<0||delayMs>10000||(values.provider==='groq'&&delayMs))throw Error('Invalid mock-only delay');
  if(values.provider==='groq'&&(!values.manifest||(!values['dry-run']&&!values['allow-provider-calls'])))throw Error('Real mode requires --manifest and --allow-provider-calls');
  await mkdir('.local',{recursive:true,mode:0o700});
  const directory=await mkdtemp(resolve('.local/routine-sequence-'));
  const file=values.manifest??await createMockSequence(directory);
  const sequence=await loadImageSequence(file);
  if(values['dry-run']) {
    console.log(JSON.stringify({scope:'SEQUENCE_LOCAL_PREFLIGHT',rounds:sequence.rounds.length,
      images:sequence.rounds.reduce((n,r)=>n+r.frames.length,0),providerRequests:0}));return;
  }
  let python,lines,exited,vision;
  try {
    if(values.provider==='mock') {
      python=spawn(process.env.VISION_PYTHON||'python3',['vision-service/bridge.py','--provider','mock','--port','0'],
        {stdio:['ignore','pipe','ignore'],env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
      exited=once(python,'exit');lines=createInterface({input:python.stdout});
      let timer;
      try {
        const ready=await Promise.race([once(lines,'line').then(([s])=>JSON.parse(s)),exited.then(()=>{throw Error('Mock bridge exited');}),
          new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Mock bridge startup timeout')),5000);})]);
        vision=new VisionClient({url:`http://127.0.0.1:${ready.port}`,allowMock:true});
      } finally {clearTimeout(timer);}
    } else vision=new VisionClient(); // existing approved Groq bridge at 127.0.0.1:8765
    const result=await runImageSequence({sequence,vision,directory,delayMs});
    console.log(JSON.stringify({scope:result.scope,provider:result.provider,complete:result.complete,
      steps:result.report.steps.map(s=>s.status),rounds:result.roundResults.length,realWorldVerification:false,
      speech:'SCRIPTED_EVENTS_ONLY',report:join(directory,'report.json')}));
    if(!result.complete||result.report.steps.some(s=>s.status!=='done'))process.exitCode=1;
  } finally {
    lines?.close();if(python){python.kill('SIGTERM');await exited;}
  }
}
// Importing the fixture helper must never launch processes or requests.
if(process.argv[1] && resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)) {
  main().catch(()=>{console.error(JSON.stringify({error:'sequence_run_failed',detail:'Check manifest, bridge availability, approval flags, and local report directory.'}));process.exitCode=1;});
}
