import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const failures=[];
const read=path=>fs.readFileSync(path,'utf8');
const assert=(ok,message)=>{if(!ok)failures.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

const paths=[
  'modules/student-trainer-activity-bridge-v10_10_47.js',
  'modules/trainer-canonical-inbox-v10_10_58.js',
  'modules/intelligence-suite-loader-v10_10_42.js'
];
for(const path of paths){
  assert(fs.existsSync(path),`Arquivo obrigatório ausente: ${path}`);
  if(fs.existsSync(path)){
    const syntax=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
    assert(syntax.status===0,`${path} possui JavaScript inválido: ${String(syntax.stderr||'').trim()}`);
  }
}

const bridge=read(paths[0]);
const canonical=read(paths[1]);
const loader=read(paths[2]);
const oldInbox=read('modules/trainer-inbox-payments-v10_10_12.js');
const config=read('config_v10_7.js');
const rules=read('firebase/firestore_28_compacto.rules');
const firebase=JSON.parse(read('firebase.json'));
const sw=read('sw.js');

/* Causa original: os hooks de aluno seguem no módulo antigo, que continua trainer-only. */
has(oldInbox,'function installSubmissionHooks()','Central antiga deixou de conter o caminho cuja regressão estamos cobrindo.');
has(config,"MODULE_ROOT+'trainer-inbox-payments-v10_10_12.js?v=10.10.12-inboxpayments2'",'Loader antigo mudou; revisar a regressão da Central.');

/* Entrega atual: aluno tenta criar índice futuro; treinador não depende dele para enxergar o relatório. */
has(loader,'student-trainer-activity-bridge-v10_10_47.js?v=10.10.47-activitybridge1','Loader não entrega a ponte ao aluno.');
has(loader,'trainer-canonical-inbox-v10_10_58.js?v=10.10.58-canonicalinbox4','Loader não entrega a Central canônica atual ao treinador.');
lacks(loader,'trainer-activity-reconciliation-v10_10_47.js?v=10.10.47-activityreconcile1','Visibilidade do treinador ainda depende da reconciliação secundária antiga.');
has(sw,"'/modules/intelligence-suite-loader-v10_10_42.js'",'Loader de recuperação não está network-first.');

/* Próximos envios: primeiro salva canônico, depois indexa sem invalidar sucesso. */
has(bridge,'const result=await base.apply(this,arguments);','Ponte do aluno precisa aguardar o envio canônico antes do índice secundário.');
has(bridge,'indexWeekly(sourceId)','Relatório semanal não agenda o índice da Central.');
has(bridge,'indexQuestionnaire(sourceId)','Questionário/atualização não agenda o índice da Central.');
has(bridge,"db.collection('trainerActivity').doc(trainerId).collection('events').doc(eventId(type,sourceId)).set(payload)",'Ponte não usa o índice privado existente.');
has(bridge,"(type==='weekly_checkin'?'w-':'q-')+cleanId(sourceId)",'Ponte não usa IDs determinísticos.');
has(bridge,'Falha neste índice secundário nunca pode invalidá-lo','Ponte não preserva a independência do envio canônico.');
lacks(bridge,"collection('questionnaires').doc(sourceId).update",'Ponte não pode reescrever a resposta canônica.');
lacks(bridge,"collection('weeklyCheckins').doc(sourceId).update",'Ponte não pode reescrever relatório semanal.');
lacks(bridge,'.delete(','Ponte não pode excluir documentos.');

/* Fontes canônicas: vínculo atual preservado, mas questionário solicitado pelo
   próprio treinador também é descoberto pelo trainerId imutável. */
has(canonical,"where('trainerId','==',uid).where('role','==','student').limit(500)",'Central não preserva roster compatível com Rules 28.');
has(canonical,"db.collection('questionnaires').where('trainerId','==',uid).limit(MAX_ITEMS)",'Central não recupera questionários pertencentes ao treinador independentemente do roster.');
has(canonical,"db.collection('questionnaires').where('studentId','==',sid).get()",'Central perdeu compatibilidade por aluno vinculado.');
has(canonical,'questionnaireComplete(data)','Central não valida conclusão de questionário.');
has(canonical,"db.collection('weeklyCheckins').where('studentId','==',sid).get()",'Central semanal não está isolada pelo aluno vinculado.');
has(canonical,'items=mergeRows(canonicalRows,indexRows)','trainerActivity voltou a ser fonte de verdade.');
has(canonical,'render();repairMissing().catch(()=>{})','Reparo secundário ainda bloqueia a exibição do relatório.');
has(canonical,'db.runTransaction(async transaction=>','Criação ausente não está protegida contra corrida/overwrite.');
has(canonical,'if(doc.exists)return true','Transação pode sobrescrever evento que já existe.');
has(canonical,'function weeklyLogicalKey(row)','Central não protege a identidade lógica de semanais duplicados.');
has(canonical,'suppressedIds.add','Índice secundário de duplicata semanal continua aparecendo.');
lacks(canonical,"db.collection('questionnaires').doc(row.sourceId).set",'Central não pode gravar no questionário canônico.');
lacks(canonical,"db.collection('questionnaires').doc(row.sourceId).update",'Central não pode alterar resposta canônica.');
lacks(canonical,"db.collection('weeklyCheckins').doc(row.sourceId).set",'Central não pode gravar no relatório semanal canônico.');
lacks(canonical,"db.collection('weeklyCheckins').doc(row.sourceId).update",'Central não pode alterar relatório semanal.');
lacks(canonical,'.delete(','Central não pode excluir dados.');
lacks(canonical,'setInterval(','Central não pode usar polling.');
lacks(canonical,'MutationObserver','Central não pode observar globalmente o DOM.');

/* Segurança: trainerActivity segue privado; a exceção canônica só libera leitura
   do questionário ao UID gravado como trainerId imutável na criação. */
has(rules,'match /trainerActivity/{trainerUid}','Rules 28 não possuem a caixa privada trainerActivity.');
has(rules,"request.resource.data.type in ['weekly_checkin','questionnaire']",'Rules 28 não aceitam os tipos canônicos do bridge.');
has(rules,'activeOwner(request.resource.data.studentId)','Rules 28 não permitem que o próprio aluno crie apenas seu índice.');
has(rules,"allow read: if trainerOwns(resource.data.studentId)\n        || activeOwner(resource.data.studentId)\n        || (isTrainer() && resource.data.trainerId == request.auth.uid);",'Questionário não está limitado ao vínculo atual/aluno dono/treinador imutável.');
has(rules,"immutable('studentId') && immutable('trainerId')",'Propriedade histórica do questionário poderia ser adulterada na resposta.');
assert(firebase?.firestore?.rules==='firebase/firestore_28_compacto.rules','Correção alterou o caminho da Rules Firestore ativa.');
assert(firebase?.storage?.rules==='firebase/storage_6.rules','Correção alterou o caminho da Rules Storage ativa.');

if(failures.length){
  console.error('FALHA — recuperação das atualizações do treinador\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — envio canônico segue soberano: trainerActivity é apenas índice, duplicatas semanais são ocultadas por requestKey e questionários permanecem visíveis ao treinador que os criou.');
