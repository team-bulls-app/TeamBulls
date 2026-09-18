import fs from 'node:fs';

const fail=[];
const read=path=>fs.readFileSync(path,'utf8');
const assert=(condition,message)=>{if(!condition)fail.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

for(const path of ['modules/session-save-performance-v10_10_9.js','config_v10_7.js','update_v10_10_9.js','app_v10_10_9_core.js']){
  assert(fs.existsSync(path),`Arquivo obrigatório ausente: ${path}`);
}
if(fail.length){console.error(fail.join('\n'));process.exit(1);}

const session=read('modules/session-save-performance-v10_10_9.js');
const config=read('config_v10_7.js');
const updater=read('update_v10_10_9.js');
const core=read('app_v10_10_9_core.js');

has(config,'./modules/session-save-performance-v10_10_9.js?v=10.10.58-sessionperf4','Revisão reconciliada de registro de séries não está carregada com cache-bust novo.');
assert(config.indexOf('session-save-performance-v10_10_9.js')<config.indexOf('pending-session-mutations-v10_10_34.js'),'Registro rápido deve carregar antes da camada de mutações pendentes no runtime prioritário do aluno.');
lacks(config,'attempts++>=80','Polling agressivo voltou ao startup.');
has(config,"const installAndWarm=()=>{const ok=patch();if(ok)setTimeout(()=>warmFirebase(),0);return ok;}",'Warmup/resiliência de autenticação não está definido.');
has(config,'installAndWarm();','Resiliência não é instalada imediatamente durante a avaliação do bootstrap.');
has(config,"document.addEventListener('DOMContentLoaded',installAndWarm,{once:true})",'Resiliência não é reaplicada no DOMContentLoaded.');
assert(config.indexOf('installAndWarm();')<config.indexOf("document.addEventListener('DOMContentLoaded',installAndWarm,{once:true})"),'Warmup precisa iniciar antes de depender do DOMContentLoaded.');

has(session,"const VERSION='10.10.58-sessionperf4'",'Módulo de sessões não está na revisão reconciliada esperada.');
has(session,"const QUEUE_PREFIX='team_bulls_pending_sessions_v1_'",'Fila persistente de séries ausente.');
has(session,'const QUEUE_SCHEMA=2','Fila não versiona o envelope persistido para reconciliar cópias.');
has(session,'function parseQueueState(raw,uidValue)','Fila não diferencia cópia legada de envelope versionado.');
has(session,'function chooseQueueState(durable,session)','Fila não reconcilia armazenamento durável e sessionStorage.');
has(session,'if(durable.updatedAt!==session.updatedAt)return durable.updatedAt>session.updatedAt?durable:session','Fila não escolhe a cópia versionada mais recente.');
has(session,'return durable;','Conflito legado não preserva o armazenamento durável como fonte canônica.');
has(session,'function nextQueueStamp()','Fila não possui relógio monotônico de revisão local.');
has(session,'JSON.stringify({schema:QUEUE_SCHEMA,updatedAt:nextQueueStamp(),items})','Escrita da fila não grava envelope com revisão.');
has(session,'if(!enqueue(entry))','Registro rápido não possui fallback seguro quando a fila local falha.');
has(session,"sessionStorage.setItem(key,serialized)",'Fila não possui espelho de sessão quando o armazenamento durável fica indisponível.');
has(session,'function ensureLocalSession(entry,exerciseOverride=null,pendingSync=true)','Registro pendente não possui projeção local determinística.');
has(session,'function restorePendingSessions({rerender=false}={})','Fila pendente não é restaurada no treino após reentrada/re-render.');
has(session,'ensureLocalSession(entry,exercise,true);','Salvar série não projeta carga/repetições no exercício antes da sincronização remota.');
has(session,"window.addEventListener('team-bulls-student-runtime-ready',()=>restorePendingSessions({rerender:true}))",'Runtime do aluno não restaura séries pendentes por evento.');
has(session,'restore:()=>restorePendingSessions({rerender:true})','API de sessões não expõe recuperação explícita das pendências.');
has(session,"closeModal('modal-session')",'Registro rápido não libera o modal imediatamente.');
has(session,"showToast('✓ Série, carga e repetições registradas')",'Feedback imediato de séries/carga/repetições ausente.');
has(session,'scheduleFlush(40)','Sincronização em segundo plano ausente.');
has(session,"db.collection('sessions').doc(entry.id).set",'Fila não sincroniza usando ID idempotente.');
has(session,'TB.flushPendingMutationSync=combined','Atualização não integra a fila persistente de séries.');
lacks(session,'setInterval(','Módulo de séries não pode introduzir polling permanente.');
const fastStart=session.indexOf('const fastSave=async function()');
const fastEnd=session.indexOf('fastSave.__tbSessionPerf=true',fastStart);
const fastBlock=fastStart>=0&&fastEnd>fastStart?session.slice(fastStart,fastEnd):'';
lacks(fastBlock,"await cloudWrite(db.collection('sessions')",'Salvar série voltou a esperar o Firestore antes de liberar a interface.');

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
console.log('Session/startup/update performance check OK — fila de séries reconcilia cópias local/sessão e preserva cargas e repetições antes da confirmação remota.');
