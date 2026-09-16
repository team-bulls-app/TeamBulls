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
  'modules/trainer-sent-reports-v10_10_52.js',
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
const reports=read('modules/trainer-sent-reports-v10_10_52.js');
const feedback=read('modules/trainer-feedback-archive-v10_10_46.js');
const radar=read('modules/trainer-command-center-v10_10_42.js');
const sw=read('sw.js');
const firebase=JSON.parse(read('firebase.json'));

// O arquivo mutável continua entrando no cold start; a revisão interna/cache-bust
// do arquivo de relatórios é controlada pelo próprio runtime.
has(viewport,"const RUNTIME_SRC='./modules/trainer-runtime-reliability-v10_10_46.js?v=10.10.46-trainer1'",'Cold start deixou de entregar a ponte confiável do treinador.');
has(viewport,"style.textContent='.fab-wrap{display:none}'",'FAB pode vazar sobre a tela de verificação de sessão.');
has(viewport,"if(label==='App Check')",'Cold start não identifica a etapa bloqueante de App Check.');
has(viewport,'limit=Math.min(limit,2500)','App Check pode voltar a bloquear o cold start por mais de 2,5 s.');
has(sw,"'/viewport_v10_10_9.js'",'Viewport/cold-start não está em arquivo mutável network-first do PWA.');

has(runtime,"const VERSION='10.10.52-trainer2'",'Ponte do treinador está na revisão errada.');
has(runtime,"const REPORTS_SRC='./modules/trainer-sent-reports-v10_10_52.js?v=10.10.52-sentreports3'",'Ponte não cache-busta o arquivo de Relatórios enviados por propriedade.');
has(runtime,"const FEEDBACK_SRC='./modules/trainer-feedback-archive-v10_10_46.js?v=10.10.46-feedback2'",'Ponte não preserva Feedbacks enviados.');
const immediate=runtime.indexOf("showScreen('screen-trainer-student',navigation)");
const network=runtime.indexOf('await renderTrainerStudent(VIEW_STUDENT)');
assert(immediate>=0&&network>immediate,'ABRIR ALUNO ainda espera a rede antes de navegar para o arquivo.');
has(runtime,"list.innerHTML='<div class=\"no-data-inline\">Carregando protocolos do aluno...</div>'",'Arquivo do aluno não mostra estado imediato de carregamento.');
lacks(runtime,'setInterval(','Ponte do treinador não pode introduzir polling.');
lacks(runtime,'MutationObserver','Ponte do treinador não pode observar globalmente o DOM.');

// Relatórios: propriedade histórica é a fonte de descoberta; roster serve apenas
// para nome/atalho. Feedback continua estritamente pelo vínculo atual.
has(reports,"db.collection('questionnaires').where('trainerId','==',uid).limit(MAX_REPORTS)",'Relatórios ainda dependem do fan-out pelo roster.');
has(reports,'loadNames(uid)','Relatórios não enriquecem nomes de forma independente da descoberta.');
has(reports,'reference.get()','Relatórios não usam leitura direta limitada.');
lacks(reports,'cloudGet(','Relatórios voltaram a herdar retry global que multiplica a espera.');
lacks(reports,'setInterval(','Relatórios não podem introduzir polling.');
lacks(reports,'MutationObserver','Relatórios não podem observar globalmente o DOM.');
lacks(reports,'cloudWrite(','Relatórios não podem criar gravações Firebase.');
lacks(reports,'.update(','Relatórios não podem atualizar dados.');
lacks(reports,'.set(','Relatórios não podem criar documentos.');
lacks(reports,'.delete(','Relatórios não podem excluir documentos.');

has(feedback,"where('trainerId','==',uid).where('role','==','student').limit(500)",'Feedbacks: consulta de alunos não está compatível com Rules 28.');
has(feedback,'const CONCURRENCY=8','Feedbacks: fan-out não possui concorrência limitada.');
has(feedback,'const READ_TIMEOUT=5200','Feedbacks: leitura por aluno não possui timeout finito.');
has(feedback,"db.collection('feedback').where('studentId','==',student.uid)",'Feedbacks: leitura não está isolada pelo aluno vinculado.');
has(feedback,'partialFailures++','Feedbacks: uma falha de aluno ainda pode derrubar todo o histórico.');
has(feedback,'TENTAR NOVAMENTE','Feedbacks: erro total não oferece recuperação explícita.');
lacks(feedback,'setInterval(','Feedbacks não podem introduzir polling.');
lacks(feedback,'MutationObserver','Feedbacks não podem observar globalmente o DOM.');
lacks(feedback,'cloudWrite(','Feedbacks não podem criar gravações Firebase.');

has(radar,"if(typeof viewStudent==='function')await viewStudent",'Radar deixou de usar o fluxo global de abertura de aluno que recebe a correção resiliente.');
assert(firebase?.firestore?.rules==='firebase/firestore_28_compacto.rules','Correção alterou o caminho da regra Firestore ativa.');
assert(firebase?.storage?.rules==='firebase/storage_6.rules','Correção alterou o caminho da regra Storage ativa.');

if(failures.length){
  console.error('FALHA — confiabilidade do runtime do treinador\n- '+failures.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — cold start e ABRIR ALUNO permanecem resilientes; Relatórios enviados passam a usar propriedade histórica imutável e Feedbacks mantêm isolamento pelo vínculo atual.');
