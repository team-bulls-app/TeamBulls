/* Team Bulls v10.10.58 — registro imediato de séries com restauração local das pendências. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_SESSION_SAVE_PERF_V10109__)return;
  window.__TEAM_BULLS_SESSION_SAVE_PERF_V10109__=true;

  const VERSION='10.10.58-sessionperf3';
  const QUEUE_PREFIX='team_bulls_pending_sessions_v1_';
  const SESSION_SNAPSHOT_VERSION=2;
  const MAX_PENDING=160;
  const MUTABLE_FIELDS=new Set(['date','week','note','sets','exerciseName','performedTechniqueMode','performedExerciseItemId','performedExerciseName','variantId','variantName']);
  const pendingArchiveByUser=new Map(),pendingArchiveScheduled=new Set();
  let flushing=null;
  let retryTimer=null;

  function safeUid(value){return String(value||'').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,160);}
  function queueKey(uidValue){return QUEUE_PREFIX+safeUid(uidValue);}
  function normalizeQueuedEntry(item){
    if(!item||!item.id||!item.userId)return null;
    const queuedAt=Math.max(1,Math.trunc(Number(item.queuedAt)||Date.now()));
    const createdAtMs=Math.max(1,Math.trunc(Number(item.createdAtMs)||queuedAt));
    const revision=Math.max(0,Math.trunc(Number(item.revision)||0));
    return{...item,queuedAt,createdAtMs,revision};
  }
  function parseQueueSnapshot(raw,uidValue){
    try{
      const parsed=JSON.parse(raw||'[]');
      const legacy=Array.isArray(parsed),source=legacy?parsed:Array.isArray(parsed?.items)?parsed.items:[];
      const items=source.map(normalizeQueuedEntry).filter(item=>item&&item.userId===uidValue);
      return{items,fallback:!legacy&&parsed?.fallback===true,version:legacy?1:Math.max(1,Math.trunc(Number(parsed?.v)||1))};
    }catch(error){return{items:[],fallback:false,version:0};}
  }
  function readQueue(uidValue){
    if(!uidValue)return[];
    const key=queueKey(uidValue);let durableRaw=null,sessionRaw=null;
    try{durableRaw=storageGet(key);}catch(error){}
    try{sessionRaw=sessionStorage.getItem(key);}catch(error){}
    const durable=durableRaw===null?null:parseQueueSnapshot(durableRaw,uidValue);
    const session=sessionRaw===null?null:parseQueueSnapshot(sessionRaw,uidValue);
    /* localStorage é a fonte canônica quando foi gravado com sucesso. O espelho
       da aba só assume a fila quando a própria gravação durável falhou. Assim uma
       cópia antiga em sessionStorage nunca sombreia uma fila durável mais nova. */
    if(session?.fallback)return session.items;
    if(durable)return durable.items;
    return session?.items||[];
  }
  function writeQueue(uidValue,items){
    if(!uidValue)return false;
    const key=queueKey(uidValue),durableSerialized=JSON.stringify(items);let durable=false,session=false;
    try{durable=storageSet(key,durableSerialized)===true;}catch(error){}
    try{
      sessionStorage.setItem(key,JSON.stringify({v:SESSION_SNAPSHOT_VERSION,fallback:!durable,items}));
      session=true;
    }catch(error){}
    return durable||session;
  }
  function enqueue(entry){
    const normalized=normalizeQueuedEntry(entry),uidValue=String(normalized?.userId||'');if(!uidValue||!normalized?.id)return false;
    const queue=readQueue(uidValue),index=queue.findIndex(item=>item.id===normalized.id);
    if(index<0&&queue.length>=MAX_PENDING)return false;
    if(index>=0)queue[index]=normalized;else queue.push(normalized);
    return writeQueue(uidValue,queue);
  }
  function removeQueued(uidValue,id){
    const queue=readQueue(uidValue),next=queue.filter(item=>String(item.id)!==String(id));
    return next.length===queue.length||writeQueue(uidValue,next);
  }
  function queuedEntry(id,uidValue=String(CURRENT_USER?.uid||'')){
    if(!uidValue||!id)return null;
    return readQueue(uidValue).find(item=>String(item.id)===String(id))||null;
  }
  function pendingCount(uidValue=String(CURRENT_USER?.uid||'')){return readQueue(uidValue).length;}
  function pendingSession(id,uidValue=String(CURRENT_USER?.uid||'')){return !!queuedEntry(id,uidValue);}
  function updatePending(id,patch={},uidValue=String(CURRENT_USER?.uid||'')){
    const current=queuedEntry(id,uidValue);if(!current)return null;
    const safePatch={};for(const [key,value] of Object.entries(patch||{}))if(MUTABLE_FIELDS.has(key))safePatch[key]=value;
    const next=normalizeQueuedEntry({...current,...safePatch,id:current.id,userId:current.userId,workoutId:current.workoutId,exerciseId:current.exerciseId,queuedAt:current.queuedAt,createdAtMs:current.createdAtMs,revision:current.revision+1});
    if(!enqueue(next))return null;
    ensureLocalSession(next,null,true);
    scheduleFlush(120);return next;
  }
  function discardPending(id,uidValue=String(CURRENT_USER?.uid||'')){
    if(!queuedEntry(id,uidValue))return true;
    return removeQueued(uidValue,id)&&!queuedEntry(id,uidValue);
  }
  function networkReady(){return navigator.onLine!==false&&MODE==='cloud'&&CURRENT_USER?.role==='student'&&CURRENT_USER?.uid&&db;}
  function stableCreatedAt(entry){
    const ms=Math.max(1,Math.trunc(Number(entry?.createdAtMs)||Number(entry?.queuedAt)||Date.now()));
    try{return firebase.firestore.Timestamp.fromMillis(ms);}catch(error){return new Date(ms);}
  }
  function firestorePayload(entry){
    return{
      userId:entry.userId,workoutId:entry.workoutId,exerciseId:entry.exerciseId,exerciseName:entry.exerciseName,
      date:entry.date,week:entry.week,note:entry.note,sets:entry.sets,performedTechniqueMode:entry.performedTechniqueMode||'',
      performedExerciseItemId:entry.performedExerciseItemId||'',performedExerciseName:entry.performedExerciseName||entry.exerciseName||'',
      variantId:entry.variantId||'',variantName:entry.variantName||'',createdAt:stableCreatedAt(entry)
    };
  }
  function mutablePayload(entry){
    return{
      exerciseName:entry.exerciseName,date:entry.date,week:entry.week,note:entry.note,sets:entry.sets,
      performedTechniqueMode:entry.performedTechniqueMode||'',performedExerciseItemId:entry.performedExerciseItemId||'',
      performedExerciseName:entry.performedExerciseName||entry.exerciseName||'',variantId:entry.variantId||'',variantName:entry.variantName||''
    };
  }
  function assertExistingOwner(data,entry){
    if(String(data?.userId||'')!==String(entry.userId)||String(data?.workoutId||'')!==String(entry.workoutId)||String(data?.exerciseId||'')!==String(entry.exerciseId)){
      const error=new Error('O registro salvo no servidor não corresponde à sessão local. Atualize o aplicativo antes de continuar.');
      error.code='team-bulls/session-conflict';throw error;
    }
  }
  function sessionDataFromEntry(entry,pendingSync=true){
    return{
      id:entry.id,userId:entry.userId,workoutId:entry.workoutId,exerciseId:entry.exerciseId,date:entry.date,week:entry.week,
      note:entry.note,sets:Array.isArray(entry.sets)?entry.sets:[],exerciseName:entry.exerciseName||'',performedTechniqueMode:entry.performedTechniqueMode||'',
      performedExerciseItemId:entry.performedExerciseItemId||'',performedExerciseName:entry.performedExerciseName||entry.exerciseName||'',
      variantId:entry.variantId||'',variantName:entry.variantName||'',pendingSync:!!pendingSync
    };
  }
  function durablePendingQueueContains(userId,entry){
    try{
      const raw=storageGet(queueKey(userId));if(raw===null)return false;
      const snapshot=parseQueueSnapshot(raw,String(userId));
      return snapshot.items.some(item=>String(item.id)===String(entry?.id||'')&&Number(item.revision||0)===Number(entry?.revision||0));
    }catch(error){return false;}
  }
  function persistPendingArchiveLater(userId,session,entry){
    if(!userId||!session)return false;
    /* A fila durável já contém todos os dados necessários para reconstruir a
       sessão. Regravar o arquivo histórico completo a cada toque fazia parse +
       stringify de todo o histórico no thread principal. Só usamos o arquivo
       como fallback quando a própria fila não conseguiu chegar ao localStorage. */
    if(durablePendingQueueContains(userId,entry))return true;
    let pending=pendingArchiveByUser.get(userId);if(!pending){pending=new Map();pendingArchiveByUser.set(userId,pending);}
    pending.set(String(session.id||Date.now()),{...session});
    if(pendingArchiveScheduled.has(userId))return true;
    pendingArchiveScheduled.add(userId);
    const flush=()=>{
      pendingArchiveScheduled.delete(userId);
      const batch=[...(pendingArchiveByUser.get(userId)?.values()||[])];pendingArchiveByUser.delete(userId);
      if(!batch.length)return;
      try{if(typeof saveSessionArchive==='function')saveSessionArchive(userId,batch);}catch(error){console.warn('[Team Bulls] fallback do arquivo local será reconstruído depois',error);}
    };
    try{if(typeof runWhenIdle==='function')runWhenIdle(flush,1200);else setTimeout(flush,80);}catch(error){setTimeout(flush,80);}
    return true;
  }
  function ensureLocalSession(entry,exerciseOverride=null,pendingSync=true){
    try{
      const exercise=exerciseOverride||(typeof getE==='function'?getE(entry.workoutId,entry.exerciseId):null);
      if(!exercise)return false;
      if(!Array.isArray(exercise.sessions))exercise.sessions=[];
      const next=sessionDataFromEntry(entry,pendingSync),index=exercise.sessions.findIndex(session=>String(session?.id||'')===String(entry.id));
      if(index>=0)Object.assign(exercise.sessions[index],next);else exercise.sessions.push(next);
      const current=index>=0?exercise.sessions[index]:exercise.sessions[exercise.sessions.length-1];
      try{if(typeof syncSessionToHistory==='function')syncSessionToHistory(current);}catch(error){console.warn('[Team Bulls] histórico local da série será reconstruído depois',error);}
      try{
        if(typeof saveSessionArchive==='function'){
          if(pendingSync)persistPendingArchiveLater(entry.userId,current,entry);
          else saveSessionArchive(entry.userId,[current]);
        }
      }catch(error){console.warn('[Team Bulls] arquivo local da série será reconstruído depois',error);}
      exercise.sessions.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
      return index<0;
    }catch(error){
      console.warn('[Team Bulls] não foi possível projetar imediatamente o registro pendente no treino',error);
      return false;
    }
  }
  function scheduleLocalProjection(entry,exercise,wid,eid){
    const run=()=>{
      ensureLocalSession(entry,exercise,true);
      try{if(CUR_WORKOUT===wid&&CUR_EX===eid&&typeof renderExercise==='function')renderExercise();}catch(error){console.warn('[Team Bulls] registro salvo; tela será redesenhada na próxima navegação',error);}
    };
    try{if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0);}catch(error){setTimeout(run,0);}
  }
  function restorePendingSessions({rerender=false}={}){
    try{
      const uidValue=String(CURRENT_USER?.uid||'');
      if(!uidValue||CURRENT_USER?.role!=='student'||MODE!=='cloud')return 0;
      const queue=readQueue(uidValue);let inserted=0,visible=false;
      for(const entry of queue){
        if(ensureLocalSession(entry,null,true))inserted++;
        try{if(CUR_WORKOUT===entry.workoutId&&CUR_EX===entry.exerciseId)visible=true;}catch(error){}
      }
      if(rerender&&visible&&inserted>0&&!document.getElementById('modal-session')?.classList.contains('open')){
        try{if(typeof renderExercise==='function')renderExercise();}catch(error){}
      }
      return inserted;
    }catch(error){return 0;}
  }
  function markLocalSynced(entry){
    try{
      const owner=typeof findSessionOwner==='function'?findSessionOwner(entry.id):null;
      if(owner?.session){owner.session.pendingSync=false;syncSessionToHistory?.(owner.session);saveSessionArchive?.(entry.userId,[owner.session]);return;}
      ensureLocalSession(entry,null,false);
    }catch(error){}
  }
  async function syncEntry(entry){
    if(!networkReady()||CURRENT_USER.uid!==entry.userId)return false;
    const ref=db.collection('sessions').doc(entry.id);
    /* Filas antigas podem ter usado serverTimestamp no primeiro write. Se a
       resposta daquele write se perdeu, recriar com o timestamp local atual
       viola a imutabilidade de createdAt das Rules 28. Reconciliamos uma vez:
       documento existente recebe somente campos mutáveis; ausente usa o ID e
       createdAt estáveis da fila atual. Nenhum retry cego é disparado aqui. */
    const existing=await cloudGet(ref,'reconciliar registro de série');
    if(existing.exists){
      assertExistingOwner(existing.data(),entry);
      await cloudWrite(ref.update(mutablePayload(entry)),'sincronizar registro de série');
    }else{
      await cloudWrite(ref.set(firestorePayload(entry)),'sincronizar registro de série');
    }
    const latest=queuedEntry(entry.id,entry.userId);
    if(latest&&latest.revision!==entry.revision){scheduleFlush(30);return true;}
    if(latest&&!removeQueued(entry.userId,entry.id))throw new Error('O registro chegou ao servidor, mas a fila local não pôde ser finalizada.');
    markLocalSynced(entry);
    return true;
  }
  async function flushPending({silent=true}={}){
    if(flushing)return flushing;
    flushing=(async()=>{
      restorePendingSessions({rerender:false});
      if(!networkReady())return false;
      const uidValue=String(CURRENT_USER.uid),queue=readQueue(uidValue);
      if(!queue.length)return true;
      let synced=0;
      for(const entry of queue){
        if(!networkReady()||CURRENT_USER?.uid!==uidValue)break;
        try{if(await syncEntry(entry))synced++;}
        catch(error){
          if(!silent)console.warn('[Team Bulls] Registro ainda aguardando sincronização',error);
          break;
        }
      }
      if(synced){
        try{runWhenIdle(()=>saveCloudBackup(),3500);}catch(error){}
        if(!silent)showToast(`✓ ${synced} registro${synced===1?'':'s'} sincronizado${synced===1?'':'s'}`);
      }
      return readQueue(uidValue).length===0;
    })().finally(()=>{flushing=null;});
    return flushing;
  }
  function scheduleFlush(delay=180){
    clearTimeout(retryTimer);
    retryTimer=setTimeout(()=>{flushPending({silent:true}).catch(()=>{});},Math.max(0,delay));
  }

  function installSavePatch(){
    if(typeof saveSession!=='function')return false;
    if(saveSession.__tbSessionPerf)return true;
    const base=saveSession;
    const fastSave=async function(){
      if(MODE!=='cloud'||CURRENT_USER?.role!=='student')return base.apply(this,arguments);
      const wid=SESSION_WID||CUR_WORKOUT,eid=SESSION_EID||CUR_EX;
      if(!wid||!eid){alert('Erro: exercício não identificado. Feche e tente novamente.');return;}
      const date=document.getElementById('input-session-date')?.value;
      if(!date){alert('Selecione a data!');return;}
      const week=parseInt(document.getElementById('input-session-week')?.value,10);
      if(!week||week<1||week>8){alert('Selecione a semana de treino!');return;}
      const note=String(document.getElementById('input-session-note')?.value||'').trim();
      const exercise=getE(wid,eid);
      if(!exercise){alert('Erro: exercício não encontrado. Atualize a tela e tente novamente.');return;}
      const variant=selectedVariantData(exercise,'input-session-variant');
      const performedTechniqueMode=selectedPerformedTechniqueMode(exercise);
      const rows=[...document.querySelectorAll('#sets-editor .performed-set-row')],sets=[];
      for(const row of rows){
        const rawWeight=String(row.querySelector('[data-f="w"]')?.value||'').trim();
        const rawReps=String(row.querySelector('[data-f="r"]')?.value||'').trim();
        if(rawWeight===''&&rawReps==='')continue;
        const weight=rawWeight===''?0:parseFloat(rawWeight),reps=parseInt(rawReps,10);
        if(!Number.isFinite(weight)||!Number.isInteger(reps)||weight<0||weight>10000||reps<0||reps>100){alert('Confira a carga e as repetições das séries realizadas.');return;}
        const performed={weight,reps};
        if(row.dataset.backoff==='1')performed.backoff=true;
        const target=normalizePrescriptionSet({targetMin:row.dataset.targetMin,targetMax:row.dataset.targetMax,ger:row.dataset.ger});
        if(target)Object.assign(performed,target);
        sets.push(performed);
      }
      if(!sets.length){alert('Registre ao menos uma série realizada.');return;}
      LAST_SESSION_WEEK=week;
      if(!beginAction('save-session','modal-session'))return;
      try{
        const sessionId=SESSION_CREATE_ID||(SESSION_CREATE_ID=draftId('sessions')),stamp=Date.now();
        const entry={
          id:sessionId,userId:CURRENT_USER.uid,workoutId:wid,exerciseId:eid,exerciseName:exercise.name,date,week,note,sets,
          performedTechniqueMode,...variant,queuedAt:stamp,createdAtMs:stamp,revision:0
        };
        if(!enqueue(entry)){
          endAction('save-session','modal-session');
          return base.apply(this,arguments);
        }
        SESSION_CREATE_ID=null;
        try{closeModal('modal-session');}catch(error){}
        try{resetRestTimer();}catch(error){}
        try{showToast('✓ Série, carga e repetições registradas');}catch(error){}
        scheduleLocalProjection(entry,exercise,wid,eid);
        scheduleFlush(40);
        return true;
      }catch(error){
        console.error('[Team Bulls] Falha no registro rápido de série',error);
        alert('Erro ao registrar série: '+(error?.message||error));
        return false;
      }finally{
        endAction('save-session','modal-session');
      }
    };
    fastSave.__tbSessionPerf=true;
    fastSave.__tbBase=base;
    saveSession=fastSave;
    return true;
  }

  function installFlushBridge(){
    const TB=window.TeamBulls107;if(!TB)return false;
    if(TB.flushPendingMutationSync?.__tbSessionPerf)return true;
    const base=typeof TB.flushPendingMutationSync==='function'?TB.flushPendingMutationSync.bind(TB):async()=>{};
    const combined=async function(){
      restorePendingSessions({rerender:false});
      await Promise.allSettled([Promise.resolve(base()),flushPending({silent:true})]);
    };
    combined.__tbSessionPerf=true;
    TB.flushPendingMutationSync=combined;
    return true;
  }
  function exposeApi(){
    window.TeamBullsSessionPerformance=Object.freeze({
      version:VERSION,
      pending:pendingCount,
      hasPending:pendingSession,
      getPending:queuedEntry,
      updatePending,
      discardPending,
      restore:()=>restorePendingSessions({rerender:true}),
      flush:()=>flushPending({silent:false}),
      schedule:()=>scheduleFlush(80)
    });
  }
  function install(){
    const saveOk=installSavePatch(),flushOk=installFlushBridge();
    if(saveOk&&flushOk){exposeApi();restorePendingSessions({rerender:true});return true;}
    return false;
  }

  if(!install())window.addEventListener('team-bulls-v107-ready',()=>install(),{once:true});
  window.addEventListener('team-bulls-runtime-state',()=>restorePendingSessions({rerender:true}));
  window.addEventListener('team-bulls-student-runtime-ready',()=>restorePendingSessions({rerender:true}));
  window.addEventListener('online',()=>{restorePendingSessions({rerender:true});scheduleFlush(250);});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){restorePendingSessions({rerender:true});scheduleFlush(350);}});
  [900,2600,7000].forEach(delay=>setTimeout(()=>{install();restorePendingSessions({rerender:true});scheduleFlush(0);},delay));
})();