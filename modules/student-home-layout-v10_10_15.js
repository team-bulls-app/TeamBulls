/* Team Bulls v10.10.21 — Home/hotbar do aluno orientadas pelo contexto real do app. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_STUDENT_HOME_LAYOUT_10_10_21__)return;
  window.__TEAM_BULLS_STUDENT_HOME_LAYOUT_10_10_21__=true;

  /* Impede que cópias antigas desta camada sejam executadas depois. */
  window.__TEAM_BULLS_STUDENT_HOME_LAYOUT_10_10_20__=true;
  window.__TEAM_BULLS_STUDENT_HOME_LAYOUT_10_10_19__=true;
  window.__TEAM_BULLS_STUDENT_HOME_LAYOUT_10_10_17__=true;
  window.__TEAM_BULLS_STUDENT_HOME_LAYOUT_10_10_15__=true;

  const VERSION='10.10.21-home4';
  const REFRESH_TTL=30000;
  const MAX_FEEDBACKS=5;
  const MAX_WEIGHT_POINTS=10;
  let refreshSequence=0;
  let lastRefreshAt=0;
  let lastRefreshUid='';
  let lastRenderedUid='';
  let hasRenderedContext=false;
  let hotbarIntent='home';
  let feedbackOrderedQueryState='unknown';
  let weightOrderedQueryState='unknown';
  let observer=null;
  let syncFrame=0;

  const currentUser=()=>{try{return typeof CURRENT_USER!=='undefined'?CURRENT_USER:null;}catch(error){return null;}};
  const coreMode=()=>{try{return typeof MODE!=='undefined'?MODE:'';}catch(error){return'';}};
  const accessMode=()=>{try{return typeof ACCESS_MODE!=='undefined'?ACCESS_MODE:'';}catch(error){return'';}};
  const activeScreen=()=>document.querySelector('.screen.active')?.id||'';
  const isTrainerContext=()=>currentUser()?.role==='trainer'||document.body.classList.contains('trainer-desktop');
  const isStudentContext=()=>{
    if(isTrainerContext())return false;
    const screen=activeScreen();
    if(screen==='screen-auth'||screen==='screen-loading'||screen.includes('trainer')||screen.startsWith('screen-ts-'))return false;
    if(document.body.classList.contains('student-desktop'))return true;
    if(currentUser()?.role==='student')return true;
    const access=accessMode();
    return coreMode()==='local'||access==='offline-registered'||access==='local-inactive';
  };
  const studentUid=()=>{
    const user=currentUser();
    if(user?.role==='student'&&user?.uid)return String(user.uid);
    try{
      const uid=window.firebase?.auth?.().currentUser?.uid;
      if(uid&&isStudentContext())return String(uid);
    }catch(error){}
    return'';
  };
  const cloudReady=()=>{
    try{return isStudentContext()&&coreMode()==='cloud'&&typeof db!=='undefined'&&!!db;}catch(error){return false;}
  };
  const createdMillis=value=>{try{if(value?.toMillis)return value.toMillis();if(value?.toDate)return value.toDate().getTime();const ms=new Date(value||0).getTime();return Number.isFinite(ms)?ms:0;}catch(error){return 0;}};
  const validIso=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
  const fmtDate=value=>{
    const raw=String(value||'');
    if(validIso(raw)){const [year,month,day]=raw.split('-');return `${day}/${month}/${year}`;}
    const ms=createdMillis(value);return ms?new Date(ms).toLocaleDateString('pt-BR'):'—';
  };

  function ensureStyles(){
    if(document.getElementById('tb-student-home-v17-style'))return;
    const style=document.createElement('style');
    style.id='tb-student-home-v17-style';
    style.textContent=`
      html.tb-student-home-v17 body.student-desktop .student-desktop-nav{display:none!important}
      html.tb-student-home-v17 body.student-desktop #app{margin-left:0!important;width:100%!important;max-width:none!important}
      html.tb-student-home-v17 #screen-home.tb-home-v17-screen .quick-nav{display:none!important}
      html.tb-student-home-v17 .tb-hotbar-shell{display:none!important}
      #screen-home.tb-home-v17-screen #home-stats{align-items:stretch}
      #screen-home.tb-home-v17-screen #home-stats>.stat-cell{position:relative;display:flex;flex-direction:column;justify-content:center;min-height:116px!important;padding-bottom:13px!important;border-color:#47382f;background:linear-gradient(155deg,#171412,#0f0f0e 72%)}
      .tb-v17-next{display:block;margin:9px -1px -2px;padding:7px 5px 0;border-top:1px solid #302822;font:500 7px/1.45 'DM Mono',monospace;color:#776b62;letter-spacing:.55px;text-transform:uppercase}
      .tb-v17-next strong{display:block;margin-top:2px;color:#d0c0b3;font:500 9px/1.35 'DM Mono',monospace;letter-spacing:.35px}
      .tb-v17-next[data-state="pending"] strong{color:#d56b75}
      .tb-v17-intelligence{padding:2px 18px 18px}
      .tb-v17-section-head{display:flex;align-items:center;gap:8px;margin:16px 0 9px}
      .tb-v17-section-head::before{content:'';width:13px;height:2px;background:#7e292f;box-shadow:0 0 8px rgba(225,29,72,.18)}
      .tb-v17-section-head strong{font:500 9px 'DM Mono',monospace;color:#918178;letter-spacing:1.2px;text-transform:uppercase}
      .tb-v17-section-head span{margin-left:auto;font:400 7px 'DM Mono',monospace;color:#584f49;letter-spacing:.65px;text-transform:uppercase}
      .tb-v17-feedbacks{display:grid;gap:7px}
      .tb-v17-feedback{border:1px solid #3b302a;background:linear-gradient(145deg,#151311,#0e0e0d 74%);border-radius:8px;overflow:hidden}
      .tb-v17-feedback[data-unread="true"]{border-color:#603039;box-shadow:inset 3px 0 #9f2834}
      .tb-v17-feedback-toggle{width:100%;display:flex;align-items:flex-start;gap:9px;padding:10px 11px;border:0;background:transparent;color:#eee;text-align:left;cursor:pointer}
      .tb-v17-feedback-index{width:24px;height:24px;flex:0 0 24px;display:grid;place-items:center;border:1px solid #493a32;background:#0d0c0b;color:#a59589;font:500 7px 'DM Mono',monospace}
      .tb-v17-feedback-copy{min-width:0;flex:1}
      .tb-v17-feedback-copy strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font:700 15px/1.15 'Barlow Condensed',sans-serif;color:#e7ddd5;letter-spacing:.2px}
      .tb-v17-feedback-copy small{display:block;margin-top:3px;font:400 7px/1.4 'DM Mono',monospace;color:#746860;letter-spacing:.45px;text-transform:uppercase}
      .tb-v17-feedback-chevron{padding-top:2px;color:#87786d;font:500 10px 'DM Mono',monospace}
      .tb-v17-feedback-body{display:none;padding:0 12px 12px 44px;color:#c8bbb2;font:400 12px/1.5 'Barlow',sans-serif;white-space:pre-wrap;overflow-wrap:anywhere}
      .tb-v17-feedback.is-open .tb-v17-feedback-body{display:block}
      .tb-v17-empty{padding:14px 12px;border:1px dashed #392f29;background:#0e0d0c;color:#70645c;font:400 8px/1.5 'DM Mono',monospace;letter-spacing:.5px;text-align:center;text-transform:uppercase}
      .tb-v17-weight-panel{border:1px solid #3d322c;background:linear-gradient(150deg,#151311,#0d0d0c 78%);border-radius:9px;padding:11px}
      .tb-v17-weight-summary{display:flex;align-items:flex-end;gap:12px;margin-bottom:8px}
      .tb-v17-weight-current{font:800 27px/1 'Barlow Condensed',sans-serif;color:#dfd3ca}
      .tb-v17-weight-current small{font:500 9px 'DM Mono',monospace;color:#776b63;margin-left:3px}
      .tb-v17-weight-delta{margin-left:auto;font:500 8px 'DM Mono',monospace;color:#a09288;letter-spacing:.4px}
      .tb-v17-weight-chart{width:100%;height:150px;display:block;background:#0c0b0a;border:1px solid #302722}
      .tb-v17-hotbar-shell{position:fixed;z-index:98;left:50%;transform:translateX(-50%);bottom:0;width:min(760px,calc(100% - 18px));padding:8px 9px calc(8px + env(safe-area-inset-bottom));background:linear-gradient(180deg,rgba(8,8,8,0),rgba(8,8,8,.98) 22%);pointer-events:none}
      .tb-v17-hotbar-shell[hidden]{display:none!important}
      .tb-v17-hotbar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px;padding:5px;border:1px solid #4d3c32;background:#0c0b0a;border-radius:10px;box-shadow:0 12px 34px rgba(0,0,0,.58);pointer-events:auto}
      .tb-v17-hotbar button{min-width:0;height:58px;border:1px solid transparent;border-radius:7px;background:transparent;color:#80736a;padding:5px 2px;font:500 6.5px/1.1 'DM Mono',monospace;letter-spacing:.2px;text-transform:uppercase;cursor:pointer}
      .tb-v17-hotbar button span{display:block;white-space:normal;overflow-wrap:anywhere}
      .tb-v17-hotbar button svg{display:block;width:18px;height:18px;margin:0 auto 5px;fill:none;stroke:#b2a297;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
      .tb-v17-hotbar button.is-active{border-color:#60463b;background:#181210;color:#ded0c5}
      .tb-v17-hotbar button.is-active svg{stroke:#eadcd1}
      #screen-diet-detail .tb-supply-options-header-btn{width:auto;max-width:min(190px,48vw);height:36px;padding:0 8px;gap:6px;display:inline-flex;align-items:center;justify-content:flex-start;color:#b7a89d;border:1px solid transparent;border-radius:8px;font:500 8px/1.15 'DM Mono',monospace;letter-spacing:.25px;white-space:nowrap}
      #screen-diet-detail .tb-supply-options-header-btn svg{width:18px;height:18px;flex:0 0 18px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
      #screen-diet-detail .tb-supply-options-header-btn span{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis}
      #screen-diet-detail .tb-supply-options-header-btn:hover,#screen-diet-detail .tb-supply-options-header-btn:focus-visible{color:#eadcd1;border-color:#4a3931;background:#171210}
      html.tb-student-home-v17 #app{padding-bottom:max(94px,calc(82px + env(safe-area-inset-bottom)))}
      html.tb-student-home-v17 .screen{padding-bottom:max(114px,calc(102px + env(safe-area-inset-bottom)))}
      @media(min-width:900px) and (pointer:fine){
        html.tb-student-home-v17 body.student-desktop .content,
        html.tb-student-home-v17 body.student-desktop .home-hero,
        html.tb-student-home-v17 body.student-desktop .stats-grid,
        html.tb-student-home-v17 body.student-desktop .tb-v17-intelligence{max-width:1420px;margin-left:auto;margin-right:auto}
      }
      @media(max-width:420px){.tb-v17-hotbar-shell{width:100%;padding-left:4px;padding-right:4px}.tb-v17-hotbar{gap:1px;padding:4px}.tb-v17-hotbar button{font-size:5.7px;letter-spacing:0;padding-left:1px;padding-right:1px}.tb-v17-hotbar button svg{width:17px;height:17px}#screen-diet-detail .tb-supply-options-header-btn{max-width:145px;padding:0 5px;gap:4px;font-size:6.6px;letter-spacing:0}#screen-diet-detail .tb-supply-options-header-btn svg{width:16px;height:16px;flex-basis:16px}}
    `;
    document.head.appendChild(style);
  }

  function svgIcon(name){
    const paths={
      home:'<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13V10.5"/>',
      workout:'<path d="M4 9v6M7 7v10M10 10v4M14 10v4M17 7v10M20 9v6M10 12h4"/>',
      diet:'<path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M16 3v18M16 3c3 2 4 5 4 8h-4"/>',
      supplements:'<path d="M9 3h6M10 3v4l-4 5v7h12v-7l-4-5V3"/><path d="M7 14h10"/>',
      options:'<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
      instructions:'<path d="M2.5 5.5A4 4 0 0 1 6.5 4H11v15H6.5a4 4 0 0 0-4 2z"/><path d="M21.5 5.5A4 4 0 0 0 17.5 4H13v15h4.5a4 4 0 0 1 4 2z"/>',
      reports:'<path d="M6 2h9l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]||''}</svg>`;
  }

  function supplyOptionsIcon(){
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8c-4.1-2.7-8 .6-7.4 5.5C5.2 18.5 8.2 21 12 21s6.8-2.5 7.4-7.5C20 8.6 16.1 5.3 12 8Z"/><path d="M12 8c-.1-2.7 1.1-4.6 3.7-5.7"/><path d="M14.1 4.2c1.8-.8 3.6-.5 4.7.4-1 1.8-2.9 2.7-5 2.3"/></svg>';
  }

  function patchSupplyOptionsHeader(){
    if(!isStudentContext())return false;
    const button=document.querySelector('#screen-diet-detail .header button[onclick*="openFoodOptionsFromDiet"]');
    if(!button)return false;
    button.classList.add('tb-supply-options-header-btn');
    button.title='Opções de suprimentos';
    button.setAttribute('aria-label','Opções de suprimentos');
    if(button.dataset.tbSupplyOptionsHeader!=='1'){
      button.innerHTML=supplyOptionsIcon()+'<span>Opções de suprimentos</span>';
      button.dataset.tbSupplyOptionsHeader='1';
    }
    return true;
  }

  async function openStudentSupplements(){
    hotbarIntent='supplements';
    if(typeof openMeals!=='function')return;
    await Promise.resolve(openMeals());
    let plan=null;
    try{
      const plans=typeof DIET_DOCUMENT!=='undefined'&&Array.isArray(DIET_DOCUMENT?.plans)?DIET_DOCUMENT.plans:[];
      plan=plans.find(item=>item?.isActive)||plans[0]||null;
    }catch(error){}
    if(!plan||typeof openDietDetail!=='function')return;
    await Promise.resolve(openDietDetail(plan.id,false));
    requestAnimationFrame(()=>setTimeout(()=>{
      document.querySelector('#screen-diet-detail .diet-support-section')?.scrollIntoView({behavior:'smooth',block:'start'});
      setHotbarActive('supplements');
    },60));
  }

  function ensureHotbar(){
    let shell=document.getElementById('tb-v17-hotbar-shell');
    if(shell)return shell;
    shell=document.createElement('div');
    shell.id='tb-v17-hotbar-shell';
    shell.className='tb-v17-hotbar-shell';
    shell.hidden=true;
    shell.setAttribute('aria-label','Navegação principal do aluno');
    const nav=document.createElement('nav');
    nav.className='tb-v17-hotbar';
    const items=[
      ['home','INÍCIO','INÍCIO',()=>{hotbarIntent='home';if(typeof goHome==='function')goHome();}],
      ['workout','TREINO','TREINO',()=>{hotbarIntent='workout';if(typeof goHome==='function')goHome();setTimeout(()=>{(document.getElementById('workout-list')||document.getElementById('home-workouts'))?.scrollIntoView({behavior:'smooth',block:'start'});setHotbarActive('workout');},100);}],
      ['diet','DIETA','DIETA',()=>{hotbarIntent='diet';if(typeof openMeals==='function')openMeals();}],
      ['instructions','INSTRUÇÕES','INSTRUÇ.',()=>{hotbarIntent='instructions';if(typeof openInstructions==='function')openInstructions();}],
      ['supplements','SUPRIMENTOS','SUPLEM.',()=>openStudentSupplements()],
      ['options','OPÇÕES DE SUPRIMENTOS','OPÇÕES',()=>{hotbarIntent='options';if(typeof openFoodOptions==='function')openFoodOptions();}],
      ['reports','RELATÓRIOS','RELATÓR.',()=>{hotbarIntent='reports';if(typeof openMyQuestionnaires==='function')openMyQuestionnaires();}]
    ];
    items.forEach(([key,label,shortLabel,action])=>{
      const button=document.createElement('button');
      button.type='button';button.dataset.hotbar=key;button.setAttribute('aria-label',label);button.title=label;button.innerHTML=svgIcon(key)+`<span>${shortLabel}</span>`;button.addEventListener('click',action);nav.appendChild(button);
    });
    shell.appendChild(nav);document.body.appendChild(shell);return shell;
  }

  function setHotbarActive(key){document.querySelectorAll('.tb-v17-hotbar button').forEach(button=>button.classList.toggle('is-active',button.dataset.hotbar===key));}
  function hotbarKeyForScreen(id){
    const screen=String(id||'');
    if(screen==='screen-home')return hotbarIntent==='workout'?'workout':'home';
    if(screen==='screen-meals')return'diet';
    if(screen==='screen-diet-detail')return hotbarIntent==='supplements'?'supplements':'diet';
    if(screen==='screen-food-options')return'options';
    if(screen.includes('diet'))return hotbarIntent==='supplements'?'supplements':'diet';
    if(screen==='screen-instructions')return'instructions';
    if(screen==='screen-my-quest'||screen.includes('questionnaire')||screen.includes('weekly-checkin'))return'reports';
    if(/(?:workout|exercise|screen-day$|screen-day-)/.test(screen)&&!screen.includes('trainer')&&!screen.includes('ts-'))return'workout';
    return'';
  }

  function ensureStudentDietLabel(){
    const title=document.querySelector('#screen-meals .header-title');
    if(title&&String(title.textContent||'').trim().toUpperCase()==='SUPRIMENTOS')title.textContent='DIETAS';
  }

  function ensureNextDateSlots(){
    const stats=document.getElementById('home-stats');if(!stats)return[];
    const cells=[...stats.querySelectorAll(':scope > .stat-cell')];if(cells.length<2)return[];
    cells.slice(0,2).forEach((cell,index)=>{
      let slot=cell.querySelector('.tb-v17-next');
      if(!slot){slot=document.createElement('span');slot.className='tb-v17-next';slot.dataset.kind=index===0?'training':'diet';const label=document.createElement('span'),strong=document.createElement('strong');label.textContent=index===0?'PRÓXIMA ATUALIZAÇÃO':'PRÓXIMO PROTOCOLO';strong.textContent='CARREGANDO...';slot.append(label,strong);cell.appendChild(slot);}
    });
    return cells.slice(0,2).map(cell=>cell.querySelector('.tb-v17-next'));
  }

  function ensureInsights(){
    const home=document.getElementById('screen-home'),stats=document.getElementById('home-stats');if(!home||!stats)return null;
    home.classList.add('tb-home-v17-screen');
    ensureNextDateSlots();
    let host=document.getElementById('tb-v17-intelligence');
    if(host)return host;
    host=document.createElement('section');host.id='tb-v17-intelligence';host.className='tb-v17-intelligence';
    const feedbackHead=document.createElement('div');feedbackHead.className='tb-v17-section-head';feedbackHead.innerHTML='<strong>FEEDBACKS DO TREINADOR</strong><span>TRANSMISSÕES</span>';
    const feedbacks=document.createElement('div');feedbacks.id='tb-v17-feedbacks';feedbacks.className='tb-v17-feedbacks';
    const weightHead=document.createElement('div');weightHead.className='tb-v17-section-head';weightHead.innerHTML='<strong>EVOLUÇÃO DO PESO</strong><span>HISTÓRICO</span>';
    const weight=document.createElement('div');weight.id='tb-v17-weight';
    host.append(feedbackHead,feedbacks,weightHead,weight);
    stats.insertAdjacentElement('afterend',host);
    return host;
  }

  function fallbackProtocolDate(){
    const text=String(document.getElementById('workout-list')?.textContent||document.getElementById('screen-home')?.textContent||'');
    const match=text.match(/atualiza(?:ção|cao)\s+(\d{2}\/\d{2}\/\d{4})/i);
    return match?.[1]||'A DEFINIR';
  }

  async function refreshProtocolDate(uid,sequence){
    const slots=ensureNextDateSlots();if(slots.length<2)return;
    let date=fallbackProtocolDate(),pending=false;
    try{
      if(uid&&typeof loadProtocolReviewSchedule==='function'&&typeof v109ProtocolState==='function'){
        const schedule=await loadProtocolReviewSchedule(uid,true),state=v109ProtocolState(schedule);if(state?.nextDueDate)date=fmtDate(state.nextDueDate);pending=!!state?.pending;
      }
    }catch(error){console.warn('[Team Bulls] Data de protocolo indisponível',error);}
    if(sequence!==refreshSequence)return;
    slots.forEach((slot,index)=>{if(!slot)return;slot.dataset.state=pending?'pending':'scheduled';const label=slot.querySelector('span'),strong=slot.querySelector('strong');if(label)label.textContent=pending?'ATUALIZAÇÃO PENDENTE DESDE':index===0?'PRÓXIMA ATUALIZAÇÃO':'PRÓXIMO PROTOCOLO';if(strong)strong.textContent=date;});
  }

  function orderedQueryNeedsFallback(error){
    const code=String(error?.code||'').toLowerCase(),message=String(error?.message||'').toLowerCase();
    return code.includes('failed-precondition')||code.includes('unimplemented')||code.includes('invalid-argument')||message.includes('index');
  }

  async function fetchFeedbacks(uid){
    if(!uid||!cloudReady())return null;
    const base=db.collection('feedback').where('studentId','==',uid);
    try{
      if(feedbackOrderedQueryState!=='unsupported'){
        try{
          const snap=await base.orderBy('createdAt','desc').limit(MAX_FEEDBACKS).get();
          feedbackOrderedQueryState='supported';
          return snap.docs.map(doc=>({...doc.data(),id:doc.id}));
        }catch(error){
          if(!orderedQueryNeedsFallback(error))throw error;
          feedbackOrderedQueryState='unsupported';
          console.info('[Team Bulls] Índice de feedback indisponível; usando leitura compatível.');
        }
      }
      const snap=await base.get();
      return snap.docs.map(doc=>({...doc.data(),id:doc.id})).sort((a,b)=>createdMillis(b.createdAt)-createdMillis(a.createdAt)||String(b.id).localeCompare(String(a.id))).slice(0,MAX_FEEDBACKS);
    }catch(error){console.warn('[Team Bulls] Feedbacks da home indisponíveis',error);return null;}
  }

    function feedbackTitle(item){return String(item?.title||item?.feedbackType||'Feedback do treinador').trim()||'Feedback do treinador';}
  function renderFeedbacks(items,sequence){
    if(sequence!==refreshSequence)return;
    const host=document.getElementById('tb-v17-feedbacks');if(!host)return;
    const openIds=new Set([...host.querySelectorAll('.tb-v17-feedback.is-open')].map(card=>card.dataset.feedbackId).filter(Boolean));
    const focusedId=document.activeElement?.closest?.('.tb-v17-feedback')?.dataset.feedbackId||'';
    const scroller=document.getElementById('app'),scrollTop=scroller?.scrollTop||0;
    const restoreReadingPosition=()=>{
      if(scroller)scroller.scrollTop=scrollTop;
      if(focusedId){
        const target=[...host.querySelectorAll('.tb-v17-feedback-toggle')].find(button=>button.closest('.tb-v17-feedback')?.dataset.feedbackId===focusedId);
        try{target?.focus({preventScroll:true});}catch(error){target?.focus?.();}
      }
    };
    host.replaceChildren();
    if(!items.length){const empty=document.createElement('div');empty.className='tb-v17-empty';empty.textContent=cloudReady()?'Nenhum feedback enviado pelo treinador.':'Feedbacks disponíveis quando a sessão online estiver ativa.';host.appendChild(empty);restoreReadingPosition();return;}
    items.forEach((item,index)=>{
      const id=String(item.id||''),card=document.createElement('article');card.className='tb-v17-feedback';card.dataset.feedbackId=id;card.dataset.unread=String(item.read!==true);
      const toggle=document.createElement('button');toggle.type='button';toggle.className='tb-v17-feedback-toggle';toggle.setAttribute('aria-expanded','false');
      const idx=document.createElement('span');idx.className='tb-v17-feedback-index';idx.textContent=String(index+1).padStart(2,'0');
      const copy=document.createElement('span');copy.className='tb-v17-feedback-copy';const title=document.createElement('strong'),meta=document.createElement('small');title.textContent=feedbackTitle(item);copy.append(title,meta);
      const chevron=document.createElement('span');chevron.className='tb-v17-feedback-chevron';chevron.textContent='▸';
      const body=document.createElement('div');body.className='tb-v17-feedback-body';body.textContent=String(item.message||'');
      toggle.append(idx,copy,chevron);card.append(toggle,body);host.appendChild(card);
      const initiallyOpen=openIds.has(id);
      if(initiallyOpen){card.classList.add('is-open');toggle.setAttribute('aria-expanded','true');chevron.textContent='▾';}
      const updateMeta=()=>{meta.textContent=(item.read===true?'LIDO':'NOVO')+(item.createdAt?' · '+fmtDate(item.createdAt):'')+' · TOQUE PARA '+(card.classList.contains('is-open')?'FECHAR':'ABRIR');};
      updateMeta();
      toggle.addEventListener('click',async()=>{
        const open=card.classList.toggle('is-open');toggle.setAttribute('aria-expanded',String(open));chevron.textContent=open?'▾':'▸';updateMeta();
        if(open&&item.read!==true&&cloudReady()&&item.id){
          item.read=true;card.dataset.unread='false';updateMeta();
          try{await db.collection('feedback').doc(item.id).update({read:true});}
          catch(error){item.read=false;card.dataset.unread='true';updateMeta();}
        }
      });
    });
    restoreReadingPosition();
  }

  function renderLoadFailure(id,message,sequence){
    if(sequence!==refreshSequence)return;
    const host=document.getElementById(id);if(!host||host.childElementCount)return;
    const notice=document.createElement('div');notice.className='tb-v17-empty';notice.textContent=message;host.appendChild(notice);
  }

    async function fetchWeights(uid){
    if(!uid||!cloudReady())return null;
    const base=db.collection('weeklyCheckins').where('studentId','==',uid);
    const normalize=snap=>snap.docs.map(doc=>({...doc.data(),id:doc.id})).filter(item=>Number(item.weight)>0).sort((a,b)=>String(a.submittedDate||a.dueDate||'').localeCompare(String(b.submittedDate||b.dueDate||''))||createdMillis(a.createdAt)-createdMillis(b.createdAt)).slice(-MAX_WEIGHT_POINTS);
    try{
      if(weightOrderedQueryState!=='unsupported'){
        try{
          const snap=await base.orderBy('submittedDate','desc').limit(MAX_WEIGHT_POINTS).get();
          weightOrderedQueryState='supported';
          return normalize(snap);
        }catch(error){
          if(!orderedQueryNeedsFallback(error))throw error;
          weightOrderedQueryState='unsupported';
          console.info('[Team Bulls] Índice do histórico de peso indisponível; usando leitura compatível.');
        }
      }
      return normalize(await base.get());
    }catch(error){console.warn('[Team Bulls] Histórico de peso indisponível',error);return null;}
  }

    function renderWeight(items,sequence){
    if(sequence!==refreshSequence)return;
    const host=document.getElementById('tb-v17-weight');if(!host)return;host.replaceChildren();
    if(!items.length){const empty=document.createElement('div');empty.className='tb-v17-empty';empty.textContent=cloudReady()?'O gráfico aparece após o primeiro relatório com peso.':'Histórico de peso disponível quando a sessão online estiver ativa.';host.appendChild(empty);return;}
    const values=items.map(item=>Number(item.weight)).filter(Number.isFinite),first=values[0],last=values[values.length-1],delta=last-first;
    const panel=document.createElement('div');panel.className='tb-v17-weight-panel';
    const summary=document.createElement('div');summary.className='tb-v17-weight-summary';const current=document.createElement('div');current.className='tb-v17-weight-current';current.textContent=last.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1});const unit=document.createElement('small');unit.textContent='KG';current.appendChild(unit);const deltaEl=document.createElement('div');deltaEl.className='tb-v17-weight-delta';deltaEl.textContent=`${delta>0?'+':''}${delta.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})} KG NO PERÍODO`;summary.append(current,deltaEl);
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 640 150');svg.setAttribute('preserveAspectRatio','none');svg.classList.add('tb-v17-weight-chart');
    const min=Math.min(...values),max=Math.max(...values),span=Math.max(.5,max-min),pad=18,width=604,height=105;
    for(let row=0;row<4;row++){const y=18+(height/3)*row,line=document.createElementNS(svg.namespaceURI,'line');line.setAttribute('x1','18');line.setAttribute('x2','622');line.setAttribute('y1',String(y));line.setAttribute('y2',String(y));line.setAttribute('stroke','#2d2521');line.setAttribute('stroke-width','1');svg.appendChild(line);}
    const points=values.map((value,index)=>{const x=values.length===1?320:pad+(width*index/(values.length-1));const y=18+height-((value-min)/span)*height;return{x,y,value,index};});
    const poly=document.createElementNS(svg.namespaceURI,'polyline');poly.setAttribute('points',points.map(point=>`${point.x},${point.y}`).join(' '));poly.setAttribute('fill','none');poly.setAttribute('stroke','#b82e3a');poly.setAttribute('stroke-width','3');poly.setAttribute('vector-effect','non-scaling-stroke');svg.appendChild(poly);
    points.forEach(point=>{const circle=document.createElementNS(svg.namespaceURI,'circle');circle.setAttribute('cx',String(point.x));circle.setAttribute('cy',String(point.y));circle.setAttribute('r','4');circle.setAttribute('fill','#d8c8bc');circle.setAttribute('stroke','#b82e3a');circle.setAttribute('stroke-width','2');circle.setAttribute('vector-effect','non-scaling-stroke');svg.appendChild(circle);});
    panel.append(summary,svg);host.appendChild(panel);
  }

  async function refreshHome(force=false){
    if(!isStudentContext()||activeScreen()!=='screen-home')return false;
    ensureInsights();
    const uid=studentUid();
    if(!hasRenderedContext||uid!==lastRenderedUid){
      hasRenderedContext=true;lastRenderedUid=uid;lastRefreshUid='';lastRefreshAt=0;
      const resetSequence=++refreshSequence;renderFeedbacks([],resetSequence);renderWeight([],resetSequence);
    }
    if(!uid||!cloudReady())return true;
    const now=Date.now();
    if(!force&&uid===lastRefreshUid&&now-lastRefreshAt<REFRESH_TTL)return true;
    lastRefreshUid=uid;lastRefreshAt=now;const sequence=++refreshSequence;
    const settled=await Promise.allSettled([
      refreshProtocolDate(uid,sequence),
      fetchFeedbacks(uid).then(items=>{
        if(items===null){renderLoadFailure('tb-v17-feedbacks','Não foi possível carregar os feedbacks agora. O conteúdo salvo continua disponível quando houver conexão.',sequence);return false;}
        renderFeedbacks(items,sequence);return true;
      }),
      fetchWeights(uid).then(items=>{
        if(items===null){renderLoadFailure('tb-v17-weight','Não foi possível carregar o histórico de peso agora.',sequence);return false;}
        renderWeight(items,sequence);return true;
      })
    ]);
    if(settled.some(result=>result.status==='rejected'||result.value===false))lastRefreshAt=0;
    return true;
  }

    function sync(){
    ensureStyles();ensureHotbar();ensureStudentDietLabel();patchSupplyOptionsHeader();
    const active=isStudentContext();
    document.documentElement.classList.toggle('tb-student-home-v17',active);
    const shell=document.getElementById('tb-v17-hotbar-shell');if(shell)shell.hidden=!active;
    if(!active)return;
    const home=document.getElementById('screen-home');if(home)home.classList.add('tb-home-v17-screen');
    const key=hotbarKeyForScreen(activeScreen());if(key)setHotbarActive(key);else document.querySelectorAll('.tb-v17-hotbar button').forEach(button=>button.classList.remove('is-active'));
    if(activeScreen()==='screen-home')refreshHome(false);
  }

  function scheduleSync(){
    if(syncFrame)return;
    syncFrame=requestAnimationFrame(()=>{syncFrame=0;sync();});
  }

  function start(){
    ensureStyles();sync();
    if(!observer&&window.MutationObserver){
      observer=new MutationObserver(scheduleSync);
      observer.observe(document.body,{attributes:true,attributeFilter:['class']});
      document.querySelectorAll('.screen').forEach(screen=>observer.observe(screen,{attributes:true,attributeFilter:['class']}));
    }
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
  window.addEventListener('team-bulls-v107-ready',scheduleSync);
  window.addEventListener('team-bulls-runtime-ready',scheduleSync);
  window.addEventListener('team-bulls-student-runtime-ready',scheduleSync);
  window.addEventListener('online',()=>{lastRefreshAt=0;scheduleSync();});
  window.addEventListener('pageshow',()=>{lastRefreshAt=0;scheduleSync();},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){lastRefreshAt=0;scheduleSync();}});

  window.TeamBullsStudentHomeLayout=Object.freeze({version:VERSION,refresh:()=>refreshHome(true),syncHotbar:sync,isStudentContext,openSupplements:openStudentSupplements,patchSupplyOptionsHeader});
})();