import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const config=read('config_v10_7.js');

function assert(condition,message){
  if(!condition){
    console.error('FALHA:',message);
    process.exitCode=1;
  }
}

assert(config.includes("const PRELOAD_WINDOW=8;"),'Runtime deve manter janela de preload progressiva.');
assert(config.includes("const DEFERRED_YIELD_EVERY=4;"),'Runtime deve ceder a UI em lotes, não após cada módulo.');
assert(config.includes("const STUDENT_YIELD_EVERY=2;"),'Runtime prioritário do aluno deve ceder a UI em lotes curtos.');

const criticalMatch=config.match(/const criticalModules=\[([^\]]*)\];/s);
assert(criticalMatch,'Lista de módulos críticos não encontrada.');
if(criticalMatch){
  assert(criticalMatch[1].includes('security-hardening-v10_10_9.js'),'Security hardening deve continuar crítico.');
  assert(!criticalMatch[1].includes('destructive-actions-supply-fix'),'Correções destrutivas/suprimentos não devem bloquear autenticação/entrada.');
}

const modulesMatch=config.match(/const modules=\[\s*([^\n]+)/);
assert(modulesMatch&&modulesMatch[1].includes('destructive-actions-supply-fix-v10_10_29.js'),'Correção de dieta/sessões deve continuar carregando logo após a sessão, sem virar módulo crítico.');

assert(config.includes("const yieldUi=()=>new Promise(resolve=>{"),'Yield explícito da UI deve existir.');
const yieldBlock=config.match(/const yieldUi=\(\)=>new Promise\(resolve=>\{([\s\S]*?)\n  \}\);/);
assert(yieldBlock,'Bloco yieldUi não encontrado.');
if(yieldBlock){
  assert(yieldBlock[1].includes('requestAnimationFrame'),'Yield deve devolver um frame ao navegador.');
  assert(!yieldBlock[1].includes('requestIdleCallback'),'Yield por módulo não pode esperar idle callback de até centenas de ms.');
}

assert(config.includes('for(const src of modules)await loadScript(src);'),'Execução dos módulos deve continuar estritamente sequencial.');
assert(config.includes('preloadAhead(deferredEligible,index+1);'),'Loader deve adiantar downloads enquanto preserva a execução sequencial.');
assert(config.includes('deferredBatchCount%4===0'),'Módulos adiados devem continuar devolvendo tempo de pintura a cada 4 cargas.');
assert(!config.includes("for(const src of modules)await loadScript(src).then(()=>yieldUi())"),'Loader antigo serial + idle após cada módulo não pode voltar.');
assert(config.includes('requestAnimationFrame(()=>setTimeout(queue,60));'),'Carga pós-sessão deve iniciar logo após o primeiro frame, sem aguardar idle indefinidamente.');

assert(config.includes("MODULE_ROOT+'diet-live-calories-v10_10_11.js?v=10.10.11-dietcalories2'"),'Exclusão de módulo pesado no runtime do aluno deve manter URL canônica.');
assert(config.includes("version:'10.10.30-startup10'"),'Revisão de runtime leve deve estar identificada.');

if(process.exitCode){
  process.exit(process.exitCode);
}
console.log('APROVADO — startup reduz bloqueio crítico, sobrepõe downloads e elimina espera idle por módulo sem alterar ordem funcional.');
