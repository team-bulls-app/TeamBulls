import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the production functions with controlled async reads and no DOM rendering.
function harness(file, expose, extra={}) {
  const context=vm.createContext({console, Date, structuredClone,
    CURRENT_USER:{uid:'trainer-1',role:'trainer'},MODE:'cloud',db:{},
    VIEW_STUDENT:{uid:'a'},today:()=> '2026-10-15',
    document:{readyState:'loading',addEventListener(){}},
    addEventListener(){},showScreen(){},confirmLogout(){this.CURRENT_USER=null;},
    ...extra});
  context.window=context;
  const code=fs.readFileSync(file,'utf8');
  vm.runInContext(code.replace(/\}\)\(\);\s*$/,`${expose}\n})();`),context,{filename:file});
  return context;
}
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const pending=[];
const progress=harness('modules/student-progress-hub-v10_10_42.js',`
  render=()=>{};
  patchLogout();
  window.test={sessionCount,longestTrainingStreak,hasHistoricalLoadProgress,cycleBounds,load,
    snapshot:()=>({state,loading,loadingUid})};`,{
  CURRENT_USER:{uid:'a',role:'student'},
  db:{collection(){return{doc(){return{};},where(){return{};}};}},
  cloudGet(){const read=deferred();pending.push(read);return read.promise;}
});
const sessions=[
  {date:'2026-10-01',workoutId:'w',exerciseId:'x',sets:[{weight:10}]},
  {date:'2026-10-01',workoutId:'w',exerciseId:'y',sets:[{weight:10}]},
  {date:'2026-10-08',workoutId:'w',exerciseId:'x',sets:[{weight:20}]},
  {date:'2026-10-15',workoutId:'w',exerciseId:'x',sets:[{weight:5}]}
];
assert.equal(progress.test.sessionCount(sessions),3,'exercise documents must count as workouts');
assert.equal(progress.test.hasHistoricalLoadProgress(sessions),true,'a deload must not erase a past achievement');
assert.equal(progress.test.longestTrainingStreak(['2026-09-07','2026-09-14','2026-09-28','2026-10-05'].map(date=>({date}))),2);
assert.equal(progress.test.longestTrainingStreak(['2026-09-07','2026-09-14','2026-09-21','2026-09-28'].map(date=>({date}))),4);
const first=progress.test.load();
progress.confirmLogout();
progress.CURRENT_USER={uid:'b',role:'student'};
const second=progress.test.load();
pending.slice(0,3).forEach(p=>p.resolve({exists:false,docs:[]}));
await first;
assert.equal(progress.test.snapshot().state,null,'old account response must be discarded');
assert.equal(progress.test.snapshot().loadingUid,'b','old response must not unlock new account load');
pending.slice(3).forEach(p=>p.resolve({exists:false,docs:[]}));
await second;
assert.equal(progress.test.snapshot().loading,false);

const data=harness('modules/trainer-intelligence-data-v10_10_42.js','');
const api=data.TeamBullsTrainerIntelligenceData;
assert.equal(api.trainingSessionCount(sessions),3);
const schedule={startDate:'2026-09-01',intervalWeeks:4,lastCompletedCycle:0};
assert.equal(api.currentCycleBounds(schedule).key,progress.test.cycleBounds(schedule).key);
assert.equal(api.currentCycleBounds({...schedule,lastCompletedCycle:1}).key,'2026-09-01:2');
const row={student:{uid:'a'},checkinSchedule:null,protocolSchedule:schedule};
const old={activity:[{studentId:'a',type:'weekly_checkin',read:false}],payments:[]};
const fresh={sessions,feedbacks:[],activity:[],payments:[]};
assert.equal(api.analyze(row,old,fresh).newReport,false,'fresh student history must replace stale global slice');
assert.equal(api.analyze(row,{activity:[{studentId:'a',type:'payment',read:false}],payments:[]}).newReport,false);

const reads=[];
const insights=harness('modules/trainer-student-insights-v10_10_42.js',`
  render=()=>{};ensureEntry=()=>{};patchLogout();
  window.test={snapshot:()=>({studentId,bundle,loading}),comparison,goalProgress,
    setBundle:value=>{bundle=value;}};`,{
  TeamBullsTrainerIntelligenceData:{...api,loadDeepStudent(id){const d=deferred();reads.push({id,...d});return d.promise;}}
});
const openA=insights.TeamBullsTrainerStudentInsights.open();
insights.VIEW_STUDENT={uid:'b'};
const openB=insights.TeamBullsTrainerStudentInsights.open();
reads[1].resolve({studentId:'b'});await openB;
reads[0].resolve({studentId:'a'});await openA;
assert.equal(insights.test.snapshot().bundle.studentId,'b');
assert.equal(insights.test.snapshot().loading,false);
insights.test.setBundle({sessions,checkins:[{submittedDate:'2026-10-15',weight:80},{submittedDate:'2026-10-01'}],protocolSchedule:{...schedule,lastCompletedCycle:1,cycleGoals:{cycleKey:'2026-09-01:1',sessionsTarget:99}}});
assert.equal(insights.test.comparison().weightDelta,null,'missing weight must not become a false delta');
assert.equal(insights.test.goalProgress().sessions,3);
assert.equal(insights.test.goalProgress().g.sessionsTarget,undefined,'prior cycle goals must not leak into this cycle');

const dashboardRead=deferred();
const command=harness('modules/trainer-command-center-v10_10_42.js',`
  render=()=>{};patchLogout();`,{
  TeamBullsTrainerIntelligenceData:{loadDashboard:()=>dashboardRead.promise}
});
const load=command.TeamBullsTrainerCommandCenter.refresh();
command.confirmLogout();
dashboardRead.resolve({rows:[]});await load;
assert.equal(command.TeamBullsTrainerCommandCenter.snapshot().loaded,false,'late radar response must not repopulate state after logout');
console.log('APROVADO — inteligência: sessões agrupadas, conquista histórica, semanas consecutivas, ciclo, dados frescos, peso ausente e respostas tardias de aluno/logout.');
