/* Review, read-only student preview, label conversion and confirmed change notices. */
(()=>{
  'use strict';if(window.TeamBullsPrescriptionWorkflow)return;
  const version='10.10.72-prescriptionworkflow2',baselineFlights=new Map();let previewState=null,reviewState=null,comparisonState=null;
  const model=()=>window.TeamBullsWorkflowModel,storage=()=>window.TeamBullsWorkflowStorage,ui=()=>window.TeamBullsWorkflowSync;
  const trainer=()=>{try{return CURRENT_USER?.role==='trainer'&&MODE==='cloud';}catch{return false;}},owner=()=>storage()?.owner();
  const h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),br=value=>Number(value||0).toLocaleString('pt-BR',{maximumFractionDigits:3,useGrouping:false});
  const get=fn=>{try{return fn()||null;}catch{return null;}};
  function current(kind){if(!trainer()||!get(()=>VIEW_STUDENT.uid))return null;const item=kind==='diet'?get(()=>currentDiet()):get(()=>VIEW_STUDENT_WORKOUT);return item?{kind,item,studentId:VIEW_STUDENT.uid,trainerId:CURRENT_USER.uid}:null;}
  const valid=context=>trainer()&&CURRENT_USER.uid===context?.trainerId&&get(()=>VIEW_STUDENT.uid)===context?.studentId;
  const snapshot=context=>context.kind==='diet'?model().dietSnapshot(context.item):model().workoutSnapshot(context.item);
  const baselineScope=context=>({owner:context.trainerId,subject:context.studentId,kind:'baseline',id:context.kind+':'+context.item.id});
  async function capture(context){if(!context)return;const scope=baselineScope(context),key=JSON.stringify(scope),initial=snapshot(context);if(baselineFlights.has(key))return baselineFlights.get(key);const task=(async()=>{const previous=await storage()?.get(scope);if(!previous&&valid(context))await storage()?.put(scope,{snapshot:initial});})().finally(()=>baselineFlights.delete(key));baselineFlights.set(key,task);return task;}
  function sets(exercise,week){return typeof resolveWeekPrescription==='function'?resolveWeekPrescription(exercise,week).sets:exercise.sets||[];}
  function issues(context){return context.kind==='diet'?model().reviewDiet(context.item,text=>window.TeamBullsDietLiveCalories?.analyze?.(text)):model().reviewWorkout({...context.item,days:getWorkoutDays(context.item)},sets);}
  function renderWarnings(host,warnings,open){
    host.replaceChildren();
    const errors=warnings.filter(warning=>warning.level!=='notice'),notices=warnings.filter(warning=>warning.level==='notice');
    const row=warning=>{
      const button=document.createElement('button');button.type='button';button.className='tb-flow-warning';button.dataset.level=warning.level||'warning';
      const text=document.createElement('span'),action=document.createElement('b');text.textContent=warning.message;action.textContent='CONFERIR';
      button.append(text,action);button.onclick=()=>open(warning);return button;
    };
    if(!errors.length){const message=document.createElement('p');message.className='tb-flow-caption';message.textContent='Nenhuma inconsistência encontrada nesta conferência.';host.append(message);}
    for(const warning of errors)host.append(row(warning));
    if(notices.length){
      const details=document.createElement('details');details.className='tb-flow-notices';
      const title=document.createElement('summary');title.textContent=notices.length+' '+(notices.length===1?'observação nutricional':'observações nutricionais');
      details.append(title);for(const warning of notices)details.append(row(warning));host.append(details);
    }
  }
  function confirmation(modal,action){
    return new Promise(resolve=>{
      let finished=false;
      const observer=new MutationObserver(()=>{
        if(!modal.classList.contains('open'))finish(false);
      });
      const finish=result=>{if(finished)return;finished=true;observer.disconnect();resolve(result);};
      observer.observe(modal,{attributes:true,attributeFilter:['class']});
      action.onclick=()=>{finish(true);closeModal(modal.id);};
    });
  }
  async function confirmWarnings(title,warnings,label){
    if(document.getElementById('modal-workflow-confirm')?.classList.contains('open'))return false;
    const {modal,body}=ui().dialog(title,'modal-workflow-confirm');
    const list=document.createElement('div');
    for(const warning of warnings){const p=document.createElement('p');p.className='tb-meal-review-note';p.textContent=warning.message;list.append(p);}
    const action=document.createElement('button');action.type='button';action.className='btn-primary';action.textContent=label;
    body.append(list,action);return confirmation(modal,action);
  }
  async function preview(kind='workout',override=null){
    const context=override||current(kind);if(!context)return;await capture(context);if(!valid(context))return;
    previewState={...context,week:1};const {body}=ui().dialog('Prévia como aluno','modal-prescription-preview');body.innerHTML='<p>Somente consulta. Esta prévia não inicia treino nem registra séries ou refeições.</p><div class="tb-flow-actions" data-preview-controls></div><div data-preview-content></div>';
    if(kind==='workout'){const label=document.createElement('label');label.textContent='Semana ';const select=document.createElement('select');select.className='form-input';for(let i=1;i<=8;i++)select.add(new Option('Semana '+i,i));select.onchange=()=>{previewState.week=Number(select.value);renderPreview();};label.append(select);body.querySelector('[data-preview-controls]').append(label);}
    renderPreview();
  }
  function videoButton(host,url,label){const id=typeof extractYouTubeId==='function'?extractYouTubeId(url):'';if(!id)return;const button=document.createElement('button');button.type='button';button.textContent='VER VÍDEO';button.onclick=()=>{if(valid(previewState))openCatalogVideo(url,label);};host.append(button);}
  function renderPreview(){
    const state=previewState,host=document.querySelector('#modal-prescription-preview [data-preview-content]');if(!host||!valid(state))return;host.replaceChildren();const title=document.createElement('h3');title.textContent=state.item.name;host.append(title);
    if(state.kind==='workout'){
      for(const day of getWorkoutDays(state.item)){const section=document.createElement('section');section.className='tb-preview-section';section.innerHTML='<h3></h3>';section.querySelector('h3').textContent=day.name;
        for(const exercise of exercisesForDay(state.item,day.name)){const item=document.createElement('article');item.className='tb-flow-row';const unit=exerciseResultUnit(exercise,state.week),rx=effectivePrescriptionSets(exercise,sets(exercise,state.week),state.week),techniques=techniqueItemsForExercise(exercise,state.week)||[];
          item.innerHTML='<div><strong>'+h(exercise.name)+'</strong><p>'+h(rx.length?rx.map((set,index)=>(index+1)+'ª: '+prescribedRangeLabel(set)+' '+unit+' · '+formatGerLevel(set.ger)).join(' / '):'Sem prescrição nesta semana')+'</p><p>'+h(techniques.map(item=>item.name).join(' · '))+'</p><p>'+h(exercise.instructions||'')+'</p></div><div class="tb-flow-actions"></div>';
          videoButton(item.querySelector('.tb-flow-actions'),exercise.videoUrl,exercise.name);
          const group=findExerciseGroup(exercise);if(group?.items?.length){const details=document.createElement('details');details.innerHTML='<summary>Substituições disponíveis</summary>';for(const option of group.items){const row=document.createElement('p');row.textContent=option.name;videoButton(row,option.videoUrl,option.name);details.append(row);}item.querySelector('div').append(details);}
          section.append(item);
        }host.append(section);
      }
    }else for(const variant of state.item.variants||[]){const section=document.createElement('section');section.className='tb-preview-section';section.innerHTML='<h3>'+h(variant.name)+'</h3><p>'+h(typeof dietVariantDayLabel==='function'?dietVariantDayLabel(variant):'')+'</p>';
      for(const meal of variant.meals||[]){const card=document.createElement('article');card.className='tb-flow-row';card.innerHTML='<div><strong>'+h(meal.time||'')+' · '+h(meal.name)+'</strong></div>';const copy=card.firstElementChild;
        for(const line of String(meal.items||'').split('\n').filter(Boolean)){const p=document.createElement('p');p.textContent=line;const portion=window.TeamBullsStudentFoodChoices?.parse?.(line),options=portion?window.TeamBullsStudentFoodChoices.foods(portion):[];if(options?.length){const details=document.createElement('details');details.innerHTML='<summary>Alimentos e quantidades</summary>';for(const option of options){const row=document.createElement('p');row.textContent=option.name+' · '+option.quantity;details.append(row);}p.append(details);}copy.append(p);}const note=document.createElement('p');note.textContent=meal.notes||'';copy.append(note);section.append(card);}host.append(section);
    }
  }
  async function review(kind='workout'){
    const context=current(kind);if(!context)return;await capture(context);const before=await storage().get(baselineScope(context));if(!valid(context))return;
    const after=snapshot(context),warnings=issues(context),lines=model().changes(kind,before?.snapshot,after);reviewState={...context,after,lines,warnings};const {body}=ui().dialog('Conferência da prescrição','modal-prescription-review');
    body.innerHTML='<p>As alterações salvas já aparecem na prescrição do aluno.</p><div class="tb-flow-actions"><button type="button" class="btn-ghost" data-student-preview>PRÉVIA COMO ALUNO</button></div><section data-review-issues></section><h3>Resumo para o aluno</h3><textarea class="form-input" rows="8" aria-label="Resumo para o aluno" data-review-message></textarea><p data-review-status role="status"></p><button type="button" class="btn-primary" data-review-send>ENVIAR RESUMO AO ALUNO</button>';
    body.querySelector('[data-student-preview]').onclick=()=>void preview(kind);
    renderWarnings(body.querySelector('[data-review-issues]'),warnings,warning=>void openIssue(context,warning));
    body.querySelector('textarea').value=lines.length?'Atualização de '+context.item.name+'\n\n'+lines.map(line=>'• '+line).join('\n'):'Prescrição revisada: '+context.item.name+'. As orientações atuais continuam disponíveis no aplicativo.';
    body.querySelector('[data-review-send]').onclick=()=>void sendReview(body);
  }
  async function openIssue(context,warning){
    if(!valid(context))return;closeModal('modal-prescription-review');
    if(context.kind==='workout'){
      if(warning.type!=='workout'&&VIEW_STUDENT_WORKOUT?.id!==context.item.id){
        await openTsWorkout(context.item.id);
        if(!valid(context)||VIEW_STUDENT_WORKOUT?.id!==context.item.id)return;
      }
      if(warning.type==='workout')openEditWorkoutTs(context.item.id);
      if(warning.type==='day'){openTsDay(warning.dayName);openEditDayModal(warning.dayName,'student');}
      if(warning.type==='exercise'){await openTsExercise(warning.id);await openEditExerciseModalTs();}
      if(warning.type==='prescription')openPrescriptionModal(warning.id,warning.week,'trainer');
    }else{
      if(warning.type!=='diet'&&currentDiet()?.id!==context.item.id){
        await openDietDetail(context.item.id,true);
        if(!valid(context)||currentDiet()?.id!==context.item.id)return;
      }
      if(warning.type==='diet')openEditDietModal(context.item.id);
      if(warning.type==='variant'){selectDietVariant(warning.id,true);openEditDietVariantModal(warning.id);}
      if(warning.type==='meal'){selectDietVariant(warning.variantId,true);openEditMealModal(warning.id);setTimeout(()=>document.getElementById('input-meal-items')?.focus(),0);}
    }
  }
  async function digest(value){const bytes=new TextEncoder().encode(value),hash=await crypto.subtle.digest('SHA-256',bytes);return[...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('').slice(0,48);}
  async function sendReview(body){
    const state=reviewState,latest=state&&current(state.kind);if(!latest||!valid(state)||latest.item.id!==state.item.id||model().stable(snapshot(latest))!==model().stable(state.after)){body.querySelector('[data-review-status]').textContent='A prescrição mudou. Abra a conferência novamente.';return false;}
    const message=body.querySelector('textarea').value.trim();if(!message||message.length>29000){body.querySelector('[data-review-status]').textContent='Informe um resumo de até 29.000 caracteres.';return false;}
    const problems=state.warnings.filter(warning=>warning.level!=='notice');
    if(problems.length&&!await confirmWarnings('Conferir resumo',problems,'ENVIAR APÓS CONFERÊNCIA'))return false;
    const refreshed=current(state.kind);if(!valid(state)||refreshed?.item.id!==state.item.id||model().stable(snapshot(refreshed))!==model().stable(state.after))return false;
    const button=body.querySelector('[data-review-send]');button.disabled=true;
    try{const id='change-'+await digest(state.trainerId+'|'+state.studentId+'|'+state.kind+'|'+model().stable(state.after)),scope={owner:state.trainerId,subject:state.studentId,kind:'delivery',id};let record=await storage().get(scope);
      if(!record){const saved=await storage().put(scope,{source:'change',status:'pending',payload:{studentId:state.studentId,trainerId:state.trainerId,title:'O que mudou · '+state.item.name,feedbackType:state.kind==='workout'?'protocol_update':'weekly_diet',message,read:false},after:state.after,baseline:baselineScope(state)});if(!saved.ok)throw new Error('Não foi possível guardar a identificação do envio neste aparelho. Tente novamente.');}
      const ok=await retryDelivery(id);if(valid(state))body.querySelector('[data-review-status]').textContent=ok?'Resumo confirmado na conta do aluno.':'Resumo guardado no aparelho. Confira a Central de sincronização.';return ok;
    }catch(error){ui().recordError(error,'send-change-summary');if(valid(state))body.querySelector('[data-review-status]').textContent=error.message;return false;}finally{if(button.isConnected)button.disabled=false;}
  }
  const deliveries=new Map();
  async function retryDelivery(id){
    if(!trainer()||!owner())return false;const actor=owner();if(deliveries.has(id))return deliveries.get(id);
    const task=(async()=>{const records=await storage().list('delivery'),record=records.find(item=>item.id===id&&item.source==='change');if(!record||record.owner!==actor)return false;if(record.status==='confirmed')return true;if(navigator.onLine===false)return false;
      const current=()=>trainer()&&owner()===actor,ref=db.collection('feedback').doc(id),query=db.collection('feedback').where('studentId','==',record.subject).where(firebase.firestore.FieldPath.documentId(),'==',id).limit(1);
      const confirmed=async()=>{const snap=await cloudGet(query,'confirmar resumo da prescrição');if(!current())throw new Error('A conta mudou.');const existing=snap.docs?.[0];if(!existing)return false;const data=existing.data();if(data.trainerId!==actor||data.studentId!==record.subject||data.message!==record.payload.message)throw new Error('O identificador do resumo já pertence a outro conteúdo.');return true;};
      try{if(!await confirmed()){if(!current())return false;await cloudWrite(ref.set({...record.payload,createdAt:firebase.firestore.FieldValue.serverTimestamp()}),'enviar resumo da prescrição');}if(!current())return false;await storage().put(record,{...record,status:'confirmed'});await storage().put(record.baseline,{snapshot:record.after});return true;}catch(error){if(current()){try{if(await confirmed()){await storage().put(record,{...record,status:'confirmed'});await storage().put(record.baseline,{snapshot:record.after});return true;}}catch{}ui().recordError(error,'confirm-change-summary',false);}return false;}
    })().finally(()=>deliveries.delete(id));deliveries.set(id,task);return task;
  }
  async function deliveryItems(){const actor=owner();return(await storage()?.list('delivery')||[]).filter(record=>record.owner===actor&&record.source==='change').map(record=>({id:record.id,type:'change',label:record.payload.title,status:record.status,date:new Date(record.updatedAt).toISOString().slice(0,10)}));}
  function labelTool(){
    if(!trainer())return;const {body}=ui().dialog('Cadastrar alimento pelo rótulo','modal-food-label');body.innerHTML='<p>Informe os macros da mesma quantidade indicada na embalagem. A equivalência usa as referências atuais da tabela do Team Bulls.</p><div class="tb-flow-grid"><label>Alimento<input data-label="name" maxlength="100"></label><label>Quantidade da embalagem<input type="number" data-label="serving" min="0.1" value="20"></label><label>Unidade<select data-label="unit"><option>g</option><option>ml</option></select></label><label>Proteína (g)<input type="number" min="0" step="0.01" data-label="protein"></label><label>Carboidrato (g)<input type="number" min="0" step="0.01" data-label="carbs"></label><label>Gordura (g)<input type="number" min="0" step="0.01" data-label="fat"></label><label>Macro principal<select data-label="macro"><option value="protein">Proteína</option><option value="carbs">Carboidrato</option><option value="fat">Gordura</option></select></label><label>Porções desejadas<input type="number" min="0.01" step="0.01" value="0.5" data-label="portions"></label></div><button type="button" data-label-calculate>CALCULAR EQUIVALÊNCIAS</button><div data-label-result role="status"></div>';
    const actor=owner();body.querySelector('[data-label-calculate]').onclick=()=>{
      if(!trainer()||owner()!==actor)return;const result=body.querySelector('[data-label-result]');try{const input=Object.fromEntries([...body.querySelectorAll('[data-label]')].map(el=>[el.dataset.label,el.value])),presets=window.TeamBullsDietPortions?.presets||[],refs={protein:presets.find(row=>row.id==='protein-10')?.protein,carbs:presets.find(row=>row.id==='carb-10')?.carbs,fat:presets.find(row=>row.id==='fat-10')?.fat},value=model().labelCalculation(input,refs);
        result.innerHTML='<h3>'+h(br(value.quantity)+' '+value.unit+' de '+value.name)+'</h3><p>'+h('P '+br(value.protein)+' g · C '+br(value.carbs)+' g · G '+br(value.fat)+' g · '+value.kcal+' kcal')+'</p><p>'+h('Equivale a '+br(value.portions.protein)+' porção de proteína + '+br(value.portions.carbs)+' de carboidrato + '+br(value.portions.fat)+' de gordura.')+'</p><p>'+h('Referência por porção: P '+br(refs.protein)+' g / C '+br(refs.carbs)+' g / G '+br(refs.fat)+' g.')+'</p><div class="tb-flow-actions"><button type="button" data-label-private>CONFERIR NA MINHA TABELA</button><button type="button" data-label-misc>CONFERIR EM ALIMENTOS DIVERSOS</button></div>';
        result.querySelector('[data-label-private]').onclick=()=>{if(!trainer()||owner()!==actor)return;window.TeamBullsDietPersonalization.newCustom();for(const [id,data] of Object.entries({'tb-custom-food-label':br(value.quantity)+' '+value.unit+' '+value.name,'tb-custom-food-protein':value.protein,'tb-custom-food-carbs':value.carbs,'tb-custom-food-fat':value.fat}))document.getElementById(id).value=String(data);};
        result.querySelector('[data-label-misc]').onclick=async()=>{if(!trainer()||owner()!==actor)return;await loadFoodOptions();if(owner()!==actor)return;openAddFoodMisc();document.getElementById('input-food-misc-name').value=value.name.slice(0,55)+' — '+br(value.quantity)+' '+value.unit;document.getElementById('input-food-misc-note').value=[['protein','proteína'],['carbs','carboidrato'],['fat','gordura']].filter(([key])=>value.portions[key]>0).map(([key,label])=>br(value.portions[key])+' porção de '+label).join(' + ');};
      }catch(error){result.textContent=error.message;}
    };
  }
  function comparison(){
    if(!get(()=>trainerProgressAllowed()))return;const modal=document.getElementById('modal-trainer-progress');comparisonState=TRAINER_PROGRESS;if(!modal||modal.querySelector('[data-period-comparison]'))return;
    const section=document.createElement('section');section.dataset.periodComparison='1';section.innerHTML='<h3>Comparar dois períodos</h3><div class="tb-flow-grid">'+['a-from','a-to','b-from','b-to'].map((id,index)=>'<label>'+['Período A · início','Período A · fim','Período B · início','Período B · fim'][index]+'<input type="date" data-period="'+id+'" class="form-input"></label>').join('')+'</div><button type="button" class="btn-add-set" data-compare-periods>COMPARAR CARGA, REPETIÇÕES E SÉRIES</button><p>Execuções, modos e unidades diferentes permanecem separados. A carga é o máximo do período; séries e repetições/segundos são totais registrados.</p><div data-comparison-result></div>';
    modal.querySelector('#tb-progress-content')?.insertAdjacentElement('beforebegin',section);comparisonState=TRAINER_PROGRESS;
    section.querySelector('[data-compare-periods]').onclick=()=>{if(!trainerProgressAllowed(comparisonState)||TRAINER_PROGRESS!==comparisonState)return;const output=section.querySelector('[data-comparison-result]');try{const field=id=>section.querySelector('[data-period="'+id+'"]').value,choice=document.getElementById('tb-progress-exercise').value,result=model().comparePeriods(comparisonState.rows.filter(row=>!choice||row.group===choice),{from:field('a-from'),to:field('a-to')},{from:field('b-from'),to:field('b-to')});output.innerHTML=result.length?result.map(row=>'<article class="tb-flow-row"><div><strong>'+h(row.name+' · '+row.mode+' · '+row.unit)+'</strong><p>'+h('Registros A: '+row.a.records+' / B: '+row.b.records)+'</p><div class="table-scroll"><table class="sets-table"><thead><tr><th>Indicador</th><th>A</th><th>B</th><th>Diferença</th></tr></thead><tbody>'+[['load','Maior carga (kg)'],['reps',row.unit==='seg'?'Tempo total (seg)':'Repetições totais'],['sets','Séries'],['volume','Volume (kg·reps)']].map(([key,label])=>'<tr><td>'+label+'</td><td>'+h(row.a.records&&row.a[key]!==null?br(row.a[key]):'—')+'</td><td>'+h(row.b.records&&row.b[key]!==null?br(row.b[key]):'—')+'</td><td>'+h(row.a.records&&row.b.records&&row.a[key]!==null&&row.b[key]!==null?br(row.b[key]-row.a[key]):'—')+'</td></tr>').join('')+'</tbody></table></div></div></article>').join(''):'Nenhum registro nos períodos escolhidos.';}catch(error){output.textContent=error.message;}};
  }
  async function retryFood(row){if(get(()=>CURRENT_USER.role)!=='student')return false;const actor=owner();await openMeals();if(owner()!==actor)return false;await openDietDetail(row.dietId,false);if(owner()!==actor)return false;selectDietVariant(row.variantId,false);return window.TeamBullsStudentFoodChoices.retry(row.id);}
  async function resumeDraft(record){
    if(record?.owner!==owner()||!record.route)return false;const route=record.route,actor=owner(),isTrainer=trainer();
    if(isTrainer&&route.subject!==actor){await viewStudent(route.subject,'Aluno','','active');if(owner()!==actor||get(()=>VIEW_STUDENT.uid)!==route.subject)return false;}
    closeModal('modal-workflow-sync');
    if(route.modal==='modal-weekly-checkin'){await loadWeeklyCheckinState(true);if(owner()===actor)openWeeklyCheckinModal();}
    else if(route.modal==='modal-answer-quest'){if(!isTrainer)await openAnswerQuestionnaire(String(route.entity));}
    else if(route.modal==='modal-trainer-payment'){if(isTrainer)await window.TeamBullsTrainerHub.openPaymentEditor(route.payment?.studentId||'',route.payment?.existing?route.payment.id:'');}
    else if(route.modal==='modal-feedback'){if(isTrainer)openFeedbackModal();}
    else if(route.modal==='modal-edit-session'){if(!isTrainer){const [wid,eid,sid]=route.entity.split('|');openWorkout(wid);openExercise(eid);openEditSession(sid);}}
    else if(route.modal==='modal-session'){if(!isTrainer){const [wid,eid]=route.entity.split('|');openWorkout(wid);openExercise(eid);openLogSessionModal();}}
    else if(['modal-meal','modal-diet','modal-diet-variant'].includes(route.modal)){if(!isTrainer)return false;await openTsMeals();if(route.diet)await openDietDetail(route.diet,true);if(route.variant)selectDietVariant(route.variant,true);if(route.modal==='modal-meal'){const mid=route.entity.split('|')[2];mid&&mid!=='new'?openEditMealModal(mid):openAddMealModal();}if(route.modal==='modal-diet')route.entity==='new'?openAddDietModal():openEditDietModal(route.entity);if(route.modal==='modal-diet-variant'){const id=route.entity.split('|')[1];id==='new'?openAddDietVariantModal():openEditDietVariantModal(id);}}
    else if(isTrainer){if(route.workout)openTsWorkout(route.workout);if(route.modal==='modal-workout')route.entity==='new'?openAddWorkoutModalTs():openEditWorkoutTs(route.entity);if(route.modal==='modal-day'){const day=route.entity.split('|').slice(1).join('|');day==='new'?openAddDayModal('student'):openEditDayModal(day,'student');}if(route.modal==='modal-exercise'){const [,eid,...day]=route.entity.split('|');if(day.length)openTsDay(day.join('|'));if(eid==='new')await openAddExerciseModalTs();else{await openTsExercise(eid);await openEditExerciseModalTs();}}if(route.modal==='modal-prescription'){const [wid,eid]=route.entity.split('|');openTsWorkout(wid);openPrescriptionModal(eid,1,'trainer');}}
    if(owner()!==actor)return false;setTimeout(()=>window.TeamBullsWorkflowDrafts.attach(route.modal),30);return true;
  }
  function tools(){
    if(!trainer())return;
    for(const [screenId,kind] of [['screen-ts-workout','workout'],['screen-ts-day','workout'],['screen-ts-diet-detail','diet']]){const screen=document.getElementById(screenId),content=screen?.querySelector('.content');if(!content||screen.querySelector('[data-prescription-workflow-tools]'))continue;const bar=document.createElement('nav');bar.className='tb-workflow-tools';bar.setAttribute('aria-label','Conferência da prescrição');bar.dataset.prescriptionWorkflowTools='1';bar.innerHTML='<button type="button" class="btn-add-set" data-preview>PRÉVIA COMO ALUNO</button><button type="button" class="btn-add-set" data-review>CONFERIR E AVISAR ALUNO</button>'+(kind==='diet'?'<button type="button" class="btn-add-set" data-label>CADASTRAR PELO RÓTULO</button>':'');bar.querySelector('[data-preview]').onclick=()=>void preview(kind);bar.querySelector('[data-review]').onclick=()=>void review(kind);bar.querySelector('[data-label]')?.addEventListener('click',labelTool);content.prepend(bar);}
    const modal=document.getElementById('tb-custom-food-modal');if(modal&&!modal.querySelector('[data-label-helper]')){const button=document.createElement('button');button.type='button';button.className='btn-add-set';button.dataset.labelHelper='1';button.textContent='CALCULAR PELO RÓTULO';button.onclick=labelTool;modal.querySelector('.modal-title')?.insertAdjacentElement('afterend',button);}
  }
  function hook(name,after){const base=window[name];if(typeof base!=='function'||base.__tbPrescriptionWorkflow)return;const wrapped=function(){const result=base.apply(this,arguments);if(result?.then)return result.then(value=>{after();return value;});after();return result;};Object.assign(wrapped,base);wrapped.__tbPrescriptionWorkflow=true;window[name]=wrapped;}

  async function gateActivation(name,base,args){
    if(!trainer())return base.apply(window,args);
    const kind=name==='activateTrainerWorkout'?'workout':'diet';
    const getItem=()=>kind==='workout'?get(()=>VIEW_STUDENT.workouts.find(row=>row.id===args[0])):get(()=>DIET_DOCUMENT.plans.find(row=>row.id===args[0]));
    const item=getItem();if(!item)return base.apply(window,args);
    const context={kind,item,trainerId:CURRENT_USER.uid,studentId:VIEW_STUDENT?.uid||DIET_CONTEXT?.targetUid};
    const warnings=issues(context),initial=model().stable(snapshot(context));
    if(!warnings.length)return base.apply(window,args);
    if(document.getElementById('modal-activation-preflight')?.classList.contains('open'))return false;
    const {modal,body}=ui().dialog('Conferir antes de ativar','modal-activation-preflight');
    body.innerHTML='<p>Confira a prescrição antes de disponibilizá-la ao aluno.</p><div data-activation-warnings></div><div class="tb-flow-actions"><button type="button" class="btn-ghost" data-look>PRÉVIA COMO ALUNO</button><button type="button" class="btn-primary" data-activate>ATIVAR APÓS CONFERÊNCIA</button></div>';
    renderWarnings(body.querySelector('[data-activation-warnings]'),warnings,warning=>{closeModal(modal.id);void openIssue(context,warning);});
    body.querySelector('[data-look]').onclick=()=>void preview(kind,context);
    if(!await confirmation(modal,body.querySelector('[data-activate]'))||!valid(context))return false;
    try{
      const latest=getItem();
      if(!latest||model().stable(snapshot({...context,item:latest}))!==initial)throw new Error('A prescrição mudou. Confira novamente.');
      return await base.apply(window,args);
    }catch(error){ui().recordError(error,'activate-prescription');return false;}
  }
  function mealWarnings(){
    const area=document.getElementById('input-meal-items');
    if(!area)return [];
    return model().reviewDiet({name:'Dieta',variants:[{id:'draft',meals:[{id:'draft',name:'Refeição',items:area.value}]}]},value=>window.TeamBullsDietLiveCalories?.analyze?.(value));
  }
  function showMealWarnings(){
    if(!trainer())return;
    const area=document.getElementById('input-meal-items');if(!area)return;
    let note=document.getElementById('tb-meal-review-note');
    if(!note){note=document.createElement('p');note.id='tb-meal-review-note';note.className='tb-meal-review-note';note.setAttribute('role','status');area.insertAdjacentElement('afterend',note);}
    const warnings=mealWarnings();note.hidden=!warnings.length;
    note.textContent=warnings.map(warning=>warning.message).join(' ');
  }
  function mealContextKey(){
    return JSON.stringify([owner(),get(()=>VIEW_STUDENT.uid),get(()=>currentDiet()?.id),get(()=>currentDietVariant()?.id),get(()=>EDIT_MEAL_ID),...['input-meal-time','input-meal-items','input-meal-notes'].map(id=>document.getElementById(id)?.value)]);
  }
  let mealChecking=false;
  function installActivationGates(){
    for(const name of ['activateTrainerWorkout','activateDietPlan']){const base=window[name];if(typeof base!=='function'||base.__tbActivationPreflight)continue;const wrapped=function(){return gateActivation(name,base,arguments);};Object.assign(wrapped,base);wrapped.__tbActivationPreflight=true;window[name]=wrapped;}
    if(typeof saveMeal==='function'&&!saveMeal.__tbMealPreflight){
      const base=saveMeal;
      const wrapped=async function(){
        if(!trainer())return base.apply(this,arguments);
        if(mealChecking)return false;
        showMealWarnings();
        const problems=mealWarnings().filter(warning=>warning.level!=='notice');
        if(!problems.length)return base.apply(this,arguments);
        const key=mealContextKey();
        mealChecking=true;
        try{
          if(!await confirmWarnings('Conferir refeição',problems,'SALVAR APÓS CONFERÊNCIA'))return false;
          if(!trainer()||mealContextKey()!==key||!document.getElementById('modal-meal')?.classList.contains('open'))return false;
          return await base.apply(this,arguments);
        }finally{mealChecking=false;}
      };
      Object.assign(wrapped,base);wrapped.__tbMealPreflight=true;saveMeal=wrapped;
    }
  }
  function install(){
    installActivationGates();tools();for(const name of ['openTsWorkout','renderTsWorkout','renderTsDay'])hook(name,()=>{tools();void capture(current('workout'));});for(const name of ['openDietDetail','selectDietVariant'])hook(name,()=>{tools();void capture(current('diet'));});hook('renderTrainerProgress',comparison);for(const name of ['openAddMealModal','openEditMealModal'])hook(name,showMealWarnings);
    const custom=window.TeamBullsDietPersonalization;if(custom&&!custom.__tbLabelHelper){window.TeamBullsDietPersonalization=Object.freeze({...custom,__tbLabelHelper:true,newCustom:function(){const result=custom.newCustom.apply(custom,arguments);tools();return result;},editCustom:function(){const result=custom.editCustom.apply(custom,arguments);tools();return result;}});}
  }
  document.addEventListener('input',event=>{if(event.target?.id==='input-meal-items')showMealWarnings();});
  ['team-bulls-runtime-ready','team-bulls-intelligence-ready'].forEach(name=>window.addEventListener(name,install));window.TeamBullsPrescriptionWorkflow=Object.freeze({version,preview,review,labelTool,deliveryItems,retryDelivery,resumeDraft,retryFood,comparison});install();
})();
