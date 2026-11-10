// Real modal markup, delivered chooser/controllers and durable session module.
// All accounts/data are synthetic; external requests are blocked.
import assert from 'node:assert/strict';import fs from 'node:fs';import http from 'node:http';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';import {waitForChromePage} from './chrome-readiness.mjs';
import {source,variantFunctions} from './session-variant-protocol-check.mjs';
const names=[...variantFunctions,'openLogSessionModal','openEditSession','addEditSetRow','populateSessionEditorForWeek','addSetRow','removeSet','renderSessionPrescriptionSummary','beginAction','endAction','openModal','closeModal','saveWorkout','saveWorkoutFromButton','setWorkoutSaveStatus','buildColorPicker','pickColor','openEditWorkoutTs','v109PersistWorkoutCycle','v109CyclePayload','hasManualOrder','createdMillis','orderedWorkouts','activeWorkoutId'];
const markup=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'');
const setup=`
let CURRENT_USER={uid:'s',role:'student'},MODE='cloud',LOCAL_OWNER_UID='',INACTIVE_UID='',LOCAL_DB={},AUTH_STATE_REVISION=1;
let SESSION_WID='w',SESSION_EID='e',SESSION_CREATE_ID='',CUR_WORKOUT='w',CUR_EX='e',EDIT_SESSION_ID='',EDIT_SESSION_WID='',EDIT_SESSION_EID='',LAST_SESSION_WEEK=2,SESSION_EDITOR_WEEK=2,SET_COUNT=0,EDIT_SET_COUNT=0,VARIANT_LOAD_SEQ=0,TRAINING_RECOMMENDATIONS_CONTEXT=null;
let MODAL_TARGET='student',EDIT_W='w',SEL_COLOR='#a855f7',WORKOUT_CREATE_ID=null;const PALETTE=['#e11d48','#a855f7'],ACTION_LOCKS=new Set();
window.errors=[];window.messages=[];window.reads=[];window.writes=[];window.slowCatalog=false;window.holdRefresh=false;window.failRefresh=false;window.failWrites=false;window.holdWrite=false;window.releaseWrite=null;window.releaseCatalog=null;window.refreshed=0;
window.alert=m=>messages.push(String(m));window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});
const group={id:'g',name:'Supino Reto',items:[{id:'dumbbell',name:'Supino reto com halteres'},{id:'barbell',name:'Supino reto com barra'}]};let EXERCISE_OPTIONS={groups:[group]};
const exercise={id:'e',name:'Supino Reto',sessions:[{id:'old',userId:'s',date:'2026-11-01',week:1,performedExerciseItemId:'removed',performedExerciseName:'Supino autorizado antigo',sets:[{weight:60,reps:8}]}]};let tree=[{id:'w',userId:'s',name:'Treino antigo',color:'#e11d48',startDate:'2026-08-29',updateDate:'2026-10-24',isActive:false,exercises:[exercise]}];
let VIEW_STUDENT={uid:'s',name:'Aluno de teste',workouts:tree},VIEW_STUDENT_WORKOUT=tree[0];const originalHistory=JSON.stringify(exercise.sessions);let count=0;
const getE=(w,e)=>tree.find(x=>x.id===w)?.exercises.find(x=>x.id===e),getW=w=>tree.find(x=>x.id===w),getWorkouts=()=>tree;
const auth={currentUser:{uid:'t'}},firebase={firestore:{FieldValue:{serverTimestamp:()=>123},Timestamp:{fromMillis:ms=>({ms})},FieldPath:{documentId:()=> '__name__'}}};
window.remote={'workouts/w':{userId:'s',name:'Treino antigo',color:'#e11d48',startDate:'2026-08-29',updateDate:'2026-10-24',isActive:false},'protocolReviewSchedules/s':{studentId:'s',trainerId:'t',sourceWorkoutId:'active',startDate:'2026-10-01',intervalWeeks:4,lastCompletedCycle:2,lastCompletedDate:'2026-10-29'}};
function ref(collection,id){return{key:collection+'/'+id,collection,id};}const db={collection:collection=>({where:()=>({get:async()=>({docs:Object.entries(remote).filter(([k,v])=>k.startsWith(collection+'/')&&v.userId==='s').map(([k,v])=>({id:k.split('/')[1],data:()=>structuredClone(v)}))})}),doc:id=>ref(collection,id)}),runTransaction:async run=>{const staged=[];const result=await run({get:async r=>{reads.push(r.key);if(r.collection==='protocolReviewSchedules')throw new Error('schedule unavailable');return{exists:!!remote[r.key],data:()=>structuredClone(remote[r.key])};},update:(r,p)=>staged.push({key:r.key,p:structuredClone(p)}),set:(r,p)=>staged.push({key:r.key,p:structuredClone(p)})});if(holdWrite)await new Promise(r=>releaseWrite=r);if(failWrites)throw new Error('simulated write failure');for(const row of staged){remote[row.key]={...remote[row.key],...row.p};writes.push(row);}return result;}};
const cloudWrite=p=>p,cloudGet=r=>r.get(),showToast=m=>messages.push(m),today=()=> '2026-11-10',draftId=()=> 'new-session-'+(++count),uid=draftId,validIsoDate=s=>/^\\d{4}-\\d{2}-\\d{2}$/.test(s||''),addDaysIso=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const storageGet=k=>localStorage.getItem(k),storageSet=(k,v)=>{localStorage.setItem(k,v);return true;},withTimeout=p=>p,runWhenIdle=fn=>setTimeout(fn,0),saveSessionArchive=()=>{},syncSessionToHistory=()=>{},saveCloudBackup=()=>{},renderExercise=()=>{},sessionSyncBadge=()=>'',exerciseUsesResistedTime=()=>false;
function saveSession(){throw new Error('The registered-student durable save module must handle this click');}window.TeamBulls107={flushPendingMutationSync:async()=>{}};
const normalizePrescriptionSet=s=>s?.targetMin?s:null,prescribedRangeLabel=()=> '8–12',formatGerLevel=()=> '2',renderGerMeter=()=>'',resolveWeekPrescription=()=>({sets:[{targetMin:8,targetMax:12,ger:2}]}),prescriptionCompactSummary=e=>({rx:resolveWeekPrescription(),reps:'8–12',ger:'2'});
const renderOptionalTechniqueMode=()=>{},renderEditOptionalTechniqueMode=()=>{},selectedPerformedTechniqueMode=()=>'',resetRestTimer=()=>{},focusEditorField=()=>{};
const findSessionOwner=id=>({exercise,session:exercise.sessions.find(s=>s.id===id),workout:tree[0]});
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const cachedExerciseCatalog=()=>({groups:[group]});async function loadExerciseOptions(){if(slowCatalog)await new Promise(r=>releaseCatalog=r);return EXERCISE_OPTIONS;}
async function renderTrainerStudent(){refreshed++;if(holdRefresh)await new Promise(r=>window.releaseRefresh=r);if(failRefresh)throw new Error('refresh unavailable');}
${names.map(source).join('\n')}
window.openProtocol=()=>{CURRENT_USER={uid:'t',role:'trainer'};VIEW_STUDENT={uid:'s',name:'Aluno de teste',workouts:tree};openEditWorkoutTs('w');document.getElementById('input-workout-start-date').value='2026-08-29';document.getElementById('input-workout-update-date').value='2026-10-24';};
const baseSave=saveWorkout;saveWorkout=function(){return window.saveCompletion=baseSave();};window.fixtureReady=true;
`;
const fixture=markup.replace('</head>','<link rel="stylesheet" href="/styles.css"></head>').replace('</body>','<script src="/fixture.js"></script><script src="/perf.js"></script></body>');
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;res.setHeader('Content-Type',pathname.endsWith('.css')?'text/css':pathname.endsWith('.js')?'text/javascript;charset=utf-8':'text/html;charset=utf-8');if(pathname==='/styles.css')return res.end(fs.readFileSync('styles_v10_10_9.css'));if(pathname==='/fixture.js')return res.end(setup);if(pathname==='/perf.js')return res.end(fs.readFileSync('modules/session-save-performance-v10_10_9.js'));if(pathname==='/')return res.end(fixture);res.statusCode=404;res.end();});
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
try{
 socket=new WebSocket(await waitForChromePage(chrome,profile,{stderr:()=>stderr}));await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});socket.onmessage=event=>{const m=JSON.parse(event.data),t=pending.get(m.id);if(!t)return;pending.delete(m.id);m.error?t.reject(new Error(JSON.stringify(m.error))):t.resolve(m.result);};
 await command('Page.enable');await command('Network.enable');await command('Network.setBlockedURLs',{urls:['https://*']});let passed=0;
 for(const theme of ['dark','light'])for(const width of [320,390,430,768,1440]){
  await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<800});const previous=await evaluate('performance.timeOrigin');await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/?theme=${theme}&width=${width}`});
  for(let i=0;i<120;i++){if(await evaluate(`performance.timeOrigin!==${previous}&&!!window.fixtureReady&&!!window.TeamBullsSessionPerformance`))break;await sleep(25);}
  await evaluate(`localStorage.clear();document.documentElement.dataset.theme=${JSON.stringify(theme)};TeamBullsSessionPerformance.ready()`);
  await evaluate(`slowCatalog=true;openLogSessionModal();document.querySelector('#sets-editor [data-f="w"]').value='82.5';document.querySelector('#sets-editor [data-f="r"]').value='10';void 0`);
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
  assert.deepEqual(await evaluate('errors'),[]);passed++;
 }
 console.log(`PASS ${passed} browser combinations: legacy/cached alternatives, real durable session payload and preserved sets/week/history, late catalog choice, historical removed alternative, stale account callback, real protocol rename with schedule unavailable, and immediate unlock after confirmation at 320–1440 px in both themes.`);
} finally {
  if(socket?.readyState===1){try{await command('Browser.close');}catch{}socket.close();}
  chrome.kill();
  server.close();
  // Only the randomly created isolated Chrome profile is disposable.
  if(path.dirname(profile)===os.tmpdir()&&path.basename(profile).startsWith('tb-login-css-')){
    for(let i=0;i<8;i++){try{fs.rmSync(profile,{recursive:true,force:true});break;}catch{await sleep(150);}}
  }
}
