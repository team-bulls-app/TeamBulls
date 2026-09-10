/* Team Bulls v10.10.38 — integridade das ações principais do aluno. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_BUTTON_ACTION_INTEGRITY_101038__)return;
  window.__TEAM_BULLS_BUTTON_ACTION_INTEGRITY_101038__=true;

  const VERSION='10.10.38-buttonintegrity1';
  const WAIT_MS=2600;
  const STEP_MS=60;
  const pending=new WeakSet();

  const studentContext=()=>{
    try{
      if(CURRENT_USER?.role==='trainer'||document.body?.classList.contains('trainer-desktop'))return false;
      return CURRENT_USER?.role==='student'||MODE==='local'||document.body?.classList.contains('student-desktop');
    }catch(error){return false;}
  };
  const toast=(message,error=false)=>{try{if(typeof showToast==='function')showToast(message,error);}catch(e){}};
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

  function releaseStaleInteraction(){
    try{
      const html=document.documentElement;
      if(!html.classList.contains('pull-refresh-running')||window.__TEAM_BULLS_REFRESHING__===true)return false;
      window.TeamBullsBootSafety?.release?.();
      html.classList.remove('pull-refresh-running');
      return true;
    }catch(error){return false;}
  }

  function askRuntimeToFinish(){
    try{window.TeamBullsRuntimeLoader?.retry?.();}catch(error){}
    try{window.TeamBullsRuntimeLoader?.student?.();}catch(error){}
  }

  async function waitForAction(resolveAction){
    let action=null;
    try{action=resolveAction();}catch(error){}
    if(typeof action==='function')return action;
    askRuntimeToFinish();
    const deadline=Date.now()+WAIT_MS;
    while(Date.now()<deadline){
      await sleep(STEP_MS);
      try{action=resolveAction();}catch(error){action=null;}
      if(typeof action==='function')return action;
    }
    return null;
  }

  async function run(button,label,resolveAction,args=[]){
    if(button instanceof HTMLButtonElement&&pending.has(button))return false;
    if(button instanceof HTMLButtonElement){
      pending.add(button);button.setAttribute('aria-busy','true');button.classList.add('tb-button-action-pending');
    }
    try{
      const action=await waitForAction(resolveAction);
      if(typeof action!=='function'){
        toast(`${label} ainda está sendo finalizado. Tente novamente em instantes.`,true);
        return false;
      }
      const result=action(...args);
      if(result&&typeof result.then==='function')await result;
      return result!==false;
    }catch(error){
      console.warn('[Team Bulls] ação de botão não concluída:',label,error);
      toast(`Não foi possível abrir ${label.toLowerCase()} agora.`,true);
      return false;
    }finally{
      if(button instanceof HTMLButtonElement){pending.delete(button);button.removeAttribute('aria-busy');button.classList.remove('tb-button-action-pending');}
    }
  }

  const workoutAction=()=>{
    const api=window.TeamBullsStudentWorkoutLibrary;
    return api&&typeof api.open==='function'?api.open.bind(api):null;
  };
  const weeklyAction=()=>typeof openWeeklyCheckinModal==='function'?openWeeklyCheckinModal:null;
  const reportsAction=()=>typeof openMyQuestionnaires==='function'?openMyQuestionnaires:null;

  function routeWorkout(event,button){
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    run(button,'Treinos',workoutAction);
  }
  function routeWeekly(event,button){
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    run(button,'Relatório semanal',weeklyAction);
  }
  function routeReports(event,button){
    if(typeof openMyQuestionnaires==='function')return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
    run(button,'Relatórios',reportsAction);
  }

  function studentDesktopWorkout(button){
    if(!(button instanceof HTMLButtonElement)||!button.closest('#student-desktop-nav'))return false;
    const text=String(button.textContent||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
    return /\bTREINOS?\b/.test(text);
  }

  function onClick(event){
    if(!studentContext()||!(event.target instanceof Element))return;
    releaseStaleInteraction();
    const button=event.target.closest('button');if(!(button instanceof HTMLButtonElement)||button.disabled)return;
    if(button.matches('.tb-v17-hotbar [data-hotbar="workout"]')||studentDesktopWorkout(button)){routeWorkout(event,button);return;}
    if(button.matches('#weekly-checkin-home-banner button')){routeWeekly(event,button);return;}
    if(button.matches('.tb-v17-hotbar [data-hotbar="reports"]'))routeReports(event,button);
  }

  function heal(){
    if(!studentContext())return false;
    releaseStaleInteraction();
    document.querySelectorAll('.tb-v17-hotbar [data-hotbar="workout"],#weekly-checkin-home-banner button').forEach(button=>{
      if(button instanceof HTMLButtonElement)button.dataset.tbActionIntegrity='1';
    });
    return true;
  }

  document.addEventListener('click',onClick,true);
  window.addEventListener('team-bulls-student-runtime-ready',heal);
  window.addEventListener('team-bulls-runtime-ready',heal);
  window.addEventListener('team-bulls-runtime-state',heal);
  window.addEventListener('pageshow',heal,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')heal();},{passive:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',heal,{once:true});else heal();

  window.TeamBullsButtonActions=Object.freeze({
    version:VERSION,
    workout:button=>run(button||null,'Treinos',workoutAction),
    weeklyReport:button=>run(button||null,'Relatório semanal',weeklyAction),
    reports:button=>run(button||null,'Relatórios',reportsAction),
    heal
  });
})();
