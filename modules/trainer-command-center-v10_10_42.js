/* Team Bulls v10.10.42 — radar diário, prioridades, semáforo e resumo semanal do treinador. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_TRAINER_COMMAND_CENTER_101042__)return;
  window.__TEAM_BULLS_TRAINER_COMMAND_CENTER_101042__=true;

  const VERSION='10.10.42-command2';
  const SCREEN_ID='screen-trainer-command-center';
  const STYLE_ID='tb-trainer-command-center-style';
  const ENTRY_ID='tb-trainer-command-center-entry';
  let dashboard=null,analyses=[],deepByStudent=new Map(),filter='all',loading=false,serial=0;
  const api=()=>window.TeamBullsTrainerIntelligenceData;
  const trainer=()=>{try{return CURRENT_USER?.role==='trainer'&&MODE==='cloud'&&!!db;}catch(error){return false;}};
  const h=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

  function injectStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');style.id=STYLE_ID;style.textContent=`
      #${SCREEN_ID}{padding-bottom:94px}.tb-command-content{padding-top:14px}.tb-command-hero{padding:15px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:linear-gradient(145deg,rgba(225,29,72,.07),#111);margin-bottom:12px}.tb-command-hero span{display:block;color:#e45c71;font:800 8px 'DM Mono',monospace;letter-spacing:.8px}.tb-command-hero strong{display:block;margin-top:4px;color:#eee;font:900 25px 'Barlow Condensed',sans-serif}.tb-command-hero p{margin:5px 0 0;color:#81766f;font:500 10px/1.5 'DM Mono',monospace}.tb-command-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:11px}.tb-command-actions button{min-height:38px;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:#121212;color:#aaa;padding:8px 11px;font:800 8px 'DM Mono',monospace}.tb-command-actions .primary{border-color:rgba(225,29,72,.45);background:rgba(225,29,72,.09);color:#fff}.tb-command-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:12px}.tb-command-stat{padding:11px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:#101010}.tb-command-stat span{display:block;color:#736a64;font:700 8px 'DM Mono',monospace}.tb-command-stat strong{display:block;margin-top:5px;color:#eee;font:900 22px 'Barlow Condensed',sans-serif}.tb-command-stat.red strong{color:#ff7189}.tb-command-stat.yellow strong{color:#efba72}.tb-command-stat.blue strong{color:#75a9e7}.tb-command-section{margin:14px 0}.tb-command-title{display:flex;align-items:end;justify-content:space-between;gap:10px;margin-bottom:8px}.tb-command-title strong{color:#e8e2de;font:900 18px 'Barlow Condensed',sans-serif}.tb-command-title span{color:#716862;font:700 8px 'DM Mono',monospace}.tb-command-toolbar{display:flex;gap:6px;overflow:auto;padding-bottom:8px;scrollbar-width:none}.tb-command-toolbar::-webkit-scrollbar{display:none}.tb-command-toolbar button{flex:0 0 auto;border:1px solid rgba(255,255,255,.08);border-radius:999px;background:#111;color:#7e746e;padding:8px 10px;font:800 8px 'DM Mono',monospace}.tb-command-toolbar button.active{border-color:rgba(225,29,72,.45);color:#fff;background:rgba(225,29,72,.08)}.tb-radar-list{display:grid;gap:8px}.tb-radar-card{display:grid;grid-template-columns:14px minmax(0,1fr) auto;gap:10px;align-items:start;padding:12px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:#111}.tb-radar-light,.tb-insight-light{width:10px;height:10px;border-radius:50%;margin-top:4px;background:#54bb78;box-shadow:0 0 0 3px rgba(84,187,120,.08)}.tb-radar-light.red,.tb-insight-light.red{background:#e84d65;box-shadow:0 0 0 3px rgba(232,77,101,.1)}.tb-radar-light.yellow,.tb-insight-light.yellow{background:#e8ae5e;box-shadow:0 0 0 3px rgba(232,174,94,.1)}.tb-radar-light.blue,.tb-insight-light.blue{background:#609ce1;box-shadow:0 0 0 3px rgba(96,156,225,.1)}.tb-radar-main{min-width:0}.tb-radar-kicker{display:flex;gap:6px;align-items:center;flex-wrap:wrap;color:#716862;font:700 8px 'DM Mono',monospace}.tb-radar-score{display:inline-flex;border:1px solid rgba(255,255,255,.09);border-radius:999px;padding:3px 6px}.tb-radar-main strong{display:block;margin-top:4px;color:#eee;font:900 18px 'Barlow Condensed',sans-serif}.tb-signal-list{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.tb-signal{display:inline-flex;border:1px solid rgba(255,255,255,.07);border-radius:999px;padding:4px 6px;color:#7c726c;font:700 7px 'DM Mono',monospace}.tb-next-action{margin-top:8px;padding:8px;border-left:2px solid #a71835;background:rgba(225,29,72,.04);color:#c7bdb7;font-size:10px}.tb-radar-side{display:flex;flex-direction:column;gap:5px}.tb-radar-side button{border:1px solid rgba(255,255,255,.09);border-radius:7px;background:#151515;color:#aaa;padding:7px 8px;font:800 7px 'DM Mono',monospace}.tb-radar-side .primary{border-color:rgba(225,29,72,.35);color:#ff7189}.tb-week-summary{display:grid;grid-template-columns:1fr 1fr;gap:8px}.tb-week-card{padding:12px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:#101010}.tb-week-card span{display:block;color:#756c66;font:700 8px 'DM Mono',monospace}.tb-week-card strong{display:block;margin-top:5px;color:#eee;font:900 20px 'Barlow Condensed',sans-serif}.tb-week-card p{margin:4px 0 0;color:#827871;font-size:9px;line-height:1.45}.tb-command-empty,.tb-command-loading{padding:26px 15px;border:1px dashed rgba(255,255,255,.1);border-radius:10px;text-align:center;color:#776d67;font:500 10px/1.5 'DM Mono',monospace}.student-card .tb-insight-light{display:inline-block;margin:0 5px 0 0;vertical-align:middle;width:8px;height:8px}.student-card .tb-insight-label{color:#756d67;font:700 7px 'DM Mono',monospace;margin-left:4px}@media(max-width:700px){.tb-command-summary{grid-template-columns:1fr 1fr}.tb-radar-card{grid-template-columns:12px minmax(0,1fr)}.tb-radar-side{grid-column:2;flex-direction:row}.tb-radar-side button{flex:1}.tb-week-summary{grid-template-columns:1fr}}`;
    document.head.appendChild(style);
  }

  function ensureScreen(){
    if(document.getElementById(SCREEN_ID))return;
    const app=document.getElementById('app');if(!app)return;
    const screen=document.createElement('div');screen.className='screen';screen.id=SCREEN_ID;
    screen.innerHTML=`<div class="header"><button class="btn-icon" type="button" data-tb-command-back>←</button><div class="header-title">RADAR // TREINADOR</div><button class="btn-icon ghost" type="button" data-tb-command-refresh title="Atualizar">↻</button></div><div class="content tb-command-content"><section class="tb-command-hero"><span>SISTEMA OPERACIONAL DA CONSULTORIA</span><strong>Radar diário e prioridades</strong><p>Veja primeiro quem precisa de atenção. O painel usa agenda, relatórios e pagamentos já existentes; histórico pesado de treino só é carregado quando você pede uma análise aprofundada de um aluno.</p><div class="tb-command-actions"><button class="primary" type="button" data-tb-command-refresh>↻ ATUALIZAR RADAR</button><button type="button" data-tb-command-updates>🗓 AGENDA DE ATUALIZAÇÕES</button><button type="button" data-tb-command-feedbacks>✉ FEEDBACKS ENVIADOS</button></div></section><div id="tb-command-summary" class="tb-command-summary"></div><section class="tb-command-section"><div class="tb-command-title"><strong>Prioridades de hoje</strong><span>SEMÁFORO OPERACIONAL</span></div><div class="tb-command-toolbar"><button data-tb-command-filter="all">TODOS</button><button data-tb-command-filter="red">🔴 URGENTE</button><button data-tb-command-filter="yellow">🟡 ATENÇÃO</button><button data-tb-command-filter="blue">🔵 NOVO</button><button data-tb-command-filter="green">🟢 EM DIA</button></div><div id="tb-radar-list" class="tb-radar-list"></div></section><section class="tb-command-section"><div class="tb-command-title"><strong>Resumo semanal</strong><span>GESTÃO DA CARTEIRA</span></div><div id="tb-week-summary" class="tb-week-summary"></div></section></div>`;
    app.appendChild(screen);
    screen.querySelector('[data-tb-command-back]')?.addEventListener('click',()=>typeof goTrainer==='function'&&goTrainer());
    screen.querySelectorAll('[data-tb-command-refresh]').forEach(button=>button.addEventListener('click',()=>load(true)));
    screen.querySelector('[data-tb-command-updates]')?.addEventListener('click',()=>window.TeamBullsTrainerUpdateOrganizer?.open?.());
    screen.querySelector('[data-tb-command-feedbacks]')?.addEventListener('click',()=>window.TeamBullsTrainerFeedbackArchive?.open?.());
    screen.querySelectorAll('[data-tb-command-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.tbCommandFilter||'all';render();}));
  }

  function ensureEntry(){
    if(!trainer())return false;injectStyles();ensureScreen();
    const home=document.querySelector('#screen-trainer .content');if(!home)return false;
    if(!document.getElementById(ENTRY_ID)){
      const button=document.createElement('button');button.id=ENTRY_ID;button.type='button';button.className='btn-add-set';button.style.marginBottom='14px';button.textContent='◉ Radar diário — prioridades e resumo semanal';button.addEventListener('click',open);
      const organizer=document.getElementById('tb-trainer-update-organizer-entry');if(organizer)organizer.insertAdjacentElement('afterend',button);else home.prepend(button);
    }
    const nav=document.getElementById('trainer-desktop-nav');
    if(nav&&!document.getElementById('tb-nav-command-center')){
      const button=document.createElement('button');button.id='tb-nav-command-center';button.dataset.navPrepared='1';button.innerHTML='<span aria-hidden="true" class="nav-icon">◉</span><span class="nav-label">RADAR DIÁRIO</span>';button.addEventListener('click',open);
      const first=[...nav.querySelectorAll(':scope > button')].find(item=>!item.classList.contains('desktop-nav-toggle'));first?.insertAdjacentElement('afterend',button);
    }
    decorateStudentCards();return true;
  }

  function rowFor(studentId){return dashboard?.rows?.find(row=>String(row.student?.uid)===String(studentId))||null;}
  function recompute(){
    if(!dashboard||!api())return;
    analyses=dashboard.rows.map(row=>api().analyze(row,{activity:dashboard.activity,payments:dashboard.payments},deepByStudent.get(String(row.student.uid))||null)).sort((a,b)=>b.score-a.score||String(a.student?.name||'').localeCompare(String(b.student?.name||''),'pt-BR'));
  }

  function decorateStudentCards(){
    const lookup=new Map(analyses.map(item=>[String(item.studentId),item]));
    document.querySelectorAll('.student-card[data-student-uid]').forEach(card=>{
      card.querySelector('.tb-insight-light')?.remove();card.querySelector('.tb-insight-label')?.remove();
      const item=lookup.get(String(card.dataset.studentUid||''));if(!item)return;
      const name=card.querySelector('.student-name');if(!name)return;
      const light=document.createElement('i');light.className='tb-insight-light '+item.light;light.title=`Radar: ${item.score}/100 · ${item.nextAction}`;name.prepend(light);
      const label=document.createElement('span');label.className='tb-insight-label';label.textContent=item.light==='red'?'URGENTE':item.light==='yellow'?'ATENÇÃO':item.light==='blue'?'NOVO':'EM DIA';name.appendChild(label);
    });
  }

  function summaryHtml(){
    if(!dashboard||!api())return'';
    const s=api().summary(dashboard.rows,{activity:dashboard.activity,payments:dashboard.payments}),delta=s.reportsDelta===0?'igual à semana anterior':s.reportsDelta>0?`+${s.reportsDelta} vs. semana anterior`:`${s.reportsDelta} vs. semana anterior`;
    return`<div class="tb-command-stat"><span>ALUNOS ATIVOS</span><strong>${s.active}</strong></div><div class="tb-command-stat red"><span>URGENTES</span><strong>${analyses.filter(item=>item.light==='red').length}</strong></div><div class="tb-command-stat yellow"><span>ATENÇÃO</span><strong>${analyses.filter(item=>item.light==='yellow').length}</strong></div><div class="tb-command-stat blue"><span>RELATÓRIOS NA SEMANA</span><strong>${s.reportsNow}</strong><small style="color:#706761;font-size:7px">${h(delta)}</small></div>`;
  }

  function radarHtml(item){
    const student=item.student||{},signals=item.signals.slice(0,4),deep=deepByStudent.has(String(item.studentId));
    return`<article class="tb-radar-card"><i class="tb-radar-light ${item.light}" aria-hidden="true"></i><div class="tb-radar-main"><div class="tb-radar-kicker"><span class="tb-radar-score">RISCO ${item.score}/100</span>${deep?'<span>ANÁLISE PROFUNDA ✓</span>':'<span>ANÁLISE LEVE</span>'}</div><strong>${h(student.name||'Aluno')}</strong><div class="tb-signal-list">${signals.length?signals.map(signal=>`<span class="tb-signal">${h(signal.label)}</span>`).join(''):'<span class="tb-signal">Sem pendências relevantes</span>'}</div><div class="tb-next-action"><b>PRÓXIMA AÇÃO:</b> ${h(item.nextAction)}</div></div><div class="tb-radar-side"><button class="primary" type="button" data-tb-command-open="${h(item.studentId)}">ABRIR ALUNO</button><button type="button" data-tb-command-deep="${h(item.studentId)}">${deep?'REANALISAR':'ANALISAR TREINO'}</button></div></article>`;
  }

  function renderWeekSummary(){
    const host=document.getElementById('tb-week-summary');if(!host||!dashboard||!api())return;
    const s=api().summary(dashboard.rows,{activity:dashboard.activity,payments:dashboard.payments});
    host.innerHTML=`<div class="tb-week-card"><span>RELATÓRIOS RECEBIDOS</span><strong>${s.reportsNow}</strong><p>Semana anterior: ${s.reportsPrev}. Diferença: ${s.reportsDelta>0?'+':''}${s.reportsDelta}.</p></div><div class="tb-week-card"><span>ATUALIZAÇÕES ATRASADAS</span><strong>${s.weeklyOverdue+s.monthlyOverdue}</strong><p>${s.weeklyOverdue} semanais · ${s.monthlyOverdue} completas.</p></div><div class="tb-week-card"><span>PAGAMENTOS ATRASADOS</span><strong>${s.paymentsLate}</strong><p>Somente registros financeiros já cadastrados no Team Bulls.</p></div><div class="tb-week-card"><span>CARTEIRA EM DIA</span><strong>${analyses.filter(item=>item.light==='green').length}</strong><p>Sem sinais de atenção detectados pelos dados atualmente disponíveis.</p></div>`;
  }

  function render(){
    ensureScreen();const summary=document.getElementById('tb-command-summary'),list=document.getElementById('tb-radar-list');if(!summary||!list)return;
    document.querySelectorAll('[data-tb-command-filter]').forEach(button=>button.classList.toggle('active',button.dataset.tbCommandFilter===filter));
    if(loading){summary.innerHTML='';list.innerHTML='<div class="tb-command-loading">Analisando agenda, relatórios e pagamentos sem carregar históricos pesados...</div>';const week=document.getElementById('tb-week-summary');if(week)week.innerHTML='';return;}
    summary.innerHTML=summaryHtml();
    const visible=filter==='all'?analyses:analyses.filter(item=>item.light===filter);
    list.innerHTML=visible.length?visible.map(radarHtml).join(''):'<div class="tb-command-empty">Nenhum aluno neste nível de prioridade.</div>';
    list.querySelectorAll('[data-tb-command-open]').forEach(button=>button.addEventListener('click',()=>openStudent(button.dataset.tbCommandOpen)));
    list.querySelectorAll('[data-tb-command-deep]').forEach(button=>button.addEventListener('click',()=>deepAnalyze(button.dataset.tbCommandDeep)));
    renderWeekSummary();decorateStudentCards();
  }

  function replaceStudentSlice(items,studentId,replacement){
    const sid=String(studentId||''),rest=(items||[]).filter(item=>String(item.studentId||'')!==sid),next=Array.isArray(replacement)?replacement:[];
    return rest.concat(next);
  }

  async function openStudent(studentId){
    const row=rowFor(studentId),student=row?.student;if(!student)return;
    if(typeof viewStudent==='function')await viewStudent(student.uid,student.name||'Aluno',student.email||'',student.status||'active');
  }

  async function deepAnalyze(studentId){
    if(!api()||loading)return;
    const sid=String(studentId||''),button=document.querySelector(`[data-tb-command-deep="${CSS.escape(sid)}"]`),run=serial;
    if(button){button.disabled=true;button.textContent='ANALISANDO...';}
    try{
      const deep=await api().loadDeepStudent(sid,true);
      if(!deep||!trainer()||run!==serial||!dashboard)return;
      deepByStudent.set(sid,deep);
      const row=rowFor(sid);
      if(row){row.checkinSchedule=deep.checkinSchedule||null;row.protocolSchedule=deep.protocolSchedule||null;}
      dashboard.activity=replaceStudentSlice(dashboard.activity,sid,deep.activity);
      dashboard.payments=replaceStudentSlice(dashboard.payments,sid,deep.payments);
      recompute();render();
      if(typeof showToast==='function')showToast('✓ Análise profunda atualizada');
    }catch(error){
      console.error('deepAnalyze',error);
      if(typeof showToast==='function')showToast('Não foi possível carregar o histórico deste aluno.',true);
    }finally{if(button?.isConnected)button.disabled=false;}
  }

  async function load(force=false){
    if(!trainer()||!api()||loading)return;
    const run=++serial;loading=true;render();
    try{dashboard=await api().loadDashboard(force);if(run!==serial)return;recompute();}
    catch(error){if(run===serial){console.error('Trainer command center',error);dashboard=null;analyses=[];if(typeof showToast==='function')showToast('Não foi possível atualizar o radar.',true);}}
    finally{if(run===serial){loading=false;render();}}
  }

  async function open(){if(!trainer())return;ensureEntry();if(typeof showScreen==='function')showScreen(SCREEN_ID);await load(false);}

  function patchTrainerRender(){
    if(typeof renderTrainer!=='function'||renderTrainer.__tbCommandCenter)return;
    const base=renderTrainer;
    const wrapped=async function(){const result=await base.apply(this,arguments);if(trainer()){ensureEntry();decorateStudentCards();}return result;};
    wrapped.__tbCommandCenter=true;wrapped.__tbBase=base;renderTrainer=wrapped;
  }

  function patchLogout(){
    if(typeof confirmLogout!=='function'||confirmLogout.__tbCommandCenter)return;
    const base=confirmLogout;
    const wrapped=function(){dashboard=null;analyses=[];deepByStudent.clear();filter='all';loading=false;serial++;return base.apply(this,arguments);};
    wrapped.__tbCommandCenter=true;wrapped.__tbBase=base;confirmLogout=wrapped;
  }

  function install(){injectStyles();ensureScreen();patchTrainerRender();patchLogout();if(trainer())ensureEntry();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('pageshow',()=>{if(trainer())ensureEntry();},{passive:true});

  window.TeamBullsTrainerCommandCenter=Object.freeze({version:VERSION,open,refresh:()=>load(true),deepAnalyze,snapshot:()=>({analyses:analyses.map(item=>({...item})),loaded:!!dashboard})});
})();
