import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const fail=[];
const assert=(ok,message)=>{if(!ok)fail.push(message);};
const read=file=>fs.readFileSync(file,'utf8');
const BASELINE_BUILD=2026090103;
const sw=read('sw.js');
const bridge=read('sw_47.js');
const boot=read('boot_v10.js');
const update=read('update_v10_10_9.js');
const runtime=read('modules/student-home-layout-runtime-v10_10_16.js');
const version=JSON.parse(read('version.json'));
const BUILD=Number(version.build);

for(const file of ['sw.js','sw_47.js','boot_v10.js','update_v10_10_9.js','modules/student-home-layout-runtime-v10_10_16.js']){
  const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert(syntax.status===0,`${file} possui JavaScript inválido: ${String(syntax.stderr||'').trim()}`);
}

assert(Number.isInteger(BUILD)&&BUILD>=BASELINE_BUILD,'version.json regrediu para antes do build de recuperação publicado.');
assert(update.includes(`const CURRENT_BUILD=${BUILD};`),'Atualizador divergiu do build publicado.');
assert(sw.includes(`const BUILD_REVISION=${BUILD};`),'Service Worker divergiu do build publicado.');
assert(bridge.includes(`const BUILD_REVISION=${BUILD};`),'Service Worker legado divergiu do build publicado.');
assert(sw===bridge,'sw.js e sw_47.js divergiram durante a estabilização.');
assert(update.includes('const CHECK_INTERVAL_MS=2*60*1000;'),'Atualizador voltou a esperar vinte minutos entre verificações em primeiro plano.');
assert(update.includes("const STUDENT_DIET_COMPACT_MODULE='./modules/student-diet-compact-live-v10_10_23.js?v=10.10.23-dietcompact1';"),'Atualizador não aquece a revisão compacta da dieta do aluno.');
assert(sw.includes("./modules/student-diet-compact-live-v10_10_23.js?v=10.10.23-dietcompact1"),'Shell offline não inclui a revisão compacta da dieta do aluno.');
const cacheHotfix=sw.match(/const CACHE_HOTFIX='([^']+)'/)?.[1]||'';
const heicRecovery=cacheHotfix==='heic-recovery1';
assert(cacheHotfix==='update-unblock1'||heicRecovery,'Build atual rotacionou o cache de resgate sem uma recuperação explicitamente auditada.');
if(heicRecovery){
  assert(sw.includes("'/modules/heic-report-conversion-v10_10_12.js'"),'Resgate HEIC exige conversor network-first.');
  assert(sw.includes("'/modules/heic-libheif-worker-v10_10_12.js'"),'Resgate HEIC exige worker network-first.');
  assert(sw.includes('if(stale.length)await forceRecoveredNavigation();'),'Resgate HEIC só pode navegar quando existe cache antigo detectado.');
}
assert(sw.includes('const SHELL_ITEM_TIMEOUT_MS=3000;'),'Pré-cache continua sem timeout explícito.');
assert(sw.includes('const ACTIVATION_SHELL=['),'Shell mínimo de ativação está ausente.');
assert(sw.includes('async function prepareActivationShell'),'Ativação rápida não prepara o shell mínimo.');
assert(sw.includes("await prepareActivationShell().catch(()=>false);await self.skipWaiting()"),'Instalação ainda pode esperar o shell completo antes do skipWaiting.');
assert(!sw.includes("await prepareShell().catch(()=>false);await self.skipWaiting()"),'Shell completo voltou a bloquear a instalação.');
assert(!/broadcast\([^;]+\);\s*await forceRecoveredNavigation\(\);\s*prepareShell\(\)/s.test(sw),'Ativação voltou a aquecer o shell inteiro em segundo plano.');
assert(sw.includes('if(stale.length)await forceRecoveredNavigation();'),'Navegação automática não está limitada a clientes com cache antigo.');
assert(sw.includes("current.searchParams.get('cache-rescue')===CACHE_HOTFIX"),'Navegação de resgate pode entrar em loop.');
assert(sw.includes("target.searchParams.set('cache-rescue',CACHE_HOTFIX)"),'Navegação de recuperação não identifica a revisão aplicada.');
assert(sw.includes("'/viewport_v10_10_9.js','/boot_v10.js'"),'Viewport/boot não estão explicitamente mutáveis.');
assert(sw.includes("'/modules/usability-checkup-v10_10_9.js'"),'Usabilidade estabilizada não está no caminho mutável.');
assert(sw.includes("'/modules/student-home-profile-v10_10_12.js'"),'Perfil do aluno não está no caminho mutável.');
assert(sw.includes("'/modules/student-home-layout-v10_10_15.js'"),'Layout do aluno não está no caminho mutável.');
assert(sw.includes("'/modules/student-home-layout-runtime-v10_10_16.js'"),'Ponte legada da Home não está no caminho mutável.');
assert(sw.includes("./modules/student-home-layout-v10_10_15.js?v=10.10.21-home4"),'Shell não prepara a Home otimizada atual.');

assert(sw.includes('async function navigationNetworkFirst'),'Navegação ainda não prioriza uma cópia fresca da rede.');
assert(!sw.includes('navigationCacheFirst(request,event)'),'Estratégia cache-first antiga reapareceu na navegação.');
const mutableCheck=sw.indexOf('if(MUTABLE_PATHS.has(relativePath))');
const genericVersioned=sw.indexOf("if(VERSIONED_PATH_PATTERN.test(fileName)||url.searchParams.has('v'))");
assert(mutableCheck>=0&&genericVersioned>=0&&mutableCheck<genericVersioned,'Arquivos mutáveis continuam caindo no cache-first por causa de ?v=.');
assert(sw.includes('const stale=keys.filter'),'Ativação não identifica caches antigos.');
assert(sw.includes('await Promise.all(stale.map(key=>caches.delete(key)))'),'Ativação não remove caches antigos.');
assert(sw.includes('await self.clients.claim()'),'Novo Service Worker não assume imediatamente os clientes abertos.');

assert(boot.includes("const LEGACY_ACTION='LIMPAR CACHE E REINICIAR'"),'Boot não reconhece especificamente o bloqueador legado mostrado no app.');
assert(boot.includes("const LEGACY_TITLE='ATUALIZACAO DO APLICATIVO'"),'Boot não restringe o fail-open ao diálogo legado de atualização.');
assert(boot.includes("root.dataset.tbLegacyUpdateBlocked='1'"),'Bloqueador legado não recebe marca de supressão persistente.');
assert(boot.includes("app.removeAttribute('inert')"),'Fail-open não devolve interação ao aplicativo.');
assert(boot.includes("window.TeamBullsUpdateFailOpen=Object.freeze"),'Guard fail-open não está exposto para recuperação manual/auditoria.');
assert(!update.includes("applyLatestUpdate({automatic:true})"),'Atualizador voltou a iniciar hotfix automaticamente e pode bloquear o usuário.');
assert(update.includes("host.querySelector('#team-bulls-update-later')"),'Atualização não preserva opção não bloqueante de adiar/fechar.');

assert(runtime.includes("const VERSION='10.10.18-runtime2'"),'Ponte legada da Home foi alterada sem necessidade.');
assert(!runtime.includes('setInterval('),'Ponte da Home voltou a fazer polling permanente e pode degradar desempenho.');
assert(runtime.includes("document.body.classList.contains('student-desktop')"),'Ponte leve não reconhece o contexto real do aluno.');

if(fail.length){
  console.error('FALHA — update fail-open/startup recovery\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log(`Update fail-open/startup recovery OK — build ${BUILD} coerente, atualização visível mais rápida e overlay legado sem bloqueio.`);