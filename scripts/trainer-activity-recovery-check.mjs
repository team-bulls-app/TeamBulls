import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const failures=[];
const read=path=>fs.readFileSync(path,'utf8');
const assert=(ok,message)=>{if(!ok)failures.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

const paths=[
  'modules/student-trainer-activity-bridge-v10_10_47.js',
  'modules/trainer-activity-reconciliation-v10_10_47.js',
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
const reconcile=read(paths[1]);
const loader=read(paths[2]);
const oldInbox=read('modules/trainer-inbox-payments-v10_10_12.js');
const config=read('config_v10_7.js');
const rules=read('firebase/firestore_28_compacto.rules');
const firebase=JSON.parse(read('firebase.json'));
const sw=read('sw.js');

/* Reproduz a causa original: o módulo antigo contém hooks de aluno, mas é trainer-only. */
has(oldInbox,'function installSubmissionHooks()','Central antiga deixou de conter o caminho cuja regressão estamos cobrindo.');
has(config,"MODULE_ROOT+'trainer-inbox-payments-v10_10_12.js?v=10.10.12-inboxpayments2'",'Loader antigo mudou; revisar a regressão da Central.');

/* Entrega do hotfix por arquivo network-first já existente. */
has(loader,'student-trainer-activity-bridge-v10_10_47.js?v=10.10.47-activitybridge1','Loader não entrega a ponte ao aluno.');
has(loader,'trainer-activity-reconciliation-v10_10_47.js?v=10.10.47-activityreconcile1','Loader não entrega a reconciliação ao treinador.');
has(loader,"student:[",'Loader perdeu o ramo do aluno.');
has(loader,"trainer:[",'Loader perdeu o ramo do treinador.');
has(sw,"'/modules/intelligence-suite-loader-v10_10_42.js'",'Loader de recuperação não está protegido como arquivo mutável/network-first.');

/* Próximos envios: primeiro salva canônico, depois indexa sem invalidar sucesso. */
has(bridge,"const result=await base.apply(this,arguments);",'Ponte do aluno precisa aguardar o envio canônico antes do índice secundário.');
has(bridge,"indexWeekly(sourceId)",'Relatório semanal não agenda o índice da Central.');
has(bridge,"indexQuestionnaire(sourceId)",'Questionário/atualização não agenda o índice da Central.');
has(bridge,"db.collection('trainerActivity').doc(trainerId).collection('events').doc(eventId(type,sourceId)).set(payload)",'Ponte não usa o índice privado existente do treinador.');
has(bridge,"(type==='weekly_checkin'?'w-':'q-')+cleanId(sourceId)",'Ponte não usa IDs determinísticos compatíveis com o índice antigo.');
has(bridge,'Falha neste índice secundário nunca pode invalidá-lo','Ponte não documenta/preserva a independência do envio canônico.');
lacks(bridge,"collection('questionnaires').doc(sourceId).update",'Ponte não pode reescrever a resposta canônica.');
lacks(bridge,"collection('weeklyCheckins').doc(sourceId).update",'Ponte não pode reescrever o relatório semanal canônico.');
lacks(bridge,'.delete(','Ponte não pode excluir documentos.');
lacks(bridge,'setInterval(','Ponte não pode usar polling.');
lacks(bridge,'MutationObserver','Ponte não pode observar globalmente o DOM.');

/* Envios anteriores: o treinador relê a fonte canônica por aluno e cria só eventos ausentes. */
has(reconcile,"where('trainerId','==',uid).where('role','==','student').limit(500)",'Reconciliação não usa roster compatível com Rules 28.');
has(reconcile,"db.collection('questionnaires').where('studentId','==',sid).get()",'Reconciliação voltou a consultar questionários globalmente por trainerId.');
has(reconcile,"if(data.answered!==true)return;",'Reconciliação pode indexar questionário ainda não respondido.');
has(reconcile,"db.collection('weeklyCheckins').where('studentId','==',sid).get()",'Reconciliação semanal não está isolada pelo aluno vinculado.');
has(reconcile,'const existing=new Set','Reconciliação não preserva eventos existentes/lidos.');
has(reconcile,"filter(item=>!existing.has(item.id))",'Reconciliação não limita gravações aos índices ausentes.');
has(reconcile,'db.runTransaction(async transaction=>','Criação ausente não está protegida contra corrida/overwrite.');
has(reconcile,'if(current.exists)return false','Transação pode sobrescrever evento que já existe.');
has(reconcile,"read:false",'Atualização recuperada não reaparece como não lida.');
has(reconcile,"data?.answeredAt?.toDate",'Atualização recuperada não preserva o timestamp da resposta quando disponível.');
has(reconcile,'reconcile(true)','Atualizar Central não força uma nova reconciliação canônica.');
has(reconcile,'setTimeout(()=>reconcile(false).catch(()=>{}),900)','Treinador não recupera índices ausentes automaticamente após entrar.');
lacks(reconcile,"collection('questionnaires').doc",'Reconciliação não pode gravar no questionário canônico.');
lacks(reconcile,"collection('weeklyCheckins').doc",'Reconciliação não pode gravar no relatório semanal canônico.');
lacks(reconcile,'.delete(','Reconciliação não pode excluir dados.');
lacks(reconcile,'setInterval(','Reconciliação não pode usar polling.');
lacks(reconcile,'MutationObserver','Reconciliação não pode observar globalmente o DOM.');

/* Segurança: mantém Rules 28 fechadas e usa exatamente as permissões já existentes. */
has(rules,'match /trainerActivity/{trainerUid}','Rules 28 não possuem a caixa privada trainerActivity.');
has(rules,"request.resource.data.type in ['weekly_checkin','questionnaire']",'Rules 28 não aceitam os tipos canônicos usados pelo bridge.');
has(rules,'activeOwner(request.resource.data.studentId)','Rules 28 não permitem que o próprio aluno crie apenas seu índice.');
has(rules,'allow read: if trainerOwns(resource.data.studentId) || activeOwner(resource.data.studentId);','Fontes canônicas deixaram de ser privadas por vínculo.');
assert(firebase?.firestore?.rules==='firebase/firestore_28_compacto.rules','Correção alterou a Rules Firestore ativa.');
assert(firebase?.storage?.rules==='firebase/storage_6.rules','Correção alterou a Rules Storage ativa.');

if(failures.length){
  console.error('FALHA — recuperação das atualizações do treinador\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — envios canônicos antigos e futuros são preservados; aluno cria índice determinístico e treinador reconcilia somente eventos ausentes sem alterar respostas, fotos ou relatórios originais.');
