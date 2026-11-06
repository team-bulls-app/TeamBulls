import fs from 'node:fs';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';

const fail=[];
const read=path=>fs.readFileSync(path,'utf8');
const assert=(ok,message)=>{if(!ok)fail.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);
const close=(a,b)=>Math.abs(Number(a)-Number(b))<1e-9;

const files={
  portions:'modules/diet-portion-presets-v10_10_9.js',
  calories:'modules/diet-live-calories-v10_10_11.js',
  custom:'modules/custom-food-calorie-bridge-v10_10_12.js',
  deficit:'modules/diet-live-deficit-v10_10_13.js',
  workspace:'modules/trainer-diet-workspace-v10_10_11.js'
};
for(const path of Object.values(files)){
  assert(fs.existsSync(path),`Arquivo ausente: ${path}`);
  if(fs.existsSync(path)){const syntax=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});assert(syntax.status===0,`${path} possui JavaScript inválido: ${String(syntax.stderr||'').trim()}`);}
}
const portions=read(files.portions),calories=read(files.calories),custom=read(files.custom),deficit=read(files.deficit),workspace=read(files.workspace);

has(portions,"const VERSION='10.10.13-portions2'",'Tabela canônica não está na revisão nova.');
has(portions,"group:'vegetais',label:'120g Vegetais'",'120g Vegetais não é canônico na tabela-base.');
has(portions,"label:'120g Tomate'",'Compatibilidade de leitura com dietas antigas de Tomate foi removida.');
has(portions,'hidden:true','Alias legado de Tomate deve ser invisível na tabela de prescrição.');
has(portions,'function setCustomItems(items)','Registro canônico não aceita alimentos personalizados.');
has(portions,'get presets(){return presetSnapshot();}','Presets públicos devem ser snapshots, impedindo mutação externa da fonte canônica.');
has(portions,'const PRESETS=[...BASE_PRESETS,...LEGACY_ALIASES]','Fonte canônica não separa base, aliases e personalizados.');
lacks(portions,"group:'tomate',label:'120g Tomate'",'Tomate ainda está sendo usado como item canônico/visível.');

has(custom,"const VERSION='10.10.13-customfood5'",'Sincronização dos alimentos personalizados não está na revisão estrutural.');
has(custom,"db.collection(COLLECTION).doc(uid)",'Catálogo persistido do treinador não é carregado.');
has(custom,"typeof api?.setCustomItems!=='function'",'Sincronização não usa o registro canônico da tabela.');
has(custom,'api.setCustomItems(cached)','Alimentos personalizados não são entregues ao registro canônico.');
has(custom,'window.TeamBullsDietLiveCalories?.refresh?.()','Macros não recalculam após sincronizar o catálogo.');
lacks(custom,'presets.splice(','Ponte ainda está tentando alterar presets diretamente.');
lacks(custom,'ensureMutablePortionApi','Correção antiga por substituição superficial da API ainda está ativa.');

has(calories,'function analyze(text)','Analisador de kcal/macros foi removido.');
has(calories,'Math.round(protein*4+carbs*4+fat*9)','Regra energética 4/4/9 foi alterada.');
has(workspace,'dietTotalWithDraft()','Workspace não inclui a refeição em edição no total ao vivo.');
has(deficit,"const VERSION='10.10.13-deficit2'",'Módulo de déficit ao vivo ausente.');
has(deficit,'balanceKcal:e.get-total.kcal','Déficit não é calculado como GET menos kcal da divisão ativa.');
has(deficit,"mode==='surplus'?'SUPERÁVIT'",'Interface não diferencia déficit e superávit.');
has(deficit,'currentDietVariant','Déficit não acompanha a divisão ativa da dieta.');
has(deficit,'trainingDayEnergy','Meta de dia de treino não é reconhecida.');
has(deficit,'restDayEnergy','Meta de dia sem treino não é reconhecida.');
has(deficit,"document.getElementById('input-meal-items')",'Déficit não acompanha a refeição ainda não salva.');

// Segunda revisão: executa tabela canônica + macros + déficit em runtime simulado.
try{
  const noop=()=>{};
  const nodes=new Map();
  const bodyNode={querySelector(){return null;},appendChild(){}};
  const document={
    readyState:'complete',head:{appendChild(){}},body:bodyNode,
    getElementById(id){return nodes.get(id)||null;},querySelectorAll(){return[];},addEventListener(){},
    createElement(){return{style:{},dataset:{},appendChild(){},remove(){},insertAdjacentElement(){},querySelector(){return null;},querySelectorAll(){return[];},addEventListener(){},setAttribute(){}};}
  };
  const window={addEventListener(){},dispatchEvent(){}};window.window=window;
  const context={window,document,console,Intl,Map,Set,Object,Array,String,Number,Math,Promise,Event:function(){},MutationObserver:function(){this.observe=noop;},navigator:{},requestAnimationFrame:fn=>{fn();return 1;},cancelAnimationFrame:noop,setTimeout,clearTimeout,MEAL_CTX:{canEditContent:false},MEAL_PLAN_CACHE:{meals:[]}};
  vm.runInNewContext(portions,context,{filename:files.portions});
  const registry=window.TeamBullsDietPortions;
  assert(registry&&typeof registry.setCustomItems==='function','API canônica TeamBullsDietPortions não foi criada.');
  registry.setCustomItems([
    {id:'milk',label:'200ml de Leite integral',protein:6.2,carbs:0,fat:9.2},
    {id:'veg-custom',label:'90g de Vegetais personalizados',protein:0,carbs:2.5,fat:0}
  ]);
  const snapA=registry.presets,snapB=registry.presets;
  assert(snapA!==snapB,'presets deve devolver snapshots independentes para bloquear mutações externas.');
  snapA.splice(0,snapA.length);
  assert(registry.presets.length>0,'Mutação externa de presets corrompeu o registro canônico.');
  assert(registry.presets.some(item=>item.label==='200ml de Leite integral'),'Alimento personalizado não entrou no registro canônico.');
  assert(registry.presets.some(item=>item.label==='120g Vegetais'),'Vegetais canônicos ausentes.');
  assert(registry.presets.some(item=>item.label==='120g Tomate'&&item.hidden===true),'Alias antigo de Tomate ausente.');

  vm.runInNewContext(calories,context,{filename:files.calories});
  const live=window.TeamBullsDietLiveCalories;assert(live&&typeof live.analyze==='function','API de cálculo ao vivo não foi criada.');
  if(live){
    const current=live.analyze('200ml de Leite integral\n120g Vegetais');
    assert(current.matched===2&&current.unknown===0,'Leite personalizado + Vegetais não foram reconhecidos juntos.');
    assert(current.kcal===121&&close(current.protein,6.2)&&close(current.carbs,3.3)&&close(current.fat,9.2),'Leite personalizado + 120g Vegetais não totaliza 121 kcal / P6,2 C3,3 G9,2.');
    const old=live.analyze('120g Tomate');
    assert(old.matched===1&&old.unknown===0&&old.kcal===13,'Dieta antiga com 120g Tomate deixou de calcular.');
  }

  const plan={id:'diet-a',name:'Dieta A',energySummary:{totalExpenditure:2500,trainingDayEnergy:2200,restDayEnergy:2000},variants:[{id:'train',name:'Dia de treino'},{id:'rest',name:'Dia sem treino'}]};
  context.CURRENT_USER={uid:'trainer-1',role:'trainer'};
  context.DIET_DOCUMENT={plans:[plan]};context.CURRENT_DIET_ID='diet-a';context.CURRENT_DIET_VARIANT_ID='train';
  context.currentDiet=()=>plan;context.currentDietVariant=()=>plan.variants.find(item=>item.id===context.CURRENT_DIET_VARIANT_ID);
  context.MEAL_PLAN_CACHE={meals:[{id:'m1',items:'1 Porção de Gordura'}]};
  vm.runInNewContext(deficit,context,{filename:files.deficit});
  const deficitApi=window.TeamBullsDietLiveDeficit;assert(deficitApi&&typeof deficitApi.calculate==='function','API de déficit ao vivo não foi criada.');
  if(deficitApi){
    const training=deficitApi.calculate();
    assert(training.variantName==='Dia de treino'&&training.target===2200,'Dia de treino não usa o VET de treino correspondente.');
    assert(training.kcal===72&&training.get===2500&&training.balanceKcal===2428,'Déficit de treino não usa GET − kcal da divisão ativa.');
    context.CURRENT_DIET_VARIANT_ID='rest';context.MEAL_PLAN_CACHE={meals:[{id:'m2',items:'2 Porção de Gordura'}]};
    const rest=deficitApi.calculate();
    assert(rest.variantName==='Dia sem treino'&&rest.target===2000,'Dia sem treino não usa o VET de descanso correspondente.');
    assert(rest.kcal===144&&rest.get===2500&&rest.balanceKcal===2356,'Déficit de descanso não acompanha as calorias da dieta ativa.');
    assert(rest.balanceKcal!==training.balanceKcal,'Déficit ficou estático ao trocar para outra divisão com calorias diferentes.');
  }
}catch(error){fail.push('Falha no teste integrado tabela → personalizado → kcal/macros → déficit: '+error.stack);}

if(fail.length){console.error('FALHA — integridade profunda da dieta\n- '+fail.join('\n- '));process.exit(1);}
console.log('APROVADO — duas revisões: Vegetais canônico, alimento personalizado, compatibilidade antiga e déficit treino/descanso executados em runtime.');
