// Actual session markup, confirmation handlers and the three active mutation
// modules. Only synthetic local records/IndexedDB are used; HTTPS is blocked.
import assert from 'node:assert/strict';import fs from 'node:fs';import http from 'node:http';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';import {waitForChromePage} from './chrome-readiness.mjs';
const core=fs.readFileSync('app_v10_10_9_core.js','utf8');
function fn(name){const start=core.indexOf(`function ${name}(`);assert(start>=0,name);const line=core.slice(start).split('\n')[0].trimEnd(),prefix=core.slice(start-6,start)==='async '?'async ':'';return prefix+(line.endsWith('}')?line:core.slice(start,core.indexOf('\n}',start)+2));}
const names=['filterDeletedSessions','mergeHistorySessions','sessionsFromWorkoutTree','loadSessionArchive','saveSessionArchive','removeSessionFromArchive','pendingSessionHistory','getSharedSessions','findSessionOwner','removeSessionFromHistory','syncSessionToHistory','performDeleteSession','deleteSession','deleteEditedSession','buildSessionsV102','removeEditSet','showConfirm','beginAction','endAction','openModal','closeModal'];
const markup=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'');
const setup=`
window.errors=[];window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));window.messages=[];window.alert=m=>messages.push(String(m));
let CURRENT_USER={uid:'student-a',role:'student'},MODE='cloud',LOCAL_OWNER_UID='student-a',INACTIVE_UID='',LOCAL_DB={},NAVIGATION_SEQ=1,CUR_WORKOUT='w',CUR_EX='e',EDIT_SESSION_ID='',EDIT_SESSION_WID='',EDIT_SESSION_EID='',EDIT_SET_COUNT=0,SESSION_WID='w',SESSION_EID='e',SESSION_CREATE_ID='',LAST_SESSION_WEEK=1,VARIANT_LOAD_SEQ=0,TRAINING_RECOMMENDATIONS_CONTEXT=null;
const ACTION_LOCKS=new Set(),SESSION_ARCHIVE_MEMORY=new Map();let HISTORY_BY_NAME={};window.simOnline=false;window.failStorage=false;window.failLocalOnly=false;Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>simOnline});
const session=id=>({id,userId:'student-a',workoutId:'w',exerciseId:'e',exerciseName:'Supino',date:'2026-11-06',week:1,sets:[{weight:80,reps:8}],createdAt:{ms:123}});
const seeds=['trash','last','keep'].map(session);let tree=[{id:'w',name:'Treino',userId:'student-a',exercises:[{id:'e',name:'Supino',sessions:structuredClone(seeds)}]}];
window.remote=JSON.parse(localStorage.getItem('fixture-remote')||JSON.stringify(Object.fromEntries(seeds.map(s=>[s.id,s]))));window.operations=[];
function storageGet(k){return localStorage.getItem(k);}function storageSet(k,v){if(failStorage||failLocalOnly)return false;localStorage.setItem(k,v);return true;}
const sessionArchiveKey=u=>'fixture-archive:'+u,legacySessionArchiveKey=u=>'fixture-legacy:'+u,indexedSessionArchiveKey=u=>'fixture-indexed:'+u;
localStorage.setItem(legacySessionArchiveKey('student-a'),JSON.stringify(seeds));
const getWorkouts=()=>tree,getE=(w,e)=>tree.find(x=>x.id===w)?.exercises.find(x=>x.id===e),getW=w=>tree.find(x=>x.id===w),normalizedName=s=>String(s||'').toLowerCase(),createdMillis=()=>0,sanitizeHistorySession=v=>v,sessionIdentity=v=>v.id;
const runWhenIdle=fn=>setTimeout(fn,0),mediaPut=async()=>{},saveCloudBackup=()=>{},withTimeout=p=>p,cloudWrite=p=>p,firestoreWriteMessage=e=>e.message,showToast=m=>messages.push(String(m)),fmt=s=>s;
const firebase={firestore:{Timestamp:{fromMillis:ms=>({ms})},FieldPath:{documentId:()=> '__name__'}}};
function ref(id){return{delete:async()=>{operations.push(['delete',id]);if(!simOnline)throw Object.assign(new Error('offline'),{code:'unavailable'});if(!remote[id]||remote[id].userId!==CURRENT_USER.uid)throw Object.assign(new Error('denied'),{code:'permission-denied'});delete remote[id];localStorage.setItem('fixture-remote',JSON.stringify(remote));},set:async data=>{operations.push(['set',id]);remote[id]=data;localStorage.setItem('fixture-remote',JSON.stringify(remote));}};}
const db={collection:name=>{if(name!=='sessions')throw new Error('Unexpected collection');const filters=[];return{doc:ref,where(field,_op,value){filters.push([field,value]);return this;},limit(){return this;},get:async()=>{const id=filters.find(f=>f[0]==='__name__')?.[1],uid=filters.find(f=>f[0]==='userId')?.[1];if(uid!==CURRENT_USER.uid)throw new Error('Wrong owner');return{docs:remote[id]?.userId===uid?[{id,data:()=>remote[id]}]:[]};}};}};
let mediaDb;function openMediaDb(){if(failStorage)return Promise.resolve(null);if(mediaDb)return Promise.resolve(mediaDb);return new Promise((resolve,reject)=>{const r=indexedDB.open('session-delete-fixture',1);r.onupgradeneeded=()=>r.result.createObjectStore('media');r.onsuccess=()=>{mediaDb=r.result;resolve(mediaDb);};r.onerror=()=>reject(r.error);});}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}const jsArg=s=>esc(JSON.stringify(s));
const exerciseUsesResistedTime=()=>false,normalizePrescriptionSet=()=>null,sessionSyncBadge=()=>'',selectedVariantData=()=>({}),selectedPerformedTechniqueMode=()=>'',selectedEditPerformedTechniqueMode=()=>'',draftId=()=> 'pending-'+Date.now(),resetRestTimer=()=>{};
function saveSession(){}function saveEditSession(){}function openLogSessionModal(){}
function openEditSession(id){EDIT_SESSION_ID=id;EDIT_SESSION_WID='w';EDIT_SESSION_EID='e';document.getElementById('edit-sets-editor').innerHTML='<div class="performed-set-row"><span class="set-edit-num">1</span><input data-f="w" value="80"><input data-f="r" value="8"><button class="btn-rm-set" onclick="removeEditSet(this)">×</button></div>';openModal('modal-edit-session');}
function renderExercise(){buildSessionsV102(getE('w','e'),'sessions-list',false,'w',tree);}
window.clickSessionAction=(action,id)=>{const button=[...document.querySelectorAll('#sessions-list button')].find(b=>b.getAttribute('onclick')?.startsWith(action+'(')&&b.getAttribute('onclick').includes(JSON.stringify(id)));if(!button)throw new Error('Missing session action '+action+' '+id);button.click();};
const TeamBullsWeekSelectionFix={};window.TeamBulls107={flushPendingMutationSync:async()=>{}};
${names.map(fn).join('\n')}
window.initializeFixture=async()=>{await TeamBullsSessionPerformance.ready();tree[0].exercises[0].sessions=filterDeletedSessions(loadSessionArchive('student-a'),'student-a');HISTORY_BY_NAME={supino:tree[0].exercises[0].sessions};document.querySelectorAll('.screen').forEach(e=>e.classList.remove('active'));document.getElementById('screen-exercise').classList.add('active');renderExercise();window.fixtureReady=true;};
`;
const fixture=markup.replace('</head>','<link rel="stylesheet" href="/styles.css"></head>').replace('</body>','<script src="/fixture.js"></script><script src="/perf.js"></script><script src="/mutations.js"></script><script src="/destructive.js"></script><script src="/ready.js"></script></body>');
const routes=new Map([['/styles.css','styles_v10_10_9.css'],['/perf.js','modules/session-save-performance-v10_10_9.js'],['/mutations.js','modules/pending-session-mutations-v10_10_34.js'],['/destructive.js','modules/destructive-actions-supply-fix-v10_10_29.js']]);
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost').pathname;if(url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(fixture);}if(url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(setup);}if(url==='/ready.js'){res.setHeader('Content-Type','text/javascript');return res.end('void initializeFixture();');}const file=routes.get(url);if(!file){res.writeHead(404);return res.end();}res.setHeader('Content-Type',url.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));});

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
const results = [],exceptions=[];
try {
  socket = new WebSocket(await waitForChromePage(chrome, profile, {stderr: () => stderr}));
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage = event => {
    const message=JSON.parse(event.data);if(message.method==='Runtime.exceptionThrown')exceptions.push(message.params.exceptionDetails); const task=pending.get(message.id); if(!task)return;
    pending.delete(message.id);
    message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result);
  };
  await command('Runtime.enable');await command('Page.enable');
  await command('Network.enable');
  await command('Network.setBlockedURLs',{urls:['https://*']});
  for(const [width,height] of [[390,844],[1440,1000]]){
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<800});
    await navigateFixture();
    await evaluate("(async()=>{localStorage.clear();sessionStorage.clear();const database=await openMediaDb();await new Promise((resolve,reject)=>{const tx=database.transaction('media','readwrite');tx.objectStore('media').clear();tx.oncomplete=resolve;tx.onerror=reject;});})()");await navigateFixture(true);
    assert.deepEqual(await evaluate('errors'),[]);const initial=await evaluate('document.querySelectorAll("#sessions-list .session-block").length');if(initial!==3)console.log({width,debug:await evaluate('({tree,keys:Object.keys(localStorage),journal:localStorage.getItem("team_bulls_session_deletions_v1_student-a"),legacy:loadSessionArchive("student-a"),messages})')});assert.equal(initial,3);
    // Real trash button and cancel: no intent or data change.
    await evaluate(`clickSessionAction('deleteSession','trash');document.querySelector('#modal-confirm button[onclick*=\"closeModal\"]').click()`);
    assert.equal(await evaluate('TeamBullsSessionPerformance.pendingDeletes()'),0);assert.equal(await evaluate('tree[0].exercises[0].sessions.length'),3);
    await evaluate(`clickSessionAction('deleteSession','trash');document.getElementById('confirm-ok-btn').click()`);await sleep(60);
    assert.equal(await evaluate('tree[0].exercises[0].sessions.some(s=>s.id==="trash")'),false);assert.equal(await evaluate('TeamBullsSessionPerformance.pendingDeletes()'),1);assert(await evaluate('!!remote.trash'),'Offline deletion is durable locally before the remote delete');
    assert(await evaluate('!document.getElementById("modal-confirm").classList.contains("open")'));
    // Reload the whole JS environment; legacy archive is deliberately stale.
    await navigateFixture(true);
    assert.equal(await evaluate('document.querySelectorAll("#sessions-list .session-block").length'),2);assert.equal(await evaluate('TeamBullsSessionPerformance.isDeleted("trash")'),true);
    await evaluate('simOnline=true;TeamBullsSessionPerformance.flush()');assert.equal(await evaluate('!!remote.trash'),false);assert(await evaluate('!!remote.keep'));
    // The actual last-set wrapper must offer a complete-session confirmation.
    await evaluate(`simOnline=false;clickSessionAction('openEditSession','last');document.querySelector('#edit-sets-editor .btn-rm-set').click()`);
    assert((await evaluate('document.getElementById("confirm-title").textContent')).includes('Apagar registro completo'));
    await evaluate(`document.querySelector('#modal-confirm button[onclick*=\"closeModal\"]').click()`);assert.equal(await evaluate('document.querySelectorAll("#edit-sets-editor .performed-set-row").length'),1);
    await evaluate(`document.querySelector('#edit-sets-editor .btn-rm-set').click();document.getElementById('confirm-ok-btn').click()`);await sleep(60);
    assert.equal(await evaluate('tree[0].exercises[0].sessions.some(s=>s.id==="last")'),false);assert(await evaluate('!document.getElementById("modal-edit-session").classList.contains("open")'));
    // Storage failure must keep the record, editor and confirmation for retry.
    await evaluate(`openEditSession('keep');failStorage=true;document.getElementById('btn-delete-edited-session')?.click()`);
    // Some releases expose this through the footer action directly.
    await evaluate('deleteEditedSession();document.getElementById("confirm-ok-btn").click()');await sleep(60);
    assert(await evaluate('tree[0].exercises[0].sessions.some(s=>s.id==="keep")'));assert(await evaluate('document.getElementById("modal-confirm").classList.contains("open")'));assert.equal(await evaluate('document.getElementById("confirm-ok-btn").disabled'),false);
    await evaluate('failStorage=false;document.getElementById("confirm-ok-btn").click()');await sleep(60);assert.equal(await evaluate('tree[0].exercises[0].sessions.length'),0);
    await evaluate('simOnline=true;TeamBullsSessionPerformance.flush()');assert.equal(await evaluate('Object.keys(remote).length'),0);
    // Two independent pages sharing the real IndexedDB database, with quota
    // failure simulated only for localStorage writes.
    await command('Runtime.evaluate',{expression:'void(window.peer=window.open(location.href+"?peer","delete-peer"))',userGesture:true});
    for(let i=0;i<120;i++){if(await evaluate('!!window.peer?.fixtureReady'))break;await sleep(50);}
    assert(await evaluate('!!window.peer?.fixtureReady'),'Second page must be ready');assert.deepEqual(await evaluate('peer.errors'),[]);
    await evaluate('simOnline=false;failLocalOnly=true;peer.simOnline=false;peer.failLocalOnly=true;Promise.all([TeamBullsSessionPerformance.requestDelete("parallel-a",session("parallel-a")),peer.TeamBullsSessionPerformance.requestDelete("parallel-b",session("parallel-b"))])');
    await evaluate('peer.close();sessionStorage.clear()');await navigateFixture(true);
    assert(await evaluate('TeamBullsSessionPerformance.isDeleted("parallel-a")&&TeamBullsSessionPerformance.isDeleted("parallel-b")'),'Atomic IndexedDB merge must preserve deletion intents from both pages after cold reload');
    assert.deepEqual(await evaluate('errors'),[]);results.push({width,height});
  }
  assert.deepEqual(exceptions,[]);console.log('PASS real deletion clicks at 390/1440 px: cancel, offline trash, full reload with stale archive, reconnect, last-set confirmation/cancel, storage failure/retry and atomic IndexedDB merge across two pages; other records preserved.');
} finally {
  if(socket?.readyState===1){try{await command('Browser.close');}catch{}socket.close();}chrome.kill();server.close();
  if(path.dirname(profile)===os.tmpdir()&&path.basename(profile).startsWith('tb-login-css-'))for(let i=0;i<8;i++){try{fs.rmSync(profile,{recursive:true,force:true});break;}catch{await sleep(150);}}
}
