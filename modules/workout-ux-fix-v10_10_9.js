/* Team Bulls v10.10.9 — preserva posição do treino e libera rolagem vertical móvel. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_WORKOUT_UX_FIX_V10109__)return;
  window.__TEAM_BULLS_WORKOUT_UX_FIX_V10109__=true;

  const WORKOUT_SCREENS=new Set([
    'screen-ts-workout','screen-ts-day','screen-ts-exercise',
    'screen-workout','screen-day','screen-exercise'
  ]);
  const RENDER_SCREENS=Object.freeze({
    renderTsWorkout:'screen-ts-workout',
    renderTsDay:'screen-ts-day',
    renderWorkout:'screen-workout',
    renderDay:'screen-day'
  });
  const ACTION_SCROLLS=new Map();

  function activeScreenId(){return document.querySelector('.screen.active')?.id||'';}
  function appScroller(){return document.getElementById('app');}
  function isWorkoutScreen(id=activeScreenId()){return WORKOUT_SCREENS.has(String(id||''));}
  function captureScroll(){
    const app=appScroller(),doc=document.scrollingElement;
    return{
      screen:activeScreenId(),
      navigation:typeof NAVIGATION_SEQ==='number'?NAVIGATION_SEQ:null,
      appTop:Number(app?.scrollTop||0),
      docTop:Number(doc?.scrollTop||0),
      windowTop:Number(window.scrollY||0)
    };
  }
  function clamp(value,max){return Math.max(0,Math.min(Math.max(0,Number(max)||0),Math.max(0,Number(value)||0)));}
  function applyScroll(state){
    if(!state||activeScreenId()!==state.screen||!isWorkoutScreen(state.screen))return false;
    if(state.navigation!==null&&typeof NAVIGATION_SEQ==='number'&&state.navigation!==NAVIGATION_SEQ)return false;
    const app=appScroller(),doc=document.scrollingElement;
    if(app)app.scrollTop=clamp(state.appTop,app.scrollHeight-app.clientHeight);
    if(doc)doc.scrollTop=clamp(state.docTop,doc.scrollHeight-doc.clientHeight);
    if(window.innerWidth>=900&&Math.abs((window.scrollY||0)-state.windowTop)>1){
      try{window.scrollTo({top:state.windowTop,left:window.scrollX||0,behavior:'auto'});}catch(error){window.scrollTo(0,state.windowTop);}
    }
    return true;
  }
  function restoreScroll(state){
    if(!state||!isWorkoutScreen(state.screen))return;
    const restore=()=>applyScroll(state);
    requestAnimationFrame(()=>{
      restore();
      requestAnimationFrame(restore);
    });
    setTimeout(restore,70);
    setTimeout(restore,180);
  }

  function installStyles(){
    if(document.getElementById('tb-workout-ux-fix-v10-10-9-style'))return;
    const style=document.createElement('style');
    style.id='tb-workout-ux-fix-v10-10-9-style';
    style.textContent=`
      @media (max-width:899px),(pointer:coarse){
        #app{touch-action:pan-x pan-y pinch-zoom!important;}
        #screen-ts-workout .weekly-plan-scroll,
        #screen-ts-day .weekly-plan-scroll,
        #screen-workout .weekly-plan-scroll,
        #screen-day .weekly-plan-scroll,
        #screen-ts-workout .trainer-day-quick-nav,
        #screen-ts-day .trainer-day-quick-nav{
          overflow-y:hidden!important;
          overscroll-behavior-x:contain!important;
          overscroll-behavior-y:auto!important;
          touch-action:pan-x pan-y pinch-zoom!important;
          -webkit-overflow-scrolling:touch;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function wrapActions(){
    const baseBegin=window.beginAction,baseEnd=window.endAction;
    if(typeof baseBegin==='function'&&!baseBegin.__tbWorkoutUxFix){
      const wrappedBegin=function(){
        const result=baseBegin.apply(this,arguments);
        if(result!==false&&isWorkoutScreen()){
          const key=String(arguments[0]??'__default__');
          ACTION_SCROLLS.set(key,captureScroll());
        }
        return result;
      };
      wrappedBegin.__tbWorkoutUxFix=true;
      window.beginAction=wrappedBegin;
    }
    if(typeof baseEnd==='function'&&!baseEnd.__tbWorkoutUxFix){
      const wrappedEnd=function(){
        const key=String(arguments[0]??'__default__');
        const state=ACTION_SCROLLS.get(key)||null;
        ACTION_SCROLLS.delete(key);
        const result=baseEnd.apply(this,arguments);
        if(state)restoreScroll(state);
        return result;
      };
      wrappedEnd.__tbWorkoutUxFix=true;
      window.endAction=wrappedEnd;
    }
  }

  function wrapRender(name,screenId){
    const base=window[name];
    if(typeof base!=='function'||base.__tbWorkoutUxFix)return;
    const wrapped=function(){
      const state=activeScreenId()===screenId?captureScroll():null;
      const result=base.apply(this,arguments);
      if(state)restoreScroll(state);
      return result;
    };
    wrapped.__tbWorkoutUxFix=true;
    window[name]=wrapped;
  }

  function install(){
    installStyles();
    wrapActions();
    Object.entries(RENDER_SCREENS).forEach(([name,screen])=>wrapRender(name,screen));
    window.TeamBullsWorkoutUxFix=Object.freeze({
      version:'10.10.9-workout1',
      capture:captureScroll,
      restore:restoreScroll
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();
