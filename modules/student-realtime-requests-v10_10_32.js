/* Team Bulls v10.10.32 — pedidos e atualizações do aluno em tempo real. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_STUDENT_REALTIME_REQUESTS_10_10_32__)return;
  window.__TEAM_BULLS_STUDENT_REALTIME_REQUESTS_10_10_32__=true;

  const VERSION='10.10.32-realtime1';
  const SEEN_PREFIX='team_bulls_realtime_seen_v1_';
  const MAX_SEEN=240;
  const live={
    uid:'',generation:0,unsubs:[],ready:new Set(),failed:new Set(),
    notifications:[],feedback:[],questionnaires:[],weeklySchedule:null,weeklyCheckins:[],protocol:null
  };
  let badgeObserver=null;
  let wrappedHome=null;

  const currentUser=()=>{try{return typeof CURRENT_USER!=='undefined'?CURRENT_USER:null;}catch(error){return null;}};
  const mode=()=>{try{return typeof MODE!=='undefined'?String(MODE||''):'';}catch(error){return'';}};
  const access=()=>{try{return typeof ACCESS_MODE!=='undefined'?String(ACCESS_MODE||''):'';}catch(error){return'';}};
  const studentUid=()=>String(currentUser()?.role==='student'&&currentUser()?.uid||'');
  const cloudStudent=()=>!!studentUid()&&mode()==='cloud'&&(!access()||access()==='cloud-active')&&typeof db!=='undefined'&&!!db;
  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const stamp=value=>{try{if(value?.toMillis)return value.toMillis();if(value?.toDate)return value.toDate().getTime();if(value?.seconds)return Number(value.seconds)*1000;const ms=new Date(value||0).getTime();return Number.isFinite(ms)?ms:0;}catch(error){return 0;}};
  const todayIso=()=>{try{return typeof today==='function'?today():new Date().toLocaleDateString('sv-SE');}catch(error){return new Date().toLocaleDateString('sv-SE');}};
  const validIso=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
  const formatDate=value=>{const raw=String(value||'');if(validIso(raw)){const [y,m,d]=raw.split('-');return`${d}/${m}/${y}`;}try{return typeof fmt==='function'?fmt(value):raw;}catch(error){return raw;}};

  function readSeen(uid){try{const list=JSON.parse(localStorage.getItem(SEEN_PREFIX+uid)||'[]');return new Set(Array.isArray(list)?list.slice(-MAX_SEEN).map(String):[]);}catch(error){return new Set();}}
  function writeSeen(uid,set){try{localStorage.setItem(SEEN_PREFIX+uid,JSON.stringify([...set].slice(-MAX_SEEN)));}catch(error){}}
  function noticeKey(item){return String(item?.noticeKey||`${item?.source||'item'}:${item?.id||''}`);}
  function toastNew(items){
    const uid=live.uid;if(!uid||typeof showToast!=='function')return;
    const seen=readSeen(uid),fresh=(items||[]).filter(item=>!item.read&&!seen.has(noticeKey(item)));
    if(!fresh.length)return;
    fresh.forEach(item=>seen.add(noticeKey(item)));writeSeen(uid,seen);
    if(fresh.length>1){showToast(`🔔 ${fresh.length} novas solicitações do treinador`);return;}
    const item=fresh[0];
    const message=item.source==='questionnaire'?'🔔 Novo relatório solicitado pelo treinador':item.source==='weekly'?'🔔 Novo relatório semanal/extra solicitado':item.source==='protocol'?'🔔 Atualização de protocolo pendente':item.source==='feedback'?'🔔 Nova mensagem do treinador':`🔔 ${item.title||'Nova notificação'}`;
    showToast(message);
  }

  function weeklyCheckinItems(){return(live.weeklyCheckins||[]).map(doc=>({...doc.data,id:doc.id}));}
  function weeklyRequest(){
    const schedule=live.weeklySchedule;if(!schedule||schedule.enabled===false)return null;
    try{if(typeof computeCheckinRequest==='function')return computeCheckinRequest(schedule,weeklyCheckinItems());}catch(error){}
    const due=String(schedule.nextDueDate||''),extra=String(schedule.extraRequestId||'');
    if(extra)return{kind:'manual',requestId:extra,dueDate:String(schedule.extraRequestedAt||todayIso()),requestKey:'manual:'+extra,pending:true};
    return validIso(due)?{kind:'scheduled',requestId:'',dueDate:due,requestKey:'scheduled:'+due,pending:due<=todayIso()}:null;
  }
  function protocolState(){
    const schedule=live.protocol;if(!schedule)return null;
    try{if(typeof v109ProtocolState==='function')return v109ProtocolState(schedule);}catch(error){}
    return null;
  }

  function compose({includeProtocol=true}={}){
    const items=[];
    live.notifications.forEach(doc=>{const data=doc.data||{};items.push({id:doc.id,noticeKey:'notification:'+doc.id,source:'notification',title:data.title||'Aviso',body:data.body||'',createdAt:data.createdAt,read:!!data.readAt,type:data.type||'aviso'});});
    live.feedback.forEach(doc=>{const data=doc.data||{};items.push({id:doc.id,noticeKey:'feedback:'+doc.id,source:'feedback',title:data.title||'Mensagem do treinador',body:data.message||'',createdAt:data.createdAt,read:!!data.read,type:data.feedbackType||'central'});});
    live.questionnaires.forEach(doc=>{const data=doc.data||{};if(data.answered)return;const mode=String(data.requestMode||'full'),title=String(data.title||'').trim()||(mode==='photos'?'6 fotos solicitadas':mode==='written'?'Relatório escrito solicitado':'Relatório + 6 fotos solicitado');items.push({id:doc.id,noticeKey:'questionnaire:'+doc.id,source:'questionnaire',title,body:mode==='photos'?'Seu treinador solicitou as seis fotos de acompanhamento.':mode==='written'?'Seu treinador solicitou um novo relatório escrito.':'Seu treinador solicitou um novo relatório com seis fotos.',createdAt:data.createdAt,read:false,type:'relatório',action:'questionnaire'});});
    const request=weeklyRequest();
    if(request?.pending){const manual=request.kind==='manual';items.push({id:'weekly-checkin',noticeKey:'weekly:'+String(request.requestKey||request.requestId||request.dueDate),source:'weekly',title:manual?'Relatório extra solicitado':'Relatório semanal pendente',body:manual?'Seu treinador solicitou um relatório extra com as seis fotos obrigatórias.':`Seu relatório semanal de ${formatDate(request.dueDate)} está pendente.`,createdAt:live.weeklySchedule?.updatedAt||live.weeklySchedule?.extraRequestedAt||request.dueDate,read:false,type:'relatório semanal',action:'weekly'});}
    if(includeProtocol){const state=protocolState();if(state?.nextDueDate){items.push({id:'protocol-review',noticeKey:'protocol:'+String(state.pendingCycle||state.elapsedCycle||0)+':'+String(state.nextDueDate),source:'protocol',title:state.pending?'Atualização completa pendente':'Cronograma dos protocolos',body:state.pending?`Sua atualização completa de treino e dieta está pendente desde ${formatDate(state.nextDueDate)}.`:`Próxima atualização completa: ${formatDate(state.nextDueDate)}.`,createdAt:live.protocol?.updatedAt||live.protocol?.createdAt||state.nextDueDate,read:!state.pending,type:'protocolo',action:'protocol'});}}
    return items.sort((a,b)=>stamp(b.createdAt)-stamp(a.createdAt)||String(a.id).localeCompare(String(b.id)));
  }

  function applyBadge(){
    const count=compose({includeProtocol:true}).filter(item=>!item.read).length,badge=document.getElementById('tb-home-notice-count');
    if(badge){const next=count?String(Math.min(count,99)):'';if(badge.textContent!==next)badge.textContent=next;}
    return count;
  }
  function observeBadge(){
    const badge=document.getElementById('tb-home-notice-count');if(!badge||typeof MutationObserver!=='function')return false;
    if(badgeObserver)badgeObserver.disconnect();badgeObserver=new MutationObserver(()=>applyBadge());badgeObserver.observe(badge,{childList:true,characterData:true,subtree:true});return true;
  }

  function applyQuestionnaireCore(){
    if(!live.ready.has('questionnaires'))return false;
    const pending=live.questionnaires.find(doc=>!doc.data?.answered),banner=document.getElementById('quest-banner');
    if(banner){if(pending){banner.dataset.qid=pending.id;banner.style.display='block';}else{banner.dataset.qid='';banner.style.display='none';}}
    return true;
  }
  function applyFeedbackCore(){
    if(!live.ready.has('feedback'))return false;
    const unread=live.feedback.filter(doc=>doc.data?.read!==true).sort((a,b)=>stamp(a.data?.createdAt)-stamp(b.data?.createdAt))[0],banner=document.getElementById('feedback-banner');
    if(unread&&typeof showFeedbackBanner==='function')showFeedbackBanner(unread.id,unread.data);else if(banner){banner.dataset.fid='';banner.style.display='none';}
    return true;
  }
  function applyWeeklyCore(){
    if(!live.ready.has('weeklySchedule')||!live.ready.has('weeklyCheckins'))return false;
    try{
      WEEKLY_CHECKIN_SCHEDULE=live.weeklySchedule?{...live.weeklySchedule,studentId:live.uid}:null;
      WEEKLY_CHECKINS=weeklyCheckinItems().sort((a,b)=>String(b.submittedDate||'').localeCompare(String(a.submittedDate||''))||String(b.id).localeCompare(String(a.id)));
      WEEKLY_CHECKIN_REQUEST=weeklyRequest();WEEKLY_CHECKIN_STATE_UID=live.uid;
      if(typeof renderWeeklyCheckinCard==='function')renderWeeklyCheckinCard();
      if(live.weeklySchedule?.enabled===false){const card=document.getElementById('weekly-checkin-card'),banner=document.getElementById('weekly-checkin-home-banner');if(card)card.style.display='none';if(banner)banner.style.display='none';}
      return true;
    }catch(error){return false;}
  }
  function applyProtocolCore(){
    if(!live.ready.has('protocol'))return false;
    try{V109_PROTOCOL_REVIEW_SCHEDULE=live.protocol;V109_PROTOCOL_REVIEW_STUDENT=live.uid;}catch(error){}
    const state=protocolState(),banner=document.getElementById('protocol-review-home-banner'),label=document.getElementById('protocol-review-home-label'),text=document.getElementById('protocol-review-home-text');
    if(!banner||!state){if(banner)banner.style.display='none';return true;}
    banner.style.display='block';banner.classList.toggle('is-due',!!state.pending);if(label)label.textContent=state.pending?'Atualização completa pendente':'Cronograma dos protocolos';if(text)text.textContent=state.pending?`A atualização completa de treino e dieta está pendente desde ${formatDate(state.nextDueDate)}.`:`Próxima atualização completa em ${formatDate(state.nextDueDate)}.`;return true;
  }
  function syncCore(){applyQuestionnaireCore();applyFeedbackCore();applyWeeklyCore();applyProtocolCore();}

  function renderCenter(){
    const host=document.getElementById('tb-notice-list');if(!host)return;
    const items=compose({includeProtocol:true});
    if(!items.length){host.innerHTML='<div class="tb-notice-empty">Nenhuma notificação no momento.</div>';return;}
    host.innerHTML=items.map(item=>`<article class="tb-notice-card ${item.read?'':'unread'}"><div class="tb-notice-meta">${esc(item.type)}${stamp(item.createdAt)?' · '+esc(new Date(stamp(item.createdAt)).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})):''}</div><strong>${esc(item.title)}</strong><p>${esc(item.body)}</p><div class="tb-notice-actions">${item.action?`<button type="button" data-tb-live-action="${esc(item.action)}" data-tb-live-id="${esc(item.id)}">${item.action==='questionnaire'?'RESPONDER':item.action==='weekly'?'ENVIAR RELATÓRIO':'VER CRONOGRAMA'}</button>`:!item.read&&(item.source==='notification'||item.source==='feedback')?`<button type="button" data-tb-live-action="mark" data-tb-live-source="${esc(item.source)}" data-tb-live-id="${esc(item.id)}">MARCAR COMO LIDA</button>`:''}</div></article>`).join('');
  }

  async function openRealtimeCenter(){
    if(!cloudStudent())return wrappedHome?.openNotifications?.();
    if(!document.getElementById('screen-student-notifications'))return wrappedHome?.openNotifications?.();
    try{if(typeof showScreen==='function')showScreen('screen-student-notifications');}catch(error){}
    renderCenter();applyBadge();return true;
  }
  async function handleCenterAction(action,id,source){
    if(action==='questionnaire'){try{goHome();setTimeout(()=>{try{openAnswerQuestionnaire(id);}catch(error){openMyQuestionnaires?.();}},60);}catch(error){}return;}
    if(action==='weekly'){try{goHome();setTimeout(()=>openWeeklyCheckinModal?.(),60);}catch(error){}return;}
    if(action==='protocol'){try{goHome();setTimeout(()=>openProtocolReviewInfo?.(),60);}catch(error){}return;}
    if(action!=='mark'||!id)return;
    try{
      if(source==='notification')await cloudWrite(db.collection('notifications').doc(id).update({readAt:firebase.firestore.FieldValue.serverTimestamp()}),'marcar notificação como lida');
      else if(source==='feedback')await cloudWrite(db.collection('feedback').doc(id).update({read:true}),'marcar mensagem como lida');
    }catch(error){showToast?.('Não foi possível marcar como lida.',true);}
  }

  function installHomeBridge(){
    const base=window.TeamBullsStudentHome;if(!base||base===wrappedHome||base.__tbRealtimeRequests===true)return !!base;
    wrappedHome=base;window.TeamBullsStudentHome=Object.freeze({...base,__tbRealtimeRequests:true,openNotifications:openRealtimeCenter,realtimeVersion:VERSION});return true;
  }
  function installCoreBridges(){
    if(typeof checkQuestionnaires==='function'&&!checkQuestionnaires.__tbRealtimeRequests){const base=checkQuestionnaires;const wrapped=async function(){if(live.uid===studentUid()&&live.ready.has('questionnaires')){applyQuestionnaireCore();return true;}return base.apply(this,arguments);};wrapped.__tbRealtimeRequests=true;wrapped.__tbBase=base;checkQuestionnaires=wrapped;}
    if(typeof checkFeedback==='function'&&!checkFeedback.__tbRealtimeRequests){const base=checkFeedback;const wrapped=async function(){if(live.uid===studentUid()&&live.ready.has('feedback')){applyFeedbackCore();return true;}return base.apply(this,arguments);};wrapped.__tbRealtimeRequests=true;wrapped.__tbBase=base;checkFeedback=wrapped;}
    if(typeof loadWeeklyCheckinState==='function'&&!loadWeeklyCheckinState.__tbRealtimeRequests){const base=loadWeeklyCheckinState;const wrapped=async function(){if(live.uid===studentUid()&&live.ready.has('weeklySchedule')&&live.ready.has('weeklyCheckins')){applyWeeklyCore();return WEEKLY_CHECKIN_REQUEST;}return base.apply(this,arguments);};wrapped.__tbRealtimeRequests=true;wrapped.__tbBase=base;loadWeeklyCheckinState=wrapped;}
    if(typeof loadStudentProtocolReview==='function'&&!loadStudentProtocolReview.__tbRealtimeRequests){const base=loadStudentProtocolReview;const wrapped=async function(){if(live.uid===studentUid()&&live.ready.has('protocol')){applyProtocolCore();return live.protocol;}return base.apply(this,arguments);};wrapped.__tbRealtimeRequests=true;wrapped.__tbBase=base;loadStudentProtocolReview=wrapped;}
    if(typeof confirmLogout==='function'&&!confirmLogout.__tbRealtimeRequests){const base=confirmLogout;const wrapped=function(){stop();return base.apply(this,arguments);};wrapped.__tbRealtimeRequests=true;wrapped.__tbBase=base;confirmLogout=wrapped;}
  }

  function sourceDocs(snapshot){return snapshot.docs.map(doc=>({id:doc.id,data:doc.data()}));}
  function onSource(name,value,generation){if(generation!==live.generation)return;live[name]=value;live.ready.add(name);live.failed.delete(name);syncCore();const items=compose({includeProtocol:true});applyBadge();if(document.getElementById('screen-student-notifications')?.classList.contains('active'))renderCenter();toastNew(items);}
  function watchQuery(name,query,generation,mapper=sourceDocs){
    const unsubscribe=query.onSnapshot(snapshot=>onSource(name,mapper(snapshot),generation),error=>{if(generation!==live.generation)return;live.failed.add(name);console.warn('[Team Bulls] listener em tempo real indisponível:',name,error?.code||error?.message||error);});live.unsubs.push(unsubscribe);
  }
  function watchDoc(name,reference,generation){
    const unsubscribe=reference.onSnapshot(doc=>onSource(name,doc.exists?doc.data():null,generation),error=>{if(generation!==live.generation)return;live.failed.add(name);console.warn('[Team Bulls] listener em tempo real indisponível:',name,error?.code||error?.message||error);});live.unsubs.push(unsubscribe);
  }

  function stop(){
    live.generation++;for(const unsubscribe of live.unsubs.splice(0)){try{unsubscribe();}catch(error){}}
    live.uid='';live.ready.clear();live.failed.clear();live.notifications=[];live.feedback=[];live.questionnaires=[];live.weeklySchedule=null;live.weeklyCheckins=[];live.protocol=null;
    if(badgeObserver){badgeObserver.disconnect();badgeObserver=null;}
  }
  function start(){
    installHomeBridge();installCoreBridges();
    if(!cloudStudent()){if(live.uid)stop();return false;}
    const uid=studentUid();if(live.uid===uid&&live.unsubs.length){observeBadge();applyBadge();return true;}
    stop();live.uid=uid;const generation=live.generation;
    watchQuery('notifications',db.collection('notifications').where('studentId','==',uid).limit(120),generation);
    watchQuery('feedback',db.collection('feedback').where('studentId','==',uid).limit(80),generation);
    watchQuery('questionnaires',db.collection('questionnaires').where('studentId','==',uid).limit(120),generation);
    watchDoc('weeklySchedule',db.collection('checkinSchedules').doc(uid),generation);
    watchQuery('weeklyCheckins',db.collection('weeklyCheckins').where('studentId','==',uid).limit(520),generation);
    watchDoc('protocol',db.collection('protocolReviewSchedules').doc(uid),generation);
    observeBadge();return true;
  }

  document.addEventListener('click',event=>{const button=event.target.closest?.('[data-tb-live-action]');if(!button)return;event.preventDefault();handleCenterAction(button.dataset.tbLiveAction,button.dataset.tbLiveId,button.dataset.tbLiveSource);},true);
  window.addEventListener('team-bulls-student-runtime-ready',()=>setTimeout(start,0));
  window.addEventListener('team-bulls-runtime-ready',()=>setTimeout(start,0));
  window.addEventListener('team-bulls-runtime-state',()=>setTimeout(start,0));
  window.addEventListener('pageshow',()=>setTimeout(start,0),{passive:true});
  window.addEventListener('online',()=>setTimeout(start,80),{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')setTimeout(start,50);},{passive:true});
  [0,120,500,1400].forEach(delay=>setTimeout(start,delay));

  window.TeamBullsStudentRealtimeRequests=Object.freeze({version:VERSION,start,stop,state:()=>({uid:live.uid,ready:[...live.ready],failed:[...live.failed],pending:compose({includeProtocol:true}).filter(item=>!item.read).length})});
})();