import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const core=fs.readFileSync('app_v10_10_9_core.js','utf8');
const block=core.slice(core.indexOf('// Trainer progression: read-only history'));
function extract(name){const start=core.indexOf(`function ${name}(`),end=core.indexOf('\nfunction ',start+1);return core.slice(start,end);}
const elements=new Map();
const element=id=>{if(!elements.has(id))elements.set(id,{value:'',innerHTML:'',textContent:'',hidden:false,classList:{contains:()=>false,remove(){}},remove(){elements.delete(id);}});return elements.get(id);};
let reads=0,resolveRead;
const context=vm.createContext({console,Map,Set,Date,Number,String,Math,Array,
  CURRENT_USER:{role:'trainer',uid:'coach'},VIEW_STUDENT:{uid:'a',name:'Aluno A',workouts:[]},VIEW_STUDENT_EXERCISE:null,MODE:'cloud',EDIT_EXERCISE_ID:null,
  document:{getElementById:id=>element(id),createElement:()=>({classList:{remove(){}},remove(){}}),body:{appendChild(){}}},
  normalizedName:s=>String(s||'').trim().toLowerCase(),
  sanitizeHistorySession:s=>({...s,sets:s.sets.map(x=>({...x}))}),sessionIdentity:s=>'id:'+s.id,
  sessionFingerprint:JSON.stringify,createdMillis:s=>s.createdAt?.seconds*1000||0,
  exerciseUsesResistedTime:e=>e.time===true,fmt:s=>s,
  esc:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
  fetchCloudSessions:()=>{reads++;return new Promise(r=>resolveRead=r);},loadSessionArchive:()=>[],openModal(){}
});
vm.runInContext(extract('mergeHistorySessions')+'\n'+extract('sessionsFromWorkoutTree')+'\n'+block,context);
const run=code=>vm.runInContext(code,context);
context.sessions=[
 {id:'one',date:'2026-01-01',week:1,exerciseId:'e',exerciseName:'Agachamento',sets:[{weight:0,reps:10},{weight:20,reps:8}]},
 {id:'two',date:'2026-02-01',week:2,exerciseId:'e',exerciseName:'Agachamento',sets:[{weight:30,reps:10},{weight:25,reps:10},{weight:20,reps:10}],note:'<img src=x onerror=evil()>'},
 {id:'orphan',date:'2025-12-01',exerciseName:'Removido',sets:[{weight:50,reps:10}]},
 {id:'variant',date:'2026-02-02',exerciseId:'e',exerciseName:'Agachamento',performedExerciseName:'Leg press',sets:[{weight:100,reps:8}]},
 {id:'timed',date:'2026-02-03',exerciseId:'t',exerciseName:'Prancha',sets:[{weight:0,reps:30}]}
];
context.workouts=[{id:'w',name:'Plano atual',exercises:[{id:'e',name:'Agachamento',sessions:[context.sessions[0]]},{id:'t',name:'Prancha',time:true,sessions:[]}]}];
run('var rows=trainerProgressRows(sessions,workouts);var summary=trainerProgressSummary(rows.filter(r=>r.name==="Agachamento"));');
assert.equal(run('rows.length'),5,'Duplicate tree/archive sessions must not be counted twice');
assert.equal(run('rows[0].name'),'Removido','Orphan history remains available');
assert.equal(run('summary.load.delta'),10);assert.equal(run('summary.reps.delta'),12);assert.equal(run('summary.sets.delta'),1);
assert.equal(run('summary.volume.delta'),590);
assert.equal(run('rows.find(r=>r.name==="Prancha").volume'),null,'Time must not become repetition volume');
assert.notEqual(run('rows.find(r=>r.name==="Leg press").group'),run('rows.find(r=>r.name==="Agachamento").group'));
assert.equal(run('trainerProgressSummary([])'),null);
assert.equal(run('trainerProgressSummary([{max:0,reps:1,count:1,volume:0},{max:5,reps:1,count:1,volume:5}]).load.percent'),null);
run('TRAINER_PROGRESS={uid:"a",trainerUid:"coach",rows,workouts,limit:50,source:"cache"};renderTrainerProgress();');
assert(element('tb-progress-content').innerHTML.includes('&lt;img'),'User notes must be escaped');
element('tb-progress-from').value='2026-02-01';element('tb-progress-to').value='2026-02-01';run('renderTrainerProgress(true)');
assert(element('tb-progress-content').innerHTML.includes('1 registros'),'Date boundaries include the full selected day');
element('tb-progress-from').value='2026-03-01';run('renderTrainerProgress()');
assert(element('tb-progress-content').textContent.includes('data inicial'));
element('tb-progress-from').value='';element('tb-progress-to').value='';
run('TRAINER_PROGRESS.rows=Array.from({length:105},(_,i)=>({...rows[1],id:String(i)}));renderTrainerProgress()');
assert.equal((element('tb-progress-content').innerHTML.match(/<details /g)||[]).length,50);assert.equal(element('tb-progress-more').hidden,false);
run('TRAINER_PROGRESS.limit=150;renderTrainerProgress()');assert.equal((element('tb-progress-content').innerHTML.match(/<details /g)||[]).length,105);
run('CURRENT_USER.role="student"');await run('openTrainerProgress()');assert.equal(reads,0,'Student must not trigger history access');
run('CURRENT_USER.role="trainer";TRAINER_PROGRESS={uid:"a",trainerUid:"coach",rows:[],workouts:[],source:"",limit:50};');
const pending=run('refreshTrainerProgress()');run('VIEW_STUDENT={uid:"b"};');resolveRead({sessions:context.sessions,source:'server'});await pending;
assert.equal(run('TRAINER_PROGRESS.rows.length'),0,'Late responses cannot leak into another student');
run('VIEW_STUDENT={uid:"a"};');const closed=run('refreshTrainerProgress()');run('closeTrainerProgress()');resolveRead({sessions:context.sessions,source:'server'});await closed;assert.equal(run('TRAINER_PROGRESS'),null);
const html=fs.readFileSync('index.html','utf8');assert.equal((html.match(/class="btn-add-set tb-progress-access"/g)||[]).length,4);assert(html.includes('tb-progress-edit-access'));
assert(!/cloudWrite|db\.|firebase\./.test(block),'Panel must not write to Firestore');
console.log('PASS trainer progression: aggregation, orphan history, variants, units, dates, pagination, escaping, role guard and stale/closed requests.');
