/* Resumo técnico local para suporte. Não coleta nem envia dados. */
'use strict';
(()=>{
  if(window.TeamBullsSupportDiagnostics)return;
  const VERSION='10.10.9-diagnostics3';
  const cleanScreen=value=>/^[a-z0-9_-]{1,60}$/i.test(String(value||''))?String(value):'indisponível';
  const count=value=>Number.isFinite(Number(value))?Math.max(0,Math.min(10000,Math.trunc(Number(value)))):0;
  const time=value=>Number.isFinite(Number(value))?Math.max(0,Math.min(8640000000000000,Math.trunc(Number(value)))):0;
  const categories=new Set(['network','permission','storage','conflict','other']);
  const categoryLabel=value=>({network:'rede',permission:'acesso negado',storage:'armazenamento',conflict:'conflito',other:'outro'}[value]||'');
  function queueStats(api){
    try{
      const value=api?.diagnostics?.();
      if(!value||value.available!==true)return{available:false,pending:0,failed:0,lastError:'',lastErrorAt:0,lastAttemptAt:0,lastDurationMs:0,lastSuccessAt:0,localSaveFailures:0,lastLocalSaveError:'',lastLocalSaveErrorAt:0,lastLocalSaveSuccessAt:0};
      return{available:true,pending:count(value.pending),failed:count(value.failed),lastError:categories.has(value.lastError)?value.lastError:'',lastErrorAt:time(value.lastErrorAt),lastAttemptAt:time(value.lastAttemptAt),lastDurationMs:count(value.lastDurationMs),lastSuccessAt:time(value.lastSuccessAt),localSaveFailures:count(value.localSaveFailures),lastLocalSaveError:categories.has(value.lastLocalSaveError)?value.lastLocalSaveError:'',lastLocalSaveErrorAt:time(value.lastLocalSaveErrorAt),lastLocalSaveSuccessAt:time(value.lastLocalSaveSuccessAt)};
    }catch(error){return{available:false,pending:0,failed:0,lastError:'',lastErrorAt:0,lastAttemptAt:0,lastDurationMs:0,lastSuccessAt:0,localSaveFailures:0,lastLocalSaveError:'',lastLocalSaveErrorAt:0,lastLocalSaveSuccessAt:0};}
  }
  function syncStats(){
    const user=typeof CURRENT_USER!=='undefined'?CURRENT_USER:null,student=!!(user?.role==='student'&&user.uid);
    const emptyQueue={available:false,pending:0,failed:0,lastError:'',lastErrorAt:0,lastAttemptAt:0,lastDurationMs:0,lastSuccessAt:0};
    const sessions=student?queueStats(window.TeamBullsSessionPerformance):emptyQueue;
    const foods=student?queueStats(window.TeamBullsStudentFoodChoices):emptyQueue;
    let workouts={available:false,pending:0,failed:0};
    try{const value=student?window.TeamBullsWorkoutCompletion?.diagnostics?.():null;if(value&&Number.isFinite(Number(value.pending))&&Number.isFinite(Number(value.failed)))workouts={available:true,pending:count(value.pending),failed:count(value.failed)};}catch(error){}
    let freeMeals={available:false,pending:0};
    try{
      if(student&&typeof LOCAL_DB!=='undefined'&&Array.isArray(LOCAL_DB?.freeMealLogs)){
        freeMeals={available:true,pending:count(LOCAL_DB.freeMealLogs.filter(item=>item?.pendingSync===true&&String(item.userId||'')===String(user.uid)).length)};
      }
    }catch(error){}
    let runtime={available:false,loaded:0,total:0,failed:0};
    try{
      const value=window.TeamBullsRuntimeLoader?.state?.();
      if(value)runtime={available:true,loaded:count(value.loaded),total:count(value.total),failed:Array.isArray(value.failed)?count(value.failed.length):count(value.failed)};
    }catch(error){}
    return{sessions,foods,workouts,freeMeals,runtime};
  }
  function queueLabel(value){return value?.available?`${count(value.pending)} pendentes · ${count(value.failed)} com erro`:'aguardando diagnóstico';}
  function createSummary(){
    const activeScreen=document.querySelector('.screen.active')?.id||'';
    const role=typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role==='student'?'aluno':typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role==='trainer'?'treinador':'não autenticado';
    const mode=typeof MODE!=='undefined'&&MODE==='cloud'?'nuvem':'local';
    const updater=window.TeamBullsUpdater||{};
    const installed=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
    const device=matchMedia('(pointer: coarse)').matches?'celular ou tablet':'computador';
    const connection=navigator.onLine===false?'sem conexão':'conectado';
    const serviceWorker=!('serviceWorker'in navigator)?'indisponível':navigator.serviceWorker.controller?'controlando o app':'ainda não controla o app';
    const stats=syncStats(),session=stats.sessions,runtime=stats.runtime;
    const lastSessionAttempt=session?.lastAttemptAt?new Date(session.lastAttemptAt).toISOString():'não registrada';
    return[
      'Team Bulls — resumo técnico',
      `Versão: ${String(updater.version||'indisponível').slice(0,30)}`,
      `Build: ${Number.isSafeInteger(Number(updater.build))?Number(updater.build):'indisponível'}`,
      `Rede do aparelho: ${connection}`,
      `Perfil: ${role}`,
      `Modo de dados: ${mode}`,
      `Instalação: ${installed?'app instalado':'navegador'}`,
      `Service Worker: ${serviceWorker}`,
      `Tela: ${cleanScreen(activeScreen)}`,
      `Registros de séries: ${queueLabel(session)}`,
      `Última tentativa de sincronização de séries: ${lastSessionAttempt} · ${session?.lastDurationMs?count(session.lastDurationMs)+' ms':'duração indisponível'}`,
      `Última sincronização confirmada de séries: ${session?.lastSuccessAt?new Date(time(session.lastSuccessAt)).toISOString():'não registrada'}`,
      `Falhas ao salvar séries no aparelho: ${count(session?.localSaveFailures)}`,
      `Última falha ao salvar séries: ${categoryLabel(session?.lastLocalSaveError)||'nenhuma registrada'} · ${session?.lastLocalSaveErrorAt?new Date(time(session.lastLocalSaveErrorAt)).toISOString():'não registrada'}`,
      `Último salvamento local confirmado: ${session?.lastLocalSaveSuccessAt?new Date(time(session.lastLocalSaveSuccessAt)).toISOString():'não registrado'}`,
      `Tipo da última falha de série: ${categoryLabel(session?.lastError)||'nenhuma registrada'}`,
      `Escolhas de alimentos: ${queueLabel(stats.foods)}`,
      `Tipo da última falha de alimento: ${categoryLabel(stats.foods?.lastError)||'nenhuma registrada'} · ${stats.foods?.lastErrorAt?new Date(time(stats.foods.lastErrorAt)).toISOString():'não registrada'}`,
      `Conclusões de treino: ${queueLabel(stats.workouts)}`,
      `Refeições livres pendentes: ${stats.freeMeals.available?count(stats.freeMeals.pending):'indisponível'}`,
      `Módulos do app: ${runtime.available?`${count(runtime.loaded)}/${count(runtime.total)} carregados · ${count(runtime.failed)} falhas`:'indisponível'}`,
      `Dispositivo: ${device}`,
      `Gerado em: ${new Date().toISOString()}`
    ].join('\n');
  }
  async function copy(){
    const button=document.getElementById('tb-copy-diagnostics'),output=document.getElementById('tb-diagnostics-output'),status=document.getElementById('tb-diagnostics-status');
    if(!button||!output||!status)return false;
    const summary=createSummary();button.disabled=true;status.textContent='Preparando o resumo técnico...';
    try{
      if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(summary);output.hidden=true;output.value='';status.textContent='Resumo copiado. Ele só será compartilhado se você colar em uma conversa de suporte.';return true;}
      throw new Error('Cópia automática indisponível.');
    }catch(error){
      output.value=summary;output.hidden=false;output.focus();output.select();output.setSelectionRange(0,output.value.length);
      status.textContent='O resumo está selecionado. Copie o texto manualmente para compartilhar com o suporte.';return false;
    }finally{button.disabled=false;}
  }
  const button=document.getElementById('tb-copy-diagnostics');
  button?.addEventListener('click',()=>{copy().catch(error=>{console.warn('[Team Bulls] resumo técnico local',error);});});
  window.TeamBullsSupportDiagnostics=Object.freeze({version:VERSION,createSummary,copy,syncStats});
})();