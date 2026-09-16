/* Team Bulls v10.10.55 — histórico individual sem loading infinito e com cargas independentes. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_TRAINER_STUDENT_REPORT_HISTORY_101055__)return;
  window.__TEAM_BULLS_TRAINER_STUDENT_REPORT_HISTORY_101055__=true;

  const VERSION='10.10.55-studentreports3';
  const MAX_REPORTS=500;
  const SECTION_TIMEOUT_MS=9000;
  let baseRenderQuestList=null;
  let installed=false;
  let refreshSeq=0;

  const trainer=()=>{try{return CURRENT_USER?.role==='trainer'&&MODE==='cloud'&&!!db;}catch(error){return false;}};
  const stampMs=value=>{try{if(value?.toMillis)return value.toMillis();if(value?.toDate)return value.toDate().getTime();if(value?.seconds)return Number(value.seconds)*1000;return 0;}catch(error){return 0;}};
  const sameStudent=studentUid=>String(VIEW_STUDENT?.uid||'')===String(studentUid||'');
  const reportsScreenActive=()=>!!document.getElementById('screen-ts-quest')?.classList.contains('active');
  const currentLoad=(studentUid,seq)=>trainer()&&seq===refreshSeq&&sameStudent(studentUid)&&reportsScreenActive();

  function patchReportDates(){
    if(typeof renderQuestList!=='function')return false;
    if(renderQuestList.__tbTrainerAnsweredDate101055)return true;
    baseRenderQuestList=renderQuestList.__tbBase||renderQuestList;
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

  function setSectionLoading(listId,message){
    const list=document.getElementById(listId);
    if(list)list.innerHTML=`<div class="no-data-inline">${message}</div>`;
  }

  function setLoadingState(){
    const empty=document.getElementById('ts-quest-empty');
    if(empty)empty.style.display='none';
    setSectionLoading('ts-quest-list','Carregando relatórios do aluno...');
    setSectionLoading('ts-weekly-checkin-list','Carregando relatórios semanais...');
  }

  function retryButton(listId,message){
    const list=document.getElementById(listId);
    if(!list)return;
    list.innerHTML='';
    const box=document.createElement('div');box.className='no-data-inline';
    const text=document.createElement('div');text.textContent=message;
    const button=document.createElement('button');button.type='button';button.className='btn-secondary';button.textContent='TENTAR NOVAMENTE';button.style.marginTop='12px';
    button.addEventListener('click',()=>refreshStudentReports({showLoading:true}),{once:true});
    box.appendChild(text);box.appendChild(button);list.appendChild(box);
  }

  function timeout(task,label){
    if(typeof withTimeout==='function')return withTimeout(Promise.resolve(task),SECTION_TIMEOUT_MS,label);
    return Promise.race([
      Promise.resolve(task),
      new Promise((_,reject)=>setTimeout(()=>reject(Object.assign(new Error('Tempo esgotado: '+label),{code:'team-bulls/timeout'})),SECTION_TIMEOUT_MS))
    ]);
  }

  async function loadOwnedQuestionnaires(studentUid){
    const trainerUid=String(CURRENT_USER?.uid||'');
    if(!trainerUid||!studentUid)return[];
    const reference=db.collection('questionnaires').where('trainerId','==',trainerUid).limit(MAX_REPORTS);
    const snap=await timeout(reference.get(),'histórico de relatórios do aluno');
    return(snap.docs||[])
      .map(doc=>({...doc.data(),id:doc.id}))
      .filter(report=>String(report.studentId||'')===String(studentUid))
      .sort((a,b)=>(stampMs(b.answeredAt)||stampMs(b.createdAt))-(stampMs(a.answeredAt)||stampMs(a.createdAt))||String(b.id).localeCompare(String(a.id)));
  }

  async function loadQuestionnaireSection(studentUid,seq){
    try{
      const questionnaires=await loadOwnedQuestionnaires(studentUid);
      if(!currentLoad(studentUid,seq))return false;
      TS_QUEST_CACHE=questionnaires;
      patchReportDates();
      if(typeof renderQuestList!=='function')throw new Error('Renderizador de relatórios indisponível.');
      renderQuestList(TS_QUEST_CACHE,'ts-quest-list','ts-quest-empty',true);
      return true;
    }catch(error){
      console.warn('[Team Bulls] histórico individual indisponível',error?.code||error?.message||error);
      if(currentLoad(studentUid,seq))retryButton('ts-quest-list','Não foi possível carregar os relatórios personalizados.');
      return false;
    }
  }

  async function loadWeeklySection(studentUid,seq){
    try{
      if(typeof fetchWeeklyCheckins!=='function')throw new Error('Histórico semanal indisponível.');
      const checkins=await timeout(fetchWeeklyCheckins(studentUid),'relatórios semanais');
      if(!currentLoad(studentUid,seq))return false;
      WEEKLY_CHECKINS=Array.isArray(checkins)?checkins:[];
      if(typeof renderWeeklyCheckinHistory!=='function')throw new Error('Renderizador semanal indisponível.');
      renderWeeklyCheckinHistory(WEEKLY_CHECKINS,'ts-weekly-checkin-list');
      return true;
    }catch(error){
      console.warn('[Team Bulls] histórico semanal indisponível',error?.code||error?.message||error);
      if(currentLoad(studentUid,seq))retryButton('ts-weekly-checkin-list','Não foi possível carregar os relatórios semanais.');
      return false;
    }
  }

  async function refreshStudentReports({showLoading=true}={}){
    if(!trainer()||!VIEW_STUDENT?.uid)return false;
    const studentUid=String(VIEW_STUDENT.uid),seq=++refreshSeq;
    if(showLoading)setLoadingState();
    const results=await Promise.allSettled([
      loadQuestionnaireSection(studentUid,seq),
      loadWeeklySection(studentUid,seq)
    ]);
    if(!sameStudent(studentUid))return false;
    return results.some(result=>result.status==='fulfilled'&&result.value===true);
  }

  function patchOpen(){
    if(typeof openTsQuestionnaires!=='function')return false;
    if(openTsQuestionnaires.__tbTrainerOwnedHistory101055)return true;
    const previous=openTsQuestionnaires;
    const wrapped=async function(){
      if(!trainer()||!VIEW_STUDENT?.uid)return previous.apply(this,arguments);
      if(typeof showScreen==='function')showScreen('screen-ts-quest');
      setLoadingState();
      return refreshStudentReports({showLoading:false});
    };
    wrapped.__tbTrainerOwnedHistory101055=true;
    wrapped.__tbBase=previous;
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

  window.TeamBullsTrainerStudentReportHistory=Object.freeze({version:VERSION,install,refresh:refreshStudentReports,state:()=>({installed,studentId:String(VIEW_STUDENT?.uid||''),refreshSeq})});
})();
