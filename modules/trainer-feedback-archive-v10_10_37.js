/* Team Bulls v10.10.37 — histórico completo de feedbacks enviados pelo treinador. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_TRAINER_FEEDBACK_ARCHIVE_101037__)return;
  window.__TEAM_BULLS_TRAINER_FEEDBACK_ARCHIVE_101037__=true;

  const VERSION='10.10.37-feedbackarchive1';
  const SCREEN_ID='screen-trainer-feedback-archive';
  const DETAIL_ID='modal-trainer-feedback-detail';
  const ENTRY_ID='tb-trainer-feedback-archive-entry';
  const STYLE_ID='tb-trainer-feedback-archive-style';
  const CONCURRENCY=4;
  let feedbacks=[];
  let studentsById=new Map();
  let filter='all';
  let search='';
  let loading=false;
  let loadSerial=0;
  let loadedTrainerUid='';

  const trainer=()=>{try{return CURRENT_USER?.role==='trainer'&&MODE==='cloud'&&!!db;}catch(error){return false;}};
  const trainerUid=()=>trainer()?String(CURRENT_USER?.uid||''):'';
  const h=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const millis=value=>{try{if(value?.toMillis)return value.toMillis();if(value?.seconds)return Number(value.seconds)*1000;const n=Number(value);return Number.isFinite(n)?n:0;}catch(error){return 0;}};
  const formatDate=value=>{const time=millis(value);if(!time)return'Data indisponível';try{return new Date(time).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});}catch(error){return new Date(time).toLocaleString('pt-BR');}};
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const typeOf=item=>['general','weekly_report','protocol_update'].includes(String(item?.feedbackType))?String(item.feedbackType):'general';
  const typeLabel=item=>{const type=typeOf(item);if(type==='weekly_report')return'Relatório semanal';if(type==='protocol_update')return'Atualização completa';return'Feedback geral';};
  const titleOf=item=>String(item?.title||'').trim()||(typeOf(item)==='weekly_report'?'Feedback do relatório semanal':typeOf(item)==='protocol_update'?'Feedback da atualização completa':'Transmissão enviada');
  const preview=value=>{const text=String(value||'').replace(/\s+/g,' ').trim();return text.length>180?text.slice(0,177)+'...':text;};

  async function mapWithLimit(items,limit,worker){
    const results=new Array(items.length);let cursor=0;
    const run=async()=>{while(true){const index=cursor++;if(index>=items.length)return;results[index]=await worker(items[index],index);}};
    await Promise.all(Array.from({length:Math.min(Math.max(1,limit),items.length)},run));
    return results;
  }

  function clearState(){
    feedbacks=[];studentsById=new Map();filter='all';search='';loading=false;loadSerial++;loadedTrainerUid='';
    const input=document.getElementById('tb-feedback-archive-search');if(input)input.value='';
    const list=document.getElementById('tb-feedback-archive-list');if(list)list.innerHTML='';
    try{closeModal(DETAIL_ID);}catch(error){}
  }

  function injectStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');style.id=STYLE_ID;style.textContent=`
      #${SCREEN_ID}{padding-bottom:88px}.tb-feedback-archive-content{padding-top:14px}.tb-feedback-archive-intro{padding:14px;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:linear-gradient(145deg,rgba(225,29,72,.055),#111);margin-bottom:12px}.tb-feedback-archive-intro strong{display:block;font:900 20px 'Barlow Condensed',sans-serif;color:#eee}.tb-feedback-archive-intro span{display:block;margin-top:4px;font:500 10px/1.5 'DM Mono',monospace;color:#80756f}.tb-feedback-archive-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0 12px}.tb-feedback-archive-stat{padding:10px 11px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:#101010}.tb-feedback-archive-stat span{display:block;font:700 8px 'DM Mono',monospace;color:#736a64;letter-spacing:.5px}.tb-feedback-archive-stat strong{display:block;margin-top:4px;font:900 21px 'Barlow Condensed',sans-serif;color:#eee}.tb-feedback-archive-stat.unread strong{color:#f2ad64}.tb-feedback-archive-stat.read strong{color:#7cdaa0}.tb-feedback-archive-toolbar{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:12px;position:sticky;top:0;z-index:6;padding:7px 0;background:var(--bg,#0c0c0c)}.tb-feedback-archive-toolbar button,.tb-feedback-archive-toolbar input{min-height:36px;border:1px solid rgba(255,255,255,.09);border-radius:8px;background:#111;color:#aaa;padding:8px 10px}.tb-feedback-archive-toolbar button{font:800 8px 'DM Mono',monospace;cursor:pointer}.tb-feedback-archive-toolbar button.active{border-color:rgba(225,29,72,.55);background:rgba(225,29,72,.1);color:#fff}.tb-feedback-archive-toolbar input{flex:1 1 190px;font:500 12px 'Barlow',sans-serif;outline:none}.tb-feedback-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;width:100%;margin-bottom:8px;padding:12px;border:1px solid rgba(255,255,255,.075);border-radius:10px;background:#111;color:inherit;text-align:left}.tb-feedback-card[data-read="false"]{border-color:rgba(245,158,11,.22)}.tb-feedback-card-main{min-width:0;cursor:pointer}.tb-feedback-card-kicker{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font:700 8px 'DM Mono',monospace;color:#766d67;text-transform:uppercase;letter-spacing:.45px}.tb-feedback-card-main strong{display:block;margin-top:5px;color:#eee;font:900 17px 'Barlow Condensed',sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tb-feedback-card-main p{margin:4px 0 0;color:#8a807a;font-size:10px;line-height:1.45}.tb-feedback-status{display:inline-flex;border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:4px 7px;font:800 8px 'DM Mono',monospace}.tb-feedback-status.unread{color:#f2ad64;border-color:rgba(245,158,11,.3)}.tb-feedback-status.read{color:#7cdaa0;border-color:rgba(34,197,94,.3)}.tb-feedback-card-actions{display:flex;flex-direction:column;align-items:stretch;gap:5px}.tb-feedback-card-actions button{border:1px solid rgba(255,255,255,.1);border-radius:7px;background:#151515;color:#aaa;padding:7px 8px;font:800 8px 'DM Mono',monospace;cursor:pointer}.tb-feedback-card-actions .open{border-color:rgba(225,29,72,.35);color:#ff7189;background:rgba(225,29,72,.06)}.tb-feedback-archive-empty,.tb-feedback-archive-loading{padding:26px 16px;border:1px dashed rgba(255,255,255,.1);border-radius:10px;text-align:center;color:#786e68;font:500 11px/1.5 'DM Mono',monospace}.tb-feedback-detail-meta{padding:10px 12px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:#101010;margin-bottom:12px}.tb-feedback-detail-meta strong,.tb-feedback-detail-meta span{display:block}.tb-feedback-detail-meta strong{font:900 18px 'Barlow Condensed',sans-serif;color:#eee}.tb-feedback-detail-meta span{margin-top:4px;color:#8b817a;font:500 9px/1.45 'DM Mono',monospace}.tb-feedback-detail-message{max-height:52vh;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:13px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:#0f0f0f;color:#d4cbc5;font:500 12px/1.6 'Barlow',sans-serif;margin-bottom:12px}@media(max-width:520px){.tb-feedback-archive-stats{grid-template-columns:1fr 1fr}.tb-feedback-archive-stat:first-child{grid-column:1/-1}.tb-feedback-card{grid-template-columns:1fr}.tb-feedback-card-actions{flex-direction:row}.tb-feedback-card-actions button{flex:1}}
    `;document.head.appendChild(style);
  }

  function ensureScreen(){
    if(document.getElementById(SCREEN_ID))return;
    const app=document.getElementById('app');if(!app)return;
    const screen=document.createElement('div');screen.className='screen';screen.id=SCREEN_ID;
    screen.innerHTML=`<div class="header"><button class="btn-icon" type="button" onclick="goTrainer()">←</button><div class="header-title">FEEDBACKS ENVIADOS</div></div><div class="content tb-feedback-archive-content"><div class="tb-feedback-archive-intro"><strong>Histórico completo de feedbacks</strong><span>Todos os feedbacks que você já enviou aos alunos vinculados continuam disponíveis aqui. Os próximos entram no mesmo histórico automaticamente quando forem enviados.</span></div><div class="tb-feedback-archive-stats" id="tb-feedback-archive-stats"></div><div class="tb-feedback-archive-toolbar"><button type="button" data-tb-feedback-filter="all">TODOS</button><button type="button" data-tb-feedback-filter="unread">NÃO LIDOS</button><button type="button" data-tb-feedback-filter="read">LIDOS</button><input id="tb-feedback-archive-search" type="search" maxlength="120" autocomplete="off" placeholder="Buscar aluno, título, tipo ou mensagem..."><button type="button" id="tb-feedback-archive-refresh">↻ ATUALIZAR</button></div><div id="tb-feedback-archive-list"></div></div>`;
    app.appendChild(screen);
    const modal=document.createElement('div');modal.className='modal-backdrop';modal.id=DETAIL_ID;
    modal.innerHTML=`<div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title">FEEDBACK ENVIADO</div><div id="tb-feedback-detail-meta" class="tb-feedback-detail-meta"></div><div id="tb-feedback-detail-message" class="tb-feedback-detail-message"></div><button class="btn-primary" type="button" id="tb-feedback-detail-student">ABRIR ALUNO</button><button class="btn-ghost" type="button" data-tb-feedback-detail-close>FECHAR</button></div>`;
    app.appendChild(modal);
    screen.querySelectorAll('[data-tb-feedback-filter]').forEach(button=>button.addEventListener('click',()=>setFilter(button.dataset.tbFeedbackFilter)));
    screen.querySelector('#tb-feedback-archive-search')?.addEventListener('input',event=>{search=normalize(event.target.value);render();});
    screen.querySelector('#tb-feedback-archive-refresh')?.addEventListener('click',()=>load(true));
    modal.querySelector('[data-tb-feedback-detail-close]')?.addEventListener('click',()=>closeModal(DETAIL_ID));
  }

  function ensureEntry(){
    if(!trainer())return;
    const home=document.querySelector('#screen-trainer .content');if(!home||document.getElementById(ENTRY_ID))return;
    const button=document.createElement('button');button.type='button';button.id=ENTRY_ID;button.className='btn-add-set';button.style.marginBottom='14px';button.textContent='✉ Feedbacks enviados — histórico completo';button.addEventListener('click',open);
    const reports=document.getElementById('tb-trainer-sent-reports-entry');
    if(reports)reports.insertAdjacentElement('afterend',button);else{const first=home.querySelector('.global-guide-manager-entry')||home.querySelector('.btn-add-set');if(first)first.insertAdjacentElement('afterend',button);else home.prepend(button);}
  }

  function statsHtml(){
    const total=feedbacks.length,read=feedbacks.filter(item=>item.read===true).length,unread=total-read;
    return`<div class="tb-feedback-archive-stat"><span>TOTAL ENVIADO</span><strong>${total}</strong></div><div class="tb-feedback-archive-stat unread"><span>NÃO LIDOS</span><strong>${unread}</strong></div><div class="tb-feedback-archive-stat read"><span>LIDOS</span><strong>${read}</strong></div>`;
  }
  function visibleFeedbacks(){
    return feedbacks.filter(item=>{
      if(filter==='unread'&&item.read===true)return false;if(filter==='read'&&item.read!==true)return false;
      if(!search)return true;
      return normalize(`${item._studentName} ${titleOf(item)} ${typeLabel(item)} ${item.message||''}`).includes(search);
    });
  }
  function render(){
    ensureScreen();
    const stats=document.getElementById('tb-feedback-archive-stats'),list=document.getElementById('tb-feedback-archive-list');if(!stats||!list)return;
    stats.innerHTML=statsHtml();
    document.querySelectorAll('[data-tb-feedback-filter]').forEach(button=>button.classList.toggle('active',button.dataset.tbFeedbackFilter===filter));
    if(loading){list.innerHTML='<div class="tb-feedback-archive-loading">Carregando histórico completo de feedbacks...</div>';return;}
    const items=visibleFeedbacks();
    if(!items.length){list.innerHTML=`<div class="tb-feedback-archive-empty">${feedbacks.length?'Nenhum feedback corresponde a este filtro.':'Nenhum feedback enviado foi encontrado para seus alunos vinculados.'}</div>`;return;}
    list.innerHTML=items.map(item=>{
      const read=item.read===true,student=studentsById.get(String(item.studentId))||{},date=formatDate(item.createdAt);
      return`<article class="tb-feedback-card" data-read="${read?'true':'false'}"><div class="tb-feedback-card-main" role="button" tabindex="0" data-tb-open-feedback="${h(item.id)}"><div class="tb-feedback-card-kicker"><span>${h(date)}</span><span>${h(typeLabel(item))}</span><span class="tb-feedback-status ${read?'read':'unread'}">${read?'LIDO':'NÃO LIDO'}</span></div><strong>${h(item._studentName||student.name||'Aluno')} · ${h(titleOf(item))}</strong><p>${h(preview(item.message)||'Sem conteúdo disponível.')}</p></div><div class="tb-feedback-card-actions"><button type="button" class="open" data-tb-open-feedback="${h(item.id)}">ABRIR FEEDBACK</button><button type="button" data-tb-open-feedback-student="${h(item.studentId)}">ABRIR ALUNO</button></div></article>`;
    }).join('');
    list.querySelectorAll('[data-tb-open-feedback]').forEach(control=>{const run=()=>openFeedback(control.dataset.tbOpenFeedback);control.addEventListener('click',run);control.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();run();}});});
    list.querySelectorAll('[data-tb-open-feedback-student]').forEach(button=>button.addEventListener('click',()=>openStudent(button.dataset.tbOpenFeedbackStudent)));
  }

  function setFilter(next){filter=['all','unread','read'].includes(next)?next:'all';render();}

  async function load(force=false){
    if(!trainer()||loading)return false;
    const uid=trainerUid();if(!uid)return false;
    if(loadedTrainerUid&&loadedTrainerUid!==uid){feedbacks=[];studentsById=new Map();}
    const serial=++loadSerial;loading=true;render();
    try{
      const studentsSnap=await cloudGet(db.collection('users').where('trainerId','==',uid),'alunos vinculados para histórico de feedbacks');
      if(serial!==loadSerial||trainerUid()!==uid)return false;
      const students=(studentsSnap.docs||[]).map(doc=>({...doc.data(),uid:doc.id})).filter(item=>item.role==='student'&&String(item.trainerId||'')===uid);
      studentsById=new Map(students.map(item=>[String(item.uid),item]));
      const groups=await mapWithLimit(students,CONCURRENCY,async student=>{
        try{
          const snapshot=await cloudGet(db.collection('feedback').where('studentId','==',student.uid),'feedbacks enviados para '+String(student.name||'aluno').slice(0,60));
          if(serial!==loadSerial||trainerUid()!==uid)return[];
          return(snapshot.docs||[]).map(doc=>({...doc.data(),id:doc.id})).filter(item=>String(item.trainerId||'')===uid).map(item=>({...item,_studentName:student.name||'Aluno',_studentEmail:student.email||'',_studentStatus:student.status||'active'}));
        }catch(error){console.warn('[Team Bulls] histórico de feedbacks indisponível para um aluno',student.uid,error?.code||error?.message||error);return[];}
      });
      if(serial!==loadSerial||trainerUid()!==uid)return false;
      feedbacks=groups.flat().sort((a,b)=>millis(b.createdAt)-millis(a.createdAt)||String(b.id).localeCompare(String(a.id)));
      loadedTrainerUid=uid;return true;
    }catch(error){
      console.warn('[Team Bulls] não foi possível carregar o histórico de feedbacks',error?.code||error?.message||error);
      if(typeof showToast==='function')showToast('Não foi possível carregar os feedbacks enviados agora.',true);return false;
    }finally{
      if(serial===loadSerial){loading=false;render();}
    }
  }

  function openFeedback(id){
    const item=feedbacks.find(value=>String(value.id)===String(id));if(!item)return;
    ensureScreen();const student=studentsById.get(String(item.studentId))||{};
    const meta=document.getElementById('tb-feedback-detail-meta'),message=document.getElementById('tb-feedback-detail-message'),button=document.getElementById('tb-feedback-detail-student');
    if(meta)meta.innerHTML=`<strong>${h(titleOf(item))}</strong><span>${h(item._studentName||student.name||'Aluno')} · ${h(typeLabel(item))} · ${h(formatDate(item.createdAt))}</span><span>Status no aluno: ${item.read===true?'LIDO':'AINDA NÃO LIDO'}</span>`;
    if(message)message.textContent=String(item.message||'');
    if(button){button.dataset.studentUid=String(item.studentId||'');button.onclick=()=>openStudent(button.dataset.studentUid);}
    openModal(DETAIL_ID);
  }
  function openStudent(uid){
    const student=studentsById.get(String(uid));if(!student||typeof viewStudent!=='function')return;
    try{closeModal(DETAIL_ID);}catch(error){}
    viewStudent(String(student.uid),String(student.name||'Aluno'),String(student.email||''),String(student.status||'active'));
  }
  function open(){if(!trainer())return false;install();showScreen(SCREEN_ID);load(true);return true;}

  function installLogoutGuard(){
    try{
      if(typeof confirmLogout!=='function'||confirmLogout.__tbFeedbackArchiveClear)return;
      const base=confirmLogout;const wrapped=function(){clearState();return base.apply(this,arguments);};wrapped.__tbFeedbackArchiveClear=true;wrapped.__tbBase=base;confirmLogout=wrapped;
    }catch(error){}
  }
  function install(){if(!trainer())return false;injectStyles();ensureScreen();ensureEntry();installLogoutGuard();return true;}

  window.TeamBullsTrainerFeedbackArchive=Object.freeze({version:VERSION,open,refresh:()=>load(true),state:()=>({total:feedbacks.length,unread:feedbacks.filter(item=>item.read!==true).length,read:feedbacks.filter(item=>item.read===true).length,loading,filter})});
  install();
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('team-bulls-runtime-state',install);
  window.addEventListener('pageshow',install,{passive:true});
})();
