/* Team Bulls v10.10.9 — UX, fotos, autenticação e desempenho. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_APP_UPDATE_20260808__)return;
  window.__TEAM_BULLS_APP_UPDATE_20260808__=true;

  const PHOTO_COUNT=6;
  const PHOTO_POSES=[
    'Frente',
    'Costas',
    'Lado direito',
    'Lado esquerdo',
    'Lado direito braços estendidos',
    'Lado esquerdo braços estendidos'
  ];
  const LEGACY_POSE_MAP={
    'Frente contraída':'Lado direito braços estendidos',
    'Costas contraída':'Lado esquerdo braços estendidos'
  };
  const KNOWN_ACCOUNTS_KEY='team_bulls_known_accounts_v1';
  const MAX_KNOWN_ACCOUNTS=8;
  const MAX_BULK_FILE_BYTES=30*1024*1024;
  const PHOTO_GUIDE_SRC='./modules/photo-guide-v10_10_9.js?v=10.10.9';
  const GUIDE_INSTRUCTION='Leia o guia completo antes de tirar as fotos. Siga exatamente posição, enquadramento, vestimenta e postura indicados nas imagens.';
  let photoGuideLoadPromise=null;

  function renderLazyGuideCard(id){
    const card=document.getElementById(id);if(!card)return;
    card.classList.add('available');
    card.innerHTML='<div><span>INSTRUÇÕES DE FOTOS</span><small>Guia incorporado ao aplicativo - 5 páginas</small></div><button type="button">ABRIR GUIA</button>';
    const button=card.querySelector('button');if(button)button.addEventListener('click',event=>{event.stopPropagation();lazyOpenPhotoGuide();});
    card.onclick=()=>lazyOpenPhotoGuide();
  }
  async function renderLazyGuideBlocks(){
    ['weekly-report-photo-instruction','questionnaire-report-photo-instruction','student-global-report-guide-instruction'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=GUIDE_INSTRUCTION;});
    ['weekly-report-guide-card','questionnaire-report-guide-card','student-global-report-guide-card'].forEach(renderLazyGuideCard);
    return{builtin:true,photoInstruction:GUIDE_INSTRUCTION,photoGuideName:'Instruções de fotos'};
  }
  function ensurePhotoGuideLoaded(){
    if(window.__TEAM_BULLS_BUILTIN_PHOTO_GUIDE__&&typeof window.openBuiltInPhotoGuide==='function')return Promise.resolve(true);
    if(photoGuideLoadPromise)return photoGuideLoadPromise;
    photoGuideLoadPromise=new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[src^="./modules/photo-guide-v10_10_9.js"],script[src*="/modules/photo-guide-v10_10_9.js"]');
      if(existing){existing.addEventListener('load',()=>resolve(true),{once:true});existing.addEventListener('error',reject,{once:true});return;}
      const script=document.createElement('script');script.src=PHOTO_GUIDE_SRC;script.async=false;
      script.onload=()=>resolve(true);script.onerror=()=>{photoGuideLoadPromise=null;reject(new Error('Não foi possível carregar o guia de fotos.'));};document.head.appendChild(script);
    });
    return photoGuideLoadPromise;
  }
  async function lazyOpenPhotoGuide(page=0){
    try{await ensurePhotoGuideLoaded();return window.openBuiltInPhotoGuide?.(page)??false;}
    catch(error){showToast('Não foi possível abrir o guia agora. Verifique sua conexão e tente novamente.',true);return false;}
  }
  function prepareLazyPhotoGuide(){
    window.openReportPhotoGuide=lazyOpenPhotoGuide;
    window.openReportGuideManager=lazyOpenPhotoGuide;
    window.renderReportGuideBlocks=renderLazyGuideBlocks;
    window.v109RenderGuideCard=renderLazyGuideCard;
    renderLazyGuideBlocks();
  }

  function injectStyles(){
    if(document.getElementById('tb-app-update-20260808-style'))return;
    const style=document.createElement('style');
    style.id='tb-app-update-20260808-style';
    style.textContent=`
      .tb-bulk-photo-picker{margin:10px 0 14px;padding:12px;border:1px solid rgba(198,61,61,.35);border-radius:12px;background:rgba(198,61,61,.07)}
      .tb-bulk-photo-picker button{width:100%;min-height:44px;border:1px solid rgba(198,61,61,.55);border-radius:10px;background:#241414;color:#fff;font:800 12px/1.2 'Barlow Condensed',system-ui;letter-spacing:.06em;cursor:pointer}
      .tb-bulk-photo-picker small{display:block;margin-top:8px;color:#aaa;font:500 10px/1.45 'DM Mono',monospace}
      .tb-bulk-photo-status{display:block;margin-top:7px;color:#d8d8d8;font:700 10px/1.3 'DM Mono',monospace}
      .tb-known-accounts{margin:-2px 0 13px;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.025)}
      .tb-known-accounts-title{display:block;margin-bottom:7px;color:#777;font:700 9px/1.2 'DM Mono',monospace;letter-spacing:.07em;text-transform:uppercase}
      .tb-known-accounts-list{display:flex;flex-wrap:wrap;gap:6px}
      .tb-known-account{max-width:100%;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:#181818;color:#ddd;padding:7px 10px;font:600 10px/1 'DM Mono',monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}
      .tb-known-account.active{border-color:rgba(198,61,61,.65);background:#261515;color:#fff}
      .tb-password-manager-hint{display:block;margin-top:7px;color:#777;font:500 9px/1.35 'DM Mono',monospace}
    `;
    document.head.appendChild(style);
  }

  function activeDietScreen(){return document.querySelector('#screen-ts-diet-detail.active,#screen-diet-detail.active')||null;}
  function captureScroll(){const screen=activeDietScreen();return screen?{id:screen.id,windowY:window.scrollY||window.pageYOffset||0,screenTop:screen.scrollTop||0}:null;}
  function restoreScroll(state){
    if(!state)return;
    const apply=()=>{const screen=document.getElementById(state.id);if(!screen?.classList.contains('active'))return;try{window.scrollTo({top:state.windowY,left:0,behavior:'instant'});}catch(error){window.scrollTo(0,state.windowY);}screen.scrollTop=state.screenTop;};
    requestAnimationFrame(()=>{apply();requestAnimationFrame(apply);});setTimeout(apply,80);
  }
  function wrapDietRenderer(name){
    const base=window[name];if(typeof base!=='function'||base.__tbPreserveScroll)return;
    const wrapped=function(...args){const state=captureScroll();const result=base.apply(this,args);restoreScroll(state);return result;};wrapped.__tbPreserveScroll=true;window[name]=wrapped;
  }
  function prepareDietScrollStability(){
    ['renderDietSupportTables','renderMealsList','renderDietVariantTabs','v104ActivateVariantMeals'].forEach(wrapDietRenderer);
    document.addEventListener('click',event=>{const screen=activeDietScreen();if(!screen||!screen.contains(event.target))return;screen.querySelectorAll('button:not([type])').forEach(button=>button.type='button');},true);
  }

  function patchPoseLabels(root=document){
    [['weekly-photo-4','Lado direito braços estendidos'],['weekly-photo-5','Lado esquerdo braços estendidos'],['report-photo-4','Lado direito braços estendidos'],['report-photo-5','Lado esquerdo braços estendidos']].forEach(([id,label])=>{
      const input=document.getElementById(id);if(!input)return;const slot=input.closest('.checkin-photo-slot'),span=slot?.querySelector('span');if(span)span.textContent=(id.endsWith('-4')?'5 · ':'6 · ')+label;const img=slot?.querySelector('img');if(img)img.alt=label;
    });
    root.querySelectorAll?.('figcaption').forEach(node=>{const mapped=LEGACY_POSE_MAP[node.textContent.trim()];if(mapped)node.textContent=mapped;});
    root.querySelectorAll?.('img[alt="Frente contraída"],img[alt="Costas contraída"]').forEach(img=>{img.alt=LEGACY_POSE_MAP[img.alt]||img.alt;});
  }
  function wrapPoseView(name){const base=window[name];if(typeof base!=='function'||base.__tbPoseLabels)return;const wrapped=async function(...args){const value=await base.apply(this,args);patchPoseLabels(document);return value;};wrapped.__tbPoseLabels=true;window[name]=wrapped;}

  function clearPreviewUrl(kind,index){
    try{if(kind==='weekly'){const old=WEEKLY_CHECKIN_PREVIEW_URLS[index];if(old)URL.revokeObjectURL(old);WEEKLY_CHECKIN_PREVIEW_URLS[index]='';}else{const old=QUESTIONNAIRE_REPORT_PREVIEW_URLS[index];if(old)URL.revokeObjectURL(old);QUESTIONNAIRE_REPORT_PREVIEW_URLS[index]='';}}catch(error){}
  }
  function setBulkFiles(kind,files){
    const selected=Array.from(files||[]).slice(0,PHOTO_COUNT);if(!selected.length)return;
    if(selected.find(file=>!String(file?.type||'').startsWith('image/'))){alert('Selecione somente imagens para o relatório.');return;}
    if(selected.find(file=>Number(file?.size||0)>MAX_BULK_FILE_BYTES)){alert('Uma das fotos ultrapassa 30 MB. Escolha uma versão menor dessa imagem.');return;}
    for(let index=0;index<PHOTO_COUNT;index++){
      clearPreviewUrl(kind,index);const file=selected[index]||null;if(kind==='weekly')WEEKLY_CHECKIN_FILES[index]=file;else QUESTIONNAIRE_REPORT_FILES[index]=file;
      const preview=document.getElementById((kind==='weekly'?'weekly-photo-preview-':'report-photo-preview-')+index);if(!preview)continue;
      if(file){const url=URL.createObjectURL(file);if(kind==='weekly')WEEKLY_CHECKIN_PREVIEW_URLS[index]=url;else QUESTIONNAIRE_REPORT_PREVIEW_URLS[index]=url;preview.src=url;preview.classList.add('active');}else{preview.removeAttribute('src');preview.classList.remove('active');}
    }
    const status=document.getElementById('tb-'+kind+'-bulk-status');if(status)status.textContent=selected.length===PHOTO_COUNT?'✓ 6 fotos selecionadas. Confira a ordem nas miniaturas abaixo.':`${selected.length} de 6 fotos selecionadas. Complete as demais individualmente abaixo.`;patchPoseLabels(document);
  }
  function ensureBulkPicker(kind){
    const first=document.getElementById(kind==='weekly'?'weekly-photo-0':'report-photo-0'),grid=first?.closest('.checkin-photo-grid');if(!grid)return;
    const id='tb-'+kind+'-bulk-picker';if(document.getElementById(id))return;
    const wrap=document.createElement('div');wrap.className='tb-bulk-photo-picker';wrap.id=id;
    const input=document.createElement('input');input.type='file';input.accept='image/*';input.multiple=true;input.hidden=true;input.id='tb-'+kind+'-bulk-input';
    const button=document.createElement('button');button.type='button';button.textContent='SELECIONAR AS 6 FOTOS DE UMA VEZ';
    const status=document.createElement('span');status.className='tb-bulk-photo-status';status.id='tb-'+kind+'-bulk-status';status.textContent='Nenhuma seleção em lote ainda.';
    const hint=document.createElement('small');hint.textContent='Selecione na ordem: Frente → Costas → Lado direito → Lado esquerdo → Lado direito braços estendidos → Lado esquerdo braços estendidos. Depois você ainda pode trocar qualquer foto individualmente.';
    button.addEventListener('click',()=>{input.value='';input.click();});input.addEventListener('change',()=>setBulkFiles(kind,input.files));wrap.append(button,input,status,hint);grid.parentNode.insertBefore(wrap,grid);
  }
  function resetBulkStatus(kind){const input=document.getElementById('tb-'+kind+'-bulk-input');if(input)input.value='';const status=document.getElementById('tb-'+kind+'-bulk-status');if(status)status.textContent='Nenhuma seleção em lote ainda.';}
  function prepareBulkPhotoUi(){
    ensureBulkPicker('weekly');ensureBulkPicker('questionnaire');patchPoseLabels(document);
    const hasBulkWrapper=fn=>{for(let depth=0;depth<20&&typeof fn==='function';depth++,fn=fn.__tbBase)if(fn.__tbBulk)return true;return false;};
    const baseWeekly=window.openWeeklyCheckinModal;if(typeof baseWeekly==='function'&&!hasBulkWrapper(baseWeekly)){const wrapped=async function(...args){const value=await baseWeekly.apply(this,args);resetBulkStatus('weekly');ensureBulkPicker('weekly');patchPoseLabels(document);return value;};wrapped.__tbBulk=true;wrapped.__tbBase=baseWeekly;window.openWeeklyCheckinModal=wrapped;}
    const baseQuestionnaire=window.openAnswerQuestionnaire;if(typeof baseQuestionnaire==='function'&&!baseQuestionnaire.__tbBulk){const wrapped=async function(...args){const value=await baseQuestionnaire.apply(this,args);resetBulkStatus('questionnaire');ensureBulkPicker('questionnaire');patchPoseLabels(document);return value;};wrapped.__tbBulk=true;window.openAnswerQuestionnaire=wrapped;}
    ['viewWeeklyCheckin','viewQuestionnaire'].forEach(wrapPoseView);
  }

  async function mapLimit(items,limit,worker){const list=Array.from(items||[]),result=new Array(list.length);let next=0;async function runner(){while(true){const index=next++;if(index>=list.length)return;result[index]=await worker(list[index],index);}}await Promise.all(Array.from({length:Math.min(Math.max(1,limit),list.length)},runner));return result;}
  function photoConcurrency(){const memory=Number(navigator.deviceMemory||0);return memory&&memory<=4?2:3;}
  async function prepareReportPhotoWrites(files,{studentUid,idBase,suffix,relation}){
    const createdPaths=[];let completed=0;
    const writes=await mapLimit(Array.from(files),photoConcurrency(),async(file,index)=>{
      const photoId=(idBase+suffix+(index+1)).slice(0,190),photoRef=db.collection('progressPhotos').doc(photoId),variants=await buildProgressPhotoVariants(file);
      let [photoPath,thumbPath]=await Promise.all([uploadCloudPhoto('progressPhotos',studentUid,photoId,variants.full),uploadCloudPhoto('progressPhotoThumbs',studentUid,photoId,variants.thumb)]);
      if(photoPath)createdPaths.push(photoPath);if(thumbPath)createdPaths.push(thumbPath);
      if(!photoPath&&thumbPath){await deleteCloudPhoto(thumbPath).catch(()=>false);const pos=createdPaths.indexOf(thumbPath);if(pos>=0)createdPaths.splice(pos,1);thumbPath='';}
      const payload={userId:studentUid,date:today(),pose:PHOTO_POSES[index],createdAt:firebase.firestore.FieldValue.serverTimestamp(),...relation};if(photoPath){payload.photoPath=photoPath;if(thumbPath)payload.thumbPath=thumbPath;}else payload.dataUrl=variants.full;
      completed++;showToast(`Preparando e enviando fotos: ${completed}/${PHOTO_COUNT}`);return{ref:photoRef,payload,photoId};
    });
    return{writes,createdPaths,photoIds:writes.map(item=>item.photoId)};
  }

  function installOptimizedWeeklySubmit(){
    window.submitWeeklyCheckin=async function(){
      const request=WEEKLY_CHECKIN_REQUEST,studentUid=CURRENT_USER?.uid;if(!request||!studentUid||CURRENT_USER?.role!=='student')return;
      const weight=Number(String(document.getElementById('weekly-checkin-weight').value||'').replace(',','.'));if(!Number.isFinite(weight)||weight<20||weight>500){alert('Informe um peso válido entre 20 e 500 kg.');return;}
      const areas=[...document.querySelectorAll('[data-weekly-question]')],answers=areas.map(area=>area.value.normalize('NFKC').trim());if(answers.some(answer=>!answer)){alert('Responda todas as perguntas do relatório semanal.');return;}
      if(WEEKLY_CHECKIN_FILES.some(file=>!(file instanceof File))){alert('Envie obrigatoriamente as seis fotos: frente, costas, lado direito, lado esquerdo, lado direito braços estendidos e lado esquerdo braços estendidos.');return;}
      if(!beginAction('weekly-checkin-submit','modal-weekly-checkin'))return;
      const {questions,sectionAt}=buildWeeklyCheckinQuestions(),checkinId=weeklyCheckinDocId(studentUid,request.requestKey);let createdPaths=[];
      try{
        const checkinRef=db.collection('weeklyCheckins').doc(checkinId),existing=await cloudGet(db.collection('weeklyCheckins').where('studentId','==',studentUid).where('requestKey','==',request.requestKey).limit(1),'verificar relatório semanal');if(!existing.empty)throw new Error('Este relatório já foi enviado. Atualize a página para ver o histórico.');
        showToast('Otimizando as 6 fotos...');const prepared=await prepareReportPhotoWrites(WEEKLY_CHECKIN_FILES,{studentUid,idBase:checkinId,suffix:'-p',relation:{checkinId}});createdPaths=prepared.createdPaths;
        const checkinPayload={studentId:studentUid,requestKey:request.requestKey,requestKind:request.kind,dueDate:request.dueDate,submittedDate:today(),weight:Math.round(weight*10)/10,questions,sectionAt,answers,photoIds:prepared.photoIds,createdAt:firebase.firestore.FieldValue.serverTimestamp()};
        const batch=db.batch();prepared.writes.forEach(write=>batch.set(write.ref,write.payload));batch.set(checkinRef,checkinPayload);
        try{await cloudWrite(batch.commit(),'enviar relatório semanal e seis fotos');}catch(error){const verified=await cloudGet(checkinRef,'confirmar relatório semanal').catch(()=>null);if(!verified?.exists){await Promise.allSettled(createdPaths.map(path=>deleteCloudPhoto(path)));throw error;}}
        clearWeeklyCheckinPreviews();WEEKLY_CHECKIN_FILES=Array(PHOTO_COUNT).fill(null);resetBulkStatus('weekly');closeModal('modal-weekly-checkin');showToast('✓ Relatório semanal enviado com todas as respostas e 6 fotos');await loadWeeklyCheckinState(true);renderCalendar();
      }catch(error){await Promise.allSettled(createdPaths.map(path=>deleteCloudPhoto(path)));alert(cloudWriteError(error,'enviar o relatório semanal'));}finally{endAction('weekly-checkin-submit','modal-weekly-checkin');}
    };
  }

  function installOptimizedQuestionnaireSubmit(){
    window.submitQuestionnaireAnswers=async function(){
      const reportId=CUR_ANSWER_QUEST_ID,report=CURRENT_ANSWER_REPORT,studentUid=CURRENT_USER?.uid;if(!reportId||!report||!studentUid||CURRENT_USER?.role!=='student')return;
      const mode=v109ReportMode(report),requiresAnswers=v109ModeRequiresAnswers(mode),requiresPhotos=v109ModeRequiresPhotos(mode),areas=[...document.querySelectorAll('#quest-answer-form textarea')],answers=requiresAnswers?areas.map(area=>area.value.normalize('NFKC').trim()):[];
      if(requiresAnswers){const missing=answers.findIndex(answer=>!answer);if(missing>=0){alert('Responda todas as perguntas antes de enviar o relatório.');areas[missing]?.focus();areas[missing]?.scrollIntoView({behavior:'smooth',block:'center'});return;}if(answers.length!==(report.questions||[]).length){alert('O relatório foi alterado. Feche e abra novamente antes de responder.');return;}}
      if(requiresPhotos&&QUESTIONNAIRE_REPORT_FILES.some(file=>!(file instanceof File))){alert('Envie obrigatoriamente as seis fotos: frente, costas, lado direito, lado esquerdo, lado direito braços estendidos e lado esquerdo braços estendidos.');return;}
      if(!beginAction('answer-questionnaire','modal-answer-quest'))return;let createdPaths=[];
      try{
        const reportRef=db.collection('questionnaires').doc(reportId),fresh=await cloudGet(reportRef,'verificar relatório');if(!fresh.exists)throw new Error('Este relatório não está mais disponível.');if(fresh.data().answered)throw new Error('Este relatório já foi enviado. Atualize a página para ver o histórico.');
        let prepared={writes:[],createdPaths:[],photoIds:[]};if(requiresPhotos){showToast('Otimizando as 6 fotos...');prepared=await prepareReportPhotoWrites(QUESTIONNAIRE_REPORT_FILES,{studentUid,idBase:reportId,suffix:'-r',relation:{reportId,questionnaireId:reportId}});createdPaths=prepared.createdPaths;}
        const batch=db.batch();prepared.writes.forEach(write=>batch.set(write.ref,write.payload));batch.update(reportRef,{answers,answered:true,answeredAt:firebase.firestore.FieldValue.serverTimestamp(),photoIds:prepared.photoIds});
        try{await cloudWrite(batch.commit(),'enviar relatório');}catch(error){const verified=await cloudGet(reportRef,'confirmar relatório').catch(()=>null);if(!verified?.exists||!verified.data().answered){await Promise.allSettled(createdPaths.map(path=>deleteCloudPhoto(path)));throw error;}}
        resetQuestionnaireReportPhotos();resetBulkStatus('questionnaire');CURRENT_ANSWER_REPORT=null;CUR_ANSWER_QUEST_ID=null;closeModal('modal-answer-quest');document.getElementById('quest-banner').style.display='none';showToast(mode==='photos'?'✓ Seis fotos enviadas':mode==='written'?'✓ Relatório escrito enviado':'✓ Relatório e seis fotos enviados');await checkQuestionnaires();
      }catch(error){await Promise.allSettled(createdPaths.map(path=>deleteCloudPhoto(path)));alert('Erro ao enviar relatório: '+cloudWriteError(error,'enviar o relatório'));}finally{endAction('answer-questionnaire','modal-answer-quest');}
    };
  }

  function normalizeEmail(value){return String(value||'').normalize('NFKC').trim().toLowerCase().slice(0,320);}
  function storedKnownAccounts(){try{const list=JSON.parse(localStorage.getItem(KNOWN_ACCOUNTS_KEY)||'[]');return Array.isArray(list)?list.map(normalizeEmail).filter(Boolean):[];}catch(error){return[];}}
  function knownAccounts(){const emails=new Set(storedKnownAccounts());try{Object.values(offlineCredentialMap()).forEach(record=>{const email=normalizeEmail(record?.email);if(email)emails.add(email);});}catch(error){}return Array.from(emails).slice(0,MAX_KNOWN_ACCOUNTS);}
  function rememberKnownAccount(email){email=normalizeEmail(email);if(!email)return;const list=[email,...storedKnownAccounts().filter(item=>item!==email)].slice(0,MAX_KNOWN_ACCOUNTS);try{localStorage.setItem(KNOWN_ACCOUNTS_KEY,JSON.stringify(list));}catch(error){}renderKnownAccounts();}
  function renderKnownAccounts(){
    const emailInput=document.getElementById('login-email');if(!emailInput)return;let host=document.getElementById('tb-known-accounts');const accounts=knownAccounts();if(!accounts.length){host?.remove();return;}
    if(!host){host=document.createElement('div');host.id='tb-known-accounts';host.className='tb-known-accounts';emailInput.closest('.form-group')?.insertAdjacentElement('afterend',host);}
    const current=normalizeEmail(emailInput.value);host.innerHTML='<span class="tb-known-accounts-title">Contas neste aparelho</span><div class="tb-known-accounts-list"></div><span class="tb-password-manager-hint">A senha pode ser preenchida pelo gerenciador seguro do Android/iPhone/navegador.</span>';
    const list=host.querySelector('.tb-known-accounts-list');accounts.forEach(email=>{const button=document.createElement('button');button.type='button';button.className='tb-known-account'+(email===current?' active':'');button.textContent=email;button.title='Usar '+email;button.addEventListener('click',()=>{emailInput.value=email;emailInput.dispatchEvent(new Event('input',{bubbles:true}));renderKnownAccounts();document.getElementById('login-pass')?.focus();});list.appendChild(button);});
  }
  function removePasswordManagerBlockers(input){['data-1p-ignore','data-lpignore','data-form-type','aria-autocomplete'].forEach(attr=>input?.removeAttribute(attr));}
  function prepareAuthAutofill(){
    const form=document.getElementById('panel-login'),email=document.getElementById('login-email'),pass=document.getElementById('login-pass');if(form){form.autocomplete='on';form.removeAttribute('data-form-type');}if(email){email.autocomplete='username';email.name='username';removePasswordManagerBlockers(email);email.addEventListener('input',renderKnownAccounts,{passive:true});}if(pass){pass.autocomplete='current-password';pass.name='password';removePasswordManagerBlockers(pass);pass.removeAttribute('data-sensitive');}
    const loginButton=document.getElementById('btn-login');if(loginButton&&form){loginButton.type='submit';loginButton.removeAttribute('onclick');}
    const registerForm=document.getElementById('panel-register'),regEmail=document.getElementById('reg-email'),regPass=document.getElementById('reg-pass'),registerButton=document.getElementById('btn-register');if(registerForm){registerForm.autocomplete='on';registerForm.removeAttribute('data-form-type');}if(regEmail){regEmail.autocomplete='username';regEmail.name='username';removePasswordManagerBlockers(regEmail);}if(regPass){regPass.autocomplete='new-password';regPass.name='new-password';regPass.removeAttribute('data-sensitive');}if(registerButton&&registerForm){registerButton.type='submit';registerButton.removeAttribute('onclick');}
    renderKnownAccounts();try{auth?.onAuthStateChanged?.(user=>{if(user?.email)rememberKnownAccount(user.email);});}catch(error){}
  }

  function install(){injectStyles();prepareDietScrollStability();prepareLazyPhotoGuide();prepareBulkPhotoUi();installOptimizedWeeklySubmit();installOptimizedQuestionnaireSubmit();prepareAuthAutofill();patchPoseLabels(document);window.TeamBullsAppUpdate20260808=Object.freeze({photoPoses:[...PHOTO_POSES],prepareBulkPhotoUi,renderKnownAccounts});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
