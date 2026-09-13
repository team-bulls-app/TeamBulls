/* Team Bulls v10.10.42 — timeline, comparação, próximas ações, metas e modo revisão do treinador. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_TRAINER_STUDENT_INSIGHTS_101042__)return;
  window.__TEAM_BULLS_TRAINER_STUDENT_INSIGHTS_101042__=true;

  const VERSION='10.10.42-studentinsights2';
  const SCREEN_ID='screen-trainer-student-insights';
  const STYLE_ID='tb-trainer-student-insights-style';
  const ENTRY_ID='tb-trainer-student-insights-entry';
  const GOAL_MODAL='modal-trainer-cycle-goals';
  let studentId='',bundle=null,tab='timeline',loading=false,loadingStudentId='',serial=0,reviewStep=0;

  const dataApi=()=>window.TeamBullsTrainerIntelligenceData;
  const trainer=()=>{try{return CURRENT_USER?.role==='trainer'&&MODE==='cloud'&&!!db;}catch(error){return false;}};
  const h=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const iso=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):'';
  const fmtDate=value=>{if(!value)return'—';try{if(typeof fmt==='function'&&iso(value))return fmt(value);}catch(error){}return String(value);};
  const stamp=value=>{try{if(value?.toMillis)return value.toMillis();if(value?.seconds)return Number(value.seconds)*1000;return Number(value)||0;}catch(error){return 0;}};
  const dateFromStamp=value=>{const ms=stamp(value);if(!ms)return'';const d=new Date(ms),p=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;};
  const student=()=>VIEW_STUDENT&&String(VIEW_STUDENT.uid||'')===studentId?VIEW_STUDENT:null;

  function injectStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');style.id=STYLE_ID;style.textContent=`
      #${SCREEN_ID}{padding-bottom:94px}.tb-insights-content{padding-top:14px}.tb-insights-head{padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:linear-gradient(145deg,rgba(225,29,72,.06),#111);margin-bottom:10px}.tb-insights-head span{display:block;color:#e35a70;font:800 8px 'DM Mono',monospace}.tb-insights-head strong{display:block;margin-top:4px;color:#eee;font:900 23px 'Barlow Condensed',sans-serif}.tb-insights-head p{margin:5px 0 0;color:#81766f;font:500 10px/1.45 'DM Mono',monospace}.tb-insights-tabs{display:flex;gap:6px;overflow:auto;padding:6px 0 10px;scrollbar-width:none;position:sticky;top:0;z-index:7;background:var(--bg,#0c0c0c)}.tb-insights-tabs::-webkit-scrollbar{display:none}.tb-insights-tabs button{flex:0 0 auto;border:1px solid rgba(255,255,255,.09);border-radius:999px;background:#111;color:#7f756f;padding:8px 10px;font:800 8px 'DM Mono',monospace}.tb-insights-tabs button.active{border-color:rgba(225,29,72,.46);color:#fff;background:rgba(225,29,72,.09)}.tb-insights-card{padding:12px;border:1px solid rgba(255,255,255,.075);border-radius:10px;background:#111;margin-bottom:8px}.tb-insights-card h3{margin:0;color:#eee;font:900 18px 'Barlow Condensed',sans-serif}.tb-insights-card p{margin:5px 0 0;color:#8c817a;font-size:10px;line-height:1.5}.tb-timeline{position:relative;padding-left:17px}.tb-timeline:before{content:'';position:absolute;left:5px;top:8px;bottom:8px;width:1px;background:#30282a}.tb-timeline-event{position:relative;padding:0 0 12px 10px}.tb-timeline-event:before{content:'';position:absolute;left:-16px;top:5px;width:8px;height:8px;border-radius:50%;background:#9d1935;border:2px solid #0c0c0c}.tb-timeline-event span{display:block;color:#756b65;font:700 8px 'DM Mono',monospace}.tb-timeline-event strong{display:block;margin-top:3px;color:#ddd;font:800 13px 'Barlow',sans-serif}.tb-timeline-event p{margin:3px 0 0;color:#827872;font-size:9px;line-height:1.45}.tb-compare-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.tb-compare-box{padding:11px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:#0f0f0f}.tb-compare-box span{display:block;color:#746b65;font:700 8px 'DM Mono',monospace}.tb-compare-box strong{display:block;margin-top:5px;color:#eee;font:900 20px 'Barlow Condensed',sans-serif}.tb-compare-box p{margin:4px 0 0;color:#7f756f;font-size:9px}.tb-progress-table{width:100%;border-collapse:collapse;margin-top:9px}.tb-progress-table th,.tb-progress-table td{padding:7px;border-bottom:1px solid rgba(255,255,255,.055);text-align:left;font-size:9px;color:#8e847e}.tb-progress-table th{font:700 7px 'DM Mono',monospace;color:#6e6661}.tb-progress-table td strong{color:#ddd}.tb-action-suggestion{display:flex;gap:8px;align-items:flex-start;padding:9px;border:1px solid rgba(255,255,255,.06);border-radius:8px;background:#101010;margin-top:6px}.tb-action-suggestion b{min-width:19px;height:19px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(225,29,72,.1);color:#e87385;font:900 9px 'DM Mono',monospace}.tb-action-suggestion div{color:#a69b94;font-size:10px;line-height:1.45}.tb-goal-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:9px}.tb-goal{padding:10px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:#0f0f0f}.tb-goal span{display:block;color:#756c66;font:700 7px 'DM Mono',monospace}.tb-goal strong{display:block;margin-top:4px;color:#eee;font:900 18px 'Barlow Condensed',sans-serif}.tb-goal-bar{height:5px;border-radius:99px;background:#211d1d;overflow:hidden;margin-top:7px}.tb-goal-bar i{display:block;height:100%;background:#9d1935}.tb-review-progress{display:flex;gap:4px;margin:8px 0 12px}.tb-review-progress i{height:4px;flex:1;border-radius:99px;background:#282323}.tb-review-progress i.done{background:#a81737}.tb-review-step{padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:#111}.tb-review-step .kicker{color:#e06479;font:800 8px 'DM Mono',monospace}.tb-review-step h3{margin:5px 0;color:#eee;font:900 22px 'Barlow Condensed',sans-serif}.tb-review-step p{color:#8c817a;font-size:10px;line-height:1.5}.tb-review-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.tb-review-actions button,.tb-insights-card button{border:1px solid rgba(255,255,255,.1);border-radius:8px;background:#151515;color:#aaa;padding:9px 10px;font:800 8px 'DM Mono',monospace}.tb-review-actions .primary,.tb-insights-card button.primary{border-color:rgba(225,29,72,.4);background:rgba(225,29,72,.08);color:#fff}.tb-insights-empty,.tb-insights-loading{padding:26px 14px;border:1px dashed rgba(255,255,255,.1);border-radius:10px;text-align:center;color:#776d67;font:500 10px/1.5 'DM Mono',monospace}.tb-goal-form{display:grid;grid-template-columns:1fr 1fr;gap:10px}.tb-goal-form label{display:flex;flex-direction:column;gap:5px;color:#7b716b;font:700 8px 'DM Mono',monospace}.tb-goal-form input,.tb-goal-form textarea{border:1px solid rgba(255,255,255,.1);border-radius:8px;background:#101010;color:#eee;padding:10px;font:500 12px 'Barlow',sans-serif}.tb-goal-form .wide{grid-column:1/-1}@media(max-width:620px){.tb-compare-grid,.tb-goal-grid,.tb-goal-form{grid-template-columns:1fr}.tb-goal-form .wide{grid-column:auto}}`;
    document.head.appendChild(style);
  }

  function ensureUi(){
    injectStyles();const app=document.getElementById('app');if(!app)return;
    if(!document.getElementById(SCREEN_ID)){
      const screen=document.createElement('div');screen.className='screen';screen.id=SCREEN_ID;
      screen.innerHTML=`<div class="header"><button class="btn-icon" type="button" data-tb-insights-back>←</button><div class="header-title">ANÁLISE // ALUNO</div><button class="btn-icon ghost" type="button" data-tb-insights-refresh>↻</button></div><div class="content tb-insights-content"><div class="tb-insights-head" id="tb-insights-head"></div><div class="tb-insights-tabs"><button data-tb-insights-tab="timeline">LINHA DO TEMPO</button><button data-tb-insights-tab="compare">COMPARAR</button><button data-tb-insights-tab="actions">PRÓXIMAS AÇÕES</button><button data-tb-insights-tab="goals">METAS</button><button data-tb-insights-tab="review">MODO REVISÃO</button></div><div id="tb-insights-body"></div></div>`;
      app.appendChild(screen);
      screen.querySelector('[data-tb-insights-back]')?.addEventListener('click',()=>typeof goTrainerStudent==='function'?goTrainerStudent():goTrainer());
      screen.querySelector('[data-tb-insights-refresh]')?.addEventListener('click',()=>load(true));
      screen.querySelectorAll('[data-tb-insights-tab]').forEach(button=>button.addEventListener('click',()=>{tab=button.dataset.tbInsightsTab||'timeline';if(tab==='review')reviewStep=0;render();}));
    }
    if(!document.getElementById(GOAL_MODAL)){
      const modal=document.createElement('div');modal.className='modal-backdrop';modal.id=GOAL_MODAL;
      modal.innerHTML=`<div class="modal-sheet" style="max-width:650px"><div class="modal-handle"></div><div class="modal-title">Metas do ciclo</div><div class="tb-goal-form"><label>PESO-ALVO (KG)<input id="tb-goal-weight" type="number" min="20" max="500" step="0.1" placeholder="Opcional"></label><label>SESSÕES NO CICLO<input id="tb-goal-sessions" type="number" min="0" max="300" step="1" placeholder="Opcional"></label><label>RELATÓRIOS NO CICLO<input id="tb-goal-reports" type="number" min="0" max="60" step="1" placeholder="Opcional"></label><label class="wide">FOCO DO CICLO<textarea id="tb-goal-note" rows="4" maxlength="500" placeholder="Ex.: consolidar frequência, progredir cargas e manter adesão..."></textarea></label></div><div class="modal-actions"><button class="btn-ghost" type="button" data-tb-goal-cancel>CANCELAR</button><button class="btn-primary" type="button" data-tb-goal-save>SALVAR METAS</button></div></div>`;
      document.body.appendChild(modal);
      modal.querySelector('[data-tb-goal-cancel]')?.addEventListener('click',()=>closeModal(GOAL_MODAL));
      modal.querySelector('[data-tb-goal-save]')?.addEventListener('click',saveGoals);
    }
  }

  function ensureEntry(){
    if(!trainer()||!VIEW_STUDENT)return false;ensureUi();
    const content=document.querySelector('#screen-trainer-student .content');if(!content)return false;
    let button=document.getElementById(ENTRY_ID);if(button)return true;
    button=document.createElement('button');button.id=ENTRY_ID;button.className='btn-add-set';button.type='button';button.style.margin='0 0 14px';button.textContent='◉ Análise do aluno — timeline, comparação, metas e revisão';button.addEventListener('click',()=>open('timeline'));
    const archive=document.getElementById('ts-archive-card');if(archive)archive.insertAdjacentElement('afterend',button);else content.prepend(button);
    return true;
  }

  function sessionDateGroups(sessions=[]){
    const map=new Map();
    for(const item of sessions){const date=iso(item.date);if(!date)continue;const row=map.get(date)||{date,count:0,sets:0,names:new Set()};row.count++;row.sets+=(item.sets||[]).length;if(item.exerciseName)row.names.add(String(item.exerciseName));map.set(date,row);}
    return[...map.values()].sort((a,b)=>b.date.localeCompare(a.date));
  }

  function timelineEvents(){
    if(!bundle)return[];const events=[];
    sessionDateGroups(bundle.sessions).forEach(row=>events.push({date:row.date,type:'training',title:`Treino registrado · ${row.count} registro${row.count===1?'':'s'}`,text:`${row.sets} séries · ${[...row.names].slice(0,5).join(', ')}${row.names.size>5?'…':''}`}));
    bundle.checkins.forEach(item=>events.push({date:iso(item.submittedDate||item.dueDate)||dateFromStamp(item.createdAt),type:'report',title:item.requestKind==='manual'?'Relatório extra enviado':'Relatório semanal enviado',text:`${Number(item.weight)>0?Number(item.weight).toLocaleString('pt-BR',{maximumFractionDigits:1})+' kg · ':''}${Array.isArray(item.photoIds)?item.photoIds.length:0} fotos`}));
    bundle.feedbacks.forEach(item=>events.push({date:dateFromStamp(item.createdAt),type:'feedback',title:item.title||'Feedback enviado',text:String(item.message||'').replace(/\s+/g,' ').slice(0,180)+(String(item.message||'').length>180?'…':'')}));
    bundle.payments.forEach(item=>events.push({date:iso(item.validFrom)||dateFromStamp(item.createdAt),type:'payment',title:'Pagamento registrado',text:`Plano ${item.planType==='semiannual'?'semestral':'trimestral'} · próximo vencimento ${fmtDate(item.nextDueDate)}`}));
    const protocol=bundle.protocolSchedule;
    if(protocol?.startDate)events.push({date:protocol.startDate,type:'protocol',title:'Ciclo de acompanhamento iniciado',text:`Atualização completa a cada ${Number(protocol.intervalWeeks)||4} semanas`});
    if(protocol?.lastCompletedDate)events.push({date:protocol.lastCompletedDate,type:'protocol',title:`Atualização completa nº ${Number(protocol.lastCompletedCycle)||1} concluída`,text:'Ciclo oficial marcado como revisado pelo treinador.'});
    (student()?.workouts||[]).forEach(workout=>{if(iso(workout.startDate))events.push({date:workout.startDate,type:'plan',title:`Treino iniciado · ${workout.name||'Protocolo'}`,text:workout.updateDate?`Atualização prevista em ${fmtDate(workout.updateDate)}`:''});});
    return events.filter(item=>iso(item.date)).sort((a,b)=>b.date.localeCompare(a.date)||a.title.localeCompare(b.title,'pt-BR'));
  }

  function timelineHtml(){
    const items=timelineEvents();
    return`<section class="tb-insights-card"><h3>Linha do tempo completa</h3><p>Treinos registrados, relatórios, feedbacks, ciclos e pagamentos reunidos em ordem cronológica.</p></section>${items.length?`<div class="tb-timeline">${items.map(item=>`<div class="tb-timeline-event"><span>${h(fmtDate(item.date))} · ${h(item.type.toUpperCase())}</span><strong>${h(item.title)}</strong>${item.text?`<p>${h(item.text)}</p>`:''}</div>`).join('')}</div>`:'<div class="tb-insights-empty">Ainda não há eventos suficientes para montar a linha do tempo.</div>'}`;
  }

  function periodStats(start,end){
    const list=(bundle?.sessions||[]).filter(item=>iso(item.date)&&item.date>start&&item.date<=end),sets=list.reduce((sum,item)=>sum+(Array.isArray(item.sets)?item.sets.length:0),0),volume=list.reduce((sum,item)=>sum+(item.sets||[]).reduce((s,set)=>s+(Number(set.weight)||0)*(Number(set.reps)||0),0),0);
    return{list,count:list.length,sets,volume};
  }
  function maxLoads(list=[]){const out=new Map();for(const session of list){const name=String(session.exerciseName||session.exerciseId||'Exercício'),max=Math.max(0,...(session.sets||[]).map(set=>Number(set.weight)||0));if(max>Number(out.get(name)||0))out.set(name,max);}return out;}

  function comparison(){
    const current=bundle?.checkins?.[0],previous=bundle?.checkins?.[1];if(!current||!previous)return null;
    const currentDate=iso(current.submittedDate||current.dueDate),previousDate=iso(previous.submittedDate||previous.dueDate);if(!currentDate||!previousDate)return null;
    const span=Math.max(1,dataApi().dayDiff(previousDate,currentDate)),previousStart=dataApi().addDays(previousDate,-span),currentStats=periodStats(previousDate,currentDate),previousStats=periodStats(previousStart,previousDate),currentLoads=maxLoads(currentStats.list),previousLoads=maxLoads(previousStats.list),progress=[];
    currentLoads.forEach((value,name)=>{if(!previousLoads.has(name))return;const before=previousLoads.get(name),delta=value-before;if(delta!==0)progress.push({name,before,after:value,delta});});
    progress.sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
    return{current,previous,currentDate,previousDate,span,currentStats,previousStats,progress,weightDelta:Number(current.weight||0)-Number(previous.weight||0)};
  }

  function compareHtml(){
    const c=comparison();if(!c)return'<div class="tb-insights-empty">São necessários pelo menos dois relatórios semanais para montar a comparação automática.</div>';
    return`<section class="tb-insights-card"><h3>Antes × Agora</h3><p>Comparação entre os dois relatórios mais recentes e dois períodos de mesma duração (${c.span} dias).</p><div class="tb-compare-grid"><div class="tb-compare-box"><span>RELATÓRIO ANTERIOR · ${h(fmtDate(c.previousDate))}</span><strong>${Number(c.previous.weight||0).toLocaleString('pt-BR',{maximumFractionDigits:1})} kg</strong><p>${c.previousStats.count} registros de treino · ${c.previousStats.sets} séries</p></div><div class="tb-compare-box"><span>RELATÓRIO ATUAL · ${h(fmtDate(c.currentDate))}</span><strong>${Number(c.current.weight||0).toLocaleString('pt-BR',{maximumFractionDigits:1})} kg</strong><p>${c.currentStats.count} registros de treino · ${c.currentStats.sets} séries · peso ${c.weightDelta>0?'+':''}${c.weightDelta.toLocaleString('pt-BR',{maximumFractionDigits:1})} kg</p></div></div>${c.progress.length?`<table class="tb-progress-table"><thead><tr><th>EXERCÍCIO</th><th>ANTES</th><th>AGORA</th><th>Δ CARGA</th></tr></thead><tbody>${c.progress.slice(0,8).map(item=>`<tr><td><strong>${h(item.name)}</strong></td><td>${item.before} kg</td><td>${item.after} kg</td><td>${item.delta>0?'+':''}${item.delta} kg</td></tr>`).join('')}</tbody></table>`:'<p style="margin-top:9px">Ainda não há exercícios comparáveis com mudança de carga entre os períodos.</p>'}<div class="tb-review-actions"><button type="button" data-tb-open-checkin="${h(c.current.id)}">ABRIR RELATÓRIO ATUAL</button><button type="button" data-tb-open-checkin="${h(c.previous.id)}">ABRIR RELATÓRIO ANTERIOR</button></div></section>`;
  }

  function generatedActions(){
    if(!bundle||!dataApi())return[];
    const row={student:student()||{uid:studentId},checkinSchedule:bundle.checkinSchedule,protocolSchedule:bundle.protocolSchedule},analysis=dataApi().analyze(row,{activity:bundle.activity||[],payments:bundle.payments||[]},bundle),actions=[];
    analysis.signals.slice(0,4).forEach(signal=>actions.push(signal.action));
    const c=comparison();
    if(c){if(c.currentStats.count<c.previousStats.count)actions.push('Revisar queda na frequência de registros de treino');if(c.weightDelta!==0&&Math.abs(c.weightDelta)>=2)actions.push('Contextualizar a mudança de peso com adesão, fotos e objetivo do ciclo');if(c.progress.filter(item=>item.delta>0).length>=2)actions.push('Confirmar se a progressão de carga está compatível com técnica e GER');}
    if(bundle.feedbacks?.some(item=>item.read!==true))actions.push('Checar feedbacks ainda não lidos pelo aluno antes de enviar nova orientação');
    return[...new Set(actions)].slice(0,6);
  }

  function actionsHtml(){
    const actions=generatedActions();
    return`<section class="tb-insights-card"><h3>Gerador de próxima ação</h3><p>Checklist determinístico baseado nos dados do próprio aluno. Ele organiza os pontos para revisão; a decisão continua sendo do treinador.</p>${actions.length?actions.map((item,index)=>`<div class="tb-action-suggestion"><b>${index+1}</b><div>${h(item)}</div></div>`).join(''):'<div class="tb-action-suggestion"><b>✓</b><div>Nenhuma pendência relevante detectada. Manter acompanhamento normal.</div></div>'}</section>`;
  }

  function goalContext(){
    const schedule=bundle?.protocolSchedule,bounds=schedule&&dataApi()?.currentCycleBounds(schedule),raw=schedule?.cycleGoals&&typeof schedule.cycleGoals==='object'?schedule.cycleGoals:{};
    const key=bounds?.key||'',legacy=!raw.cycleKey,current=!raw.cycleKey||!key||String(raw.cycleKey)===key;
    return{schedule,bounds,key,raw,goals:current?raw:{},current,legacy};
  }
  function goals(){return goalContext().goals;}

  function goalProgress(){
    const context=goalContext(),bounds=context.bounds,g=context.goals;
    if(!bounds)return{g,bounds:null,sessions:0,reports:0,currentWeight:bundle?.checkins?.[0]?.weight||0};
    const sessions=(bundle.sessions||[]).filter(item=>iso(item.date)&&item.date>=bounds.start&&item.date<=bounds.end).length,reports=(bundle.checkins||[]).filter(item=>{const date=iso(item.submittedDate||item.dueDate);return date&&date>=bounds.start&&date<=bounds.end;}).length;
    return{g,bounds,sessions,reports,currentWeight:Number(bundle?.checkins?.[0]?.weight||0)};
  }
  const pct=(value,target)=>target>0?Math.max(0,Math.min(100,Math.round(value/target*100))):0;

  function goalsHtml(){
    const context=goalContext(),p=goalProgress(),g=p.g||{};
    if(!bundle?.protocolSchedule)return'<div class="tb-insights-empty">Configure primeiro o ciclo de atualização completa deste aluno para usar metas de ciclo.</div>';
    const weightTarget=Number(g.weightTargetKg)||0,startWeight=Number(g.weightStartKg)||0,currentWeight=Number(p.currentWeight)||0;
    let weightText=weightTarget?`${currentWeight?currentWeight.toLocaleString('pt-BR',{maximumFractionDigits:1})+' → ':''}${weightTarget.toLocaleString('pt-BR',{maximumFractionDigits:1})} kg`:'Não definida',weightPct=0;
    if(weightTarget&&startWeight&&currentWeight){weightPct=weightTarget===startWeight?(currentWeight===weightTarget?100:0):Math.max(0,Math.min(100,Math.round((currentWeight-startWeight)/(weightTarget-startWeight)*100)));}
    const stale=!context.current&&Object.keys(context.raw).length?'<p><b>NOVO CICLO:</b> as metas do ciclo anterior foram arquivadas. Defina as metas atuais antes de usar o progresso.</p>':'';
    return`<section class="tb-insights-card"><h3>Metas do ciclo</h3><p>${p.bounds?`Ciclo ${p.bounds.cycle} · ${fmtDate(p.bounds.start)} a ${fmtDate(p.bounds.end)}.`:'Metas vinculadas ao cronograma atual.'}</p>${stale}<div class="tb-goal-grid"><div class="tb-goal"><span>PESO-ALVO</span><strong>${h(weightText)}</strong><div class="tb-goal-bar"><i style="width:${weightPct}%"></i></div></div><div class="tb-goal"><span>SESSÕES</span><strong>${p.sessions}${Number(g.sessionsTarget)>0?' / '+Number(g.sessionsTarget):''}</strong><div class="tb-goal-bar"><i style="width:${pct(p.sessions,Number(g.sessionsTarget)||0)}%"></i></div></div><div class="tb-goal"><span>RELATÓRIOS</span><strong>${p.reports}${Number(g.reportsTarget)>0?' / '+Number(g.reportsTarget):''}</strong><div class="tb-goal-bar"><i style="width:${pct(p.reports,Number(g.reportsTarget)||0)}%"></i></div></div></div>${g.note?`<p><b>FOCO:</b> ${h(g.note)}</p>`:''}<div class="tb-review-actions"><button class="primary" type="button" data-tb-edit-goals>EDITAR METAS</button></div></section>`;
  }

  const reviewSteps=[
    {title:'Fotos e relatório',render:()=>{const item=bundle?.checkins?.[0];return item?`Último relatório: <b>${h(fmtDate(item.submittedDate||item.dueDate))}</b> · ${Array.isArray(item.photoIds)?item.photoIds.length:0} fotos. Abra o relatório e confira as evidências antes de avançar.`:'Nenhum relatório semanal disponível ainda.';}},
    {title:'Peso e evolução',render:()=>{const c=comparison();return c?`Peso atual: <b>${Number(c.current.weight||0).toLocaleString('pt-BR',{maximumFractionDigits:1})} kg</b>. Variação desde o relatório anterior: <b>${c.weightDelta>0?'+':''}${c.weightDelta.toLocaleString('pt-BR',{maximumFractionDigits:1})} kg</b>.`:'Ainda não há dois relatórios para comparação de peso.';}},
    {title:'Respostas do aluno',render:()=>{const item=bundle?.checkins?.[0];return item?`${Array.isArray(item.answers)?item.answers.length:0} respostas registradas. Abra o relatório para ler o conteúdo completo antes de decidir ajustes.`:'Sem respostas semanais disponíveis.';}},
    {title:'Performance de treino',render:()=>{const c=comparison(),recent=c?.currentStats||{count:bundle?.sessions?.length||0,sets:(bundle?.sessions||[]).reduce((sum,item)=>sum+(item.sets||[]).length,0)};return `${recent.count} registros de treino e ${recent.sets} séries no período analisado. Use a comparação de cargas para identificar progressões ou quedas relevantes.`;}},
    {title:'Treino atual',render:()=>{const active=(student()?.workouts||[]).find(item=>item.isActive)||(student()?.workouts||[])[0];return active?`Protocolo para revisão: <b>${h(active.name||'Treino atual')}</b>. Confira prescrição, técnicas, GER e aderência antes de alterar.`:'Nenhum treino carregado no arquivo do aluno.';}},
    {title:'Dieta e cardio',render:()=>`Revise dieta ativa, prescrição de cardio e aderência relatada. Não conclua a atualização apenas com base no peso isoladamente.`},
    {title:'Metas e próxima ação',render:()=>{const actions=generatedActions();return actions.length?`Prioridade sugerida: <b>${h(actions[0])}</b>. Confira também as metas do ciclo antes de fechar a revisão.`:'Metas e sinais atuais não indicam uma ação corretiva específica.';}},
    {title:'Feedback e conclusão',render:()=>`Registre o feedback detalhado e só então conclua a atualização completa. A conclusão usa o ciclo oficial do Team Bulls e não cria um estado paralelo.`}
  ];

  function reviewHtml(){
    const step=reviewSteps[Math.max(0,Math.min(reviewSteps.length-1,reviewStep))],pending=dataApi()?.protocolState(bundle?.protocolSchedule)?.pending===true;
    return`<div class="tb-review-progress">${reviewSteps.map((_,index)=>`<i class="${index<=reviewStep?'done':''}"></i>`).join('')}</div><section class="tb-review-step"><div class="kicker">ETAPA ${reviewStep+1} / ${reviewSteps.length}</div><h3>${h(step.title)}</h3><p>${step.render()}</p><div class="tb-review-actions">${reviewStep>0?'<button type="button" data-tb-review-prev>← ANTERIOR</button>':''}${reviewStep<reviewSteps.length-1?'<button class="primary" type="button" data-tb-review-next>PRÓXIMA →</button>':`<button type="button" data-tb-review-feedback>ENVIAR FEEDBACK</button><button class="primary" type="button" data-tb-review-complete ${pending?'':'disabled'}>CONCLUIR ATUALIZAÇÃO</button>`}</div></section>`;
  }

  function render(){
    ensureUi();const head=document.getElementById('tb-insights-head'),body=document.getElementById('tb-insights-body');if(!head||!body)return;
    document.querySelectorAll('[data-tb-insights-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tbInsightsTab===tab));
    const s=student();head.innerHTML=`<span>ARQUIVO INTELIGENTE</span><strong>${h(s?.name||'Aluno')}</strong><p>Dados reunidos somente quando esta análise é aberta. Nenhuma decisão é tomada automaticamente.</p>`;
    if(loading){body.innerHTML='<div class="tb-insights-loading">Carregando histórico deste aluno para análise...</div>';return;}
    if(!bundle){body.innerHTML='<div class="tb-insights-empty">Não foi possível carregar os dados deste aluno.</div>';return;}
    body.innerHTML=tab==='timeline'?timelineHtml():tab==='compare'?compareHtml():tab==='actions'?actionsHtml():tab==='goals'?goalsHtml():reviewHtml();
    body.querySelectorAll('[data-tb-open-checkin]').forEach(button=>button.addEventListener('click',()=>{if(typeof viewWeeklyCheckin==='function')viewWeeklyCheckin(button.dataset.tbOpenCheckin);}));
    body.querySelector('[data-tb-edit-goals]')?.addEventListener('click',openGoalEditor);
    body.querySelector('[data-tb-review-prev]')?.addEventListener('click',()=>{reviewStep=Math.max(0,reviewStep-1);render();});
    body.querySelector('[data-tb-review-next]')?.addEventListener('click',()=>{reviewStep=Math.min(reviewSteps.length-1,reviewStep+1);render();});
    body.querySelector('[data-tb-review-feedback]')?.addEventListener('click',()=>{if(typeof openFeedbackModal==='function')openFeedbackModal('protocol_update');});
    body.querySelector('[data-tb-review-complete]')?.addEventListener('click',()=>{if(typeof markProtocolReviewCompleted==='function')markProtocolReviewCompleted();});
  }

  async function load(force=false){
    if(!trainer()||!studentId||!dataApi())return;
    const target=String(studentId);
    if(loading&&loadingStudentId===target)return;
    const run=++serial;loading=true;loadingStudentId=target;render();
    try{
      const next=await dataApi().loadDeepStudent(target,force);
      if(run!==serial||studentId!==target||String(VIEW_STUDENT?.uid||'')!==target)return;
      bundle=next;
    }catch(error){
      if(run===serial&&studentId===target){console.error('Student insights',error);bundle=null;}
    }finally{
      if(run===serial&&studentId===target){loading=false;loadingStudentId='';render();}
    }
  }

  async function open(nextTab='timeline'){
    if(!trainer()||!VIEW_STUDENT)return;
    const target=String(VIEW_STUDENT.uid||'');if(!target)return;
    if(studentId!==target){serial++;studentId=target;bundle=null;loading=false;loadingStudentId='';}
    tab=['timeline','compare','actions','goals','review'].includes(nextTab)?nextTab:'timeline';reviewStep=0;
    ensureEntry();showScreen(SCREEN_ID);await load(false);
  }

  function openGoalEditor(){
    if(!bundle?.protocolSchedule||String(bundle.studentId||'')!==studentId){showToast?.('Configure primeiro o ciclo de atualização completa deste aluno.',true);return;}
    const g=goals();
    document.getElementById('tb-goal-weight').value=Number(g.weightTargetKg)>0?String(g.weightTargetKg):'';
    document.getElementById('tb-goal-sessions').value=Number(g.sessionsTarget)>0?String(g.sessionsTarget):'';
    document.getElementById('tb-goal-reports').value=Number(g.reportsTarget)>0?String(g.reportsTarget):'';
    document.getElementById('tb-goal-note').value=String(g.note||'');
    openModal(GOAL_MODAL);
  }

  async function saveGoals(){
    if(!trainer()||!studentId||!bundle?.protocolSchedule)return;
    const target=String(studentId),context=goalContext();if(String(VIEW_STUDENT?.uid||'')!==target)return;
    const weightRaw=document.getElementById('tb-goal-weight').value.trim(),sessionsRaw=document.getElementById('tb-goal-sessions').value.trim(),reportsRaw=document.getElementById('tb-goal-reports').value.trim(),note=document.getElementById('tb-goal-note').value.normalize('NFKC').trim();
    const weight=weightRaw?Number(weightRaw):0,sessions=sessionsRaw?Math.trunc(Number(sessionsRaw)):0,reports=reportsRaw?Math.trunc(Number(reportsRaw)):0;
    if(weightRaw&&(!Number.isFinite(weight)||weight<20||weight>500)){alert('Informe um peso-alvo entre 20 e 500 kg.');return;}
    if(sessionsRaw&&(!Number.isInteger(sessions)||sessions<0||sessions>300)){alert('Informe uma meta de 0 a 300 sessões.');return;}
    if(reportsRaw&&(!Number.isInteger(reports)||reports<0||reports>60)){alert('Informe uma meta de 0 a 60 relatórios.');return;}
    if(note.length>500){alert('O foco do ciclo deve ter até 500 caracteres.');return;}
    if(!beginAction?.('save-cycle-goals',GOAL_MODAL))return;
    try{
      const previous=context.raw||{},sameCycle=!previous.cycleKey||!context.key||String(previous.cycleKey)===context.key,currentWeight=Number(bundle.checkins?.[0]?.weight||0);
      const cycleGoals={weightTargetKg:weight,weightStartKg:sameCycle?(Number(previous.weightStartKg)||currentWeight||0):(currentWeight||0),sessionsTarget:sessions,reportsTarget:reports,note,cycleAnchor:String(bundle.protocolSchedule.startDate||''),cycleKey:context.key||String(bundle.protocolSchedule.startDate||''),cycleStartDate:String(context.bounds?.start||bundle.protocolSchedule.startDate||''),cycleNumber:Number(context.bounds?.cycle)||1};
      const payload={cycleGoals,cycleGoalsUpdatedBy:CURRENT_USER.uid,cycleGoalsUpdatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:CURRENT_USER.uid,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
      await cloudWrite(db.collection('protocolReviewSchedules').doc(target).set(payload,{merge:true}),'salvar metas do ciclo');
      dataApi().invalidateStudent(target);closeModal(GOAL_MODAL);
      if(studentId===target&&String(VIEW_STUDENT?.uid||'')===target&&bundle){bundle.protocolSchedule={...bundle.protocolSchedule,...payload,cycleGoals};render();}
      showToast?.('✓ Metas do ciclo atualizadas');
    }catch(error){alert(typeof cloudWriteError==='function'?cloudWriteError(error,'salvar metas do ciclo'):String(error?.message||error));}
    finally{endAction?.('save-cycle-goals',GOAL_MODAL);}
  }

  function patchStudentRender(){
    if(typeof renderTrainerStudent!=='function'||renderTrainerStudent.__tbStudentInsights)return;
    const base=renderTrainerStudent;
    const wrapped=async function(){const result=await base.apply(this,arguments);if(trainer()&&VIEW_STUDENT)ensureEntry();return result;};
    wrapped.__tbStudentInsights=true;wrapped.__tbBase=base;renderTrainerStudent=wrapped;
  }

  function patchLogout(){
    if(typeof confirmLogout!=='function'||confirmLogout.__tbStudentInsights)return;
    const base=confirmLogout;
    const wrapped=function(){studentId='';bundle=null;loading=false;loadingStudentId='';serial++;reviewStep=0;return base.apply(this,arguments);};
    wrapped.__tbStudentInsights=true;wrapped.__tbBase=base;confirmLogout=wrapped;
  }

  function install(){ensureUi();patchStudentRender();patchLogout();if(trainer()&&VIEW_STUDENT)ensureEntry();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('pageshow',()=>{if(trainer()&&VIEW_STUDENT)ensureEntry();},{passive:true});

  window.TeamBullsTrainerStudentInsights=Object.freeze({version:VERSION,open,refresh:()=>load(true),openGoals:()=>open('goals'),openReview:()=>open('review')});
})();
