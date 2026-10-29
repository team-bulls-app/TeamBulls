/* Team Bulls v10.10.70 — conclusão explícita do treino, resumo diário e calendário integrado. */
'use strict';
(()=>{
  if(window.__TB_STUDENT_TRAINING_CALENDAR_101070__)return;
  window.__TB_STUDENT_TRAINING_CALENDAR_101070__=true;

  const LOCAL_PREFIX='team_bulls_workout_cycle_v1_';
  const cycleLoads=new Map();
  const cycleLoadedAt=new Map();
  const monthCache=new Map();
  let calendarReturn='home',calendarLoadSeq=0,homeLoadSeq=0,trainerCalendarExerciseReturn=null;
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
  const readLocal=uid=>{try{const raw=localStorage.getItem(storageKey(uid));const value=raw?JSON.parse(raw):{};return{states:value.states&&typeof value.states==='object'?value.states:{},completions:value.completions&&typeof value.completions==='object'?value.completions:{}};}catch(error){return{states:{},completions:{}};}};
  const writeLocal=(uid,data)=>{try{localStorage.setItem(storageKey(uid),JSON.stringify(data));return true;}catch(error){console.warn('Falha ao gravar estado local do ciclo',error);return false;}};
  function workoutDays(workout){try{return typeof getWorkoutDays==='function'?getWorkoutDays(workout):[];}catch(error){return[];}}
  function legacyInitialWeek(workout){
    try{if(validDate(workout?.startDate)&&typeof v104CycleWeek==='function'&&typeof today==='function')return Math.max(1,Math.min(8,Number(v104CycleWeek(workout.startDate,today()))||1));}catch(error){}
    const weeks=(workout?.exercises||[]).flatMap(exercise=>(exercise.sessions||[]).map(session=>Number(session.week)||0)).filter(week=>week>=1&&week<=8);
    return weeks.length?Math.max(...weeks):1;
  }
  function stateFor(workout,uid=ownerUid(),create=false){
    if(!uid||!workout?.id)return null;
    const data=readLocal(uid),key=cycleKey(workout);let state=data.states[key];
    if(!state&&create){
      state={docId:idFor('wcs',uid,workout.id,cycleStartDate(workout)),studentUid:uid,workoutId:String(workout.id),startDate:cycleStartDate(workout),initialWeek:legacyInitialWeek(workout),pendingSync:shouldSync(uid),syncError:''};
      data.states[key]=state;writeLocal(uid,data);
    }
    return state||null;
  }
  function completionId(uid,workout,week,day){return idFor('wcomp',uid,workout.id,cycleStartDate(workout),week,day.id);}
  function completionFor(workout,week,day,uid=ownerUid()){
    if(!uid)return null;const data=readLocal(uid);return data.completions[completionId(uid,workout,week,day)]||null;
  }
  function currentWeek(workout,uid=ownerUid()){
    if(!workout)return 1;const state=stateFor(workout,uid,false),initial=Math.max(1,Math.min(8,Number(state?.initialWeek)||legacyInitialWeek(workout))),days=workoutDays(workout);
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
  async function syncPending(uid){
    if(mode()!=='cloud'||!shouldSync(uid)||navigator.onLine===false)return false;
    const data=readLocal(uid);let changed=false,ok=true;
    for(const [key,state] of Object.entries(data.states)){
      if(!state?.pendingSync)continue;
      try{
        const ref=db.collection('workoutCycleStates').doc(state.docId),existing=await cloudGet(ref,'estado do ciclo');
        if(existing.exists){const saved=existing.data();if(saved.studentUid!==uid||saved.workoutId!==state.workoutId||saved.startDate!==state.startDate)throw new Error('O estado do ciclo não corresponde a este aluno.');state.initialWeek=Math.max(1,Math.min(8,Number(saved.initialWeek)||state.initialWeek));}
        else await cloudWrite(ref.set({studentUid:uid,workoutId:state.workoutId,startDate:state.startDate,initialWeek:state.initialWeek,createdAt:firebase.firestore.FieldValue.serverTimestamp()}),'salvar início do ciclo');
        state.pendingSync=false;state.syncError='';changed=true;
      }catch(error){state.syncError=String(error?.message||error).slice(0,180);ok=false;changed=true;}
    }
    for(const [id,record] of Object.entries(data.completions)){
      if(!record?.pendingSync)continue;
      try{
        const ref=db.collection('workoutCompletions').doc(id),existing=await cloudGet(ref,'confirmação do treino');
        if(existing.exists){const saved=existing.data();if(saved.studentUid!==uid||saved.workoutId!==record.workoutId||saved.startDate!==record.startDate||Number(saved.week)!==Number(record.week)||saved.dayId!==record.dayId)throw new Error('A confirmação existente não corresponde a este treino.');}
        else await cloudWrite(ref.set({studentUid:uid,workoutId:record.workoutId,startDate:record.startDate,week:record.week,dayId:record.dayId,dayName:record.dayName,completedDate:record.completedDate,createdAt:firebase.firestore.FieldValue.serverTimestamp()}),'salvar conclusão do treino');
        record.pendingSync=false;record.syncError='';changed=true;
      }catch(error){record.syncError=String(error?.message||error).slice(0,180);ok=false;changed=true;}
    }
    if(changed)writeLocal(uid,data);
    return ok;
  }
  async function loadCycleData(workout,uid=ownerUid()){
    if(!uid||!workout?.id)return false;
    const key=uid+'|'+cycleKey(workout);if(cycleLoads.has(key))return cycleLoads.get(key);if(Date.now()-(cycleLoadedAt.get(key)||0)<60000)return true;
    const promise=(async()=>{
      const state=stateFor(workout,uid,true);
      if(mode()!=='cloud'||currentUser()?.uid!==uid||!['student','trainer'].includes(currentUser()?.role)){cycleLoadedAt.set(key,Date.now());return true;}
      try{
        const [states,completions]=await Promise.all([
          queryStudentRecords('workoutCycleStates',uid,workout.id),
          queryStudentRecords('workoutCompletions',uid,workout.id)
        ]);
        const local=readLocal(uid),cloudState=states.find(item=>String(item.startDate||'')===cycleStartDate(workout));
        if(cloudState){local.states[cycleKey(workout)]={docId:cloudState.id,studentUid:uid,workoutId:String(workout.id),startDate:cycleStartDate(workout),initialWeek:Math.max(1,Math.min(8,Number(cloudState.initialWeek)||1)),pendingSync:false,syncError:''};}
        for(const saved of completions){
          if(String(saved.startDate||'')!==cycleStartDate(workout)||!validDate(saved.completedDate))continue;
          const day=workoutDays(workout).find(item=>String(item.id)===String(saved.dayId));if(!day)continue;
          const id=saved.id||completionId(uid,workout,saved.week,day);
          local.completions[id]={studentUid:uid,workoutId:String(workout.id),startDate:cycleStartDate(workout),week:Number(saved.week),dayId:String(saved.dayId),dayName:String(saved.dayName||day.name),completedDate:String(saved.completedDate),pendingSync:false,syncError:''};
        }
        writeLocal(uid,local);
        if(!cloudState){const seeded=stateFor(workout,uid,true);if(seeded&&mode()==='cloud'){seeded.pendingSync=true;writeLocal(uid,readLocal(uid));}}
        if(currentUser()?.role==='student'&&currentUser()?.uid===uid)await syncPending(uid);
        cycleLoadedAt.set(key,Date.now());
        return true;
      }catch(error){
        console.warn('Falha ao carregar o progresso do ciclo',error);
        const cachedState=stateFor(workout,uid,false);
        if(cachedState){cachedState.pendingSync=shouldSync(uid);cachedState.syncError=String(error?.code||'Falha ao carregar o progresso. Tente novamente.').slice(0,120);const cached=readLocal(uid);cached.states[cycleKey(workout)]=cachedState;writeLocal(uid,cached);}
        cycleLoadedAt.set(key,Date.now());return false;
      }
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
    const state=stateFor(workout,uid,false),week=currentWeek(workout,uid),record=completionFor(workout,week,day,uid),days=workoutDays(workout),done=days.filter(item=>completionFor(workout,week,item,uid)).length;
    const canWrite=studentCanComplete(uid),allDone=isWeekComplete(workout,week,uid),cycleDone=week===8&&allDone;
    const status=record?.pendingSync?(record.syncError?'Salvo neste aparelho · falha na sincronização':'Salvo neste aparelho · aguardando sincronização'):record?'Conclusão registrada'+(mode()==='cloud'?' e sincronizada':' neste aparelho'):state?.syncError?'Não foi possível carregar/sincronizar o progresso.':state?.pendingSync?'Progresso salvo neste aparelho · aguardando sincronização':'';
    const needsRetry=!!(record?.pendingSync||state?.pendingSync);
    host.innerHTML=`<div class="workout-completion-head"><div><span>PROGRESSO DO CICLO</span><strong>${cycleDone?'Ciclo de 8 semanas concluído':`Semana ${week} de 8`}</strong></div><span class="workout-completion-count">${done}/${days.length} dias</span></div><div class="workout-completion-track"><span style="width:${days.length?Math.round(done/days.length*100):0}%"></span></div>${status?`<div class="workout-completion-status ${needsRetry?'pending':''}" role="status">${escapeHtml(status)}</div>`:''}${!canWrite?`<div class="workout-completion-status">Somente leitura</div>`:record?`<button class="workout-completion-button completed" type="button" disabled>✓ DIA CONCLUÍDO</button>`:cycleDone?`<div class="workout-completion-status">Todas as pastas do ciclo foram confirmadas.</div>`:`<button class="workout-completion-button" type="button" onclick="TeamBullsWorkoutCompletion.completeCurrentDay()">CONCLUIR TREINO</button><small>Confirme ao terminar este dia. A semana só avança quando todos os dias do plano forem concluídos.</small>`}${canWrite&&needsRetry?`<button class="workout-completion-retry" type="button" onclick="TeamBullsWorkoutCompletion.retrySync()">TENTAR SINCRONIZAR</button>`:''}`;
  }
  function renderStudentDay(){
    const host=document.getElementById('student-workout-completion');if(!host)return;
    let workout=null,dayName='',uid=ownerUid();try{if(typeof CUR_WORKOUT!=='undefined')workout=getW(CUR_WORKOUT);dayName=String(CUR_DAY||'');}catch(error){}
    const day=workoutDays(workout).find(item=>String(item.name)===dayName||normalizedDay(item.name)===normalizedDay(dayName));
    if(!workout||!day){host.innerHTML='';return;}
    const before=currentWeek(workout,uid);try{LAST_SESSION_WEEK=before;}catch(error){}
    setCompletionPanel(workout,day,uid);
    loadCycleData(workout,uid).then(()=>{
      if(document.getElementById('student-workout-completion')!==host)return;
      const after=currentWeek(workout,uid);try{LAST_SESSION_WEEK=after;}catch(error){}
      setCompletionPanel(workout,day,uid);
      if(after!==before&&document.getElementById('screen-day')?.classList.contains('active'))setTimeout(()=>{if(typeof renderDay==='function')renderDay();},0);
    });
  }
  function normalizedDay(value){try{return normalizedName(value);}catch(error){return String(value||'').trim().toLowerCase();}}
  async function completeCurrentDay(){
    let workout=null,dayName='';try{workout=getW(CUR_WORKOUT);dayName=String(CUR_DAY||'');}catch(error){}
    const uid=ownerUid(),days=workoutDays(workout),day=days.find(item=>normalizedDay(item.name)===normalizedDay(dayName));
    if(!workout||!day||!studentCanComplete(uid)){showToast('Esta confirmação exige uma conta ativa ou um plano local editável.',true);return false;}
    const host=document.getElementById('student-workout-completion');if(host)host.querySelector('button')?.setAttribute('disabled','disabled');
    await loadCycleData(workout,uid);const data=readLocal(uid),week=currentWeek(workout,uid),id=completionId(uid,workout,week,day);
    if(!data.completions[id])data.completions[id]={studentUid:uid,workoutId:String(workout.id),startDate:cycleStartDate(workout),week,dayId:String(day.id),dayName:String(day.name),completedDate:typeof today==='function'?today():new Date().toISOString().slice(0,10),pendingSync:shouldSync(uid),syncError:''};
    if(!writeLocal(uid,data)){showToast('Não foi possível gravar a conclusão neste aparelho.',true);renderStudentDay();return false;}
    if(mode()==='cloud')await syncPending(uid);
    renderStudentDay();
    try{renderHome();}catch(error){}
    showToast('✓ Treino concluído');return true;
  }
  function retrySync(){const uid=ownerUid();return syncPending(uid).then(()=>{for(const key of cycleLoadedAt.keys())if(key.startsWith(uid+'|'))cycleLoadedAt.delete(key);renderStudentDay();loadCalendarMonth();});}
  function diagnostics(){const data=readLocal(ownerUid()),items=[...Object.values(data.states),...Object.values(data.completions)],pending=items.filter(item=>item?.pendingSync),failed=pending.filter(item=>!!item.syncError);return{pending:pending.length,failed:failed.length};}

  const style=document.createElement('style');style.textContent=`
    .muscle-choice-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:7px}
    .muscle-choice{display:flex;align-items:center;gap:5px;min-height:32px;padding:5px 7px;border:1px solid var(--border);border-radius:7px;background:var(--surface);font-size:10px;color:var(--text-dim)}
    .muscle-choice input{accent-color:var(--accent);margin:0}.day-guidance-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.protocol-summary-guidance{display:flex;flex-wrap:wrap;gap:5px 12px;margin-top:8px;color:var(--text-dim);font:500 10px/1.4 'DM Mono',monospace}
    .workout-completion-card{margin:12px 0;padding:13px;border:1px solid rgba(184,47,52,.32);border-radius:10px;background:linear-gradient(135deg,rgba(151,31,35,.12),rgba(255,255,255,.015))}.workout-completion-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.workout-completion-head>div{display:flex;flex-direction:column;gap:4px}.workout-completion-head>div>span{font:700 8px/1 'DM Mono',monospace;letter-spacing:1px;color:var(--text-muted)}.workout-completion-head strong{font:800 17px/1 'Barlow Condensed','Arial Narrow',sans-serif;color:var(--text)}.workout-completion-count{font:700 11px 'DM Mono',monospace;color:var(--text-dim)}.workout-completion-track{height:4px;margin:10px 0;background:var(--border);border-radius:5px;overflow:hidden}.workout-completion-track span{display:block;height:100%;background:var(--accent);transition:width .2s}.workout-completion-button{width:100%;min-height:40px;border:0;border-radius:7px;background:var(--accent);color:#fff;font:800 11px 'DM Mono',monospace;letter-spacing:.65px}.workout-completion-button.completed{background:#286543}.workout-completion-button:disabled{opacity:.8}.workout-completion-card small,.workout-completion-status{display:block;margin-top:7px;color:var(--text-muted);font:500 9px/1.4 'DM Mono',monospace}.workout-completion-status.pending{color:#d9ac62}.workout-completion-retry{margin-top:6px;border:0;background:transparent;color:var(--text-dim);font:700 9px 'DM Mono',monospace;text-decoration:underline}
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
    const {prefix}=monthBounds(year,month),events={},meals=[];try{if(mode()==='local')meals=LOCAL_DB?.mealPlan?.meals||[];else if(CURRENT_USER?.uid===uid)meals=LOCAL_DB?.mealPlan?.meals||[];}catch(error){}
    for(const meal of meals)for(const date of(Array.isArray(meal.doneDates)?meal.doneDates:[]))if(String(date).startsWith(prefix))(events[date]||(events[date]=[])).push({kind:'food',label:'Refeição concluída',detail:String(meal.name||'Refeição')});
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
    const events=localCalendarFoodEvents(uid,year,month);
    if(mode()!=='cloud'||!currentUser()?.uid){monthCache.set(key,events);renderCalendar();return;}
    try{
      const [mealDocs,freeDocs,completionDocs,workoutDocs,mealPlan]=await Promise.all([
        queryMonth('mealCompletions','studentUid',uid,start,end,'refeições do calendário'),
        queryMonth('freeMealLogs','userId',uid,start,end,'refeições livres do calendário'),
        queryMonth('workoutCompletions','studentUid',uid,start,end,'treinos concluídos do calendário','completedDate'),
        queryMonth('sessions','userId',uid,start,end,'sessões do calendário'),
        cloudGet(db.collection('mealPlans').doc(uid),'plano alimentar do calendário').catch(()=>null)
      ]);
      if(seq!==calendarLoadSeq||uid!==calendarUid()||year!==CAL_YEAR||month!==CAL_MONTH)return;
      const mealNames=mealNameMap(mealPlan?.exists?mealPlan.data():{});
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

  function renderHomeSummaryShell(){
    const stats=document.getElementById('home-stats');if(!stats)return null;let host=document.getElementById('home-daily-summary');
    if(!host){host=document.createElement('section');host.id='home-daily-summary';host.className='home-daily-summary';host.setAttribute('aria-live','polite');stats.insertAdjacentElement('afterend',host);}
    return host;
  }
  function mealsScheduledForDate(dietDocument,date){
    const plans=Array.isArray(dietDocument?.plans)?dietDocument.plans:[];
    const plan=plans.find(item=>item?.isActive===true)||plans[0];if(!plan)return[];
    const variants=Array.isArray(plan.variants)?plan.variants:[];if(!variants.length)return Array.isArray(plan.meals)?plan.meals:[];
    const match=String(date||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const weekday=match?new Date(Number(match[1]),Number(match[2])-1,Number(match[3])).getDay():new Date().getDay();
    const scheduled=variants.find(variant=>[...(variant.weekdays||[]),...(variant.restWeekdays||[])].includes(weekday));
    if(scheduled)return Array.isArray(scheduled.meals)?scheduled.meals:[];
    const hasFixedDays=variants.some(variant=>(variant.weekdays||[]).length||(variant.restWeekdays||[]).length);
    if(hasFixedDays)return[];
    return Array.isArray(variants[0]?.meals)?variants[0].meals:[];
  }
  async function refreshHomeSummary(){
    if(currentUser()?.role==='trainer'||document.getElementById('screen-home')?.classList.contains('active')===false)return;
    const host=renderHomeSummaryShell();if(!host)return;const seq=++homeLoadSeq,uid=ownerUid(),date=typeof today==='function'?today():new Date().toISOString().slice(0,10),workouts=(()=>{try{return getWorkouts()||[];}catch(error){return[];}})();
    const sessions=workouts.reduce((sum,workout)=>sum+(workout.exercises||[]).reduce((sub,exercise)=>sub+(exercise.sessions||[]).filter(session=>String(session.date||'')===date).length,0),0);
    const active=workouts.find(workout=>workout.isActive===true)||workouts[0],week=active?currentWeek(active,uid):0,days=active?workoutDays(active):[],done=active?days.filter(day=>completionFor(active,week,day,uid)).length:0;
    host.innerHTML=`<div class="home-daily-summary-head"><strong>Resumo de hoje</strong><span>${escapeHtml(typeof fmt==='function'?fmt(date):date)}</span></div><div class="home-daily-summary-grid"><div class="home-daily-summary-item"><strong>${sessions}</strong><span>Sessões registradas</span></div><div class="home-daily-summary-item"><strong>—</strong><span>Refeições concluídas</span></div></div>${active?`<div class="home-daily-summary-foot">${escapeHtml(active.name)} · semana ${week}/8 · ${done}/${days.length} dias confirmados</div>`:'<div class="home-daily-summary-foot">Nenhum protocolo de treino cadastrado.</div>'}`;
    let meals=[],completed=new Set(),loadError=false;
    try{
      if(mode()==='local'){
        const dietDocument=await loadDietDocument();meals=mealsScheduledForDate(dietDocument,date);
        for(const meal of meals)if((meal.doneDates||[]).includes(date))completed.add(String(meal.id));
      }else if(currentUser()?.role==='student'&&currentUser()?.uid===uid){
        const [dietDocument,marked]=await Promise.all([loadDietDocument(uid),fetchCompletionsToday(uid)]);
        meals=mealsScheduledForDate(dietDocument,date);completed=new Set([...marked].map(String));
      }
    }catch(error){loadError=true;meals=mealsScheduledForDate(LOCAL_DB?.mealPlan,date);}
    if(seq!==homeLoadSeq||ownerUid()!==uid)return;
    const count=host.querySelector('.home-daily-summary-item:nth-child(2) strong'),label=host.querySelector('.home-daily-summary-item:nth-child(2) span');
    const completedCount=meals.reduce((sum,meal)=>sum+(completed.has(String(meal.id))?1:0),0);
    if(count)count.textContent=`${completedCount}/${meals.length}`;
    if(label)label.textContent='Refeições concluídas';
    const foot=host.querySelector('.home-daily-summary-foot');if(foot&&loadError)foot.textContent+=' · dados alimentares locais';
  }
  const baseRenderHome=typeof renderHome==='function'?renderHome:null;
  if(baseRenderHome)renderHome=function(){const result=baseRenderHome.apply(this,arguments);refreshHomeSummary();return result;};
  const baseShowScreen=typeof showScreen==='function'?showScreen:null;
  if(baseShowScreen)showScreen=function(id){const result=baseShowScreen.apply(this,arguments);if(id==='screen-home')setTimeout(refreshHomeSummary,0);if(id==='screen-day')setTimeout(renderStudentDay,0);return result;};
  window.addEventListener('online',()=>{const uid=ownerUid(),year=Number.isInteger(CAL_YEAR)?CAL_YEAR:new Date().getFullYear(),month=Number.isInteger(CAL_MONTH)?CAL_MONTH:new Date().getMonth();for(const key of cycleLoadedAt.keys())if(key.startsWith(uid+'|'))cycleLoadedAt.delete(key);monthCache.delete(calendarUid()+'|'+monthKey(year,month));syncPending(uid).then(()=>{renderStudentDay();refreshHomeSummary();loadCalendarMonth();});});
  window.addEventListener('team-bulls-runtime-ready',()=>syncPending(ownerUid()).catch(()=>{}));

  window.TeamBullsWorkoutCompletion=Object.freeze({currentWeek,completeCurrentDay,renderStudentDay,retrySync,syncPending,diagnostics});
  if(document.getElementById('screen-day')?.classList.contains('active'))renderStudentDay();
  if(document.getElementById('screen-home')?.classList.contains('active'))refreshHomeSummary();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){refreshHomeSummary();loadCalendarMonth();}});
})();
