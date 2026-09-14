import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const failures=[];
const read=path=>fs.readFileSync(path,'utf8');
const assert=(ok,message)=>{if(!ok)failures.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

const paths=[
  'modules/student-trainer-activity-bridge-v10_10_47.js',
  'modules/trainer-canonical-inbox-v10_10_49.js',
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

/* Entrega atual: aluno cria índice futuro; treinador não depende mais desse índice para enxergar o relatório. */
has(loader,'student-trainer-activity-bridge-v10_10_47.js?v=10.10.47-activitybridge1','Loader não entrega a ponte ao aluno.');
has(loader,'trainer-canonical-inbox-v10_10_49.js?v=10.10.49-canonicalinbox2','Loader não entrega a Central canônica atual ao treinador.');
lacks(loader,'trainer-activity-reconciliation-v10_10_47.js?v=10.10.47-activityreconcile1','Visibilidade do treinador ainda depende da reconciliação secundária antiga.');
has(loader,"student:[",'Loader perdeu o ramo do aluno.');
has(loader,"trainer:[",'Loader perdeu o ramo do treinador.');
has(sw,"'/modules/intelligence-suite-loader-v10_10_42.js'",'Loader de recuperação não está protegido como arquivo mutável/network-first.');

/* Próximos envios: primeiro salva canônico, depois indexa sem invalidar sucesso. */
has(bridge,'const result=await base.apply(this,arguments);','Ponte do aluno precisa aguardar o envio canônico antes do índice secundário.');
has(bridge,'indexWeekly(sourceId)','Relatório semanal não agenda o índice da Central.');
has(bridge,'indexQuestionnaire(sourceId)','Questionário/atualização não agenda o índice da Central.');
has(bridge,"db.collection('trainerActivity').doc(trainerId).collection('events').doc(eventId(type,sourceId)).set(payload)",'Ponte não usa o índice privado existente do treinador.');
has(bridge,"(type==='weekly_checkin'?'w-':'q-')+cleanId(sourceId)",'Ponte não usa IDs determinísticos.');
has(bridge,'Falha neste índice secundário nunca pode invalidá-lo','Ponte não preserva explicitamente a independência do envio canônico.');
lacks(bridge,"collection('questionnaires').doc(sourceId).update",'Ponte não pode reescrever a resposta canônica.');
lacks(bridge,"collection('weeklyCheckins').doc(sourceId).update",'Ponte não pode reescrever o relatório semanal canônico.');
lacks(bridge,'.delete(','Ponte não pode excluir documentos.');

/* Envios anteriores e atuais: a UI nasce da fonte canônica e só depois tenta reparar trainerActivity. */
has(canonical,"where('trainerId','==',uid).where('role','==','student').limit(500)",'Central canônica não usa roster compatível com Rules 28.');
has(canonical,"db.collection('questionnaires').where('studentId','==',sid).get()",'Central canônica não lê questionários por aluno.');
has(canonical,'questionnaireComplete(data)','Central não valida conclusão canônica/legada de questionário.');
lacks(canonical,"if(data.trainerId&&String(data.trainerId)!==uid)return;",'Central voltou a esconder questionário de aluno atualmente vinculado por trainerId histórico.');
has(canonical,"db.collection('weeklyCheckins').where('studentId','==',sid).get()",'Central semanal não está isolada pelo aluno vinculado.');
has(canonical,'items=mergeRows(canonicalRows,indexRows)','trainerActivity ainda é tratado como fonte de verdade.');
has(canonical,'render();repairMissing().catch(()=>{})','Reparo secundário ainda bloqueia a exibição do relatório.');
has(canonical,'db.runTransaction(async transaction=>','Criação ausente não está protegida contra corrida/overwrite.');
has(canonical,'if(doc.exists)return true','Transação pode sobrescrever evento que já existe.');
has(canonical,'read:false','Índice reconstruído não nasce como não lido.');
has(canonical,'await refresh(true)','Abrir/atualizar Central não força leitura canônica.');
lacks(canonical,"db.collection('questionnaires').doc(row.sourceId).set",'Central não pode gravar no questionário canônico.');
lacks(canonical,"db.collection('questionnaires').doc(row.sourceId).update",'Central não pode alterar resposta canônica.');
lacks(canonical,"db.collection('weeklyCheckins').doc(row.sourceId).set",'Central não pode gravar no relatório semanal canônico.');
lacks(canonical,"db.collection('weeklyCheckins').doc(row.sourceId).update",'Central não pode alterar relatório semanal canônico.');
lacks(canonical,'.delete(','Central não pode excluir dados.');
lacks(canonical,'setInterval(','Central não pode usar polling.');
lacks(canonical,'MutationObserver','Central não pode observar globalmente o DOM.');

/* Segurança: mantém Rules 28 fechadas e usa exatamente as permissões já existentes. */
has(rules,'match /trainerActivity/{trainerUid}','Rules 28 não possuem a caixa privada trainerActivity.');
has(rules,"request.resource.data.type in ['weekly_checkin','questionnaire']",'Rules 28 não aceitam os tipos canônicos usados pelo bridge.');
has(rules,'activeOwner(request.resource.data.studentId)','Rules 28 não permitem que o próprio aluno crie apenas seu índice.');
has(rules,'allow read: if trainerOwns(resource.data.studentId) || activeOwner(resource.data.studentId);','Fontes canônicas deixaram de ser privadas por vínculo atual.');
assert(firebase?.firestore?.rules==='firebase/firestore_28_compacto.rules','Correção alterou a Rules Firestore ativa.');
assert(firebase?.storage?.rules==='firebase/storage_6.rules','Correção alterou a Rules Storage ativa.');

if(failures.length){
  console.error('FALHA — recuperação das atualizações do treinador\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — envio canônico continua soberano: aluno tenta indexar futuros relatórios, treinador lê fontes reais pelo vínculo atual e metadados históricos não escondem respostas concluídas.');
