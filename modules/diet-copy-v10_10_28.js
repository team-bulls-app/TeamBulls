/* Team Bulls v10.10.28 — cópia segura de dietas para edição pelo treinador. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_DIET_COPY_101028__)return;
  window.__TEAM_BULLS_DIET_COPY_101028__=true;

  const VERSION='10.10.28-dietcopy1';
  const MAX_PLANS=40;

  function clone(value){
    try{return JSON.parse(JSON.stringify(value));}catch(error){return null;}
  }
  function trainer(){
    try{return CURRENT_USER?.role==='trainer';}catch(error){return false;}
  }
  function editable(){
    try{return trainer()&&DIET_CONTEXT?.trainer===true&&!!DIET_CONTEXT?.targetUid&&typeof dietCanEdit==='function'&&dietCanEdit();}catch(error){return false;}
  }
  function nextId(prefix='diet-copy'){
    try{if(typeof uid==='function')return String(uid());}catch(error){}
    try{if(crypto?.randomUUID)return String(crypto.randomUUID());}catch(error){}
    return prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
  }
  function planById(id){
    try{return (DIET_DOCUMENT?.plans||[]).find(plan=>String(plan.id)===String(id))||null;}catch(error){return null;}
  }
  function uniqueCopyName(source){
    const current=new Set((DIET_DOCUMENT?.plans||[]).map(plan=>String(plan.name||'').trim().toLocaleLowerCase('pt-BR')));
    const sourceName=String(source?.name||'Dieta').trim()||'Dieta';
    let attempt=1;
    while(attempt<100){
      const prefix=attempt===1?'Cópia de ':`Cópia ${attempt} de `;
      const candidate=(prefix+sourceName).slice(0,100).trim();
      if(!current.has(candidate.toLocaleLowerCase('pt-BR')))return candidate;
      attempt++;
    }
    return('Cópia '+Date.now().toString(36)+' — '+sourceName).slice(0,100);
  }
  function cloneMeal(meal,index){
    const copy=clone(meal)||{};
    copy.id=nextId('meal');
    copy.doneDates=[];
    copy.name=String(copy.name||('Refeição '+(index+1))).slice(0,100);
    return copy;
  }
  function cloneVariant(variant,index){
    const copy=clone(variant)||{};
    copy.id=nextId('variant');
    copy.order=index;
    copy.meals=(Array.isArray(variant?.meals)?variant.meals:[]).map(cloneMeal);
    return copy;
  }
  function buildCopy(source){
    const copy=clone(source);if(!copy)throw new Error('Não foi possível preparar a cópia da dieta.');
    copy.id=nextId();
    copy.name=uniqueCopyName(source);
    copy.isActive=false;
    copy.order=(DIET_DOCUMENT?.plans||[]).length;
    const sourceVariants=Array.isArray(source?.variants)?source.variants:[];
    copy.variants=sourceVariants.map(cloneVariant);
    const previousEnergy=source?.energySummary?.variantEnergy;
    if(previousEnergy&&typeof previousEnergy==='object'&&!Array.isArray(previousEnergy)){
      const variantEnergy={};
      sourceVariants.forEach((variant,index)=>{
        const oldId=String(variant?.id||'');
        if(Object.prototype.hasOwnProperty.call(previousEnergy,oldId))variantEnergy[copy.variants[index].id]=previousEnergy[oldId];
      });
      copy.energySummary={...copy.energySummary,variantEnergy};
    }
    if(copy.variants.length)copy.meals=copy.variants[0].meals;
    else copy.meals=(Array.isArray(source?.meals)?source.meals:[]).map(cloneMeal);
    if(Array.isArray(DIET_SECTION_DEFS)){
      DIET_SECTION_DEFS.forEach(def=>{
        const key=String(def?.key||'');if(!key)return;
        copy[key]=(Array.isArray(source?.[key])?source[key]:[]).map((item,index)=>({...clone(item),id:nextId('diet-item'),order:index}));
      });
    }
    return typeof normalizeDietPlan==='function'?normalizeDietPlan(copy,copy.order):copy;
  }
  function reportError(error){
    console.error('[Team Bulls] Falha ao duplicar dieta',error);
    const message=typeof cloudWriteError==='function'?cloudWriteError(error,'duplicar a dieta'):(error?.message||'Não foi possível duplicar a dieta.');
    alert(message);
    return false;
  }
  function renderTrainerDietList(){
    try{if(typeof renderDietList==='function')renderDietList('ts-meals-list','ts-meals-empty',true);}catch(error){console.warn('[Team Bulls] Cópia criada, mas a lista não pôde ser atualizada imediatamente.',error);}
  }
  async function duplicateConfirmed(sourceId){
    if(!editable())return false;
    const source=planById(sourceId);if(!source)return reportError(new Error('A dieta selecionada não está mais disponível.'));
    if((DIET_DOCUMENT?.plans||[]).length>=MAX_PLANS){alert('Este aluno já atingiu o limite seguro de 40 dietas. Exclua uma dieta antiga antes de criar outra cópia.');return false;}
    const snapshot=clone(DIET_DOCUMENT),previousDiet=String(typeof CURRENT_DIET_ID!=='undefined'?CURRENT_DIET_ID:''),previousVariant=String(typeof CURRENT_DIET_VARIANT_ID!=='undefined'?CURRENT_DIET_VARIANT_ID:'');
    const actionKey='duplicate-diet-'+String(sourceId);
    if(typeof beginAction==='function'&&!beginAction(actionKey))return false;
    try{
      const copy=buildCopy(source);
      DIET_DOCUMENT.plans.push(copy);
      if(typeof normalizeDietDocument==='function')DIET_DOCUMENT=normalizeDietDocument(DIET_DOCUMENT);
      await persistDietDocument();
      const saved=planById(copy.id)||DIET_DOCUMENT.plans.find(plan=>plan.name===copy.name);
      renderTrainerDietList();
      if(saved){
        try{CURRENT_DIET_ID=saved.id;CURRENT_DIET_VARIANT_ID=saved.variants?.[0]?.id||'';}catch(error){}
        if(typeof showToast==='function')showToast('✓ Cópia criada. A dieta original foi preservada.');
        setTimeout(()=>{try{if(typeof openEditDietModal==='function')openEditDietModal(saved.id);}catch(error){console.warn('[Team Bulls] Cópia salva, mas o editor não abriu automaticamente.',error);}},0);
      }
      return true;
    }catch(error){
      try{DIET_DOCUMENT=typeof normalizeDietDocument==='function'?normalizeDietDocument(snapshot):snapshot;}catch(inner){DIET_DOCUMENT=snapshot;}
      try{CURRENT_DIET_ID=previousDiet;CURRENT_DIET_VARIANT_ID=previousVariant;}catch(inner){}
      renderTrainerDietList();
      return reportError(error);
    }finally{
      if(typeof endAction==='function')endAction(actionKey);
    }
  }
  function duplicateDietPlan(sourceId){
    if(!editable())return false;
    const source=planById(sourceId);if(!source)return reportError(new Error('Dieta não encontrada.'));
    const task=()=>duplicateConfirmed(source.id);
    const message=`Criar uma cópia completa de “${String(source.name||'Dieta')}”? Refeições, divisões, quantidades, suplementos, tabelas, política de refeição livre e valores energéticos serão copiados. A cópia ficará desativada e a dieta original permanecerá intacta.`;
    if(typeof showConfirm==='function'){showConfirm('Duplicar dieta',message,task);return true;}
    if(window.confirm(message)){void task();return true;}
    return false;
  }
  function decorateList(listId,trainerMode){
    if(!trainerMode||!trainer())return;
    const list=document.getElementById(listId);if(!list)return;
    const plans=DIET_DOCUMENT?.plans||[],cards=[...list.querySelectorAll(':scope > .diet-folder-card')];
    cards.forEach((card,index)=>{
      const plan=plans[index],controls=card.querySelector('.diet-card-controls');if(!plan||!controls)return;
      let button=controls.querySelector('.tb-diet-copy-btn');
      if(!button){
        button=document.createElement('button');button.type='button';button.className='tb-diet-copy-btn';button.textContent='⧉ DUPLICAR';button.title='Criar cópia desta dieta para modificar';
        const edit=controls.querySelector('.btn-icon.ghost');controls.insertBefore(button,edit||null);
      }
      button.dataset.dietId=String(plan.id);
      button.onclick=event=>{event.preventDefault();event.stopPropagation();duplicateDietPlan(plan.id);};
    });
  }
  function ensureStyles(){
    if(document.getElementById('tb-diet-copy-style'))return;
    const style=document.createElement('style');style.id='tb-diet-copy-style';style.textContent=`
      .diet-card-controls .tb-diet-copy-btn{min-height:30px;border:1px solid rgba(255,255,255,.12);border-radius:7px;background:#171717;color:#c9c1bb;padding:0 9px;font:800 8px 'DM Mono',monospace;letter-spacing:.45px;cursor:pointer;white-space:nowrap}
      .diet-card-controls .tb-diet-copy-btn:hover{border-color:rgba(225,29,72,.48);color:#fff}
      .diet-card-controls .tb-diet-copy-btn:disabled{opacity:.35;cursor:not-allowed}
    `;document.head.appendChild(style);
  }
  function patchRender(){
    if(typeof renderDietList!=='function'||renderDietList.__tbDietCopy)return false;
    const base=renderDietList;
    const wrapped=function(listId,emptyId,trainerMode){const result=base.apply(this,arguments);if(trainerMode)decorateList(listId,true);return result;};
    wrapped.__tbDietCopy=true;wrapped.__tbBase=base;renderDietList=wrapped;return true;
  }
  function install(){
    ensureStyles();patchRender();
    window.duplicateDietPlan=duplicateDietPlan;
    window.TeamBullsDietCopy=Object.freeze({version:VERSION,duplicate:duplicateDietPlan,buildCopy});
    if(trainer())decorateList('ts-meals-list',true);
  }

  install();
  document.addEventListener('DOMContentLoaded',install,{once:true});
  window.addEventListener('team-bulls-runtime-ready',install,{once:true});
})();
