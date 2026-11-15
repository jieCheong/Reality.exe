/** Native canvas routine game. No media connections, transforms, or mission authority. */
import { GlobalFonts,createCanvas } from '@napi-rs/canvas';
import { fileURLToPath } from 'node:url';
import { normalizeRoutineHud,routineScreen,formatRoutineTime } from './routine-hud-state.mjs';
for(const [name,file] of [['Routine Sans','IBMPlexSansCondensed-Regular.ttf'],['Routine Sans Semibold','IBMPlexSansCondensed-SemiBold.ttf']]) {
  if(!GlobalFonts.registerFromPath(fileURLToPath(new URL(`./assets/${file}`,import.meta.url)),name))throw Error('Bundled routine font unavailable');
}
export const ROUTINE_PALETTE=Object.freeze({background:'#0a1029',panel:'#182345',text:'#f5f7ff',muted:'#bdc9e7',teal:'#6cf1cf',blue:'#71b3ff',purple:'#bba0ff'});
export function routineLayout(width,height) {
  const portrait=height>width;
  if(portrait){const dy=(height-960)/2;return {portrait,safe:{x:24,y:96+dy,width:width-48,height:724},
    header:{x:32,y:100+dy,width:width-64,height:40},hero:{x:width/2-100,y:164+dy,width:200,height:170},
    caption:{x:80,y:338+dy,width:width-160,height:32},card:{x:28,y:390+dy,width:width-56,height:240},
    progress:{x:28,y:654+dy,width:width-56,height:108},footer:{x:28,y:790+dy,width:width-56,height:26}};}
  return {portrait,safe:{x:24,y:24,width:width-48,height:height-48},
    header:{x:28,y:25,width:width-56,height:32},hero:{x:35,y:75,width:145,height:136},
    caption:{x:28,y:214,width:160,height:32},card:{x:210,y:70,width:width-238,height:190},
    progress:{x:28,y:276,width:width-56,height:44},footer:{x:28,y:324,width:width-56,height:12}};
}
function wrap(ctx,text,width) {
  const lines=[];let line='';
  for(const word of String(text).trim().split(/\s+/)){
    const combined=line?line+' '+word:word;
    if(ctx.measureText(combined).width<=width){line=combined;continue;}
    if(line){lines.push(line);line='';}
    for(const char of word){
      if(line&&ctx.measureText(line+char).width>width){lines.push(line);line='';}
      line+=char;
    }
  }
  if(line)lines.push(line);return lines;
}

const animations=new WeakMap();
export function drawRoutineGame(ctx,tick,speaking,input,{captureText=false}={}) {
  const state=normalizeRoutineHud(input),screen=routineScreen(state),width=ctx.canvas.width,height=ctx.canvas.height;
  const L=routineLayout(width,height),P=ROUTINE_PALETTE,textRuns=[];
  const box=(b,fill=P.panel,stroke='#34446e',radius=22)=>{ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(b.x,b.y,b.width,b.height,radius);ctx.fill();ctx.stroke();};
  const text=(value,b,size=24,{color=P.text,weight='semibold',maxLines=1,align='left',role='text'}={})=>{
    const family=weight==='semibold'?'Routine Sans Semibold':'Routine Sans';let lines;
    let fitted=size;
    do{ctx.font=`${fitted}px "${family}"`;lines=wrap(ctx,value,b.width);if(lines.length<=maxLines)break;fitted--;}while(fitted>Math.max(16,size-4));
    const lineHeight=fitted*1.12,limit=Math.max(1,Math.min(maxLines,Math.floor(b.height/lineHeight)));
    if(lines.length>limit){lines=lines.slice(0,limit);let last=lines.at(-1);while(last&&ctx.measureText(last+'…').width>b.width)last=last.slice(0,-1);lines[lines.length-1]=last+'…';}
    ctx.save();ctx.beginPath();ctx.rect(b.x,b.y,b.width,b.height);ctx.clip();ctx.fillStyle=color;ctx.textAlign=align;ctx.textBaseline='alphabetic';
    for(const [i,line] of lines.entries()){
      const x=align==='center'?b.x+b.width/2:align==='right'?b.x+b.width:b.x,baseline=b.y+fitted*.9+i*lineHeight;
      ctx.fillText(line,x,baseline);
      if(captureText)textRuns.push({text:line,x:align==='left'?x:align==='center'?x-ctx.measureText(line).width/2:x-ctx.measureText(line).width,
        baseline,width:ctx.measureText(line).width,fontSize:fitted,role});
    }ctx.restore();
  };
  const check=(x,y,color=P.teal,size=9)=>{ctx.strokeStyle=color;ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x-size,y);ctx.lineTo(x-size/4,y+size*.7);ctx.lineTo(x+size,y-size*.7);ctx.stroke();};
  const star=(x,y,r,color)=>{ctx.fillStyle=color;ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?r*.45:r;const px=x+Math.cos(a)*rr,py=y+Math.sin(a)*rr;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fill();};
  ctx.save();try{
    const bg=ctx.createLinearGradient(0,0,width,height);bg.addColorStop(0,'#0b1535');bg.addColorStop(.55,'#1b1841');bg.addColorStop(1,'#07162d');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
    for(let i=0;i<24;i++){ctx.fillStyle=i%3?'#52668a':'#8b86bf';ctx.globalAlpha=.28;ctx.beginPath();ctx.arc((i*137+31)%width,(i*173+67)%height,i%3===0?1.5:1,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
    const glow=ctx.createRadialGradient(width*.5,L.hero.y+70,0,width*.5,L.hero.y+70,width*.65);glow.addColorStop(0,'#34418b65');glow.addColorStop(1,'#14214a00');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
    text('ORBIT',L.header,L.portrait?25:22,{color:P.teal,role:'brand'});
    text(state.verificationMode==='mock'?'MOCK · SCRIPTED':state.routineName.toUpperCase(),{x:L.header.x+130,y:L.header.y+6,width:L.header.width-130,height:30},L.portrait?18:16,{color:P.muted,align:'right',role:'brand'});
    // Friendly robot: position is animated, but the entire frame and all text stay upright.
    const hx=L.hero.x+L.hero.width/2,hy=L.hero.y+L.hero.height*.49+Math.sin(tick/18)*2.5,r=L.portrait?64:46;
    const mood=screen==='complete'?'complete':screen==='success'?'success':screen==='verifying'?'verifying':screen==='retry'?'retry':speaking?'speaking':state.paused?'waiting':'listening';
    ctx.strokeStyle='#8990f455';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(hx,hy+8,r*1.5,r*.78,0,0,Math.PI*2);ctx.stroke();
    if(mood==='verifying'){ctx.strokeStyle=P.teal;ctx.lineWidth=3;ctx.beginPath();const angle=tick/32;ctx.arc(hx,hy,r*1.35,angle,angle+Math.PI*.65);ctx.stroke();}
    ctx.strokeStyle=P.purple;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(hx,hy-r*.8);ctx.lineTo(hx,hy-r*1.17);ctx.stroke();ctx.fillStyle=P.teal;ctx.beginPath();ctx.arc(hx,hy-r*1.25,6,0,Math.PI*2);ctx.fill();
    for(const side of [-1,1]){ctx.fillStyle='#6a72c9';ctx.beginPath();ctx.ellipse(hx+side*r*1.1,hy+17,11,21,side*.2,0,Math.PI*2);ctx.fill();}
    const head=ctx.createLinearGradient(hx-r,hy-r,hx+r,hy+r);head.addColorStop(0,'#d6ddff');head.addColorStop(.4,'#a7b9f5');head.addColorStop(1,'#6e7bd2');
    box({x:hx-r,y:hy-r*.75,width:r*2,height:r*1.62},head,'#d5e2ff',28);
    box({x:hx-r*.81,y:hy-r*.49,width:r*1.62,height:r*.97},'#111d3b','#52629a',20);
    for(const side of [-1,1]){
      const ex=hx+side*r*.37,ey=hy-r*.05;
      if(['success','complete'].includes(mood)){ctx.strokeStyle=P.teal;ctx.lineWidth=5;ctx.beginPath();ctx.arc(ex,ey+6,9,Math.PI*1.15,Math.PI*1.85);ctx.stroke();}
      else{ctx.fillStyle=P.teal;ctx.beginPath();ctx.ellipse(ex,ey,mood==='retry'?8:9,tick%150>144?2:mood==='waiting'?8:13,0,0,Math.PI*2);ctx.fill();}
    }
    ctx.strokeStyle='#263c68';ctx.lineWidth=3;ctx.lineCap='round';ctx.beginPath();ctx.arc(hx,hy+r*.52,10,0,Math.PI);ctx.stroke();
    if(speaking){ctx.strokeStyle=P.teal;ctx.lineWidth=3;for(let i=0;i<3;i++){const h=4+Math.sin((tick+i*3)/3)*3;ctx.beginPath();ctx.moveTo(hx-8+i*8,hy+r*.67-h);ctx.lineTo(hx-8+i*8,hy+r*.67+h);ctx.stroke();}}
    if(['success','complete'].includes(mood))for(let i=0;i<4;i++)star(hx+(i<2?-1:1)*(r+18+(i%2)*16),hy-30+(i%2)*64,5+(i%2)*2,i%2?P.purple:P.teal);
    const caption=speaking?'ORBIT is speaking':screen==='verifying'?'Taking a careful look':screen==='retry'?'We can try together':screen==='complete'?'You did it your way':state.pauseReasons.includes('camera')?'Waiting for your camera':screen==='paused'?'Take a little break':"I'm here with you";
    box(L.caption,'#23304f','#40527d',16);text(caption,{...L.caption,x:L.caption.x+6,width:L.caption.width-12,y:L.caption.y+3,height:29},L.portrait?21:17,{align:'center',color:P.teal,role:'caption'});
    box(L.card,'#1b2948','#51628b',24);
    const C=L.card,pad=L.portrait?22:18,inner=C.width-pad*2;
    const time=state.currentStep!==null&&screen!=='complete'&&screen!=='missed'&&screen!=='success';
    text(screen==='complete'?'MORNING WRAP-UP':state.currentStep?`MISSION ${state.currentStep} OF ${state.totalSteps}`:'LET’S GET READY',
      {x:C.x+pad,y:C.y+16,width:inner-(time?96:0),height:28},L.portrait?18:16,{color:P.purple,role:'step'});
    if(time){box({x:C.x+C.width-104,y:C.y+12,width:82,height:34},'#293b5a','#5977a0',13);
      text(formatRoutineTime(state.timeLeftSeconds),{x:C.x+C.width-101,y:C.y+14,width:76,height:30},25,{align:'center',color:P.teal,role:'timer'});}
    let title=state.missionName,detail='Show the action. ORBIT will take a look.',feedback='Take your time. You’ve got this.';
    const instructionMarker=state.missionName+'. ';
    const instructionAt=state.missionInstruction.indexOf(instructionMarker);
    if(instructionAt>=0){
      const extra=state.missionInstruction.slice(instructionAt+instructionMarker.length).replace(/^You have \d+ seconds\.\s*/,'');
      if(extra)detail=extra;
    }
    if(screen==='welcome'){title=state.routineId==='morning'?'Ready for your morning mission?':'Ready for your next mission?';detail='';feedback='';}
    if(screen==='scanning'){title='Show your routine objects';const needed=state.objective.replace('[MOCK VISION] ','').match(/^SHOW:\s*(.+)$/)?.[1];detail=needed?`Show ${needed}. Hold steady.`:'Keep your props in view and hold the camera steady.';feedback='We’ll get ready together.';}
    if(screen==='verifying'){detail=state.verificationStatus==='observed'?'One check done. Keep holding still.':'Hold still while ORBIT checks your mission.';feedback='Checking your mission…';}
    if(screen==='retry'){detail='Keep the action in view. We can try again.';feedback='Let me take another look!';}
    if(screen==='paused'){detail=state.pauseReasons.includes('camera')?'Bring your camera back when you’re ready.':'Say “resume” whenever you’re ready.';feedback='Paused. Take a breath.';}
    if(screen==='success'){title=state.lastOutcome.label;detail='Your action was checked. Nice work!';feedback='Mission checked!';}
    if(screen==='missed'){title=state.lastOutcome.label;detail='That’s okay. Let’s try the next mission.';feedback='On to the next one';}
    if(screen==='complete'){title='You showed up!';detail=`${state.completedSteps} of ${state.totalSteps} missions checked`;feedback=state.completedSteps===state.totalSteps?'A brilliant morning adventure.':'Every little step counts.';}
    const titleY=C.y+52,titleHeight=L.portrait?82:68;
    text(title,{x:C.x+pad,y:titleY,width:inner,height:titleHeight},L.portrait?36:30,{maxLines:2,role:'mission'});
    if(screen==='welcome'){
      for(const [i,step] of state.routineSteps.slice(0,3).entries()){
        const y=C.y+(L.portrait?137:117)+i*(L.portrait?28:19);
        text(`${i+1}. ${step.label}`,{x:C.x+pad,y,width:inner,height:L.portrait?27:20},L.portrait?21:16,{color:P.muted,role:'overview'});
      }
    }else{
      text(detail,{x:C.x+pad,y:C.y+(L.portrait?138:117),width:inner,height:L.portrait?54:36},L.portrait?24:19,{maxLines:2,color:P.muted,weight:'regular',role:'instruction'});
      if(L.portrait){text(feedback,{x:C.x+pad,y:C.y+204,width:inner,height:30},22,{color:screen==='success'?P.teal:P.purple,role:'feedback'});}
    }
    // Outcomes remain visible briefly after the next authoritative mission arrives.
    let animation=animations.get(ctx);
    if(!animation||tick<animation.tick||tick===0)animation={key:null,until:-1,tick,progress:state.resolvedSteps/state.totalSteps};
    const outcomeKey=state.lastOutcome?`${state.lastOutcome.stepIndex}:${state.lastOutcome.status}`:null;
    if(outcomeKey&&outcomeKey!==animation.key){animation.key=outcomeKey;animation.until=tick+24;animation.outcome={...state.lastOutcome};}
    const progressTarget=state.resolvedSteps/state.totalSteps;
    animation.progress+=(progressTarget-animation.progress)*.22;
    animation.tick=tick;animations.set(ctx,animation);
    if(tick<animation.until&&state.currentStep!==null&&animation.outcome.stepIndex!==state.stepIndex){
      const toast={...L.caption,x:L.portrait?55:L.caption.x,width:L.portrait?width-110:L.caption.width};
      box(toast,'#233b4d','#6cf1cf',15);
      text(animation.outcome.status==='done'?`Mission ${animation.outcome.stepIndex+1} checked!`:'Next mission, fresh start',
        {x:toast.x+8,y:toast.y+4,width:toast.width-16,height:28},21,{align:'center',color:P.teal,role:'outcome'});
    }
    const R=L.progress;
    if(L.portrait){text('YOUR MORNING',{x:R.x,y:R.y,width:R.width,height:25},18,{color:P.muted,role:'progress'});}
    const cy=L.portrait?R.y+58:R.y+14,railLeft=R.x+40,railRight=R.x+R.width-40;
    ctx.strokeStyle='#425172';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(railLeft,cy);ctx.lineTo(railRight,cy);ctx.stroke();
    ctx.strokeStyle=P.purple;ctx.beginPath();ctx.moveTo(railLeft,cy);ctx.lineTo(railLeft+(railRight-railLeft)*animation.progress,cy);ctx.stroke();
    state.routineSteps.forEach((step,i)=>{
      const x=state.totalSteps===1?(railLeft+railRight)/2:railLeft+(railRight-railLeft)*i/(state.totalSteps-1),active=i===state.stepIndex;
      ctx.fillStyle=step.status==='done'?P.teal:active?'#6678d8':'#293956';ctx.strokeStyle=active?'#c5c4ff':'#657597';ctx.lineWidth=2;
      ctx.beginPath();ctx.arc(x,cy,L.portrait?19:13,0,Math.PI*2);ctx.fill();ctx.stroke();
      if(active){ctx.save();ctx.globalAlpha=.35+Math.sin(tick/22)*.08;ctx.strokeStyle=P.purple;ctx.beginPath();ctx.arc(x,cy,L.portrait?24:17,0,Math.PI*2);ctx.stroke();ctx.restore();}
      if(step.status==='done')check(x,cy,'#102d35',L.portrait?8:5);
      else text(step.status==='missed'?'–':String(i+1),{x:x-18,y:cy-(L.portrait?17:14),width:36,height:L.portrait?34:28},L.portrait?25:19,{align:'center',role:'checkpoint'});
    });
    if(L.portrait){text(`${state.completedSteps} of ${state.totalSteps} missions checked`,{x:R.x,y:R.y+86,width:R.width,height:27},22,{align:'center',color:P.muted,role:'count'});
      text(screen==='complete'?'Thanks for trying with ORBIT':'You can say “pause” anytime',L.footer,21,{align:'center',color:P.muted,role:'footer'});}
    return {screen,state,layout:L,textRuns,mood,displayProgress:animation.progress};
  }finally{ctx.restore();}
}
export function renderRoutineFrame(input,{width=540,height=960,tick=0,speaking=false,captureText=false}={}) {
  const canvas=createCanvas(width,height),ctx=canvas.getContext('2d');
  const meta=drawRoutineGame(ctx,tick,speaking,input,{captureText});
  return {pixels:new Uint8Array(ctx.getImageData(0,0,width,height).data),...meta};
}
