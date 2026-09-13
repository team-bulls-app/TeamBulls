import fs from 'node:fs';
import vm from 'node:vm';

const files={
  loader:'modules/intelligence-suite-loader-v10_10_42.js',
  data:'modules/trainer-intelligence-data-v10_10_42.js',
  guard:'modules/trainer-canonical-context-guard-v10_10_42.js',
  command:'modules/trainer-command-center-v10_10_42.js',
  insights:'modules/trainer-student-insights-v10_10_42.js',
  student:'modules/student-progress-hub-v10_10_42.js'
};
const src=Object.fromEntries(Object.entries(files).map(([key,path])=>[key,fs.readFileSync(path,'utf8')]));
const assert=(condition,message)=>{if(!condition)throw new Error(message);};

for(const [name,code] of Object.entries(src)){
  assert(code.includes("'use strict'"),`${name}: módulo deve usar strict mode`);
  assert(!/setInterval\s*\(/.test(code),`${name}: suíte não pode adicionar polling`);
  assert(!/MutationObserver/.test(code),`${name}: suíte não pode adicionar observer global`);
  assert(!/\.onSnapshot\s*\(/.test(code),`${name}: suíte deve permanecer sob demanda nesta revisão`);
  new vm.Script(code,{filename:files[name]});
}

assert(src.loader.includes('trainer-intelligence-data-v10_10_42.js')&&src.loader.indexOf('trainer-intelligence-data-v10_10_42.js')<src.loader.indexOf('trainer-command-center-v10_10_42.js'),'loader: dados precisam carregar antes da central');
assert(src.loader.includes('trainer-canonical-context-guard-v10_10_42.js')&&src.loader.indexOf('trainer-canonical-context-guard-v10_10_42.js')<src.loader.indexOf('trainer-student-insights-v10_10_42.js'),'loader: guarda canônica deve carregar antes das telas do treinador');
assert(src.loader.includes('student-progress-hub-v10_10_42.js'),'loader: módulo de progresso do aluno ausente');
assert(src.loader.includes("MODE==='cloud'"),'loader: recursos sincronizados devem exigir cloud');

assert(src.data.includes('trainerActivity')&&src.data.includes('trainerBilling'),'dados: deve reaproveitar índices globais já existentes');
assert(src.data.includes('checkinSchedules')&&src.data.includes('protocolReviewSchedules'),'dados: radar deve reutilizar agendas canônicas');
assert(src.data.includes('loadDeepStudent')&&src.data.includes("collection('sessions')"),'dados: análise profunda do aluno ausente');
const dashboardBody=src.data.slice(src.data.indexOf('async function loadDashboard'),src.data.indexOf('async function loadDeepStudent'));
assert(!dashboardBody.includes("collection('sessions')"),'dados: dashboard não pode varrer sessões de todos os alunos');
assert(!dashboardBody.includes("collection('feedback')"),'dados: dashboard não pode varrer feedbacks de todos os alunos');
assert(src.data.includes('TTL_MS=120000'),'dados: cache TTL compartilhado deve permanecer ativo');
assert(src.data.includes('CONCURRENCY=5'),'dados: concorrência de leituras por aluno deve permanecer limitada');

assert(src.guard.includes('ensureWeeklyCheckinContext')&&src.guard.includes('ensureProtocolContext'),'guarda: sincronização canônica de relatório/ciclo ausente');
assert(src.guard.includes('fetchWeeklyCheckins')&&src.guard.includes('loadTrainerProtocolReview'),'guarda: deve reaproveitar os loaders canônicos');
assert(src.guard.includes('viewWeeklyCheckin=wrapped')&&src.guard.includes('markProtocolReviewCompleted=wrapped'),'guarda: ações canônicas precisam ser protegidas');
assert(!/collection\(['"]weeklyCheckins['"]\)/.test(src.guard),'guarda: não deve reimplementar consulta de relatório; usar fetchWeeklyCheckins');

for(const text of ['Radar diário','Prioridades de hoje','Resumo semanal','SEMÁFORO OPERACIONAL','PRÓXIMA AÇÃO'])assert(src.command.includes(text),`central: recurso ausente — ${text}`);
assert(src.command.includes('decorateStudentCards'),'central: semáforo da lista de alunos ausente');
assert(src.command.includes('deepAnalyze'),'central: análise profunda sob demanda ausente');
assert(!src.command.includes("collection('sessions')"),'central: UI não deve consultar sessões diretamente; usar camada de dados');

for(const text of ['LINHA DO TEMPO','COMPARAR','PRÓXIMAS AÇÕES','METAS','MODO REVISÃO'])assert(src.insights.includes(text),`insights: aba ausente — ${text}`);
assert(src.insights.includes('timelineEvents')&&src.insights.includes('comparison()'),'insights: timeline/comparador ausentes');
assert(src.insights.includes("openFeedbackModal('protocol_update')"),'insights: revisão deve reutilizar feedback canônico');
assert(src.insights.includes('markProtocolReviewCompleted'),'insights: revisão deve reutilizar conclusão mensal canônica');
assert(src.insights.includes("collection('protocolReviewSchedules')")&&src.insights.includes('cycleGoals'),'insights: metas devem permanecer vinculadas ao ciclo oficial');
assert(!/collection\(['"](?:studentGoals|achievements|trainerRadar|riskScores)['"]\)/.test(src.insights+src.command+src.data+src.student),'suíte: não criar coleções paralelas para estado derivado');
assert(!src.insights.includes("collection('weeklyCheckins').doc")&&!src.insights.includes("collection('weeklyCheckins').add"),'insights: treinador não pode simular relatório semanal do aluno');

for(const text of ['Metas & Conquistas','Progressão registrada','4 semanas consistentes','8 semanas consistentes','Ciclo concluído'])assert(src.student.includes(text),`aluno: conquista/meta ausente — ${text}`);
assert(src.student.includes("collection('sessions')")&&src.student.includes("collection('weeklyCheckins')"),'aluno: progresso precisa derivar dos registros reais');
assert(!/cloudWrite/.test(src.student),'aluno: tela de conquistas não pode usar cloudWrite');
assert(!/collection\([^\n]+\)\.(?:add|doc\([^\n]+\)\.(?:set|update|delete))\s*\(/.test(src.student),'aluno: tela de conquistas não pode gravar no Firestore');

console.log('APROVADO — 10 ideias protegidas por arquitetura modular: radar, timeline, comparação, prioridades, próximas ações, metas, semáforo, resumo semanal, conquistas e modo revisão; leituras pesadas ficam sob demanda, ações críticas usam contexto canônico e não há polling/coleções paralelas.');
