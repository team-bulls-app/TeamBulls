/* Team Bulls v10.10.31 — datas da Home sem bloquear a pintura por leitura de rede. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_STUDENT_HOME_FAST_PROTOCOL_DATE_10_10_31__)return;
  window.__TEAM_BULLS_STUDENT_HOME_FAST_PROTOCOL_DATE_10_10_31__=true;

  const VERSION='10.10.31-fastdates1';
  const CACHE_PREFIX='team_bulls_home_protocol_date_v1_';
  const CACHE_MAX_AGE_MS=14*24*60*60*1000;
  let observer=null;
  let patchedLayout=null;

  const currentUser=()=>{try{return typeof CURRENT_USER!=='undefined'?CURRENT_USER:null;}catch(error){return null;}};
  const activeScreen=()=>document.querySelector('.screen.active')?.id||'';
  const studentUid=()=>String(currentUser()?.role==='student'&&currentUser()?.uid||'');
  const validDisplayDate=value=>/^\d{2}\/\d{2}\/\d{4}$/.test(String(value||''));
  const fmtDate=value=>{
    const raw=String(value||'');
    if(/^\d{4}-\d{2}-\d{2}$/.test(raw)){const [year,month,day]=raw.split('-');return `${day}/${month}/${year}`;}
    try{const date=value?.toDate?.()||new Date(value);return Number.isFinite(date.getTime())?date.toLocaleDateString('pt-BR'):'A DEFINIR';}catch(error){return'A DEFINIR';}
  };
  function cacheRead(uid){
    if(!uid)return null;
    try{const item=JSON.parse(localStorage.getItem(CACHE_PREFIX+uid)||'null');if(!item||!validDisplayDate(item.date)||Date.now()-Number(item.savedAt||0)>CACHE_MAX_AGE_MS)return null;return item;}catch(error){return null;}
  }
  function cacheWrite(uid,date,pending){
    if(!uid||!validDisplayDate(date))return false;
    try{localStorage.setItem(CACHE_PREFIX+uid,JSON.stringify({date,pending:!!pending,savedAt:Date.now()}));return true;}catch(error){return false;}
  }
  function stateFromRuntime(uid){
    if(!uid)return null;
    try{
      if(typeof V109_PROTOCOL_REVIEW_STUDENT==='undefined'||String(V109_PROTOCOL_REVIEW_STUDENT||'')!==uid||typeof v109ProtocolState!=='function')return null;
      const state=v109ProtocolState(typeof V109_PROTOCOL_REVIEW_SCHEDULE!=='undefined'?V109_PROTOCOL_REVIEW_SCHEDULE:null);
      if(!state?.nextDueDate)return null;
      const date=fmtDate(state.nextDueDate);return validDisplayDate(date)?{date,pending:!!state.pending}:null;
    }catch(error){return null;}
  }
  function stateFromHomeText(){
    const text=String(document.getElementById('workout-list')?.textContent||document.getElementById('screen-home')?.textContent||'');
    const match=text.match(/atualiza(?:ção|cao)\s+(\d{2}\/\d{2}\/\d{4})/i);
    return match?{date:match[1],pending:false}:null;
  }
  function slots(){return [...document.querySelectorAll('#screen-home .tb-v17-next')].slice(0,2);}
  function render(state,{onlyLoading=false}={}){
    const list=slots();if(list.length<2)return false;
    const safe=state&&validDisplayDate(state.date)?state:{date:'A DEFINIR',pending:false};
    list.forEach((slot,index)=>{
      const strong=slot.querySelector('strong'),label=slot.querySelector('span');if(!strong)return;
      const current=String(strong.textContent||'').trim().toUpperCase();
      if(onlyLoading&&current&&current!=='CARREGANDO...'&&current!=='SINCRONIZANDO...')return;
      slot.dataset.state=safe.pending?'pending':'scheduled';
      if(label)label.textContent=safe.pending?'ATUALIZAÇÃO PENDENTE DESDE':index===0?'PRÓXIMA ATUALIZAÇÃO':'PRÓXIMO PROTOCOLO';
      strong.textContent=safe.date;
    });
    return true;
  }
  function fastRender(){
    if(activeScreen()!=='screen-home'||currentUser()?.role!=='student')return false;
    const uid=studentUid(),state=stateFromRuntime(uid)||cacheRead(uid)||stateFromHomeText();
    return render(state,{onlyLoading:true});
  }
  function rememberRenderedDate(){
    const uid=studentUid();if(!uid)return;
    const first=slots()[0],date=String(first?.querySelector('strong')?.textContent||'').trim();
    if(validDisplayDate(date))cacheWrite(uid,date,first?.dataset.state==='pending');
  }
  function observeSlots(){
    const host=document.getElementById('home-stats');if(!host||typeof MutationObserver!=='function')return false;
    if(observer)observer.disconnect();
    observer=new MutationObserver(()=>{fastRender();rememberRenderedDate();});
    observer.observe(host,{subtree:true,childList:true,characterData:true});return true;
  }
  function patchLayout(){
    const base=window.TeamBullsStudentHomeLayout;
    if(!base||base===patchedLayout||base.__tbFastProtocolDate===true)return !!base;
    const wrapped=Object.freeze({...base,__tbFastProtocolDate:true,refresh(){fastRender();const result=base.refresh?.();Promise.resolve(result).finally(()=>rememberRenderedDate());return result;}});
    patchedLayout=wrapped;window.TeamBullsStudentHomeLayout=wrapped;return true;
  }
  function sync(){
    if(activeScreen()!=='screen-home'||currentUser()?.role!=='student')return false;
    patchLayout();fastRender();observeSlots();setTimeout(()=>{fastRender();rememberRenderedDate();},120);return true;
  }

  window.addEventListener('team-bulls-student-runtime-ready',sync);
  window.addEventListener('pageshow',sync,{passive:true});
  window.addEventListener('online',()=>{fastRender();},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')sync();},{passive:true});
  [0,100,350,900].forEach(delay=>setTimeout(sync,delay));

  window.TeamBullsStudentHomeFastProtocolDate=Object.freeze({version:VERSION,sync,render:fastRender,cache:()=>cacheRead(studentUid())});
})();
