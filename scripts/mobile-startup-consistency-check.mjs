import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const fail=[];
const read=path=>fs.readFileSync(path,'utf8');
const assert=(ok,message)=>{if(!ok)fail.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

const files=['boot_v10.js','config_v10_7.js','update_v10_10_9.js','sw.js','sw_47.js','modules/v107-invites.js','modules/registration-integrity-v10_10_9.js','modules/trainer-inbox-payments-v10_10_12.js','modules/photo-quality-download-v10_10_9.js','modules/heic-report-conversion-v10_10_12.js','modules/heic-libheif-worker-v10_10_12.js'];
for(const file of files){const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});assert(syntax.status===0,`${file} possui JavaScript inválido: ${String(syntax.stderr||'').trim()}`);}

const boot=read('boot_v10.js'),config=read('config_v10_7.js'),updater=read('update_v10_10_9.js'),sw=read('sw.js'),bridge=read('sw_47.js'),invites=read('modules/v107-invites.js'),integrity=read('modules/registration-integrity-v10_10_9.js'),photo=read('modules/photo-quality-download-v10_10_9.js'),heic=read('modules/heic-report-conversion-v10_10_12.js'),heicWorker=read('modules/heic-libheif-worker-v10_10_12.js');
const version=JSON.parse(read('version.json')),firebase=JSON.parse(read('firebase.json'));
const updaterBuild=Number(updater.match(/const CURRENT_BUILD=(\d+)/)?.[1]||0),workerBuild=Number(sw.match(/const BUILD_REVISION=(\d+)/)?.[1]||0),bridgeBuild=Number(bridge.match(/const BUILD_REVISION=(\d+)/)?.[1]||0);
const swHotfix=sw.match(/const CACHE_HOTFIX='([^']+)'/)?.[1]||'',bridgeHotfix=bridge.match(/const CACHE_HOTFIX='([^']+)'/)?.[1]||'';

assert(version.version==='10.10.9','version.json alterou a versão pública inesperadamente.');
assert(Number.isInteger(version.build)&&version.build>0,'version.json não possui build válido.');
assert(typeof version.revision==='string'&&version.revision.length>0,'version.json não identifica a revisão atual.');
assert(updaterBuild===version.build,'Atualizador e version.json usam builds diferentes.');
assert(workerBuild===version.build&&bridgeBuild===version.build,'Service Workers e version.json usam builds diferentes.');
assert(swHotfix&&swHotfix===bridgeHotfix,'Service Workers usam revisões de cache diferentes.');
assert(firebase?.firestore?.rules==='firebase/firestore_28_compacto.rules','firebase.json deixou de apontar para Firestore Rules 28.');
assert(firebase?.storage?.rules==='firebase/storage_6.rules','firebase.json deixou de apontar para Storage Rules 6.');

has(boot,'function returningCloudSession()','Boot não diferencia uma sessão já conhecida.');
/* Incidente 2026-09-01: a espera longa podia deixar o usuário preso em
   "verificando sessão". A sessão conhecida ainda ganha mais tempo que uma sessão
   nova, mas deve falhar aberta para um login utilizável em prazo finito. */
has(boot,'restoring?3800:1800','Boot não possui o fail-open finito esperado para restauração de sessão.');
has(boot,'},8000);','Boot não possui a barreira absoluta contra loading infinito.');
has(boot,'tb-auth-failopen','Boot não protege a tela de autenticação contra bloqueios residuais.');
has(boot,"document.querySelectorAll('.modal-backdrop.open').forEach(modal=>directCloseOrphan(modal,'auth'))",'Tela de autenticação não limpa backdrops residuais que capturam cliques.');
lacks(boot,'const ESSENTIALS','Boot voltou a carregar módulos de Home/perfil antes da autenticação.');
lacks(boot,'loadEssentialStudentRuntime','Boot voltou a iniciar o runtime visual antes da sessão.');
lacks(boot,'},1600);','Fallback antigo de 1,6 s reapareceu.');
has(config,'startBootWatchdog.__tbMobileSessionRestore','Watchdog móvel não está reforçado.');
has(config,'const loadedModules=new Set(),failedModules=new Set()','Loader não rastreia módulos temporariamente falhos.');
has(config,'const healFailedModules=async()=>','Loader não possui autorreparo.');
has(config,"window.addEventListener('online',()=>{scheduleHeal(500);contextChanged();})",'Ao recuperar conexão, o loader deve retentar módulos falhos e reavaliar o contexto atual.');
has(config,'trainer-inbox-payments-v10_10_12.js?v=10.10.12-inboxpayments2','Loader não entrega a Central/Pagamentos atual.');
has(config,'photo-quality-download-v10_10_9.js?v=10.10.9-photoquality2','Loader não entrega a correção móvel de fotos.');
has(config,'heic-report-conversion-v10_10_12.js?v=10.10.12-heic1','Loader não entrega o fallback HEIC/HEIF.');
assert(config.indexOf('heic-report-conversion-v10_10_12.js')>config.indexOf('photo-quality-download-v10_10_9.js'),'Conversor HEIC precisa carregar após a camada de qualidade de fotos.');
has(updater,'function compareRelease(info)','Atualizador não compara versão + build.');
has(updater,'function safeForAutomaticHotfix()','Atualização automática não possui gate de tela segura.');
has(updater,"if(screen!=='screen-auth')return false",'Atualizador poderia reiniciar durante uso ativo.');
has(updater,'&b=${CURRENT_BUILD}','Service Worker não é registrado com build.');
has(updater,'heic-report-conversion-v10_10_12.js?v=10.10.12-heic1','Atualizador não renova o módulo HEIC.');
has(updater,'heic-libheif-worker-v10_10_12.js?v=10.10.12-heicworker1','Atualizador não prepara o worker HEIC same-origin.');
for(const [name,text] of [['sw.js',sw],['sw_47.js',bridge]]){
  has(text,"./modules/registration-integrity-v10_10_9.js?v=10.10.9-registration2",`${name} regrediu a integridade do cadastro.`);
  has(text,"./modules/trainer-inbox-payments-v10_10_12.js?v=10.10.12-inboxpayments2",`${name} não prepara a Central/Pagamentos.`);
  has(text,"./modules/photo-quality-download-v10_10_9.js?v=10.10.9-photoquality2",`${name} não prepara a correção móvel de fotos.`);
  has(text,"./modules/heic-report-conversion-v10_10_12.js?v=10.10.12-heic1",`${name} não prepara o módulo HEIC.`);
  has(text,"./modules/heic-libheif-worker-v10_10_12.js?v=10.10.12-heicworker1",`${name} não prepara o worker HEIC same-origin.`);
  has(text,"'/modules/heic-report-conversion-v10_10_12.js'",`${name} não serve o conversor HEIC como mutável/network-first.`);
  has(text,"'/modules/heic-libheif-worker-v10_10_12.js'",`${name} não serve o worker HEIC como mutável/network-first.`);
  has(text,"const CACHE_HOTFIX='heic-recovery1'",`${name} não invalida o cache defeituoso do HEIC.`);
  has(text,"worker-src 'self' blob:",`${name} CSP bloqueia workers locais necessários ao app.`);
  has(text,"type:'TEAM_BULLS_SW_ACTIVATED',version:APP_VERSION,build:BUILD_REVISION",`${name} não anuncia o build ativado.`);
  has(text,"if(relativePath==='/version.json')",`${name} deixou de tratar version.json como mutável.`);
  has(text,"./modules/trainer-diet-workspace-v10_10_11.js?v=10.10.11-dietworkspace1",`${name} não prepara o workspace do treinador para uso offline.`);
}
has(photo,"const VERSION='10.10.9-photoquality2'",'Revisão móvel de fotos não está ativa.');
has(photo,"createImageBitmap(file,{imageOrientation:'from-image'})",'Decoder móvel perdeu a primeira tentativa orientada.');
has(photo,'createImageBitmap(file);','Decoder móvel perdeu o fallback Android sem opções.');
has(photo,'releaseLegacyReportPreviewSurfaces()','Envio não libera previews pesados antes da compressão.');
has(heic,"const VERSION='10.10.12-heic3'",'Fallback HEIC não está na revisão de recuperação de cache esperada.');
has(heic,"const MAX_HEIC_BYTES=25*1024*1024",'Fallback HEIC perdeu o limite de 25 MB.');
has(heic,"const WORKER_URL='./modules/heic-libheif-worker-v10_10_12.js?v=10.10.12-heicworker3'",'Conversor HEIC não rotacionou o worker same-origin preso em cache.');
has(heic,"new Worker(WORKER_URL)",'Conversor HEIC não cria o worker same-origin.');
has(heic,"file.arrayBuffer()",'Conversor HEIC não transfere o arquivo como ArrayBuffer.');
has(heic,"new ImageData(pixels,width,height)",'Conversor HEIC não recompõe os pixels do worker.');
has(heic,"'image/jpeg',.94",'HEIC não é convertido localmente para JPEG 94%.');
has(heic,'if(!isHeic(file))return baseDecode(file);','Conversor HEIC interfere em formatos já suportados.');
has(heic,'try{return await baseDecode(file);}catch(nativeError)','HEIC não tenta primeiro o decoder nativo do aparelho.');
has(heic,"wrapped.__tbHeicConversion=true",'Wrapper HEIC não possui proteção contra instalação duplicada.');
has(heic,'const selected=Array.from(target?.files||[])','Seleção em lote não preserva as seis fotos escolhidas.');
has(heic,'if(selected.length!==6)','Seleção em lote deixou de exigir exatamente seis fotos.');
has(heic,'for(let slot=0;slot<6;slot++)','Seleção em lote não percorre os seis slots.');
has(heic,"await base(slot,syntheticEvent(selected[slot]))",'Seleção em lote voltou a enviar somente a primeira foto ao preview.');
has(heic,'previewWeeklyCheckinPhoto.__tbSixPhotoBatch','Relatório semanal não possui proteção do seletor em lote.');
has(heic,'previewQuestionnaireReportPhoto.__tbSixPhotoBatch','Questionário não possui proteção do seletor em lote.');
has(heic,'const batchInFlight=new WeakSet()','Seleção em lote pode iniciar processamento duplicado da mesma escolha.');
has(heicWorker,"libheif-js@1.19.8/libheif/libheif.js",'Worker HEIC não fixa a versão do libheif.');
has(heicWorker,'const MAX_PIXELS=32000000','Worker HEIC perdeu o limite preventivo de pixels.');
has(heicWorker,'new self.libheif.HeifDecoder()','Worker HEIC não instancia o decoder libheif.');
has(heicWorker,'self.postMessage({id,ok:true,width,height,rgba:data.buffer},[data.buffer])','Worker HEIC não devolve pixels por transferência eficiente.');
has(invites,'suspendAuthListenerForRegistration','Cadastro canônico perdeu a pausa do listener de autenticação.');
has(invites,'cred.user.getIdTokenResult(true)','Cadastro canônico perdeu a renovação de token/claims.');
has(invites,'await ensureRegistrationAppCheck({forceRefresh:false})','Cadastro canônico perdeu o preflight App Check cached-first.');
has(invites,"withTimeout(initOptionalAppCheck(),8000,'App Check do cadastro')",'Cadastro canônico voltou a herdar o timeout curto do boot.');
has(invites,'service.getToken(!!forceRefresh)','Cadastro canônico perdeu a seleção segura de token App Check.');
has(invites,'await ensureRegistrationAppCheck({forceRefresh:true})','Cadastro canônico perdeu o refresh forçado na recuperação 403.');
has(invites,"doRegister.__tbRegistrationAppCheck='cached-first'",'Cadastro canônico não expõe a política App Check resiliente.');
has(invites,'doRegister.__tbCanonicalInviteRegistration=true','Cadastro canônico não está identificado para autorreparo.');
has(invites,"window.addEventListener('team-bulls-runtime-state',enforceCanonicalRegistration)",'Cadastro canônico não se restaura após módulos diferidos.');
lacks(integrity,'doRegister=secured','registration-integrity voltou a sobrescrever o cadastro canônico.');
has(integrity,"const VERSION='10.10.9-registration2'",'Camada passiva de integridade não está na revisão esperada.');
assert(bridge.replace('ponte de migração para instalações controladas pelo antigo sw_47.js','Service Worker estável e atualização sem reinstalação')===sw,'sw_47.js divergiu do Service Worker principal.');
if(fail.length){console.error('FALHA — mobile startup consistency\n- '+fail.join('\n- '));process.exit(1);}
console.log(`APROVADO — build ${version.build}, auth fail-open, cadastro, Central/Pagamentos, 6 fotos + HEIC worker, App Check, Rules 28, Storage 6 e Service Workers coerentes.`);
