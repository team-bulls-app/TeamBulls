import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const fail=[];
const assert=(ok,message)=>{if(!ok)fail.push(message);};
const read=file=>fs.readFileSync(file,'utf8');
const modulePath='modules/student-diet-compact-live-v10_10_23.js';
const moduleCode=read(modulePath);
const config=read('config_v10_7.js');
const update=read('update_v10_10_9.js');
const sw=read('sw.js');
const version=JSON.parse(read('version.json'));

for(const file of [modulePath,'config_v10_7.js','update_v10_10_9.js']){
  const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert(syntax.status===0,`${file} possui JavaScript inválido: ${String(syntax.stderr||'').trim()}`);
}

const src='./modules/student-diet-compact-live-v10_10_23.js?v=10.10.23-dietcompact1';
assert(config.includes(src),'Módulo compacto da dieta não está no runtime prioritário do aluno.');
assert(config.indexOf(src)<config.indexOf('./modules/student-hotbar-payments-v10_10_22.js'),'Dieta compacta deve entrar antes dos recursos secundários da hotbar.');
assert(sw.includes(src),'Service Worker não aquece o módulo compacto da dieta.');
assert(update.includes('STUDENT_DIET_COMPACT_MODULE'),'Atualizador não inclui o módulo compacto no refresh crítico.');

assert(moduleCode.includes("const VERSION='10.10.23-dietcompact1';"),'Versão do módulo compacto divergiu.');
assert(moduleCode.includes('#screen-diet-detail #diet-cycle-summary'),'Datas não estão estritamente limitadas à tela de dieta do aluno.');
assert(moduleCode.includes('grid-template-columns:repeat(3,minmax(0,1fr))'),'Datas/calorias perderam o alinhamento em três colunas.');
assert(moduleCode.includes('#screen-diet-detail #diet-energy-summary .diet-energy-card-head{display:none!important}'),'Cabeçalho grande da tabela calórica reapareceu.');
assert(moduleCode.includes('min-height:54px!important'),'Métricas calóricas voltaram a ocupar altura excessiva.');
assert(moduleCode.includes("if(index===0)setTextIfChanged(metric.querySelector(':scope > span'),'GET');"),'O gasto energético total perdeu o rótulo compacto.');
assert(!moduleCode.includes("const labels=['GET','DIA DE TREINO','DIA SEM TREINO'];"),'Nomes das divisões da dieta são substituídos por rótulos fixos.');
assert(moduleCode.includes("setTextIfChanged(card.querySelector('.tb-guidance-head strong'),'ÁGUA')"),'Água não recebe o rótulo compacto.');
assert(moduleCode.includes('.tb-hydration-note{display:none!important}'),'Texto redundante da hidratação voltou a poluir a tela.');
assert(moduleCode.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'),'Ações de orientações não permanecem compactas lado a lado.');
assert(moduleCode.includes('.tb-nutrition-details'),'Observações/orientações deixaram de permanecer acessíveis.');
assert(!moduleCode.includes('#screen-ts-diet-detail'),'Estilo compacto não pode afetar a tela de dieta do treinador.');

assert(moduleCode.includes("db.collection('mealPlans').doc(nextUid).onSnapshot"),'Dieta do aluno não possui sincronização em tempo real.');
assert(moduleCode.includes("currentUser()?.role==='student'"),'Listener da dieta não está restrito ao aluno.');
assert(moduleCode.includes("coreMode()==='cloud'"),'Listener da dieta não está restrito à sessão cloud.');
assert(moduleCode.includes('cacheOwnDietDocument'),'Atualização em tempo real não renova o cache local da própria dieta.');
assert(!/db\.collection\('mealPlans'\)[\s\S]{0,180}\.(?:set|update|delete)\(/.test(moduleCode),'Módulo do aluno ganhou escrita indevida em mealPlans.');
assert(moduleCode.includes("document.querySelector('#screen-diet-detail .content')"),'Observer não está limitado ao conteúdo da dieta.');
assert(moduleCode.includes('observer.observe(host,{childList:true,subtree:true})'),'Observer da dieta perdeu a sincronização dinâmica esperada.');
assert(moduleCode.includes('function setTextIfChanged'),'Patch dinâmico não protege contra ciclos de MutationObserver.');
assert(!moduleCode.includes('observer.observe(document.body,{childList:true,subtree:true})'),'Observer global pesado foi introduzido.');
assert(!moduleCode.includes('setInterval('),'Módulo da dieta não deve duplicar o timer do atualizador principal.');

assert(update.includes('const CHECK_INTERVAL_MS=2*60*1000;'),'Atualizador principal voltou a uma janela maior que dois minutos.');
assert(!update.includes("applyLatestUpdate({automatic:true})"),'Atualizador não pode forçar hotfix/reload automático.');
assert(Number(version.build)>=2026090103,'version.json regrediu para antes da build que publicou a dieta compacta.');

if(fail.length){
  console.error('FALHA — dieta compacta/live do aluno\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log('Dieta compacta/live OK — datas, calorias e água compactas; listener somente leitura; update em 2 min.');
