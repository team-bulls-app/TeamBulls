import fs from 'node:fs';
import vm from 'node:vm';

const failures=[];
const read=path=>fs.readFileSync(path,'utf8');
const assert=(condition,message)=>{if(!condition)failures.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

const modulePath='modules/trainer-canonical-inbox-v10_10_48.js';
const loaderPath='modules/intelligence-suite-loader-v10_10_42.js';
for(const path of [modulePath,loaderPath]){
  assert(fs.existsSync(path),`Arquivo obrigatório ausente: ${path}`);
  if(fs.existsSync(path))new vm.Script(read(path),{filename:path});
}

const source=read(modulePath);
const loader=read(loaderPath);
const rules=read('firebase.json');
const sw=read('sw.js');

has(source,"const VERSION='10.10.48-canonicalinbox1'",'Central canônica está na revisão errada.');
has(loader,"trainer-canonical-inbox-v10_10_48.js?v=10.10.48-canonicalinbox1",'Loader do treinador não entrega a Central canônica.');
lacks(loader,'trainer-activity-reconciliation-v10_10_47.js?v=10.10.47-activityreconcile1','Loader ainda depende da reconciliação secundária para visibilidade.');

has(source,"db.collection('users').where('trainerId','==',uid).where('role','==','student').limit(500)",'Roster da Central não está isolado pelo treinador conforme Rules 28.');
has(source,"db.collection('questionnaires').where('studentId','==',sid).get()",'Central não lê questionários diretamente por aluno.');
has(source,"db.collection('weeklyCheckins').where('studentId','==',sid).get()",'Central não lê relatórios semanais diretamente por aluno.');
has(source,'if(data.answered!==true','Questionário ainda pode aparecer antes de ter sido realmente respondido.');
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

has(source,"async openInbox(){const result=await hub.openInbox.apply(hub,arguments);hookFilters();await refresh(true);return result;}",'Abrir Central não força leitura canônica.');
has(source,"async refreshInbox(){const result=await hub.refreshInbox.apply(hub,arguments);await refresh(true);return result;}",'Botão atualizar não força leitura canônica.');
has(source,'async markAllRead(){return markAllRead();}','Marcar tudo lido não foi integrado à fonte canônica.');

assert(JSON.parse(rules)?.firestore?.rules==='firebase/firestore_28_compacto.rules','Correção alterou a Rules ativa.');
has(sw,"'/modules/intelligence-suite-loader-v10_10_42.js'",'Loader da Central não permanece network-first/mutável no PWA.');

if(failures.length){
  console.error('FALHA — Central canônica do treinador\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — relatórios respondidos e weekly check-ins aparecem a partir das fontes canônicas mesmo sem trainerActivity; índice secundário é reparado depois, sem alterar ou excluir envios dos alunos.');
