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
const reportModule=read('modules/student-report-submit-reconciliation-v10_10_57.js').replace(
  "  install();[120,500,1400].forEach(delay=>setTimeout(install,delay));",
  `  window.testWeeklyReceipt=async id=>readWeeklyReceipt(id,reportScope(),await authHeaders());
  window.testReportCommit=()=>restCommit([{}],'teste',reportScope());`
);
vm.runInContext(reportModule,report);
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
assert.equal(reportCalls.length,4);
assert(reportCalls.some(([url])=>url.endsWith('/protocolReviewSchedules/student')));
const monthlyQuery=reportCalls.map(([,options])=>options.body?JSON.parse(options.body).structuredQuery:null).find(query=>query?.from?.[0]?.collectionId==='questionnaires');
assert.deepEqual(monthlyQuery.where.compositeFilter.filters,[
  {fieldFilter:{field:{fieldPath:'studentId'},op:'EQUAL',value:{stringValue:'student'}}},
  {fieldFilter:{field:{fieldPath:'reportType'},op:'EQUAL',value:{stringValue:'monthly'}}}
]);
assert.equal(fresh.monthlyReports.length,1);
assert(reportCalls.every(([,options])=>options.headers.Authorization==='Bearer synthetic-id-token'&&options.headers['X-Firebase-AppCheck']==='synthetic-app-check'));

// The receipt query can establish absence without reading a missing document.
const receipt=await report.window.testWeeklyReceipt('w');
assert.equal(receipt.name,'projects/example/databases/(default)/documents/weeklyCheckins/w');
const receiptQuery=JSON.parse(reportCalls.at(-1)[1].body).structuredQuery;
assert.deepEqual(receiptQuery.where.compositeFilter.filters,[
  {fieldFilter:{field:{fieldPath:'studentId'},op:'EQUAL',value:{stringValue:'student'}}},
  {fieldFilter:{field:{fieldPath:'__name__'},op:'EQUAL',value:{referenceValue:receipt.name}}}
]);
assert.equal(reportCalls.at(-1)[1].headers['X-Firebase-AppCheck'],'synthetic-app-check');
report.fetch=async()=>({ok:true,json:async()=>[{readTime:'2026-11-01T10:30:00Z'}]});
assert.equal(await report.window.testWeeklyReceipt('w'),null);
report.fetch=async()=>({ok:true,json:async()=>[]});
await assert.rejects(report.window.testWeeklyReceipt('w'),/não foi confirmada/);
for(const [status,definite] of [[403,true],[409,true],[408,false],[429,false],[503,false]]){
  report.fetch=async()=>({ok:false,status,json:async()=>({error:{message:'synthetic'}})});
  await assert.rejects(report.window.testReportCommit(),error=>error.status===status&&error.definite===definite);
}
report.fetch=async()=>({ok:true,json:async()=>({})});
await assert.rejects(report.window.testReportCommit(),error=>error.definite===false,'An incomplete success response must be reconciled');
report.fetch=async()=>({ok:true,json:async()=>({writeResults:[{}],commitTime:'2026-11-01T10:30:00Z'})});
await report.window.testReportCommit();

const currentDay={id:'day',name:'Dia A'};
const priorDay={id:'prior',name:'Anterior'},laterDay={id:'later',name:'Dia B'};
const exercises=['first','second','third'].map(id=>({id,sessions:[]}));
const priorExercise={id:'prev',sessions:[{date:'2026-11-14',week:1,sets:[{weight:10,reps:8}]}]};
const otherExercise={id:'later-exercise',sessions:[]};
const workout={id:'w',isActive:true,startDate:'2026-11-01',exercises};
let activeScreen='screen-home',date='2026-11-15',confirmAction;
const actions=new Set();
const stored=new Map(),remote=new Map(),messages=[],opened=[];
const progress=vm.createContext({
  console,CURRENT_USER:{uid:'student',role:'student',status:'active'},MODE:'cloud',ACCESS_MODE:'cloud',
  auth:{currentUser:{uid:'student'}},navigator:{onLine:true},AUTH_STATE_REVISION:1,
  CUR_WORKOUT:'w',CUR_DAY:'Dia A',CUR_EX:null,LAST_SESSION_WEEK:1,
  openCalDay:null,getCalendarMonthData:null,openExerciseFromCalendar:null,openCalendar:null,
  window:{addEventListener(){}},document:{createElement:()=>({}),head:{appendChild(){}},addEventListener(){},getElementById(){return null;},querySelector(){return null;}},
  localStorage:{getItem:id=>stored.get(id),setItem:(id,value)=>stored.set(id,value),removeItem:id=>stored.delete(id)},
  Date,today:()=>date,v104CycleWeek:()=>1,normalizedName:value=>String(value).toLowerCase(),
  activeScreenId:()=>activeScreen,getWorkouts:()=>[workout],activeWorkoutId:()=>workout.id,
  getWorkoutDays:()=>[priorDay,currentDay,laterDay],getW:()=>workout,
  exercisesForDay:(_workout,name)=>name===currentDay.name?exercises:name===priorDay.name?[priorExercise]:[otherExercise],
  showToast:message=>messages.push(message),
  beginAction:name=>{if(actions.has(name))return false;actions.add(name);return true;},endAction:name=>actions.delete(name),
  showConfirm:(_title,message,confirmed)=>{messages.push(message);confirmAction=confirmed;},
  openLogSessionModal:()=>opened.push([progress.CUR_WORKOUT,progress.CUR_EX]),
  openWorkout:()=>{throw new Error('Unexpected navigation to the workout tab');},
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
const storeKey='team_bulls_workout_progress_v2_student';
const guide=()=>JSON.parse(stored.get(storeKey)||'null')?.guide;
assert(await api.startGuidedFromHome());
assert.equal(activeScreen,'screen-home','Starting at home must not navigate');
assert.equal(guide().dayId,'day','Prior session selects the next unfinished day');
assert.equal(guide().exerciseId,'first');
await api.syncPending('student');
assert.equal(api.finishExercise(),false,'Cannot advance with no sets logged');
assert.deepEqual(opened.at(-1),['w','first'], 'Registration uses the existing session editor with the prescribed exercise');
activeScreen='screen-day';progress.CUR_DAY='Anterior';
assert.equal(await api.startGuidedWorkout(),false,'The same account cannot start another day');
progress.CUR_DAY='Dia A';
assert(await api.startGuidedWorkout());
assert(api.postponeExercise());
assert.match(messages.at(-1),/ordem foi planejada/);
assert.equal(guide().exerciseId,'first','The order changes only after confirmation');
assert(await confirmAction());
assert(api.pauseGuided());
assert.equal(guide().status,'active');
assert(await confirmAction());
assert.equal(guide().status,'paused');
assert.equal(guide().exerciseId,'second');
progress.CURRENT_USER={uid:'other',role:'student',status:'active'};
assert.equal(api.dayState(workout,currentDay),'','The saved guide is scoped to its student');
progress.CURRENT_USER={uid:'student',role:'student',status:'active'};
activeScreen='screen-home';
assert(await api.startGuidedFromHome());
assert.equal(guide().status,'active');
for(const id of ['second','third','first']){
  assert.equal(guide().exerciseId,id);
  exercises.find(item=>item.id===id).sessions.push({date:'2026-11-15',week:1,sets:[{weight:10,reps:8}]});
  assert(await api.finishExercise());
}
assert.equal(guide().done.length,3);
progress.navigator.onLine=false;
assert(await api.finishGuided());
assert.equal(guide(),null);
assert.equal(Object.values(JSON.parse(stored.get(storeKey)).completions)[0].completedDate,'2026-11-15');
assert.equal(await api.syncPending('student'),false);
assert.equal(api.diagnostics().pending,1);
progress.navigator.onLine=true;
assert.equal(await api.syncPending('student'),true);
assert.equal(remote.size,2);
assert.equal(api.diagnostics().pending,0);
assert.equal(await api.syncPending('student'),true);
assert.equal(remote.size,2);
assert.equal(await api.startGuidedFromHome(),false,'A finished workout is not offered again from Home on the same day');

date='2026-11-16';activeScreen='screen-day';
progress.CUR_DAY='Dia A';
assert.equal(await api.startGuidedWorkout(),false);
assert.equal(guide(),null);
assert.match(messages.at(-1),/último treino que você concluiu/);
assert.match(messages.at(-1),/Dia B/);
const originalCompletion=JSON.stringify(JSON.parse(stored.get(storeKey)).completions);
exercises[0].sessions.push({id:'before-repeat',date,week:1,sets:[{weight:10,reps:8}]});
assert(await confirmAction());
assert.equal(guide().repeat,true);
assert.equal(api.finishExercise(),false,'Earlier series from the same date cannot advance the repeat');
assert.equal(await api.finishGuided(),false);
assert(await confirmAction());
assert.equal(guide(),null);
assert.equal(JSON.stringify(JSON.parse(stored.get(storeKey)).completions),originalCompletion,'Repeating leaves the original cycle completion intact');

progress.CUR_DAY='Anterior';
assert.equal(await api.startGuidedWorkout(),false);
assert.match(messages.at(-1),/sequência planejada pelo treinador.*Dia B/);
activeScreen='screen-home';
await confirmAction();
assert.equal(guide(),null,'Changing screens invalidates the start confirmation');
activeScreen='screen-day';progress.CUR_DAY='Dia B';
assert(await api.startGuidedWorkout(),'The recommended day starts immediately from the day screen');
assert(api.cancelGuided());
assert(guide());
assert(await confirmAction());
assert.equal(guide(),null);
assert.equal(priorExercise.sessions.length,1,'Cancelling does not remove logged series');

progress.CUR_DAY='Anterior';
assert.equal(await api.startGuidedWorkout(),false);
assert(await confirmAction());
assert.equal(await api.finishGuided(),false,'An early end must ask for confirmation');
assert.match(messages.at(-1),/prejudicar sua evolução/);
assert(await confirmAction());
assert.equal(guide(),null);

progress.CUR_DAY='Dia A';
assert.equal(await api.startGuidedWorkout(),false);
assert.match(messages.at(-1),/já concluiu este treino nesta semana/);
assert(await confirmAction());
assert.equal(await api.finishGuided(),false);
assert(await confirmAction());
assert.equal(await api.startGuidedWorkout(),false);
assert.match(messages.at(-1),/último treino que você concluiu/,'A finished repeat becomes the most recent without advancing the cycle');

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
