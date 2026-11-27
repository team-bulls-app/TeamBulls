import fs from 'node:fs';
import vm from 'node:vm';
import {source} from './session-variant-protocol-check.mjs';
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
const guidanceLoader='./modules/student-guidance-v10_10_9-v2.js?v=10.10.9-guidance6';
has(config,guidanceLoader,'Loader não inclui student-guidance guidance5.');
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

// Alimentação usa o mesmo editor e persistência transacional da biblioteca existente.
for(const phrase of ['Pesar os alimentos já preparados','Priorizar alimentos frescos','Bebidas zero calorias à vontade','Priorize alimentos com bastante fibra'])has(core,phrase,`Orientação nutricional ausente: ${phrase}`);
has(guidance,'function guidanceCard(plan,trainer)','Bloco de orientações da Dieta ausente.');
lacks(guidance,'function renderStaticInstructions()','Uma segunda cópia das orientações poderia reaparecer após edição.');
has(core,'Alimentação · observações e orientações','Título das orientações alimentares ausente.');

const fields={
  'input-instruction-item-folder':{value:'custom'},
  'input-instruction-item-title':{value:'Título revisado'},
  'input-instruction-item-text':{value:'Linha 1\nLinha 2 <exemplo>'},
  'input-instruction-item-video':{value:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'},
  'input-instruction-item-active':{value:'true'}
};
const context=vm.createContext({
  CURRENT_USER:{uid:'coach',role:'trainer'},
  EDIT_INSTRUCTION_FOLDER_ID:'nutrition',EDIT_INSTRUCTION_ITEM_ID:'nutrition-main',EDIT_TECHNIQUE_ID:'',
  CATALOG_EDITOR_CONTEXTS:{},DEFAULT_GENERAL_INSTRUCTIONS_TEXT:'Geral',DEFAULT_NUTRITION_INSTRUCTIONS_TEXT:'Orientação alimentar original',
  extractYouTubeId:()=>true,document:{getElementById:id=>fields[id]},beginAction:()=>true,endAction:()=>{},
  cacheGeneralInstructions:()=>{},renderInstructions:()=>{},closeModal:()=>{},showToast:()=>{},
  alert:message=>fail.push(message),
  safeEsc:text=>String(text).replaceAll('<','&lt;').replaceAll('>','&gt;'),
  instructionVideoAction:url=>url
});
const raw={revision:5,folders:[{id:'custom',name:'Pasta existente',items:[{id:'retained',title:'Orientação existente',text:'Preservar'}]}]};
let stored=raw;
context.persistSharedCatalog=async(collection,expected,next,normalize,owner)=>{
  assert(collection==='trainingInstructions'&&owner==='coach','A edição deve usar o catálogo existente do treinador.');
  assert(JSON.stringify(normalize(stored))===JSON.stringify(expected),'O editor deve preservar a verificação de concorrência com catálogos antigos.');
  stored=JSON.parse(JSON.stringify(next));
};
const editor=['defaultNutritionInstructionFolder','defaultGeneralInstructionsLibrary','normalizeInstructionFolder',
  'normalizeInstructionItem','normalizeGeneralInstructions','persistGeneralInstructions','commitCatalogAction',
  'saveInstructionItem','toggleInstructionItem'].map(source).join('\n');
const start=guidance.indexOf('  function nutritionHtml()'),end=guidance.indexOf('  function ensureStyles()',start);
assert(start>=0&&end>start,'A dieta deve renderizar as orientações do catálogo.');
vm.runInContext(editor+'\n'+guidance.slice(start,end),context);
context.GENERAL_INSTRUCTIONS=context.normalizeGeneralInstructions(raw);
const nutrition=context.GENERAL_INSTRUCTIONS.folders.find(folder=>folder.id==='nutrition');
assert(nutrition?.items[0]?.id==='nutrition-main'&&!nutrition.locked&&!nutrition.items[0].locked,'Catálogo antigo deve ganhar uma pasta e uma orientação editáveis.');
has(context.nutritionHtml(),'Orientação alimentar original','A dieta deve manter a orientação existente antes da primeira edição.');
assert(await context.saveInstructionItem(),'O treinador deve conseguir editar e mover a orientação para outra pasta.');
context.GENERAL_INSTRUCTIONS=context.normalizeGeneralInstructions(stored);
const moved=context.GENERAL_INSTRUCTIONS.folders.find(folder=>folder.id==='custom');
assert(moved.items[0].text==='Preservar'&&moved.items[1].id==='nutrition-main'&&stored.revision===6,'Salvar deve preservar páginas existentes, ordem e revisão.');
const html=context.nutritionHtml();
has(html,'Título revisado','A edição do título deve aparecer na dieta.');
has(html,'Linha 2 &lt;exemplo&gt;','A edição do texto deve aparecer como texto na dieta.');
has(html,fields['input-instruction-item-video'].value,'O vídeo deve aparecer na dieta.');
assert(await context.toggleInstructionItem('custom','nutrition-main'),'O treinador deve poder ocultar a orientação.');
assert(context.nutritionHtml()==='','Ocultar a orientação deve removê-la da dieta do aluno.');
context.CURRENT_USER={uid:'student',role:'student'};
assert(await context.saveInstructionItem()===false,'Alunos não podem alterar o catálogo.');
stored.folders=stored.folders.filter(folder=>folder.id!=='nutrition');
stored.folders.find(folder=>folder.id==='custom').items.pop();
const afterDelete=context.normalizeGeneralInstructions(stored);
assert(!afterDelete.folders.some(folder=>folder.id==='nutrition'),'Excluir a orientação e a pasta não deve repor o conteúdo padrão ao recarregar.');

// Alongamentos: 10 páginas lógicas e 15 posições; viewer permanece interno e leve.
const stretchStart=guidance.indexOf('const STRETCH_PAGES=['),stretchEnd=guidance.indexOf('];',stretchStart);
const stretchBlock=stretchStart>=0&&stretchEnd>stretchStart?guidance.slice(stretchStart,stretchEnd):'';
assert((stretchBlock.match(/\{title:/g)||[]).length===10,'Guia de alongamentos deve manter 10 páginas lógicas.');
for(let i=1;i<=15;i++)has(stretchBlock,`['${i} ·`,`Guia de alongamentos perdeu a posição ${i}.`);
has(guidance,'scroll-snap-type:x mandatory','Viewer de alongamentos perdeu navegação por swipe.');
has(guidance,"event.key==='Escape'",'Viewer de alongamentos perdeu fechamento por ESC.');
has(guidance,"event.key==='ArrowLeft'",'Viewer de alongamentos perdeu seta esquerda.');
has(guidance,"event.key==='ArrowRight'",'Viewer de alongamentos perdeu seta direita.');

has(guidance,"const VERSION='10.10.9-guidance6'",'Camada ativa de orientações não está na revisão de navegação segura.');
has(guidance,"NAVIGATION_SEQ!==navigation",'Aviso automático perdeu validação de navegação.');
has(guidance,"instructionIdentity()!==uid",'Aviso automático perdeu validação de aluno.');
has(guidance,"result===false&&token&&forcedPromptToken===token",'Abertura cancelada pode bloquear o aviso permanentemente.');
has(read('update_v10_10_9.js'),guidanceLoader,'Atualizador não aquece a camada ativa de orientações.');
// Confirmação: token por aluno + revisão, lock concorrente e liberação após leitura vazia/falha.
has(guidance,"const ACK_PREFIX='team_bulls_instruction_ack_v2_'",'Chave de confirmação v2 ausente.');
has(guidance,"String(GENERAL_INSTRUCTIONS?.revision||1)+'|'+STATIC_REVISION",'Token de confirmação não combina revisão dinâmica e estática.');
has(guidance,'markInstructionAcknowledged();forcedPromptToken=\'\';return base.apply(this,arguments);','Confirmação não é persistida antes de voltar ao fluxo base/Home.');
has(guidance,"typeof INSTRUCTIONS_PROMPT_RUNNING!=='undefined'&&INSTRUCTIONS_PROMPT_RUNNING",'Prompt não respeita o lock concorrente do núcleo.');
has(guidance,"INSTRUCTIONS_PROMPT_RUNNING=true",'Prompt não ativa o lock durante a leitura.');
has(guidance,"if(!visibleInstructionCount?.()||instructionAcknowledged()){forcedPromptToken='';return false;}",'Leitura vazia/confirmada pode deixar token preso.');
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
has(core,"function cloudWrite(task,label='gravação'){",'Contrato de escrita do núcleo mudou inesperadamente.');
has(core,'return withTimeout(task,CLOUD_WRITE_TIMEOUT_MS,label).catch(error=>{preserveActiveModalAfterFirestoreFailure(error);throw error;});','A gravação deve preservar o rascunho em falha fatal e relançar o erro sem retry.');

// Regras: hydrationMl continua dentro do documento de mealPlans, sem exigir regra nova.
has(firestore,'match /mealPlans/{uid}','Regra de mealPlans ausente.');
has(firestore,"request.resource.data.get('plans', []) is list",'mealPlans deixou de aceitar lista de planos.');
has(firestore,"request.resource.data.get('meals', []) is list",'mealPlans deixou de validar refeições.');

// PWA: módulo ativo no shell e espelho sw_47 intacto.
has(sw,"const CACHE_REVISION='studentaccess1'",'Revisão atual de cache do tema claro ausente.');
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
