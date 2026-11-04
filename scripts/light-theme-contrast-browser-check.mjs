// Isolated contrast regression: real settings markup, palette and late module CSS. No Firebase.
import assert from 'node:assert/strict';
import {waitForChromePage} from './chrome-readiness.mjs';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const index = read('index.html');
function settingsMarkup(){
 const start=index.indexOf('<div class="settings-grid">');assert(start>=0);
 let depth=0;
 for(const match of index.slice(start).matchAll(/<div\b[^>]*>|<\/div>/g)){
   depth+=match[0].startsWith('</')?-1:1;
   if(!depth)return index.slice(start,start+match.index+match[0].length);
 }
 throw Error('Unbalanced settings markup');
}
const settings=settingsMarkup();
const modules = ['student-home-profile-v10_10_12','student-guidance-v10_10_9-v2','student-diet-compact-live-v10_10_23','trainer-inbox-payments-v10_10_12','student-hotbar-payments-v10_10_22','student-home-layout-v10_10_15','global-performance-v10_10_9','desktop-performance-v10_10_9'];
const lateStyles = modules.map(name => {
  const css = read(`modules/${name}.js`).match(/style\.textContent\s*=\s*`([\s\S]*?)`;/)?.[1];
  assert(css && !css.includes('${'),`Cannot isolate CSS: ${name}`);
  return css;
}).join('\n');
const core=read('app_v10_10_9_core.js');
const helpers=core.slice(core.indexOf('function themeHexChannels('),core.indexOf('let FONT_SCALE_RULES_PREPARED='));
const palette=core.slice(core.indexOf("    const text=Math.max(45",core.indexOf('  }else{',core.indexOf('const BASE_APPLY_APP_SETTINGS='))),core.indexOf("    root.setProperty('--chart-label',panelMuted);",core.indexOf('const BASE_APPLY_APP_SETTINGS='))+"    root.setProperty('--chart-label',panelMuted);".length);
assert(palette.includes('panelInk')&&palette.includes('--tb-light-canvas'));
const markup=`<section id="screen-settings">${settings}</section>
<section id="screen-student-notifications"><div class="tb-notice-screen-head"><div><div class="tb-notice-meta">CENTRAL DO ALUNO</div><h1>NOTIFICAÇÕES</h1></div></div><div class="tb-notice-list"><article class="tb-notice-card unread"><div class="tb-notice-meta">PRESCRIÇÃO · 01/11/2026</div><strong>Plano atualizado</strong><p>Seu protocolo de treino foi atualizado.</p><div class="tb-notice-actions"><button>MARCAR COMO LIDA</button></div></article></div></section>
<section id="screen-diet-detail"><section class="tb-guidance-card" data-tb-diet-guidance="1"><div class="tb-guidance-head"><div><strong>ÁGUA</strong></div></div><div class="tb-hydration-value">5,5 L · 5.500 ml</div><details class="tb-nutrition-details" open><summary>VER OBSERVAÇÕES E ORIENTAÇÕES DA DIETA</summary><ul class="tb-nutrition-list"><li>Orientações da dieta</li></ul></details><div class="tb-guidance-actions"><button class="btn-ghost">INSTRUÇÕES GERAIS</button></div></section><div id="diet-energy-summary" class="diet-energy-card"><div class="diet-energy-metric"><span>ENERGIA</span><strong>2.000 kcal</strong></div></div></section>
<div class="tb-trainer-profile-card"><div class="tb-trainer-profile-copy"><strong>Treinador</strong><span>Consultoria esportiva</span></div></div>
<div class="tb-payment-card none"><div><strong>Plano anual</strong><small>Pagamento registrado</small><span class="tb-payment-pill">12 meses</span><div class="tb-payment-history"><details open><summary>Histórico</summary><div class="tb-history-row">Registro de pagamento</div></details></div></div></div>
<section class="tb-student-payment-card"><div class="tb-student-payment-status"><div><small>PLANO</small><strong>Anual</strong></div></div><div class="tb-student-payment-metric"><span>PRÓXIMO PAGAMENTO</span><strong>01/11/2027</strong></div><div class="tb-student-payment-private">Informações privadas do aluno</div></section>
<div class="modal-sheet" style="position:static;transform:none"><div class="tb-payment-editor-grid"><label>PLANO<input value="Anual"></label><div class="tb-payment-due-preview"><span>PRÓXIMO PAGAMENTO</span><strong>01/11/2027</strong></div></div></div>
<article class="workout-card"><div class="workout-card-name">Treino</div><div class="workout-card-meta">Protocolo ativo</div></article>
<article class="diet-folder-card"><div class="diet-folder-name">Dieta</div><div class="diet-folder-meta">Prescrição</div></article>
<div class="tb-command-head"><div class="eyebrow">CENTRAL</div><h2>Gestão</h2><p>Acompanhe seus alunos</p></div>
<div class="tb-summary-card"><span>ALUNOS</span><strong>20</strong></div>
<div class="tb-activity-card unread"><div class="tb-activity-main"><strong>Plano atualizado</strong><span>Treino revisado</span></div><div class="tb-activity-meta"><b>HOJE</b><small>12:00</small></div></div>
<div class="tb-hub-tabs"><button class="tb-hub-tab">AVISOS</button><button class="tb-hub-tab active">PAGAMENTOS</button></div>
<div class="tb-v17-feedback is-open"><button class="tb-v17-feedback-toggle"><span class="tb-v17-feedback-copy"><strong>Orientações</strong><small>HOJE</small></span></button><div class="tb-v17-feedback-body">Acompanhamento do aluno</div></div>
<div class="tb-v17-weight-panel"><div class="tb-v17-weight-current">70<small>kg</small></div><div class="tb-v17-weight-delta">Peso registrado</div></div>
<div class="tb-v17-empty">Nenhum registro ainda</div>
<div class="v107-list-card notice read"><div><strong>Aviso lido</strong><small>Histórico de notificações</small></div></div>`;
const fixture=`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles_v10_10_9.css"></head><body><main id="app">${markup}</main><style>${lateStyles}
*,*::before,*::after{transition:none!important;animation:none!important}</style><script>${helpers};function applyPalette(bg,brightness){const root=document.documentElement.style,APP_SETTINGS={text:brightness};${palette}}</script></body></html>`;
const baselineIndex=process.argv.indexOf('--baseline');
const baseline=baselineIndex<0?null:process.argv[baselineIndex+1];
assert(baselineIndex<0||/^[a-f0-9]{7,40}$/.test(baseline||''),'--baseline requires a commit SHA');
const css=baseline?spawnSync('git',['show',`${baseline}:styles_v10_10_9.css`],{encoding:'utf8'}).stdout:read('styles_v10_10_9.css');
assert(css.includes('--tb-light-panel'));
const server=http.createServer((req,res)=>{
 const stylesheet=req.url==='/styles_v10_10_9.css';
 res.writeHead(200,{'Content-Type':stylesheet?'text/css':'text/html; charset=utf-8'});
 res.end(stylesheet?css:fixture);
});
const executable = process.env.CHROME_BIN || (process.platform === 'win32'
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : ['google-chrome','chromium','chromium-browser'].map(name => spawnSync('which',[name],{encoding:'utf8'}).stdout?.trim()).find(Boolean));
assert(executable && fs.existsSync(executable), 'Chrome is required (set CHROME_BIN).');
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const profile = fs.mkdtempSync(path.join(os.tmpdir(),'tb-theme-css-'));
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
  for(let i=0;i<100;i++){if(await evaluate('document.readyState === "complete" && typeof applyPalette === "function"'))break;await sleep(50);}
  const selectors=['.settings-card h3','.settings-card .setting-label','.settings-card .setting-value','.settings-card .pdf-note','.settings-card a','.setting-switch button','.tb-notice-screen-head h1','.tb-notice-screen-head .tb-notice-meta','.tb-notice-card strong','.tb-notice-card p','.tb-notice-card .tb-notice-meta','.tb-notice-actions button','.tb-guidance-head strong','.tb-hydration-value','.tb-nutrition-details summary','.tb-nutrition-list li','.tb-guidance-actions button','#diet-energy-summary .diet-energy-metric>span','.tb-trainer-profile-copy strong','.tb-trainer-profile-copy span','.tb-payment-card strong','.tb-payment-card small','.tb-payment-pill','.tb-payment-history summary','.tb-history-row','.tb-student-payment-status small','.tb-student-payment-status strong','.tb-student-payment-metric span','.tb-student-payment-metric strong','.tb-student-payment-private','.tb-payment-editor-grid label','.tb-payment-due-preview span','.tb-payment-due-preview strong','.workout-card-name','.workout-card-meta','.diet-folder-name','.diet-folder-meta','.v107-list-card strong','.v107-list-card small','.settings-grid>.btn-ghost','.tb-command-head .eyebrow','.tb-command-head h2','.tb-command-head p','.tb-summary-card span','.tb-summary-card strong','.tb-activity-main strong','.tb-activity-main span','.tb-activity-meta b','.tb-activity-meta small','.tb-hub-tab','.tb-v17-feedback-copy strong','.tb-v17-feedback-copy small','.tb-v17-feedback-body','.tb-v17-weight-current','.tb-v17-weight-current small','.tb-v17-weight-delta','.tb-v17-empty'];
  const failures=[];
  for(const width of [360,390,768,1440]) for(const bg of [35,70,180]) for(const text of [45,100,180]){
    await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});
    await evaluate(`applyPalette(${bg},${text})`);
    const metrics=await evaluate(`(() => {
      const parse=c=>{const v=c.match(/[\\d.]+/g).map(Number);return [v[0],v[1],v[2],v[3]??1]};
      const blend=(fg,bg)=>fg.slice(0,3).map((v,i)=>v*fg[3]+bg[i]*(1-fg[3]));
      const luminance=c=>c.reduce((t,v,i)=>{v/=255;return t+(v<=.04045?v/12.92:((v+.055)/1.055)**2.4)*[.2126,.7152,.0722][i]},0);
      const output=[];
      for(const selector of ${JSON.stringify(selectors)}){
        const nodes=[...document.querySelectorAll(selector)];
        if(!nodes.length)throw Error('Missing fixture '+selector);
        for(const el of nodes){
          const stack=[];for(let n=el;n;n=n.parentElement)stack.unshift(n);
          let surface=[255,255,255],opacity=1,backgroundImages=[];
          for(const n of stack){const s=getComputedStyle(n);surface=blend(parse(s.backgroundColor),surface);opacity*=Number(s.opacity);if(s.backgroundImage!=='none')backgroundImages.push(s.backgroundImage)}
          const style=getComputedStyle(el),fg=parse(style.color);fg[3]*=opacity;
          const a=luminance(blend(fg,surface)),b=luminance(surface);
          output.push({selector,label:el.textContent.trim().slice(0,35),ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),opacity,backgroundImages});
        }
      }
      const guidance=getComputedStyle(document.querySelector('[data-tb-diet-guidance]'));
      return {output,guidanceBackground:guidance.backgroundColor,guidanceImage:guidance.backgroundImage};
    })()`);
    for(const item of metrics.output)if(item.ratio<4.5||item.backgroundImages.length)failures.push({width,bg,text,...item});
    if(metrics.guidanceImage!=='none'||metrics.guidanceBackground.startsWith('rgba'))failures.push({width,bg,text,guidance:metrics});
    results.push({width,bg,text,minimum:Math.min(...metrics.output.map(x=>x.ratio))});
    if(screenshotDir&&bg===70&&text===100&&(width===390||width===1440)){
      const size=(await command('Page.getLayoutMetrics')).cssContentSize;
      const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:size.width,height:size.height,scale:1}});
      fs.writeFileSync(path.join(screenshotDir,`light-${width}.png`),Buffer.from(shot.data,'base64'));
      for(const [name,selector] of [['settings','.app-update-settings-card'],['notice','.tb-notice-card'],['diet','[data-tb-diet-guidance]']]){
        const clip=await evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1}})()`);
        const image=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip});
        fs.writeFileSync(path.join(screenshotDir,`${name}-${width}.png`),Buffer.from(image.data,'base64'));
      }
    }
  }
  if(screenshotDir)fs.writeFileSync(path.join(screenshotDir,'contrast-results.json'),JSON.stringify({results,failures},null,2));
  assert.equal(failures.length,0,JSON.stringify(failures.slice(0,18),null,2));
  console.log(`PASS ${results.length} browser scenarios; ${selectors.length} text selectors >= 4.5:1, opaque diet guidance, late module CSS; no Firebase.`);
} finally {
  if(socket?.readyState===1){try{await command('Browser.close');}catch{}socket.close();}
  chrome.kill();
  server.close();
  // Only the randomly created isolated Chrome profile is disposable.
  if(path.dirname(profile)===os.tmpdir()&&path.basename(profile).startsWith('tb-theme-css-')){
    for(let i=0;i<8;i++){try{fs.rmSync(profile,{recursive:true,force:true});break;}catch{await sleep(150);}}
  }
}
