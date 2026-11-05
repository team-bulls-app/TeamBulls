import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';
const core=fs.readFileSync('app_v10_10_9_core.js','utf8');
function extract(name){const start=core.indexOf(`function ${name}(`);assert(start>=0,name);const end=core.indexOf('\n}',start);return (core.slice(start-6,start)==='async '?'async ':'')+core.slice(start,end+2);}
// Single-line functions need their own boundary rather than the next brace.
function fn(name){const start=core.indexOf(`function ${name}(`),line=core.slice(start).split('\n')[0].trimEnd();return line.endsWith('}')?line:extract(name);}
let callback,fail=false,localOK=true,afterRead=null,rendered=0,cleared=[],writes=0,locked=false;
const main={id:'m',type:'Esteira',durationMinutes:30,daysPerWeek:3},bike={id:'b',type:'Bicicleta',durationMinutes:30,daysPerWeek:7},elliptical={id:'e',type:'Elíptico',durationMinutes:30,daysPerWeek:7};
const document={main,substitutions:[bike,elliptical]};let remote={plans:[{id:'diet'}],other:'preservado',cardioPlan:structuredClone(document)};
const c=vm.createContext({console,CARDIO_DOCUMENT:structuredClone(document),CARDIO_CONTEXT:{trainer:true,local:false,targetUid:'a'},CURRENT_USER:{uid:'coach',role:'trainer'},VIEW_STUDENT:{uid:'a'},CURRENT_CARDIO_ITEM_ID:'e',EDIT_CARDIO_KIND:'substitution',EDIT_CARDIO_ITEM_ID:'e',LOCAL_DB:{cardioPlan:structuredClone(document)},
 uid:()=> 'generated',canSelfManagePlan:()=>true,cardioOwnerKey:()=>c.CARDIO_CONTEXT.targetUid,
 showConfirm:(_title,_text,cb)=>{callback=cb;},showToast(){},alert(){},cloudWriteError:e=>e.message,
 beginAction:()=>{if(locked)return false;locked=true;return true;},endAction:()=>{locked=false;},
 closeModal(){},renderCardioScreen:()=>rendered++,clearCardioTimer:id=>cleared.push(id),localSave:()=>localOK,
 firebase:{firestore:{FieldValue:{serverTimestamp:()=>123}}},cloudWrite:async p=>p,
 db:{collection:name=>{assert.equal(name,'mealPlans');return{doc:id=>{assert.equal(id,'a');return{id};}};},runTransaction:async task=>{
  let payload,options;const result=await task({get:async()=>{if(afterRead)afterRead();return{exists:true,data:()=>structuredClone(remote)};},set:(_ref,value,opts)=>{payload=value;options=opts;}});
  if(fail)throw new Error('offline');assert.deepEqual(Array.from(options.mergeFields),['cardioPlan','cardioUpdatedBy','cardioUpdatedAt']);remote={...remote,...payload};writes++;return result;
 }}
});
vm.runInContext(['normalizeCardioItem','normalizeCardioDocument','cardioCanEdit','cardioDeleteContextCurrent','cardioWithoutItem','deleteCardioItem','deleteCardioItemConfirmed'].map(fn).join('\n'),c);
const run=s=>vm.runInContext(s,c);
assert.equal(run('normalizeCardioDocument({main:null,primary:{id:"legacy",type:"Antigo"}}).main'),null,'Explicit deletion must override a legacy alias');
run('deleteCardioItem("substitution","e")');assert.equal(c.CARDIO_DOCUMENT.substitutions.length,2,'Confirmation must not mutate data');
fail=true;assert.equal(await callback(),false);assert.equal(c.CARDIO_DOCUMENT.substitutions.length,2);assert.equal(c.CURRENT_CARDIO_ITEM_ID,'e');assert.equal(cleared.length,0);assert.equal(writes,0);fail=false;
// A different session added a cardio after this screen loaded.
remote.cardioPlan.extraMetadata='keep';remote.cardioPlan.substitutions[0].extraInstruction='keep too';remote.cardioPlan.substitutions.push({id:'new',type:'Escada'});assert.equal(await callback(),true);assert.equal(c.CARDIO_DOCUMENT.substitutions.map(x=>x.id).join(','),'b,new');assert.equal(c.CURRENT_CARDIO_ITEM_ID,'m');assert.equal(cleared.join(','),'e');assert.equal(remote.plans[0].id,'diet');assert.equal(remote.other,'preservado');assert.equal(remote.cardioPlan.extraMetadata,'keep');assert.equal(remote.cardioPlan.substitutions[0].extraInstruction,'keep too');assert.equal(rendered,1);
run('deleteCardioItem("main","m")');await callback();assert.equal(remote.cardioPlan.main,null);assert.equal(remote.cardioPlan.substitutions.length,2);
run('deleteCardioItem("substitution","b")');c.VIEW_STUDENT={uid:'other'};assert.equal(await callback(),false);assert.equal(writes,2);c.VIEW_STUDENT={uid:'a'};
run('deleteCardioItem("substitution","b")');afterRead=()=>{c.CARDIO_CONTEXT={...c.CARDIO_CONTEXT,targetUid:'other'};};assert.equal(await callback(),false);assert.equal(writes,2);afterRead=null;
c.CARDIO_CONTEXT={trainer:false,local:false,targetUid:'a'};c.CURRENT_USER={uid:'a',role:'student'};assert.equal(run('deleteCardioItem("substitution","b")'),false);
c.CARDIO_CONTEXT={trainer:false,local:true,targetUid:'local'};c.CURRENT_USER=null;c.CARDIO_DOCUMENT=structuredClone(document);localOK=false;run('deleteCardioItem("substitution","e")');await callback();assert.equal(c.LOCAL_DB.cardioPlan.substitutions.length,2);assert.equal(c.CARDIO_DOCUMENT.substitutions.length,2);localOK=true;assert.equal(await callback(),true);assert.equal(c.LOCAL_DB.cardioPlan.substitutions.length,1);
const card=fn('cardioItemCard');assert(card.includes('cardio-delete-btn'));const video=core.slice(core.indexOf('function renderExerciseVideo('),core.indexOf('function openExerciseVideoModal('));assert(!video.includes('cardio-delete-btn'));
console.log('PASS cardio delete: confirmation, failed write/timer preservation, retry, latest remote substitutions, diet preservation, legacy alias, student denial, navigation race and local rollback.');
