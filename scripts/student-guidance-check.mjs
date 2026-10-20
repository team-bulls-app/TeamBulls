import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const fail=[];
const read=path=>fs.readFileSync(path,'utf8');
const assert=(condition,message)=>{if(!condition)fail.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

const modulePath='modules/student-guidance-v10_10_9-v2.js';
for(const path of [modulePath,'config_v10_7.js','sw.js','sw_47.js','version.json','app_v10_10_9_core.js','firebase/firestore_26_compacto.rules']){
  assert(fs.existsSync(path),`Arquivo obrigatório ausente: ${path}`);
}
if(fail.length){console.error(fail.join('\n'));process.exit(1);}

const guidance=read(modulePath);
const config=read('config_v10_7.js');
const sw=read('sw.js');
const bridge=read('sw_47.js');
const core=read('app_v10_10_9_core.js');
const firestore=read('firebase/firestore_26_compacto.rules');
const publicVersion=JSON.parse(read('version.json')).version;

const syntax=spawnSync(process.execPath,['--check',modulePath],{encoding:'utf8'});
assert(syntax.status===0,`JavaScript inválido em ${modulePath}: ${syntax.stderr.trim()}`);
assert(publicVersion==='10.10.9','A versão pública mudou durante a revisão de orientações.');

// Loader e ordem de camadas.
const guidanceLoader='./modules/student-guidance-v10_10_9-v2.js?v=10.10.9-guidance2';
has(config,guidanceLoader,'Loader não inclui student-guidance guidance2.');
assert((config.match(/student-guidance-v10_10_9-v2\.js/g)||[]).length===1,'Student guidance deve ser carregado uma única vez.');
assert(config.indexOf('diet-delete-fix-v10_10_9.js')<config.indexOf('student-guidance-v10_10_9-v2.js'),'Student guidance precisa executar depois da correção de dieta.');
assert(config.indexOf('student-guidance-v10_10_9-v2.js')<config.indexOf('modal-stack-stability-v10_10_9.js'),'Estabilidade de modais deve permanecer por último.');

// Hidratação: compatibilidade, limites e persistência pelo documento já existente.
has(guidance,'function safeHydration(value){const n=Math.round(Number(value)||0);return Number.isFinite(n)?Math.max(0,Math.min(12000,n)):0;}','Limite seguro de hidratação 0–12000 ml foi alterado.');
has(guidance,'raw.hydrationMl??raw.waterMl??raw.dailyWaterMl','Aliases legados de hidratação não são preservados.');
has(guidance,'id="input-diet-hydration-ml" type="number" min="0" max="12000" step="100"','Campo de hidratação perdeu limites/step esperados.');
has(guidance,"if(typeof persistDietDocument==='function'&&!persistDietDocument.__tbHydrationV2)",'Hidratação não integra persistDietDocument.');
has(guidance,'if(pendingHydration)','Hidratação não é aplicada no momento controlado da persistência.');
has(guidance,"if(typeof saveDietPlan==='function'&&!saveDietPlan.__tbHydrationV2)",'Salvar dieta não captura a hidratação.');
lacks(guidance,"db.collection('mealPlans')",'Student guidance não deve criar uma rota Firestore paralela para a dieta.');

// Orientações nutricionais aparecem nos dois pontos sem alterar a fonte de dados do treinador.
for(const phrase of ['Pesar os alimentos já preparados','Priorizar alimentos frescos','Bebidas zero calorias à vontade','Priorize alimentos com bastante fibra'])has(guidance,phrase,`Orientação nutricional ausente: ${phrase}`);
has(guidance,'function guidanceCard(plan,trainer)','Bloco de orientações da Dieta ausente.');
has(guidance,'function renderStaticInstructions()','Bloco estático das Instruções Gerais ausente.');
has(guidance,'Alimentação · observações e orientações','Título das orientações alimentares ausente.');

// Alongamentos: 10 páginas lógicas e 15 posições; viewer permanece interno e leve.
const stretchStart=guidance.indexOf('const STRETCH_PAGES=['),stretchEnd=guidance.indexOf('];',stretchStart);
const stretchBlock=stretchStart>=0&&stretchEnd>stretchStart?guidance.slice(stretchStart,stretchEnd):'';
assert((stretchBlock.match(/\{title:/g)||[]).length===10,'Guia de alongamentos deve manter 10 páginas lógicas.');
for(let i=1;i<=15;i++)has(stretchBlock,`['${i} ·`,`Guia de alongamentos perdeu a posição ${i}.`);
has(guidance,'scroll-snap-type:x mandatory','Viewer de alongamentos perdeu navegação por swipe.');
has(guidance,"event.key==='Escape'",'Viewer de alongamentos perdeu fechamento por ESC.');
has(guidance,"event.key==='ArrowLeft'",'Viewer de alongamentos perdeu seta esquerda.');
has(guidance,"event.key==='ArrowRight'",'Viewer de alongamentos perdeu seta direita.');

// Confirmação: token por aluno + revisão, lock concorrente e liberação após leitura vazia/falha.
has(guidance,"const ACK_PREFIX='team_bulls_instruction_ack_v2_'",'Chave de confirmação v2 ausente.');
has(guidance,"String(GENERAL_INSTRUCTIONS?.revision||1)+'|'+STATIC_REVISION",'Token de confirmação não combina revisão dinâmica e estática.');
has(guidance,'markInstructionAcknowledged();forcedPromptToken=\'\';return base.apply(this,arguments);','Confirmação não é persistida antes de voltar ao fluxo base/Home.');
has(guidance,"typeof INSTRUCTIONS_PROMPT_RUNNING!=='undefined'&&INSTRUCTIONS_PROMPT_RUNNING",'Prompt não respeita o lock concorrente do núcleo.');
has(guidance,"INSTRUCTIONS_PROMPT_RUNNING=true",'Prompt não ativa o lock durante a leitura.');
has(guidance,"if(!visibleInstructionCount?.()||instructionAcknowledged()){forcedPromptToken='';return;}",'Leitura vazia/confirmada pode deixar token preso.');
has(guidance,"finally{if(typeof INSTRUCTIONS_PROMPT_RUNNING!=='undefined')INSTRUCTIONS_PROMPT_RUNNING=false;}",'Lock do prompt não é liberado em finally.');
const promptStart=guidance.indexOf("if(typeof maybePromptInitialInstructions==='function'");
const promptEnd=guidance.indexOf("if(typeof acknowledgeInstructions==='function'",promptStart);
const promptBlock=promptStart>=0&&promptEnd>promptStart?guidance.slice(promptStart,promptEnd):'';
assert(promptBlock.indexOf('await loadGeneralInstructions?.()')<promptBlock.indexOf('forcedPromptToken=token'),'Token do popup deve ser reservado somente depois de uma leitura válida.');

// Firebase: retry só para inicialização/leitura; nunca para escrita.
has(config,'ReCaptchaEnterpriseProvider','App Check Enterprise não está configurado no patch de compatibilidade.');
has(config,"if(typeof ensureFirebaseReady==='function'&&!ensureFirebaseReady.__tbRetry)",'Retry único de inicialização ausente.');
has(config,"if(typeof cloudGet==='function'&&!cloudGet.__tbRetry)",'Retry único de leitura ausente.');
lacks(config,"if(typeof cloudWrite==='function'&&!cloudWrite.__tbRetry)",'Escritas não podem receber retry automático.');
has(core,"function cloudWrite(task,label='gravação'){return withTimeout(task,CLOUD_WRITE_TIMEOUT_MS,label);}",'Contrato de escrita do núcleo mudou inesperadamente.');

// Regras: hydrationMl continua dentro do documento de mealPlans, sem exigir regra nova.
has(firestore,'match /mealPlans/{uid}','Regra de mealPlans ausente.');
has(firestore,"request.resource.data.get('plans', []) is list",'mealPlans deixou de aceitar lista de planos.');
has(firestore,"request.resource.data.get('meals', []) is list",'mealPlans deixou de validar refeições.');

// PWA: módulo ativo no shell e espelho sw_47 intacto.
has(sw,"const CACHE_REVISION='lighttheme7'",'Revisão de cache do tema claro ausente.');
const requiredStart=sw.indexOf('const REQUIRED_SHELL=['),requiredEnd=sw.indexOf('const OPTIONAL_SHELL=[');
const required=requiredStart>=0&&requiredEnd>requiredStart?sw.slice(requiredStart,requiredEnd):'';
has(required,guidanceLoader,'Shell offline não inclui student guidance.');
lacks(required,'student-guidance-v10_10_9.js?v=','Shell não deve carregar a implementação v1 obsoleta.');
assert(bridge.replace('ponte de migração para instalações controladas pelo antigo sw_47.js','Service Worker estável e atualização sem reinstalação')===sw,'sw_47.js divergiu do Service Worker principal.');

if(fail.length){
  console.error('\nStudent guidance regression check falhou:\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log('Student guidance regression check OK.');
