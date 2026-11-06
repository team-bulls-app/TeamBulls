// Click-level regression on real app markup, photo wrappers and catalog actions.
import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';import http from 'node:http';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';import {waitForChromePage} from './chrome-readiness.mjs';
const core=fs.readFileSync('app_v10_10_9_core.js','utf8');
function fn(name){const start=core.indexOf(`function ${name}(`);assert(start>=0,name);const line=core.slice(start).split('\n')[0].trimEnd(),prefix=core.slice(start-6,start)==='async '?'async ':'';return prefix+(line.endsWith('}')?line:core.slice(start,core.indexOf('\n}',start)+2));}
const names=['capturePhotoReadContext','photoReadContextCurrent','beginPhotoViewRequest','photoViewRequestCurrent','openPhotoView','openComparePhotos','runComparePhotos','openModal','closeModal','showConfirm','beginAction','endAction','captureCatalogEditor','commitCatalogAction','catalogPreserveFields','persistSharedCatalog','persistGeneralInstructions','persistTechniqueCatalog','cacheGeneralInstructions','cacheTechniqueCatalog','saveInstructionFolder','saveInstructionItem','deleteInstructionItem','saveTechnique','deleteTechnique','renderInstructions','renderTechniques','instructionVideoAction','openInstructionFolderModal','openInstructionItemModal','openTechniqueEditor'];
const markup=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'');
const setup=`<script>
window.errors=[];window.addEventListener('error',e=>errors.push(e.message));window.alerts=[];window.alert=e=>alerts.push(String(e));
let CURRENT_USER={uid:'coach',role:'trainer'},VIEW_STUDENT={uid:'student'},MODE='cloud',NAVIGATION_SEQ=1,PHOTOS_CACHE_UID='student',CUR_PHOTO_ID=null,PHOTO_VIEW_REQUEST=0,PHOTO_COMPARE_REQUEST=0,TRAINING_RECOMMENDATIONS_CONTEXT=null;
let PHOTOS_CACHE=[{id:'a',userId:'student',date:'2026-11-02',weight:80,dataUrl:'/download-a.png'},{id:'b',userId:'student',date:'2026-10-01',weight:85,dataUrl:'/download-b.png'}];
let GENERAL_INSTRUCTIONS={revision:1,folders:[{id:'f1',name:'Original',active:true,items:[{id:'i1',title:'Orientação',text:'Texto',active:true}]}]},TECHNIQUE_CATALOG={revision:1,items:[{id:'t1',code:'T',name:'Original',description:'Descrição'}]},EDIT_INSTRUCTION_FOLDER_ID='f1',EDIT_INSTRUCTION_ITEM_ID='i1',EDIT_TECHNIQUE_ID='t1',INSTRUCTIONS_FORCED=false;
const CATALOG_EDITOR_CONTEXTS={};const GENERAL_INSTRUCTIONS_CACHE_KEY='fixture-instructions',TECHNIQUE_CATALOG_CACHE_KEY='fixture-techniques',ACTION_LOCKS=new Set();
const normalizeGeneralInstructions=s=>structuredClone(s),normalizeTechniqueCatalog=s=>structuredClone(s),uid=()=> 'new-item',extractYouTubeId=()=>true,fmt=s=>s,showToast=()=>{},storageSet=(key,value)=>{localStorage.setItem(key,value);return true;};
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}const jsArg=s=>esc(JSON.stringify(s));
window.pendingHigh={};window.pendingThumb={};window.deferThumb=false;
function resolvePhotoSource(record,{full=false}={}){if(full)return new Promise(resolve=>(pendingHigh[record.id]??=[]).push(resolve));if(deferThumb)return new Promise(resolve=>(pendingThumb[record.id]??=[]).push(resolve));return Promise.resolve('/thumb-'+record.id+'.png');}
window.release=(id,thumb=false)=>{const queue=thumb?pendingThumb:pendingHigh;const resolve=queue[id]?.shift();if(!resolve)throw new Error('Missing photo request '+id);resolve('/'+(thumb?'thumb-':'full-')+id+'.png');};
const ensureStorageService=async()=>null,withTimeout=p=>p,safePhotoPath=()=>'',safePhotoDataUrl=s=>s||'';
window.downloads=[];window.fetch=async url=>{downloads.push(String(url));return {ok:true,blob:async()=>new Blob(['fake'],{type:'image/jpeg'})};};HTMLAnchorElement.prototype.click=function(){downloads.push(this.download);};
window.failWrites=false;window.writes=0;let remoteLibraries={};const firebase={firestore:{FieldValue:{serverTimestamp:()=>123}}},cloudWrite=async p=>p,db={collection:collection=>({doc:()=>({collection})}),runTransaction:async task=>{let staged;await task({get:async ref=>({exists:true,data:()=>remoteLibraries[ref.collection]||structuredClone(ref.collection==='trainingInstructions'?GENERAL_INSTRUCTIONS:TECHNIQUE_CATALOG)}),set:(ref,payload)=>{staged={ref,payload};}});if(staged){if(failWrites)throw new Error('Sem conexão (simulada)');remoteLibraries[staged.ref.collection]=structuredClone(staged.payload);delete remoteLibraries[staged.ref.collection].updatedAt;writes++;}}};
${names.map(fn).join('\n')}
cacheGeneralInstructions();cacheTechniqueCatalog();document.querySelectorAll('.screen').forEach(e=>e.classList.remove('active'));document.getElementById('screen-photos').classList.add('active');
</script><script src="/quality.js"></script><script src="/photo-ux.js"></script>`;
const setupScript=setup.slice(8,setup.indexOf('</script>'));new vm.Script(setupScript);
const fixture=markup.replace('</head>','<link rel="stylesheet" href="/styles_v10_10_9.css"></head>').replace('</body>','<script src="/fixture.js"></script><script src="/quality.js"></script><script src="/photo-ux.js"></script></body>');
const routes=new Map([['/quality.js','modules/photo-quality-download-v10_10_9.js'],['/photo-ux.js','modules/report-photo-ux-v10_10_10.js'],['/styles_v10_10_9.css','styles_v10_10_9.css']]);
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(setupScript);}if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fixture);}if(pathname.endsWith('.png')){res.setHeader('Content-Type','image/png');return res.end(fs.readFileSync('icon-192-v9-8.png'));}const file=routes.get(pathname);if(!file){res.writeHead(404);return res.end();}res.setHeader('Content-Type',pathname.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));});
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
    for(let i=0;i<60;i++){if(await evaluate('document.readyState === "complete" && !!window.TeamBullsReportPhotoUX'))break;await sleep(50);}
    assert.deepEqual(exceptions,[]);assert.deepEqual(await evaluate('window.errors'),[]);
    await evaluate('void openPhotoView("a",true);void openPhotoView("b",true)');await sleep(40);
    await evaluate('release("b")');await sleep(30);assert((await evaluate('document.getElementById("photo-view-img").getAttribute("src")')).endsWith('full-b.png'));
    await evaluate('release("a")');await sleep(30);assert((await evaluate('document.getElementById("photo-view-img").getAttribute("src")')).endsWith('full-b.png'),'Stale A must not replace B');
    await evaluate('document.getElementById("btn-download-photo").click()');await sleep(30);assert((await evaluate('downloads')).includes('/download-b.png'),'Download must match displayed record');
    await evaluate('void openPhotoView("a",true)');await sleep(30);
    await evaluate(`document.querySelector('#modal-photo-view button[onclick*="closeModal"]').click();release('a')`);await sleep(30);
    assert(await evaluate('!document.getElementById("modal-photo-view").classList.contains("open") && !document.getElementById("photo-view-img").getAttribute("src")'),'Closing while loading must not reopen viewer');
    await evaluate('deferThumb=true;void openPhotoView("b",true)');await sleep(30);await evaluate('release("b")');await sleep(30);await evaluate('release("b",true)');await sleep(30);
    assert((await evaluate('document.getElementById("photo-view-img").getAttribute("src")')).endsWith('full-b.png'),'Late thumbnail must not replace original');
    await evaluate('closeModal("modal-photo-view");deferThumb=false;openComparePhotos()');
    assert.equal(await evaluate('document.getElementById("select-compare-a").value'),'b');assert.equal(await evaluate('document.getElementById("select-compare-b").value'),'a');
    await evaluate(`document.querySelector('#modal-compare-photos .btn-primary').click()`);await sleep(30);await evaluate('release("a");release("b")');await sleep(30);
    assert.equal(await evaluate('document.getElementById("compare-result").style.display'),'block');
    await evaluate('void runComparePhotos()');await sleep(30);await evaluate('closeModal("modal-compare-photos");release("a");release("b")');await sleep(30);
    assert.equal(await evaluate('document.getElementById("compare-result").style.display'),'none');
    await evaluate('openInstructionFolderModal("f1");document.getElementById("input-instruction-folder-name").value="Nova pasta";failWrites=true;document.querySelector("#modal-instruction-folder .btn-primary").click()');await sleep(30);
    assert.equal(await evaluate('GENERAL_INSTRUCTIONS.folders[0].name'),'Original');assert.equal(await evaluate('JSON.parse(localStorage.getItem("fixture-instructions")).folders[0].name'),'Original');assert(await evaluate('document.getElementById("modal-instruction-folder").classList.contains("open")'));
    await evaluate('failWrites=false;document.querySelector("#modal-instruction-folder .btn-primary").click()');await sleep(30);assert.equal(await evaluate('GENERAL_INSTRUCTIONS.folders[0].name'),'Nova pasta');assert(await evaluate('!document.getElementById("modal-instruction-folder").classList.contains("open")'));
    await evaluate('deleteInstructionItem("f1","i1");failWrites=true;document.getElementById("confirm-ok-btn").click()');await sleep(30);assert.equal(await evaluate('GENERAL_INSTRUCTIONS.folders[0].items.length'),1);assert(await evaluate('document.getElementById("modal-confirm").classList.contains("open")'));
    await evaluate('failWrites=false;document.getElementById("confirm-ok-btn").click()');await sleep(30);assert.equal(await evaluate('GENERAL_INSTRUCTIONS.folders[0].items.length'),0);
    await evaluate('openTechniqueEditor("t1");document.getElementById("input-technique-name").value="Nova técnica";failWrites=true;document.querySelector("#modal-technique-editor .btn-primary").click()');await sleep(30);assert.equal(await evaluate('TECHNIQUE_CATALOG.items[0].name'),'Original');
    await evaluate('failWrites=false;document.querySelector("#modal-technique-editor .btn-primary").click()');await sleep(30);assert.equal(await evaluate('TECHNIQUE_CATALOG.items[0].name'),'Nova técnica');
    assert.deepEqual(await evaluate('window.errors'),[]);results.push({width,height});
  }
  console.log('PASS real click flows on mobile/desktop: photo selection/close/download/late thumbnail, chronological comparison, catalog failure+retry, delete confirmation and technique save.');
} finally {
  if(socket?.readyState===1){try{await command('Browser.close');}catch{}socket.close();}
  chrome.kill();
  server.close();
  // Only the randomly created isolated Chrome profile is disposable.
  if(path.dirname(profile)===os.tmpdir()&&path.basename(profile).startsWith('tb-login-css-')){
    for(let i=0;i<8;i++){try{fs.rmSync(profile,{recursive:true,force:true});break;}catch{await sleep(150);}}
  }
}
