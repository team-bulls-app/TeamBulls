/* Team Bulls v10.10.28 — cópia segura de dietas para edição pelo treinador. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_DIET_COPY_101028__)return;
  window.__TEAM_BULLS_DIET_COPY_101028__=true;

  const VERSION='10.10.28-dietcopy2';
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

  let variantCopyContext=null,copyingVariant=false;
  const COPY_MODAL='modal-diet-variant-copy';

  function copyContextCurrent(context){
    return !!context&&editable()&&CURRENT_USER.uid===context.trainerUid&&
      String(DIET_CONTEXT.targetUid)===context.targetUid&&String(CURRENT_DIET_ID)===context.dietId&&
      (context.authRevision===null||AUTH_STATE_REVISION===context.authRevision);
  }
  function openVariantCopy(sourceId){
    if(!editable()||copyingVariant)return false;
    const plan=planById(CURRENT_DIET_ID),source=plan?.variants?.find(item=>String(item.id)===String(sourceId));
    if(!source?.meals?.length){showToast('Adicione refeições ao dia que deseja copiar.',true);return false;}
    variantCopyContext={trainerUid:CURRENT_USER.uid,targetUid:String(DIET_CONTEXT.targetUid),dietId:String(plan.id),sourceId:String(source.id),
      authRevision:typeof AUTH_STATE_REVISION==='number'?AUTH_STATE_REVISION:null,signature:JSON.stringify(plan)};
    let modal=document.getElementById(COPY_MODAL);
    if(!modal){
      modal=document.createElement('div');modal.id=COPY_MODAL;modal.className='modal-backdrop';
      modal.innerHTML='<div class="modal-sheet" style="max-width:520px"><div class="modal-handle"></div><div class="modal-title">Copiar refeições do dia</div><p class="plan-help form-group" id="diet-copy-source"></p><div class="form-group"><label class="form-label" for="diet-copy-target">Copiar para</label><select class="form-input" id="diet-copy-target" onchange="TeamBullsDietCopy.updateTarget()"></select></div><div class="form-group" id="diet-copy-name-wrap"><label class="form-label" for="diet-copy-name">Nome da nova divisão</label><input class="form-input" id="diet-copy-name" maxlength="100" placeholder="Dia sem treino"/></div><p class="plan-help form-group">Serão copiadas todas as refeições, horários, quantidades e orientações. Os registros de refeições concluídas ficam no histórico.</p><button type="button" class="btn-primary" onclick="TeamBullsDietCopy.confirmVariantCopy()">COPIAR REFEIÇÕES</button><button type="button" class="btn-ghost" onclick="closeModal(\'modal-diet-variant-copy\')">CANCELAR</button></div>';
      document.body.appendChild(modal);
    }
    document.getElementById('diet-copy-source').textContent=source.name+' · '+source.meals.length+' refeições';
    const select=document.getElementById('diet-copy-target');select.replaceChildren();
    for(const variant of plan.variants.filter(item=>String(item.id)!==String(source.id))){
      const option=document.createElement('option');option.value=String(variant.id);option.textContent=variant.name;select.appendChild(option);
    }
    if(plan.variants.length<12){
      const option=document.createElement('option');option.value='';option.textContent='Criar nova divisão';select.appendChild(option);
    }
    document.getElementById('diet-copy-name').value=('Cópia de '+source.name).slice(0,100);
    updateVariantCopyTarget();openModal(COPY_MODAL);return true;
  }
  function updateVariantCopyTarget(){
    const select=document.getElementById('diet-copy-target'),wrap=document.getElementById('diet-copy-name-wrap');
    if(wrap)wrap.hidden=!!select?.value;
  }
  async function copyVariantConfirmed(context,targetId,name){
    if(copyingVariant||!copyContextCurrent(context))return false;
    const original=DIET_DOCUMENT,plan=planById(context.dietId);
    if(!plan||JSON.stringify(plan)!==context.signature){alert('A dieta mudou. Abra a cópia novamente para conferir as refeições.');return false;}
    const source=plan.variants.find(item=>String(item.id)===context.sourceId);
    const destination=plan.variants.find(item=>String(item.id)===targetId);
    if(!source?.meals?.length||targetId===context.sourceId||(targetId&&!destination)||(!targetId&&(!name||plan.variants.length>=12)))return false;
    if(!beginAction('copy-diet-variant',COPY_MODAL))return false;
    copyingVariant=true;
    let saved,target;
    try{
      const draft=clone(original),copyPlan=draft.plans.find(item=>String(item.id)===context.dietId);
      target=targetId?copyPlan.variants.find(item=>String(item.id)===targetId):
        normalizeDietVariant({id:nextId('variant'),name,daysPerWeek:0,weekdays:[],workoutDays:[],restDaysPerWeek:0,restWeekdays:[],meals:[],order:copyPlan.variants.length},copyPlan.variants.length);
      target.meals=source.meals.map(cloneMeal);
      if(!targetId)copyPlan.variants.push(target);
      copyPlan.meals=copyPlan.variants[0].meals;
      saved=await persistDietDocumentDraft(draft,{targetUid:context.targetUid,trainer:true,local:false});
    }catch(error){
      console.error('[Team Bulls] Falha ao copiar refeições',error);
      if(copyContextCurrent(context))alert(typeof cloudWriteError==='function'?cloudWriteError(error,'copiar as refeições'):error.message);
      return false;
    }finally{copyingVariant=false;endAction('copy-diet-variant',COPY_MODAL);}
    if(copyContextCurrent(context)&&DIET_DOCUMENT===original){
      DIET_DOCUMENT=saved;CURRENT_DIET_VARIANT_ID=target.id;
      closeModal(COPY_MODAL);
      try{
        renderTrainerDietList();renderDietVariantTabs(true);v104ActivateVariantMeals(true);
        if(!targetId)openEditDietVariantModal(target.id);
      }catch(error){console.warn('[Team Bulls] Refeições salvas. Reabra a dieta para conferir a exibição.',error);}
      showToast('✓ Refeições copiadas. Ajuste as quantidades para este dia.');
    }
    return true;
  }
  function confirmVariantCopy(){
    const context=variantCopyContext;
    if(!copyContextCurrent(context)||copyingVariant)return false;
    const targetId=String(document.getElementById('diet-copy-target')?.value||'');
    const name=String(document.getElementById('diet-copy-name')?.value||'').trim().slice(0,100);
    const plan=planById(context.dietId),target=plan?.variants.find(item=>String(item.id)===targetId);
    if(!targetId&&!name){alert('Informe o nome da nova divisão.');return false;}
    const task=()=>copyVariantConfirmed(context,targetId,name);
    if(target?.meals?.length){
      showConfirm('Substituir refeições do dia','Substituir as '+target.meals.length+' refeições de “'+target.name+'” pelas refeições copiadas? Os horários, alimentos, quantidades e orientações atuais deste dia serão substituídos. O histórico de refeições concluídas será preservado.',task);
      return true;
    }
    return task();
  }
  function decorateVariants(trainerMode){
    if(!trainerMode||!editable())return;
    const plan=planById(CURRENT_DIET_ID),host=document.getElementById('ts-diet-variant-tabs');if(!plan||!host)return;
    [...host.querySelectorAll(':scope > .diet-variant-card')].forEach((card,index)=>{
      const variant=plan.variants[index],controls=card.querySelector('.diet-variant-actions');if(!variant||!controls||controls.querySelector('.tb-diet-copy-btn'))return;
      card.classList.add('tb-diet-copy-card');controls.classList.add('tb-diet-copy-actions');
      const button=document.createElement('button');button.type='button';button.className='tb-diet-copy-btn';
      button.textContent='COPIAR REFEIÇÕES';button.disabled=!variant.meals.length;
      button.onclick=event=>{event.preventDefault();event.stopPropagation();openVariantCopy(variant.id);};controls.appendChild(button);
    });
  }
  function patchVariants(){
    if(typeof renderDietVariantTabs!=='function'||renderDietVariantTabs.__tbDietCopy)return;
    const base=renderDietVariantTabs;
    const wrapped=function(trainerMode){const result=base.apply(this,arguments);decorateVariants(trainerMode);return result;};
    wrapped.__tbDietCopy=true;renderDietVariantTabs=wrapped;
  }

  function ensureStyles(){
    if(document.getElementById('tb-diet-copy-style'))return;
    const style=document.createElement('style');style.id='tb-diet-copy-style';style.textContent=`
      .tb-diet-copy-card>div:first-child{min-width:0;overflow-wrap:anywhere}
      .diet-variant-actions.tb-diet-copy-actions{flex-wrap:wrap;max-width:150px;justify-content:flex-end}
      .diet-variant-actions .tb-diet-copy-btn{height:auto;min-height:32px;width:100%;max-width:100%;padding:5px 9px;font-size:10px;white-space:normal}
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
    ensureStyles();patchRender();patchVariants();
    window.duplicateDietPlan=duplicateDietPlan;
    window.TeamBullsDietCopy=Object.freeze({version:VERSION,duplicate:duplicateDietPlan,buildCopy,openVariantCopy,confirmVariantCopy,updateTarget:updateVariantCopyTarget});
    if(trainer()){decorateList('ts-meals-list',true);decorateVariants(true);}
  }

  install();
  document.addEventListener('DOMContentLoaded',install,{once:true});
  window.addEventListener('team-bulls-runtime-ready',install,{once:true});
})();
