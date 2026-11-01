import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const fail=[];
const read=file=>fs.readFileSync(file,'utf8');
const assert=(ok,message)=>{if(!ok)fail.push(message);};

const version=JSON.parse(read('version.json'));
const config=read('config_v10_7.js');
const updater=read('update_v10_10_9.js');
const sw=read('sw.js');
const sw47=read('sw_47.js');
const viewport=read('viewport_v10_10_9.js');
const usability=read('modules/usability-checkup-v10_10_9.js');
const intelligence=read('modules/intelligence-suite-loader-v10_10_42.js');
const trainerRuntime=read('modules/trainer-runtime-reliability-v10_10_46.js');
const heic=read('modules/heic-report-conversion-v10_10_12.js');
const messaging=read('modules/student-feedback-device-notices-v10_10_62.js');
const v107Core=read('modules/v107-core.js');
const messagingWorker=read('feedback-push-sw.js');
const core=read('app_v10_10_9_core.js');
const index=read('index.html');

for(const file of ['config_v10_7.js','update_v10_10_9.js','sw.js','sw_47.js','viewport_v10_10_9.js','modules/usability-checkup-v10_10_9.js','modules/intelligence-suite-loader-v10_10_42.js','modules/trainer-runtime-reliability-v10_10_46.js','modules/heic-report-conversion-v10_10_12.js','modules/student-feedback-device-notices-v10_10_62.js','modules/v107-core.js','feedback-push-sw.js','app_v10_10_9_core.js']){
  const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert(syntax.status===0,`${file} possui JavaScript inválido: ${String(syntax.stderr||'').trim()}`);
}

const build=Number(version.build);
assert(Number.isInteger(build)&&build>=2026091701,'Build publicado não representa a rodada atual de hotfixes.');
assert(updater.includes(`const CURRENT_BUILD=${build};`),'Atualizador divergiu do build publicado.');
assert(sw.includes(`const BUILD_REVISION=${build};`)&&sw47.includes(`const BUILD_REVISION=${build};`),'Service Workers divergem do build publicado.');
assert(sw===sw47,'sw.js e sw_47.js divergiram.');

const recoveredCoreRef='app_v10_10_9_core.js?v=10.10.9-sessionhistory2&diet=foodchoices1&syncdiag=1&theme=light13&exercise=groupcatalog1&access=online-recheck1&syncstatus=1&firebase=13.1.0&daysave=transaction1&profile=listener1&draft=exercise-recovery1&resume=passive2&delete=student-context2';
const recoveredModalRef='modules/v107-core.js?v=10.10.9-snapshot1&firestore=recovery4';
const foregroundRecoveryRef='modules/foreground-write-resilience-v10_10_50.js?v=10.10.50-foregroundwrite2';
assert((index.match(new RegExp(recoveredCoreRef.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))||[]).length>=2,'HTML precisa pré-carregar e executar a revisão nova do runtime Firestore.');
assert(updater.includes(`'./${recoveredCoreRef}'`)&&sw.includes(`'./${recoveredCoreRef}'`),'Runtime do listener e recuperação de rascunho precisam ser aquecidos pelo atualizador e pelo cache offline.');
assert(index.includes(`modules/v107-core.js?v=10.10.9-snapshot1&firestore=recovery4`)&&updater.includes(`'./${recoveredModalRef}'`)&&sw.includes(`'./${recoveredModalRef}'`),'Recuperação de rascunho precisa usar a mesma revisão no HTML, atualizador e Service Worker.');
assert(updater.includes(`'./${foregroundRecoveryRef}'`)&&sw.includes(`'./${foregroundRecoveryRef}'`)&&intelligence.includes(foregroundRecoveryRef),'Retomada passiva precisa chegar pelo atualizador, loader do app e Service Worker.');
assert(version.revision==='desktop-login-minotaurs-1','A revisão publicada não identifica o fundo desktop atual.');

assert(config.includes('heic-report-conversion-v10_10_12.js?v=10.10.12-heic4'),'Loader ainda pede conversor HEIC antigo.');
assert(updater.includes('heic-report-conversion-v10_10_12.js?v=10.10.12-heic4')&&updater.includes('heic-libheif-worker-v10_10_12.js?v=10.10.12-heicworker4'),'Atualizador ainda aquece revisão HEIC antiga.');
assert(sw.includes('heic-report-conversion-v10_10_12.js?v=10.10.12-heic4')&&sw.includes('heic-libheif-worker-v10_10_12.js?v=10.10.12-heicworker4'),'Shell ainda prepara revisão HEIC antiga.');
assert(heic.includes("const VERSION='10.10.12-heic4'")&&heic.includes('heicworker4'),'Conversor HEIC canônico não corresponde às referências publicadas.');
assert(sw.includes("'/modules/heic-report-conversion-v10_10_12.js'")&&sw.includes("'/modules/heic-libheif-worker-v10_10_12.js'"),'HEIC precisa permanecer network-first.');

assert(usability.includes('intelligence-suite-loader-v10_10_42.js?v=10.10.58-intelsuite9')&&usability.includes("const EXPECTED_VERSION='10.10.58-intelsuite9'"),'Bootstrap ainda espera suíte de inteligência antiga.');
assert(intelligence.includes("const VERSION='10.10.58-intelsuite9'"),'Suíte de inteligência canônica não está na revisão esperada.');
assert(intelligence.includes('student-report-submit-reconciliation-v10_10_57.js?v=10.10.57-submitstate7'),'Suíte não entrega a correção atual do envio semanal.');
const trainerSpec=intelligence.slice(intelligence.indexOf('trainer:['),intelligence.indexOf('],\n    student:['));
assert(trainerSpec.includes('foreground-write-resilience-v10_10_50.js?v=10.10.50-foregroundwrite2'),'A retomada segura do Firestore precisa ser carregada também no fluxo do treinador.');
assert(core.includes('firebasejs/13.1.0/firebase-firestore-compat.js')&&!core.includes('firebasejs/10.7.1/'),'O runtime ainda usa uma versão antiga/inconsistente do Firebase.');
assert(config.includes('firebasejs/13.1.0/firebase-app-check-compat.js')&&!config.includes('firebasejs/10.7.1/'),'App Check ainda usa uma versão antiga do Firebase.');
for(const [name,source] of [['avisos do aluno',messaging],['App Check legado',v107Core],['service worker de push',messagingWorker]]){
  assert(source.includes('firebasejs/13.1.0/')&&!source.includes('firebasejs/10.7.1/'),`${name} ainda pode carregar Firebase 10.7.1 junto com o runtime 13.1.0.`);
}
assert(core.includes('db.runTransaction')&&core.includes('function daySaveRetryable'),'A gravação do dia deve usar transação e retry limitado.');
assert(index.includes('firebase=13.1.0&daysave=transaction1'),'O cache do navegador ainda pode servir o runtime antigo da gravação.');
const daySaveStart=core.indexOf('async function saveDayFolder()');
const alreadySavedStart=core.indexOf('if(oldName&&alreadySaved){',daySaveStart);
const missingDayStart=core.indexOf('if(oldName&&!selected){',daySaveStart);
assert(daySaveStart>=0&&alreadySavedStart>daySaveStart&&missingDayStart>alreadySavedStart,'Reconciliação de rename confirmado deve reconhecer o ID estável antes de rejeitar o dia como ausente.');

assert(viewport.includes('trainer-runtime-reliability-v10_10_46.js?v=10.10.53-trainer3'),'Cold start ainda pede runtime antigo do treinador.');
assert(viewport.includes("TeamBullsTrainerRuntimeReliability?.version==='10.10.53-trainer3'"),'Cold start ainda valida revisão antiga do treinador.');
assert(trainerRuntime.includes("const VERSION='10.10.53-trainer3'"),'Runtime canônico do treinador divergiu.');
assert(sw.includes("'/modules/trainer-runtime-reliability-v10_10_46.js'"),'Runtime do treinador precisa ser network-first.');

if(fail.length){
  console.error('FALHA — coerência de entrega/runtime\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log(`APROVADO — build ${build}, HEIC, suíte de relatórios/inteligência e runtime do treinador usam revisões coerentes e network-first onde necessário.`);
