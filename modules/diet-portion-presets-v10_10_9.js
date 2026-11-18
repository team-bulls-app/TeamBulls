(()=>{
  'use strict';

  const VERSION='10.10.13-portions3';
  const BASE_PRESETS=Object.freeze([
    {id:'carb-05',group:'carbo',label:'0,5 Porção de Carboidrato',protein:1,carbs:14,fat:0.1},
    {id:'carb-10',group:'carbo',label:'1 Porção de Carboidrato',protein:3,carbs:28,fat:0.2},
    {id:'carb-15',group:'carbo',label:'1,5 Porção de Carboidrato',protein:4,carbs:42,fat:0.3},
    {id:'carb-20',group:'carbo',label:'2 Porção de Carboidrato',protein:5,carbs:56,fat:0.4},
    {id:'carb-25',group:'carbo',label:'2,5 Porção de Carboidrato',protein:6,carbs:70,fat:0.5},
    {id:'carb-30',group:'carbo',label:'3 Porção de Carboidrato',protein:8,carbs:84,fat:0.6},
    {id:'carb-35',group:'carbo',label:'3,5 Porção de Carboidrato',protein:9,carbs:98,fat:0.7},
    {id:'carb-40',group:'carbo',label:'4 Porção de Carboidrato',protein:10,carbs:112,fat:0.8},
    {id:'fruit-05',group:'fruta',label:'0,5 Porção de Fruta',protein:1,carbs:11.9,fat:0},
    {id:'fruit-10',group:'fruta',label:'1 Porção de Fruta',protein:1,carbs:23.8,fat:0.1},
    {id:'fruit-15',group:'fruta',label:'1,5 Porção de Fruta',protein:2,carbs:35.7,fat:0.2},
    {id:'fruit-20',group:'fruta',label:'2 Porção de Fruta',protein:2,carbs:47.6,fat:0.2},
    {id:'fruit-25',group:'fruta',label:'2,5 Porção de Fruta',protein:2,carbs:59.5,fat:0.3},
    {id:'protein-05',group:'proteina',label:'0,5 Porção de Proteína',protein:7.85,carbs:0,fat:0.8},
    {id:'protein-10',group:'proteina',label:'1 Porção de Proteína',protein:15.7,carbs:0,fat:1.6},
    {id:'protein-15',group:'proteina',label:'1,5 Porção de Proteína',protein:23.6,carbs:0,fat:2.4},
    {id:'protein-20',group:'proteina',label:'2 Porção de Proteína',protein:31.5,carbs:0,fat:3.2},
    {id:'protein-25',group:'proteina',label:'2,5 Porção de Proteína',protein:39.35,carbs:0,fat:4},
    {id:'protein-30',group:'proteina',label:'3 Porção de Proteína',protein:47.2,carbs:0,fat:4.8},
    {id:'protein-35',group:'proteina',label:'3,5 Porção de Proteína',protein:55.05,carbs:0,fat:5.6},
    {id:'protein-40',group:'proteina',label:'4 Porção de Proteína',protein:63,carbs:0,fat:6.4},
    {id:'tomato-60',group:'vegetais',label:'60g Vegetais',protein:0,carbs:1.65,fat:0},
    {id:'tomato-90',group:'vegetais',label:'90g Vegetais',protein:0,carbs:2.5,fat:0},
    {id:'tomato-120',group:'vegetais',label:'120g Vegetais',protein:0,carbs:3.3,fat:0},
    {id:'tomato-180',group:'vegetais',label:'180g Vegetais',protein:0,carbs:5,fat:0},
    {id:'tomato-240',group:'vegetais',label:'240g Vegetais',protein:0,carbs:6.6,fat:0},
    {id:'fat-05',group:'gordura',label:'0,5 Porção de Gordura',protein:0,carbs:0,fat:4},
    {id:'fat-10',group:'gordura',label:'1 Porção de Gordura',protein:0,carbs:0,fat:8},
    {id:'fat-15',group:'gordura',label:'1,5 Porção de Gordura',protein:0,carbs:0,fat:12},
    {id:'fat-20',group:'gordura',label:'2 Porção de Gordura',protein:0,carbs:0,fat:16},
    {id:'corncream-100',group:'creme',label:'100ml Creme de Milho',protein:6,carbs:11.6,fat:8.6},
    {id:'corncream-50',group:'creme',label:'50ml Creme de Milho',protein:3,carbs:5.8,fat:4.3}
  ].map(item=>Object.freeze({...item})));

  const LEGACY_ALIASES=Object.freeze([
    ...BASE_PRESETS.filter(item=>item.group==='carbo').map(item=>({...item,id:'legacy-'+item.id,group:'legacy',label:item.label.replace('Carboidrato','Carbo'),hidden:true})),
    {id:'legacy-tomato-60',group:'legacy',label:'60g Tomate',protein:0,carbs:1.65,fat:0,hidden:true},
    {id:'legacy-tomato-90',group:'legacy',label:'90g Tomate',protein:0,carbs:2.5,fat:0,hidden:true},
    {id:'legacy-tomato-120',group:'legacy',label:'120g Tomate',protein:0,carbs:3.3,fat:0,hidden:true},
    {id:'legacy-tomato-180',group:'legacy',label:'180g Tomate',protein:0,carbs:5,fat:0,hidden:true},
    {id:'legacy-tomato-240',group:'legacy',label:'240g Tomate',protein:0,carbs:6.6,fat:0,hidden:true}
  ].map(item=>Object.freeze({...item})));

  const GROUPS=Object.freeze({
    carbo:{label:'Carboidrato',className:'carbo'},fruta:{label:'Fruta',className:'fruta'},proteina:{label:'Proteína',className:'proteina'},vegetais:{label:'Vegetais',className:'vegetais'},gordura:{label:'Gordura',className:'gordura'},creme:{label:'Creme de Milho',className:'creme'},custom:{label:'Personalizado',className:'custom'}
  });
  const PRESETS=[...BASE_PRESETS,...LEGACY_ALIASES];
  let customItems=[];

  const key=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
  const num=value=>{const parsed=Number(String(value??'').replace(',','.'));return Number.isFinite(parsed)&&parsed>=0?parsed:0;};
  function normalizeCustom(raw,index=0){
    if(!raw||typeof raw!=='object')return null;const label=String(raw.label||'').normalize('NFKC').replace(/\s+/g,' ').trim().slice(0,120);if(!label)return null;
    return Object.freeze({id:`custom-${String(raw.id||index).replace(/[^a-z0-9_-]/gi,'-').slice(0,80)}`,group:'custom',label,protein:num(raw.protein),carbs:num(raw.carbs),fat:num(raw.fat),custom:true,hidden:true});
  }
  function rebuild(){PRESETS.splice(0,PRESETS.length,...BASE_PRESETS,...LEGACY_ALIASES,...customItems);}
  function setCustomItems(items){
    const reserved=new Set([...BASE_PRESETS,...LEGACY_ALIASES].map(item=>key(item.label))),seen=new Set(),clean=[];
    (Array.isArray(items)?items:[]).forEach((raw,index)=>{const item=normalizeCustom(raw,index),k=key(item?.label);if(!item||!k||reserved.has(k)||seen.has(k))return;seen.add(k);clean.push(item);});
    customItems=clean;rebuild();return customItems.length;
  }
  function customSnapshot(){return customItems.map(item=>({...item}));}
  function presetSnapshot(){return PRESETS.slice();}

  function isTrainer(){return typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role==='trainer';}
  function canEditMeal(){return isTrainer()&&typeof MEAL_CTX!=='undefined'&&MEAL_CTX?.canEditContent===true;}
  function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
  function br(value){return(Number(value)||0).toLocaleString('pt-BR',{maximumFractionDigits:2});}
  function kcal(item){return Math.round(num(item?.protein)*4+num(item?.carbs)*4+num(item?.fat)*9);}
  function toast(message,error=false){if(typeof showToast==='function')showToast(message,error);}

  function injectStyles(){
    if(document.getElementById('tb-diet-portion-presets-style'))return;const style=document.createElement('style');style.id='tb-diet-portion-presets-style';style.textContent=`
      .tb-portion-tool{margin:12px 0;border:1px solid rgba(255,255,255,.09);border-radius:11px;background:#101010;overflow:hidden}.tb-portion-tool-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 12px;border-bottom:1px solid rgba(255,255,255,.06)}.tb-portion-tool-head>div{min-width:0}.tb-portion-tool-kicker{display:block;font:800 8px 'DM Mono',monospace;letter-spacing:1px;color:#ff6c87}.tb-portion-tool-title{display:block;margin-top:3px;font:800 15px 'Barlow Condensed',sans-serif;color:#eee}.tb-portion-tool-sub{display:block;margin-top:2px;color:#756e69;font-size:9px;line-height:1.35}.tb-portion-toggle,.tb-portion-reference-btn{border:1px solid rgba(225,29,72,.45);background:rgba(225,29,72,.09);color:#ff738c;border-radius:7px;padding:8px 10px;font:800 8px 'DM Mono',monospace;letter-spacing:.55px;cursor:pointer;white-space:nowrap}.tb-portion-tool-body{padding:10px 10px 12px}.tb-portion-tool-body[hidden]{display:none!important}.tb-portion-filter{display:grid;grid-template-columns:1fr auto;gap:8px;margin-bottom:9px}.tb-portion-filter input{min-width:0;border:1px solid rgba(255,255,255,.1);border-radius:7px;background:#0b0b0b;color:#eee;padding:8px 9px;font:500 11px 'Barlow',sans-serif;outline:none}.tb-portion-filter button{border:1px solid rgba(255,255,255,.09);border-radius:7px;background:#171717;color:#aaa;padding:8px 10px;font:700 8px 'DM Mono',monospace;cursor:pointer}.tb-portion-scroll{max-height:286px;overflow:auto;border:1px solid rgba(255,255,255,.06);border-radius:8px}.tb-portion-table{width:100%;border-collapse:collapse;min-width:475px;background:#0b0b0b}.tb-portion-table th{position:sticky;top:0;z-index:2;background:#121212;color:#756d67;font:700 8px 'DM Mono',monospace;letter-spacing:.5px;text-transform:uppercase}.tb-portion-table th,.tb-portion-table td{padding:7px 7px;border-bottom:1px solid rgba(255,255,255,.055);text-align:right}.tb-portion-table th:first-child,.tb-portion-table td:first-child{text-align:left}.tb-portion-label{font:700 10px 'Barlow',sans-serif;color:#f2eeeb;white-space:nowrap}.tb-portion-macro{font:600 9px 'DM Mono',monospace;color:#aea7a1}.tb-portion-kcal{font:700 9px 'DM Mono',monospace;color:#7e7771}.tb-portion-row.carbo{background:rgba(34,91,34,.38)}.tb-portion-row.fruta{background:rgba(165,35,45,.34)}.tb-portion-row.proteina{background:rgba(10,46,109,.44)}.tb-portion-row.vegetais{background:rgba(180,65,25,.38)}.tb-portion-row.gordura{background:rgba(112,44,158,.4)}.tb-portion-row.creme{background:rgba(67,67,67,.42)}.tb-portion-actions{display:flex;justify-content:flex-end;gap:5px}.tb-portion-actions button{border:1px solid rgba(255,255,255,.1);border-radius:6px;background:#151515;color:#bbb;padding:6px 7px;font:800 7px 'DM Mono',monospace;cursor:pointer}.tb-portion-actions button.primary{border-color:rgba(225,29,72,.45);background:rgba(225,29,72,.12);color:#ff7890}.tb-portion-note{margin-top:8px;color:#706963;font-size:9px;line-height:1.4}.tb-portion-reference-slot{margin:8px 0 12px;display:flex;justify-content:flex-end}.tb-portion-reference-slot .tb-portion-reference-btn{font-size:9px;padding:9px 11px}#tb-portion-reference-modal .modal-sheet{max-width:820px}.tb-portion-reference-intro{padding:0 0 10px;color:#817973;font-size:10px;line-height:1.45}@media(max-width:520px){.tb-portion-tool-head{align-items:flex-start;flex-direction:column}.tb-portion-toggle{width:100%}.tb-portion-filter{grid-template-columns:1fr}.tb-portion-filter button{width:100%}.tb-portion-scroll{max-height:240px}}
    `;document.head.appendChild(style);
  }
  function visiblePresets(){return BASE_PRESETS;}
  function rowsHtml(mode='add',query=''){
    const needle=key(query);const list=visiblePresets().filter(item=>!needle||key(`${item.label} ${GROUPS[item.group]?.label||item.group}`).includes(needle));if(!list.length)return'<tr><td colspan="7" class="tb-portion-label">Nenhuma porção encontrada.</td></tr>';
    return list.map(item=>`<tr class="tb-portion-row ${escapeHtml(GROUPS[item.group]?.className||'')}"><td><span class="tb-portion-label">${escapeHtml(item.label)}</span></td><td class="tb-portion-macro">${br(item.protein)}</td><td class="tb-portion-macro">${br(item.carbs)}</td><td class="tb-portion-macro">${br(item.fat)}</td><td class="tb-portion-kcal">${br(kcal(item))}</td><td class="tb-portion-macro">${escapeHtml(GROUPS[item.group]?.label||item.group)}</td><td><div class="tb-portion-actions">${mode==='add'?`<button class="primary" type="button" onclick="TeamBullsDietPortions.add('${item.id}')">ADICIONAR</button>`:''}<button type="button" onclick="TeamBullsDietPortions.copy('${item.id}')">COPIAR</button></div></td></tr>`).join('');
  }
  function tableHtml(mode='add',query=''){return`<div class="tb-portion-scroll"><table class="tb-portion-table"><thead><tr><th>Prescrição</th><th>P (g)</th><th>C (g)</th><th>G (g)</th><th>kcal</th><th>Grupo</th><th>Ação</th></tr></thead><tbody data-portion-rows="${escapeHtml(mode)}">${rowsHtml(mode,query)}</tbody></table></div><div class="tb-portion-note">Os valores P/C/G reproduzem a tabela enviada pelo treinador. Ao adicionar, somente o texto da porção entra na dieta do aluno; os números permanecem como referência de prescrição.</div>`;}
  function toolHtml(){return`<section class="tb-portion-tool" id="tb-meal-portion-tool"><div class="tb-portion-tool-head"><div><span class="tb-portion-tool-kicker">ATALHO DE PRESCRIÇÃO</span><strong class="tb-portion-tool-title">Tabela de porções pré-estabelecidas</strong><small class="tb-portion-tool-sub">Escolha uma linha e insira diretamente na refeição.</small></div><button class="tb-portion-toggle" type="button" onclick="TeamBullsDietPortions.toggleMealTable()">ABRIR TABELA</button></div><div class="tb-portion-tool-body" id="tb-meal-portion-body" hidden><div class="tb-portion-filter"><input id="tb-meal-portion-search" type="search" placeholder="Buscar carboidrato, fruta, proteína, vegetais..." oninput="TeamBullsDietPortions.filterMealTable(this.value)"><button type="button" onclick="TeamBullsDietPortions.clearMealSearch()">LIMPAR</button></div>${tableHtml('add')}</div></section>`;}
  function ensureMealTool(){const modal=document.getElementById('modal-meal'),items=document.getElementById('input-meal-items');if(!modal||!items)return null;const old=document.getElementById('tb-meal-portion-tool');if(!canEditMeal()){old?.remove();return null;}if(old)return old;const group=items.closest('.form-group');if(!group)return null;group.insertAdjacentHTML('afterend',toolHtml());return document.getElementById('tb-meal-portion-tool');}
  function toggleMealTable(){const tool=ensureMealTool(),body=document.getElementById('tb-meal-portion-body');if(!tool||!body)return;body.hidden=!body.hidden;const button=tool.querySelector('.tb-portion-toggle');if(button)button.textContent=body.hidden?'ABRIR TABELA':'FECHAR TABELA';}
  function filterMealTable(value){const body=document.getElementById('tb-meal-portion-body'),tbody=body?.querySelector('[data-portion-rows="add"]');if(tbody)tbody.innerHTML=rowsHtml('add',value);}
  function clearMealSearch(){const input=document.getElementById('tb-meal-portion-search');if(input)input.value='';filterMealTable('');}
  function preset(id){return BASE_PRESETS.find(item=>item.id===id)||null;}
  function appendLine(textarea,text){if(!textarea)return false;const current=String(textarea.value||'').trimEnd(),next=(current?current+'\n':'')+text,max=Number(textarea.maxLength)||5000;if(next.length>max){toast('A refeição atingiu o limite de texto.',true);return false;}textarea.value=next;textarea.dispatchEvent(new Event('input',{bubbles:true}));textarea.focus();textarea.setSelectionRange?.(textarea.value.length,textarea.value.length);return true;}
  function addPreset(id){if(!canEditMeal())return;const item=preset(id),textarea=document.getElementById('input-meal-items');if(item&&appendLine(textarea,item.label))toast('✓ '+item.label+' adicionada à refeição');}
  async function copyText(text){try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true;}}catch(error){}try{const area=document.createElement('textarea');area.value=text;area.readOnly=true;area.style.position='fixed';area.style.opacity='0';document.body.appendChild(area);area.select();const ok=document.execCommand('copy');area.remove();return ok;}catch(error){return false;}}
  async function copyPreset(id){const item=preset(id);if(!item)return;const ok=await copyText(item.label);toast(ok?'✓ Porção copiada':'Não foi possível copiar a porção.',!ok);}
  function ensureReferenceButton(){const anchor=document.getElementById('tb-diet-calculator');if(!anchor||!isTrainer())return null;let slot=document.getElementById('tb-portion-reference-slot');if(slot)return slot;slot=document.createElement('div');slot.id='tb-portion-reference-slot';slot.className='tb-portion-reference-slot';slot.innerHTML='<button class="tb-portion-reference-btn" type="button" onclick="TeamBullsDietPortions.openReference()">TABELA DE PORÇÕES PARA PRESCRIÇÃO</button>';anchor.insertAdjacentElement('afterend',slot);return slot;}
  function ensureReferenceModal(){let modal=document.getElementById('tb-portion-reference-modal');if(modal)return modal;modal=document.createElement('div');modal.className='modal-backdrop';modal.id='tb-portion-reference-modal';modal.innerHTML=`<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">Tabela de porções para prescrição</div><div class="tb-portion-reference-intro">Referência rápida da planilha. Use COPIAR para levar uma porção ao clipboard ou abra uma refeição para usar ADICIONAR diretamente.</div><div class="tb-portion-filter"><input id="tb-reference-portion-search" type="search" placeholder="Buscar porção..." oninput="TeamBullsDietPortions.filterReference(this.value)"><button type="button" onclick="TeamBullsDietPortions.clearReferenceSearch()">LIMPAR</button></div>${tableHtml('copy')}<button class="btn-ghost" type="button" onclick="closeModal('tb-portion-reference-modal')">FECHAR</button></div>`;document.body.appendChild(modal);return modal;}
  function openReference(){if(!isTrainer())return;const modal=ensureReferenceModal();if(typeof openModal==='function')openModal(modal.id);else modal.classList.add('open');}
  function filterReference(value){const modal=ensureReferenceModal(),tbody=modal.querySelector('[data-portion-rows="copy"]');if(tbody)tbody.innerHTML=rowsHtml('copy',value);}
  function clearReferenceSearch(){const input=document.getElementById('tb-reference-portion-search');if(input)input.value='';filterReference('');}
  function installHooks(){if(window.__TB_DIET_PORTIONS_HOOKED)return;window.__TB_DIET_PORTIONS_HOOKED=true;if(typeof openAddMealModal==='function'){const base=openAddMealModal;openAddMealModal=function(){const result=base.apply(this,arguments);requestAnimationFrame(ensureMealTool);return result;};}if(typeof openEditMealModal==='function'){const base=openEditMealModal;openEditMealModal=function(){const result=base.apply(this,arguments);requestAnimationFrame(ensureMealTool);return result;};}if(typeof openDietDetail==='function'){const base=openDietDetail;openDietDetail=async function(){const result=await base.apply(this,arguments);if(arguments[1]===true&&isTrainer())requestAnimationFrame(ensureReferenceButton);return result;};}if(typeof confirmLogout==='function'){const base=confirmLogout;confirmLogout=function(){setCustomItems([]);document.getElementById('tb-meal-portion-tool')?.remove();document.getElementById('tb-portion-reference-slot')?.remove();document.getElementById('tb-portion-reference-modal')?.remove();return base.apply(this,arguments);};}}

  const api={version:VERSION,get presets(){return presetSnapshot();},setCustomItems,customItems:customSnapshot,add:addPreset,copy:copyPreset,toggleMealTable,filterMealTable,clearMealSearch,openReference,filterReference,clearReferenceSearch};
  window.TeamBullsDietPortions=Object.freeze(api);
  injectStyles();installHooks();
})();