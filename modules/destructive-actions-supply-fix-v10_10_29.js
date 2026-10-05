/* Team Bulls v10.10.29 — exclusões seguras e atalho de opções de suprimentos resiliente. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_DESTRUCTIVE_SUPPLY_FIX_101029__)return;
  window.__TEAM_BULLS_DESTRUCTIVE_SUPPLY_FIX_101029__=true;

  const VERSION='10.10.29-destructive-supply2';
  const SESSION_QUEUE_PREFIX='team_bulls_pending_sessions_v1_';
  let screenObserver=null;

  function clone(value){
    try{return JSON.parse(JSON.stringify(value));}catch(error){return null;}
  }
  function student(){
    try{return CURRENT_USER?.role==='student';}catch(error){return false;}
  }
  function trainer(){
    try{return CURRENT_USER?.role==='trainer';}catch(error){return false;}
  }
  function reportError(error,label){
    console.error('[Team Bulls] Falha ao '+label,error);
    const message=typeof cloudWriteError==='function'?cloudWriteError(error,label):(error?.message||('Não foi possível '+label+'.'));
    if(typeof alert==='function')alert(message);
    return false;
  }
  function showMessage(message,error=false){
    if(typeof showToast==='function')showToast(message,error);
    else if(error&&typeof alert==='function')alert(message);
  }

  /* ── Exclusão de dieta: mantém contexto/editor até a confirmação e gravação. ── */
  function captureDietContext(){
    try{return{
      targetUid:String(DIET_CONTEXT?.targetUid||''),
      trainer:DIET_CONTEXT?.trainer===true,
      planId:String(EDIT_DIET_PLAN_ID||''),
      currentId:String(CURRENT_DIET_ID||'')
    };}catch(error){return null;}
  }
  function sameDietContext(context){
    const current=captureDietContext();
    return !!current&&!!context&&current.trainer===context.trainer&&current.targetUid===context.targetUid&&current.planId===context.planId;
  }
  function trainerDietEditable(){
    try{return trainer()&&DIET_CONTEXT?.trainer===true&&!!DIET_CONTEXT?.targetUid&&typeof dietCanEdit==='function'&&dietCanEdit();}catch(error){return false;}
  }
  function renderTrainerDietList(){
    try{if(typeof renderDietList==='function')renderDietList('ts-meals-list','ts-meals-empty',true);}catch(error){console.warn('[Team Bulls] Dieta excluída, mas a lista não atualizou imediatamente.',error);}
  }
  async function deleteDietConfirmed(context){
    if(!trainerDietEditable()||!sameDietContext(context))return reportError(new Error('A dieta aberta mudou. Abra o editor novamente.'),'excluir a dieta');
    const plan=(DIET_DOCUMENT?.plans||[]).find(item=>String(item.id)===context.planId);
    if(!plan)return reportError(new Error('A dieta selecionada não está mais disponível.'),'excluir a dieta');
    const snapshot=clone(DIET_DOCUMENT);
    if(!snapshot)return reportError(new Error('Não foi possível preparar a cópia de segurança da dieta.'),'excluir a dieta');
    const actionKey='delete-diet-plan-'+context.planId;
    if(typeof beginAction==='function'&&!beginAction(actionKey))return false;
    try{
      DIET_DOCUMENT.plans=(DIET_DOCUMENT.plans||[]).filter(item=>String(item.id)!==context.planId);
      if(typeof normalizeDietDocument==='function')DIET_DOCUMENT=normalizeDietDocument(DIET_DOCUMENT);
      await persistDietDocument();
      try{EDIT_DIET_PLAN_ID='';if(String(CURRENT_DIET_ID||'')===context.planId)CURRENT_DIET_ID='';}catch(error){}
      if(typeof closeModal==='function')closeModal('modal-diet');
      renderTrainerDietList();
      if(typeof showScreen==='function')showScreen('screen-ts-meals');
      showMessage('✓ Dieta excluída');
      return true;
    }catch(error){
      try{DIET_DOCUMENT=typeof normalizeDietDocument==='function'?normalizeDietDocument(snapshot):snapshot;}catch(inner){DIET_DOCUMENT=snapshot;}
      renderTrainerDietList();
      return reportError(error,'excluir a dieta');
    }finally{
      if(typeof endAction==='function')endAction(actionKey);
    }
  }
  function safeDeleteCurrentDiet(){
    if(!trainerDietEditable())return false;
    const context=captureDietContext();
    if(!context?.planId)return reportError(new Error('Dieta não identificada. Feche e abra o editor novamente.'),'excluir a dieta');
    const task=()=>deleteDietConfirmed(context);
    const text='Excluir esta dieta, suas refeições e tabelas de suplementos? A dieta só será removida depois da confirmação e da gravação segura. Os registros históricos do aluno permanecem preservados.';
    if(typeof showConfirm==='function'){showConfirm('Excluir dieta',text,task);return true;}
    if(window.confirm(text)){void task();return true;}
    return false;
  }
  function installDietDeletePatch(){
    if(typeof deleteCurrentDiet!=='function')return false;
    if(deleteCurrentDiet.__tbSafeDietDelete101029)return true;
    const base=deleteCurrentDiet;
    const wrapped=function(){
      if(trainerDietEditable())return safeDeleteCurrentDiet();
      return base.apply(this,arguments);
    };
    wrapped.__tbSafeDietDelete101029=true;
    wrapped.__tbBase=base;
    deleteCurrentDiet=wrapped;
    return true;
  }

  /* ── Exclusão de sessão: serializa com a fila rápida antes do delete cloud. ── */
  function queueKey(uidValue){
    const safe=String(uidValue||'').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,160);
    return SESSION_QUEUE_PREFIX+safe;
  }
  function queuedSession(uidValue,sessionId){
    if(!uidValue||!sessionId)return false;
    try{
      const raw=typeof storageGet==='function'?storageGet(queueKey(uidValue)):localStorage.getItem(queueKey(uidValue));
      const items=JSON.parse(raw||'[]');
      return Array.isArray(items)&&items.some(item=>String(item?.id||'')===String(sessionId)&&String(item?.userId||'')===String(uidValue));
    }catch(error){return false;}
  }
  async function settleQueuedSession(sessionId){
    if(!student()||typeof MODE==='undefined'||MODE!=='cloud')return true;
    const uidValue=String(CURRENT_USER?.uid||'');
    if(!uidValue||!queuedSession(uidValue,sessionId))return true;
    const runtime=window.TeamBullsSessionPerformance;
    if(!runtime||typeof runtime.flush!=='function'){
      showMessage('Este registro ainda está aguardando sincronização. Aguarde a conexão finalizar antes de apagá-lo.',true);
      return false;
    }
    try{await runtime.flush();}catch(error){console.warn('[Team Bulls] Fila de séries ainda não sincronizada.',error);}
    if(queuedSession(uidValue,sessionId)){
      showMessage('Este registro ainda não foi sincronizado. Conecte-se à internet e tente apagar novamente para evitar que ele reapareça.',true);
      return false;
    }
    return true;
  }
  function installSessionDeletePatch(){
    if(typeof performDeleteSession!=='function')return false;
    if(performDeleteSession.__tbQueueSafeDelete101029)return true;
    const base=performDeleteSession;
    const wrapped=async function(sid){
      const sessionId=String(sid||'');
      if(sessionId&&student()&&typeof MODE!=='undefined'&&MODE==='cloud'){
        // A camada de exclusão pendente já cancela a fila e resolve a corrida
        // com uma criação em voo. Impedir seu acesso aqui prende o aluno no aviso
        // "ainda não foi sincronizado" mesmo após confirmar a exclusão.
        if(window.TeamBullsSessionPerformance?.hasPending?.(sessionId)&&base.__tbPendingSessionMutation)
          return base.apply(this,arguments);
        if(!await settleQueuedSession(sessionId))return false;
      }
      return base.apply(this,arguments);
    };
    wrapped.__tbQueueSafeDelete101029=true;
    wrapped.__tbBase=base;
    performDeleteSession=wrapped;
    return true;
  }
  function installLastSetDeletePatch(){
    if(typeof removeEditSet!=='function')return false;
    if(removeEditSet.__tbLastSetDelete101029)return true;
    const base=removeEditSet;
    const wrapped=function(button){
      const row=button?.closest?.('.performed-set-row');
      const editor=document.getElementById('edit-sets-editor');
      const rows=editor?[...editor.querySelectorAll('.performed-set-row')]:[];
      let sessionId='';try{sessionId=String(EDIT_SESSION_ID||'');}catch(error){}
      if(row&&rows.length===1&&rows[0]===row&&sessionId&&student()){
        const task=async()=>{
          const deleted=await performDeleteSession(sessionId);
          if(deleted&&typeof closeModal==='function')closeModal('modal-edit-session');
          return deleted;
        };
        const text='Esta é a última série deste registro. Deseja apagar o registro completo, incluindo as cargas, repetições e anotações desta sessão?';
        if(typeof showConfirm==='function'){showConfirm('Apagar registro completo',text,task);return false;}
        if(window.confirm(text)){void task();return false;}
        return false;
      }
      return base.apply(this,arguments);
    };
    wrapped.__tbLastSetDelete101029=true;
    wrapped.__tbBase=base;
    removeEditSet=wrapped;
    return true;
  }

  /* ── Atalho de opções: valida o DOM real em vez de confiar só no data-flag. ── */
  function supplyIcon(){
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8c-4.1-2.7-8 .6-7.4 5.5C5.2 18.5 8.2 21 12 21s6.8-2.5 7.4-7.5C20 8.6 16.1 5.3 12 8Z"/><path d="M12 8c-.1-2.7 1.1-4.6 3.7-5.7"/><path d="M14.1 4.2c1.8-.8 3.6-.5 4.7.4-1 1.8-2.9 2.7-5 2.3"/></svg>';
  }
  function ensureSupplyStyles(){
    if(document.getElementById('tb-supply-header-repair-style'))return;
    const style=document.createElement('style');
    style.id='tb-supply-header-repair-style';
    style.textContent=`
      #screen-diet-detail .tb-supply-options-header-btn,#screen-ts-diet-detail .tb-supply-options-header-btn{width:auto;max-width:min(190px,48vw);height:36px;padding:0 8px;gap:6px;display:inline-flex;align-items:center;justify-content:flex-start;color:#b7a89d;border:1px solid transparent;border-radius:8px;font:500 8px/1.15 'DM Mono',monospace;letter-spacing:.25px;white-space:nowrap}
      #screen-diet-detail .tb-supply-options-header-btn svg,#screen-ts-diet-detail .tb-supply-options-header-btn svg{width:18px;height:18px;flex:0 0 18px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
      #screen-diet-detail .tb-supply-options-header-btn span,#screen-ts-diet-detail .tb-supply-options-header-btn span{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis}
      @media(max-width:520px){#screen-diet-detail .tb-supply-options-header-btn,#screen-ts-diet-detail .tb-supply-options-header-btn{max-width:148px;padding:0 5px;gap:4px;font-size:6.6px;letter-spacing:0}#screen-diet-detail .tb-supply-options-header-btn svg,#screen-ts-diet-detail .tb-supply-options-header-btn svg{width:16px;height:16px;flex-basis:16px}}
    `;
    document.head.appendChild(style);
  }
  function repairSupplyButton(screenId){
    const button=document.querySelector(`#${screenId} .header button[onclick*="openFoodOptionsFromDiet"]`);
    if(!button)return false;
    button.classList.add('tb-supply-options-header-btn');
    button.title='Opções de suprimentos';
    button.setAttribute('aria-label','Opções de suprimentos');
    const label=button.querySelector('span');
    const validSvg=!!button.querySelector('svg');
    const validLabel=String(label?.textContent||'').trim()==='Opções de suprimentos';
    if(!validSvg||!validLabel){
      button.innerHTML=supplyIcon()+'<span>Opções de suprimentos</span>';
    }
    button.dataset.tbSupplyOptionsHeader='1';
    return true;
  }
  function repairSupplyHeaders(){
    ensureSupplyStyles();
    repairSupplyButton('screen-diet-detail');
    repairSupplyButton('screen-ts-diet-detail');
  }
  function installDietOpenPatch(){
    if(typeof openDietDetail!=='function')return false;
    if(openDietDetail.__tbSupplyRepair101029)return true;
    const base=openDietDetail;
    const wrapped=async function(){
      const result=await base.apply(this,arguments);
      repairSupplyHeaders();
      return result;
    };
    wrapped.__tbSupplyRepair101029=true;
    wrapped.__tbBase=base;
    openDietDetail=wrapped;
    return true;
  }
  function installScreenObserver(){
    if(screenObserver||typeof MutationObserver!=='function')return;
    const screens=['screen-diet-detail','screen-ts-diet-detail'].map(id=>document.getElementById(id)).filter(Boolean);
    if(!screens.length)return;
    screenObserver=new MutationObserver(()=>repairSupplyHeaders());
    screens.forEach(screen=>screenObserver.observe(screen,{attributes:true,attributeFilter:['class']}));
  }

  function install(){
    const diet=installDietDeletePatch();
    const session=installSessionDeletePatch();
    const sets=installLastSetDeletePatch();
    installDietOpenPatch();
    installScreenObserver();
    repairSupplyHeaders();
    window.TeamBullsDestructiveSupplyFix=Object.freeze({version:VERSION,diet,session,sets,repairSupplyHeaders,queuedSession});
    return diet&&session&&sets;
  }

  install();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  window.addEventListener('team-bulls-v107-ready',install);
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('team-bulls-student-runtime-ready',install);
  window.addEventListener('pageshow',()=>{install();repairSupplyHeaders();},{passive:true});
  [400,1200,3000].forEach(delay=>setTimeout(install,delay));
})();
