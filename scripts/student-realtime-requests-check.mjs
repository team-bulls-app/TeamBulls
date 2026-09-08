import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const fail=[];
const assert=(ok,message)=>{if(!ok)fail.push(message);};
const read=file=>fs.readFileSync(file,'utf8');
const runtime=read('modules/student-realtime-requests-v10_10_32.js');
const config=read('config_v10_7.js');
const sw=read('sw.js');

const syntax=spawnSync(process.execPath,['--check','modules/student-realtime-requests-v10_10_32.js'],{encoding:'utf8'});
assert(syntax.status===0,`Runtime realtime possui JavaScript inválido: ${String(syntax.stderr||'').trim()}`);

const modulePath="'./modules/student-realtime-requests-v10_10_32.js?v=10.10.32-realtime1'";
assert(config.includes(modulePath),'Runtime realtime não está ligado ao loader do aluno.');
const priorityStart=config.indexOf('const studentPriorityModules=['),priorityEnd=config.indexOf('const modules=[',priorityStart);
assert(priorityStart>=0&&priorityEnd>priorityStart&&config.slice(priorityStart,priorityEnd).includes(modulePath),'Runtime realtime precisa ser prioridade do aluno, não módulo tardio.');
assert(sw.includes("'/config_v10_7.js'"),'Service Worker precisa manter config_v10_7.js como arquivo mutável para distribuir o hotfix sem cache preso.');

for(const source of [
  "watchQuery('notifications',db.collection('notifications').where('studentId','==',uid).limit(120),generation)",
  "watchQuery('feedback',db.collection('feedback').where('studentId','==',uid).limit(80),generation)",
  "watchQuery('questionnaires',db.collection('questionnaires').where('studentId','==',uid).limit(120),generation)",
  "watchDoc('weeklySchedule',db.collection('checkinSchedules').doc(uid),generation)",
  "watchQuery('weeklyCheckins',db.collection('weeklyCheckins').where('studentId','==',uid).limit(520),generation)",
  "watchDoc('protocol',db.collection('protocolReviewSchedules').doc(uid),generation)"
])assert(runtime.includes(source),`Listener realtime ausente: ${source}`);
assert(runtime.includes('query.onSnapshot(')&&runtime.includes('reference.onSnapshot('),'Pedidos ainda não usam listeners onSnapshot reais.');
assert(!runtime.includes('setInterval('),'Runtime realtime não pode introduzir polling periódico.');

assert(runtime.includes('function weeklyCheckinItems()'),'Relatórios semanais realtime não normalizam o histórico recebido.');
assert(runtime.includes('computeCheckinRequest(schedule,weeklyCheckinItems())'),'Relatório semanal/extra precisa reutilizar o cálculo canônico com histórico concluído.');
assert(runtime.includes('schedule.enabled===false'),'Plano sem relatório semanal precisa continuar bloqueado no realtime.');
assert(runtime.includes("live.weeklySchedule?.enabled===false"),'UI semanal não é ocultada quando o recurso está fora do plano.');
assert(runtime.includes("typeof v109ProtocolState==='function'")&&runtime.includes('v109ProtocolState(schedule)'),'Atualização de protocolo realtime não usa o cálculo canônico do ciclo.');
assert(!runtime.includes('nextReviewDate'),'Runtime realtime não pode depender do campo legado/inexistente nextReviewDate.');

for(const fn of ['checkQuestionnaires','checkFeedback','loadWeeklyCheckinState','loadStudentProtocolReview']){
  assert(runtime.includes(`typeof ${fn}==='function'`)&&runtime.includes(`${fn}.__tbRealtimeRequests`),`Fluxo legado ${fn} não é reaproveitado pelo estado realtime.`);
}
assert(runtime.includes('WEEKLY_CHECKIN_SCHEDULE=live.weeklySchedule'),'Estado semanal canônico não é atualizado pelo listener.');
assert(runtime.includes('WEEKLY_CHECKIN_REQUEST=weeklyRequest()'),'Solicitação semanal canônica não é recalculada ao vivo.');
assert(runtime.includes('V109_PROTOCOL_REVIEW_SCHEDULE=live.protocol'),'Cronograma canônico não é atualizado ao vivo.');

assert(runtime.includes('tb-home-notice-count'),'Badge da Home não é atualizado em tempo real.');
assert(runtime.includes('openNotifications:openRealtimeCenter'),'Central do sino ainda depende da leitura manual antiga.');
assert(runtime.includes("document.getElementById('screen-student-notifications')?.classList.contains('active')"),'Central aberta não é rerenderizada quando chega um pedido.');
assert(runtime.includes('toastNew(items)'),'Aluno não recebe aviso visual imediato quando o app está aberto.');

assert(runtime.includes('live.unsubs.splice(0)')&&runtime.includes('unsubscribe()'),'Listeners não são encerrados ao trocar/sair da sessão.');
assert(runtime.includes("typeof confirmLogout==='function'")&&runtime.includes('stop();return base.apply(this,arguments)'),'Logout não encerra listeners do aluno.');
assert(runtime.includes("if(!cloudStudent()){if(live.uid)stop();return false;}"),'Listeners podem sobreviver fora do contexto cloud do aluno.');

const observerCount=(runtime.match(/new MutationObserver/g)||[]).length;
assert(observerCount===1,'Runtime realtime deve ter somente o observer localizado do badge.');
assert(runtime.includes('badgeObserver.observe(badge,{childList:true,characterData:true,subtree:true})'),'Observer realtime não está limitado ao badge de notificações.');

const writeCount=(runtime.match(/cloudWrite\(/g)||[]).length;
assert(writeCount===2,'Runtime realtime não deve criar gravações automáticas; somente duas ações explícitas de marcar como lida são permitidas.');
assert(runtime.includes("db.collection('notifications').doc(id).update({readAt:")&&runtime.includes("db.collection('feedback').doc(id).update({read:true})"),'As únicas escritas do realtime precisam ser ações explícitas de leitura.');
assert(!/db\.collection\([^\n]+\)\.doc\([^\n]+\)\.(?:set|delete)\(/.test(runtime),'Runtime realtime não pode criar/apagar documentos.');
assert(!runtime.includes('db.batch('),'Runtime realtime não pode criar batch de escrita.');

if(fail.length){
  console.error('FALHA — entrega realtime de relatórios/atualizações\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — pedidos de relatório, agenda semanal, atualizações e feedback chegam por listeners somente leitura; badge/central atualizam ao vivo e logout encerra os listeners.');
