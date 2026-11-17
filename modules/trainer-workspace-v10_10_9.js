/* Team Bulls v10.10.9 — atalhos de prescrição, relatórios rápidos e rascunho privado do treinador. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_TRAINER_WORKSPACE_V10109__)return;
  window.__TEAM_BULLS_TRAINER_WORKSPACE_V10109__=true;

  const PRESCRIPTION_SCREENS=new Set([
    'screen-ts-workout','screen-ts-day','screen-ts-exercise',
    'screen-ts-meals','screen-ts-diet-detail'
  ]);
  const NOTE_MAX=5000;
  const REPORT_CACHE_TTL=45000;
  const REPORT_CACHE_MAX_STUDENTS=12;
  const reportCache=new Map();
  const observedModals=new WeakSet();
  let reportLoadToken=0;
  let reportViewerTransition=false;
  let dockSyncFrame=0;
  let workspaceActor=null;

  function trainerStudent(){
    if(typeof CURRENT_USER==='undefined'||CURRENT_USER?.role!=='trainer')return null;
    if(typeof VIEW_STUDENT==='undefined'||!VIEW_STUDENT?.uid)return null;
    return VIEW_STUDENT;
  }
  function activeScreenId(){return document.querySelector('.screen.active')?.id||'';}
  function studentName(){return String(trainerStudent()?.name||'Aluno').trim()||'Aluno';}
  function anyOpenModal(){return !!document.querySelector('.modal-backdrop.open');}
  function safe(value){return typeof esc==='function'?esc(value):String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
  function dateLabel(value){
    try{
      if(!value)return'—';
      if(typeof value==='string')return typeof fmt==='function'?fmt(value):value;
      const date=typeof value.toDate==='function'?value.toDate():value?.seconds?new Date(value.seconds*1000):null;
      return date instanceof Date&&!Number.isNaN(date.getTime())?date.toLocaleDateString('pt-BR'):'—';
    }catch(error){return'—';}
  }


  const REFERENCE_MODALS=new Set(['tb-trainer-reports-modal','tb-trainer-note-modal','modal-weekly-checkin-view','modal-view-quest','modal-photo-view','modal-compare-photos','tb-trainer-previous-workout-modal']);
  const EDITOR_MODALS=new Set(['modal-exercise','modal-prescription','modal-day','modal-workout','modal-meal','modal-diet','modal-diet-variant']);
  function wideWorkspace(){return !!trainerStudent()&&window.matchMedia('(min-width:1200px) and (pointer:fine)').matches;}
  function syncWorkspaceLayout(){
    const actor=typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role==='trainer'?CURRENT_USER.uid:'';
    if(workspaceActor===null&&actor)workspaceActor=actor;
    if(workspaceActor!==actor){
      workspaceActor=actor;reportCache.clear();reportLoadToken++;
      for(const id of REFERENCE_MODALS){
        const modal=document.getElementById(id);
        if(modal?.classList.contains('open'))(window.__TB_HISTORY_BASE_CLOSE__||window.closeModal)?.(id);
        if(modal)delete modal.dataset.tbWorkspaceStudentUid;
      }
      const text=document.getElementById('tb-private-note-text');
      if(text){text.value='';text.dataset.loaded='0';text.dataset.dirty='0';delete text.dataset.trainerUid;delete text.dataset.studentUid;}
    }
    const wide=wideWorkspace(),student=trainerStudent(),open=[...document.querySelectorAll('.modal-backdrop.open')];
    const blocked=open.some(modal=>!REFERENCE_MODALS.has(modal.id)&&!EDITOR_MODALS.has(modal.id));
    let hasReference=false,hasNote=false;
    for(const modal of document.querySelectorAll('.modal-backdrop')){
      const reference=REFERENCE_MODALS.has(modal.id),editor=EDITOR_MODALS.has(modal.id);
      if(reference&&modal.classList.contains('open')&&!modal.dataset.tbWorkspaceStudentUid)modal.dataset.tbWorkspaceStudentUid=student?.uid||'';
      const owned=modal.dataset.tbWorkspaceStudentUid===student?.uid;
      const pane=wide&&reference&&owned;
      modal.classList.toggle('tb-workspace-pane',pane);
      modal.classList.toggle('tb-workspace-editor',wide&&editor);
      if(reference){
        modal.dataset.tbBackdropClose='block';modal.dataset.tbWorkspacePersistent='1';
        const sheet=modal.querySelector('.modal-sheet');
        if(sheet&&!sheet.querySelector('.tb-workspace-close')){
          const button=document.createElement('button');button.type='button';button.className='tb-workspace-close';
          button.textContent='FECHAR';button.setAttribute('aria-label','Fechar esta janela');
          button.onclick=event=>{event.stopPropagation();closeModal(modal.id);};sheet.prepend(button);
        }
      }
      if(modal.classList.contains('open')&&(reference||editor))modal.setAttribute('aria-modal',pane||wide&&editor?'false':'true');
      if(modal.classList.contains('open')&&reference&&owned){
        if(modal.id==='tb-trainer-note-modal')hasNote=true;else hasReference=true;
      }
    }
    document.body.classList.toggle('tb-workspace-wide',wide);
    document.body.classList.toggle('tb-workspace-has-reference',wide&&hasReference);
    document.body.classList.toggle('tb-workspace-has-note',wide&&hasNote);
    document.body.classList.toggle('tb-workspace-blocked',blocked);
  }

  function ensureStyles(){
    if(document.getElementById('tb-trainer-workspace-style'))return;
    const style=document.createElement('style');style.id='tb-trainer-workspace-style';style.textContent=`
      .tb-trainer-tools{position:fixed;right:14px;bottom:18px;z-index:4200;display:none;gap:8px;align-items:center;padding:7px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(12,12,12,.94);box-shadow:0 12px 36px rgba(0,0,0,.45);backdrop-filter:blur(10px)}
      .tb-trainer-tools.visible{display:flex}.tb-trainer-tool{min-height:40px;border:1px solid rgba(198,61,61,.42);border-radius:10px;background:#211313;color:#fff;padding:0 11px;font:800 10px/1 'DM Mono',monospace;letter-spacing:.04em;cursor:pointer;white-space:nowrap}.tb-trainer-tool.secondary{background:#171717;border-color:rgba(255,255,255,.14)}
      .tb-workspace-sheet{max-width:720px}.tb-workspace-title-sub{margin:-5px 0 14px;color:#888;font:500 10px/1.4 'DM Mono',monospace}.tb-workspace-list{display:grid;gap:8px;max-height:min(58vh,560px);overflow:auto;padding-right:3px}.tb-workspace-section{margin:13px 0 7px;color:#aaa;font:800 10px/1.2 'DM Mono',monospace;letter-spacing:.07em}.tb-workspace-report{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;border:1px solid rgba(255,255,255,.09);border-radius:11px;background:#171717;color:#eee;padding:11px 12px}.tb-workspace-report[disabled]{opacity:.55}.tb-workspace-report strong{display:block;font-size:12px}.tb-workspace-report small{display:block;margin-top:4px;color:#888;font:500 9px/1.35 'DM Mono',monospace}.tb-workspace-status{flex:0 0 auto;color:#c7c7c7;font:800 9px/1 'DM Mono',monospace}.tb-workspace-empty{padding:16px;border:1px dashed rgba(255,255,255,.12);border-radius:10px;color:#777;font:500 10px/1.5 'DM Mono',monospace}.tb-private-note{width:100%;min-height:250px;resize:vertical}.tb-private-note-hint{margin:8px 0 14px;color:#777;font:500 9px/1.45 'DM Mono',monospace}.tb-note-status{min-height:18px;margin-top:8px;color:#888;font:600 9px/1.35 'DM Mono',monospace}

      .tb-workspace-close{display:none}
      @media(min-width:1200px) and (pointer:fine){
        .tb-workspace-wide .tb-workspace-close{display:block;position:sticky;top:0;float:right;z-index:2;min-height:32px;margin:0 0 6px 8px;padding:6px 10px;border:1px solid var(--border-l);border-radius:6px;background:var(--surface);color:var(--text);font:700 10px 'DM Mono',monospace;cursor:pointer}
        body.tb-workspace-wide{--tb-reference-width:clamp(340px,34vw,560px);--tb-note-height:min(38vh,330px)}
        .tb-workspace-wide .modal-backdrop.tb-workspace-pane{left:auto;right:14px;top:14px;bottom:auto;width:var(--tb-reference-width);height:calc(100dvh - 94px);max-height:none;background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;align-items:stretch;pointer-events:auto!important}
        .tb-workspace-wide .tb-workspace-pane>.modal-sheet{height:100%;max-height:100%;max-width:100%;width:100%;border-radius:14px;padding:16px;box-shadow:0 12px 32px #0008;animation:none}
        .tb-workspace-wide.tb-workspace-has-note .tb-workspace-pane:not(#tb-trainer-note-modal){height:calc(100dvh - 110px - var(--tb-note-height))}
        .tb-workspace-wide #tb-trainer-note-modal.tb-workspace-pane{top:auto;bottom:80px;height:var(--tb-note-height)}
        .tb-workspace-wide .tb-workspace-pane .tb-private-note{min-height:100px;height:120px;resize:vertical}
        .tb-workspace-wide .tb-workspace-pane .tb-workspace-list{max-height:none}
        .tb-workspace-wide .tb-workspace-pane #photo-view-img{max-height:calc(100% - 130px);object-fit:contain}
        .tb-workspace-wide:is(.tb-workspace-has-reference,.tb-workspace-has-note) .modal-backdrop.tb-workspace-editor{left:14px;right:calc(var(--tb-reference-width) + 28px);top:14px;bottom:auto;width:auto;max-width:none;height:calc(100dvh - 94px);background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;align-items:stretch;pointer-events:none!important}
        .tb-workspace-wide:is(.tb-workspace-has-reference,.tb-workspace-has-note) .tb-workspace-editor>.modal-sheet{max-width:760px;max-height:100%;height:100%;margin-left:auto;pointer-events:auto!important;border-radius:14px;animation:none}
        .tb-workspace-wide.tb-workspace-blocked .tb-workspace-pane{pointer-events:none!important}
        .tb-workspace-wide.tb-workspace-blocked .tb-workspace-editor>.modal-sheet{pointer-events:none!important}
      }

      @media(max-width:899px){.tb-trainer-tools{right:10px;bottom:74px;left:10px;justify-content:center}.tb-trainer-tool{flex:1;padding:0 7px}.tb-workspace-sheet{max-height:88vh}.tb-workspace-list{max-height:52vh}}
    `;document.head.appendChild(style);
  }

  function ensureDock(){
    ensureStyles();let dock=document.getElementById('tb-trainer-tools');if(dock)return dock;
    dock=document.createElement('div');dock.id='tb-trainer-tools';dock.className='tb-trainer-tools';dock.setAttribute('aria-label','Ferramentas privadas do treinador');
    dock.innerHTML='<button type="button" class="tb-trainer-tool" id="tb-open-student-reports">📋 RELATÓRIOS / FOTOS</button><button type="button" class="tb-trainer-tool secondary" id="tb-open-private-note">✎ RASCUNHO</button><button type="button" class="tb-trainer-tool secondary" id="tb-open-previous-workout">TREINO ANTERIOR</button>';
    document.body.appendChild(dock);
    dock.querySelector('#tb-open-student-reports').addEventListener('click',openQuickReports);
    dock.querySelector('#tb-open-private-note').addEventListener('click',openPrivateNote);
    dock.querySelector('#tb-open-previous-workout').addEventListener('click',openPreviousWorkout);
    return dock;
  }
  function syncDock(){
    const dock=ensureDock(),student=trainerStudent();syncWorkspaceLayout();
    const visible=!!student&&PRESCRIPTION_SCREENS.has(activeScreenId())&&!reportViewerTransition&&(!anyOpenModal()||wideWorkspace()&&!document.body.classList.contains('tb-workspace-blocked'));
    dock.classList.toggle('visible',visible);
    if(visible){
      const previous=dock.querySelector('#tb-open-previous-workout');
      previous.hidden=typeof VIEW_STUDENT_WORKOUT==='undefined'||!VIEW_STUDENT_WORKOUT||!(student.workouts||[]).some(workout=>workout.id===VIEW_STUDENT_WORKOUT.id);
      dock.querySelector('#tb-open-private-note').title='Rascunho privado de '+studentName();dock.querySelector('#tb-open-student-reports').title='Relatórios e fotos de '+studentName();}
  }
  function scheduleDockSync(){
    if(dockSyncFrame)cancelAnimationFrame(dockSyncFrame);
    dockSyncFrame=requestAnimationFrame(()=>{dockSyncFrame=0;syncDock();});
  }

  function ensureReportsModal(){
    let modal=document.getElementById('tb-trainer-reports-modal');if(modal)return modal;
    modal=document.createElement('div');modal.id='tb-trainer-reports-modal';modal.className='modal-backdrop';modal.dataset.tbBackdropClose='allow';modal.innerHTML=`<div class="modal-sheet tb-workspace-sheet"><div class="modal-handle"></div><div class="modal-title" id="tb-trainer-reports-title">Relatórios e fotos</div><div class="tb-workspace-title-sub" id="tb-trainer-reports-sub"></div><div id="tb-trainer-reports-content" class="tb-workspace-list"></div><button type="button" class="btn-ghost" id="tb-trainer-reports-refresh">ATUALIZAR</button><button type="button" class="btn-ghost" onclick="closeModal('tb-trainer-reports-modal')">FECHAR</button></div>`;
    document.body.appendChild(modal);modal.querySelector('#tb-trainer-reports-refresh').addEventListener('click',()=>loadQuickReports(true));return modal;
  }
  function questionnaireLabel(q){
    try{if(typeof v109ReportModeLabel==='function'&&typeof v109ReportMode==='function')return v109ReportModeLabel(v109ReportMode(q));}catch(error){}
    return q?.reportType==='photo-only'?'Somente fotos':q?.reportType==='written-only'?'Relatório escrito':'Relatório solicitado';
  }
  function syncReportViewerCaches(weekly,questionnaires){
    const safeWeekly=Array.isArray(weekly)?weekly:[],safeQuestionnaires=Array.isArray(questionnaires)?questionnaires:[];
    try{if(typeof WEEKLY_CHECKINS!=='undefined')WEEKLY_CHECKINS=safeWeekly;}catch(error){console.warn('[Team Bulls] Não foi possível sincronizar relatórios semanais do visualizador.',error);}
    try{if(typeof TS_QUEST_CACHE!=='undefined')TS_QUEST_CACHE=safeQuestionnaires;}catch(error){console.warn('[Team Bulls] Não foi possível sincronizar relatórios solicitados do visualizador.',error);}
  }
  function reportViewerIsOpen(id){return !!document.getElementById(String(id||''))?.classList.contains('open');}
  function reportViewerError(error){
    console.error('[Team Bulls] Falha ao abrir relatório rápido',error);
    if(typeof showToast==='function')showToast('Não foi possível abrir o relatório. Tente novamente.',true);
  }
  async function openExistingReport(viewer,targetModalId){
    if(typeof viewer!=='function'||!targetModalId)return false;
    reportViewerTransition=true;syncDock();
    let result;
    try{
      result=viewer();
      await Promise.resolve();
      if(!reportViewerIsOpen(targetModalId))await Promise.resolve(result);
      else if(result&&typeof result.then==='function')result.catch(error=>console.error('[Team Bulls] Falha ao carregar conteúdo do relatório',error));
      if(!reportViewerIsOpen(targetModalId))throw new Error('Visualizador não abriu: '+targetModalId);
      return true;
    }catch(error){reportViewerError(error);return false;}
    finally{requestAnimationFrame(()=>{reportViewerTransition=false;syncDock();});}
  }
  function renderQuickReports(weekly,questionnaires){
    const host=document.getElementById('tb-trainer-reports-content');if(!host)return;
    weekly=Array.isArray(weekly)?weekly:[];questionnaires=Array.isArray(questionnaires)?questionnaires:[];
    syncReportViewerCaches(weekly,questionnaires);
    const parts=[];
    parts.push('<div class="tb-workspace-section">RELATÓRIOS SEMANAIS</div>');
    if(weekly.length)parts.push(...weekly.slice(0,12).map(item=>{const photos=Array.isArray(item.photoIds)?item.photoIds.length:6;return`<button type="button" class="tb-workspace-report" data-tb-weekly="${safe(item.id)}"><span><strong>${safe(item.requestKind==='manual'?'Relatório extra':'Relatório semanal')}</strong><small>${safe(dateLabel(item.submittedDate||item.dueDate))} · ${Number(item.weight||0)>0?safe(Number(item.weight).toLocaleString('pt-BR',{maximumFractionDigits:1}))+' kg · ':''}${photos} foto(s)</small></span><span class="tb-workspace-status">ABRIR ›</span></button>`;}));
    else parts.push('<div class="tb-workspace-empty">Nenhum relatório semanal enviado por este aluno.</div>');
    parts.push('<div class="tb-workspace-section">RELATÓRIOS SOLICITADOS</div>');
    if(questionnaires.length)parts.push(...questionnaires.slice(0,12).map(q=>{const answered=!!q.answered,photos=Array.isArray(q.photoIds)?q.photoIds.length:0;return`<button type="button" class="tb-workspace-report" data-tb-questionnaire="${safe(q.id)}" ${answered?'':'disabled'}><span><strong>${safe(questionnaireLabel(q))}</strong><small>${safe(dateLabel(q.answeredAt||q.createdAt))}${answered?` · ${photos} foto(s)`:' · aguardando aluno'}</small></span><span class="tb-workspace-status">${answered?'ABRIR ›':'PENDENTE'}</span></button>`;}));
    else parts.push('<div class="tb-workspace-empty">Nenhuma solicitação de relatório encontrada.</div>');
    host.innerHTML=parts.join('');
    host.querySelectorAll('[data-tb-weekly]').forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.tbWeekly;if(typeof viewWeeklyCheckin==='function')openExistingReport(()=>viewWeeklyCheckin(id),'modal-weekly-checkin-view');}));
    host.querySelectorAll('[data-tb-questionnaire]').forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.tbQuestionnaire;if(typeof viewQuestionnaire==='function')openExistingReport(()=>viewQuestionnaire(id,true),'modal-view-quest');}));
  }
  function cachedReports(studentUid){
    const entry=reportCache.get(String(studentUid||''));
    if(!entry||Date.now()-entry.savedAt>REPORT_CACHE_TTL)return null;
    return entry;
  }
  function storeReports(studentUid,weekly,questionnaires){
    const key=String(studentUid||'');if(!key)return;
    reportCache.delete(key);
    reportCache.set(key,{savedAt:Date.now(),weekly,questionnaires});
    while(reportCache.size>REPORT_CACHE_MAX_STUDENTS)reportCache.delete(reportCache.keys().next().value);
  }
  async function loadQuickReports(force=false){
    const student=trainerStudent(),host=document.getElementById('tb-trainer-reports-content');if(!student||!host)return;
    if(!force){const cached=cachedReports(student.uid);if(cached){renderQuickReports(cached.weekly,cached.questionnaires);return;}}
    const token=++reportLoadToken;host.innerHTML='<div class="tb-workspace-empty">Carregando relatórios e referências fotográficas…</div>';
    try{
      const weeklyPromise=typeof fetchWeeklyCheckins==='function'?fetchWeeklyCheckins(student.uid):cloudGet(db.collection('weeklyCheckins').where('studentId','==',student.uid),'relatórios semanais rápidos').then(s=>s.docs.map(d=>({...d.data(),id:d.id})));
      const questionnairePromise=cloudGet(db.collection('questionnaires').where('studentId','==',student.uid),'relatórios rápidos').then(s=>s.docs.map(d=>({...d.data(),id:d.id})));
      const [weeklyRaw,questionnairesRaw]=await Promise.all([weeklyPromise,questionnairePromise]);if(token!==reportLoadToken||trainerStudent()?.uid!==student.uid)return;
      const weekly=(Array.isArray(weeklyRaw)?weeklyRaw:[]).sort((a,b)=>String(b.submittedDate||b.dueDate||'').localeCompare(String(a.submittedDate||a.dueDate||'')));
      const questionnaires=(Array.isArray(questionnairesRaw)?questionnairesRaw:[]).sort((a,b)=>(b.answeredAt?.seconds||b.createdAt?.seconds||0)-(a.answeredAt?.seconds||a.createdAt?.seconds||0));
      storeReports(student.uid,weekly,questionnaires);
      renderQuickReports(weekly,questionnaires);
    }catch(error){if(token!==reportLoadToken)return;host.innerHTML='<div class="tb-workspace-empty">Não foi possível carregar os relatórios agora. Verifique a conexão e tente novamente.</div>';}
  }
  function raiseReference(id){
    const modal=document.getElementById(id);if(!modal?.classList.contains('open'))return;
    const latest=Math.max(0,...[...document.querySelectorAll('.modal-backdrop.open')].map(item=>Number(item.dataset.tbModalOpenSeq)||0));
    modal.dataset.tbModalOpenSeq=String(latest+1);
    window.TeamBullsModalStackStability?.refresh?.();
  }
  function openQuickReports(){
    const student=trainerStudent();if(!student)return;ensureReportsModal();document.getElementById('tb-trainer-reports-title').textContent='Relatórios e fotos';document.getElementById('tb-trainer-reports-sub').textContent=studentName()+' · consulta rápida sem sair da prescrição';openModal('tb-trainer-reports-modal');raiseReference('tb-trainer-reports-modal');syncDock();loadQuickReports(false);
  }


  let previousWorkoutContext=null;
  function previousWorkoutOptions(){
    const student=trainerStudent(),current=typeof VIEW_STUDENT_WORKOUT!=='undefined'?VIEW_STUDENT_WORKOUT:null;
    if(!student||!current||!(student.workouts||[]).some(workout=>workout.id===current.id))return[];
    return(student.workouts||[]).filter(workout=>workout.id!==current.id&&(!current.startDate||!workout.startDate||workout.startDate<=current.startDate))
      .slice().sort((a,b)=>String(b.startDate||'').localeCompare(String(a.startDate||''))||(Number(b.createdAt?.seconds)||0)-(Number(a.createdAt?.seconds)||0));
  }
  function renderPreviousWorkout(){
    const context=previousWorkoutContext,student=trainerStudent();
    if(!context||!student||context.studentUid!==student.uid||context.trainerUid!==CURRENT_USER.uid)return false;
    const select=document.getElementById('tb-previous-workout-select'),week=Number(document.getElementById('tb-previous-workout-week')?.value)||1;
    const workout=(student.workouts||[]).find(item=>String(item.id)===String(select.value));
    const host=document.getElementById('tb-previous-workout-content');
    if(!workout){host.innerHTML='<div class="tb-workspace-empty">Este aluno ainda não tem outro protocolo anterior salvo.</div>';return false;}
    const days=getWorkoutDays(workout);
    host.innerHTML='<div class="plan-help form-group">'+safe(workout.name)+' · início '+safe(dateLabel(workout.startDate))+' · atualização '+safe(dateLabel(workout.updateDate))+'</div>'+
      days.map(day=>'<section class="form-group"><h3 class="modal-title">'+safe(day.name)+'</h3>'+exercisesForDay(workout,day.name).map(exercise=>{
        const summary=prescriptionCompactSummary(exercise,week),techniques=resolveWeekTechniqueConfig(exercise,week).techniqueIds;
        const names=techniques.map(id=>TECHNIQUE_CATALOG.items.find(item=>item.id===id)).filter(Boolean).map(item=>item.code+' · '+item.name);
        return'<article class="tb-workspace-empty"><strong>'+safe(exercise.name)+'</strong><p>'+safe(summary.reps)+(summary.ger?' · '+safe(summary.ger):'')+'</p>'+
          (names.length?'<p>'+safe(names.join(' / '))+'</p>':'')+
          (exercise.instructions?'<p>'+safe(exercise.instructions).replace(/\n/g,'<br>')+'</p>':'')+'</article>';
      }).join('')+'</section>').join('');
    return true;
  }
  function openPreviousWorkout(){
    const student=trainerStudent();if(!student||typeof VIEW_STUDENT_WORKOUT==='undefined'||!VIEW_STUDENT_WORKOUT||!(student.workouts||[]).some(workout=>workout.id===VIEW_STUDENT_WORKOUT.id))return false;
    previousWorkoutContext={studentUid:student.uid,trainerUid:CURRENT_USER.uid};
    let modal=document.getElementById('tb-trainer-previous-workout-modal');
    if(!modal){
      modal=document.createElement('div');modal.id='tb-trainer-previous-workout-modal';modal.className='modal-backdrop';
      modal.innerHTML='<div class="modal-sheet tb-workspace-sheet"><div class="modal-handle"></div><div class="modal-title">Treino anterior</div><div class="tb-workspace-title-sub" id="tb-previous-workout-student"></div><div class="form-group"><label class="form-label" for="tb-previous-workout-select">Protocolo para consultar</label><select class="form-input" id="tb-previous-workout-select"></select></div><div class="form-group"><label class="form-label" for="tb-previous-workout-week">Semana da prescrição</label><select class="form-input" id="tb-previous-workout-week"></select></div><div id="tb-previous-workout-content"></div><button type="button" class="btn-ghost" onclick="closeModal(\'tb-trainer-previous-workout-modal\')">FECHAR</button></div>';
      document.body.appendChild(modal);
      modal.querySelector('#tb-previous-workout-select').addEventListener('change',renderPreviousWorkout);
      const weeks=modal.querySelector('#tb-previous-workout-week');
      for(let week=1;week<=8;week++){const option=document.createElement('option');option.value=String(week);option.textContent='Semana '+week;weeks.appendChild(option);}
      weeks.addEventListener('change',renderPreviousWorkout);
    }
    document.getElementById('tb-previous-workout-student').textContent=studentName()+' · comparação com '+VIEW_STUDENT_WORKOUT.name;
    const select=document.getElementById('tb-previous-workout-select');select.replaceChildren();
    for(const workout of previousWorkoutOptions()){
      const option=document.createElement('option');option.value=String(workout.id);option.textContent=workout.name+(workout.startDate?' · '+dateLabel(workout.startDate):'');select.appendChild(option);
    }
    document.getElementById('tb-previous-workout-week').value='1';
    renderPreviousWorkout();openModal(modal.id);raiseReference(modal.id);syncDock();return true;
  }

  function ensureNoteModal(){
    let modal=document.getElementById('tb-trainer-note-modal');if(modal)return modal;
    modal=document.createElement('div');modal.id='tb-trainer-note-modal';modal.className='modal-backdrop';modal.dataset.tbBackdropClose='block';modal.innerHTML=`<div class="modal-sheet tb-workspace-sheet"><div class="modal-handle"></div><div class="modal-title">Rascunho privado</div><div class="tb-workspace-title-sub" id="tb-private-note-student"></div><textarea id="tb-private-note-text" class="form-input tb-private-note" maxlength="${NOTE_MAX}" rows="10" placeholder="Ex.: pontos observados nas fotos, ajustes para próximo treino, estratégia da dieta, lembretes para a próxima revisão…"></textarea><div class="tb-private-note-hint">Somente sua conta de treinador pode acessar este rascunho. O aluno não recebe nem consegue consultar este conteúdo.</div><button type="button" class="btn-primary" id="tb-private-note-save">SALVAR RASCUNHO</button><button type="button" class="btn-ghost" onclick="closeModal('tb-trainer-note-modal')">FECHAR</button><div class="tb-note-status" id="tb-private-note-status"></div></div>`;
    document.body.appendChild(modal);modal.querySelector('#tb-private-note-save').addEventListener('click',savePrivateNote);return modal;
  }
  function trainerPrivateRef(){const user=typeof CURRENT_USER!=='undefined'?CURRENT_USER:null;if(user?.role!=='trainer'||!db)return null;return db.collection('trainerSupplementCatalog').doc(user.uid);}
  async function readPrivateNote(studentUid){
    const ref=trainerPrivateRef();if(!ref)return'';const snap=await cloudGet(ref,'rascunho privado do treinador');if(!snap.exists)return'';const data=snap.data()||{},entry=data.studentNotes&&typeof data.studentNotes==='object'?data.studentNotes[studentUid]:null;return String(typeof entry==='string'?entry:entry?.text||'').slice(0,NOTE_MAX);
  }
  async function openPrivateNote(){
    const student=trainerStudent();if(!student)return;ensureNoteModal();const text=document.getElementById('tb-private-note-text'),status=document.getElementById('tb-private-note-status');if(text.dataset.trainerUid===CURRENT_USER.uid&&text.dataset.studentUid===student.uid&&(text.dataset.loaded==='1'||text.dataset.dirty==='1')){openModal('tb-trainer-note-modal');raiseReference('tb-trainer-note-modal');syncDock();return;}const actor=CURRENT_USER.uid;document.getElementById('tb-private-note-student').textContent=studentName()+' · rascunho individual deste aluno';text.value='';text.dataset.trainerUid=actor;text.dataset.studentUid=student.uid;text.dataset.loaded='0';text.dataset.dirty='0';text.oninput=()=>{text.dataset.dirty='1';};status.textContent='Carregando…';openModal('tb-trainer-note-modal');raiseReference('tb-trainer-note-modal');syncDock();
    try{const value=await readPrivateNote(student.uid);if(text.dataset.studentUid!==student.uid||trainerStudent()?.uid!==student.uid||CURRENT_USER?.uid!==actor)return;text.dataset.loaded='1';if(text.dataset.dirty!=='1')text.value=value;status.textContent=value?'Rascunho carregado.':'Nenhuma anotação salva ainda.';}catch(error){status.textContent='Não foi possível carregar agora.';}
  }
  async function savePrivateNote(){
    const student=trainerStudent(),text=document.getElementById('tb-private-note-text'),status=document.getElementById('tb-private-note-status'),ref=trainerPrivateRef();if(!student||!text||!ref)return;const actor=CURRENT_USER.uid,targetUid=String(text.dataset.studentUid||'');if(targetUid!==student.uid||text.dataset.trainerUid!==actor){status.textContent='O aluno ativo mudou. Feche e abra o rascunho novamente.';return;}const value=String(text.value||'').normalize('NFKC').trim().slice(0,NOTE_MAX);
    if(typeof beginAction==='function'&&!beginAction('trainer-private-note','tb-trainer-note-modal'))return;status.textContent='Salvando…';
    try{
      const snap=await cloudGet(ref,'verificar rascunhos privados'),now=new Date().toISOString();
      if(CURRENT_USER?.uid!==actor||trainerStudent()?.uid!==targetUid||text.dataset.trainerUid!==actor)return;
      if(snap.exists){const data=snap.data()||{},notes=data.studentNotes&&typeof data.studentNotes==='object'?{...data.studentNotes}:{},previous=notes[targetUid]&&typeof notes[targetUid]==='object'?notes[targetUid]:{};notes[targetUid]={...previous,text:value,updatedAt:now};await cloudWrite(ref.set({trainerId:CURRENT_USER.uid,studentNotes:notes,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}),'salvar rascunho privado');}
      else{await cloudWrite(ref.set({trainerId:CURRENT_USER.uid,items:[],studentNotes:{[targetUid]:{text:value,updatedAt:now}},updatedAt:firebase.firestore.FieldValue.serverTimestamp()}),'criar rascunho privado');}
      status.textContent='✓ Rascunho salvo. Apenas você pode acessá-lo.';if(typeof showToast==='function')showToast('✓ Rascunho privado salvo');
    }catch(error){status.textContent=typeof cloudWriteError==='function'?cloudWriteError(error,'salvar o rascunho'):'Não foi possível salvar o rascunho.';}
    finally{if(typeof endAction==='function')endAction('trainer-private-note','tb-trainer-note-modal');}
  }

  function wrapUiFunction(name){
    const base=window[name];if(typeof base!=='function'||base.__tbTrainerWorkspace)return;
    const wrapped=function(){
      if(name==='openModal'){
        const modal=document.getElementById(String(arguments[0]||''));
        if(modal&&REFERENCE_MODALS.has(modal.id)&&!modal.classList.contains('open'))modal.dataset.tbWorkspaceStudentUid=trainerStudent()?.uid||'';
      }
      const result=base.apply(this,arguments);scheduleDockSync();return result;
    };
    wrapped.__tbTrainerWorkspace=true;window[name]=wrapped;
  }
  function observeModal(modal){
    if(!(modal instanceof HTMLElement)||!modal.classList.contains('modal-backdrop')||observedModals.has(modal))return;
    observedModals.add(modal);
    const observer=new MutationObserver(scheduleDockSync);
    observer.observe(modal,{attributes:true,attributeFilter:['class']});
  }
  function bindModalObservers(root=document){
    if(root instanceof HTMLElement&&root.classList.contains('modal-backdrop'))observeModal(root);
    root.querySelectorAll?.('.modal-backdrop').forEach(observeModal);
  }
  function watchModalState(){
    bindModalObservers(document);
    const additionsObserver=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node instanceof HTMLElement)bindModalObservers(node);}))); 
    additionsObserver.observe(document.body,{subtree:true,childList:true});
  }
  function install(){ensureStyles();ensureDock();ensureReportsModal();ensureNoteModal();['showScreen','openModal','closeModal'].forEach(wrapUiFunction);watchModalState();syncDock();window.addEventListener('pageshow',scheduleDockSync,{passive:true});window.addEventListener('resize',scheduleDockSync,{passive:true});window.TeamBullsTrainerWorkspace=Object.freeze({version:'10.10.9-workspace5',sync:syncDock,openReports:openQuickReports,openNote:openPrivateNote,openPreviousWorkout,refreshReports:()=>loadQuickReports(true)});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();