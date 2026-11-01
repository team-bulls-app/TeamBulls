/* Team Bulls v10.10.50 — retomada segura do Firestore após background no mobile/PWA. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_FOREGROUND_WRITE_RESILIENCE_1010502__)return;
  window.__TEAM_BULLS_FOREGROUND_WRITE_RESILIENCE_1010502__=true;

  const VERSION='10.10.50-foregroundwrite2';
  const BACKGROUND_TRIGGER_MS=1200;
  const RESUME_WINDOW_MS=15000;
  const READY_CACHE_MS=6000;
  const RESUME_SETTLE_MS=180;
  const PROBE_TIMEOUT_MS=5000;
  const WRITE_TIMEOUT_MS=10000;
  let hiddenAt=document.hidden?Date.now():0;
  let resumedAt=0;
  let readyAt=0;
  let settlePromise=null;
  let baseToggleMealDone=null;
  let mealPatched=false;
  const pendingWrites=new Map();

  const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const cloudMode=()=>{try{return typeof MODE!=='undefined'&&MODE==='cloud'&&typeof db!=='undefined'&&!!db;}catch(error){return false;}};
  const currentUid=()=>{try{return String((typeof auth!=='undefined'&&auth?.currentUser?.uid)||CURRENT_USER?.uid||'');}catch(error){return'';}};
  const online=()=>navigator.onLine!==false;
  const makeError=(code,message,cause)=>{const error=new Error(message);error.code=code;if(cause)error.cause=cause;return error;};
  const timeout=(task,ms,label,code='team-bulls/foreground-timeout')=>new Promise((resolve,reject)=>{
    let settled=false;
    const timer=setTimeout(()=>{if(settled)return;settled=true;reject(makeError(code,'Tempo esgotado: '+label));},Math.max(250,Number(ms)||5000));
    Promise.resolve(task).then(value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);},error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);});
  });
  const notify=(message,isError=false)=>{try{if(typeof showToast==='function'){showToast(message,!!isError);return;}console[isError?'warn':'info']('[Team Bulls]',message);}catch(error){}};
  const emit=(state,detail={})=>{try{window.dispatchEvent(new CustomEvent('team-bulls-cloud-resume-state',{detail:{state,version:VERSION,...detail}}));}catch(error){}};

  function needsResumeSettle(){
    if(!cloudMode())return false;
    if(!resumedAt)return false;
    if(Date.now()-resumedAt>RESUME_WINDOW_MS)return false;
    return readyAt<resumedAt||Date.now()-readyAt>READY_CACHE_MS;
  }

  async function awaitReady(options={}){
    if(!cloudMode())return true;
    if(!online())throw makeError('team-bulls/offline','Sem conexão com a internet.');
    if(options.force!==true&&!needsResumeSettle())return true;
    if(settlePromise)return settlePromise;
    const uid=currentUid();if(!uid)throw makeError('team-bulls/no-user','Sessão online ainda não foi restaurada.');
    emit('reconnecting');
    // Firestore already reconnects its own streams. Toggling enableNetwork() and
    // opening a throwaway get() here races that recovery against live listeners.
    // Let the browser/app foreground transition settle, then start the real read
    // or write exactly once and let its result confirm server reachability.
    settlePromise=delay(RESUME_SETTLE_MS).then(()=>{
      if(!online())throw makeError('team-bulls/offline','Sem conexão com a internet.');
      readyAt=Date.now();emit('ready',{uid,source:'foreground-transition'});return true;
    }).finally(()=>{settlePromise=null;});
    return settlePromise;
  }

  async function write(key,factory,options={}){
    const id=String(key||options.label||'write');
    const existing=pendingWrites.get(id);if(existing)return{status:'pending',promise:existing.promise,existing:true};
    if(typeof factory!=='function')throw new TypeError('A gravação segura exige uma função para iniciar o write somente após a retomada.');
    await awaitReady({force:options.forceProbe===true});
    const label=String(options.label||'gravação');
    const writePromise=Promise.resolve().then(factory);
    const entry={promise:writePromise,startedAt:Date.now(),label};pendingWrites.set(id,entry);
    writePromise.then(()=>{if(pendingWrites.get(id)===entry)pendingWrites.delete(id);},()=>{if(pendingWrites.get(id)===entry)pendingWrites.delete(id);});
    try{
      const value=await timeout(writePromise,options.timeoutMs||WRITE_TIMEOUT_MS,label,'team-bulls/write-pending-timeout');
      return{status:'committed',value,promise:writePromise};
    }catch(error){
      if(error?.code==='team-bulls/write-pending-timeout')return{status:'pending',promise:writePromise,error};
      throw error;
    }
  }

  const mealContextUid=()=>{try{return String(MEAL_CTX?.targetUid||CURRENT_USER?.uid||'');}catch(error){return'';}};
  const sameMealContext=(uid,date)=>{try{return mealContextUid()===String(uid)&&typeof today==='function'&&today()===date;}catch(error){return false;}};
  function applyMealState(mid,done,uid,date){
    if(!sameMealContext(uid,date))return false;
    try{if(done)MEAL_COMPLETIONS_TODAY.add(mid);else MEAL_COMPLETIONS_TODAY.delete(mid);if(typeof renderMealsList==='function')renderMealsList();return true;}catch(error){return false;}
  }
  async function reconcileMeal(ref,mid,uid,date){
    try{
      await awaitReady({force:true});
      const snap=await timeout(ref.get({source:'server'}),PROBE_TIMEOUT_MS,'confirmar refeição','team-bulls/meal-reconcile-timeout');
      applyMealState(mid,!!snap.exists,uid,date);return !!snap.exists;
    }catch(error){console.warn('[Team Bulls] Estado da refeição será atualizado na próxima sincronização.',error?.code||error?.message||error);return null;}
  }

  function installMealPatch(){
    if(mealPatched)return true;
    if(typeof toggleMealDone!=='function'||typeof beginAction!=='function'||typeof endAction!=='function')return false;
    baseToggleMealDone=toggleMealDone;
    const wrapped=async function(mid){
      try{if(typeof MODE!=='undefined'&&MODE==='local'&&!MEAL_CTX?.targetUid)return baseToggleMealDone.apply(this,arguments);}catch(error){}
      if(!MEAL_CTX?.canToggleDone)return;
      const meal=MEAL_PLAN_CACHE?.meals?.find(item=>item.id===mid);if(!meal)return;
      const actionKey='meal-completion-'+mid;if(!beginAction(actionKey))return;
      const date=typeof today==='function'?today():new Date().toISOString().slice(0,10);
      const uid=mealContextUid();
      try{
        if(!uid)throw makeError('team-bulls/no-user','Conta não identificada.');
        const compId=uid+'_'+mid+'_'+date;
        const writeKey='meal:'+compId;
        const ref=db.collection('mealCompletions').doc(compId);
        const currentlyDone=MEAL_COMPLETIONS_TODAY.has(mid);
        const desiredDone=!currentlyDone;
        if(pendingWrites.has(writeKey)){notify('Esta refeição ainda está sincronizando.');return;}
        const result=await write(writeKey,()=>desiredDone?ref.set({studentUid:uid,mealId:mid,date}):ref.delete(),{label:'atualizar refeição'});
        if(result.status==='committed'){
          applyMealState(mid,desiredDone,uid,date);return;
        }
        notify('Conexão retomando. A refeição será confirmada automaticamente.');
        result.promise.then(()=>{
          if(applyMealState(mid,desiredDone,uid,date))notify('✓ Refeição sincronizada.');
        },async error=>{
          const actual=await reconcileMeal(ref,mid,uid,date);
          if(actual===null)notify('Não foi possível confirmar a refeição agora. O estado será atualizado na próxima sincronização.',true);
          else if(actual!==desiredDone)notify('A alteração da refeição não foi confirmada pelo servidor.',true);
        });
      }catch(error){
        const code=String(error?.code||'');
        if(code==='team-bulls/offline'||code==='team-bulls/resume-probe-timeout'||code==='team-bulls/network-enable-timeout'||code==='team-bulls/no-user')notify('Reconectando ao Team Bulls. Tente novamente em alguns segundos.',true);
        else{console.warn('[Team Bulls] Falha ao atualizar refeição.',error);notify('Não foi possível atualizar a refeição agora.',true);}
      }finally{endAction(actionKey);}
    };
    wrapped.__tbForegroundSafeMeal=true;
    toggleMealDone=wrapped;
    mealPatched=true;return true;
  }

  function onHidden(){hiddenAt=Date.now();emit('background');}
  function onVisible(source='visibility'){
    const now=Date.now();const elapsed=hiddenAt?now-hiddenAt:0;hiddenAt=0;
    if(elapsed<BACKGROUND_TRIGGER_MS&&source!=='online')return;
    resumedAt=now;readyAt=0;emit('resume',{backgroundMs:elapsed,source});
  }
  function install(){
    installMealPatch();
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')onHidden();else onVisible('visibility');},{passive:true});
    window.addEventListener('pageshow',event=>{if(event.persisted)onVisible('pageshow');},{passive:true});
    window.addEventListener('online',()=>onVisible('online'),{passive:true});
    [250,900,2200].forEach(ms=>setTimeout(installMealPatch,ms));
  }

  window.TeamBullsForegroundWriteResilience=Object.freeze({
    version:VERSION,
    awaitReady,
    write,
    isPending:key=>pendingWrites.has(String(key||'')),
    state:()=>({hiddenAt,resumedAt,readyAt,settling:!!settlePromise,pendingWrites:pendingWrites.size,mealPatched})
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
