// Click-level regression on real app markup, photo wrappers and catalog actions.
import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';import http from 'node:http';import os from 'node:os';import path from 'node:path';import {spawn,spawnSync} from 'node:child_process';import {waitForChromePage} from './chrome-readiness.mjs';
const core=fs.readFileSync('app_v10_10_9_core.js','utf8');
function fn(name){const start=core.indexOf(`function ${name}(`);assert(start>=0,name);const line=core.slice(start).split('\n')[0].trimEnd(),prefix=core.slice(start-6,start)==='async '?'async ':'';return prefix+(line.endsWith('}')?line:core.slice(start,core.indexOf('\n}',start)+2));}
const names=['normalizedName','renderWorkoutMuscleChoices','normalizeDietMeal','normalizeDietVariant','currentDiet','currentDietVariant','v104ActivateVariantMeals','renderDietVariantTabs','persistDietDocumentDraft','shouldAutoFocusEditor','capturePhotoReadContext','photoReadContextCurrent','beginPhotoViewRequest','photoViewRequestCurrent','openPhotoView','openComparePhotos','runComparePhotos','openModal','closeModal','showConfirm','beginAction','endAction','captureCatalogEditor','commitCatalogAction','catalogPreserveFields','persistSharedCatalog','persistGeneralInstructions','persistTechniqueCatalog','cacheGeneralInstructions','cacheTechniqueCatalog','saveInstructionFolder','saveInstructionItem','deleteInstructionItem','saveTechnique','deleteTechnique','renderInstructions','renderTechniques','instructionVideoAction','openInstructionFolderModal','openInstructionItemModal','openTechniqueEditor'];
const markup=fs.readFileSync('index.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'').replace(/<link\b[^>]*>/g,'');
const muscleSource=core.slice(core.indexOf('const WORKOUT_MUSCLE_GROUPS='),core.indexOf('function safeWorkoutGuidance('));
const focusWrappers=core.slice(core.indexOf('const V106_MODAL_RETURN_FOCUS='),core.indexOf("document.addEventListener('keydown',event=>",core.indexOf('const V106_MODAL_RETURN_FOCUS=')));
assert(focusWrappers.includes("V106_MODAL_RETURN_FOCUS.set"));
const setup=`<script>
window.errors=[];window.addEventListener('error',e=>errors.push(e.message));window.alerts=[];window.alert=e=>alerts.push(String(e));
let CURRENT_USER={uid:'coach',role:'trainer'},VIEW_STUDENT={uid:'student',name:'Aluno teste'},MODE='cloud',NAVIGATION_SEQ=1,PHOTOS_CACHE_UID='student',CUR_PHOTO_ID=null,PHOTO_VIEW_REQUEST=0,PHOTO_COMPARE_REQUEST=0,TRAINING_RECOMMENDATIONS_CONTEXT=null,MODAL_TARGET='student';
let PHOTOS_CACHE=[{id:'a',userId:'student',date:'2026-11-02',weight:80,dataUrl:'/download-a.png'},{id:'b',userId:'student',date:'2026-10-01',weight:85,dataUrl:'/download-b.png'}];
let GENERAL_INSTRUCTIONS={revision:1,folders:[{id:'f1',name:'Original',active:true,items:[{id:'i1',title:'Orientação',text:'Texto',active:true}]}]},TECHNIQUE_CATALOG={revision:1,items:[{id:'t1',code:'T',name:'Original',description:'Descrição'}]},EDIT_INSTRUCTION_FOLDER_ID='f1',EDIT_INSTRUCTION_ITEM_ID='i1',EDIT_TECHNIQUE_ID='t1',INSTRUCTIONS_FORCED=false;
const CATALOG_EDITOR_CONTEXTS={};const GENERAL_INSTRUCTIONS_CACHE_KEY='fixture-instructions',TECHNIQUE_CATALOG_CACHE_KEY='fixture-techniques',ACTION_LOCKS=new Set();
let fixtureIds=0;
const normalizeGeneralInstructions=s=>structuredClone(s),normalizeTechniqueCatalog=s=>structuredClone(s),uid=()=> 'new-item-'+(++fixtureIds),extractYouTubeId=()=>true,fmt=s=>s,showToast=()=>{},storageSet=(key,value)=>{localStorage.setItem(key,value);return true;};
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}const jsArg=s=>esc(JSON.stringify(s));
window.pendingHigh={};window.pendingThumb={};window.deferThumb=false;
function resolvePhotoSource(record,{full=false}={}){if(full)return new Promise(resolve=>(pendingHigh[record.id]??=[]).push(resolve));if(deferThumb)return new Promise(resolve=>(pendingThumb[record.id]??=[]).push(resolve));return Promise.resolve('/thumb-'+record.id+'.png');}
window.release=(id,thumb=false)=>{const queue=thumb?pendingThumb:pendingHigh;const resolve=queue[id]?.shift();if(!resolve)throw new Error('Missing photo request '+id);resolve('/'+(thumb?'thumb-':'full-')+id+'.png');};
const ensureStorageService=async()=>null,withTimeout=p=>p,safePhotoPath=()=>'',safePhotoDataUrl=s=>s||'';
window.downloads=[];window.fetch=async url=>{downloads.push(String(url));return {ok:true,blob:async()=>new Blob(['fake'],{type:'image/jpeg'})};};HTMLAnchorElement.prototype.click=function(){downloads.push(this.download);};
window.failWrites=false;window.writes=0;let remoteLibraries={};const firebase={firestore:{FieldValue:{serverTimestamp:()=>123}}},cloudWrite=async p=>p,db={collection:collection=>({where:()=>({collection}),doc:()=>({collection})}),runTransaction:async task=>{let staged;await task({get:async ref=>({exists:true,data:()=>remoteLibraries[ref.collection]||structuredClone(ref.collection==='trainingInstructions'?GENERAL_INSTRUCTIONS:TECHNIQUE_CATALOG)}),set:(ref,payload)=>{staged={ref,payload};}});if(staged){if(failWrites)throw new Error('Sem conexão (simulada)');remoteLibraries[staged.ref.collection]=structuredClone(staged.payload);delete remoteLibraries[staged.ref.collection].updatedAt;writes++;}}};

let DIET_CONTEXT={targetUid:'student',trainer:true,local:false},CURRENT_DIET_ID='diet-fixture',CURRENT_DIET_VARIANT_ID='training',AUTH_STATE_REVISION=1;
const DIET_SECTION_DEFS=[],MEAL_PLAN_CACHE={meals:[]},MEAL_CTX={};
let DIET_DOCUMENT={plans:[{id:'diet-fixture',name:'Dieta',isActive:true,variants:[
{id:'training',name:'Dia de treino',daysPerWeek:5,weekdays:[1,2,3,4,5],dayType:'training',order:0,meals:[
{id:'meal-1',name:'Café',time:'08:00',items:'100 g de arroz',notes:'Orientação',doneDates:['2026-11-16']},
{id:'meal-2',name:'Almoço',time:'12:00',items:'2 porções de carboidrato',doneDates:[]}]},
{id:'rest',name:'Dia sem treino',daysPerWeek:2,weekdays:[0,6],dayType:'rest',order:1,meals:[]}],meals:[]}]};
const dietCanEdit=()=>CURRENT_USER?.role==='trainer'&&DIET_CONTEXT.trainer;
const normalizeDietDocument=value=>structuredClone(value);
const v104DietDistribution=plan=>({total:plan.variants.reduce((sum,v)=>sum+v.daysPerWeek,0)});
const dietVariantForDate=()=>null,today=()=> '2026-11-17';
const dietVariantDayLabel=()=>'',dietVariantWorkoutLabels=()=>[],renderDietEnergySummary=()=>{};
const renderMealsList=()=>{document.getElementById(MEAL_CTX.listId).textContent=MEAL_PLAN_CACHE.meals.map(m=>m.name+' '+m.items).join(' | ');};
window.dietCopyWrites=[];
async function persistNormalizedDietDocument(data,context){
  if(failWrites)throw new Error('Sem conexão (simulada)');
  dietCopyWrites.push({data:structuredClone(data),context:structuredClone(context)});return data;
}
function openEditDietVariantModal(id){document.getElementById('input-diet-variant-name').value=currentDiet().variants.find(v=>v.id===id).name;openModal('modal-diet-variant');}

${muscleSource}
${names.map(fn).join('\n')}
${focusWrappers}
function showScreen(id){document.querySelectorAll('.screen').forEach(el=>el.classList.toggle('active',el.id===id));}
function viewWeeklyCheckin(){}
function viewQuestionnaire(){}
const CHECKIN_POSES=['Frente','Costas'];let WEEKLY_CHECKINS=[{id:'weekly',studentId:'student',weight:80,submittedDate:'2026-11-17',photoIds:['a','b'],questions:['Como foi?'],answers:['Bem']}];
let TS_QUEST_CACHE=[{id:'quest',studentId:'student',answered:true,photoIds:['a','b'],questions:['Como foi?'],answers:['Bem']}];
const fetchWeeklyCheckins=async()=>WEEKLY_CHECKINS;
function cloudGet(reference){return Promise.resolve(reference.collection==='questionnaires'?{docs:TS_QUEST_CACHE.map(item=>({id:item.id,data:()=>item}))}:{exists:true,data:()=>({studentNotes:{student:{text:'Rascunho salvo'}}})});}
cacheGeneralInstructions();cacheTechniqueCatalog();document.querySelectorAll('.screen').forEach(e=>e.classList.remove('active'));document.getElementById('screen-photos').classList.add('active');
</script><script src="/quality.js"></script><script src="/photo-ux.js"></script>`;
const setupScript=setup.slice(8,setup.indexOf('</script>'));new vm.Script(setupScript);
const fixture=markup.replace('</head>','<link rel="stylesheet" href="/styles_v10_10_9.css"></head>').replace('</body>','<script src="/fixture.js"></script><script src="/quality.js"></script><script src="/photo-ux.js"></script><script src="/diet-copy.js"></script><script src="/modal-stack.js"></script><script src="/interaction.js"></script><script src="/form-guard.js"></script><script src="/preopen.js"></script><script src="/workspace.js"></script></body>');
const routes=new Map([['/form-guard.js','modules/modal-form-guard-v10_10_9.js'],['/workspace.js','modules/trainer-workspace-v10_10_9.js'],['/diet-copy.js','modules/diet-copy-v10_10_28.js'],['/quality.js','modules/photo-quality-download-v10_10_9.js'],['/photo-ux.js','modules/report-photo-ux-v10_10_10.js'],['/modal-stack.js','modules/modal-stack-stability-v10_10_9.js'],['/interaction.js','interaction_v10_10_9.js'],['/styles_v10_10_9.css','styles_v10_10_9.css']]);
const preopenScript='if(new URLSearchParams(location.search).has("late-reference"))document.addEventListener("DOMContentLoaded",()=>openModal("modal-weekly-checkin-view"),{once:true});';
const server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/preopen.js'){res.setHeader('Content-Type','text/javascript');return res.end(preopenScript);}if(pathname==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(setupScript);}if(pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(fixture);}if(pathname.endsWith('.png')){res.setHeader('Content-Type','image/png');return res.end(fs.readFileSync('icon-192-v9-8.png'));}const file=routes.get(pathname);if(!file){res.writeHead(404);return res.end();}res.setHeader('Content-Type',pathname.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(file));});
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
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<800,screenOrientation:{type:width<800?'portraitPrimary':'landscapePrimary',angle:width<800?0:90}});
    await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
    for(let i=0;i<60;i++){if(await evaluate('document.readyState === "complete" && !!window.TeamBullsReportPhotoUX && !!window.TeamBullsNavigation'))break;await sleep(50);}
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
    for(const [openReport,modalId] of [['viewWeeklyCheckin("weekly")','modal-weekly-checkin-view'],['viewQuestionnaire("quest",true)','modal-view-quest']]){
      await evaluate(openReport);
      await sleep(80);
      for(const [photo,method] of [['a','button'],['b','back'],['a','button']]){
        const before=await evaluate(`(()=>{
          const modal=document.getElementById("${modalId}");
          const first=modal.querySelector('[data-tb-report-photo="${photo}"]');
          const panel=modal.querySelector('.modal-sheet');
          panel.scrollTop=110;modal.scrollTop=110;
          first.focus({preventScroll:true});
          window.reportPhotoOpener=first;
          return {key:history.state.key,html:modal.innerHTML,scroll:modal.scrollTop,panelScroll:panel.scrollTop,length:history.length};
        })()`);
        await evaluate(`reportPhotoOpener.click()`);
        await sleep(30);
        const openedKey=await evaluate('history.state.key');
        await evaluate(`release("${photo}")`);
        await sleep(50);
        assert.equal(await evaluate('history.state.key'),openedKey,'The original replacing the thumbnail cannot push another photo entry');
        assert(await evaluate(`document.getElementById("${modalId}").classList.contains('open')`),'Opening the photo must keep the report mounted');
        if(method==='button'){
          await sleep(250);
          await evaluate(`document.querySelector('#modal-photo-view button[onclick*="closeModal"]').scrollIntoView({block:'center'});new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
          const point=await evaluate(`(()=>{
            const button=document.querySelector('#modal-photo-view button[onclick*="closeModal"]');
            button.scrollIntoView({block:'center'});
            const rect=button.getBoundingClientRect();
            return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};
          })()`);
          assert(await evaluate(`!!document.elementFromPoint(${point.x},${point.y})?.closest('#modal-photo-view button')`),`Close button is obscured: ${JSON.stringify(await evaluate(`({point:document.elementFromPoint(${point.x},${point.y})?.outerHTML?.slice(0,400),box:document.querySelector('#modal-photo-view').getBoundingClientRect().toJSON(),pointX:${point.x},pointY:${point.y}})`))}`);
          await command('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
          await command('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
        }else await evaluate('history.back()');
        for(let i=0;i<100;i++){if(await evaluate(`history.state.key===${JSON.stringify(before.key)}`))break;await sleep(20);}
        await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        const after=await evaluate(`(()=>{
          const modal=document.getElementById("${modalId}");
          return {open:modal.classList.contains('open'),photoOpen:document.getElementById('modal-photo-view').classList.contains('open'),
            key:history.state.key,html:modal.innerHTML,scroll:modal.scrollTop,panelScroll:modal.querySelector('.modal-sheet').scrollTop,
            focus:document.activeElement===reportPhotoOpener,focusLabel:document.activeElement?.outerHTML?.slice(0,180),layers:[...document.querySelectorAll('.modal-backdrop.open')].map(m=>[m.id,m.dataset.tbModalOpenSeq,m.style.pointerEvents]),pointer:getComputedStyle(modal).pointerEvents};
        })()`);
        assert(after.open&&!after.photoOpen,`Close/back ${modalId}/${photo}/${method}/${width}: ${JSON.stringify({...after,html:undefined})}`);
        assert.equal(after.key,before.key,'The history must point to the same report');
        assert.equal(after.html,before.html,'Closing a photo must preserve all photos and answers');
        assert.equal(after.scroll,before.scroll,'The report scroll position must be preserved');
        assert.equal(after.panelScroll,before.panelScroll,'The sheet scroll position must be preserved');
        assert(after.focus&&after.pointer==='auto',`Focus ${modalId}/${photo}/${method}/${width}: ${JSON.stringify({...after,html:undefined})}`);
      }
      await evaluate(`closeModal("${modalId}")`);
      await sleep(80);
    }
    assert.deepEqual(await evaluate('window.errors'),[]);

    await evaluate('showScreen("screen-ts-diet-detail");renderDietVariantTabs(true);v104ActivateVariantMeals(true)');
    assert.equal(await evaluate('document.querySelectorAll("#ts-diet-variant-tabs .tb-diet-copy-btn").length'),2);
    await evaluate('window.beforeDiet=structuredClone(DIET_DOCUMENT);document.querySelector("#ts-diet-variant-tabs .tb-diet-copy-btn").click()');
    assert.equal(await evaluate('document.getElementById("diet-copy-target").value'),'rest');
    await sleep(300);await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    const copyBounds=await evaluate('(()=>{const r=document.querySelector("#modal-diet-variant-copy .modal-sheet").getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight};})()');
    assert(copyBounds.left>=0&&copyBounds.right<=copyBounds.width&&copyBounds.top>=0&&copyBounds.bottom<=copyBounds.height,'Copy dialog must fit the viewport');
    if(screenshotDir){const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(screenshotDir,'day-copy-'+width+'.png'),Buffer.from(shot.data,'base64'));}
    const copyButton=await evaluate('(()=>{const b=document.querySelector("#modal-diet-variant-copy .btn-primary"),r=b.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2,hit:document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===b};})()');
    assert(copyButton.hit,'Copy action must be reachable by a real pointer');
    await command('Input.dispatchMouseEvent',{type:'mousePressed',x:copyButton.x,y:copyButton.y,button:'left',clickCount:1});
    await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:copyButton.x,y:copyButton.y,button:'left',clickCount:1});await sleep(100);
    assert.equal(await evaluate('dietCopyWrites.length'),1);
    assert(await evaluate('JSON.stringify(DIET_DOCUMENT.plans[0].variants[0])===JSON.stringify(beforeDiet.plans[0].variants[0])'));
    assert(await evaluate('currentDietVariant().id==="rest"&&MEAL_PLAN_CACHE.meals.length===2&&MEAL_PLAN_CACHE.meals.every(m=>m.doneDates.length===0)&&new Set(MEAL_PLAN_CACHE.meals.map(m=>m.id)).size===2'));
    assert(await evaluate('DIET_DOCUMENT.plans[0].variants[1].weekdays.join()===beforeDiet.plans[0].variants[1].weekdays.join()'));
    await evaluate('document.querySelector("#ts-diet-variant-tabs .tb-diet-copy-btn").click();document.querySelector("#modal-diet-variant-copy .btn-primary").click()');
    assert(await evaluate('document.getElementById("modal-confirm").classList.contains("open")'),'Existing meals need confirmation');
    assert.equal(await evaluate('dietCopyWrites.length'),1);
    await evaluate('closeModal("modal-confirm")');await sleep(100);
    assert(await evaluate('document.getElementById("modal-diet-variant-copy").classList.contains("open")'),'Canceling replacement must return to day selection');
    await evaluate('failWrites=true;document.querySelector("#modal-diet-variant-copy .btn-primary").click();document.getElementById("confirm-ok-btn").click()');await sleep(100);
    assert.equal(await evaluate('dietCopyWrites.length'),1,'Failed copy must preserve existing meals');
    assert(await evaluate('!document.getElementById("confirm-ok-btn").disabled'),'Failed copy must allow retry');
    await evaluate('failWrites=false;document.getElementById("confirm-ok-btn").click()');await sleep(100);
    assert.equal(await evaluate('dietCopyWrites.length'),2);
    assert(await evaluate('!document.getElementById("modal-diet-variant-copy").classList.contains("open")&&!document.getElementById("modal-confirm").classList.contains("open")'));
    await evaluate('document.querySelector("#ts-diet-variant-tabs .tb-diet-copy-btn").click();document.getElementById("diet-copy-target").value="";document.getElementById("diet-copy-target").dispatchEvent(new Event("change"));document.getElementById("diet-copy-name").value="Carbo médio";document.querySelector("#modal-diet-variant-copy .btn-primary").click()');await sleep(100);
    assert.equal(await evaluate('dietCopyWrites.length'),3);
    assert(await evaluate('currentDiet().variants.length===3&&currentDietVariant().name==="Carbo médio"&&currentDietVariant().daysPerWeek===0'));
    assert(await evaluate('document.getElementById("modal-diet-variant").classList.contains("open")'),'New division must offer day scheduling');
    await evaluate('closeModal("modal-diet-variant");CURRENT_USER.role="student";renderDietVariantTabs(false)');await sleep(80);
    assert.equal(await evaluate('document.querySelectorAll("#diet-variant-tabs .tb-diet-copy-btn").length'),0);
    assert.equal(await evaluate('TeamBullsDietCopy.openVariantCopy("training")'),false);
    await evaluate('CURRENT_USER.role="trainer"');

    await evaluate('renderWorkoutMuscleChoices(["Bíceps","Tríceps","Ombros","Trapézio"]);openModal("modal-day")');await sleep(300);
    assert.deepEqual(await evaluate('[...document.querySelectorAll("#day-muscle-group-options input")].map(el=>el.dataset.muscleGroup)'),['Peito','Costas','Ombros e trapézios','Braços','Abdômen','Quadríceps','Posteriores','Glúteos','Panturrilhas','Abdutores']);
    assert.deepEqual(await evaluate('[...document.querySelectorAll("#day-muscle-group-options input:checked")].map(el=>el.dataset.muscleGroup)'),['Ombros e trapézios','Braços']);
    await evaluate('closeModal("modal-day")');await sleep(80);

    await evaluate('showScreen("screen-ts-day");openModal("modal-exercise");TeamBullsTrainerWorkspace.sync();TeamBullsTrainerWorkspace.openNote()');await sleep(100);
    await evaluate('document.getElementById("tb-private-note-text").value="Rascunho em edição";document.getElementById("tb-private-note-text").dispatchEvent(new Event("input"));TeamBullsTrainerWorkspace.openReports()');await sleep(100);
    await evaluate('document.querySelector("#tb-trainer-reports-content [data-tb-weekly]").click()');await sleep(120);
    assert(await evaluate('document.getElementById("tb-trainer-reports-modal").classList.contains("open")'),'Opening a report must preserve the reference list');
    await evaluate('void openPhotoView("a",true)');await sleep(60);await evaluate('release("a");openModal("modal-exercise");TeamBullsTrainerWorkspace.sync()');await sleep(350);
    for(const id of ['tb-trainer-note-modal','tb-trainer-reports-modal','modal-weekly-checkin-view','modal-photo-view','modal-exercise'])assert(await evaluate('document.getElementById('+JSON.stringify(id)+').classList.contains("open")'),'All requested windows must stay open: '+id);
    if(width>=1200){
      assert(await evaluate('document.getElementById("tb-trainer-tools").classList.contains("visible")'),'Reference tools must stay accessible while editing');
      const panels=await evaluate('(()=>{const ids=["modal-exercise","modal-photo-view","tb-trainer-note-modal"];return ids.map(id=>{const modal=document.getElementById(id),r=modal.querySelector(".modal-sheet").getBoundingClientRect();return{id,left:r.left,right:r.right,top:r.top,bottom:r.bottom,pointer:getComputedStyle(modal).pointerEvents};});})()');
      assert(panels.every(r=>r.left>=0&&r.right<=width&&r.top>=0&&r.bottom<=height),JSON.stringify(panels));
      assert(panels[0].right<=panels[1].left&&panels[1].bottom<=panels[2].top,'Editor, photo and note must occupy separate areas');
      const point=await evaluate('(()=>{const el=document.getElementById("tb-private-note-text"),r=el.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+20,hit:document.elementFromPoint(r.left+r.width/2,r.top+20)===el};})()');
      assert(point.hit,'Draft must remain clickable while the exercise editor is open');
      await command('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1});
      await command('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',clickCount:1});
      if(screenshotDir){const shot=await command('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(screenshotDir,'workspace-'+width+'.png'),Buffer.from(shot.data,'base64'));}
    }
    if(width>=1200){
      await evaluate('document.querySelector("#modal-exercise .form-input").focus()');
      await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
      await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    }else await evaluate('closeModal("modal-exercise")');
    await sleep(120);
    assert(await evaluate('!document.getElementById("modal-exercise").classList.contains("open")'),'Closing the editor must affect that editor alone');
    for(const id of ['tb-trainer-note-modal','tb-trainer-reports-modal','modal-weekly-checkin-view','modal-photo-view'])assert(await evaluate('document.getElementById('+JSON.stringify(id)+').classList.contains("open")'),'Closing editor must preserve reference: '+id);
    await evaluate(width>=1200?'document.querySelector("#modal-photo-view .tb-workspace-close").click()':'closeModal("modal-photo-view")');await sleep(120);
    assert(await evaluate('document.getElementById("tb-trainer-note-modal").classList.contains("open")&&document.getElementById("modal-weekly-checkin-view").classList.contains("open")'));
    assert.equal(await evaluate('document.getElementById("tb-private-note-text").value'),'Rascunho em edição');
    await evaluate(width>=1200?'document.querySelector("#tb-trainer-note-modal .tb-workspace-close").click()':'closeModal("tb-trainer-note-modal")');await sleep(100);
    assert(await evaluate('document.getElementById("modal-weekly-checkin-view").classList.contains("open")'),'Closing the note must preserve the report');
    await evaluate('TeamBullsTrainerWorkspace.openNote()');await sleep(80);
    assert.equal(await evaluate('document.getElementById("tb-private-note-text").value'),'Rascunho em edição','Reopening a draft must preserve unsaved text');
    await evaluate('showScreen("screen-ts-exercise")');await sleep(80);await evaluate('history.back()');await sleep(150);
    assert(await evaluate('document.getElementById("tb-trainer-note-modal").classList.contains("open")&&document.getElementById("modal-weekly-checkin-view").classList.contains("open")'),'Changing prescription screens and returning must preserve references for the same student');
    await evaluate('closeModal("tb-trainer-note-modal");closeModal("modal-weekly-checkin-view");closeModal("tb-trainer-reports-modal")');await sleep(150);
    await evaluate('TeamBullsTrainerWorkspace.openNote()');await sleep(80);
    await evaluate('CURRENT_USER.role="student";TeamBullsTrainerWorkspace.sync()');await sleep(100);
    assert(await evaluate('!document.getElementById("tb-trainer-note-modal").classList.contains("open")&&document.getElementById("tb-private-note-text").value===""'),'Private draft must be cleared when the trainer session ends');
    await evaluate('CURRENT_USER.role="trainer";TeamBullsTrainerWorkspace.sync()');


    assert.deepEqual(await evaluate('window.errors'),[]);results.push({width,height});
  }
  await command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/?late-reference=1'});
  for(let i=0;i<60;i++){if(await evaluate('location.search.includes("late-reference")&&document.readyState==="complete"&&!!window.TeamBullsTrainerWorkspace&&!!window.TeamBullsNavigation'))break;await sleep(50);}
  await sleep(150);
  assert(await evaluate('document.getElementById("modal-weekly-checkin-view").classList.contains("open")'),'Loading the workspace after a report opened must preserve that report');
  assert.deepEqual(await evaluate('window.errors'),[]);
  console.log('PASS real click flows on mobile/desktop: photo selection/close/download/late thumbnail, nested weekly/questionnaire close/back with preserved scroll, focus and history, chronological comparison, catalog failure+retry, delete confirmation, technique save and full diet-day copy with replacement, retry, new-day scheduling and independent trainer photo/draft/editor windows.');
} finally {
  if(socket?.readyState===1){try{await command('Browser.close');}catch{}socket.close();}
  chrome.kill();
  server.close();
  // Only the randomly created isolated Chrome profile is disposable.
  if(path.dirname(profile)===os.tmpdir()&&path.basename(profile).startsWith('tb-login-css-')){
    for(let i=0;i<8;i++){try{fs.rmSync(profile,{recursive:true,force:true});break;}catch{await sleep(150);}}
  }
}
