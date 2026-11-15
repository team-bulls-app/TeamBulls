import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {source} from './session-variant-protocol-check.mjs';

const read=file=>fs.readFileSync(file,'utf8');

// Use the delivered authenticated preflight transport with synthetic responses.
const reportCalls=[];
const reportUser={uid:'student',getIdToken:async()=> 'synthetic-id-token'};
const report=vm.createContext({
  window:{addEventListener(){}},console,setTimeout:()=>0,clearTimeout(){},AbortController,
  CURRENT_USER:{uid:'student',role:'student'},MODE:'cloud',db:{},
  auth:{currentUser:reportUser},CFG:{firebase:{projectId:'example'},appCheckSiteKey:'configured'},
  firebase:{appCheck:()=>({getToken:async()=>({token:'synthetic-app-check'})})},
  fetch:async(url,options)=>{
    reportCalls.push([url,options]);
    const body=options.method==='GET'
      ?{fields:{nextDueDate:{stringValue:'2026-11-12'},intervalDays:{integerValue:'7'}}}
      :[{document:{name:'projects/example/databases/(default)/documents/weeklyCheckins/w',
        fields:{studentId:{stringValue:'student'},createdAt:{timestampValue:'2026-11-01T10:30:00Z'},photoIds:{arrayValue:{values:[{stringValue:'p'}]}}}}}];
    return{ok:true,json:async()=>body};
  }
});
vm.runInContext(read('modules/student-report-submit-reconciliation-v10_10_57.js'),report);
const readPeriod=report.window.TeamBullsStudentReportSubmitReconciliation.readWeeklyPeriod;
const fresh=await readPeriod('student');
assert.equal(fresh.schedule.intervalDays,7);
assert.equal(fresh.history[0].createdAt.toDate().toISOString(),'2026-11-01T10:30:00.000Z');
assert.equal(fresh.history[0].photoIds[0],'p');
assert(reportCalls[0][0].endsWith('/checkinSchedules/student'));
assert.equal(reportCalls[0][1].headers['X-Firebase-AppCheck'],'synthetic-app-check');
assert.equal(reportCalls[0][1].headers.Authorization,'Bearer synthetic-id-token');
assert.equal(JSON.parse(reportCalls[1][1].body).structuredQuery.where.fieldFilter.value.stringValue,'student');
await assert.rejects(readPeriod('other'),/sessão/);
assert.equal(reportCalls.length,2);

const currentDay={id:'day',name:'Dia A'};
const exercises=['first','second','third'].map(id=>({id,sessions:[]}));
const workout={id:'w',isActive:true,startDate:'2026-11-01',exercises};
const stored=new Map(),remote=new Map(),messages=[],opened=[];
const progress=vm.createContext({
  console,CURRENT_USER:{uid:'student',role:'student',status:'active'},MODE:'cloud',ACCESS_MODE:'cloud',
  auth:{currentUser:{uid:'student'}},navigator:{onLine:true},AUTH_STATE_REVISION:1,
  CUR_WORKOUT:'w',CUR_DAY:'Dia A',CUR_EX:null,LAST_SESSION_WEEK:1,
  openCalDay:null,getCalendarMonthData:null,openExerciseFromCalendar:null,openCalendar:null,
  window:{addEventListener(){}},document:{createElement:()=>({}),head:{appendChild(){}},addEventListener(){},getElementById(){return null;}},
  localStorage:{getItem:id=>stored.get(id),setItem:(id,value)=>stored.set(id,value)},
  Date,today:()=> '2026-11-15',v104CycleWeek:()=>1,normalizedName:value=>String(value).toLowerCase(),
  getWorkoutDays:()=>[currentDay],getW:()=>workout,getE:(_wid,id)=>exercises.find(x=>x.id===id),
  exercisesForDay:()=>exercises,showToast:message=>messages.push(message),
  openStudentWeekExercise:(id,week)=>{progress.CUR_EX=id;progress.LAST_SESSION_WEEK=week;opened.push(id);},
  showConfirm:(_title,message,confirm)=>{messages.push(message);confirm();},
  openLogSessionModal:()=>opened.push('register'),goDay:()=>opened.push('day'),
  cloudGet:async query=>{
    assert(query.filters.some(([field,value])=>field==='studentUid'&&value==='student'),'Access requires an owner-scoped query');
    return {docs:[...remote].filter(([key,value])=>key.startsWith(query.collection+'/')&&query.filters.every(([field,expected])=>value[field]===expected)).map(([key,value])=>({id:key.split('/')[1],data:()=>value}))};
  },
  cloudWrite:promise=>promise,firebase:{firestore:{FieldValue:{serverTimestamp:()=>123}}}
});
function collection(name,filters=[]){
  return {collection:name,filters,where:(field,_op,value)=>collection(name,[...filters,[field,value]]),
    doc:id=>({set:async value=>{
      assert(!remote.has(name+'/'+id),'Rules prohibit updating a completion after creation');
      remote.set(name+'/'+id,value);
    }})};
}
progress.db={collection};
vm.runInContext(read('modules/student-training-calendar-v10_10_70.js'),progress);
const api=progress.window.TeamBullsWorkoutCompletion;
assert(api.startGuidedWorkout());
assert.deepEqual(opened,['first']);
assert.equal(api.finishExercise(),false);
assert.equal(opened.at(-1),'register');
assert(api.postponeExercise());
assert.match(messages.at(-1),/ordem foi planejada/);
for(const id of ['second','third','first']){
  assert.equal(opened.at(-1),id);
  exercises.find(item=>item.id===id).sessions.push({date:'2026-11-15',week:1,sets:[{weight:10,reps:8}]});
  assert(api.finishExercise());
}
assert.equal(opened.at(-1),'day');
const storeKey='team_bulls_workout_cycle_v1_student';
const cycle={studentUid:'student',workoutId:'w',startDate:workout.startDate,pendingSync:true,syncError:''};
stored.set(storeKey,JSON.stringify({
  states:{'w|2026-11-01':{...cycle,docId:'state',initialWeek:1}},
  completions:{completion:{...cycle,week:1,dayId:'day',dayName:'Dia A',completedDate:'2026-11-15'}}
}));
progress.navigator.onLine=false;
assert.equal(await api.syncPending('student'),false);
assert.equal(api.diagnostics().pending,2);
progress.navigator.onLine=true;
assert.equal(await api.syncPending('student'),true);
assert.equal(remote.size,2);
assert.equal(api.diagnostics().pending,0);
assert.equal(await api.syncPending('student'),true);
assert.equal(remote.size,2);

const math=vm.createContext({Date});
vm.runInContext(['dietVariantForDate','studentMyoRepBand'].map(source).join('\n'),math);
const high={name:'Carbo alto',weekdays:[1]},mid={name:'Carbo médio',weekdays:[3]},low={name:'Carbo baixo',restWeekdays:[0]};
assert.equal(math.dietVariantForDate({variants:[high,mid,low]},'2026-11-15'),low);
assert.equal(math.dietVariantForDate({variants:[high,mid,low]},'2026-11-16'),high);
assert.equal(math.dietVariantForDate({variants:[high,mid,low]},'2026-11-18'),mid);
assert.equal(math.dietVariantForDate({variants:[high,mid,low]},'2026-11-17'),null);
assert.equal(math.dietVariantForDate({variants:[mid,{weekdays:[3]}]},'2026-11-18'),null);
assert.equal(math.studentMyoRepBand({targetMin:5,targetMax:9}),'6–8');
assert.equal(math.studentMyoRepBand({targetMin:9,targetMax:12}),'8–12');
assert.equal(math.studentMyoRepBand({targetMin:10,targetMax:14}),'');

// Exercise the same entry function against every registered screen.
function scrollNode(id){
  const classes=new Set();
  return {id,scrollTop:0,scrollLeft:0,style:{},
    classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},
    scrollTo({top,left,behavior}){assert.equal(behavior,'instant');this.scrollTop=top;this.scrollLeft=left;}};
}
const application=scrollNode('app'),page=scrollNode('page'),frames=[];
const screenIds=[...read('index.html').matchAll(/class="screen(?: active)?" id="([^"]+)"/g)].map(match=>match[1]);
assert(screenIds.length>20);
const screens=screenIds.map(scrollNode);
const navigation=vm.createContext({
  CURRENT_USER:{role:'student'},VIEW_STUDENT:null,MODE:'cloud',NAVIGATION_SEQ:0,
  window:{},console,closeModal(){},closeTrainerProgress(){},canSelfManagePlan:()=>false,finishBoot(){},
  requestAnimationFrame:fn=>frames.push(fn),
  document:{scrollingElement:page,querySelectorAll:()=>screens,getElementById:id=>id==='app'?application:screens.find(node=>node.id===id)}
});
vm.runInContext(['isNavigationCurrent','resetScreenScroll','showScreen'].map(source).join('\n'),navigation);
for(const screen of screens){
  for(const node of [page,application,screen]){node.scrollTop=72;node.scrollLeft=12;}
  assert(navigation.showScreen(screen.id));
  for(const node of [page,application,screen])assert.equal(node.scrollTop+node.scrollLeft,0,screen.id);
  for(const node of [page,application,screen])node.scrollTop=40;
  frames.shift()();
  for(const node of [page,application,screen])assert.equal(node.scrollTop,0,screen.id);
}
application.scrollTop=120;
assert.equal(navigation.showScreen(screens[0].id,-1),false);
assert.equal(application.scrollTop,120);

console.log(`PASS student workflow: authenticated report period, guided registration and deferred return, owner-scoped offline retry, diet weekday selection, Myo Reps ranges and ${screenIds.length} screen entries.`);
