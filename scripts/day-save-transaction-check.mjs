import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const core=fs.readFileSync('app_v10_10_9_core.js','utf8');
const from=core.indexOf('function preserveRawWorkoutDayFields(');
const to=core.indexOf('async function deleteDayFolder(',from);
assert(from>=0&&to>from,'Implementação real do salvamento de dias não foi encontrada.');
const saveSource=core.slice(from,to);

function makeHarness({newName='Peito B',failBeforeFirst=false,loseFirstCommitResponse=false}={}){
  const workout={id:'workout-a',userId:'student-a',days:[{id:'day-a',name:'Peito A',muscleGroups:['Peitoral'],frequencyGuidance:'2x por semana',restGuidance:'48h',legacyField:'keep-me'}],exercises:[
    {id:'exercise-a',userId:'student-a',workoutId:'workout-a',dayName:'Peito A'},
    {id:'exercise-other-user',userId:'student-b',workoutId:'workout-a',dayName:'Peito A'},
    {id:'exercise-other-workout',userId:'student-a',workoutId:'workout-b',dayName:'Peito A'}
  ]};
  const persisted={workout:{...workout,days:workout.days.map(day=>({...day}))},exercises:new Map(workout.exercises.map(exercise=>[exercise.id,{...exercise}]))};
  const alerts=[],toasts=[];let transactionCount=0,modalOpen=true;
  const fields={
    'input-day-name':{value:newName},
    'input-day-frequency':{value:'2x por semana'},
    'input-day-rest':{value:'48h'}
  };
  const refs=new Map();
  const refFor=(collection,id)=>{
    const key=`${collection}/${id}`;
    if(!refs.has(key))refs.set(key,{kind:collection==='workouts'?'workout':'exercise',id});
    return refs.get(key);
  };
  const db={
    collection:collection=>({doc:id=>refFor(collection,id)}),
    runTransaction:async callback=>{
      transactionCount++;
      if(failBeforeFirst&&transactionCount===1)throw Object.assign(new Error('denied'),{code:'permission-denied'});
      const writes=[];
      const transaction={
        get:async ref=>{
          if(ref.kind==='workout')return{id:ref.id,ref,exists:true,data:()=>({...persisted.workout,days:persisted.workout.days.map(day=>({...day}))})};
          const data=persisted.exercises.get(ref.id);
          return{id:ref.id,ref,exists:!!data,data:()=>data?{...data}:undefined};
        },
        update:(ref,changes)=>writes.push({ref,changes})
      };
      const result=await callback(transaction);
      for(const {ref,changes} of writes){
        if(ref.kind==='workout')Object.assign(persisted.workout,changes);
        else persisted.exercises.set(ref.id,{...persisted.exercises.get(ref.id),...changes});
      }
      if(loseFirstCommitResponse&&transactionCount===1)throw Object.assign(new Error('network unavailable'),{code:'unavailable'});
      return result;
    }
  };
  const context={
    document:{getElementById:id=>fields[id]||null,querySelectorAll:()=>[{checked:true,dataset:{muscleGroup:'Peitoral'}}]},
    workoutForDayTarget:()=>workout,getWorkoutDays:value=>value.days,
    normalizedName:value=>String(value||'').trim().toLowerCase(),normalizeMuscleGroups:value=>Array.isArray(value)?value:[],
    safeWorkoutGuidance:value=>String(value||'').trim(),normalizeWorkoutDays:value=>Array.isArray(value)?value.map(day=>({...day})):[],
    safeDayName:value=>String(value||'').trim(),dayIdFromName:value=>String(value||'').trim().toLowerCase(),
    exercisesForDay:(value,dayName)=>value.exercises.filter(exercise=>String(exercise.dayName||'Treino geral').toLowerCase()===String(dayName||'').toLowerCase()),
    sortWorkoutExercises:value=>value.exercises,VIEW_STUDENT:{uid:'student-a'},VIEW_STUDENT_DAY:'Peito A',
    CURRENT_USER:{uid:'trainer-a',role:'trainer'},DAY_MODAL_TARGET:'student',EDIT_DAY_NAME:'Peito A',
    db,auth:{currentUser:{uid:'trainer-a'}},navigator:{onLine:true},window:{TeamBullsForegroundWriteResilience:{awaitReady:async()=>true}},
    beginAction:()=>true,endAction(){},cloudWrite:promise=>promise,cloudWriteError:error=>String(error?.message||error),
    isNetworkLikeError:error=>error?.code==='unavailable',alert:message=>alerts.push(message),console:{error(){}},
    closeModal:()=>{modalOpen=false;},renderTsWorkout(){},showToast:message=>toasts.push(message),
    preserveRawWorkoutDayFields:undefined,LOCAL_DB:{},localSave:()=>true,canSelfManagePlan:()=>true,renderWorkout(){}
  };
  vm.createContext(context);
  vm.runInContext(saveSource+'\nthis.runSaveDayFolder=saveDayFolder;',context,{filename:'app_v10_10_9_core.js'});
  return{context,workout,persisted,alerts,toasts,transactionCount:()=>transactionCount,modalOpen:()=>modalOpen};
}

const retryAfterFailure=makeHarness({failBeforeFirst:true});
await retryAfterFailure.context.runSaveDayFolder();
assert.equal(retryAfterFailure.context.EDIT_DAY_NAME,'Peito A','Uma falha precisa manter o destino de edição para permitir retry sem criar outra pasta.');
assert.equal(retryAfterFailure.modalOpen(),true,'Falha de gravação mantém o editor aberto.');
assert.equal(retryAfterFailure.workout.days.length,1);
await retryAfterFailure.context.runSaveDayFolder();
assert.equal(retryAfterFailure.transactionCount(),2);
assert.equal(retryAfterFailure.workout.days.length,1,'Retry após falha não duplica a pasta existente.');
assert.equal(retryAfterFailure.workout.days[0].name,'Peito B');
assert.equal(retryAfterFailure.workout.days[0].legacyField,'keep-me','Campos legados do dia permanecem preservados.');
assert.equal(retryAfterFailure.workout.exercises[0].dayName,'Peito B');
assert.equal(retryAfterFailure.context.EDIT_DAY_NAME,'','Sucesso limpa o estado de edição.');
assert.equal(retryAfterFailure.modalOpen(),false);

const caseOnlyRename=makeHarness({newName:'peito a'});
await caseOnlyRename.context.runSaveDayFolder();
assert.equal(caseOnlyRename.workout.days.length,1);
assert.equal(caseOnlyRename.workout.days[0].name,'peito a','Renomear apenas as maiúsculas/minúsculas deve salvar o rótulo digitado.');
assert.equal(caseOnlyRename.workout.exercises[0].dayName,'peito a','Exercícios mantêm o nome exato da pasta após renomeação por caixa.');

const uncertainCommit=makeHarness({loseFirstCommitResponse:true});
await uncertainCommit.context.runSaveDayFolder();
assert.equal(uncertainCommit.transactionCount(),2,'Falha transitória após commit deve usar somente um retry limitado.');
assert.equal(uncertainCommit.persisted.workout.days.length,1,'Reconciliação não cria uma segunda pasta quando o primeiro commit foi aplicado.');
assert.equal(uncertainCommit.persisted.workout.days[0].name,'Peito B');
assert.equal(uncertainCommit.workout.days[0].name,'Peito B');
assert.equal(uncertainCommit.workout.exercises[0].dayName,'Peito B','ID estável do dia não pode impedir a reconciliação dos exercícios após commit incerto.');
assert.equal(uncertainCommit.workout.exercises[1].dayName,'Peito A','Reconciliação não altera exercícios de outro aluno.');
assert.equal(uncertainCommit.workout.exercises[2].dayName,'Peito A','Reconciliação não altera exercícios de outro protocolo.');
assert.equal(uncertainCommit.context.EDIT_DAY_NAME,'');

console.log('APROVADO — edição preservada após falha, retry sem pasta duplicada e reconciliação transacional de commit incerto com isolamento de aluno/protocolo.');
