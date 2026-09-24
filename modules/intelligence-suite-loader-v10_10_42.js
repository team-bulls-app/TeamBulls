/* Team Bulls v10.10.57 — carregador isolado da suíte de inteligência, progresso e relatórios. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_INTELLIGENCE_SUITE_LOADER_101042__)return;
  window.__TEAM_BULLS_INTELLIGENCE_SUITE_LOADER_101042__=true;
  const VERSION='10.10.57-intelsuite7';
  const specs={
    trainer:[
      ['./modules/monthly-report-cycle-v10_10_59.js?v=10.10.59-monthly1',()=>window.TeamBullsMonthlyReports?.version==='10.10.59-monthly1'],
      ['./modules/trainer-report-link-recovery-v10_10_51.js?v=10.10.51-reportlink1',()=>window.TeamBullsTrainerReportLinkRecovery?.version==='10.10.51-reportlink1'],
      ['./modules/weekly-report-integrity-v10_10_58.js?v=10.10.58-weeklyintegrity4',()=>window.TeamBullsWeeklyReportIntegrity?.version==='10.10.58-weeklyintegrity4'],
      ['./modules/trainer-student-report-history-v10_10_55.js?v=10.10.55-studentreports3',()=>window.TeamBullsTrainerStudentReportHistory?.version==='10.10.55-studentreports3'],
      ['./modules/trainer-canonical-inbox-v10_10_58.js?v=10.10.58-canonicalinbox6',()=>window.TeamBullsCanonicalTrainerInbox?.version==='10.10.58-canonicalinbox6'],
      ['./modules/trainer-intelligence-data-v10_10_42.js?v=10.10.43-inteldata2',()=>window.TeamBullsTrainerIntelligenceData?.version==='10.10.42-inteldata1'],
      ['./modules/trainer-canonical-context-guard-v10_10_42.js?v=10.10.56-contextguard5',()=>window.TeamBullsTrainerCanonicalContextGuard?.version==='10.10.56-contextguard5'],
      ['./modules/trainer-command-center-v10_10_42.js?v=10.10.42-command1',()=>window.TeamBullsTrainerCommandCenter?.version==='10.10.42-command1'],
      ['./modules/trainer-student-insights-v10_10_42.js?v=10.10.43-studentinsights2',()=>window.TeamBullsTrainerStudentInsights?.version==='10.10.43-studentinsights2']
    ],
    student:[
      ['./modules/monthly-report-cycle-v10_10_59.js?v=10.10.59-monthly1',()=>window.TeamBullsMonthlyReports?.version==='10.10.59-monthly1'],
      ['./modules/foreground-write-resilience-v10_10_50.js?v=10.10.50-foregroundwrite1',()=>window.TeamBullsForegroundWriteResilience?.version==='10.10.50-foregroundwrite1'],
      ['./modules/student-trainer-activity-bridge-v10_10_47.js?v=10.10.47-activitybridge2',()=>window.TeamBullsStudentTrainerActivityBridge?.version==='10.10.47-activitybridge2'],
      ['./modules/student-report-submit-reconciliation-v10_10_57.js?v=10.10.57-submitstate7',()=>window.TeamBullsStudentReportSubmitReconciliation?.version==='10.10.57-submitstate7'],
      ['./modules/weekly-report-integrity-v10_10_58.js?v=10.10.58-weeklyintegrity4',()=>window.TeamBullsWeeklyReportIntegrity?.version==='10.10.58-weeklyintegrity4'],
      ['./modules/student-progress-hub-v10_10_42.js?v=10.10.43-studentprogress2',()=>window.TeamBullsStudentProgressHub?.version==='10.10.43-studentprogress2']
    ]
  };
  const loading=new Map();let completedRole='';
  const role=()=>{try{const value=String(CURRENT_USER?.role||'');if(value==='trainer'&&MODE==='cloud')return'trainer';if(value==='student'&&MODE==='cloud')return'student';}catch(error){}return'';};
  function loadOne(src,ready){
    if(ready())return Promise.resolve(true);if(loading.has(src))return loading.get(src);
    const promise=new Promise(resolve=>{let settled=false,timer=0;const finish=ok=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);if(!ok)loading.delete(src);resolve(!!ok);},url=new URL(src,location.href).href,existing=[...document.scripts].find(script=>String(script.src||'')===url);if(existing){if(ready()){finish(true);return;}existing.addEventListener('load',()=>finish(ready()),{once:true});existing.addEventListener('error',()=>finish(false),{once:true});timer=setTimeout(()=>finish(ready()),8000);return;}const script=document.createElement('script');script.src=src;script.async=false;script.dataset.teamBullsIntelligenceSuite='1';script.onload=()=>finish(ready());script.onerror=()=>finish(false);timer=setTimeout(()=>{try{script.remove();}catch(error){}finish(false);},8000);document.head.appendChild(script);});loading.set(src,promise);return promise;
  }
  async function loadForRole(){const current=role();if(!current)return false;if(completedRole===current)return true;for(const [src,ready] of specs[current]){const ok=await loadOne(src,ready);if(!ok){console.warn('[Team Bulls] Módulo de inteligência/integridade indisponível:',src);return false;}}completedRole=current;window.dispatchEvent(new CustomEvent('team-bulls-intelligence-ready',{detail:{role:current,version:VERSION}}));return true;}
  function resetIfRoleChanged(){const current=role();if(completedRole&&current&&completedRole!==current)completedRole='';return loadForRole().catch(()=>false);}
  loadForRole().catch(()=>{});window.addEventListener('team-bulls-runtime-ready',resetIfRoleChanged);window.addEventListener('team-bulls-runtime-state',resetIfRoleChanged);window.addEventListener('team-bulls-student-runtime-ready',resetIfRoleChanged);window.addEventListener('pageshow',resetIfRoleChanged,{passive:true});
  window.TeamBullsIntelligenceSuiteLoader=Object.freeze({version:VERSION,load:loadForRole,role});
})();