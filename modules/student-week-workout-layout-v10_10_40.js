/* Team Bulls v10.10.40 — visão semanal compacta do treino do aluno. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_STUDENT_WEEK_WORKOUT_LAYOUT_101040__)return;
  window.__TEAM_BULLS_STUDENT_WEEK_WORKOUT_LAYOUT_101040__=true;

  const VERSION='10.10.40-weeklayout1';
  const selectedWeeks=new Map();

  const currentUser=()=>{try{return typeof CURRENT_USER!=='undefined'?CURRENT_USER:null;}catch(error){return null;}};
  const coreMode=()=>{try{return typeof MODE!=='undefined'?MODE:'';}catch(error){return'';}};
  const studentContext=()=>{
    if(currentUser()?.role==='trainer'||document.body?.classList.contains('trainer-desktop'))return false;
    if(currentUser()?.role==='student')return true;
    return coreMode()==='local'||document.body?.classList.contains('student-desktop');
  };
  const clampWeek=value=>Math.max(1,Math.min(8,Number(value)||1));
  const validIsoDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
  const html=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const activeWorkout=()=>{try{return typeof getW==='function'?getW(CUR_WORKOUT):null;}catch(error){return null;}};
  const workoutKey=workout=>String(workout?.id||(()=>{try{return CUR_WORKOUT||'';}catch(error){return'';}})());

  function cycleWeek(workout){
    try{
      if(validIsoDate(workout?.startDate)&&typeof v104CycleWeek==='function'&&typeof today==='function')return clampWeek(v104CycleWeek(workout.startDate,today()));
    }catch(error){}
    try{return clampWeek(LAST_SESSION_WEEK);}catch(error){return 1;}
  }

  function selectedWeek(workout){
    const key=workoutKey(workout),saved=selectedWeeks.get(key);
    let week=0;
    try{if(Number(LAST_SESSION_WEEK)>=1&&Number(LAST_SESSION_WEEK)<=8)week=clampWeek(LAST_SESSION_WEEK);}catch(error){}
    if(!week&&saved)week=clampWeek(saved);
    if(!week)week=cycleWeek(workout);
    selectedWeeks.set(key,week);
    try{LAST_SESSION_WEEK=week;}catch(error){}
    return week;
  }

  function cycleRange(workout,week){
    try{
      if(validIsoDate(workout?.startDate)&&typeof v104CycleRange==='function')return String(v104CycleRange(workout.startDate,week)||'');
    }catch(error){}
    return'';
  }

  function isCurrentCycleWeek(workout,week){return clampWeek(week)===cycleWeek(workout);}

  function belongsToCurrentCycle(session,workout){
    try{
      const api=window.TeamBullsSessionIntegrity;
      if(typeof api?.belongsToCurrentCycle==='function')return api.belongsToCurrentCycle(session,workout)!==false;
    }catch(error){}
    const start=String(workout?.startDate||''),date=String(session?.date||'');
    if(!validIsoDate(start)||!validIsoDate(date))return true;
    return date>=start;
  }

  function completedCount(exercise,workout,week){
    return (exercise?.sessions||[]).filter(session=>Number(session?.week)===Number(week)&&belongsToCurrentCycle(session,workout)).length;
  }

  function techniqueCodes(exercise,week){
    try{
      if(typeof techniqueItemsForExercise!=='function')return[];
      return techniqueItemsForExercise(exercise,week).map(item=>String(item?.code||'').trim()).filter(Boolean);
    }catch(error){return[];}
  }

  function supersetPartner(exercise,workout,week){
    try{return typeof findSupersetPartner==='function'?findSupersetPartner(exercise,workout,week):null;}catch(error){return null;}
  }

  function prescriptionSummary(exercise,week){
    try{
      if(typeof prescriptionCompactSummary==='function')return prescriptionCompactSummary(exercise,week);
    }catch(error){}
    return{ger:'',reps:'Sem prescrição',rx:{sets:[],inherited:false,sourceWeek:0}};
  }

  function groupedExercises(workout){
    const exercises=(()=>{try{return typeof sortWorkoutExercises==='function'?sortWorkoutExercises(workout):[...(workout?.exercises||[])];}catch(error){return[...(workout?.exercises||[])];}})();
    try{
      if(typeof groupExercisesByDay==='function'&&typeof getWorkoutDays==='function')return groupExercisesByDay(exercises,getWorkoutDays(workout)).filter(([,items])=>items?.length);
    }catch(error){}
    return[['Treino',exercises]];
  }

  function rowHtml(exercise,workout,week){
    const summary=prescriptionSummary(exercise,week),sets=Array.isArray(summary?.rx?.sets)?summary.rx.sets:[];
    const completed=completedCount(exercise,workout,week),techniques=techniqueCodes(exercise,week),partner=supersetPartner(exercise,workout,week);
    const inherited=summary?.rx?.inherited===true&&summary?.rx?.sourceWeek;
    const badges=[];
    if(summary?.ger)badges.push(`<span class="tb-week-rx-chip ger">${html(summary.ger)}</span>`);
    techniques.forEach(code=>badges.push(`<span class="tb-week-rx-chip">${html(code)}</span>`));
    if(partner)badges.push('<span class="tb-week-rx-chip ss">SS</span>');
    if(inherited)badges.push(`<span class="tb-week-rx-chip inherited">HERDA S${html(summary.rx.sourceWeek)}</span>`);
    const primary=sets.length?html(summary.reps||`${sets.length} séries`):'<span class="tb-week-no-rx">Sem prescrição</span>';
    const done=completed?`<span class="tb-week-row-done">✓ ${completed>1?completed+' registros':'registrado'}</span>`:'';
    const relation=partner?`<span class="tb-week-row-note">com ${html(partner.name)}</span>`:'';
    const aria=`${exercise?.name||'Exercício'}, semana ${week}, ${summary?.reps||'sem prescrição'}${completed?`, ${completed} registro${completed>1?'s':''}`:''}`;
    return `<button type="button" class="tb-week-row${completed?' is-done':''}" data-week-exercise="${html(exercise?.id||'')}" data-week="${week}" aria-label="${html(aria)}"><span class="tb-week-exercise"><strong>${html(exercise?.name||'Exercício')}</strong>${done}${relation}</span><span class="tb-week-prescription"><strong>${primary}</strong>${badges.length?`<span class="tb-week-rx-meta">${badges.join('')}</span>`:''}</span><span class="tb-week-row-arrow" aria-hidden="true">›</span></button>`;
  }

  function injectStyles(){
    if(document.getElementById('tb-student-week-workout-layout-style'))return;
    const style=document.createElement('style');
    style.id='tb-student-week-workout-layout-style';
    style.textContent=`
      #tb-student-week-sheet{margin:14px 0 16px;border:1px solid #3b332c;border-radius:4px;background:linear-gradient(145deg,#191715,#11100f);overflow:hidden;box-shadow:0 10px 26px rgba(0,0,0,.16)}
      .tb-week-sheet-head{display:grid;grid-template-columns:44px minmax(0,1fr) 44px;align-items:stretch;min-height:76px;border-bottom:1px solid #3b332c;background:linear-gradient(180deg,#171411,#0f0e0d)}
      .tb-week-nav{border:0;background:#100f0e;color:#b9a99b;font:800 27px/1 'Barlow Condensed','Arial Narrow',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .12s,color .12s}
      .tb-week-nav:first-child{border-right:1px solid #302923}.tb-week-nav:last-child{border-left:1px solid #302923}
      .tb-week-nav:active:not(:disabled){background:rgba(166,34,37,.18);color:#fff}.tb-week-nav:disabled{opacity:.2;cursor:not-allowed}
      .tb-week-heading{min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:9px 8px;text-align:center}
      .tb-week-kicker{font:600 7px/1.2 'DM Mono',monospace;letter-spacing:1.5px;color:#826f61;text-transform:uppercase}
      .tb-week-heading-row{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:5px}
      .tb-week-heading strong{font:900 26px/.95 'Barlow Condensed','Arial Narrow',sans-serif;letter-spacing:.7px;color:#eaded5;text-transform:uppercase}
      .tb-week-heading strong small{font-size:13px;color:#71665e;font-weight:700}
      .tb-week-current-badge{border:1px solid rgba(183,48,51,.58);background:rgba(126,24,27,.18);color:#d49a8e;padding:3px 5px;font:700 7px/1 'DM Mono',monospace;letter-spacing:.7px;text-transform:uppercase}
      .tb-week-range{margin-top:5px;color:#81756d;font:500 9px/1.2 'DM Mono',monospace;letter-spacing:.25px}
      .tb-week-columns{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(128px,.85fr) 18px;align-items:center;padding:7px 10px;border-bottom:1px solid #352e28;background:#0d0c0b;color:#71675e;font:700 7px/1 'DM Mono',monospace;letter-spacing:1.15px;text-transform:uppercase}
      .tb-week-columns span:nth-child(2){text-align:left;padding-left:10px}
      .tb-week-day{display:flex;align-items:center;gap:7px;padding:6px 10px;border-bottom:1px solid #302923;background:#15120f;color:#a28f7f;font:700 8px/1.2 'DM Mono',monospace;letter-spacing:1px;text-transform:uppercase}
      .tb-week-day::before{content:'';width:5px;height:5px;background:#a72b2e;transform:rotate(45deg);flex:0 0 auto}
      .tb-week-row{width:100%;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(128px,.85fr) 18px;align-items:center;min-height:70px;padding:0 10px;border:0;border-bottom:1px solid #302923;background:transparent;color:#e9ddd4;text-align:left;cursor:pointer;transition:background .12s,box-shadow .12s}
      .tb-week-row:last-child{border-bottom:0}.tb-week-row:active{background:rgba(137,31,33,.16)}.tb-week-row.is-done{background:linear-gradient(90deg,rgba(40,94,61,.08),transparent 54%)}
      .tb-week-exercise{min-width:0;padding:11px 10px 11px 0;display:flex;flex-direction:column;align-items:flex-start;gap:4px}
      .tb-week-exercise>strong{max-width:100%;font:700 14px/1.15 'Barlow',system-ui,sans-serif;white-space:normal;overflow-wrap:anywhere;color:#eee3db}
      .tb-week-row-done{font:700 7px/1 'DM Mono',monospace;color:#6cbb82;letter-spacing:.55px;text-transform:uppercase}
      .tb-week-row-note{max-width:100%;font:500 8px/1.2 'DM Mono',monospace;color:#756a62;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .tb-week-prescription{min-width:0;align-self:stretch;padding:9px 0 9px 10px;border-left:1px solid #302923;display:flex;flex-direction:column;justify-content:center;gap:6px}
      .tb-week-prescription>strong{font:800 12px/1.2 'DM Mono',monospace;color:#e5d7cc;letter-spacing:-.15px}
      .tb-week-no-rx{color:#6c625b;font-weight:600;font-size:9px}
      .tb-week-rx-meta{display:flex;flex-wrap:wrap;gap:3px;align-items:center}
      .tb-week-rx-chip{display:inline-flex;align-items:center;max-width:100%;padding:3px 4px;border:1px solid #44372f;background:#151210;color:#9c8c80;font:700 6.5px/1 'DM Mono',monospace;letter-spacing:.35px;white-space:nowrap}
      .tb-week-rx-chip.ger{border-color:rgba(179,48,51,.54);background:rgba(124,24,27,.15);color:#d07070}.tb-week-rx-chip.ss{border-color:rgba(174,116,47,.5);color:#c9a36e}.tb-week-rx-chip.inherited{color:#72675e}
      .tb-week-row-arrow{padding-left:5px;color:#5e554e;font:800 18px/1 'Barlow Condensed',sans-serif;text-align:right}
      #screen-workout .tb-week-layout-day-label{color:#8e8075}
      #screen-workout #student-overview-toggle.tb-week-compare-toggle{margin-top:14px;border-color:#3a312b;background:#11100f;color:#8f8176;font-size:10px;letter-spacing:.55px}
      #screen-workout #student-workout-overview.tb-week-legacy-overview{margin-top:7px}
      @media(max-width:420px){
        #tb-student-week-sheet{margin-left:-2px;margin-right:-2px}
        .tb-week-sheet-head{grid-template-columns:40px minmax(0,1fr) 40px;min-height:72px}
        .tb-week-heading strong{font-size:24px}.tb-week-columns,.tb-week-row{grid-template-columns:minmax(0,1.08fr) minmax(112px,.92fr) 15px;padding-left:8px;padding-right:8px}
        .tb-week-columns span:nth-child(2){padding-left:8px}.tb-week-prescription{padding-left:8px}.tb-week-exercise>strong{font-size:13px}.tb-week-prescription>strong{font-size:11px}.tb-week-rx-chip{font-size:6px}
      }
      @media(min-width:900px){
        body.student-desktop #tb-student-week-sheet{max-width:980px}
        body.student-desktop .tb-week-row,body.student-desktop .tb-week-columns{grid-template-columns:minmax(250px,1.2fr) minmax(260px,.8fr) 22px}
        body.student-desktop .tb-week-row{min-height:64px}.tb-week-exercise>strong{font-size:15px}.tb-week-prescription>strong{font-size:13px}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureSheet(){
    let host=document.getElementById('tb-student-week-sheet');
    if(host)return host;
    const content=document.querySelector('#screen-workout .content'),summary=document.getElementById('student-protocol-summary');
    if(!content)return null;
    host=document.createElement('section');host.id='tb-student-week-sheet';host.setAttribute('aria-label','Plano da semana');
    host.addEventListener('click',event=>{
      const nav=event.target.closest?.('[data-week-delta]');
      if(nav){changeWeek(Number(nav.dataset.weekDelta)||0);return;}
      const row=event.target.closest?.('[data-week-exercise]');
      if(row)openExercise(row.dataset.weekExercise,clampWeek(row.dataset.week));
    });
    if(summary?.parentNode===content)summary.insertAdjacentElement('afterend',host);else content.prepend(host);
    return host;
  }

  function relabelSecondaryNavigation(){
    const dayList=document.getElementById('day-folder-list');
    const dayHeader=dayList?.previousElementSibling?.classList?.contains('section-header')?dayList.previousElementSibling:null;
    const label=dayHeader?.querySelector('.section-label');
    if(label){label.textContent='Acessar treino por dia';label.classList.add('tb-week-layout-day-label');}
    const toggle=document.getElementById('student-overview-toggle'),panel=document.getElementById('student-workout-overview');
    if(toggle){toggle.classList.add('tb-week-compare-toggle');toggle.textContent=panel?.classList.contains('open')?'▦ OCULTAR COMPARAÇÃO DAS 8 SEMANAS':'▦ COMPARAR AS 8 SEMANAS';}
    if(panel)panel.classList.add('tb-week-legacy-overview');
    const title=panel?.querySelector('.weekly-plan-title'),hint=panel?.querySelector('.weekly-plan-hint');
    if(title)title.textContent='Comparação completa do ciclo';
    if(hint)hint.textContent='8 semanas · deslize horizontalmente para comparar prescrições';
  }

  function syncLegacyOverview(workout){
    const panel=document.getElementById('student-workout-overview');if(!panel)return;
    panel.dataset.boardDirty='1';
    if(!panel.classList.contains('open'))return;
    try{
      if(typeof scheduleWeeklyBoardRender==='function')scheduleWeeklyBoardRender(workout,'student-weekly-board',false);
      else if(typeof buildWeeklyBoard==='function')buildWeeklyBoard(workout,'student-weekly-board',false);
      panel.dataset.boardDirty='0';
    }catch(error){}
  }

  function render(workout=activeWorkout(),week=0){
    if(!studentContext()||!workout)return false;
    injectStyles();const host=ensureSheet();if(!host)return false;
    const selected=clampWeek(week||selectedWeek(workout));selectedWeeks.set(workoutKey(workout),selected);try{LAST_SESSION_WEEK=selected;}catch(error){}
    const groups=groupedExercises(workout),range=cycleRange(workout,selected),current=isCurrentCycleWeek(workout,selected);
    const body=groups.length?groups.map(([day,items])=>`<section class="tb-week-day-group"><div class="tb-week-day">${html(day)}</div>${items.map(exercise=>rowHtml(exercise,workout,selected)).join('')}</section>`).join(''):'<div class="prescription-empty">Nenhum exercício cadastrado neste protocolo.</div>';
    host.innerHTML=`<div class="tb-week-sheet-head"><button type="button" class="tb-week-nav" data-week-delta="-1" ${selected<=1?'disabled':''} aria-label="Semana anterior">‹</button><div class="tb-week-heading"><span class="tb-week-kicker">PLANO DO TREINO</span><div class="tb-week-heading-row"><strong>SEMANA ${selected} <small>/ 8</small></strong>${current?'<span class="tb-week-current-badge">ATUAL</span>':''}</div>${range?`<span class="tb-week-range">${html(range)}</span>`:''}</div><button type="button" class="tb-week-nav" data-week-delta="1" ${selected>=8?'disabled':''} aria-label="Próxima semana">›</button></div><div class="tb-week-columns" aria-hidden="true"><span>EXERCÍCIO</span><span>PRESCRIÇÃO</span><span></span></div>${body}`;
    relabelSecondaryNavigation();
    return true;
  }

  function setWeek(workout,week,{refreshLegacy=true}={}){
    if(!workout)return 1;
    const next=clampWeek(week);selectedWeeks.set(workoutKey(workout),next);try{LAST_SESSION_WEEK=next;}catch(error){}
    render(workout,next);if(refreshLegacy)syncLegacyOverview(workout);return next;
  }

  function changeWeek(delta){
    const workout=activeWorkout();if(!workout)return false;
    const current=selectedWeek(workout),next=clampWeek(current+(Number(delta)||0));
    if(next===current)return false;setWeek(workout,next);return true;
  }

  function openExercise(exerciseId,week){
    const workout=activeWorkout();if(!workout||!exerciseId)return false;
    const selected=setWeek(workout,week,{refreshLegacy:false});
    try{if(typeof openStudentWeekExercise==='function'){openStudentWeekExercise(exerciseId,selected);return true;}}catch(error){}
    try{if(typeof openExercise==='function'){openExercise(exerciseId);return true;}}catch(error){}
    return false;
  }

  function installRenderPatch(){
    if(typeof renderWorkout!=='function')return false;
    if(renderWorkout.__tbStudentWeekWorkoutLayout)return true;
    const base=renderWorkout;
    const wrapped=function(){
      const result=base.apply(this,arguments);
      if(studentContext()){
        const workout=activeWorkout();
        if(workout)requestAnimationFrame(()=>{if(document.getElementById('screen-workout'))render(workout);});
      }
      return result;
    };
    wrapped.__tbStudentWeekWorkoutLayout=true;wrapped.__tbBase=base;renderWorkout=wrapped;return true;
  }

  function installTogglePatch(){
    if(typeof toggleWorkoutOverview!=='function')return false;
    if(toggleWorkoutOverview.__tbStudentWeekWorkoutLayout)return true;
    const base=toggleWorkoutOverview;
    const wrapped=function(trainerMode){const result=base.apply(this,arguments);if(!trainerMode)requestAnimationFrame(relabelSecondaryNavigation);return result;};
    wrapped.__tbStudentWeekWorkoutLayout=true;wrapped.__tbBase=base;toggleWorkoutOverview=wrapped;return true;
  }

  function install(){injectStyles();const renderOk=installRenderPatch(),toggleOk=installTogglePatch();if(studentContext()&&document.getElementById('screen-workout')?.classList.contains('active'))render();return renderOk&&toggleOk;}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('team-bulls-student-runtime-ready',install);
  window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('pageshow',()=>{install();if(studentContext()&&document.getElementById('screen-workout')?.classList.contains('active'))render();},{passive:true});

  window.TeamBullsStudentWeekWorkoutLayout=Object.freeze({version:VERSION,render,changeWeek,openExercise,selectedWeek:()=>selectedWeek(activeWorkout())});
})();
