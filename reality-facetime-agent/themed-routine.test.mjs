import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import { loadRoutine,validateRoutine } from './routine-contract.mjs';
import { RoutineMissionEngine } from './routine-engine.mjs';
import { RoutineThemeSession } from './routine-theme-session.mjs';
import { SpeechCoordinator } from './speech-coordinator.mjs';
import { GameRuntime } from './game-runtime.mjs';
import { THEMES } from './themes.mjs';
import { validateThemes } from './theme-selection.mjs';
import { drawJuanRoutine } from './juan-theme-hud.mjs';
import { normalizeRoutineHud } from './routine-hud-state.mjs';
import { diagnostic } from './diagnostics.mjs';
import { normalizeMonster,drawMonster } from './monster.mjs';
const parent=await loadRoutine(new URL('./examples/routines/morning.json',import.meta.url));
const objects=parent.objects.map((name,i)=>({name,description:name,box_2d:[100,100+i*250,300,200+i*250]}));
let receipt=0;
const apply=(engine,result)=>engine.apply({...engine.request(),frameIds:[`f${++receipt}`,`f${++receipt}`]},result);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function setup(){
 let now=1000,calls=0;const states=[],spoken=[],camera=new EventEmitter();camera.isCurrent=()=>true;
 const speech=new SpeechCoordinator({speak:async text=>spoken.push(text)});
 const game=new GameRuntime({routine:{...parent,lives:3,monsterSeconds:25},callerVideo:camera,hud:{setState:s=>states.push(s.gameState)},
 say:(text,options)=>speech.say(text,options),now:()=>now,vision:{allowMock:true,analyze:async()=>{calls++;}},intervalMs:0});
 const flow=new RoutineThemeSession({themes:THEMES,speech,game});
 return {game,flow,states,spoken,advance:ms=>{now+=ms;},get calls(){return calls;},transcript:text=>flow.handleTranscript({isFinal:true,itemId:`u${++receipt}`,transcript:text})};
}

test('production themes are Juan’s actual three worlds',()=>{
 assert.deepEqual(THEMES.map(t=>t.id),['space','odyssey','backrooms']);assert.equal(validateThemes(THEMES).length,3);
 assert.equal(THEMES[0].name,'SPACE MISSION');
});
for(const [choice,id] of [['one','space'],['odyssey','odyssey'],['three','backrooms']])test(`caller chooses and confirms ${id} before any timer or vision starts`,async()=>{
 const f=setup();try{await f.flow.start();assert.equal(f.flow.state,'choosing');assert.equal(f.game.started,undefined);
 assert.ok(f.spoken[0].includes('SPACE MISSION')&&f.spoken[0].includes('ODYSSEY')&&f.spoken[0].includes('BACKROOMS'));
 f.advance(120000);await f.game.tick();assert.equal(f.calls,0);assert.equal(f.game.engine.results.length,0);
 await f.transcript(choice);assert.equal(f.flow.state,'confirming');assert.equal(f.game.started,undefined);
 await f.transcript('yes');await f.game.speech;assert.equal(f.game.started,true);assert.equal(f.game.theme.id,id);
 assert.equal(f.states.at(-1).selectedTheme,id);assert.equal(f.states.at(-1).theme,id);
 assert.ok(f.states.some(s=>s.themeMenu?.candidateId===id));
 }finally{await f.flow.close();}
});
test('declining theme confirmation returns to Juan’s menu without starting gameplay',async()=>{
 const f=setup();try{await f.flow.start();await f.transcript('two');await f.transcript('no');
 assert.equal(f.flow.state,'choosing');assert.equal(f.game.started,undefined);assert.equal(f.calls,0);
 }finally{await f.flow.close();}
});
test('routine pause/help/resume protections still apply after choosing a world',async()=>{
 const f=setup();try{await f.flow.start();await f.transcript('one');await f.transcript('yes');await f.game.speech;
 await f.transcript('pause');assert.ok(f.game.pauseReasons.has('manual'));
 await f.transcript('help');await f.game.speech;assert.ok(f.game.pauseReasons.has('manual'));
 await f.transcript('resume');await f.game.speech;assert.ok(!f.game.pauseReasons.has('manual'));assert.ok(f.game.pauseReasons.has('camera'));
 }finally{await f.flow.close();}
});
test('theme confirmation speech failure never starts the routine',async()=>{
 const f=setup();try{await f.flow.start();await f.transcript('three');f.flow.speech.speak=async()=>{throw Error('speech offline');};
 await f.transcript('yes');assert.equal(f.game.started,undefined);assert.equal(f.flow.state,'paused');assert.equal(f.calls,0);
 }finally{await f.flow.close();}
});
test('monster approaches on authoritative active time and freezes during pauses',()=>{
 let now=1000;const e=new RoutineMissionEngine({...parent,lives:3,monsterSeconds:25},{now:()=>now});
 apply(e,{status:'checked',objects});apply(e,{status:'checked',objects});e.resumeClock();
 assert.deepEqual(e.monster(),{visible:false,closeness:0});now+=70000;e.tick();assert.equal(e.monster().visible,true);
 const before=e.monster().closeness;e.pauseClock();now+=100000;assert.equal(e.monster().closeness,before);assert.equal(e.lives,3);
 e.resumeClock();now+=20000;e.tick();assert.equal(e.lives,2);assert.equal(e.results[0].status,'missed');
});
test('zero lives ends safely with failed outcome and no fabricated future results',()=>{
 let now=1000;const e=new RoutineMissionEngine({...parent,lives:1,monsterSeconds:25},{now:()=>now});
 apply(e,{status:'checked',objects});apply(e,{status:'checked',objects});e.resumeClock();now+=90000;e.tick();
 assert.equal(e.escaped,true);assert.equal(e.outcome,'failed');assert.equal(e.report().complete,false);assert.equal(e.results.length,1);
 assert.equal(e.hudState().lives,0);assert.equal(e.hudState().monster.closeness,1);
});
test('routines without lives/monster fields get the defaults (3 lives, 25 s monster); monsterSeconds 0 turns the monster off',()=>{
 // Merged behavior: every routine is a game. Parents opt out of the monster with monsterSeconds: 0.
 const e=new RoutineMissionEngine(validateRoutine(parent));assert.equal(e.maxLives,3);assert.equal(e.routine.monsterSeconds,25);
 const calm=new RoutineMissionEngine(validateRoutine({...parent,monsterSeconds:0}));assert.deepEqual(calm.monster(),{visible:false,closeness:0});
 for(const changes of [{lives:0},{lives:10},{monsterSeconds:301}])assert.throws(()=>validateRoutine({...parent,...changes}));
});
test('Juan artwork and Shivam monster source hashes match their pinned upstream copies',async()=>{
 for(const name of ['juan-hud/UPSTREAM.json','TEAM-INTEGRATION-SOURCES.json']){
 const manifest=JSON.parse(await readFile(name,'utf8'));const data=name.startsWith('juan')?manifest:manifest.shivam;
 for(const [file,expected] of Object.entries(data.files)){const path=name.startsWith('juan')?`juan-hud/${file}`:file;assert.equal(hash(await readFile(path)),expected,path);}
 }
});
test('Juan chooser, all three selected worlds and monster state render different native frames',()=>{
 const menu=drawJuanRoutine(0,false,{mode:'routine',themeMenu:{state:'choosing',themes:THEMES}});assert.equal(menu.length,540*1170*4);
 const images=[];
 for(const selectedTheme of THEMES.map(t=>t.id)){
 const state={mode:'routine',selectedTheme,missionName:parent.steps[0].label,stepIndex:0,totalSteps:3,timeLeftSeconds:20,
 routineSteps:parent.steps.map((s,i)=>({label:s.label,status:i?'pending':'active'})),lives:3,maxLives:3,monster:{visible:false,closeness:0}};
 const frame=drawJuanRoutine(0,false,state);images.push(hash(frame));assert.notEqual(hash(frame),hash(menu));
 assert.notEqual(hash(drawJuanRoutine(0,false,{...state,monster:{visible:true,closeness:.8}})),hash(frame));
 assert.equal(normalizeRoutineHud(state).lives,3);
 }
 assert.equal(new Set(images).size,3);
});
test('scene-quality diagnostics expose fixed statuses only, not image or provider payloads',()=>{
 let log='';diagnostic('verification_finished',{resultStatus:'unstable_scene',sceneReason:'moving',privateImage:'secret'},(...args)=>{log=args.join(' ');});
 assert.ok(log.includes('unstable_scene')&&log.includes('moving'));assert.ok(!log.includes('secret'));
 assert.equal(normalizeMonster({monster:{visible:true,closeness:2}}).closeness,1);
 const ctx=createCanvas(200,200).getContext('2d');drawMonster(ctx,100,100,30,.5,0);
});
