import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

const core=fs.readFileSync('app_v10_10_9_core.js','utf8');
const source=fs.readFileSync('modules/student-food-choices-v10_10_64.js','utf8');
const portionSource=fs.readFileSync('modules/diet-portion-presets-v10_10_9.js','utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const settle=async()=>{for(let i=0;i<40;i++)await new Promise(resolve=>setImmediate(resolve));};
const denied=()=>Object.assign(new Error('Permission denied'),{code:'permission-denied'});

// Execute the real catalog, rendering and feature in independent JS contexts.
// Reusing only the storage/server demonstrates closing and reopening the app.
export function foodApp(options={}){
  const local=options.local||new Map(),remote=options.remote||new Map(),listeners=new Map(),writes=[];
  const meal={id:'meal-a',time:'12:00',items:'2 Porção de Proteína\n1,5 porções de carboidratos\n120g Vegetais\nÁgua <livre>'};
  const variant={id:'variant-a',meals:[meal]},plan={id:'diet-a',variants:[variant]};
  const list={innerHTML:''},empty={style:{}},toasts=[];
  const listen=(name,fn)=>{const list=listeners.get(name)||[];list.push(fn);listeners.set(name,list);};
  const context={console:{warn(){}},Intl,TextEncoder,Uint8Array,crypto:webcrypto,Map,Set,Promise,setTimeout:(fn,ms)=>setTimeout(fn,options.shortTimeout&&ms===10000?5:ms),clearTimeout,
    CURRENT_USER:{uid:'student-a',role:'student'},auth:{currentUser:{uid:'student-a'}},MODE:options.offline?'local':'cloud',navigator:{onLine:!options.offline},
    DIET_CONTEXT:{targetUid:'student-a',trainer:false,local:!!options.offline},MEAL_CTX:{targetUid:'student-a',listId:'diet-meals-list',emptyId:'diet-meals-empty',canEditContent:false,canToggleDone:true},
    MEAL_PLAN_CACHE:{meals:[meal]},MEAL_COMPLETIONS_TODAY:new Set(),currentDiet:()=>plan,currentDietVariant:()=>variant,
    localStorage:{getItem:key=>local.get(key)||null,setItem(key,value){if(options.storageFailure)throw new Error('Quota exceeded');local.set(key,value);}},
    document:{readyState:'complete',head:{appendChild(){}},getElementById:id=>id==='diet-meals-list'?list:id==='diet-meals-empty'?empty:null,createElement:()=>({}),addEventListener:listen},
    showToast:(message,error)=>toasts.push({message,error}),today:()=>options.date||'2026-10-08',uid:()=>webcrypto.randomUUID(),FOOD_CATALOG_VERSION:2,
    cloudGet:reference=>reference.get(),loadFoodOptions:async()=>context.FOOD_OPTIONS,
    esc:value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),jsArg:JSON.stringify,
    isMealDoneToday:entry=>context.MEAL_COMPLETIONS_TODAY.has(entry.id),toggleMealDone:()=>{},openDietDetail:async()=>{},
    firebase:options.firebase||{firestore:{FieldValue:{serverTimestamp:()=>({timestamp:true})}}}
  };
  const query=(name,filters=[])=>({where:(field,op,value)=>query(name,[...filters,[field,value]]),get:async()=>{
    if(options.readFailure)throw new Error('Unavailable');
    if(!filters.some(([field,value])=>field==='studentUid'&&value===context.auth.currentUser.uid))throw denied();
    const docs=[...remote].filter(([,value])=>filters.every(([field,expected])=>value[field]===expected)).map(([id,value])=>({id,data:()=>clone(value)}));
    if(options.readGate)await options.readGate;
    return{docs};
  },doc:id=>({
    get:async()=>{const value=remote.get(id);if(!value||value.studentUid!==context.auth.currentUser.uid)throw denied();return{exists:true,data:()=>clone(value)};},
    set:async value=>{
      if(options.gate)await options.gate;
      const old=remote.get(id);if(options.writeFailure||value.studentUid!==context.auth.currentUser.uid||(old&&['studentUid','mealId','date'].some(field=>old[field]!==value[field])))throw denied();
      writes.push({id,value:clone(value)});remote.set(id,clone(value));
    },
    update:async value=>{const old=remote.get(id);if(!old||old.studentUid!==context.auth.currentUser.uid||options.writeFailure)throw denied();writes.push({id,value:clone(value)});remote.set(id,{...old,...clone(value)});}
  })});
  context.db=options.db||{collection:name=>{assert.equal(name,'mealCompletions');return query(name);}};
  context.window={addEventListener:listen};context.window.window=context.window;
  vm.createContext(context);
  vm.runInContext(core.slice(core.indexOf('function normalizedName('),core.indexOf('function sessionFingerprint(')),context);
  vm.runInContext(core.slice(core.indexOf('function defaultFoodOptions('),core.indexOf('const DEFAULT_EXERCISE_VIDEO_URLS=')),context);
  context.FOOD_OPTIONS=context.defaultFoodOptions();
  vm.runInContext(core.slice(core.indexOf('function renderMealsList('),core.indexOf('function openAddMealModal(')),context);
  vm.runInContext(source,context);
  const api=context.window.TeamBullsStudentFoodChoices;
  const ctx=(row=0,extra={})=>({studentUid:context.CURRENT_USER.uid,dietId:plan.id,variantId:variant.id,mealId:meal.id,lineKey:api.rows(meal).filter(item=>item.lineKey)[row].lineKey,...extra});
  const protein=()=>api.foods(api.rows(meal)[0]),chicken=()=>protein().find(item=>/frango/i.test(item.name)),fish=()=>protein().find(item=>/til.pia/i.test(item.name));
  const ready=async()=>{await api.refresh();await settle();};
  const emit=(name,event)=>{for(const fn of listeners.get(name)||[])fn(event);};
  return{api,context,meal,plan,variant,local,remote,list,writes,toasts,ctx,chicken,fish,ready,emit};
}

export async function checkFoodChoices(){
  const a=foodApp();await a.ready();
  vm.runInContext(portionSource,a.context);
  const presets=a.context.window.TeamBullsDietPortions.presets.filter(item=>['carbo','proteina','gordura','fruta'].includes(item.group));
  assert.ok(presets.length>10);for(const item of presets)assert.ok(a.api.parse(item.label),item.label);
  assert.equal(a.api.parse('2 porções de proteína').count,2);
  assert.equal(a.api.parse('0,5 PORÇÃO DE GORDURA').count,.5);
  for(const text of ['0 porções de proteína','-1 porção de proteína','101 porções de proteína','100g Frango','2 porções de proteína e gordura','120g Vegetais','100ml creme de milho'])assert.equal(a.api.parse(text),null,text);
  assert.equal(a.chicken().quantity,'100 g');assert.equal(a.fish().quantity,'120 g');
  assert.equal(a.api.scale('2 fatias',1.5),'3 fatias');assert.equal(a.api.scale('50g (1 unidade)',2),'100 g (2 unidades)');
  assert.equal(a.api.scale('1 colher de sopa',.5),'0,5 colher de sopa');assert.equal(a.api.scale('200ml',1.5),'300 ml');assert.equal(a.api.scale('a gosto',2),null);
  assert.ok(a.api.foods({group:'fruit',count:1}).some(item=>item.name==='Banana'));
  const duplicated=a.api.rows({items:'2 porções de proteína\n\n2 Porção de Proteína'});assert.notEqual(duplicated[0].lineKey,duplicated[1].lineKey);
  assert.ok(a.list.innerHTML.includes('120g Vegetais'));assert.ok(a.list.innerHTML.includes('Água &lt;livre&gt;'));
  assert.ok(a.list.innerHTML.includes('data-tb-food-save'));assert.ok(a.list.innerHTML.includes('toggleMealDone'));
  await assert.rejects(a.api.save(a.ctx(),a.api.foods({group:'carb',count:2})[0].id),/categoria/);
  assert.equal(a.writes.length,0);
  assert.equal(await a.api.save(a.ctx(),a.chicken().id),true);assert.equal(a.remote.size,1);
  assert.ok(a.list.innerHTML.includes('100 g'));assert.equal(a.context.MEAL_COMPLETIONS_TODAY.size,0);
  const b=foodApp({local:a.local,remote:a.remote,date:'2026-10-09'});await b.ready();assert.ok(b.list.innerHTML.includes('100 g'));
  await b.api.save(b.ctx(),b.fish().id);assert.ok(b.list.innerHTML.includes('120 g'));
  assert.equal([...b.remote.values()][0].date,'2026-10-08');
  assert.equal([...b.remote.values()][0].foodId,b.fish().id);
  const [tabKey,tabValue]=[...b.local][0],tabRecords=JSON.parse(tabValue),tabEntry=Object.keys(tabRecords.records)[0];
  tabRecords.records[tabEntry]={...tabRecords.records[tabEntry],foodId:b.chicken().id,mutationId:'another-tab',pending:false};b.local.set(tabKey,JSON.stringify(tabRecords));b.emit('storage',{key:tabKey});assert.ok(b.list.innerHTML.includes('100 g'));

  // A different meal, division, plan or account never inherits that selection.
  b.meal.id='meal-b';b.context.renderMealsList();assert.ok(!b.list.innerHTML.includes('120 g</div>'));
  b.meal.id='meal-a';b.variant.id='variant-b';b.context.renderMealsList();assert.ok(!b.list.innerHTML.includes('120 g</div>'));
  b.variant.id='variant-a';b.plan.id='diet-b';await b.api.refresh();assert.ok(!b.list.innerHTML.includes('120 g</div>'));
  b.plan.id='diet-a';b.context.CURRENT_USER={uid:'student-b',role:'student'};b.context.auth.currentUser.uid='student-b';b.context.DIET_CONTEXT.targetUid='student-b';b.context.MEAL_CTX.targetUid='student-b';await b.api.refresh();assert.ok(!b.list.innerHTML.includes('120 g</div>'));
  b.context.CURRENT_USER.role='trainer';assert.equal(b.api.items(b.meal),null);

  const offline=foodApp({offline:true});await offline.ready();await offline.api.save(offline.ctx(),offline.chicken().id);assert.equal(offline.writes.length,0);
  assert.ok(JSON.parse([...offline.local.values()][0]).records[JSON.stringify(Object.values(offline.ctx()))].pending);
  const reopened=foodApp({local:offline.local,remote:offline.remote});await reopened.ready();assert.equal(reopened.remote.size,1);assert.ok(reopened.list.innerHTML.includes('100 g'));
  assert.ok(Object.values(JSON.parse([...reopened.local.values()][0]).records).every(entry=>!entry.pending));

  const failed=foodApp({writeFailure:true});await failed.ready();await failed.api.save(failed.ctx(),failed.chicken().id);assert.equal(failed.remote.size,0);
  assert.ok(failed.list.innerHTML.includes('Não foi possível sincronizar'));assert.ok(failed.list.innerHTML.includes('Tentar sincronizar'));
  const recovered=foodApp({local:failed.local,remote:failed.remote});await recovered.ready();assert.equal(recovered.remote.size,1);
  const full=foodApp({storageFailure:true});await full.ready();await assert.rejects(full.api.save(full.ctx(),full.chicken().id),/guardar neste aparelho/);assert.equal(full.writes.length,0);
  const olderBrowser=foodApp();await olderBrowser.ready();olderBrowser.context.crypto={subtle:webcrypto.subtle};await olderBrowser.api.save(olderBrowser.ctx(),olderBrowser.chicken().id);assert.equal(olderBrowser.remote.size,1);

  // A fresh device with a failed read reconciles an existing immutable date.
  const race=foodApp({remote:a.remote,readFailure:true,date:'2026-10-10'});await race.ready();await race.api.save(race.ctx(),race.chicken().id);
  assert.equal([...race.remote.values()][0].date,'2026-10-08');assert.equal(race.writes.length,1);

  let release;const gate=new Promise(resolve=>{release=resolve;});
  const late=foodApp({gate,shortTimeout:true});await late.ready();await late.api.save(late.ctx(),late.chicken().id);
  assert.equal(late.remote.size,0);assert.ok(late.list.innerHTML.includes('Sincronizando'));
  assert.equal(await late.api.save(late.ctx(),late.fish().id),false);
  const [storageKey,stored]=[...late.local][0],records=JSON.parse(stored),key=Object.keys(records.records)[0];
  records.records[key]={...records.records[key],foodId:late.fish().id,mutationId:'newer-intent'};late.local.set(storageKey,JSON.stringify(records));
  release();await settle();assert.equal(JSON.parse(late.local.get(storageKey)).records[key].mutationId,'newer-intent');assert.equal(JSON.parse(late.local.get(storageKey)).records[key].pending,true);
  await late.api.flush();assert.equal([...late.remote.values()][0].foodId,late.fish().id);
  late.meal.items='3 porções de proteína';late.context.renderMealsList();assert.ok(!late.list.innerHTML.includes('180 g</div>'));
  let finishRead;const readOptions={},stale=foodApp(readOptions);await stale.ready();await stale.api.save(stale.ctx(),stale.chicken().id);
  readOptions.readGate=new Promise(resolve=>{finishRead=resolve;});const refresh=stale.api.refresh(true);await settle();await stale.api.save(stale.ctx(),stale.fish().id);finishRead();await refresh;
  assert.ok(stale.list.innerHTML.includes('120 g'));assert.equal([...stale.remote.values()][0].foodId,stale.fish().id);

  // Exercise the actual delegated change/click callbacks, including retry.
  const buttons=foodApp({offline:true});await buttons.ready();const ctx=buttons.ctx(),select={value:buttons.chicken().id},button={disabled:true,textContent:''},quantity={textContent:''},status={textContent:''};
  const node={dataset:{tbFoodRow:JSON.stringify(Object.values(ctx))},querySelector:selector=>selector.includes('quantity')?quantity:selector.includes('status')?status:selector.includes('select')?select:button};
  select.closest=selector=>selector.includes('select')?select:node;button.closest=selector=>selector.includes('save')?button:node;
  buttons.emit('change',{target:select});assert.equal(quantity.textContent,'100 g');assert.equal(button.disabled,false);
  buttons.emit('click',{target:button,preventDefault(){}});await settle();assert.ok(buttons.list.innerHTML.includes('100 g'));
  const old=buttons.chicken().amount;buttons.context.FOOD_OPTIONS.categories.find(item=>item.id==='prot').items.find(item=>item.id===buttons.chicken().id).amount='65g';buttons.context.renderMealsList();assert.ok(buttons.list.innerHTML.includes('130 g'));
  assert.equal(old.replace(/\s/g,''),'50g');

  // Choice records cannot become completion marks or inflate adherence.
  const completionContext={db:{collection:()=>({where(){return this;},get:async()=>({docs:[{data:()=>({mealId:'choice',recordType:'food_choice'})},{data:()=>({mealId:'done'})}]})})},cloudGet:ref=>ref.get(),today:()=> '2026-10-08',Set,console};
  vm.runInNewContext(core.slice(core.indexOf('async function fetchCompletionsToday('),core.indexOf('function isMealDoneToday(')),completionContext);
  assert.deepEqual([...await completionContext.fetchCompletionsToday('student-a')],['done']);
  assert.ok(fs.readFileSync('modules/v107-operations.js','utf8').includes("filter(item=>item.recordType!=='food_choice')"));
  const src='student-food-choices-v10_10_64.js?v=10.10.64-foodchoices1';
  for(const file of ['config_v10_7.js','sw.js','sw_47.js','update_v10_10_9.js'])assert.ok(fs.readFileSync(file,'utf8').includes(src),file);
  assert.ok(!source.includes('setInterval('));assert.ok(!source.includes("collection('mealPlans')"));
  console.log('APROVADO — escolhas por porção: tabela real, botões, quantidades, reabertura, offline, erro, confirmação tardia, isolamento e conclusão independente.');
}

if(import.meta.url===new URL(process.argv[1],'file:').href)await checkFoodChoices();
