import fs from 'node:fs';
import vm from 'node:vm';

const failures=[];
const read=file=>fs.readFileSync(file,'utf8');
const assert=(ok,message)=>{if(!ok)failures.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

const integrityPath='modules/weekly-report-integrity-v10_10_58.js';
const centralPath='modules/trainer-canonical-inbox-v10_10_58.js';
const loaderPath='modules/intelligence-suite-loader-v10_10_42.js';
const submitPath='modules/student-report-submit-reconciliation-v10_10_57.js';
const historyPath='modules/trainer-student-report-history-v10_10_55.js';
const corePath='app_v10_10_9_core.js';
for(const file of [integrityPath,centralPath,loaderPath,submitPath,historyPath,corePath]){
  assert(fs.existsSync(file),`Arquivo obrigatório ausente: ${file}`);
  if(fs.existsSync(file)&&file.endsWith('.js'))new vm.Script(read(file),{filename:file});
}
if(failures.length){console.error(failures.join('\n'));process.exit(1);}

const integrity=read(integrityPath);
const central=read(centralPath);
const loader=read(loaderPath);
const submit=read(submitPath);
const history=read(historyPath);
const core=read(corePath);

has(integrity,"const VERSION='10.10.58-weeklyintegrity4'",'Guarda semanal está na revisão errada.');
has(integrity,'function effectiveSubmittedDate(row)','Recuperação da data real de envio não está explícita.');
has(integrity,'localStampDate(row?.createdAt)||isoDate(row?.submittedDate)||isoDate(row?.dueDate)','Data exibida não prioriza o timestamp de criação confirmado pelo servidor.');
has(integrity,'_weeklyDateRecovered:true','Histórico não sinaliza recuperação de submittedDate legado.');
has(integrity,'function logicalKey(row)','Deduplicação semanal não possui identidade lógica explícita.');
has(integrity,"const requestKey=String(row?.requestKey||'').trim()",'Deduplicação não usa requestKey canônico.');
has(integrity,'function legacyFingerprint(row)','Duplicata legada não possui prova forte separada.');
has(integrity,"photos.length!==6||photos.some(value=>!value)",'Duplicata legada pode ser inferida sem os seis photoIds.');
has(integrity,'photos.join(\'\\u0001\')','Fingerprint legado não exige os mesmos photoIds.');
has(integrity,'function historyForRequestCalculation(rows)','Cálculo do próximo período não recupera identidade legada de forma isolada.');
has(integrity,"requestKey:'scheduled:'+due",'Relatório programado legado com dueDate não avança o ciclo semanal.');
has(integrity,"if(String(row?.requestKind||'scheduled')==='manual')return row",'Pedido extra/manual está sendo inferido indevidamente como programado.');
has(integrity,"reference.get({source:'server'})",'Preflight semanal não força confirmação no servidor.');
has(integrity,"db.collection('checkinSchedules').doc(uid)",'Preflight não confirma a agenda semanal atual.');
has(integrity,"db.collection('weeklyCheckins').where('studentId','==',uid)",'Preflight não confirma o histórico semanal do próprio aluno.');
has(integrity,'const requestHistory=historyForRequestCalculation(history)','Preflight não usa identidade recuperada somente para cálculo.');
has(integrity,'const request=computeCheckinRequest(schedule,requestHistory)','Preflight não recalcula a solicitação com estado fresco/compatível.');
has(integrity,'WEEKLY_CHECKINS=history','Histórico exibido foi contaminado pela identidade sintética usada só no cálculo.');
has(integrity,'WEEKLY_CHECKIN_REQUEST=request','Solicitação fresca não substitui o request obsoleto antes do envio.');
has(integrity,'__tbWeeklyIntegrity1010584','Hot upgrade não distingue a revisão nova da guarda antiga.');
has(integrity,"if(typeof base!=='function'||base.__tbRestCanonical101057!==true)return false",'Guarda pode envolver um submit legado/não canônico.');
has(integrity,'wrapped.__tbRestCanonical101057=true','Reconciliador pode remover o preflight fresco em reinstalações.');
has(integrity,'window.TeamBullsStudentTrainerActivityBridge?.install?.()','Índice secundário do treinador não é reinstalado após envolver o submit.');
lacks(integrity,'setInterval(','Integridade semanal não pode introduzir polling.');
lacks(integrity,'MutationObserver','Integridade semanal não deve observar o DOM globalmente.');
lacks(integrity,'restCommit(','Guarda de integridade não pode criar um segundo caminho de write.');
lacks(integrity,').set(','Guarda de integridade não pode gravar documentos Firestore.');
lacks(integrity,'.update(','Guarda de integridade não pode alterar histórico.');
lacks(integrity,'.delete(','Guarda de integridade não pode apagar duplicatas históricas.');

has(central,"const VERSION='10.10.58-canonicalinbox5'",'Central do treinador não usa a revisão deduplicada.');
has(central,"_weeklyRequestKey:String(data.requestKey||'')",'Central não carrega requestKey do semanal canônico.');
has(central,'function weeklyLogicalKey(row)','Central não deduplica pela identidade semanal canônica.');
has(central,'suppressedIds.add','Central não oculta o índice secundário correspondente à duplicata.');
has(central,"if(!key){selected.push(row);continue;}",'Central está inferindo duplicidade em registro legado sem requestKey.');
lacks(central,"db.collection('weeklyCheckins').doc(row.sourceId).set",'Central não pode regravar semanal para reparar duplicata visual.');
lacks(central,"db.collection('weeklyCheckins').doc(row.sourceId).delete",'Central não pode apagar semanal histórico.');

has(loader,"const VERSION='10.10.57-intelsuite7'",'Loader mutável perdeu compatibilidade com o bootstrap publicado.');
has(loader,"weekly-report-integrity-v10_10_58.js?v=10.10.58-weeklyintegrity4",'Suíte não entrega a guarda semanal com recuperação de data.');
has(loader,"trainer-canonical-inbox-v10_10_58.js?v=10.10.58-canonicalinbox5",'Suíte não entrega a Central semanal deduplicada.');
const trainerIntegrity=loader.indexOf("weekly-report-integrity-v10_10_58.js?v=10.10.58-weeklyintegrity4");
const trainerHistory=loader.indexOf('trainer-student-report-history-v10_10_55.js');
const trainerCentral=loader.indexOf('trainer-canonical-inbox-v10_10_58.js');
assert(trainerIntegrity>=0&&trainerHistory>trainerIntegrity,'Treinador precisa instalar recuperação/deduplicação antes de carregar o histórico individual.');
assert(trainerCentral>trainerHistory,'Central do treinador deve carregar depois do histórico individual.');
const studentSubmit=loader.indexOf('student-report-submit-reconciliation-v10_10_57.js');
const studentIntegrity=loader.lastIndexOf("weekly-report-integrity-v10_10_58.js?v=10.10.58-weeklyintegrity4");
assert(studentSubmit>=0&&studentIntegrity>studentSubmit,'Aluno precisa instalar a guarda depois do submit REST canônico.');

has(history,'fetchWeeklyCheckins(studentUid)','Histórico do treinador deixou de passar pelo leitor semanal corrigido.');
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
console.log('APROVADO — data real usa createdAt do servidor, legado programado avança pelo dueDate sem reescrita e duplicata só é ocultada com identidade canônica ou seis photoIds idênticos.');
await import('./weekly-behavior-check.mjs');
