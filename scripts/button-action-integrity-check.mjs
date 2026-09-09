import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const fail=[];
const assert=(ok,message)=>{if(!ok)fail.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);
const files={
  mod:'modules/button-action-integrity-v10_10_38.js',
  config:'config_v10_7.js',
  index:'index.html',
  core:'app_v10_10_9_core.js',
  home:'modules/student-home-layout-v10_10_15.js',
  workout:'modules/student-workout-library-v10_10_24.js',
  weekly:'modules/student-weekly-report-entry-v10_10_35.js',
  boot:'boot_v10.js',
  workflow:'.github/workflows/quality.yml'
};
Object.values(files).forEach(path=>assert(fs.existsSync(path),`Arquivo ausente: ${path}`));
if(fail.length){console.error(fail.join('\n'));process.exit(1);}
const read=path=>fs.readFileSync(path,'utf8');
const mod=read(files.mod),config=read(files.config),index=read(files.index),core=read(files.core),home=read(files.home),workout=read(files.workout),weekly=read(files.weekly),boot=read(files.boot),workflow=read(files.workflow);
const syntax=spawnSync(process.execPath,['--check',files.mod],{encoding:'utf8'});
assert(syntax.status===0,`Módulo de integridade inválido: ${String(syntax.stderr||'').trim()}`);

has(mod,"const VERSION='10.10.38-buttonintegrity1'",'Revisão da camada de botões incorreta.');
has(mod,"document.addEventListener('click',onClick,true)",'Integridade precisa interceptar a ação antes do handler legado.');
has(mod,'[data-hotbar="workout"]','Ação Treino da hotbar não está protegida.');
has(mod,"#weekly-checkin-home-banner button",'Botão de relatório semanal da Home não está protegido.');
has(mod,"studentDesktopWorkout(button)",'Atalho desktop de Treinos não está protegido.');
has(mod,"TeamBullsStudentWorkoutLibrary",'Treino não aponta para a biblioteca dedicada.');
has(mod,"openWeeklyCheckinModal",'Relatório semanal não aponta para o formulário canônico.');
has(mod,"openMyQuestionnaires",'Relatórios não possuem fallback canônico.');
has(mod,'WAIT_MS=2600','Espera por módulo precisa ser limitada.');
has(mod,'TeamBullsRuntimeLoader?.student?.()','Ação deve pedir conclusão do runtime prioritário quando necessário.');
has(mod,'TeamBullsRuntimeLoader?.retry?.()','Ação deve participar do autorreparo do loader.');
has(mod,"pull-refresh-running",'Camada não recupera trava de interação residual.');
has(mod,"__TEAM_BULLS_REFRESHING__===true",'Recuperação não distingue atualização real de trava residual.');
lacks(mod,'setInterval(','Integridade de botões não deve criar polling contínuo.');
lacks(mod,'cloudWrite(','Integridade de botões não deve criar writes.');
lacks(mod,"db.collection(",'Integridade de botões não deve criar leituras Firestore.');

const moduleUrl='./modules/button-action-integrity-v10_10_38.js?v=10.10.38-buttonintegrity1';
has(config,moduleUrl,'Loader não carrega a camada de integridade de botões.');
const homeAt=config.indexOf('student-home-layout-v10_10_15.js');
const integrityAt=config.indexOf('button-action-integrity-v10_10_38.js');
const weeklyAt=config.indexOf('student-weekly-report-entry-v10_10_35.js');
const workoutAt=config.indexOf('student-workout-library-v10_10_24.js');
assert(homeAt>=0&&integrityAt>homeAt&&integrityAt<weeklyAt&&integrityAt<workoutAt,'Integridade deve carregar logo após a Home e antes dos módulos que substituem ações.');

has(home,"goHome();setTimeout",'Teste perdeu o fallback legado que motiva a proteção da ação Treino.');
has(workout,'openLibrary()','Biblioteca dedicada de treinos deixou de possuir ação canônica.');
has(weekly,"openWeeklyCheckinModal",'Entrada semanal deixou de usar formulário canônico.');
has(core,'function openWeeklyCheckinModal()','Core não possui formulário semanal canônico.');
has(boot,'window.TeamBullsBootSafety=window.TeamBullsRuntimeStabilityBoot','Boot não expõe recuperação segura de interação.');

// IDs estáticos duplicados tornam label/onclick imprevisíveis e são uma causa comum de botão morto.
const ids=[...index.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
const duplicates=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];
assert(!duplicates.length,`IDs duplicados no HTML: ${duplicates.join(', ')}`);

has(workflow,'node scripts/button-action-integrity-check.mjs','Quality não executa auditoria de botões.');
if(fail.length){console.error('FALHA — integridade das ações de botões\n- '+fail.join('\n- '));process.exit(1);}
console.log('APROVADO — ações principais do aluno não ficam silenciosamente inativas durante carregamento: Treino abre a biblioteca dedicada, relatório semanal abre o formulário canônico, runtime tem espera limitada/autorreparo e não há IDs estáticos duplicados, polling ou Firebase extra.');
