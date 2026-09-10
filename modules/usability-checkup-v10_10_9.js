/* Team Bulls v10.10.20 — check-up de usabilidade, navegação e responsividade. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_USABILITY_CHECKUP_V10109__)return;
  window.__TEAM_BULLS_USABILITY_CHECKUP_V10109__=true;

  const VERSION='10.10.20-usability3';
  const scrollByHistoryKey=new Map();
  let scrollFrame=0;
  let profileLogoutHooks=false;

  function appScroller(){return document.getElementById('app');}
  function historyKey(state=history.state){return state?.teamBulls&&state?.key?String(state.key):'';}
  function rememberScroll(){
    const key=historyKey();
    const app=appScroller();
    if(!key||!app)return;
    scrollByHistoryKey.set(key,Math.max(0,Number(app.scrollTop)||0));
    if(scrollByHistoryKey.size>80){
      const first=scrollByHistoryKey.keys().next().value;
      if(first)scrollByHistoryKey.delete(first);
    }
  }
  function restoreScrollForState(state){
    const key=historyKey(state),app=appScroller();
    if(!key||!app||!scrollByHistoryKey.has(key))return false;
    const top=Math.max(0,Number(scrollByHistoryKey.get(key))||0);
    const apply=()=>{
      const target=appScroller();
      if(!target||historyKey()!==key)return;
      target.scrollTop=Math.min(top,Math.max(0,target.scrollHeight-target.clientHeight));
    };
    requestAnimationFrame(()=>{apply();requestAnimationFrame(apply);});
    setTimeout(apply,90);
    return true;
  }

  function installHistoryScroll(){
    const app=appScroller();
    if(!app||app.dataset.tbHistoryScroll==='1')return;
    app.dataset.tbHistoryScroll='1';
    app.addEventListener('scroll',()=>{
      if(scrollFrame)return;
      scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;rememberScroll();});
    },{passive:true});
    window.addEventListener('popstate',event=>{
      if(!event.state?.teamBulls)return;
      requestAnimationFrame(()=>restoreScrollForState(event.state));
    },{passive:true});
    window.addEventListener('pagehide',rememberScroll,{passive:true});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)rememberScroll();},{passive:true});
  }

  function scrollActiveWeekIntoView(root=document.querySelector('.screen.active')){
    const board=root?.querySelector?.('.weekly-plan-scroll');
    const active=board?.querySelector?.('thead .active-week');
    if(!board||!active)return false;
    const left=active.offsetLeft,right=left+active.offsetWidth;
    const visibleLeft=board.scrollLeft+8,visibleRight=board.scrollLeft+board.clientWidth-8;
    if(left>=visibleLeft&&right<=visibleRight)return false;
    const target=Math.max(0,left-(board.clientWidth-active.offsetWidth)/2);
    try{board.scrollTo({left:target,behavior:'auto'});}catch(error){board.scrollLeft=target;}
    return true;
  }

  function wrapShowScreen(){
    const base=window.showScreen;
    if(typeof base!=='function'||base.__tbUsabilityCheckup)return;
    const wrapped=function(){
      rememberScroll();
      const result=base.apply(this,arguments);
      if(result!==false){
        requestAnimationFrame(()=>requestAnimationFrame(()=>scrollActiveWeekIntoView()));
      }
      return result;
    };
    wrapped.__tbUsabilityCheckup=true;
    wrapped.__tbBase=base;
    window.showScreen=wrapped;
  }

  function actionButton(modalId){
    if(!modalId)return null;
    try{return document.querySelector('#'+CSS.escape(String(modalId))+' .btn-primary');}
    catch(error){return document.querySelector('#'+String(modalId).replace(/[^a-zA-Z0-9_-]/g,'')+' .btn-primary');}
  }
  function markBusy(modalId,busy){
    const button=actionButton(modalId);
    if(!button)return;
    button.classList.toggle('tb-action-busy',!!busy);
    if(busy){button.setAttribute('aria-busy','true');button.setAttribute('aria-disabled','true');}
    else{button.removeAttribute('aria-busy');button.removeAttribute('aria-disabled');}
  }
  function wrapActionFeedback(){
    const baseBegin=window.beginAction,baseEnd=window.endAction;
    if(typeof baseBegin==='function'&&!baseBegin.__tbUsabilityCheckup){
      const wrappedBegin=function(key,modalId){
        const result=baseBegin.apply(this,arguments);
        if(result!==false)markBusy(modalId,true);
        return result;
      };
      wrappedBegin.__tbUsabilityCheckup=true;
      window.beginAction=wrappedBegin;
    }
    if(typeof baseEnd==='function'&&!baseEnd.__tbUsabilityCheckup){
      const wrappedEnd=function(key,modalId){
        const result=baseEnd.apply(this,arguments);
        markBusy(modalId,false);
        return result;
      };
      wrappedEnd.__tbUsabilityCheckup=true;
      window.endAction=wrappedEnd;
    }
  }

  function releaseMediaUrls(){
    try{
      if(typeof MEDIA_OBJECT_URLS==='undefined'||!MEDIA_OBJECT_URLS?.forEach)return;
      MEDIA_OBJECT_URLS.forEach(url=>{try{URL.revokeObjectURL(url);}catch(error){}});
      MEDIA_OBJECT_URLS.clear();
    }catch(error){}
  }

  function ensureStudentProfileLogout(){
    const menu=document.getElementById('tb-profile-menu');
    if(!menu||menu.querySelector('[data-tb-profile-logout="1"]'))return false;
    const button=document.createElement('button');
    button.type='button';
    button.className='tb-profile-logout';
    button.dataset.tbProfileLogout='1';
    button.textContent='SAIR';
    button.addEventListener('click',()=>{
      menu.hidden=true;
      if(typeof confirmLogout==='function'){confirmLogout();return;}
      if(typeof handleChipTap==='function'){handleChipTap();return;}
      alert('Não foi possível abrir a saída da conta. Atualize o aplicativo e tente novamente.');
    });
    menu.appendChild(button);
    return true;
  }

  function installStudentProfileLogout(){
    ensureStudentProfileLogout();
    if(profileLogoutHooks)return;
    profileLogoutHooks=true;
    window.addEventListener('team-bulls-student-runtime-ready',ensureStudentProfileLogout);
    window.addEventListener('team-bulls-runtime-ready',ensureStudentProfileLogout);
  }

  function installStyles(){
    if(document.getElementById('tb-usability-checkup-v10-10-9-style'))return;
    const style=document.createElement('style');
    style.id='tb-usability-checkup-v10-10-9-style';
    style.textContent=`
      :where(button,a,[role="button"],input,textarea,select):focus-visible{
        outline:2px solid rgba(220,55,55,.9)!important;
        outline-offset:2px;
      }
      :where(input,textarea,select){scroll-margin-block:88px 170px}
      .tb-action-busy{cursor:progress!important;opacity:.72!important}
      .tb-profile-menu .tb-profile-logout{margin-top:6px!important;border-top:1px solid #4b2028!important;color:#ff9aa8!important;background:rgba(225,29,72,.06)!important}
      .tb-profile-menu .tb-profile-logout:hover,.tb-profile-menu .tb-profile-logout:focus-visible{background:rgba(225,29,72,.16)!important;color:#fff!important}

      @media (max-width:899px),(pointer:coarse){
        :where(.btn-icon,.order-btn,.btn-rm-set,.desktop-nav-toggle,.trainer-day-quick-chip){
          min-width:40px!important;
          min-height:40px!important;
        }
        :where(.btn-primary,.btn-ghost,.btn-offline,.btn-cancel,.btn-danger-solid,.weekly-cell-btn,.weekly-exercise-name){
          min-height:44px;
        }
        .screen.active :where(.workout-card,.exercise-row,.day-folder-card,.diet-folder-card,.session-block,.meal-card,.student-card,.technique-card,.questionnaire-card,.free-meal-log-card){
          content-visibility:auto;
          contain-intrinsic-size:80px;
        }
        .weekly-plan-scroll{scroll-padding-inline:14px}
      }
    `;
    document.head.appendChild(style);
  }

  function install(){
    installStyles();
    installHistoryScroll();
    wrapShowScreen();
    wrapActionFeedback();
    installStudentProfileLogout();
    window.addEventListener('pagehide',releaseMediaUrls,{passive:true});
    window.addEventListener('pageshow',()=>{installHistoryScroll();wrapShowScreen();wrapActionFeedback();installStudentProfileLogout();},{passive:true});
    window.TeamBullsUsability=Object.freeze({
      version:VERSION,
      rememberScroll,
      restoreScroll:()=>restoreScrollForState(history.state),
      revealActiveWeek:()=>scrollActiveWeekIntoView(),
      ensureStudentProfileLogout
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();

/* Carrega o quadro semanal corrigido por uma camada network-first já existente. */
(()=>{
  const SRC='./modules/student-week-workout-layout-v10_10_40.js?v=10.10.40-weeklayout2';
  const EXPECTED_VERSION='10.10.40-weeklayout2';
  let loading=null;
  const studentContext=()=>{
    try{
      if(CURRENT_USER?.role==='trainer'||document.body?.classList.contains('trainer-desktop'))return false;
      return CURRENT_USER?.role==='student'||MODE==='local'||document.body?.classList.contains('student-desktop');
    }catch(error){return document.body?.classList.contains('student-desktop')===true;}
  };
  const ready=()=>window.TeamBullsStudentWeekWorkoutLayout?.version===EXPECTED_VERSION;
  function loadWeekWorkoutLayout(){
    if(!studentContext())return Promise.resolve(false);
    if(ready())return Promise.resolve(true);
    if(loading)return loading;
    loading=new Promise(resolve=>{
      let settled=false,timer=0;
      const finish=ok=>{if(settled)return;settled=true;if(timer)clearTimeout(timer);if(!ok)loading=null;resolve(!!ok);};
      const expectedUrl=new URL(SRC,location.href).href;
      const existing=[...document.scripts].find(script=>String(script.src||'')===expectedUrl);
      if(existing){
        if(ready()){finish(true);return;}
        existing.addEventListener('load',()=>finish(ready()),{once:true});
        existing.addEventListener('error',()=>finish(false),{once:true});
        timer=setTimeout(()=>finish(ready()),7000);
        return;
      }
      const script=document.createElement('script');
      script.src=SRC;script.async=false;script.dataset.teamBullsWeekWorkoutLayout='2';
      script.onload=()=>finish(ready());
      script.onerror=()=>finish(false);
      timer=setTimeout(()=>{try{script.remove();}catch(error){}finish(false);},7000);
      document.head.appendChild(script);
    });
    return loading;
  }
  loadWeekWorkoutLayout().catch(()=>{});
  window.addEventListener('team-bulls-student-runtime-ready',()=>loadWeekWorkoutLayout().catch(()=>{}));
  window.addEventListener('pageshow',()=>loadWeekWorkoutLayout().catch(()=>{}),{passive:true});
  window.TeamBullsWeekWorkoutLayoutLoader=Object.freeze({src:SRC,version:EXPECTED_VERSION,load:loadWeekWorkoutLayout});
})();
