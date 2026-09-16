/* Team Bulls v10.10.52 — arquivo de relatórios pela propriedade imutável do treinador. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_TRAINER_SENT_REPORTS_101052__)return;
  window.__TEAM_BULLS_TRAINER_SENT_REPORTS_101052__=true;
  window.__TEAM_BULLS_TRAINER_SENT_REPORTS_101046__=true;
  window.__TEAM_BULLS_TRAINER_SENT_REPORTS_101033__=true;

  const VERSION='10.10.52-sentreports3';
  const SCREEN_ID='screen-trainer-sent-reports';
  const ENTRY_ID='tb-trainer-sent-reports-entry';
  const STYLE_ID='tb-trainer-sent-reports-style-v3';
  const READ_TIMEOUT=8000;
  const MAX_REPORTS=500;
  let reports=[];
  let studentsById=new Map();
  let filter='all',search='',loading=false,loadSerial=0,loadError='',loadedTrainerUid='';

  const trainer=()=>{try{return CURRENT_USER?.role==='trainer'&&MODE==='cloud'&&!!db;}catch(error){return false;}};
  const trainerUid=()=>trainer()?String(CURRENT_USER?.uid||''):'';
  const h=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const millis=value=>{try{if(value?.toMillis)return value.toMillis();if(value?.seconds)return Number(value.seconds)*1000;const n=Number(value);return Number.isFinite(n)?n:0;}catch(error){return 0;}};
  const formatDate=value=>{const time=millis(value);if(!time)return'—';try{return new Date(time).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});}catch(error){return new Date(time).toLocaleString('pt-BR');}};
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const reportMode=report=>{const mode=String(report?.requestMode||'');if(['full','written','photos'].includes(mode))return mode;if(report?.requiresPhotos===false)return'written';if((report?.questions||[]).length===0&&report?.requiresPhotos!==false)return'photos';return'full';};
  const reportLabel=report=>{const mode=reportMode(report);if(mode==='written')return'Somente relatório escrito';if(mode==='photos')return'Somente 6 fotos';return report?.reportType==='custom'?'Relatório personalizado':'Relatório completo';};
  const reportMeta=report=>{const mode=reportMode(report),questions=Array.isArray(report?.questions)?report.questions.length:0;if(mode==='photos')return'6 fotos solicitadas';if(mode==='written')return`${questions} ${questions===1?'pergunta':'perguntas'} · sem fotos`;return`${questions} ${questions===1?'pergunta':'perguntas'} · 6 fotos`;};
  async function readOnce(reference,label,timeout=READ_TIMEOUT){if(typeof withTimeout==='function')return withTimeout(reference.get(),timeout,label);return Promise.race([reference.get(),new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error('Tempo esgotado: '+label),{code:'team-bulls/timeout'})),timeout))]);}

  function runtimeStudents(){
    try{const source=typeof TRAINER_STUDENTS!=='undefined'&&Array.isArray(TRAINER_STUDENTS)?TRAINER_STUDENTS:[];return source.map(row=>{const uid=String(row?.uid||row?.id||row?.studentId||'');return uid?{...row,uid}:null;}).filter(Boolean);}catch(error){return[];}
  }
  async function loadNames(uid){
    const map=new Map();
    try{
      const snap=await readOnce(db.collection('users').where('trainerId','==',uid).where('role','==','student').limit(500),'nomes dos alunos',6000);
      (snap.docs||[]).forEach(doc=>map.set(String(doc.id),{...doc.data(),uid:doc.id}));
    }catch(error){console.warn('[Team Bulls] nomes vinculados indisponíveis; relatórios continuam carregando.',error?.code||error?.message||error);}
    runtimeStudents().forEach(row=>{if(row.uid&&!map.has(row.uid))map.set(row.uid,row);});
    studentsById=map;return map;
  }
  function nameFor(studentId){const row=studentsById.get(String(studentId||''));if(row?.name)return String(row.name);if(row?.email)return String(row.email);const id=String(studentId||'');return id?`Aluno · ${id.slice(-6)}`:'Aluno';}

  function injectStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');style.id=STYLE_ID;style.textContent=`
      #${SCREEN_ID}{padding-bottom:88px}.tb-sent-reports-content{padding-top:14px}.tb-sent-reports-intro{padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:linear-gradient(145deg,rgba(225,29,72,.055),#111);margin-bottom:12px}.tb-sent-reports-intro strong{display:block;font:900 20px 'Barlow Condensed',sans-serif;color:#eee}.tb-sent-reports-intro span{display:block;margin-top:4px;font:500 10px/1.45 'DM Mono',monospace;color:#80756f}.tb-sent-reports-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0 12px}.tb-sent-reports-stat{padding:10px 11px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:#101010}.tb-sent-reports-stat span{display:block;font:700 8px 'DM Mono',monospace;color:#736a64}.tb-sent-reports-stat strong{display:block;margin-top:4px;font:900 21px 'Barlow Condensed',sans-serif;color:#eee}.tb-sent-reports-stat.pending strong{color:#f2ad64}.tb-sent-reports-stat.answered strong{color:#7cdaa0}.tb-sent-reports-toolbar{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px;padding:7px 0}.tb-sent-reports-toolbar button,.tb-sent-reports-toolbar input{min-height:40px;border:1px solid rgba(255,255,255,.09);border-radius:8px;background:#111;color:#aaa;padding:8px 10px}.tb-sent-reports-toolbar button{font:800 8px 'DM Mono',monospace}.tb-sent-reports-toolbar button.active{border-color:rgba(225,29,72,.55);background:rgba(225,29,72,.1);color:#fff}.tb-sent-reports-toolbar input{flex:1 1 190px;font:500 12px 'Barlow',sans-serif}.tb-sent-report-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;margin-bottom:8px;padding:12px;border:1px solid rgba(255,255,255,.075);border-radius:10px;background:#111}.tb-sent-report-main{min-width:0}.tb-sent-report-main strong{display:block;margin-top:5px;color:#eee;font:900 17px 'Barlow Condensed',sans-serif}.tb-sent-report-main p{margin:4px 0 0;color:#8a807a;font-size:10px}.tb-sent-report-kicker{display:flex;gap:7px;flex-wrap:wrap;color:#766d67;font:700 8px 'DM Mono',monospace}.tb-sent-report-status{border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:4px 7px}.tb-sent-report-status.pending{color:#f2ad64}.tb-sent-report-status.answered{color:#7cdaa0}.tb-sent-report-actions{display:flex;flex-direction:column;gap:5px}.tb-sent-report-actions button{border:1px solid rgba(255,255,255,.1);border-radius:7px;background:#151515;color:#aaa;padding:8px;font:800 8px 'DM Mono',monospace}.tb-sent-report-actions .open{border-color:rgba(225,29,72,.35);color:#ff7189}.tb-sent-reports-empty,.tb-sent-reports-loading,.tb-sent-reports-error{padding:26px 16px;border:1px dashed rgba(255,255,255,.1);border-radius:10px;text-align:center;color:#786e68;font:500 11px/1.5 'DM Mono',monospace}.tb-sent-reports-error{border-color:rgba(225,29,72,.45);color:#e75f78}.tb-sent-reports-error button{display:block;margin:12px auto 0}@media(max-width:520px){.tb-sent-reports-stats{grid-template-columns:1fr 1fr}.tb-sent-reports-stat:first-child{grid-column:1/-1}.tb-sent-report-card{grid-template-columns:1fr}.tb-sent-report-actions{flex-direction:row}.tb-sent-report-actions button{flex:1}}
    `;document.head.appendChild(style);
  }
  function cleanupLegacy(){document.getElementById(ENTRY_ID)?.remove();document.getElementById(SCREEN_ID)?.remove();}
  function ensureScreen(){
    if(document.getElementById(SCREEN_ID))return;const app=document.getElementById('app');if(!app)return;injectStyles();
    const screen=document.createElement('div');screen.className='screen';screen.id=SCREEN_ID;screen.innerHTML=`<div class="header"><button class="btn-icon" type="button" data-tb-sent-back>←</button><div class="header-title">RELATÓRIOS ENVIADOS</div></div><div class="content tb-sent-reports-content"><div class="tb-sent-reports-intro"><strong>Arquivo de solicitações</strong><span>Relatórios solicitados pela sua conta, inclusive respostas históricas vinculadas ao seu trainerId imutável.</span></div><div class="tb-sent-reports-stats" id="tb-sent-reports-stats"></div><div class="tb-sent-reports-toolbar"><button type="button" data-tb-sent-filter="all">TODOS</button><button type="button" data-tb-sent-filter="pending">AGUARDANDO</button><button type="button" data-tb-sent-filter="answered">RESPONDIDOS</button><input id="tb-sent-reports-search" type="search" maxlength="100" autocomplete="off" placeholder="Buscar aluno ou tipo..."><button type="button" id="tb-sent-reports-refresh">↻ ATUALIZAR</button></div><div id="tb-sent-reports-list"></div></div>`;app.appendChild(screen);
    screen.querySelector('[data-tb-sent-back]')?.addEventListener('click',()=>typeof goTrainer==='function'&&goTrainer());
    screen.querySelectorAll('[data-tb-sent-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.tbSentFilter||'all';render();}));
    screen.querySelector('#tb-sent-reports-search')?.addEventListener('input',event=>{search=normalize(event.target.value);render();});
    screen.querySelector('#tb-sent-reports-refresh')?.addEventListener('click',()=>load(true));
  }
  function ensureEntry(){if(!trainer())return;const home=document.querySelector('#screen-trainer .content');if(!home||document.getElementById(ENTRY_ID))return;const button=document.createElement('button');button.type='button';button.id=ENTRY_ID;button.className='btn-add-set';button.style.marginBottom='14px';button.textContent='📝 Relatórios enviados — histórico e pendências';button.addEventListener('click',open);const first=home.querySelector('.global-guide-manager-entry')||home.querySelector('.btn-add-set');if(first)first.insertAdjacentElement('afterend',button);else home.prepend(button);}
  function visibleReports(){return reports.filter(item=>{if(filter==='pending'&&item.answered)return false;if(filter==='answered'&&!item.answered)return false;if(!search)return true;return normalize(`${item._studentName} ${reportLabel(item)} ${reportMeta(item)}`).includes(search);});}
  function render(){
    ensureScreen();const stats=document.getElementById('tb-sent-reports-stats'),list=document.getElementById('tb-sent-reports-list');if(!stats||!list)return;
    const pending=reports.filter(item=>!item.answered).length,answered=reports.length-pending;stats.innerHTML=`<div class="tb-sent-reports-stat"><span>TOTAL ENVIADO</span><strong>${reports.length}</strong></div><div class="tb-sent-reports-stat pending"><span>AGUARDANDO</span><strong>${pending}</strong></div><div class="tb-sent-reports-stat answered"><span>RESPONDIDOS</span><strong>${answered}</strong></div>`;document.querySelectorAll('[data-tb-sent-filter]').forEach(button=>button.classList.toggle('active',button.dataset.tbSentFilter===filter));
    if(loading){list.innerHTML='<div class="tb-sent-reports-loading">Carregando solicitações enviadas...</div>';return;}if(loadError&&!reports.length){list.innerHTML=`<div class="tb-sent-reports-error">${h(loadError)}<button class="btn-ghost" type="button" data-tb-sent-retry>TENTAR NOVAMENTE</button></div>`;list.querySelector('[data-tb-sent-retry]')?.addEventListener('click',()=>load(true));return;}
    const visible=visibleReports();if(!visible.length){list.innerHTML=`<div class="tb-sent-reports-empty">${reports.length?'Nenhum relatório corresponde a este filtro.':'Nenhuma solicitação criada pela sua conta foi encontrada.'}</div>`;return;}
    list.innerHTML=visible.map(item=>{const status=item.answered?'answered':'pending',date=formatDate(item.createdAt);return`<article class="tb-sent-report-card"><div class="tb-sent-report-main"><div class="tb-sent-report-kicker"><span>${h(date)}</span><span class="tb-sent-report-status ${status}">${item.answered?'RESPONDIDO':'AGUARDANDO'}</span></div><strong>${h(item._studentName)}</strong><p>${h(reportLabel(item))} · ${h(reportMeta(item))}</p></div><div class="tb-sent-report-actions"><button type="button" class="open" data-tb-open-report="${h(item.id)}">${item.answered?'ABRIR RESPOSTA':'VER PEDIDO'}</button>${studentsById.has(String(item.studentId))?`<button type="button" data-tb-open-student="${h(item.studentId)}">ABRIR ALUNO</button>`:''}</div></article>`;}).join('');
    list.querySelectorAll('[data-tb-open-report]').forEach(button=>button.addEventListener('click',()=>openReport(button.dataset.tbOpenReport)));list.querySelectorAll('[data-tb-open-student]').forEach(button=>button.addEventListener('click',()=>openStudent(button.dataset.tbOpenStudent)));
  }
  async function load(force=false){
    if(!trainer()||loading)return false;const uid=trainerUid();if(!uid)return false;if(loadedTrainerUid&&loadedTrainerUid!==uid){reports=[];studentsById=new Map();}
    const serial=++loadSerial;loading=true;loadError='';render();
    try{
      const [,snapshot]=await Promise.all([loadNames(uid),readOnce(db.collection('questionnaires').where('trainerId','==',uid).limit(MAX_REPORTS),'relatórios pertencentes ao treinador',READ_TIMEOUT)]);
      if(serial!==loadSerial||trainerUid()!==uid)return false;
      reports=(snapshot.docs||[]).map(doc=>({...doc.data(),id:doc.id})).filter(report=>String(report.trainerId||'')===uid).map(report=>({...report,_studentName:nameFor(report.studentId)})).sort((a,b)=>millis(b.createdAt)-millis(a.createdAt)||String(b.id).localeCompare(String(a.id)));loadedTrainerUid=uid;return true;
    }catch(error){console.warn('[Team Bulls] arquivo por propriedade do treinador indisponível',error);loadError='Não foi possível carregar os relatórios da sua conta agora. Verifique a conexão e tente novamente.';return false;}
    finally{if(serial===loadSerial){loading=false;render();}}
  }
  async function open(){if(!trainer()){if(typeof showToast==='function')showToast('Este arquivo é exclusivo do treinador.',true);return;}ensureScreen();ensureEntry();if(typeof showScreen==='function')showScreen(SCREEN_ID);await load(true);}
  function pendingDetail(report){const title=document.getElementById('quest-view-title'),body=document.getElementById('quest-view-body');if(!body)return;if(title)title.textContent='Relatório enviado · aguardando';const questions=Array.isArray(report.questions)?report.questions:[];body.innerHTML=`<div class="tb-sent-report-card"><div><strong>${h(report._studentName)}</strong><p>${h(reportLabel(report))} · ${h(formatDate(report.createdAt))}</p><p>Status: AGUARDANDO RESPOSTA DO ALUNO</p></div></div>${reportMode(report)==='photos'?'<div class="no-data-inline">Solicitação de 6 fotos enviada ao aluno.</div>':questions.map((q,i)=>`<div class="no-data-inline"><b>${i+1}.</b> ${h(q)}</div>`).join('')}`;if(typeof openModal==='function')openModal('modal-view-quest');}
  async function openAnswered(report){if(typeof viewQuestionnaire!=='function'){pendingDetail(report);return;}let previous=[];try{previous=Array.isArray(TS_QUEST_CACHE)?TS_QUEST_CACHE.slice():[];}catch(error){}try{TS_QUEST_CACHE=[...previous.filter(item=>String(item.id)!==String(report.id)),report];await viewQuestionnaire(report.id,true);}catch(error){console.warn('[Team Bulls] resposta arquivada indisponível',error);if(typeof showToast==='function')showToast('Não foi possível abrir este relatório agora.',true);}finally{try{TS_QUEST_CACHE=previous;}catch(error){}}}
  function openReport(id){const report=reports.find(item=>String(item.id)===String(id));if(!report)return;if(report.answered)openAnswered(report);else pendingDetail(report);}
  function openStudent(uid){const student=studentsById.get(String(uid));if(!student)return;const api=window.TeamBullsTrainerRuntimeReliability;if(api?.openStudent){api.openStudent(student.uid,student.name,student.email,student.status);return;}if(typeof viewStudent==='function')viewStudent(student.uid,student.name||'Aluno',student.email||'',student.status||'active');}
  function install(){if(!trainer())return false;const wasActive=document.getElementById(SCREEN_ID)?.classList.contains('active');cleanupLegacy();ensureScreen();ensureEntry();if(wasActive&&typeof showScreen==='function')showScreen(SCREEN_ID);return true;}
  install();window.TeamBullsTrainerSentReports=Object.freeze({version:VERSION,open,refresh:()=>load(true),state:()=>({total:reports.length,loading,error:loadError,ownerQuery:true})});
})();
