// Real browser QA of trainer progression with synthetic data only. No Firebase.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {waitForChromePage} from './chrome-readiness.mjs';
const core=fs.readFileSync('app_v10_10_9_core.js','utf8');
const block=core.slice(core.indexOf('// Trainer progression: read-only history'),core.indexOf('// Protocol-wide training/rest guidance'));
function extract(name){const start=core.indexOf(`function ${name}(`),end=core.indexOf('\nfunction ',start+1);return core.slice(start,end);}
const fixture=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles_v10_10_9.css"><body><main id="app"><div class="screen active" id="screen-ts-exercise"></div></main><div class="modal-backdrop open" id="modal-exercise"><div class="modal-sheet"><h2>Editar exercício</h2><textarea id="draft">Rascunho ainda não salvo</textarea></div></div><script>
let CURRENT_USER={uid:'coach',role:'trainer'},MODE='cloud',EDIT_EXERCISE_ID='e',VIEW_STUDENT_EXERCISE={id:'e'};
let VIEW_STUDENT={uid:'a',name:'Aluno de teste',workouts:[{id:'w',name:'Plano atual',exercises:[{id:'e',name:'Agachamento',sessions:[]}]}]};
const samples=Array.from({length:60},(_,i)=>({id:String(i),workoutId:'w',exerciseId:'e',exerciseName:'Agachamento',date:'2026-'+String(1+Math.floor(i/28)).padStart(2,'0')+'-'+String(1+i%28).padStart(2,'0'),sets:[{weight:20+i,reps:8},{weight:20+i,reps:10}],week:1}));
const normalizedName=s=>String(s||'').toLowerCase(),sanitizeHistorySession=s=>s,sessionIdentity=s=>s.id,sessionFingerprint=JSON.stringify,createdMillis=()=>0,exerciseUsesResistedTime=()=>false,fmt=s=>s,loadSessionArchive=()=>samples;
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function fetchCloudSessions(){return {sessions:samples,source:'server'};}
function openModal(id){document.getElementById(id).classList.add('open');}
${extract('mergeHistorySessions')}
${extract('sessionsFromWorkoutTree')}
${block}
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
    await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)};openTrainerProgress('exercise')`);
    await sleep(150);
    const check=await evaluate(`(() => {const modal=document.getElementById('modal-trainer-progress'),sheet=modal.querySelector('.modal-sheet'),rect=sheet.getBoundingClientRect();return {visible:modal.classList.contains('open'),within:rect.width<=innerWidth+1,records:modal.querySelectorAll('details').length,chart:!!modal.querySelector('svg'),draft:document.getElementById('draft').value,underlying:document.getElementById('modal-exercise').classList.contains('open'),filtered:!!document.getElementById('tb-progress-exercise').value};})()`);
    assert(check.visible&&check.within&&check.chart&&check.filtered&&check.underlying,JSON.stringify({theme,width,check}));assert.equal(check.records,50);assert.equal(check.draft,'Rascunho ainda não salvo');
    const contrast=await evaluate(`(() => {
      const lum=color=>{const values=color.match(/[\\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return values[0]*.2126+values[1]*.7152+values[2]*.0722;};
      return [...document.querySelectorAll('#modal-trainer-progress h2,#modal-trainer-progress h3,#modal-trainer-progress strong,#modal-trainer-progress label,#modal-trainer-progress button')].filter(e=>!e.hidden).map(e=>{let p=e;while(p&&getComputedStyle(p).backgroundColor==='rgba(0, 0, 0, 0)')p=p.parentElement;const a=lum(getComputedStyle(e).color),b=lum(getComputedStyle(p).backgroundColor);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);});
    })()`);
    assert(Math.min(...contrast)>=4.5,`${theme}/${width}: text contrast ${Math.min(...contrast)}`);
    await evaluate('TRAINER_PROGRESS.limit+=50;renderTrainerProgress()');assert.equal(await evaluate('document.querySelectorAll("#tb-progress-content details").length'),60);
    if(screenshotDir){fs.writeFileSync(path.join(screenshotDir,`${theme}-${width}.png`),Buffer.from((await command('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false})).data,'base64'));}
    await evaluate('closeTrainerProgress()');assert(await evaluate('!document.getElementById("modal-trainer-progress") && document.getElementById("draft").value === "Rascunho ainda não salvo"'));
    await evaluate('CURRENT_USER.role="student";openTrainerProgress()');assert(await evaluate('!document.getElementById("modal-trainer-progress")'));
    results.push({theme,width});
  }
  console.log(`PASS ${results.length} browser scenarios: trainer panel, exercise filter, chart, pagination, preserved editor draft, student denied, responsive in both themes.`);
} finally {
  if(socket?.readyState===1){try{await command('Browser.close');}catch{}socket.close();}
  chrome.kill();
  server.close();
  // Only the randomly created isolated Chrome profile is disposable.
  if(path.dirname(profile)===os.tmpdir()&&path.basename(profile).startsWith('tb-login-css-')){
    for(let i=0;i<8;i++){try{fs.rmSync(profile,{recursive:true,force:true});break;}catch{await sleep(150);}}
  }
}
