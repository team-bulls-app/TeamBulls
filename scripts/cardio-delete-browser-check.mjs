// Isolated browser reproduction: cardio deletion and protocol visual style.
import assert from 'node:assert/strict';import fs from 'node:fs';import http from 'node:http';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';
import {waitForChromePage} from './chrome-readiness.mjs';
const core=fs.readFileSync('app_v10_10_9_core.js','utf8');
function fn(name){const start=core.indexOf(`function ${name}(`),line=core.slice(start).split('\n')[0].trimEnd(),async=core.slice(start-6,start)==='async '?'async ':'';return async+(line.endsWith('}')?line:core.slice(start,core.indexOf('\n}',start)+2));}
const code=['normalizeCardioItem','normalizeCardioDocument','cardioCanEdit','cardioAllItems','cardioItemById','cardioDurationText','cardioFrequencyText','cardioItemCard','cardioTimerMarkup','renderCardioScreen','cardioDeleteContextCurrent','cardioWithoutItem','deleteCardioItem','deleteCardioItemConfirmed','showConfirm'].map(fn).join('\n');
const recommendations=core.slice(core.indexOf('// Protocol-wide training/rest guidance'));
const fixture=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles_v10_10_9.css"><main id="app"><section class="screen active" id="screen-ts-cardio"><div class="content"><div id="guidance" class="protocol-summary"></div><div id="ts-cardio-content"></div></div></section></main><div class="modal-backdrop" id="modal-confirm"><div class="modal-sheet"><h2 id="confirm-title"></h2><p id="confirm-text"></p><button id="confirm-ok-btn">CONFIRMAR</button><button id="cancel" onclick="closeModal('modal-confirm')">CANCELAR</button></div></div><script>
let CURRENT_USER={uid:'coach',role:'trainer'},VIEW_STUDENT={uid:'a'},MODE='cloud',VIEW_STUDENT_WORKOUT={trainingRecommendations:{frequency:'Treine 2 dias e descanse 1. Ao fim dos 4 treinos, descanse 2 dias e repita.',weekdays:[]}};
let CARDIO_CONTEXT={trainer:true,local:false,targetUid:'a'},CARDIO_DOCUMENT={main:null,substitutions:[{id:'b',type:'Bicicleta ergométrica',durationMinutes:30,daysPerWeek:7},{id:'e',type:'Elíptico',durationMinutes:30,daysPerWeek:7}]},CURRENT_CARDIO_ITEM_ID='e',EDIT_CARDIO_KIND='substitution',EDIT_CARDIO_ITEM_ID='',locked=false;
let remote={cardioPlan:structuredClone(CARDIO_DOCUMENT),plans:[{name:'Dieta preservada'}]};
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
const jsArg=s=>esc(JSON.stringify(s)),uid=()=> 'generated',cardioOwnerKey=()=>CARDIO_CONTEXT.targetUid,canSelfManagePlan=()=>false,updateCardioTimerDisplay=()=>{},clearCardioTimer=()=>{},showToast=()=>{},alert=e=>{window.lastError=e;},cloudWriteError=e=>e.message;
const beginAction=()=>{if(locked)return false;locked=true;return true;},endAction=()=>{locked=false;};
function readCardioTimer(item){return {durationSeconds:item.durationMinutes*60,remainingSeconds:item.durationMinutes*60,running:false};}
function formatCardioClock(){return '30:00';}function openModal(id){document.getElementById(id).classList.add('open');}function closeModal(id){document.getElementById(id)?.classList.remove('open');}
const firebase={firestore:{FieldValue:{serverTimestamp:()=>123}}},cloudWrite=async p=>p,db={collection:()=>({doc:()=>({})}),runTransaction:async task=>{let payload;const result=await task({get:async()=>({exists:true,data:()=>structuredClone(remote)}),set:(_ref,value)=>{payload=value;}});remote={...remote,...payload};return result;}};
${code}
${recommendations}
document.getElementById('guidance').innerHTML=trainingRecommendationsHtml(VIEW_STUDENT_WORKOUT);renderCardioScreen();
</script>`;
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/styles_v10_10_9.css'?'text/css':'text/html; charset=utf-8');res.end(req.url==='/styles_v10_10_9.css'?fs.readFileSync('styles_v10_10_9.css'):fixture);});
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
const results = [];
try {
  socket = new WebSocket(await waitForChromePage(chrome, profile, {stderr: () => stderr}));
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage = event => {
    const message=JSON.parse(event.data); const task=pending.get(message.id); if(!task)return;
    pending.delete(message.id);
    message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result);
  };
  await command('Page.enable');
  await command('Network.enable');
  await command('Network.setBlockedURLs',{urls:['https://*']});
  for(const theme of ['dark','light'])for(const width of [320,390,768,1440]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<800});
    await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
    for(let i=0;i<60;i++){if(await evaluate('document.readyState === "complete" && !!document.querySelector(".cardio-delete-btn")'))break;await sleep(50);}
    await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
    assert.equal(await evaluate('document.querySelectorAll(".cardio-delete-btn").length'),2);
    const style=await evaluate(`(() => {const card=document.querySelector('.training-recommendations'),s=getComputedStyle(card),h=getComputedStyle(card.querySelector('h3'));return {radius:s.borderRadius,border:s.borderLeftWidth,font:h.fontFamily,overflow:document.documentElement.scrollWidth>innerWidth+1};})()`);
    assert.equal(style.radius,'0px');assert.equal(style.border,'3px');assert(style.font.includes('Barlow Condensed'));assert(!style.overflow);
    if(screenshotDir)fs.writeFileSync(path.join(screenshotDir,`${theme}-${width}.png`),Buffer.from((await command('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false})).data,'base64'));
    await evaluate('document.querySelectorAll(".cardio-delete-btn")[1].click();document.getElementById("cancel").click()');assert.equal(await evaluate('CARDIO_DOCUMENT.substitutions.length'),2);
    await evaluate('document.querySelectorAll(".cardio-delete-btn")[1].click();document.getElementById("confirm-ok-btn").click()');
    await sleep(80);assert.equal(await evaluate('CARDIO_DOCUMENT.substitutions.length'),1);assert.equal(await evaluate('document.querySelectorAll(".cardio-delete-btn").length'),1);assert.equal(await evaluate('CURRENT_CARDIO_ITEM_ID'),'b');assert.equal(await evaluate('remote.plans[0].name'),'Dieta preservada');
    await evaluate('CARDIO_DOCUMENT=normalizeCardioDocument(remote.cardioPlan);renderCardioScreen()');assert.equal(await evaluate('CARDIO_DOCUMENT.substitutions.length'),1);
    await evaluate('CURRENT_USER={uid:"a",role:"student"};CARDIO_CONTEXT={targetUid:"a",trainer:false,local:false};document.getElementById("ts-cardio-content").innerHTML=cardioItemCard(CARDIO_DOCUMENT.substitutions[0],false,false)');assert.equal(await evaluate('document.querySelectorAll(".cardio-delete-btn").length'),0);
    results.push({theme,width});
  }
  console.log(`PASS ${results.length} browser scenarios: direct delete, cancel, confirm, immediate render, selected timer, remote rehydration, diet preservation, student controls, protocol typography and responsive layout.`);
} finally {
  if(socket?.readyState===1){try{await command('Browser.close');}catch{}socket.close();}
  chrome.kill();
  server.close();
  // Only the randomly created isolated Chrome profile is disposable.
  if(path.dirname(profile)===os.tmpdir()&&path.basename(profile).startsWith('tb-login-css-')){
    for(let i=0;i<8;i++){try{fs.rmSync(profile,{recursive:true,force:true});break;}catch{await sleep(150);}}
  }
}
