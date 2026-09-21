import fs from 'node:fs';

const failures=[];
const read=path=>fs.readFileSync(path,'utf8');
const assert=(condition,message)=>{if(!condition)failures.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

const rules=read('firebase/firestore_28_compacto.rules');
const core=read('app_v10_10_9_core.js');
const firebase=JSON.parse(read('firebase.json'));

assert(firebase?.firestore?.rules==='firebase/firestore_28_compacto.rules','Firebase deixou de apontar para Rules 28.');

// Exercícios antigos podem ter userId histórico/inconsistente, mas continuam
// ligados a um workout canônico. O fallback só vale se o treinador realmente
// possuir esse workout; não existe liberação global para qualquer treinador.
has(rules,'function trainerOwnsExercise(data)','Rules não centralizam a propriedade segura de exercícios.');
has(rules,"trainerOwns(data.get('userId', ''))",'Exercício perdeu a validação pelo aluno vinculado.');
has(rules,"trainerOwnsWorkout(data.get('workoutId', ''))",'Exercício legado não possui fallback pelo workout canônico.');

const start=rules.indexOf('match /exercises/{id}');
const end=rules.indexOf('match /sessions/{id}',start);
const exerciseRules=start>=0&&end>start?rules.slice(start,end):'';
assert(exerciseRules.length>0,'Bloco de Rules de exercises não foi encontrado.');
has(exerciseRules,'allow read: if trainerOwnsExercise(resource.data)','Leitura do treinador não usa a mesma prova canônica de propriedade.');
has(exerciseRules,'allow update: if trainerOwnsExercise(resource.data)','Edição/reordenação de exercício legado continua recusada.');
has(exerciseRules,'allow delete: if trainerOwnsExercise(resource.data);','Exclusão de exercício legado continua recusada.');
has(exerciseRules,"allow create: if trainerOwns(request.resource.data.userId)",'Criação de exercício deixou de exigir aluno atualmente vinculado.');
has(exerciseRules,'workoutData(request.resource.data.workoutId).userId == request.resource.data.userId','Criação não amarra exercício ao dono real do workout.');
has(exerciseRules,"immutable('userId') && immutable('workoutId')",'Update pode reatribuir exercício para outro aluno/workout.');
has(exerciseRules,"immutable('createdAt')",'Update pode adulterar createdAt do exercício.');
lacks(exerciseRules,'allow delete: if isTrainer()','Delete voltou a permitir qualquer treinador.');
lacks(exerciseRules,'allow update: if isTrainer()','Update voltou a permitir qualquer treinador.');

// O cliente continua usando um único batch para delete + limpeza de supersérie +
// reordenação. Assim a correção deve acontecer na autorização canônica, não por
// retries, duplicação de writes ou remoção do histórico de sessões.
const deleteStart=core.indexOf('async function deleteTsExercise(eid)');
const deleteEnd=core.indexOf('/* ══════════════════════════════════════════════════',deleteStart);
const deleteFlow=deleteStart>=0&&deleteEnd>deleteStart?core.slice(deleteStart,deleteEnd):'';
has(deleteFlow,"batch.delete(db.collection('exercises').doc(eid))",'Fluxo do treinador deixou de excluir o exercício canônico.');
has(deleteFlow,"batch.update(db.collection('exercises').doc(exercise.id)",'Limpeza/reordenação dos exercícios relacionados foi perdida.');
has(deleteFlow,"await cloudWrite(batch.commit(),'salvar alterações')",'Exclusão deixou de ser atômica no batch existente.');
lacks(deleteFlow,"collection('sessions').doc",'Exclusão de exercício não deve apagar o histórico de sessões.');
lacks(deleteFlow,'setInterval(','Exclusão não pode introduzir polling.');

if(failures.length){
  console.error('FALHA — propriedade/exclusão de exercícios\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — treinador pode editar/excluir exercício pelo aluno vinculado ou workout canônico, sem abrir acesso global e sem apagar sessões.');
