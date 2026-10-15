import fs from 'node:fs';
import {spawnSync} from 'node:child_process';

const fail=[];
const read=path=>fs.readFileSync(path,'utf8');
const assert=(ok,message)=>{if(!ok)fail.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);

const files={
  video:'modules/exercise-video-resilience-v10_10_45.js',
  config:'config_v10_7.js',
  core:'app_v10_10_9_core.js',
  index:'index.html',
  sw:'sw.js',
  quality:'.github/workflows/quality.yml'
};
for(const path of Object.values(files))assert(fs.existsSync(path),`Arquivo ausente: ${path}`);
for(const path of [files.video,files.config]){
  if(!fs.existsSync(path))continue;
  const syntax=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});
  assert(syntax.status===0,`${path} possui JavaScript inválido: ${String(syntax.stderr||'').trim()}`);
}

const video=read(files.video),config=read(files.config),core=read(files.core),index=read(files.index),sw=read(files.sw),quality=read(files.quality);
const videoUrl='./modules/exercise-video-resilience-v10_10_45.js?v=10.10.45-video1';

has(video,"const VERSION='10.10.45-video1'",'Módulo de vídeo não possui revisão própria.');
has(video,"HOSTS=['https://www.youtube.com','https://www.youtube-nocookie.com']",'Vídeo precisa ter dois hosts de embed para recuperação manual.');
has(video,"frame.loading='eager'",'Iframe visível não pode continuar dependendo de lazy loading criado enquanto a tela está oculta.');
has(video,'playsinline=1','Embed móvel precisa solicitar reprodução inline.');
has(video,"requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(run,40)))",'Vídeo deve ser montado somente depois de a navegação ter pelo menos dois frames para exibir a tela.');
has(video,'data-tb-video-retry','Vídeo não possui ação de recarregar.');
has(video,'ABRIR NO YOUTUBE','Falha de embed precisa manter uma saída direta para o vídeo original.');
has(video,"window.addEventListener('online'",'Vídeo aberto sem rede precisa se recuperar quando a conexão voltar.');
has(video,'mountFrame(stage,id,title,hostIndex===0?1:0,false)','Erro do host primário não possui fallback automático único.');
has(video,'renderExerciseVideo=resilientRenderExerciseVideo','Render canônico do exercício não recebe a camada resiliente.');
has(video,'openCatalogVideo=resilientOpenCatalogVideo','Vídeos do catálogo/técnicas não recebem a mesma camada resiliente.');
lacks(video,'db.collection(','Módulo de vídeo não deve criar leituras ou gravações Firestore.');
lacks(video,'cloudWrite(','Módulo de vídeo não deve gravar no Firestore.');
lacks(video,'setInterval(','Módulo de vídeo não deve criar polling.');
lacks(video,'MutationObserver','Módulo de vídeo não deve observar a árvore global.');

has(config,videoUrl,'Loader não entrega a correção de vídeo.');
const critical=config.match(/const criticalModules=\[([^\]]*)\];/s)?.[1]||'';
assert(critical.includes('exercise-video-resilience-v10_10_45.js'),'Correção de vídeo deve estar pronta antes da navegação de exercícios.');
has(config,'const PRELOAD_WINDOW=3;','Janela de preload ainda está alta para rede móvel.');
has(config,'const DEFERRED_YIELD_EVERY=2;','Carga diferida não devolve frames com frequência suficiente.');
has(config,'preloadModules(studentPriorityModules.slice(0,PRELOAD_WINDOW));','Aluno continua pré-carregando todos os módulos prioritários simultaneamente.');
lacks(config,'preloadModules(studentPriorityModules);','Pré-carga irrestrita dos módulos prioritários voltou.');
has(config,'requestAnimationFrame(()=>setTimeout(queue,240));','Carga pesada pós-login continua começando cedo demais.');
has(config,"version:'10.10.61-startup12'",'Revisão otimizada do loader não está identificada.');

const renderAt=core.indexOf("renderExerciseVideo(e,'exercise-video-box','student')");
const showAt=core.indexOf("showScreen('screen-exercise')",renderAt);
assert(renderAt>=0&&showAt>renderAt,'Teste pressupõe que o core ainda chama o render de vídeo antes de exibir a tela; a camada resiliente precisa compensar isso sem reescrever o core.');
has(core,"if(['embed','shorts','live'].includes(parts[0])",'Parser do YouTube perdeu suporte a Shorts/embed/live.');
has(core,'function resolveExerciseVideoUrl(exercise)','Resolução catálogo → vídeo desapareceu.');
has(index,'frame-src https://www.youtube.com https://www.youtube-nocookie.com','CSP não permite os dois hosts de recuperação do player.');
has(sw,"'/config_v10_7.js'",'Config precisa continuar network-first para entregar a otimização sem trocar o build público.');
has(quality,'node scripts/exercise-video-performance-check.mjs','Quality não executa a nova regressão de vídeo/desempenho.');

if(fail.length){
  console.error('FALHA — vídeo/desempenho\n- '+fail.join('\n- '));
  process.exit(1);
}
console.log('APROVADO — vídeo monta após a tela visível, possui fallback/retry e o loader reduz contenção de banda/CPU sem Firebase extra.');
