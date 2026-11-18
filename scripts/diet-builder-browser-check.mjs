import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {waitForChromePage} from './chrome-readiness.mjs';

const setup=`
window.errors=[];window.warnings=[];window.messages=[];window.addEventListener('error',e=>errors.push(e.message));window.addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));console.warn=(...a)=>warnings.push(a.map(String).join(' '));
let CURRENT_USER={uid:'coach',role:'trainer'},DIET_CONTEXT={targetUid:'student',trainer:true},MEAL_CTX={canEditContent:true,listId:'meals-list'},EDIT_MEAL_ID=null;
let MEAL_PLAN_CACHE={meals:[]};const plan={id:'diet',variants:[{id:'training',meals:[]}]};let DIET_DOCUMENT={plans:[plan]};const currentDiet=()=>plan,currentDietVariant=()=>plan.variants[0];
const showToast=m=>messages.push(m),cloudWriteError=e=>e.message,confirm=()=>true;
function openModal(id){document.getElementById(id).classList.add('open');}function closeModal(id){document.getElementById(id)?.classList.remove('open');}
function openAddMealModal(){EDIT_MEAL_ID=null;['input-meal-items','input-meal-time','input-meal-notes'].forEach(id=>document.getElementById(id).value='');openModal('modal-meal');}
window.remote={trainerId:'coach',dietPortionItems:[],items:[{id:'supplement'}]};window.writes=0;window.failReads=false;
const firebase={firestore:{FieldValue:{serverTimestamp:()=>123}}},cloudWrite=p=>p,cloudGet=ref=>ref.get();
const db={collection:name=>({doc:id=>({name,id,get:async()=>{if(failReads)throw new Error('unavailable');return{exists:true,data:()=>structuredClone(remote)};}})}),runTransaction:async task=>{let staged;await task({get:ref=>ref.get(),set:(ref,data)=>staged=structuredClone(data)});if(staged){remote={...remote,...staged};writes++;}}};
function renderMealsList(){}window.saveMeal=()=>{};
window.TeamBullsPdfExport={};window.TeamBullsDietLiveDeficit={refresh(){}};
`;
const files={
  '/portions.js':'modules/diet-portion-presets-v10_10_9.js','/personal.js':'modules/diet-personalization-v10_10_11.js',
  '/live.js':'modules/diet-live-calories-v10_10_11.js','/bridge.js':'modules/custom-food-calorie-bridge-v10_10_12.js','/workspace.js':'modules/trainer-diet-workspace-v10_10_11.js'
};
const html='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body><div id="modal-meal" class="modal-backdrop"><div class="modal-sheet"><div class="modal-handle"></div><div class="modal-title" id="modal-meal-title">Nova refeição</div><div class="form-group"><label class="form-label">Horário</label><input id="input-meal-time" type="time" class="form-input"></div><div class="form-group"><label class="form-label">Alimentos</label><textarea class="form-input" id="input-meal-items" maxlength="5000" rows="6"></textarea></div><div class="form-group"><label class="form-label">Observações</label><textarea id="input-meal-notes" class="form-input"></textarea></div><button class="btn-primary" onclick="saveMeal()">SALVAR</button></div></div><script src="/setup.js"></script>'+Object.keys(files).map(url=>'<script src="'+url+'"></script>').join('')+'<script>openAddMealModal();</script></body></html>';
const server=http.createServer((req,res)=>{let content,type='text/javascript';if(req.url==='/'){content=html;type='text/html';}else if(req.url==='/setup.js')content=setup;else if(req.url==='/styles.css'){content=fs.readFileSync('styles_v10_10_9.css');type='text/css';}else if(files[req.url])content=fs.readFileSync(files[req.url]);else{res.writeHead(404);res.end();return;}res.setHeader('Content-Type',type+';charset=utf-8');res.end(content);});
const executable=process.env.CHROME_BIN||(process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':['google-chrome','chromium','chromium-browser'].map(name=>spawnSync('which',[name],{encoding:'utf8'}).stdout?.trim()).find(Boolean));
assert(executable&&fs.existsSync(executable),'Chrome is required');
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'tb-diet-builder-'));
const args=['--headless=new','--no-first-run','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'];if(process.platform!=='win32')args.push('--no-sandbox');
const chrome=spawn(executable,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});let stderr='',socket,sequence=0;chrome.stderr.on('data',chunk=>stderr+=chunk);const calls=new Map();
function command(method,params={}){const id=++sequence;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{calls.delete(id);reject(new Error('Chrome timeout: '+method));},10000);calls.set(id,message=>{clearTimeout(timer);message.error?reject(new Error(JSON.stringify(message.error))):resolve(message.result);});socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert(!result.exceptionDetails,JSON.stringify(result.exceptionDetails));return result.result.value;}
async function until(expression){for(let i=0;i<120;i++){if(await evaluate(expression))return;await pause(25);}throw new Error('Diet UI not ready: '+expression+' '+JSON.stringify(await evaluate('errors')));}
try{
  socket=new WebSocket(await waitForChromePage(chrome,profile,{stderr:()=>stderr}));await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});socket.onmessage=event=>{const message=JSON.parse(event.data),cb=calls.get(message.id);if(cb){calls.delete(message.id);cb(message);}};
  await command('Page.enable');await command('Network.enable');await command('Network.setBlockedURLs',{urls:['https://*']});
  for(const width of [320,390,1440])for(const theme of ['dark','light']){
    await command('Emulation.setDeviceMetricsOverride',{width,height:900,mobile:width<768,deviceScaleFactor:1});
    const origin=await evaluate('performance.timeOrigin');await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
    await until(`performance.timeOrigin!==${origin}&&!!document.querySelector('[data-custom-food-list]')&&!!document.getElementById('tb-trainer-diet-workspace-summary')?.textContent`);
    await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)};document.body.dataset.theme=${JSON.stringify(theme)}`);
    assert.match(await evaluate("document.getElementById('tb-meal-portion-search').placeholder"),/carboidrato/);
    await evaluate("(()=>{const input=document.getElementById('tb-meal-portion-search');input.value='carboidrato';input.dispatchEvent(new Event('input',{bubbles:true}));})()");
    assert.equal(await evaluate("document.querySelectorAll('[data-portion-rows] tr').length"),8);
    await evaluate("[...document.querySelectorAll('[data-portion-rows] tr')].find(row=>row.querySelector('.tb-portion-label').textContent==='1 Porção de Carboidrato').querySelector('.primary').click()");
    assert.equal(await evaluate("document.getElementById('input-meal-items').value"),'1 Porção de Carboidrato');
    await until("document.getElementById('tb-trainer-diet-workspace-summary').textContent.includes('126')");
    assert.equal(await evaluate("TeamBullsDietLiveCalories.analyze(document.getElementById('input-meal-items').value).carbs"),28);
    await evaluate("document.querySelector('.tb-custom-head button').click();document.getElementById('tb-custom-food-label').value='200ml Leite';document.getElementById('tb-custom-food-protein').value='6';document.getElementById('tb-custom-food-carbs').value='8';document.getElementById('tb-custom-food-fat').value='3';document.querySelector('#tb-custom-food-modal .btn-primary').click()");
    await until("remote.dietPortionItems.length===1&&!document.getElementById('tb-custom-food-modal').classList.contains('open')");
    await until("!!document.querySelector('.tb-custom-actions button')");
    await evaluate("document.querySelector('.tb-custom-actions button').click()");
    assert.equal(await evaluate("document.getElementById('input-meal-items').value"),'1 Porção de Carboidrato\n200ml Leite');
    await until("TeamBullsDietLiveCalories.analyze(document.getElementById('input-meal-items').value).matched===2");
    assert.deepEqual(await evaluate("(()=>{const r=TeamBullsDietLiveCalories.analyze(document.getElementById('input-meal-items').value);return{protein:r.protein,carbs:r.carbs,fat:r.fat,kcal:r.kcal};})()"),{protein:9,carbs:36,fat:3.2,kcal:209});
    await evaluate("document.querySelector('.tb-custom-actions .danger').click()");
    await until("remote.dietPortionItems.length===0&&TeamBullsDietLiveCalories.analyze('200ml Leite').matched===0");
    assert.deepEqual(await evaluate('remote.items'),[{id:'supplement'}]);
    // IDs loaded from old catalogs are data, including quotes, never inline JavaScript.
    await evaluate("remote.dietPortionItems=[{id:\"quoted'\\\"id\",label:'Alimento com ID antigo',protein:5,carbs:0,fat:0}];TeamBullsDietPersonalization.refresh()");
    await until("document.querySelector('.tb-custom-table')?.textContent.includes('Alimento com ID antigo')");
    await evaluate("document.querySelector('.tb-custom-actions button').click()");assert.match(await evaluate("document.getElementById('input-meal-items').value"),/Alimento com ID antigo/);
    await until("document.getElementById('tb-trainer-diet-workspace-summary').textContent.includes('2 item(ns) calculado(s)')");
    const contrast=await evaluate("(()=>{const lum=c=>{const v=c.match(/[\\d.]+/g).slice(0,3).map(n=>{n=Number(n)/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});return v[0]*.2126+v[1]*.7152+v[2]*.0722;};return ['.modal-title','.tb-custom-table th','.tb-custom-table td'].map(sel=>{const el=document.querySelector(sel),color=getComputedStyle(el).color;return (lum(color)+.05)/(lum('rgb(13,13,13)')+.05);});})()");
    assert(contrast.every(value=>value>=4.5),`Unreadable diet editor text ${theme}: ${contrast}`);
    assert.deepEqual(await evaluate('errors'),[]);assert.deepEqual(await evaluate('warnings'),[]);
    const bounds=await evaluate("(()=>{const modal=document.querySelector('#modal-meal>.modal-sheet'),shell=document.querySelector('.tb-workspace-shell'),a=modal.getBoundingClientRect(),b=shell.getBoundingClientRect();return{left:a.left,right:a.right,shell:b.width,viewport:innerWidth};})()");
    assert(bounds.left>=-1&&bounds.right<=width+1&&bounds.shell<=width+1,JSON.stringify(bounds));
    if(process.env.TB_DIET_SCREENSHOTS){const capture=await command('Page.captureScreenshot',{format:'png'});fs.mkdirSync(process.env.TB_DIET_SCREENSHOTS,{recursive:true});fs.writeFileSync(path.join(process.env.TB_DIET_SCREENSHOTS,`diet-${width}-${theme}.png`),Buffer.from(capture.data,'base64'));}
    console.log(`PASS diet builder ${width}/${theme}: search, add, automatic totals, custom save/delete and quoted legacy ID`);
  }
}finally{
  if(socket?.readyState===1){try{await command('Browser.close');}catch{}socket.close();}chrome.kill();server.close();
  if(path.dirname(profile)===os.tmpdir()&&path.basename(profile).startsWith('tb-diet-builder-'))for(let i=0;i<8;i++){try{fs.rmSync(profile,{recursive:true,force:true});break;}catch{await pause(150);}}
}
