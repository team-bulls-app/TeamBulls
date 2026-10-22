/* Team Bulls — escolhas recorrentes por porção, sem alterar a prescrição. */
'use strict';
(()=>{
  if(window.TeamBullsStudentFoodChoices)return;
  const VERSION='10.10.64-foodchoices3',TYPE='food_choice',PREFIX='team_bulls_food_choices_v1_';
  const drafts=new Map(),errors=new Map(),inflight=new Map(),remote=new Map(),volatile=new Set(),expandedRows=new Set();
  let loaded='',loading=null,epoch=0;
  const clean=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=value=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(value);
  const groups={carbo:'carb',carboidrato:'carb',carboidratos:'carb',proteina:'prot',proteinas:'prot',gordura:'gord',gorduras:'gord',fruta:'fruit',frutas:'fruit'};
  function parse(text){
    const match=/^(\d+(?:[.,]\d+)?)\s+por(?:cao|coes)\s+(?:de\s+)?(carbo|carboidratos?|proteinas?|gorduras?|frutas?)$/.exec(clean(text));
    if(!match)return null;
    const count=Number(match[1].replace(',','.'));
    return Number.isFinite(count)&&count>0&&count<=100?{group:groups[match[2]],count}:null;
  }
  function rows(meal){
    const occurrences=new Map();
    return String(meal.items||'').split('\n').map(text=>text.trim()).filter(Boolean).map(text=>{
      const portion=parse(text);if(!portion)return{text};
      const identity=portion.group+'_'+portion.count,occurrence=occurrences.get(identity)||0;
      occurrences.set(identity,occurrence+1);
      return{text,...portion,lineKey:identity+'_'+occurrence};
    });
  }
  function scale(amount,count){
    if(!Number.isFinite(count)||count<=0)return null;
    const match=/^(\d+(?:[.,]\d+)?)\s*(g|ml|fatias?|unidades?|(?:colher|colheres) de sopa)(?:\s*\((\d+(?:[.,]\d+)?)\s*(unidades?)\))?$/i.exec(String(amount||'').trim());
    if(!match)return null;
    const primary=Number(match[1].replace(',','.'))*count;if(!Number.isFinite(primary)||primary<=0)return null;
    const unit=clean(match[2]);
    const label=(value,kind)=>kind==='g'||kind==='ml'?kind:kind.startsWith('fatia')?(value<=1?'fatia':'fatias'):kind.startsWith('unidade')?(value<=1?'unidade':'unidades'):(value<=1?'colher de sopa':'colheres de sopa');
    let result=number(primary)+' '+label(primary,unit);
    if(match[3]){const secondary=Number(match[3].replace(',','.'))*count;result+=' ('+number(secondary)+' '+label(secondary,'unidade')+')';}
    return result;
  }
  function foods(row){
    try{return (FOOD_OPTIONS.categories||[]).filter(category=>row.group==='fruit'?['fruta1','fruta2'].includes(category.id):category.id===row.group).flatMap(category=>(category.items||[]).map(item=>({...item,quantity:scale(item.amount,row.count)}))).filter(item=>item.id&&item.quantity);}catch(error){return[];}
  }
  function context(){
    try{
      const user=CURRENT_USER,plan=currentDiet(),variant=currentDietVariant();
      if(!user?.uid||user.role!=='student'||DIET_CONTEXT.trainer||MEAL_CTX.listId!=='diet-meals-list'||!MEAL_CTX.canToggleDone||!plan||!variant)return null;
      if((DIET_CONTEXT.targetUid&&DIET_CONTEXT.targetUid!==user.uid)||(MEAL_CTX.targetUid&&MEAL_CTX.targetUid!==user.uid))return null;
      return{studentUid:String(user.uid),dietId:String(plan.id),variantId:String(variant.id)};
    }catch(error){return null;}
  }
  const scopeKey=ctx=>JSON.stringify([ctx.studentUid,ctx.dietId]);
  const entryKey=ctx=>JSON.stringify([ctx.studentUid,ctx.dietId,ctx.variantId,ctx.mealId,ctx.lineKey]);
  function read(uid){
    try{const value=JSON.parse(localStorage.getItem(PREFIX+uid)||'null');return value?.version===1&&value.records&&typeof value.records==='object'&&!Array.isArray(value.records)?value.records:{};}catch(error){return{};}
  }
  function store(uid,key,entry,expected){
    const records=read(uid);if(expected&&records[key]?.mutationId!==expected)return false;
    records[key]=entry;
    try{localStorage.setItem(PREFIX+uid,JSON.stringify({version:1,records}));volatile.delete(key);}catch(error){volatile.add(key);throw error;}
    return true;
  }
  function valid(entry,ctx){
    return !!entry&&['studentUid','dietId','variantId','mealId','lineKey'].every(field=>typeof ctx[field]==='string'&&ctx[field].length>0&&entry[field]===ctx[field])&&entry.recordType===TYPE&&typeof entry.foodId==='string'&&entry.foodId.length>0&&entry.foodId.length<=200;
  }
  function recordsFor(uid){const records=read(uid);for(const [key,entry] of remote){if(entry.studentUid===uid&&(!records[key]||(volatile.has(key)&&!records[key].pending)))records[key]=entry;}return records;}
  function live(ctx){
    const own=context();if(!own||own.studentUid!==ctx.studentUid||own.dietId!==ctx.dietId)return null;
    const plan=currentDiet(),variant=plan.variants.find(item=>String(item.id)===ctx.variantId),meal=variant?.meals?.find(item=>String(item.id)===ctx.mealId);
    return meal?rows(meal).find(row=>row.lineKey===ctx.lineKey):null;
  }
  function canCloud(uid){
    try{return navigator.onLine!==false&&MODE==='cloud'&&!!db&&auth?.currentUser?.uid===uid&&CURRENT_USER?.uid===uid&&CURRENT_USER?.role==='student';}catch(error){return false;}
  }
  const notify=(message,error=false)=>{if(typeof showToast==='function')showToast(message,error);};
  function paint(){if(context()&&typeof renderMealsList==='function')renderMealsList();}
  function items(meal){
    const own=context();if(!own)return null;
    const records=recordsFor(own.studentUid),ready=loaded===scopeKey(own);
    return rows(meal).map(row=>{
      if(!row.lineKey)return '<li>'+escape(row.text)+'</li>';
      const ctx={...own,mealId:String(meal.id),lineKey:row.lineKey},key=entryKey(ctx),entry=records[key];
      const available=foods(row),saved=valid(entry,ctx)?available.find(food=>food.id===entry.foodId):null;
      const selected=drafts.has(key)?drafts.get(key):(saved?.id||''),food=available.find(item=>item.id===selected);
      const busy=inflight.has(key),pending=!!(saved&&entry.pending);
      const status=errors.get(key)||(busy?'Sincronizando…':pending?'Guardado neste aparelho. Sincronização pendente.':saved?'Escolha guardada para todos os dias.':ready?'Escolha um alimento da tabela.':'Carregando tabela e escolhas…');
      const disabled=!ready||!food||busy||(saved?.id===selected&&!pending);
      const detailOpen=expandedRows.has(key)?' open':'';
      const summaryName=food?food.name:ready?'Escolher alimento':'Carregando opções…';
      const summaryAmount=food?food.quantity:number(row.count)+' '+(row.count===1?'porção':'porções');
      const summary='<summary class="tb-food-choice-summary"><span class="tb-food-summary-copy"><small>'+escape(row.text)+'</small><strong>'+escape(summaryName)+'</strong></span><span class="tb-food-summary-value"><span>'+escape(summaryAmount)+'</span><span class="tb-food-chevron" aria-hidden="true">⌄</span></span></summary>';
      const select='<select data-tb-food-select aria-label="Alimento para '+escape(row.text)+'" '+(!ready||(!saved&&!available.length)?'disabled':'')+'><option value="">Selecione um alimento</option>'+available.map(item=>'<option value="'+escape(item.id)+'" '+(item.id===selected?'selected':'')+'>'+escape(item.name)+'</option>').join('')+'</select>';
      if(saved){
        const notice=errors.get(key)||(busy?'Salvo no aparelho · Sincronizando…':pending?'Salvo no aparelho · Sincronização pendente.':'');
        const actions=drafts.has(key)?'<div class="tb-food-actions"><button type="button" class="tb-food-small-btn" data-tb-food-save '+(disabled?'disabled':'')+'>Guardar</button><button type="button" class="tb-food-small-btn" data-tb-food-cancel>Cancelar</button></div>':pending&&!busy?'<div class="tb-food-actions"><button type="button" class="tb-food-small-btn" data-tb-food-save '+(!ready?'disabled':'')+'>Sincronizar</button></div>':'';
        return '<li class="tb-food-choice tb-food-choice-compact tb-food-choice-accordion" data-tb-food-compact="1" data-tb-food-row="'+escape(key)+'"><details data-tb-food-details="1"'+detailOpen+'>'+summary+'<div class="tb-food-editor"><label><span>Seu alimento</span>'+select+'</label><div class="tb-food-quantity" data-tb-food-quantity>'+escape(food?food.quantity:'—')+'</div>'+actions+(notice?'<small role="status" data-tb-food-status>'+escape(notice)+'</small>':'')+'</div></details></li>';
      }
      return '<li class="tb-food-choice tb-food-choice-accordion" data-tb-food-row="'+escape(key)+'"><details data-tb-food-details="1"'+detailOpen+'>'+summary+'<div class="tb-food-editor"><label><span>Seu alimento</span>'+select+'</label><div class="tb-food-quantity" data-tb-food-quantity>'+escape(food?food.quantity:'—')+'</div><small>Quantidade para '+number(row.count)+' '+(row.count===1?'porção':'porções')+' da sua prescrição.</small><button type="button" class="tb-food-save" data-tb-food-save '+(disabled?'disabled':'')+'>'+ (busy?'Sincronizando…':pending&&saved?.id===selected?'Tentar sincronizar':'Guardar escolha')+'</button><small role="status" data-tb-food-status>'+escape(!available.length&&ready?'Nenhuma quantidade calculável nesta categoria. Consulte a tabela e seu treinador.':status)+'</small></div></details></li>';
    }).join('');
  }
  async function docId(ctx){
    const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(entryKey(ctx)));
    return 'food_choice_'+Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
  }
  async function commit(entry){
    const id=await docId(entry);if(!canCloud(entry.studentUid))throw new Error('Sua conexão segura ainda não está pronta.');
    await window.TeamBullsForegroundWriteResilience?.awaitReady?.();
    if(!canCloud(entry.studentUid))throw new Error('Sua conta mudou. Reabra a dieta.');
    const ref=db.collection('mealCompletions').doc(id);
    const payload={recordType:TYPE,studentUid:entry.studentUid,mealId:entry.mealId,date:entry.date,dietId:entry.dietId,variantId:entry.variantId,lineKey:entry.lineKey,foodId:entry.foodId,mutationId:entry.mutationId,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
    try{await ref.set(payload,{merge:true});return entry.date;}
    catch(error){
      // Rules 28 preserva date/mealId. Uma escolha criada noutro dia exige
      // reconciliar o registro existente, jamais sobrescrever esses campos.
      if(!String(error?.code||'').includes('permission-denied')||!canCloud(entry.studentUid))throw error;
      const snapshot=await ref.get({source:'server'}),existing=snapshot.exists?snapshot.data():null;
      if(!valid(existing,entry)||!canCloud(entry.studentUid))throw error;
      await ref.update({foodId:entry.foodId,mutationId:entry.mutationId,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
      return existing.date;
    }
  }
  function sync(entry){
    const key=entryKey(entry);if(inflight.has(key))return inflight.get(key);
    if(!canCloud(entry.studentUid)||!live(entry))return Promise.resolve(false);
    const row=live(entry);if(!foods(row).some(food=>food.id===entry.foodId))return Promise.resolve(false);
    const promise=commit(entry).then(date=>{
      const confirmed={...entry,date,pending:false};remote.set(key,confirmed);
      try{store(entry.studentUid,key,confirmed,entry.mutationId);errors.delete(key);}catch(error){errors.set(key,'Salvo na conta. Não foi possível atualizar o cache deste aparelho.');}
      return true;
    },error=>{
      if(context()?.studentUid===entry.studentUid)errors.set(key,'Escolha guardada neste aparelho. Não foi possível sincronizar. Tente novamente.');
      console.warn('[Team Bulls] Escolha de alimento pendente.',error?.code||error?.message);return false;
    }).finally(()=>{
      if(inflight.get(key)===promise)inflight.delete(key);
      if(context()?.studentUid===entry.studentUid)paint();
    });
    inflight.set(key,promise);paint();return promise;
  }
  async function save(ctx,foodId){
    const row=live(ctx),key=entryKey(ctx);if(!row||!foods(row).some(food=>food.id===foodId))throw new Error('Escolha um alimento válido desta categoria.');
    if(inflight.has(key)){notify('Esta escolha ainda está sincronizando.');return false;}
    const current=recordsFor(ctx.studentUid)[key];
    // Guardar antes de iniciar a rede permite fechar o app sem perder a escolha.
    const entry={...ctx,recordType:TYPE,foodId,date:valid(current,ctx)&&/^\d{4}-\d{2}-\d{2}$/.test(current.date)?current.date:today(),mutationId:uid(),pending:true};
    try{store(ctx.studentUid,key,entry);}catch(error){throw new Error('Não foi possível guardar neste aparelho. Libere espaço e tente novamente.');}
    drafts.delete(key);errors.delete(key);paint();
    if(!canCloud(ctx.studentUid)){notify('Escolha guardada neste aparelho. Será sincronizada ao abrir a dieta com conexão.');return true;}
    const task=sync(entry);paint();
    // Um timeout libera o botão sem abandonar o write original nem repeti-lo.
    let timer;const result=await Promise.race([task,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),10000);})]);clearTimeout(timer);
    if(context()?.studentUid===ctx.studentUid)notify(result===true?'✓ Escolha salva para todos os dias.':result===null?'Escolha guardada. A confirmação da conta está pendente.':'Escolha guardada neste aparelho. Tente sincronizar novamente.',result===false);
    return true;
  }
  async function refresh(force=false){
    const own=context();if(!own)return false;
    const key=scopeKey(own);if(loading?.key===key)return loading.promise;if(!force&&loaded===key)return true;
    const token=++epoch;
    const promise=(async()=>{
      await loadFoodOptions();
      if(canCloud(own.studentUid)){
        try{
          const query=db.collection('mealCompletions').where('studentUid','==',own.studentUid).where('recordType','==',TYPE).where('dietId','==',own.dietId);
          const baseline=read(own.studentUid);
          const snapshot=await cloudGet({get:()=>query.get({source:'server'})},'escolhas de alimentos');
          for(const doc of snapshot.docs){
            const entry=doc.data();if(!valid(entry,entry)||entry.studentUid!==own.studentUid||entry.dietId!==own.dietId||!live(entry))continue;
            const recordKey=entryKey(entry),local=read(own.studentUid)[recordKey];
            if(local?.pending||local?.mutationId!==baseline[recordKey]?.mutationId)continue;
            const cached={recordType:TYPE,studentUid:entry.studentUid,dietId:entry.dietId,variantId:entry.variantId,mealId:entry.mealId,lineKey:entry.lineKey,foodId:entry.foodId,date:entry.date,mutationId:entry.mutationId,pending:false};remote.set(recordKey,cached);
            try{store(own.studentUid,recordKey,cached);}catch(error){console.warn('[Team Bulls] Cache de escolhas indisponível.');}
          }
        }catch(error){console.warn('[Team Bulls] Usando escolhas guardadas no aparelho.',error?.code||error?.message);}
      }
      if(token!==epoch||scopeKey(context()||{})!==key)return false;
      loaded=key;paint();flush().catch(()=>{});return true;
    })().finally(()=>{if(loading?.promise===promise)loading=null;});
    loading={key,promise};return promise;
  }
  async function flush(){
    const own=context();if(!own||!canCloud(own.studentUid))return false;
    const entries=Object.values(read(own.studentUid)).filter(entry=>entry?.pending&&entry.studentUid===own.studentUid&&entry.dietId===own.dietId&&valid(entry,entry)&&live(entry));
    // Somente eventos explícitos (abrir, reconectar ou botão) iniciam tentativas.
    await Promise.all(entries.map(entry=>sync(entry)));
    return true;
  }
  function rowContext(node){
    const own=context();if(!own)return null;
    try{const [studentUid,dietId,variantId,mealId,lineKey]=JSON.parse(node.dataset.tbFoodRow);return studentUid===own.studentUid&&dietId===own.dietId&&variantId===own.variantId?{studentUid,dietId,variantId,mealId,lineKey}:null;}catch(error){return null;}
  }
  function install(){
    if(typeof renderMealsList!=='function'||renderMealsList.__tbFoodChoices)return;
    const base=renderMealsList;
    renderMealsList=function(...args){const result=base.apply(this,args);if(context())refresh().catch(()=>{});return result;};
    renderMealsList.__tbFoodChoices=true;
    const open=openDietDetail;
    openDietDetail=async function(...args){loaded='';const result=await open.apply(this,args);if(context())await refresh();return result;};
    const style=document.createElement('style');style.id='tb-food-choices-style';style.textContent='.meal-card-items .tb-food-choice{list-style:none;margin:10px 0;padding:12px;border:1px solid var(--border,#333);border-radius:10px;display:grid;gap:8px}.tb-food-choice label{display:grid;gap:5px}.tb-food-choice select{width:100%;min-height:44px;background:var(--bg,#161616);color:var(--text,#eee);border:1px solid var(--border,#555);border-radius:8px;padding:8px;font-size:16px}.tb-food-quantity{font-weight:700;font-size:20px;color:var(--accent,#d4af37)}.tb-food-choice small{font-size:12px;line-height:1.5}.tb-food-save{min-height:44px;border-radius:8px;background:var(--accent,#d4af37);color:#111;font-weight:700;border:0;padding:10px}.tb-food-save:disabled{opacity:.5;cursor:default}';document.head.appendChild(style);
    style.textContent+='.meal-card-items .tb-food-choice-compact{margin:6px 0;padding:8px 10px;gap:4px}.tb-food-summary-line{display:flex;align-items:center;gap:4px 10px;flex-wrap:wrap;min-width:0}.tb-food-choice-compact .tb-food-prescription{display:block;font-size:11px;color:var(--text-dim,#888)}.tb-food-choice-compact select{flex:1;width:auto;min-width:100px;max-width:100%}.tb-food-choice-compact .tb-food-quantity{font-size:15px;line-height:1.35;white-space:nowrap}.tb-food-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.tb-food-small-btn{min-height:44px;padding:6px 10px;background:transparent;border:1px solid var(--border,#555);border-radius:8px;color:var(--text,#eee);font:inherit;font-size:12px;cursor:pointer}.tb-food-small-btn:disabled{opacity:.5;cursor:default}.tb-food-small-btn:focus-visible{outline:2px solid var(--accent,#e11d48);outline-offset:2px}';
    style.textContent+=`\n      .meal-card-items .tb-food-choice-accordion{display:block!important;margin:6px 0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;gap:0!important}
      .tb-food-choice-accordion details{overflow:hidden;border:1px solid var(--border,#38312d);border-radius:10px;background:var(--card,#191715)}
      .tb-food-choice-accordion summary{display:flex;min-height:58px;align-items:center;justify-content:space-between;gap:10px;padding:9px 11px;list-style:none;cursor:pointer}
      .tb-food-choice-accordion summary::marker{content:""}
      .tb-food-choice-accordion summary::-webkit-details-marker{display:none}
      .tb-food-choice-accordion details[open]>summary{background:var(--surface,#151311);border-bottom:1px solid var(--border,#38312d)}
      .tb-food-summary-copy{display:grid;min-width:0;gap:3px}
      .tb-food-summary-copy>small{overflow:hidden;color:var(--text-dim,#999);font-size:11px;line-height:1.25;text-overflow:ellipsis;white-space:nowrap}
      .tb-food-summary-copy>strong{overflow:hidden;color:var(--text,#f1eee9);font-size:14px;line-height:1.2;text-overflow:ellipsis;white-space:nowrap}
      .tb-food-summary-value{display:flex;max-width:46%;flex:0 1 auto;align-items:center;gap:7px;color:var(--accent,#d54a50);font-size:12px;font-weight:700;line-height:1.3;text-align:right;overflow-wrap:anywhere}
      .tb-food-chevron{display:inline-block;flex:0 0 auto;color:var(--text-muted,#aaa);font-size:16px;transition:transform .15s ease}
      .tb-food-choice-accordion details[open] .tb-food-chevron{transform:rotate(180deg)}
      .tb-food-choice-accordion .tb-food-editor{display:grid;gap:8px;padding:10px 11px 12px}
      .tb-food-choice-accordion .tb-food-editor>label{display:grid;gap:5px;color:var(--text-dim,#999);font-size:12px}
      .tb-food-choice-accordion .tb-food-editor select{width:100%;min-height:44px;background:var(--bg,#111);color:var(--text,#f1eee9);border:1px solid var(--border,#555);border-radius:8px;padding:8px 10px;font-size:16px}
      .tb-food-choice-accordion .tb-food-quantity{color:var(--accent,#d54a50);font-size:16px;line-height:1.3}
      .tb-food-choice-accordion .tb-food-editor>small{color:var(--text-dim,#999);font-size:12px;line-height:1.45}
      .tb-food-choice-accordion .tb-food-editor [role="status"]{color:var(--text-muted,#aaa)}
      .tb-food-choice-accordion .tb-food-save{width:100%;min-height:44px}
      .tb-food-choice-accordion .tb-food-actions{justify-content:flex-end}
      @media(max-width:380px){.tb-food-choice-accordion summary{gap:7px;padding-inline:9px}.tb-food-summary-value{max-width:48%;font-size:11px}}
    `;
    document.addEventListener('change',event=>{
      const select=event.target.closest?.('[data-tb-food-select]'),node=select?.closest('[data-tb-food-row]'),ctx=node&&rowContext(node);if(!ctx)return;
      const row=live(ctx),key=entryKey(ctx),food=row&&foods(row).find(item=>item.id===select.value);drafts.set(key,select.value);errors.delete(key);
      if(node.dataset.tbFoodCompact==='1'){
        paint();
        Array.from(document.querySelectorAll?.('[data-tb-food-row]')||[]).find(item=>item.dataset.tbFoodRow===key)?.querySelector('[data-tb-food-select]')?.focus();return;
      }
      node.querySelector('[data-tb-food-quantity]').textContent=food?.quantity||'—';
      const entry=read(ctx.studentUid)[key],button=node.querySelector('[data-tb-food-save]');button.disabled=!food||inflight.has(key)||(entry?.foodId===select.value&&!entry.pending);button.textContent=entry?.pending&&entry.foodId===select.value?'Tentar sincronizar':'Guardar escolha';
      node.querySelector('[data-tb-food-status]').textContent=food?'Toque em Guardar escolha para usar este alimento todos os dias.':'Escolha um alimento da tabela.';
    });
    document.addEventListener('click',event=>{
      const action=event.target.closest?.('[data-tb-food-cancel]');
      if(action){
        if(action.disabled)return;
        const node=action.closest('[data-tb-food-row]'),ctx=node&&rowContext(node);if(!ctx)return;
        const key=entryKey(ctx);event.preventDefault();
        drafts.delete(key);errors.delete(key);
        paint();
        const row=Array.from(document.querySelectorAll?.('[data-tb-food-row]')||[]).find(item=>item.dataset.tbFoodRow===key);
        row?.querySelector('[data-tb-food-select]')?.focus();return;
      }
      const button=event.target.closest?.('[data-tb-food-save]');if(!button||button.disabled)return;
      const node=button.closest('[data-tb-food-row]'),ctx=node&&rowContext(node);if(!ctx)return;
      event.preventDefault();save(ctx,node.querySelector('[data-tb-food-select]').value).catch(error=>{errors.set(entryKey(ctx),error.message);paint();notify(error.message,true);});
    });
    document.addEventListener('toggle',event=>{
      const details=event.target.closest?.('details[data-tb-food-details]');if(!details)return;
      const node=details.closest('[data-tb-food-row]'),key=node?.dataset.tbFoodRow;if(!key)return;
      if(details.open)expandedRows.add(key);else expandedRows.delete(key);
    },true);
    window.addEventListener('online',()=>{if(context())refresh(true).catch(()=>{});});
    window.addEventListener('storage',event=>{if(event.key===PREFIX+context()?.studentUid)paint();});
    paint();
  }
  window.TeamBullsStudentFoodChoices=Object.freeze({version:VERSION,parse,rows,scale,foods,items,save,refresh,flush});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('team-bulls-runtime-ready',install);
})();
