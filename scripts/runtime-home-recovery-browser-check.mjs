// Whole Home module in the real browser; only data access is synthetic.
import assert from 'node:assert/strict';import fs from 'node:fs';import http from 'node:http';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';import {waitForChromePage} from './chrome-readiness.mjs';
const at=process.argv.indexOf('--baseline'),baseline=at<0?null:process.argv[at+1];assert(at<0||/^[a-f0-9]{7,40}$/.test(baseline||''));
const read=file=>baseline?spawnSync('git',['show',`${baseline}:${file}`],{encoding:'utf8'}).stdout:fs.readFileSync(file,'utf8');
const markup=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'');
const setup=`let CURRENT_USER={uid:'s',role:'student'},MODE='cloud',ACCESS_MODE='cloud-active',AUTH_STATE_REVISION=1,NAVIGATION_SEQ=1,MEAL_CTX={canEditContent:false},MEAL_PLAN_CACHE={meals:[]},EDIT_MEAL_ID='',DIET_DOCUMENT={plans:[]},DIET_CONTEXT={};window.opens=0;window.messages=[];window.alert=m=>messages.push(String(m));window.reads=0;window.mutations=0;window.errors=[];window.failReads=true;window.slowReads=false;window.pendingReads=[];window.holdFrames=false;window.frameTasks=[];window.originalRAF=requestAnimationFrame.bind(window);window.requestAnimationFrame=fn=>{if(holdFrames){frameTasks.push(fn);return 1000000+frameTasks.length;}return originalRAF(fn);};
window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
document.querySelectorAll('.screen').forEach(n=>n.classList.toggle('active',n.id==='screen-home'));
document.getElementById('home-stats').innerHTML='<div class="stat-cell">Treinos</div><div class="stat-cell">Dietas</div>';
new MutationObserver(r=>window.mutations+=r.length).observe(document.getElementById('screen-home'),{attributes:true,subtree:true,childList:true,characterData:true});
const query={where(){return this},orderBy(){return this},limit(){return this},async get(){window.reads++;if(slowReads)await new Promise(r=>pendingReads.push(r));if(failReads)throw Object.assign(new Error('simulated unavailable'),{code:'unavailable'});return{docs:[]};}};const db={collection:name=>name==='mealPlans'?{doc:uid=>({set:payload=>{mealWrites.push({uid,items:payload.plans[0].variants[0].meals[0].items});return holdMeal?new Promise((resolve,reject)=>{window.rejectMeal=reject;}):Promise.resolve();}})}:query};const firebase={firestore:{FieldValue:{serverTimestamp:()=>42}}};const cloudWrite=task=>task;function normalizeDietDocument(source){return JSON.parse(JSON.stringify(source));}
function goHome(){}function openMeals(){}function showToast(){}function loadProtocolReviewSchedule(){return Promise.resolve({});}function v109ProtocolState(){return{nextDueDate:'2026-12-07',pending:false};}function activeWorkoutUpdateDate(){return'2027-01-04';}function today(){return'2026-11-09';}
let activePlan=null,activeVariant=null;window.holdMeal=false;window.mealWrites=[];const actionLocks=new Set();
function beginAction(key){if(actionLocks.has(key))return false;actionLocks.add(key);return true;}function endAction(key){actionLocks.delete(key);}
function currentDiet(){return DIET_DOCUMENT.plans[0];}function currentDietVariant(){return DIET_DOCUMENT.plans[0]?.variants[0];}function renderMealsList(){}
function closeModal(id){document.getElementById(id).classList.remove('open');}
function openEditMealModal(id){EDIT_MEAL_ID=id;const meal=MEAL_PLAN_CACHE.meals.find(m=>m.id===id);for(const [key,value]of Object.entries({time:meal.time||'',items:meal.items,notes:meal.notes||''}))document.getElementById('input-meal-'+key).value=value;document.getElementById('modal-meal').classList.add('open');}
function openAddMealModal(){EDIT_MEAL_ID='';}
function persistMealPlan(){activePlan.meals=MEAL_PLAN_CACHE.meals;activeVariant.meals=MEAL_PLAN_CACHE.meals;mealWrites.push({uid:MEAL_CTX.targetUid,items:MEAL_PLAN_CACHE.meals[0].items});return holdMeal?new Promise((resolve,reject)=>{window.rejectMeal=reject;}):Promise.resolve();}
window.selectPupil=uid=>{CURRENT_USER={uid:'coach',role:'trainer'};MEAL_CTX={targetUid:uid,canEditContent:true};MEAL_PLAN_CACHE.meals=[{id:uid+'-meal',items:uid+' original'}];activeVariant={id:uid+'-variant',meals:MEAL_PLAN_CACHE.meals};activePlan={id:uid+'-plan',variants:[activeVariant],meals:MEAL_PLAN_CACHE.meals};DIET_DOCUMENT={plans:[activePlan]};DIET_CONTEXT={targetUid:uid,trainer:true};if(uid==='a')window.planA=activePlan;openEditMealModal(uid+'-meal');};

`;
const fixture=markup.replace('</head>','<link rel="stylesheet" href="/styles.css"></head>').replace('</body>','<script src="/fixture.js"></script><script src="/home.js"></script><script src="/buttons.js"></script><script src="/diet-store.js"></script><script src="/workspace.js"></script></body>');
const server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname;if(name==='/styles.css'){res.setHeader('Content-Type','text/css');return res.end(fs.readFileSync('styles_v10_10_9.css'));}const routes={'/home.js':'modules/student-home-layout-v10_10_15.js','/buttons.js':'modules/button-action-integrity-v10_10_38.js','/workspace.js':'modules/trainer-diet-workspace-v10_10_11.js'};res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript;charset=utf-8':'text/html;charset=utf-8');if(name==='/diet-store.js'){const core=read('app_v10_10_9_core.js'),from=core.indexOf('async function persistNormalizedDietDocument(');return res.end(from<0?'':core.slice(from,core.indexOf('\nfunction dietStatusBadge',from)));}if(name==='/fixture.js')return res.end(setup);if(routes[name])return res.end(read(routes[name]));if(name==='/')return res.end(fixture);res.statusCode=404;res.end();});
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
 await command('Page.enable');await command('Network.enable');await command('Network.setBlockedURLs',{urls:['https://*']});const results=[];
 for(const theme of ['dark','light'])for(const width of [320,360,390,430,768,1440]){
 await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<800});const previous=await evaluate('performance.timeOrigin');await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/?theme=${theme}&width=${width}`});
 for(let i=0;i<120;i++){if(await evaluate(`performance.timeOrigin!==${previous}&&document.readyState==='complete'&&!!window.TeamBullsStudentHomeLayout&&!!window.TeamBullsTrainerDietWorkspace&&!!window.TeamBullsButtonActions`))break;await sleep(25);}await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
 await sleep(350);const before=await evaluate('({reads,mutations})');await sleep(650);const after=await evaluate('({reads,mutations})');results.push({theme,width,idleMutations:after.mutations-before.mutations,idleReads:after.reads-before.reads});
 assert.deepEqual(await evaluate(`[...document.querySelectorAll('#home-stats .tb-v17-next')].map(slot=>[slot.dataset.kind,slot.querySelector('strong').textContent])`),[['training','04/01/2027'],['monthly','07/12/2026']],'Home must show the fixed workout deadline separately from the monthly review');
 assert.equal(after.mutations-before.mutations,0,'Home must not trigger its own observer every frame');assert.equal(after.reads-before.reads,0,'Failed Home reads must not form a request storm');
 await evaluate('failReads=false;slowReads=true;window.refreshes=Array.from({length:10},()=>TeamBullsStudentHomeLayout.refresh());void 0');await sleep(100);assert.equal(await evaluate('pendingReads.length'),2,'Concurrent explicit refreshes must share the two real queries');await evaluate('slowReads=false;pendingReads.splice(0).forEach(r=>r());Promise.all(refreshes)');
 assert.deepEqual(await evaluate('errors'),[]);assert.equal(await evaluate('document.querySelectorAll(".tb-v17-hotbar").length'),1);
 if(theme==='dark'&&width===320){
  await evaluate('slowReads=true;window.hungRefresh=TeamBullsStudentHomeLayout.refresh();void 0');await sleep(8200);await evaluate('hungRefresh');await evaluate('slowReads=false;TeamBullsStudentHomeLayout.refresh()');await evaluate('pendingReads.splice(0).forEach(r=>r());void 0');assert.equal(await evaluate('pendingReads.length'),0);
 }


 await evaluate(`document.querySelector('.tb-v17-hotbar [data-hotbar="workout"]').click();void 0`);await sleep(10);await evaluate(`CURRENT_USER={uid:'other',role:'student'};AUTH_STATE_REVISION++;NAVIGATION_SEQ++;window.TeamBullsStudentWorkoutLibrary={open:()=>{opens++;}};`);await sleep(120);assert.equal(await evaluate('opens'),0,'A delayed real click must not navigate after a session change');
 assert.equal(await evaluate(`TeamBullsButtonActions.workout()`),true);assert.equal(await evaluate('opens'),1);await evaluate(`TeamBullsStudentWorkoutLibrary.open=async()=>false`);assert.equal(await evaluate(`TeamBullsButtonActions.workout()`),false,'Action must propagate a failed asynchronous result');
 await evaluate(`holdMeal=true;selectPupil('a')`);await sleep(80);await evaluate(`document.getElementById('input-meal-items').value='A draft';document.querySelector('.tb-workspace-save').click();void 0`);assert.equal(await evaluate('mealWrites.length'),1);
 await evaluate(`holdFrames=true;closeModal('modal-meal');selectPupil('b')`);await sleep(80);await evaluate(`document.getElementById('input-meal-items').value='B draft';holdFrames=false;frameTasks.splice(0).forEach(fn=>originalRAF(fn));void 0`);await evaluate(`new Promise(resolve=>originalRAF(()=>originalRAF(resolve)))`);await evaluate(`rejectMeal(new Error('simulated unavailable'));void 0`);await sleep(80);
 assert.equal(await evaluate('MEAL_PLAN_CACHE.meals[0].id'),'b-meal');assert.equal(await evaluate('EDIT_MEAL_ID'),'b-meal');assert.equal(await evaluate(`document.getElementById('input-meal-items').value`),'B draft');assert.equal(await evaluate('planA.meals[0].items'),'a original','A failed write must restore only the original plan');assert.equal(await evaluate('messages.length'),0,'Old failure must not interrupt pupil B');
 await evaluate(`holdMeal=false;document.querySelector('.tb-workspace-save').click();void 0`);await sleep(80);assert.deepEqual(await evaluate('mealWrites.at(-1)'),{uid:'b',items:'B draft'});assert.deepEqual(await evaluate('errors'),[]);
 }
 console.log(JSON.stringify({baseline,results}));
 console.log(`PASS ${results.length} real browser combinations: zero idle Home mutations/reads, coalesced and bounded reads, recovery, delayed click cancellation, async action result, meal A/B isolation and pupil B save at 320–1440 px in both themes.`);

} finally {
  if(socket?.readyState===1){try{await command('Browser.close');}catch{}socket.close();}
  chrome.kill();
  server.close();
  // Only the randomly created isolated Chrome profile is disposable.
  if(path.dirname(profile)===os.tmpdir()&&path.basename(profile).startsWith('tb-login-css-')){
    for(let i=0;i<8;i++){try{fs.rmSync(profile,{recursive:true,force:true});break;}catch{await sleep(150);}}
  }
}
