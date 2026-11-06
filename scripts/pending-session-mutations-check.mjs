import fs from 'node:fs';

const fail=message=>{console.error('REPROVADO — '+message);process.exit(1);};
const need=(condition,message)=>{if(!condition)fail(message);};
const perf=fs.readFileSync('modules/session-save-performance-v10_10_9.js','utf8');
const mutation=fs.readFileSync('modules/pending-session-mutations-v10_10_34.js','utf8');
const config=fs.readFileSync('config_v10_7.js','utf8');
const rules=fs.readFileSync('firebase/firestore_28_compacto.rules','utf8');

need(perf.includes("VERSION='10.10.63-sessionperf6'"),'fila rápida não está na revisão esperada');
need(perf.includes('createdAtMs')&&perf.includes('stableCreatedAt(entry)'),'fila não preserva timestamp estável da criação');
need(!/createdAt\s*:\s*firebase\.firestore\.FieldValue\.serverTimestamp\(\)/.test(perf),'fila rápida ainda recria createdAt com serverTimestamp a cada tentativa');
need(perf.includes('revision:current.revision+1'),'edição pendente não versiona a fila contra corrida de sincronização');
need(perf.includes('latest.revision!==entry.revision'),'sincronização antiga pode apagar uma edição mais nova da fila');
need(perf.includes('updatePending')&&perf.includes('discardPending')&&perf.includes('hasPending'),'API da fila não expõe edição/exclusão pendente controlada');
need(perf.includes('restorePendingSessions'),'fila pendente não é reconstruída no runtime após reentrada/re-render');

need(mutation.includes("saveEditSession=wrapped"),'edição de sessão pendente não foi interceptada');
need(mutation.includes('updatePending?.(sessionId'),'edição pendente não atualiza a fila persistente');
need(mutation.includes('pendingSync:true'),'sessão editada localmente perde indicação de sincronização pendente');
need(mutation.includes('__tbDurableSessionDelete'),'a camada de mutações não delega ao delete durável canônico');
const core=fs.readFileSync('app_v10_10_9_core.js','utf8');
need(core.includes('await runtime.requestDelete(sessionId,owner?.session)'),'core não aguarda persistência da intenção de exclusão');
const deletion=perf.slice(perf.indexOf('async function requestDelete('),perf.indexOf('async function commitDeletion('));
need(deletion.indexOf('await mutateDeletions')<deletion.indexOf('await removeQueued'),'criação foi cancelada antes de persistir intenção de exclusão');
need(perf.includes("const writing=remoteWrites.get(entry.userId+':'+entry.id)"),'exclusão não identifica a criação em voo do mesmo ID');
need(perf.includes("if(writing)await writing.catch(()=>{})"),'exclusão não espera a Promise real da criação');
need(perf.includes("where('userId','==',entry.userId)")&&perf.includes("get({source:'server'})"),'confirmação de ausência não usa consulta limitada ao dono e servidor');
need(perf.includes('if(snapshot.docs.length)throw error'),'permissão negada em documento existente pode virar sucesso falso');
need(perf.includes('requestDelete,')&&perf.includes('filterDeleted,')&&perf.includes('isDeletePending:'),'API da exclusão durável incompleta');
need(!mutation.includes('cloudWrite('),'a camada de mutações voltou a duplicar o delete remoto');
need(!mutation.includes('setInterval('),'hotfix não pode adicionar polling');

const perfUrl='./modules/session-save-performance-v10_10_9.js?v=10.10.63-sessionperf6';
const mutationUrl='./modules/pending-session-mutations-v10_10_34.js?v=10.10.63-pendingsession3';
need(config.includes(perfUrl),'loader não entrega a revisão nova da fila');
need(config.includes(mutationUrl),'loader não entrega o hotfix de edição/exclusão pendente');
need(config.indexOf(perfUrl)<config.indexOf(mutationUrl),'hotfix pendente carrega antes da API da fila');

need(/match \/sessions\/\{id\}[\s\S]*?allow delete: if activeOwner\(resource\.data\.userId\);/.test(rules),'Rules 28 deixaram de restringir sessão ao próprio aluno ativo');
need(!rules.includes('pending-session-mutations'),'correção do cliente não deve depender de permissão especial nas Rules');

console.log('APROVADO — registro pendente pode ser restaurado/editado/excluído sem exigir criação prévia no Firestore; fila usa createdAt estável, protege corridas e mantém Rules 28 fechadas.');
