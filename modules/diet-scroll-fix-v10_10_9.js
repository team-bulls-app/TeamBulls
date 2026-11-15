/* Team Bulls v10.10.9 — correção de rolagem real na montagem da dieta. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_DIET_SCROLL_FIX_V10109__)return;
  window.__TEAM_BULLS_DIET_SCROLL_FIX_V10109__=true;

  const DIET_SCREENS=new Set(['screen-ts-diet-detail','screen-diet-detail']);

  function appScroller(){return document.getElementById('app');}
  function activeDietScreen(){
    const screen=document.querySelector('.screen.active');
    return screen&&DIET_SCREENS.has(screen.id)?screen:null;
  }
  function captureDietScroll(){
    const scroller=appScroller(),screen=activeDietScreen();
    if(!scroller||!screen)return null;
    return{
      screenId:screen.id,
      navigation:typeof NAVIGATION_SEQ==='number'?NAVIGATION_SEQ:null,
      appTop:Number(scroller.scrollTop)||0,
      screenTop:Number(screen.scrollTop)||0,
      dietId:typeof CURRENT_DIET_ID!=='undefined'?String(CURRENT_DIET_ID||''):'',
      variantId:typeof CURRENT_DIET_VARIANT_ID!=='undefined'?String(CURRENT_DIET_VARIANT_ID||''):''
    };
  }
  function contextStillMatches(state){
    if(!state||state.navigation!==null&&typeof NAVIGATION_SEQ==='number'&&state.navigation!==NAVIGATION_SEQ)return false;
    const screen=document.getElementById(state.screenId);
    if(!screen?.classList.contains('active'))return false;
    if(state.dietId&&typeof CURRENT_DIET_ID!=='undefined'&&String(CURRENT_DIET_ID||'')!==state.dietId)return false;
    return true;
  }
  function restoreDietScroll(state){
    if(!contextStillMatches(state))return;
    const scroller=appScroller(),screen=document.getElementById(state.screenId);
    if(!scroller||!screen)return;
    scroller.scrollTop=state.appTop;
    if(screen.scrollTop!==state.screenTop)screen.scrollTop=state.screenTop;
  }
  function scheduleRestore(state){
    if(!state)return;
    const restore=()=>restoreDietScroll(state);
    requestAnimationFrame(()=>{restore();requestAnimationFrame(restore);});
    setTimeout(restore,45);
    setTimeout(restore,110);
  }
  function wrapRenderer(name){
    const base=window[name];
    if(typeof base!=='function'||base.__tbRealDietScrollFix)return;
    const wrapped=function(...args){
      const state=captureDietScroll();
      const result=base.apply(this,args);
      scheduleRestore(state);
      return result;
    };
    wrapped.__tbRealDietScrollFix=true;
    window[name]=wrapped;
  }
  function wrapAsyncAction(name){
    const base=window[name];
    if(typeof base!=='function'||base.__tbRealDietScrollFix)return;
    const wrapped=async function(...args){
      const state=captureDietScroll();
      try{return await base.apply(this,args);}
      finally{scheduleRestore(state);}
    };
    wrapped.__tbRealDietScrollFix=true;
    window[name]=wrapped;
  }

  // Renderizações que substituem blocos dentro da mesma tela de dieta.
  ['renderDietSupportTables','renderMealsList','renderDietVariantTabs','v104ActivateVariantMeals']
    .forEach(wrapRenderer);

  // Ações assíncronas mantêm a posição capturada antes de fechar o modal e salvar.
  ['saveDietSupportItem','saveMeal','saveDietVariant','saveTrainerSupplementCatalogItem']
    .forEach(wrapAsyncAction);

  window.TeamBullsDietScrollFix=Object.freeze({captureDietScroll,restoreDietScroll});
})();
