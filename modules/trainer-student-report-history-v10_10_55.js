/* Team Bulls v10.10.55 — histórico individual resiliente, independente por seção e sem loading infinito. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_TRAINER_STUDENT_REPORT_HISTORY_101055__)return;
  window.__TEAM_BULLS_TRAINER_STUDENT_REPORT_HISTORY_101055__=true;

  const VERSION='10.10.55-studentreports4';
  const MAX_REPORTS=500;
  const READ_TIMEOUT=6000;
  let baseRenderQuestList=null;
  let installed=false;
  let questionnaireHistoryStudent='';
  let weeklyHistoryStudent='';

  const trainer=()=>{try{return CURRENT_USER?.role==='trainer'&&MODE==='cloud'&&!!db;}catch(error){return false;}};
  const stampMs=value=>{try{if(value?.toMillis)return value.toMillis();if(value?.toDate)return value.toDate().getTime();if(value?.seconds)return Number(value.seconds)*1000;return 0;}catch(error){return 0;}};
  const activeStudent=studentUid=>trainer()&&String(VIEW_STUDENT?.uid||'')===String(studentUid||'');
  const iso=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):'';
  const fmtDate=value=>{const date=iso(value);if(!date)return'—';try{return typeof fmt==='function'?fmt(date):date;}catch(error){return date;}};
  const dateFromTimestamp=value=>{const ms=stampMs(value);if(!ms)return'';const date=new Date(ms),pad=n=>String(n).padStart(2,'0');return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());};
  const readWithTimeout=(reference,label)=>{
    const task=reference.get();
    if(typeof withTimeout==='function')return withTimeout(task,READ_TIMEOUT,label);
    return Promise.race([Promise.resolve(task),new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error('Tempo esgotado: '+label),{code:'team-bulls/timeout'})),READ_TIMEOUT))]);
  };

  function unwrapRenderQuestList(){
    let current=renderQuestList;
    while(current?.__tbBase&&(current.__tbTrainerAnsweredDate101053||current.__tbTrainerAnsweredDate101054))current=current.__tbBase;
    return current;
  }
  function patchReportDates(){
    if(typeof renderQuestList!=='function')return false;
    if(renderQuestList.__tbTrainerAnsweredDate101055)return true;
    baseRenderQuestList=unwrapRenderQuestList();
    if(typeof baseRenderQuestList!=='function')return false;
    const wrapped=function(cache,listId,emptyId,fromTrainer){
      if(fromTrainer){
        const visible=(Array.isArray(cache)?cache:[]).map(report=>report?.answeredAt?{...report,createdAt:report.answeredAt}:report);
        return baseRenderQuestList(visible,listId,emptyId,fromTrainer);
      }
      return baseRenderQuestList(cache,listId,emptyId,fromTrainer);
    };
    wrapped.__tbTrainerAnsweredDate101055=true;
    wrapped.__tbBase=baseRenderQuestList;
    renderQuestList=wrapped;
    return true;
  }

  function injectHistoryStyles(){
    if(document.getElementById('tb-update-history-style'))return;
    const style=document.createElement('style');style.id='tb-update-history-style';style.textContent='.tb-update-history-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:stretch;margin-bottom:8px}.tb-update-history-card{width:100%;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:10px;text-align:left;padding:12px;border:1px solid rgba(255,255,255,.08);border-left:3px solid #e11d48;border-radius:8px;background:#121110;color:#ddd}.tb-update-history-card:disabled{opacity:1;cursor:default}.tb-update-history-main{min-width:0}.tb-update-history-kicker{display:flex;align-items:center;gap:7px;flex-wrap:wrap;color:#e8798b;font:700 9px \"DM Mono\",monospace}.tb-update-history-type{padding:3px 6px;border:1px solid rgba(225,29,72,.3);border-radius:999px;color:#ff9aaa}.tb-update-history-type.monthly{background:rgba(225,29,72,.1);color:#ffb4c0}.tb-update-history-status{color:#8e8580}.tb-update-history-detail{display:block;margin-top:5px;color:#8d827c;font:500 9px/1.45 \"DM Mono\",monospace}.tb-update-history-actions{display:flex;gap:5px;align-items:center}.tb-update-history-actions button{width:auto;min-height:38px;padding:7px 9px;white-space:nowrap}.tb-update-history-error{padding:9px 10px;margin:0 0 8px;border:1px solid rgba(225,29,72,.2);border-radius:7px;color:#a79a93;font:500 9px/1.45 \"DM Mono\",monospace}@media(max-width:520px){.tb-update-history-row{grid-template-columns:1fr}.tb-update-history-actions button{flex:1}.tb-update-history-actions{justify-content:flex-end}}';document.head.appendChild(style);
  }

  function updateHistoryHeading(){
    const label=document.getElementById('ts-weekly-checkin-list')?.previousElementSibling?.querySelector('.section-label');
    if(label)label.textContent='Histórico semanal e mensal';
  }

  function monthlyStatus(report){
    if(report?.answered)return'answered';
    try{return window.TeamBullsMonthlyReports?.status(report)||'loading';}catch(error){return'loading';}
  }

  function weeklyCard(item){
    const date=iso(item.submittedDate)||iso(item.dueDate),period=iso(item.dueDate);
    const title=item.requestKind==='manual'?'RELATÓRIO EXTRA':'RELATÓRIO SEMANAL';
    const weight=Number(item.weight)>0?Number(item.weight).toLocaleString('pt-BR',{maximumFractionDigits:1})+' kg · ':'';
    const photos=Array.isArray(item.photoIds)?item.photoIds.length:6;
    const details=[weight+photos+' fotos',period?'Período: '+fmtDate(period):''].filter(Boolean).join(' · ');
    const feedback=typeof openFeedbackForWeeklyReport==='function'?'<button type="button" class="btn-add-set" onclick="event.stopPropagation();openFeedbackForWeeklyReport('+jsArg(item.id)+')">FEEDBACK EXTENSO</button>':'';
    return'<div class="tb-update-history-row"><button type="button" class="tb-update-history-card" onclick="viewWeeklyCheckin('+jsArg(item.id)+')"><span class="tb-update-history-main"><span class="tb-update-history-kicker"><span>'+fmtDate(date)+'</span><span class="tb-update-history-type">'+title+'</span></span><span class="tb-update-history-detail">'+details+'</span></span><span aria-hidden="true">›</span></button>'+(feedback?'<div class="tb-update-history-actions">'+feedback+'</div>':'')+'</div>';
  }

  function monthlyCard(report){
    const state=monthlyStatus(report),answered=report?.answered===true;
    const date=answered?(dateFromTimestamp(report.answeredAt)||iso(report.dueDate)):iso(report.dueDate);
    const statusLabel=state==='answered'?'ENVIADO':state==='scheduled'?'AGENDADO':state==='superseded'?'CICLO ANTERIOR':state==='loading'?'ATUALIZANDO':'AGUARDANDO ALUNO';
    const photos=Array.isArray(report.photoIds)?report.photoIds.length:0;
    const questions=Array.isArray(report.questions)?report.questions.length:0;
    const detail=answered?questions+' perguntas · '+photos+' fotos · vencimento '+fmtDate(report.dueDate):questions+' perguntas · 6 fotos obrigatórias · vencimento '+fmtDate(report.dueDate);
    const action=answered&&typeof openFeedbackForQuestionnaireReport==='function'
      ?'<button type="button" class="btn-add-set" onclick="event.stopPropagation();openFeedbackForQuestionnaireReport('+jsArg(report.id)+')">FEEDBACK EXTENSO</button>'
      :!answered?'<button type="button" class="btn-ghost" onclick="event.stopPropagation();cancelQuestionnaireRequest('+jsArg(report.id)+')">CANCELAR</button>':'';
    const open=answered?' onclick="viewQuestionnaire('+jsArg(report.id)+',true)"':' disabled';
    return'<div class="tb-update-history-row"><button type="button" class="tb-update-history-card"'+open+'><span class="tb-update-history-main"><span class="tb-update-history-kicker"><span>'+fmtDate(date)+'</span><span class="tb-update-history-type monthly">ATUALIZAÇÃO MENSAL COMPLETA</span><span class="tb-update-history-status">'+statusLabel+'</span></span><span class="tb-update-history-detail">'+detail+'</span></span>'+(answered?'<span aria-hidden="true">›</span>':'')+'</button>'+(action?'<div class="tb-update-history-actions">'+action+'</div>':'')+'</div>';
  }

  function renderCombinedHistory(studentUid,weeklyLoaded,questionnairesLoaded){
    if(!activeStudent(studentUid))return;
    const list=document.getElementById('ts-weekly-checkin-list');if(!list)return;
    if(!weeklyLoaded&&!questionnairesLoaded)return;
    injectHistoryStyles();updateHistoryHeading();
    const weekly=weeklyLoaded?(Array.isArray(WEEKLY_CHECKINS)?WEEKLY_CHECKINS:[]):[];
    const monthly=questionnairesLoaded?(Array.isArray(TS_QUEST_CACHE)?TS_QUEST_CACHE.filter(report=>report?.reportType==='monthly'&&!report.cancelledAt):[]):[];
    const entries=[
      ...weekly.map(report=>({kind:'weekly',report,date:iso(report.submittedDate)||iso(report.dueDate),time:stampMs(report.createdAt)})),
      ...monthly.map(report=>({kind:'monthly',report,date:report.answered?(dateFromTimestamp(report.answeredAt)||iso(report.dueDate)):iso(report.dueDate),time:stampMs(report.answeredAt)||stampMs(report.createdAt)}))
    ].filter(entry=>entry.date).sort((a,b)=>b.date.localeCompare(a.date)||(a.kind==='monthly'?0:1)-(b.kind==='monthly'?0:1)||b.time-a.time);
    const cards=entries.map(entry=>entry.kind==='monthly'?monthlyCard(entry.report):weeklyCard(entry.report));
    if(!entries.length)cards.push('<div class="no-data-inline">Nenhuma atualização semanal ou mensal enviada.</div>');
    if(!weeklyLoaded)cards.push('<div class="tb-update-history-error">Não foi possível carregar os relatórios semanais agora.</div>');
    if(!questionnairesLoaded)cards.push('<div class="tb-update-history-error">Não foi possível confirmar as atualizações mensais agora.</div>');
    list.innerHTML=cards.join('');
  }

  function patchQuestionnaireViewer(){
    if(typeof viewQuestionnaire!=='function'||viewQuestionnaire.__tbTrainerMonthlyTitle101055)return false;
    const previous=viewQuestionnaire;
    const wrapped=function(id,fromTrainer){
      const cache=fromTrainer?TS_QUEST_CACHE:MY_QUEST_CACHE;
      const report=(Array.isArray(cache)?cache:[]).find(item=>String(item?.id||'')===String(id||''));
      const result=previous.apply(this,arguments);
      if(fromTrainer&&report?.reportType==='monthly'&&report.answered){
        const title=document.getElementById('quest-view-title');if(title)title.textContent='Atualização mensal completa respondida';
      }
      return result;
    };
    wrapped.__tbTrainerMonthlyTitle101055=true;wrapped.__tbBase=previous;viewQuestionnaire=wrapped;return true;
  }

  function loading(id,text){const el=document.getElementById(id);if(el)el.innerHTML=`<div class="no-data-inline">${text}</div>`;}
  function sectionError(id,message){
    const el=document.getElementById(id);if(!el)return;
    el.innerHTML=`<div class="no-data-inline">${message}<br><button class="btn-ghost" style="margin-top:10px" onclick="TeamBullsTrainerStudentReportHistory?.refresh?.()">TENTAR NOVAMENTE</button></div>`;
  }
  function setLoadingState(){
    loading('ts-quest-list','Carregando relatórios do aluno...');
    const empty=document.getElementById('ts-quest-empty');if(empty)empty.style.display='none';
    loading('ts-weekly-checkin-list','Carregando relatórios semanais...');
  }

  async function loadOwnedQuestionnaires(studentUid){
    const trainerUid=String(CURRENT_USER?.uid||'');
    if(!trainerUid||!studentUid)return[];
    const ownedRef=db.collection('questionnaires').where('trainerId','==',trainerUid).limit(MAX_REPORTS);
    const studentRef=db.collection('questionnaires').where('studentId','==',studentUid).limit(MAX_REPORTS);
    const [ownedResult,studentResult]=await Promise.allSettled([
      readWithTimeout(ownedRef,'relatórios do treinador'),
      readWithTimeout(studentRef,'relatórios do aluno')
    ]);
    if(ownedResult.status==='rejected'&&studentResult.status==='rejected')throw ownedResult.reason||studentResult.reason||new Error('Relatórios indisponíveis');
    const rows=Object.create(null);
    if(ownedResult.status==='fulfilled')for(const doc of ownedResult.value.docs||[]){const data={...doc.data(),id:doc.id};if(String(data.studentId||'')===String(studentUid))rows[doc.id]=data;}
    if(studentResult.status==='fulfilled')for(const doc of studentResult.value.docs||[]){const data={...doc.data(),id:doc.id},owner=String(data.trainerId||'');if(String(data.studentId||'')===String(studentUid)&&(!owner||owner===trainerUid))rows[doc.id]=data;}
    return Object.values(rows).sort((a,b)=>(stampMs(b.answeredAt)||stampMs(b.createdAt))-(stampMs(a.answeredAt)||stampMs(a.createdAt))||String(b.id).localeCompare(String(a.id)));
  }

  async function refreshQuestionnaires(studentUid){
    try{
      const questionnaires=await loadOwnedQuestionnaires(studentUid);
      if(!activeStudent(studentUid))return false;
      TS_QUEST_CACHE=questionnaires;
      questionnaireHistoryStudent=studentUid;
      patchReportDates();
      if(typeof renderQuestList==='function')renderQuestList(TS_QUEST_CACHE.filter(report=>report?.reportType!=='monthly'),'ts-quest-list','ts-quest-empty',true);
      else sectionError('ts-quest-list','Não foi possível montar os relatórios personalizados.');
      return true;
    }catch(error){
      console.warn('[Team Bulls] relatórios personalizados indisponíveis',error?.code||error?.message||error);
      if(activeStudent(studentUid))sectionError('ts-quest-list','Não foi possível carregar os relatórios personalizados agora.');
      return false;
    }
  }

  async function refreshWeekly(studentUid){
    try{
      if(typeof fetchWeeklyCheckins!=='function')throw new Error('Leitor semanal indisponível');
      const task=fetchWeeklyCheckins(studentUid);
      const checkins=typeof withTimeout==='function'?await withTimeout(task,READ_TIMEOUT,'relatórios semanais'):await task;
      if(!activeStudent(studentUid))return false;
      WEEKLY_CHECKINS=Array.isArray(checkins)?checkins:[];
      weeklyHistoryStudent=studentUid;
      if(typeof renderWeeklyCheckinHistory==='function')renderWeeklyCheckinHistory(WEEKLY_CHECKINS,'ts-weekly-checkin-list');
      else sectionError('ts-weekly-checkin-list','Não foi possível montar os relatórios semanais.');
      return true;
    }catch(error){
      console.warn('[Team Bulls] relatórios semanais indisponíveis',error?.code||error?.message||error);
      if(activeStudent(studentUid))sectionError('ts-weekly-checkin-list','Não foi possível carregar os relatórios semanais agora.');
      return false;
    }
  }

  async function refreshStudentReports({navigation=null,showScreenNow=false}={}){
    if(!trainer()||!VIEW_STUDENT?.uid)return false;
    const studentUid=String(VIEW_STUDENT.uid);
    if(showScreenNow&&typeof showScreen==='function')showScreen('screen-ts-quest',navigation);
    setLoadingState();
    const [questionnaires,weekly]=await Promise.allSettled([refreshQuestionnaires(studentUid),refreshWeekly(studentUid)]);
    if(!activeStudent(studentUid))return false;
    const qOk=questionnaires.status==='fulfilled'&&questionnaires.value===true;
    const wOk=weekly.status==='fulfilled'&&weekly.value===true;
    renderCombinedHistory(studentUid,wOk&&weeklyHistoryStudent===studentUid,qOk&&questionnaireHistoryStudent===studentUid);
    if(!qOk&&!wOk&&typeof showToast==='function')showToast('Não foi possível atualizar os relatórios agora. Tente novamente.',true);
    return qOk||wOk;
  }

  function unwrapOpen(){
    let current=openTsQuestionnaires;
    while(current?.__tbBase&&(current.__tbTrainerOwnedHistory101053||current.__tbTrainerOwnedHistory101054))current=current.__tbBase;
    return current;
  }
  function patchOpen(){
    if(typeof openTsQuestionnaires!=='function')return false;
    if(openTsQuestionnaires.__tbTrainerOwnedHistory101055)return true;
    const previous=unwrapOpen();
    const wrapped=async function(){
      if(!trainer()||!VIEW_STUDENT?.uid)return previous.apply(this,arguments);
      const navigation=typeof beginAsyncNavigation==='function'?beginAsyncNavigation():null;
      if(typeof showScreen==='function')showScreen('screen-ts-quest',navigation);
      return refreshStudentReports({navigation,showScreenNow:false});
    };
    wrapped.__tbTrainerOwnedHistory101055=true;
    wrapped.__tbBase=previous;
    openTsQuestionnaires=wrapped;
    return true;
  }

  function install(){
    if(!trainer())return false;
    patchReportDates();patchQuestionnaireViewer();patchOpen();installed=true;return true;
  }

  install();
  [120,500,1400].forEach(delay=>setTimeout(install,delay));
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('team-bulls-runtime-state',install);
  window.addEventListener('pageshow',install,{passive:true});
  window.TeamBullsTrainerStudentReportHistory=Object.freeze({version:VERSION,install,refresh:refreshStudentReports,state:()=>({installed,studentId:String(VIEW_STUDENT?.uid||'')})});
})();
