/* Team Bulls v10.10.9 — viewport real e teclado virtual seguro em iOS/Android. */
'use strict';
(()=>{
  const root=document.documentElement;
  let frame=0;
  let stableHeight=0;
  let lastWidth=0;
  let focusTimer=0;

  function isEditable(element){
    if(!element||element.disabled||element.readOnly)return false;
    if(element.matches?.('textarea,[contenteditable="true"]'))return true;
    if(!element.matches?.('input'))return false;
    return !['button','checkbox','color','file','hidden','image','radio','range','reset','submit'].includes(String(element.type||'text').toLowerCase());
  }

  function viewportMetrics(){
    const viewport=window.visualViewport;
    const height=Math.max(280,Math.round(viewport?.height||window.innerHeight||root.clientHeight||0));
    const width=Math.max(260,Math.round(viewport?.width||window.innerWidth||root.clientWidth||0));
    const offsetTop=Math.max(0,Math.round(viewport?.offsetTop||0));
    const offsetLeft=Math.max(0,Math.round(viewport?.offsetLeft||0));
    return{viewport,height,width,offsetTop,offsetLeft};
  }

  function ensureFocusedFieldVisible(){
    clearTimeout(focusTimer);
    focusTimer=setTimeout(()=>{
      const field=document.activeElement;
      if(!isEditable(field))return;
      const modal=field.closest?.('.modal-backdrop.open');
      if(!modal)return;
      const scroller=field.closest?.('.modal-sheet,.modal-dialog');
      const {height,offsetTop}=viewportMetrics();
      const top=offsetTop+10;
      const bottom=offsetTop+height-14;
      const rect=field.getBoundingClientRect();
      if(scroller){
        if(rect.bottom>bottom)scroller.scrollTop+=rect.bottom-bottom+24;
        else if(rect.top<top)scroller.scrollTop-=top-rect.top+18;
      }
      requestAnimationFrame(()=>{
        const next=field.getBoundingClientRect();
        if(next.bottom>bottom||next.top<top)field.scrollIntoView?.({block:'center',inline:'nearest',behavior:'auto'});
      });
    },80);
  }

  function update(){
    frame=0;
    const {height,width,offsetTop,offsetLeft}=viewportMetrics();
    const activeEditable=isEditable(document.activeElement);

    if(lastWidth&&Math.abs(width-lastWidth)>80){stableHeight=0;}
    lastWidth=width;
    if(!activeEditable||height>stableHeight)stableHeight=Math.max(stableHeight,height);

    const layoutHeight=Math.max(height,Math.round(window.innerHeight||0),Math.round(root.clientHeight||0));
    const inferredInset=Math.max(0,stableHeight-height-offsetTop);
    const layoutInset=Math.max(0,layoutHeight-height-offsetTop);
    const keyboardInset=Math.max(inferredInset,layoutInset);
    const keyboardOpen=activeEditable&&keyboardInset>96;

    root.style.setProperty('--app-height',height+'px');
    root.style.setProperty('--app-width',width+'px');
    root.style.setProperty('--viewport-offset-top',offsetTop+'px');
    root.style.setProperty('--viewport-offset-left',offsetLeft+'px');
    root.style.setProperty('--keyboard-inset',keyboardInset+'px');
    root.classList.toggle('virtual-keyboard-open',keyboardOpen);
    if(keyboardOpen)ensureFocusedFieldVisible();
  }

  const schedule=()=>{if(!frame)frame=requestAnimationFrame(update);};
  const delayedUpdate=()=>{schedule();setTimeout(schedule,70);setTimeout(schedule,220);};

  update();
  addEventListener('resize',delayedUpdate,{passive:true});
  addEventListener('orientationchange',()=>{stableHeight=0;setTimeout(delayedUpdate,100);},{passive:true});
  addEventListener('pageshow',delayedUpdate,{passive:true});
  document.addEventListener('focusin',event=>{if(isEditable(event.target)){delayedUpdate();ensureFocusedFieldVisible();}},{passive:true});
  document.addEventListener('focusout',()=>setTimeout(delayedUpdate,90),{passive:true});
  if(window.visualViewport){
    visualViewport.addEventListener('resize',delayedUpdate,{passive:true});
    visualViewport.addEventListener('scroll',delayedUpdate,{passive:true});
  }
})();


/* Team Bulls v10.10.25 — estabilidade de sessão, login e runtime móvel.
   Mantém senha sob responsabilidade do gerenciador do navegador; o app nunca
   grava a senha em texto puro. Também impede que uma restauração online seja
   convertida prematuramente em modo offline por um watchdog visual. */
(()=>{
  if(window.__TEAM_BULLS_MOBILE_SESSION_STABILITY_101025__)return;
  window.__TEAM_BULLS_MOBILE_SESSION_STABILITY_101025__=true;

  const REVISION='10.10.25-session1';
  const LAST_EMAIL_KEY='team_bulls_last_login_email_v1';
  const CACHE_REPAIR_KEY='team_bulls_critical_cache_repair_v1';
  const CACHE_REPAIR_REVISION='20260903-session1';
  const PAGE_STARTED_AT=Date.now();
  const root=document.documentElement;
  const state={pending:false,phase:'boot',updatedAt:Date.now()};
  let coreInstalled=false;
  let bootWrapped=null;
  let bootOriginal=null;
  let reconnectTimer=0;

  const safeGet=key=>{try{return localStorage.getItem(key);}catch(error){return null;}};
  const safeSet=(key,value)=>{try{localStorage.setItem(key,value);return true;}catch(error){return false;}};
  const activeScreen=()=>document.querySelector('.screen.active')?.id||'';
  const accessMode=()=>{try{return typeof ACCESS_MODE!=='undefined'?String(ACCESS_MODE||''):'';}catch(error){return'';}};
  const coreMode=()=>{try{return typeof MODE!=='undefined'?String(MODE||''):'';}catch(error){return'';}};
  const currentUser=()=>{try{return typeof CURRENT_USER!=='undefined'?CURRENT_USER:null;}catch(error){return null;}};
  const processingUid=()=>{try{return typeof AUTH_PROCESSING_UID!=='undefined'?String(AUTH_PROCESSING_UID||''):'';}catch(error){return'';}};
  const authCallbackSeen=()=>{try{return typeof AUTH_CALLBACK_SEEN!=='undefined'&&AUTH_CALLBACK_SEEN===true;}catch(error){return false;}};
  const firebaseUser=()=>{
    try{if(typeof auth!=='undefined'&&auth?.currentUser)return auth.currentUser;}catch(error){}
    try{if(window.firebase?.apps?.length)return window.firebase.auth().currentUser;}catch(error){}
    return null;
  };
  const readyAccess=()=>['cloud-active','trainer','offline-registered','local-inactive'].includes(accessMode());
  const knownReturningSession=()=>{
    const uid=String(safeGet('teamms_last_user_uid')||'').trim();
    const guest=safeGet('teamms_offline_pref')==='1'||safeGet('teamms_offline_mode')==='guest';
    return !!uid&&!guest&&navigator.onLine!==false;
  };
  function setPending(value,phase){state.pending=!!value;state.phase=String(phase||state.phase);state.updatedAt=Date.now();}
  function authRestorePending(){
    if(readyAccess())return false;
    if(state.pending)return true;
    if(processingUid())return true;
    const user=firebaseUser();
    if(user&&(activeScreen()==='screen-loading'||activeScreen()==='screen-auth'))return true;
    if(authCallbackSeen()&&!user)return false;
    return knownReturningSession()&&activeScreen()==='screen-loading'&&Date.now()-PAGE_STARTED_AT<12000;
  }

  function profileEmail(){
    const uid=String(safeGet('teamms_last_user_uid')||'').trim();
    if(!uid)return'';
    try{
      const profile=JSON.parse(safeGet('team_bulls_profile_v9_5_'+uid)||'null');
      if(profile?.email)return String(profile.email).trim().slice(0,320);
    }catch(error){}
    try{
      const records=JSON.parse(safeGet('team_bulls_offline_credentials')||'{}');
      const record=Object.values(records||{}).find(item=>String(item?.uid||'')===uid);
      if(record?.email)return String(record.email).trim().slice(0,320);
    }catch(error){}
    return'';
  }
  function rememberEmail(value){
    const email=String(value||'').trim().slice(0,320);
    if(email&&email.includes('@'))safeSet(LAST_EMAIL_KEY,email);
  }
  function prepareAuthFields(){
    const form=document.getElementById('panel-login');
    const email=document.getElementById('login-email');
    const password=document.getElementById('login-pass');
    if(form){form.setAttribute('autocomplete','on');form.removeAttribute('data-form-type');}
    if(email){
      email.setAttribute('autocomplete','username');email.setAttribute('name','username');
      ['data-1p-ignore','data-lpignore','data-form-type','aria-autocomplete'].forEach(attr=>email.removeAttribute(attr));
      if(!email.value.trim())email.value=String(safeGet(LAST_EMAIL_KEY)||profileEmail()||'');
      if(email.dataset.tbCredentialMemory!=='1'){
        email.dataset.tbCredentialMemory='1';
        email.addEventListener('change',()=>rememberEmail(email.value),{passive:true});
        email.addEventListener('blur',()=>rememberEmail(email.value),{passive:true});
      }
    }
    if(password){
      password.setAttribute('autocomplete','current-password');password.setAttribute('name','password');
      ['data-1p-ignore','data-lpignore','data-form-type','aria-autocomplete'].forEach(attr=>password.removeAttribute(attr));
    }
    return !!(form&&email&&password);
  }

  function injectPendingStyle(){
    if(document.getElementById('tb-student-runtime-pending-style'))return;
    const style=document.createElement('style');
    style.id='tb-student-runtime-pending-style';
    style.textContent=`
      html.tb-student-runtime-pending body.student-desktop .student-desktop-nav{display:none!important}
      html.tb-student-runtime-pending #screen-home .quick-nav{display:none!important}
      html.tb-student-runtime-pending #screen-home #workout-list,
      html.tb-student-runtime-pending #screen-home #workout-empty,
      html.tb-student-runtime-pending #screen-home .content>.section-header{display:none!important}
    `;
    document.head.appendChild(style);
  }
  function studentCloudContext(){return currentUser()?.role==='student'&&coreMode()==='cloud'&&accessMode()==='cloud-active';}
  function finishStudentRuntimePending(){root.classList.remove('tb-student-runtime-pending');}
  function startStudentRuntime(){
    if(!studentCloudContext())return false;
    injectPendingStyle();
    if(!window.TeamBullsStudentHomeLayout)root.classList.add('tb-student-runtime-pending');
    const run=()=>{
      try{
        const result=window.TeamBullsRuntimeLoader?.student?.();
        Promise.resolve(result).finally(()=>{if(window.TeamBullsStudentHomeLayout)finishStudentRuntimePending();});
      }catch(error){}
    };
    Promise.resolve(window.TeamBullsCriticalCacheRepair).finally(run);
    [80,260,700].forEach(delay=>setTimeout(run,delay));
    setTimeout(finishStudentRuntimePending,8000);
    return true;
  }

  const criticalStudentPaths=[
    '/modules/student-home-profile-v10_10_12.js',
    '/modules/student-home-layout-v10_10_15.js',
    '/modules/student-workout-library-v10_10_24.js',
    '/modules/student-diet-compact-live-v10_10_23.js',
    '/modules/student-diet-layout-v10_10_24.js',
    '/modules/student-hotbar-payments-v10_10_22.js',
    '/modules/supply-options-label-v10_10_24.js'
  ];
  async function repairCriticalStudentCaches(){
    if(navigator.onLine===false||!('caches'in window))return false;
    if(safeGet(CACHE_REPAIR_KEY)===CACHE_REPAIR_REVISION)return true;
    try{
      const names=(await caches.keys()).filter(name=>name.startsWith('team-bulls-'));
      for(const name of names){
        const cache=await caches.open(name);
        const requests=await cache.keys();
        await Promise.all(requests.filter(request=>{
          try{const path=new URL(request.url).pathname;return criticalStudentPaths.some(item=>path.endsWith(item));}catch(error){return false;}
        }).map(request=>cache.delete(request)));
      }
      safeSet(CACHE_REPAIR_KEY,CACHE_REPAIR_REVISION);
      return true;
    }catch(error){console.warn('[Team Bulls] Cache crítico será reparado na próxima abertura.',error);return false;}
  }
  window.TeamBullsCriticalCacheRepair=repairCriticalStudentCaches();

  function installBootGuard(){
    const base=window.TeamBullsRuntimeStabilityBoot;
    if(!base||base===bootWrapped||base.__tbSessionRestoreGuard===true)return !!base;
    bootOriginal=base;
    const wrapped=Object.freeze({...base,__tbSessionRestoreGuard:true,activateAuth(message){
      if(authRestorePending()){
        prepareAuthFields();
        window.TeamBullsRecovery?.reveal?.('Sua sessão foi reconhecida. A conexão online ainda está sendo validada; não é necessário digitar a senha novamente.');
        return false;
      }
      return base.activateAuth?.(message)??false;
    }});
    bootWrapped=wrapped;
    window.TeamBullsRuntimeStabilityBoot=wrapped;
    window.TeamBullsBootSafety=wrapped;
    return true;
  }

  function committedAccess(){return ['cloud-active','trainer','offline-registered','local-inactive'].includes(accessMode());}
  function installCorePatches(){
    if(coreInstalled)return true;
    if(typeof showScreen!=='function'||typeof restoreCachedStudentAccess!=='function'||typeof clearTransientAuthSecrets!=='function'||typeof doLogin!=='function')return false;
    coreInstalled=true;

    if(!restoreCachedStudentAccess.__tbOnlineRestoreGuard){
      const base=restoreCachedStudentAccess;
      const wrapped=function(user,reason,options={}){
        const fastOnline=reason?.code==='team-bulls/fast-session'&&options?.silent===true&&navigator.onLine!==false;
        if(fastOnline){setPending(true,'validating-online-profile');return false;}
        return base.apply(this,arguments);
      };
      wrapped.__tbOnlineRestoreGuard=true;restoreCachedStudentAccess=wrapped;
    }

    const baseClear=clearTransientAuthSecrets;
    if(!baseClear.__tbCommitOnly){
      const wrapped=function(){
        if(activeScreen()==='screen-auth'||authRestorePending())return false;
        return baseClear.apply(this,arguments);
      };
      wrapped.__tbCommitOnly=true;clearTransientAuthSecrets=wrapped;
    }

    if(!showScreen.__tbSessionStable){
      const base=showScreen;
      const wrapped=function(id,...args){
        if(id==='screen-auth'&&authRestorePending()){
          prepareAuthFields();
          window.TeamBullsRecovery?.reveal?.('Continuamos validando sua sessão online. A tela de login não substituirá uma restauração ainda em andamento.');
          return false;
        }
        const result=base.call(this,id,...args);
        if(id==='screen-auth')prepareAuthFields();
        if(result!==false&&(id==='screen-home'||id==='screen-trainer')&&committedAccess()){
          setPending(false,'ready');
          setTimeout(()=>{try{baseClear();}catch(error){}},0);
          if(id==='screen-home')startStudentRuntime();
        }
        return result;
      };
      wrapped.__tbSessionStable=true;showScreen=wrapped;
    }
    if(!doLogin.__tbSessionStable){
      const base=doLogin;
      const wrapped=async function(){
        prepareAuthFields();
        const email=document.getElementById('login-email')?.value||'';rememberEmail(email);
        setPending(true,'login-submit');
        try{return await base.apply(this,arguments);}
        finally{
          setTimeout(()=>{
            if(committedAccess())setPending(false,'ready');
            else if(activeScreen()==='screen-auth'&&!firebaseUser()&&!processingUid())setPending(false,'login-idle');
          },80);
        }
      };
      wrapped.__tbSessionStable=true;doLogin=wrapped;
    }

    if(typeof bootToAuth==='function'&&!bootToAuth.__tbSessionStable){
      const base=bootToAuth;
      const wrapped=function(){setPending(false,'auth-error');prepareAuthFields();return base.apply(this,arguments);};
      wrapped.__tbSessionStable=true;bootToAuth=wrapped;
    }
    if(typeof authTab==='function'&&!authTab.__tbCredentialSemantics){
      const base=authTab;
      const wrapped=function(tab){const result=base.apply(this,arguments);if(tab==='login')prepareAuthFields();return result;};
      wrapped.__tbCredentialSemantics=true;authTab=wrapped;
    }

    window.addEventListener('team-bulls-student-runtime-ready',finishStudentRuntimePending);
    return true;
  }

  function recoverCloudSession(){
    clearTimeout(reconnectTimer);
    reconnectTimer=setTimeout(()=>{
      try{
        if(navigator.onLine===false||accessMode()!=='offline-registered')return;
        const user=firebaseUser();if(!user||typeof handleAuthStateUser!=='function')return;
        setPending(true,'reconnect-online');
        Promise.resolve(handleAuthStateUser(user)).catch(()=>setPending(false,'reconnect-failed'));
      }catch(error){setPending(false,'reconnect-failed');}
    },650);
  }

  function install(){
    prepareAuthFields();injectPendingStyle();installBootGuard();installCorePatches();
  }
  function poll(attempt=0){
    installBootGuard();
    if(installCorePatches()&&installBootGuard())return;
    if(attempt<240)setTimeout(()=>poll(attempt+1),attempt<30?20:80);
  }

  window.TeamBullsAuthLifecycle=Object.freeze({
    revision:REVISION,
    isRestoring:authRestorePending,
    state:()=>({...state,access:accessMode(),screen:activeScreen(),processingUid:processingUid()}),
    prepareFields:prepareAuthFields,
    recoverCloudSession
  });

  setTimeout(()=>poll(0),0);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('team-bulls-auth-failopen',prepareAuthFields);
  window.addEventListener('online',recoverCloudSession,{passive:true});
  window.addEventListener('pageshow',()=>{prepareAuthFields();recoverCloudSession();},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){prepareAuthFields();recoverCloudSession();}},{passive:true});

  setTimeout(()=>{
    if(activeScreen()!=='screen-loading'||firebaseUser()||processingUid())return;
    setPending(false,'restore-timeout');
    bootOriginal?.activateAuth?.('Não foi possível restaurar a sessão automaticamente. Você já pode entrar novamente; seus dados locais continuam preservados.');
  },12000);
})();

/* Team Bulls v10.10.46 — entrada rápida do treinador e ponte de runtime confiável. */
(()=>{
  if(window.__TEAM_BULLS_TRAINER_COLDSTART_101046__)return;
  window.__TEAM_BULLS_TRAINER_COLDSTART_101046__=true;

  const VERSION='10.10.46-coldstart1';
  const RUNTIME_SRC='./modules/trainer-runtime-reliability-v10_10_46.js?v=10.10.52-trainer2';
  let appCheckTask=null;
  let runtimePromise=null;

  function injectBootStyle(){
    if(document.getElementById('tb-trainer-coldstart-style'))return;
    const style=document.createElement('style');
    style.id='tb-trainer-coldstart-style';
    style.textContent='.fab-wrap{display:none}';
    document.head.appendChild(style);
  }
  function trainerContext(){
    try{return typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role==='trainer'&&typeof MODE!=='undefined'&&MODE==='cloud';}
    catch(error){return false;}
  }
  function loadRuntime(){
    if(!trainerContext())return Promise.resolve(false);
    if(window.TeamBullsTrainerRuntimeReliability?.version==='10.10.52-trainer2')return Promise.resolve(true);
    if(runtimePromise)return runtimePromise;
    runtimePromise=new Promise(resolve=>{
      const expected=new URL(RUNTIME_SRC,location.href).href;
      const existing=[...document.scripts].find(script=>script.src===expected);
      if(existing){
        if(window.TeamBullsTrainerRuntimeReliability){resolve(true);runtimePromise=null;return;}
        existing.addEventListener('load',()=>{resolve(!!window.TeamBullsTrainerRuntimeReliability);runtimePromise=null;},{once:true});
        existing.addEventListener('error',()=>{resolve(false);runtimePromise=null;},{once:true});
        return;
      }
      const script=document.createElement('script');let settled=false;
      const finish=ok=>{if(settled)return;settled=true;clearTimeout(timer);if(!ok)script.remove();resolve(ok);runtimePromise=null;};
      script.src=RUNTIME_SRC;script.async=true;script.onload=()=>finish(!!window.TeamBullsTrainerRuntimeReliability);script.onerror=()=>finish(false);
      const timer=setTimeout(()=>finish(false),6500);document.head.appendChild(script);
    });
    return runtimePromise;
  }
  function patchNetworkGates(){
    if(typeof withTimeout==='function'&&!withTimeout.__tbTrainerColdStart101046){
      const base=withTimeout;
      const wrapped=function(task,ms,label='operação'){
        let limit=Math.max(250,Number(ms)||10000);
        if(label==='App Check'){
          appCheckTask=Promise.resolve(task).catch(()=>false);
          limit=Math.min(limit,2500);
        }
        return base(task,limit,label);
      };
      wrapped.__tbTrainerColdStart101046=true;
      withTimeout=wrapped;
    }
    if(typeof getUserProfileWithRetry==='function'&&!getUserProfileWithRetry.__tbTrainerAppCheckOverlap101046){
      const base=getUserProfileWithRetry;
      const wrapped=async function(){
        if(appCheckTask){
          await Promise.race([appCheckTask,new Promise(resolve=>setTimeout(resolve,1200))]).catch(()=>{});
        }
        return base.apply(this,arguments);
      };
      wrapped.__tbTrainerAppCheckOverlap101046=true;
      getUserProfileWithRetry=wrapped;
    }
    if(typeof showScreen==='function'&&!showScreen.__tbTrainerRuntime101046){
      const base=showScreen;
      const wrapped=function(id){
        const result=base.apply(this,arguments);
        if(result!==false&&(id==='screen-trainer'||id==='screen-trainer-student'||String(id||'').startsWith('screen-ts-')))setTimeout(loadRuntime,0);
        return result;
      };
      wrapped.__tbTrainerRuntime101046=true;
      showScreen=wrapped;
    }
    return true;
  }
  function install(){
    injectBootStyle();
    patchNetworkGates();
    if(trainerContext())loadRuntime();
  }

  injectBootStyle();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('pageshow',()=>{patchNetworkGates();if(trainerContext())loadRuntime();},{passive:true});
  window.addEventListener('online',()=>{patchNetworkGates();if(trainerContext())loadRuntime();},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){patchNetworkGates();if(trainerContext())loadRuntime();}},{passive:true});

  window.TeamBullsTrainerColdStart=Object.freeze({version:VERSION,install,loadRuntime});
})();