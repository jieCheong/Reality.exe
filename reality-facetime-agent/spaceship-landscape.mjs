// Optional native landscape reflow of the adapted HUD. No bitmap scaling or crop.
export const LANDSCAPE_LAYOUT = Object.freeze({
  header: Object.freeze({ x: 24, y: 13, width: 380, height: 36 }),
  status: Object.freeze({ x: 416, y: 13, width: 200, height: 28 }),
  objective: Object.freeze({ x: 24, y: 76, width: 592, height: 128 }),
  progress: Object.freeze({ x: 24, y: 216, width: 592, height: 35 }),
  checkpoints: Object.freeze({ x: 24, y: 284, width: 592, height: 60 }),
});
export function landscapeObjectiveLines(ctx, text) {
  ctx.save(); ctx.font = '700 23px Orbitron';
  const lines=[]; let line='';
  for(const char of text.replace(/\s+/g,' ')) {
    if(ctx.measureText(line+char).width>550) {lines.push(line.trim());line=char;}
    else line+=char;
  }
  if(line) lines.push(line.trim());
  if(lines.length>2) {
    let last=lines[1];
    while(ctx.measureText(last+'…').width>550) last=last.slice(0,-1);
    lines[1]=last+'…';
  }
  const result=lines.slice(0,2).map((text,i)=>({text,x:43,baseline:146+i*31,width:ctx.measureText(text).width}));
  ctx.restore(); return result;
}
export function drawLandscape(ctx, tick, speaking, state, colors, phases) {
  const panel=(box,raised=false)=>{
    ctx.fillStyle=raised?colors.panelRaised:colors.panel;ctx.strokeStyle=colors.border;ctx.lineWidth=1;
    ctx.beginPath();ctx.roundRect(box.x,box.y,box.width,box.height,10);ctx.fill();ctx.stroke();
  };
  ctx.fillStyle=colors.cyan;ctx.font='700 24px Orbitron';ctx.fillText('REALITY.EXE',24,35);
  panel(LANDSCAPE_LAYOUT.status,true);
  ctx.fillStyle=state.phase==='SCAN'?colors.amber:colors.cyan;
  ctx.beginPath();ctx.arc(431,27,3,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=colors.text;ctx.font='700 12px Orbitron';ctx.fillText(state.phase,443,31);
  for(let i=0;i<5;i++) {
    const height=speaking?5+((tick+i*3)%12):3;
    ctx.fillStyle=speaking?colors.cyan:colors.muted;ctx.fillRect(566+i*7,27-height/2,3,height);
  }
  ctx.fillStyle=state.phase==='SCAN'?colors.amber:colors.cyan;ctx.fillRect(0,51,640,4);
  panel(LANDSCAPE_LAYOUT.objective);
  ctx.fillStyle=colors.cyan;ctx.fillRect(43,91,3,17);
  ctx.fillStyle=colors.muted;ctx.font='700 13px Orbitron';ctx.fillText('OBJECTIVE',57,105);
  ctx.fillStyle=colors.text;ctx.font='700 23px Orbitron';
  for(const line of landscapeObjectiveLines(ctx,state.objective)) ctx.fillText(line.text,line.x,line.baseline);
  panel(LANDSCAPE_LAYOUT.progress);
  ctx.fillStyle=colors.muted;ctx.font='700 11px Orbitron';ctx.fillText('MISSION PROGRESS',40,238);
  ctx.fillStyle=colors.border;ctx.fillRect(225,229,310,7);
  ctx.fillStyle=colors.cyan;ctx.fillRect(225,229,310*state.missionProgress,7);
  ctx.fillStyle=colors.text;ctx.textAlign='right';ctx.fillText(`${Math.round(state.missionProgress*100)}%`,600,238);ctx.textAlign='left';
  ctx.fillStyle=colors.muted;ctx.font='700 11px Orbitron';ctx.fillText('CHECKPOINTS',40,274);
  panel(LANDSCAPE_LAYOUT.checkpoints);
  ctx.strokeStyle=colors.border;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(76,303);ctx.lineTo(564,303);ctx.stroke();
  phases.forEach((label,i)=>{
    const x=76+i*(488/(phases.length-1)),status=state.checkpoints[label];
    const color=status==='active'?colors.amber:status==='complete'?colors.cyan:colors.dim;
    ctx.fillStyle=status==='pending'?colors.panelRaised:color;ctx.strokeStyle=color;ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(x,303,status==='active'?7:5,0,Math.PI*2);ctx.fill();ctx.stroke();
    if(status==='complete') {
      ctx.strokeStyle=colors.background;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x-3,303);ctx.lineTo(x-1,305);ctx.lineTo(x+3,301);ctx.stroke();
    }
    ctx.fillStyle=status==='pending'?colors.muted:colors.text;ctx.font='700 11px Orbitron';ctx.textAlign='center';ctx.fillText(label,x,330);
  });
  ctx.textAlign='left';
}
