// Measures real MutationObserver/rAF behavior in an isolated diet fixture.
import assert from 'node:assert/strict';import fs from 'node:fs';import http from 'node:http';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';import {waitForChromePage} from './chrome-readiness.mjs';
const baselineIndex=process.argv.indexOf('--baseline'),baseline=baselineIndex<0?null:process.argv[baselineIndex+1];
assert(baselineIndex<0||/^[a-f0-9]{7,40}$/.test(baseline||''),'--baseline requires the original commit SHA');
const code=baseline?spawnSync('git',['show',`${baseline}:modules/diet-live-deficit-v10_10_13.js`],{encoding:'utf8'}).stdout:fs.readFileSync('modules/diet-live-deficit-v10_10_13.js','utf8');
const fixture=`<!doctype html><meta charset="utf-8"><textarea id="input-meal-items">100</textarea><div id="tb-trainer-diet-workspace-summary"><div class="tb-workspace-total-row"></div></div><script>
let CURRENT_USER={role:'trainer',uid:'trainer'},MEAL_PLAN_CACHE={meals:[]},EDIT_MEAL_ID='';
window.TeamBullsDietLiveCalories={analyze:text=>({kcal:Number(text),matched:1})};
let expenditure=2000,variantName='Dia de treino';function currentDiet(){return {energySummary:{totalExpenditure:expenditure}};}function currentDietVariant(){return {name:variantName};}
window.mutations=0;new MutationObserver(records=>{window.mutations+=records.length;}).observe(document.getElementById('tb-trainer-diet-workspace-summary'),{subtree:true,childList:true,characterData:true});
</script><script src="/deficit.js"></script>`;
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/deficit.js'?'text/javascript':'text/html');res.end(req.url==='/deficit.js'?code:fixture);});
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
  await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
  for(let i=0;i<60;i++){if(await evaluate('document.readyState === "complete" && !!document.querySelector(".tb-live-deficit-badge")'))break;await sleep(50);}
  await sleep(250);const before=await evaluate('window.mutations');await sleep(650);const quiet=(await evaluate('window.mutations'))-before;
  console.log(JSON.stringify({baseline,quietMutationsIn650ms:quiet}));
  assert.equal(quiet,0,'Idle diet must not keep mutating itself on every animation frame');
  await evaluate('document.getElementById("input-meal-items").value="200";document.getElementById("input-meal-items").dispatchEvent(new Event("input",{bubbles:true}))');
  await sleep(200);assert((await evaluate('document.querySelector(".tb-live-deficit-badge").textContent')).includes('1.800'),'A real edit must update the deficit');
  const changed=await evaluate('window.mutations');await sleep(350);assert.equal(await evaluate('window.mutations'),changed,'Must settle again after input');
  await evaluate('expenditure=0;variantName="<img src=x onerror=evil()>";document.getElementById("input-meal-items").dispatchEvent(new Event("input",{bubbles:true}))');
  await sleep(150);assert((await evaluate('document.querySelector(".tb-live-deficit-badge").textContent')).includes('GET NÃO INFORMADO'));assert.equal(await evaluate('document.querySelectorAll(".tb-live-deficit-badge img").length'),0);
  const unknown=await evaluate('window.mutations');await sleep(350);assert.equal(await evaluate('window.mutations'),unknown);
  console.log('PASS real browser: zero idle DOM mutations after initial render and after edited meal; live calories remain correct.');
} finally {
  if(socket?.readyState===1){try{await command('Browser.close');}catch{}socket.close();}
  chrome.kill();
  server.close();
  // Only the randomly created isolated Chrome profile is disposable.
  if(path.dirname(profile)===os.tmpdir()&&path.basename(profile).startsWith('tb-login-css-')){
    for(let i=0;i<8;i++){try{fs.rmSync(profile,{recursive:true,force:true});break;}catch{await sleep(150);}}
  }
}
