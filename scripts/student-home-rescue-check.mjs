import fs from 'node:fs';

const fail=[];
const assert=(condition,message)=>{if(!condition)fail.push(message);};
const read=file=>fs.readFileSync(file,'utf8');

const modulePath='modules/student-home-layout-v10_10_15.js';
const profilePath='modules/student-home-profile-v10_10_12.js';
const usabilityPath='modules/usability-checkup-v10_10_9.js';
const runtimePath='modules/student-home-layout-runtime-v10_10_16.js';
const indexesPath='firebase/firestore.indexes.json';
for(const path of [modulePath,profilePath,usabilityPath,runtimePath,indexesPath])assert(fs.existsSync(path),`Módulo/configuração obrigatória ausente: ${path}`);

const home=fs.existsSync(modulePath)?read(modulePath):'';
const profile=fs.existsSync(profilePath)?read(profilePath):'';
const usability=fs.existsSync(usabilityPath)?read(usabilityPath):'';
const runtime=fs.existsSync(runtimePath)?read(runtimePath):'';
const config=read('config_v10_7.js');
const update=read('update_v10_10_9.js');
const sw=read('sw.js');
const sw47=read('sw_47.js');
const boot=read('boot_v10.js');
const version=JSON.parse(read('version.json'));
const firebase=JSON.parse(read('firebase.json'));
const indexes=JSON.parse(read(indexesPath));
const build=Number(version.build);

for(const [name,source] of [['Home',home],['Perfil',profile],['Usabilidade',usability],['Ponte legada',runtime],['Config',config],['Atualizador',update],['Service Worker',sw],['Boot',boot]]){
  try{new Function(source);}catch(error){fail.push(`${name} possui erro de sintaxe: ${error.message}`);}
}

assert(version.version==='10.10.9','Hotfix deve manter a versão compatível 10.10.9.');
assert(Number.isInteger(build)&&build>=2026090102,'Build publicado regrediu para antes da revisão de performance da Home.');
assert(typeof version.revision==='string'&&version.revision.trim().length>0,'version.json precisa identificar a revisão publicada.');
assert(update.includes(`const CURRENT_BUILD=${build};`),'Atualizador não está no mesmo build publicado.');
assert(sw.includes(`const BUILD_REVISION=${build};`),'Service Worker não está no mesmo build publicado.');
assert(sw47.includes(`const BUILD_REVISION=${build};`),'Service Worker legado não está no mesmo build publicado.');
assert(sw===sw47,'sw.js e sw_47.js devem permanecer idênticos.');
assert(sw.includes("const CACHE_HOTFIX='update-unblock1';"),'Performance não deve reativar uma navegação forçada de cache.');

assert(update.includes("STUDENT_HOME_MODULE='./modules/student-home-profile-v10_10_12.js?v=10.10.20-studenthome3'"),'Atualizador não conhece o perfil estabilizado.');
assert(update.includes("STUDENT_HOME_LAYOUT_MODULE='./modules/student-home-layout-v10_10_15.js?v=10.10.21-home4'"),'Atualizador não conhece a Home otimizada.');
assert(update.includes('loadStudentHomeModules'),'Home não é preservada pelo caminho opcional pós-boot.');
assert(update.includes('STUDENT_HOME_MODULE,STUDENT_HOME_LAYOUT_MODULE'),'Módulos da Home não estão no refresh crítico.');
assert(update.includes('function localLikeRuntime()'),'Atualizador não diferencia o modo local ao decidir fallbacks opcionais.');
assert(update.includes("if(typeof MODE!=='undefined'&&MODE==='local')return true"),'Atualizador pode bloquear ferramentas opcionais necessárias no modo local.');
assert(update.includes('function studentHomeRelevant()'),'Atualizador não filtra o fallback da Home por contexto.');
assert(update.includes('function techniqueCompositionRelevant()'),'Atualizador não filtra a composição de técnicas por contexto.');
assert(update.includes("if(role==='student')return false;if(role==='trainer')return true"),'Composição de técnicas pode voltar a ser injetada no aluno cloud.');
assert(update.includes('if(!techniqueCompositionRelevant())return Promise.resolve(false)'),'Loader opcional de técnicas ignora o gate de papel.');
assert(update.includes('if(!studentHomeRelevant())return false'),'Loader opcional da Home pode executar em sessão de treinador.');
assert(update.includes('if(!techniqueCompositionRelevant())return;loadTechniqueCompositionIntegrity()'),'Agendamento de técnicas não evita trabalho redundante fora do contexto.');
assert(update.includes('if(!studentHomeRelevant())return;loadStudentHomeModules()'),'Agendamento da Home não evita trabalho redundante fora do contexto.');

assert(config.includes('const studentPriorityModules=['),'Loader não possui prioridade de runtime para a Home do aluno.');
assert(config.includes("'./modules/student-home-profile-v10_10_12.js?v=10.10.20-studenthome3'"),'Perfil estabilizado não é prioridade do runtime.');
assert(config.includes("'./modules/student-home-layout-v10_10_15.js?v=10.10.21-home4'"),'Layout otimizado não é prioridade do runtime.');
assert(!config.includes("'./modules/student-home-layout-runtime-v10_10_16.js?v=10.10.16-runtime1'"),'Ponte legada voltou a executar no loader atual.');
assert(config.includes('deferredComplete=false,completedRole='),'Loader não registra conclusão por papel.');
assert(config.includes('const trainerOnlyModules=new Set(['),'Loader não separa módulos exclusivos do treinador.');
for(const trainerModule of ['trainer-workspace-v10_10_9.js?v=10.10.9-workspace3','trainer-diet-workspace-v10_10_11.js?v=10.10.11-dietworkspace1','trainer-inbox-payments-v10_10_12.js?v=10.10.12-inboxpayments2'])assert(config.includes(trainerModule),`Módulo de treinador ausente do gate conservador: ${trainerModule}`);
assert(config.includes('const studentExcludedModules=new Set(['),'Loader não possui o gate específico de aluno cloud.');
const cloudStudentExcluded=[
  'ger-bulk-v10_10_9.js?v=10.10.9-ger1',
  'prescription-actions-layout-v10_10_9.js?v=10.10.9-actions2',
  'prescription-propagation-v10_10_9.js?v=10.10.9-propagation1',
  'diet-delete-fix-v10_10_9.js?v=10.10.9-dietdelete1',
  'diet-calculation-math-v10_10_9.js?v=10.10.10-dietmath1',
  'diet-calculation-evolution-v10_10_9.js?v=10.10.10-dietcalc1',
  'diet-portion-presets-v10_10_9.js?v=10.10.10-portions1',
  'diet-live-calories-v10_10_11.js?v=10.10.11-dietcalories2',
  'custom-food-calorie-bridge-v10_10_12.js?v=10.10.12-customfood2'
];
for(const moduleName of cloudStudentExcluded)assert(config.includes(`MODULE_ROOT+'${moduleName}'`),`Aluno cloud ainda pode carregar ferramenta de edição: ${moduleName}`);
assert(config.includes("if(typeof MODE!=='undefined'&&MODE==='local')return false"),'Gate do aluno cloud pode bloquear ferramentas necessárias no modo local.');
assert(config.includes("if(trainerOnlyModules.has(src))return role==='trainer'"),'Gate por papel não exige treinador para módulos estritamente exclusivos.');
assert(config.includes('if(studentExcludedModules.has(src))return !cloudStudentRuntime()'),'Gate de performance não exclui ferramentas de edição apenas do aluno cloud.');
assert(config.includes('if(!roleAllowsModule(src))return true'),'Aluno ainda executa módulos bloqueados pelo gate de papel.');
const excludedStart=config.indexOf('const studentExcludedModules=new Set(['),excludedEnd=config.indexOf('const loadedModules=',excludedStart),excludedBlock=config.slice(excludedStart,excludedEnd);
for(const requiredStudentModule of ['student-guidance-v10_10_9-v2.js','diet-personalization-v10_10_11.js','report-photo-ux-v10_10_10.js','photo-quality-download-v10_10_9.js','heic-report-conversion-v10_10_12.js'])assert(!excludedBlock.includes(requiredStudentModule),`Otimização retirou módulo necessário do aluno: ${requiredStudentModule}`);
assert(config.includes('const runtimeComplete=()=>deferredComplete&&completedRole==='),'Conclusão do runtime não considera mudança de papel na mesma página.');
assert(config.includes('if(deferredStarted||!sessionUiReady()||runtimeComplete())return;'),'Fila diferida pode ser reiniciada depois de concluída.');
assert(config.includes('if(!sessionUiReady()||runtimeComplete())return;'),'Agendador pode revarrer módulos concluídos.');
assert(config.includes("activeScreen()!=='screen-home'"),'Prioridade do aluno não está condicionada à Home realmente ativa.');
assert(config.includes("screen!=='screen-loading'&&screen!=='screen-auth'"),'Fila pesada pode voltar a iniciar durante loading/auth.');
assert(config.includes('await yieldUi();'),'Fila diferida não devolve o thread principal entre módulos.');
assert(config.includes("version:'10.10.21-startup9'"),'Loader não expõe a revisão de performance por contexto.');

assert(sw.includes("./modules/student-home-profile-v10_10_12.js?v=10.10.20-studenthome3"),'Perfil estabilizado não está no shell PWA.');
assert(sw.includes("./modules/student-home-layout-v10_10_15.js?v=10.10.21-home4"),'Home otimizada não está no shell PWA.');
assert(sw.includes("./modules/usability-checkup-v10_10_9.js?v=10.10.20-usability3"),'Usabilidade estabilizada não está no shell PWA.');
assert(sw.includes("./modules/student-home-layout-runtime-v10_10_16.js?v=10.10.16-runtime1"),'Ponte antiga deve permanecer disponível apenas para instalações legadas.');
assert(sw.includes("'/modules/usability-checkup-v10_10_9.js','/modules/student-home-profile-v10_10_12.js','/modules/student-home-layout-v10_10_15.js','/modules/student-home-layout-runtime-v10_10_16.js'"),'Camadas mutáveis do aluno não estão em network-first.');
assert(!boot.includes('student-survivor-home-v10_10_14'),'Loader antigo da PR #76 reapareceu no boot crítico.');

assert(runtime.includes("const LAYOUT_SRC='./modules/student-home-layout-v10_10_15.js?v=10.10.15-home2'"),'Ponte legada deixou de apontar ao arquivo físico oficial.');
assert(!runtime.includes('setInterval('),'Ponte legada voltou a executar polling permanente.');

assert(home.includes("const VERSION='10.10.21-home4'"),'Layout canônico não contém a revisão otimizada.');
assert(home.includes("currentUser()?.role==='trainer'||document.body.classList.contains('trainer-desktop')"),'Home não bloqueia explicitamente o contexto de treinador.');
assert(home.includes("body.student-desktop .student-desktop-nav{display:none!important}"),'Sidebar antiga do aluno não é removida no desktop.');
assert(home.includes("body.student-desktop #app{margin-left:0!important;width:100%!important"),'Área do aluno não recupera a largura ao remover a sidebar.');
assert(home.includes("#screen-home.tb-home-v17-screen .quick-nav{display:none!important}"),'Grade antiga da Home do aluno não é escondida.');
assert(home.includes("['home','INÍCIO'"),'Hotbar não contém Início.');
assert(home.includes("['workout','TREINO'"),'Hotbar não contém Treino.');
assert(home.includes("['diet','DIETA'"),'Hotbar não contém Dieta.');
assert(home.includes("['instructions','INSTRUÇÕES'"),'Hotbar não contém Instruções.');
assert(home.includes("['supplements','SUPRIMENTOS'"),'Hotbar não contém Suprimentos.');
assert(home.includes("['options','OPÇÕES DE SUPRIMENTOS'"),'Hotbar não contém Opções de Suprimentos.');
assert(home.includes("['reports','RELATÓRIOS'"),'Hotbar não contém Relatórios.');
assert(home.includes('async function openStudentSupplements()'),'Atalho de suplementos não reutiliza a dieta oficial.');
assert(home.includes('openDietDetail(plan.id,false)'),'Atalho de suplementos não abre o protocolo oficial em modo aluno.');
assert(home.includes("#screen-diet-detail .diet-support-section"),'Atalho de suplementos não revela as tabelas prescritas.');
assert(home.includes("title.textContent='DIETAS'"),'Lista de protocolos do aluno continua rotulada incorretamente como suplementos.');
assert(home.includes("observer.observe(document.body,{attributes:true,attributeFilter:['class']})"),'Home não observa de forma restrita a mudança de contexto do body.');
assert(!home.includes('subtree:true'),'Home voltou a observar toda a árvore do DOM e pode degradar interação.');
assert(!home.includes('setInterval('),'Home voltou a executar polling permanente e pode causar lag.');
assert(home.includes("loadProtocolReviewSchedule(uid,true)"),'Data da próxima atualização não reutiliza o cronograma oficial.');
assert(home.includes("db.collection('feedback').where('studentId','==',uid)"),'Feedbacks não são filtrados pelo aluno autenticado.');
assert(home.includes("base.orderBy('createdAt','desc').limit(MAX_FEEDBACKS).get()"),'Feedbacks recentes não usam consulta ordenada e limitada quando suportada.');
assert(home.includes("db.collection('weeklyCheckins').where('studentId','==',uid)"),'Gráfico não usa weeklyCheckins do próprio aluno.');
assert(home.includes("base.orderBy('submittedDate','desc').limit(MAX_WEIGHT_POINTS).get()"),'Histórico de peso não tenta a consulta limitada aos 10 pontos recentes.');
assert(home.includes('return normalize(await base.get())'),'Histórico de peso perdeu fallback compatível caso o índice ainda não exista.');
assert(home.includes("weightOrderedQueryState='unsupported'"),'Histórico de peso não memoriza a indisponibilidade do índice e pode repetir falhas.');
assert(!home.includes("db.collection('progressPhotos').where('userId','==',uid)"),'Home voltou a baixar progressPhotos para montar o gráfico de peso.');
assert(home.includes("body.textContent=String(item.message||'')"),'Feedback não usa textContent seguro.');
assert(!home.includes('innerHTML=String(item.message'),'Feedback do treinador não pode ser injetado como HTML.');
assert(home.includes("db.collection('feedback').doc(item.id).update({read:true})"),'Abrir feedback na Home não sincroniza o estado de leitura.');

assert(firebase?.firestore?.indexes==='firebase/firestore.indexes.json','firebase.json não aponta para os índices versionados do Firestore.');
const indexMap=new Map((indexes.indexes||[]).map(item=>[item.collectionGroup,item]));
for(const [collection,orderField] of [['feedback','createdAt'],['weeklyCheckins','submittedDate']]){
  const item=indexMap.get(collection),fields=item?.fields||[];
  assert(item?.queryScope==='COLLECTION',`Índice ${collection} não usa queryScope COLLECTION.`);
  assert(fields.some(field=>field.fieldPath==='studentId'&&field.order==='ASCENDING'),`Índice ${collection} não inicia por studentId.`);
  assert(fields.some(field=>field.fieldPath===orderField&&field.order==='DESCENDING'),`Índice ${collection} não ordena ${orderField} desc.`);
}

assert(profile.includes("const VERSION='10.10.43-studenthome4'"),'Perfil do aluno não está na revisão de Storage lazy estabilizada.');
assert(profile.includes('body.student-desktop .student-desktop-nav{display:none!important}'),'Perfil prioritário não possui fail-safe para a sidebar antiga.');
assert(profile.includes('#screen-home.tb-home-v2 .quick-nav{display:none!important}'),'Perfil prioritário não possui fail-safe para a grade antiga.');
assert(profile.includes('data-tb-profile-logout="1"'),'Perfil não cria o logout diretamente.');
assert(profile.includes('const BADGE_POLL_MS=300000;'),'Badge voltou a consultar o backend com frequência excessiva.');
assert(profile.includes('const BADGE_REFRESH_TTL=120000;'),'Badge não possui janela de coalescência/cache.');
assert(profile.includes('loadNotifications({includeProtocol:false})'),'Badge ainda consulta o cronograma de protocolo sem necessidade.');
assert(profile.includes('if(badgeRefreshPromise)return badgeRefreshPromise;'),'Consultas concorrentes do badge não são coalescidas.');
assert(profile.includes("activeScreen()==='screen-home'"),'Polling do badge não é restrito à Home ativa.');

assert(usability.includes("const VERSION='10.10.20-usability3'"),'Usabilidade não está na revisão estabilizada.');
assert(!usability.includes('profileMenuObserver'),'Observer global do menu de perfil voltou ao runtime.');
assert(!usability.includes('subtree:true'),'Usabilidade voltou a observar toda a árvore do DOM.');
assert(usability.includes("window.addEventListener('team-bulls-student-runtime-ready',ensureStudentProfileLogout)"),'Fallback do logout não acompanha o evento relevante do aluno.');

if(fail.length){console.error('\nStudent home/runtime performance regression failed:\n- '+fail.join('\n- '));process.exit(1);}
console.log('Student home/runtime performance OK — aluno cloud evita ferramentas de edição, fallbacks respeitam o papel, modo local é preservado e módulos essenciais seguem protegidos.');