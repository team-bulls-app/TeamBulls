import fs from 'node:fs';
import vm from 'node:vm';

const failures=[];
const read=path=>fs.readFileSync(path,'utf8');
const assert=(condition,message)=>{if(!condition)failures.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

const modulePath='modules/trainer-canonical-inbox-v10_10_52.js';
const recoveryPath='modules/trainer-report-link-recovery-v10_10_51.js';
const historyPath='modules/trainer-student-report-history-v10_10_55.js';
const loaderPath='modules/intelligence-suite-loader-v10_10_42.js';
for(const path of [modulePath,recoveryPath,historyPath,loaderPath]){
  assert(fs.existsSync(path),`Arquivo obrigatório ausente: ${path}`);
  if(fs.existsSync(path))new vm.Script(read(path),{filename:path});
}

const source=read(modulePath);
const recovery=read(recoveryPath);
const history=read(historyPath);
const loader=read(loaderPath);
const firebaseConfig=read('firebase.json');
const firestoreRules=read('firebase/firestore_28_compacto.rules');
const storageRules=read('firebase/storage_6.rules');
const legacyRepair=read('modules/legacy-student-link-repair-v10_10_10.js');
const sw=read('sw.js');

has(source,"const VERSION='10.10.52-canonicalinbox3'",'Central canônica está na revisão errada.');
has(loader,"trainer-canonical-inbox-v10_10_52.js?v=10.10.52-canonicalinbox3",'Loader do treinador não entrega a Central canônica por propriedade histórica.');
has(loader,"const VERSION='10.10.55-intelsuite5'",'Loader não foi cache-bustado para a resiliência do histórico individual.');
has(loader,"trainer-report-link-recovery-v10_10_51.js?v=10.10.51-reportlink1",'Loader perdeu a recuperação conservadora de vínculo.');
has(loader,"trainer-student-report-history-v10_10_55.js?v=10.10.55-studentreports3",'Loader não entrega a revisão resiliente da tela individual do aluno.');
assert(loader.indexOf('trainer-report-link-recovery-v10_10_51.js')<loader.indexOf('trainer-student-report-history-v10_10_55.js'),'Recuperação de vínculo deve continuar antes do histórico individual.');
assert(loader.indexOf('trainer-student-report-history-v10_10_55.js')<loader.indexOf('trainer-canonical-inbox-v10_10_52.js'),'Histórico individual precisa ser instalado antes da Central canônica.');

has(source,"db.collection('questionnaires').where('trainerId','==',uid).limit(MAX_ITEMS)",'Central não consulta questionários diretamente pelo trainerId imutável.');
has(source,'loadTrainerOwnedQuestionnaires(uid)','Central não incorpora a leitura histórica por propriedade.');
has(source,'const [roster,ownedRows]=await Promise.all','Leitura por propriedade não ocorre independentemente do roster.');
has(source,'const canonicalRows=[...ownedRows,...groups.flatMap','Questionários históricos não são mesclados aos canônicos atuais.');
has(source,'ownerRecoveredCount','Diagnóstico de recuperação histórica não está disponível.');

has(history,"const VERSION='10.10.55-studentreports3'",'Histórico individual está na revisão errada.');
has(history,"const READ_TIMEOUT=6000",'Tela individual precisa de timeout próprio e finito.');
has(history,"Promise.allSettled([refreshQuestionnaires(studentUid),refreshWeekly(studentUid)])",'Personalizados e semanais precisam carregar independentemente em paralelo.');
has(history,"db.collection('questionnaires').where('trainerId','==',trainerUid).limit(MAX_REPORTS)",'Tela individual perdeu a leitura histórica pelo trainerId.');
has(history,"db.collection('questionnaires').where('studentId','==',studentUid).limit(MAX_REPORTS)",'Tela individual perdeu o fallback legado por studentId.');
has(history,"sectionError('ts-quest-list','Não foi possível carregar os relatórios personalizados agora.')",'Falha de personalizados pode permanecer em loading infinito.');
has(history,"sectionError('ts-weekly-checkin-list','Não foi possível carregar os relatórios semanais agora.')",'Falha de semanais pode permanecer em loading infinito.');
has(history,"TENTAR NOVAMENTE",'Tela individual sem retry explícito após falha.');
has(history,"showScreen('screen-ts-quest',navigation)",'A aba Relatórios do aluno não abre imediatamente antes da consulta de rede.');
has(history,'report?.answeredAt?{...report,createdAt:report.answeredAt}:report','Card do treinador continua exibindo a data errada da resposta.');
has(history,'TS_QUEST_CACHE=questionnaires','Tela individual não substitui o cache antigo pelo histórico canônico atualizado.');
has(history,"renderQuestList(TS_QUEST_CACHE,'ts-quest-list','ts-quest-empty',true)",'Tela individual não renderiza o histórico recuperado.');
has(history,'fetchWeeklyCheckins(studentUid)','Correção individual não preserva a seção de relatórios semanais existente.');
lacks(history,'cloudWrite(','Histórico individual não pode fazer writes.');
lacks(history,'.update(','Histórico individual não pode atualizar documentos.');
lacks(history,'.set(','Histórico individual não pode criar documentos.');
lacks(history,'.delete(','Histórico individual não pode excluir dados.');
lacks(history,'setInterval(','Histórico individual não pode usar polling.');
lacks(history,'MutationObserver','Histórico individual não pode observar globalmente o DOM.');

has(source,"db.collection('users').where('trainerId','==',uid).where('role','==','student').limit(500)",'Roster atual deixou de ficar isolado pelo treinador.');
has(source,"db.collection('questionnaires').where('studentId','==',sid).get()",'Compatibilidade com questionários antigos sem trainerId foi removida.');
has(source,"db.collection('weeklyCheckins').where('studentId','==',sid).get()",'Relatórios semanais atuais deixaram de ser consultados pelo aluno vinculado.');
has(source,'function questionnaireComplete(data)','Compatibilidade de conclusão de questionário não está explícita.');
has(source,'if(data?.answered===true)return true','Questionário respondido deixou de ser reconhecido.');

has(firestoreRules,"|| (isTrainer() && resource.data.trainerId == request.auth.uid);",'Rules não reconhecem o treinador que criou o questionário.');
has(firestoreRules,"immutable('studentId') && immutable('trainerId')",'trainerId/studentId do questionário precisam continuar imutáveis após a criação.');
has(firestoreRules,'function trainerOwnsCheckinSchedule(uid)','Rules não reconhecem a agenda semanal como prova histórica limitada.');
has(firestoreRules,"checkinScheduleData(uid).get('updatedBy', '') == request.auth.uid",'Agenda semanal não prova qual treinador a programou.');
has(firestoreRules,"|| trainerOwnsCheckinSchedule(resource.data.studentId);",'Relatório semanal antigo continua invisível ao treinador que programou a agenda.');
has(firestoreRules,'request.resource.data.updatedBy == request.auth.uid','Agenda semanal futura precisa fixar o treinador que a atualizou.');
has(firestoreRules,'allow update, delete: if false;','Relatórios semanais precisam continuar imutáveis após o envio.');
has(firestoreRules,'function trainerOwnsQuestionnaire(questionnaireId)','Rules não protegem as fotos pelo questionário de origem.');
lacks(firestoreRules,'allow write: if trainerOwnsQuestionnaire','Propriedade histórica nunca pode conceder escrita ao treinador no relatório/foto do aluno.');

has(storageRules,'function canReadProgressPhoto(uid, photoId)','Storage não centraliza a autorização de fotos de progresso.');
has(storageRules,'request.auth.uid == uid','Aluno continua precisando acessar a própria foto.');

has(source,'items=mergeRows(canonicalRows,indexRows)','Central voltou a depender exclusivamente de trainerActivity.');
has(source,'TeamBullsCanonicalTrainerInbox.open','Cards canônicos não possuem abertura direta.');
has(source,"db.collection('questionnaires').doc(row.sourceId).get()",'Abertura do questionário ainda depende do índice secundário.');
has(source,'db.runTransaction(async transaction=>','Reparo do índice não está protegido por transação.');
has(source,'if(doc.exists)return true','Reparo pode sobrescrever evento existente/lido.');
lacks(source,"db.collection('questionnaires').doc(row.sourceId).set",'Central não pode regravar questionários canônicos.');
lacks(source,"db.collection('questionnaires').doc(row.sourceId).update",'Central não pode alterar respostas canônicas.');
lacks(source,"db.collection('weeklyCheckins').doc(row.sourceId).set",'Central não pode regravar weeklyCheckins.');
lacks(source,'.delete(','Correção não pode excluir registros.');
lacks(source,'setInterval(','Central canônica não pode introduzir polling.');
lacks(source,'MutationObserver','Central canônica não pode observar globalmente o DOM.');

has(recovery,"const VERSION='10.10.51-reportlink1'",'Recuperação de vínculo está na revisão errada.');
has(recovery,'TeamBullsLegacyStudentLinkRepair','Recuperação deve reutilizar o reconciliador canônico de vínculo.');
has(legacyRepair,"db.collection('studentInvites').where('trainerId','==',trainerUid).limit(300)",'Reparação por convite deve ficar limitada aos convites do treinador atual.');
has(firestoreRules,"userData(uid).get('trainerId', '') == ''",'Rules devem impedir sobrescrever vínculo já apontado para outro treinador.');

has(source,'async openInbox(){const result=await hub.openInbox.apply(hub,arguments);hookFilters();await refresh(true);return result;}','Abrir Central não força leitura canônica.');
has(source,'async refreshInbox(){const result=await hub.refreshInbox.apply(hub,arguments);await refresh(true);return result;}','Botão atualizar não força leitura canônica.');

assert(JSON.parse(firebaseConfig)?.firestore?.rules==='firebase/firestore_28_compacto.rules','Correção alterou o caminho da Rule Firestore ativa.');
assert(JSON.parse(firebaseConfig)?.storage?.rules==='firebase/storage_6.rules','Correção alterou o caminho da Rule Storage ativa.');
has(sw,"'/modules/intelligence-suite-loader-v10_10_42.js'",'Loader da Central não permanece network-first/mutável no PWA.');

if(failures.length){
  console.error('FALHA — propriedade histórica / histórico individual de relatórios do treinador\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — tela individual não fica em loading infinito, personalizados/semanais carregam separados e semanais antigos podem ser lidos somente pelo treinador que programou a agenda.');
