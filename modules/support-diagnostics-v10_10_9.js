/* Resumo técnico local para suporte. Não coleta nem envia dados. */
'use strict';
(()=>{
  if(window.TeamBullsSupportDiagnostics)return;
  const VERSION='10.10.9-diagnostics1';
  const cleanScreen=value=>/^[a-z0-9_-]{1,60}$/i.test(String(value||''))?String(value):'indisponível';
  function createSummary(){
    const activeScreen=document.querySelector('.screen.active')?.id||'';
    const role=typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role==='student'?'aluno':typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role==='trainer'?'treinador':'não autenticado';
    const mode=typeof MODE!=='undefined'&&MODE==='cloud'?'nuvem':'local';
    const updater=window.TeamBullsUpdater||{};
    const installed=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
    const device=matchMedia('(pointer: coarse)').matches?'celular ou tablet':'computador';
    const connection=navigator.onLine===false?'sem conexão':'conectado';
    const serviceWorker=!('serviceWorker'in navigator)?'indisponível':navigator.serviceWorker.controller?'controlando o app':'ainda não controla o app';
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
  window.TeamBullsSupportDiagnostics=Object.freeze({version:VERSION,createSummary,copy});
})();
