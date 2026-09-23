import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const fail=[];
const read=path=>fs.readFileSync(path,'utf8');
const assert=(ok,message)=>{if(!ok)fail.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);
const numberMatch=(text,re)=>Number(text.match(re)?.[1]||0);

const modulePath='modules/student-home-profile-v10_10_12.js';
for(const file of [modulePath,'modules/usability-checkup-v10_10_9.js']){
  const syntax=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  assert(syntax.status===0,`${file} possui JavaScript inválido: ${String(syntax.stderr||'').trim()}`);
}
const mod=read(modulePath),usability=read('modules/usability-checkup-v10_10_9.js'),config=read('config_v10_7.js'),updater=read('update_v10_10_9.js'),sw=read('sw.js'),sw47=read('sw_47.js'),storage=read('firebase/storage_6.rules'),version=JSON.parse(read('version.json'));

has(mod,"const PROFILE_PREFIX='studentProfiles'",'Perfil do aluno não possui namespace próprio no Storage.');
has(mod,"db.collection('notifications').where('studentId','==',uid)",'Central não lê os avisos enviados pelo treinador.');
has(mod,"db.collection('feedback').where('studentId','==',uid)",'Central não incorpora mensagens da central.');
has(mod,"db.collection('questionnaires').where('studentId','==',uid)",'Central não incorpora relatórios pendentes.');
has(mod,"db.collection('checkinSchedules').doc(uid)",'Central não incorpora o relatório semanal.');
has(mod,'protocolReviewSchedules','Central não incorpora o cronograma de protocolos.');
has(mod,'title="Notificações">🔔','Header não usa o símbolo de notificação esperado.');
has(mod,'#feedback-banner,#screen-home.tb-home-v2 #quest-banner','Banners antigos continuam ocupando a home.');
has(mod,'Protocolos de treino','Resumo não mostra protocolos de treino.');
has(mod,'Protocolos de dieta','Resumo não mostra protocolos de dieta.');
has(mod,'tb-confidential-badge','Selo CONFIDENCIAL não possui correção própria de layout.');
has(mod,'MUDAR FOTO','Menu do perfil não permite trocar foto.');
has(mod,'MUDAR NOME / APELIDO','Menu do perfil não permite trocar nome de exibição.');
has(mod,'REMOVER FOTO','Treinador não consegue moderar a foto.');
has(mod,'REMOVER APELIDO','Treinador não consegue moderar o apelido.');
has(mod,"'image/jpeg',0.9",'Avatar não é normalizado/comprimido para JPEG.');
has(mod,'file.size>12*1024*1024','Upload de avatar perdeu limite de entrada.');
has(mod,"typeof createImageBitmap==='function'",'Avatar perdeu fallback compatível para navegadores sem createImageBitmap.');
has(mod,'data-tb-profile-logout="1"','Perfil não cria a opção SAIR diretamente.');
has(mod,'TeamBullsStudentHome.logout()','Opção SAIR do perfil não usa o fluxo canônico do módulo.');
has(mod,"typeof confirmLogout==='function'",'Logout direto não reutiliza o fluxo seguro existente.');

// Ações pendentes devem permanecer na Central enquanto o conteúdo real abre.
// Voltar para a Home antes de buscar o documento gerava exatamente o sintoma
// "tocou em responder e só voltou para a tela inicial" em conexões mais lentas.
lacks(mod,"if(item.action==='questionnaire'){goHome()",'Relatório personalizado ainda manda o aluno para a Home antes de abrir o formulário.');
lacks(mod,"if(item.action==='weekly'){goHome()",'Relatório semanal ainda manda o aluno para a Home antes da validação canônica.');
lacks(mod,"if(item.action==='protocol'){goHome()",'Cronograma ainda manda o aluno para a Home antes de abrir.');
has(mod,'let noticeActionBusy=false;','A Central não bloqueia toque duplicado enquanto uma pendência está abrindo.');
has(mod,"busy('CARREGANDO RELATÓRIO...')",'A Central não informa que o relatório está sendo carregado.');
has(mod,'await openAnswerQuestionnaire(item.id);','Questionário pendente não aguarda a abertura canônica diretamente da Central.');
has(mod,"document.getElementById('modal-answer-quest')?.classList.contains('open')",'Questionário removido/atualizado não possui reconciliação visual após a tentativa de abertura.');
has(mod,'window.TeamBullsIntelligenceBootstrap?.load||window.TeamBullsIntelligenceSuiteLoader?.load','Relatório semanal não garante que a suíte de integridade esteja disponível antes de abrir.');
has(mod,'await openWeeklyCheckinModal();','Relatório semanal não usa diretamente a abertura protegida pela integridade de período.');
has(mod,'await openProtocolReviewInfo();','Cronograma pendente não abre diretamente da Central.');
has(mod,"showToast?.('Não foi possível abrir agora. Aguarde alguns segundos e tente novamente.',true)",'Falha de abertura continua silenciosa para o aluno.');

has(usability,"button.textContent='SAIR'",'Fallback de usabilidade do perfil não possui a opção SAIR.');
has(usability,"typeof confirmLogout==='function'",'Fallback SAIR não reutiliza o fluxo seguro de logout existente.');
has(usability,'data-tb-profile-logout="1"','Logout do perfil não possui proteção contra duplicação.');
has(usability,"window.addEventListener('team-bulls-student-runtime-ready',ensureStudentProfileLogout)",'Fallback do logout não acompanha a criação tardia do perfil por evento.');
has(usability,"window.addEventListener('team-bulls-runtime-ready',ensureStudentProfileLogout)",'Fallback do logout não acompanha a conclusão do runtime.');
lacks(usability,'profileMenuObserver','Logout voltou a depender de observer global do DOM.');
lacks(usability,'subtree:true','Camada de usabilidade voltou a observar toda a árvore do DOM.');

has(storage,'match /studentProfiles/{uid}/profile.json','Storage Rules não protegem o apelido do aluno.');
has(storage,'match /studentProfiles/{uid}/avatar.jpg','Storage Rules não protegem o avatar.');
has(storage,'trainerOwns(uid) || activeOwner(uid)','Perfil visual não está isolado entre aluno e treinador vinculado.');
has(storage,'validOptimizedJpegUpload(800 * 1024)','Avatar não possui limite de armazenamento de 800 KB.');
has(storage,"request.resource.contentType == 'application/json'",'Perfil JSON não valida Content-Type.');

const asset='./modules/student-home-profile-v10_10_12.js?v=10.10.20-studenthome3';
has(config,asset,'Loader não entrega o perfil/home estabilizado.');
has(updater,asset,'Atualizador não aquece o perfil/home estabilizado.');
has(sw,asset,'Service Worker não prepara o perfil/home estabilizado.');
has(sw47,asset,'Service Worker legado não prepara o perfil/home estabilizado.');
has(mod,"const BADGE_POLL_MS=300000;",'Badge de notificações voltou a consultar com frequência excessiva.');
has(mod,"const BADGE_REFRESH_TTL=120000;",'Badge de notificações não possui janela de coalescência.');
has(mod,'loadNotifications({includeProtocol:false})','Contador de notificações voltou a consultar o cronograma sem necessidade.');
has(mod,'if(badgeRefreshPromise)return badgeRefreshPromise;','Contador não coalesce consultas concorrentes.');
assert(version.version==='10.10.9','Versão pública foi alterada.');
const updaterBuild=numberMatch(updater,/const CURRENT_BUILD=(\d+)/),swBuild=numberMatch(sw,/const BUILD_REVISION=(\d+)/),sw47Build=numberMatch(sw47,/const BUILD_REVISION=(\d+)/);
assert(Number(version.build)>0&&updaterBuild===Number(version.build),'Updater não acompanha o build público atual.');
assert(swBuild===Number(version.build)&&sw47Build===Number(version.build),'Service Workers não acompanham o build público atual.');
const hotfix=sw.match(/const CACHE_HOTFIX='([^']+)'/)?.[1]||'',hotfix47=sw47.match(/const CACHE_HOTFIX='([^']+)'/)?.[1]||'';
assert(hotfix.length>0&&hotfix===hotfix47,'Service Workers não compartilham uma revisão de cache válida.');
assert(sw===sw47,'sw.js e sw_47.js divergiram.');

if(fail.length){console.error('FALHA — student home/profile\n- '+fail.join('\n- '));process.exit(1);}
console.log(`APROVADO — home do aluno preservada no build ${version.build}; notificações otimizadas, pendências abrem sem salto para Home, avatar/apelido, logout event-driven, protocolos e cache coerentes.`);
