(()=>{
  'use strict';
  if(window.__TEAM_BULLS_REPORT_SCHEDULE_101011__)return;
  window.__TEAM_BULLS_REPORT_SCHEDULE_101011__=true;
  const VERSION='10.10.11-reportschedule2';

  function monthlyNextDue(schedule){
    return typeof v109ProtocolState==='function'?v109ProtocolState(schedule)?.nextDueDate||'':'';
  }
  function refreshProtocolUi(){
    try{
      if(typeof V109_PROTOCOL_REVIEW_SCHEDULE!=='undefined'&&V109_PROTOCOL_REVIEW_SCHEDULE&&typeof renderTrainerProtocolReview==='function'&&CURRENT_USER?.role==='trainer')renderTrainerProtocolReview(V109_PROTOCOL_REVIEW_SCHEDULE);
      if(typeof loadStudentProtocolReview==='function'&&CURRENT_USER?.role==='student')loadStudentProtocolReview().catch(()=>{});
    }catch(error){console.warn('[Team Bulls] atualização visual do ciclo mensal',error);}
  }

  // A conclusão continua no fluxo oficial markProtocolReviewCompleted().
  setTimeout(refreshProtocolUi,0);
  window.TeamBullsReportSchedule=Object.freeze({version:VERSION,monthlyNextDue,refresh:refreshProtocolUi});
})();
