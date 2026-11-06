import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
const baselineIndex=process.argv.indexOf('--baseline'),baseline=process.argv[baselineIndex+1];assert(baselineIndex<0||/^[a-f0-9]{7,40}$/.test(baseline));
const read=file=>baselineIndex<0?fs.readFileSync(file,'utf8'):execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8'});

const perfSource=read('modules/session-save-performance-v10_10_9.js');
const integritySource=read('modules/session-integrity-v10_10_39.js');
const mutationSource=read('modules/pending-session-mutations-v10_10_34.js');
const core=read('app_v10_10_9_core.js');
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
    let outstanding=0;
    const tx={error:null,aborted:false,abort(){this.aborted=true;this.onabort?.();},objectStore(){return{
      get:key=>request(key),put:(value,key)=>request(key,value)
    };}};
    function request(key,value){
      const writing=arguments.length>1,req={result:undefined};outstanding++;
      const complete=()=>{
        if(tx.aborted)return;
        if(options.failIndexedWrite&&writing){tx.error=new Error('quota');tx.onerror?.();return;}
        if(writing)indexed.set(key,clone(value));
        else req.result=indexed.has(key)?clone(indexed.get(key)):undefined;
        req.onsuccess?.();outstanding--;queueMicrotask(()=>{if(!outstanding)tx.oncomplete?.();});
      };
      queueMicrotask(()=>{
        if(writing&&options.indexedGate)options.indexedGate.promise.then(complete);
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
    CUR_WORKOUT:'workout-a',CUR_EX:'exercise-a',SESSION_WID:'workout-a',SESSION_EID:'exercise-a',SESSION_CREATE_ID:'',LAST_SESSION_WEEK:2,LOCAL_OWNER_UID:'student-a',INACTIVE_UID:'',NAVIGATION_SEQ:1,
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
    syncSessionToHistory:()=>{},saveSessionArchive:()=>true,saveCloudBackup:()=>{},renderExercise:()=>{},removeSessionFromHistory:()=>{},removeSessionFromArchive:()=>{},firestoreWriteMessage:e=>e.message,
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
      async delete(){calls.push(['delete',id]);if(!context.navigator.onLine)throw Object.assign(new Error('offline'),{code:'unavailable'});if(options.deleteGate)await options.deleteGate.promise;if(options.deleteFailure)throw options.deleteFailure;if(!remote.has(id)||remote.get(id).userId!==context.CURRENT_USER.uid)throw permission();remote.delete(id);options.afterDelete?.();}
    };}};
    return query;
  }};
  context.db=options.db||context.db;
  context.firebase=options.firebase||context.firebase;
  vm.createContext(context);
  const coreFunction=name=>{const start=core.indexOf(`function ${name}(`);if(start<0)return '';const line=core.slice(start).split('\n')[0].trimEnd(),prefix=core.slice(start-6,start)==='async '?'async ':'';return prefix+(line.endsWith('}')?line:core.slice(start,core.indexOf('\n}',start)+2));};
  vm.runInContext(['filterDeletedSessions','performDeleteSession','deleteSession','deleteEditedSession'].map(coreFunction).join('\n'),context);
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

function seedSaved(a,id='saved',extra={}){
  const session={id,userId:'student-a',workoutId:'workout-a',exerciseId:'exercise-a',exerciseName:'Supino reto',date:'2026-10-06',week:2,note:'preservar',sets:[{weight:80,reps:8}],createdAt:{ms:123},...extra};
  a.tree[0].exercises[0].sessions.push(clone(session));a.remote.set(id,clone(session));return session;
}
await check('exclusão offline de sessão confirmada sobrevive ao fechamento e preserva outros registros',async()=>{
  const a=app({online:false});await a.ready();const deleted=seedSaved(a),kept=seedSaved(a,'keep');
  assert.equal(await a.context.performDeleteSession(deleted.id),true,'A confirmed session must be removable offline after its deletion intent is durable');assert.deepEqual(a.tree[0].exercises[0].sessions.map(s=>s.id),['keep']);assert.equal(a.remote.has(deleted.id),true);assert.equal(a.api.pendingDeletes(),1);
  const b=app({online:false,local:a.local,indexed:a.indexed,remote:a.remote});b.tree[0].exercises[0].sessions=[clone(deleted),clone(kept)];await b.ready();b.api.restore();
  assert.equal(b.tree[0].exercises[0].sessions.some(s=>s.id===deleted.id),false);assert.equal(b.api.filterDeleted([deleted,kept],'student-a').length,1);
  b.context.navigator.onLine=true;await b.api.flush();assert.equal(b.remote.has(deleted.id),false);assert.deepEqual(b.remote.get('keep'),kept);assert.equal(b.api.pending(),0);assert.equal(b.api.isDeleted(deleted.id),true);
  const c=app({online:false,local:b.local,indexed:b.indexed,remote:b.remote});await c.ready();assert.equal(c.api.filterDeleted([deleted,kept],'student-a')[0].id,'keep','Confirmed marker must keep old backups from restoring the deleted session');
});
await check('exclusão pendente cancela criação offline e confirma ausência pelas Rules fechadas',async()=>{
  const a=app({online:false});await a.ready();const {id}=await a.save();a.frames();assert.equal(await a.context.performDeleteSession(id),true);
  assert.equal(a.api.hasPending(id),false);assert.equal(a.api.pendingDeletes(),1);assert.equal(a.tree[0].exercises[0].sessions.length,0);
  a.context.navigator.onLine=true;assert.equal(await a.api.flush(),true);assert.equal(a.remote.has(id),false);assert.equal(a.calls.filter(([type])=>type==='set').length,0);assert(a.calls.some(([type])=>type==='query'));assert.equal(a.api.pendingDeletes(),0);
});
await check('criação em voo seguida de timeout e exclusão não ressuscita nem reenvia a série',async()=>{
  const gate=deferred(),a=app({writeGate:gate,writeTimeout:true});await a.ready();const {id}=await a.save();a.frames();await a.api.flush();
  assert.equal(await a.context.performDeleteSession(id),true);await a.api.flush();await settle();assert.equal(a.tree[0].exercises[0].sessions.length,0);assert.equal(a.calls.filter(([type])=>type==='delete').length,0,'Delete must await the real creation promise for this ID');
  gate.resolve();await settle();await settle();assert.equal(a.remote.has(id),false);assert.equal(a.api.pendingDeletes(),0);assert.equal(a.calls.filter(([type])=>type==='set').length,1);assert.equal(a.calls.filter(([type])=>type==='delete').length,1);
});
await check('exclusão não aguarda gravação pendente de outro registro',async()=>{
  const gate=deferred(),a=app({writeGate:gate,writeTimeout:true});await a.ready();await a.save();await a.api.flush();seedSaved(a,'delete-other');
  assert.equal(await a.context.performDeleteSession('delete-other'),true);await settle();await settle();assert.equal(a.remote.has('delete-other'),false,'Unrelated slow write must not block deletion');gate.resolve();await settle();
});
await check('timeout de delete mantém uma única operação em voo e aceita confirmação tardia',async()=>{
  const gate=deferred(),a=app({deleteGate:gate,writeTimeout:true});await a.ready();seedSaved(a);await a.context.performDeleteSession('saved');await a.api.flush();await a.api.flush();
  assert.equal(a.calls.filter(([type])=>type==='delete').length,1);assert.equal(a.api.pendingDeletes(),1);gate.resolve();await settle();await settle();assert.equal(a.remote.has('saved'),false);assert.equal(a.api.pendingDeletes(),0);
});
await check('reinício após delete remoto e falha ao guardar confirmação reconhece ausência sem erro falso',async()=>{
  const opts={},a=app(opts);await a.ready();seedSaved(a);opts.afterDelete=()=>{opts.failLocal=true;opts.failIndexedWrite=true;};await a.context.performDeleteSession('saved');await settle();await settle();assert.equal(a.remote.has('saved'),false);assert.equal(a.api.pendingDeletes(),1);
  const b=app({local:a.local,indexed:a.indexed,remote:a.remote});await b.ready();assert.equal(await b.api.flush(),true);assert.equal(b.api.pendingDeletes(),0);assert(b.calls.some(([type])=>type==='query'),'Server absence must reconcile the interrupted confirmation');
});
await check('exclusão usa IndexedDB quando localStorage falha e recupera em nova VM',async()=>{
  const a=app({online:false,failLocal:true});await a.ready();const session=seedSaved(a);assert.equal(await a.context.performDeleteSession('saved'),true);
  const b=app({online:false,failLocal:true,local:a.local,indexed:a.indexed,remote:a.remote});await b.ready();assert.equal(b.api.isDeleted('saved'),true);assert.equal(b.api.filterDeleted([session],'student-a').length,0);b.context.navigator.onLine=true;await b.api.flush();assert.equal(b.remote.has('saved'),false);
});
await check('falha em todos os armazenamentos não remove registro nem fecha editor',async()=>{
  const a=app({online:false,failLocal:true,failIndexedWrite:true});await a.ready();seedSaved(a);a.editModal.open=true;a.context.EDIT_SESSION_ID='saved';
  assert.equal(await a.context.performDeleteSession('saved'),false);assert.equal(a.tree[0].exercises[0].sessions.length,1);assert.equal(a.api.isDeleted('saved'),false);assert.equal(a.editModal.open,true);assert.equal(a.remote.has('saved'),true);assert.equal(a.button.disabled,false);
});
await check('permissão negada em documento existente não vira confirmação falsa de exclusão',async()=>{
  const opts={deleteFailure:permission()},a=app(opts);await a.ready();seedSaved(a);await a.context.performDeleteSession('saved');await settle();assert.equal(await a.api.flush(),false);
  assert.equal(a.remote.has('saved'),true);assert.equal(a.api.pendingDeletes(),1);assert.equal(a.api.diagnostics().failed,1);assert.equal(a.api.diagnostics().lastError,'permission');
  opts.deleteFailure=null;assert.equal(await a.api.flush(),true);assert.equal(a.remote.has('saved'),false);assert.equal(a.api.pendingDeletes(),0);
});
await check('aluno registrado offline exclui remotamente após reconectar',async()=>{
  const a=app({mode:'local',offlineRegistered:true,online:false});await a.ready();seedSaved(a);assert.equal(await a.context.performDeleteSession('saved'),true);assert.equal(a.api.pendingDeletes(),1);
  a.context.MODE='cloud';a.context.navigator.onLine=true;await a.api.flush();assert.equal(a.remote.has('saved'),false);
});
await check('troca de conta durante exclusão não limpa editor ou histórico do outro aluno',async()=>{
  const gate=deferred(),a=app({online:false,failLocal:true,indexedGate:gate});await a.ready();seedSaved(a);a.context.EDIT_SESSION_ID='saved';const removing=a.context.performDeleteSession('saved');await settle();
  a.context.CURRENT_USER={uid:'student-b',role:'student'};a.context.EDIT_SESSION_ID='other-edit';a.tree=[{id:'workout-b',exercises:[{id:'exercise-b',sessions:[{id:'other-edit',sets:[{weight:5,reps:9}]}]}]}];gate.resolve();assert.equal(await removing,true);
  assert.equal(a.context.EDIT_SESSION_ID,'other-edit');assert.equal(a.tree[0].exercises[0].sessions.length,1);assert.equal(a.calls.filter(([type])=>type==='delete').length,0);assert.equal(a.api.isDeleted('saved'),false);
});
await check('backup legado não restaura registro excluído nem apaga outros dados',async()=>{
  const a=app({online:false});await a.ready();const removed=seedSaved(a),kept=seedSaved(a,'keep');await a.context.performDeleteSession('saved');
  Object.assign(a.context,{SESSION_ARCHIVE_MEMORY:new Map(),sessionArchiveKey:uid=>'archive:'+uid,legacySessionArchiveKey:uid=>'legacy:'+uid,indexedSessionArchiveKey:uid=>'indexed:'+uid,sanitizeHistorySession:v=>v,sessionIdentity:v=>v.id,createdMillis:()=>0});
  for(const key of ['archive:student-a','legacy:student-a'])a.local.set(key,JSON.stringify([removed,kept]));a.local.set('teamms_cloud_student-a',JSON.stringify([{id:'old',exercises:[{id:'old-e',sessions:[removed,kept]}]}]));
  const get=name=>{const start=core.indexOf(`function ${name}(`);if(start<0)return '';const line=core.slice(start).split('\n')[0].trimEnd();return line.endsWith('}')?line:core.slice(start,core.indexOf('\n}',start)+2);};
  vm.runInContext(['mergeHistorySessions','sessionsFromWorkoutTree','loadSessionArchive'].map(get).join('\n'),a.context);
  assert.deepEqual(Array.from(a.context.loadSessionArchive('student-a'),s=>s.id),['keep']);assert.equal(JSON.parse(a.local.get('legacy:student-a')).length,2,'Legacy backup is preserved; the explicit deletion marker filters the target only');
});
await check('confirmação antiga não exclui após troca de aluno',async()=>{
  const a=app({online:false});await a.ready();seedSaved(a);let confirm;a.context.showConfirm=(_title,_text,fn)=>confirm=fn;
  a.context.deleteSession('saved');a.context.CURRENT_USER={uid:'student-b',role:'student'};assert.equal(await confirm(),false);assert.equal(a.remote.has('saved'),true);assert.equal(a.calls.filter(([type])=>type==='delete').length,0);
});
await check('retorno atrasado não fecha uma nova confirmação aberta durante o delete',async()=>{
  const elements=new Map(['confirm-title','confirm-text','confirm-ok-btn'].map(id=>[id,{disabled:false,textContent:'',onclick:null}]));let closed=0;const gate=deferred();
  const c=vm.createContext({console,document:{getElementById:id=>elements.get(id)},openModal(){},closeModal:()=>closed++,alert(){}});
  const start=core.indexOf('function showConfirm('),end=core.indexOf('\n}',start)+2;vm.runInContext(core.slice(start,end),c);
  c.showConfirm('Excluir antiga','',()=>gate.promise);const button=elements.get('confirm-ok-btn'),old=button.onclick();c.showConfirm('Outra ação','',()=>false);const current=button.onclick;
  gate.resolve(true);await old;assert.equal(closed,0,'Old completion must not close the new prompt');assert.equal(button.onclick,current);assert.equal(button.disabled,false);await current();assert.equal(closed,0);
  c.showConfirm('Confirmar atual','',()=>true);await button.onclick();assert.equal(closed,1);
});

console.log(`APROVADO — ${tests.length} cenários executaram a lógica real de persistência, reabertura, sincronização, edição e isolamento de registros.`);
