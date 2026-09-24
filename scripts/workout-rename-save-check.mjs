import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const core=fs.readFileSync('app_v10_10_9_core.js','utf8');
const operations=fs.readFileSync('modules/v107-core.js','utf8');
const page=fs.readFileSync('index.html','utf8');
const between=(text,start,end)=>{
  const from=text.indexOf(start),to=text.indexOf(end,from+start.length);
  assert(from>=0&&to>from,`Trecho real não encontrado: ${start}`);
  return text.slice(from,to);
};

// O histórico hidratado não participa da gravação do protocolo. Um registro
// grande ou malformado não pode impedir a função de salvar de começar.
const snapshotSource=between(operations,'  function sanitizeWorkout(workout,','  function currentWorkouts()');
const snapshotContext={
  clone:value=>{try{return JSON.parse(JSON.stringify(value??null));}catch{return null;}},
  stripFirestoreValue:value=>value,
  uid:()=> 'generated'
};
vm.createContext(snapshotContext);
vm.runInContext(snapshotSource+'\nthis.sanitizeWorkout=sanitizeWorkout;',snapshotContext);
const hostileSession={toJSON(){throw new Error('Histórico indisponível');}};
const plan=snapshotContext.sanitizeWorkout({id:'w1',name:'Protocolo antigo',exercises:[{id:'e1',name:'Agachamento',sessions:[hostileSession]}]});
assert.equal(plan.name,'Protocolo antigo');
assert.equal(plan.exercises[0].name,'Agachamento');
assert.equal(plan.exercises[0].sessions,undefined);

assert(page.includes('onclick="saveWorkoutFromButton()"'),'Botão não usa o caminho protegido de salvamento.');
assert(page.includes('id="workout-save-status"'),'Editor não exibe o estado de salvamento.');
assert(page.includes('app_v10_10_9_core.js?v=10.10.9-workoutrename1'));
assert(page.includes('modules/v107-core.js?v=10.10.9-snapshot1'));

const saveSource=between(core,'async function saveWorkout(){','// Day folders — hierarchy');
async function runTrainerRename({writeFails=false}={}){
  const currentName='Protocolo antigo',newName='Protocolo atualizado';
  const original={id:'w1',name:currentName,color:'#e11d48',startDate:'2026-08-24',updateDate:'2026-09-21',exercises:[{id:'e1',name:'Agachamento'}]};
  const persisted={...original};
  const title={textContent:currentName},card={dataset:{workoutId:'w1'},style:{setProperty(){}},querySelector:()=>title};
  const modal={open:true},status={textContent:'',style:{color:''}};
  const fields={'input-workout-name':{value:newName},'input-workout-start-date':{value:original.startDate},'input-workout-update-date':{value:original.updateDate},'workout-save-status':status};
  const updates=[];
  const context={
    document:{getElementById:id=>fields[id]||null,querySelectorAll:selector=>selector==='#ts-workout-list .workout-card'?[card]:[]},
    VIEW_STUDENT:{uid:'student-1',workouts:[original]},VIEW_STUDENT_WORKOUT:original,
    CURRENT_USER:{uid:'trainer-1',role:'trainer'},MODE:'cloud',MODAL_TARGET:'student',EDIT_W:'w1',SEL_COLOR:'#e11d48',WORKOUT_CREATE_ID:null,
    today:()=> '2026-09-24',addDaysIso:()=> '2026-10-22',validIsoDate:value=>/^\d{4}-\d{2}-\d{2}$/.test(value),
    normalizedName:value=>String(value||'').trim().toLowerCase(),beginAction:()=>true,endAction:()=>{},
    setWorkoutSaveStatus:(message,error)=>{status.textContent=message;status.style.color=error?'red':'';},
    db:{collection:collection=>({where:()=>({}),doc:id=>({update:async changes=>{updates.push({collection,id,changes});if(writeFails)throw new Error('Servidor indisponível');Object.assign(persisted,changes);}})})},
    cloudGet:async()=>({docs:[{id:'w1',data:()=>({name:currentName})}]}),cloudWrite:promise=>promise,
    closeModal:()=>{modal.open=false;},showToast:()=>{},
    renderTrainerStudent:async()=>{if(!writeFails){context.VIEW_STUDENT.workouts=[{...original,name:currentName}];title.textContent=currentName;}},
    console:{error:()=>{}}
  };
  vm.createContext(context);
  vm.runInContext(saveSource+'\nthis.runSave=saveWorkout;',context);
  await context.runSave();
  assert.equal(updates.length,1,'Editar deve escrever um documento existente uma só vez.');
  assert.equal(updates[0].collection,'workouts');
  assert.equal(updates[0].id,'w1');
  assert.equal(updates[0].changes.name,newName);
  assert.deepEqual(Object.keys(updates[0].changes).sort(),['color','name','startDate','updateDate']);
  assert.equal(original.exercises[0].name,'Agachamento','Exercícios devem permanecer intactos.');
  if(writeFails){
    assert.equal(modal.open,true,'Falha no servidor deve manter o editor aberto.');
    assert.match(status.textContent,/Erro ao salvar treino/);
    assert.equal(title.textContent,currentName);
  }else{
    assert.equal(modal.open,false,'Confirmação do servidor deve fechar o editor.');
    assert.equal(persisted.name,newName);
    assert.equal(context.VIEW_STUDENT.workouts[0].name,newName,'Leitura atrasada do cache não pode desfazer o nome.');
    assert.equal(title.textContent,newName,'O card deve mostrar o nome salvo.');
  }
}
await runTrainerRename();
await runTrainerRename({writeFails:true});
console.log('APROVADO — renomear protocolo grava no documento correto, preserva exercícios, informa falhas e mantém o nome confirmado mesmo com leitura antiga do cache.');
