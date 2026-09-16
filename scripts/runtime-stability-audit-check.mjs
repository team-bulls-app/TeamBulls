import fs from 'node:fs';
import vm from 'node:vm';

const read=file=>fs.readFileSync(file,'utf8');
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const files={
  feedback:'modules/trainer-feedback-archive-v10_10_37.js',
  organizer:'modules/trainer-update-organizer-v10_10_41.js',
  data:'modules/trainer-intelligence-data-v10_10_42.js',
  profile:'modules/student-home-profile-v10_10_12.js',
  guard:'modules/trainer-canonical-context-guard-v10_10_42.js',
  insights:'modules/trainer-student-insights-v10_10_42.js',
  progress:'modules/student-progress-hub-v10_10_42.js',
  loader:'modules/intelligence-suite-loader-v10_10_42.js',
  worker:'sw.js',
  workerLegacy:'sw_47.js',
  version:'version.json',
  rules:'firebase/firestore_28_compacto.rules',
  storageRules:'firebase/storage_6.rules'
};
for(const path of Object.values(files))assert(fs.existsSync(path),`Arquivo ausente: ${path}`);
const src=Object.fromEntries(Object.entries(files).map(([name,path])=>[name,read(path)]));
for(const name of ['feedback','organizer','data','profile','guard','insights','progress','loader','worker','workerLegacy'])new vm.Script(src[name],{filename:files[name]});

const safeRoster="where('trainerId','==',uid).where('role','==','student')";
assert(src.feedback.includes(safeRoster),'Feedbacks enviados: listagem de alunos ainda pode receber permission-denied pelas Rules 28.');
assert(src.organizer.includes(safeRoster),'Agenda: listagem de alunos ainda pode receber permission-denied pelas Rules 28.');
assert(src.data.includes(safeRoster),'Radar: listagem de alunos ainda pode receber permission-denied pelas Rules 28.');
assert(/resource\.data\.role\s*==\s*'student'[\s\S]{0,120}resource\.data\.trainerId\s*==\s*request\.auth\.uid/.test(src.rules),'Auditoria depende da regra canônica de leitura do aluno pelo treinador.');

assert(src.organizer.includes("collection('checkinSchedules').doc(sid)"),'Agenda: cronograma semanal precisa ser lido diretamente pelo uid do aluno.');
assert(src.organizer.includes("collection('protocolReviewSchedules').doc(sid)"),'Agenda: cronograma mensal precisa ser lido diretamente pelo uid do aluno.');
assert(!src.organizer.includes("collection('protocolReviewSchedules').where('trainerId','==',uid)"),'Agenda: consulta global de cronogramas mensais incompatível com Rules voltou.');

assert(src.profile.includes("typeof ensureStorageService==='function'"),'Perfil: precisa usar o carregador lazy canônico do Firebase Storage.');
assert(src.profile.includes('const root=await storageRoot()'),'Perfil: operações devem aguardar o Storage ficar disponível.');
assert(!src.profile.includes("const storageRoot=()=>{try{return typeof firebase!=='undefined'&&typeof firebase.storage==='function'?firebase.storage():null"),'Perfil: acesso síncrono antigo ao Storage voltou.');
assert(src.storageRules.includes('match /studentProfiles/{uid}/profile.json')&&src.storageRules.includes('match /studentProfiles/{uid}/avatar.jpg'),'Perfil: regras canônicas de Storage do aluno desapareceram.');

assert(src.guard.includes('checkinLoad.studentId!==studentId')&&src.guard.includes('protocolLoad.studentId!==studentId'),'Contexto: cargas concorrentes de alunos distintos podem voltar a se misturar.');
assert(src.data.includes('trainingSessionCount')&&src.progress.includes('sessionCount(sessions)')&&src.insights.includes('countTrainingSessions'),'Métricas: documentos por exercício podem voltar a ser contados como sessões completas.');
assert(src.insights.includes('weightComparable')&&src.insights.includes('completeReview'),'Insights: peso ausente/conclusão com estado obsoleto não estão protegidos.');
assert(src.loader.includes('10.10.56-contextguard4'),'Modo Revisão: loader precisa exigir a guarda atual com sincronização pós-confirmação e proteção de contexto da dieta.');
assert(src.guard.includes("PROTOCOL_COMPLETED_EVENT='team-bulls-protocol-review-completed'"),'Modo Revisão: evento de conclusão canônica está ausente.');
const interceptStart=src.guard.indexOf('const intercepted=function');
const interceptEnd=src.guard.indexOf('showConfirm=intercepted',interceptStart);
const interceptBody=interceptStart>=0&&interceptEnd>interceptStart?src.guard.slice(interceptStart,interceptEnd):'';
assert(interceptBody.includes('const result=await callback.apply(this,arguments)')&&interceptBody.indexOf('notifyProtocolCompleted(studentId,beforeCycle)')>interceptBody.indexOf('const result=await callback.apply(this,arguments)'),'Modo Revisão: refresh não pode ocorrer antes de a confirmação canônica terminar.');
assert(src.guard.includes('cycle<=beforeCycle'),'Modo Revisão: cancelamento ou falha não podem ser tratados como conclusão.');
assert(src.guard.includes('TeamBullsTrainerStudentInsights?.refresh?.()'),'Modo Revisão: tela aberta precisa atualizar depois da conclusão real.');

for(const path of [
  '/modules/trainer-feedback-archive-v10_10_37.js',
  '/modules/trainer-update-organizer-v10_10_41.js',
  '/modules/intelligence-suite-loader-v10_10_42.js',
  '/modules/trainer-intelligence-data-v10_10_42.js',
  '/modules/trainer-canonical-context-guard-v10_10_42.js',
  '/modules/trainer-student-insights-v10_10_42.js',
  '/modules/student-progress-hub-v10_10_42.js',
  '/modules/student-home-profile-v10_10_12.js'
])assert(src.worker.includes(`'${path}'`),`PWA: ${path} precisa ser network-first para receber correções sem cache antigo.`);
assert(src.worker===src.workerLegacy,'PWA: sw.js e sw_47.js precisam permanecer idênticos.');
const published=JSON.parse(src.version);
assert(src.worker.includes(`const BUILD_REVISION=${Number(published.build)};`),'PWA: correção não pode quebrar a coerência com o build publicado.');
assert(src.worker.includes("CACHE_HOTFIX='update-unblock1'"),'PWA: correção pontual não deve reativar uma navegação forçada de cache.');

console.log('APROVADO — feedbacks/agenda/Storage/contexto/métricas continuam estáveis e o Modo Revisão exige a guarda atual após a confirmação canônica, sem polling nem romper o build publicado.');