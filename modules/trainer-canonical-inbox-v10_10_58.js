/* Team Bulls v10.10.58 — Central canônica com deduplicação semanal por requestKey. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_TRAINER_CANONICAL_INBOX_1010585__)return;
  window.__TEAM_BULLS_TRAINER_CANONICAL_INBOX_1010585__=true;

  const VERSION='10.10.58-canonicalinbox6';
  const MAX_ITEMS=500;
  const CONCURRENCY=6;
  const REPAIR_CONCURRENCY=4;
  const REFRESH_TTL_MS=30000;
  let loading=null;
  let repairRunning=null;
  let lastLoadAt=0;
  let activeUid='';
  let items=[];
  let hookedHub=null;
  let filterHooked=false;
  let legacyTrainerMismatchCount=0;
  let legacyAnsweredCount=0;
  let ownerRecoveredCount=0;
  let weeklyDuplicateCount=0;
  const rosterMap=new Map();

  const trainer=()=>{try{return CURRENT_USER?.role==='trainer'&&MODE==='cloud'&&!!db;}catch(error){return false;}};
  const trainerUid=()=>trainer()?String(CURRENT_USER?.uid||''):'';
  const eventCollection=uid=>db.collection('trainerActivity').doc(uid).collection('events');
  const cleanId=value=>String(value??'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,190);
  const eventId=(type,sourceId)=>(type==='weekly_checkin'?'w-':'q-')+cleanId(sourceId);
  const iso=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):'';
  const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const js=value=>h(JSON.stringify(String(value??'')));
  const stampMs=value=>{try{if(value?.toMillis)return value.toMillis();if(value?.toDate)return value.toDate().getTime();if(value?.seconds)return Number(value.seconds)*1000;const parsed=new Date(value||0).getTime();return Number.isFinite(parsed)?parsed:0;}catch(error){return 0;}};
  const dateIso=value=>{try{const date=value?.toDate?.();return date instanceof Date&&!Number.isNaN(date.getTime())?date.toISOString().slice(0,10):'';}catch(error){return'';}};
  const todayIso=()=>{try{return typeof today==='function'?today():new Date().toISOString().slice(0,10);}catch(error){return new Date().toISOString().slice(0,10);}};
  const nowStamp=()=>firebase.firestore.FieldValue.serverTimestamp();
  const timeout=(task,ms=9000,label='carregar central')=>typeof withTimeout==='function'?withTimeout(task,ms,label):Promise.race([Promise.resolve(task),new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error('Tempo esgotado: '+label),{code:'team-bulls/canonical-inbox-timeout'})),ms))]);
  const fmtDate=value=>{try{return typeof fmt==='function'?fmt(value):String(value||'');}catch(error){return String(value||'');}};

  function titleFor(type,data){
    if(type==='weekly_checkin')return data?.requestKind==='manual'?'Relatório semanal extra':'Relatório semanal';
    const direct=String(data?.title||'').trim();if(direct)return direct.slice(0,160);
    const mode=String(data?.requestMode||'full');
    return mode==='photos'?'Atualização de fotos':mode==='written'?'Relatório escrito':'Relatório completo';
  }
  function submittedDate(type,data){
    if(type==='questionnaire')return iso(data?.submittedDate)||dateIso(data?.answeredAt)||iso(data?.dueDate)||dateIso(data?.createdAt)||todayIso();
    return window.TeamBullsWeeklyReportIntegrity?.effectiveSubmittedDate(data)||iso(data?.submittedDate)||iso(data?.dueDate)||'';
  }
  function sourceCreatedAt(type,data){
    if(type==='questionnaire'&&data?.answeredAt?.toDate)return data.answeredAt;
    if(data?.createdAt?.toDate)return data.createdAt;
    const value=submittedDate(type,data);
    try{return firebase.firestore.Timestamp.fromDate(new Date(value+'T12:00:00Z'));}catch(error){return nowStamp();}
  }
  function sourceMs(type,data){return type==='questionnaire'?(stampMs(data?.answeredAt)||stampMs(data?.createdAt)):(stampMs(data?.createdAt)||stampMs(data?.answeredAt));}
  function questionnaireComplete(data){
    if(data?.answered===true)return true;
    if(!stampMs(data?.answeredAt))return false;
    const mode=String(data?.requestMode||'full'),answers=Array.isArray(data?.answers)?data.answers:[],photos=Array.isArray(data?.photoIds)?data.photoIds:[];
    const writtenOk=answers.length>0&&answers.every(answer=>String(answer??'').trim().length>0);
    if(mode==='photos')return photos.length>=6;
    if(mode==='written')return writtenOk;
    return writtenOk&&photos.length>=6;
  }
  function questionnaireRow(doc,data,uid,owned=false){
    const sid=String(data?.studentId||'');if(!sid||!questionnaireComplete(data))return null;
    const trainerMismatch=!!data.trainerId&&String(data.trainerId)!==uid,legacyAnswered=data.answered!==true;
    if(trainerMismatch)legacyTrainerMismatchCount++;if(legacyAnswered)legacyAnsweredCount++;if(owned)ownerRecoveredCount++;
    return{id:eventId('questionnaire',doc.id),type:'questionnaire',sourceId:doc.id,studentId:sid,title:titleFor('questionnaire',data),submittedDate:submittedDate('questionnaire',data),createdAt:sourceCreatedAt('questionnaire',data),_createdMs:sourceMs('questionnaire',data),canonical:true,ownerRecovered:owned,legacyTrainerMismatch:trainerMismatch,legacyAnswered};
  }

  async function mapWithLimit(list,limit,worker){
    const out=new Array(list.length);let cursor=0;
    const run=async()=>{while(true){const index=cursor++;if(index>=list.length)return;try{out[index]=await worker(list[index],index);}catch(error){out[index]=null;}}};
    await Promise.all(Array.from({length:Math.min(Math.max(1,limit),Math.max(1,list.length))},run));return out;
  }
  function runtimeRoster(){
    try{const source=typeof TRAINER_STUDENTS!=='undefined'&&Array.isArray(TRAINER_STUDENTS)?TRAINER_STUDENTS:[];return source.map(row=>{const uid=String(row?.uid||row?.id||row?.studentId||'');return uid?{...row,uid,role:String(row?.role||'student')}:null;}).filter(Boolean);}catch(error){return[];}
  }
  async function loadRoster(uid){
    const snap=await timeout(db.collection('users').where('trainerId','==',uid).where('role','==','student').limit(500).get(),9000,'carregar alunos da Central');
    const map=new Map();
    (snap.docs||[]).map(doc=>({...doc.data(),uid:doc.id})).filter(row=>row.role==='student'&&String(row.trainerId||'')===uid).forEach(row=>map.set(row.uid,row));
    const roster=[...map.values()];rosterMap.clear();roster.forEach(row=>rosterMap.set(row.uid,row));
    // O runtime pode conhecer o nome de um aluno cujo vínculo de leitura está inconsistente.
    // Isso serve somente para rótulo; as Rules continuam decidindo quais documentos podem ser lidos.
    runtimeRoster().forEach(row=>{if(row.role==='student'&&!rosterMap.has(row.uid))rosterMap.set(row.uid,row);});
    return roster;
  }
  async function loadTrainerOwnedQuestionnaires(uid){
    try{
      const snap=await timeout(db.collection('questionnaires').where('trainerId','==',uid).limit(MAX_ITEMS).get(),9000,'relatórios pertencentes ao treinador');
      return(snap.docs||[]).map(doc=>questionnaireRow(doc,doc.data()||{},uid,true)).filter(Boolean);
    }catch(error){console.warn('[Team Bulls] Questionários por propriedade histórica indisponíveis.',error?.code||error?.message||error);return[];}
  }
  async function canonicalForStudent(student,uid){
    const sid=String(student?.uid||'');if(!sid)return[];const rows=[];
    try{
      // Mantém compatibilidade com questionários antigos sem trainerId enquanto o vínculo atual estiver íntegro.
      const snap=await timeout(db.collection('questionnaires').where('studentId','==',sid).get(),9000,'relatórios de '+String(student.name||'aluno').slice(0,60));
      (snap.docs||[]).forEach(doc=>{const row=questionnaireRow(doc,doc.data()||{},uid,false);if(row)rows.push(row);});
    }catch(error){console.warn('[Team Bulls] Relatórios por vínculo indisponíveis para',sid,error?.code||error?.message||error);}
    try{
      const snap=await timeout(db.collection('weeklyCheckins').where('studentId','==',sid).get(),9000,'relatórios semanais de '+String(student.name||'aluno').slice(0,60));
      (snap.docs||[]).forEach(doc=>{const data=doc.data()||{};if(String(data.studentId||'')!==sid)return;rows.push({id:eventId('weekly_checkin',doc.id),type:'weekly_checkin',sourceId:doc.id,studentId:sid,title:titleFor('weekly_checkin',data),submittedDate:submittedDate('weekly_checkin',data),createdAt:sourceCreatedAt('weekly_checkin',data),_createdMs:sourceMs('weekly_checkin',data),_weeklyRequestKey:String(data.requestKey||''),_weeklyFingerprint:window.TeamBullsWeeklyReportIntegrity?.fingerprint(data)||'',canonical:true});});
    }catch(error){console.warn('[Team Bulls] Check-ins canônicos indisponíveis para',sid,error?.code||error?.message||error);}
    return rows;
  }
  async function loadIndex(uid){
    try{const snap=await timeout(eventCollection(uid).orderBy('createdAt','desc').limit(MAX_ITEMS).get(),9000,'estado lido da Central');return(snap.docs||[]).map(doc=>({...doc.data(),id:doc.id,_createdMs:stampMs(doc.data()?.createdAt),canonical:false}));}
    catch(error){console.warn('[Team Bulls] Índice da Central indisponível; exibindo fontes canônicas.',error?.code||error?.message||error);return[];}
  }
  function weeklyLogicalKey(row){return row?.type==='weekly_checkin'&&row._weeklyFingerprint?String(row.studentId||'')+'\u0000'+row._weeklyFingerprint:'';}
  function preferWeekly(candidate,current){
    const candidateMs=Number(candidate?._createdMs)||0,currentMs=Number(current?._createdMs)||0;
    if(candidateMs!==currentMs)return candidateMs>currentMs;
    if(String(candidate?.submittedDate||'')!==String(current?.submittedDate||''))return String(candidate?.submittedDate||'')>String(current?.submittedDate||'');
    return String(candidate?.sourceId||'')>String(current?.sourceId||'');
  }
  function mergeRows(canonicalRows,indexRows){
    const selected=[],positions=new Map(),suppressedIds=new Set();weeklyDuplicateCount=0;
    for(const row of canonicalRows||[]){
      const key=weeklyLogicalKey(row);
      // Sem requestKey não inferimos duplicidade histórica.
      if(!key){selected.push(row);continue;}
      const position=positions.get(key);
      if(position===undefined){positions.set(key,selected.length);selected.push(row);continue;}
      weeklyDuplicateCount++;
      const current=selected[position],takeCandidate=preferWeekly(row,current);
      suppressedIds.add(String((takeCandidate?current:row).id||''));
      if(takeCandidate)selected[position]=row;
    }
    const map=new Map();
    const sources=new Set((canonicalRows||[]).map(row=>row.type+'\u0000'+row.sourceId));
    (indexRows||[]).forEach(row=>{if(!sources.has(row.type+'\u0000'+row.sourceId)&&!suppressedIds.has(String(row.id||'')))map.set(String(row.id),{...row});});
    const indexBySource=new Map();
    (indexRows||[]).forEach(row=>{const key=row.type+'\u0000'+row.sourceId,current=indexBySource.get(key);if(!current||row.read===true)indexBySource.set(key,row);});
    selected.forEach(row=>{const indexed=indexBySource.get(row.type+'\u0000'+row.sourceId);map.set(row.id,{...indexed,...row,read:indexed?.read===true,readAt:indexed?.readAt||null,_createdMs:row._createdMs||indexed?._createdMs||0,canonical:true});});
    return[...map.values()].sort((a,b)=>(b._createdMs||0)-(a._createdMs||0)||String(b.submittedDate||'').localeCompare(String(a.submittedDate||''))).slice(0,MAX_ITEMS);
  }
  function studentName(studentId){const row=rosterMap.get(String(studentId||''));return String(row?.name||row?.email||'Aluno');}
  function currentFilter(){return String(document.querySelector('#tb-inbox-toolbar [data-inbox-filter].active')?.dataset?.inboxFilter||'all');}
  function reportSection(){const body=document.getElementById('tb-inbox-body');if(!body)return null;return[...body.querySelectorAll('.tb-inbox-section')].find(section=>String(section.querySelector('.tb-inbox-section-title span')?.textContent||'').includes('RELATÓRIOS E ATUALIZAÇÕES RECEBIDOS'))||null;}
  function updateBadges(){if(!trainer())return;const unread=items.filter(row=>row.read!==true).length;document.querySelectorAll('[data-tb-inbox-count]').forEach(element=>element.textContent=unread?String(unread):'');}
  function render(){
    if(!trainer())return false;updateBadges();const body=document.getElementById('tb-inbox-body');if(!body)return false;
    const filter=currentFilter();if(filter==='updates')return true;let visible=items;if(filter==='unread')visible=visible.filter(row=>row.read!==true);
    let section=reportSection();if(!section){section=document.createElement('section');section.className='tb-inbox-section';body.appendChild(section);}
    section.innerHTML=`<div class="tb-inbox-section-title"><span>RELATÓRIOS E ATUALIZAÇÕES RECEBIDOS</span><span>${visible.length}</span></div>${visible.length?visible.map(row=>`<button class="tb-activity-card ${row.read===true?'':'unread'}" onclick="TeamBullsCanonicalTrainerInbox.open(${js(row.id)})"><span class="tb-activity-icon">${row.type==='weekly_checkin'?'▤':'◉'}</span><span class="tb-activity-main"><strong>${h(studentName(row.studentId))}${row.read===true?'':'<i class="tb-unread-dot"></i>'}</strong><span>${h(row.title||'Relatório recebido')}</span></span><span class="tb-activity-meta"><b>${h(fmtDate(row.submittedDate||''))}</b><small>${row.type==='weekly_checkin'?'SEMANAL':'SOLICITADO'}</small></span></button>`).join(''):'<div class="tb-empty">Nenhum item neste filtro.</div>'}`;return true;
  }
  function fullPayload(uid,row){return{trainerId:uid,studentId:String(row.studentId||''),type:row.type,sourceId:String(row.sourceId||'').slice(0,190),submittedDate:iso(row.submittedDate)||todayIso(),title:String(row.title||'Relatório recebido').slice(0,160),read:false,createdAt:row.createdAt?.toDate?row.createdAt:nowStamp()};}
  async function ensureIndex(row){
    const uid=trainerUid();if(!uid||!row)return false;const ref=eventCollection(uid).doc(row.id),payload=fullPayload(uid,row);
    try{return await timeout(db.runTransaction(async transaction=>{const doc=await transaction.get(ref);if(doc.exists)return true;transaction.set(ref,payload);return true;}),9000,'indexar relatório visível');}
    catch(error){console.warn('[Team Bulls] Relatório visível, mas índice secundário não pôde ser criado:',row.id,error?.code||error?.message||error);return false;}
  }
  async function markRead(row){if(!row||row.read===true)return true;row.read=true;render();const ok=await ensureIndex(row);if(!ok)return false;try{await timeout(eventCollection(trainerUid()).doc(row.id).set({read:true,readAt:nowStamp()},{merge:true}),7000,'marcar relatório lido');return true;}catch(error){row.read=false;render();return false;}}
  async function open(rowId){
    if(!trainer())return;const row=items.find(item=>item.id===String(rowId));if(!row)return;markRead(row).catch(()=>{});
    try{
      if(row.type==='weekly_checkin'){const doc=await timeout(db.collection('weeklyCheckins').doc(row.sourceId).get(),9000,'abrir relatório semanal');if(!doc.exists)throw new Error('Relatório não encontrado.');WEEKLY_CHECKINS=[{...doc.data(),id:doc.id}];return viewWeeklyCheckin(doc.id,{source:'trainer-inbox',studentId:row.studentId});}
      const doc=await timeout(db.collection('questionnaires').doc(row.sourceId).get(),9000,'abrir relatório respondido');if(!doc.exists||!questionnaireComplete(doc.data()||{}))throw new Error('Relatório não encontrado.');TS_QUEST_CACHE=[{...doc.data(),answered:true,id:doc.id}];return viewQuestionnaire(doc.id,true);
    }catch(error){if(typeof showToast==='function')showToast('Não foi possível abrir este relatório agora.',true);}
  }
  async function repairMissing(){if(repairRunning||!trainer())return repairRunning||Promise.resolve(false);const missing=items.filter(row=>row.canonical===true&&row.read!==true);repairRunning=(async()=>{await mapWithLimit(missing,REPAIR_CONCURRENCY,row=>ensureIndex(row));return true;})().finally(()=>{repairRunning=null;setTimeout(render,80);setTimeout(render,400);});return repairRunning;}
  async function refresh(force=false){
    if(!trainer())return[];const uid=trainerUid();if(!uid)return[];
    if(activeUid&&activeUid!==uid){items=[];rosterMap.clear();lastLoadAt=0;loading=null;}activeUid=uid;
    if(loading)return loading;if(!force&&items.length&&Date.now()-lastLoadAt<REFRESH_TTL_MS){render();return items;}
    loading=(async()=>{
      legacyTrainerMismatchCount=0;legacyAnsweredCount=0;ownerRecoveredCount=0;weeklyDuplicateCount=0;
      const [roster,ownedRows]=await Promise.all([loadRoster(uid),loadTrainerOwnedQuestionnaires(uid)]);
      const groups=await mapWithLimit(roster,CONCURRENCY,student=>canonicalForStudent(student,uid));
      const canonicalRows=[...ownedRows,...groups.flatMap(group=>Array.isArray(group)?group:[])],indexRows=await loadIndex(uid);
      items=mergeRows(canonicalRows,indexRows);lastLoadAt=Date.now();render();repairMissing().catch(()=>{});return items;
    })().catch(error=>{console.error('[Team Bulls] Central canônica não pôde ser atualizada.',error);render();return items;}).finally(()=>{loading=null;});return loading;
  }
  async function markAllRead(){
    if(!trainer())return;await refresh(false);const pending=items.filter(row=>row.read!==true);if(!pending.length){if(typeof showToast==='function')showToast('Nenhum relatório novo para marcar.');return;}
    await mapWithLimit(pending,REPAIR_CONCURRENCY,row=>ensureIndex(row));
    try{for(let offset=0;offset<pending.length;offset+=300){const batch=db.batch();pending.slice(offset,offset+300).forEach(row=>batch.set(eventCollection(trainerUid()).doc(row.id),{read:true,readAt:nowStamp()},{merge:true}));await timeout(batch.commit(),9000,'marcar Central como lida');}pending.forEach(row=>row.read=true);render();if(typeof showToast==='function')showToast('✓ Central marcada como lida');}
    catch(error){if(typeof showToast==='function')showToast('Não foi possível marcar tudo como lido.',true);}
  }
  function hookFilters(){if(filterHooked)return;const screen=document.getElementById('screen-trainer-inbox');if(!screen)return;filterHooked=true;screen.addEventListener('click',event=>{if(event.target?.closest?.('[data-inbox-filter]'))requestAnimationFrame(()=>render());});}
  function hookHub(){
    const hub=window.TeamBullsTrainerHub;if(!hub||hub===hookedHub||hub.__tbCanonicalInbox101058)return !!hub;
    const wrapped=Object.freeze({...hub,__tbCanonicalInbox101058:true,async openInbox(){const result=await hub.openInbox.apply(hub,arguments);hookFilters();await refresh(true);return result;},async refreshInbox(){const result=await hub.refreshInbox.apply(hub,arguments);await refresh(true);return result;},async markAllRead(){return markAllRead();}});
    hookedHub=wrapped;window.TeamBullsTrainerHub=wrapped;return true;
  }
  function install(){if(!trainer())return false;hookHub();hookFilters();return true;}
  function start(){if(!install())return;setTimeout(()=>{if(document.getElementById('screen-trainer-inbox')?.classList.contains('active'))refresh(true).catch(()=>{});},500);}

  start();[150,700,1800].forEach(delay=>setTimeout(install,delay));
  window.addEventListener('team-bulls-runtime-ready',()=>{install();});
  window.addEventListener('team-bulls-runtime-state',install);
  window.addEventListener('pageshow',()=>{install();if(document.getElementById('screen-trainer-inbox')?.classList.contains('active'))refresh(true).catch(()=>{});},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&document.getElementById('screen-trainer-inbox')?.classList.contains('active'))refresh(false).catch(()=>{});},{passive:true});

  window.TeamBullsCanonicalTrainerInbox=Object.freeze({version:VERSION,refresh,render,open,markAllRead,state:()=>({uid:activeUid,count:items.length,lastLoadAt,loading:!!loading,legacyTrainerMismatchCount,legacyAnsweredCount,ownerRecoveredCount,weeklyDuplicateCount,rosterCount:rosterMap.size})});
})();
