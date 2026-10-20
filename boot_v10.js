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

/* Team Bulls v10.10.27 — autofill de login disponível já no cold start.
 *
 * Este guard roda no <head>, antes do DOMContentLoaded. O HTML legado ainda
 * nasce com marcadores que alguns gerenciadores de senha interpretam como
 * "não preencher". Assim que o parser cria o formulário de login, corrigimos
 * somente a semântica de autofill. Nenhuma senha é lida ou persistida aqui.
 */
(function(){
  if(window.__TEAM_BULLS_EARLY_AUTH_AUTOFILL_101027__)return;
  window.__TEAM_BULLS_EARLY_AUTH_AUTOFILL_101027__=true;

  function patchAuthAutocomplete(){
    const form=document.getElementById('panel-login');
    const email=document.getElementById('login-email');
    const password=document.getElementById('login-pass');
    if(form){
      form.setAttribute('autocomplete','on');
      form.removeAttribute('data-form-type');
    }
    if(email){
      email.setAttribute('autocomplete','username');
      email.setAttribute('name','username');
      ['data-1p-ignore','data-lpignore','data-form-type','aria-autocomplete'].forEach(attribute=>email.removeAttribute(attribute));
    }
    if(password){
      password.setAttribute('autocomplete','current-password');
      password.setAttribute('name','password');
      ['data-1p-ignore','data-lpignore','data-form-type','aria-autocomplete'].forEach(attribute=>password.removeAttribute(attribute));
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
