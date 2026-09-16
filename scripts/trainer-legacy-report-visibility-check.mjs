import fs from 'node:fs';
import vm from 'node:vm';

const failures=[];
const assert=(ok,message)=>{if(!ok)failures.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);
const modulePath='modules/trainer-canonical-inbox-v10_10_52.js';
const source=fs.readFileSync(modulePath,'utf8');
const loader=fs.readFileSync('modules/intelligence-suite-loader-v10_10_42.js','utf8');
const rules=fs.readFileSync('firebase/firestore_28_compacto.rules','utf8');

new vm.Script(source,{filename:modulePath});

has(source,"const VERSION='10.10.52-canonicalinbox3'",'Revisão compatível da Central não está ativa.');
has(loader,'trainer-canonical-inbox-v10_10_52.js?v=10.10.52-canonicalinbox3','Loader não força a revisão compatível da Central.');

/* Dois caminhos de leitura coexistem sem substituir um ao outro:
   1) vínculo atual por studentId para documentos antigos/legados;
   2) trainerId imutável para questionários que o próprio treinador criou. */
has(source,"db.collection('questionnaires').where('studentId','==',sid).get()",'Questionário legado não é localizado pelo vínculo canônico studentId.');
has(source,"db.collection('questionnaires').where('trainerId','==',uid).limit(MAX_ITEMS)",'Questionário pertencente ao treinador não é recuperado independentemente do roster atual.');
lacks(source,"if(data.trainerId&&String(data.trainerId)!==uid)return;",'trainerId histórico ainda consegue esconder relatório de aluno atualmente vinculado.');
has(source,'const trainerMismatch=!!data.trainerId&&String(data.trainerId)!==uid','Central deixou de diagnosticar metadado trainerId histórico.');

has(rules,"allow read: if trainerOwns(resource.data.studentId)\n        || activeOwner(resource.data.studentId)\n        || (isTrainer() && resource.data.trainerId == request.auth.uid);",'Rules não preservam simultaneamente vínculo atual, dono aluno e proprietário histórico do questionário.');
has(rules,"allow create: if trainerOwns(request.resource.data.studentId)",'Criação de questionário deixou de exigir vínculo atual válido.');
has(rules,"request.resource.data.trainerId == request.auth.uid",'Criação não fixa o trainerId do treinador autenticado.');
has(rules,"immutable('studentId') && immutable('trainerId')",'studentId/trainerId poderiam ser alterados na resposta e quebrar a prova histórica.');

has(source,'function questionnaireComplete(data)','Validação conservadora de relatório legado ausente.');
has(source,'if(!stampMs(data?.answeredAt))return false','Relatório legado sem answeredAt poderia ser tratado como concluído.');
has(source,"if(mode==='photos')return photos.length>=6;",'Relatório apenas de fotos não exige as seis fotos no fallback legado.');
has(source,"if(mode==='written')return writtenOk;",'Relatório escrito legado não exige respostas preenchidas.');
has(source,'return writtenOk&&photos.length>=6;','Relatório completo legado não exige respostas e seis fotos.');

/* Modelo protegido: um questionário pode aparecer pelo vínculo atual mesmo que o
   trainerId histórico seja diferente; e um questionário criado pelo treinador
   atual pode aparecer pelo trainerId imutável mesmo se o roster estiver quebrado. */
function complete(data){
  if(data?.answered===true)return true;
  if(!data?.answeredAt)return false;
  const mode=String(data?.requestMode||'full');
  const answers=Array.isArray(data?.answers)?data.answers:[];
  const photos=Array.isArray(data?.photoIds)?data.photoIds:[];
  const writtenOk=answers.length>0&&answers.every(answer=>String(answer??'').trim().length>0);
  if(mode==='photos')return photos.length>=6;
  if(mode==='written')return writtenOk;
  return writtenOk&&photos.length>=6;
}
const currentTrainer='trainer-current';
const studentId='student-linked';
const legacyQuestionnaire={studentId,trainerId:'trainer-old',answered:true,answeredAt:{seconds:1},requestMode:'full',answers:['ok'],photoIds:['1','2','3','4','5','6']};
assert(legacyQuestionnaire.studentId===studentId&&complete(legacyQuestionnaire),'Relatório concluído com trainerId histórico deve continuar visível pelo vínculo atual do aluno.');
assert(legacyQuestionnaire.trainerId!==currentTrainer,'Cenário de trainerId histórico não foi realmente reproduzido.');
const ownerQuestionnaire={studentId:'student-roster-broken',trainerId:currentTrainer,answered:true,answeredAt:{seconds:2},requestMode:'full',answers:['ok'],photoIds:['1','2','3','4','5','6']};
assert(ownerQuestionnaire.trainerId===currentTrainer&&complete(ownerQuestionnaire),'Relatório pertencente ao treinador atual deve ser recuperável mesmo sem depender do roster.');
assert(complete({studentId,trainerId:'trainer-old',answered:false,answeredAt:{seconds:1},requestMode:'written',answers:['respondido'],photoIds:[]}), 'Relatório escrito legado completo deveria ser recuperável.');
assert(!complete({studentId,trainerId:'trainer-old',answered:false,answeredAt:{seconds:1},requestMode:'written',answers:[''],photoIds:[]}), 'Relatório legado incompleto não pode aparecer como concluído.');
assert(!complete({studentId,trainerId:'trainer-old',answered:false,requestMode:'full',answers:['ok'],photoIds:['1','2','3','4','5','6']}), 'Relatório sem answeredAt não pode ser promovido por inferência.');

lacks(source,"db.collection('questionnaires').doc(row.sourceId).update",'Compatibilidade não pode alterar o questionário original.');
lacks(source,"db.collection('questionnaires').doc(row.sourceId).set",'Compatibilidade não pode regravar o questionário original.');
lacks(source,"db.collection('weeklyCheckins').doc(row.sourceId).update",'Compatibilidade não pode alterar check-in semanal.');
lacks(source,'.delete(','Compatibilidade não pode excluir dados do aluno.');

if(failures.length){
  console.error('FALHA — visibilidade de relatório com metadados legados\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — vínculo atual continua recuperando metadados legados e trainerId imutável recupera questionários do treinador mesmo com roster inconsistente, sem alterar o envio original.');
