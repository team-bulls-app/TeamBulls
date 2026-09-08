(()=>{
  'use strict';
  if(window.__TEAM_BULLS_STUDENT_REQUEST_REALTIME_101032__)return;
  window.__TEAM_BULLS_STUDENT_REQUEST_REALTIME_101032__=true;
  const VERSION='10.10.32-studentrealtime1';
  let activeUid='';
  let unsubs=[];
  let authUnsub=null;
  let questionnairePrimed=false,weeklyPrimed=false,protocolPrimed=false,feedbackPrimed=false;
  let lastQuestionnaireId='',lastExtraRequestId='',lastProtocolKey='',lastFeedbackId='';
  let liveSchedule=null,liveCheckins=[],scheduleReady=false,checkinsReady=false;

  const studentCloud=()=>{
    try{return CURRENT_USER?.role==='student'&&CURRENT_USER?.status!=='inactive'&&MODE==='cloud'&&ACCESS_MODE==='cloud-active'&&!!db;}catch(error){return false;}
  };
  const currentUid=()=>{try{return studentCloud()?String(CURRENT_USER?.uid||''):'';}catch(error){return'';}};
  const isCurrent=uid=>!!uid&&uid===currentUid();
  const toast=(message,error=false)=>{try{if(typeof showToast==='function')showToast(message,error);}catch(error){}};
  const createdMs=value=>{try{if(value?.toMillis)return value.toMillis();if(value?.seconds)return Number(value.seconds)*1000;const n=Number(value);return Number.isFinite(n)?n:0;}catch(error){return 0;}};
  const formatDate=value=>{try{return typeof fmt==='function'?fmt(value):String(value||'');}catch(error){return String(value||'');}};
  const todayIso=()=>{try{return typeof today==='function'?today():new Date().toISOString().slice(0,10);}catch(error){return new Date().toISOString().slice(0,10);}};

  function stopFirestore(){
    unsubs.splice(0).forEach(unsub=>{try{unsub?.();}catch(error){}});
    activeUid='';questionnairePrimed=false;weeklyPrimed=false;protocolPrimed=false;feedbackPrimed=false;
    lastQuestionnaireId='';lastExtraRequestId='';lastProtocolKey='';lastFeedbackId='';
    liveSchedule=null;liveCheckins=[];scheduleReady=false;checkinsReady=false;
  }

  function showQuestionnaireSnapshot(snapshot,uid){
    if(!isCurrent(uid))return;
    const pending=snapshot.docs.map(doc=>({...doc.data(),id:doc.id})).filter(item=>item.answered!==true).sort((a,b)=>createdMs(a.createdAt)-createdMs(b.createdAt)||String(a.id).localeCompare(String(b.id)));
    const first=pending[0]||null,banner=document.getElementById('quest-banner');
    if(banner){if(first){banner.dataset.qid=first.id;banner.style.display='block';}else{banner.dataset.qid='';banner.style.display='none';}}
    const nextId=String(first?.id||'');
    if(questionnairePrimed&&nextId&&nextId!==lastQuestionnaireId)toast('Novo relatório solicitado pelo treinador.');
    lastQuestionnaireId=nextId;questionnairePrimed=true;
  }
  function attachQuestionnaires(uid){
    let fallbackUnsub=null;
    const primary=db.collection('questionnaires').where('studentId','==',uid).where('answered','==',false).limit(20);
    const primaryUnsub=primary.onSnapshot(snapshot=>showQuestionnaireSnapshot(snapshot,uid),error=>{
      console.warn('[Team Bulls] listener de relatórios pendentes indisponível, usando consulta compatível',error?.code||error?.message||error);
      if(fallbackUnsub||!isCurrent(uid))return;
      const fallback=db.collection('questionnaires').where('studentId','==',uid).limit(200);
      fallbackUnsub=fallback.onSnapshot(snapshot=>showQuestionnaireSnapshot(snapshot,uid),fallbackError=>console.warn('[Team Bulls] listener compatível de relatórios',fallbackError?.code||fallbackError?.message||fallbackError));
      unsubs.push(()=>{try{fallbackUnsub?.();}catch(e){}});
    });
    unsubs.push(primaryUnsub);
  }

  function applyWeekly(uid){
    if(!isCurrent(uid)||!scheduleReady||!checkinsReady)return;
    try{
      WEEKLY_CHECKIN_SCHEDULE=liveSchedule;
      WEEKLY_CHECKINS=liveCheckins.slice();
      WEEKLY_CHECKIN_REQUEST=liveSchedule?.enabled===false?null:(typeof computeCheckinRequest==='function'?computeCheckinRequest(liveSchedule,liveCheckins):null);
      WEEKLY_CHECKIN_STATE_UID=uid;
      if(typeof renderWeeklyCheckinCard==='function')renderWeeklyCheckinCard();
    }catch(error){console.warn('[Team Bulls] não foi possível atualizar relatório semanal em tempo real',error);}
    const extraId=String(liveSchedule?.extraRequestId||'');
    if(weeklyPrimed&&extraId&&extraId!==lastExtraRequestId)toast('Seu treinador solicitou um relatório semanal extra.');
    lastExtraRequestId=extraId;weeklyPrimed=true;
  }
  function attachWeekly(uid){
    const scheduleUnsub=db.collection('checkinSchedules').doc(uid).onSnapshot(doc=>{
      if(!isCurrent(uid))return;
      liveSchedule=doc.exists?{...doc.data(),studentId:uid}:null;scheduleReady=true;applyWeekly(uid);
    },error=>console.warn('[Team Bulls] listener da programação semanal',error?.code||error?.message||error));
    const checkinsUnsub=db.collection('weeklyCheckins').where('studentId','==',uid).onSnapshot(snapshot=>{
      if(!isCurrent(uid))return;
      liveCheckins=snapshot.docs.map(doc=>({...doc.data(),id:doc.id})).sort((a,b)=>String(b.submittedDate||'').localeCompare(String(a.submittedDate||''))||String(b.id).localeCompare(String(a.id)));
      checkinsReady=true;applyWeekly(uid);
    },error=>{
      console.warn('[Team Bulls] listener do histórico semanal',error?.code||error?.message||error);
      if(isCurrent(uid)&&typeof loadWeeklyCheckinState==='function')loadWeeklyCheckinState(true).catch(()=>{});
    });
    unsubs.push(scheduleUnsub,checkinsUnsub);
  }

  function renderProtocol(schedule,uid){
    if(!isCurrent(uid))return;
    try{
      V109_PROTOCOL_REVIEW_SCHEDULE=schedule;
      V109_PROTOCOL_REVIEW_STUDENT=uid;
      const state=typeof v109ProtocolState==='function'?v109ProtocolState(schedule):null;
      const banner=document.getElementById('protocol-review-home-banner'),label=document.getElementById('protocol-review-home-label'),text=document.getElementById('protocol-review-home-text');
      if(!banner||!state){if(banner)banner.style.display='none';return;}
      banner.style.display='block';banner.classList.toggle('is-due',!!state.pending);
      if(label)label.textContent=state.pending?'Atualização completa pendente':'Cronograma dos protocolos';
      if(text)text.textContent=state.pending?`A atualização completa de treino e dieta está pendente desde ${formatDate(state.nextDueDate)}. Relatórios e ajustes semanais não alteram esse ciclo.`:`${state.weekNumber?`Semana ${state.weekNumber} do protocolo.`:'O protocolo ainda não começou.'} Próxima atualização completa em ${formatDate(state.nextDueDate)}, a cada ${state.intervalWeeks} semanas.`;
      const key=[schedule?.startDate||'',schedule?.intervalWeeks||'',schedule?.lastCompletedCycle||0,state.nextDueDate||'',state.pending?'1':'0'].join('|');
      if(protocolPrimed&&state.pending&&key!==lastProtocolKey)toast('Há uma atualização completa de treino e dieta pendente.');
      lastProtocolKey=key;protocolPrimed=true;
    }catch(error){console.warn('[Team Bulls] atualização de protocolo em tempo real',error);}
  }
  function attachProtocol(uid){
    const unsub=db.collection('protocolReviewSchedules').doc(uid).onSnapshot(doc=>{
      const schedule=doc.exists?{...doc.data(),studentId:uid,_exists:true}:null;renderProtocol(schedule,uid);
    },error=>console.warn('[Team Bulls] listener da atualização de protocolo',error?.code||error?.message||error));
    unsubs.push(unsub);
  }

  function showFeedbackSnapshot(snapshot,uid){
    if(!isCurrent(uid))return;
    const unread=snapshot.docs.map(doc=>({...doc.data(),id:doc.id})).filter(item=>item.read!==true).sort((a,b)=>createdMs(a.createdAt)-createdMs(b.createdAt)||String(a.id).localeCompare(String(b.id)));
    const first=unread[0]||null,banner=document.getElementById('feedback-banner');
    if(first&&typeof showFeedbackBanner==='function')showFeedbackBanner(first.id,first);
    else if(banner){banner.style.display='none';banner.dataset.fid='';}
    const nextId=String(first?.id||'');
    if(feedbackPrimed&&nextId&&nextId!==lastFeedbackId)toast('Nova mensagem do treinador recebida.');
    lastFeedbackId=nextId;feedbackPrimed=true;
  }
  function attachFeedback(uid){
    let fallbackUnsub=null;
    const primary=db.collection('feedback').where('studentId','==',uid).where('read','==',false).limit(20);
    const primaryUnsub=primary.onSnapshot(snapshot=>showFeedbackSnapshot(snapshot,uid),error=>{
      console.warn('[Team Bulls] listener de feedback pendente indisponível, usando consulta compatível',error?.code||error?.message||error);
      if(fallbackUnsub||!isCurrent(uid))return;
      const fallback=db.collection('feedback').where('studentId','==',uid).limit(200);
      fallbackUnsub=fallback.onSnapshot(snapshot=>showFeedbackSnapshot(snapshot,uid),fallbackError=>console.warn('[Team Bulls] listener compatível de feedback',fallbackError?.code||fallbackError?.message||fallbackError));
      unsubs.push(()=>{try{fallbackUnsub?.();}catch(e){}});
    });
    unsubs.push(primaryUnsub);
  }

  function start(){
    const uid=currentUid();if(!uid)return false;
    if(activeUid===uid&&unsubs.length)return true;
    stopFirestore();activeUid=uid;
    try{attachQuestionnaires(uid);attachWeekly(uid);attachProtocol(uid);attachFeedback(uid);return true;}
    catch(error){console.warn('[Team Bulls] sincronização em tempo real não iniciada',error);stopFirestore();return false;}
  }
  function sync(){
    const uid=currentUid();
    if(!uid){stopFirestore();return false;}
    return start();
  }

  function installAuthLifecycle(){
    if(authUnsub||typeof firebase==='undefined'||typeof firebase.auth!=='function')return;
    try{authUnsub=firebase.auth().onAuthStateChanged(user=>{if(!user){stopFirestore();return;}setTimeout(sync,0);});}catch(error){}
  }
  function installLogoutGuard(){
    try{
      if(typeof confirmLogout!=='function'||confirmLogout.__tbStudentRealtimeStop)return;
      const base=confirmLogout;const wrapped=function(){stopFirestore();return base.apply(this,arguments);};wrapped.__tbStudentRealtimeStop=true;wrapped.__tbBase=base;confirmLogout=wrapped;
    }catch(error){}
  }
  function install(){installAuthLifecycle();installLogoutGuard();sync();}

  install();
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('team-bulls-runtime-state',install);
  window.addEventListener('online',install,{passive:true});
  window.addEventListener('pageshow',install,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')install();});

  window.TeamBullsStudentRequestRealtime=Object.freeze({version:VERSION,start,stop:stopFirestore,sync,status:()=>({uid:activeUid,listeners:unsubs.length,cloud:studentCloud()})});
})();
