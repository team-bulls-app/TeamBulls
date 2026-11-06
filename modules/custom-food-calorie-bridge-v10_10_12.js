(()=>{
  'use strict';
  if(window.__TEAM_BULLS_CUSTOM_FOOD_CALORIE_BRIDGE_2__)return;
  window.__TEAM_BULLS_CUSTOM_FOOD_CALORIE_BRIDGE_2__=true;

  const VERSION='10.10.13-customfood5';
  const COLLECTION='trainerSupplementCatalog';
  const FIELD='dietPortionItems';
  const PDF_MODULE='./modules/pdf-export-v10_10_12.js?v=10.10.12-pdf1';
  const DEFICIT_MODULE='./modules/diet-live-deficit-v10_10_13.js?v=10.10.13-deficit2';
  let cached=[];
  let cachedTrainer='';
  let loading=null;
  let failedUid='',failedAt=0;
  let observer=null;
  let syncFrame=0;
  let pdfLoading=null;
  let deficitLoading=null;

  const n=value=>{const parsed=Number(String(value??'').trim().replace(',','.'));return Number.isFinite(parsed)&&parsed>=0?parsed:0;};
  const key=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
  const trainer=()=>typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role==='trainer'&&String(CURRENT_USER?.uid||'').trim()?CURRENT_USER:null;
  function normalize(items){
    const found=new Map();
    (Array.isArray(items)?items:[]).forEach((raw,index)=>{
      if(!raw||typeof raw!=='object')return;const label=String(raw.label||'').normalize('NFKC').replace(/\s+/g,' ').trim().slice(0,120),k=key(label);if(!label||!k)return;
      found.set(k,{id:String(raw.id||index).slice(0,80),label,protein:n(raw.protein),carbs:n(raw.carbs),fat:n(raw.fat)});
    });
    return [...found.values()];
  }
  function registry(){return window.TeamBullsDietPortions;}
  function apply(items=cached){
    const api=registry();if(typeof api?.setCustomItems!=='function')return 0;
    cached=normalize(items);const count=api.setCustomItems(cached);
    try{window.TeamBullsDietLiveCalories?.refresh?.();}catch(error){console.warn('[Team Bulls] recálculo após catálogo personalizado',error);}
    try{window.TeamBullsTrainerDietWorkspace?.refresh?.();}catch(error){}
    try{window.TeamBullsDietLiveDeficit?.refresh?.();}catch(error){}
    return count;
  }
  async function load(force=false){
    const user=trainer();if(!user||typeof db==='undefined'||!db)return 0;const uid=String(user.uid);
    if(cachedTrainer&&cachedTrainer!==uid){cached=[];cachedTrainer='';apply([]);}
    if(!force&&cachedTrainer===uid)return apply();
    if(!force&&failedUid===uid&&Date.now()-failedAt<10000)return 0;
    if(loading?.uid===uid)return loading.promise;
    const entry={uid,promise:null};loading=entry;
    entry.promise=(async()=>{
      try{
        const ref=db.collection(COLLECTION).doc(uid),snap=typeof cloudGet==='function'?await cloudGet(ref,'alimentos personalizados da dieta'):await ref.get();
        if(!trainer()||String(CURRENT_USER.uid)!==uid)return 0;cached=normalize(snap.exists?snap.data()?.[FIELD]:[]);cachedTrainer=uid;failedUid='';failedAt=0;return apply();
      }catch(error){console.warn('[Team Bulls] Não foi possível carregar alimentos personalizados para kcal/macros',error);if(!trainer()||String(CURRENT_USER.uid)!==uid)return 0;failedUid=uid;failedAt=Date.now();return apply();}
      finally{if(loading===entry)loading=null;}
    })();return entry.promise;
  }
  function tableItems(){
    const rows=[...document.querySelectorAll('[data-custom-food-list] .tb-custom-table tbody tr')];if(!rows.length)return null;
    return normalize(rows.map((row,index)=>{const cells=row.querySelectorAll('td');return{id:`dom-${index}`,label:cells[0]?.textContent,protein:cells[1]?.textContent,carbs:cells[2]?.textContent,fat:cells[3]?.textContent};}));
  }
  function syncFromUi(){const table=tableItems();if(table){cached=table;return apply(table);}return cached.length?apply():0;}
  function schedule({reload=false}={}){if(syncFrame)cancelAnimationFrame(syncFrame);syncFrame=requestAnimationFrame(()=>{syncFrame=0;const table=tableItems();if(table){cached=table;apply(table);}else if(reload)load(true).catch(()=>0);else if(cached.length)apply();else load().catch(()=>0);});}
  function relevant(mutation){
    const target=mutation.target?.nodeType===Node.ELEMENT_NODE?mutation.target:mutation.target?.parentElement;
    if(target?.closest?.('[data-custom-food-list],#input-meal-items,#tb-meal-portion-body'))return true;
    return [...(mutation.addedNodes||[])].some(node=>node?.nodeType===Node.ELEMENT_NODE&&(node.matches?.('[data-custom-food-list],.tb-custom-table,#tb-meal-portion-body')||node.querySelector?.('[data-custom-food-list],.tb-custom-table,#tb-meal-portion-body')));
  }
  function loadOptional(path,check,cacheName){
    if(check())return Promise.resolve(true);if(cacheName==='pdf'&&pdfLoading)return pdfLoading;if(cacheName==='deficit'&&deficitLoading)return deficitLoading;
    const promise=new Promise(resolve=>{const done=ok=>resolve(!!ok),script=document.createElement('script');script.src=path;script.async=false;script.onload=()=>done(check());script.onerror=()=>done(false);document.head.appendChild(script);});
    if(cacheName==='pdf')pdfLoading=promise.finally(()=>{if(!check())pdfLoading=null;});else deficitLoading=promise.finally(()=>{if(!check())deficitLoading=null;});return cacheName==='pdf'?pdfLoading:deficitLoading;
  }
  function loadPdfExporter(){return loadOptional(PDF_MODULE,()=>!!window.TeamBullsPdfExport,'pdf');}
  function loadDeficit(){return loadOptional(DEFICIT_MODULE,()=>!!window.TeamBullsDietLiveDeficit,'deficit');}
  function prepareOptional(){loadPdfExporter().catch(()=>{});loadDeficit().catch(()=>{});}
  function install(){
    if(!document.body)return false;
    if(!observer){observer=new MutationObserver(mutations=>{if(mutations.some(relevant))schedule();});observer.observe(document.body,{childList:true,subtree:true,characterData:true});}
    load().catch(()=>0);prepareOptional();return true;
  }

  window.TeamBullsCustomFoodCalories=Object.freeze({version:VERSION,load,apply:syncFromUi,refresh:()=>schedule({reload:true}),items:()=>cached.slice(),loadPdfExporter});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('team-bulls-runtime-ready',()=>{load(true).catch(()=>0);prepareOptional();});
  window.addEventListener('online',()=>{load(true).catch(()=>0);prepareOptional();});
  window.addEventListener('pageshow',()=>{install();load(true).catch(()=>0);prepareOptional();},{passive:true});
})();