// Real roster/security/profile modules. Local service adapter only; no real Firebase.
import assert from 'node:assert/strict';import fs from 'node:fs';import http from 'node:http';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';import {waitForChromePage} from './chrome-readiness.mjs';import {fn} from './protocol-cycle-search-check.mjs';import {fixture as serviceFixture} from './student-administration-service-check.mjs';
const markup=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'');
const hubSource=fs.readFileSync('modules/trainer-inbox-payments-v10_10_12.js','utf8');
const badgeUpdate=hubSource.split('\n').find(line=>line.trimStart().startsWith('function updateBadges()'));
assert(badgeUpdate,'Expected real hub badge updater');
let backend,failAck=false,releaseResponse=null,holdNext=false,missingService=false;const calls=[];
function reset(){backend=serviceFixture();backend.seed('users/s3',{name:'Caio Cadastrado',email:'s3@example.invalid',role:'student',trainerId:'t',status:'active'});failAck=false;holdNext=false;missingService=false;calls.length=0;}
reset();
const setup=`
window.errors=[];window.messages=[];window.fakeOffline=false;Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>!fakeOffline});window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));window.alert=m=>messages.push(String(m));window.confirm=()=>true;
let CURRENT_USER={uid:'t',role:'trainer',name:'Treinador',email:'coach@example.invalid'},MODE='cloud',ACCESS_MODE='cloud-active',AUTH_STATE_REVISION=1,VIEW_STUDENT=null,TRAINER_LIST_LOAD_SEQ=0,TRAINING_RECOMMENDATIONS_CONTEXT=null;const ACTION_LOCKS=new Set();
const CFG={firebase:{projectId:'teamms-app'}},CLOUD_READ_TIMEOUT_MS=5000;const withTimeout=p=>p,ensureGlobalCatalogs=()=>{},showToast=m=>messages.push(m),studentArchiveCode=s=>s,cacheUserProfile=()=>{},updateOfflineCredentialProfile=()=>{},ensureStorageService=async()=>null,cloudWriteError=e=>e.message;
function makeUser(uid){return{uid,email:uid==='t'?'coach@example.invalid':uid+'@example.invalid',getIdToken:async()=>uid,reauthenticateWithCredential:async credential=>{if(credential.password!=='synthetic-password')throw new Error('Senha inválida');}};}
let auth={currentUser:makeUser('t')};function authProvider(){return auth;}authProvider.EmailAuthProvider={credential:(email,password)=>({email,password})};const firebase={auth:authProvider,appCheck:()=>({getToken:async()=>({token:'synthetic-app-check'})})};
const nativeFetch=fetch.bind(window);window.fetch=(url,options)=>String(url).startsWith('https://southamerica-east1-teamms-app.cloudfunctions.net/')?nativeFetch('/administration',options):nativeFetch(url,options);
function query(collection,filters=[]){return{where:(field,op,value)=>query(collection,[...filters,[field,op,value]]),limit(){return this;},get:async()=>{if(collection!=='users')return{docs:[]};if(!filters.some(f=>f[0]==='role'&&f[2]==='student')||!filters.some(f=>f[0]==='trainerId'&&f[2]===CURRENT_USER.uid))throw new Error('Unscoped student query');const rows=await(await nativeFetch('/students',{headers:{Authorization:'Bearer '+auth.currentUser.uid}})).json();return{docs:rows.map(row=>({id:row.uid,data:()=>row}))};},doc:id=>({get:async()=>({exists:false,data:()=>null})})};}
const db={collection:query};const cloudGet=r=>r.get();
let NAVIGATION_SEQ=0;
const activeScreenId=()=>document.querySelector('.screen.active')?.id;
const isNavigationCurrent=value=>value===NAVIGATION_SEQ;
const opened=[];
const trainer=()=>CURRENT_USER.role==='trainer',activityEvents=[{read:false},{read:true}],paymentAttentionCount=()=>2;
${badgeUpdate}
const openV107Operations=tab=>opened.push(tab),openReportGuideManager=()=>opened.push('photos'),
  openExerciseOptions=()=>opened.push('exercises'),openTechniques=()=>opened.push('techniques'),
  openFoodOptions=()=>opened.push('foods'),openFreeMealCatalog=()=>opened.push('calories'),openInstructions=()=>opened.push('instructions');
window.TeamBullsTrainerHub={openInbox:()=>opened.push('inbox'),openPayments:()=>opened.push('payments')};
window.TeamBullsTrainerUpdateOrganizerLoader={load:async()=>{window.TeamBullsTrainerUpdateOrganizer={open:()=>opened.push('agenda')};}};
window.TeamBullsTrainerRuntimeReliability={ensureArchives:async()=>{
  window.TeamBullsTrainerSentReports={open:()=>opened.push('sent')};
  window.TeamBullsTrainerFeedbackArchive={open:()=>opened.push('feedback')};
}};
function showScreen(id){NAVIGATION_SEQ++;document.querySelectorAll('.screen').forEach(e=>e.classList.remove('active'));document.querySelectorAll('.fab').forEach(e=>e.style.display='none');document.getElementById(id).classList.add('active');document.body.classList.toggle('trainer-desktop',CURRENT_USER.role==='trainer'&&innerWidth>=1100);}
function renderTrainer(){}function renderHome(){}function confirmLogout(){}function toggleStudent(){}async function renderTrainerStudent(s){document.getElementById('ts-title').textContent=s.name;const archive=document.getElementById('ts-archive-card');const name=document.createElement('div');name.className='archive-file-name';name.textContent=s.name;archive.replaceChildren(name);}
async function viewStudent(uid,name,email,status){VIEW_STUDENT={uid,name,email,status};await renderTrainerStudent(VIEW_STUDENT);showScreen('screen-trainer-student');}
${['normalizedName','beginAction','endAction','openModal','closeModal','showConfirm','exerciseOptionsSearchText','filterTrainerRoster','openTrainerCentralTool'].map(fn).join('\n')}
window.setActor=async uid=>{AUTH_STATE_REVISION++;auth.currentUser=makeUser(uid);const row=await(await nativeFetch('/profile?uid='+uid)).json();CURRENT_USER={...row,uid};};
window.initFixture=async()=>{showScreen('screen-trainer');await renderTrainer();window.fixtureReady=true;};
`;
const html=markup.replace('</head>','<link rel="stylesheet" href="/styles.css"></head>').replace('</body>','<script src="/fixture.js"></script><script src="/security.js"></script><script src="/admin.js"></script><script src="/profile.js"></script><script src="/ready.js"></script></body>');
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');res.setHeader('Content-Type','application/json;charset=utf-8');
 if(url.pathname==='/reset'){reset();return res.end('{}');}
 if(url.pathname==='/students'){const actor=String(req.headers.authorization||'').replace('Bearer ','');return res.end(JSON.stringify([...backend.docs].filter(([key,row])=>key.startsWith('users/')&&row.role==='student'&&row.trainerId===actor).map(([key,row])=>({...row,uid:key.split('/')[1]}))));}
 if(url.pathname==='/profile')return res.end(JSON.stringify(backend.docs.get('users/'+url.searchParams.get('uid'))||{}));
 if(url.pathname==='/summary')return res.end(JSON.stringify({student:backend.docs.get('users/s'),other:backend.docs.get('users/s2'),calls:calls.map(c=>c.action),hasHistory:backend.docs.has('sessions/s'),files:[...backend.files]}));
 if(url.pathname==='/control'){let text='';for await(const part of req)text+=part;const d=JSON.parse(text);backend.setWriteFail(!!d.failWrites);if(d.failAck)failAck=true;if(d.failDelete)backend.setFail('sessions/s');if(d.holdNext)holdNext=true;if('missingService' in d)missingService=d.missingService;return res.end('{}');}
 if(url.pathname==='/release'){releaseResponse?.();releaseResponse=null;return res.end('{}');}
 if(url.pathname==='/administration'){
  if(missingService){res.statusCode=404;return res.end('{}');}
  try{let text='';for await(const part of req)text+=part;const payload=JSON.parse(text).data,actor=String(req.headers.authorization||'').replace('Bearer ','');assert.equal(req.headers['x-firebase-appcheck'],'synthetic-app-check');calls.push(payload);const result=await backend.service({auth:{uid:actor,token:{auth_time:1794225600}},app:{appId:'synthetic'},data:payload});if(holdNext){holdNext=false;await new Promise(resolve=>releaseResponse=resolve);}if(failAck){failAck=false;throw new Error('Confirmação perdida');}return res.end(JSON.stringify({result}));}
  catch(error){res.statusCode=error.code==='permission-denied'?403:503;return res.end(JSON.stringify({error:{status:error.code||'UNAVAILABLE',message:error.message,details:error.details}}));}
 }
 const routes={'/styles.css':'styles_v10_10_9.css','/admin.js':'modules/trainer-student-administration-v10_10_71.js','/security.js':'modules/security-hardening-v10_10_9.js','/profile.js':'modules/student-home-profile-v10_10_12.js'};
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(html);}if(url.pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(setup);}if(url.pathname==='/ready.js'){res.setHeader('Content-Type','text/javascript');return res.end('void initFixture();');}const file=routes[url.pathname];if(file){res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/javascript');return res.end(fs.readFileSync(file));}res.statusCode=404;res.end();
});
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
async function control(data){await fetch(`http://127.0.0.1:${server.address().port}/control`,{method:'POST',body:JSON.stringify(data)});}
async function summary(){return(await fetch(`http://127.0.0.1:${server.address().port}/summary`)).json();}
async function settled(){for(let i=0;i<120;i++){if(await evaluate('!ACTION_LOCKS.size'))return;await sleep(20);}throw new Error('Action did not settle');}
async function click(selector){assert(await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});return !!el&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';})()`),'Missing or hidden control '+selector);await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await settled();}
try{
 socket=new WebSocket(await waitForChromePage(chrome,profile,{stderr:()=>stderr}));await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});socket.onmessage=event=>{const m=JSON.parse(event.data),t=pending.get(m.id);if(!t)return;pending.delete(m.id);m.error?t.reject(new Error(JSON.stringify(m.error))):t.resolve(m.result);};
 await command('Page.enable');await command('Network.enable');await command('Network.setBlockedURLs',{urls:['https://*']});
 for(const theme of ['dark','light'])for(const width of [320,390,768,1440]){
  await fetch(`http://127.0.0.1:${server.address().port}/reset`);await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<800});if(theme==='dark'&&width===320)await control({holdNext:true});await navigateFixture();if(theme==='dark'&&width===320){assert(!(await evaluate(`document.getElementById('tb-roster-toolbar').textContent`)).includes('indisponível'));assert.equal(await evaluate(`document.querySelectorAll('#student-list [data-student-uid]').length`),3);await click('[data-student-uid="s"] .btn-view-student');assert(await evaluate(`document.querySelector('#tb-student-profile-actions button[onclick*=".archive("]').disabled`),'Lifecycle controls must wait for canonical private metadata');await fetch(`http://127.0.0.1:${server.address().port}/release`);for(let i=0;i<120;i++){if(await evaluate(`!!document.querySelector('#tb-roster-toolbar [aria-pressed]')`))break;await sleep(20);}assert.equal(await evaluate(`document.querySelector('#tb-student-profile-actions button[onclick*=".archive("]').disabled`),false);await evaluate(`showScreen('screen-trainer')`);}await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('#student-list [data-student-uid]')].map(e=>e.dataset.studentUid)`),['s','s2','s3']);
  assert.equal(await evaluate(`document.querySelectorAll('#student-list [aria-label$="para cima"]').length`),0,'Reordering must remain out of the main view');
  assert.equal(await evaluate(`getComputedStyle(document.getElementById('tb-trainer-home-tabs')).display`),'grid','Home navigator must lay out before the hub module is loaded');
  if(theme==='light'){
    await sleep(250);
    const colors=await evaluate(`[...document.querySelectorAll('#tb-trainer-home-tabs button')].map(button=>getComputedStyle(button).color)`);
    assert(colors.every(color=>color.match(/[0-9]+/g).slice(0,3).every(channel=>Number(channel)<115)),`Light-theme tab colors at ${width}px: ${colors.join(', ')}`);
  }
  await evaluate(`document.getElementById('trainer-roster-status').value='inactive';filterTrainerRoster()`);
  assert.equal(await evaluate(`document.querySelectorAll('#student-list .student-card:not([hidden])').length`),0,'Status filter must hide active students when showing paused students');
  await evaluate(`document.getElementById('trainer-roster-status').value='';filterTrainerRoster()`);
  await evaluate(`document.getElementById('trainer-roster-search').value='cAIO';filterTrainerRoster()`);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('#student-list .student-card:not([hidden])')].map(e=>e.dataset.studentUid)`),['s3']);
  await evaluate(`document.getElementById('trainer-roster-search').value='sem resultado';filterTrainerRoster()`);
  assert.equal(await evaluate(`document.getElementById('trainer-roster-no-match').hidden`),false);
  await evaluate(`document.getElementById('trainer-roster-search').value='';filterTrainerRoster()`);
  assert(await evaluate(`!document.querySelector('.trainer-central-tools').open && document.documentElement.scrollWidth<=innerWidth+1`));
  await evaluate(`window.centralReportButton=document.querySelector('#tb-trainer-home-tabs button:nth-child(2)');updateBadges()`);
  assert(await evaluate(`document.querySelector('#tb-trainer-home-tabs button:nth-child(2)')===centralReportButton`),'Badge updates must keep the real navigation controls');
  assert.equal(await evaluate(`centralReportButton.querySelector('[data-tb-inbox-count]').textContent`),'1');
  assert.equal(await evaluate(`document.querySelector('#tb-trainer-home-tabs [data-tb-payment-count]').textContent`),'2');
  for(const tool of ['invites','inbox','payments'])await click(`#screen-trainer button[onclick*="'${tool}'"]`);
  if(screenshotDir)fs.writeFileSync(path.join(screenshotDir,`central-${theme}-${width}.png`),Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await click('.trainer-central-tools summary');
  for(const tool of ['agenda','sent','feedback','photos','exercises','techniques','foods','calories','instructions','operations'])
    await click(`.trainer-central-tools button[onclick*="'${tool}'"]`);
  assert.deepEqual(await evaluate('opened'),['invites','inbox','payments','agenda','sent','feedback','photos','exercises','techniques','foods','calories','instructions','overview']);
  await click('.trainer-central-tools summary');
  await click('#tb-roster-toolbar [aria-pressed="false"]');
  await control({failAck:true});await click('[data-student-uid="s3"] button[aria-label$="para cima"]');assert.deepEqual(await evaluate(`[...document.querySelectorAll('#student-list [data-student-uid]')].map(e=>e.dataset.studentUid)`),['s','s2','s3']);
  await click('[data-student-uid="s3"] button[aria-label$="para cima"]');assert.deepEqual(await evaluate(`[...document.querySelectorAll('#student-list [data-student-uid]')].map(e=>e.dataset.studentUid)`),['s','s3','s2']);
  await navigateFixture(true);await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);assert.deepEqual(await evaluate(`[...document.querySelectorAll('#student-list [data-student-uid]')].map(e=>e.dataset.studentUid)`),['s','s3','s2']);
  await click('#tb-roster-toolbar [aria-pressed="false"]');
  const beforePreferenceRead=(await summary()).calls.length;await control({holdNext:true});await evaluate(`window.latePreferences=TeamBullsStudentAdministration.loadPreferences(true);void 0`);
  for(let i=0;i<120;i++){if((await summary()).calls.length>beforePreferenceRead)break;await sleep(20);}
  const beforeMove=(await summary()).calls.length;await evaluate(`document.querySelector('[data-student-uid="s3"] button[aria-label$="para cima"]').click();void 0`);
  for(let i=0;i<120;i++){if((await summary()).calls.length>beforeMove)break;await sleep(20);}
  await fetch(`http://127.0.0.1:${server.address().port}/release`);await evaluate('latePreferences');await settled();assert.deepEqual(await evaluate(`[...document.querySelectorAll('#student-list [data-student-uid]')].map(e=>e.dataset.studentUid)`),['s3','s','s2'],'A delayed preference read must not revert a confirmed move');
  await click('[data-student-uid="s3"] button[aria-label$="para baixo"]');

  await evaluate(`(async()=>{await setActor('s');showScreen('screen-home');fakeOffline=true;TeamBullsStudentHome.changeNickname();document.getElementById('tb-profile-editor-name').value='Offline Ani';document.getElementById('tb-profile-editor-form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));})()`);
  for(let i=0;i<120;i++){if(await evaluate(`!document.getElementById('tb-profile-editor-save').disabled`))break;await sleep(20);}
  assert.equal((await summary()).student.name,'Ana Cadastrada');assert.equal((await summary()).student.nickname,undefined);assert.equal(await evaluate(`localStorage.getItem('team_bulls_pending_student_name_s')`),'Offline Ani');
  await control({holdNext:true});await evaluate(`fakeOffline=false;window.dispatchEvent(new Event('online'))`);
  for(let i=0;i<120;i++){if((await summary()).student?.nickname==='Offline Ani')break;await sleep(20);}
  assert.equal((await summary()).student.nickname,'Offline Ani');assert.equal((await summary()).student.name,'Ana Cadastrada');
  await evaluate(`(async()=>{TeamBullsStudentHome.changeNickname();document.getElementById('tb-profile-editor-name').value='Ani';document.getElementById('tb-profile-editor-form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));})()`);
  assert.equal(await evaluate(`localStorage.getItem('team_bulls_pending_student_name_s')`),'Ani','Newer edit must replace only the pending alias');await fetch(`http://127.0.0.1:${server.address().port}/release`);
  for(let i=0;i<120;i++){if((await summary()).student?.nickname==='Ani'&&await evaluate(`!document.getElementById('tb-profile-editor-save').disabled`))break;await sleep(20);}
  const saved=await summary();assert.equal(saved.student.name,'Ana Cadastrada');assert.equal(saved.student.registeredName,'Ana Cadastrada');assert.equal(saved.student.nickname,'Ani');assert.equal(await evaluate(`document.getElementById('tb-profile-name').textContent`),'Ani');
  await evaluate(`(async()=>{await setActor('t');showScreen('screen-trainer');await renderTrainer();})()`);assert.equal(await evaluate(`document.querySelector('[data-student-uid="s"] .student-name').textContent`),'Ana Cadastrada');assert.equal(await evaluate(`document.querySelector('[data-student-uid="s"] .tb-student-nickname').textContent`),'Ani');assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),`Roster overflow ${theme}/${width}`);
  await click('[data-student-uid="s"] .btn-view-student');await click('#tb-student-profile-actions button[onclick*="registeredName"]');
  await evaluate(`document.getElementById('tb-student-admin-name').value='Ana Nome Completo';document.getElementById('tb-student-admin-form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));`);await settled();assert.equal((await summary()).student.registeredName,'Ana Nome Completo');assert.equal((await summary()).student.nickname,'Ani');assert((await evaluate(`document.getElementById('ts-title').textContent`)).includes('Ana Nome Completo'));assert.equal(await evaluate(`document.querySelector('#ts-archive-card .tb-student-nickname').textContent`),'Ani');
  assert.equal(await evaluate(`getComputedStyle(document.getElementById('modal-student-administration')).display`),'none','Saved editor must leave no visible sheet or overlay');
  await evaluate(`showScreen('screen-trainer')`);
  await click('#tb-roster-toolbar [aria-pressed="false"]');
  await control({failWrites:true});await click('[data-student-uid="s"] button.tb-roster-danger');await click('#confirm-ok-btn');assert(await evaluate(`!!document.querySelector('[data-student-uid="s"]')`));assert.equal((await summary()).student.status,'active');assert(await evaluate(`document.getElementById('modal-confirm').classList.contains('open')`));
  await control({failWrites:false});const beforeArchiveRead=(await summary()).calls.length;await control({holdNext:true});await evaluate(`window.lateArchivePreferences=TeamBullsStudentAdministration.loadPreferences(true);void 0`);
  for(let i=0;i<120;i++){if((await summary()).calls.length>beforeArchiveRead)break;await sleep(20);}
  const beforeArchive=(await summary()).calls.length;await evaluate(`document.getElementById('confirm-ok-btn').click();void 0`);
  for(let i=0;i<120;i++){if((await summary()).calls.length>beforeArchive)break;await sleep(20);}
  await fetch(`http://127.0.0.1:${server.address().port}/release`);await evaluate('lateArchivePreferences');await settled();assert.equal(await evaluate(`!!document.querySelector('#student-list [data-student-uid="s"]')`),false,'A delayed preference read must not put an archived pupil back on the main list');assert.equal((await summary()).hasHistory,true);
  await evaluate(`TeamBullsStudentAdministration.showArchived(true)`);assert(await evaluate(`!!document.querySelector('#student-list [data-student-uid="s"]')`));await click('[data-student-uid="s"] .btn-view-student');assert((await evaluate(`document.getElementById('ts-title').textContent`)).includes('Ana Nome Completo'));assert.equal(await evaluate(`document.querySelector('#ts-archive-card .tb-student-nickname').textContent`),'Ani');
  await evaluate(`showScreen('screen-trainer')`);await click('[data-student-uid="s"] button[onclick*=".restore("]');await control({failAck:true});await click('#confirm-ok-btn');assert.equal((await summary()).student.status,'active');assert(await evaluate(`document.getElementById('modal-confirm').classList.contains('open')`));await click('#confirm-ok-btn');assert.equal((await summary()).student.status,'active');assert.equal((await summary()).hasHistory,true);
  await evaluate(`TeamBullsStudentAdministration.showArchived(false)`);await click('#tb-roster-toolbar [aria-pressed="false"]');await click('[data-student-uid="s"] button.tb-roster-danger');await click('#confirm-ok-btn');await evaluate(`TeamBullsStudentAdministration.showArchived(true)`);
  await evaluate(`document.getElementById('tb-roster-toolbar').scrollIntoView({block:'start'})`);
  assert.equal(await evaluate(`getComputedStyle(document.getElementById('modal-student-administration')).display`),'none');
  assert(await evaluate(`document.getElementById('tb-roster-toolbar').getBoundingClientRect().width>=document.getElementById('student-list').getBoundingClientRect().width-1`),'Roster controls must span the desktop grid');
  assert(await evaluate(`document.getElementById('trainer-link-tools').contains(document.getElementById('tb-student-link-health'))`),'Link diagnostics belong in tools');
  await sleep(350);if(screenshotDir)fs.writeFileSync(path.join(screenshotDir,`${theme}-${width}.png`),Buffer.from((await command('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await click('[data-student-uid="s"] button[onclick*="openEditor"]');await evaluate(`document.getElementById('tb-student-admin-email').value='wrong@example.invalid';document.getElementById('tb-student-admin-confirm').value='EXCLUIR';document.getElementById('tb-student-admin-password').value='synthetic-password';document.getElementById('tb-student-admin-form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));`);await settled();assert(!(await summary()).calls.includes('delete'));
  await control({failDelete:true});await evaluate(`document.getElementById('tb-student-admin-email').value='s@example.invalid';document.getElementById('tb-student-admin-password').value='synthetic-password';document.getElementById('tb-student-admin-form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));`);await settled();assert.equal(await evaluate(`document.getElementById('tb-student-admin-password').value`),'');assert.equal((await summary()).student.status,'inactive');assert((await summary()).student.trainerId.startsWith('!deleting:'));
  await evaluate(`(async()=>{TeamBullsStudentAdministration.closeEditor();await TeamBullsStudentAdministration.refresh();})()`);await click('.tb-roster-pending button');await evaluate(`document.getElementById('tb-student-admin-email').value='s@example.invalid';document.getElementById('tb-student-admin-confirm').value='EXCLUIR';document.getElementById('tb-student-admin-password').value='synthetic-password';document.getElementById('tb-student-admin-form').dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));`);await settled();assert.equal((await summary()).student,undefined);assert.equal((await summary()).other.name,'Bruno Cadastrado');assert((await summary()).files.every(name=>!name.includes('/s/')));assert.equal(await evaluate(`document.getElementById('modal-student-administration').classList.contains('open')`),false);
  await evaluate(`TeamBullsStudentAdministration.showArchived(false)`);await click('#tb-roster-toolbar [aria-pressed="false"]');const beforeHold=(await summary()).calls.length;await control({holdNext:true});await evaluate(`document.querySelector('[data-student-uid="s2"] button[aria-label$="para cima"]').click()`);
  for(let i=0;i<120;i++){if((await summary()).calls.length>beforeHold)break;await sleep(20);}
  await evaluate(`(async()=>{await setActor('other');showScreen('screen-trainer');await renderTrainer();})()`);await fetch(`http://127.0.0.1:${server.address().port}/release`);await settled();assert.deepEqual(await evaluate(`[...document.querySelectorAll('#student-list [data-student-uid]')].map(e=>e.dataset.studentUid)`),['foreign'],'Late response must not replace another trainer roster');
  await control({missingService:true});
  await evaluate(`TeamBullsStudentAdministration.refresh()`);
  assert(await evaluate(`!!document.querySelector('[data-student-uid="foreign"] .btn-view-student')`));
  assert.equal(await evaluate(`document.querySelector('#tb-roster-toolbar [aria-pressed]')`),null);
  await click('#tb-roster-toolbar button[onclick*="true"]');
  assert.match(await evaluate(`document.getElementById('tb-roster-toolbar').textContent`),/precisa ser publicado/);
  assert.equal(await evaluate(`document.querySelector('#tb-roster-toolbar button[onclick*="refresh"]')`),null);
  assert.deepEqual(await evaluate('errors'),[]);results.push({theme,width});
 }
 console.log(`PASS ${results.length} real-module browser scenarios: offline nickname sync preserves registry, trainer registry and separate nickname/manual correction, late owner responses and stale same-owner preferences refused, cloud reorder/reload/lost-ack deduplication, archive failure/retry, history/restore, exact permanent-delete confirmation, password clearing, interrupted-job resume and other-student preservation in both themes.`);
} finally {
  if(socket?.readyState===1){try{await command('Browser.close');}catch{}socket.close();}chrome.kill();server.close();
  if(path.dirname(profile)===os.tmpdir()&&path.basename(profile).startsWith('tb-login-css-'))for(let i=0;i<8;i++){try{fs.rmSync(profile,{recursive:true,force:true});break;}catch{await sleep(150);}}
}
