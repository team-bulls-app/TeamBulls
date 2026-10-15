import fs from 'node:fs';

const fail=[];
const read=path=>fs.readFileSync(path,'utf8');
const assert=(condition,message)=>{if(!condition)fail.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

for(const path of ['modules/session-save-performance-v10_10_9.js','config_v10_7.js','update_v10_10_9.js','app_v10_10_9_core.js','sw.js','sw_47.js']){
  assert(fs.existsSync(path),`Arquivo obrigatório ausente: ${path}`);
}
if(fail.length){console.error(fail.join('\n'));process.exit(1);}

const session=read('modules/session-save-performance-v10_10_9.js');
const config=read('config_v10_7.js');
const updater=read('update_v10_10_9.js');
const core=read('app_v10_10_9_core.js');
const sw=read('sw.js');
const sw47=read('sw_47.js');

has(config,'./modules/session-save-performance-v10_10_9.js?v=10.10.63-sessionperf4','Revisão resiliente de registro de séries não está carregada.');
assert(config.indexOf('session-save-performance-v10_10_9.js')<config.indexOf('pending-session-mutations-v10_10_34.js'),'Registro rápido deve carregar antes da camada de mutações pendentes no runtime prioritário do aluno.');
lacks(config,'attempts++>=80','Polling agressivo voltou ao startup.');
has(config,"const installAndWarm=()=>{const ok=patch();if(ok)setTimeout(()=>warmFirebase(),0);return ok;}",'Warmup/resiliência de autenticação não está definido.');
has(config,'installAndWarm();','Resiliência não é instalada imediatamente durante a avaliação do bootstrap.');
has(config,"document.addEventListener('DOMContentLoaded',installAndWarm,{once:true})",'Resiliência não é reaplicada no DOMContentLoaded.');
assert(config.indexOf('installAndWarm();')<config.indexOf("document.addEventListener('DOMContentLoaded',installAndWarm,{once:true})"),'Warmup precisa iniciar antes de depender do DOMContentLoaded.');

has(session,"const VERSION='10.10.63-sessionperf4'",'Módulo de sessões não está na revisão resiliente esperada.');
has(session,"const QUEUE_PREFIX='team_bulls_pending_sessions_v1_'",'Fila persistente de séries ausente.');
has(session,'const SESSION_SNAPSHOT_VERSION=3','Fila de sessão não possui snapshots duráveis ordenados.');
has(session,'function parseQueueSnapshot(raw,uidValue)','Fila não interpreta snapshots legados e novos de forma compatível.');
has(session,'if(session?.fallback)return session;','Snapshots temporários legados não são recuperáveis.');
has(session,'value.updatedAt>latest.updatedAt','Cópia mais nova não tem prioridade sobre espelhos antigos.');
has(session,'if(!durable&&!indexed)return false;','sessionStorage sozinho ainda pode confirmar o salvamento.');
has(session,'if(!await enqueue(entry))','Registro rápido não aguarda persistência confirmada.');
has(session,'function ensureLocalSession(entry,exerciseOverride=null,pendingSync=true)','Registro pendente não possui projeção local determinística.');
has(session,'function restorePendingSessions({rerender=false}={})','Fila pendente não é restaurada no treino após reentrada/re-render.');
has(session,'if(latest)ensureLocalSession(latest,getE(wid,eid)||exercise,true);','Projeção não usa a revisão pendente atual no exercício atual.');
has(session,"window.addEventListener('team-bulls-student-runtime-ready',()=>{restorePendingSessions({rerender:true});recoverAndSchedule();})",'Runtime do aluno não recupera armazenamento persistente por evento.');
has(session,'restore:()=>restorePendingSessions({rerender:true})','API de sessões não expõe recuperação explícita das pendências.');
has(session,"closeModal('modal-session')",'Registro rápido não libera o modal imediatamente.');
has(session,"showToast('✓ Registro guardado no aparelho. Aguardando sincronização.')",'Feedback não distingue registro local da sincronização remota.');
has(session,'scheduleFlush(40)','Sincronização em segundo plano ausente.');
has(session,"db.collection('sessions').doc(entry.id)",'Fila não sincroniza usando ID idempotente.');
has(session,"ref.get({source:'server'})",'Reconciliação de rejeição pode usar cache antigo.');
has(session,"if(!String(error?.code||'').includes('permission-denied'))throw error;",'Reconciliação está repetindo falhas genéricas sem motivo.');
assert(session.indexOf('await ref.set(firestorePayload(entry))')<session.indexOf("ref.get({source:'server'})"),'Criação de documento novo não pode depender de um get negado pelas Rules 28.');
has(session,'if(!existing.exists)throw error;','Reconciliação não exige documento existente e permitido.');
has(session,'assertExistingOwner(existing.data(),entry)','Reconciliação não revalida usuário, treino e exercício do documento existente.');
has(session,"ref.update(mutablePayload(entry))",'Sessão já existente não preserva os campos imutáveis, incluindo createdAt.');
has(session,"ref.set(firestorePayload(entry))",'Sessão ausente não é criada com o ID e createdAt estáveis da fila.');
has(session,'function mutablePayload(entry)','Reconciliação não separa campos mutáveis dos campos protegidos pelas Rules 28.');
has(session,'TB.flushPendingMutationSync=combined','Atualização não integra a fila persistente de séries.');
lacks(session,'setInterval(','Módulo de séries não pode introduzir polling permanente.');
const fastStart=session.indexOf('const fastSave=async function()');
const fastEnd=session.indexOf('fastSave.__tbSessionPerf=true',fastStart);
const fastBlock=fastStart>=0&&fastEnd>fastStart?session.slice(fastStart,fastEnd):'';
lacks(fastBlock,"await cloudWrite(db.collection('sessions')",'Salvar série voltou a esperar o Firestore antes de liberar a interface.');

for(const [name,text] of [['sw.js',sw],['sw_47.js',sw47]]){
  has(text,"'/modules/session-save-performance-v10_10_9.js'",`${name} precisa servir o módulo de séries como network-first para não prender correções em cache antigo.`);
}
assert(sw===sw47,'Service Workers divergiram na política de entrega do registro de séries.');

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
  console.error('\nFalhas de performance:\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log('Session/startup/update performance check OK — séries pendentes priorizam armazenamento durável, reconciliam writes antigos preservando createdAt e recebem correções network-first.');
