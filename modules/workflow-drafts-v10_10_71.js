/* Recovery of explicitly edited fields, scoped to account + student + entity. */
(()=>{
  'use strict';if(window.TeamBullsWorkflowDrafts)return;
  const version='10.10.71-workflowdrafts1',states=new Map(),fileCache=new WeakMap();
  const ids=new Set(['modal-workout','modal-day','modal-exercise','modal-prescription','modal-session','modal-edit-session','modal-meal','modal-diet','modal-diet-variant','modal-weekly-checkin','modal-answer-quest','modal-trainer-payment','modal-feedback']);
  const store=()=>window.TeamBullsWorkflowStorage,model=()=>window.TeamBullsWorkflowModel;
  const value=fn=>{try{return fn()||'';}catch{return'';}};
  function scope(id){
    const owner=store()?.owner();if(!owner)return null;
    const trainer=value(()=>CURRENT_USER.role)==='trainer',subject=trainer?String(value(()=>VIEW_STUDENT.uid)||owner):owner;
    const workout=value(()=>VIEW_STUDENT_WORKOUT.id)||value(()=>CUR_WORKOUT),diet=value(()=>CURRENT_DIET_ID),variant=value(()=>CURRENT_DIET_VARIANT_ID);
    let entity='',route={modal:id,subject,workout,diet,variant};
    if(id==='modal-workout')entity=String(value(()=>EDIT_W)||'new');
    if(id==='modal-day')entity=String(workout)+'|'+String(value(()=>EDIT_DAY_NAME)||'new');
    if(id==='modal-exercise')entity=String(workout)+'|'+String(value(()=>EDIT_EXERCISE_ID)||'new')+'|'+String(value(()=>VIEW_STUDENT_DAY)||value(()=>CUR_DAY));
    if(id==='modal-prescription')entity=String(value(()=>PLAN_EDIT_WID))+'|'+String(value(()=>PLAN_EDIT_EID));
    if(id==='modal-session')entity=String(value(()=>SESSION_WID))+'|'+String(value(()=>SESSION_EID));
    if(id==='modal-edit-session')entity=String(value(()=>EDIT_SESSION_WID))+'|'+String(value(()=>EDIT_SESSION_EID))+'|'+String(value(()=>EDIT_SESSION_ID));
    if(id==='modal-meal')entity=String(diet)+'|'+String(variant)+'|'+String(value(()=>EDIT_MEAL_ID)||'new');
    if(id==='modal-diet')entity=String(value(()=>EDIT_DIET_PLAN_ID)||'new');
    if(id==='modal-diet-variant')entity=String(diet)+'|'+String(value(()=>EDIT_DIET_VARIANT_ID)||'new');
    if(id==='modal-weekly-checkin')entity=String(value(()=>WEEKLY_CHECKIN_REQUEST.documentKey)||value(()=>WEEKLY_CHECKIN_REQUEST.requestKey));
    if(id==='modal-answer-quest')entity=String(value(()=>CUR_ANSWER_QUEST_ID));
    if(id==='modal-trainer-payment'){const context=window.TeamBullsTrainerHub?.paymentDraftContext?.();entity=context?.existing?String(context.id):'new';route.payment=context;route.subject=context?.existing?context.studentId:owner;}
    if(id==='modal-feedback')entity=String(value(()=>VIEW_STUDENT.uid))+'|feedback';
    if(!entity||entity==='|')return null;route.entity=entity;
    return{owner,subject:route.subject||subject,kind:'draft',id:id+'|'+entity,route};
  }
  const same=(a,b)=>a&&b&&a.owner===b.owner&&a.subject===b.subject&&a.id===b.id;
  function controls(modal){return[...modal.querySelectorAll('input,select,textarea')].filter(el=>!el.closest('[data-workflow-draft-bar],.tb-workspace-foods,#tb-meal-portion-tool')&&!['password','file','hidden','button','submit','reset'].includes(el.type)&&!el.disabled&&!el.readOnly);}
  function identity(el,index){const row=el.closest('.performed-set-row,.plan-set-row');if(row){const rows=[...row.parentElement.querySelectorAll('.performed-set-row,.plan-set-row')];return 'row:'+rows.indexOf(row)+'|field:'+(el.dataset.f||Object.keys(el.dataset).join('|')||index);}return (el.id||el.getAttribute('data-weekly-question')!==null)?'id:'+el.id+'|weekly:'+el.getAttribute('data-weekly-question'):el.getAttribute('data-question-index')!==null?'question:'+el.getAttribute('data-question-index'):'position:'+index;}
  function fields(modal){return controls(modal).map((el,index)=>({key:identity(el,index),type:el.type||el.tagName,label:String(el.closest('.quest-answer-item,.form-group,label')?.querySelector('label,.form-label')?.textContent||'').trim().slice(0,180),value:el.type==='checkbox'||el.type==='radio'?!!el.checked:String(el.value||'').slice(0,30000)}));}
  function photoFiles(id){
    const list=id==='modal-weekly-checkin'?value(()=>WEEKLY_CHECKIN_FILES):id==='modal-answer-quest'?value(()=>QUESTIONNAIRE_REPORT_FILES):[];
    return Array.isArray(list)?list.map((file,index)=>file instanceof Blob?{file,index,id:(id==='modal-weekly-checkin'?'weekly-photo-':'report-photo-')+index}:null).filter(Boolean):[];
  }
  async function optimize(file){
    if(fileCache.has(file))return fileCache.get(file);
    const task=(async()=>{
      if(typeof compressImageFile==='function'){
        const url=await compressImageFile(file,1280,.78,850000),result=await fetch(url);return new File([await result.blob()],String(file.name||'foto').replace(/\.[^.]*$/,'')+'.jpg',{type:'image/jpeg'});
      }
      if(file.size>2*1024*1024)throw new Error('photo recovery unavailable');return file;
    })();fileCache.set(file,task);return task;
  }
  function status(state,message,error=false){if(!state.bar?.isConnected)return;const output=state.bar.querySelector('[data-draft-status]');output.textContent=message;output.dataset.error=error?'1':'0';}
  async function save(state){
    if(state.restoring||!same(state.scope,scope(state.id))||!store())return false;
    clearTimeout(state.timer);const revision=++state.revision,snapshot=fields(state.modal),photos=photoFiles(state.id),files=[];let incomplete=false;
    try{for(const item of photos){try{files.push({id:item.id,blob:await optimize(item.file),name:item.file.name||'foto.jpg'});}catch{incomplete=true;}}}catch{incomplete=true;}
    if(revision!==state.revision||!same(state.scope,scope(state.id)))return false;
    const result=await store().put(state.scope,{fields:snapshot,files,route:{...state.scope.route,...(state.id==='modal-trainer-payment'?{payment:window.TeamBullsTrainerHub?.paymentDraftContext?.()}:{} )},shape:{sets:state.modal.querySelectorAll('.performed-set-row').length,prescription:state.modal.querySelectorAll('.plan-set-row').length},mediaRequired:incomplete});
    if(revision!==state.revision||!same(state.scope,scope(state.id)))return false;
    state.dirty=false;status(state,result.ok?(incomplete||!result.media?'Texto guardado no aparelho. Se reabrir, selecione novamente as fotos que não foram recuperadas.':'Rascunho guardado neste aparelho · '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})):'Não foi possível guardar o rascunho neste aparelho.',!result.ok);return result.ok;
  }
  function schedule(state){if(state.restoring)return;state.dirty=true;status(state,'Guardando rascunho…');clearTimeout(state.timer);state.timer=setTimeout(()=>void save(state),300);}
  async function restore(state,record){
    if(!same(state.scope,scope(state.id))||!state.modal.classList.contains('open'))return false;state.restoring=true;let skipped=0;
    try{
      const apply=()=>{const elements=controls(state.modal);for(const field of record.fields||[]){const index=elements.findIndex((el,i)=>identity(el,i)===field.key);if(index<0){skipped++;continue;}const el=elements[index],label=String(el.closest('.quest-answer-item,.form-group,label')?.querySelector('label,.form-label')?.textContent||'').trim().slice(0,180);if(label!==field.label||field.type!==(el.type||el.tagName)){skipped++;continue;}if(['checkbox','radio'].includes(el.type))el.checked=!!field.value;else el.value=field.value;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}};
      apply();
      if(record.shape?.sets&&['modal-session','modal-edit-session'].includes(state.id)&&typeof addSetRow==='function'){for(let i=state.modal.querySelectorAll('.performed-set-row').length;i<Math.min(60,record.shape.sets);i++)(state.id==='modal-edit-session'?addEditSetRow:addSetRow)('','');apply();}
      if(record.shape?.prescription&&state.id==='modal-prescription'&&typeof addPrescriptionSetRow==='function'){for(let i=state.modal.querySelectorAll('.plan-set-row').length;i<Math.min(60,record.shape.prescription);i++)addPrescriptionSetRow();apply();}
      for(const file of record.files||[]){if(!same(state.scope,scope(state.id)))return false;const input=document.getElementById(file.id);if(!input||!state.modal.contains(input))continue;try{const transfer=new DataTransfer();transfer.items.add(new File([file.blob],file.name,{type:file.blob.type||'image/jpeg'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));}catch{skipped++;}}
      if(record.route?.payment)window.TeamBullsTrainerHub?.restorePaymentDraft?.(record.route.payment);
      state.bar.querySelector('[data-draft-recover]').hidden=true;status(state,skipped||record.mediaRequired?'Rascunho recuperado. Confira os campos atualizados e as seis fotos antes de enviar.':'Rascunho recuperado. Confira antes de salvar ou enviar.');return true;
    }finally{state.restoring=false;}
  }
  async function attach(id){
    const modal=document.getElementById(id),context=scope(id);if(!modal?.classList.contains('open')||!context)return;
    const previous=states.get(id);if(previous&&same(previous.scope,context)&&previous.bar?.isConnected)return;
    if(previous){clearTimeout(previous.timer);previous.bar?.remove();}
    const state={id,modal,scope:context,revision:0,dirty:false,restoring:false};states.set(id,state);
    const bar=document.createElement('section');bar.dataset.workflowDraftBar='1';bar.className='tb-workflow-draft';bar.innerHTML='<span data-draft-status role="status">Rascunho automático neste aparelho</span><button type="button" data-draft-recover hidden>RECUPERAR</button><button type="button" data-draft-discard hidden>DESCARTAR</button>';state.bar=bar;
    (modal.querySelector('.modal-title')||modal.querySelector('.modal-sheet')?.firstElementChild)?.insertAdjacentElement('afterend',bar);
    const record=await store()?.get(context);if(!same(context,scope(id))||states.get(id)!==state)return;
    if(!record)return;
    if(model()?.stable(record.fields)===model()?.stable(fields(modal))&&!record.files?.length){await store().remove(context);return;}
    status(state,'Há um rascunho de '+new Date(record.updatedAt).toLocaleString('pt-BR')+'. Confira antes de recuperar.');
    const recover=bar.querySelector('[data-draft-recover]'),discard=bar.querySelector('[data-draft-discard]');recover.hidden=discard.hidden=false;
    recover.onclick=()=>void restore(state,record);discard.onclick=async()=>{if(!same(context,scope(id))||!confirm('Descartar somente este rascunho do aparelho? Os registros salvos na conta serão mantidos.'))return;await store().remove(context);recover.hidden=discard.hidden=true;status(state,'Rascunho descartado.');};
  }
  async function confirmed(id){const state=states.get(id);if(!state||state.scope.owner!==store()?.owner())return;clearTimeout(state.timer);state.revision++;state.dirty=false;await store().remove(state.scope);}
  function install(){
    if(typeof openModal==='function'&&!openModal.__tbWorkflowDrafts){const base=openModal;openModal=function(id){const result=base.apply(this,arguments);if(ids.has(id))setTimeout(()=>void attach(id),0);return result;};openModal.__tbWorkflowDrafts=true;}
    if(typeof closeModal==='function'&&!closeModal.__tbWorkflowDrafts){const base=closeModal;closeModal=function(id){const state=states.get(id);if(state?.dirty)void save(state);return base.apply(this,arguments);};closeModal.__tbWorkflowDrafts=true;}
    for(const id of ids)if(document.getElementById(id)?.classList.contains('open'))void attach(id);
  }
  document.addEventListener('input',event=>{const modal=event.target?.closest?.('.modal-backdrop.open'),state=modal&&states.get(modal.id);if(state&&!event.target.closest('[data-workflow-draft-bar]'))schedule(state);},true);
  document.addEventListener('change',event=>{const modal=event.target?.closest?.('.modal-backdrop.open'),state=modal&&states.get(modal.id);if(state&&!event.target.closest('[data-workflow-draft-bar]'))schedule(state);},true);
  const flush=()=>{for(const state of states.values())if(state.dirty)void save(state);};window.addEventListener('pagehide',flush);document.addEventListener('visibilitychange',()=>{if(document.hidden)flush();});
  ['team-bulls-runtime-ready','team-bulls-student-runtime-ready','team-bulls-intelligence-ready'].forEach(name=>window.addEventListener(name,install));
  window.TeamBullsWorkflowDrafts=Object.freeze({version,attach,confirmed,flush,restore:(id,record)=>states.has(id)?restore(states.get(id),record):false});install();
})();
