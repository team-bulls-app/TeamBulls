import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';

const baseline=process.argv[process.argv.indexOf('--baseline')+1];
const read=file=>process.argv.includes('--baseline')?execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8'}):fs.readFileSync(file,'utf8');
const files={portions:'modules/diet-portion-presets-v10_10_9.js',personal:'modules/diet-personalization-v10_10_11.js',live:'modules/diet-live-calories-v10_10_11.js',bridge:'modules/custom-food-calorie-bridge-v10_10_12.js'};
const source=Object.fromEntries(Object.entries(files).map(([key,file])=>[key,read(file)]));
const clone=value=>JSON.parse(JSON.stringify(value));
const failures=[];
let passed=0;
async function test(name,run){try{await run();passed++;}catch(error){failures.push(name+': '+error.message);}}

function environment(){
  const nodes=new Map(),documents=new Map(),writes=[],messages=[],warnings=[],frames=[];
  let failReads=false,failWrites=false,readHook=null,retryHook=null;
  const node=(value='')=>({value,dataset:{},textContent:'',style:{},classList:{add(){},remove(){}},maxLength:5000,dispatchEvent(){},focus(){},setSelectionRange(){},remove(){},querySelector(){return null;},querySelectorAll(){return[];}});
  for(const id of ['tb-diet-portion-presets-style','tb-diet-personalization-style','tb-diet-live-calories-style'])nodes.set(id,node());
  for(const id of ['input-meal-items','tb-custom-food-id','tb-custom-food-label','tb-custom-food-protein','tb-custom-food-carbs','tb-custom-food-fat','tb-diet-individual-text'])nodes.set(id,node());
  const editor=node();editor.querySelector=selector=>nodes.get(selector.slice(1));nodes.set('tb-custom-food-modal',editor);
  const instructions=node();instructions.dataset.studentUid='student-a';nodes.set('tb-diet-individual-instructions',instructions);
  const tbody=node(),portionBody=node();portionBody.querySelector=()=>tbody;nodes.set('tb-meal-portion-body',portionBody);
  const label=node();label.textContent='1 Porção de Carbo';const group=node();group.textContent='Carbo';
  const document={readyState:'loading',head:{appendChild(){}},body:{appendChild(){}},getElementById:id=>nodes.get(id)||null,
    querySelector:()=>null,querySelectorAll:selector=>selector.includes('.tb-portion-label')?[label]:selector.includes('.tb-portion-macro')?[group]:[],
    addEventListener(){},createElement:()=>node()};
  const window={addEventListener(){}};window.window=window;
  const context={window,document,navigator:{},console:{warn:(...args)=>warnings.push(args),error(){}},setTimeout,clearTimeout,
    requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){},Event:class{},
    CURRENT_USER:{uid:'coach-a',role:'trainer'},DIET_CONTEXT:{targetUid:'student-a'},MEAL_CTX:{canEditContent:true},MEAL_PLAN_CACHE:{meals:[]},
    confirm:()=>true,closeModal:id=>messages.push('close:'+id),showToast:message=>messages.push(message),
    firebase:{firestore:{FieldValue:{serverTimestamp:()=>123}}},cloudWrite:task=>task,
    crypto:{randomUUID:()=> 'new-id'},
    db:{collection:collection=>({doc:id=>{
      const key=collection+'/'+id;
      return{key,get:async()=>{const raw=documents.get(key),value=raw===undefined?undefined:clone(raw);await readHook?.(key);if(failReads)throw new Error('unavailable');return{exists:value!==undefined,data:()=>clone(value)};},
        set:async(data,options)=>{documents.set(key,options?.merge?{...documents.get(key),...clone(data)}:clone(data));writes.push({key,data:clone(data),transaction:false});}};
    }}),runTransaction:async callback=>{
      for(let attempt=0;attempt<2;attempt++){
        const staged=[];
        await callback({get:ref=>ref.get(),set:(ref,data,options)=>staged.push({ref,data:clone(data),options})});
        if(retryHook&&attempt===0){await retryHook();continue;}
        if(failWrites)throw new Error('write unavailable');
        for(const {ref,data,options} of staged){documents.set(ref.key,options?.merge?{...documents.get(ref.key),...data}:data);writes.push({key:ref.key,data,transaction:true});}
        return;
      }
    }},cloudGet:ref=>ref.get()};
  vm.createContext(context);
  vm.runInContext(source.portions,context,{filename:files.portions});
  vm.runInContext(source.live,context,{filename:files.live});
  vm.runInContext(source.personal,context,{filename:files.personal});
  const api=window.TeamBullsDietPersonalization;
  const field=(id,value)=>{nodes.get(id).value=value;};
  return{context,window,api,nodes,documents,writes,messages,warnings,label,group,tbody,
    setFail:value=>{failReads=value;},setWriteFail:value=>{failWrites=value;},onRead:fn=>{readHook=fn;},onRetry:fn=>{retryHook=fn;},
    field,openFood:(id='')=>{api.editCustom(id);},
    runBridge:()=>vm.runInContext(source.bridge,context,{filename:files.bridge})};
}

await test('Canonical Carboidrato labels, add, filter, immutable data and old diets',()=>{
  const e=environment(),api=e.window.TeamBullsDietPortions;
  const visible=api.presets.filter(item=>!item.hidden);
  assert.equal(visible.length,32);
  assert.equal(visible.find(item=>item.id==='carb-10').label,'1 Porção de Carboidrato');
  assert(Object.isFrozen(visible[0]),'Canonical items remain immutable');
  api.add('carb-10');assert.equal(e.nodes.get('input-meal-items').value,'1 Porção de Carboidrato');
  api.filterMealTable('carboidrato');assert.match(e.tbody.innerHTML,/1 Porção de Carboidrato/);
  assert.doesNotMatch(e.tbody.innerHTML,/Porção de Carbo(?!idrato)/);
  assert.equal(e.warnings.length,0,'Loading personalization must not try to mutate frozen presets');
  assert.equal(e.group.textContent,'Carboidrato');
  const analyze=e.window.TeamBullsDietLiveCalories.analyze;
  for(const item of visible.filter(item=>item.group==='carbo')){
    const old=analyze(item.label.replace('Carboidrato','Carbo')),now=analyze(item.label);
    assert.equal(now.matched,1);assert.equal(now.unknown,0);assert.deepEqual(clone(old),clone(now));
  }
  api.setCustomItems([{id:'collision',label:'1 Porção de Carbo',protein:999,carbs:999,fat:999}]);
  assert.equal(analyze('1 Porção de Carbo').carbs,28,'A custom item cannot shadow legacy portions');
});

await test('Failed instructions read cannot replace existing plans or meals',async()=>{
  const e=environment(),key='mealPlans/student-a',original={plans:[{id:'diet',variants:[{id:'v',meals:[{id:'meal',items:'1 Porção de Carbo'}]}]}],meals:[{id:'legacy'}],individualInstructions:'Anterior',other:'preserve'};
  e.documents.set(key,clone(original));e.field('tb-diet-individual-text','Nova orientação');e.setFail(true);
  await e.api.saveInstructions();assert.equal(e.writes.length,0,'Do not write after an unavailable read');assert.deepEqual(e.documents.get(key),original);
  e.setFail(false);await e.api.saveInstructions();assert.equal(e.documents.get(key).individualInstructions,'Nova orientação');
  assert.deepEqual(e.documents.get(key).plans,original.plans);assert.deepEqual(e.documents.get(key).meals,original.meals);assert.equal(e.documents.get(key).other,'preserve');
  assert(e.writes.every(write=>write.transaction));
});

await test('Instructions transaction retry preserves a diet created concurrently',async()=>{
  const e=environment(),key='mealPlans/student-a';e.field('tb-diet-individual-text','Orientação inicial');
  e.onRetry(()=>e.documents.set(key,{plans:[{id:'concurrent-diet'}],meals:[{id:'concurrent-meal'}],other:'keep'}));
  await e.api.saveInstructions();assert.deepEqual(e.documents.get(key).plans,[{id:'concurrent-diet'}]);assert.deepEqual(e.documents.get(key).meals,[{id:'concurrent-meal'}]);
});

await test('Instructions are not written after switching student or account',async()=>{
  for(const change of [e=>{e.context.DIET_CONTEXT={targetUid:'student-b'};},e=>{e.context.CURRENT_USER={uid:'coach-b',role:'trainer'};}]){
    const e=environment();e.field('tb-diet-individual-text','Draft retained');e.onRead(()=>change(e));
    await e.api.saveInstructions();assert.equal(e.writes.length,0);assert.equal(e.nodes.get('tb-diet-individual-text').value,'Draft retained');
  }
});

await test('A failed catalog load followed by save preserves remote foods and other fields',async()=>{
  const e=environment(),key='trainerSupplementCatalog/coach-a',old={id:'old',label:'100g Iogurte',protein:8,carbs:4,fat:2};
  e.documents.set(key,{trainerId:'coach-a',dietPortionItems:[old],items:[{id:'supplement'}],other:'keep'});
  e.setFail(true);await e.api.refresh();e.setFail(false);e.openFood();e.field('tb-custom-food-label','200ml Leite');e.field('tb-custom-food-protein','6');
  await e.api.saveCustom();const saved=e.documents.get(key);
  assert(saved.dietPortionItems.some(item=>item.id==='old'),'The failed read must not become an empty authoritative list');
  assert(saved.dietPortionItems.some(item=>item.label==='200ml Leite'));assert.deepEqual(saved.items,[{id:'supplement'}]);assert.equal(saved.other,'keep');
  assert(e.writes.every(write=>write.transaction));
});

await test('Catalog transaction retry preserves foods added by another device',async()=>{
  const e=environment(),key='trainerSupplementCatalog/coach-a';e.documents.set(key,{dietPortionItems:[]});await e.api.refresh();
  e.openFood();e.field('tb-custom-food-label','Alimento novo');
  e.onRetry(()=>e.documents.set(key,{dietPortionItems:[{id:'remote',label:'Alimento remoto',protein:5}],other:'keep'}));
  await e.api.saveCustom();assert.equal(e.documents.get(key).dietPortionItems.length,2);assert.equal(e.documents.get(key).other,'keep');
});

await test('Catalog cannot shadow a portion or another custom label',async()=>{
  for(const name of ['1 Porção de Carbo','1 Porção de Carboidrato','  alimento   existente  ']){
    const e=environment(),key='trainerSupplementCatalog/coach-a';e.documents.set(key,{dietPortionItems:[{id:'existing',label:'Alimento existente',protein:5}]});
    await e.api.refresh();e.openFood();e.field('tb-custom-food-label',name);await e.api.saveCustom();
    assert.equal(e.writes.length,0,'Reject ambiguous labels rather than silently changing their nutrient calculation');
  }
});

await test('Deleting the last custom food clears its macro registry',async()=>{
  const e=environment(),key='trainerSupplementCatalog/coach-a';e.documents.set(key,{dietPortionItems:[{id:'milk',label:'200ml Leite',protein:6,carbs:8,fat:3}]});
  await e.api.refresh();e.runBridge();await e.window.TeamBullsCustomFoodCalories.load();
  assert.equal(e.window.TeamBullsDietLiveCalories.analyze('200ml Leite').matched,1);
  await e.api.removeCustom('milk');e.window.TeamBullsCustomFoodCalories.apply();
  assert.equal(e.window.TeamBullsDietLiveCalories.analyze('200ml Leite').matched,0,'Deleted last food must not remain in the calorie registry');
});

await test('Late catalog response from another account is discarded',async()=>{
  const e=environment();e.documents.set('trainerSupplementCatalog/coach-a',{dietPortionItems:[{id:'a',label:'Privado A'}]});e.documents.set('trainerSupplementCatalog/coach-b',{dietPortionItems:[{id:'b',label:'Privado B'}]});
  let release,started;const read=new Promise(resolve=>{started=resolve;});
  e.onRead(async key=>{if(key.endsWith('/coach-a')){started();await new Promise(resolve=>{release=resolve;});}});
  const pending=e.api.refresh();await read;e.context.CURRENT_USER={uid:'coach-b',role:'trainer'};await e.api.refresh();release();await pending;
  e.openFood('b');assert.equal(e.nodes.get('tb-custom-food-label').value,'Privado B');
  e.openFood('a');assert.equal(e.nodes.get('tb-custom-food-label').value,'');
});

await test('A custom-food form opened by another account cannot save',async()=>{
  const e=environment();e.openFood();e.field('tb-custom-food-label','Draft A');e.context.CURRENT_USER={uid:'coach-b',role:'trainer'};
  await e.api.saveCustom();assert.equal(e.writes.length,0);
});

await test('An old catalog read cannot replace a newer successful save',async()=>{
  const e=environment(),key='trainerSupplementCatalog/coach-a';e.documents.set(key,{dietPortionItems:[{id:'old',label:'Alimento antigo'}]});await e.api.refresh();
  let release,started;const read=new Promise(resolve=>{started=resolve;});let held=false;
  e.onRead(async()=>{if(!held){held=true;started();await new Promise(resolve=>{release=resolve;});}});
  const pending=e.api.refresh();await read;e.openFood();e.field('tb-custom-food-label','Alimento mais recente');assert.equal(await e.api.saveCustom(),true);release();await pending;
  assert(e.api.catalogItems().some(item=>item.label==='Alimento mais recente'));
});

await test('Repeated save clicks produce only one catalog or instructions commit',async()=>{
  for(const type of ['catalog','instructions']){
    const e=environment();e.openFood();e.field('tb-custom-food-label','Alimento');e.field('tb-diet-individual-text','Orientação');
    let release,started,held=false;const read=new Promise(resolve=>{started=resolve;});e.onRead(async()=>{if(!held){held=true;started();await new Promise(resolve=>{release=resolve;});}});
    const save=()=>type==='catalog'?e.api.saveCustom():e.api.saveInstructions();const first=save();
    assert.equal(await Promise.race([read.then(()=>true),first.then(()=>false)]),true,'Save must read the confirmed document before writing');
    const second=save();release();const result=await Promise.all([first,second]);assert.equal(result[1],false);assert.equal(result[0],true);assert.equal(e.writes.length,1);
  }
});

await test('Failed custom-food commit preserves the catalog and allows retry',async()=>{
  const e=environment(),key='trainerSupplementCatalog/coach-a',original={dietPortionItems:[{id:'old',label:'Original',protein:3}]};e.documents.set(key,clone(original));await e.api.refresh();
  e.openFood('old');e.field('tb-custom-food-label','Editado');e.setWriteFail(true);assert.equal(await e.api.saveCustom(),false);
  assert.deepEqual(e.documents.get(key),original);assert.equal(e.nodes.get('tb-custom-food-label').value,'Editado');assert(!e.messages.includes('close:tb-custom-food-modal'));
  e.setWriteFail(false);assert.equal(await e.api.saveCustom(),true);assert.equal(e.documents.get(key).dietPortionItems[0].label,'Editado');
});

if(failures.length){console.error(`FAILED ${failures.length} of ${passed+failures.length} diet builder checks\n- `+failures.join('\n- '));process.exit(1);}
console.log(`PASSED ${passed} diet builder checks: canonical/legacy portions, safe transactions, account isolation and custom-food macro invalidation.`);
