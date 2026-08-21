/* Team Bulls v10.10.10 — auditoria de regressões entre hotfixes recentes. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_USABILITY_AUDIT_V101010__)return;
  window.__TEAM_BULLS_USABILITY_AUDIT_V101010__=true;

  const VERSION='10.10.10-audit1';
  let feedbackSending=false;

  const weekNumber=()=>Math.max(1,Math.min(8,Number(document.getElementById('input-prescription-week')?.value)||1));
  const activeExercise=()=>{try{return typeof getPlanEditExercise==='function'?getPlanEditExercise():null;}catch(error){return null;}};
  const activeWorkout=()=>{try{return PLAN_EDIT_TARGET==='trainer'?VIEW_STUDENT_WORKOUT:getW(PLAN_EDIT_WID);}catch(error){return null;}};
  function lockState(exercise){const raw=exercise?.weeklyEditLocks&&typeof exercise.weeklyEditLocks==='object'?exercise.weeklyEditLocks:{};return{all:raw.all===true,weeks:raw.weeks&&typeof raw.weeks==='object'?raw.weeks:{}};}
  function locked(exercise,week){const state=lockState(exercise);return state.all||state.weeks['w'+Math.max(1,Math.min(8,Number(week)||1))]===true;}
  function cloneSets(sets){return typeof clonePrescriptionSets==='function'?clonePrescriptionSets(sets||[]):JSON.parse(JSON.stringify(sets||[]));}

  function installStyles(){
    if(document.getElementById('tb-usability-audit-style'))return;
    const style=document.createElement('style');style.id='tb-usability-audit-style';style.textContent=`
      /* modal-stack-stability usa pointer-events inline; !important preserva o editor realmente não bloqueante. */
      #modal-feedback.tb-feedback-float{pointer-events:none!important;z-index:2147482500!important;background:transparent!important}
      #modal-feedback.tb-feedback-float .feedback-editor-sheet{pointer-events:auto!important}
      .tb-feedback-window-actions #tb-feedback-open-reports{width:auto;min-width:84px;padding:0 8px;font-size:8px}
      .tb-lock-unsaved-warning{color:#fca5a5}
    `;document.head.appendChild(style);
  }

  function editorHasUnsavedChanges(){
    const exercise=activeExercise(),week=weekNumber();if(!exercise)return false;
    try{if(typeof WEEK_TECHNIQUE_EDITOR_DIRTY!=='undefined'&&WEEK_TECHNIQUE_EDITOR_DIRTY===true)return true;}catch(error){}
    try{
      if(typeof collectPrescriptionRows!=='function'||typeof resolveWeekPrescription!=='function')return false;
      const current=collectPrescriptionRows();if(!Array.isArray(current))return true;
      const saved=cloneSets(resolveWeekPrescription(exercise,week)?.sets||[]);
      return JSON.stringify(cloneSets(current))!==JSON.stringify(saved);
    }catch(error){return true;}
  }
  function guardLockWithUnsavedEditor(event){
    const button=event.target instanceof Element?event.target.closest('#tb-lock-week-btn,#tb-lock-exercise-btn'):null;if(!button)return;
    if(!editorHasUnsavedChanges())return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    if(typeof showToast==='function')showToast('Salve ou descarte as alterações atuais antes de trancar a prescrição.',true);
    else alert('Salve ou descarte as alterações atuais antes de trancar a prescrição.');
  }
  document.addEventListener('click',guardLockWithUnsavedEditor,true);

  // Evita o caso em que "copiar para todos" alterava a cópia local da fonte,
  // mas saía sem gravar quando todos os destinos já estavam iguais/protegidos.
  if(typeof v104CopyPrescriptionToAll==='function'&&!v104CopyPrescriptionToAll.__tbAuditNoopGuard){
    const base=v104CopyPrescriptionToAll;
    const wrapped=async function(copyAllWeeks=false){
      const source=activeExercise(),workout=activeWorkout();if(!source||!workout)return base.apply(this,arguments);
      const targets=(workout.exercises||[]).filter(item=>String(item.id)!==String(source.id));if(!targets.length)return base.apply(this,arguments);
      const week=weekNumber(),sets=typeof v104CurrentPrescriptionSets==='function'?v104CurrentPrescriptionSets():[];if(!Array.isArray(sets)||!sets.length)return base.apply(this,arguments);
      const sourcePlan=typeof normalizeWeeklyPlan==='function'?normalizeWeeklyPlan(source.weeklyPlan):{...(source.weeklyPlan||{})};
      if(!locked(source,week))sourcePlan['w'+week]=cloneSets(sets);
      const sourceSnapshot={...source,weeklyPlan:sourcePlan};
      let destinationChanges=0;
      for(const target of targets){
        const before=typeof normalizeWeeklyPlan==='function'?normalizeWeeklyPlan(target.weeklyPlan):{...(target.weeklyPlan||{})};
        const after=typeof normalizeWeeklyPlan==='function'?normalizeWeeklyPlan(target.weeklyPlan):{...(target.weeklyPlan||{})};
        if(copyAllWeeks){for(let current=1;current<=8;current++)if(!locked(target,current))after['w'+current]=cloneSets(resolveWeekPrescription(sourceSnapshot,current)?.sets||[]);}
        else if(!locked(target,week))after['w'+week]=cloneSets(sets);
        if(JSON.stringify(after)!==JSON.stringify(before))destinationChanges++;
      }
      if(destinationChanges)return base.apply(this,arguments);
      const sourceChanged=JSON.stringify(sourcePlan)!==JSON.stringify(typeof normalizeWeeklyPlan==='function'?normalizeWeeklyPlan(source.weeklyPlan):{...(source.weeklyPlan||{})});
      if(!sourceChanged){showToast?.('Nenhum destino precisava ser alterado; os valores já estavam iguais ou protegidos.',true);return false;}
      if(!beginAction('audit-save-source-prescription','modal-prescription'))return false;
      const previous=source.weeklyPlan;
      try{
        if(PLAN_EDIT_TARGET==='trainer')await cloudWrite(db.collection('exercises').doc(source.id).update({weeklyPlan:sourcePlan}),'salvar prescrição da fonte');
        source.weeklyPlan=sourcePlan;
        if(PLAN_EDIT_TARGET!=='trainer'&&typeof localSave==='function'&&!localSave())throw new Error('Não foi possível salvar no aparelho.');
        if(typeof refreshPlanViewsAfterWeeklyTechniqueChange==='function')refreshPlanViewsAfterWeeklyTechniqueChange(source,week);
        showToast?.('✓ Prescrição do exercício salva; os destinos já estavam iguais ou protegidos.');return true;
      }catch(error){source.weeklyPlan=previous;alert(typeof cloudWriteError==='function'?cloudWriteError(error,'salvar a prescrição'):String(error?.message||error));return false;}
      finally{endAction('audit-save-source-prescription','modal-prescription');}
    };
    wrapped.__tbAuditNoopGuard=true;wrapped.__tbBase=base;v104CopyPrescriptionToAll=wrapped;
  }

  function ensureFeedbackAuditUi(){
    const modal=document.getElementById('modal-feedback');if(!modal)return;
    if(modal.classList.contains('tb-feedback-float'))modal.dataset.tbNonblockingModal='1';
    const actions=modal.querySelector('.tb-feedback-window-actions');if(actions&&!actions.querySelector('#tb-feedback-open-reports')){
      const button=document.createElement('button');button.type='button';button.className='btn-ghost';button.id='tb-feedback-open-reports';button.textContent='▤ RELATÓRIOS';button.title='Abrir relatórios do aluno sem fechar este feedback';
      button.addEventListener('click',()=>{if(typeof openTsQuestionnaires==='function')openTsQuestionnaires();else if(typeof showToast==='function')showToast('Abra a área de relatórios do aluno.',true);});actions.insertBefore(button,actions.firstChild);
    }
  }

  if(typeof openFeedbackModal==='function'&&!openFeedbackModal.__tbAuditDraftGuard){
    const base=openFeedbackModal;
    const wrapped=function(){
      const modal=document.getElementById('modal-feedback'),message=document.getElementById('input-feedback');
      if(modal?.classList.contains('open')&&String(message?.value||'').trim()){
        modal.classList.remove('tb-feedback-minimized');ensureFeedbackAuditUi();message?.focus?.({preventScroll:true});showToast?.('Você já tem um feedback em edição. Envie ou feche esse rascunho antes de iniciar outro.',true);return false;
      }
      const result=base.apply(this,arguments);queueMicrotask(ensureFeedbackAuditUi);return result;
    };
    wrapped.__tbAuditDraftGuard=true;wrapped.__tbBase=base;openFeedbackModal=wrapped;
  }

  if(typeof sendFeedback==='function'&&!sendFeedback.__tbAuditCloseGuard){
    const base=sendFeedback;
    const wrapped=async function(){feedbackSending=true;try{return await base.apply(this,arguments);}finally{feedbackSending=false;}};
    wrapped.__tbAuditCloseGuard=true;wrapped.__tbBase=base;sendFeedback=wrapped;
  }
  if(typeof closeModal==='function'&&!closeModal.__tbAuditFeedbackDiscard){
    const base=closeModal;
    const wrapped=function(id){
      if(id==='modal-feedback'&&!feedbackSending){
        const modal=document.getElementById('modal-feedback'),message=document.getElementById('input-feedback');
        if(modal?.classList.contains('open')&&String(message?.value||'').trim()){
          const discard=window.confirm('Descartar o feedback que está sendo escrito?');if(!discard)return false;
        }
      }
      return base.apply(this,arguments);
    };
    wrapped.__tbAuditFeedbackDiscard=true;wrapped.__tbBase=base;closeModal=wrapped;
  }

  // O guard antigo escolhia o modal pelo DOM, não pela ordem real de abertura.
  // Interceptar no window/capture garante que ESC feche primeiro o relatório/foto
  // e preserve o feedback flutuante que está sendo escrito.
  function modalOpenSequence(modal){return Number(modal?.dataset?.tbModalOpenSeq)||0;}
  function escapeTopModal(event){
    if(event.key!=='Escape'||event.repeat)return;
    const open=[...document.querySelectorAll('.modal-backdrop.open')];if(!open.length)return;
    const blocking=open.filter(modal=>modal.dataset.tbNonblockingModal!=='1');
    const pool=blocking.length?blocking:open;
    const top=pool.slice().sort((a,b)=>modalOpenSequence(a)-modalOpenSequence(b)||Number.parseInt(getComputedStyle(a).zIndex||'0',10)-Number.parseInt(getComputedStyle(b).zIndex||'0',10)).at(-1);if(!top)return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    try{if(typeof ACTION_LOCKS!=='undefined'&&ACTION_LOCKS?.size){showToast?.('Aguarde a operação terminar para fechar.',true);return;}}catch(error){}
    if(top.id&&typeof closeModal==='function')closeModal(top.id);else top.classList.remove('open');
  }
  window.addEventListener('keydown',escapeTopModal,{capture:true});

  // O cleanup de object URLs do check-up anterior é correto em unload normal,
  // mas em retorno via BFCache alguns registros ainda guardavam URLs blob revogadas.
  function repairMediaAfterPageRestore(){
    const buckets=[];try{if(Array.isArray(PHOTOS_CACHE))buckets.push(PHOTOS_CACHE);}catch(error){}try{if(Array.isArray(FREE_MEAL_LOGS))buckets.push(FREE_MEAL_LOGS);}catch(error){}
    for(const bucket of buckets)for(const record of bucket){for(const field of ['_photoSrc','_photoThumbSrc'])if(String(record?.[field]||'').startsWith('blob:'))delete record[field];}
    document.querySelectorAll('img[data-photo-record][src^="blob:"]').forEach(img=>{img.removeAttribute('src');delete img.dataset.loaded;});
    try{if(typeof hydrateSecureImages==='function')hydrateSecureImages(document);}catch(error){}
  }
  window.addEventListener('pageshow',repairMediaAfterPageRestore,{passive:true});

  installStyles();queueMicrotask(ensureFeedbackAuditUi);
  window.TeamBullsUsabilityAudit=Object.freeze({version:VERSION,repairMedia:repairMediaAfterPageRestore});
})();
