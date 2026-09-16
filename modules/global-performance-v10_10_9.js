/* Team Bulls v10.10.9 — otimizações globais de experiência e renderização. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_GLOBAL_PERFORMANCE_V10109__)return;
  window.__TEAM_BULLS_GLOBAL_PERFORMANCE_V10109__=true;

  const ROOT=document.documentElement;
  const COARSE_QUERY=window.matchMedia?.('(pointer:coarse)')||null;
  const REDUCED_QUERY=window.matchMedia?.('(prefers-reduced-motion: reduce)')||null;
  let settleFrame=0;

  function installStyles(){
    if(document.getElementById('tb-global-performance-v10-10-9-style'))return;
    const style=document.createElement('style');
    style.id='tb-global-performance-v10-10-9-style';
    style.textContent=`
      :where(button,a,[role="button"],label[for],input[type="button"],input[type="submit"]){touch-action:manipulation}
      :where(.modal-sheet,.tb-workspace-list,.weekly-plan-scroll,.technique-picker){scrollbar-gutter:stable}
      html.tb-page-hidden :where(.spinner,.survival-pulse,.pull-refresh-spinner){animation-play-state:paused!important}
      html.tb-page-hidden .feedback-banner-label::before{animation-play-state:paused!important}
      #pull-refresh-indicator:not(.visible):not(.refreshing){will-change:auto}

      @media (max-width:899px),(pointer:coarse){
        .header,.modal-backdrop,.auth-card,.trainer-day-quick-nav-shell,.pull-refresh-card,.team-bulls-update-banner,.tb-trainer-tools{
          -webkit-backdrop-filter:none!important;
          backdrop-filter:none!important;
        }
        body::after{box-shadow:inset 0 0 58px rgba(0,0,0,.56)!important}
        .card,.workout-card,.exercise-row,.diet-folder-card,.session-block,.meal-card,.settings-card{
          box-shadow:0 4px 14px rgba(0,0,0,.12);
        }
        .workout-card.is-active{box-shadow:0 0 0 1px rgba(165,30,32,.13),0 5px 16px rgba(0,0,0,.18)}
        .fab{box-shadow:0 4px 15px rgba(225,29,72,.26),0 2px 6px rgba(0,0,0,.28)}
        input[type="text"],input[type="email"],input[type="password"],input[type="number"],input[type="search"],input[type="date"],textarea,select{
          font-size:16px;
        }
        :where(.modal-sheet,.weekly-plan-scroll,.tb-workspace-list,.technique-picker){-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
      }

      @media (min-width:900px){
        .modal-sheet{scrollbar-gutter:stable;overscroll-behavior:contain}
        .tb-workspace-sheet{width:min(760px,calc(100vw - 56px))}
        .tb-workspace-list{scrollbar-gutter:stable}
      }
    `;
    document.head.appendChild(style);
  }

  function elementAnimations(element){
    if(!(element instanceof Element)||typeof element.getAnimations!=='function')return[];
    try{return element.getAnimations({subtree:false});}
    catch(error){try{return element.getAnimations();}catch(inner){return[];}}
  }

  function finishElementAnimations(element){
    let finished=false;
    elementAnimations(element).forEach(animation=>{
      try{
        if(animation.playState==='paused'||animation.playState==='running'){
          animation.finish();
          finished=true;
        }
      }catch(error){}
    });
    return finished;
  }

  function settleTransientUiAnimations(){
    if(document.hidden)return;
    if(settleFrame)cancelAnimationFrame(settleFrame);
    settleFrame=requestAnimationFrame(()=>{
      settleFrame=0;
      finishElementAnimations(document.querySelector('.screen.active'));
      document.querySelectorAll('.modal-backdrop.open > .modal-sheet,.modal-backdrop.open > .modal-dialog').forEach(finishElementAnimations);
    });
  }

  function syncVisibilityState(){
    ROOT.classList.toggle('tb-page-hidden',document.hidden);
    if(document.hidden&&settleFrame){cancelAnimationFrame(settleFrame);settleFrame=0;}
    if(!document.hidden)settleTransientUiAnimations();
  }

  function syncCapabilityClasses(){
    const coarse=COARSE_QUERY?.matches===true;
    const reduced=REDUCED_QUERY?.matches===true;
    const saveData=navigator.connection?.saveData===true;
    ROOT.classList.toggle('tb-coarse-pointer',coarse);
    ROOT.classList.toggle('tb-reduced-motion',reduced);
    ROOT.classList.toggle('tb-save-data',saveData);
  }

  function bindCapabilityChanges(){
    const bind=query=>{if(query?.addEventListener)query.addEventListener('change',syncCapabilityClasses);else query?.addListener?.(syncCapabilityClasses);};
    bind(COARSE_QUERY);bind(REDUCED_QUERY);
    try{navigator.connection?.addEventListener?.('change',syncCapabilityClasses);}catch(error){}
  }

  function install(){
    installStyles();
    syncVisibilityState();
    syncCapabilityClasses();
    bindCapabilityChanges();
    document.addEventListener('visibilitychange',syncVisibilityState,{passive:true});
    window.addEventListener('pageshow',()=>{syncVisibilityState();syncCapabilityClasses();settleTransientUiAnimations();},{passive:true});
    window.addEventListener('focus',settleTransientUiAnimations,{passive:true});
    window.TeamBullsPerformance=Object.freeze({
      refresh(){syncVisibilityState();syncCapabilityClasses();settleTransientUiAnimations();},
      version:'10.10.9-perf3'
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();