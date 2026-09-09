import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const fail=[];
const assert=(ok,message)=>{if(!ok)fail.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);
const pdfPath='modules/pdf-export-v10_10_12.js';
const bridgePath='modules/custom-food-calorie-bridge-v10_10_12.js';
const configPath='config_v10_7.js';
const indexPath='index.html';
for(const file of [pdfPath,bridgePath,configPath]){
  assert(fs.existsSync(file),`Arquivo ausente: ${file}`);
  if(fs.existsSync(file)){
    const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
    assert(syntax.status===0,`${file} possui JavaScript inválido: ${String(syntax.stderr||'').trim()}`);
  }
}
const pdf=fs.existsSync(pdfPath)?fs.readFileSync(pdfPath,'utf8'):'';
const bridge=fs.existsSync(bridgePath)?fs.readFileSync(bridgePath,'utf8'):'';
const config=fs.existsSync(configPath)?fs.readFileSync(configPath,'utf8'):'';
const index=fs.existsSync(indexPath)?fs.readFileSync(indexPath,'utf8'):'';
const studentPdfUrl='./modules/pdf-export-v10_10_12.js?v=10.10.12-pdf1&fix=student1';
has(pdf,"const VERSION='10.10.36-pdf2'",'Gerador PDF mobile não está na revisão esperada.');
has(pdf,"new Blob([bytes],{type:'application/pdf'})",'PDF não é gerado como application/pdf local.');
has(pdf,"window.exportWorkoutPdf=exportWorkout",'Exportação de treino não substitui o fluxo antigo.');
has(pdf,"window.exportCurrentDietPdf",'Exportação de dieta do aluno não foi exposta.');
has(pdf,"window.exportTrainerDietPdf",'Exportação de dieta pelo treinador não foi exposta.');
has(pdf,"TEAM BULLS",'Layout PDF não preserva a identidade Team Bulls.');
has(pdf,"// SURVIVAL FITNESS SYSTEM",'Layout PDF não contém assinatura visual do app.');
has(pdf,"data-tb-pdf-diet",'Botão PDF da dieta não é instalado.');
has(pdf,'function appleMobile()','Exportador não identifica iPhone/iPad para entrega compatível.');
has(pdf,"new File([blob],filename,{type:'application/pdf'})",'Entrega mobile não prepara um arquivo PDF compartilhável.');
has(pdf,'navigator.canShare(payload)','Entrega mobile não valida compartilhamento de arquivo.');
has(pdf,'await navigator.share(payload)','iPhone/iPad não recebe fallback pelo compartilhamento nativo.');
has(pdf,"a.download=filename",'Android/desktop não preservam download direto do PDF.');
lacks(pdf,'window.open(','PDF nativo voltou a depender de pop-up.');
lacks(pdf,'.print()','PDF nativo voltou a depender da impressão do navegador.');
lacks(pdf,"db.collection(",'Gerador PDF não deve criar leituras/escritas Firestore.');
lacks(pdf,'cloudWrite(','Gerador PDF não deve criar escritas na nuvem.');
has(bridge,"const PDF_MODULE='./modules/pdf-export-v10_10_12.js?v=10.10.12-pdf1'",'Hotfix do treinador não preserva o gerador PDF nativo.');
has(bridge,'function loadPdfExporter()','Loader resiliente do PDF está ausente.');
has(bridge,'window.TeamBullsPdfExport','Loader não confirma a API do PDF.');
has(config,studentPdfUrl,'Runtime prioritário do aluno não carrega diretamente o exportador PDF nativo.');
const priorityStart=config.indexOf('const studentPriorityModules=['),priorityEnd=config.indexOf('];',priorityStart),pdfAt=config.indexOf(studentPdfUrl),workoutAt=config.indexOf('./modules/student-workout-library-v10_10_24.js',priorityStart);
assert(priorityStart>=0&&priorityEnd>priorityStart&&pdfAt>priorityStart&&pdfAt<priorityEnd,'Exportador PDF não está dentro de studentPriorityModules.');
assert(pdfAt>=0&&workoutAt>=0&&pdfAt<workoutAt,'Exportador PDF deve ficar pronto antes da biblioteca de treinos do aluno.');
has(index,'onclick="exportCurrentWorkoutPdf()"','Botão PDF do treino do aluno não está ligado ao exportador.');
if(fail.length){console.error('FALHA — PDF nativo Team Bulls\n- '+fail.join('\n- '));process.exit(1);}
console.log('APROVADO — PDFs de treino/dieta carregam no runtime prioritário do aluno; iPhone/iPad usam arquivo compartilhável, Android/desktop mantêm download direto, sem pop-up/print/Firestore.');
