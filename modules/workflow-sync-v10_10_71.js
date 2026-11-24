/* One visible control surface for existing durable queues and private diagnostics. */
(()=>{
  'use strict';if(window.TeamBullsWorkflowSync)return;
  const version='10.10.72-workflowsync3';let serial=0,rows=[],lastError=null,action='interface',queueOwner='',queueAt=0,queueRequest=null;
  const busy=new Set(),h=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const owner=()=>window.TeamBullsWorkflowStorage?.owner?.()||'',trainer=()=>{try{return CURRENT_USER?.role==='trainer';}catch{return false;}},model=()=>window.TeamBullsWorkflowModel;
  function category(error){const value=String(error?.code||error?.message||'').toLowerCase();return /permission|unauth/.test(value)?'permission':/quota|storage|armazenamento/.test(value)?'storage':/conflict|conflito/.test(value)?'conflict':/offline|network|timeout|unavailable|conex/.test(value)?'network':'other';}
  function diagnostic(){const base=window.TeamBullsSupportDiagnostics?.createSummary?.()||'Team Bulls — diagnóstico';const item=lastError||model()?.safeDiagnostic({action,stage:'interface',category:'other'});return base+'\nAção: '+item.action+'\nEtapa: '+item.stage+'\nCategoria: '+item.category+'\nHorário: '+item.at;}
  async function copy(){const text=diagnostic();try{await navigator.clipboard.writeText(text);if(typeof showToast==='function')showToast('Diagnóstico copiado. Compartilhe somente se desejar.');return true;}catch{const modal=dialog('Diagnóstico para suporte');const area=document.createElement('textarea');area.className='form-input';area.rows=14;area.readOnly=true;area.value=text;modal.body.append(area);area.focus();area.select();return false;}}
  function recordError(error,stage='interface',show=true){lastError=(!error&&lastError&&Date.now()-Date.parse(lastError.at)<10000)?lastError:model()?.safeDiagnostic({action,stage,category:category(error),at:Date.now()})||{action:'interface',stage:'interface',category:'other',at:new Date().toISOString()};if(!show)return;let host=document.getElementById('tb-workflow-error');if(!host){host=document.createElement('aside');host.id='tb-workflow-error';host.className='tb-workflow-error';host.innerHTML='<span>Precisa de ajuda com esta falha?</span><button type="button" data-copy-diagnostic>COPIAR DIAGNÓSTICO</button><button type="button" aria-label="Fechar diagnóstico" data-close-diagnostic>×</button>';document.body.append(host);host.querySelector('[data-copy-diagnostic]').onclick=()=>void copy();host.querySelector('[data-close-diagnostic]').onclick=()=>host.remove();}}
  function dialog(title,id='modal-workflow-sync'){
    let modal=document.getElementById(id);if(!modal){modal=document.createElement('div');modal.id=id;modal.className='modal-backdrop tb-flow-backdrop';modal.innerHTML='<div class="modal-sheet tb-flow-sheet"><div class="tb-flow-head"><h2></h2><button class="btn-ghost" type="button">FECHAR</button></div><div class="tb-flow-body"></div></div>';document.body.append(modal);modal.querySelector('button').onclick=()=>typeof closeModal==='function'?closeModal(id):modal.classList.remove('open');}
    modal.querySelector('h2').textContent=title;modal.querySelector('.tb-flow-body').replaceChildren();if(typeof openModal==='function')openModal(id);else modal.classList.add('open');return{modal,body:modal.querySelector('.tb-flow-body')};
  }
  async function collect(){
    const uid=owner();if(!uid)return[];const result=[];
    if(!trainer()){
      await window.TeamBullsSessionPerformance?.ready?.(uid);if(owner()!==uid)return[];
      result.push(...(window.TeamBullsSessionPerformance?.syncItems?.()||[]),...(window.TeamBullsWorkoutCompletion?.syncItems?.()||[]),...(window.TeamBullsStudentFoodChoices?.syncItems?.()||[]));
      const pending=new Set(result.filter(row=>row.type==='session').map(row=>row.id));
      try{for(const session of (typeof loadSessionArchive==='function'?loadSessionArchive(uid):[]).slice(-150)){if(!pending.has(session.id))result.push({id:session.id,type:'session',label:session.performedExerciseName||session.exerciseName||'Registro de séries',date:session.date,status:session.pendingSync?'pending':(typeof CURRENT_USER==='undefined'||!CURRENT_USER?.uid?'device':'confirmed')});}}catch{}
      result.push(...await window.TeamBullsStudentReportSubmitReconciliation?.syncItems?.()||[]);
    }else result.push(...await window.TeamBullsTrainerHub?.syncItems?.()||[],...await window.TeamBullsFeedbackMedia?.syncItems?.()||[]);
    result.push(...await window.TeamBullsPrescriptionWorkflow?.deliveryItems?.()||[]);
    const drafts=await window.TeamBullsWorkflowStorage?.list?.('draft')||[];result.push(...drafts.map(record=>({id:record.id,type:'draft',label:({'modal-weekly-checkin':'Relatório semanal','modal-answer-quest':'Relatório solicitado','modal-feedback':'Feedback','modal-meal':'Refeição','modal-session':'Registro de séries'}[record.route?.modal]||'Montagem da prescrição'),status:'local',date:new Date(record.updatedAt).toISOString().slice(0,10),record})));
    return owner()===uid?result.sort((a,b)=>(a.status==='confirmed')-(b.status==='confirmed')||String(b.date||'').localeCompare(String(a.date||''))):[];
  }
  const statusLabel=status=>({confirmed:'Confirmado na conta',pending:'Salvo no aparelho · aguardando confirmação',failed:'Salvo no aparelho · tentativa sem confirmação',local:'Rascunho neste aparelho',device:'Salvo neste aparelho','retry-available':'Envio não localizado · abra o rascunho para tentar novamente'}[status]||'Aguardando conferência');
  async function open(){
    const uid=owner(),run=++serial;if(!uid)return;const {body}=dialog('Central de sincronização');body.textContent='Conferindo os registros deste aparelho…';
    try{const next=await collect();if(run!==serial||owner()!==uid||!body.isConnected)return;rows=next;body.innerHTML='<p>Confira o estado de cada registro. Reenvios usam o identificador original; relatórios sem confirmação são verificados antes de qualquer novo envio.</p><div class="tb-flow-actions"><button type="button" data-sync-refresh>ATUALIZAR ESTADOS</button><button type="button" data-copy-diag>COPIAR DIAGNÓSTICO</button></div><div data-sync-list></div>';body.querySelector('[data-sync-refresh]').onclick=()=>void open();body.querySelector('[data-copy-diag]').onclick=()=>void copy();const list=body.querySelector('[data-sync-list]');
      if(!rows.length)list.textContent='Nenhuma pendência ou rascunho disponível neste aparelho.';
      rows.forEach((row,index)=>{const item=document.createElement('article');item.className='tb-flow-row';item.innerHTML='<div><strong></strong><small></small><span class="tb-flow-status"></span></div><div class="tb-flow-actions"></div>';item.querySelector('strong').textContent=row.label;item.querySelector('small').textContent=row.date||'';const status=item.querySelector('.tb-flow-status');status.dataset.status=row.status;status.textContent=statusLabel(row.status);const actions=item.querySelector('.tb-flow-actions');
        if(!['confirmed','device'].includes(row.status)){const button=document.createElement('button');button.type='button';button.textContent=row.type==='draft'||row.status==='retry-available'?'ABRIR RASCUNHO':row.type==='report'?'VERIFICAR ENVIO':'TENTAR NOVAMENTE';button.onclick=()=>void retry(index,button);actions.append(button);}list.append(item);});
    }catch(error){if(owner()===uid){body.textContent='Não foi possível conferir as pendências agora. Seus registros foram preservados.';recordError(error,'sync-list');}}
  }
  async function retry(index,button){
    const row=rows[index],uid=owner();if(!row||!uid)return;const identity=row.type+'|'+row.id;if(busy.has(identity))return;busy.add(identity);button.disabled=true;
    try{
      if(row.type==='draft')await window.TeamBullsPrescriptionWorkflow?.resumeDraft?.(row.record);
      else if(row.status==='retry-available'){const drafts=await window.TeamBullsWorkflowStorage.list('draft'),draft=drafts.find(item=>item.route?.modal===(row.id.startsWith('w:')?'modal-weekly-checkin':'modal-answer-quest'));if(draft)await window.TeamBullsPrescriptionWorkflow.resumeDraft(draft);else throw new Error('Abra o relatório na aba Relatórios para conferir o período e enviar novamente.');}
      else{
        if(navigator.onLine===false)throw new Error('Sem conexão. O registro continua neste aparelho.');
        if(row.type==='session')await window.TeamBullsSessionPerformance.retry(row.id);
        if(row.type==='workout')await window.TeamBullsWorkoutCompletion.retry(row.id);
        if(row.type==='food')await window.TeamBullsPrescriptionWorkflow.retryFood(row);
        if(row.type==='report')await window.TeamBullsStudentReportSubmitReconciliation.retry(row.id);
        if(row.type==='receipt')await window.TeamBullsTrainerHub.retryReceipt(row.id);
        if(row.type==='change')await window.TeamBullsPrescriptionWorkflow.retryDelivery(row.id);
        if(row.type==='media')await window.TeamBullsFeedbackMedia.retry(row.id);
        if(owner()===uid)await open();
      }
    }catch(error){if(owner()===uid){recordError(error,'retry-record');if(typeof showToast==='function')showToast(error.message||'Não foi possível confirmar o registro.',true);}}
    finally{busy.delete(identity);if(button.isConnected)button.disabled=false;}
  }
  function workQueue(force=false){
    const uid=owner(),host=document.getElementById('tb-work-queue');
    if(!host)return;
    const list=host.querySelector('[data-work-list]'),count=host.querySelector('[data-work-count]');
    const status=host.querySelector('[data-work-status]'),refresh=host.querySelector('[data-work-refresh]');
    const active=trainer()&&!!uid;
    host.hidden=!active;
    if(queueOwner!==(active?uid:'')){
      queueOwner=active?uid:'';queueAt=0;queueRequest=null;
      host.open=false;
      list.replaceChildren();count.textContent='';status.textContent='';refresh.disabled=false;
    }
    if(!active)return;
    refresh.onclick=()=>void workQueue(true);
    const api=window.TeamBullsTrainerIntelligenceData;
    if(queueRequest)return queueRequest;
    if(!api?.loadDashboard||(!force&&Date.now()-queueAt<60000))return;

    status.textContent='Conferindo relatórios e datas…';
    refresh.disabled=true;
    const request=Promise.resolve().then(()=>api.loadDashboard(force)).then(data=>{
      if(queueRequest!==request||owner()!==uid||!trainer())return;
      if(!data)throw new Error('Fila indisponível');
      const total=paintQueue(list,data,api);
      count.textContent=total===1?'1 pendência':total+' pendências';
      status.textContent=total?'':'Nenhuma pendência na fila.';
      queueAt=Date.now();
    }).catch(error=>{
      if(queueRequest!==request||owner()!==uid||!trainer())return;
      status.textContent='Não foi possível atualizar. Tente novamente.';
      recordError(error,'trainer-queue',false);
    }).finally(()=>{
      if(queueRequest!==request)return;
      queueRequest=null;
      refresh.disabled=false;
    });
    queueRequest=request;
    return request;
  }
  function paintQueue(list,data,api){
    const items=[],today=api.todayIso();
    const roster=new Map((data.rows||[]).map(row=>[row.student.uid,row]));
    for(const report of data.activity||[])if(report.read!==true&&roster.has(report.studentId)&&['weekly_checkin','questionnaire'].includes(report.type))items.push({student:roster.get(report.studentId).student,kind:'report',report,label:'Responder relatório recebido',date:report.submittedDate||today});
    for(const row of data.rows||[]){const state=api.protocolState(row.protocolSchedule);if(state?.pending)items.push({student:row.student,kind:'monthly',label:'Revisão mensal vencida',date:state.nextDueDate});if(row.protocolSchedule?.sourceWorkoutId&&model().iso(row.protocolSchedule.startDate)){const due=api.addDays(row.protocolSchedule.startDate,56);if(api.dayDiff(today,due)<=7)items.push({student:row.student,kind:'workout',label:due<today?'Treino com 8 semanas completas':'Treino próximo de 8 semanas',date:due,workoutId:row.protocolSchedule.sourceWorkoutId});}}
    items.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    const groups=document.createDocumentFragment();
    for(const [kind,title] of [['report','Relatórios'],['monthly','Revisões mensais'],['workout','Treinos']]){
      const entries=items.filter(item=>item.kind===kind);
      if(!entries.length)continue;
      const section=document.createElement('section');
      section.className='trainer-work-group';
      section.innerHTML='<h3></h3><ul></ul>';
      section.querySelector('h3').textContent=title;
      const visible=section.querySelector('ul');
      for(const item of entries.slice(0,5))visible.append(workRow(item));
      if(entries.length>5){
        const more=document.createElement('details');
        more.className='trainer-work-more';
        more.innerHTML='<summary></summary><ul></ul>';
        more.querySelector('summary').textContent='Ver mais ('+(entries.length-5)+')';
        const remaining=more.querySelector('ul');
        for(const item of entries.slice(5))remaining.append(workRow(item));
        section.append(more);
      }
      groups.append(section);
    }
    list.replaceChildren(groups);
    return items.length;
  }
  function workRow(item){
    const row=document.createElement('li');
    row.className='trainer-work-row';
    row.innerHTML='<div><strong></strong><span class="trainer-work-caption"></span><time class="trainer-work-date"></time></div><button type="button" class="btn-ghost">Abrir</button>';
    const name=item.student.name||'Aluno';
    row.querySelector('strong').textContent=name;
    row.querySelector('.trainer-work-caption').textContent=item.label;
    const date=model()?.iso(item.date)?item.date:'';
    const time=row.querySelector('time');
    if(date){
      time.dateTime=date;
      time.textContent=date.split('-').reverse().join('/');
    }else time.remove();
    const button=row.querySelector('button');
    button.setAttribute('aria-label','Abrir: '+name+' · '+item.label);
    button.onclick=async()=>{
      if(!button.isConnected||owner()!==queueOwner||!trainer())return;
      button.disabled=true;
      try{await openWork(item);}finally{button.disabled=false;}
    };
    return row;
  }
  async function openWork(item){const uid=owner();if(!trainer())return;try{await viewStudent(item.student.uid,item.student.name,item.student.email||'',item.student.status||'active');if(owner()!==uid||!trainer()||VIEW_STUDENT?.uid!==item.student.uid)return;if(item.kind==='report'){const collection=item.report.type==='weekly_checkin'?'weeklyCheckins':'questionnaires',snapshot=await cloudGet(db.collection(collection).doc(item.report.sourceId),'abrir relatório da fila');if(owner()!==uid||VIEW_STUDENT?.uid!==item.student.uid||!snapshot.exists||snapshot.data().studentId!==item.student.uid)return;if(collection==='weeklyCheckins'){WEEKLY_CHECKINS=[{...snapshot.data(),id:snapshot.id}];await viewWeeklyCheckin(snapshot.id,{source:'trainer-inbox',studentId:item.student.uid});}else{TS_QUEST_CACHE=[{...snapshot.data(),id:snapshot.id}];viewQuestionnaire(snapshot.id,true);}}else if(item.kind==='workout')openTsWorkout(item.workoutId);else document.getElementById('trainer-protocol-review-state')?.closest('section,article,div')?.scrollIntoView({block:'center'});}catch(error){recordError(error,'open-work-item');}}
  function entry(){const settings=document.querySelector('#screen-settings .settings-grid')||document.getElementById('screen-settings');if(settings&&!document.getElementById('tb-workflow-sync-entry')){const button=document.createElement('button');button.id='tb-workflow-sync-entry';button.className='btn-add-set';button.textContent='CENTRAL DE SINCRONIZAÇÃO E RASCUNHOS';button.onclick=()=>void open();settings.append(button);}void workQueue();}
  function install(){
    entry();if(typeof renderTrainer==='function'&&!renderTrainer.__tbWorkQueue){const base=renderTrainer;renderTrainer=async function(){const result=await base.apply(this,arguments);entry();return result;};renderTrainer.__tbWorkQueue=true;}
    if(typeof showToast==='function'&&!showToast.__tbWorkflowDiagnostics){const base=showToast;showToast=function(message,error){const result=base.apply(this,arguments);if(error)recordError(null,'interface');return result;};showToast.__tbWorkflowDiagnostics=true;}
    if(typeof cloudWrite==='function'&&!cloudWrite.__tbWorkflowDiagnostics){const base=cloudWrite;cloudWrite=async function(){try{return await base.apply(this,arguments);}catch(error){recordError(error,'cloud-write',false);throw error;}};cloudWrite.__tbWorkflowDiagnostics=true;}
    if(typeof alert==='function'&&!window.alert.__tbWorkflowDiagnostics){const base=window.alert;window.alert=function(){const result=base.apply(this,arguments);if(/erro|não foi|falh|recusad|permissão|indisponível/i.test(String(arguments[0]||'')))recordError(null,lastError?.stage||'interface');return result;};window.alert.__tbWorkflowDiagnostics=true;}
  }
  document.addEventListener('click',event=>{const button=event.target?.closest?.('button,[role="button"]');if(!button)return;const match=/^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\(/.exec(button.getAttribute('onclick')||'');action=match?.[1]||({'weekly-checkin-submit-button':'submitWeeklyCheckin','questionnaire-submit-button':'submitQuestionnaireAnswers','tb-payment-save':'savePayment'}[button.id])||'interface';},true);
  ['team-bulls-runtime-ready','team-bulls-student-runtime-ready','team-bulls-intelligence-ready'].forEach(name=>window.addEventListener(name,install));
  window.addEventListener('team-bulls-runtime-state',()=>void workQueue());
  window.TeamBullsWorkflowSync=Object.freeze({version,open,collect,copyDiagnostic:copy,recordError,dialog,workQueue});install();
})();
