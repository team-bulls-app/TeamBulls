// Real browser migration with isolated localhost storage. No Firebase or user account.
import assert from 'node:assert/strict';
import {waitForChromePage} from './chrome-readiness.mjs';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {inventory} from './legacy-installation-endpoints.mjs';

const read=file=>fs.readFileSync(file,'utf8');
const release=JSON.parse(read('version.json'));
let published=false,available=true,removedLegacy=false;
const historicalWorkers=new Map(['sw_15.js','sw_40.js','sw_46.js'].map(name=>[name,read(`testes/fixtures/legacy-workers/${name}.fixture`)]));
const historicalNames=new Set(inventory.workers.map(entry=>entry.path));
const oldHtml='<!doctype html><meta name="viewport" content="width=device-width"><title>OLD APP</title><main id="old-app">OLD APP WITHOUT UPDATE SETTINGS</main>';
const newHtml=`<!doctype html><meta name="team-bulls-build" content="${release.build}"><title>CURRENT APP</title><main id="current-app"><div class="screen active" id="screen-auth"></div></main><script src="./update_v10_10_9.js?b=${release.build}"></script>`;
// Historical failure mode: a stable legacy endpoint and cache-first HTML, with no update UI.
const legacyWorker=`const CACHE='team-bulls-legacy-fixture';self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.put(new URL('./index.html',self.registration.scope),new Response(${JSON.stringify(oldHtml)},{headers:{'Content-Type':'text/html'}}))).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.mode==='navigate'&&!e.request.url.includes('recuperar.html'))e.respondWith(caches.open(CACHE).then(c=>c.match(new URL('./index.html',self.registration.scope))));});`;
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost'),name=url.pathname.replace(/^\/TeamBulls\//,'');
  if(!available){res.writeHead(503);res.end('OFFLINE');return;}
  let body,type='text/javascript';
  if(name==='index.html'||name===''){type='text/html';body=published?newHtml:oldHtml;}
  else if(historicalNames.has(name)){
    if(published&&(removedLegacy||!fs.existsSync(name))){res.writeHead(404,{'Content-Type':'text/html'});res.end('Historical worker removed');return;}
    body=published?read(name):historicalWorkers.get(name)||legacyWorker;
  }
  else if(name==='sw.js'||name==='sw_47.js')body=published?read(name):legacyWorker;
  else if(name==='version.json'){type='application/json';body=JSON.stringify(release);}
  else if(name==='update_v10_10_9.js'||name==='recovery_v10.js')body=read(name);
  else if(name==='recuperar.html'){type='text/html';body=read(name);}
  else if(name.endsWith('.css')){type='text/css';body='';}
  else body=''; // Optional shell assets are inert fixtures, never production modules.
  res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','Service-Worker-Allowed':'/TeamBulls/'});res.end(body);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,base=origin+'/TeamBulls/';
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'tb-update-browser-'));
const executable=process.env.CHROME_BIN||(process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':['google-chrome','chromium','chromium-browser'].map(name=>spawnSync('which',[name],{encoding:'utf8'}).stdout?.trim()).find(Boolean));
assert(executable&&fs.existsSync(executable),'Chrome required (CHROME_BIN).');
const args=['--headless=new','--no-first-run','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'];
if(process.platform!=='win32')args.push('--no-sandbox');
const chrome=spawn(executable,args,{stdio:['ignore','ignore','pipe'],windowsHide:true});
let stderr='',socket,sequence=0;const pending=new Map();chrome.stderr.on('data',chunk=>stderr+=chunk);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function command(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error(`Timeout ${method}`));},25000);pending.set(id,{resolve:value=>{clearTimeout(timer);resolve(value);},reject:error=>{clearTimeout(timer);reject(error);}});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value;}
async function until(expression){for(let i=0;i<160;i++){if(await evaluate(expression))return;await sleep(100);}throw new Error('Condition timed out: '+expression);}
async function navigate(pathname){await command('Page.navigate',{url:base+pathname});await until('document.readyState === "complete"');}
const seed=`(async()=>{
  localStorage.setItem('fixture-pending-workout','saved-on-device');
  await new Promise((resolve,reject)=>{const req=indexedDB.open('fixture-offline',1);req.onupgradeneeded=()=>req.result.createObjectStore('drafts');req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put('unsent-workout','pending');tx.oncomplete=()=>{db.close();resolve();};};});
})()`;
const preserved=`(async()=>{
  const value=await new Promise((resolve,reject)=>{const req=indexedDB.open('fixture-offline',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('drafts');const read=tx.objectStore('drafts').get('pending');read.onsuccess=()=>resolve(read.result);tx.oncomplete=()=>db.close();};});
  return localStorage.getItem('fixture-pending-workout')==='saved-on-device'&&value==='unsent-workout';
})()`;
try{
  socket = new WebSocket(await waitForChromePage(chrome, profile, {stderr: () => stderr}));
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=event=>{const message=JSON.parse(event.data),task=pending.get(message.id);if(!task)return;pending.delete(message.id);message.error?task.reject(new Error(JSON.stringify(message.error))):task.resolve(message.result);};
  await command('Page.enable');await command('Network.enable');await command('Network.setBlockedURLs',{urls:['https://*']});
  await command('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  for(const endpoint of ['sw_47.js','sw.js']){
    published=false;available=true;
    await command('Storage.clearDataForOrigin',{origin,storageTypes:'all'});
    await navigate('index.html');await evaluate(seed);
    await evaluate(`navigator.serviceWorker.register('./${endpoint}',{scope:'./',updateViaCache:'none'}).then(()=>navigator.serviceWorker.ready).then(()=>true)`);
    await until('!!navigator.serviceWorker.controller');await navigate('index.html');
    assert(await evaluate('!!document.getElementById("old-app")'));
    // Publication must reach the very same worker URL kept by the old installation.
    published=true;
    await evaluate('navigator.serviceWorker.getRegistration().then(reg=>reg.update()).then(()=>true)');
    await until(`new Promise(resolve=>{const c=new MessageChannel();const worker=navigator.serviceWorker.controller;const listener=e=>{if(e.data?.type==='TEAM_BULLS_VERSION'){navigator.serviceWorker.removeEventListener('message',listener);resolve(e.data.build===${release.build});}};navigator.serviceWorker.addEventListener('message',listener);worker.postMessage({type:'GET_VERSION'});setTimeout(()=>{navigator.serviceWorker.removeEventListener('message',listener);resolve(false);},200);})`);
    assert(await evaluate('!!document.getElementById("old-app")'),'Activation must not discard an open form.');
    await navigate('index.html');await until('!!window.TeamBullsUpdater');
    assert(await evaluate('!!document.getElementById("current-app")'));
    assert(await evaluate(preserved),'Migration must preserve localStorage and IndexedDB.');
    console.log(`PASS ${endpoint}: cached old UI → current UI, without reinstall or local data loss`);
    await navigate('recuperar.html');await evaluate('document.getElementById("run").click()');
    await until('!!document.getElementById("current-app") && !!window.TeamBullsUpdater');
    assert(await evaluate(preserved));
    assert.equal(await evaluate('localStorage.getItem("team-bulls-applied-release")'),`${release.version}@${release.build}`);
    console.log(`PASS ${endpoint}: explicit recovery confirms active build and preserves data`);
    await navigate('recuperar.html');available=false;
    await evaluate('document.getElementById("run").click()');
    await until('!document.getElementById("run").disabled');
    assert(await evaluate(preserved));
    assert(await evaluate('!!document.getElementById("run")'),'Failed recovery must remain retryable.');
    console.log(`PASS ${endpoint}: failed download retains data and permits retry`);
    available=true;
  }
  // Recovery must also work before the old worker has migrated on its own.
  published=false;
  await command('Storage.clearDataForOrigin',{origin,storageTypes:'all'});
  await navigate('index.html');await evaluate(seed);
  await evaluate("navigator.serviceWorker.register('./sw_47.js',{scope:'./',updateViaCache:'none'}).then(()=>navigator.serviceWorker.ready).then(()=>true)");
  await until('!!navigator.serviceWorker.controller');
  published=true;await navigate('recuperar.html');
  await evaluate('document.getElementById("run").click()');
  await until('!!document.getElementById("current-app") && !!window.TeamBullsUpdater');
  assert(await evaluate(preserved));
  assert.equal(await evaluate('localStorage.getItem("team-bulls-applied-release")'),`${release.version}@${release.build}`);
  console.log('PASS recovery page upgrades an active legacy worker before validating the new HTML');
  // Regression for deleted worker URLs. Cover every previously published endpoint;
  // three versions execute the original archived worker bytes, including old CSP/cache logic.
  for(const {path:endpoint} of inventory.workers){
    published=false;removedLegacy=false;
    await command('Storage.clearDataForOrigin',{origin,storageTypes:'all'});
    const launch=endpoint==='sw_3.js'?'':endpoint==='sw_40.js'?'index.html?v=10.8.2':'index.html?v=9.8';
    await navigate(launch);
    await evaluate(`navigator.serviceWorker.register('./${endpoint}',{scope:'./',updateViaCache:'none'}).then(()=>navigator.serviceWorker.ready).then(()=>true)`);
    await until('!!navigator.serviceWorker.controller');await evaluate(seed);
    published=true;removedLegacy=true;
    const rejected=await evaluate('navigator.serviceWorker.getRegistration().then(reg=>reg.update()).then(()=>false,()=>true)');
    assert(rejected,`${endpoint}: a deleted script must reproduce a failed update.`);
    assert(await evaluate(`navigator.serviceWorker.getRegistration().then(reg=>reg.active.scriptURL.includes('/${endpoint}'))`));
    removedLegacy=false;
    await evaluate('navigator.serviceWorker.getRegistration().then(reg=>reg.update()).then(()=>true)');
    await until(`new Promise(resolve=>{const worker=navigator.serviceWorker.controller;const listener=e=>{if(e.data?.type==='TEAM_BULLS_VERSION'){navigator.serviceWorker.removeEventListener('message',listener);resolve(e.data.build===${release.build});}};navigator.serviceWorker.addEventListener('message',listener);worker.postMessage({type:'GET_VERSION'});setTimeout(()=>{navigator.serviceWorker.removeEventListener('message',listener);resolve(false);},200);})`);
    await navigate(launch);await until('!!document.getElementById("current-app") && !!window.TeamBullsUpdater');
    assert(await evaluate(preserved),`${endpoint}: account storage and pending drafts must survive.`);
    assert.equal(await evaluate('navigator.serviceWorker.getRegistrations().then(regs=>regs.filter(reg=>reg.scope===new URL("./",location.href).href).length)'),1);
    console.log(`PASS ${endpoint}: deleted URL blocks update; restored bridge delivers current app without reinstall${historicalWorkers.has(endpoint)?' (original historical worker)':''}`);
  }
}finally{
  if(socket?.readyState===1)try{await command('Browser.close');}catch{}
  socket?.close();chrome.kill();await new Promise(resolve=>server.close(resolve));
  // Wait for Chrome to release Windows handles; delete only this test's temp profile.
  assert.equal(path.resolve(path.dirname(profile)),path.resolve(os.tmpdir()));
  assert(path.basename(profile).startsWith('tb-update-browser-'));
  for(let attempt=0;attempt<10;attempt++){
    try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:2,retryDelay:100});break;}
    catch(error){if(attempt===9)throw error;await sleep(250);}
  }
}
