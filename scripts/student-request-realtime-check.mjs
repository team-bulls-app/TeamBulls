import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const fail=[];
const assert=(ok,message)=>{if(!ok)fail.push(message);};
const read=file=>fs.readFileSync(file,'utf8');
const config=read('config_v10_7.js');
const realtime=read('modules/student-request-realtime-v10_10_32.js');
const submitState=read('modules/student-report-submit-reconciliation-v10_10_54.js');
const loader=read('modules/intelligence-suite-loader-v10_10_42.js');
const rules=read('firebase/firestore_28_compacto.rules');

for(const modulePath of ['modules/student-request-realtime-v10_10_32.js','modules/student-report-submit-reconciliation-v10_10_54.js']){
  const syntax=spawnSync(process.execPath,['--check',modulePath],{encoding:'utf8'});
  assert(syntax.status===0,`Módulo possui JavaScript inválido (${modulePath}): ${String(syntax.stderr||'').trim()}`);
}

const moduleUrl='./modules/student-request-realtime-v10_10_32.js?v=10.10.32-studentrealtime3';
assert(config.includes(`'${moduleUrl}'`),'Loader prioritário do aluno não inclui a sincronização realtime atual.');
const priority=config.match(/const studentPriorityModules=\[([\s\S]*?)\n  \];/)?.[1]||'';
assert(priority.includes(moduleUrl),'Sincronização realtime precisa estar no runtime prioritário do aluno.');
assert(priority.indexOf('student-home-profile-v10_10_12.js')<priority.indexOf('student-request-realtime-v10_10_32.js'),'Central/perfil do aluno deve carregar antes do listener realtime.');

assert(realtime.includes("ACCESS_MODE==='cloud-active'"),'Listener não está limitado à sessão cloud ativa do aluno.');
assert(realtime.includes("CURRENT_USER?.status!=='inactive'"),'Aluno inativo não pode manter listeners realtime.');
assert(realtime.includes("db.collection('questionnaires').where('studentId','==',uid).where('answered','==',false)"),'Relatórios personalizados pendentes não possuem listener realtime.');
assert(realtime.includes("db.collection('checkinSchedules').doc(uid).onSnapshot"),'Programação/solicitação semanal não possui listener realtime.');
assert(realtime.includes("db.collection('weeklyCheckins').where('studentId','==',uid).onSnapshot"),'Histórico semanal não acompanha conclusões para recalcular a pendência.');
assert(realtime.includes("db.collection('protocolReviewSchedules').doc(uid).onSnapshot"),'Atualização completa de protocolo não possui listener realtime.');
assert(realtime.includes("db.collection('feedback').where('studentId','==',uid).where('read','==',false)"),'Feedback do treinador não possui listener realtime.');
assert(realtime.includes("db.collection('notifications').where('studentId','==',uid).limit(120).onSnapshot"),'Central de notificações não possui listener realtime.');

assert(realtime.includes("liveSchedule?.enabled===false?null"),'Relatório semanal desativado por plano pode reaparecer pela camada realtime.');
assert(realtime.includes('WEEKLY_CHECKIN_REQUEST=request'),'Estado semanal oficial não é sincronizado com o snapshot.');
assert(realtime.includes("V109_PROTOCOL_REVIEW_SCHEDULE=schedule"),'Estado oficial do ciclo de protocolo não é atualizado com o snapshot.');
assert(realtime.includes("document.getElementById('tb-home-notice-count')"),'Sino da Home não recebe as novas pendências em tempo real.');
assert(realtime.includes("screen-student-notifications"),'Central aberta não é renovada quando chega um evento novo.');
assert(realtime.includes('badgeObserver.observe(badge'),'Proteção do contador precisa observar somente o badge local da Home.');
assert(!realtime.includes('observer.observe(document.body'),'Módulo realtime não pode instalar observer global no body.');

assert(realtime.includes("const MAX_DUE_TIMER_MS=2000000000"),'Vencimentos futuros não possuem timer seguro para fronteira de data.');
assert(realtime.includes('localMidnightMs'),'Vencimentos não são ancorados na meia-noite local da data programada.');
assert(realtime.includes("weeklyFutureDue=request&&!request.pending"),'Relatório semanal futuro não agenda a própria virada para pendente.');
assert(realtime.includes("protocolFutureDue=state&&!state.pending"),'Atualização de protocolo futura não agenda a própria virada para pendente.');
assert(realtime.includes("recomputeDueStates('timer')"),'Passagem automática da data não recalcula relatório/protocolo sem write no Firestore.');
assert(realtime.includes("if(activeUid===uid&&unsubs.length){recomputeDueStates('resume')"),'Retorno do background não recalcula vencimentos que passaram com o PWA suspenso.');
assert(realtime.includes('clearTimeout(dueTimer)'),'Timer de vencimento não é desmontado/reprogramado com segurança.');
assert(realtime.includes('TeamBullsStudentHomeFastProtocolDate?.sync?.()'),'Data rápida da Home não é atualizada quando o vencimento passa localmente.');

assert(realtime.includes('unsubs.splice(0).forEach'),'Listeners Firestore não são desmontados ao trocar/sair da conta.');
assert(realtime.includes('firebase.auth().onAuthStateChanged'),'Troca/encerramento da autenticação não encerra os listeners.');
assert(realtime.includes('confirmLogout.__tbStudentRealtimeStop'),'Logout explícito não possui proteção de desmontagem.');
assert(realtime.includes('if(activeUid===uid&&unsubs.length)'),'Runtime pode duplicar listeners para o mesmo aluno.');

// Confirmação pós-envio: o write original continua soberano e nunca é repetido.
assert(loader.includes("const VERSION='10.10.55-intelsuite5'"),'Loader da suíte não foi cache-bustado para a reconciliação de envio.');
assert(loader.includes("student-report-submit-reconciliation-v10_10_54.js?v=10.10.54-submitstate1"),'Aluno não carrega a reconciliação pós-envio.');
assert(loader.indexOf('student-trainer-activity-bridge-v10_10_47.js')<loader.indexOf('student-report-submit-reconciliation-v10_10_54.js'),'Reconciliação deve envolver o fluxo já instrumentado de atividade do treinador.');
assert(submitState.includes("const VERSION='10.10.54-submitstate1'"),'Reconciliação pós-envio está na revisão errada.');
assert(submitState.includes("reference.get({source:'server'})"),'Confirmação do envio não prioriza leitura real do servidor.');
assert(submitState.includes("snap.data()?.answered===true"),'Questionário não é confirmado pelo answered canônico do documento enviado.');
assert(submitState.includes("db.collection('questionnaires').where('studentId','==',uid).limit(100)"),'Pendências do aluno não são reconciliadas pela coleção canônica.');
assert(submitState.includes(".filter(report=>report.answered!==true)"),'Banner ainda pode tratar relatório respondido como pendente.');
assert(submitState.includes("banner.dataset.pendingCount=String(rows.length)"),'Banner não distingue múltiplas solicitações pendentes.');
assert(submitState.includes("Ainda há ${pendingLabel(pending.length)} diferente(s)"),'Aluno não é informado quando o envio foi confirmado mas existe outra pendência.');
assert(submitState.includes("weeklyCheckinDocId(uid,request.requestKey)"),'Relatório semanal não é confirmado pelo ID determinístico do envio.');
assert(submitState.includes("db.collection('weeklyCheckins').doc(sourceId)"),'Relatório semanal não verifica o documento canônico específico.');
assert((submitState.match(/const result=await base\.apply\(this,arguments\);/g)||[]).length===2,'Cada submit original (questionário e semanal) deve rodar exatamente uma vez, sem retry cego.');
assert(!submitState.includes('cloudWrite('),'Reconciliação pós-envio não pode criar nova escrita.');
assert(!/\.set\s*\(/.test(submitState),'Reconciliação pós-envio não pode criar documentos Firestore.');
assert(!/\.update\s*\(/.test(submitState),'Reconciliação pós-envio não pode alterar documentos Firestore.');
assert(!/\.delete\s*\(/.test(submitState),'Reconciliação pós-envio não pode excluir documentos Firestore.');
assert(!submitState.includes('setInterval('),'Reconciliação pós-envio não pode usar polling.');
assert(!submitState.includes('MutationObserver'),'Reconciliação pós-envio não pode observar globalmente o DOM.');

assert(!realtime.includes('setInterval('),'Sincronização de pedidos não pode usar polling por intervalo.');
assert(!realtime.includes('cloudWrite('),'Camada realtime deve ser somente leitura e não criar gravações automáticas.');
assert(!/\.set\s*\(/.test(realtime),'Camada realtime não pode criar documentos Firestore.');
assert(!/\.update\s*\(/.test(realtime),'Camada realtime não pode alterar documentos Firestore.');
assert(!/\.delete\s*\(/.test(realtime),'Camada realtime não pode excluir documentos Firestore.');

assert(rules.includes('match /questionnaires/{id}'),'Rules ativas não contêm questionários.');
assert(rules.includes('match /checkinSchedules/{uid}'),'Rules ativas não contêm programação semanal.');
assert(rules.includes('match /protocolReviewSchedules/{uid}'),'Rules ativas não contêm cronograma de atualização.');
assert(rules.includes('match /feedback/{id}'),'Rules ativas não contêm feedback.');
assert(rules.includes('match /notifications/{id}'),'Rules ativas não contêm central de notificações.');

if(fail.length){
  console.error('FALHA — entrega realtime / confirmação canônica de relatórios\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — envios são confirmados pelo documento canônico, múltiplas pendências são diferenciadas e nenhum retry cego é criado.');
