import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import strict from 'node:assert/strict';

const root=process.cwd();
const failures=[];
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const exists=rel=>fs.existsSync(path.join(root,rel));
const assert=(condition,message)=>{if(!condition)failures.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);

const modulePath='modules/diet-copy-v10_10_28.js';
assert(exists(modulePath),'Módulo de cópia de dieta ausente.');
if(failures.length){console.error('\nFalhas da cópia de dieta:\n- '+failures.join('\n- '));process.exit(1);}

const source=read(modulePath),config=read('config_v10_7.js'),quality=read('.github/workflows/quality.yml'),rules=read('firebase/firestore_28_compacto.rules');

has(source,"const MAX_PLANS=40",'Cópia não respeita o limite de dietas aceito pelas regras.');
has(source,"copy.isActive=false",'A cópia pode substituir a dieta ativa do aluno.');
has(source,"copy.id=nextId()",'A dieta copiada não recebe um ID novo.');
has(source,"copy.id=nextId('variant')",'As divisões copiadas não recebem IDs novos.');
has(source,"copy.id=nextId('meal')",'As refeições copiadas não recebem IDs novos.');
has(source,"copy.doneDates=[]",'A cópia carrega marcações históricas de refeições concluídas.');
has(source,"id:nextId('diet-item')",'Itens auxiliares/suplementos da cópia não recebem IDs novos.');
has(source,"copy.variants[0].meals",'A cópia não mantém a relação canônica entre dieta e primeira divisão.');
has(source,"await persistDietDocument()",'Cópia não usa a persistência canônica da dieta.');
has(source,"DIET_DOCUMENT=typeof normalizeDietDocument==='function'?normalizeDietDocument(snapshot):snapshot",'Rollback da cópia não restaura o documento em caso de falha.');
has(source,"openEditDietModal(saved.id)",'A cópia não abre automaticamente para modificação.');
has(source,"⧉ DUPLICAR",'A ação de duplicar não está exposta na lista de dietas do treinador.');
has(source,"política de refeição livre e valores energéticos serão copiados",'A confirmação não deixa claro o escopo da cópia.');
assert(!source.includes("activateDietPlan(saved.id)")&&!source.includes("v104SyncCycleSchedule"),'A duplicação pode ativar ou realinhar o ciclo da cópia automaticamente.');

has(config,"./modules/diet-copy-v10_10_28.js?v=10.10.28-dietcopy2",'Loader não entrega a cópia de dieta com cache-busting próprio.');
has(config,"MODULE_ROOT+'diet-copy-v10_10_28.js?v=10.10.28-dietcopy2'",'Módulo de cópia não está restrito ao runtime do treinador.');
has(quality,'node scripts/diet-copy-check.mjs','Regressão da cópia de dieta não está na suíte de qualidade.');
has(rules,"request.resource.data.get('plans', []).size() <= 40",'Teste espera limite de 40 dietas nas regras ativas.');

if(failures.length){
  console.error('\nFalhas da cópia de dieta:\n- '+failures.join('\n- '));
  process.exit(1);
}

function dayCopyEnvironment(){
  const fields=new Map(['tb-diet-copy-style','modal-diet-variant-copy','diet-copy-source','diet-copy-target','diet-copy-name','diet-copy-name-wrap'].map(id=>[id,{value:'',hidden:false,children:[],
    replaceChildren(){this.children=[];this.value='';},appendChild(option){this.children.push(option);if(this.children.length===1)this.value=option.value;}}]));
  const documentData={plans:[{id:'p',name:'Plano',isActive:true,energySummary:{variantEnergy:{training:2400,rest:1900}},
    variants:[{id:'training',name:'Dia de treino',daysPerWeek:5,weekdays:[1,2,3,4,5],dayType:'training',workoutDays:[{workoutId:'w',workoutDayId:'d'}],order:0,
      meals:[{id:'m1',name:'Café',time:'08:00',items:'2 porções de carbo; 1 de proteína',notes:'Orientação',doneDates:['2026-11-16']},{id:'m2',name:'Almoço',time:'12:00',items:'Arroz 100 g',doneDates:[]}]},
      {id:'rest',name:'Dia sem treino',daysPerWeek:2,weekdays:[0,6],dayType:'rest',restDaysPerWeek:2,order:1,meals:[]}],
    meals:[]}]};
  documentData.plans[0].meals=documentData.plans[0].variants[0].meals;
  let ids=0,failed=false,held=null,confirmation=null;
  const locks=new Set(),writes=[],alerts=[],opened=[],closed=[];
  const ctx={CURRENT_USER:{uid:'coach',role:'trainer'},AUTH_STATE_REVISION:1,DIET_CONTEXT:{targetUid:'student',trainer:true,local:false},DIET_DOCUMENT:documentData,
    CURRENT_DIET_ID:'p',CURRENT_DIET_VARIANT_ID:'training',DIET_SECTION_DEFS:[],window:{addEventListener(){}},console:{error(){},warn(){}},
    document:{getElementById:id=>fields.get(id)||null,createElement:()=>({}),addEventListener(){}},
    uid:()=> 'copy-'+(++ids),dietCanEdit:()=>true,normalizeDietDocument:value=>structuredClone(value),normalizeDietVariant:value=>structuredClone(value),
    beginAction:key=>{if(locks.has(key))return false;locks.add(key);return true;},endAction:key=>locks.delete(key),
    showToast(){},alert:value=>alerts.push(value),cloudWriteError:error=>error.message,
    openModal:id=>opened.push(id),closeModal:id=>closed.push(id),openEditDietVariantModal:id=>opened.push(id),
    renderDietVariantTabs(){},v104ActivateVariantMeals(){},
    showConfirm:(title,text,cb)=>{confirmation={title,text,cb};},
    persistDietDocumentDraft:async(draft,context)=>{if(held)await held;if(failed)throw new Error('offline');writes.push({draft:structuredClone(draft),context:structuredClone(context)});return structuredClone(draft);}
  };
  vm.createContext(ctx);vm.runInContext(source,ctx);
  return{ctx,fields,locks,writes,alerts,opened,closed,api:ctx.window.TeamBullsDietCopy,
    target:id=>fields.get('diet-copy-target').value=id,setFailure:value=>failed=value,setHold:value=>held=value,confirmation:()=>confirmation};
}
{
  const e=dayCopyEnvironment(),before=structuredClone(e.ctx.DIET_DOCUMENT);
  strict.equal(e.api.openVariantCopy('training'),true);
  strict.equal(await e.api.confirmVariantCopy(),true);
  const plan=e.ctx.DIET_DOCUMENT.plans[0],original=before.plans[0],target=plan.variants[1];
  strict.deepEqual(plan.variants[0],original.variants[0]);
  strict.deepEqual({...target,meals:[]},original.variants[1],'Destination scheduling and identity must survive the copy');
  strict.deepEqual(plan.energySummary,original.energySummary,'Each day keeps its prescribed energy target');
  strict.equal(target.meals.length,2);
  strict.notEqual(target.meals[0].id,original.variants[0].meals[0].id);
  strict.notEqual(target.meals[0].id,target.meals[1].id);
  strict.deepEqual(target.meals.map(meal=>meal.doneDates),[[],[]]);
  strict.equal(target.meals[0].items,original.variants[0].meals[0].items);
  strict.equal(target.meals[0].notes,'Orientação');
  target.meals[0].items='Ajustado';strict.notEqual(plan.variants[0].meals[0].items,'Ajustado');
  strict.equal(e.ctx.CURRENT_DIET_VARIANT_ID,'rest');
  strict.deepEqual(e.writes[0].context,{targetUid:'student',trainer:true,local:false});
  strict.equal(e.locks.size,0);
}
{
  const e=dayCopyEnvironment();e.ctx.DIET_DOCUMENT.plans[0].variants[1].meals=[{id:'old',name:'Anterior'}];
  const before=structuredClone(e.ctx.DIET_DOCUMENT);
  e.api.openVariantCopy('training');strict.equal(e.api.confirmVariantCopy(),true);
  strict.equal(e.writes.length,0,'Replacing existing meals requires explicit confirmation');
  strict.match(e.confirmation().text,/histórico de refeições concluídas/);
  e.setFailure(true);strict.equal(await e.confirmation().cb(),false);
  strict.deepEqual(e.ctx.DIET_DOCUMENT,before,'Failure must preserve both divisions without publishing an unsaved draft');
  strict.equal(e.closed.length,0);strict.equal(e.locks.size,0);
  e.setFailure(false);strict.equal(await e.confirmation().cb(),true);
  strict.equal(e.writes.length,1);
}
{
  const e=dayCopyEnvironment();e.api.openVariantCopy('training');e.target('');
  e.fields.get('diet-copy-name').value='Carbo médio';
  strict.equal(await e.api.confirmVariantCopy(),true);
  const target=e.ctx.DIET_DOCUMENT.plans[0].variants[2];
  strict.equal(target.name,'Carbo médio');strict.equal(target.daysPerWeek,0);
  strict.deepEqual(target.workoutDays,[]);strict.deepEqual(target.weekdays,[]);
  strict(e.opened.includes(target.id),'A new day must open its scheduling editor');
}
{
  const e=dayCopyEnvironment();e.api.openVariantCopy('training');e.ctx.DIET_CONTEXT.targetUid='other';
  strict.equal(e.api.confirmVariantCopy(),false);strict.equal(e.writes.length,0);
  e.ctx.DIET_CONTEXT.targetUid='student';e.ctx.AUTH_STATE_REVISION++;
  strict.equal(e.api.confirmVariantCopy(),false);
}
{
  const e=dayCopyEnvironment();e.api.openVariantCopy('training');
  e.ctx.DIET_DOCUMENT.plans[0].variants[1].name='Mudou';
  strict.equal(await e.api.confirmVariantCopy(),false);strict.equal(e.writes.length,0);
}
{
  const e=dayCopyEnvironment();let release;e.setHold(new Promise(resolve=>release=resolve));e.api.openVariantCopy('training');
  const task=e.api.confirmVariantCopy();strict.equal(e.api.confirmVariantCopy(),false);
  e.ctx.DIET_CONTEXT.targetUid='other';e.ctx.DIET_DOCUMENT={plans:[{id:'other'}]};
  release();strict.equal(await task,true);strict.equal(e.writes.length,1);
  strict.equal(e.ctx.DIET_DOCUMENT.plans[0].id,'other','Late completion cannot replace another student view');
}
{
  const e=dayCopyEnvironment();e.ctx.CURRENT_USER={uid:'student',role:'student'};
  strict.equal(e.api.openVariantCopy('training'),false);strict.equal(e.api.confirmVariantCopy(),false);
}
{
  const e=dayCopyEnvironment();const plan=e.ctx.DIET_DOCUMENT.plans[0];
  while(plan.variants.length<12)plan.variants.push({id:'day-'+plan.variants.length,name:'Dia',meals:[]});
  e.api.openVariantCopy('training');strict(!e.fields.get('diet-copy-target').children.some(option=>option.value===''));
  e.target('');strict.equal(await e.api.confirmVariantCopy(),false);strict.equal(e.writes.length,0);
}
console.log('APROVADO — cópia entre dias com novos IDs, destino vazio ou preenchido, nova divisão, confirmação, falha, repetição e troca de aluno. Dieta pode ser duplicada com novos IDs, original preservada, histórico de conclusão limpo, cópia inativa e editor aberto automaticamente.');
