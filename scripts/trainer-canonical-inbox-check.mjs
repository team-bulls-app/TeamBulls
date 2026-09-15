import fs from 'node:fs';
import vm from 'node:vm';

const failures=[];
const read=path=>fs.readFileSync(path,'utf8');
const assert=(condition,message)=>{if(!condition)failures.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

const modulePath='modules/trainer-canonical-inbox-v10_10_49.js';
const recoveryPath='modules/trainer-report-link-recovery-v10_10_51.js';
const loaderPath='modules/intelligence-suite-loader-v10_10_42.js';
for(const path of [modulePath,recoveryPath,loaderPath]){
  assert(fs.existsSync(path),`Arquivo obrigatório ausente: ${path}`);
  if(fs.existsSync(path))new vm.Script(read(path),{filename:path});
}

const source=read(modulePath);
const recovery=read(recoveryPath);
const loader=read(loaderPath);
const firebaseConfig=read('firebase.json');
const firestoreRules=read('firebase/firestore_28_compacto.rules');
const legacyRepair=read('modules/legacy-student-link-repair-v10_10_10.js');
const sw=read('sw.js');

has(source,"const VERSION='10.10.49-canonicalinbox2'",'Central canônica está na revisão errada.');
has(loader,"trainer-canonical-inbox-v10_10_49.js?v=10.10.49-canonicalinbox2",'Loader do treinador não entrega a Central canônica atual.');
has(loader,"trainer-report-link-recovery-v10_10_51.js?v=10.10.51-reportlink1",'Loader não entrega a recuperação de vínculo dos relatórios.');
assert(loader.indexOf('trainer-report-link-recovery-v10_10_51.js')<loader.indexOf('trainer-canonical-inbox-v10_10_49.js'),'Recuperação de vínculo precisa carregar antes da Central canônica.');
lacks(loader,'trainer-activity-reconciliation-v10_10_47.js?v=10.10.47-activityreconcile1','Loader ainda depende da reconciliação secundária para visibilidade.');

has(source,"db.collection('users').where('trainerId','==',uid).where('role','==','student').limit(500)",'Roster da Central não está isolado pelo treinador conforme Rules 28.');
has(source,"db.collection('questionnaires').where('studentId','==',sid).get()",'Central não lê questionários diretamente por aluno.');
has(source,"db.collection('weeklyCheckins').where('studentId','==',sid).get()",'Central não lê relatórios semanais diretamente por aluno.');
has(source,'function questionnaireComplete(data)','Compatibilidade de conclusão de questionário não está explícita.');
has(source,'if(data?.answered===true)return true','Questionário canônico respondido deixou de ser reconhecido.');
has(source,'if(!stampMs(data?.answeredAt))return false','Registro legado incompleto poderia aparecer sem timestamp de resposta.');
has(source,"eventId('questionnaire',doc.id)",'Questionários não usam ID determinístico do índice.');
has(source,"eventId('weekly_checkin',doc.id)",'Relatórios semanais não usam ID determinístico do índice.');

has(source,'const canonicalRows=groups.flatMap','Fontes canônicas não são consolidadas para renderização.');
has(source,'items=mergeRows(canonicalRows,indexRows)','Central ainda pode depender exclusivamente de trainerActivity.');
has(source,'canonical:true','Central não distingue fonte canônica do índice secundário.');
has(source,'render();repairMissing().catch(()=>{})','Relatório não é renderizado antes da reparação secundária.');
has(source,'TeamBullsCanonicalTrainerInbox.open','Cards canônicos não possuem abertura direta.');
has(source,"db.collection('questionnaires').doc(row.sourceId).get()",'Abertura do questionário ainda depende do índice.');
has(source,"db.collection('weeklyCheckins').doc(row.sourceId).get()",'Abertura do semanal ainda depende do índice.');

has(source,'db.runTransaction(async transaction=>','Reparo do índice não está protegido por transação.');
has(source,'if(doc.exists)return true','Reparo pode sobrescrever um evento existente/lido.');
has(source,"eventCollection(uid).doc(row.id)",'Reparo não usa o mesmo ID determinístico exibido na Central.');
lacks(source,"db.collection('questionnaires').doc(row.sourceId).set",'Central não pode regravar questionários canônicos.');
lacks(source,"db.collection('questionnaires').doc(row.sourceId).update",'Central não pode alterar respostas canônicas.');
lacks(source,"db.collection('weeklyCheckins').doc(row.sourceId).set",'Central não pode regravar weeklyCheckins.');
lacks(source,"db.collection('weeklyCheckins').doc(row.sourceId).update",'Central não pode alterar weeklyCheckins.');
lacks(source,'.delete(','Correção não pode excluir registros.');
lacks(source,'setInterval(','Central canônica não pode introduzir polling.');
lacks(source,'MutationObserver','Central canônica não pode observar globalmente o DOM.');

has(recovery,"const VERSION='10.10.51-reportlink1'",'Recuperação de vínculo está na revisão errada.');
has(recovery,'TeamBullsLegacyStudentLinkRepair','Recuperação deve reutilizar o reconciliador canônico de vínculo.');
has(recovery,'const result=await reportRepair().repair()','Relatórios não tentam reparar vínculo antes das leituras.');
has(recovery,'async openInbox(){await ensure(true);return hub.openInbox.apply(hub,arguments);}','Central deve conferir vínculo antes de carregar os relatórios.');
has(recovery,"#tb-trainer-sent-reports-entry",'Arquivo de Relatórios enviados não está protegido pela reconciliação de vínculo.');
has(recovery,"#tb-sent-reports-refresh",'Atualizar Relatórios enviados não força reconciliação do vínculo.');
lacks(recovery,"db.collection('questionnaires')",'Recuperação de vínculo não pode alterar ou duplicar questionários.');
lacks(recovery,"db.collection('weeklyCheckins')",'Recuperação de vínculo não pode alterar ou duplicar weeklyCheckins.');
lacks(recovery,'setInterval(','Recuperação não pode introduzir polling.');
lacks(recovery,'MutationObserver','Recuperação não pode observar globalmente o DOM.');

has(legacyRepair,"db.collection('studentInvites').where('trainerId','==',trainerUid).limit(300)",'Reparação por convite deve ficar limitada aos convites do treinador atual.');
has(legacyRepair,"const pending=[...candidates].filter(uid=>!linkedIds.has(uid))",'Reparação não diferencia alunos já vinculados dos candidatos legítimos.');
has(firestoreRules,"userData(uid).get('trainerId', '') == ''",'Rules devem impedir sobrescrever vínculo já apontado para outro treinador.');
has(firestoreRules,"get(/databases/$(database)/documents/studentInvites/$(userData(uid).inviteId)).data.trainerId == request.auth.uid",'Rules não comprovam que o convite pertence ao treinador atual.');
has(firestoreRules,"get(/databases/$(database)/documents/studentInvites/$(userData(uid).inviteId)).data.usedBy == uid",'Rules não comprovam que o convite foi usado pelo próprio aluno.');

has(source,'async openInbox(){const result=await hub.openInbox.apply(hub,arguments);hookFilters();await refresh(true);return result;}','Abrir Central não força leitura canônica.');
has(source,'async refreshInbox(){const result=await hub.refreshInbox.apply(hub,arguments);await refresh(true);return result;}','Botão atualizar não força leitura canônica.');
has(source,'async markAllRead(){return markAllRead();}','Marcar tudo lido não foi integrado à fonte canônica.');

assert(JSON.parse(firebaseConfig)?.firestore?.rules==='firebase/firestore_28_compacto.rules','Correção alterou a Rules ativa.');
has(sw,"'/modules/intelligence-suite-loader-v10_10_42.js'",'Loader da Central não permanece network-first/mutável no PWA.');

if(failures.length){
  console.error('FALHA — Central canônica / recuperação de vínculo do treinador\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — relatórios canônicos continuam soberanos e vínculos legítimos ausentes são reconciliados por convite antes das leituras, sem sobrescrever outro treinador nem alterar respostas/fotos.');
