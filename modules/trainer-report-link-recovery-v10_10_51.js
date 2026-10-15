/* Team Bulls v10.10.51 — recupera vínculos legítimos antes de ler relatórios do treinador. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_TRAINER_REPORT_LINK_RECOVERY_101051__)return;
  window.__TEAM_BULLS_TRAINER_REPORT_LINK_RECOVERY_101051__=true;

  const VERSION='10.10.51-reportlink1';
  const REPAIR_SRC='./modules/legacy-student-link-repair-v10_10_10.js?v=10.10.10-legacy-links6';
  const CACHE_MS=120000;
  let scriptLoading=null;
  let running=null;
  let lastUid='';
  let lastAt=0;
  let lastResult=null;
  let hookedHub=null;
  let hookedReports=null;

  const trainer=()=>{try{return CURRENT_USER?.role==='trainer'&&MODE==='cloud'&&!!CURRENT_USER?.uid;}catch(error){return false;}};
  const trainerUid=()=>trainer()?String(CURRENT_USER.uid||''):'';
  const reportRepair=()=>window.TeamBullsLegacyStudentLinkRepair;

  function loadRepairModule(){
    if(reportRepair()?.repair)return Promise.resolve(true);
    if(scriptLoading)return scriptLoading;
    scriptLoading=new Promise(resolve=>{
      const url=new URL(REPAIR_SRC,location.href).href;
      const existing=[...document.scripts].find(script=>String(script.src||'')===url);
      let settled=false,timer=0;
      const finish=ok=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);if(!ok)scriptLoading=null;resolve(!!ok);};
      if(existing){
        if(reportRepair()?.repair){finish(true);return;}
        existing.addEventListener('load',()=>finish(!!reportRepair()?.repair),{once:true});
        existing.addEventListener('error',()=>finish(false),{once:true});
        timer=setTimeout(()=>finish(!!reportRepair()?.repair),5000);return;
      }
      const script=document.createElement('script');script.src=REPAIR_SRC;script.async=false;script.dataset.teamBullsReportLinkRepair='1';
      script.onload=()=>finish(!!reportRepair()?.repair);script.onerror=()=>finish(false);
      timer=setTimeout(()=>{try{script.remove();}catch(error){}finish(false);},5000);document.head.appendChild(script);
    });
    return scriptLoading;
  }

  async function ensure(force=false){
    if(!trainer())return{ready:false,repaired:0,preV107Migrated:0,unresolved:0,failed:0};
    const uid=trainerUid();
    if(!uid)return{ready:false,repaired:0,preV107Migrated:0,unresolved:0,failed:0};
    if(lastUid!==uid){lastUid=uid;lastAt=0;lastResult=null;}
    if(running)return running;
    if(!force&&lastResult&&Date.now()-lastAt<CACHE_MS)return lastResult;
    running=(async()=>{
      const loaded=await loadRepairModule();
      if(!loaded||!reportRepair()?.repair)return{ready:false,repaired:0,preV107Migrated:0,unresolved:0,failed:0};
      const result=await reportRepair().repair();
      if(trainerUid()!==uid)return{ready:false,repaired:0,preV107Migrated:0,unresolved:0,failed:0,aborted:true};
      lastAt=Date.now();lastResult=result||{};
      const recovered=(Number(result?.repaired)||0)+(Number(result?.preV107Migrated)||0);
      if(recovered>0){
        try{if(typeof showToast==='function')showToast(`✓ ${recovered} vínculo(s) recuperado(s). Recarregando relatórios...`);}catch(error){}
        try{window.dispatchEvent(new CustomEvent('team-bulls-report-link-repaired',{detail:{trainerUid:uid,recovered,result}}));}catch(error){}
      }else if(force&&Number(result?.unresolved)>0){
        try{if(typeof showToast==='function')showToast('Há um vínculo antigo que não pôde ser confirmado automaticamente. Nenhum dado foi alterado.',true);}catch(error){}
      }
      return result||{};
    })().catch(error=>{
      console.warn('[Team Bulls] Reconciliação de vínculo de relatórios encerrada sem alterar dados.',error?.code||error?.message||error);
      return{ready:false,repaired:0,preV107Migrated:0,unresolved:0,failed:1,error};
    }).finally(()=>{running=null;});
    return running;
  }

  function hookHub(){
    const hub=window.TeamBullsTrainerHub;
    if(!hub||hub===hookedHub||hub.__tbReportLinkRecovery101051)return !!hub;
    const wrapped=Object.freeze({...hub,__tbReportLinkRecovery101051:true,
      async openInbox(){await ensure(true);return hub.openInbox.apply(hub,arguments);},
      async refreshInbox(){await ensure(true);return hub.refreshInbox.apply(hub,arguments);}
    });
    hookedHub=wrapped;window.TeamBullsTrainerHub=wrapped;return true;
  }

  function hookReportsApi(){
    const api=window.TeamBullsTrainerSentReports;
    if(!api||api===hookedReports||api.__tbReportLinkRecovery101051)return !!api;
    const wrapped=Object.freeze({...api,__tbReportLinkRecovery101051:true,
      async open(){await ensure(true);return api.open.apply(api,arguments);},
      async refresh(){await ensure(true);return api.refresh.apply(api,arguments);}
    });
    hookedReports=wrapped;window.TeamBullsTrainerSentReports=wrapped;return true;
  }

  function installCapture(){
    if(document.documentElement.dataset.tbReportLinkCapture==='1')return;
    document.documentElement.dataset.tbReportLinkCapture='1';
    document.addEventListener('click',event=>{
      const entry=event.target?.closest?.('#tb-trainer-sent-reports-entry');
      const refresh=event.target?.closest?.('#tb-sent-reports-refresh');
      if(!entry&&!refresh)return;
      const api=window.TeamBullsTrainerSentReports;
      if(!api||!trainer())return;
      event.preventDefault();event.stopImmediatePropagation();
      const invoke=()=>entry?api.open():api.refresh();
      if(api.__tbReportLinkRecovery101051){Promise.resolve(invoke()).catch(()=>{});return;}
      ensure(true).then(invoke).catch(invoke);
    },true);
  }

  function install(){
    if(!trainer())return false;
    hookHub();hookReportsApi();installCapture();
    return true;
  }

  install();
  [120,500,1400,2800].forEach(delay=>setTimeout(()=>{if(trainer()){install();ensure(false).catch(()=>{});}},delay));
  window.addEventListener('team-bulls-runtime-state',install);
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('team-bulls-intelligence-ready',install);
  window.addEventListener('pageshow',()=>{if(trainer()){install();ensure(false).catch(()=>{});}},{passive:true});

  window.TeamBullsTrainerReportLinkRecovery=Object.freeze({
    version:VERSION,
    ensure,
    state:()=>({uid:lastUid,lastAt,running:!!running,lastResult})
  });
})();
