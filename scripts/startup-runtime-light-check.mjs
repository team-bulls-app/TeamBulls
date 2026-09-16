import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const config=read('config_v10_7.js');
const stability=read('modules/stability_v10_10_9.js');

function assert(condition,message){
  if(!condition){
    console.error('FALHA:',message);
    process.exitCode=1;
  }
}

assert(config.includes("const PRELOAD_WINDOW=3;"),'Runtime deve limitar a janela de preload para não disputar banda no celular.');
assert(config.includes("const DEFERRED_YIELD_EVERY=2;"),'Runtime deve ceder a UI em lotes curtos durante a carga pesada.');
assert(config.includes("const STUDENT_YIELD_EVERY=2;"),'Runtime prioritário do aluno deve ceder a UI em lotes curtos.');

const criticalMatch=config.match(/const criticalModules=\[([^\]]*)\];/s);
assert(criticalMatch,'Lista de módulos críticos não encontrada.');
if(criticalMatch){
  const critical=criticalMatch[1];
  const stabilityPos=critical.indexOf('stability_v10_10_9.js');
  const securityPos=critical.indexOf('security-hardening-v10_10_9.js');
  assert(stabilityPos>=0,'Proteção do primeiro relatório semanal deve ser módulo crítico.');
  assert(stabilityPos>=0&&securityPos>=0&&stabilityPos<securityPos,'Proteção do relatório semanal deve carregar antes dos demais módulos críticos e antes de liberar a interface da sessão.');
  assert(critical.includes('security-hardening-v10_10_9.js'),'Security hardening deve continuar crítico.');
  assert(critical.includes('exercise-video-resilience-v10_10_45.js'),'Resiliência de vídeo deve estar pronta antes do uso dos exercícios.');
  assert(!critical.includes('destructive-actions-supply-fix'),'Correções destrutivas/suprimentos não devem bloquear autenticação/entrada.');
}

assert(stability.includes("where('studentId','==',studentUid).where('requestKey','==',request.requestKey).limit(1)"),'Primeiro envio semanal deve verificar duplicidade por consulta autorizada do próprio aluno, sem get direto em documento inexistente.');
assert(!stability.includes("existingCheckin=await cloudGet(checkinRef,'verificar relatório')"),'Patch crítico não pode voltar ao get direto de weeklyCheckins/{id} antes da criação.');

const modulesMatch=config.match(/const modules=\[\s*([^\n]+)/);
assert(modulesMatch&&modulesMatch[1].includes('destructive-actions-supply-fix-v10_10_29.js'),'Correção de dieta/sessões deve continuar carregando após a sessão, sem virar módulo crítico.');

assert(config.includes("const yieldUi=()=>new Promise(resolve=>{"),'Yield explícito da UI deve existir.');
const yieldBlock=config.match(/const yieldUi=\(\)=>new Promise\(resolve=>\{([\s\S]*?)\n  \}\);/);
assert(yieldBlock,'Bloco yieldUi não encontrado.');
if(yieldBlock){
  assert(yieldBlock[1].includes('requestAnimationFrame'),'Yield deve devolver um frame ao navegador.');
  assert(!yieldBlock[1].includes('requestIdleCallback'),'Yield por módulo não pode esperar idle callback indefinidamente.');
}

assert(config.includes('for(const src of modules)await loadScript(src);'),'Execução dos módulos deve continuar estritamente sequencial.');
assert(config.includes('preloadAhead(deferredEligible,index+1);'),'Loader deve adiantar poucos downloads enquanto preserva a execução sequencial.');
assert(config.includes('deferredBatchCount%DEFERRED_YIELD_EVERY===0'),'Módulos adiados devem usar a constante de lotes curtos para devolver tempo de pintura.');
assert(config.includes('preloadModules(studentPriorityModules.slice(0,PRELOAD_WINDOW));'),'Runtime do aluno não pode pré-carregar todos os módulos prioritários de uma vez.');
assert(!config.includes('preloadModules(studentPriorityModules);'),'Pré-carga irrestrita de todos os módulos prioritários não pode voltar.');
assert(!config.includes("for(const src of modules)await loadScript(src).then(()=>yieldUi())"),'Loader antigo serial + idle após cada módulo não pode voltar.');
assert(config.includes('requestAnimationFrame(()=>setTimeout(queue,240));'),'Carga pós-sessão deve respeitar a primeira pintura e evitar contenção imediata com a Home.');

assert(config.includes("MODULE_ROOT+'diet-live-calories-v10_10_11.js?v=10.10.11-dietcalories2'"),'Exclusão de módulo pesado no runtime do aluno deve manter URL canônica.');
assert(config.includes("version:'10.10.45-startup11'"),'Revisão do runtime de baixa contenção deve estar identificada.');

// Entrada/login: Firebase deve começar a aquecer antes do toque e os wrappers
// não podem alongar artificialmente as esperas originais do core.
assert(config.includes("version:'10.10.56-authwarm1'"),'Warmup de autenticação não está versionado.');
assert(config.includes('const installAndWarm=()=>{const ok=patch();if(ok)setTimeout(()=>warmFirebase(),0);return ok;}'),'Firebase não é pré-aquecido assim que o bootstrap fica disponível.');
assert(config.includes("else if(label==='login')limit=Math.min(limit,12000);"),'Login voltou a ser alongado além do limite original do core.');
assert(config.includes("if(label==='carregar conexão segura')limit=Math.min(limit,10000);"),'Carga inicial do Firebase pode voltar a ficar presa por timeout excessivo.');
assert(config.includes("else if(label==='App Check')limit=Math.min(limit,2500);"),'App Check voltou a bloquear a entrada por tempo excessivo.');
assert(!config.includes("limit=Math.max(limit,16000)"),'Regressão: login não pode voltar ao mínimo artificial de 16 segundos.');
assert(!config.includes("limit=Math.max(limit,12000)"),'Regressão: conexão segura não pode ser artificialmente estendida para 12 segundos.');
assert(config.includes("withTimeout(ensureFirebaseCore(),3500,'retomar conexão segura')"),'Retry do Firebase precisa ser curto e limitado.');
assert(config.includes('__tbLocalPersistenceFast101056'),'Persistência LOCAL repetida não está protegida contra trabalho redundante.');
assert(config.includes("btn.textContent='VALIDANDO CONEXÃO...'"),'Login lento precisa informar progresso sem parecer travado.');
assert(config.includes("btn.textContent='CONEXÃO LENTA...'"),'Login muito lento precisa informar a condição real ao usuário.');

if(process.exitCode){
  process.exit(process.exitCode);
}
console.log('APROVADO — startup limita preloads concorrentes, preserva ordem funcional, protege o primeiro envio semanal, pré-aquece Firebase e evita esperas artificiais no login.');
await import('./foreground-write-resilience-check.mjs');
