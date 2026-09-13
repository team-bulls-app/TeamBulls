/* Team Bulls v10.10.43 — guarda de contexto canônico para ações do treinador. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_TRAINER_CANONICAL_CONTEXT_GUARD_101042__)return;
  window.__TEAM_BULLS_TRAINER_CANONICAL_CONTEXT_GUARD_101042__=true;
  const VERSION='10.10.43-contextguard2';
  let checkinLoad=null,protocolLoad=null;

  const trainer=()=>{try{return CURRENT_USER?.role==='trainer'&&MODE==='cloud'&&!!VIEW_STUDENT;}catch(error){return false;}};
  const currentStudentId=()=>trainer()?String(VIEW_STUDENT?.uid||''):'';

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
  install();window.addEventListener('team-bulls-runtime-ready',install);window.addEventListener('team-bulls-runtime-state',install);window.addEventListener('pageshow',install,{passive:true});
  window.TeamBullsTrainerCanonicalContextGuard=Object.freeze({version:VERSION,ensureWeeklyCheckinContext,ensureProtocolContext});
})();
