/* Team Bulls v10.10.47 — ponte leve entre envios canônicos do aluno e a central do treinador. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_STUDENT_TRAINER_ACTIVITY_BRIDGE_101047__)return;
  window.__TEAM_BULLS_STUDENT_TRAINER_ACTIVITY_BRIDGE_101047__=true;

  const VERSION='10.10.47-activitybridge1';
  let installedWeekly=false;
  let installedQuestionnaire=false;

  const student=()=>{try{return CURRENT_USER?.role==='student'&&MODE==='cloud'&&!!db;}catch(error){return false;}};
  const studentUid=()=>student()?String(CURRENT_USER?.uid||''):'';
  const cleanId=value=>String(value??'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,190);
  const iso=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):'';
  const todayIso=()=>{try{return typeof today==='function'?today():new Date().toISOString().slice(0,10);}catch(error){return new Date().toISOString().slice(0,10);}};
  const eventId=(type,sourceId)=>(type==='weekly_checkin'?'w-':'q-')+cleanId(sourceId);
  const timeout=(task,ms=6000)=>typeof withTimeout==='function'?withTimeout(task,ms,'notificar treinador'):Promise.race([Promise.resolve(task),new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error('Tempo esgotado ao notificar treinador'),{code:'team-bulls/activity-timeout'})),ms))]);
  const timestampDate=value=>{try{const date=value?.toDate?.();return date instanceof Date&&!Number.isNaN(date.getTime())?date:null;}catch(error){return null;}};
  const dateIso=value=>{const date=timestampDate(value);return date?date.toISOString().slice(0,10):'';};
  const serverTimestamp=()=>firebase.firestore.FieldValue.serverTimestamp();

  async function resolveTrainerId(){
    const direct=String(CURRENT_USER?.trainerId||'').trim();if(direct)return direct;
    const uid=studentUid();if(!uid)return'';
    try{const snap=await timeout(db.collection('users').doc(uid).get(),5000);return snap.exists?String(snap.data()?.trainerId||'').trim():'';}catch(error){return'';}
  }

  function questionnaireTitle(data){
    const direct=String(data?.title||'').trim();if(direct)return direct.slice(0,160);
    const mode=String(data?.requestMode||'full');
    return mode==='photos'?'Atualização de fotos':mode==='written'?'Relatório escrito':'Relatório completo';
  }
  function weeklyTitle(data){return data?.requestKind==='manual'?'Relatório semanal extra':'Relatório semanal';}
  function sourceDate(data){return iso(data?.submittedDate)||iso(data?.dueDate)||dateIso(data?.answeredAt)||dateIso(data?.createdAt)||todayIso();}

  async function writeActivity(type,sourceId,data){
    const uid=studentUid();if(!uid||!sourceId||!data)return false;
    if(String(data.studentId||'')!==uid)return false;
    if(type==='questionnaire'&&data.answered!==true)return false;
    const trainerId=String(data.trainerId||await resolveTrainerId()).trim();if(!trainerId)return false;
    const title=type==='weekly_checkin'?weeklyTitle(data):questionnaireTitle(data);
    const payload={trainerId,studentId:uid,type,sourceId:String(sourceId).slice(0,190),submittedDate:sourceDate(data),title:String(title).slice(0,160),read:false,createdAt:serverTimestamp()};
    try{
      await timeout(db.collection('trainerActivity').doc(trainerId).collection('events').doc(eventId(type,sourceId)).set(payload),6000);
      return true;
    }catch(error){
      /* O envio canônico já foi salvo. Falha neste índice secundário nunca pode invalidá-lo.
         Se o evento já existe, Rules 28 também impede o aluno de sobrescrevê-lo. */
      console.warn('[Team Bulls] Atualização salva; índice do treinador será reconciliado depois.',error?.code||error?.message||error);
      return false;
    }
  }

  function indexWeekly(sourceId){
    if(!student()||!sourceId)return;
    timeout(db.collection('weeklyCheckins').doc(sourceId).get(),6000).then(snap=>{if(snap.exists)return writeActivity('weekly_checkin',sourceId,snap.data());}).catch(error=>console.warn('[Team Bulls] Confirmação semanal ficará para reconciliação.',error?.code||error?.message||error));
  }
  function indexQuestionnaire(sourceId){
    if(!student()||!sourceId)return;
    timeout(db.collection('questionnaires').doc(sourceId).get(),6000).then(snap=>{if(snap.exists)return writeActivity('questionnaire',sourceId,snap.data());}).catch(error=>console.warn('[Team Bulls] Confirmação da atualização ficará para reconciliação.',error?.code||error?.message||error));
  }

  function installWeekly(){
    try{
      if(typeof submitWeeklyCheckin!=='function')return false;
      if(submitWeeklyCheckin.__tbActivityBridge101047){installedWeekly=true;return true;}
      const base=submitWeeklyCheckin;
      const wrapped=async function(){
        const uid=studentUid(),request=typeof WEEKLY_CHECKIN_REQUEST!=='undefined'?WEEKLY_CHECKIN_REQUEST:null;
        const sourceId=uid&&request&&typeof weeklyCheckinDocId==='function'?weeklyCheckinDocId(uid,request.requestKey):'';
        const result=await base.apply(this,arguments);
        if(uid&&sourceId)indexWeekly(sourceId);
        return result;
      };
      wrapped.__tbActivityBridge101047=true;wrapped.__tbBase=base;submitWeeklyCheckin=wrapped;installedWeekly=true;return true;
    }catch(error){return false;}
  }
  function installQuestionnaire(){
    try{
      if(typeof submitQuestionnaireAnswers!=='function')return false;
      if(submitQuestionnaireAnswers.__tbActivityBridge101047){installedQuestionnaire=true;return true;}
      const base=submitQuestionnaireAnswers;
      const wrapped=async function(){
        const sourceId=String(typeof CUR_ANSWER_QUEST_ID!=='undefined'?CUR_ANSWER_QUEST_ID||'':'');
        const uid=studentUid();const result=await base.apply(this,arguments);
        if(uid&&sourceId)indexQuestionnaire(sourceId);
        return result;
      };
      wrapped.__tbActivityBridge101047=true;wrapped.__tbBase=base;submitQuestionnaireAnswers=wrapped;installedQuestionnaire=true;return true;
    }catch(error){return false;}
  }
  function install(){if(!student())return false;installWeekly();installQuestionnaire();return installedWeekly&&installedQuestionnaire;}

  install();
  [120,500,1400].forEach(delay=>setTimeout(install,delay));
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('team-bulls-runtime-state',install);
  window.addEventListener('team-bulls-student-runtime-ready',install);
  window.addEventListener('pageshow',install,{passive:true});
  window.TeamBullsStudentTrainerActivityBridge=Object.freeze({version:VERSION,install,state:()=>({weekly:installedWeekly,questionnaire:installedQuestionnaire})});
})();
