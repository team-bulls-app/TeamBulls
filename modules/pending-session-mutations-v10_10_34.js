/* Team Bulls v10.10.34 — edição/exclusão segura de registros ainda pendentes de sincronização. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_PENDING_SESSION_MUTATIONS_101034__)return;
  window.__TEAM_BULLS_PENDING_SESSION_MUTATIONS_101034__=true;

  const VERSION='10.10.63-pendingsession3';

  const perf=()=>window.TeamBullsSessionPerformance||null;
  const studentCloud=()=>{
    try{return CURRENT_USER?.role==='student'&&!!CURRENT_USER.uid&&(MODE==='cloud'||(MODE==='local'&&CURRENT_USER.offlineRegistered===true));}catch(error){return false;}
  };
  const pending=id=>studentCloud()&&!!perf()?.hasPending?.(String(id||''));
  const permissionLike=error=>{
    const code=String(error?.code||'').toLowerCase(),message=String(error?.message||'').toLowerCase();
    return code.includes('permission-denied')||code.includes('not-found')||message.includes('missing or insufficient permissions')||message.includes('not found');
  };

  function collectEditedSets(){
    const rows=[...document.querySelectorAll('#edit-sets-editor .performed-set-row')],sets=[];
    for(const row of rows){
      const rawWeight=String(row.querySelector('[data-f="w"]')?.value||'').trim();
      const rawReps=String(row.querySelector('[data-f="r"]')?.value||'').trim();
      if(rawWeight===''&&rawReps==='')continue;
      const weight=rawWeight===''?0:parseFloat(rawWeight),reps=parseInt(rawReps,10);
      if(!Number.isFinite(weight)||!Number.isInteger(reps)||weight<0||weight>10000||reps<0||reps>100){
        alert('Confira a carga e as repetições das séries realizadas.');return null;
      }
      const performed={weight,reps};
      if(row.dataset.backoff==='1')performed.backoff=true;
      try{
        const target=normalizePrescriptionSet({targetMin:row.dataset.targetMin,targetMax:row.dataset.targetMax,ger:row.dataset.ger});
        if(target)Object.assign(performed,target);
      }catch(error){}
      sets.push(performed);
    }
    return sets;
  }

  function installEditPatch(){
    if(typeof saveEditSession!=='function'||saveEditSession.__tbPendingSessionMutation)return false;
    const base=saveEditSession;
    const wrapped=async function(){
      const sessionId=String(typeof EDIT_SESSION_ID!=='undefined'&&EDIT_SESSION_ID||'');
      if(!sessionId||!pending(sessionId))return base.apply(this,arguments);

      const date=String(document.getElementById('edit-session-date')?.value||'');
      if(!date){alert('Selecione a data!');return;}
      const week=parseInt(document.getElementById('edit-session-week')?.value,10);
      if(!week||week<1||week>8){alert('Selecione a semana de treino!');return;}
      const note=String(document.getElementById('edit-session-note')?.value||'').trim();
      const sets=collectEditedSets();if(!sets)return;
      if(!sets.length){if(typeof deleteEditedSession==='function')deleteEditedSession();return;}

      const wid=EDIT_SESSION_WID||CUR_WORKOUT,eid=EDIT_SESSION_EID||CUR_EX,e=getE(wid,eid);if(!e)return;
      const idx=(e.sessions||[]).findIndex(session=>String(session.id)===sessionId);if(idx<0)return;
      const variant=selectedVariantData(e,'edit-session-variant');
      const performedTechniqueMode=selectedEditPerformedTechniqueMode(e);
      if(!beginAction('edit-session','modal-edit-session'))return;
      try{
        const queued=await perf()?.updatePending?.(sessionId,{date,week,note,sets,exerciseName:e.name,performedTechniqueMode,...variant});
        // Se a fila desapareceu entre o toque e a edição, a sincronização terminou:
        // nesse caso o fluxo canônico remoto já pode editar o documento existente.
        if(!queued){
          endAction('edit-session','modal-edit-session');
          if(perf()?.isDeleted?.(sessionId)){showToast('Este registro foi excluído. Abra o exercício novamente.',true);return false;}
          return base.apply(this,arguments);
        }
        Object.assign(e.sessions[idx],{date,week,note,sets,exerciseName:e.name,pendingSync:true},variant,{performedTechniqueMode});
        e.sessions.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
        const edited=e.sessions.find(session=>String(session.id)===sessionId);
        if(edited){syncSessionToHistory(edited);saveSessionArchive(CURRENT_USER.uid,[edited]);}
        saveCloudBackup();
        closeModal('modal-edit-session');
        if(CUR_WORKOUT===wid&&CUR_EX===eid)renderExercise();
        showToast('✓ Registro atualizado. A sincronização continuará em segundo plano.');
      }catch(error){
        console.error('[Team Bulls] edição de registro pendente',error);
        alert('Erro ao editar: '+(error?.message||error));
      }finally{
        endAction('edit-session','modal-edit-session');
      }
    };
    wrapped.__tbPendingSessionMutation=true;wrapped.__tbBase=base;saveEditSession=wrapped;return true;
  }

  function installDeletePatch(){
    if(typeof performDeleteSession!=='function')return false;
    if(performDeleteSession.__tbDurableSessionDelete)return true;
    // The core entry point now persists the deletion intent through the same
    // runtime for both synced and unsynced records, including registered offline.
    const base=performDeleteSession;
    const wrapped=function(){return base.apply(this,arguments);};
    wrapped.__tbPendingSessionMutation=true;wrapped.__tbDurableSessionDelete=true;wrapped.__tbBase=base;performDeleteSession=wrapped;return true;
  }

  function install(){
    if(!perf())return false;
    return installEditPatch()&&installDeletePatch();
  }
  if(!install()){
    window.addEventListener('team-bulls-runtime-state',install);
    [300,900,1800,3600].forEach(delay=>setTimeout(install,delay));
  }
  window.TeamBullsPendingSessionMutations=Object.freeze({version:VERSION,install,isPending:pending});
})();
