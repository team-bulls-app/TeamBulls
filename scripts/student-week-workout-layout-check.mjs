import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const failures=[];
const assert=(condition,message)=>{if(!condition)failures.push(message);};
const read=file=>fs.readFileSync(file,'utf8');

const modulePath='modules/student-week-workout-layout-v10_10_40.js';
const configPath='config_v10_7.js';
const corePath='app_v10_10_9_core.js';
const indexPath='index.html';

for(const file of [modulePath,configPath,corePath,indexPath])assert(fs.existsSync(file),`Arquivo obrigatório ausente: ${file}`);
for(const file of [modulePath,configPath]){
  if(!fs.existsSync(file))continue;
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert(result.status===0,`${file} possui JavaScript inválido: ${String(result.stderr||'').trim()}`);
}

const source=fs.existsSync(modulePath)?read(modulePath):'';
const config=fs.existsSync(configPath)?read(configPath):'';
const core=fs.existsSync(corePath)?read(corePath):'';
const index=fs.existsSync(indexPath)?read(indexPath):'';
const src='./modules/student-week-workout-layout-v10_10_40.js?v=10.10.40-weeklayout1';

assert(config.includes(src),'Novo layout semanal não está no runtime prioritário do aluno.');
assert(config.indexOf(src)>config.indexOf('session-integrity-v10_10_39.js'),'Layout semanal precisa executar depois da proteção estrutural dos registros.');
assert(config.indexOf(src)<config.indexOf('student-workout-library-v10_10_24.js'),'Layout semanal deve estar pronto antes da biblioteca de treinos ficar disponível.');
assert(source.includes("const VERSION='10.10.40-weeklayout1'"),'Layout semanal não possui revisão própria.');
assert(source.includes("host.id='tb-student-week-sheet'"),'Planilha semanal principal não é criada na tela do treino.');
assert(source.includes("summary.insertAdjacentElement('afterend',host)"),'Planilha semanal não entra logo após o resumo do protocolo.');
assert(source.includes('EXERCÍCIO')&&source.includes('PRESCRIÇÃO'),'Cabeçalho Exercício | Prescrição não está presente.');
assert(source.includes('data-week-delta="-1"')&&source.includes('data-week-delta="1"'),'Navegação anterior/próxima semana não está presente.');
assert(source.includes('Math.max(1,Math.min(8'),'Navegação semanal não está limitada às oito semanas do ciclo.');
assert(source.includes('prescriptionCompactSummary'),'Nova visualização não reutiliza a prescrição canônica.');
assert(source.includes('groupExercisesByDay')&&source.includes('getWorkoutDays'),'Exercícios deixaram de respeitar as pastas/dias já existentes.');
assert(source.includes('openStudentWeekExercise'),'Toque na linha não reutiliza o fluxo canônico de abertura do exercício por semana.');
assert(source.includes('window.TeamBullsSessionIntegrity'),'Contagem de conclusão não reutiliza a separação segura do ciclo atual.');
assert(source.includes("toggle.textContent=panel?.classList.contains('open')?'▦ OCULTAR COMPARAÇÃO DAS 8 SEMANAS':'▦ COMPARAR AS 8 SEMANAS'"),'Comparação completa das oito semanas não foi preservada como opção secundária.');
assert(source.includes("label.textContent='Acessar treino por dia'"),'Pastas dos dias não foram preservadas como navegação secundária.');
assert(source.includes("currentUser()?.role==='trainer'")&&source.includes("document.body?.classList.contains('trainer-desktop')"),'Layout novo não exclui explicitamente o contexto do treinador.');
assert(source.includes("#tb-student-week-sheet{margin:14px 0 16px")&&source.includes('grid-template-columns:minmax(0,1.15fr) minmax(128px,.85fr) 18px'),'Layout principal não usa a grade compacta Exercício | Prescrição.');
assert(!source.includes('min-width:870px'),'Novo layout não pode repetir a largura mínima de 870 px da grade antiga.');
assert(!source.includes('weekly-plan-scroll"><table'),'Novo layout principal não pode recriar a tabela horizontal das oito semanas.');
assert(!source.includes('db.collection'),'Layout visual não deve consultar Firestore.');
assert(!source.includes('cloudGet(')&&!source.includes('cloudWrite('),'Layout visual não deve criar caminho de leitura/escrita cloud.');
assert(!source.includes('fetch('),'Layout visual não deve criar caminho de rede.');
assert(!source.includes('MutationObserver'),'Layout semanal não deve adicionar observer global.');
assert(!source.includes('setInterval'),'Layout semanal não deve adicionar polling.');
assert(core.includes('function buildWeeklyBoard('),'Grade canônica das oito semanas foi removida do core.');
assert(index.includes('id="student-workout-overview"')&&index.includes('id="student-weekly-board"'),'Painel legado de comparação das oito semanas deixou de existir.');

if(failures.length){console.error('\nFALHA — layout semanal do treino\n- '+failures.join('\n- '));process.exit(1);}
console.log('APROVADO — aluno vê uma semana por vez em Exercício | Prescrição, navega entre 8 semanas, mantém dias/comparação completa e reutiliza os fluxos canônicos sem Firebase extra.');
