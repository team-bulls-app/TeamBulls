import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const core=fs.readFileSync('app_v10_10_9_core.js','utf8');
const start=core.indexOf('async function deleteTsExercise(eid){');
const end=core.indexOf('/* ══════════════════════════════════════════════════',start);
assert(start>=0&&end>start,'Não foi possível localizar a função de exclusão do treinador.');
const deleteSource=core.slice(start,end);

function createHarness({failWrite=false,leaveStudentScreen=false}={}){
  const workout={id:'workout-1',name:'Inferior',exercises:[
    {id:'exercise-1',name:'Extensora',dayName:'A',order:0,sessions:[{id:'session-1',sets:[{weight:20,reps:10}]}]},
    {id:'exercise-2',name:'Agachamento',dayName:'A',order:1,supersetExerciseId:'exercise-1',techniqueIds:['ss','mr'],sessions:[]},
    {id:'exercise-3',name:'Panturrilha',dayName:'B',order:0,sessions:[]}
  ]};
  const student={uid:'student-1',workouts:[workout]};
  const operations=[],alerts=[],renders=[];
  const sandbox={
    VIEW_STUDENT:student,VIEW_STUDENT_WORKOUT:workout,VIEW_STUDENT_DAY:'A',VIEW_STUDENT_EXERCISE:null,
    db:{collection:name=>({doc:id=>({collection:name,id})}),batch:()=>({
      delete:ref=>operations.push({type:'delete',ref}),
      update:(ref,data)=>operations.push({type:'update',ref,data}),
      commit:()=>{if(leaveStudentScreen)sandbox.VIEW_STUDENT=null;return failWrite?Promise.reject(new Error('offline')):Promise.resolve();}
    })},
    beginAction:()=>true,endAction:()=>{sandbox.ended=(sandbox.ended||0)+1;},
    cloudWrite:task=>task,alert:message=>alerts.push(message),
    normalizeExerciseTechniqueIds:value=>Array.isArray(value)?[...value]:[],
    exercisesForDay:(source,day)=>(source?.exercises||[]).filter(exercise=>String(exercise.dayName||'Treino geral').toLowerCase()===String(day||'').toLowerCase()).sort((a,b)=>a.order-b.order),
    getWorkoutDays:()=>[{name:'A'},{name:'B'}],normalizedName:value=>String(value||'').trim().toLowerCase(),
    renderTsDay:()=>renders.push('day'),renderTsWorkout:()=>renders.push('workout'),showScreen:screen=>renders.push(screen),
    showToast:message=>alerts.push(message),console:{error:()=>{}}
  };
  vm.createContext(sandbox);
  vm.runInContext(deleteSource,sandbox);
  return{sandbox,student,workout,operations,alerts,renders};
}

{
  const h=createHarness();
  await h.sandbox.deleteTsExercise('exercise-1');
  assert.deepEqual(h.student.workouts[0].exercises.map(item=>item.id),['exercise-2','exercise-3'],'Exercício removido deve sumir do treino em memória assim que o lote confirmar.');
  assert.equal(h.student.workouts[0].exercises[0].supersetExerciseId,'','A referência da supersérie deve ser limpa junto com a exclusão.');
  assert.deepEqual(h.student.workouts[0].exercises[0].techniqueIds,['mr'],'A técnica de supersérie deve ser removida sem apagar outras técnicas.');
  assert.equal(h.student.workouts[0].exercises[0].order,0,'A ordem visível do dia deve ser compactada.');
  assert.equal(h.student.workouts[0].exercises[0].sessions.length,0,'As sessões dos exercícios restantes devem continuar preservadas.');
  assert.deepEqual(h.renders,['day'],'A tela do dia deve redesenhar logo após a exclusão.');
  assert(h.operations.some(operation=>operation.type==='delete'&&operation.ref.id==='exercise-1'),'O documento do exercício deve continuar sendo excluído no Firestore.');
  assert(!h.operations.some(operation=>operation.ref.collection==='sessions'),'A exclusão não pode escrever ou apagar histórico de sessões.');
  assert.equal(h.sandbox.ended,1,'O bloqueio de ação deve ser liberado ao concluir.');
}

{
  const h=createHarness({leaveStudentScreen:true});
  await h.sandbox.deleteTsExercise('exercise-1');
  assert.deepEqual(h.student.workouts[0].exercises.map(item=>item.id),['exercise-2','exercise-3'],'O modelo capturado deve reconciliar mesmo se a navegação limpar VIEW_STUDENT durante o commit.');
  assert.deepEqual(h.renders,[],'Não deve tentar redesenhar uma tela de aluno que já foi fechada.');
  assert.deepEqual(h.alerts,[],'O retorno tardio não deve mostrar falso erro de exclusão.');
  assert.equal(h.sandbox.ended,1,'O bloqueio de ação deve ser liberado após retorno tardio.');
}

{
  const h=createHarness({failWrite:true});
  await h.sandbox.deleteTsExercise('exercise-1');
  assert.deepEqual(h.student.workouts[0].exercises.map(item=>item.id),['exercise-1','exercise-2','exercise-3'],'Falha real de gravação não pode remover o exercício da tela.');
  assert.deepEqual(h.renders,[],'Falha de gravação não deve redesenhar como se tivesse excluído.');
  assert.match(h.alerts[0]||'',/Erro ao excluir exercício: offline/,'A falha real deve ser informada ao treinador.');
  assert.equal(h.sandbox.ended,1,'O bloqueio de ação deve ser liberado também em caso de erro.');
}

console.log('APROVADO — exclusão atualiza o treino na hora, tolera saída da tela durante o commit e preserva a UI em falha de gravação.');
