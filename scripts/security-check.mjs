import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const failures=[];
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const assert=(condition,message)=>{if(!condition)failures.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);
const requireFile=rel=>assert(fs.existsSync(path.join(root,rel)),`Arquivo obrigatório ausente: ${rel}`);

const firebaseJson=JSON.parse(read('firebase.json'));
const firestorePath=String(firebaseJson?.firestore?.rules||'');
const storagePath=String(firebaseJson?.storage?.rules||'');
const required=[
  firestorePath,storagePath,'modules/security-hardening-v10_10_9.js',
  'modules/registration-integrity-v10_10_9.js','modules/remove-stretch-planilha-v10_10_9.js','modules/v107-invites.js',
  'modules/trainer-inbox-payments-v10_10_12.js','config_v10_7.js','index.html','firebase.json'
].filter(Boolean);
required.forEach(requireFile);
if(failures.length){console.error(failures.join('\n'));process.exit(1);}

assert(firestorePath==='firebase/firestore_28_compacto.rules','Firebase ativo não aponta para Rules 28.');
assert(storagePath==='firebase/storage_6.rules','Firebase ativo não aponta para Storage 6.');
const firestore=read(firestorePath);
has(firestore,'function trainerOwns(uid)','Firestore não possui isolamento trainer → aluno.');
has(firestore,'function trainerOwnsWorkout(workoutId)','Firestore não protege consultas por workoutId.');
has(firestore,"resource.data.trainerId == request.auth.uid",'Leitura normal de usuários não está vinculada ao trainerId.');
has(firestore,'function legacyMigrationAuthorized()','Migração legada não possui autorização administrativa explícita.');
has(firestore,"userData(request.auth.uid).get('legacyMigrationEnabled', false) == true",'Autorização de migração não está vinculada ao treinador autenticado.');
has(firestore,"legacyMigrationAuthorized() && resource.data.role == 'student'",'Leitura temporária de alunos não está protegida pela autorização de migração.');
has(firestore,'function preV107LegacyStudent(uid)','Firestore não diferencia alunos pré-v10.7 sem vínculo.');
has(firestore,"userData(uid).get('trainerId', '') == ''",'Migração pode sobrescrever trainerId existente.');
has(firestore,"userData(uid).get('inviteId', '') == ''",'Migração pré-v10.7 pode capturar perfil com convite moderno.');
has(firestore,"affectedKeys().hasOnly(['legacyMigrationEnabled'])",'Treinador não está limitado a desligar somente a autorização temporária.');
has(firestore,'request.resource.data.legacyMigrationEnabled == false','Cliente pode manter/ativar autorização de migração indevidamente.');
has(firestore,'trainerOwns(request.resource.data.studentId)','Criações do treinador não exigem aluno vinculado.');
has(firestore,'trainerOwns(resource.data.userId) || activeOwner(resource.data.userId)','Dados pessoais ainda não estão isolados por treinador.');
has(firestore,'safeColor(request.resource.data.color)','Cor de protocolo não é validada por whitelist.');
has(firestore,"(request.resource.data.get('dataUrl', '') != '' || request.resource.data.get('photoPath', '') != '')",'Regra ainda permite registro de foto vazio.');
has(firestore,'function questionnaireMode(data)','Relatórios legados não possuem inferência canônica de modo.');
has(firestore,"data.get('requiresPhotos', true) == false",'Relatório escrito legado não é inferido pelos campos imutáveis existentes.');
has(firestore,"data.get('questions', []) is list && data.get('questions', []).size() == 0",'Relatório antigo somente de fotos não é reconhecido quando requestMode está ausente.');
has(firestore,"questionnaireMode(resource.data) == 'photos'",'Envio de seis fotos ainda depende de requestMode existir no documento histórico.');
has(firestore,"questionnaireMode(resource.data) == 'written'",'Envio escrito legado ainda depende de requestMode existir no documento histórico.');
has(firestore,"questionnaireMode(resource.data) == 'full'",'Envio completo não usa a inferência canônica de modo.');
lacks(firestore,'allow read: if isTrainer() || activeOwner(resource.data.userId);','Regra ampla de leitura de fotos/sessões por qualquer treinador reapareceu.');
lacks(firestore,'allow read: if isTrainer() || activeOwner(resource.data.studentId);','Regra ampla de leitura de relatórios por qualquer treinador reapareceu.');
lacks(firestore,"|| (isTrainer() && resource.data.role == 'student')",'Leitura global permanente de alunos por qualquer treinador reapareceu.');
has(firestore,"getAfter(/databases/$(database)/documents/studentInvites/$(request.resource.data.inviteId)).data.usedBy == uid",'Criação de aluno não exige consumo atômico do convite pelo mesmo UID.');
has(firestore,"getAfter(/databases/$(database)/documents/users/$(request.auth.uid)).data.inviteId == id",'Consumo do convite não está vinculado ao perfil criado na mesma operação.');
has(firestore,'match /trainerActivity/{trainerUid}','Firestore não possui caixa privada de atividade por treinador.');
has(firestore,'match /trainerBilling/{trainerUid}','Firestore não possui domínio financeiro privado por treinador.');
has(firestore,"request.resource.data.planType in ['quarterly','semiannual']",'Planos financeiros aceitam valores fora do escopo solicitado.');
has(firestore,'paymentReceiptPath','Firestore não valida o namespace do comprovante financeiro.');
has(firestore,'allow read: if isTrainer() && request.auth.uid == trainerUid;','Leitura financeira não está limitada ao treinador dono.');
has(firestore,'match /{document=**} { allow read, write: if false; }','Firestore perdeu o deny-all final.');

const storage=read(storagePath);
has(storage,'function trainerOwns(uid)','Storage não valida vínculo do treinador ao aluno.');
has(storage,'allow read: if trainerOwns(uid) || activeOwner(uid);','Fotos no Storage ainda não estão isoladas por treinador.');
lacks(storage,'allow read: if isTrainer() || activeOwner(uid);','Storage voltou a permitir qualquer treinador ler qualquer foto.');
has(storage,'match /paymentReceipts/{trainerUid}/{studentUid}/{fileName}','Storage não isola comprovantes financeiros.');
has(storage,'request.auth.uid == trainerUid','Comprovante não exige o próprio treinador no caminho.');
has(storage,'trainerOwns(studentUid)','Comprovante não exige vínculo real treinador → aluno.');
lacks(storage,'activeOwner(studentUid)','Aluno recebeu acesso ao domínio financeiro de comprovantes.');
has(storage,'match /{allPaths=**} { allow read, write: if false; }','Storage perdeu o deny-all final.');

const security=read('modules/security-hardening-v10_10_9.js');
has(security,"where('trainerId','==',trainerUid)",'Painel do treinador ainda consulta todos os estudantes.');
has(security,'authorizedStudents.has(target)','UI não possui defesa adicional contra aluno fora do vínculo.');
has(security,'SAFE_COLORS','Cache/local não saneia cores de protocolo.');
has(security,'tb-student-status-dot','Painel perdeu o indicador visual de status do aluno.');
has(security,"isActive?'active':'inactive'",'Indicador de status não deriva do status real do aluno.');
lacks(security,"db.collection('studentInvites')",'Painel normal voltou a auditar convites automaticamente e elevar leituras.');
has(security,"button.textContent='VERIFICAR VÍNCULOS'",'Auditoria de vínculo não está disponível como ação manual.');

const invites=read('modules/v107-invites.js');
lacks(invites,'withTimeout(db.runTransaction','Transação de cadastro voltou a ter timeout artificial.');
has(invites,"return'unknown'",'Cadastro não trata resultado de commit indeterminado.');
has(invites,"if(state==='committed')",'Cadastro não reconcilia commit confirmado após falha de rede.');
has(invites,'TB.inviteHash=sha256','Fluxo canônico não expõe o hash criptográfico dos convites.');
has(invites,'authListenerSuspended=suspendAuthListenerForRegistration()','Cadastro não pausa o listener global antes da criação Auth.');
has(invites,'cred.user.getIdTokenResult(true)','Cadastro não renova a credencial/claims antes da transação protegida.');
has(invites,'await ensureRegistrationAppCheck({forceRefresh:false})','Cadastro não valida App Check antes de criar a conta Auth.');
has(invites,"withTimeout(initOptionalAppCheck(),8000,'App Check do cadastro')",'Cadastro voltou a herdar o timeout curto de App Check usado apenas no boot.');
has(invites,'service.getToken(!!forceRefresh)','Cadastro não usa a política App Check cached-first com refresh explícito.');
has(invites,'await ensureRegistrationAppCheck({forceRefresh:true})','Recuperação de permission-denied não força nova atestação antes do retry único.');
has(invites,"doRegister.__tbRegistrationAppCheck='cached-first'",'Política App Check do cadastro não está marcada para diagnóstico.');
has(invites,"window.TeamBullsRegistrationDiagnostics=registrationDiagnostic",'Cadastro não expõe diagnóstico seguro por etapa.');
has(invites,'doRegister.__tbCanonicalInviteRegistration=true','Cadastro seguro não está marcado como implementação canônica.');

const registration=read('modules/registration-integrity-v10_10_9.js');
lacks(registration,'withTimeout(db.runTransaction','Camada de integridade voltou a executar/abortar transação por timeout local.');
lacks(registration,'doRegister=secured','Camada de integridade voltou a substituir o fluxo canônico de cadastro.');
has(registration,"const VERSION='10.10.9-registration2'",'Camada passiva de integridade não está na revisão segura atual.');
has(registration,"source.includes('suspendAuthListenerForRegistration')",'Diagnóstico de integridade não confirma a pausa do listener.');
has(registration,"source.includes('getIdTokenResult(true)')",'Diagnóstico de integridade não reconhece a renovação moderna de token/claims.');

const hub=read('modules/trainer-inbox-payments-v10_10_12.js');
has(hub,"CURRENT_USER?.role==='trainer'",'Central/Pagamentos não possui gate de treinador.');
has(hub,"CURRENT_USER?.role==='student'",'Notificação de relatório não possui gate de aluno.');
has(hub,"paymentReceipts/${cleanId(trainerUid)}/${cleanId(studentId)}/${cleanId(paymentId)}",'Comprovante não usa namespace por treinador/aluno/pagamento.');
lacks(hub,'localStorage.setItem','Módulo financeiro não deve persistir valores/comprovantes no localStorage.');

const stretch=read('modules/remove-stretch-planilha-v10_10_9.js');
lacks(stretch,'new MutationObserver','Remoção de alongamento voltou a observar toda a árvore DOM permanentemente.');

const config=read('config_v10_7.js');
has(config,'security-hardening-v10_10_9.js?v=10.10.10-security8','Loader não inclui o hardening security8 com URL nova.');
has(config,'legacy-student-link-repair-v10_10_10.js?v=10.10.10-legacy-links6','Loader não inclui o reconciliador legacy-links6 com URL nova.');
has(config,'registration-integrity-v10_10_9.js?v=10.10.9-registration2','Loader não inclui a revisão passiva/cache-safe do cadastro.');
lacks(config,'registration-integrity-v10_10_9.js?v=10.10.9-registration1','Loader ainda referencia a revisão antiga do cadastro.');
has(config,'trainer-inbox-payments-v10_10_12.js?v=10.10.12-inboxpayments2','Loader não inclui Central/Pagamentos com a revisão de cache atual.');

const index=read('index.html');
has(index,"object-src 'none'",'CSP não bloqueia plugins/objetos.');
has(index,"base-uri 'self'",'CSP não limita base-uri.');
has(index,"upgrade-insecure-requests",'CSP não força upgrade de conteúdo inseguro.');

const jsFiles=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(['.git','node_modules'].includes(entry.name))continue;const full=path.join(dir,entry.name);if(entry.isDirectory())walk(full);else if(entry.isFile()&&entry.name.endsWith('.js'))jsFiles.push(full);}}
walk(root);
for(const file of jsFiles){const text=fs.readFileSync(file,'utf8');const relative=path.relative(root,file);assert(!/localStorage\.setItem\([^\n]{0,180}(?:password|senha|pass\s*\))/i.test(text),`Possível senha em texto persistida em ${relative}.`);}

if(failures.length){console.error('Falhas de segurança/regressão:');failures.forEach(item=>console.error('- '+item));process.exit(1);}
console.log('Security checks OK — Rules 28, Storage 6, isolamento financeiro, App Check e cadastro atômico validados.');