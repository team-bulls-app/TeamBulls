/* Team Bulls v10.10.47 — reconciliação segura da central do treinador a partir das fontes canônicas. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_TRAINER_ACTIVITY_RECONCILIATION_101047__)return;
  window.__TEAM_BULLS_TRAINER_ACTIVITY_RECONCILIATION_101047__=true;

  const VERSION='10.10.47-activityreconcile1';
  const INDEX_VERSION=2;
  const CONCURRENCY=4;
  const SESSION_TTL_MS=120000;
  let running=null;
  let lastRunAt=0;
  let lastTrainerUid='';
  let hookedHub=null;

  const trainer=()=>{try{return CURRENT_USER?.role==='trainer'&&MODE==='cloud'&&!!db;}catch(error){return false;}};
  const trainerUid=()=>trainer()?String(CURRENT_USER?.uid||''):'';
  const cleanId=value=>String(value??'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,190);
  const eventId=(type,sourceId)=>(type==='weekly_checkin'?'w-':'q-')+cleanId(sourceId);
  const iso=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):'';
  const todayIso=()=>{try{return typeof today==='function'?today():new Date().toISOString().slice(0,10);}catch(error){return new Date().toISOString().slice(0,10);}};
  const timeout=(task,ms=9000,label='reconciliar atualizações')=>typeof withTimeout==='function'?withTimeout(task,ms,label):Promise.race([Promise.resolve(task),new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error('Tempo esgotado: '+label),{code:'team-bulls/activity-reconcile-timeout'})),ms))]);
  const timestampDate=value=>{try{const date=value?.toDate?.();return date instanceof Date&&!Number.isNaN(date.getTime())?date:null;}catch(error){return null;}};
  const dateIso=value=>{const date=timestampDate(value);return date?date.toISOString().slice(0,10):'';};
  const timestampFromIso=value=>{const valid=iso(value);if(!valid)return null;try{return firebase.firestore.Timestamp.fromDate(new Date(valid+'T12:00:00Z'));}catch(error){return null;}};
  const serverTimestamp=()=>firebase.firestore.FieldValue.serverTimestamp();
  const eventCollection=uid=>db.collection('trainerActivity').doc(uid).collection('events');
  const metaRef=uid=>db.collection('trainerActivity').doc(uid).collection('meta').doc('index');

  function questionnaireTitle(data){
    const direct=String(data?.title||'').trim();if(direct)return direct.slice(0,160);
    const mode=String(data?.requestMode||'full');
    return mode==='photos'?'Atualização de fotos':mode==='written'?'Relatório escrito':'Relatório completo';
  }
  function weeklyTitle(data){return data?.requestKind==='manual'?'Relatório semanal extra':'Relatório semanal';}
  function submittedDate(data){return iso(data?.submittedDate)||iso(data?.dueDate)||dateIso(data?.answeredAt)||dateIso(data?.createdAt)||todayIso();}
  function createdAtFor(type,data){
    if(type==='questionnaire'&&data?.answeredAt?.toDate)return data.answeredAt;
    if(data?.createdAt?.toDate)return data.createdAt;
    return timestampFromIso(submittedDate(data))||serverTimestamp();
  }

  async function mapWithLimit(items,limit,worker){
    const results=new Array(items.length);let cursor=0;
    const run=async()=>{while(true){const index=cursor++;if(index>=items.length)return;results[index]=await worker(items[index],index);}};
    await Promise.all(Array.from({length:Math.min(Math.max(1,limit),Math.max(1,items.length))},run));
    return results;
  }

  async function loadRoster(uid){
    const snap=await timeout(db.collection('users').where('trainerId','==',uid).where('role','==','student').limit(500).get(),9000,'carregar alunos para reconciliação');
    return(snap.docs||[]).map(doc=>({...doc.data(),uid:doc.id})).filter(item=>item.role==='student'&&String(item.trainerId||'')===uid);
  }

  async function canonicalForStudent(student,uid){
    const sid=String(student.uid||'');if(!sid)return{items:[],failed:false};
    const items=[];let failed=false;
    try{
      const snap=await timeout(db.collection('questionnaires').where('studentId','==',sid).get(),9000,'atualizações de '+String(student.name||'aluno').slice(0,60));
      (snap.docs||[]).forEach(doc=>{
        const data=doc.data()||{};
        if(data.answered!==true)return;
        if(String(data.studentId||'')!==sid)return;
        if(data.trainerId&&String(data.trainerId)!==uid)return;
        items.push({id:eventId('questionnaire',doc.id),type:'questionnaire',sourceId:doc.id,studentId:sid,title:questionnaireTitle(data),submittedDate:submittedDate(data),createdAt:createdAtFor('questionnaire',data)});
      });
    }catch(error){failed=true;console.warn('[Team Bulls] Questionários canônicos indisponíveis para reconciliação:',sid,error?.code||error?.message||error);}
    try{
      const snap=await timeout(db.collection('weeklyCheckins').where('studentId','==',sid).get(),9000,'relatórios semanais de '+String(student.name||'aluno').slice(0,60));
      (snap.docs||[]).forEach(doc=>{
        const data=doc.data()||{};if(String(data.studentId||'')!==sid)return;
        items.push({id:eventId('weekly_checkin',doc.id),type:'weekly_checkin',sourceId:doc.id,studentId:sid,title:weeklyTitle(data),submittedDate:submittedDate(data),createdAt:createdAtFor('weekly_checkin',data)});
      });
    }catch(error){failed=true;console.warn('[Team Bulls] Relatórios semanais canônicos indisponíveis para reconciliação:',sid,error?.code||error?.message||error);}
    return{items,failed};
  }

  async function createMissing(uid,item){
    const ref=eventCollection(uid).doc(item.id);
    const payload={trainerId:uid,studentId:item.studentId,type:item.type,sourceId:String(item.sourceId).slice(0,190),submittedDate:item.submittedDate,title:String(item.title||'Relatório recebido').slice(0,160),read:false,createdAt:item.createdAt};
    try{
      return await timeout(db.runTransaction(async transaction=>{
        const current=await transaction.get(ref);if(current.exists)return false;
        transaction.set(ref,payload);return true;
      }),9000,'recuperar atualização na central');
    }catch(error){
      /* Nunca substitui evento existente nem toca no documento canônico. */
      console.warn('[Team Bulls] Não foi possível reconstruir um índice da central:',item.id,error?.code||error?.message||error);
      return false;
    }
  }

  async function reconcile(force=false){
    if(!trainer())return{ok:false,recovered:0,total:0,reason:'not-trainer'};
    const uid=trainerUid();if(!uid)return{ok:false,recovered:0,total:0,reason:'no-uid'};
    if(lastTrainerUid&&lastTrainerUid!==uid){lastRunAt=0;running=null;}
    lastTrainerUid=uid;
    if(running)return running;
    if(!force&&lastRunAt&&Date.now()-lastRunAt<SESSION_TTL_MS)return{ok:true,recovered:0,total:0,reason:'fresh'};

    running=(async()=>{
      let sourceFailures=0;
      try{
        const roster=await loadRoster(uid);
        const groups=await mapWithLimit(roster,CONCURRENCY,async student=>canonicalForStudent(student,uid));
        const candidates=new Map();
        groups.forEach(group=>{if(group?.failed)sourceFailures++;(group?.items||[]).forEach(item=>candidates.set(item.id,item));});

        const existingSnap=await timeout(eventCollection(uid).get(),10000,'carregar índice atual da central');
        const existing=new Set((existingSnap.docs||[]).map(doc=>String(doc.id)));
        const missing=[...candidates.values()].filter(item=>!existing.has(item.id));
        let recovered=0;
        const created=await mapWithLimit(missing,CONCURRENCY,async item=>createMissing(uid,item));
        created.forEach(value=>{if(value===true)recovered++;});

        if(sourceFailures===0){
          try{await timeout(metaRef(uid).set({indexedVersion:INDEX_VERSION,indexedAt:serverTimestamp()},{merge:true}),7000,'registrar reconciliação da central');}catch(error){console.warn('[Team Bulls] Metadado de reconciliação não atualizado.',error?.code||error?.message||error);}
        }
        lastRunAt=Date.now();
        const result={ok:sourceFailures===0,recovered,total:candidates.size,missing:missing.length,sourceFailures};
        if(recovered>0){
          if(typeof showToast==='function')showToast(`✓ ${recovered} ${recovered===1?'atualização recuperada':'atualizações recuperadas'} na Central`);
          try{window.dispatchEvent(new CustomEvent('team-bulls-trainer-activity-reconciled',{detail:result}));}catch(error){}
        }
        return result;
      }catch(error){
        console.error('[Team Bulls] Reconciliação da Central falhou sem alterar os envios originais.',error);
        return{ok:false,recovered:0,total:0,reason:String(error?.code||error?.message||'error')};
      }finally{running=null;}
    })();
    return running;
  }

  function installHubHook(){
    const hub=window.TeamBullsTrainerHub;
    if(!hub||hub===hookedHub||hub.__tbActivityReconciliation101047)return !!hub;
    const wrapped=Object.freeze({...hub,
      __tbActivityReconciliation101047:true,
      async openInbox(){const result=await hub.openInbox.apply(hub,arguments);reconcile(false).catch(()=>{});return result;},
      async refreshInbox(){const result=await hub.refreshInbox.apply(hub,arguments);await reconcile(true);return result;}
    });
    hookedHub=wrapped;window.TeamBullsTrainerHub=wrapped;return true;
  }
  function install(){if(!trainer())return false;installHubHook();return true;}
  function start(){if(!install())return;setTimeout(()=>reconcile(false).catch(()=>{}),900);}

  start();
  [250,1200,3500].forEach(delay=>setTimeout(()=>{install();},delay));
  window.addEventListener('team-bulls-runtime-ready',()=>{install();reconcile(false).catch(()=>{});});
  window.addEventListener('team-bulls-runtime-state',install);
  window.addEventListener('pageshow',()=>{install();reconcile(false).catch(()=>{});},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&trainer()){install();reconcile(false).catch(()=>{});}},{passive:true});

  window.TeamBullsTrainerActivityReconciliation=Object.freeze({version:VERSION,reconcile,state:()=>({running:!!running,lastRunAt,lastTrainerUid})});
})();
