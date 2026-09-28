import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const integrity=fs.readFileSync('modules/weekly-report-integrity-v10_10_58.js','utf8');
const access=fs.readFileSync('modules/weekly-report-access-v10_10_28.js','utf8');
const bulk=fs.readFileSync('modules/app-update-v10_10_9.js','utf8');
const start=integrity.indexOf('  const identity=request=>');
const end=integrity.indexOf('  function unwrapFetchGuard(',start);
assert(start>=0&&end>start);
const context={window:{},document:{getElementById:()=>({classList:{contains:()=>false}})},CURRENT_USER:{uid:'student-1'},console};
vm.createContext(context);
vm.runInContext(`
  let formRequest=null,submissionRequest=null,opening=false,opened=0;
  const student=()=>true,notify=()=>{};
  const refreshCanonicalRequest=async()=>({kind:'manual',requestKey:'manual:extra-1',dueDate:'2026-09-28',pending:true});
  function openWeeklyCheckinModal(){if(!formRequest)return false;opened++;return true;}
  function openState(){return {opened,opening,formRequest};}
  ${integrity.slice(start,end)}
`,context);
context.installOpenGuard();
const guarded=context.openWeeklyCheckinModal;
const accessWrapper=function(){return guarded.apply(this,arguments);};
accessWrapper.__tbWeeklyAccess=true;accessWrapper.__tbBase=guarded;
context.openWeeklyCheckinModal=accessWrapper;
context.installOpenGuard();
assert.equal(context.openWeeklyCheckinModal,accessWrapper,'reinstalação não pode colocar outra guarda por fora do acesso');
assert.equal(await context.openWeeklyCheckinModal(),true,'toque no relatório extra deve abrir o formulário');
assert.equal(context.openState().opened,1);

const bulkWrapper=async function(){return context.openWeeklyCheckinModal.__tbBase.apply(this,arguments);};
bulkWrapper.__tbBulk=true;bulkWrapper.__tbBase=accessWrapper;
context.openWeeklyCheckinModal=bulkWrapper;
context.installOpenGuard();
assert.equal(context.openWeeklyCheckinModal,bulkWrapper,'instalação da seleção de seis fotos não duplica a guarda');
assert.equal(await context.openWeeklyCheckinModal(),true);
assert.equal(context.openState().opened,2,'segundo toque após fechar/abrir deve continuar funcionando');
assert(access.includes('!hasWeeklyAccessGuard(openWeeklyCheckinModal)'),'controle de acesso deve reconhecer guarda já instalada na cadeia');
assert(bulk.includes('wrapped.__tbBase=baseWeekly'),'seletor de fotos deve preservar a cadeia de abertura');
console.log('APROVADO — toque no relatório abre uma vez mesmo após reinstalações dos controles semanal, acesso e fotos.');
