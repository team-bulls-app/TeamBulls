import fs from 'node:fs';

const fail=[];
const read=path=>fs.readFileSync(path,'utf8');
const assert=(condition,message)=>{if(!condition)fail.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);

for(const path of ['config_v10_7.js','modules/usability-checkup-v10_10_9.js','modules/student-home-profile-v10_10_12.js','modules/modal-stack-stability-v10_10_9.js']){
  assert(fs.existsSync(path),`Arquivo obrigatório ausente: ${path}`);
}
if(fail.length){console.error(fail.join('\n'));process.exit(1);}

const config=read('config_v10_7.js');
const usability=read('modules/usability-checkup-v10_10_9.js');
const profile=read('modules/student-home-profile-v10_10_12.js');
const modal=read('modules/modal-stack-stability-v10_10_9.js');

has(config,'./modules/usability-checkup-v10_10_9.js?v=10.10.20-usability3','Camada de usabilidade estabilizada não está carregada.');
has(config,"setTimeout(()=>finish(false,'tempo limite')",'Loader opcional não possui limite de espera.');
has(config,'const DEFERRED_YIELD_EVERY=2;','Loader deve devolver tempo de pintura em lotes curtos.');
has(config,'deferredBatchCount%DEFERRED_YIELD_EVERY===0','Loader não usa a política explícita de yield entre lotes.');
assert(config.indexOf('usability-checkup-v10_10_9.js')<config.indexOf('modal-stack-stability-v10_10_9.js'),'Estabilidade de modais deve continuar sendo a última camada de UI.');

has(usability,'scrollByHistoryKey','Navegação não preserva posição por entrada do histórico.');
has(usability,"window.addEventListener('popstate'",'Restauração de scroll ao voltar está ausente.');
has(usability,'scrollActiveWeekIntoView','Semana ativa não é revelada automaticamente na grade.');
has(usability,'min-height:44px','Alvos de toque móveis não foram ampliados.');
has(usability,'content-visibility:auto','Listas móveis não usam renderização sob demanda.');
has(usability,"button.setAttribute('aria-busy','true')",'Ações assíncronas não expõem estado ocupado.');
has(usability,"window.addEventListener('pagehide',releaseMediaUrls",'URLs de mídia não são liberadas em todas as saídas da página.');
has(usability,"window.addEventListener('team-bulls-student-runtime-ready',ensureStudentProfileLogout)",'Fallback de logout não acompanha o runtime do aluno.');
assert(!usability.includes('profileMenuObserver'),'Menu de perfil voltou a manter observer global.');
assert(!usability.includes('subtree:true'),'Camada de usabilidade voltou a observar toda a árvore do DOM.');
has(profile,'data-tb-profile-logout="1"','Perfil prioritário não cria o botão SAIR diretamente.');
has(profile,'TeamBullsStudentHome.logout()','Botão SAIR não usa o fluxo canônico do perfil.');

has(modal,'const HEALTH_CHECK_MS=1900','Intervalo otimizado do monitor de modais ausente.');
has(modal,"runtime:'health2'",'Runtime otimizado de modais não identificado.');
has(modal,'if(document.hidden||!openModals().length)return;','Monitor de modais continua trabalhando com a página oculta.');
has(modal,"window.addEventListener('pagehide',pauseHealthCheck",'Monitor de modais não é pausado ao sair da página.');
const recovery=modal.indexOf('function recoverOrphanedTop()');
const keyboard=modal.indexOf('if(keyboardEditing(top))return false;',recovery);
const rendered=modal.indexOf('if(renderedPanel(top))',recovery);
assert(recovery>=0&&keyboard>recovery&&rendered>keyboard,'Recuperação de modal força layout antes de verificar se o usuário está digitando.');

if(fail.length){console.error(fail.join('\n'));process.exit(1);}
console.log('Usability check-up OK — perfil event-driven, sem observer global e loader cedendo frames em lotes curtos.');
