/* Aplica o tema salvo antes que a folha de estilos pinte a primeira tela. */
(function applyStoredThemeBeforeFirstPaint(){
  try{
    const raw=localStorage.getItem('team_bulls_settings_v9_4')||localStorage.getItem('team_bulls_settings_v9');
    const settings=raw?JSON.parse(raw):null;
    const light=settings?.theme==='light';
    document.documentElement.dataset.theme=light?'light':'dark';
    const color=light?'#ffffff':'#000000';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',color);
    document.querySelector('meta[name="msapplication-TileColor"]')?.setAttribute('content',color);
  }catch(error){document.documentElement.dataset.theme='dark';}
})();

/* O acesso lembrado pertence ao aparelho. Nenhuma camada deve reativar
 * automaticamente o gerenciador de senhas da conta Google no formulário.
 * O navegador ainda decide sua própria interface ao editar uma senha manualmente.
 */
(function(){
  if(window.__TEAM_BULLS_EARLY_AUTH_AUTOFILL_101027__)return;
  window.__TEAM_BULLS_EARLY_AUTH_AUTOFILL_101027__=true;

  function patchAuthAutocomplete(){
    const form=document.getElementById('panel-login');
    const email=document.getElementById('login-email');
    const password=document.getElementById('login-pass');
    if(form){
      form.setAttribute('autocomplete','off');
    }
    if(email){
      email.setAttribute('autocomplete','off');
      email.setAttribute('name','tb_access_identity');
    }
    if(password){
      password.setAttribute('autocomplete','off');
      password.setAttribute('name','tb_access_secret');
    }
    return !!(form&&email&&password);
  }

  let observer=null;
  if(!patchAuthAutocomplete()&&typeof MutationObserver==='function'){
    observer=new MutationObserver(()=>{
      if(!patchAuthAutocomplete())return;
      observer?.disconnect();observer=null;
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>{patchAuthAutocomplete();observer?.disconnect();observer=null;},6000);
  }
  document.addEventListener('focusin',event=>{
    if(event.target?.id==='login-email'||event.target?.id==='login-pass')patchAuthAutocomplete();
  },true);
  window.TeamBullsEarlyAuthAutofill=Object.freeze({patch:patchAuthAutocomplete});
})();

/* Team Bulls v10.10.27 — persistência determinística da autenticação no PWA.
 *
 * A revisão anterior neutralizava SESSION depois que o core já existia, mas o
 * polling podia encerrar assim que configureAuthPersistence fosse embrulhada,
 * mesmo se Firebase Auth ainda não estivesse pronto. Este guard mantém a
 * tentativa até auth existir e protege também o início do listener e o login.
 * Fechar o aplicativo não é logout; SAIR DA CONTA continua usando auth.signOut().
 */
(function(){
  if(window.__TEAM_BULLS_PERSISTENT_AUTH_101027__)return;
  window.__TEAM_BULLS_PERSISTENT_AUTH_101027__=true;

  const state={attempts:0,applied:false,lastAppliedAt:0,lastError:''};
  let applying=null;
  let configureWrapped=false;
  let listenerWrapped=false;
  let loginWrapped=false;

  function localPersistenceValue(){
    try{return typeof firebase!=='undefined'&&firebase.auth?.Auth?.Persistence?.LOCAL||null;}
    catch(error){return null;}
  }
  function currentAuth(){
    try{return typeof auth!=='undefined'&&auth?.setPersistence?auth:null;}
    catch(error){return null;}
  }
  function applyLocalPersistence(){
    const authInstance=currentAuth();
    const persistence=localPersistenceValue();
    if(!authInstance||!persistence)return Promise.resolve(false);
    if(applying)return applying;
    state.attempts++;
    applying=Promise.resolve(authInstance.setPersistence(persistence)).then(()=>{
      state.applied=true;state.lastAppliedAt=Date.now();state.lastError='';return true;
    }).catch(error=>{
      state.applied=false;state.lastError=String(error?.code||error?.message||'persistence-error').slice(0,180);
      console.warn('[Team Bulls] Persistência LOCAL do Firebase será tentada novamente.',error);
      return false;
    }).finally(()=>{applying=null;});
    return applying;
  }
  function boundedPersistence(timeout=450){
    return Promise.race([
      applyLocalPersistence(),
      new Promise(resolve=>setTimeout(()=>resolve(false),Math.max(100,timeout)))
    ]);
  }
  function copyFunctionFlags(target,source){
    try{Object.keys(source||{}).forEach(key=>{try{target[key]=source[key];}catch(error){}});}catch(error){}
    return target;
  }

  function wrapConfigurePersistence(){
    try{
      if(typeof configureAuthPersistence!=='function')return false;
      if(configureAuthPersistence.__tbPersistentPwaSession101027){configureWrapped=true;return true;}
      const wrapped=function(){return applyLocalPersistence();};
      copyFunctionFlags(wrapped,configureAuthPersistence);
      wrapped.__tbPersistentPwaSession=true;
      wrapped.__tbPersistentPwaSession101027=true;
      configureAuthPersistence=wrapped;
      configureWrapped=true;
      return true;
    }catch(error){return false;}
  }

  function wrapStartAuthListener(){
    try{
      if(typeof startAuthListener!=='function')return false;
      if(startAuthListener.__tbPersistentBeforeListener101027){listenerWrapped=true;return true;}
      const base=startAuthListener;
      const wrapped=function(){
        const context=this,args=arguments;
        boundedPersistence(450).finally(()=>base.apply(context,args));
      };
      copyFunctionFlags(wrapped,base);
      wrapped.__tbPersistentBeforeListener101027=true;
      startAuthListener=wrapped;
      listenerWrapped=true;
      return true;
    }catch(error){return false;}
  }

  function wrapLogin(){
    try{
      if(typeof doLogin!=='function')return false;
      if(doLogin.__tbPersistentBeforeLogin101027){loginWrapped=true;return true;}
      const base=doLogin;
      const wrapped=async function(){
        await boundedPersistence(700);
        return base.apply(this,arguments);
      };
      copyFunctionFlags(wrapped,base);
      wrapped.__tbPersistentBeforeLogin101027=true;
      doLogin=wrapped;
      loginWrapped=true;
      return true;
    }catch(error){return false;}
  }

  function installPolicy(){
    wrapConfigurePersistence();
    wrapStartAuthListener();
    wrapLogin();
    applyLocalPersistence().catch(()=>{});
    return configureWrapped&&listenerWrapped&&loginWrapped;
  }

  async function poll(attempt=0){
    const installed=installPolicy();
    const applied=await boundedPersistence(260);
    if(installed&&applied)return;
    if(attempt<300)setTimeout(()=>poll(attempt+1),attempt<50?20:80);
  }

  setTimeout(()=>poll(0),0);
  document.addEventListener('DOMContentLoaded',()=>{installPolicy();applyLocalPersistence().catch(()=>{});},{once:true});
  window.addEventListener('pageshow',()=>{installPolicy();applyLocalPersistence().catch(()=>{});},{passive:true});
  window.addEventListener('online',()=>{installPolicy();applyLocalPersistence().catch(()=>{});},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){installPolicy();applyLocalPersistence().catch(()=>{});}},{passive:true});

  window.TeamBullsAuthPersistence=Object.freeze({
    revision:'10.10.27-auth-persistence2',
    apply:applyLocalPersistence,
    install:installPolicy,
    state:()=>({...state,configureWrapped,listenerWrapped,loginWrapped,authReady:!!currentAuth()})
  });
})();

window.__fbLoadErrors=0;
window.__teamBullsBootErrors=[];
try{if(window.top!==window.self)window.top.location=window.self.location.href;}catch(error){document.documentElement.style.display='none';}

/*
 * Team Bulls — boot de recuperação de autenticação e interação.
 *
 * Regra principal: o boot NÃO carrega módulos de Home/perfil/usabilidade.
 * Esses módulos pertencem ao runtime normal e só podem assumir a interface
 * depois que o core decidir a sessão. O boot apenas garante que:
 * 1) o pull-to-refresh legado não deixe o app sem cliques;
 * 2) um backdrop realmente órfão não cubra toda a interface;
 * 3) loading/autenticação sempre tenham uma saída utilizável.
 */
(function(){
  if(window.__TEAM_BULLS_BOOT_SAFETY_2__)return;
  window.__TEAM_BULLS_BOOT_SAFETY_2__=true;

  const MOBILE_QUERY='(max-width: 899px), (pointer: coarse)';
  const REVISION='auth-interaction-20260901-1';
  const orphanState=new WeakMap();

  function mobileLike(){
    try{return window.matchMedia?.(MOBILE_QUERY)?.matches===true||window.innerWidth<900;}
    catch(error){return window.innerWidth<900;}
  }

  /* O IIFE legado de interaction_v10_10_9.js contém o pull-to-refresh que pode
     aplicar pull-refresh-running. No mobile/coarse ele permanece desativado. */
  if(mobileLike())window.__TEAM_BULLS_INTERACTION_V10101__=true;

  function rendered(element){
    if(!(element instanceof Element))return false;
    const style=getComputedStyle(element);
    if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity||1)===0)return false;
    const rect=element.getBoundingClientRect();
    return rect.width>2&&rect.height>2&&rect.bottom>0&&rect.right>0&&rect.top<innerHeight&&rect.left<innerWidth;
  }
  function modalPanels(modal){
    if(!(modal instanceof Element))return[];
    return [...modal.querySelectorAll('.modal-sheet,.modal-dialog,[role="dialog"],[role="alertdialog"]')].filter(rendered);
  }
  function visibleOpenModal(){
    return [...document.querySelectorAll('.modal-backdrop.open')].some(modal=>rendered(modal)&&modalPanels(modal).length>0);
  }
  function loadingActive(){return !!document.getElementById('screen-loading')?.classList.contains('active');}
  function authActive(){return !!document.getElementById('screen-auth')?.classList.contains('active');}

  function injectStyle(){
    if(document.getElementById('tb-boot-safety-style'))return;
    const style=document.createElement('style');
    style.id='tb-boot-safety-style';
    style.textContent=`
      @media(max-width:899px),(pointer:coarse){
        html.pull-refresh-running #app{pointer-events:auto!important}
      }
      .modal-backdrop[data-tb-orphan-backdrop="1"]{display:none!important;pointer-events:none!important;visibility:hidden!important}
      body.tb-auth-failopen #portrait-lock-overlay{display:none!important;pointer-events:none!important}
      body.tb-auth-failopen .modal-backdrop.open{display:none!important;pointer-events:none!important}
      body.tb-auth-failopen #app,
      body.tb-auth-failopen #screen-auth,
      body.tb-auth-failopen #screen-auth *{pointer-events:auto!important}
    `;
    document.head.appendChild(style);
  }

  function resetRefreshIndicator(){
    const indicator=document.getElementById('pull-refresh-indicator');
    if(indicator){
      indicator.classList.remove('refreshing','visible','armed');
      indicator.style.removeProperty('--pull-distance');
      indicator.style.removeProperty('--pull-progress');
    }
    const label=document.getElementById('pull-refresh-label');
    if(label)label.textContent='Puxe para atualizar';
  }

  function releaseInteraction({forceAuth=false}={}){
    const html=document.documentElement,body=document.body,app=document.getElementById('app');
    html?.classList.remove('pull-refresh-running');
    window.__TEAM_BULLS_REFRESHING__=false;
    resetRefreshIndicator();

    [html,body,app].forEach(node=>{
      if(!node)return;
      if(node.style.pointerEvents==='none')node.style.removeProperty('pointer-events');
    });

    if(app&&(forceAuth||!visibleOpenModal())){
      app.removeAttribute('inert');
      if(app.getAttribute('aria-hidden')==='true')app.removeAttribute('aria-hidden');
    }

    if(forceAuth){
      html?.classList.remove('mobile-landscape-blocked','tb-student-home-v17');
      body?.classList.remove('student-desktop','trainer-desktop');
    }
  }

  function directCloseOrphan(modal,marker='1'){
    if(!(modal instanceof HTMLElement))return;
    modal.dataset.tbOrphanBackdrop=marker;
    modal.classList.remove('open');
    modal.removeAttribute('aria-modal');
    modal.style.removeProperty('z-index');
    modal.style.removeProperty('pointer-events');
    try{modal.inert=false;}catch(error){}
    orphanState.delete(modal);
  }

  function scanOrphanModals(){
    const modals=[...document.querySelectorAll('.modal-backdrop.open')];
    for(const modal of modals){
      if(!rendered(modal)){orphanState.delete(modal);continue;}
      if(modalPanels(modal).length){orphanState.delete(modal);continue;}
      const now=Date.now();
      const previous=orphanState.get(modal)||{misses:0,firstSeen:now};
      const next={misses:previous.misses+1,firstSeen:previous.firstSeen};
      orphanState.set(modal,next);
      if(next.misses>=2&&now-next.firstSeen>=700)directCloseOrphan(modal);
    }
    releaseInteraction();
  }

  function suppressAuthBlockers(){
    if(!authActive())return false;
    document.body?.classList.add('tb-auth-failopen');
    releaseInteraction({forceAuth:true});

    /* Nenhum fluxo de login/cadastro do app depende de modal-backdrop. Se um
       backdrop sobreviveu ao retorno para auth, ele é necessariamente resíduo
       de uma tela anterior e não pode continuar capturando mouse/toque. */
    document.querySelectorAll('.modal-backdrop.open').forEach(modal=>directCloseOrphan(modal,'auth'));

    const auth=document.getElementById('screen-auth');
    if(auth){
      auth.removeAttribute('inert');
      auth.removeAttribute('aria-hidden');
      if(auth.style.pointerEvents==='none')auth.style.removeProperty('pointer-events');
    }
    return true;
  }

  function leaveAuthFailOpen(){
    if(authActive())return;
    document.body?.classList.remove('tb-auth-failopen');
  }

  function activateAuth(message='A verificação da sessão demorou. Você já pode entrar novamente sem apagar seus dados.'){
    const auth=document.getElementById('screen-auth');
    if(!auth)return false;
    document.querySelectorAll('.screen.active').forEach(screen=>screen.classList.remove('active'));
    auth.classList.add('active');
    suppressAuthBlockers();
    const error=document.getElementById('login-error');
    if(error&&!error.classList.contains('show')){
      error.textContent=message;
      error.classList.add('show');
    }
    try{window.dispatchEvent(new CustomEvent('team-bulls-auth-failopen'));}catch(error){}
    return true;
  }

  function diagnostic(){
    const points=[
      [Math.round(innerWidth/2),Math.round(innerHeight/2)],
      [Math.round(innerWidth/2),Math.max(1,Math.round(innerHeight-72))]
    ];
    return{
      revision:REVISION,
      loading:loadingActive(),
      auth:authActive(),
      refreshing:!!window.__TEAM_BULLS_REFRESHING__,
      htmlClasses:document.documentElement.className,
      bodyClasses:document.body?.className||'',
      appInert:document.getElementById('app')?.hasAttribute('inert')||false,
      appPointer:document.getElementById('app')?getComputedStyle(document.getElementById('app')).pointerEvents:'',
      openModals:[...document.querySelectorAll('.modal-backdrop.open')].map(modal=>({id:modal.id||'',panels:modalPanels(modal).length,pointer:getComputedStyle(modal).pointerEvents})),
      hitTargets:points.map(([x,y])=>{const el=document.elementFromPoint(x,y);return el?{tag:el.tagName,id:el.id||'',class:String(el.className||'').slice(0,140)}:null;})
    };
  }

  function install(){
    injectStyle();
    releaseInteraction();

    const auth=document.getElementById('screen-auth');
    const loading=document.getElementById('screen-loading');
    const observer=typeof MutationObserver==='function'?new MutationObserver(()=>{
      if(authActive())suppressAuthBlockers();
      else leaveAuthFailOpen();
    }):null;
    if(observer){
      if(auth)observer.observe(auth,{attributes:true,attributeFilter:['class']});
      if(loading)observer.observe(loading,{attributes:true,attributeFilter:['class']});
    }

    [0,180,650,1500,3200,6500,11000].forEach(delay=>setTimeout(()=>{
      releaseInteraction();
      if(authActive())suppressAuthBlockers();
      scanOrphanModals();
    },delay));

    window.addEventListener('pageshow',()=>{releaseInteraction();if(authActive())suppressAuthBlockers();scanOrphanModals();},{passive:true});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){releaseInteraction();if(authActive())suppressAuthBlockers();scanOrphanModals();}},{passive:true});
    document.addEventListener('pointerdown',event=>{
      releaseInteraction();
      if(authActive())suppressAuthBlockers();
      if(event.target instanceof Element&&event.target.closest('.modal-backdrop.open'))setTimeout(scanOrphanModals,0);
    },{capture:true,passive:true});
  }

  window.TeamBullsRuntimeStabilityBoot=Object.freeze({
    revision:REVISION,
    release:releaseInteraction,
    scan:scanOrphanModals,
    diagnostic,
    activateAuth
  });
  window.TeamBullsBootSafety=window.TeamBullsRuntimeStabilityBoot;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();

/*
 * Compatibilidade de emergência para builds antigos que ainda podem criar um
 * diálogo de atualização em tela cheia. O guard é específico para esse diálogo.
 */
(function(){
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toUpperCase();
  const LEGACY_ACTION='LIMPAR CACHE E REINICIAR';
  const LEGACY_TITLE='ATUALIZACAO DO APLICATIVO';
  let released=0;

  function legacyControl(){
    const controls=document.querySelectorAll('button,a,[role="button"]');
    for(const control of controls){if(normalize(control.textContent).includes(LEGACY_ACTION))return control;}
    return null;
  }
  function blockerRoot(control){
    if(!control)return null;
    const direct=control.closest('.modal-backdrop,[role="dialog"],.modal,.overlay,.dialog-backdrop');
    if(direct)return direct;
    let node=control;
    while(node?.parentElement&&node.parentElement!==document.body)node=node.parentElement;
    return node&&node!==document.body?node:null;
  }
  function releaseInteraction(){window.TeamBullsRuntimeStabilityBoot?.release?.();}
  function scan(){
    const control=legacyControl();
    if(!control)return false;
    const root=blockerRoot(control);
    const text=normalize(root?.textContent||control.parentElement?.textContent||'');
    if(!text.includes(LEGACY_TITLE)||!text.includes(LEGACY_ACTION))return false;
    if(root){
      root.dataset.tbLegacyUpdateBlocked='1';
      root.hidden=true;
      root.setAttribute('aria-hidden','true');
      try{root.inert=true;}catch(error){}
      root.style.setProperty('display','none','important');
      root.style.setProperty('pointer-events','none','important');
    }
    releaseInteraction();
    released++;
    window.__TEAM_BULLS_LEGACY_UPDATE_BLOCKER_RELEASED__=released;
    return true;
  }
  function install(){
    releaseInteraction();
    if(!document.getElementById('tb-update-failopen-style')){
      const style=document.createElement('style');
      style.id='tb-update-failopen-style';
      style.textContent='[data-tb-legacy-update-blocked="1"]{display:none!important;pointer-events:none!important;visibility:hidden!important}';
      document.head.appendChild(style);
    }
    [0,120,450,1200,2600,5000,9000,15000,30000,60000].forEach(delay=>setTimeout(scan,delay));
    window.addEventListener('pageshow',()=>{releaseInteraction();scan();},{passive:true});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){releaseInteraction();scan();}},{passive:true});
  }
  window.TeamBullsUpdateFailOpen=Object.freeze({scan,releaseInteraction});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();

/*
 * Recuperação da sessão: é independente do Firebase e do runtime tardio.
 * Se o loading não sair, o login é liberado diretamente; a restauração da
 * sessão pode continuar em segundo plano e, se concluir, o core navega normalmente.
 */
(function(){
  let revealTimer=null;
  function loadingActive(){return !!document.getElementById('screen-loading')?.classList.contains('active');}
  function stored(key){try{return localStorage.getItem(key);}catch(error){return null;}}
  function returningCloudSession(){
    const uid=String(stored('teamms_last_user_uid')||'').trim();
    const guest=stored('teamms_offline_pref')==='1'||stored('teamms_offline_mode')==='guest';
    return !!uid&&!guest;
  }
  function reveal(message){
    const run=()=>{
      const box=document.getElementById('loading-recovery');
      const text=document.getElementById('loading-recovery-text');
      if(text&&message)text.textContent=message;
      if(box)box.hidden=false;
    };
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
  }
  function hide(){clearTimeout(revealTimer);const box=document.getElementById('loading-recovery');if(box)box.hidden=true;}
  async function clearCachesAndReload(){
    const btn=document.getElementById('loading-clear-cache');if(btn){btn.disabled=true;btn.textContent='CORRIGINDO...';}
    try{
      if('serviceWorker' in navigator){const regs=await navigator.serviceWorker.getRegistrations();await Promise.allSettled(regs.filter(r=>location.href.startsWith(r.scope)).map(r=>r.unregister()));}
      if('caches' in window){const keys=await caches.keys();await Promise.allSettled(keys.filter(k=>k.startsWith('team-bulls-')).map(k=>caches.delete(k)));}
    }catch(error){console.warn('Falha ao limpar atualização antiga:',error);}
    location.replace('./recuperar.html?auto=1&t='+Date.now());
  }
  function localMode(){
    try{localStorage.setItem('teamms_offline_mode','guest');localStorage.setItem('teamms_offline_pref','1');}catch(error){}
    location.replace('./index.html?local='+Date.now());
  }
  function forceAuth(message){
    if(!loadingActive()&&document.getElementById('screen-auth')?.classList.contains('active')){
      window.TeamBullsRuntimeStabilityBoot?.activateAuth?.(message);
      return true;
    }
    if(!loadingActive())return false;
    return !!window.TeamBullsRuntimeStabilityBoot?.activateAuth?.(message);
  }

  window.TeamBullsRecovery={reveal,hide,retry:()=>location.reload(),clearCachesAndReload,localMode};

  const restoring=returningCloudSession();
  revealTimer=setTimeout(()=>{
    if(loadingActive())reveal(restoring?'Restaurando sua sessão. Se a conexão demorar, a tela de acesso será liberada automaticamente.':'A inicialização está demorando. A tela de acesso será liberada automaticamente.');
  },restoring?2200:1400);

  setTimeout(()=>{
    forceAuth(restoring?'A restauração da sessão demorou. Você já pode entrar novamente; seus dados continuam preservados.':'A verificação demorou. Você já pode entrar ou usar o modo local.');
  },restoring?3800:1800);

  /* Última barreira independente: nenhuma sessão pode ficar eternamente em loading. */
  setTimeout(()=>{
    if(loadingActive()||document.getElementById('screen-auth')?.classList.contains('active')){
      forceAuth('A conexão continua sendo verificada em segundo plano. A tela de acesso foi mantida liberada.');
    }
  },8000);

  window.addEventListener('error',event=>{
    window.__teamBullsBootErrors.push(String(event?.message||'erro de inicialização'));
    if(loadingActive())reveal('O aplicativo encontrou uma falha ao iniciar. Seus registros locais foram preservados.');
  });
  window.addEventListener('unhandledrejection',event=>{
    window.__teamBullsBootErrors.push(String(event?.reason?.message||event?.reason||'falha assíncrona'));
    if(loadingActive())reveal('O servidor demorou para responder. Seus registros locais foram preservados.');
  });
})();

// BEGIN DEVICE ACCESS BOOTSTRAP
/* Uma sessão Firebase LOCAL por conta, sem guardar a senha ou vincular Google.
 * Apenas metadados email/uid ficam na lista; o SDK guarda e renova a sessão.
 * O Auth principal e a validação remota do perfil continuam controlando o app.
 */
(()=>{
  if(window.TeamBullsDeviceAccess)return;
  const KEY='team_bulls_device_accounts_v1',MAX=8;
  const normalize=value=>String(value||'').normalize('NFKC').trim().toLowerCase();
  const failure=code=>Object.assign(new Error(code),{code});
  const expired=new Set(['auth/user-token-expired','auth/invalid-user-token','auth/user-disabled','auth/user-not-found','team-bulls/device-account-mismatch']);
  const attestedApps=new WeakSet();
  let pending=Promise.resolve();
  const serial=task=>{const result=pending.then(task);pending=result.catch(()=>{});return result;};
  const records=()=>{
    try{const value=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(value)?value.filter(item=>typeof item?.email==='string'&&typeof item?.uid==='string'&&item.uid).slice(0,MAX):[];}
    catch(error){return [];}
  };
  function mainAuth(){try{return typeof auth!=='undefined'?auth:null;}catch(error){return null;}}
  function notify(){window.TeamBullsKnownAccounts?.render?.();}
  function write(value){localStorage.setItem(KEY,JSON.stringify(value));notify();}
  function bounded(task,ms=6000){
    let timer;
    return Promise.race([Promise.resolve(task),new Promise((_,reject)=>{timer=setTimeout(()=>reject(failure('team-bulls/device-timeout')),ms);})]).finally(()=>clearTimeout(timer));
  }
  async function accountAuth(uid,attest=true){
    const source=mainAuth();if(!source)throw failure('team-bulls/device-unavailable');
    const name='tb-device-v1-'+uid;
    const app=firebase.apps.find(item=>item.name===name)||firebase.initializeApp(source.app.options,name);
    const key=typeof CFG!=='undefined'?String(CFG.appCheckSiteKey||'').trim():'';
    if(attest&&key&&!attestedApps.has(app)){
      // Auth também envia App Check. A instância que lembra a conta precisa da
      // mesma atestação do app principal antes de restaurar/renovar seus tokens.
      if(typeof firebase.appCheck!=='function'&&typeof initOptionalAppCheck==='function')await bounded(initOptionalAppCheck());
      if(typeof firebase.appCheck!=='function'||typeof app.appCheck!=='function')throw failure('team-bulls/device-attestation-unavailable');
      const Provider=firebase.appCheck.ReCaptchaEnterpriseProvider||firebase.appCheck.ReCaptchaV3Provider;
      if(!Provider)throw failure('team-bulls/device-attestation-unavailable');
      app.appCheck().activate(new Provider(key),false);
      attestedApps.add(app);
    }
    return app.auth(); // Não cria Firestore nem listeners de dados para estas instâncias.
  }
  async function ready(service){
    await bounded(service.setPersistence(firebase.auth.Auth.Persistence.LOCAL));
    // currentUser pode estar vazio antes de o IndexedDB terminar a restauração.
    let unsubscribe;
    try{return await bounded(new Promise((resolve,reject)=>{unsubscribe=service.onAuthStateChanged(resolve,reject);}));}
    finally{unsubscribe?.();}
  }
  async function clearSession(record){
    const service=await accountAuth(record.uid,false);
    await bounded(service.signOut());
    await service.app.delete();
  }
  async function forgetRecord(email){
    const list=records(),record=list.find(item=>normalize(item.email)===email);
    if(!record)return false;
    // Não anunciar remoção se o SDK não conseguiu apagar a sessão persistida.
    await clearSession(record);
    const current=mainAuth();
    if(current?.currentUser?.uid===record.uid)await bounded(current.signOut());
    write(list.filter(item=>normalize(item.email)!==email));
    return true;
  }
  function remember(user){return serial(async()=>{
    if(!user?.uid||!user.email||mainAuth()?.currentUser?.uid!==user.uid)return false;
    const email=normalize(user.email),list=records();
    try{
      // Libera a sessão excedente antes de persistir uma nona conta.
      const remaining=list.filter(item=>normalize(item.email)!==email&&item.uid!==user.uid);
      for(const old of list.filter(item=>normalize(item.email)===email&&item.uid!==user.uid))await clearSession(old);
      for(const old of remaining.slice(MAX-1))await clearSession(old);
      const service=await accountAuth(user.uid);
      await ready(service);
      await bounded(service.updateCurrentUser(user));
      write([{email,uid:user.uid},...remaining.slice(0,MAX-1)]);
      return true;
    }catch(error){console.warn('[Team Bulls] Não foi possível lembrar o acesso neste aparelho:',error?.code||'device-storage');return false;}
  });}
  function restore(value,{canActivate=()=>true}={}){return serial(async()=>{
    const email=normalize(value),record=records().find(item=>normalize(item.email)===email);
    if(!record)throw failure('team-bulls/device-missing');
    if(navigator.onLine===false)throw failure('auth/network-request-failed');
    const target=mainAuth();
    try{
      const service=await accountAuth(record.uid),user=await ready(service);
      if(!user||user.uid!==record.uid||normalize(user.email)!==email)throw failure('team-bulls/device-account-mismatch');
      // Renova no servidor: senha alterada, sessão revogada e conta desativada
      // exigem um novo login. Nenhum perfil é liberado só pelos metadados locais.
      await bounded(user.getIdToken(true));
      if(mainAuth()!==target||!canActivate())throw failure('team-bulls/device-cancelled');
      await bounded(target.setPersistence(firebase.auth.Auth.Persistence.LOCAL));
      if(!canActivate())throw failure('team-bulls/device-cancelled');
      await target.updateCurrentUser(user);
      return true;
    }catch(error){
      if(expired.has(error?.code))await forgetRecord(email).catch(()=>{});
      throw error;
    }
  });}
  window.TeamBullsDeviceAccess=Object.freeze({remember,restore,
    has:value=>records().some(item=>normalize(item.email)===normalize(value)),
    forget:value=>serial(()=>forgetRecord(normalize(value)))
  });
})();
// END DEVICE ACCESS BOOTSTRAP

// BEGIN LOGIN ACCOUNT PICKER BOOTSTRAP
/* Login account picker: keep known student emails available during session fail-open. */
(()=>{
  if(window.__TEAM_BULLS_KNOWN_ACCOUNTS_BOOTSTRAP__)return;
  window.__TEAM_BULLS_KNOWN_ACCOUNTS_BOOTSTRAP__=true;
  const KEY='team_bulls_known_accounts_v1';
  const CREDENTIALS_KEY='team_bulls_offline_credentials';
  const MAX=8;
  const normalize=value=>String(value||'').normalize('NFKC').trim().toLowerCase().slice(0,320);
  const readJson=(key,fallback)=>{try{const value=localStorage.getItem(key);return value?JSON.parse(value):fallback;}catch(error){return fallback;}};
  const known=()=>{
    const emails=new Set();
    const saved=readJson(KEY,[]);
    if(Array.isArray(saved))saved.forEach(value=>{const email=normalize(value);if(email)emails.add(email);});
    const credentials=readJson(CREDENTIALS_KEY,{});
    if(credentials&&typeof credentials==='object')Object.values(credentials).forEach(record=>{const email=normalize(record?.email);if(email)emails.add(email);});
    return Array.from(emails).slice(0,MAX);
  };
  let host=null,installedInput=null;
  function render(){
    const emailInput=document.getElementById('login-email');
    if(!emailInput)return false;
    const accounts=known();
    host=document.getElementById('tb-known-accounts')||host;
    if(!accounts.length){host?.remove();host=null;return false;}
    if(!host){
      host=document.createElement('div');host.id='tb-known-accounts';host.className='tb-known-accounts';host.setAttribute('role','group');host.setAttribute('aria-label','Contas neste aparelho');
      const field=emailInput.closest('.form-group');
      if(!field)return false;
      field.insertAdjacentElement('afterend',host);
    }
    host.replaceChildren();
    const title=document.createElement('span');title.className='tb-known-accounts-title';title.textContent='Contas neste aparelho';
    const list=document.createElement('div');list.className='tb-known-accounts-list';
    const hint=document.createElement('span');hint.className='tb-password-manager-hint';hint.textContent='Toque no e-mail para usar o acesso salvo neste aparelho. No primeiro acesso, informe a senha.';
    const current=normalize(emailInput.value);
    accounts.forEach(email=>{
      const button=document.createElement('button');button.type='button';button.className='tb-known-account'+(email===current?' active':'');button.textContent=email;button.title='Usar '+email;
      button.disabled=!!document.getElementById('btn-login')?.disabled;
      button.addEventListener('click',()=>{
        emailInput.value=email;
        const password=document.getElementById('login-pass');if(password)password.value='';
        emailInput.dispatchEvent(new Event('input',{bubbles:true}));render();
        if(typeof loginWithSavedDeviceAccount==='function')loginWithSavedDeviceAccount(email);
      });
      if(window.TeamBullsDeviceAccess?.has(email)){
        const row=document.createElement('div');row.className='tb-known-account-row';
        const remove=document.createElement('button');remove.type='button';remove.className='tb-forget-device-access';remove.textContent='Esquecer acesso';remove.setAttribute('aria-label','Esquecer acesso salvo de '+email);
        remove.disabled=button.disabled;
        remove.addEventListener('click',async()=>{
          remove.disabled=true;
          try{await window.TeamBullsDeviceAccess.forget(email);render();}
          catch(error){if(typeof showAuthError==='function')showAuthError('login-error','Não foi possível remover o acesso deste aparelho. Tente novamente.');remove.disabled=false;}
        });
        row.append(button,remove);list.appendChild(row);
      }else list.appendChild(button);
    });
    host.append(title,list,hint);
    if(installedInput!==emailInput){installedInput=emailInput;emailInput.addEventListener('input',render,{passive:true});}
    return true;
  }
  function remember(value){
    const email=normalize(value);if(!email)return known();
    const saved=readJson(KEY,[]),list=Array.isArray(saved)?saved.map(normalize).filter(Boolean):[];
    const next=[email,...list.filter(item=>item!==email)].slice(0,MAX);
    try{localStorage.setItem(KEY,JSON.stringify(next));}catch(error){}
    render();return next;
  }
  window.TeamBullsKnownAccounts=Object.freeze({version:'10.10.9-quickpick1',render,remember,list:known});
  window.addEventListener('pageshow',render,{passive:true});
  window.addEventListener('storage',event=>{if(!event.key||event.key===KEY||event.key===CREDENTIALS_KEY)render();},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')render();},{passive:true});
  if(!render()&&document.readyState==='loading'&&typeof MutationObserver==='function'){
    const observer=new MutationObserver(()=>{if(render())observer.disconnect();});
    observer.observe(document.documentElement,{childList:true,subtree:true});
    document.addEventListener('DOMContentLoaded',()=>{if(!render())observer.disconnect();},{once:true});
  }else if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});
})();
// END LOGIN ACCOUNT PICKER BOOTSTRAP
