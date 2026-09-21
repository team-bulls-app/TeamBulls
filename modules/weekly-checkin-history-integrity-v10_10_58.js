/* Team Bulls v10.10.58 — integridade do histórico e agenda de relatórios semanais. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_WEEKLY_CHECKIN_HISTORY_INTEGRITY_101058__)return;
  window.__TEAM_BULLS_WEEKLY_CHECKIN_HISTORY_INTEGRITY_101058__=true;

  const VERSION='10.10.58-weeklyintegrity1';
  let installedFetch=false;
  let installedCompute=false;
  let installedRender=false;
  let duplicatesSuppressed=0;

  const iso=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):'';
  const stampMs=value=>{
    try{
      if(value?.toMillis)return value.toMillis();
      if(value?.toDate)return value.toDate().getTime();
      if(value?.seconds)return Number(value.seconds)*1000;
      return 0;
    }catch(error){return 0;}
  };
  const stampIso=value=>{
    try{
      const date=value?.toDate?.()||(value?.seconds?new Date(Number(value.seconds)*1000):null);
      if(!(date instanceof Date)||Number.isNaN(date.getTime()))return'';
      return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    }catch(error){return'';}
  };

  /* requestKey passou a ser canônico depois de já existirem check-ins semanais.
     Para histórico programado legado, dueDate identifica com segurança o mesmo ciclo.
     Relatórios extras sem requestKey não são inferidos: podem existir vários no mesmo dia. */
  function logicalRequestKey(item){
    const direct=String(item?.requestKey||'').trim();
    if(direct)return direct;
    const due=iso(item?.dueDate);
    const kind=String(item?.requestKind||'scheduled');
    return due&&kind!=='manual'?'scheduled:'+due:'';
  }

  function normalizeItem(item){
    const row={...(item||{})};
    const serverDate=stampIso(row.createdAt);
    row._tbServerSubmittedDate=serverDate;
    row._tbDisplaySubmittedDate=serverDate||iso(row.submittedDate)||iso(row.dueDate);
    row._tbLogicalRequestKey=logicalRequestKey(row);
    return row;
  }

  function newer(a,b){
    const am=stampMs(a?.createdAt),bm=stampMs(b?.createdAt);
    if(am!==bm)return am>bm?a:b;
    const ad=String(a?._tbDisplaySubmittedDate||''),bd=String(b?._tbDisplaySubmittedDate||'');
    if(ad!==bd)return ad>bd?a:b;
    return String(a?.id||'')>=String(b?.id||'')?a:b;
  }

  function normalizeList(items){
    const keyed=new Map(),unkeyed=[];let hidden=0;
    for(const raw of Array.isArray(items)?items:[]){
      const row=normalizeItem(raw),key=row._tbLogicalRequestKey;
      if(!key){unkeyed.push(row);continue;}
      const previous=keyed.get(key);
      if(!previous){keyed.set(key,row);continue;}
      keyed.set(key,newer(previous,row));hidden++;
    }
    duplicatesSuppressed=hidden;
    return[...keyed.values(),...unkeyed].sort((a,b)=>{
      const am=stampMs(a.createdAt),bm=stampMs(b.createdAt);if(am!==bm)return bm-am;
      const ad=String(a._tbDisplaySubmittedDate||''),bd=String(b._tbDisplaySubmittedDate||'');if(ad!==bd)return bd.localeCompare(ad);
      return String(b.id||'').localeCompare(String(a.id||''));
    });
  }

  function installFetch(){
    try{
      if(typeof fetchWeeklyCheckins!=='function')return false;
      if(fetchWeeklyCheckins.__tbWeeklyIntegrity101058){installedFetch=true;return true;}
      const base=fetchWeeklyCheckins;
      const wrapped=async function(){return normalizeList(await base.apply(this,arguments));};
      wrapped.__tbWeeklyIntegrity101058=true;wrapped.__tbBase=base;
      fetchWeeklyCheckins=wrapped;installedFetch=true;return true;
    }catch(error){return false;}
  }

  function installCompute(){
    try{
      if(typeof computeCheckinRequest!=='function')return false;
      if(computeCheckinRequest.__tbWeeklyIntegrity101058){installedCompute=true;return true;}
      const base=computeCheckinRequest;
      const wrapped=function(schedule,checkins){
        const normalized=normalizeList(checkins).map(row=>row.requestKey?row:{...row,requestKey:row._tbLogicalRequestKey||''});
        return base.call(this,schedule,normalized);
      };
      wrapped.__tbWeeklyIntegrity101058=true;wrapped.__tbBase=base;
      computeCheckinRequest=wrapped;installedCompute=true;return true;
    }catch(error){return false;}
  }

  function installRender(){
    try{
      if(typeof renderWeeklyCheckinHistory!=='function')return false;
      if(renderWeeklyCheckinHistory.__tbWeeklyIntegrity101058){installedRender=true;return true;}
      const base=renderWeeklyCheckinHistory;
      const wrapped=function(items,listId){
        const normalized=normalizeList(items).map(row=>({...row,submittedDate:row._tbDisplaySubmittedDate||row.submittedDate||row.dueDate}));
        return base.call(this,normalized,listId);
      };
      wrapped.__tbWeeklyIntegrity101058=true;wrapped.__tbBase=base;
      renderWeeklyCheckinHistory=wrapped;installedRender=true;return true;
    }catch(error){return false;}
  }

  function install(){
    installFetch();installCompute();installRender();
    return installedFetch&&installedCompute&&installedRender;
  }

  install();
  [80,300,900,1800].forEach(delay=>setTimeout(install,delay));
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('team-bulls-runtime-state',install);
  window.addEventListener('team-bulls-student-runtime-ready',install);
  window.addEventListener('team-bulls-intelligence-ready',install);
  window.addEventListener('pageshow',install,{passive:true});

  window.TeamBullsWeeklyCheckinHistoryIntegrity=Object.freeze({
    version:VERSION,
    install,
    normalize:normalizeList,
    logicalRequestKey,
    state:()=>({fetch:installedFetch,compute:installedCompute,render:installedRender,duplicatesSuppressed})
  });
})();
