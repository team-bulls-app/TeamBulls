import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const perfSource=fs.readFileSync('modules/session-save-performance-v10_10_9.js','utf8');
const integritySource=fs.readFileSync('modules/session-integrity-v10_10_39.js','utf8');
const mutationSource=fs.readFileSync('modules/pending-session-mutations-v10_10_34.js','utf8');
const core=fs.readFileSync('app_v10_10_9_core.js','utf8');
const queueKey='team_bulls_pending_sessions_v1_student-a';
const clone=value=>JSON.parse(JSON.stringify(value));
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
const permission=()=>Object.assign(new Error('Missing or insufficient permissions'),{code:'permission-denied'});

// Run the production modules, with storage surviving a completely new JS VM.
// The fake server enforces owner-constrained queries and immutable createdAt.
export function app(options={}){
  const local=options.local||new Map(),indexed=options.indexed||new Map(),remote=options.remote||new Map();
  const tab=new Map(),listeners=new Map(),timers=[],frames=[],alerts=[],toasts=[],calls=[];
  let counter=0,tree=[{id:'workout-a',userId:'student-a',exercises:[{id:'exercise-a',name:'Supino reto',sessions:[]}]}];
  const values=new Map([
    ['input-session-date','2026-10-06'],['input-session-week','2'],['input-session-note','banco 3'],
    ['edit-session-date','2026-10-06'],['edit-session-week','2'],['edit-session-note','editado']
  ]);
  const modal={open:false},editModal={open:false},button={disabled:false};
  const rows=[{dataset:{targetMin:'8',targetMax:'12',ger:'2'},querySelector:selector=>({value:selector.includes('"w"')?'82.5':'10'})}];
  const editRows=[{dataset:{},querySelector:selector=>({value:selector.includes('"w"')?'95':'8'})}];
  const addListener=(name,fn)=>{const items=listeners.get(name)||[];items.push(fn);listeners.set(name,items);};
  const emit=name=>{for(const fn of listeners.get(name)||[])fn({persisted:true});};
  const indexDb={transaction(_store,mode){
    const tx={error:null,aborted:false,abort(){this.aborted=true;this.onabort?.();},objectStore(){return{
      get:key=>request(key),put:(value,key)=>request(key,value)
    };}};
    function request(key,value){
      const req={result:undefined};
      const complete=()=>{
        if(tx.aborted)return;
        if(options.failIndexedWrite&&mode==='readwrite'){tx.error=new Error('quota');tx.onerror?.();return;}
        if(mode==='readwrite')indexed.set(key,clone(value));
        else req.result=indexed.has(key)?clone(indexed.get(key)):undefined;
        req.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.());
      };
      queueMicrotask(()=>{
        if(mode==='readwrite'&&options.indexedGate)options.indexedGate.promise.then(complete);
        else complete();
      });
      return req;
    }
    return tx;
  }};
  const context={
    Promise,Date,Map,Set,JSON,Number,String,Math,Array,Object,
    console:{log(){},warn(){},error(){}},
    setTimeout:(fn,delay)=>{const timer={fn,delay};timers.push(timer);return timer;},clearTimeout:timer=>{if(timer)timer.cancelled=true;},
    requestAnimationFrame:fn=>frames.push(fn),
    MODE:options.mode||'cloud',CURRENT_USER:{uid:'student-a',role:'student',...(options.offlineRegistered?{offlineRegistered:true}:{})},
    navigator:{onLine:options.online!==false},
    CUR_WORKOUT:'workout-a',CUR_EX:'exercise-a',SESSION_WID:'workout-a',SESSION_EID:'exercise-a',SESSION_CREATE_ID:'',LAST_SESSION_WEEK:2,
    EDIT_SESSION_ID:'',EDIT_SESSION_WID:'workout-a',EDIT_SESSION_EID:'exercise-a',
    storageGet:key=>local.get(key)??null,
    storageSet:(key,value)=>{if(options.failLocal)return false;local.set(key,value);return true;},
    sessionStorage:{getItem:key=>tab.get(key)??null,setItem:(key,value)=>{tab.set(key,value);}},
    openMediaDb:async()=>options.noIndexed?null:indexDb,
    withTimeout:task=>Promise.resolve(task),
    cloudWrite:task=>{
      if(options.writeTimeout)return Promise.reject(Object.assign(new Error('timeout'),{code:'team-bulls/timeout'}));
      return Promise.resolve(task);
    },
    firebase:{firestore:{Timestamp:{fromMillis:ms=>({ms})},FieldPath:{documentId:()=> '__name__'}}},
    draftId:()=>`draft-${++counter}`,
    selectedVariantData:()=>({variantId:'',variantName:'',performedExerciseItemId:'',performedExerciseName:'Supino reto'}),
    selectedPerformedTechniqueMode:()=>'',selectedEditPerformedTechniqueMode:()=>'',normalizePrescriptionSet:()=>null,
    getE:(wid,eid)=>tree.find(w=>w.id===wid)?.exercises.find(e=>e.id===eid),
    getW:wid=>tree.find(w=>w.id===wid),getWorkouts:()=>tree,
    findSessionOwner:id=>{
      for(const workout of tree)for(const exercise of workout.exercises){const session=exercise.sessions.find(s=>s.id===id);if(session)return{workout,exercise,session};}
      return null;
    },
    syncSessionToHistory:()=>{},saveSessionArchive:()=>true,saveCloudBackup:()=>{},renderExercise:()=>{},
    runWhenIdle:()=>{},resetRestTimer:()=>{},showToast:message=>toasts.push(message),alert:message=>alerts.push(message),
    closeModal:id=>{if(id==='modal-session')modal.open=false;else editModal.open=false;},
    beginAction:()=>{if(button.disabled)return false;button.disabled=true;return true;},endAction:()=>{button.disabled=false;},
    document:{
      visibilityState:'visible',addEventListener:addListener,
      getElementById:id=>{
        if(id==='modal-session'||id==='modal-edit-session')return{classList:{contains:()=>id==='modal-session'?modal.open:editModal.open}};
        if(!values.has(id))return null;
        return{get value(){return values.get(id);},set value(value){values.set(id,value);}};
      },
      querySelectorAll:selector=>selector.startsWith('#edit-sets-editor')?editRows:rows
    },
    openLogSessionModal:()=>{modal.open=true;context.SESSION_CREATE_ID=context.draftId();},
    saveSession:async()=>{throw new Error('Registered students must use the durable queue.');},
    saveEditSession:async()=>{throw new Error('Pending edits must use the durable queue.');},
    performDeleteSession:async()=>false,renderExercisePrescription:()=>{},
    addEventListener:addListener,TeamBulls107:{flushPendingMutationSync:async()=>{}},TeamBullsWeekSelectionFix:{},
  };
  context.window=context;
  context.db={collection:name=>{
    assert.equal(name,'sessions');
    const query={filters:[],where(field,_op,value){this.filters.push([field,value]);return this;},limit(value){assert.equal(value,1);return this;},async get(source){
      assert.equal(source.source,'server','reconciliation must bypass stale local cache');
      const user=this.filters.find(([field])=>field==='userId')?.[1],id=this.filters.find(([field])=>field==='__name__')?.[1];
      if(user!==context.CURRENT_USER.uid||!id)throw permission();
      calls.push(['query',id]);
      if(options.queryGate)await options.queryGate.promise;
      const value=remote.get(id);
      return{docs:value&&value.userId===user?[{exists:true,id,data:()=>clone(value)}]:[]};
    },doc(id){return{
      get:async()=>{calls.push(['get',id]);if(!remote.has(id))throw permission();return{exists:true,data:()=>clone(remote.get(id))};},
      async set(value){
        calls.push(['set',id]);
        assert.equal(value.userId,context.CURRENT_USER.uid);
        const previous=remote.get(id);
        if(previous&&(['userId','workoutId','exerciseId'].some(field=>previous[field]!==value[field])||previous.createdAt?.ms!==value.createdAt?.ms))throw permission();
        if(value.sets.length>60)throw permission();
        if(options.writeGate)await options.writeGate.promise;
        remote.set(id,clone(value));
      },
      async update(value){
        calls.push(['update',id]);assert.ok(remote.has(id));assert.equal(remote.get(id).userId,context.CURRENT_USER.uid);
        assert.equal('createdAt' in value,false,'updates must preserve immutable creation time');
        if(options.writeGate)await options.writeGate.promise;
        remote.set(id,{...remote.get(id),...clone(value)});
      },
      async delete(){calls.push(['delete',id]);remote.delete(id);}
    };}};
    return query;
  }};
  context.db=options.db||context.db;
  context.firebase=options.firebase||context.firebase;
  vm.createContext(context);
  vm.runInContext(perfSource,context);
  vm.runInContext(integritySource,context);
  vm.runInContext(mutationSource,context);
  return{context,api:context.TeamBullsSessionPerformance,local,indexed,remote,modal,editModal,button,rows,alerts,toasts,calls,values,timers,
    get tree(){return tree;},set tree(value){tree=value;},emit,
    async ready(){await context.TeamBullsSessionPerformance.ready('student-a');await settle();},
    frames(){while(frames.length)frames.shift()();},
    async save(){context.openLogSessionModal();const id=context.SESSION_CREATE_ID;const result=await context.saveSession();return{id,result};}
  };
}

const tests=[];
async function check(name,test){await test();tests.push(name);}

await check('quota cheia usa IndexedDB e sobrevive ao fechamento completo',async()=>{
  const a=app({online:false,failLocal:true});await a.ready();
  const {id,result}=await a.save();assert.equal(result,true);assert.equal(a.modal.open,false);a.frames();
  assert.equal(a.tree[0].exercises[0].sessions[0].sets[0].weight,82.5);
  const b=app({online:false,failLocal:true,local:a.local,indexed:a.indexed});await b.ready();b.api.restore();
  assert.equal(b.api.hasPending(id),true);assert.equal(b.tree[0].exercises[0].sessions[0].sets[0].reps,10);
  assert.equal(b.tree[0].exercises[0].sessions[0].pendingSync,true);
});

await check('sessionStorage sozinho não confirma sucesso nem limpa o formulário',async()=>{
  const a=app({online:false,failLocal:true,failIndexedWrite:true});await a.ready();
  const {id,result}=await a.save();assert.equal(result,false);assert.equal(a.modal.open,true);
  assert.equal(a.api.hasPending(id),false);assert.equal(a.toasts.some(message=>message.startsWith('✓')),false);
  assert.ok(a.alerts.length);assert.equal(a.button.disabled,false);
});

await check('documento novo sincroniza sem get negado pelas Rules 28',async()=>{
  const a=app();await a.ready();const {id}=await a.save();a.frames();await a.api.flush();
  assert.equal(a.calls.some(([type])=>type==='get'),false);
  assert.equal(a.remote.get(id).sets[0].weight,82.5);assert.equal(a.api.pending(),0);
  assert.equal(a.tree[0].exercises[0].sessions[0].pendingSync,false);
});

await check('fila legada atualiza documento existente preservando createdAt',async()=>{
  const entry={id:'legacy',userId:'student-a',workoutId:'workout-a',exerciseId:'exercise-a',exerciseName:'Supino reto',date:'2026-10-06',week:2,note:'',sets:[{weight:70,reps:9}]};
  const local=new Map([[queueKey,JSON.stringify([entry])]]),remote=new Map([['legacy',{...entry,createdAt:{ms:123}}]]);
  const a=app({local,remote});await a.ready();await a.api.flush();
  assert.equal(a.remote.get('legacy').createdAt.ms,123);assert.equal(a.calls.filter(([type])=>type==='update').length,1);assert.equal(a.api.pending(),0);
});

await check('falha em um documento não bloqueia as próximas séries',async()=>{
  const entry={id:'conflict',userId:'student-a',workoutId:'workout-a',exerciseId:'exercise-a',exerciseName:'Supino reto',date:'2026-10-06',week:2,sets:[{weight:70,reps:9}]};
  const local=new Map([[queueKey,JSON.stringify([entry])]]),remote=new Map([['conflict',{...entry,exerciseId:'another-exercise',createdAt:{ms:1}}]]);
  const a=app({local,remote});await a.ready();const {id}=await a.save();await a.api.flush();
  assert.ok(a.remote.has(id));assert.equal(a.api.hasPending('conflict'),true);assert.equal(a.api.pending(),1);
  assert.equal(a.remote.get('conflict').exerciseId,'another-exercise');
});

await check('hidratação remota conserva a revisão local pendente',async()=>{
  const a=app({online:false});await a.ready();const {id}=await a.save();a.frames();
  const extract=(name,next)=>core.slice(core.indexOf(`function ${name}(`),core.indexOf(next,core.indexOf(`function ${name}(`)));
  a.context.sanitizeHistorySession=value=>value;a.context.sessionIdentity=value=>value.id;a.context.createdMillis=()=>0;a.context.normalizedName=value=>String(value||'').toLowerCase();
  vm.runInContext(extract('mergeHistorySessions','function sessionsFromWorkoutTree('),a.context);
  vm.runInContext(extract('pendingSessionHistory','async function fetchCloudSessions('),a.context);
  vm.runInContext(extract('attachSessionsWithoutLosingOrphans','function createdMillis('),a.context);
  vm.runInContext(extract('hydrateWorkoutSessions','async function fetchCloudData('),a.context);
  a.tree=[{id:'workout-a',userId:'student-a',exercises:[{id:'exercise-a',name:'Supino reto',sessions:[]}]}];
  a.context.hydrateWorkoutSessions(a.tree,[{id,exerciseId:'exercise-a',date:'2026-10-06',sets:[{weight:1,reps:1}]}]);
  const saved=a.tree[0].exercises[0].sessions[0];assert.equal(saved.sets[0].weight,82.5);assert.equal(saved.pendingSync,true);assert.equal(a.tree[0].exercises[0].sessions.length,1);
});

await check('timeout não duplica write em voo e confirmação tardia finaliza a fila',async()=>{
  const gate=deferred(),opts={writeGate:gate,writeTimeout:true};const a=app(opts);await a.ready();const {id}=await a.save();a.frames();
  await a.api.flush();await settle();await a.api.flush();
  assert.equal(a.calls.filter(([type])=>type==='set').length,1);assert.equal(a.api.hasPending(id),true);
  gate.resolve();await settle();assert.equal(a.api.hasPending(id),false);assert.ok(a.remote.has(id));
});

await check('edição durante write preserva a revisão nova e o timestamp original',async()=>{
  const gate=deferred(),opts={writeGate:gate};const a=app(opts);await a.ready();const {id}=await a.save();a.frames();
  const flushing=a.api.flush();await settle();
  await a.api.updatePending(id,{sets:[{weight:99,reps:7}]});gate.resolve();await flushing;
  assert.equal(a.api.hasPending(id),true);const timestamp=a.remote.get(id).createdAt.ms;
  opts.writeGate=null;await a.api.flush();assert.equal(a.api.pending(),0);assert.equal(a.remote.get(id).sets[0].weight,99);assert.equal(a.remote.get(id).createdAt.ms,timestamp);
});

await check('cancelamento antes do envio não ressuscita o registro',async()=>{
  const a=app({online:false});await a.ready();const {id}=await a.save();a.frames();
  await a.api.discardPending(id);a.context.navigator.onLine=true;await a.api.flush();
  assert.equal(a.remote.has(id),false);assert.equal(a.api.pending(),0);
});

await check('duplo toque e reinstalação dos guards mantêm um ID por abertura',async()=>{
  const a=app({online:false});await a.ready();a.context.openLogSessionModal();
  const results=await Promise.all([a.context.saveSession(),a.context.saveSession()]);assert.ok(results.includes(true));assert.equal(a.api.pending(),1);
  for(const timer of [...a.timers])if([900,2600,7000].includes(timer.delay)&&!timer.cancelled)timer.fn();
  a.emit('team-bulls-runtime-state');await settle();const {result}=await a.save();assert.equal(result,true);assert.equal(a.api.pending(),2);assert.equal(a.modal.open,false);
});

await check('troca de conta durante persistência não projeta dados no outro aluno',async()=>{
  const gate=deferred(),a=app({online:false,failLocal:true,indexedGate:gate});await a.ready();
  a.context.openLogSessionModal();const id=a.context.SESSION_CREATE_ID,save=a.context.saveSession();await settle();
  a.context.CURRENT_USER={uid:'student-b',role:'student'};gate.resolve();await save;a.frames();
  assert.equal(a.tree[0].exercises[0].sessions.length,0);assert.equal(a.api.sessions('student-a').length,0);
  assert.equal(a.api.hasPending(id,'student-b'),false);assert.equal(a.api.hasPending(id,'student-a'),true);
});

await check('aluno registrado offline usa a mesma fila ao reconectar',async()=>{
  const a=app({mode:'local',offlineRegistered:true,online:false});await a.ready();const {id,result}=await a.save();a.frames();assert.equal(result,true);
  a.context.MODE='cloud';a.context.navigator.onLine=true;await a.api.flush();assert.ok(a.remote.has(id));assert.equal(a.api.pending(),0);
});

await check('falha durável de edição mantém dados e formulário anteriores',async()=>{
  const opts={online:false,failLocal:true},a=app(opts);await a.ready();const {id}=await a.save();a.frames();
  opts.failIndexedWrite=true;a.context.EDIT_SESSION_ID=id;a.editModal.open=true;await a.context.saveEditSession();
  assert.equal(a.api.getPending(id).sets[0].weight,82.5);assert.equal(a.tree[0].exercises[0].sessions[0].sets[0].weight,82.5);
  assert.equal(a.editModal.open,true);assert.equal(a.button.disabled,false);assert.ok(a.alerts.length);
});

await check('snapshot novo vazio vence espelhos antigos e não ressuscita sessões',async()=>{
  const a=app({online:false,failLocal:true});await a.ready();const {id}=await a.save();await a.api.discardPending(id);
  // A previous browser process can retain an old durable/local snapshot.
  a.local.set(queueKey,JSON.stringify([{id,userId:'student-a',workoutId:'workout-a',exerciseId:'exercise-a',sets:[{weight:1,reps:1}]}]));
  const b=app({online:false,local:a.local,indexed:a.indexed});await b.ready();assert.equal(b.api.pending(),0);
});

await check('confirmação remota anterior ao frame não volta a marcar a sessão pendente',async()=>{
  const a=app();await a.ready();const {id}=await a.save();await a.api.flush();a.frames();
  assert.equal(a.api.hasPending(id),false);assert.equal(a.tree[0].exercises[0].sessions[0].pendingSync,false);
});

await check('frame atrasado não projeta séries depois de uma troca de aluno',async()=>{
  const a=app({online:false});await a.ready();await a.save();a.context.CURRENT_USER={uid:'student-b',role:'student'};a.frames();
  assert.equal(a.tree[0].exercises[0].sessions.length,0);
});

await check('reabertura por uma camada antiga não bloqueia a submissão seguinte',async()=>{
  const a=app({online:false});await a.ready();await a.save();
  a.context.openLogSessionModal.__tbBase();const secondId=a.context.SESSION_CREATE_ID;
  assert.equal(await a.context.saveSession(),true);assert.equal(a.api.hasPending(secondId),true);assert.equal(a.api.pending(),2);
});

await check('mais de 60 séries falha antes do servidor e conserva o editor',async()=>{
  const a=app({online:false});await a.ready();const row=a.rows[0];a.rows.push(...Array(60).fill(row));
  const {result}=await a.save();assert.equal(result,false);assert.equal(a.modal.open,true);assert.equal(a.api.pending(),0);assert.ok(a.alerts.length);
});

console.log(`APROVADO — ${tests.length} cenários executaram a lógica real de persistência, reabertura, sincronização, edição e isolamento de registros.`);
