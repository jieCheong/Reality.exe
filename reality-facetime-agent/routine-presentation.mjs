/** Jie-owned display adapter. Reads authoritative engine state; never advances it. */
export const ROUTINE_EVENTS = Object.freeze({
  scan_started: ['scanning','idle'],
  mission_starting: ['mission_starting','idle'],
  mission_in_progress: ['in_progress','idle'],
  verification_pending: ['verification_pending','pending'],
  observation_accepted: ['verification_pending','observed'],
  verification_cancelled: ['in_progress','idle'],
  mission_verified: ['mission_verified','verified'],
  evidence_retry: ['retry','retry'],
  evidence_uncertain: ['uncertain','uncertain'],
  mission_missed: ['mission_missed','idle'],
  routine_completed: ['routine_completed','idle'],
  routine_paused: ['paused','idle'],
  narration_failed: ['paused','idle'],
});

export class RoutinePresentation {
  constructor(engine) {
    this.engine=engine;this.sequence=0;this.lastOutcome=null;
    this.transition('scan_started');
  }
  transition(name) {
    if(!Object.hasOwn(ROUTINE_EVENTS,name))throw Error('Unknown routine display event');
    [this.uiState,this.verificationStatus]=ROUTINE_EVENTS[name];
    this.event={sequence:++this.sequence,name,revision:this.engine.revision,stepIndex:this.engine.stepIndex};
  }
  outcome(record) {
    // Never copy provider evidence, photos, or private frame metadata into display state.
    this.lastOutcome={stepIndex:this.engine.stepIndex,label:record.label,status:record.status};
    this.transition(record.status==='done'?'mission_verified':'mission_missed');
  }
  snapshot(state,{pauseReasons=[],voiceFailed=false}={}) {
    const e=this.engine,totalSteps=e.routine.steps.length;
    const currentStep=state.stepIndex>=0&&state.stepIndex<totalSteps?state.stepIndex+1:null;
    const blocking=pauseReasons.some(reason=>['camera','manual','voice_failure'].includes(reason));
    const narrationStatus=pauseReasons.includes('manual')?'paused':voiceFailed?'failed':pauseReasons.includes('narration')?'speaking':'idle';
    return {...state,elapsedSeconds:Math.floor(e.results.reduce((sum,r)=>sum+r.seconds,0)+(!e.escaped&&e.stepIndex>=0?e.activeElapsed()/1000:0)),missionName:currentStep?e.routine.steps[state.stepIndex].label:e.escaped?'Routine complete':'Show your routine objects',
      missionInstruction:e.instruction(),currentStep,totalSteps,
      completedSteps:e.results.filter(result=>result.status==='done').length,resolvedSteps:e.results.length,
      uiState:e.escaped?'routine_completed':blocking?'paused':state.phase==='SCAN'?'scanning':this.uiState,
      verificationStatus:this.verificationStatus,confirmationRounds:e.streak,requiredConfirmationRounds:2,
      paused:pauseReasons.length>0,pauseReasons:[...pauseReasons],narrationStatus,
      routineEvent:{...this.event},lastOutcome:this.lastOutcome?{...this.lastOutcome}:null};
  }
}
