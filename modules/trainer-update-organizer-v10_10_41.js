/* Team Bulls v10.10.41 — agenda global de atualizações semanais e mensais do treinador. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_TRAINER_UPDATE_ORGANIZER_101041__)return;
  window.__TEAM_BULLS_TRAINER_UPDATE_ORGANIZER_101041__=true;

  const VERSION='10.10.41-updateorganizer1';
  const SCREEN_ID='screen-trainer-update-organizer';
  const ENTRY_ID='tb-trainer-update-organizer-entry';
  const STYLE_ID='tb-trainer-update-organizer-style';
  const CONCURRENCY=6;
  let students=[];
  let studentsById=new Map();
  let schedulesByStudent=new Map();
  let protocolByStudent=new Map();
  let currentItems=[];
  let completedItems=[];
  let missingItems=[];
  let filter='upcoming';
  let loading=false;
  let loadSerial=0;
  let loadedTrainerUid='';

  const trainer=()=>{try{return CURRENT_USER?.role==='trainer'&&MODE==='cloud'&&!!db;}catch(error){return false;}};
  const trainerUid=()=>trainer()?String(CURRENT_USER?.uid||''):'';
  const iso=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
  const h=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const todayIso=()=>{try{if(typeof today==='function')return today();}catch(error){}const d=new Date(),p=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;};
  const addDays=(value,days)=>{try{if(typeof addDaysIso==='function')return addDaysIso(value,days);}catch(error){}const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));if(!match)return todayIso();const d=new Date(Number(match[1]),Number(match[2])-1,Number(match[3]),12);d.setDate(d.getDate()+Number(days||0));return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const fmtDate=value=>{if(!iso(value))return'—';try{if(typeof fmt==='function')return fmt(value);}catch(error){}const[y,m,d]=value.split('-');return`${d}/${m}/${y}`;};
  const timestampMs=value=>{try{if(value?.toMillis)return value.toMillis();if(value?.seconds)return Number(value.seconds)*1000;const n=Number(value);return Number.isFinite(n)?n:0;}catch(error){return 0;}};
  const actualDateFromTimestamp=value=>{const ms=timestampMs(value);if(!ms)return'';const d=new Date(ms),p=n=>String(n).padStart(2,'0');return`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;};

  async function mapWithLimit(items,limit,worker){
    if(!items.length)return[];
    const out=new Array(items.length);let cursor=0;
    const run=async()=>{while(true){const index=cursor++;if(index>=items.length)return;out[index]=await worker(items[index],index);}};
    await Promise.all(Array.from({length:Math.min(Math.max(1,limit),items.length)},run));
    return out;
  }

  function clearState(){
    students=[];studentsById=new Map();schedulesByStudent=new Map();protocolByStudent=new Map();currentItems=[];completedItems=[];missingItems=[];filter='upcoming';loading=false;loadSerial++;loadedTrainerUid='';
    const list=document.getElementById('tb-update-organizer-list');if(list)list.innerHTML='';
  }

  function injectStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');style.id=STYLE_ID;style.textContent=`
      #${SCREEN_ID}{padding-bottom:94px}.tb-update-org-content{padding-top:14px}.tb-update-org-intro{padding:15px;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:linear-gradient(145deg,rgba(225,29,72,.06),#111);margin-bottom:12px}.tb-update-org-intro strong{display:block;color:#eee;font:900 21px 'Barlow Condensed',sans-serif}.tb-update-org-intro span{display:block;margin-top:5px;color:#80756f;font:500 10px/1.5 'DM Mono',monospace}.tb-update-org-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.tb-update-org-actions button{min-height:36px;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:#111;color:#aaa;padding:8px 10px;font:800 8px 'DM Mono',monospace;cursor:pointer}.tb-update-org-actions button.primary{border-color:rgba(225,29,72,.38);color:#ff8093;background:rgba(225,29,72,.07)}.tb-update-org-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:10px 0 12px}.tb-update-org-stat{padding:10px 11px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:#101010}.tb-update-org-stat span{display:block;color:#736a64;font:700 8px 'DM Mono',monospace;letter-spacing:.45px}.tb-update-org-stat strong{display:block;margin-top:4px;color:#eee;font:900 22px 'Barlow Condensed',sans-serif}.tb-update-org-stat.overdue strong{color:#ff7788}.tb-update-org-stat.today strong{color:#f2ad64}.tb-update-org-missing{display:none;margin:0 0 12px;padding:12px;border:1px solid rgba(245,158,11,.22);border-radius:9px;background:rgba(245,158,11,.045)}.tb-update-org-missing.is-visible{display:block}.tb-update-org-missing strong{display:block;color:#e7b66e;font:900 14px 'Barlow Condensed',sans-serif}.tb-update-org-missing span{display:block;margin-top:3px;color:#8c7c6d;font:500 9px/1.45 'DM Mono',monospace}.tb-update-org-missing-list{display:grid;gap:6px;margin-top:9px}.tb-update-org-missing-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px;border:1px solid rgba(255,255,255,.06);border-radius:7px;background:#111}.tb-update-org-missing-row div{min-width:0}.tb-update-org-missing-row b{display:block;color:#ddd;font-size:11px}.tb-update-org-missing-row small{display:block;margin-top:2px;color:#766d67;font:500 8px 'DM Mono',monospace}.tb-update-org-missing-row button{border:1px solid rgba(255,255,255,.1);border-radius:6px;background:#151515;color:#aaa;padding:7px 8px;font:800 7px 'DM Mono',monospace}.tb-update-org-toolbar{display:flex;gap:6px;overflow:auto;padding:6px 0 10px;position:sticky;top:0;z-index:7;background:var(--bg,#0c0c0c);scrollbar-width:none}.tb-update-org-toolbar::-webkit-scrollbar{display:none}.tb-update-org-toolbar button{flex:0 0 auto;min-height:36px;border:1px solid rgba(255,255,255,.09);border-radius:999px;background:#111;color:#817770;padding:8px 11px;font:800 8px 'DM Mono',monospace;cursor:pointer}.tb-update-org-toolbar button.active{border-color:rgba(225,29,72,.5);background:rgba(225,29,72,.1);color:#fff}.tb-update-org-list{display:grid;gap:8px}.tb-update-card{display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:11px;align-items:center;padding:12px;border:1px solid rgba(255,255,255,.075);border-radius:10px;background:#111}.tb-update-card.is-overdue{border-color:rgba(225,29,72,.35)}.tb-update-card.is-today{border-color:rgba(245,158,11,.3)}.tb-update-card.is-completed{opacity:.76}.tb-update-check{width:42px;height:42px;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:#0d0d0d;color:#8a8079;font:900 22px/1 'Barlow Condensed',sans-serif;display:flex;align-items:center;justify-content:center;cursor:pointer}.tb-update-check:not(:disabled):hover,.tb-update-check:not(:disabled):focus-visible{border-color:rgba(225,29,72,.55);color:#fff;background:rgba(225,29,72,.08)}.tb-update-check:disabled{cursor:not-allowed;opacity:.5}.tb-update-card.is-completed .tb-update-check{color:#72c58c;border-color:rgba(34,197,94,.3);opacity:1}.tb-update-main{min-width:0}.tb-update-kicker{display:flex;align-items:center;gap:6px;flex-wrap:wrap;color:#746b65;font:700 8px 'DM Mono',monospace;text-transform:uppercase;letter-spacing:.4px}.tb-update-type{display:inline-flex;padding:4px 6px;border:1px solid rgba(255,255,255,.1);border-radius:999px}.tb-update-type.weekly{color:#78a9e8;border-color:rgba(59,130,246,.3)}.tb-update-type.monthly{color:#e78391;border-color:rgba(225,29,72,.32)}.tb-update-status{display:inline-flex;padding:4px 6px;border-radius:999px;border:1px solid rgba(255,255,255,.1)}.tb-update-status.overdue{color:#ff7788;border-color:rgba(225,29,72,.38)}.tb-update-status.today{color:#f0b86e;border-color:rgba(245,158,11,.35)}.tb-update-status.scheduled{color:#8f857e}.tb-update-status.completed{color:#72c58c;border-color:rgba(34,197,94,.3)}.tb-update-main strong{display:block;margin-top:6px;color:#eee;font:900 17px/1.05 'Barlow Condensed',sans-serif}.tb-update-main p{margin:5px 0 0;color:#8b817a;font-size:10px;line-height:1.4}.tb-update-side{display:flex;flex-direction:column;gap:5px;align-items:stretch}.tb-update-side button{border:1px solid rgba(255,255,255,.1);border-radius:7px;background:#151515;color:#aaa;padding:7px 8px;font:800 7px 'DM Mono',monospace;cursor:pointer}.tb-update-empty,.tb-update-loading{padding:28px 16px;border:1px dashed rgba(255,255,255,.1);border-radius:10px;text-align:center;color:#786e68;font:500 11px/1.5 'DM Mono',monospace}.tb-update-footnote{margin:12px 2px 0;color:#625b56;font:500 8px/1.5 'DM Mono',monospace}@media(max-width:560px){.tb-update-org-stats{grid-template-columns:1fr 1fr}.tb-update-org-stat:last-child{grid-column:1/-1}.tb-update-card{grid-template-columns:44px minmax(0,1fr)}.tb-update-side{grid-column:2;flex-direction:row}.tb-update-side button{flex:1}.tb-update-check{width:40px;height:40px}}
    `;document.head.appendChild(style);
  }

  function ensureScreen(){
    if(document.getElementById(SCREEN_ID))return;
    const app=document.getElementById('app');if(!app)return;
    const screen=document.createElement('div');screen.className='screen';screen.id=SCREEN_ID;
    screen.innerHTML=`<div class="header"><button class="btn-icon" type="button" data-tb-update-back>←</button><div class="header-title">ORGANIZAÇÃO // ATUALIZAÇÕES</div></div><div class="content tb-update-org-content"><div class="tb-update-org-intro"><strong>Agenda dos alunos</strong><span>Próximas atualizações semanais e mensais em ordem de data. Marque como concluída somente depois de finalizar a revisão do aluno.</span><div class="tb-update-org-actions"><button type="button" class="primary" id="tb-update-org-refresh">↻ ATUALIZAR AGENDA</button><button type="button" id="tb-update-org-feedbacks">✉ FEEDBACKS ENVIADOS</button></div></div><div class="tb-update-org-stats" id="tb-update-org-stats"></div><div class="tb-update-org-missing" id="tb-update-org-missing"></div><div class="tb-update-org-toolbar"><button type="button" data-tb-update-filter="upcoming">PRÓXIMAS</button><button type="button" data-tb-update-filter="weekly">SEMANAL</button><button type="button" data-tb-update-filter="monthly">MENSAL</button><button type="button" data-tb-update-filter="completed">CONCLUÍDAS</button></div><div class="tb-update-org-list" id="tb-update-organizer-list"></div><div class="tb-update-footnote">Alunos pausados não entram nas próximas atualizações. A conclusão semanal é apenas organizacional e não altera nem simula o relatório enviado pelo aluno. A conclusão mensal usa o ciclo oficial de atualização completa do Team Bulls.</div></div>`;
    app.appendChild(screen);
    screen.querySelector('[data-tb-update-back]')?.addEventListener('click',()=>{if(typeof goTrainer==='function')goTrainer();});
    screen.querySelector('#tb-update-org-refresh')?.addEventListener('click',()=>load(true));
    screen.querySelector('#tb-update-org-feedbacks')?.addEventListener('click',()=>{const api=window.TeamBullsTrainerFeedbackArchive;if(typeof api?.open==='function')api.open();else if(typeof showToast==='function')showToast('Histórico de feedbacks ainda está carregando.',true);});
    screen.querySelectorAll('[data-tb-update-filter]').forEach(button=>button.addEventListener('click',()=>{filter=button.dataset.tbUpdateFilter||'upcoming';render();}));
  }

  function ensureEntry(){
    if(!trainer())return false;
    const home=document.querySelector('#screen-trainer .content');if(!home)return false;
    let button=document.getElementById(ENTRY_ID);if(button)return true;
    button=document.createElement('button');button.type='button';button.id=ENTRY_ID;button.className='btn-add-set';button.style.marginBottom='14px';button.textContent='🗓 Organização de atualizações — próximas datas';button.addEventListener('click',open);
    const feedback=document.getElementById('tb-trainer-feedback-archive-entry'),reports=document.getElementById('tb-trainer-sent-reports-entry');
    if(feedback)feedback.insertAdjacentElement('afterend',button);else if(reports)reports.insertAdjacentElement('afterend',button);else{const first=home.querySelector('.global-guide-manager-entry')||home.querySelector('.btn-add-set');if(first)first.insertAdjacentElement('afterend',button);else home.prepend(button);}
    return true;
  }

  function weeklyDue(schedule){
    if(!schedule||schedule.enabled===false||!iso(schedule.nextDueDate))return'';
    const interval=Math.max(1,Math.min(90,Math.trunc(Number(schedule.intervalDays)||7))),anchor=String(schedule.nextDueDate),completed=iso(schedule.organizerWeeklyCompletedThrough)?String(schedule.organizerWeeklyCompletedThrough):'';
    let due=anchor,guard=0;
    if(completed){while(due<=completed&&guard++<1200)due=addDays(due,interval);return due;}
    const now=todayIso();if(due>now)return due;
    while(guard++<1200){const next=addDays(due,interval);if(next>now)break;due=next;}
    return due;
  }

  function monthlyState(schedule){
    if(!schedule||!iso(schedule.startDate))return null;
    try{if(typeof v109ProtocolState==='function')return v109ProtocolState({...schedule,_exists:true});}catch(error){}
    const intervalWeeks=Math.max(1,Math.min(52,Math.trunc(Number(schedule.intervalWeeks)||4))),intervalDays=intervalWeeks*7,start=String(schedule.startDate),last=Math.max(0,Math.trunc(Number(schedule.lastCompletedCycle)||0));
    let cycle=Math.max(1,last+1),due=addDays(start,cycle*intervalDays),guard=0;while(due<todayIso()&&guard++<600&&cycle<=last){cycle++;due=addDays(start,cycle*intervalDays);}return{intervalWeeks,nextDueDate:due,pending:due<=todayIso(),pendingCycle:due<=todayIso()?cycle:0,nextCycle:cycle,lastCompletedCycle:last};
  }

  function statusFor(item){
    if(item.completed)return{key:'completed',label:'CONCLUÍDA'};
    const now=todayIso();if(item.dueDate<now)return{key:'overdue',label:'ATRASADA'};if(item.dueDate===now)return{key:'today',label:'HOJE'};return{key:'scheduled',label:'AGENDADA'};
  }

  function taskItem(student,type,dueDate,extra={}){
    return{id:`${type}:${student.uid}:${dueDate}:${extra.cycle||''}`,studentId:String(student.uid),studentName:String(student.name||'Aluno'),studentEmail:String(student.email||''),studentStatus:String(student.status||'active'),type,dueDate:String(dueDate||''),...extra};
  }

  function buildItems(activeStudents){
    currentItems=[];completedItems=[];missingItems=[];
    for(const student of activeStudents){
      const uid=String(student.uid),weekly=schedulesByStudent.get(uid),monthly=protocolByStudent.get(uid);
      const weeklyDate=weeklyDue(weekly);
      if(weeklyDate){currentItems.push(taskItem(student,'weekly',weeklyDate,{schedule:weekly,intervalDays:Math.max(1,Math.min(90,Math.trunc(Number(weekly.intervalDays)||7)))}));}
      else missingItems.push({student,kind:'weekly'});
      if(weekly&&iso(weekly.organizerWeeklyCompletedThrough))completedItems.push(taskItem(student,'weekly',String(weekly.organizerWeeklyCompletedThrough),{completed:true,completedDate:actualDateFromTimestamp(weekly.organizerWeeklyCompletedAt)||String(weekly.organizerWeeklyCompletedThrough),schedule:weekly,intervalDays:Math.max(1,Math.min(90,Math.trunc(Number(weekly.intervalDays)||7)))}));

      const state=monthlyState(monthly);
      if(state&&iso(state.nextDueDate)){currentItems.push(taskItem(student,'monthly',state.nextDueDate,{schedule:monthly,state,cycle:Number(state.pendingCycle||state.nextCycle||0),intervalWeeks:Number(state.intervalWeeks||monthly.intervalWeeks||4)}));}
      else missingItems.push({student,kind:'monthly'});
      if(monthly&&Math.max(0,Number(monthly.lastCompletedCycle)||0)>0&&iso(monthly.lastCompletedDate)){
        const cycle=Math.max(0,Math.trunc(Number(monthly.lastCompletedCycle)||0)),intervalWeeks=Math.max(1,Math.min(52,Math.trunc(Number(monthly.intervalWeeks)||4))),scheduledDue=iso(monthly.startDate)?addDays(monthly.startDate,cycle*intervalWeeks*7):monthly.lastCompletedDate;
        completedItems.push(taskItem(student,'monthly',scheduledDue,{completed:true,completedDate:String(monthly.lastCompletedDate),schedule:monthly,cycle,intervalWeeks}));
      }
    }
    currentItems.sort((a,b)=>a.dueDate.localeCompare(b.dueDate)||normalize(a.studentName).localeCompare(normalize(b.studentName),'pt-BR')||a.type.localeCompare(b.type));
    completedItems.sort((a,b)=>String(b.completedDate||b.dueDate).localeCompare(String(a.completedDate||a.dueDate))||normalize(a.studentName).localeCompare(normalize(b.studentName),'pt-BR'));
  }

  function statsHtml(){
    const now=todayIso(),overdue=currentItems.filter(item=>item.dueDate<now).length,todayCount=currentItems.filter(item=>item.dueDate===now).length,future=currentItems.filter(item=>item.dueDate>now).length;
    return`<div class="tb-update-org-stat overdue"><span>ATRASADAS</span><strong>${overdue}</strong></div><div class="tb-update-org-stat today"><span>PARA HOJE</span><strong>${todayCount}</strong></div><div class="tb-update-org-stat"><span>AGENDADAS</span><strong>${future}</strong></div>`;
  }

  function renderMissing(){
    const box=document.getElementById('tb-update-org-missing');if(!box)return;
    if(!missingItems.length){box.className='tb-update-org-missing';box.innerHTML='';return;}
    const grouped=new Map();for(const row of missingItems){const uid=String(row.student.uid),entry=grouped.get(uid)||{student:row.student,kinds:[]};entry.kinds.push(row.kind);grouped.set(uid,entry);}
    const rows=[...grouped.values()].sort((a,b)=>normalize(a.student.name).localeCompare(normalize(b.student.name),'pt-BR'));
    box.className='tb-update-org-missing is-visible';box.innerHTML=`<strong>⚠ Programação incompleta em ${rows.length} aluno${rows.length===1?'':'s'}</strong><span>Estes alunos ativos não entram corretamente em toda a agenda enquanto o cronograma indicado não for configurado.</span><div class="tb-update-org-missing-list">${rows.map(row=>`<div class="tb-update-org-missing-row"><div><b>${h(row.student.name||'Aluno')}</b><small>Falta: ${row.kinds.map(kind=>kind==='weekly'?'SEMANAL':'MENSAL').join(' + ')}</small></div><button type="button" data-tb-update-open-student="${h(row.student.uid)}">ABRIR ALUNO</button></div>`).join('')}</div>`;
    box.querySelectorAll('[data-tb-update-open-student]').forEach(button=>button.addEventListener('click',()=>openStudent(button.dataset.tbUpdateOpenStudent)));
  }

  function visibleItems(){
    if(filter==='completed')return completedItems;
    if(filter==='weekly')return currentItems.filter(item=>item.type==='weekly');
    if(filter==='monthly')return currentItems.filter(item=>item.type==='monthly');
    return currentItems;
  }

  function description(item){
    if(item.type==='weekly')return`Atualização semanal · a cada ${item.intervalDays||7} dias${item.completed?` · concluída em ${fmtDate(item.completedDate||item.dueDate)}`:''}`;
    return`Atualização completa mensal · ciclo ${item.cycle||'—'} · a cada ${item.intervalWeeks||4} semanas${item.completed?` · concluída em ${fmtDate(item.completedDate||item.dueDate)}`:''}`;
  }

  function cardHtml(item){
    const status=statusFor(item),future=!item.completed&&item.dueDate>todayIso(),typeLabel=item.type==='weekly'?'SEMANAL':'MENSAL',check=item.completed?'☑':'☐',checkTitle=item.completed?'Atualização concluída':future?'Disponível para conclusão na data programada':'Marcar atualização como concluída';
    return`<article class="tb-update-card is-${status.key}${item.completed?' is-completed':''}"><button type="button" class="tb-update-check" data-tb-complete-update="${h(item.id)}" ${item.completed||future?'disabled':''} title="${h(checkTitle)}" aria-label="${h(checkTitle+' de '+item.studentName)}">${check}</button><div class="tb-update-main"><div class="tb-update-kicker"><span>${h(fmtDate(item.dueDate))}</span><span class="tb-update-type ${item.type}">${typeLabel}</span><span class="tb-update-status ${status.key}">${status.label}</span></div><strong>${h(item.studentName)}</strong><p>${h(description(item))}</p></div><div class="tb-update-side"><button type="button" data-tb-update-open-student="${h(item.studentId)}">ABRIR ALUNO</button></div></article>`;
  }

  function render(){
    ensureScreen();
    const stats=document.getElementById('tb-update-org-stats'),list=document.getElementById('tb-update-organizer-list');if(!stats||!list)return;
    stats.innerHTML=statsHtml();renderMissing();
    document.querySelectorAll('[data-tb-update-filter]').forEach(button=>button.classList.toggle('active',button.dataset.tbUpdateFilter===filter));
    if(loading){list.innerHTML='<div class="tb-update-loading">Carregando cronogramas dos alunos...</div>';return;}
    const items=visibleItems();if(!items.length){list.innerHTML=`<div class="tb-update-empty">${filter==='completed'?'Nenhuma conclusão registrada nesta agenda ainda.':'Nenhuma atualização encontrada para este filtro.'}</div>`;return;}
    list.innerHTML=items.map(cardHtml).join('');
    list.querySelectorAll('[data-tb-update-open-student]').forEach(button=>button.addEventListener('click',()=>openStudent(button.dataset.tbUpdateOpenStudent)));
    list.querySelectorAll('[data-tb-complete-update]:not(:disabled)').forEach(button=>button.addEventListener('click',()=>completeById(button.dataset.tbCompleteUpdate)));
  }

  async function load(force=false){
    if(!trainer()||loading)return false;
    const uid=trainerUid();if(!uid)return false;
    if(!force&&loadedTrainerUid===uid&&currentItems.length){render();return true;}
    const serial=++loadSerial;loading=true;render();
    try{
      const studentSnap=await cloudGet(db.collection('users').where('trainerId','==',uid).where('role','==','student').limit(500),'alunos da agenda de atualizações');
      if(serial!==loadSerial||trainerUid()!==uid)return false;
      students=(studentSnap.docs||[]).map(doc=>({...doc.data(),uid:doc.id})).filter(item=>item.role==='student'&&String(item.trainerId||'')===uid);
      studentsById=new Map(students.map(item=>[String(item.uid),item]));
      const activeStudents=students.filter(item=>item.status!=='inactive');
      const scheduleDocs=await mapWithLimit(activeStudents,CONCURRENCY,async student=>{
        const sid=String(student.uid),label=String(student.name||'aluno').slice(0,60);
        const [weekly,protocol]=await Promise.all([
          cloudGet(db.collection('checkinSchedules').doc(sid),'cronograma semanal de '+label).catch(error=>{console.warn('[Team Bulls] Cronograma semanal indisponível para',sid,error?.code||error?.message||error);return null;}),
          cloudGet(db.collection('protocolReviewSchedules').doc(sid),'cronograma mensal de '+label).catch(error=>{console.warn('[Team Bulls] Cronograma mensal indisponível para',sid,error?.code||error?.message||error);return null;})
        ]);
        return{studentId:sid,weekly,protocol};
      });
      if(serial!==loadSerial||trainerUid()!==uid)return false;
      schedulesByStudent=new Map();protocolByStudent=new Map();
      scheduleDocs.forEach(row=>{
        if(row?.weekly?.exists)schedulesByStudent.set(row.studentId,{...row.weekly.data(),studentId:row.studentId,_exists:true});
        if(row?.protocol?.exists){const data=row.protocol.data();if(String(data?.trainerId||'')===uid)protocolByStudent.set(row.studentId,{...data,studentId:row.studentId,_exists:true});}
      });
      buildItems(activeStudents);loadedTrainerUid=uid;return true;
    }catch(error){console.error('[Team Bulls] Agenda de atualizações indisponível.',error);if(typeof showToast==='function')showToast('Não foi possível carregar a agenda de atualizações.',true);return false;}
    finally{if(serial===loadSerial){loading=false;render();}}
  }

  function open(){
    if(!trainer())return false;injectStyles();ensureScreen();ensureEntry();filter='upcoming';render();if(typeof showScreen==='function')showScreen(SCREEN_ID);load(true);return true;
  }

  function openStudent(uid){
    const student=studentsById.get(String(uid));if(!student)return;
    if(typeof viewStudent==='function')viewStudent(student.uid,student.name||'Aluno',student.email||'',student.status||'active');
  }

  function completeById(id){
    const item=currentItems.find(row=>row.id===id);if(!item||item.dueDate>todayIso())return;
    if(item.type==='weekly')completeWeekly(item);else completeMonthly(item);
  }

  function completeWeekly(item){
    const title='Concluir atualização semanal',message=`Marcar a atualização semanal de ${item.studentName}, referente a ${fmtDate(item.dueDate)}, como finalizada? Isso é apenas um controle de organização e não marca relatório do aluno como enviado.`;
    const run=async()=>{
      const key='organizer-weekly-'+item.studentId+'-'+item.dueDate;if(typeof beginAction==='function'&&!beginAction(key))return;
      try{
        const payload={organizerWeeklyCompletedThrough:item.dueDate,organizerWeeklyCompletedAt:firebase.firestore.FieldValue.serverTimestamp(),organizerWeeklyCompletedBy:trainerUid(),updatedBy:trainerUid(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
        await cloudWrite(db.collection('checkinSchedules').doc(item.studentId).set(payload,{merge:true}),'concluir atualização semanal na agenda');
        if(typeof showToast==='function')showToast('✓ Atualização semanal concluída');await load(true);
      }catch(error){alert(typeof cloudWriteError==='function'?cloudWriteError(error,'concluir a atualização semanal'):String(error?.message||error));}
      finally{if(typeof endAction==='function')endAction(key);}
    };
    if(typeof showConfirm==='function')showConfirm(title,message,run);else if(confirm(message))run();
  }

  function completeMonthly(item){
    const schedule=protocolByStudent.get(String(item.studentId))||item.schedule,state=monthlyState(schedule);if(!schedule||!state||!state.pending||String(state.nextDueDate)!==String(item.dueDate)){if(typeof showToast==='function')showToast('A atualização mensal ainda não está disponível para conclusão.',true);return;}
    const cycle=Math.max(1,Math.trunc(Number(state.pendingCycle||item.cycle)||1)),title='Concluir atualização mensal',message=`Marcar a atualização completa mensal nº ${cycle} de ${item.studentName} como realizada? Esta ação avança o ciclo oficial de treino e dieta.`;
    const run=async()=>{
      const key='organizer-monthly-'+item.studentId+'-'+cycle;if(typeof beginAction==='function'&&!beginAction(key))return;
      try{
        const payload={lastCompletedCycle:cycle,lastCompletedDate:todayIso(),lastCompletedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:trainerUid(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
        await cloudWrite(db.collection('protocolReviewSchedules').doc(item.studentId).update(payload),'concluir atualização mensal na agenda');
        const nextSchedule={...schedule,...payload,lastCompletedAt:null,updatedAt:null,_exists:true},nextState=monthlyState(nextSchedule);
        if(nextState&&typeof v109SyncActiveProtocolDates==='function')await v109SyncActiveProtocolDates(item.studentId,schedule.startDate,nextState.nextDueDate);
        if(nextState&&typeof v109SyncProtocolMetadataToWeeklySchedule==='function')await v109SyncProtocolMetadataToWeeklySchedule(item.studentId,schedule.startDate,nextState.nextDueDate);
        if(typeof loadTrainerProtocolReviewAlerts==='function')loadTrainerProtocolReviewAlerts().catch(()=>{});
        if(typeof showToast==='function')showToast('✓ Atualização mensal concluída');await load(true);
      }catch(error){alert(typeof cloudWriteError==='function'?cloudWriteError(error,'concluir a atualização mensal'):String(error?.message||error));}
      finally{if(typeof endAction==='function')endAction(key);}
    };
    if(typeof showConfirm==='function')showConfirm(title,message,run);else if(confirm(message))run();
  }

  function patchLogout(){
    if(typeof confirmLogout!=='function'||confirmLogout.__tbUpdateOrganizer)return;
    const base=confirmLogout;const wrapped=function(){clearState();return base.apply(this,arguments);};wrapped.__tbUpdateOrganizer=true;wrapped.__tbBase=base;confirmLogout=wrapped;
  }

  function install(){injectStyles();ensureScreen();ensureEntry();patchLogout();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('team-bulls-runtime-state',install);
  window.addEventListener('pageshow',()=>{ensureEntry();if(document.getElementById(SCREEN_ID)?.classList.contains('active'))load(true);},{passive:true});

  window.TeamBullsTrainerUpdateOrganizer=Object.freeze({version:VERSION,open,refresh:()=>load(true)});
})();
