import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const failures=[];
const assert=(condition,message)=>{if(!condition)failures.push(message);};
const read=file=>fs.readFileSync(file,'utf8');

const modulePath='modules/student-week-workout-layout-v10_10_40.js';
const usabilityPath='modules/usability-checkup-v10_10_9.js';
const workerPath='sw.js';
const corePath='app_v10_10_9_core.js';
const indexPath='index.html';

for(const file of [modulePath,usabilityPath,workerPath,corePath,indexPath])assert(fs.existsSync(file),`Arquivo obrigatório ausente: ${file}`);
for(const file of [modulePath,usabilityPath,workerPath]){
  if(!fs.existsSync(file))continue;
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert(result.status===0,`${file} possui JavaScript inválido: ${String(result.stderr||'').trim()}`);
}

const source=fs.existsSync(modulePath)?read(modulePath):'';
const usability=fs.existsSync(usabilityPath)?read(usabilityPath):'';
const worker=fs.existsSync(workerPath)?read(workerPath):'';
const core=fs.existsSync(corePath)?read(corePath):'';
const index=fs.existsSync(indexPath)?read(indexPath):'';
const src='./modules/student-week-workout-layout-v10_10_40.js?v=10.10.40-weeklayout2';

assert(usability.includes(src),'Camada network-first de usabilidade não carrega a revisão corrigida do layout semanal.');
assert(usability.includes("const EXPECTED_VERSION='10.10.40-weeklayout2'"),'Loader não valida explicitamente a revisão corrigida.');
assert(usability.includes("window.TeamBullsStudentWeekWorkoutLayout?.version===EXPECTED_VERSION"),'Loader aceita uma versão antiga já carregada no PWA.');
assert(usability.includes("String(script.src||'')===expectedUrl"),'Loader pode confundir o script antigo em cache com a revisão corrigida.');
assert(!usability.includes("?v=10.10.40-weeklayout1'"),'Loader ainda referencia a revisão antiga do layout semanal.');
assert(usability.includes('function loadWeekWorkoutLayout()'),'Loader dedicado do layout semanal está ausente.');
assert(usability.includes("CURRENT_USER?.role==='trainer'"),'Loader não impede carregamento desnecessário no contexto do treinador.');
assert(worker.includes("'/modules/usability-checkup-v10_10_9.js'"),'Arquivo ponte deixou de ser tratado como mutável/network-first pelo Service Worker.');

assert(source.includes("const VERSION='10.10.40-weeklayout2'"),'Layout semanal não possui a revisão corrigida.');
assert(source.includes("document.getElementById('screen-day')"),'Layout novo não está limitado à tela DIA // pasta.');
assert(source.includes("document.getElementById('student-day-weekly-board')"),'Layout novo não usa o quadro semanal da pasta aberta.');
assert(source.includes("host.id='tb-student-day-week-sheet'"),'Planilha semanal da pasta não é criada dentro da tela do dia.');
assert(source.includes("legacy.insertAdjacentElement('beforebegin',host)"),'Planilha semanal não substitui visualmente o quadro horizontal da pasta.');
assert(source.includes('typeof renderDay')&&source.includes('renderDay=wrapped'),'Layout semanal não acompanha o render canônico da página da pasta.');
assert(!source.includes('renderWorkout=wrapped'),'Layout semanal voltou a interceptar a página geral de treino.');
assert(!source.includes("document.querySelector('#screen-workout"),'Layout semanal voltou a inserir conteúdo na página geral de treino.');
assert(source.includes("document.getElementById('tb-student-week-sheet')?.remove()"),'Migração não remove o quadro incorreto já criado na página geral por uma versão antiga em memória.');
assert(source.includes('renderWorkout.__tbStudentWeekWorkoutLayout')&&source.includes('renderWorkout=renderWorkout.__tbBase'),'Migração não desmonta o wrapper antigo da página geral.');
assert(source.includes('CUR_DAY')&&source.includes('exercisesForDay'),'Layout não filtra os exercícios pela pasta/dia atualmente aberta.');
assert(source.includes("normal(item?.name)===normal(dayName)"),'Pasta aberta não é resolvida pelo mesmo nome normalizado do core.');
assert(source.includes('context.items.map(exercise=>rowHtml'),'Planilha não é composta exclusivamente pelos exercícios da pasta atual.');
assert(source.includes("context.items.some(item=>String(item?.id||'')===String(exerciseId))"),'Abertura de exercício não valida que o item pertence à pasta atual.');

assert(source.includes('EXERCÍCIO')&&source.includes('PRESCRIÇÃO'),'Cabeçalho Exercício | Prescrição não está presente.');
assert(source.includes('data-week-delta="-1"')&&source.includes('data-week-delta="1"'),'Navegação anterior/próxima semana não está presente.');
assert(source.includes('Math.max(1,Math.min(8'),'Navegação semanal não está limitada às oito semanas do ciclo.');
assert(source.includes('prescriptionCompactSummary'),'Nova visualização não reutiliza a prescrição canônica.');
assert(source.includes('openStudentWeekExercise'),'Toque na linha não reutiliza o fluxo canônico de abertura do exercício por semana.');
assert(source.includes('window.TeamBullsSessionIntegrity'),'Contagem de conclusão não reutiliza a separação segura do ciclo atual.');
assert(source.includes('data-day-week-compare'),'Comparação completa das oito semanas não foi preservada como opção secundária.');
assert(source.includes('legacy.hidden=true'),'Grade horizontal antiga não fica recolhida por padrão.');
assert(source.includes("scheduleWeeklyBoardRender(context.dayWorkout,'student-day-weekly-board',false)"),'Comparação antiga não continua usando somente os exercícios da pasta.');
assert(source.includes("currentUser()?.role==='trainer'")&&source.includes("document.body?.classList.contains('trainer-desktop')"),'Layout novo não exclui explicitamente o contexto do treinador.');
assert(source.includes('#screen-day #tb-student-day-week-sheet')&&source.includes('grid-template-columns:minmax(0,1.15fr) minmax(128px,.85fr) 18px'),'Layout da pasta não usa a grade compacta Exercício | Prescrição.');
assert(!source.includes('min-width:870px'),'Novo layout não pode repetir a largura mínima de 870 px da grade antiga.');
assert(!source.includes('weekly-plan-scroll"><table'),'Novo layout principal não pode recriar a tabela horizontal das oito semanas.');

assert(!source.includes('db.collection'),'Layout visual não deve consultar Firestore.');
assert(!source.includes('cloudGet(')&&!source.includes('cloudWrite('),'Layout visual não deve criar caminho de leitura/escrita cloud.');
assert(!source.includes('fetch('),'Layout visual não deve criar caminho de rede próprio.');
assert(!source.includes('MutationObserver'),'Layout semanal não deve adicionar observer global.');
assert(!source.includes('setInterval'),'Layout semanal não deve adicionar polling.');

assert(core.includes('function openDay(dayName)')&&core.includes("CUR_DAY=day.name;renderDay();showScreen('screen-day')"),'Fluxo canônico de abertura da pasta foi removido do core.');
assert(core.includes('dayWorkout={...w,exercises:items}')&&core.includes("'student-day-weekly-board'"),'Core deixou de construir o quadro semanal filtrado da pasta.');
assert(index.includes('id="screen-workout"')&&index.includes('id="day-folder-list"'),'Página geral de treino deixou de manter a navegação por pastas.');
assert(index.includes('id="screen-day"')&&index.includes('id="student-day-summary"')&&index.includes('id="student-day-weekly-board"'),'Página DIA // pasta deixou de conter resumo e quadro semanal próprios.');
assert(index.includes('somente os exercícios desta pasta'),'Escopo visual da página da pasta foi perdido.');

if(failures.length){console.error('\nFALHA — layout semanal dentro da pasta do treino\n- '+failures.join('\n- '));process.exit(1);}
console.log('APROVADO — página geral mantém somente a navegação dos treinos; o novo Exercício | Prescrição aparece em DIA // pasta, filtra CUR_DAY, navega 8 semanas, migra cache antigo e preserva a comparação completa sem Firebase extra.');
