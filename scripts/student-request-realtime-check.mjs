import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const fail=[];
const assert=(ok,message)=>{if(!ok)fail.push(message);};
const read=file=>fs.readFileSync(file,'utf8');
const config=read('config_v10_7.js');
const realtime=read('modules/student-request-realtime-v10_10_32.js');
const rules=read('firebase/firestore_28_compacto.rules');

const syntax=spawnSync(process.execPath,['--check','modules/student-request-realtime-v10_10_32.js'],{encoding:'utf8'});
assert(syntax.status===0,`Módulo realtime possui JavaScript inválido: ${String(syntax.stderr||'').trim()}`);

const moduleUrl='./modules/student-request-realtime-v10_10_32.js?v=10.10.32-studentrealtime2';
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
assert(realtime.includes("V109_PROTOCOL_REVIEW_SCHEDULE=schedule"),'Estado oficial do ciclo de protocolo não é atualizado pelo snapshot.');
assert(realtime.includes("document.getElementById('tb-home-notice-count')"),'Sino da Home não recebe as novas pendências em tempo real.');
assert(realtime.includes("screen-student-notifications"),'Central aberta não é renovada quando chega um evento novo.');
assert(realtime.includes('badgeObserver.observe(badge'),'Proteção do contador precisa observar somente o badge local da Home.');
assert(!realtime.includes('observer.observe(document.body'),'Módulo realtime não pode instalar observer global no body.');

assert(realtime.includes('unsubs.splice(0).forEach'),'Listeners Firestore não são desmontados ao trocar/sair da conta.');
assert(realtime.includes('firebase.auth().onAuthStateChanged'),'Troca/encerramento da autenticação não encerra os listeners.');
assert(realtime.includes('confirmLogout.__tbStudentRealtimeStop'),'Logout explícito não possui proteção de desmontagem.');
assert(realtime.includes('if(activeUid===uid&&unsubs.length)'),'Runtime pode duplicar listeners para o mesmo aluno.');

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
  console.error('FALHA — entrega realtime de relatórios e atualizações\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — relatórios, semanal, atualização de protocolo, feedback e notificações chegam por snapshots somente leitura; sino/central atualizam sem polling e listeners são desmontados no logout.');
