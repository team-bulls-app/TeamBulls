/* Team Bulls — registro, apelido, organização e ciclo de vida dos alunos. */
'use strict';
(()=>{
  if(window.TeamBullsStudentAdministration)return;
  const VERSION='10.10.71-studentadmin1',records=new Map(),preferences=new Map(),pendingMoves=new Map();
  let owner='',ownerRevision=null,generation=0,renderSequence=0,preferencesRevision=0,archived=false,editor=null;
  const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const arg=value=>safe(JSON.stringify(String(value||'')));
  const clean=value=>String(value||'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,'').replace(/\s+/g,' ').trim().slice(0,100);
  const trainer=()=>CURRENT_USER?.role==='trainer'&&MODE==='cloud';
  async function bounded(task,ms,message){let timer;try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error(message),{code:'unavailable'})),ms);})]);}finally{clearTimeout(timer);}}
  const sessionRevision=()=>typeof AUTH_STATE_REVISION==='number'?AUTH_STATE_REVISION:auth?.currentUser;
  function ensureOwner(){const next=trainer()?String(CURRENT_USER.uid):'',revision=sessionRevision();if(next!==owner||ownerRevision!==revision){owner=next;ownerRevision=revision;generation++;renderSequence++;records.clear();preferences.clear();pendingMoves.clear();archived=false;editor=null;}return owner;}
  function identity(row){const registeredName=clean(row?.registeredName||row?.name)||'Aluno',nickname=typeof row?.nickname==='string'?clean(row.nickname):'';return{...row,registeredName,name:nickname&&nickname!==registeredName?`${registeredName} (${nickname})`:registeredName};}
  function getStudent(uid){return ensureOwner()?records.get(String(uid))||null:null;}
  async function request(action,data={}){
    const actor=CURRENT_USER?.uid,role=CURRENT_USER?.role,user=auth?.currentUser,revision=sessionRevision();
    if(MODE!=='cloud'||!actor||user?.uid!==actor)throw new Error('Entre novamente para continuar.');
    if(navigator.onLine===false)throw Object.assign(new Error('Conecte-se para salvar esta alteração.'),{code:'unavailable'});
    const current=()=>CURRENT_USER?.uid===actor&&CURRENT_USER?.role===role&&auth?.currentUser?.uid===actor&&sessionRevision()===revision;
    if(typeof firebase.appCheck!=='function'&&typeof initOptionalAppCheck==='function')await bounded(initOptionalAppCheck(),10000,'A validação está demorando. Tente novamente.');
    const [token,check]=await bounded(Promise.all([user.getIdToken(action==='delete'),firebase.appCheck().getToken(false)]),10000,'A validação está demorando. Tente novamente.');
    if(!current())throw new Error('A sessão mudou. Abra a tela novamente.');
    if(!check?.token)throw new Error('A validação do aplicativo ainda não está pronta. Tente novamente.');
    const project=String(CFG.firebase.projectId||'');if(!/^[a-z0-9-]+$/.test(project))throw new Error('Configuração do serviço indisponível.');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),action==='delete'?120000:10000);
    try{
      const response=await fetch(`https://southamerica-east1-${project}.cloudfunctions.net/studentAdministration`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,'X-Firebase-AppCheck':check.token},body:JSON.stringify({data:{...data,action,clientVersion:VERSION}}),signal:controller.signal});
      const result=await response.json().catch(()=>({}));if(!current())throw new Error('A sessão mudou. Abra a tela novamente.');
      if(!response.ok||result.error){const message=response.status===404?'O serviço de organização de alunos ainda não está ativo.':result.error?.message||'Não foi possível confirmar a alteração. Tente novamente.';throw Object.assign(new Error(message),{code:String(result.error?.status||response.status).toLowerCase(),details:result.error?.details});}
      if(!Object.prototype.hasOwnProperty.call(result,'result'))throw new Error('O servidor não confirmou a alteração.');return result.result;
    }catch(error){if(error.name==='AbortError')throw Object.assign(new Error(action==='delete'?'A exclusão ainda não foi confirmada. Consulte Alunos arquivados para acompanhar e retomar.':'A confirmação demorou. Tente novamente; a alteração pode já ter sido salva.'),{code:'unavailable'});throw error;}finally{clearTimeout(timer);}
  }
  function updatePreferences(actor,patch){
    const {promise,...previous}=preferences.get(actor)||{};
    preferencesRevision++;const value={order:[],archivedIds:[],pendingDeletions:[],ready:false,...previous,...patch,at:Date.now()};preferences.set(actor,value);return value;
  }
  async function loadPreferences(force=false){
    const uid=ensureOwner();if(!uid)return{order:[],archivedIds:[],pendingDeletions:[],ready:false};
    const cached=preferences.get(uid);if(cached?.promise)return cached.promise;if(!force&&cached?.at&&Date.now()-cached.at<30000)return cached;
    const revision=generation,readRevision=preferencesRevision;
    const promise=request('preferences').then(result=>{
      if(ensureOwner()!==uid||revision!==generation)throw new Error('A sessão mudou.');
      if(readRevision!==preferencesRevision)return{...preferences.get(uid),promise:undefined};
      const value={order:Array.isArray(result.order)?result.order:[],archivedIds:Array.isArray(result.archivedIds)?result.archivedIds:[],pendingDeletions:Array.isArray(result.pendingDeletions)?result.pendingDeletions:[],ready:true,at:Date.now()};
      preferences.set(uid,value);if(force)pendingMoves.clear();try{localStorage.setItem('team_bulls_roster_order_'+uid,JSON.stringify(value.order));localStorage.setItem('team_bulls_roster_archived_'+uid,JSON.stringify(value.archivedIds));}catch{}return value;
    }).catch(error=>{
      if(ensureOwner()===uid&&revision===generation&&readRevision!==preferencesRevision)return{...preferences.get(uid),promise:undefined};
      let order=cached?.order||[];if(!order.length)try{const saved=JSON.parse(localStorage.getItem('team_bulls_roster_order_'+uid)||'[]');if(Array.isArray(saved))order=saved;}catch{}
      let archivedIds=cached?.archivedIds||[];if(!archivedIds.length)try{const saved=JSON.parse(localStorage.getItem('team_bulls_roster_archived_'+uid)||'[]');if(Array.isArray(saved))archivedIds=saved;}catch{}
      const value={order,archivedIds,pendingDeletions:cached?.pendingDeletions||[],ready:false,error:error.message,at:Date.now()};
      if(ensureOwner()===uid&&revision===generation)preferences.set(uid,value);return value;
    });preferences.set(uid,{...cached,promise});return promise;
  }
  function sorted(rows,order){const ranks=new Map(order.map((id,index)=>[id,index]));return rows.slice().sort((a,b)=>(ranks.get(a.uid)??Infinity)-(ranks.get(b.uid)??Infinity)||identity(a).registeredName.localeCompare(identity(b).registeredName,'pt-BR')||a.uid.localeCompare(b.uid));}
  async function renderRoster(rows){
    const uid=ensureOwner(),revision=generation,sequence=++renderSequence;if(!uid)return;
    const list=document.getElementById('student-list'),empty=document.getElementById('student-empty');if(!list)return;
    const loading=loadPreferences();let timer;
    const settings=await Promise.race([loading,new Promise(resolve=>{timer=setTimeout(()=>{
      const previous=preferences.get(uid)||{};let order=previous.order||[],archivedIds=previous.archivedIds||[];
      try{if(!order.length){const saved=JSON.parse(localStorage.getItem('team_bulls_roster_order_'+uid)||'[]');if(Array.isArray(saved))order=saved;}if(!archivedIds.length){const saved=JSON.parse(localStorage.getItem('team_bulls_roster_archived_'+uid)||'[]');if(Array.isArray(saved))archivedIds=saved;}}catch{}
      resolve({order,archivedIds,pendingDeletions:previous.pendingDeletions||[],ready:false,loading:true});
    },1000);})]);clearTimeout(timer);
    if(ensureOwner()!==uid||generation!==revision||sequence!==renderSequence)return;
    if(settings.loading)loading.then(()=>{if(ensureOwner()===uid&&generation===revision&&sequence===renderSequence)return renderRoster(rows);}).catch(()=>{});
    records.clear();rows.filter(row=>row.role==='student'&&String(row.trainerId||'')===uid).forEach(row=>records.set(String(row.uid),{...row,isArchived:settings.archivedIds.includes(String(row.uid))}));
    const all=[...records.values()],main=all.filter(row=>!row.isArchived),removed=all.filter(row=>row.isArchived),visible=archived?removed:sorted(main,settings.order);
    let toolbar=document.getElementById('tb-roster-toolbar');if(!toolbar){toolbar=document.createElement('div');toolbar.id='tb-roster-toolbar';toolbar.className='tb-roster-toolbar';list.before(toolbar);}
    toolbar.innerHTML=`<button class="btn-add-set" type="button" onclick="TeamBullsStudentAdministration.showArchived(false)" ${archived?'':'aria-current="page"'}>ALUNOS PRINCIPAIS (${main.length})</button><button class="btn-add-set" type="button" onclick="TeamBullsStudentAdministration.showArchived(true)" ${archived?'aria-current="page"':''}>ALUNOS ARQUIVADOS (${removed.length+settings.pendingDeletions.length})</button>${settings.ready?'':`<div class="plan-help" role="status">${settings.loading?'Carregando organização dos alunos. A lista e os históricos já estão disponíveis.':'Organização de alunos indisponível agora. A lista e os históricos continuam acessíveis.'} ${settings.loading?'':`<button type="button" onclick="TeamBullsStudentAdministration.refresh()">TENTAR NOVAMENTE</button>`}</div>`}`;
    const stats=document.getElementById('trainer-stats');if(stats)stats.innerHTML=`<div class="stat-cell"><div class="num">${main.length}</div><div class="lbl">Alunos</div></div><div class="stat-cell"><div class="num">${main.filter(row=>row.status==='active').length}</div><div class="lbl">Ativos</div></div><div class="stat-cell"><div class="num">${main.filter(row=>row.status!=='active').length}</div><div class="lbl">Pausados</div></div>`;
    const disabled=settings.ready?'':'disabled';
    list.innerHTML=visible.map((raw,index)=>{const row=identity(raw),active=row.status==='active',initials=row.registeredName.split(/\s+/).map(n=>n[0]).slice(0,2).join('');return`<div class="student-card tb-managed-student" data-student-uid="${safe(row.uid)}" data-student-status="${active?'active':'inactive'}"><div class="student-avatar">${safe(initials)}</div><div class="student-info"><div class="archive-file-kicker">ARQUIVO ${typeof studentArchiveCode==='function'?safe(studentArchiveCode(row.uid)):''}</div><div class="student-name-row"><span class="tb-student-status-dot ${active?'active':'inactive'}" role="img" aria-label="${active?'Aluno ativo':'Aluno bloqueado'}"></span><div class="student-name" title="${safe(row.name)}">${safe(row.name)}</div></div><div class="student-meta" title="${safe(row.email)}">${safe(row.email||'')}</div></div><div class="student-actions tb-roster-actions">${archived?'':`<button type="button" onclick="TeamBullsStudentAdministration.move(${arg(row.uid)},-1)" aria-label="Mover ${safe(row.name)} para cima" ${index===0?'disabled':disabled}>↑</button><button type="button" onclick="TeamBullsStudentAdministration.move(${arg(row.uid)},1)" aria-label="Mover ${safe(row.name)} para baixo" ${index===visible.length-1?'disabled':disabled}>↓</button>`}<button class="btn-view-student" onclick="viewStudent(${arg(row.uid)},${arg(row.name)},${arg(row.email)},${arg(row.status)})">ABRIR</button>${archived?`<button type="button" onclick="TeamBullsStudentAdministration.restore(${arg(row.uid)})" ${disabled}>RESTAURAR ACESSO</button><button type="button" class="tb-roster-danger" onclick="TeamBullsStudentAdministration.openEditor('delete',${arg(row.uid)})" ${disabled}>EXCLUIR DEFINITIVAMENTE</button>`:`<button class="toggle-btn ${active?'deactivate':'activate'}" onclick="toggleStudent(${arg(row.uid)},${active})">${active?'PAUSAR':'ATIVAR'}</button><button type="button" class="tb-roster-danger" onclick="TeamBullsStudentAdministration.archive(${arg(row.uid)})" ${disabled}>REMOVER</button>`}</div></div>`;}).join('');
    if(archived)list.innerHTML+=settings.pendingDeletions.map(row=>`<div class="student-card tb-roster-pending"><div class="student-info"><strong>${safe(row.registeredName||'Aluno')}</strong><div class="plan-help">Exclusão definitiva ainda não confirmada. O acesso permanece bloqueado.</div></div><button type="button" onclick="TeamBullsStudentAdministration.openEditor('delete',${arg(row.uid)})">CONSULTAR / CONCLUIR EXCLUSÃO</button></div>`).join('');
    if(empty)empty.style.display=visible.length||archived&&settings.pendingDeletions.length?'none':'block';enhanceProfile();
  }
  async function refresh(){await loadPreferences(true);if(trainer())return renderTrainer();}
  function showArchived(value){if(!ensureOwner())return;archived=value;return renderRoster([...records.values()]);}
  async function move(uid,direction){
    const actor=ensureOwner(),row=getStudent(uid);if(!actor||!row||row.isArchived||![-1,1].includes(direction))return false;
    const key='move-student';if(!beginAction(key))return false;
    const params=pendingMoves.get(uid)||{studentUid:uid,direction,requestId:typeof crypto.randomUUID==='function'?crypto.randomUUID():'move-'+Date.now()+'-'+Math.random().toString(36).slice(2)};
    if(params.direction!==direction){endAction(key);showToast('Repita o movimento anterior para confirmar a ordem antes de inverter.',true);return false;}
    pendingMoves.set(uid,params);
    try{const result=await request('move',params);if(ensureOwner()!==actor)return false;pendingMoves.delete(uid);updatePreferences(actor,{order:result.order,ready:true});try{localStorage.setItem('team_bulls_roster_order_'+actor,JSON.stringify(result.order));}catch{}await renderRoster([...records.values()]);return true;}
    catch(error){if(ensureOwner()===actor)showToast(error.message,true);return false;}finally{endAction(key);}
  }
  function confirmLifecycle(uid,action){
    const actor=ensureOwner(),revision=generation,row=getStudent(uid);if(!actor||!row)return false;
    const label=identity(row).name,restore=action==='restore';
    showConfirm(restore?'Restaurar acesso do aluno':'Remover aluno da lista',restore?`Restaurar o acesso online de ${label} e voltar à lista principal?`:`Remover ${label} da lista principal e bloquear o acesso online? Treinos, dieta, registros e pagamentos serão preservados em Alunos arquivados.`,async()=>{
      if(ensureOwner()!==actor||generation!==revision)return false;const key='student-lifecycle';if(!beginAction(key))return false;
      try{const updated=await request(action,{studentUid:uid});if(ensureOwner()!==actor)return false;const previous=preferences.get(actor)||{},ids=previous.archivedIds||[];updatePreferences(actor,{archivedIds:restore?ids.filter(id=>id!==uid):[...new Set([...ids,uid])]});try{localStorage.setItem('team_bulls_roster_archived_'+actor,JSON.stringify(preferences.get(actor).archivedIds));}catch{}records.set(uid,{...row,...updated});if(VIEW_STUDENT?.uid===uid)Object.assign(VIEW_STUDENT,identity(updated));await renderRoster([...records.values()]);showToast(restore?'✓ Acesso restaurado':'✓ Perfil arquivado; histórico preservado');return true;}
      catch(error){if(ensureOwner()===actor)alert(error.message);return false;}finally{endAction(key);}
    });return true;
  }
  function ensureEditor(){
    if(document.getElementById('modal-student-administration'))return;
    const modal=document.createElement('div');modal.id='modal-student-administration';modal.className='modal-backdrop';modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','tb-student-admin-title');modal.innerHTML=`<div class="modal-sheet"><div class="modal-handle"></div><h2 class="modal-title" id="tb-student-admin-title"></h2><p id="tb-student-admin-help" class="plan-help"></p><form id="tb-student-admin-form"><label class="form-group" id="tb-student-admin-name-wrap"><span class="form-label">Nome cadastrado</span><input class="form-input" id="tb-student-admin-name" maxlength="100" autocomplete="name"/></label><div id="tb-student-admin-delete-fields"><label class="form-group"><span class="form-label">E-mail do aluno que será excluído</span><input class="form-input" type="email" id="tb-student-admin-email" autocomplete="off"/></label><label class="form-group"><span class="form-label">Digite EXCLUIR</span><input class="form-input" id="tb-student-admin-confirm" autocomplete="off"/></label><label class="form-group"><span class="form-label">Sua senha de treinador para confirmar</span><input class="form-input" type="password" id="tb-student-admin-password" autocomplete="current-password"/></label></div><p id="tb-student-admin-status" role="status" class="plan-help"></p><button class="btn-primary" id="tb-student-admin-save" type="submit">SALVAR</button><button class="btn-ghost" type="button" onclick="TeamBullsStudentAdministration.closeEditor()">CANCELAR</button></form></div>`;
    document.getElementById('app').appendChild(modal);modal.querySelector('form').addEventListener('submit',saveEditor);
  }
  function openEditor(action,uid){
    const actor=ensureOwner(),settings=preferences.get(actor),pending=settings?.pendingDeletions?.find(row=>row.uid===uid),row=getStudent(uid)||pending;
    if(!actor||!row||!['registeredName','delete'].includes(action)||action==='delete'&&!row.isArchived&&!pending)return false;
    ensureEditor();editor={actor,uid,action,row,generation};
    const deleting=action==='delete';document.getElementById('tb-student-admin-title').textContent=deleting?'Excluir aluno definitivamente':'Corrigir nome cadastrado';
    document.getElementById('tb-student-admin-help').textContent=deleting?`Excluir definitivamente ${identity(row).name}? Esta ação remove a conta e os dados do aluno na nuvem, incluindo treinos, dieta, registros, fotos e pagamentos. Não pode ser desfeita.`:'O nome cadastrado identifica o aluno para o treinador. O apelido de exibição do aluno será preservado.';
    document.getElementById('tb-student-admin-name-wrap').hidden=deleting;document.getElementById('tb-student-admin-name').value=identity(row).registeredName;
    document.getElementById('tb-student-admin-delete-fields').hidden=!deleting;
    for(const id of ['email','confirm','password'])document.getElementById('tb-student-admin-'+id).value='';
    document.getElementById('tb-student-admin-status').textContent='';document.getElementById('tb-student-admin-save').textContent=deleting?'EXCLUIR DEFINITIVAMENTE':'SALVAR NOME CADASTRADO';openModal('modal-student-administration');return true;
  }
  function closeEditor(){editor=null;const password=document.getElementById('tb-student-admin-password');if(password)password.value='';closeModal('modal-student-administration');}
  function editorCurrent(context){return !!context&&ensureOwner()===context.actor&&editor===context&&generation===context.generation;}
  async function saveEditor(event){
    event.preventDefault();const context=editor;if(!editorCurrent(context))return;
    const status=document.getElementById('tb-student-admin-status'),button=document.getElementById('tb-student-admin-save');
    if(!beginAction('student-admin-editor','modal-student-administration'))return;button.disabled=true;
    try{
      let result;
      if(context.action==='delete'){
        const email=document.getElementById('tb-student-admin-email').value.trim(),confirmation=document.getElementById('tb-student-admin-confirm').value,password=document.getElementById('tb-student-admin-password').value;
        if(email.toLowerCase()!==String(context.row.email||'').toLowerCase()||confirmation!=='EXCLUIR'||!password)throw new Error('Confira o e-mail, digite EXCLUIR e informe sua senha de treinador.');
        status.textContent='Confirmando sua identidade…';const user=auth.currentUser;
        await bounded(user.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(user.email,password)),15000,'A confirmação da identidade demorou. Tente novamente.');
        if(!editorCurrent(context))throw new Error('A tela mudou. Abra a confirmação novamente.');
        status.textContent='Excluindo os dados na nuvem. Aguarde a confirmação…';result=await request('delete',{studentUid:context.uid,email,confirmation});if(result.deleted!==true)throw new Error('O servidor ainda não confirmou a exclusão.');
      }else{const registeredName=clean(document.getElementById('tb-student-admin-name').value);if(!registeredName)throw new Error('Digite o nome cadastrado.');status.textContent='Salvando…';result=await request('registeredName',{studentUid:context.uid,registeredName});}
      if(!editorCurrent(context))return;
      if(context.action==='delete'){
        records.delete(context.uid);if(VIEW_STUDENT?.uid===context.uid){VIEW_STUDENT=null;showScreen('screen-trainer');}
        if(typeof SESSION_ARCHIVE_MEMORY!=='undefined')SESSION_ARCHIVE_MEMORY.delete(context.uid);
        const previous=preferences.get(context.actor)||{};updatePreferences(context.actor,{order:(previous.order||[]).filter(uid=>uid!==context.uid),archivedIds:(previous.archivedIds||[]).filter(uid=>uid!==context.uid),pendingDeletions:(previous.pendingDeletions||[]).filter(row=>row.uid!==context.uid)});
        await loadPreferences(true);closeEditor();await renderRoster([...records.values()]);showToast('✓ Perfil e dados na nuvem excluídos definitivamente');
      }else{
        records.set(context.uid,{...context.row,...result});if(VIEW_STUDENT?.uid===context.uid)Object.assign(VIEW_STUDENT,identity(result));closeEditor();await renderRoster([...records.values()]);if(VIEW_STUDENT?.uid===context.uid)await renderTrainerStudent(VIEW_STUDENT);showToast('✓ Nome cadastrado atualizado');
      }
    }catch(error){if(editorCurrent(context))status.textContent=error.message||'Não foi possível confirmar. Tente novamente.';}
    finally{if(editor===context){const password=document.getElementById('tb-student-admin-password');if(password)password.value='';button.disabled=false;}endAction('student-admin-editor','modal-student-administration');}
  }
  function enhanceProfile(){
    const actor=ensureOwner();if(!actor||!VIEW_STUDENT?.uid)return;const row=getStudent(VIEW_STUDENT.uid);if(!row)return;const disabled=preferences.get(actor)?.ready?'':'disabled';
    const host=document.getElementById('ts-archive-card');if(!host)return;let actions=document.getElementById('tb-student-profile-actions');if(!actions){actions=document.createElement('div');actions.id='tb-student-profile-actions';host.after(actions);}
    actions.innerHTML=`<button class="btn-add-set" onclick="TeamBullsStudentAdministration.openEditor('registeredName',${arg(row.uid)})">CORRIGIR NOME CADASTRADO</button><button class="btn-add-set" onclick="TeamBullsStudentAdministration.${row.isArchived?'restore':'archive'}(${arg(row.uid)})" ${disabled}>${row.isArchived?'RESTAURAR ACESSO':'REMOVER DA LISTA E BLOQUEAR'}</button>${row.isArchived?`<button class="btn-add-set" onclick="TeamBullsStudentAdministration.openEditor('delete',${arg(row.uid)})" ${disabled}>EXCLUIR DEFINITIVAMENTE</button>`:''}${disabled?'<span class="plan-help">Aguarde a organização dos alunos ou volte à lista e tente novamente.</span>':''}`;
  }
  if(typeof viewStudent==='function'){const base=viewStudent;viewStudent=function(uid,name,email,status){const row=getStudent(uid);return base.call(this,uid,row?identity(row).name:name,email,status);};}
  if(typeof renderTrainerStudent==='function'){const base=renderTrainerStudent;renderTrainerStudent=async function(){const result=await base.apply(this,arguments);enhanceProfile();return result;};}
  window.TeamBullsStudentAdministration=Object.freeze({version:VERSION,request,identity,getStudent,renderRoster,loadPreferences,refresh,showArchived,move,archive:uid=>confirmLifecycle(uid,'archive'),restore:uid=>confirmLifecycle(uid,'restore'),openEditor,closeEditor});
  window.addEventListener('team-bulls-runtime-state',()=>ensureOwner());
})();
