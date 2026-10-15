/* Team Bulls v10.10.23 — dieta do aluno compacta e sincronizada em tempo real. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_STUDENT_DIET_COMPACT_LIVE_101023__)return;
  window.__TEAM_BULLS_STUDENT_DIET_COMPACT_LIVE_101023__=true;

  const VERSION='10.10.23-dietcompact1';
  let observer=null;
  let patchFrame=0;
  let dietUnsubscribe=null;
  let dietUid='';
  let dietFingerprint='';
  let renderSequence=0;

  const currentUser=()=>{try{return typeof CURRENT_USER!=='undefined'?CURRENT_USER:null;}catch(error){return null;}};
  const coreMode=()=>{try{return typeof MODE!=='undefined'?MODE:'';}catch(error){return'';}};
  const activeScreen=()=>document.querySelector('.screen.active')?.id||'';
  const studentContext=()=>{
    if(currentUser()?.role==='trainer'||document.body?.classList.contains('trainer-desktop'))return false;
    if(currentUser()?.role==='student')return true;
    try{return coreMode()==='local'||document.body?.classList.contains('student-desktop');}catch(error){return false;}
  };
  const cloudStudent=()=>studentContext()&&currentUser()?.role==='student'&&coreMode()==='cloud'&&typeof db!=='undefined'&&!!db;
  const uid=()=>String(currentUser()?.uid||'').trim();

  function injectStyles(){
    if(document.getElementById('tb-student-diet-compact-live-style'))return;
    const style=document.createElement('style');
    style.id='tb-student-diet-compact-live-style';
    style.textContent=`
      #screen-diet-detail #diet-cycle-summary{
        display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:0!important;
        margin:10px 0 0!important;padding:0!important;border:1px solid #44372f!important;border-left:3px solid #9d2832!important;
        background:#0d0c0b!important;overflow:hidden;
      }
      #screen-diet-detail #diet-cycle-summary>span{
        min-width:0;padding:8px 7px;border-right:1px solid #302722;color:#71665f;
        font:500 6.8px/1.2 'DM Mono',monospace;letter-spacing:.45px;text-align:left;white-space:nowrap;
      }
      #screen-diet-detail #diet-cycle-summary>span:last-child{border-right:0}
      #screen-diet-detail #diet-cycle-summary>span b{
        display:block;margin-top:3px;color:#ddd2ca;font:700 10px/1.15 'DM Mono',monospace;letter-spacing:.1px;white-space:nowrap;
      }
      #screen-diet-detail #diet-energy-summary{margin:4px 0 0!important}
      #screen-diet-detail #diet-energy-summary .diet-energy-card{padding:0!important;border:1px solid #3b312b!important;background:#0e0d0c!important}
      #screen-diet-detail #diet-energy-summary .diet-energy-card-head{display:none!important}
      #screen-diet-detail #diet-energy-summary .diet-energy-grid{
        display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(100%,115px),1fr))!important;gap:0!important;
      }
      #screen-diet-detail #diet-energy-summary .diet-energy-metric{
        min-width:0!important;min-height:54px!important;padding:8px 7px!important;border:0!important;border-right:1px solid #302722!important;
        background:transparent!important;display:flex;flex-direction:column;justify-content:center;
      }
      #screen-diet-detail #diet-energy-summary .diet-energy-metric:last-child{border-right:0!important}
      #screen-diet-detail #diet-energy-summary .diet-energy-metric>span{
        color:#786a61!important;font:500 6.4px/1.2 'DM Mono',monospace!important;letter-spacing:.35px!important;
        white-space:normal;overflow:visible;
      }
      #screen-diet-detail #diet-energy-summary .diet-energy-metric>strong{
        margin-top:4px!important;color:#e2d7cf!important;font:800 15px/1 'Barlow Condensed',sans-serif!important;
        letter-spacing:.1px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
      }
      #screen-diet-detail #diet-energy-summary .diet-energy-metric>small{display:none!important}
      #screen-diet-detail [data-tb-diet-guidance="1"]{
        margin:4px 0 10px!important;padding:8px 9px!important;border:1px solid #453029!important;border-radius:0!important;
        background:linear-gradient(100deg,rgba(55,20,21,.28),#0e0d0c 58%)!important;
      }
      #screen-diet-detail [data-tb-diet-guidance="1"] .tb-guidance-head{
        display:inline-flex!important;align-items:center!important;vertical-align:middle;margin:0 8px 0 0!important;gap:0!important;
      }
      #screen-diet-detail [data-tb-diet-guidance="1"] .tb-guidance-head>div{display:block!important}
      #screen-diet-detail [data-tb-diet-guidance="1"] .tb-guidance-head strong{
        color:#9b6965!important;font:700 7px/1 'DM Mono',monospace!important;letter-spacing:.75px!important;
      }
      #screen-diet-detail [data-tb-diet-guidance="1"] .tb-guidance-head small{display:none!important}
      #screen-diet-detail [data-tb-diet-guidance="1"] .tb-guidance-head>.section-mini-btn{display:none!important}
      #screen-diet-detail [data-tb-diet-guidance="1"] .tb-hydration-value{
        display:inline-block!important;margin:0!important;color:#d8e9ff!important;font:800 15px/1 'Barlow Condensed',sans-serif!important;
        vertical-align:middle;letter-spacing:.1px!important;
      }
      #screen-diet-detail [data-tb-diet-guidance="1"] .tb-hydration-note{display:none!important}
      #screen-diet-detail [data-tb-diet-guidance="1"] .tb-nutrition-details{
        margin-top:7px!important;padding-top:7px!important;border-top:1px solid #302722!important;
      }
      #screen-diet-detail [data-tb-diet-guidance="1"] .tb-nutrition-details summary{
        color:#a9998e!important;font:700 8px/1.25 'Barlow Condensed',sans-serif!important;letter-spacing:.35px!important;
      }
      #screen-diet-detail [data-tb-diet-guidance="1"] .tb-guidance-actions{
        display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:5px!important;margin-top:7px!important;
      }
      #screen-diet-detail [data-tb-diet-guidance="1"] .tb-guidance-actions button{
        min-height:30px!important;margin:0!important;padding:6px 4px!important;border-radius:0!important;
        font:700 8px/1 'Barlow Condensed',sans-serif!important;letter-spacing:.35px!important;
      }
      @media(max-width:380px){
        #screen-diet-detail #diet-cycle-summary>span{padding-left:5px;padding-right:5px;font-size:6.1px;letter-spacing:.2px}
        #screen-diet-detail #diet-cycle-summary>span b{font-size:8.8px}
        #screen-diet-detail #diet-energy-summary .diet-energy-metric{padding-left:5px!important;padding-right:5px!important}
        #screen-diet-detail #diet-energy-summary .diet-energy-metric>span{font-size:5.8px!important;letter-spacing:.15px!important}
        #screen-diet-detail #diet-energy-summary .diet-energy-metric>strong{font-size:13px!important}
      }
    `;
    document.head.appendChild(style);
  }

  function setTextIfChanged(element,value){
    if(!element)return false;
    const next=String(value??'');
    if(String(element.textContent||'')===next)return false;
    element.textContent=next;
    return true;
  }

  function compactEnergyLabels(){
    const metrics=[...document.querySelectorAll('#screen-diet-detail #diet-energy-summary .diet-energy-metric')];
    metrics.forEach((metric,index)=>{
      if(index===0)setTextIfChanged(metric.querySelector(':scope > span'),'GET');
      const value=metric.querySelector(':scope > strong');
      if(value)setTextIfChanged(value,String(value.textContent||'').replace(/\s*kcal\s*\/\s*dia\s*$/i,' kcal').trim());
    });
  }

  function compactGuidance(){
    const energy=document.getElementById('diet-energy-summary');
    const card=document.querySelector('#screen-diet-detail [data-tb-diet-guidance="1"]');
    if(!energy||!card)return false;
    if(energy.nextElementSibling!==card)energy.insertAdjacentElement('afterend',card);
    setTextIfChanged(card.querySelector('.tb-guidance-head strong'),'ÁGUA');
    const value=card.querySelector('.tb-hydration-value');
    if(value)setTextIfChanged(value,String(value.textContent||'').replace(/\s+por\s+dia\s*·\s*/i,' · ').trim());
    return true;
  }

  function patchDietSummary(){
    if(!studentContext())return false;
    const screen=document.getElementById('screen-diet-detail');if(!screen)return false;
    compactEnergyLabels();compactGuidance();
    screen.dataset.tbCompactDiet='1';
    return true;
  }

  function schedulePatch(){
    if(patchFrame)return;
    patchFrame=requestAnimationFrame(()=>{patchFrame=0;patchDietSummary();});
  }

  function installDietObserver(){
    if(observer||typeof MutationObserver!=='function')return;
    const host=document.querySelector('#screen-diet-detail .content');if(!host)return;
    observer=new MutationObserver(schedulePatch);
    observer.observe(host,{childList:true,subtree:true});
  }

  function currentDietFingerprint(){
    try{return typeof DIET_DOCUMENT!=='undefined'?JSON.stringify(DIET_DOCUMENT):'';}catch(error){return'';}
  }
  function normalizeDietPayload(data){
    try{return typeof normalizeDietDocument==='function'?normalizeDietDocument(data||{}):(data||{plans:[]});}
    catch(error){return data||{plans:[]};}
  }
  function setDietDocument(value){
    try{DIET_DOCUMENT=value;return true;}catch(error){return false;}
  }

  async function rerenderDietFromLiveUpdate(normalized){
    const sequence=++renderSequence;
    const screen=activeScreen();
    if(screen==='screen-meals'){
      try{if(typeof renderDietList==='function')renderDietList('meals-list','meals-empty',false);}catch(error){}
      return;
    }
    if(screen!=='screen-diet-detail')return;
    let currentId='';
    try{currentId=String(typeof CURRENT_DIET_ID!=='undefined'?CURRENT_DIET_ID:'');}catch(error){}
    const exists=Array.isArray(normalized?.plans)&&normalized.plans.some(plan=>String(plan?.id)===currentId);
    if(!currentId||!exists){if(typeof openMeals==='function')await Promise.resolve(openMeals());return;}
    if(typeof openDietDetail!=='function')return;
    const y=window.scrollY||window.pageYOffset||0;
    await Promise.resolve(openDietDetail(currentId,false));
    if(sequence!==renderSequence)return;
    requestAnimationFrame(()=>{window.scrollTo(0,y);schedulePatch();});
  }

  function stopDietLiveSync(){
    if(typeof dietUnsubscribe==='function')try{dietUnsubscribe();}catch(error){}
    dietUnsubscribe=null;dietUid='';dietFingerprint='';
  }

  function ensureDietLiveSync(){
    if(!cloudStudent()||!uid()){stopDietLiveSync();return false;}
    const nextUid=uid();if(dietUnsubscribe&&dietUid===nextUid)return true;
    stopDietLiveSync();dietUid=nextUid;dietFingerprint=currentDietFingerprint();
    try{
      dietUnsubscribe=db.collection('mealPlans').doc(nextUid).onSnapshot(snapshot=>{
        if(uid()!==nextUid||!cloudStudent())return;
        const normalized=normalizeDietPayload(snapshot.exists?snapshot.data():{});
        const fingerprint=JSON.stringify(normalized);
        if(fingerprint===dietFingerprint||fingerprint===currentDietFingerprint()){dietFingerprint=fingerprint;return;}
        dietFingerprint=fingerprint;
        if(!setDietDocument(normalized))return;
        try{if(typeof cacheOwnDietDocument==='function')cacheOwnDietDocument(nextUid,normalized);}catch(error){}
        rerenderDietFromLiveUpdate(normalized).catch(error=>console.warn('[Team Bulls] Dieta atualizada, mas a tela não pôde ser redesenhada imediatamente.',error));
      },error=>console.warn('[Team Bulls] Sincronização em tempo real da dieta indisponível; leitura normal preservada.',error));
      return true;
    }catch(error){console.warn('[Team Bulls] Não foi possível iniciar a sincronização em tempo real da dieta.',error);stopDietLiveSync();return false;}
  }

  function sync(){injectStyles();installDietObserver();patchDietSummary();ensureDietLiveSync();}
  function install(){sync();}

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('team-bulls-runtime-ready',sync);
  window.addEventListener('team-bulls-student-runtime-ready',sync);
  window.addEventListener('online',ensureDietLiveSync);
  window.addEventListener('pageshow',sync,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync();},{passive:true});

  window.TeamBullsStudentDietCompact=Object.freeze({version:VERSION,patch:patchDietSummary,sync:ensureDietLiveSync});
})();
