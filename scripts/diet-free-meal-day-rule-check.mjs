import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const core=fs.readFileSync('app_v10_10_9_core.js','utf8');
const extract=(start,end)=>{const a=core.indexOf(start),b=core.indexOf(end,a);assert(a>=0&&b>a,`Trecho ausente: ${start}`);return core.slice(a,b);};
const fields={
  'input-diet-free-meal-day-rule':{value:'workout'},
  'input-diet-free-meal-workout':{value:'',innerHTML:''},
  'diet-free-meal-workout-wrap':{style:{display:''}},
  'policy':{innerHTML:''}
};
const context={
  DIET_CONTEXT:{trainer:true,targetUid:'student-a'},
  VIEW_STUDENT:{uid:'student-a',workouts:[{id:'workout-a',name:'Protocolo atual',days:[{id:'day-a',name:'Treino A'},{id:'day-b',name:'Treino B'}]}]},
  getWorkouts:()=>[],getWorkoutDays:workout=>workout.days,
  document:{getElementById:id=>fields[id]||null},
  esc:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;'),
  jsArg:value=>JSON.stringify(value)
};
vm.createContext(context);
vm.runInContext(extract('function normalizeDietFreeMealPolicy(', 'const V10513_BASE_NORMALIZE_DIET_PLAN='),context);
vm.runInContext(extract('function dietFreeMealPolicyText(', 'const V10513_BASE_OPEN_ADD_DIET='),context);

const legacy=context.normalizeDietFreeMealPolicy({maxCalories:1500,mealsToReplace:1,intervalDays:7});
assert.equal(legacy.dayRule,'free','política antiga mantém a escolha livre do aluno');
assert.equal(legacy.maxCalories,1500);
assert.match(context.dietFreeMealPolicyText(legacy),/dia escolhido pelo aluno/);
assert.match(context.dietFreeMealPolicyText({dayRule:'rest'}),/dia de descanso/);
assert.match(context.dietFreeMealPolicyText({dayRule:'training'}),/dia de treino/);

const selected=context.normalizeDietFreeMealPolicy({dayRule:'workout',workoutId:'workout-a',workoutDayId:'day-b',workoutName:'Protocolo atual',workoutDayName:'Treino B'});
assert.match(context.dietFreeMealPolicyText(selected),/Protocolo atual — Treino B/);
context.populateDietFreeMealWorkoutChoices(selected);
assert.equal(fields['input-diet-free-meal-workout'].value,'1');
assert.match(fields['input-diet-free-meal-workout'].innerHTML,/Treino A/);
assert.match(fields['input-diet-free-meal-workout'].innerHTML,/Treino B/);
assert.equal(fields['diet-free-meal-workout-wrap'].style.display,'block');
assert.equal(context.dietFreeMealWorkoutChoices().length,2);
context.VIEW_STUDENT.uid='student-b';
assert.equal(context.dietFreeMealWorkoutChoices().length,0,'um treino de outro aluno não pode ser selecionado');
context.VIEW_STUDENT.uid='student-a';
context.populateDietFreeMealWorkoutChoices({...selected,workoutDayId:'removed'});
assert.equal(fields['input-diet-free-meal-workout'].value,'saved');
assert.match(fields['input-diet-free-meal-workout'].innerHTML,/não encontrado; escolha outro/);
fields['input-diet-free-meal-day-rule'].value='free';context.updateDietFreeMealDayRule();
assert.equal(fields['diet-free-meal-workout-wrap'].style.display,'none');
assert.equal(context.normalizeDietFreeMealPolicy({...selected,dayRule:'free'}).workoutId,'','alterar para escolha livre remove referência antiga');
context.renderDietFreeMealPolicy('policy',{id:'diet-a',freeMealPolicy:selected},false);
assert.match(fields.policy.innerHTML,/Protocolo atual — Treino B/);
assert(!fields.policy.innerHTML.includes('EDITAR'),'aluno não pode editar a orientação');

const html=fs.readFileSync('index.html','utf8');
assert(html.includes('input-diet-free-meal-day-rule')&&html.includes('input-diet-free-meal-workout'));
assert(core.includes("if(dayRule==='workout'&&(!workoutChoice||workoutSelection===''))"),'salvar exige um treino válido quando a regra é específica');
console.log('APROVADO — refeição livre por descanso, treino, treino específico ou escolha livre, sem misturar alunos nem perder políticas antigas.');
