/* Team Bulls v10.10.9 — estabilidade de pilha de modais e recuperação conservadora de backdrop órfão. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_MODAL_STACK_STABILITY_V10109__)return;
  window.__TEAM_BULLS_MODAL_STACK_STABILITY_V10109__=true;

  const MODAL_SELECTOR='.modal-backdrop';
  const PANEL_SELECTOR='.modal-sheet,.modal-dialog,[role="dialog"],[role="alertdialog"]';
  const BASE_Z=100;
  const HEALTH_CHECK_MS=1900;
  const ORPHAN_CONFIRMATIONS=2;
  const OFFSCREEN_CONFIRMATIONS=3;
  const orphanMisses=new WeakMap();
  const offscreenMisses=new WeakMap();
  const panelRecoveryStyles=new WeakMap();
  let openSequence=0;
  let healthTimer=0;

  function openModals(){return[...document.querySelectorAll(MODAL_SELECTOR+'.open')];}
  function panelCandidates(modal){
    if(!(modal instanceof HTMLElement))return[];
    const direct=[...modal.children].filter(child=>child instanceof HTMLElement&&child.matches?.(PANEL_SELECTOR));
    if(direct.length)return direct;
    const explicit=[...modal.querySelectorAll(PANEL_SELECTOR)];
    if(explicit.length)return explicit;
    return[...modal.children].filter(child=>child instanceof HTMLElement);
  }
  function rememberInlineStyles(panel){
    if(!(panel instanceof HTMLElement)||panelRecoveryStyles.has(panel))return;
    const state={};
    ['animation','transform','opacity'].forEach(property=>{state[property]={value:panel.style.getPropertyValue(property),priority:panel.style.getPropertyPriority(property)};});
    panelRecoveryStyles.set(panel,state);
  }
  function restoreInlineStyles(panel){
    if(!(panel instanceof HTMLElement))return;
    const state=panelRecoveryStyles.get(panel);if(!state)return;
    Object.entries(state).forEach(([property,entry])=>{if(entry.value)panel.style.setProperty(property,entry.value,entry.priority||'');else panel.style.removeProperty(property);});
    panelRecoveryStyles.delete(panel);
  }
  function clearPanelRecovery(modal){
    if(!(modal instanceof HTMLElement))return;
    panelCandidates(modal).forEach(panel=>{if(panel.dataset.tbModalVisibilityRescued==='1'){restoreInlineStyles(panel);delete panel.dataset.tbModalVisibilityRescued;}});
    delete modal.dataset.tbModalVisibilityRescued;
    orphanMisses.delete(modal);offscreenMisses.delete(modal);
  }
  function markOpened(modal){if(!(modal instanceof HTMLElement))return;clearPanelRecovery(modal);modal.dataset.tbModalOpenSeq=String(++openSequence);}
  function orderedOpenModals(){const modals=openModals();modals.forEach(modal=>{if(!modal.dataset.tbModalOpenSeq)markOpened(modal);});return modals.sort((a,b)=>(Number(a.dataset.tbModalOpenSeq)||0)-(Number(b.dataset.tbModalOpenSeq)||0));}
  function actionInProgress(){try{return typeof ACTION_LOCKS!=='undefined'&&ACTION_LOCKS?.size>0;}catch(error){return false;}}
  function keyboardEditing(modal){
    const active=document.activeElement;
    if(!(active instanceof Element)||!modal?.contains?.(active))return false;
    return document.documentElement.classList.contains('virtual-keyboard-open')||active.matches?.('input,textarea,select,[contenteditable="true"],[contenteditable=""]');
  }
  function renderedPanel(modal){
    return panelCandidates(modal).some(panel=>{
      const style=getComputedStyle(panel);if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;
      const rect=panel.getBoundingClientRect();return rect.width>8&&rect.height>8;
    });
  }
  function accessiblePanel(modal){
    const width=Math.max(1,Number(window.innerWidth||document.documentElement.clientWidth||1));
    const height=Math.max(1,Number(window.innerHeight||document.documentElement.clientHeight||1));
    return panelCandidates(modal).some(panel=>{
      const style=getComputedStyle(panel);if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;
      const rect=panel.getBoundingClientRect();if(rect.width<=8||rect.height<=8)return false;
      const overlapX=Math.min(rect.right,width)-Math.max(rect.left,0),overlapY=Math.min(rect.bottom,height)-Math.max(rect.top,0);
      return overlapX>24&&overlapY>24;
    });
  }
  function finishPanelAnimations(modal){
    if(!(modal instanceof HTMLElement))return false;let finished=false;
    panelCandidates(modal).forEach(panel=>{
      let animations=[];try{animations=typeof panel.getAnimations==='function'?panel.getAnimations():[];}catch(error){}
      animations.forEach(animation=>{try{if(animation.playState==='paused'||animation.playState==='running'){animation.finish();finished=true;}}catch(error){}});
    });
    return finished;
  }
  function rescuePanelVisibility(modal){
    if(!(modal instanceof HTMLElement)||keyboardEditing(modal))return false;
    finishPanelAnimations(modal);if(accessiblePanel(modal))return true;let changed=false;
    panelCandidates(modal).forEach(panel=>{
      const style=getComputedStyle(panel);if(style.display==='none'||style.visibility==='hidden')return;
      rememberInlineStyles(panel);panel.dataset.tbModalVisibilityRescued='1';
      panel.style.setProperty('animation','none','important');panel.style.setProperty('transform','none','important');panel.style.setProperty('opacity','1','important');changed=true;
    });
    if(changed){modal.dataset.tbModalVisibilityRescued='1';modal.style.pointerEvents='auto';}
    return changed;
  }
  function directClose(modal){
    if(!(modal instanceof HTMLElement))return;clearPanelRecovery(modal);modal.classList.remove('open');modal.style.removeProperty('z-index');modal.style.removeProperty('pointer-events');delete modal.dataset.tbModalOpenSeq;delete modal.dataset.tbNestedConfirm;
  }
  function closeBrokenModal(modal,reason){
    console.warn('[Team Bulls] Modal inacessível recuperado silenciosamente:',modal?.id||'(sem id)',reason||'');
    if(modal?.dataset.tbNestedConfirm==='1')directClose(modal);
    else if(modal?.id&&typeof window.closeModal==='function'){try{window.closeModal(modal.id);}catch(error){directClose(modal);}}
    else directClose(modal);return true;
  }
  function recoverOrphanedTop(){
    const modals=orderedOpenModals();if(!modals.length||actionInProgress()||document.hidden)return false;
    const top=modals[modals.length-1];
    // Enquanto o usuário digita, não força style/layout nem tenta recuperar o modal.
    if(keyboardEditing(top))return false;
    if(renderedPanel(top)){
      orphanMisses.delete(top);
      if(accessiblePanel(top)){offscreenMisses.delete(top);return false;}
      const misses=(offscreenMisses.get(top)||0)+1;offscreenMisses.set(top,misses);if(misses<OFFSCREEN_CONFIRMATIONS)return false;
      offscreenMisses.delete(top);
      if(top.dataset.tbModalVisibilityRescued!=='1'&&rescuePanelVisibility(top))return true;
      return closeBrokenModal(top,'painel continuou inacessível após recuperação visual');
    }
    offscreenMisses.delete(top);
    const misses=(orphanMisses.get(top)||0)+1;orphanMisses.set(top,misses);if(misses<ORPHAN_CONFIRMATIONS)return false;
    orphanMisses.delete(top);
    if(top.dataset.tbModalVisibilityRescued!=='1'&&panelCandidates(top).length&&rescuePanelVisibility(top))return true;
    return closeBrokenModal(top,'backdrop sem painel renderizado');
  }
  function scheduleHealthCheck(){
    clearTimeout(healthTimer);healthTimer=0;
    if(document.hidden||!openModals().length)return;
    const top=orderedOpenModals().at(-1);
    const delay=keyboardEditing(top)?Math.max(HEALTH_CHECK_MS,3200):HEALTH_CHECK_MS;
    healthTimer=setTimeout(()=>{healthTimer=0;recoverOrphanedTop();syncLayers();},delay);
  }
  function syncLayers(){
    const modals=orderedOpenModals();
    modals.forEach((modal,index)=>{modal.style.zIndex=String(BASE_Z+index*4);modal.style.pointerEvents=index===modals.length-1?'auto':'none';});
    document.querySelectorAll(MODAL_SELECTOR+':not(.open)').forEach(modal=>{clearPanelRecovery(modal);modal.style.removeProperty('z-index');modal.style.removeProperty('pointer-events');delete modal.dataset.tbModalOpenSeq;delete modal.dataset.tbNestedConfirm;});
    scheduleHealthCheck();
  }
  function afterUiChange(){requestAnimationFrame(()=>{syncLayers();requestAnimationFrame(()=>{recoverOrphanedTop();syncLayers();});});}
  function settleOpenModalAnimations(){if(document.hidden)return;orderedOpenModals().forEach(modal=>{if(!keyboardEditing(modal))finishPanelAnimations(modal);});afterUiChange();}

  function wrapModalFunctions(){
    const baseOpen=window.openModal,baseClose=window.closeModal;
    if(typeof baseOpen==='function'&&!baseOpen.__tbModalStackStability){
      const wrappedOpen=function(id){const modal=document.getElementById(String(id||'')),alreadyOpen=modal?.classList.contains('open');const result=baseOpen.apply(this,arguments);if(modal?.classList.contains('open')&&!alreadyOpen)markOpened(modal);afterUiChange();return result;};
      wrappedOpen.__tbModalStackStability=true;window.openModal=wrappedOpen;
    }
    if(typeof baseClose==='function'&&!baseClose.__tbModalStackStability){
      const wrappedClose=function(id){const modal=document.getElementById(String(id||''));clearPanelRecovery(modal);const result=baseClose.apply(this,arguments);afterUiChange();return result;};
      wrappedClose.__tbModalStackStability=true;window.closeModal=wrappedClose;
    }
  }
  function installNestedConfirmProtection(){
    const baseShowConfirm=window.showConfirm;if(typeof baseShowConfirm!=='function'||baseShowConfirm.__tbModalStackStability)return;
    const wrapped=function(title,text,cb){
      const confirmModal=document.getElementById('modal-confirm'),underlying=openModals().filter(modal=>modal!==confirmModal);
      if(!confirmModal||!underlying.length||confirmModal.classList.contains('open'))return baseShowConfirm.apply(this,arguments);
      const titleNode=document.getElementById('confirm-title'),textNode=document.getElementById('confirm-text'),button=document.getElementById('confirm-ok-btn');
      if(!titleNode||!textNode||!button)return baseShowConfirm.apply(this,arguments);
      titleNode.textContent=title;textNode.textContent=text;button.disabled=false;button.textContent='CONFIRMAR';
      button.onclick=async function(){
        if(button.disabled)return;button.disabled=true;button.textContent='PROCESSANDO...';
        try{const completed=await cb();if(completed!==false)directClose(confirmModal);}
        catch(error){console.error('confirm action',error);alert('Não foi possível concluir a ação: '+error.message);}
        finally{button.disabled=false;button.textContent='CONFIRMAR';afterUiChange();}
      };
      confirmModal.dataset.tbNestedConfirm='1';confirmModal.classList.add('open');markOpened(confirmModal);afterUiChange();requestAnimationFrame(()=>button.focus?.({preventScroll:true}));
    };
    wrapped.__tbModalStackStability=true;window.showConfirm=wrapped;
  }
  function pauseHealthCheck(){clearTimeout(healthTimer);healthTimer=0;}
  function install(){
    wrapModalFunctions();installNestedConfirmProtection();openModals().forEach(markOpened);syncLayers();
    window.addEventListener('pageshow',settleOpenModalAnimations,{passive:true});
    window.addEventListener('pagehide',pauseHealthCheck,{passive:true});
    window.addEventListener('focus',settleOpenModalAnimations,{passive:true});
    window.addEventListener('resize',afterUiChange,{passive:true});
    window.visualViewport?.addEventListener('resize',afterUiChange,{passive:true});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseHealthCheck();else settleOpenModalAnimations();},{passive:true});
    document.addEventListener('animationend',event=>{if(event.target instanceof Element&&event.target.closest(MODAL_SELECTOR+'.open'))afterUiChange();},true);
    window.TeamBullsModalStackStability=Object.freeze({version:'10.10.9-modal2',patch:'freeze1',runtime:'health3',refresh:afterUiChange,recover:recoverOrphanedTop});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
