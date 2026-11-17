/* Team Bulls v10.10.9 — interação unificada: rolagem, retrato e puxar para atualizar. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_INTERACTION_V10101__)return;
  window.__TEAM_BULLS_INTERACTION_V10101__=true;

  const APP_SELECTOR='#app';
  const MOBILE_MEDIA='(max-width: 899px), (pointer: coarse)';
  const PULL_THRESHOLD=78;
  const PULL_MAX=126;
  let cachedScroller=null;
  let portraitRetryAt=0;
  let orientationFrame=0;

  function appScroller(){
    if(cachedScroller?.isConnected)return cachedScroller;
    cachedScroller=document.querySelector(APP_SELECTOR);
    return cachedScroller;
  }
  function isMobileLike(){return window.matchMedia?.(MOBILE_MEDIA)?.matches??window.innerWidth<900;}
  function isEditable(element){
    if(!element||element.disabled||element.readOnly)return false;
    if(element.matches?.('textarea,[contenteditable="true"]'))return true;
    if(!element.matches?.('input'))return false;
    return !['button','checkbox','color','file','hidden','image','radio','range','reset','submit'].includes(String(element.type||'text').toLowerCase());
  }
  function normalizedQuarterTurn(value){
    const number=Number(value);if(!Number.isFinite(number))return null;
    const angle=((number%360)+360)%360;return angle===90||angle===270;
  }
  function isPhysicalLandscape(){
    const orientation=window.screen?.orientation;
    const type=String(orientation?.type||'').toLowerCase();
    if(type.startsWith('landscape'))return true;
    if(type.startsWith('portrait'))return false;
    const modernAngle=normalizedQuarterTurn(orientation?.angle);
    if(modernAngle!==null)return modernAngle;
    const legacyAngle=normalizedQuarterTurn(window.orientation);
    if(legacyAngle!==null)return legacyAngle;
    const screenWidth=Number(window.screen?.width||0),screenHeight=Number(window.screen?.height||0);
    if(screenWidth>0&&screenHeight>0&&Math.abs(screenWidth-screenHeight)>24)return screenWidth>screenHeight;
    const keyboardOpen=document.documentElement.classList.contains('virtual-keyboard-open')||isEditable(document.activeElement);
    if(keyboardOpen)return false;
    return window.innerWidth>window.innerHeight;
  }
  function topModal(){const items=document.querySelectorAll('.modal-backdrop.open');return items[items.length-1]||null;}

  function syncOrientationState(){
    orientationFrame=0;
    const landscape=isMobileLike()&&isPhysicalLandscape();
    document.documentElement.classList.toggle('mobile-landscape-blocked',landscape);
    const overlay=document.getElementById('portrait-lock-overlay');
    if(!overlay)return;
    overlay.setAttribute('aria-hidden',landscape?'false':'true');
    if(landscape)overlay.removeAttribute('inert');else overlay.setAttribute('inert','');
  }
  function scheduleOrientationSync(){
    if(orientationFrame)return;
    orientationFrame=requestAnimationFrame(syncOrientationState);
  }
  async function requestPortraitLock(force=false){
    if(!isMobileLike())return false;
    const now=Date.now();
    if(!force&&now-portraitRetryAt<1500)return false;
    portraitRetryAt=now;
    const orientation=window.screen?.orientation;
    if(!orientation||typeof orientation.lock!=='function')return false;
    const standalone=window.matchMedia?.('(display-mode: standalone)')?.matches||navigator.standalone===true||document.fullscreenElement;
    if(!standalone&&!force)return false;
    try{await orientation.lock('portrait-primary');return true;}
    catch(primaryError){try{await orientation.lock('portrait');return true;}catch(error){return false;}}
  }

  function nearestVerticalScroller(target,limit){
    let node=target instanceof Element?target:null;
    while(node&&node!==document.body&&node!==document.documentElement){
      if(node===limit)return limit;
      const style=getComputedStyle(node),overflow=style.overflowY;
      if((overflow==='auto'||overflow==='scroll'||overflow==='overlay')&&node.scrollHeight>node.clientHeight+1)return node;
      node=node.parentElement;
    }
    return limit;
  }
  function canScrollInDirection(element,delta){
    if(!element||Math.abs(delta)<.5)return false;
    if(delta<0)return element.scrollTop>0;
    return element.scrollTop+element.clientHeight<element.scrollHeight-1;
  }
  function wheelPixels(event,scroller){
    if(event.deltaMode===1)return event.deltaY*18;
    if(event.deltaMode===2)return event.deltaY*Math.max(320,scroller?.clientHeight||window.innerHeight);
    return event.deltaY;
  }
  function bindDesktopWheel(){
    document.addEventListener('wheel',event=>{
      if(window.innerWidth<900||event.defaultPrevented||event.ctrlKey||event.metaKey||event.shiftKey)return;
      if(Math.abs(event.deltaX)>Math.abs(event.deltaY))return;
      const scroller=appScroller();
      if(!scroller||scroller.scrollHeight<=scroller.clientHeight+1)return;
      const delta=wheelPixels(event,scroller);if(Math.abs(delta)<.5)return;
      const modal=event.target instanceof Element?event.target.closest('.modal-backdrop.open'):null;
      if(modal){
        const modalScroller=nearestVerticalScroller(event.target,modal);
        event.preventDefault();
        if(modalScroller!==modal&&canScrollInDirection(modalScroller,delta))modalScroller.scrollTop+=delta;
        return;
      }
      const nested=nearestVerticalScroller(event.target,scroller);
      event.preventDefault();
      if(nested!==scroller&&canScrollInDirection(nested,delta)){nested.scrollTop+=delta;return;}
      scroller.scrollTop+=delta;
    },{capture:true,passive:false});
  }

  function bindScreenReset(){
    const base=window.showScreen;
    if(typeof base!=='function'||base.__v108ScrollWrapped)return;
    const wrapped=function(){
      const result=base.apply(this,arguments);
      if(result!==false)requestAnimationFrame(()=>{const scroller=appScroller();if(scroller)scroller.scrollTop=0;});
      return result;
    };
    wrapped.__v108ScrollWrapped=true;
    window.showScreen=wrapped;
  }

  function cancelInterruptedDrag(){
    const reset=()=>{
      if(!document.body.classList.contains('reorder-active'))return;
      document.body.classList.remove('reorder-active');
      document.querySelectorAll('.reorderable-card.is-dragging').forEach(card=>card.classList.remove('is-dragging'));
    };
    window.addEventListener('blur',reset,{passive:true});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();},{passive:true});
  }

  function waitForWorkerState(worker,state,timeout=3500){
    if(!worker||worker.state===state)return Promise.resolve(true);
    return new Promise(resolve=>{
      let settled=false;
      const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);worker.removeEventListener('statechange',change);resolve(value);};
      const change=()=>{if(worker.state===state)finish(true);else if(worker.state==='redundant')finish(false);};
      const timer=setTimeout(()=>finish(false),timeout);
      worker.addEventListener('statechange',change);
    });
  }
  function waitForControllerChange(timeout=1800){
    return new Promise(resolve=>{
      let settled=false;
      const finish=()=>{if(settled)return;settled=true;clearTimeout(timer);navigator.serviceWorker?.removeEventListener('controllerchange',finish);resolve();};
      const timer=setTimeout(finish,timeout);
      navigator.serviceWorker?.addEventListener('controllerchange',finish,{once:true});
    });
  }
  async function updateServiceWorker(){
    if(!('serviceWorker' in navigator))return;
    try{
      if(window.TeamBullsUpdater?.prepareLatest){
        await window.TeamBullsUpdater.prepareLatest({forceCheck:true});
        return;
      }
      const registration=await navigator.serviceWorker.getRegistration();
      if(!registration)return;
      await registration.update().catch(()=>{});
      if(registration.installing)await waitForWorkerState(registration.installing,'installed');
      const waiting=registration.waiting;
      if(waiting){const changed=waitForControllerChange();waiting.postMessage({type:'SKIP_WAITING'});await changed;}
      navigator.serviceWorker.controller?.postMessage?.({type:'REFRESH_APP_SHELL'});
    }catch(error){console.warn('Atualização do Service Worker não concluída:',error);}
  }

  async function refreshPage(){
    if(window.__TEAM_BULLS_REFRESHING__)return;
    window.__TEAM_BULLS_REFRESHING__=true;
    const indicator=document.getElementById('pull-refresh-indicator');
    const label=document.getElementById('pull-refresh-label');
    indicator?.classList.add('refreshing','visible');
    if(label)label.textContent='Atualizando…';
    document.documentElement.classList.add('pull-refresh-running');
    try{
      window.dispatchEvent(new CustomEvent('team-bulls:before-refresh'));
      const TB=window.TeamBulls107;
      await Promise.allSettled([
        Promise.resolve(TB?.flushDrafts?.()),
        Promise.race([Promise.resolve(TB?.flushPendingMutationSync?.()),new Promise(resolve=>setTimeout(resolve,2400))])
      ]);
      await updateServiceWorker();
      await new Promise(resolve=>setTimeout(resolve,220));
    }finally{
      location.reload();
    }
  }
  window.TeamBullsRefresh=Object.freeze({refresh:refreshPage});

  function bindPullToRefresh(){
    const scroller=appScroller(),indicator=document.getElementById('pull-refresh-indicator'),label=document.getElementById('pull-refresh-label');
    if(!scroller||!indicator)return;
    let tracking=false,pulling=false,startX=0,startY=0,distance=0;

    const eligibleTarget=target=>{
      if(!isMobileLike()||window.__TEAM_BULLS_REFRESHING__)return false;
      const user=typeof CURRENT_USER!=='undefined'?CURRENT_USER:null;
      if(user?.role!=='student')return false;
      if(document.documentElement.classList.contains('mobile-landscape-blocked'))return false;
      if(topModal())return false;
      if(target instanceof Element&&target.closest('input,textarea,select,[contenteditable="true"],.drag-handle,.reorder-handle,.weekly-plan-scroll,.horizontal-scroll'))return false;
      return scroller.scrollTop<=1;
    };
    const paint=value=>{
      distance=Math.max(0,Math.min(PULL_MAX,value));
      const progress=Math.min(1,distance/PULL_THRESHOLD);
      indicator.style.setProperty('--pull-distance',distance.toFixed(1)+'px');
      indicator.style.setProperty('--pull-progress',String(progress));
      indicator.classList.toggle('visible',distance>2);
      indicator.classList.toggle('armed',distance>=PULL_THRESHOLD);
      if(label)label.textContent=distance>=PULL_THRESHOLD?'Solte para atualizar':'Puxe para atualizar';
    };
    const reset=()=>{
      tracking=false;pulling=false;distance=0;
      indicator.classList.remove('visible','armed');
      indicator.style.removeProperty('--pull-distance');
      indicator.style.removeProperty('--pull-progress');
      if(label)label.textContent='Puxe para atualizar';
    };
    scroller.addEventListener('touchstart',event=>{
      if(event.touches.length!==1||!eligibleTarget(event.target)){reset();return;}
      const touch=event.touches[0];startX=touch.clientX;startY=touch.clientY;tracking=true;pulling=false;distance=0;
    },{passive:true});
    scroller.addEventListener('touchmove',event=>{
      if(!tracking||event.touches.length!==1)return;
      const touch=event.touches[0],dy=touch.clientY-startY,dx=touch.clientX-startX;
      if(dy<=0||Math.abs(dx)>Math.abs(dy)*.72||scroller.scrollTop>1){reset();return;}
      if(dy<7)return;
      pulling=true;event.preventDefault();
      const resisted=Math.min(PULL_MAX,Math.pow(dy,0.82)*1.55);
      paint(resisted);
    },{passive:false});
    scroller.addEventListener('touchend',()=>{
      if(!tracking)return;
      const shouldRefresh=pulling&&distance>=PULL_THRESHOLD;
      if(shouldRefresh){indicator.classList.add('refreshing');refreshPage();}
      else reset();
      tracking=false;pulling=false;
    },{passive:true});
    scroller.addEventListener('touchcancel',reset,{passive:true});
    window.addEventListener('pageshow',()=>{if(!window.__TEAM_BULLS_REFRESHING__)reset();},{passive:true});
  }

  function boot(){
    bindDesktopWheel();
    bindScreenReset();
    cancelInterruptedDrag();
    bindPullToRefresh();
    syncOrientationState();
    requestPortraitLock(false);
    window.addEventListener('resize',()=>{scheduleOrientationSync();requestPortraitLock(false);},{passive:true});
    window.visualViewport?.addEventListener('resize',scheduleOrientationSync,{passive:true});
    window.addEventListener('orientationchange',()=>{scheduleOrientationSync();setTimeout(()=>requestPortraitLock(true),80);setTimeout(scheduleOrientationSync,180);},{passive:true});
    window.addEventListener('pageshow',()=>{scheduleOrientationSync();requestPortraitLock(false);},{passive:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){scheduleOrientationSync();requestPortraitLock(false);}},{passive:true});
    document.addEventListener('pointerdown',()=>requestPortraitLock(false),{capture:true,passive:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();


/* Team Bulls v10.10.9 — navegação móvel integrada ao histórico e ao contexto interno. */
(()=>{
  'use strict';
  const snapshots=new Map();let sequence=0,currentKey='',sentinelKey='',rootKey='',restoring=false,initialized=false,pendingModalBack='';
  const activeScreen=()=>document.querySelector('.screen.active')?.id||'screen-loading';
  const entityId=value=>String(value?.uid||value?.id||value||'');
  function capture(screen=activeScreen()){
    return{screen,modals:[...document.querySelectorAll('.modal-backdrop.open')].map(modal=>modal.id),curWorkout:typeof CUR_WORKOUT!=='undefined'?CUR_WORKOUT:null,curDay:typeof CUR_DAY!=='undefined'?CUR_DAY:'',curEx:typeof CUR_EX!=='undefined'?CUR_EX:null,viewStudent:typeof VIEW_STUDENT!=='undefined'?VIEW_STUDENT:null,viewStudentWorkout:typeof VIEW_STUDENT_WORKOUT!=='undefined'?VIEW_STUDENT_WORKOUT:null,viewStudentDay:typeof VIEW_STUDENT_DAY!=='undefined'?VIEW_STUDENT_DAY:'',viewStudentExercise:typeof VIEW_STUDENT_EXERCISE!=='undefined'?VIEW_STUDENT_EXERCISE:null,currentDietId:typeof CURRENT_DIET_ID!=='undefined'?CURRENT_DIET_ID:'',dietVariantId:typeof CURRENT_DIET_VARIANT_ID!=='undefined'?CURRENT_DIET_VARIANT_ID:''};
  }
  function contextSignature(snapshot){
    if(!snapshot)return'';
    return[
      snapshot.screen||'',entityId(snapshot.curWorkout),snapshot.curDay||'',entityId(snapshot.curEx),
      entityId(snapshot.viewStudent),entityId(snapshot.viewStudentWorkout),snapshot.viewStudentDay||'',
      entityId(snapshot.viewStudentExercise),snapshot.currentDietId||'',snapshot.dietVariantId||''
    ].join('|');
  }
  function restoreContext(snapshot){if(!snapshot)return;try{if(typeof CUR_WORKOUT!=='undefined')CUR_WORKOUT=snapshot.curWorkout;if(typeof CUR_DAY!=='undefined')CUR_DAY=snapshot.curDay||'';if(typeof CUR_EX!=='undefined')CUR_EX=snapshot.curEx;if(typeof VIEW_STUDENT!=='undefined')VIEW_STUDENT=snapshot.viewStudent;if(typeof VIEW_STUDENT_WORKOUT!=='undefined')VIEW_STUDENT_WORKOUT=snapshot.viewStudentWorkout;if(typeof VIEW_STUDENT_DAY!=='undefined')VIEW_STUDENT_DAY=snapshot.viewStudentDay||'';if(typeof VIEW_STUDENT_EXERCISE!=='undefined')VIEW_STUDENT_EXERCISE=snapshot.viewStudentExercise;if(typeof CURRENT_DIET_ID!=='undefined')CURRENT_DIET_ID=snapshot.currentDietId||'';if(typeof CURRENT_DIET_VARIANT_ID!=='undefined')CURRENT_DIET_VARIANT_ID=snapshot.dietVariantId||'';}catch(error){}}
  const openModals=()=>[...document.querySelectorAll('.modal-backdrop.open')].sort((a,b)=>(Number(a.dataset?.tbModalOpenSeq)||0)-(Number(b.dataset?.tbModalOpenSeq)||0));
  function stateFor(snapshot,extra={}){const key='tb-'+(++sequence),parentKey=Object.prototype.hasOwnProperty.call(extra,'parentKey')?extra.parentKey:(currentKey||'');snapshots.set(key,snapshot);return{teamBulls:true,key,parentKey,...extra};}
  function syncCurrentSnapshot(snapshot=capture()){
    if(currentKey&&snapshots.has(currentKey))snapshots.set(currentKey,snapshot);
    return snapshot;
  }
  function previousEntry(state=history.state){
    const previousKey=String(state?.parentKey||'');
    return previousKey&&snapshots.has(previousKey)?[previousKey,snapshots.get(previousKey)]:null;
  }
  function restoreState(state){
    const snapshot=snapshots.get(state?.key);if(!snapshot)return;
    const sameView=contextSignature(capture())===contextSignature(snapshot);
    restoring=true;
    try{
      const expected=new Set(sameView?snapshot.modals||[]:[]);
      for(const modal of openModals().reverse()){
        const reference=!sameView&&modal.dataset?.tbWorkspacePersistent==='1'&&typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role==='trainer'&&
          String(snapshot.viewStudent?.uid||'')===modal.dataset.tbWorkspaceStudentUid;
        if(!expected.has(modal.id)&&!reference)window.__TB_HISTORY_BASE_CLOSE__?.(modal.id);
      }
      restoreContext(snapshot);
      if(!sameView)window.__TB_HISTORY_BASE_SHOW__?.(snapshot.screen);
    }finally{restoring=false;}
    currentKey=state.key;
  }
  function init(){
    if(initialized||typeof history==='undefined'||typeof window.showScreen!=='function')return;initialized=true;
    if('scrollRestoration' in history)history.scrollRestoration='manual';
    const baseShow=window.showScreen,baseOpen=window.openModal,baseClose=window.closeModal;window.__TB_HISTORY_BASE_SHOW__=baseShow;window.__TB_HISTORY_BASE_CLOSE__=baseClose;
    const initial=capture(),sentinel=stateFor(initial,{sentinel:true,parentKey:''}),root=stateFor(initial,{root:true,parentKey:sentinel.key});sentinelKey=sentinel.key;rootKey=root.key;history.replaceState(sentinel,'',location.href);history.pushState(root,'',location.href);currentKey=root.key;
    window.showScreen=function(id,token=null){
      const before=activeScreen(),stored=snapshots.get(currentKey)||capture(before),result=baseShow.call(this,id,token);
      if(result===false||restoring||!id)return result;
      const snapshot=capture(id);
      if(id===before){
        if(contextSignature(stored)!==contextSignature(snapshot)){
          const next=stateFor(snapshot);history.pushState(next,'',location.href);currentKey=next.key;
        }else syncCurrentSnapshot(snapshot);
        return result;
      }
      /* A primeira tela real substitui o carregamento inicial; voltar nunca leva a uma tela vazia. */
      if(before==='screen-loading'&&history.state?.root){snapshots.set(rootKey,snapshot);snapshots.set(sentinelKey,snapshot);history.replaceState({...history.state,key:rootKey,root:true},'',location.href);currentKey=rootKey;return result;}
      /* Botões internos de voltar usam o mesmo histórico do gesto do aparelho. */
      const prior=previousEntry(history.state);if(prior?.[1]?.screen===id&&contextSignature(prior[1])===contextSignature(snapshot)){history.back();return result;}
      const next=stateFor(snapshot);history.pushState(next,'',location.href);currentKey=next.key;return result;
    };
    window.openModal=function(id){
      const alreadyOpen=openModals().some(modal=>modal.id===id);
      syncCurrentSnapshot(capture());
      const result=baseOpen.call(this,id);
      if(!restoring&&id&&!alreadyOpen&&result!==false&&openModals().some(modal=>modal.id===id)){
        const replacing=pendingModalBack===history.state?.key;
        const state=stateFor(capture(),{modal:id,...(replacing?{parentKey:history.state.parentKey}:{})});
        if(replacing){pendingModalBack='';history.replaceState(state,'',location.href);}
        else history.pushState(state,'',location.href);
        currentKey=state.key;
      }
      return result;
    };
    window.closeModal=function(id){
      const opened=openModals().some(modal=>modal.id===id);
      const isHistoryModal=opened&&!restoring&&history.state?.teamBulls&&history.state.modal===id&&pendingModalBack!==history.state.key;
      const result=baseClose.call(this,id);
      if(result===false||openModals().some(modal=>modal.id===id))return result;
      if(isHistoryModal){
        const snapshot=capture(activeScreen()),prior=previousEntry(history.state);
        if(prior)snapshots.set(prior[0],snapshot);
        syncCurrentSnapshot(snapshot);
        const closingKey=history.state.key;
        pendingModalBack=closingKey;
        setTimeout(()=>{
          if(pendingModalBack===closingKey&&history.state?.key===closingKey)history.back();
        },0);
      }
      return result;
    };
    addEventListener('popstate',event=>{pendingModalBack='';const state=event.state;if(!state?.teamBulls){const guard=stateFor(capture(activeScreen()),{root:true});history.pushState(guard,'',location.href);currentKey=guard.key;return;}if(state.sentinel){const guard=stateFor(snapshots.get(state.key)||capture(activeScreen()),{root:true});history.pushState(guard,'',location.href);currentKey=guard.key;return;}restoreState(state);});
    window.TeamBullsNavigation=Object.freeze({back:()=>history.back(),current:()=>history.state,syncCurrent:()=>syncCurrentSnapshot(capture()),signature:()=>contextSignature(capture())});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(init,0),{once:true});else setTimeout(init,0);
})();
