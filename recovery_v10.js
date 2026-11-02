'use strict';
(()=>{
  const button=document.getElementById('run'),status=document.getElementById('status');
  let running=false;
  function timeout(task,ms){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('A conexão demorou. Tente novamente.')),ms);Promise.resolve(task).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});}
  async function fresh(path){
    const url=new URL(path,location.href);url.searchParams.set('tb-recovery',String(Date.now()));
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{const response=await fetch(url,{cache:'no-store',signal:controller.signal});if(!response.ok)throw new Error('Não foi possível baixar a atualização.');return await response.text();}
    finally{clearTimeout(timer);}
  }
  async function activated(reg){
    const worker=reg.installing||reg.waiting||reg.active;
    if(!worker)throw new Error('A atualização ainda não está pronta.');
    if(worker.state==='activated')return worker;
    await new Promise((resolve,reject)=>{
      const finish=error=>{clearTimeout(timer);worker.removeEventListener('statechange',changed);error?reject(error):resolve();};
      const changed=()=>{if(worker.state==='activated')finish();else if(worker.state==='redundant')finish(new Error('A atualização foi interrompida. Tente novamente.'));else if(worker.state==='installed')worker.postMessage({type:'SKIP_WAITING'});};
      const timer=setTimeout(()=>finish(new Error('A atualização ainda está sendo preparada. Tente novamente.')),15000);
      worker.addEventListener('statechange',changed);changed();
    });
    return worker;
  }
  function workerBuild(worker){
    return new Promise((resolve,reject)=>{
      const finish=(value,error)=>{clearTimeout(timer);navigator.serviceWorker.removeEventListener('message',message);error?reject(error):resolve(value);};
      const message=event=>{if(event.source===worker&&event.data?.type==='TEAM_BULLS_VERSION')finish(Number(event.data.build)||0);};
      const timer=setTimeout(()=>finish(0,new Error('Não foi possível confirmar a atualização. Tente novamente.')),5000);
      navigator.serviceWorker.addEventListener('message',message);worker.postMessage({type:'GET_VERSION'});
    });
  }
  async function run(){
    if(running)return;running=true;button.disabled=true;status.textContent='Verificando a versão disponível...';
    try{
      if(navigator.onLine===false)throw new Error('Conecte o aparelho à internet para atualizar.');
      const info=JSON.parse(await fresh('./version.json'));
      if(!/^\d+\.\d+\.\d+$/.test(String(info.version))||!Number.isSafeInteger(info.build)||info.build<=0)throw new Error('A versão disponível não pôde ser confirmada.');
      // Preservar sessões, IndexedDB e dados locais durante a recuperação.
      if('serviceWorker' in navigator){
        status.textContent='Preparando a atualização no aparelho...';
        const reg=await timeout(navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(info.version)}&b=${info.build}`,{scope:'./',updateViaCache:'none'}),12000);
        await timeout(reg.update(),12000);
        const worker=await activated(reg);
        if(await workerBuild(worker)<info.build)throw new Error('O aparelho ainda está preparando a versão nova. Tente novamente.');
      }
      const html=await fresh('./index.html');
      const page=new DOMParser().parseFromString(html,'text/html');
      if(Number(page.querySelector('meta[name="team-bulls-build"]')?.content)!==info.build)throw new Error('A versão nova ainda não chegou por completo. Tente novamente em instantes.');
      try{sessionStorage.setItem('team-bulls-update-reload-version',`${info.version}@${info.build}`);}catch(error){}
      status.textContent='Arquivos preparados. Abrindo o Team Bulls...';
      location.replace(`./index.html?updated=${encodeURIComponent(info.version)}&build=${info.build}&t=${Date.now()}`);
    }catch(error){status.textContent=error.name==='AbortError'?'A conexão demorou. Tente novamente.':error.message||'Não foi possível atualizar agora. Tente novamente.';}
    finally{running=false;button.disabled=false;}
  }
  button.addEventListener('click',run);
  if(new URLSearchParams(location.search).get('auto')==='1')setTimeout(run,100);
})();
