/* Team Bulls v10.10.33 — arquivo global de solicitações de relatórios enviadas pelo treinador. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_TRAINER_SENT_REPORTS_101033__)return;
  window.__TEAM_BULLS_TRAINER_SENT_REPORTS_101033__=true;

  const VERSION='10.10.33-sentreports1';
  const SCREEN_ID='screen-trainer-sent-reports';
  const ENTRY_ID='tb-trainer-sent-reports-entry';
  const STYLE_ID='tb-trainer-sent-reports-style';
  const CONCURRENCY=4;
  let reports=[];
  let studentsById=new Map();
  let filter='all';
  let search='';
  let loading=false;
  let loadSerial=0;

  const trainer=()=>{try{return CURRENT_USER?.role==='trainer'&&MODE==='cloud'&&!!db;}catch(error){return false;}};
  const trainerUid=()=>trainer()?String(CURRENT_USER?.uid||''):'';
  const h=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const js=value=>JSON.stringify(String(value??''));
  const millis=value=>{try{if(value?.toMillis)return value.toMillis();if(value?.seconds)return Number(value.seconds)*1000;const n=Number(value);return Number.isFinite(n)?n:0;}catch(error){return 0;}};
  const formatDate=value=>{const time=millis(value);if(!time)return'—';try{return new Date(time).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});}catch(error){return new Date(time).toLocaleString('pt-BR');}};
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const reportMode=report=>{
    const mode=String(report?.requestMode||'');if(['full','written','photos'].includes(mode))return mode;
    if(report?.requiresPhotos===false)return'written';
    if((report?.questions||[]).length===0&&report?.requiresPhotos!==false)return'photos';
    return'full';
  };
  const reportLabel=report=>{
    const mode=reportMode(report);
    if(mode==='written')return'Somente relatório escrito';
    if(mode==='photos')return'Somente 6 fotos';
    return report?.reportType==='custom'?'Relatório personalizado':'Relatório completo';
  };
  const reportMeta=report=>{
    const mode=reportMode(report),questions=Array.isArray(report?.questions)?report.questions.length:0;
    if(mode==='photos')return'6 fotos solicitadas';
    if(mode==='written')return`${questions} ${questions===1?'pergunta':'perguntas'} · sem fotos`;
    return`${questions} ${questions===1?'pergunta':'perguntas'} · 6 fotos`;
  };

  async function mapWithLimit(items,limit,worker){
    const results=new Array(items.length);let cursor=0;
    const run=async()=>{while(true){const index=cursor++;if(index>=items.length)return;results[index]=await worker(items[index],index);}};
    await Promise.all(Array.from({length:Math.min(Math.max(1,limit),items.length)},run));
    return results;
  }

  function injectStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');style.id=STYLE_ID;style.textContent=`
      #${SCREEN_ID}{padding-bottom:88px}.tb-sent-reports-content{padding-top:14px}.tb-sent-reports-intro{padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:linear-gradient(145deg,rgba(225,29,72,.055),#111);margin-bottom:12px}.tb-sent-reports-intro strong{display:block;font:900 20px 'Barlow Condensed',sans-serif;color:#eee}.tb-sent-reports-intro span{display:block;margin-top:4px;font:500 10px/1.45 'DM Mono',monospace;color:#80756f}.tb-sent-reports-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0 12px}.tb-sent-reports-stat{padding:10px 11px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:#101010}.tb-sent-reports-stat span{display:block;font:700 8px 'DM Mono',monospace;color:#736a64;letter-spacing:.5px}.tb-sent-reports-stat strong{display:block;margin-top:4px;font:900 21px 'Barlow Condensed',sans-serif;color:#eee}.tb-sent-reports-stat.pending strong{color:#f2ad64}.tb-sent-reports-stat.answered strong{color:#7cdaa0}.tb-sent-reports-toolbar{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px;position:sticky;top:0;z-index:6;padding:7px 0;background:var(--bg,#0c0c0c)}.tb-sent-reports-toolbar button,.tb-sent-reports-toolbar input{min-height:36px;border:1px solid rgba(255,255,255,.09);border-radius:8px;background:#111;color:#aaa;padding:8px 10px}.tb-sent-reports-toolbar button{font:800 8px 'DM Mono',monospace;cursor:pointer}.tb-sent-reports-toolbar button.active{border-color:rgba(225,29,72,.55);background:rgba(225,29,72,.1);color:#fff}.tb-sent-reports-toolbar input{flex:1 1 190px;font:500 12px 'Barlow',sans-serif;outline:none}.tb-sent-report-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;width:100%;margin-bottom:8px;padding:12px;border:1px solid rgba(255,255,255,.075);border-radius:10px;background:#111;color:inherit;text-align:left}.tb-sent-report-card[data-status="pending"]{border-color:rgba(245,158,11,.22)}.tb-sent-report-card[data-status="answered"]{border-color:rgba(34,197,94,.18)}.tb-sent-report-main{min-width:0;cursor:pointer}.tb-sent-report-kicker{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font:700 8px 'DM Mono',monospace;color:#766d67;text-transform:uppercase;letter-spacing:.45px}.tb-sent-report-main strong{display:block;margin-top:5px;color:#eee;font:900 17px 'Barlow Condensed',sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tb-sent-report-main p{margin:4px 0 0;color:#8a807a;font-size:10px;line-height:1.4}.tb-sent-report-status{display:inline-flex;border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:4px 7px;font:800 8px 'DM Mono',monospace}.tb-sent-report-status.pending{color:#f2ad64;border-color:rgba(245,158,11,.3)}.tb-sent-report-status.answered{color:#7cdaa0;border-color:rgba(34,197,94,.3)}.tb-sent-report-actions{display:flex;flex-direction:column;align-items:stretch;gap:5px}.tb-sent-report-actions button{border:1px solid rgba(255,255,255,.1);border-radius:7px;background:#151515;color:#aaa;padding:7px 8px;font:800 8px 'DM Mono',monospace;cursor:pointer}.tb-sent-report-actions .open{border-color:rgba(225,29,72,.35);color:#ff7189;background:rgba(225,29,72,.06)}.tb-sent-reports-empty{padding:28px 16px;border:1px dashed rgba(255,255,255,.1);border-radius:10px;text-align:center;color:#786e68;font:500 11px/1.5 'DM Mono',monospace}.tb-sent-reports-loading{padding:24px;text-align:center;color:#80766f;font:600 10px 'DM Mono',monospace}.tb-sent-report-detail-meta{padding:10px 12px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:#101010;margin-bottom:12px}.tb-sent-report-detail-meta strong,.tb-sent-report-detail-meta span{display:block}.tb-sent-report-detail-meta strong{font:900 17px 'Barlow Condensed',sans-serif;color:#eee}.tb-sent-report-detail-meta span{margin-top:4px;color:#8b817a;font:500 9px/1.45 'DM Mono',monospace}.tb-sent-report-question{padding:9px 0;border-bottom:1px solid rgba(255,255,255,.055);color:#cfc6c0;font-size:12px;line-height:1.45}.tb-sent-report-question:last-child{border-bottom:0}@media(max-width:520px){.tb-sent-reports-stats{grid-template-columns:1fr 1fr}.tb-sent-reports-stat:first-child{grid-column:1/-1}.tb-sent-report-card{grid-template-columns:1fr}.tb-sent-report-actions{flex-direction:row}.tb-sent-report-actions button{flex:1}}
    `;document.head.appendChild(style);
  }

  function ensureScreen(){
    if(document.getElementById(SCREEN_ID))return;
    const app=document.getElementById('app');if(!app)return;
    const screen=document.createElement('div');screen.className='screen';screen.id=SCREEN_ID;
    screen.innerHTML=`<div class="header"><button class="btn-icon" type="button" onclick="goTrainer()">←</button><div class="header-title">RELATÓRIOS ENVIADOS</div></div><div class="content tb-sent-reports-content"><div class="tb-sent-reports-intro"><strong>Arquivo de solicitações</strong><span>Veja os relatórios que você enviou, quem ainda não respondeu e abra respostas/fotos já recebidas.</span></div><div class="tb-sent-reports-stats" id="tb-sent-reports-stats"></div><div class="tb-sent-reports-toolbar"><button type="button" data-tb-sent-filter="all">TODOS</button><button type="button" data-tb-sent-filter="pending">AGUARDANDO</button><button type="button" data-tb-sent-filter="answered">RESPONDIDOS</button><input id="tb-sent-reports-search" type="search" maxlength="100" autocomplete="off" placeholder="Buscar aluno ou tipo..."><button type="button" id="tb-sent-reports-refresh">↻ ATUALIZAR</button></div><div id="tb-sent-reports-list"></div></div>`;
    app.appendChild(screen);
    screen.querySelectorAll('[data-tb-sent-filter]').forEach(button=>button.addEventListener('click',()=>setFilter(button.dataset.tbSentFilter)));
    screen.querySelector('#tb-sent-reports-search')?.addEventListener('input',event=>{search=normalize(event.target.value);render();});
    screen.querySelector('#tb-sent-reports-refresh')?.addEventListener('click',()=>load(true));
  }

  function ensureEntry(){
    if(!trainer())return;
    const home=document.querySelector('#screen-trainer .content');if(!home||document.getElementById(ENTRY_ID))return;
    const button=document.createElement('button');button.type='button';button.id=ENTRY_ID;button.className='btn-add-set';button.style.marginBottom='14px';button.textContent='📝 Relatórios enviados — histórico e pendências';button.addEventListener('click',open);
    const first=home.querySelector('.global-guide-manager-entry')||home.querySelector('.btn-add-set');
    if(first)first.insertAdjacentElement('afterend',button);else home.prepend(button);
  }

  function statsHtml(){
    const total=reports.length,pending=reports.filter(item=>!item.answered).length,answered=total-pending;
    return`<div class="tb-sent-reports-stat"><span>TOTAL ENVIADO</span><strong>${total}</strong></div><div class="tb-sent-reports-stat pending"><span>AGUARDANDO</span><strong>${pending}</strong></div><div class="tb-sent-reports-stat answered"><span>RESPONDIDOS</span><strong>${answered}</strong></div>`;
  }
  function visibleReports(){
    return reports.filter(item=>{
      if(filter==='pending'&&item.answered)return false;if(filter==='answered'&&!item.answered)return false;
      if(!search)return true;
      return normalize(`${item._studentName} ${reportLabel(item)} ${reportMeta(item)}`).includes(search);
    });
  }
  function render(){
    ensureScreen();
    const stats=document.getElementById('tb-sent-reports-stats'),list=document.getElementById('tb-sent-reports-list');if(!stats||!list)return;
    stats.innerHTML=statsHtml();
    document.querySelectorAll('[data-tb-sent-filter]').forEach(button=>button.classList.toggle('active',button.dataset.tbSentFilter===filter));
    if(loading){list.innerHTML='<div class="tb-sent-reports-loading">Carregando solicitações enviadas...</div>';return;}
    const items=visibleReports();
    if(!items.length){list.innerHTML=`<div class="tb-sent-reports-empty">${reports.length?'Nenhum relatório corresponde a este filtro.':'Nenhuma solicitação de relatório foi encontrada para seus alunos.'}</div>`;return;}
    list.innerHTML=items.map(item=>{
      const status=item.answered?'answered':'pending',student=studentsById.get(String(item.studentId))||{},date=formatDate(item.createdAt);
      return`<article class="tb-sent-report-card" data-status="${status}"><div class="tb-sent-report-main" role="button" tabindex="0" data-tb-open-report="${h(item.id)}"><div class="tb-sent-report-kicker"><span>${h(date)}</span><span class="tb-sent-report-status ${status}">${item.answered?'RESPONDIDO':'AGUARDANDO'}</span></div><strong>${h(item._studentName||student.name||'Aluno')}</strong><p>${h(reportLabel(item))} · ${h(reportMeta(item))}</p></div><div class="tb-sent-report-actions"><button type="button" class="open" data-tb-open-report="${h(item.id)}">${item.answered?'ABRIR RESPOSTA':'VER PEDIDO'}</button><button type="button" data-tb-open-student="${h(item.studentId)}">ABRIR ALUNO</button></div></article>`;
    }).join('');
    list.querySelectorAll('[data-tb-open-report]').forEach(control=>{const run=()=>openReport(control.dataset.tbOpenReport);control.addEventListener('click',run);control.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();run();}});});
    list.querySelectorAll('[data-tb-open-student]').forEach(button=>button.addEventListener('click',()=>openStudent(button.dataset.tbOpenStudent)));
  }

  function setFilter(next){filter=['all','pending','answered'].includes(next)?next:'all';render();}
  async function load(force=false){
    if(!trainer()||loading)return false;
    const uid=trainerUid();if(!uid)return false;
    const serial=++loadSerial;loading=true;render();
    try{
      const studentsSnap=await cloudGet(db.collection('users').where('trainerId','==',uid),'alunos vinculados para relatórios');
      if(serial!==loadSerial||trainerUid()!==uid)return false;
      const students=(studentsSnap.docs||[]).map(doc=>({...doc.data(),uid:doc.id})).filter(item=>item.role==='student'&&String(item.trainerId||'')===uid);
      studentsById=new Map(students.map(item=>[String(item.uid),item]));
      const groups=await mapWithLimit(students,CONCURRENCY,async student=>{
        try{
          const snapshot=await cloudGet(db.collection('questionnaires').where('studentId','==',student.uid),'relatórios enviados para '+String(student.name||'aluno').slice(0,60));
          if(serial!==loadSerial||trainerUid()!==uid)return[];
          return(snapshot.docs||[]).map(doc=>({...doc.data(),id:doc.id})).filter(report=>!report.trainerId||String(report.trainerId)===uid).map(report=>({...report,_studentName:student.name||'Aluno',_studentEmail:student.email||'',_studentStatus:student.status||'active'}));
        }catch(error){console.warn('[Team Bulls] histórico de relatórios indisponível para um aluno',student.uid,error?.code||error?.message||error);return[];}
      });
      if(serial!==loadSerial||trainerUid()!==uid)return false;
      reports=groups.flat().sort((a,b)=>millis(b.createdAt)-millis(a.createdAt)||String(b.id).localeCompare(String(a.id)));
      return true;
    }catch(error){
      console.warn('[Team Bulls] arquivo de relatórios enviados indisponível',error);if(typeof showToast==='function')showToast('Não foi possível carregar o histórico de relatórios agora.',true);return false;
    }finally{if(serial===loadSerial){loading=false;render();}}
  }

  async function open(){
    if(!trainer()){if(typeof showToast==='function')showToast('Este arquivo é exclusivo do treinador.',true);return;}
    ensureScreen();ensureEntry();showScreen(SCREEN_ID);await load(true);
  }
  function pendingDetail(report){
    const title=document.getElementById('quest-view-title'),body=document.getElementById('quest-view-body');if(!body)return;
    if(title)title.textContent='Relatório enviado · aguardando';
    const mode=reportMode(report),questions=Array.isArray(report.questions)?report.questions:[];
    body.innerHTML=`<div class="tb-sent-report-detail-meta"><strong>${h(report._studentName||'Aluno')}</strong><span>${h(reportLabel(report))} · enviado em ${h(formatDate(report.createdAt))}</span><span>Status: AGUARDANDO RESPOSTA DO ALUNO</span></div>${mode==='photos'?'<div class="no-data-inline">Solicitação enviada para o aluno anexar as 6 fotos obrigatórias.</div>':questions.map((question,index)=>`<div class="tb-sent-report-question"><b>${index+1}.</b> ${h(question)}</div>`).join('')||'<div class="no-data-inline">Esta solicitação não possui perguntas registradas.</div>'}`;
    openModal('modal-view-quest');
  }
  async function openAnswered(report){
    if(typeof viewQuestionnaire!=='function'){pendingDetail(report);return;}
    let previous=[];try{previous=Array.isArray(TS_QUEST_CACHE)?TS_QUEST_CACHE.slice():[];}catch(error){}
    try{TS_QUEST_CACHE=[...previous.filter(item=>String(item.id)!==String(report.id)),report];await viewQuestionnaire(report.id,true);}
    catch(error){console.warn('[Team Bulls] não foi possível abrir resposta arquivada',error);if(typeof showToast==='function')showToast('Não foi possível abrir este relatório agora.',true);}
    finally{try{TS_QUEST_CACHE=previous;}catch(error){}}
  }
  function openReport(id){const report=reports.find(item=>String(item.id)===String(id));if(!report)return;if(report.answered)openAnswered(report);else pendingDetail(report);}
  function openStudent(uid){
    const student=studentsById.get(String(uid));if(!student||typeof viewStudent!=='function')return;
    viewStudent(String(student.uid),String(student.name||'Aluno'),String(student.email||''),String(student.status||'active'));
  }

  function install(){if(!trainer())return false;injectStyles();ensureScreen();ensureEntry();return true;}
  window.TeamBullsTrainerSentReports=Object.freeze({version:VERSION,open,refresh:()=>load(true),state:()=>({total:reports.length,pending:reports.filter(item=>!item.answered).length,answered:reports.filter(item=>item.answered).length,loading,filter})});
  install();
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('team-bulls-runtime-state',install);
  window.addEventListener('pageshow',install,{passive:true});
})();
