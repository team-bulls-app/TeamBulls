/* Team Bulls v10.10.40 — visão semanal compacta dentro da pasta/dia do aluno. */
'use strict';
(()=>{
  if(window.__TEAM_BULLS_STUDENT_DAY_WEEK_WORKOUT_LAYOUT_101040_2__)return;
  window.__TEAM_BULLS_STUDENT_DAY_WEEK_WORKOUT_LAYOUT_101040_2__=true;

  const VERSION='10.10.40-weeklayout2';
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

  function cleanupWrongGeneralLayout(){
    document.getElementById('tb-student-week-sheet')?.remove();
    document.getElementById('tb-student-week-workout-layout-style')?.remove();
    try{
      if(typeof renderWorkout==='function'&&renderWorkout.__tbStudentWeekWorkoutLayout&&typeof renderWorkout.__tbBase==='function')renderWorkout=renderWorkout.__tbBase;
      if(typeof toggleWorkoutOverview==='function'&&toggleWorkoutOverview.__tbStudentWeekWorkoutLayout&&typeof toggleWorkoutOverview.__tbBase==='function')toggleWorkoutOverview=toggleWorkoutOverview.__tbBase;
    }catch(error){}
    const dayList=document.getElementById('day-folder-list'),dayHeader=dayList?.previousElementSibling?.classList?.contains('section-header')?dayList.previousElementSibling:null;
    const label=dayHeader?.querySelector('.section-label');if(label?.classList.contains('tb-week-layout-day-label')){label.textContent='Pastas dos dias de treino';label.classList.remove('tb-week-layout-day-label');}
    const toggle=document.getElementById('student-overview-toggle'),panel=document.getElementById('student-workout-overview');
    if(toggle?.classList.contains('tb-week-compare-toggle')){toggle.classList.remove('tb-week-compare-toggle');toggle.textContent=panel?.classList.contains('open')?'▤ OCULTAR VISÃO GERAL DAS 8 SEMANAS':'▤ MOSTRAR VISÃO GERAL DAS 8 SEMANAS';}
    panel?.classList.remove('tb-week-legacy-overview');
    return true;
  }

  function activeDayContext(){
    const workout=activeWorkout();if(!workout)return null;
    let dayName='';try{dayName=String(CUR_DAY||'');}catch(error){}
    if(!dayName)return null;
    try{
      const days=typeof getWorkoutDays==='function'?getWorkoutDays(workout):[];
      const normal=value=>typeof normalizedName==='function'?normalizedName(value):String(value||'').trim().toLowerCase();
      const day=days.find(item=>normal(item?.name)===normal(dayName));if(!day)return null;
      const items=typeof exercisesForDay==='function'?exercisesForDay(workout,day.name):[];
      return{workout,day,items,dayWorkout:{...workout,exercises:items}};
    }catch(error){return null;}
  }

  function cycleWeek(workout){
    try{if(validIsoDate(workout?.startDate)&&typeof v104CycleWeek==='function'&&typeof today==='function')return clampWeek(v104CycleWeek(workout.startDate,today()));}catch(error){}
    try{return clampWeek(LAST_SESSION_WEEK);}catch(error){return 1;}
  }
  function selectedWeek(workout){
    const key=workoutKey(workout),saved=selectedWeeks.get(key);let week=0;
    try{if(Number(LAST_SESSION_WEEK)>=1&&Number(LAST_SESSION_WEEK)<=8)week=clampWeek(LAST_SESSION_WEEK);}catch(error){}
    if(!week&&saved)week=clampWeek(saved);if(!week)week=cycleWeek(workout);selectedWeeks.set(key,week);
    try{LAST_SESSION_WEEK=week;}catch(error){}return week;
  }
  function cycleRange(workout,week){
    try{if(validIsoDate(workout?.startDate)&&typeof v104CycleRange==='function')return String(v104CycleRange(workout.startDate,week)||'');}catch(error){}
    return'';
  }
  function isCurrentCycleWeek(workout,week){return clampWeek(week)===cycleWeek(workout);}
  function belongsToCurrentCycle(session,workout){
    try{const api=window.TeamBullsSessionIntegrity;if(typeof api?.belongsToCurrentCycle==='function')return api.belongsToCurrentCycle(session,workout)!==false;}catch(error){}
    const start=String(workout?.startDate||''),date=String(session?.date||'');if(!validIsoDate(start)||!validIsoDate(date))return true;return date>=start;
  }
  function completedCount(exercise,workout,week){return (exercise?.sessions||[]).filter(session=>Number(session?.week)===Number(week)&&belongsToCurrentCycle(session,workout)).length;}
  function techniqueCodes(exercise,week){
    try{if(typeof techniqueItemsForExercise!=='function')return[];return techniqueItemsForExercise(exercise,week).map(item=>String(item?.code||'').trim()).filter(Boolean);}catch(error){return[];}
  }
  function supersetPartner(exercise,workout,week){try{return typeof findSupersetPartner==='function'?findSupersetPartner(exercise,workout,week):null;}catch(error){return null;}}
  function prescriptionSummary(exercise,week){try{if(typeof prescriptionCompactSummary==='function')return prescriptionCompactSummary(exercise,week);}catch(error){}return{ger:'',reps:'Sem prescrição',rx:{sets:[],inherited:false,sourceWeek:0}};}

  function rowHtml(exercise,workout,week){
    const summary=prescriptionSummary(exercise,week),sets=Array.isArray(summary?.rx?.sets)?summary.rx.sets:[];
    const completed=completedCount(exercise,workout,week),techniques=techniqueCodes(exercise,week),partner=supersetPartner(exercise,workout,week),inherited=summary?.rx?.inherited===true&&summary?.rx?.sourceWeek;
    const badges=[];if(summary?.ger)badges.push(`<span class="tb-week-rx-chip ger">${html(summary.ger)}</span>`);techniques.forEach(code=>badges.push(`<span class="tb-week-rx-chip">${html(code)}</span>`));if(partner)badges.push('<span class="tb-week-rx-chip ss">SS</span>');if(inherited)badges.push(`<span class="tb-week-rx-chip inherited">HERDA S${html(summary.rx.sourceWeek)}</span>`);
    const primary=sets.length?html(summary.reps||`${sets.length} séries`):'<span class="tb-week-no-rx">Sem prescrição</span>',done=completed?`<span class="tb-week-row-done">✓ ${completed>1?completed+' registros':'registrado'}</span>`:'',relation=partner?`<span class="tb-week-row-note">com ${html(partner.name)}</span>`:'';
    const aria=`${exercise?.name||'Exercício'}, semana ${week}, ${summary?.reps||'sem prescrição'}${completed?`, ${completed} registro${completed>1?'s':''}`:''}`;
    return `<button type="button" class="tb-week-row${completed?' is-done':''}" data-week-exercise="${html(exercise?.id||'')}" data-week="${week}" aria-label="${html(aria)}"><span class="tb-week-exercise"><strong>${html(exercise?.name||'Exercício')}</strong>${done}${relation}</span><span class="tb-week-prescription"><strong>${primary}</strong>${badges.length?`<span class="tb-week-rx-meta">${badges.join('')}</span>`:''}</span><span class="tb-week-row-arrow" aria-hidden="true">›</span></button>`;
  }

  function injectStyles(){
    if(document.getElementById('tb-student-day-week-workout-layout-style'))return;
    const style=document.createElement('style');style.id='tb-student-day-week-workout-layout-style';
    style.textContent=`
      #screen-day #tb-student-day-week-sheet{margin:0;border-top:1px solid #352e28;background:linear-gradient(145deg,#191715,#11100f);overflow:hidden}
      #screen-day .tb-week-sheet-head{display:grid;grid-template-columns:44px minmax(0,1fr) 44px;align-items:stretch;min-height:76px;border-bottom:1px solid #3b332c;background:linear-gradient(180deg,#171411,#0f0e0d)}
      #screen-day .tb-week-nav{border:0;background:#100f0e;color:#b9a99b;font:800 27px/1 'Barlow Condensed','Arial Narrow',sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center}
      #screen-day .tb-week-nav:first-child{border-right:1px solid #302923}#screen-day .tb-week-nav:last-child{border-left:1px solid #302923}
      #screen-day .tb-week-nav:active:not(:disabled){background:rgba(166,34,37,.18);color:#fff}#screen-day .tb-week-nav:disabled{opacity:.2;cursor:not-allowed}
      #screen-day .tb-week-heading{min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:9px 8px;text-align:center}
      #screen-day .tb-week-kicker{font:600 7px/1.2 'DM Mono',monospace;letter-spacing:1.5px;color:#826f61;text-transform:uppercase}
      #screen-day .tb-week-heading-row{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:5px}
      #screen-day .tb-week-heading strong{font:900 26px/.95 'Barlow Condensed','Arial Narrow',sans-serif;letter-spacing:.7px;color:#eaded5;text-transform:uppercase}
      #screen-day .tb-week-heading strong small{font-size:13px;color:#71665e;font-weight:700}
      #screen-day .tb-week-current-badge{border:1px solid rgba(183,48,51,.58);background:rgba(126,24,27,.18);color:#d49a8e;padding:3px 5px;font:700 7px/1 'DM Mono',monospace;letter-spacing:.7px;text-transform:uppercase}
      #screen-day .tb-week-range{margin-top:5px;color:#81756d;font:500 9px/1.2 'DM Mono',monospace;letter-spacing:.25px}
      #screen-day .tb-week-columns{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(128px,.85fr) 18px;align-items:center;padding:7px 10px;border-bottom:1px solid #352e28;background:#0d0c0b;color:#71675e;font:700 7px/1 'DM Mono',monospace;letter-spacing:1.15px;text-transform:uppercase}
      #screen-day .tb-week-columns span:nth-child(2){padding-left:10px}
      #screen-day .tb-week-row{width:100%;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(128px,.85fr) 18px;align-items:center;min-height:70px;padding:0 10px;border:0;border-bottom:1px solid #302923;background:transparent;color:#e9ddd4;text-align:left;cursor:pointer}
      #screen-day .tb-week-row:active{background:rgba(137,31,33,.16)}#screen-day .tb-week-row.is-done{background:linear-gradient(90deg,rgba(40,94,61,.08),transparent 54%)}
      #screen-day .tb-week-exercise{min-width:0;padding:11px 10px 11px 0;display:flex;flex-direction:column;align-items:flex-start;gap:4px}
      #screen-day .tb-week-exercise>strong{max-width:100%;font:700 14px/1.15 'Barlow',system-ui,sans-serif;white-space:normal;overflow-wrap:anywhere;color:#eee3db}
      #screen-day .tb-week-row-done{font:700 7px/1 'DM Mono',monospace;color:#6cbb82;letter-spacing:.55px;text-transform:uppercase}
      #screen-day .tb-week-row-note{max-width:100%;font:500 8px/1.2 'DM Mono',monospace;color:#756a62;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      #screen-day .tb-week-prescription{min-width:0;align-self:stretch;padding:9px 0 9px 10px;border-left:1px solid #302923;display:flex;flex-direction:column;justify-content:center;gap:6px}
      #screen-day .tb-week-prescription>strong{font:800 12px/1.2 'DM Mono',monospace;color:#e5d7cc;letter-spacing:-.15px}
      #screen-day .tb-week-no-rx{color:#6c625b;font-weight:600;font-size:9px}#screen-day .tb-week-rx-meta{display:flex;flex-wrap:wrap;gap:3px;align-items:center}
      #screen-day .tb-week-rx-chip{display:inline-flex;align-items:center;max-width:100%;padding:3px 4px;border:1px solid #44372f;background:#151210;color:#9c8c80;font:700 6.5px/1 'DM Mono',monospace;letter-spacing:.35px;white-space:nowrap}
      #screen-day .tb-week-rx-chip.ger{border-color:rgba(179,48,51,.54);background:rgba(124,24,27,.15);color:#d07070}#screen-day .tb-week-rx-chip.ss{border-color:rgba(174,116,47,.5);color:#c9a36e}#screen-day .tb-week-rx-chip.inherited{color:#72675e}
      #screen-day .tb-week-row-arrow{padding-left:5px;color:#5e554e;font:800 18px/1 'Barlow Condensed',sans-serif;text-align:right}
      #screen-day .tb-day-week-compare{width:100%;min-height:42px;border:0;border-top:1px solid #352e28;background:#0e0d0c;color:#87796f;font:700 8px/1 'DM Mono',monospace;letter-spacing:.75px;text-transform:uppercase;cursor:pointer}
      #screen-day .tb-day-week-compare[aria-expanded="true"]{color:#c6b6aa;background:#15110f}#screen-day #student-day-weekly-board[hidden]{display:none!important}#screen-day #student-day-weekly-board:not([hidden]){border-top:1px solid #352e28;padding-top:2px}
      @media(max-width:420px){#screen-day .tb-week-sheet-head{grid-template-columns:40px minmax(0,1fr) 40px;min-height:72px}#screen-day .tb-week-heading strong{font-size:24px}#screen-day .tb-week-columns,#screen-day .tb-week-row{grid-template-columns:minmax(0,1.08fr) minmax(112px,.92fr) 15px;padding-left:8px;padding-right:8px}#screen-day .tb-week-columns span:nth-child(2){padding-left:8px}#screen-day .tb-week-prescription{padding-left:8px}#screen-day .tb-week-exercise>strong{font-size:13px}#screen-day .tb-week-prescription>strong{font-size:11px}#screen-day .tb-week-rx-chip{font-size:6px}}
      @media(min-width:900px){body.student-desktop #screen-day .weekly-plan-shell{max-width:980px}body.student-desktop #screen-day .tb-week-row,body.student-desktop #screen-day .tb-week-columns{grid-template-columns:minmax(250px,1.2fr) minmax(260px,.8fr) 22px}body.student-desktop #screen-day .tb-week-row{min-height:64px}body.student-desktop #screen-day .tb-week-exercise>strong{font-size:15px}body.student-desktop #screen-day .tb-week-prescription>strong{font-size:13px}}
    `;document.head.appendChild(style);
  }

  function ensureDaySheet(){
    const screen=document.getElementById('screen-day'),legacy=document.getElementById('student-day-weekly-board'),shell=legacy?.closest('.weekly-plan-shell');if(!screen||!legacy||!shell||!screen.contains(shell))return null;
    let host=document.getElementById('tb-student-day-week-sheet');
    if(!host){
      host=document.createElement('section');host.id='tb-student-day-week-sheet';host.setAttribute('aria-label','Plano semanal desta pasta');
      host.addEventListener('click',event=>{const nav=event.target.closest?.('[data-week-delta]');if(nav){changeWeek(Number(nav.dataset.weekDelta)||0);return;}const row=event.target.closest?.('[data-week-exercise]');if(row){openExercise(row.dataset.weekExercise,clampWeek(row.dataset.week));return;}const compare=event.target.closest?.('[data-day-week-compare]');if(compare)toggleComparison();});
      legacy.insertAdjacentElement('beforebegin',host);
    }
    if(legacy.dataset.tbDayWeekCompareDefault!=='1'){legacy.dataset.tbDayWeekCompareDefault='1';legacy.hidden=true;}
    return{host,legacy,shell};
  }
  function syncComparisonButton(host,legacy){const button=host?.querySelector?.('[data-day-week-compare]');if(!button||!legacy)return;const expanded=!legacy.hidden;button.setAttribute('aria-expanded',String(expanded));button.textContent=expanded?'▦ OCULTAR COMPARAÇÃO DAS 8 SEMANAS':'▦ COMPARAR AS 8 SEMANAS';}
  function toggleComparison(){const ui=ensureDaySheet();if(!ui)return false;ui.legacy.hidden=!ui.legacy.hidden;syncComparisonButton(ui.host,ui.legacy);if(!ui.legacy.hidden){const context=activeDayContext();if(context)refreshLegacy(context);}return true;}
  function refreshLegacy(context){if(!context)return;try{if(typeof scheduleWeeklyBoardRender==='function')scheduleWeeklyBoardRender(context.dayWorkout,'student-day-weekly-board',false);else if(typeof buildWeeklyBoard==='function')buildWeeklyBoard(context.dayWorkout,'student-day-weekly-board',false);}catch(error){}}

  function render(context=activeDayContext(),week=0){
    if(!studentContext()||!context?.workout||!context?.day)return false;cleanupWrongGeneralLayout();injectStyles();const ui=ensureDaySheet();if(!ui)return false;
    const selected=clampWeek(week||selectedWeek(context.workout));selectedWeeks.set(workoutKey(context.workout),selected);try{LAST_SESSION_WEEK=selected;}catch(error){}
    const range=cycleRange(context.workout,selected),current=isCurrentCycleWeek(context.workout,selected),body=context.items.length?context.items.map(exercise=>rowHtml(exercise,context.workout,selected)).join(''):'<div class="prescription-empty">Nenhum exercício cadastrado nesta pasta.</div>';
    ui.host.innerHTML=`<div class="tb-week-sheet-head"><button type="button" class="tb-week-nav" data-week-delta="-1" ${selected<=1?'disabled':''} aria-label="Semana anterior">‹</button><div class="tb-week-heading"><span class="tb-week-kicker">${html(context.day.name)} · PLANO DO TREINO</span><div class="tb-week-heading-row"><strong>SEMANA ${selected} <small>/ 8</small></strong>${current?'<span class="tb-week-current-badge">ATUAL</span>':''}</div>${range?`<span class="tb-week-range">${html(range)}</span>`:''}</div><button type="button" class="tb-week-nav" data-week-delta="1" ${selected>=8?'disabled':''} aria-label="Próxima semana">›</button></div><div class="tb-week-columns" aria-hidden="true"><span>EXERCÍCIO</span><span>PRESCRIÇÃO</span><span></span></div>${body}<button type="button" class="tb-day-week-compare" data-day-week-compare aria-expanded="${String(!ui.legacy.hidden)}">${ui.legacy.hidden?'▦ COMPARAR AS 8 SEMANAS':'▦ OCULTAR COMPARAÇÃO DAS 8 SEMANAS'}</button>`;
    syncComparisonButton(ui.host,ui.legacy);return true;
  }
  function setWeek(context,week,{refreshComparison=true}={}){if(!context?.workout)return 1;const next=clampWeek(week);selectedWeeks.set(workoutKey(context.workout),next);try{LAST_SESSION_WEEK=next;}catch(error){}render(context,next);if(refreshComparison&&!document.getElementById('student-day-weekly-board')?.hidden)refreshLegacy(context);return next;}
  function changeWeek(delta){const context=activeDayContext();if(!context)return false;const current=selectedWeek(context.workout),next=clampWeek(current+(Number(delta)||0));if(next===current)return false;setWeek(context,next);return true;}
  function openExercise(exerciseId,week){
    const context=activeDayContext();if(!context||!exerciseId||!context.items.some(item=>String(item?.id||'')===String(exerciseId)))return false;const selected=setWeek(context,week,{refreshComparison:false});
    try{if(typeof openStudentWeekExercise==='function'){openStudentWeekExercise(exerciseId,selected);return true;}}catch(error){}
    try{if(typeof window.openExercise==='function'){window.openExercise(exerciseId);return true;}}catch(error){}return false;
  }
  function installRenderPatch(){
    if(typeof renderDay!=='function')return false;if(renderDay.__tbStudentDayWeekWorkoutLayout)return true;const base=renderDay;
    const wrapped=function(){const result=base.apply(this,arguments);if(studentContext())requestAnimationFrame(()=>{if(document.getElementById('screen-day'))render();});return result;};
    wrapped.__tbStudentDayWeekWorkoutLayout=true;wrapped.__tbBase=base;renderDay=wrapped;return true;
  }
  function install(){cleanupWrongGeneralLayout();injectStyles();const ok=installRenderPatch();if(studentContext()&&document.getElementById('screen-day')?.classList.contains('active'))render();return ok;}

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
  window.addEventListener('team-bulls-student-runtime-ready',install);window.addEventListener('team-bulls-runtime-ready',install);
  window.addEventListener('pageshow',()=>{install();if(studentContext()&&document.getElementById('screen-day')?.classList.contains('active'))render();},{passive:true});
  window.TeamBullsStudentWeekWorkoutLayout=Object.freeze({version:VERSION,render,changeWeek,openExercise,toggleComparison,selectedWeek:()=>{const context=activeDayContext();return context?selectedWeek(context.workout):1;}});
})();