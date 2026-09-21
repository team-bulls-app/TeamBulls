(()=>{
  'use strict';
  if(window.__TEAM_BULLS_TRAINER_INBOX_PAYMENTS_101012__)return;
  window.__TEAM_BULLS_TRAINER_INBOX_PAYMENTS_101012__=true;

  const VERSION='10.10.12-inboxpayments2';
  const ACTIVITY_INDEX_VERSION=1;
  const PAYMENT_MAX_FILE=15*1024*1024;
  const ACTIVITY_LIMIT=200;
  const PAYMENT_LIMIT=500;
  let activityUnsub=null,paymentUnsub=null,listenerPrimed=false,trainerInitUid='';
  let activityEvents=[],protocolDue=[],students=[],paymentRecords=[];
  let inboxFilter='all',paymentSearch='',paymentEditorId='',paymentFile=null,paymentPreviewUrl='';
  const studentMap=new Map();

  const trainer=()=>typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role==='trainer'&&typeof MODE!=='undefined'&&MODE==='cloud';
  const student=()=>typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role==='student'&&typeof MODE!=='undefined'&&MODE==='cloud';
  const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const js=value=>JSON.stringify(String(value??''));
  const cleanId=value=>String(value??'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,190);
  const iso=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):'';
  const pad=value=>String(value).padStart(2,'0');
  const toast=(message,error=false)=>typeof showToast==='function'?showToast(message,error):undefined;
  const nowStamp=()=>firebase.firestore.FieldValue.serverTimestamp();
  const ms=value=>{try{if(value?.toMillis)return value.toMillis();if(value?.seconds)return Number(value.seconds)*1000;const n=Number(value);return Number.isFinite(n)?n:0;}catch(error){return 0;}};
  const fmtDate=value=>{try{return typeof fmt==='function'?fmt(value):String(value||'');}catch(error){return String(value||'');}};
  const formatMoney=cents=>(Number(cents||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const dateUtc=value=>{const v=iso(value);if(!v)return null;const [y,m,d]=v.split('-').map(Number);return new Date(Date.UTC(y,m-1,d));};
  const todayIso=()=>typeof today==='function'?today():new Date().toISOString().slice(0,10);
  const dayDiff=(left,right)=>{const a=dateUtc(left),b=dateUtc(right);return a&&b?Math.round((b-a)/86400000):0;};
  function addCalendarMonths(value,months){
    const valid=iso(value);if(!valid)return'';
    const [year,month,day]=valid.split('-').map(Number),targetIndex=(month-1)+Number(months||0),targetYear=year+Math.floor(targetIndex/12),targetMonth=((targetIndex%12)+12)%12;
    const lastDay=new Date(Date.UTC(targetYear,targetMonth+1,0)).getUTCDate(),safeDay=Math.min(day,lastDay);
    return`${targetYear}-${pad(targetMonth+1)}-${pad(safeDay)}`;
  }
  function planMonths(type){return type==='semiannual'?6:3;}
  function planLabel(type){return type==='semiannual'?'Semestral':'Trimestral';}
  function paymentStatus(record){
    if(!record)return{kind:'none',label:'SEM PAGAMENTO',days:null};
    const days=dayDiff(todayIso(),record.nextDueDate);
    if(days<0)return{kind:'late',label:`ATRASADO ${Math.abs(days)}D`,days};
    if(days===0)return{kind:'today',label:'VENCE HOJE',days};
    if(days<=7)return{kind:'soon',label:`VENCE EM ${days}D`,days};
    return{kind:'ok',label:'EM DIA',days};
  }
  function eventCollection(trainerUid){return db.collection('trainerActivity').doc(trainerUid).collection('events');}
  function activityMeta(trainerUid){return db.collection('trainerActivity').doc(trainerUid).collection('meta').doc('index');}
  function paymentCollection(trainerUid){return db.collection('trainerBilling').doc(trainerUid).collection('payments');}
  function eventDocId(type,sourceId){return(type==='weekly_checkin'?'w-':'q-')+cleanId(sourceId);}

  function injectStyles(){
    if(document.getElementById('tb-inbox-payments-style'))return;
    const style=document.createElement('style');style.id='tb-inbox-payments-style';style.textContent=`
      .tb-hub-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 18px 0}.tb-hub-tab{position:relative;border:1px solid rgba(255,255,255,.09);background:#111;color:#8e8580;border-radius:9px;padding:11px 10px;font:800 9px 'DM Mono',monospace;letter-spacing:.55px;cursor:pointer}.tb-hub-tab.active,.tb-hub-tab:hover{border-color:rgba(225,29,72,.5);background:rgba(225,29,72,.08);color:#f3eeea}.tb-hub-count,.tb-nav-count{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#e11d48;color:#fff;font:900 9px 'DM Mono',monospace;margin-left:5px}.tb-hub-count:empty,.tb-nav-count:empty{display:none}
      .tb-command-screen .content{padding-top:14px}.tb-command-head{padding:18px;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:linear-gradient(180deg,rgba(225,29,72,.045),rgba(255,255,255,.015));margin-bottom:12px}.tb-command-head .eyebrow{font:800 8px 'DM Mono',monospace;color:#e11d48;letter-spacing:1px}.tb-command-head h2{margin:5px 0 4px;font:900 28px 'Barlow Condensed',sans-serif;color:#f3eee9}.tb-command-head p{margin:0;color:#817872;font-size:11px;line-height:1.45}
      .tb-summary-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}.tb-summary-card{padding:11px 12px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:#101010}.tb-summary-card span{display:block;font:700 8px 'DM Mono',monospace;color:#756d67;letter-spacing:.5px}.tb-summary-card strong{display:block;margin-top:5px;font:900 22px 'Barlow Condensed',sans-serif;color:#eee}.tb-summary-card.warn strong{color:#f2ad64}.tb-summary-card.bad strong{color:#ff627c}.tb-summary-card.good strong{color:#7cdaa0}
      .tb-toolbar{display:flex;flex-wrap:wrap;gap:7px;margin:10px 0 14px}.tb-toolbar button,.tb-toolbar input{min-height:36px;border:1px solid rgba(255,255,255,.09);border-radius:8px;background:#111;color:#aaa;padding:8px 10px;font:700 9px 'DM Mono',monospace}.tb-toolbar button{cursor:pointer}.tb-toolbar button.active{border-color:rgba(225,29,72,.55);color:#fff;background:rgba(225,29,72,.1)}.tb-toolbar input{flex:1 1 220px;font-family:'Barlow',sans-serif;font-size:12px;outline:none}.tb-toolbar .primary{border-color:#e11d48;background:#b30e35;color:#fff}
      .tb-inbox-section{margin:12px 0 18px}.tb-inbox-section-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px;font:800 9px 'DM Mono',monospace;color:#8f847d;letter-spacing:.75px}.tb-activity-card,.tb-protocol-card,.tb-payment-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:11px;width:100%;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:#111;padding:11px 12px;margin-bottom:7px;text-align:left;color:inherit}.tb-activity-card{cursor:pointer}.tb-activity-card.unread{border-color:rgba(225,29,72,.42);background:linear-gradient(90deg,rgba(225,29,72,.09),#111 42%)}.tb-activity-icon,.tb-payment-icon{width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:#181818;border:1px solid rgba(255,255,255,.06);font-size:17px}.tb-activity-main strong,.tb-protocol-main strong,.tb-payment-main strong{display:block;color:#eee;font:800 14px 'Barlow',sans-serif}.tb-activity-main span,.tb-protocol-main span,.tb-payment-main span{display:block;margin-top:3px;color:#817872;font-size:10px;line-height:1.35}.tb-activity-meta,.tb-payment-side{text-align:right}.tb-activity-meta b,.tb-payment-side b{display:block;color:#9c918a;font:800 8px 'DM Mono',monospace}.tb-activity-meta small,.tb-payment-side small{display:block;margin-top:4px;color:#6e6660;font-size:9px}.tb-unread-dot{width:8px;height:8px;border-radius:50%;background:#e11d48;display:inline-block;margin-left:5px}.tb-protocol-card{grid-template-columns:minmax(0,1fr) auto}.tb-protocol-card button,.tb-payment-card button{border:1px solid rgba(225,29,72,.4);border-radius:7px;background:rgba(225,29,72,.08);color:#ff6a84;padding:8px 9px;font:800 8px 'DM Mono',monospace;cursor:pointer}
      .tb-payment-card{grid-template-columns:auto minmax(0,1fr) auto}.tb-payment-card.none{opacity:.72}.tb-payment-planline{display:flex;flex-wrap:wrap;gap:6px;margin-top:5px}.tb-payment-pill{border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:3px 6px;font:700 8px 'DM Mono',monospace;color:#918781}.tb-payment-pill.ok{color:#7cdaa0;border-color:rgba(34,197,94,.22)}.tb-payment-pill.soon,.tb-payment-pill.today{color:#f2ad64;border-color:rgba(245,158,11,.28)}.tb-payment-pill.late{color:#ff627c;border-color:rgba(225,29,72,.35)}.tb-payment-actions{display:flex;gap:5px;justify-content:flex-end;margin-top:7px}.tb-payment-actions button.secondary{border-color:rgba(255,255,255,.1);background:#141414;color:#aaa}.tb-payment-history{grid-column:2/4;margin-top:4px}.tb-payment-history details{border-top:1px solid rgba(255,255,255,.05);padding-top:7px}.tb-payment-history summary{cursor:pointer;color:#776e68;font:700 8px 'DM Mono',monospace}.tb-history-row{display:flex;justify-content:space-between;gap:12px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.045);font-size:10px;color:#8a817b}.tb-history-row:last-child{border-bottom:0}.tb-empty{padding:18px;border:1px dashed rgba(255,255,255,.09);border-radius:9px;text-align:center;color:#756d67;font-size:11px}
      .tb-payment-editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.tb-payment-editor-grid .wide{grid-column:1/-1}.tb-payment-editor-grid label{display:flex;flex-direction:column;gap:5px;font:700 8px 'DM Mono',monospace;color:#7d746e;letter-spacing:.5px}.tb-payment-editor-grid input,.tb-payment-editor-grid select{width:100%;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:#101010;color:#eee;padding:10px;font:600 13px 'Barlow',sans-serif;outline:none}.tb-payment-editor-grid select:disabled{opacity:.55;cursor:not-allowed}.tb-payment-due-preview{padding:11px;border:1px solid rgba(34,197,94,.2);border-radius:8px;background:rgba(34,197,94,.045)}.tb-payment-due-preview span{display:block;font:700 8px 'DM Mono',monospace;color:#6a9f7d}.tb-payment-due-preview strong{display:block;margin-top:4px;font:900 20px 'Barlow Condensed',sans-serif;color:#a5ebbe}.tb-receipt-preview{display:none;max-width:100%;max-height:230px;object-fit:contain;margin-top:8px;border-radius:8px;border:1px solid rgba(255,255,255,.08);background:#090909}.tb-receipt-preview.active{display:block}.tb-receipt-view{display:block;max-width:100%;max-height:70vh;margin:0 auto;object-fit:contain;border-radius:8px}
      @media(max-width:720px){.tb-hub-tabs{margin:10px 12px 0;grid-template-columns:1fr}.tb-summary-grid{grid-template-columns:repeat(3,1fr)}.tb-payment-card,.tb-activity-card{grid-template-columns:auto minmax(0,1fr)}.tb-payment-side,.tb-activity-meta{grid-column:2;text-align:left}.tb-payment-history{grid-column:1/-1}.tb-payment-editor-grid{grid-template-columns:1fr}.tb-payment-editor-grid .wide{grid-column:auto}.tb-toolbar{position:sticky;top:0;z-index:6;background:var(--bg,#0c0c0c);padding:7px 0}.tb-summary-card{padding:9px}.tb-summary-card strong{font-size:18px}}
      @media(max-width:420px){.tb-summary-grid{grid-template-columns:1fr 1fr}.tb-summary-card:last-child{grid-column:1/-1}}
    `;document.head.appendChild(style);
  }

  function hubTabs(active='students'){
    const unread=activityEvents.filter(item=>item.read!==true).length,payCount=paymentAttentionCount();
    return`<div class="tb-hub-tabs"><button class="tb-hub-tab ${active==='students'?'active':''}" onclick="goTrainer()">ALUNOS</button><button class="tb-hub-tab ${active==='inbox'?'active':''}" onclick="TeamBullsTrainerHub.openInbox()">RELATÓRIOS & ATUALIZAÇÕES <span class="tb-hub-count" data-tb-inbox-count>${unread||''}</span></button><button class="tb-hub-tab ${active==='payments'?'active':''}" onclick="TeamBullsTrainerHub.openPayments()">PAGAMENTO <span class="tb-hub-count" data-tb-payment-count>${payCount||''}</span></button></div>`;
  }

  function ensureUi(){
    if(!trainer())return false;
    injectStyles();
    const app=document.getElementById('app');if(!app)return false;
    if(!document.getElementById('tb-trainer-home-tabs')){
      const stats=document.getElementById('trainer-stats');if(stats){const wrap=document.createElement('div');wrap.id='tb-trainer-home-tabs';wrap.innerHTML=hubTabs('students');stats.insertAdjacentElement('afterend',wrap);}
    }
    const nav=document.getElementById('trainer-desktop-nav');
    if(nav&&!document.getElementById('tb-nav-inbox')){
      const buttons=[...nav.querySelectorAll(':scope > button')],anchor=buttons.find(button=>button.textContent.includes('ARQUIVOS DOS ALUNOS'))||buttons[0];
      const inbox=document.createElement('button');inbox.id='tb-nav-inbox';inbox.dataset.navPrepared='1';inbox.onclick=()=>openInbox();inbox.innerHTML='<span aria-hidden="true" class="nav-icon">●</span><span class="nav-label">RELATÓRIOS & ATUALIZAÇÕES <span class="tb-nav-count" data-tb-inbox-count></span></span>';
      const payments=document.createElement('button');payments.id='tb-nav-payments';payments.dataset.navPrepared='1';payments.onclick=()=>openPayments();payments.innerHTML='<span aria-hidden="true" class="nav-icon">▣</span><span class="nav-label">PAGAMENTO <span class="tb-nav-count" data-tb-payment-count></span></span>';
      anchor?.insertAdjacentElement('afterend',payments);anchor?.insertAdjacentElement('afterend',inbox);
    }
    if(!document.getElementById('screen-trainer-inbox')){
      const screen=document.createElement('div');screen.className='screen tb-command-screen';screen.id='screen-trainer-inbox';screen.innerHTML=`<div class="header"><button class="btn-icon" onclick="goTrainer()">←</button><div class="header-title">RELATÓRIOS & ATUALIZAÇÕES</div><button class="btn-icon ghost" onclick="TeamBullsTrainerHub.refreshInbox()" title="Atualizar">↻</button></div><div id="tb-inbox-tabs">${hubTabs('inbox')}</div><div class="content"><section class="tb-command-head"><span class="eyebrow">CENTRAL DO TREINADOR</span><h2>Caixa de acompanhamento</h2><p>Relatórios enviados e atualizações completas pendentes aparecem aqui sem precisar abrir cada perfil.</p></section><div class="tb-summary-grid" id="tb-inbox-summary"></div><div class="tb-toolbar" id="tb-inbox-toolbar"><button data-inbox-filter="all" class="active">TODOS</button><button data-inbox-filter="unread">NÃO LIDOS</button><button data-inbox-filter="reports">RELATÓRIOS</button><button data-inbox-filter="updates">ATUALIZAÇÕES</button><button onclick="TeamBullsTrainerHub.markAllRead()">MARCAR TUDO LIDO</button></div><div id="tb-inbox-body"><div class="tb-empty">Carregando a central...</div></div></div>`;app.appendChild(screen);
      screen.querySelectorAll('[data-inbox-filter]').forEach(button=>button.addEventListener('click',()=>{inboxFilter=button.dataset.inboxFilter;screen.querySelectorAll('[data-inbox-filter]').forEach(x=>x.classList.toggle('active',x===button));renderInbox();}));
    }
    if(!document.getElementById('screen-trainer-payments')){
      const screen=document.createElement('div');screen.className='screen tb-command-screen';screen.id='screen-trainer-payments';screen.innerHTML=`<div class="header"><button class="btn-icon" onclick="goTrainer()">←</button><div class="header-title">PAGAMENTO</div><button class="btn-icon ghost" onclick="TeamBullsTrainerHub.openPaymentEditor()" title="Registrar pagamento">＋</button></div><div id="tb-payment-tabs">${hubTabs('payments')}</div><div class="content"><section class="tb-command-head"><span class="eyebrow">CONTROLE PRIVADO DO TREINADOR</span><h2>Planos e vencimentos</h2><p>Registre plano trimestral ou semestral, valor, vigência e comprovante. O próximo pagamento é calculado automaticamente pela data real do calendário.</p></section><div class="tb-summary-grid" id="tb-payment-summary"></div><div class="tb-toolbar"><input id="tb-payment-search" type="search" placeholder="Buscar aluno..." autocomplete="off"><button class="primary" onclick="TeamBullsTrainerHub.openPaymentEditor()">+ REGISTRAR PAGAMENTO</button></div><div id="tb-payment-list"><div class="tb-empty">Carregando pagamentos...</div></div></div>`;app.appendChild(screen);
      screen.querySelector('#tb-payment-search')?.addEventListener('input',event=>{paymentSearch=String(event.target.value||'').trim().toLocaleLowerCase('pt-BR');renderPayments();});
    }
    if(!document.getElementById('modal-trainer-payment')){
      const modal=document.createElement('div');modal.className='modal-backdrop';modal.id='modal-trainer-payment';modal.innerHTML=`<div class="modal-sheet" style="max-width:680px"><div class="modal-handle"></div><div class="modal-title" id="tb-payment-modal-title">Registrar pagamento</div><div class="tb-payment-editor-grid"><label class="wide">ALUNO<select id="tb-payment-student"></select></label><label>PLANO<select id="tb-payment-plan"><option value="quarterly">Trimestral</option><option value="semiannual">Semestral</option></select></label><label>VALOR PAGO (R$)<input id="tb-payment-amount" type="number" min="0.01" max="1000000" step="0.01" inputmode="decimal" placeholder="0,00"></label><label>DATA DE INÍCIO DA VIGÊNCIA<input id="tb-payment-valid-from" type="date"></label><div class="tb-payment-due-preview"><span>PRÓXIMO PAGAMENTO</span><strong id="tb-payment-next-due">—</strong></div><label class="wide">COMPROVANTE (IMAGEM, ATÉ 15 MB)<input id="tb-payment-receipt" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"><img class="tb-receipt-preview" id="tb-payment-receipt-preview" alt="Prévia do comprovante"></label><label class="wide">OBSERVAÇÃO OPCIONAL<input id="tb-payment-note" type="text" maxlength="500" placeholder="Ex.: Pix, renovação, ajuste de vencimento..."></label></div><div class="modal-actions" style="margin-top:14px"><button class="btn-ghost" onclick="closeModal('modal-trainer-payment')">CANCELAR</button><button class="btn-primary" id="tb-payment-save" onclick="TeamBullsTrainerHub.savePayment()">SALVAR PAGAMENTO</button></div></div>`;document.body.appendChild(modal);
      ['tb-payment-plan','tb-payment-valid-from'].forEach(id=>document.getElementById(id)?.addEventListener('change',updatePaymentDuePreview));
      document.getElementById('tb-payment-receipt')?.addEventListener('change',handleReceiptFile);
    }
    if(!document.getElementById('modal-payment-receipt')){
      const modal=document.createElement('div');modal.className='modal-backdrop';modal.id='modal-payment-receipt';modal.innerHTML=`<div class="modal-sheet" style="max-width:900px"><div class="modal-handle"></div><div class="modal-title">Comprovante de pagamento</div><div id="tb-payment-receipt-state" class="tb-empty">Carregando...</div><img id="tb-payment-receipt-view" class="tb-receipt-view" alt="Comprovante de pagamento" style="display:none"><button class="btn-ghost full" style="margin-top:12px" onclick="closeModal('modal-payment-receipt')">FECHAR</button></div>`;document.body.appendChild(modal);
    }
    updateBadges();return true;
  }

  async function loadStudents(force=false){
    if(!trainer())return[];if(students.length&&!force)return students;
    try{
      const snap=await cloudGet(db.collection('users').where('role','==','student').where('trainerId','==',CURRENT_USER.uid),'alunos da central');
      students=snap.docs.map(doc=>({...doc.data(),uid:doc.id})).sort((a,b)=>(a.status==='inactive')-(b.status==='inactive')||String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
      studentMap.clear();students.forEach(item=>studentMap.set(item.uid,item));return students;
    }catch(error){console.warn('Alunos da central indisponíveis',error);return students;}
  }
  function studentName(uid){return studentMap.get(uid)?.name||'Aluno';}

  async function resolveStudentTrainerId(){
    const direct=String(CURRENT_USER?.trainerId||'');if(direct)return direct;
    if(!student()||!CURRENT_USER?.uid)return'';
    try{const doc=await cloudGet(db.collection('users').doc(CURRENT_USER.uid),'vínculo do treinador');return doc.exists?String(doc.data()?.trainerId||''):'';}catch(error){return'';}
  }
  async function writeStudentActivity({type,sourceId,trainerId,studentId,submittedDate,title}){
    if(!student()||!trainerId||!studentId||CURRENT_USER.uid!==studentId||!sourceId)return false;
    const ref=eventCollection(trainerId).doc(eventDocId(type,sourceId));
    const payload={trainerId,studentId,type,sourceId:String(sourceId).slice(0,190),submittedDate:iso(submittedDate)||todayIso(),title:String(title||'Relatório recebido').normalize('NFKC').trim().slice(0,160),read:false,createdAt:nowStamp()};
    try{await cloudWrite(ref.set(payload,{merge:true}),'notificar treinador');return true;}catch(error){console.warn('Notificação interna não registrada',error);return false;}
  }

  function installSubmissionHooks(){
    if(typeof submitWeeklyCheckin==='function'&&!submitWeeklyCheckin.__tbTrainerInbox){
      const base=submitWeeklyCheckin;
      const wrapped=async function(){
        const studentId=String(CURRENT_USER?.uid||''),request=typeof WEEKLY_CHECKIN_REQUEST!=='undefined'?WEEKLY_CHECKIN_REQUEST:null,sourceId=studentId&&request&&typeof weeklyCheckinDocId==='function'?weeklyCheckinDocId(studentId,request.requestKey):'';
        const result=await base.apply(this,arguments);
        if(student()&&sourceId){
          try{const doc=await cloudGet(db.collection('weeklyCheckins').doc(sourceId),'confirmar relatório para notificação');if(doc.exists){const data=doc.data(),trainerId=await resolveStudentTrainerId();await writeStudentActivity({type:'weekly_checkin',sourceId,trainerId,studentId,submittedDate:data.submittedDate||data.dueDate,title:data.requestKind==='manual'?'Relatório semanal extra':'Relatório semanal'});}}catch(error){console.warn('Confirmação do relatório para central',error);}
        }
        return result;
      };wrapped.__tbTrainerInbox=true;submitWeeklyCheckin=wrapped;
    }
    if(typeof submitQuestionnaireAnswers==='function'&&!submitQuestionnaireAnswers.__tbTrainerInbox){
      const base=submitQuestionnaireAnswers;
      const wrapped=async function(){
        const sourceId=String(typeof CUR_ANSWER_QUEST_ID!=='undefined'?CUR_ANSWER_QUEST_ID||'':''),snapshot=typeof CURRENT_ANSWER_REPORT!=='undefined'&&CURRENT_ANSWER_REPORT?{...CURRENT_ANSWER_REPORT}:null,studentId=String(CURRENT_USER?.uid||'');
        const result=await base.apply(this,arguments);
        if(student()&&sourceId){
          try{const doc=await cloudGet(db.collection('questionnaires').doc(sourceId),'confirmar relatório respondido para notificação');if(doc.exists&&doc.data()?.answered===true){const data=doc.data(),trainerId=String(data.trainerId||snapshot?.trainerId||await resolveStudentTrainerId()),mode=String(data.requestMode||'full');const title=String(data.title||'')||(mode==='photos'?'Atualização de fotos':mode==='written'?'Relatório escrito':'Relatório completo');await writeStudentActivity({type:'questionnaire',sourceId,trainerId,studentId,submittedDate:todayIso(),title});}}catch(error){console.warn('Confirmação do questionário para central',error);}
        }
        return result;
      };wrapped.__tbTrainerInbox=true;submitQuestionnaireAnswers=wrapped;
    }
  }

  function sourceTimestamp(data,fallbackDate=''){
    if(data?.answeredAt?.toMillis||data?.createdAt?.toMillis)return data.answeredAt||data.createdAt;
    const valid=iso(fallbackDate);if(valid&&firebase.firestore.Timestamp?.fromDate)return firebase.firestore.Timestamp.fromDate(new Date(valid+'T12:00:00Z'));
    return firebase.firestore.Timestamp?.now?firebase.firestore.Timestamp.now():nowStamp();
  }
  async function backfillActivityHistory(){
    if(!trainer())return;
    const trainerUid=CURRENT_USER.uid,metaRef=activityMeta(trainerUid);
    try{const meta=await cloudGet(metaRef,'índice da central');if(meta.exists&&Number(meta.data()?.indexedVersion||0)>=ACTIVITY_INDEX_VERSION)return;}catch(error){}
    await loadStudents();const rows=[];
    try{
      const snap=await cloudGet(db.collection('questionnaires').where('trainerId','==',trainerUid).limit(500),'histórico de relatórios');
      snap.docs.forEach(doc=>{const data=doc.data();if(data.answered!==true)return;const mode=String(data.requestMode||'full'),title=String(data.title||'')||(mode==='photos'?'Atualização de fotos':mode==='written'?'Relatório escrito':'Relatório completo');rows.push({type:'questionnaire',sourceId:doc.id,studentId:data.studentId,title,submittedDate:iso(data.submittedDate)||iso(data.dueDate)||'',createdAt:sourceTimestamp(data,data.submittedDate||data.dueDate)});});
    }catch(error){console.warn('Histórico de questionários não indexado',error);}
    let cursor=0;const worker=async()=>{while(cursor<students.length){const item=students[cursor++];try{const snap=await cloudGet(db.collection('weeklyCheckins').where('studentId','==',item.uid),'histórico semanal para central');snap.docs.forEach(doc=>{const data=doc.data();rows.push({type:'weekly_checkin',sourceId:doc.id,studentId:item.uid,title:data.requestKind==='manual'?'Relatório semanal extra':'Relatório semanal',submittedDate:iso(data.submittedDate)||iso(data.dueDate)||'',createdAt:sourceTimestamp(data,data.submittedDate||data.dueDate)});});}catch(error){console.warn('Histórico semanal não indexado para',item.uid,error);}}};
    await Promise.all(Array.from({length:Math.min(4,Math.max(1,students.length))},worker));
    try{
      for(let offset=0;offset<rows.length;offset+=350){const batch=db.batch();rows.slice(offset,offset+350).forEach(row=>batch.set(eventCollection(trainerUid).doc(eventDocId(row.type,row.sourceId)),{trainerId:trainerUid,studentId:row.studentId,type:row.type,sourceId:String(row.sourceId).slice(0,190),submittedDate:row.submittedDate||todayIso(),title:String(row.title).slice(0,160),createdAt:row.createdAt},{merge:true}));await cloudWrite(batch.commit(),'indexar histórico da central');}
      await cloudWrite(metaRef.set({indexedVersion:ACTIVITY_INDEX_VERSION,indexedAt:nowStamp()},{merge:true}),'concluir índice da central');
    }catch(error){console.warn('Indexação histórica incompleta',error);}
  }

  async function loadProtocolDue(){
    if(!trainer())return[];try{const snap=await cloudGet(db.collection('protocolReviewSchedules').where('trainerId','==',CURRENT_USER.uid).limit(500),'atualizações completas pendentes');const due=[];snap.docs.forEach(doc=>{const schedule={...doc.data(),studentId:doc.id},state=typeof v109ProtocolState==='function'?v109ProtocolState(schedule):null;if(state?.pending)due.push({studentId:doc.id,schedule,state});});protocolDue=due.sort((a,b)=>String(a.state.nextDueDate).localeCompare(String(b.state.nextDueDate)));return protocolDue;}catch(error){console.warn('Atualizações pendentes indisponíveis',error);protocolDue=[];return[];}
  }

  function startActivityListener(){
    if(!trainer())return;if(activityUnsub){activityUnsub();activityUnsub=null;}listenerPrimed=false;
    activityUnsub=eventCollection(CURRENT_USER.uid).orderBy('createdAt','desc').limit(ACTIVITY_LIMIT).onSnapshot(snapshot=>{
      const changed=listenerPrimed?snapshot.docChanges().filter(change=>change.type==='added'&&change.doc.data()?.read!==true):[];
      activityEvents=snapshot.docs.map(doc=>({...doc.data(),id:doc.id,_createdMs:ms(doc.data()?.createdAt)}));
      updateBadges();renderInbox();
      if(listenerPrimed&&changed.length){const first=changed[0].doc.data(),name=studentName(first.studentId),extra=changed.length>1?` +${changed.length-1}`:'';toast(`🔔 ${name}: novo ${first.type==='weekly_checkin'?'relatório semanal':'relatório/atualização'}${extra}`);}
      listenerPrimed=true;
    },error=>console.warn('Listener da central indisponível',error));
  }

  async function markEventRead(id){
    if(!trainer()||!id)return;const item=activityEvents.find(row=>row.id===id);if(item)item.read=true;updateBadges();renderInbox();try{await cloudWrite(eventCollection(CURRENT_USER.uid).doc(id).set({read:true,readAt:nowStamp()},{merge:true}),'marcar relatório lido');}catch(error){if(item)item.read=false;updateBadges();renderInbox();}
  }
  async function markAllRead(){
    if(!trainer())return;const pending=activityEvents.filter(item=>item.read!==true);if(!pending.length){toast('Nenhum relatório novo para marcar.');return;}try{for(let offset=0;offset<pending.length;offset+=350){const batch=db.batch();pending.slice(offset,offset+350).forEach(item=>batch.set(eventCollection(CURRENT_USER.uid).doc(item.id),{read:true,readAt:nowStamp()},{merge:true}));await cloudWrite(batch.commit(),'marcar central como lida');}pending.forEach(item=>item.read=true);updateBadges();renderInbox();toast('✓ Central marcada como lida');}catch(error){toast('Não foi possível marcar tudo como lido.',true);}
  }
  async function openActivity(id){
    if(!trainer())return;const item=activityEvents.find(row=>row.id===id);if(!item)return;markEventRead(id).catch(()=>{});
    try{
      if(item.type==='weekly_checkin'){
        const doc=await cloudGet(db.collection('weeklyCheckins').doc(item.sourceId),'abrir relatório semanal');if(!doc.exists)throw new Error('Relatório não encontrado.');WEEKLY_CHECKINS=[{...doc.data(),id:doc.id}];return viewWeeklyCheckin(doc.id);
      }
      const doc=await cloudGet(db.collection('questionnaires').doc(item.sourceId),'abrir relatório respondido');if(!doc.exists)throw new Error('Relatório não encontrado.');TS_QUEST_CACHE=[{...doc.data(),id:doc.id}];return viewQuestionnaire(doc.id,true);
    }catch(error){toast('Não foi possível abrir este relatório agora.',true);}
  }
  async function openProtocolStudent(studentId){
    if(!trainer())return;await loadStudents();const item=studentMap.get(studentId);if(!item){toast('Aluno não encontrado na lista atual.',true);return;}if(typeof viewStudent==='function')return viewStudent(item.uid,item.name,item.email||'',item.status||'active');
  }

  function renderInbox(){
    if(!ensureUi())return;const summary=document.getElementById('tb-inbox-summary'),body=document.getElementById('tb-inbox-body');if(!summary||!body)return;
    const unread=activityEvents.filter(item=>item.read!==true).length,reports=activityEvents.length,updates=protocolDue.length;
    summary.innerHTML=`<div class="tb-summary-card ${unread?'bad':''}"><span>NÃO LIDOS</span><strong>${unread}</strong></div><div class="tb-summary-card"><span>RELATÓRIOS INDEXADOS</span><strong>${reports}</strong></div><div class="tb-summary-card ${updates?'warn':'good'}"><span>ATUALIZAÇÕES PENDENTES</span><strong>${updates}</strong></div>`;
    const showReports=inboxFilter==='all'||inboxFilter==='unread'||inboxFilter==='reports',showUpdates=inboxFilter==='all'||inboxFilter==='updates';
    let items=activityEvents;if(inboxFilter==='unread')items=items.filter(item=>item.read!==true);if(inboxFilter==='updates')items=[];
    const protocolHtml=showUpdates?`<section class="tb-inbox-section"><div class="tb-inbox-section-title"><span>ATUALIZAÇÕES COMPLETAS PENDENTES</span><span>${protocolDue.length}</span></div>${protocolDue.length?protocolDue.map(item=>`<div class="tb-protocol-card"><div class="tb-protocol-main"><strong>${h(studentName(item.studentId))}</strong><span>Atualização completa nº ${Number(item.state.pendingCycle)||''} pendente desde ${h(fmtDate(item.state.nextDueDate))}.</span></div><button onclick="TeamBullsTrainerHub.openProtocolStudent(${js(item.studentId)})">REVISAR ALUNO</button></div>`).join(''):'<div class="tb-empty">Nenhuma atualização completa pendente.</div>'}</section>`:'';
    const reportHtml=showReports?`<section class="tb-inbox-section"><div class="tb-inbox-section-title"><span>RELATÓRIOS E ATUALIZAÇÕES RECEBIDOS</span><span>${items.length}</span></div>${items.length?items.map(item=>`<button class="tb-activity-card ${item.read===true?'':'unread'}" onclick="TeamBullsTrainerHub.openActivity(${js(item.id)})"><span class="tb-activity-icon">${item.type==='weekly_checkin'?'▤':'◉'}</span><span class="tb-activity-main"><strong>${h(studentName(item.studentId))}${item.read===true?'':'<i class="tb-unread-dot"></i>'}</strong><span>${h(item.title||'Relatório recebido')}</span></span><span class="tb-activity-meta"><b>${h(fmtDate(item.submittedDate||''))}</b><small>${item.type==='weekly_checkin'?'SEMANAL':'SOLICITADO'}</small></span></button>`).join(''):'<div class="tb-empty">Nenhum item neste filtro.</div>'}</section>`:'';
    body.innerHTML=protocolHtml+reportHtml;
  }
  async function refreshInbox(){if(!trainer())return;await Promise.all([loadStudents(true),loadProtocolDue()]);renderInbox();toast('✓ Central atualizada');}
  async function openInbox(){if(!trainer()){toast('Esta área é exclusiva do treinador.',true);return;}ensureUi();showScreen('screen-trainer-inbox');document.getElementById('tb-inbox-tabs').innerHTML=hubTabs('inbox');await Promise.all([loadStudents(),loadProtocolDue()]);renderInbox();}

  function latestPaymentMap(){
    const map=new Map();for(const record of paymentRecords){const previous=map.get(record.studentId);if(!previous||String(record.validFrom||'')>String(previous.validFrom||'')||(record.validFrom===previous.validFrom&&record._createdMs>previous._createdMs))map.set(record.studentId,record);}return map;
  }
  function paymentAttentionCount(){const latest=latestPaymentMap();let count=0;for(const record of latest.values()){const status=paymentStatus(record);if(['late','today','soon'].includes(status.kind))count++;}return count;}
  function paymentGroups(){const byStudent=new Map();paymentRecords.forEach(record=>{if(!byStudent.has(record.studentId))byStudent.set(record.studentId,[]);byStudent.get(record.studentId).push(record);});byStudent.forEach(list=>list.sort((a,b)=>String(b.validFrom||'').localeCompare(String(a.validFrom||''))||b._createdMs-a._createdMs));return byStudent;}
  function renderPayments(){
    if(!ensureUi())return;const summary=document.getElementById('tb-payment-summary'),list=document.getElementById('tb-payment-list');if(!summary||!list)return;
    const latest=latestPaymentMap(),groups=paymentGroups();let late=0,soon=0,active=0;latest.forEach(record=>{const state=paymentStatus(record);active++;if(state.kind==='late')late++;else if(['today','soon'].includes(state.kind))soon++;});
    summary.innerHTML=`<div class="tb-summary-card"><span>PLANOS REGISTRADOS</span><strong>${active}</strong></div><div class="tb-summary-card ${soon?'warn':''}"><span>VENCEM EM 7 DIAS</span><strong>${soon}</strong></div><div class="tb-summary-card ${late?'bad':'good'}"><span>ATRASADOS</span><strong>${late}</strong></div>`;
    const filtered=students.filter(item=>!paymentSearch||String(item.name||'').toLocaleLowerCase('pt-BR').includes(paymentSearch)||String(item.email||'').toLocaleLowerCase('pt-BR').includes(paymentSearch));
    list.innerHTML=filtered.length?filtered.map(person=>{
      const record=latest.get(person.uid),state=paymentStatus(record),history=groups.get(person.uid)||[];
      if(!record)return`<article class="tb-payment-card none"><span class="tb-payment-icon">▣</span><span class="tb-payment-main"><strong>${h(person.name||'Aluno')}</strong><span>${h(person.email||'')} · nenhum pagamento registrado</span><span class="tb-payment-planline"><i class="tb-payment-pill">SEM PLANO</i></span></span><span class="tb-payment-side"><button onclick="TeamBullsTrainerHub.openPaymentEditor(${js(person.uid)})">REGISTRAR</button></span></article>`;
      const historyHtml=history.length>1?`<div class="tb-payment-history"><details><summary>HISTÓRICO · ${history.length} PAGAMENTOS</summary>${history.slice(0,8).map(item=>`<div class="tb-history-row"><span>${h(fmtDate(item.validFrom))} · ${h(planLabel(item.planType))} · ${h(formatMoney(item.amountCents))}</span><span>${item.receiptPath?`<button class="secondary" onclick="TeamBullsTrainerHub.openReceipt(${js(item.receiptPath)})">COMPROVANTE</button>`:''}</span></div>`).join('')}</details></div>`:'';
      return`<article class="tb-payment-card"><span class="tb-payment-icon">▣</span><span class="tb-payment-main"><strong>${h(person.name||'Aluno')}</strong><span>${h(formatMoney(record.amountCents))} · vigência desde ${h(fmtDate(record.validFrom))} · próximo pagamento ${h(fmtDate(record.nextDueDate))}</span><span class="tb-payment-planline"><i class="tb-payment-pill">${h(planLabel(record.planType))}</i><i class="tb-payment-pill ${state.kind}">${h(state.label)}</i>${record.receiptPath?'<i class="tb-payment-pill ok">COMPROVANTE ✓</i>':'<i class="tb-payment-pill">SEM COMPROVANTE</i>'}</span></span><span class="tb-payment-side"><b>${h(fmtDate(record.nextDueDate))}</b><small>PRÓXIMO PAGAMENTO</small><div class="tb-payment-actions">${record.receiptPath?`<button class="secondary" onclick="TeamBullsTrainerHub.openReceipt(${js(record.receiptPath)})">VER</button>`:''}<button onclick="TeamBullsTrainerHub.openPaymentEditor(${js(person.uid)},${js(record.id)})">CORRIGIR</button><button onclick="TeamBullsTrainerHub.openPaymentEditor(${js(person.uid)})">RENOVAR</button></div></span>${historyHtml}</article>`;
    }).join(''):'<div class="tb-empty">Nenhum aluno encontrado.</div>';
    updateBadges();
  }

  function startPaymentListener(){
    if(!trainer())return;if(paymentUnsub){paymentUnsub();paymentUnsub=null;}
    paymentUnsub=paymentCollection(CURRENT_USER.uid).orderBy('createdAt','desc').limit(PAYMENT_LIMIT).onSnapshot(snapshot=>{paymentRecords=snapshot.docs.map(doc=>({...doc.data(),id:doc.id,_createdMs:ms(doc.data()?.createdAt)}));renderPayments();updateBadges();},error=>console.warn('Pagamentos indisponíveis',error));
  }
  async function openPayments(){if(!trainer()){toast('Esta área é exclusiva do treinador.',true);return;}ensureUi();showScreen('screen-trainer-payments');document.getElementById('tb-payment-tabs').innerHTML=hubTabs('payments');await loadStudents();renderPayments();}
  function updatePaymentDuePreview(){const plan=document.getElementById('tb-payment-plan')?.value||'quarterly',start=document.getElementById('tb-payment-valid-from')?.value||'',due=addCalendarMonths(start,planMonths(plan)),host=document.getElementById('tb-payment-next-due');if(host)host.textContent=due?fmtDate(due):'—';}
  function revokePaymentPreview(){if(paymentPreviewUrl){try{URL.revokeObjectURL(paymentPreviewUrl);}catch(error){}paymentPreviewUrl='';}}
  function handleReceiptFile(event){const file=event.target.files?.[0]||null,preview=document.getElementById('tb-payment-receipt-preview');revokePaymentPreview();paymentFile=null;if(!file){preview?.classList.remove('active');if(preview)preview.removeAttribute('src');return;}if(!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type||'')){toast('O comprovante precisa ser uma imagem.',true);event.target.value='';return;}if(file.size>PAYMENT_MAX_FILE){toast('O comprovante precisa ter no máximo 15 MB.',true);event.target.value='';return;}paymentFile=file;paymentPreviewUrl=URL.createObjectURL(file);if(preview){preview.src=paymentPreviewUrl;preview.classList.add('active');}}
  function populatePaymentStudents(selected=''){const select=document.getElementById('tb-payment-student');if(!select)return;select.innerHTML='<option value="">Escolha o aluno...</option>'+students.map(item=>`<option value="${h(item.uid)}">${h(item.name||'Aluno')}</option>`).join('');if(selected)select.value=selected;}
  async function openPaymentEditor(studentId='',recordId=''){
    if(!trainer())return;ensureUi();await loadStudents();paymentEditorId=recordId||'';paymentFile=null;revokePaymentPreview();const input=document.getElementById('tb-payment-receipt');if(input)input.value='';const preview=document.getElementById('tb-payment-receipt-preview');if(preview){preview.classList.remove('active');preview.removeAttribute('src');}
    const record=recordId?paymentRecords.find(item=>item.id===recordId):null;populatePaymentStudents(record?.studentId||studentId);const studentSelect=document.getElementById('tb-payment-student');if(studentSelect)studentSelect.disabled=!!record;document.getElementById('tb-payment-plan').value=record?.planType||'quarterly';document.getElementById('tb-payment-amount').value=record?String(Number(record.amountCents||0)/100):'';document.getElementById('tb-payment-valid-from').value=record?.validFrom||todayIso();document.getElementById('tb-payment-note').value=record?.note||'';document.getElementById('tb-payment-modal-title').textContent=record?'Corrigir pagamento':'Registrar pagamento';updatePaymentDuePreview();openModal('modal-trainer-payment');
  }
  function receiptExtension(file){const type=String(file?.type||'').toLowerCase();if(type==='image/png')return'png';if(type==='image/webp')return'webp';if(type==='image/heic')return'heic';if(type==='image/heif')return'heif';return'jpg';}
  async function uploadReceipt(trainerUid,studentId,paymentId,file){
    if(!file)return'';const service=await ensureStorageService();if(!service)throw new Error('Armazenamento de comprovantes indisponível.');const path=`paymentReceipts/${cleanId(trainerUid)}/${cleanId(studentId)}/${cleanId(paymentId)}.${receiptExtension(file)}`,ref=service.ref(path);await withTimeout(ref.put(file,{contentType:file.type||'image/jpeg'}),30000,'enviar comprovante');return path;
  }
  async function deleteReceipt(path){if(!path)return;try{const service=await ensureStorageService();await service?.ref(path)?.delete();}catch(error){}}
  async function savePayment(){
    if(!trainer())return;const studentId=String(document.getElementById('tb-payment-student')?.value||''),planType=document.getElementById('tb-payment-plan')?.value||'quarterly',amount=Number(document.getElementById('tb-payment-amount')?.value||0),validFrom=document.getElementById('tb-payment-valid-from')?.value||'',note=String(document.getElementById('tb-payment-note')?.value||'').normalize('NFKC').trim().slice(0,500),existing=paymentEditorId?paymentRecords.find(item=>item.id===paymentEditorId):null;
    if(!studentMap.has(studentId)){toast('Escolha um aluno válido.',true);return;}if(existing&&existing.studentId!==studentId){toast('O aluno de um pagamento existente não pode ser alterado. Use Renovar para criar outro registro.',true);return;}if(!['quarterly','semiannual'].includes(planType)){toast('Escolha o plano trimestral ou semestral.',true);return;}if(!Number.isFinite(amount)||amount<=0||amount>1000000){toast('Informe um valor de pagamento maior que zero.',true);return;}if(!iso(validFrom)){toast('Informe a data de início da vigência.',true);return;}
    const nextDueDate=addCalendarMonths(validFrom,planMonths(planType)),id=paymentEditorId||('pay-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8)),button=document.getElementById('tb-payment-save');if(button){button.disabled=true;button.textContent='SALVANDO...';}
    let newPath='';try{
      if(paymentFile)newPath=await uploadReceipt(CURRENT_USER.uid,studentId,id,paymentFile);
      const payload={trainerId:CURRENT_USER.uid,studentId,planType,amountCents:Math.round(amount*100),validFrom,nextDueDate,receiptPath:newPath||existing?.receiptPath||'',receiptName:paymentFile?.name?.slice(0,180)||existing?.receiptName||'',note,updatedAt:nowStamp()};if(!existing)payload.createdAt=nowStamp();
      const ref=paymentCollection(CURRENT_USER.uid).doc(id);await cloudWrite(existing?ref.set(payload,{merge:true}):ref.set(payload),'salvar pagamento');if(newPath&&existing?.receiptPath&&newPath!==existing.receiptPath)deleteReceipt(existing.receiptPath);closeModal('modal-trainer-payment');paymentEditorId='';paymentFile=null;revokePaymentPreview();toast('✓ Pagamento salvo · próximo vencimento '+fmtDate(nextDueDate));
    }catch(error){if(newPath&&newPath!==existing?.receiptPath)deleteReceipt(newPath);toast('Não foi possível salvar o pagamento: '+String(error?.message||error),true);}finally{if(button){button.disabled=false;button.textContent='SALVAR PAGAMENTO';}}
  }
  async function openReceipt(path){if(!trainer()||!path)return;ensureUi();const state=document.getElementById('tb-payment-receipt-state'),image=document.getElementById('tb-payment-receipt-view');if(state){state.style.display='block';state.textContent='Carregando comprovante...';}if(image){image.style.display='none';image.removeAttribute('src');}openModal('modal-payment-receipt');try{const service=await ensureStorageService(),url=await service.ref(path).getDownloadURL();if(image){image.src=url;image.style.display='block';}if(state)state.style.display='none';}catch(error){if(state){state.style.display='block';state.textContent='Não foi possível abrir este comprovante agora.';}}}

  function updateBadges(){if(!trainer())return;const unread=activityEvents.filter(item=>item.read!==true).length,pay=paymentAttentionCount();document.querySelectorAll('[data-tb-inbox-count]').forEach(element=>element.textContent=unread?String(unread):'');document.querySelectorAll('[data-tb-payment-count]').forEach(element=>element.textContent=pay?String(pay):'');const home=document.getElementById('tb-trainer-home-tabs');if(home)home.innerHTML=hubTabs('students');}

  async function initTrainer(){
    if(!trainer()||trainerInitUid===CURRENT_USER.uid)return;cleanupListeners();trainerInitUid=CURRENT_USER.uid;ensureUi();await loadStudents(true);await backfillActivityHistory();await loadProtocolDue();startActivityListener();startPaymentListener();renderInbox();renderPayments();updateBadges();
  }
  function cleanupListeners(){try{activityUnsub?.();}catch(error){}try{paymentUnsub?.();}catch(error){}activityUnsub=null;paymentUnsub=null;listenerPrimed=false;trainerInitUid='';activityEvents=[];protocolDue=[];students=[];paymentRecords=[];studentMap.clear();}
  function installTrainerHooks(){
    if(typeof renderTrainer==='function'&&!renderTrainer.__tbInboxPayments){const base=renderTrainer;const wrapped=async function(){const result=await base.apply(this,arguments);if(trainer())initTrainer().catch(error=>console.warn('Central do treinador',error));if(trainer()){ensureUi();updateBadges();}return result;};wrapped.__tbInboxPayments=true;renderTrainer=wrapped;}
    if(typeof confirmLogout==='function'&&!confirmLogout.__tbInboxPayments){const base=confirmLogout;const wrapped=function(){cleanupListeners();revokePaymentPreview();return base.apply(this,arguments);};wrapped.__tbInboxPayments=true;confirmLogout=wrapped;}
  }
  function boot(){installSubmissionHooks();installTrainerHooks();if(trainer()){ensureUi();initTrainer().catch(error=>console.warn('Central do treinador',error));}}

  window.TeamBullsTrainerHub=Object.freeze({version:VERSION,openInbox,refreshInbox,markAllRead,openActivity,openProtocolStudent,openPayments,openPaymentEditor,savePayment,openReceipt,addCalendarMonths});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
