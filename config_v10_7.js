/* Configuração pública Team Bulls v10.10.30 — bootstrap móvel resiliente e runtime leve.
   A chave do App Check/reCAPTCHA Enterprise é pública por definição.
   Não coloque senhas, chaves privadas ou credenciais administrativas aqui. */
window.TEAM_BULLS_PUBLIC_CONFIG=Object.freeze({
  appCheckSiteKey: ['6Lc3','U28t','AAAA','AB6q','yxP8','GauR','DCg-','4ADi','y8oY','LKXL'].join('')
});

if('caches' in window){
  caches.keys().then(keys=>Promise.all(keys.filter(name=>name.startsWith('team-bulls-stretch-guide-')).map(name=>caches.delete(name)))).catch(()=>{});
}

(()=>{
  let installed=false;
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const stored=key=>{try{return typeof storageGet==='function'?storageGet(key):localStorage.getItem(key);}catch(error){return null;}};
  const restoringCloudSession=()=>{
    const uid=String(stored('teamms_last_user_uid')||'').trim();
    const guest=stored('teamms_offline_pref')==='1'||stored('teamms_offline_mode')==='guest';
    return !!uid&&!guest&&navigator.onLine!==false;
  };
  const patch=()=>{
    if(installed)return true;
    if(typeof withTimeout!=='function'||typeof ensureFirebaseReady!=='function'||typeof cloudGet!=='function')return false;
    installed=true;
    if(typeof startBootWatchdog==='function'&&!startBootWatchdog.__tbMobileSessionRestore){
      const wrapped=function(){
        BOOT_SETTLED=false;clearTimeout(BOOT_WATCHDOG);clearTimeout(AUTH_UI_FALLBACK_TIMER);
        const restoring=restoringCloudSession(),authDelay=restoring?4200:700,hardDelay=restoring?8500:4600;
        AUTH_UI_FALLBACK_TIMER=setTimeout(()=>{if(BOOT_SETTLED||!document.getElementById('screen-loading')?.classList.contains('active'))return;showScreen('screen-auth');if(restoring)window.TeamBullsRecovery?.reveal?.('A sessão está levando mais tempo que o normal para ser restaurada. Você pode aguardar ou entrar novamente.');},authDelay);
        BOOT_WATCHDOG=setTimeout(()=>{if(BOOT_SETTLED||!document.getElementById('screen-loading')?.classList.contains('active'))return;AUTH_HANDLED=false;showScreen('screen-auth');window.TeamBullsRecovery?.reveal?.('A conexão ainda está sendo conferida. A tela de acesso foi liberada sem apagar seus dados locais.');},hardDelay);
      };wrapped.__tbMobileSessionRestore=true;startBootWatchdog=wrapped;
    }
    if(!withTimeout.__tbFirebaseResilience){const base=withTimeout;const wrapped=function(task,ms,label='operação'){let limit=Math.max(250,Number(ms)||10000);if(label==='Firebase'||label==='carregar conexão segura')limit=Math.max(limit,12000);else if(label==='App Check')limit=Math.max(limit,6000);else if(label==='login')limit=Math.max(limit,16000);return base(task,limit,label);};wrapped.__tbFirebaseResilience=true;withTimeout=wrapped;}
    if(typeof initOptionalAppCheck==='function'&&!initOptionalAppCheck.__tbEnterpriseProvider){const legacy=initOptionalAppCheck;const wrapped=async function(){const key=String(typeof CFG!=='undefined'&&CFG.appCheckSiteKey||'').trim();if(!key||typeof firebase==='undefined')return false;try{const ok=await loadSdkOnce('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check-compat.js',()=>typeof firebase.appCheck==='function');if(!ok)return false;const Provider=firebase.appCheck?.ReCaptchaEnterpriseProvider;if(typeof Provider==='function'){firebase.appCheck().activate(new Provider(key),true);return true;}return await legacy();}catch(error){const message=String(error?.message||error||'').toLowerCase();if(message.includes('already')&&message.includes('activ'))return true;console.warn('App Check Enterprise não iniciado',error);return false;}};wrapped.__tbEnterpriseProvider=true;initOptionalAppCheck=wrapped;}
    if(typeof ensureFirebaseReady==='function'&&!ensureFirebaseReady.__tbRetry){const base=ensureFirebaseReady;const wrapped=async function(){if(typeof auth!=='undefined'&&auth&&typeof db!=='undefined'&&db)return true;const first=await base();if(first)return true;if(!navigator.onLine)return false;await delay(450);try{const ready=await withTimeout(ensureFirebaseCore(),12000,'carregar conexão segura');return !!(ready&&initFirebase());}catch(error){console.warn('Firebase indisponível após nova tentativa',error);return false;}};wrapped.__tbRetry=true;ensureFirebaseReady=wrapped;}
    if(typeof cloudGet==='function'&&!cloudGet.__tbRetry){const base=cloudGet;const wrapped=async function(reference,label='consulta'){try{return await base(reference,label);}catch(error){const retryable=navigator.onLine&&(typeof isNetworkLikeError==='function'?isNetworkLikeError(error):false);if(!retryable)throw error;await delay(400);return base(reference,label+' · nova tentativa');}};wrapped.__tbRetry=true;cloudGet=wrapped;}
    return true;
  };
  patch();document.addEventListener('DOMContentLoaded',patch,{once:true});window.addEventListener('load',()=>{if(!installed)patch();},{once:true});
})();

(()=>{
  let requested=false,deferredStarted=false,deferredComplete=false,completedRole='',studentPriorityStarted=false,healing=false,healTimer=null,readyResolved=false,hadFailures=false,screenObserver=null,deferredPhase=false,deferredBatchCount=0,deferredEligible=[];
  const PRELOAD_WINDOW=8;
  const DEFERRED_YIELD_EVERY=4;
  const STUDENT_YIELD_EVERY=2;
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const yieldUi=()=>new Promise(resolve=>{
    if(document.visibilityState==='hidden'){setTimeout(resolve,0);return;}
    requestAnimationFrame(()=>setTimeout(resolve,0));
  });
  const criticalModules=[
    './modules/security-hardening-v10_10_9.js?v=10.10.10-security8',
    './modules/session-restore-recovery-ux-v10_10_31.js?v=10.10.31-sessionrestore1'
  ];
  const studentPriorityModules=[
    './modules/student-home-profile-v10_10_12.js?v=10.10.20-studenthome3',
    './modules/student-home-layout-v10_10_15.js?v=10.10.21-home4',
    './modules/student-home-fast-protocol-date-v10_10_31.js?v=10.10.31-fastdates1',
    './modules/student-request-realtime-v10_10_32.js?v=10.10.32-studentrealtime2',
    './modules/student-workout-library-v10_10_24.js?v=10.10.24-workoutlibrary1',
    './modules/student-diet-compact-live-v10_10_23.js?v=10.10.23-dietcompact1',
    './modules/student-diet-layout-v10_10_24.js?v=10.10.24-dietlayout1',
    './modules/student-hotbar-payments-v10_10_22.js?v=10.10.22-studentpay1'
  ];
  const modules=[
    './modules/destructive-actions-supply-fix-v10_10_29.js?v=10.10.29-destructive-supply1','./modules/supply-options-label-v10_10_24.js?v=10.10.24-supplylabel1','./modules/session-save-performance-v10_10_9.js?v=10.10.9-sessionperf1','./modules/week-selection-fix-v10_10_9.js?v=10.10.9-weekselection1','./modules/stability_v10_10_9.js?v=10.10.9','./modules/app-update-v10_10_9.js?v=10.10.9','./modules/diet-scroll-fix-v10_10_9.js?v=10.10.9','./modules/modal-form-guard-v10_10_9.js?v=10.10.9','./modules/trainer-workspace-v10_10_9.js?v=10.10.9-workspace3','./modules/cardio-timer-fix-v10_10_9.js?v=10.10.9-cardio1','./modules/global-performance-v10_10_9.js?v=10.10.9-perf2','./modules/workout-ux-fix-v10_10_9.js?v=10.10.9-workout1','./modules/desktop-performance-v10_10_9.js?v=10.10.9-desktop1','./modules/ger-bulk-v10_10_9.js?v=10.10.9-ger1','./modules/prescription-actions-layout-v10_10_9.js?v=10.10.9-actions2','./modules/prescription-propagation-v10_10_9.js?v=10.10.9-propagation1','./modules/diet-delete-fix-v10_10_9.js?v=10.10.9-dietdelete1','./modules/student-guidance-v10_10_9-v2.js?v=10.10.9-guidance2','./modules/remove-stretch-planilha-v10_10_9.js?v=10.10.9-stretchremove2','./modules/registration-integrity-v10_10_9.js?v=10.10.9-registration2','./modules/photo-quality-download-v10_10_9.js?v=10.10.9-photoquality2','./modules/heic-report-conversion-v10_10_12.js?v=10.10.12-heic1','./modules/usability-checkup-v10_10_9.js?v=10.10.20-usability3','./modules/legacy-student-link-repair-v10_10_10.js?v=10.10.10-legacy-links6','./modules/workflow-controls-v10_10_10.js?v=10.10.10-workflow1','./modules/prescription-lock-bridge-v10_10_10.js?v=10.10.10-lockbridge1','./modules/ger-lock-bridge-v10_10_10.js?v=10.10.10-gerlock1','./modules/report-photo-ux-v10_10_10.js?v=10.10.10-reportphotos1','./modules/usability-audit-v10_10_10.js?v=10.10.10-audit1','./modules/modal-stack-stability-v10_10_9.js?v=10.10.9-modal2&fix=freeze1','./modules/diet-calculation-math-v10_10_9.js?v=10.10.10-dietmath1','./modules/diet-calculation-evolution-v10_10_9.js?v=10.10.10-dietcalc1','./modules/diet-portion-presets-v10_10_9.js?v=10.10.10-portions1','./modules/diet-personalization-v10_10_11.js?v=10.10.11-dietpersonal1','./modules/diet-live-calories-v10_10_11.js?v=10.10.11-dietcalories2','./modules/training-integrity-v10_10_11.js?v=10.10.11-training1','./modules/report-schedule-consistency-v10_10_11.js?v=10.10.11-reportschedule1','./modules/weekly-report-access-v10_10_28.js?v=10.10.28-weeklyaccess1','./modules/cardio-finish-alert-v10_10_11.js?v=10.10.11-cardioalert1','./modules/release-coherence-v10_10_10.js?v=10.10.12-release6','./modules/custom-food-calorie-bridge-v10_10_12.js?v=10.10.12-customfood2','./modules/trainer-diet-workspace-v10_10_11.js?v=10.10.11-dietworkspace1','./modules/diet-copy-v10_10_28.js?v=10.10.28-dietcopy1','./modules/trainer-inbox-payments-v10_10_12.js?v=10.10.12-inboxpayments2','./modules/trainer-billing-student-projection-v10_10_22.js?v=10.10.22-billingprojection1'
  ];
  const MODULE_ROOT='./modules/';
  const trainerOnlyModules=new Set([
    MODULE_ROOT+'trainer-workspace-v10_10_9.js?v=10.10.9-workspace3',
    MODULE_ROOT+'trainer-diet-workspace-v10_10_11.js?v=10.10.11-dietworkspace1',
    MODULE_ROOT+'diet-copy-v10_10_28.js?v=10.10.28-dietcopy1',
    MODULE_ROOT+'trainer-inbox-payments-v10_10_12.js?v=10.10.12-inboxpayments2',
    MODULE_ROOT+'trainer-billing-student-projection-v10_10_22.js?v=10.10.22-billingprojection1'
  ]);
  const studentExcludedModules=new Set([
    MODULE_ROOT+'ger-bulk-v10_10_9.js?v=10.10.9-ger1',
    MODULE_ROOT+'prescription-actions-layout-v10_10_9.js?v=10.10.9-actions2',
    MODULE_ROOT+'prescription-propagation-v10_10_9.js?v=10.10.9-propagation1',
    MODULE_ROOT+'diet-delete-fix-v10_10_9.js?v=10.10.9-dietdelete1',
    MODULE_ROOT+'diet-calculation-math-v10_10_9.js?v=10.10.10-dietmath1',
    MODULE_ROOT+'diet-calculation-evolution-v10_10_9.js?v=10.10.10-dietcalc1',
    MODULE_ROOT+'diet-portion-presets-v10_10_9.js?v=10.10.10-portions1',
    MODULE_ROOT+'diet-live-calories-v10_10_11.js?v=10.10.11-dietcalories2',
    MODULE_ROOT+'custom-food-calorie-bridge-v10_10_12.js?v=10.10.12-customfood2'
  ]);
  const loadedModules=new Set(),failedModules=new Set();let readyResolve=null;const ready=new Promise(resolve=>{readyResolve=resolve;});
  const activeScreen=()=>document.querySelector('.screen.active')?.id||'';
  const runtimeRole=()=>{
    try{const role=String(typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role||'');if(role==='student'||role==='trainer')return role;}catch(error){}
    const screen=activeScreen();
    if(document.body?.classList.contains('trainer-desktop')||screen==='screen-trainer'||screen.startsWith('screen-ts-'))return'trainer';
    if(document.body?.classList.contains('student-desktop'))return'student';
    return'';
  };
  const cloudStudentRuntime=()=>{
    if(runtimeRole()!=='student')return false;
    try{if(typeof MODE!=='undefined'&&MODE==='local')return false;}catch(error){}
    return true;
  };
  const roleAllowsModule=src=>{
    const role=runtimeRole();
    if(trainerOnlyModules.has(src))return role==='trainer';
    if(studentExcludedModules.has(src))return !cloudStudentRuntime();
    return true;
  };
  const activeFailures=()=>[...failedModules].filter(roleAllowsModule);
  const runtimeComplete=()=>deferredComplete&&completedRole===(runtimeRole()||'shared')&&activeFailures().length===0;
  const sessionUiReady=()=>{const screen=activeScreen();return !!screen&&screen!=='screen-loading'&&screen!=='screen-auth';};
  const studentHomeActive=()=>{
    if(activeScreen()!=='screen-home'||document.body?.classList.contains('trainer-desktop'))return false;
    try{if(typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role==='trainer')return false;}catch(error){}
    return true;
  };
  const preloadModules=items=>items.forEach(src=>{if(document.head.querySelector(`link[rel="preload"][as="script"][href="${src}"]`))return;const link=document.createElement('link');link.rel='preload';link.as='script';link.href=src;document.head.appendChild(link);});
  const preloadAhead=(eligible,index)=>preloadModules(eligible.slice(Math.max(0,index),Math.max(0,index)+PRELOAD_WINDOW));
  const runtimeDetail=()=>({loaded:loadedModules.size,total:criticalModules.length+studentPriorityModules.length+modules.filter(roleAllowsModule).length,failed:activeFailures(),screen:activeScreen(),role:runtimeRole()||'shared',studentPriority:studentPriorityStarted,complete:runtimeComplete()});
  const emitRuntimeState=type=>{try{window.dispatchEvent(new CustomEvent(type,{detail:runtimeDetail()}));}catch(error){}};
  const markReady=()=>{
    if(activeFailures().length)return;
    deferredComplete=true;completedRole=runtimeRole()||'shared';document.documentElement.dataset.teamBullsRuntime='ready';
    if(!readyResolved){readyResolved=true;readyResolve?.(true);emitRuntimeState('team-bulls-runtime-ready');}else emitRuntimeState('team-bulls-runtime-state');
    if(hadFailures&&typeof showToast==='function')showToast('✓ Recursos do aplicativo sincronizados');
  };
  const loadScriptOnce=(src,timeoutMs=3200)=>{if(loadedModules.has(src))return Promise.resolve(true);return new Promise(resolve=>{const script=document.createElement('script');let settled=false;const finish=(ok,reason='')=>{if(settled)return;settled=true;clearTimeout(timer);script.onload=null;script.onerror=null;if(ok){loadedModules.add(src);failedModules.delete(src);script.dataset.tbModuleReady='1';}else{failedModules.add(src);hadFailures=true;if(script.isConnected)script.remove();}if(reason)console.warn('[Team Bulls] Extensão temporariamente indisponível:',src,reason);emitRuntimeState('team-bulls-runtime-state');resolve(ok);};script.src=src;script.async=false;script.onload=()=>finish(true);script.onerror=()=>finish(false,'erro de carregamento');const timer=setTimeout(()=>finish(false,'tempo limite'),Math.max(1200,Number(timeoutMs)||3200));document.head.appendChild(script);});};
  const loadScript=async(src,timeoutMs=3200)=>{
    if(!roleAllowsModule(src))return true;
    if(deferredPhase){const index=deferredEligible.indexOf(src);if(index>=0)preloadAhead(deferredEligible,index+1);}
    if(loadedModules.has(src))return true;
    let ok=await loadScriptOnce(src,timeoutMs);
    if(!ok&&navigator.onLine){await wait(250);ok=await loadScriptOnce(src,Math.max(6500,Number(timeoutMs)||3200));}
    if(!ok)console.warn('[Team Bulls] Módulo colocado na fila de autorreparo:',src);
    if(deferredPhase&&deferredEligible.includes(src)){
      deferredBatchCount++;
      if(deferredBatchCount%4===0)await yieldUi();
    }
    return ok;
  };
  const scheduleHeal=(delay=1800)=>{clearTimeout(healTimer);if(!activeFailures().length)return;healTimer=setTimeout(()=>healFailedModules(),Math.max(400,delay));};
  const healFailedModules=async()=>{if(healing||navigator.onLine===false)return false;const pending=activeFailures();if(!pending.length){markReady();return true;}healing=true;preloadModules(pending.slice(0,PRELOAD_WINDOW));try{for(let index=0;index<pending.length;index++){await loadScript(pending[index],9000);if((index+1)%STUDENT_YIELD_EVERY===0)await yieldUi();}}finally{healing=false;}if(activeFailures().length)scheduleHeal(5000);else markReady();return activeFailures().length===0;};
  const loadStudentPriority=async()=>{
    if(studentPriorityStarted||!studentHomeActive())return !!window.TeamBullsStudentHomeLayout;
    studentPriorityStarted=true;document.documentElement.dataset.teamBullsStudentRuntime='loading';preloadModules(studentPriorityModules);
    for(let index=0;index<studentPriorityModules.length;index++){
      await loadScript(studentPriorityModules[index],6500);
      if((index+1)%STUDENT_YIELD_EVERY===0)await yieldUi();
    }
    try{window.TeamBullsStudentHomeLayout?.syncHotbar?.();}catch(error){}
    document.documentElement.dataset.teamBullsStudentRuntime=window.TeamBullsStudentHomeLayout?'ready':'partial';
    emitRuntimeState('team-bulls-student-runtime-ready');
    if(activeFailures().length)scheduleHeal(900);
    return !!window.TeamBullsStudentHomeLayout;
  };
  const loadDeferred=async()=>{
    if(deferredStarted||!sessionUiReady()||runtimeComplete())return;
    deferredStarted=true;document.documentElement.dataset.teamBullsRuntime='loading';
    try{
      if(studentHomeActive())await loadStudentPriority();
      deferredEligible=modules.filter(roleAllowsModule);deferredBatchCount=0;
      preloadAhead(deferredEligible,0);
      deferredPhase=true;
      try{for(const src of modules)await loadScript(src);}finally{deferredPhase=false;deferredEligible=[];}
      await yieldUi();
    }finally{deferredStarted=false;}
    if(activeFailures().length){if(typeof showToast==='function')showToast('Conexão instável: alguns recursos continuam sendo finalizados automaticamente.',true);scheduleHeal(1200);}else markReady();
  };
  const scheduleDeferred=()=>{
    if(!sessionUiReady()||runtimeComplete())return;
    const queue=()=>{if(!sessionUiReady()||runtimeComplete())return;if(studentHomeActive())loadStudentPriority().finally(()=>{if(!deferredStarted)loadDeferred();});else loadDeferred();};
    requestAnimationFrame(()=>setTimeout(queue,60));
  };
  const contextChanged=()=>{
    if(studentHomeActive()){loadStudentPriority().finally(scheduleDeferred);return;}
    if(sessionUiReady())scheduleDeferred();
  };
  const installSessionGate=()=>{
    if(screenObserver||typeof MutationObserver!=='function')return;
    screenObserver=new MutationObserver(contextChanged);
    [document.body,document.getElementById('screen-loading'),document.getElementById('screen-auth'),document.getElementById('screen-home'),document.getElementById('screen-trainer')].filter(Boolean).forEach(node=>screenObserver.observe(node,{attributes:true,attributeFilter:['class']}));
    window.addEventListener('pageshow',contextChanged,{passive:true});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')contextChanged();},{passive:true});
  };
  const load=async()=>{if(requested)return;requested=true;for(const src of criticalModules)await loadScript(src,6500);installSessionGate();contextChanged();};
  preloadModules(criticalModules);
  window.TeamBullsRuntimePerformance=Object.freeze({version:'10.10.21-startup9',context:'role-aware'});
  window.TeamBullsRuntimeLoader=Object.freeze({version:'10.10.30-startup10',ready,state:runtimeDetail,retry:healFailedModules,student:loadStudentPriority});
  window.addEventListener('online',()=>{scheduleHeal(500);contextChanged();});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleHeal(700);});window.addEventListener('pageshow',()=>scheduleHeal(900));if(window.TeamBulls107)load();else window.addEventListener('team-bulls-v107-ready',load,{once:true});
})();