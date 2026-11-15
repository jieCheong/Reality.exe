/** Display-only normalization. Never promotes a percentage or observation into a win. */
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v,fallback='',limit=300)=>typeof v==='string'?(v.replace(/[\x00-\x1f]/g,' ').trim().slice(0,limit)||fallback):fallback;
const integer=(v,min,max,fallback)=>Number.isInteger(v)&&v>=min&&v<=max?v:fallback;
const choose=(v,allowed,fallback)=>allowed.includes(v)?v:fallback;
const UI=['scanning','mission_starting','in_progress','verification_pending','mission_verified','retry','uncertain','mission_missed','routine_completed','paused'];
const EVENTS=['scan_started','mission_starting','mission_in_progress','verification_pending','observation_accepted','verification_cancelled','mission_verified','evidence_retry','evidence_uncertain','mission_missed','routine_completed','routine_paused','narration_failed'];
export function normalizeRoutineHud(input={}) {
  const v=record(input)?input:{};
  const provided=Array.isArray(v.routineSteps)?v.routineSteps.slice(0,32):null;
  const totalSteps=provided?.length||integer(v.totalSteps,1,32,3);
  const routineSteps=Array.from({length:totalSteps},(_,i)=>({label:text(provided?.[i]?.label,`Mission ${i+1}`,180),
    status:choose(provided?.[i]?.status,['pending','active','done','missed'],'pending')}));
  const uiState=choose(v.uiState,UI,'scanning');
  const fallbackIndex=integer(v.currentStep,1,totalSteps,null);
  const stepIndex=integer(v.stepIndex,-1,totalSteps,fallbackIndex===null?-1:fallbackIndex-1);
  const currentStep=stepIndex>=0&&stepIndex<totalSteps?stepIndex+1:null;
  const completedSteps=provided?routineSteps.filter(s=>s.status==='done').length:integer(v.completedSteps,0,totalSteps,0);
  const resolvedSteps=provided?routineSteps.filter(s=>['done','missed'].includes(s.status)).length:integer(v.resolvedSteps,completedSteps,totalSteps,completedSteps);
  const pauseReasons=Array.isArray(v.pauseReasons)?v.pauseReasons.filter(s=>['camera','manual','voice_failure','narration','not_started','closed'].includes(s)):[];
  const ev=record(v.routineEvent)?v.routineEvent:{};
  const outcome=record(v.lastOutcome)&&['done','missed'].includes(v.lastOutcome.status)&&integer(v.lastOutcome.stepIndex,0,totalSteps-1,null)!==null
    ?{stepIndex:v.lastOutcome.stepIndex,label:text(v.lastOutcome.label,routineSteps[v.lastOutcome.stepIndex].label,180),status:v.lastOutcome.status}:null;
  const selectedTheme=['space','odyssey','backrooms'].includes(v.selectedTheme)?v.selectedTheme:null;
  const menu=record(v.themeMenu)?{state:text(v.themeMenu.state,'choosing',32),candidateId:['space','odyssey','backrooms'].includes(v.themeMenu.candidateId)?v.themeMenu.candidateId:null,
    themes:Array.isArray(v.themeMenu.themes)?v.themeMenu.themes.slice(0,3).map(t=>({id:text(t?.id,'',48),name:text(t?.name,'',48),description:text(t?.description,'',160)})):[]}:undefined;
  const maxLives=integer(v.maxLives,1,9,null);
  const monster=record(v.monster)?{visible:v.monster.visible===true,closeness:Number.isFinite(v.monster.closeness)?Math.max(0,Math.min(1,v.monster.closeness)):0}:{visible:false,closeness:0};
  return {mode:'routine',selectedTheme,themeMenu:menu,elapsedSeconds:integer(v.elapsedSeconds,0,360000,0),
    ...(maxLives!==null?{maxLives,lives:integer(v.lives,0,maxLives,maxLives),monster,outcome:choose(v.outcome,['failed','complete'],null)}:{}),verificationMode:choose(v.verificationMode,['mock','groq'],typeof v.objective==='string'&&v.objective.startsWith('[MOCK VISION] ')?'mock':undefined),phase:choose(v.phase,['SCAN','POWER','SECURITY','PORTAL'],'SCAN'),
    routineId:text(v.routineId,'routine',64),routineName:text(v.routineName,'Morning missions',120),theme:text(v.theme,'space',64),
    objective:text(v.objective,'Show your routine objects'),checkpoints:{},missionProgress:resolvedSteps/totalSteps,
    missionName:text(v.missionName,currentStep?routineSteps[stepIndex].label:'Show your routine objects',180),
    missionInstruction:text(v.missionInstruction,'Follow ORBIT and hold the camera steady.',600),
    stepIndex,currentStep,totalSteps,completedSteps,resolvedSteps,routineSteps,
    timeLeftSeconds:integer(v.timeLeftSeconds,0,3600,null),budgetSeconds:integer(v.budgetSeconds,1,3600,null),
    uiState,verificationStatus:choose(v.verificationStatus,['idle','pending','observed','verified','retry','uncertain'],'idle'),
    confirmationRounds:integer(v.confirmationRounds,0,32,0),requiredConfirmationRounds:integer(v.requiredConfirmationRounds,1,32,2),
    paused:v.paused===true,pauseReasons,narrationStatus:choose(v.narrationStatus,['idle','speaking','failed','paused'],'idle'),
    routineEvent:{sequence:integer(ev.sequence,0,Number.MAX_SAFE_INTEGER,0),name:choose(ev.name,EVENTS,'scan_started'),revision:integer(ev.revision,0,Number.MAX_SAFE_INTEGER,0),stepIndex:integer(ev.stepIndex,-1,totalSteps,-1)},
    lastOutcome:outcome};
}
export function routineScreen(state) {
  if(state.uiState==='routine_completed')return 'complete';
  if(state.uiState==='mission_verified'&&state.verificationStatus==='verified'&&state.lastOutcome?.status==='done')return 'success';
  if(state.uiState==='mission_missed'&&state.lastOutcome?.status==='missed')return 'missed';
  if(state.verificationStatus==='pending'||state.verificationStatus==='observed')return 'verifying';
  if(['retry','uncertain'].includes(state.uiState)||['retry','uncertain'].includes(state.verificationStatus))return 'retry';
  if(state.pauseReasons.includes('not_started'))return 'welcome';
  if(state.currentStep===null)return 'scanning';
  if(state.uiState==='paused')return 'paused';
  return 'active';
}
export function formatRoutineTime(seconds) {
  if(!Number.isInteger(seconds)||seconds<0)return '—:—';
  return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}
