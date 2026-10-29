/* Team Bulls v10.10.43 — perfil visual do aluno, central de notificações e Home resiliente. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_STUDENT_HOME_PROFILE_1__)return;
  window.__TEAM_BULLS_STUDENT_HOME_PROFILE_1__=true;

  const VERSION='10.10.45-studenthome7';
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
  let noticeActionBusy=false;
  let openCenterRefreshPromise=null;
  let pendingNameSyncPromise=null;
  let studentHeaderRenderToken=0;

  const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const student=()=>CURRENT_USER?.role==='student'?CURRENT_USER:null;
  const uidOf=value=>String(value?.uid||value?.id||'');
  const studentUid=()=>uidOf(student());
  const authUser=()=>{try{return typeof firebase!=='undefined'?firebase.auth?.()?.currentUser||null:null;}catch(error){return null;}};
  const cleanStudentName=value=>Array.from(String(value||'').normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,'').replace(/\s+/g,' ').trim()).slice(0,100).join('');
  function usableStudentName(value){const name=cleanStudentName(value);return name&&!/^(aluno|aluna|student|usuário|usuario)$/i.test(name)?name:'';}
  function studentDisplayName(user=student(),profileName=''){
    const auth=authUser();
    const pending=readPendingStudentName(uidOf(user));
    const saved=usableStudentName(pending)||usableStudentName(user?.name)||usableStudentName(profileName)||usableStudentName(user?.displayName)||usableStudentName(auth?.displayName);
    if(saved)return saved;
    const local=String(user?.email||auth?.email||'').split('@')[0].replace(/[._+-]+/g,' ').replace(/\s+/g,' ').trim();
    if(local&&/[\p{L}]{2}/u.test(local)&&local.length<=100)return local.replace(/(^|\s)\p{L}/gu,letter=>letter.toLocaleUpperCase('pt-BR'));
    return'Aluno';
  }
  const pendingNameKey=uid=>`team_bulls_pending_student_name_${uid}`;
  function readPendingStudentName(uid){try{const value=localStorage.getItem(pendingNameKey(uid));return value===null?null:cleanStudentName(value);}catch(error){return null;}}
  function writePendingStudentName(uid,name){try{localStorage.setItem(pendingNameKey(uid),name);return true;}catch(error){return false;}}
  function clearPendingStudentName(uid){try{localStorage.removeItem(pendingNameKey(uid));}catch(error){}}
  function isTemporaryConnectionError(error){const code=String(error?.code||'').toLowerCase(),message=String(error?.message||'').toLowerCase();return navigator.onLine===false||code.includes('unavailable')||code.includes('deadline-exceeded')||code.includes('network')||code.includes('timeout')||message.includes('offline')||message.includes('network')||message.includes('failed to fetch')||message.includes('connection');}
  function updateStudentNameLocally(uid,name){
    if(CURRENT_USER?.role!=='student'||uidOf(CURRENT_USER)!==uid)return;
    CURRENT_USER={...CURRENT_USER,name};
    if(typeof cacheUserProfile==='function')cacheUserProfile(CURRENT_USER);
    if(typeof updateOfflineCredentialProfile==='function')updateOfflineCredentialProfile(CURRENT_USER);
    const chip=document.getElementById('user-chip-name');if(chip)chip.textContent=name;
    const profileName=document.getElementById('tb-profile-name');if(profileName)profileName.textContent=name;
    const avatar=document.getElementById('tb-avatar-button'),image=avatar?.querySelector('img');
    if(image)image.alt=`Foto de ${name}`;
    else if(avatar)avatar.innerHTML=`<span>${esc((name.match(/\p{L}/u)?.[0]||'A').toUpperCase())}</span>`;
  }
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
      const current=authUser();
      if(current&&String(current.uid)!==String(uid))throw new Error('A sessão autenticada não corresponde ao perfil aberto. Entre novamente no app.');
      if(current?.getIdToken)await current.getIdToken();
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
    try{
      const ref=avatarRef(root,uid);
      if(ref){
        const url=await ref.getDownloadURL();
        try{
          const metadata=await ref.getMetadata(),updated=Date.parse(metadata?.updated||'');
          if(Number.isFinite(updated)&&updated>0)result.avatarUpdated=String(updated);
          if(url&&Number.isFinite(updated)&&updated>0){const versioned=new URL(url);versioned.searchParams.set('tbv',String(updated));result.avatarUrl=versioned.toString();}
          else result.avatarUrl=url;
        }catch(error){result.avatarUrl=url;}
      }
    }catch(error){}
    const current=profileCache.get(uid),currentVersion=Number(current?.avatarUpdated)||0,resultVersion=Number(result.avatarUpdated)||0;
    if(!current||resultVersion>=currentVersion)profileCache.set(uid,result);
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
    if(typeof decodeImageForCompression==='function'){
      try{const decoded=await decodeImageForCompression(file);if(decoded?.source&&decoded.width&&decoded.height)return{image:decoded.source,close:()=>decoded.close?.()};decoded?.close?.();}catch(error){if(/HEIC|HEIF/i.test(String(file?.type||file?.name||'')))throw new Error('Este celular não conseguiu abrir a foto HEIC/HEIF. Nas opções da câmera, escolha JPG/JPEG ou selecione uma foto em outro formato.');}
    }
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
    const normalizedType=window.TeamBullsPhotoQuality?.normalizeType?.(file)||String(file?.type||'').toLowerCase();
    if(!(file instanceof Blob)||!/^image\/(jpeg|png|webp|gif|avif|heic|heif)$/i.test(normalizedType))throw new Error('Escolha uma imagem JPG, PNG, WebP, AVIF ou HEIC compatível com este celular.');
    if(file.size>25*1024*1024)throw new Error('A foto deve ter no máximo 25 MB.');
    const decoded=await decodeAvatarFile(file),image=decoded.image;
    const width=Number(image.width||image.naturalWidth||0),height=Number(image.height||image.naturalHeight||0);
    if(!width||!height){decoded.close?.();throw new Error('A foto selecionada é inválida.');}
    const side=Math.min(width,height),sx=Math.max(0,(width-side)/2),sy=Math.max(0,(height-side)/2),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx){decoded.close?.();throw new Error('Seu celular não conseguiu preparar a foto. Feche outros aplicativos e tente novamente.');}
    let blob=null;
    try{
      for(const dimension of [512,448,384]){
        canvas.width=dimension;canvas.height=dimension;ctx.fillRect(0,0,dimension,dimension);ctx.drawImage(image,sx,sy,side,side,0,0,dimension,dimension);
        for(const quality of [.88,.78,.68,.58,.48]){
          blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
          if(blob&&blob.size<=650*1024)break;
        }
        if(blob&&blob.size<=650*1024)break;
      }
    }finally{decoded.close?.();}
    if(!blob||blob.size>650*1024)throw new Error('Não foi possível reduzir esta foto para o tamanho aceito. Escolha outra imagem e tente novamente.');
    return blob;
  }

  async function uploadAvatar(file){
    const user=student(),uid=uidOf(user);
    if(!user||!uid)throw new Error('Perfil do aluno indisponível. Entre novamente no app.');
    if(MODE!=='cloud'||!navigator.onLine)throw new Error('Conecte o celular à internet para atualizar a foto. O nome pode ser alterado e sincronizado quando a conexão voltar.');
    await ensureProfileIdentity(uid);
    const root=await storageRoot();
    if(!root)throw new Error('Não foi possível carregar o armazenamento da foto agora. Tente novamente em instantes.');
    const ref=avatarRef(root,uid);if(!ref)throw new Error('Armazenamento da foto indisponível.');
    const blob=await squareAvatar(file);
    try{await ref.put(blob,{contentType:'image/jpeg',cacheControl:'no-cache, max-age=0, must-revalidate'});}
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
      body.tb-profile-editor-open{overflow:hidden}.tb-profile-editor[hidden]{display:none}.tb-profile-editor{position:fixed;inset:0;z-index:10050;display:grid;place-items:center;padding:18px}.tb-profile-editor-backdrop{position:absolute;inset:0;border:0;background:rgba(0,0,0,.76)}.tb-profile-editor-card{position:relative;width:min(100%,420px);padding:20px;background:#111;border:1px solid #5c2731;box-shadow:0 20px 70px rgba(0,0,0,.65);border-radius:12px}.tb-profile-editor-card h2{margin:0 0 8px;font:800 23px 'Barlow Condensed',sans-serif;color:#f4e9e5}.tb-profile-editor-card p{margin:0 0 16px;color:#aa9b93;font:400 12px/1.5 'DM Mono',monospace}.tb-profile-editor-card label{display:block;margin:0 0 7px;color:#d8c9c2;font:600 10px 'DM Mono',monospace;text-transform:uppercase}.tb-profile-editor-card input{width:100%;min-height:46px;padding:10px 12px;border:1px solid #513039;border-radius:7px;background:#090909;color:#fff;font:500 16px 'Barlow',sans-serif}.tb-profile-editor-card input:focus{outline:2px solid #e11d48;outline-offset:1px}.tb-profile-editor-status{min-height:18px;margin-top:8px;color:#ff9aa8;font:500 10px/1.45 'DM Mono',monospace}.tb-profile-editor-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}.tb-profile-editor-actions button{min-height:40px;padding:0 14px;border:1px solid #4a252c;border-radius:6px;background:#201114;color:#eee;font:700 10px 'DM Mono',monospace}.tb-profile-editor-actions button[type=submit]{background:#a91f35;border-color:#d53a54}.tb-profile-editor-actions button:disabled{opacity:.55}
      #screen-home.tb-home-v2 #feedback-banner,#screen-home.tb-home-v2 #quest-banner,#screen-home.tb-home-v2 #weekly-checkin-home-banner,#screen-home.tb-home-v2 #protocol-review-home-banner{display:none!important}
      #screen-home.tb-home-v2 #home-stats{grid-template-columns:repeat(2,minmax(0,1fr))!important}.tb-home-v2 #home-stats .stat-cell{min-height:92px}.tb-home-v2 #home-stats .lbl{font-size:10px}
      .tb-hero-status{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}.tb-confidential-badge{position:static!important;display:inline-flex!important;align-items:center;height:24px;padding:0 9px;border:1px solid rgba(225,29,72,.55);color:#c65b6f;font:600 8px 'DM Mono',monospace;letter-spacing:1px;vertical-align:middle;margin-left:8px}
      #screen-student-notifications{padding-bottom:90px}.tb-notice-screen-head{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #282020;position:sticky;top:0;background:#0c0c0c;z-index:4}.tb-notice-screen-head h1{font:800 25px 'Barlow Condensed',sans-serif;margin:0}
      .tb-notice-list{padding:14px 16px;display:grid;gap:10px}.tb-notice-card{border:1px solid #302427;background:linear-gradient(135deg,#141112,#0d0d0d);padding:14px;border-radius:9px;display:grid;gap:8px}.tb-notice-card[data-notice-index]{cursor:pointer}.tb-notice-card[data-notice-index]:focus-visible{outline:2px solid #e11d48;outline-offset:3px}.tb-notice-card.unread{border-color:rgba(225,29,72,.62);box-shadow:inset 3px 0 #e11d48}.tb-notice-card strong{font:800 15px 'Barlow Condensed',sans-serif;letter-spacing:.3px}.tb-notice-card p{margin:0;color:#c5b9b2;font:400 13px/1.5 'Barlow',sans-serif}.tb-notice-meta{font:500 8px 'DM Mono',monospace;color:#786b66;text-transform:uppercase;letter-spacing:.7px}.tb-notice-actions{display:flex;gap:8px;flex-wrap:wrap}.tb-notice-actions button{padding:8px 10px;border:1px solid #4a252c;background:#201114;color:#f1dfdc;font:700 9px 'DM Mono',monospace}.tb-notice-empty{padding:40px 18px;text-align:center;color:#786b66;font:500 11px 'DM Mono',monospace}
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
    actions.innerHTML=`<button class="tb-notice-button" type="button" onclick="TeamBullsStudentHome.openNotifications()" aria-label="Abrir notificações" title="Notificações">🔔<span class="tb-notice-badge" id="tb-home-notice-count"></span></button><div class="tb-profile-head"><button class="tb-avatar-button" id="tb-avatar-button" type="button" onclick="TeamBullsStudentHome.toggleProfileMenu()" aria-label="Abrir perfil"><span id="tb-avatar-fallback">AL</span></button><div class="tb-profile-name" id="tb-profile-name">ALUNO</div><div class="tb-profile-menu" id="tb-profile-menu" hidden><button type="button" onclick="TeamBullsStudentHome.pickAvatar()">MUDAR FOTO</button><button type="button" onclick="TeamBullsStudentHome.changeNickname()">EDITAR MEU NOME</button><button type="button" onclick="openSettings();TeamBullsStudentHome.closeProfileMenu()">CONFIGURAÇÕES</button><button type="button" class="tb-profile-logout" data-tb-profile-logout="1" onclick="TeamBullsStudentHome.logout()">SAIR</button></div><input id="tb-avatar-input" type="file" accept="image/*,.heic,.heif" hidden></div>`;
    header.appendChild(actions);
    actions.querySelector('#tb-avatar-input').addEventListener('change',async event=>{
      const file=event.target.files?.[0];event.target.value='';if(!file)return;
      try{showToast?.('Preparando foto de perfil...');await uploadAvatar(file);showToast?.('✓ Foto de perfil atualizada');}
      catch(error){alert(error?.message||'Não foi possível atualizar a foto.');}
    });
  }

  function ensureNameEditor(){
    if(document.getElementById('tb-profile-editor'))return;
    const editor=document.createElement('div');editor.className='tb-profile-editor';editor.id='tb-profile-editor';editor.hidden=true;editor.setAttribute('role','dialog');editor.setAttribute('aria-modal','true');editor.setAttribute('aria-labelledby','tb-profile-editor-title');
    editor.innerHTML=`<div class="tb-profile-editor-backdrop" data-profile-editor-close="1"></div><form class="tb-profile-editor-card" id="tb-profile-editor-form"><h2 id="tb-profile-editor-title">SEU NOME NO APP</h2><p>Este nome será mostrado no seu perfil e para o treinador. Você pode alterá-lo novamente quando quiser.</p><label for="tb-profile-editor-name">Nome completo</label><input id="tb-profile-editor-name" name="name" type="text" maxlength="100" autocomplete="name" autocapitalize="words" required><div class="tb-profile-editor-status" id="tb-profile-editor-status" role="status" aria-live="polite"></div><div class="tb-profile-editor-actions"><button type="button" data-profile-editor-close="1">CANCELAR</button><button type="submit" id="tb-profile-editor-save">SALVAR NOME</button></div></form>`;
    document.body.appendChild(editor);
    editor.addEventListener('click',event=>{if(event.target.closest?.('[data-profile-editor-close]'))closeNameEditor();});
    editor.querySelector('#tb-profile-editor-form').addEventListener('submit',saveStudentNameFromEditor);
  }

  async function refreshStudentHeader(fresh=false){
    ensureHomeHeader();const user=student(),uid=uidOf(user),renderToken=++studentHeaderRenderToken;if(!user||!uid)return;
    const button=document.getElementById('tb-avatar-button'),name=document.getElementById('tb-profile-name'),chip=document.getElementById('user-chip-name');
    const paintName=display=>{const initial=esc((display.match(/\p{L}/u)?.[0]||'A').toUpperCase());if(name)name.textContent=display;if(button){button.setAttribute('aria-label',`Perfil de ${display}`);if(!button.querySelector('img'))button.innerHTML=`<span>${initial}</span>`;}if(chip)chip.textContent=display;};
    let display=studentDisplayName(user,profileCache.get(uid)?.nickname);paintName(display);
    const profile=await readProfile(uid,{fresh});if(studentUid()!==uid||renderToken!==studentHeaderRenderToken)return;
    display=studentDisplayName(user,profile.nickname);paintName(display);
    if(profile.avatarUrl&&button)button.innerHTML=`<img alt="Foto de ${esc(display)}" src="${esc(profile.avatarUrl)}">`;
    else if(button)button.innerHTML=`<span>${esc((display.match(/\p{L}/u)?.[0]||'A').toUpperCase())}</span>`;
    const image=button?.querySelector('img');if(image)image.addEventListener('error',()=>{profileCache.delete(uid);button.innerHTML=`<span>${esc((display.match(/\p{L}/u)?.[0]||'A').toUpperCase())}</span>`;},{once:true});
    refreshNoticeBadge().catch(()=>{});
  }

  function toggleProfileMenu(){const menu=document.getElementById('tb-profile-menu');if(menu)menu.hidden=!menu.hidden;}
  function closeProfileMenu(){const menu=document.getElementById('tb-profile-menu');if(menu)menu.hidden=true;}
  function pickAvatar(){closeProfileMenu();document.getElementById('tb-avatar-input')?.click();}
  function logout(){closeProfileMenu();if(typeof confirmLogout==='function'){confirmLogout();return;}if(typeof handleChipTap==='function'){handleChipTap();return;}alert('Não foi possível abrir a saída da conta. Atualize o aplicativo e tente novamente.');}
  function openNameEditor(){
    closeProfileMenu();ensureNameEditor();const editor=document.getElementById('tb-profile-editor'),input=document.getElementById('tb-profile-editor-name'),status=document.getElementById('tb-profile-editor-status');
    if(!editor||!input)return;input.value=usableStudentName(readPendingStudentName(studentUid()))||usableStudentName(student()?.name)||usableStudentName(profileCache.get(studentUid())?.nickname)||usableStudentName(authUser()?.displayName)||'';if(status)status.textContent='';editor.hidden=false;document.body.classList.add('tb-profile-editor-open');requestAnimationFrame(()=>{input.focus();input.select();});
  }
  function closeNameEditor(){const editor=document.getElementById('tb-profile-editor');if(!editor)return;editor.hidden=true;document.body.classList.remove('tb-profile-editor-open');document.getElementById('tb-avatar-button')?.focus();}
  async function saveStudentName(uid,name){
    if(!uid)throw new Error('Identificação do aluno indisponível. Entre novamente no app.');
    if(MODE!=='cloud'||ACCESS_MODE!=='cloud-active'||!db){if(!writePendingStudentName(uid,name))throw new Error('Não foi possível guardar a alteração neste aparelho. Verifique o espaço disponível.');updateStudentNameLocally(uid,name);return{pending:true,requiresLogin:true};}
    if(!navigator.onLine){if(!writePendingStudentName(uid,name))throw new Error('Não foi possível guardar a alteração neste aparelho. Verifique o espaço disponível.');updateStudentNameLocally(uid,name);return{pending:true};}
    await ensureProfileIdentity(uid);
    try{
      const task=db.collection('users').doc(uid).update({name});
      if(typeof cloudWrite==='function')await cloudWrite(task,'salvar nome do aluno');else await task;
      clearPendingStudentName(uid);updateStudentNameLocally(uid,name);profileCache.delete(uid);await refreshStudentHeader(true);return{pending:false};
    }catch(error){
      if(isTemporaryConnectionError(error)&&writePendingStudentName(uid,name)){updateStudentNameLocally(uid,name);return{pending:true};}
      if(typeof cloudWriteError==='function')throw new Error(cloudWriteError(error,'salvar o nome do aluno'));
      throw profileError(error,'salvar o nome do aluno');
    }
  }
  async function saveStudentNameFromEditor(event){
    event.preventDefault();const user=student(),uid=uidOf(user),input=document.getElementById('tb-profile-editor-name'),status=document.getElementById('tb-profile-editor-status'),button=document.getElementById('tb-profile-editor-save');if(!user||!uid){if(status)status.textContent='Perfil indisponível. Entre novamente no app.';return;}
    const name=cleanStudentName(input?.value);if(!name){if(status)status.textContent='Digite seu nome para continuar.';input?.focus();return;}
    if(button)button.disabled=true;if(status)status.textContent='Salvando seu nome...';
    try{const result=await saveStudentName(uid,name);closeNameEditor();showToast?.(result.requiresLogin?'Nome salvo neste aparelho. Conecte-se e entre novamente para sincronizar com sua conta.':result.pending?'Nome salvo neste aparelho. Será sincronizado quando a conexão voltar.':'✓ Nome atualizado no seu perfil');}
    catch(error){if(status)status.textContent=error?.message||'Não foi possível salvar seu nome. Tente novamente.';}
    finally{if(button)button.disabled=false;}
  }
  function changeNickname(){openNameEditor();}
  function syncPendingStudentName(){
    if(pendingNameSyncPromise)return pendingNameSyncPromise;
    const uid=studentUid(),name=uid?readPendingStudentName(uid):null;if(!uid||name===null||!name||!db||MODE!=='cloud'||ACCESS_MODE!=='cloud-active'||!navigator.onLine)return Promise.resolve(false);
    pendingNameSyncPromise=(async()=>{
      try{await ensureProfileIdentity(uid);const task=db.collection('users').doc(uid).update({name});if(typeof cloudWrite==='function')await cloudWrite(task,'sincronizar nome do aluno');else await task;clearPendingStudentName(uid);updateStudentNameLocally(uid,name);profileCache.delete(uid);await refreshStudentHeader(true);showToast?.('✓ Nome do perfil sincronizado');return true;}
      catch(error){console.warn('[Team Bulls] nome do perfil ainda não sincronizado',error?.code||error?.message||error);return false;}
    })().finally(()=>{pendingNameSyncPromise=null;});
    return pendingNameSyncPromise;
  }

  function ensureNotificationScreen(){
    if(document.getElementById('screen-student-notifications'))return;
    const screen=document.createElement('div');screen.className='screen';screen.id='screen-student-notifications';
    screen.innerHTML=`<div class="tb-notice-screen-head"><button class="btn-icon" type="button" onclick="goHome()">←</button><div><div class="tb-notice-meta">CENTRAL DO ALUNO</div><h1>NOTIFICAÇÕES</h1></div></div><div id="tb-device-notice-panel" class="tb-device-notice-panel" hidden><div class="tb-device-notice-actions"><button class="btn-primary" type="button" id="tb-device-notice-enable" onclick="TeamBullsDeviceNotices.enable()">ATIVAR AVISOS NO CELULAR</button><button class="btn-ghost" type="button" id="tb-device-notice-disable" onclick="TeamBullsDeviceNotices.disable()" hidden>DESATIVAR AVISOS NESTE CELULAR</button></div><p id="tb-device-notice-status" role="status" aria-live="polite"></p></div><div class="tb-notice-list" id="tb-notice-list"><div class="tb-notice-empty">Carregando notificações...</div></div>`;
    document.getElementById('app')?.appendChild(screen);
    window.TeamBullsDeviceNotices?.render?.();
  }

  async function loadNotifications({includeProtocol=true}={}){
    const user=student(),uid=uidOf(user);if(!user||!uid||MODE!=='cloud'||!db)return[];
    const requests=[
      ['avisos',()=>cloudGet(db.collection('notifications').where('studentId','==',uid).limit(120),'notificações do aluno')],
      ['mensagens',()=>cloudGet(db.collection('feedback').where('studentId','==',uid).limit(80),'mensagens da central')],
      ['relatórios solicitados',()=>cloudGet(db.collection('questionnaires').where('studentId','==',uid),'relatórios pendentes')],
      ['agenda semanal',()=>cloudGet(db.collection('checkinSchedules').doc(uid),'relatório semanal')],
      ['histórico semanal',()=>cloudGet(db.collection('weeklyCheckins').where('studentId','==',uid),'histórico semanal')],
      ['ciclo mensal',()=>cloudGet(db.collection('protocolReviewSchedules').doc(uid),'cronograma de protocolos')],
      ['carregamento dos relatórios',()=>ensureReportCycleRuntime()]
    ];
    const results=await Promise.allSettled(requests.map(([,read])=>read()));
    if(studentUid()!==uid)return[];
    const items=[],value=index=>results[index].status==='fulfilled'?results[index].value:null;
    results.forEach((result,index)=>{if(result.status==='rejected')items.push({id:'load-error-'+index,source:'error',title:'Não foi possível verificar '+requests[index][0],body:'Toque em atualizar para consultar suas pendências novamente.',read:true,type:'conexão',action:'retry'});});
    value(0)?.docs.forEach(doc=>{const data=doc.data();items.push({id:doc.id,source:'notification',title:data.title||'Aviso',body:data.body||'',createdAt:data.createdAt,read:!!data.readAt,type:data.type||'aviso'});});
    value(1)?.docs.forEach(doc=>{const data=doc.data();items.push({id:doc.id,source:'feedback',title:data.title||'Mensagem da central',body:data.message||'',createdAt:data.createdAt,read:!!data.read,type:data.feedbackType||'central'});});
    const monthly=window.TeamBullsMonthlyReports,protocol=value(5),schedule=protocol?.exists?{...protocol.data(),studentId:uid}:null;
    if(protocol)monthly?.remember(uid,schedule);
    value(2)?.docs.forEach(doc=>{
      const data={...doc.data(),id:doc.id};if(data.answered||data.cancelledAt)return;
      const isMonthly=data.reportType==='monthly';
      if(isMonthly&&(!protocol||monthly?.status(data,schedule)!=='pending'))return;
      items.push({id:doc.id,source:'questionnaire',title:isMonthly?'Relatório mensal pendente':data.reportType==='standard-extra'?'Relatório extra pendente':'Relatório pendente',body:isMonthly?('Relatório completo de '+fmt(data.dueDate)+', com todas as perguntas e 6 fotos.'):'Seu treinador solicitou um novo relatório.',createdAt:data.createdAt,read:false,type:isMonthly?'relatório mensal':'relatório',action:'questionnaire'});
    });
    const weekly=value(3),history=value(4);
    if(weekly?.exists&&history&&results[6].status==='fulfilled'){
      const data=weekly.data(),request=computeCheckinRequest(data,history.docs.map(doc=>({...doc.data(),id:doc.id})));
      if(request?.pending)items.push({id:'weekly-checkin',source:'virtual',title:request.kind==='manual'?'Relatório extra solicitado':'Relatório semanal pendente',body:request.kind==='manual'?'Seu treinador solicitou um relatório extra com as fotos obrigatórias.':('Seu relatório semanal de '+fmt(request.dueDate)+' está pendente.'),createdAt:data.updatedAt||0,read:false,type:'relatório semanal',action:'weekly'});
    }
    if(includeProtocol&&schedule){
      const current=monthly?.cycle(schedule),forms=value(2);
      if(current&&forms&&!forms.docs.some(doc=>doc.id===current.id))items.push({id:'monthly-not-prepared',source:'virtual',title:'Programação mensal incompleta',body:'Seu relatório mensal ainda não foi preparado. Avise seu treinador.',read:true,type:'relatório mensal'});
      items.push({id:'protocol-review',source:'virtual',title:'Revisão de treino e dieta pelo treinador',body:'Acompanhe o cronograma. Enviar seu relatório não conclui a revisão dos protocolos.',createdAt:schedule.updatedAt||0,read:true,type:'protocolo',action:'protocol'});
    }
    notifications=items.sort((a,b)=>timestamp(b.createdAt)-timestamp(a.createdAt));return notifications;
  }

  function renderNotifications(){
    const host=document.getElementById('tb-notice-list');if(!host)return;
    if(!notifications.length){host.innerHTML='<div class="tb-notice-empty">Nenhuma notificação no momento.</div>';return;}
    host.innerHTML=notifications.map((item,index)=>{
      const actionable=['questionnaire','weekly','retry','protocol'].includes(item.action);
      return`<article class="tb-notice-card ${item.read?'':'unread'}"${actionable?` data-notice-index="${index}" role="button" tabindex="0"`:''}><div class="tb-notice-meta">${esc(item.type)}${fmt(item.createdAt)?' · '+esc(fmt(item.createdAt)):''}</div><strong>${esc(item.title)}</strong><p>${esc(item.body)}</p><div class="tb-notice-actions">${item.action==='questionnaire'?`<button onclick="TeamBullsStudentHome.openNotice(${index})">RESPONDER</button>`:item.action==='weekly'?`<button onclick="TeamBullsStudentHome.openNotice(${index})">ENVIAR RELATÓRIO</button>`:item.action==='retry'?`<button onclick="TeamBullsStudentHome.openNotice(${index})">ATUALIZAR</button>`:item.action==='protocol'?`<button onclick="TeamBullsStudentHome.openNotice(${index})">VER CRONOGRAMA</button>`:!item.read&&(item.source==='notification'||item.source==='feedback')?`<button onclick="TeamBullsStudentHome.markRead(${index})">MARCAR COMO LIDA</button>`:''}</div></article>`;
    }).join('');
    host.onclick=event=>{if(event.target.closest?.('button'))return;const card=event.target.closest?.('.tb-notice-card[data-notice-index]');if(card&&host.contains(card))openNotice(Number(card.dataset.noticeIndex));};
    host.onkeydown=event=>{if(event.key!=='Enter'&&event.key!==' ')return;if(event.target.closest?.('button'))return;const card=event.target.closest?.('.tb-notice-card[data-notice-index]');if(!card||!host.contains(card))return;event.preventDefault();openNotice(Number(card.dataset.noticeIndex));};
    
  }

  function renderNotificationsPreservingScroll(){
    const scroller=document.getElementById('app'),scrollTop=scroller?.scrollTop||0;
    renderNotifications();
    if(scroller)scroller.scrollTop=scrollTop;
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
    window.TeamBullsDeviceNotices?.render?.();
    await loadNotifications({includeProtocol:true});renderNotifications();
    badgeRefreshUid=studentUid();badgeRefreshAt=Date.now();applyNoticeBadge();
  }
  async function refreshOpenNotifications(){
    if(activeScreen()!=='screen-student-notifications')return false;
    if(openCenterRefreshPromise)return openCenterRefreshPromise;
    const uid=studentUid(),previousNotifications=notifications;
    openCenterRefreshPromise=(async()=>{
      await loadNotifications({includeProtocol:true});
      if(studentUid()!==uid||activeScreen()!=='screen-student-notifications')return false;
      if(notifications.some(item=>item.source==='error')&&previousNotifications.length)notifications=previousNotifications;
      renderNotificationsPreservingScroll();
      badgeRefreshUid=uid;badgeRefreshAt=Date.now();applyNoticeBadge();
      return true;
    })().finally(()=>{openCenterRefreshPromise=null;});
    return openCenterRefreshPromise;
  }

  async function markRead(index){
    const item=notifications[index];if(!item||item.read)return;
    try{
      if(item.source==='notification')await cloudWrite(db.collection('notifications').doc(item.id).update({readAt:firebase.firestore.FieldValue.serverTimestamp()}),'marcar notificação como lida');
      else if(item.source==='feedback')await cloudWrite(db.collection('feedback').doc(item.id).update({read:true}),'marcar mensagem como lida');
      else return;
      item.read=true;renderNotificationsPreservingScroll();applyNoticeBadge();
    }catch(error){showToast?.('Não foi possível marcar como lida.',true);}
  }
  function noticeActionButton(index){return document.querySelector(`#tb-notice-list .tb-notice-card:nth-child(${Number(index)+1}) .tb-notice-actions button`);}
  async function openNotice(index){
    const item=notifications[index];if(!item||noticeActionBusy)return;
    const button=noticeActionButton(index),originalLabel=button?.textContent||'';
    const busy=label=>{if(!button)return;button.disabled=true;button.textContent=label;button.setAttribute('aria-busy','true');};
    noticeActionBusy=true;
    try{
      if(item.action==='retry'){busy('ATUALIZANDO...');await loadNotifications({includeProtocol:true});renderNotifications();applyNoticeBadge();return;}
      if(item.action==='questionnaire'){
        busy('CARREGANDO RELATÓRIO...');
        if(typeof openAnswerQuestionnaire!=='function')throw new Error('Relatório ainda não carregado.');
        await openAnswerQuestionnaire(item.id);
        if(!document.getElementById('modal-answer-quest')?.classList.contains('open')){
          await loadNotifications({includeProtocol:true});renderNotifications();applyNoticeBadge();
          showToast?.('Este relatório não está mais disponível ou já foi atualizado.',true);
        }
        return;
      }
      if(item.action==='weekly'){
        busy('CARREGANDO RELATÓRIO...');
        const loadSuite=window.TeamBullsIntelligenceBootstrap?.load||window.TeamBullsIntelligenceSuiteLoader?.load;
        if(typeof loadSuite==='function')await loadSuite();
        if(!window.TeamBullsWeeklyReportIntegrity?.canOpenForm||typeof openWeeklyCheckinModal!=='function')throw new Error('Relatório semanal ainda não carregado.');
        await openWeeklyCheckinModal();
        if(!document.getElementById('modal-weekly-checkin')?.classList.contains('open')){
          await loadNotifications({includeProtocol:true});renderNotifications();applyNoticeBadge();
          showToast?.('O relatório extra não abriu. Confira a conexão e toque novamente para tentar.',true);
        }
        return;
      }
      if(item.action==='protocol'){
        busy('ABRINDO CRONOGRAMA...');
        if(typeof openProtocolReviewInfo!=='function')throw new Error('Cronograma ainda não carregado.');
        await openProtocolReviewInfo();
        return;
      }
      await markRead(index);
    }catch(error){
      console.warn('[Team Bulls] ação da notificação não abriu',item.action||item.type,error?.code||error?.message||error);
      showToast?.('Não foi possível abrir agora. Aguarde alguns segundos e tente novamente.',true);
    }finally{
      noticeActionBusy=false;
      if(button?.isConnected){button.disabled=false;button.removeAttribute('aria-busy');button.textContent=originalLabel;}
    }
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
    num.removeAttribute?.('title');
    num.removeAttribute?.('aria-label');
  }
  function setStatUnavailable(cell){
    const num=cell?.querySelector('.num');if(!num)return;
    num.textContent='—';
    num.title='Sem conexão: aguardando validar os dados salvos.';
    num.setAttribute?.('aria-label','Quantidade indisponível até validar os dados.');
  }
  async function refreshStats(){
    const user=student(),uid=uidOf(user),stats=document.getElementById('home-stats');if(!user||!uid||!stats)return;
    const cells=ensureStatsShell(stats),workouts=MODE==='local'&&Array.isArray(LOCAL_DB?.workouts)?LOCAL_DB.workouts:Array.isArray(CLOUD_WORKOUTS)?CLOUD_WORKOUTS:[];
    const workoutMirror=storageGet('teamms_cloud_mirror_'+uid)==='1';
    const localInitialized=storageGet('teamms_local_initialized_'+uid)==='1';
    const cachedDiet=Array.isArray(LOCAL_DB?.mealPlan?.plans)?LOCAL_DB.mealPlan.plans:Array.isArray(DIET_DOCUMENT?.plans)?DIET_DOCUMENT.plans:null;
    const hasCachedWorkoutCount=workouts.length>0||workoutMirror||(MODE==='local'&&localInitialized);
    const hasCachedDietCount=!!cachedDiet&&(cachedDiet.length>0||localInitialized);
    const offline=ACCESS_MODE==='offline-registered'||ACCESS_MODE==='local-inactive'||navigator.onLine===false;
    if(offline){
      if(hasCachedWorkoutCount)setStatCount(cells[0],workouts.length);else setStatUnavailable(cells[0]);
      if(hasCachedDietCount)setStatCount(cells[1],cachedDiet.length);else setStatUnavailable(cells[1]);
      return;
    }
    if(hasCachedWorkoutCount)setStatCount(cells[0],workouts.length);else setStatUnavailable(cells[0]);
    if(Array.isArray(DIET_DOCUMENT?.plans))setStatCount(cells[1],DIET_DOCUMENT.plans.length);
    else if(hasCachedDietCount)setStatCount(cells[1],cachedDiet.length);
    else setStatUnavailable(cells[1]);
    if(MODE==='cloud'&&db){
      try{const doc=await cloudGet(db.collection('mealPlans').doc(uid),'contar protocolos de dieta');if(doc.exists)setStatCount(cells[1],Array.isArray(doc.data()?.plans)?doc.data().plans.length:0);else setStatCount(cells[1],0);}
      catch(error){if(!hasCachedDietCount)setStatUnavailable(cells[1]);}
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
    if(student()){ensureHomeHeader();refreshStudentHeader().catch(()=>{});refreshStats().catch(()=>{});fixConfidential();syncPendingStudentName().catch(()=>{});}
    clearInterval(refreshTimer);refreshTimer=setInterval(()=>{if(student()&&document.visibilityState==='visible'&&activeScreen()==='screen-home')refreshNoticeBadge().catch(()=>{});},BADGE_POLL_MS);
  }

  document.addEventListener('click',event=>{if(!event.target.closest?.('.tb-profile-head'))closeProfileMenu();},true);
  document.addEventListener('keydown',event=>{
    const editor=document.getElementById('tb-profile-editor');if(!editor||editor.hidden)return;
    if(event.key==='Escape'){event.preventDefault();closeNameEditor();return;}
    if(event.key!=='Tab')return;
    const focusable=Array.from(editor.querySelectorAll('input:not(:disabled),button:not(:disabled)')).filter(item=>item.offsetParent!==null);if(!focusable.length)return;
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&student()){refreshStudentHeader(true).catch(()=>{});syncPendingStudentName().catch(()=>{});}});
  window.addEventListener('pageshow',()=>{if(student())syncPendingStudentName().catch(()=>{});},{passive:true});
  window.addEventListener('online',()=>{if(student())syncPendingStudentName().catch(()=>{});});
  window.addEventListener('team-bulls-v107-ready',()=>setTimeout(init,0));
  window.addEventListener('team-bulls-runtime-ready',()=>syncPendingStudentName().catch(()=>{}));
  window.addEventListener('team-bulls-student-runtime-ready',()=>syncPendingStudentName().catch(()=>{}));
  window.TeamBullsStudentHome=Object.freeze({version:VERSION,init,openNotifications,refreshOpenNotifications,toggleProfileMenu,closeProfileMenu,pickAvatar,changeNickname,logout,markRead,openNotice,moderatePhoto,moderateNickname,refresh:()=>refreshStudentHeader(true)});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0),{once:true});else setTimeout(init,0);
})();
