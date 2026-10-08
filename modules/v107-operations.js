/* Team Bulls v10.10.9 — central de operações otimizada, modelos, adesão e notificações. */
'use strict';
(function(){
  const TB=window.TeamBulls107;if(!TB)return;
  let activeTab='overview',templateCache=[],versionCache=[],inviteCache=[],noticeCache=[];
  const STUDENT_ALLOWED_TABS=new Set(['notices','sync']);
  const isTrainer=()=>CURRENT_USER?.role==='trainer';
  const studentCanOpen=tab=>STUDENT_ALLOWED_TABS.has(String(tab||''));
  const escHtml=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const ms=value=>{if(value?.toMillis)return value.toMillis();if(value?.toDate)return value.toDate().getTime();const n=new Date(value||0).getTime();return Number.isFinite(n)?n:0;};
  const isoDateLocal=date=>date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
  const daysAgo=days=>{const date=new Date();date.setHours(0,0,0,0);date.setDate(date.getDate()-days);return isoDateLocal(date);};
  const host=()=>document.getElementById('v107-operations-body');
  function requireTrainerStudent(){
    if(CURRENT_USER?.role!=='trainer')throw new Error('Esta função é exclusiva do treinador.');
    if(!VIEW_STUDENT?.uid)throw new Error('Abra o arquivo de um aluno antes de usar esta função.');
    return VIEW_STUDENT.uid;
  }
  function loading(text='Carregando...'){const el=host();if(el)el.innerHTML=`<div class="v107-loading"><div class="spinner"></div><span>${escHtml(text)}</span></div>`;}
  function empty(title,detail=''){return`<div class="empty-state v107-empty"><div class="empty-icon">▦</div><div class="empty-label">${escHtml(title)}</div>${detail?`<div class="empty-hint">${escHtml(detail)}</div>`:''}</div>`;}
  function tabButtons(){document.querySelectorAll('[data-v107-tab]').forEach(button=>button.classList.toggle('active',button.dataset.v107Tab===activeTab));}
  function setHeader(){
    const title=document.getElementById('v107-operations-title');if(!title)return;
    if(isTrainer())title.textContent=VIEW_STUDENT?.name?'OPERAÇÕES // '+VIEW_STUDENT.name.toUpperCase():'CENTRAL DE OPERAÇÕES';
    else title.textContent=activeTab==='sync'?'SINCRONIZAÇÃO':'AVISOS';
  }
  window.openV107Operations=function(tab='overview'){
    tab=String(tab||'overview');
    if(!isTrainer()&&!studentCanOpen(tab)){showToast('Esta área é exclusiva do treinador.',true);goHome();return false;}
    if(isTrainer()&&!VIEW_STUDENT?.uid&&['versions','templates','adherence','audit','notices'].includes(tab)){showToast('Abra primeiro o arquivo de um aluno.',true);goTrainer();return false;}
    activeTab=tab;setHeader();showScreen('screen-v107-operations');window.v107SelectTab(tab);return true;
  };
  window.TeamBullsOperationsCanOpen=tab=>isTrainer()||studentCanOpen(tab);
  window.closeV107Operations=function(){if(CURRENT_USER?.role==='trainer'){if(VIEW_STUDENT?.uid)goTrainerStudent();else goTrainer();}else goHome();};
  let renderSequence=0;
  window.v107SelectTab=async function(tab){
    const requestedTab=String(tab||'overview');
    if(!isTrainer()&&!studentCanOpen(requestedTab)){showToast('Esta área é exclusiva do treinador.',true);goHome();return false;}
    const token=++renderSequence;
    activeTab=requestedTab;setHeader();updateTabVisibility();tabButtons();loading();
    try{
      if(requestedTab==='overview')await renderOverview(token);
      else if(requestedTab==='versions')await renderVersions(token);
      else if(requestedTab==='templates')await renderTemplates(token);
      else if(requestedTab==='adherence')await renderAdherence(token);
      else if(requestedTab==='invites')await renderInvites(token);
      else if(requestedTab==='audit')await renderAudit(token);
      else if(requestedTab==='notices')await renderNotices(token);
      else if(requestedTab==='sync')await renderSync(token);
    }catch(error){
      if(token!==renderSequence||activeTab!==requestedTab)return;
      console.error('Central v10.10.9',error);const el=host();
      if(el)el.innerHTML=`<div class="v107-error"><strong>Não foi possível abrir esta área.</strong><span>${escHtml(error.message||error)}</span><button class="btn-add-set" onclick="v107SelectTab('${escHtml(requestedTab)}')">TENTAR NOVAMENTE</button></div>`;
    }
  };
  function renderIsCurrent(token,tab){return token==null||(token===renderSequence&&activeTab===tab);}

  async function completeSnapshot(){
    const studentId=requireTrainerStudent();
    let diet=null;try{diet=await loadDietDocument(studentId);}catch(error){diet=null;}
    return TB.snapshot({targetUid:studentId,workouts:VIEW_STUDENT.workouts||[],diet});
  }
  async function renderOverview(token){
    if(!renderIsCurrent(token,'overview'))return;
    const el=host();const trainer=CURRENT_USER?.role==='trainer';
    const draft=TB.getPlanDraft(),lastSync=TB.lastCloudSuccess(),online=navigator.onLine;
    const studentLabel=trainer?(VIEW_STUDENT?.name||'Nenhum aluno aberto'):(CURRENT_USER?.name||'Plano local');
    el.innerHTML=`
      <div class="v107-hero"><div><span>TEAM BULLS V10.10.9</span><h2>CONTINUIDADE E CONTROLE</h2><p>${escHtml(studentLabel)} · ${online?'conectado':'offline'}</p></div><div class="v107-status-dot ${online?'ok':'warn'}">${online?'ONLINE':'OFFLINE'}</div></div>
      <div class="v107-kpi-grid">
        <article><b>${TB.undoCount()}</b><span>ações para desfazer</span></article><article><b>${TB.redoCount()}</b><span>ações para refazer</span></article>
        <article><b>${draft?TB.formatDateTime(draft.updatedAt):'—'}</b><span>último rascunho</span></article><article><b>${lastSync?TB.formatDateTime(lastSync):'—'}</b><span>última gravação na nuvem</span></article>
      </div>
      <div class="v107-action-grid">
        <button onclick="v107Undo()"><strong>↶ DESFAZER</strong><span>Volta à estrutura anterior sem apagar sessões.</span></button>
        <button onclick="v107Redo()"><strong>↷ REFAZER</strong><span>Reaplica a alteração desfeita.</span></button>
        ${trainer&&VIEW_STUDENT?.uid?`<button onclick="v107CreateManualVersion()"><strong>◉ SALVAR VERSÃO</strong><span>Cria um ponto completo de restauração.</span></button>`:''}
        ${!trainer&&window.TeamBullsDeviceNotices?.available?.()?`<button onclick="TeamBullsDeviceNotices.enable()"><strong>● AVISOS DO APARELHO</strong><span>Mostra novos feedbacks na barra de notificações do celular.</span></button>`:''}
        <button onclick="v107SelectTab('sync')"><strong>⇄ SINCRONIZAÇÃO</strong><span>Verifica rede, cache, pendências e backup.</span></button>
      </div>
      <div class="v107-security-card"><strong>SEGURANÇA ATIVA</strong><span>Convites únicos, regras por coleção e auditoria do treinador.</span><small>App Check: ${escHtml(TB.state.appCheck||'chave não configurada')}</small></div>`;
  }
  window.v107Undo=()=>TB.undo().then(()=>v107SelectTab('overview')).catch(error=>alert(error.message));
  window.v107Redo=()=>TB.redo().then(()=>v107SelectTab('overview')).catch(error=>alert(error.message));
  window.v107CreateManualVersion=async function(){
    const label=window.prompt('Nome deste ponto de restauração:','Versão manual — '+new Date().toLocaleDateString('pt-BR'));if(!label)return;
    loading('Salvando versão completa...');try{const snapshot=await completeSnapshot();await TB.saveVersion(label,'manual',snapshot);showToast('✓ Versão completa salva');await renderVersions();}catch(error){alert(error.message);await renderOverview();}
  };

  async function loadVersions(){
    const local=TB.getLocalVersions().map(item=>({...item,origin:'local'}));
    if(CURRENT_USER?.role!=='trainer'||!VIEW_STUDENT?.uid||!await TB.ensureCloud())return local;
    let cloud=[];try{
      const snap=await cloudGet(db.collection('planVersions').where('trainerId','==',CURRENT_USER.uid).limit(180),'histórico de versões');
      cloud=snap.docs.filter(doc=>String(doc.data().studentId||'')===String(VIEW_STUDENT.uid)).map(doc=>{const data=doc.data();return{...data,id:doc.id,createdAt:data.createdAt?.toDate?data.createdAt.toDate().toISOString():String(data.createdAt||''),origin:'cloud'};});
    }catch(error){console.warn(error);}
    const seen=new Set();return[...cloud,...local].sort((a,b)=>ms(b.createdAt)-ms(a.createdAt)).filter(item=>{const key=(item.snapshot?TB.snapshotHash(item.snapshot):'')+'_'+item.label+'_'+Math.floor(ms(item.createdAt)/60000);if(seen.has(key))return false;seen.add(key);return true;}).slice(0,60);
  }
  async function renderVersions(token){
    requireTrainerStudent();versionCache=await loadVersions();if(!renderIsCurrent(token,'versions'))return;const el=host();
    const rows=versionCache.map((item,index)=>`<article class="v107-list-card"><div><strong>${escHtml(item.label||'Versão')}</strong><span>${TB.formatDateTime(item.createdAt)} · ${escHtml(item.source||'manual')} · ${item.origin==='cloud'?'nuvem':'aparelho'}</span><small>${item.snapshot?.workouts?.length||0} protocolos · hash ${escHtml(item.snapshot?TB.snapshotHash(item.snapshot):'—')}</small></div><button onclick="v107RestoreVersion(${index})">RESTAURAR</button></article>`).join('');
    el.innerHTML=`<div class="v107-section-head"><div><h2>HISTÓRICO DE VERSÕES</h2><p>Restaura treinos e dietas. Registros de sessões, relatórios e fotos não são apagados.</p></div><button class="btn-primary" onclick="v107CreateManualVersion()">+ SALVAR VERSÃO</button></div>${rows||empty('Nenhuma versão salva','Faça uma alteração ou salve um ponto manual.')}`;
  }
  window.v107RestoreVersion=function(index){
    const item=versionCache[index];if(!item?.snapshot)return;
    showConfirm('Restaurar versão',`Restaurar “${item.label}”? A estrutura atual será guardada para permitir desfazer.`,async()=>{loading('Restaurando versão e preservando históricos...');try{await TB.restoreSnapshot(item.snapshot,{label:item.label});await renderVersions();}catch(error){alert(error.message);await renderVersions();}});
  };

  function renewAllIds(value){
    const data=TB.clone(value),map=new Map();
    (function collect(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(collect);return;}if(typeof node.id==='string'&&node.id)map.set(node.id,uid());Object.values(node).forEach(collect);})(data);
    (function replace(node){if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(replace);return;}Object.keys(node).forEach(key=>{const current=node[key];if(typeof current==='string'&&map.has(current))node[key]=map.get(current);else replace(current);});})(data);
    return data;
  }
  TB.loadTemplates=async function(){
    if(CURRENT_USER?.role!=='trainer'||!await TB.ensureCloud())return[];
    const snap=await cloudGet(db.collection('planTemplates').where('trainerId','==',CURRENT_USER.uid).limit(120),'modelos');
    return snap.docs.map(doc=>{const data=doc.data();return{...data,id:doc.id,createdAt:data.createdAt?.toDate?data.createdAt.toDate().toISOString():String(data.createdAt||'')};}).sort((a,b)=>ms(b.createdAt)-ms(a.createdAt));
  };
  TB.createTemplate=async function(name){
    requireTrainerStudent();const snapshot=await completeSnapshot();
    const ref=await cloudWrite(db.collection('planTemplates').add({trainerId:CURRENT_USER.uid,name:TB.cleanText(name,120),description:'Modelo criado a partir de '+VIEW_STUDENT.name,schemaVersion:1,snapshot,createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()}),'salvar modelo');
    await TB.audit('Modelo criado',{entity:'modelo',summary:name,metadata:{templateId:ref.id}});return ref.id;
  };
  TB.applyTemplate=async function(template){
    const studentId=requireTrainerStudent(),before=await completeSnapshot();TB.pushUndo(before,'Antes de aplicar modelo');await TB.saveVersion('Antes do modelo '+template.name,'automatic',before);
    const templateSnap=template.snapshot||{},workouts=renewAllIds(templateSnap.workouts||[]),operations=[];
    workouts.forEach((workout,wIndex)=>{
      const workoutId=String(workout.id||uid()),data=TB.clone(workout);delete data.id;delete data.exercises;delete data.sessions;delete data.createdAt;delete data.userId;
      data.name=(data.name||'Protocolo')+' · modelo';data.isActive=false;data.order=(VIEW_STUDENT.workouts?.length||0)+wIndex;data.userId=studentId;data.createdAt=firebase.firestore.FieldValue.serverTimestamp();
      operations.push(batch=>batch.set(db.collection('workouts').doc(workoutId),data));
      (workout.exercises||[]).forEach((exercise,eIndex)=>{const exerciseId=String(exercise.id||uid()),item=TB.clone(exercise);delete item.id;delete item.sessions;delete item.createdAt;delete item.userId;delete item.workoutId;item.userId=studentId;item.workoutId=workoutId;item.order=eIndex;item.createdAt=firebase.firestore.FieldValue.serverTimestamp();operations.push(batch=>batch.set(db.collection('exercises').doc(exerciseId),item));});
    });
    await TB.commitOperations(operations,'aplicar modelo de treino');
    if(templateSnap.diet?.plans?.length){
      const current=await loadDietDocument(studentId),newDiet=renewAllIds(templateSnap.diet);newDiet.plans.forEach(plan=>{plan.isActive=false;plan.name=(plan.name||'Dieta')+' · modelo';plan.order=current.plans.length+plan.order;});
      await cloudWrite(db.collection('mealPlans').doc(studentId).set({plans:[...current.plans,...newDiet.plans],updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}),'aplicar modelo de dieta');
    }
    await TB.audit('Modelo aplicado',{entity:'modelo',summary:template.name,metadata:{templateId:template.id}});
    await TB.createNotification({studentId,title:'Novo plano disponível',body:'O treinador adicionou um novo modelo ao seu arquivo. Confira os protocolos e dietas.',type:'modelo',dedupeMinutes:1});
    await renderTrainerStudent({...VIEW_STUDENT});return true;
  };
  async function renderTemplates(token){
    requireTrainerStudent();templateCache=await TB.loadTemplates();if(!renderIsCurrent(token,'templates'))return;const el=host();
    const rows=templateCache.map((item,index)=>`<article class="v107-list-card"><div><strong>${escHtml(item.name||'Modelo')}</strong><span>${escHtml(item.description||'Treinos e dieta reutilizáveis')}</span><small>${item.snapshot?.workouts?.length||0} protocolos · ${item.snapshot?.diet?.plans?.length||0} dietas · ${TB.formatDateTime(item.createdAt)}</small></div><button onclick="v107ApplyTemplate(${index})">APLICAR</button></article>`).join('');
    el.innerHTML=`<div class="v107-section-head"><div><h2>MODELOS REUTILIZÁVEIS</h2><p>Copie protocolos e dietas para outros alunos sem alterar o modelo original.</p></div><button class="btn-primary" onclick="v107CreateTemplate()">+ CRIAR DO ALUNO</button></div>${rows||empty('Nenhum modelo cadastrado','Abra um aluno completo e salve a estrutura como modelo.')}`;
  }
  window.v107CreateTemplate=async function(){const name=window.prompt('Nome do modelo:','Modelo '+(VIEW_STUDENT?.name||''));if(!name)return;loading('Criando modelo completo...');try{await TB.createTemplate(name);showToast('✓ Modelo salvo');await renderTemplates();}catch(error){alert(error.message);await renderTemplates();}};
  window.v107ApplyTemplate=function(index){const item=templateCache[index];if(!item)return;showConfirm('Aplicar modelo',`Adicionar “${item.name}” ao arquivo de ${VIEW_STUDENT?.name}? O conteúdo atual será mantido.`,async()=>{loading('Aplicando modelo...');try{await TB.applyTemplate(item);showToast('✓ Modelo aplicado');await renderTemplates();}catch(error){alert(error.message);await renderTemplates();}});};

  async function renderInvites(token){
    if(CURRENT_USER?.role!=='trainer')throw new Error('Somente o treinador acessa convites.');
    inviteCache=await TB.loadInvites();if(!renderIsCurrent(token,'invites'))return;const el=host();
    const rows=inviteCache.map((item,index)=>{const status=item.usedBy?'USADO':item.valid?'ATIVO':'EXPIRADO/REVOGADO';return`<article class="v107-list-card"><div><strong>CONVITE ${status}</strong><span>${item.valid?'Válido até '+TB.formatDateTime(item.expiresAt):item.usedBy?'Utilizado por um aluno':'Não pode mais ser utilizado'}</span><small>ID seguro: ${escHtml(item.id.slice(0,16))}…</small></div>${item.valid?`<button class="danger" onclick="v107RevokeInvite(${index})">REVOGAR</button>`:''}</article>`;}).join('');
    el.innerHTML=`<div class="v107-section-head"><div><h2>CONVITES DE USO ÚNICO</h2><p>O código bruto aparece somente ao criar. No Firebase fica armazenado apenas o hash criptográfico.</p></div><button class="btn-primary" onclick="v107CreateInvite()">+ GERAR CONVITE</button></div><div id="v107-new-invite"></div>${rows||empty('Nenhum convite criado','Gere um convite para o próximo cadastro de aluno.')}`;
  }
  window.v107CreateInvite=async function(){const days=Number(window.prompt('Validade do convite em dias (1 a 30):','7'));if(!days)return;loading('Gerando convite seguro...');try{const invite=await TB.createInvite(days);await renderInvites();const box=document.getElementById('v107-new-invite');if(box)box.innerHTML=`<div class="v107-invite-result"><span>NOVO CONVITE — copie agora</span><strong>${escHtml(invite.code)}</strong><small>Válido até ${TB.formatDateTime(invite.expiresAt)}. Depois do primeiro cadastro, deixa de funcionar.</small><button class="btn-primary" onclick="TeamBulls107.copyText('${escHtml(invite.code)}')">COPIAR CONVITE</button></div>`;}catch(error){alert(error.message);await renderInvites();}};
  window.v107RevokeInvite=function(index){const item=inviteCache[index];if(!item)return;showConfirm('Revogar convite','Este código deixará de funcionar imediatamente.',async()=>{try{await TB.revokeInvite(item.id);showToast('Convite revogado.');await renderInvites();}catch(error){alert(error.message);}});};

  async function fetchAllForAdherence(studentId){
    const refs=[
      db.collection('sessions').where('userId','==',studentId),db.collection('mealCompletions').where('studentUid','==',studentId),
      db.collection('weeklyCheckins').where('studentId','==',studentId),db.collection('progressPhotos').where('userId','==',studentId)
    ];
    const [sessions,meals,checkins,photos,diet,schedule]=await Promise.all([
      cloudGet(refs[0],'sessões'),cloudGet(refs[1],'refeições concluídas'),cloudGet(refs[2],'relatórios semanais'),cloudGet(refs[3],'fotos'),loadDietDocument(studentId),cloudGet(db.collection('checkinSchedules').doc(studentId),'agenda de relatórios').catch(()=>null)
    ]);
    return{sessions:sessions.docs.map(doc=>({...doc.data(),id:doc.id})),meals:meals.docs.map(doc=>doc.data()).filter(item=>item.recordType!=='food_choice'),checkins:checkins.docs.map(doc=>doc.data()),photos:photos.docs.map(doc=>doc.data()),diet,schedule:schedule?.exists?schedule.data():null};
  }
  function calculateAdherence(data){
    const from=daysAgo(27),recentSessions=data.sessions.filter(item=>String(item.date||'')>=from),trainingDays=new Set(recentSessions.map(item=>item.date)).size;
    const recentMeals=data.meals.filter(item=>String(item.date||'')>=from),activePlan=(data.diet?.plans||[]).find(plan=>plan.isActive)||(data.diet?.plans||[])[0],mealCount=(activePlan?.variants?.length?activePlan.variants.reduce((sum,v)=>sum+(v.meals?.length||0),0):(activePlan?.meals?.length||0));
    const expectedMeals=Math.max(0,mealCount*28),mealAdherence=expectedMeals?Math.min(100,Math.round(recentMeals.length/expectedMeals*100)):0;
    const exerciseProgress={};recentSessions.forEach(session=>{const key=String(session.exerciseId||session.exerciseName||'exercicio'),max=Math.max(0,...(session.sets||[]).map(set=>Number(set.weight)||0));(exerciseProgress[key]=exerciseProgress[key]||[]).push({date:session.date,max});});
    let improved=0,tracked=0;Object.values(exerciseProgress).forEach(list=>{list.sort((a,b)=>String(a.date).localeCompare(String(b.date)));if(list.length>1){tracked++;if(list.at(-1).max>list[0].max)improved++;}});
    const checkins28=data.checkins.filter(item=>String(item.submittedDate||item.date||'')>=from).length,photos28=data.photos.filter(item=>String(item.date||'')>=from).length;
    return{from,recentSessions,trainingDays,recentMeals,mealCount,expectedMeals,mealAdherence,improved,tracked,checkins28,photos28};
  }
  async function renderAdherence(token){
    const studentId=requireTrainerStudent();const data=await fetchAllForAdherence(studentId);if(!renderIsCurrent(token,'adherence'))return;const m=calculateAdherence(data),el=host();
    const due=data.schedule?.nextDueDate||'',dueStatus=due?(due<=today()?'VENCIDO / DISPONÍVEL':'Próximo em '+fmt(due)):'não programado';
    const sessionRows=m.recentSessions.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,8).map(item=>`<tr><td>${fmt(item.date)}</td><td>${escHtml(item.exerciseName||item.exerciseId||'Exercício')}</td><td>${(item.sets||[]).length}</td></tr>`).join('');
    el.innerHTML=`<div class="v107-section-head"><div><h2>ADESÃO — ÚLTIMOS 28 DIAS</h2><p>Leitura operacional baseada nos registros enviados pelo aluno.</p></div><button class="btn-add-set" onclick="v107SelectTab('adherence')">ATUALIZAR</button></div>
      <div class="v107-kpi-grid adherence"><article><b>${m.recentSessions.length}</b><span>sessões registradas</span></article><article><b>${m.trainingDays}</b><span>dias com treino</span></article><article><b>${m.mealAdherence}%</b><span>refeições marcadas*</span></article><article><b>${m.improved}/${m.tracked}</b><span>exercícios com carga maior</span></article><article><b>${m.checkins28}</b><span>relatórios enviados</span></article><article><b>${m.photos28}</b><span>fotos registradas</span></article></div>
      <div class="v107-progress"><div><span>Adesão alimentar estimada</span><b>${m.recentMeals.length}/${m.expectedMeals||'—'}</b></div><i><em style="width:${m.mealAdherence}%"></em></i><small>*Estimativa baseada nas refeições da dieta ativa e nas marcações feitas no aplicativo.</small></div>
      <div class="v107-security-card"><strong>RELATÓRIO</strong><span>${escHtml(dueStatus)}</span><small>${data.schedule?.intervalDays?'Intervalo configurado: '+data.schedule.intervalDays+' dias':'Configure a agenda no arquivo do aluno.'}</small></div>
      <div class="section-header"><span class="section-label">Últimas sessões</span></div><div class="diet-table-scroll"><table class="diet-support-table"><thead><tr><th>Data</th><th>Exercício</th><th>Séries</th></tr></thead><tbody>${sessionRows||'<tr><td colspan="3">Nenhuma sessão no período.</td></tr>'}</tbody></table></div>`;
  }

  async function renderAudit(token){
    const studentId=requireTrainerStudent();const snap=await cloudGet(db.collection('auditLogs').where('trainerId','==',CURRENT_USER.uid).limit(300),'auditoria');
    if(!renderIsCurrent(token,'audit'))return;
    const items=snap.docs.filter(doc=>String(doc.data().studentId||'')===String(studentId)).map(doc=>({...doc.data(),id:doc.id})).sort((a,b)=>ms(b.createdAt)-ms(a.createdAt)).slice(0,100),el=host();
    const rows=items.map(item=>`<article class="v107-list-card audit"><div><strong>${escHtml(item.action||'Alteração')}</strong><span>${escHtml(item.entity||'plano')} · ${TB.formatDateTime(ms(item.createdAt))}</span><small>${escHtml(item.summary||'Registro automático de alteração.')}</small></div></article>`).join('');
    el.innerHTML=`<div class="v107-section-head"><div><h2>LOG DE AUDITORIA</h2><p>Registro imutável das alterações realizadas pelo treinador.</p></div></div>${rows||empty('Nenhum evento registrado','As próximas alterações aparecerão aqui.')}`;
  }

  TB.loadNotifications=async function(studentId){
    if(!studentId||!await TB.ensureCloud())return[];
    const snap=await cloudGet(db.collection('notifications').where('studentId','==',studentId).limit(120),'avisos');
    return snap.docs.map(doc=>{const data=doc.data();return{...data,id:doc.id};}).sort((a,b)=>ms(b.createdAt)-ms(a.createdAt)).slice(0,80);
  };
  async function renderNotices(token){
    const studentId=CURRENT_USER?.role==='trainer'?requireTrainerStudent():CURRENT_USER?.uid;if(!studentId)throw new Error('Usuário não identificado.');
    noticeCache=await TB.loadNotifications(studentId);
    if(CURRENT_USER?.role==='student'){
      try{const schedule=await cloudGet(db.collection('checkinSchedules').doc(studentId),'agenda de relatórios');const data=schedule.exists?schedule.data():null;if(data?.nextDueDate&&String(data.nextDueDate)<=today())noticeCache.unshift({id:'checkin-due',virtual:true,title:'Relatório semanal disponível',body:'Seu relatório e as seis fotos já podem ser enviados na área de Registros.',type:'checkin',createdAt:new Date(),readAt:null});}catch(error){}
    }
    if(!renderIsCurrent(token,'notices'))return;
    const el=host();
    const rows=noticeCache.map((item,index)=>`<article class="v107-list-card notice ${item.readAt?'read':'unread'}"><div><strong>${escHtml(item.title||'Aviso')}</strong><span>${escHtml(item.body||'')}</span><small>${TB.formatDateTime(ms(item.createdAt))}${item.readAt?' · lido':' · novo'}</small></div>${item.virtual?`<button onclick="openCalendar()">ABRIR</button>`:CURRENT_USER?.role==='student'&&!item.readAt?`<button onclick="v107MarkNoticeRead(${index})">MARCAR LIDO</button>`:''}</article>`).join('');
    el.innerHTML=`<div class="v107-section-head"><div><h2>AVISOS</h2><p>${CURRENT_USER?.role==='trainer'?'Envie mensagens e acompanhe atualizações automáticas.':'Atualizações do treinador e do seu plano.'}</p></div>${CURRENT_USER?.role==='trainer'?'<button class="btn-primary" onclick="v107SendNotice()">+ ENVIAR AVISO</button>':''}</div>${rows||empty('Nenhum aviso','As atualizações do plano aparecerão aqui.')}`;
  }
  window.v107SendNotice=async function(){const title=window.prompt('Título do aviso:','Mensagem do treinador');if(!title)return;const body=window.prompt('Mensagem para o aluno:','');if(!body)return;try{await TB.createNotification({studentId:requireTrainerStudent(),title,body,type:'mensagem'});await TB.audit('Aviso enviado',{entity:'notificação',summary:title});showToast('✓ Aviso enviado');await renderNotices();}catch(error){alert(error.message);}};
  window.v107EnableDeviceNotices=async function(){
    if(!window.TeamBullsDeviceNotices?.available?.()){showToast('Avisos do aparelho estão disponíveis somente em celulares compatíveis.',true);return;}
    await window.TeamBullsDeviceNotices.enable();
  };
  window.v107MarkNoticeRead=async function(index){const item=noticeCache[index];if(!item||CURRENT_USER?.role!=='student')return;try{await cloudWrite(db.collection('notifications').doc(item.id).update({readAt:firebase.firestore.FieldValue.serverTimestamp()}),'marcar aviso como lido');await renderNotices();}catch(error){alert(error.message);}};

  async function renderSync(token){
    const el=host(),online=navigator.onLine,last=TB.lastCloudSuccess(),localWorkouts=LOCAL_DB?.workouts||[],pendingSessions=localWorkouts.reduce((sum,w)=>sum+(w.exercises||[]).reduce((n,e)=>n+(e.sessions||[]).length,0),0),cloudBackup=CURRENT_USER?.uid?storageGet('teamms_cloud_'+CURRENT_USER.uid):null;
    let sw='não instalado';if('serviceWorker'in navigator){const registration=await navigator.serviceWorker.getRegistration().catch(()=>null);sw=registration?.active?'ativo':registration?.waiting?'aguardando atualização':'não ativo';}
    const estimate=navigator.storage?.estimate?await navigator.storage.estimate().catch(()=>null):null,used=estimate?.usage?Math.round(estimate.usage/1048576):null,quota=estimate?.quota?Math.round(estimate.quota/1048576):null;
    if(!renderIsCurrent(token,'sync'))return;
    el.innerHTML=`<div class="v107-section-head"><div><h2>CENTRAL DE SINCRONIZAÇÃO</h2><p>Mostra o estado real do aparelho e permite tentar novamente sem apagar dados.</p></div><button class="btn-primary" onclick="v107RunSync()">SINCRONIZAR AGORA</button></div>
      <div class="v107-sync-grid"><article><span>Rede</span><b class="${online?'ok':'warn'}">${online?'ONLINE':'OFFLINE'}</b></article><article><span>Modo atual</span><b>${escHtml(MODE)} / ${escHtml(ACCESS_MODE||'normal')}</b></article><article><span>Última gravação</span><b>${last?TB.formatDateTime(last):'não registrada'}</b></article><article><span>Service Worker</span><b>${escHtml(sw)}</b></article><article><span>Estrutura local</span><b>${localWorkouts.length} treinos · ${pendingSessions} sessões</b></article><article><span>Espelho da nuvem</span><b>${cloudBackup?'disponível':'não encontrado'}</b></article><article><span>Armazenamento</span><b>${used==null?'não informado':used+' MB de '+quota+' MB'}</b></article><article><span>App Check</span><b>${escHtml(TB.state.appCheck||'não configurado')}</b></article></div>
      <div class="v107-security-card"><strong>DADOS PRESERVADOS</strong><span>A sincronização não limpa treinos, sessões, fotos ou dietas.</span><small>As versões novas aparecem dentro do aplicativo e podem ser aplicadas sem desinstalar. A página de recuperação fica reservada para emergências.</small></div>`;
  }
  window.v107RunSync=async function(){loading('Verificando e sincronizando...');try{if(!navigator.onLine)throw new Error('O aparelho está offline. Os dados continuam preservados localmente.');if(!await TB.ensureCloud())throw new Error('Não foi possível abrir a conexão segura.');if(CURRENT_USER?.role==='student'&&MODE==='cloud'){await migrateLocalToCloud(CURRENT_USER.uid,{background:false});await loadCloudHome();}else if(CURRENT_USER?.role==='trainer'&&VIEW_STUDENT?.uid)await renderTrainerStudent({...VIEW_STUDENT});storageSet('team_bulls_v107_last_manual_sync',String(Date.now()));showToast('✓ Sincronização concluída');await renderSync();}catch(error){alert(error.message);await renderSync();}};

  function updateTabVisibility(){
    const trainer=isTrainer();
    document.querySelectorAll('[data-v107-trainer-only]').forEach(el=>el.style.display=trainer?'':'none');
    const studentOpen=!!VIEW_STUDENT?.uid;document.querySelectorAll('[data-v107-student-required]').forEach(el=>el.style.display=trainer&&studentOpen?'':'none');
    const screen=document.getElementById('screen-v107-operations');if(screen){screen.classList.toggle('v107-student-utility',!trainer);screen.setAttribute('aria-label',trainer?'Central de operações do treinador':activeTab==='sync'?'Sincronização do aluno':'Avisos do aluno');}
  }
  window.addEventListener('team-bulls-v107-context',()=>{setHeader();updateTabVisibility();});
  window.addEventListener('online',()=>{if(document.getElementById('screen-v107-operations')?.classList.contains('active'))v107SelectTab(activeTab);});
  window.addEventListener('offline',()=>{if(document.getElementById('screen-v107-operations')?.classList.contains('active'))v107SelectTab(activeTab);});
  const baseShowScreen=showScreen;
  showScreen=function(id,token=null){
    if(id==='screen-v107-operations'&&!isTrainer()&&!studentCanOpen(activeTab)){showToast('Esta área é exclusiva do treinador.',true);return baseShowScreen('screen-home',token);}
    const result=baseShowScreen(id,token);if(id==='screen-v107-operations'){setHeader();updateTabVisibility();tabButtons();}return result;
  };

  let lastBadgeLoad=0;
  TB.refreshNoticeBadge=async function(force=false){
    if(CURRENT_USER?.role!=='student'||MODE!=='cloud')return;
    if(!force&&Date.now()-lastBadgeLoad<60000)return;lastBadgeLoad=Date.now();
    try{
      const items=await TB.loadNotifications(CURRENT_USER.uid);let due=false;
      try{const schedule=await cloudGet(db.collection('checkinSchedules').doc(CURRENT_USER.uid),'agenda de relatórios');due=!!(schedule.exists&&schedule.data()?.nextDueDate&&String(schedule.data().nextDueDate)<=today());}catch(error){}
      const unread=items.filter(item=>!item.readAt),count=unread.length+(due?1:0);['v107-nav-notice-count','v107-home-notice-count'].forEach(id=>{const badge=document.getElementById(id);if(!badge)return;badge.textContent=count?String(Math.min(99,count)):'';badge.style.display=count?'inline-flex':'none';});
      if('Notification' in window&&Notification.permission==='granted'){
        const newest=due?{id:'checkin-'+today(),title:'Relatório semanal disponível',body:'Abra Registros para enviar o relatório e as seis fotos.'}:unread[0];
        if(newest){const key='team_bulls_v107_device_notice_'+newest.id;if(!storageGet(key)){new Notification(newest.title||'Team Bulls',{body:newest.body||'Você recebeu uma atualização.',icon:'icon-192-v9-8.png',tag:'team-bulls-'+newest.id});storageSet(key,'1');}}
      }
    }catch(error){}
  };
  const baseRenderHomeV107=renderHome;
  renderHome=function(){const result=baseRenderHomeV107.apply(this,arguments);runWhenIdle(()=>TB.refreshNoticeBadge(),1200);return result;};

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',updateTabVisibility,{once:true});else updateTabVisibility();
})();
