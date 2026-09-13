import fs from 'node:fs';
import vm from 'node:vm';

const files={
  bootstrap:'modules/usability-checkup-v10_10_9.js',
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
  if(name!=='bootstrap'){
    assert(!/setInterval\s*\(/.test(code),`${name}: suíte não pode adicionar polling`);
    assert(!/MutationObserver/.test(code),`${name}: suíte não pode adicionar observer global`);
    assert(!/\.onSnapshot\s*\(/.test(code),`${name}: suíte deve permanecer sob demanda nesta revisão`);
  }
  new vm.Script(code,{filename:files[name]});
}

assert(src.bootstrap.includes("intelligence-suite-loader-v10_10_42.js?v=10.10.42-intelsuite2"),'bootstrap: PWA precisa solicitar o loader auditado com nova chave de cache');
assert(src.bootstrap.includes("EXPECTED_VERSION='10.10.42-intelsuite2'"),'bootstrap: versão esperada do loader auditado está incorreta');
assert(src.loader.includes("VERSION='10.10.42-intelsuite2'"),'loader: revisão auditada não está ativa');
for(const version of ['inteldata2','contextguard2','command2','studentinsights2','studentprogress2'])assert(src.loader.includes(version),`loader: módulo auditado ausente — ${version}`);
assert(src.loader.indexOf('trainer-intelligence-data-v10_10_42.js')<src.loader.indexOf('trainer-command-center-v10_10_42.js'),'loader: dados precisam carregar antes da central');
assert(src.loader.indexOf('trainer-canonical-context-guard-v10_10_42.js')<src.loader.indexOf('trainer-student-insights-v10_10_42.js'),'loader: guarda canônica deve carregar antes das telas do treinador');
assert(src.loader.includes("MODE==='cloud'"),'loader: recursos sincronizados devem exigir cloud');

assert(src.data.includes('trainerActivity')&&src.data.includes('trainerBilling'),'dados: deve reaproveitar índices globais já existentes');
assert(src.data.includes('checkinSchedules')&&src.data.includes('protocolReviewSchedules'),'dados: radar deve reutilizar agendas canônicas');
assert(src.data.includes("orderBy('createdAt','desc').limit(200)")&&src.data.includes("orderBy('createdAt','desc').limit(500)"),'dados: limites globais precisam selecionar realmente os registros mais recentes');
assert(src.data.includes("collection('events').where('studentId','==',key)")&&src.data.includes("collection('payments').where('studentId','==',key)"),'dados: análise profunda precisa buscar histórico do aluno sem depender do corte global');
assert(src.data.includes('loadDeepStudent')&&src.data.includes("collection('sessions')"),'dados: análise profunda do aluno ausente');
const dashboardBody=src.data.slice(src.data.indexOf('async function loadDashboard'),src.data.indexOf('async function loadDeepStudent'));
assert(!dashboardBody.includes("collection('sessions')"),'dados: dashboard não pode varrer sessões de todos os alunos');
assert(!dashboardBody.includes("collection('feedback')"),'dados: dashboard não pode varrer feedbacks de todos os alunos');
assert(src.data.includes('TTL_MS=120000'),'dados: cache TTL compartilhado deve permanecer ativo');
assert(src.data.includes('CONCURRENCY=5'),'dados: concorrência de leituras por aluno deve permanecer limitada');
assert(src.data.includes('state.nextCycle'),'dados: metas do ciclo devem seguir o mesmo ciclo pendente/concluído do protocolo canônico');

assert(src.guard.includes("VERSION='10.10.42-contextguard2'"),'guarda: revisão serializada não está ativa');
assert(src.guard.includes('ensureWeeklyCheckinContext')&&src.guard.includes('ensureProtocolContext'),'guarda: sincronização canônica de relatório/ciclo ausente');
assert(src.guard.includes('fetchWeeklyCheckins')&&src.guard.includes('loadTrainerProtocolReview'),'guarda: deve reaproveitar os loaders canônicos');
assert(src.guard.includes('viewWeeklyCheckin=wrapped')&&src.guard.includes('markProtocolReviewCompleted=wrapped'),'guarda: ações canônicas precisam ser protegidas');
assert(src.guard.includes('if(protocolLoad)')&&src.guard.includes('await protocolLoad'),'guarda: troca de aluno precisa aguardar a mutação global anterior antes de iniciar outro protocolo');
assert(src.guard.includes('generation++'),'guarda: logout deve invalidar respostas assíncronas pendentes');
assert(!/collection\(['"]weeklyCheckins['"]\)/.test(src.guard),'guarda: não deve reimplementar consulta de relatório; usar fetchWeeklyCheckins');

for(const text of ['Radar diário','Prioridades de hoje','Resumo semanal','SEMÁFORO OPERACIONAL','PRÓXIMA AÇÃO'])assert(src.command.includes(text),`central: recurso ausente — ${text}`);
assert(src.command.includes('decorateStudentCards'),'central: semáforo da lista de alunos ausente');
assert(src.command.includes('deepAnalyze'),'central: análise profunda sob demanda ausente');
assert(src.command.includes('replaceStudentSlice'),'central: reanálise deve substituir os dados atuais do aluno em vez de reutilizar snapshot antigo');
assert(src.command.includes('row.checkinSchedule=deep.checkinSchedule')&&src.command.includes('row.protocolSchedule=deep.protocolSchedule'),'central: reanálise precisa atualizar agendas do aluno antes de recalcular sinais');
assert(src.command.includes("loading=false;serial++"),'central: logout durante carregamento precisa liberar o estado de loading');
assert(src.command.includes("button.textContent=deepByStudent.has(sid)?'REANALISAR':'ANALISAR TREINO'"),'central: falha na análise profunda precisa restaurar o rótulo acionável do botão');
assert(!src.command.includes("collection('sessions')"),'central: UI não deve consultar sessões diretamente; usar camada de dados');

for(const text of ['LINHA DO TEMPO','COMPARAR','PRÓXIMAS AÇÕES','METAS','MODO REVISÃO'])assert(src.insights.includes(text),`insights: aba ausente — ${text}`);
assert(src.insights.includes('timelineEvents')&&src.insights.includes('comparison()'),'insights: timeline/comparador ausentes');
assert(src.insights.includes("modal.className='modal-backdrop'"),'insights: editor de metas precisa usar a estrutura visual canônica de modal');
assert(!src.insights.includes("modal.className='modal';"),'insights: classe antiga de modal invisível não pode retornar');
assert(src.insights.includes('loadingStudentId')&&src.insights.includes('studentId!==target'),'insights: troca rápida de aluno precisa invalidar a resposta assíncrona do aluno anterior');
assert(src.insights.includes("String(VIEW_STUDENT?.uid||'')!==target"),'insights: resposta profunda não pode ser aplicada a outro aluno atualmente aberto');
assert(src.insights.includes("loading=false;loadingStudentId='';serial++"),'insights: logout precisa limpar o carregamento pendente');
assert(src.insights.includes('cycleKey')&&src.insights.includes('cycleStartDate'),'insights: metas precisam ser vinculadas ao ciclo real em que foram definidas');
assert(src.insights.includes('trainingSessionCount')&&src.insights.includes('cycleSessions'),'insights: a meta de sessões do treinador precisa usar a mesma contagem de treinos reais exibida ao aluno');
assert(src.insights.includes("openFeedbackModal('protocol_update')"),'insights: revisão deve reutilizar feedback canônico');
assert(src.insights.includes('markProtocolReviewCompleted'),'insights: revisão deve reutilizar conclusão mensal canônica');
assert(src.insights.includes("collection('protocolReviewSchedules')")&&src.insights.includes('cycleGoals'),'insights: metas devem permanecer vinculadas ao ciclo oficial');
assert(!/collection\(['"](?:studentGoals|achievements|trainerRadar|riskScores)['"]\)/.test(src.insights+src.command+src.data+src.student),'suíte: não criar coleções paralelas para estado derivado');
assert(!src.insights.includes("collection('weeklyCheckins').doc")&&!src.insights.includes("collection('weeklyCheckins').add"),'insights: treinador não pode simular relatório semanal do aluno');

for(const text of ['Metas & Conquistas','Progressão registrada','4 semanas consistentes','8 semanas consistentes','Ciclo concluído'])assert(src.student.includes(text),`aluno: conquista/meta ausente — ${text}`);
assert(src.student.includes("collection('sessions')")&&src.student.includes("collection('weeklyCheckins')"),'aluno: progresso precisa derivar dos registros reais');
assert(src.student.includes('trainingSessionCount')&&src.student.includes('workoutSessionKey'),'aluno: conquistas de sessões precisam contar treino real, não um documento por exercício');
assert(src.student.includes('longestTrainingStreak'),'aluno: consistência deve usar o maior marco histórico para não bloquear conquista já atingida');
assert(src.student.includes('hasHistoricalLoadProgress'),'aluno: progressão de carga precisa permanecer conquistada depois de um pico histórico');
assert(src.student.includes('protocolState')&&src.student.includes('status.nextCycle'),'aluno: ciclo exibido precisa seguir a mesma regra canônica usada pelo treinador');
assert(src.student.includes('CACHE_TTL_MS=120000'),'aluno: reabrir a tela não deve baixar todo o histórico novamente dentro do TTL');
assert(src.student.includes("loading=false;loadingUid='';serial++"),'aluno: logout durante consulta precisa liberar o estado de loading');
assert(!/cloudWrite/.test(src.student),'aluno: tela de conquistas não pode usar cloudWrite');
assert(!/collection\([^\n]+\)\.(?:add|doc\([^\n]+\)\.(?:set|update|delete))\s*\(/.test(src.student),'aluno: tela de conquistas não pode gravar no Firestore');

console.log('APROVADO — auditoria da suíte de inteligência cobre cache-busting, modal de metas, corridas de troca de aluno/logout, reanálise fresca, ciclo canônico, sessões reais nos dois perfis e conquistas históricas permanentes; sem polling, coleções paralelas ou escrita pelo aluno.');
