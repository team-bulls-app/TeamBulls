import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const fail=[];
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const bytes=rel=>fs.statSync(path.join(root,rel)).size;
const requireFile=rel=>{if(!fs.existsSync(path.join(root,rel)))fail.push(`Arquivo obrigatório ausente: ${rel}`);};
const assert=(condition,message)=>{if(!condition)fail.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

[
  'index.html','manifest.json','version.json','sw.js','sw_47.js','config_v10_7.js',
  'app_v10_10_9_core.js','styles_v10_10_9.css',
  'modules/stability_v10_10_9.js','modules/app-update-v10_10_9.js',
  'modules/diet-scroll-fix-v10_10_9.js','modules/modal-form-guard-v10_10_9.js',
  'modules/trainer-workspace-v10_10_9.js','modules/cardio-timer-fix-v10_10_9.js',
  'modules/global-performance-v10_10_9.js','modules/workout-ux-fix-v10_10_9.js',
  'modules/desktop-performance-v10_10_9.js','modules/ger-bulk-v10_10_9.js',
  'modules/prescription-actions-layout-v10_10_9.js','modules/modal-stack-stability-v10_10_9.js',
  'modules/photo-guide-v10_10_9.js','firebase/firestore_26_compacto.rules','firebase/storage_5.rules'
].forEach(requireFile);

function walk(dir){
  const out=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(['.git','node_modules'].includes(entry.name))continue;
    const full=path.join(dir,entry.name);
    if(entry.isDirectory())out.push(...walk(full));
    else if(entry.isFile()&&entry.name.endsWith('.js'))out.push(full);
  }
  return out;
}
for(const file of walk(root)){
  const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0)fail.push(`JavaScript inválido em ${path.relative(root,file)}: ${result.stderr.trim()}`);
}
for(const rel of ['manifest.json','version.json']){
  try{JSON.parse(read(rel));}catch(error){fail.push(`${rel} não é JSON válido: ${error.message}`);}
}

const index=read('index.html'),version=JSON.parse(read('version.json')).version;
assert(/<meta content="10\.10\.9" name="team-bulls-version"/.test(index),'Meta de versão do index não corresponde a 10.10.9.');
assert(version==='10.10.9','version.json não corresponde a 10.10.9.');
assert(bytes('app_v10_10_9_core.js')<900*1024,'Núcleo JavaScript ultrapassou 900 KiB; revisar divisão/carregamento sob demanda.');
assert(bytes('styles_v10_10_9.css')<280*1024,'CSS principal ultrapassou 280 KiB; revisar regras duplicadas e estilos críticos.');
assert(bytes('index.html')<190*1024,'index.html ultrapassou 190 KiB; revisar HTML crítico e conteúdo injetado.');

const config=read('config_v10_7.js');
[
  ['modules/stability_v10_10_9.js','Loader não inclui a camada de estabilidade.'],
  ['modules/app-update-v10_10_9.js','Loader não inclui a atualização de UX/performance.'],
  ['modules/diet-scroll-fix-v10_10_9.js','Loader não inclui a correção de scroll da dieta.'],
  ['modules/modal-form-guard-v10_10_9.js','Loader não inclui a proteção de modais.'],
  ['modules/trainer-workspace-v10_10_9.js?v=10.10.9-workspace3','Loader não usa workspace3 do visualizador de relatórios.'],
  ['modules/cardio-timer-fix-v10_10_9.js?v=10.10.9-cardio1','Loader não inclui o cronômetro corrigido.'],
  ['modules/global-performance-v10_10_9.js?v=10.10.9-perf2','Loader não inclui perf2.'],
  ['modules/workout-ux-fix-v10_10_9.js?v=10.10.9-workout1','Loader não inclui o hotfix de treino.'],
  ['modules/desktop-performance-v10_10_9.js?v=10.10.9-desktop1','Loader não inclui a otimização desktop.'],
  ['modules/ger-bulk-v10_10_9.js?v=10.10.9-ger1','Loader não inclui GER em lote.'],
  ['modules/prescription-actions-layout-v10_10_9.js?v=10.10.9-actions2','Loader não inclui actions2.'],
  ['modules/modal-stack-stability-v10_10_9.js?v=10.10.9-modal2&fix=freeze1','Loader não inclui modal2/freeze1.']
].forEach(([needle,message])=>has(config,needle,message));
assert(config.indexOf('global-performance-v10_10_9.js')<config.indexOf('workout-ux-fix-v10_10_9.js'),'Hotfix de treino precisa executar depois da camada global.');
assert(config.indexOf('workout-ux-fix-v10_10_9.js')<config.indexOf('desktop-performance-v10_10_9.js'),'Otimização desktop precisa executar depois do hotfix de treino.');
assert(config.indexOf('desktop-performance-v10_10_9.js')<config.indexOf('ger-bulk-v10_10_9.js'),'GER precisa executar depois das camadas de performance.');
assert(config.indexOf('ger-bulk-v10_10_9.js')<config.indexOf('prescription-actions-layout-v10_10_9.js'),'Layout de ações precisa executar depois do GER.');
assert(config.indexOf('prescription-actions-layout-v10_10_9.js')<config.indexOf('modal-stack-stability-v10_10_9.js'),'Estabilidade de modais precisa executar por último nas camadas de UI.');
has(config,"link.rel='preload';link.as='script';link.href=src",'Hotfixes não recebem preload de rede.');
has(config,'for(const src of modules)await loadScript(src)','Execução determinística dos hotfixes foi removida.');
lacks(config,"'./modules/photo-guide-v10_10_9.js?v=10.10.9',",'Guia de fotos voltou ao startup em vez de sob demanda.');

const update=read('modules/app-update-v10_10_9.js');
has(update,'input.multiple=true','Seletor múltiplo de fotos não foi encontrado.');
assert(update.includes('Lado direito braços estendidos')&&update.includes('Lado esquerdo braços estendidos'),'Nomes atuais das poses não estão presentes.');
has(update,"pass.autocomplete='current-password'",'Autocomplete seguro de senha não foi configurado.');
has(update,"where('studentId','==',studentUid).where('requestKey','==',request.requestKey)",'Proteção do primeiro relatório semanal ausente.');
assert(!/localStorage\.setItem\([^\n]*(pass|password|senha)/i.test(update),'Senha não pode ser armazenada em texto no localStorage.');

const dietScroll=read('modules/diet-scroll-fix-v10_10_9.js');
has(dietScroll,"document.getElementById('app')",'Correção de dieta não usa o scroller real #app.');
has(dietScroll,'scroller.scrollTop=state.appTop','Correção de dieta não restaura o scrollTop do #app.');
has(dietScroll,"'saveDietSupportItem'",'Salvar suplemento não está protegido contra regressão de rolagem.');

const modalGuard=read('modules/modal-form-guard-v10_10_9.js');
has(modalGuard,"classList.contains('modal-backdrop')",'Proteção de modal não identifica backdrop.');
has(modalGuard,'input:not([type="hidden"]),textarea,select','Proteção de modal não reconhece campos editáveis.');
has(modalGuard,'event.stopImmediatePropagation()','Proteção de modal não bloqueia listeners antigos.');
has(modalGuard,"event.key!=='Escape'",'Fechamento por ESC não está protegido.');
has(modalGuard,"document.addEventListener('keydown',closeTopModalWithEscape,{capture:true})",'ESC não está interceptado em captura.');

const modalStack=read('modules/modal-stack-stability-v10_10_9.js');
assert(modalStack.includes("version:'10.10.9-modal2'")&&modalStack.includes("patch:'freeze1'"),'Camada de modal não identifica modal2/freeze1.');
has(modalStack,'const ORPHAN_CONFIRMATIONS=2','Recuperação de backdrop ficou agressiva.');
has(modalStack,'const OFFSCREEN_CONFIRMATIONS=3','Recuperação de painel fora da área útil ficou agressiva.');
has(modalStack,'function panelCandidates(modal)','Detecção de painéis válidos ausente.');
has(modalStack,'function accessiblePanel(modal)','Detecção de painel acessível ausente.');
has(modalStack,'function finishPanelAnimations(modal)','Finalização segura de animações de modal ausente.');
has(modalStack,'function rescuePanelVisibility(modal)','Recuperação de visibilidade do painel ausente.');
has(modalStack,'keyboardEditing(top)','Recuperação não protege teclado/edição.');
has(modalStack,'actionInProgress()','Recuperação não respeita ACTION_LOCKS.');
lacks(modalStack,"showToast('A interface foi recuperada de um bloqueio de tela.",'Aviso visual de recuperação voltou a aparecer.');

const workspace=read('modules/trainer-workspace-v10_10_9.js');
assert(workspace.includes('RELATÓRIOS / FOTOS')&&workspace.includes('RASCUNHO'),'Atalhos rápidos do treinador ausentes.');
assert(workspace.includes("'screen-ts-workout'")&&workspace.includes("'screen-ts-diet-detail'"),'Workspace não cobre treino e dieta.');
has(workspace,"db.collection('trainerSupplementCatalog').doc(user.uid)",'Rascunho privado não usa documento trainer-only.');
has(workspace,'studentNotes','Rascunho não está separado por aluno.');
lacks(workspace,"db.collection('reportSettings')",'Rascunho privado não pode usar reportSettings.');
has(workspace,"db.collection('questionnaires').where('studentId','==',student.uid)",'Consulta rápida de questionários ausente.');
has(workspace,'fetchWeeklyCheckins(student.uid)','Consulta rápida de relatórios semanais ausente.');
has(workspace,'const REPORT_CACHE_TTL=45000','TTL curto de relatórios foi alterado.');
has(workspace,'function cachedReports(studentUid)','Cache curto de relatórios ausente.');
has(workspace,"loadQuickReports(true)",'Atualizar deixou de forçar consulta fresca.');
has(workspace,'function syncReportViewerCaches(weekly,questionnaires)','Sincronização dos caches oficiais do visualizador ausente.');
has(workspace,"if(typeof WEEKLY_CHECKINS!=='undefined')WEEKLY_CHECKINS=safeWeekly",'WEEKLY_CHECKINS não é restaurado em cache hit.');
has(workspace,"if(typeof TS_QUEST_CACHE!=='undefined')TS_QUEST_CACHE=safeQuestionnaires",'TS_QUEST_CACHE não é restaurado em cache hit.');
has(workspace,'syncReportViewerCaches(weekly,questionnaires);','Render rápido não sincroniza caches antes dos cliques.');
has(workspace,"openExistingReport(()=>viewWeeklyCheckin(id),'modal-weekly-checkin-view')",'Relatório semanal não declara seu modal definitivo.');
has(workspace,"openExistingReport(()=>viewQuestionnaire(id,true),'modal-view-quest')",'Relatório solicitado não declara seu modal definitivo.');
const transitionStart=workspace.indexOf('async function openExistingReport(viewer,targetModalId)');
const transitionEnd=workspace.indexOf('function renderQuickReports',transitionStart);
const transition=transitionStart>=0&&transitionEnd>transitionStart?workspace.slice(transitionStart,transitionEnd):'';
has(transition,'if(!reportViewerIsOpen(targetModalId))await Promise.resolve(result)','Transição não aguarda viewer assíncrono quando necessário.');
has(transition,"if(!reportViewerIsOpen(targetModalId))throw new Error('Visualizador não abriu: '+targetModalId)",'Transição não confirma a abertura do modal definitivo.');
assert(transition.indexOf("throw new Error('Visualizador não abriu: '+targetModalId)")<transition.indexOf("closeModal('tb-trainer-reports-modal')"),'Consulta rápida fecha antes de confirmar o visualizador definitivo.');
has(workspace,"version:'10.10.9-workspace3'",'Workspace não identifica workspace3.');
has(workspace,"['showScreen','openModal','closeModal'].forEach(wrapUiFunction)",'Workspace não sincroniza pelas funções reais de UI.');
has(workspace,"observer.observe(modal,{attributes:true,attributeFilter:['class']})",'Observação individual dos modais ausente.');
has(workspace,"additionsObserver.observe(document.body,{subtree:true,childList:true})",'Workspace não acompanha modais adicionados.');
lacks(workspace,"observer.observe(document.body,{subtree:true,childList:true,attributes:true",'Workspace voltou a observar atributos de toda a árvore.');

const cardioFix=read('modules/cardio-timer-fix-v10_10_9.js');
has(cardioFix,"((Number(state.endAt)||0)-Date.now())/1000",'Cronômetro de cardio não calcula endAt - Date.now().');
lacks(cardioFix,'(Number(state.endAt)||0-Date.now())','Regressão de precedência do cardio reapareceu.');
has(cardioFix,'readCardioTimer=fixedReadCardioTimer','Hotfix não substitui leitura do cardio.');
has(cardioFix,'ensureCardioTimerTicker=fixedEnsureCardioTimerTicker','Ticker otimizado do cardio ausente.');
has(cardioFix,"document.addEventListener('visibilitychange',syncVisibleTimer",'Cardio não sincroniza ao retornar do segundo plano.');

const performance=read('modules/global-performance-v10_10_9.js');
has(performance,'touch-action:manipulation','Camada global não otimiza resposta de toque.');
has(performance,'backdrop-filter:none!important','Camada móvel não reduz blur caro.');
has(performance,'input[type="number"]','Campos numéricos móveis não estão protegidos.');
lacks(performance,'html.tb-page-hidden *{animation-play-state:paused!important}','Transições curtas não podem ser pausadas globalmente.');
has(performance,'html.tb-page-hidden :where(.spinner,.survival-pulse,.pull-refresh-spinner){animation-play-state:paused!important}','Animações contínuas não são pausadas seletivamente.');
has(performance,"finishElementAnimations(document.querySelector('.screen.active'))",'Tela ativa não é estabilizada ao retornar.');
has(performance,"version:'10.10.9-perf2'",'Performance global não identifica perf2.');

const workoutUx=read('modules/workout-ux-fix-v10_10_9.js');
has(workoutUx,"'screen-ts-workout','screen-ts-day','screen-ts-exercise'",'Correção de scroll não cobre telas do treinador.');
has(workoutUx,'appTop:Number(app?.scrollTop||0)','Correção de treino não captura #app.scrollTop.');
has(workoutUx,'ACTION_SCROLLS.set(key,captureScroll())','Gravações de treino não preservam posição.');
has(workoutUx,'overscroll-behavior-y:auto!important','Quadro semanal voltou a prender gesto vertical.');

const desktopPerformance=read('modules/desktop-performance-v10_10_9.js');
has(desktopPerformance,"const DESKTOP_MEDIA='(min-width:900px) and (pointer:fine)'",'Otimização desktop não está isolada.');
has(desktopPerformance,'content-visibility:auto','Listas desktop não usam renderização sob demanda.');
has(desktopPerformance,'ChartCtor.defaults.devicePixelRatio=ratio','Gráficos desktop não limitam DPR.');
has(desktopPerformance,'ChartCtor.defaults.animation=false','Gráficos desktop ainda animam.');
has(desktopPerformance,"image.loading='lazy'",'Imagens desktop não usam lazy loading.');
lacks(desktopPerformance,'MutationObserver','Otimização desktop não deve adicionar observador permanente.');

const gerBulk=read('modules/ger-bulk-v10_10_9.js');
has(gerBulk,'GER S<span id="tb-ger-week-label">1</span> → TODOS EXERCÍCIOS','GER semanal em lote ausente.');
has(gerBulk,'GER → 8 SEMANAS DESTE EXERCÍCIO','GER do exercício em 8 semanas ausente.');
has(gerBulk,"next['w'+week]=setsWithGer(resolved.sets,ger)",'GER semanal não materializa somente a semana alvo.');
has(gerBulk,"Object.prototype.hasOwnProperty.call(next,planKey)",'GER de 8 semanas não preserva herança.');
has(gerBulk,"changes.forEach(change=>batch.update(db.collection('exercises').doc(change.exercise.id),{weeklyPlan:change.next}))",'GER cloud não usa batch atômico.');
has(gerBulk,'changes.forEach(change=>{change.exercise.weeklyPlan=change.before;})','GER local não possui rollback.');
has(gerBulk,"CURRENT_USER?.role==='trainer'",'GER cloud não restringe treinador.');
lacks(gerBulk,'weeklyTechniquePlan:','GER em lote não pode sobrescrever técnicas.');
lacks(gerBulk,"db.collection('sessions')",'GER em lote não pode alterar sessões realizadas.');

const prescriptionActions=read('modules/prescription-actions-layout-v10_10_9.js');
has(prescriptionActions,"const CENTER_ID='tb-prescription-actions-center'",'Central de ações ausente.');
has(prescriptionActions,"REQUIRED_KEYS.every(key=>actions[key])",'Fallback do layout antigo ausente.');
assert(prescriptionActions.includes('SALVAR TODA A SEMANA')&&prescriptionActions.includes('SALVAR SOMENTE SÉRIES, REPS E GER')&&prescriptionActions.includes('SALVAR SOMENTE AS TÉCNICAS'),'Grupo Salvar incompleto.');
assert(prescriptionActions.includes('confirmReplicatePrescription()')&&prescriptionActions.includes('confirmCopyCurrentWeekToAllExercises()')&&prescriptionActions.includes("confirmPropagateWeekTechniques('below-current')")&&prescriptionActions.includes("confirmPropagateWeekTechniques('source-future')"),'Ações organizadas não chamam handlers reais.');
has(prescriptionActions,'function fallbackOriginalClick(key)','Fallback dos botões originais ausente.');
has(prescriptionActions,"db.collection('exercises').doc(exercise.id).update({weeklyPlan})",'Salvar séries/reps/GER não atualiza weeklyPlan.');
lacks(prescriptionActions,"db.collection('sessions')",'Central de ações não pode alterar sessões.');
lacks(prescriptionActions,'weeklyTechniquePlan:','Salvar séries/reps/GER não pode sobrescrever técnicas.');
has(prescriptionActions,"version:'10.10.9-actions2'",'Central de ações não identifica actions2.');
has(prescriptionActions,'@media(max-width:899px)','Central de ações não possui adaptação mobile.');
lacks(prescriptionActions,'MutationObserver','Central de ações não deve observar DOM permanentemente.');

const core=read('app_v10_10_9_core.js');
has(core,'const BASE_APPLY_APP_SETTINGS=applyAppSettings;','Aplicador final de configurações precisa preservar a lógica compartilhada do tema.');
has(core,'BASE_APPLY_APP_SETTINGS();','Trocar o tema deve atualizar os tokens visuais imediatamente.');
has(core,"if(APP_SETTINGS.theme!=='light')",'A paleta escura deve ser aplicada somente enquanto o tema escuro estiver selecionado.');
has(core,'state.endAt=Date.now()+state.remainingSeconds*1000','Fluxo principal não persiste endAt do cardio.');
has(core,'function pauseCardioTimer()','Pausa do cardio ausente.');
has(core,'function resetCardioTimer()','Reset do cardio ausente.');
has(core,'function resolveWeekPrescription(exercise,week)','Resolução de prescrição herdada ausente.');
has(core,'function refreshPlanViewsAfterWeeklyTechniqueChange(exercise,week)','Refresh seguro de prescrição ausente.');
const themeCss=read('styles_v10_10_9.css');
const lightThemeStart=themeCss.indexOf('/* Tema claro: canvas branco, componentes e controles mantêm a paleta original. */');
const lightThemeCss=lightThemeStart>=0?themeCss.slice(lightThemeStart):'';
has(lightThemeCss,'html[data-theme="light"] #app,html[data-theme="light"] .screen.active{background:#fff}','Tema claro deixou de usar canvas branco.');
has(lightThemeCss,'html[data-theme="light"] .trainer-title{color:#27221f;text-shadow:none}','Título do treinador perdeu contraste no canvas branco.');
assert(!/\bbutton\b|\.btn-|quick-nav-btn|toggle-btn/.test(lightThemeCss),'Tema claro passou a repintar botões ou controles.');
assert(!/--(?:surface|card|border|text|accent)\s*:/.test(lightThemeCss),'Tema claro alterou a paleta original dos componentes.');
const opaquePanelsStart=lightThemeCss.indexOf('/* No canvas claro, os painéis de conteúdo continuam sólidos e com leitura clara. */');
const opaquePanelsCss=opaquePanelsStart>=0?lightThemeCss.slice(opaquePanelsStart):'';
has(opaquePanelsCss,'html[data-theme="light"] .diet-page-intro,\nhtml[data-theme="light"] .workout-card,\nhtml[data-theme="light"] .diet-folder-card{\n  background-color:#262422;\n  background-image:none;','Painéis do tema claro deixaram de usar superfície escura sólida.');
has(opaquePanelsCss,'html[data-theme="light"] .workout-card.is-active{background-color:#301d1e;background-image:none;border-color:#a51e20}','Protocolo ativo ficou translúcido ou perdeu contraste.');
has(opaquePanelsCss,'html[data-theme="light"] .workout-card.is-inactive{background-color:#2b2927;background-image:none;border-color:#665a50;opacity:1;filter:none}','Protocolos desativados ficaram translúcidos ou sem contraste.');
has(opaquePanelsCss,'html[data-theme="light"] .diet-folder-card.is-inactive{background-color:#2b2927;background-image:none;opacity:1;filter:none}','Planos desativados ficaram translúcidos ou sem contraste.');
has(opaquePanelsCss,'html[data-theme="light"] .diet-folder-name{color:#f0e8de}','Nome da dieta perdeu contraste sobre o cartão escuro.');
has(opaquePanelsCss,'html[data-theme="light"] .workout-card-name{color:#f0e8de}','Nome do treino perdeu contraste sobre o cartão escuro.');
has(opaquePanelsCss,'html[data-theme="light"] .global-report-guide-panel{background-color:#262422;background-image:none;border-color:#554a42}','Painel do guia de fotos ficou translúcido no tema claro.');
has(opaquePanelsCss,'html[data-theme="light"] .global-report-guide-panel>p{color:#ded7ce}','Descrição do guia de fotos perdeu contraste.');
has(opaquePanelsCss,'html[data-theme="light"] .quest-card-preview{color:#ded7ce}','Histórico de relatórios perdeu contraste.');
has(opaquePanelsCss,'html[data-theme="light"] #tb-weekly-report-current .tb-weekly-current-meta{color:#ded7ce}','Texto do relatório semanal perdeu contraste.');
has(opaquePanelsCss,'html[data-theme="light"] .diet-support-table td{background:#2b2927;color:#ded7ce;border-color:#554a42}','Tabela de dieta perdeu fundo sólido ou legibilidade.');
has(opaquePanelsCss,'html[data-theme="light"] .food-options-table td{background:#2b2927;border-color:#554a42}','Tabela de alimentos deixou de usar células escuras sólidas.');
has(opaquePanelsCss,'html[data-theme="light"] .food-options-table .food-table-empty{background:#252321;background-image:none;opacity:1}','Células vazias da tabela de alimentos ficaram claras ou translúcidas.');
assert(!opaquePanelsCss.includes('.supplements-free-meal-card'),'Tema claro repintou o atalho de refeições livres.');
assert(!/rgba?\(/.test(opaquePanelsCss),'Painéis do tema claro passaram a usar fundos com transparência.');

const sw=read('sw.js'),bridge=read('sw_47.js');
has(sw,"const APP_VERSION='10.10.9'",'Service Worker com versão divergente.');
has(sw,"const CACHE_REVISION='lighttheme7'",'Service Worker não criou a revisão do tema claro.');
has(sw,'const SHELL_FETCH_CONCURRENCY=4','Concorrência do shell crítico não está limitada.');
has(sw,'async function cachePathsWithLimit','Preparação de shell com limite ausente.');
[
  './modules/app-update-v10_10_9.js?v=10.10.9',
  './modules/diet-scroll-fix-v10_10_9.js?v=10.10.9',
  './modules/modal-form-guard-v10_10_9.js?v=10.10.9',
  './modules/trainer-workspace-v10_10_9.js?v=10.10.9-workspace3',
  './modules/cardio-timer-fix-v10_10_9.js?v=10.10.9-cardio1',
  './modules/global-performance-v10_10_9.js?v=10.10.9-perf2',
  './modules/workout-ux-fix-v10_10_9.js?v=10.10.9-workout1',
  './modules/desktop-performance-v10_10_9.js?v=10.10.9-desktop1',
  './modules/ger-bulk-v10_10_9.js?v=10.10.9-ger1',
  './modules/prescription-actions-layout-v10_10_9.js?v=10.10.9-actions2',
  './modules/modal-stack-stability-v10_10_9.js?v=10.10.9-modal2&fix=freeze1'
].forEach(asset=>has(sw,`'${asset}'`,`Shell offline não inclui ${asset}.`));
assert(bridge.replace('ponte de migração para instalações controladas pelo antigo sw_47.js','Service Worker estável e atualização sem reinstalação')===sw,'sw_47.js divergiu do Service Worker principal.');
const requiredShellBlock=sw.slice(sw.indexOf('const REQUIRED_SHELL=['),sw.indexOf('const OPTIONAL_SHELL=['));
lacks(requiredShellBlock,'photo-guide','Guia de fotos não pode entrar no shell crítico.');
assert(!/\.mp3/i.test(requiredShellBlock),'Áudio pesado não pode entrar no shell crítico.');

const firestore=read('firebase/firestore_26_compacto.rules');
has(firestore,'match /weeklyCheckins/{id}','Regra de weeklyCheckins ausente.');
has(firestore,'request.resource.data.photoIds.size() == 6','Relatório semanal deixou de exigir 6 fotos.');
has(firestore,"request.resource.data.get('requiredPhotoCount', 6) == 6",'Questionário fotográfico deixou de exigir 6 fotos.');
assert(firestore.includes('match /trainerSupplementCatalog/{trainerUid}')&&firestore.includes('allow read: if isTrainer() && request.auth.uid == trainerUid'),'Rascunho privado deixou de ser trainer-only.');
assert(firestore.includes('match /exercises/{id}')&&firestore.includes("request.resource.data.get('weeklyPlan', {}) is map"),'Regra de exercícios deixou de aceitar weeklyPlan válido.');

const storage=read('firebase/storage_5.rules');
has(storage,'match /progressPhotos/{uid}/{photoId}.jpg','Regra das fotos principais ausente.');
has(storage,'match /progressPhotoThumbs/{uid}/{photoId}.jpg','Regra das miniaturas ausente.');

if(fail.length){
  console.error('\nFalhas de qualidade:\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log(`Quality check OK — ${walk(root).length} arquivos JavaScript verificados.`);
