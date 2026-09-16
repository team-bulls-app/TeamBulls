import fs from 'node:fs';
import vm from 'node:vm';

const failures=[];
const read=path=>fs.readFileSync(path,'utf8');
const assert=(condition,message)=>{if(!condition)failures.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

const modulePath='modules/trainer-canonical-inbox-v10_10_52.js';
const recoveryPath='modules/trainer-report-link-recovery-v10_10_51.js';
const loaderPath='modules/intelligence-suite-loader-v10_10_42.js';
for(const path of [modulePath,recoveryPath,loaderPath]){
  assert(fs.existsSync(path),`Arquivo obrigatório ausente: ${path}`);
  if(fs.existsSync(path))new vm.Script(read(path),{filename:path});
}

const source=read(modulePath);
const recovery=read(recoveryPath);
const loader=read(loaderPath);
const firebaseConfig=read('firebase.json');
const firestoreRules=read('firebase/firestore_28_compacto.rules');
const storageRules=read('firebase/storage_6.rules');
const legacyRepair=read('modules/legacy-student-link-repair-v10_10_10.js');
const sw=read('sw.js');

has(source,"const VERSION='10.10.52-canonicalinbox3'",'Central canônica está na revisão errada.');
has(loader,"trainer-canonical-inbox-v10_10_52.js?v=10.10.52-canonicalinbox3",'Loader do treinador não entrega a Central canônica por propriedade histórica.');
has(loader,"const VERSION='10.10.52-intelsuite2'",'Loader não foi cache-bustado para a revisão de propriedade histórica.');
has(loader,"trainer-report-link-recovery-v10_10_51.js?v=10.10.51-reportlink1",'Loader perdeu a recuperação conservadora de vínculo.');
assert(loader.indexOf('trainer-report-link-recovery-v10_10_51.js')<loader.indexOf('trainer-canonical-inbox-v10_10_52.js'),'Recuperação de vínculo deve continuar antes da Central canônica.');

// Fonte de verdade: questionários que o próprio treinador criou devem ser encontrados
// diretamente pelo trainerId imutável, mesmo se o roster atual do aluno estiver inconsistente.
has(source,"db.collection('questionnaires').where('trainerId','==',uid).limit(MAX_ITEMS)",'Central não consulta questionários diretamente pelo trainerId imutável.');
has(source,'loadTrainerOwnedQuestionnaires(uid)','Central não incorpora a leitura histórica por propriedade.');
has(source,'const [roster,ownedRows]=await Promise.all','Leitura por propriedade não ocorre independentemente do roster.');
has(source,'const canonicalRows=[...ownedRows,...groups.flatMap','Questionários históricos não são mesclados aos canônicos atuais.');
has(source,'ownerRecoveredCount','Diagnóstico de recuperação histórica não está disponível.');

// Compatibilidade: vínculo atual e relatórios semanais continuam funcionando.
has(source,"db.collection('users').where('trainerId','==',uid).where('role','==','student').limit(500)",'Roster atual deixou de ficar isolado pelo treinador.');
has(source,"db.collection('questionnaires').where('studentId','==',sid).get()",'Compatibilidade com questionários antigos sem trainerId foi removida.');
has(source,"db.collection('weeklyCheckins').where('studentId','==',sid).get()",'Relatórios semanais atuais deixaram de ser consultados pelo aluno vinculado.');
has(source,'function questionnaireComplete(data)','Compatibilidade de conclusão de questionário não está explícita.');
has(source,'if(data?.answered===true)return true','Questionário respondido deixou de ser reconhecido.');

// Rules: a exceção é somente leitura e só para o trainerId imutável do documento.
has(firestoreRules,"|| (isTrainer() && resource.data.trainerId == request.auth.uid);",'Rules não reconhecem o treinador que criou o questionário.');
has(firestoreRules,"immutable('studentId') && immutable('trainerId')",'trainerId/studentId do questionário precisam continuar imutáveis após a criação.');
has(firestoreRules,"allow create: if trainerOwns(request.resource.data.studentId)", 'Criação de questionário deixou de exigir vínculo real no momento da solicitação.');
has(firestoreRules,"request.resource.data.trainerId == request.auth.uid",'Criação de questionário não fixa o treinador autenticado como proprietário.');
has(firestoreRules,'function trainerOwnsQuestionnaire(questionnaireId)','Rules não protegem as fotos pelo questionário de origem.');
has(firestoreRules,"resource.data.get('questionnaireId', '')",'Metadado Firestore da foto não exige vínculo explícito com questionário.');
lacks(firestoreRules,'allow write: if trainerOwnsQuestionnaire','Propriedade histórica nunca pode conceder escrita ao treinador no relatório/foto do aluno.');

// Storage: a mesma propriedade histórica precisa abrir os JPEGs sem exceder o limite de 2 docs.
has(storageRules,'function canReadProgressPhoto(uid, photoId)','Storage não centraliza a autorização de fotos de progresso.');
has(storageRules,'request.auth.uid == uid','Aluno continua precisando acessar a própria foto.');
has(storageRules,"let photo = progressPhotoData(photoId);",'Storage não usa o metadado canônico da foto como primeiro documento.');
has(storageRules,"let questionnaireId = photo.get('questionnaireId', '');",'Storage não distingue foto de questionário de foto semanal.');
has(storageRules,'questionnaireData(questionnaireId).trainerId == request.auth.uid','Storage não comprova a propriedade imutável do questionário.');
has(storageRules,"? questionnaireData(questionnaireId).studentId == uid",'Storage não usa ramo exclusivo para questionário histórico.');
has(storageRules,": profile(uid).role == 'student'",'Fotos sem questionnaireId não preservam o vínculo atual.');
has(storageRules,'allow read: if canReadProgressPhoto(uid, photoId);','As três rotas de mídia não usam a autorização limitada.');

// O índice secundário nunca volta a ser fonte de verdade e não altera respostas.
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

// Mantém a reparação por convite como caminho secundário e estrito.
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
  console.error('FALHA — propriedade histórica de relatórios do treinador\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — questionários criados pelo treinador permanecem visíveis pelo trainerId imutável mesmo com vínculo atual inconsistente; fotos usam caminho de até 2 documentos e nenhum envio original é alterado.');
