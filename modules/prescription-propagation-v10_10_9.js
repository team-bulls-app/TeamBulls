/* Team Bulls v10.10.9 — propagação direta de séries, repetições e GER sem depender dos botões legados. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_PRESCRIPTION_PROPAGATION_V10109__)return;
  window.__TEAM_BULLS_PRESCRIPTION_PROPAGATION_V10109__=true;

  const VERSION='10.10.9-propagation2';
  const CENTER_ID='tb-prescription-actions-center';
  const MAX_BATCH_WRITES=450;
  let running=false;

  function editingTarget(){
    try{return PLAN_EDIT_TARGET==='trainer'||PLAN_EDIT_TARGET==='local'?PLAN_EDIT_TARGET:'';}catch(error){return'';}
  }
  function currentWeek(){
    return Math.max(1,Math.min(8,parseInt(document.getElementById('input-prescription-week')?.value,10)||1));
  }
  function clonePlan(plan){
    try{return JSON.parse(JSON.stringify(plan&&typeof plan==='object'?plan:{}));}catch(error){return{};}
  }
  function cloneSets(sets){
    if(typeof clonePrescriptionSets==='function')return clonePrescriptionSets(sets);
    return(Array.isArray(sets)?sets:[]).map(set=>({targetMin:set.targetMin,targetMax:set.targetMax,ger:set.ger,...(['seconds','reps'].includes(set.unit)?{unit:set.unit}:{})}));
  }
  function normalizedPlan(plan){
    try{return typeof normalizeWeeklyPlan==='function'?normalizeWeeklyPlan(plan):clonePlan(plan);}catch(error){return clonePlan(plan);}
  }
  function sourceContext(){
    const target=editingTarget();
    if(!target)return null;
    if(target==='trainer'){
      try{if(CURRENT_USER?.role!=='trainer'||!VIEW_STUDENT_WORKOUT)return null;}catch(error){return null;}
    }
    let source=null,workout=null;
    try{
      source=typeof getPlanEditExercise==='function'?getPlanEditExercise():null;
      workout=target==='trainer'?VIEW_STUDENT_WORKOUT:(typeof getW==='function'?getW(PLAN_EDIT_WID):null);
    }catch(error){return null;}
    if(!source||!workout)return null;
    const sets=typeof collectPrescriptionRows==='function'?collectPrescriptionRows():null;
    if(!Array.isArray(sets)||!sets.length){
      alert('Cadastre ao menos uma série válida antes de repassar a prescrição.');
      return null;
    }
    const week=currentWeek();
    let dayExercises=[];
    try{dayExercises=typeof exercisesForDay==='function'?exercisesForDay(workout,source.dayName||'Treino geral'):[];}catch(error){dayExercises=[];}
    if(!Array.isArray(dayExercises)||!dayExercises.length)dayExercises=(workout.exercises||[]).filter(item=>String(item.dayName||'Treino geral')===String(source.dayName||'Treino geral'));
    const sourceIndex=dayExercises.findIndex(item=>String(item.id)===String(source.id));
    const below=sourceIndex>=0?dayExercises.slice(sourceIndex+1):[];
    const unit=typeof exerciseUsesResistedTime==='function'?(exerciseUsesResistedTime(source,week)?'seconds':'reps'):null;
    return{target,source,workout,week,sets:cloneSets(sets).map(set=>unit?{...set,unit}:set),below};
  }
  function weeksFrom(start,end=8){
    const out=[];for(let week=Math.max(1,start);week<=Math.min(8,end);week++)out.push(week);return out;
  }
  function assertCompatibleUnit(exercise,week,sets){
    if(typeof exerciseUsesResistedTime!=='function')return;const unit=exerciseUsesResistedTime(exercise,week)?'seconds':'reps';
    if(sets.some(set=>set.unit&&set.unit!==unit))throw new Error('A prescrição usa '+(unit==='seconds'?'tempo':'repetições')+' em '+exercise.name+' na semana '+week+'. Ajuste esta semana separadamente; nenhuma prescrição foi repassada.');
  }
  function planWithWeeks(exercise,weeks,sets){
    const next=normalizedPlan(exercise.weeklyPlan);
    weeks.forEach(week=>{assertCompatibleUnit(exercise,week,sets);next['w'+week]=cloneSets(sets);});
    return next;
  }
  function addChange(map,exercise,next){
    if(!exercise?.id)return;
    map.set(String(exercise.id),{exercise,before:clonePlan(exercise.weeklyPlan),next:clonePlan(next)});
  }
  function buildChanges(context,mode){
    const{source,workout,week,sets,below}=context;
    const changes=new Map();
    const all=(workout.exercises||[]).filter(item=>String(item.id)!==String(source.id));
    const current=[week],future=weeksFrom(week+1),currentForward=weeksFrom(week);

    if(mode==='below-current'){
      addChange(changes,source,planWithWeeks(source,current,sets));
      below.forEach(exercise=>addChange(changes,exercise,planWithWeeks(exercise,current,sets)));
    }else if(mode==='source-future'){
      addChange(changes,source,planWithWeeks(source,currentForward,sets));
    }else if(mode==='below-future'){
      addChange(changes,source,planWithWeeks(source,current,sets));
      below.forEach(exercise=>addChange(changes,exercise,planWithWeeks(exercise,future,sets)));
    }else if(mode==='full-forward'){
      addChange(changes,source,planWithWeeks(source,currentForward,sets));
      below.forEach(exercise=>addChange(changes,exercise,planWithWeeks(exercise,currentForward,sets)));
    }else if(mode==='all-current'){
      addChange(changes,source,planWithWeeks(source,current,sets));
      all.forEach(exercise=>addChange(changes,exercise,planWithWeeks(exercise,current,sets)));
    }else if(mode==='all-all'){
      const sourcePlan=planWithWeeks(source,current,sets);
      addChange(changes,source,sourcePlan);
      const temp={...source,weeklyPlan:sourcePlan},materialized={};
      for(let n=1;n<=8;n++){
        const resolved=typeof resolveWeekPrescription==='function'?resolveWeekPrescription(temp,n):{sets:sourcePlan['w'+n]||[]};
        materialized['w'+n]=cloneSets(resolved?.sets||[]);
      }
      all.forEach(exercise=>{for(let n=1;n<=8;n++)assertCompatibleUnit(exercise,n,materialized['w'+n]||[]);addChange(changes,exercise,materialized);});
    }
    return changes;
  }
  function destinationGuard(context,mode){
    if((mode==='below-current'||mode==='below-future'||mode==='full-forward')&&!context.below.length){
      alert('Não há exercícios abaixo deste exercício no dia atual.');return false;
    }
    if((mode==='source-future'||mode==='below-future'||mode==='full-forward')&&context.week>=8){
      if(mode==='full-forward'&&context.below.length)return true;
      alert('Esta já é a semana 8. Não há semanas seguintes.');return false;
    }
    if((mode==='all-current'||mode==='all-all')&&(context.workout.exercises||[]).length<=1){
      alert('Não há outros exercícios neste protocolo.');return false;
    }
    return true;
  }
  function modeText(context,mode){
    const n=context.below.length,week=context.week;
    const suffix=' Técnicas de treino, BOS, Super set e sessões realizadas não serão alterados.';
    if(mode==='below-current')return[`Repassar aos exercícios abaixo`,`Copiar séries, repetições e GER da semana ${week} para ${n} exercício(s) abaixo, somente nesta semana? A prescrição aberta também será salva.${suffix}`];
    if(mode==='source-future')return['Repassar às semanas seguintes',`Copiar séries, repetições e GER da semana ${week} deste exercício até a semana 8? Prescrições já personalizadas nas semanas seguintes serão substituídas.${suffix}`];
    if(mode==='below-future')return['Repassar abaixo nas semanas seguintes',`Copiar séries, repetições e GER para ${n} exercício(s) abaixo, da semana ${week+1} até a semana 8? A semana ${week} do exercício aberto também será salva.${suffix}`];
    if(mode==='full-forward')return['Repassar tudo abaixo e à frente',`Copiar séries, repetições e GER para o exercício aberto e ${n} exercício(s) abaixo, da semana ${week} até a semana 8? Prescrições existentes nesses destinos serão substituídas.${suffix}`];
    if(mode==='all-current')return['Repassar esta semana para todos',`Copiar séries, repetições e GER da semana ${week} para todos os exercícios deste protocolo? Somente a semana ${week} será alterada nos destinos.${suffix}`];
    return['Repassar planilha completa','Copiar as 8 semanas deste exercício para todos os exercícios do protocolo? As prescrições atuais dos destinos serão substituídas.'+suffix];
  }
  function notifyError(error,label='repassar a prescrição'){
    console.error('[Team Bulls] Falha na propagação de prescrição',error);
    const message=typeof cloudWriteError==='function'?cloudWriteError(error,label):('Não foi possível '+label+'.');
    alert(message);return false;
  }
  async function commitChanges(context,mode){
    if(running)return false;
    const changes=buildChanges(context,mode);
    if(!changes.size)return false;
    if(changes.size>MAX_BATCH_WRITES){alert('Esta operação possui destinos demais para ser concluída com segurança em um único lote.');return false;}
    const actionKey='prescription-propagation-'+String(context.source.id||'exercise');
    if(typeof beginAction==='function'&&!beginAction(actionKey,'modal-prescription'))return false;
    running=true;
    try{
      if(context.target==='trainer'){
        const batch=db.batch();
        changes.forEach(change=>batch.update(db.collection('exercises').doc(change.exercise.id),{weeklyPlan:change.next}));
        await cloudWrite(batch.commit(),'repassar séries, repetições e GER');
        changes.forEach(change=>{change.exercise.weeklyPlan=clonePlan(change.next);});
      }else{
        changes.forEach(change=>{change.exercise.weeklyPlan=clonePlan(change.next);});
        if(typeof localSave!=='function'||!localSave())throw new Error('Não foi possível salvar a prescrição no aparelho.');
      }
      try{if(typeof refreshPlanViewsAfterWeeklyTechniqueChange==='function')refreshPlanViewsAfterWeeklyTechniqueChange(context.source,context.week);}catch(error){}
      const success={
        'below-current':'✓ Séries, repetições e GER aplicados aos exercícios abaixo',
        'source-future':'✓ Séries, repetições e GER repassados até a semana 8',
        'below-future':'✓ Prescrição aplicada abaixo nas semanas seguintes',
        'full-forward':'✓ Prescrição aplicada em tudo abaixo e à frente',
        'all-current':'✓ Semana atual aplicada a todos os exercícios',
        'all-all':'✓ 8 semanas aplicadas à planilha toda'
      };
      if(typeof showToast==='function')showToast(success[mode]||'✓ Prescrição repassada');
      return true;
    }catch(error){
      if(context.target!=='trainer')changes.forEach(change=>{change.exercise.weeklyPlan=clonePlan(change.before);});
      return notifyError(error);
    }finally{
      running=false;
      if(typeof endAction==='function')endAction(actionKey,'modal-prescription');
    }
  }
  function confirmPropagation(mode){
    const context=sourceContext();if(!context||!destinationGuard(context,mode))return false;
    const[title,text]=modeText(context,mode);
    const task=()=>commitChanges(context,mode);
    if(typeof showConfirm==='function'){showConfirm(title,text,task);return true;}
    if(window.confirm(text)){void task();return true;}
    return false;
  }
  function directTechnique(action){
    try{
      if(action==='full-forward'&&typeof propagateTechniquesCompleteOneClick==='function')return propagateTechniquesCompleteOneClick();
      if(typeof confirmPropagateWeekTechniques==='function')return confirmPropagateWeekTechniques(action);
    }catch(error){notifyError(error,'aplicar as técnicas');}
    return false;
  }
  function replaceButton(button,label,handler,primary=false){
    if(!button)return null;
    const next=button.cloneNode(true);
    next.removeAttribute('data-tb-action-proxy');
    next.dataset.tbPropagationPatched='1';
    next.textContent=label;
    if(primary)next.classList.add('tb-action-primary');
    next.disabled=false;
    next.onclick=null;
    next.addEventListener('click',handler);
    button.replaceWith(next);
    return next;
  }
  function addDirectionalSeriesButtons(seriesGrid){
    if(!seriesGrid||seriesGrid.querySelector('[data-tb-prescription-directional="1"]'))return;
    const group=document.createDocumentFragment();
    [
      ['↘ TUDO ABAIXO E À FRENTE','full-forward',true],
      ['↓ SOMENTE EXERCÍCIOS ABAIXO','below-current',false],
      ['↘ ABAIXO NAS SEMANAS SEGUINTES','below-future',false]
    ].forEach(([label,mode,primary])=>{
      const button=document.createElement('button');button.type='button';button.className=primary?'btn-primary tb-action-primary':'btn-ghost';
      button.dataset.tbPrescriptionDirectional='1';button.dataset.tbPrescriptionMode=mode;button.textContent=label;
      button.addEventListener('click',()=>confirmPropagation(mode));group.appendChild(button);
    });
    seriesGrid.prepend(group);
  }
  function patchTechniqueButtons(center){
    const specs=[
      ['techComplete','APLICAR EM TUDO ABAIXO E À FRENTE',()=>directTechnique('full-forward'),true],
      ['techBelowCurrent','SOMENTE EXERCÍCIOS ABAIXO',()=>directTechnique('below-current'),false],
      ['techFuture','SOMENTE SEMANAS SEGUINTES',()=>directTechnique('source-future'),false],
      ['techBelowFuture','ABAIXO NAS SEMANAS SEGUINTES',()=>directTechnique('below-future'),false]
    ];
    specs.forEach(([key,label,handler,primary])=>{
      const button=center.querySelector(`[data-tb-action-proxy="${key}"]`);
      if(button&&!button.dataset.tbPropagationPatched)replaceButton(button,label,handler,primary);
    });
  }
  function install(){
    const center=document.getElementById(CENTER_ID);if(!center)return false;
    const subgroups=[...center.querySelectorAll('.tb-actions-subgroup')];
    const series=subgroups.find(group=>group.querySelector('.tb-actions-subtitle')?.textContent.includes('SÉRIES / PRESCRIÇÃO / GER'));
    const seriesGrid=series?.querySelector('.tb-actions-grid');
    if(!series||!seriesGrid)return false;

    const replicate=center.querySelector('[data-tb-action-proxy="replicate"]');
    const copyWeek=center.querySelector('[data-tb-action-proxy="copyWeekAll"]');
    const copyAll=center.querySelector('[data-tb-action-proxy="copyAllWeeks"]');
    if(replicate)replaceButton(replicate,'→ REPASSAR ATÉ A SEMANA 8',()=>confirmPropagation('source-future'));
    if(copyWeek)replaceButton(copyWeek,'ESTA SEMANA → TODOS OS EXERCÍCIOS',()=>confirmPropagation('all-current'));
    if(copyAll)replaceButton(copyAll,'8 SEMANAS → PLANILHA TODA',()=>confirmPropagation('all-all'));
    addDirectionalSeriesButtons(seriesGrid);
    patchTechniqueButtons(center);
    return true;
  }
  function installSoon(attempt=0){
    if(install()||attempt>=8)return;
    requestAnimationFrame(()=>installSoon(attempt+1));
  }

  window.TeamBullsPrescriptionPropagation=Object.freeze({version:VERSION,apply:confirmPropagation,refresh:installSoon});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>installSoon(),{once:true});
  else installSoon();
})();
