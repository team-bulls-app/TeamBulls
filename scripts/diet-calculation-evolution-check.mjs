import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const math=require('../modules/diet-calculation-math-v10_10_9.js');
const ui=fs.readFileSync(new URL('../modules/diet-calculation-evolution-v10_10_9.js',import.meta.url),'utf8');
const config=fs.readFileSync(new URL('../config_v10_7.js',import.meta.url),'utf8');
const firebaseConfig=JSON.parse(fs.readFileSync(new URL('../firebase.json',import.meta.url),'utf8'));
const activeRules=String(firebaseConfig?.firestore?.rules||'');
assert.match(activeRules,/^firebase\/firestore_\d+_compacto\.rules$/,'firebase.json não aponta para regras Firestore versionadas');
const rules=fs.readFileSync(new URL('../'+activeRules,import.meta.url),'utf8');

const close=(actual,expected,tolerance=0.001)=>assert.ok(Math.abs(actual-expected)<=tolerance,`esperado ${expected}, recebido ${actual}`);

const female=math.calculate({sex:'female',actualWeightKg:73,heightCm:170,ageYears:52,activityFactor:1.5,referenceMode:'real',macros:{animalProtein:100,plantProtein:20,carbs:200,fat:50}});
close(female.tmbKcal,1425,0.01);
close(female.baseGcdKcal,2137,0.01);
close(math.idealWeightKg('female',170),65.025,0.001);

const male=math.calculate({sex:'male',actualWeightKg:77,heightCm:182,ageYears:19,activityFactor:1.6,referenceMode:'real'});
close(male.tmbKcal,1906,0.01);
close(male.baseGcdKcal,3050,0.01);
close(math.idealWeightKg('male',182),71.2166,0.001);

const idealReference=math.calculate({sex:'male',actualWeightKg:100,heightCm:182,ageYears:30,activityFactor:1.5,referenceMode:'ideal'});
close(idealReference.referenceWeightKg,71.2,0.01);
assert.notEqual(idealReference.tmbKcal,math.calculate({sex:'male',actualWeightKg:100,heightCm:182,ageYears:30,activityFactor:1.5,referenceMode:'real'}).tmbKcal,'peso ideal precisa alterar a base da TMB');

const macros=math.macroMetrics({animalProtein:100,plantProtein:20,carbs:200,fat:50},80);
assert.equal(macros.totalKcal,1730);
close(macros.animalProtein.gramsPerKg,1.25,0.001);
close(macros.fat.kcal,450,0.001);

assert.match(ui,/const STORAGE_COLLECTION='dietCalculations'/,'cálculo privado deve usar coleção dedicada');
assert.doesNotMatch(ui,/collection\(['"]mealPlans['"]\).*set\(/s,'módulo não pode gravar cálculos internos em mealPlans');
assert.match(ui,/trainer\(\).*calculatorShell/s,'painel de cálculo deve ser condicionado ao treinador');
assert.match(ui,/fetchWeeklyCheckins/,'evolução deve reaproveitar relatórios semanais existentes');
assert.match(ui,/não cria uma segunda base de dados/,'UI deve explicar a fonte única do gráfico');
assert.match(ui,/profileCache\.clear\(\)/,'cache privado deve ser limpo ao sair da conta');
assert.match(config,/diet-calculation-math-v10_10_9\.js\?v=10\.10\.10-dietmath1/,'módulo matemático não está carregado');
assert.match(config,/diet-calculation-evolution-v10_10_9\.js\?v=10\.10\.10-dietcalc2/,'módulo visual não está carregado');
assert.equal(activeRules,'firebase/firestore_28_compacto.rules','release atual deve validar dietCalculations sob Rules 28');
assert.match(rules,/match \/dietCalculations\/\{uid\}/,'regras privadas de dietCalculations ausentes');
assert.match(rules,/match \/dietCalculations\/\{uid\} \{\s*allow read: if trainerOwns\(uid\);/,'primeira leitura do cálculo deve depender apenas do vínculo do treinador, inclusive quando o documento ainda não existe');
assert.doesNotMatch(rules,/match \/dietCalculations\/\{uid\} \{\s*allow read:[^;]*resource\.data/s,'leitura inicial não pode depender de resource.data de um documento inexistente');
assert.doesNotMatch(rules,/match \/dietCalculations[\s\S]*activeOwner\(uid\)/,'aluno não pode receber acesso aos cálculos privados');


function calculatorEnvironment(){
  const fields={sex:'male',actualWeightKg:'80',heightCm:'180',ageYears:'30',activityFactor:'1.5',referenceMode:'real',manualReferenceWeightKg:'0',manualAdjustmentKcal:'0',animalProtein:'120',plantProtein:'20',carbs:'200',fat:'50'};
  const status={textContent:''},button={disabled:false,isConnected:true},shell={dataset:{studentUid:'s'},isConnected:true};
  const body={querySelector:selector=>selector==='.tb-calc-save'?button:{value:fields[/data-calc="([^"]+)"/.exec(selector)?.[1]]}};
  const actions=new Set(),writes=[],documents=new Map(),messages=[];
  let commits=0,fail=false,hold=null,readHook=null,retry=false;
  const ctx={console:{error(){}},CURRENT_USER:{uid:'t',role:'trainer'},VIEW_STUDENT:{uid:'s'},DIET_CONTEXT:{targetUid:'s'},AUTH_STATE_REVISION:1,
    window:{TeamBullsDietMath:math},document:{getElementById:id=>({'tb-diet-calc-body':body,'tb-calc-status':status,'tb-diet-calculator':shell,'tb-diet-calc-evolution-style':{}}[id])},
    showToast:message=>messages.push(message),beginAction:key=>{if(actions.has(key))return false;actions.add(key);return true;},endAction:key=>actions.delete(key),
    cloudWrite:promise=>promise,firebase:{firestore:{FieldValue:{serverTimestamp:()=>({serverTime:true})}}},
    db:{collection:name=>{assert.equal(name,'dietCalculations','Internal calculations must stay private');return{doc:id=>({id})};},
      runTransaction:async callback=>{
        for(let attempt=0;attempt<2;attempt++){
          let staged=null;
          await callback({
            get:async ref=>{await readHook?.();return{exists:documents.has(ref.id),data:()=>structuredClone(documents.get(ref.id))};},
            set:(ref,data)=>{staged={ref,data,create:true};},
            update:(ref,data)=>{staged={ref,data,create:false};}
          });
          if(hold)await hold;
          if(fail)throw new Error('simulated write failure');
          if(retry&&attempt===0){retry=false;documents.set('s',{schemaVersion:1,studentId:'s',trainerId:'t',createdAt:{seconds:42},updatedAt:{seconds:42}});continue;}
          assert(staged);
          const previous=documents.get(staged.ref.id),saved=structuredClone(staged.data);
          if(previous){
            assert(!staged.create);
            for(const key of ['schemaVersion','studentId','trainerId','createdAt'])assert(!Object.hasOwn(saved,key),key+' must remain untouched during an update');
          }
          for(const [key,value] of Object.entries(saved))if(value?.serverTime)saved[key]={seconds:100+commits};
          documents.set(staged.ref.id,{...previous,...saved});writes.push(staged);commits++;return;
        }
      }}
  };
  vm.createContext(ctx);vm.runInContext(ui,ctx);
  return{ctx,documents,fields,writes,button,status,messages,actions,
    api:ctx.window.TeamBullsDietCalculator,setFail:value=>fail=value,setHold:value=>hold=value,setReadHook:fn=>readHook=fn,setRetry:()=>retry=true};
}
{
  const e=calculatorEnvironment();
  assert.equal(await e.api.save(),true);
  const created=structuredClone(e.documents.get('s').createdAt);
  e.fields.actualWeightKg='81';
  assert.equal(await e.api.save(),true,'Immediate second save must update the existing calculation');
  assert.deepEqual(e.documents.get('s').createdAt,created);
  assert.equal(e.documents.get('s').actualWeightKg,81);
  assert.equal(e.writes[1].create,false);
  const previous=structuredClone(e.documents.get('s'));
  e.setFail(true);
  assert.equal(await e.api.save(),false);
  assert.deepEqual(e.documents.get('s'),previous,'Failed update must preserve the stored calculation');
  assert.equal(e.button.disabled,false);
  assert.equal(e.actions.size,0);
  e.setFail(false);
  assert.equal(await e.api.save(),true,'Failure must allow a subsequent retry');
}
{
  const e=calculatorEnvironment();let release,started;
  const read=new Promise(resolve=>started=resolve);
  e.setHold(new Promise(resolve=>release=resolve));
  e.setReadHook(()=>started());
  const first=e.api.save();await read;
  assert.equal(await e.api.save(),false,'A second click cannot start an overlapping save');
  release();assert.equal(await first,true);assert.equal(e.writes.length,1);
}
{
  const e=calculatorEnvironment();e.setRetry();
  assert.equal(await e.api.save(),true,'A transaction retried after another create must use update');
  assert.equal(e.writes[0].create,false);
  assert.deepEqual(e.documents.get('s').createdAt,{seconds:42});
}
{
  const e=calculatorEnvironment();
  e.setReadHook(()=>{e.ctx.DIET_CONTEXT={targetUid:'other'};});
  assert.equal(await e.api.save(),false);
  assert.equal(e.writes.length,0,'Changing students during the read must not write either profile');
}
{
  const e=calculatorEnvironment();e.ctx.CURRENT_USER={uid:'s',role:'student'};
  assert.equal(await e.api.save(),false);assert.equal(e.writes.length,0);
}
console.log(`APROVADO — fórmulas masculina/feminina, macros, primeira leitura privada e evolução validadas sob ${activeRules}.`);
