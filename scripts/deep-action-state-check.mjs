import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import {execFileSync} from 'node:child_process';
const baseline=process.argv[process.argv.indexOf('--baseline')+1];
assert(!process.argv.includes('--baseline')||/^[a-f0-9]{7,40}$/.test(baseline));
const source=process.argv.includes('--baseline')?execFileSync('git',['show',`${baseline}:app_v10_10_9_core.js`],{encoding:'utf8'}):fs.readFileSync('app_v10_10_9_core.js','utf8');
function fn(name){const start=source.indexOf(`function ${name}(`);if(start<0)return '';const line=source.slice(start).split('\n')[0].trimEnd(),prefix=source.slice(start-6,start)==='async '?'async ':'';return prefix+(line.endsWith('}')?line:source.slice(start,source.indexOf('\n}',start)+2));}
const names=['defaultGeneralInstructionsLibrary','normalizeInstructionItem','normalizeInstructionFolder','normalizeGeneralInstructions','defaultTechniqueCatalog','normalizeTechniqueItem','normalizeTechniqueCatalog','normalizeCardioItem','normalizeCardioDocument','cardioCanEdit','cardioAllItems','cardioItemById','captureCardioContext','cardioDeleteContextCurrent','cardioWithoutItem','persistCardioDocument','persistCardioMutation','openCardioModule','openEditCardioItem','openAddCardioSubstitution','saveCardioItem','moveCardioSubstitution','catalogPreserveFields','persistSharedCatalog','initializeSharedCatalog','persistGeneralInstructions','persistTechniqueCatalog','captureCatalogEditor','commitCatalogAction','openInstructionFolderModal','saveInstructionFolder','openInstructions','openTechniques','maybePromptInitialInstructions'];
const seed={main:{id:'m',type:'Esteira',durationMinutes:30,daysPerWeek:3},substitutions:[{id:'b',type:'Bike',durationMinutes:30,daysPerWeek:3,order:0},{id:'e',type:'Elíptico',durationMinutes:30,daysPerWeek:3,order:1}]};
function harness(){
 const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{value:'',style:{},textContent:''});return elements.get(id);};
 const remote=new Map([['mealPlans/a',{plans:[{id:'diet'}],other:'keep',cardioPlan:structuredClone(seed)}]]),locks=new Set(),cleared=[],closed=[],renders=[],messages=[];
 let fail=false,localOK=true,afterRead=null,beforeCommit=null,sequence=0,writes=0,caches=0;
 const c=vm.createContext({console,DEFAULT_GENERAL_INSTRUCTIONS_TEXT:'Fixture',DEFAULT_TECHNIQUE_DEFINITIONS:[],CATALOG_EDITOR_CONTEXTS:{},EDIT_INSTRUCTION_FOLDER_ID:'',EDIT_INSTRUCTION_ITEM_ID:'',EDIT_TECHNIQUE_ID:'',CURRENT_USER:{uid:'coach',role:'trainer'},MODE:'cloud',VIEW_STUDENT:{uid:'a'},NAVIGATION_SEQ:0,
  CARDIO_CONTEXT:{trainer:true,local:false,targetUid:'a'},CARDIO_DOCUMENT:structuredClone(seed),CARDIO_EDITOR_CONTEXT:null,EDIT_CARDIO_KIND:'main',EDIT_CARDIO_ITEM_ID:'m',CURRENT_CARDIO_ITEM_ID:'m',LOCAL_DB:{cardioPlan:structuredClone(seed)},
  document:{getElementById:element},uid:()=>`generated-${++sequence}`,cardioOwnerKey:()=>c.CARDIO_CONTEXT.targetUid,canSelfManagePlan:()=>true,
  beginAction:key=>{if(locks.has(key))return false;locks.add(key);return true;},endAction:key=>locks.delete(key),
  beginAsyncNavigation:()=>++c.NAVIGATION_SEQ,isNavigationCurrent:n=>n===c.NAVIGATION_SEQ,showScreen:id=>{renders.push(id);c.NAVIGATION_SEQ++;},activeScreenId:()=> 'screen-home',
  renderCardioScreen:()=>renders.push('cardio'),ensureCardioTimerTicker(){},clearCardioTimer:id=>cleared.push(id),
  openModal(){},closeModal:id=>closed.push(id),focusEditorField(){},showToast:m=>messages.push(m),alert:m=>messages.push(m),cloudWriteError:e=>e.message,
  localSave:()=>localOK,cloudWrite:async p=>p,firebase:{firestore:{FieldValue:{serverTimestamp:()=>123}}},
  normalizeGeneralInstructions:v=>structuredClone(v),normalizeTechniqueCatalog:v=>structuredClone(v),cacheGeneralInstructions:()=>caches++,cacheTechniqueCatalog:()=>caches++,
  renderInstructions:()=>renders.push('instructions'),renderTechniques:()=>renders.push('techniques'),INSTRUCTIONS_PROMPT_RUNNING:false,visibleInstructionCount:()=>1,storageGet:()=>'',instructionAckKey:()=>'',INSTRUCTIONS_FORCED:false,
  db:{collection:collection=>({doc:id=>({key:collection+'/'+id,set:async data=>{if(fail)throw new Error('offline');remote.set(collection+'/'+id,structuredClone(data));writes++;}})}),runTransaction:async task=>{
   let staged=[];const result=await task({get:async ref=>{const value=structuredClone(remote.get(ref.key));if(afterRead)await afterRead();return{exists:!!value,data:()=>value};},set:(ref,data,options)=>staged.push({ref,data,options})});
   if(beforeCommit)await beforeCommit();if(fail)throw new Error('offline');
   for(const {ref,data,options} of staged){const old=remote.get(ref.key)||{};remote.set(ref.key,options?.merge||options?.mergeFields?{...old,...structuredClone(data)}:structuredClone(data));writes++;}
   return result;
  }}
 });
 vm.runInContext(names.map(fn).join('\n')+'\nCARDIO_DOCUMENT=normalizeCardioDocument(CARDIO_DOCUMENT);',c);
 return{c,element,remote,cleared,closed,renders,messages,get writes(){return writes;},get caches(){return caches;},set fail(v){fail=v;},set localOK(v){localOK=v;},set afterRead(v){afterRead=v;},set beforeCommit(v){beforeCommit=v;}};
}
const defer=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve:v=>resolve(v)};};
const json=v=>JSON.stringify(v);

// Two reads complete in the opposite order, through the actual opening action.
{
 const h=harness(),a=defer(),b=defer();h.c.loadCardioDocument=id=>(id==='a'?a:b).promise;
 const first=h.c.openCardioModule('workout',true);h.c.VIEW_STUDENT={uid:'b'};const second=h.c.openCardioModule('diet',true);
 b.resolve({main:{id:'b-plan',type:'Plano B'},substitutions:[]});await second;
 a.resolve({main:{id:'a-plan',type:'Plano A'},substitutions:[]});await first;
 assert.equal(h.c.CARDIO_DOCUMENT.main.id,'b-plan','Stale read A must not replace the active student B plan in memory');assert.equal(h.c.CARDIO_CONTEXT.targetUid,'b');assert.equal(h.renders.filter(x=>x==='cardio').length,1);
}
{
 const h=harness(),gate=defer(),before=json(h.c.CARDIO_DOCUMENT);h.c.loadCardioDocument=()=>gate.promise;
 const opening=h.c.openCardioModule('workout',true);h.c.NAVIGATION_SEQ++;gate.resolve({main:null,substitutions:[]});await opening;
 assert.equal(json(h.c.CARDIO_DOCUMENT),before,'Leaving a screen must not replace its model');assert.equal(h.renders.length,0);
 h.c.loadCardioDocument=async()=>null;assert.equal(await h.c.openCardioModule('workout',true),false);assert.equal(json(h.c.CARDIO_DOCUMENT),before,'A read failure must not masquerade as an empty editable plan');
}
for(const local of [false,true]){
 const h=harness();if(local){h.c.CARDIO_CONTEXT={trainer:false,local:true,targetUid:'local'};h.c.CURRENT_USER=null;}
 h.c.openEditCardioItem('main','m');h.element('input-cardio-duration').value='45';const before=json(h.c.CARDIO_DOCUMENT),localBefore=json(h.c.LOCAL_DB);h.fail=!local;h.localOK=!local;
 assert.equal(await h.c.saveCardioItem(),false);assert.equal(json(h.c.CARDIO_DOCUMENT),before);assert.equal(json(h.c.LOCAL_DB),localBefore);assert.equal(h.cleared.length,0,'Failed save must preserve timer');assert.equal(h.closed.length,0);
 h.fail=false;h.localOK=true;assert.equal(await h.c.saveCardioItem(),true);assert.equal(h.c.CARDIO_DOCUMENT.main.durationMinutes,45);assert.deepEqual(h.cleared,['m']);
}
{
 const h=harness();h.c.openEditCardioItem('main','m');h.element('input-cardio-notes').value='Instrução';assert.equal(await h.c.saveCardioItem(),true);assert.equal(h.cleared.length,0,'Changing notes must preserve a running timer');
}
for(const fail of [false,true]){
 const h=harness(),gate=defer();h.c.openEditCardioItem('main','m');h.beforeCommit=()=>gate.promise;const save=h.c.saveCardioItem();await new Promise(r=>setImmediate(r));
 h.c.CARDIO_CONTEXT={trainer:true,local:false,targetUid:'b'};h.c.VIEW_STUDENT={uid:'b'};h.c.CARDIO_DOCUMENT={main:{id:'b-plan'},substitutions:[]};h.fail=fail;gate.resolve();await save;
 assert.equal(h.c.CARDIO_DOCUMENT.main.id,'b-plan','Late save/rollback must not overwrite the next student');assert.equal(h.closed.length,0);assert.equal(h.renders.length,0);assert.equal(h.cleared.length,0);
}
{
 const h=harness();h.c.openAddCardioSubstitution();h.element('input-cardio-type').value='Escada';h.fail=true;await h.c.saveCardioItem();const id=h.c.EDIT_CARDIO_ITEM_ID;assert(id);h.fail=false;
 const remote=h.remote.get('mealPlans/a');remote.cardioPlan.extra='keep';remote.cardioPlan.substitutions[0].custom='keep too';remote.cardioPlan.substitutions.push({id:'other-device',type:'Caminhada',order:2});
 assert.equal(await h.c.saveCardioItem(),true);assert.equal(h.c.CARDIO_DOCUMENT.substitutions.filter(x=>x.id===id).length,1);assert(h.c.CARDIO_DOCUMENT.substitutions.some(x=>x.id==='other-device'));assert.equal(remote.plans[0].id,'diet');
 const saved=h.remote.get('mealPlans/a');assert.equal(saved.cardioPlan.extra,'keep');assert.equal(saved.cardioPlan.substitutions[0].custom,'keep too');assert.equal(saved.other,'keep');
 // A timeout retry uses the same item ID and must not append a duplicate.
 h.c.openEditCardioItem('substitution',id);assert.equal(await h.c.saveCardioItem(),true);assert.equal(h.remote.get('mealPlans/a').cardioPlan.substitutions.filter(x=>x.id===id).length,1);
}
{
 const h=harness();h.c.openEditCardioItem('main','m');h.element('input-cardio-type').value='Minha edição';h.remote.get('mealPlans/a').cardioPlan.main.type='Edição de outro aparelho';assert.equal(await h.c.saveCardioItem(),false);assert.equal(h.writes,0);assert.equal(h.closed.length,0);
}
{
 const h=harness(),remote=h.remote.get('mealPlans/a');remote.cardioPlan.substitutions.push({id:'new',type:'Escada',order:2});h.fail=true;
 const before=json(h.c.CARDIO_DOCUMENT);assert.equal(await h.c.moveCardioSubstitution('b',1),false);assert.equal(json(h.c.CARDIO_DOCUMENT),before);
 h.fail=false;assert.equal(await h.c.moveCardioSubstitution('b',1),true);assert.equal(h.c.CARDIO_DOCUMENT.substitutions.map(x=>x.id).join(','),'e,b,new');assert.equal(h.remote.get('mealPlans/a').plans[0].id,'diet');
}
// Global libraries: old whole-document writes lose a concurrent edit even if revision is unchanged.
for(const [collection,property,action] of [['trainingInstructions','GENERAL_INSTRUCTIONS','persistGeneralInstructions'],['trainingTechniques','TECHNIQUE_CATALOG','persistTechniqueCatalog']]){
 const h=harness(),field=collection==='trainingInstructions'?'folders':'items',original={revision:1,[field]:[{id:'f',name:'Original',items:[{id:'i',title:'Original'}]}]};h.c[property]=structuredClone(original);
 h.remote.set(collection+'/main',{...structuredClone(original),metadata:'keep'});const draft=structuredClone(original);draft[field][0].name='Minha edição';
 const concurrent=h.remote.get(collection+'/main');concurrent[field][0].name='Outro acesso';
 await assert.rejects(h.c[action](draft),/outro acesso/);assert.equal(h.writes,0);assert.equal(h.caches,0);assert.equal(h.remote.get(collection+'/main')[field][0].name,'Outro acesso');
 h.remote.set(collection+'/main',{...structuredClone(original),metadata:'keep'});h.remote.get(collection+'/main')[field][0].extra='keep too';
 // Unknown metadata is preserved; the comparison normalizes only user-editable fields.
 // The real normalizers ignore metadata for comparison but the writer preserves it.
 await h.c[action](draft);assert.equal(h.remote.get(collection+'/main').metadata,'keep');assert.equal(h.remote.get(collection+'/main')[field].find(x=>x.id==='f').extra,'keep too');assert.equal(h.caches,1);
 const written=h.writes;h.c[property]=structuredClone(original);await h.c[action](draft);assert.equal(h.writes,written,'Retry after an uncertain acknowledgement must accept the same committed draft');
}
{
 const h=harness();h.c.GENERAL_INSTRUCTIONS={revision:1,folders:[{id:'f',name:'Original',active:true,items:[]}]};h.remote.set('trainingInstructions/main',structuredClone(h.c.GENERAL_INSTRUCTIONS));
 h.c.openInstructionFolderModal('f');h.element('input-instruction-folder-name').value='Minha edição';
 // A background catalog refresh must not silently change the base of an open editor.
 h.c.GENERAL_INSTRUCTIONS={revision:2,folders:[{id:'f',name:'Alterada remotamente',active:true,items:[]}]};h.remote.set('trainingInstructions/main',structuredClone(h.c.GENERAL_INSTRUCTIONS));
 assert.equal(await h.c.saveInstructionFolder(),false);assert.equal(h.writes,0);assert.equal(h.closed.length,0);assert.equal(h.element('input-instruction-folder-name').value,'Minha edição');assert.equal(h.remote.get('trainingInstructions/main').folders[0].name,'Alterada remotamente');
}
{
 const h=harness();h.remote.set('trainingInstructions/main',{revision:5,folders:[{id:'existing'}]});const actual=await h.c.initializeSharedCatalog('trainingInstructions',{revision:1,folders:[]},v=>v);assert.equal(actual.revision,5);assert.equal(h.writes,0,'Concurrent catalog initialization must not replace the winner with defaults');
}
for(const action of ['openInstructions','openTechniques']){
 const h=harness(),gate=defer();h.c.loadGeneralInstructions=()=>gate.promise;h.c.loadTechniqueCatalog=()=>gate.promise;
 const opening=h.c[action]();h.c.NAVIGATION_SEQ++;gate.resolve();await opening;assert.equal(h.renders.length,0,'Late catalog navigation must not reopen a screen the user left');
}
console.log('PASS deep actions: stale cardio reads/saves, local/cloud failure and timer preservation, stable creation IDs, concurrent cardio edits/order, catalog conflicts/idempotency, initialization and delayed navigation.');
