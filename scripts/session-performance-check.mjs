import fs from 'node:fs';

const fail=[];
const read=path=>fs.readFileSync(path,'utf8');
const assert=(condition,message)=>{if(!condition)fail.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

for(const path of ['modules/session-save-performance-v10_10_34.js','config_v10_7.js','update_v10_10_9.js','app_v10_10_9_core.js','firebase/firestore_28_compacto.rules']){
  assert(fs.existsSync(path),`Arquivo obrigatório ausente: ${path}`);
}
if(fail.length){console.error(fail.join('\n'));process.exit(1);}

const session=read('modules/session-save-performance-v10_10_34.js');
const config=read('config_v10_7.js');
const updater=read('update_v10_10_9.js');
const core=read('app_v10_10_9_core.js');
const rules=read('firebase/firestore_28_compacto.rules');

const moduleUrl='./modules/session-save-performance-v10_10_34.js?v=10.10.34-sessionperf2';
has(config,moduleUrl,'Runtime reconciliado de registro rápido não está carregado.');
assert(config.indexOf('session-save-performance-v10_10_34.js')<config.indexOf('stability_v10_10_9.js'),'Registro rápido deve continuar entre os primeiros hotfixes após a pintura.');
lacks(config,'session-save-performance-v10_10_9.js?v=10.10.9-sessionperf1','Loader ainda entrega a implementação antiga da fila de sessões.');
lacks(config,'attempts++>=80','Polling agressivo voltou ao startup.');
has(config,"document.addEventListener('DOMContentLoaded',patch,{once:true})",'Resiliência não é instalada antes do initApp.');

has(session,"const QUEUE_PREFIX='team_bulls_pending_sessions_v1_'",'Compatibilidade com a fila persistente antiga foi perdida.');
has(session,"const DELETE_PREFIX='team_bulls_pending_session_deletes_v1_'",'Fila/tombstone de exclusão pendente ausente.');
has(session,'if(!enqueue(entry))','Registro rápido não possui fallback seguro quando a fila local falha.');
has(session,"closeModal('modal-session')",'Registro rápido não libera o modal imediatamente.');
has(session,"showToast('✓ Série registrada')",'Feedback imediato do registro ausente.');
has(session,'scheduleFlush(40)','Sincronização em segundo plano ausente.');
has(session,"const existing=await cloudGet(ref,'reconciliar registro de série')",'Sincronização não verifica se um write anterior já chegou ao servidor.');
has(session,'if(existing.exists){assertExistingOwner(existing.data(),entry);await cloudWrite(ref.update(mutablePayload(entry))','Registro já existente não é atualizado sem tocar em createdAt.');
has(session,'else await cloudWrite(ref.set(createPayload(entry))','Registro realmente ausente não é criado com o ID idempotente.');
has(session,"createdAt:firebase.firestore.FieldValue.serverTimestamp()",'Criação deixou de fornecer createdAt exigido pelas Rules.');
const mutableStart=session.indexOf('function mutablePayload(entry)');
const mutableEnd=session.indexOf('function assertExistingOwner',mutableStart);
const mutableBlock=mutableStart>=0&&mutableEnd>mutableStart?session.slice(mutableStart,mutableEnd):'';
lacks(mutableBlock,'createdAt','Reconciliação de registro existente não pode reescrever createdAt imutável.');
lacks(mutableBlock,'userId:','Reconciliação não pode alterar userId.');
lacks(mutableBlock,'workoutId:','Reconciliação não pode alterar workoutId.');
lacks(mutableBlock,'exerciseId:','Reconciliação não pode alterar exerciseId.');

has(session,"getQueued(uidValue,sessionId)",'Editor/exclusão não reconhecem registro ainda pendente.');
has(session,"replaceQueued(uidValue,sessionId,patch)",'Edição de sessão pendente não atualiza a própria fila local.');
has(session,"showToast('✓ Alterações salvas. Sincronizando registro...')",'Edição pendente não dá retorno correto ao aluno.');
has(session,'if(!enqueueDelete(uidValue,sessionId))','Exclusão pendente não cria tombstone antes de cancelar o create.');
has(session,'if(!removeQueued(uidValue,sessionId))','Exclusão pendente não cancela a criação que poderia reaparecer.');
has(session,'removeLocalSession(sessionId,uidValue)','Exclusão pendente não remove o registro da interface/histórico local.');
has(session,"const ref=db.collection('sessions').doc(entry.id),existing=await cloudGet(ref,'reconciliar exclusão de registro')",'Tombstone não reconcilia existência no servidor antes do delete.');
has(session,"if(!existing.exists){removeDelete(entry.userId,entry.id);return true;}",'Exclusão de registro nunca criado não é concluída de forma idempotente.');
has(session,'wrapped.__tbQueueSafeDelete101029=true;','Runtime novo não impede o hotfix legado de reinstalar o bloqueio antigo de exclusão.');
has(session,"setTimeout(()=>{install();scheduleFlush(0);},700);",'Reconciliação inicial única da fila não está instalada.');
lacks(session,'[700,1800,4200]','Sincronização voltou a repetir writes por vários timers no startup.');

lacks(session,'setInterval(','Fila de sessões não deve usar polling contínuo.');
const syncEntryStart=session.indexOf('async function syncEntry(entry)');
const syncEntryEnd=session.indexOf('async function syncDelete',syncEntryStart);
const syncEntryBlock=syncEntryStart>=0&&syncEntryEnd>syncEntryStart?session.slice(syncEntryStart,syncEntryEnd):'';
assert((syncEntryBlock.match(/cloudWrite\(/g)||[]).length===2,'syncEntry deve ter apenas os caminhos exclusivos update-ou-create, sem retry de write no mesmo ciclo.');
const fastStart=session.indexOf('const fastSave=async function()');
const fastEnd=session.indexOf('function installEditPatch()',fastStart);
const fastBlock=fastStart>=0&&fastEnd>fastStart?session.slice(fastStart,fastEnd):'';
lacks(fastBlock,"await cloudWrite(db.collection('sessions')",'Salvar série voltou a esperar o Firestore antes de liberar a interface.');
has(session,'TB.flushPendingMutationSync=combined','Atualização não integra a fila persistente de séries.');

const sessionsRules=rules.slice(rules.indexOf('match /sessions/{id}'),rules.indexOf('match /feedback/{id}'));
has(sessionsRules,"immutable('createdAt')",'Rules deixaram de proteger createdAt nas edições.');
has(sessionsRules,'allow delete: if activeOwner(resource.data.userId);','Aluno ativo deixou de poder excluir apenas a própria sessão.');

has(updater,'const UPDATE_FLUSH_BUDGET_MS=700','Atualização voltou a esperar demais por flush de fundo.');
has(updater,'async function refreshCriticalShell()','Atualização crítica seletiva ausente.');
has(updater,'const CRITICAL_REFRESH_CONCURRENCY=4','Atualização crítica perdeu limite de concorrência.');
has(updater,"fresh.searchParams.set('tb-refresh',stamp)",'Atualização crítica não força leitura fresca da rede.');
has(updater,'await cache.put(item.original,item.response.clone())','Arquivos críticos não substituem as chaves estáveis do cache.');
has(updater,'await Promise.race([workerUpdate,sleep(UPDATE_WORKER_WAIT_MS)])','Atualização voltou a bloquear indefinidamente no Service Worker.');
has(updater,'scheduleBackgroundCheck(1800)','Verificação de versão ainda compete com a abertura inicial.');
lacks(updater,'await registration.update().catch(()=>{})','Init do atualizador voltou a bloquear o boot com update imediato.');

has(core,"const AUTH_UI_FALLBACK_MS=850",'Fallback rápido da tela de acesso foi removido.');
has(core,"document.addEventListener('DOMContentLoaded',initApp,{once:true})",'initApp não está ancorado no DOMContentLoaded.');

if(fail.length){
  console.error('\nFalhas de performance/sessões:\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log('Session/startup/update performance check OK — fila idempotente, edição pendente e exclusão com tombstone validadas.');
