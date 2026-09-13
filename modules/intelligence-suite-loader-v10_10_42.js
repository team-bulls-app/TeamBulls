/* Team Bulls v10.10.42 — carregador isolado da suíte de inteligência e progresso. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_INTELLIGENCE_SUITE_LOADER_101042__)return;
  window.__TEAM_BULLS_INTELLIGENCE_SUITE_LOADER_101042__=true;
  const VERSION='10.10.42-intelsuite1';
  const specs={
    trainer:[
      ['./modules/trainer-intelligence-data-v10_10_42.js?v=10.10.42-inteldata1',()=>window.TeamBullsTrainerIntelligenceData?.version==='10.10.42-inteldata1'],
      ['./modules/trainer-command-center-v10_10_42.js?v=10.10.42-command1',()=>window.TeamBullsTrainerCommandCenter?.version==='10.10.42-command1'],
      ['./modules/trainer-student-insights-v10_10_42.js?v=10.10.42-studentinsights1',()=>window.TeamBullsTrainerStudentInsights?.version==='10.10.42-studentinsights1']
    ],
    student:[
      ['./modules/student-progress-hub-v10_10_42.js?v=10.10.42-studentprogress1',()=>window.TeamBullsStudentProgressHub?.version==='10.10.42-studentprogress1']
    ]
  };
  const loading=new Map();let completedRole='';
  const role=()=>{try{const value=String(CURRENT_USER?.role||'');if(value==='trainer'&&MODE==='cloud')return'trainer';if(value==='student'&&MODE==='cloud')return'student';}catch(error){}return'';};
  function loadOne(src,ready){
    if(ready())return Promise.resolve(true);if(loading.has(src))return loading.get(src);
    const promise=new Promise(resolve=>{let settled=false,timer=0;const finish=ok=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);if(!ok)loading.delete(src);resolve(!!ok);},url=new URL(src,location.href).href,existing=[...document.scripts].find(script=>String(script.src||'')===url);if(existing){if(ready()){finish(true);return;}existing.addEventListener('load',()=>finish(ready()),{once:true});existing.addEventListener('error',()=>finish(false),{once:true});timer=setTimeout(()=>finish(ready()),8000);return;}const script=document.createElement('script');script.src=src;script.async=false;script.dataset.teamBullsIntelligenceSuite='1';script.onload=()=>finish(ready());script.onerror=()=>finish(false);timer=setTimeout(()=>{try{script.remove();}catch(error){}finish(false);},8000);document.head.appendChild(script);});loading.set(src,promise);return promise;
  }
  async function loadForRole(){const current=role();if(!current)return false;if(completedRole===current)return true;for(const [src,ready] of specs[current]){const ok=await loadOne(src,ready);if(!ok){console.warn('[Team Bulls] Módulo de inteligência indisponível:',src);return false;}}completedRole=current;window.dispatchEvent(new CustomEvent('team-bulls-intelligence-ready',{detail:{role:current,version:VERSION}}));return true;}
  function resetIfRoleChanged(){const current=role();if(completedRole&&current&&completedRole!==current)completedRole='';return loadForRole().catch(()=>false);}
  loadForRole().catch(()=>{});window.addEventListener('team-bulls-runtime-ready',resetIfRoleChanged);window.addEventListener('team-bulls-runtime-state',resetIfRoleChanged);window.addEventListener('team-bulls-student-runtime-ready',resetIfRoleChanged);window.addEventListener('pageshow',resetIfRoleChanged,{passive:true});
  window.TeamBullsIntelligenceSuiteLoader=Object.freeze({version:VERSION,load:loadForRole,role});
})();
