/* Avisos de feedback no celular: permissão explícita e inscrição privada por aluno. */
'use strict';
(()=>{
  if(window.TeamBullsDeviceNotices)return;
  const VERSION='10.10.62-device-notices2';
  const KEY='team-bulls-push-device';
  const disabledKey=uid=>`team-bulls-push-disabled:${uid}`;
  const pendingKey=uid=>`team-bulls-push-disable-pending:${uid}`;
  let registrationPromise=null,registerPromise=null,disablePromise=null,foregroundUnsubscribe=null;
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
  const optedOut=uid=>{try{return localStorage.getItem(disabledKey(uid))==='1';}catch(error){return false;}};
  const setOptedOut=(uid,value)=>{try{if(value)localStorage.setItem(disabledKey(uid),'1');else localStorage.removeItem(disabledKey(uid));return true;}catch(error){return false;}};
  const disablePending=uid=>{try{return localStorage.getItem(pendingKey(uid))==='1';}catch(error){return false;}};
  const setDisablePending=(uid,value)=>{try{if(value)localStorage.setItem(pendingKey(uid),'1');else localStorage.removeItem(pendingKey(uid));return true;}catch(error){return false;}};
  const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(byte=>byte.toString(16).padStart(2,'0')).join('');
  function available(){return mobile()&&isSecureContext&&'Notification'in window&&'serviceWorker'in navigator;}
  function render(){
    const panel=document.getElementById('tb-device-notice-panel');if(!panel)return;
    panel.hidden=!mobile();if(panel.hidden)return;
    const uid=student(),disabled=!!uid&&optedOut(uid),pending=!!uid&&disablePending(uid),current=saved(),registered=!!uid&&current?.uid===uid&&!!current.id;
    const button=document.getElementById('tb-device-notice-enable'),disableButton=document.getElementById('tb-device-notice-disable');
    if(button){button.hidden=!uid||!available()||Notification.permission==='denied'||(Notification.permission==='granted'&&registered&&!disabled);button.textContent=disabled?'REATIVAR AVISOS NO CELULAR':'ATIVAR AVISOS NO CELULAR';}
    if(disableButton){disableButton.hidden=!uid||!available()||(disabled&&!pending)||(Notification.permission!=='granted'&&!registered&&!pending);disableButton.textContent=pending?'TENTAR CONCLUIR DESATIVAÇÃO':'DESATIVAR AVISOS NESTE CELULAR';}
    if(!uid)status('Entre na conta do aluno para configurar os avisos deste celular.');
    else if(!available())status('Para receber avisos no iPhone, adicione o app à Tela de Início e abra por esse ícone.');
    else if(Notification.permission==='denied')status('As notificações estão bloqueadas nas configurações do celular.');
    else if(disabled&&pending)status('Avisos pausados neste celular. A remoção no servidor está pendente e será tentada quando a conexão voltar.');
    else if(disabled)status('Avisos desativados neste celular. Você pode reativá-los quando quiser.');
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
    if(!uid||optedOut(uid)||!available()||Notification.permission!=='granted'||!vapidKey||!db)return false;
    if(registerPromise)return registerPromise;
    registerPromise=(async()=>{
      const loaded=await loadSdkOnce('https://www.gstatic.com/firebasejs/13.1.0/firebase-messaging-compat.js',()=>typeof firebase?.messaging==='function');
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
    if(disablePromise){status('A desativação ainda está sendo concluída. Aguarde um instante.');return;}
    if(!available()){render();return;}
    if(!student()){toast('Entre na conta do aluno para ativar avisos.',true);return;}
    try{
      const permission=await Notification.requestPermission();render();
      if(permission!=='granted'){toast('Permissão de notificações não concedida.',true);return;}
      const uid=student();if(!uid||!setOptedOut(uid,false)||!setDisablePending(uid,false))throw new Error('Não foi possível salvar a preferência neste celular.');
      if(publicKey()){const registered=await register();if(!registered)throw new Error('Não foi possível confirmar a ativação neste celular.');toast('✓ Notificações ativadas no celular');}
      else{status('Avisos ativados enquanto o app estiver aberto. A entrega com o app fechado aguarda a configuração do serviço.');toast('Avisos ativados enquanto o app estiver aberto.');}
    }catch(error){console.warn('[Team Bulls] notificações do aparelho',error);status('Não foi possível ativar neste celular. Tente novamente após atualizar o app.');toast('Não foi possível ativar as notificações.',true);}
    finally{render();}
  }
  async function disable(){
    if(disablePromise)return disablePromise;
    const uid=student();if(!uid){toast('Entre na conta do aluno para alterar os avisos.',true);return false;}
    if(!db||auth?.currentUser?.uid!==uid){status('Não foi possível confirmar a conta. Entre novamente e tente desativar.');toast('Não foi possível confirmar a conta.',true);return false;}
    if(!setOptedOut(uid,true)||!setDisablePending(uid,true)){status('Não foi possível salvar sua preferência neste celular. Tente novamente.');toast('Não foi possível salvar a preferência.',true);return false;}
    foregroundUnsubscribe?.();foregroundUnsubscribe=null;delivered.clear();inFlight.clear();
    if(navigator.onLine===false){status('Avisos pausados neste celular. Conecte-se para concluir a remoção do servidor.');toast('A remoção será concluída quando a conexão voltar.',true);render();return false;}
    const button=document.getElementById('tb-device-notice-disable'),enableButton=document.getElementById('tb-device-notice-enable');if(button){button.disabled=true;button.textContent='DESATIVANDO...';}if(enableButton)enableButton.disabled=true;
    status('Desativando os avisos neste celular...');
    disablePromise=(async()=>{
      if(registerPromise)await registerPromise.catch(()=>false);
      const previous=saved(),ids=new Set(previous?.uid===uid&&previous.id?[String(previous.id)]:[]);
      let messaging=null;
      if(Notification.permission==='granted'&&publicKey()){
        try{
          const loaded=await loadSdkOnce('https://www.gstatic.com/firebasejs/13.1.0/firebase-messaging-compat.js',()=>typeof firebase?.messaging==='function');
          if(loaded&&await firebase.messaging.isSupported()){
            messaging=firebase.messaging();
            const registration=await pushRegistration(),token=await messaging.getToken({vapidKey:publicKey(),serviceWorkerRegistration:registration});
            if(token)ids.add(await hash(token));
          }else if(!ids.size)throw new Error('Não foi possível localizar o registro de notificações deste celular.');
        }catch(error){if(!ids.size)throw error;console.warn('[Team Bulls] token atual não pôde ser consultado; removendo o registro salvo',error);}
      }
      const tokenCollection=db.collection('pushDevices').doc(uid).collection('tokens');for(const id of ids)await tokenCollection.doc(id).delete();
      if(!setDisablePending(uid,false))throw new Error('Os avisos foram removidos, mas não foi possível confirmar a preferência neste celular.');
      if(previous?.uid===uid)save(null);
      if(!messaging&&typeof firebase!=='undefined'&&typeof firebase.messaging==='function')try{messaging=firebase.messaging();}catch(error){}
      if(messaging)await messaging.deleteToken().catch(error=>console.warn('[Team Bulls] limpeza local do token',error));
      status('Avisos desativados neste celular.');toast('✓ Avisos desativados neste celular');return true;
    })().catch(error=>{
      console.warn('[Team Bulls] falha ao desativar avisos',error);
      status('Avisos pausados neste celular. A remoção no servidor ainda não foi confirmada; tente novamente quando a conexão estiver estável.');
      toast('A desativação ficou pendente até a conexão voltar.',true);return false;
    }).finally(()=>{disablePromise=null;if(button){button.disabled=false;button.textContent='DESATIVAR AVISOS NESTE CELULAR';}if(enableButton)enableButton.disabled=false;render();});
    return disablePromise;
  }
  async function unregister(){
    foregroundUnsubscribe?.();foregroundUnsubscribe=null;delivered.clear();inFlight.clear();
    const previous=saved();if(!previous?.uid||!previous.id){save(null);return;}
    if(auth?.currentUser?.uid!==previous.uid||!db){if(optedOut(previous.uid))setDisablePending(previous.uid,true);else save(null);return;}
    try{await db.collection('pushDevices').doc(previous.uid).collection('tokens').doc(previous.id).delete();}
    catch(error){console.warn('[Team Bulls] remoção do aparelho',error);if(optedOut(previous.uid))setDisablePending(previous.uid,true);else save(null);if(typeof firebase!=='undefined'&&typeof firebase.messaging==='function')await firebase.messaging().deleteToken().catch(()=>{});return;}
    save(null);if(disablePending(previous.uid))setDisablePending(previous.uid,false);
    if(typeof firebase!=='undefined'&&typeof firebase.messaging==='function')await firebase.messaging().deleteToken().catch(()=>{});
  }
  async function notifyFeedback(id,data){
    const uid=student();if(!uid||optedOut(uid)||!available()||Notification.permission!=='granted'||!id)return;
    const key=String(id),now=Date.now();if(inFlight.has(key)||now-(delivered.get(key)||0)<600000)return;inFlight.add(key);
    try{
      const reg=await navigator.serviceWorker.ready;
      if(!student())return;
      if(student()!==uid||optedOut(uid))return;
      await reg.showNotification(title(data?.feedbackType),{body:'Você recebeu um novo feedback do treinador.',icon:'./icon-192-v9-8.png',badge:'./icon-192-v9-8.png',tag:'team-bulls-feedback-'+id,renotify:false,data:{url:new URL('./index.html',location.href).href}});
      delivered.set(key,Date.now());if(delivered.size>60)for(const [oldId,at] of delivered)if(Date.now()-at>600000)delivered.delete(oldId);
    }catch(error){console.warn('[Team Bulls] aviso de feedback no aparelho',error);}finally{inFlight.delete(key);}
  }
  function resume(){render();const uid=student();if(uid&&optedOut(uid)){if(disablePending(uid)&&navigator.onLine!==false)disable().catch(()=>{});return;}if(uid&&available()&&Notification.permission==='granted'&&publicKey())register().catch(error=>console.warn('[Team Bulls] inscrição de notificações',error));}
  window.TeamBullsDeviceNotices=Object.freeze({version:VERSION,available,enable,disable,register,unregister,notifyFeedback,title,render});
  window.addEventListener('team-bulls-runtime-ready',resume);
  window.addEventListener('team-bulls-runtime-state',resume);
  window.addEventListener('team-bulls-student-runtime-ready',resume);
  window.addEventListener('online',resume);
  window.addEventListener('pageshow',resume);
  resume();
})();
