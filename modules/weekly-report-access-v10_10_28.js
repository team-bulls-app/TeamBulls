/* Team Bulls v10.10.28 — acesso aos relatórios semanais por aluno/plano. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_WEEKLY_REPORT_ACCESS_101028__)return;
  window.__TEAM_BULLS_WEEKLY_REPORT_ACCESS_101028__=true;
  const VERSION='10.10.28-weeklyaccess1';
  const CONTROL_ID='tb-weekly-report-access-control';
  const STYLE_ID='tb-weekly-report-access-style';

  function scheduleEnabled(schedule){return !schedule||schedule.enabled!==false;}
  function trainerSchedule(){try{return typeof TRAINER_CHECKIN_SCHEDULE!=='undefined'?TRAINER_CHECKIN_SCHEDULE:null;}catch(error){return null;}}
  function studentSchedule(){try{return typeof WEEKLY_CHECKIN_SCHEDULE!=='undefined'?WEEKLY_CHECKIN_SCHEDULE:null;}catch(error){return null;}}
  function currentTrainerEnabled(){return scheduleEnabled(trainerSchedule());}
  function currentStudentEnabled(){return scheduleEnabled(studentSchedule());}
  function trainerStudentUid(){try{return String(VIEW_STUDENT?.uid||'');}catch(error){return'';}}
  function iso(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''));}
  function todayIso(){if(typeof today==='function')return today();const d=new Date(),p=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;}
  function addDays(value,days){if(typeof addDaysIso==='function')return addDaysIso(value,days);if(!iso(value))return todayIso();const [y,m,d]=value.split('-').map(Number),date=new Date(y,m-1,d+Number(days||0)),p=n=>String(n).padStart(2,'0');return`${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}`;}
  function toast(message,error=false){if(typeof showToast==='function')showToast(message,error);else if(error)alert(message);}

  function installStyle(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');style.id=STYLE_ID;
    style.textContent=`
      #${CONTROL_ID}{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 14px;margin:10px 0 14px;border:1px solid var(--border-l,#333);border-radius:10px;background:rgba(255,255,255,.018)}
      #${CONTROL_ID} .tb-weekly-access-copy{display:flex;flex-direction:column;gap:4px;min-width:0}
      #${CONTROL_ID} .tb-weekly-access-kicker{font:500 9px 'DM Mono',monospace;letter-spacing:1.2px;color:var(--text-muted,#777)}
      #${CONTROL_ID} .tb-weekly-access-title{font:800 15px 'Barlow Condensed',sans-serif;letter-spacing:.4px;color:var(--text,#eee)}
      #${CONTROL_ID} .tb-weekly-access-help{font:400 11px 'Barlow',sans-serif;line-height:1.35;color:var(--text-dim,#999)}
      #${CONTROL_ID} .tb-weekly-access-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto}
      #${CONTROL_ID} .tb-weekly-access-badge{font:600 9px 'DM Mono',monospace;letter-spacing:.8px;padding:6px 8px;border:1px solid var(--border-l,#333);border-radius:999px;white-space:nowrap}
      #${CONTROL_ID}[data-enabled="true"] .tb-weekly-access-badge{color:#9fd5ad;border-color:rgba(80,180,110,.45)}
      #${CONTROL_ID}[data-enabled="false"] .tb-weekly-access-badge{color:#d8a2a2;border-color:rgba(210,85,85,.45)}
      #trainer-checkin-schedule[data-weekly-access="disabled"] .trainer-checkin-grid{opacity:.48}
      @media(max-width:640px){#${CONTROL_ID}{align-items:stretch;flex-direction:column}#${CONTROL_ID} .tb-weekly-access-actions{justify-content:space-between}#${CONTROL_ID} .tb-weekly-access-actions button{flex:1}}
    `;
    document.head.appendChild(style);
  }

  function ensureTrainerControl(){
    const card=document.getElementById('trainer-checkin-schedule');if(!card)return null;
    let control=document.getElementById(CONTROL_ID);if(control)return control;
    installStyle();
    control=document.createElement('div');control.id=CONTROL_ID;
    const copy=document.createElement('div');copy.className='tb-weekly-access-copy';
    const kicker=document.createElement('span');kicker.className='tb-weekly-access-kicker';kicker.textContent='RECURSO DO PLANO';
    const title=document.createElement('strong');title.className='tb-weekly-access-title';title.textContent='Relatórios semanais';
    const help=document.createElement('span');help.className='tb-weekly-access-help';help.id='tb-weekly-access-help';
    copy.append(kicker,title,help);
    const actions=document.createElement('div');actions.className='tb-weekly-access-actions';
    const badge=document.createElement('span');badge.className='tb-weekly-access-badge';badge.id='tb-weekly-access-badge';
    const button=document.createElement('button');button.type='button';button.className='btn-add-set';button.id='tb-weekly-access-toggle';button.addEventListener('click',toggleWeeklyReportAccess);
    actions.append(badge,button);control.append(copy,actions);
    const head=card.querySelector('.trainer-checkin-head');if(head)head.insertAdjacentElement('afterend',control);else card.prepend(control);
    return control;
  }

  function trainerButtons(){
    const card=document.getElementById('trainer-checkin-schedule');if(!card)return{};
    return{
      save:card.querySelector('button[onclick*="saveTrainerCheckinSchedule"]'),
      extra:card.querySelector('button[onclick*="requestExtraWeeklyCheckin"]'),
      guide:card.querySelector('button[onclick*="openReportGuideManager"]')
    };
  }

  function syncTrainerUi(){
    const card=document.getElementById('trainer-checkin-schedule');if(!card)return;
    const control=ensureTrainerControl(),enabled=currentTrainerEnabled();if(!control)return;
    control.dataset.enabled=String(enabled);card.dataset.weeklyAccess=enabled?'enabled':'disabled';
    const badge=document.getElementById('tb-weekly-access-badge'),button=document.getElementById('tb-weekly-access-toggle'),help=document.getElementById('tb-weekly-access-help');
    if(badge)badge.textContent=enabled?'INCLUÍDO':'NÃO INCLUÍDO';
    if(button){button.textContent=enabled?'DESATIVAR':'ATIVAR';button.setAttribute('aria-pressed',String(enabled));}
    if(help)help.textContent=enabled?'O aluno recebe a programação semanal e pode enviar o relatório com seis fotos.':'O aluno não recebe cobrança, aviso ou ação de relatório semanal. O histórico e relatórios personalizados continuam disponíveis.';
    const date=document.getElementById('trainer-checkin-date'),interval=document.getElementById('trainer-checkin-interval'),buttons=trainerButtons();
    if(date)date.disabled=!enabled;if(interval)interval.disabled=!enabled;if(buttons.save)buttons.save.disabled=!enabled;if(buttons.extra)buttons.extra.disabled=!enabled;if(buttons.guide)buttons.guide.disabled=false;
    if(!enabled){
      const state=document.getElementById('trainer-checkin-state'),coreHelp=document.getElementById('trainer-checkin-help'),cycle=document.getElementById('trainer-cycle-link-note');
      if(state){state.textContent='DESATIVADO';state.className='quest-status';}
      if(coreHelp)coreHelp.textContent='Relatórios semanais estão fora do plano deste aluno. Nenhuma solicitação semanal será criada enquanto o recurso estiver desativado.';
      if(cycle)cycle.textContent='Treino e dieta podem continuar com suas datas normalmente; o alinhamento interno não gera cobrança semanal enquanto este recurso estiver desativado.';
    }
  }

  function nextDateForAccess(nextEnabled,current){
    const selected=String(document.getElementById('trainer-checkin-date')?.value||''),saved=String(current?.nextDueDate||''),now=todayIso();
    if(!nextEnabled)return iso(saved)?saved:iso(selected)?selected:addDays(now,7);
    if(iso(selected)&&selected>=now)return selected;
    if(iso(saved)&&saved>=now)return saved;
    return addDays(now,7);
  }

  async function persistWeeklyReportAccess(nextEnabled){
    const studentUid=trainerStudentUid();
    if(!studentUid||CURRENT_USER?.role!=='trainer'||MODE!=='cloud'||!db)return false;
    if(typeof beginAction==='function'&&!beginAction('weekly-report-access'))return false;
    try{
      const current=trainerSchedule()||{},payload={
        studentId:studentUid,
        enabled:!!nextEnabled,
        nextDueDate:nextDateForAccess(!!nextEnabled,current),
        intervalDays:7,
        extraRequestId:nextEnabled?String(current.extraRequestId||''):'',
        extraRequestedAt:nextEnabled?String(current.extraRequestedAt||''):'',
        updatedBy:CURRENT_USER.uid,
        updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      };
      await cloudWrite(db.collection('checkinSchedules').doc(studentUid).set(payload,{merge:true}),nextEnabled?'ativar relatórios semanais':'desativar relatórios semanais');
      try{if(typeof TRAINER_CHECKIN_SCHEDULE!=='undefined')TRAINER_CHECKIN_SCHEDULE={...current,...payload};}catch(error){}
      if(typeof loadTrainerCheckinSchedule==='function')await loadTrainerCheckinSchedule(studentUid);else syncTrainerUi();
      toast(nextEnabled?'✓ Relatórios semanais ativados para este aluno':'✓ Relatórios semanais desativados para este aluno');
      return true;
    }catch(error){
      const message=typeof cloudWriteError==='function'?cloudWriteError(error,nextEnabled?'ativar os relatórios semanais':'desativar os relatórios semanais'):String(error?.message||error);
      alert(message);return false;
    }finally{if(typeof endAction==='function')endAction('weekly-report-access');}
  }

  function toggleWeeklyReportAccess(){
    if(CURRENT_USER?.role!=='trainer'||!trainerStudentUid())return;
    const nextEnabled=!currentTrainerEnabled();
    const run=()=>persistWeeklyReportAccess(nextEnabled);
    if(!nextEnabled&&typeof showConfirm==='function'){
      showConfirm('Desativar relatórios semanais','Este aluno deixará de receber a cobrança semanal e qualquer solicitação extra semanal pendente será cancelada. Relatórios já enviados e relatórios personalizados serão preservados.',run);
      return;
    }
    run();
  }

  function blockStudentAction(message='Relatórios semanais não estão incluídos no seu plano atual.'){
    const modal=document.getElementById('modal-weekly-checkin');if(modal?.classList.contains('open')&&typeof closeModal==='function')closeModal('modal-weekly-checkin');
    toast(message,true);return false;
  }

  function hasWeeklyAccessGuard(fn){
    for(let depth=0;depth<20&&typeof fn==='function';depth++,fn=fn.__tbBase){if(fn.__tbWeeklyAccess)return true;}
    return false;
  }

  function patchWeeklyRuntime(){
    if(typeof computeCheckinRequest==='function'&&!computeCheckinRequest.__tbWeeklyAccess){
      const base=computeCheckinRequest;const wrapped=function(schedule,checkins){if(schedule?.enabled===false)return null;return base.apply(this,arguments);};wrapped.__tbWeeklyAccess=true;wrapped.__tbBase=base;computeCheckinRequest=wrapped;
    }
    if(typeof renderWeeklyCheckinCard==='function'&&!renderWeeklyCheckinCard.__tbWeeklyAccess){
      const base=renderWeeklyCheckinCard;const wrapped=function(){const result=base.apply(this,arguments);if(studentSchedule()?.enabled===false){const card=document.getElementById('weekly-checkin-card'),banner=document.getElementById('weekly-checkin-home-banner');if(card)card.style.display='none';if(banner)banner.style.display='none';}return result;};wrapped.__tbWeeklyAccess=true;wrapped.__tbBase=base;renderWeeklyCheckinCard=wrapped;
    }
    if(typeof openWeeklyCheckinModal==='function'&&!hasWeeklyAccessGuard(openWeeklyCheckinModal)){
      const base=openWeeklyCheckinModal;const wrapped=function(){if(!currentStudentEnabled())return blockStudentAction();return base.apply(this,arguments);};wrapped.__tbWeeklyAccess=true;wrapped.__tbBase=base;openWeeklyCheckinModal=wrapped;
    }
    if(typeof submitWeeklyCheckin==='function'&&!submitWeeklyCheckin.__tbWeeklyAccess){
      const base=submitWeeklyCheckin;const wrapped=async function(){if(!currentStudentEnabled())return blockStudentAction();return base.apply(this,arguments);};wrapped.__tbWeeklyAccess=true;wrapped.__tbBase=base;submitWeeklyCheckin=wrapped;
    }
    if(typeof loadWeeklyCheckinState==='function'&&!loadWeeklyCheckinState.__tbWeeklyAccess){
      const base=loadWeeklyCheckinState;const wrapped=async function(){const result=await base.apply(this,arguments);if(studentSchedule()?.enabled===false){try{WEEKLY_CHECKIN_REQUEST=null;}catch(error){}renderWeeklyCheckinCard();return null;}return result;};wrapped.__tbWeeklyAccess=true;wrapped.__tbBase=base;loadWeeklyCheckinState=wrapped;
    }
    if(typeof loadTrainerCheckinSchedule==='function'&&!loadTrainerCheckinSchedule.__tbWeeklyAccess){
      const base=loadTrainerCheckinSchedule;const wrapped=async function(){const result=await base.apply(this,arguments);syncTrainerUi();return result;};wrapped.__tbWeeklyAccess=true;wrapped.__tbBase=base;loadTrainerCheckinSchedule=wrapped;
    }
    if(typeof saveTrainerCheckinSchedule==='function'&&!saveTrainerCheckinSchedule.__tbWeeklyAccess){
      const base=saveTrainerCheckinSchedule;const wrapped=async function(){if(!currentTrainerEnabled()){toast('Ative os relatórios semanais antes de salvar uma programação.',true);return false;}return base.apply(this,arguments);};wrapped.__tbWeeklyAccess=true;wrapped.__tbBase=base;saveTrainerCheckinSchedule=wrapped;
    }
    if(typeof requestExtraWeeklyCheckin==='function'&&!requestExtraWeeklyCheckin.__tbWeeklyAccess){
      const base=requestExtraWeeklyCheckin;const wrapped=async function(){if(!currentTrainerEnabled()){toast('Este aluno está com relatórios semanais desativados.',true);return false;}return base.apply(this,arguments);};wrapped.__tbWeeklyAccess=true;wrapped.__tbBase=base;requestExtraWeeklyCheckin=wrapped;
    }
  }

  function install(){patchWeeklyRuntime();syncTrainerUi();}
  install();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('team-bulls-runtime-state',()=>{patchWeeklyRuntime();syncTrainerUi();});
  window.addEventListener('pageshow',()=>{patchWeeklyRuntime();syncTrainerUi();},{passive:true});

  window.TeamBullsWeeklyReportAccess=Object.freeze({version:VERSION,isEnabled:scheduleEnabled,setEnabled:persistWeeklyReportAccess,sync:syncTrainerUi});
})();
