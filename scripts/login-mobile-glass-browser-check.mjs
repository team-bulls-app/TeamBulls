// Isolated browser regression: real auth markup/CSS, no Firebase or production data.
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
const auth = index.slice(index.indexOf('<!-- AUTH -->'), index.indexOf('<!-- HOME (aluno) -->'))
  .replace('class="screen" id="screen-auth"', 'class="screen active" id="screen-auth"')
  .replace(/\s(?:onclick|onsubmit)="[^"]*"/g, '');
assert(auth.includes('id="login-email"'), 'Fixture must use the current login markup.');
const lateStyles = ['modules/global-performance-v10_10_9.js', 'modules/desktop-performance-v10_10_9.js']
  .map(file => {
    const text = read(file).match(/style\.textContent=`([\s\S]*?)`;/)?.[1];
    assert(text && !text.includes('${'), `Cannot isolate current performance CSS: ${file}`);
    return text;
  }).join('\n');
const fixture = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/styles_v10_10_9.css"><script src="/viewport_v10_10_9.js"></script></head><body><div id="app">${auth}</div><style id="performance-fixture">${lateStyles}</style></body></html>`;
const allowed = new Map([
  ['/styles_v10_10_9.css', 'text/css'], ['/viewport_v10_10_9.js','text/javascript'],
  ['/team-bulls-consultoria-bg-v1.jpg','image/jpeg'],
  ['/team-bulls-desktop-login-stone-v2.png','image/png'],
  ['/team-bulls-auth-bg-v9-8-2.webp','image/webp']
]);
const server = http.createServer((req,res) => {
  const pathname = new URL(req.url,'http://localhost').pathname;
  if (pathname === '/') { res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'}); return res.end(fixture); }
  if (!allowed.has(pathname)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {'Content-Type':allowed.get(pathname)});
  res.end(fs.readFileSync(path.join(root,pathname.slice(1))));
});
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
  const matrix = [
    [320,568,true,'login',2,false],[360,640,true,'login',2,false],[360,740,true,'login',2,false],
    [360,800,true,'login',2,false],[393,852,true,'login',2,false],[412,915,true,'login',2,false],
    [768,1024,true,'login',2,false],[932,430,true,'login',2,false],[1024,768,true,'login',2,false],
    [390,844,true,'login',2,false],[430,932,true,'login',2,false],
    [844,390,true,'login',2,true],[899,900,true,'login',2,false],
    [900,900,false,'login',2,false],[1440,900,false,'login',2,false],
    [320,568,true,'login',8,true],[320,568,true,'login',0,false],
    [360,740,true,'register',0,false],[390,600,true,'reset',0,false]
  ];
  for(const theme of ['dark','light']) for(const [width,height,touch,panel,count,error] of matrix) {
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:touch});
    await command('Emulation.setTouchEmulationEnabled',{enabled:touch,maxTouchPoints:1});
    await command('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
    for(let i=0;i<50;i++) { if(await evaluate('document.readyState === "complete" && !!document.querySelector("#login-email")'))break;await sleep(50); }
    await evaluate(`(() => {
      document.documentElement.dataset.theme=${JSON.stringify(theme)};
      document.body.classList.toggle('auth-desktop',${!touch});
      document.querySelectorAll('.auth-panel').forEach(el=>el.classList.toggle('active',el.id==='panel-'+${JSON.stringify(panel)}));
      document.querySelector('#login-email').value='aluno@exemplo.com';
      const host=document.createElement('div');host.className='tb-known-accounts';
      const title=document.createElement('span');title.className='tb-known-accounts-title';title.textContent='Contas neste aparelho';host.appendChild(title);
      const list=document.createElement('div');list.className='tb-known-accounts-list';host.appendChild(list);
      for(let i=0;i<${count};i++){
        const row=document.createElement('div');row.className='tb-known-account-row';
        const account=document.createElement('button');account.className='tb-known-account';account.textContent=(i?'coach':'aluno')+'@exemplo.com';row.appendChild(account);
        const forget=document.createElement('button');forget.className='tb-forget-device-access';forget.textContent='Esquecer acesso';row.appendChild(forget);list.appendChild(row);
      }
      const hint=document.createElement('span');hint.className='tb-password-manager-hint';hint.textContent='Toque no e-mail para usar o acesso salvo neste aparelho. No primeiro acesso, informe a senha.';host.appendChild(hint);
      if(${count}>0)document.querySelector('#login-email').closest('.form-group').after(host);
      if(${error}){const el=document.querySelector('#login-error');el.classList.add('show');el.textContent='A restauração da sessão demorou. Você já pode entrar novamente; seus dados continuam preservados.';}
      return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    })()`);
    await sleep(260);
    const metrics=await evaluate(`(() => {
      const screen=document.querySelector('#screen-auth'),card=screen.querySelector('.auth-card'),field=screen.querySelector('.auth-panel.active input');
      const style=getComputedStyle(card),input=getComputedStyle(field);
      const visible=[...screen.querySelectorAll('input,button,.tb-known-account-row')].filter(el=>el.getClientRects().length);
      return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,
        card:style.backgroundColor,cardOpacity:style.opacity,input:input.backgroundColor,inputOpacity:input.opacity,font:parseFloat(input.fontSize),
        layout:getComputedStyle(screen).display,cardTop:card.getBoundingClientRect().top,logoBottom:screen.querySelector('.auth-logo').getBoundingClientRect().bottom,background:getComputedStyle(screen).backgroundImage,art:(()=>{const el=screen.querySelector('.auth-mobile-art'),r=el.getBoundingClientRect(),s=getComputedStyle(el);return {display:s.display,width:r.width,height:r.height,left:r.left,right:r.right,image:s.backgroundImage,size:s.backgroundSize,position:s.backgroundPosition,pointer:s.pointerEvents};})(),logoTop:screen.querySelector('.auth-logo').getBoundingClientRect().top,
        outside:visible.filter(el=>{const r=el.getBoundingClientRect();return r.left<-.5||r.right>innerWidth+.5}).map(el=>el.id||el.className),
        accounts:screen.querySelectorAll('.tb-known-account').length,blur:style.backdropFilter,
        finePointer:matchMedia('(pointer:fine)').matches,hover:matchMedia('(hover:hover)').matches};
    })()`);
    const name=`${theme}-${width}x${height}-${panel}-${count}${error?'-error':''}`;
    assert.equal(metrics.width,width,name);
    assert.equal(metrics.finePointer,!touch,`${name}: pointer emulation`);
    assert.equal(metrics.hover,!touch,`${name}: hover emulation`);
    assert.equal(metrics.overflow,false,`${name}: horizontal overflow`);
    assert.deepEqual(metrics.outside,[],`${name}: clipped controls`);
    assert(metrics.logoTop>=-.5,`${name}: login starts above reachable content`);
    assert.equal(metrics.accounts,count,name);
    assert.equal(metrics.cardOpacity,'1',`${name}: transparency must not fade children`);
    if(width<900||touch){
      assert.equal(metrics.card,'rgba(10, 9, 8, 0.34)',`${name}: selected glass missing`);
      assert.equal(metrics.input,'rgba(25, 22, 20, 0.76)',`${name}: inputs must retain contrast`);
      assert.equal(metrics.inputOpacity,'1',name);
      assert(metrics.font>=16,`${name}: input may trigger iOS zoom`);
      assert(metrics.art.image.includes('team-bulls-desktop-login-stone-v2.png'),name);
      assert(metrics.art.image.includes('0.13'),`${name}: artwork covered by old gradient`);
      assert.equal(metrics.layout,'flex',`${name}: touch login must use one column`);
      assert(metrics.cardTop>=metrics.logoBottom,`${name}: card must follow title`);
      assert.equal(metrics.art.display,'block',name);
      assert(await evaluate(`new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img.naturalWidth===1672&&img.naturalHeight===941);img.onerror=()=>resolve(false);img.src='/team-bulls-desktop-login-stone-v2.png'})`),`${name}: source image must load intact`);
      assert.equal(metrics.art.pointer,'none',`${name}: art must not intercept form taps`);
      assert(Math.abs(metrics.art.width/metrics.art.height-9/16)<.001,`${name}: portrait framing distorted`);
      assert(metrics.art.left>=-.5&&metrics.art.right<=width+.5,`${name}: artwork outside screen`);
      // Source x=0..740 includes both characters; source height must fit the 9:16 frame.
      const scale=metrics.art.width/740,renderedHeight=941*scale;
      assert(renderedHeight<=metrics.art.height,`${name}: artwork cropped vertically`);
      assert(metrics.art.size.includes('225.946%')||metrics.art.size.includes('225.945946%'),`${name}: source crop changed`);
      assert.equal(metrics.blur,'none',`${name}: appearance must survive performance mode`);
    } else {
      assert.notEqual(metrics.card,'rgba(10, 9, 8, 0.34)',`${name}: mobile style leaked to desktop`);
      assert(metrics.background.includes('team-bulls-desktop-login-stone-v2.png'),name);
      assert.equal(metrics.art.display,'none',`${name}: mobile framing leaked to desktop`);
    }
    if(screenshotDir && (([360,390,932,1024].includes(width)&&panel==='login')||(width===1440))) {
      const shot=await command('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});
      fs.writeFileSync(path.join(screenshotDir,`${name}.png`),Buffer.from(shot.data,'base64'));
    }
    if(width===390&&height===844&&panel==='login'){
      const keyboard=await evaluate(`(async()=>{
        const art=document.querySelector('.auth-mobile-art'),before=art.getBoundingClientRect().height;
        const original=Object.getOwnPropertyDescriptor(window,'visualViewport');
        const field=document.getElementById('login-pass');field.focus({preventScroll:true});
        Object.defineProperty(window,'visualViewport',{configurable:true,value:{height:360,width:innerWidth,offsetTop:0,offsetLeft:0}});
        dispatchEvent(new Event('resize'));await new Promise(r=>setTimeout(r,300));
        field.scrollIntoView({block:'center'});
        const opened=document.documentElement.classList.contains('virtual-keyboard-open');
        const stable=Math.abs(art.getBoundingClientRect().height-before)<1;
        Object.defineProperty(window,'visualViewport',original);field.blur();dispatchEvent(new Event('resize'));
        return {opened,stable};
      })()`);
      assert(keyboard.opened&&keyboard.stable,`${name}: keyboard resize must preserve artwork scale`);
    }
    results.push({name,...metrics});
  }
  if(screenshotDir)fs.writeFileSync(path.join(screenshotDir,'results.json'),JSON.stringify(results,null,2));
  console.log(`APROVADO: ${results.length} cenários no Chrome, 320–1440 px, dois temas, contas salvas, erro, cadastro e recuperação; sem Firebase.`);
} finally {
  if(socket?.readyState===1){try{await command('Browser.close');}catch{}socket.close();}
  chrome.kill();
  server.close();
  // Only the randomly created isolated Chrome profile is disposable.
  if(path.dirname(profile)===os.tmpdir()&&path.basename(profile).startsWith('tb-login-css-')){
    for(let i=0;i<8;i++){try{fs.rmSync(profile,{recursive:true,force:true});break;}catch{await sleep(150);}}
  }
}
