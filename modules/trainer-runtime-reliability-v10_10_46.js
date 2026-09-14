/* Team Bulls v10.10.46 — confiabilidade do runtime do treinador e navegação imediata. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_TRAINER_RUNTIME_RELIABILITY_101046__)return;
  window.__TEAM_BULLS_TRAINER_RUNTIME_RELIABILITY_101046__=true;

  const VERSION='10.10.46-trainer1';
  const REPORTS_SRC='./modules/trainer-sent-reports-v10_10_46.js?v=10.10.46-sentreports2';
  const FEEDBACK_SRC='./modules/trainer-feedback-archive-v10_10_46.js?v=10.10.46-feedback2';
  const loads=new Map();
  let viewStudentBase=null;

  const trainer=()=>{try{return typeof CURRENT_USER!=='undefined'&&CURRENT_USER?.role==='trainer'&&typeof MODE!=='undefined'&&MODE==='cloud';}catch(error){return false;}};
  const copyFlags=(target,source)=>{try{Object.keys(source||{}).forEach(key=>{try{target[key]=source[key];}catch(error){}});}catch(error){}return target;};

  function loadScript(src,timeout=7000){
    const existing=[...document.scripts].find(script=>script.src===new URL(src,location.href).href&&script.dataset.tbReady==='1');
    if(existing)return Promise.resolve(true);
    if(loads.has(src))return loads.get(src);
    const promise=new Promise(resolve=>{
      const script=document.createElement('script');
      let settled=false;
      const finish=ok=>{if(settled)return;settled=true;clearTimeout(timer);if(ok)script.dataset.tbReady='1';else script.remove();loads.delete(src);resolve(ok);};
      script.src=src;script.async=true;script.onload=()=>finish(true);script.onerror=()=>finish(false);
      const timer=setTimeout(()=>finish(false),Math.max(2500,timeout));
      document.head.appendChild(script);
    });
    loads.set(src,promise);return promise;
  }

  function setStudentLoading(student){
    const title=document.getElementById('ts-title');if(title)title.textContent='ARQUIVO // '+String(student?.name||'ALUNO').toUpperCase();
    const list=document.getElementById('ts-workout-list');if(list)list.innerHTML='<div class="no-data-inline">Carregando protocolos do aluno...</div>';
    const empty=document.getElementById('ts-workout-empty');if(empty)empty.style.display='none';
  }

  function patchViewStudent(){
    try{
      if(typeof viewStudent!=='function')return false;
      if(viewStudent.__tbTrainerImmediateNavigation101046)return true;
      viewStudentBase=viewStudent;
      const wrapped=async function(suid,sname,email,status){
        const student={uid:String(suid||''),name:String(sname||'Aluno'),email:String(email||''),status:String(status||'active')};
        if(!student.uid)return false;
        try{
          const navigation=typeof beginAsyncNavigation==='function'?beginAsyncNavigation():null;
          VIEW_STUDENT=student;
          setStudentLoading(student);
          if(typeof showScreen==='function')showScreen('screen-trainer-student',navigation);
          try{
            await renderTrainerStudent(VIEW_STUDENT);
            return true;
          }catch(error){
            console.warn('[Team Bulls] abertura do aluno concluída com dados pendentes',error);
            if(typeof showToast==='function')showToast('O arquivo do aluno abriu, mas alguns dados ainda não responderam. Toque novamente para atualizar.',true);
            return false;
          }
        }catch(error){
          console.warn('[Team Bulls] falha ao abrir aluno pelo runtime resiliente',error);
          try{return await viewStudentBase.apply(this,arguments);}catch(baseError){if(typeof showToast==='function')showToast('Não foi possível abrir este aluno agora.',true);return false;}
        }
      };
      copyFlags(wrapped,viewStudentBase);
      wrapped.__tbTrainerImmediateNavigation101046=true;
      viewStudent=wrapped;
      return true;
    }catch(error){return false;}
  }

  async function ensureArchives(){
    if(!trainer())return false;
    // Impede que revisões antigas cacheadas assumam novamente as mesmas telas.
    window.__TEAM_BULLS_TRAINER_SENT_REPORTS_101033__=true;
    window.__TEAM_BULLS_TRAINER_FEEDBACK_ARCHIVE_101037__=true;
    const [reports,feedback]=await Promise.all([loadScript(REPORTS_SRC),loadScript(FEEDBACK_SRC)]);
    return reports&&feedback;
  }

  async function install(){
    if(!trainer())return false;
    patchViewStudent();
    await ensureArchives();
    return true;
  }

  function openStudent(uid,name,email,status){
    if(typeof viewStudent!=='function')return false;
    viewStudent(String(uid||''),String(name||'Aluno'),String(email||''),String(status||'active'));
    return true;
  }

  patchViewStudent();
  if(trainer())install();
  window.addEventListener('team-bulls-runtime-state',()=>{if(trainer())install();});
  window.addEventListener('team-bulls-runtime-ready',()=>{if(trainer())install();});
  window.addEventListener('pageshow',()=>{if(trainer())install();},{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&trainer())install();},{passive:true});

  window.TeamBullsTrainerRuntimeReliability=Object.freeze({version:VERSION,install,openStudent,patchViewStudent,ensureArchives});
})();
