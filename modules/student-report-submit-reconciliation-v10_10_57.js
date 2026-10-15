/* Team Bulls v10.10.57 — envio canônico resiliente de relatórios sem depender da fila interna do Firestore Web SDK. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_STUDENT_REPORT_SUBMIT_RECONCILIATION_1010577__)return;
  window.__TEAM_BULLS_STUDENT_REPORT_SUBMIT_RECONCILIATION_1010577__=true;

  const VERSION='10.10.57-submitstate7';
  const READ_TIMEOUT=9000;
  const REST_GET_TIMEOUT=12000;
  const REST_COMMIT_TIMEOUT=35000;
  const UNCERTAIN_RETRY_DELAY=60000;
  const FIRESTORE_DATA_URL_MAX=620000;
  const MAX_COMMIT_BODY=7*1024*1024;
  const uncertain=new Map();
  let weeklyReceipt=null;
  let installedQuestionnaire=false;
  let installedWeekly=false;
  let installedPending=false;

  const student=()=>{try{return CURRENT_USER?.role==='student'&&MODE==='cloud'&&!!db&&!!auth?.currentUser;}catch(error){return false;}};
  const studentUid=()=>student()?String(CURRENT_USER?.uid||auth?.currentUser?.uid||''):'';
  const stampMs=value=>{try{if(value?.toMillis)return value.toMillis();if(value?.toDate)return value.toDate().getTime();if(value?.seconds)return Number(value.seconds)*1000;return 0;}catch(error){return 0;}};
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const timeout=(task,ms,label,code='team-bulls/timeout')=>new Promise((resolve,reject)=>{
    let settled=false;
    const timer=setTimeout(()=>{if(settled)return;settled=true;const error=new Error('Tempo esgotado: '+label);error.code=code;reject(error);},Math.max(250,Number(ms)||8000));
    Promise.resolve(task).then(value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);},error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);});
  });
  const notify=(message,isError=false)=>{try{if(typeof showToast==='function')showToast(message,!!isError);else console[isError?'warn':'info']('[Team Bulls]',message);}catch(error){}};
  const safeId=value=>{const raw=String(value||'');if(!raw||raw.length>190||raw.includes('/'))throw Object.assign(new Error('Identificador de relatório inválido.'),{code:'team-bulls/invalid-report-id'});return raw;};
  const projectId=()=>{try{return String(CFG?.firebase?.projectId||'').trim();}catch(error){return'';}};
  const documentName=(collection,id)=>`projects/${projectId()}/databases/(default)/documents/${collection}/${safeId(id)}`;
  const documentUrl=(collection,id)=>`https://firestore.googleapis.com/v1/${documentName(collection,id).split('/').map((part,index)=>index<5?part:encodeURIComponent(part)).join('/')}`;
  const commitUrl=()=>`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId())}/databases/(default)/documents:commit`;

  function restValue(value){
    if(value===null)return{nullValue:null};
    if(Array.isArray(value))return{arrayValue:{values:value.map(restValue)}};
    if(typeof value==='string')return{stringValue:value};
    if(typeof value==='boolean')return{booleanValue:value};
    if(typeof value==='number'){
      if(!Number.isFinite(value))throw Object.assign(new Error('Valor numérico inválido no relatório.'),{code:'team-bulls/invalid-number'});
      return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
    }
    if(value&&typeof value==='object'){
      const fields={};for(const [key,item] of Object.entries(value)){if(item!==undefined)fields[key]=restValue(item);}return{mapValue:{fields}};
    }
    throw Object.assign(new Error('Tipo de dado não suportado no relatório.'),{code:'team-bulls/invalid-field'});
  }
  function restFields(data){const fields={};for(const [key,value] of Object.entries(data||{})){if(value!==undefined)fields[key]=restValue(value);}return fields;}
  const serverTime=fieldPath=>({fieldPath,setToServerValue:'REQUEST_TIME'});
  const createWrite=(collection,id,data,timestampField='createdAt')=>({
    update:{name:documentName(collection,id),fields:restFields(data)},
    currentDocument:{exists:false},
    updateTransforms:timestampField?[serverTime(timestampField)]:[]
  });
  const patchWrite=(collection,id,data,mask,timestampField='')=>({
    update:{name:documentName(collection,id),fields:restFields(data)},
    updateMask:{fieldPaths:Array.from(mask||Object.keys(data||{}))},
    currentDocument:{exists:true},
    updateTransforms:timestampField?[serverTime(timestampField)]:[]
  });

  async function authHeaders(){
    const user=auth?.currentUser;if(!user)throw Object.assign(new Error('Sua sessão expirou. Entre novamente.'),{code:'team-bulls/no-user'});
    const idToken=await timeout(user.getIdToken(),8000,'validar sessão','team-bulls/auth-token-timeout');
    const headers={'Content-Type':'application/json','Authorization':'Bearer '+idToken};
    let appCheckRequired=false;try{appCheckRequired=!!String(CFG?.appCheckSiteKey||'').trim();}catch(error){}
    if(appCheckRequired){
      try{
        const appCheck=typeof firebase!=='undefined'&&typeof firebase.appCheck==='function'?firebase.appCheck():null;
        if(!appCheck?.getToken)throw new Error('App Check ainda não está pronto.');
        const tokenResult=await timeout(appCheck.getToken(false),7000,'validar App Check','team-bulls/app-check-timeout');
        if(!tokenResult?.token)throw new Error('Token App Check ausente.');
        headers['X-Firebase-AppCheck']=tokenResult.token;
      }catch(error){
        const wrapped=new Error('A conexão segura ainda não foi validada. Aguarde alguns segundos e tente novamente.');
        wrapped.code='team-bulls/app-check-unavailable';wrapped.cause=error;throw wrapped;
      }
    }
    return headers;
  }

  async function fetchJson(url,options={},timeoutMs=REST_GET_TIMEOUT,label='comunicação com Firestore'){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetch(url,{...options,signal:controller.signal,cache:'no-store'});
      let body=null;try{body=await response.json();}catch(error){}
      if(!response.ok){
        const message=String(body?.error?.message||`HTTP ${response.status}`);
        const failure=new Error(message);failure.code='firestore-rest/'+response.status;failure.status=response.status;failure.definite=true;failure.payload=body;throw failure;
      }
      return body||{};
    }catch(error){
      if(error?.status)throw error;
      const wrapped=new Error(error?.name==='AbortError'?'Tempo esgotado durante '+label:String(error?.message||error||label));
      wrapped.code=error?.name==='AbortError'?'team-bulls/rest-timeout':'team-bulls/rest-network';wrapped.status=0;wrapped.definite=false;wrapped.cause=error;throw wrapped;
    }finally{clearTimeout(timer);}
  }

  async function restGet(collection,id){
    const headers=await authHeaders();
    try{return await fetchJson(documentUrl(collection,id),{method:'GET',headers},REST_GET_TIMEOUT,'consulta do relatório');}
    catch(error){if(error?.status===404)return null;throw error;}
  }
  async function restCommit(writes,label){
    const headers=await authHeaders();
    const payload=JSON.stringify({writes});
    if(payload.length>MAX_COMMIT_BODY)throw Object.assign(new Error('As fotos ainda estão grandes demais para um envio seguro. Selecione-as novamente para nova otimização.'),{code:'team-bulls/report-payload-too-large',definite:true});
    return fetchJson(commitUrl(),{method:'POST',headers,body:payload},REST_COMMIT_TIMEOUT,label);
  }
  const restAnswered=document=>document?.fields?.answered?.booleanValue===true;

  async function serverGet(reference,label){
    try{return await timeout(reference.get({source:'server'}),READ_TIMEOUT,label);}
    catch(error){return timeout(reference.get(),READ_TIMEOUT,label);}
  }

  async function pendingQuestionnaires(uid){
    if(!uid)return[];
    const snap=await serverGet(db.collection('questionnaires').where('studentId','==',uid),'confirmar pendências');
    let rows=(snap.docs||[]).map(doc=>({...doc.data(),id:doc.id}));
    if(rows.some(report=>report.reportType==='monthly')){await ensureReportCycleRuntime();rows=await window.TeamBullsMonthlyReports.pending(rows,uid);}
    return rows.filter(report=>report.answered!==true).sort((a,b)=>(stampMs(a.createdAt)-stampMs(b.createdAt))||String(a.id).localeCompare(String(b.id)));
  }
  function pendingLabel(count){return count===1?'1 atualização pendente':`${count} atualizações pendentes`;}
  function renderPendingBanner(pending){
    const banner=document.getElementById('quest-banner');if(!banner)return pending.length;
    const rows=Array.isArray(pending)?pending:[];
    if(!rows.length){banner.style.display='none';banner.dataset.qid='';banner.dataset.pendingCount='0';banner.querySelector('[data-tb-report-pending-count]')?.remove();return 0;}
    banner.dataset.qid=String(rows[0].id||'');banner.dataset.pendingCount=String(rows.length);banner.style.display='block';
    let note=banner.querySelector('[data-tb-report-pending-count]');if(!note){note=document.createElement('div');note.dataset.tbReportPendingCount='1';note.style.cssText='margin-top:6px;font-size:11px;opacity:.72;letter-spacing:.04em';banner.appendChild(note);}note.textContent=pendingLabel(rows.length);return rows.length;
  }

  async function reconcileQuestionnaires({submittedId='',announce=false}={}){
    const uid=studentUid();if(!uid)return{confirmed:false,pending:[]};
    let confirmed=false;
    if(submittedId){
      try{confirmed=restAnswered(await restGet('questionnaires',submittedId));}
      catch(error){console.warn('[Team Bulls] confirmação REST do relatório ainda indisponível',error?.code||error?.message||error);}
    }
    let pending=[];try{pending=await pendingQuestionnaires(uid);renderPendingBanner(pending);}catch(error){console.warn('[Team Bulls] reconciliação de pendências indisponível',error?.code||error?.message||error);}
    if(announce&&submittedId){
      if(confirmed)notify(pending.length?`✓ Relatório confirmado. Ainda há ${pendingLabel(pending.length)} diferente(s).`:'✓ Relatório confirmado. Nenhuma atualização pendente.');
      else notify('O envio ainda não foi confirmado pelo servidor. O app não fará reenvio automático.',true);
    }
    return{confirmed,pending};
  }

  async function firestorePhotoData(file,current){
    if(typeof current==='string'&&current.length<=FIRESTORE_DATA_URL_MAX)return current;
    if(typeof decodeImageForCompression!=='function'||typeof encodeImageVariant!=='function')throw new Error('Não foi possível otimizar a fotografia para o Firestore.');
    const decoded=await decodeImageForCompression(file);
    try{return encodeImageVariant(decoded,1280,.74,FIRESTORE_DATA_URL_MAX);}finally{decoded.close?.();}
  }

  async function preparePhoto(file,{userId,extra}){
    const variants=await buildProgressPhotoVariants(file);
    const data={userId,date:typeof today==='function'?today():new Date().toISOString().slice(0,10),pose:extra.pose,...extra};
    data.dataUrl=await firestorePhotoData(file,variants.full);
    return{data};
  }

  function friendly(error){
    const code=String(error?.code||'');
    if(code==='team-bulls/app-check-unavailable')return error.message;
    if(code==='team-bulls/rest-timeout'||code==='team-bulls/rest-network')return'O servidor ainda não confirmou o envio. Não envie novamente agora; aguarde a confirmação.';
    if(error?.status===403)return'O Firebase recusou este envio pelas regras de segurança. O relatório não foi marcado como enviado.';
    if(error?.status===401)return'Sua sessão expirou. Entre novamente antes de enviar o relatório.';
    if(code==='team-bulls/report-payload-too-large')return error.message;
    return String(error?.message||'Não foi possível enviar o relatório.').slice(0,260);
  }
  function hideSubmittedBanner(reportId){try{const banner=document.getElementById('quest-banner');if(banner&&String(banner.dataset.qid||'')===String(reportId)){banner.style.display='none';banner.dataset.qid='';}}catch(error){}}

  async function uncertainQuestionnaire(reportId){
    const state=uncertain.get('q:'+reportId);if(!state)return false;
    try{
      if(state.uid!==studentUid())return'wait';
      if(await confirmWeeklyAttempt(reportId,state)){uncertain.delete('q:'+reportId);return'confirmed';}
      if(Date.now()>=state.until){uncertain.delete('q:'+reportId);return false;}
      return'wait';
    }catch(error){return'wait';}
  }
  function sameRestValue(a,b){
    if(!a||!b)return false;
    if('integerValue' in a||'doubleValue' in a)return Number(a.integerValue??a.doubleValue)===Number(b.integerValue??b.doubleValue);
    if(a.arrayValue)return (a.arrayValue.values||[]).length===(b.arrayValue?.values||[]).length&&(a.arrayValue.values||[]).every((v,i)=>sameRestValue(v,b.arrayValue?.values?.[i]));
    if(a.mapValue)return sameRestFields(a.mapValue.fields,b.mapValue?.fields);
    return JSON.stringify(a)===JSON.stringify(b);
  }
  function sameRestFields(expected,actual){
    return !!actual&&Object.entries(expected||{}).every(([key,value])=>sameRestValue(value,actual[key]));
  }
  async function confirmWeeklyAttempt(checkinId,state){
    if(!state?.writes?.length)return false;
    // A deterministic ID proves the period, not that these answers/photos arrived.
    // Compare every field of all seven atomic writes before reporting success.
    for(const write of state.writes){
      const parts=write.update.name.split('/'),id=parts.pop(),collection=parts.pop();
      const doc=await restGet(collection,id);
      if(!doc||doc.name!==write.update.name||!sameRestFields(write.update.fields,doc.fields))return false;
    }
    return true;
  }

  async function uncertainWeekly(checkinId){
    const state=uncertain.get('w:'+checkinId);if(!state)return false;
    try{
      const confirmed=await confirmWeeklyAttempt(checkinId,state);
      if(confirmed){uncertain.delete('w:'+checkinId);return'confirmed';}
      if(Date.now()>=state.until){uncertain.delete('w:'+checkinId);return false;}
      return'wait';
    }catch(error){return'wait';}
  }

  async function reconcileWeeklyPending(){
    const uid=studentUid();
    for(const [key,state] of uncertain){
      if(!key.startsWith('w:')||state.writes?.at(-1)?.update?.fields?.studentId?.stringValue!==uid)continue;
      const result=await uncertainWeekly(key.slice(2));
      if(result==='confirmed'){
        weeklyReceipt=Object.freeze({studentId:uid,sourceId:key.slice(2)});
        if(typeof clearWeeklyCheckinPreviews==='function')clearWeeklyCheckinPreviews();
        WEEKLY_CHECKIN_FILES=Array(6).fill(null);
        if(typeof closeModal==='function')closeModal('modal-weekly-checkin');
        notify('✓ O relatório semanal anterior foi confirmado pelo servidor.');
        try{await loadWeeklyCheckinState(true);renderCalendar();}catch(error){}
        return true;
      }
      if(result==='wait'){notify('Este relatório semanal ainda está em confirmação. Não envie novamente agora.',true);return false;}
    }
    return null;
  }

  async function robustQuestionnaireSubmit(){
    const reportId=String(typeof CUR_ANSWER_QUEST_ID!=='undefined'?CUR_ANSWER_QUEST_ID||'':'');
    const report=typeof CURRENT_ANSWER_REPORT!=='undefined'?CURRENT_ANSWER_REPORT:null;
    const uid=studentUid();if(!reportId||!report||!uid)return;
    const mode=typeof v109ReportMode==='function'?v109ReportMode(report):String(report.requestMode||'full');
    const requiresAnswers=typeof v109ModeRequiresAnswers==='function'?v109ModeRequiresAnswers(mode):mode!=='photos';
    const requiresPhotos=typeof v109ModeRequiresPhotos==='function'?v109ModeRequiresPhotos(mode):mode!=='written';
    const areas=[...document.querySelectorAll('#quest-answer-form textarea')];
    const answers=requiresAnswers?areas.map(area=>area.value.normalize('NFKC').trim()):[];
    if(requiresAnswers){const missing=answers.findIndex(answer=>!answer);if(missing>=0){alert('Responda todas as perguntas antes de enviar o relatório.');areas[missing]?.focus();return;}if(answers.length!==(report.questions||[]).length){alert('O relatório foi alterado. Feche e abra novamente antes de responder.');return;}}
    if(requiresPhotos&&QUESTIONNAIRE_REPORT_FILES.some(file=>!(file instanceof File))){alert('Envie obrigatoriamente as seis fotos: frente, costas, lado direito, lado esquerdo, frente contraída e costas contraída.');return;}

    const uncertainState=await uncertainQuestionnaire(reportId);
    if(uncertainState==='confirmed'){hideSubmittedBanner(reportId);notify('✓ O envio anterior foi confirmado pelo servidor.');await reconcileQuestionnaires({submittedId:reportId});return true;}
    if(uncertainState==='wait'){notify('Este relatório ainda está em confirmação. Não envie novamente agora.',true);return false;}
    if(!beginAction('answer-questionnaire','modal-answer-quest'))return;
    try{
      if(navigator.onLine===false)throw Object.assign(new Error('Sem conexão com a internet.'),{code:'team-bulls/offline',definite:true});
      const fresh=await restGet('questionnaires',reportId);if(!fresh)throw Object.assign(new Error('Este relatório não está mais disponível.'),{code:'team-bulls/report-missing',definite:true});if(restAnswered(fresh))throw Object.assign(new Error('Este relatório já foi enviado. Atualize a página para ver o histórico.'),{code:'team-bulls/already-sent',definite:true});
      if(!fresh.updateTime||!sameRestFields(restFields({studentId:uid,trainerId:report.trainerId,questions:report.questions}),fresh.fields))throw new Error('O relatório mudou. Feche e abra novamente antes de enviar.');
      if(report.reportType==='monthly'){await ensureReportCycleRuntime();await window.TeamBullsMonthlyReports.assertAvailable(report);}
      const files=QUESTIONNAIRE_REPORT_FILES.slice();
      const photoIds=[],writes=[];
      if(requiresPhotos){
        for(let index=0;index<6;index++){
          notify('Preparando foto '+(index+1)+' de 6...');
          const photoId=(reportId+'-r'+(index+1)).slice(0,190);photoIds.push(photoId);
          const prepared=await preparePhoto(files[index],{userId:uid,extra:{reportId,questionnaireId:reportId,pose:CHECKIN_POSES[index]}});writes.push(createWrite('progressPhotos',photoId,prepared.data));
        }
      }
      if(studentUid()!==uid||auth?.currentUser?.uid!==uid||CUR_ANSWER_QUEST_ID!==reportId)throw new Error('A sessão ou o formulário mudou durante o preparo. Nenhum envio foi feito.');
      if(report.reportType==='monthly')await window.TeamBullsMonthlyReports.assertAvailable(report);
      writes.push(patchWrite('questionnaires',reportId,{answers,answered:true,photoIds},['answers','answered','photoIds'],'answeredAt'));
      writes[writes.length-1].currentDocument={updateTime:fresh.updateTime};
      try{await restCommit(writes,'enviar relatório');}
      catch(error){
        if(error?.definite)throw error;
        const attempt={writes,uid,until:Date.now()+UNCERTAIN_RETRY_DELAY};uncertain.set('q:'+reportId,attempt);
        await sleep(1200);
        let confirmed=false;try{confirmed=await confirmWeeklyAttempt(reportId,attempt);}catch(confirmError){}
        if(!confirmed)throw error;
      }
      uncertain.delete('q:'+reportId);
      if(typeof resetQuestionnaireReportPhotos==='function')resetQuestionnaireReportPhotos();
      try{CURRENT_ANSWER_REPORT=null;CUR_ANSWER_QUEST_ID=null;}catch(error){}
      if(typeof closeModal==='function')closeModal('modal-answer-quest');hideSubmittedBanner(reportId);
      notify(mode==='photos'?'✓ Seis fotos enviadas e confirmadas':mode==='written'?'✓ Relatório escrito enviado e confirmado':'✓ Relatório e seis fotos enviados e confirmados');
      await reconcileQuestionnaires({submittedId:reportId});
      return true;
    }catch(error){
      console.warn('[Team Bulls] envio canônico do questionário falhou',error?.code||error?.message||error);
      notify(friendly(error),true);return false;
    }finally{endAction('answer-questionnaire','modal-answer-quest');}
  }
  robustQuestionnaireSubmit.__tbRestCanonical101057=true;
  robustQuestionnaireSubmit.__tbQuestionnaireAttempt7=true;

  async function robustWeeklySubmit(){
    const request=window.TeamBullsWeeklyReportIntegrity?.submissionRequest?.();
    const uid=studentUid();if(!request||!uid||request.studentId!==uid||!request.pending){notify('Abra o relatório atualizado antes de enviar.',true);return false;}
    const pending=await reconcileWeeklyPending();if(pending!==null)return pending;
    const weight=Number(String(document.getElementById('weekly-checkin-weight')?.value||'').replace(',','.'));if(!Number.isFinite(weight)||weight<20||weight>500){alert('Informe um peso válido entre 20 e 500 kg.');return;}
    const areas=[...document.querySelectorAll('[data-weekly-question]')],answers=areas.map(area=>area.value.normalize('NFKC').trim());if(answers.some(answer=>!answer)){alert('Responda todas as perguntas do relatório semanal.');return;}
    const files=WEEKLY_CHECKIN_FILES.slice();
    if(files.length!==6||files.some(file=>!(file instanceof File))){alert('Envie obrigatoriamente as seis fotos: frente, costas, lado direito, lado esquerdo, frente contraída e costas contraída.');return;}
    const checkinId=weeklyCheckinDocId(uid,request.documentKey||request.requestKey);
    const uncertainState=await uncertainWeekly(checkinId);
    if(uncertainState==='confirmed'){notify('✓ O relatório semanal anterior foi confirmado pelo servidor.');try{await loadWeeklyCheckinState(true);renderCalendar();}catch(error){}return true;}
    if(uncertainState==='wait'){notify('Este relatório semanal ainda está em confirmação. Não envie novamente agora.',true);return false;}
    if(!beginAction('weekly-checkin-submit','modal-weekly-checkin'))return;
    try{
      if(navigator.onLine===false)throw Object.assign(new Error('Sem conexão com a internet.'),{code:'team-bulls/offline',definite:true});
      /* Não faça GET de weeklyCheckins/{checkinId} antes do create. Quando o documento
         ainda não existe, as Rules de leitura não têm resource.data.studentId para
         provar a propriedade e o Firestore responde permission-denied. A precondição
         currentDocument.exists:false do commit já impede duplicação sem abrir regra. */
      const {questions,sectionAt}=buildWeeklyCheckinQuestions(),photoIds=[],writes=[];
      for(let index=0;index<6;index++){
        notify('Preparando foto '+(index+1)+' de 6...');
        const photoId=(checkinId+'-p'+(index+1)).slice(0,190);photoIds.push(photoId);
        const prepared=await preparePhoto(files[index],{userId:uid,extra:{weight:Math.round(weight*10)/10,checkinId,pose:CHECKIN_POSES[index]}});writes.push(createWrite('progressPhotos',photoId,prepared.data));
      }
      const checkinData={studentId:uid,requestKey:request.requestKey,requestKind:request.kind,dueDate:request.dueDate,submittedDate:typeof today==='function'?today():new Date().toISOString().slice(0,10),weight:Math.round(weight*10)/10,questions,sectionAt,answers,photoIds};
      if(answers.length!==questions.length)throw Object.assign(new Error('As perguntas mudaram. Abra o relatório novamente.'),{definite:true});
      if(studentUid()!==uid)throw Object.assign(new Error('A sessão mudou. Entre novamente antes de enviar.'),{definite:true});
      writes.push(createWrite('weeklyCheckins',checkinId,checkinData));
      try{await restCommit(writes,'enviar relatório semanal');}
      catch(error){
        if(!error?.definite){uncertain.set('w:'+checkinId,{until:Date.now()+UNCERTAIN_RETRY_DELAY,writes});await sleep(1200);try{if(await confirmWeeklyAttempt(checkinId,uncertain.get('w:'+checkinId))){uncertain.delete('w:'+checkinId);error=null;}}catch(confirmError){}if(error)throw error;}
        else{throw error;}
      }
      uncertain.delete('w:'+checkinId);
      weeklyReceipt=Object.freeze({studentId:uid,sourceId:checkinId});
      if(typeof clearWeeklyCheckinPreviews==='function')clearWeeklyCheckinPreviews();
      try{WEEKLY_CHECKIN_FILES=Array(6).fill(null);}catch(error){}
      if(typeof closeModal==='function')closeModal('modal-weekly-checkin');notify('✓ Relatório semanal enviado e confirmado com 6 fotos');
      try{await loadWeeklyCheckinState(true);}catch(error){}try{renderCalendar();}catch(error){}
      return true;
    }catch(error){
      console.warn('[Team Bulls] envio canônico do relatório semanal falhou',error?.code||error?.message||error);
      notify(friendly(error),true);return false;
    }finally{endAction('weekly-checkin-submit','modal-weekly-checkin');}
  }
  robustWeeklySubmit.__tbRestCanonical101057=true;
  robustWeeklySubmit.__tbWeeklyAttempt6=true;

  function unwrapBridge(fn){let current=fn;for(let i=0;i<5&&current?.__tbActivityBridge101047&&current.__tbBase;i++)current=current.__tbBase;return current;}
  function installPendingCheck(){
    try{if(typeof checkQuestionnaires!=='function')return false;if(checkQuestionnaires.__tbSubmitState1010577){installedPending=true;return true;}let base=checkQuestionnaires;while(base.__tbSubmitState101057&&base.__tbBase)base=base.__tbBase;const wrapped=async function(){if(!student())return base.apply(this,arguments);try{return(await reconcileQuestionnaires()).pending;}catch(error){return base.apply(this,arguments);}};wrapped.__tbSubmitState101057=true;wrapped.__tbSubmitState1010577=true;wrapped.__tbBase=base;checkQuestionnaires=wrapped;installedPending=true;return true;}catch(error){return false;}
  }
  function installQuestionnaireSubmit(){
    try{
      if(typeof submitQuestionnaireAnswers!=='function')return false;
      const unwrapped=unwrapBridge(submitQuestionnaireAnswers);if(unwrapped?.__tbQuestionnaireAttempt7){installedQuestionnaire=true;return true;}
      submitQuestionnaireAnswers=robustQuestionnaireSubmit;installedQuestionnaire=true;return true;
    }catch(error){return false;}
  }
  function installWeeklySubmit(){
    try{
      if(typeof submitWeeklyCheckin!=='function')return false;
      const unwrapped=unwrapBridge(submitWeeklyCheckin);if(unwrapped?.__tbWeeklyAttempt6){installedWeekly=true;return true;}
      submitWeeklyCheckin=robustWeeklySubmit;installedWeekly=true;return true;
    }catch(error){return false;}
  }
  function reinstallActivityBridge(){try{window.TeamBullsStudentTrainerActivityBridge?.install?.();}catch(error){}}
  function install(){
    if(!student())return false;
    installPendingCheck();installQuestionnaireSubmit();installWeeklySubmit();reinstallActivityBridge();
    return installedPending&&installedQuestionnaire&&installedWeekly;
  }

  install();[120,500,1400].forEach(delay=>setTimeout(install,delay));
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('team-bulls-runtime-state',install);
  window.addEventListener('team-bulls-student-runtime-ready',install);
  window.addEventListener('pageshow',()=>{if(student()){install();reconcileQuestionnaires().catch(()=>{});}},{passive:true});

  window.TeamBullsStudentReportSubmitReconciliation=Object.freeze({version:VERSION,install,reconcile:reconcileQuestionnaires,reconcileWeeklyPending,weeklyReceipt:()=>weeklyReceipt,state:()=>({pending:installedPending,questionnaire:installedQuestionnaire,weekly:installedWeekly,uncertain:uncertain.size,transport:'firestore-rest-commit'})});
})();
