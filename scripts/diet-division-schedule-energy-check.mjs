import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const core=fs.readFileSync('app_v10_10_9_core.js','utf8');
const extract=(start,end)=>{
  const first=core.indexOf(start),last=core.indexOf(end,first);
  assert(first>=0&&last>first,`Trecho ausente: ${start}`);
  return core.slice(first,last);
};
const summaryHost={innerHTML:''},editorHost={innerHTML:''},noteHost={textContent:''};
const hosts={'summary':summaryHost,'diet-energy-variant-fields':editorHost,'diet-energy-legacy-note':noteHost};
let sequence=0;
const context={
  uid:()=>`new-${++sequence}`,normalizeDietMeal:value=>value,
  document:{getElementById:id=>hosts[id]||null},
  esc:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),
  jsArg:value=>JSON.stringify(value)
};
vm.createContext(context);
vm.runInContext([
  extract('function normalizeDietVariant(', 'normalizeDietPlan=function('),
  extract('const DIET_WEEKDAY_LABELS=', 'function v104DietDistribution('),
  extract('function v1010EnergyValue(', 'const V1010_NORMALIZE_DIET_PLAN_BASE='),
  extract('function v1010EnergyText(', 'const V1010_OPEN_ADD_DIET_BASE='),
  extract('function v1010RenderVariantEnergyEditor(', 'openAddDietModal=function()')
].join('\n'),context);

const scheduled=context.normalizeDietVariant({id:'low',name:'Carbo baixo',daysPerWeek:7,dayType:'rest',weekdays:[6,1,1,8,-1],meals:[]});
assert.deepEqual(Array.from(scheduled.weekdays),[1,6]);
assert.equal(scheduled.daysPerWeek,2,'dias selecionados determinam a quantidade');
assert.equal(scheduled.dayType,'rest');
assert.equal(context.dietVariantDayLabel(scheduled),'Descanso · SEG, SÁB');
const legacy=context.normalizeDietVariant({id:'old',name:'Dia de treino',daysPerWeek:5,meals:[]});
assert.equal(legacy.daysPerWeek,5,'dieta antiga mantém a distribuição existente');
assert.equal(legacy.dayType,'training','tipo de dia antigo permanece reconhecível');
assert.deepEqual(Array.from(legacy.weekdays),[],'dias específicos não são inventados');

const plan={id:'diet',variants:[scheduled,{id:'high',name:'Carbo alto',dayType:'training',weekdays:[2,3,4],daysPerWeek:3},{id:'middle',name:'Manutenção',dayType:'rest',weekdays:[0,5],daysPerWeek:2}],energySummary:{totalExpenditure:2700,variantEnergy:{low:1900,high:2400,middle:2200}}};
context.renderDietEnergySummary('summary',plan,true);
for(const name of ['Carbo baixo','Carbo alto','Manutenção'])assert(summaryHost.innerHTML.includes(name),`Divisão ausente: ${name}`);
assert.equal((summaryHost.innerHTML.match(/class="diet-energy-metric"/g)||[]).length,4,'GET mais três divisões');
assert(summaryHost.innerHTML.includes('1.900 kcal/dia'));
plan.variants[0].name='Baixo em carboidratos';
plan.variants.reverse();
context.renderDietEnergySummary('summary',plan,true);
assert(summaryHost.innerHTML.includes('Baixo em carboidratos'));
assert.equal(context.v1010EnergyForVariant(plan,plan.variants.find(item=>item.id==='low')),1900,'renomear/reordenar conserva as calorias pelo ID');
context.v1010RenderVariantEnergyEditor(plan);
assert.equal((editorHost.innerHTML.match(/data-diet-variant-energy=/g)||[]).length,3,'um campo editável para cada divisão');
assert(editorHost.innerHTML.includes('data-diet-variant-energy="low" value="1900"'));

const oldPlan={variants:[{id:'a',name:'Dia de treino'},{id:'b',name:'Dia sem treino'}]};
const oldValues=context.normalizeDietEnergySummary({trainingDayEnergy:2400,restDayEnergy:1900},oldPlan.variants);
assert.equal(context.v1010EnergyForVariant(oldPlan,oldPlan.variants[0],oldValues),2400);
assert.equal(context.v1010EnergyForVariant(oldPlan,oldPlan.variants[1],oldValues),1900);
oldPlan.variants[0].name='Carbo alto';
assert.equal(context.v1010EnergyForVariant(oldPlan,oldPlan.variants[0],oldValues),0,'valor antigo não pode ser atribuído a nome novo por palpite');
assert.equal(oldValues.trainingDayEnergy,2400,'valor antigo permanece armazenado');

const copyCode=fs.readFileSync('modules/diet-copy-v10_10_28.js','utf8');
const copyContext={DIET_DOCUMENT:{plans:[]},DIET_SECTION_DEFS:[],uid:()=>`copy-${++sequence}`,normalizeDietPlan:value=>value};
vm.createContext(copyContext);
vm.runInContext(copyCode.slice(copyCode.indexOf('  function clone('),copyCode.indexOf('  function reportError(')),copyContext);
const copied=copyContext.buildCopy({id:'original',name:'Dieta',variants:[{id:'low',name:'Carbo baixo',meals:[]},{id:'high',name:'Carbo alto',meals:[]}],energySummary:{variantEnergy:{low:1900,high:2400}}});
assert.notEqual(copied.variants[0].id,'low');
assert.equal(copied.energySummary.variantEnergy[copied.variants[0].id],1900,'cópia remapeia o VET da primeira divisão');
assert.equal(copied.energySummary.variantEnergy[copied.variants[1].id],2400,'cópia remapeia o VET da segunda divisão');
assert.equal(Object.keys(copied.energySummary.variantEnergy).length,2,'IDs antigos não vazam para a cópia');

const html=fs.readFileSync('index.html','utf8');
assert(html.includes('data-diet-variant-weekday')&&html.includes('input-diet-variant-day-type'),'editor permite dias da semana e treino/descanso');
assert(html.includes('diet-energy-variant-fields'),'editor calórico acompanha divisões');
assert(!html.includes('id="input-diet-training-energy"')&&!html.includes('id="input-diet-rest-energy"'),'editor não usa dois campos fixos');
console.log('APROVADO — dias e tipo por divisão, calorias por ID, nomes dinâmicos, legado preservado e cópia correta.');
