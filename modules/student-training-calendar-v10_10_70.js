/* Team Bulls v10.10.70 — Batalha do dia, conclusão do treino e calendário integrado. */
'use strict';
(()=>{
  if(window.__TB_STUDENT_TRAINING_CALENDAR_101070__)return;
  window.__TB_STUDENT_TRAINING_CALENDAR_101070__=true;

  const LOCAL_PREFIX='team_bulls_workout_cycle_v1_';
  const cycleLoads=new Map(),syncFlights=new Map();
  const cycleLoadedAt=new Map();
  const monthCache=new Map();
  let calendarReturn='home',calendarLoadSeq=0,trainerCalendarExerciseReturn=null;
  const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
  const currentUser=()=>{try{return CURRENT_USER||null;}catch(error){return null;}};
  const mode=()=>{try{return String(MODE||'');}catch(error){return'';}};
  const localOwner=()=>{try{return String(INACTIVE_UID||LOCAL_OWNER_UID||LOCAL_GUEST_OWNER||'local-guest');}catch(error){return'local-guest';}};
  const ownerUid=()=>currentUser()?.role==='student'?String(currentUser().uid||''):mode()==='local'?localOwner():'';
  function shouldSync(uid){if(mode()==='cloud')return currentUser()?.role==='student'&&currentUser()?.uid===uid&&currentUser()?.status==='active';return mode()==='local'&&ACCESS_MODE==='offline-registered'&&!!uid&&hasCloudLinkedWorkouts();}
  const trainerTargetUid=()=>currentUser()?.role==='trainer'&&VIEW_STUDENT?.uid?String(VIEW_STUDENT.uid):'';
  const calendarUid=()=>currentUser()?.role==='trainer'?trainerTargetUid():ownerUid();
  const cycleStartDate=workout=>validDate(workout?.startDate)?String(workout.startDate):'1970-01-01';
  const cycleKey=(workout)=>String(workout?.id||'')+'|'+cycleStartDate(workout);
  const cleanOwner=value=>String(value||'local-guest').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,128);
  const storageKey=uid=>LOCAL_PREFIX+cleanOwner(uid);
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const idFor=(prefix,...parts)=>typeof stableEntityId==='function'?stableEntityId(prefix,...parts):prefix+'_'+parts.map(value=>String(value||'')).join('_').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,100);
  const progressKey=uid=>'workout-progress:'+String(uid);
  const fallbackKey=uid=>'team_bulls_workout_progress_v2_'+encodeURIComponent(uid);
  const guideKey=uid=>'team_bulls_guided_workout_v1_'+encodeURIComponent(uid);
  const snapshots=new Map(),progressLoads=new Map();
  let progressChannel=null;
  try{if(typeof BroadcastChannel==='function')progressChannel=new BroadcastChannel('team-bulls-workout-progress-v2');}catch(error){}
  function readJson(key){
    try{return JSON.parse(localStorage.getItem(key)||'null');}catch(error){return null;}
  }
  const isRecord=value=>value&&typeof value==='object'&&!Array.isArray(value);
  function validGuide(guide,uid){
    return guide?.uid===uid&&guide.id&&validDate(guide.date)&&Array.isArray(guide.done)&&Array.isArray(guide.deferred)?guide:null;
  }
  function progressData(value,uid){
    const owned=records=>Object.fromEntries(Object.entries(isRecord(records)?records:{}).filter(([,item])=>item?.studentUid===uid));
    return {uid,revision:Number(value?.revision)||0,guideRevision:Number(value?.guideRevision)||0,states:owned(value?.states),completions:owned(value?.completions),guide:validGuide(value?.guide,uid),lastFinish:value?.lastFinish?.studentUid===uid?value.lastFinish:null};
  }
  function mergeProgress(latest,other){
    if(latest.revision===other.revision)return latest;
    const merge=(left,right)=>{
      const output={...right,...left};
      for(const [key,record] of Object.entries(right)){
        if(record.pendingSync===false&&left[key]?.pendingSync===true)output[key]=record;
      }
      return output;
    };
    const guideSource=other.guideRevision>latest.guideRevision?other:latest;
    const lastFinish=(other.lastFinish?.completedAtMs||0)>(latest.lastFinish?.completedAtMs||0)?other.lastFinish:latest.lastFinish;
    return {...latest,lastFinish,guide:guideSource.guide,guideRevision:guideSource.guideRevision,states:merge(latest.states,other.states),completions:merge(latest.completions,other.completions)};
  }
  function latestProgress(uid,...candidates){
    const valid=candidates.filter(value=>value?.uid===uid&&value.revision>0).sort((a,b)=>b.revision-a.revision);
    if(valid.length)return valid.reduce(mergeProgress);
    return progressData({...readJson(storageKey(uid)),guide:readJson(guideKey(uid))},uid);
  }
  function readLocal(uid){
    if(!uid)return progressData(null,uid);
    const fallback=readJson(fallbackKey(uid));
    return latestProgress(uid,snapshots.get(uid),fallback?.uid===uid?progressData(fallback,uid):null);
  }
  async function progressTransaction(uid,write,callback){
    if(typeof openMediaDb!=='function')return null;
    let database;
    try{database=await withTimeout(openMediaDb(),2500,'abrir progresso do treino');}catch(error){return null;}
    if(!database)return null;
    return new Promise(resolve=>{
      let tx,timer,result=null;
      const finish=value=>{clearTimeout(timer);resolve(value);};
      try{
        tx=database.transaction('media',write?'readwrite':'readonly');
        const store=tx.objectStore('media'),key=progressKey(uid),request=store.get(key);
        tx.oncomplete=()=>finish(result);
        tx.onabort=()=>finish(null);
        request.onsuccess=()=>{
          try{
            const value=request.result;
            result=callback(value?.uid===uid?progressData(value,uid):null);
            if(write&&result?.next)store.put(result.next,key);
          }catch(error){tx.abort();}
        };
        // Abortar a transação evita confirmar um fallback enquanto a gravação
        // original ainda pode ser aplicada.
        timer=setTimeout(()=>{try{tx.abort();}catch(error){}},2500);
      }catch(error){finish(null);}
    });
  }
  function ensureProgress(uid){
    if(!uid)return Promise.resolve(null);
    if(progressLoads.has(uid))return progressLoads.get(uid);
    const pending=progressTransaction(uid,false,indexed=>latestProgress(uid,indexed,readLocal(uid))).then(snapshot=>{
      const value=latestProgress(uid,snapshot,readLocal(uid));snapshots.set(uid,value);return value;
    }).finally(()=>progressLoads.delete(uid));
    progressLoads.set(uid,pending);
    return pending;
  }
  async function mutateProgress(uid,mutate){
    let observed=null;
    const apply=previous=>{
      observed=latestProgress(uid,previous,readLocal(uid));
      const draft={...observed,states:{...observed.states},completions:{...observed.completions}};
      if(!mutate(draft))return {status:'unchanged',snapshot:observed};
      draft.revision=Math.max(Date.now(),observed.revision+1);
      if(draft.guide!==observed.guide)draft.guideRevision=draft.revision;
      return {status:'saved',next:draft};
    };
    let result=await progressTransaction(uid,true,apply);
    if(!result){
      result=apply(observed);
      if(result.next){
        try{localStorage.setItem(fallbackKey(uid),JSON.stringify(result.next));}
        catch(error){result={status:'unavailable',snapshot:observed};}
      }
    }
    const next=result.next||result.snapshot;
    snapshots.set(uid,latestProgress(uid,next,readLocal(uid)));
    if(result.status==='saved')progressChannel?.postMessage(uid);
    return result.status;
  }
  function matchesGuide(saved,expected){
    return saved?.id===expected?.id&&saved?.revision===expected?.revision;
  }
  function workoutDays(workout){try{return typeof getWorkoutDays==='function'?getWorkoutDays(workout):[];}catch(error){return[];}}
  function legacyInitialWeek(workout){
    try{if(validDate(workout?.startDate)&&typeof v104CycleWeek==='function'&&typeof today==='function')return Math.max(1,Math.min(8,Number(v104CycleWeek(workout.startDate,today()))||1));}catch(error){}
    const weeks=(workout?.exercises||[]).flatMap(exercise=>(exercise.sessions||[]).map(session=>Number(session.week)||0)).filter(week=>week>=1&&week<=8);
    return weeks.length?Math.max(...weeks):1;
  }
  function stateFor(workout,uid=ownerUid()){
    return uid&&workout?.id?readLocal(uid).states[cycleKey(workout)]||null:null;
  }
  function newCycleState(workout,uid){
    return {docId:idFor('wcs',uid,workout.id,cycleStartDate(workout)),studentUid:uid,workoutId:String(workout.id),startDate:cycleStartDate(workout),initialWeek:legacyInitialWeek(workout),pendingSync:shouldSync(uid),syncError:''};
  }
  function completionId(uid,workout,week,day){return idFor('wcomp',uid,workout.id,cycleStartDate(workout),week,day.id);}
  function completionFor(workout,week,day,uid=ownerUid()){
    if(!uid)return null;const data=readLocal(uid);return data.completions[completionId(uid,workout,week,day)]||null;
  }
  function currentWeek(workout,uid=ownerUid()){
    if(!workout)return 1;const state=stateFor(workout,uid),initial=Math.max(1,Math.min(8,Number(state?.initialWeek)||legacyInitialWeek(workout))),days=workoutDays(workout);
    if(!days.length)return initial;
    const data=readLocal(uid);
    for(let week=initial;week<=8;week++){
      if(days.some(day=>!data.completions[completionId(uid,workout,week,day)]))return week;
    }
    return 8;
  }
  function isWeekComplete(workout,week,uid=ownerUid()){
    const days=workoutDays(workout);return days.length>0&&days.every(day=>!!completionFor(workout,week,day,uid));
  }
  async function queryStudentRecords(collection,uid,workoutId){
    let snapshot;
    try{snapshot=await cloudGet(db.collection(collection).where('studentUid','==',uid).where('workoutId','==',workoutId),'progresso do treino');}
    catch(indexError){snapshot=await cloudGet(db.collection(collection).where('studentUid','==',uid),'progresso do treino');}
    return(snapshot?.docs||[]).map(doc=>({...doc.data(),id:doc.id})).filter(item=>String(item.workoutId||'')===String(workoutId));
  }
  function syncPending(uid){
    if(mode()!=='cloud'||!shouldSync(uid)||navigator.onLine===false)return Promise.resolve(false);
    if(syncFlights.has(uid))return syncFlights.get(uid);
    const task=syncStudentProgress(uid).finally(()=>syncFlights.delete(uid));
    syncFlights.set(uid,task);
    return task;
  }
  async function syncStudentProgress(uid){
    const revision=typeof AUTH_STATE_REVISION==='number'?AUTH_STATE_REVISION:null;
    const current=()=>mode()==='cloud'&&shouldSync(uid)&&(revision===null||revision===AUTH_STATE_REVISION)&&auth?.currentUser?.uid===uid;
    await ensureProgress(uid);
    if(!current())return false;
    const data=readLocal(uid),lookups=new Map();
    let ok=true;
    for(const [bucket,collection] of [['states','workoutCycleStates'],['completions','workoutCompletions']]){
      for(const [key,record] of Object.entries(data[bucket])){
        if(!record?.pendingSync)continue;
        if(!current())return false;
        const cycle={studentUid:uid,workoutId:record.workoutId,startDate:record.startDate};
        const completion=bucket==='completions';
        const id=completion?key:record.docId;
        const lookupKey=collection+'|'+record.workoutId;
        const changes={};
        try{
          // A leitura direta de um doc ainda inexistente falha pelas regras de propriedade.
          // A consulta restrita ao dono permite distinguir ausência de falta de acesso.
          if(!lookups.has(lookupKey))lookups.set(lookupKey,queryStudentRecords(collection,uid,record.workoutId));
          const rows=await lookups.get(lookupKey);
          if(!current())return false;
          const belongs=saved=>saved.studentUid===uid&&saved.workoutId===record.workoutId&&saved.startDate===record.startDate&&
            (!completion||(Number(saved.week)===Number(record.week)&&saved.dayId===record.dayId));
          const existing=rows.find(belongs);
          if(!existing){
            const details=completion?{week:record.week,dayId:record.dayId,dayName:record.dayName,completedDate:record.completedDate}:{initialWeek:record.initialWeek};
            await cloudWrite(db.collection(collection).doc(id).set({...cycle,...details,createdAt:firebase.firestore.FieldValue.serverTimestamp()}),'sincronizar progresso do treino');
          }else if(!completion)changes.initialWeek=Math.max(1,Math.min(8,Number(existing.initialWeek)||record.initialWeek));
          Object.assign(changes,{pendingSync:false,syncError:''});
        }catch(error){changes.syncError=String(error?.message||error).slice(0,180);ok=false;}
        if(!current())return false;
        const saved=await mutateProgress(uid,draft=>{
          const entry=draft[bucket][key];
          if(!current()||!entry?.pendingSync)return false;
          draft[bucket][key]={...entry,...changes};return true;
        });
        if(saved==='unavailable')ok=false;
      }
    }
    return ok;
  }
  async function loadCycleData(workout,uid=ownerUid()){
    if(!uid||!workout?.id)return false;
    const key=uid+'|'+cycleKey(workout);
    if(cycleLoads.has(key))return cycleLoads.get(key);
    if(Date.now()-(cycleLoadedAt.get(key)||0)<60000)return true;
    const revision=typeof AUTH_STATE_REVISION==='number'?AUTH_STATE_REVISION:null;
    const current=()=>ownerUid()===uid&&(revision===null||revision===AUTH_STATE_REVISION);
    const promise=(async()=>{
      await ensureProgress(uid);
      if(!current())return false;
      if(mode()!=='cloud'||navigator.onLine===false){cycleLoadedAt.set(key,Date.now());return true;}
      try{
        const [states,completions]=await Promise.all([
          queryStudentRecords('workoutCycleStates',uid,workout.id),
          queryStudentRecords('workoutCompletions',uid,workout.id)
        ]);
        if(!current()||mode()!=='cloud')return false;
        const startDate=cycleStartDate(workout),cloudState=states.find(item=>item.studentUid===uid&&item.startDate===startDate);
        const days=new Map(workoutDays(workout).map(day=>[String(day.id),day]));
        await mutateProgress(uid,local=>{
          if(!current()||mode()!=='cloud')return false;
          const cycle=cycleKey(workout);
          if(cloudState){
            local.states[cycle]={...newCycleState(workout,uid),docId:cloudState.id,initialWeek:Math.max(1,Math.min(8,Number(cloudState.initialWeek)||1)),pendingSync:false};
          }else local.states[cycle]??=newCycleState(workout,uid);
          for(const saved of completions){
            const day=days.get(String(saved.dayId)),week=Number(saved.week);
            if(saved.studentUid!==uid||saved.startDate!==startDate||!validDate(saved.completedDate)||!day||!Number.isInteger(week)||week<1||week>8)continue;
            const id=completionId(uid,workout,week,day);
            local.completions[id]={studentUid:uid,workoutId:String(workout.id),startDate,week,dayId:String(day.id),dayName:String(saved.dayName||day.name),completedDate:saved.completedDate,completedAtMs:local.completions[id]?.completedAtMs||(typeof createdMillis==='function'?createdMillis(saved.createdAt):0),pendingSync:false,syncError:''};
          }
          if(local.guide?.cycle===cycle&&!local.guide.repeat){
            const day=days.get(local.guide.dayId);
            if(day&&local.completions[completionId(uid,workout,local.guide.week,day)])local.guide=null;
          }
          return true;
        });
        if(current())void syncPending(uid).catch(()=>{});
        return true;
      }catch(error){
        console.warn('Falha ao carregar o progresso do ciclo',error);
        return false;
      }finally{if(current())cycleLoadedAt.set(key,Date.now());}
    })();
    cycleLoads.set(key,promise);try{return await promise;}finally{cycleLoads.delete(key);}
  }
  function studentCanComplete(uid){
    const user=currentUser();if(user?.role==='student'&&user.status==='active'&&user.uid===uid)return true;
    if(mode()==='local'&&ACCESS_MODE==='local-guest')return true;
    if(mode()==='local'&&ACCESS_MODE==='offline-registered'&&uid&&hasCloudLinkedWorkouts())return true;
    return false;
  }
  function setCompletionPanel(workout,day,uid){
    const host=document.getElementById('student-workout-completion');if(!host||!workout||!day)return;
    const state=stateFor(workout,uid),week=currentWeek(workout,uid),record=completionFor(workout,week,day,uid),days=workoutDays(workout),done=days.filter(item=>completionFor(workout,week,item,uid)).length;
    const canWrite=studentCanComplete(uid),allDone=isWeekComplete(workout,week,uid),cycleDone=week===8&&allDone;
    const pending=Object.values(readLocal(uid).completions).filter(item=>item.workoutId===String(workout.id)&&item.startDate===cycleStartDate(workout)&&item.pendingSync);
    const needsRetry=!!(pending.length||state?.pendingSync);
    const status=record?.pendingSync
      ?(record.syncError?'Dia concluído neste aparelho · falha na sincronização':'Dia concluído neste aparelho · aguardando sincronização')
      :record?(mode()==='cloud'?'Dia concluído nesta semana · sincronizado':'Dia concluído nesta semana')
      :state?.syncError?'Não foi possível carregar ou sincronizar o progresso.':state?.pendingSync?'Progresso salvo neste aparelho · aguardando sincronização':'';
    const pendingNote=pending.length&&!record?.pendingSync?`<div class="workout-completion-status pending">${pending.length} confirmação(ões) aguardando sincronização</div>`:'';
    const guide=readGuide(uid);
    const start=guide
      ?(sameDay(guide,workout,day)?guidedPanel(guide):`<p class="student-guided-context">Você já tem um treino iniciado.</p>${guideButton('Abrir treino iniciado','showFullDay()')}`)
      :canWrite&&exercisesForDay(workout,day.name).length?guideButton('Iniciar treino','startGuidedWorkout()',true):'';
    const content=`<div class="workout-completion-progress">
      <div class="workout-completion-head"><div><span>PROGRESSO DO CICLO</span><strong>${cycleDone?'Ciclo de 8 semanas concluído':`Semana ${week} de 8`}</strong></div><span class="workout-completion-count">${done}/${days.length} dias</span></div>
      <div class="workout-completion-track"><span style="width:${days.length?Math.round(done/days.length*100):0}%"></span></div>
      ${status?`<div class="workout-completion-status ${needsRetry?'pending':''}" role="status">${escapeHtml(status)}</div>`:''}
      ${!canWrite?'<div class="workout-completion-status">Somente leitura</div>':''}${pendingNote}
      ${canWrite&&needsRetry?'<button class="workout-completion-retry" type="button" onclick="TeamBullsWorkoutCompletion.retrySync()">TENTAR SINCRONIZAR</button>':''}
    </div>${start?`<div class="student-workout-start">${start}</div>`:''}`;
    renderBattleContent(host,content);
  }
  function renderStudentDay(){
    const host=document.getElementById('student-workout-completion');if(!host)return;
    let workout=null,dayName='',uid=ownerUid();try{if(typeof CUR_WORKOUT!=='undefined')workout=getW(CUR_WORKOUT);dayName=String(CUR_DAY||'');}catch(error){}
    const day=workoutDays(workout).find(item=>String(item.name)===dayName||normalizedDay(item.name)===normalizedDay(dayName));
    if(!workout||!day){host.innerHTML='';return;}
    const before=currentWeek(workout,uid);try{LAST_SESSION_WEEK=before;}catch(error){}
    setCompletionPanel(workout,day,uid);
    loadCycleData(workout,uid).then(()=>{
      if(document.getElementById('student-workout-completion')!==host||ownerUid()!==uid||CUR_WORKOUT!==workout.id||normalizedDay(CUR_DAY)!==normalizedDay(day.name))return;
      const after=currentWeek(workout,uid);try{LAST_SESSION_WEEK=after;}catch(error){}
      setCompletionPanel(workout,day,uid);
      if(after!==before&&document.getElementById('screen-day')?.classList.contains('active'))setTimeout(()=>{if(typeof renderDay==='function')renderDay();},0);
    });
  }
  function normalizedDay(value){try{return normalizedName(value);}catch(error){return String(value||'').trim().toLowerCase();}}
  async function completeDay({uid,workout,day,week,guide}){
    if(!guide||!workout||!day||!uid||!studentCanComplete(uid)){showToast('Esta confirmação exige uma conta ativa ou um plano local editável.',true);return false;}
    const revision=typeof AUTH_STATE_REVISION==='number'?AUTH_STATE_REVISION:null;
    const id=completionId(uid,workout,week,day),action='complete-day:'+id;
    const current=()=>ownerUid()===uid&&studentCanComplete(uid)&&(revision===null||revision===AUTH_STATE_REVISION);
    if(!beginAction(action))return false;
    try{
      const saved=await mutateProgress(uid,draft=>{
        if(!current()||!matchesGuide(draft.guide,guide))return false;
        // A conclusão e o encerramento do guia sobrevivem juntos à reabertura do app.
        draft.states[cycleKey(workout)]??=newCycleState(workout,uid);
        const completedAtMs=Math.max(Date.now(),(draft.lastFinish?.completedAtMs||0)+1);
        const finished={studentUid:uid,workoutId:String(workout.id),startDate:cycleStartDate(workout),week,dayId:String(day.id),dayName:String(day.name),completedDate:today(),completedAtMs};
        draft.completions[id]??={...finished,pendingSync:shouldSync(uid),syncError:''};
        draft.lastFinish=finished;
        draft.guide=null;
        return true;
      });
      if(!current())return false;
      if(saved==='unavailable'){showToast('O aparelho não conseguiu guardar a conclusão. Tente concluir novamente.',true);return false;}
      refreshBattleScreens();
      if(saved!=='saved')return false;
      if(activeScreenId()==='screen-day'&&CUR_WORKOUT===workout.id&&normalizedDay(CUR_DAY)===normalizedDay(day.name))renderStudentDay();
      monthCache.clear();
      showToast(guide.repeat?'✓ Repetição encerrada':readLocal(uid).completions[id]?.pendingSync?'✓ Treino concluído neste aparelho · sincronização pendente':'✓ Treino concluído');
      if(mode()==='cloud')void syncPending(uid).then(ok=>{
        if(ok&&current()&&readLocal(uid).completions[id]?.pendingSync)return syncPending(uid);
      }).then(()=>{if(current())refreshBattleScreens();}).catch(()=>{});
      return true;
    }finally{
      endAction(action);
    }
  }
  async function retrySync(){
    const uid=ownerUid(),button=document.querySelector('#student-workout-completion .workout-completion-retry');
    if(!uid||mode()!=='cloud'||navigator.onLine===false){
      showToast('Conecte-se ao app com sua conta para sincronizar o treino salvo.',true);return false;
    }
    if(button){button.disabled=true;button.textContent='SINCRONIZANDO…';}
    const synced=await syncPending(uid);
    if(ownerUid()!==uid)return false;
    for(const key of cycleLoadedAt.keys())if(key.startsWith(uid+'|'))cycleLoadedAt.delete(key);
    if(activeScreenId()==='screen-day')renderStudentDay();
    monthCache.clear();
    if(activeScreenId()==='screen-calendar')void loadCalendarMonth();
    showToast(synced?'✓ Progresso do treino sincronizado':'O progresso continua salvo neste aparelho. Tente sincronizar de novo.',!synced);
    return synced;
  }
  function diagnostics(){const data=readLocal(ownerUid()),items=[...Object.values(data.states),...Object.values(data.completions)],pending=items.filter(item=>item?.pendingSync),failed=pending.filter(item=>!!item.syncError);return{pending:pending.length,failed:failed.length};}

  function readGuide(uid=ownerUid()){
    return uid&&currentUser()?.role!=='trainer'?readLocal(uid).guide:null;
  }
  async function saveGuide(uid,current,next,completionKey=''){
    if(!uid||ownerUid()!==uid)return false;
    const revision=typeof AUTH_STATE_REVISION==='number'?AUTH_STATE_REVISION:null;
    const sameOwner=()=>ownerUid()===uid&&studentCanComplete(uid)&&(revision===null||revision===AUTH_STATE_REVISION);
    const result=await mutateProgress(uid,draft=>{
      if(!sameOwner()||!matchesGuide(draft.guide,current))return false;
      if(completionKey){
        const workout=getW(next.workoutId);
        if(!workout||cycleKey(workout)!==next.cycle||!!draft.completions[completionKey]!==!!next.repeat)return false;
        draft.states[next.cycle]??=newCycleState(workout,uid);
      }
      draft.guide=next?{...next,revision:(current?.revision??0)+1}:null;
      return true;
    });
    if(!sameOwner())return false;
    if(result==='unavailable'){showToast('O armazenamento do aparelho está indisponível. Tente novamente.',true);return false;}
    refreshBattleScreens();
    if(result==='unchanged'){
      showToast('O progresso mudou. Confira o dia atual antes de continuar.',true);return false;
    }
    if(next?.status==='active'&&(!current||current.status==='paused'||next.exerciseId!==current.exerciseId)){
      document.querySelector('.screen.active .student-guided-card h3')?.focus({preventScroll:true});
    }
    return true;
  }
  function sameDay(guide,workout,day){
    return !!(guide&&workout&&day&&guide.cycle===cycleKey(workout)&&guide.dayId===String(day.id));
  }
  function guideContext(guide=readGuide()){
    if(!guide)return null;
    const workout=getW(guide.workoutId),day=workoutDays(workout).find(day=>String(day.id)===guide.dayId);
    if(!sameDay(guide,workout,day))return null;
    const exercises=exercisesForDay(workout,day.name);
    const remaining=exercises.filter(item=>!guide.done.includes(String(item.id)));
    const queue=[...remaining.filter(item=>!guide.deferred.includes(String(item.id))),...remaining.filter(item=>guide.deferred.includes(String(item.id)))];
    const exercise=queue.find(item=>String(item.id)===guide.exerciseId)||queue[0];
    return {uid:guide.uid,workout,day,week:guide.week,guide,exercises,remaining,queue,exercise};
  }
  function canUseGuide(guide){return !!guide&&studentCanComplete(guide.uid)&&ownerUid()===guide.uid;}
  function dayState(workout,day){
    const guide=readGuide();
    return sameDay(guide,workout,day)?guide.status:'';
  }
  function homeWorkout(){
    const workouts=getWorkouts()||[],activeId=activeWorkoutId(workouts);
    return workouts.find(workout=>String(workout.id)===activeId);
  }
  function homeTraining(workout,uid,date){
    if(!workout)return {status:'empty'};
    if(validDate(workout.startDate)&&date<workout.startDate)return {status:'future'};
    const days=workoutDays(workout),week=currentWeek(workout,uid),cycleStart=cycleStartDate(workout),data=readLocal(uid);
    const completions=Object.values(data.completions).filter(item=>item.workoutId===String(workout.id)&&item.startDate===cycleStart&&item.completedDate<=date);
    if(completions.some(item=>item.completedDate===date))return {status:'today-complete',week};
    const ordered=days.map(day=>{
      const exercises=exercisesForDay(workout,day.name);
      let latest='';
      for(const exercise of exercises)for(const session of exercise.sessions||[]){
        const written=String(session?.date||'');
        if(Number(session?.week)===week&&session?.sets?.length&&written>=cycleStart&&written<=date&&written>latest)latest=written;
      }
      return {day,exercises,latest,record:data.completions[completionId(uid,workout,week,day)]};
    });
    const available=item=>item.exercises.length&&!item.record;
    const underway=ordered.find(item=>available(item)&&item.latest===date);
    if(underway)return {status:'ready',workout,week,day:underway.day};
    const prior=ordered.map((item,index)=>{
      const lastCompletion=completions.filter(record=>String(record.dayId)===String(item.day.id)).reduce((last,record)=>record.completedDate>last?record.completedDate:last,'');
      return {index,date:lastCompletion>item.latest?lastCompletion:item.latest};
    }).sort((a,b)=>b.date.localeCompare(a.date)||b.index-a.index)[0];
    const pivot=prior?.date?prior.index+1:0;
    const next=[...ordered.slice(pivot),...ordered.slice(0,pivot)].find(available);
    const weekday=(new Date(date+'T12:00:00').getDay()+6)%7;
    const weekdays=workout.trainingRecommendations?.weekdays;
    const rest=Array.isArray(weekdays)&&weekdays.length&&!weekdays.includes(weekday);
    return next?{status:rest?'rest':'ready',workout,week,day:next.day}:{status:ordered.some(item=>item.exercises.length)?'cycle-complete':'empty',week};
  }
  function beginGuide(workout,day,uid,week,repeat=false){
    if(!studentCanComplete(uid)||readGuide(uid)||!workout||!day||(!repeat&&completionFor(workout,week,day,uid)))return false;
    if(validDate(workout.startDate)&&today()<workout.startDate){showToast('Este protocolo ainda não começou.',true);return false;}
    const exercises=exercisesForDay(workout,day.name),first=exercises[0];
    if(!first){showToast('Este dia ainda não tem exercícios prescritos.',true);return false;}
    const date=today(),priorSessions=repeat?exercises.flatMap(exercise=>(exercise.sessions||[])
      .filter(session=>session.date===date&&Number(session.week)===week&&session.id).map(session=>String(session.id))):[];
    return saveGuide(uid,null,{id:idFor('guide',uid,Date.now()),uid,workoutId:workout.id,dayId:String(day.id),cycle:cycleKey(workout),week,date,done:[],deferred:[],exerciseId:String(first.id),status:'active',repeat,priorSessions},completionId(uid,workout,week,day));
  }
  async function startGuidedFromHome(allowRest=false){
    const uid=ownerUid();
    await ensureProgress(uid);
    if(ownerUid()!==uid||activeScreenId()!=='screen-home')return false;
    if(readGuide(uid))return resumeGuided();
    const workout=homeWorkout();
    if(!workout||!studentCanComplete(uid)||!beginAction('begin-guided'))return false;
    try{
      await loadCycleData(workout,uid);
      if(ownerUid()!==uid||activeScreenId()!=='screen-home'||homeWorkout()?.id!==workout.id)return false;
      const plan=homeTraining(homeWorkout(),uid,today());
      if(plan.status!=='ready'&&!(allowRest&&plan.status==='rest')){refreshHomeSummary();return false;}
      return await beginGuide(plan.workout,plan.day,uid,plan.week);
    }finally{endAction('begin-guided');}
  }
  function workoutStartDecision(workout,day,uid,date){
    const week=currentWeek(workout,uid),repeat=!!completionFor(workout,week,day,uid);
    const progress=readLocal(uid);
    const completions=[...Object.values(progress.completions),progress.lastFinish].filter(record=>validDate(record?.completedDate)&&record.completedDate<=date);
    const recent=completions.sort((a,b)=>b.completedDate.localeCompare(a.completedDate)||(Number(b.completedAtMs)||0)-(Number(a.completedAtMs)||0))[0];
    const last=recent&&recent.workoutId===String(workout.id)&&recent.startDate===cycleStartDate(workout)&&recent.dayId===String(day.id);
    const planned=homeTraining(homeWorkout(),uid,date);
    const samePlan=planned.workout?.id===workout.id&&planned.day?.id===day.id;
    const recommendation=planned.status==='ready'&&!samePlan?` O treino recomendado agora é “${planned.day.name}”.`:'';
    let warning=null;
    if(last){
      warning=['Repetir o último treino?',`Este foi o último treino que você concluiu.${recommendation} Deseja repetir mesmo assim?`];
    }else if(repeat){
      warning=['Repetir um treino já concluído?',`Você já concluiu este treino nesta semana.${recommendation} Deseja repetir mesmo assim?`];
    }else if(planned.status==='rest'){
      warning=['Treinar no dia de descanso?', 'Hoje é um dia de descanso recomendado pelo treinador. Deseja iniciar este treino mesmo assim?'];
    }else if(planned.status==='today-complete'){
      warning=['Iniciar outro treino hoje?', 'O treino programado para hoje já foi concluído. Deseja iniciar outro treino mesmo assim?'];
    }else if(!samePlan){
      warning=['Treino fora da sequência recomendada',`Iniciar este treino pode alterar a sequência planejada pelo treinador.${recommendation} Deseja continuar mesmo assim?`];
    }
    return {week,repeat,warning};
  }
  async function startGuidedWorkout(){
    const uid=ownerUid(),workout=getW(CUR_WORKOUT),dayName=String(CUR_DAY||'');
    const authRevision=typeof AUTH_STATE_REVISION==='number'?AUTH_STATE_REVISION:null;
    const navigation=typeof NAVIGATION_SEQ==='number'?NAVIGATION_SEQ:null;
    const current=()=>ownerUid()===uid&&CUR_WORKOUT===workout?.id&&CUR_DAY===dayName&&activeScreenId()==='screen-day'&&
      (authRevision===null||authRevision===AUTH_STATE_REVISION)&&(navigation===null||navigation===NAVIGATION_SEQ);
    await ensureProgress(uid);
    if(!current())return false;
    const day=workoutDays(workout).find(item=>normalizedDay(item.name)===normalizedDay(dayName)),guide=readGuide(uid);
    if(guide)return sameDay(guide,workout,day)?resumeGuided():false;
    if(!day||!studentCanComplete(uid)||!beginAction('begin-guided'))return false;
    const context=()=>{
      const latest=getW(workout.id),latestDay=workoutDays(latest).find(item=>item.id===day.id);
      return current()&&latestDay&&cycleKey(latest)===cycleKey(workout)?{latest,latestDay}:null;
    };
    try{
      const active=homeWorkout();
      await Promise.all([loadCycleData(workout,uid),active&&active.id!==workout.id?loadCycleData(active,uid):null]);
      const selected=context();
      if(!selected||readGuide(uid))return false;
      const date=today(),decision=workoutStartDecision(selected.latest,selected.latestDay,uid,date);
      if(!decision.warning)return await beginGuide(selected.latest,selected.latestDay,uid,decision.week);
      showConfirm(...decision.warning,async()=>{
        const fresh=context();
        if(!fresh||!studentCanComplete(uid))return true;
        if(readGuide(uid)||today()!==date||JSON.stringify(workoutStartDecision(fresh.latest,fresh.latestDay,uid,date))!==JSON.stringify(decision)){
          showToast('A programação mudou. Toque em Iniciar treino para conferir novamente.',true);return true;
        }
        if(!beginAction('begin-guided'))return false;
        try{return await beginGuide(fresh.latest,fresh.latestDay,uid,decision.week,decision.repeat);}
        finally{endAction('begin-guided');}
      });
      return false;
    }finally{endAction('begin-guided');}
  }
  function resumeGuided(){
    const guide=readGuide();
    if(!canUseGuide(guide)||!guideContext(guide))return false;
    if(guide.status==='active'){refreshBattleScreens();return true;}
    return saveGuide(guide.uid,guide,{...guide,status:'active'});
  }
  function registerGuided(){
    const context=guideContext(),guide=context?.guide,exercise=context?.exercise;
    if(!exercise||guide.status!=='active'||!canUseGuide(guide))return false;
    const previous=[CUR_WORKOUT,CUR_DAY,CUR_EX,LAST_SESSION_WEEK];
    try{
      CUR_WORKOUT=context.workout.id;CUR_DAY=context.day.name;CUR_EX=exercise.id;LAST_SESSION_WEEK=guide.week;
      const opened=openLogSessionModal();
      if(opened===false)return false;
      const select=document.getElementById('input-session-week');
      if(select&&Number(select.value)!==guide.week){
        select.value=String(guide.week);SESSION_EDITOR_WEEK=guide.week;LAST_SESSION_WEEK=guide.week;
        populateSessionEditorForWeek(guide.week);
      }
      return true;
    }finally{[CUR_WORKOUT,CUR_DAY,CUR_EX,LAST_SESSION_WEEK]=previous;}
  }
  function finishExercise(){
    const context=guideContext(),guide=context?.guide,exercise=context?.exercise;
    if(!exercise||guide.status!=='active'||!canUseGuide(guide))return false;
    const date=today(),logged=(exercise.sessions||[]).some(session=>validDate(session.date)&&session.date>=guide.date&&session.date<=date&&Number(session.week)===guide.week&&session.sets?.length&&!guide.priorSessions?.includes(String(session.id)));
    if(!logged){showToast('Registre as séries realizadas antes de seguir para o próximo exercício.',true);registerGuided();return false;}
    const next=context.queue.find(item=>item!==exercise);
    return saveGuide(guide.uid,guide,{...guide,done:[...guide.done,String(exercise.id)],exerciseId:next?String(next.id):''});
  }
  function postponeExercise(){
    const context=guideContext(),guide=context?.guide,exercise=context?.exercise;
    if(!exercise||guide.status!=='active'||!canUseGuide(guide))return false;
    const next=context.queue.find(item=>item!==exercise);
    if(!next)return false;
    showConfirm('Aparelho ocupado','A ordem foi planejada pelo treinador. Mudar a sequência pode prejudicar a progressão. Se precisar, siga para o próximo exercício e volte a este depois.',()=>
      saveGuide(guide.uid,guide,{...guide,exerciseId:String(next.id),deferred:[...guide.deferred,String(exercise.id)]}));
    return true;
  }
  function pauseGuided(){
    const guide=readGuide();if(!canUseGuide(guide))return false;
    showConfirm('Pausar treino?','Seu progresso fica salvo neste aparelho. Ao voltar, você pode retomar do mesmo exercício.',()=>
      saveGuide(guide.uid,guide,{...guide,status:'paused'}));
    return true;
  }
  function cancelGuided(){
    const guide=readGuide();if(!canUseGuide(guide))return false;
    const message=guide.repeat
      ?'A posição desta repetição será descartada. As séries já registradas e a conclusão anterior continuam no histórico.'
      :'O início e a posição no treino serão descartados. As séries já registradas ficam no histórico e o dia permanece sem conclusão.';
    showConfirm('Cancelar o treino iniciado?',message,()=>saveGuide(guide.uid,guide,null));
    return true;
  }
  async function finishGuided(confirmPartial=false,expected=null){
    const context=guideContext(),guide=context?.guide;
    if(!canUseGuide(guide))return false;
    if(expected&&(guide.id!==expected.id||guide.revision!==expected.revision))return false;
    if(context.remaining.length&&!confirmPartial){
      const left=context.remaining.length;
      showConfirm('Encerrar treino com exercícios pendentes?',`Ainda faltam ${left} ${left===1?'exercício':'exercícios'}. Encerrar agora pode prejudicar sua evolução e o planejamento do treinador. Se aconteceu algum imprevisto e não dá para continuar, tudo bem encerrar. As séries registradas ficam salvas.`,()=>finishGuided(true,guide));
      return false;
    }
    return completeDay(context);
  }
  function showGuidedVideo(){
    const exercise=guideContext()?.exercise;if(!exercise||!canUseCatalogVideos())return false;
    return openCatalogVideo(resolveExerciseVideoUrl(exercise),exercise.name);
  }
  function showGuidedHistory(){
    const context=guideContext(),exercise=context?.exercise;
    if(!exercise)return false;
    document.getElementById('battle-history-title').textContent='Histórico · '+exercise.name;
    buildSessions(exercise,'battle-history-list',true,context.workout.id);
    openModal('modal-battle-history');return true;
  }
  function showFullDay(){
    const context=guideContext();if(!context)return false;
    if(activeScreenId()!=='screen-day'||CUR_WORKOUT!==context.workout.id||normalizedDay(CUR_DAY)!==normalizedDay(context.day.name)){openWorkout(context.workout.id);openDay(context.day.name);}
    document.querySelector('#screen-day .weekly-plan-shell')?.scrollIntoView({block:'start'});
    return true;
  }
  function guideButton(label,action,primary=false){
    return `<button class="${primary?'btn-primary':'btn-ghost'}" type="button" onclick="TeamBullsWorkoutCompletion.${action}">${label}</button>`;
  }
  function guidedPanel(guide){
    const context=guideContext(guide);
    if(!canUseGuide(guide))return '';
    if(!context)return `<p>O dia iniciado não está disponível neste protocolo.</p>${guideButton('Cancelar treino iniciado','cancelGuided()')}`;
    const {day,exercise,exercises,remaining,workout}=context;
    const progress=`${exercises.length-remaining.length} de ${exercises.length} exercícios concluídos`;
    const finished=!remaining.length;
    const video=exercise&&typeof canUseCatalogVideos==='function'&&canUseCatalogVideos()&&extractYouTubeId(resolveExerciseVideoUrl(exercise));
    const prescription=exercise&&typeof prescriptionCompactSummary==='function'?prescriptionCompactSummary(exercise,guide.week):null;
    const techniques=exercise&&typeof studentTechniqueLabels==='function'?studentTechniqueLabels(exercise,guide.week):'';
    const subtitle=`${escapeHtml(workout.name)} · ${escapeHtml(day.name)} · semana ${guide.week}`;
    return `<div class="student-guided-card"><div class="student-guided-state">${guide.status==='paused'?'Treino pausado':'Treino em andamento'}</div><p class="student-guided-context">${subtitle}</p><p class="student-guided-progress" role="status">${progress}</p>${
      guide.status==='paused'?guideButton('Retomar treino','resumeGuided()',true):finished?guideButton('Concluir treino','finishGuided()',true):`<h3 tabindex="-1">${escapeHtml(exercise.name)}</h3>${prescription?.rx?.sets?.length?`<p class="student-guided-context">${escapeHtml(prescription.reps)} · ${escapeHtml(prescription.ger)}</p>`:''}
        ${techniques}${exercise.instructions?`<p class="student-guided-instructions">${escapeHtml(exercise.instructions)}</p>`:''}
        <div class="student-guided-actions">${guideButton('Registrar séries','registerGuided()',true)}${guideButton(remaining.length===1?'Finalizar exercício':'Seguir','finishExercise()')}</div>
        <div class="student-guided-actions">${video?guideButton('Ver vídeo','showGuidedVideo()'):''}${guideButton('Ver histórico','showGuidedHistory()')}${remaining.length>1?guideButton('Aparelho ocupado','postponeExercise()'):''}</div>`}
      <div class="student-guided-actions">${guideButton('Ver treino todo','showFullDay()')}${guide.status==='active'&&!finished?guideButton('Pausar treino','pauseGuided()'):''}</div>
      <details class="student-guided-end"><summary>Opções do treino</summary><div class="student-guided-actions">${!finished?guideButton('Encerrar treino','finishGuided()'):''}${guideButton('Cancelar início','cancelGuided()')}</div></details></div>`;
  }
  const style=document.createElement('style');style.textContent=`
    .student-guided-card{border:1px solid var(--border-l);border-left:3px solid var(--accent);background:var(--surface);padding:12px;margin:12px 0}
    .student-guided-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
    .student-guided-actions button{flex:1 1 155px;margin:0;min-height:44px}
    #student-workout-completion .student-workout-start{display:grid;gap:8px;min-width:0;padding-top:12px;margin-top:12px;border-top:1px solid var(--border-l)}
    #student-workout-completion .student-workout-start>button{min-height:44px;margin:0}
    #student-workout-completion .student-workout-start>.student-guided-card{margin:0}
    #screen-day .weekly-plan-shell:has(#tb-student-day-week-sheet)~#exercise-list:not(:empty){display:none}
    .student-no-overview #student-overview-toggle,.student-no-overview #student-workout-overview,.student-no-overview [data-day-week-compare]{display:none!important}
    .muscle-choice-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:7px}
    .muscle-choice{display:flex;align-items:center;gap:5px;min-height:32px;padding:5px 7px;border:1px solid var(--border);border-radius:7px;background:var(--surface);font-size:10px;color:var(--text-dim)}
    .muscle-choice input{accent-color:var(--accent);margin:0}.day-guidance-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.protocol-summary-guidance{display:flex;flex-wrap:wrap;gap:5px 12px;margin-top:8px;color:var(--text-dim);font:500 10px/1.4 'DM Mono',monospace}
    .workout-completion-card{margin:12px 0;padding:13px;border:1px solid rgba(184,47,52,.32);border-radius:10px;background:linear-gradient(135deg,rgba(151,31,35,.12),rgba(255,255,255,.015))}.workout-completion-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.workout-completion-head>div{display:flex;flex-direction:column;gap:4px}.workout-completion-head>div>span{font:700 8px/1 'DM Mono',monospace;letter-spacing:1px;color:var(--text-muted)}.workout-completion-head strong{font:800 17px/1 'Barlow Condensed','Arial Narrow',sans-serif;color:var(--text)}.workout-completion-count{font:700 11px 'DM Mono',monospace;color:var(--text-dim)}.workout-completion-track{height:4px;margin:10px 0;background:var(--border);border-radius:5px;overflow:hidden}.workout-completion-track span{display:block;height:100%;background:var(--accent);transition:width .2s}.workout-completion-status{display:block;margin-top:7px;color:var(--text-muted);font:500 9px/1.4 'DM Mono',monospace}.workout-completion-status.pending{color:#d9ac62}.workout-completion-retry{margin-top:6px;border:0;background:transparent;color:var(--text-dim);font:700 9px 'DM Mono',monospace;text-decoration:underline}
    .calendar-legend{display:flex;justify-content:center;gap:18px;margin:10px 0;color:var(--text-muted);font:600 9px 'DM Mono',monospace}.calendar-legend span{display:flex;align-items:center;gap:6px}.calendar-legend-dot{width:7px;height:7px;border-radius:50%;background:#b73035}.calendar-legend-dot.food{background:#68b997}.cal-event-dots{display:flex;gap:3px;justify-content:center;margin-top:3px}.cal-event-dots i{width:5px;height:5px;border-radius:50%;background:#b73035}.cal-event-dots i.food{background:#68b997}.cal-event-dots i.completion{background:#d7a34e}.cal-day-entry.food-event{border-color:rgba(104,185,151,.5)}.cal-day-entry.completion-event{border-color:rgba(215,163,78,.5)}
    .home-daily-summary{margin:0 18px 14px;padding:13px;border:1px solid var(--border);border-radius:10px;background:var(--surface)}.home-daily-summary-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.home-daily-summary-head strong{font:800 16px 'Barlow Condensed','Arial Narrow',sans-serif;text-transform:uppercase}.home-daily-summary-head span{font:600 8px 'DM Mono',monospace;color:var(--text-muted)}.home-daily-summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.home-daily-summary-item{padding:9px;border-radius:7px;background:var(--card)}.home-daily-summary-item strong{display:block;font:800 18px 'Barlow Condensed','Arial Narrow',sans-serif}.home-daily-summary-item span{font:600 8px/1.3 'DM Mono',monospace;color:var(--text-muted);text-transform:uppercase}.home-daily-summary-foot{margin-top:8px;font:500 8px 'DM Mono',monospace;color:var(--text-muted)}
    @media(max-width:430px){.muscle-choice-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.day-guidance-grid{grid-template-columns:1fr}}
  `;document.head.appendChild(style);

  const originalRenderDay=typeof renderDay==='function'?renderDay:null;
  if(originalRenderDay)renderDay=function(){const result=originalRenderDay.apply(this,arguments);renderStudentDay();return result;};
  const originalRenderTsDay=typeof renderTsDay==='function'?renderTsDay:null;
  if(originalRenderTsDay)renderTsDay=function(){const result=originalRenderTsDay.apply(this,arguments);document.getElementById('student-workout-completion')?.replaceChildren();return result;};

  function monthKey(year,month){return String(year)+'-'+String(month+1).padStart(2,'0');}
  function monthBounds(year,month){const start=monthKey(year,month)+'-01',last=new Date(year,month+1,0).getDate();return{start,end:monthKey(year,month)+'-'+String(last).padStart(2,'0'),prefix:monthKey(year,month)};}
  function calendarWorkouts(){try{if(currentUser()?.role==='trainer')return VIEW_STUDENT?.workouts||[];return getWorkouts()||[];}catch(error){return[];}}
  function calendarTrainingEvents(year,month){
    const {prefix}=monthBounds(year,month),days={};
    for(const workout of calendarWorkouts())for(const exercise of(workout.exercises||[]))for(const session of(exercise.sessions||[])){
      const date=String(session.date||'');if(!date.startsWith(prefix))continue;
      (days[date]||(days[date]=[])).push({kind:'training',workoutId:workout.id,exerciseId:exercise.id,sessionId:session.id,dayName:exercise.dayName||'Treino geral',exerciseName:exercise.name,workoutName:workout.name,workoutColor:workout.color,sets:Array.isArray(session.sets)?session.sets:[]});
    }
    return days;
  }
  function localCalendarFoodEvents(uid,year,month){
    const {prefix}=monthBounds(year,month),events={},meals=[];
    if(mode()==='local'||CURRENT_USER?.uid===uid){
      const diet=LOCAL_DB?.mealPlan;
      meals.push(...(diet?.meals||[]),...(diet?.plans||[]).flatMap(plan=>plan.variants?.length?plan.variants.flatMap(variant=>variant.meals||[]):plan.meals||[]));
    }
    for(const meal of meals)for(const date of(Array.isArray(meal.doneDates)?meal.doneDates:[]))if(String(date).startsWith(prefix))pushUniqueEvent(events,date,{kind:'food',label:'Refeição concluída',detail:String(meal.name||'Refeição')});
    try{for(const log of(LOCAL_DB?.freeMealLogs||[])){const date=String(log.date||'');if((!log.userId||log.userId===uid)&&date.startsWith(prefix))(events[date]||(events[date]=[])).push({kind:'food',label:'Refeição livre',detail:String(log.mealName||'Refeição livre')});}}catch(error){}
    for(const record of Object.values(readLocal(uid).completions)){const date=String(record.completedDate||'');if(date.startsWith(prefix))(events[date]||(events[date]=[])).push({kind:'completion',label:'Treino concluído',detail:`${String(record.dayName||'Dia de treino')} · semana ${Number(record.week)||1}`});}
    return events;
  }
  function pushUniqueEvent(events,date,event){const list=events[date]||(events[date]=[]),key=[event.kind,event.label,event.detail,event.sessionId].join('|');if(!list.some(item=>[item.kind,item.label,item.detail,item.sessionId].join('|')===key))list.push(event);}
  function mealNameMap(documentData){
    const names=new Map(),add=meal=>{if(meal&&meal.id)names.set(String(meal.id),String(meal.name||meal.label||'Refeição'));};
    (documentData?.meals||[]).forEach(add);for(const plan of(documentData?.plans||[])){(plan.meals||[]).forEach(add);for(const variant of(plan.variants||[]))(variant.meals||[]).forEach(add);}
    return names;
  }
  async function queryMonth(collection,ownerField,uid,start,end,label,dateField='date'){
    try{return(await cloudGet(db.collection(collection).where(ownerField,'==',uid).where(dateField,'>=',start).where(dateField,'<=',end),label)).docs||[];}
    catch(rangeError){try{return(await cloudGet(db.collection(collection).where(ownerField,'==',uid),label)).docs||[];}catch(error){console.warn(label+' indisponível',error);return[];}}
  }
  async function loadCalendarMonth(){
    if(typeof CAL_YEAR==='undefined'||typeof CAL_MONTH==='undefined')return;
    const seq=++calendarLoadSeq,year=CAL_YEAR,month=CAL_MONTH,uid=calendarUid(),key=uid+'|'+monthKey(year,month),{start,end,prefix}=monthBounds(year,month);
    if(!uid){if(currentUser()?.role==='trainer')showToast('Abra o arquivo de um aluno para ver o calendário.',true);return;}
    if(monthCache.has(key)){renderCalendar();return;}
    await ensureProgress(uid);
    if(seq!==calendarLoadSeq||calendarUid()!==uid)return;
    const events=localCalendarFoodEvents(uid,year,month);
    if(mode()!=='cloud'||!currentUser()?.uid){
      const plan=await loadDietDocument().catch(()=>null);
      if(seq!==calendarLoadSeq||uid!==calendarUid())return;
      addDietCalendarEvents(events,plan,start,end);
      monthCache.set(key,events);renderCalendar();return;
    }
    try{
      const [mealDocs,freeDocs,completionDocs,workoutDocs,mealPlan]=await Promise.all([
        queryMonth('mealCompletions','studentUid',uid,start,end,'refeições do calendário'),
        queryMonth('freeMealLogs','userId',uid,start,end,'refeições livres do calendário'),
        queryMonth('workoutCompletions','studentUid',uid,start,end,'treinos concluídos do calendário','completedDate'),
        queryMonth('sessions','userId',uid,start,end,'sessões do calendário'),
        cloudGet(db.collection('mealPlans').doc(uid),'plano alimentar do calendário').catch(()=>null)
      ]);
      if(seq!==calendarLoadSeq||uid!==calendarUid()||year!==CAL_YEAR||month!==CAL_MONTH)return;
      const dietDocument=mealPlan?.exists?normalizeDietDocument(mealPlan.data()):null;
      addDietCalendarEvents(events,dietDocument,start,end);
      const mealNames=mealNameMap(dietDocument);
      for(const doc of mealDocs){const item=doc.data(),date=String(item.date||'');if(!date.startsWith(prefix)||item.recordType==='food_choice')continue;pushUniqueEvent(events,date,{kind:'food',label:'Refeição concluída',detail:mealNames.get(String(item.mealId||''))||'Refeição'});}
      for(const doc of freeDocs){const item=doc.data(),date=String(item.date||'');if(!date.startsWith(prefix))continue;pushUniqueEvent(events,date,{kind:'food',label:'Refeição livre',detail:String(item.mealName||'Refeição livre')});}
      for(const doc of completionDocs){const item=doc.data(),date=String(item.completedDate||'');if(!date.startsWith(prefix))continue;pushUniqueEvent(events,date,{kind:'completion',label:'Treino concluído',detail:`${String(item.dayName||'Dia de treino')} · semana ${Number(item.week)||1}`});}
      for(const doc of workoutDocs){const item=doc.data(),date=String(item.date||'');if(!date.startsWith(prefix))continue;const workout=calendarWorkouts().find(value=>String(value.id)===String(item.workoutId));const exercise=workout?.exercises?.find(value=>String(value.id)===String(item.exerciseId));if(!exercise)continue;const sameDate=calendarTrainingEvents(year,month)[date]||[];if(!sameDate.some(entry=>entry.sessionId===doc.id))pushUniqueEvent(events,date,{kind:'training',workoutId:workout.id,exerciseId:exercise.id,sessionId:doc.id,dayName:item.dayName||exercise.dayName||'Treino geral',exerciseName:item.exerciseName||exercise.name,workoutName:workout.name,workoutColor:workout.color,sets:Array.isArray(item.sets)?item.sets:[]});}
      monthCache.set(key,events);renderCalendar();
    }catch(error){if(seq===calendarLoadSeq){monthCache.set(key,events);renderCalendar();}}
  }
  function getCalendarMonthDataWithFood(year,month){
    const data=calendarTrainingEvents(year,month),events=monthCache.get(calendarUid()+'|'+monthKey(year,month))||{};
    for(const [date,items] of Object.entries(events))data[date]=[...(data[date]||[]),...items];return data;
  }
  function renderCalendarMarkers(){
    const data=getCalendarMonthDataWithFood(CAL_YEAR,CAL_MONTH),grid=document.getElementById('cal-grid');if(!grid)return;
    const cells=[...grid.querySelectorAll('.cal-cell:not(.empty)')];cells.forEach(cell=>{
      const day=Number(cell.querySelector('.cal-daynum')?.textContent),date=String(CAL_YEAR)+'-'+String(CAL_MONTH+1).padStart(2,'0')+'-'+String(day).padStart(2,'0'),events=data[date]||[];cell.dataset.calendarDate=date;cell.classList.toggle('trained',events.some(item=>item.kind==='training'||item.kind==='completion'));cell.classList.toggle('has-food',events.some(item=>item.kind==='food'));
      cell.querySelector('.cal-dot')?.remove();let dots=cell.querySelector('.cal-event-dots');if(!dots){dots=document.createElement('span');dots.className='cal-event-dots';cell.appendChild(dots);}const types=[];if(events.some(item=>item.kind==='training'))types.push('training');if(events.some(item=>item.kind==='completion'))types.push('completion');if(events.some(item=>item.kind==='food'))types.push('food');dots.innerHTML=types.map(type=>`<i class="${type==='food'?'food':type==='completion'?'completion':''}" aria-label="${type==='food'?'Alimentação':type==='completion'?'Treino concluído':'Treino'}"></i>`).join('');
      cell.onclick=events.length?()=>openCalDay(date):null;
    });
    const dates=Object.entries(data),training=dates.filter(([,items])=>items.some(item=>item.kind==='training'||item.kind==='completion')).length,food=dates.filter(([,items])=>items.some(item=>item.kind==='food')).length,summary=document.getElementById('cal-summary');
    if(summary)summary.textContent=training||food?[`${training} ${training===1?'dia com treino':'dias com treino'}`,`${food} ${food===1?'dia com alimentação':'dias com alimentação'}`].filter((_,index)=>index===0?training>0:food>0).join(' · '):'Nenhum registro de treino ou alimentação neste mês';
  }
  const baseRenderCalendar=typeof renderCalendar==='function'?renderCalendar:null;
  if(baseRenderCalendar)renderCalendar=function(){const result=baseRenderCalendar.apply(this,arguments);renderCalendarMarkers();return result;};
  getCalendarMonthData=function(year,month){return getCalendarMonthDataWithFood(year,month);};
  openCalDay=function(date){
    const entries=(getCalendarMonthData(CAL_YEAR,CAL_MONTH)[date]||[]),body=document.getElementById('cal-day-modal-body');document.getElementById('cal-day-modal-title').textContent=fmt(date);
    body.innerHTML=entries.map(entry=>{
      if(entry.kind==='food')return`<div class="cal-day-entry food-event"><div class="cal-day-entry-top"><span class="cal-day-entry-ex">🍽 ${escapeHtml(entry.label||'Alimentação')}</span></div><div class="cal-day-entry-meta">${escapeHtml(entry.detail||'Registro de alimentação')}</div></div>`;
      if(entry.kind==='completion')return`<div class="cal-day-entry completion-event"><div class="cal-day-entry-top"><span class="cal-day-entry-ex">✓ ${escapeHtml(entry.label||'Treino concluído')}</span></div><div class="cal-day-entry-meta">${escapeHtml(entry.detail||'Confirmação do aluno')}</div></div>`;
      const volume=(entry.sets||[]).reduce((sum,set)=>sum+(Number(set.weight)||0)*(Number(set.reps)||0),0),setCount=(entry.sets||[]).length;
      return`<button class="cal-day-entry cal-day-entry-link" style="--wcard-color:${escapeHtml(entry.workoutColor||'var(--accent)')}" onclick="openExerciseFromCalendar(${jsArg(entry.workoutId)},${jsArg(entry.exerciseId)},${jsArg(entry.dayName)},${jsArg(date)})"><div class="cal-day-entry-top"><span class="cal-day-entry-ex">${escapeHtml(entry.exerciseName)}</span><span class="cal-day-entry-w">${escapeHtml(entry.workoutName)}</span></div><div class="cal-day-entry-meta">${setCount} séries · Vol: ${volume.toLocaleString('pt-BR')} kg · abrir exercício ›</div></button>`;
    }).join('');openModal('modal-cal-day');
  };
  const baseOpenExerciseFromCalendar=typeof openExerciseFromCalendar==='function'?openExerciseFromCalendar:null;
  openExerciseFromCalendar=function(workoutId,exerciseId,dayName,date){
    if(currentUser()?.role!=='trainer'){if(baseOpenExerciseFromCalendar)return baseOpenExerciseFromCalendar.apply(this,arguments);return;}
    const workout=calendarWorkouts().find(item=>String(item.id)===String(workoutId)),exercise=workout?.exercises?.find(item=>String(item.id)===String(exerciseId));
    if(!workout||!exercise||typeof openTsExercise!=='function')return;
    closeModal('modal-cal-day');trainerCalendarExerciseReturn={year:CAL_YEAR,month:CAL_MONTH,date};
    VIEW_STUDENT_WORKOUT=workout;VIEW_STUDENT_DAY=String(dayName||exercise.dayName||'');VIEW_STUDENT_EXERCISE=exercise;
    openTsExercise(exercise.id);
  };
  const baseGoTsDay=typeof goTsDay==='function'?goTsDay:null;
  if(baseGoTsDay)goTsDay=function(){
    if(trainerCalendarExerciseReturn){const location=trainerCalendarExerciseReturn;trainerCalendarExerciseReturn=null;CAL_YEAR=location.year;CAL_MONTH=location.month;renderCalendar();showScreen('screen-calendar');return;}
    return baseGoTsDay.apply(this,arguments);
  };
  const baseOpenCalendar=typeof openCalendar==='function'?openCalendar:null;
  openCalendar=function(){
    const user=currentUser();if(user?.role==='trainer'&&!trainerTargetUid()){showToast('Abra o arquivo de um aluno para ver o calendário.',true);return;}
    calendarReturn=user?.role==='trainer'?'trainer-student':'home';const target=calendarUid();monthCache.delete(target+'|'+monthKey(new Date().getFullYear(),new Date().getMonth()));
    if(baseOpenCalendar)baseOpenCalendar.apply(this,arguments);loadCalendarMonth();
    const title=document.querySelector('#screen-calendar .header-title');if(title&&user?.role==='trainer')title.textContent='CALENDÁRIO · '+String(VIEW_STUDENT?.name||'ALUNO');
  };
  const baseShiftMonth=typeof calShiftMonth==='function'?calShiftMonth:null;
  if(baseShiftMonth)calShiftMonth=function(delta){const result=baseShiftMonth.apply(this,arguments);monthCache.delete(calendarUid()+'|'+monthKey(CAL_YEAR,CAL_MONTH));loadCalendarMonth();return result;};
  window.goBackFromCalendar=function(){if(calendarReturn==='trainer-student'&&trainerTargetUid()){goTrainerStudent();return;}if(currentUser()?.role==='trainer'){goTrainer();return;}goHome();};

  function dietForDate(dietDocument,date){
    const plans=dietDocument?.plans||[],plan=plans.find(item=>item?.isActive===true)||plans[0];
    if(!plan||plan.startDate&&date<plan.startDate)return null;
    if(!plan.variants?.length)return {name:plan.name,meals:plan.meals||[]};
    return dietVariantForDate(plan,date);
  }
  function addDietCalendarEvents(events,dietDocument,start,end){
    for(let date=start;date<=end;date=addDaysIso(date,1)){
      const diet=dietForDate(dietDocument,date);
      if(diet?.meals?.length)pushUniqueEvent(events,date,{kind:'food',label:'Dieta programada',detail:diet.name});
    }
  }
  function refreshHomeSummary(){
    const screen=document.getElementById('screen-home'),host=document.getElementById('home-daily-summary');
    const student=currentUser()?.role==='student',uid=ownerUid();
    if(!host||!screen)return;
    screen.classList.toggle('student-battle-home',student);
    host.hidden=!uid||!student&&mode()!=='local';
    if(host.hidden||activeScreenId()!=='screen-home')return;
    if(!snapshots.has(uid)){
      renderBattleContent(host,'<div class="home-daily-summary-head"><strong>Batalha do dia</strong></div><p role="status">Carregando progresso do treino…</p>');
      void ensureProgress(uid).then(()=>{if(ownerUid()===uid)refreshHomeSummary();});
      return;
    }
    const guide=readGuide(uid),workout=homeWorkout(),date=today();
    const plan=guide?null:homeTraining(workout,uid,date);
    const available=plan&&(plan.status==='ready'||plan.status==='rest');
    const messages={
      empty:'Nenhum dia de treino disponível.',
      future:'Seu protocolo de treino ainda não começou.',
      'today-complete':'Treino de hoje concluído.',
      'cycle-complete':'Ciclo do protocolo concluído.'
    };
    const details=available?`${escapeHtml(plan.day.name)} · semana ${plan.week}`:messages[plan?.status];
    const start=available&&studentCanComplete(uid)
      ?guideButton(plan.status==='rest'?'Iniciar mesmo assim':'Iniciar treino',`startGuidedFromHome(${plan.status==='rest'})`,true):'';
    const content=`<div class="home-daily-summary-head"><strong>Batalha do dia</strong><span>${escapeHtml(fmt(date))}</span></div>
      ${guide?guidedPanel(guide):`<div class="home-daily-summary-foot">${plan.status==='rest'?'Descanso recomendado · próximo treino: ':''}${details||''}</div>${start}`}
      <button class="btn-ghost student-battle-calendar" type="button" onclick="openCalendar()">Calendário de treino e dieta</button>`;
    renderBattleContent(host,content);
    if(workout&&mode()==='cloud'){
      const key=uid+'|'+cycleKey(workout);
      if(!cycleLoads.has(key)&&Date.now()-(cycleLoadedAt.get(key)||0)>=60000)void loadCycleData(workout,uid).then(()=>{
        if(ownerUid()===uid&&activeScreenId()==='screen-home')refreshHomeSummary();
      });
    }
  }
  const battleContent=new WeakMap();
  function renderBattleContent(host,content){
    if(battleContent.get(host)===content)return;
    host.innerHTML=content;battleContent.set(host,content);
  }
  function markDayFolders(){
    const workout=getW(CUR_WORKOUT),guide=readGuide();
    const day=workoutDays(workout).find(day=>sameDay(guide,workout,day));
    document.querySelectorAll('#day-folder-list [data-reorder-day]').forEach(card=>{
      const selected=day?.name===card.dataset.reorderDay;
      if(selected)card.dataset.battleState=guide.status;
      else delete card.dataset.battleState;
      card.querySelector('.student-guided-day-label')?.remove();
      if(selected){
        const status=document.createElement('span');status.className='student-guided-day-label';
        status.textContent=guide.status==='paused'?'Treino pausado':'Treino em andamento';
        card.querySelector('.day-folder-info')?.append(status);
      }
    });
  }
  function renderLibraryGuide(){
    const target=document.getElementById('tb-student-workout-list');if(!target)return;
    let host=document.getElementById('student-battle-library');
    if(!host){host=document.createElement('div');host.id='student-battle-library';host.className='student-guided-card';target.before(host);}
    const context=guideContext();
    host.hidden=!context;
    renderBattleContent(host,context?`<p class="student-guided-state">${context.guide.status==='paused'?'Treino pausado':'Treino em andamento'} · ${escapeHtml(context.day.name)}</p>${guideButton('Abrir treino iniciado','showFullDay()')}`:'');
  }
  function refreshBattleScreens(){
    switch(activeScreenId()){
      case 'screen-home':refreshHomeSummary();break;
      case 'screen-day':{
        const workout=getW(CUR_WORKOUT),day=workoutDays(workout).find(item=>normalizedDay(item.name)===normalizedDay(CUR_DAY));
        if(day)setCompletionPanel(workout,day,ownerUid());
        break;
      }
      case 'screen-workout':markDayFolders();break;
      case 'screen-workout-library':renderLibraryGuide();break;
    }
  }
  window.addEventListener('team-bulls-meal-completion-changed',()=>{
    monthCache.clear();
    if(activeScreenId()==='screen-calendar')void loadCalendarMonth();
  });
  const baseRenderHome=typeof renderHome==='function'?renderHome:null;
  if(baseRenderHome)renderHome=function(){const result=baseRenderHome.apply(this,arguments);refreshHomeSummary();return result;};
  const baseShowScreen=typeof showScreen==='function'?showScreen:null;
  if(baseShowScreen)showScreen=function(id){const result=baseShowScreen.apply(this,arguments);if(result!==false){
    document.body.classList.toggle('student-no-overview',currentUser()?.role==='student');
    if(id==='screen-workout'){markDayFolders();if(!snapshots.has(ownerUid()))refreshFromStorage(ownerUid());}
    if(id==='screen-workout-library'){renderLibraryGuide();if(!snapshots.has(ownerUid()))refreshFromStorage(ownerUid());}
    if(id==='screen-auth'){
      const home=document.getElementById('home-daily-summary');
      if(home){home.replaceChildren();battleContent.delete(home);}
      document.getElementById('battle-history-list')?.replaceChildren();
    }
  }if(result!==false&&id==='screen-home')setTimeout(refreshHomeSummary,0);if(result!==false&&id==='screen-day')setTimeout(()=>{if(activeScreenId()==='screen-day')renderStudentDay();},0);return result;};
  window.addEventListener('online',()=>{const uid=ownerUid(),year=Number.isInteger(CAL_YEAR)?CAL_YEAR:new Date().getFullYear(),month=Number.isInteger(CAL_MONTH)?CAL_MONTH:new Date().getMonth();for(const key of cycleLoadedAt.keys())if(key.startsWith(uid+'|'))cycleLoadedAt.delete(key);monthCache.delete(calendarUid()+'|'+monthKey(year,month));syncPending(uid).then(()=>{if(activeScreenId()==='screen-day')renderStudentDay();refreshHomeSummary();if(activeScreenId()==='screen-calendar')loadCalendarMonth();});});
  window.addEventListener('team-bulls-runtime-ready',()=>syncPending(ownerUid()).catch(()=>{}));

  window.addEventListener('storage',event=>{
    const uid=ownerUid();
    if(uid&&event.key===fallbackKey(uid))refreshFromStorage(uid);
  });
  function refreshFromStorage(uid){
    if(!uid||ownerUid()!==uid)return;
    void ensureProgress(uid).then(()=>{
      if(ownerUid()!==uid)return;
      monthCache.clear();
      refreshBattleScreens();
      if(activeScreenId()==='screen-calendar')void loadCalendarMonth();
    });
  }
  if(progressChannel)progressChannel.onmessage=event=>refreshFromStorage(event.data);
  window.addEventListener('pageshow',()=>refreshFromStorage(ownerUid()));
  window.TeamBullsWorkoutCompletion=Object.freeze({
    currentWeek,renderStudentDay,retrySync,syncPending,diagnostics,
    startGuidedWorkout,startGuidedFromHome,resumeGuided,pauseGuided,cancelGuided,finishGuided,
    registerGuided,finishExercise,postponeExercise,showGuidedVideo,showGuidedHistory,showFullDay,dayState
  });
  if(document.getElementById('screen-day')?.classList.contains('active'))renderStudentDay();
  if(document.getElementById('screen-home')?.classList.contains('active'))refreshHomeSummary();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){refreshHomeSummary();if(activeScreenId()==='screen-calendar')loadCalendarMonth();}});
})();
