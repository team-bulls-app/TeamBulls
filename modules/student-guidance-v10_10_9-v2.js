/* Team Bulls v10.10.9 — hidratação, orientações nutricionais, alongamentos e prompt estável. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_STUDENT_GUIDANCE_V2_V10109__)return;
  window.__TEAM_BULLS_STUDENT_GUIDANCE_V2_V10109__=true;

  const VERSION='10.10.9-guidance3';
  const STATIC_REVISION='nutrition-stretch-2';
  const ACK_PREFIX='team_bulls_instruction_ack_v2_';
  const NUTRITION_GUIDANCE=[
    'Pesar os alimentos já preparados (cozidos, assados etc.).',
    'Priorizar alimentos frescos.',
    'Prefira alimentos mais limpos, como arroz, mandioca, batata, frango, peixe, grãos, sementes e cereais.',
    'Usar pouco sódio.',
    'Dar preferência a temperos naturais, como canela, alho, cebola, pimentão, cebolinha, coentro, salsa, pimenta-do-reino e orégano.',
    'Bebidas zero calorias à vontade.',
    'Prefira refeições livres mais limpas.',
    'Não exagere no óleo na hora de preparar os alimentos.',
    'Priorize alimentos com bastante fibra.',
    'Os vegetais podem ser remanejados conforme a preferência do aluno, desde que seja ingerida a quantidade prescrita, sem mais nem menos.',
    'Comer alimentos que estão na dieta, mas preparados com excesso de gordura deixa de se enquadrar na proposta por elevar gordura, sódio e calorias. Exemplos: frango frito, comida japonesa com muitos molhos, carnes vermelhas gordas, excesso de óleo no preparo e marmitas preparadas com muita gordura.'
  ];
  const STRETCH_PAGES=[
    {title:'PLANILHA DE ALONGAMENTOS',items:[['Guia Team Bulls','Material de consulta para os alongamentos prescritos. Use as setas ou deslize para navegar pelas páginas.']]},
    {title:'ILIOPSOAS',items:[['1 · Alongamento para Iliopsoas','Posicione uma perna flexionada no chão ajoelhado(a), a outra perna de apoio atrás. Projete a perna flexionada para frente juntamente do quadril enquanto contrai o glúteo da perna de apoio.'],['2 · Alongamento para Iliopsoas e Calcanhar','Posicione uma perna flexionada no chão ajoelhado(a) de forma lateralizada, a outra perna de apoio atrás, formando 90° com as pernas. Projete a perna flexionada para frente juntamente do quadril.']]},
    {title:'POSTERIORES DA COXA',items:[['3 · Alongamento para Posteriores da Coxa','Posicione as pernas juntas e estendidas ao máximo, desça somente o tronco deixando as pernas estendidas enquanto tenta encostar as mãos na sola dos dedos do pé.'],['4 · Alongamento para Posteriores da Coxa','Posicione-se sentado com as duas pernas estendidas, tente encostar suas mãos à sola dos pés enquanto mantém a perna totalmente estendida.']]},
    {title:'POSTERIORES / ADUTORES',items:[['5 · Alongamento para Posteriores da Coxa','Posicione-se sentado no chão, com uma das pernas flexionada e deitada no chão, estenda a outra perna e tente encostar a sola do pé estendido, sem deixá-lo flexionar.'],['6 · Alongamento para Adutores e Iliopsoas','Posicione-se sentado no chão, com as pernas formando um losango, encostando os pés um no outro. Faça força para baixo com as pernas enquanto contrai os glúteos. Se necessário, faça uma leve força com os braços para que as pernas desçam mais.']]},
    {title:'GLÚTEOS E ILIOPSOAS',items:[['7 · Alongamento para Glúteos e Iliopsoas','Posicione-se no chão com uma das pernas estendidas para trás e a outra flexionada e apoiada no chão. Em seguida, debruce-se em cima da perna flexionada, jogando o peso sobre a perna e estendendo ainda mais a perna traseira.']]},
    {title:'GLÚTEOS',items:[['8 · Alongamento para Glúteos','Posicione-se no chão deitado de costas, estenda uma das pernas e flexione a outra lateralmente. Com a mão contrária, puxe próximo ao joelho a perna flexionada para mais lateralmente; a outra mão fica estendida e faz força contrária com o tronco em relação à perna flexionada.']]},
    {title:'DORSAIS E OMBROS',items:[['9 · Alongamento para Dorsais e Ombros','Posicione-se à frente de uma barra alinhada com sua cabeça, coloque as mãos alinhadas com os ombros e vá para trás. Em seguida, abaixe o tronco, deixe os braços estendidos e faça força com o quadril e as pernas para trás.'],['10 · Alongamento para os Ombros','Posicione os punhos em uma barra na altura da cabeça, coloque a cabeça à frente da barra e deixe os punhos para trás. Em seguida, faça força com o tronco empurrando para frente, estabilize e trave os braços.']]},
    {title:'OMBROS',items:[['11 · Alongamento para os Ombros','Posicione a mão atrás da nuca e, com a outra mão, faça força puxando o cotovelo para trás e para o lado a favor da mão que está puxando.'],['12 · Alongamento para os Ombros','Posicione a mão em uma base e estenda o braço. Jogue o tronco de forma contrária à mão alongada, estabilize e trave a mão e o braço estendido.']]},
    {title:'OMBROS',items:[['13 · Alongamento para os Ombros','Posicione o braço flexionado em uma base, jogue o tronco de forma contrária à mão alongada, fazendo força no cotovelo para estabilizar e travar o braço apoiado.'],['14 · Alongamento para os Ombros','Posicione a mão flexionada em uma base, jogue o tronco de forma contrária à mão alongada, fazendo força no cotovelo para estabilizar e travar o braço apoiado.']]},
    {title:'PUNHO E ANTEBRAÇO',items:[['15 · Alongamento para o punho e antebraço','Posicione um braço esticado à sua frente com a mão aberta apontada para cima. Use a outra mão para fazer força contrária na base dos dedos.']]}
  ];

  let pendingHydration=false;
  let pendingHydrationMl=0;
  let forcedPromptToken='';
  let activeStretchPage=0;
  let priorBodyOverflow='';

  const safeEsc=value=>typeof esc==='function'?esc(String(value??'')):String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
  function safeHydration(value){const n=Math.round(Number(value)||0);return Number.isFinite(n)?Math.max(0,Math.min(12000,n)):0;}
  function hydrationText(value){const ml=safeHydration(value);if(!ml)return'Meta de água não definida';const liters=(ml/1000).toLocaleString('pt-BR',{minimumFractionDigits:ml%1000?1:0,maximumFractionDigits:2});return`${liters} L por dia · ${ml.toLocaleString('pt-BR')} ml`;}
  function nutritionHtml(){return`<ul class="tb-nutrition-list">${NUTRITION_GUIDANCE.map(item=>`<li>${safeEsc(item)}</li>`).join('')}</ul>`;}

  function ensureStyles(){
    if(document.getElementById('tb-student-guidance-v2-style'))return;
    const style=document.createElement('style');style.id='tb-student-guidance-v2-style';style.textContent=`
      .tb-guidance-card{border:1px solid rgba(185,43,43,.34);background:linear-gradient(180deg,rgba(43,18,18,.52),rgba(16,16,16,.96));padding:14px 16px;margin:12px 0;border-radius:3px}
      .tb-guidance-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:9px}.tb-guidance-head strong{font:800 15px/1.1 'Barlow Condensed',sans-serif;letter-spacing:.04em;color:#f1e5dc}.tb-guidance-head small{display:block;margin-top:3px;font:500 9px/1.2 'DM Mono',monospace;color:#8f7a70;letter-spacing:.08em}
      .tb-hydration-value{font:900 24px/1 'Barlow Condensed',sans-serif;color:#d8e9ff;margin:8px 0}.tb-hydration-note{font:500 10px/1.45 'DM Mono',monospace;color:#8d8d8d}
      .tb-nutrition-details{margin-top:12px;border-top:1px solid rgba(255,255,255,.08);padding-top:10px}.tb-nutrition-details summary{cursor:pointer;font:800 12px/1 'Barlow Condensed',sans-serif;color:#e5d7cd;letter-spacing:.05em}.tb-nutrition-list{margin:9px 0 0;padding-left:19px}.tb-nutrition-list li{margin:7px 0;color:#d0bfb4;font:500 13px/1.45 'Barlow',sans-serif}.tb-nutrition-list li::marker{color:#b92727}
      .tb-guidance-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.tb-guidance-actions button{min-height:38px}.tb-instruction-static{margin-top:12px}.tb-instruction-static .instruction-item-text{white-space:normal}
      .tb-stretch-overlay{position:fixed;inset:0;z-index:100200;background:#080808;display:none;flex-direction:column;color:#fff;overscroll-behavior:contain}.tb-stretch-overlay.open{display:flex}
      .tb-stretch-head{height:58px;display:flex;align-items:center;gap:12px;padding:0 14px;border-bottom:1px solid rgba(185,43,43,.35);background:#0d0d0d;flex:0 0 auto}.tb-stretch-close,.tb-stretch-nav{appearance:none;border:1px solid rgba(255,255,255,.16);background:#171717;color:#fff;min-width:42px;height:40px;font:700 20px/1 system-ui;cursor:pointer}.tb-stretch-title{min-width:0;flex:1}.tb-stretch-title strong{display:block;font:800 15px/1.1 'Barlow Condensed',sans-serif;letter-spacing:.04em}.tb-stretch-title small{display:block;margin-top:3px;color:#a8a8a8;font:500 10px/1.2 'DM Mono',monospace}.tb-stretch-counter{font:700 11px/1 'DM Mono',monospace;color:#d8d8d8;white-space:nowrap}
      .tb-stretch-track{display:flex;flex:1;min-height:0;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scroll-behavior:smooth;-webkit-overflow-scrolling:touch;background:#111;scrollbar-width:none}.tb-stretch-track::-webkit-scrollbar{display:none}.tb-stretch-page{flex:0 0 100%;height:100%;scroll-snap-align:center;overflow-y:auto;padding:22px;box-sizing:border-box;display:flex;align-items:center;justify-content:center}.tb-stretch-sheet{width:min(820px,100%);min-height:min(760px,calc(100vh - 180px));background:#666;border:1px solid #777;padding:30px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;box-shadow:0 10px 40px rgba(0,0,0,.45)}.tb-stretch-sheet h2{text-align:center;margin:0 0 24px;color:#a80d1f;font:900 30px/1.05 'Barlow Condensed',sans-serif}.tb-stretch-item{display:grid;gap:8px;margin:18px 0;padding:18px;background:rgba(0,0,0,.08);border-left:3px solid #a80d1f}.tb-stretch-item strong{color:#a80d1f;font:900 24px/1.05 'Barlow Condensed',sans-serif}.tb-stretch-item p{margin:0;color:#fff;font:600 18px/1.5 'Barlow',sans-serif}.tb-stretch-source{text-align:center;margin-top:18px;color:#eee;font:500 10px/1.3 'DM Mono',monospace;letter-spacing:.05em}
      .tb-stretch-foot{height:62px;display:grid;grid-template-columns:46px 1fr 46px;align-items:center;gap:10px;padding:0 12px;border-top:1px solid rgba(185,43,43,.35);background:#0d0d0d;flex:0 0 auto}.tb-stretch-dots{display:flex;align-items:center;justify-content:center;gap:5px}.tb-stretch-dot{width:6px;height:6px;border-radius:99px;border:0;padding:0;background:#555}.tb-stretch-dot.active{width:18px;background:#b92727}
      .tb-stretch-home-access{width:100%;margin:10px 0 4px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border:1px solid rgba(185,43,43,.35);background:#151010;color:#eadbd2;text-align:left;cursor:pointer}.tb-stretch-home-access strong{display:block;font:800 14px 'Barlow Condensed',sans-serif}.tb-stretch-home-access small{display:block;color:#8d7770;font:500 9px 'DM Mono',monospace;margin-top:3px}
      @media(max-width:720px){.tb-guidance-actions{display:grid;grid-template-columns:1fr}.tb-nutrition-list li{font-size:12px}.tb-hydration-value{font-size:22px}.tb-stretch-page{padding:10px}.tb-stretch-sheet{padding:18px;min-height:calc(100vh - 150px)}.tb-stretch-sheet h2{font-size:25px}.tb-stretch-item strong{font-size:21px}.tb-stretch-item p{font-size:16px}}
    `;document.head.appendChild(style);
  }

  function ensureHydrationField(){
    const modal=document.getElementById('modal-diet');if(!modal||document.getElementById('input-diet-hydration-ml'))return;
    const anchor=modal.querySelector('.diet-energy-editor');if(!anchor)return;
    const group=document.createElement('div');group.id='tb-diet-hydration-editor';group.className='diet-free-meal-editor';
    group.innerHTML='<div class="diet-free-meal-editor-title">HIDRATAÇÃO</div><label class="form-group"><span class="form-label">Quantidade de água por dia</span><input class="form-input" id="input-diet-hydration-ml" type="number" min="0" max="12000" step="100" inputmode="numeric" placeholder="Ex.: 3500"/><small>Meta em ml/dia · 3500 ml = 3,5 L</small></label><div class="plan-help">Use zero ou deixe vazio quando ainda não houver uma quantidade individual definida.</div>';
    anchor.insertAdjacentElement('afterend',group);
  }

  function patchDietModel(){
    if(typeof normalizeDietPlan==='function'&&!normalizeDietPlan.__tbHydrationV2){
      const base=normalizeDietPlan;const wrapped=function(plan,index=0){const result=base(plan,index);const raw=plan&&typeof plan==='object'?plan:{};result.hydrationMl=safeHydration(raw.hydrationMl??raw.waterMl??raw.dailyWaterMl??result.hydrationMl);return result;};wrapped.__tbHydrationV2=true;normalizeDietPlan=wrapped;
    }
    if(typeof persistDietDocument==='function'&&!persistDietDocument.__tbHydrationV2){
      const base=persistDietDocument;const wrapped=async function(){
        if(pendingHydration){const id=String(typeof EDIT_DIET_PLAN_ID!=='undefined'&&EDIT_DIET_PLAN_ID?EDIT_DIET_PLAN_ID:(typeof CURRENT_DIET_ID!=='undefined'?CURRENT_DIET_ID:''));const plan=DIET_DOCUMENT?.plans?.find(item=>String(item.id)===id);if(plan)plan.hydrationMl=pendingHydrationMl;}
        return base.apply(this,arguments);
      };wrapped.__tbHydrationV2=true;persistDietDocument=wrapped;
    }
    if(typeof openAddDietModal==='function'&&!openAddDietModal.__tbHydrationV2){const base=openAddDietModal;const wrapped=function(){ensureHydrationField();const result=base.apply(this,arguments);const field=document.getElementById('input-diet-hydration-ml');if(field)field.value='';return result;};wrapped.__tbHydrationV2=true;openAddDietModal=wrapped;}
    if(typeof openEditDietModal==='function'&&!openEditDietModal.__tbHydrationV2){const base=openEditDietModal;const wrapped=function(id=CURRENT_DIET_ID){ensureHydrationField();const result=base.apply(this,arguments);const plan=DIET_DOCUMENT?.plans?.find(item=>String(item.id)===String(id));const field=document.getElementById('input-diet-hydration-ml');if(field)field.value=safeHydration(plan?.hydrationMl)||'';return result;};wrapped.__tbHydrationV2=true;openEditDietModal=wrapped;}
    if(typeof saveDietPlan==='function'&&!saveDietPlan.__tbHydrationV2){const base=saveDietPlan;const wrapped=async function(){ensureHydrationField();pendingHydrationMl=safeHydration(document.getElementById('input-diet-hydration-ml')?.value);pendingHydration=true;try{return await base.apply(this,arguments);}finally{pendingHydration=false;renderDietGuidance();}};wrapped.__tbHydrationV2=true;saveDietPlan=wrapped;}
    if(typeof openDietDetail==='function'&&!openDietDetail.__tbGuidanceV2){const base=openDietDetail;const wrapped=async function(){const result=await base.apply(this,arguments);renderDietGuidance();return result;};wrapped.__tbGuidanceV2=true;openDietDetail=wrapped;}
  }

  function guidanceCard(plan,trainer){
    const id=typeof jsArg==='function'?jsArg(plan.id):JSON.stringify(plan.id);
    return`<section class="tb-guidance-card" data-tb-diet-guidance="1"><div class="tb-guidance-head"><div><strong>ÁGUA E ORIENTAÇÕES DA DIETA</strong><small>ACESSO RÁPIDO</small></div>${trainer?`<button class="section-mini-btn" type="button" onclick="openEditDietModal(${id})">EDITAR META</button>`:''}</div><div class="tb-hydration-value">${safeEsc(hydrationText(plan.hydrationMl))}</div><div class="tb-hydration-note">Quantidade diária prescrita. Distribua ao longo do dia, salvo orientação individual diferente do treinador.</div><details class="tb-nutrition-details"><summary>VER OBSERVAÇÕES E ORIENTAÇÕES DA DIETA</summary>${nutritionHtml()}</details><div class="tb-guidance-actions"><button class="btn-ghost" type="button" onclick="openStretchGuide()">ALONGAMENTOS</button><button class="btn-ghost" type="button" onclick="openInstructions()">INSTRUÇÕES GERAIS</button></div></section>`;
  }
  function renderDietGuidance(){try{const plan=typeof currentDiet==='function'?currentDiet():null;if(!plan)return;const trainer=!!(typeof DIET_CONTEXT!=='undefined'&&DIET_CONTEXT.trainer);const host=document.getElementById(trainer?'ts-diet-energy-summary':'diet-energy-summary');if(!host)return;host.parentElement?.querySelector('[data-tb-diet-guidance="1"]')?.remove();host.insertAdjacentHTML('afterend',guidanceCard(plan,trainer));}catch(error){console.warn('[Team Bulls] Orientações da dieta indisponíveis',error);}}

  function renderStaticInstructions(){
    const host=document.getElementById('instructions-folders');if(!host)return;host.querySelector('#tb-static-nutrition-instructions')?.remove();
    const section=document.createElement('section');section.id='tb-static-nutrition-instructions';section.className='instruction-folder tb-instruction-static';section.innerHTML=`<div class="instruction-folder-head"><div class="instruction-folder-icon">🍴</div><div class="instruction-folder-title">Alimentação · observações e orientações</div></div><article class="instruction-item"><div class="instruction-item-title-row"><div class="instruction-item-title">Orientações para preparo e escolhas alimentares</div></div><div class="instruction-item-text">${nutritionHtml()}</div><div class="tb-guidance-actions"><button class="btn-ghost" type="button" onclick="openStretchGuide()">ABRIR PLANILHA DE ALONGAMENTOS</button></div></article>`;host.appendChild(section);
  }
  function patchInstructionsRender(){if(typeof renderInstructions==='function'&&!renderInstructions.__tbStaticGuidanceV2){const base=renderInstructions;const wrapped=function(){const result=base.apply(this,arguments);renderStaticInstructions();return result;};wrapped.__tbStaticGuidanceV2=true;renderInstructions=wrapped;}}

  function instructionIdentity(){try{return String(CURRENT_USER?.uid||LOCAL_OWNER_UID||LOCAL_GUEST_OWNER||'');}catch(error){return'';}}
  function instructionToken(){try{return String(GENERAL_INSTRUCTIONS?.revision||1)+'|'+STATIC_REVISION;}catch(error){return'1|'+STATIC_REVISION;}}
  function ackKey(uid=instructionIdentity()){return ACK_PREFIX+uid;}
  function instructionAcknowledged(){const uid=instructionIdentity();return !!uid&&typeof storageGet==='function'&&storageGet(ackKey(uid))===instructionToken();}
  function markInstructionAcknowledged(){const uid=instructionIdentity();if(!uid)return false;const token=instructionToken();storageSet?.(ackKey(uid),token);if(typeof instructionAckKey==='function')storageSet?.(instructionAckKey(),String(GENERAL_INSTRUCTIONS?.revision||1));return true;}
  function patchInstructionPrompt(){
    if(typeof openInstructions==='function'&&!openInstructions.__tbPromptV2){
      const base=openInstructions;
      const wrapped=async function(forced=false){
        let token='';
        if(forced&&CURRENT_USER?.role!=='trainer'){if(instructionAcknowledged())return false;token=instructionIdentity()+'|'+instructionToken();if(forcedPromptToken===token&&document.getElementById('screen-instructions')?.classList.contains('active'))return false;forcedPromptToken=token;}
        try{const result=await base.apply(this,arguments);if(result===false&&token&&forcedPromptToken===token)forcedPromptToken='';return result;}
        catch(error){if(token&&forcedPromptToken===token)forcedPromptToken='';throw error;}
      };wrapped.__tbPromptV2=true;openInstructions=wrapped;
    }
    if(typeof maybePromptInitialInstructions==='function'&&!maybePromptInitialInstructions.__tbPromptV2){
      const wrapped=async function(){
        if((typeof INSTRUCTIONS_PROMPT_RUNNING!=='undefined'&&INSTRUCTIONS_PROMPT_RUNNING)||CURRENT_USER?.role==='trainer'||typeof activeScreenId==='function'&&activeScreenId()!=='screen-home'||instructionAcknowledged())return;
        const uid=instructionIdentity();if(!uid)return;
        const navigation=NAVIGATION_SEQ,role=CURRENT_USER?.role,mode=MODE;
        if(typeof INSTRUCTIONS_PROMPT_RUNNING!=='undefined')INSTRUCTIONS_PROMPT_RUNNING=true;
        try{
          await loadGeneralInstructions?.();
          if(NAVIGATION_SEQ!==navigation||instructionIdentity()!==uid||CURRENT_USER?.role!==role||MODE!==mode||activeScreenId()!=='screen-home')return false;
          if(!visibleInstructionCount?.()||instructionAcknowledged()){forcedPromptToken='';return false;}
          const token=uid+'|'+instructionToken();if(forcedPromptToken===token)return false;
          forcedPromptToken=token;const result=await openInstructions(true);if(result===false&&forcedPromptToken===token)forcedPromptToken='';return result;
        }catch(error){console.warn('[Team Bulls] Falha ao abrir orientações iniciais',error);forcedPromptToken='';return false;}
        finally{if(typeof INSTRUCTIONS_PROMPT_RUNNING!=='undefined')INSTRUCTIONS_PROMPT_RUNNING=false;}
      };wrapped.__tbPromptV2=true;maybePromptInitialInstructions=wrapped;
    }
    if(typeof acknowledgeInstructions==='function'&&!acknowledgeInstructions.__tbPromptV2){const base=acknowledgeInstructions;const wrapped=function(){markInstructionAcknowledged();forcedPromptToken='';return base.apply(this,arguments);};wrapped.__tbPromptV2=true;acknowledgeInstructions=wrapped;}
  }

  function stretchPageHtml(page,index){return`<section class="tb-stretch-page" data-page="${index}"><div class="tb-stretch-sheet"><h2>${safeEsc(page.title)}</h2>${page.items.map(item=>`<article class="tb-stretch-item"><strong>${safeEsc(item[0])}</strong><p>${safeEsc(item[1])}</p></article>`).join('')}<div class="tb-stretch-source">TEAM BULLS · PLANILHA DE ALONGAMENTOS · PÁGINA ${index+1}/${STRETCH_PAGES.length}</div></div></section>`;}
  function ensureStretchViewer(){
    ensureStyles();let overlay=document.getElementById('tb-stretch-viewer');if(overlay)return overlay;
    overlay=document.createElement('div');overlay.id='tb-stretch-viewer';overlay.className='tb-stretch-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Planilha de alongamentos');overlay.innerHTML=`<div class="tb-stretch-head"><button type="button" class="tb-stretch-close" aria-label="Fechar alongamentos">×</button><div class="tb-stretch-title"><strong>ALONGAMENTOS</strong><small>Deslize para o lado para avançar</small></div><span class="tb-stretch-counter" aria-live="polite">1 / ${STRETCH_PAGES.length}</span></div><div class="tb-stretch-track">${STRETCH_PAGES.map(stretchPageHtml).join('')}</div><div class="tb-stretch-foot"><button type="button" class="tb-stretch-nav tb-stretch-prev" aria-label="Página anterior">‹</button><div class="tb-stretch-dots">${STRETCH_PAGES.map((_,i)=>`<button type="button" class="tb-stretch-dot${i?'':' active'}" data-page="${i}" aria-label="Ir para página ${i+1}"></button>`).join('')}</div><button type="button" class="tb-stretch-nav tb-stretch-next" aria-label="Próxima página">›</button></div>`;document.body.appendChild(overlay);
    const track=overlay.querySelector('.tb-stretch-track');
    const update=()=>{const index=Math.max(0,Math.min(STRETCH_PAGES.length-1,Math.round(track.scrollLeft/Math.max(1,track.clientWidth))));activeStretchPage=index;overlay.querySelector('.tb-stretch-counter').textContent=`${index+1} / ${STRETCH_PAGES.length}`;overlay.querySelectorAll('.tb-stretch-dot').forEach((dot,i)=>dot.classList.toggle('active',i===index));overlay.querySelector('.tb-stretch-prev').disabled=index===0;overlay.querySelector('.tb-stretch-next').disabled=index===STRETCH_PAGES.length-1;};
    const go=index=>{activeStretchPage=Math.max(0,Math.min(STRETCH_PAGES.length-1,index));track.scrollTo({left:activeStretchPage*track.clientWidth,behavior:'smooth'});setTimeout(update,120);};
    overlay.querySelector('.tb-stretch-close').addEventListener('click',closeStretchGuide);overlay.querySelector('.tb-stretch-prev').addEventListener('click',()=>go(activeStretchPage-1));overlay.querySelector('.tb-stretch-next').addEventListener('click',()=>go(activeStretchPage+1));overlay.querySelectorAll('.tb-stretch-dot').forEach(dot=>dot.addEventListener('click',()=>go(Number(dot.dataset.page)||0)));track.addEventListener('scroll',()=>requestAnimationFrame(update),{passive:true});window.addEventListener('keydown',event=>{if(!overlay.classList.contains('open'))return;if(event.key==='Escape')closeStretchGuide();else if(event.key==='ArrowLeft')go(activeStretchPage-1);else if(event.key==='ArrowRight')go(activeStretchPage+1);});update();return overlay;
  }
  function openStretchGuide(page=0){const overlay=ensureStretchViewer(),track=overlay.querySelector('.tb-stretch-track');activeStretchPage=Math.max(0,Math.min(STRETCH_PAGES.length-1,Number(page)||0));priorBodyOverflow=document.body.style.overflow;document.body.style.overflow='hidden';overlay.classList.add('open');requestAnimationFrame(()=>{track.scrollLeft=activeStretchPage*track.clientWidth;overlay.querySelector('.tb-stretch-close')?.focus();});return false;}
  function closeStretchGuide(){const overlay=document.getElementById('tb-stretch-viewer');if(!overlay)return;overlay.classList.remove('open');document.body.style.overflow=priorBodyOverflow;}

  function patchEntryPoints(){
    const nav=document.getElementById('student-desktop-nav');if(nav&&!nav.querySelector('[data-tb-stretch-nav]')){const reference=Array.from(nav.querySelectorAll('button')).find(button=>button.textContent.includes('INSTRUÇÕES'));const button=document.createElement('button');button.type='button';button.dataset.tbStretchNav='1';button.innerHTML='<span aria-hidden="true" class="nav-icon">↔</span><span class="nav-label">ALONGAMENTOS</span>';button.onclick=()=>openStretchGuide();reference?.insertAdjacentElement('afterend',button)||nav.appendChild(button);}
    const home=document.querySelector('#screen-home .content')||document.querySelector('#screen-home');if(home&&!home.querySelector('[data-tb-stretch-home]')){const button=document.createElement('button');button.type='button';button.dataset.tbStretchHome='1';button.className='tb-stretch-home-access';button.innerHTML='<span><strong>ALONGAMENTOS</strong><small>PLANILHA DE CONSULTA · 15 POSIÇÕES</small></span><span aria-hidden="true">ABRIR ›</span>';button.onclick=()=>openStretchGuide();const workout=document.getElementById('workout-list');workout?.parentElement?.insertBefore(button,workout)||home.appendChild(button);}
  }

  function install(){ensureStyles();ensureHydrationField();patchDietModel();patchInstructionsRender();patchInstructionPrompt();patchEntryPoints();ensureStretchViewer();renderStaticInstructions();renderDietGuidance();window.openStretchGuide=openStretchGuide;window.closeStretchGuide=closeStretchGuide;window.TeamBullsStudentGuidance=Object.freeze({version:VERSION,refresh:()=>{ensureHydrationField();renderStaticInstructions();renderDietGuidance();patchEntryPoints();},openStretchGuide});}
  install();
})();