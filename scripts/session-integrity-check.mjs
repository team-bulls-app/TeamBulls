import fs from 'node:fs';
import vm from 'node:vm';

const fail=[];
const assert=(condition,message)=>{if(!condition)fail.push(message);};
const read=path=>fs.readFileSync(path,'utf8');

for(const path of [
  'modules/session-integrity-v10_10_39.js',
  'modules/session-save-performance-v10_10_9.js',
  'modules/week-selection-fix-v10_10_9.js',
  'config_v10_7.js'
])assert(fs.existsSync(path),`Arquivo obrigatório ausente: ${path}`);
if(fail.length){console.error(fail.join('\n'));process.exit(1);}

const integrity=read('modules/session-integrity-v10_10_39.js');
const sessionPerf=read('modules/session-save-performance-v10_10_9.js');
const config=read('config_v10_7.js');

const priorityStart=config.indexOf('const studentPriorityModules=[');
const deferredStart=config.indexOf('const modules=[',priorityStart);
const priority=priorityStart>=0&&deferredStart>priorityStart?config.slice(priorityStart,deferredStart):'';
for(const moduleName of [
  'session-save-performance-v10_10_9.js',
  'pending-session-mutations-v10_10_34.js',
  'week-selection-fix-v10_10_9.js',
  'session-integrity-v10_10_39.js'
])assert(priority.includes(moduleName),`${moduleName} precisa carregar no runtime prioritário do aluno.`);
assert(priority.indexOf('session-save-performance-v10_10_9.js')<priority.indexOf('pending-session-mutations-v10_10_34.js'),'Fila de criação deve carregar antes das mutações pendentes.');
assert(priority.indexOf('pending-session-mutations-v10_10_34.js')<priority.indexOf('week-selection-fix-v10_10_9.js'),'Mutações pendentes devem carregar antes da seleção de semana.');
assert(priority.indexOf('week-selection-fix-v10_10_9.js')<priority.indexOf('session-integrity-v10_10_39.js'),'Integridade final deve envolver o hotfix de semana já instalado.');
assert(priority.indexOf('session-integrity-v10_10_39.js')<priority.indexOf('student-workout-library-v10_10_24.js'),'Biblioteca de treino não pode ficar utilizável antes da integridade de sessão.');
for(const moduleName of ['session-save-performance-v10_10_9.js','pending-session-mutations-v10_10_34.js','week-selection-fix-v10_10_9.js']){
  assert((config.match(new RegExp(moduleName.replaceAll('.','\\.'),'g'))||[]).length===1,`${moduleName} não pode ser carregado novamente na fase tardia.`);
}
assert(!integrity.includes('setInterval('),'Integridade de sessão não pode adicionar polling permanente.');
assert(integrity.includes("if(studentCloud()&&!window.TeamBullsWeekSelectionFix)"),'Registro deve falhar fechado se a proteção de semana ainda não estiver pronta.');
assert(integrity.includes("if(!window.TeamBullsSessionPerformance)"),'Registro cloud deve aguardar a fila idempotente estar pronta.');
assert(sessionPerf.includes("db.collection('sessions').doc(entry.id).set"),'Sincronização deve continuar usando documento com ID idempotente.');

let modalIsOpen=false;
let saveCalls=0;
let modalCounter=0;
const localSessions=[];
const listeners=new Map();
const context={
  console,
  Promise,
  Date,
  setTimeout,
  clearTimeout,
  MODE:'cloud',
  CURRENT_USER:{uid:'student-1',role:'student'},
  SESSION_WID:'workout-1',
  SESSION_EID:'exercise-1',
  CUR_WORKOUT:'workout-1',
  CUR_EX:'exercise-1',
  SESSION_CREATE_ID:'',
  draftId:()=>`draft-${++modalCounter}`,
  showToast:()=>{},
  findSessionOwner:id=>localSessions.includes(String(id))?{session:{id:String(id)}}:null,
  workoutContainingExercise:()=>({id:'workout-1',startDate:'2026-09-01'}),
  document:{
    getElementById:id=>id==='modal-session'?{classList:{contains:name=>name==='open'&&modalIsOpen}}:null
  }
};
context.window=context;
context.window.TeamBullsWeekSelectionFix={version:'test'};
context.window.TeamBullsSessionPerformance={hasPending:()=>false};
context.window.TeamBullsRuntimeLoader={retry:()=>{}};
context.window.addEventListener=(name,callback)=>listeners.set(name,callback);
context.openLogSessionModal=function(){
  modalIsOpen=true;
  context.SESSION_CREATE_ID=`session-${++modalCounter}`;
};
context.saveSession=async function(){
  saveCalls++;
  const id=String(context.SESSION_CREATE_ID||'');
  localSessions.push(id);
  context.SESSION_CREATE_ID=null;
  modalIsOpen=false;
  return true;
};
context.renderExercisePrescription=function(exercise,_elId,week){
  return (exercise.sessions||[]).filter(session=>Number(session.week)===Number(week)).length;
};
vm.createContext(context);
vm.runInContext(integrity,context,{filename:'session-integrity-v10_10_39.js'});

context.openLogSessionModal();
const firstId=context.SESSION_CREATE_ID;
await context.saveSession();
await context.saveSession();
assert(saveCalls===1,'Duas chamadas de saveSession na mesma abertura do modal executaram duas gravações lógicas.');
assert(localSessions.length===1,'Uma única submissão criou mais de uma sessão local.');
assert(localSessions[0]===firstId,'O ID da sessão mudou durante a primeira submissão.');
assert(context.SESSION_CREATE_ID===firstId,'O ID lógico foi descartado cedo demais após salvar.');

context.openLogSessionModal();
const secondId=context.SESSION_CREATE_ID;
assert(secondId&&secondId!==firstId,'Uma nova abertura legítima do modal precisa gerar um novo ID.');

const exercise={sessions:[
  {id:'old-cycle',week:1,date:'2026-08-20'},
  {id:'current-cycle',week:1,date:'2026-09-02'},
  {id:'current-week-two',week:2,date:'2026-09-09'}
]};
const currentWeekOne=context.renderExercisePrescription(exercise,'target',1,false,false);
assert(currentWeekOne===1,'Contador da Semana 1 misturou sessão de ciclo anterior com o ciclo atual.');
assert(exercise.sessions.length===3,'Filtro de ciclo alterou/destruiu o histórico original de sessões.');

if(fail.length){
  console.error('FALHA — integridade estrutural de sessões\n'+fail.map(item=>'• '+item).join('\n'));
  process.exit(1);
}
console.log('APROVADO: registro é idempotente por abertura do modal, proteção de semana carrega antes do treino e ciclo antigo não contamina o contador atual.');
