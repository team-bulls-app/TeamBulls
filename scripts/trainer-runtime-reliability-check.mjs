import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const failures=[];
const read=path=>fs.readFileSync(path,'utf8');
const assert=(ok,message)=>{if(!ok)failures.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

const paths=[
  'viewport_v10_10_9.js',
  'modules/trainer-runtime-reliability-v10_10_46.js',
  'modules/trainer-sent-reports-v10_10_46.js',
  'modules/trainer-feedback-archive-v10_10_46.js',
  'modules/trainer-command-center-v10_10_42.js'
];
for(const path of paths){
  assert(fs.existsSync(path),`Arquivo obrigatório ausente: ${path}`);
  if(fs.existsSync(path)){
    const syntax=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
    assert(syntax.status===0,`${path} possui JavaScript inválido: ${String(syntax.stderr||'').trim()}`);
  }
}

const viewport=read('viewport_v10_10_9.js');
const runtime=read('modules/trainer-runtime-reliability-v10_10_46.js');
const reports=read('modules/trainer-sent-reports-v10_10_46.js');
const feedback=read('modules/trainer-feedback-archive-v10_10_46.js');
const radar=read('modules/trainer-command-center-v10_10_42.js');
const sw=read('sw.js');
const firebase=JSON.parse(read('firebase.json'));

has(viewport,"const RUNTIME_SRC='./modules/trainer-runtime-reliability-v10_10_46.js?v=10.10.46-trainer1'",'Cold start não entrega a ponte confiável do treinador.');
has(viewport,"style.textContent='.fab-wrap{display:none}'",'FAB pode vazar sobre a tela de verificação de sessão.');
has(viewport,"if(label==='App Check')",'Cold start não identifica a etapa bloqueante de App Check.');
has(viewport,'limit=Math.min(limit,2500)','App Check pode voltar a bloquear o cold start por mais de 2,5 s.');
has(viewport,'appCheckTask=Promise.resolve(task).catch(()=>false)','App Check não continua rastreado após o timeout visual.');
has(viewport,'new Promise(resolve=>setTimeout(resolve,1200))','Leitura do perfil não possui sobreposição limitada com App Check.');
has(viewport,"id==='screen-trainer'||id==='screen-trainer-student'",'Runtime confiável não acompanha a entrada nas telas do treinador.');
has(sw,"'/viewport_v10_10_9.js'",'Viewport/cold-start não está em arquivo mutável network-first do PWA.');

has(runtime,"const VERSION='10.10.46-trainer1'",'Ponte do treinador está na revisão errada.');
has(runtime,"const REPORTS_SRC='./modules/trainer-sent-reports-v10_10_46.js?v=10.10.46-sentreports2'",'Ponte não cache-busta Relatórios enviados.');
has(runtime,"const FEEDBACK_SRC='./modules/trainer-feedback-archive-v10_10_46.js?v=10.10.46-feedback2'",'Ponte não cache-busta Feedbacks enviados.');
const immediate=runtime.indexOf("showScreen('screen-trainer-student',navigation)");
const network=runtime.indexOf('await renderTrainerStudent(VIEW_STUDENT)');
assert(immediate>=0&&network>immediate,'ABRIR ALUNO ainda espera a rede antes de navegar para o arquivo.');
has(runtime,"list.innerHTML='<div class=\"no-data-inline\">Carregando protocolos do aluno...</div>'",'Arquivo do aluno não mostra estado imediato de carregamento.');
lacks(runtime,'setInterval(','Ponte do treinador não pode introduzir polling.');
lacks(runtime,'MutationObserver','Ponte do treinador não pode observar globalmente o DOM.');

for(const [name,source,collection] of [
  ['Relatórios',reports,'questionnaires'],
  ['Feedbacks',feedback,'feedback']
]){
  has(source,"where('trainerId','==',uid).where('role','==','student').limit(500)",`${name}: consulta de alunos não está compatível com Rules 28.`);
  has(source,'const CONCURRENCY=8',`${name}: fan-out não possui concorrência limitada otimizada.`);
  has(source,'const READ_TIMEOUT=5200',`${name}: leitura por aluno não possui timeout finito.`);
  has(source,'reference.get()',`${name}: arquivo não usa leitura direta limitada.`);
  lacks(source,'cloudGet(',`${name}: arquivo voltou a herdar retry global que multiplica a espera.`);
  has(source,`db.collection('${collection}').where('studentId','==',student.uid)`,`${name}: leitura não está isolada pelo aluno vinculado.`);
  has(source,'partialFailures++',`${name}: uma falha de aluno ainda pode derrubar todo o histórico.`);
  has(source,'TENTAR NOVAMENTE',`${name}: erro total não oferece recuperação explícita.`);
  lacks(source,'setInterval(',`${name}: histórico não pode introduzir polling.`);
  lacks(source,'MutationObserver',`${name}: histórico não pode observar globalmente o DOM.`);
  lacks(source,'cloudWrite(',`${name}: histórico não pode criar gravações Firebase.`);
  lacks(source,'.update(',`${name}: histórico não pode atualizar dados.`);
  lacks(source,'.set(',`${name}: histórico não pode criar documentos.`);
  lacks(source,'.delete(',`${name}: histórico não pode excluir documentos.`);
}

has(radar,"if(typeof viewStudent==='function')await viewStudent",'Radar deixou de usar o fluxo global de abertura de aluno que recebe a correção resiliente.');
assert(firebase?.firestore?.rules==='firebase/firestore_28_compacto.rules','Correção alterou a regra Firestore ativa.');
assert(firebase?.storage?.rules==='firebase/storage_6.rules','Correção alterou a regra Storage ativa.');

if(failures.length){
  console.error('FALHA — confiabilidade do runtime do treinador\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — cold start limita espera bloqueante, FAB não vaza no loading, Abrir aluno navega antes da rede e Relatórios/Feedbacks usam Rules 28 com timeout e resultado parcial.');
