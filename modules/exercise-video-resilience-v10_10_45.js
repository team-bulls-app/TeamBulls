/* Team Bulls v10.10.45 — carregamento resiliente de vídeos sem bloquear a navegação. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_EXERCISE_VIDEO_RESILIENCE_101045__)return;
  window.__TEAM_BULLS_EXERCISE_VIDEO_RESILIENCE_101045__=true;

  const VERSION='10.10.45-video1';
  const STYLE_ID='tb-exercise-video-resilience-style';
  const HOSTS=['https://www.youtube.com','https://www.youtube-nocookie.com'];
  const safe=value=>typeof esc==='function'?esc(value):String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const directUrl=id=>`https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  const embedUrl=(id,hostIndex=0)=>`${HOSTS[hostIndex===1?1:0]}/embed/${encodeURIComponent(id)}?rel=0&playsinline=1&modestbranding=1`;

  function injectStyles(){
    if(document.getElementById(STYLE_ID))return;
    const style=document.createElement('style');style.id=STYLE_ID;style.textContent=`
      .tb-video-resilient .tb-video-stage{width:100%;aspect-ratio:16/9;background:#090909;border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center}
      .tb-video-resilient .tb-video-stage iframe{width:100%;height:100%;border:0;display:block;background:#000}
      .tb-video-resilient .tb-video-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
      .tb-video-resilient .tb-video-actions>span{margin-right:auto}
      .tb-video-resilient .tb-video-open{display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
      .tb-video-resilient .tb-video-state{padding:18px;text-align:center;color:#8f8580;font:700 9px/1.45 'DM Mono',monospace}
    `;document.head.appendChild(style);
  }

  function makeFrame(id,title,hostIndex=0){
    const frame=document.createElement('iframe');
    frame.title=`Vídeo de execução de ${String(title||'exercício')}`;
    frame.loading='eager';
    frame.referrerPolicy='strict-origin-when-cross-origin';
    frame.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    frame.allowFullscreen=true;
    frame.src=embedUrl(id,hostIndex);
    return frame;
  }

  function mountFrame(stage,id,title,hostIndex=0,allowAutomaticFallback=true){
    if(!stage?.isConnected)return false;
    stage.replaceChildren();
    const frame=makeFrame(id,title,hostIndex);
    let settled=false;
    frame.addEventListener('load',()=>{settled=true;stage.dataset.tbVideoLoaded='1';},{once:true});
    frame.addEventListener('error',()=>{
      if(settled||!allowAutomaticFallback||!stage.isConnected)return;
      settled=true;
      mountFrame(stage,id,title,hostIndex===0?1:0,false);
    },{once:true});
    stage.appendChild(frame);
    return true;
  }

  function scheduleMount(stage,id,title){
    const run=()=>{
      if(!stage?.isConnected)return;
      if(navigator.onLine===false){
        stage.innerHTML='<div class="tb-video-state">Sem conexão agora. O vídeo será carregado quando a internet voltar.</div>';
        window.addEventListener('online',()=>{if(stage.isConnected)mountFrame(stage,id,title,Number(stage.dataset.tbVideoHost)||0,true);},{once:true});
        return;
      }
      mountFrame(stage,id,title,Number(stage.dataset.tbVideoHost)||0,true);
    };
    requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(run,40)));
  }

  function bindRetry(root,id,title){
    const retry=root.querySelector('[data-tb-video-retry]'),stage=root.querySelector('[data-tb-video-stage]');
    if(!retry||!stage)return;
    retry.addEventListener('click',()=>{
      const current=Number(stage.dataset.tbVideoHost)||0,next=current===0?1:0;
      stage.dataset.tbVideoHost=String(next);
      stage.innerHTML='<div class="tb-video-state">Reconectando o vídeo...</div>';
      if(navigator.onLine===false)return;
      mountFrame(stage,id,title,next,false);
    });
  }

  function renderVideoShell(el,{id,title,label,editable=false,exerciseId='',resolvedUrl=''}){
    injectStyles();
    el.innerHTML=`<div class="video-box tb-video-resilient"><div class="tb-video-stage" data-tb-video-stage data-tb-video-host="0"><div class="tb-video-state">Preparando vídeo...</div></div><div class="video-box-link tb-video-actions"><span>${safe(label||'Vídeo do exercício')}</span><button class="video-box-edit-btn" type="button" data-tb-video-retry>↻ RECARREGAR</button><a class="video-box-edit-btn tb-video-open" href="${safe(directUrl(id))}" target="_blank" rel="noopener noreferrer">↗ ABRIR NO YOUTUBE</a>${editable?`<button class="video-box-edit-btn" type="button" onclick="openExerciseVideoModal(${typeof jsArg==='function'?jsArg(exerciseId):JSON.stringify(String(exerciseId))},${typeof jsArg==='function'?jsArg(resolvedUrl):JSON.stringify(String(resolvedUrl))})">EDITAR</button>`:''}</div></div>`;
    bindRetry(el,id,title);
    const stage=el.querySelector('[data-tb-video-stage]');
    scheduleMount(stage,id,title);
  }

  function resilientRenderExerciseVideo(exercise,elId,context='student'){
    const el=document.getElementById(elId);if(!el)return;
    const isTrainer=typeof MODE!=='undefined'&&MODE==='cloud'&&typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role==='trainer';
    const studentCanView=typeof canUseCatalogVideos==='function'&&canUseCatalogVideos();
    const canView=isTrainer||studentCanView,canEdit=isTrainer&&context==='trainer';
    if(!canView){
      el.innerHTML='<div class="video-box"><div class="video-box-empty"><div class="video-box-empty-label">🔒 Vídeos disponíveis somente no acesso online ativo.</div></div></div>';
      return;
    }
    const resolved=typeof resolveExerciseVideoUrl==='function'?resolveExerciseVideoUrl(exercise):String(exercise?.videoUrl||'');
    const id=typeof extractYouTubeId==='function'?extractYouTubeId(resolved):'';
    if(!id){
      if(canEdit)el.innerHTML=`<div class="video-box"><div class="video-box-empty"><div class="video-box-empty-label">Nenhum vídeo cadastrado</div><button class="video-box-add-btn" onclick="openExerciseVideoModal(${typeof jsArg==='function'?jsArg(exercise?.id):JSON.stringify(String(exercise?.id||''))},'')">+ ADICIONAR</button></div></div>`;
      else el.innerHTML='';
      return;
    }
    renderVideoShell(el,{id,title:exercise?.name||'Exercício',label:exercise?.videoUrl?'Vídeo personalizado':'Vídeo automático do catálogo',editable:canEdit,exerciseId:exercise?.id||'',resolvedUrl:resolved});
  }

  function resilientOpenCatalogVideo(url,title){
    if(typeof canUseCatalogVideos==='function'&&!canUseCatalogVideos()&&CURRENT_USER?.role!=='trainer'){
      if(typeof showToast==='function')showToast('Vídeos disponíveis somente para alunos ativos online.',true);return;
    }
    const id=typeof extractYouTubeId==='function'?extractYouTubeId(url):'';
    if(!id){if(typeof showToast==='function')showToast('Use um link válido do YouTube.',true);return;}
    const titleEl=document.getElementById('catalog-video-title'),body=document.getElementById('catalog-video-body');if(!body)return;
    if(titleEl)titleEl.textContent=title||'Vídeo de execução';
    body.innerHTML=`<div class="video-box tb-video-resilient"><div class="tb-video-stage" data-tb-video-stage data-tb-video-host="0"><div class="tb-video-state">Preparando vídeo...</div></div><div class="video-box-link tb-video-actions"><span>Vídeo de execução</span><button class="video-box-edit-btn" type="button" data-tb-video-retry>↻ RECARREGAR</button><a class="video-box-edit-btn tb-video-open" href="${safe(directUrl(id))}" target="_blank" rel="noopener noreferrer">↗ ABRIR NO YOUTUBE</a></div></div>`;
    if(typeof openModal==='function')openModal('modal-catalog-video');
    bindRetry(body,id,title||'Vídeo de execução');
    scheduleMount(body.querySelector('[data-tb-video-stage]'),id,title||'Vídeo de execução');
  }

  function install(){
    if(typeof renderExerciseVideo!=='function'||typeof openCatalogVideo!=='function')return false;
    if(renderExerciseVideo.__tbVideoResilience)return true;
    resilientRenderExerciseVideo.__tbVideoResilience=true;
    resilientOpenCatalogVideo.__tbVideoResilience=true;
    renderExerciseVideo=resilientRenderExerciseVideo;
    openCatalogVideo=resilientOpenCatalogVideo;
    injectStyles();
    return true;
  }

  install();
  window.addEventListener('team-bulls-v107-ready',install,{once:true});
  window.addEventListener('team-bulls-runtime-state',install);
  window.TeamBullsExerciseVideoResilience=Object.freeze({version:VERSION,install,mountFrame});
})();
