import fs from 'node:fs';

const fail=[];
const read=path=>fs.readFileSync(path,'utf8');
const assert=(condition,message)=>{if(!condition)fail.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

for(const path of ['modules/student-weekly-report-entry-v10_10_35.js','config_v10_7.js','index.html','app_v10_10_9_core.js','firebase/firestore_28_compacto.rules']){
  assert(fs.existsSync(path),`Arquivo obrigatório ausente: ${path}`);
}
if(fail.length){console.error(fail.join('\n'));process.exit(1);}

const module=read('modules/student-weekly-report-entry-v10_10_35.js');
const config=read('config_v10_7.js');
const index=read('index.html');
const core=read('app_v10_10_9_core.js');
const rules=read('firebase/firestore_28_compacto.rules');

has(index,'id="screen-my-quest"','A aba Relatórios do aluno não existe.');
has(index,'id="my-weekly-checkin-list"','Histórico semanal não está presente na aba Relatórios.');
has(core,'openMyQuestionnaires=async function()','Fluxo de abertura dos relatórios do aluno não está disponível.');
has(core,"renderWeeklyCheckinHistory(checkins,'my-weekly-checkin-list')",'Histórico semanal deixou de ser preservado.');

has(config,'./modules/student-weekly-report-entry-v10_10_35.js?v=10.10.35-weeklyentry1','Entrada do relatório semanal atual não está no runtime do aluno.');
const realtimeAt=config.indexOf('student-request-realtime-v10_10_32.js');
const entryAt=config.indexOf('student-weekly-report-entry-v10_10_35.js');
const workoutAt=config.indexOf('student-workout-library-v10_10_24.js');
assert(realtimeAt>=0&&entryAt>realtimeAt&&workoutAt>entryAt,'Entrada semanal deve carregar cedo, depois do realtime e antes da biblioteca de treinos.');

has(module,"const HOST_ID='tb-weekly-report-current'",'Card do relatório semanal atual não possui host próprio.');
has(module,"document.getElementById('my-weekly-checkin-list')",'Card atual não é inserido na aba Relatórios.');
has(module,"history.parentNode.insertBefore(host,history)",'Card atual precisa ficar antes do histórico semanal.');
has(module,"const base=openMyQuestionnaires",'Abertura da aba Relatórios não foi integrada ao relatório semanal atual.');
has(module,'await refreshCurrent(true)','A aba Relatórios não força atualização da programação semanal.');
has(module,"loadWeeklyCheckinState(!!force)",'Programação semanal não é carregada pelo fluxo canônico.');
has(module,"schedule.enabled!==false",'Planos sem relatório semanal não estão sendo respeitados.');
has(module,"ENVIAR RELATÓRIO E 6 FOTOS",'Ação principal de envio semanal não está visível.');
has(module,"openWeeklyCheckinModal()",'Botão semanal não abre o formulário canônico de envio.');
has(module,"button.textContent='ENVIAR RELATÓRIO'",'Aviso da Home não foi transformado em ação direta de envio.');
has(module,"button.setAttribute('onclick','openWeeklyCheckinModal()')",'Aviso da Home ainda desvia o aluno para Registros.');
has(module,"const base=renderWeeklyCheckinCard",'Atualizações em tempo real não sincronizam o novo card da aba Relatórios.');

lacks(module,'db.collection(','O módulo visual não deve criar consultas Firestore próprias.');
lacks(module,'cloudWrite(','O módulo visual não deve criar novas escritas no Firestore.');
lacks(module,'setInterval(','O módulo não deve adicionar polling.');

has(rules,'match /checkinSchedules/{uid}','Rules 28 perderam a programação semanal.');
has(rules,'allow read: if trainerOwns(uid) || activeOwner(uid);','Aluno ativo deixou de poder ler a própria programação semanal.');
has(rules,'match /weeklyCheckins/{id}','Rules 28 perderam os relatórios semanais.');
has(rules,'allow create: if activeOwner(request.resource.data.studentId)','Aluno ativo deixou de poder criar o próprio relatório semanal.');

if(fail.length){
  console.error('\nFalhas na entrada semanal do aluno:\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — aba Relatórios mostra a solicitação semanal atual antes do histórico, respeita o plano, abre o envio canônico com 6 fotos e não adiciona reads/writes/polling.');
