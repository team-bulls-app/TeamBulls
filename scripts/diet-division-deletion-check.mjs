import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const core=fs.readFileSync('app_v10_10_9_core.js','utf8');
const source=core.slice(core.indexOf('function renderDietVariantTabs('),core.indexOf('function v104ActivateVariantMeals('))+'\n'+core.slice(core.indexOf('function deleteDietVariant('),core.indexOf('async function moveDietVariant('));
const editor={open:false,classList:{contains(name){return name==='open'&&editor.open;}}};
const host={innerHTML:''},studentHost={innerHTML:''},distribution={innerHTML:''},alerts=[],toasts=[],closed=[],locks=new Set();
let confirmation=null,writes=0,failWrite=false;
const newDocument=()=>({plans:[{id:'diet-a',variants:[
  {id:'low-a',name:'Carbo baixo',daysPerWeek:3,order:0,meals:[{id:'meal-a'}]},
  {id:'high',name:'Carbo alto',daysPerWeek:2,order:1,meals:[{id:'meal-b'}]},
  {id:'low-b',name:'Carbo baixo',daysPerWeek:2,order:2,meals:[{id:'meal-c'}]}
],meals:[{id:'meal-a'}]}]});
const context={
  DIET_DOCUMENT:newDocument(),DIET_CONTEXT:{targetUid:'student-a',trainer:true,local:false},CURRENT_DIET_ID:'diet-a',CURRENT_DIET_VARIANT_ID:'low-a',EDIT_DIET_VARIANT_ID:'low-b',MEAL_PLAN_CACHE:{meals:[{id:'meal-a'}]},
  document:{getElementById:id=>id==='modal-diet-variant'?editor:id==='ts-diet-variant-tabs'?host:id==='diet-variant-tabs'?studentHost:id==='ts-diet-week-distribution'?distribution:null},
  currentDiet(){return context.DIET_DOCUMENT.plans.find(plan=>plan.id===context.CURRENT_DIET_ID);},
  currentDietVariant(){return context.currentDiet().variants.find(item=>item.id===context.CURRENT_DIET_VARIANT_ID);},
  dietCanEdit:()=>context.DIET_CONTEXT.trainer||context.DIET_CONTEXT.local,
  v104DietDistribution:plan=>({total:plan.variants.reduce((sum,item)=>sum+item.daysPerWeek,0)}),
  jsArg:value=>'&quot;'+String(value)+'&quot;',esc:value=>String(value),
  dietVariantDayLabel:()=>'',renderDietEnergySummary:()=>{},
  showConfirm:(title,text,cb)=>{confirmation={title,text,cb};},
  beginAction:key=>{if(locks.has(key))return false;locks.add(key);return true;},
  endAction:key=>locks.delete(key),
  persistDietDocument:async()=>{writes++;if(failWrite)throw new Error('offline');context.DIET_DOCUMENT=structuredClone(context.DIET_DOCUMENT);},
  normalizeDietDocument:value=>structuredClone(value),
  v104ActivateVariantMeals:()=>{context.MEAL_PLAN_CACHE.meals=context.currentDietVariant().meals;},
  renderDietVariantTabs(){},
  closeModal:id=>{closed.push(id);editor.open=false;},
  showToast:message=>toasts.push(message),alert:message=>alerts.push(message),
  cloudWriteError:error=>error.message,console
};
vm.createContext(context);
vm.runInContext(source,context);

context.renderDietVariantTabs(true);
assert.match(host.innerHTML,/deleteDietVariant\(&quot;low-b&quot;\)/,'the card must offer a direct delete action');
assert.match(host.innerHTML,/aria-label="Excluir divisão Carbo baixo"/);
context.renderDietVariantTabs(false);
assert.doesNotMatch(studentHost.innerHTML,/deleteDietVariant/,'student view must not offer deletion');

editor.open=true;
assert.equal(context.deleteDietVariant(),true);
assert.equal(editor.open,true,'the editor must remain open while the confirmation is shown');
assert.equal(writes,0,'opening a confirmation cannot mutate the diet');
assert.match(confirmation.text,/registros de refeições concluídas serão preservados/);
assert.equal(await confirmation.cb(),true);
assert.equal(writes,1);
assert.equal(editor.open,false);
assert.deepEqual(context.currentDiet().variants.map(item=>item.id),['low-a','high'],'only the selected duplicate-name division is removed');
assert.deepEqual(context.currentDiet().variants.map(item=>item.meals[0].id),['meal-a','meal-b']);
assert.equal(context.currentDiet().meals[0].id,'meal-a','the legacy meals alias stays on the surviving first division');
assert.equal(context.CURRENT_DIET_VARIANT_ID,'low-a');
assert.equal(context.EDIT_DIET_VARIANT_ID,'');
assert.equal(locks.size,0);

context.DIET_DOCUMENT=newDocument();context.CURRENT_DIET_VARIANT_ID='high';
assert.equal(context.deleteDietVariant('high'),true,'card action uses its own division ID');
context.DIET_CONTEXT.targetUid='student-b';
assert.equal(await confirmation.cb(),false,'changing student before confirmation must reject the deletion');
assert.equal(writes,1);
assert.equal(context.currentDiet().variants.length,3);
context.DIET_CONTEXT.targetUid='student-a';

editor.open=true;failWrite=true;
assert.equal(context.deleteDietVariant('high'),true);
assert.equal(await confirmation.cb(),false,'failed persistence keeps the confirmation available');
assert.equal(editor.open,true,'failed persistence keeps the editor open');
assert.deepEqual(context.currentDiet().variants.map(item=>item.id),['low-a','high','low-b'],'failed persistence rolls back every division');
assert.equal(context.CURRENT_DIET_VARIANT_ID,'high');
assert.equal(locks.size,0);
assert.ok(alerts.some(message=>message.includes('offline')));

failWrite=false;context.DIET_DOCUMENT={plans:[{id:'diet-a',variants:[{id:'only',name:'Única',daysPerWeek:7,order:0,meals:[]}],meals:[]}]};
context.renderDietVariantTabs(true);
assert.doesNotMatch(host.innerHTML,/deleteDietVariant/,'the last division cannot be removed');
assert.equal(context.deleteDietVariant('only'),false);
assert.equal(writes,2);
assert.equal(toasts.filter(message=>message.includes('excluída')).length,1);
console.log('APROVADO — exclusão de divisão preserva as outras, confirma antes de gravar, valida aluno, reverte falha e protege a última divisão.');
