/* Team Bulls v10.10.10 — bloqueios de prescrição, agenda semanal por envio e feedback flutuante. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_WORKFLOW_CONTROLS_V101010__)return;
  window.__TEAM_BULLS_WORKFLOW_CONTROLS_V101010__=true;

  const VERSION='10.10.10-workflow1';
  const LOCK_FIELD='weeklyEditLocks';
  const WEEK_KEYS=Array.from({length:8},(_,i)=>'w'+(i+1));
  let feedbackContext=null;
  let feedbackDrag=null;
  let feedbackMinimized=false;

  function normalizeLocks(value){
    const raw=value&&typeof value==='object'?value:{};
    const input=raw.weeks&&typeof raw.weeks==='object'?raw.weeks:{};
    const weeks={};
    for(const key of WEEK_KEYS)if(input[key]===true)weeks[key]=true;
    return{all:raw.all===true,weeks};
  }
  function lockValue(exercise){return normalizeLocks(exercise?.[LOCK_FIELD]);}
  function weekLocked(exercise,week){
    const safe=Math.max(1,Math.min(8,Number(week)||1)),locks=lockValue(exercise);
    return locks.all||locks.weeks['w'+safe]===true;
  }
  function exerciseLocked(exercise){return lockValue(exercise).all;}
  function currentPrescriptionWeek(){return Math.max(1,Math.min(8,Number(document.getElementById('input-prescription-week')?.value)||1));}
  function activePlanExercise(){try{return typeof getPlanEditExercise==='function'?getPlanEditExercise():null;}catch(error){return null;}}
  function activePlanWorkout(){
    try{return PLAN_EDIT_TARGET==='trainer'?VIEW_STUDENT_WORKOUT:getW(PLAN_EDIT_WID);}catch(error){return null;}
  }
  function lockedMessage(exercise,week){
    if(exerciseLocked(exercise))return'Este exercício está trancado nas 8 semanas. Destranque o exercício para alterar a prescrição.';
    return`A semana ${week} deste exercício está trancada. Destranque a semana antes de alterar séries, repetições, GER ou técnicas.`;
  }
  function notifyLocked(exercise,week){
    const message=lockedMessage(exercise,week);
    if(typeof showToast==='function')showToast('🔒 '+message,true);else alert(message);
    return false;
  }
  function cloneWeekTechnique(config){
    if(typeof normalizeWeekTechniqueConfig==='function')return normalizeWeekTechniqueConfig(config);
    return{
      techniqueIds:Array.isArray(config?.techniqueIds)?config.techniqueIds.slice():[],
      optionalTechniqueIds:Array.isArray(config?.optionalTechniqueIds)?config.optionalTechniqueIds.slice():[],
      supersetExerciseId:String(config?.supersetExerciseId||'')
    };
  }
  function materializeWeeks(exercise,weeks){
    let weeklyPlan=typeof normalizeWeeklyPlan==='function'?normalizeWeeklyPlan(exercise?.weeklyPlan):{...(exercise?.weeklyPlan||{})};
    let weeklyTechniquePlan=typeof normalizeWeeklyTechniquePlan==='function'?normalizeWeeklyTechniquePlan(exercise?.weeklyTechniquePlan):{...(exercise?.weeklyTechniquePlan||{})};
    for(const week of weeks){
      const key='w'+week;
      if(typeof resolveWeekPrescription==='function'){
        const resolved=resolveWeekPrescription(exercise,week);
        weeklyPlan[key]=typeof clonePrescriptionSets==='function'?clonePrescriptionSets(resolved?.sets||[]):JSON.parse(JSON.stringify(resolved?.sets||[]));
      }
      if(typeof resolveWeekTechniqueConfig==='function')weeklyTechniquePlan[key]=cloneWeekTechnique(resolveWeekTechniqueConfig(exercise,week));
    }
    return{weeklyPlan,weeklyTechniquePlan};
  }
  async function persistExerciseLockState(exercise,payload,label){
    if(!exercise)return false;
    const previous={
      weeklyPlan:exercise.weeklyPlan,
      weeklyTechniquePlan:exercise.weeklyTechniquePlan,
      [LOCK_FIELD]:exercise[LOCK_FIELD]
    };
    Object.assign(exercise,payload);
    try{
      if(PLAN_EDIT_TARGET==='trainer'){
        await cloudWrite(db.collection('exercises').doc(exercise.id).update(payload),label);
      }else if(typeof localSave==='function'&&!localSave())throw new Error('Não foi possível salvar o bloqueio no aparelho.');
      return true;
    }catch(error){
      exercise.weeklyPlan=previous.weeklyPlan;
      exercise.weeklyTechniquePlan=previous.weeklyTechniquePlan;
      exercise[LOCK_FIELD]=previous[LOCK_FIELD];
      alert(typeof cloudWriteError==='function'?cloudWriteError(error,label):String(error?.message||error));
      return false;
    }
  }
  async function toggleCurrentWeekLock(){
    const exercise=activePlanExercise(),week=currentPrescriptionWeek();if(!exercise)return;
    const locks=lockValue(exercise);
    if(locks.all){notifyLocked(exercise,week);return;}
    const key='w'+week,next={all:false,weeks:{...locks.weeks}};
    let payload;
    if(next.weeks[key]){
      delete next.weeks[key];
      payload={[LOCK_FIELD]:next};
    }else{
      const materialized=materializeWeeks(exercise,[week]);
      next.weeks[key]=true;
      payload={weeklyPlan:materialized.weeklyPlan,weeklyTechniquePlan:materialized.weeklyTechniquePlan,[LOCK_FIELD]:next};
    }
    if(await persistExerciseLockState(exercise,payload,next.weeks[key]?'trancar semana da prescrição':'destrancar semana da prescrição')){
      updatePrescriptionLockUi();
      if(typeof refreshPlanViewsAfterWeeklyTechniqueChange==='function')refreshPlanViewsAfterWeeklyTechniqueChange(exercise,week);
      showToast(next.weeks[key]?`🔒 Semana ${week} protegida`:`🔓 Semana ${week} destrancada`);
    }
  }
  async function toggleExerciseLock(){
    const exercise=activePlanExercise();if(!exercise)return;
    const locks=lockValue(exercise);
    let payload,next;
    if(locks.all){
      next={all:false,weeks:{}};
      payload={[LOCK_FIELD]:next};
    }else{
      const materialized=materializeWeeks(exercise,[1,2,3,4,5,6,7,8]);
      next={all:true,weeks:{}};
      payload={weeklyPlan:materialized.weeklyPlan,weeklyTechniquePlan:materialized.weeklyTechniquePlan,[LOCK_FIELD]:next};
    }
    if(await persistExerciseLockState(exercise,payload,next.all?'trancar exercício':'destrancar exercício')){
      updatePrescriptionLockUi();
      if(typeof refreshPlanViewsAfterWeeklyTechniqueChange==='function')refreshPlanViewsAfterWeeklyTechniqueChange(exercise,currentPrescriptionWeek());
      showToast(next.all?'🔒 Exercício protegido nas 8 semanas':'🔓 Exercício totalmente destrancado');
    }
  }
  function ensureLockUi(){
    const modal=document.getElementById('modal-prescription');if(!modal||document.getElementById('tb-prescription-lockbar'))return;
    const weekRow=modal.querySelector('.prescription-week-row')||modal.querySelector('.prescription-compact-shell');if(!weekRow)return;
    const bar=document.createElement('div');
    bar.id='tb-prescription-lockbar';bar.className='tb-prescription-lockbar';
    bar.innerHTML=`<div class="tb-lock-state" id="tb-prescription-lock-state">Proteção da prescrição</div>
      <div class="tb-lock-actions">
        <button type="button" class="btn-ghost" id="tb-lock-week-btn" data-lock-control="1">🔒 TRANCAR SEMANA</button>
        <button type="button" class="btn-ghost" id="tb-lock-exercise-btn" data-lock-control="1">🔒 TRANCAR 8 SEMANAS</button>
      </div>`;
    weekRow.insertAdjacentElement('afterend',bar);
    document.getElementById('tb-lock-week-btn').addEventListener('click',toggleCurrentWeekLock);
    document.getElementById('tb-lock-exercise-btn').addEventListener('click',toggleExerciseLock);
  }
  function updatePrescriptionLockUi(){
    ensureLockUi();
    const exercise=activePlanExercise(),week=currentPrescriptionWeek(),bar=document.getElementById('tb-prescription-lockbar');if(!bar||!exercise)return;
    const locks=lockValue(exercise),locked=locks.all||locks.weeks['w'+week]===true;
    const state=document.getElementById('tb-prescription-lock-state'),weekBtn=document.getElementById('tb-lock-week-btn'),allBtn=document.getElementById('tb-lock-exercise-btn');
    bar.classList.toggle('is-locked',locked);
    if(state)state.textContent=locks.all?'🔒 Exercício protegido nas 8 semanas':locked?`🔒 Semana ${week} protegida`:`🔓 Semana ${week} liberada para edição`;
    if(weekBtn){weekBtn.disabled=locks.all;weekBtn.textContent=locked&&!locks.all?'🔓 DESTRANCAR SEMANA':'🔒 TRANCAR SEMANA';}
    if(allBtn)allBtn.textContent=locks.all?'🔓 DESTRANCAR 8 SEMANAS':'🔒 TRANCAR 8 SEMANAS';
    const editor=document.getElementById('modal-prescription');
    const applyDisabledState=control=>{
      if(!control||control.id==='input-prescription-week'||control.closest('#tb-prescription-lockbar'))return;
      if(locked){
        if(control.dataset.tbLockWasDisabled===undefined)control.dataset.tbLockWasDisabled=control.disabled?'1':'0';
        control.disabled=true;
      }else if(control.dataset.tbLockWasDisabled!==undefined){
        control.disabled=control.dataset.tbLockWasDisabled==='1';
        delete control.dataset.tbLockWasDisabled;
      }
    };
    editor?.querySelectorAll('input,textarea,select').forEach(applyDisabledState);
    editor?.querySelectorAll('[data-week-technique-control], .btn-rm-set').forEach(applyDisabledState);
  }

  if(typeof loadPrescriptionEditor==='function'){
    const base=loadPrescriptionEditor;
    loadPrescriptionEditor=function(){const result=base.apply(this,arguments);queueMicrotask(updatePrescriptionLockUi);return result;};
  }
  if(typeof clearPrescriptionWeek==='function'){
    const base=clearPrescriptionWeek;
    clearPrescriptionWeek=function(){const exercise=activePlanExercise(),week=currentPrescriptionWeek();if(exercise&&weekLocked(exercise,week))return notifyLocked(exercise,week);return base.apply(this,arguments);};
  }
  if(typeof restoreWeekTechniquesToDefault==='function'){
    const base=restoreWeekTechniquesToDefault;
    restoreWeekTechniquesToDefault=function(){const exercise=activePlanExercise(),week=currentPrescriptionWeek();if(exercise&&weekLocked(exercise,week))return notifyLocked(exercise,week);return base.apply(this,arguments);};
  }
  function techniqueLockConflict(exercise,week,config){
    const workout=activePlanWorkout();if(!exercise||!workout)return'';
    const normalized=cloneWeekTechnique(config),newPartnerId=normalized.techniqueIds?.includes('ss')?String(normalized.supersetExerciseId||''):'';
    const oldConfig=resolveWeekTechniqueConfig(exercise,week),oldPartnerId=oldConfig.techniqueIds?.includes('ss')?String(oldConfig.supersetExerciseId||''):'';
    if(oldPartnerId&&oldPartnerId!==newPartnerId){
      const oldPartner=(workout.exercises||[]).find(item=>String(item.id)===oldPartnerId);
      if(oldPartner&&weekLocked(oldPartner,week))return`O exercício ${oldPartner.name||'parceiro do Super set'} está protegido na semana ${week}. Destranque-o antes de desfazer o vínculo.`;
    }
    if(newPartnerId){
      const partner=(workout.exercises||[]).find(item=>String(item.id)===newPartnerId);
      if(partner&&weekLocked(partner,week)){
        const partnerConfig=resolveWeekTechniqueConfig(partner,week);
        const alreadyLinked=partnerConfig.techniqueIds?.includes('ss')&&String(partnerConfig.supersetExerciseId||'')===String(exercise.id);
        if(!alreadyLinked)return`O exercício ${partner.name||'parceiro do Super set'} está protegido na semana ${week}. Destranque-o antes de criar o vínculo.`;
      }
    }
    return'';
  }
  if(typeof persistWeekTechniqueConfiguration==='function'){
    const base=persistWeekTechniqueConfiguration;
    persistWeekTechniqueConfiguration=async function(config,weeks,options){
      const exercise=activePlanExercise(),requested=(Array.isArray(weeks)?weeks:[]).map(Number).filter(w=>w>=1&&w<=8);
      if(!exercise)return base.apply(this,arguments);
      const allowed=[];let skipped=0;
      for(const week of requested){
        if(weekLocked(exercise,week)){skipped++;continue;}
        const conflict=techniqueLockConflict(exercise,week,config);
        if(conflict){alert(conflict);skipped++;continue;}
        allowed.push(week);
      }
      if(!allowed.length)return notifyLocked(exercise,requested[0]||currentPrescriptionWeek());
      const result=await base.call(this,config,allowed,options);
      if(result&&skipped)showToast(`🔒 ${skipped} semana(s) protegida(s) ou com vínculo protegido foram preservadas`);
      return result;
    };
  }
  if(typeof buildWeeklyPlanUpdate==='function'){
    const base=buildWeeklyPlanUpdate;
    buildWeeklyPlanUpdate=function(currentPlan,week,sets,replicate=false){
      const exercise=activePlanExercise(),safeWeek=Math.max(1,Math.min(8,Number(week)||1));
      if(!replicate||!exercise)return base.apply(this,arguments);
      const plan=typeof normalizeWeeklyPlan==='function'?normalizeWeeklyPlan(currentPlan):{...(currentPlan||{})};
      plan['w'+safeWeek]=typeof clonePrescriptionSets==='function'?clonePrescriptionSets(sets):JSON.parse(JSON.stringify(sets||[]));
      for(let next=safeWeek+1;next<=8;next++)if(!weekLocked(exercise,next))plan['w'+next]=typeof clonePrescriptionSets==='function'?clonePrescriptionSets(sets):JSON.parse(JSON.stringify(sets||[]));
      return plan;
    };
  }
  if(typeof persistPrescription==='function'){
    const base=persistPrescription;
    persistPrescription=async function(sets,replicate){
      const exercise=activePlanExercise(),week=currentPrescriptionWeek();
      if(exercise&&weekLocked(exercise,week))return notifyLocked(exercise,week);
      const config=typeof currentWeekTechniqueEditorConfig==='function'?currentWeekTechniqueEditorConfig():null;
      const conflict=config?techniqueLockConflict(exercise,week,config):'';
      if(conflict){alert(conflict);return false;}
      return base.apply(this,arguments);
    };
  }

  function copyPlanForWeek(source,target,week){
    const plan=typeof normalizeWeeklyPlan==='function'?normalizeWeeklyPlan(target.weeklyPlan):{...(target.weeklyPlan||{})};
    if(!weekLocked(target,week)){
      const sets=resolveWeekPrescription(source,week).sets;
      plan['w'+week]=clonePrescriptionSets(sets);
    }
    return plan;
  }
  function copyPlanForAllWeeks(source,target){
    const plan=typeof normalizeWeeklyPlan==='function'?normalizeWeeklyPlan(target.weeklyPlan):{...(target.weeklyPlan||{})};
    for(let week=1;week<=8;week++)if(!weekLocked(target,week))plan['w'+week]=clonePrescriptionSets(resolveWeekPrescription(source,week).sets);
    return plan;
  }
  if(typeof v104CopyPrescriptionToAll==='function'){
    v104CopyPrescriptionToAll=async function(copyAllWeeks=false){
      const source=activePlanExercise(),workout=activePlanWorkout();if(!source||!workout)return;
      const targets=(workout.exercises||[]).filter(item=>item.id!==source.id);if(!targets.length){showToast('Não há outros exercícios neste protocolo.',true);return;}
      const week=currentPrescriptionWeek(),sets=typeof v104CurrentPrescriptionSets==='function'?v104CurrentPrescriptionSets():[];
      if(!sets.length){alert('Cadastre ao menos uma série válida antes de copiar.');return;}
      if(!beginAction('copy-prescription-to-all','modal-prescription'))return;
      const sourceBefore=JSON.stringify(source.weeklyPlan||{}),targetsBefore=new Map(targets.map(target=>[target.id,JSON.stringify(target.weeklyPlan||{})]));
      try{
        const sourcePlan=typeof normalizeWeeklyPlan==='function'?normalizeWeeklyPlan(source.weeklyPlan):{...(source.weeklyPlan||{})};
        if(!weekLocked(source,week))sourcePlan['w'+week]=clonePrescriptionSets(sets);
        const sourceSnapshot={...source,weeklyPlan:sourcePlan};
        const updates=[];let skipped=0;
        for(const target of targets){
          const before=JSON.stringify(target.weeklyPlan||{});
          const plan=copyAllWeeks?copyPlanForAllWeeks(sourceSnapshot,target):copyPlanForWeek(sourceSnapshot,target,week);
          if(JSON.stringify(plan)===before){skipped++;continue;}
          target.weeklyPlan=plan;updates.push([target.id,plan]);
        }
        source.weeklyPlan=sourcePlan;
        if(!updates.length){showToast('🔒 Nenhum destino liberado para alteração.',true);return;}
        if(PLAN_EDIT_TARGET==='trainer'){
          const entries=[];
          if(!weekLocked(source,week)&&JSON.stringify(sourcePlan)!==sourceBefore)entries.push([source.id,sourcePlan]);
          entries.push(...updates);
          for(let start=0;start<entries.length;start+=400){
            const batch=db.batch();
            for(const [id,plan] of entries.slice(start,start+400))batch.update(db.collection('exercises').doc(id),{weeklyPlan:plan});
            await cloudWrite(batch.commit(),'repassar prescrição protegida');
          }
        }else if(typeof localSave==='function'&&!localSave())throw new Error('Não foi possível salvar no aparelho.');
        if(typeof v10513RefreshPrescriptionBoards==='function')v10513RefreshPrescriptionBoards(workout);
        if(typeof refreshPlanViewsAfterWeeklyTechniqueChange==='function')refreshPlanViewsAfterWeeklyTechniqueChange(source,week);
        showToast((copyAllWeeks?'✓ Semanas liberadas copiadas':'✓ Semana copiada')+(skipped?` · ${skipped} exercício(s) protegido(s) preservado(s)`:'')); 
      }catch(error){
        source.weeklyPlan=JSON.parse(sourceBefore);targets.forEach(target=>{target.weeklyPlan=JSON.parse(targetsBefore.get(target.id)||'{}');});
        alert(typeof cloudWriteError==='function'?cloudWriteError(error,'repassar a prescrição para todos os exercícios'):String(error?.message||error));
      }finally{endAction('copy-prescription-to-all','modal-prescription');}
    };
  }

  if(typeof renderBulkTargets==='function'){
    const base=renderBulkTargets;
    renderBulkTargets=function(){
      base.apply(this,arguments);
      const workout=VIEW_STUDENT_WORKOUT,mode=document.getElementById('bulk-copy-mode')?.value||'all',week=Math.max(1,Math.min(8,Number(document.getElementById('bulk-copy-week')?.value)||1));
      document.querySelectorAll('#bulk-targets input[type=checkbox]').forEach(input=>{
        const exercise=workout?.exercises?.find(item=>String(item.id)===String(input.value));if(!exercise)return;
        const completely=exerciseLocked(exercise),specific=mode==='week'&&weekLocked(exercise,week);
        input.disabled=completely||specific;
        const label=input.closest('.bulk-target');if(label){label.classList.toggle('tb-target-locked',input.disabled);const small=label.querySelector('small');if(small&&input.disabled&&!small.textContent.includes('PROTEGIDO'))small.textContent+=' · 🔒 PROTEGIDO';}
      });
    };
  }
  if(typeof syncBulkWeekVisibility==='function'){
    const base=syncBulkWeekVisibility;
    syncBulkWeekVisibility=function(){const result=base.apply(this,arguments);if(typeof renderBulkTargets==='function')renderBulkTargets();return result;};
  }
  if(typeof saveBulkPrescription==='function'){
    saveBulkPrescription=async function(){
      const workout=VIEW_STUDENT_WORKOUT,sourceId=document.getElementById('bulk-source-exercise')?.value,source=workout?.exercises?.find(e=>e.id===sourceId);if(!source)return;
      const ids=[...document.querySelectorAll('#bulk-targets input:checked:not(:disabled)')].map(x=>x.value);if(!ids.length){alert('Selecione ao menos um exercício de destino liberado.');return;}
      const mode=document.getElementById('bulk-copy-mode')?.value||'all',week=Math.max(1,Math.min(8,Number(document.getElementById('bulk-copy-week')?.value)||1));
      if(!beginAction('bulk-prescription','modal-bulk-prescription'))return;
      const before=new Map();
      try{
        const updates=[];
        for(const id of ids){
          const target=workout.exercises.find(e=>e.id===id);if(!target)continue;before.set(id,JSON.stringify(target.weeklyPlan||{}));
          const plan=mode==='all'?copyPlanForAllWeeks(source,target):copyPlanForWeek(source,target,week);
          if(JSON.stringify(plan)===before.get(id))continue;
          target.weeklyPlan=plan;updates.push([id,plan]);
        }
        if(!updates.length){showToast('🔒 Todos os destinos selecionados estão protegidos.',true);return;}
        const batch=db.batch();for(const [id,plan] of updates)batch.update(db.collection('exercises').doc(id),{weeklyPlan:plan});
        await cloudWrite(batch.commit(),'salvar alterações protegidas');
        closeModal('modal-bulk-prescription');if(VIEW_STUDENT_DAY)renderTsDay();else renderTsWorkout(workout);
        showToast(mode==='all'?'✓ Semanas liberadas copiadas; bloqueios preservados':`✓ Semana ${week} copiada; bloqueios preservados`);
      }catch(error){
        for(const [id,raw] of before){const target=workout.exercises.find(e=>e.id===id);if(target)target.weeklyPlan=JSON.parse(raw||'{}');}
        alert('Erro ao copiar prescrições: '+(error?.message||error));
      }finally{endAction('bulk-prescription','modal-bulk-prescription');}
    };
  }

  if(typeof applyWeekTechniquesToAllExercises==='function'){
    const base=applyWeekTechniquesToAllExercises;
    applyWeekTechniquesToAllExercises=async function(){
      const workout=activePlanWorkout(),week=currentPrescriptionWeek();
      if(!workout)return base.apply(this,arguments);
      const unlocked=(workout.exercises||[]).filter(exercise=>!weekLocked(exercise,week));
      if(!unlocked.length){showToast(`🔒 Todos os exercícios estão protegidos na semana ${week}.`,true);return;}
      const locked=(workout.exercises||[]).filter(exercise=>weekLocked(exercise,week));
      if(!locked.length)return base.apply(this,arguments);
      const source=activePlanExercise(),config=typeof currentWeekTechniqueEditorConfig==='function'?currentWeekTechniqueEditorConfig():null;
      if(!source||!config||weekLocked(source,week)){notifyLocked(source,week);return;}
      const conflict=techniqueLockConflict(source,week,config);if(conflict){alert(conflict);return;}
      const updates=new Map(),before=new Map();
      for(const exercise of unlocked){
        const currentPlan=typeof materializeWeeklyTechniquePlan==='function'?materializeWeeklyTechniquePlan(exercise):normalizeWeeklyTechniquePlan(exercise.weeklyTechniquePlan);
        const currentConfig=typeof weekTechniqueConfigFromPlan==='function'?weekTechniqueConfigFromPlan(exercise,currentPlan,week):resolveWeekTechniqueConfig(exercise,week);
        const nextConfig=typeof massTechniqueConfigForExercise==='function'?massTechniqueConfigForExercise(config,currentConfig,String(exercise.id)===String(source.id)):config;
        before.set(exercise.id,JSON.stringify(exercise.weeklyTechniquePlan||{}));
        updates.set(exercise.id,setWeekTechniqueConfig(currentPlan,week,nextConfig));
      }
      try{
        if(typeof commitExerciseTechniqueUpdates==='function')await commitExerciseTechniqueUpdates(updates);
        for(const [id,plan] of updates){const exercise=workout.exercises.find(item=>String(item.id)===String(id));if(exercise)exercise.weeklyTechniquePlan=plan;}
        if(PLAN_EDIT_TARGET!=='trainer'&&typeof localSave==='function'&&!localSave())throw new Error('Não foi possível salvar no aparelho.');
        if(typeof refreshPlanViewsAfterWeeklyTechniqueChange==='function')refreshPlanViewsAfterWeeklyTechniqueChange(source,week);
        if(typeof renderWeekTechniqueEditor==='function')renderWeekTechniqueEditor();
        showToast(`✓ Técnicas aplicadas a ${unlocked.length} exercício(s) · ${locked.length} protegido(s) preservado(s)`);
      }catch(error){
        for(const [id,raw] of before){const exercise=workout.exercises.find(item=>String(item.id)===String(id));if(exercise)exercise.weeklyTechniquePlan=JSON.parse(raw||'{}');}
        alert(typeof cloudWriteError==='function'?cloudWriteError(error,'aplicar as técnicas aos exercícios liberados'):String(error?.message||error));
      }
    };
  }

  function latestScheduledCheckin(checkins){
    return (Array.isArray(checkins)?checkins:[])
      .filter(item=>String(item?.requestKind||'scheduled')!=='manual'&&validIsoDate(item?.submittedDate))
      .sort((a,b)=>String(b.submittedDate).localeCompare(String(a.submittedDate))||String(b.id||'').localeCompare(String(a.id||'')))[0]||null;
  }
  function nextScheduledDueFromSubmission(schedule,checkins){
    if(!schedule||!validIsoDate(schedule.nextDueDate))return'';
    const last=latestScheduledCheckin(checkins);if(!last)return String(schedule.nextDueDate);
    const interval=Math.max(1,Math.min(31,Number(schedule.intervalDays)||7));
    const stored=String(schedule.nextDueDate),lastDue=String(last.dueDate||'');
    if(validIsoDate(lastDue)&&stored!==lastDue&&stored>String(last.submittedDate))return stored;
    return addDaysIso(last.submittedDate,interval);
  }
  if(typeof computeCheckinRequest==='function'){
    computeCheckinRequest=function(schedule,checkins){
      if(!schedule||!validIsoDate(schedule.nextDueDate))return null;
      const completed=new Set((checkins||[]).map(item=>String(item.requestKey||'')));
      if(schedule.extraRequestId&&!completed.has(checkinRequestKey('manual',schedule.extraRequestedAt,schedule.extraRequestId))){
        return{kind:'manual',requestId:String(schedule.extraRequestId),dueDate:String(schedule.extraRequestedAt||today()),requestKey:checkinRequestKey('manual',schedule.extraRequestedAt,schedule.extraRequestId),pending:true};
      }
      const interval=Math.max(1,Math.min(31,Number(schedule.intervalDays)||7));
      let due=nextScheduledDueFromSubmission(schedule,checkins)||String(schedule.nextDueDate),guard=0;
      while(completed.has(checkinRequestKey('scheduled',due))&&guard++<520)due=addDaysIso(due,interval);
      return{kind:'scheduled',requestId:'',dueDate:due,requestKey:checkinRequestKey('scheduled',due),pending:due<=today()};
    };
  }
  if(typeof renderWeeklyCheckinCard==='function'){
    const base=renderWeeklyCheckinCard;
    renderWeeklyCheckinCard=function(loadError=false){
      const result=base.apply(this,arguments),meta=document.getElementById('weekly-checkin-meta');
      if(!loadError&&meta&&WEEKLY_CHECKIN_REQUEST?.kind==='scheduled'&&latestScheduledCheckin(WEEKLY_CHECKINS))meta.textContent=`Próxima entrega: ${fmt(WEEKLY_CHECKIN_REQUEST.dueDate)} · 7 dias após o último envio.`;
      return result;
    };
  }
  if(typeof loadTrainerCheckinSchedule==='function'){
    loadTrainerCheckinSchedule=async function(studentUid){
      if(!studentUid||CURRENT_USER?.role!=='trainer')return;
      try{
        const [doc,checkins]=await Promise.all([
          cloudGet(db.collection('checkinSchedules').doc(studentUid),'programação do relatório'),
          fetchWeeklyCheckins(studentUid)
        ]);
        if(VIEW_STUDENT?.uid!==studentUid)return;
        TRAINER_CHECKIN_SCHEDULE=doc.exists?{...doc.data(),studentId:studentUid}:{studentId:studentUid,nextDueDate:addDaysIso(today(),7),intervalDays:7,extraRequestId:'',extraRequestedAt:''};
        const effectiveDue=nextScheduledDueFromSubmission(TRAINER_CHECKIN_SCHEDULE,checkins)||TRAINER_CHECKIN_SCHEDULE.nextDueDate;
        const dateInput=document.getElementById('trainer-checkin-date'),intervalInput=document.getElementById('trainer-checkin-interval'),state=document.getElementById('trainer-checkin-state'),help=document.getElementById('trainer-checkin-help');
        if(dateInput)dateInput.value=validIsoDate(effectiveDue)?effectiveDue:addDaysIso(today(),7);
        if(intervalInput)intervalInput.value='7';
        if(state){state.textContent=doc.exists?'PROGRAMADO':'NÃO SALVO';state.className='quest-status '+(doc.exists?'answered':'pending');}
        const last=latestScheduledCheckin(checkins);
        if(help)help.textContent=last?`Último relatório enviado em ${fmt(last.submittedDate)}. Próximo envio automático em ${fmt(effectiveDue)} (7 dias após o envio).`:'Nenhum relatório recebido ainda. Salve a primeira data para iniciar a cobrança semanal.';
        const note=document.getElementById('trainer-cycle-link-note');
        if(note&&TRAINER_CHECKIN_SCHEDULE){const start=TRAINER_CHECKIN_SCHEDULE.cycleStartDate,update=TRAINER_CHECKIN_SCHEDULE.cycleUpdateDate;note.innerHTML=start&&update?`Ciclo alinhado: início <b>${esc(fmt(start))}</b> · atualização <b>${esc(fmt(update))}</b> · relatórios a cada 7 dias após cada envio.`:'Defina as datas do treino ou da dieta ativa para alinhar automaticamente as semanas e relatórios.';}
      }catch(error){
        const state=document.getElementById('trainer-checkin-state'),help=document.getElementById('trainer-checkin-help');
        if(state)state.textContent='ERRO';if(help)help.textContent='Não foi possível carregar a programação. Tente novamente.';
      }
    };
  }
  if(CURRENT_USER?.role==='student'&&WEEKLY_CHECKIN_SCHEDULE&&Array.isArray(WEEKLY_CHECKINS)){
    WEEKLY_CHECKIN_REQUEST=computeCheckinRequest(WEEKLY_CHECKIN_SCHEDULE,WEEKLY_CHECKINS);
    if(typeof renderWeeklyCheckinCard==='function')renderWeeklyCheckinCard();
  }

  function injectWorkflowStyles(){
    if(document.getElementById('tb-workflow-style'))return;
    const style=document.createElement('style');style.id='tb-workflow-style';style.textContent=`
      .tb-prescription-lockbar{margin:8px 0 12px;padding:10px;border:1px solid rgba(34,197,94,.22);background:rgba(34,197,94,.035);display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
      .tb-prescription-lockbar.is-locked{border-color:rgba(239,68,68,.46);background:rgba(239,68,68,.06)}
      .tb-lock-state{font-family:'DM Mono',monospace;font-size:9px;letter-spacing:.6px;color:var(--text-dim)}
      .tb-prescription-lockbar.is-locked .tb-lock-state{color:#fca5a5}.tb-lock-actions{display:flex;gap:6px;flex-wrap:wrap}.tb-lock-actions button{width:auto;margin:0}
      .bulk-target.tb-target-locked{opacity:.48}.bulk-target.tb-target-locked input{cursor:not-allowed}
      #modal-feedback.tb-feedback-float{pointer-events:none;background:transparent!important;align-items:flex-start!important;justify-content:flex-end!important;padding:18px!important}
      #modal-feedback.tb-feedback-float .feedback-editor-sheet{pointer-events:auto;position:fixed;z-index:2147483000;right:18px;top:92px;width:min(520px,calc(100vw - 36px));max-height:calc(100vh - 110px);overflow:auto;border:1px solid rgba(225,29,72,.55);box-shadow:0 24px 70px rgba(0,0,0,.58);transform:none!important;margin:0!important}
      #modal-feedback.tb-feedback-float .modal-handle{cursor:move;touch-action:none}
      #modal-feedback.tb-feedback-float.tb-feedback-minimized .feedback-editor-sheet{height:auto;max-height:none;overflow:hidden;width:min(390px,calc(100vw - 28px))}
      #modal-feedback.tb-feedback-float.tb-feedback-minimized .feedback-editor-sheet>*:not(.modal-handle):not(.modal-title):not(.tb-feedback-window-actions){display:none!important}
      .tb-feedback-window-actions{display:flex;gap:5px;position:absolute;right:12px;top:10px;z-index:4}.tb-feedback-window-actions button{width:30px;height:28px;padding:0;margin:0}
      .feedback-editor-sheet{position:relative}.tb-weekly-report-actions{display:flex;gap:6px;align-items:stretch;margin-bottom:8px}.tb-weekly-report-actions .weekly-checkin-history-card{flex:1;margin:0}.tb-report-feedback-btn{flex:0 0 auto;width:auto!important;padding:8px 10px!important}
      @media(max-width:640px){#modal-feedback.tb-feedback-float{padding:8px!important}#modal-feedback.tb-feedback-float .feedback-editor-sheet{right:8px;top:68px;width:calc(100vw - 16px);max-height:calc(100vh - 82px)}.tb-weekly-report-actions{display:grid;grid-template-columns:1fr auto}}
    `;document.head.appendChild(style);
  }
  function ensureFeedbackWindowControls(){
    const sheet=document.querySelector('#modal-feedback .feedback-editor-sheet');if(!sheet||sheet.querySelector('.tb-feedback-window-actions'))return;
    const actions=document.createElement('div');actions.className='tb-feedback-window-actions';actions.innerHTML='<button type="button" class="btn-ghost" id="tb-feedback-minimize" title="Minimizar feedback" aria-label="Minimizar feedback">—</button><button type="button" class="btn-ghost" id="tb-feedback-close" title="Fechar feedback" aria-label="Fechar feedback">✕</button>';
    sheet.appendChild(actions);
    document.getElementById('tb-feedback-minimize').addEventListener('click',()=>setFeedbackMinimized(!feedbackMinimized));
    document.getElementById('tb-feedback-close').addEventListener('click',()=>closeModal('modal-feedback'));
    const handle=sheet.querySelector('.modal-handle')||sheet.querySelector('.modal-title');
    handle?.addEventListener('pointerdown',startFeedbackDrag);
  }
  function setFeedbackMinimized(value){
    feedbackMinimized=!!value;const modal=document.getElementById('modal-feedback'),button=document.getElementById('tb-feedback-minimize');
    modal?.classList.toggle('tb-feedback-minimized',feedbackMinimized);if(button){button.textContent=feedbackMinimized?'□':'—';button.title=feedbackMinimized?'Restaurar feedback':'Minimizar feedback';}
  }
  function clampFeedbackPosition(sheet,left,top){
    const maxLeft=Math.max(8,window.innerWidth-sheet.offsetWidth-8),maxTop=Math.max(8,window.innerHeight-Math.min(sheet.offsetHeight,120)-8);
    return{left:Math.max(8,Math.min(maxLeft,left)),top:Math.max(8,Math.min(maxTop,top))};
  }
  function startFeedbackDrag(event){
    if(event.button!==undefined&&event.button!==0)return;
    const sheet=document.querySelector('#modal-feedback .feedback-editor-sheet');if(!sheet)return;
    const rect=sheet.getBoundingClientRect();feedbackDrag={pointerId:event.pointerId,dx:event.clientX-rect.left,dy:event.clientY-rect.top,sheet};
    sheet.setPointerCapture?.(event.pointerId);event.preventDefault();
  }
  document.addEventListener('pointermove',event=>{
    if(!feedbackDrag||event.pointerId!==feedbackDrag.pointerId)return;
    const pos=clampFeedbackPosition(feedbackDrag.sheet,event.clientX-feedbackDrag.dx,event.clientY-feedbackDrag.dy);
    Object.assign(feedbackDrag.sheet.style,{left:pos.left+'px',top:pos.top+'px',right:'auto'});
  });
  document.addEventListener('pointerup',event=>{if(feedbackDrag&&event.pointerId===feedbackDrag.pointerId)feedbackDrag=null;});
  function openFloatingFeedback(type='general',context=null){
    feedbackContext=context&&typeof context==='object'?{...context}:null;
    const typeInput=document.getElementById('input-feedback-type'),title=document.getElementById('input-feedback-title'),message=document.getElementById('input-feedback');
    if(typeInput)typeInput.value=typeof v1010FeedbackType==='function'?v1010FeedbackType(type):type;
    if(title)title.value=String(feedbackContext?.title||'').slice(0,160);
    if(message)message.value=String(feedbackContext?.message||'').slice(0,30000);
    if(typeof syncFeedbackEditorType==='function')syncFeedbackEditorType();
    if(title&&feedbackContext?.title)title.value=String(feedbackContext.title).slice(0,160);
    if(typeof updateFeedbackCharacterCount==='function')updateFeedbackCharacterCount();
    injectWorkflowStyles();ensureFeedbackWindowControls();
    const modal=document.getElementById('modal-feedback');modal?.classList.add('tb-feedback-float');setFeedbackMinimized(false);
    openModal('modal-feedback');
  }
  openFeedbackModal=function(type='general',context=null){
    if(!VIEW_STUDENT)return;
    const normalized=typeof v1010FeedbackType==='function'?v1010FeedbackType(type):String(type||'general');
    if(normalized==='protocol_update'&&!context){
      const state=typeof v109ProtocolState==='function'?v109ProtocolState(V109_PROTOCOL_REVIEW_SCHEDULE):null;
      const cycle=state?.pendingCycle||state?.lastCompletedCycle||0;
      context={sourceType:'protocol_update',sourceId:cycle?'protocol-cycle-'+cycle:'protocol-update',sourceDate:state?.pending?state.nextDueDate:(V109_PROTOCOL_REVIEW_SCHEDULE?.lastCompletedDate||today()),title:cycle?`Feedback da atualização completa nº ${cycle}`:'Feedback da atualização completa'};
    }
    openFloatingFeedback(normalized,context);
  };
  window.openFeedbackForWeeklyReport=function(id){
    const item=(WEEKLY_CHECKINS||[]).find(report=>String(report.id)===String(id));if(!item||!VIEW_STUDENT)return;
    const date=item.submittedDate||item.dueDate||today();
    openFeedbackModal('weekly_report',{sourceType:'weekly_report',sourceId:String(item.id),sourceDate:String(date),title:`Feedback do relatório semanal de ${fmt(date)}`});
  };
  if(typeof renderWeeklyCheckinHistory==='function'){
    renderWeeklyCheckinHistory=function(items,listId){
      const list=document.getElementById(listId);if(!list)return;
      if(!items.length){list.innerHTML='<div class="no-data-inline">Nenhum relatório semanal enviado.</div>';return;}
      const trainer=CURRENT_USER?.role==='trainer'&&String(listId)==='ts-weekly-checkin-list';
      list.innerHTML=items.map(item=>{
        const count=Array.isArray(item.photoIds)?item.photoIds.length:6;
        const card=`<button class="weekly-checkin-history-card" onclick="viewWeeklyCheckin(${jsArg(item.id)})"><div><span>${esc(fmt(item.submittedDate||item.dueDate))}</span><strong>${item.requestKind==='manual'?'Relatório extra':'Relatório semanal'}</strong><small>${Number(item.weight)>0?esc(Number(item.weight).toLocaleString('pt-BR',{maximumFractionDigits:1}))+' kg · ':''}${count} fotos${item.dueDate?' · Período: '+esc(fmt(item.dueDate)):''}</small></div><span class="exercise-row-arrow">›</span></button>`;
        return trainer?`<div class="tb-weekly-report-actions">${card}<button type="button" class="btn-add-set tb-report-feedback-btn" onclick="openFeedbackForWeeklyReport(${jsArg(item.id)})">FEEDBACK EXTENSO</button></div>`:card;
      }).join('');
    };
  }
  if(typeof sendFeedback==='function'){
    sendFeedback=async function(){
      const input=document.getElementById('input-feedback'),message=(input?.value||'').normalize('NFKC').trim(),type=typeof v1010FeedbackType==='function'?v1010FeedbackType(document.getElementById('input-feedback-type')?.value):String(document.getElementById('input-feedback-type')?.value||'general');
      const title=(document.getElementById('input-feedback-title')?.value||'').normalize('NFKC').trim().slice(0,160)||(typeof v1010FeedbackLabel==='function'?v1010FeedbackLabel({feedbackType:type}):'Feedback');
      if(!message){alert('Digite o conteúdo do feedback.');return;}if(message.length>30000){alert('O feedback ultrapassa 30.000 caracteres.');return;}if(!VIEW_STUDENT||!beginAction('send-feedback','modal-feedback'))return;
      try{
        const draftKey='feedback-'+VIEW_STUDENT.uid,feedbackId=idempotentDraftId(draftKey,'feedback'),schedule=type==='protocol_update'?V109_PROTOCOL_REVIEW_SCHEDULE:null,state=schedule&&typeof v109ProtocolState==='function'?v109ProtocolState(schedule):null;
        const payload={studentId:VIEW_STUDENT.uid,trainerId:CURRENT_USER.uid,title,feedbackType:type,message,protocolStartDate:type==='protocol_update'&&validIsoDate(schedule?.startDate)?schedule.startDate:'',protocolCycle:type==='protocol_update'?Math.max(0,Number(state?.pendingCycle||state?.lastCompletedCycle||0)):0,createdAt:firebase.firestore.FieldValue.serverTimestamp(),read:false};
        if(feedbackContext){
          payload.sourceType=String(feedbackContext.sourceType||'').slice(0,40);
          payload.sourceId=String(feedbackContext.sourceId||'').slice(0,190);
          payload.sourceDate=validIsoDate(feedbackContext.sourceDate)?String(feedbackContext.sourceDate):'';
        }
        await cloudWrite(db.collection('feedback').doc(feedbackId).set(payload),'enviar o feedback');
        clearIdempotentDraft(draftKey);feedbackContext=null;closeModal('modal-feedback');alert('Feedback enviado. Se houver outras transmissões pendentes, o aluno verá cada uma em sequência.');
      }catch(error){alert(cloudWriteError(error,'enviar o feedback'));}finally{endAction('send-feedback','modal-feedback');}
    };
  }

  if(typeof closeModal==='function'){
    const base=closeModal;
    closeModal=function(id){
      const result=base.apply(this,arguments);
      if(id==='modal-feedback'){
        const modal=document.getElementById('modal-feedback'),sheet=modal?.querySelector('.feedback-editor-sheet');
        modal?.classList.remove('tb-feedback-minimized');feedbackMinimized=false;feedbackDrag=null;feedbackContext=null;
        if(sheet){sheet.style.left='';sheet.style.top='';sheet.style.right='';}
      }
      return result;
    };
  }

  injectWorkflowStyles();
  ensureLockUi();
  ensureFeedbackWindowControls();
  window.TeamBullsWorkflowControls=Object.freeze({version:VERSION,weekLocked,exerciseLocked,nextScheduledDueFromSubmission});
})();
