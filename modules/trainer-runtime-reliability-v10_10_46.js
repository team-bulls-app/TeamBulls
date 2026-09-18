/* Team Bulls v10.10.52 — confiabilidade do runtime do treinador e navegação imediata. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_TRAINER_RUNTIME_RELIABILITY_101046__)return;
  window.__TEAM_BULLS_TRAINER_RUNTIME_RELIABILITY_101046__=true;

  const VERSION='10.10.52-trainer2';
  const REPORTS_SRC='./modules/trainer-sent-reports-v10_10_52.js?v=10.10.52-sentreports3';
  const FEEDBACK_SRC='./modules/trainer-feedback-archive-v10_10_46.js?v=10.10.46-feedback2';
  const QUESTIONNAIRE_FEEDBACK_STYLE_ID='tb-trainer-questionnaire-feedback-shortcuts';
  const loads=new Map();
  let viewStudentBase=null;

  const trainer=()=>{try{return typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role==='trainer'&&typeof MODE!=='undefined'&&MODE==='cloud';}catch(error){return false;}};
  const copyFlags=(target,source)=>{try{Object.keys(source||{}).forEach(key=>{try{target[key]=source[key];}catch(error){}});}catch(error){}return target;};

  function loadScript(src,timeout=7000){
    const existing=[...document.scripts].find(script=>script.src===new URL(src,location.href).href&&script.dataset.tbReady==='1');
    if(existing)return Promise.resolve(true);
    if(loads.has(src))return loads.get(src);
    const promise=new Promise(resolve=>{
      const script=document.createElement('script');
      let settled=false;
      const finish=ok=>{if(settled)return;settled=true;clearTimeout(timer);if(ok)script.dataset.tbReady='1';else script.remove();loads.delete(src);resolve(ok);};
      script.src=src;script.async=true;script.onload=()=>finish(true);script.onerror=()=>finish(false);
      const timer=setTimeout(()=>finish(false),Math.max(2500,timeout));
      document.head.appendChild(script);
    });
    loads.set(src,promise);return promise;
  }

  function setStudentLoading(student){
    const title=document.getElementById('ts-title');if(title)title.textContent='ARQUIVO // '+String(student?.name||'ALUNO').toUpperCase();
    const list=document.getElementById('ts-workout-list');if(list)list.innerHTML='<div class="no-data-inline">Carregando protocolos do aluno...</div>';
    const empty=document.getElementById('ts-workout-empty');if(empty)empty.style.display='none';
  }

  function feedbackDateIso(value){
    try{
      let date=null;
      if(value?.toDate)date=value.toDate();
      else if(value?.seconds)date=new Date(Number(value.seconds)*1000);
      else if(value instanceof Date)date=value;
      if(!date||!Number.isFinite(date.getTime()))return'';
      const pad=number=>String(number).padStart(2,'0');
      return`${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
    }catch(error){return'';}
  }
  function questionnaireReportById(id){
    try{return(Array.isArray(TS_QUEST_CACHE)?TS_QUEST_CACHE:[]).find(report=>String(report?.id||'')===String(id||''))||null;}catch(error){return null;}
  }
  function ensureQuestionnaireFeedbackStyles(){
    if(document.getElementById(QUESTIONNAIRE_FEEDBACK_STYLE_ID))return;
    const style=document.createElement('style');style.id=QUESTIONNAIRE_FEEDBACK_STYLE_ID;style.textContent=`
      .tb-questionnaire-report-actions{display:flex;gap:6px;align-items:stretch;margin-bottom:8px}
      .tb-questionnaire-report-actions>.quest-card{flex:1 1 auto;min-width:0;margin:0}
      .tb-questionnaire-report-actions>.tb-questionnaire-feedback-btn{flex:0 0 auto;width:auto!important;padding:8px 10px!important;align-self:stretch}
      @media(max-width:640px){.tb-questionnaire-report-actions{display:grid;grid-template-columns:minmax(0,1fr) auto}}
    `;document.head.appendChild(style);
  }
  function openQuestionnaireFeedback(id){
    if(!trainer()||!VIEW_STUDENT)return false;
    const report=questionnaireReportById(id);if(!report?.answered)return false;
    const activeUid=String(VIEW_STUDENT?.uid||''),reportUid=String(report.studentId||'');
    if(reportUid&&reportUid!==activeUid)return false;
    const sourceDate=feedbackDateIso(report.answeredAt)||feedbackDateIso(report.createdAt);
    const label=sourceDate?(typeof fmt==='function'?fmt(sourceDate):sourceDate):'';
    if(typeof openFeedbackModal!=='function'){
      if(typeof showToast==='function')showToast('O editor de feedback ainda não está disponível. Tente novamente em instantes.',true);
      return false;
    }
    openFeedbackModal('weekly_report',{
      sourceType:'questionnaire_report',
      sourceId:String(report.id),
      sourceDate,
      title:label?`Feedback do relatório de ${label}`:'Feedback do relatório personalizado'
    });
    return true;
  }
  window.openFeedbackForQuestionnaireReport=openQuestionnaireFeedback;

  function decorateQuestionnaireFeedback(cache,listId,fromTrainer){
    if(!trainer()||!fromTrainer||String(listId)!=='ts-quest-list')return false;
    const list=document.getElementById(listId);if(!list)return false;
    ensureQuestionnaireFeedbackStyles();
    const reports=Array.isArray(cache)?cache:[];
    const cards=[...list.children].filter(node=>node?.classList?.contains('quest-card'));
    let added=0;
    cards.forEach((card,index)=>{
      const report=reports[index];if(!report?.answered||!report?.id)return;
      const row=document.createElement('div');row.className='tb-questionnaire-report-actions';
      list.insertBefore(row,card);row.appendChild(card);
      const button=document.createElement('button');button.type='button';button.className='btn-add-set tb-report-feedback-btn tb-questionnaire-feedback-btn';button.textContent='FEEDBACK EXTENSO';
      button.setAttribute('aria-label','Enviar feedback deste relatório');
      button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();openQuestionnaireFeedback(report.id);});
      row.appendChild(button);added++;
    });
    return added>0;
  }
  function wrapperHasQuestionnaireFeedback(fn){
    let current=fn,depth=0;
    while(typeof current==='function'&&depth++<12){if(current.__tbTrainerQuestionnaireFeedback101059)return true;current=current.__tbBase;}
    return false;
  }
  function patchQuestionnaireFeedbackShortcuts(){
    try{
      if(typeof renderQuestList!=='function')return false;
      if(wrapperHasQuestionnaireFeedback(renderQuestList))return true;
      const base=renderQuestList;
      const wrapped=function(cache,listId,emptyId,fromTrainer){
        const result=base.apply(this,arguments);
        try{decorateQuestionnaireFeedback(cache,listId,fromTrainer);}catch(error){console.warn('[Team Bulls] atalho de feedback do relatório indisponível',error);}
        return result;
      };
      copyFlags(wrapped,base);
      wrapped.__tbTrainerQuestionnaireFeedback101059=true;
      wrapped.__tbBase=base;
      renderQuestList=wrapped;
      return true;
    }catch(error){return false;}
  }

  function patchViewStudent(){
    try{
      if(typeof viewStudent!=='function')return false;
      if(viewStudent.__tbTrainerImmediateNavigation101046)return true;
      viewStudentBase=viewStudent;
      const wrapped=async function(suid,sname,email,status){
        const student={uid:String(suid||''),name:String(sname||'Aluno'),email:String(email||''),status:String(status||'active')};
        if(!student.uid)return false;
        try{
          const navigation=typeof beginAsyncNavigation==='function'?beginAsyncNavigation():null;
          VIEW_STUDENT=student;
          setStudentLoading(student);
          if(typeof showScreen==='function')showScreen('screen-trainer-student',navigation);
          try{
            await renderTrainerStudent(VIEW_STUDENT);
            return true;
          }catch(error){
            console.warn('[Team Bulls] abertura do aluno concluída com dados pendentes',error);
            if(typeof showToast==='function')showToast('O arquivo do aluno abriu, mas alguns dados ainda não responderam. Toque novamente para atualizar.',true);
            return false;
          }
        }catch(error){
          console.warn('[Team Bulls] falha ao abrir aluno pelo runtime resiliente',error);
          try{return await viewStudentBase.apply(this,arguments);}catch(baseError){if(typeof showToast==='function')showToast('Não foi possível abrir este aluno agora.',true);return false;}
        }
      };
      copyFlags(wrapped,viewStudentBase);
      wrapped.__tbTrainerImmediateNavigation101046=true;
      viewStudent=wrapped;
      return true;
    }catch(error){return false;}
  }

  async function ensureArchives(){
    if(!trainer())return false;
    // Impede que revisões antigas cacheadas assumam novamente as mesmas telas.
    window.__TEAM_BULLS_TRAINER_SENT_REPORTS_101033__=true;
    window.__TEAM_BULLS_TRAINER_SENT_REPORTS_101046__=true;
    window.__TEAM_BULLS_TRAINER_FEEDBACK_ARCHIVE_101037__=true;
    const [reports,feedback]=await Promise.all([loadScript(REPORTS_SRC),loadScript(FEEDBACK_SRC)]);
    return reports&&feedback;
  }

  async function install(){
    if(!trainer())return false;
    patchViewStudent();
    patchQuestionnaireFeedbackShortcuts();
    await ensureArchives();
    patchQuestionnaireFeedbackShortcuts();
    return true;
  }

  function openStudent(uid,name,email,status){
    if(typeof viewStudent!=='function')return false;
    viewStudent(String(uid||''),String(name||'Aluno'),String(email||''),String(status||'active'));
    return true;
  }

  patchViewStudent();
  patchQuestionnaireFeedbackShortcuts();
  if(trainer())install();
  window.addEventListener('team-bulls-runtime-state',()=>{if(trainer())install();});
  window.addEventListener('team-bulls-runtime-ready',()=>{if(trainer())install();});
  window.addEventListener('pageshow',()=>{if(trainer())install();},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&trainer())install();},{passive:true});

  window.TeamBullsTrainerRuntimeReliability=Object.freeze({version:VERSION,install,openStudent,patchViewStudent,patchQuestionnaireFeedbackShortcuts,ensureArchives});
})();