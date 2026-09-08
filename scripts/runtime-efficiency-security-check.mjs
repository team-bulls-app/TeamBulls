import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const fail=[];
const assert=(ok,message)=>{if(!ok)fail.push(message);};
const read=file=>fs.readFileSync(file,'utf8');
const sw=read('sw.js');
const bridge=read('sw_47.js');
const update=read('update_v10_10_9.js');
const realtime=read('modules/student-request-realtime-v10_10_32.js');
const config=read('config_v10_7.js');
const version=JSON.parse(read('version.json'));
const build=Number(version.build);

for(const file of ['sw.js','sw_47.js','update_v10_10_9.js','modules/student-request-realtime-v10_10_32.js']){
  const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert(syntax.status===0,`${file} possui JavaScript inválido: ${String(syntax.stderr||'').trim()}`);
}

assert(build===2026090802,'O pacote de otimização precisa publicar o build 2026090802.');
assert(sw===bridge,'Os dois Service Workers precisam permanecer byte a byte idênticos.');
assert(sw.includes(`const BUILD_REVISION=${build};`)&&bridge.includes(`const BUILD_REVISION=${build};`),'Service Workers não estão alinhados ao build publicado.');
assert(update.includes(`const CURRENT_BUILD=${build};`),'Atualizador não está alinhado ao build publicado.');
assert(version.revision==='startup-cache-realtime-security-1','version.json não identifica a revisão de performance/segurança.');

assert(sw.includes('const MUTABLE_CACHE_GRACE_MS=650;'),'Cold start não possui janela curta de rede.');
assert(sw.includes('const FAST_STARTUP_PATHS=new Set(['),'Cold start não delimita arquivos críticos.');
assert(sw.includes('async function navigationFastStart'),'Navegação não usa cache local revalidado.');
assert(sw.includes('event.waitUntil(refreshNavigation(request,event,fallback))'),'HTML em cache não é revalidado em segundo plano.');
assert(sw.includes('async function networkFirstWithCacheGrace'),'Arquivos críticos não têm fallback rápido para cache.');
assert(sw.includes('event.waitUntil(network.then(()=>true).catch(()=>false))'),'Revalidação do primeiro frame pode ser cancelada ao retornar o cache.');
assert(sw.includes("if(relativePath==='/version.json'){event.respondWith(networkFirst"),'version.json precisa continuar network-first.');

const cspMatch=sw.match(/const CSP="([\s\S]*?)";/);
const csp=cspMatch?.[1]||'';
assert(csp.includes("script-src 'self' https://www.gstatic.com https://www.google.com https://www.recaptcha.net"),'CSP perdeu as origens necessárias para Firebase/App Check.');
assert(!csp.includes('cdn.jsdelivr.net'),'CSP da página ainda libera CDN de script que só é necessária dentro do worker HEIC.');
assert(csp.includes("worker-src 'self'"),'Workers da página não estão restritos à mesma origem.');
assert(!csp.includes("worker-src 'self' blob:"),'CSP ainda permite worker blob sem necessidade.');
assert(csp.includes("object-src 'none'")&&csp.includes("frame-ancestors 'none'"),'Proteções base de conteúdo foram enfraquecidas.');

const realtimeUrl='./modules/student-request-realtime-v10_10_32.js?v=10.10.32-studentrealtime3';
assert(config.includes(`'${realtimeUrl}'`),'Loader deixou de entregar o runtime realtime ao aluno.');
assert(update.includes(`const STUDENT_REQUEST_REALTIME_MODULE='${realtimeUrl}';`),'Atualizador não conhece o runtime realtime que precisa ser reaquecido.');
assert(update.includes('STUDENT_HOME_LAYOUT_MODULE,STUDENT_REQUEST_REALTIME_MODULE,STUDENT_DIET_COMPACT_MODULE'),'Runtime realtime não está entre os arquivos críticos da atualização.');
assert(sw.includes(realtimeUrl),'Shell offline não prepara o runtime realtime atualizado.');

assert(realtime.includes('function suppressLegacyBadgePolling()'),'Runtime realtime não neutraliza a consulta periódica legada.');
assert(realtime.includes("Number(delay)===300000&&source.includes('refreshNoticeBadge')"),'Interceptor do polling não está limitado ao timer legado de 5 minutos.');
assert(realtime.includes('finally{window.setInterval=nativeSetInterval;}'),'setInterval global não é restaurado imediatamente após a compatibilidade.');
assert(realtime.includes('function install(){installAuthLifecycle();installLogoutGuard();suppressLegacyBadgePolling();sync();'),'Neutralização do polling não roda junto do lifecycle realtime.');
assert(!realtime.includes('setInterval(()=>'),'Runtime realtime não pode introduzir novo polling periódico.');
assert(realtime.includes('onSnapshot('),'Entrega realtime precisa continuar event-driven.');
assert(!realtime.includes('cloudWrite('),'Otimização realtime não pode introduzir escritas automáticas.');

if(fail.length){
  console.error('FALHA — performance, cache e segurança\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — cold start usa cache com revalidação, central realtime elimina polling redundante, CSP foi reduzida e build/SWs permanecem coerentes.');
