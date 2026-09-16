/* Team Bulls v10.10.53 — histórico individual do aluno pela propriedade canônica do treinador. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_TRAINER_STUDENT_REPORT_HISTORY_101053__)return;
  window.__TEAM_BULLS_TRAINER_STUDENT_REPORT_HISTORY_101053__=true;

  const VERSION='10.10.53-studentreports1';
  const MAX_REPORTS=500;
  let baseRenderQuestList=null;
  let installed=false;

  const trainer=()=>{try{return CURRENT_USER?.role==='trainer'&&MODE==='cloud'&&!!db;}catch(error){return false;}};
  const stampMs=value=>{try{if(value?.toMillis)return value.toMillis();if(value?.toDate)return value.toDate().getTime();if(value?.seconds)return Number(value.seconds)*1000;return 0;}catch(error){return 0;}};

  function patchReportDates(){
    if(typeof renderQuestList!=='function')return false;
    if(renderQuestList.__tbTrainerAnsweredDate101053)return true;
    baseRenderQuestList=renderQuestList;
    const wrapped=function(cache,listId,emptyId,fromTrainer){
      if(fromTrainer){
        const visible=(Array.isArray(cache)?cache:[]).map(report=>report?.answeredAt?{...report,createdAt:report.answeredAt}:report);
        return baseRenderQuestList(visible,listId,emptyId,fromTrainer);
      }
      return baseRenderQuestList(cache,listId,emptyId,fromTrainer);
    };
    wrapped.__tbTrainerAnsweredDate101053=true;
    renderQuestList=wrapped;
    return true;
  }

  async function loadOwnedQuestionnaires(studentUid){
    const trainerUid=String(CURRENT_USER?.uid||'');
    if(!trainerUid||!studentUid)return[];
    const reference=db.collection('questionnaires').where('trainerId','==',trainerUid).limit(MAX_REPORTS);
    const snap=typeof cloudGet==='function'?await cloudGet(reference,'histórico de relatórios do aluno'):await reference.get();
    return(snap.docs||[])
      .map(doc=>({...doc.data(),id:doc.id}))
      .filter(report=>String(report.studentId||'')===String(studentUid))
      .sort((a,b)=>(stampMs(b.answeredAt)||stampMs(b.createdAt))-(stampMs(a.answeredAt)||stampMs(a.createdAt))||String(b.id).localeCompare(String(a.id)));
  }

  async function refreshStudentReports(){
    if(!trainer()||!VIEW_STUDENT?.uid)return false;
    const studentUid=String(VIEW_STUDENT.uid),navigation=typeof beginAsyncNavigation==='function'?beginAsyncNavigation():null;
    let questionnaires=[];
    try{questionnaires=await loadOwnedQuestionnaires(studentUid);}
    catch(error){
      console.warn('[Team Bulls] histórico individual por propriedade indisponível',error?.code||error?.message||error);
      if(typeof showToast==='function')showToast('Não foi possível atualizar os relatórios deste aluno agora.',true);
      return false;
    }
    if(typeof isNavigationCurrent==='function'&&navigation&&!isNavigationCurrent(navigation))return false;
    if(String(VIEW_STUDENT?.uid||'')!==studentUid)return false;
    TS_QUEST_CACHE=questionnaires;
    patchReportDates();
    if(typeof renderQuestList==='function')renderQuestList(TS_QUEST_CACHE,'ts-quest-list','ts-quest-empty',true);

    // Mantém o histórico semanal existente independente do personalizado.
    try{
      if(typeof fetchWeeklyCheckins==='function'){
        const checkins=await fetchWeeklyCheckins(studentUid);
        if(String(VIEW_STUDENT?.uid||'')!==studentUid)return true;
        WEEKLY_CHECKINS=checkins;
        if(typeof renderWeeklyCheckinHistory==='function')renderWeeklyCheckinHistory(checkins,'ts-weekly-checkin-list');
      }
    }catch(error){console.warn('[Team Bulls] histórico semanal permaneceu indisponível',error?.code||error?.message||error);}
    return true;
  }

  function patchOpen(){
    if(typeof openTsQuestionnaires!=='function')return false;
    if(openTsQuestionnaires.__tbTrainerOwnedHistory101053)return true;
    const wrapped=async function(){return refreshStudentReports();};
    wrapped.__tbTrainerOwnedHistory101053=true;
    openTsQuestionnaires=wrapped;
    return true;
  }

  function install(){
    if(!trainer())return false;
    patchReportDates();
    patchOpen();
    installed=true;
    return true;
  }

  install();
  [120,500,1400].forEach(delay=>setTimeout(install,delay));
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('team-bulls-runtime-state',install);
  window.addEventListener('pageshow',install,{passive:true});

  window.TeamBullsTrainerStudentReportHistory=Object.freeze({version:VERSION,install,refresh:refreshStudentReports,state:()=>({installed,studentId:String(VIEW_STUDENT?.uid||'')})});
})();
