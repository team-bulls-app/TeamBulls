(()=>{
  'use strict';
  if(window.__TEAM_BULLS_STUDENT_REQUEST_REALTIME_101032__)return;
  window.__TEAM_BULLS_STUDENT_REQUEST_REALTIME_101032__=true;
  const VERSION='10.10.32-studentrealtime5';
  const MAX_DUE_TIMER_MS=2000000000;
  let activeUid='';
  let unsubs=[];
  let authUnsub=null;
  let badgeObserver=null,badgeTarget=null,badgeWriting=false,centerRefreshTimer=0,dueTimer=0;
  let questionnairePrimed=false,weeklyPrimed=false,protocolPrimed=false,feedbackPrimed=false,notificationPrimed=false;
  let lastQuestionnaireSignature='',lastWeeklySignature='',lastProtocolKey='',lastFeedbackSignature='',lastNotificationSignature='';
  let liveSchedule=null,liveCheckins=[],scheduleReady=false,checkinsReady=false,liveProtocolSchedule=null;
  let weeklyFutureDue='',protocolFutureDue='',questionnaireSnapshot=null;
  const counts={questionnaires:0,weekly:0,protocol:0,feedback:0,notifications:0};

  const studentCloud=()=>{
    try{return CURRENT_USER?.role==='student'&&CURRENT_USER?.status!=='inactive'&&MODE==='cloud'&&ACCESS_MODE==='cloud-active'&&!!db;}catch(error){return false;}
  };
  const currentUid=()=>{try{return studentCloud()?String(CURRENT_USER?.uid||''):'';}catch(error){return'';}};
  const isCurrent=uid=>!!uid&&uid===currentUid();
  const toast=(message,error=false)=>{try{if(typeof showToast==='function')showToast(message,error);}catch(error){}};
  const createdMs=value=>{try{if(value?.toMillis)return value.toMillis();if(value?.seconds)return Number(value.seconds)*1000;const n=Number(value);return Number.isFinite(n)?n:0;}catch(error){return 0;}};
  const formatDate=value=>{try{return typeof fmt==='function'?fmt(value):String(value||'');}catch(error){return String(value||'');}};
  const validIso=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
  const localMidnightMs=value=>{if(!validIso(value))return 0;const [y,m,d]=String(value).split('-').map(Number);const ms=new Date(y,m-1,d,0,0,0,0).getTime();return Number.isFinite(ms)?ms:0;};

  const listeners=[],RETRY_DELAYS=[5000,10000,20000];
  const fallbackAllowed=error=>/failed-precondition|unimplemented|invalid-argument/.test(String(error?.code||''));
  const transientError=error=>/unavailable|deadline-exceeded|aborted|resource-exhausted|internal|network-request-failed/.test(String(error?.code||''));
  function listen(key,uid,reference,next,fallback){
    const slot={key,uid,unsubscribe:null,timer:0,attempts:0,serial:0,failed:true,terminal:false,handled:false,stopped:false};listeners.push(slot);
    const current=serial=>!slot.stopped&&listeners.includes(slot)&&slot.serial===serial&&activeUid===uid&&isCurrent(uid);
    const cancelTimer=()=>{clearTimeout(slot.timer);slot.timer=0;};
    function connect(){
      if(slot.stopped||slot.handled||slot.terminal||slot.unsubscribe||slot.timer||!isCurrent(uid)||document.hidden||navigator.onLine===false)return;
      const serial=++slot.serial;slot.failed=false;let failedSynchronously=false;
      const failed=error=>{
        if(!current(serial)||slot.failed)return;failedSynchronously=true;slot.failed=true;
        const release=slot.unsubscribe;slot.unsubscribe=null;try{release?.();}catch{}
        console.warn('[Team Bulls] listener '+key+' indisponível',error?.code||error?.message||error);
        if(fallback&&fallbackAllowed(error)){slot.handled=true;fallback(error);return;}
        slot.terminal=!transientError(error);
        if(slot.terminal||slot.attempts>=RETRY_DELAYS.length||document.hidden||navigator.onLine===false)return;
        const delay=RETRY_DELAYS[slot.attempts++];slot.timer=setTimeout(()=>{slot.timer=0;connect();},delay);
      };
      try{
        const release=reference.onSnapshot(snapshot=>{if(!current(serial)||slot.failed)return;if(snapshot.metadata?.fromCache!==true)slot.attempts=0;next(snapshot);},failed);
        if(failedSynchronously||!current(serial)){try{release?.();}catch{}}else slot.unsubscribe=release;
      }catch(error){failed(error);}
    }
    slot.resume=(reset=false)=>{if(!slot.failed||slot.handled)return;if(reset&&!slot.terminal){cancelTimer();slot.attempts=0;}if(slot.attempts<RETRY_DELAYS.length)connect();};
    slot.pause=cancelTimer;
    const stop=()=>{slot.stopped=true;slot.serial++;cancelTimer();const release=slot.unsubscribe;slot.unsubscribe=null;try{release?.();}catch{}const index=listeners.indexOf(slot);if(index>=0)listeners.splice(index,1);};
    connect();return stop;
  }
  function resumeFailed(reset=false){for(const slot of [...listeners])slot.resume(reset);}

  function realtimeCount(){return Object.values(counts).reduce((sum,value)=>sum+Math.max(0,Number(value)||0),0);}
  function applyBadge(){
    const badge=document.getElementById('tb-home-notice-count');if(!badge)return false;
    const total=Math.min(99,realtimeCount()),next=total?String(total):'';
    if(badge.textContent!==next){badgeWriting=true;badge.textContent=next;badgeWriting=false;}
    if(badgeTarget!==badge&&typeof MutationObserver==='function'){
      try{badgeObserver?.disconnect();}catch(error){}
      badgeTarget=badge;badgeObserver=new MutationObserver(()=>{if(!badgeWriting)queueMicrotask(applyBadge);});
      badgeObserver.observe(badge,{subtree:true,childList:true,characterData:true});
    }
    return true;
  }
  function updateBadge(){if(!applyBadge())setTimeout(applyBadge,120);}
  function refreshOpenCenter(){
    const refresh=window.TeamBullsStudentHome?.refreshOpenNotifications;
    try{if(document.querySelector('.screen.active')?.id!=='screen-student-notifications'||typeof refresh!=='function')return;}
    catch(error){return;}
    clearTimeout(centerRefreshTimer);centerRefreshTimer=setTimeout(()=>{Promise.resolve(window.TeamBullsStudentHome?.refreshOpenNotifications?.()).catch(()=>{});},140);
  }

  function changedAfterPrime(primed,previous,next){return primed&&previous!==next;}

  function scheduleDueBoundary(){
    clearTimeout(dueTimer);dueTimer=0;
    if(!activeUid||!isCurrent(activeUid))return;
    const now=Date.now(),candidates=[weeklyFutureDue,protocolFutureDue].map(localMidnightMs).filter(ms=>ms>now+250);
    if(!candidates.length)return;
    const delay=Math.min(MAX_DUE_TIMER_MS,Math.max(500,Math.min(...candidates)-now+900));
    dueTimer=setTimeout(()=>{dueTimer=0;recomputeDueStates('timer');},delay);
  }
  function recomputeDueStates(reason='runtime'){
    const uid=currentUid();if(!uid||uid!==activeUid)return false;
    if(scheduleReady&&checkinsReady)applyWeekly(uid);
    if(liveProtocolSchedule)renderProtocol(liveProtocolSchedule,uid);
    if(questionnaireSnapshot)showQuestionnaireSnapshot(questionnaireSnapshot,uid);
    try{window.TeamBullsStudentHomeFastProtocolDate?.sync?.();}catch(error){}
    updateBadge();scheduleDueBoundary();
    return true;
  }

  function stopFirestore(){
    unsubs.splice(0).forEach(unsub=>{try{unsub?.();}catch(error){}});
    activeUid='';questionnairePrimed=false;weeklyPrimed=false;protocolPrimed=false;feedbackPrimed=false;notificationPrimed=false;
    lastQuestionnaireSignature='';lastWeeklySignature='';lastProtocolKey='';lastFeedbackSignature='';lastNotificationSignature='';
    questionnaireSnapshot=null;
    liveSchedule=null;liveCheckins=[];scheduleReady=false;checkinsReady=false;liveProtocolSchedule=null;weeklyFutureDue='';protocolFutureDue='';
    Object.keys(counts).forEach(key=>{counts[key]=0;});
    clearTimeout(centerRefreshTimer);clearTimeout(dueTimer);dueTimer=0;
    try{badgeObserver?.disconnect();}catch(error){}badgeObserver=null;badgeTarget=null;updateBadge();
  }

  function showQuestionnaireSnapshot(snapshot,uid){
    if(!isCurrent(uid))return;
    questionnaireSnapshot=snapshot;
    const pending=snapshot.docs.map(doc=>({...doc.data(),id:doc.id})).filter(item=>item.answered!==true&&!item.cancelledAt&&(item.reportType!=='monthly'||window.TeamBullsMonthlyReports?.status(item)==='pending')).sort((a,b)=>createdMs(a.createdAt)-createdMs(b.createdAt)||String(a.id).localeCompare(String(b.id)));
    const first=pending[0]||null,banner=document.getElementById('quest-banner');
    if(banner){if(first){banner.dataset.qid=first.id;banner.style.display='block';}else{banner.dataset.qid='';banner.style.display='none';}}
    const signature=pending.map(item=>item.id).join('|'),changed=changedAfterPrime(questionnairePrimed,lastQuestionnaireSignature,signature);
    if(changed&&pending.length>counts.questionnaires)toast('Novo relatório solicitado pelo treinador.');
    counts.questionnaires=pending.length;lastQuestionnaireSignature=signature;questionnairePrimed=true;updateBadge();if(changed){refreshOpenCenter();window.TeamBullsMonthlyReports?.refreshVisibleReports(uid);}
  }
  function attachQuestionnaires(uid){
    let fallbackUnsub=null;
    const primary=db.collection('questionnaires').where('studentId','==',uid).where('answered','==',false);
    const primaryUnsub=listen('questionnaires',uid,primary,snapshot=>showQuestionnaireSnapshot(snapshot,uid),error=>{
      console.warn('[Team Bulls] listener de relatórios pendentes indisponível, usando consulta compatível',error?.code||error?.message||error);
      if(fallbackUnsub||!isCurrent(uid))return;
      const fallback=db.collection('questionnaires').where('studentId','==',uid);
      fallbackUnsub=listen('questionnaires-fallback',uid,fallback,snapshot=>showQuestionnaireSnapshot(snapshot,uid));
      unsubs.push(()=>{try{fallbackUnsub?.();}catch(e){}});
    });
    unsubs.push(primaryUnsub);
  }

  function applyWeekly(uid){
    if(!isCurrent(uid)||!scheduleReady||!checkinsReady)return;
    let request=null;
    try{
      WEEKLY_CHECKIN_SCHEDULE=liveSchedule;
      WEEKLY_CHECKINS=window.TeamBullsWeeklyReportIntegrity?.dedupe?.(liveCheckins)||liveCheckins.slice();
      request=liveSchedule?.enabled===false?null:(typeof computeCheckinRequest==='function'?computeCheckinRequest(liveSchedule,liveCheckins):null);
      WEEKLY_CHECKIN_REQUEST=request;WEEKLY_CHECKIN_STATE_UID=uid;
      if(typeof renderWeeklyCheckinCard==='function')renderWeeklyCheckinCard();
    }catch(error){console.warn('[Team Bulls] não foi possível atualizar relatório semanal em tempo real',error);}
    const signature=request?[request.kind||'',request.requestKey||'',request.dueDate||'',request.pending?'1':'0'].join('|'):'';
    const changed=changedAfterPrime(weeklyPrimed,lastWeeklySignature,signature),nextCount=request?.pending?1:0;
    if(changed&&nextCount>counts.weekly)toast(request?.kind==='manual'?'Seu treinador solicitou um relatório semanal extra.':'Seu relatório semanal está pendente.');
    counts.weekly=nextCount;lastWeeklySignature=signature;weeklyPrimed=true;
    weeklyFutureDue=request&&!request.pending&&validIso(request.dueDate)?String(request.dueDate):'';
    updateBadge();scheduleDueBoundary();if(changed)refreshOpenCenter();
  }
  function attachWeekly(uid){
    const scheduleUnsub=listen('weekly-schedule',uid,db.collection('checkinSchedules').doc(uid),doc=>{
      if(!isCurrent(uid))return;
      liveSchedule=doc.exists?{...doc.data(),studentId:uid}:null;scheduleReady=true;applyWeekly(uid);
    });
    const checkinsUnsub=listen('weekly-checkins',uid,db.collection('weeklyCheckins').where('studentId','==',uid),snapshot=>{
      if(!isCurrent(uid))return;
      liveCheckins=snapshot.docs.map(doc=>({...doc.data(),id:doc.id})).sort((a,b)=>String(b.submittedDate||'').localeCompare(String(a.submittedDate||''))||String(b.id).localeCompare(String(a.id)));
      checkinsReady=true;applyWeekly(uid);
    });
    unsubs.push(scheduleUnsub,checkinsUnsub);
  }

  function renderProtocol(schedule,uid){
    if(!isCurrent(uid))return;
    liveProtocolSchedule=schedule;
    window.TeamBullsMonthlyReports?.remember(uid,schedule);
    if(questionnaireSnapshot)showQuestionnaireSnapshot(questionnaireSnapshot,uid);
    if(document.querySelector('.screen.active')?.id==='screen-my-quest'&&typeof MY_QUEST_CACHE!=='undefined')renderQuestList(MY_QUEST_CACHE,'my-quest-list','my-quest-empty',false);
    try{
      V109_PROTOCOL_REVIEW_SCHEDULE=schedule;V109_PROTOCOL_REVIEW_STUDENT=uid;
      const state=typeof v109ProtocolState==='function'?v109ProtocolState(schedule):null;
      protocolFutureDue=state&&!state.pending&&validIso(state.nextDueDate)?String(state.nextDueDate):'';
      const monthlyDue=window.TeamBullsMonthlyReports?.cycle(schedule)?.dueDate;
      if(validIso(monthlyDue)&&monthlyDue>today())protocolFutureDue=monthlyDue;
      const banner=document.getElementById('protocol-review-home-banner'),label=document.getElementById('protocol-review-home-label'),text=document.getElementById('protocol-review-home-text');
      if(!banner||!state){if(banner)banner.style.display='none';counts.protocol=0;updateBadge();scheduleDueBoundary();return;}
      banner.style.display='block';banner.classList.toggle('is-due',!!state.pending);
      if(label)label.textContent=state.pending?'Atualização completa pendente':'Cronograma dos protocolos';
      if(text)text.textContent=state.pending?`A atualização completa de treino e dieta está pendente desde ${formatDate(state.nextDueDate)}. Relatórios e ajustes semanais não alteram esse ciclo.`:`${state.weekNumber?`Semana ${state.weekNumber} do protocolo.`:'O protocolo ainda não começou.'} Próxima atualização completa em ${formatDate(state.nextDueDate)}, a cada ${state.intervalWeeks} semanas.`;
      const key=[schedule?.startDate||'',schedule?.intervalWeeks||'',schedule?.lastCompletedCycle||0,state.nextDueDate||'',state.pending?'1':'0'].join('|'),changed=changedAfterPrime(protocolPrimed,lastProtocolKey,key),nextCount=0 /* revisão administrativa não é uma resposta devida pelo aluno */;
      if(changed&&nextCount>counts.protocol)toast('Há uma atualização completa de treino e dieta pendente.');
      counts.protocol=nextCount;lastProtocolKey=key;protocolPrimed=true;updateBadge();scheduleDueBoundary();if(changed)refreshOpenCenter();
    }catch(error){console.warn('[Team Bulls] atualização de protocolo em tempo real',error);}
  }
  function attachProtocol(uid){
    const unsub=listen('protocol',uid,db.collection('protocolReviewSchedules').doc(uid),doc=>{
      const schedule=doc.exists?{...doc.data(),studentId:uid,_exists:true}:null;renderProtocol(schedule,uid);
    });
    unsubs.push(unsub);
  }

  function showFeedbackSnapshot(snapshot,uid){
    if(!isCurrent(uid))return;
    const unread=snapshot.docs.map(doc=>({...doc.data(),id:doc.id})).filter(item=>item.read!==true).sort((a,b)=>createdMs(a.createdAt)-createdMs(b.createdAt)||String(a.id).localeCompare(String(b.id)));
    const first=unread[0]||null,banner=document.getElementById('feedback-banner');
    if(first&&typeof showFeedbackBanner==='function')showFeedbackBanner(first.id,first);else if(banner){banner.style.display='none';banner.dataset.fid='';}
    const signature=unread.map(item=>item.id).join('|'),changed=changedAfterPrime(feedbackPrimed,lastFeedbackSignature,signature);
    if(changed){
      const previous=new Set(lastFeedbackSignature.split('|').filter(Boolean)),fresh=unread.filter(item=>!previous.has(item.id));
      if(fresh.length){toast('Novo feedback do treinador recebido.');fresh.forEach(item=>window.TeamBullsDeviceNotices?.notifyFeedback?.(item.id,item));}
    }
    counts.feedback=unread.length;lastFeedbackSignature=signature;feedbackPrimed=true;updateBadge();if(changed)refreshOpenCenter();
  }
  function attachFeedback(uid){
    let fallbackUnsub=null;
    const primary=db.collection('feedback').where('studentId','==',uid).where('read','==',false).limit(20);
    const primaryUnsub=listen('feedback',uid,primary,snapshot=>showFeedbackSnapshot(snapshot,uid),error=>{
      console.warn('[Team Bulls] listener de feedback pendente indisponível, usando consulta compatível',error?.code||error?.message||error);
      if(fallbackUnsub||!isCurrent(uid))return;
      const fallback=db.collection('feedback').where('studentId','==',uid).limit(200);
      fallbackUnsub=listen('feedback-fallback',uid,fallback,snapshot=>showFeedbackSnapshot(snapshot,uid));
      unsubs.push(()=>{try{fallbackUnsub?.();}catch(e){}});
    });
    unsubs.push(primaryUnsub);
  }

  function showNotificationSnapshot(snapshot,uid){
    if(!isCurrent(uid))return;
    const unread=snapshot.docs.map(doc=>({...doc.data(),id:doc.id})).filter(item=>!item.readAt).sort((a,b)=>createdMs(a.createdAt)-createdMs(b.createdAt)||String(a.id).localeCompare(String(b.id)));
    const signature=unread.map(item=>item.id).join('|'),changed=changedAfterPrime(notificationPrimed,lastNotificationSignature,signature);
    if(changed&&unread.length>counts.notifications)toast('Nova notificação do treinador recebida.');
    counts.notifications=unread.length;lastNotificationSignature=signature;notificationPrimed=true;updateBadge();if(changed)refreshOpenCenter();
  }
  function attachNotifications(uid){
    const unsub=listen('notifications',uid,db.collection('notifications').where('studentId','==',uid).limit(120),snapshot=>showNotificationSnapshot(snapshot,uid));
    unsubs.push(unsub);
  }

  function start(){
    const uid=currentUid();if(!uid)return false;
    if(activeUid===uid&&unsubs.length){resumeFailed();recomputeDueStates('resume');return true;}
    stopFirestore();activeUid=uid;
    try{attachQuestionnaires(uid);attachWeekly(uid);attachProtocol(uid);attachFeedback(uid);attachNotifications(uid);return true;}
    catch(error){console.warn('[Team Bulls] sincronização em tempo real não iniciada',error);stopFirestore();return false;}
  }
  function sync(){const uid=currentUid();if(!uid){stopFirestore();return false;}return start();}

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
  function install(){installAuthLifecycle();installLogoutGuard();sync();updateBadge();scheduleDueBoundary();}

  install();
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('team-bulls-runtime-state',install);
  window.addEventListener('team-bulls-student-runtime-ready',install);
  window.addEventListener('team-bulls-intelligence-ready',install);
  window.addEventListener('online',()=>{resumeFailed(true);install();},{passive:true});
  window.addEventListener('pageshow',()=>{resumeFailed(true);install();},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){resumeFailed(true);install();}else listeners.forEach(slot=>slot.pause());});

  window.TeamBullsStudentRequestRealtime=Object.freeze({version:VERSION,start,stop:stopFirestore,sync,recompute:recomputeDueStates,status:()=>({uid:activeUid,listeners:listeners.filter(slot=>!!slot.unsubscribe).length,failedListeners:listeners.filter(slot=>slot.failed).length,cloud:studentCloud(),counts:{...counts},total:realtimeCount(),weeklyFutureDue,protocolFutureDue})});
})();
