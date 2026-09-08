/* Team Bulls v10.10.35 — entrada do relatório semanal atual na aba Relatórios do aluno. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_STUDENT_WEEKLY_REPORT_ENTRY_101035__)return;
  window.__TEAM_BULLS_STUDENT_WEEKLY_REPORT_ENTRY_101035__=true;

  const VERSION='10.10.35-weeklyentry1';
  const HOST_ID='tb-weekly-report-current';
  const STYLE_ID='tb-weekly-report-current-style';
  let loading=false;

  function studentCloud(){
    try{return CURRENT_USER?.role==='student'&&MODE==='cloud'&&!!CURRENT_USER?.uid;}catch(error){return false;}
  }
  function scheduleState(){
    try{return typeof WEEKLY_CHECKIN_SCHEDULE!=='undefined'?WEEKLY_CHECKIN_SCHEDULE:null;}catch(error){return null;}
  }
  function requestState(){
    try{return typeof WEEKLY_CHECKIN_REQUEST!=='undefined'?WEEKLY_CHECKIN_REQUEST:null;}catch(error){return null;}
  }
  function enabledForStudent(){const schedule=scheduleState();return !schedule||schedule.enabled!==false;}
  function formatDate(value){try{return typeof fmt==='function'?fmt(value):String(value||'');}catch(error){return String(value||'');}}

  function installStyle(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');style.id=STYLE_ID;
    style.textContent=`
      #${HOST_ID}{margin:0 0 14px}
      #${HOST_ID}[hidden]{display:none!important}
      #${HOST_ID} .tb-weekly-current-card{border:1px solid #4b3931;background:linear-gradient(145deg,#171311,#0d0c0b 78%);border-radius:10px;padding:14px;box-shadow:inset 3px 0 #7e292f}
      #${HOST_ID} .tb-weekly-current-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px}
      #${HOST_ID} .tb-weekly-current-copy{min-width:0}
      #${HOST_ID} .tb-weekly-current-kicker{display:block;font:500 8px 'DM Mono',monospace;color:#81736a;letter-spacing:1px;text-transform:uppercase}
      #${HOST_ID} .tb-weekly-current-title{display:block;margin-top:3px;font:800 18px/1.05 'Barlow Condensed',sans-serif;color:#eee4dc;letter-spacing:.2px}
      #${HOST_ID} .tb-weekly-current-status{flex:0 0 auto;border:1px solid #4d4039;border-radius:999px;padding:5px 7px;font:600 8px 'DM Mono',monospace;color:#a89a91;letter-spacing:.7px}
      #${HOST_ID}[data-state="pending"] .tb-weekly-current-card{border-color:#71343d;box-shadow:inset 3px 0 #b12c3e,0 0 18px rgba(177,44,62,.08)}
      #${HOST_ID}[data-state="pending"] .tb-weekly-current-status{border-color:#783843;color:#e48f9b}
      #${HOST_ID}[data-state="scheduled"] .tb-weekly-current-status{border-color:#4a5545;color:#a9c6a4}
      #${HOST_ID} .tb-weekly-current-meta{margin:0 0 11px;font:400 12px/1.45 'Barlow',sans-serif;color:#aa9c92}
      #${HOST_ID} .tb-weekly-current-action{width:100%}
      #${HOST_ID} .tb-weekly-current-loading{padding:12px;border:1px dashed #42362f;color:#887a71;font:500 8px 'DM Mono',monospace;letter-spacing:.65px;text-align:center;text-transform:uppercase}
    `;
    document.head.appendChild(style);
  }

  function ensureHost(){
    const history=document.getElementById('my-weekly-checkin-list');if(!history)return null;
    let host=document.getElementById(HOST_ID);
    if(host)return host;
    installStyle();host=document.createElement('div');host.id=HOST_ID;history.parentNode.insertBefore(host,history);return host;
  }

  function openCurrentReport(){
    if(!studentCloud())return;
    try{if(typeof openWeeklyCheckinModal==='function')openWeeklyCheckinModal();}catch(error){console.warn('[Team Bulls] relatório semanal não abriu',error);}
  }

  function renderCurrent(){
    const host=ensureHost();if(!host)return false;
    if(!studentCloud()||!enabledForStudent()){host.hidden=true;host.innerHTML='';return true;}
    host.hidden=false;
    if(loading){host.dataset.state='loading';host.innerHTML='<div class="tb-weekly-current-loading">Carregando relatório semanal...</div>';return true;}
    const schedule=scheduleState(),request=requestState();
    if(!schedule||!request){
      host.dataset.state='waiting';
      host.innerHTML='<div class="tb-weekly-current-card"><div class="tb-weekly-current-head"><div class="tb-weekly-current-copy"><span class="tb-weekly-current-kicker">RELATÓRIO SEMANAL ATUAL</span><strong class="tb-weekly-current-title">Aguardando programação</strong></div><span class="tb-weekly-current-status">NÃO PROGRAMADO</span></div><p class="tb-weekly-current-meta">O treinador ainda não definiu a próxima entrega semanal para sua conta.</p></div>';
      return true;
    }
    const pending=!!request.pending,manual=request.kind==='manual';host.dataset.state=pending?'pending':'scheduled';
    const title=manual?'Relatório extra solicitado':'Relatório semanal + 6 fotos';
    const meta=manual
      ?`Solicitação extra feita em ${formatDate(request.dueDate)}. Responda todas as perguntas e envie exatamente 6 fotos.`
      :`${pending?'Entrega pendente':'Próxima entrega'}: ${formatDate(request.dueDate)}. O relatório inclui as perguntas da consultoria e exatamente 6 fotos.`;
    const buttonLabel=pending?'ENVIAR RELATÓRIO E 6 FOTOS':'ENVIAR ANTECIPADAMENTE';
    host.innerHTML=`<div class="tb-weekly-current-card"><div class="tb-weekly-current-head"><div class="tb-weekly-current-copy"><span class="tb-weekly-current-kicker">RELATÓRIO SEMANAL ATUAL</span><strong class="tb-weekly-current-title">${title}</strong></div><span class="tb-weekly-current-status">${pending?'PENDENTE':'AGENDADO'}</span></div><p class="tb-weekly-current-meta">${meta}</p><button type="button" class="btn-primary tb-weekly-current-action">${buttonLabel}</button></div>`;
    host.querySelector('.tb-weekly-current-action')?.addEventListener('click',openCurrentReport);
    return true;
  }

  async function refreshCurrent(force=true){
    if(!studentCloud()){renderCurrent();return null;}
    if(typeof loadWeeklyCheckinState!=='function'){renderCurrent();return null;}
    loading=true;renderCurrent();
    try{return await loadWeeklyCheckinState(!!force);}
    catch(error){console.warn('[Team Bulls] não foi possível atualizar a entrada do relatório semanal',error);return null;}
    finally{loading=false;renderCurrent();}
  }

  function patchReportsTab(){
    if(typeof openMyQuestionnaires!=='function'||openMyQuestionnaires.__tbWeeklyCurrentEntry)return false;
    const base=openMyQuestionnaires;
    const wrapped=async function(){
      const result=await base.apply(this,arguments);
      if(studentCloud())await refreshCurrent(true);else renderCurrent();
      return result;
    };
    wrapped.__tbWeeklyCurrentEntry=true;wrapped.__tbBase=base;openMyQuestionnaires=wrapped;return true;
  }

  function patchWeeklyRender(){
    if(typeof renderWeeklyCheckinCard!=='function'||renderWeeklyCheckinCard.__tbWeeklyCurrentEntry)return false;
    const base=renderWeeklyCheckinCard;
    const wrapped=function(){const result=base.apply(this,arguments);renderCurrent();patchHomeBanner();return result;};
    wrapped.__tbWeeklyCurrentEntry=true;wrapped.__tbBase=base;renderWeeklyCheckinCard=wrapped;return true;
  }

  function patchHomeBanner(){
    const banner=document.getElementById('weekly-checkin-home-banner');if(!banner)return false;
    const button=banner.querySelector('button');if(!button)return false;
    if(button.dataset.tbWeeklyDirect==='1')return true;
    button.dataset.tbWeeklyDirect='1';button.textContent='ENVIAR RELATÓRIO';button.setAttribute('onclick','openWeeklyCheckinModal()');return true;
  }

  function install(){patchReportsTab();patchWeeklyRender();patchHomeBanner();renderCurrent();}
  install();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  window.addEventListener('team-bulls-student-runtime-ready',install);
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('team-bulls-runtime-state',install);
  window.addEventListener('pageshow',install,{passive:true});

  window.TeamBullsStudentWeeklyReportEntry=Object.freeze({version:VERSION,render:renderCurrent,refresh:()=>refreshCurrent(true),open:openCurrentReport});
})();
