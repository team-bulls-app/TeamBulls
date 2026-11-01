import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const core=fs.readFileSync('app_v10_10_9_core.js','utf8').replace(/\r\n/g,'\n');
const v107=fs.readFileSync('modules/v107-core.js','utf8').replace(/\r\n/g,'\n');
const between=(text,start,end)=>text.slice(text.indexOf(start),text.indexOf(end,text.indexOf(start)));

let preservationCalls=0;
const cloudContext=vm.createContext({CLOUD_READ_TIMEOUT_MS:8000,CLOUD_WRITE_TIMEOUT_MS:20000,navigator:{onLine:true},
  document:{querySelector:()=>({id:'modal-exercise'})},window:{TeamBulls107:{preserveModalDraft:id=>{assert.equal(id,'modal-exercise');preservationCalls++;return true;}}},
  setTimeout,clearTimeout,writeAttempts:0});
vm.runInContext(between(core,'function withTimeout(', '\nfunction isNetworkLikeError('),cloudContext);
const fatal=Object.assign(new Error('FIRESTORE (13.1.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: b815) CONTEXT: ca9'),{code:'internal'});
cloudContext.injectedError=fatal;
await vm.runInContext('cloudWrite(Promise.resolve().then(()=>{writeAttempts++;throw injectedError;}),"editar exercício")',cloudContext).catch(()=>{});
assert.equal(preservationCalls,1,'A falha fatal precisa guardar o modal ativo antes de apresentar recuperação.');
assert.equal(cloudContext.writeAttempts,1,'A camada compartilhada não deve repetir uma gravação de resultado incerto.');

const exerciseSave=between(core,'async function saveExercise(){','\n// Session');
assert.ok(exerciseSave.includes("window.confirm?.(message)"),'A recuperação deve pedir autorização explícita antes de recarregar a tela.');
assert.ok(exerciseSave.includes('resultado do salvamento é incerto'),'A interface não pode apresentar uma falha ambígua como se o servidor tivesse recusado a gravação.');
const saveCatch=exerciseSave.slice(exerciseSave.indexOf('}catch(e){'));
assert.ok(!saveCatch.includes('saveExercise()'),'A gravação não pode ser repetida automaticamente após o erro interno.');

function draftHarness(store,confirmResult=true,editExerciseId='exercise-a',catalogReady=true){
  let catalogIsReady=catalogReady;
  const fields={
    'input-exercise-name':{id:'input-exercise-name',type:'text',tagName:'INPUT',value:'Cadeira Extensora',dataset:{},dispatchEvent(){}},
    'input-exercise-instructions':{id:'input-exercise-instructions',type:'textarea',tagName:'TEXTAREA',value:'Orientação anterior',dataset:{},dispatchEvent(){}},
    'input-exercise-catalog-group':{id:'input-exercise-catalog-group',type:'select-one',tagName:'SELECT',value:'',options:[{value:''}],dataset:{},dispatchEvent(event){if(event.type==='change'&&catalogIsReady&&this.value){fields['input-exercise-catalog-item'].options=[{value:''},{value:'extensor'}];}}},
    'input-exercise-catalog-item':{id:'input-exercise-catalog-item',type:'select-one',tagName:'SELECT',value:'',options:[{value:''}],dataset:{},dispatchEvent(event){if(event.type==='change'&&this.value)fields['input-exercise-name'].value='Nome canônico do catálogo';}},
    'secret-field':{id:'secret-field',type:'password',tagName:'INPUT',value:'nao-salvar',dataset:{},dispatchEvent(){}}
  };
  const modal={id:'modal-exercise',dataset:{},classList:{open:false,contains(value){return value==='open'&&this.open;}},
    querySelectorAll(){return Object.values(fields);},contains(field){return Object.values(fields).includes(field);}};
  const toasts=[],confirmations=[];
  const localStorage={get length(){return Object.keys(store).length;},key(index){return Object.keys(store)[index]||null;},removeItem(key){delete store[key];},getItem(key){return store[key]??null;},setItem(key,value){store[key]=String(value);}};
  const document={addEventListener(){},querySelectorAll(){return[];},getElementById(id){return id==='modal-exercise'?modal:fields[id]||null;}};
  const window={TeamBulls107:{},dispatchEvent(){},confirm(message){confirmations.push(message);return confirmResult;}};
  const context=vm.createContext({window,document,localStorage,console:{info(){},warn(){},error(){}},
    CURRENT_USER:{uid:'trainer-a',role:'trainer'},VIEW_STUDENT:{uid:'student-a'},VIEW_STUDENT_WORKOUT:{id:'workout-a'},EDIT_EXERCISE_ID:editExerciseId,
    keyPart:value=>String(value||'local').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,120)||'local',
    contextKey:suffix=>'trainer-a_student-a_'+suffix,
    storageGet:key=>store[key]??null,storageSet:(key,value)=>{store[key]=String(value);return true;},storageRemove:key=>{delete store[key];return true;},
    localRead:(key,fallback)=>{try{return JSON.parse(store['team_bulls_v107_'+key]||'null')??fallback;}catch(error){return fallback;}},
    localWrite:(key,value)=>{store['team_bulls_v107_'+key]=JSON.stringify(value);return true;},
    showToast:message=>toasts.push(message),CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},Event:class{constructor(type,options){this.type=type;this.bubbles=options?.bubbles;}},
    setTimeout,clearTimeout,MAX_FORM_DRAFT_AGE:2*60*60*1000,openModal(id){if(id==='modal-exercise')modal.classList.open=true;},closeModal(id){if(id==='modal-exercise')modal.classList.open=false;}});
  const draftCode=between(v107,'  const DRAFT_DISABLED_MODAL_IDS=', '  /* Rascunho estrutural orientado a alterações.');
  vm.runInContext('const PREFIX="team_bulls_v107_";const TB=window.TeamBulls107;'+draftCode,context);
  return{context,fields,modal,toasts,confirmations,window,setCatalogReady(value){catalogIsReady=value;}};
}

const store={};
const first=draftHarness(store);
first.context.openModal('modal-exercise');
await new Promise(resolve=>setTimeout(resolve,110));
first.fields['input-exercise-name'].value='Agachamento Sissy';
first.fields['input-exercise-instructions'].value='Controle a fase excêntrica por três segundos.';
first.fields['input-exercise-catalog-group'].value='pernas';
first.fields['input-exercise-catalog-item'].value='extensor';
assert.equal(first.window.TeamBulls107.preserveModalDraft('modal-exercise'),true,'Falha crítica do Firestore precisa preservar o formulário aberto.');
const saved=Object.values(store).map(value=>JSON.parse(value)).find(value=>value?.recoveryRequired===true);
assert.ok(saved,'O rascunho precisa ser marcado como pendente de recuperação.');
assert.equal(JSON.stringify(saved).includes('nao-salvar'),false,'Campos de senha nunca podem entrar no rascunho.');

const afterReload=draftHarness(store,true,'exercise-a',false);
afterReload.context.openModal('modal-exercise');
await new Promise(resolve=>setTimeout(resolve,120));
assert.equal(afterReload.confirmations.length,1,'A recuperação deve pedir confirmação quando há valores do servidor diferentes do rascunho.');
assert.equal(afterReload.fields['input-exercise-name'].value,'Agachamento Sissy','Recuperar uma edição precisa substituir o valor base já preenchido pelo editor.');
assert.equal(afterReload.fields['input-exercise-instructions'].value,'Controle a fase excêntrica por três segundos.');
afterReload.fields['input-exercise-catalog-group'].options=[{value:''},{value:'pernas'}];
afterReload.setCatalogReady(true);
await new Promise(resolve=>setTimeout(resolve,180));
assert.equal(afterReload.fields['input-exercise-catalog-group'].value,'pernas','A seleção deve ser recuperada depois do carregamento assíncrono do catálogo.');
assert.equal(afterReload.fields['input-exercise-catalog-item'].value,'extensor');
assert.equal(afterReload.fields['input-exercise-name'].value,'Agachamento Sissy','Restaurar o item do catálogo não pode sobrescrever o nome digitado no rascunho.');

const otherExercise=draftHarness({...store},true,'exercise-b');
otherExercise.context.openModal('modal-exercise');
await new Promise(resolve=>setTimeout(resolve,120));
assert.equal(otherExercise.confirmations.length,0,'O rascunho de um exercício não pode aparecer na edição de outro item do mesmo treino.');
assert.equal(otherExercise.fields['input-exercise-name'].value,'Cadeira Extensora');

const discardStore={...store};
const discard=draftHarness(discardStore,false);
discard.context.openModal('modal-exercise');
await new Promise(resolve=>setTimeout(resolve,120));
assert.equal(discard.fields['input-exercise-name'].value,'Cadeira Extensora','Recusar restauração mantém os dados atualmente carregados do servidor.');
assert.equal(Object.values(discardStore).some(value=>JSON.parse(value)?.recoveryRequired===true),false,'Rascunho explicitamente recusado deve ser removido.');

console.log('APROVADO — rascunho de exercício recuperável após falha crítica, sem persistir senha e com confirmação antes de substituir os dados carregados.');
