/* Team Bulls v10.10.43 — perfil visual do aluno, central de notificações e Home resiliente. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_STUDENT_HOME_PROFILE_1__)return;
  window.__TEAM_BULLS_STUDENT_HOME_PROFILE_1__=true;

  const VERSION='10.10.43-studenthome4';
  const PROFILE_PREFIX='studentProfiles';
  const NICK_MAX=24;
  const BADGE_REFRESH_TTL=120000;
  const BADGE_POLL_MS=300000;
  let notifications=[];
  let profileCache=new Map();
  let refreshTimer=0;
  let badgeRefreshAt=0;
  let badgeRefreshUid='';
  let badgeRefreshPromise=null;

  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const student=()=>CURRENT_USER?.role==='student'?CURRENT_USER:null;
  const uidOf=value=>String(value?.uid||value?.id||'');
  const studentUid=()=>uidOf(student());
  async function storageRoot(){
    try{
      if(typeof ensureStorageService==='function'){
        const service=await ensureStorageService();
        if(service)return service;
      }
      if(typeof firebase!=='undefined'&&typeof firebase.storage==='function')return firebase.storage();
    }catch(error){console.warn('[Team Bulls] armazenamento do perfil ainda não está disponível',error?.code||error?.message||error);}
    return null;
  }
  const profileRef=(root,uid)=>root?.ref(`${PROFILE_PREFIX}/${uid}/profile.json`);
  const avatarRef=(root,uid)=>root?.ref(`${PROFILE_PREFIX}/${uid}/avatar.jpg`);
  const cleanNickname=value=>String(value||'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,'').replace(/\s+/g,' ').trim().slice(0,NICK_MAX);
  const timestamp=value=>{try{if(value?.toMillis)return value.toMillis();if(value?.toDate)return value.toDate().getTime();return new Date(value||0).getTime()||0;}catch(error){return 0;}};
  const fmt=value=>{const ms=timestamp(value);return ms?new Date(ms).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'';};
  const todayIso=()=>new Date().toLocaleDateString('sv-SE');
  const activeScreen=()=>document.querySelector('.screen.active')?.id||'';

  function profileError(error,action='atualizar o perfil'){
    const code=String(error?.code||'').toLowerCase(),message=String(error?.message||'');
    if(code.includes('unauthorized'))return new Error(`Não foi possível ${action}: sua sessão não tem permissão para gravar este perfil. Atualize o app e entre novamente.`);
    if(code.includes('unauthenticated'))return new Error(`Não foi possível ${action}: sua sessão expirou. Entre novamente no app.`);
    if(code.includes('retry-limit-exceeded')||code.includes('unknown'))return new Error(`Não foi possível ${action}: falha temporária no armazenamento. Tente novamente.`);
    return new Error(message||`Não foi possível ${action}.`);
  }

  async function ensureProfileIdentity(uid){
    if(!uid)throw new Error('Identificação do aluno indisponível. Entre novamente no app.');
    try{
      const authUser=firebase?.auth?.().currentUser;
      if(authUser&&String(authUser.uid)!==String(uid))throw new Error('A sessão autenticada não corresponde ao perfil aberto. Entre novamente no app.');
      if(authUser?.getIdToken)await authUser.getIdToken();
    }catch(error){
      if(/não corresponde|indisponível/i.test(String(error?.message||'')))throw error;
    }
  }

  async function readProfile(uid,{fresh=false}={}){
    if(!uid)return{nickname:'',avatarUrl:''};
    if(!fresh&&profileCache.has(uid))return profileCache.get(uid);
    const result={nickname:'',avatarUrl:''};
    const root=await storageRoot();
    if(!root)return result;
    try{
      const ref=profileRef(root,uid),url=ref?await ref.getDownloadURL():'';
      if(url){const response=await fetch(url,{cache:'no-store'});if(response.ok){const data=await response.json();result.nickname=cleanNickname(data?.nickname||'');}}
    }catch(error){}
    try{const ref=avatarRef(root,uid);if(ref)result.avatarUrl=await ref.getDownloadURL();}catch(error){}
    profileCache.set(uid,result);
    return result;
  }

  async function writeNickname(uid,nickname){
    await ensureProfileIdentity(uid);
    const root=await storageRoot();
    if(!root)throw new Error('Não foi possível carregar o armazenamento do perfil agora. Tente novamente em instantes.');
    const ref=profileRef(root,uid);if(!ref)throw new Error('Perfil do aluno indisponível.');
    const body=JSON.stringify({nickname:cleanNickname(nickname)});
    try{await ref.put(new Blob([body],{type:'application/json'}),{contentType:'application/json',cacheControl:'no-store'});}
    catch(error){throw profileError(error,'alterar o nome de exibição');}
    profileCache.delete(uid);
    return readProfile(uid,{fresh:true});
  }

  async function decodeAvatarFile(file){
    if(typeof createImageBitmap==='function'){
      try{return{image:await createImageBitmap(file),close:true};}catch(error){}
    }
    return new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file),image=new Image();
      image.onload=()=>{URL.revokeObjectURL(url);resolve({image,close:false});};
      image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Não foi possível ler esta foto.'));};
      image.src=url;
    });
  }

  async function squareAvatar(file){
    if(!(file instanceof File)||!/^image\/(jpeg|png|webp)$/i.test(file.type||''))throw new Error('Escolha uma foto JPG, PNG ou WebP.');
    if(file.size>12*1024*1024)throw new Error('A foto deve ter no máximo 12 MB.');
    const decoded=await decodeAvatarFile(file),image=decoded.image;
    const width=Number(image.width||image.naturalWidth||0),height=Number(image.height||image.naturalHeight||0);
    if(!width||!height)throw new Error('A foto selecionada é inválida.');
    const side=Math.min(width,height),sx=Math.max(0,(width-side)/2),sy=Math.max(0,(height-side)/2),canvas=document.createElement('canvas');
    canvas.width=512;canvas.height=512;
    const ctx=canvas.getContext('2d',{alpha:false});
    ctx.drawImage(image,sx,sy,side,side,0,0,512,512);
    if(decoded.close)image.close?.();
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Não foi possível preparar a foto.')),'image/jpeg',0.9));
  }

  async function uploadAvatar(file){
    const user=student(),uid=uidOf(user);
    if(!user||!uid)throw new Error('Perfil do aluno indisponível. Entre novamente no app.');
    await ensureProfileIdentity(uid);
    const root=await storageRoot();
    if(!root)throw new Error('Não foi possível carregar o armazenamento da foto agora. Tente novamente em instantes.');
    const ref=avatarRef(root,uid);if(!ref)throw new Error('Armazenamento da foto indisponível.');
    const blob=await squareAvatar(file);
    try{await ref.put(blob,{contentType:'image/jpeg',cacheControl:'public,max-age=3600'});}
    catch(error){throw profileError(error,'atualizar a foto');}
    profileCache.delete(uid);
    await refreshStudentHeader(true);
  }

  async function removeAvatar(uid){
    try{const root=await storageRoot();if(!root)throw new Error('Armazenamento indisponível.');const ref=avatarRef(root,uid);if(!ref)throw new Error('Armazenamento indisponível.');await ref.delete();}
    catch(error){if(!/object-not-found/i.test(String(error?.code||error?.message||'')))throw error;}
    profileCache.delete(uid);
  }

  function ensureStyle(){
    if(document.getElementById('tb-student-home-profile-style'))return;
    const style=document.createElement('style');
    style.id='tb-student-home-profile-style';
    style.textContent=`
      body.student-desktop .student-desktop-nav{display:none!important}
      body.student-desktop #app{margin-left:0!important;width:100%!important;max-width:none!important}
      #screen-home.tb-home-v2 .quick-nav{display:none!important}
      #screen-home.tb-home-v2 .header{min-height:92px;align-items:center;padding:12px 16px;gap:10px;border-bottom:1px solid rgba(225,29,72,.28)}
      #screen-home.tb-home-v2 .settings-gear-btn,#screen-home.tb-home-v2 #user-chip{display:none!important}
      #screen-home.tb-home-v2 .home-hero::after{content:none!important;display:none!important}
      .tb-home-actions{margin-left:auto;display:flex;align-items:center;gap:12px}
      .tb-notice-button{position:relative;width:44px;height:44px;border:1px solid #342629;background:#100d0e;border-radius:50%;color:#eee;font-size:19px;display:grid;place-items:center}
      .tb-notice-badge{position:absolute;right:-3px;top:-4px;min-width:18px;height:18px;padding:0 4px;border-radius:12px;background:#e11d48;color:white;font:700 10px/18px 'DM Mono',monospace;text-align:center;border:2px solid #090909}
      .tb-notice-badge:empty{display:none}
      .tb-profile-head{position:relative;display:flex;flex-direction:column;align-items:center;min-width:72px}
      .tb-avatar-button{width:52px;height:52px;border-radius:50%;border:1px solid rgba(225,29,72,.7);background:#171313;overflow:hidden;padding:0;display:grid;place-items:center;color:#d8c9c2;font:800 17px 'Barlow Condensed',sans-serif}
      .tb-avatar-button img{width:100%;height:100%;object-fit:cover;display:block}
      .tb-profile-name{margin-top:4px;max-width:112px;text-align:center;font:500 10px/1.15 'DM Mono',monospace;color:#d8c9c2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tb-profile-menu{position:absolute;z-index:50;right:0;top:76px;width:190px;padding:8px;background:#111;border:1px solid #4b2028;box-shadow:0 16px 40px rgba(0,0,0,.55);border-radius:8px}
      .tb-profile-menu[hidden]{display:none}.tb-profile-menu button{width:100%;text-align:left;padding:10px;border:0;background:transparent;color:#eee;font:600 11px 'DM Mono',monospace}.tb-profile-menu button:hover{background:#211316}
      .tb-profile-menu .tb-profile-logout{margin-top:6px;border-top:1px solid #4b2028;color:#ff9aa8;background:rgba(225,29,72,.06)}
      #screen-home.tb-home-v2 #feedback-banner,#screen-home.tb-home-v2 #quest-banner,#screen-home.tb-home-v2 #weekly-checkin-home-banner,#screen-home.tb-home-v2 #protocol-review-home-banner{display:none!important}
      #screen-home.tb-home-v2 #home-stats{grid-template-columns:repeat(2,minmax(0,1fr))!important}.tb-home-v2 #home-stats .stat-cell{min-height:92px}.tb-home-v2 #home-stats .lbl{font-size:10px}
      .tb-hero-status{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}.tb-confidential-badge{position:static!important;display:inline-flex!important;align-items:center;height:24px;padding:0 9px;border:1px solid rgba(225,29,72,.55);color:#c65b6f;font:600 8px 'DM Mono',monospace;letter-spacing:1px;vertical-align:middle;margin-left:8px}
      #screen-student-notifications{padding-bottom:90px}.tb-notice-screen-head{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #282020;position:sticky;top:0;background:#0c0c0c;z-index:4}.tb-notice-screen-head h1{font:800 25px 'Barlow Condensed',sans-serif;margin:0}
      .tb-notice-list{padding:14px 16px;display:grid;gap:10px}.tb-notice-card{border:1px solid #302427;background:linear-gradient(135deg,#141112,#0d0d0d);padding:14px;border-radius:9px;display:grid;gap:8px}.tb-notice-card.unread{border-color:rgba(225,29,72,.62);box-shadow:inset 3px 0 #e11d48}.tb-notice-card strong{font:800 15px 'Barlow Condensed',sans-serif;letter-spacing:.3px}.tb-notice-card p{margin:0;color:#c5b9b2;font:400 13px/1.5 'Barlow',sans-serif}.tb-notice-meta{font:500 8px 'DM Mono',monospace;color:#786b66;text-transform:uppercase;letter-spacing:.7px}.tb-notice-actions{display:flex;gap:8px;flex-wrap:wrap}.tb-notice-actions button{padding:8px 10px;border:1px solid #4a252c;background:#201114;color:#f1dfdc;font:700 9px 'DM Mono',monospace}.tb-notice-empty{padding:40px 18px;text-align:center;color:#786b66;font:500 11px 'DM Mono',monospace}
      .tb-trainer-profile-card{margin:10px 18px 0;padding:12px;border:1px solid #302427;background:#111;display:flex;align-items:center;gap:12px}.tb-trainer-profile-card img,.tb-trainer-profile-avatar{width:54px;height:54px;border-radius:50%;object-fit:cover;border:1px solid #6b2734;background:#1b1315;display:grid;place-items:center;font:800 18px 'Barlow Condensed',sans-serif}.tb-trainer-profile-copy{min-width:0;flex:1}.tb-trainer-profile-copy strong,.tb-trainer-profile-copy span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tb-trainer-profile-copy strong{font:800 17px 'Barlow Condensed',sans-serif}.tb-trainer-profile-copy span{font:500 9px 'DM Mono',monospace;color:#aa9b93;margin-top:3px}.tb-trainer-profile-actions{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.tb-trainer-profile-actions button{border:1px solid #4a252c;background:#171112;color:#ddd;padding:7px 8px;font:600 8px 'DM Mono',monospace}
      @media(max-width:480px){#screen-home.tb-home-v2 .header-title{font-size:20px}.tb-home-actions{gap:8px}.tb-avatar-button{width:48px;height:48px}.tb-profile-name{max-width:90px}.tb-notice-button{width:40px;height:40px}}
    `;
    document.head.appendChild(style);
  }

  function ensureHomeHeader(){
    const home=document.getElementById('screen-home'),header=home?.querySelector('.header');
    if(!home||!header)return;
    home.classList.add('tb-home-v2');
    if(header.querySelector('.tb-home-actions'))return;
    const actions=document.createElement('div');
    actions.className='tb-home-actions';
    actions.innerHTML=`<button class="tb-notice-button" type="button" onclick="TeamBullsStudentHome.openNotifications()" aria-label="Abrir notificações" title="Notificações">🔔<span class="tb-notice-badge" id="tb-home-notice-count"></span></button><div class="tb-profile-head"><button class="tb-avatar-button" id="tb-avatar-button" type="button" onclick="TeamBullsStudentHome.toggleProfileMenu()" aria-label="Abrir perfil"><span id="tb-avatar-fallback">AL</span></button><div class="tb-profile-name" id="tb-profile-name">ALUNO</div><div class="tb-profile-menu" id="tb-profile-menu" hidden><button type="button" onclick="TeamBullsStudentHome.pickAvatar()">MUDAR FOTO</button><button type="button" onclick="TeamBullsStudentHome.changeNickname()">MUDAR NOME / APELIDO</button><button type="button" onclick="openSettings();TeamBullsStudentHome.closeProfileMenu()">CONFIGURAÇÕES</button><button type="button" class="tb-profile-logout" data-tb-profile-logout="1" onclick="TeamBullsStudentHome.logout()">SAIR</button></div><input id="tb-avatar-input" type="file" accept="image/jpeg,image/png,image/webp" hidden></div>`;
    header.appendChild(actions);
    actions.querySelector('#tb-avatar-input').addEventListener('change',async event=>{
      const file=event.target.files?.[0];event.target.value='';if(!file)return;
      try{showToast?.('Preparando foto de perfil...');await uploadAvatar(file);showToast?.('✓ Foto de perfil atualizada');}
      catch(error){alert(error?.message||'Não foi possível atualizar a foto.');}
    });
  }

  async function refreshStudentHeader(fresh=false){
    ensureHomeHeader();const user=student(),uid=uidOf(user);if(!user||!uid)return;
    const profile=await readProfile(uid,{fresh}),display=profile.nickname||user.name||'Aluno',button=document.getElementById('tb-avatar-button'),name=document.getElementById('tb-profile-name');
    if(name)name.textContent=display;
    if(button)button.innerHTML=profile.avatarUrl?`<img alt="Foto de ${esc(display)}" src="${esc(profile.avatarUrl)}">`:`<span>${esc((display.match(/\p{L}/u)?.[0]||'A').toUpperCase())}</span>`;
    refreshNoticeBadge().catch(()=>{});
  }

  function toggleProfileMenu(){const menu=document.getElementById('tb-profile-menu');if(menu)menu.hidden=!menu.hidden;}
  function closeProfileMenu(){const menu=document.getElementById('tb-profile-menu');if(menu)menu.hidden=true;}
  function pickAvatar(){closeProfileMenu();document.getElementById('tb-avatar-input')?.click();}
  function logout(){closeProfileMenu();if(typeof confirmLogout==='function'){confirmLogout();return;}if(typeof handleChipTap==='function'){handleChipTap();return;}alert('Não foi possível abrir a saída da conta. Atualize o aplicativo e tente novamente.');}
  async function changeNickname(){
    closeProfileMenu();const user=student(),uid=uidOf(user);if(!user||!uid)return alert('Perfil do aluno indisponível. Entre novamente no app.');
    const current=(await readProfile(uid)).nickname||'',raw=prompt(`Nome/apelido exibido no app (até ${NICK_MAX} caracteres):`,current);if(raw===null)return;
    const nick=cleanNickname(raw);
    try{await writeNickname(uid,nick);await refreshStudentHeader(true);showToast?.(nick?'✓ Nome de exibição atualizado':'✓ Nome de exibição restaurado');}
    catch(error){alert(error?.message||'Não foi possível alterar o nome de exibição.');}
  }

  function ensureNotificationScreen(){
    if(document.getElementById('screen-student-notifications'))return;
    const screen=document.createElement('div');screen.className='screen';screen.id='screen-student-notifications';
    screen.innerHTML=`<div class="tb-notice-screen-head"><button class="btn-icon" type="button" onclick="goHome()">←</button><div><div class="tb-notice-meta">CENTRAL DO ALUNO</div><h1>NOTIFICAÇÕES</h1></div></div><div class="tb-notice-list" id="tb-notice-list"><div class="tb-notice-empty">Carregando notificações...</div></div>`;
    document.getElementById('app')?.appendChild(screen);
  }

  async function loadNotifications({includeProtocol=true}={}){
    const user=student(),uid=uidOf(user);if(!user||!uid||MODE!=='cloud'||!db)return[];
    const items=[];
    try{
      const snap=await cloudGet(db.collection('notifications').where('studentId','==',uid).limit(120),'notificações do aluno');
      snap.docs.forEach(doc=>{const data=doc.data();items.push({id:doc.id,source:'notification',title:data.title||'Aviso',body:data.body||'',createdAt:data.createdAt,read:!!data.readAt,type:data.type||'aviso'});});
    }catch(error){console.warn('[Team Bulls] notificações',error);}
    try{
      const snap=await cloudGet(db.collection('feedback').where('studentId','==',uid).limit(80),'mensagens da central');
      snap.docs.forEach(doc=>{const data=doc.data();items.push({id:doc.id,source:'feedback',title:data.title||'Mensagem da central',body:data.message||'',createdAt:data.createdAt,read:!!data.read,type:data.feedbackType||'central'});});
    }catch(error){}
    try{
      const snap=await cloudGet(db.collection('questionnaires').where('studentId','==',uid).limit(80),'relatórios pendentes');
      snap.docs.forEach(doc=>{const data=doc.data();if(data.answered)return;items.push({id:doc.id,source:'questionnaire',title:'Relatório pendente',body:'Seu treinador solicitou um novo relatório.',createdAt:data.createdAt,read:false,type:'relatório',action:'questionnaire'});});
    }catch(error){}
    try{
      const doc=await cloudGet(db.collection('checkinSchedules').doc(uid),'relatório semanal');
      if(doc.exists){const data=doc.data(),extra=String(data.extraRequestId||''),due=String(data.nextDueDate||'');if(extra||(due&&due<=todayIso()))items.push({id:'weekly-checkin',source:'virtual',title:extra?'Relatório extra solicitado':'Relatório semanal pendente',body:extra?'Seu treinador solicitou um relatório extra com as fotos obrigatórias.':`Seu relatório semanal de ${due} está pendente.`,createdAt:data.updatedAt||data.extraRequestedAt||0,read:false,type:'relatório semanal',action:'weekly'});}
    }catch(error){}
    if(includeProtocol){
      try{
        const doc=await cloudGet(db.collection('protocolReviewSchedules').doc(uid),'cronograma de protocolos');
        if(doc.exists){const data=doc.data();items.push({id:'protocol-review',source:'virtual',title:'Cronograma dos protocolos',body:`Próxima atualização programada: ${data.nextReviewDate||data.startDate||'consulte o cronograma'}.`,createdAt:data.updatedAt||data.createdAt||0,read:true,type:'protocolo',action:'protocol'});}
      }catch(error){}
    }
    notifications=items.sort((a,b)=>timestamp(b.createdAt)-timestamp(a.createdAt));
    return notifications;
  }

  function renderNotifications(){
    const host=document.getElementById('tb-notice-list');if(!host)return;
    if(!notifications.length){host.innerHTML='<div class="tb-notice-empty">Nenhuma notificação no momento.</div>';return;}
    host.innerHTML=notifications.map((item,index)=>`<article class="tb-notice-card ${item.read?'':'unread'}"><div class="tb-notice-meta">${esc(item.type)}${fmt(item.createdAt)?' · '+esc(fmt(item.createdAt)):''}</div><strong>${esc(item.title)}</strong><p>${esc(item.body)}</p><div class="tb-notice-actions">${item.action==='questionnaire'?`<button onclick="TeamBullsStudentHome.openNotice(${index})">RESPONDER</button>`:item.action==='weekly'?`<button onclick="TeamBullsStudentHome.openNotice(${index})">ENVIAR RELATÓRIO</button>`:item.action==='protocol'?`<button onclick="TeamBullsStudentHome.openNotice(${index})">VER CRONOGRAMA</button>`:!item.read&&(item.source==='notification'||item.source==='feedback')?`<button onclick="TeamBullsStudentHome.markRead(${index})">MARCAR COMO LIDA</button>`:''}</div></article>`).join('');
  }

  function applyNoticeBadge(){
    const count=notifications.filter(item=>!item.read).length,badge=document.getElementById('tb-home-notice-count');
    if(badge)badge.textContent=count?String(Math.min(count,99)):'';
    return count;
  }

  async function refreshNoticeBadge({force=false}={}){
    const uid=studentUid();if(!uid)return 0;
    const now=Date.now();
    if(!force&&uid===badgeRefreshUid&&now-badgeRefreshAt<BADGE_REFRESH_TTL)return applyNoticeBadge();
    if(badgeRefreshPromise)return badgeRefreshPromise;
    badgeRefreshPromise=(async()=>{
      await loadNotifications({includeProtocol:false});
      badgeRefreshUid=uid;badgeRefreshAt=Date.now();
      return applyNoticeBadge();
    })().finally(()=>{badgeRefreshPromise=null;});
    return badgeRefreshPromise;
  }

  async function openNotifications(){
    ensureNotificationScreen();closeProfileMenu();showScreen('screen-student-notifications');
    await loadNotifications({includeProtocol:true});renderNotifications();
    badgeRefreshUid=studentUid();badgeRefreshAt=Date.now();applyNoticeBadge();
  }
  async function markRead(index){
    const item=notifications[index];if(!item||item.read)return;
    try{
      if(item.source==='notification')await cloudWrite(db.collection('notifications').doc(item.id).update({readAt:firebase.firestore.FieldValue.serverTimestamp()}),'marcar notificação como lida');
      else if(item.source==='feedback')await cloudWrite(db.collection('feedback').doc(item.id).update({read:true}),'marcar mensagem como lida');
      else return;
      item.read=true;renderNotifications();applyNoticeBadge();
    }catch(error){showToast?.('Não foi possível marcar como lida.',true);}
  }
  async function openNotice(index){
    const item=notifications[index];if(!item)return;
    if(item.action==='questionnaire'){goHome();setTimeout(()=>{try{openAnswerQuestionnaire(item.id);}catch(error){openMyQuestionnaires?.();}},60);return;}
    if(item.action==='weekly'){goHome();setTimeout(()=>openWeeklyCheckinModal?.(),60);return;}
    if(item.action==='protocol'){goHome();setTimeout(()=>openProtocolReviewInfo?.(),60);return;}
    await markRead(index);
  }

  function ensureStatsShell(stats){
    const cells=Array.from(stats.querySelectorAll(':scope > .stat-cell'));
    const labels=cells.map(cell=>String(cell.querySelector('.lbl')?.textContent||'').trim().toLowerCase());
    if(cells.length===2&&labels[0]==='protocolos de treino'&&labels[1]==='protocolos de dieta')return cells;
    stats.innerHTML='<div class="stat-cell"><div class="num">—</div><div class="lbl">Protocolos de treino</div></div><div class="stat-cell"><div class="num">—</div><div class="lbl">Protocolos de dieta</div></div>';
    return Array.from(stats.querySelectorAll(':scope > .stat-cell'));
  }

  function setStatCount(cell,value){
    const num=cell?.querySelector('.num'),count=Number(value);
    if(!num||!Number.isFinite(count)||count<0)return;
    const next=String(Math.trunc(count));
    if(num.textContent!==next)num.textContent=next;
  }

  async function refreshStats(){
    const user=student(),uid=uidOf(user),stats=document.getElementById('home-stats');if(!user||!uid||!stats)return;
    const cells=ensureStatsShell(stats),workouts=Array.isArray(CLOUD_WORKOUTS)?CLOUD_WORKOUTS:[];
    setStatCount(cells[0],workouts.length);
    if(Array.isArray(DIET_DOCUMENT?.plans))setStatCount(cells[1],DIET_DOCUMENT.plans.length);
    if(MODE==='cloud'&&db){
      try{const doc=await cloudGet(db.collection('mealPlans').doc(uid),'contar protocolos de dieta');if(doc.exists)setStatCount(cells[1],Array.isArray(doc.data()?.plans)?doc.data().plans.length:0);}catch(error){}
    }
  }

  function fixConfidential(){
    const eyebrow=document.getElementById('hero-eyebrow');if(!eyebrow)return;
    const status=eyebrow.querySelector('.tb-hero-status');
    if(status&&status.querySelector('.tb-confidential-badge'))return;
    const text=String(eyebrow.textContent||'').replace(/\s*confidencial\s*/ig,'').trim();
    eyebrow.innerHTML=`<span class="tb-hero-status">${esc(text)}<span class="tb-confidential-badge">CONFIDENCIAL</span></span>`;
  }

  async function trainerProfileCard(studentRecord){
    const uid=uidOf(studentRecord)||uidOf(VIEW_STUDENT);if(!uid)return;
    const screen=document.getElementById('screen-trainer-student'),header=screen?.querySelector('.header');if(!screen||!header)return;
    let card=screen.querySelector('.tb-trainer-profile-card');if(!card){card=document.createElement('div');card.className='tb-trainer-profile-card';header.insertAdjacentElement('afterend',card);}
    const profile=await readProfile(uid),registered=String(studentRecord?.name||VIEW_STUDENT?.name||'Aluno'),secondary=profile.nickname||registered;
    card.innerHTML=`${profile.avatarUrl?`<img src="${esc(profile.avatarUrl)}" alt="Foto do aluno">`:`<div class="tb-trainer-profile-avatar">${esc((registered[0]||'A').toUpperCase())}</div>`}<div class="tb-trainer-profile-copy"><strong>${esc(registered)}</strong><span>${esc(secondary)}</span></div><div class="tb-trainer-profile-actions">${profile.avatarUrl?`<button type="button" onclick="TeamBullsStudentHome.moderatePhoto('${esc(uid)}')">REMOVER FOTO</button>`:''}${profile.nickname?`<button type="button" onclick="TeamBullsStudentHome.moderateNickname('${esc(uid)}')">REMOVER APELIDO</button>`:''}</div>`;
  }
  async function moderatePhoto(uid){if(CURRENT_USER?.role!=='trainer'||!confirm('Remover a foto de perfil deste aluno?'))return;try{await removeAvatar(uid);await trainerProfileCard(VIEW_STUDENT);showToast?.('✓ Foto removida pelo treinador');}catch(error){alert('Não foi possível remover a foto.');}}
  async function moderateNickname(uid){if(CURRENT_USER?.role!=='trainer'||!confirm('Remover o apelido deste aluno e voltar ao nome de cadastro?'))return;try{await writeNickname(uid,'');await trainerProfileCard(VIEW_STUDENT);showToast?.('✓ Apelido removido pelo treinador');}catch(error){alert('Não foi possível remover o apelido.');}}

  function wrapUi(){
    if(typeof renderHome==='function'&&!renderHome.__tbStudentHomeProfile){
      const base=renderHome;
      renderHome=function(){const result=base.apply(this,arguments);queueMicrotask(()=>{ensureHomeHeader();refreshStudentHeader().catch(()=>{});refreshStats().catch(()=>{});fixConfidential();});return result;};
      renderHome.__tbStudentHomeProfile=true;
    }
    if(typeof renderTrainerStudent==='function'&&!renderTrainerStudent.__tbStudentHomeProfile){
      const base=renderTrainerStudent;
      renderTrainerStudent=async function(){const result=await base.apply(this,arguments);await trainerProfileCard(arguments[0]||VIEW_STUDENT).catch(()=>{});return result;};
      renderTrainerStudent.__tbStudentHomeProfile=true;
    }
  }

  function init(){
    ensureStyle();ensureNotificationScreen();wrapUi();
    if(student()){ensureHomeHeader();refreshStudentHeader().catch(()=>{});refreshStats().catch(()=>{});fixConfidential();}
    clearInterval(refreshTimer);refreshTimer=setInterval(()=>{if(student()&&document.visibilityState==='visible'&&activeScreen()==='screen-home')refreshNoticeBadge().catch(()=>{});},BADGE_POLL_MS);
  }

  document.addEventListener('click',event=>{if(!event.target.closest?.('.tb-profile-head'))closeProfileMenu();},true);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&student())refreshStudentHeader(true).catch(()=>{});});
  window.addEventListener('team-bulls-v107-ready',()=>setTimeout(init,0));
  window.TeamBullsStudentHome=Object.freeze({version:VERSION,init,openNotifications,toggleProfileMenu,closeProfileMenu,pickAvatar,changeNickname,logout,markRead,openNotice,moderatePhoto,moderateNickname,refresh:()=>refreshStudentHeader(true)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0),{once:true});else setTimeout(init,0);
})();
