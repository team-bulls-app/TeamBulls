import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
import {fixture} from './protocol-cycle-search-check.mjs';

const at=process.argv.indexOf('--baseline');
const baseline=at<0?'':process.argv[at+1];
assert(!baseline||/^[a-f0-9]{7,40}$/.test(baseline));
export const core=baseline?execFileSync('git',['show',baseline+':app_v10_10_9_core.js'],{encoding:'utf8'}):fs.readFileSync('app_v10_10_9_core.js','utf8');
export function source(name){
  const from=core.indexOf('function '+name+'(');assert(from>=0,name);
  const line=core.slice(from).split('\n')[0].trimEnd();
  return(core.slice(from-6,from)==='async '?'async ':'')+(line.endsWith('}')?line:core.slice(from,core.indexOf('\n}',from)+2));
}
export const variantFunctions=['normalizedName','findExerciseGroup','preferredVariantKey','getPreferredVariant','populateVariantSelect','selectedVariantData'];

if(process.argv[1]?.endsWith('session-variant-protocol-check.mjs')){
  let passed=0;const failures=[];
  const test=async(name,run)=>{try{await run();passed++;console.log('PASS '+name);}catch(error){failures.push(name);console.error('FAIL '+name+': '+error.message);}};
  const group={id:'g',name:'Supino Reto',items:[{id:'dumbbell',name:'Supino reto com halteres'},{id:'barbell',name:'Supino reto com barra'}]};
  function catalog(){const saved=new Map();const c=vm.createContext({EXERCISE_OPTIONS:{groups:[group]},CURRENT_USER:{uid:'s'},LOCAL_OWNER_UID:'',localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)}});vm.runInContext(variantFunctions.slice(0,4).map(source).join('\n'),c);return{c,saved};}
  await test('legacy exercise named after its group exposes the authorized alternatives',()=>{const {c}=catalog();assert.equal(c.findExerciseGroup({id:'e',name:'  SUPINO RETO '})?.id,'g');});
  await test('stable catalog item resolves a renamed exercise with an outdated group link',()=>{const {c}=catalog();assert.equal(c.findExerciseGroup({id:'e',name:'Supino orientado',catalogGroupId:'old-group',catalogItemId:'barbell'})?.id,'g');});
  await test('default variant follows the prescribed item rather than the first alternative',()=>{const {c}=catalog();assert.equal(c.getPreferredVariant({id:'e',name:'Supino reto com barra'},group)?.id,'barbell');});
  await test('preference stays scoped to the account and the authorized group',()=>{const {c,saved}=catalog(),exercise={id:'e',name:'Supino reto com barra'};saved.set(c.preferredVariantKey(exercise),'dumbbell');assert.equal(c.getPreferredVariant(exercise,group).id,'dumbbell');c.CURRENT_USER={uid:'other'};assert.equal(c.getPreferredVariant(exercise,group).id,'barbell');saved.set(c.preferredVariantKey(exercise),'foreign-item');assert.equal(c.getPreferredVariant(exercise,group).id,'barbell');});
  const protocol=options=>{const f=fixture(options);vm.runInContext(source('v109PersistWorkoutCycle'),f.c);return f;};
  await test('rename does not depend on an unrelated administrative schedule read',async()=>{const f=protocol({readHook:key=>{if(key==='protocolReviewSchedules/s')throw new Error('schedule unavailable');}});await f.c.v109PersistWorkoutCycle('s','old',{name:'Novo nome',color:'#a855f7',startDate:'2026-09-01',updateDate:'2026-12-01'},{workouts:f.c.VIEW_STUDENT.workouts});assert.equal(f.remote['workouts/old'].name,'Novo nome');assert.deepEqual(f.reads,['workouts/old']);assert.equal(f.remote['protocolReviewSchedules/s'].lastCompletedCycle,2);});
  await test('rename ignores a different workout deleted after the list was loaded',async()=>{const f=protocol();f.c.VIEW_STUDENT.workouts.push({id:'deleted'});await f.c.v109PersistWorkoutCycle('s','old',{name:'Renomeado'},{workouts:f.c.VIEW_STUDENT.workouts});assert.equal(f.remote['workouts/old'].name,'Renomeado');assert(!f.reads.includes('workouts/deleted'));});
  await test('active start-date changes still require an atomic cycle update',async()=>{const f=protocol({readHook:key=>{if(key==='protocolReviewSchedules/s')throw new Error('schedule unavailable');}}),before=JSON.stringify(f.remote);await assert.rejects(f.c.v109PersistWorkoutCycle('s','old',{startDate:'2026-11-10'},{workouts:f.c.VIEW_STUDENT.workouts}),/schedule unavailable/);assert.equal(JSON.stringify(f.remote),before);});
  await test('metadata edit still verifies ownership and the current signed-in account',async()=>{const f=protocol();f.remote['workouts/old'].userId='other';await assert.rejects(f.c.v109PersistWorkoutCycle('s','old',{name:'Denied'},{workouts:f.c.VIEW_STUDENT.workouts}),/pertence/);assert.equal(f.writes.length,0);const g=protocol({readHook:()=>{g.c.CURRENT_USER={uid:'other',role:'trainer'};}});await assert.rejects(g.c.v109PersistWorkoutCycle('s','old',{name:'Denied'},{workouts:g.c.VIEW_STUDENT.workouts}),/conta mudou/i);assert.equal(g.writes.length,0);});
  console.log(`Variant/protocol scenarios: ${passed} passed; ${failures.length} failed`);if(failures.length)process.exitCode=1;
}
