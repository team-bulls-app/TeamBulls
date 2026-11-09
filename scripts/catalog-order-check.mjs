import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {fn} from './protocol-cycle-search-check.mjs';
const names=['normalizedName','normalizeExerciseCatalog','mergeExerciseCatalogWithDefaults','normalizeTechniqueItem','normalizeTechniqueCatalog','catalogPreserveFields','persistSharedCatalog','persistTechniqueCatalog','commitCatalogAction','commitExerciseCatalogOrder','moveExerciseOptionItem','moveExerciseGroup','moveTechnique'];
function fixture(){
  const ex={catalogVersion:3,groups:[{id:'g',name:'Grupo',note:'Preservar nota',extra:'group metadata',items:[{id:'a',name:'Primeiro',videoUrl:'https://example.invalid/a',extra:'item metadata'},{id:'b',name:'Segundo',videoUrl:'https://example.invalid/b'},{id:'c',name:'Terceiro',videoUrl:''}]},{id:'h',name:'Outro',items:[]}]};
  const tech={revision:1,items:[{id:'locked',name:'Padrão',code:'P',locked:true,order:0,description:'Texto padrão',videoUrl:'https://example.invalid/p'},{id:'custom',name:'Personalizada',code:'C',order:1,description:'Texto customizado',videoUrl:''}]};
  const remote={exerciseOptions:structuredClone(ex),trainingTechniques:structuredClone(tech)},writes=[],locks=new Set();let fail=false,conflict=false,hold;
  const c={CURRENT_USER:{uid:'t',role:'trainer'},MODE:'cloud',EXERCISE_OPTIONS:structuredClone(ex),TECHNIQUE_CATALOG:structuredClone(tech),EXERCISE_CATALOG_VERSION:3,EXERCISE_OPTIONS_LOADED_AT:0,DEFAULT_TECHNIQUE_DEFINITIONS:[tech.items[0]],defaultExerciseOptions:()=>structuredClone(ex),uid:()=> 'generated',CATALOG_EDITOR_CONTEXTS:{},EDIT_INSTRUCTION_FOLDER_ID:'',EDIT_INSTRUCTION_ITEM_ID:'',EDIT_TECHNIQUE_ID:'',
    db:{collection:name=>({doc:()=>({name})}),runTransaction:async task=>{let staged;const result=await task({get:async r=>{if(conflict)remote[r.name].groups[0].items[0].name='Edited elsewhere';return{exists:true,data:()=>structuredClone(remote[r.name])};},set:(r,p,options)=>{staged={r,p:structuredClone(p),options};}});if(fail)throw new Error('offline');if(hold)await hold;if(staged){remote[staged.r.name]={...remote[staged.r.name],...staged.p};writes.push(staged);}return result;}},firebase:{firestore:{FieldValue:{serverTimestamp:()=>123}}},cloudWrite:p=>p,
    beginAction:k=>{if(locks.has(k))return false;locks.add(k);return true;},endAction:k=>locks.delete(k),cacheExerciseCatalog:()=>c.cached++,cacheTechniqueCatalog:()=>c.cached++,renderExerciseOptions:()=>c.rendered++,renderTechniques:()=>c.rendered++,alert:m=>c.messages.push(m),showToast(){},closeModal(){},cached:0,rendered:0,messages:[]};
  vm.createContext(c);vm.runInContext(names.map(fn).join('\n'),c);c.EXERCISE_OPTIONS=c.mergeExerciseCatalogWithDefaults(ex);c.TECHNIQUE_CATALOG=c.normalizeTechniqueCatalog(tech);
  return{c,remote,writes,locks,setFail:v=>fail=v,setConflict:v=>conflict=v,setHold:v=>hold=v};
}
let count=0;
for(const action of [c=>c.moveExerciseOptionItem('g','b',-1),c=>c.moveExerciseGroup('h',-1),c=>c.moveTechnique('custom',-1)]){
  const f=fixture(),before=JSON.stringify([f.c.EXERCISE_OPTIONS,f.c.TECHNIQUE_CATALOG,f.remote]);f.setFail(true);assert.equal(await action(f.c),false);assert.equal(JSON.stringify([f.c.EXERCISE_OPTIONS,f.c.TECHNIQUE_CATALOG,f.remote]),before);assert.equal(f.c.cached,0);count++;
  f.setFail(false);assert.equal(await action(f.c),true);assert.equal(f.writes.length,1);assert.equal(f.c.cached,1);assert.equal(f.c.rendered,1);count++;
  f.c.CURRENT_USER={uid:'s',role:'student'};assert.equal(await action(f.c),false);assert.equal(f.writes.length,1);count++;
}
{
  const f=fixture();await f.c.moveExerciseOptionItem('g','b',-1);const saved=f.remote.exerciseOptions;assert.deepEqual(saved.groups[0].items.map(i=>i.id),['b','a','c']);assert.equal(saved.groups[0].items[1].videoUrl,'https://example.invalid/a');assert.equal(saved.groups[0].items[1].extra,'item metadata');assert.equal(saved.groups[0].extra,'group metadata');assert.deepEqual([...f.c.mergeExerciseCatalogWithDefaults(saved).groups[0].items].map(i=>i.id),['b','a','c']);count++;
  await f.c.moveExerciseGroup('h',-1);assert.equal(f.c.mergeExerciseCatalogWithDefaults(f.remote.exerciseOptions).groups[0].id,'h');count++;
}
{
  const f=fixture();await f.c.moveTechnique('custom',-1);const items=f.c.normalizeTechniqueCatalog(f.remote.trainingTechniques).items;assert.equal(items[0].id,'custom');assert.equal(items[1].locked,true);assert.equal(items[1].description,'Texto padrão');assert.equal(items[1].videoUrl,'https://example.invalid/p');count++;
}
{
  const f=fixture();f.setConflict(true);assert.equal(await f.c.moveExerciseOptionItem('g','b',-1),false);assert.equal(f.writes.length,0);assert.equal(f.remote.exerciseOptions.groups[0].items[0].name,'Edited elsewhere');assert.equal(f.c.EXERCISE_OPTIONS.groups[0].items[0].id,'a');assert(f.c.messages[0].includes('outro acesso'));count++;
}
{
  const f=fixture();assert.equal(await f.c.moveExerciseOptionItem('g','a',-1),false);assert.equal(await f.c.moveExerciseOptionItem('g','c',1),false);assert.equal(await f.c.moveExerciseGroup('g',3),false);assert.equal(await f.c.moveTechnique('locked',0),false);assert.equal(f.writes.length,0);count++;
}
{
  const f=fixture();let release;f.setHold(new Promise(resolve=>release=resolve));const pending=f.c.moveExerciseOptionItem('g','b',-1);await Promise.resolve();await Promise.resolve();assert.equal(await f.c.moveExerciseGroup('h',-1),false,'Catalog reorder lock is shared across items/groups');f.c.CURRENT_USER={uid:'other',role:'trainer'};release();assert.equal(await pending,false);assert.equal(f.c.cached,0);assert.equal(f.c.rendered,0);count++;
}
console.log(`PASS ${count} catalog ordering scenarios: persistence/reload, failed writes, conflict refusal, metadata/videos, defaults, boundaries, shared locks, owner change and student denial.`);
