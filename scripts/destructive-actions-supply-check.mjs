import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const moduleCode=read('modules/destructive-actions-supply-fix-v10_10_29.js');
const config=read('config_v10_7.js');
const rules=read('firebase/firestore_28_compacto.rules');
const core=read('app_v10_10_9_core.js');

function assert(condition,message){if(!condition)throw new Error(message);}

const moduleUrl='./modules/destructive-actions-supply-fix-v10_10_29.js?v=10.10.29-destructive-supply2';
assert(config.includes(moduleUrl),'O módulo de correção não está carregado pelo runtime com URL nova.');

// Exclusão de dieta deve preservar o editor/contexto até a confirmação e usar o persist canônico.
assert(moduleCode.includes("function safeDeleteCurrentDiet()"),'A exclusão segura da dieta não foi instalada.');
assert(moduleCode.includes("sameDietContext(context)"),'A exclusão da dieta não revalida o contexto do aluno/dieta.');
assert(moduleCode.includes("const snapshot=clone(DIET_DOCUMENT)"),'A exclusão da dieta não prepara rollback.');
assert(moduleCode.includes("await persistDietDocument();"),'A exclusão da dieta não usa persistDietDocument().');
assert(moduleCode.includes("if(typeof closeModal==='function')closeModal('modal-diet');"),'O editor da dieta não é fechado somente após a gravação.');
const safeDeleteBlock=moduleCode.slice(moduleCode.indexOf('function safeDeleteCurrentDiet()'),moduleCode.indexOf('function installDietDeletePatch()'));
assert(!safeDeleteBlock.includes("closeModal('modal-diet')"),'A dieta ainda fecha o editor antes da confirmação.');
assert(!moduleCode.includes("db.collection('mealPlans')"),'O hotfix não deve criar uma escrita paralela de mealPlans.');

// Exclusão de sessão precisa serializar com a fila rápida, sem retry de write.
assert(moduleCode.includes("SESSION_QUEUE_PREFIX='team_bulls_pending_sessions_v1_'"),'A fila persistente das séries não é reconhecida pelo hotfix.');
assert(moduleCode.includes("await runtime.flush()"),'A exclusão cloud não aguarda a fila rápida antes de apagar.');
assert(moduleCode.includes("if(queuedSession(uidValue,sessionId))"),'A exclusão não bloqueia quando o registro ainda permanece pendente.');
assert(!moduleCode.includes('setInterval('),'O hotfix não deve criar polling contínuo.');
assert(!moduleCode.includes('cloudWrite('),'O hotfix não deve duplicar/repetir a escrita/delete do core.');
assert(core.includes("await cloudWrite(db.collection('sessions').doc(sessionId).delete(),'excluir registro')"),'O delete canônico de sessions deixou de existir no core.');

// A última série não pode virar sets=[]; deve oferecer exclusão completa do registro.
assert(moduleCode.includes("rows.length===1&&rows[0]===row&&sessionId&&student()"),'A última série não é tratada separadamente.');
assert(moduleCode.includes("showConfirm('Apagar registro completo'"),'A última série não oferece apagar o registro completo.');
assert(moduleCode.includes("const deleted=await performDeleteSession(sessionId)"),'A remoção da última série não usa o delete canônico da sessão.');
assert(!moduleCode.includes('sets:[]'),'O hotfix não deve salvar sessão vazia.');

// Rules atuais precisam continuar autorizando o aluno ativo a apagar apenas o próprio registro.
const sessionsRules=rules.slice(rules.indexOf('match /sessions/{id}'),rules.indexOf('match /feedback/{id}'));
assert(sessionsRules.includes('allow delete: if activeOwner(resource.data.userId);'),'Rules 28 não permitem ao aluno ativo apagar a própria sessão.');

// O atalho precisa reconstruir o DOM real, mesmo quando o data-flag antigo já existe.
assert(moduleCode.includes("const validSvg=!!button.querySelector('svg')"),'O reparo do atalho não valida se o SVG realmente existe.');
assert(moduleCode.includes("validLabel=String(label?.textContent||'').trim()==='Opções de suprimentos'"),'O reparo não valida o texto real do atalho.');
assert(moduleCode.includes("if(!validSvg||!validLabel)"),'O atalho ainda depende apenas do data-flag antigo.');
assert(moduleCode.includes("repairSupplyButton('screen-diet-detail')"),'O atalho do aluno não é reparado.');
assert(moduleCode.includes("repairSupplyButton('screen-ts-diet-detail')"),'O atalho ao visualizar a dieta do aluno como treinador não é reparado.');
assert(moduleCode.includes('openFoodOptionsFromDiet'),'O destino canônico das opções de suprimentos não foi preservado.');
assert(moduleCode.includes("screenObserver.observe(screen,{attributes:true,attributeFilter:['class']})"),'O reparo não acompanha a ativação das duas telas de dieta.');

console.log('APROVADO — exclusão de dieta mantém contexto/rollback; sessões aguardam a fila rápida e a última série oferece exclusão completa; atalho de suprimentos reconstrói ícone/texto reais.');
