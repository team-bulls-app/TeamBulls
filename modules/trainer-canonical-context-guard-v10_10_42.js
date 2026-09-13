/* Team Bulls v10.10.44 — guarda de contexto canônico para ações do treinador. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_TRAINER_CANONICAL_CONTEXT_GUARD_101042__)return;
  window.__TEAM_BULLS_TRAINER_CANONICAL_CONTEXT_GUARD_101042__=true;
  const VERSION='10.10.44-contextguard3';
  const PROTOCOL_COMPLETED_EVENT='team-bulls-protocol-review-completed';
  let checkinLoad=null,protocolLoad=null;

  const trainer=()=>{try{return CURRENT_USER?.role==='trainer'&&MODE==='cloud'&&!!VIEW_STUDENT;}catch(error){return false;}};
  const currentStudentId=()=>trainer()?String(VIEW_STUDENT?.uid||''):'';
  const completedCycle=()=>{try{return Math.max(0,Math.trunc(Number(V109_PROTOCOL_REVIEW_SCHEDULE?.lastCompletedCycle)||0));}catch(error){return 0;}};

  async function waitDifferentLoad(holder,studentId){
    if(!holder||holder.studentId===studentId)return;
    try{await holder.promise;}catch(error){}
  }

  async function ensureWeeklyCheckinContext(id=''){
    const studentId=currentStudentId();if(!studentId)return false;
    try{
      if(typeof WEEKLY_CHECKINS!=='undefined'&&Array.isArray(WEEKLY_CHECKINS)&&(!id||WEEKLY_CHECKINS.some(item=>String(item.id)===String(id))))return true;
      if(typeof fetchWeeklyCheckins!=='function')return false;
      if(checkinLoad&&checkinLoad.studentId!==studentId){await waitDifferentLoad(checkinLoad,studentId);if(currentStudentId()!==studentId)return false;}
      if(!checkinLoad||checkinLoad.studentId!==studentId){
        const promise=Promise.resolve(fetchWeeklyCheckins(studentId)).then(items=>{
          if(currentStudentId()!==studentId)return false;
          if(typeof WEEKLY_CHECKINS!=='undefined')WEEKLY_CHECKINS=Array.isArray(items)?items:[];
          return true;
        }).catch(error=>{console.warn('[Team Bulls] Contexto do relatório semanal não pôde ser sincronizado.',error);return false;});
        checkinLoad={studentId,promise};
        promise.finally(()=>{if(checkinLoad?.promise===promise)checkinLoad=null;});
      }
      await checkinLoad.promise;
      return currentStudentId()===studentId&&typeof WEEKLY_CHECKINS!=='undefined'&&Array.isArray(WEEKLY_CHECKINS)&&(!id||WEEKLY_CHECKINS.some(item=>String(item.id)===String(id)));
    }catch(error){return false;}
  }

  async function ensureProtocolContext(){
    const studentId=currentStudentId();if(!studentId)return false;
    try{
      if(typeof V109_PROTOCOL_REVIEW_STUDENT!=='undefined'&&String(V109_PROTOCOL_REVIEW_STUDENT||'')===studentId&&typeof V109_PROTOCOL_REVIEW_SCHEDULE!=='undefined'&&V109_PROTOCOL_REVIEW_SCHEDULE)return true;
      if(typeof loadTrainerProtocolReview!=='function')return false;
      if(protocolLoad&&protocolLoad.studentId!==studentId){await waitDifferentLoad(protocolLoad,studentId);if(currentStudentId()!==studentId)return false;}
      if(!protocolLoad||protocolLoad.studentId!==studentId){
        const promise=Promise.resolve(loadTrainerProtocolReview(studentId)).then(()=>currentStudentId()===studentId).catch(error=>{console.warn('[Team Bulls] Contexto da atualização completa não pôde ser sincronizado.',error);return false;});
        protocolLoad={studentId,promise};
        promise.finally(()=>{if(protocolLoad?.promise===promise)protocolLoad=null;});
      }
      const ok=await protocolLoad.promise;
      return !!ok&&currentStudentId()===studentId&&typeof V109_PROTOCOL_REVIEW_STUDENT!=='undefined'&&String(V109_PROTOCOL_REVIEW_STUDENT||'')===studentId;
    }catch(error){return false;}
  }

  function notifyProtocolCompleted(studentId,beforeCycle){
    const activeStudent=String(typeof V109_PROTOCOL_REVIEW_STUDENT!=='undefined'&&V109_PROTOCOL_REVIEW_STUDENT||VIEW_STUDENT?.uid||'');
    const cycle=completedCycle();
    if(!studentId||activeStudent!==studentId||cycle<=beforeCycle)return false;
    window.dispatchEvent(new CustomEvent(PROTOCOL_COMPLETED_EVENT,{detail:{studentId,cycle}}));
    return true;
  }

  function refreshInsightsAfterProtocolCompletion(event){
    const studentId=String(event?.detail?.studentId||'');
    if(!studentId||String(VIEW_STUDENT?.uid||'')!==studentId)return;
    const screen=document.getElementById('screen-trainer-student-insights');
    if(!screen?.classList.contains('active'))return;
    try{window.TeamBullsTrainerIntelligenceData?.invalidateStudent?.(studentId);}catch(error){}
    Promise.resolve(window.TeamBullsTrainerStudentInsights?.refresh?.()).catch(error=>console.warn('[Team Bulls] análise do aluno não pôde ser atualizada após concluir o ciclo.',error));
  }

  function patchWeeklyCheckinView(){
    if(typeof viewWeeklyCheckin!=='function'||viewWeeklyCheckin.__tbCanonicalContextGuard)return;
    const base=viewWeeklyCheckin;
    const wrapped=async function(id){
      if(trainer()){
        const ok=await ensureWeeklyCheckinContext(id);
        if(!ok){if(typeof showToast==='function')showToast('Não foi possível carregar este relatório agora.',true);return;}
      }
      return base.apply(this,arguments);
    };
    wrapped.__tbCanonicalContextGuard=true;wrapped.__tbBase=base;viewWeeklyCheckin=wrapped;
  }

  function patchProtocolCompletion(){
    if(typeof markProtocolReviewCompleted!=='function'||markProtocolReviewCompleted.__tbCanonicalContextGuard)return;
    const base=markProtocolReviewCompleted;
    const wrapped=async function(){
      if(trainer()){
        const ok=await ensureProtocolContext();
        if(!ok){if(typeof showToast==='function')showToast('Não foi possível confirmar o ciclo deste aluno agora.',true);return;}
        const studentId=currentStudentId(),beforeCycle=completedCycle();
        if(studentId&&typeof showConfirm==='function'){
          const originalShowConfirm=showConfirm;
          const intercepted=function(title,text,callback){
            return originalShowConfirm.call(this,title,text,async function(){
              const result=await callback.apply(this,arguments);
              notifyProtocolCompleted(studentId,beforeCycle);
              return result;
            });
          };
          showConfirm=intercepted;
          try{return base.apply(this,arguments);}
          finally{if(showConfirm===intercepted)showConfirm=originalShowConfirm;}
        }
      }
      return base.apply(this,arguments);
    };
    wrapped.__tbCanonicalContextGuard=true;wrapped.__tbBase=base;markProtocolReviewCompleted=wrapped;
  }

  function patchLogout(){
    if(typeof confirmLogout!=='function'||confirmLogout.__tbCanonicalContextGuard)return;
    const base=confirmLogout;
    const wrapped=function(){checkinLoad=null;protocolLoad=null;return base.apply(this,arguments);};
    wrapped.__tbCanonicalContextGuard=true;wrapped.__tbBase=base;confirmLogout=wrapped;
  }

  function install(){patchWeeklyCheckinView();patchProtocolCompletion();patchLogout();}
  install();window.addEventListener('team-bulls-runtime-ready',install);window.addEventListener('team-bulls-runtime-state',install);window.addEventListener('pageshow',install,{passive:true});window.addEventListener(PROTOCOL_COMPLETED_EVENT,refreshInsightsAfterProtocolCompletion);
  window.TeamBullsTrainerCanonicalContextGuard=Object.freeze({version:VERSION,ensureWeeklyCheckinContext,ensureProtocolContext,event:PROTOCOL_COMPLETED_EVENT});
})();
