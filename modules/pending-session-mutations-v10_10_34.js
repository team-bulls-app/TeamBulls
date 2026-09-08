/* Team Bulls v10.10.34 — edição/exclusão segura de registros ainda pendentes de sincronização. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_PENDING_SESSION_MUTATIONS_101034__)return;
  window.__TEAM_BULLS_PENDING_SESSION_MUTATIONS_101034__=true;

  const VERSION='10.10.34-pendingsession1';

  const perf=()=>window.TeamBullsSessionPerformance||null;
  const studentCloud=()=>{
    try{return MODE==='cloud'&&CURRENT_USER?.role==='student'&&!!CURRENT_USER?.uid;}catch(error){return false;}
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
        const queued=perf()?.updatePending?.(sessionId,{date,week,note,sets,exerciseName:e.name,performedTechniqueMode,...variant});
        // Se a fila desapareceu entre o toque e a edição, a sincronização terminou:
        // nesse caso o fluxo canônico remoto já pode editar o documento existente.
        if(!queued){
          endAction('edit-session','modal-edit-session');
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

  function removeLocalSession(sessionId,owner){
    if(owner?.exercise)owner.exercise.sessions=(owner.exercise.sessions||[]).filter(session=>String(session.id)!==sessionId);
    try{removeSessionFromHistory(sessionId);}catch(error){}
    try{removeSessionFromArchive(CURRENT_USER.uid,sessionId);}catch(error){}
    try{saveCloudBackup();}catch(error){}
    try{EDIT_SESSION_ID=null;EDIT_SESSION_WID=null;EDIT_SESSION_EID=null;}catch(error){}
    try{closeModal('modal-edit-session');}catch(error){}
    try{renderExercise();}catch(error){}
  }

  function installDeletePatch(){
    if(typeof performDeleteSession!=='function'||performDeleteSession.__tbPendingSessionMutation)return false;
    const base=performDeleteSession;
    const wrapped=async function(rawId){
      const sessionId=String(rawId||'');if(!sessionId||!pending(sessionId))return base.apply(this,arguments);
      const owner=typeof findSessionOwner==='function'?findSessionOwner(sessionId):null;
      if(!beginAction('delete-session-'+sessionId))return false;
      try{
        const sessionPerf=perf();
        if(!sessionPerf?.discardPending?.(sessionId))throw new Error('Não foi possível retirar este registro da fila local.');

        // Se uma criação já estava em voo no exato momento do toque, aguarda
        // somente essa operação já iniciada. Não dispara retry automático.
        if(navigator.onLine!==false)await Promise.resolve(sessionPerf.flush?.()).catch(()=>false);

        // Uma única limpeza remota cobre a corrida rara em que a criação chegou
        // ao servidor enquanto o aluno confirmava a exclusão. Para registros que
        // nunca chegaram ao servidor, Rules podem responder permission-denied;
        // isso é esperado e não deve impedir a exclusão da cópia pendente local.
        if(navigator.onLine!==false&&typeof db!=='undefined'&&db){
          try{await cloudWrite(db.collection('sessions').doc(sessionId).delete(),'excluir registro pendente');}
          catch(error){if(!permissionLike(error))console.warn('[Team Bulls] limpeza remota do registro pendente',error?.code||error?.message||error);}
        }
        removeLocalSession(sessionId,owner);
        showToast('✓ Registro excluído.');
        return true;
      }catch(error){
        console.error('[Team Bulls] exclusão de registro pendente',error);
        alert('Não foi possível excluir o registro: '+(error?.message||error));return false;
      }finally{endAction('delete-session-'+sessionId);}
    };
    wrapped.__tbPendingSessionMutation=true;wrapped.__tbBase=base;performDeleteSession=wrapped;return true;
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
