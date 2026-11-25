// Real modal markup, delivered chooser/controllers and durable session module.
// All accounts/data are synthetic; external requests are blocked.
import assert from 'node:assert/strict';import fs from 'node:fs';import http from 'node:http';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';import {waitForChromePage} from './chrome-readiness.mjs';
import {core,source,variantFunctions} from './session-variant-protocol-check.mjs';
const names=[...variantFunctions,'updateSessionExecutionVideo',...(core.includes('function validClusterReps(')?['validClusterReps','clusterBlockInputs','readSessionSetRows','usesTraditionalCluster']:[]),'captureSessionDraftContext','sessionExerciseForSave','openLogSessionModal','showConfirm','openEditSession','addEditSetRow','populateSessionEditorForWeek','addSetRow','removeSet','renderSessionPrescriptionSummary','beginAction','endAction','openModal','closeModal','saveWorkout','saveWorkoutFromButton','setWorkoutSaveStatus','buildColorPicker','pickColor','openEditWorkoutTs','v109PersistWorkoutCycle','v109CyclePayload',...(core.includes('function workoutUpdateDate(')?['workoutUpdateDate']:[]),'hasManualOrder','createdMillis','orderedWorkouts','activeWorkoutId','prepareFontScaleRules','renumberPerformedSetRows','renumberEditSetRows','updateBackoffLoadSuggestion','renderGerMeter','formatGerLevel','renderRestTimerPresetsForExercise','timerLabel'];
const techniqueNames=['studentTechniqueLabels','studentTechniqueGuide','openTechniqueDetail',...(core.includes('function studentMyoRepGuide(')?['studentMyoRepBand','studentMyoRepGuide','studentGerGuide']:[])];
const hasTechniqueGuide=core.includes('function studentTechniqueGuide(');
if(hasTechniqueGuide)names.push(...techniqueNames);
const renderSessionGuide=hasTechniqueGuide?core.match(/^renderSessionPrescriptionSummary=function\(exercise,week,elId\)\{\r?\n[\s\S]+?^\};/m)?.[0]:'';
if(hasTechniqueGuide)assert(renderSessionGuide);
const renderPrescription=core.match(/^renderExercisePrescription=function\(exercise,elId,week,canEdit,trainerMode\)\{\r?\n[\s\S]+?^\};/m)?.[0];
const runtimeRows=['addSetRow','addEditSetRow'].map(name=>{
  const start=core.indexOf(name+'=function(');
  if(start<0)return '';
  const first=core.slice(start).split('\n')[0].trimEnd();
  return first.endsWith('};')?first:core.slice(start,core.indexOf('\n};',start)+3);
});
assert(renderPrescription && runtimeRows.every(Boolean), 'Expected the delivered workout and session renderers');
const homeRuntime=fs.readFileSync('modules/student-home-layout-v10_10_15.js','utf8');
const homeCss=homeRuntime.match(/style\.textContent=`([\s\S]*?)`;/)?.[1];
const profileRuntime=fs.readFileSync('modules/student-home-profile-v10_10_12.js','utf8');
const profileCss=profileRuntime.match(/style\.textContent=`([\s\S]*?)`;/)?.[1];
const profileHeader=profileRuntime.match(/^  function ensureHomeHeader\(\)\{[\s\S]+?^  \}/m)?.[0];
const calendarRuntime=fs.readFileSync('modules/student-training-calendar-v10_10_70.js','utf8');
const summaryCss=calendarRuntime.split('\n').find(line=>line.trimStart().startsWith('.home-daily-summary{'));
assert(homeCss && profileCss && profileHeader && summaryCss, 'Expected the delivered navigation, student header and summary');
const baseline=process.argv.indexOf('--baseline');
const stylesheet=baseline<0?fs.readFileSync('styles_v10_10_9.css'):spawnSync('git',['show',process.argv[baseline+1]+':styles_v10_10_9.css']).stdout;
const markup=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'');
const setup=`
let CURRENT_USER={uid:'s',role:'student'},MODE='cloud',LOCAL_OWNER_UID='',INACTIVE_UID='',LOCAL_DB={},AUTH_STATE_REVISION=1;
let SESSION_DRAFT_CONTEXT=null;let SESSION_WID='w',SESSION_EID='e',SESSION_CREATE_ID='',CUR_WORKOUT='w',CUR_EX='e',CUR_DAY='A',EDIT_SESSION_ID='',EDIT_SESSION_WID='',EDIT_SESSION_EID='',LAST_SESSION_WEEK=2,SESSION_EDITOR_WEEK=2,SET_COUNT=0,EDIT_SET_COUNT=0,VARIANT_LOAD_SEQ=0,TRAINING_RECOMMENDATIONS_CONTEXT=null;
let V109_PROTOCOL_REVIEW_SCHEDULE=null,MODAL_TARGET='student',EDIT_W='w',SEL_COLOR='#a855f7',WORKOUT_CREATE_ID=null;const PALETTE=['#e11d48','#a855f7'],ACTION_LOCKS=new Set();
window.errors=[];window.messages=[];window.reads=[];window.writes=[];window.slowCatalog=false;window.holdRefresh=false;window.failRefresh=false;window.failWrites=false;window.holdWrite=false;window.releaseWrite=null;window.releaseCatalog=null;window.refreshed=0;
window.alert=m=>messages.push(String(m));window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});
const group={id:'g',name:'Supino Reto',items:[{id:'dumbbell',name:'Supino reto com halteres'},{id:'barbell',name:'Supino reto com barra'}]};let EXERCISE_OPTIONS={groups:[group]};
const exercise={id:'e',name:'Supino Reto',sessions:[{id:'old',userId:'s',date:'2026-11-01',week:1,performedExerciseItemId:'removed',performedExerciseName:'Supino autorizado antigo',sets:[{weight:60,reps:8}]}]};let tree=[{id:'w',userId:'s',name:'Treino antigo',color:'#e11d48',startDate:'2026-08-29',updateDate:'2026-10-24',isActive:false,exercises:[exercise]}];
let VIEW_STUDENT={uid:'s',name:'Aluno de teste',workouts:tree},VIEW_STUDENT_WORKOUT=tree[0];const originalHistory=JSON.stringify(exercise.sessions);let count=0;
const getE=(w,e)=>tree.find(x=>x.id===w)?.exercises.find(x=>x.id===e),getW=w=>tree.find(x=>x.id===w),getWorkouts=()=>tree;
const auth={currentUser:{uid:'s'}},firebase={firestore:{FieldValue:{serverTimestamp:()=>123},Timestamp:{fromMillis:ms=>({ms})},FieldPath:{documentId:()=> '__name__'}}};
window.remote={'workouts/w':{userId:'s',name:'Treino antigo',color:'#e11d48',startDate:'2026-08-29',updateDate:'2026-10-24',isActive:false},'protocolReviewSchedules/s':{studentId:'s',trainerId:'t',sourceWorkoutId:'active',startDate:'2026-10-01',intervalWeeks:4,lastCompletedCycle:2,lastCompletedDate:'2026-10-29'}};
function ref(collection,id){return{key:collection+'/'+id,collection,id};}const db={collection:collection=>({where:()=>({get:async()=>({docs:Object.entries(remote).filter(([k,v])=>k.startsWith(collection+'/')&&v.userId==='s').map(([k,v])=>({id:k.split('/')[1],data:()=>structuredClone(v)}))})}),doc:id=>ref(collection,id)}),runTransaction:async run=>{const staged=[];const result=await run({get:async r=>{reads.push(r.key);if(r.collection==='protocolReviewSchedules')throw new Error('schedule unavailable');return{exists:!!remote[r.key],data:()=>structuredClone(remote[r.key])};},update:(r,p)=>staged.push({key:r.key,p:structuredClone(p)}),set:(r,p)=>staged.push({key:r.key,p:structuredClone(p)})});if(holdWrite)await new Promise(r=>releaseWrite=r);if(failWrites)throw new Error('simulated write failure');for(const row of staged){remote[row.key]={...remote[row.key],...row.p};writes.push(row);}return result;}};
const cloudWrite=p=>p,cloudGet=r=>r.get(),showToast=m=>messages.push(m),today=()=> '2026-11-10',draftId=()=> 'new-session-'+(++count),uid=draftId,validIsoDate=s=>/^\\d{4}-\\d{2}-\\d{2}$/.test(s||''),addDaysIso=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const storageGet=k=>localStorage.getItem(k),storageSet=(k,v)=>{localStorage.setItem(k,v);return true;},withTimeout=p=>p,runWhenIdle=fn=>setTimeout(fn,0),saveSessionArchive=()=>{},syncSessionToHistory=()=>{},saveCloudBackup=()=>{},renderExercise=()=>{},sessionSyncBadge=()=>'',exerciseUsesResistedTime=()=>useResistedTime;
let useResistedTime=false,FONT_SCALE_RULES_PREPARED=false;
function saveSession(){throw new Error('The registered-student durable save module must handle this click');}window.TeamBulls107={flushPendingMutationSync:async()=>{}};
const normalizePrescriptionSet=s=>s?.targetMin?s:null,prescribedRangeLabel=()=> '8–12',resolveWeekPrescription=()=>({sets:[{targetMin:8,targetMax:12,ger:2}]}),prescriptionCompactSummary=e=>({rx:resolveWeekPrescription(),reps:'8–12',ger:'2'});
const effectivePrescriptionSets=(_exercise,sets)=>sets,exerciseResultUnit=()=> 'reps';
const TECHNIQUE_CATALOG={items:[
  {id:'unl',code:'UNL',name:'Unilateral',description:'Faça um lado de cada vez.'},
  {id:'mp',code:'MP',name:'Myo Reps com nome personalizado para a prescrição do treinador',description:'Siga a técnica prescrita.'}
]};
const weekTechniqueSummary=()=> '<span>UNL</span>';
const techniqueItemsForExercise=(_exercise,week)=>TECHNIQUE_CATALOG.items.filter((_,index)=>index===Number(week)-1);
const exerciseHasTechnique=(_exercise,id,week)=>id==='mp'&&week===2;
const getGerDefinition=level=>level===2?{level,text:'Execução controlada'}:null;
const exerciseHasOptionalTechnique=(_exercise,id,week)=>id==='mp'&&week===2;
const exerciseTimerPresets=()=>[60,90,120,150,180],findSupersetPartner=()=>null,workoutContainingExercise=()=>tree[0];
const getWorkoutDays=()=>[{id:'a',name:'A'},{id:'b',name:'B'}],exercisesForDay=(w,name)=>w.exercises.filter(item=>(item.dayName||'A')===name);
function renderDay(){}
function openStudentWeekExercise(id,week){
  CUR_EX=id;LAST_SESSION_WEEK=week;showLayoutScreen('screen-exercise');
  renderExercisePrescription(exercise,'exercise-prescription-card',week,false,false);
}
function renderExercisePrescription(){}
const renderOptionalTechniqueMode=()=>{},renderEditOptionalTechniqueMode=()=>{},selectedPerformedTechniqueMode=()=>'',resetRestTimer=()=>{},focusEditorField=()=>{};
const findSessionOwner=id=>({exercise,session:exercise.sessions.find(s=>s.id===id),workout:tree[0]});
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const jsArg=s=>esc(JSON.stringify(String(s)));
const cachedExerciseCatalog=()=>({groups:[group]});async function loadExerciseOptions(){if(slowCatalog)await new Promise(r=>releaseCatalog=r);return EXERCISE_OPTIONS;}
async function renderTrainerStudent(){refreshed++;if(holdRefresh)await new Promise(r=>window.releaseRefresh=r);if(failRefresh)throw new Error('refresh unavailable');}
${names.map(source).join('\n')}
const addEditSetRowV101=addEditSetRow;
${runtimeRows.join('\n')}
${renderPrescription}
${renderSessionGuide}
${profileHeader}
function showLayoutScreen(id){
  document.querySelectorAll('.screen.active').forEach(screen=>screen.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.getElementById('app').scrollTop=0;
}
const activeScreenId=()=>document.querySelector('.screen.active')?.id||'';
const ACCESS_MODE='cloud-active',fmt=value=>value,v104CycleWeek=()=>2;
const getSharedSessions=e=>e.sessions||[];
const canUseCatalogVideos=()=>true,resolveExerciseVideoUrl=e=>e.videoUrl||'',extractYouTubeId=url=>url?url.split('/').at(-1):'';
function openCatalogVideo(url,name){window.lastVideo={url,name};}
function showScreen(id){showLayoutScreen(id);}
function openWorkout(id){
  CUR_WORKOUT=id;CUR_DAY='';
  document.getElementById('day-folder-list').innerHTML=getWorkoutDays(getW(id)).map(day=>'<div class="day-folder-card" data-reorder-day="'+day.name+'"><div class="day-folder-info">'+day.name+'</div></div>').join('');
  showScreen('screen-workout');
}
function openDay(name){CUR_DAY=name;renderDay();showScreen('screen-day');}
function openCalendar(){showScreen('screen-calendar');}
const MEDIA_DB_NAME='team-bulls-media-browser-test',MEDIA_STORE='media';
let MEDIA_DB_PROMISE=null;
${source('openMediaDb')}
${source('mediaGet')}
window.savedBattle=()=>mediaGet('workout-progress:s');
window.blockBattleStorage=()=>{
  const legacy=localStorage.getItem('team_bulls_workout_cycle_v1_s');
  if(!legacy)localStorage.setItem('team_bulls_workout_cycle_v1_s',JSON.stringify({
    states:{},completions:{'wcomp_s_w_2026-11-01_2_b':{studentUid:'s',workoutId:'w',startDate:'2026-11-01',week:2,dayId:'b',dayName:'B',completedDate:'2026-11-08',pendingSync:true}}
  }));
  const set=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
    if(this===localStorage)throw new DOMException('Synthetic full storage','QuotaExceededError');
    return set.call(this,key,value);
  };
};
let getCalendarMonthData,openCalDay,openExerciseFromCalendar;
${source('buildSessions')}
window.openBattleFixture=()=>{
  Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>true});
  CURRENT_USER={uid:'s',role:'student',status:'active'};
  tree[0].name='Protocolo da aluna';tree[0].isActive=true;tree[0].startDate='2026-11-01';
  exercise.videoUrl='https://www.youtube.com/watch/abcd';
  exercise.dayName='A';
  if(!tree[0].exercises.some(e=>e.id==='remada'))tree[0].exercises.push({id:'remada',name:'Remada com apoio',dayName:'A',sessions:[]},{id:'terra',name:'Terra',dayName:'B',sessions:[]});
  CUR_WORKOUT=null;CUR_EX=null;CUR_DAY='';
  showScreen('screen-home');
};
window.openExerciseLayout=()=>{
  document.documentElement.classList.add('tb-student-home-v17');
  showLayoutScreen('screen-exercise');
  document.getElementById('btn-del-exercise').hidden=true;
  document.getElementById('exercise-screen-title').textContent='Remada apoiada na máquina com pegada neutra'.toUpperCase();
  renderExercisePrescription(exercise,'exercise-prescription-card',2,false,false);
  const shell=document.createElement('div');
  shell.className='tb-v17-hotbar-shell';
  const nav=document.createElement('nav');
  nav.className='tb-v17-hotbar';
  for(const key of ['home','workout','diet','instructions','payments','options','reports']){
    const button=document.createElement('button');
    button.dataset.hotbar=key;
    button.innerHTML='<svg></svg><span>'+key+'</span>';
    nav.appendChild(button);
  }
  shell.appendChild(nav);
  document.body.appendChild(shell);
  ensureHomeHeader();
  const home=document.getElementById('screen-home');
  home.classList.add('tb-home-v17-screen');
  document.getElementById('tb-profile-name').textContent='Aluno com nome extenso';
  document.getElementById('tb-home-notice-count').textContent='99';
  document.getElementById('hero-eyebrow').textContent='// sistema online · protocolo ativo';
  document.getElementById('home-stats').innerHTML=['Protocolos de treino','Protocolos de dieta'].map((label,i)=>
    '<div class="stat-cell"><span class="num">'+(i+2)+'</span><span class="lbl">'+label+'</span><span class="tb-v17-next">Atualização pendente desde <strong>20/10/2026</strong></span></div>').join('');
  home.classList.add('student-battle-home');
  const battle=document.getElementById('home-daily-summary');
  battle.hidden=false;
  battle.innerHTML='<div class="home-daily-summary-head"><strong>Batalha do dia</strong><span>11/11/2026</span></div><div class="home-daily-summary-foot">Treino de hoje com nome longo para a largura dispon\u00edvel</div>';
  const title='Protocolo de treino com um nome longo para a largura disponível';
  document.getElementById('workout-screen-title').textContent=title;
  document.getElementById('student-protocol-summary').innerHTML='<div class="protocol-summary-title">'+title+'</div><div class="protocol-summary-meta">5 pastas · 39 exercícios · 106 registros</div><div class="protocol-cycle-strip"><span>Semana atual <b>8/8</b></span><span>02/11/2026–08/11/2026</span><span>Atualização <b>12/10/2026</b></span></div>';
  document.getElementById('day-folder-list').innerHTML='<div class="day-folder-card"><div class="day-folder-icon">DIA</div><div class="day-folder-info"><div class="day-folder-name">Superior completo com nome de pasta longo</div><div class="day-folder-meta">8 exercícios · 64 semanas prescritas · Último: 03/11/2026</div></div><div class="exercise-row-arrow">›</div></div>';
  prepareFontScaleRules();
};

window.openProtocol=()=>{CURRENT_USER={uid:'t',role:'trainer'};auth.currentUser={uid:'t'};VIEW_STUDENT={uid:'s',name:'Aluno de teste',workouts:tree};openEditWorkoutTs('w');document.getElementById('input-workout-start-date').value='2026-08-29';document.getElementById('input-workout-update-date').value='2026-10-24';};
const baseSave=saveWorkout;saveWorkout=function(){return window.saveCompletion=baseSave();};window.fixtureReady=true;
`;
const fixture=markup.replace('</head>','<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/home.css"></head>').replace('</body>','<script src="/fixture.js"></script><script src="/perf.js"></script><script src="/week.js"></script><script src="/battle.js"></script></body>');
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;res.setHeader('Content-Type',pathname.endsWith('.css')?'text/css':pathname.endsWith('.js')?'text/javascript;charset=utf-8':'text/html;charset=utf-8');if(pathname==='/styles.css')return res.end(stylesheet);if(pathname==='/home.css')return res.end([profileCss,homeCss,summaryCss].join('\n'));if(pathname==='/fixture.js')return res.end(setup);if(pathname==='/battle.js')return res.end(calendarRuntime);if(pathname==='/week.js')return res.end(fs.readFileSync('modules/student-week-workout-layout-v10_10_40.js'));if(pathname==='/perf.js')return res.end(fs.readFileSync('modules/session-save-performance-v10_10_9.js'));if(pathname==='/')return res.end(fixture);res.statusCode=404;res.end();});
const executable = process.env.CHROME_BIN || (process.platform === 'win32'
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : ['google-chrome','chromium','chromium-browser'].map(name => spawnSync('which',[name],{encoding:'utf8'}).stdout?.trim()).find(Boolean));
assert(executable && fs.existsSync(executable), 'Chrome is required (set CHROME_BIN).');
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const profile = fs.mkdtempSync(path.join(os.tmpdir(),'tb-login-css-'));
const args = ['--headless=new','--no-first-run','--disable-gpu','--hide-scrollbars','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'];
// Headless hosts without a mouse otherwise expose pointer:none/hover:none.
// Same baseline used by Playwright's Chromium headless launcher:
// https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/chromium/chromium.ts
args.push('--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4');
if (process.platform !== 'win32') args.push('--no-sandbox');
const chrome = spawn(executable,args,{stdio:['ignore','ignore','pipe'],windowsHide:true});
let stderr = '';
chrome.stderr.on('data',chunk => stderr += chunk);
const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
let socket;
let sequence = 0;
const pending = new Map();
function command(method,params={}) {
  const id = ++sequence;
  return new Promise((resolve,reject) => {
    const timer = setTimeout(()=>{pending.delete(id);reject(new Error(`Timed out: ${method}`));},12000);
    pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression) {
  const result = await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function assertPhoneScreens(width,scale){
  await evaluate(`document.documentElement.style.setProperty('--font-scale',${scale});void 0`);
  for(const id of ['screen-home','screen-workout','screen-exercise']){
    await evaluate(`showLayoutScreen(${JSON.stringify(id)});void 0`);
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const layout=await evaluate(`(()=>{
      const app=document.getElementById('app');
      const screen=document.getElementById(${JSON.stringify(id)});
      const heading=screen.querySelector('.header-title');
      const nav=document.querySelector('.tb-v17-hotbar-shell');
      const selectors=['.header-title','.home-hero-title','.stat-cell','.home-daily-summary-foot','.protocol-summary-title','.protocol-cycle-strip','.day-folder-name','.prescription-range','.ger-pill'];
      const clipped=[...screen.querySelectorAll(selectors.join(','))].filter(el=>el.getClientRects().length&&el.scrollWidth-el.clientWidth>1).map(el=>el.className);
      return {clipped,overflow:app.scrollWidth-app.clientWidth,navOverlap:app.getBoundingClientRect().bottom-nav.getBoundingClientRect().top,
        headingFont:parseFloat(getComputedStyle(heading).fontSize)};
    })()`);
    const context=`${id} at ${width}px with ${scale*100}% text`;
    assert.deepEqual(layout.clipped,[],context);
    assert(layout.overflow<=1&&layout.navOverlap<=1,`${context}: ${JSON.stringify(layout)}`);
    assert(layout.headingFont>=(scale===1?16:21),`Heading should honor the text preference in ${context}: ${JSON.stringify(layout)}`);
  }
}

async function assertSessionReflow(modalId,width,scale){
  await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
  const geometry=await evaluate(`(()=>{
    const sheet=document.getElementById(${JSON.stringify(modalId)}).querySelector('.modal-sheet');
    const bounds=sheet.getBoundingClientRect();
    const fields=[...sheet.querySelectorAll('.performed-set-row input, .performed-set-row label, .form-input, .backoff-suggestion, .rest-timer, .rest-timer-presets button, .btn-primary')];
    const clipped=fields.filter(node=>{
      if(!node.getClientRects().length)return false;
      const rect=node.getBoundingClientRect();
      return rect.left<bounds.left+1 || rect.right>bounds.right-1;
    }).map(node=>node.id||node.className);
    sheet.scrollLeft=100;
    const save=sheet.querySelector('.btn-primary');
    sheet.scrollTop=sheet.scrollHeight;
    const saveRect=save.getBoundingClientRect();
    return {clipped,extraWidth:sheet.scrollWidth-sheet.clientWidth,scrollLeft:sheet.scrollLeft,
      saveVisible:saveRect.top>=bounds.top && saveRect.bottom<=bounds.bottom+1,
      fieldFont:parseFloat(getComputedStyle(sheet.querySelector('[data-f="w"]')).fontSize)};
  })()`);
  const context=`${modalId}, ${width}px, ${scale*100}% font`;
  assert.deepEqual(geometry.clipped,[],context);
  assert(geometry.extraWidth<=1 && geometry.scrollLeft===0,`Horizontal scroll in ${context}`);
  assert(geometry.saveVisible,`Save button is unreachable in ${context}`);
  assert(geometry.fieldFont>=(scale===1?16:21),`Numeric fields must remain readable in ${context}, got ${geometry.fieldFont}px`);
}
try{
 socket=new WebSocket(await waitForChromePage(chrome,profile,{stderr:()=>stderr}));await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});socket.onmessage=event=>{const m=JSON.parse(event.data),t=pending.get(m.id);if(!t)return;pending.delete(m.id);m.error?t.reject(new Error(JSON.stringify(m.error))):t.resolve(m.result);};
 await command('Page.enable');await command('Network.enable');await command('Network.setBlockedURLs',{urls:['https://*']});let passed=0;
 for(const theme of ['dark','light'])for(const width of [256,320,360,390,430,520,768,1440]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<800});const previous=await evaluate('performance.timeOrigin');await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/?theme=${theme}&width=${width}`});
  for(let i=0;i<120;i++){if(await evaluate(`performance.timeOrigin!==${previous}&&!!window.fixtureReady&&!!window.TeamBullsSessionPerformance`))break;await sleep(25);}
  await evaluate(`localStorage.clear();document.documentElement.dataset.theme=${JSON.stringify(theme)};document.body.dataset.ambience='0';TeamBullsSessionPerformance.ready()`);
  await evaluate('openExerciseLayout()');
  await sleep(250);
  if(hasTechniqueGuide){
    const drill=await evaluate(`(()=>{
      showLayoutScreen('screen-day');
      const weekly=TeamBullsStudentWeekWorkoutLayout;
      weekly.render();
      const sheet=document.getElementById('tb-student-day-week-sheet');
      const previous=()=>sheet.querySelector('[data-week-delta="-1"]').click();
      const next=()=>sheet.querySelector('[data-week-delta="1"]').click();
      const labels=()=>[...sheet.querySelectorAll('.student-technique-name')].map(label=>label.textContent);
      const inWeek2=labels();
      previous();const inWeek1=labels();next();next();const inWeek3=labels();previous();
      sheet.querySelector('[data-week-exercise="e"]').click();
      const prescription=document.getElementById('exercise-prescription-card');
      const guide=prescription.querySelector('.student-technique-guide');
      const button=guide.querySelector('button');
      const rect=button.getBoundingClientRect(),card=guide.getBoundingClientRect();
      const nameStyle=getComputedStyle(button.querySelector('.student-technique-name'));
      const nameFont=nameStyle.fontFamily;
      const font=parseFloat(nameStyle.fontSize);
      button.click();
      const detail=document.getElementById('modal-technique-detail').classList.contains('open')&&document.getElementById('technique-detail-body').textContent;
      closeModal('modal-technique-detail');
      return {inWeek2,inWeek1,inWeek3,guide:guide.textContent,detail,nameFont,font,fits:rect.width<=card.width&&rect.height>=44};
    })()`);
    assert.deepEqual(drill.inWeek1,['Unilateral']);
    assert.deepEqual(drill.inWeek2,['Myo Reps com nome personalizado para a prescrição do treinador']);
    assert.deepEqual(drill.inWeek3,[]);
    assert.match(drill.guide,/semana 2.*Myo Reps.*Opcional.*Como fazer/i);
    assert.match(drill.detail,/Siga a técnica prescrita/);
    assert.match(drill.nameFont,/Barlow Condensed/);
    assert(drill.font>=20,`Technique name must be prominent at ${width}px: ${JSON.stringify(drill)}`);
    await evaluate("document.documentElement.style.setProperty('--font-scale',1.35);void 0");
    const scaled=await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const button=document.querySelector('#exercise-prescription-card .student-technique-label');
      const name=button.querySelector('.student-technique-name');
      resolve({size:parseFloat(getComputedStyle(name).fontSize),fits:button.scrollWidth<=button.clientWidth+1});
    })))`);
    assert(scaled.size>=26&&scaled.fits,`Technique name must fit with larger text at ${width}px: ${JSON.stringify(scaled)}`);
    await evaluate("document.documentElement.style.removeProperty('--font-scale');void 0");
    assert(drill.fits,`Technique control must fit and remain touch-friendly at ${width}px in ${theme}`);
  }
  if(width<=520){
    await assertPhoneScreens(width,1);
    await assertPhoneScreens(width,1.35);
    if(theme==='dark'&&width===390){
      const headingFont="parseFloat(getComputedStyle(document.querySelector('#screen-home .header-title')).fontSize)";
      const before=await evaluate(headingFont);
      const timeOrigin=await evaluate('performance.timeOrigin');
      await command('Emulation.setDeviceMetricsOverride',{width:256,height:900,deviceScaleFactor:1,mobile:true});
      await assertPhoneScreens(256,1.35);
      assert(await evaluate(headingFont)<before,'Phone heading should respond to less space');
      assert.equal(await evaluate('performance.timeOrigin'),timeOrigin,'Phone proportions should adjust without reloading');
      await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
      await command('Emulation.setDeviceMetricsOverride',{width:740,height:360,deviceScaleFactor:1,mobile:true});
      assert(await evaluate("matchMedia('(pointer: coarse)').matches"),'Landscape case must use touch input');
      await assertPhoneScreens(740,1.35);
      await command('Emulation.setTouchEmulationEnabled',{enabled:false});
      await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:true});
    }
    await evaluate("document.documentElement.style.removeProperty('--font-scale');void 0");
  }
  let navGeometry;
  if(width<=520){
    navGeometry=await evaluate(`(()=>{
      const app=document.getElementById('app');
      const nav=document.querySelector('.tb-v17-hotbar-shell');
      const button=document.querySelector('#screen-exercise .prescription-actions .btn-primary');
      app.scrollTop=button.offsetTop-140;
      const rect=button.getBoundingClientRect();
      return {appBottom:app.getBoundingClientRect().bottom,navTop:nav.getBoundingClientRect().top,
        buttonBottom:rect.bottom,buttonHeight:rect.height};
    })()`);
  }
  await evaluate(`slowCatalog=true;openLogSessionModal();document.querySelector('#sets-editor [data-f="w"]').value='82.5';document.querySelector('#sets-editor [data-f="r"]').value='10';void 0`);
  if(hasTechniqueGuide){
    const summary=await evaluate("document.querySelector('#session-prescription-summary .student-technique-guide')?.textContent");
    assert.match(summary,/semana 2.*Myo Reps.*Opcional.*Como fazer/i);
  }
  if(width<=520){
    await evaluate('renderRestTimerPresetsForExercise(exercise);addSetRow(66,8,{targetMin:8,targetMax:12,ger:3,backoff:true});void 0');
    for(const scale of [1,1.35]){
      await evaluate(`document.documentElement.style.setProperty('--font-scale',${scale});void 0`);
      await assertSessionReflow('modal-session',width,scale);
    }
    assert(navGeometry.appBottom<=navGeometry.navTop+1,`Navigation overlaps the exercise scroller at ${width}px: ${JSON.stringify(navGeometry)}`);
    assert(navGeometry.buttonBottom<=navGeometry.navTop+1 && navGeometry.buttonHeight>=44,'Register result must fit above the navigation');
    if(width===360){
      await evaluate(`document.documentElement.classList.add('virtual-keyboard-open');document.documentElement.style.setProperty('--app-height','380px');void 0`);
      await assertSessionReflow('modal-session',width,1.35);
      await evaluate(`document.documentElement.classList.remove('virtual-keyboard-open');document.documentElement.style.removeProperty('--app-height');void 0`);
    }
    await evaluate(`document.querySelector('#sets-editor .backoff-row').remove();document.documentElement.style.removeProperty('--font-scale');void 0`);
  }
  assert.equal(await evaluate(`getComputedStyle(document.getElementById('session-variant-group')).display`),'block','Cached alternatives must be visible before the delayed network response');
  assert.deepEqual(await evaluate(`[...document.getElementById('input-session-variant').options].map(o=>o.value)`),['','dumbbell','barbell']);
  await evaluate(`(()=>{const s=document.getElementById('input-session-variant');s.value='barbell';s.dispatchEvent(new Event('change',{bubbles:true}));releaseCatalog();})()`);await sleep(30);
  assert.equal(await evaluate(`document.getElementById('input-session-variant').value`),'barbell','Late catalog response must preserve the selected exercise');
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('#sets-editor input')].map(i=>i.value)`),['82.5','10']);
  await evaluate(`document.querySelector('#modal-session [onclick="saveSession()"]')?.click();void 0`);
  for(let i=0;i<100;i++){if(await evaluate(`!document.getElementById('modal-session').classList.contains('open')`))break;await sleep(20);}
  const saved=await evaluate(`TeamBullsSessionPerformance.sessions().find(s=>s.performedExerciseItemId==='barbell')`);assert(saved,'Real durable session save must contain the chosen alternative');assert.equal(saved.performedExerciseName,'Supino reto com barra');assert.deepEqual(saved.sets.map(s=>({weight:s.weight,reps:s.reps})),[{weight:82.5,reps:10}]);assert.equal(saved.exerciseId,'e');assert.equal(saved.exerciseName,'Supino Reto');assert.equal(saved.week,2);
  assert.equal(await evaluate('JSON.stringify(exercise.sessions.find(s=>s.id==="old"))'),await evaluate('JSON.stringify(JSON.parse(originalHistory)[0])'));
  await evaluate(`slowCatalog=false;openEditSession('old')`);await sleep(25);assert.equal(await evaluate(`selectedVariantData(exercise,'edit-session-variant').performedExerciseName`),'Supino autorizado antigo','Editing notes must retain a variation removed from the catalog');assert.equal(await evaluate(`selectedVariantData(exercise,'edit-session-variant').performedExerciseItemId`),'removed');
  if(width<=520){
    await evaluate(`useResistedTime=true;addEditSetRow(62.5,20,{targetMin:15,targetMax:30,ger:4});document.documentElement.style.setProperty('--font-scale',1.35);void 0`);
    await assertSessionReflow('modal-edit-session',width,1.35);
    assert.equal(await evaluate("document.querySelector('#edit-sets-editor .performed-set-row:last-child .performed-field-result').textContent.trim()"),'Tempo');
    await evaluate(`useResistedTime=false;document.documentElement.style.removeProperty('--font-scale');void 0`);
  }
  await evaluate(`closeModal('modal-edit-session');slowCatalog=true;openLogSessionModal();EXERCISE_OPTIONS={groups:[{...group,items:group.items.filter(i=>i.id!=='barbell')}]};releaseCatalog();void 0`);await sleep(25);assert.equal(await evaluate(`selectedVariantData(exercise,'input-session-variant').performedExerciseItemId`),'barbell','A late catalog deletion must not silently replace the displayed remembered choice');
  await evaluate(`closeModal('modal-session');EXERCISE_OPTIONS={groups:[group]};slowCatalog=true;openLogSessionModal();closeModal('modal-session');CURRENT_USER={uid:'other',role:'student'};releaseCatalog();void 0`);await sleep(25);assert.equal(await evaluate(`document.getElementById('modal-session').classList.contains('open')`),false);
  await evaluate(`slowCatalog=false;openProtocol();document.getElementById('input-workout-name').value='Treino revisado';holdRefresh=true;document.querySelector('#modal-workout [onclick="saveWorkoutFromButton()"]').click();void 0`);
  for(let i=0;i<100;i++){if(await evaluate(`refreshed>0||document.getElementById('workout-save-status').textContent.startsWith('Erro')`))break;await sleep(20);}
  assert.equal(await evaluate(`remote['workouts/w'].name`),'Treino revisado','Rename must complete even when the schedule service is unavailable');assert.deepEqual(await evaluate('reads'),['workouts/w']);assert.equal(await evaluate(`document.getElementById('modal-workout').classList.contains('open')`),false);
  assert.equal(await evaluate(`ACTION_LOCKS.has('save-workout')`),false,'A confirmed save must release the button before the optional profile reload finishes');
  await evaluate(`holdWrite=true;openProtocol();document.getElementById('input-workout-name').value='Nova edição';document.querySelector('#modal-workout [onclick="saveWorkoutFromButton()"]').click();void 0`);await sleep(30);
  assert.equal(await evaluate(`ACTION_LOCKS.has('save-workout')`),true);await evaluate(`holdRefresh=false;releaseRefresh();void 0`);await sleep(30);assert.equal(await evaluate(`ACTION_LOCKS.has('save-workout')`),true,'The older reload must not unlock the newer write');
  await evaluate(`holdWrite=false;releaseWrite();saveCompletion`);assert.equal(await evaluate(`remote['workouts/w'].name`),'Nova edição');assert.equal(await evaluate(`ACTION_LOCKS.has('save-workout')`),false);
  await evaluate(`failRefresh=true;openProtocol();document.getElementById('input-workout-name').value='Confirmado';document.querySelector('#modal-workout [onclick="saveWorkoutFromButton()"]').click();saveCompletion`);assert.equal(await evaluate(`remote['workouts/w'].name`),'Confirmado');assert.equal(await evaluate(`document.getElementById('workout-save-status').textContent.startsWith('Erro')`),false,'A refresh failure cannot announce a failed commit');
  await evaluate(`failRefresh=false;holdRefresh=true;openProtocol();document.getElementById('input-workout-name').value='Intermediário';document.querySelector('#modal-workout [onclick="saveWorkoutFromButton()"]').click();void 0`);await sleep(30);
  await evaluate(`window.olderCompletion=saveCompletion;window.olderRefresh=releaseRefresh;holdRefresh=false;openProtocol();document.getElementById('input-workout-name').value='Nome final';document.querySelector('#modal-workout [onclick="saveWorkoutFromButton()"]').click();saveCompletion`);
  await evaluate(`olderRefresh();olderCompletion`);assert.equal(await evaluate(`VIEW_STUDENT.workouts[0].name`),'Nome final','An older reload cannot reapply its previous confirmed name after a newer save');
  await evaluate('window.beforeChairTree=tree;CURRENT_USER={uid:"s",role:"student"};auth.currentUser={uid:"s"};MODE="cloud";CUR_WORKOUT="chair-w";CUR_EX="flexora";tree=[{id:"chair-w",userId:"s",name:"Inferior",exercises:[{id:"flexora",name:"Cadeira flexora",sessions:[],techniqueIds:["bos"]}]}];slowCatalog=false;openLogSessionModal();document.querySelector(\'#sets-editor [data-f="w"]\').value="45";document.querySelector(\'#sets-editor [data-f="r"]\').value="8";document.querySelector("#sets-editor .performed-set-row").dataset.backoff="1";window.chairSessionId=SESSION_CREATE_ID;tree[0].exercises=[]');
  await evaluate('document.querySelector(\'#modal-session [onclick="saveSession()"]\').click()');
  for(let i=0;i<100;i++){if(await evaluate('!document.getElementById("modal-session").classList.contains("open")'))break;await sleep(20);}
  const chair=await evaluate('TeamBullsSessionPerformance.sessions().find(row=>row.id===chairSessionId)');
  assert(chair,'A real chair form must save after its live exercise disappears during refresh');
  assert.equal(chair.exerciseId,'flexora');assert.equal(chair.workoutId,'chair-w');assert.equal(chair.exerciseName,'Cadeira flexora');
  assert.equal(chair.sets[0].weight,45);assert.equal(chair.sets[0].reps,8);assert.equal(chair.sets[0].backoff,true);
  assert.equal(await evaluate('tree[0].exercises.length'),0,'The save must not recreate an exercise in the protocol');
  await evaluate('tree=beforeChairTree;CUR_WORKOUT="w";CUR_EX="e"');
  assert.deepEqual(await evaluate('errors'),[]);passed++;
 }
 await command('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
 const api='TeamBullsWorkoutCompletion';
 const screenshot=async(name,selector)=>{
   if(!process.env.TB_SCREENSHOT_DIR)return;
   const rect=await evaluate(`(()=>{
     const node=document.querySelector(${JSON.stringify(selector)});
     const style=document.createElement('style');style.id='tb-screenshot-only';
     style.textContent='#app,.screen.active {height:auto!important;max-height:none!important;overflow:visible!important} .header,.tb-v17-hotbar-shell,.fab-wrap {visibility:hidden!important}';
     document.head.append(style);
     const copy=node.cloneNode(true);
     node.before(copy);node.hidden=true;
     copy.querySelectorAll('.home-daily-summary-foot strong,.student-guided-heading strong').forEach(el=>el.textContent='Superior completo — 01');
     copy.querySelectorAll('.home-daily-summary-head span').forEach(el=>el.textContent='10/11/2026');
     copy.querySelectorAll('.student-guided-prescription').forEach(el=>el.textContent='2 × 8–12 reps · GER 02');
     copy.querySelectorAll('.student-guided-video iframe').forEach(frame=>{
       frame.removeAttribute('loading');frame.removeAttribute('src');
       frame.srcdoc='<meta name="viewport" content="width=device-width"><body style="margin:0;display:grid;place-items:center;height:100dvh;background:linear-gradient(135deg,#22201e,#0c0b0a);color:#eee;font:600 14px system-ui"><div style="text-align:center"><span style="display:block;margin:0 auto 10px;background:#a91625;border-radius:6px;padding:8px 15px;width:max-content">▶</span>Player de demonstração</div>';
     });
     const box=copy.getBoundingClientRect();window.tbScreenshotCleanup=()=>{copy.remove();node.hidden=false;style.remove();};
     return {x:Math.max(0,Math.floor(box.x+scrollX-8)),y:Math.max(0,Math.floor(box.y+scrollY-8)),width:Math.ceil(box.width+16),height:Math.ceil(box.height+16),scale:2};
   })()`);
   try{
     await command('Emulation.setDeviceMetricsOverride',{width:390,height:Math.max(900,rect.y+rect.height+50),deviceScaleFactor:1,mobile:true});
     await sleep(200);
     const {data}=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:rect});
     fs.writeFileSync(path.join(process.env.TB_SCREENSHOT_DIR,name+'.png'),Buffer.from(data,'base64'));
   }finally{
     await evaluate('tbScreenshotCleanup()');
     await command('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:true});
   }
 };
 const clickBattle=async name=>evaluate(`(()=>{const button=document.querySelector('.screen.active button[onclick*="${name}("]'); if(!button||button.disabled)return false;button.click();return true;})()`);
 await evaluate(`document.documentElement.dataset.theme='light';blockBattleStorage();openBattleFixture()`);
 for(let i=0;i<100;i++){if(await evaluate(`!!document.querySelector('#home-daily-summary [onclick*="startGuidedFromHome"]')`))break;await sleep(20);}
 assert.equal(await evaluate(`document.getElementById('home-daily-summary').previousElementSibling.classList.contains('home-hero')`),true,'Batalha do dia must follow the Sala Vermelha header');
 assert.equal(await evaluate(`document.querySelector('.home-hero').previousElementSibling.classList.contains('header')`),true,'Sala Vermelha must come first after the navigation header');
 assert.match(await evaluate(`document.getElementById('home-daily-summary').textContent`),/Batalha do dia.*semana 2/is);
 assert.equal(await evaluate(`[...document.querySelectorAll('#home-stats :is(.num,.lbl)')].every(node=>getComputedStyle(node).display==='none')`),true);
 await evaluate("document.documentElement.dataset.theme='dark';document.getElementById('home-daily-summary').scrollIntoView({block:'start'})");
 await screenshot('team-bulls-batalha-do-dia','#home-daily-summary');
 assert(await evaluate(api+'.startGuidedFromHome()'));
 assert.equal(await evaluate('activeScreenId()'),'screen-home');
 assert.equal(await evaluate(`document.querySelector('#home-daily-summary h3').textContent`),'Supino Reto');
 assert.match(await evaluate(`document.querySelector('#home-daily-summary iframe').src`),/youtube-nocookie.*abcd/);
 await evaluate("document.getElementById('home-daily-summary').scrollIntoView({block:'start'})");
 await screenshot('team-bulls-treino-guiado','#home-daily-summary');
 assert.equal(await evaluate(`document.querySelector('#home-daily-summary .student-guided-substitution select').options.length`),3);
 await evaluate(`(()=>{const select=document.querySelector('#home-daily-summary .student-guided-substitution select');select.value='dumbbell';select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 assert.equal(await evaluate(`document.querySelector('#home-daily-summary h3').textContent`),'Supino Reto');
 await evaluate(`document.getElementById('confirm-ok-btn').click()`);
 for(let i=0;i<60;i++){if(await evaluate(`savedBattle().then(data=>data.guide?.variants?.e==='dumbbell')`))break;await sleep(20);}
 assert.equal(await evaluate(`document.querySelector('#home-daily-summary h3').textContent`),'Supino reto com halteres');
 assert.equal(await evaluate(`document.querySelector('#home-daily-summary iframe')`),null,'The original video is not shown for a replacement without a video');
 assert(await clickBattle('registerGuided'));
 assert.equal(await evaluate(`document.getElementById('input-session-variant').value`),'dumbbell');
 await evaluate(`closeModal('modal-session')`);
 assert(await clickBattle('showGuidedHistory'));
 const history=await evaluate(`[...document.querySelectorAll('#battle-history-list .session-date-badge')].map(node=>node.textContent)`);
 assert(history[0].includes('2026-11-10')&&history[1].includes('2026-11-01'),'History shows the latest sessions first');
 await evaluate(`closeModal('modal-battle-history')`);
 assert(await evaluate(api+'.finishExercise()'));
 assert.equal(await evaluate(`document.querySelector('#home-daily-summary h3').textContent`),'Remada com apoio');
 await evaluate(`openWorkout('w');openDay('B')`);
 assert.equal(await evaluate(`document.querySelector('#student-workout-completion [onclick*="startGuidedWorkout"]')`),null,'Another day cannot start while a session is open');
 await evaluate(`openWorkout('w')`);
 assert.equal(await evaluate(`document.querySelector('#day-folder-list [data-reorder-day="A"]').dataset.battleState`),'active');
 await evaluate(`openDay('A')`);
 assert.equal(await evaluate(`document.querySelector('#student-workout-completion h3').textContent`),'Remada com apoio');
 assert(await clickBattle('registerGuided'));
 assert.equal(await evaluate(`SESSION_EID`),'remada');
 assert.equal(await evaluate(`document.getElementById('input-session-week').value`),'2');
 await evaluate(`closeModal('modal-session')`);
 assert(await clickBattle('pauseGuided'));
 assert.match(await evaluate(`document.getElementById('modal-confirm').textContent`),/Pausar treino/);
 await evaluate(`document.getElementById('confirm-ok-btn').click()`);
 assert.equal(await evaluate(`(async()=>{for(let n=0;n<80;n++){const saved=await savedBattle();if(saved.guide?.status==='paused')return saved.guide.status;await new Promise(r=>setTimeout(r,20));}})()`),'paused');
 const previousOrigin=await evaluate('performance.timeOrigin');
 await command('Page.reload');
 for(let i=0;i<120;i++){try{if(await evaluate(`performance.timeOrigin!==${previousOrigin}&&!!window.TeamBullsWorkoutCompletion`))break;}catch{}await sleep(30);}
 await evaluate(`openBattleFixture()`);
 assert.match(await evaluate(`document.getElementById('home-daily-summary').textContent`),/Treino pausado/);
 assert(await evaluate(api+'.resumeGuided()'));
 assert.equal(await evaluate(`document.querySelector('#home-daily-summary h3').textContent`),'Remada com apoio');
 assert(await clickBattle('finishGuided'));
 assert.match(await evaluate(`document.getElementById('modal-confirm').textContent`),/Encerrar treino com exercícios pendentes/);
 await evaluate(`closeModal('modal-confirm');document.querySelector('.student-guided-card details:last-child').open=true`);
 assert(await clickBattle('cancelGuided'));
 await evaluate(`document.getElementById('confirm-ok-btn').click()`);
 for(let i=0;i<100;i++){if(await evaluate(`savedBattle().then(data=>data.guide===null)`))break;await sleep(20);}
 assert.equal(await evaluate(`savedBattle().then(data=>data.guide)`),null);
 await evaluate(`openWorkout('w');openDay('B')`);
 for(const theme of ['light','dark']){
   await evaluate(`document.documentElement.dataset.theme='${theme}'`);
   const layout=await evaluate(`(()=>{
     const panel=document.getElementById('student-workout-completion');
     const progress=panel.querySelector('.workout-completion-progress');
     const button=panel.querySelector('[onclick*="startGuidedWorkout"]');
     return {fits:progress.getBoundingClientRect().bottom+8<=button.getBoundingClientRect().top,height:button.getBoundingClientRect().height,
       directEnd:!!panel.querySelector('[onclick*="completeCurrentDay"],[onclick*="finishGuided"]')};
   })()`);
   assert(layout.fits&&layout.height>=44&&!layout.directEnd,'The completed day must offer a separated start action in '+theme);
 }
 assert.equal(await evaluate(api+'.startGuidedWorkout()'),false);
 assert.match(await evaluate(`document.getElementById('confirm-text').textContent`),/\u00faltimo treino que voc\u00ea concluiu/);
 assert.equal(await evaluate(`savedBattle().then(data=>data.guide)`),null);
 await evaluate(`document.getElementById('confirm-ok-btn').click()`);
 for(let i=0;i<100;i++){if(await evaluate(`savedBattle().then(data=>data.guide?.repeat===true)`))break;await sleep(20);}
 assert.equal(await evaluate(`savedBattle().then(data=>data.guide?.repeat)`),true);
 assert.equal(await evaluate(api+'.finishGuided()'),false);
 await evaluate(`document.getElementById('confirm-ok-btn').click()`);
 for(let i=0;i<100;i++){if(await evaluate(`savedBattle().then(data=>data.guide===null)`))break;await sleep(20);}
 assert.equal(await evaluate(`savedBattle().then(data=>Object.keys(data.completions).length)`),1,'A guided repeat must not duplicate the legacy completion');
 await evaluate(`openBattleFixture()`);
 assert(await evaluate(api+'.startGuidedFromHome()'));
 assert.equal(await evaluate(api+'.finishGuided()'),false,'Incomplete workout must ask for confirmation');
 await evaluate(`document.getElementById('confirm-ok-btn').click()`);
 for(let i=0;i<100;i++){if(await evaluate(`savedBattle().then(data=>data.guide===null)`))break;await sleep(20);}
 const storedProgress=await evaluate(`savedBattle()`);
 assert.equal(storedProgress.guide,null,'Completion and clearing the guide must be persisted together');
 assert(Object.values(storedProgress.completions).some(record=>record.dayId==='a'&&record.pendingSync===true));
 assert(Object.values(storedProgress.completions).some(record=>record.dayId==='b'&&record.pendingSync===true),'Legacy pending completion must survive migration');
 assert.equal(await evaluate(`localStorage.getItem('team_bulls_workout_progress_v2_s')`),null,'Browser test must exercise IndexedDB, not the local fallback');
 assert.equal(await evaluate(`exercise.sessions.some(item=>item.id==='old')`),true);
 assert.deepEqual(await evaluate('errors'),[]);
 console.log('PASS Batalha do dia in browser: stays on Home, preserves guide in Treino, highlights the day, shows history and video, uses existing register editor, restores after reload and preserves legacy data and allows a confirmed repeat without adding a duplicate completion with full localStorage.');
 console.log(`PASS ${passed} browser combinations: legacy/cached alternatives, real durable session payload and preserved sets/week/history, late catalog choice, historical removed alternative, stale account callback, prescribed Cadeira flexora with backoff surviving a structure refresh without recreating exercises, real protocol rename with schedule unavailable, immediate unlock after confirmation, technique names, optional status and help by week, and automatic mobile proportions for home, training, exercise and session forms at 256–1440 px in both themes.`);
} finally {
  if(socket?.readyState===1){try{await command('Browser.close');}catch{}socket.close();}
  chrome.kill();
  server.close();
  // Only the randomly created isolated Chrome profile is disposable.
  if(path.dirname(profile)===os.tmpdir()&&path.basename(profile).startsWith('tb-login-css-')){
    for(let i=0;i<8;i++){try{fs.rmSync(profile,{recursive:true,force:true});break;}catch{await sleep(150);}}
  }
}
