/* Team Bulls v10.10.31 — recuperação discreta durante restauração válida de sessão. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_SESSION_RESTORE_RECOVERY_UX_10_10_31__)return;
  window.__TEAM_BULLS_SESSION_RESTORE_RECOVERY_UX_10_10_31__=true;

  const VERSION='10.10.31-sessionrestore1';
  const PAGE_STARTED_AT=Date.now();
  const QUIET_WINDOW_MS=12000;
  let patched=null;
  let deferredTimer=0;

  const stored=key=>{try{return typeof storageGet==='function'?storageGet(key):localStorage.getItem(key);}catch(error){return null;}};
  const activeScreen=()=>document.querySelector('.screen.active')?.id||'';
  const accessMode=()=>{try{return typeof ACCESS_MODE!=='undefined'?String(ACCESS_MODE||''):'';}catch(error){return'';}};
  const firebaseUser=()=>{try{return typeof auth!=='undefined'&&auth?.currentUser?auth.currentUser:null;}catch(error){return null;}};
  const committed=()=>['cloud-active','trainer','offline-registered','local-inactive'].includes(accessMode());
  const returningSession=()=>{
    const uid=String(stored('teamms_last_user_uid')||'').trim();
    const guest=stored('teamms_offline_pref')==='1'||stored('teamms_offline_mode')==='guest';
    if(!uid||guest||navigator.onLine===false||committed())return false;
    return activeScreen()==='screen-loading'||activeScreen()==='screen-auth'||!!firebaseUser();
  };
  const transientMessage=value=>{
    const text=String(value||'').toLowerCase();
    return text.includes('sessão foi reconhecida')||text.includes('validando sua sessão')||text.includes('sessão online')||text.includes('sessão está levando')||text.includes('sessão está sendo')||text.includes('sessão ainda')||text.includes('conexão ainda está sendo conferida');
  };

  function setCacheRepairVisible(visible){
    const button=document.getElementById('loading-clear-cache');
    if(button)button.hidden=!visible;
  }
  function quietLoading(){
    setCacheRepairVisible(false);
    const recovery=document.getElementById('loading-recovery');
    if(recovery)recovery.hidden=true;
    const label=document.querySelector('#screen-loading .loading-label');
    if(label)label.textContent='verificando sessão...';
  }
  function scheduleRealRecovery(base,message){
    clearTimeout(deferredTimer);
    const elapsed=Date.now()-PAGE_STARTED_AT;
    const wait=Math.max(350,QUIET_WINDOW_MS-elapsed);
    deferredTimer=setTimeout(()=>{
      if(!returningSession()||committed())return;
      setCacheRepairVisible(false);
      base.reveal?.('A conexão está demorando mais que o normal. Você pode tentar novamente ou usar o modo local; não é necessário corrigir a atualização.');
      setCacheRepairVisible(false);
    },wait);
  }
  function patchRecovery(){
    const base=window.TeamBullsRecovery;
    if(!base||base===patched||base.__tbSessionRestoreQuiet===true)return !!base;
    const wrapped=Object.freeze({...base,
      __tbSessionRestoreQuiet:true,
      reveal(message){
        if(transientMessage(message)&&returningSession()){
          const elapsed=Date.now()-PAGE_STARTED_AT;
          if(elapsed<QUIET_WINDOW_MS){quietLoading();scheduleRealRecovery(base,message);return false;}
          setCacheRepairVisible(false);
          const result=base.reveal?.('A conexão está demorando mais que o normal. Você pode tentar novamente ou usar o modo local; não é necessário corrigir a atualização.');
          setCacheRepairVisible(false);
          return result;
        }
        clearTimeout(deferredTimer);setCacheRepairVisible(true);return base.reveal?.(message);
      },
      hide(){clearTimeout(deferredTimer);setCacheRepairVisible(true);return base.hide?.();}
    });
    patched=wrapped;window.TeamBullsRecovery=wrapped;return true;
  }
  function install(attempt=0){
    if(patchRecovery())return;
    if(attempt<80)setTimeout(()=>install(attempt+1),attempt<20?25:100);
  }

  install();
  window.addEventListener('pageshow',()=>{patchRecovery();if(returningSession())quietLoading();},{passive:true});
  window.addEventListener('online',()=>{patchRecovery();if(returningSession())quietLoading();},{passive:true});
  window.TeamBullsSessionRestoreRecoveryUX=Object.freeze({version:VERSION,install:patchRecovery,returningSession});
})();
