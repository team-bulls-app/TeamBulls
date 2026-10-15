(()=>{
  'use strict';
  if(window.__TEAM_BULLS_DIET_LIVE_DEFICIT_1__)return;
  window.__TEAM_BULLS_DIET_LIVE_DEFICIT_1__=true;

  const VERSION='10.10.13-deficit1';
  let frame=0;
  let observer=null;
  const n=value=>{const parsed=Number(String(value??'').replace(',','.'));return Number.isFinite(parsed)?parsed:0;};
  const norm=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
  const trainer=()=>typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role==='trainer';
  const fmt=value=>Math.round(Math.abs(n(value))).toLocaleString('pt-BR');

  function plan(){
    try{if(typeof currentDiet==='function')return currentDiet();}catch(error){}
    try{const plans=typeof DIET_DOCUMENT!=='undefined'&&Array.isArray(DIET_DOCUMENT?.plans)?DIET_DOCUMENT.plans:[],id=String(typeof CURRENT_DIET_ID!=='undefined'?CURRENT_DIET_ID:'');return plans.find(item=>String(item?.id||'')===id)||plans.find(item=>item?.isActive)||plans[0]||null;}catch(error){return null;}
  }
  function variant(activePlan=plan()){
    try{if(typeof currentDietVariant==='function')return currentDietVariant();}catch(error){}
    try{const id=String(typeof CURRENT_DIET_VARIANT_ID!=='undefined'?CURRENT_DIET_VARIANT_ID:'');return activePlan?.variants?.find(item=>String(item?.id||'')===id)||activePlan?.variants?.[0]||null;}catch(error){return null;}
  }
  function energy(activePlan=plan(),activeVariant=variant(activePlan)){
    const summary=activePlan?.energySummary&&typeof activePlan.energySummary==='object'?activePlan.energySummary:{};
    let get=n(summary.totalExpenditure);
    if(!(get>0)){const body=document.getElementById('tb-diet-calc-body'),fromCalc=n(body?.dataset?.finalGcd);if(fromCalc>0)get=fromCalc;}
    const training=n(summary.trainingDayEnergy),rest=n(summary.restDayEnergy),name=norm(activeVariant?.name),id=String(activeVariant?.id||''),byVariant=summary.variantEnergy||{};let target=0;
    if(Object.prototype.hasOwnProperty.call(byVariant,id))target=n(byVariant[id]);
    else if(name==='dia de treino')target=training;
    else if(name==='dia sem treino')target=rest;
    return{get,target};
  }
  function totalWithDraft(){
    const analyze=window.TeamBullsDietLiveCalories?.analyze;if(typeof analyze!=='function')return{kcal:0,matched:0,unknown:0,totalLines:0};
    const meals=typeof MEAL_PLAN_CACHE!=='undefined'&&Array.isArray(MEAL_PLAN_CACHE?.meals)?MEAL_PLAN_CACHE.meals:[],editId=String(typeof EDIT_MEAL_ID!=='undefined'&&EDIT_MEAL_ID||''),draft=String(document.getElementById('input-meal-items')?.value||''),sum={kcal:0,matched:0,unknown:0,totalLines:0};
    const add=result=>{sum.kcal+=n(result?.kcal);sum.matched+=n(result?.matched);sum.unknown+=n(result?.unknown);sum.totalLines+=n(result?.totalLines);};
    let replaced=false;for(const meal of meals){if(editId&&String(meal?.id||'')===editId){add(analyze(draft));replaced=true;}else add(analyze(meal?.items||''));}
    if(!editId&&draft.trim())add(analyze(draft));else if(editId&&!replaced&&draft.trim())add(analyze(draft));return sum;
  }
  function state(total,get){if(!(get>0)||!(total>=0))return'unknown';const delta=get-total;if(Math.abs(delta)<1)return'maintenance';return delta>0?'deficit':'surplus';}
  function render(){
    if(!trainer())return false;const host=document.getElementById('tb-trainer-diet-workspace-summary'),row=host?.querySelector('.tb-workspace-total-row');if(!row)return false;
    const activePlan=plan(),activeVariant=variant(activePlan),{get,target}=energy(activePlan,activeVariant),total=totalWithDraft(),mode=state(total.kcal,get);let badge=row.querySelector('.tb-live-deficit-badge');
    if(!badge){badge=document.createElement('span');badge.className='tb-live-deficit-badge';row.appendChild(badge);}
    badge.dataset.state=mode;
    const variantName=String(activeVariant?.name||'Divisão atual');
    if(!(get>0)){badge.innerHTML=`<b>GET NÃO INFORMADO</b><small>${variantName} · preencha o GET da dieta para acompanhar o déficit</small>`;return true;}
    const delta=get-total.kcal,label=mode==='surplus'?'SUPERÁVIT':mode==='maintenance'?'MANUTENÇÃO':'DÉFICIT',amount=mode==='maintenance'?'0 kcal':`${fmt(delta)} kcal`,pct=get>0?Math.abs(delta)/get*100:0;
    const targetText=target>0?` · meta VET ${Math.round(target).toLocaleString('pt-BR')} kcal`:'';
    badge.innerHTML=`<b>${label} ${amount}</b><small>GET ${Math.round(get).toLocaleString('pt-BR')} kcal · ${variantName}${targetText} · ${pct.toLocaleString('pt-BR',{maximumFractionDigits:1})}%</small>`;return true;
  }
  function schedule(){if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=0;render();});}
  function styles(){if(document.getElementById('tb-live-deficit-style'))return;const style=document.createElement('style');style.id='tb-live-deficit-style';style.textContent=`
    .tb-workspace-total-row{flex-wrap:wrap}.tb-live-deficit-badge{display:flex;flex:0 1 245px;min-width:190px;flex-direction:column;align-items:flex-end;margin-left:auto;padding:7px 9px;border:1px solid rgba(255,255,255,.09);border-radius:9px;background:#0d0d0d;text-align:right}.tb-live-deficit-badge b{font:900 13px 'Barlow Condensed',sans-serif;letter-spacing:.45px;color:#d7d0ca}.tb-live-deficit-badge small{margin-top:3px!important;max-width:245px!important;color:#817872!important;font:600 7px/1.35 'DM Mono',monospace!important}.tb-live-deficit-badge[data-state="deficit"]{border-color:rgba(34,197,94,.32);background:rgba(34,197,94,.055)}.tb-live-deficit-badge[data-state="deficit"] b{color:#7ddd9e}.tb-live-deficit-badge[data-state="surplus"]{border-color:rgba(225,29,72,.38);background:rgba(225,29,72,.055)}.tb-live-deficit-badge[data-state="surplus"] b{color:#ff718b}.tb-live-deficit-badge[data-state="maintenance"] b{color:#e4c36d}@media(max-width:720px){.tb-live-deficit-badge{flex-basis:100%;align-items:flex-start;margin-left:0;text-align:left}.tb-live-deficit-badge small{max-width:none!important}}
  `;document.head.appendChild(style);}
  function install(){styles();document.addEventListener('input',event=>{if(event.target?.id==='input-meal-items'||event.target?.closest?.('#tb-diet-calc-body'))schedule();},true);document.addEventListener('change',event=>{if(event.target?.id==='input-meal-items'||event.target?.closest?.('#tb-diet-calc-body'))schedule();},true);if(!observer&&document.body){observer=new MutationObserver(mutations=>{if(mutations.some(m=>m.target?.closest?.('#tb-trainer-diet-workspace-summary,#tb-meal-portion-body')||[...(m.addedNodes||[])].some(node=>node?.nodeType===1&&node.querySelector?.('#tb-trainer-diet-workspace-summary'))))schedule();});observer.observe(document.body,{childList:true,subtree:true});}schedule();}
  window.TeamBullsDietLiveDeficit=Object.freeze({version:VERSION,refresh:schedule,calculate:()=>{const activePlan=plan(),activeVariant=variant(activePlan),total=totalWithDraft(),e=energy(activePlan,activeVariant);return{...total,...e,balanceKcal:e.get-total.kcal,variantId:String(activeVariant?.id||''),variantName:String(activeVariant?.name||'')}}});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();window.addEventListener('pageshow',schedule,{passive:true});window.addEventListener('team-bulls-runtime-ready',schedule);
})();
