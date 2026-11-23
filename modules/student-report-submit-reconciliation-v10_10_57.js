/* Team Bulls v10.10.57 — envio canônico resiliente de relatórios sem depender da fila interna do Firestore Web SDK. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_STUDENT_REPORT_SUBMIT_RECONCILIATION_1010579__)return;
  window.__TEAM_BULLS_STUDENT_REPORT_SUBMIT_RECONCILIATION_1010579__=true;

  const VERSION='10.10.57-submitstate12';
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
    const method=String(options.method||'GET').toUpperCase(),readOnly=method==='GET'||method==='POST'&&String(url).endsWith(':runQuery');
    const user=typeof auth==='undefined'?null:auth?.currentUser,started=Date.now();
    try{return await fetchJsonOnce(url,options,timeoutMs,label);}
    catch(error){
      const transient=[408,500,502,503,504].includes(error?.status)||['team-bulls/rest-network','team-bulls/rest-timeout'].includes(error?.code);
      // Retry one failed-fast read, never a commit, permission denial or a long timeout.
      if(!readOnly||!transient||Date.now()-started>1500||navigator.onLine===false||!user||auth?.currentUser!==user)throw error;
      return fetchJsonOnce(url,options,timeoutMs,label);
    }
  }
  async function fetchJsonOnce(url,options={},timeoutMs=REST_GET_TIMEOUT,label='comunicação com Firestore'){
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

  async function restGet(collection,id,headers=null){
    headers??=await authHeaders();
    try{return await fetchJson(documentUrl(collection,id),{method:'GET',headers},REST_GET_TIMEOUT,'consulta do relatório');}
    catch(error){if(error?.status===404)return null;throw error;}
  }
  function decodeRestReportFields(fields){
    const decode=value=>{
      if(!value||'nullValue' in value)return null;
      if('integerValue' in value)return Number(value.integerValue);
      if('doubleValue' in value)return Number(value.doubleValue);
      if('timestampValue' in value){
        const millis=Date.parse(value.timestampValue);
        return {toMillis:()=>millis,toDate:()=>new Date(millis)};
      }
      if('arrayValue' in value)return (value.arrayValue.values||[]).map(decode);
      if('mapValue' in value)return decodeRestReportFields(value.mapValue.fields);
      return value.stringValue??value.booleanValue??null;
    };
    return Object.fromEntries(Object.entries(fields||{}).map(([key,value])=>[key,decode(value)]));
  }

  async function readWeeklyPeriod(uid){
    const user=auth?.currentUser;
    const assertOwner=()=>{
      if(!uid||studentUid()!==uid||user?.uid!==uid||auth?.currentUser!==user)
        throw new Error('A sessão do aluno mudou durante a confirmação.');
    };
    assertOwner();
    const headers=await authHeaders();
    assertOwner();
    let schedule;
    try{schedule=await fetchJson(documentUrl('checkinSchedules',uid),{method:'GET',headers},REST_GET_TIMEOUT,'confirmar programação semanal');}
    catch(error){if(error?.status===404)return{schedule:null,history:[]};throw error;}
    assertOwner();
    const url='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(projectId())+'/databases/(default)/documents:runQuery';
    const body=JSON.stringify({structuredQuery:{
      from:[{collectionId:'weeklyCheckins'}],
      where:{fieldFilter:{field:{fieldPath:'studentId'},op:'EQUAL',value:{stringValue:uid}}}
    }});
    const rows=await fetchJson(url,{method:'POST',headers,body},REST_GET_TIMEOUT,'confirmar histórico semanal');
    assertOwner();
    if(!Array.isArray(rows))throw new Error('O histórico semanal não foi confirmado pelo servidor.');
    const monthlyBody=JSON.stringify({structuredQuery:{from:[{collectionId:'questionnaires'}],
      where:{compositeFilter:{op:'AND',filters:[
        {fieldFilter:{field:{fieldPath:'studentId'},op:'EQUAL',value:{stringValue:uid}}},
        {fieldFilter:{field:{fieldPath:'reportType'},op:'EQUAL',value:{stringValue:'monthly'}}}
      ]}}}});
    const [protocol,monthlyRows]=await Promise.all([
      restGet('protocolReviewSchedules',uid,headers),
      fetchJson(url,{method:'POST',headers,body:monthlyBody},REST_GET_TIMEOUT,'confirmar histórico mensal')
    ]);
    assertOwner();
    if(!Array.isArray(monthlyRows))throw new Error('O histórico mensal não foi confirmado pelo servidor.');
    const decodeRows=list=>list.filter(row=>row.document).map(({document})=>({
      ...decodeRestReportFields(document.fields),id:document.name.split('/').at(-1)
    }));
    return {schedule:decodeRestReportFields(schedule.fields),history:decodeRows(rows),
      protocolSchedule:protocol?{...decodeRestReportFields(protocol.fields),studentId:uid}:null,monthlyReports:decodeRows(monthlyRows)};
  }

  async function restCommit(writes,label,scope){
    let headers;
    try{headers=await authHeaders();assertReportScope(scope);}
    catch(error){error.definite=true;throw error;}
    const payload=JSON.stringify({writes});
    if(payload.length>MAX_COMMIT_BODY)throw Object.assign(new Error('As fotos ainda estão grandes demais para um envio seguro. Selecione-as novamente para nova otimização.'),{code:'team-bulls/report-payload-too-large',definite:true});
    try{
      const result=await fetchJson(commitUrl(),{method:'POST',headers,body:payload},REST_COMMIT_TIMEOUT,label);
      if(result.writeResults?.length!==writes.length||!result.commitTime)throw Object.assign(new Error('Resposta de entrega incompleta.'),{definite:false});
    }catch(error){
      if(error.status>=500||error.status===408||error.status===429)error.definite=false;
      throw error;
    }
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

  async function reconcileQuestionnaires({submittedId='',announce=false,knownDelivered=false}={}){
    const scope=reportScope(),uid=scope.uid;if(!scope.current())return{confirmed:false,pending:[]};
    let confirmed=knownDelivered;
    if(submittedId&&!knownDelivered){
      try{confirmed=restAnswered(await restGet('questionnaires',submittedId));}
      catch(error){console.warn('[Team Bulls] confirmação REST do relatório ainda indisponível',error?.code||error?.message||error);}
    }
    let pending=[];try{pending=await pendingQuestionnaires(uid);if(!scope.current())return{confirmed:false,pending:[]};if(confirmed)pending=pending.filter(row=>row.id!==submittedId);renderPendingBanner(pending);}catch(error){console.warn('[Team Bulls] reconciliação de pendências indisponível',error?.code||error?.message||error);}
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
  function reportScope(uid=studentUid()){
    const user=auth?.currentUser,revision=typeof AUTH_STATE_REVISION==='number'?AUTH_STATE_REVISION:null;
    return {uid,current:()=>!!uid&&studentUid()===uid&&auth?.currentUser===user&&user?.uid===uid&&(revision===null||revision===AUTH_STATE_REVISION)};
  }
  function assertReportScope(scope){
    if(!scope.current())throw Object.assign(new Error('A sessão do aluno mudou.'),{definite:true});
  }
  async function readWeeklyReceipt(id,scope,headers){
    const field=(fieldPath,value)=>({fieldFilter:{field:{fieldPath},op:'EQUAL',value}});
    const url='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(projectId())+'/databases/(default)/documents:runQuery';
    const name=documentName('weeklyCheckins',id);
    const body=JSON.stringify({structuredQuery:{from:[{collectionId:'weeklyCheckins'}],where:{compositeFilter:{op:'AND',filters:[
      field('studentId',{stringValue:scope.uid}),field('__name__',{referenceValue:name})
    ]}},limit:1}});
    assertReportScope(scope);
    const rows=await fetchJson(url,{method:'POST',headers,body},REST_GET_TIMEOUT,'consultar envio semanal');
    // A resposta vazia de runQuery contém readTime. Um retorno truncado não prova ausência.
    if(!Array.isArray(rows)||!rows.some(row=>row?.readTime||row?.document))throw new Error('A consulta da entrega semanal não foi confirmada.');
    return rows.find(row=>row.document?.name===name)?.document||null;
  }
  async function confirmReportAttempt(attempt){
    const {kind,id,writes,scope}=attempt;
    assertReportScope(scope);
    const headers=await authHeaders();
    assertReportScope(scope);
    const parent=kind==='q'?await restGet('questionnaires',id,headers):await readWeeklyReceipt(id,scope,headers);
    assertReportScope(scope);
    if(!parent)return 'absent';
    const expected=writes.at(-1).update;
    if(parent.name!==expected.name||parent.fields?.studentId?.stringValue!==scope.uid)throw new Error('A entrega não pertence ao aluno atual.');
    if(kind==='q'&&!restAnswered(parent))return 'absent';
    if(!sameRestFields(expected.fields,parent.fields))return 'registered';
    try{
      const verified=await Promise.all(writes.slice(0,-1).map(async write=>{
        const photoId=write.update.name.split('/').at(-1);
        const doc=await restGet('progressPhotos',photoId,headers);
        return doc?.name===write.update.name&&sameRestFields(write.update.fields,doc.fields);
      }));
      assertReportScope(scope);
      return verified.every(Boolean)?'confirmed':'registered';
    }catch(error){
      assertReportScope(scope);
      // O relatório canônico está entregue. Se a leitura das fotos falhar,
      // reportamos apenas a entrega, sem atribuir as fotos a esta tentativa.
      return 'registered';
    }
  }
  function receiptScope(attempt){return{owner:attempt.scope.uid,kind:'receipt',subject:attempt.scope.uid,id:'report:'+attempt.kind+':'+attempt.id};}
  async function rememberAttempt(attempt,status='pending'){
    try{return await window.TeamBullsWorkflowStorage?.put?.(receiptScope(attempt),{source:'report',reportKind:attempt.kind,recordId:attempt.id,status,until:attempt.until||Date.now()+UNCERTAIN_RETRY_DELAY,...(status==='confirmed'?{}:{writes:attempt.writes})});}catch{return null;}
  }
  async function recoverAttempts(){
    const scope=reportScope();if(!scope.current())return[];
    const records=await window.TeamBullsWorkflowStorage?.list?.('receipt')||[];
    if(!scope.current())return[];
    for(const metadata of records){
      if(metadata.source!=='report'||metadata.status!=='pending')continue;
      const record=await window.TeamBullsWorkflowStorage.get(metadata);if(!scope.current())return[];if(!record)continue;
      if(record.source!=='report'||record.status!=='pending'||record.owner!==scope.uid||!['w','q'].includes(record.reportKind)||!Array.isArray(record.writes)||!record.writes.length)continue;
      const key=attemptKey(record.reportKind,record.recordId,scope.uid);
      if(!uncertain.has(key))uncertain.set(key,{kind:record.reportKind,id:record.recordId,key,scope,writes:record.writes,until:record.until||Date.now()+UNCERTAIN_RETRY_DELAY,viewCurrent:()=>false});
    }return records.filter(record=>record.source==='report').map(record=>({id:record.reportKind+':'+record.recordId,type:'report',label:record.reportKind==='w'?'Relatório semanal':'Relatório solicitado',status:record.status,date:new Date(record.updatedAt).toISOString().slice(0,10)}));
  }
  async function retryReceipt(id){
    await recoverAttempts();const scope=reportScope();if(!scope.current())return false;
    const attempt=uncertain.get(attemptKey(String(id).split(':')[0],String(id).slice(2),scope.uid));
    return attempt?checkAttempt(attempt):false;
  }

  const attemptKey=(kind,id,uid)=>kind+':'+uid+':'+id;
  const questionnaireOpen=id=>typeof CUR_ANSWER_QUEST_ID!=='undefined'&&CUR_ANSWER_QUEST_ID===id;
  function attemptButton(attempt){
    if(!attempt.scope.current()||(attempt.kind==='q'?!questionnaireOpen(attempt.id):!attempt.viewCurrent()))return null;
    return document.getElementById(attempt.kind==='q'?'questionnaire-submit-button':'weekly-checkin-submit-button');
  }
  function showVerification(attempt){
    const button=attemptButton(attempt);
    if(button)button.textContent='VERIFICAR ENVIO';
  }
  function refreshWeeklyAfterDelivery(){
    return Promise.resolve().then(()=>loadWeeklyCheckinState(true)).then(()=>renderCalendar()).catch(()=>{});
  }
  async function settleDelivery(attempt,outcome,{previous=false}={}){
    const {kind,id,scope}=attempt;
    if(!scope.current())return false;
    await rememberAttempt(attempt,'confirmed');
    await window.TeamBullsWorkflowDrafts?.confirmed?.(kind==='q'?'modal-answer-quest':'modal-weekly-checkin');
    const button=attemptButton(attempt);
    if(button&&attempt.sendLabel)button.textContent=attempt.sendLabel;
    if(kind==='q'){
      if(questionnaireOpen(id)){
        if(typeof resetQuestionnaireReportPhotos==='function')resetQuestionnaireReportPhotos();
        CURRENT_ANSWER_REPORT=null;CUR_ANSWER_QUEST_ID=null;
        if(typeof closeModal==='function')closeModal('modal-answer-quest');
      }
      hideSubmittedBanner(id);
      void reconcileQuestionnaires({submittedId:id,knownDelivered:true});
    }else{
      if(outcome==='confirmed')weeklyReceipt=Object.freeze({studentId:scope.uid,sourceId:id});
      if(attempt.viewCurrent()){
        if(typeof clearWeeklyCheckinPreviews==='function')clearWeeklyCheckinPreviews();
        WEEKLY_CHECKIN_FILES=Array(6).fill(null);
        if(typeof closeModal==='function')closeModal('modal-weekly-checkin');
      }
      void refreshWeeklyAfterDelivery();
    }
    notify(outcome==='registered'?'O relatório já consta como enviado. Confira a entrega no histórico.':previous?'✓ O envio anterior foi confirmado pelo servidor.':'✓ Relatório enviado e confirmado.');
    return outcome==='confirmed';
  }
  async function checkAttempt(attempt,{quiet=false}={}){
    if(!attempt.scope.current())return false;
    if(attempt.flight)return attempt.flight;
    const task=(async()=>{
      let result='wait';
      try{if(navigator.onLine!==false)result=await confirmReportAttempt(attempt);}catch(error){}
      if(!attempt.scope.current())return false;
      if(result==='confirmed'||result==='registered'){
        uncertain.delete(attempt.key);
        return settleDelivery(attempt,result,{previous:true});
      }
      if(result==='absent'&&Date.now()>=attempt.until){
        uncertain.delete(attempt.key);
        await rememberAttempt(attempt,'retry-available');
        const button=attemptButton(attempt);
        if(button&&attempt.sendLabel)button.textContent=attempt.sendLabel;
        if(!quiet)notify('O servidor confirmou que o relatório continua pendente. As fotos e respostas seguem no formulário. Toque em Enviar para tentar novamente.');
        return false;
      }
      showVerification(attempt);
      if(!quiet)notify(result==='absent'?'O envio ainda pode estar em andamento. Aguarde um pouco e toque em Verificar envio.':'A confirmação está indisponível. As fotos e respostas seguem no formulário. Toque em Verificar envio quando a conexão voltar.',true);
      return false;
    })().finally(()=>{attempt.flight=null;});
    attempt.flight=task;
    return task;
  }
  async function reconcileWeeklyPending(){
    const uid=studentUid();
    for(const attempt of uncertain.values()){
      if(attempt.kind==='w'&&attempt.scope.uid===uid&&attempt.scope.current())return checkAttempt(attempt);
    }
    return null;
  }
  async function deliver(attempt){
    await rememberAttempt(attempt);
    try{
      await restCommit(attempt.writes,attempt.kind==='q'?'enviar relatório':'enviar relatório semanal',attempt.scope);
    }catch(error){
      if(error?.definite!==false||!attempt.scope.current())throw error;
      attempt.until=Date.now()+UNCERTAIN_RETRY_DELAY;
      uncertain.set(attempt.key,attempt);
      showVerification(attempt);
      return checkAttempt(attempt);
    }
    return settleDelivery(attempt,'confirmed');
  }
  async function robustQuestionnaireSubmit(){
    const reportId=String(typeof CUR_ANSWER_QUEST_ID!=='undefined'?CUR_ANSWER_QUEST_ID||'':'');
    const report=typeof CURRENT_ANSWER_REPORT!=='undefined'?CURRENT_ANSWER_REPORT:null;
    const scope=reportScope(),uid=scope.uid;if(!reportId||!report||!scope.current())return;
    const key=attemptKey('q',reportId,uid),pending=uncertain.get(key);
    if(pending)return checkAttempt(pending);
    const mode=typeof v109ReportMode==='function'?v109ReportMode(report):String(report.requestMode||'full');
    const requiresAnswers=typeof v109ModeRequiresAnswers==='function'?v109ModeRequiresAnswers(mode):mode!=='photos';
    const requiresPhotos=typeof v109ModeRequiresPhotos==='function'?v109ModeRequiresPhotos(mode):mode!=='written';
    const areas=[...document.querySelectorAll('#quest-answer-form textarea')];
    const answers=requiresAnswers?areas.map(area=>area.value.normalize('NFKC').trim()):[];
    if(requiresAnswers){const missing=answers.findIndex(answer=>!answer);if(missing>=0){alert('Responda todas as perguntas antes de enviar o relatório.');areas[missing]?.focus();return;}if(answers.length!==(report.questions||[]).length){alert('O relatório foi alterado. Feche e abra novamente antes de responder.');return;}}
    if(requiresPhotos&&(QUESTIONNAIRE_REPORT_FILES.length!==6||QUESTIONNAIRE_REPORT_FILES.some(file=>!(file instanceof File)))){alert('Envie obrigatoriamente as seis fotos: frente, costas, lado direito, lado esquerdo, frente contraída e costas contraída.');return;}

    if(!beginAction('answer-questionnaire','modal-answer-quest'))return;
    try{
      if(navigator.onLine===false)throw Object.assign(new Error('Sem conexão com a internet.'),{code:'team-bulls/offline',definite:true});
      const fresh=await restGet('questionnaires',reportId);
      assertReportScope(scope);
      if(!questionnaireOpen(reportId))return false;
      if(!fresh)throw Object.assign(new Error('Este relatório não está mais disponível.'),{definite:true});
      const attempt={kind:'q',id:reportId,key,scope,sendLabel:document.getElementById('questionnaire-submit-button')?.textContent};
      if(fresh.fields?.studentId?.stringValue===uid&&restAnswered(fresh))return settleDelivery(attempt,'registered');
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
      if(!scope.current()||!questionnaireOpen(reportId))throw new Error('A sessão ou o formulário mudou durante o preparo. Nenhum envio foi feito.');
      if(report.reportType==='monthly')await window.TeamBullsMonthlyReports.assertAvailable(report);
      writes.push(patchWrite('questionnaires',reportId,{answers,answered:true,photoIds},['answers','answered','photoIds'],'answeredAt'));
      writes[writes.length-1].currentDocument={updateTime:fresh.updateTime};
      if(!questionnaireOpen(reportId))return false;
      return await deliver({...attempt,writes});
    }catch(error){
      console.warn('[Team Bulls] envio canônico do questionário falhou',error?.code||error?.message||error);
      notify(friendly(error),true);return false;
    }finally{endAction('answer-questionnaire','modal-answer-quest');}
  }
  robustQuestionnaireSubmit.__tbRestCanonical101057=true;
  robustQuestionnaireSubmit.__tbQuestionnaireAttempt7=true;

  async function robustWeeklySubmit(){
    const scope=reportScope(),uid=scope.uid;
    const pending=await reconcileWeeklyPending();if(pending!==null)return pending;
    const request=window.TeamBullsWeeklyReportIntegrity?.submissionRequest?.();
    if(!request||!scope.current()||request.studentId!==uid||!request.pending){notify('Abra o relatório atualizado antes de enviar.',true);return false;}
    const weight=Number(String(document.getElementById('weekly-checkin-weight')?.value||'').replace(',','.'));if(!Number.isFinite(weight)||weight<20||weight>500){alert('Informe um peso válido entre 20 e 500 kg.');return;}
    const areas=[...document.querySelectorAll('[data-weekly-question]')],answers=areas.map(area=>area.value.normalize('NFKC').trim());if(answers.some(answer=>!answer)){alert('Responda todas as perguntas do relatório semanal.');return;}
    const selectedFiles=WEEKLY_CHECKIN_FILES,files=selectedFiles.slice();
    if(files.length!==6||files.some(file=>!(file instanceof File))){alert('Envie obrigatoriamente as seis fotos: frente, costas, lado direito, lado esquerdo, frente contraída e costas contraída.');return;}
    const checkinId=weeklyCheckinDocId(uid,request.documentKey||request.requestKey);
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
      if(!scope.current()||WEEKLY_CHECKIN_FILES!==selectedFiles)throw Object.assign(new Error('A sessão ou o formulário mudou durante o preparo.'),{definite:true});
      await window.TeamBullsWeeklyReportIntegrity?.assertSubmissionCurrent?.(request);
      writes.push(createWrite('weeklyCheckins',checkinId,checkinData));
      return await deliver({kind:'w',id:checkinId,key:attemptKey('w',checkinId,uid),scope,writes,
        viewCurrent:()=>typeof WEEKLY_CHECKIN_FILES!=='undefined'&&WEEKLY_CHECKIN_FILES===selectedFiles,
        sendLabel:document.getElementById('weekly-checkin-submit-button')?.textContent});
    }catch(error){
      console.warn('[Team Bulls] envio canônico do relatório semanal falhou',error?.code||error?.message||error);
      notify(friendly(error),true);return false;
    }finally{endAction('weekly-checkin-submit','modal-weekly-checkin');}
  }
  robustWeeklySubmit.__tbRestCanonical101057=true;
  robustWeeklySubmit.__tbWeeklyAttempt6=true;

  function hasSubmit(fn,target){
    const seen=new Set();
    while(typeof fn==='function'&&!seen.has(fn)){if(fn===target)return true;seen.add(fn);fn=fn.__tbBase;}
    return false;
  }
  function installPendingCheck(){
    try{if(typeof checkQuestionnaires!=='function')return false;if(checkQuestionnaires.__tbSubmitState1010579){installedPending=true;return true;}let base=checkQuestionnaires;while(base.__tbSubmitState101057&&base.__tbBase)base=base.__tbBase;const wrapped=async function(){if(!student())return base.apply(this,arguments);try{return(await reconcileQuestionnaires()).pending;}catch(error){return base.apply(this,arguments);}};wrapped.__tbSubmitState101057=true;wrapped.__tbSubmitState1010579=true;wrapped.__tbBase=base;checkQuestionnaires=wrapped;installedPending=true;return true;}catch(error){return false;}
  }
  function installQuestionnaireSubmit(){
    try{
      if(typeof submitQuestionnaireAnswers!=='function')return false;
      if(hasSubmit(submitQuestionnaireAnswers,robustQuestionnaireSubmit)){installedQuestionnaire=true;return true;}
      submitQuestionnaireAnswers=robustQuestionnaireSubmit;installedQuestionnaire=true;return true;
    }catch(error){return false;}
  }
  function installWeeklySubmit(){
    try{
      if(typeof submitWeeklyCheckin!=='function')return false;
      if(hasSubmit(submitWeeklyCheckin,robustWeeklySubmit)){installedWeekly=true;return true;}
      submitWeeklyCheckin=robustWeeklySubmit;installedWeekly=true;return true;
    }catch(error){return false;}
  }
  function reinstallActivityBridge(){try{window.TeamBullsStudentTrainerActivityBridge?.install?.();}catch(error){}}
  function install(){
    for(const [key,attempt] of uncertain)if(!attempt.scope.current())uncertain.delete(key);
    if(!student())return false;
    installPendingCheck();installQuestionnaireSubmit();installWeeklySubmit();
    window.TeamBullsWeeklyReportIntegrity?.install?.();
    reinstallActivityBridge();
    return installedPending&&installedQuestionnaire&&installedWeekly;
  }

  install();[120,500,1400].forEach(delay=>setTimeout(install,delay));
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('team-bulls-runtime-state',install);
  window.addEventListener('team-bulls-student-runtime-ready',install);
  function resumeConfirmations(){
    if(!student()||typeof navigator==='undefined'||navigator.onLine===false)return;
    for(const attempt of uncertain.values()){
      if(attempt.scope.current())void checkAttempt(attempt,{quiet:true}).catch(()=>{});
    }
  }
  window.addEventListener('pageshow',()=>{if(student()){install();resumeConfirmations();reconcileQuestionnaires().catch(()=>{});}},{passive:true});
  window.addEventListener('online',resumeConfirmations);
  if(typeof document!=='undefined')document.addEventListener?.('visibilitychange',()=>{
    if(document.visibilityState==='visible')resumeConfirmations();
  });

  window.TeamBullsStudentReportSubmitReconciliation=Object.freeze({version:VERSION,install,syncItems:recoverAttempts,retry:retryReceipt,reconcile:reconcileQuestionnaires,reconcileWeeklyPending,readWeeklyPeriod,weeklyReceipt:()=>weeklyReceipt,state:()=>({pending:installedPending,questionnaire:installedQuestionnaire,weekly:installedWeekly,uncertain:uncertain.size,transport:'firestore-rest-commit'})});
})();
