/* One wall-clock timer tied to the performed set. Never saves a session automatically. */
(()=>{
  'use strict';if(window.TeamBullsIsometrySeriesTimer)return;
  const version='10.10.71-isometrytimer1';let active=null,ticker=0;
  const owner=()=>window.TeamBullsWorkflowStorage?.owner?.()||String(typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.uid||typeof LOCAL_OWNER_UID!=='undefined'&&LOCAL_OWNER_UID||'');
  const elapsed=(started,now,target)=>Math.max(0,Math.min(Number(target)||3600,Math.floor((Number(now)-Number(started))/1000)));
  const format=seconds=>String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
  function context(edit=false){try{const wid=edit?EDIT_SESSION_WID:SESSION_WID,eid=edit?EDIT_SESSION_EID:SESSION_EID,week=Number(document.getElementById(edit?'edit-session-week':'input-session-week')?.value)||1;const exercise=edit?getE(wid,eid):(typeof sessionExerciseForSave==='function'?sessionExerciseForSave(wid,eid):getE(wid,eid));return{owner:owner(),wid,eid,week,exercise,edit};}catch{return null;}}
  function current(state,allowWeekChange=false){const now=context(state.context.edit);return!!now&&now.owner===state.context.owner&&now.wid===state.context.wid&&now.eid===state.context.eid&&(allowWeekChange||now.week===state.context.week)&&state.row.isConnected&&state.row.closest('.modal-backdrop')?.classList.contains('open');}
  function hasActiveSeries(edit=false){return!!active&&active.context.edit===edit&&current(active,true);}
  function update(state){if(!current(state)){clearInterval(ticker);ticker=0;active=null;return;}const seconds=elapsed(state.started,Date.now(),state.target);state.output.textContent='Realizado '+format(seconds)+' · faltam '+format(state.target-seconds);if(seconds>=state.target)finish(true);}
  function finish(alarm=false,allowWeekChange=false){
    const state=active;if(!state)return false;clearInterval(ticker);ticker=0;active=null;const seconds=elapsed(state.started,Date.now(),state.target);
    if(current(state,allowWeekChange)){
      state.start.disabled=false;state.stop.disabled=true;state.targetInput.disabled=false;
      if(seconds>0){state.input.value=String(seconds);state.input.dispatchEvent(new Event('input',{bubbles:true}));state.input.dispatchEvent(new Event('change',{bubbles:true}));state.output.textContent='Tempo medido: '+seconds+' segundos. Confira a carga e salve o registro.';}
      else state.output.textContent='Cronômetro encerrado antes de 1 segundo. Confira o tempo realizado.';
      if(alarm)try{window.TeamBullsCardioAlert?.restFinished?.();}catch{}
    }return true;
  }
  function start(row){
    const ctx=context(row.closest('#modal-edit-session')!==null);if(!ctx?.owner||!ctx.exercise)return false;
    if(active&&active.row!==row&&!confirm('Há uma série cronometrada em andamento. Encerrar esse cronômetro antes de iniciar outra série?'))return false;
    if(active)finish(false);
    const panel=row.querySelector('[data-series-timer]'),input=row.querySelector('[data-f="r"]'),targetInput=panel.querySelector('[data-series-target]'),target=Number(targetInput.value);
    if(!Number.isInteger(target)||target<1||target>3600){panel.querySelector('[data-series-time]').textContent='Use uma duração entre 1 e 3.600 segundos.';return false;}
    if(input.value&&!confirm('Ao encerrar, o tempo medido substituirá o valor desta série. Deseja iniciar?'))return false;
    try{window.TeamBullsCardioAlert?.prime?.();}catch{}
    active={row,context:ctx,input,targetInput,target,started:Date.now(),start:panel.querySelector('[data-series-start]'),stop:panel.querySelector('[data-series-stop]'),output:panel.querySelector('[data-series-time]')};active.start.disabled=true;active.stop.disabled=false;targetInput.disabled=true;
    update(active);ticker=setInterval(()=>active&&update(active),250);return true;
  }
  function decorate(editor,ctx){
    if(!editor||!ctx?.exercise)return;
    [...editor.querySelectorAll('.performed-set-row')].forEach((row,index)=>{
      let recorded='',recordedSet=null;if(ctx.edit)try{const history=findSessionOwner(EDIT_SESSION_ID)?.session?.sets||[];recordedSet=history[index];const known=[...new Set(history.map(set=>set.unit).filter(Boolean))];recorded=recordedSet?.unit||(known.length===1?known[0]:'');}catch{}
      const timed=recorded?recorded==='seconds':exerciseUsesResistedTime(ctx.exercise,ctx.week),unit=timed?'seconds':'reps';row.dataset.unit=unit;
      const input=row.querySelector('[data-f="r"]'),label=row.querySelector('.performed-field-result .performed-field-label');if(input){input.max=timed?'3600':'100';input.placeholder=timed?'seg':'reps';input.setAttribute('aria-label',timed?'Tempo realizado em segundos':'Repetições realizadas');}if(label)label.textContent=timed?'Tempo (seg)':'Reps';
      if(ctx.edit&&recordedSet&&normalizePrescriptionSet(recordedSet)){row.dataset.targetMin=recordedSet.targetMin;row.dataset.targetMax=recordedSet.targetMax;row.dataset.ger=recordedSet.ger;}
      const target=row.querySelector('.performed-target');if(target&&ctx.edit&&recordedSet&&normalizePrescriptionSet(recordedSet))target.textContent=prescribedRangeLabel(recordedSet)+' '+(timed?'seg':'reps');else if(target)target.textContent=String(target.textContent||'').replace(/\b(reps|seg)\b/g,timed?'seg':'reps');
      if(!timed){row.querySelector('[data-series-timer]')?.remove();return;}
      if(row.querySelector('[data-series-timer]'))return;
      const panel=document.createElement('div');panel.dataset.seriesTimer='1';panel.className='tb-series-timer';panel.innerHTML='<label>Tempo do cronômetro (seg)<input type="number" min="1" max="3600" step="1" data-series-target aria-label="Duração do cronômetro desta série em segundos"></label><button type="button" data-series-start>INICIAR SÉRIE</button><button type="button" data-series-stop disabled>ENCERRAR SÉRIE</button><span data-series-time role="status">Encerre antes se não conseguir manter a isometria. O tempo será preenchido; a carga e o salvamento ficam sob seu controle.</span>';
      panel.querySelector('input').value=String(Math.max(1,Math.min(3600,Number(row.dataset.targetMax)||60)));panel.querySelector('[data-series-start]').onclick=()=>start(row);panel.querySelector('[data-series-stop]').onclick=()=>active?.row===row&&finish(false);row.append(panel);
    });
  }
  function prepare(){decorate(document.getElementById('sets-editor'),context());decorate(document.getElementById('edit-sets-editor'),context(true));
    try{const exercise=getPlanEditExercise(),week=Number(document.getElementById('input-prescription-week')?.value)||1,config=typeof currentWeekTechniqueEditorConfig==='function'?currentWeekTechniqueEditorConfig():null,ids=config?.techniqueIds,timed=Array.isArray(ids)?ids.some(id=>['is','it'].includes(id)||/isometria/i.test(TECHNIQUE_CATALOG.items.find(item=>item.id===id)?.name||'')):exerciseUsesResistedTime(exercise,week);for(const row of document.querySelectorAll('#prescription-editor .plan-set-row')){row.dataset.unit=timed?'seconds':'reps';for(const input of row.querySelectorAll('[data-f="min"],[data-f="max"]')){input.max=timed?'3600':'100';input.setAttribute('aria-label',timed?'Tempo prescrito em segundos':'Repetições prescritas');}}}catch{}
  }
  function hook(name){
    const base=window[name];
    if(typeof base!=='function'||base.__tbIsometrySeriesTimer)return;
    const wrapped=function(){
      // The select changes before its handler runs. The existing edit handler
      // carries entered values into the rebuilt rows, including the elapsed time.
      if(name==='onEditSessionWeekChange'&&hasActiveSeries(true))finish(false,true);
      else if(['populateSessionEditorForWeek','openEditSession'].includes(name)&&active)finish(false);
      const result=base.apply(this,arguments);
      if(result?.then)return result.then(value=>{prepare();return value;});
      prepare();
      return result;
    };
    Object.assign(wrapped,base);
    wrapped.__tbIsometrySeriesTimer=true;
    wrapped.__tbBase=base;
    window[name]=wrapped;
  }
  function install(){for(const name of ['addSetRow','addEditSetRow','populateSessionEditorForWeek','openEditSession','openLogSessionModal','loadPrescriptionEditor','addPrescriptionSetRow','refreshBackoffPrescriptionRow','onEditSessionWeekChange'])hook(name);
    for(const name of ['saveSession','saveEditSession']){const base=window[name];if(typeof base==='function'&&!base.__tbIsometrySeriesTimer){const wrapped=function(){if(active){finish(false);window.TeamBullsWorkflowDrafts?.flush?.();}return base.apply(this,arguments);};Object.assign(wrapped,base);wrapped.__tbIsometrySeriesTimer=true;window[name]=wrapped;}}
    if(typeof closeModal==='function'&&!closeModal.__tbIsometrySeriesTimer){const base=closeModal;closeModal=function(id){if(['modal-session','modal-edit-session'].includes(id)&&active){finish(false);window.TeamBullsWorkflowDrafts?.flush?.();}return base.apply(this,arguments);};closeModal.__tbIsometrySeriesTimer=true;}
    if(!document.getElementById('tb-series-timer-style')){const style=document.createElement('style');style.id='tb-series-timer-style';style.textContent='.tb-series-timer{grid-column:1/-1;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px;border:1px solid #76504a;background:#211715;color:#eee;border-radius:6px}.tb-series-timer label{display:grid;gap:4px;font:12px Barlow,sans-serif;color:#d9cfc5}.tb-series-timer input{max-width:100px;min-height:44px;background:#111;color:#eee;border:1px solid #78675c;font-size:16px;padding:8px}.tb-series-timer button{min-height:44px;border:1px solid #b83c50;border-radius:5px;background:#55141f;color:#fff;font:800 14px Barlow,sans-serif;padding:8px 12px}.tb-series-timer button:disabled{opacity:.5}.tb-series-timer span{flex:1 1 220px;font:13px/1.5 Barlow,sans-serif;color:#f0d0ab}';document.head.append(style);}prepare();
  }
  window.addEventListener('pagehide',()=>{if(active){finish(false);window.TeamBullsWorkflowDrafts?.flush?.();}});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&active)update(active);});
  ['team-bulls-runtime-ready','team-bulls-student-runtime-ready','team-bulls-intelligence-ready'].forEach(name=>window.addEventListener(name,install));window.TeamBullsIsometrySeriesTimer=Object.freeze({version,prepare,start,finish,elapsed,hasActiveSeries,state:()=>active?{owner:active.context.owner,week:active.context.week,target:active.target,elapsed:elapsed(active.started,Date.now(),active.target)}:null});install();
})();
