import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const core=fs.readFileSync('app_v10_10_9_core.js','utf8');
export function fn(name){const start=core.indexOf(`function ${name}(`);assert(start>=0,name);const line=core.slice(start).split('\n')[0].trimEnd(),prefix=core.slice(start-6,start)==='async '?'async ':'';return prefix+(line.endsWith('}')?line:core.slice(start,core.indexOf('\n}',start)+2));}
export const cycleFunctions=['v109CyclePayload','v109PersistWorkoutCycle','v109ProtocolState','loadProtocolReviewSchedule','v109PrepareMonthlyReview','v109CompleteProtocolReview','protocolReviewInterval','workoutUpdateDate'];
export const catalogFunctions=['exerciseOptionsSearchText','exerciseOptionsActiveItems','renderExerciseOptions','clearExerciseOptionsSearch'];
export const orderingFunctions=['normalizedName','hasManualOrder','createdMillis','orderedWorkouts','activeWorkoutId'];
export function fixture({fail=false,readHook=null,retryHook=null}={}){
  const original={userId:'s',name:'Anterior',color:'#e11d48',startDate:'2026-09-01',updateDate:'2026-12-01',isActive:true,order:0,days:[{name:'A'}],createdAt:123};
  const remote={'workouts/old':structuredClone(original),'protocolReviewSchedules/s':{studentId:'s',trainerId:'t',sourceWorkoutId:'old',startDate:'2026-09-01',intervalWeeks:4,lastCompletedCycle:2,lastCompletedDate:'2026-10-30'},'mealPlans/s':{plans:[{id:'d',startDate:'2026-01-01',isActive:true}]},'questionnaires/answered':{answered:true,answers:['preserve']},'checkinSchedules/s':{nextDueDate:'2026-11-15',extraRequestId:'keep'}};
  const writes=[],reads=[];
  const ref=key=>({key,doc:id=>ref(key+'/'+id),where:()=>ref(key),get:async()=>{reads.push(key);await readHook?.(key);if(key==='workouts')return{docs:Object.keys(remote).filter(k=>k.startsWith('workouts/')).map(k=>({id:k.split('/')[1]}))};if(key.startsWith('workouts/')&&!remote[key])throw Object.assign(new Error('Missing workout is not readable under Rules 28'),{code:'permission-denied'});return{exists:!!remote[key],data:()=>structuredClone(remote[key])};}});
  const c={CURRENT_USER:{uid:'t',role:'trainer'},auth:{currentUser:{uid:'t'}},MODE:'cloud',VIEW_STUDENT:{uid:'s',workouts:[{...original,id:'old'}]},V109_PROTOCOL_REVIEW_STUDENT:'',V109_PROTOCOL_REVIEW_SCHEDULE:null,
    db:{collection:ref,runTransaction:async task=>{for(let attempt=0;attempt<2;attempt++){const staged=[];let wrote=false;const result=await task({get:async r=>{assert(!wrote,'All reads must precede writes');return r.get();},set:(r,p,o)=>{wrote=true;staged.push({key:r.key,p:structuredClone(p),merge:o?.merge});},update:(r,p)=>{wrote=true;staged.push({key:r.key,p:structuredClone(p),merge:true});}});if(fail)throw new Error('unavailable');if(attempt===0&&retryHook){retryHook(remote);continue;}for(const w of staged){remote[w.key]=w.merge?{...remote[w.key],...w.p}:w.p;writes.push(w);}return result;}}},
    cloudGet:r=>r.get(),cloudWrite:p=>p,firebase:{firestore:{FieldValue:{serverTimestamp:()=>123},FieldPath:{documentId:()=> '__name__'}}},
    console:{warn(){}},window:{TeamBullsMonthlyReports:{ensureForStudent:async()=>{}}},ensureReportCycleRuntime:async()=>{},showToast(){},
    today:()=> '2026-11-09',validIsoDate:v=>/^\d{4}-\d{2}-\d{2}$/.test(v||''),
    addDaysIso:(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);},v104DateDiffDays:(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/86400000)};
  vm.createContext(c);vm.runInContext([...orderingFunctions,...cycleFunctions].map(fn).join('\n'),c);
  vm.runInContext(fs.readFileSync('modules/report-schedule-consistency-v10_10_11.js','utf8'),Object.assign(c,{setTimeout:()=>0}));
  return{c,remote,writes,reads};
}
if(process.argv[1]?.endsWith('protocol-cycle-search-check.mjs')){
  let count=0;
  const create=async f=>f.c.v109PersistWorkoutCycle('s','new',{name:'Novo',color:'#e11d48',startDate:'2026-11-09',updateDate:'2027-01-04'},{create:true,workouts:f.c.VIEW_STUDENT.workouts});
  {
    const f=fixture(),expected=structuredClone(f.remote['protocolReviewSchedules/s']);await create(f);const before=JSON.stringify(f.remote);await assert.rejects(f.c.v109CompleteProtocolReview('s',expected),/protocolo mudou/);assert.equal(JSON.stringify(f.remote),before,'An old monthly confirmation cannot complete the new protocol');count++;
  }
  {
    const f=fixture(),s=f.remote['protocolReviewSchedules/s'];s.lastCompletedDate='2026-09-01';s.lastCompletedCycle=0;const next=await f.c.v109CompleteProtocolReview('s',structuredClone(s));assert.equal(next.startDate,'2026-09-01');assert.equal(next.lastCompletedDate,'2026-11-09');assert.equal(f.c.v109ProtocolState(next).nextDueDate,'2026-11-24','Late completion does not move the calendar');assert.equal(f.remote['workouts/old'].updateDate,'2026-12-01');await assert.rejects(f.c.v109CompleteProtocolReview('s',structuredClone(s)),/protocolo mudou/);count++;
  }
  {
    const f=fixture({retryHook:remote=>{remote['workouts/concurrent']={...remote['workouts/old'],isActive:true,startDate:'2026-11-01'};remote['workouts/old'].isActive=false;remote['protocolReviewSchedules/s']={...remote['protocolReviewSchedules/s'],sourceWorkoutId:'concurrent',startDate:'2026-11-01',intervalWeeks:7};}});
    const schedule=await create(f);assert.equal(schedule.intervalWeeks,7);assert.equal(f.remote['workouts/concurrent'].isActive,false);assert.equal(f.remote['workouts/new'].isActive,true);assert.equal(f.writes.filter(w=>w.key==='workouts/new').length,1,'Only the confirmed attempt commits');count++;
  }
  {
    const f=fixture();f.remote['workouts/old'].userId='other';await assert.rejects(create(f),/não pertence/);assert.equal(f.writes.length,0);count++;
  }
  {
    const f=fixture();f.c.VIEW_STUDENT.workouts=[];delete f.remote['workouts/old'];await assert.rejects(f.c.v109PersistWorkoutCycle('s','',{}, {workouts:[],intervalWeeks:4}),/Defina o início/);assert.equal(f.writes.length,0);count++;
  }
  {
    const f=fixture();delete f.remote['workouts/old'];f.c.VIEW_STUDENT.workouts=[];const schedule=await create(f);assert.equal(schedule.sourceWorkoutId,'new');assert(!f.reads.includes('workouts/old'));count++;
  }
  {
    const f=fixture(),untouched=JSON.stringify([f.remote['mealPlans/s'],f.remote['questionnaires/answered'],f.remote['checkinSchedules/s']]);
    const schedule=await create(f);assert.equal(schedule.startDate,'2026-11-09');assert.equal(f.c.v109ProtocolState(schedule).nextDueDate,'2026-12-07');assert.equal(schedule.lastCompletedCycle,0);assert.equal(schedule.lastCompletedDate,'');assert.equal(f.remote['workouts/old'].isActive,false);assert.equal(f.remote['workouts/new'].isActive,true);assert.equal(f.remote['workouts/new'].updateDate,'2027-01-04');assert(!f.reads.includes('workouts/new'),'Never GET a missing draft');assert.equal(JSON.stringify([f.remote['mealPlans/s'],f.remote['questionnaires/answered'],f.remote['checkinSchedules/s']]),untouched);count++;
    f.remote['workouts/new'].days=[{name:'Preserve on retry'}];await create(f);assert.equal(f.remote['workouts/new'].days[0].name,'Preserve on retry');count++;
  }
  {
    const f=fixture({fail:true}),before=JSON.stringify(f.remote);await assert.rejects(create(f),/unavailable/);assert.equal(JSON.stringify(f.remote),before,'No partial workout/schedule write');count++;
  }
  {
    const f=fixture();await f.c.v109PersistWorkoutCycle('s','old',{name:'Renomeado'},{workouts:f.c.VIEW_STUDENT.workouts});assert.equal(f.writes.length,1);assert.equal(f.remote['protocolReviewSchedules/s'].lastCompletedDate,'2026-10-30');assert.equal(f.c.v109ProtocolState(f.remote['protocolReviewSchedules/s']).nextDueDate,'2026-11-24');count++;
    await f.c.v109PersistWorkoutCycle('s','old',{startDate:'2026-11-08'},{workouts:f.c.VIEW_STUDENT.workouts});assert.equal(f.remote['protocolReviewSchedules/s'].lastCompletedDate,'');assert.equal(f.remote['workouts/old'].updateDate,'2027-01-03');assert.equal(f.c.v109ProtocolState(f.remote['protocolReviewSchedules/s']).nextDueDate,'2026-12-06');count++;
  }
  {
    const f=fixture(),edit={intervalWeeks:6,activeStartDate:'2026-09-07',expectedWorkoutId:'old',expectedStartDate:'2026-09-01'};
    const result=await f.c.v109PersistWorkoutCycle('s','',{},edit);
    assert.equal(result.startDate,f.remote['workouts/old'].startDate);
    assert.equal(result.lastCompletedDate,'2026-10-30','Correcting the same active workout preserves the actual review date');
    assert.equal(result.lastCompletedCycle,1);
    assert.equal(f.c.v109ProtocolState(result).nextDueDate,'2026-11-30','The adjustable monthly interval remains anchored to the edited start');
    assert.equal(f.remote['workouts/old'].updateDate,'2026-11-02','The monthly interval cannot change the fixed 56 days');
    assert.deepEqual(f.remote['workouts/old'].days,[{name:'A'}]);
    const firstWriteCount=f.writes.length;
    await f.c.v109PersistWorkoutCycle('s','',{},edit);
    assert.equal(f.writes.length,firstWriteCount,'Retry after a lost confirmation must be idempotent');
    count++;
  }
  {
    const f=fixture({fail:true}),before=JSON.stringify(f.remote);
    await assert.rejects(f.c.v109PersistWorkoutCycle('s','',{}, {intervalWeeks:4,activeStartDate:'2026-11-10',expectedWorkoutId:'old',expectedStartDate:'2026-09-01'}),/unavailable/);
    assert.equal(JSON.stringify(f.remote),before);count++;
  }
  {
    const f=fixture();
    f.remote['workouts/old'].isActive=false;
    f.remote['workouts/newer']={...f.remote['workouts/old'],startDate:'2026-11-11',isActive:true};
    f.remote['protocolReviewSchedules/s'].sourceWorkoutId='newer';
    await assert.rejects(f.c.v109PersistWorkoutCycle('s','',{}, {intervalWeeks:4,activeStartDate:'2026-11-10',expectedWorkoutId:'old',expectedStartDate:'2026-09-01'}),/treino ativo mudou/);
    assert.equal(f.writes.length,0);count++;
    const g=fixture();g.remote['workouts/old'].startDate='2026-09-15';
    await assert.rejects(g.c.v109PersistWorkoutCycle('s','',{}, {intervalWeeks:4,activeStartDate:'2026-11-10',expectedWorkoutId:'old',expectedStartDate:'2026-09-01'}),/início do treino mudou/);
    assert.equal(g.writes.length,0);count++;
  }
  {
    const f=fixture(),s={startDate:'2026-09-21',intervalWeeks:4,lastCompletedCycle:1,lastCompletedDate:'2026-10-22'};
    assert.equal(f.c.workoutUpdateDate({startDate:s.startDate,updateDate:'2026-10-19'}),'2026-11-16');
    assert.equal(f.c.v109ProtocolState(s,'2026-11-12').nextDueDate,'2026-11-16');
    assert.equal(f.c.v109ProtocolState(s,'2026-11-16').pending,true);
    assert.equal(f.c.workoutUpdateDate({startDate:'2028-02-15'}),'2028-04-11');
    assert.equal(f.c.workoutUpdateDate({startDate:'2026-02-31'}),'');
    count++;
  }
  {
    const f=fixture();f.remote['protocolReviewSchedules/s'].intervalWeeks=6;const s=await create(f);assert.equal(f.c.v109ProtocolState(s).nextDueDate,'2026-12-21');count++;
    f.remote['workouts/inactive']={...f.remote['workouts/old'],isActive:false,order:2};f.c.VIEW_STUDENT.workouts.push({...f.remote['workouts/inactive'],id:'inactive'});const before=JSON.stringify(f.remote['protocolReviewSchedules/s']);await f.c.v109PersistWorkoutCycle('s','inactive',{startDate:'2025-01-01'},{workouts:f.c.VIEW_STUDENT.workouts});assert.equal(JSON.stringify(f.remote['protocolReviewSchedules/s']),before);count++;
    const activated=await f.c.v109PersistWorkoutCycle('s','inactive',{}, {activate:true,workouts:f.c.VIEW_STUDENT.workouts});assert.equal(activated.startDate,'2025-01-01');assert.equal(activated.sourceWorkoutId,'inactive');assert.equal(f.remote['workouts/new'].isActive,false,'Read latest source even when missing from stale workspace');count++;
  }
  {
    const f=fixture();delete f.remote['protocolReviewSchedules/s'];const schedule=await f.c.loadProtocolReviewSchedule('s',true);assert.equal(schedule.startDate,'2026-09-01','Old diet date must not win');assert.equal(schedule.sourceWorkoutId,'old');count++;
    f.remote['protocolReviewSchedules/s'].lastCompletedDate='2026-10-30';f.remote['protocolReviewSchedules/s'].lastCompletedCycle=2;delete f.remote['protocolReviewSchedules/s'].sourceWorkoutId;await f.c.loadProtocolReviewSchedule('s',true);assert.equal(f.remote['protocolReviewSchedules/s'].lastCompletedDate,'2026-10-30','Legacy same-start linking preserves completion');count++;
  }
  {
    let f;f=fixture({readHook:async key=>{if(key==='workouts/old')f.c.CURRENT_USER={uid:'other',role:'trainer'};}});const before=JSON.stringify(f.remote);await assert.rejects(create(f),/conta mudou/);assert.equal(JSON.stringify(f.remote),before);count++;
  }
  {
    const f=fixture();f.c.CURRENT_USER={uid:'s',role:'student'};f.c.auth.currentUser.uid='s';await f.c.loadProtocolReviewSchedule('s',true);assert.equal(f.writes.length,0);await assert.rejects(create(f),/treinador/);count++;
  }
  {
    const f=fixture();f.c.window.TeamBullsMonthlyReports.ensureForStudent=async()=>{throw new Error('offline');};await f.c.v109PrepareMonthlyReview('s','t');assert.equal(f.remote['workouts/old'].startDate,'2026-09-01');count++;
    for(const [start,due] of [['2028-02-15','2028-03-14'],['2026-12-20','2027-01-17']]){const s=f.c.v109CyclePayload(null,'s',{id:'new',startDate:start},'t');assert.equal(f.c.v109ProtocolState({...s,_exists:true}).nextDueDate,due);count++;}
  }
  const f=fixture(),c=f.c;Object.assign(c,{EXERCISE_OPTIONS:{groups:[{id:'g',name:'Extensão de joelho',items:[{id:'i',name:'Cadeira Extensora'},{id:'s',name:'Sissy squat'}]},{id:'g2',name:'Outro grupo',items:[{id:'i2',name:'Cadeira Extensora'}]}]},EXERCISE_OPTIONS_CONTEXT:null,getWorkouts:()=>c.workouts});vm.runInContext(catalogFunctions.slice(0,2).map(fn).join('\n'),c);
  c.CURRENT_USER={uid:'s',role:'student'};c.workouts=[{id:'old',isActive:false,order:0,exercises:[{name:'Sissy squat'}]},{id:'new',isActive:true,order:1,exercises:[{name:'Personalizado',catalogGroupId:'g',catalogItemId:'i'}]}];
  assert.deepEqual([...c.exerciseOptionsActiveItems()],['["g","i"]']);count++;
  c.workouts[1].exercises=[{name:'  CADEIRA   EXTENSORA '}];assert.equal(c.exerciseOptionsActiveItems().size,2);c.workouts[1].exercises=[{name:'Cadeira'}];assert.equal(c.exerciseOptionsActiveItems().size,0);count++;
  assert.equal(c.exerciseOptionsSearchText(' EXTENSÃO  de Joelho '),'extensao de joelho');count++;
  c.CURRENT_USER={uid:'t',role:'trainer'};assert.equal(c.exerciseOptionsActiveItems().size,0);c.EXERCISE_OPTIONS_CONTEXT={trainerUid:'t',studentUid:'other'};assert.equal(c.exerciseOptionsActiveItems().size,0);count++;
  console.log(`PASS ${count} protocol-cycle/search scenarios: atomic saves, exact date, preserved history, retries, activation, legacy migration, account guards and canonical active-workout matches.`);
}
