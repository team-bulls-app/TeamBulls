/* Team Bulls v10.10.58 — integridade do ciclo semanal sem reescrever histórico. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_WEEKLY_REPORT_INTEGRITY_1010584__)return;
  window.__TEAM_BULLS_WEEKLY_REPORT_INTEGRITY_1010584__=true;

  const VERSION='10.10.58-weeklyintegrity4';
  const READ_TIMEOUT=10000;
  let fetchInstalled=false;
  let formRequest=null,submissionRequest=null,opening=false;
  let submitInstalled=false;
  let suppressedDuplicates=0;
  let suppressedLegacyDuplicates=0;
  let recoveredDates=0;
  let recoveredRequestKeys=0;

  const student=()=>{try{return CURRENT_USER?.role==='student'&&MODE==='cloud'&&!!db&&!!auth?.currentUser;}catch(error){return false;}};
  const stampMs=value=>{try{if(value?.toMillis)return value.toMillis();if(value?.toDate)return value.toDate().getTime();if(value?.seconds)return Number(value.seconds)*1000;return 0;}catch(error){return 0;}};
  const isoDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):'';
  const localStampDate=value=>{try{
    const date=value?.toDate?.()||(value?.seconds?new Date(Number(value.seconds)*1000):null);
    if(!(date instanceof Date)||Number.isNaN(date.getTime()))return'';
    return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
  }catch(error){return'';}};
  const timeout=(task,ms=READ_TIMEOUT,label='confirmar relatório semanal')=>new Promise((resolve,reject)=>{
    let settled=false;
    const timer=setTimeout(()=>{if(settled)return;settled=true;const error=new Error('Tempo esgotado: '+label);error.code='team-bulls/weekly-integrity-timeout';reject(error);},Math.max(500,Number(ms)||READ_TIMEOUT));
    Promise.resolve(task).then(value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);},error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);});
  });
  const notify=(message,isError=false)=>{try{if(typeof showToast==='function')showToast(message,!!isError);else console[isError?'warn':'info']('[Team Bulls]',message);}catch(error){}};

  function effectiveSubmittedDate(row){
    // createdAt é timestamp do servidor e representa quando o documento realmente
    // entrou no Firestore. Ele corrige históricos em que submittedDate ficou preso
    // no período anterior (ex.: envio feito dia 20 ainda exibido como dia 14).
    return localStampDate(row?.createdAt)||isoDate(row?.submittedDate)||isoDate(row?.dueDate);
  }
  function normalizeWeeklyRow(row){
    if(!row||typeof row!=='object')return row;
    const stored=isoDate(row.submittedDate),effective=effectiveSubmittedDate(row);
    if(!effective||effective===stored)return row;
    recoveredDates++;
    return{...row,_storedSubmittedDate:stored,_weeklyDateRecovered:true,submittedDate:effective};
  }
  function logicalKey(row){
    const requestKey=String(row?.requestKey||'').trim();
    if(!requestKey)return'';
    return String(row?.studentId||'')+'\u0000'+requestKey;
  }
  function legacyFingerprint(row){

    const photos=Array.isArray(row?.photoIds)?row.photoIds.map(value=>String(value||'')):[];
    if(photos.length!==6||photos.some(value=>!value))return'';
    const date=effectiveSubmittedDate(row);if(!date)return'';
    const answers=JSON.stringify([row?.requestKey||'',row?.requestKind||'scheduled',row?.questions||[],row?.sectionAt||{},row?.answers||[]]);
    return[String(row?.studentId||''),date,isoDate(row?.dueDate),String(Number(row?.weight)||0),photos.join('\u0001'),answers].join('\u0000');
  }
  function prefer(candidate,current){
    const candidateCreated=stampMs(candidate?.createdAt),currentCreated=stampMs(current?.createdAt);
    if(candidateCreated!==currentCreated)return candidateCreated>currentCreated;
    const candidateSubmitted=String(candidate?.submittedDate||''),currentSubmitted=String(current?.submittedDate||'');
    if(candidateSubmitted!==currentSubmitted)return candidateSubmitted>currentSubmitted;
    return String(candidate?.id||'')>String(current?.id||'');
  }
  function dedupeWeeklyCheckins(rows){
    const source=(Array.isArray(rows)?rows:[]).map(normalizeWeeklyRow),result=[],positions=new Map(),legacyPositions=new Map();
    let suppressed=0,legacySuppressed=0;
    for(const row of source){
      const key=logicalKey(row)&&legacyFingerprint(row)?logicalKey(row)+'\u0000'+legacyFingerprint(row):'';
      if(key){
        const position=positions.get(key);
        if(position===undefined){positions.set(key,result.length);result.push(row);continue;}
        suppressed++;
        if(prefer(row,result[position]))result[position]=row;
        continue;
      }
      // Sem requestKey não inferimos identidade apenas por data/peso. Só ocultamos
      // duplicata legada quando os seis photoIds e o restante do fingerprint batem.
      const legacyKey=legacyFingerprint(row);
      if(!legacyKey){result.push(row);continue;}
      const position=legacyPositions.get(legacyKey);
      if(position===undefined){legacyPositions.set(legacyKey,result.length);result.push(row);continue;}
      legacySuppressed++;
      if(prefer(row,result[position]))result[position]=row;
    }
    suppressedDuplicates=suppressed;
    suppressedLegacyDuplicates=legacySuppressed;
    return result.sort((a,b)=>String(b?.submittedDate||'').localeCompare(String(a?.submittedDate||''))||stampMs(b?.createdAt)-stampMs(a?.createdAt)||String(b?.id||'').localeCompare(String(a?.id||'')));
  }
  function historyForRequestCalculation(rows){
    let recovered=0;
    const prepared=(Array.isArray(rows)?rows:[]).map(row=>{
      if(String(row?.requestKey||'').trim())return row;
      if(String(row?.requestKind||'scheduled')==='manual')return row;
      const due=isoDate(row?.dueDate);if(!due)return row;
      recovered++;
      return{...row,requestKey:'scheduled:'+due,_weeklyRequestKeyRecovered:true};
    });
    recoveredRequestKeys=recovered;
    return prepared;
  }

  function canonicalRequest(schedule,rows){
    if(!schedule||schedule.enabled===false||!isoDate(schedule.nextDueDate))return null;
    const history=historyForRequestCalculation((rows||[]).map(normalizeWeeklyRow));
    const completed=new Set(history.map(row=>String(row.requestKey||'')));
    const manualKey='manual:'+String(schedule.extraRequestId||'');
    if(schedule.extraRequestId&&!completed.has(manualKey))return{kind:'manual',requestId:String(schedule.extraRequestId),dueDate:String(schedule.extraRequestedAt||today()),requestKey:manualKey,pending:true};
    const scheduled=history.filter(row=>row.requestKind!=='manual'&&isoDate(row.submittedDate)).sort((a,b)=>b.submittedDate.localeCompare(a.submittedDate));
    const last=scheduled[0],interval=Math.max(1,Math.min(31,Number(schedule.intervalDays)||7));
    let due=String(schedule.nextDueDate);
    if(last){
      // A saved, unfulfilled future date is an explicit trainer reschedule.
      // Otherwise count from the actual submission, never from an early duplicate's dueDate.
      if(!(due>last.submittedDate&&!completed.has('scheduled:'+due)))due=addDaysIso(last.submittedDate,interval);
    }
    const requestKey='scheduled:'+due;
    const occupied=history.filter(row=>row.requestKey===requestKey);
    const recovery=occupied.length>0&&occupied.every(row=>isoDate(row.submittedDate)&&row.submittedDate<due);
    if(occupied.length&&!recovery)return null;
    return{kind:'scheduled',requestId:'',dueDate:due,requestKey,pending:due<=today(),...(recovery?{documentKey:requestKey+':recovery:v1',recovery:true}:{})};
  }
  function installRequestGuard(){
    if(typeof computeCheckinRequest!=='function')return;
    computeCheckinRequest=canonicalRequest;
  }
  const identity=request=>request?[request.kind,request.requestKey,request.dueDate,request.documentKey||request.requestKey].join('|'):'';
  function installOpenGuard(){
    if(typeof openWeeklyCheckinModal!=='function'||openWeeklyCheckinModal.__tbWeeklyForm4)return;
    const base=openWeeklyCheckinModal;
    const wrapped=async function(){
      if(!student()||opening||submissionRequest)return false;
      if(formRequest&&document.getElementById('modal-weekly-checkin')?.classList.contains('open'))return false;
      opening=true;formRequest=null;
      try{
        const pending=await window.TeamBullsStudentReportSubmitReconciliation?.reconcileWeeklyPending?.();
        if(pending===true||pending===false)return pending;
        const uid=String(CURRENT_USER.uid),request=await refreshCanonicalRequest(uid);
        if(!request.pending){notify('O próximo relatório estará disponível em '+request.dueDate+'. Para um envio adicional, peça um relatório extra ao treinador.');return false;}
        formRequest=Object.freeze({...request,studentId:uid});
        return base.apply(this,arguments);
      }catch(error){formRequest=null;notify('Não foi possível confirmar a solicitação no servidor. Tente abrir o relatório novamente.',true);return false;}
      finally{opening=false;}
    };
    wrapped.__tbWeeklyForm4=true;wrapped.__tbBase=base;openWeeklyCheckinModal=wrapped;
  }

  function unwrapFetchGuard(fn){
    let current=fn;
    for(let index=0;index<6&&current?.__tbWeeklyIntegrity101058&&current.__tbBase;index++)current=current.__tbBase;
    return current;
  }
  function installFetchGuard(){
    try{
      if(typeof fetchWeeklyCheckins!=='function')return false;
      if(fetchWeeklyCheckins.__tbWeeklyIntegrity1010584){fetchInstalled=true;return true;}
      const base=unwrapFetchGuard(fetchWeeklyCheckins);
      const wrapped=async function(){return dedupeWeeklyCheckins(await base.apply(this,arguments));};
      wrapped.__tbWeeklyIntegrity101058=true;
      wrapped.__tbWeeklyIntegrity1010584=true;
      wrapped.__tbBase=base;
      fetchWeeklyCheckins=wrapped;
      fetchInstalled=true;
      return true;
    }catch(error){return false;}
  }

  async function strictServerGet(reference,label){
    if(!reference?.get)throw new Error('Consulta semanal indisponível.');
    return timeout(reference.get({source:'server'}),READ_TIMEOUT,label);
  }
  async function refreshCanonicalRequest(uid){
    if(!uid||typeof computeCheckinRequest!=='function')throw new Error('Não foi possível validar o período atual do relatório.');
    const [scheduleDoc,historySnap]=await Promise.all([
      strictServerGet(db.collection('checkinSchedules').doc(uid),'confirmar programação semanal'),
      strictServerGet(db.collection('weeklyCheckins').where('studentId','==',uid),'confirmar histórico semanal')
    ]);
    if(CURRENT_USER?.uid!==uid||auth?.currentUser?.uid!==uid)throw new Error('A sessão do aluno mudou durante a confirmação.');
    if(!scheduleDoc?.exists)throw new Error('A programação semanal não está mais disponível.');
    const schedule={...scheduleDoc.data(),studentId:uid};
    const history=dedupeWeeklyCheckins((historySnap?.docs||[]).map(doc=>({...doc.data(),id:doc.id})));
    const requestHistory=historyForRequestCalculation(history);
    const request=computeCheckinRequest(schedule,requestHistory);
    if(!request||!String(request.requestKey||'').trim())throw new Error('Não há uma solicitação semanal válida para enviar agora.');
    WEEKLY_CHECKIN_SCHEDULE=schedule;
    WEEKLY_CHECKINS=history;
    WEEKLY_CHECKIN_REQUEST=request;
    WEEKLY_CHECKIN_STATE_UID=uid;
    return request;
  }

  function unwrapSubmit(fn){
    let current=fn;
    for(let index=0;index<8;index++){
      if(current?.__tbActivityBridge101047&&current.__tbBase){current=current.__tbBase;continue;}
      if(current?.__tbWeeklyIntegrity101058&&!current?.__tbWeeklyIntegrity1010584&&current.__tbBase){current=current.__tbBase;continue;}
      break;
    }
    return current;
  }
  function installSubmitGuard(){
    try{
      if(!student()||typeof submitWeeklyCheckin!=='function')return false;
      let current=submitWeeklyCheckin;
      if(current?.__tbActivityBridge101047&&current.__tbBase?.__tbWeeklyIntegrity1010584){submitInstalled=true;return true;}
      if(current?.__tbWeeklyIntegrity1010584){submitInstalled=true;return true;}
      const base=unwrapSubmit(current);
      // Só envolvemos o submit canônico corrigido. Assim um runtime antigo não
      // recebe um selo falso de compatibilidade nem volta a escrever pelo fluxo legado.
      if(typeof base!=='function'||base.__tbRestCanonical101057!==true)return false;
      const wrapped=async function(){
        const uid=String(CURRENT_USER?.uid||'');
        if(!student()||!uid)return base.apply(this,arguments);
        if(navigator.onLine===false){notify('Sem conexão. O relatório não foi enviado.',true);return false;}
        if(wrapped.busy)return false;
        wrapped.busy=true;
        try{
        const pending=await window.TeamBullsStudentReportSubmitReconciliation?.reconcileWeeklyPending?.();
        if(pending===true||pending===false)return pending;
        const opened=formRequest;
        if(!opened||opened.studentId!==uid){notify('Abra o relatório novamente antes de enviar.',true);return false;}
        try{
          const fresh=await refreshCanonicalRequest(uid);
          if(!fresh.pending||identity(opened)!==identity(fresh)){formRequest=null;notify('Esta solicitação já foi atendida ou mudou. Suas respostas não foram enviadas para outro período. Feche e abra o relatório novamente.',true);return false;}
          submissionRequest=Object.freeze({...fresh,studentId:uid});
        }catch(error){
          console.warn('[Team Bulls] envio semanal bloqueado por estado não confirmado',error?.code||error?.message||error);
          notify('Não foi possível confirmar o período atual do relatório no servidor. Nenhum envio foi feito; atualize o app e tente novamente.',true);
          return false;
        }
        const result=await base.apply(this,arguments);
        if(result===true)formRequest=null;
        return result;
        }finally{submissionRequest=null;wrapped.busy=false;}
      };
      wrapped.__tbWeeklyIntegrity101058=true;
      wrapped.__tbWeeklyIntegrity1010584=true;
      // O reconciliador reconhece este wrapper como continuação do submit REST,
      // evitando que seus timers o substituam pelo caminho sem o preflight fresco.
      wrapped.__tbRestCanonical101057=true;
      wrapped.__tbWeeklyAttempt6=base.__tbWeeklyAttempt6;
      wrapped.__tbBase=base;
      submitWeeklyCheckin=wrapped;
      submitInstalled=true;
      try{window.TeamBullsStudentTrainerActivityBridge?.install?.();}catch(error){}
      return true;
    }catch(error){return false;}
  }

  function install(){
    installRequestGuard();
    installFetchGuard();
    installOpenGuard();
    if(student())installSubmitGuard();
    return fetchInstalled&&(!student()||submitInstalled);
  }

  install();
  [120,500,1400].forEach(delay=>setTimeout(install,delay));
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('team-bulls-runtime-state',install);
  window.addEventListener('team-bulls-student-runtime-ready',install);
  window.addEventListener('team-bulls-intelligence-ready',install);
  window.addEventListener('pageshow',install,{passive:true});

  window.TeamBullsWeeklyReportIntegrity=Object.freeze({
    version:VERSION,
    install,
    dedupe:dedupeWeeklyCheckins,
    effectiveSubmittedDate,
    fingerprint:legacyFingerprint,
    canOpenForm:()=>!!formRequest&&student()&&formRequest.studentId===CURRENT_USER.uid,
    submissionRequest:()=>submissionRequest,
    state:()=>({fetchInstalled,submitInstalled,suppressedDuplicates,suppressedLegacyDuplicates,recoveredDates,recoveredRequestKeys})
  });
})();
