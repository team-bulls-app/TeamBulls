/* Team Bulls v10.10.54 — confirmação canônica dos envios e pendências do aluno. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_STUDENT_REPORT_SUBMIT_RECONCILIATION_101054__)return;
  window.__TEAM_BULLS_STUDENT_REPORT_SUBMIT_RECONCILIATION_101054__=true;

  const VERSION='10.10.54-submitstate1';
  const READ_TIMEOUT=8000;
  let installedQuestionnaire=false;
  let installedWeekly=false;
  let installedPending=false;

  const student=()=>{try{return CURRENT_USER?.role==='student'&&MODE==='cloud'&&!!db;}catch(error){return false;}};
  const studentUid=()=>student()?String(CURRENT_USER?.uid||''):'';
  const timeout=(task,label)=>typeof withTimeout==='function'?withTimeout(task,READ_TIMEOUT,label):Promise.race([Promise.resolve(task),new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error('Tempo esgotado: '+label),{code:'team-bulls/timeout'})),READ_TIMEOUT))]);
  const stampMs=value=>{try{if(value?.toMillis)return value.toMillis();if(value?.toDate)return value.toDate().getTime();if(value?.seconds)return Number(value.seconds)*1000;return 0;}catch(error){return 0;}};

  async function serverGet(reference,label){
    try{return await timeout(reference.get({source:'server'}),label);}
    catch(error){return timeout(reference.get(),label);}
  }

  async function pendingQuestionnaires(uid){
    if(!uid)return[];
    const snap=await serverGet(db.collection('questionnaires').where('studentId','==',uid).limit(100),'confirmar pendências');
    return(snap.docs||[])
      .map(doc=>({...doc.data(),id:doc.id}))
      .filter(report=>report.answered!==true)
      .sort((a,b)=>(stampMs(a.createdAt)-stampMs(b.createdAt))||String(a.id).localeCompare(String(b.id)));
  }

  function pendingLabel(count){return count===1?'1 atualização pendente':`${count} atualizações pendentes`;}
  function renderPendingBanner(pending){
    const banner=document.getElementById('quest-banner');
    if(!banner)return pending.length;
    const rows=Array.isArray(pending)?pending:[];
    if(!rows.length){
      banner.style.display='none';
      banner.dataset.qid='';
      banner.dataset.pendingCount='0';
      banner.querySelector('[data-tb-report-pending-count]')?.remove();
      return 0;
    }
    banner.dataset.qid=String(rows[0].id||'');
    banner.dataset.pendingCount=String(rows.length);
    banner.style.display='block';
    let note=banner.querySelector('[data-tb-report-pending-count]');
    if(!note){
      note=document.createElement('div');
      note.dataset.tbReportPendingCount='1';
      note.style.cssText='margin-top:6px;font-size:11px;opacity:.72;letter-spacing:.04em';
      banner.appendChild(note);
    }
    note.textContent=pendingLabel(rows.length);
    return rows.length;
  }

  async function reconcileQuestionnaires({submittedId='',announce=false}={}){
    const uid=studentUid();if(!uid)return{confirmed:false,pending:[]};
    let confirmed=false;
    if(submittedId){
      try{
        const snap=await serverGet(db.collection('questionnaires').doc(submittedId),'confirmar relatório enviado');
        confirmed=!!snap?.exists&&snap.data()?.answered===true;
      }catch(error){console.warn('[Team Bulls] confirmação do relatório ainda indisponível',error?.code||error?.message||error);}
    }
    let pending=[];
    try{pending=await pendingQuestionnaires(uid);renderPendingBanner(pending);}
    catch(error){console.warn('[Team Bulls] reconciliação de pendências indisponível',error?.code||error?.message||error);}
    if(announce&&submittedId&&typeof showToast==='function'){
      if(confirmed){
        showToast(pending.length?`✓ Relatório confirmado. Ainda há ${pendingLabel(pending.length)} diferente(s).`:'✓ Relatório confirmado. Nenhuma atualização pendente.');
      }else{
        showToast('O envio ainda não foi confirmado pelo servidor. O app não fará reenvio automático.',true);
      }
    }
    return{confirmed,pending};
  }

  function installPendingCheck(){
    try{
      if(typeof checkQuestionnaires!=='function')return false;
      if(checkQuestionnaires.__tbSubmitState101054){installedPending=true;return true;}
      const base=checkQuestionnaires;
      const wrapped=async function(){
        if(!student())return base.apply(this,arguments);
        try{
          const result=await reconcileQuestionnaires();
          return result.pending;
        }catch(error){return base.apply(this,arguments);}
      };
      wrapped.__tbSubmitState101054=true;wrapped.__tbBase=base;checkQuestionnaires=wrapped;installedPending=true;return true;
    }catch(error){return false;}
  }

  function installQuestionnaireSubmit(){
    try{
      if(typeof submitQuestionnaireAnswers!=='function')return false;
      if(submitQuestionnaireAnswers.__tbSubmitState101054){installedQuestionnaire=true;return true;}
      const base=submitQuestionnaireAnswers;
      const wrapped=async function(){
        const reportId=String(typeof CUR_ANSWER_QUEST_ID!=='undefined'?CUR_ANSWER_QUEST_ID||'':'');
        const result=await base.apply(this,arguments);
        if(student()&&reportId){
          const state=await reconcileQuestionnaires({submittedId:reportId,announce:true});
          if(state.confirmed&&document.getElementById('screen-my-quest')?.classList.contains('active')&&typeof openMyQuestionnaires==='function'){
            try{await openMyQuestionnaires();}catch(error){}
          }
        }
        return result;
      };
      wrapped.__tbSubmitState101054=true;wrapped.__tbBase=base;submitQuestionnaireAnswers=wrapped;installedQuestionnaire=true;return true;
    }catch(error){return false;}
  }

  function installWeeklySubmit(){
    try{
      if(typeof submitWeeklyCheckin!=='function')return false;
      if(submitWeeklyCheckin.__tbSubmitState101054){installedWeekly=true;return true;}
      const base=submitWeeklyCheckin;
      const wrapped=async function(){
        const uid=studentUid();
        const request=typeof WEEKLY_CHECKIN_REQUEST!=='undefined'?WEEKLY_CHECKIN_REQUEST:null;
        const sourceId=uid&&request&&typeof weeklyCheckinDocId==='function'?weeklyCheckinDocId(uid,request.requestKey):'';
        const requestKey=String(request?.requestKey||'');
        const result=await base.apply(this,arguments);
        if(student()&&sourceId){
          let confirmed=false;
          try{const snap=await serverGet(db.collection('weeklyCheckins').doc(sourceId),'confirmar relatório semanal');confirmed=!!snap?.exists;}catch(error){}
          if(confirmed&&typeof loadWeeklyCheckinState==='function'){
            try{await loadWeeklyCheckinState(true);}catch(error){}
          }
          if(typeof showToast==='function'){
            if(confirmed){
              const nextKey=String(typeof WEEKLY_CHECKIN_REQUEST!=='undefined'?WEEKLY_CHECKIN_REQUEST?.requestKey||'':'');
              showToast(nextKey&&nextKey!==requestKey?'✓ Relatório semanal confirmado. Existe outra atualização pendente/programada.':'✓ Relatório semanal confirmado no servidor.');
            }else showToast('O relatório semanal ainda não foi confirmado pelo servidor. Não haverá reenvio automático.',true);
          }
        }
        return result;
      };
      wrapped.__tbSubmitState101054=true;wrapped.__tbBase=base;submitWeeklyCheckin=wrapped;installedWeekly=true;return true;
    }catch(error){return false;}
  }

  function install(){
    if(!student())return false;
    installPendingCheck();
    installQuestionnaireSubmit();
    installWeeklySubmit();
    return installedPending&&installedQuestionnaire&&installedWeekly;
  }

  install();
  [120,500,1400].forEach(delay=>setTimeout(install,delay));
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('team-bulls-runtime-state',install);
  window.addEventListener('team-bulls-student-runtime-ready',install);
  window.addEventListener('pageshow',()=>{if(student()){install();reconcileQuestionnaires().catch(()=>{});}},{passive:true});

  window.TeamBullsStudentReportSubmitReconciliation=Object.freeze({version:VERSION,install,reconcile:reconcileQuestionnaires,state:()=>({pending:installedPending,questionnaire:installedQuestionnaire,weekly:installedWeekly})});
})();
