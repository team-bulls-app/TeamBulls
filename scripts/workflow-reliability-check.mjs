import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),model=require('../modules/workflow-model-v10_10_71.js');
let passed=0;const test=async(name,run)=>{await run();passed++;console.log('PASS '+name);};
const read=file=>fs.readFileSync(file,'utf8'),core=read('app_v10_10_9_core.js');
const source=name=>{const at=core.indexOf('function '+name+'(');assert(at>=0,name);const line=core.slice(at).split('\n')[0].trimEnd();return line.endsWith('}')?line:core.slice(at,core.indexOf('\n}',at)+2);};
await test('label proportions use the actual table references and account for secondary macros',()=>{
  const result=model.labelCalculation({name:'Leite em pó',serving:20,unit:'g',protein:7.5,carbs:11,fat:0,macro:'protein',portions:1},{protein:15.7,carbs:28,fat:8});
  assert.equal(result.quantity,41.867);assert.equal(result.protein,15.7);assert.equal(result.carbs,23.027);assert.equal(result.portions.carbs,.822);assert.equal(result.portions.fat,0);
  assert.throws(()=>model.labelCalculation({name:'X',serving:20,unit:'g',protein:0,carbs:11,fat:0,macro:'protein',portions:1},{protein:15.7,carbs:28,fat:8}));
  assert.throws(()=>model.labelCalculation({name:'X',serving:20,unit:'g',protein:-7,carbs:11,fat:0,macro:'protein',portions:1},{protein:15.7,carbs:28,fat:8}));
});
await test('preflight finds empty days and missing prescriptions with actionable identities',()=>{
  const issues=model.reviewWorkout({id:'w',name:'Treino',days:[{id:'d1',name:'Superior'},{id:'d2',name:'Inferior'}],exercises:[{id:'e',name:'Supino',dayName:'Superior'}]},()=>[]);
  assert(issues.some(item=>item.type==='day'&&item.dayName==='Inferior'));assert(issues.some(item=>item.type==='prescription'&&item.id==='e'&&item.week===8));
});
await test('diet preflight distinguishes inconsistent portions and unmatched partial calorie totals',()=>{
  const issues=model.reviewDiet({id:'p',name:'Dieta',variants:[{id:'v',name:'Treino',meals:[{id:'m',name:'Almoço',items:'0 Porção de Carboidrato\nAlimento desconhecido'}]}]},()=>({matched:0,total:2,unknown:1}));
  assert(issues.length>0);assert(issues.every(item=>item.variantId==='v'||item.type!=='meal'));
});
await test('change summaries ignore student records and expose prescription edits',()=>{
  const before={id:'w',name:'A',days:[{id:'d',name:'D'}],exercises:[{id:'e',name:'Supino',sets:[{targetMin:6,targetMax:8,ger:3}],sessions:[{id:'s'}]}]},after=structuredClone(before);
  after.exercises[0].sessions.push({id:'s2'});assert.deepEqual(model.changes('workout',model.workoutSnapshot(before),model.workoutSnapshot(after)),[]);
  after.exercises[0].instructions='Controle a descida';assert(model.changes('workout',model.workoutSnapshot(before),model.workoutSnapshot(after)).some(line=>line.includes('Controle a descida')));
  before.exercises[0].weeklyPlan={w1:[{targetMin:6,targetMax:8,ger:3}]};const snapshot=model.workoutSnapshot(before);before.exercises[0].weeklyPlan.w1[0].targetMax=12;assert.equal(snapshot.exercises[0].weeklyPlan.w1[0].targetMax,8,'Review snapshots must not drift with later form edits');
});
await test('period comparison never combines distinct variations, units or modes',()=>{
  const a={from:'2026-10-01',to:'2026-10-31'},b={from:'2026-11-01',to:'2026-11-18'},rows=[{name:'Halteres',group:'h|reps|normal',unit:'reps',mode:'normal',date:'2026-10-15',max:20,reps:20,count:2,volume:400},{name:'Halteres',group:'h|reps|normal',unit:'reps',mode:'normal',date:'2026-11-15',max:25,reps:24,count:3,volume:600},{name:'Máquina',group:'m|seg|normal',unit:'seg',mode:'normal',date:'2026-11-15',max:50,reps:120,count:2,volume:null}];
  const result=model.comparePeriods(rows,a,b);assert.equal(result.length,2);assert.equal(result[0].a.load,20);assert.equal(result[0].b.load,25);assert.equal(result[1].b.volume,null);assert.equal(result[1].a.load,null);
  assert.throws(()=>model.comparePeriods(rows,a,{from:'2026-10-15',to:'2026-11-10'}));assert.equal(model.iso('2026-02-30'),false);
});
await test('diagnostic strips free-form personal data and form contents',()=>{
  const d=model.safeDiagnostic({action:'aluno@example.com',stage:'senha secreta https://abc',category:'permission',at:0,message:'private'});
  assert.equal(d.action,'indisponivel');assert.equal(d.stage,'indisponivel');assert.equal(d.category,'permission');assert(!JSON.stringify(d).includes('private'));
});
await test('isometry detection follows each week, including custom technique names',()=>{
  const c=vm.createContext({TECHNIQUE_CATALOG:{items:[{id:'custom',name:'Agachamento com ISOMETRIA'}]},exerciseTechniqueIds:(ex,w)=>ex.weeks[w],inferExerciseTechniqueWeek:()=>1});
  vm.runInContext(source('exerciseUsesResistedTime'),c);for(const id of ['is','it','custom'])assert.equal(c.exerciseUsesResistedTime({weeks:{1:[id]}},1),true);
  assert.equal(c.exerciseUsesResistedTime({weeks:{1:['it'],2:['bos']}},2),false);
});
await test('seconds above 100 survive normalization, cloning and history; reps remain bounded',()=>{
  const c=vm.createContext({});vm.runInContext(['validClusterReps','sessionFingerprint','normalizePrescriptionSet','normalizePerformedSet','normalizePerformedSets','clonePrescriptionSets'].map(source).join('\n'),c);
  const timed={weight:40,reps:240,targetMin:120,targetMax:240,ger:3,unit:'seconds'};
  assert.equal(c.normalizePerformedSet(timed).reps,240);assert.equal(c.normalizePerformedSet(timed).unit,'seconds');assert.equal(c.clonePrescriptionSets([timed])[0].unit,'seconds');
  assert.equal(c.normalizePerformedSet({...timed,unit:'reps'}),null);assert.equal(c.normalizePerformedSet({...timed,reps:3601}),null);
  assert.equal(c.normalizePerformedSets(Array.from({length:60},()=>timed)).length,60);assert.equal(c.normalizePerformedSets(Array.from({length:61},()=>timed)),null);
  assert.notEqual(c.sessionFingerprint({sets:[{weight:10,reps:30,unit:'seconds'}]}),c.sessionFingerprint({sets:[{weight:10,reps:30,unit:'reps'}]}));
});
await test('saving the support isometry technique preserves custom durations above 100 seconds',async()=>{
  const fields={min:'120',max:'240',ger:'4'};
  const c=vm.createContext({
    PLAN_EDIT_TARGET:'local',PLAN_EDIT_WID:'w',
    v10515NormalPrescriptionRows:()=>[{querySelector:selector=>({value:fields[selector.split('"')[1]]})}],
    localSave:()=>true,getW:()=>({}),v10513RefreshPrescriptionBoards:()=>{}
  });
  vm.runInContext(['normalizePrescriptionSet','normalizeWeeklyPlan','clonePrescriptionSets','buildWeeklyPlanUpdate'].map(source).join('\n')+'\nasync '+source('v10515PersistIsDefaultPrescription'),c);
  const exercise={id:'e',weeklyPlan:{}};
  await c.v10515PersistIsDefaultPrescription(exercise,2);
  assert.deepEqual(JSON.parse(JSON.stringify(exercise.weeklyPlan.w2)),[{targetMin:120,targetMax:240,ger:4,unit:'seconds'}]);
});
await test('bulk GER preserves time and propagation rejects incompatible exercise units atomically',()=>{
  const select=(file,name)=>{const text=read(file),at=text.indexOf('  function '+name+'('),end=text.indexOf('\n  }',at);assert(at>=0&&end>at,name);return text.slice(at,end+4);};
  const c=vm.createContext({exerciseUsesResistedTime:(ex,week)=>!!ex.timed?.[week]});
  vm.runInContext(['normalizePrescriptionSet','normalizeWeeklyPlan','clonePrescriptionSets'].map(source).join('\n')+'\n'+select('modules/ger-bulk-v10_10_9.js','setsWithGer')+'\n'+['clonePlan','cloneSets','normalizedPlan','assertCompatibleUnit','planWithWeeks','addChange','weeksFrom','buildChanges'].map(name=>select('modules/prescription-propagation-v10_10_9.js',name)).join('\n'),c);
  const sets=[{targetMin:120,targetMax:240,ger:3,unit:'seconds'}];assert.equal(c.setsWithGer(sets,5)[0].unit,'seconds');assert.equal(c.setsWithGer(sets,5)[0].targetMax,240);
  const sourceExercise={id:'timed',name:'Isometria',timed:{1:true},weeklyPlan:{}},other={id:'reps',name:'Repetições',weeklyPlan:{}},before=JSON.stringify([sourceExercise,other]);
  assert.throws(()=>c.buildChanges({source:sourceExercise,workout:{exercises:[sourceExercise,other]},week:1,sets,below:[other]},'all-current'),/nenhuma prescrição foi repassada/);assert.equal(JSON.stringify([sourceExercise,other]),before);
});
await test('fallback draft storage is account-bound and never serializes binary/report photo writes',async()=>{
  const records=new Map(),c=vm.createContext({CURRENT_USER:{uid:'a'},MODE:'cloud',setTimeout,clearTimeout,localStorage:{getItem:k=>records.get(k)||null,setItem:(k,v)=>records.set(k,v),removeItem:k=>records.delete(k),get length(){return records.size;},key:i=>[...records.keys()][i]}});c.window=c;
  vm.runInContext(read('modules/workflow-storage-v10_10_71.js'),c);const api=c.TeamBullsWorkflowStorage,scope={owner:'a',subject:'a',kind:'receipt',id:'report:x'};
  const saved=await api.put(scope,{writes:[{photos:'sensitive photo data'}],files:[{blob:'binary'}],status:'pending'});assert.equal(saved.ok,true);assert.equal(saved.media,false);assert(![...records.values()].join('').includes('sensitive photo data'));assert(![...records.values()].join('').includes('binary'));
  c.CURRENT_USER={uid:'b'};assert.equal(await api.get(scope),null);assert.equal((await api.list()).length,0);assert.equal((await api.put(scope,{text:'cross-account'})).ok,false);
});
await test('media rules preserve every existing protected domain and restrict immutable attachments',()=>{
  const old=read('firebase/storage_6.rules'),next=read('firebase/storage_7.rules'),start=next.indexOf('    // Cópias anotadas'),end=next.indexOf('    match /{allPaths=**}',start);
  assert(start>0&&end>start);assert.equal(next.slice(0,start).trimEnd(),old.slice(0,old.indexOf('    match /{allPaths=**}')).trimEnd());
  assert.match(next,/feedback\.get\('attachmentPaths', \[\]\)\.hasAny\(\[path\]\)/);assert.match(next,/allow update: if false;/);assert.match(next,/request\.auth\.uid == trainerUid && trainerOwns\(studentUid\)/);
  assert.equal(JSON.parse(read('firebase.json')).storage.rules,'firebase/storage_7.rules');
  const media=read('modules/feedback-media-v10_10_71.js');assert(!/(?:ref|storage|storageService)\.[^;\n]*\.delete\(/.test(media),'No uncertain upload may delete originals or attachments');
});
await test('all workflow modules are registered in order and delivered by the exact same cache URLs',()=>{
  const loader=read('modules/intelligence-suite-loader-v10_10_42.js'),sw=read('sw.js'),updater=read('update_v10_10_9.js'),index=read('index.html');
  const refs=[...loader.matchAll(/'(\.\/modules\/(?:workflow-|prescription-workflow|isometry-series-timer|feedback-video-tools|feedback-media)[^']+)'/g)].map(m=>m[1]);assert.equal(refs.length,8);
  for(const ref of refs){assert(sw.includes(ref),ref);assert(updater.includes(ref),ref);assert(fs.existsSync(ref.split('?')[0]));}assert.equal(sw,read('sw_47.js'));
  const timer=refs.find(ref=>ref.includes('/isometry-series-timer-')).slice(2);
  const coreScript=index.indexOf('<script defer src="app_v10_10_9_core.js?');
  assert(coreScript>=0&&index.indexOf('<script defer src="'+timer+'"')>coreScript,'Timer must load after core even if optional modules fail');
});
console.log(`Workflow reliability: ${passed} scenarios passed.`);
