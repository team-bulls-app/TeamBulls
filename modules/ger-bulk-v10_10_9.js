/* Team Bulls v10.10.9 — alteração de GER em lote sem copiar reps/técnicas. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_GER_BULK_V10109__)return;
  window.__TEAM_BULLS_GER_BULK_V10109__=true;

  const TOOL_ID='tb-ger-bulk-tools';
  const SELECT_ID='tb-ger-bulk-level';
  let busy=false;

  function safeGer(value){
    const ger=parseInt(value,10);
    return Number.isInteger(ger)&&ger>=1&&ger<=6?ger:null;
  }
  function currentWeek(){
    return Math.max(1,Math.min(8,parseInt(document.getElementById('input-prescription-week')?.value,10)||1));
  }
  function currentExercise(){
    try{return typeof getPlanEditExercise==='function'?getPlanEditExercise():null;}catch(error){return null;}
  }
  function currentWorkout(){
    try{
      if(PLAN_EDIT_TARGET==='trainer')return VIEW_STUDENT_WORKOUT||null;
      return typeof getW==='function'?getW(PLAN_EDIT_WID):null;
    }catch(error){return null;}
  }
  function canBulkEdit(){
    try{
      if(PLAN_EDIT_TARGET==='trainer')return CURRENT_USER?.role==='trainer'&&!!VIEW_STUDENT_WORKOUT;
      return PLAN_EDIT_TARGET==='local'&&!!currentWorkout();
    }catch(error){return false;}
  }
  function clonePlan(plan){
    try{return JSON.parse(JSON.stringify(normalizeWeeklyPlan(plan)));}
    catch(error){return{};}
  }
  function setsWithGer(sets,ger){
    return (Array.isArray(sets)?sets:[]).map(set=>({
      targetMin:Number(set.targetMin),
      targetMax:Number(set.targetMax),
      ger,...(['seconds','reps'].includes(set.unit)?{unit:set.unit}:{})
    }));
  }
  function samePlan(a,b){
    try{return JSON.stringify(a)===JSON.stringify(b);}catch(error){return false;}
  }
  function selectedGer(){return safeGer(document.getElementById(SELECT_ID)?.value);}
  function defaultGer(){
    const rows=[...document.querySelectorAll('#prescription-editor .plan-set-row:not([data-backoff="1"])')];
    const values=rows.map(row=>safeGer(row.querySelector('[data-f="ger"]')?.value)).filter(Boolean);
    if(values.length&&values.every(value=>value===values[0]))return values[0];
    try{
      const rx=resolveWeekPrescription(currentExercise(),currentWeek());
      const ger=safeGer(rx?.sets?.[0]?.ger);
      if(ger)return ger;
    }catch(error){}
    return 3;
  }

  function installStyles(){
    if(document.getElementById('tb-ger-bulk-style'))return;
    const style=document.createElement('style');
    style.id='tb-ger-bulk-style';
    style.textContent=`
      #${TOOL_ID}{margin-top:14px;padding:12px;border:1px solid rgba(202,48,48,.28);border-radius:10px;background:rgba(120,18,20,.07)}
      #${TOOL_ID}[hidden]{display:none!important}
      .tb-ger-bulk-title{font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.12em;color:#cf6d6f;margin-bottom:8px}
      .tb-ger-bulk-row{display:grid;grid-template-columns:minmax(94px,130px) 1fr 1.15fr;gap:8px;align-items:stretch}
      .tb-ger-bulk-row .form-input{min-width:0;margin:0}
      .tb-ger-bulk-row button{min-height:42px;line-height:1.15}
      .tb-ger-bulk-help{display:block;margin-top:8px;color:var(--text-dim);font-size:10px;line-height:1.35}
      @media(max-width:720px){.tb-ger-bulk-row{grid-template-columns:1fr}.tb-ger-bulk-row button{width:100%}}
    `;
    document.head.appendChild(style);
  }
  function ensureControls(){
    const modal=document.getElementById('modal-prescription');
    const actions=modal?.querySelector('.prescription-global-actions');
    if(!modal||!actions)return null;
    let host=document.getElementById(TOOL_ID);
    if(host)return host;
    host=document.createElement('div');
    host.id=TOOL_ID;
    host.innerHTML=`
      <div class="tb-ger-bulk-title">GER EM LOTE · ALTERA SOMENTE O ESFORÇO</div>
      <div class="tb-ger-bulk-row">
        <select class="form-input" id="${SELECT_ID}" aria-label="GER para aplicação em lote">
          <option value="1">GER 1</option><option value="2">GER 2</option><option value="3">GER 3</option>
          <option value="4">GER 4</option><option value="5">GER 5</option><option value="6">GER 6</option>
        </select>
        <button type="button" class="btn-ghost" id="tb-ger-week-all">GER S<span id="tb-ger-week-label">1</span> → TODOS EXERCÍCIOS</button>
        <button type="button" class="btn-ghost" id="tb-ger-exercise-all">GER → 8 SEMANAS DESTE EXERCÍCIO</button>
      </div>
      <small class="tb-ger-bulk-help">Reps, faixas, técnicas, BOS, Super set e registros realizados permanecem inalterados. Exercícios/semanas sem prescrição são ignorados.</small>`;
    actions.parentNode.insertBefore(host,actions);
    host.querySelector('#tb-ger-week-all').addEventListener('click',applyGerToCurrentWeekAllExercises);
    host.querySelector('#tb-ger-exercise-all').addEventListener('click',applyGerToAllWeeksCurrentExercise);
    host.querySelector('#'+SELECT_ID).addEventListener('change',event=>{event.currentTarget.dataset.userSet='1';});
    return host;
  }
  function syncControls({resetGer=false}={}){
    const host=ensureControls();if(!host)return;
    host.hidden=!canBulkEdit();if(host.hidden)return;
    const label=host.querySelector('#tb-ger-week-label');if(label)label.textContent=String(currentWeek());
    const select=host.querySelector('#'+SELECT_ID);
    if(select&&(resetGer||select.dataset.userSet!=='1'))select.value=String(defaultGer());
  }
  function setBusy(value){
    busy=!!value;
    const host=document.getElementById(TOOL_ID);if(!host)return;
    host.querySelectorAll('button,select').forEach(control=>control.disabled=busy);
  }
  function actionStart(key){
    if(busy)return false;
    if(typeof beginAction==='function'&&!beginAction(key,'modal-prescription'))return false;
    setBusy(true);return true;
  }
  function actionEnd(key){
    setBusy(false);
    if(typeof endAction==='function')endAction(key,'modal-prescription');
  }
  function updateEditorGer(ger){
    document.querySelectorAll('#prescription-editor .plan-set-row:not([data-backoff="1"]) [data-f="ger"]').forEach(select=>{select.value=String(ger);});
  }
  function refreshAfterBulk(exercise,week,ger){
    updateEditorGer(ger);
    try{if(typeof refreshPlanViewsAfterWeeklyTechniqueChange==='function')refreshPlanViewsAfterWeeklyTechniqueChange(exercise,week);}catch(error){}
    syncControls();
  }
  async function writePlanChanges(changes,label){
    if(!changes.length)return false;
    if(PLAN_EDIT_TARGET==='trainer'){
      const batch=db.batch();
      changes.forEach(change=>batch.update(db.collection('exercises').doc(change.exercise.id),{weeklyPlan:change.next}));
      await cloudWrite(batch.commit(),label);
      changes.forEach(change=>{change.exercise.weeklyPlan=change.next;});
      return true;
    }
    changes.forEach(change=>{change.exercise.weeklyPlan=change.next;});
    if(localSave())return true;
    changes.forEach(change=>{change.exercise.weeklyPlan=change.before;});
    throw new Error('Falha ao gravar a alteração de GER no armazenamento local.');
  }

  async function applyGerToCurrentWeekAllExercises(){
    const ger=selectedGer(),exercise=currentExercise(),workout=currentWorkout(),week=currentWeek();
    if(!ger||!exercise||!workout||!canBulkEdit())return;
    const key=`bulk-ger-week-${workout.id||'workout'}-${week}`;
    if(!actionStart(key))return;
    try{
      const changes=[];
      for(const item of workout.exercises||[]){
        const resolved=resolveWeekPrescription(item,week);
        if(!resolved?.sets?.length)continue;
        const before=clonePlan(item.weeklyPlan),next=clonePlan(item.weeklyPlan);
        next['w'+week]=setsWithGer(resolved.sets,ger);
        if(!samePlan(before,next))changes.push({exercise:item,before,next});
      }
      if(!changes.length){showToast(`GER ${ger} já está aplicado ou não há prescrições na semana ${week}.`,true);return;}
      await writePlanChanges(changes,'aplicar GER na semana para todos os exercícios');
      refreshAfterBulk(exercise,week,ger);
      showToast(`✓ GER ${ger} aplicado na semana ${week} de ${changes.length} exercício${changes.length===1?'':'s'}`);
    }catch(error){
      alert(cloudWriteError(error,'aplicar o GER da semana em todos os exercícios'));
    }finally{actionEnd(key);}
  }

  async function applyGerToAllWeeksCurrentExercise(){
    const ger=selectedGer(),exercise=currentExercise(),week=currentWeek();
    if(!ger||!exercise||!canBulkEdit())return;
    const key=`bulk-ger-exercise-${exercise.id}`;
    if(!actionStart(key))return;
    try{
      const before=clonePlan(exercise.weeklyPlan),next=clonePlan(exercise.weeklyPlan);
      let prescribedSources=0;
      for(let n=1;n<=8;n++){
        const planKey='w'+n;
        if(!Object.prototype.hasOwnProperty.call(next,planKey))continue;
        const sets=Array.isArray(next[planKey])?next[planKey]:[];
        if(!sets.length)continue;
        next[planKey]=setsWithGer(sets,ger);prescribedSources++;
      }
      if(!prescribedSources){showToast('Este exercício ainda não possui prescrição semanal para alterar.',true);return;}
      if(samePlan(before,next)){showToast(`GER ${ger} já está aplicado em todas as semanas deste exercício.`,true);return;}
      await writePlanChanges([{exercise,before,next}],'aplicar GER nas 8 semanas do exercício');
      refreshAfterBulk(exercise,week,ger);
      showToast(`✓ GER ${ger} aplicado às 8 semanas de ${exercise.name}`);
    }catch(error){
      alert(cloudWriteError(error,'aplicar o GER em todas as semanas deste exercício'));
    }finally{actionEnd(key);}
  }

  function wrapEditorFunction(name,{resetGer=false}={}){
    const base=window[name];if(typeof base!=='function'||base.__tbGerBulk)return;
    const wrapped=function(){
      const result=base.apply(this,arguments);
      requestAnimationFrame(()=>syncControls({resetGer}));
      return result;
    };
    wrapped.__tbGerBulk=true;window[name]=wrapped;
  }
  function install(){
    installStyles();ensureControls();
    wrapEditorFunction('openPrescriptionModal',{resetGer:true});
    wrapEditorFunction('loadPrescriptionEditor');
    syncControls({resetGer:true});
    window.TeamBullsGerBulk=Object.freeze({
      version:'10.10.9-ger2',
      applyWeek:applyGerToCurrentWeekAllExercises,
      applyExercise:applyGerToAllWeeksCurrentExercise,
      refresh:syncControls
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
