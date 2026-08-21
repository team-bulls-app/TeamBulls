/* Team Bulls v10.10.10 — GER em lote respeita semanas e exercícios trancados. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_GER_LOCK_BRIDGE_V101010__)return;
  window.__TEAM_BULLS_GER_LOCK_BRIDGE_V101010__=true;

  const VERSION='10.10.10-gerlock1';
  const base=window.TeamBullsGerBulk;if(!base?.applyWeek||!base?.applyExercise)return;
  let busy=false;

  const safeGer=value=>{const ger=parseInt(value,10);return Number.isInteger(ger)&&ger>=1&&ger<=6?ger:null;};
  const clonePlan=value=>{try{return JSON.parse(JSON.stringify(typeof normalizeWeeklyPlan==='function'?normalizeWeeklyPlan(value):value||{}));}catch(error){return{};}};
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const currentWeek=()=>Math.max(1,Math.min(8,Number(document.getElementById('input-prescription-week')?.value)||1));
  const currentExercise=()=>{try{return getPlanEditExercise?.()||null;}catch(error){return null;}};
  const currentWorkout=()=>{try{return PLAN_EDIT_TARGET==='trainer'?VIEW_STUDENT_WORKOUT:getW(PLAN_EDIT_WID);}catch(error){return null;}};
  function lockState(exercise){const raw=exercise?.weeklyEditLocks&&typeof exercise.weeklyEditLocks==='object'?exercise.weeklyEditLocks:{};return{all:raw.all===true,weeks:raw.weeks&&typeof raw.weeks==='object'?raw.weeks:{}};}
  function locked(exercise,week){const state=lockState(exercise);return state.all||state.weeks['w'+Math.max(1,Math.min(8,Number(week)||1))]===true;}
  function setsWithGer(sets,ger){return(Array.isArray(sets)?sets:[]).map(set=>({targetMin:Number(set.targetMin),targetMax:Number(set.targetMax),ger}));}
  function selectedGer(){return safeGer(document.getElementById('tb-ger-bulk-level')?.value||document.getElementById('tb-actions-ger-level')?.value);}
  function hasRelevantWeekLock(workout,week){return(workout?.exercises||[]).some(exercise=>locked(exercise,week));}
  function anyLock(exercise){const state=lockState(exercise);return state.all||Object.values(state.weeks).some(Boolean);}

  async function writeChanges(changes,label){
    if(!changes.length)return false;
    if(PLAN_EDIT_TARGET==='trainer'){
      const batch=db.batch();for(const change of changes)batch.update(db.collection('exercises').doc(change.exercise.id),{weeklyPlan:change.next});
      await cloudWrite(batch.commit(),label);changes.forEach(change=>{change.exercise.weeklyPlan=change.next;});return true;
    }
    changes.forEach(change=>{change.exercise.weeklyPlan=change.next;});
    if(typeof localSave==='function'&&localSave())return true;
    changes.forEach(change=>{change.exercise.weeklyPlan=change.before;});throw new Error('Não foi possível salvar o GER no aparelho.');
  }
  function refresh(exercise,week,ger){
    document.querySelectorAll('#prescription-editor .plan-set-row:not([data-backoff="1"]) [data-f="ger"]').forEach(select=>{if(!locked(exercise,week))select.value=String(ger);});
    try{refreshPlanViewsAfterWeeklyTechniqueChange?.(exercise,week);}catch(error){}
    try{base.refresh?.();}catch(error){}
  }
  async function applyWeekProtected(){
    const ger=selectedGer(),exercise=currentExercise(),workout=currentWorkout(),week=currentWeek();if(!ger||!exercise||!workout||busy)return false;
    if(!hasRelevantWeekLock(workout,week))return base.applyWeek();
    const key=`bulk-ger-protected-week-${workout.id||'workout'}-${week}`;if(typeof beginAction==='function'&&!beginAction(key,'modal-prescription'))return false;busy=true;
    try{
      const changes=[];let protectedCount=0;
      for(const item of workout.exercises||[]){
        if(locked(item,week)){protectedCount++;continue;}
        const resolved=resolveWeekPrescription(item,week);if(!resolved?.sets?.length)continue;
        const before=clonePlan(item.weeklyPlan),next=clonePlan(item.weeklyPlan);next['w'+week]=setsWithGer(resolved.sets,ger);
        if(!same(before,next))changes.push({exercise:item,before,next});
      }
      if(!changes.length){showToast?.(`🔒 Nenhum destino destrancado precisava receber GER ${ger}.`,true);return false;}
      await writeChanges(changes,'aplicar GER preservando semanas trancadas');refresh(exercise,week,ger);
      showToast?.(`✓ GER ${ger} aplicado em ${changes.length} exercício(s) · ${protectedCount} protegido(s) preservado(s)`);return true;
    }catch(error){alert(typeof cloudWriteError==='function'?cloudWriteError(error,'aplicar o GER da semana'):String(error?.message||error));return false;}
    finally{busy=false;if(typeof endAction==='function')endAction(key,'modal-prescription');}
  }
  async function applyExerciseProtected(){
    const ger=selectedGer(),exercise=currentExercise(),week=currentWeek();if(!ger||!exercise||busy)return false;
    if(!anyLock(exercise))return base.applyExercise();
    const key=`bulk-ger-protected-exercise-${exercise.id}`;if(typeof beginAction==='function'&&!beginAction(key,'modal-prescription'))return false;busy=true;
    try{
      const before=clonePlan(exercise.weeklyPlan),next=clonePlan(exercise.weeklyPlan),snapshot={...exercise,weeklyPlan:before};let changedWeeks=0,protectedWeeks=0;
      for(let current=1;current<=8;current++){
        if(locked(exercise,current)){protectedWeeks++;continue;}
        const resolved=resolveWeekPrescription(snapshot,current);if(!resolved?.sets?.length)continue;
        next['w'+current]=setsWithGer(resolved.sets,ger);changedWeeks++;
      }
      if(!changedWeeks||same(before,next)){showToast?.(`🔒 As semanas destrancadas já usam GER ${ger} ou não possuem prescrição.`,true);return false;}
      await writeChanges([{exercise,before,next}],'aplicar GER preservando semanas trancadas');refresh(exercise,week,ger);
      showToast?.(`✓ GER ${ger} aplicado às semanas destrancadas · ${protectedWeeks} semana(s) protegida(s) preservada(s)`);return true;
    }catch(error){alert(typeof cloudWriteError==='function'?cloudWriteError(error,'aplicar o GER no exercício'):String(error?.message||error));return false;}
    finally{busy=false;if(typeof endAction==='function')endAction(key,'modal-prescription');}
  }

  window.TeamBullsGerBulk=Object.freeze({...base,version:VERSION,applyWeek:applyWeekProtected,applyExercise:applyExerciseProtected});

  // SALVAR SOMENTE SÉRIES é um listener privado do layout; em semana trancada
  // não deve gerar escrita redundante nem sugerir que a prescrição foi alterada.
  document.addEventListener('click',event=>{
    const button=event.target instanceof Element?event.target.closest('#tb-save-series-only'):null;if(!button)return;
    const exercise=currentExercise(),week=currentWeek();if(!exercise||!locked(exercise,week))return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    const message=`A semana ${week} está trancada. Destranque-a antes de salvar séries, repetições ou GER.`;
    if(typeof showToast==='function')showToast('🔒 '+message,true);else alert(message);
  },true);

  window.TeamBullsGerLockBridge=Object.freeze({version:VERSION,locked});
})();
