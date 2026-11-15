// Actual canvas frames from the same routine renderer used by the LiveKit publisher.
import { mkdir,writeFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { buildRoutineUiDemo } from './routine-ui-demo.mjs';
import { renderRoutineFrame } from './routine-game-hud.mjs';
export async function routinePreviewStates() {
  const replay=await buildRoutineUiDemo(),S=replay.states;
  const find=predicate=>{const state=S.find(predicate);if(!state)throw Error('Missing simulated routine state');return state;};
  return {replay,states:[
    ['welcome',find(s=>s.pauseReasons.includes('not_started'))],
    ['scanning',find(s=>s.currentStep===null&&!s.pauseReasons.length)],
    ['mission-1',find(s=>s.currentStep===1&&s.uiState==='in_progress')],
    ['checking',find(s=>s.currentStep===1&&s.verificationStatus==='pending')],
    ['confirmation',find(s=>s.currentStep===1&&s.verificationStatus==='observed')],
    ['uncertain',find(s=>s.routineEvent.name==='evidence_uncertain')],
    ['retry',find(s=>s.routineEvent.name==='evidence_retry')],
    ['verified',find(s=>s.routineEvent.name==='mission_verified')],
    ['mission-2',find(s=>s.currentStep===2&&s.uiState==='in_progress')],
    ['paused',find(s=>s.routineEvent.name==='routine_paused')],
    ['missed',find(s=>s.routineEvent.name==='mission_missed')],
    ['mission-3',find(s=>s.currentStep===3&&s.uiState==='in_progress')],
    ['complete',S.at(-1)],
  ]};
}
export async function generateRoutinePreview(directory='.local/routine-game-preview') {
  await mkdir(directory,{recursive:true,mode:0o700});
  const {replay,states}=await routinePreviewStates(),manifest=[],images=[];
  for(const [i,[name,state]] of states.entries()){
    const {pixels,screen,layout,textRuns}=renderRoutineFrame(state,{tick:0,speaking:name==='mission-1',captureText:true});
    const file=`${String(i+1).padStart(2,'0')}-${name}.png`;
    const image=sharp(pixels,{raw:{width:540,height:960,channels:4}});
    await image.clone().png().toFile(join(directory,file));
    await image.clone().resize(360,640).png().toFile(join(directory,`phone-${file}`));
    images.push(Buffer.from(pixels));
    manifest.push({name,file,screen,width:540,height:960,rotation:0,layout,textRuns,state});
  }
  await sharp(Buffer.concat(images),{raw:{width:540,height:960*images.length,pageHeight:960,channels:4}})
    .gif({delay:Array.from({length:images.length},()=>1600),loop:0}).toFile(join(directory,'routine-walkthrough.gif'));
  // Separate happy-path replay: no missed step is ever relabeled as done.
  const allDone=await buildRoutineUiDemo({missSecondStep:false});
  const happyStates=[allDone.states[0]];
  for(let step=1;step<=3;step++){
    happyStates.push(allDone.states.find(s=>s.currentStep===step&&s.uiState==='in_progress'));
    happyStates.push(allDone.states.find(s=>s.currentStep===step&&s.verificationStatus==='pending'));
    happyStates.push(allDone.states.find(s=>s.currentStep===step&&s.routineEvent.name==='mission_verified'));
  }
  happyStates.push(allDone.states.at(-1));
  const happyFrames=happyStates.map(s=>Buffer.from(renderRoutineFrame(s).pixels));
  await sharp(Buffer.concat(happyFrames),{raw:{width:540,height:960*happyFrames.length,pageHeight:960,channels:4}})
    .gif({delay:Array.from({length:happyFrames.length},()=>1600),loop:0}).toFile(join(directory,'all-done-walkthrough.gif'));
  await sharp(happyFrames.at(-1),{raw:{width:540,height:960,channels:4}}).png().toFile(join(directory,'complete-all-done.png'));
  await writeFile(join(directory,'all-done-states.json'),JSON.stringify({scope:'MOCK_ALL_DONE',states:happyStates,summary:allDone.summary},null,2)+'\n');
  // 2 seconds of actual 15 FPS mascot/verification animation, independent of GIF slide timing.
  const active=states.find(([name])=>name==='checking')[1],animation=[];
  for(let tick=0;tick<30;tick++)animation.push(Buffer.from(renderRoutineFrame(active,{tick}).pixels));
  await sharp(Buffer.concat(animation),{raw:{width:540,height:960*animation.length,pageHeight:960,channels:4}})
    .gif({delay:Array.from({length:30},(_,i)=>i%3===0?60:70),loop:0}).toFile(join(directory,'orbit-checking-15fps.gif'));
  const thumbs=[];
  for(const row of manifest)thumbs.push(await sharp(join(directory,row.file)).resize(180,320).png().toBuffer());
  const columns=4,rows=Math.ceil(thumbs.length/columns);
  await sharp({create:{width:columns*180,height:rows*320,channels:4,background:'#0a1029'}})
    .composite(thumbs.map((input,i)=>({input,left:(i%columns)*180,top:Math.floor(i/columns)*320}))).png().toFile(join(directory,'contact-sheet.png'));
  await writeFile(join(directory,'manifest.json'),JSON.stringify({scope:'MOCK_ROUTINE_GAME_VISUALS',providerCalls:0,faceTimeCalls:0,frames:manifest},null,2)+'\n',{mode:0o600});
  const titles=JSON.stringify(manifest.map(s=>s.name)),files=JSON.stringify(manifest.map(s=>s.file));
  await writeFile(join(directory,'index.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ORBIT · offline routine demo</title>
<style>body{margin:0;background:#080f24;color:#eaf0ff;font:18px system-ui;display:grid;justify-items:center;padding:24px;gap:12px}img{width:min(360px,90vw);height:auto;border-radius:26px;border:1px solid #66749b}button,select{font:inherit;padding:10px;border-radius:12px;background:#20335a;color:white;border:1px solid #7789b0}p{max-width:600px;text-align:center;color:#b9c8e8}</style>
<h1>ORBIT morning missions</h1><p>OFFLINE MOCK · scripted verification · no FaceTime or provider requests</p><div><button id="play">Play sequence</button> <select id="states" aria-label="Gameplay state"></select></div><img id="frame" alt="Portrait routine game preview"><p>Native 540×960 source, displayed at 360×640. iPhone orientation and FaceTime safe areas still need a real call.</p>
<script>const names=${titles},files=${files},select=document.getElementById('states'),img=document.getElementById('frame');let index=0,timer;names.forEach((name,i)=>{const option=document.createElement('option');option.textContent=name;option.value=i;select.append(option)});function show(){select.value=index;img.src=files[index];img.alt=names[index]+' routine game screen'}select.onchange=()=>{clearInterval(timer);index=Number(select.value);show()};document.getElementById('play').onclick=()=>{clearInterval(timer);index=0;show();timer=setInterval(()=>{index=(index+1)%names.length;show()},1800)};show();</script></html>`,{mode:0o600});
  return {directory,frames:manifest.length,summary:replay.summary};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await generateRoutinePreview()));
