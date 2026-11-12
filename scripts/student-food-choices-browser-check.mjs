import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {waitForChromePage} from './chrome-readiness.mjs';

const core=fs.readFileSync('app_v10_10_9_core.js','utf8');
const slice=(start,end)=>core.slice(core.indexOf(start),core.indexOf(end,core.indexOf(start)));
const setup=`
let CURRENT_USER={uid:'student-test',role:'student'},MODE='local';
const meal={id:'meal-test',items:'0,25 porção de carboidrato\\n1 porção de proteína\\nÁgua'};
const variant={id:'variant-test',meals:[meal]},plan={id:'diet-test',variants:[variant]};
const DIET_CONTEXT={targetUid:'student-test'},MEAL_CTX={targetUid:'student-test',listId:'diet-meals-list',emptyId:'diet-meals-empty',canToggleDone:true};
const MEAL_PLAN_CACHE={meals:[meal]},FOOD_CATALOG_VERSION=2;
const currentDiet=()=>plan,currentDietVariant=()=>variant,today=()=> '2026-11-12',uid=()=>crypto.randomUUID();
const esc=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;'),jsArg=JSON.stringify,isMealDoneToday=()=>false;
const loadFoodOptions=async()=>FOOD_OPTIONS,showToast=()=>{};
async function openDietDetail(){}
${slice('function normalizedName(','function sessionFingerprint(')}
${slice('function defaultFoodOptions(','const DEFAULT_EXERCISE_VIDEO_URLS=')}
const FOOD_OPTIONS=defaultFoodOptions();
${slice('function renderMealsList(','function openAddMealModal(')}
window.errors=[];
window.addEventListener('error',event=>errors.push(event.message));
window.addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
window.mixedRow=()=>[...document.querySelectorAll('[data-tb-food-row]')].find(row=>JSON.parse(row.dataset.tbFoodRow).at(-1)==='misc');
`;
const html='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><main id="app"><div id="diet-meals-list"></div><div id="diet-meals-empty"></div></main><script src="/setup.js"></script><script src="/food.js"></script></body></html>';
const assets={
  '/': ['text/html',html],
  '/setup.js': ['text/javascript',setup],
  '/styles.css': ['text/css',fs.readFileSync('styles_v10_10_9.css')],
  '/food.js': ['text/javascript',fs.readFileSync('modules/student-food-choices-v10_10_64.js')]
};
const server=http.createServer((req,res)=>{
  const asset=assets[req.url];if(!asset){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',asset[0]+';charset=utf-8');res.end(asset[1]);
});
const executable=process.env.CHROME_BIN||(process.platform==='win32'
  ?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  :['google-chrome','chromium','chromium-browser'].map(name=>spawnSync('which',[name],{encoding:'utf8'}).stdout?.trim()).find(Boolean));
assert(executable&&fs.existsSync(executable),'Chrome is required (set CHROME_BIN).');
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'tb-food-choice-'));
const args=['--headless=new','--no-first-run','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'];
if(process.platform!=='win32')args.push('--no-sandbox');
const chrome=spawn(executable,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});
let stderr='',socket,sequence=0;
chrome.stderr.on('data',chunk=>stderr+=chunk);
const calls=new Map();
function command(method,params={}){
  const id=++sequence;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{calls.delete(id);reject(new Error('Chrome timeout: '+method));},10000);
    calls.set(id,message=>{clearTimeout(timer);message.error?reject(new Error(JSON.stringify(message.error))):resolve(message.result);});
    socket.send(JSON.stringify({id,method,params}));
  });
}
async function evaluate(expression){
  const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function ready(previous=0){
  for(let i=0;i<160;i++){
    if(await evaluate(`performance.timeOrigin!==${previous}&&window.mixedRow?.()?.querySelector('select')?.disabled===false`))return;
    await pause(25);
  }
  throw new Error('Food selector did not become ready: '+JSON.stringify(await evaluate('window.errors||[]')));
}
try{
  socket=new WebSocket(await waitForChromePage(chrome,profile,{stderr:()=>stderr}));
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=event=>{const message=JSON.parse(event.data),callback=calls.get(message.id);if(callback){calls.delete(message.id);callback(message);}};
  await command('Page.enable');await command('Network.enable');await command('Network.setBlockedURLs',{urls:['https://*']});
  await command('Emulation.setDeviceMetricsOverride',{width:360,height:800,mobile:true,deviceScaleFactor:1});
  await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
  await ready();
  assert(await evaluate("Array.from(mixedRow().querySelector('select').options).find(o=>o.text.startsWith('Salmão')).disabled"));
  await evaluate("mixedRow().querySelector('summary').click()");
  await pause(30);
  await evaluate("(()=>{const s=mixedRow().querySelector('select');s.value=Array.from(s.options).find(o=>o.text.startsWith('Leite desnatado')).value;s.dispatchEvent(new Event('change',{bubbles:true}));})()");
  assert.deepEqual(await evaluate("({open:mixedRow().querySelector('details').open, value:mixedRow().querySelector('input').value, max:mixedRow().querySelector('input').max, quantity:mixedRow().querySelector('[data-tb-food-quantity]').textContent})"),{open:true,value:'0.5',max:'0.5',quantity:'125 ml'});
  const enter=value=>evaluate(`(()=>{const input=mixedRow().querySelector('input');input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));return mixedRow().querySelector('[data-tb-food-save]').disabled;})()`);
  assert.equal(await enter('1'),true);
  assert.equal(await enter('0.5'),false);
  await evaluate("mixedRow().querySelector('[data-tb-food-save]').click()");
  assert.match(await evaluate("document.getElementById('diet-meals-list').textContent"),/carboidrato · coberta pelos alimentos diversos.*proteína · restam 0,75/);
  const previous=await evaluate('performance.timeOrigin');await command('Page.reload');await ready(previous);
  assert.match(await evaluate("mixedRow().querySelector('summary').textContent"),/125 ml/);
  await evaluate("mixedRow().querySelector('summary').click();mixedRow().querySelector('[data-tb-food-clear]').click()");
  assert.doesNotMatch(await evaluate("document.getElementById('diet-meals-list').textContent"),/coberta pelos alimentos diversos|restam 0,75/);
  assert.deepEqual(await evaluate('errors'),[]);
  console.log('PASS Chrome mobile: missing macro disabled, 125 ml auto-fit, excess blocked, balance reduced, reload restored and removal reapplied the original portions.');
} finally{
  if(socket?.readyState===1){try{await command('Browser.close');}catch{}socket.close();}
  chrome.kill();server.close();
  if(path.dirname(profile)===os.tmpdir()&&path.basename(profile).startsWith('tb-food-choice-')){
    for(let i=0;i<8;i++){try{fs.rmSync(profile,{recursive:true,force:true});break;}catch{await pause(150);}}
  }
}
