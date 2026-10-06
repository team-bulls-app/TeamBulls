/* Team Bulls v10.10.63 — registros duráveis e sincronização compatível com Rules 28. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_SESSION_SAVE_PERF_V10109__)return;
  window.__TEAM_BULLS_SESSION_SAVE_PERF_V10109__=true;

  const VERSION='10.10.63-sessionperf4';
  const QUEUE_PREFIX='team_bulls_pending_sessions_v1_';
  const SESSION_SNAPSHOT_VERSION=3;
  const MAX_PENDING=160;
  const MUTABLE_FIELDS=new Set(['date','week','note','sets','exerciseName','performedTechniqueMode','performedExerciseItemId','performedExerciseName','variantId','variantName']);
  const pendingArchiveByUser=new Map(),pendingArchiveScheduled=new Set();
  const indexedSnapshots=new Map(),queueReady=new Map(),queueMutations=new Map(),remoteWrites=new Map();
  let snapshotClock=0;
  let flushing=null;
  let flushAgain=false;
  let retryTimer=null;

  function safeUid(value){return String(value||'').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,160);}
  function queueKey(uidValue){return QUEUE_PREFIX+safeUid(uidValue);}
  function indexedQueueKey(uidValue){return 'pending-sessions:'+String(uidValue);}
  function registeredStudent(){
    try{return CURRENT_USER?.role==='student'&&!!CURRENT_USER.uid&&(MODE==='cloud'||(MODE==='local'&&CURRENT_USER.offlineRegistered===true));}catch(error){return false;}
  }
  function hasPatch(fn,marker){
    const seen=new Set();
    while(typeof fn==='function'&&!seen.has(fn)){if(fn[marker])return true;seen.add(fn);fn=fn.__tbBase;}
    return false;
  }
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
      return{items,fallback:!legacy&&parsed?.fallback===true,version:legacy?1:Math.max(1,Math.trunc(Number(parsed?.v)||1)),updatedAt:Math.max(0,Number(parsed?.updatedAt)||0)};
    }catch(error){return{items:[],fallback:false,version:0,updatedAt:0};}
  }
  function readQueueSnapshot(uidValue){
    if(!uidValue)return{items:[],updatedAt:0};
    const key=queueKey(uidValue);let durableRaw=null,sessionRaw=null;
    try{durableRaw=storageGet(key);}catch(error){}
    try{sessionRaw=sessionStorage.getItem(key);}catch(error){}
    const durable=durableRaw===null?null:parseQueueSnapshot(durableRaw,uidValue);
    const session=sessionRaw===null?null:parseQueueSnapshot(sessionRaw,uidValue);
    const indexed=indexedSnapshots.get(uidValue);
    // Snapshots completos e ordenados impedem que um espelho antigo restaure
    // uma sessão já sincronizada ou excluída. v1/v2 continuam recuperáveis.
    const modern=[durable,indexed,session].filter(value=>value?.version>=3);
    if(modern.length)return modern.reduce((latest,value)=>value.updatedAt>latest.updatedAt?value:latest);
    if(session?.fallback)return session;
    return durable||session||{items:[],updatedAt:0};
  }
  function readQueue(uidValue){return readQueueSnapshot(uidValue).items;}
  async function indexedQueue(mode,uidValue,value){
    if(typeof openMediaDb!=='function')return mode==='readonly'?null:false;
    const database=await withTimeout(openMediaDb(),2500,'abrir armazenamento dos registros');
    if(!database)return mode==='readonly'?null:false;
    return new Promise((resolve,reject)=>{
      let tx,timer,result=null,settled=false;
      const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve(mode==='readonly'?result:true);};
      try{
        tx=database.transaction('media',mode);
        const store=tx.objectStore('media'),key=indexedQueueKey(uidValue);
        const request=mode==='readonly'?store.get(key):store.put(value,key);
        request.onsuccess=()=>{if(mode==='readonly')result=request.result||null;};
        tx.oncomplete=()=>finish();
        tx.onerror=()=>finish(tx.error||new Error('Falha no armazenamento dos registros.'));
        tx.onabort=()=>finish(tx.error||new Error('Gravação dos registros interrompida.'));
        timer=setTimeout(()=>{try{tx.abort();}catch(error){}finish(new Error('O armazenamento dos registros não respondeu.'));},2500);
      }catch(error){finish(error);}
    });
  }
  function ensureQueueReady(uidValue=String(CURRENT_USER?.uid||'')){
    if(!uidValue)return Promise.resolve();
    if(queueReady.has(uidValue))return queueReady.get(uidValue);
    const task=indexedQueue('readonly',uidValue).then(value=>{
      if(value)indexedSnapshots.set(uidValue,parseQueueSnapshot(typeof value==='string'?value:JSON.stringify(value),uidValue));
    }).catch(error=>{queueReady.delete(uidValue);throw error;});
    queueReady.set(uidValue,task);return task;
  }
  async function writeQueue(uidValue,items){
    if(!uidValue)return false;
    snapshotClock=Math.max(Date.now(),snapshotClock+1,readQueueSnapshot(uidValue).updatedAt+1);
    const snapshot={v:SESSION_SNAPSHOT_VERSION,updatedAt:snapshotClock,items};
    const key=queueKey(uidValue),durableSerialized=JSON.stringify(snapshot);let durable=false,indexed=false;
    try{durable=storageSet(key,durableSerialized)===true;}catch(error){}
    if(!durable){
      try{indexed=await indexedQueue('readwrite',uidValue,snapshot)===true;}catch(error){}
      if(indexed)indexedSnapshots.set(uidValue,parseQueueSnapshot(durableSerialized,uidValue));
    }
    // sessionStorage é apenas espelho: fechar o app não pode desfazer um save
    // que já foi confirmado ao aluno.
    if(!durable&&!indexed)return false;
    try{
      sessionStorage.setItem(key,JSON.stringify({...snapshot,fallback:!durable}));
    }catch(error){}
    return true;
  }
  function mutateQueue(uidValue,change){
    const previous=queueMutations.get(uidValue)||Promise.resolve();
    const task=previous.catch(()=>{}).then(async()=>{
      await ensureQueueReady(uidValue);
      const {items,result,changed=true}=change(readQueue(uidValue).map(item=>({...item})));
      if(changed&&!await writeQueue(uidValue,items))throw new Error('Não foi possível guardar o registro neste aparelho. Libere espaço e tente novamente; os campos foram mantidos.');
      return result;
    });
    queueMutations.set(uidValue,task);
    task.finally(()=>{if(queueMutations.get(uidValue)===task)queueMutations.delete(uidValue);}).catch(()=>{});
    return task;
  }
  async function enqueue(entry){
    const normalized=normalizeQueuedEntry(entry),uidValue=String(normalized?.userId||'');if(!uidValue||!normalized?.id)return false;
    return mutateQueue(uidValue,queue=>{
      const index=queue.findIndex(item=>item.id===normalized.id);
      if(index<0&&queue.length>=MAX_PENDING)throw new Error('Há muitos registros aguardando sincronização. Conecte o app antes de adicionar mais; os campos foram mantidos.');
      if(index>=0)queue[index]=normalized;else queue.push(normalized);
      return{items:queue,result:true};
    });
  }
  function removeQueued(uidValue,id,revision=null){
    return mutateQueue(uidValue,queue=>{
      const current=queue.find(item=>String(item.id)===String(id));
      if(!current)return{items:queue,result:true,changed:false};
      if(revision!==null&&current.revision!==revision)return{items:queue,result:false,changed:false};
      return{items:queue.filter(item=>String(item.id)!==String(id)),result:true};
    });
  }
  function queuedEntry(id,uidValue=String(CURRENT_USER?.uid||'')){
    if(!uidValue||!id)return null;
    return readQueue(uidValue).find(item=>String(item.id)===String(id))||null;
  }
  function pendingCount(uidValue=String(CURRENT_USER?.uid||'')){return readQueue(uidValue).length;}
  function pendingSession(id,uidValue=String(CURRENT_USER?.uid||'')){return !!queuedEntry(id,uidValue);}
  async function updatePending(id,patch={},uidValue=String(CURRENT_USER?.uid||'')){
    const safePatch={};for(const [key,value] of Object.entries(patch||{}))if(MUTABLE_FIELDS.has(key))safePatch[key]=value;
    const next=await mutateQueue(uidValue,queue=>{
      const index=queue.findIndex(item=>String(item.id)===String(id)),current=queue[index];
      if(!current)return{items:queue,result:null,changed:false};
      const next=normalizeQueuedEntry({...current,...safePatch,id:current.id,userId:current.userId,workoutId:current.workoutId,exerciseId:current.exerciseId,queuedAt:current.queuedAt,createdAtMs:current.createdAtMs,revision:current.revision+1});
      queue[index]=next;return{items:queue,result:next};
    });
    if(!next)return null;
    ensureLocalSession(next,null,true);
    scheduleFlush(120);return next;
  }
  async function discardPending(id,uidValue=String(CURRENT_USER?.uid||'')){
    return await removeQueued(uidValue,id)&&!queuedEntry(id,uidValue);
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
      variantId:entry.variantId||'',variantName:entry.variantName||'',pendingSync:!!pendingSync,createdAt:stableCreatedAt(entry)
    };
  }
  function durablePendingQueueContains(userId,entry){
    try{
      const raw=storageGet(queueKey(userId));
      const snapshots=[raw===null?null:parseQueueSnapshot(raw,String(userId)),indexedSnapshots.get(userId)].filter(Boolean);
      return snapshots.some(snapshot=>snapshot.items.some(item=>String(item.id)===String(entry?.id||'')&&Number(item.revision||0)===Number(entry?.revision||0)));
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
      if(CURRENT_USER?.uid!==entry.userId||!registeredStudent())return false;
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
      if(CURRENT_USER?.uid!==entry.userId||!registeredStudent())return;
      const latest=queuedEntry(entry.id,entry.userId);
      if(latest)ensureLocalSession(latest,getE(wid,eid)||exercise,true);
      try{if(CUR_WORKOUT===wid&&CUR_EX===eid&&typeof renderExercise==='function')renderExercise();}catch(error){console.warn('[Team Bulls] registro salvo; tela será redesenhada na próxima navegação',error);}
    };
    try{if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0);}catch(error){setTimeout(run,0);}
  }
  function restorePendingSessions({rerender=false}={}){
    try{
      const uidValue=String(CURRENT_USER?.uid||'');
      if(!uidValue||!registeredStudent())return 0;
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
      if(CURRENT_USER?.uid!==entry.userId||!registeredStudent())return;
      const owner=typeof findSessionOwner==='function'?findSessionOwner(entry.id):null;
      if(owner?.session){owner.session.pendingSync=false;syncSessionToHistory?.(owner.session);saveSessionArchive?.(entry.userId,[owner.session]);}
      else ensureLocalSession(entry,null,false);
      if(!document.getElementById('modal-session')?.classList.contains('open')){
        try{if(typeof refreshVisibleSessionHistory==='function')refreshVisibleSessionHistory('student');}catch(error){}
      }
    }catch(error){}
  }
  async function commitEntry(entry){
    if(!networkReady()||CURRENT_USER.uid!==entry.userId)return false;
    const ref=db.collection('sessions').doc(entry.id);
    const current=queuedEntry(entry.id,entry.userId);
    if(!current)return false;
    if(current.revision!==entry.revision){scheduleFlush(80);return false;}
    // Rules 28 negam reads de documentos inexistentes, inclusive consultas
    // otimizadas pelo ID. Criar primeiro evita depender desse read. ID e
    // createdAt estáveis tornam a repetição da mesma criação idempotente.
    try{
      await ref.set(firestorePayload(entry));
    }catch(error){
      if(!String(error?.code||'').includes('permission-denied'))throw error;
      if(!networkReady()||CURRENT_USER?.uid!==entry.userId)return false;
      // Filas antigas podem ter usado serverTimestamp. Se o write anterior
      // chegou ao servidor, o timestamp local não pode substituir createdAt.
      // Somente essa rejeição é reconciliada; não repetimos a criação às cegas.
      const existing=await withTimeout(ref.get({source:'server'}),8000,'reconciliar registro de série');
      if(!existing.exists)throw error;
      assertExistingOwner(existing.data(),entry);
      if(!networkReady()||CURRENT_USER?.uid!==entry.userId)return false;
      const latest=queuedEntry(entry.id,entry.userId);
      if(!latest)return false;
      if(latest.revision!==entry.revision){scheduleFlush(80);return false;}
      await ref.update(mutablePayload(entry));
    }
    const latest=queuedEntry(entry.id,entry.userId);
    if(latest&&latest.revision!==entry.revision){scheduleFlush(30);return true;}
    if(latest){
      if(await removeQueued(entry.userId,entry.id,entry.revision))markLocalSynced(entry);
      else scheduleFlush(80);
    }
    return true;
  }
  async function syncEntry(entry){
    const key=entry.userId+':'+entry.id;
    let task=remoteWrites.get(key);
    if(!task){
      task=commitEntry(entry);remoteWrites.set(key,task);
      task.finally(()=>{if(remoteWrites.get(key)===task)remoteWrites.delete(key);}).catch(()=>{});
    }
    // O timeout libera a interface, mas a Promise real continua identificada:
    // voltar ao app não dispara outra gravação enquanto esta estiver em voo.
    return cloudWrite(task,'sincronizar registro de série');
  }
  async function flushPending({silent=true}={}){
    if(flushing)return flushing;
    flushing=(async()=>{
      restorePendingSessions({rerender:false});
      if(!networkReady())return false;
      const uidValue=String(CURRENT_USER.uid);
      await ensureQueueReady(uidValue);
      const queue=readQueue(uidValue);
      if(!queue.length)return true;
      let synced=0;
      for(const entry of queue){
        if(!networkReady()||CURRENT_USER?.uid!==uidValue)break;
        try{if(await syncEntry(entry))synced++;}
        catch(error){
          console.warn('[Team Bulls] Registro preservado, aguardando sincronização',entry.id,error?.code||error?.message);
          // Erros próprios de um documento não bloqueiam todos os demais.
          // Falta de rede/autenticação encerra esta passagem, sem retry cego.
          const code=String(error?.code||'');
          if(!networkReady()||code.includes('timeout')||code.includes('unavailable')||code.includes('unauthenticated')||code.includes('deadline-exceeded'))break;
        }
      }
      if(synced){
        try{runWhenIdle(()=>saveCloudBackup(),3500);}catch(error){}
        if(!silent)showToast(`✓ ${synced} registro${synced===1?'':'s'} sincronizado${synced===1?'':'s'}`);
      }
      return readQueue(uidValue).length===0;
    })().finally(()=>{flushing=null;if(flushAgain){flushAgain=false;scheduleFlush(80);}});
    return flushing;
  }
  function scheduleFlush(delay=180){
    clearTimeout(retryTimer);
    retryTimer=setTimeout(()=>{if(flushing){flushAgain=true;return;}flushPending({silent:true}).catch(()=>{});},Math.max(0,delay));
  }

  function installSavePatch(){
    if(typeof saveSession!=='function')return false;
    if(hasPatch(saveSession,'__tbSessionPerf'))return true;
    const base=saveSession;
    const fastSave=async function(){
      if(!registeredStudent())return base.apply(this,arguments);
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
      if(sets.length>60){alert('Registre no máximo 60 séries por sessão. Os campos foram mantidos.');return false;}
      LAST_SESSION_WEEK=week;
      if(!beginAction('save-session','modal-session')){showToast('O registro está sendo guardado. Aguarde um instante.');return false;}
      const button=document.querySelector?.('#modal-session .btn-primary'),buttonLabel=button?.textContent;
      if(button){button.textContent='GUARDANDO...';button.setAttribute('aria-busy','true');}
      try{
        const ownerUid=String(CURRENT_USER.uid);
        const sessionId=SESSION_CREATE_ID||(SESSION_CREATE_ID=draftId('sessions')),stamp=Date.now();
        const entry={
          id:sessionId,userId:ownerUid,workoutId:wid,exerciseId:eid,exerciseName:exercise.name,date,week,note,sets,
          performedTechniqueMode,...variant,queuedAt:stamp,createdAtMs:stamp,revision:0
        };
        if(!await enqueue(entry))throw new Error('Não foi possível guardar o registro neste aparelho. Os campos foram mantidos.');
        if(CURRENT_USER?.uid!==ownerUid||!registeredStudent())return true;
        SESSION_CREATE_ID=null;
        try{closeModal('modal-session');}catch(error){}
        try{resetRestTimer();}catch(error){}
        try{showToast('✓ Registro guardado no aparelho. Aguardando sincronização.');}catch(error){}
        scheduleLocalProjection(entry,exercise,wid,eid);
        scheduleFlush(40);
        return true;
      }catch(error){
        console.error('[Team Bulls] Falha no registro rápido de série',error);
        alert('Erro ao registrar série: '+(error?.message||error));
        return false;
      }finally{
        endAction('save-session','modal-session');
        if(button){button.textContent=buttonLabel;button.removeAttribute('aria-busy');}
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
      ready:ensureQueueReady,
      sessions:(uidValue=String(CURRENT_USER?.uid||''))=>uidValue===CURRENT_USER?.uid&&registeredStudent()?readQueue(uidValue).map(entry=>sessionDataFromEntry(entry,true)):[],
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

  function recoverAndSchedule(delay=180){
    if(!registeredStudent())return;
    const userId=String(CURRENT_USER.uid);
    ensureQueueReady(userId).then(()=>{
      if(CURRENT_USER?.uid!==userId)return;
      restorePendingSessions({rerender:true});scheduleFlush(delay);
    }).catch(error=>console.warn('[Team Bulls] Não foi possível recuperar a fila de registros.',error));
  }
  if(!install())window.addEventListener('team-bulls-v107-ready',()=>{install();recoverAndSchedule();},{once:true});
  window.addEventListener('team-bulls-runtime-state',()=>restorePendingSessions({rerender:true}));
  window.addEventListener('team-bulls-student-runtime-ready',()=>{restorePendingSessions({rerender:true});recoverAndSchedule();});
  window.addEventListener('online',()=>recoverAndSchedule(250));
  window.addEventListener('pageshow',()=>recoverAndSchedule(250));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')recoverAndSchedule(350);});
  [900,2600,7000].forEach(delay=>setTimeout(()=>{install();recoverAndSchedule(0);},delay));
  recoverAndSchedule();
})();
