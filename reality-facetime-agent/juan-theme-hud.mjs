/** Juan's untouched native artwork + deterministic routine/monster overlay. */
import { createCanvas } from '@napi-rs/canvas';
import { drawFace as drawJuanFace, WIDTH,HEIGHT } from './juan-hud/face.mjs';
import { drawMonster,drawHearts } from './monster.mjs';
import { normalizeRoutineHud,formatRoutineTime } from './routine-hud-state.mjs';
const canvas=createCanvas(WIDTH,HEIGHT),ctx=canvas.getContext('2d');
const skins={
 space:{panel:'#f8fcff',border:'#12395e',text:'#102f50',muted:'#4d6c88',accent:'#d6322b',font:'Michroma'},
 odyssey:{panel:'#f2e7cd',border:'#866b45',text:'#4d6378',muted:'#64788a',accent:'#536d82',font:'GFSDidot'},
 backrooms:{panel:'#f6efcc',border:'#6e6441',text:'#302f26',muted:'#615b43',accent:'#8d7c49',font:'BackroomsSansBold'},
};
function panel(x,y,w,h,S){ctx.fillStyle=S.panel;ctx.strokeStyle=S.border;ctx.lineWidth=1.5;ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);ctx.strokeRect(x+5,y+5,w-10,h-10);}
function words(value,x,y,width,size,font,color,maxLines=3){
 ctx.font=`${size}px ${font}`;ctx.fillStyle=color;ctx.textAlign='left';let line='',lines=[];
 for(const word of String(value).split(/\s+/)){const next=line?line+' '+word:word;if(ctx.measureText(next).width>width&&line){lines.push(line);line=word;}else line=next;}
 if(line)lines.push(line);lines=lines.slice(0,maxLines);
 for(const [i,s] of lines.entries())ctx.fillText(s,x,y+i*size*1.3,width);
}
export function drawJuanRoutine(tick,speaking,input={}) {
 const state=normalizeRoutineHud(input),theme=state.themeMenu?null:state.selectedTheme;
 const base=drawJuanFace(tick,speaking,theme);const frame=ctx.createImageData(WIDTH,HEIGHT);frame.data.set(base);ctx.putImageData(frame,0,0);
 if(!theme){
  const S={panel:'#101f2a',border:'#28404b',text:'#eaf4f5'};
  panel(32,884,476,196,S);
  const choice=state.themeMenu?.candidateId;
  words(choice?`${choice.toUpperCase()}? Say yes to confirm, or no to choose again.`:'Say one, two, three, or the world name.',58,944,424,23,'Orbitron',S.text,3);
  return new Uint8Array(ctx.getImageData(0,0,WIDTH,HEIGHT).data);
 }
 const S=skins[theme];
 panel(24,300,492,476,S);
 const finished=state.uiState==='routine_completed';
 const heading=finished?(state.outcome==='failed'?'TRY AGAIN NEXT TIME':'ROUTINE FINISHED'):state.currentStep?`MISSION ${state.currentStep} OF ${state.totalSteps}`:'SHOW YOUR OBJECTS';
 words(heading,50,352,440,20,S.font,S.muted,1);
 words(finished?`${state.completedSteps} of ${state.totalSteps} missions checked`:state.missionName,50,418,440,theme==='space'?27:36,S.font,S.text,3);
 const status=finished?'Thanks for trying with ORBIT.':state.verificationStatus==='pending'?'Checking your mission…':state.verificationStatus==='observed'?'One check done. Hold still.':['uncertain','retry'].includes(state.verificationStatus)?'Let me take another look.':state.routineEvent.name==='mission_missed'?'Time is up. Let’s try the next mission.':state.routineEvent.name==='mission_verified'?'Mission checked!':state.paused?'Paused — take your time.':'Follow ORBIT and keep the action visible.';
 words(status,50,566,440,theme==='space'?20:26,S.font,S.muted,3);
 words(finished?`Active time: ${formatRoutineTime(state.elapsedSeconds)}`:state.currentStep?`Time left: ${formatRoutineTime(state.timeLeftSeconds)}`:'Keep all routine objects visible.',50,706,440,theme==='space'?20:27,S.font,S.accent,2);
 if(state.lastOutcome&&!finished)words(state.lastOutcome.status==='done'?`Mission ${state.lastOutcome.stepIndex+1} checked!`:'Next mission, fresh start.',50,832,440,20,S.font,S.text,1);
 panel(32,884,476,196,S);words('YOUR MISSIONS',58,924,424,20,S.font,S.muted,1);
 const count=state.routineSteps.length;
 state.routineSteps.forEach((step,i)=>{
  const x=count===1?270:78+i*(384/Math.max(1,count-1));ctx.beginPath();ctx.arc(x,1000,12,0,Math.PI*2);ctx.fillStyle=step.status==='done'?S.accent:S.panel;ctx.fill();ctx.strokeStyle=S.border;ctx.stroke();
  words(String(i+1),x-6,1007,18,15,S.font,step.status==='done'?S.panel:S.text,1);
 });
 words(`${state.completedSteps} of ${state.totalSteps} checked`,58,1055,424,20,S.font,S.text,1);
 if(state.maxLives)drawHearts(ctx,500,135,25,state.lives,state.maxLives,{red:'#cc4f6a',dim:S.muted});
 if(state.monster?.visible)drawMonster(ctx,440,215,24+state.monster.closeness*35,state.monster.closeness,tick);
 if(state.verificationMode==='mock')words('MOCK VISION',32,1138,476,16,S.font,S.accent,1);
 return new Uint8Array(ctx.getImageData(0,0,WIDTH,HEIGHT).data);
}
