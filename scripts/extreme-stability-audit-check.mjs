import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=file=>fs.readFileSync(file,'utf8'),core=read('app_v10_10_9_core.js');
function coreFunction(name){const start=core.indexOf('function '+name+'(');assert(start>=0,name);const line=core.slice(start).split('\n')[0].trimEnd(),prefix=core.slice(start-6,start)==='async '?'async ':'';return prefix+(line.endsWith('}')?line:core.slice(start,core.indexOf('\n}',start)+2));}
const quiet={warn(){},error(){},log(){}},original=[{id:'w',userId:'s',exercises:[{id:'chair',name:'Cadeira flexora',sessions:[]}]}];
function home(){
  const c={CURRENT_USER:{uid:'s',role:'student'},MODE:'cloud',CLOUD_WORKOUTS:structuredClone(original),CLOUD_LOAD_SEQ:0,CLOUD_HOME_FLIGHT:null,HISTORY_BY_NAME:{},console:quiet,
    reads:[],backups:[],idle:[],incoming:structuredClone(original),cacheExercises:false,cacheWorkouts:false,fail:false,gate:null,
    withTimeout:promise=>promise,warmSessionArchive:async()=>{},loadCloudBackup:()=>[],loadSessionArchive:()=>[],pendingSessionHistory:()=>[],mergeHistorySessions:()=>[],
    hydrateWorkoutSessions:workouts=>workouts,buildHistoryByName:()=>({}),renderHome(){},showToast(){},runWhenIdle:fn=>c.idle.push(fn),hydrateHomeSessions:async()=>{},
    saveCloudBackup:()=>c.backups.push(structuredClone(c.CLOUD_WORKOUTS)),
    db:{collection:name=>({where:(_field,_operator,uid)=>({name,uid})})},
    queryServerFirst:async query=>{
      c.reads.push(query);const gate=c.gate;if(gate)await gate;
      if(c.fail)throw new Error('offline');
      return{source:(query.name==='exercises'?c.cacheExercises:c.cacheWorkouts)?'cache':'server',snapshot:{uid:query.uid}};
    },
    buildCloudStructure:workouts=>structuredClone(c.incoming).map(workout=>({...workout,userId:workouts.uid}))
  };
  vm.createContext(c);vm.runInContext(['fetchCloudStructure','loadCloudHome','loadCloudHomeOnce'].map(coreFunction).join('\n'),c);return c;
}
{
 const c=home();assert((await Promise.all(Array.from({length:20},()=>c.loadCloudHome()))).every(Boolean));
 assert.equal(c.reads.length,2,'Twenty simultaneous entries must share the two structure reads');
 assert.equal(c.idle.length,1,'Schedule a single background history hydration');
}
{
 const c=home();c.navigator={onLine:false};assert.equal(await c.loadCloudHome(),false);
 assert.equal(c.reads.length,0,'An explicitly offline device must not start doomed server reads');
 assert.equal(c.CLOUD_WORKOUTS[0].exercises[0].id,'chair');
}
for(const field of ['cacheExercises','cacheWorkouts']){
 const c=home();c[field]=true;c.incoming=[{id:'w',exercises:[]}];
 assert.equal(await c.loadCloudHome(),false,'Partial cache is not a confirmed server refresh');
 assert.equal(c.CLOUD_WORKOUTS[0].exercises[0].id,'chair','A partial refresh cannot remove the open exercise');
 assert.equal(c.backups.at(-1)[0].exercises[0].id,'chair','Do not overwrite the known backup with an incomplete cache');
}
{
 const c=home();c.incoming=[{id:'w',exercises:[]}];
 assert.equal(await c.loadCloudHome(),true);
 assert.equal(c.CLOUD_WORKOUTS[0].exercises.length,0,'A confirmed server removal must remain removed');
 c.incoming=[];assert.equal(await c.loadCloudHome(),true);assert.equal(c.CLOUD_WORKOUTS.length,0);
}
{
 const c=home();c.fail=true;assert.equal(await c.loadCloudHome(),false);
 c.fail=false;assert.equal(await c.loadCloudHome(),true,'A failed request must release its flight for an explicit retry');
}
{
 const c=home();let release;c.gate=new Promise(resolve=>release=resolve);
 const old=c.loadCloudHome();await Promise.resolve();await Promise.resolve();
 c.CURRENT_USER={uid:'next',role:'student'};c.CLOUD_WORKOUTS=[];c.gate=null;c.incoming=[{id:'next-w',exercises:[]}];
 await c.loadCloudHome();release();await old;
 assert.equal(c.CLOUD_WORKOUTS[0].userId,'next','A late prior-account response must never replace the next account');
}
// The trainer reader follows the same partial-cache preservation rule.
{
 const nodes=new Map(),c={VIEW_STUDENT:{uid:'s',workouts:structuredClone(original)},TRAINER_STUDENT_LOAD_SEQ:0,console:quiet,
   document:{getElementById:id=>{if(!nodes.has(id))nodes.set(id,{style:{},textContent:'',innerHTML:''});return nodes.get(id);}},
   studentArchiveCode:()=>'',esc:value=>String(value||''),jsArg:JSON.stringify,loadSessionArchive:()=>[],hydrateWorkoutSessions:value=>value,
   normalizeWorkoutCollection:value=>value,buildHistoryByName:()=>({}),runWhenIdle(){},normalizedName:value=>String(value||''),activeWorkoutId:()=> 'w',lastDate:()=>'',getWorkoutDays:()=>[],v104CycleMeta:()=>'',HISTORY_BY_NAME:{},
   fetchCloudStructure:async()=>({source:'cache',workouts:[{id:'w',exercises:[]}]})};
 vm.createContext(c);vm.runInContext(coreFunction('renderTrainerStudent'),c);
 assert.equal(await c.renderTrainerStudent({uid:'s',name:'Aluno'}),false);
 assert.equal(c.VIEW_STUDENT.workouts[0].exercises[0].id,'chair');
 c.fetchCloudStructure=async()=>({source:'server',workouts:[]});
 assert.equal(await c.renderTrainerStudent({uid:'s',name:'Aluno'}),true);assert.equal(c.VIEW_STUDENT.workouts.length,0);
 for(const base of ['V102_RENDER_TRAINER_STUDENT','V109_RENDER_TRAINER_STUDENT']){
  const line=core.split('\n').find(line=>line.startsWith('renderTrainerStudent=async function(student)')&&line.includes(base));assert(line);
  c[base]=async()=>false;c.loadTrainerCheckinSchedule=async()=>{};c.loadTrainerProtocolReview=async()=>{};
  vm.runInContext(line,c);assert.equal(await c.renderTrainerStudent({uid:'s'}),false,'Wrappers must propagate an unconfirmed read to the sync button');
 }
}
// Exercise the actual manual-sync button handler rather than a copied implementation.
{
 const line=read('modules/v107-operations.js').split('\n').find(line=>line.includes('window.v107RunSync=async function()'));assert(line);
 const messages=[],saved=[],c={CURRENT_USER:{uid:'s',role:'student'},MODE:'cloud',navigator:{onLine:true},TB:{ensureCloud:async()=>true},
   loading(){},migrateLocalToCloud:async()=>{},loadCloudHome:async()=>false,renderSync:async()=>{},storageSet:(...args)=>saved.push(args),showToast:message=>messages.push(message),alert:message=>messages.push(message),TeamBullsWorkoutCompletion:{syncPending:async()=>{}}};
 c.window=c;vm.createContext(c);vm.runInContext(line,c);await c.v107RunSync();
 assert.equal(saved.length,0,'An unconfirmed refresh must not stamp a successful synchronization');
 assert(!messages.some(message=>message.includes('Sincronização concluída')));
 c.loadCloudHome=async()=>true;await c.v107RunSync();assert.equal(saved.length,1);assert(messages.some(message=>message.includes('Sincronização concluída')));
 c.CURRENT_USER={uid:'coach',role:'trainer'};c.VIEW_STUDENT={uid:'s'};c.renderTrainerStudent=async()=>false;await c.v107RunSync();assert.equal(saved.length,1,'An unconfirmed trainer refresh cannot stamp success either');
}
// Test the actual report transport. Only quick transient reads may retry;
// writes, auth denials, offline devices and long timeouts never replay here.
const report=read('modules/student-report-submit-reconciliation-v10_10_57.js');
function reportFunction(name){const start=report.indexOf('  async function '+name+'(');assert(start>=0,name);return report.slice(start,report.indexOf('\n  }',start)+4);}
async function transport({url='https://example.test/doc',method='GET',status=503,again=false,changeOwner=false,offline=false,slow=false,network=false}={}){
 let calls=0,now=0;const c={auth:{currentUser:{uid:'s'}},navigator:{onLine:!offline},REST_GET_TIMEOUT:12000,AbortController,setTimeout,clearTimeout,Date:{now:()=>now},
   fetch:async()=>{calls++;if(slow)now+=2000;if(changeOwner)c.auth.currentUser={uid:'next'};if(calls===1||again){if(network)throw new TypeError('network');return{ok:false,status,json:async()=>({error:{message:'unavailable'}})};}return{ok:true,json:async()=>({ok:true})};}};
 vm.createContext(c);vm.runInContext(reportFunction('fetchJson')+'\n'+reportFunction('fetchJsonOnce'),c);
 let result,error;try{result=await c.fetchJson(url,{method});}catch(e){error=e;}
 return{calls,result,error};
}
assert.equal((await transport()).calls,2);
assert.equal((await transport({network:true})).result.ok,true);
assert.equal((await transport({url:'https://example.test/documents:runQuery',method:'POST'})).calls,2);
for(const options of [{url:'https://example.test/documents:commit',method:'POST'},{status:403},{status:401},{offline:true},{slow:true},{changeOwner:true}]){
 const result=await transport(options);assert.equal(result.calls,1,'No retry for '+JSON.stringify(options));assert(result.error);
}
const bounded=await transport({again:true});assert.equal(bounded.calls,2);assert(bounded.error);
console.log('PASS extreme stability audit: coalesced entry reads, partial-cache preservation, confirmed removals, retry after failure, late-account isolation, manual sync status and bounded read-only report recovery.');
