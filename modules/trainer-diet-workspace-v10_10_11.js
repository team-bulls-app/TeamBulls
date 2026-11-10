(()=>{
  'use strict';
  if(window.__TEAM_BULLS_TRAINER_DIET_WORKSPACE_101011__)return;
  window.__TEAM_BULLS_TRAINER_DIET_WORKSPACE_101011__=true;

  const VERSION='10.10.11-dietworkspace2';
  let formSnapshot='';
  let editorRevision=0;
  let navigating=false;
  let summaryFrame=0;
  let customObserver=null;
  let touchStart=null;

  const trainer=()=>typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role==='trainer';
  const editable=()=>trainer()&&typeof MEAL_CTX!=='undefined'&&MEAL_CTX?.canEditContent===true;
  const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=value=>{const parsed=Number(String(value??'').replace(',','.'));return Number.isFinite(parsed)?parsed:0;};
  const br=(value,digits=1)=>n(value).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:digits});
  const toast=(message,error=false)=>typeof showToast==='function'?showToast(message,error):undefined;

  function sortedMeals(){
    const meals=typeof MEAL_PLAN_CACHE!=='undefined'&&Array.isArray(MEAL_PLAN_CACHE?.meals)?MEAL_PLAN_CACHE.meals:[];
    return[...meals].sort((a,b)=>String(a?.time||'').localeCompare(String(b?.time||'')));
  }
  function formState(){return{
    time:String(document.getElementById('input-meal-time')?.value||''),
    items:String(document.getElementById('input-meal-items')?.value||''),
    notes:String(document.getElementById('input-meal-notes')?.value||'').trim()
  };}
  function stateKey(state=formState()){return JSON.stringify(state);}
  function hasDraft(state=formState()){return!!(state.time||state.items.trim()||state.notes);}
  function isDirty(){return stateKey()!==formSnapshot;}
  function currentPosition(){
    const meals=sortedMeals();
    if(!EDIT_MEAL_ID)return{index:meals.length,total:meals.length,isNew:true,meals};
    const found=meals.findIndex(item=>item.id===EDIT_MEAL_ID);
    if(found<0)return{index:meals.length,total:meals.length,isNew:true,meals};
    return{index:found,total:meals.length,isNew:false,meals};
  }

  function analyze(text){
    const api=window.TeamBullsDietLiveCalories;
    if(typeof api?.analyze==='function')return api.analyze(text);
    return{protein:0,carbs:0,fat:0,kcal:0,matched:0,unknown:String(text||'').trim()?1:0,totalLines:String(text||'').trim()?1:0};
  }
  function addTotal(sum,value){
    sum.protein+=n(value?.protein);sum.carbs+=n(value?.carbs);sum.fat+=n(value?.fat);sum.kcal+=n(value?.kcal);
    sum.matched+=n(value?.matched);sum.unknown+=n(value?.unknown);sum.totalLines+=n(value?.totalLines);return sum;
  }
  function dietTotalWithDraft(){
    const total={protein:0,carbs:0,fat:0,kcal:0,matched:0,unknown:0,totalLines:0};
    const state=formState();
    for(const meal of sortedMeals()){
      if(EDIT_MEAL_ID&&meal.id===EDIT_MEAL_ID)addTotal(total,analyze(state.items));
      else addTotal(total,analyze(meal?.items||''));
    }
    if(!EDIT_MEAL_ID&&hasDraft(state))addTotal(total,analyze(state.items));
    return total;
  }
  function bodyWeightKg(){
    const input=document.querySelector('#tb-diet-calc-body [data-calc="actualWeightKg"]');
    const value=n(input?.value);return value>0?value:0;
  }
  function macroRow(label,grams,kcal,totalKcal,weight){
    const pct=totalKcal>0?kcal/totalKcal*100:0,perKg=weight>0?grams/weight:0;
    return`<tr><td>${h(label)}</td><td>${br(grams,1)}</td><td>${Math.round(kcal).toLocaleString('pt-BR')}</td><td>${br(pct,1)}%</td><td>${weight?br(perKg,2):'—'}</td></tr>`;
  }
  function summaryMarkup(total){
    const pKcal=n(total.protein)*4,cKcal=n(total.carbs)*4,fKcal=n(total.fat)*9,macroKcal=pKcal+cKcal+fKcal;
    const weight=bodyWeightKg(),partial=total.unknown>0;
    const source=!total.totalLines?'Comece a prescrição para acompanhar os totais em tempo real.':partial?`${total.matched} item(ns) calculado(s) · ${total.unknown} linha(s) sem referência nutricional.`:`${total.matched} item(ns) contabilizado(s) automaticamente.`;
    return`<div class="tb-workspace-macro-kicker">MACROS DA DIETA · AO VIVO</div>
      <div class="tb-workspace-total-row"><strong>${Math.round(total.kcal).toLocaleString('pt-BR')} <small>kcal</small></strong><span>${weight?`Peso corporal ${br(weight,1)} kg`:'g/kg aparece quando o peso atual está carregado no cálculo'}</span></div>
      <table class="tb-workspace-macro-table"><thead><tr><th>Macro</th><th>g</th><th>kcal</th><th>%</th><th>g/kg</th></tr></thead><tbody>
        ${macroRow('Proteína',n(total.protein),pKcal,macroKcal,weight)}
        ${macroRow('Carboidratos',n(total.carbs),cKcal,macroKcal,weight)}
        ${macroRow('Gorduras',n(total.fat),fKcal,macroKcal,weight)}
      </tbody></table>
      <div class="tb-workspace-source${partial?' warn':''}">${h(source)}</div>`;
  }
  function refreshSummary(){
    if(summaryFrame)cancelAnimationFrame(summaryFrame);
    summaryFrame=requestAnimationFrame(()=>{
      summaryFrame=0;
      if(!editable())return;
      try{window.TeamBullsRelease?.syncCustomFoodMacros?.();}catch(error){}
      const host=document.getElementById('tb-trainer-diet-workspace-summary');
      if(host)host.innerHTML=summaryMarkup(dietTotalWithDraft());
      updateNavState();
    });
  }

  function updateNavState(){
    const root=document.getElementById('tb-trainer-diet-workspace');if(!root)return;
    const {index,total,isNew}=currentPosition();
    const number=isNew?total+1:index+1;
    const title=root.querySelector('[data-workspace-meal-title]');if(title)title.textContent=`Refeição ${Math.max(1,number)}`;
    const meta=root.querySelector('[data-workspace-meal-meta]');if(meta)meta.textContent=isNew?`Nova refeição · ${total} salva(s)`:`${index+1} de ${total} · deslize ou use as setas`;
    const prev=root.querySelector('[data-workspace-prev]');if(prev)prev.disabled=isNew?total===0:index<=0;
    const next=root.querySelector('[data-workspace-next]');if(next)next.disabled=isNew||index>=total-1;
    const dirty=root.querySelector('[data-workspace-dirty]');if(dirty){dirty.hidden=!isDirty();dirty.textContent='● ALTERAÇÕES NÃO SALVAS';}
  }

  function bindInputs(){
    ['input-meal-time','input-meal-items','input-meal-notes'].forEach(id=>{
      const input=document.getElementById(id);if(!input||input.dataset.tbWorkspaceBound==='1')return;
      input.dataset.tbWorkspaceBound='1';input.addEventListener('input',refreshSummary,{passive:true});input.addEventListener('change',refreshSummary,{passive:true});
    });
  }
  function syncSnapshot(){formSnapshot=stateKey();updateNavState();}

  async function persistCurrent({allowEmpty=false,notify=false}={}){
    if(!editable())return false;
    const state=formState();
    if(!EDIT_MEAL_ID&&!hasDraft(state)&&!allowEmpty){toast('Adicione ao menos um alimento, horário ou observação antes de salvar.',true);return false;}
    if(EDIT_MEAL_ID&&!isDirty())return true;
    if(!EDIT_MEAL_ID&&!hasDraft(state))return true;
    if(typeof beginAction==='function'&&!beginAction('workspace-save-meal','modal-meal')){toast('Uma refeição ainda está sendo salva. Aguarde a confirmação.',true);return false;}
    const cache=MEAL_PLAN_CACHE,originalMeals=cache.meals,workingMeals=originalMeals.map(meal=>({...meal})),previousId=EDIT_MEAL_ID,context=MEAL_CTX,actor=CURRENT_USER?.uid,revision=editorRevision;
    let plan=null,variant=null;try{plan=typeof currentDiet==='function'?currentDiet():null;variant=typeof currentDietVariant==='function'?currentDietVariant():null;}catch{}
    const dietContext=typeof DIET_CONTEXT!=='undefined'?{...DIET_CONTEXT}:null;
    let expectedId=previousId,expectedMeals=workingMeals,committed=false;
    const current=()=>editable()&&CURRENT_USER?.uid===actor&&MEAL_CTX===context&&MEAL_PLAN_CACHE===cache&&cache.meals===expectedMeals&&editorRevision===revision&&EDIT_MEAL_ID===expectedId;
    try{
      cache.meals=workingMeals;
      const mealsBefore=sortedMeals();
      const currentNumber=previousId?Math.max(1,mealsBefore.findIndex(x=>x.id===previousId)+1):MEAL_PLAN_CACHE.meals.length+1;
      const name='Refeição '+currentNumber;
      if(previousId){
        const meal=MEAL_PLAN_CACHE.meals.find(x=>x.id===previousId);if(!meal)throw new Error('Refeição não encontrada.');
        meal.time=state.time;meal.name=name;meal.items=state.items;meal.notes=state.notes;
      }else{
        const id=typeof uid==='function'?uid():'meal-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
        cache.meals.push({id,time:state.time,name,items:state.items,notes:state.notes,doneDates:[]});EDIT_MEAL_ID=id;expectedId=id;
      }
      if(typeof persistDietDocumentDraft!=='function')throw new Error('Atualize o aplicativo antes de salvar a refeição.');
      const draft=normalizeDietDocument(DIET_DOCUMENT),nextPlan=draft.plans.find(item=>item.id===plan?.id),nextVariant=nextPlan?.variants?.find(item=>item.id===variant?.id);
      if(!nextPlan||!nextVariant||!dietContext)throw new Error('Abra a dieta e a divisão antes de salvar a refeição.');
      nextVariant.meals=workingMeals;nextPlan.meals=nextPlan.variants[0]?.meals||workingMeals;
      const saved=await persistDietDocumentDraft(draft,dietContext);committed=true;
      if(!current())return false;
      DIET_DOCUMENT=saved;expectedMeals=saved.plans.find(item=>item.id===plan.id)?.variants?.find(item=>item.id===variant.id)?.meals||workingMeals;cache.meals=expectedMeals;
      formSnapshot=stateKey(state);
      renderMealsList();
      updateNavState();refreshSummary();
      const pos=currentPosition(),mealNumber=Math.max(1,pos.index+1);
      const title=document.getElementById('modal-meal-title');if(title)title.textContent='Editar refeição '+mealNumber;
      const hidden=document.getElementById('input-meal-name');if(hidden)hidden.value='Refeição '+mealNumber;
      const help=document.getElementById('meal-sequence-help');if(help)help.textContent='Este registro é exibido como Refeição '+mealNumber+'.';
      const del=document.getElementById('btn-delete-meal');if(del)del.style.display='block';
      if(notify)toast('✓ Refeição salva sem fechar o planejamento');
      return true;
    }catch(error){
      if(committed){if(current())toast('Refeição salva. Reabra o planejamento para atualizar a tela.',true);return true;}
      const stillCurrent=current();if(cache.meals===workingMeals)cache.meals=originalMeals;
      if(!stillCurrent)return false;EDIT_MEAL_ID=previousId;
      alert('Erro ao salvar plano alimentar: '+(typeof cloudWriteError==='function'?cloudWriteError(error,'salvar o plano alimentar'):error.message));
      return false;
    }finally{if(typeof endAction==='function')endAction('workspace-save-meal','modal-meal');}
  }

  async function navigate(delta){
    if(!editable()||navigating)return;
    navigating=true;
    try{
      if(isDirty()||(!EDIT_MEAL_ID&&hasDraft())){if(!await persistCurrent())return;}
      const {index,total,meals}=currentPosition();
      const targetIndex=index+delta;
      if(targetIndex<0||targetIndex>=total){toast(delta>0?'Esta é a última refeição. Use + NOVA REFEIÇÃO para criar outra.':'Esta é a primeira refeição.');return;}
      openEditMealModal(meals[targetIndex].id);
    }finally{navigating=false;}
  }
  async function newMeal(){
    if(!editable()||navigating)return;
    navigating=true;
    try{
      if(isDirty()||(!EDIT_MEAL_ID&&hasDraft())){if(!await persistCurrent())return;}
      openAddMealModal();
    }finally{navigating=false;}
  }

  function ensureStyles(){
    if(document.getElementById('tb-trainer-diet-workspace-style'))return;
    const style=document.createElement('style');style.id='tb-trainer-diet-workspace-style';style.textContent=`
      #modal-meal.tb-trainer-diet-workspace{padding:2vh 2vw;align-items:center}
      #modal-meal.tb-trainer-diet-workspace>.modal-sheet{width:min(1320px,96vw);max-width:1320px;height:min(92vh,920px);max-height:92vh;padding:0;overflow:hidden;border-color:rgba(225,29,72,.24);background:#0c0c0c}
      #modal-meal.tb-trainer-diet-workspace .tb-workspace-shell{display:grid;grid-template-columns:minmax(0,1.16fr) minmax(400px,.84fr);height:100%;min-height:0}
      #modal-meal.tb-trainer-diet-workspace .tb-workspace-editor{display:flex;min-width:0;min-height:0;flex-direction:column;border-right:1px solid rgba(255,255,255,.07);background:linear-gradient(180deg,#0d0d0d,#0a0a0a)}
      #modal-meal.tb-trainer-diet-workspace .tb-workspace-editor-body{min-height:0;overflow:auto;padding:14px 18px 22px;overscroll-behavior:contain}
      #modal-meal.tb-trainer-diet-workspace .tb-workspace-editor-body>.modal-handle{margin-top:0}
      #modal-meal.tb-trainer-diet-workspace .tb-workspace-nav{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto auto;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.07);background:#111;position:sticky;top:0;z-index:12}
      #modal-meal.tb-trainer-diet-workspace .tb-workspace-nav button{border:1px solid rgba(255,255,255,.1);border-radius:8px;background:#181818;color:#c9c1bb;min-height:36px;padding:8px 11px;font:800 8px 'DM Mono',monospace;letter-spacing:.45px;cursor:pointer}
      #modal-meal.tb-trainer-diet-workspace .tb-workspace-nav button:not(:disabled):hover{border-color:rgba(225,29,72,.48);color:#fff}#modal-meal.tb-trainer-diet-workspace .tb-workspace-nav button:disabled{opacity:.28;cursor:not-allowed}
      #modal-meal.tb-trainer-diet-workspace .tb-workspace-nav .accent{border-color:rgba(225,29,72,.52);background:rgba(225,29,72,.12);color:#ff6a84}.tb-workspace-nav-copy{min-width:0}.tb-workspace-nav-copy strong{display:block;color:#f2ede9;font:900 18px 'Barlow Condensed',sans-serif}.tb-workspace-nav-copy span{display:block;margin-top:2px;color:#766e68;font:700 8px 'DM Mono',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tb-workspace-dirty{margin-top:3px!important;color:#f2ad64!important}
      #modal-meal.tb-trainer-diet-workspace .tb-workspace-side{display:flex;min-width:0;min-height:0;flex-direction:column;background:#101010}
      #modal-meal.tb-trainer-diet-workspace .tb-workspace-side-head{flex:0 0 auto;padding:15px 16px 12px;border-bottom:1px solid rgba(255,255,255,.065);background:linear-gradient(180deg,rgba(34,197,94,.045),transparent)}
      .tb-workspace-macro-kicker{font:800 8px 'DM Mono',monospace;color:#71d797;letter-spacing:1px}.tb-workspace-total-row{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-top:5px}.tb-workspace-total-row strong{font:900 28px 'Barlow Condensed',sans-serif;color:#f4f1ed}.tb-workspace-total-row strong small{font-size:13px;color:#9a928c}.tb-workspace-total-row span{max-width:190px;text-align:right;color:#817872;font-size:9px;line-height:1.35}
      .tb-workspace-macro-table{width:100%;border-collapse:collapse;margin-top:10px}.tb-workspace-macro-table th,.tb-workspace-macro-table td{padding:6px 5px;border-bottom:1px solid rgba(255,255,255,.055);text-align:right}.tb-workspace-macro-table th:first-child,.tb-workspace-macro-table td:first-child{text-align:left}.tb-workspace-macro-table th{color:#756d67;font:700 7px 'DM Mono',monospace;text-transform:uppercase}.tb-workspace-macro-table td{color:#cfc8c2;font:700 9px 'DM Mono',monospace}.tb-workspace-source{margin-top:7px;color:#6f9f7d;font-size:8px;line-height:1.35}.tb-workspace-source.warn{color:#d5aa65}
      #modal-meal.tb-trainer-diet-workspace .tb-workspace-foods{min-height:0;overflow:auto;padding:0 12px 14px;overscroll-behavior:contain}
      #modal-meal.tb-trainer-diet-workspace #tb-meal-portion-tool{margin:12px 0 0;border-radius:9px;border-color:rgba(255,255,255,.07);background:#0c0c0c}
      #modal-meal.tb-trainer-diet-workspace #tb-meal-portion-tool .tb-portion-tool-head{padding:9px 10px;position:sticky;top:0;z-index:8;background:#111}
      #modal-meal.tb-trainer-diet-workspace #tb-meal-portion-tool .tb-portion-tool-sub{display:none}
      #modal-meal.tb-trainer-diet-workspace #tb-meal-portion-tool .tb-portion-toggle{display:none}
      #modal-meal.tb-trainer-diet-workspace #tb-meal-portion-tool .tb-portion-tool-body{padding:8px}
      #modal-meal.tb-trainer-diet-workspace #tb-meal-portion-tool .tb-portion-scroll{max-height:none;overflow:visible;border-radius:6px}
      #modal-meal.tb-trainer-diet-workspace #tb-meal-portion-tool .tb-portion-table{min-width:0;font-size:9px}
      #modal-meal.tb-trainer-diet-workspace #tb-meal-portion-tool .tb-portion-table th,#modal-meal.tb-trainer-diet-workspace #tb-meal-portion-tool .tb-portion-table td{padding:6px 5px}
      #modal-meal.tb-trainer-diet-workspace #tb-meal-portion-tool .tb-portion-table th:nth-child(6),#modal-meal.tb-trainer-diet-workspace #tb-meal-portion-tool .tb-portion-table td:nth-child(6){display:none}
      #modal-meal.tb-trainer-diet-workspace #tb-meal-portion-tool .tb-portion-label{white-space:normal;line-height:1.15}
      #modal-meal.tb-trainer-diet-workspace #tb-meal-portion-tool .tb-portion-actions{gap:3px}#modal-meal.tb-trainer-diet-workspace #tb-meal-portion-tool .tb-portion-actions button{padding:5px 6px;font-size:6px}
      #modal-meal.tb-trainer-diet-workspace #tb-meal-portion-tool .tb-portion-note{display:none}
      #modal-meal.tb-trainer-diet-workspace .tb-custom-foods{margin:10px 0 0;border-top:1px solid rgba(255,255,255,.07);padding-top:10px}#modal-meal.tb-trainer-diet-workspace .tb-custom-scroll{max-height:none;overflow:visible}#modal-meal.tb-trainer-diet-workspace .tb-custom-table{min-width:0}
      #modal-meal.tb-trainer-diet-workspace #tb-live-meal-energy{display:none!important}
      #modal-meal.tb-trainer-diet-workspace .tb-workspace-editor-body>.btn-primary[onclick="saveMeal()"]{margin-top:12px}
      @media(max-width:900px){
        #modal-meal.tb-trainer-diet-workspace{padding:0;align-items:stretch}
        #modal-meal.tb-trainer-diet-workspace>.modal-sheet{width:100%;max-width:none;height:100dvh;max-height:100dvh;border-radius:0}
        #modal-meal.tb-trainer-diet-workspace .tb-workspace-shell{grid-template-columns:1fr;grid-template-rows:auto auto;overflow:auto}
        #modal-meal.tb-trainer-diet-workspace .tb-workspace-editor{border-right:0;min-height:auto}.tb-workspace-editor-body{overflow:visible!important}
        #modal-meal.tb-trainer-diet-workspace .tb-workspace-side{min-height:auto;border-top:1px solid rgba(255,255,255,.07)}#modal-meal.tb-trainer-diet-workspace .tb-workspace-foods{overflow:visible}
        #modal-meal.tb-trainer-diet-workspace .tb-workspace-nav{grid-template-columns:auto 1fr auto;gap:6px;padding:9px 10px}#modal-meal.tb-trainer-diet-workspace .tb-workspace-nav .tb-workspace-save,#modal-meal.tb-trainer-diet-workspace .tb-workspace-nav .tb-workspace-new{grid-column:auto/span 1}
        .tb-workspace-nav-copy strong{font-size:16px}.tb-workspace-nav-copy span{font-size:7px}.tb-workspace-total-row strong{font-size:25px}
      }
      @media(max-width:520px){#modal-meal.tb-trainer-diet-workspace .tb-workspace-nav{grid-template-columns:42px minmax(0,1fr) 42px}#modal-meal.tb-trainer-diet-workspace .tb-workspace-nav .tb-workspace-save,#modal-meal.tb-trainer-diet-workspace .tb-workspace-nav .tb-workspace-new{grid-column:span 1;font-size:7px;padding:7px}.tb-workspace-total-row{align-items:flex-start}.tb-workspace-total-row span{max-width:150px}.tb-workspace-macro-table td{font-size:8px}}
    `;document.head.appendChild(style);
  }

  function workspaceMarkup(){return`<div class="tb-workspace-shell" id="tb-trainer-diet-workspace">
    <section class="tb-workspace-editor">
      <nav class="tb-workspace-nav" aria-label="Navegação entre refeições">
        <button type="button" data-workspace-prev onclick="TeamBullsTrainerDietWorkspace.prev()" aria-label="Refeição anterior">←</button>
        <div class="tb-workspace-nav-copy"><strong data-workspace-meal-title>Refeição</strong><span data-workspace-meal-meta></span><span class="tb-workspace-dirty" data-workspace-dirty hidden></span></div>
        <button type="button" data-workspace-next onclick="TeamBullsTrainerDietWorkspace.next()" aria-label="Próxima refeição">→</button>
        <button type="button" class="tb-workspace-save" onclick="TeamBullsTrainerDietWorkspace.save()">SALVAR</button>
        <button type="button" class="accent tb-workspace-new" onclick="TeamBullsTrainerDietWorkspace.newMeal()">+ NOVA REFEIÇÃO</button>
      </nav>
      <div class="tb-workspace-editor-body" data-workspace-editor-body></div>
    </section>
    <aside class="tb-workspace-side">
      <div class="tb-workspace-side-head" id="tb-trainer-diet-workspace-summary"></div>
      <div class="tb-workspace-foods" data-workspace-foods></div>
    </aside>
  </div>`;}

  function ensureStructure(){
    const modal=document.getElementById('modal-meal'),sheet=modal?.querySelector(':scope>.modal-sheet');if(!modal||!sheet||!editable())return null;
    ensureStyles();modal.classList.add('tb-trainer-diet-workspace');
    let root=document.getElementById('tb-trainer-diet-workspace');
    if(!root){
      const original=[...sheet.children];sheet.insertAdjacentHTML('beforeend',workspaceMarkup());root=document.getElementById('tb-trainer-diet-workspace');
      const body=root.querySelector('[data-workspace-editor-body]');original.forEach(node=>body.appendChild(node));
    }
    bindInputs();return root;
  }
  function syncSidebar(){
    const root=ensureStructure();if(!root)return;
    const foods=root.querySelector('[data-workspace-foods]'),tool=document.getElementById('tb-meal-portion-tool');
    if(tool&&foods&&tool.parentElement!==foods)foods.appendChild(tool);
    const body=document.getElementById('tb-meal-portion-body');if(body)body.hidden=false;
    if(tool){const toggle=tool.querySelector('.tb-portion-toggle');if(toggle)toggle.textContent='TABELA ABERTA';}
    if(body&&(body.dataset.tbWorkspaceObserved!=='1'||!customObserver)){
      body.dataset.tbWorkspaceObserved='1';customObserver?.disconnect?.();customObserver=new MutationObserver(()=>refreshSummary());customObserver.observe(body,{childList:true,subtree:true,characterData:true});
    }
  }
  function relabelLegacySave(){
    const root=document.getElementById('tb-trainer-diet-workspace');if(!root)return;
    const button=root.querySelector('.tb-workspace-editor-body>.btn-primary[onclick="saveMeal()"]');if(button){button.textContent='SALVAR E FECHAR';button.title='Salva a refeição atual e fecha o planejamento';}
  }
  function bindSwipe(){
    const root=document.getElementById('tb-trainer-diet-workspace'),editor=root?.querySelector('.tb-workspace-editor');if(!editor||editor.dataset.tbSwipeBound==='1')return;
    editor.dataset.tbSwipeBound='1';
    editor.addEventListener('touchstart',event=>{const target=event.target;if(target?.closest?.('input,textarea,select,button,.tb-portion-tool,.tb-custom-foods')){touchStart=null;return;}const point=event.touches?.[0];if(point)touchStart={x:point.clientX,y:point.clientY};},{passive:true});
    editor.addEventListener('touchend',event=>{if(!touchStart)return;const point=event.changedTouches?.[0];if(!point){touchStart=null;return;}const dx=point.clientX-touchStart.x,dy=point.clientY-touchStart.y;touchStart=null;if(Math.abs(dx)<65||Math.abs(dx)<Math.abs(dy)*1.35)return;dx<0?navigate(1):navigate(-1);},{passive:true});
  }
  function activate(){
    if(!editable())return;
    ensureStructure();syncSidebar();relabelLegacySave();bindSwipe();refreshSummary();
    [50,180,600,1400].forEach(delay=>setTimeout(()=>{if(!editable())return;syncSidebar();relabelLegacySave();refreshSummary();},delay));
  }

  function installHooks(){
    if(typeof closeModal==='function'&&!closeModal.__tbDietWorkspaceContext){const base=closeModal;const wrapped=function(id){if(id==='modal-meal'){editorRevision++;customObserver?.disconnect?.();customObserver=null;}return base.apply(this,arguments);};wrapped.__tbDietWorkspaceContext=true;closeModal=wrapped;}
    if(typeof openAddMealModal==='function'&&!openAddMealModal.__tbTrainerDietWorkspace){const base=openAddMealModal;const wrapped=function(){const revision=++editorRevision,result=base.apply(this,arguments);syncSnapshot();requestAnimationFrame(()=>{if(editorRevision===revision)activate();});return result;};wrapped.__tbTrainerDietWorkspace=true;openAddMealModal=wrapped;}
    if(typeof openEditMealModal==='function'&&!openEditMealModal.__tbTrainerDietWorkspace){const base=openEditMealModal;const wrapped=function(){const revision=++editorRevision,result=base.apply(this,arguments);syncSnapshot();requestAnimationFrame(()=>{if(editorRevision===revision)activate();});return result;};wrapped.__tbTrainerDietWorkspace=true;openEditMealModal=wrapped;}
    if(typeof confirmLogout==='function'&&!confirmLogout.__tbTrainerDietWorkspace){const base=confirmLogout;const wrapped=function(){customObserver?.disconnect?.();customObserver=null;document.getElementById('modal-meal')?.classList.remove('tb-trainer-diet-workspace');return base.apply(this,arguments);};wrapped.__tbTrainerDietWorkspace=true;confirmLogout=wrapped;}
  }

  window.TeamBullsTrainerDietWorkspace=Object.freeze({
    version:VERSION,
    prev:()=>navigate(-1),next:()=>navigate(1),newMeal,
    save:()=>persistCurrent({notify:true}),refresh:()=>{syncSidebar();refreshSummary();},activate
  });
  installHooks();
})();
