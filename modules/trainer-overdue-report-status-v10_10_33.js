/* Team Bulls v10.10.33 — status administrativo considera relatório semanal vencido. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_TRAINER_OVERDUE_REPORT_STATUS_101033__)return;
  window.__TEAM_BULLS_TRAINER_OVERDUE_REPORT_STATUS_101033__=true;

  const VERSION='10.10.33-overduestatus1';
  const checkinsByStudent=new Map();
  let dueBoundaryTimer=null;

  const trainer=()=>{try{return CURRENT_USER?.role==='trainer'&&MODE==='cloud';}catch(error){return false;}};
  const currentStudentUid=()=>{try{return String(VIEW_STUDENT?.uid||'');}catch(error){return'';}};
  const currentSchedule=()=>{try{return typeof TRAINER_CHECKIN_SCHEDULE!=='undefined'?TRAINER_CHECKIN_SCHEDULE:null;}catch(error){return null;}};
  const currentProtocolSchedule=()=>{try{return typeof V109_PROTOCOL_REVIEW_SCHEDULE!=='undefined'?V109_PROTOCOL_REVIEW_SCHEDULE:null;}catch(error){return null;}};
  const iso=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
  const todayIso=()=>{if(typeof today==='function')return today();const d=new Date(),p=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;};
  const formatDate=value=>{try{return typeof fmt==='function'?fmt(value):String(value||'');}catch(error){return String(value||'');}};
  const safe=value=>typeof esc==='function'?esc(value):String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function cachedCheckins(){return checkinsByStudent.get(currentStudentUid())||[];}
  function weeklyRequestState(){
    const schedule=currentSchedule();
    if(!schedule||schedule.enabled===false)return{enabled:schedule?.enabled!==false,pending:false,overdue:false,request:null};
    let request=null;
    try{if(typeof computeCheckinRequest==='function')request=computeCheckinRequest(schedule,cachedCheckins());}catch(error){console.warn('[Team Bulls] Estado semanal não pôde ser calculado.',error);}
    if(!request&&iso(schedule.nextDueDate))request={kind:'scheduled',dueDate:String(schedule.nextDueDate),pending:String(schedule.nextDueDate)<=todayIso()};
    const dueDate=String(request?.dueDate||''),pending=!!request?.pending;
    return{enabled:true,pending,overdue:pending&&iso(dueDate)&&dueDate<todayIso(),request};
  }
  function protocolState(schedule=currentProtocolSchedule()){
    try{return typeof v109ProtocolState==='function'?v109ProtocolState(schedule):null;}catch(error){return null;}
  }
  function weeklyDescription(state){
    if(!state?.pending||!state.request)return'';
    const due=formatDate(state.request.dueDate),manual=state.request.kind==='manual';
    if(manual)return state.overdue?`Relatório extra solicitado em ${due} ainda não foi enviado pelo aluno.`:`Relatório extra solicitado para hoje (${due}) ainda não foi enviado pelo aluno.`;
    return state.overdue?`Relatório semanal previsto para ${due} ainda não foi enviado pelo aluno.`:`O relatório semanal de hoje (${due}) ainda não foi enviado pelo aluno.`;
  }
  function weeklyInlineHtml(state){
    if(!state?.pending||!state.request)return'';
    const due=safe(formatDate(state.request.dueDate)),kind=state.request.kind==='manual'?'Relatório extra':'Relatório semanal';
    return state.overdue?`${kind} atrasado desde <b>${due}</b>.`:`${kind} pendente para hoje (<b>${due}</b>).`;
  }

  function syncWeeklyScheduleCard(state){
    if(!state?.enabled||!state.pending)return;
    const badge=document.getElementById('trainer-checkin-state'),help=document.getElementById('trainer-checkin-help');
    if(badge){badge.textContent=state.overdue?'ATRASADO':'PENDENTE';badge.className='quest-status pending';}
    if(help)help.textContent=weeklyDescription(state);
  }

  function syncProtocolCard(schedule=currentProtocolSchedule()){
    if(!trainer()||!currentStudentUid())return;
    const monthly=protocolState(schedule),weekly=weeklyRequestState();
    syncWeeklyScheduleCard(weekly);
    if(!monthly){scheduleNextBoundary(weekly,monthly);return;}
    const badge=document.getElementById('trainer-protocol-review-state'),help=document.getElementById('trainer-protocol-review-help'),next=document.getElementById('trainer-protocol-review-next'),complete=document.getElementById('trainer-protocol-review-complete');
    if(!badge||!help||!next){scheduleNextBoundary(weekly,monthly);return;}
    const anyPending=monthly.pending||weekly.pending;
    if(monthly.pending&&weekly.pending)badge.textContent='2 PENDÊNCIAS';
    else if(monthly.pending)badge.textContent='ATUALIZAÇÃO PENDENTE';
    else if(weekly.pending)badge.textContent=weekly.overdue?'RELATÓRIO ATRASADO':'RELATÓRIO PENDENTE';
    else badge.textContent='EM DIA';
    badge.className='quest-status '+(anyPending?'pending':'answered');
    const cycleHelp=`${monthly.weekNumber?`Semana ${monthly.weekNumber} do ciclo`:'O protocolo ainda não começou'} · atualização completa a cada ${monthly.intervalWeeks} semanas. Ajustes semanais não reiniciam a contagem.`;
    help.textContent=weekly.pending?cycleHelp+' '+weeklyDescription(weekly):cycleHelp;
    const monthlyHtml=monthly.pending?`Atualização completa nº ${monthly.pendingCycle} pendente desde <b>${safe(formatDate(monthly.nextDueDate))}</b>.`:`Próxima atualização completa: <b>${safe(formatDate(monthly.nextDueDate))}</b>.`;
    next.innerHTML=weekly.pending?`${weeklyInlineHtml(weekly)} ${monthlyHtml}`:monthlyHtml;
    // Relatório semanal atrasado muda apenas o status visual. Nunca libera a ação mensal.
    if(complete)complete.disabled=!monthly.pending;
    scheduleNextBoundary(weekly,monthly);
  }

  function localMidnightMs(value){
    if(!iso(value))return 0;const[y,m,d]=String(value).split('-').map(Number);return new Date(y,m-1,d,0,0,0,120).getTime();
  }
  function scheduleNextBoundary(weekly=weeklyRequestState(),monthly=protocolState()){
    clearTimeout(dueBoundaryTimer);dueBoundaryTimer=null;
    if(!trainer())return;
    const now=todayIso(),dates=[];
    const weeklyDue=String(weekly?.request?.dueDate||'');if(iso(weeklyDue)&&weeklyDue>now)dates.push(weeklyDue);
    const monthlyDue=String(monthly?.nextDueDate||'');if(iso(monthlyDue)&&monthlyDue>now)dates.push(monthlyDue);
    if(!dates.length)return;
    dates.sort();const target=localMidnightMs(dates[0]);if(!target)return;
    const delay=Math.max(250,Math.min(2147000000,target-Date.now()));
    dueBoundaryTimer=setTimeout(()=>{dueBoundaryTimer=null;syncProtocolCard();},delay);
  }

  function patchWeeklyCheckinFetch(){
    if(typeof fetchWeeklyCheckins!=='function'||fetchWeeklyCheckins.__tbTrainerOverdueStatus)return;
    const base=fetchWeeklyCheckins;
    const wrapped=async function(studentUid){
      const rows=await base.apply(this,arguments),uid=String(studentUid||'');
      if(trainer()&&uid&&uid===currentStudentUid()){
        checkinsByStudent.set(uid,Array.isArray(rows)?rows.slice():[]);
        queueMicrotask(()=>syncProtocolCard());
      }
      return rows;
    };
    wrapped.__tbTrainerOverdueStatus=true;wrapped.__tbBase=base;fetchWeeklyCheckins=wrapped;
  }
  function patchTrainerScheduleLoad(){
    if(typeof loadTrainerCheckinSchedule!=='function'||loadTrainerCheckinSchedule.__tbTrainerOverdueStatus)return;
    const base=loadTrainerCheckinSchedule;
    const wrapped=async function(studentUid){const result=await base.apply(this,arguments);if(String(studentUid||'')===currentStudentUid())syncProtocolCard();return result;};
    wrapped.__tbTrainerOverdueStatus=true;wrapped.__tbBase=base;loadTrainerCheckinSchedule=wrapped;
  }
  function patchProtocolRender(){
    if(typeof renderTrainerProtocolReview!=='function'||renderTrainerProtocolReview.__tbTrainerOverdueStatus)return;
    const base=renderTrainerProtocolReview;
    const wrapped=function(schedule){const result=base.apply(this,arguments);syncProtocolCard(schedule);return result;};
    wrapped.__tbTrainerOverdueStatus=true;wrapped.__tbBase=base;renderTrainerProtocolReview=wrapped;
  }
  function patchLogout(){
    if(typeof confirmLogout!=='function'||confirmLogout.__tbTrainerOverdueStatus)return;
    const base=confirmLogout;
    const wrapped=function(){checkinsByStudent.clear();clearTimeout(dueBoundaryTimer);dueBoundaryTimer=null;return base.apply(this,arguments);};
    wrapped.__tbTrainerOverdueStatus=true;wrapped.__tbBase=base;confirmLogout=wrapped;
  }
  function install(){patchWeeklyCheckinFetch();patchTrainerScheduleLoad();patchProtocolRender();patchLogout();syncProtocolCard();}

  install();
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('team-bulls-runtime-state',install);
  window.addEventListener('pageshow',()=>syncProtocolCard(),{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncProtocolCard();},{passive:true});

  window.TeamBullsTrainerOverdueReportStatus=Object.freeze({version:VERSION,sync:syncProtocolCard,weeklyState:weeklyRequestState});
})();
