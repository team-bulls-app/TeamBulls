/* Team Bulls v10.10.42 — guarda de contexto canônico para ações do treinador. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_TRAINER_CANONICAL_CONTEXT_GUARD_101042__)return;
  window.__TEAM_BULLS_TRAINER_CANONICAL_CONTEXT_GUARD_101042__=true;

  const VERSION='10.10.42-contextguard2';
  let checkinLoad=null,checkinTarget='';
  let protocolLoad=null,protocolTarget='';
  let generation=0;

  const trainer=()=>{try{return CURRENT_USER?.role==='trainer'&&MODE==='cloud'&&!!VIEW_STUDENT;}catch(error){return false;}};
  const currentStudentId=()=>trainer()?String(VIEW_STUDENT?.uid||''):'';
  const sameGeneration=value=>value===generation;

  function weeklyContextReady(studentId,id=''){
    try{
      if(currentStudentId()!==studentId||typeof WEEKLY_CHECKINS==='undefined'||!Array.isArray(WEEKLY_CHECKINS))return false;
      if(!id)return WEEKLY_CHECKINS.every(item=>!item?.studentId||String(item.studentId)===studentId);
      const item=WEEKLY_CHECKINS.find(entry=>String(entry?.id||'')===String(id));
      return !!item&&(!item.studentId||String(item.studentId)===studentId);
    }catch(error){return false;}
  }

  async function ensureWeeklyCheckinContext(id=''){
    const studentId=currentStudentId(),runGeneration=generation;if(!studentId)return false;
    if(weeklyContextReady(studentId,id))return true;
    try{
      if(checkinLoad){
        await checkinLoad.catch(()=>false);
        if(!sameGeneration(runGeneration)||currentStudentId()!==studentId)return false;
        if(weeklyContextReady(studentId,id))return true;
      }
      if(typeof fetchWeeklyCheckins!=='function')return false;
      checkinTarget=studentId;
      const targetGeneration=generation;
      checkinLoad=Promise.resolve(fetchWeeklyCheckins(studentId)).then(items=>{
        if(!sameGeneration(targetGeneration)||currentStudentId()!==studentId)return false;
        if(typeof WEEKLY_CHECKINS!=='undefined')WEEKLY_CHECKINS=Array.isArray(items)?items:[];
        return true;
      }).catch(error=>{
        console.warn('[Team Bulls] Contexto do relatório semanal não pôde ser sincronizado.',error);
        return false;
      }).finally(()=>{
        if(checkinTarget===studentId){checkinLoad=null;checkinTarget='';}
      });
      await checkinLoad;
      return sameGeneration(runGeneration)&&weeklyContextReady(studentId,id);
    }catch(error){return false;}
  }

  function protocolContextReady(studentId){
    try{return currentStudentId()===studentId&&typeof V109_PROTOCOL_REVIEW_STUDENT!=='undefined'&&String(V109_PROTOCOL_REVIEW_STUDENT||'')===studentId&&typeof V109_PROTOCOL_REVIEW_SCHEDULE!=='undefined'&&!!V109_PROTOCOL_REVIEW_SCHEDULE;}catch(error){return false;}
  }

  async function ensureProtocolContext(){
    const studentId=currentStudentId(),runGeneration=generation;if(!studentId)return false;
    if(protocolContextReady(studentId))return true;
    try{
      /* loadTrainerProtocolReview altera estado global. Nunca iniciamos o aluno B
         enquanto uma sincronização do aluno A ainda pode terminar depois dele. */
      if(protocolLoad){
        await protocolLoad.catch(()=>false);
        if(!sameGeneration(runGeneration)||currentStudentId()!==studentId)return false;
        if(protocolContextReady(studentId))return true;
      }
      if(typeof loadTrainerProtocolReview!=='function')return false;
      protocolTarget=studentId;
      const targetGeneration=generation;
      protocolLoad=Promise.resolve(loadTrainerProtocolReview(studentId)).then(()=>{
        if(!sameGeneration(targetGeneration)||currentStudentId()!==studentId)return false;
        return protocolContextReady(studentId);
      }).catch(error=>{
        console.warn('[Team Bulls] Contexto da atualização completa não pôde ser sincronizado.',error);
        return false;
      }).finally(()=>{
        if(protocolTarget===studentId){protocolLoad=null;protocolTarget='';}
      });
      await protocolLoad;
      return sameGeneration(runGeneration)&&protocolContextReady(studentId);
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
    const wrapped=function(){
      generation++;
      checkinLoad=null;checkinTarget='';protocolLoad=null;protocolTarget='';
      return base.apply(this,arguments);
    };
    wrapped.__tbCanonicalContextGuard=true;wrapped.__tbBase=base;confirmLogout=wrapped;
  }

  function install(){patchWeeklyCheckinView();patchProtocolCompletion();patchLogout();}
  install();
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('team-bulls-runtime-state',install);
  window.addEventListener('pageshow',install,{passive:true});

  window.TeamBullsTrainerCanonicalContextGuard=Object.freeze({version:VERSION,ensureWeeklyCheckinContext,ensureProtocolContext});
})();
