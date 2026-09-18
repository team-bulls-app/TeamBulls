import fs from 'node:fs';

const fail=[];
const assert=(condition,message)=>{if(!condition)fail.push(message);};
const read=path=>fs.readFileSync(path,'utf8');

const modulePath='modules/session-save-performance-v10_10_9.js';
assert(fs.existsSync(modulePath),'Módulo de registro rápido de séries ausente.');
if(fail.length){console.error(fail.join('\n'));process.exit(1);}

const session=read(modulePath);
const ensureStart=session.indexOf('function ensureLocalSession(');
const ensureEnd=session.indexOf('function scheduleLocalProjection(',ensureStart);
const ensureBlock=ensureStart>=0&&ensureEnd>ensureStart?session.slice(ensureStart,ensureEnd):'';
const fastStart=session.indexOf('const fastSave=async function()');
const fastEnd=session.indexOf('fastSave.__tbSessionPerf=true',fastStart);
const fastBlock=fastStart>=0&&fastEnd>fastStart?session.slice(fastStart,fastEnd):'';

assert(session.includes('function durablePendingQueueContains(userId,entry)'),'Registro pendente não confirma que a revisão atual chegou à fila durável.');
assert(session.includes("String(item.id)===String(entry?.id||'')&&Number(item.revision||0)===Number(entry?.revision||0)"),'Fila durável não valida ID + revisão antes de dispensar o arquivo histórico.');
assert(session.includes('function persistPendingArchiveLater(userId,session,entry)'),'Persistência de fallback do arquivo histórico não está isolada do caminho crítico.');
assert(session.includes('if(durablePendingQueueContains(userId,entry))return true;'),'Registro ainda pode serializar todo o histórico mesmo quando a fila durável já protege a sessão.');
assert(session.includes("if(typeof runWhenIdle==='function')runWhenIdle(flush,1200);else setTimeout(flush,80)"),'Fallback do arquivo histórico não foi movido para uma janela ociosa.');
assert(ensureBlock.includes('if(pendingSync)persistPendingArchiveLater(entry.userId,current,entry);'),'Sessão pendente ainda grava o arquivo histórico completo de forma síncrona.');
assert(ensureBlock.includes('else saveSessionArchive(entry.userId,[current]);'),'Sessão já sincronizada precisa continuar consolidando o arquivo histórico.');
assert(session.includes('function scheduleLocalProjection(entry,exercise,wid,eid)'),'Projeção visual da série não foi retirada do toque crítico.');
assert(session.includes("if(typeof requestAnimationFrame==='function')requestAnimationFrame(run);else setTimeout(run,0)"),'Projeção local não aguarda o próximo frame visual.');
assert(!fastBlock.includes('ensureLocalSession(entry,exercise,true);'),'Salvar carga voltou a reconstruir histórico/renderização antes de liberar o modal.');
const closeIndex=fastBlock.indexOf("closeModal('modal-session')");
const toastIndex=fastBlock.indexOf("showToast('✓ Série, carga e repetições registradas')");
const projectionIndex=fastBlock.indexOf('scheduleLocalProjection(entry,exercise,wid,eid)');
assert(closeIndex>=0&&toastIndex>closeIndex&&projectionIndex>toastIndex,'Modal e feedback precisam ser liberados antes da projeção pesada do treino.');
assert(!session.includes('setInterval('),'O hot path de séries não pode introduzir polling permanente.');

if(fail.length){
  console.error('FALHA — hot path de registro de séries\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log('Session hot-path performance OK — fila durável confirma o registro antes do feedback, arquivo histórico sai do toque crítico e projeção/renderização passam ao próximo frame.');
