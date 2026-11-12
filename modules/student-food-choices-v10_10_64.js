/* Team Bulls — escolhas recorrentes por porção, sem alterar a prescrição. */
'use strict';
(()=>{
  if(window.TeamBullsStudentFoodChoices)return;
  const VERSION='10.10.64-foodchoices8',TYPE='food_choice',PREFIX='team_bulls_food_choices_v1_',DIAGNOSTICS_PREFIX='team_bulls_food_choices_diag_v1_';
  const drafts=new Map(),errors=new Map(),inflight=new Map(),remote=new Map(),volatile=new Set(),expandedRows=new Set(),diagnosticCache=new Map();
  let loaded='',loading=null,epoch=0;
  const FOOD_SYNC_ERROR_CATEGORIES=new Set(['network','permission','storage','conflict','other']);
  const emptyFoodDiagnostics=()=>({version:1,failures:Object.create(null)});
  function foodDiagnosticId(value){
    const text=String(value||'');let first=2166136261,second=2246822519;
    for(let i=0;i<text.length;i++){const code=text.charCodeAt(i);first=Math.imul(first^code,16777619);second=Math.imul(second^code,3266489917);}
    return(first>>>0).toString(16).padStart(8,'0')+(second>>>0).toString(16).padStart(8,'0');
  }
  function readFoodDiagnostics(uidValue){
    const uid=String(uidValue||'');if(!uid)return emptyFoodDiagnostics();
    if(diagnosticCache.has(uid))return diagnosticCache.get(uid);
    let state=emptyFoodDiagnostics();
    try{
      const parsed=JSON.parse(localStorage.getItem(DIAGNOSTICS_PREFIX+encodeURIComponent(uid))||'null');
      if(parsed?.version===1&&parsed.failures&&typeof parsed.failures==='object'&&!Array.isArray(parsed.failures)){
        const failures=Object.create(null);
        Object.entries(parsed.failures).slice(-400).forEach(([key,item])=>{
          if(/^[a-f0-9]{16}$/i.test(key)&&FOOD_SYNC_ERROR_CATEGORIES.has(item?.category)&&Number.isFinite(Number(item?.at)))failures[key]={category:item.category,at:Math.max(0,Math.min(8640000000000000,Math.trunc(Number(item.at))))};
        });
        state={version:1,failures};
      }
    }catch(error){}
    diagnosticCache.set(uid,state);return state;
  }
  function writeFoodDiagnostics(uidValue,state){
    const uid=String(uidValue||'');if(!uid)return;
    diagnosticCache.set(uid,state);
    try{localStorage.setItem(DIAGNOSTICS_PREFIX+encodeURIComponent(uid),JSON.stringify(state));}catch(error){}
  }
  function foodSyncErrorCategory(error){
    const code=String(error?.code||'').toLowerCase(),message=String(error?.message||'').toLowerCase();
    if(code.includes('permission-denied')||code.includes('unauthenticated'))return'permission';
    if(code.includes('quota')||code.includes('storage')||message.includes('armazenamento'))return'storage';
    if(code.includes('conflict'))return'conflict';
    if(code.includes('timeout')||code.includes('unavailable')||code.includes('network')||code.includes('deadline-exceeded')||message.includes('offline'))return'network';
    return'other';
  }
  function markFoodFailure(uidValue,key,error){
    const uid=String(uidValue||''),identity=String(key||'');if(!uid||!identity||identity.length>1200)return;
    const state=readFoodDiagnostics(uid);state.failures[foodDiagnosticId(identity)]={category:foodSyncErrorCategory(error),at:Date.now()};
    const ids=Object.keys(state.failures);if(ids.length>400){ids.sort((a,b)=>Number(state.failures[a]?.at||0)-Number(state.failures[b]?.at||0));ids.slice(0,ids.length-400).forEach(id=>delete state.failures[id]);}
    writeFoodDiagnostics(uid,state);
  }
  function clearFoodFailure(uidValue,key){
    const uid=String(uidValue||''),identity=String(key||'');if(!uid||!identity||identity.length>1200)return;
    const state=readFoodDiagnostics(uid),id=foodDiagnosticId(identity);
    if(!Object.prototype.hasOwnProperty.call(state.failures,id))return;
    delete state.failures[id];writeFoodDiagnostics(uid,state);
  }
  const clean=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number=value=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(value);
  const groups={carbo:'carb',carboidrato:'carb',carboidratos:'carb',proteina:'prot',proteinas:'prot',gordura:'gord',gorduras:'gord',fruta:'fruit',frutas:'fruit'};
  const groupLabels={carb:'carboidrato',prot:'proteína',gord:'gordura',fruit:'fruta'};
  const MIXED_LINE='misc';
  const portionUnits=value=>Math.round(Number(value)*1000);
  function mixedEquivalences(note){
    const text=clean(note).replace(/[¼½¾]/g,char=>({'¼':'0,25','½':'0,5','¾':'0,75'}[char]))
      .replace(/^(?:subtrair|subtrai|descontar|equivale a|equivalente a|corresponde a|substitui)\s+/,'')
      .replace(/\s+(?:daquela|dessa|desta|da) refeicao[.!]?$/,'').replace(/[.!]$/,'').trim();
    const macros={};
    for(const term of text.split(/\s+(?:e)\s+|\s*[+;]|,\s+(?=\d|\.)/)){
      const match=/^(\d+(?:[.,]\d+)?(?:\/\d+)?|[.,]\d+)\s+por(?:cao|coes)\s+(?:de\s+)?(carbo|carboidratos?|proteinas?|gorduras?|frutas?)$/.exec(term.trim());
      if(!match)return null;
      const [numerator,denominator='1']=match[1].replace(',','.').split('/');
      const count=portionUnits(Number(numerator)/Number(denominator)),group=groups[match[2]];
      if(!Number.isFinite(count)||count<=0||count>100000||Object.hasOwn(macros,group))return null;
      macros[group]=count;
    }
    return macros;
  }
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
    if(row.mixed){
      return row.available??(FOOD_OPTIONS?.misc||[]).flatMap(item=>{
        const macros=mixedEquivalences(item?.note);
        if(!macros||typeof item.id!=='string'||!item.id||item.id.length>200)return[];
        const amount=/[—–-]\s*(\d+(?:[.,]\d+)?\s*(?:g|ml))\b/i.exec(String(item.name||''))?.[1];
        return[{...item,macros,amount}];
      });
    }
    try{return (FOOD_OPTIONS.categories||[]).filter(category=>row.group==='fruit'?['fruta1','fruta2'].includes(category.id):category.id===row.group).flatMap(category=>(category.items||[]).map(item=>({...item,quantity:scale(item.amount,row.count)}))).filter(item=>item.id&&item.quantity);}catch(error){return[];}
  }
  function mixedRow(mealRows){
    const totals={};
    for(const row of mealRows){if(row.lineKey)totals[row.group]=(totals[row.group]||0)+portionUnits(row.count);}
    return{text:'Alimentos diversos',lineKey:MIXED_LINE,mixed:true,count:100,totals};
  }
  function mixedUsed(items,available){
    const used={};
    for(const item of items){
      const food=available.find(option=>option.id===item.foodId),units=portionUnits(item.portions);
      if(!food||!Number.isFinite(units)||units<=0)continue;
      for(const [group,amount] of Object.entries(food.macros))used[group]=(used[group]||0)+amount*units;
    }
    return used;
  }
  function mixedLimit(row,food,used){
    return Math.max(0,Math.min(100000,...Object.entries(food.macros).map(([group,count])=>Math.floor(((row.totals[group]||0)*1000-(used[group]||0))/count))))/1000;
  }
  function normalizedMixed(row,items,available){
    if(!Array.isArray(items)||items.length>8)return null;
    const result=[],seen=new Set();
    for(const item of items){
      const foodId=String(item?.foodId||''),portions=roundPortions(item?.portions);
      if(!foodId||seen.has(foodId)||portions<=0||portions>100||!available.some(food=>food.id===foodId))return null;
      seen.add(foodId);result.push({foodId,portions});
    }
    const used=mixedUsed(result,available);
    return Object.entries(used).every(([group,value])=>value<=(row.totals[group]||0)*1000)?result:null;
  }
  function mealRows(meal,ctx,records){
    const list=rows(meal),mixed=mixedRow(list),available=foods(mixed),mixedCtx={...ctx,lineKey:MIXED_LINE};
    mixed.available=available;
    const entry=records[entryKey(mixedCtx)],saved=savedAllocations(entry,mixedCtx,mixed,available);
    const used=mixedUsed(saved,available);
    const remaining=Object.fromEntries(Object.entries(used).map(([group,amount])=>[group,Math.ceil(amount/1000)]));
    const adjusted=list.map(row=>{
      const deduction=Math.min(portionUnits(row.count)||0,remaining[row.group]||0);
      if(!deduction)return row;
      remaining[row.group]-=deduction;
      return{...row,prescribedCount:row.count,count:(portionUnits(row.count)-deduction)/1000};
    });
    return available.length||entry?[...adjusted,mixed]:adjusted;
  }
  function resizeAllocations(items,count){
    if(count<=0||!items.length)return[];
    const total=items.reduce((sum,item)=>sum+portionUnits(item.portions),0),target=portionUnits(count);
    let cumulative=0,allocated=0;
    return items.flatMap(item=>{
      cumulative+=portionUnits(item.portions);
      const next=Math.round(target*cumulative/total),units=next-allocated;allocated=next;
      return units>0?[{...item,portions:units/1000}]:[];
    });
  }
  function foodQuantity(row,food,portions){
    return row.mixed?(scale(food.amount,portions)||number(portions)+' × porção da tabela'):scale(food.amount,portions);
  }
  function distributionLabel(row,values,available,complete){
    if(row.mixed){
      const used=mixedUsed(values,available);
      const summary=Object.entries(used).map(([group,amount])=>number(Math.ceil(amount/1000)/1000)+' de '+groupLabels[group]).join(' · ');
      return summary?'Desconto em porções: '+summary+(complete?'.':' · acima do disponível ou escolha incompleta.'):'Use as equivalências da tabela para descontar porções da refeição.';
    }
    const total=roundPortions(values.reduce((sum,item)=>sum+item.portions,0));
    return complete?'Distribuição completa: '+number(row.count)+' porções.':'Distribua '+number(row.count)+' porções. Total atual: '+number(total)+' porções.';
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
    const identity=!!entry&&['studentUid','dietId','variantId','mealId','lineKey'].every(field=>typeof ctx[field]==='string'&&ctx[field].length>0&&entry[field]===ctx[field])&&entry.recordType===TYPE;
    if(!identity)return false;
    const legacy=typeof entry.foodId==='string'&&entry.foodId.length>0&&entry.foodId.length<=200;
    const allocations=Array.isArray(entry.selections)&&entry.selections.length>0&&entry.selections.length<=8&&entry.selections.every(item=>item&&typeof item.foodId==='string'&&item.foodId.length>0&&item.foodId.length<=200&&Number.isFinite(Number(item.portions))&&Number(item.portions)>0&&Number(item.portions)<=100);
    if(ctx.lineKey===MIXED_LINE)return allocations||Array.isArray(entry.selections)&&entry.selections.length===0&&entry.foodId==='';
    return legacy||allocations;
  }
  const roundPortions=value=>Math.round((Number(value)||0)*1000)/1000;
  function normalizedAllocations(row,items,available,{allowBlank=false,requireTotal=true}={}){
    if(row.mixed)return normalizedMixed(row,items,available);
    if(!Array.isArray(items)||!items.length||items.length>8)return null;
    const seen=new Set(),result=[];let total=0;
    for(const item of items){
      const foodId=String(item?.foodId||''),portions=roundPortions(item?.portions);
      if(!Number.isFinite(portions)||portions<=0||portions>row.count)return null;
      if(!foodId){if(!allowBlank)return null;}
      else{
        if(seen.has(foodId)||!available.some(food=>food.id===foodId))return null;
        seen.add(foodId);
      }
      result.push({foodId,portions});total+=portions;
    }
    if(total>row.count+0.001)return null;
    if(requireTotal&&(result.some(item=>!item.foodId)||roundPortions(total)!==roundPortions(row.count)))return null;
    return result;
  }
  function savedAllocations(entry,ctx,row,available=foods(row)){
    if(!valid(entry,ctx))return[];
    let raw=Array.isArray(entry.selections)?entry.selections:null;
    const count=row.prescribedCount??row.count,original={...row,count};
    if(!row.mixed){
      if(raw?.length===1&&entry.foodId&&raw[0]?.foodId!==entry.foodId)raw=[{foodId:entry.foodId,portions:count}];
      if(!raw&&entry.foodId)raw=[{foodId:entry.foodId,portions:count}];
    }
    const normalized=normalizedAllocations(original,raw,available);
    if(!normalized)return[];
    const allocations=row.prescribedCount===undefined?normalized:resizeAllocations(normalized,row.count);
    return allocations.map(item=>{const food=available.find(option=>option.id===item.foodId);return{...item,food,quantity:foodQuantity(row,food,item.portions)};});
  }
  function selectionsMatch(left,right){
    return Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((item,index)=>item.foodId===right[index].foodId&&roundPortions(item.portions)===roundPortions(right[index].portions));
  }
  function draftFor(key,row,saved){
    const source=drafts.has(key)?drafts.get(key):saved.length?saved:[{foodId:'',portions:row.mixed?1:row.count}];
    return source.map(item=>({foodId:String(item.foodId||''),portions:roundPortions(item.portions)}));
  }
  function distributionComplete(row,allocations,available){
    return allocations.length>0&&!!normalizedAllocations(row,allocations,available);
  }
  function recordsFor(uid){const records=read(uid);for(const [key,entry] of remote){if(entry.studentUid===uid&&(!records[key]||(volatile.has(key)&&!records[key].pending)))records[key]=entry;}return records;}
  function live(ctx,{adjusted=false}={}){
    const own=context();if(!own||own.studentUid!==ctx.studentUid||own.dietId!==ctx.dietId)return null;
    const plan=currentDiet(),variant=plan.variants.find(item=>String(item.id)===ctx.variantId),meal=variant?.meals?.find(item=>String(item.id)===ctx.mealId);
    if(!meal)return null;
    if(adjusted)return mealRows(meal,ctx,recordsFor(ctx.studentUid)).find(row=>row.lineKey===ctx.lineKey);
    return ctx.lineKey===MIXED_LINE?mixedRow(rows(meal)):rows(meal).find(row=>row.lineKey===ctx.lineKey);
  }
  function canCloud(uid){
    try{return navigator.onLine!==false&&MODE==='cloud'&&!!db&&auth?.currentUser?.uid===uid&&CURRENT_USER?.uid===uid&&CURRENT_USER?.role==='student';}catch(error){return false;}
  }
  const notify=(message,error=false)=>{if(typeof showToast==='function')showToast(message,error);};
  function paint(){if(context()&&typeof renderMealsList==='function')renderMealsList();}
  function items(meal){
    const own=context();if(!own)return null;
    const records=recordsFor(own.studentUid),ready=loaded===scopeKey(own);
    const mealCtx={...own,mealId:String(meal.id)};
    return mealRows(meal,mealCtx,records).map(row=>{
      if(!row.lineKey)return '<li>'+escape(row.text)+'</li>';
      if(row.count===0)return '<li><small>'+escape(row.text)+' · coberta pelos alimentos diversos</small></li>';
      const ctx={...mealCtx,lineKey:row.lineKey},key=entryKey(ctx),entry=records[key],available=foods(row);
      const saved=savedAllocations(entry,ctx,row,available),draft=draftFor(key,row,saved),hasDraft=drafts.has(key);
      const busy=inflight.has(key),pending=!!(entry?.pending&&(row.mixed||saved.length)),complete=distributionComplete(row,draft,available);
      const changed=hasDraft&&!selectionsMatch(draft,saved),sameSaved=saved.length&&!changed;
      const displayAllocations=(changed?draft:saved).map(item=>{const food=available.find(option=>option.id===item.foodId);return food?{...item,food,quantity:foodQuantity(row,food,item.portions)}:null;}).filter(Boolean);
      const invalidMixed=row.mixed&&entry?.selections?.length&&!saved.length;
      const status=errors.get(key)||(busy?'Sincronizando…':pending?'Guardado neste aparelho. Sincronização pendente.':saved.length?'Escolha guardada para todos os dias.':ready?'Distribua as porções entre os alimentos.':'Carregando tabela e escolhas…');
      const summaryName=displayAllocations.length?displayAllocations.map(item=>item.food.name).join(' + '):ready?(row.mixed?'Escolher alimento da tabela':'Escolher alimento'):'Carregando opções…';
      const summaryAmount=displayAllocations.length?displayAllocations.map(item=>item.quantity).join(' + '):row.mixed?'':number(row.count)+' '+(row.count===1?'porção':'porções');
      const detailOpen=expandedRows.has(key)?' open':'';
      const rowLabel=row.prescribedCount===undefined?row.text:row.text+' · restam '+number(row.count);
      const summary='<summary class="tb-food-choice-summary"><span class="tb-food-summary-copy"><small>'+escape(rowLabel)+'</small><strong>'+escape(summaryName)+'</strong></span><span class="tb-food-summary-value"><span>'+escape(summaryAmount)+'</span><span class="tb-food-chevron" aria-hidden="true">⌄</span></span></summary>';
      const allocationMarkup=draft.map((item,index)=>{
        const selectedElsewhere=new Set(draft.filter((other,otherIndex)=>otherIndex!==index&&other.foodId).map(other=>other.foodId));
        const used=row.mixed?mixedUsed(draft.filter((_,position)=>position!==index),available):null;
        const options='<option value="">Selecione um alimento</option>'+available.map(food=>{
          const selected=food.id===item.foodId,unavailable=row.mixed&&mixedLimit(row,food,used)===0;
          const missing=row.mixed?Object.keys(food.macros).filter(group=>!row.totals[group]).map(group=>groupLabels[group]):[];
          const suffix=missing.length?' · falta '+missing.join(' e '):unavailable?' · sem saldo na refeição':'';
          return '<option value="'+escape(food.id)+'" '+(selected?'selected ':'')+(!selected&&(selectedElsewhere.has(food.id)||unavailable)?'disabled':'')+'>'+escape(food.name+suffix)+'</option>';
        }).join('');
        const food=available.find(option=>option.id===item.foodId);
        const quantity=food?foodQuantity(row,food,item.portions):'—';
        const limit=row.mixed&&food?mixedLimit(row,food,used):row.count;
        const portionLabel=row.mixed?'Porções da tabela':'Porções';
        return '<div class="tb-food-allocation" data-tb-food-allocation="'+index+'"><label><span>Alimento '+(index+1)+'</span><select data-tb-food-select aria-label="Alimento '+(index+1)+' para '+escape(row.text)+'" '+(!ready||busy?'disabled':'')+'>'+options+'</select></label><label class="tb-food-portion-label"><span>'+portionLabel+'</span><input data-tb-food-portions type="number" min="0.001" max="'+escape(String(limit))+'" step="0.001" inputmode="decimal" value="'+escape(String(item.portions))+'" '+(!ready||busy?'disabled':'')+'></label><strong class="tb-food-quantity" data-tb-food-quantity>'+escape(quantity)+'</strong>'+(draft.length>1?'<button type="button" class="tb-food-small-btn tb-food-remove" data-tb-food-remove="'+index+'" aria-label="Remover alimento '+(index+1)+'">Remover</button>':'')+'</div>';
      }).join('');
      const addButton='<button type="button" class="tb-food-small-btn tb-food-add" data-tb-food-add '+(!ready||busy||draft.length>=8?'disabled':'')+'>+ Adicionar alimento</button>';
      const showSave=!saved.length||changed||pending;
      const retryRemoval=row.mixed&&pending&&!entry?.selections?.length&&!hasDraft;
      const saveText=busy?'Sincronizando…':pending&&(sameSaved||retryRemoval)?'Sincronizar':saved.length?'Guardar':'Guardar escolha';
      const saveButton=showSave?'<button type="button" class="'+(saved.length?'tb-food-small-btn':'tb-food-save')+'" data-tb-food-save '+(!ready||busy||(!complete&&!retryRemoval)||(!changed&&saved.length&&!pending)?'disabled':'')+'>'+saveText+'</button>':'';
      const cancelButton=saved.length&&changed?'<button type="button" class="tb-food-small-btn" data-tb-food-cancel>Cancelar</button>':'';
      const clearButton=row.mixed&&entry?.selections?.length?'<button type="button" class="tb-food-small-btn" data-tb-food-clear '+(busy?'disabled':'')+'>Remover todos</button>':'';
      const actions='<div class="tb-food-actions">'+addButton+saveButton+cancelButton+clearButton+'</div>';
      const distribution='<small class="tb-food-distribution" data-tb-food-distribution>'+escape(distributionLabel(row,draft,available,complete))+'</small>';
      const warning=invalidMixed?'A escolha anterior precisa ser ajustada para esta refeição. Os descontos foram suspensos.':status;
      if(saved.length){
        const notice=errors.get(key)||(busy?'Salvo no aparelho · Sincronizando…':pending?'Salvo no aparelho · Sincronização pendente.':'');
        return '<li class="tb-food-choice tb-food-choice-compact tb-food-choice-accordion" data-tb-food-compact="1" data-tb-food-row="'+escape(key)+'"><details data-tb-food-details="1"'+detailOpen+'>'+summary+'<div class="tb-food-editor">'+allocationMarkup+distribution+actions+(notice?'<small role="status" data-tb-food-status>'+escape(notice)+'</small>':'')+'</div></details></li>';
      }
      return '<li class="tb-food-choice tb-food-choice-accordion" data-tb-food-row="'+escape(key)+'"><details data-tb-food-details="1"'+detailOpen+'>'+summary+'<div class="tb-food-editor">'+allocationMarkup+distribution+actions+'<small role="status" data-tb-food-status>'+escape(!available.length&&ready&&!invalidMixed?'Nenhuma quantidade calculável nesta categoria. Consulte a tabela e seu treinador.':warning)+'</small></div></details></li>';
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
    const payload={recordType:TYPE,studentUid:entry.studentUid,mealId:entry.mealId,date:entry.date,dietId:entry.dietId,variantId:entry.variantId,lineKey:entry.lineKey,foodId:entry.foodId,selections:entry.selections.map(item=>({foodId:item.foodId,portions:item.portions})),mutationId:entry.mutationId,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
    try{await ref.set(payload,{merge:true});return entry.date;}
    catch(error){
      // As regras preservam date/mealId. Uma escolha criada noutro dia exige
      // reconciliar o registro existente, jamais sobrescrever esses campos.
      if(!String(error?.code||'').includes('permission-denied')||!canCloud(entry.studentUid))throw error;
      const snapshot=await ref.get({source:'server'}),existing=snapshot.exists?snapshot.data():null;
      if(!valid(existing,entry)||!canCloud(entry.studentUid))throw error;
      await ref.update({foodId:entry.foodId,selections:payload.selections,mutationId:entry.mutationId,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
      return existing.date;
    }
  }
  function sync(entry){
    const key=entryKey(entry);if(inflight.has(key))return inflight.get(key);
    if(!canCloud(entry.studentUid)||!live(entry))return Promise.resolve(false);
    const row=live(entry),selected=savedAllocations(entry,entry,row,foods(row));
    if(!selected.length&&!(row.mixed&&entry.selections?.length===0))return Promise.resolve(false);
    // Migra escolhas antigas (somente foodId) para o formato de distribuição antes de sincronizar.
    const syncEntry={...entry,foodId:selected[0]?.foodId||'',selections:selected.map(item=>({foodId:item.foodId,portions:item.portions}))};
    const promise=commit(syncEntry).then(date=>{
      const confirmed={...syncEntry,date,pending:false};remote.set(key,confirmed);
      try{const applied=store(syncEntry.studentUid,key,confirmed,syncEntry.mutationId);if(applied){errors.delete(key);clearFoodFailure(syncEntry.studentUid,key);}else return true;}catch(error){errors.set(key,'Salvo na conta. Não foi possível atualizar o cache deste aparelho.');markFoodFailure(syncEntry.studentUid,key,error);}
      return true;
    },error=>{
      const current=read(entry.studentUid)[key];if(current?.mutationId===entry.mutationId){markFoodFailure(entry.studentUid,key,error);if(context()?.studentUid===entry.studentUid)errors.set(key,'Escolha guardada neste aparelho. Não foi possível sincronizar. Tente novamente.');}
      console.warn('[Team Bulls] Escolha de alimento pendente.',error?.code||error?.message);return false;
    }).finally(()=>{
      if(inflight.get(key)===promise)inflight.delete(key);
      if(context()?.studentUid===entry.studentUid)paint();
    });
    inflight.set(key,promise);paint();return promise;
  }
  async function save(ctx,selectionInput){
    const row=live(ctx,{adjusted:true}),key=entryKey(ctx);if(!row||row.count===0)throw new Error('Esta porção não está mais disponível nesta refeição.');
    const available=foods(row),raw=typeof selectionInput==='string'?[{foodId:selectionInput,portions:row.mixed?1:row.count}]:selectionInput;
    const normalized=normalizedAllocations(row,raw,available);
    if(!normalized)throw new Error(row.mixed?'Escolha alimentos que caibam nas porções de todos os macros previstos nesta refeição.':'Escolha alimentos válidos desta categoria e distribua exatamente '+number(row.count)+' porções entre eles.');
    // Guardamos a distribuição relativa à prescrição para restaurar as porções
    // originais ao remover um alimento diverso.
    const selections=row.prescribedCount===undefined?normalized:resizeAllocations(normalized,row.prescribedCount);
    if(inflight.has(key)){notify('Esta escolha ainda está sincronizando.');return false;}
    const current=recordsFor(ctx.studentUid)[key];
    // Guardar antes de iniciar a rede permite fechar o app sem perder a escolha.
    const entry={...ctx,recordType:TYPE,foodId:selections[0]?.foodId||'',selections,date:valid(current,ctx)&&/^\d{4}-\d{2}-\d{2}$/.test(current.date)?current.date:today(),mutationId:uid(),pending:true};
    try{store(ctx.studentUid,key,entry);}catch(storageError){
      // Sem espaço local: serializa a tentativa remota para impedir gravações concorrentes.
      if(!canCloud(ctx.studentUid)){markFoodFailure(ctx.studentUid,key,new Error('local storage unavailable'));errors.set(key,'Não foi possível salvar neste aparelho enquanto estiver offline.');throw new Error('O armazenamento deste aparelho está cheio e não há conexão segura para salvar na conta. Libere espaço ou conecte-se à internet e tente novamente.');}
      const task=(async()=>{
        try{
          const date=await commit(entry),confirmed={...entry,date,pending:false};
          remote.set(key,confirmed);volatile.add(key);drafts.delete(key);errors.delete(key);clearFoodFailure(ctx.studentUid,key);
          notify('✓ Escolha salva na sua conta. Este aparelho não conseguiu manter uma cópia offline.');
          return true;
        }catch(cloudError){
          markFoodFailure(ctx.studentUid,key,cloudError);errors.set(key,'Não foi possível confirmar o salvamento na conta. Tente novamente.');
          throw new Error('O aparelho está sem espaço e não foi possível confirmar o salvamento na conta. Conecte-se à internet, libere espaço e tente novamente.');
        }finally{
          if(inflight.get(key)===task)inflight.delete(key);
          paint();
        }
      })();
      inflight.set(key,task);paint();
      return await task;
    }
    drafts.delete(key);errors.delete(key);clearFoodFailure(ctx.studentUid,key);paint();
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
            const entry=doc.data(),row=live(entry);if(!valid(entry,entry)||entry.studentUid!==own.studentUid||entry.dietId!==own.dietId||!row)continue;
            const allocations=row.mixed?entry.selections:savedAllocations(entry,entry,row,foods(row));
            if(!Array.isArray(allocations)||(!row.mixed&&!allocations.length))continue;
            const recordKey=entryKey(entry),local=read(own.studentUid)[recordKey];
            if(local?.pending||local?.mutationId!==baseline[recordKey]?.mutationId)continue;
            const cached={recordType:TYPE,studentUid:entry.studentUid,dietId:entry.dietId,variantId:entry.variantId,mealId:entry.mealId,lineKey:entry.lineKey,foodId:entry.foodId||allocations[0]?.foodId||'',selections:allocations.map(item=>({foodId:item.foodId,portions:item.portions})),date:entry.date,mutationId:entry.mutationId,pending:false};remote.set(recordKey,cached);
            try{store(own.studentUid,recordKey,cached);}catch(error){console.warn('[Team Bulls] Cache de escolhas indisponível.');}
            clearFoodFailure(own.studentUid,recordKey);
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
  function diagnostics(){
    const uid=String(CURRENT_USER?.role==='student'?CURRENT_USER?.uid||'':'');
    if(!uid)return{available:false,pending:0,failed:0};
    const records=Object.entries(read(uid)).filter(([,entry])=>entry?.studentUid===uid&&entry.recordType===TYPE);
    const pending=records.filter(([,entry])=>entry.pending===true).length;
    const state=readFoodDiagnostics(uid),failedIds=new Set(Object.keys(state.failures));
    for(const key of [...errors.keys(),...volatile]){
      try{const parsed=JSON.parse(key);if(Array.isArray(parsed)&&parsed[0]===uid)failedIds.add(foodDiagnosticId(key));}catch(error){}
    }
    const latest=Object.values(state.failures).sort((a,b)=>Number(b?.at||0)-Number(a?.at||0))[0]||{};
    return{available:true,pending,failed:failedIds.size,lastError:FOOD_SYNC_ERROR_CATEGORIES.has(latest.category)?latest.category:'',lastErrorAt:Math.max(0,Math.min(8640000000000000,Number(latest.at)||0))};
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
    style.textContent+='.tb-food-allocation{display:grid;grid-template-columns:minmax(0,1fr) minmax(78px,.36fr);align-items:end;gap:8px;padding:8px;border:1px solid var(--border,#38312d);border-radius:8px;background:var(--surface,#151311)}.tb-food-allocation label{display:grid;min-width:0;gap:5px;color:var(--text-dim,#999);font-size:11px}.tb-food-allocation select,.tb-food-allocation input{width:100%;min-width:0;min-height:42px;background:var(--bg,#111);color:var(--text,#f1eee9);border:1px solid var(--border,#555);border-radius:7px;padding:7px 8px;font:inherit;font-size:15px}.tb-food-allocation .tb-food-quantity{grid-column:1;font-size:15px}.tb-food-allocation .tb-food-remove{grid-column:2;justify-self:end}.tb-food-distribution{color:var(--text-dim,#999)}.tb-food-add{margin-right:auto}.tb-food-add:disabled{opacity:.5;cursor:default}@media(max-width:380px){.tb-food-allocation{grid-template-columns:minmax(0,1fr) 82px;gap:6px;padding:7px}.tb-food-allocation select,.tb-food-allocation input{font-size:14px}}';
    const selectionForDraft=(ctx,row)=>{
      const key=entryKey(ctx),available=foods(row),entry=recordsFor(ctx.studentUid)[key],saved=savedAllocations(entry,ctx,row,available);
      return{key,available,entry,saved,values:draftFor(key,row,saved)};
    };
    const updateDraftUi=(node,ctx,row)=>{
      const state=selectionForDraft(ctx,row),complete=distributionComplete(row,state.values,state.available),same=state.saved.length&&selectionsMatch(state.values,state.saved);
      const allocations=Array.from(node.querySelectorAll?.('[data-tb-food-allocation]')||[]);
      if(allocations.length){
        allocations.forEach((allocation,index)=>{
          const item=state.values[index],food=item&&state.available.find(option=>option.id===item.foodId),quantity=allocation.querySelector('[data-tb-food-quantity]');
          if(quantity)quantity.textContent=food?foodQuantity(row,food,item.portions):'—';
          if(row.mixed&&item){
            const other=state.values.filter((_,position)=>position!==index),used=mixedUsed(other,state.available);
            const select=allocation.querySelector('[data-tb-food-select]'),input=allocation.querySelector('[data-tb-food-portions]');
            if(input)input.max=String(food?mixedLimit(row,food,used):row.count);
            for(const option of select?.options||[]){
              const candidate=state.available.find(food=>food.id===option.value);
              if(candidate)option.disabled=option.value!==item.foodId&&(other.some(value=>value.foodId===option.value)||mixedLimit(row,candidate,used)===0);
            }
          }
        });
      }else{
        const first=state.values[0],food=first&&state.available.find(option=>option.id===first.foodId),quantity=node.querySelector('[data-tb-food-quantity]');
        if(quantity)quantity.textContent=food?foodQuantity(row,food,first.portions):'—';
      }
      const distribution=node.querySelector('[data-tb-food-distribution]');
      if(distribution)distribution.textContent=distributionLabel(row,state.values,state.available,complete);
      const button=node.querySelector('[data-tb-food-save]'),busy=inflight.has(state.key),pending=!!(state.saved.length&&state.entry?.pending),ready=loaded===scopeKey(ctx);
      if(button){button.disabled=!complete||busy||!ready||(!state.saved.length?false:!!same&&!pending);button.textContent=busy?'Sincronizando…':pending&&same?'Sincronizar':state.saved.length?'Guardar':'Guardar escolha';}
      const status=node.querySelector('[data-tb-food-status]');
      if(status&&!busy&&!pending&&!errors.has(state.key))status.textContent=complete?'Toque em Guardar para salvar a distribuição para todos os dias.':row.mixed?'Escolha uma quantidade que caiba nos macros disponíveis.':'Distribua exatamente '+number(row.count)+' porções entre os alimentos.';
    };
    const controlIndex=control=>{
      const allocation=control.closest?.('[data-tb-food-allocation]');
      const value=allocation?.dataset?.tbFoodAllocation??control.dataset?.tbFoodAllocation??0;
      const index=Number(value);return Number.isInteger(index)&&index>=0?index:0;
    };
    const addAllocation=(ctx,node)=>{
      const row=live(ctx,{adjusted:true});if(!row||row.count===0)return;
      const state=selectionForDraft(ctx,row),values=state.values.map(item=>({...item}));
      if(values.length>=8)return;
      const total=roundPortions(values.reduce((sum,item)=>sum+item.portions,0)),remaining=roundPortions(row.count-total);
      if(row.mixed)values.push({foodId:'',portions:1});
      else if(remaining>0.001)values.push({foodId:'',portions:remaining});
      else{
        let index=0;for(let i=1;i<values.length;i++)if(values[i].portions>values[index].portions)index=i;
        const first=roundPortions(values[index].portions/2),second=roundPortions(values[index].portions-first);
        if(first<0.001||second<0.001){notify('Essa porção é pequena demais para ser dividida em outro alimento.',true);return;}
        values[index].portions=first;values.push({foodId:'',portions:second});
      }
      drafts.set(state.key,values);errors.delete(state.key);paint();
      const fresh=Array.from(document.querySelectorAll?.('[data-tb-food-row]')||[]).find(item=>item.dataset.tbFoodRow===node.dataset.tbFoodRow);
      const selects=Array.from(fresh?.querySelectorAll?.('[data-tb-food-select]')||[]);selects[selects.length-1]?.focus();
    };
    const removeAllocation=(ctx,node,index)=>{
      const row=live(ctx,{adjusted:true});if(!row||row.count===0)return;
      const state=selectionForDraft(ctx,row),values=state.values.map(item=>({...item}));
      if(values.length<=1||index<0||index>=values.length)return;
      const [removed]=values.splice(index,1);
      if(!row.mixed)values[0].portions=roundPortions(values[0].portions+removed.portions);
      drafts.set(state.key,values);errors.delete(state.key);paint();
      const fresh=Array.from(document.querySelectorAll?.('[data-tb-food-row]')||[]).find(item=>item.dataset.tbFoodRow===node.dataset.tbFoodRow);
      fresh?.querySelector('[data-tb-food-select]')?.focus();
    };
    document.addEventListener('change',event=>{
      const control=event.target.closest?.('[data-tb-food-select]'),node=control?.closest('[data-tb-food-row]'),ctx=node&&rowContext(node);if(!ctx)return;
      const row=live(ctx,{adjusted:true});if(!row||row.count===0)return;
      const state=selectionForDraft(ctx,row),values=state.values.map(item=>({...item})),index=controlIndex(control);
      if(index>=values.length)return;
      const foodId=String(control.value||'');
      if(row.mixed&&foodId){
        const food=state.available.find(option=>option.id===foodId),other=values.filter((_,position)=>position!==index);
        const limit=food&&!other.some(item=>item.foodId===foodId)?mixedLimit(row,food,mixedUsed(other,state.available)):0;
        if(!limit){control.value=values[index].foodId;notify('Este alimento não cabe nos macros previstos nesta refeição.',true);return;}
        values[index].portions=Math.min(values[index].portions||1,limit);
      }
      values[index].foodId=foodId;drafts.set(state.key,values);errors.delete(state.key);updateDraftUi(node,ctx,row);
      if(row.mixed||node.dataset.tbFoodCompact==='1'){
        paint();
        const fresh=Array.from(document.querySelectorAll?.('[data-tb-food-row]')||[]).find(item=>item.dataset.tbFoodRow===state.key);
        const selects=Array.from(fresh?.querySelectorAll?.('[data-tb-food-select]')||[]);selects[index]?.focus();
      }
    });
    document.addEventListener('input',event=>{
      const input=event.target.closest?.('[data-tb-food-portions]'),node=input?.closest('[data-tb-food-row]'),ctx=node&&rowContext(node);if(!ctx)return;
      const row=live(ctx,{adjusted:true});if(!row||row.count===0)return;
      const state=selectionForDraft(ctx,row),values=state.values.map(item=>({...item})),index=controlIndex(input);
      if(index>=values.length)return;
      values[index].portions=roundPortions(input.value);drafts.set(state.key,values);errors.delete(state.key);updateDraftUi(node,ctx,row);
    });
    document.addEventListener('click',event=>{
      const add=event.target.closest?.('[data-tb-food-add]');
      if(add){
        if(add.disabled)return;
        const node=add.closest('[data-tb-food-row]'),ctx=node&&rowContext(node);if(!ctx)return;
        event.preventDefault();addAllocation(ctx,node);return;
      }
      const remove=event.target.closest?.('[data-tb-food-remove]');
      if(remove){
        if(remove.disabled)return;
        const node=remove.closest('[data-tb-food-row]'),ctx=node&&rowContext(node);if(!ctx)return;
        event.preventDefault();removeAllocation(ctx,node,Number(remove.dataset.tbFoodRemove));return;
      }
      const cancel=event.target.closest?.('[data-tb-food-cancel]');
      if(cancel){
        if(cancel.disabled)return;
        const node=cancel.closest('[data-tb-food-row]'),ctx=node&&rowContext(node);if(!ctx)return;
        const key=entryKey(ctx);event.preventDefault();drafts.delete(key);errors.delete(key);paint();
        const fresh=Array.from(document.querySelectorAll?.('[data-tb-food-row]')||[]).find(item=>item.dataset.tbFoodRow===key);
        fresh?.querySelector('[data-tb-food-select]')?.focus();return;
      }
      const clear=event.target.closest?.('[data-tb-food-clear]');
      if(clear&&!clear.disabled){
        const node=clear.closest('[data-tb-food-row]'),ctx=node&&rowContext(node);if(ctx?.lineKey!==MIXED_LINE)return;
        event.preventDefault();save(ctx,[]).catch(error=>notify(error.message,true));return;
      }
      const button=event.target.closest?.('[data-tb-food-save]');if(!button||button.disabled)return;
      const node=button.closest('[data-tb-food-row]'),ctx=node&&rowContext(node);if(!ctx)return;
      const row=live(ctx,{adjusted:true});if(!row||row.count===0)return;
      const state=selectionForDraft(ctx,row),values=drafts.has(state.key)?state.values:state.saved.map(item=>({foodId:item.foodId,portions:item.portions}));
      event.preventDefault();save(ctx,values).catch(error=>{errors.set(state.key,error.message);paint();notify(error.message,true);});
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
  window.TeamBullsStudentFoodChoices=Object.freeze({version:VERSION,parse,rows,scale,foods,items,save,refresh,flush,diagnostics});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('team-bulls-runtime-ready',install);
})();
