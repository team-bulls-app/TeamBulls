// Real markup/controllers, actual payment module and active cardio timer patch.
// All documents, files and delayed responses are synthetic localhost fixtures.
import assert from 'node:assert/strict';import fs from 'node:fs';import http from 'node:http';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';import {waitForChromePage} from './chrome-readiness.mjs';
const core=fs.readFileSync('app_v10_10_9_core.js','utf8');
function fn(name){const start=core.indexOf(`function ${name}(`);assert(start>=0,name);const line=core.slice(start).split('\n')[0].trimEnd(),prefix=core.slice(start-6,start)==='async '?'async ':'';return prefix+(line.endsWith('}')?line:core.slice(start,core.indexOf('\n}',start)+2));}
const names=['normalizeCardioItem','normalizeCardioDocument','cardioCanEdit','cardioOwnerKey','cardioAllItems','cardioItemById','cardioDurationText','cardioFrequencyText','cardioTimerStorageKey','readCardioTimer','writeCardioTimer','clearCardioTimer','formatCardioClock','loadCardioDocument','captureCardioContext','persistCardioMutation','cardioItemCard','cardioTimerMarkup','renderCardioScreen','openCardioModule','selectCardioTimer','currentCardioTimerItem','updateCardioTimerDisplay','ensureCardioTimerTicker','startCardioTimer','pauseCardioTimer','resetCardioTimer','openAddCardioMain','openAddCardioSubstitution','openEditCardioItem','saveCardioItem','cardioDeleteContextCurrent','cardioWithoutItem','moveCardioSubstitution','openModal','closeModal','beginAction','endAction'];
const markup=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'');
const setup=`
window.errors=[];window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));window.messages=[];window.alert=e=>messages.push(String(e));
let CURRENT_USER=null,MODE='cloud',VIEW_STUDENT={uid:'a'},NAVIGATION_SEQ=1,LOCAL_DB={},LOCAL_OWNER_UID='',LOCAL_GUEST_OWNER='',INACTIVE_UID='',TRAINING_RECOMMENDATIONS_CONTEXT=null;
let CARDIO_CONTEXT={trainer:true,local:false,targetUid:'a'},CARDIO_DOCUMENT={main:null,substitutions:[]},CURRENT_CARDIO_ITEM_ID='',EDIT_CARDIO_KIND='main',EDIT_CARDIO_ITEM_ID='',CARDIO_EDITOR_CONTEXT=null,CARDIO_TIMER_INTERVAL=0;
const CARDIO_TIMER_MEMORY=new Map(),ACTION_LOCKS=new Set();let seq=0;
const seed={main:{id:'m',type:'Esteira',durationMinutes:30,daysPerWeek:3,notes:''},substitutions:[{id:'b',type:'Bike',durationMinutes:30,daysPerWeek:3,order:0},{id:'e',type:'Elíptico',durationMinutes:30,daysPerWeek:3,order:1}]};
window.remote={'mealPlans/a':{plans:[{id:'diet-keep'}],cardioPlan:structuredClone(seed)}};window.failWrites=false;window.failReceiptLink=false;window.uploads=[];window.deleted=[];window.pendingReads={};window.pendingReceipts={};window.deferReads=false;
const canSelfManagePlan=()=>false,uid=()=> 'new-'+(++seq),showToast=m=>messages.push(m),cloudWriteError=e=>e.message,cloudWrite=p=>p,withTimeout=p=>p,focusEditorField=()=>{},playSurvivalTone=()=>{};
const beginAsyncNavigation=()=>++NAVIGATION_SEQ,isNavigationCurrent=n=>n===NAVIGATION_SEQ;
function showScreen(id){NAVIGATION_SEQ++;document.querySelectorAll('.screen').forEach(e=>e.classList.remove('active'));document.getElementById(id).classList.add('active');}
function closeCardioScreen(){}function confirmLogout(){CURRENT_USER=null;}function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}const jsArg=s=>esc(JSON.stringify(s));
const firebase={firestore:{FieldValue:{serverTimestamp:()=>123}}};
const users={docs:[{id:'a',data:()=>({name:'Aluno A',email:'synthetic-a@example.invalid',role:'student',trainerId:'coach',status:'active'})}]};
function ref(key){return{key,doc:id=>ref(key+'/'+id),collection:name=>ref(key+'/'+name),where:()=>ref(key),limit:()=>ref(key),get:async()=>key==='users'?users:{exists:!!remote[key],data:()=>structuredClone(remote[key])},set:async payload=>{if(failWrites)throw new Error('offline');remote[key]={...remote[key],...structuredClone(payload)};if(failReceiptLink&&payload.receiptPath)throw new Error('timeout-after-commit');},delete:async()=>{deleted.push(key);}};}
const db={collection:name=>ref(name),runTransaction:async task=>{let stage;const result=await task({get:r=>r.get(),set:(r,payload)=>{stage={r,payload};}});if(failWrites)throw new Error('offline');if(stage)remote[stage.r.key]={...remote[stage.r.key],...structuredClone(stage.payload)};return result;}};
function cloudGet(r){if(deferReads&&r.key.startsWith('mealPlans/'))return new Promise(resolve=>pendingReads[r.key]=resolve);return r.get();}
window.releaseRead=(id,plan)=>pendingReads['mealPlans/'+id]({exists:true,data:()=>({cardioPlan:plan})});
function ensureStorageService(){return Promise.resolve({ref:key=>({put:async file=>uploads.push({key,name:file.name}),delete:async()=>deleted.push(key),getDownloadURL:()=>new Promise(resolve=>pendingReceipts[key]=resolve)})});}
window.releaseReceipt=key=>pendingReceipts[key]('/'+key+'.png');
${names.map(fn).join('\n')}
window.readyFixture=true;
`;
const fixture=markup.replace('</head>','<link rel="stylesheet" href="/styles_v10_10_9.css"></head>').replace('</body>','<script src="/fixture.js"></script><script src="/timer.js"></script><script src="/payments.js"></script></body>');
const routes=new Map([['/styles_v10_10_9.css','styles_v10_10_9.css'],['/timer.js','modules/cardio-timer-fix-v10_10_9.js'],['/payments.js','modules/trainer-inbox-payments-v10_10_12.js']]);
const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://localhost').pathname;if(url==='/'){res.setHeader('Content-Type','text/html;charset=utf-8');return res.end(fixture);}if(url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(setup);}if(url.endsWith('.png')){res.setHeader('Content-Type','image/png');return res.end(fs.readFileSync('icon-192-v9-8.png'));}const file=routes.get(url);if(!file){res.writeHead(404);return res.end();}res.setHeader('Content-Type',url.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));});

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
    await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
    for(let i=0;i<60;i++){if(await evaluate('document.readyState === "complete" && !!window.TeamBullsTrainerHub'))break;await sleep(50);}
    assert.deepEqual(await evaluate('errors'),[]);
    await evaluate('CURRENT_USER={uid:"coach",role:"trainer"};CARDIO_DOCUMENT=normalizeCardioDocument(seed);renderCardioScreen();showScreen("screen-ts-cardio");selectCardioTimer("m");startCardioTimer()');
    await evaluate(`document.querySelector('#ts-cardio-content .main button[onclick*="openEditCardioItem"]').click();document.getElementById('input-cardio-duration').value='45';failWrites=true;document.querySelector('#modal-cardio-item .btn-primary').click()`);await sleep(35);
    assert.equal(await evaluate('CARDIO_DOCUMENT.main.durationMinutes'),30);assert(await evaluate('readCardioTimer(CARDIO_DOCUMENT.main).running'),'Failed edit must preserve running timer');assert(await evaluate('document.getElementById("modal-cardio-item").classList.contains("open")'));
    await evaluate('remote["mealPlans/a"].cardioPlan.substitutions.push({id:"other-device",type:"Escada",durationMinutes:20,daysPerWeek:3,order:2});failWrites=false;document.querySelector("#modal-cardio-item .btn-primary").click()');await sleep(35);
    assert.equal(await evaluate('CARDIO_DOCUMENT.main.durationMinutes'),45);assert.equal(await evaluate('CARDIO_DOCUMENT.substitutions.length'),3);assert.equal(await evaluate('remote["mealPlans/a"].plans[0].id'),'diet-keep');assert(await evaluate('!document.getElementById("modal-cardio-item").classList.contains("open")'));
    // Actual opening controller and loader, with delayed responses in reverse order.
    await evaluate('deferReads=true;void openCardioModule("workout",true);VIEW_STUDENT={uid:"b"};void openCardioModule("diet",true)');
    await evaluate('releaseRead("b",{main:{id:"b-plan",type:"Cardio B",durationMinutes:10,daysPerWeek:3},substitutions:[]})');await sleep(30);
    await evaluate('releaseRead("a",{main:{id:"a-plan",type:"Cardio A"},substitutions:[]})');await sleep(30);
    assert.equal(await evaluate('CARDIO_DOCUMENT.main.id'),'b-plan');assert((await evaluate('document.getElementById("ts-cardio-content").textContent')).includes('Cardio B'));
    await evaluate('(async()=>{deferReads=false;await TeamBullsTrainerHub.openPaymentEditor("a");})()');
    await evaluate(`document.getElementById('tb-payment-amount').value='600';document.getElementById('tb-payment-valid-from').value='2026-09-15';const transfer=new DataTransfer();transfer.items.add(new File(['synthetic receipt'],'receipt.jpg',{type:'image/jpeg'}));const input=document.getElementById('tb-payment-receipt');input.files=transfer.files;input.dispatchEvent(new Event('change'));failReceiptLink=true;document.getElementById('tb-payment-save').click()`);await sleep(45);
    assert.equal(await evaluate('uploads.length'),1);assert.equal(await evaluate('deleted.length'),0,'Receipt confirmed by the server must survive a client timeout');
    assert.equal(await evaluate('Object.entries(remote).find(([key])=>key.startsWith("trainerBilling/coach/payments/"))[1].receiptPath'),await evaluate('uploads[0].key'));
    assert(await evaluate('!document.getElementById("modal-trainer-payment").classList.contains("open")'));assert.equal(await evaluate('document.getElementById("tb-payment-save").disabled'),false);
    // The actual module's receipt viewer must keep the latest selection.
    await evaluate('void TeamBullsTrainerHub.openReceipt("a");void TeamBullsTrainerHub.openReceipt("b")');await sleep(20);
    await evaluate('releaseReceipt("b")');await sleep(20);await evaluate('releaseReceipt("a")');await sleep(20);
    assert((await evaluate('document.getElementById("tb-payment-receipt-view").getAttribute("src")')).endsWith('/b.png'));
    await evaluate('void TeamBullsTrainerHub.openReceipt("c")');await sleep(20);await evaluate('closeModal("modal-payment-receipt");releaseReceipt("c")');await sleep(20);
    assert(await evaluate('!document.getElementById("modal-payment-receipt").classList.contains("open")'));assert.equal(await evaluate('document.getElementById("tb-payment-receipt-view").getAttribute("src")'),null);
    await evaluate('void TeamBullsTrainerHub.openReceipt("d")');await sleep(20);
    await evaluate('confirmLogout();CURRENT_USER={uid:"coach",role:"trainer"};openModal("modal-payment-receipt");releaseReceipt("d")');await sleep(20);
    assert.equal(await evaluate('document.getElementById("tb-payment-receipt-view").getAttribute("src")'),null,'Logout must invalidate a receipt request even if the same trainer signs in again');
    await evaluate('CURRENT_USER={uid:"a",role:"student"}');assert.equal(await evaluate('TeamBullsTrainerHub.savePayment()'),false);assert.equal(await evaluate('TeamBullsTrainerHub.openReceipt("denied")'),false,'Student cannot use trainer receipt actions');
    assert.deepEqual(await evaluate('errors'),[]);results.push({width,height});
  }
  assert.deepEqual(exceptions,[]);
  console.log('PASS deep browser clicks at 390/1440 px: active timer preserved on failure, cardio save/retry with concurrent addition, stale student read, real payment module with uncertain receipt link and receipt viewer selection/close.');
} finally {
  if(socket?.readyState===1){try{await command('Browser.close');}catch{}socket.close();}
  chrome.kill();server.close();
  if(path.dirname(profile)===os.tmpdir()&&path.basename(profile).startsWith('tb-login-css-')){
    for(let i=0;i<8;i++){try{fs.rmSync(profile,{recursive:true,force:true});break;}catch{await sleep(150);}}
  }
}
