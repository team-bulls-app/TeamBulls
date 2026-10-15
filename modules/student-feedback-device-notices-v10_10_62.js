/* Avisos de feedback no celular: permissão explícita e inscrição privada por aluno. */
'use strict';
(()=>{
  if(window.TeamBullsDeviceNotices)return;
  const VERSION='10.10.62-device-notices1';
  const KEY='team-bulls-push-device';
  let registrationPromise=null,registerPromise=null,foregroundUnsubscribe=null;
  const delivered=new Map(),inFlight=new Set();
  const labels={weekly_report:'Relatório semanal',monthly_full:'Relatório mensal completo',weekly_diet:'Relatório semanal dieta',weekly_training:'Relatório semanal treino',extra:'Feedback extra',protocol_update:'Relatório mensal completo',general:'Feedback extra'};
  const mobile=()=>/Android|iPhone|iPod/i.test(navigator.userAgent)&&matchMedia('(pointer:coarse)').matches;
  const student=()=>CURRENT_USER?.role==='student'&&MODE==='cloud'&&ACCESS_MODE==='cloud-active'&&auth?.currentUser?.uid===CURRENT_USER.uid?String(CURRENT_USER.uid):'';
  const publicKey=()=>String(window.TEAM_BULLS_PUBLIC_CONFIG?.webPushVapidKey||'').trim();
  const title=type=>labels[String(type||'')]||labels.extra;
  const status=message=>{const el=document.getElementById('tb-device-notice-status');if(el)el.textContent=message;};
  const toast=(message,error=false)=>{if(typeof showToast==='function')showToast(message,error);};
  const saved=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null');}catch(error){return null;}};
  const save=value=>{try{if(value)localStorage.setItem(KEY,JSON.stringify(value));else localStorage.removeItem(KEY);}catch(error){}};
  const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
  function available(){return mobile()&&isSecureContext&&'Notification'in window&&'serviceWorker'in navigator;}
  function render(){
    const panel=document.getElementById('tb-device-notice-panel');if(!panel)return;
    panel.hidden=!mobile();if(panel.hidden)return;
    const button=document.getElementById('tb-device-notice-enable');
    if(button)button.hidden=!available()||Notification.permission!=='default';
    if(!available())status('Para receber avisos no iPhone, adicione o app à Tela de Início e abra por esse ícone.');
    else if(Notification.permission==='denied')status('As notificações estão bloqueadas nas configurações do celular.');
    else if(Notification.permission==='granted')status(publicKey()?'Avisos do celular ativados. O som segue as configurações do aparelho.':'Avisos ativados enquanto o app estiver aberto. A entrega com o app fechado aguarda a configuração do serviço.');
    else status('Ative para receber novos feedbacks na barra de notificações do celular.');
  }
  async function pushRegistration(){
    if(registrationPromise)return registrationPromise;
    registrationPromise=navigator.serviceWorker.register('./feedback-push-sw.js',{scope:'./feedback-push/',updateViaCache:'none'}).catch(error=>{registrationPromise=null;throw error;});
    return registrationPromise;
  }
  async function register(){
    const uid=student(),vapidKey=publicKey();
    if(!uid||!available()||Notification.permission!=='granted'||!vapidKey||!db)return false;
    if(registerPromise)return registerPromise;
    registerPromise=(async()=>{
      const loaded=await loadSdkOnce('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js',()=>typeof firebase?.messaging==='function');
      if(!loaded||!await firebase.messaging.isSupported())throw new Error('Este celular não oferece notificações em segundo plano.');
      const registration=await pushRegistration(),messaging=firebase.messaging(),token=await messaging.getToken({vapidKey,serviceWorkerRegistration:registration});
      if(!token||student()!==uid)throw new Error('Não foi possível confirmar o aparelho do aluno.');
      const id=await hash(token),ref=db.collection('pushDevices').doc(uid).collection('tokens').doc(id),existing=await ref.get();
      if(existing.exists)await ref.update({updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
      else await ref.set({token,platform:/iPhone|iPod/i.test(navigator.userAgent)?'ios':'android',createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
      const previous=saved();
      if(previous?.uid===uid&&previous.id&&previous.id!==id)await db.collection('pushDevices').doc(uid).collection('tokens').doc(previous.id).delete().catch(()=>{});
      save({uid,id});
      if(!foregroundUnsubscribe)foregroundUnsubscribe=messaging.onMessage(payload=>{const data=payload?.data||{};if(data.kind==='feedback')notifyFeedback(data.feedbackId,{feedbackType:data.feedbackType});});
      status('Avisos ativados neste celular. O som segue as configurações do aparelho.');return true;
    })().finally(()=>{registerPromise=null;});
    return registerPromise;
  }
  async function enable(){
    if(!available()){render();return;}
    if(!student()){toast('Entre na conta do aluno para ativar avisos.',true);return;}
    try{
      const permission=await Notification.requestPermission();render();
      if(permission!=='granted'){toast('Permissão de notificações não concedida.',true);return;}
      if(publicKey()){await register();toast('✓ Notificações ativadas no celular');}
      else toast('Avisos ativados enquanto o app estiver aberto.');
    }catch(error){console.warn('[Team Bulls] notificações do aparelho',error);status('Não foi possível ativar neste celular. Tente novamente após atualizar o app.');toast('Não foi possível ativar as notificações.',true);}
  }
  async function unregister(){
    foregroundUnsubscribe?.();foregroundUnsubscribe=null;delivered.clear();inFlight.clear();
    const previous=saved();save(null);
    if(!previous?.uid||!previous.id||auth?.currentUser?.uid!==previous.uid||!db)return;
    await db.collection('pushDevices').doc(previous.uid).collection('tokens').doc(previous.id).delete().catch(error=>console.warn('[Team Bulls] remoção do aparelho',error));
    if(typeof firebase!=='undefined'&&typeof firebase.messaging==='function')await firebase.messaging().deleteToken().catch(()=>{});
  }
  async function notifyFeedback(id,data){
    if(!student()||!available()||Notification.permission!=='granted'||!id)return;
    const key=String(id),now=Date.now();if(inFlight.has(key)||now-(delivered.get(key)||0)<600000)return;inFlight.add(key);
    try{
      const reg=await navigator.serviceWorker.ready;
      if(!student())return;
      await reg.showNotification(title(data?.feedbackType),{body:'Você recebeu um novo feedback do treinador.',icon:'./icon-192-v9-8.png',badge:'./icon-192-v9-8.png',tag:'team-bulls-feedback-'+id,renotify:false,data:{url:new URL('./index.html',location.href).href}});
      delivered.set(key,Date.now());if(delivered.size>60)for(const [oldId,at] of delivered)if(Date.now()-at>600000)delivered.delete(oldId);
    }catch(error){console.warn('[Team Bulls] aviso de feedback no aparelho',error);}finally{inFlight.delete(key);}
  }
  function resume(){render();if(student()&&available()&&Notification.permission==='granted'&&publicKey())register().catch(error=>console.warn('[Team Bulls] inscrição de notificações',error));}
  window.TeamBullsDeviceNotices=Object.freeze({version:VERSION,available,enable,register,unregister,notifyFeedback,title,render});
  window.addEventListener('team-bulls-runtime-ready',resume);
  window.addEventListener('team-bulls-runtime-state',resume);
  window.addEventListener('team-bulls-student-runtime-ready',resume);
  window.addEventListener('pageshow',resume);
  resume();
})();
