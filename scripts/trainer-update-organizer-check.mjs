import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const failures=[];
const assert=(condition,message)=>{if(!condition)failures.push(message);};
const read=file=>fs.readFileSync(file,'utf8');

const modulePath='modules/trainer-update-organizer-v10_10_41.js';
const usabilityPath='modules/usability-checkup-v10_10_9.js';
const feedbackPath='modules/trainer-feedback-archive-v10_10_37.js';
const rulesPath='firebase/firestore_28_compacto.rules';
const workerPath='sw.js';

for(const file of [modulePath,usabilityPath,feedbackPath,rulesPath,workerPath])assert(fs.existsSync(file),`Arquivo obrigatório ausente: ${file}`);
for(const file of [modulePath,usabilityPath,feedbackPath,workerPath]){
  if(!fs.existsSync(file))continue;
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert(result.status===0,`${file} possui JavaScript inválido: ${String(result.stderr||'').trim()}`);
}

const source=fs.existsSync(modulePath)?read(modulePath):'';
const usability=fs.existsSync(usabilityPath)?read(usabilityPath):'';
const feedback=fs.existsSync(feedbackPath)?read(feedbackPath):'';
const rules=fs.existsSync(rulesPath)?read(rulesPath):'';
const worker=fs.existsSync(workerPath)?read(workerPath):'';
const src='./modules/trainer-update-organizer-v10_10_41.js?v=10.10.41-updateorganizer1';

assert(source.includes("const VERSION='10.10.41-updateorganizer1'"),'Agenda não possui revisão própria.');
assert(source.includes("SCREEN_ID='screen-trainer-update-organizer'"),'Tela dedicada de organização está ausente.');
assert(source.includes("ENTRY_ID='tb-trainer-update-organizer-entry'"),'Atalho da agenda no perfil do treinador está ausente.');
assert(source.includes('Organização de atualizações — próximas datas'),'Atalho não comunica a finalidade da agenda.');
assert(source.includes('Atualizações semanais e mensais')||source.includes('atualizações semanais e mensais'),'Tela não explica os dois tipos de atualização.');
assert(source.includes("data-tb-update-filter=\"weekly\"")&&source.includes("data-tb-update-filter=\"monthly\""),'Filtros semanal/mensal não estão presentes.');
assert(source.includes("data-tb-update-filter=\"completed\""),'Histórico recente de concluídas não está acessível.');
assert(source.includes("currentItems.sort((a,b)=>a.dueDate.localeCompare(b.dueDate)"),'Próximas atualizações deixaram de ser ordenadas por data.');
assert(source.includes("students.filter(item=>item.status!=='inactive')"),'Alunos explicitamente pausados/inativos voltaram a entrar nas próximas atualizações.');
assert(source.includes('Programação incompleta')&&source.includes("kind:'weekly'")&&source.includes("kind:'monthly'"),'Agenda não alerta alunos ativos sem cronograma semanal/mensal.');

assert(source.includes('function weeklyDue(schedule)'),'Cálculo independente da próxima atualização semanal está ausente.');
assert(source.includes('organizerWeeklyCompletedThrough'),'Conclusão semanal não possui ponteiro administrativo persistente.');
assert(source.includes('organizerWeeklyCompletedAt')&&source.includes('organizerWeeklyCompletedBy'),'Conclusão semanal não registra quando/por quem foi feita.');
assert(source.includes("db.collection('checkinSchedules').doc(item.studentId).set(payload,{merge:true})"),'Checkbox semanal não persiste no cronograma canônico do aluno.');
assert(!source.includes("db.collection('weeklyCheckins').doc("),'Agenda não pode falsificar relatório semanal do aluno.');
assert(!source.includes("db.collection('weeklyCheckins').add("),'Agenda não pode criar relatório semanal artificial.');
assert(source.includes('Isso é apenas um controle de organização e não marca relatório do aluno como enviado.'),'Confirmação semanal não deixa claro que o relatório do aluno é independente.');

assert(source.includes("db.collection('protocolReviewSchedules').doc(item.studentId).update(payload)"),'Checkbox mensal não usa o ciclo oficial de atualização completa.');
assert(source.includes('lastCompletedCycle:cycle')&&source.includes('lastCompletedDate:todayIso()'),'Conclusão mensal não atualiza os campos canônicos do ciclo.');
assert(source.includes('v109SyncActiveProtocolDates')&&source.includes('v109SyncProtocolMetadataToWeeklySchedule'),'Conclusão mensal não preserva a sincronização de datas do fluxo canônico.');
assert(source.includes("item.dueDate>todayIso()"),'Atualizações futuras podem ser concluídas antes da data.');
assert(source.includes("future?'Disponível para conclusão na data programada'"),'Checkbox futuro não explica por que está bloqueado.');

assert(source.includes("db.collection('users').where('trainerId','==',uid).where('role','==','student').limit(500)"),'Agenda deve restringir a query de usuários ao trainerId e role=student para ser compatível com Rules 28.');
assert(source.includes('mapWithLimit(activeStudents,CONCURRENCY'),'Agenda deve limitar a concorrência das leituras por aluno.');
assert(source.includes("db.collection('protocolReviewSchedules').doc(sid)"),'Agenda mensal deve ler o documento canônico pelo uid de cada aluno vinculado.');
assert(source.includes("db.collection('checkinSchedules').doc(sid)"),'Agenda semanal deve ler apenas o cronograma do aluno vinculado.');
assert(!source.includes("db.collection('protocolReviewSchedules').where('trainerId','==',uid)"),'Agenda não deve usar listagem global de cronogramas mensais que não é comprovável pelas Rules 28.');
assert(!source.includes('setInterval'),'Agenda não deve adicionar polling.');
assert(!source.includes('MutationObserver'),'Agenda não deve adicionar observer global.');
assert(!source.includes('onSnapshot'),'Agenda não deve manter listeners globais apenas para organização.');

assert(usability.includes(src),'Camada network-first não carrega a agenda do treinador.');
assert(usability.includes("EXPECTED_VERSION='10.10.41-updateorganizer1'"),'Loader não exige a revisão correta da agenda.');
assert(usability.includes("CURRENT_USER?.role==='trainer'&&MODE==='cloud'"),'Loader não restringe download/instalação ao treinador cloud.');
assert(worker.includes("'/modules/usability-checkup-v10_10_9.js'"),'Ponte de carregamento deixou de ser mutável/network-first no Service Worker.');
assert(worker.includes("'/modules/trainer-update-organizer-v10_10_41.js'"),'Agenda corrigida precisa ser network-first para não ficar presa no cache antigo.');

assert(feedback.includes("SCREEN_ID='screen-trainer-feedback-archive'"),'Histórico completo de feedbacks do treinador foi removido.');
assert(feedback.includes("ENTRY_ID='tb-trainer-feedback-archive-entry'"),'Atalho de FEEDBACKS ENVIADOS foi removido.');
assert(feedback.includes("db.collection('feedback').where('studentId','==',student.uid)"),'Histórico deixou de buscar todos os feedbacks vinculados ao aluno.');
assert(!/collection\('feedback'\)\.where\('studentId','==',student\.uid\)\.limit\s*\(/.test(feedback),'Histórico completo de feedbacks voltou a ter corte artificial por aluno.');
assert(source.includes('TeamBullsTrainerFeedbackArchive'),'Agenda não mantém acesso direto ao histórico completo de feedbacks já existente.');

assert(rules.includes("resource.data.role == 'student' && resource.data.trainerId == request.auth.uid"),'Rules 28 exigem query de usuários restrita a role=student + trainerId.');
assert(rules.includes('match /checkinSchedules/{uid}')&&rules.includes('allow create, update: if trainerOwns(uid)'),'Conclusão semanal deixou de estar protegida por propriedade do treinador.');
assert(rules.includes('match /protocolReviewSchedules/{uid}')&&rules.includes('request.resource.data.trainerId == request.auth.uid'),'Conclusão mensal deixou de estar protegida pelo treinador dono do aluno.');
assert(!rules.includes('match /trainerUpdateOrganizer/'),'Agenda criou coleção paralela desnecessária nas Rules.');

if(failures.length){console.error('\nFALHA — agenda de atualizações do treinador\n- '+failures.join('\n- '));process.exit(1);}
console.log('APROVADO — agenda usa listagem de alunos compatível com Rules 28 e leituras diretas dos cronogramas canônicos, mantendo ordem por data, conclusão semanal administrativa, ciclo mensal oficial e histórico de feedbacks sem polling.');
