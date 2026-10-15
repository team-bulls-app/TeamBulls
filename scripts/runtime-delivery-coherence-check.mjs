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

for(const file of ['config_v10_7.js','update_v10_10_9.js','sw.js','sw_47.js','viewport_v10_10_9.js','modules/usability-checkup-v10_10_9.js','modules/intelligence-suite-loader-v10_10_42.js','modules/trainer-runtime-reliability-v10_10_46.js','modules/heic-report-conversion-v10_10_12.js']){
  const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert(syntax.status===0,`${file} possui JavaScript inválido: ${String(syntax.stderr||'').trim()}`);
}

const build=Number(version.build);
assert(Number.isInteger(build)&&build>=2026091701,'Build publicado não representa a rodada atual de hotfixes.');
assert(updater.includes(`const CURRENT_BUILD=${build};`),'Atualizador divergiu do build publicado.');
assert(sw.includes(`const BUILD_REVISION=${build};`)&&sw47.includes(`const BUILD_REVISION=${build};`),'Service Workers divergem do build publicado.');
assert(sw===sw47,'sw.js e sw_47.js divergiram.');

assert(config.includes('heic-report-conversion-v10_10_12.js?v=10.10.12-heic4'),'Loader ainda pede conversor HEIC antigo.');
assert(updater.includes('heic-report-conversion-v10_10_12.js?v=10.10.12-heic4')&&updater.includes('heic-libheif-worker-v10_10_12.js?v=10.10.12-heicworker4'),'Atualizador ainda aquece revisão HEIC antiga.');
assert(sw.includes('heic-report-conversion-v10_10_12.js?v=10.10.12-heic4')&&sw.includes('heic-libheif-worker-v10_10_12.js?v=10.10.12-heicworker4'),'Shell ainda prepara revisão HEIC antiga.');
assert(heic.includes("const VERSION='10.10.12-heic4'")&&heic.includes('heicworker4'),'Conversor HEIC canônico não corresponde às referências publicadas.');
assert(sw.includes("'/modules/heic-report-conversion-v10_10_12.js'")&&sw.includes("'/modules/heic-libheif-worker-v10_10_12.js'"),'HEIC precisa permanecer network-first.');

assert(usability.includes('intelligence-suite-loader-v10_10_42.js?v=10.10.57-intelsuite7')&&usability.includes("const EXPECTED_VERSION='10.10.57-intelsuite7'"),'Bootstrap ainda espera suíte de inteligência antiga.');
assert(intelligence.includes("const VERSION='10.10.57-intelsuite7'"),'Suíte de inteligência canônica não está na revisão esperada.');
assert(intelligence.includes('student-report-submit-reconciliation-v10_10_57.js?v=10.10.57-submitstate7'),'Suíte não entrega a correção atual do envio semanal.');

assert(viewport.includes('trainer-runtime-reliability-v10_10_46.js?v=10.10.52-trainer2'),'Cold start ainda pede runtime antigo do treinador.');
assert(viewport.includes("TeamBullsTrainerRuntimeReliability?.version==='10.10.52-trainer2'"),'Cold start ainda valida revisão antiga do treinador.');
assert(trainerRuntime.includes("const VERSION='10.10.52-trainer2'"),'Runtime canônico do treinador divergiu.');
assert(sw.includes("'/modules/trainer-runtime-reliability-v10_10_46.js'"),'Runtime do treinador precisa ser network-first.');

if(fail.length){
  console.error('FALHA — coerência de entrega/runtime\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log(`APROVADO — build ${build}, HEIC, suíte de relatórios/inteligência e runtime do treinador usam revisões coerentes e network-first onde necessário.`);
