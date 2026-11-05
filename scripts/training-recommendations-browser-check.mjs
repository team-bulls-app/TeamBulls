// Browser QA: synthetic protocol, no Firebase or account access.
import assert from 'node:assert/strict';
import fs from 'node:fs';import http from 'node:http';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';
import {waitForChromePage} from './chrome-readiness.mjs';
const core=fs.readFileSync('app_v10_10_9_core.js','utf8'),block=core.slice(core.indexOf('// Protocol-wide training/rest guidance'));
const fixture=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles_v10_10_9.css"><body><main id="app"><div id="summary"></div></main><script>
let CURRENT_USER={role:'trainer',uid:'coach'},MODE='cloud',VIEW_STUDENT={uid:'a'},VIEW_STUDENT_WORKOUT={id:'w',name:'Treino de 4 dias',days:[{name:'Superior 1'},{name:'Inferior 1'},{name:'Superior 2'},{name:'Inferior 2'}]};
const esc=s=>String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;'),beginAction=()=>true,endAction=()=>{},showToast=()=>{};
const db={collection:()=>({doc:()=>({id:'w'})}),runTransaction:async fn=>{await fn({get:async()=>({exists:true,data:()=>({userId:'a'})}),update:(_ref,data)=>{window.saved=data;}});}};
async function cloudWrite(promise){return promise;}
function openModal(id){document.getElementById(id).classList.add('open');}
function closeModal(id){document.getElementById(id).classList.remove('open');TRAINING_RECOMMENDATIONS_CONTEXT=null;}
function renderTsWorkout(w){document.getElementById('summary').innerHTML=trainingRecommendationsHtml(w);}
${block}
renderTsWorkout(VIEW_STUDENT_WORKOUT);
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
    await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<800});
    await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
    for(let i=0;i<60;i++){if(await evaluate('document.readyState === "complete"'))break;await sleep(50);}
    await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)};openTrainingRecommendations()`);
    await sleep(300);
    const check=await evaluate(`(() => {const m=document.getElementById('modal-training-recommendations'),r=m.querySelector('.modal-sheet').getBoundingClientRect();return {open:m.classList.contains('open'),fits:r.width<=innerWidth+1&&r.height>200&&r.top<innerHeight,days:m.querySelectorAll('input[type=checkbox]').length,input:getComputedStyle(document.getElementById('training-frequency')).fontSize};})()`);
    assert(check.open&&check.fits&&check.days===7&&parseFloat(check.input)>=16,JSON.stringify(check));
    await evaluate(`document.getElementById('training-frequency').value='Treine 2 dias e descanse 1; treine os outros 2 dias, descanse 2 dias e repita.';document.querySelector('#modal-training-recommendations input[value="0"]').checked=true;saveTrainingRecommendations()`);
    const saved=await evaluate(`({text:document.getElementById('summary').textContent,days:VIEW_STUDENT_WORKOUT.days.length,fields:Object.keys(window.saved).join(',')})`);
    assert(saved.text.includes('Treine 2 dias')&&saved.text.includes('Segunda-feira'));assert.equal(saved.days,4);assert.equal(saved.fields,'trainingRecommendations');
    await evaluate('CURRENT_USER.role="student";renderTsWorkout(VIEW_STUDENT_WORKOUT)');assert(!(await evaluate('document.getElementById("summary").innerHTML')).includes('EDITAR FREQUÊNCIA'));
    await evaluate('CURRENT_USER.role="trainer";openTrainingRecommendations()');assert((await evaluate('document.getElementById("training-frequency").value')).includes('descanse 2 dias'));
    await sleep(300);
    assert(await evaluate('document.querySelector("#modal-training-recommendations .modal-sheet").getBoundingClientRect().top < innerHeight-200'));
    if(screenshotDir)fs.writeFileSync(path.join(screenshotDir,`${theme}-${width}.png`),Buffer.from((await command('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false})).data,'base64'));
    results.push({theme,width});
  }
  console.log(`PASS ${results.length} browser scenarios: cycle editor, weekdays, saved text, read-only student and unchanged workout days.`);
} finally {
  if(socket?.readyState===1){try{await command('Browser.close');}catch{}socket.close();}
  chrome.kill();
  server.close();
  // Only the randomly created isolated Chrome profile is disposable.
  if(path.dirname(profile)===os.tmpdir()&&path.basename(profile).startsWith('tb-login-css-')){
    for(let i=0;i<8;i++){try{fs.rmSync(profile,{recursive:true,force:true});break;}catch{await sleep(150);}}
  }
}
