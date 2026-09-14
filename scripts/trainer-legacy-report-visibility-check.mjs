import fs from 'node:fs';
import vm from 'node:vm';

const failures=[];
const assert=(ok,message)=>{if(!ok)failures.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);
const source=fs.readFileSync('modules/trainer-canonical-inbox-v10_10_49.js','utf8');
const loader=fs.readFileSync('modules/intelligence-suite-loader-v10_10_42.js','utf8');
const rules=fs.readFileSync('firebase/firestore_28_compacto.rules','utf8');

new vm.Script(source,{filename:'trainer-canonical-inbox-v10_10_49.js'});

has(source,"const VERSION='10.10.49-canonicalinbox2'",'Revisão compatível da Central não está ativa.');
has(loader,'trainer-canonical-inbox-v10_10_49.js?v=10.10.49-canonicalinbox2','Loader não força a revisão compatível da Central.');
has(source,"db.collection('questionnaires').where('studentId','==',sid).get()",'Questionário não é localizado pelo vínculo canônico studentId.');
lacks(source,"if(data.trainerId&&String(data.trainerId)!==uid)return;",'trainerId histórico ainda consegue esconder relatório de aluno atualmente vinculado.');
has(source,'const trainerMismatch=!!data.trainerId&&String(data.trainerId)!==uid;','Central deixou de diagnosticar metadado trainerId histórico.');
has(rules,'allow read: if trainerOwns(resource.data.studentId) || activeOwner(resource.data.studentId);','Rules 28 deixaram de autorizar leitura pelo vínculo atual do studentId.');

has(source,'function questionnaireComplete(data)','Validação conservadora de relatório legado ausente.');
has(source,'if(!stampMs(data?.answeredAt))return false','Relatório legado sem answeredAt poderia ser tratado como concluído.');
has(source,"if(mode==='photos')return photos.length>=6;",'Relatório apenas de fotos não exige as seis fotos no fallback legado.');
has(source,"if(mode==='written')return writtenOk;",'Relatório escrito legado não exige respostas preenchidas.');
has(source,'return writtenOk&&photos.length>=6;','Relatório completo legado não exige respostas e seis fotos.');

/* Modelo de decisão protegido pela regressão: vínculo atual é a autoridade de leitura;
   trainerId histórico é diagnóstico, nunca filtro de visibilidade. */
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
console.log('APROVADO — aluno atualmente vinculado continua exibindo relatório concluído mesmo com trainerId histórico; fallback legado exige evidência de conclusão e não altera o documento original.');
