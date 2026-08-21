/* Configuração pública Team Bulls v10.10.10.
   A chave do App Check/reCAPTCHA Enterprise é pública por definição.
   Não coloque senhas, chaves privadas ou credenciais administrativas aqui. */
window.TEAM_BULLS_PUBLIC_CONFIG=Object.freeze({
  appCheckSiteKey: '6Lc3U28tAAAAAB6qyxP8GauRDCg-4ADiy8oYLKXL'
});

if('caches' in window){
  caches.keys().then(keys=>Promise.all(keys.filter(name=>name.startsWith('team-bulls-stretch-guide-')).map(name=>caches.delete(name)))).catch(()=>{});
}

(()=>{
  let installed=false;
  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const patch=()=>{
    if(installed)return true;
    if(typeof withTimeout!=='function'||typeof ensureFirebaseReady!=='function'||typeof cloudGet!=='function')return false;
    installed=true;
    if(!withTimeout.__tbFirebaseResilience){
      const base=withTimeout;
      const wrapped=function(task,ms,label='operação'){
        let limit=Math.max(250,Number(ms)||10000);
        if(label==='Firebase'||label==='carregar conexão segura')limit=Math.max(limit,12000);
        else if(label==='App Check')limit=Math.max(limit,6000);
        else if(label==='login')limit=Math.max(limit,16000);
        return base(task,limit,label);
      };
      wrapped.__tbFirebaseResilience=true;withTimeout=wrapped;
    }
    if(typeof initOptionalAppCheck==='function'&&!initOptionalAppCheck.__tbEnterpriseProvider){
      const legacy=initOptionalAppCheck;
      const wrapped=async function(){
        const key=String(typeof CFG!=='undefined'&&CFG.appCheckSiteKey||'').trim();
        if(!key||typeof firebase==='undefined')return false;
        try{
          const ok=await loadSdkOnce('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check-compat.js',()=>typeof firebase.appCheck==='function');
          if(!ok)return false;
          const Provider=firebase.appCheck?.ReCaptchaEnterpriseProvider;
          if(typeof Provider==='function'){firebase.appCheck().activate(new Provider(key),true);return true;}
          return await legacy();
        }catch(error){
          const message=String(error?.message||error||'').toLowerCase();
          if(message.includes('already')&&message.includes('activ'))return true;
          console.warn('App Check Enterprise não iniciado',error);return false;
        }
      };
      wrapped.__tbEnterpriseProvider=true;initOptionalAppCheck=wrapped;
    }
    if(typeof ensureFirebaseReady==='function'&&!ensureFirebaseReady.__tbRetry){
      const base=ensureFirebaseReady;
      const wrapped=async function(){
        if(typeof auth!=='undefined'&&auth&&typeof db!=='undefined'&&db)return true;
        const first=await base();if(first)return true;
        if(!navigator.onLine)return false;
        await delay(450);
        try{const ready=await withTimeout(ensureFirebaseCore(),12000,'carregar conexão segura');return !!(ready&&initFirebase());}
        catch(error){console.warn('Firebase indisponível após nova tentativa',error);return false;}
      };
      wrapped.__tbRetry=true;ensureFirebaseReady=wrapped;
    }
    if(typeof cloudGet==='function'&&!cloudGet.__tbRetry){
      const base=cloudGet;
      const wrapped=async function(reference,label='consulta'){
        try{return await base(reference,label);}catch(error){
          const retryable=navigator.onLine&&(typeof isNetworkLikeError==='function'?isNetworkLikeError(error):false);
          if(!retryable)throw error;await delay(400);return base(reference,label+' · nova tentativa');
        }
      };
      wrapped.__tbRetry=true;cloudGet=wrapped;
    }
    return true;
  };
  patch();document.addEventListener('DOMContentLoaded',patch,{once:true});window.addEventListener('load',()=>{if(!installed)patch();},{once:true});
})();

(()=>{
  let requested=false,deferredStarted=false,deferredBatchCount=0;
  const criticalModules=['./modules/security-hardening-v10_10_9.js?v=10.10.10-security7'];
  const modules=[
    './modules/session-save-performance-v10_10_9.js?v=10.10.9-sessionperf1','./modules/week-selection-fix-v10_10_9.js?v=10.10.9-weekselection1','./modules/stability_v10_10_9.js?v=10.10.9','./modules/app-update-v10_10_9.js?v=10.10.9','./modules/diet-scroll-fix-v10_10_9.js?v=10.10.9','./modules/modal-form-guard-v10_10_9.js?v=10.10.9','./modules/trainer-workspace-v10_10_9.js?v=10.10.9-workspace3','./modules/cardio-timer-fix-v10_10_9.js?v=10.10.9-cardio1','./modules/global-performance-v10_10_9.js?v=10.10.9-perf2','./modules/workout-ux-fix-v10_10_9.js?v=10.10.9-workout1','./modules/desktop-performance-v10_10_9.js?v=10.10.9-desktop1','./modules/ger-bulk-v10_10_9.js?v=10.10.9-ger1','./modules/prescription-actions-layout-v10_10_9.js?v=10.10.9-actions2','./modules/prescription-propagation-v10_10_9.js?v=10.10.9-propagation1','./modules/diet-delete-fix-v10_10_9.js?v=10.10.9-dietdelete1','./modules/student-guidance-v10_10_9-v2.js?v=10.10.9-guidance2','./modules/remove-stretch-planilha-v10_10_9.js?v=10.10.9-stretchremove2','./modules/registration-integrity-v10_10_9.js?v=10.10.9-registration1','./modules/photo-quality-download-v10_10_9.js?v=10.10.9-photoquality1','./modules/usability-checkup-v10_10_9.js?v=10.10.9-usability1','./modules/legacy-student-link-repair-v10_10_10.js?v=10.10.10-legacy-links5','./modules/workflow-controls-v10_10_10.js?v=10.10.10-workflow1','./modules/prescription-lock-bridge-v10_10_10.js?v=10.10.10-lockbridge1','./modules/ger-lock-bridge-v10_10_10.js?v=10.10.10-gerlock1','./modules/report-photo-ux-v10_10_10.js?v=10.10.10-reportphotos1','./modules/usability-audit-v10_10_10.js?v=10.10.10-audit1','./modules/modal-stack-stability-v10_10_9.js?v=10.10.9-modal2&fix=freeze1'
  ];
  const preloadModules=items=>items.forEach(src=>{if(document.head.querySelector(`link[rel="preload"][as="script"][href="${src}"]`))return;const link=document.createElement('link');link.rel='preload';link.as='script';link.href=src;document.head.appendChild(link);});
  const loadScript=(src,timeoutMs=3200)=>new Promise(resolve=>{
    const script=document.createElement('script');let settled=false;
    const finish=(ok,reason='')=>{if(settled)return;settled=true;clearTimeout(timer);script.onload=null;script.onerror=null;if(!ok&&script.isConnected)script.remove();if(reason)console.warn('[Team Bulls] Extensão opcional indisponível:',src,reason);const settle=()=>resolve(ok);if(deferredStarted&&++deferredBatchCount%4===0)requestAnimationFrame(settle);else settle();};
    script.src=src;script.async=false;script.onload=()=>finish(true);script.onerror=()=>finish(false,'erro de carregamento');
    const timer=setTimeout(()=>finish(false,'tempo limite'),Math.max(1200,Number(timeoutMs)||3200));document.head.appendChild(script);
  });
  const loadDeferred=async()=>{if(deferredStarted)return;deferredStarted=true;for(const src of modules)await loadScript(src);};
  const scheduleDeferred=()=>{const queue=()=>{'requestIdleCallback'in window?requestIdleCallback(()=>loadDeferred(),{timeout:1200}):setTimeout(()=>loadDeferred(),220);};const afterPaint=()=>requestAnimationFrame(()=>requestAnimationFrame(queue));if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',afterPaint,{once:true});else afterPaint();};
  const load=async()=>{if(requested)return;requested=true;preloadModules(criticalModules);for(const src of criticalModules)await loadScript(src,6500);scheduleDeferred();};
  if(window.TeamBulls107)load();else window.addEventListener('team-bulls-v107-ready',load,{once:true});
})();