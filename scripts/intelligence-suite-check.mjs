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
assert(src.loader.includes('10.10.44-contextguard3')&&src.loader.includes('10.10.43-studentinsights2')&&src.loader.includes('10.10.43-studentprogress2'),'loader: revisões estabilizadas da suíte não estão sendo exigidas');

assert(src.data.includes('trainerActivity')&&src.data.includes('trainerBilling'),'dados: deve reaproveitar índices globais já existentes');
assert(src.data.includes("db.collection('users').where('trainerId','==',uid).where('role','==','student').limit(500)"),'dados: roster do radar deve restringir trainerId + role=student para respeitar Rules 28');
assert(src.data.includes('checkinSchedules')&&src.data.includes('protocolReviewSchedules'),'dados: radar deve reutilizar agendas canônicas');
assert(src.data.includes('loadDeepStudent')&&src.data.includes("collection('sessions')"),'dados: análise profunda do aluno ausente');
const dashboardBody=src.data.slice(src.data.indexOf('async function loadDashboard'),src.data.indexOf('async function loadDeepStudent'));
assert(!dashboardBody.includes("collection('sessions')"),'dados: dashboard não pode varrer sessões de todos os alunos');
assert(!dashboardBody.includes("collection('feedback')"),'dados: dashboard não pode varrer feedbacks de todos os alunos');
assert(src.data.includes('TTL_MS=120000'),'dados: cache TTL compartilhado deve permanecer ativo');
assert(src.data.includes('CONCURRENCY=5'),'dados: concorrência de leituras por aluno deve permanecer limitada');
assert(src.data.includes('trainingSessionCount'),'dados: métricas não podem confundir um documento por exercício com uma sessão de treino');
assert(src.data.includes("['weekly_checkin','questionnaire'].includes"),'dados: sinal de novo relatório não pode considerar qualquer atividade não lida');

assert(src.guard.includes('ensureWeeklyCheckinContext')&&src.guard.includes('ensureProtocolContext'),'guarda: sincronização canônica de relatório/ciclo ausente');
assert(src.guard.includes('fetchWeeklyCheckins')&&src.guard.includes('loadTrainerProtocolReview'),'guarda: deve reaproveitar os loaders canônicos');
assert(src.guard.includes('viewWeeklyCheckin=wrapped')&&src.guard.includes('markProtocolReviewCompleted=wrapped'),'guarda: ações canônicas precisam ser protegidas');
assert(src.guard.includes('checkinLoad.studentId!==studentId')&&src.guard.includes('protocolLoad.studentId!==studentId'),'guarda: cargas concorrentes precisam permanecer separadas por aluno');
assert(src.guard.includes('currentStudentId()!==studentId'),'guarda: resposta atrasada de outro aluno precisa ser descartada');
assert(src.guard.includes("PROTOCOL_COMPLETED_EVENT='team-bulls-protocol-review-completed'"),'guarda: conclusão mensal precisa emitir evento somente após confirmação real');
assert(src.guard.includes('const result=await callback.apply(this,arguments)')&&src.guard.includes('notifyProtocolCompleted(studentId,beforeCycle)'),'guarda: evento de conclusão deve ocorrer depois do callback canônico terminar');
assert(src.guard.includes('cycle<=beforeCycle')&&src.guard.includes('activeStudent!==studentId'),'guarda: cancelamento/falha/outro aluno não podem simular conclusão do ciclo');
assert(src.guard.includes('TeamBullsTrainerIntelligenceData?.invalidateStudent?.(studentId)')&&src.guard.includes('TeamBullsTrainerStudentInsights?.refresh?.()'),'guarda: análise aberta precisa invalidar cache e recarregar somente após conclusão real');
assert(!/collection\(['"]weeklyCheckins['"]\)/.test(src.guard),'guarda: não deve reimplementar consulta de relatório; usar fetchWeeklyCheckins');

for(const text of ['Radar diário','Prioridades de hoje','Resumo semanal','SEMÁFORO OPERACIONAL','PRÓXIMA AÇÃO'])assert(src.command.includes(text),`central: recurso ausente — ${text}`);
assert(src.command.includes('decorateStudentCards'),'central: semáforo da lista de alunos ausente');
assert(src.command.includes('deepAnalyze'),'central: análise profunda sob demanda ausente');
assert(!src.command.includes("collection('sessions')"),'central: UI não deve consultar sessões diretamente; usar camada de dados');

for(const text of ['LINHA DO TEMPO','COMPARAR','PRÓXIMAS AÇÕES','METAS','MODO REVISÃO'])assert(src.insights.includes(text),`insights: aba ausente — ${text}`);
assert(src.insights.includes('timelineEvents')&&src.insights.includes('comparison()'),'insights: timeline/comparador ausentes');
assert(src.insights.includes("openFeedbackModal('protocol_update')"),'insights: revisão deve reutilizar feedback canônico');
assert(src.insights.includes('markProtocolReviewCompleted'),'insights: revisão deve reutilizar conclusão mensal canônica');
assert(src.insights.includes('weightComparable')&&src.insights.includes('weightDelta!==null'),'insights: peso ausente não pode ser convertido em falsa variação de 0 kg');
assert(src.insights.includes('countTrainingSessions'),'insights: comparador e metas devem contar sessões reais, não documentos de exercícios');
assert(src.insights.includes("collection('protocolReviewSchedules')")&&src.insights.includes('cycleGoals'),'insights: metas devem permanecer vinculadas ao ciclo oficial');
assert(!/collection\(['"](?:studentGoals|achievements|trainerRadar|riskScores)['"]\)/.test(src.insights+src.command+src.data+src.student),'suíte: não criar coleções paralelas para estado derivado');
assert(!src.insights.includes("collection('weeklyCheckins').doc")&&!src.insights.includes("collection('weeklyCheckins').add"),'insights: treinador não pode simular relatório semanal do aluno');

for(const text of ['Metas & Conquistas','Progressão registrada','4 semanas consistentes','8 semanas consistentes','Ciclo concluído'])assert(src.student.includes(text),`aluno: conquista/meta ausente — ${text}`);
assert(src.student.includes("collection('sessions')")&&src.student.includes("collection('weeklyCheckins')"),'aluno: progresso precisa derivar dos registros reais');
assert(src.student.includes('sessionCount(sessions)')&&src.student.includes('sessionCount(cycleSessions)'),'aluno: conquistas/metas devem contar treinos reais agrupados, não cada exercício salvo');
assert(!/cloudWrite/.test(src.student),'aluno: tela de conquistas não pode usar cloudWrite');
assert(!/collection\([^\n]+\)\.(?:add|doc\([^\n]+\)\.(?:set|update|delete))\s*\(/.test(src.student),'aluno: tela de conquistas não pode gravar no Firestore');

console.log('APROVADO — suíte de inteligência mantém as 10 ideias, roster compatível com Rules 28, contexto isolado por aluno, sessões reais nas métricas, peso ausente sem falsa variação e Modo Revisão sincronizado somente após a confirmação canônica; sem polling ou coleções paralelas.');
