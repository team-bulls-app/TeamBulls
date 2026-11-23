import fs from 'node:fs';

const read=path=>fs.readFileSync(path,'utf8');
const fail=[];
const assert=(condition,message)=>{if(!condition)fail.push(message);};

const module=read('modules/prescription-propagation-v10_10_9.js');
const config=read('config_v10_7.js');
const sw=read('sw.js');
const bridge=read('sw_47.js');
const core=read('app_v10_10_9_core.js');
const firestore=read('firebase/firestore_26_compacto.rules');

assert(module.includes("const VERSION='10.10.9-propagation2'"),'Módulo de propagação não identifica propagation1.');
assert(module.includes("PLAN_EDIT_TARGET==='trainer'||PLAN_EDIT_TARGET==='local'"),'Propagação não restringe a edição aos contextos permitidos.');
assert(module.includes("CURRENT_USER?.role!=='trainer'"),'Propagação cloud não valida a função de treinador.');
assert(module.includes("exercisesForDay(workout,source.dayName||'Treino geral')"),'Exercícios abaixo não respeitam a ordem do dia atual.');
assert(module.includes("mode==='below-current'")&&module.includes("mode==='source-future'")&&module.includes("mode==='below-future'")&&module.includes("mode==='full-forward'")&&module.includes("mode==='all-current'")&&module.includes("mode==='all-all'"),'Nem todos os seis modos de propagação estão implementados.');
assert(module.includes('↘ TUDO ABAIXO E À FRENTE')&&module.includes('↓ SOMENTE EXERCÍCIOS ABAIXO')&&module.includes('→ REPASSAR ATÉ A SEMANA 8')&&module.includes('↘ ABAIXO NAS SEMANAS SEGUINTES'),'Atalhos direcionais de séries/reps/GER estão incompletos.');
assert(module.includes("planWithWeeks(source,current,sets)")&&module.includes("planWithWeeks(source,currentForward,sets)"),'A prescrição aberta não é materializada com segurança na origem.');
assert(module.includes("batch.update(db.collection('exercises').doc(change.exercise.id),{weeklyPlan:change.next})"),'Propagação cloud não usa batch de weeklyPlan.');
assert(module.includes("await cloudWrite(batch.commit(),'repassar séries, repetições e GER')"),'Commit cloud não passa pela proteção de timeout/erro do app.');
assert(module.includes("if(typeof localSave!=='function'||!localSave())")&&module.includes('change.exercise.weeklyPlan=clonePlan(change.before)'),'Modo local não possui rollback em falha.');
assert(!module.includes("db.collection('sessions')"),'Propagação de prescrição não pode alterar sessões realizadas.');
assert(!module.includes('weeklyTechniquePlan'),'Propagação de séries/reps/GER não pode alterar técnicas semanais.');
assert(!module.includes('loadPrescriptionEditor'),'Propagação não deve recarregar o editor e descartar alterações abertas.');
assert(module.includes("resolveWeekPrescription(temp,n)"),'Cópia das 8 semanas não preserva a resolução de herança da origem.');
assert(module.includes("MAX_BATCH_WRITES=450"),'Propagação não limita o lote antes do limite do Firestore.');
assert(module.includes("typeof showConfirm==='function'")&&module.includes('window.confirm(text)'),'Confirmação não possui fallback se a camada visual estiver indisponível.');
assert(module.includes("directTechnique('full-forward')")&&module.includes("directTechnique('below-current')")&&module.includes("directTechnique('source-future')")&&module.includes("directTechnique('below-future')"),'Atalhos de técnicas não foram reconectados diretamente.');

const propagationUrl='./modules/prescription-propagation-v10_10_9.js?v=10.10.9-propagation2';
assert(config.includes(propagationUrl),'Loader não inclui propagation1.');
assert(config.indexOf('prescription-actions-layout-v10_10_9.js')<config.indexOf('prescription-propagation-v10_10_9.js'),'Propagação deve executar depois da central de ações.');
assert(config.indexOf('prescription-propagation-v10_10_9.js')<config.indexOf('modal-stack-stability-v10_10_9.js'),'Propagação deve executar antes da proteção final da pilha de modais.');
assert(sw.includes("'"+propagationUrl+"'"),'Propagation1 não está no REQUIRED_SHELL do PWA.');
assert(bridge.replace('ponte de migração para instalações controladas pelo antigo sw_47.js','Service Worker estável e atualização sem reinstalação')===sw,'sw_47.js divergiu do Service Worker principal após propagation1.');

assert(core.includes('Séries, repetições e GER nunca são alterados por estas ações.'),'Rotina direcional legada de técnicas perdeu o isolamento de séries/reps/GER.');
assert(core.includes('function resolveWeekPrescription(exercise,week)'),'Resolução de herança da prescrição ausente no núcleo.');
assert(core.includes('function clonePrescriptionSets(sets)'),'Clone seguro de séries da prescrição ausente no núcleo.');
assert(firestore.includes('match /exercises/{id}')&&firestore.includes("request.resource.data.get('weeklyPlan', {}) is map"),'Regras do Firestore deixaram de aceitar weeklyPlan válido.');

if(fail.length){
  console.error('\nFalhas da propagação de prescrição:\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log('Prescription propagation check OK — 6 modos, batch/rollback, isolamento e PWA validados.');
