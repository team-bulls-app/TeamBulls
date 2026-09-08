/* Team Bulls v10.10.9 — atualizador da PWA com revisão de build. */
'use strict';
(()=>{
  const CURRENT_VERSION='10.10.9';
  const CURRENT_BUILD=2026090802;
  const CHECK_INTERVAL_MS=2*60*1000;
  const VERSION_URL='./version.json';
  const TECHNIQUE_COMPOSITION_MODULE='./modules/technique-composition-integrity-v10_10_12.js?v=10.10.12-techcombo1';
  const STUDENT_HOME_MODULE='./modules/student-home-profile-v10_10_12.js?v=10.10.20-studenthome3';
  const STUDENT_HOME_LAYOUT_MODULE='./modules/student-home-layout-v10_10_15.js?v=10.10.21-home4';
  const STUDENT_REQUEST_REALTIME_MODULE='./modules/student-request-realtime-v10_10_32.js?v=10.10.32-studentrealtime3';
  const STUDENT_DIET_COMPACT_MODULE='./modules/student-diet-compact-live-v10_10_23.js?v=10.10.23-dietcompact1';
  const UPDATE_RELOAD_KEY='team-bulls-update-reload-version';
  const UPDATE_FLUSH_BUDGET_MS=700;
  const UPDATE_WORKER_WAIT_MS=900;
  const UPDATE_CONTROLLER_WAIT_MS=2200;
  const BACKGROUND_CHECK_DELAY_MS=1800;
  const CRITICAL_REFRESH_CONCURRENCY=4;
  const CRITICAL_ASSETS=[
    './index.html','./manifest.json?v=10.10.9','./version.json','./viewport_v10_10_9.js?v=10.10.9','./boot_v10.js?v=10.10.9','./config_v10_7.js?v=10.10.9','./update_v10_10_9.js?v=10.10.9','./app_v10_10_9_core.js?v=10.10.9','./modules/v107-core.js?v=10.10.9','./modules/v107-invites.js?v=10.10.9','./modules/v107-operations.js?v=10.10.9','./modules/session-restore-recovery-ux-v10_10_31.js?v=10.10.31-sessionrestore1','./modules/student-home-fast-protocol-date-v10_10_31.js?v=10.10.31-fastdates1','./modules/registration-integrity-v10_10_9.js?v=10.10.9-registration2','./modules/photo-quality-download-v10_10_9.js?v=10.10.9-photoquality2','./modules/heic-report-conversion-v10_10_12.js?v=10.10.12-heic1','./modules/heic-libheif-worker-v10_10_12.js?v=10.10.12-heicworker1','./modules/trainer-inbox-payments-v10_10_12.js?v=10.10.12-inboxpayments2','./modules/release-coherence-v10_10_10.js?v=10.10.12-release6',TECHNIQUE_COMPOSITION_MODULE,STUDENT_HOME_MODULE,STUDENT_HOME_LAYOUT_MODULE,STUDENT_REQUEST_REALTIME_MODULE,STUDENT_DIET_COMPACT_MODULE,'./modules/custom-food-calorie-bridge-v10_10_12.js?v=10.10.12-customfood2','./modules/diet-live-deficit-v10_10_13.js?v=10.10.13-deficit1','./interaction_v10_10_9.js?v=10.10.9','./styles_v10_10_9.css?v=10.10.9'
  ];
  let registration=null,latestInfo=null,checking=null,applying=false,banner=null,scheduledCheckTimer=null,techniqueModulePromise=null,studentHomePromise=null,studentLayoutPromise=null;
  function numericParts(value){return String(value||'').split('.').map(part=>Number.parseInt(part,10)||0);}
  function compareVersions(left,right){const a=numericParts(left),b=numericParts(right),size=Math.max(a.length,b.length);for(let i=0;i<size;i++){const diff=(a[i]||0)-(b[i]||0);if(diff)return diff>0?1:-1;}return 0;}
  function buildNumber(value){const number=Math.trunc(Number(value)||0);return Number.isFinite(number)&&number>0?number:0;}
  function compareRelease(info){const version=String(info?.version||CURRENT_VERSION),versionDiff=compareVersions(version,CURRENT_VERSION);if(versionDiff)return versionDiff;const remoteBuild=buildNumber(info?.build);if(remoteBuild===CURRENT_BUILD)return 0;return remoteBuild>CURRENT_BUILD?1:-1;}
  function releaseKey(info={}){return `${String(info.version||CURRENT_VERSION)}@${buildNumber(info.build)||CURRENT_BUILD}`;}
  function isSameVersionHotfix(info){return compareVersions(String(info?.version||''),CURRENT_VERSION)===0&&buildNumber(info?.build)>CURRENT_BUILD;}
  function isOnline(){return navigator.onLine!==false;}
  function activeScreen(){return document.querySelector('.screen.active')?.id||'';}
  function currentRuntimeRole(){
    try{const role=String(typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role||'');if(role==='student'||role==='trainer')return role;}catch(error){}
    const screen=activeScreen();
    if(document.body?.classList.contains('trainer-desktop')||screen==='screen-trainer'||screen.startsWith('screen-ts-'))return'trainer';
    if(document.body?.classList.contains('student-desktop'))return'student';
    return'';
  }
  function localLikeRuntime(){
    try{if(typeof MODE!=='undefined'&&MODE==='local')return true;}catch(error){}
    try{const access=String(typeof ACCESS_MODE!=='undefined'?ACCESS_MODE:'');return access==='offline-registered'||access==='local-inactive';}catch(error){return false;}
  }
  function studentHomeRelevant(){
    if(localLikeRuntime())return true;
    const role=currentRuntimeRole();if(role==='trainer')return false;if(role==='student')return true;
    return activeScreen()==='screen-home'&&!document.body?.classList.contains('trainer-desktop');
  }
  function techniqueCompositionRelevant(){
    if(localLikeRuntime())return true;
    const role=currentRuntimeRole();if(role==='student')return false;if(role==='trainer')return true;
    const screen=activeScreen();return document.body?.classList.contains('trainer-desktop')||screen==='screen-trainer'||screen.startsWith('screen-ts-');
  }
  function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
  function waitForState(worker,desired,timeout=7000){if(!worker)return Promise.resolve(false);if(worker.state===desired)return Promise.resolve(true);return new Promise(resolve=>{let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);worker.removeEventListener('statechange',onState);resolve(value);};const onState=()=>{if(worker.state===desired)finish(true);else if(worker.state==='redundant')finish(false);};const timer=setTimeout(()=>finish(false),timeout);worker.addEventListener('statechange',onState);});}
  function waitForControllerChange(timeout=UPDATE_CONTROLLER_WAIT_MS){return new Promise(resolve=>{let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',changed);resolve(value);};const changed=()=>finish(true),timer=setTimeout(()=>finish(false),timeout);navigator.serviceWorker.addEventListener('controllerchange',changed,{once:true});});}
  function ensureBanner(){if(banner?.isConnected)return banner;const host=document.createElement('aside');host.id='team-bulls-update-banner';host.className='team-bulls-update-banner';host.hidden=true;host.setAttribute('role','status');host.setAttribute('aria-live','polite');host.innerHTML=`<div class="team-bulls-update-copy"><strong id="team-bulls-update-title">ATUALIZAÇÃO DISPONÍVEL</strong><span id="team-bulls-update-text">Uma revisão nova está pronta. Não é necessário desinstalar o aplicativo.</span></div><div class="team-bulls-update-actions"><button type="button" class="team-bulls-update-primary" id="team-bulls-update-now">ATUALIZAR AGORA</button><button type="button" class="team-bulls-update-later" id="team-bulls-update-later">DEPOIS</button></div>`;document.body.appendChild(host);host.querySelector('#team-bulls-update-now')?.addEventListener('click',()=>applyLatestUpdate());host.querySelector('#team-bulls-update-later')?.addEventListener('click',()=>{host.hidden=true;});banner=host;return host;}
  function setBannerState({title,text,busy=false,error=false,visible=true}={}){const host=ensureBanner(),titleEl=host.querySelector('#team-bulls-update-title'),textEl=host.querySelector('#team-bulls-update-text'),updateButton=host.querySelector('#team-bulls-update-now'),laterButton=host.querySelector('#team-bulls-update-later');if(title)titleEl.textContent=title;if(text)textEl.textContent=text;host.dataset.state=error?'error':busy?'busy':'ready';host.hidden=!visible;if(updateButton){updateButton.disabled=busy;updateButton.textContent=busy?'ATUALIZANDO...':'ATUALIZAR AGORA';}if(laterButton)laterButton.disabled=busy;}
  async function fetchLatestVersion(){const response=await fetch(`${VERSION_URL}?t=${Date.now()}`,{cache:'no-store',headers:{'Cache-Control':'no-cache','Pragma':'no-cache'}});if(!response.ok)throw new Error(`Não foi possível verificar a versão (${response.status}).`);const data=await response.json();if(!/^\d+\.\d+\.\d+$/.test(String(data?.version||'')))throw new Error('Resposta de versão inválida.');data.build=buildNumber(data.build);return data;}
  async function registerWorker(){if(!('serviceWorker' in navigator))return null;if(registration)return registration;registration=await navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(CURRENT_VERSION)}&b=${CURRENT_BUILD}`,{scope:'./',updateViaCache:'none'});return registration;}
  async function requestShellRefresh(worker){if(!worker)return false;return new Promise(resolve=>{let done=false;const finish=value=>{if(done)return;done=true;clearTimeout(timer);navigator.serviceWorker.removeEventListener('message',onMessage);resolve(value);};const onMessage=event=>{if(event.data?.type==='TEAM_BULLS_REFRESHED')finish(event.data.ok!==false);};const timer=setTimeout(()=>finish(false),8000);navigator.serviceWorker.addEventListener('message',onMessage);worker.postMessage({type:'REFRESH_APP_SHELL'});});}
  async function mapWithLimit(items,limit,worker){const results=new Array(items.length);let next=0;const run=async()=>{while(true){const index=next++;if(index>=items.length)return;results[index]=await worker(items[index],index);}};await Promise.all(Array.from({length:Math.min(limit,items.length)},run));return results;}
  async function refreshCriticalShell(){if(!('caches' in window)||!isOnline())return false;const cacheNames=(await caches.keys()).filter(name=>name.startsWith('team-bulls-shell-'));if(!cacheNames.length)return false;const stamp=String(Date.now());const fetched=await mapWithLimit(CRITICAL_ASSETS,CRITICAL_REFRESH_CONCURRENCY,async asset=>{const original=new URL(asset,location.href),fresh=new URL(original.href);fresh.searchParams.set('tb-refresh',stamp);const response=await fetch(fresh.href,{cache:'reload'});if(!response.ok)throw new Error(`Falha ao renovar ${original.pathname} (${response.status}).`);return{original:original.href,fresh:fresh.href,response};});for(const cacheName of cacheNames){const cache=await caches.open(cacheName);for(const item of fetched){await cache.put(item.original,item.response.clone());await cache.delete(item.fresh).catch(()=>false);}}return true;}

  function loadTechniqueCompositionIntegrity(){
    if(!techniqueCompositionRelevant())return Promise.resolve(false);
    if(window.TeamBullsTechniqueCompositionIntegrity)return Promise.resolve(true);
    if(techniqueModulePromise)return techniqueModulePromise;
    techniqueModulePromise=new Promise(resolve=>{
      const done=ok=>{if(!ok)techniqueModulePromise=null;resolve(!!ok);};
      const existing=[...document.scripts].find(script=>{try{return new URL(script.src,location.href).pathname.endsWith('/modules/technique-composition-integrity-v10_10_12.js');}catch(error){return false;}});
      if(existing){if(window.TeamBullsTechniqueCompositionIntegrity){done(true);return;}let settled=false;const finish=ok=>{if(settled)return;settled=true;clearTimeout(timer);done(ok);};const timer=setTimeout(()=>finish(!!window.TeamBullsTechniqueCompositionIntegrity),7000);existing.addEventListener('load',()=>finish(!!window.TeamBullsTechniqueCompositionIntegrity),{once:true});existing.addEventListener('error',()=>finish(false),{once:true});return;}
      const script=document.createElement('script');script.src=TECHNIQUE_COMPOSITION_MODULE;script.async=false;script.dataset.teamBullsTechniqueComposition='1';script.onload=()=>done(!!window.TeamBullsTechniqueCompositionIntegrity);script.onerror=()=>done(false);document.head.appendChild(script);
    });
    return techniqueModulePromise;
  }
  function scheduleTechniqueComposition(delay=120){setTimeout(()=>{if(!techniqueCompositionRelevant())return;loadTechniqueCompositionIntegrity().then(ok=>{if(!ok&&navigator.onLine!==false&&techniqueCompositionRelevant())setTimeout(()=>loadTechniqueCompositionIntegrity(),1800);}).catch(()=>{});},Math.max(0,delay));}

  function loadOptionalModule({src,pathSuffix,readyFlag,dataKey,promiseKey}){
    if(readyFlag())return Promise.resolve(true);
    if(promiseKey==='profile'&&studentHomePromise)return studentHomePromise;
    if(promiseKey==='layout'&&studentLayoutPromise)return studentLayoutPromise;
    const promise=new Promise(resolve=>{
      let settled=false;
      const done=ok=>{if(settled)return;settled=true;if(!ok){if(promiseKey==='profile')studentHomePromise=null;else studentLayoutPromise=null;}resolve(!!ok);};
      const existing=[...document.scripts].find(script=>{try{return new URL(script.src,location.href).pathname.endsWith(pathSuffix);}catch(error){return false;}});
      if(existing){if(readyFlag()){done(true);return;}const timer=setTimeout(()=>done(readyFlag()),7000);existing.addEventListener('load',()=>{clearTimeout(timer);done(readyFlag());},{once:true});existing.addEventListener('error',()=>{clearTimeout(timer);done(false);},{once:true});return;}
      const script=document.createElement('script');script.src=src;script.async=false;script.dataset[dataKey]='1';script.onload=()=>done(readyFlag());script.onerror=()=>done(false);document.head.appendChild(script);
    });
    if(promiseKey==='profile')studentHomePromise=promise;else studentLayoutPromise=promise;
    return promise;
  }
  function loadStudentHomeProfile(){return loadOptionalModule({src:STUDENT_HOME_MODULE,pathSuffix:'/modules/student-home-profile-v10_10_12.js',readyFlag:()=>!!window.TeamBullsStudentHome,dataKey:'teamBullsStudentHomeProfile',promiseKey:'profile'});}
  function loadStudentHomeLayout(){return loadOptionalModule({src:STUDENT_HOME_LAYOUT_MODULE,pathSuffix:'/modules/student-home-layout-v10_10_15.js',readyFlag:()=>!!window.TeamBullsStudentHomeLayout,dataKey:'teamBullsStudentHomeLayout',promiseKey:'layout'});}
  async function loadStudentHomeModules(){if(!studentHomeRelevant())return false;await loadStudentHomeProfile().catch(()=>false);return loadStudentHomeLayout().catch(()=>false);}
  function scheduleStudentHome(delay=180){setTimeout(()=>{if(!studentHomeRelevant())return;loadStudentHomeModules().then(ok=>{if(!ok&&navigator.onLine!==false&&studentHomeRelevant())setTimeout(()=>loadStudentHomeModules(),1800);}).catch(()=>{});},Math.max(0,delay));}

  async function prepareLatest({forceCheck=true}={}){if(!('serviceWorker' in navigator))return {version:CURRENT_VERSION,build:CURRENT_BUILD,reloadNeeded:false};const info=forceCheck?await fetchLatestVersion().catch(()=>latestInfo):latestInfo;if(info)latestInfo=info;const targetVersion=latestInfo?.version||CURRENT_VERSION,targetBuild=buildNumber(latestInfo?.build)||CURRENT_BUILD;const reg=await registerWorker(),workerUpdate=reg.update().catch(()=>null);let warmed=false;try{warmed=await refreshCriticalShell();}catch(error){console.warn('[Team Bulls] Renovação crítica incompleta:',error);}await Promise.race([workerUpdate,sleep(UPDATE_WORKER_WAIT_MS)]);let controllerChanged=false;if(reg.waiting){const change=waitForControllerChange();reg.waiting.postMessage({type:'SKIP_WAITING'});controllerChanged=await change;}else if(reg.installing)waitForState(reg.installing,'installed').catch(()=>false);if(!warmed){const active=reg.active||navigator.serviceWorker.controller;warmed=await requestShellRefresh(active).catch(()=>false);}if(!warmed)throw new Error('Não foi possível preparar os arquivos principais da atualização.');return{version:targetVersion,build:targetBuild,reloadNeeded:compareRelease(latestInfo)>0||controllerChanged||warmed};}
  async function flushBeforeReload(){try{window.dispatchEvent(new CustomEvent('team-bulls:before-refresh'));}catch(error){}const TB=window.TeamBulls107,pending=Promise.allSettled([Promise.resolve(TB?.flushDrafts?.()),Promise.resolve(TB?.flushPendingMutationSync?.()),Promise.resolve(window.TeamBullsSessionPerformance?.flush?.())]);await Promise.race([pending,sleep(UPDATE_FLUSH_BUDGET_MS)]);}
  function safeForAutomaticHotfix(){const screen=document.querySelector('.screen.active')?.id||'';if(screen==='screen-loading')return true;if(screen!=='screen-auth')return false;const active=document.activeElement;if(active?.matches?.('input,textarea,select'))return false;const password=String(document.getElementById('login-pass')?.value||'');const registerPassword=String(document.getElementById('reg-pass')?.value||'');return !password&&!registerPassword;}
  async function applyLatestUpdate({automatic=false}={}){if(applying)return;applying=true;setBannerState({title:automatic?'AJUSTANDO O APLICATIVO':'PREPARANDO ATUALIZAÇÃO',text:'Salvando o que está pendente e renovando os arquivos principais...',busy:true});try{if(!isOnline())throw new Error('Conecte o celular à internet para atualizar.');await flushBeforeReload();const prepared=await prepareLatest({forceCheck:true}),target={version:prepared.version||latestInfo?.version||CURRENT_VERSION,build:prepared.build||buildNumber(latestInfo?.build)||CURRENT_BUILD};sessionStorage.setItem(UPDATE_RELOAD_KEY,releaseKey(target));setBannerState({title:'ATUALIZAÇÃO PRONTA',text:'Reabrindo o Team Bulls com todos os recursos...',busy:true});await sleep(80);location.replace(`./index.html?updated=${encodeURIComponent(target.version)}&build=${encodeURIComponent(target.build)}&t=${Date.now()}`);}catch(error){console.error('[Team Bulls] Falha ao atualizar:',error);applying=false;setBannerState({title:'NÃO FOI POSSÍVEL ATUALIZAR',text:error?.message||'Tente novamente quando a conexão estiver estável.',error:true});}}
  async function checkForUpdates({showErrors=false,announceCurrent=false}={}){if(checking)return checking;checking=(async()=>{if(!isOnline())return null;try{const info=await fetchLatestVersion();latestInfo=info;registerWorker().then(reg=>reg?.update?.()).catch(()=>{});const newer=compareRelease(info)>0;if(newer){const hotfix=isSameVersionHotfix(info);setBannerState({title:hotfix?'CORREÇÃO DO APP DISPONÍVEL':`NOVA VERSÃO ${info.version}`,text:hotfix?'Uma revisão mais nova dos arquivos do Team Bulls está pronta. Seu login e seus dados serão preservados.':'Atualize com um toque. O aplicativo instalado, seu login e seus dados serão preservados.'});}else if(announceCurrent){setBannerState({title:'APLICATIVO ATUALIZADO',text:`Você já está usando a revisão mais recente do Team Bulls ${CURRENT_VERSION}.`});setTimeout(()=>{if(banner)banner.hidden=true;},4200);}return info;}catch(error){if(showErrors)setBannerState({title:'VERIFICAÇÃO INDISPONÍVEL',text:'Não foi possível consultar uma atualização agora.',error:true});return null;}finally{checking=null;}})();return checking;}
  function scheduleBackgroundCheck(delay=BACKGROUND_CHECK_DELAY_MS){clearTimeout(scheduledCheckTimer);scheduledCheckTimer=setTimeout(()=>{const run=()=>checkForUpdates().catch(()=>null);if('requestIdleCallback'in window)requestIdleCallback(run,{timeout:1200});else run();},Math.max(250,delay));}
  function announceCompletedUpdate(){const params=new URLSearchParams(location.search),updated=params.get('updated'),updatedBuild=buildNumber(params.get('build')),stored=sessionStorage.getItem(UPDATE_RELOAD_KEY),currentKey=releaseKey({version:CURRENT_VERSION,build:CURRENT_BUILD});if(updated===CURRENT_VERSION&&(!updatedBuild||updatedBuild===CURRENT_BUILD)){sessionStorage.removeItem(UPDATE_RELOAD_KEY);setBannerState({title:'APLICATIVO ATUALIZADO',text:`Team Bulls ${CURRENT_VERSION} pronto com a revisão mais recente.`,visible:true});const later=ensureBanner().querySelector('#team-bulls-update-later');if(later)later.textContent='FECHAR';setTimeout(()=>{if(banner)banner.hidden=true;},5000);params.delete('updated');params.delete('build');params.delete('t');const query=params.toString();history.replaceState(history.state,'',`${location.pathname}${query?'?'+query:''}${location.hash}`);}else if(stored===currentKey)sessionStorage.removeItem(UPDATE_RELOAD_KEY);}
  function init(){ensureBanner();announceCompletedUpdate();const afterLoad=()=>{scheduleTechniqueComposition(140);scheduleStudentHome(220);};if(document.readyState==='complete')afterLoad();else window.addEventListener('load',afterLoad,{once:true});if(!('serviceWorker' in navigator))return;if(document.readyState==='complete')scheduleBackgroundCheck(1800);else window.addEventListener('load',()=>scheduleBackgroundCheck(1800),{once:true});setInterval(()=>{if(document.visibilityState==='visible')scheduleBackgroundCheck(400);},CHECK_INTERVAL_MS);}
  window.TeamBullsUpdater=Object.freeze({version:CURRENT_VERSION,build:CURRENT_BUILD,check:checkForUpdates,manualCheck:()=>checkForUpdates({showErrors:true,announceCurrent:true}),prepareLatest,applyLatest:applyLatestUpdate,loadTechniqueCompositionIntegrity,loadStudentHomeModules});
  window.addEventListener('online',()=>{scheduleTechniqueComposition(250);scheduleStudentHome(320);scheduleBackgroundCheck(450);});
  window.addEventListener('team-bulls-runtime-ready',()=>{scheduleTechniqueComposition(0);scheduleStudentHome(40);});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){scheduleTechniqueComposition(50);scheduleStudentHome(80);scheduleBackgroundCheck(650);}});
  if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='TEAM_BULLS_SW_ACTIVATED'&&buildNumber(event.data?.build)>CURRENT_BUILD)scheduleBackgroundCheck(120);});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
