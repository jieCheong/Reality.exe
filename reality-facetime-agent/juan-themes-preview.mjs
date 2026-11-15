// Local source artwork + actual simulated routine states. No SDK/provider/phone call.
import { mkdir,writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { drawJuanRoutine } from './juan-theme-hud.mjs';
import { THEMES } from './themes.mjs';
import { buildRoutineUiDemo } from './routine-ui-demo.mjs';
import { RoutineMissionEngine } from './routine-engine.mjs';
import { RoutinePresentation } from './routine-presentation.mjs';
const demo=await buildRoutineUiDemo({lives:3,monsterSeconds:25}),happy=await buildRoutineUiDemo({lives:3,monsterSeconds:25,missSecondStep:false});
const active=demo.states.find(s=>s.currentStep===1&&s.uiState==='in_progress');
let now=1000,id=0;const engine=new RoutineMissionEngine(demo.routine,{now:()=>now});
const objects=demo.routine.objects.map((name,i)=>({name,description:name,box_2d:[100,100+i*250,300,200+i*250]}));
for(let i=0;i<2;i++)engine.apply({...engine.request(),frameIds:[String(++id),String(++id)]},{status:'checked',objects});
engine.resumeClock();now+=82000;engine.tick();const presenter=new RoutinePresentation(engine);presenter.transition('mission_in_progress');
const near=presenter.snapshot(engine.hudState());
const states=[['choose-theme',{...active,selectedTheme:null,themeMenu:{state:'choosing',candidateId:null,themes:THEMES}}],
 ...THEMES.map(t=>[t.id,{...active,selectedTheme:t.id}]),
 ['monster',{...near,selectedTheme:'backrooms',verificationMode:'mock'}],
 ['checking',{...demo.states.find(s=>s.verificationStatus==='pending'&&s.currentStep===1),selectedTheme:'odyssey'}],
 ['retry',{...demo.states.find(s=>s.routineEvent.name==='evidence_uncertain'),selectedTheme:'space'}],
 ['complete',{...happy.states.at(-1),selectedTheme:'odyssey'}],
 ['missed-summary',{...demo.states.at(-1),selectedTheme:'backrooms'}]];
const directory='.local/juan-themes-preview';await mkdir(directory,{recursive:true});const frames=[],manifest=[];
for(const [name,state] of states){const pixels=drawJuanRoutine(0,false,state);frames.push(Buffer.from(pixels));
 await sharp(pixels,{raw:{width:540,height:1170,channels:4}}).png().toFile(join(directory,`${name}.png`));
 manifest.push({name,state,width:540,height:1170,rotation:0});}
await sharp(Buffer.concat(frames),{raw:{width:540,height:1170*frames.length,pageHeight:1170,channels:4}}).gif({delay:1600,loop:0}).toFile(join(directory,'themes-and-monster.gif'));
await writeFile(join(directory,'manifest.json'),JSON.stringify({scope:'MOCK_JUAN_THEMES_AND_SHIVAM_MONSTER',frames:manifest,providerCalls:0,faceTimeCalls:0},null,2));
console.log(JSON.stringify({directory,frames:frames.length,providerCalls:0,faceTimeCalls:0}));
