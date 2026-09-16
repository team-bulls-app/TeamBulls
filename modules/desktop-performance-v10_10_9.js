/* Team Bulls v10.10.9 — otimização específica para desktop sem alterar regras de negócio. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_DESKTOP_PERFORMANCE_V10109__)return;
  window.__TEAM_BULLS_DESKTOP_PERFORMANCE_V10109__=true;

  const ROOT=document.documentElement;
  const DESKTOP_MEDIA='(min-width:900px) and (pointer:fine)';
  const DESKTOP_QUERY=window.matchMedia?.(DESKTOP_MEDIA)||null;
  let scrollReleaseTimer=0;
  let mediaTask=0;
  let desktopListenersBound=false;
  let chartDefaultsSnapshot=null;

  function isDesktopLike(){
    try{return DESKTOP_QUERY?DESKTOP_QUERY.matches:window.innerWidth>=900;}
    catch(error){return window.innerWidth>=900;}
  }

  function installStyles(){
    if(document.getElementById('tb-desktop-performance-v10-10-9-style'))return;
    const style=document.createElement('style');
    style.id='tb-desktop-performance-v10-10-9-style';
    style.textContent=`
      @media (min-width:900px) and (pointer:fine){
        .header,.modal-backdrop,.auth-card,.trainer-day-quick-nav-shell,
        .pull-refresh-card,.team-bulls-update-banner,.tb-trainer-tools,
        .trainer-desktop-nav,.student-desktop-nav{
          -webkit-backdrop-filter:none!important;
          backdrop-filter:none!important;
        }
        body::after{
          box-shadow:inset 0 0 34px rgba(0,0,0,.38)!important;
          opacity:.62!important;
        }
        .workout-card,.exercise-row,.day-folder-card,.diet-folder-card,
        .session-block,.meal-card,.settings-card,.student-card,
        .technique-card,.questionnaire-card,.free-meal-log-card{
          box-shadow:none!important;
        }
        .workout-card.is-active{
          box-shadow:inset 3px 0 0 rgba(202,48,48,.48)!important;
        }
        .screen.active .student-card,
        .screen.active .workout-card,
        .screen.active .exercise-row,
        .screen.active .day-folder-card,
        .screen.active .diet-folder-card,
        .screen.active .session-block,
        .screen.active .meal-card,
        .screen.active .technique-card,
        .screen.active .questionnaire-card,
        .screen.active .free-meal-log-card,
        .screen.active .tb-workspace-item{
          content-visibility:auto;
          contain-intrinsic-size:76px;
        }
        html.tb-desktop-scrolling .screen.active .workout-card,
        html.tb-desktop-scrolling .screen.active .exercise-row,
        html.tb-desktop-scrolling .screen.active .day-folder-card,
        html.tb-desktop-scrolling .screen.active .diet-folder-card,
        html.tb-desktop-scrolling .screen.active .student-card,
        html.tb-desktop-scrolling .screen.active .trainer-day-quick-chip{
          transition:none!important;
        }
        html.tb-desktop-scrolling .screen.active *{
          animation-play-state:paused!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function snapshotChartDefaults(){
    const defaults=window.Chart?.defaults;
    if(!defaults||chartDefaultsSnapshot)return;
    chartDefaultsSnapshot={
      devicePixelRatio:defaults.devicePixelRatio,
      animation:defaults.animation
    };
  }

  function tuneCharts(){
    if(!isDesktopLike())return;
    const ChartCtor=window.Chart;
    if(!ChartCtor?.defaults)return;
    snapshotChartDefaults();
    try{
      const ratio=Math.max(1,Math.min(1.35,Number(window.devicePixelRatio)||1));
      ChartCtor.defaults.devicePixelRatio=ratio;
    }catch(error){}
    try{ChartCtor.defaults.animation=false;}catch(error){}
  }

  function restoreChartDefaults(){
    const defaults=window.Chart?.defaults;
    if(!defaults||!chartDefaultsSnapshot)return;
    try{defaults.devicePixelRatio=chartDefaultsSnapshot.devicePixelRatio;}catch(error){}
    try{defaults.animation=chartDefaultsSnapshot.animation;}catch(error){}
  }

  function tuneMedia(root=document.querySelector('.screen.active')){
    if(!isDesktopLike()||!root?.querySelectorAll)return;
    root.querySelectorAll('img').forEach(image=>{
      try{if(!image.hasAttribute('loading'))image.loading='lazy';}catch(error){}
      try{image.decoding='async';}catch(error){}
    });
    root.querySelectorAll('iframe').forEach(frame=>{
      try{if(!frame.hasAttribute('loading'))frame.loading='lazy';}catch(error){}
    });
    root.querySelectorAll('video').forEach(video=>{
      try{if(!video.hasAttribute('preload'))video.preload='metadata';}catch(error){}
    });
  }

  function cancelMediaTune(){
    if(!mediaTask)return;
    if('cancelIdleCallback' in window)try{cancelIdleCallback(mediaTask);}catch(error){}
    clearTimeout(mediaTask);
    mediaTask=0;
  }

  function scheduleMediaTune(){
    if(!isDesktopLike())return;
    const run=()=>{mediaTask=0;if(!isDesktopLike())return;tuneCharts();tuneMedia();};
    cancelMediaTune();
    if('requestIdleCallback' in window){
      mediaTask=requestIdleCallback(run,{timeout:900});
      return;
    }
    mediaTask=setTimeout(run,100);
  }

  function wrapUiFunction(name){
    const base=window[name];
    if(typeof base!=='function'||base.__tbDesktopPerformance)return;
    const wrapped=function(){
      const result=base.apply(this,arguments);
      if(result!==false&&isDesktopLike())scheduleMediaTune();
      return result;
    };
    wrapped.__tbDesktopPerformance=true;
    window[name]=wrapped;
  }

  function markDesktopScrolling(){
    ROOT.classList.add('tb-desktop-scrolling');
    clearTimeout(scrollReleaseTimer);
    scrollReleaseTimer=setTimeout(()=>ROOT.classList.remove('tb-desktop-scrolling'),120);
  }

  function bindScrollState(){
    if(desktopListenersBound||!isDesktopLike())return;
    desktopListenersBound=true;
    window.addEventListener('scroll',markDesktopScrolling,{passive:true});
    document.getElementById('app')?.addEventListener('scroll',markDesktopScrolling,{passive:true});
  }

  function unbindScrollState(){
    if(!desktopListenersBound)return;
    desktopListenersBound=false;
    window.removeEventListener('scroll',markDesktopScrolling);
    document.getElementById('app')?.removeEventListener('scroll',markDesktopScrolling);
    clearTimeout(scrollReleaseTimer);
    scrollReleaseTimer=0;
    ROOT.classList.remove('tb-desktop-scrolling');
  }

  function syncDesktopState(){
    const desktop=isDesktopLike();
    ROOT.classList.toggle('tb-desktop-optimized',desktop);
    if(desktop){bindScrollState();scheduleMediaTune();}
    else{unbindScrollState();cancelMediaTune();restoreChartDefaults();}
  }

  function install(){
    installStyles();
    ['showScreen','openModal'].forEach(wrapUiFunction);
    syncDesktopState();
    if(DESKTOP_QUERY?.addEventListener)DESKTOP_QUERY.addEventListener('change',syncDesktopState);
    else window.addEventListener('resize',syncDesktopState,{passive:true});
    window.addEventListener('pageshow',syncDesktopState,{passive:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncDesktopState();},{passive:true});
    window.TeamBullsDesktopPerformance=Object.freeze({
      version:'10.10.9-desktop2',
      refresh:syncDesktopState,
      tuneMedia:scheduleMediaTune,
      state:()=>({desktop:isDesktopLike(),scrollListeners:desktopListenersBound,mediaPending:!!mediaTask})
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();