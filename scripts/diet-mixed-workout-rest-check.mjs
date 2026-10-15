import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const core=fs.readFileSync('app_v10_10_9_core.js','utf8');
const part=(from,to)=>{const start=core.indexOf(from),end=core.indexOf(to,start);assert(start>=0&&end>start);return core.slice(start,end);};
const choices=[
  ...['Superior A','Superior B','Superior C'].map((name,index)=>({workoutId:'active-protocol',workoutDayId:'upper-'+index,workoutName:'Protocolo ativo',workoutDayName:name,active:true})),
  ...['Inferior A','Inferior B'].map((name,index)=>({workoutId:'active-protocol',workoutDayId:'lower-'+index,workoutName:'Protocolo ativo',workoutDayName:name,active:true}))
];
const plan={id:'diet-1',variants:[]},alerts=[];let writes=0,serial=0;
let form={name:'',rest:'0',days:'0',type:'',workouts:[],weekdays:[],restWeekdays:[]};
const field=value=>({value:String(value)});
const context={
  DIET_DOCUMENT:{plans:[plan]},DIET_CONTEXT:{trainer:true,targetUid:'student-1'},EDIT_DIET_VARIANT_ID:'',CURRENT_DIET_VARIANT_ID:'',
  uid:()=>`variant-${++serial}`,normalizeDietMeal:value=>value,currentDiet:()=>plan,dietCanEdit:()=>true,beginAction:()=>true,endAction:()=>{},
  dietActiveWorkoutChoices:()=>choices,alert:message=>alerts.push(message),cloudWriteError:error=>error.message,
  persistDietDocument:async()=>{writes++;},closeModal:()=>{},renderDietVariantTabs:()=>{},v104ActivateVariantMeals:()=>{},showToast:()=>{},
  document:{
    getElementById:id=>field(id==='input-diet-variant-name'?form.name:id==='input-diet-variant-rest-days'?form.rest:id==='input-diet-variant-days'?form.days:form.type),
    querySelectorAll:selector=>selector==='[data-diet-variant-weekday]:checked'?form.weekdays.map(value=>field(value)):
      selector==='[data-diet-variant-rest-weekday]:checked'?form.restWeekdays.map(value=>field(value)):
      selector==='[data-diet-variant-workout]:checked'?form.workouts.map(index=>({dataset:{dietVariantWorkout:String(index)}})):[],
    querySelector:()=>null
  },
  console
};
vm.createContext(context);
vm.runInContext(part('function normalizeDietVariant(', 'normalizeDietPlan=function(')+'\n'+part('async function saveDietVariant(){','function deleteDietVariant('),context);

form={name:'Carbo baixo',rest:'2',days:'5',type:'mixed',workouts:[0,1,2],weekdays:[],restWeekdays:[]};
await context.saveDietVariant();
assert.equal(writes,1);
assert.equal(plan.variants[0].daysPerWeek,5);
assert.equal(plan.variants[0].dayType,'mixed');
assert.equal(plan.variants[0].workoutDays.length,3);
assert.equal(plan.variants[0].restDaysPerWeek,2);

form={name:'Carbo alto',rest:'0',days:'2',type:'training',workouts:[3,4],weekdays:[],restWeekdays:[]};
await context.saveDietVariant();
assert.equal(writes,2);
assert.equal(plan.variants[1].daysPerWeek,2);
assert.equal(plan.variants[1].workoutDays.length,2);
assert.equal(plan.variants.reduce((sum,variant)=>sum+variant.daysPerWeek,0),7);

form={name:'Conflito',rest:'0',days:'1',type:'training',workouts:[0],weekdays:[],restWeekdays:[]};
await context.saveDietVariant();
assert.equal(writes,2,'mesmo treino não pode receber duas divisões');
assert(alerts.some(message=>message.includes('Carbo baixo')));

const legacy=context.normalizeDietVariant({id:'old',name:'Descanso',dayType:'rest',daysPerWeek:2,meals:[]});
assert.equal(legacy.restDaysPerWeek,2,'descansos anteriores mantêm sua frequência sem migração');
assert.equal(legacy.workoutDays.length,0,'não inventa vínculo de treino antigo');
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('data-diet-variant-rest-weekday')&&html.includes('input-diet-variant-rest-days'));
assert(!html.includes('id="diet-variant-workout-wrap" style="display:none"'),'treinos ativos devem aparecer sem escolher tipo antes');
console.log('APROVADO — três treinos de superior + dois descansos e dois treinos de inferior distribuem sete dias sem conflito.');
