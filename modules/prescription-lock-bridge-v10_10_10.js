/* Team Bulls v10.10.10 — faz os atalhos direcionais respeitarem weeklyEditLocks. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_PRESCRIPTION_LOCK_BRIDGE_V101010__)return;
  window.__TEAM_BULLS_PRESCRIPTION_LOCK_BRIDGE_V101010__=true;

  const VERSION='10.10.10-lockbridge1';
  const CENTER_ID='tb-prescription-actions-center';
  const MAX_BATCH_WRITES=450;
  let running=false;

  const clone=value=>{try{return JSON.parse(JSON.stringify(value&&typeof value==='object'?value:{}));}catch(error){return{};}};
  const cloneSets=sets=>typeof clonePrescriptionSets==='function'?clonePrescriptionSets(sets||[]):JSON.parse(JSON.stringify(sets||[]));
  const plan=value=>typeof normalizeWeeklyPlan==='function'?normalizeWeeklyPlan(value):clone(value);
  const currentWeek=()=>Math.max(1,Math.min(8,Number(document.getElementById('input-prescription-week')?.value)||1));
  function lockState(exercise){const raw=exercise?.weeklyEditLocks&&typeof exercise.weeklyEditLocks==='object'?exercise.weeklyEditLocks:{};return{all:raw.all===true,weeks:raw.weeks&&typeof raw.weeks==='object'?raw.weeks:{}};}
  function locked(exercise,week){const state=lockState(exercise);return state.all||state.weeks['w'+Math.max(1,Math.min(8,Number(week)||1))]===true;}
  function hasAnyLock(workout){return(workout?.exercises||[]).some(exercise=>{const state=lockState(exercise);return state.all||Object.values(state.weeks).some(Boolean);});}
  function context(){
    let source=null,workout=null,target='';
    try{target=PLAN_EDIT_TARGET;source=getPlanEditExercise();workout=target==='trainer'?VIEW_STUDENT_WORKOUT:getW(PLAN_EDIT_WID);}catch(error){return null;}
    if(!source||!workout||!['trainer','local'].includes(target))return null;
    const sets=typeof collectPrescriptionRows==='function'?collectPrescriptionRows():null;if(!Array.isArray(sets)||!sets.length)return null;
    let day=[];try{day=typeof exercisesForDay==='function'?exercisesForDay(workout,source.dayName||'Treino geral'):[];}catch(error){}
    if(!Array.isArray(day)||!day.length)day=(workout.exercises||[]).filter(item=>String(item.dayName||'Treino geral')===String(source.dayName||'Treino geral'));
    const index=day.findIndex(item=>String(item.id)===String(source.id));
    return{target,source,workout,week:currentWeek(),sets:cloneSets(sets),below:index>=0?day.slice(index+1):[]};
  }
  const weeks=(start,end=8)=>{const out=[];for(let w=Math.max(1,start);w<=Math.min(8,end);w++)out.push(w);return out;};
  function applySetsToWeeks(exercise,input,weeksToApply,sets,counter){
    const next=plan(input);
    for(const week of weeksToApply){
      if(locked(exercise,week)){counter.protected++;continue;}
      next['w'+week]=cloneSets(sets);
    }
    return next;
  }
  function addChange(changes,exercise,next){
    if(!exercise?.id)return;const before=plan(exercise.weeklyPlan);
    if(JSON.stringify(before)===JSON.stringify(next))return;
    changes.set(String(exercise.id),{exercise,before:clone(before),next:clone(next)});
  }
  function buildSeriesChanges(ctx,mode){
    const changes=new Map(),counter={protected:0},all=(ctx.workout.exercises||[]).filter(item=>String(item.id)!==String(ctx.source.id));
    const current=[ctx.week],future=weeks(ctx.week+1),forward=weeks(ctx.week);
    if(mode==='below-current'){
      addChange(changes,ctx.source,applySetsToWeeks(ctx.source,ctx.source.weeklyPlan,current,ctx.sets,counter));
      ctx.below.forEach(exercise=>addChange(changes,exercise,applySetsToWeeks(exercise,exercise.weeklyPlan,current,ctx.sets,counter)));
    }else if(mode==='source-future'){
      addChange(changes,ctx.source,applySetsToWeeks(ctx.source,ctx.source.weeklyPlan,forward,ctx.sets,counter));
    }else if(mode==='below-future'){
      addChange(changes,ctx.source,applySetsToWeeks(ctx.source,ctx.source.weeklyPlan,current,ctx.sets,counter));
      ctx.below.forEach(exercise=>addChange(changes,exercise,applySetsToWeeks(exercise,exercise.weeklyPlan,future,ctx.sets,counter)));
    }else if(mode==='full-forward'){
      addChange(changes,ctx.source,applySetsToWeeks(ctx.source,ctx.source.weeklyPlan,forward,ctx.sets,counter));
      ctx.below.forEach(exercise=>addChange(changes,exercise,applySetsToWeeks(exercise,exercise.weeklyPlan,forward,ctx.sets,counter)));
    }else if(mode==='all-current'){
      addChange(changes,ctx.source,applySetsToWeeks(ctx.source,ctx.source.weeklyPlan,current,ctx.sets,counter));
      all.forEach(exercise=>addChange(changes,exercise,applySetsToWeeks(exercise,exercise.weeklyPlan,current,ctx.sets,counter)));
    }else if(mode==='all-all'){
      const sourcePlan=applySetsToWeeks(ctx.source,ctx.source.weeklyPlan,current,ctx.sets,counter);addChange(changes,ctx.source,sourcePlan);
      const snapshot={...ctx.source,weeklyPlan:sourcePlan};
      all.forEach(exercise=>{
        let next=plan(exercise.weeklyPlan);
        for(let week=1;week<=8;week++){
          if(locked(exercise,week)){counter.protected++;continue;}
          const resolved=typeof resolveWeekPrescription==='function'?resolveWeekPrescription(snapshot,week):{sets:sourcePlan['w'+week]||[]};
          next['w'+week]=cloneSets(resolved?.sets||[]);
        }
        addChange(changes,exercise,next);
      });
    }
    return{changes,protectedCount:counter.protected};
  }
  async function commitSeries(ctx,mode){
    if(running)return false;const{changes,protectedCount}=buildSeriesChanges(ctx,mode);
    if(!changes.size){showToast?.(protectedCount?'🔒 Todos os destinos dessa ação estão protegidos ou já possuem os mesmos valores.':'Nenhuma alteração necessária.',true);return false;}
    if(changes.size>MAX_BATCH_WRITES){alert('Esta operação possui destinos demais para ser concluída com segurança.');return false;}
    const key='lock-aware-propagation-'+String(ctx.source.id||'exercise');if(typeof beginAction==='function'&&!beginAction(key,'modal-prescription'))return false;running=true;
    try{
      if(ctx.target==='trainer'){
        const entries=[...changes.values()];
        for(let start=0;start<entries.length;start+=400){const batch=db.batch();for(const change of entries.slice(start,start+400))batch.update(db.collection('exercises').doc(change.exercise.id),{weeklyPlan:change.next});await cloudWrite(batch.commit(),'repassar prescrição protegida');}
        changes.forEach(change=>{change.exercise.weeklyPlan=clone(change.next);});
      }else{
        changes.forEach(change=>{change.exercise.weeklyPlan=clone(change.next);});
        if(typeof localSave!=='function'||!localSave())throw new Error('Não foi possível salvar a prescrição no aparelho.');
      }
      try{refreshPlanViewsAfterWeeklyTechniqueChange?.(ctx.source,ctx.week);}catch(error){}
      showToast?.(`✓ Prescrição aplicada somente aos destinos destrancados${protectedCount?` · ${protectedCount} semana(s) protegida(s) preservada(s)`:''}`);return true;
    }catch(error){
      if(ctx.target!=='trainer')changes.forEach(change=>{change.exercise.weeklyPlan=clone(change.before);});
      alert(typeof cloudWriteError==='function'?cloudWriteError(error,'repassar a prescrição'):String(error?.message||error));return false;
    }finally{running=false;if(typeof endAction==='function')endAction(key,'modal-prescription');}
  }

  function inferSeriesMode(button){
    const text=String(button?.textContent||'').toUpperCase().replace(/\s+/g,' ').trim();
    if(text.includes('8 SEMANAS')&&text.includes('PLANILHA'))return'all-all';
    if(text.includes('ESTA SEMANA')&&text.includes('TODOS OS EXERCÍCIOS'))return'all-current';
    if(text.includes('REPASSAR ATÉ A SEMANA 8'))return'source-future';
    if(text.includes('TUDO ABAIXO E À FRENTE'))return'full-forward';
    if(text.includes('ABAIXO NAS SEMANAS SEGUINTES'))return'below-future';
    if(text.includes('SOMENTE EXERCÍCIOS ABAIXO'))return'below-current';
    return'';
  }
  function affectedTechniquePairs(ctx,mode){
    const pairs=[];const add=(exercise,list)=>list.forEach(week=>pairs.push([exercise,week]));
    if(mode==='below-current'){add(ctx.source,[ctx.week]);ctx.below.forEach(exercise=>add(exercise,[ctx.week]));}
    else if(mode==='source-future')add(ctx.source,weeks(ctx.week));
    else if(mode==='below-future'){add(ctx.source,[ctx.week]);ctx.below.forEach(exercise=>add(exercise,weeks(ctx.week+1)));}
    else if(mode==='full-forward'){add(ctx.source,weeks(ctx.week));ctx.below.forEach(exercise=>add(exercise,weeks(ctx.week)));}
    return pairs;
  }
  function techniqueMode(button){
    const text=String(button?.textContent||'').toUpperCase().replace(/\s+/g,' ').trim();
    if(text.includes('TUDO ABAIXO E À FRENTE'))return'full-forward';
    if(text.includes('ABAIXO NAS SEMANAS SEGUINTES'))return'below-future';
    if(text.includes('SOMENTE SEMANAS SEGUINTES'))return'source-future';
    if(text.includes('SOMENTE EXERCÍCIOS ABAIXO'))return'below-current';
    return'';
  }
  function subgroupKind(button){
    const subgroup=button?.closest?.('.tb-actions-subgroup');
    const title=String(subgroup?.querySelector?.('.tb-actions-subtitle')?.textContent||'').toUpperCase();
    if(title.includes('SÉRIES')||title.includes('PRESCRIÇÃO')||title.includes('GER'))return'series';
    if(title.includes('TÉCN'))return'technique';
    return'';
  }

  document.addEventListener('click',event=>{
    const button=event.target instanceof Element?event.target.closest(`#${CENTER_ID} button`):null;if(!button)return;
    const ctx=context();if(!ctx||!hasAnyLock(ctx.workout))return;
    const kind=subgroupKind(button);
    if(kind==='series'){
      const mode=inferSeriesMode(button);if(!mode)return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      const run=()=>commitSeries(ctx,mode);
      const message='Existem semanas ou exercícios protegidos. A cópia será aplicada somente aos destinos destrancados; os protegidos permanecerão exatamente como estão. Continuar?';
      if(typeof showConfirm==='function')showConfirm('Repassar preservando trancas',message,run);else if(window.confirm(message))void run();
      return;
    }
    if(kind==='technique'){
      const mode=techniqueMode(button);if(!mode)return;
      const conflicts=affectedTechniquePairs(ctx,mode).filter(([exercise,week])=>locked(exercise,week));if(!conflicts.length)return;
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      const unique=new Set(conflicts.map(([exercise,week])=>String(exercise.id)+':'+week));
      const message=`🔒 Esta propagação de técnicas alcançaria ${unique.size} destino(s) protegido(s). Por segurança, a ação foi bloqueada: técnicas e vínculos de Super set não podem ser aplicados parcialmente em uma área trancada. Destranque os destinos que deseja alterar ou edite as semanas individualmente.`;
      if(typeof showToast==='function')showToast(message,true);else alert(message);
    }
  },true);

  window.TeamBullsPrescriptionLockBridge=Object.freeze({version:VERSION,locked});
})();
