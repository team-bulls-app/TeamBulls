/* Team Bulls v10.10.39 — integridade estrutural de registros, semana e ciclo. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_SESSION_INTEGRITY_101039__)return;
  window.__TEAM_BULLS_SESSION_INTEGRITY_101039__=true;

  const VERSION='10.10.39-sessionintegrity1';
  let logicalId='';
  let logicalContext='';
  let generation=0;
  let submitted=false;
  let inFlightId='';

  const safeString=value=>String(value||'');
  const validIsoDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(safeString(value));
  const studentCloud=()=>{
    try{return MODE==='cloud'&&CURRENT_USER?.role==='student'&&!!CURRENT_USER?.uid;}catch(error){return false;}
  };
  const modalOpen=()=>!!document.getElementById('modal-session')?.classList.contains('open');
  const sessionContext=()=>`${safeString(typeof SESSION_WID!=='undefined'&&SESSION_WID||typeof CUR_WORKOUT!=='undefined'&&CUR_WORKOUT)}|${safeString(typeof SESSION_EID!=='undefined'&&SESSION_EID||typeof CUR_EX!=='undefined'&&CUR_EX)}`;
  const runtimeRetry=()=>{try{window.TeamBullsRuntimeLoader?.retry?.();}catch(error){}};

  function seedLogicalSubmission(){
    generation++;
    logicalContext=sessionContext();
    try{
      logicalId=safeString(SESSION_CREATE_ID)||safeString(draftId('sessions'));
      SESSION_CREATE_ID=logicalId;
    }catch(error){logicalId='';}
    submitted=false;
    inFlightId='';
    return logicalId;
  }

  function submissionExists(id){
    if(!id)return false;
    try{if(window.TeamBullsSessionPerformance?.hasPending?.(id))return true;}catch(error){}
    try{if(typeof findSessionOwner==='function'&&findSessionOwner(id)?.session)return true;}catch(error){}
    return false;
  }

  function currentWorkoutFor(exercise){
    try{
      if(typeof workoutContainingExercise==='function'){
        const workout=workoutContainingExercise(exercise);
        if(workout)return workout;
      }
    }catch(error){}
    try{return typeof getW==='function'?getW(CUR_WORKOUT):null;}catch(error){return null;}
  }

  function belongsToCurrentCycle(session,workout){
    const start=safeString(workout?.startDate);
    if(!validIsoDate(start))return true;
    const explicit=safeString(session?.cycleStartDate);
    if(validIsoDate(explicit))return explicit===start;
    const date=safeString(session?.date);
    if(!validIsoDate(date))return true;
    return date>=start;
  }

  function installOpenGuard(){
    if(typeof openLogSessionModal!=='function')return false;
    if(openLogSessionModal.__tbSessionIntegrity)return true;
    const base=openLogSessionModal;
    const wrapped=function(){
      if(studentCloud()&&!window.TeamBullsWeekSelectionFix){
        runtimeRetry();
        if(typeof showToast==='function')showToast('Finalizando a proteção do registro. Tente novamente em instantes.',true);
        return false;
      }
      const result=base.apply(this,arguments);
      if(modalOpen())seedLogicalSubmission();
      return result;
    };
    wrapped.__tbSessionIntegrity=true;
    wrapped.__tbBase=base;
    openLogSessionModal=wrapped;
    return true;
  }

  function installSaveGuard(){
    if(typeof saveSession!=='function')return false;
    if(saveSession.__tbSessionIntegrity)return true;
    const base=saveSession;
    const wrapped=async function(){
      if(!studentCloud())return base.apply(this,arguments);
      if(!window.TeamBullsSessionPerformance){
        runtimeRetry();
        if(typeof showToast==='function')showToast('Finalizando a sincronização segura. Tente novamente em instantes.',true);
        return false;
      }
      const context=sessionContext();
      if(!logicalId||logicalContext!==context){
        if(!modalOpen())return false;
        seedLogicalSubmission();
      }
      const id=logicalId;
      const currentGeneration=generation;
      if(!id)return false;
      if(submitted||inFlightId===id||submissionExists(id)){
        submitted=true;
        try{SESSION_CREATE_ID=id;}catch(error){}
        return true;
      }
      inFlightId=id;
      try{SESSION_CREATE_ID=id;}catch(error){}
      try{
        const result=await base.apply(this,arguments);
        if(currentGeneration===generation){
          const persisted=submissionExists(id)||!modalOpen();
          if(persisted)submitted=true;
          try{SESSION_CREATE_ID=id;}catch(error){}
        }
        return result;
      }finally{
        if(currentGeneration===generation&&inFlightId===id)inFlightId='';
      }
    };
    wrapped.__tbSessionIntegrity=true;
    wrapped.__tbBase=base;
    saveSession=wrapped;
    return true;
  }

  function installCycleAwarePrescription(){
    if(typeof renderExercisePrescription!=='function')return false;
    if(renderExercisePrescription.__tbSessionCycleIntegrity)return true;
    const base=renderExercisePrescription;
    const wrapped=function(exercise){
      if(!exercise||!Array.isArray(exercise.sessions))return base.apply(this,arguments);
      const workout=currentWorkoutFor(exercise);
      const start=safeString(workout?.startDate);
      if(!validIsoDate(start))return base.apply(this,arguments);
      const original=exercise.sessions;
      const filtered=original.filter(session=>belongsToCurrentCycle(session,workout));
      if(filtered.length===original.length)return base.apply(this,arguments);
      exercise.sessions=filtered;
      try{return base.apply(this,arguments);}finally{exercise.sessions=original;}
    };
    wrapped.__tbSessionCycleIntegrity=true;
    wrapped.__tbBase=base;
    renderExercisePrescription=wrapped;
    return true;
  }

  function install(){
    const openOk=installOpenGuard();
    const saveOk=installSaveGuard();
    const cycleOk=installCycleAwarePrescription();
    return openOk&&saveOk&&cycleOk;
  }

  function reinstall(){
    installOpenGuard();
    installSaveGuard();
    installCycleAwarePrescription();
  }

  if(!install()){
    window.addEventListener('team-bulls-v107-ready',reinstall,{once:true});
    [250,700,1500].forEach(delay=>setTimeout(reinstall,delay));
  }
  window.addEventListener('team-bulls-runtime-state',reinstall);
  window.addEventListener('team-bulls-runtime-ready',reinstall);
  window.addEventListener('team-bulls-student-runtime-ready',reinstall);

  window.TeamBullsSessionIntegrity=Object.freeze({
    version:VERSION,
    belongsToCurrentCycle,
    currentSubmission:()=>({id:logicalId,context:logicalContext,generation,submitted,inFlight:!!inFlightId})
  });
})();
