/* Team Bulls v10.10.55 — histórico individual resiliente, independente por seção e sem loading infinito. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_TRAINER_STUDENT_REPORT_HISTORY_101055__)return;
  window.__TEAM_BULLS_TRAINER_STUDENT_REPORT_HISTORY_101055__=true;

  const VERSION='10.10.55-studentreports3';
  const MAX_REPORTS=500;
  const READ_TIMEOUT=6000;
  let baseRenderQuestList=null;
  let installed=false;

  const trainer=()=>{try{return CURRENT_USER?.role==='trainer'&&MODE==='cloud'&&!!db;}catch(error){return false;}};
  const stampMs=value=>{try{if(value?.toMillis)return value.toMillis();if(value?.toDate)return value.toDate().getTime();if(value?.seconds)return Number(value.seconds)*1000;return 0;}catch(error){return 0;}};
  const activeStudent=studentUid=>trainer()&&String(VIEW_STUDENT?.uid||'')===String(studentUid||'');
  const readWithTimeout=(reference,label)=>{
    const task=reference.get();
    if(typeof withTimeout==='function')return withTimeout(task,READ_TIMEOUT,label);
    return Promise.race([Promise.resolve(task),new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error('Tempo esgotado: '+label),{code:'team-bulls/timeout'})),READ_TIMEOUT))]);
  };

  function unwrapRenderQuestList(){
    let current=renderQuestList;
    while(current?.__tbBase&&(current.__tbTrainerAnsweredDate101053||current.__tbTrainerAnsweredDate101054))current=current.__tbBase;
    return current;
  }
  function patchReportDates(){
    if(typeof renderQuestList!=='function')return false;
    if(renderQuestList.__tbTrainerAnsweredDate101055)return true;
    baseRenderQuestList=unwrapRenderQuestList();
    if(typeof baseRenderQuestList!=='function')return false;
    const wrapped=function(cache,listId,emptyId,fromTrainer){
      if(fromTrainer){
        const visible=(Array.isArray(cache)?cache:[]).map(report=>report?.answeredAt?{...report,createdAt:report.answeredAt}:report);
        return baseRenderQuestList(visible,listId,emptyId,fromTrainer);
      }
      return baseRenderQuestList(cache,listId,emptyId,fromTrainer);
    };
    wrapped.__tbTrainerAnsweredDate101055=true;
    wrapped.__tbBase=baseRenderQuestList;
    renderQuestList=wrapped;
    return true;
  }

  function loading(id,text){const el=document.getElementById(id);if(el)el.innerHTML=`<div class="no-data-inline">${text}</div>`;}
  function sectionError(id,message){
    const el=document.getElementById(id);if(!el)return;
    el.innerHTML=`<div class="no-data-inline">${message}<br><button class="btn-ghost" style="margin-top:10px" onclick="TeamBullsTrainerStudentReportHistory?.refresh?.()">TENTAR NOVAMENTE</button></div>`;
  }
  function setLoadingState(){
    loading('ts-quest-list','Carregando relatórios do aluno...');
    const empty=document.getElementById('ts-quest-empty');if(empty)empty.style.display='none';
    loading('ts-weekly-checkin-list','Carregando relatórios semanais...');
  }

  async function loadOwnedQuestionnaires(studentUid){
    const trainerUid=String(CURRENT_USER?.uid||'');
    if(!trainerUid||!studentUid)return[];
    const ownedRef=db.collection('questionnaires').where('trainerId','==',trainerUid).limit(MAX_REPORTS);
    const studentRef=db.collection('questionnaires').where('studentId','==',studentUid).limit(MAX_REPORTS);
    const [ownedResult,studentResult]=await Promise.allSettled([
      readWithTimeout(ownedRef,'relatórios do treinador'),
      readWithTimeout(studentRef,'relatórios do aluno')
    ]);
    if(ownedResult.status==='rejected'&&studentResult.status==='rejected')throw ownedResult.reason||studentResult.reason||new Error('Relatórios indisponíveis');
    const rows=new Map();
    if(ownedResult.status==='fulfilled')for(const doc of ownedResult.value.docs||[]){const data={...doc.data(),id:doc.id};if(String(data.studentId||'')===String(studentUid))rows.set(doc.id,data);}
    if(studentResult.status==='fulfilled')for(const doc of studentResult.value.docs||[]){const data={...doc.data(),id:doc.id},owner=String(data.trainerId||'');if(String(data.studentId||'')===String(studentUid)&&(!owner||owner===trainerUid))rows.set(doc.id,data);}
    return[...rows.values()].sort((a,b)=>(stampMs(b.answeredAt)||stampMs(b.createdAt))-(stampMs(a.answeredAt)||stampMs(a.createdAt))||String(b.id).localeCompare(String(a.id)));
  }

  async function refreshQuestionnaires(studentUid){
    try{
      const questionnaires=await loadOwnedQuestionnaires(studentUid);
      if(!activeStudent(studentUid))return false;
      TS_QUEST_CACHE=questionnaires;
      patchReportDates();
      if(typeof renderQuestList==='function')renderQuestList(TS_QUEST_CACHE,'ts-quest-list','ts-quest-empty',true);
      else sectionError('ts-quest-list','Não foi possível montar os relatórios personalizados.');
      return true;
    }catch(error){
      console.warn('[Team Bulls] relatórios personalizados indisponíveis',error?.code||error?.message||error);
      if(activeStudent(studentUid))sectionError('ts-quest-list','Não foi possível carregar os relatórios personalizados agora.');
      return false;
    }
  }

  async function refreshWeekly(studentUid){
    try{
      if(typeof fetchWeeklyCheckins!=='function')throw new Error('Leitor semanal indisponível');
      const task=fetchWeeklyCheckins(studentUid);
      const checkins=typeof withTimeout==='function'?await withTimeout(task,READ_TIMEOUT,'relatórios semanais'):await task;
      if(!activeStudent(studentUid))return false;
      WEEKLY_CHECKINS=Array.isArray(checkins)?checkins:[];
      if(typeof renderWeeklyCheckinHistory==='function')renderWeeklyCheckinHistory(WEEKLY_CHECKINS,'ts-weekly-checkin-list');
      else sectionError('ts-weekly-checkin-list','Não foi possível montar os relatórios semanais.');
      return true;
    }catch(error){
      console.warn('[Team Bulls] relatórios semanais indisponíveis',error?.code||error?.message||error);
      if(activeStudent(studentUid))sectionError('ts-weekly-checkin-list','Não foi possível carregar os relatórios semanais agora.');
      return false;
    }
  }

  async function refreshStudentReports({navigation=null,showScreenNow=false}={}){
    if(!trainer()||!VIEW_STUDENT?.uid)return false;
    const studentUid=String(VIEW_STUDENT.uid);
    if(showScreenNow&&typeof showScreen==='function')showScreen('screen-ts-quest',navigation);
    setLoadingState();
    const [questionnaires,weekly]=await Promise.allSettled([refreshQuestionnaires(studentUid),refreshWeekly(studentUid)]);
    if(!activeStudent(studentUid))return false;
    const qOk=questionnaires.status==='fulfilled'&&questionnaires.value===true;
    const wOk=weekly.status==='fulfilled'&&weekly.value===true;
    if(!qOk&&!wOk&&typeof showToast==='function')showToast('Não foi possível atualizar os relatórios agora. Tente novamente.',true);
    return qOk||wOk;
  }

  function unwrapOpen(){
    let current=openTsQuestionnaires;
    while(current?.__tbBase&&(current.__tbTrainerOwnedHistory101053||current.__tbTrainerOwnedHistory101054))current=current.__tbBase;
    return current;
  }
  function patchOpen(){
    if(typeof openTsQuestionnaires!=='function')return false;
    if(openTsQuestionnaires.__tbTrainerOwnedHistory101055)return true;
    const previous=unwrapOpen();
    const wrapped=async function(){
      if(!trainer()||!VIEW_STUDENT?.uid)return previous.apply(this,arguments);
      const navigation=typeof beginAsyncNavigation==='function'?beginAsyncNavigation():null;
      if(typeof showScreen==='function')showScreen('screen-ts-quest',navigation);
      return refreshStudentReports({navigation,showScreenNow:false});
    };
    wrapped.__tbTrainerOwnedHistory101055=true;
    wrapped.__tbBase=previous;
    openTsQuestionnaires=wrapped;
    return true;
  }

  function install(){
    if(!trainer())return false;
    patchReportDates();patchOpen();installed=true;return true;
  }

  install();
  [120,500,1400].forEach(delay=>setTimeout(install,delay));
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('team-bulls-runtime-state',install);
  window.addEventListener('pageshow',install,{passive:true});
  window.TeamBullsTrainerStudentReportHistory=Object.freeze({version:VERSION,install,refresh:refreshStudentReports,state:()=>({installed,studentId:String(VIEW_STUDENT?.uid||'')})});
})();
