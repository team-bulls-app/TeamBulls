import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const fail=[];
const assert=(ok,message)=>{if(!ok)fail.push(message);};
const read=file=>fs.readFileSync(file,'utf8');
const SESSION_PERSISTENCE_BASELINE_BUILD=2026090401;
const viewport=read('viewport_v10_10_9.js');
const core=read('app_v10_10_9_core.js');
const boot=read('boot_v10.js');
const sw=read('sw.js');
const sw47=read('sw_47.js');
const updater=read('update_v10_10_9.js');
const version=JSON.parse(read('version.json'));
const publishedBuild=Number(version.build);

for(const file of ['viewport_v10_10_9.js','boot_v10.js','update_v10_10_9.js']){
  const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert(syntax.status===0,`${file} possui JavaScript inválido: ${String(syntax.stderr||'').trim()}`);
}

const earlyBoot=boot.slice(0,boot.indexOf('window.__fbLoadErrors=0;'));
assert(boot.includes('__TEAM_BULLS_EARLY_AUTH_AUTOFILL_101027__'),'Cold start não instala o guard antecipado de autofill atual.');
assert(boot.indexOf('__TEAM_BULLS_EARLY_AUTH_AUTOFILL_101027__')<boot.indexOf('__TEAM_BULLS_BOOT_SAFETY_2__'),'Guard de autofill precisa existir antes do boot normal.');
assert(earlyBoot.includes("form.setAttribute('autocomplete','on')"),'Formulário não nasce corrigido para autofill no cold start.');
assert(earlyBoot.includes("email.setAttribute('autocomplete','username')"),'E-mail não é convertido cedo para username.');
assert(earlyBoot.includes("password.setAttribute('autocomplete','current-password')"),'Senha não é convertida cedo para current-password.');
assert(earlyBoot.includes("['data-1p-ignore','data-lpignore','data-form-type','aria-autocomplete'].forEach"),'Marcadores que bloqueiam gerenciador de senhas não são removidos cedo.');
assert(earlyBoot.includes("observer.observe(document.documentElement,{childList:true,subtree:true})"),'Guard não acompanha a criação do formulário durante o parse inicial.');
assert(earlyBoot.includes("document.addEventListener('focusin'"),'Cold start não reforça a semântica antes do foco nos campos.');

assert(core.includes("const persistence=role==='trainer'?firebase.auth.Auth.Persistence.SESSION:firebase.auth.Auth.Persistence.LOCAL"),'A regressão precisa reconhecer a política legada SESSION do treinador que o hotfix neutraliza.');
assert(earlyBoot.includes('__TEAM_BULLS_PERSISTENT_AUTH_101027__'),'Cold start não instala a política persistente atual do PWA.');
assert(earlyBoot.includes("firebase.auth?.Auth?.Persistence?.LOCAL"),'Sessão do PWA não resolve explicitamente Persistence.LOCAL do Firebase.');
assert(earlyBoot.includes('authInstance.setPersistence(persistence)'),'Persistência LOCAL não é aplicada ao Auth real quando ele fica disponível.');
assert(earlyBoot.includes('configureAuthPersistence.__tbPersistentPwaSession101027'),'Política legada por função ainda pode rebaixar o treinador para SESSION depois do login.');
assert(earlyBoot.includes('configureAuthPersistence=wrapped'),'Guard não substitui a política legada após o core ficar disponível.');
assert(earlyBoot.includes('startAuthListener.__tbPersistentBeforeListener101027'),'Listener do Firebase pode iniciar sem tentativa prévia de persistência LOCAL.');
assert(earlyBoot.includes('boundedPersistence(450).finally(()=>base.apply(context,args))'),'Listener não possui fail-open limitado ao aplicar persistência antes da restauração.');
assert(earlyBoot.includes('doLogin.__tbPersistentBeforeLogin101027'),'Login pode executar antes da política LOCAL ficar instalada.');
assert(earlyBoot.includes('await boundedPersistence(700)'),'Sign-in não aguarda uma tentativa limitada de persistência LOCAL.');
assert(earlyBoot.includes('if(installed&&applied)return'),'Polling ainda pode encerrar somente porque funções foram embrulhadas, sem Auth pronto.');
assert(earlyBoot.includes("window.addEventListener('online'"),'Retorno da conexão não reaplica a política de persistência.');
assert(core.includes("auth.signOut(),4000,'saída da conta'"),'Logout explícito precisa continuar encerrando a sessão persistente.');
assert(!/localStorage[^\n]*(?:password|login-pass|tb_access_secret)/i.test(earlyBoot),'Guard antecipado não pode persistir senha no localStorage.');
assert(!/sessionStorage[^\n]*(?:password|login-pass|tb_access_secret)/i.test(earlyBoot),'Guard antecipado não pode persistir senha no sessionStorage.');

assert(Number.isInteger(publishedBuild)&&publishedBuild>=SESSION_PERSISTENCE_BASELINE_BUILD,'version.json regrediu para antes do hotfix que publicou a persistência de sessão.');
assert(updater.includes(`const CURRENT_BUILD=${publishedBuild};`),'Atualizador local precisa reconhecer o mesmo build publicado no version.json.');
assert(sw.includes(`const BUILD_REVISION=${publishedBuild};`),'Service Worker principal precisa reconhecer o mesmo build publicado no version.json.');
assert(sw47.includes(`const BUILD_REVISION=${publishedBuild};`),'Service Worker legado precisa reconhecer o mesmo build publicado no version.json.');
assert(sw===sw47,'Service Workers precisam permanecer idênticos após um hotfix de sessão.');
assert(updater.includes("fetch(`${VERSION_URL}?t=${Date.now()}`,{cache:'no-store'"),'Verificação de versão precisa continuar ignorando cache HTTP.');
assert(updater.includes("'./boot_v10.js?v=10.10.9'"),'Atualizador precisa renovar boot_v10.js entre os arquivos críticos do PWA.');

assert(viewport.includes("const REVISION='10.10.25-session1';"),'Camada de estabilidade móvel não possui revisão própria.');
assert(viewport.includes("email.setAttribute('autocomplete','username')"),'Login não devolve semântica username ao gerenciador de senhas.');
assert(viewport.includes("password.setAttribute('autocomplete','current-password')"),'Login não devolve semântica current-password ao gerenciador de senhas.');
assert(viewport.includes("['data-1p-ignore','data-lpignore','data-form-type','aria-autocomplete'].forEach"),'Atributos que bloqueavam autofill continuam ativos.');
assert(viewport.includes("const LAST_EMAIL_KEY='team_bulls_last_login_email_v1';"),'Último e-mail não possui memória local segura.');
assert(viewport.includes("profile=JSON.parse(safeGet('team_bulls_profile_v9_5_'+uid)||'null')"),'E-mail não possui fallback pelo perfil já conhecido do próprio usuário.');
assert(!/safeSet\([^\n]{0,80}(?:password|login-pass)/i.test(viewport),'Camada nova não pode persistir senha em texto puro.');

assert(core.includes("const cachedShellOpened=restoreCachedStudentAccess(user,{code:'team-bulls/fast-session'},{silent:true});"),'Fluxo canônico de restauração rápida mudou sem atualizar a proteção.');
assert(viewport.includes("reason?.code==='team-bulls/fast-session'&&options?.silent===true&&navigator.onLine!==false"),'Restauração online ainda pode abrir Home em modo offline antes de validar o perfil.');
assert(viewport.includes("setPending(true,'validating-online-profile');return false"),'Gate online não mantém a sessão em validação.');
assert(viewport.includes("accessMode()!=='offline-registered'"),'Recuperação de conexão não está limitada ao fallback offline registrado.');
assert(viewport.includes('Promise.resolve(handleAuthStateUser(user))'),'Fallback offline não retorna automaticamente à sessão cloud quando a conexão volta.');

assert(core.includes('clearTransientAuthSecrets();'),'Core ainda possui a limpeza sensível que precisa ser mediada pela camada móvel.');
assert(viewport.includes("if(activeScreen()==='screen-auth'||authRestorePending())return false"),'Senha ainda pode ser limpa enquanto login/restauração não terminou.');
assert(viewport.includes("if(result!==false&&(id==='screen-home'||id==='screen-trainer')&&committedAccess())"),'Segredos não são limpos no commit real da navegação autenticada.');
assert(viewport.includes("if(id==='screen-auth'&&authRestorePending())"),'Watchdogs ainda podem substituir uma restauração válida pela tela de login.');
assert(viewport.includes('__tbSessionRestoreGuard:true,activateAuth(message)'),'Boot fail-open não é mediado durante restauração real.');
assert(boot.includes("window.TeamBullsRuntimeStabilityBoot?.activateAuth?.(message)"),'Boot deixou de usar o ponto mediável de fail-open.');
assert(viewport.includes("activeScreen()!=='screen-loading'||firebaseUser()||processingUid()"),'Barreira final de 12 s pode expulsar uma autenticação realmente em processamento.');

for(const path of [
  '/modules/student-home-profile-v10_10_12.js',
  '/modules/student-home-layout-v10_10_15.js',
  '/modules/student-workout-library-v10_10_24.js',
  '/modules/student-diet-compact-live-v10_10_23.js',
  '/modules/student-diet-layout-v10_10_24.js',
  '/modules/student-hotbar-payments-v10_10_22.js',
  '/modules/supply-options-label-v10_10_24.js'
])assert(viewport.includes(`'${path}'`),`Reparo cirúrgico de cache não inclui ${path}.`);
assert(viewport.includes("if(navigator.onLine===false||!('caches'in window))return false"),'Reparo de cache pode apagar módulos durante abertura offline.');
assert(viewport.includes("filter(name=>name.startsWith('team-bulls-'))"),'Reparo de cache não está limitado aos caches do app.');
assert(viewport.includes('cache.delete(request)'),'Cópias críticas antigas não são invalidadas antes do runtime do aluno.');
assert(!viewport.includes('caches.delete(name)'),'Camada de sessão não deve limpar caches inteiros do usuário.');
assert(viewport.includes('Promise.resolve(window.TeamBullsCriticalCacheRepair).finally(run)'),'Runtime pode iniciar antes do reparo da cópia crítica antiga.');

assert(viewport.includes("root.classList.add('tb-student-runtime-pending')"),'Home não possui estado transitório contra flash do layout antigo.');
assert(viewport.includes("window.addEventListener('team-bulls-student-runtime-ready',finishStudentRuntimePending)"),'Estado anti-flash não termina quando runtime atual fica pronto.');
assert(viewport.includes("window.TeamBullsRuntimeLoader?.student?.()"),'Home não antecipa a carga do runtime prioritário depois do login.');
assert(!viewport.includes('new MutationObserver'),'Correção de sessão não deve adicionar observer global.');

assert(core.includes("function canUseCatalogVideos(){return MODE==='cloud'&&CURRENT_USER?.role==='student'&&CURRENT_USER?.status!=='inactive';}"),'Gate de vídeos mudou sem atualizar a regressão de sessão.');
assert(viewport.includes("currentUser()?.role==='student'&&coreMode()==='cloud'&&accessMode()==='cloud-active'"),'Runtime do aluno pode ser iniciado num contexto offline transitório e manter vídeos bloqueados.');
assert(sw.includes("'/viewport_v10_10_9.js','/boot_v10.js'"),'Service Worker deixou de tratar a camada de sessão/viewport como mutável network-first.');

if(fail.length){
  console.error('FALHA — estabilidade de login/sessão/runtime móvel\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log(`APROVADO — cold start preserva persistência LOCAL desde o build ${SESSION_PERSISTENCE_BASELINE_BUILD}; build publicado ${publishedBuild} segue coerente entre atualizador e Service Workers.`);
