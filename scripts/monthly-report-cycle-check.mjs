import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const read=file=>fs.readFileSync(file,'utf8');
const core=read('app_v10_10_9_core.js'),source=read('modules/monthly-report-cycle-v10_10_59.js');
const tables={users:new Map(),protocolReviewSchedules:new Map(),questionnaires:new Map(),checkinSchedules:new Map(),weeklyCheckins:new Map(),notifications:new Map(),feedback:new Map()};
let date='2026-09-20',writes=0,failedCollection='';
const events=new Map();
const context={console,MODE:'local',CURRENT_USER:{uid:'trainer-a',role:'trainer'},auth:{currentUser:{uid:'trainer-a'}},
  today:()=>date,fmt:x=>x,withTimeout:p=>p,cloudGet:ref=>ref.get(),cloudWrite:p=>p,
  firebase:{firestore:{FieldValue:{serverTimestamp:()=>({seconds:1000})}}},
  buildWeeklyCheckinQuestions:()=>({questions:['Como foi o período?','Peso atual?'],sectionAt:{0:'Evolução'}}),
  setTimeout:()=>0,clearTimeout(){},showToast(){},
  window:{addEventListener(name,fn){events.set(name,fn);}},
  document:{getElementById:()=>null,querySelector:()=>null,addEventListener(){}}};
const own=uid=>context.CURRENT_USER.role==='trainer'?tables.protocolReviewSchedules.get(uid)?.trainerId===context.CURRENT_USER.uid:uid===context.CURRENT_USER.uid;
function collection(name,filters=[]){
 return{
  where:(key,op,value)=>collection(name,[...filters,[key,value]]),
  limit(n){return{...this,get:async()=>({docs:(await this.get()).docs.slice(0,n)})};},
  async get(){if(name===failedCollection)throw new Error('network unavailable');return{docs:[...tables[name]].filter(([,row])=>filters.every(([key,value])=>row[key]===value)).map(([id,row])=>({id,data:()=>({...row})}))};},
  doc:id=>({
    async get(){
      if(name===failedCollection)throw new Error('network unavailable');
      if(name==='questionnaires'&&!tables[name].has(id))throw new Error('Rules 28 deny missing resource reads');
      if(name==='protocolReviewSchedules'&&!own(id))throw new Error('permission-denied');
      return{exists:tables[name].has(id),data:()=>({...tables[name].get(id)})};
    },
    async set(data){
      assert.equal(name,'questionnaires','automatic writes only create real questionnaire requests');
      if(context.CURRENT_USER.role!=='trainer'||!own(data.studentId)||data.trainerId!==context.CURRENT_USER.uid||tables[name].has(id))throw new Error('permission-denied');
      writes++;tables[name].set(id,structuredClone(data));
    }
  })
 };
}
context.db={collection};vm.createContext(context);
vm.runInContext(core.slice(core.indexOf('function stableHash('),core.indexOf('function sessionFingerprint(')),context);
vm.runInContext(core.slice(core.indexOf('function addDaysIso('),core.indexOf('async function fetchWeeklyCheckins(')),context);
vm.runInContext(source,context);
const api=context.window.TeamBullsMonthlyReports;
const schedule={studentId:'student-a',trainerId:'trainer-a',startDate:'2026-08-24',intervalWeeks:4,lastCompletedCycle:0,lastCompletedDate:''};
tables.protocolReviewSchedules.set('student-a',schedule);context.MODE='cloud';
const [first,second]=await Promise.all([api.ensureForStudent('student-a'),api.ensureForStudent('student-a')]);
assert.equal(first.id,second.id);assert.equal(writes,1,'concurrent tabs cannot create two requests or overwrite');
assert.equal(first.dueDate,'2026-09-21');assert.equal(first.answered,false);assert.equal(first.answers,null);
assert.equal(first.requiredPhotoCount,6);assert.equal(first.requestMode,'full');assert.equal(first.questions.length,2);
assert.equal(api.status(first),'scheduled','future monthly does not become an overdue response');
assert.equal(tables.checkinSchedules.size,0,'monthly preparation does not change weekly scheduling');
assert.deepEqual(tables.protocolReviewSchedules.get('student-a'),schedule,'preparation does not complete the trainer review');

context.CURRENT_USER={uid:'student-a',role:'student',trainerId:'trainer-a'};context.auth.currentUser.uid='student-a';
await assert.rejects(()=>api.ensureForStudent('student-a'),/treinador/);
await assert.rejects(()=>api.assertAvailable(first),/liberado/);
assert.equal((await api.pending([first], 'student-a')).length,0);
date='2026-09-21';assert.equal(api.status(first),'pending');await api.assertAvailable(first);
assert.equal((await api.pending([first], 'student-a')).length,1,'due date alone unlocks the existing request without trainer online');
context.CURRENT_USER={uid:'student-b',role:'student',trainerId:'trainer-a'};context.auth.currentUser.uid='student-b';
await assert.rejects(()=>api.assertAvailable(first),/sessão/);
context.CURRENT_USER={uid:'student-a',role:'student',trainerId:'trainer-a'};context.auth.currentUser.uid='student-a';
tables.protocolReviewSchedules.set('student-a',{...schedule,intervalWeeks:5});
await assert.rejects(()=>api.assertAvailable(first),/ciclo/,'rescheduled form must not submit to another cycle');
assert.equal(api.status({...first,answered:true}),'answered','answered history remains visible after schedule edits');

context.CURRENT_USER={uid:'trainer-a',role:'trainer'};context.auth.currentUser.uid='trainer-a';
const rescheduled=await api.ensureForStudent('student-a');assert.notEqual(rescheduled.id,first.id);
assert.equal(rescheduled.dueDate,'2026-09-28');assert.equal(tables.questionnaires.size,2,'rescheduling never deletes the old request');
tables.questionnaires.set(first.id,{...first,answered:true,answers:['Bem','80'],photoIds:['1','2','3','4','5','6']});
tables.protocolReviewSchedules.set('student-a',{...schedule,lastCompletedDate:'2026-09-23',lastCompletedCycle:1});
const next=await api.ensureForStudent('student-a');assert.equal(next.dueDate,'2026-10-21');assert.notEqual(next.id,first.id);
assert.equal(tables.questionnaires.get(first.id).answers[0],'Bem');
const before=writes;await api.ensureForStudent('student-a');assert.equal(writes,before);
context.CURRENT_USER={uid:'trainer-b',role:'trainer'};context.auth.currentUser.uid='trainer-b';
await assert.rejects(()=>api.ensureForStudent('student-a'),/permission|carteira/);
context.CURRENT_USER={uid:'trainer-a',role:'trainer'};context.auth.currentUser.uid='trainer-a';
tables.users.set('student-a',{role:'student',trainerId:'trainer-a',status:'active'});
tables.users.set('student-c',{role:'student',trainerId:'trainer-a',status:'active'});
tables.users.set('paused',{role:'student',trainerId:'trainer-a',status:'inactive'});
tables.users.set('outsider',{role:'student',trainerId:'trainer-b',status:'active'});
tables.protocolReviewSchedules.set('student-c',{...schedule,studentId:'student-c'});
const beforeSync=writes;assert.equal(await api.sync(),true);assert.equal(writes,beforeSync+1,'existing portfolios prepare every active owned cycle once');
assert.ok(![...tables.questionnaires.values()].some(q=>['paused','outsider'].includes(q.studentId)));

// Run the real Central loader and real weekly calculator, including long history.
context.CURRENT_USER={uid:'student-a',role:'student',trainerId:'trainer-a'};context.auth.currentUser.uid='student-a';
context.navigator={onLine:true};context.fetchWeeklyCheckins=()=>[];context.openWeeklyCheckinModal=()=>{};
vm.runInContext(read('modules/weekly-report-integrity-v10_10_58.js'),context);
context.ensureReportCycleRuntime=async()=>{};context.student=()=>context.CURRENT_USER;context.uidOf=user=>user.uid;
context.studentUid=()=>context.CURRENT_USER.uid;context.timestamp=value=>value?.seconds||0;context.notifications=[];
const home=read('modules/student-home-profile-v10_10_12.js');
vm.runInContext(home.slice(home.indexOf('  async function loadNotifications('),home.indexOf('\n  function renderNotifications()'))+'\nwindow.loadNotices=loadNotifications;',context);
tables.protocolReviewSchedules.set('student-a',schedule);api.remember('student-a',schedule);
tables.questionnaires.set(first.id,{...first,answered:false,answers:null});
for(let i=0;i<110;i++)tables.questionnaires.set('old-'+i,{studentId:'student-a',answered:true});
tables.questionnaires.set('requested-now',{studentId:'student-a',trainerId:'trainer-a',answered:false});
tables.checkinSchedules.set('student-a',{nextDueDate:'2026-09-14',intervalDays:7});
tables.weeklyCheckins.set('weekly-sent',{studentId:'student-a',requestKey:'scheduled:2026-09-14',requestKind:'scheduled',dueDate:'2026-09-14',submittedDate:'2026-09-20'});
date='2026-09-23';
let notices=await context.window.loadNotices();
assert.ok(notices.some(item=>item.id===first.id&&item.title==='Relatório mensal pendente'));
assert.ok(notices.some(item=>item.id==='requested-now'),'pending report cannot disappear behind 80/100 historical docs');
assert.ok(!notices.some(item=>item.id==='weekly-checkin'),'stale nextDueDate cannot resurrect a fulfilled weekly period');
tables.weeklyCheckins.clear();notices=await context.window.loadNotices();
assert.ok(notices.some(item=>item.id==='weekly-checkin'),'due weekly and monthly remain independently available');
tables.checkinSchedules.set('student-a',{nextDueDate:'2026-09-14',enabled:false});
notices=await context.window.loadNotices();assert.ok(!notices.some(item=>item.id==='weekly-checkin'));
assert.ok(notices.some(item=>item.id===first.id),'monthly is independent of weekly plan entitlement');
failedCollection='questionnaires';notices=await context.window.loadNotices();
assert.ok(notices.some(item=>item.source==='error'&&item.action==='retry'),'failed read must not claim there are no pending reports');
failedCollection='';

// Exercise the real listener: first questionnaire snapshot, later protocol snapshot,
// midnight and app resumption must agree with Central without a new database write.
const listeners=new Map();
const docElement={style:{},dataset:{},classList:{toggle(){}},textContent:''};
context.document={getElementById:id=>id==='tb-home-notice-count'?null:docElement,querySelector:()=>null,addEventListener(){}};
context.ACCESS_MODE='cloud-active';context.V109_PROTOCOL_REVIEW_SCHEDULE=null;context.V109_PROTOCOL_REVIEW_STUDENT='';
context.WEEKLY_CHECKIN_SCHEDULE=null;context.WEEKLY_CHECKINS=[];context.WEEKLY_CHECKIN_REQUEST=null;context.WEEKLY_CHECKIN_STATE_UID='';
context.renderWeeklyCheckinCard=()=>{};
context.v109ProtocolState=s=>s?{pending:api.cycle(s).dueDate<=date,nextDueDate:api.cycle(s).dueDate,weekNumber:4,intervalWeeks:4}:null;
function listenCollection(name){return{where(){return this;},limit(){return this;},onSnapshot(fn){listeners.set(name,fn);return()=>{};},doc:()=>({onSnapshot(fn){listeners.set(name,fn);return()=>{};}})};}
context.db={collection:listenCollection};
date='2026-09-20';api.remember('student-a',undefined);
vm.runInContext(read('modules/student-request-realtime-v10_10_32.js'),context);
listeners.get('questionnaires')({docs:[{id:first.id,data:()=>first}]});
assert.equal(context.window.TeamBullsStudentRequestRealtime.status().counts.questionnaires,0);
listeners.get('protocolReviewSchedules')({exists:true,data:()=>schedule});
assert.equal(context.window.TeamBullsStudentRequestRealtime.status().counts.questionnaires,0);
date='2026-09-21';context.window.TeamBullsStudentRequestRealtime.recompute();
assert.equal(context.window.TeamBullsStudentRequestRealtime.status().counts.questionnaires,1);
assert.equal(context.window.TeamBullsStudentRequestRealtime.status().counts.protocol,0,'trainer review must not count as a second student response');

const loader=read('modules/intelligence-suite-loader-v10_10_42.js');
assert.equal((loader.match(/monthly-report-cycle-v10_10_59.js\?v=10.10.59-monthly1/g)||[]).length,2,'both roles receive the monthly module');
assert.ok(core.includes('await window.TeamBullsMonthlyReports.assertAvailable(report)'));
assert.ok(core.includes('await window.TeamBullsMonthlyReports.ensureForStudent(studentUid)'));
assert.ok(!source.includes('setInterval('));assert.ok(!source.includes('.delete('));
assert.ok(source.includes("db.collection('users').where('trainerId','==',trainerUid).where('role','==','student')"));
assert.ok(!source.includes("db.collection('protocolReviewSchedules').where("),'Rules 28 require per-student schedule reads');
console.log('APROVADO — ciclo mensal automático, concorrência, datas, carteira, histórico, Central e retomada do aluno.');
