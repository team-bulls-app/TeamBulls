import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const fail=[];
const assert=(ok,message)=>{if(!ok)fail.push(message);};
const read=file=>fs.readFileSync(file,'utf8');
const moduleFile='modules/trainer-sent-reports-v10_10_33.js';
const module=read(moduleFile);
const config=read('config_v10_7.js');
const rules=read('firebase/firestore_28_compacto.rules');

const syntax=spawnSync(process.execPath,['--check',moduleFile],{encoding:'utf8'});
assert(syntax.status===0,`Módulo de relatórios enviados possui JavaScript inválido: ${String(syntax.stderr||'').trim()}`);

const moduleUrl='./modules/trainer-sent-reports-v10_10_33.js?v=10.10.33-sentreports1';
assert(config.includes(`'${moduleUrl}'`),'Loader não inclui o arquivo de relatórios enviados com URL versionada.');
const trainerOnly=config.match(/const trainerOnlyModules=new Set\(\[([\s\S]*?)\n  \]\);/)?.[1]||'';
assert(trainerOnly.includes(moduleUrl),'Arquivo de relatórios enviados precisa ser exclusivo do runtime do treinador.');
const priority=config.match(/const studentPriorityModules=\[([\s\S]*?)\n  \];/)?.[1]||'';
assert(!priority.includes('trainer-sent-reports'),'Aluno não pode baixar o arquivo administrativo no runtime prioritário.');

assert(module.includes("db.collection('users').where('trainerId','==',uid)"),'Arquivo não resolve primeiro os alunos realmente vinculados ao treinador.');
assert(module.includes("db.collection('questionnaires').where('studentId','==',student.uid)"),'Relatórios precisam ser consultados por aluno para respeitar as Rules atuais.');
assert(!module.includes("collection('questionnaires').where('trainerId'"),'Não usar consulta global por trainerId: as Rules validam propriedade pelo studentId.');
assert(module.includes('const CONCURRENCY=4'),'Consultas por aluno precisam ter concorrência limitada.');
assert(module.includes('mapWithLimit(students,CONCURRENCY'),'Carregamento do arquivo não está usando o limite de concorrência.');
assert(module.includes("item.role==='student'&&String(item.trainerId||'')===uid"),'Resultado de alunos precisa ser novamente isolado pelo vínculo do treinador.');
assert(module.includes("!report.trainerId||String(report.trainerId)===uid"),'Relatórios legados e atuais precisam respeitar o treinador autenticado.');

assert(module.includes("filter==='pending'")&&module.includes("filter==='answered'"),'Arquivo precisa separar AGUARDANDO e RESPONDIDOS.');
assert(module.includes("data-tb-sent-filter=\"all\"")&&module.includes("data-tb-sent-filter=\"pending\"")&&module.includes("data-tb-sent-filter=\"answered\""),'Filtros visuais do arquivo estão incompletos.');
assert(module.includes('Relatórios enviados — histórico e pendências'),'Painel do treinador não possui entrada explícita para o arquivo.');
assert(module.includes("screen-trainer-sent-reports"),'Tela própria de relatórios enviados não foi criada.');
assert(module.includes("if(report.answered)openAnswered(report);else pendingDetail(report)"),'Relatório aguardando e respondido precisam ter visualizações diferentes.');
assert(module.includes('await viewQuestionnaire(report.id,true)'),'Relatório respondido não reaproveita o visualizador seguro de respostas/fotos.');
assert(module.includes('Status: AGUARDANDO RESPOSTA DO ALUNO'),'Pedido pendente não informa claramente que ainda aguarda resposta.');
assert(module.includes('viewStudent(String(student.uid)'),'Arquivo não permite navegar para o aluno correto.');
assert(module.includes("addEventListener('click',open)"),'Entrada do painel não abre o arquivo sob demanda.');

assert(!module.includes('setInterval('),'Arquivo de relatórios não pode adicionar polling.');
assert(!module.includes('onSnapshot('),'Arquivo global deve carregar somente quando o treinador abrir a tela.');
assert(!module.includes('cloudWrite('),'Arquivo global deve ser somente leitura.');
assert(!/\.set\s*\(/.test(module),'Arquivo global não pode gravar documentos Firestore.');
assert(!/\.update\s*\(/.test(module),'Arquivo global não pode alterar documentos Firestore.');
assert(!/\.delete\s*\(/.test(module),'Arquivo global não pode excluir documentos Firestore.');
const installBody=module.match(/function install\(\)\{([\s\S]*?)\}\n  window\.TeamBullsTrainerSentReports/)?.[1]||'';
assert(installBody&&!/\bload\s*\(/.test(installBody),'Instalação do módulo não pode consultar todos os relatórios durante o startup.');

assert(rules.includes('match /questionnaires/{id}'),'Rules ativas não contêm a coleção de relatórios personalizados.');
assert(rules.includes('allow read: if trainerOwns(resource.data.studentId) || activeOwner(resource.data.studentId);'),'Rules precisam manter leitura do relatório condicionada ao vínculo real treinador/aluno.');

if(fail.length){
  console.error('FALHA — arquivo de relatórios enviados do treinador\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — treinador vê solicitações enviadas por aluno, filtra pendentes/respondidas e abre respostas/fotos sem polling, writes ou leituras no startup.');
