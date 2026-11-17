/* Team Bulls v10.10.9 — proteção contra fechamento acidental de editores. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_MODAL_FORM_GUARD_V10109__)return;
  window.__TEAM_BULLS_MODAL_FORM_GUARD_V10109__=true;

  const EDITABLE_SELECTOR='input:not([type="hidden"]),textarea,select,[contenteditable="true"],[contenteditable=""]';
  const GUARDED_EVENTS=['pointerdown','mousedown','touchstart','click'];

  function isOpenBackdrop(node){
    return node instanceof HTMLElement&&node.classList.contains('modal-backdrop')&&node.classList.contains('open');
  }

  function shouldProtect(backdrop){
    if(!isOpenBackdrop(backdrop))return false;
    if(backdrop.dataset.tbBackdropClose==='allow')return false;
    if(backdrop.dataset.tbBackdropClose==='block')return true;
    return !!backdrop.querySelector(EDITABLE_SELECTOR);
  }

  function outsideSheet(event,backdrop){
    const target=event.target;
    if(!(target instanceof Element))return false;
    if(target===backdrop)return true;
    return !target.closest('.modal-sheet');
  }

  function guardBackdropEvent(event){
    const backdrop=event.currentTarget;
    if(!shouldProtect(backdrop)||!outsideSheet(event,backdrop))return;
    event.stopPropagation();
    event.stopImmediatePropagation();
    if(event.type==='click')event.preventDefault();
  }

  function bindBackdrop(backdrop){
    if(!(backdrop instanceof HTMLElement)||!backdrop.classList.contains('modal-backdrop')||backdrop.dataset.tbFormGuardBound==='1')return;
    backdrop.dataset.tbFormGuardBound='1';
    GUARDED_EVENTS.forEach(type=>backdrop.addEventListener(type,guardBackdropEvent,{capture:true,passive:type==='touchstart'}));
  }

  function bindAll(root=document){
    if(root instanceof HTMLElement&&root.classList.contains('modal-backdrop'))bindBackdrop(root);
    root.querySelectorAll?.('.modal-backdrop').forEach(bindBackdrop);
  }

  function topModal(){
    const modals=[...document.querySelectorAll('.modal-backdrop.open')];
    if(document.body.classList.contains('tb-workspace-wide')&&!document.body.classList.contains('tb-workspace-blocked')){
      const focused=document.activeElement?.closest?.('.modal-backdrop.open');
      if(focused)return focused;
    }
    return modals.sort((a,b)=>(Number(a.dataset.tbModalOpenSeq)||0)-(Number(b.dataset.tbModalOpenSeq)||0)).at(-1)||null;
  }

  function closeTopModalWithEscape(event){
    if(event.key!=='Escape'||event.repeat)return;
    const modal=topModal();if(!modal)return;
    try{
      if(typeof ACTION_LOCKS!=='undefined'&&ACTION_LOCKS?.size){
        event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
        if(typeof showToast==='function')showToast('Aguarde a operação terminar para fechar.',true);
        return;
      }
    }catch(error){}
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    try{
      if(typeof closeModal==='function'&&modal.id)closeModal(modal.id);
      else modal.classList.remove('open');
    }catch(error){modal.classList.remove('open');}
  }

  function install(){
    bindAll(document);
    const observer=new MutationObserver(records=>{
      records.forEach(record=>record.addedNodes.forEach(node=>{
        if(node instanceof HTMLElement)bindAll(node);
      }));
    });
    observer.observe(document.body,{childList:true,subtree:true});
    document.addEventListener('keydown',closeTopModalWithEscape,{capture:true});

    window.TeamBullsModalFormGuard=Object.freeze({
      shouldProtect,
      refresh:()=>bindAll(document),
      closeTopModal(){const modal=topModal();if(modal?.id&&typeof closeModal==='function')closeModal(modal.id);},
      allowBackdropClose(id,allow=true){
        const modal=document.getElementById(String(id||''));
        if(modal?.classList.contains('modal-backdrop'))modal.dataset.tbBackdropClose=allow?'allow':'block';
      }
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
