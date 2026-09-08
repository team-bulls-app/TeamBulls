/* Team Bulls v10.10.34 — sessões rápidas com reconciliação idempotente de edição/exclusão. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_SESSION_SAVE_PERF_V101034__)return;
  window.__TEAM_BULLS_SESSION_SAVE_PERF_V101034__=true;

  const VERSION='10.10.34-sessionperf2';
  const QUEUE_PREFIX='team_bulls_pending_sessions_v1_';
  const DELETE_PREFIX='team_bulls_pending_session_deletes_v1_';
  const MAX_PENDING=160;
  let flushing=null;
  let retryTimer=null;

  function safeUid(value){return String(value||'').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,160);}
  function queueKey(uidValue){return QUEUE_PREFIX+safeUid(uidValue);}
  function deleteKey(uidValue){return DELETE_PREFIX+safeUid(uidValue);}
  function readJson(key,fallback=[]){try{const parsed=JSON.parse((typeof storageGet==='function'?storageGet(key):localStorage.getItem(key))||'[]');return Array.isArray(parsed)?parsed:fallback;}catch(error){return fallback;}}
  function writeJson(key,value){try{return typeof storageSet==='function'?storageSet(key,JSON.stringify(value)):(localStorage.setItem(key,JSON.stringify(value)),true);}catch(error){return false;}}
  function readQueue(uidValue){if(!uidValue)return[];return readJson(queueKey(uidValue)).filter(item=>item&&item.id&&String(item.userId||'')===String(uidValue));}
  function writeQueue(uidValue,items){return !!uidValue&&writeJson(queueKey(uidValue),items);}
  function readDeletes(uidValue){if(!uidValue)return[];return readJson(deleteKey(uidValue)).filter(item=>item&&item.id&&String(item.userId||'')===String(uidValue));}
  function writeDeletes(uidValue,items){return !!uidValue&&writeJson(deleteKey(uidValue),items);}
  function enqueue(entry){
    const uidValue=String(entry?.userId||'');if(!uidValue||!entry?.id)return false;
    const queue=readQueue(uidValue),index=queue.findIndex(item=>String(item.id)===String(entry.id));
    if(index<0&&queue.length>=MAX_PENDING)return false;
    if(index>=0)queue[index]=entry;else queue.push(entry);
    return writeQueue(uidValue,queue);
  }
  function getQueued(uidValue,id){return readQueue(uidValue).find(item=>String(item.id)===String(id))||null;}
  function replaceQueued(uidValue,id,patch){
    const queue=readQueue(uidValue),index=queue.findIndex(item=>String(item.id)===String(id));if(index<0)return false;
    const current=queue[index],next={...current,...patch,id:current.id,userId:current.userId,workoutId:current.workoutId,exerciseId:current.exerciseId,queuedAt:current.queuedAt||Date.now(),editedAt:Date.now()};
    queue[index]=next;return writeQueue(uidValue,queue);
  }
  function removeQueued(uidValue,id){const queue=readQueue(uidValue),next=queue.filter(item=>String(item.id)!==String(id));return next.length===queue.length||writeQueue(uidValue,next);}
  function enqueueDelete(uidValue,id){
    if(!uidValue||!id)return false;const list=readDeletes(uidValue);if(!list.some(item=>String(item.id)===String(id)))list.push({id:String(id),userId:String(uidValue),queuedAt:Date.now()});return writeDeletes(uidValue,list);
  }
  function removeDelete(uidValue,id){const list=readDeletes(uidValue),next=list.filter(item=>String(item.id)!==String(id));return next.length===list.length||writeDeletes(uidValue,next);}
  function hasDelete(uidValue,id){return readDeletes(uidValue).some(item=>String(item.id)===String(id));}
  function pendingCount(uidValue=String(CURRENT_USER?.uid||'')){return readQueue(uidValue).length;}
  function pendingDeleteCount(uidValue=String(CURRENT_USER?.uid||'')){return readDeletes(uidValue).length;}
  function networkReady(){return navigator.onLine!==false&&MODE==='cloud'&&CURRENT_USER?.role==='student'&&CURRENT_USER?.uid&&db;}

  function createPayload(entry){
    return{
      userId:entry.userId,workoutId:entry.workoutId,exerciseId:entry.exerciseId,exerciseName:entry.exerciseName,
      date:entry.date,week:entry.week,note:entry.note,sets:entry.sets,performedTechniqueMode:entry.performedTechniqueMode||'',
      performedExerciseItemId:entry.performedExerciseItemId||'',performedExerciseName:entry.performedExerciseName||entry.exerciseName||'',
      createdAt:firebase.firestore.FieldValue.serverTimestamp()
    };
  }
  function mutablePayload(entry){
    return{
      exerciseName:entry.exerciseName,date:entry.date,week:entry.week,note:entry.note,sets:entry.sets,
      performedTechniqueMode:entry.performedTechniqueMode||'',performedExerciseItemId:entry.performedExerciseItemId||'',
      performedExerciseName:entry.performedExerciseName||entry.exerciseName||''
    };
  }
  function assertExistingOwner(data,entry){
    if(String(data?.userId||'')!==String(entry.userId)||String(data?.workoutId||'')!==String(entry.workoutId)||String(data?.exerciseId||'')!==String(entry.exerciseId)){
      const error=new Error('O registro salvo no servidor não corresponde à sessão local. Atualize o aplicativo antes de continuar.');error.code='team-bulls/session-conflict';throw error;
    }
  }
  function markLocalSynced(entry){
    try{
      const owner=typeof findSessionOwner==='function'?findSessionOwner(entry.id):null,session=owner?.session||owner?.exercise?.sessions?.find(item=>String(item.id)===String(entry.id));
      if(session){session.pendingSync=false;Object.assign(session,mutablePayload(entry));if(typeof syncSessionToHistory==='function')syncSessionToHistory(session);if(typeof saveSessionArchive==='function')saveSessionArchive(entry.userId,[session]);}
    }catch(error){}
  }
  async function syncEntry(entry){
    if(!networkReady()||String(CURRENT_USER.uid)!==String(entry.userId)||hasDelete(entry.userId,entry.id))return false;
    const ref=db.collection('sessions').doc(entry.id);
    const existing=await cloudGet(ref,'reconciliar registro de série');
    if(existing.exists){assertExistingOwner(existing.data(),entry);await cloudWrite(ref.update(mutablePayload(entry)),'sincronizar registro de série');}
    else await cloudWrite(ref.set(createPayload(entry)),'sincronizar registro de série');
    removeQueued(entry.userId,entry.id);markLocalSynced(entry);return true;
  }
  async function syncDelete(entry){
    if(!networkReady()||String(CURRENT_USER.uid)!==String(entry.userId))return false;
    const ref=db.collection('sessions').doc(entry.id),existing=await cloudGet(ref,'reconciliar exclusão de registro');
    if(!existing.exists){removeDelete(entry.userId,entry.id);return true;}
    if(String(existing.data()?.userId||'')!==String(entry.userId)){const error=new Error('A sessão do servidor pertence a outro usuário.');error.code='team-bulls/session-owner-mismatch';throw error;}
    await cloudWrite(ref.delete(),'excluir registro');removeDelete(entry.userId,entry.id);return true;
  }
  async function flushPending({silent=true}={}){
    if(flushing)return flushing;
    flushing=(async()=>{
      if(!networkReady())return false;
      const uidValue=String(CURRENT_USER.uid);let deleted=0,synced=0;
      for(const entry of readDeletes(uidValue)){
        if(!networkReady()||String(CURRENT_USER?.uid)!==uidValue)break;
        try{if(await syncDelete(entry))deleted++;}catch(error){if(!silent)console.warn('[Team Bulls] Exclusão ainda aguardando sincronização',error);break;}
      }
      for(const entry of readQueue(uidValue)){
        if(!networkReady()||String(CURRENT_USER?.uid)!==uidValue)break;
        if(hasDelete(uidValue,entry.id)){removeQueued(uidValue,entry.id);continue;}
        try{if(await syncEntry(entry))synced++;}catch(error){if(!silent)console.warn('[Team Bulls] Registro ainda aguardando sincronização',error);break;}
      }
      if((synced||deleted)&&typeof runWhenIdle==='function')try{runWhenIdle(()=>saveCloudBackup(),3500);}catch(error){}
      if(!silent&&(synced||deleted)&&typeof showToast==='function')showToast(`✓ Sincronização concluída${synced?` · ${synced} registro${synced===1?'':'s'}`:''}${deleted?` · ${deleted} exclusão${deleted===1?'':'ões'}`:''}`);
      return readQueue(uidValue).length===0&&readDeletes(uidValue).length===0;
    })().finally(()=>{flushing=null;});
    return flushing;
  }
  function scheduleFlush(delay=180){clearTimeout(retryTimer);retryTimer=setTimeout(()=>{flushPending({silent:true}).catch(()=>{});},Math.max(0,delay));}

  function collectSets(selector){
    const rows=[...document.querySelectorAll(selector)],sets=[];
    for(const row of rows){
      const rawWeight=String(row.querySelector('[data-f="w"]')?.value||'').trim(),rawReps=String(row.querySelector('[data-f="r"]')?.value||'').trim();
      if(rawWeight===''&&rawReps==='')continue;
      const weight=rawWeight===''?0:parseFloat(rawWeight),reps=parseInt(rawReps,10);
      if(!Number.isFinite(weight)||!Number.isInteger(reps)||weight<0||weight>10000||reps<0||reps>100)return{error:true,sets:[]};
      const performed={weight,reps};if(row.dataset.backoff==='1')performed.backoff=true;
      const target=typeof normalizePrescriptionSet==='function'?normalizePrescriptionSet({targetMin:row.dataset.targetMin,targetMax:row.dataset.targetMax,ger:row.dataset.ger}):null;
      if(target)Object.assign(performed,target);sets.push(performed);
    }
    return{error:false,sets};
  }

  function installSavePatch(){
    if(typeof saveSession!=='function')return false;if(saveSession.__tbSessionPerfV101034)return true;
    const original=saveSession,base=original.__tbBase||original;
    const fastSave=async function(){
      if(MODE!=='cloud'||CURRENT_USER?.role!=='student')return base.apply(this,arguments);
      const wid=SESSION_WID||CUR_WORKOUT,eid=SESSION_EID||CUR_EX;if(!wid||!eid){alert('Erro: exercício não identificado. Feche e tente novamente.');return;}
      const date=document.getElementById('input-session-date')?.value;if(!date){alert('Selecione a data!');return;}
      const week=parseInt(document.getElementById('input-session-week')?.value,10);if(!week||week<1||week>8){alert('Selecione a semana de treino!');return;}
      const note=String(document.getElementById('input-session-note')?.value||'').trim(),exercise=getE(wid,eid);if(!exercise){alert('Erro: exercício não encontrado. Atualize a tela e tente novamente.');return;}
      const parsed=collectSets('#sets-editor .performed-set-row');if(parsed.error){alert('Confira a carga e as repetições das séries realizadas.');return;}if(!parsed.sets.length){alert('Registre ao menos uma série realizada.');return;}
      const variant=selectedVariantData(exercise,'input-session-variant'),performedTechniqueMode=selectedPerformedTechniqueMode(exercise);LAST_SESSION_WEEK=week;
      if(!beginAction('save-session','modal-session'))return;
      try{
        const sessionId=SESSION_CREATE_ID||(SESSION_CREATE_ID=draftId('sessions'));
        const entry={id:sessionId,userId:CURRENT_USER.uid,workoutId:wid,exerciseId:eid,exerciseName:exercise.name,date,week,note,sets:parsed.sets,performedTechniqueMode,...variant,queuedAt:Date.now()};
        if(!enqueue(entry)){endAction('save-session','modal-session');return base.apply(this,arguments);}
        const sessionData={id:sessionId,userId:CURRENT_USER.uid,workoutId:wid,exerciseId:eid,date,week,note,sets:parsed.sets,exerciseName:exercise.name,performedTechniqueMode,...variant,pendingSync:true};
        if(!exercise.sessions.some(session=>String(session.id)===String(sessionId)))exercise.sessions.push(sessionData);
        syncSessionToHistory(sessionData);saveSessionArchive(CURRENT_USER.uid,[sessionData]);exercise.sessions.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
        SESSION_CREATE_ID=null;closeModal('modal-session');resetRestTimer();if(CUR_WORKOUT===wid&&CUR_EX===eid)renderExercise();showToast('✓ Série registrada');scheduleFlush(40);
      }catch(error){console.error('[Team Bulls] Falha no registro rápido de série',error);alert('Erro ao registrar série: '+(error?.message||error));}
      finally{endAction('save-session','modal-session');}
    };
    fastSave.__tbSessionPerfV101034=true;fastSave.__tbBase=base;saveSession=fastSave;return true;
  }

  function installEditPatch(){
    if(typeof saveEditSession!=='function')return false;if(saveEditSession.__tbPendingEditV101034)return true;
    const base=saveEditSession;
    const wrapped=async function(){
      if(MODE!=='cloud'||CURRENT_USER?.role!=='student')return base.apply(this,arguments);
      const uidValue=String(CURRENT_USER?.uid||''),sessionId=String(EDIT_SESSION_ID||''),pending=getQueued(uidValue,sessionId);if(!pending)return base.apply(this,arguments);
      const date=document.getElementById('edit-session-date')?.value;if(!date){alert('Selecione a data!');return;}
      const week=parseInt(document.getElementById('edit-session-week')?.value,10);if(!week||week<1||week>8){alert('Selecione a semana de treino!');return;}
      const note=String(document.getElementById('edit-session-note')?.value||'').trim(),parsed=collectSets('#edit-sets-editor .performed-set-row');if(parsed.error){alert('Confira a carga e as repetições das séries realizadas.');return;}if(!parsed.sets.length){alert('Registre ao menos uma série realizada ou apague o registro completo.');return;}
      const wid=EDIT_SESSION_WID||pending.workoutId,eid=EDIT_SESSION_EID||pending.exerciseId,e=getE(wid,eid);if(!e){alert('Exercício não encontrado. Atualize a tela e tente novamente.');return;}
      const variant=selectedVariantData(e,'edit-session-variant'),performedTechniqueMode=selectedEditPerformedTechniqueMode(e),idx=e.sessions.findIndex(s=>String(s.id)===sessionId);if(idx<0)return base.apply(this,arguments);
      if(!beginAction('edit-session','modal-edit-session'))return;
      try{
        const patch={date,week,note,sets:parsed.sets,exerciseName:e.name,performedTechniqueMode,...variant};
        if(!replaceQueued(uidValue,sessionId,patch)){endAction('edit-session','modal-edit-session');return base.apply(this,arguments);}
        Object.assign(e.sessions[idx],patch,{pendingSync:true});e.sessions.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
        const editedSession=e.sessions.find(s=>String(s.id)===sessionId);syncSessionToHistory(editedSession);saveSessionArchive(uidValue,[editedSession]);closeModal('modal-edit-session');if(CUR_WORKOUT===wid&&CUR_EX===eid)renderExercise();showToast('✓ Alterações salvas. Sincronizando registro...');scheduleFlush(40);return true;
      }catch(error){alert('Erro ao editar: '+(error?.message||error));return false;}
      finally{endAction('edit-session','modal-edit-session');}
    };
    wrapped.__tbPendingEditV101034=true;wrapped.__tbBase=base;saveEditSession=wrapped;return true;
  }

  function removeLocalSession(sessionId,uidValue){
    try{const owner=typeof findSessionOwner==='function'?findSessionOwner(sessionId):null;if(owner?.exercise)owner.exercise.sessions=owner.exercise.sessions.filter(item=>String(item.id)!==String(sessionId));}catch(error){}
    try{if(typeof removeSessionFromHistory==='function')removeSessionFromHistory(sessionId);}catch(error){}
    try{if(typeof removeSessionFromArchive==='function')removeSessionFromArchive(uidValue,sessionId);}catch(error){}
    try{EDIT_SESSION_ID=null;EDIT_SESSION_WID=null;EDIT_SESSION_EID=null;}catch(error){}
    try{if(typeof saveCloudBackup==='function')saveCloudBackup();}catch(error){}
    try{if(typeof renderExercise==='function')renderExercise();}catch(error){}
  }
  function installDeletePatch(){
    if(typeof performDeleteSession!=='function')return false;if(performDeleteSession.__tbPendingDeleteV101034)return true;
    const base=performDeleteSession;
    const wrapped=async function(sid){
      const sessionId=String(sid||''),uidValue=String(CURRENT_USER?.uid||'');
      if(!sessionId||MODE!=='cloud'||CURRENT_USER?.role!=='student'||!getQueued(uidValue,sessionId))return base.apply(this,arguments);
      const actionKey='delete-pending-session-'+sessionId;if(typeof beginAction==='function'&&!beginAction(actionKey))return false;
      try{
        if(!enqueueDelete(uidValue,sessionId)){showToast('Não foi possível preparar a exclusão segura deste registro.',true);return false;}
        if(!removeQueued(uidValue,sessionId)){removeDelete(uidValue,sessionId);showToast('Não foi possível cancelar a sincronização pendente. Tente novamente.',true);return false;}
        removeLocalSession(sessionId,uidValue);showToast(navigator.onLine===false?'Registro excluído. A remoção será confirmada quando a internet voltar.':'Registro excluído. Confirmando remoção na nuvem...');scheduleFlush(0);return true;
      }finally{if(typeof endAction==='function')endAction(actionKey);}
    };
    wrapped.__tbPendingDeleteV101034=true;wrapped.__tbBase=base;performDeleteSession=wrapped;return true;
  }

  function installFlushBridge(){
    const TB=window.TeamBulls107;if(!TB)return false;
    if(TB.flushPendingMutationSync?.__tbSessionPerfV101034)return true;
    const base=typeof TB.flushPendingMutationSync==='function'?TB.flushPendingMutationSync.bind(TB):async()=>{};
    const combined=async function(){await Promise.allSettled([Promise.resolve(base()),flushPending({silent:true})]);};combined.__tbSessionPerfV101034=true;TB.flushPendingMutationSync=combined;return true;
  }
  function install(){
    const saveOk=installSavePatch(),editOk=installEditPatch(),deleteOk=installDeletePatch(),flushOk=installFlushBridge();
    if(saveOk&&editOk&&deleteOk&&flushOk){window.TeamBullsSessionPerformance=Object.freeze({version:VERSION,pending:pendingCount,pendingDeletes:pendingDeleteCount,get:id=>getQueued(String(CURRENT_USER?.uid||''),id),flush:()=>flushPending({silent:false}),sync:()=>flushPending({silent:true})});return true;}
    return false;
  }

  if(!install())window.addEventListener('team-bulls-v107-ready',()=>install(),{once:true});
  window.addEventListener('online',()=>scheduleFlush(250));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleFlush(350);});
  [700,1800,4200].forEach(delay=>setTimeout(()=>{install();scheduleFlush(0);},delay));
})();
