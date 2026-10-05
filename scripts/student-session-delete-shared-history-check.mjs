import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const core=fs.readFileSync('app_v10_10_9_core.js','utf8');
const patch=fs.readFileSync('modules/destructive-actions-supply-fix-v10_10_29.js','utf8');
const pending=fs.readFileSync('modules/pending-session-mutations-v10_10_34.js','utf8');

// Execute the actual history functions with two live workouts and one orphan.
const nameFunction=core.match(/function normalizedName\(value\)\{[^\n]+\}/)?.[0];
const start=core.indexOf('let HISTORY_BY_NAME={};');
const end=core.indexOf('function sessionMaxWeight(',start);
assert.ok(nameFunction&&start>0&&end>start);
const oldSession={id:'old-session',exerciseId:'old-exercise',exerciseName:'Supino reto',date:'2026-09-01',sets:[{weight:80,reps:8}]};
const currentSession={id:'current-session',exerciseId:'new-exercise',exerciseName:'Supino reto',date:'2026-10-01',sets:[{weight:90,reps:6}]};
const orphan={id:'orphan-session',exerciseId:'deleted-exercise',exerciseName:'  SUPINO   RETO ',date:'2026-08-01',sets:[{weight:70,reps:10}]};
const workouts=[
  {id:'workout-1',name:'Treino 1',exercises:[{id:'old-exercise',name:'Supino reto',sessions:[oldSession]}]},
  {id:'workout-2',name:'Treino 2',exercises:[{id:'new-exercise',name:'Supino reto',sessions:[currentSession]},{id:'other',name:'Supino inclinado',sessions:[]}]}
];
const historyContext={getWorkouts:()=>workouts,createdMillis:()=>0};
vm.createContext(historyContext);
vm.runInContext(`${nameFunction}\n${core.slice(start,end)}`,historyContext);
vm.runInContext('HISTORY_BY_NAME=buildHistoryByName(input)',Object.assign(historyContext,{input:[oldSession,currentSession,orphan]}));
for(const exercise of [workouts[0].exercises[0],workouts[1].exercises[0]]){
  const rows=historyContext.getSharedSessions(exercise);
  assert.deepEqual([...rows.map(row=>row.id)].sort(),['current-session','old-session','orphan-session']);
  assert.equal(rows.find(row=>row.id==='old-session')._wName,'Treino 1');
  assert.equal(rows.find(row=>row.id==='orphan-session')._archived,true);
  assert.equal(rows.filter(row=>row.id==='old-session').length,1,'live and archive copies must not duplicate');
}
assert.equal(historyContext.getSharedSessions(workouts[1].exercises[1]).length,0,'a different exercise remains separate');

// Execute the outer delete wrapper: a pending record must reach the inner
// cancellation flow, without attempting a flush that can never complete offline.
let cancelled=0,flushed=0,toasts=[];
const inner=async id=>{cancelled++;return id==='pending-session';};
inner.__tbPendingSessionMutation=true;
const noop=()=>{};
const deleteContext={
  console,Promise,MODE:'cloud',CURRENT_USER:{uid:'student-a',role:'student'},
  performDeleteSession:inner,
  window:{TeamBullsSessionPerformance:{hasPending:id=>id==='pending-session',flush:async()=>{flushed++;}},addEventListener:noop},
  document:{readyState:'complete',getElementById:()=>null,querySelector:()=>null,createElement:()=>({}),head:{appendChild:noop}},
  storageGet:()=>JSON.stringify([{id:'pending-session',userId:'student-a'}]),
  showToast:(message,error)=>toasts.push({message,error}),setTimeout:noop
};
vm.createContext(deleteContext);
vm.runInContext(patch,deleteContext);
assert.equal(await deleteContext.performDeleteSession('pending-session'),true);
assert.equal(cancelled,1,'pending deletion must call the cancellation layer');
assert.equal(flushed,0,'the old queue guard must not block pending deletion');
assert.equal(toasts.some(item=>item.message.includes('não foi sincronizado')),false);
assert.match(pending,/discardPending\?\.\(sessionId\)/,'the inner cancellation removes the queued write');
console.log('APROVADO — aluno exclui sessão pendente e vê histórico do mesmo exercício em todos os treinos.');

