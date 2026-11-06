import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {spawnSync} from 'node:child_process';
const baselineIndex=process.argv.indexOf('--baseline'),baseline=baselineIndex<0?null:process.argv[baselineIndex+1];
assert(baselineIndex<0||/^[a-f0-9]{7,40}$/.test(baseline||''));
const source=baseline?spawnSync('git',['show',`${baseline}:app_v10_10_9_core.js`],{encoding:'utf8'}).stdout:fs.readFileSync('app_v10_10_9_core.js','utf8');
function fn(name){const start=source.indexOf(`function ${name}(`);if(start<0)return '';const line=source.slice(start).split('\n')[0].trimEnd(),prefix=source.slice(start-6,start)==='async '?'async ':'';return prefix+(line.endsWith('}')?line:source.slice(start,source.indexOf('\n}',start)+2));}
const actions=['saveInstructionFolder','saveInstructionItem','toggleInstructionFolder','toggleInstructionItem','deleteInstructionFolder','deleteInstructionItem','moveInstructionFolder','moveInstructionItem','saveTechnique','deleteTechnique'];
const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{value:'',disabled:false,style:{},classList:{remove(){}},removeAttribute(){}});return elements.get(id);};
let attempted=[],sequence=0,fail=false,writes=0,cached=0,closed=[],confirm,hold=null,rendered=0;const locks=new Set();
const c=vm.createContext({console,CURRENT_USER:{uid:'trainer',role:'trainer'},MODE:'cloud',EDIT_INSTRUCTION_FOLDER_ID:'f1',EDIT_INSTRUCTION_ITEM_ID:'i1',EDIT_TECHNIQUE_ID:'t1',
 document:{getElementById:element},uid:()=> 'new-'+(++sequence),extractYouTubeId:()=>true,
 normalizeGeneralInstructions:data=>structuredClone(data),normalizeTechniqueCatalog:data=>structuredClone(data),
 cacheGeneralInstructions:()=>cached++,cacheTechniqueCatalog:()=>cached++,cloudWrite:async p=>p,
 firebase:{firestore:{FieldValue:{serverTimestamp:()=>123}}},db:{collection:()=>({doc:()=>({set:async payload=>{attempted.push(structuredClone(payload));if(fail)throw new Error('network');if(hold)await hold;writes++;}})})},
 beginAction:(key)=>{if(locks.has(key))return false;locks.add(key);return true;},endAction:key=>locks.delete(key),
 renderInstructions:()=>rendered++,renderTechniques:()=>rendered++,showToast(){},alert(){},closeModal:id=>closed.push(id),showConfirm:(_title,_text,cb)=>{confirm=cb;}});
vm.runInContext(['persistGeneralInstructions','persistTechniqueCatalog','commitCatalogAction',...actions].map(fn).join('\n'),c);
function setup(){
 c.CURRENT_USER={uid:'trainer',role:'trainer'};c.GENERAL_INSTRUCTIONS={revision:1,folders:[{id:'f1',name:'Original',active:true,items:[{id:'i1',title:'Original',text:'Texto',active:true},{id:'i2',title:'Segundo',active:true}]},{id:'f2',name:'Destino',active:true,items:[]}]};c.TECHNIQUE_CATALOG={revision:1,items:[{id:'t1',code:'T',name:'Original',description:'Texto'}]};
 for(const [id,value] of Object.entries({'input-instruction-folder-name':'Renomeada','input-instruction-folder-active':'true','input-instruction-item-folder':'f2','input-instruction-item-title':'Nova orientação','input-instruction-item-text':'Novo texto','input-instruction-item-video':'','input-instruction-item-active':'true','input-technique-code':'NEW','input-technique-name':'Nova técnica','input-technique-description':'Descrição nova','input-technique-video':''}))element(id).value=value;
 writes=0;cached=0;closed=[];attempted=[];sequence=0;c.EDIT_INSTRUCTION_FOLDER_ID='f1';c.EDIT_INSTRUCTION_ITEM_ID='i1';c.EDIT_TECHNIQUE_ID='t1';confirm=null;rendered=0;fail=false;locks.clear();hold=null;
}
const run=code=>vm.runInContext(code,c);
const expressions=['saveInstructionFolder()','saveInstructionItem()','toggleInstructionFolder("f1")','toggleInstructionItem("f1","i1")','deleteInstructionFolder("f1")','deleteInstructionItem("f1","i1")','moveInstructionFolder("f1",1)','moveInstructionItem("f1","i1",1)','saveTechnique()','deleteTechnique("t1")'];
for(const expression of expressions){
 setup();const before=JSON.stringify([c.GENERAL_INSTRUCTIONS,c.TECHNIQUE_CATALOG]);fail=true;
 let result=await run(expression);if(confirm)result=await confirm();
 assert.equal(JSON.stringify([c.GENERAL_INSTRUCTIONS,c.TECHNIQUE_CATALOG]),before,`${expression}: failed save must not change the library`);
 assert.equal(cached,0,`${expression}: failed save must not change persistent cache`);assert.equal(closed.length,0);assert.equal(result,false);
 fail=false;confirm=null;result=await run(expression);if(confirm)result=await confirm();assert.equal(result,true,expression);assert.equal(writes,1);assert.equal(cached,1);assert.equal(rendered,1);assert.notEqual(JSON.stringify([c.GENERAL_INSTRUCTIONS,c.TECHNIQUE_CATALOG]),before);
 setup();c.CURRENT_USER={uid:'student',role:'student'};await run(expression);assert.equal(writes,0);assert.equal(confirm,null,`${expression}: student cannot start delete`);
}

for(const [name,idField,records] of [['saveInstructionFolder','EDIT_INSTRUCTION_FOLDER_ID',p=>p.folders],['saveInstructionItem','EDIT_INSTRUCTION_ITEM_ID',p=>p.folders.find(f=>f.id==='f2').items],['saveTechnique','EDIT_TECHNIQUE_ID',p=>p.items]]){
 setup();c[idField]='';fail=true;await run(name+'()');const id=records(attempted[0]).at(-1).id;fail=false;await run(name+'()');assert.equal(records(attempted[1]).at(-1).id,id,'Retry preserves new record ID: '+name);assert.equal(closed.length,1,'Successful creation closes editor');
}
setup();let release;hold=new Promise(resolve=>release=resolve);const pending=run('saveInstructionFolder()');await Promise.resolve();assert.equal(await run('toggleInstructionFolder("f1")'),false,'Shared catalog lock prevents overlapping mutations');
c.CURRENT_USER={uid:'other',role:'trainer'};release();await pending;assert.equal(cached,0,'Late write cannot refresh another session');assert.equal(closed.length,0);
// Cardio arrow: a failed persistence must restore both order and local copy.
setup();c.CARDIO_CONTEXT={trainer:true,targetUid:'a',local:false};c.VIEW_STUDENT={uid:'a'};c.CARDIO_DOCUMENT={main:null,substitutions:[{id:'a',type:'Bike',order:0},{id:'b',type:'Elíptico',order:1}]};c.LOCAL_DB={};
c.cardioCanEdit=()=>true;c.cardioOwnerKey=()=> 'a';c.renderCardioScreen=()=>rendered++;c.cloudWriteError=e=>e.message;c.normalizeCardioDocument=data=>structuredClone(data);
c.persistCardioDocument=async()=>{if(fail)throw new Error('network');};
vm.runInContext(fn('cardioDeleteContextCurrent')+'\n'+fn('moveCardioSubstitution'),c);
fail=true;const order=JSON.stringify(c.CARDIO_DOCUMENT);assert.equal(await run('moveCardioSubstitution("a",1)'),false);assert.equal(JSON.stringify(c.CARDIO_DOCUMENT),order,'Failed reorder must restore the original order');
fail=false;assert.equal(await run('moveCardioSubstitution("a",1)'),true);assert.equal(c.CARDIO_DOCUMENT.substitutions[0].id,'b');
console.log('PASS 10 catalog actions: reject/unchanged cache, successful save, student denied; shared lock, late owner change and cardio reorder rollback.');
