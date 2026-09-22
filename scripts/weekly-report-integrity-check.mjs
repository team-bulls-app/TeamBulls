import fs from 'node:fs';
import vm from 'node:vm';

const failures=[];
const read=file=>fs.readFileSync(file,'utf8');
const assert=(ok,message)=>{if(!ok)failures.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

const integrityPath='modules/weekly-report-integrity-v10_10_58.js';
const loaderPath='modules/intelligence-suite-loader-v10_10_42.js';
const submitPath='modules/student-report-submit-reconciliation-v10_10_57.js';
const historyPath='modules/trainer-student-report-history-v10_10_55.js';
const corePath='app_v10_10_9_core.js';
for(const file of [integrityPath,loaderPath,submitPath,historyPath,corePath]){
  assert(fs.existsSync(file),`Arquivo obrigatório ausente: ${file}`);
  if(fs.existsSync(file)&&file.endsWith('.js'))new vm.Script(read(file),{filename:file});
}
if(failures.length){console.error(failures.join('\n'));process.exit(1);}

const integrity=read(integrityPath);
const loader=read(loaderPath);
const submit=read(submitPath);
const history=read(historyPath);
const core=read(corePath);

has(integrity,"const VERSION='10.10.58-weeklyintegrity1'",'Guarda semanal está na revisão errada.');
has(integrity,'function logicalKey(row)','Deduplicação semanal não possui identidade lógica explícita.');
has(integrity,"const requestKey=String(row?.requestKey||'').trim()",'Deduplicação não usa requestKey canônico.');
has(integrity,"if(!key){result.push(row);continue;}",'Histórico legado sem requestKey está sendo inferido/deduplicado indevidamente.');
has(integrity,'if(prefer(row,result[position]))result[position]=row','Duplicata lógica não preserva um representante determinístico.');
has(integrity,"reference.get({source:'server'})",'Preflight semanal não força confirmação no servidor.');
has(integrity,"db.collection('checkinSchedules').doc(uid)",'Preflight não confirma a agenda semanal atual.');
has(integrity,"db.collection('weeklyCheckins').where('studentId','==',uid)",'Preflight não confirma o histórico semanal do próprio aluno.');
has(integrity,'const request=computeCheckinRequest(schedule,history)','Preflight não recalcula a solicitação com estado fresco.');
has(integrity,'WEEKLY_CHECKIN_REQUEST=request','Solicitação fresca não substitui o request obsoleto antes do envio.');
has(integrity,"if(typeof base!=='function'||base.__tbRestCanonical101057!==true)return false",'Guarda pode envolver um submit legado/não canônico.');
has(integrity,'wrapped.__tbRestCanonical101057=true','Reconciliador pode remover o preflight fresco em reinstalações.');
has(integrity,'window.TeamBullsStudentTrainerActivityBridge?.install?.()','Índice secundário do treinador não é reinstalado após envolver o submit.');
lacks(integrity,'setInterval(','Integridade semanal não pode introduzir polling.');
lacks(integrity,'MutationObserver','Integridade semanal não deve observar o DOM globalmente.');
lacks(integrity,'restCommit(','Guarda de integridade não pode criar um segundo caminho de write.');
lacks(integrity,'.set(','Guarda de integridade não pode gravar documentos.');
lacks(integrity,'.update(','Guarda de integridade não pode alterar histórico.');
lacks(integrity,'.delete(','Guarda de integridade não pode apagar duplicatas históricas.');

has(loader,"weekly-report-integrity-v10_10_58.js?v=10.10.58-weeklyintegrity1",'Suíte não entrega a guarda semanal nova.');
const trainerIntegrity=loader.indexOf("weekly-report-integrity-v10_10_58.js?v=10.10.58-weeklyintegrity1");
const trainerHistory=loader.indexOf('trainer-student-report-history-v10_10_55.js');
assert(trainerIntegrity>=0&&trainerHistory>trainerIntegrity,'Treinador precisa instalar deduplicação antes de carregar o histórico individual.');
const studentSubmit=loader.indexOf('student-report-submit-reconciliation-v10_10_57.js');
const studentIntegrity=loader.lastIndexOf("weekly-report-integrity-v10_10_58.js?v=10.10.58-weeklyintegrity1");
assert(studentSubmit>=0&&studentIntegrity>studentSubmit,'Aluno precisa instalar a guarda depois do submit REST canônico.');

has(history,'fetchWeeklyCheckins(studentUid)','Histórico do treinador deixou de passar pelo leitor semanal deduplicado.');
has(core,"while(completed.has(checkinRequestKey('scheduled',due))",'Cálculo semanal não avança sobre períodos já concluídos.');
has(core,"return stableEntityId('weekly-checkin',studentUid,requestKey).slice(0,180)",'ID semanal deixou de ser determinístico por aluno/requestKey.');
has(submit,"currentDocument:{exists:false}",'Submit perdeu a precondição contra sobrescrita/duplicação do ID canônico.');
has(submit,"writes.push(createWrite('weeklyCheckins',checkinId,checkinData))",'Relatório semanal não continua no commit atômico canônico.');
const weeklyStart=submit.indexOf('async function robustWeeklySubmit()');
const commitStart=submit.indexOf("try{await restCommit(writes,'enviar relatório semanal');}",weeklyStart);
const preCommit=weeklyStart>=0&&commitStart>weeklyStart?submit.slice(weeklyStart,commitStart):'';
lacks(preCommit,"restGet('weeklyCheckins',checkinId)",'Submit voltou a fazer GET do documento inexistente antes do create.');

if(failures.length){
  console.error('FALHA — integridade de relatórios semanais\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — período semanal é confirmado no servidor antes do envio, duplicatas com mesmo requestKey são ocultadas sem apagar histórico e o write continua único/atômico.');
