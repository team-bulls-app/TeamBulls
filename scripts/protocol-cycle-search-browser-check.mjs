// Actual catalog markup, search events, new-workout save button and cycle card.
// All cloud records are synthetic; external requests are blocked.
import assert from 'node:assert/strict';import fs from 'node:fs';import http from 'node:http';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';import {waitForChromePage} from './chrome-readiness.mjs';
import {fn,cycleFunctions,catalogFunctions,orderingFunctions} from './protocol-cycle-search-check.mjs';
const markup=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'');
const catalogOrderFunctions=['normalizeExerciseCatalog','mergeExerciseCatalogWithDefaults','catalogPreserveFields','persistSharedCatalog','commitExerciseCatalogOrder','moveExerciseGroup','moveExerciseOptionItem','normalizeTechniqueItem','normalizeTechniqueCatalog','persistTechniqueCatalog','commitCatalogAction','renderTechniques','moveTechnique'];
const names=[...catalogOrderFunctions,...cycleFunctions,...catalogFunctions,...orderingFunctions,'v104DateOr','v104CycleWeek','v104CycleMeta','syncWorkoutUpdateDateFromStart','renderTrainerProtocolReview','renderTrainerWorkoutUpdateDate','loadTrainerProtocolReview','saveProtocolReviewSchedule','openProtocolReviewInfo','showConfirm','v109SyncActiveProtocolDates','v109SyncProtocolMetadataToWeeklySchedule','saveWorkout','setWorkoutSaveStatus','saveWorkoutFromButton','beginAction','endAction','openModal','closeModal'];
const setup=`
window.errors=[];window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));window.messages=[];const errorLog=console.error.bind(console);console.error=(...args)=>{messages.push(args.map(String).join(' '));errorLog(...args);};window.alert=m=>messages.push(String(m));
let CURRENT_USER={uid:'t',role:'trainer'},auth={currentUser:{uid:'t'}},MODE='cloud',MODAL_TARGET='student',EDIT_W=null,WORKOUT_CREATE_ID=null,SEL_COLOR='#e11d48',VIEW_STUDENT_WORKOUT=null,TRAINING_RECOMMENDATIONS_CONTEXT=null,V109_PROTOCOL_REVIEW_STUDENT='',V109_PROTOCOL_REVIEW_SCHEDULE=null,EXERCISE_OPTIONS_CONTEXT=null;
let VIEW_STUDENT={uid:'s',workouts:[{id:'old',userId:'s',name:'Anterior',color:'#e11d48',isActive:true,startDate:'2026-09-01',updateDate:'2027-01-01',order:0,createdAt:123,exercises:[]}]};
const ACTION_LOCKS=new Set(),firebase={firestore:{FieldValue:{serverTimestamp:()=>123}}};window.failWrites=false;window.failAcknowledgment=false;
window.remote={'workouts/old':structuredClone(VIEW_STUDENT.workouts[0]),'protocolReviewSchedules/s':{studentId:'s',trainerId:'t',sourceWorkoutId:'old',startDate:'2026-09-01',intervalWeeks:4,lastCompletedCycle:2,lastCompletedDate:'2026-10-30'}};
function ref(key){return{key,doc:id=>ref(key+'/'+id),where:()=>ref(key),limit:()=>ref(key),get:async()=>key==='users'?{docs:[{id:'s',data:()=>({name:'Aluno fictício',role:'student',trainerId:'t',status:'active'})}]}:key==='workouts'?{docs:Object.entries(remote).filter(([k])=>k.startsWith('workouts/')).map(([k,v])=>({id:k.split('/')[1],data:()=>structuredClone(v)}))}:{exists:!!remote[key],data:()=>structuredClone(remote[key])}};}
const db={collection:ref,runTransaction:async task=>{const writes=[];let wrote=false;const result=await task({get:async r=>{if(wrote)throw new Error('Read after write');if(r.key.startsWith('workouts/')&&!remote[r.key])throw new Error('Rules 28 deny missing workout GET');return r.get();},set:(r,p,o)=>{wrote=true;writes.push([r.key,p,o?.merge]);},update:(r,p)=>{wrote=true;writes.push([r.key,p,true]);}});if(failWrites)throw new Error('offline');for(const [k,p,m] of writes)remote[k]=m?{...remote[k],...structuredClone(p)}:structuredClone(p);if(failAcknowledgment){failAcknowledgment=false;throw new Error('timeout-after-commit');}return result;}};
const cloudWrite=p=>p,cloudGet=r=>r.get(),cloudWriteError=e=>e.message,showToast=m=>messages.push(m),today=()=> '2026-11-09',uid=()=> 'new',validIsoDate=s=>/^\\d{4}-\\d{2}-\\d{2}$/.test(s||''),fmt=s=>s;
const addDaysIso=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);},v104DateDiffDays=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/86400000);
const ensureReportCycleRuntime=async()=>{},loadTrainerProtocolReviewAlerts=async()=>{},TeamBullsMonthlyReports={ensureForStudent:async()=>{}};window.TeamBullsMonthlyReports=TeamBullsMonthlyReports;
const canUseCatalogVideos=()=>false,getWorkouts=()=>VIEW_STUDENT.workouts,normalizeWorkoutCollection=w=>orderedWorkouts(w);const focusEditorField=()=>{};
function showScreen(id){document.querySelectorAll('.screen').forEach(e=>e.classList.remove('active'));document.querySelectorAll('.fab').forEach(e=>e.style.display='none');document.getElementById(id).classList.add('active');}
function renderTrainerStudent(){VIEW_STUDENT.workouts=Object.entries(remote).filter(([k])=>k.startsWith('workouts/')).map(([k,v])=>({...structuredClone(v),id:k.split('/')[1]}));return loadTrainerProtocolReview('s');}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}const jsArg=s=>esc(JSON.stringify(s));
let EXERCISE_OPTIONS={groups:[{id:'g',name:'Extensão de joelho',items:[{id:'i',name:'Cadeira Extensora'},{id:'s',name:'Sissy squat'}]},{id:'other',name:'Peitoral',items:[{id:'p',name:'Supino reto'}]},{id:'last',name:'Outro grupo',items:[{id:'bad',name:'<img src=x onerror=alert(1)>'}]}]};
const EXERCISE_CATALOG_VERSION=3,catalogDefaults=structuredClone(EXERCISE_OPTIONS),defaultExerciseOptions=()=>structuredClone(catalogDefaults),cacheExerciseCatalog=()=>{},cacheTechniqueCatalog=()=>{};let EXERCISE_OPTIONS_LOADED_AT=0,CATALOG_EDITOR_CONTEXTS={},EDIT_INSTRUCTION_FOLDER_ID='',EDIT_INSTRUCTION_ITEM_ID='',EDIT_TECHNIQUE_ID='';const DEFAULT_TECHNIQUE_DEFINITIONS=[{id:'standard',name:'Padrão',code:'P',description:'Preservar',locked:true,order:0}];let TECHNIQUE_CATALOG={revision:1,items:[...DEFAULT_TECHNIQUE_DEFINITIONS,{id:'custom',code:'C',name:'Personalizada',description:'Texto',order:1}]};
${names.map(fn).join('\n')}
window.initFixture=async()=>{await loadTrainerProtocolReview('s');showScreen('screen-trainer-student');window.fixtureReady=true;};
`;
const fixture=markup.replace('</head>','<link rel="stylesheet" href="/styles.css"></head>').replace('</body>','<script src="/fixture.js"></script><script src="/schedule.js"></script><script src="/organizer.js"></script><script src="/ready.js"></script></body>');
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost').pathname;res.setHeader('Content-Type',url.endsWith('.js')?'text/javascript;charset=utf-8':url.endsWith('.css')?'text/css;charset=utf-8':'text/html;charset=utf-8');if(url==='/')return res.end(fixture);if(url==='/fixture.js')return res.end(setup);if(url==='/ready.js')return res.end('void initFixture();');if(url==='/styles.css')return res.end(fs.readFileSync('styles_v10_10_9.css'));if(url==='/organizer.js')return res.end(fs.readFileSync('modules/trainer-update-organizer-v10_10_41.js'));if(url==='/schedule.js')return res.end(fs.readFileSync('modules/report-schedule-consistency-v10_10_11.js'));res.writeHead(404);res.end();});
const executable = process.env.CHROME_BIN || (process.platform === 'win32'
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : ['google-chrome','chromium','chromium-browser'].map(name => spawnSync('which',[name],{encoding:'utf8'}).stdout?.trim()).find(Boolean));
assert(executable && fs.existsSync(executable), 'Chrome is required (set CHROME_BIN).');
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const profile = fs.mkdtempSync(path.join(os.tmpdir(),'tb-login-css-'));
const args = ['--headless=new','--no-first-run','--disable-gpu','--hide-scrollbars','--disable-popup-blocking','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'];
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
async function navigateFixture(reload=false){
  const previous=await evaluate('performance.timeOrigin');
  await command(reload?'Page.reload':'Page.navigate',reload?{}:{url:`http://127.0.0.1:${server.address().port}/`});
  for(let i=0;i<120;i++){try{if(await evaluate(`performance.timeOrigin!==${previous}&&!!window.fixtureReady`))return;}catch{}await sleep(50);}
  throw new Error('New fixture document did not become ready');
}
const screenshotIndex = process.argv.indexOf('--screenshots');
const screenshotDir = screenshotIndex < 0 ? null : path.resolve(process.argv[screenshotIndex+1]);
if (screenshotDir) fs.mkdirSync(screenshotDir,{recursive:true});

const results=[];
try{
  socket=new WebSocket(await waitForChromePage(chrome,profile,{stderr:()=>stderr}));await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=event=>{const m=JSON.parse(event.data),t=pending.get(m.id);if(!t)return;pending.delete(m.id);m.error?t.reject(new Error(JSON.stringify(m.error))):t.resolve(m.result);};
  await command('Page.enable');await command('Network.enable');await command('Network.setBlockedURLs',{urls:['https://*']});
  for(const theme of ['dark','light'])for(const width of [320,390,768,1440]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<800});await navigateFixture();
    await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)};document.getElementById('input-workout-name').value='Novo protocolo';const input=document.getElementById('input-workout-start-date');input.value='2026-11-09';input.dispatchEvent(new Event('change'));openModal('modal-workout');`);
    assert.deepEqual(await evaluate(`({date:document.getElementById('input-workout-update-date').value,readonly:document.getElementById('input-workout-update-date').readOnly})`),{date:'2027-01-04',readonly:true});
    await evaluate(`document.getElementById('input-workout-update-date').value='2026-12-07'`);
    await evaluate(`failWrites=true;document.querySelector('#modal-workout [onclick="saveWorkoutFromButton()"]').click()`);
    for(let i=0;i<80;i++){if(await evaluate('!ACTION_LOCKS.size'))break;await sleep(20);}
    assert(await evaluate(`!remote['workouts/new']&&remote['protocolReviewSchedules/s'].startDate==='2026-09-01'&&document.getElementById('modal-workout').classList.contains('open')`),'Failed transaction must keep editor and old cycle');
    await evaluate(`failWrites=false;failAcknowledgment=true;document.querySelector('#modal-workout [onclick="saveWorkoutFromButton()"]').click()`);
    for(let i=0;i<80;i++){if(await evaluate('!ACTION_LOCKS.size'))break;await sleep(20);}
    assert(await evaluate(`remote['workouts/new']&&document.getElementById('modal-workout').classList.contains('open')`));
    await evaluate(`remote['workouts/new'].days=[{name:'Concurrent day preserved'}]`);
    // The live button's inline handler invokes the actual saveWorkout controller.
    await evaluate(`document.querySelector('#modal-workout [onclick="saveWorkoutFromButton()"]').click()`);
    for(let i=0;i<80;i++){if(await evaluate('!ACTION_LOCKS.size'))break;await sleep(20);}
    assert.equal(await evaluate(`remote['workouts/new'].days[0].name`),'Concurrent day preserved','Retry after lost acknowledgment must preserve existing days');
    assert.deepEqual(await evaluate(`({start:document.getElementById('trainer-protocol-start-date').value,readonly:document.getElementById('trainer-protocol-start-date').readOnly,due:document.getElementById('trainer-protocol-review-next').textContent,date:remote['workouts/new']?.updateDate})`),{start:'2026-11-09',readonly:false,due:'Próxima revisão mensal: 2026-12-07.',date:'2027-01-04'});
    await evaluate(`(()=>{const input=document.getElementById('trainer-protocol-start-date');input.value='2026-11-10';input.dispatchEvent(new Event('change'));failWrites=true;document.getElementById('trainer-protocol-review-save').click();})()`);
    for(let i=0;i<80;i++){if(await evaluate('!ACTION_LOCKS.size'))break;await sleep(20);}
    assert.deepEqual(await evaluate(`({workout:remote['workouts/new'].startDate,schedule:remote['protocolReviewSchedules/s'].startDate,input:document.getElementById('trainer-protocol-start-date').value})`),{workout:'2026-11-09',schedule:'2026-11-09',input:'2026-11-10'});
    assert.match(await evaluate(`document.getElementById('trainer-protocol-workout-next').textContent`),/2027-01-05/);
    await evaluate(`failWrites=false;document.getElementById('trainer-protocol-review-save').click()`);
    for(let i=0;i<80;i++){if(await evaluate('!ACTION_LOCKS.size'))break;await sleep(20);}
    assert.deepEqual(await evaluate(`({workout:remote['workouts/new'].startDate,schedule:remote['protocolReviewSchedules/s'].startDate,date:remote['workouts/new'].updateDate,due:v109ProtocolState(V109_PROTOCOL_REVIEW_SCHEDULE).nextDueDate})`),{workout:'2026-11-10',schedule:'2026-11-10',date:'2027-01-05',due:'2026-12-08'});
    await evaluate(`(async()=>{document.getElementById('trainer-protocol-interval-weeks').value='6';await saveProtocolReviewSchedule();openProtocolReviewInfo();})()`);
    assert((await evaluate(`document.getElementById('protocol-review-info-body').textContent`)).includes('2026-11-10'));
    assert.equal(await evaluate(`v109ProtocolState(V109_PROTOCOL_REVIEW_SCHEDULE).nextDueDate`),'2026-12-22');
    assert.equal(await evaluate(`remote['workouts/new'].updateDate`),'2027-01-05');
    await evaluate(`closeModal('modal-protocol-review-info');CURRENT_USER={uid:'s',role:'student'};VIEW_STUDENT.workouts.find(w=>w.id==='new').exercises=[{name:'Personalizado',catalogGroupId:'g',catalogItemId:'i'}];VIEW_STUDENT.workouts.find(w=>w.id==='old').exercises=[{name:'Supino reto'}];showScreen('screen-exercise-options');renderExerciseOptions();document.getElementById('exercise-options-search').focus();`);
    assert.equal(await evaluate(`document.querySelectorAll('.exercise-option-prescribed').length`),1);assert.equal(await evaluate(`document.querySelector('.exercise-option-prescribed strong').textContent`),'Cadeira Extensora');assert(Number(await evaluate(`getComputedStyle(document.querySelector('.exercise-option-prescribed strong')).fontWeight`))>=700);
    await command('Input.insertText',{text:'EXTENSAO'});assert.equal(await evaluate(`document.querySelectorAll('#exercise-options-content .food-item-row').length`),2);assert.equal(await evaluate(`document.activeElement.id`),'exercise-options-search');
    assert((await evaluate(`document.getElementById('exercise-options-search').getBoundingClientRect().width`))>=180,`Search field too narrow ${theme} ${width}`);
    assert.equal(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),true,`Overflow ${theme} ${width}`);assert.equal(await evaluate(`document.querySelector('#exercise-options-content img')`),null,'Custom catalog text must not become markup');
    await evaluate(`document.getElementById('exercise-options-search').value='não existe';document.getElementById('exercise-options-search').dispatchEvent(new Event('input'));`);assert((await evaluate(`document.getElementById('exercise-options-content').textContent`)).includes('Nenhum exercício encontrado'));
    await evaluate(`document.getElementById('exercise-options-search-clear').click();`);assert.equal(await evaluate(`document.querySelectorAll('#exercise-options-content .food-item-row').length`),4);assert.equal(await evaluate(`document.activeElement.id`),'exercise-options-search');
    await evaluate(`CURRENT_USER={uid:'t',role:'trainer'};EXERCISE_OPTIONS_CONTEXT={trainerUid:'t',studentUid:'s'};document.getElementById('exercise-options-search').value='Peitoral';renderExerciseOptions()`);
    assert.equal(await evaluate(`document.querySelectorAll('#exercise-options-content .exercise-group-actions button[title$="para cima"]')[0].disabled`),false,'Filtering must preserve original group index for ordering');
    // Real reorder buttons, filtered item indices, failure preservation and retry.
    await evaluate(`remote['exerciseOptions/main']=structuredClone(EXERCISE_OPTIONS);document.getElementById('exercise-options-search').value='Sissy';renderExerciseOptions();document.querySelector('#exercise-options-content .exercise-option-move[title$="para cima"]').click();`);
    for(let i=0;i<80;i++){if(await evaluate('!ACTION_LOCKS.size'))break;await sleep(20);}
    assert.equal(await evaluate(`remote['exerciseOptions/main'].groups[0].items[0].id`),'s');assert.equal(await evaluate(`document.getElementById('exercise-options-search').value`),'Sissy');
    await evaluate(`clearExerciseOptionsSearch();failWrites=true;document.querySelectorAll('#exercise-options-content .food-item-row')[1].querySelector('.exercise-option-move[title$="para cima"]').click()`);
    for(let i=0;i<80;i++){if(await evaluate('!ACTION_LOCKS.size'))break;await sleep(20);}
    assert.equal(await evaluate(`EXERCISE_OPTIONS.groups[0].items[0].id`),'s');
    await evaluate(`failWrites=false;document.querySelectorAll('#exercise-options-content .food-item-row')[1].querySelector('.exercise-option-move[title$="para cima"]').click()`);
    for(let i=0;i<80;i++){if(await evaluate('!ACTION_LOCKS.size'))break;await sleep(20);}
    assert.equal(await evaluate(`EXERCISE_OPTIONS.groups[0].items[0].id`),'i');
    await evaluate(`remote['trainingTechniques/main']=structuredClone(TECHNIQUE_CATALOG);showScreen('screen-techniques');renderTechniques();document.querySelectorAll('.technique-card')[1].querySelector('button[title$="para cima"]').click()`);
    for(let i=0;i<80;i++){if(await evaluate('!ACTION_LOCKS.size'))break;await sleep(20);}
    assert.equal(await evaluate(`remote['trainingTechniques/main'].items[0].id`),'custom');
    assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`),'Technique ordering controls overflow');
    await evaluate(`CURRENT_USER={uid:'s',role:'student'};renderTechniques();`);assert.equal(await evaluate(`document.querySelectorAll('.technique-card-actions').length`),0);assert.equal(await evaluate(`moveTechnique('custom',1)`),false);
    await evaluate(`showScreen('screen-exercise-options');clearExerciseOptionsSearch();`);

    assert.deepEqual(await evaluate('errors'),[]);if(screenshotDir)fs.writeFileSync(path.join(screenshotDir,`${theme}-${width}.png`),Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
    // Actual organizer module, monthly checkbox and confirmation handler.
    await evaluate(`(async()=>{CURRENT_USER={uid:'t',role:'trainer'};remote['protocolReviewSchedules/s']={...remote['protocolReviewSchedules/s'],sourceWorkoutId:'new',startDate:'2026-09-01',intervalWeeks:4,lastCompletedCycle:0,lastCompletedDate:''};TeamBullsTrainerUpdateOrganizer.open();})()`);
    for(let i=0;i<80;i++){if(await evaluate(`!!document.querySelector('#tb-update-organizer-list [data-tb-complete-update]:not(:disabled)')`))break;await sleep(20);}
    await evaluate(`(()=>{document.querySelector('[data-tb-update-filter="monthly"]').click();{const b=document.querySelector('#tb-update-organizer-list [data-tb-complete-update]:not(:disabled)');if(!b)throw new Error(document.getElementById('tb-update-organizer-list').textContent+' '+JSON.stringify(messages));b.click();}remote['protocolReviewSchedules/s'].startDate='2026-11-09';document.getElementById('confirm-ok-btn').click();})()`);
    for(let i=0;i<80;i++){if(await evaluate('!ACTION_LOCKS.size'))break;await sleep(20);}
    assert.equal(await evaluate(`remote['protocolReviewSchedules/s'].lastCompletedDate`),'');assert((await evaluate('messages')).some(m=>m.includes('protocolo mudou')),'Stale organizer confirmation must be rejected');
    await evaluate(`(async()=>{remote['protocolReviewSchedules/s'].startDate='2026-09-01';remote['workouts/new'].startDate='2026-09-01';await TeamBullsTrainerUpdateOrganizer.refresh();{const b=document.querySelector('#tb-update-organizer-list [data-tb-complete-update]:not(:disabled)');if(!b)throw new Error(document.getElementById('tb-update-organizer-list').textContent+' '+JSON.stringify(messages));b.click();}document.getElementById('confirm-ok-btn').click();})()`);
    for(let i=0;i<80;i++){if(await evaluate('!ACTION_LOCKS.size'))break;await sleep(20);}
    assert.equal(await evaluate(`remote['protocolReviewSchedules/s'].lastCompletedDate`),'2026-11-09');assert.equal(await evaluate(`remote['workouts/new'].updateDate`),'2027-01-05');assert.deepEqual(await evaluate('errors'),[]);results.push({theme,width});

  }
  console.log(`PASS ${results.length} browser scenarios: real workout save, editable active start, fixed 56 days, adjustable monthly dates, transaction failure/retry, protected organizer confirmation and real catalog search/reorder clicks at 320/390/768/1440 px in both themes.`);
} finally {
  if(socket?.readyState===1){try{await command('Browser.close');}catch{}socket.close();}chrome.kill();server.close();
  if(path.dirname(profile)===os.tmpdir()&&path.basename(profile).startsWith('tb-login-css-'))for(let i=0;i<8;i++){try{fs.rmSync(profile,{recursive:true,force:true});break;}catch{await sleep(150);}}
}
