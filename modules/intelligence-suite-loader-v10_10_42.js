/* Team Bulls v10.10.57 — carregador isolado da suíte de inteligência, progresso e relatórios. */
'use strict';
(()=>{
  const VERSION='10.10.58-intelsuite16';
  const registeredVersion=String(window.TeamBullsIntelligenceSuiteLoader?.version||'');
  const revision=value=>Number(/-intelsuite(\d+)$/.exec(String(value||''))?.[1]||0);
  if(registeredVersion===VERSION||revision(registeredVersion)>revision(VERSION))return;
  // A prior boolean guard from an older loader must not suppress a cache-busted
  // replacement. Keep the marker truthy for older scripts and versioned for new ones.
  window.__TEAM_BULLS_INTELLIGENCE_SUITE_LOADER_101042__=VERSION;
  const specs={
    trainer:[
      ['./modules/monthly-report-cycle-v10_10_59.js?v=10.10.59-monthly3',()=>window.TeamBullsMonthlyReports?.version==='10.10.59-monthly3'],
      ['./modules/foreground-write-resilience-v10_10_50.js?v=10.10.50-foregroundwrite3',()=>window.TeamBullsForegroundWriteResilience?.version==='10.10.50-foregroundwrite3'],
      ['./modules/trainer-report-link-recovery-v10_10_51.js?v=10.10.51-reportlink1',()=>window.TeamBullsTrainerReportLinkRecovery?.version==='10.10.51-reportlink1'],
      ['./modules/weekly-report-integrity-v10_10_58.js?v=10.10.58-weeklyintegrity9',()=>window.TeamBullsWeeklyReportIntegrity?.version==='10.10.58-weeklyintegrity9'],
      ['./modules/trainer-student-report-history-v10_10_55.js?v=10.10.55-studentreports4',()=>window.TeamBullsTrainerStudentReportHistory?.version==='10.10.55-studentreports4'],
      ['./modules/trainer-canonical-inbox-v10_10_58.js?v=10.10.58-canonicalinbox7',()=>window.TeamBullsCanonicalTrainerInbox?.version==='10.10.58-canonicalinbox7'],
      ['./modules/trainer-intelligence-data-v10_10_42.js?v=10.10.66-inteldata4',()=>window.TeamBullsTrainerIntelligenceData?.version==='10.10.66-inteldata4'],
      ['./modules/trainer-canonical-context-guard-v10_10_42.js?v=10.10.56-contextguard5',()=>window.TeamBullsTrainerCanonicalContextGuard?.version==='10.10.56-contextguard5'],
      ['./modules/trainer-command-center-v10_10_42.js?v=10.10.66-command3',()=>window.TeamBullsTrainerCommandCenter?.version==='10.10.66-command3'],
      ['./modules/trainer-student-insights-v10_10_42.js?v=10.10.66-studentinsights4',()=>window.TeamBullsTrainerStudentInsights?.version==='10.10.66-studentinsights4']
    ],
    student:[
      ['./modules/monthly-report-cycle-v10_10_59.js?v=10.10.59-monthly3',()=>window.TeamBullsMonthlyReports?.version==='10.10.59-monthly3'],
      ['./modules/foreground-write-resilience-v10_10_50.js?v=10.10.50-foregroundwrite3',()=>window.TeamBullsForegroundWriteResilience?.version==='10.10.50-foregroundwrite3'],
      ['./modules/student-trainer-activity-bridge-v10_10_47.js?v=10.10.47-activitybridge2',()=>window.TeamBullsStudentTrainerActivityBridge?.version==='10.10.47-activitybridge2'],
      ['./modules/student-report-submit-reconciliation-v10_10_57.js?v=10.10.57-submitstate12',()=>window.TeamBullsStudentReportSubmitReconciliation?.version==='10.10.57-submitstate12'],
      ['./modules/weekly-report-integrity-v10_10_58.js?v=10.10.58-weeklyintegrity9',()=>window.TeamBullsWeeklyReportIntegrity?.version==='10.10.58-weeklyintegrity9'],
      ['./modules/student-progress-hub-v10_10_42.js?v=10.10.66-studentprogress3',()=>window.TeamBullsStudentProgressHub?.version==='10.10.66-studentprogress3']
    ]
  };
  const workflowSpecs=[
    ['./modules/workflow-model-v10_10_71.js?v=10.10.72-workflowmodel2',()=>window.TeamBullsWorkflowModel?.version==='10.10.72-workflowmodel2'],
    ['./modules/workflow-storage-v10_10_71.js?v=10.10.71-workflowstorage1',()=>window.TeamBullsWorkflowStorage?.version==='10.10.71-workflowstorage1'],
    ['./modules/workflow-sync-v10_10_71.js?v=10.10.72-workflowsync3',()=>window.TeamBullsWorkflowSync?.version==='10.10.72-workflowsync3'],
    ['./modules/workflow-drafts-v10_10_71.js?v=10.10.71-workflowdrafts1',()=>window.TeamBullsWorkflowDrafts?.version==='10.10.71-workflowdrafts1'],
    ['./modules/prescription-workflow-v10_10_71.js?v=10.10.72-prescriptionworkflow2',()=>window.TeamBullsPrescriptionWorkflow?.version==='10.10.72-prescriptionworkflow2'],
    ['./modules/isometry-series-timer-v10_10_71.js?v=10.10.71-isometrytimer1',()=>window.TeamBullsIsometrySeriesTimer?.version==='10.10.71-isometrytimer1'],
    ['./modules/feedback-video-tools-v10_10_72.js?v=10.10.72-videotools1',()=>window.TeamBullsFeedbackVideoTools?.version==='10.10.72-videotools1'],
    ['./modules/feedback-media-v10_10_71.js?v=10.10.72-feedbackmedia2',()=>window.TeamBullsFeedbackMedia?.version==='10.10.72-feedbackmedia2']
  ];
  specs.local=[];for(const value of Object.values(specs))value.push(...workflowSpecs);
  const loading=new Map();let completedRole='';
  const role=()=>{try{const value=String(CURRENT_USER?.role||'');if(value==='trainer'&&MODE==='cloud')return'trainer';if(value==='student'&&MODE==='cloud')return'student';if(MODE==='local')return'local';}catch(error){}return'';};
  function loadOne(src,ready){
    if(ready())return Promise.resolve(true);if(loading.has(src))return loading.get(src);
    const promise=new Promise(resolve=>{let settled=false,timer=0;const finish=ok=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);if(!ok)loading.delete(src);resolve(!!ok);},url=new URL(src,location.href).href,existing=[...document.scripts].find(script=>String(script.src||'')===url);if(existing){if(ready()){finish(true);return;}existing.addEventListener('load',()=>finish(ready()),{once:true});existing.addEventListener('error',()=>finish(false),{once:true});timer=setTimeout(()=>finish(ready()),8000);return;}const script=document.createElement('script');script.src=src;script.async=false;script.dataset.teamBullsIntelligenceSuite='1';script.onload=()=>finish(ready());script.onerror=()=>finish(false);timer=setTimeout(()=>{try{script.remove();}catch(error){}finish(false);},8000);document.head.appendChild(script);});loading.set(src,promise);return promise;
  }
  async function loadForRole(){const current=role();if(!current)return false;if(completedRole===current)return true;for(const [src,ready] of specs[current]){const ok=await loadOne(src,ready);if(!ok){console.warn('[Team Bulls] Módulo de inteligência/integridade indisponível:',src);return false;}}completedRole=current;window.dispatchEvent(new CustomEvent('team-bulls-intelligence-ready',{detail:{role:current,version:VERSION}}));return true;}
  function resetIfRoleChanged(){const current=role();if(completedRole&&current&&completedRole!==current)completedRole='';return loadForRole().catch(()=>false);}
  loadForRole().catch(()=>{});window.addEventListener('team-bulls-runtime-ready',resetIfRoleChanged);window.addEventListener('team-bulls-runtime-state',resetIfRoleChanged);window.addEventListener('team-bulls-student-runtime-ready',resetIfRoleChanged);window.addEventListener('pageshow',resetIfRoleChanged,{passive:true});
  window.TeamBullsIntelligenceSuiteLoader=Object.freeze({version:VERSION,load:loadForRole,role});
})();
