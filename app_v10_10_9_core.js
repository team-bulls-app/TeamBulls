/* ══════════════════════════════════════════════════
   INICIALIZAÇÃO RESILIENTE E LIMITES DE REDE
══════════════════════════════════════════════════ */
const APP_VERSION='10.10.9';
const AUTH_UI_FALLBACK_MS=850;
const BOOT_TIMEOUT_MS=3200;
const PROFILE_READ_TIMEOUT_MS=2500;
const CLOUD_READ_TIMEOUT_MS=8000;
const SESSION_READ_TIMEOUT_MS=15000;
const CLOUD_WRITE_TIMEOUT_MS=10000;
let BOOT_STARTED=false;
let BOOT_SETTLED=false;
let BOOT_WATCHDOG=null;
let AUTH_UI_FALLBACK_TIMER=null;
function storageGet(key){try{return localStorage.getItem(key);}catch(error){return null;}}
function storageSet(key,value){try{localStorage.setItem(key,value);return true;}catch(error){return false;}}
function storageRemove(key){try{localStorage.removeItem(key);return true;}catch(error){return false;}}

// IndexedDB guarda mídias locais fora do localStorage. Isso evita travamentos
// síncronos e estouro da pequena cota do localStorage ao registrar fotografias.
const MEDIA_DB_NAME='team-bulls-media-v10';
const MEDIA_STORE='media';
let MEDIA_DB_PROMISE=null;
const MEDIA_OBJECT_URLS=new Map();
function openMediaDb(){
  if(!('indexedDB' in window))return Promise.resolve(null);
  if(MEDIA_DB_PROMISE)return MEDIA_DB_PROMISE;
  MEDIA_DB_PROMISE=new Promise(resolve=>{
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;if(!value)MEDIA_DB_PROMISE=null;resolve(value);};
    try{
      const req=indexedDB.open(MEDIA_DB_NAME,1);
      req.onupgradeneeded=()=>{const database=req.result;if(!database.objectStoreNames.contains(MEDIA_STORE))database.createObjectStore(MEDIA_STORE);};
      req.onsuccess=()=>{const database=req.result;database.onversionchange=()=>database.close();finish(database);};
      req.onerror=()=>finish(null);
      req.onblocked=()=>finish(null);
    }catch(error){finish(null);}
  });
  return MEDIA_DB_PROMISE;
}
function rememberMediaObjectUrl(key,url){
  const previous=MEDIA_OBJECT_URLS.get(key);
  if(previous&&previous!==url)try{URL.revokeObjectURL(previous);}catch(error){}
  MEDIA_OBJECT_URLS.set(key,url);return url;
}
async function mediaPut(key,value){
  const db=await openMediaDb();if(!db||!key)return false;
  return new Promise(resolve=>{try{const tx=db.transaction(MEDIA_STORE,'readwrite');tx.objectStore(MEDIA_STORE).put(value,key);tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false);tx.onabort=()=>resolve(false);}catch(error){resolve(false);}});
}
async function mediaGet(key){
  const db=await openMediaDb();if(!db||!key)return null;
  return new Promise(resolve=>{try{const req=db.transaction(MEDIA_STORE,'readonly').objectStore(MEDIA_STORE).get(key);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>resolve(null);}catch(error){resolve(null);}});
}
async function mediaDelete(key){
  if(MEDIA_OBJECT_URLS.has(key)){URL.revokeObjectURL(MEDIA_OBJECT_URLS.get(key));MEDIA_OBJECT_URLS.delete(key);}
  const db=await openMediaDb();if(!db||!key)return false;
  return new Promise(resolve=>{try{const tx=db.transaction(MEDIA_STORE,'readwrite');tx.objectStore(MEDIA_STORE).delete(key);tx.oncomplete=()=>resolve(true);tx.onerror=()=>resolve(false);tx.onabort=()=>resolve(false);}catch(error){resolve(false);}});
}
function dataUrlToBlob(value){
  try{const match=/^data:(image\/jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(String(value||''));if(!match)return null;const raw=atob(match[2]),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return new Blob([bytes],{type:match[1]});}catch(error){return null;}
}
function blobToDataUrl(blob){return new Promise(resolve=>{if(!(blob instanceof Blob)){resolve('');return;}const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>resolve('');reader.readAsDataURL(blob);});}
async function mediaObjectUrl(key){
  if(!key)return'';if(MEDIA_OBJECT_URLS.has(key))return MEDIA_OBJECT_URLS.get(key);
  const value=await mediaGet(key);if(!value)return'';const blob=value instanceof Blob?value:dataUrlToBlob(value);if(!blob)return'';
  const url=URL.createObjectURL(blob);return rememberMediaObjectUrl(key,url);
}
function runWhenIdle(task,timeout=4000){
  if('requestIdleCallback' in window)return requestIdleCallback(()=>Promise.resolve().then(task).catch(()=>{}),{timeout});
  return setTimeout(()=>Promise.resolve().then(task).catch(()=>{}),Math.min(1200,timeout));
}

function setLoadingMessage(message){const el=document.querySelector('#screen-loading .loading-label');if(el)el.textContent=message||'carregando...';}
function finishBoot(){
  BOOT_SETTLED=true;
  clearTimeout(BOOT_WATCHDOG);
  clearTimeout(AUTH_UI_FALLBACK_TIMER);
  window.TeamBullsRecovery?.hide?.();
}
function startBootWatchdog(){
  BOOT_SETTLED=false;
  clearTimeout(BOOT_WATCHDOG);
  clearTimeout(AUTH_UI_FALLBACK_TIMER);
  // A tela de autenticação é utilizável mesmo enquanto o Firebase termina de
  // restaurar a sessão. Assim o aluno nunca fica bloqueado por uma consulta lenta.
  AUTH_UI_FALLBACK_TIMER=setTimeout(()=>{
    if(BOOT_SETTLED||!document.getElementById('screen-loading')?.classList.contains('active'))return;
    showScreen('screen-auth');
  },AUTH_UI_FALLBACK_MS);
  // Proteção independente para qualquer erro inesperado durante a inicialização.
  BOOT_WATCHDOG=setTimeout(()=>{
    if(BOOT_SETTLED||!document.getElementById('screen-loading')?.classList.contains('active'))return;
    AUTH_HANDLED=false;
    showScreen('screen-auth');
    window.TeamBullsRecovery?.reveal?.('A sessão continuará sendo verificada em segundo plano. Você já pode entrar ou usar o modo local.');
  },BOOT_TIMEOUT_MS);
}
function withTimeout(task,ms,label='operação'){
  return new Promise((resolve,reject)=>{
    let settled=false;
    const timer=setTimeout(()=>{if(settled)return;settled=true;const error=new Error('Tempo esgotado: '+label);error.code='team-bulls/timeout';reject(error);},Math.max(250,Number(ms)||10000));
    Promise.resolve(task).then(value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(value);},error=>{if(settled)return;settled=true;clearTimeout(timer);reject(error);});
  });
}
function cloudGet(reference,label='consulta'){return withTimeout(reference.get(),CLOUD_READ_TIMEOUT_MS,label);}
function cloudWrite(task,label='gravação'){return withTimeout(task,CLOUD_WRITE_TIMEOUT_MS,label);}
function isNetworkLikeError(error){return !navigator.onLine||error?.code==='team-bulls/timeout'||error?.code==='auth/network-request-failed'||error?.code==='unavailable'||error?.code==='deadline-exceeded';}
function bootToAuth(message){
  AUTH_HANDLED=false;
  showScreen('screen-auth');
  if(message)showAuthError('login-error',message);
}

/* ══════════════════════════════════════════════════
   CONFIGURAÇÃO — preencha com seus dados do Firebase
══════════════════════════════════════════════════ */
const CFG = {
  // ⚠️ Qualquer valor aqui é visível no código-fonte para qualquer pessoa (F12 → Sources).
  // Por isso NÃO existe mais um "código de treinador": criar conta sempre gera role:'student'.
  // Para promover uma conta a treinador, faça manualmente no Firebase Console:
  // Firestore → coleção "users" → documento do usuário → altere o campo "role" para "trainer".
  // Cole aqui uma chave pública do App Check/reCAPTCHA Enterprise para ativar
  // a proteção antiabuso. Vazio = recurso desativado e nenhum SDK extra é baixado.
  appCheckSiteKey: String(window.TEAM_BULLS_PUBLIC_CONFIG?.appCheckSiteKey||''),
  firebase: {
    apiKey: "AIzaSyAdaKNItJ66v0Po_VpQue9huFf_psLmV54",
    authDomain: "teamms-app.firebaseapp.com",
    projectId: "teamms-app",
    storageBucket: "teamms-app.firebasestorage.app",
    messagingSenderId: "57870273303",
    appId: "1:57870273303:web:1de3016167b9a69dfd4552"
  }
};

/* ══════════════════════════════════════════════════
   TEAM BULLS v10 — ÁUDIO E INTERFACE
   Preferências locais de acessibilidade, sons e música.
══════════════════════════════════════════════════ */
const SETTINGS_KEY='team_bulls_settings_v9_4';
const SETTINGS_LEGACY_KEY='team_bulls_settings_v9';
const SETTINGS_DEFAULTS={background:100,text:100,font:100,clickVolume:120,clickEnabled:true,musicVolume:28,musicEnabled:true,musicDock:false};
const MUSIC_VOLUME_MIGRATION_KEY='team_bulls_music_volume_reduced_v10_5_4';
let APP_SETTINGS=loadAppSettings();
function loadAppSettings(){
  try{
    const current=localStorage.getItem(SETTINGS_KEY);
    const legacyRaw=localStorage.getItem(SETTINGS_LEGACY_KEY);
    const hadSavedSettings=!!(current||legacyRaw);
    const loaded=current
      ? {...SETTINGS_DEFAULTS,...JSON.parse(current)}
      : {...SETTINGS_DEFAULTS,...JSON.parse(legacyRaw||'{}'),musicDock:false};
    if(hadSavedSettings&&!localStorage.getItem(MUSIC_VOLUME_MIGRATION_KEY)){
      loaded.musicVolume=Math.max(0,Math.min(100,Math.round((Number(loaded.musicVolume)||35)*0.8)));
      localStorage.setItem(MUSIC_VOLUME_MIGRATION_KEY,'1');
      localStorage.setItem(SETTINGS_KEY,JSON.stringify(loaded));
    }
    return loaded;
  }catch(e){return{...SETTINGS_DEFAULTS};}
}
function saveAppSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(APP_SETTINGS));}catch(e){}}
function adjustHex(hex,pct){
  const raw=hex.replace('#','');const n=parseInt(raw.length===3?raw.split('').map(c=>c+c).join(''):raw,16);const f=Math.max(.2,pct/100);
  const c=shift=>Math.max(0,Math.min(255,Math.round(((n>>shift)&255)*f))).toString(16).padStart(2,'0');
  return'#'+c(16)+c(8)+c(0);
}
function applyAppSettings(){
  const root=document.documentElement.style;
  root.setProperty('--bg',adjustHex('#0c0c0c',APP_SETTINGS.background));
  root.setProperty('--surface',adjustHex('#141414',APP_SETTINGS.background));
  root.setProperty('--card',adjustHex('#1c1c1c',APP_SETTINGS.background));
  root.setProperty('--border',adjustHex('#282828',APP_SETTINGS.background));
  root.setProperty('--border-l',adjustHex('#333333',APP_SETTINGS.background));
  root.setProperty('--text',adjustHex('#efefef',APP_SETTINGS.text));
  root.setProperty('--text-dim',adjustHex('#888888',APP_SETTINGS.text));
  root.setProperty('--text-muted',adjustHex('#5a5a5a',APP_SETTINGS.text));
  root.setProperty('--font-scale',String(APP_SETTINGS.font/100));
  root.setProperty('--click-volume',String(APP_SETTINGS.clickVolume/100));
  syncSettingsUi();
  const dock=document.getElementById('music-dock');
  if(dock)dock.classList.toggle('active',!!APP_SETTINGS.musicDock);
  if(LOCAL_MUSIC){
    if(MUSIC_FADE_FRAME)cancelMusicFade();
    LOCAL_MUSIC.volume=APP_SETTINGS.musicEnabled&&!LOCAL_MUSIC.paused?getMusicTargetVolume():0;
  }
}

/* ══════════════════════════════════════════════════
   TEAM BULLS v10.5.4 — NAVEGAÇÃO DESKTOP RECOLHÍVEL
══════════════════════════════════════════════════ */
const DESKTOP_NAV_STATE_KEY='team_bulls_desktop_nav_collapsed_v10_5_4';
function desktopSidebarCollapsed(){
  try{return localStorage.getItem(DESKTOP_NAV_STATE_KEY)==='1';}catch(e){return false;}
}
function applyDesktopSidebarState(collapsed=desktopSidebarCollapsed()){
  document.body.classList.toggle('desktop-nav-collapsed',!!collapsed);
  document.querySelectorAll('.desktop-nav-toggle').forEach(button=>{
    button.setAttribute('aria-expanded',String(!collapsed));
    button.setAttribute('aria-label',collapsed?'Expandir menu lateral':'Recolher menu lateral');
    button.title=collapsed?'Expandir menu lateral':'Recolher menu lateral';
    const icon=button.querySelector('.nav-icon');if(icon)icon.textContent=collapsed?'›':'‹';
    const label=button.querySelector('.nav-label');if(label)label.textContent=collapsed?'EXPANDIR':'RECOLHER';
  });
}
function toggleDesktopSidebar(){
  const collapsed=!document.body.classList.contains('desktop-nav-collapsed');
  try{localStorage.setItem(DESKTOP_NAV_STATE_KEY,collapsed?'1':'0');}catch(e){}
  applyDesktopSidebarState(collapsed);
}
function prepareDesktopSidebars(){
  document.querySelectorAll('.trainer-desktop-nav,.student-desktop-nav').forEach(nav=>{
    if(!nav.querySelector('.desktop-nav-toggle')){
      const toggle=document.createElement('button');
      toggle.type='button';toggle.className='desktop-nav-toggle';toggle.onclick=toggleDesktopSidebar;
      toggle.innerHTML='<span aria-hidden="true" class="nav-icon">‹</span><span class="nav-label">RECOLHER</span>';
      nav.insertBefore(toggle,nav.firstElementChild);
    }
    Array.from(nav.children).forEach(button=>{
      if(button.tagName!=='BUTTON'||button.classList.contains('desktop-nav-toggle')||button.dataset.navPrepared==='1')return;
      const raw=button.textContent.trim(),parts=raw.match(/^(\S+)\s+([\s\S]+)$/);
      const icon=parts?.[1]||'•',label=parts?.[2]||raw;
      button.dataset.navPrepared='1';button.title=label;
      button.innerHTML=`<span aria-hidden="true" class="nav-icon">${esc(icon)}</span><span class="nav-label">${esc(label)}</span>`;
    });
  });
  applyDesktopSidebarState();
}
document.addEventListener('DOMContentLoaded',prepareDesktopSidebars,{once:true});

function getSharedAudioContext(){
  try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;const ctx=getSharedAudioContext.ctx||(getSharedAudioContext.ctx=new AC());if(ctx.state==='suspended')ctx.resume().catch(()=>{});return ctx;}catch(e){return null;}
}
function playSurvivalTone(freq=105,duration=.045){
  if(!APP_SETTINGS.clickEnabled||APP_SETTINGS.clickVolume<=0)return;
  try{const ctx=getSharedAudioContext();if(!ctx)return;const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='square';osc.frequency.value=freq;const level=.018*(APP_SETTINGS.clickVolume/100);gain.gain.setValueAtTime(Math.max(.0001,level),ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+duration);osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+duration);}catch(e){}
}
document.addEventListener('click',event=>{if(event.target.closest('button,.auth-tab,.workout-card,.exercise-row,.student-card'))playSurvivalTone(112,.038);},true);

function renderGerMeter(level){
  const safe=Math.max(0,Math.min(6,Number(level)||0));
  return`<span class="ger-meter level-${safe}" style="--ger:${safe}" role="img" aria-label="Nível GER ${safe} de 6"></span>`;
}
function studentArchiveCode(uid){
  const text=String(uid||'TEAM-BULLS');let hash=0;
  for(let i=0;i<text.length;i++)hash=(hash*31+text.charCodeAt(i))>>>0;
  return'BT-'+String(hash%10000).padStart(4,'0');
}


/* ══════════════════════════════════════════════════
   MINI CHART
══════════════════════════════════════════════════ */
class MiniChart {
  constructor(canvas){ this.cv=canvas;this.labels=[];this.data=[];this.unit='';this._tip={on:false,idx:-1};this._bind(); }
  render(labels,data,unit){ this.labels=labels;this.data=data;this.unit=unit;this._draw(); }
  _draw(){
    const cv=this.cv,dpr=Math.min(window.devicePixelRatio||1,2),W=cv.parentElement.clientWidth,H=160;
    cv.style.width=W+'px';cv.style.height=H+'px';cv.width=W*dpr;cv.height=H*dpr;
    const ctx=cv.getContext('2d');ctx.scale(dpr,dpr);
    const D=this.data,n=D.length;if(!n)return;
    const pad={t:14,r:14,b:40,l:46},cw=W-pad.l-pad.r,ch=H-pad.t-pad.b;
    const mn=Math.min(...D),mx=Math.max(...D),rng=mx-mn||1;
    const minV=mn-rng*.1,maxV=mx+rng*.1,span=maxV-minV;
    const xp=i=>pad.l+(n>1?(i/(n-1))*cw:cw/2);
    const yp=v=>pad.t+ch-((v-minV)/span)*ch;
    ctx.clearRect(0,0,W,H);
    for(let i=0;i<=4;i++){
      const gy=pad.t+(i/4)*ch,val=maxV-(i/4)*(maxV-minV);
      ctx.strokeStyle='#222';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(pad.l,gy);ctx.lineTo(pad.l+cw,gy);ctx.stroke();
      ctx.fillStyle='#5a5a5a';ctx.font="10px 'DM Mono',monospace";ctx.textAlign='right';
      ctx.fillText(Math.round(val),pad.l-5,gy+4);
    }
    ctx.beginPath();ctx.moveTo(xp(0),yp(D[0]));
    for(let i=1;i<n;i++){const px=xp(i-1),py=yp(D[i-1]),cx2=xp(i),cy2=yp(D[i]),mpx=(px+cx2)/2;ctx.bezierCurveTo(mpx,py,mpx,cy2,cx2,cy2);}
    ctx.lineTo(xp(n-1),H-pad.b);ctx.lineTo(xp(0),H-pad.b);ctx.closePath();
    const g=ctx.createLinearGradient(0,pad.t,0,pad.t+ch);
    g.addColorStop(0,'rgba(225,29,72,.22)');g.addColorStop(1,'rgba(225,29,72,0)');
    ctx.fillStyle=g;ctx.fill();
    ctx.beginPath();ctx.moveTo(xp(0),yp(D[0]));
    for(let i=1;i<n;i++){const px=xp(i-1),py=yp(D[i-1]),cx2=xp(i),cy2=yp(D[i]),mpx=(px+cx2)/2;ctx.bezierCurveTo(mpx,py,mpx,cy2,cx2,cy2);}
    ctx.strokeStyle='#e11d48';ctx.lineWidth=2;ctx.stroke();
    for(let i=0;i<n;i++){ctx.beginPath();ctx.arc(xp(i),yp(D[i]),4.5,0,Math.PI*2);ctx.fillStyle='#e11d48';ctx.fill();ctx.strokeStyle='#0c0c0c';ctx.lineWidth=2;ctx.stroke();}
    ctx.fillStyle='#5a5a5a';ctx.font="9px 'DM Mono',monospace";ctx.textAlign='center';
    const step=Math.max(1,Math.ceil(n/6));const shown=new Set();
    for(let i=0;i<n;i+=step){this._xl(ctx,this.labels[i],xp(i),H-pad.b+8);shown.add(i);}
    if(!shown.has(n-1))this._xl(ctx,this.labels[n-1],xp(n-1),H-pad.b+8);
    if(this._tip.on&&this._tip.idx>=0&&this._tip.idx<n){
      const ti=this._tip.idx,tx=xp(ti),ty=yp(D[ti]),txt=D[ti]+' '+this.unit;
      ctx.font="bold 11px 'DM Mono',monospace";const tw=ctx.measureText(txt).width+18;
      const bx=Math.max(4,Math.min(W-tw-4,tx-tw/2)),by=Math.max(4,ty-34);
      ctx.fillStyle='#1c1c1c';ctx.strokeStyle='#333';ctx.lineWidth=1;
      this._rr(ctx,bx,by,tw,22,5);ctx.fill();ctx.stroke();
      ctx.fillStyle='#e11d48';ctx.textAlign='left';ctx.fillText(txt,bx+9,by+15);
      ctx.strokeStyle='rgba(225,29,72,.3)';ctx.lineWidth=1;ctx.setLineDash([3,3]);
      ctx.beginPath();ctx.moveTo(tx,pad.t);ctx.lineTo(tx,H-pad.b);ctx.stroke();ctx.setLineDash([]);
    }
  }
  _xl(ctx,lbl,x,y){ctx.save();ctx.translate(x,y);ctx.rotate(-Math.PI/7);ctx.fillText(lbl,0,0);ctx.restore();}
  _rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.arcTo(x+w,y,x+w,y+r,r);ctx.lineTo(x+w,y+h-r);ctx.arcTo(x+w,y+h,x+w-r,y+h,r);ctx.lineTo(x+r,y+h);ctx.arcTo(x,y+h,x,y+h-r,r);ctx.lineTo(x,y+r);ctx.arcTo(x,y,x+r,y,r);ctx.closePath();}
  _gi(cx){const n=this.data.length;if(!n)return -1;const rect=this.cv.getBoundingClientRect(),x=cx-rect.left,W=rect.width,cw=W-60,idx=Math.round(((x-46)/cw)*(n-1));return Math.max(0,Math.min(n-1,idx));}
  _bind(){
    const cv=this.cv;
    cv.addEventListener('mousemove',e=>{this._tip={on:true,idx:this._gi(e.clientX)};this._draw();});
    cv.addEventListener('mouseleave',()=>{this._tip={on:false,idx:-1};this._draw();});
    cv.addEventListener('touchstart',e=>{e.preventDefault();this._tip={on:true,idx:this._gi(e.touches[0].clientX)};this._draw();},{passive:false});
    cv.addEventListener('touchend',()=>{setTimeout(()=>{this._tip={on:false,idx:-1};this._draw();},1800);});
  }
}

/* ══════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════ */
const PALETTE=['#e11d48','#3b82f6','#22c55e','#a855f7','#ec4899','#14b8a6','#f59e0b','#ef4444','#64748b'];
let MODE='local';           // 'local' | 'cloud'
let ACCESS_MODE='local-guest'; // local-guest | offline-registered | local-inactive | cloud-active | trainer
let CURRENT_USER=null;      // { uid, name, email, role, status }
let VIEW_STUDENT=null;      // { uid, name } when trainer viewing student
let VIEW_STUDENT_WORKOUT=null;
let VIEW_STUDENT_DAY='';
let VIEW_STUDENT_EXERCISE=null;

// Student nav state
let CUR_WORKOUT=null;
let CUR_DAY='';
let CUR_EX=null;
let SESSION_WID=null;  // ID do treino travado ao abrir modal de nova sessão
let SESSION_EID=null;  // ID do exercício travado ao abrir modal de nova sessão
let LAST_SESSION_WEEK=1; // lembra a última semana selecionada, para não ter que reescolher a cada série
let TRAINER_ACTIVE_WEEK=1; // semana selecionada ao treinador visualizar/prescrever
let SESSION_EDITOR_WEEK=1;
let EDIT_SESSION_WID=null; // ID travado ao abrir modal de edição de sessão
let EDIT_SESSION_EID=null;
let PLAN_EDIT_TARGET='trainer'; // 'trainer' | 'local'
let PLAN_EDIT_WID=null;
let PLAN_EDIT_EID=null;
let PLAN_SET_COUNT=0;
let EDIT_W=null;
let SEL_COLOR=PALETTE[0];
let MODAL_TARGET='self'; // 'self' | 'student' — define o proprietário da edição
let DAY_MODAL_TARGET='self';
let EDIT_DAY_NAME='';
let WORKOUT_CREATE_ID=null; // IDs de rascunho tornam retries idempotentes (sem duplicar documentos)
let EXERCISE_CREATE_ID=null;
let EDIT_EXERCISE_ID=null;
let EXERCISE_MODAL_CONTEXT=null; // trava aluno, protocolo e dia enquanto o editor permanece aberto
let VIDEO_EDIT_EXERCISE_ID=null;
let SESSION_CREATE_ID=null;
let SET_COUNT=0;
let SESSION_VARIANT={itemId:'',name:''};
let REST_INTERVAL=null, REST_REMAINING=0, REST_TOTAL=0, REST_PAUSED=false;
let CAL_YEAR=null, CAL_MONTH=null;
const MONTH_NAMES=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
let CHART_MODE='weight';
let TS_CHART_MODE='weight';
let CONFIRM_CB=null;
let miniChart=null;
let tsMiniChart=null;
let NAVIGATION_SEQ=0;

// ═══════════════════════════════════════════════════════
//  ARMAZENAMENTO LOCAL — isolado por aluno
// ═══════════════════════════════════════════════════════
const STORAGE_KEY='teamms_v1'; // legado: versões anteriores à v8
const LOCAL_KEY_PREFIX='teamms_local_';
const LOCAL_GUEST_OWNER='__team_bulls_guest__';
const OFFLINE_MODE_KEY='teamms_offline_mode';

// Verifica suporte a localStorage
function lsAvailable(){
  try{ localStorage.setItem('__test','1'); localStorage.removeItem('__test'); return true; }
  catch(e){ return false; }
}

// LOCAL_DB: fonte única de verdade para modo offline
let LOCAL_DB = {workouts:[]};
let LOCAL_OWNER_UID='';
let MIGRATION_RUNNING = false; // trava — impede migração dupla
let INACTIVE_NAME = '';           // nome do aluno inativo (CURRENT_USER=null)
let INACTIVE_UID = '';            // uid preservado para marcar alterações offline pendentes

function localGeneratedId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,7);}
function safeDayName(value){return String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ').slice(0,60)||'Treino geral';}
function dayIdFromName(value){
  const source=normalizedName(safeDayName(value));let hash=2166136261;
  for(let i=0;i<source.length;i++){hash^=source.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return'day-'+(hash>>>0).toString(36);
}
function normalizeWorkoutDays(rawDays,exercises=[]){
  const result=[],seen=new Set();
  const add=(entry,index)=>{
    const name=safeDayName(typeof entry==='string'?entry:entry?.name);
    const key=normalizedName(name);if(!key||seen.has(key))return;
    seen.add(key);result.push({id:String((entry&&typeof entry==='object'&&entry.id)||dayIdFromName(name)),name,order:Number.isFinite(Number(entry?.order))?Number(entry.order):index});
  };
  (Array.isArray(rawDays)?rawDays:[]).forEach(add);
  (Array.isArray(exercises)?exercises:[]).forEach((exercise,index)=>add({name:exercise?.dayName||'Treino geral',order:result.length+index},result.length+index));
  return result.sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'pt-BR')).map((day,index)=>({...day,order:index}));
}
function getWorkoutDays(workout){return normalizeWorkoutDays(workout?.days,workout?.exercises||[]);}
function syncWorkoutDays(workout){if(workout)workout.days=getWorkoutDays(workout);return workout?.days||[];}
function normalizeLocalDb(value){
  const root=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const workouts=Array.isArray(root.workouts)?root.workouts:[];
  root.workouts=workouts.filter(w=>w&&typeof w==='object').map((w,workoutIndex)=>{
    const exercises=(Array.isArray(w.exercises)?w.exercises:[]).filter(e=>e&&typeof e==='object').map((e,index)=>({
      ...e,
      id:e.id||localGeneratedId(),
      name:String(e.name||'Exercício'),
      dayName:safeDayName(e.dayName||'Treino geral'),
      catalogGroupId:String(e.catalogGroupId||''),
      catalogItemId:String(e.catalogItemId||''),
      videoUrl:String(e.videoUrl||''),
      instructions:String(e.instructions||'').slice(0,1500),
      techniqueIds:normalizeExerciseTechniqueIds(e.techniqueIds),
      optionalTechniqueIds:normalizeExerciseTechniqueIds(e.optionalTechniqueIds).filter(id=>id==='mp'),
      weeklyTechniquePlan:normalizeWeeklyTechniquePlan(e.weeklyTechniquePlan),
      supersetExerciseId:String(e.supersetExerciseId||'').slice(0,128),
      order:hasManualOrder(e)?Number(e.order):index,
      weeklyPlan:normalizeWeeklyPlan(e.weeklyPlan),
      sessions:(Array.isArray(e.sessions)?e.sessions:[]).filter(s=>s&&typeof s==='object').map(s=>({
        ...s,
        id:s.id||localGeneratedId(),
        date:String(s.date||''),
        sets:Array.isArray(s.sets)?s.sets:[]
      }))
    }));
    return{
      ...w,
      id:w.id||localGeneratedId(),
      name:String(w.name||'Treino'),
      color:PALETTE.includes(w.color)?w.color:PALETTE[0],
      order:hasManualOrder(w)?Number(w.order):Math.max(0,workouts.length-1-workoutIndex),
      isActive:w.isActive===true,
      days:normalizeWorkoutDays(w.days,exercises),
      exercises
    };
  });
  root.workouts=normalizeWorkoutCollection(root.workouts);
  root.workouts.forEach(workout=>{workout.exercises=sortWorkoutExercises(workout);});
  return root;
}

function localKeyFor(ownerUid=LOCAL_OWNER_UID){
  const owner=String(ownerUid||LOCAL_GUEST_OWNER);
  return LOCAL_KEY_PREFIX+owner;
}
function parseStoredLocal(raw){
  if(!raw)return{workouts:[]};
  try{return normalizeLocalDb(JSON.parse(raw));}
  catch(e){return{workouts:[]};}
}
// Troca o contexto local sem jamais carregar o cache de outro aluno. O arquivo
// legado só é usado quando pertence ao mesmo uid (ou ainda não tinha dono).
function selectLocalOwner(ownerUid,allowLegacy=false){
  LOCAL_OWNER_UID=String(ownerUid||LOCAL_GUEST_OWNER);
  if(!lsAvailable()){LOCAL_DB={workouts:[]};return;}
  const scoped=localStorage.getItem(localKeyFor());
  if(scoped){LOCAL_DB=parseStoredLocal(scoped);return;}
  if(localStorage.getItem('teamms_local_initialized_'+LOCAL_OWNER_UID)==='1'){
    LOCAL_DB={workouts:[]};return;
  }
  if(!allowLegacy){LOCAL_DB={workouts:[]};return;}
  const legacy=parseStoredLocal(localStorage.getItem(STORAGE_KEY));
  // O arquivo legado sem proprietário só é assumido pelo primeiro contexto
  // explicitamente autorizado. Nunca é carregado automaticamente pela última conta.
  LOCAL_DB={...legacy,workouts:(legacy.workouts||[]).filter(w=>{
    if(LOCAL_OWNER_UID===LOCAL_GUEST_OWNER)return !w.userId;
    return !w.userId||w.userId===LOCAL_OWNER_UID;
  })};
}
function hasStoredLocal(){
  return !!localStorage.getItem(localKeyFor())||(LOCAL_DB.workouts||[]).length>0;
}

// Carga inicial — executa ANTES de qualquer outro código
(function loadInitial(){
  if(!lsAvailable())return;
  const explicitMode=localStorage.getItem(OFFLINE_MODE_KEY)||'';
  if(explicitMode==='guest'||localStorage.getItem('teamms_offline_pref')==='1'){
    selectLocalOwner(LOCAL_GUEST_OWNER,!localStorage.getItem('teamms_last_user_uid'));
  }else{
    LOCAL_OWNER_UID='';
    LOCAL_DB={workouts:[]};
  }
}());

// Salva LOCAL_DB no localStorage e atualiza o contador debug
function localSave(){
  if(MODE!=='local')return true;
  try{
    const json=JSON.stringify(LOCAL_DB);
    localStorage.setItem(localKeyFor(),json);
    if(LOCAL_OWNER_UID)localStorage.setItem('teamms_local_initialized_'+LOCAL_OWNER_UID,'1');
    const linkedOwners=[...new Set((LOCAL_DB.workouts||[]).map(w=>w.userId).filter(Boolean))];
    const pendingOwner=INACTIVE_UID||(linkedOwners.length===1?linkedOwners[0]:'');
    if(pendingOwner&&pendingOwner!==LOCAL_GUEST_OWNER){
      localStorage.setItem('teamms_migration_pending','1');
      localStorage.setItem('teamms_migration_owner',pendingOwner);
      localStorage.removeItem('teamms_cloud_mirror_'+pendingOwner);
    }
    updateDebugBar();
    return true;
  }catch(e){
    console.warn('localSave error:',e);
    showToast('Não foi possível salvar neste aparelho. Libere espaço e tente novamente.',true);
    return false;
  }
}

// Releitura explícita (usar com cuidado — só quando necessário)
function localLoad(){
  if(!lsAvailable()) return;
  LOCAL_DB=parseStoredLocal(localStorage.getItem(localKeyFor()));
}

// Barra de debug — mostra status do armazenamento em modo offline
function updateDebugBar(){
  const bar = document.getElementById('debug-bar');
  if(!bar) return;
  const eyebrow = document.getElementById('hero-eyebrow');
  if(MODE !== 'local'){ bar.style.display='none'; return; }
  bar.style.display = 'block';
  let nW, nE, nS, lsOk, label;
  nW = LOCAL_DB.workouts.length;
  nE = LOCAL_DB.workouts.reduce((a,w)=>a+(w.exercises||[]).length,0);
  nS = LOCAL_DB.workouts.reduce((a,w)=>(w.exercises||[]).reduce((acc2,e)=>acc2+(e.sessions||[]).length,0),0);
  lsOk = hasStoredLocal();
  label = INACTIVE_NAME ? 'consultoria pausada' : (lsOk ? 'OK' : 'VAZIO');
  bar.textContent = `💾 localStorage: ${label} · ${nW} treinos · ${nE} exercícios · ${nS} sessões`;
  bar.style.color = lsOk ? '#22c55e' : '#e11d48';
}

function showToast(msg,isError){
  let t=document.getElementById('toast-msg');
  if(!t){
    t=document.createElement('div');
    t.id='toast-msg';
    t.style.cssText='position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#1e1e1e;color:#22c55e;padding:10px 20px;border-radius:8px;font-size:13px;font-family:monospace;z-index:9999;pointer-events:none;border:1px solid #22c55e;transition:opacity .3s;opacity:0;';
    document.body.appendChild(t);
  }
  t.textContent=msg;
  t.style.borderColor=isError?'#e11d48':'#22c55e';
  t.style.color=isError?'#e11d48':'#22c55e';
  t.style.opacity='1';
  clearTimeout(t._hide);
  t._hide=setTimeout(()=>{t.style.opacity='0';},2000);
}

// Traduz falhas de escrita em orientação útil. As regras do Firestore vivem no
// servidor: trocar somente o HTML nunca atualiza permissões já publicadas.
function cloudWriteError(error,action){
  const code=String(error?.code||'');
  const message=String(error?.message||'Falha desconhecida');
  if(code.includes('permission-denied')||/missing or insufficient permissions/i.test(message)){
    return 'Permissão recusada pelo Firebase ao '+action+'. Publique também o arquivo firestore_26_compacto.rules no Firebase Console; atualizar apenas o HTML não altera as permissões do servidor.';
  }
  if(code.includes('unavailable')||/network|offline|failed to fetch/i.test(message)){
    return 'O servidor está indisponível no momento. Verifique a conexão e tente novamente.';
  }
  return (code?code+' — ':'')+message;
}

const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const DEFAULT_EXERCISE_INSTRUCTIONS='1- Controle bem a fase excêntrica';

// Impede duplo clique/Enter repetido durante uma escrita assíncrona.
const ACTION_LOCKS=new Set();
function beginAction(key,modalId){
  if(ACTION_LOCKS.has(key))return false;
  ACTION_LOCKS.add(key);
  const btn=modalId?document.querySelector('#'+modalId+' .btn-primary'):null;
  if(btn)btn.disabled=true;
  return true;
}
function endAction(key,modalId){
  ACTION_LOCKS.delete(key);
  const btn=modalId?document.querySelector('#'+modalId+' .btn-primary'):null;
  if(btn)btn.disabled=false;
}
function draftId(collection){
  return db?db.collection(collection).doc().id:uid();
}
function idempotentDraftId(key,collection){
  const storageKey='teamms_draft_'+String(key||collection);
  try{
    const saved=sessionStorage.getItem(storageKey);
    if(saved&&/^[A-Za-z0-9_-]{8,160}$/.test(saved))return saved;
    const created=draftId(collection);sessionStorage.setItem(storageKey,created);return created;
  }catch(error){return draftId(collection);}
}
function clearIdempotentDraft(key){
  try{sessionStorage.removeItem('teamms_draft_'+String(key));}catch(error){}
}
function normalizedName(value){return String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');}
function stableHash(value){
  let h=2166136261;
  for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}
  return (h>>>0).toString(36);
}
function stableEntityId(prefix,...parts){
  const seed=parts.map(value=>String(value||'')).join('|');
  return prefix+'_'+stableHash(seed)+'_'+stableHash([...seed].reverse().join(''));
}
function sessionFingerprint(s){
  const sets=(s.sets||[]).map(x=>[
    Number(x.weight),Number(x.reps),
    Number.isFinite(Number(x.targetMin))?Number(x.targetMin):null,
    Number.isFinite(Number(x.targetMax))?Number(x.targetMax):null,
    Number.isFinite(Number(x.ger))?Number(x.ger):null,
    x.backoff===true
  ]);
  return JSON.stringify([s.date||'',Number(s.week)||0,s.note||'',String(s.performedExerciseItemId||''),String(s.performedExerciseName||''),sets]);
}
function normalizePerformedSet(value){
  if(!value||typeof value!=='object')return null;
  const weight=Number(value.weight),reps=Number(value.reps);
  if(!Number.isFinite(weight)||weight<0||weight>10000||!Number.isInteger(reps)||reps<0||reps>100)return null;
  const clean={weight:Math.round(weight*100)/100,reps};
  if(value.backoff===true)clean.backoff=true;
  const prescription=normalizePrescriptionSet(value);
  if(prescription)Object.assign(clean,prescription);
  return clean;
}
function normalizePerformedSets(value){
  if(!Array.isArray(value)||value.length<1||value.length>30)return null;
  const sets=value.map(normalizePerformedSet);
  return sets.every(Boolean)?sets:null;
}

/* ══════════════════════════════════════════════════
   PRESCRIÇÃO SEMANAL E ESCALA GER
   weeklyPlan guarda apenas semanas personalizadas. Uma semana sem chave própria
   herda a última prescrição anterior, o que repassa o plano sem duplicar dados.
══════════════════════════════════════════════════ */
const GER_DEFINITIONS=[
  {level:1,text:'2 a 4 repetições na reserva'},
  {level:2,text:'1 repetição na reserva'},
  {level:3,text:'0 repetições na reserva'},
  {level:4,text:'Falhar durante a tentativa de executar parcialmente a próxima repetição'},
  {level:5,text:'Chegar à falha e usar impulso ou ajuda para realizar repetições adicionais'},
  {level:6,text:'Esforço máximo extremo — “até sentir o gosto de sangue” (metaforicamente)'}
];

function normalizePrescriptionSet(value){
  if(!value||typeof value!=='object')return null;
  const targetMin=parseInt(value.targetMin??value.minReps??value.repsMin,10);
  const targetMax=parseInt(value.targetMax??value.maxReps??value.repsMax,10);
  const ger=parseInt(value.ger,10);
  if(!Number.isInteger(targetMin)||!Number.isInteger(targetMax)||targetMin<1||targetMax<targetMin||targetMax>100)return null;
  if(!Number.isInteger(ger)||ger<1||ger>6)return null;
  return{targetMin,targetMax,ger};
}
function normalizeWeeklyPlan(value){
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const out={};
  for(let week=1;week<=8;week++){
    const key='w'+week;
    if(!Object.prototype.hasOwnProperty.call(source,key))continue;
    const raw=Array.isArray(source[key])?source[key]:(Array.isArray(source[key]?.sets)?source[key].sets:[]);
    out[key]=raw.map(normalizePrescriptionSet).filter(Boolean).slice(0,30);
  }
  return out;
}
function clonePrescriptionSets(sets){
  return(Array.isArray(sets)?sets:[]).map(s=>({targetMin:s.targetMin,targetMax:s.targetMax,ger:s.ger}));
}
function resolveWeekPrescription(exercise,week){
  const safeWeek=Math.max(1,Math.min(8,parseInt(week,10)||1));
  const plan=normalizeWeeklyPlan(exercise?.weeklyPlan);
  for(let sourceWeek=safeWeek;sourceWeek>=1;sourceWeek--){
    const key='w'+sourceWeek;
    if(Object.prototype.hasOwnProperty.call(plan,key)){
      return{week:safeWeek,sourceWeek,inherited:sourceWeek!==safeWeek,sets:clonePrescriptionSets(plan[key])};
    }
  }
  return{week:safeWeek,sourceWeek:null,inherited:false,sets:[]};
}
function prescribedRangeLabel(set){
  if(!set)return'—';
  return set.targetMin===set.targetMax?String(set.targetMin):set.targetMin+'–'+set.targetMax;
}
function formatGerLevel(level){return'GER '+String(Number(level)||0).padStart(2,'0');}
function prescriptionCompactSummary(exercise,week){
  const rx=resolveWeekPrescription(exercise,week);
  if(!rx.sets.length)return{ger:'',reps:'Sem prescrição',rx};
  const ranges=[...new Set(rx.sets.map(prescribedRangeLabel))];
  const gers=[...new Set(rx.sets.map(s=>s.ger))];
  return{
    ger:gers.length===1?formatGerLevel(gers[0]):'GER '+gers.map(level=>String(level).padStart(2,'0')).join('/'),
    reps:ranges.length===1?rx.sets.length+'×'+ranges[0]:rx.sets.length+' séries',
    rx
  };
}
function getGerDefinition(level){return GER_DEFINITIONS.find(x=>x.level===Number(level));}
function openGerInfo(){
  document.getElementById('ger-definitions-list').innerHTML=GER_DEFINITIONS.map(item=>
    `<div class="ger-definition"><strong>G.E.R ${String(item.level).padStart(2,'0')}</strong><span>${esc(item.text)}</span></div>`
  ).join('');
  openModal('modal-ger-info');
}

/* ══════════════════════════════════════════════════
   MIGRAÇÃO OFFLINE → CLOUD
   Chamada ao logar se houver dados locais no cache do aluno
   Escrita item a item (sem batch) para máxima compatibilidade
══════════════════════════════════════════════════ */
async function migrateLocalToCloud(userId,{background=true}={}){
  if(MIGRATION_RUNNING)return false;
  localLoad();
  const workouts=(LOCAL_DB.workouts||[]).filter(w=>!w.userId||w.userId===userId);
  if(!workouts.length){storageRemove('teamms_migration_pending');storageRemove('teamms_migration_owner');return true;}
  MIGRATION_RUNNING=true;storageSet('teamms_migrating',String(Date.now()));
  if(!background)setLoadingMessage('sincronizando dados offline...');
  try{
    const [workoutSnap,exerciseSnap,sessionSnap]=await withTimeout(Promise.all([
      db.collection('workouts').where('userId','==',userId).get(),
      db.collection('exercises').where('userId','==',userId).get(),
      db.collection('sessions').where('userId','==',userId).get()
    ]),CLOUD_READ_TIMEOUT_MS,'consulta para sincronização');
    const cloudWorkouts=workoutSnap.docs.map(doc=>({...doc.data(),id:doc.id}));
    const cloudExercises=exerciseSnap.docs.map(doc=>({...doc.data(),id:doc.id,_ref:doc.ref}));
    const cloudSessions=sessionSnap.docs.map(doc=>({...doc.data(),id:doc.id,_ref:doc.ref}));
    let allMatched=true,totalSessions=0;
    for(const localWorkout of workouts){
      let cloudWorkout=cloudWorkouts.find(w=>localWorkout.id&&w.id===localWorkout.id);
      if(!cloudWorkout)cloudWorkout=uniqueCandidateByKey(cloudWorkouts,workoutIdentityKey(localWorkout),workoutIdentityKey);
      if(!cloudWorkout){allMatched=false;continue;}
      const availableExercises=cloudExercises.filter(e=>e.workoutId===cloudWorkout.id);
      for(const localExercise of (localWorkout.exercises||[])){
        let cloudExercise=availableExercises.find(e=>localExercise.id&&e.id===localExercise.id);
        if(!cloudExercise)cloudExercise=uniqueCandidateByKey(availableExercises,exerciseIdentityKey(localExercise),exerciseIdentityKey);
        if(!cloudExercise){allMatched=false;continue;}
        const existingSessions=cloudSessions.filter(session=>session.exerciseId===cloudExercise.id);
        const cloudById=new Map(existingSessions.map(session=>[String(session.id),session]));
        const cloudByMigration=new Map(existingSessions.filter(session=>session.migrationKey).map(session=>[String(session.migrationKey),session]));
        const legacyFingerprints={};
        existingSessions.filter(session=>!session.migrationKey).forEach(session=>{const fp=sessionFingerprint(session);legacyFingerprints[fp]=(legacyFingerprints[fp]||0)+1;});
        for(const localSession of (localExercise.sessions||[])){
          const date=String(localSession.date||''),sets=normalizePerformedSets(localSession.sets),week=Number(localSession.week),note=String(localSession.note||'').slice(0,2000);
          const exerciseName=String(localExercise.name||'').slice(0,100),performedExerciseItemId=String(localSession.performedExerciseItemId||'').slice(0,100),performedExerciseName=String(localSession.performedExerciseName||exerciseName).slice(0,100);
          if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!sets||!Number.isInteger(week)||week<1||week>8){allMatched=false;continue;}
          const clean={date,week,note,sets,exerciseName,performedExerciseItemId,performedExerciseName};
          const fp=sessionFingerprint(clean),migrationKey=userId+'|'+cloudWorkout.id+'|'+cloudExercise.id+'|'+(localSession.id||fp);
          const existing=(localSession.id&&cloudById.get(String(localSession.id)))||cloudByMigration.get(migrationKey);
          if(existing){if(sessionFingerprint(existing)!==fp||String(existing.exerciseName||'')!==exerciseName){await withTimeout(existing._ref.update(clean),CLOUD_WRITE_TIMEOUT_MS,'atualização de sessão');totalSessions++;}continue;}
          if((legacyFingerprints[fp]||0)>0){legacyFingerprints[fp]--;continue;}
          const ref=db.collection('sessions').doc('m_'+stableHash(migrationKey)+'_'+stableHash([...migrationKey].reverse().join('')));
          await withTimeout(ref.set({userId,workoutId:cloudWorkout.id,exerciseId:cloudExercise.id,...clean,migrationKey,createdAt:firebase.firestore.FieldValue.serverTimestamp()}),CLOUD_WRITE_TIMEOUT_MS,'envio de sessão');
          totalSessions++;
        }
      }
    }
    if(allMatched){
      LOCAL_DB={...LOCAL_DB,workouts:[]};storageRemove(localKeyFor());storageSet('teamms_local_initialized_'+userId,'1');storageRemove('teamms_migration_pending');storageRemove('teamms_migration_owner');
    }else{storageSet('teamms_migration_pending','1');storageSet('teamms_migration_owner',userId);}
    if(totalSessions)showToast(totalSessions===1?'1 registro offline sincronizado.':totalSessions+' registros offline sincronizados.');
    return allMatched;
  }catch(error){
    console.error('Migração falhou:',error);storageSet('teamms_migration_pending','1');storageSet('teamms_migration_owner',userId);
    if(!background)showToast('Não foi possível sincronizar agora. Os dados foram preservados.',true);
    return false;
  }finally{storageRemove('teamms_migrating');MIGRATION_RUNNING=false;}
}

// Reparo manual para duplicatas antigas. Só aparece ao treinador e nunca apaga
// sessões: exercícios únicos são movidos para o treino mantido; exercícios com
// o mesmo nome viram histórico arquivado e continuam visíveis por nome.
async function cleanDuplicates(){
  if(CURRENT_USER?.role!=='trainer'||!VIEW_STUDENT||!db){alert('Abra o perfil do aluno como treinador primeiro.');return;}
  const userId=VIEW_STUDENT.uid;
  if(!beginAction('clean-duplicates'))return;
  try{
    const [workoutSnap,exerciseSnap]=await Promise.all([
      db.collection('workouts').where('userId','==',userId).get(),
      db.collection('exercises').where('userId','==',userId).get()
    ]);
    const exercisesByWorkout={};
    exerciseSnap.docs.forEach(ex=>(exercisesByWorkout[ex.data().workoutId]=exercisesByWorkout[ex.data().workoutId]||[]).push(ex));
    const groups={};
    workoutSnap.docs.forEach(w=>(groups[normalizedName(w.data().name)]=groups[normalizedName(w.data().name)]||[]).push(w));
    let removed=0;
    for(const docs of Object.values(groups).filter(g=>g.length>1)){
      docs.sort((a,b)=>(exercisesByWorkout[b.id]?.length||0)-(exercisesByWorkout[a.id]?.length||0)||createdMillis(a.data())-createdMillis(b.data()));
      const keep=docs[0];
      const keptActive=docs.some(doc=>doc.data().isActive===true);
      const keptOrder=Math.min(...docs.map((doc,index)=>hasManualOrder(doc.data())?Number(doc.data().order):10000+index));
      let keptDays=normalizeWorkoutDays(keep.data().days,(exercisesByWorkout[keep.id]||[]).map(ex=>ex.data()));
      const keptByName=new Map((exercisesByWorkout[keep.id]||[]).map(ex=>[exerciseIdentityKey(ex.data()),ex]));
      const keptNames=new Set(keptByName.keys());
      for(const duplicate of docs.slice(1)){
        const duplicateDays=normalizeWorkoutDays(duplicate.data().days,(exercisesByWorkout[duplicate.id]||[]).map(ex=>ex.data()));
        keptDays=normalizeWorkoutDays([...keptDays,...duplicateDays],[]);
        await keep.ref.update({days:keptDays,order:Math.max(0,Math.min(10000,keptOrder)),isActive:keptActive});
        for(const ex of (exercisesByWorkout[duplicate.id]||[])){
          const exName=exerciseIdentityKey(ex.data());
          if(keptNames.has(exName)){
            // Antes de remover o contêiner duplicado, preserva semanas que só
            // existiam nele. A prescrição do exercício mantido tem prioridade.
            const keptExercise=keptByName.get(exName);
            const sourcePlan=normalizeWeeklyPlan(ex.data().weeklyPlan);
            const keptPlan=keptExercise.__weeklyPlan||normalizeWeeklyPlan(keptExercise.data().weeklyPlan);
            const mergedPlan={...sourcePlan,...keptPlan};
            if(Object.keys(mergedPlan).length){
              await keptExercise.ref.update({weeklyPlan:mergedPlan});
              keptExercise.__weeklyPlan=mergedPlan;
            }
            await ex.ref.delete();
          }
          else{
            await ex.ref.update({workoutId:keep.id});
            keptNames.add(exName);
            keptByName.set(exName,ex);
          }
        }
        await duplicate.ref.delete();
        removed++;
      }
    }
    if(!removed){showToast('Nenhum treino duplicado encontrado.');return;}
    showToast(removed===1?'✓ 1 duplicata corrigida, sem apagar o histórico':'✓ '+removed+' duplicatas corrigidas, sem apagar o histórico');
    await renderTrainerStudent(VIEW_STUDENT);
  }catch(e){
    alert('Erro ao corrigir duplicatas: '+e.message);
  }finally{
    endAction('clean-duplicates');
  }
}


// Cloud backup — salva uma cópia isolada do aluno logado.
function saveCloudBackup(){
  if(!CURRENT_USER)return;
  try{
    const safe=sanitizeWorkoutsForOffline(CLOUD_WORKOUTS);
    localStorage.setItem('teamms_cloud_'+CURRENT_USER.uid,JSON.stringify(safe));
    replaceLocalForUser(CURRENT_USER.uid,safe);
    localStorage.setItem('teamms_cloud_mirror_'+CURRENT_USER.uid,'1');
  }catch(e){console.warn('saveCloudBackup',e);}
}
function loadCloudBackup(uid){
  try{const r=localStorage.getItem('teamms_cloud_'+uid);return r?sanitizeWorkoutsForOffline(JSON.parse(r)):[];}
  catch(e){return[];}
}

function cloneSession(session){
  return{...session,sets:(Array.isArray(session?.sets)?session.sets:[]).map(set=>({...set}))};
}
function mergeSessionLists(localSessions,incomingSessions,preferLocal){
  const result=(Array.isArray(incomingSessions)?incomingSessions:[]).map(cloneSession);
  const consumed=new Set();
  const byId=new Map(),byMigrationKey=new Map(),byFingerprint=new Map();
  result.forEach((session,index)=>{
    if(session.id)byId.set(String(session.id),index);
    if(session.migrationKey)byMigrationKey.set(String(session.migrationKey),index);
    const fp=sessionFingerprint(session);
    if(!byFingerprint.has(fp))byFingerprint.set(fp,[]);
    byFingerprint.get(fp).push(index);
  });
  for(const localSession of (Array.isArray(localSessions)?localSessions:[])){
    let match=-1;
    if(localSession.id&&byId.has(String(localSession.id)))match=byId.get(String(localSession.id));
    else if(localSession.migrationKey&&byMigrationKey.has(String(localSession.migrationKey)))match=byMigrationKey.get(String(localSession.migrationKey));
    if(match<0){
      const candidates=byFingerprint.get(sessionFingerprint(localSession))||[];
      match=candidates.find(index=>!consumed.has(index))??-1;
    }
    if(match>=0){
      consumed.add(match);
      if(preferLocal){
        const remote=result[match];
        result[match]={...remote,...cloneSession(localSession)};
        ['userId','workoutId','exerciseId'].forEach(key=>{if(remote[key]!=null)result[match][key]=remote[key];});
      }
    }else result.push(cloneSession(localSession));
  }
  return result.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.id||'').localeCompare(String(b.id||'')));
}
function workoutIdentityKey(workout){return normalizedName(workout?.name||'');}
function exerciseIdentityKey(exercise){return normalizedName(exercise?.dayName||'Treino geral')+'|'+normalizedName(exercise?.name||'');}
function uniqueCandidateByKey(items,key,keyFn){
  const matches=(items||[]).filter(item=>keyFn(item)===key);
  return matches.length===1?matches[0]:null;
}
function sanitizeSessionForOffline(session){
  const sets=normalizePerformedSets(session?.sets)||[];
  const parsedWeek=Number(session?.week);
  return{...session,date:String(session?.date||''),week:Number.isInteger(parsedWeek)&&parsedWeek>=1&&parsedWeek<=8?parsedWeek:null,note:String(session?.note||'').slice(0,2000),sets};
}
function sanitizeWorkoutsForOffline(workouts){
  return normalizeLocalDb({workouts:Array.isArray(workouts)?workouts:[]}).workouts.map(workout=>({
    ...workout,
    exercises:(workout.exercises||[]).map(exercise=>({
      ...exercise,
      videoUrl:'',
      sessions:(exercise.sessions||[]).map(sanitizeSessionForOffline)
    }))
  }));
}

function mergeExerciseTree(localExercise,incomingExercise,preferLocal){
  return{
    ...localExercise,...incomingExercise,
    weeklyPlan:normalizeWeeklyPlan(incomingExercise.weeklyPlan),
    sessions:mergeSessionLists(localExercise.sessions,incomingExercise.sessions,preferLocal)
  };
}
function mergeWorkoutTree(localWorkout,incomingWorkout,preferLocal){
  const result=(Array.isArray(incomingWorkout.exercises)?incomingWorkout.exercises:[]).map(exercise=>({
    ...exercise,weeklyPlan:normalizeWeeklyPlan(exercise.weeklyPlan),sessions:(exercise.sessions||[]).map(cloneSession)
  }));
  const consumed=new Set();
  for(const localExercise of (Array.isArray(localWorkout.exercises)?localWorkout.exercises:[])){
    let match=result.findIndex((exercise,index)=>!consumed.has(index)&&localExercise.id&&exercise.id===localExercise.id);
    if(match<0){
      const key=exerciseIdentityKey(localExercise);
      const candidates=result.map((exercise,index)=>({exercise,index})).filter(x=>!consumed.has(x.index)&&exerciseIdentityKey(x.exercise)===key);
      if(candidates.length===1)match=candidates[0].index;
    }
    if(match>=0){result[match]=mergeExerciseTree(localExercise,result[match],preferLocal);consumed.add(match);}
    else result.push({...localExercise,weeklyPlan:normalizeWeeklyPlan(localExercise.weeklyPlan),sessions:(localExercise.sessions||[]).map(cloneSession)});
  }
  return{...localWorkout,...incomingWorkout,exercises:result};
}
function mergeWorkoutLists(localWorkouts,incomingWorkouts,preferLocal){
  const result=(Array.isArray(incomingWorkouts)?incomingWorkouts:[]).map(workout=>({
    ...workout,exercises:(workout.exercises||[]).map(exercise=>({...exercise,weeklyPlan:normalizeWeeklyPlan(exercise.weeklyPlan),sessions:(exercise.sessions||[]).map(cloneSession)}))
  }));
  const consumed=new Set();
  for(const localWorkout of (Array.isArray(localWorkouts)?localWorkouts:[])){
    let match=result.findIndex((workout,index)=>!consumed.has(index)&&localWorkout.id&&workout.id===localWorkout.id);
    if(match<0){
      const key=workoutIdentityKey(localWorkout);
      const candidates=result.map((workout,index)=>({workout,index})).filter(x=>!consumed.has(x.index)&&workoutIdentityKey(x.workout)===key);
      if(candidates.length===1)match=candidates[0].index;
    }
    if(match>=0){result[match]=mergeWorkoutTree(localWorkout,result[match],preferLocal);consumed.add(match);}
    else result.push({...localWorkout,exercises:(localWorkout.exercises||[]).map(exercise=>({...exercise,weeklyPlan:normalizeWeeklyPlan(exercise.weeklyPlan),sessions:(exercise.sessions||[]).map(cloneSession)}))});
  }
  return result;
}
function ensureLocalOwner(userUid){
  if(LOCAL_OWNER_UID!==userUid)selectLocalOwner(userUid,true);
  else{
    const stored=localStorage.getItem(localKeyFor());
    if(stored)LOCAL_DB=parseStoredLocal(stored);
  }
}

// Substitui o espelho quando não há alterações pendentes. Se uma migração foi
// apenas parcial, une árvores e preserva exatamente as sessões ainda locais.
function replaceLocalForUser(userUid,incoming){
  try{
    ensureLocalOwner(userUid);
    const safe=sanitizeWorkoutsForOffline(incoming);
    const pending=localStorage.getItem('teamms_migration_pending')==='1'&&localStorage.getItem('teamms_migration_owner')===userUid;
    LOCAL_DB={...LOCAL_DB,workouts:pending?mergeWorkoutLists(LOCAL_DB.workouts,safe,false):mergeWorkoutLists([],safe,false)};
    localStorage.setItem(localKeyFor(),JSON.stringify(LOCAL_DB));
    localStorage.setItem('teamms_local_initialized_'+userUid,'1');
    return true;
  }catch(e){console.warn('replaceLocalForUser error:',e);return false;}
}

// Usada no login de um aluno pausado: a estrutura remota é atualizada, mas uma
// edição offline com o mesmo ID tem prioridade até a próxima sincronização.
function mergeIntoLocal(incoming,userUid=LOCAL_OWNER_UID){
  try{
    if(userUid)ensureLocalOwner(userUid);else localLoad();
    const safe=sanitizeWorkoutsForOffline(incoming);
    LOCAL_DB={...LOCAL_DB,workouts:mergeWorkoutLists(LOCAL_DB.workouts,safe,true)};
    localStorage.setItem(localKeyFor(),JSON.stringify(LOCAL_DB));
    if(userUid)localStorage.setItem('teamms_local_initialized_'+userUid,'1');
    return true;
  }catch(e){console.warn('mergeIntoLocal error:',e);return false;}
}
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
function safePhotoDataUrl(value){const raw=String(value||'');return raw.length<=900000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(raw)?raw:'';}
const PHOTO_URL_CACHE=new Map();
let STORAGE_DISABLED_UNTIL=0;
function safePhotoPath(value){const raw=String(value||'');return /^(progressPhotos|progressPhotoThumbs|freeMealLogs)\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,190}\.jpg$/.test(raw)?raw:'';}
function photoStoragePath(kind,userId,id){const safeKind=['progressPhotos','progressPhotoThumbs','freeMealLogs'].includes(kind)?kind:'freeMealLogs';return`${safeKind}/${String(userId||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,128)}/${String(id||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,190)}.jpg`;}
async function uploadCloudPhoto(kind,userId,id,dataUrl){
  if(Date.now()<STORAGE_DISABLED_UNTIL)return'';
  const blob=dataUrlToBlob(dataUrl);if(!blob)return'';
  try{
    const service=await withTimeout(ensureStorageService(),4500,'carregar armazenamento');if(!service)return'';
    const path=photoStoragePath(kind,userId,id);const ref=service.ref(path);
    const cacheControl=kind==='progressPhotoThumbs'?'private,max-age=604800':'private,max-age=86400';await withTimeout(ref.put(blob,{contentType:'image/jpeg',cacheControl}),30000,'enviar fotografia');
    return path;
  }catch(error){
    // Storage é opcional porque exige o plano Blaze. O app volta ao Firestore
    // automaticamente, sem impedir o registro do aluno.
    console.warn('Cloud Storage indisponível; usando compatibilidade Firestore.',error?.code||error?.message);
    STORAGE_DISABLED_UNTIL=Date.now()+10*60*1000;return'';
  }
}
async function deleteCloudPhoto(path){
  path=safePhotoPath(path);if(!path)return false;
  try{const service=await ensureStorageService();if(!service)return false;await service.ref(path).delete();PHOTO_URL_CACHE.delete(path);return true;}catch(error){return false;}
}
async function resolvePhotoSource(record,options={}){
  const direct=safePhotoDataUrl(record?.dataUrl);if(direct)return direct;
  const allowFull=options.full===true&&CURRENT_USER?.role==='trainer';
  const cacheField=allowFull?'_photoSrc':'_photoThumbSrc';if(record?.[cacheField])return record[cacheField];
  if(record?.photoKey){const local=await mediaObjectUrl(record.photoKey);if(local){record[cacheField]=local;return local;}}
  const fullPath=safePhotoPath(record?.photoPath),thumbPath=safePhotoPath(record?.thumbPath);
  const path=allowFull?(fullPath||thumbPath):(thumbPath||fullPath);if(!path)return'';
  if(PHOTO_URL_CACHE.has(path))return PHOTO_URL_CACHE.get(path);
  try{const service=await ensureStorageService();if(!service)return'';const url=await withTimeout(service.ref(path).getDownloadURL(),7000,'abrir fotografia');PHOTO_URL_CACHE.set(path,url);record[cacheField]=url;return url;}catch(error){console.warn('Foto indisponível',path,error?.code||error?.message);return'';}
}
function hydrateSecureImages(root=document){
  const nodes=[...root.querySelectorAll('img[data-photo-record]')];
  const load=async img=>{if(img.dataset.loaded==='1')return;img.dataset.loaded='1';const bucket=img.dataset.photoRecord==='progress'?PHOTOS_CACHE:FREE_MEAL_LOGS;const record=bucket.find(item=>String(item.id)===String(img.dataset.photoId));const src=await resolvePhotoSource(record,{full:false});if(src&&img.isConnected)img.src=src;};
  if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){observer.unobserve(entry.target);load(entry.target);}}),{rootMargin:'240px'});nodes.forEach(node=>observer.observe(node));}
  else nodes.forEach(load);
}
const jsArg=s=>esc(JSON.stringify(String(s)));
// Usa a data LOCAL do aparelho. toISOString() usa UTC e virava o dia às 21h
// no Brasil em parte do ano, registrando sessões/refeições na data errada.
const today=()=>{
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
};
const fmt=iso=>{
  const parts=String(iso||'').split('-');
  return parts.length===3?parts[2]+'/'+parts[1]+'/'+parts[0]:'—';
};

/* ══════════════════════════════════════════════════
   FIREBASE — SDKs não críticos são carregados somente quando necessários
══════════════════════════════════════════════════ */
let db=null,auth=null,storageService=null;
const SDK_LOAD_PROMISES=new Map();
function loadSdkOnce(src,globalReady){
  if(globalReady?.())return Promise.resolve(true);
  if(SDK_LOAD_PROMISES.has(src))return SDK_LOAD_PROMISES.get(src);
  const promise=new Promise(resolve=>{
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;clearTimeout(timer);resolve(!!value);};
    const timer=setTimeout(()=>finish(!!globalReady?.()),10000);
    const existing=[...document.scripts].find(script=>script.src===src);
    if(existing){
      if(globalReady?.()){finish(true);return;}
      existing.addEventListener('load',()=>finish(!!globalReady?.()),{once:true});
      existing.addEventListener('error',()=>finish(false),{once:true});
      // Um script já concluído não dispara novamente o evento load. Esta
      // verificação evita espera infinita ao abrir recursos opcionais, como PDF.
      setTimeout(()=>{if(globalReady?.())finish(true);else if(existing.dataset.tbSdkState==='error')finish(false);},0);
      return;
    }
    const script=document.createElement('script');script.src=src;script.async=true;script.dataset.tbSdkState='loading';
    script.onload=()=>{script.dataset.tbSdkState='loaded';finish(!!globalReady?.());};
    script.onerror=()=>{script.dataset.tbSdkState='error';finish(false);};
    document.head.appendChild(script);
  });
  SDK_LOAD_PROMISES.set(src,promise);
  promise.then(ok=>{if(!ok&&SDK_LOAD_PROMISES.get(src)===promise)SDK_LOAD_PROMISES.delete(src);});
  return promise;
}
async function ensureFirebaseCore(){
  if(typeof firebase!=='undefined'&&typeof firebase.auth==='function'&&typeof firebase.firestore==='function')return true;
  const appOk=await loadSdkOnce('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',()=>typeof firebase!=='undefined'&&typeof firebase.initializeApp==='function');
  if(!appOk)return false;
  const [authOk,firestoreOk]=await Promise.all([
    loadSdkOnce('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js',()=>typeof firebase.auth==='function'),
    loadSdkOnce('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js',()=>typeof firebase.firestore==='function')
  ]);
  return authOk&&firestoreOk;
}
async function ensureFirebaseReady(){
  if(auth&&db)return true;
  const ready=await withTimeout(ensureFirebaseCore(),6500,'carregar conexão segura').catch(()=>false);
  return ready&&initFirebase();
}
async function ensureStorageService(){
  if(storageService)return storageService;
  if(typeof firebase==='undefined')return null;
  const ok=await loadSdkOnce('https://www.gstatic.com/firebasejs/10.7.1/firebase-storage-compat.js',()=>typeof firebase.storage==='function');
  if(!ok)return null;
  try{storageService=firebase.storage();return storageService;}catch(error){console.warn('Storage indisponível',error);return null;}
}
async function initOptionalAppCheck(){
  const key=String(CFG.appCheckSiteKey||'').trim();if(!key||typeof firebase==='undefined')return false;
  const ok=await loadSdkOnce('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check-compat.js',()=>typeof firebase.appCheck==='function');
  if(!ok)return false;
  try{firebase.appCheck().activate(key,true);return true;}catch(error){console.warn('App Check não iniciado',error);return false;}
}
function initFirebase(){
  if(auth && db) return true; // já inicializado, não inicializa de novo
  try{
    // Se já existe um app Firebase, usa o existente
    if(firebase.apps && firebase.apps.length > 0){
      auth = firebase.auth();
      db   = firebase.firestore();
      if(typeof firebase.storage==='function')try{storageService=firebase.storage();}catch(error){}
    } else {
      firebase.initializeApp(CFG.firebase);
      auth = firebase.auth();
      db   = firebase.firestore();
      if(typeof firebase.storage==='function')try{storageService=firebase.storage();}catch(error){}
    }
    return true;
  }catch(e){console.warn('Firebase init failed',e);return false;}
}

/* ══════════════════════════════════════════════════
   AUTH
══════════════════════════════════════════════════ */
function shouldAutoFocusEditor(){
  try{return !matchMedia('(pointer:coarse)').matches&&!('ontouchstart' in window)&&window.innerWidth>=900;}catch(error){return window.innerWidth>=900;}
}
function focusEditorField(id,delay=120){
  if(!shouldAutoFocusEditor())return;
  setTimeout(()=>document.getElementById(id)?.focus?.({preventScroll:true}),delay);
}
function setAuthSecretsEnabled(enabled=true){
  ['login-pass','reg-pass'].forEach(id=>{const field=document.getElementById(id);if(field)field.disabled=!enabled;});
}
function clearTransientAuthSecrets(){
  ['login-pass','reg-pass'].forEach(id=>{
    const field=document.getElementById(id);if(!field)return;
    field.value='';field.blur?.();field.setAttribute('readonly','');
    setTimeout(()=>field.removeAttribute('readonly'),180);
  });
}
window.TeamBullsAuthFields={clearSecrets:clearTransientAuthSecrets,focusEditorField,setEnabled:setAuthSecretsEnabled};
function authTab(tab){
  setAuthSecretsEnabled(true);
  const isLogin=tab==='login',isRegister=tab==='register',isReset=tab==='reset';
  document.getElementById('tab-login').classList.toggle('active',isLogin);
  document.getElementById('tab-register').classList.toggle('active',isRegister);
  document.getElementById('panel-login').classList.toggle('active',isLogin);
  document.getElementById('panel-register').classList.toggle('active',isRegister);
  document.getElementById('panel-reset')?.classList.toggle('active',isReset);
  clearAuthError('login-error');clearAuthError('reg-error');clearAuthError('reset-error');clearAuthSuccess('reset-success');
  if(isReset){
    const source=document.getElementById('login-email'),target=document.getElementById('reset-email');
    if(target&&!target.value.trim()&&source?.value.trim())target.value=source.value.trim();
    focusEditorField('reset-email',80);
  }else if(isLogin){focusEditorField('login-email',80);}
}
function openPasswordReset(){authTab('reset');}

function showAuthError(id,msg){const el=document.getElementById(id);if(!el)return;el.textContent=msg;el.classList.add('show');}
function clearAuthError(id){const el=document.getElementById(id);if(!el)return;el.textContent='';el.classList.remove('show');}
function showAuthSuccess(id,msg){const el=document.getElementById(id);if(!el)return;el.textContent=msg;el.classList.add('show');}
function clearAuthSuccess(id){const el=document.getElementById(id);if(!el)return;el.textContent='';el.classList.remove('show');}


const PROFILE_CACHE_PREFIX='team_bulls_profile_v9_5_';
function sanitizeCachedProfile(value,uid=''){
  if(!value||typeof value!=='object')return null;
  const role=value.role==='trainer'?'trainer':'student';
  const status=value.status==='inactive'?'inactive':'active';
  const safe={uid:String(uid||value.uid||''),name:String(value.name||'').slice(0,100),email:String(value.email||'').slice(0,320),role,status,cachedAt:Date.now()};
  return safe.uid?safe:null;
}
function cacheUserProfile(profile){const safe=sanitizeCachedProfile(profile,profile?.uid);if(safe)storageSet(PROFILE_CACHE_PREFIX+safe.uid,JSON.stringify(safe));}
function loadCachedUserProfile(uid){try{return sanitizeCachedProfile(JSON.parse(storageGet(PROFILE_CACHE_PREFIX+uid)||'null'),uid);}catch(error){return null;}}
function configureAuthPersistence(role){
  try{
    const persistence=role==='trainer'?firebase.auth.Auth.Persistence.SESSION:firebase.auth.Auth.Persistence.LOCAL;
    return auth?.setPersistence?auth.setPersistence(persistence).catch(()=>{}):Promise.resolve();
  }catch(error){return Promise.resolve();}
}
function populateHistoryFromWorkouts(workouts){
  const sessions=[];(workouts||[]).forEach(w=>(w.exercises||[]).forEach(ex=>(ex.sessions||[]).forEach(session=>sessions.push({...session,exerciseName:session.exerciseName||ex.name}))));
  HISTORY_BY_NAME=buildHistoryByName(sessions);
}
function restoreCachedStudentAccess(user,reason,{silent=false}={}){
  const profile=loadCachedUserProfile(user?.uid||'');
  if(!profile||profile.role!=='student')return false;
  const previousLastUid=storageGet('teamms_last_user_uid')||'';
  selectLocalOwner(profile.uid,!previousLastUid||previousLastUid===profile.uid);
  storageSet('teamms_last_user_uid',profile.uid);
  const backup=loadCloudBackup(profile.uid);
  if(!(LOCAL_DB.workouts||[]).length&&backup.length)replaceLocalForUser(profile.uid,backup);
  localLoad();
  const inactive=profile.status==='inactive';
  MODE='local';ACCESS_MODE=inactive?'local-inactive':'offline-registered';
  INACTIVE_UID=profile.uid;INACTIVE_NAME=inactive?(profile.name||'aluno'):'';
  CURRENT_USER=inactive?null:{...profile,status:'offline',offlineRegistered:true};
  document.body.classList.remove('trainer-desktop');
  const eyebrow=document.getElementById('hero-eyebrow');if(eyebrow)eyebrow.textContent=inactive?'// protocolo pausado · modo local':'// sessão recuperada · sem conexão';
  const chip=document.getElementById('user-chip-name');if(chip)chip.textContent=profile.name||'aluno';
  renderHome();showScreen('screen-home');
  if(!silent)showToast(inactive?'Consultoria pausada — usando o último plano salvo.':'Servidor indisponível — usando os últimos dados salvos neste aparelho.',true);
  console.warn('Acesso restaurado do cache local:',reason?.code||reason?.message||reason||'sem rede');
  return true;
}

async function credentialDigest(email,password){
  const raw=normalizedName(email)+'|'+password+'|TEAM-BULLS-V9';
  if(window.crypto?.subtle&&window.TextEncoder){
    const value=new TextEncoder().encode(raw);const digest=await crypto.subtle.digest('SHA-256',value);
    return[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  return stableHash(raw)+'_'+stableHash([...raw].reverse().join(''));
}
function bytesToBase64(bytes){let out='';bytes.forEach(byte=>out+=String.fromCharCode(byte));return btoa(out);}
function base64ToBytes(value){const raw=atob(value);return Uint8Array.from(raw,ch=>ch.charCodeAt(0));}
async function deriveOfflineVerifier(email,password,saltB64,iterations=150000){
  if(!window.crypto?.subtle||!window.TextEncoder)return credentialDigest(email,password);
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(normalizedName(email)+'|'+password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:base64ToBytes(saltB64),iterations},material,256);
  return bytesToBase64(new Uint8Array(bits));
}
function offlineCredentialMap(){try{return JSON.parse(localStorage.getItem('team_bulls_offline_credentials')||'{}');}catch(e){return{};}}
function offlineAttemptKey(email){return 'team_bulls_offline_attempt_'+stableHash(normalizedName(email));}
function offlineAttemptState(email){try{return JSON.parse(localStorage.getItem(offlineAttemptKey(email))||'{}');}catch(error){return{};}}
function offlineAttemptWait(email){const state=offlineAttemptState(email),until=Number(state.lockedUntil)||0;return Math.max(0,until-Date.now());}
function registerOfflineFailure(email){
  try{
    const key=offlineAttemptKey(email),current=offlineAttemptState(email),count=(Number(current.count)||0)+1;
    const lockedUntil=count>=5?Date.now()+Math.min(300000,30000*Math.pow(2,Math.min(3,count-5))):0;
    localStorage.setItem(key,JSON.stringify({count,lockedUntil}));
  }catch(error){}
}
function clearOfflineFailures(email){try{localStorage.removeItem(offlineAttemptKey(email));}catch(error){}}
function constantTimeEqual(a,b){
  const left=String(a||''),right=String(b||'');let diff=left.length^right.length,max=Math.max(left.length,right.length);
  for(let index=0;index<max;index++)diff|=(left.charCodeAt(index)||0)^(right.charCodeAt(index)||0);
  return diff===0;
}
async function rememberOfflineCredential(email,password,uid,profile={}){
  try{
    const map=offlineCredentialMap();
    const saltBytes=new Uint8Array(16);crypto.getRandomValues(saltBytes);
    const salt=bytesToBase64(saltBytes),iterations=150000;
    map[normalizedName(email)]={version:2,uid,email,name:profile.name||CURRENT_USER?.name||email.split('@')[0],status:profile.status||CURRENT_USER?.status||'active',salt,iterations,verifier:await deriveOfflineVerifier(email,password,salt,iterations)};
    localStorage.setItem('team_bulls_offline_credentials',JSON.stringify(map));
  }catch(e){console.warn('offline credential',e);}
}
function updateOfflineCredentialProfile(profile){
  if(!profile?.email)return;cacheUserProfile(profile);try{const map=offlineCredentialMap(),key=normalizedName(profile.email);if(map[key]){map[key]={...map[key],uid:profile.uid,name:profile.name||map[key].name,status:profile.status||'active'};localStorage.setItem('team_bulls_offline_credentials',JSON.stringify(map));}}catch(e){}
}
async function offlineRegisteredLogin(email,password){
  try{
    const wait=offlineAttemptWait(email);
    if(wait>0){showAuthError('login-error','Muitas tentativas offline. Aguarde '+Math.ceil(wait/1000)+' segundos e tente novamente.');return false;}
    const key=normalizedName(email),map=offlineCredentialMap(),record=map[key];
    let valid=false;
    if(record?.version===2&&record.salt&&record.verifier){valid=constantTimeEqual(record.verifier,await deriveOfflineVerifier(email,password,record.salt,Number(record.iterations)||150000));}
    else if(record?.hash){valid=constantTimeEqual(record.hash,await credentialDigest(email,password));}
    if(!record||!valid){registerOfflineFailure(email);showAuthError('login-error','Este aparelho ainda não possui uma autenticação offline válida para essa conta. Entre uma vez com internet.');return false;}
    clearOfflineFailures(email);
    if(record.version!==2)await rememberOfflineCredential(email,password,record.uid,record);
    selectLocalOwner(record.uid,true);localStorage.setItem('teamms_last_user_uid',record.uid);
    localStorage.setItem(OFFLINE_MODE_KEY,'registered');localStorage.removeItem('teamms_offline_pref');
    const inactive=record.status==='inactive';
    MODE='local';ACCESS_MODE=inactive?'local-inactive':'offline-registered';INACTIVE_UID=record.uid;INACTIVE_NAME=inactive?(record.name||'aluno'):'';
    CURRENT_USER=inactive?null:{uid:record.uid,name:record.name||'aluno',email:record.email||email,role:'student',status:'offline',offlineRegistered:true};
    document.body.classList.remove('trainer-desktop');
    document.getElementById('hero-eyebrow').textContent=inactive?'// protocolo pausado · modo local':'// conta reconhecida · sem internet';
    document.getElementById('user-chip-name').textContent=record.name||'aluno';
    const ib=document.getElementById('inactive-banner');
    if(ib&&inactive)ib.innerHTML='⏸ Consultoria pausada — seu último plano permanece disponível localmente. Vídeos online ficam bloqueados.';
    renderHome();showScreen('screen-home');showToast(inactive?'Modo local para aluno pausado':'Modo offline com registro ativo');return true;
  }catch(e){console.error(e);showAuthError('login-error','Não foi possível validar o acesso offline neste aparelho.');return false;}
}

async function doLogin(){
  clearAuthError('login-error');
  const email=document.getElementById('login-email').value.trim();
  const pass=document.getElementById('login-pass').value;
  if(!email||!pass){showAuthError('login-error','Preencha e-mail e senha.');return;}
  const btn=document.getElementById('btn-login');
  if(btn.disabled)return;
  btn.disabled=true;btn.textContent='ENTRANDO...';
  try{
    if(navigator.onLine&&!auth){btn.textContent='CONECTANDO...';await ensureFirebaseReady();}
    if(!navigator.onLine||!auth){await offlineRegisteredLogin(email,pass);return;}
    startAuthListener();
    AUTH_HANDLED=false;startBootWatchdog();setLoadingMessage('validando acesso...');
    const cred=await withTimeout(auth.signInWithEmailAndPassword(email,pass),12000,'login');
    await rememberOfflineCredential(email,pass,cred.user.uid);
    clearTransientAuthSecrets();
  }catch(e){
    if(isNetworkLikeError(e)){await offlineRegisteredLogin(email,pass);}
    else{
      const msgs={'auth/user-not-found':'Conta não encontrada.','auth/wrong-password':'Senha incorreta.','auth/invalid-email':'E-mail inválido.','auth/too-many-requests':'Muitas tentativas. Aguarde.','auth/invalid-credential':'E-mail ou senha incorretos.'};
      showAuthError('login-error',msgs[e.code]||'Não foi possível entrar. Tente novamente.');
    }
  }finally{btn.disabled=false;btn.textContent='ACESSAR SISTEMA';}
}

async function sendPasswordReset(){
  clearAuthError('reset-error');clearAuthSuccess('reset-success');
  const input=document.getElementById('reset-email');
  const email=String(input?.value||'').trim();
  if(!email){showAuthError('reset-error','Informe o e-mail usado no cadastro.');input?.focus();return;}
  if(!input.checkValidity()){showAuthError('reset-error','Digite um endereço de e-mail válido.');input?.focus();return;}
  if(!navigator.onLine){showAuthError('reset-error','A recuperação de senha exige conexão com a internet.');return;}
  const btn=document.getElementById('btn-reset-password');
  if(!btn||btn.disabled)return;
  btn.disabled=true;btn.textContent='ENVIANDO...';
  try{
    if(!auth&&!(await ensureFirebaseReady()))throw Object.assign(new Error('Firebase indisponível'),{code:'team-bulls/firebase-unavailable'});
    auth.languageCode='pt-BR';
    await withTimeout(auth.sendPasswordResetEmail(email),12000,'envio do e-mail de recuperação');
    const loginEmail=document.getElementById('login-email');if(loginEmail)loginEmail.value=email;
    showAuthSuccess('reset-success','Se existir uma conta vinculada a este e-mail, enviaremos um link para redefinir a senha. Verifique também Spam e Promoções.');
  }catch(error){
    const code=String(error?.code||'');
    if(code==='auth/user-not-found'){
      showAuthSuccess('reset-success','Se existir uma conta vinculada a este e-mail, enviaremos um link para redefinir a senha. Verifique também Spam e Promoções.');
    }else if(code==='auth/invalid-email')showAuthError('reset-error','Digite um endereço de e-mail válido.');
    else if(code==='auth/too-many-requests')showAuthError('reset-error','Muitas solicitações foram feitas. Aguarde alguns minutos e tente novamente.');
    else if(code==='auth/network-request-failed'||code==='team-bulls/timeout')showAuthError('reset-error','Não foi possível conectar ao serviço de recuperação. Verifique a internet e tente novamente.');
    else if(code==='auth/operation-not-allowed')showAuthError('reset-error','A recuperação por e-mail ainda não está habilitada no Firebase. Avise o treinador.');
    else {console.error('password reset',error);showAuthError('reset-error','Não foi possível enviar o link agora. Tente novamente em alguns minutos.');}
  }finally{btn.disabled=false;btn.textContent='ENVIAR LINK DE RECUPERAÇÃO';}
}

async function doRegister(){
  showAuthError('reg-error','O cadastro seguro por convite ainda está carregando. Aguarde alguns segundos e tente novamente.');
}


function goOffline(){
  MODE='local';ACCESS_MODE='local-guest';CURRENT_USER=null;INACTIVE_NAME='';INACTIVE_UID='';
  selectLocalOwner(LOCAL_GUEST_OWNER,!localStorage.getItem('teamms_last_user_uid'));
  localStorage.setItem(OFFLINE_MODE_KEY,'guest');localStorage.setItem('teamms_offline_pref','1');
  document.getElementById('hero-eyebrow').textContent='// modo local independente';
  document.getElementById('user-chip-name').textContent='local';
  renderHome();showScreen('screen-home');
}

function handleChipTap(){
  if(MODE==='local'){
    showConfirm('Entrar com conta','Deseja fazer login para sincronizar seus dados na nuvem?',()=>{
      localStorage.removeItem('teamms_offline_pref');
      localStorage.removeItem(OFFLINE_MODE_KEY);
      if(!auth || !db) initFirebase();
      AUTH_HANDLED=false;
      startAuthListener();
      showScreen('screen-auth');
    });
  }else{
    confirmLogout();
  }
}

async function confirmLogout(){
  showConfirm('Sair','Deseja sair da sua conta?',async()=>{
    stopProfileGuard();
    // ── Antes de deslogar: atualiza a cópia offline deste aluno ──
    // Garante que o aluno tenha acesso aos dados mesmo sem conta
    if(CURRENT_USER && CLOUD_WORKOUTS && CLOUD_WORKOUTS.length > 0){
      try{
        // Substitui dados deste usuário no offline (preserva deletes, não acumula)
        replaceLocalForUser(CURRENT_USER.uid, CLOUD_WORKOUTS);
      }catch(e){ console.warn('Erro ao copiar dados cloud para offline:', e); }
    }
    try{
      if(auth) await withTimeout(auth.signOut(),4000,'saída da conta').catch(()=>{});
    }catch(e){}
    localStorage.removeItem('teamms_offline_pref');
    localStorage.removeItem(OFFLINE_MODE_KEY);
    localStorage.removeItem('teamms_migrating');
    MIGRATION_RUNNING = false;
    AUTH_HANDLED = false;
    MODE='local';
    ACCESS_MODE='local-guest';
    document.body.classList.remove('trainer-desktop');
    CURRENT_USER=null;
    INACTIVE_NAME='';
    INACTIVE_UID='';
    VIEW_STUDENT=null;
    VIEW_STUDENT_WORKOUT=null;
    VIEW_STUDENT_DAY='';
    VIEW_STUDENT_EXERCISE=null;
    CLOUD_LOAD_SEQ++;
    TRAINER_LIST_LOAD_SEQ++;
    TRAINER_STUDENT_LOAD_SEQ++;
    PHOTOS_LOAD_SEQ++;
    CLOUD_WORKOUTS=[];
    PHOTOS_CACHE=[];PHOTOS_CACHE_UID=null;
    HOME_BANNERS_KEY='';HOME_BANNERS_LAST=0;
    const feedbackBanner=document.getElementById('feedback-banner');if(feedbackBanner)feedbackBanner.style.display='none';
    const questBanner=document.getElementById('quest-banner');if(questBanner)questBanner.style.display='none';
    HISTORY_BY_NAME={};
    CUR_WORKOUT=null;
    CUR_DAY='';
    CUR_EX=null;
    const btn=document.getElementById('btn-login');
    if(btn){btn.disabled=false;btn.textContent='ACESSAR SISTEMA';}
    const btn2=document.getElementById('btn-register');
    if(btn2){btn2.disabled=false;btn2.textContent='CRIAR NOVO REGISTRO';}
    showScreen('screen-auth');
  });
}

/* ══════════════════════════════════════════════════
   AUTH STATE LISTENER
══════════════════════════════════════════════════ */
let AUTH_HANDLED=false;
let AUTH_UNSUBSCRIBE=null;
let AUTH_EXPECTED_LOCAL_SIGNOUT=false;
let PROFILE_UNSUBSCRIBE=null;
function stopProfileGuard(){if(PROFILE_UNSUBSCRIBE){try{PROFILE_UNSUBSCRIBE();}catch(error){}PROFILE_UNSUBSCRIBE=null;}}
async function enterInactiveLocalMode(profile,{preserveCloud=false}={}){
  const uid=String(profile?.uid||'');if(!uid)return false;
  if(preserveCloud&&CURRENT_USER?.uid===uid&&CLOUD_WORKOUTS.length)replaceLocalForUser(uid,CLOUD_WORKOUTS);
  else selectLocalOwner(uid,true);
  stopProfileGuard();AUTH_EXPECTED_LOCAL_SIGNOUT=true;
  await withTimeout(auth?.signOut?.()||Promise.resolve(),3500,'saída para modo inativo').catch(()=>{});
  AUTH_EXPECTED_LOCAL_SIGNOUT=false;
  CURRENT_USER=null;MODE='local';ACCESS_MODE='local-inactive';document.body.classList.remove('trainer-desktop');
  INACTIVE_NAME=String(profile.name||'aluno').slice(0,100);INACTIVE_UID=uid;localLoad();
  const eyebrow=document.getElementById('hero-eyebrow');if(eyebrow)eyebrow.textContent='// protocolo pausado · modo local';
  const chip=document.getElementById('user-chip-name');if(chip)chip.textContent=INACTIVE_NAME;
  const banner=document.getElementById('inactive-banner');if(banner)banner.textContent='⏸ Consultoria pausada — o último plano salvo continua disponível localmente. Vídeos online permanecem bloqueados.';
  renderHome();showScreen('screen-home');showToast('Acesso online pausado pelo treinador. O último plano continua disponível localmente.',true);
  return true;
}
function startProfileGuard(userId){
  stopProfileGuard();
  if(!db||!userId)return;
  try{
    PROFILE_UNSUBSCRIBE=db.collection('users').doc(userId).onSnapshot(async snapshot=>{
      if(!snapshot.exists){await withTimeout(auth?.signOut?.()||Promise.resolve(),3000,'encerramento de perfil removido').catch(()=>{});return;}
      const next=sanitizeCachedProfile({...snapshot.data(),uid:userId},userId);if(!next)return;
      cacheUserProfile(next);
      if(CURRENT_USER?.role==='trainer'&&next.role!=='trainer'){
        stopProfileGuard();await withTimeout(auth.signOut(),3000,'encerramento de acesso do treinador').catch(()=>{});return;
      }
      if(CURRENT_USER?.role==='student'){
        CURRENT_USER={...CURRENT_USER,name:next.name,email:next.email,status:next.status};updateOfflineCredentialProfile(CURRENT_USER);
        if(next.status==='inactive'&&ACCESS_MODE==='cloud-active')await enterInactiveLocalMode(next,{preserveCloud:true});
      }
    },error=>console.warn('Profile guard:',error?.code||error?.message));
  }catch(error){console.warn('Profile guard init:',error);}
}

// createUserWithEmailAndPassword dispara o listener antes de o documento do
// perfil terminar de ser gravado. Um retry curto evita deslogar uma conta nova
// por confundir essa janela de poucos milissegundos com "perfil inexistente".
async function getUserProfileWithRetry(userId){
  let lastError=null;
  const attempts=navigator.onLine?2:1;
  for(let attempt=0;attempt<attempts;attempt++){
    try{
      const snap=await withTimeout(db.collection('users').doc(userId).get(),PROFILE_READ_TIMEOUT_MS,'leitura do perfil');
      if(snap.exists)return snap;
      if(attempt===attempts-1)return null;
    }catch(error){lastError=error;if(!navigator.onLine||!isNetworkLikeError(error))break;}
    if(attempt<attempts-1)await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(lastError)throw lastError;
  return null;
}

let AUTH_CALLBACK_SEEN=false;
let AUTH_PROCESSING_UID='';
let AUTH_STATE_REVISION=0;
let AUTH_LISTENER_SERVICE=null;
async function handleAuthStateUser(user){
  AUTH_CALLBACK_SEEN=true;
  if(!user){
    AUTH_STATE_REVISION++;
    AUTH_HANDLED=false;
    AUTH_PROCESSING_UID='';
    if(AUTH_EXPECTED_LOCAL_SIGNOUT)return;
    stopProfileGuard();CURRENT_USER=null;document.body.classList.remove('trainer-desktop');VIEW_STUDENT=null;VIEW_STUDENT_WORKOUT=null;VIEW_STUDENT_DAY='';VIEW_STUDENT_EXERCISE=null;
    if(!['local-inactive','local-guest','offline-registered'].includes(ACCESS_MODE))showScreen('screen-auth');
    return;
  }
  if(AUTH_PROCESSING_UID===user.uid)return;
  if(AUTH_HANDLED&&CURRENT_USER?.uid===user.uid&&ACCESS_MODE!=='offline-registered')return;
  AUTH_PROCESSING_UID=user.uid;
  const revision=++AUTH_STATE_REVISION,service=auth;
  const current=()=>revision===AUTH_STATE_REVISION&&auth===service&&auth?.currentUser?.uid===user.uid;
  AUTH_HANDLED=true;
  setLoadingMessage('validando perfil...');

  // Assim que o Firebase confirma qual usuário está autenticado, o aluno pode
  // abrir imediatamente o último plano local. Vídeos e gravações na nuvem só são
  // liberados depois que o perfil remoto é validado.
  let cachedShellOpened=false;
  try{
    cachedShellOpened=restoreCachedStudentAccess(user,{code:'team-bulls/fast-session'},{silent:true});
    let snap;
    try{snap=await getUserProfileWithRetry(user.uid);}
    catch(profileError){if(!current())return;if(cachedShellOpened||restoreCachedStudentAccess(user,profileError))return;throw profileError;}
    if(!current())return;
    if(!snap){
      AUTH_HANDLED=false;
      await withTimeout(auth.signOut(),2500,'saída de conta sem perfil').catch(()=>{});
      bootToAuth('O cadastro desta conta está incompleto. Entre em contato com o treinador.');
      return;
    }
    CURRENT_USER={...snap.data(),uid:user.uid};
    if(!['trainer','student'].includes(CURRENT_USER.role))throw new Error('Perfil sem função válida.');
    CURRENT_USER.status=CURRENT_USER.status==='inactive'?'inactive':'active';
    cacheUserProfile(CURRENT_USER);updateOfflineCredentialProfile(CURRENT_USER);
    configureAuthPersistence(CURRENT_USER.role);

    if(CURRENT_USER.role==='trainer'){
      MODE='cloud';ACCESS_MODE='trainer';INACTIVE_NAME='';INACTIVE_UID='';
      document.body.classList.add('trainer-desktop');
      showScreen('screen-trainer');startProfileGuard(user.uid);
      renderTrainer();
      return;
    }

    const previousLastUid=storageGet('teamms_last_user_uid')||'';
    const pendingOwner=storageGet('teamms_migration_owner')||'';
    const allowLegacy=!previousLastUid||previousLastUid===user.uid||pendingOwner===user.uid;
    selectLocalOwner(user.uid,allowLegacy);storageSet('teamms_last_user_uid',user.uid);

    if(CURRENT_USER.status==='inactive'){
      await enterInactiveLocalMode(CURRENT_USER,{preserveCloud:false});
      return;
    }

    MODE='cloud';ACCESS_MODE='cloud-active';document.body.classList.remove('trainer-desktop');INACTIVE_NAME='';INACTIVE_UID='';
    storageRemove('teamms_offline_pref');storageRemove(OFFLINE_MODE_KEY);
    const eyebrow=document.getElementById('hero-eyebrow');if(eyebrow)eyebrow.textContent='// sistema online · protocolo ativo';
    const chip=document.getElementById('user-chip-name');if(chip)chip.textContent=CURRENT_USER.name||'aluno';

    const cached=loadCloudBackup(user.uid);
    CLOUD_WORKOUTS=cached;populateHistoryFromWorkouts(cached);renderHome();showScreen('screen-home');startProfileGuard(user.uid);

    const hasOffline=hasStoredLocal();
    const hasPending=storageGet('teamms_migration_pending')==='1'&&(!pendingOwner||pendingOwner===user.uid);
    const legacyNeedsCheck=hasOffline&&!storageGet('teamms_cloud_mirror_'+user.uid)&&(!pendingOwner||pendingOwner===user.uid);
    (async()=>{
      if(!current())return;
      if(hasPending||legacyNeedsCheck)await migrateLocalToCloud(user.uid,{background:true});
      if(!current())return;
      await loadCloudHome();
    })().catch(error=>console.warn('Sincronização pós-login:',error));
  }catch(error){
    if(!current())return;
    console.error('Auth handler error:',error);
    AUTH_HANDLED=false;
    if(cachedShellOpened||restoreCachedStudentAccess(user,error))return;
    bootToAuth(isNetworkLikeError(error)?'O servidor não respondeu. Treinadores precisam de conexão; alunos podem usar o acesso offline já validado.':'Não foi possível validar este perfil. Entre novamente.');
  }finally{
    if(revision===AUTH_STATE_REVISION&&AUTH_PROCESSING_UID===user.uid)AUTH_PROCESSING_UID='';
  }
}
function startAuthListener(){
  if(!auth){bootToAuth('O serviço de autenticação não foi carregado. Tente corrigir a atualização.');return;}
  if(AUTH_UNSUBSCRIBE&&AUTH_LISTENER_SERVICE===auth){
    // Retomar o app reutiliza a assinatura; somente uma validação pendente/falha é retomada.
    if(auth.currentUser&&!AUTH_PROCESSING_UID&&(!AUTH_HANDLED||ACCESS_MODE==='offline-registered'))handleAuthStateUser(auth.currentUser);
    return;
  }
  if(AUTH_UNSUBSCRIBE){AUTH_UNSUBSCRIBE();AUTH_UNSUBSCRIBE=null;}
  const service=auth;AUTH_LISTENER_SERVICE=service;
  AUTH_CALLBACK_SEEN=false;
  AUTH_UNSUBSCRIBE=service.onAuthStateChanged(user=>{if(AUTH_LISTENER_SERVICE===service&&auth===service)handleAuthStateUser(user);},error=>{
    if(AUTH_LISTENER_SERVICE!==service||auth!==service)return;
    AUTH_UNSUBSCRIBE?.();AUTH_UNSUBSCRIBE=null;AUTH_LISTENER_SERVICE=null;AUTH_STATE_REVISION++;
    console.error('Auth state error:',error);AUTH_HANDLED=false;AUTH_PROCESSING_UID='';
    bootToAuth('Falha ao consultar a sessão. Você já pode tentar entrar novamente ou usar o modo local.');
  });
  // Em alguns navegadores currentUser já está restaurado antes do primeiro
  // callback. Usá-lo reduz uma espera desnecessária sem liberar dados de treinador.
  queueMicrotask(()=>{if(AUTH_LISTENER_SERVICE===service&&auth===service&&!AUTH_CALLBACK_SEEN&&service.currentUser)handleAuthStateUser(service.currentUser);});
}

/* ══════════════════════════════════════════════════
   SCREENS
══════════════════════════════════════════════════ */
// Um treino local só tem `userId` quando veio da nuvem (foi criado pelo treinador
// e baixado para cache offline — ver mergeIntoLocal/replaceLocalForUser/migração).
// Treinos criados localmente por saveWorkout() em modo local puro NUNCA têm userId.
// Isso nos diz, sem precisar de outra flag, se este cache local pertence a um
// aluno vinculado a um treinador (e portanto NÃO pode criar treino/exercício novo
// mesmo offline, já que isso nunca vai conseguir sincronizar) ou se é uso solo real.
function hasCloudLinkedWorkouts(){
  return (LOCAL_DB.workouts||[]).some(w=>!!w.userId);
}
function canSelfManagePlan(){
  // Apenas o modo local puro e o ex-aluno pausado podem montar o próprio plano.
  // Uma conta ativa reconhecida offline só registra resultados no plano profissional
  // já armazenado; estruturas novas nesse modo não teriam como sincronizar com segurança.
  return MODE==='local' && (ACCESS_MODE==='local-guest'||ACCESS_MODE==='local-inactive');
}
function canUseCatalogVideos(){return MODE==='cloud'&&CURRENT_USER?.role==='student'&&CURRENT_USER?.status!=='inactive';}
function beginAsyncNavigation(){return ++NAVIGATION_SEQ;}
function isNavigationCurrent(token){return token===NAVIGATION_SEQ;}
function showScreen(id,expectedToken=null){
  if(expectedToken!==null&&!isNavigationCurrent(expectedToken))return false;
  const target=document.getElementById(id);
  if(!target){console.error('Tela inexistente:',id);window.TeamBullsRecovery?.reveal?.('Uma parte da interface não foi carregada corretamente.');return false;}
  NAVIGATION_SEQ++;
  document.querySelectorAll('.screen').forEach(screen=>screen.classList.remove('active'));
  target.classList.add('active');
  try{window.scrollTo(0,0);}catch(error){}
  const isReadonly=CURRENT_USER?.role==='trainer'&&VIEW_STUDENT!==null;
  const display=(elementId,visible)=>{const element=document.getElementById(elementId);if(element)element.style.display=visible?'flex':'none';};
  display('fab-home',id==='screen-home'&&!isReadonly&&canSelfManagePlan());
  display('fab-workout',id==='screen-workout'&&!isReadonly&&canSelfManagePlan());
  display('fab-day',id==='screen-day'&&!isReadonly&&canSelfManagePlan());
  display('fab-exercise',id==='screen-exercise'&&!isReadonly);
  display('fab-ts-workout',id==='screen-trainer-student');
  display('fab-ts-day-folder',id==='screen-ts-workout');
  display('fab-ts-exercise',id==='screen-ts-day');
  display('fab-meals',id==='screen-meals'&&MODE==='local');
  display('fab-ts-meals',id==='screen-ts-meals');
  display('fab-photos',id==='screen-photos'&&!isReadonly);
  display('fab-free-meals',id==='screen-free-meals'&&CURRENT_USER?.role!=='trainer');
  if(id==='screen-exercise'||id==='screen-ts-exercise')display('btn-del-exercise',id==='screen-exercise'&&!isReadonly&&canSelfManagePlan());
  if(id!=='screen-loading')finishBoot();
  return true;
}

function goHome(){CUR_WORKOUT=null;CUR_DAY='';CUR_EX=null;if(MODE==='local'){renderHome();}else{loadCloudHome();}showScreen('screen-home');}
function goWorkout(){CUR_DAY='';renderWorkout();showScreen('screen-workout');}
function goDay(){if(!CUR_DAY)return goWorkout();renderDay();showScreen('screen-day');}
function goTrainer(){VIEW_STUDENT=null;VIEW_STUDENT_WORKOUT=null;VIEW_STUDENT_DAY='';renderTrainer();showScreen('screen-trainer');}
function goTrainerStudent(){VIEW_STUDENT_WORKOUT=null;VIEW_STUDENT_DAY='';renderTrainerStudent(VIEW_STUDENT);showScreen('screen-trainer-student');}
function goTsWorkout(){VIEW_STUDENT_DAY='';renderTsWorkout(VIEW_STUDENT_WORKOUT);showScreen('screen-ts-workout');}
function goTsDay(){if(!VIEW_STUDENT_DAY)return goTsWorkout();renderTsDay();showScreen('screen-ts-day');}
let SETTINGS_FROM='home';
function openSettings(){SETTINGS_FROM=CURRENT_USER?.role==='trainer'?'trainer':'home';syncSettingsUi();showScreen('screen-settings');}
function goBackFromSettings(){if(SETTINGS_FROM==='trainer')goTrainer();else goHome();}

/* ══════════════════════════════════════════════════
   LOCAL HOME
══════════════════════════════════════════════════ */
function renderHome(){
  document.getElementById('user-chip-name').textContent=CURRENT_USER?.name||INACTIVE_NAME||'offline';
  const qnFood=document.getElementById('qn-food');
  if(qnFood) qnFood.style.display='flex';
  const qnExopt=document.getElementById('qn-exopt');
  if(qnExopt) qnExopt.style.display='flex';
  const eyebrow=document.getElementById('hero-eyebrow');
  if(eyebrow&&MODE==='local')eyebrow.textContent=ACCESS_MODE==='offline-registered'?'// conta reconhecida · sem internet':ACCESS_MODE==='local-inactive'?'// consultoria pausada · modo local':'// modo local 100%';
  const inactiveBanner=document.getElementById('inactive-banner');
  if(inactiveBanner) inactiveBanner.style.display=INACTIVE_NAME?'block':'none';
  updateDebugBar();
  const sourceWorkouts=MODE==='local'?LOCAL_DB.workouts:CLOUD_WORKOUTS;
  const ws=normalizeWorkoutCollection(sourceWorkouts);
  if(MODE==='local')LOCAL_DB.workouts=ws;else CLOUD_WORKOUTS=ws;
  const currentActiveId=activeWorkoutId(ws);
  const list=document.getElementById('workout-list');
  const empty=document.getElementById('workout-empty');
  const stats=document.getElementById('home-stats');
  const nW=ws.length,nE=ws.reduce((a,w)=>a+w.exercises.length,0),nS=ws.reduce((a,w)=>a+w.exercises.reduce((acc2,e)=>acc2+e.sessions.length,0),0);
  stats.innerHTML=`<div class="stat-cell"><div class="num">${nW}</div><div class="lbl">Protocolos</div></div><div class="stat-cell"><div class="num">${nE}</div><div class="lbl">Exercícios</div></div><div class="stat-cell"><div class="num">${nS}</div><div class="lbl">Registros</div></div>`;
  // Feedback e relatórios também precisam aparecer para um aluno que ainda
  // não recebeu treinos. Antes o retorno abaixo impedia as duas consultas.
  loadFeedbackBanner();
  if(!nW){
    list.innerHTML='';
    empty.style.display='block';
    const hint=empty.querySelector('.empty-hint');
    if(hint) hint.textContent=canSelfManagePlan()?'Toque em + NOVO PROTOCOLO para começar':'Seu treinador ainda não montou seu protocolo de treino';
    return;
  }
  empty.style.display='none';
  list.innerHTML=ws.map(w=>{
    const last=lastDate(w);
    const dayCount=getWorkoutDays(w).length;
    const meta=(last?'Último: '+fmt(last):dayCount+' '+(dayCount===1?'dia':'dias'));
    const wid=jsArg(w.id),wn=esc(w.name),isActive=String(w.id)===currentActiveId;
    // Editar/excluir treino: só quem se autogerencia de verdade (ver canSelfManagePlan). Na nuvem, o treino é montado pelo treinador.
    const editActions=canSelfManagePlan()?`<button class="btn-icon ghost" onclick="event.stopPropagation();openEditWorkout(${wid})" title="Editar">✏️</button><button class="btn-icon ghost" onclick="event.stopPropagation();showConfirm('Excluir treino','Excluir este treino e todos os seus dados?',function(){deleteWorkout(${wid});})" title="Excluir">🗑</button>`:'';
    const actions=`<div class="workout-card-actions"><button class="btn-icon ghost" onclick="event.stopPropagation();exportWorkoutPdfById(${wid},false)" title="Salvar PDF">PDF</button>${editActions}</div>`;
    return`<div class="workout-card ${isActive?'is-active':'is-inactive'}" style="--wcard-color:${w.color}" onclick="openWorkout(${wid})">
      <div class="workout-card-info"><div class="protocol-state-badge ${isActive?'active':'inactive'}">${isActive?'● TREINO ATIVO':'○ DESATIVADO'}</div><div class="workout-card-name">${wn}</div><div class="workout-card-meta">${meta} · ${esc(v104CycleMeta(w))} · ${w.exercises.length} exerc.${isActive?' · plano atual':' · treino anterior disponível'}</div></div>
      ${actions}
    </div>`;
  }).join('');
}

function lastDate(w){let b=null;(w.exercises||[]).forEach(e=>(e.sessions||[]).forEach(s=>{if(s.date&&(!b||s.date>b))b=s.date;}));return b;}


function pdfEscape(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function workoutPdfHtml(workout,studentName){
  const days=groupExercisesByDay(workout.exercises||[],getWorkoutDays(workout));
  const sections=days.map(([day,items])=>`<section><h2>${pdfEscape(day)}</h2>${items.map(ex=>`<article><h3>${pdfEscape(ex.name)}</h3>${String(ex.instructions||'').trim()?`<div class="instruction"><b>Instruções:</b> ${pdfEscape(ex.instructions).replace(/\n/g,'<br>')}</div>`:''}<table><thead><tr><th>Semana</th><th>Prescrição</th></tr></thead><tbody>${[1,2,3,4,5,6,7,8].map(week=>{const rx=resolveWeekPrescription(ex,week);const text=rx.sets.length?rx.sets.map((set,i)=>`${i+1}ª: ${exerciseHasBcTechnique(ex,week)?BC_PRESCRIPTION_TARGET:set.targetMin+'-'+set.targetMax+' reps'} · GER ${String(set.ger).padStart(2,'0')}`).join('<br>'):'Sem exercício';return`<tr><td>Semana ${week}</td><td>${text}</td></tr>`;}).join('')}</tbody></table></article>`).join('')}</section>`).join('');
  return`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="color-scheme" content="light"><title>${pdfEscape(workout.name)}</title><style>@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#161616}header{border-bottom:3px solid #9b2024;padding-bottom:10px;margin-bottom:18px}h1{font-size:25px;margin:0;text-transform:uppercase}header p{margin:5px 0 0;color:#555}h2{font-size:19px;background:#111;color:#fff;padding:8px 10px;margin:18px 0 8px}article{break-inside:avoid;margin-bottom:14px}h3{font-size:16px;margin:0 0 6px;color:#8f1e22}.instruction{font-size:11px;line-height:1.45;background:#f3eeee;border-left:3px solid #9b2024;padding:7px 9px;margin:0 0 7px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #bbb;padding:6px;text-align:left;vertical-align:top}th{background:#eee}footer{margin-top:20px;font-size:9px;color:#777;text-align:center}</style></head><body><header><h1>TEAM BULLS — ${pdfEscape(workout.name)}</h1><p>Aluno: ${pdfEscape(studentName||'Modo local')} · Treino completo organizado por dias</p></header>${sections||'<p>Nenhum exercício cadastrado.</p>'}<footer>Gerado pelo Team Bulls v10.1. No diálogo de impressão, escolha “Salvar como PDF”.</footer></body></html>`;
}
function exportWorkoutPdf(workout,studentName){
  if(!workout)return;
  const popup=window.open('','_blank','noopener');
  if(!popup){alert('Permita pop-ups para gerar o PDF.');return;}
  try{
    popup.document.open();popup.document.write(workoutPdfHtml(workout,studentName));popup.document.close();
    setTimeout(()=>{try{popup.focus();popup.print();}catch(error){console.warn('Impressão indisponível',error);}},350);
  }catch(error){try{popup.close();}catch(closeError){}alert('Não foi possível preparar o PDF. Tente novamente.');}
}
function exportWorkoutPdfById(id,trainerMode){const w=trainerMode?VIEW_STUDENT?.workouts?.find(x=>x.id===id):getW(id);exportWorkoutPdf(w,trainerMode?VIEW_STUDENT?.name:(CURRENT_USER?.name||INACTIVE_NAME||'Modo local'));}
function exportCurrentWorkoutPdf(){exportWorkoutPdf(getW(CUR_WORKOUT),CURRENT_USER?.name||INACTIVE_NAME||'Modo local');}
function exportTrainerWorkoutPdf(){exportWorkoutPdf(VIEW_STUDENT_WORKOUT,VIEW_STUDENT?.name||'Aluno');}


/* ══════════════════════════════════════════════════
   CALENDÁRIO DE TREINOS
══════════════════════════════════════════════════ */
/* Agrega, para um mês (0-11), todas as sessões de todos os treinos/exercícios
   por data: {'YYYY-MM-DD': [{exerciseName, workoutName, workoutColor, sets}]} */
function getCalendarMonthData(year,month){
  const workouts=getWorkouts();
  const days={};
  const prefix=year+'-'+String(month+1).padStart(2,'0');
  for(const w of workouts){
    for(const e of (w.exercises||[])){
      for(const s of (e.sessions||[])){
        if(s.date.startsWith(prefix)){
          if(!days[s.date])days[s.date]=[];
          days[s.date].push({exerciseName:e.name,workoutName:w.name,workoutColor:w.color,sets:s.sets});
        }
      }
    }
  }
  return days;
}
function openCalendar(){
  const now=new Date();
  CAL_YEAR=now.getFullYear();CAL_MONTH=now.getMonth();
  renderCalendar();
  showScreen('screen-calendar');
}
function calShiftMonth(delta){
  CAL_MONTH+=delta;
  if(CAL_MONTH<0){CAL_MONTH=11;CAL_YEAR--;}
  if(CAL_MONTH>11){CAL_MONTH=0;CAL_YEAR++;}
  renderCalendar();
}
function renderCalendar(){
  document.getElementById('cal-month-label').textContent=MONTH_NAMES[CAL_MONTH]+' '+CAL_YEAR;
  const data=getCalendarMonthData(CAL_YEAR,CAL_MONTH);
  const firstDow=new Date(CAL_YEAR,CAL_MONTH,1).getDay();
  const daysInMonth=new Date(CAL_YEAR,CAL_MONTH+1,0).getDate();
  const todayStr=today();
  let cells='';
  for(let i=0;i<firstDow;i++) cells+='<div class="cal-cell empty"></div>';
  for(let d=1;d<=daysInMonth;d++){
    const dateStr=CAL_YEAR+'-'+String(CAL_MONTH+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
    const trained=(data[dateStr]||[]).length>0;
    const isToday=dateStr===todayStr;
    cells+=`<div class="cal-cell${trained?' trained':''}${isToday?' today':''}"${trained?` onclick="openCalDay('${dateStr}')"`:''}>
      <span class="cal-daynum">${d}</span>${trained?'<span class="cal-dot"></span>':''}
    </div>`;
  }
  document.getElementById('cal-grid').innerHTML=cells;
  const nDays=Object.keys(data).length;
  document.getElementById('cal-summary').textContent=nDays?(nDays===1?'1 dia treinado neste mês':nDays+' dias treinados neste mês'):'Nenhum treino registrado neste mês';
}
function openCalDay(dateStr){
  const data=getCalendarMonthData(CAL_YEAR,CAL_MONTH);
  const entries=data[dateStr]||[];
  document.getElementById('cal-day-modal-title').textContent=fmt(dateStr);
  document.getElementById('cal-day-modal-body').innerHTML=entries.map(en=>{
    const vol=en.sets.reduce((a,s)=>a+s.weight*s.reps,0);
    return`<div class="cal-day-entry" style="--wcard-color:${esc(en.workoutColor||'var(--accent)')}">
      <div class="cal-day-entry-top"><span class="cal-day-entry-ex">${esc(en.exerciseName)}</span><span class="cal-day-entry-w">${esc(en.workoutName)}</span></div>
      <div class="cal-day-entry-meta">${en.sets.length} séries · Vol: ${vol} kg</div>
    </div>`;
  }).join('');
  openModal('modal-cal-day');
}

/* ══════════════════════════════════════════════════
   CLOUD DATA (in-memory cache for student)
══════════════════════════════════════════════════ */
let CLOUD_WORKOUTS=[];
let CLOUD_LOAD_SEQ=0;

// Arquivo local independente do desenho atual dos treinos. Ele preserva as
// sessões por aluno mesmo quando um exercício é movido, recriado, renomeado ou
// uma leitura temporária do Firestore volta vazia. Nunca mistura UIDs.
const SESSION_ARCHIVE_PREFIX='team_bulls_session_archive_v10_';
const LEGACY_SESSION_ARCHIVE_PREFIX='team_bulls_session_archive_v9_8_1_';
const SESSION_ARCHIVE_MEMORY=new Map();
function sessionArchiveKey(userId){return SESSION_ARCHIVE_PREFIX+String(userId||'');}
function legacySessionArchiveKey(userId){return LEGACY_SESSION_ARCHIVE_PREFIX+String(userId||'');}
function indexedSessionArchiveKey(userId){return'session-archive:'+String(userId||'');}
async function warmSessionArchive(userId){
  if(!userId||SESSION_ARCHIVE_MEMORY.has(userId))return;
  try{
    const value=await mediaGet(indexedSessionArchiveKey(userId));
    if(Array.isArray(value))SESSION_ARCHIVE_MEMORY.set(userId,value);
    else if(typeof value==='string')SESSION_ARCHIVE_MEMORY.set(userId,JSON.parse(value));
  }catch(error){}
}
function normalizeLegacyDate(value){
  const raw=String(value||'').trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;
  const br=/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/.exec(raw);
  return br?`${br[3]}-${br[2]}-${br[1]}`:'';
}
function normalizeLegacyPerformedSets(value){
  if(!Array.isArray(value)||!value.length||value.length>30)return null;
  const result=[];
  for(const raw of value){
    if(!raw||typeof raw!=='object')continue;
    const weight=Number(raw.weight??raw.carga??raw.kg??raw.load??0);
    const reps=Number(raw.reps??raw.repeticoes??raw.repetitions??raw.rep);
    if(!Number.isFinite(weight)||weight<0||weight>10000||!Number.isInteger(reps)||reps<0||reps>100)continue;
    const clean={weight:Math.round(weight*100)/100,reps};
    if(raw.backoff===true)clean.backoff=true;
    const prescription=normalizePrescriptionSet(raw);if(prescription)Object.assign(clean,prescription);
    result.push(clean);
  }
  return result.length?result:null;
}
function sanitizeHistorySession(value,id=''){
  if(!value||typeof value!=='object')return null;
  const sets=normalizePerformedSets(value.sets)||normalizeLegacyPerformedSets(value.sets);
  const date=normalizeLegacyDate(value.date),week=Math.max(1,Math.min(8,parseInt(value.week,10)||1));
  if(!sets||!date)return null;
  return{...value,id:String(id||value.id||value.migrationKey||localGeneratedId()),date,week,note:String(value.note||'').slice(0,2000),exerciseName:String(value.exerciseName||value.exercicio||'').slice(0,100),performedExerciseItemId:String(value.performedExerciseItemId||'').slice(0,100),performedExerciseName:String(value.performedExerciseName||'').slice(0,100),workoutId:String(value.workoutId||''),exerciseId:String(value.exerciseId||''),sets};
}
function sessionIdentity(session){
  if(session?.id)return'id:'+String(session.id);
  if(session?.migrationKey)return'm:'+String(session.migrationKey);
  return'f:'+sessionFingerprint(session||{});
}
function mergeHistorySessions(primary,secondary){
  const map=new Map();
  for(const source of [secondary,primary])for(const raw of(Array.isArray(source)?source:[])){
    const session=sanitizeHistorySession(raw);if(!session)continue;
    const key=sessionIdentity(session);map.set(key,{...(map.get(key)||{}),...session,sets:session.sets.map(set=>({...set}))});
  }
  return[...map.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date))||createdMillis(a)-createdMillis(b)||String(a.id).localeCompare(String(b.id)));
}
function sessionsFromWorkoutTree(workouts){
  const result=[];
  for(const workout of(Array.isArray(workouts)?workouts:[]))for(const exercise of(Array.isArray(workout?.exercises)?workout.exercises:[]))for(const raw of(Array.isArray(exercise?.sessions)?exercise.sessions:[])){
    const session=sanitizeHistorySession({...raw,workoutId:raw.workoutId||workout.id,exerciseId:raw.exerciseId||exercise.id,exerciseName:raw.exerciseName||exercise.name});if(session)result.push(session);
  }
  return result;
}
function loadSessionArchive(userId){
  if(!userId)return[];
  let result=mergeHistorySessions(SESSION_ARCHIVE_MEMORY.get(userId)||[],[]);
  for(const key of[sessionArchiveKey(userId),legacySessionArchiveKey(userId)]){
    try{result=mergeHistorySessions(JSON.parse(storageGet(key)||'[]'),result);}catch(error){}
  }
  // Aproveita espelhos das versões anteriores sem apagar ou alterar esses dados.
  for(const key of['teamms_cloud_'+userId,'teamms_local_'+userId]){
    try{const parsed=JSON.parse(storageGet(key)||'null');const workouts=Array.isArray(parsed)?parsed:(parsed?.workouts||[]);result=mergeHistorySessions(sessionsFromWorkoutTree(workouts),result);}catch(error){}
  }
  SESSION_ARCHIVE_MEMORY.set(userId,result);
  return result;
}
function saveSessionArchive(userId,sessions){
  if(!userId)return false;
  try{
    const merged=mergeHistorySessions(sessions,loadSessionArchive(userId));
    SESSION_ARCHIVE_MEMORY.set(userId,merged);
    const serialized=JSON.stringify(merged),saved=storageSet(sessionArchiveKey(userId),serialized);
    runWhenIdle(()=>mediaPut(indexedSessionArchiveKey(userId),merged),1500);
    return saved||true;
  }catch(error){console.warn('saveSessionArchive',error);return false;}
}
function removeSessionFromArchive(userId,sessionId){
  if(!userId||!sessionId)return;
  try{
    const filtered=loadSessionArchive(userId).filter(session=>String(session.id)!==String(sessionId));
    SESSION_ARCHIVE_MEMORY.set(userId,filtered);storageSet(sessionArchiveKey(userId),JSON.stringify(filtered));
    runWhenIdle(()=>mediaPut(indexedSessionArchiveKey(userId),filtered),1500);
  }catch(error){}
}
async function queryServerFirst(query,label){
  try{return{snapshot:await withTimeout(query.get({source:'server'}),CLOUD_READ_TIMEOUT_MS,label),source:'server'};}
  catch(serverError){
    try{return{snapshot:await withTimeout(query.get({source:'cache'}),Math.min(3500,CLOUD_READ_TIMEOUT_MS),label+' em cache'),source:'cache',serverError};}
    catch(cacheError){throw serverError;}
  }
}
function attachSessionsWithoutLosingOrphans(workouts,sessions){
  const exerciseById=new Map(),workoutById=new Map(),byName=new Map();
  for(const workout of workouts){workoutById.set(String(workout.id),workout);for(const exercise of(workout.exercises||[])){
    exercise.sessions=[];exerciseById.set(String(exercise.id),exercise);
    const key=normalizedName(exercise.name);if(key){if(!byName.has(key))byName.set(key,[]);byName.get(key).push(exercise);}
  }}
  for(const session of sessions){
    let exercise=exerciseById.get(String(session.exerciseId||''));
    const nameKey=normalizedName(session.exerciseName||session.performedExerciseName||'');
    if(!exercise&&session.workoutId&&nameKey){const workout=workoutById.get(String(session.workoutId));const candidates=(workout?.exercises||[]).filter(item=>normalizedName(item.name)===nameKey);if(candidates.length===1)exercise=candidates[0];}
    if(!exercise&&nameKey){const candidates=byName.get(nameKey)||[];if(candidates.length===1)exercise=candidates[0];}
    if(exercise){if(!session.exerciseName)session.exerciseName=exercise.name;exercise.sessions.push(session);}
  }
}

function createdMillis(item){
  const value=item&&item.createdAt;
  if(value&&typeof value.toMillis==='function')return value.toMillis();
  if(value&&Number.isFinite(value.seconds))return value.seconds*1000;
  return 0;
}
function stableCreatedOrder(a,b){
  return createdMillis(a)-createdMillis(b)||normalizedName(a.name).localeCompare(normalizedName(b.name),'pt-BR')||String(a.id).localeCompare(String(b.id));
}
function hasManualOrder(item){return !!item&&item.order!==null&&item.order!==''&&Number.isInteger(Number(item.order))&&Number(item.order)>=0;}
function orderedWorkouts(items){
  return[...(Array.isArray(items)?items:[])].sort((a,b)=>{
    const aManual=hasManualOrder(a),bManual=hasManualOrder(b);
    if(aManual&&bManual)return Number(a.order)-Number(b.order)||createdMillis(b)-createdMillis(a)||String(a.id).localeCompare(String(b.id));
    if(aManual!==bManual)return aManual?-1:1;
    return createdMillis(b)-createdMillis(a)||normalizedName(a.name).localeCompare(normalizedName(b.name),'pt-BR')||String(a.id).localeCompare(String(b.id));
  });
}
function activeWorkoutId(items){
  const ordered=orderedWorkouts(items),explicit=ordered.find(workout=>workout.isActive===true);
  return String((explicit||ordered[0])?.id||'');
}
function normalizeWorkoutCollection(items){
  const ordered=orderedWorkouts(items),activeId=activeWorkoutId(ordered);
  return ordered.map((workout,index)=>({...workout,order:index,isActive:String(workout.id)===activeId}));
}
function exerciseOrderComparator(a,b){
  const aManual=hasManualOrder(a),bManual=hasManualOrder(b);
  if(aManual&&bManual)return Number(a.order)-Number(b.order)||createdMillis(a)-createdMillis(b)||String(a.id).localeCompare(String(b.id));
  if(aManual!==bManual)return aManual?-1:1;
  return createdMillis(a)-createdMillis(b)||normalizedName(a.name).localeCompare(normalizedName(b.name),'pt-BR')||String(a.id).localeCompare(String(b.id));
}
function exercisesForDayUnsorted(workout,dayName){const key=normalizedName(dayName);return(workout?.exercises||[]).filter(exercise=>normalizedName(exercise.dayName||'Treino geral')===key);}
function sortWorkoutExercises(workout){
  if(!workout)return[];
  const days=getWorkoutDays(workout),dayOrder=new Map(days.map((day,index)=>[normalizedName(day.name),index]));
  return[...(workout.exercises||[])].sort((a,b)=>{
    const dayA=dayOrder.get(normalizedName(a.dayName||'Treino geral'))??9999,dayB=dayOrder.get(normalizedName(b.dayName||'Treino geral'))??9999;
    return dayA-dayB||exerciseOrderComparator(a,b);
  });
}
function nextExerciseOrder(workout,dayName){
  const items=exercisesForDayUnsorted(workout,dayName);return items.reduce((max,item)=>Math.max(max,hasManualOrder(item)?Number(item.order):-1),-1)+1;
}

// A estrutura do treino é pequena e crítica para a primeira tela. O histórico
// pode crescer por anos, por isso é hidratado em uma segunda etapa. Assim o
// aluno abre o plano rapidamente mesmo com centenas ou milhares de sessões.
function buildCloudStructure(workoutSnap,exerciseSnap){
  let workouts=workoutSnap.docs.map(d=>{const data=d.data();return{...data,id:d.id,name:String(data.name||'Treino').slice(0,60),color:PALETTE.includes(data.color)?data.color:PALETTE[0],order:hasManualOrder(data)?Number(data.order):null,isActive:data.isActive===true,days:normalizeWorkoutDays(data.days,[]),exercises:[]};});
  const workoutMap=new Map(workouts.map(w=>[String(w.id),w]));
  for(const d of exerciseSnap.docs){
    const data=d.data();const exercise={...data,id:d.id,name:String(data.name||'Exercício').slice(0,100),dayName:String(data.dayName||'Treino geral').slice(0,60),videoUrl:String(data.videoUrl||'').slice(0,2000),instructions:String(data.instructions||'').slice(0,1500),techniqueIds:normalizeExerciseTechniqueIds(data.techniqueIds),optionalTechniqueIds:normalizeExerciseTechniqueIds(data.optionalTechniqueIds).filter(id=>id==='mp'),weeklyTechniquePlan:normalizeWeeklyTechniquePlan(data.weeklyTechniquePlan),supersetExerciseId:String(data.supersetExerciseId||'').slice(0,128),order:hasManualOrder(data)?Number(data.order):null,weeklyPlan:normalizeWeeklyPlan(data.weeklyPlan),sessions:[]};
    const workout=workoutMap.get(String(exercise.workoutId));if(workout)workout.exercises.push(exercise);
  }
  workouts=normalizeWorkoutCollection(workouts);
  workouts.forEach(w=>{w.days=normalizeWorkoutDays(w.days,w.exercises);w.exercises=sortWorkoutExercises(w);});
  return workouts;
}
async function fetchCloudStructure(userId){
  const [workoutResult,exerciseResult]=await Promise.all([
    queryServerFirst(db.collection('workouts').where('userId','==',userId),'treinos'),
    queryServerFirst(db.collection('exercises').where('userId','==',userId),'exercícios')
  ]);
  return{workouts:buildCloudStructure(workoutResult.snapshot,exerciseResult.snapshot),source:workoutResult.source==='server'||exerciseResult.source==='server'?'server':'cache'};
}
async function fetchCloudSessions(userId){
  const query=db.collection('sessions').where('userId','==',userId);
  let result;
  try{result={snapshot:await withTimeout(query.get({source:'server'}),SESSION_READ_TIMEOUT_MS,'histórico de séries'),source:'server'};}
  catch(serverError){
    try{result={snapshot:await withTimeout(query.get({source:'cache'}),4500,'histórico de séries em cache'),source:'cache',serverError};}
    catch(cacheError){throw serverError;}
  }
  const remote=[];for(const d of result.snapshot.docs){const session=sanitizeHistorySession(d.data(),d.id);if(session)remote.push(session);}
  const sessions=mergeHistorySessions(remote,loadSessionArchive(userId));
  if(remote.length||result.source==='server')saveSessionArchive(userId,sessions);
  return{sessions,remoteSessionCount:remote.length,recoveredSessionCount:Math.max(0,sessions.length-remote.length),source:result.source};
}
function hydrateWorkoutSessions(workouts,sessions){
  attachSessionsWithoutLosingOrphans(workouts,sessions);
  workouts.forEach(w=>w.exercises.forEach(e=>e.sessions.sort((a,b)=>String(a.date).localeCompare(String(b.date))||createdMillis(a)-createdMillis(b)||String(a.id).localeCompare(String(b.id)))));
  return workouts;
}
async function fetchCloudData(userId){
  const [structure,history]=await Promise.all([fetchCloudStructure(userId),fetchCloudSessions(userId)]);
  return{workouts:hydrateWorkoutSessions(structure.workouts,history.sessions),sessions:history.sessions,remoteSessionCount:history.remoteSessionCount,recoveredSessionCount:history.recoveredSessionCount,sessionSource:history.source};
}
async function hydrateHomeSessions(userId,loadSeq){
  try{
    const history=await fetchCloudSessions(userId);
    if(loadSeq!==CLOUD_LOAD_SEQ||CURRENT_USER?.uid!==userId||MODE!=='cloud')return false;
    hydrateWorkoutSessions(CLOUD_WORKOUTS,history.sessions);HISTORY_BY_NAME=buildHistoryByName(history.sessions);saveCloudBackup();renderHome();
    if(history.recoveredSessionCount>0)showToast(`✓ ${history.recoveredSessionCount} registro${history.recoveredSessionCount===1?'':'s'} recuperado${history.recoveredSessionCount===1?'':'s'} do histórico protegido`);
    return true;
  }catch(error){console.warn('Histórico será mantido pelo arquivo local:',error?.code||error?.message);return false;}
}
async function loadCloudHome(){
  if(!CURRENT_USER)return false;
  const userId=CURRENT_USER.uid,loadSeq=++CLOUD_LOAD_SEQ;
  await withTimeout(warmSessionArchive(userId),900,'abrir arquivo local').catch(()=>{});
  // Primeiro mostra o último estado bom sem esperar rede.
  if(!CLOUD_WORKOUTS.length){
    CLOUD_WORKOUTS=loadCloudBackup(userId);const archived=loadSessionArchive(userId);if(CLOUD_WORKOUTS.length)hydrateWorkoutSessions(CLOUD_WORKOUTS,archived);HISTORY_BY_NAME=buildHistoryByName(archived);renderHome();
  }
  try{
    const structure=await fetchCloudStructure(userId);
    if(loadSeq!==CLOUD_LOAD_SEQ||CURRENT_USER?.uid!==userId||MODE!=='cloud')return false;
    const archived=loadSessionArchive(userId);CLOUD_WORKOUTS=hydrateWorkoutSessions(structure.workouts,archived);HISTORY_BY_NAME=buildHistoryByName(archived);saveCloudBackup();renderHome();
    // Não bloqueia a navegação: histórico e banners são tarefas de fundo.
    runWhenIdle(()=>hydrateHomeSessions(userId,loadSeq),1800);
    return true;
  }catch(e){
    console.error('loadCloudHome error:',e.code,e.message);
    if(loadSeq!==CLOUD_LOAD_SEQ||CURRENT_USER?.uid!==userId)return false;
    if(!CLOUD_WORKOUTS.length){CLOUD_WORKOUTS=loadCloudBackup(userId);const archived=loadSessionArchive(userId);hydrateWorkoutSessions(CLOUD_WORKOUTS,archived);HISTORY_BY_NAME=buildHistoryByName(archived);}
    renderHome();showToast('Sem conexão com o servidor — exibindo os últimos dados salvos.',true);return false;
  }
}

async function checkFeedback(){
  if(!CURRENT_USER||CURRENT_USER.role==='trainer')return;
  const studentUid=CURRENT_USER.uid;
  const banner=document.getElementById('feedback-banner');
  try{
    let docs;
    try{
      const ordered=await cloudGet(db.collection('feedback')
        .where('studentId','==',studentUid).where('read','==',false)
        .orderBy('createdAt','desc').limit(1),'feedback pendente');
      docs=ordered.docs;
    }catch(indexError){
      // Funciona mesmo antes de o índice composto ser criado.
      const fallback=await cloudGet(db.collection('feedback').where('studentId','==',studentUid),'feedback do aluno');
      docs=fallback.docs.filter(doc=>!doc.data().read).sort((a,b)=>createdMillis(b.data())-createdMillis(a.data())).slice(0,1);
    }
    if(CURRENT_USER?.uid!==studentUid)return;
    if(!docs.length){if(banner)banner.style.display='none';return;}
    const doc=docs[0];showFeedbackBanner(doc.id,doc.data().message);
  }catch(e){console.warn('checkFeedback',e.code||e.message);}
}

function showFeedbackBanner(fid,msg){
  const b=document.getElementById('feedback-banner');
  document.getElementById('feedback-banner-text').textContent=msg;
  b.dataset.fid=fid;
  b.style.display='block';
}
async function dismissFeedback(){
  const b=document.getElementById('feedback-banner');
  const fid=b.dataset.fid;
  b.style.display='none';
  if(fid&&db) try{await cloudWrite(db.collection('feedback').doc(fid).update({read:true}),'marcar feedback');}catch(e){}
}
let HOME_BANNERS_KEY='',HOME_BANNERS_LAST=0;
function loadFeedbackBanner(force=false){
  if(MODE!=='cloud'||!CURRENT_USER)return;
  const key=CURRENT_USER.uid;
  const now=Date.now();
  if(!force&&HOME_BANNERS_KEY===key&&now-HOME_BANNERS_LAST<30000)return;
  HOME_BANNERS_KEY=key;HOME_BANNERS_LAST=now;
  Promise.allSettled([checkFeedback(),checkQuestionnaires()]);
}

/* ══════════════════════════════════════════════════
   WORKOUT NAVIGATION
══════════════════════════════════════════════════ */
function getWorkouts(){return (MODE==='local')?LOCAL_DB.workouts:CLOUD_WORKOUTS;}
function getW(id){return getWorkouts().find(w=>w.id===id);}
function getE(wid,eid){const w=getW(wid);return w?w.exercises.find(e=>e.id===eid):null;}

/* ── Histórico compartilhado por nome ─────────────────────────────────
   Agrega sessões de TODOS os exercícios com o mesmo nome (case-insensitive)
   em todos os treinos do usuário. Retorna array ordenado por data asc.
   ws = array de workouts opcional (padrão: getWorkouts()) ──────────── */
// Histórico de séries por NOME do exercício, independente do treino/exercício
// ainda existir. Alimentado em loadCloudHome()/renderTrainerStudent() com uma
// busca direta em `sessions` (por userId). Assim, mesmo que o treino/exercício
// original seja excluído depois, getSharedSessions() ainda encontra as séries
// antigas para mesclar com um exercício novo de mesmo nome.
let HISTORY_BY_NAME={};
function buildHistoryByName(allSessions){
  const map={};
  for(const s of allSessions){
    const norm=(s.exerciseName||'').trim().toLowerCase();
    if(!norm) continue;
    (map[norm]=map[norm]||[]).push(s);
  }
  return map;
}
function getSharedSessions(exerciseOrName,ws){
  const target=exerciseOrName&&typeof exerciseOrName==='object'?exerciseOrName:null;
  const exerciseName=target?.name||exerciseOrName||'';
  const norm=normalizedName(exerciseName);
  const workouts=ws||getWorkouts();
  const liveMatches=[];
  for(const workout of workouts)for(const exercise of(workout.exercises||[]))if(normalizedName(exercise.name)===norm)liveMatches.push({workout,exercise});
  const separateById=!!target&&liveMatches.length>1;
  const all=[];const seen=new Set();
  for(const {workout,exercise} of liveMatches){
    if(separateById&&String(exercise.id)!==String(target.id))continue;
    for(const session of(exercise.sessions||[])){
      if(seen.has(session.id))continue;
      seen.add(session.id);
      all.push({...session,_wName:workout.name,_wColor:workout.color||'var(--accent)',_wid:workout.id,_eid:exercise.id});
    }
  }
  for(const session of(HISTORY_BY_NAME[norm]||[])){
    if(seen.has(session.id))continue;
    if(separateById&&String(session.exerciseId||'')!==String(target.id))continue;
    seen.add(session.id);
    all.push({...session,_archived:!liveMatches.some(({exercise})=>String(exercise.id)===String(session.exerciseId||''))});
  }
  return all.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||createdMillis(a)-createdMillis(b)||String(a.id).localeCompare(String(b.id)));
}
function sessionMaxWeight(session){
  const values=(session?.sets||[]).map(s=>Number(s.weight)).filter(Number.isFinite);
  return values.length?Math.max(...values):0;
}
/* Localiza treino+exercício dono de uma sessão — usado por delete e edit */
function findSessionOwner(sid,ws){
  const workouts=ws||getWorkouts();
  for(const w of workouts){
    for(const e of (w.exercises||[])){
      const s=(e.sessions||[]).find(x=>x.id===sid);
      if(s)return{workout:w,exercise:e,session:s};
    }
  }
  return null;
}
function removeSessionFromHistory(sid){
  for(const key of Object.keys(HISTORY_BY_NAME)){
    HISTORY_BY_NAME[key]=(HISTORY_BY_NAME[key]||[]).filter(s=>s.id!==sid);
    if(!HISTORY_BY_NAME[key].length)delete HISTORY_BY_NAME[key];
  }
}
function syncSessionToHistory(session){
  if(!session?.id)return;
  removeSessionFromHistory(session.id);
  const key=normalizedName(session.exerciseName);
  if(!key)return;
  (HISTORY_BY_NAME[key]=HISTORY_BY_NAME[key]||[]).push({...session});
  HISTORY_BY_NAME[key].sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
}

function openWorkout(id){CUR_WORKOUT=id;CUR_DAY='';renderWorkout();showScreen('screen-workout');}
function groupExercisesByDay(exercises,orderedDays=[]){
  const map=new Map();
  for(const day of (orderedDays||[])){const name=safeDayName(day?.name||day);if(!map.has(name))map.set(name,[]);}
  for(const exercise of (exercises||[])){const day=safeDayName(exercise.dayName||'Treino geral');if(!map.has(day))map.set(day,[]);map.get(day).push(exercise);}
  for(const items of map.values())items.sort(exerciseOrderComparator);
  return[...map.entries()];
}
function exercisesForDay(workout,dayName){return exercisesForDayUnsorted(workout,dayName).sort(exerciseOrderComparator);}
function dayLastDate(items){let value=null;for(const exercise of items)for(const session of(exercise.sessions||[])){if(session.date&&(!value||session.date>value))value=session.date;}return value;}
function dayPrescriptionCount(items){let count=0;for(const exercise of items)for(let week=1;week<=8;week++)if(resolveWeekPrescription(exercise,week).sets.length)count++;return count;}
function renderDayFolders(workout,trainerMode=false){
  const days=getWorkoutDays(workout),canEdit=trainerMode||canSelfManagePlan(),target=trainerMode?'student':'self';
  return days.map((day,index)=>{
    const items=exercisesForDay(workout,day.name),last=dayLastDate(items),rx=dayPrescriptionCount(items);
    const meta=`${items.length} ${items.length===1?'exercício':'exercícios'} · ${rx} semanas prescritas${last?' · Último: '+fmt(last):''}`;
    const dayArg=jsArg(day.name),openCall=trainerMode?'openTsDay':'openDay';
    const reorder=canEdit?`<div class="day-order-controls"><button class="drag-handle" data-drag-handle="day" onclick="event.stopPropagation()" title="Segure e arraste para reordenar" aria-label="Arrastar dia">⋮⋮</button><button class="order-btn" ${index===0?'disabled':''} onclick="event.stopPropagation();moveDayFolder(${dayArg},-1,'${target}')" title="Mover dia para cima">↑</button><button class="order-btn" ${index===days.length-1?'disabled':''} onclick="event.stopPropagation();moveDayFolder(${dayArg},1,'${target}')" title="Mover dia para baixo">↓</button></div>`:'';
    const actions=canEdit?`<div class="day-folder-actions"><button class="btn-icon ghost" onclick="event.stopPropagation();openEditDayModal(${dayArg},'${target}')" title="Renomear pasta">✏️</button><button class="btn-icon ghost" onclick="event.stopPropagation();showConfirm('Excluir pasta do dia','A pasta será removida. Exercícios existentes serão movidos para Treino geral, sem apagar séries ou histórico.',function(){deleteDayFolder(${dayArg},'${target}');})" title="Excluir pasta">🗑</button></div>`:'';
    return`<div class="day-folder-card ${canEdit?'reorderable-card':''}" data-reorder-day="${esc(day.name)}" style="--wcard-color:${esc(workout.color||'var(--accent)')}" onclick="${openCall}(${dayArg})">${reorder}<div class="day-folder-icon">DIA</div><div class="day-folder-info"><div class="day-folder-name">${esc(day.name)}</div><div class="day-folder-meta">${esc(meta)}</div></div>${actions}<div class="exercise-row-arrow">›</div></div>`;
  }).join('');
}
function protocolSummaryHtml(workout,dayName=''){
  const days=getWorkoutDays(workout),items=dayName?exercisesForDay(workout,dayName):(workout?.exercises||[]),sessions=items.reduce((sum,e)=>sum+(e.sessions||[]).length,0);
  const title=dayName?safeDayName(dayName):workout?.name||'Treino';
  const meta=dayName?`${workout?.name||'Protocolo'} · ${items.length} exercícios · ${sessions} registros`:`${days.length} ${days.length===1?'pasta de dia':'pastas de dias'} · ${items.length} exercícios · ${sessions} registros`;
  return`<div class="archive-file-kicker">${dayName?'PASTA DO DIA':'PASTA PRINCIPAL DO PROTOCOLO'}</div><div class="protocol-summary-title">${esc(title)}</div><div class="protocol-summary-meta">${esc(meta)}</div>`;
}
function toggleWorkoutOverview(trainerMode){
  const panel=document.getElementById(trainerMode?'trainer-workout-overview':'student-workout-overview'),button=document.getElementById(trainerMode?'trainer-overview-toggle':'student-overview-toggle');if(!panel||!button)return;
  const open=!panel.classList.contains('open');panel.classList.toggle('open',open);button.textContent=open?'▤ OCULTAR VISÃO GERAL DAS 8 SEMANAS':'▤ MOSTRAR VISÃO GERAL DAS 8 SEMANAS';
}
function renderExerciseRows(exercises,trainerMode=false){
  const ordered=[...(exercises||[])].sort(exerciseOrderComparator);
  return ordered.map((e,index)=>{
    const shared=getSharedSessions(e,trainerMode?VIEW_STUDENT?.workouts:undefined);
    const last=shared.length?shared[shared.length-1]:null;
    const week=trainerMode?TRAINER_ACTIVE_WEEK:LAST_SESSION_WEEK;
    const rx=prescriptionCompactSummary(e,week);
    const info=(rx.rx.sets.length?`Sem. ${week}: ${rx.ger} · ${rx.reps}`:'Sem prescrição')+(last?' · Último: '+fmt(last.date):'');
    const eid=jsArg(e.id);
    const orderControls=trainerMode?`<div class="exercise-order-controls"><button class="drag-handle" data-drag-handle="exercise" onclick="event.stopPropagation()" title="Segure e arraste para reordenar" aria-label="Arrastar exercício">⋮⋮</button><button class="order-btn" ${index===0?'disabled':''} onclick="event.stopPropagation();moveTrainerExercise(${eid},-1)" title="Mover exercício para cima">↑</button><button class="order-btn" ${index===ordered.length-1?'disabled':''} onclick="event.stopPropagation();moveTrainerExercise(${eid},1)" title="Mover exercício para baixo">↓</button></div>`:'';
    const instructionHint=String(e.instructions||'').trim()?` · 📝 ${esc(String(e.instructions).trim().slice(0,70))}${String(e.instructions).trim().length>70?'…':''}`:'';
    const techniqueItems=techniqueItemsForExercise(e),partner=findSupersetPartner(e);
    const techniqueBadges=techniqueItems.length?`<div class="exercise-row-techniques">${techniqueItems.map(item=>`<span>${esc(item.code)}</span>`).join('')}${partner?`<b>Conjugado com ${esc(partner.name)}</b>`:''}</div>`:'';
    return`<div class="exercise-row ${trainerMode?'trainer-orderable reorderable-card':''} ${partner?'superset-linked':''}" data-reorder-exercise="${esc(e.id)}" onclick="${trainerMode?'openTsExercise':'openExercise'}(${eid})"><div class="exercise-row-dot"></div><div class="exercise-row-info"><div class="exercise-row-name">${esc(e.name)}</div><div class="exercise-row-last">${info}${instructionHint}</div>${techniqueBadges}</div>${orderControls}${trainerMode?`<button class="btn-icon ghost" style="width:28px;height:28px;font-size:13px" onclick="event.stopPropagation();showConfirm('Excluir exercício','Excluir este exercício? O histórico de séries fica preservado.',function(){deleteTsExercise(${eid});})" title="Excluir">🗑</button>`:''}<div class="exercise-row-arrow">›</div></div>`;
  }).join('');
}
function renderWorkout(){
  const w=getW(CUR_WORKOUT);if(!w)return goHome();syncWorkoutDays(w);
  document.getElementById('workout-screen-title').textContent='TREINO // '+w.name;
  document.getElementById('student-protocol-summary').innerHTML=protocolSummaryHtml(w);
  buildWeeklyBoard(w,'student-weekly-board',false);
  const list=document.getElementById('day-folder-list'),empty=document.getElementById('day-folder-empty'),days=getWorkoutDays(w);
  list.innerHTML=renderDayFolders(w,false);empty.style.display=days.length?'none':'block';bindReorderContainer(list,'day','self');
  const toggle=document.getElementById('student-overview-toggle');if(toggle)toggle.style.display=w.exercises.length?'block':'none';
  const panel=document.getElementById('student-workout-overview');if(panel)panel.classList.remove('open');if(toggle)toggle.textContent='▤ MOSTRAR VISÃO GERAL DAS 8 SEMANAS';
}
function openDay(dayName){
  const w=getW(CUR_WORKOUT),day=getWorkoutDays(w).find(item=>normalizedName(item.name)===normalizedName(dayName));if(!w||!day)return goWorkout();
  CUR_DAY=day.name;renderDay();showScreen('screen-day');
}
function renderDay(){
  const w=getW(CUR_WORKOUT);if(!w)return goHome();const day=getWorkoutDays(w).find(item=>normalizedName(item.name)===normalizedName(CUR_DAY));if(!day)return goWorkout();
  CUR_DAY=day.name;const items=exercisesForDay(w,day.name),dayWorkout={...w,exercises:items};
  document.getElementById('day-screen-title').textContent='DIA // '+day.name;
  document.getElementById('student-day-summary').innerHTML=protocolSummaryHtml(w,day.name);
  buildWeeklyBoard(dayWorkout,'student-day-weekly-board',false);
  const list=document.getElementById('exercise-list'),empty=document.getElementById('exercise-empty');
  list.innerHTML=renderExerciseRows(items,false);empty.style.display=items.length?'none':'block';
}
function openExercise(eid){
  CUR_EX=eid;miniChart=null;tsMiniChart=null;CHART_MODE='weight';
  const e=getE(CUR_WORKOUT,CUR_EX);if(!e)return goDay();
  document.getElementById('exercise-screen-title').textContent=e.name.toUpperCase();
  renderExerciseInstructions(e,'exercise-instructions-box',false);
  renderExercisePrescription(e,'exercise-prescription-card',LAST_SESSION_WEEK,MODE==='local'&&canSelfManagePlan(),false);
  renderExerciseSubstitutions(e,'exercise-substitution-box');
  buildSessions(e,'sessions-list',false,CUR_WORKOUT);
  renderExerciseVideo(e,'exercise-video-box','student');
  showScreen('screen-exercise');
  // Render chart AFTER screen is visible so canvas has correct dimensions
  requestAnimationFrame(()=>{ buildChart(e,'progressChart',CHART_MODE,null); });
}
function renderExercise(){
  const e=getE(CUR_WORKOUT,CUR_EX);if(!e)return goDay();
  document.getElementById('exercise-screen-title').textContent=e.name.toUpperCase();
  renderExerciseInstructions(e,'exercise-instructions-box',false);
  renderExercisePrescription(e,'exercise-prescription-card',LAST_SESSION_WEEK,MODE==='local'&&canSelfManagePlan(),false);
  renderExerciseSubstitutions(e,'exercise-substitution-box');
  buildSessions(e,'sessions-list',false,CUR_WORKOUT);
  renderExerciseVideo(e,'exercise-video-box','student');
  requestAnimationFrame(()=>{ buildChart(e,'progressChart',CHART_MODE,null); });
}

function renderExerciseInstructions(exercise,elementId,trainerMode=false){
  const el=document.getElementById(elementId);if(!el)return;
  const text=String(exercise?.instructions||'').trim();
  if(!text){
    el.innerHTML=trainerMode?'<button class="btn-add-set exercise-instructions-empty" onclick="openEditExerciseModalTs()">+ ADICIONAR INSTRUÇÕES AO EXERCÍCIO</button>':'';
    return;
  }
  const formatted=esc(text).replace(/\n/g,'<br>');
  el.innerHTML=`<div class="exercise-instructions-card"><div class="exercise-instructions-head"><span>ORIENTAÇÕES DO TREINADOR</span>${trainerMode?'<button class="instruction-edit-btn" onclick="openEditExerciseModalTs()">EDITAR</button>':''}</div><div class="exercise-instructions-text">${formatted}</div></div>`;
}

/* ══════════════════════════════════════════════════
   VÍDEO DE EXECUÇÃO
══════════════════════════════════════════════════ */
/* ── Planejamento semanal em grade (referência de 8 semanas) ── */
function buildWeeklyBoard(workout,elId,trainerMode){
  const el=document.getElementById(elId);if(!el)return;
  const exercises=sortWorkoutExercises(workout);
  if(!exercises.length){el.innerHTML='<div class="prescription-empty">Adicione exercícios para montar as semanas.</div>';return;}
  const weeks=Array.from({length:8},(_,i)=>i+1);
  const activeWeek=trainerMode?TRAINER_ACTIVE_WEEK:LAST_SESSION_WEEK;
  const head=weeks.map(week=>`<th class="${week===activeWeek?'active-week':''}">Semana ${week}</th>`).join('');
  const rows=exercises.map(exercise=>{
    const openExerciseCall=trainerMode
      ?`openTsWeekExercise(${jsArg(exercise.id)},${TRAINER_ACTIVE_WEEK})`
      :`openStudentWeekExercise(${jsArg(exercise.id)},${LAST_SESSION_WEEK})`;
    const cells=weeks.map(week=>{
      const summary=prescriptionCompactSummary(exercise,week);
      const completed=(exercise.sessions||[]).filter(s=>Number(s.week)===week).length;
      const openWeekCall=trainerMode
        ?`openPrescriptionModal(${jsArg(exercise.id)},${week},'trainer')`
        :`openStudentWeekExercise(${jsArg(exercise.id)},${week})`;
      const maxGer=summary.rx.sets.reduce((max,set)=>Math.max(max,Number(set.ger)||0),0);
      const content=summary.rx.sets.length
        ?`<span class="weekly-ger">${esc(summary.ger)}</span>${renderGerMeter(maxGer)}<span class="weekly-rx">${esc(summary.reps)}</span>${summary.rx.inherited?`<span class="weekly-inherited">herda S${summary.rx.sourceWeek}</span>`:''}`
        :'<span class="weekly-empty">sem prescrição</span>';
      return`<td><button class="weekly-cell-btn${completed?' completed':''}${week===activeWeek?' active-week':''}" onclick="${openWeekCall}">${completed?`<span class="weekly-done">✓${completed>1?' '+completed:''}</span>`:''}${content}</button></td>`;
    }).join('');
    return`<tr><td><button class="weekly-exercise-name" onclick="${openExerciseCall}">${esc(exercise.name)}</button></td>${cells}</tr>`;
  }).join('');
  el.innerHTML=`<div class="weekly-plan-scroll"><table class="weekly-plan-table"><thead><tr><th>Exercício</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
function openStudentWeekExercise(eid,week){
  LAST_SESSION_WEEK=Math.max(1,Math.min(8,Number(week)||1));
  openExercise(eid);
}
function openTsWeekExercise(eid,week){
  TRAINER_ACTIVE_WEEK=Math.max(1,Math.min(8,Number(week)||1));
  openTsExercise(eid);
}
function changeExerciseWeek(delta,trainerMode){
  if(trainerMode){
    TRAINER_ACTIVE_WEEK=Math.max(1,Math.min(8,TRAINER_ACTIVE_WEEK+delta));
    if(VIEW_STUDENT_EXERCISE)renderExercisePrescription(VIEW_STUDENT_EXERCISE,'ts-exercise-prescription-card',TRAINER_ACTIVE_WEEK,true,true);
  }else{
    LAST_SESSION_WEEK=Math.max(1,Math.min(8,LAST_SESSION_WEEK+delta));
    const e=getE(CUR_WORKOUT,CUR_EX);
    if(e)renderExercisePrescription(e,'exercise-prescription-card',LAST_SESSION_WEEK,MODE==='local'&&canSelfManagePlan(),false);
  }
}
function renderExercisePrescription(exercise,elId,week,canEdit,trainerMode){
  const el=document.getElementById(elId);if(!el||!exercise)return;
  const rx=resolveWeekPrescription(exercise,week);
  const completed=(exercise.sessions||[]).filter(s=>Number(s.week)===Number(week));
  const rows=rx.sets.length?rx.sets.map((set,index)=>
    `<div class="prescription-set-row"><span class="prescription-set-number">${index+1}ª</span><span class="prescription-range">${esc(prescribedRangeLabel(set))} reps</span><span class="ger-pill">${formatGerLevel(set.ger)} ${renderGerMeter(set.ger)}</span></div>`
  ).join(''):'<div class="prescription-empty">Nenhuma série prescrita para esta semana.</div>';
  const source=rx.inherited?`Herdada da semana ${rx.sourceWeek}`:(rx.sourceWeek?'Personalizada nesta semana':'Aguardando prescrição');
  const target=trainerMode?'trainer':'local';
  const action=canEdit
    ?`<button class="btn-primary" onclick="openPrescriptionModal(${jsArg(exercise.id)},${week},'${target}')">✎ EDITAR PRESCRIÇÃO</button>`
    :`<button class="btn-primary" onclick="openLogSessionModal()">REGISTRAR RESULTADO</button>`;
  el.innerHTML=`<div class="prescription-card">
    <div class="prescription-card-head">
      <div><div class="prescription-eyebrow">Prescrição do treinador</div><div class="prescription-title">Semana ${week}</div><div class="prescription-source">${esc(source)}</div></div>
      <div class="week-stepper"><button onclick="changeExerciseWeek(-1,${trainerMode?'true':'false'})" ${week<=1?'disabled':''}>‹</button><span>${week}/8</span><button onclick="changeExerciseWeek(1,${trainerMode?'true':'false'})" ${week>=8?'disabled':''}>›</button></div>
    </div>
    <div class="prescription-set-list">${rows}</div>
    ${completed.length?`<div class="prescription-result">✓ ${completed.length} ${completed.length===1?'sessão registrada':'sessões registradas'} nesta semana</div>`:''}
    <div class="prescription-actions"><button class="btn-ghost" onclick="openGerInfo()">? ESCALA GER</button>${action}</div>
  </div>`;
}

/* ── Editor de prescrição do treinador ── */
function getPlanEditExercise(){
  if(PLAN_EDIT_TARGET==='trainer')return VIEW_STUDENT_WORKOUT?.exercises?.find(e=>e.id===PLAN_EDIT_EID)||null;
  return getE(PLAN_EDIT_WID,PLAN_EDIT_EID);
}
function openPrescriptionModal(eid,week,target){
  const trainerTarget=target==='trainer';
  if(trainerTarget&&CURRENT_USER?.role!=='trainer'){alert('Somente o treinador pode alterar esta prescrição.');return;}
  if(!trainerTarget&&!(MODE==='local'&&canSelfManagePlan())){alert('A prescrição é definida pelo treinador.');return;}
  PLAN_EDIT_TARGET=trainerTarget?'trainer':'local';
  PLAN_EDIT_WID=trainerTarget?VIEW_STUDENT_WORKOUT?.id:CUR_WORKOUT;
  PLAN_EDIT_EID=eid;
  const exercise=getPlanEditExercise();if(!exercise)return;
  document.getElementById('modal-prescription-title').textContent='Prescrever — '+exercise.name;
  document.getElementById('input-prescription-week').value=String(Math.max(1,Math.min(8,Number(week)||1)));
  loadPrescriptionEditor();
  openModal('modal-prescription');
}
function loadPrescriptionEditor(){
  const exercise=getPlanEditExercise();if(!exercise)return;
  const week=Number(document.getElementById('input-prescription-week').value)||1;
  const rx=resolveWeekPrescription(exercise,week);
  const directPlan=normalizeWeeklyPlan(exercise.weeklyPlan);
  const direct=Object.prototype.hasOwnProperty.call(directPlan,'w'+week);
  const help=document.getElementById('prescription-source-help');
  help.textContent=direct
    ?(rx.sets.length?'Esta semana possui uma prescrição personalizada.':'Este exercício foi removido desta semana.')
    :(rx.sourceWeek?'Exibindo a prescrição herdada da semana '+rx.sourceWeek+'. Ao salvar, esta semana passa a ser personalizada.':'Sem prescrição anterior. Preencha a primeira semana do ciclo.');
  PLAN_SET_COUNT=0;
  document.getElementById('prescription-editor').innerHTML='';
  if(rx.sets.length)rx.sets.forEach(set=>addPrescriptionSetRow(set.targetMin,set.targetMax,set.ger));
  else for(let i=0;i<3;i++)addPrescriptionSetRow(8,12,3);
  const replicateButton=document.getElementById('btn-replicate-prescription');
  if(replicateButton){
    replicateButton.disabled=week>=8;
    replicateButton.textContent=week>=8?'ESTA JÁ É A SEMANA 8':'REPASSAR ATÉ A SEMANA 8';
  }
}
let LAST_PRESCRIPTION_TEMPLATE={targetMin:8,targetMax:12,ger:3};
function prescriptionTemplateFromRow(row){
  if(!row)return null;
  const targetMin=parseInt(row.querySelector('[data-f="min"]')?.value,10);
  const targetMax=parseInt(row.querySelector('[data-f="max"]')?.value,10);
  const ger=parseInt(row.querySelector('[data-f="ger"]')?.value,10);
  return normalizePrescriptionSet({targetMin,targetMax,ger});
}
function rememberPrescriptionRow(row){
  const editor=document.getElementById('prescription-editor');if(!editor||!row)return;
  editor.querySelectorAll('.plan-set-row.last-edited').forEach(item=>item.classList.remove('last-edited'));
  row.classList.add('last-edited');
  const value=prescriptionTemplateFromRow(row);if(value)LAST_PRESCRIPTION_TEMPLATE=value;
}
function addPrescriptionSetRow(targetMin,targetMax,ger){
  if(PLAN_SET_COUNT>=30){alert('Limite de 30 séries prescritas.');return;}
  if(arguments.length===0){
    const editor=document.getElementById('prescription-editor');
    const source=editor?.querySelector('.plan-set-row.last-edited')||editor?.lastElementChild;
    const inherited=prescriptionTemplateFromRow(source)||LAST_PRESCRIPTION_TEMPLATE;
    targetMin=inherited.targetMin;targetMax=inherited.targetMax;ger=inherited.ger;
  }else{
    const normalized=normalizePrescriptionSet({targetMin,targetMax,ger})||LAST_PRESCRIPTION_TEMPLATE;
    targetMin=normalized.targetMin;targetMax=normalized.targetMax;ger=normalized.ger;
  }
  PLAN_SET_COUNT++;
  const row=document.createElement('div');row.className='plan-set-row';
  row.innerHTML=`<span class="set-edit-num">${PLAN_SET_COUNT}ª</span>
    <input class="set-edit-input" type="number" min="1" max="100" step="1" value="${esc(targetMin)}" data-f="min" aria-label="Repetições mínimas">
    <input class="set-edit-input" type="number" min="1" max="100" step="1" value="${esc(targetMax)}" data-f="max" aria-label="Repetições máximas">
    <select class="set-edit-input" data-f="ger" aria-label="GER">${GER_DEFINITIONS.map(item=>`<option value="${item.level}"${Number(ger)===item.level?' selected':''}>${formatGerLevel(item.level)}</option>`).join('')}</select>
    <button class="btn-rm-set" onclick="removePrescriptionSet(this)">✕</button>`;
  row.querySelectorAll('input,select').forEach(field=>{field.addEventListener('focus',()=>rememberPrescriptionRow(row));field.addEventListener('input',()=>rememberPrescriptionRow(row));field.addEventListener('change',()=>rememberPrescriptionRow(row));});
  document.getElementById('prescription-editor').appendChild(row);
  rememberPrescriptionRow(row);
}
function removePrescriptionSet(btn){
  btn.closest('.plan-set-row').remove();
  document.querySelectorAll('#prescription-editor .plan-set-row').forEach((row,index)=>row.querySelector('.set-edit-num').textContent=(index+1)+'ª');
  PLAN_SET_COUNT=document.querySelectorAll('#prescription-editor .plan-set-row').length;
}
function copyPreviousPrescription(){
  const exercise=getPlanEditExercise();if(!exercise)return;
  const week=Number(document.getElementById('input-prescription-week').value)||1;
  if(week<=1){alert('A semana 1 não possui uma semana anterior.');return;}
  const previous=resolveWeekPrescription(exercise,week-1);
  if(!previous.sets.length){alert('A semana anterior não possui prescrição.');return;}
  PLAN_SET_COUNT=0;document.getElementById('prescription-editor').innerHTML='';
  previous.sets.forEach(set=>addPrescriptionSetRow(set.targetMin,set.targetMax,set.ger));
  document.getElementById('prescription-source-help').textContent='Cópia da semana '+(week-1)+' pronta para ser salva nesta semana.';
}
function collectPrescriptionRows(){
  const rows=[...document.querySelectorAll('#prescription-editor .plan-set-row')];
  if(!rows.length){alert('Adicione ao menos uma série prescrita.');return null;}
  const sets=[];
  for(const row of rows){
    const targetMin=parseInt(row.querySelector('[data-f="min"]').value,10);
    const targetMax=parseInt(row.querySelector('[data-f="max"]').value,10);
    const ger=parseInt(row.querySelector('[data-f="ger"]').value,10);
    const normalized=normalizePrescriptionSet({targetMin,targetMax,ger});
    if(!normalized){alert('Confira a faixa de repetições e o GER de todas as séries.');return null;}
    sets.push(normalized);
  }
  return sets;
}
async function persistPrescription(sets,replicate){
  const exercise=getPlanEditExercise();if(!exercise)return false;
  const week=Number(document.getElementById('input-prescription-week').value)||1,actionKey='save-prescription-'+exercise.id;
  if(!beginAction(actionKey,'modal-prescription'))return false;
  const previous=normalizeWeeklyPlan(exercise.weeklyPlan),weeklyPlan=buildWeeklyPlanUpdate(previous,week,sets,replicate);
  try{
    if(PLAN_EDIT_TARGET==='trainer')await cloudWrite(db.collection('exercises').doc(exercise.id).update({weeklyPlan}),'salvar prescrição');
    else{exercise.weeklyPlan=weeklyPlan;if(!localSave()){exercise.weeklyPlan=previous;throw new Error('Falha ao gravar no armazenamento local.');}}
    exercise.weeklyPlan=weeklyPlan;closeModal('modal-prescription');
    if(PLAN_EDIT_TARGET==='trainer'){TRAINER_ACTIVE_WEEK=week;if(VIEW_STUDENT_WORKOUT){if(VIEW_STUDENT_DAY)renderTsDay();else renderTsWorkout(VIEW_STUDENT_WORKOUT);}if(VIEW_STUDENT_EXERCISE?.id===exercise.id)renderExercisePrescription(exercise,'ts-exercise-prescription-card',week,true,true);}
    else{LAST_SESSION_WEEK=week;if(CUR_DAY)renderDay();else renderWorkout();if(CUR_EX===exercise.id)renderExercise();}
    showToast(replicate?'✓ Prescrição repassada até a semana 8':'✓ Prescrição da semana salva');return true;
  }catch(error){exercise.weeklyPlan=previous;alert('Erro ao salvar a prescrição: '+error.message);return false;}
  finally{endAction(actionKey,'modal-prescription');}
}
function buildWeeklyPlanUpdate(currentPlan,week,sets,replicate=false){
  const safeWeek=Math.max(1,Math.min(8,Number(week)||1));
  const weeklyPlan=normalizeWeeklyPlan(currentPlan);
  weeklyPlan['w'+safeWeek]=clonePrescriptionSets(sets);
  if(replicate){
    for(let next=safeWeek+1;next<=8;next++)weeklyPlan['w'+next]=clonePrescriptionSets(sets);
  }
  return weeklyPlan;
}
async function savePrescription(replicate){
  const sets=collectPrescriptionRows();if(!sets)return;
  return persistPrescription(sets,!!replicate);
}
function confirmReplicatePrescription(){
  const week=Number(document.getElementById('input-prescription-week').value)||1;
  if(week>=8){showToast('A prescrição já está na semana 8.',true);return;}
  const sets=collectPrescriptionRows();if(!sets)return;
  showConfirm(
    'Repassar prescrição',
    'Copiar a prescrição da semana '+week+' para as semanas '+(week+1)+' a 8? As personalizações já existentes nessas semanas serão substituídas.',
    ()=>persistPrescription(clonePrescriptionSets(sets),true)
  );
}
function clearPrescriptionWeek(){
  const week=Number(document.getElementById('input-prescription-week').value)||1;
  showConfirm('Remover da semana','Deixar este exercício sem prescrição na semana '+week+'?',()=>persistPrescription([],false));
}

function extractYouTubeId(value){
  const raw=String(value||'').trim();
  if(/^[A-Za-z0-9_-]{11}$/.test(raw))return raw;
  try{
    const url=new URL(/^https?:\/\//i.test(raw)?raw:'https://'+raw);
    const host=url.hostname.toLowerCase().replace(/^www\./,'');
    if(host==='youtu.be')return /^[A-Za-z0-9_-]{11}$/.test(url.pathname.split('/').filter(Boolean)[0]||'')?url.pathname.split('/').filter(Boolean)[0]:'';
    if(!['youtube.com','m.youtube.com','music.youtube.com','youtube-nocookie.com'].includes(host))return'';
    const queryId=url.searchParams.get('v');if(queryId&&/^[A-Za-z0-9_-]{11}$/.test(queryId))return queryId;
    const parts=url.pathname.split('/').filter(Boolean);
    if(['embed','shorts','live'].includes(parts[0])&&/^[A-Za-z0-9_-]{11}$/.test(parts[1]||''))return parts[1];
  }catch(e){}
  return'';
}
function isSafeVideoUrl(url){return!String(url||'').trim()||!!extractYouTubeId(url);}
function resolveExerciseVideoUrl(exercise){
  const manual=String(exercise?.videoUrl||'').trim();if(manual)return manual;
  const groups=Array.isArray(EXERCISE_OPTIONS?.groups)?EXERCISE_OPTIONS.groups:[];
  for(const group of groups){const item=(group.items||[]).find(entry=>String(entry.id||'')===String(exercise?.catalogItemId||'')||normalizedName(entry.name)===normalizedName(exercise?.name));if(item?.videoUrl)return String(item.videoUrl);}
  return defaultExerciseVideoUrl(exercise?.name);
}
/* Renderiza a caixa de vídeo. readonly=true esconde os controles de edição (visão do treinador) */
function renderExerciseVideo(e,elId,context='student'){
  const el=document.getElementById(elId);if(!el)return;
  const isTrainer=MODE==='cloud'&&CURRENT_USER?.role==='trainer';
  const canView=isTrainer||canUseCatalogVideos();
  const canEdit=isTrainer&&context==='trainer';
  if(!canView){
    el.innerHTML='<div class="video-box"><div class="video-box-empty"><div class="video-box-empty-label">🔒 Vídeos disponíveis somente no acesso online ativo.</div></div></div>';
    return;
  }
  const resolvedVideoUrl=resolveExerciseVideoUrl(e),id=extractYouTubeId(resolvedVideoUrl);
  if(id){
    el.innerHTML=`<div class="video-box"><iframe title="Vídeo de execução de ${esc(e.name)}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" src="https://www.youtube-nocookie.com/embed/${esc(id)}?rel=0" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen sandbox="allow-scripts allow-same-origin allow-presentation"></iframe>${canEdit?`<div class="video-box-link"><span>${e.videoUrl?'Vídeo personalizado':'Vídeo automático do catálogo'}</span><button class="video-box-edit-btn" onclick="openExerciseVideoModal(${jsArg(e.id)},${jsArg(resolvedVideoUrl)})">EDITAR</button></div>`:''}</div>`;
  }else if(canEdit){
    el.innerHTML=`<div class="video-box"><div class="video-box-empty"><div class="video-box-empty-label">Nenhum vídeo cadastrado</div><button class="video-box-add-btn" onclick="openExerciseVideoModal(${jsArg(e.id)},'')">+ ADICIONAR</button></div></div>`;
  }else el.innerHTML='';
}
function openExerciseVideoModal(exerciseId='',videoUrl=''){
  if(MODE!=='cloud'||CURRENT_USER?.role!=='trainer'){showToast('Somente o treinador pode editar vídeos.',true);return;}
  const e=exerciseId?findTrainerExerciseById(exerciseId):VIEW_STUDENT_EXERCISE;
  if(!e)return;
  VIDEO_EDIT_EXERCISE_ID=e.id;
  document.getElementById('input-video-url').value=videoUrl||e.videoUrl||'';
  openModal('modal-exercise-video');
}
async function saveExerciseVideo(){
  if(MODE!=='cloud'||CURRENT_USER?.role!=='trainer'||!VIDEO_EDIT_EXERCISE_ID){alert('Somente o treinador pode editar vídeos.');return;}
  const url=document.getElementById('input-video-url').value.trim();
  if(url&&!extractYouTubeId(url)){alert('Cole um link válido de vídeo do YouTube.');return;}
  if(!beginAction('exercise-video-'+VIDEO_EDIT_EXERCISE_ID,'modal-exercise-video'))return;
  try{
    await cloudWrite(db.collection('exercises').doc(VIDEO_EDIT_EXERCISE_ID).update({videoUrl:url}),'salvar vídeo');
    const exercise=findTrainerExerciseById(VIDEO_EDIT_EXERCISE_ID);if(exercise)exercise.videoUrl=url;
    closeModal('modal-exercise-video');
    if(VIEW_STUDENT_EXERCISE?.id===VIDEO_EDIT_EXERCISE_ID)renderExerciseVideo(VIEW_STUDENT_EXERCISE,'ts-exercise-video-box','trainer');
    showToast('Vídeo atualizado.');
  }catch(e){alert(firestoreWriteMessage(e,'vídeo do exercício'));}
  finally{endAction('exercise-video-'+VIDEO_EDIT_EXERCISE_ID,'modal-exercise-video');}
}
async function removeExerciseVideo(){
  document.getElementById('input-video-url').value='';
  await saveExerciseVideo();
}

/* ══════════════════════════════════════════════════
   PLANO ALIMENTAR
   Modo nuvem: só o TREINADOR edita o conteúdo (mealPlans/{studentUid}).
   O "concluído hoje" do aluno vive numa coleção separada (mealCompletions),
   então a permissão de escrita do aluno nunca toca no conteúdo do plano —
   isso é o que torna a regra de segurança "só treinador edita" aplicável de verdade.
   Modo local (sem treinador, uso solo): aluno segue se autogerenciando.
══════════════════════════════════════════════════ */
let EDIT_MEAL_ID=null;
let MEAL_PLAN_CACHE={meals:[]};
let MEAL_CTX={listId:'meals-list',emptyId:'meals-empty',canEditContent:false,canToggleDone:true,targetUid:null};
let MEAL_COMPLETIONS_TODAY=new Set();

function cacheOwnMealPlan(targetUid,meals){
  if(!targetUid||CURRENT_USER?.uid!==targetUid||CURRENT_USER.role==='trainer')return;
  try{
    ensureLocalOwner(targetUid);
    LOCAL_DB={...LOCAL_DB,mealPlan:{meals:JSON.parse(JSON.stringify(Array.isArray(meals)?meals:[]))}};
    localStorage.setItem(localKeyFor(),JSON.stringify(LOCAL_DB));
    localStorage.setItem('teamms_local_initialized_'+targetUid,'1');
  }catch(e){console.warn('cacheOwnMealPlan',e);}
}

async function loadMealPlan(uidOverride){
  if(MODE==='local' && !uidOverride){
    if(!LOCAL_DB.mealPlan) LOCAL_DB.mealPlan={meals:[]};
    return LOCAL_DB.mealPlan.meals;
  }
  const targetUid=uidOverride||CURRENT_USER.uid;
  try{
    const doc=await cloudGet(db.collection('mealPlans').doc(targetUid),'plano alimentar');
    const meals=doc.exists?(doc.data().meals||[]):[];
    cacheOwnMealPlan(targetUid,meals);
    return meals;
  }catch(e){console.error('loadMealPlan',e);return [];}
}
async function fetchCompletionsToday(uid){
  const completions=new Set();
  try{
    let docs;
    try{
      const snap=await cloudGet(db.collection('mealCompletions').where('studentUid','==',uid).where('date','==',today()),'refeições concluídas');
      docs=snap.docs;
    }catch(indexError){
      const fallback=await cloudGet(db.collection('mealCompletions').where('studentUid','==',uid),'histórico de refeições');
      docs=fallback.docs.filter(d=>d.data().date===today());
    }
    docs.forEach(d=>completions.add(d.data().mealId));
  }catch(e){console.error('fetchCompletionsToday',e);}
  return completions;
}
function isMealDoneToday(m){
  if(MODE==='local' && !MEAL_CTX.targetUid) return (m.doneDates||[]).includes(today());
  return MEAL_COMPLETIONS_TODAY.has(m.id);
}


function renderMealsList(){
  const {listId,emptyId,canEditContent,canToggleDone}=MEAL_CTX;
  const list=document.getElementById(listId);
  const empty=document.getElementById(emptyId);
  const meals=MEAL_PLAN_CACHE.meals;
  if(!meals.length){list.innerHTML='';if(empty)empty.style.display='block';return;}
  if(empty)empty.style.display='none';
  const sorted=[...meals].sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  list.innerHTML=sorted.map((m,index)=>{
    const done=isMealDoneToday(m);
    const items=(m.items||'').split('\n').map(i=>i.trim()).filter(Boolean).map(i=>`<li>${esc(i)}</li>`).join('');
    const editBtn=canEditContent?`<button class="meal-edit-btn" onclick="openEditMealModal(${jsArg(m.id)})">✏️</button>`:'';
    const doneBtn=canToggleDone
      ?`<button class="meal-done-btn${done?' done':''}" onclick="toggleMealDone(${jsArg(m.id)})">${done?'✓ Concluído hoje':'Marcar como concluído'}</button>`
      :`<span class="meal-done-btn${done?' done':''}" style="cursor:default">${done?'✓ Concluído hoje':'— não concluído hoje'}</span>`;
    return`<div class="meal-card">
      <div class="meal-card-top"><span class="meal-card-time">${esc(m.time||'--:--')}</span><span class="meal-card-name">Refeição ${index+1}</span>${editBtn}</div>
      ${items?`<div class="meal-prescribed-label">Alimento prescrito</div><ul class="meal-card-items">${items}</ul>`:''}
      ${m.notes?`<div class="meal-card-notes">💡 ${esc(m.notes)}</div>`:''}
      ${doneBtn}
    </div>`;
  }).join('');
}
function openAddMealModal(){
  if(!MEAL_CTX.canEditContent)return;
  EDIT_MEAL_ID=null;
  const nextNumber=MEAL_PLAN_CACHE.meals.length+1;
  document.getElementById('modal-meal-title').textContent='Nova refeição '+nextNumber;
  document.getElementById('input-meal-time').value='';
  document.getElementById('input-meal-name').value='Refeição '+nextNumber;
  document.getElementById('meal-sequence-help').textContent='Este registro será exibido como Refeição '+nextNumber+'.';
  document.getElementById('input-meal-items').value='';
  document.getElementById('input-meal-notes').value='';
  document.getElementById('btn-delete-meal').style.display='none';
  openModal('modal-meal');
}
function openEditMealModal(mid){
  if(!MEAL_CTX.canEditContent)return;
  const m=MEAL_PLAN_CACHE.meals.find(x=>x.id===mid);if(!m)return;
  EDIT_MEAL_ID=mid;
  const sorted=[...MEAL_PLAN_CACHE.meals].sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  const mealNumber=Math.max(1,sorted.findIndex(x=>x.id===mid)+1);
  document.getElementById('modal-meal-title').textContent='Editar refeição '+mealNumber;
  document.getElementById('input-meal-time').value=m.time||'';
  document.getElementById('input-meal-name').value='Refeição '+mealNumber;
  document.getElementById('meal-sequence-help').textContent='Este registro é exibido como Refeição '+mealNumber+'.';
  document.getElementById('input-meal-items').value=m.items||'';
  document.getElementById('input-meal-notes').value=m.notes||'';
  document.getElementById('btn-delete-meal').style.display='block';
  openModal('modal-meal');
}
async function persistMealPlan(){
  if(MODE==='local' && !MEAL_CTX.targetUid){
    LOCAL_DB.mealPlan={meals:MEAL_PLAN_CACHE.meals};
    if(!localSave())throw new Error('Falha ao gravar o plano alimentar no armazenamento local.');
  }else{
    const uidTarget=MEAL_CTX.targetUid||CURRENT_USER.uid;
    await cloudWrite(db.collection('mealPlans').doc(uidTarget).set({meals:MEAL_PLAN_CACHE.meals},{merge:true}),'salvar dieta');
  }
}
async function saveMeal(){
  if(!MEAL_CTX.canEditContent)return;
  const time=document.getElementById('input-meal-time').value;
  const sorted=[...MEAL_PLAN_CACHE.meals].sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  const currentNumber=EDIT_MEAL_ID?Math.max(1,sorted.findIndex(x=>x.id===EDIT_MEAL_ID)+1):MEAL_PLAN_CACHE.meals.length+1;
  const name='Refeição '+currentNumber;
  const items=document.getElementById('input-meal-items').value;
  const notes=document.getElementById('input-meal-notes').value.trim();
  if(!beginAction('save-meal','modal-meal'))return;
  const before=JSON.stringify(MEAL_PLAN_CACHE.meals);
  try{
    if(EDIT_MEAL_ID){
      const m=MEAL_PLAN_CACHE.meals.find(x=>x.id===EDIT_MEAL_ID);
      if(m){m.time=time;m.name=name;m.items=items;m.notes=notes;}
    }else{
      MEAL_PLAN_CACHE.meals.push({id:uid(),time,name,items,notes,doneDates:[]});
    }
    await persistMealPlan();
    closeModal('modal-meal');
    renderMealsList();
  }catch(e){
    MEAL_PLAN_CACHE.meals=JSON.parse(before);
    alert('Erro ao salvar plano alimentar: '+cloudWriteError(e,'salvar o plano alimentar'));
  }finally{
    endAction('save-meal','modal-meal');
  }
}
function confirmDeleteMeal(){
  if(!MEAL_CTX.canEditContent||!EDIT_MEAL_ID)return;
  const mealId=EDIT_MEAL_ID;
  closeModal('modal-meal');
  showConfirm('Excluir refeição','Remover esta refeição do plano?',async function(){
    const before=MEAL_PLAN_CACHE.meals;
    MEAL_PLAN_CACHE.meals=MEAL_PLAN_CACHE.meals.filter(x=>x.id!==mealId);
    try{await persistMealPlan();renderMealsList();}
    catch(e){MEAL_PLAN_CACHE.meals=before;alert('Erro ao excluir refeição: '+e.message);}
  });
}
async function toggleMealDone(mid){
  if(!MEAL_CTX.canToggleDone)return;
  const m=MEAL_PLAN_CACHE.meals.find(x=>x.id===mid);if(!m)return;
  const actionKey='meal-completion-'+mid;if(!beginAction(actionKey))return;
  const t=today();
  try{
    if(MODE==='local'&&!MEAL_CTX.targetUid){
      const before=[...(m.doneDates||[])];m.doneDates=m.doneDates||[];
      const idx=m.doneDates.indexOf(t);if(idx>=0)m.doneDates.splice(idx,1);else m.doneDates.push(t);
      try{await persistMealPlan();}catch(e){m.doneDates=before;throw e;}
    }else{
      const uidTarget=MEAL_CTX.targetUid||CURRENT_USER?.uid;if(!uidTarget)throw new Error('Conta não identificada.');
      const compId=uidTarget+'_'+mid+'_'+t;
      if(MEAL_COMPLETIONS_TODAY.has(mid)){await cloudWrite(db.collection('mealCompletions').doc(compId).delete(),'atualizar refeição');MEAL_COMPLETIONS_TODAY.delete(mid);}
      else{await cloudWrite(db.collection('mealCompletions').doc(compId).set({studentUid:uidTarget,mealId:mid,date:t}),'atualizar refeição');MEAL_COMPLETIONS_TODAY.add(mid);}
    }
    renderMealsList();
  }catch(e){alert('Erro ao atualizar: '+e.message);}
  finally{endAction(actionKey);}
}


/* ══════════════════════════════════════════════════
   REFEIÇÕES LIVRES — catálogo global e registros fotográficos
══════════════════════════════════════════════════ */
const FREE_MEAL_CATALOG_VERSION=1;
const FREE_MEAL_CATALOG_CACHE_KEY='team_bulls_free_meal_catalog_v1';
let FREE_MEAL_CATALOG={catalogVersion:FREE_MEAL_CATALOG_VERSION,items:[]};
let EDIT_FREE_MEAL_ITEM_ID=null;
let FREE_MEAL_LOGS=[];
let FREE_MEAL_LOGS_UID='';
let FREE_MEAL_LOG_LOAD_SEQ=0;
let CUR_FREE_MEAL_LOG_ID=null;
let FREE_MEAL_PENDING_PHOTO='';
let FREE_MEAL_VIEW_READONLY=false;

function normalizeFreeMealCatalog(source){
  const raw=source&&typeof source==='object'?source:{};
  const seen=new Set();
  const items=(Array.isArray(raw.items)?raw.items:[]).filter(item=>item&&typeof item==='object').map((item,index)=>{
    const id=String(item.id||uid()).slice(0,100);if(seen.has(id))return null;seen.add(id);
    let min=Math.max(0,Math.min(10000,Math.round(Number(item.caloriesMin)||0)));
    let max=Math.max(0,Math.min(10000,Math.round(Number(item.caloriesMax)||min)));
    if(max<min)[min,max]=[max,min];
    return{id,name:String(item.name||'').trim().slice(0,100),portion:String(item.portion||'').trim().slice(0,100),caloriesMin:min,caloriesMax:max,note:String(item.note||'').trim().slice(0,1000),order:Number.isFinite(Number(item.order))?Number(item.order):index};
  }).filter(item=>item&&item.name).sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'pt-BR')).map((item,index)=>({...item,order:index}));
  return{catalogVersion:FREE_MEAL_CATALOG_VERSION,items};
}
function cacheFreeMealCatalog(){try{localStorage.setItem(FREE_MEAL_CATALOG_CACHE_KEY,JSON.stringify(FREE_MEAL_CATALOG));}catch(e){}}
function cachedFreeMealCatalog(){try{return normalizeFreeMealCatalog(JSON.parse(localStorage.getItem(FREE_MEAL_CATALOG_CACHE_KEY)||'{}'));}catch(e){return normalizeFreeMealCatalog(null);}}
async function loadFreeMealCatalog(){
  if(MODE==='local'){FREE_MEAL_CATALOG=cachedFreeMealCatalog();return FREE_MEAL_CATALOG;}
  try{
    const doc=await cloudGet(db.collection('freeMealCatalog').doc('main'),'tabela de refeições livres');
    if(doc.exists)FREE_MEAL_CATALOG=normalizeFreeMealCatalog(doc.data());
    else if(CURRENT_USER?.role==='trainer'){
      FREE_MEAL_CATALOG=normalizeFreeMealCatalog({items:[]});
      await cloudWrite(db.collection('freeMealCatalog').doc('main').set(FREE_MEAL_CATALOG),'criar tabela de refeições livres');
    }else FREE_MEAL_CATALOG=cachedFreeMealCatalog();
  }catch(e){console.warn('loadFreeMealCatalog',e);FREE_MEAL_CATALOG=cachedFreeMealCatalog();}
  cacheFreeMealCatalog();return FREE_MEAL_CATALOG;
}
async function persistFreeMealCatalog(){
  if(CURRENT_USER?.role!=='trainer'||MODE!=='cloud')throw new Error('Somente o treinador online pode alterar esta tabela.');
  FREE_MEAL_CATALOG=normalizeFreeMealCatalog(FREE_MEAL_CATALOG);
  await cloudWrite(db.collection('freeMealCatalog').doc('main').set({...FREE_MEAL_CATALOG,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}),'salvar tabela de refeições livres');
  cacheFreeMealCatalog();
}
function freeMealCaloriesText(item){
  const min=Number(item?.caloriesMin)||0,max=Number(item?.caloriesMax)||min;
  if(!min&&!max)return'Não informada';
  return min===max?min.toLocaleString('pt-BR')+' kcal':min.toLocaleString('pt-BR')+'–'+max.toLocaleString('pt-BR')+' kcal';
}
function renderFreeMealCatalog(targetId,editable=false){
  const host=document.getElementById(targetId);if(!host)return;
  const items=normalizeFreeMealCatalog(FREE_MEAL_CATALOG).items;
  if(!items.length){host.innerHTML='<div class="empty-state" style="padding:28px 12px"><div class="empty-icon">🍽</div><div class="empty-label">Tabela ainda não cadastrada</div><div class="empty-hint">O treinador poderá incluir aproximações de calorias aqui.</div></div>';return;}
  host.innerHTML=`<table class="free-meal-table"><thead><tr><th>Refeição</th><th>Porção</th><th>Estimativa</th><th>Observações</th>${editable?'<th>Ações</th>':''}</tr></thead><tbody>${items.map((item,index)=>`<tr><td><strong>${esc(item.name)}</strong></td><td>${esc(item.portion||'—')}</td><td><span class="free-meal-calorie">${esc(freeMealCaloriesText(item))}</span></td><td>${esc(item.note||'—')}</td>${editable?`<td><div class="free-meal-table-actions"><button onclick="moveFreeMealItem(${jsArg(item.id)},-1)" ${index===0?'disabled':''} title="Subir">↑</button><button onclick="moveFreeMealItem(${jsArg(item.id)},1)" ${index===items.length-1?'disabled':''} title="Descer">↓</button><button onclick="openEditFreeMealItem(${jsArg(item.id)})" title="Editar">✎</button></div></td>`:''}</tr>`).join('')}</tbody></table>`;
}
async function openFreeMealCatalog(){
  if(CURRENT_USER?.role!=='trainer')return;
  const navigation=beginAsyncNavigation();await loadFreeMealCatalog();if(!isNavigationCurrent(navigation))return;
  renderFreeMealCatalog('free-meal-catalog-trainer',true);showScreen('screen-free-meal-catalog',navigation);
}
function openAddFreeMealItem(){
  EDIT_FREE_MEAL_ITEM_ID=null;
  document.getElementById('modal-free-meal-item-title').textContent='Nova opção';
  ['input-free-meal-name','input-free-meal-portion','input-free-meal-cal-min','input-free-meal-cal-max','input-free-meal-note'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('btn-delete-free-meal-item').style.display='none';openModal('modal-free-meal-item');
}
function openEditFreeMealItem(id){
  const item=FREE_MEAL_CATALOG.items.find(entry=>entry.id===id);if(!item)return;
  EDIT_FREE_MEAL_ITEM_ID=id;document.getElementById('modal-free-meal-item-title').textContent='Editar opção';
  document.getElementById('input-free-meal-name').value=item.name||'';
  document.getElementById('input-free-meal-portion').value=item.portion||'';
  document.getElementById('input-free-meal-cal-min').value=item.caloriesMin||'';
  document.getElementById('input-free-meal-cal-max').value=item.caloriesMax||'';
  document.getElementById('input-free-meal-note').value=item.note||'';
  document.getElementById('btn-delete-free-meal-item').style.display='block';openModal('modal-free-meal-item');
}
async function saveFreeMealItem(){
  if(CURRENT_USER?.role!=='trainer')return;
  const name=document.getElementById('input-free-meal-name').value.trim();
  const portion=document.getElementById('input-free-meal-portion').value.trim();
  let min=Math.round(Number(document.getElementById('input-free-meal-cal-min').value));
  let max=Math.round(Number(document.getElementById('input-free-meal-cal-max').value));
  const note=document.getElementById('input-free-meal-note').value.trim();
  if(!name){alert('Informe o nome da refeição.');return;}
  if(!Number.isFinite(min)||min<0||min>10000||!Number.isFinite(max)||max<0||max>10000){alert('Informe uma faixa de calorias entre 0 e 10.000 kcal.');return;}
  if(max<min)[min,max]=[max,min];
  if(!beginAction('save-free-meal-item','modal-free-meal-item'))return;
  const before=JSON.stringify(FREE_MEAL_CATALOG);
  try{
    if(EDIT_FREE_MEAL_ITEM_ID){const item=FREE_MEAL_CATALOG.items.find(entry=>entry.id===EDIT_FREE_MEAL_ITEM_ID);if(!item)throw new Error('Opção não encontrada.');Object.assign(item,{name,portion,caloriesMin:min,caloriesMax:max,note});}
    else FREE_MEAL_CATALOG.items.push({id:uid(),name,portion,caloriesMin:min,caloriesMax:max,note,order:FREE_MEAL_CATALOG.items.length});
    await persistFreeMealCatalog();closeModal('modal-free-meal-item');renderFreeMealCatalog('free-meal-catalog-trainer',true);showToast('✓ Tabela atualizada');
  }catch(e){FREE_MEAL_CATALOG=normalizeFreeMealCatalog(JSON.parse(before));alert(cloudWriteError(e,'salvar a tabela'));}
  finally{endAction('save-free-meal-item','modal-free-meal-item');}
}
function deleteFreeMealItem(){
  if(!EDIT_FREE_MEAL_ITEM_ID)return;const target=EDIT_FREE_MEAL_ITEM_ID;closeModal('modal-free-meal-item');
  showConfirm('Excluir opção','Remover esta opção da tabela? Os registros antigos dos alunos serão preservados.',async()=>{
    const before=JSON.stringify(FREE_MEAL_CATALOG);try{FREE_MEAL_CATALOG.items=FREE_MEAL_CATALOG.items.filter(item=>item.id!==target);await persistFreeMealCatalog();renderFreeMealCatalog('free-meal-catalog-trainer',true);}catch(e){FREE_MEAL_CATALOG=normalizeFreeMealCatalog(JSON.parse(before));alert(cloudWriteError(e,'excluir a opção'));}
  });
}
async function moveFreeMealItem(id,direction){
  const items=normalizeFreeMealCatalog(FREE_MEAL_CATALOG).items;const index=items.findIndex(item=>item.id===id),next=index+Number(direction);if(index<0||next<0||next>=items.length)return;
  [items[index],items[next]]=[items[next],items[index]];items.forEach((item,i)=>item.order=i);const before=JSON.stringify(FREE_MEAL_CATALOG);FREE_MEAL_CATALOG.items=items;
  try{await persistFreeMealCatalog();renderFreeMealCatalog('free-meal-catalog-trainer',true);}catch(e){FREE_MEAL_CATALOG=normalizeFreeMealCatalog(JSON.parse(before));alert(cloudWriteError(e,'alterar a ordem'));}
}
function localFreeMealDbFor(ownerUid){
  const owner=String(ownerUid||LOCAL_OWNER_UID||LOCAL_GUEST_OWNER);
  if(MODE==='local'&&owner===LOCAL_OWNER_UID)return LOCAL_DB;
  return parseStoredLocal(localStorage.getItem(localKeyFor(owner)));
}
function saveLocalFreeMealDb(ownerUid,dbValue){
  const owner=String(ownerUid||LOCAL_OWNER_UID||LOCAL_GUEST_OWNER);dbValue.freeMealLogs=Array.isArray(dbValue.freeMealLogs)?dbValue.freeMealLogs:[];
  if(MODE==='local'&&owner===LOCAL_OWNER_UID){LOCAL_DB=dbValue;return localSave();}
  try{localStorage.setItem(localKeyFor(owner),JSON.stringify(dbValue));localStorage.setItem('teamms_local_initialized_'+owner,'1');return true;}catch(e){return false;}
}
function normalizeFreeMealLog(log){
  const calories=Math.max(0,Math.min(10000,Math.round(Number(log?.estimatedCalories)||0)));
  return{...log,id:String(log?.id||uid()),userId:String(log?.userId||''),date:String(log?.date||today()),mealName:String(log?.mealName||'Refeição livre').trim().slice(0,120),catalogItemId:String(log?.catalogItemId||'').slice(0,100),catalogItemName:String(log?.catalogItemName||'').trim().slice(0,100),portion:String(log?.portion||'').trim().slice(0,100),estimatedCalories:calories,notes:String(log?.notes||'').trim().slice(0,2000),dataUrl:safePhotoDataUrl(log?.dataUrl),photoPath:safePhotoPath(log?.photoPath),photoKey:String(log?.photoKey||'').slice(0,300),pendingSync:log?.pendingSync===true,createdAtLocal:Number(log?.createdAtLocal)||Date.now()};
}
async function syncPendingFreeMealLogs(userId){
  if(MODE!=='cloud'||!userId||!navigator.onLine)return;
  const localDb=localFreeMealDbFor(userId);
  const pending=(localDb.freeMealLogs||[]).map(normalizeFreeMealLog).filter(log=>log.pendingSync&&log.userId===userId&&(log.dataUrl||log.photoKey));
  if(!pending.length)return;
  let changed=false;
  for(const log of pending){
    try{
      let dataUrl=log.dataUrl;
      if(!dataUrl&&log.photoKey){const blob=await mediaGet(log.photoKey);dataUrl=await blobToDataUrl(blob);}
      if(!safePhotoDataUrl(dataUrl))throw new Error('Foto local indisponível.');
      const ref=db.collection('freeMealLogs').doc(log.id),existing=await cloudGet(ref,'verificar refeição livre');
      if(!existing.exists){
        const photoPath=await uploadCloudPhoto('freeMealLogs',userId,log.id,dataUrl);
        const payload={userId,mealName:log.mealName,catalogItemId:log.catalogItemId,catalogItemName:log.catalogItemName,portion:log.portion,estimatedCalories:log.estimatedCalories,notes:log.notes,date:log.date,createdAt:firebase.firestore.FieldValue.serverTimestamp()};
        if(photoPath)payload.photoPath=photoPath;else payload.dataUrl=dataUrl;
        await cloudWrite(ref.set(payload),'sincronizar refeição livre');log.photoPath=photoPath;log.dataUrl=photoPath?'':dataUrl;
      }
      log.pendingSync=false;changed=true;
    }catch(e){console.warn('syncPendingFreeMealLogs',e);break;}
  }
  if(changed){
    localDb.freeMealLogs=(localDb.freeMealLogs||[]).map(entry=>{const synced=pending.find(log=>log.id===entry.id);return synced?{...entry,pendingSync:synced.pendingSync,photoPath:synced.photoPath||entry.photoPath||'',dataUrl:synced.photoPath?'':entry.dataUrl}:entry;});
    saveLocalFreeMealDb(userId,localDb);
  }
}
async function loadFreeMealLogs(userId){
  const target=String(userId||CURRENT_USER?.uid||LOCAL_OWNER_UID||LOCAL_GUEST_OWNER),seq=++FREE_MEAL_LOG_LOAD_SEQ;
  const hydrateLocal=async logs=>{
    let mutated=false;
    for(const log of logs){
      // Migra fotos antigas do localStorage para IndexedDB em segundo plano.
      if(log.dataUrl&&!log.photoKey){const key=`freeMeal/${target}/${log.id}`;const blob=dataUrlToBlob(log.dataUrl);if(blob&&await mediaPut(key,blob)){log.photoKey=key;log.dataUrl='';mutated=true;}}
      if(log.photoKey)log._photoSrc=await mediaObjectUrl(log.photoKey);
    }
    if(mutated){const localDb=localFreeMealDbFor(target);localDb.freeMealLogs=logs.map(({_photoSrc,...log})=>log);saveLocalFreeMealDb(target,localDb);}
    return logs;
  };
  if(MODE==='local'){
    const localDb=localFreeMealDbFor(target),logs=await hydrateLocal((localDb.freeMealLogs||[]).map(normalizeFreeMealLog).filter(log=>!log.userId||log.userId===target).sort((a,b)=>String(b.date).localeCompare(String(a.date))||b.createdAtLocal-a.createdAtLocal));
    if(seq===FREE_MEAL_LOG_LOAD_SEQ){FREE_MEAL_LOGS=logs;FREE_MEAL_LOGS_UID=target;}return logs;
  }
  if(CURRENT_USER?.role==='student'&&target===CURRENT_USER.uid)await syncPendingFreeMealLogs(target);
  try{
    const snap=await cloudGet(db.collection('freeMealLogs').where('userId','==',target),'registros de refeições livres');
    let logs=snap.docs.map(doc=>normalizeFreeMealLog({...doc.data(),id:doc.id,pendingSync:false}));
    if(CURRENT_USER?.role==='student'&&target===CURRENT_USER.uid){
      const localDb=localFreeMealDbFor(target),pending=await hydrateLocal((localDb.freeMealLogs||[]).map(normalizeFreeMealLog).filter(log=>log.pendingSync)),ids=new Set(logs.map(log=>log.id));logs=logs.concat(pending.filter(log=>!ids.has(log.id)));
    }
    logs.sort((a,b)=>String(b.date).localeCompare(String(a.date))||b.createdAtLocal-a.createdAtLocal);
    if(seq===FREE_MEAL_LOG_LOAD_SEQ){FREE_MEAL_LOGS=logs;FREE_MEAL_LOGS_UID=target;}return logs;
  }catch(e){
    console.warn('loadFreeMealLogs',e);const localDb=localFreeMealDbFor(target),logs=await hydrateLocal((localDb.freeMealLogs||[]).map(normalizeFreeMealLog).filter(log=>log.userId===target||!log.userId));
    if(seq===FREE_MEAL_LOG_LOAD_SEQ){FREE_MEAL_LOGS=logs;FREE_MEAL_LOGS_UID=target;}return logs;
  }
}
function renderFreeMealLogs(listId,emptyId,readonly=false){
  const list=document.getElementById(listId),empty=document.getElementById(emptyId);if(!list)return;
  const logs=(FREE_MEAL_LOGS||[]).filter(log=>log.dataUrl||log.photoKey||log.photoPath);
  if(!logs.length){list.innerHTML='';if(empty)empty.style.display='block';return;}if(empty)empty.style.display='none';
  list.innerHTML=logs.map(log=>{const direct=safePhotoDataUrl(log.dataUrl)||log._photoSrc||'';return`<div class="free-meal-log-card" onclick="openFreeMealLogView(${jsArg(log.id)},${readonly})"><img class="free-meal-log-photo" ${direct?`src="${esc(direct)}"`:''} data-photo-record="freeMeal" data-photo-id="${esc(log.id)}" loading="lazy" decoding="async" alt="${esc(log.mealName)}"><div class="free-meal-log-main"><div class="free-meal-log-head"><div class="free-meal-log-name">${esc(log.mealName)}</div><div class="free-meal-log-date">${esc(fmt(log.date))}</div></div><div class="free-meal-log-cal">${log.estimatedCalories?esc(log.estimatedCalories.toLocaleString('pt-BR'))+' kcal aproximadas':'Calorias não informadas'}</div>${log.portion?`<div class="free-meal-log-note">Porção: ${esc(log.portion)}</div>`:''}${log.notes?`<div class="free-meal-log-note">${esc(log.notes)}</div>`:''}${log.pendingSync?'<span class="free-meal-pending">pendente de sincronização</span>':''}</div></div>`;}).join('');
  hydrateSecureImages(list);
}
async function openFreeMeals(){
  const navigation=beginAsyncNavigation();await loadFreeMealCatalog();const owner=MODE==='cloud'?CURRENT_USER?.uid:(CURRENT_USER?.uid||INACTIVE_UID||LOCAL_OWNER_UID||LOCAL_GUEST_OWNER);await loadFreeMealLogs(owner);if(!isNavigationCurrent(navigation))return;
  renderFreeMealCatalog('free-meal-catalog-student',false);renderFreeMealLogs('free-meal-logs','free-meal-logs-empty',false);showScreen('screen-free-meals',navigation);
}
async function openTsFreeMeals(){
  if(!VIEW_STUDENT)return;const navigation=beginAsyncNavigation(),uidTarget=VIEW_STUDENT.uid;await loadFreeMealLogs(uidTarget);if(!isNavigationCurrent(navigation)||VIEW_STUDENT?.uid!==uidTarget)return;
  renderFreeMealLogs('ts-free-meal-logs','ts-free-meal-logs-empty',true);showScreen('screen-ts-free-meals',navigation);
}
function openFreeMealLogModal(){
  if(CURRENT_USER?.role==='trainer')return;FREE_MEAL_PENDING_PHOTO='';
  document.getElementById('input-free-log-date').value=today();document.getElementById('input-free-log-name').value='';document.getElementById('input-free-log-calories').value='';document.getElementById('input-free-log-notes').value='';document.getElementById('input-free-log-photo').value='';
  const preview=document.getElementById('free-meal-photo-preview');preview.src='';preview.style.display='none';
  const select=document.getElementById('input-free-log-catalog');select.innerHTML='<option value="">Outra refeição / descrição manual</option>'+FREE_MEAL_CATALOG.items.map(item=>`<option value="${esc(item.id)}">${esc(item.name)} · ${esc(freeMealCaloriesText(item))}</option>`).join('');openModal('modal-free-meal-log');
}
function onFreeMealCatalogSelected(){
  const id=document.getElementById('input-free-log-catalog').value,item=FREE_MEAL_CATALOG.items.find(entry=>entry.id===id);if(!item)return;
  document.getElementById('input-free-log-name').value=item.name||'';const min=Number(item.caloriesMin)||0,max=Number(item.caloriesMax)||min;document.getElementById('input-free-log-calories').value=Math.round((min+max)/2)||'';
}
async function handleFreeMealPhotoSelected(event){
  const file=event.target.files?.[0];FREE_MEAL_PENDING_PHOTO='';const preview=document.getElementById('free-meal-photo-preview');preview.src='';preview.style.display='none';if(!file)return;
  if(!String(file.type||'').startsWith('image/')){alert('Selecione uma imagem válida.');event.target.value='';return;}
  try{showToast('Comprimindo foto...');FREE_MEAL_PENDING_PHOTO=await compressImageFile(file,900,.66,480000);if(!FREE_MEAL_PENDING_PHOTO)throw new Error('Falha ao preparar a foto.');preview.src=FREE_MEAL_PENDING_PHOTO;preview.style.display='block';}
  catch(e){event.target.value='';alert(e.message||'Não foi possível preparar a foto.');}
}
async function queueFreeMealLogLocally(log,ownerUid){
  const owner=String(ownerUid||LOCAL_OWNER_UID||LOCAL_GUEST_OWNER),localDb=localFreeMealDbFor(owner);localDb.freeMealLogs=Array.isArray(localDb.freeMealLogs)?localDb.freeMealLogs:[];
  log=normalizeFreeMealLog(log);
  if(log.dataUrl){const key=`freeMeal/${owner}/${log.id}`,blob=dataUrlToBlob(log.dataUrl);if(blob&&await mediaPut(key,blob)){log.photoKey=key;log._photoSrc=rememberMediaObjectUrl(key,URL.createObjectURL(blob));log.dataUrl='';}}
  const persisted={...log};delete persisted._photoSrc;
  const idx=localDb.freeMealLogs.findIndex(item=>item.id===log.id);if(idx>=0)localDb.freeMealLogs[idx]=persisted;else localDb.freeMealLogs.push(persisted);return saveLocalFreeMealDb(owner,localDb);
}
async function saveFreeMealLog(){
  const date=document.getElementById('input-free-log-date').value,name=document.getElementById('input-free-log-name').value.trim(),calories=Math.round(Number(document.getElementById('input-free-log-calories').value)||0),notes=document.getElementById('input-free-log-notes').value.trim(),catalogId=document.getElementById('input-free-log-catalog').value,item=FREE_MEAL_CATALOG.items.find(entry=>entry.id===catalogId);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){alert('Informe uma data válida.');return;}if(!name){alert('Descreva a refeição.');return;}if(calories<0||calories>10000){alert('Informe uma estimativa entre 0 e 10.000 kcal.');return;}if(!FREE_MEAL_PENDING_PHOTO){alert('Selecione uma foto da refeição.');return;}
  if(!beginAction('save-free-meal-log','modal-free-meal-log'))return;
  const owner=MODE==='cloud'?CURRENT_USER?.uid:(CURRENT_USER?.uid||INACTIVE_UID||LOCAL_OWNER_UID||LOCAL_GUEST_OWNER),id=uid(),base=normalizeFreeMealLog({id,userId:owner===LOCAL_GUEST_OWNER?'':owner,date,mealName:name,catalogItemId:item?.id||'',catalogItemName:item?.name||'',portion:item?.portion||'',estimatedCalories:calories,notes,dataUrl:FREE_MEAL_PENDING_PHOTO,createdAtLocal:Date.now(),pendingSync:MODE!=='cloud'});
  try{
    if(MODE==='cloud'&&CURRENT_USER?.role==='student'){
      const originalDataUrl=base.dataUrl;
      let uploadedPath='';
      try{
        uploadedPath=await uploadCloudPhoto('freeMealLogs',CURRENT_USER.uid,id,originalDataUrl);
        const payload={userId:CURRENT_USER.uid,mealName:base.mealName,catalogItemId:base.catalogItemId,catalogItemName:base.catalogItemName,portion:base.portion,estimatedCalories:base.estimatedCalories,notes:base.notes,date:base.date,createdAt:firebase.firestore.FieldValue.serverTimestamp()};
        if(uploadedPath)payload.photoPath=uploadedPath;else payload.dataUrl=originalDataUrl;
        await cloudWrite(db.collection('freeMealLogs').doc(id).set(payload),'salvar refeição livre');
        base.photoPath=uploadedPath;base.dataUrl=uploadedPath?'':originalDataUrl;base.pendingSync=false;
      }catch(error){
        if(uploadedPath)await deleteCloudPhoto(uploadedPath);
        base.photoPath='';base.dataUrl=originalDataUrl;base.pendingSync=true;
        if(!await queueFreeMealLogLocally(base,CURRENT_USER.uid))throw error;
        showToast('Registro salvo neste aparelho e pendente de sincronização.',true);
      }
    }else if(!await queueFreeMealLogLocally(base,owner))throw new Error('Não foi possível salvar a foto neste aparelho. Libere espaço e tente novamente.');
    closeModal('modal-free-meal-log');FREE_MEAL_PENDING_PHOTO='';await loadFreeMealLogs(owner);renderFreeMealLogs('free-meal-logs','free-meal-logs-empty',false);showToast(base.pendingSync?'✓ Registro salvo localmente':'✓ Refeição livre registrada');
  }catch(e){alert(cloudWriteError(e,'salvar a refeição livre'));}
  finally{endAction('save-free-meal-log','modal-free-meal-log');}
}
async function openFreeMealLogView(id,readonly=false){
  const log=FREE_MEAL_LOGS.find(entry=>entry.id===id);if(!log)return;CUR_FREE_MEAL_LOG_ID=id;FREE_MEAL_VIEW_READONLY=readonly;
  document.getElementById('free-meal-view-title').textContent=log.mealName;const img=document.getElementById('free-meal-view-photo');img.removeAttribute('src');const src=await resolvePhotoSource(log);if(src)img.src=src;
  document.getElementById('free-meal-view-meta').textContent=fmt(log.date)+' · '+(log.estimatedCalories?log.estimatedCalories.toLocaleString('pt-BR')+' kcal aproximadas':'calorias não informadas')+(log.portion?' · '+log.portion:'')+(log.pendingSync?' · pendente de sincronização':'');
  document.getElementById('free-meal-view-notes').textContent=log.notes||'Sem observações.';document.getElementById('btn-delete-free-meal-log').style.display=readonly?'none':'block';openModal('modal-free-meal-view');
}
function deleteCurrentFreeMealLog(){
  if(FREE_MEAL_VIEW_READONLY||!CUR_FREE_MEAL_LOG_ID)return;const id=CUR_FREE_MEAL_LOG_ID,log=FREE_MEAL_LOGS.find(entry=>entry.id===id);if(!log)return;closeModal('modal-free-meal-view');
  showConfirm('Excluir registro','Apagar esta foto e o registro da refeição livre?',async()=>{
    try{
      if(MODE==='cloud'&&!log.pendingSync){await cloudWrite(db.collection('freeMealLogs').doc(id).delete(),'excluir refeição livre');if(log.photoPath)await deleteCloudPhoto(log.photoPath);}
      if(log.photoKey)await mediaDelete(log.photoKey);
      const owner=MODE==='cloud'?CURRENT_USER?.uid:(CURRENT_USER?.uid||INACTIVE_UID||LOCAL_OWNER_UID||LOCAL_GUEST_OWNER),localDb=localFreeMealDbFor(owner);localDb.freeMealLogs=(localDb.freeMealLogs||[]).filter(entry=>entry.id!==id);saveLocalFreeMealDb(owner,localDb);
      FREE_MEAL_LOGS=FREE_MEAL_LOGS.filter(entry=>entry.id!==id);renderFreeMealLogs('free-meal-logs','free-meal-logs-empty',false);
    }catch(e){alert(cloudWriteError(e,'excluir o registro'));}
  });
}

/* ── Opções de Alimentos (tabela de substituições) ──────────────────────
   Documento ÚNICO e global (foodOptions/main), compartilhado por todos os
   alunos do treinador — não é por aluno. Só o treinador edita; os alunos
   (modo nuvem) só visualizam, para escolher substituições equivalentes. */
let FOOD_OPTIONS={categories:[],misc:[]};
let FOOD_OPTIONS_FROM='home'; // 'home' | 'trainer' — para onde voltar
let EDIT_FOOD_CAT_ID=null,EDIT_FOOD_ITEM_ID=null,EDIT_FOOD_MISC_ID=null;
let EXERCISE_OPTIONS={groups:[]};
let SUBSTITUTION_RENDER_SEQ=0,VARIANT_LOAD_SEQ=0;
let EXERCISE_OPTIONS_LOAD_PROMISE=null,EXERCISE_OPTIONS_LOADED_AT=0;
let EXERCISE_OPTIONS_FROM='home'; // 'home' | 'trainer' — para onde voltar
let EDIT_EXOPT_GROUP_ID=null,EDIT_EXOPT_ITEM_ID=null;
let SELECTED_EXERCISE_CATALOG=null;
let EXERCISE_PICKER_SEQ=0;
let GLOBAL_CATALOG_INIT_PROMISE=null;
const FOOD_CATALOG_VERSION=2;
const EXERCISE_CATALOG_VERSION=3;

function ensureGlobalCatalogs(){
  if(MODE!=='cloud'||CURRENT_USER?.role!=='trainer')return Promise.resolve();
  if(!GLOBAL_CATALOG_INIT_PROMISE){
    GLOBAL_CATALOG_INIT_PROMISE=Promise.all([loadFoodOptions(),loadExerciseOptions(),loadFreeMealCatalog()])
      .catch(error=>{
        GLOBAL_CATALOG_INIT_PROMISE=null;
        console.error('ensureGlobalCatalogs',error);
      });
  }
  return GLOBAL_CATALOG_INIT_PROMISE;
}

function defaultFoodOptions(){
  const data={
    catalogVersion:FOOD_CATALOG_VERSION,
    categories:[
      {id:'carb',name:'Carboidratos',items:[
        {id:uid(),name:'Arroz',amount:'100 g'},
        {id:uid(),name:'Feijão',amount:'160 g'},
        {id:uid(),name:'Macarrão',amount:'80 g'},
        {id:uid(),name:'Batata inglesa',amount:'130 g'},
        {id:uid(),name:'Pipoca pronta sem óleo',amount:'40 g'},
        {id:uid(),name:'Batata-doce',amount:'140 g'},
        {id:uid(),name:'Mel',amount:'30 g'},
        {id:uid(),name:'Milho',amount:'100 g'},
        {id:uid(),name:'Granola',amount:'30 g'},
        {id:uid(),name:'Pão de forma integral',amount:'2 fatias'},
        {id:uid(),name:'Pão francês',amount:'50 g (1 unidade)'},
        {id:uid(),name:'Pão Mandi',amount:'50 g (1 unidade)'},
        {id:uid(),name:'Cuscuz',amount:'100 g'},
        {id:uid(),name:'Aveia em flocos',amount:'40 g'},
        {id:uid(),name:'Tapioca (crua)',amount:'35 g'},
        {id:uid(),name:'Mandioca',amount:'80 g'},
        {id:uid(),name:'Ervilha',amount:'150 g'},
        {id:uid(),name:'Suco de uva integral',amount:'200 ml'}
      ]},
      {id:'prot',name:'Proteínas',items:[
        {id:uid(),name:'Whey protein',amount:'20 g'},
        {id:uid(),name:'Claras de ovos',amount:'4 unidades'},
        {id:uid(),name:'Carne vermelha magra',amount:'50 g'},
        {id:uid(),name:'Filé de peito de frango',amount:'50 g'},
        {id:uid(),name:'Camarão',amount:'90 g'},
        {id:uid(),name:'Sardinha sem óleo',amount:'80 g'},
        {id:uid(),name:'Filé mignon suíno',amount:'60 g'},
        {id:uid(),name:'Filé de tilápia',amount:'60 g'},
        {id:uid(),name:'Atum',amount:'70 g'},
        {id:uid(),name:'Filé de pirarucu',amount:'90 g'},
        {id:uid(),name:'Bacalhau',amount:'60 g'},
        {id:uid(),name:'Fígado bovino',amount:'50 g'},
        {id:uid(),name:'Moela de frango',amount:'50 g'},
        {id:uid(),name:'Albumina pura',amount:'20 g'},
        {id:uid(),name:'Proteína de carne em pó (Growth)',amount:'20 g'},
        {id:uid(),name:'Proteína vegetal em pó (Growth)',amount:'20 g'},
        {id:uid(),name:'Filé de merluza cru',amount:'80 g'}
      ]},
      {id:'gord',name:'Gorduras',items:[
        {id:uid(),name:'Abacate',amount:'100 g'},
        {id:uid(),name:'Gema de ovo',amount:'1 unidade'},
        {id:uid(),name:'Amendoim',amount:'15 g'},
        {id:uid(),name:'Pasta de amendoim',amount:'15 g'},
        {id:uid(),name:'Nozes',amount:'15 g'},
        {id:uid(),name:'Avelã',amount:'10 g'},
        {id:uid(),name:'Azeite',amount:'1 colher de sopa'},
        {id:uid(),name:'Chocolate 70%',amount:'15 g'},
        {id:uid(),name:'Queijo minas',amount:'30 g'},
        {id:uid(),name:'Requeijão Nestlé tradicional',amount:'30 g'},
        {id:uid(),name:'Creme de ricota light',amount:'60 g'},
        {id:uid(),name:'Ricota',amount:'40 g'},
        {id:uid(),name:'Leite de coco',amount:'100 g'},
        {id:uid(),name:'Muçarela de búfala',amount:'30 g'},
        {id:uid(),name:'Azeitona',amount:'50 g'},
        {id:uid(),name:'Manteiga sem sal',amount:'10 g'},
        {id:uid(),name:"Maionese light Hellmann's",amount:'30 g'},
        {id:uid(),name:'Margarina light',amount:'20 g'},
        {id:uid(),name:'Muçarela',amount:'30 g'},
        {id:uid(),name:'Bacon',amount:'15 g'},
        {id:uid(),name:'Cream cheese light',amount:'40 g'},
        {id:uid(),name:'Queijo coalho',amount:'20 g'}
      ]},
      {id:'fruta1',name:'Frutas 01',items:[
        {id:uid(),name:'Banana',amount:'100 g'},
        {id:uid(),name:'Mamão',amount:'200 g'},
        {id:uid(),name:'Abacaxi',amount:'200 g'},
        {id:uid(),name:'Maçã',amount:'90 g'},
        {id:uid(),name:'Morango',amount:'300 g'},
        {id:uid(),name:'Melancia',amount:'250 g'},
        {id:uid(),name:'Melão',amount:'280 g'},
        {id:uid(),name:'Manga',amount:'130 g'},
        {id:uid(),name:'Laranja',amount:'250 g'},
        {id:uid(),name:'Uva',amount:'150 g'},
        {id:uid(),name:'Água de coco',amount:'400 ml'},
        {id:uid(),name:'Acerola',amount:'250 g'},
        {id:uid(),name:'Ameixa',amount:'190 g'},
        {id:uid(),name:'Amora',amount:'200 g'},
        {id:uid(),name:'Goiaba',amount:'160 g'},
        {id:uid(),name:'Caju',amount:'190 g'},
        {id:uid(),name:'Pera',amount:'80 g'},
        {id:uid(),name:'Mexerica',amount:'250 g'},
        {id:uid(),name:'Pêssego',amount:'170 g'},
        {id:uid(),name:'Jaca',amount:'100 g'},
        {id:uid(),name:'Seriguela',amount:'130 g'},
        {id:uid(),name:'Mirtilo',amount:'150 g'},
        {id:uid(),name:'Figo',amount:'200 g'}
      ]},
      {id:'fruta2',name:'Frutas 02',items:[
        {id:uid(),name:'Cereja',amount:'200 g'},
        {id:uid(),name:'Maracujá',amount:'150 g'},
        {id:uid(),name:'Pinha',amount:'100 g'},
        {id:uid(),name:'Pitaya',amount:'250 g'},
        {id:uid(),name:'Damasco',amount:'200 g'},
        {id:uid(),name:'Caqui',amount:'100 g'},
        {id:uid(),name:'Jabuticaba',amount:'130 g'},
        {id:uid(),name:'Kiwi',amount:'160 g'}
      ]}
    ],
    misc:[
      {id:uid(),name:'Leite desnatado — 250 ml',note:'Subtrair ½ porção de proteína e ½ porção de carboidrato daquela refeição.'},
      {id:uid(),name:'10 ovos de codorna',note:'Subtrair 1 porção de proteína e 1 porção de gordura daquela refeição.'},
      {id:uid(),name:'Salmão — 70 g (grelhado ou cru)',note:'Subtrair 1 porção de proteína e 1 porção de gordura daquela refeição.'},
      {id:uid(),name:'Açaí (fruta pura) — 200 g',note:'Subtrair 1 porção de carboidrato e 1 porção de gordura daquela refeição.'},
      {id:uid(),name:'Leite em pó desnatado — 25 g',note:'Subtrair ½ porção de proteína e ½ porção de carboidrato daquela refeição.'},
      {id:uid(),name:'Coxa e sobrecoxa assadas sem pele — 50 g',note:'Subtrair 1 porção de proteína e ½ porção de gordura daquela refeição.'},
      {id:uid(),name:'Bebida láctea Growth',note:'Subtrair 1 porção de proteína e 1 porção de carboidrato daquela refeição.'},
      {id:uid(),name:'Bebida láctea YOPRO 15 g High Protein',note:'Subtrair 1 porção de proteína e 1 porção de carboidrato daquela refeição.'},
      {id:uid(),name:'Iogurte líquido YOPRO 15 g High Protein',note:'Subtrair 1 porção de proteína e 1 porção de carboidrato daquela refeição.'},
      {id:uid(),name:'Iogurte YOPRO 15 g High Protein',note:'Subtrair 1 porção de proteína daquela refeição.'},
      {id:uid(),name:'Pão de queijo — 40 g',note:'Subtrair ½ porção de carboidrato e 1 porção de gordura daquela refeição.'},
      {id:uid(),name:'Bolacha de água e sal — 30 g',note:'Subtrair 1 porção de carboidrato e ½ porção de gordura daquela refeição.'},
      {id:uid(),name:'Presunto de Parma — 50 g',note:'Subtrair 1 porção de proteína e 1 porção de gordura daquela refeição.'}
    ]
  };
  data.categories.forEach(category=>{
    category.items.forEach(item=>{item.id=stableEntityId('food',category.id,normalizedName(item.name));});
  });
  data.misc.forEach(item=>{item.id=stableEntityId('foodmisc',normalizedName(item.name));});
  return data;
}

const DEFAULT_EXERCISE_VIDEO_URLS=Object.freeze({
  [normalizedName("Supino reto barra")]:"https://youtube.com/shorts/CxzAHHDNUVc?feature=share",
  [normalizedName("Supino reto com barra")]:"https://youtube.com/shorts/CxzAHHDNUVc?feature=share",
  [normalizedName("Supino reto halteres")]:"https://youtube.com/shorts/s5ZLWn3PUho?feature=share",
  [normalizedName("Supino reto com halteres")]:"https://youtube.com/shorts/s5ZLWn3PUho?feature=share",
  [normalizedName("Supino reto articulado")]:"https://youtube.com/shorts/w6C26VH1fBM?feature=share",
  [normalizedName("Supino reto no smith")]:"https://youtube.com/shorts/mjwLNQidwFo?feature=share",
  [normalizedName("Supino reto no Smith")]:"https://youtube.com/shorts/mjwLNQidwFo?feature=share",
  [normalizedName("Supino vertical articulado")]:"https://youtube.com/shorts/rWbsu7tA-8Y?feature=share",
  [normalizedName("Supino inclinado articulado")]:"https://youtube.com/shorts/ozfjifgjnCw?feature=share",
  [normalizedName("Supino inclinado barra")]:"https://youtube.com/shorts/fZ2o8HpLuc8?feature=share",
  [normalizedName("Supino inclinado com barra")]:"https://youtube.com/shorts/fZ2o8HpLuc8?feature=share",
  [normalizedName("Supino inclinado halteres")]:"https://youtube.com/shorts/6dKYjXIgkFc?feature=share",
  [normalizedName("Supino inclinado com halteres")]:"https://youtube.com/shorts/6dKYjXIgkFc?feature=share",
  [normalizedName("Supino inclinado no smith")]:"https://youtube.com/shorts/jOnXA7hDMuc?feature=share",
  [normalizedName("Supino inclinado no Smith")]:"https://youtube.com/shorts/jOnXA7hDMuc?feature=share",
  [normalizedName("Supino declinado articulado")]:"https://youtube.com/shorts/-lvI4NwzNpw?feature=share",
  [normalizedName("Supino declinado halteres")]:"https://youtube.com/shorts/ODMKX-BCAQI?feature=share",
  [normalizedName("Supino declinado com halteres")]:"https://youtube.com/shorts/ODMKX-BCAQI?feature=share",
  [normalizedName("Supino declinado barra")]:"https://youtube.com/shorts/Rk3k2BE6m_o?feature=share",
  [normalizedName("Supino declinado com barra")]:"https://youtube.com/shorts/Rk3k2BE6m_o?feature=share",
  [normalizedName("Crucifixo máquina")]:"https://youtube.com/shorts/xZTzdOoxGqw?feature=share",
  [normalizedName("Crucifixo na máquina")]:"https://youtube.com/shorts/xZTzdOoxGqw?feature=share",
  [normalizedName("Crucifixo reto com halteres")]:"https://youtube.com/shorts/9CD7NmH8ff8?feature=share",
  [normalizedName("Crucifixo no banco reto com halteres")]:"https://youtube.com/shorts/9CD7NmH8ff8?feature=share",
  [normalizedName("Crucifixo inclinado halteres")]:"https://youtube.com/shorts/eVFkhYdQmEM?feature=share",
  [normalizedName("Crucifixo inclinado com halteres")]:"https://youtube.com/shorts/eVFkhYdQmEM?feature=share",
  [normalizedName("Crossover polia alta")]:"https://youtube.com/shorts/4pNymRkTtzM?feature=share",
  [normalizedName("Crossover na polia alta")]:"https://youtube.com/shorts/4pNymRkTtzM?feature=share",
  [normalizedName("Crossover polia baixa")]:"https://youtube.com/shorts/P8DOiCtuI2c?feature=share",
  [normalizedName("Crossover na polia baixa")]:"https://youtube.com/shorts/P8DOiCtuI2c?feature=share",
  [normalizedName("Puxada alta barra")]:"https://youtube.com/shorts/SjYyIZoNzzw?feature=share",
  [normalizedName("Puxada alta com barra")]:"https://youtube.com/shorts/SjYyIZoNzzw?feature=share",
  [normalizedName("Barra fixa")]:"https://youtube.com/shorts/rIKUJok32_k?feature=share",
  [normalizedName("Puxada alta articulada")]:"https://youtube.com/shorts/HMdUt_wH3c0?feature=share",
  [normalizedName("Puxada alta triângulo")]:"https://youtube.com/shorts/3bVof9FtzP0?feature=share",
  [normalizedName("Puxada alta com triângulo")]:"https://youtube.com/shorts/3bVof9FtzP0?feature=share",
  [normalizedName("Remada apoiada máquina")]:"https://youtube.com/shorts/GLtPFw2pEj0?feature=share",
  [normalizedName("Remada apoiada na máquina")]:"https://youtube.com/shorts/GLtPFw2pEj0?feature=share",
  [normalizedName("Remada apoiada inclinada máquina")]:"https://youtube.com/shorts/B1qYoBTKQWI?feature=share",
  [normalizedName("Remada apoiada inclinada na máquina")]:"https://youtube.com/shorts/B1qYoBTKQWI?feature=share",
  [normalizedName("Remada curvada barra")]:"https://youtube.com/shorts/NHasqOPT9NY?feature=share",
  [normalizedName("Remada curvada com barra")]:"https://youtube.com/shorts/NHasqOPT9NY?feature=share",
  [normalizedName("Remada serrote em cima do banco")]:"https://youtube.com/shorts/MXUAnauZ144?feature=share",
  [normalizedName("Remada serrote sobre o banco")]:"https://youtube.com/shorts/MXUAnauZ144?feature=share",
  [normalizedName("Remada meadows")]:"https://youtube.com/shorts/qpfx0yaeSLI?feature=share",
  [normalizedName("Remada Meadows")]:"https://youtube.com/shorts/qpfx0yaeSLI?feature=share",
  [normalizedName("Remada polia baixa triângulo")]:"https://youtube.com/shorts/Fm20PrEmXrM?feature=share",
  [normalizedName("Remada na polia baixa com triângulo")]:"https://youtube.com/shorts/Fm20PrEmXrM?feature=share",
  [normalizedName("Remada baixa articulada")]:"https://youtube.com/shorts/CdSGbc7h2gc?feature=share",
  [normalizedName("Remada baixa barra pegada pronada")]:"https://youtube.com/shorts/Y9XApeVYKJI?feature=share",
  [normalizedName("Remada baixa com barra e pegada pronada")]:"https://youtube.com/shorts/Y9XApeVYKJI?feature=share",
  [normalizedName("Desenvolvimento halteres")]:"https://youtube.com/shorts/cp-tzaQ2oKg?feature=share",
  [normalizedName("Desenvolvimento com halteres")]:"https://youtube.com/shorts/cp-tzaQ2oKg?feature=share",
  [normalizedName("Desenvolvimento máquina articulada")]:"https://youtube.com/shorts/hpkuy18o9zA?feature=share",
  [normalizedName("Desenvolvimento na máquina articulada")]:"https://youtube.com/shorts/hpkuy18o9zA?feature=share",
  [normalizedName("Elevação lateral halteres")]:"https://youtube.com/shorts/xrTFDyBAceo?feature=share",
  [normalizedName("Elevação lateral com halteres")]:"https://youtube.com/shorts/xrTFDyBAceo?feature=share",
  [normalizedName("Elevação lateral polia baixa")]:"https://youtube.com/shorts/5AEuvwk_Yd0?feature=share",
  [normalizedName("Elevação lateral na polia baixa")]:"https://youtube.com/shorts/5AEuvwk_Yd0?feature=share",
  [normalizedName("Elevação frontal halteres")]:"https://youtube.com/shorts/qg8xuSUHes4?feature=share",
  [normalizedName("Elevação frontal com halteres")]:"https://youtube.com/shorts/qg8xuSUHes4?feature=share",
  [normalizedName("Elevação frontal corda na polia")]:"https://youtube.com/shorts/BhuZY1Bs_Bk?feature=share",
  [normalizedName("Elevação frontal com corda na polia")]:"https://youtube.com/shorts/BhuZY1Bs_Bk?feature=share",
  [normalizedName("Rosca direta barra")]:"https://youtube.com/shorts/USe1t7LuFVo?feature=share",
  [normalizedName("Rosca direta com barra")]:"https://youtube.com/shorts/USe1t7LuFVo?feature=share",
  [normalizedName("Rosca direta halteres")]:"https://youtube.com/shorts/ojDmRshItXk?feature=share",
  [normalizedName("Rosca direta com halteres")]:"https://youtube.com/shorts/ojDmRshItXk?feature=share",
  [normalizedName("Rosca direta barra polia")]:"https://youtube.com/shorts/lWR4IncpQ_g?feature=share",
  [normalizedName("Rosca direta com barra na polia")]:"https://youtube.com/shorts/lWR4IncpQ_g?feature=share",
  [normalizedName("Rosca alternada halteres")]:"https://youtube.com/shorts/9MzGS8geaLI?feature=share",
  [normalizedName("Rosca alternada com halteres")]:"https://youtube.com/shorts/9MzGS8geaLI?feature=share",
  [normalizedName("Rosca martelo")]:"https://youtube.com/shorts/msB68mfEXN4?feature=share",
  [normalizedName("Rosca martelo corda polia")]:"https://youtube.com/shorts/tNZGsVFVNpY?feature=share",
  [normalizedName("Rosca martelo com corda na polia")]:"https://youtube.com/shorts/tNZGsVFVNpY?feature=share",
  [normalizedName("Rosca scott")]:"https://youtube.com/shorts/TYQNh6Elr3M?feature=share",
  [normalizedName("Rosca Scott")]:"https://youtube.com/shorts/TYQNh6Elr3M?feature=share",
  [normalizedName("Rosca scott unilateral")]:"https://youtube.com/shorts/MwE57-tEhWo?feature=share",
  [normalizedName("Rosca Scott unilateral")]:"https://youtube.com/shorts/MwE57-tEhWo?feature=share",
  [normalizedName("Tríceps corda polia")]:"https://youtube.com/shorts/FetQ0EIUvS4?feature=share",
  [normalizedName("Tríceps na polia com corda")]:"https://youtube.com/shorts/FetQ0EIUvS4?feature=share",
  [normalizedName("Tríceps unilateral polia(segurado no cabo)")]:"https://youtube.com/shorts/8VWApIOIZu4?feature=share",
  [normalizedName("Tríceps unilateral na polia")]:"https://youtube.com/shorts/8VWApIOIZu4?feature=share",
  [normalizedName("Tríceps barra polia")]:"https://youtube.com/shorts/llhoKGJ0jsA?feature=share",
  [normalizedName("Tríceps na polia com barra")]:"https://youtube.com/shorts/llhoKGJ0jsA?feature=share",
  [normalizedName("Tríceps francês halter")]:"https://youtube.com/shorts/n-0ZhSKgU7I?feature=share",
  [normalizedName("Tríceps francês com halter")]:"https://youtube.com/shorts/n-0ZhSKgU7I?feature=share",
  [normalizedName("Tríceps francês halter unilateral")]:"https://youtube.com/shorts/kDPfNff_ci4?feature=share",
  [normalizedName("Tríceps francês unilateral com halter")]:"https://youtube.com/shorts/kDPfNff_ci4?feature=share",
  [normalizedName("Tríceps francês polia")]:"https://youtube.com/shorts/RlqS07ibyk0?feature=share",
  [normalizedName("Tríceps francês na polia")]:"https://youtube.com/shorts/RlqS07ibyk0?feature=share",
  [normalizedName("Tríceps testa barra w")]:"https://youtube.com/shorts/BAISXDyFsQQ?feature=share",
  [normalizedName("Tríceps testa com barra W")]:"https://youtube.com/shorts/BAISXDyFsQQ?feature=share",
  [normalizedName("Tríceps testa halteres")]:"https://youtube.com/shorts/FCcTcG4zdr0?feature=share",
  [normalizedName("Tríceps testa com halteres")]:"https://youtube.com/shorts/FCcTcG4zdr0?feature=share",
  [normalizedName("Tríceps testa polia")]:"https://youtube.com/shorts/w0vGC1bAY9g?feature=share",
  [normalizedName("Tríceps testa na polia")]:"https://youtube.com/shorts/w0vGC1bAY9g?feature=share",
  [normalizedName("Rosca inversa Polia")]:"https://youtube.com/shorts/w2GXEdWm-_w?feature=share",
  [normalizedName("Rosca inversa na polia")]:"https://youtube.com/shorts/w2GXEdWm-_w?feature=share",
  [normalizedName("Leg press 45")]:"https://youtube.com/shorts/DaV5DZk2v14?feature=share",
  [normalizedName("Leg press 45°")]:"https://youtube.com/shorts/DaV5DZk2v14?feature=share",
  [normalizedName("Agachamento livre")]:"https://youtube.com/shorts/eertw2V0JrM?feature=share",
  [normalizedName("Agachamento hack")]:"https://youtube.com/shorts/lXfvfT5Qe74?feature=share",
  [normalizedName("Afundo no smith")]:"https://youtube.com/shorts/mRrCYQxaqy4?feature=share",
  [normalizedName("Afundo no Smith")]:"https://youtube.com/shorts/mRrCYQxaqy4?feature=share",
  [normalizedName("Cadeira adutora")]:"https://youtube.com/shorts/nzNE3Wupu1w?feature=share",
  [normalizedName("Mesa flexora")]:"https://youtube.com/shorts/inMx45m4B6E?feature=share",
  [normalizedName("Cadeira flexora")]:"https://youtube.com/shorts/cyVOJoWScMw?feature=share",
  [normalizedName("Stiff barra")]:"https://youtube.com/shorts/S2dF_VxzHkI?feature=share",
  [normalizedName("Stiff com barra")]:"https://youtube.com/shorts/S2dF_VxzHkI?feature=share",
  [normalizedName("RDL")]:"https://youtube.com/shorts/_gbIoOJaa2g?feature=share",
  [normalizedName("Cadeira abdutora")]:"https://youtube.com/shorts/legYPLQbnS4?feature=share",
  [normalizedName("Panturrilha sentado")]:"https://youtube.com/shorts/xS9T8y__5H8?feature=share",
  [normalizedName("Panturrilha sentada")]:"https://youtube.com/shorts/xS9T8y__5H8?feature=share",
  [normalizedName("Panturrilha de pé máquina")]:"https://youtube.com/shorts/r8Nd9Wm0Ocs?feature=share",
  [normalizedName("Panturrilha em pé na máquina")]:"https://youtube.com/shorts/r8Nd9Wm0Ocs?feature=share"
});
function defaultExerciseVideoUrl(name){return DEFAULT_EXERCISE_VIDEO_URLS[normalizedName(name)]||'';}
const OQM='ou qualquer máquina que estiver disponível';
function defaultExerciseOptions(){
  const g=(name,items,note)=>({
    id:stableEntityId('exgroup',normalizedName(name)),
    name,
    note:note===undefined?OQM:note,
    items:items.map(itemName=>({id:stableEntityId('exopt',normalizedName(name),normalizedName(itemName)),name:itemName,videoUrl:defaultExerciseVideoUrl(itemName)}))
  });
  return {catalogVersion:EXERCISE_CATALOG_VERSION,groups:[
    g('Supino Reto',['Supino reto com barra','Supino reto com halteres','Supino reto articulado','Supino reto no Smith','Supino vertical articulado']),
    g('Flexões de Braços',['Flexão de braços paralela ao chão','Flexão de braços inclinada com apoio no banco'],null),
    g('Supino Inclinado',['Supino inclinado com barra','Supino inclinado com halteres','Supino inclinado no Smith','Supino inclinado articulado']),
    g('Supino Declinado',['Supino declinado articulado','Supino declinado com halteres','Supino declinado com barra','Supino declinado no Smith']),
    g('Adução do Peitoral',['Crucifixo na máquina','Crucifixo na máquina articulada','Crossover na polia média','Crucifixo no banco reto com polia baixa','Crucifixo no banco reto com halteres','Crucifixo no banco inclinado com polia baixa','Crucifixo inclinado com halteres']),
    g('Crossovers',['Crossover na polia alta','Crossover na polia média','Crossover na polia baixa'],null),
    g('Puxadas',['Puxada alta com barra','Barra fixa','Puxada alta articulada','Puxada alta com triângulo','Puxada alta semi-ajoelhada unilateral','Puxada alta frontal na polia','Puxada alta frontal articulada']),
    g('Remadas Apoiadas',['Remada apoiada na máquina','Remada apoiada no banco a 30° com halteres','Remada apoiada inclinada na máquina']),
    g('Remadas Livres',['Remada curvada com barra','Remada curvada na máquina articulada ou no Smith','Remada serrote tradicional','Remada serrote sobre o banco','Remada curvada unilateral com barra','Remada cavalinho','Remada Meadows']),
    g('Remadas nos Cabos',['Remada na polia baixa com triângulo','Remada baixa articulada','Remada unilateral na polia baixa','Remada baixa com barra e pegada pronada','Remada baixa com barra e pegada supinada']),
    g('Desenvolvimentos',['Desenvolvimento com halteres','Desenvolvimento com barra livre','Desenvolvimento no Smith','Desenvolvimento na máquina articulada']),
    g('Elevações Laterais',['Elevação lateral com halteres','Elevação lateral sentada com halteres','Elevação lateral na polia baixa','Elevação lateral na polia média (um pouco abaixo do quadril)','Elevação lateral com o peito apoiado no banco a 70°','Elevação lateral na máquina articulada, em pé','Elevação lateral sentada na máquina articulada','Elevação lateral na polia baixa com halteres']),
    g('Elevações Frontais',['Elevação frontal com halteres','Elevação frontal com halteres e apoio no banco a 45°','Elevação frontal com barra','Elevação frontal com barra e apoio no banco a 45°','Elevação frontal na máquina articulada','Elevação frontal sentada com halteres no banco a 45°','Elevação frontal com corda na polia']),
    g('Elevações Posteriores',['Crucifixo inverso máquina','Crucifixo inverso máquina unilateral','Crucifixo inverso sentado com halteres','Crucifixo inverso de pé com halteres','Crucifixo inverso polia unilateral','Crucifixo inverso polia bilateral','Face pull']),
    g('Encolhimentos',['Encolhimento em pé com halteres','Encolhimento em pé com barra','Encolhimento no Smith','Encolhimento na polia']),
    g('Roscas Bíceps',['Rosca direta com barra','Rosca direta com halteres','Rosca direta com barra na polia','Rosca direta unilateral na polia','Rosca direta na máquina','Rosca Arnold ou rosca concentrada','Rosca apoiada no banco inclinado com barra','Rosca apoiada no banco inclinado com halteres','Rosca alternada com halteres']),
    g('Roscas para o Braquial',['Rosca martelo','Rosca martelo com corda na polia','Rosca com punho invertido (pronado)','Rosca Scott','Rosca Scott unilateral','Rosca Scott com punho neutro','Rosca Scott com punho neutro unilateral','Rosca Scott máquina','Rosca Scott na polia (adaptação da máquina)','Rosca Scott com punho invertido (pronado)','Rosca inversa na polia','Rosca inversa com barra/halteres']),
    g('Roscas Bíceps Inclinadas',['Rosca no banco a 45°','Rosca na polia com banco a 45°','Rosca bayesian','Rosca bayesian unilateral']),
    g('Extensão de Tríceps',['Tríceps na polia com corda','Tríceps unilateral na polia','Tríceps unilateral na polia (segurando o triângulo)','Tríceps na polia com barra']),
    g('Extensão de Tríceps Francês',['Tríceps francês com halter','Tríceps francês unilateral com halter','Tríceps francês com barra W','Tríceps francês na polia','Tríceps francês unilateral na polia','Tríceps francês na máquina']),
    g('Extensão de Tríceps Testa',['Tríceps testa com barra W','Tríceps testa com halteres','Tríceps testa unilateral com halter','Tríceps testa na polia','Tríceps testa unilateral na polia','Tríceps testa na máquina']),
    g('Roscas Inversas',['Rosca inversa com barra','Rosca inversa com halteres','Rosca inversa unilateral com halter','Rosca inversa na polia com barra','Rosca inversa na polia com corda','Rosca inversa unilateral na polia com triângulo']),
    g('Leg Press',['Leg press 45°','Leg press horizontal','Leg press vertical (90°)']),
    g('Agachamentos',['Agachamento livre','Agachamento com halteres','Agachamento no smith','Agachamento hack','Agachamento sumô']),
    g('Afundos e Búlgaros',['Afundo com halteres','Afundo no Smith','Afundo no Smith com step nos dois pés','Búlgaro com halteres','Búlgaro com barra','Búlgaro landmine','Búlgaro na máquina']),
    g('Extensoras',['Cadeira extensora'],null),
    g('Aduções',['Cadeira adutora','Adução na polia']),
    g('Flexoras',['Mesa flexora','Cadeira flexora','Flexora de pé','Flexão nórdica','Flexão de pernas com halter','Flexão nórdica no banco romano']),
    g('Stiff',['Stiff com barra','Stiff com halteres','Stiff unilateral com halter','Stiff na polia','Banco romano']),
    g('Levantamentos',['RDL','Levantamento terra','Levantamento meio-terra','Levantamento terra sumô']),
    g('Abdutoras',['Cadeira abdutora 45°','Cadeira abdutora','Abdução a 45° com caneleira','Abdução a 45° no cabo','Abdução de quadril na polia','Passadas laterais']),
    g('Elevações Pélvicas',['Elevação pélvica livre com barra','Elevação pélvica livre unilateral com barra','Elevação pélvica na máquina','Elevação pélvica unilateral na máquina','Elevação pélvica no Smith','Elevação pélvica unilateral no Smith','Elevação pélvica livre unilateral com halter']),
    g('Coices',['Coice na polia','Coice na máquina']),
    g('Gêmeos e Sóleo',['Panturrilha sentada','Panturrilha sentada no Smith']),
    g('Flexão Plantar',['Panturrilha em pé na máquina','Panturrilha em pé no Smith','Panturrilha no leg press','Panturrilha em pé segurando um halter'])
  ]};
}


function mergeFoodCatalogWithDefaults(stored){
  const base=defaultFoodOptions(),source=stored&&typeof stored==='object'?JSON.parse(JSON.stringify(stored)):{};
  // Persiste somente as chaves aceitas pelas regras atuais; campos legados
  // desconhecidos não podem bloquear a migração do catálogo.
  const result={catalogVersion:FOOD_CATALOG_VERSION,categories:Array.isArray(source.categories)?source.categories:[],misc:Array.isArray(source.misc)?source.misc:[]};
  for(const category of base.categories){
    let target=result.categories.find(c=>String(c.id||'')===String(category.id)||normalizedName(c.name)===normalizedName(category.name));
    if(!target){result.categories.push(JSON.parse(JSON.stringify(category)));continue;}
    target.items=Array.isArray(target.items)?target.items:[];
    for(const item of category.items){if(!target.items.some(x=>String(x.id||'')===String(item.id)||normalizedName(x.name)===normalizedName(item.name)))target.items.push({...item});}
  }
  for(const item of base.misc){if(!result.misc.some(x=>String(x.id||'')===String(item.id)||normalizedName(x.name)===normalizedName(item.name)))result.misc.push({...item});}
  return result;
}
function cacheFoodCatalog(){try{localStorage.setItem('team_bulls_food_catalog_cache',JSON.stringify(FOOD_OPTIONS));}catch(e){}}
function cachedFoodCatalog(){try{const raw=JSON.parse(localStorage.getItem('team_bulls_food_catalog_cache')||'null');return raw&&Array.isArray(raw.categories)?mergeFoodCatalogWithDefaults(raw):null;}catch(e){return null;}}
async function loadFoodOptions(){
  if(MODE==='local'){FOOD_OPTIONS=cachedFoodCatalog()||mergeFoodCatalogWithDefaults(null);return FOOD_OPTIONS;}
  try{
    const doc=await cloudGet(db.collection('foodOptions').doc('main'),'catálogo de alimentos');
    if(doc.exists){
      const stored=doc.data()||{};FOOD_OPTIONS=mergeFoodCatalogWithDefaults(stored);
      if(CURRENT_USER?.role==='trainer'&&Number(stored.catalogVersion)!==FOOD_CATALOG_VERSION)await cloudWrite(db.collection('foodOptions').doc('main').set(FOOD_OPTIONS),'salvar opções de alimentos');
    }else if(CURRENT_USER?.role==='trainer'){FOOD_OPTIONS=defaultFoodOptions();await cloudWrite(db.collection('foodOptions').doc('main').set(FOOD_OPTIONS),'salvar opções de alimentos');}
    else FOOD_OPTIONS=cachedFoodCatalog()||defaultFoodOptions();
  }catch(e){console.error('loadFoodOptions',e);FOOD_OPTIONS=cachedFoodCatalog()||defaultFoodOptions();}
  cacheFoodCatalog();return FOOD_OPTIONS;
}
async function persistFoodOptions(){
  FOOD_OPTIONS=mergeFoodCatalogWithDefaults(FOOD_OPTIONS);
  await cloudWrite(db.collection('foodOptions').doc('main').set(FOOD_OPTIONS),'salvar opções de alimentos');
  cacheFoodCatalog();return true;
}
async function openFoodOptions(){
  FOOD_OPTIONS_FROM=(CURRENT_USER?.role==='trainer')?'trainer':'home';
  showScreen('screen-food-options');
  document.getElementById('food-options-content').innerHTML='<div class="empty-state"><div class="empty-hint">Carregando...</div></div>';
  await loadFoodOptions();
  renderFoodOptions();
}
function goBackFromFoodOptions(){
  if(FOOD_OPTIONS_FROM==='trainer'){goTrainer();}else{goHome();}
}
function renderFoodOptions(){
  const canEdit=CURRENT_USER?.role==='trainer';
  const wrap=document.getElementById('food-options-content');
  if(!FOOD_OPTIONS.categories.length&&!FOOD_OPTIONS.misc.length){
    wrap.innerHTML=`<div class="empty-state"><div class="empty-icon">🍎</div><div class="empty-label">Nenhuma opção cadastrada</div><div class="empty-hint">${canEdit?'Toque em + para adicionar':'Seu treinador ainda não cadastrou as opções de alimentos'}</div></div>`;
    return;
  }
  let html=`<div class="options-intro">
    <div class="options-intro-title">Opções de suplementos</div>
    <div class="options-intro-subtitle">Cada alimento na tabela representa 1 porção do mesmo</div>
  </div>
  <div class="section-header"><span class="section-label">tabela de substituições por categoria</span><span class="section-label">deslize →</span></div>`;
  const maxRows=Math.max(0,...FOOD_OPTIONS.categories.map(category=>Array.isArray(category.items)?category.items.length:0));
  const headers=FOOD_OPTIONS.categories.map(category=>`<th>${esc(category.name)}${canEdit?`<button class="food-table-add" onclick="openAddFoodItem(${jsArg(category.id)})" aria-label="Adicionar alimento em ${esc(category.name)}">+</button>`:''}</th>`).join('');
  const rows=Array.from({length:maxRows},(_,rowIndex)=>`<tr>${FOOD_OPTIONS.categories.map(category=>{
    const item=(category.items||[])[rowIndex];
    if(!item)return'<td class="food-table-empty"></td>';
    const content=`<span class="food-table-name">${esc(item.name)}</span><span class="food-table-amount">${esc(item.amount)}</span>`;
    return canEdit
      ?`<td><button class="food-table-edit" onclick="openEditFoodItem(${jsArg(category.id)},${jsArg(item.id)})">${content}</button></td>`
      :`<td>${content}</td>`;
  }).join('')}</tr>`).join('');
  html+=`<div class="food-table-scroll"><table class="food-options-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
  html+=`<div class="section-header"><span class="section-label">alimentos diversos</span></div>`;
  if(canEdit) html+=`<button class="food-add-btn" onclick="openAddFoodMisc()">+ ADICIONAR ITEM</button>`;
  html+=FOOD_OPTIONS.misc.map(m=>`<div class="food-misc-row"${canEdit?` onclick="openEditFoodMisc(${jsArg(m.id)})" style="cursor:pointer"`:''}>
      <div class="food-misc-name">${esc(m.name)}</div>
      <div class="food-misc-note">${esc(m.note)}</div>
    </div>`).join('');
  wrap.innerHTML=html;
}
function openAddFoodItem(catId){
  EDIT_FOOD_CAT_ID=catId;EDIT_FOOD_ITEM_ID=null;
  document.getElementById('modal-food-item-title').textContent='Novo alimento';
  document.getElementById('input-food-item-name').value='';
  document.getElementById('input-food-item-amount').value='';
  document.getElementById('btn-delete-food-item').style.display='none';
  openModal('modal-food-item');
  focusEditorField('input-food-item-name',300);
}
function openEditFoodItem(catId,itemId){
  const cat=FOOD_OPTIONS.categories.find(c=>c.id===catId);if(!cat)return;
  const it=cat.items.find(x=>x.id===itemId);if(!it)return;
  EDIT_FOOD_CAT_ID=catId;EDIT_FOOD_ITEM_ID=itemId;
  document.getElementById('modal-food-item-title').textContent='Editar alimento';
  document.getElementById('input-food-item-name').value=it.name;
  document.getElementById('input-food-item-amount').value=it.amount;
  document.getElementById('btn-delete-food-item').style.display='block';
  openModal('modal-food-item');
}
async function saveFoodItem(){
  if(!beginAction('catalog-food-item'))return;
  const snapshot=JSON.stringify(FOOD_OPTIONS);
  try{
  const name=document.getElementById('input-food-item-name').value.trim();
  const amount=document.getElementById('input-food-item-amount').value.trim();
  if(!name||!amount){alert('Preencha o nome e a quantidade!');return;}
  const cat=FOOD_OPTIONS.categories.find(c=>c.id===EDIT_FOOD_CAT_ID);if(!cat)return;
  if(EDIT_FOOD_ITEM_ID){
    const it=cat.items.find(x=>x.id===EDIT_FOOD_ITEM_ID);
    it.name=name;it.amount=amount;
  }else{
    cat.items.push({id:uid(),name,amount});
  }
  await persistFoodOptions();
  closeModal('modal-food-item');
  renderFoodOptions();

  }catch(e){FOOD_OPTIONS=JSON.parse(snapshot);alert('Não foi possível salvar: '+e.message);}
  finally{endAction('catalog-food-item');}
}
function deleteFoodItemFromModal(){
  const cat=FOOD_OPTIONS.categories.find(c=>c.id===EDIT_FOOD_CAT_ID);if(!cat)return;
  showConfirm('Excluir alimento','Remover este alimento da lista?',async function(){
    const key='delete-food-item-'+EDIT_FOOD_ITEM_ID;if(!beginAction(key))return false;
    const snapshot=JSON.stringify(FOOD_OPTIONS);
    try{cat.items=cat.items.filter(x=>x.id!==EDIT_FOOD_ITEM_ID);await persistFoodOptions();closeModal('modal-food-item');renderFoodOptions();return true;}
    catch(e){FOOD_OPTIONS=JSON.parse(snapshot);alert('Não foi possível excluir: '+e.message);return false;}
    finally{endAction(key);}
  });
}
function openAddFoodMisc(){
  EDIT_FOOD_MISC_ID=null;
  document.getElementById('modal-food-misc-title').textContent='Novo item (diversos)';
  document.getElementById('input-food-misc-name').value='';
  document.getElementById('input-food-misc-note').value='';
  document.getElementById('btn-delete-food-misc').style.display='none';
  openModal('modal-food-misc');
  focusEditorField('input-food-misc-name',300);
}
function openEditFoodMisc(id){
  const m=FOOD_OPTIONS.misc.find(x=>x.id===id);if(!m)return;
  EDIT_FOOD_MISC_ID=id;
  document.getElementById('modal-food-misc-title').textContent='Editar item';
  document.getElementById('input-food-misc-name').value=m.name;
  document.getElementById('input-food-misc-note').value=m.note;
  document.getElementById('btn-delete-food-misc').style.display='block';
  openModal('modal-food-misc');
}
async function saveFoodMisc(){
  const name=document.getElementById('input-food-misc-name').value.trim(),note=document.getElementById('input-food-misc-note').value.trim();
  if(!name||!note){alert('Preencha os dois campos!');return;}
  const key='save-food-misc',snapshot=JSON.stringify(FOOD_OPTIONS);if(!beginAction(key,'modal-food-misc'))return;
  try{
    if(EDIT_FOOD_MISC_ID){const item=FOOD_OPTIONS.misc.find(x=>x.id===EDIT_FOOD_MISC_ID);if(!item)throw new Error('Item não encontrado.');item.name=name;item.note=note;}
    else FOOD_OPTIONS.misc.push({id:uid(),name,note});
    await persistFoodOptions();closeModal('modal-food-misc');renderFoodOptions();
  }catch(e){FOOD_OPTIONS=JSON.parse(snapshot);alert('Não foi possível salvar: '+e.message);}
  finally{endAction(key,'modal-food-misc');}
}
function deleteFoodMiscFromModal(){
  showConfirm('Excluir item','Remover este item da lista?',async function(){
    const key='delete-food-misc-'+EDIT_FOOD_MISC_ID,snapshot=JSON.stringify(FOOD_OPTIONS);if(!beginAction(key))return false;
    try{FOOD_OPTIONS.misc=FOOD_OPTIONS.misc.filter(x=>x.id!==EDIT_FOOD_MISC_ID);await persistFoodOptions();closeModal('modal-food-misc');renderFoodOptions();return true;}
    catch(e){FOOD_OPTIONS=JSON.parse(snapshot);alert('Não foi possível excluir: '+e.message);return false;}
    finally{endAction(key);}
  });
}

/* ══════════════════════════════════════════════════
   SUBSTITUIÇÕES DE EXERCÍCIOS (tabela de trocas por
   grupo — igual em espírito às Opções de Alimentos,
   mas aqui o treinador também pode criar/editar/excluir
   os GRUPOS, não só os itens dentro deles)
══════════════════════════════════════════════════ */

function normalizeExerciseCatalog(data){
  const source=data&&typeof data==='object'&&!Array.isArray(data)?data:{};
  const groups=(Array.isArray(source.groups)?source.groups:[]).map(group=>({
    id:String(group?.id||uid()),name:String(group?.name||'Grupo'),note:String(group?.note||''),
    items:(Array.isArray(group?.items)?group.items:[]).map(item=>({id:String(item?.id||uid()),name:String(item?.name||'Exercício'),videoUrl:String(item?.videoUrl||'')}))
  }));
  return{catalogVersion:Number(source.catalogVersion)||EXERCISE_CATALOG_VERSION,groups};
}
function cacheExerciseCatalog(){
  try{
    const safe=normalizeExerciseCatalog(EXERCISE_OPTIONS);
    safe.groups=safe.groups.map(group=>({...group,items:(group.items||[]).map(item=>({...item,videoUrl:''}))}));
    localStorage.setItem('team_bulls_exercise_catalog_cache',JSON.stringify(safe));
  }catch(e){}
}
function cachedExerciseCatalog(){
  try{
    const raw=JSON.parse(localStorage.getItem('team_bulls_exercise_catalog_cache')||'null');
    if(!raw||!Array.isArray(raw.groups)||!raw.groups.length)return null;
    const safe=normalizeExerciseCatalog(raw);safe.groups=safe.groups.map(group=>({...group,items:(group.items||[]).map(item=>({...item,videoUrl:''}))}));
    localStorage.setItem('team_bulls_exercise_catalog_cache',JSON.stringify(safe));return safe;
  }catch(e){return null;}
}
function findExerciseGroup(exercise){
  const groups=EXERCISE_OPTIONS.groups||[];
  return groups.find(g=>g.id===exercise?.catalogGroupId)||groups.find(g=>(g.items||[]).some(i=>normalizedName(i.name)===normalizedName(exercise?.name)))||null;
}
function preferredVariantKey(exercise){return'team_bulls_variant_'+(LOCAL_OWNER_UID||CURRENT_USER?.uid||'guest')+'_'+exercise.id;}
function getPreferredVariant(exercise,group){
  try{const id=localStorage.getItem(preferredVariantKey(exercise));const item=(group?.items||[]).find(x=>x.id===id);if(item)return item;}catch(e){}
  return(group?.items||[]).find(x=>x.id===exercise?.catalogItemId)||(group?.items||[])[0]||null;
}
function chooseExerciseVariant(exerciseId,itemId){
  const exercise=getE(CUR_WORKOUT,exerciseId);if(!exercise)return;const group=findExerciseGroup(exercise);const item=(group?.items||[]).find(x=>x.id===itemId);if(!item)return;
  try{localStorage.setItem(preferredVariantKey(exercise),item.id);}catch(e){}
  SESSION_VARIANT={itemId:item.id,name:item.name};renderExerciseSubstitutions(exercise,'exercise-substitution-box');showToast('Variação selecionada: '+item.name);
}
async function renderExerciseSubstitutions(exercise,elId){
  const seq=++SUBSTITUTION_RENDER_SEQ,exerciseId=String(exercise?.id||'');
  await loadExerciseOptions();
  if(seq!==SUBSTITUTION_RENDER_SEQ||String(CUR_EX||'')!==exerciseId)return;
  const el=document.getElementById(elId);if(!el)return;
  const group=findExerciseGroup(exercise);if(!group){el.innerHTML='';return;}
  const preferred=getPreferredVariant(exercise,group),videoAllowed=canUseCatalogVideos();
  el.innerHTML=`<div class="exercise-substitution-box"><div class="exercise-substitution-head"><div><div class="exercise-substitution-group">GRUPO // ${esc(group.name)}</div><div class="exercise-substitution-title">Substituições disponíveis</div></div></div>${group.items.map(item=>`<div class="sub-option-row"><span class="sub-option-name">${esc(item.name)}</span><button class="${preferred?.id===item.id?'selected':''}" onclick="chooseExerciseVariant(${jsArg(exercise.id)},${jsArg(item.id)})">${preferred?.id===item.id?'SELECIONADO':'USAR'}</button>${item.videoUrl?`<button class="${videoAllowed?'':'locked'}" onclick="${videoAllowed?`openCatalogVideo(${jsArg(item.videoUrl)},${jsArg(item.name)})`:`showToast('Vídeos disponíveis somente para alunos ativos online.',true)`}">▶ VÍDEO</button>`:'<span></span>'}</div>`).join('')}${group.note?`<div class="plan-help">${esc(group.note)}</div>`:''}</div>`;
}
async function populateVariantSelect(exercise,selectId,groupWrapId,selectedItemId='',selectedName=''){
  const seq=++VARIANT_LOAD_SEQ,exerciseId=String(exercise?.id||'');
  await loadExerciseOptions();
  if(seq!==VARIANT_LOAD_SEQ||String(exercise?.id||'')!==exerciseId)return;
  const group=findExerciseGroup(exercise),wrap=document.getElementById(groupWrapId),select=document.getElementById(selectId);if(!wrap||!select||!select.isConnected)return;
  if(!group||!(group.items||[]).length){wrap.style.display='none';select.innerHTML='';return;}
  const preferred=getPreferredVariant(exercise,group),selected=(group.items||[]).find(i=>i.id===selectedItemId)||(group.items||[]).find(i=>normalizedName(i.name)===normalizedName(selectedName))||preferred;
  select.innerHTML=group.items.map(item=>`<option value="${esc(item.id)}"${selected?.id===item.id?' selected':''}>${esc(item.name)}</option>`).join('');wrap.style.display='block';
}
function selectedVariantData(exercise,selectId){const group=findExerciseGroup(exercise),select=document.getElementById(selectId),item=(group?.items||[]).find(i=>i.id===select?.value);return item?{performedExerciseItemId:item.id,performedExerciseName:item.name}:{performedExerciseItemId:'',performedExerciseName:exercise?.name||''};}
function openCatalogVideo(url,title){
  if(!canUseCatalogVideos()&&CURRENT_USER?.role!=='trainer'){showToast('Vídeos disponíveis somente para alunos ativos online.',true);return;}
  const id=extractYouTubeId(url);if(!id){showToast('Use um link válido do YouTube.',true);return;}
  document.getElementById('catalog-video-title').textContent=title||'Vídeo de execução';
  document.getElementById('catalog-video-body').innerHTML=`<iframe title="${esc(title||'Vídeo de execução')}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" src="https://www.youtube-nocookie.com/embed/${esc(id)}?rel=0" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen sandbox="allow-scripts allow-same-origin allow-presentation" style="width:100%;aspect-ratio:16/9;border:0"></iframe>`;
  openModal('modal-catalog-video');
}
function closeCatalogVideo(){document.getElementById('catalog-video-body').innerHTML='';closeModal('modal-catalog-video');}


function mergeExerciseCatalogWithDefaults(stored){
  const base=normalizeExerciseCatalog(defaultExerciseOptions()),source=normalizeExerciseCatalog(stored||{});
  const result={...source,catalogVersion:EXERCISE_CATALOG_VERSION,groups:Array.isArray(source.groups)?source.groups:[]};
  for(const group of base.groups){
    let target=result.groups.find(g=>String(g.id||'')===String(group.id)||normalizedName(g.name)===normalizedName(group.name));
    if(!target){result.groups.push(JSON.parse(JSON.stringify(group)));continue;}
    target.items=Array.isArray(target.items)?target.items:[];
    for(const item of group.items){const existing=target.items.find(x=>String(x.id||'')===String(item.id)||normalizedName(x.name)===normalizedName(item.name));if(!existing)target.items.push({...item});else if(!String(existing.videoUrl||'').trim()&&item.videoUrl)existing.videoUrl=item.videoUrl;}
  }
  return normalizeExerciseCatalog(result);
}
async function loadExerciseOptions(force=false){
  if(MODE==='local'){EXERCISE_OPTIONS=cachedExerciseCatalog()||mergeExerciseCatalogWithDefaults(null);return EXERCISE_OPTIONS;}
  if(!force&&EXERCISE_OPTIONS_LOAD_PROMISE)return EXERCISE_OPTIONS_LOAD_PROMISE;
  if(!force&&EXERCISE_OPTIONS.groups?.length&&Date.now()-EXERCISE_OPTIONS_LOADED_AT<60000)return EXERCISE_OPTIONS;
  EXERCISE_OPTIONS_LOAD_PROMISE=(async()=>{
    try{
      const doc=await cloudGet(db.collection('exerciseOptions').doc('main'),'catálogo de exercícios');
      if(doc.exists){
        const stored=doc.data()||{};EXERCISE_OPTIONS=mergeExerciseCatalogWithDefaults(stored);
        if(CURRENT_USER?.role==='trainer'&&Number(stored.catalogVersion)!==EXERCISE_CATALOG_VERSION)await cloudWrite(db.collection('exerciseOptions').doc('main').set(EXERCISE_OPTIONS),'salvar substituições');
      }else if(CURRENT_USER?.role==='trainer'){EXERCISE_OPTIONS=defaultExerciseOptions();await cloudWrite(db.collection('exerciseOptions').doc('main').set(EXERCISE_OPTIONS),'salvar substituições');}
      else EXERCISE_OPTIONS=mergeExerciseCatalogWithDefaults(null);
    }catch(e){console.error('loadExerciseOptions',e);EXERCISE_OPTIONS=cachedExerciseCatalog()||mergeExerciseCatalogWithDefaults(null);}
    EXERCISE_OPTIONS_LOADED_AT=Date.now();cacheExerciseCatalog();return EXERCISE_OPTIONS;
  })();
  try{return await EXERCISE_OPTIONS_LOAD_PROMISE;}finally{EXERCISE_OPTIONS_LOAD_PROMISE=null;}
}
async function persistExerciseOptions(){
  EXERCISE_OPTIONS=mergeExerciseCatalogWithDefaults(EXERCISE_OPTIONS);
  await cloudWrite(db.collection('exerciseOptions').doc('main').set(EXERCISE_OPTIONS),'salvar substituições');
  EXERCISE_OPTIONS_LOADED_AT=Date.now();cacheExerciseCatalog();return true;
}
async function openExerciseOptions(){
  EXERCISE_OPTIONS_FROM=(CURRENT_USER?.role==='trainer')?'trainer':'home';
  showScreen('screen-exercise-options');
  document.getElementById('exercise-options-content').innerHTML='<div class="empty-state"><div class="empty-hint">Carregando...</div></div>';
  await loadExerciseOptions();
  renderExerciseOptions();
}
function goBackFromExerciseOptions(){
  if(EXERCISE_OPTIONS_FROM==='trainer'){goTrainer();}else{goHome();}
}
function renderExerciseOptions(){
  const canEdit=CURRENT_USER?.role==='trainer';
  const wrap=document.getElementById('exercise-options-content');
  if(!EXERCISE_OPTIONS.groups.length){
    wrap.innerHTML=`<div class="empty-state"><div class="empty-icon">🔄</div><div class="empty-label">Nenhum grupo cadastrado</div><div class="empty-hint">${canEdit?'Toque em + NOVO GRUPO para adicionar':'Seu treinador ainda não cadastrou as substituições de exercícios'}</div></div>`;
    return;
  }
  const exerciseCount=EXERCISE_OPTIONS.groups.reduce((total,group)=>total+(Array.isArray(group.items)?group.items.length:0),0);
  let html=`<div class="options-intro">
    <div class="options-intro-title">Opções de exercícios</div>
    <div class="options-intro-subtitle">${exerciseCount} exercícios organizados em ${EXERCISE_OPTIONS.groups.length} grupos, na ordem da lista de montagem de treino.</div>
  </div><div class="section-header"><span class="section-label">catálogo por grupo de exercício</span></div>`;
  if(canEdit) html+=`<button class="food-add-btn" onclick="openAddExerciseGroup()">+ NOVO GRUPO</button>`;
  html+=EXERCISE_OPTIONS.groups.map(gr=>{
    const videoAllowed=canUseCatalogVideos()||canEdit;
    const items=gr.items.map(it=>`<div class="food-item-row">
        <span class="food-item-name">${esc(it.name)}</span>
        <div class="food-item-actions">${it.videoUrl?`<button class="catalog-video-btn ${videoAllowed?'':'locked'}" onclick="${videoAllowed?`openCatalogVideo(${jsArg(it.videoUrl)},${jsArg(it.name)})`:`showToast('Vídeos disponíveis somente para alunos ativos online.',true)`}">▶ VÍDEO</button>`:''}${canEdit?`<button class="btn-icon ghost" style="width:26px;height:26px;font-size:12px" onclick="openEditExOptItem(${jsArg(gr.id)},${jsArg(it.id)})">✏️</button>`:''}</div>
      </div>`).join('');
    return `<div class="food-cat-block">
      <div class="food-cat-title">
        <span${canEdit?` style="cursor:pointer" onclick="openEditExerciseGroup(${jsArg(gr.id)})"`:''}>${esc(gr.name)}</span>
        ${canEdit?`<button class="btn-icon ghost" style="width:24px;height:24px;font-size:14px" onclick="openAddExOptItem(${jsArg(gr.id)})">+</button>`:''}
      </div>
      ${items||'<div class="empty-hint" style="text-align:left;padding:6px 0;margin:0">Nenhuma opção</div>'}
      ${gr.note?`<div class="food-misc-note" style="margin-top:6px;font-style:italic">${esc(gr.note)}</div>`:''}
    </div>`;
  }).join('');
  wrap.innerHTML=html;
}
// Grupo (ex: "Supino Reto")
function openAddExerciseGroup(){
  EDIT_EXOPT_GROUP_ID=null;
  document.getElementById('modal-exercise-group-title').textContent='Novo grupo';
  document.getElementById('input-exercise-group-name').value='';
  document.getElementById('input-exercise-group-note').value=OQM;
  document.getElementById('btn-delete-exercise-group').style.display='none';
  openModal('modal-exercise-group');
  focusEditorField('input-exercise-group-name',300);
}
function openEditExerciseGroup(gid){
  const gr=EXERCISE_OPTIONS.groups.find(g=>g.id===gid);if(!gr)return;
  EDIT_EXOPT_GROUP_ID=gid;
  document.getElementById('modal-exercise-group-title').textContent='Editar grupo';
  document.getElementById('input-exercise-group-name').value=gr.name;
  document.getElementById('input-exercise-group-note').value=gr.note||'';
  document.getElementById('btn-delete-exercise-group').style.display='block';
  openModal('modal-exercise-group');
}
async function saveExerciseGroup(){
  if(!beginAction('catalog-ex-group'))return;
  const snapshot=JSON.stringify(EXERCISE_OPTIONS);
  try{
  const name=document.getElementById('input-exercise-group-name').value.trim();
  const note=document.getElementById('input-exercise-group-note').value.trim();
  if(!name){alert('Digite o nome do grupo!');return;}
  if(EDIT_EXOPT_GROUP_ID){
    const gr=EXERCISE_OPTIONS.groups.find(g=>g.id===EDIT_EXOPT_GROUP_ID);
    gr.name=name;gr.note=note;
  }else{
    EXERCISE_OPTIONS.groups.push({id:uid(),name,note,items:[]});
  }
  await persistExerciseOptions();
  closeModal('modal-exercise-group');
  renderExerciseOptions();

  }catch(e){EXERCISE_OPTIONS=JSON.parse(snapshot);alert('Não foi possível salvar: '+e.message);}
  finally{endAction('catalog-ex-group');}
}
function deleteExerciseGroupFromModal(){
  showConfirm('Excluir grupo','Excluir este grupo e todas as opções dentro dele?',async function(){
    const key='delete-exercise-group-'+EDIT_EXOPT_GROUP_ID;if(!beginAction(key))return false;
    const snapshot=JSON.stringify(EXERCISE_OPTIONS);
    try{EXERCISE_OPTIONS.groups=EXERCISE_OPTIONS.groups.filter(g=>g.id!==EDIT_EXOPT_GROUP_ID);await persistExerciseOptions();closeModal('modal-exercise-group');renderExerciseOptions();return true;}
    catch(e){EXERCISE_OPTIONS=JSON.parse(snapshot);alert('Não foi possível excluir: '+e.message);return false;}
    finally{endAction(key);}
  });
}
// Item dentro de um grupo (ex: "Supino reto barra")
function openAddExOptItem(gid){
  EDIT_EXOPT_GROUP_ID=gid;EDIT_EXOPT_ITEM_ID=null;
  document.getElementById('modal-exercise-option-item-title').textContent='Nova opção';
  document.getElementById('input-exercise-option-item-name').value='';
  document.getElementById('input-exercise-option-item-video').value='';
  document.getElementById('btn-delete-exercise-option-item').style.display='none';
  openModal('modal-exercise-option-item');
  focusEditorField('input-exercise-option-item-name',300);
}
function openEditExOptItem(gid,itemId){
  const gr=EXERCISE_OPTIONS.groups.find(g=>g.id===gid);if(!gr)return;
  const it=gr.items.find(x=>x.id===itemId);if(!it)return;
  EDIT_EXOPT_GROUP_ID=gid;EDIT_EXOPT_ITEM_ID=itemId;
  document.getElementById('modal-exercise-option-item-title').textContent='Editar opção';
  document.getElementById('input-exercise-option-item-name').value=it.name;
  document.getElementById('input-exercise-option-item-video').value=it.videoUrl||'';
  document.getElementById('btn-delete-exercise-option-item').style.display='block';
  openModal('modal-exercise-option-item');
}
async function saveExOptItem(){
  const name=document.getElementById('input-exercise-option-item-name').value.trim(),videoUrl=document.getElementById('input-exercise-option-item-video').value.trim();
  if(!name){alert('Digite o nome do exercício!');return;}
  if(videoUrl&&!extractYouTubeId(videoUrl)){alert('Use um link válido do YouTube.');return;}
  const group=EXERCISE_OPTIONS.groups.find(g=>g.id===EDIT_EXOPT_GROUP_ID);if(!group)return;
  const key='save-exercise-option',snapshot=JSON.stringify(EXERCISE_OPTIONS);if(!beginAction(key,'modal-exercise-option-item'))return;
  try{
    if(EDIT_EXOPT_ITEM_ID){const item=group.items.find(x=>x.id===EDIT_EXOPT_ITEM_ID);if(!item)throw new Error('Opção não encontrada.');item.name=name;item.videoUrl=videoUrl;}
    else group.items.push({id:uid(),name,videoUrl});
    await persistExerciseOptions();closeModal('modal-exercise-option-item');renderExerciseOptions();
  }catch(e){EXERCISE_OPTIONS=JSON.parse(snapshot);alert('Não foi possível salvar: '+e.message);}
  finally{endAction(key,'modal-exercise-option-item');}
}
function deleteExOptItemFromModal(){
  const group=EXERCISE_OPTIONS.groups.find(g=>g.id===EDIT_EXOPT_GROUP_ID);if(!group)return;
  showConfirm('Excluir opção','Remover esta opção de exercício?',async function(){
    const key='delete-exercise-item-'+EDIT_EXOPT_ITEM_ID;if(!beginAction(key))return false;
    const snapshot=JSON.stringify(EXERCISE_OPTIONS);
    try{group.items=group.items.filter(x=>x.id!==EDIT_EXOPT_ITEM_ID);await persistExerciseOptions();closeModal('modal-exercise-option-item');renderExerciseOptions();return true;}
    catch(e){EXERCISE_OPTIONS=JSON.parse(snapshot);alert('Não foi possível excluir: '+e.message);return false;}
    finally{endAction(key);}
  });
}

/* ══════════════════════════════════════════════════
   FOTOS DE PROGRESSO (base64 comprimido no Firestore —
   evita depender do Firebase Storage / plano pago Blaze)
══════════════════════════════════════════════════ */
let PHOTOS_CACHE=[];
let CUR_PHOTO_ID=null;
let PHOTOS_CACHE_UID=null;
let PHOTOS_LOAD_SEQ=0;
let PENDING_PHOTO_WEIGHT=null;
const MAX_PHOTOS_PER_UPLOAD=6;
async function decodeImageForCompression(file){
  if(!(file instanceof Blob)||!String(file.type||'').startsWith('image/'))throw new Error('Escolha uma imagem válida.');
  if('createImageBitmap' in window){
    try{const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});return{source:bitmap,width:bitmap.width,height:bitmap.height,close:()=>bitmap.close?.()};}catch(error){}
  }
  return new Promise((resolve,reject)=>{const url=URL.createObjectURL(file),img=new Image();img.onload=()=>resolve({source:img,width:img.naturalWidth||img.width,height:img.naturalHeight||img.height,close:()=>URL.revokeObjectURL(url)});img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Não foi possível ler a imagem.'));};img.src=url;});
}
function encodeImageVariant(decoded,maxDim=1280,quality=.78,maxDataLength=850000){
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('Seu navegador não conseguiu preparar a imagem.');
  let scale=Math.min(1,maxDim/Math.max(decoded.width,decoded.height)),width=Math.max(1,Math.round(decoded.width*scale)),height=Math.max(1,Math.round(decoded.height*scale)),q=quality,output='';
  for(let attempt=0;attempt<20;attempt++){
    canvas.width=width;canvas.height=height;ctx.fillStyle='#0c0c0c';ctx.fillRect(0,0,width,height);ctx.drawImage(decoded.source,0,0,width,height);output=canvas.toDataURL('image/jpeg',q);
    if(output.length<=maxDataLength)return output;
    if(q>.40)q=Math.max(.40,q-.07);else{width=Math.max(240,Math.round(width*.82));height=Math.max(240,Math.round(height*.82));}
  }
  if(output&&output.length<=maxDataLength)return output;
  throw new Error('O navegador não conseguiu otimizar esta imagem. Tente fotografar novamente ou escolher outra imagem.');
}
async function compressImageFile(file,maxDim=1280,quality=.78,maxDataLength=850000){
  const decoded=await decodeImageForCompression(file);try{return encodeImageVariant(decoded,maxDim,quality,maxDataLength);}finally{decoded.close?.();}
}
async function buildProgressPhotoVariants(file){
  const decoded=await decodeImageForCompression(file);try{return{full:encodeImageVariant(decoded,1280,.78,850000),thumb:encodeImageVariant(decoded,420,.66,170000)};}finally{decoded.close?.();}
}
async function openPhotos(){
  if(MODE==='local'){
    alert('Fotos de progresso ficam salvas na nuvem e exigem login. Faça login para usar este recurso.');
    return;
  }
  const navigation=beginAsyncNavigation(),targetUid=CURRENT_USER.uid;
  await loadPhotos(targetUid);
  if(!isNavigationCurrent(navigation)||CURRENT_USER?.uid!==targetUid)return;
  renderPhotosGallery('photos-grid-el','photos-empty-el',false);
  showScreen('screen-photos',navigation);
}
async function loadPhotos(uidOverride){
  const targetUid=uidOverride||CURRENT_USER.uid;
  const loadSeq=++PHOTOS_LOAD_SEQ;
  try{
    const snap=await cloudGet(db.collection('progressPhotos').where('userId','==',targetUid),'fotos de evolução');
    const photos=snap.docs.map(d=>{
      const raw=d.data()||{};
      return{...raw,id:d.id,userId:String(raw.userId||targetUid),dataUrl:safePhotoDataUrl(raw.dataUrl),photoPath:safePhotoPath(raw.photoPath),thumbPath:safePhotoPath(raw.thumbPath)};
    }).filter(p=>p.dataUrl||p.photoPath||p.thumbPath);
    photos.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.id).localeCompare(String(a.id)));
    if(loadSeq!==PHOTOS_LOAD_SEQ)return PHOTOS_CACHE;
    PHOTOS_CACHE=photos;
    PHOTOS_CACHE_UID=targetUid;
    return photos;
  }catch(e){
    console.error('loadPhotos',e);
    if(loadSeq===PHOTOS_LOAD_SEQ&&PHOTOS_CACHE_UID!==targetUid)PHOTOS_CACHE=[];
    showToast('Não foi possível atualizar as fotos.',true);
    return PHOTOS_CACHE;
  }
}
function renderPhotosGallery(gridId,emptyId,readonly){
  const grid=document.getElementById(gridId);
  const empty=document.getElementById(emptyId);
  if(!grid)return;
  if(!PHOTOS_CACHE.length){grid.innerHTML='';if(empty)empty.style.display='block';return;}
  if(empty)empty.style.display='none';
  grid.innerHTML=PHOTOS_CACHE.map(p=>{
    const direct=safePhotoDataUrl(p.dataUrl)||p._photoSrc||'';
    return`<div class="photo-thumb" onclick="openPhotoView(${jsArg(p.id)},${readonly})"><img ${direct?`src="${esc(direct)}"`:''} data-photo-record="progress" data-photo-id="${esc(p.id)}" loading="lazy" decoding="async" alt="Evidência de ${esc(fmt(p.date))}"><div class="photo-thumb-date">${esc(fmt(p.date))}${Number(p.weight)>0?'<br>'+esc(Number(p.weight).toLocaleString('pt-BR',{maximumFractionDigits:1}))+' kg':''}</div></div>`;
  }).join('');
  hydrateSecureImages(grid);
}
function triggerPhotoUpload(){
  PENDING_PHOTO_WEIGHT=null;
  document.getElementById('input-photo-weight').value='';
  openModal('modal-photo-upload');
  focusEditorField('input-photo-weight',250);
}
function choosePhotoForUpload(){
  const raw=String(document.getElementById('input-photo-weight').value||'').replace(',','.');
  const weight=Number(raw);
  if(!Number.isFinite(weight)||weight<20||weight>500){alert('Informe um peso válido entre 20 e 500 kg.');return;}
  PENDING_PHOTO_WEIGHT=Math.round(weight*10)/10;
  document.getElementById('photo-file-input').click();
}
async function handlePhotoSelected(ev){
  const files=Array.from(ev.target.files||[]);ev.target.value='';
  if(!files.length)return;
  if(!Number.isFinite(PENDING_PHOTO_WEIGHT)){alert('Informe o peso antes de selecionar as fotografias.');return;}
  if(files.length>MAX_PHOTOS_PER_UPLOAD){alert('Selecione no máximo '+MAX_PHOTOS_PER_UPLOAD+' fotos por envio.');return;}
  const invalid=files.find(file=>!String(file.type||'').startsWith('image/'));
  if(invalid){alert('O arquivo "'+invalid.name+'" não é uma imagem válida.');return;}
  if(!beginAction('upload-photo','modal-photo-upload'))return;
  const userId=CURRENT_USER?.uid;
  const uploadDate=today();
  const weight=PENDING_PHOTO_WEIGHT;
  let uploaded=0,failure=null;
  try{
    if(!userId)throw new Error('Faça login novamente antes de enviar as fotos.');
    // Cada documento recebe um ID antes da escrita. Assim, se a rede confirmar
    // depois do timeout e o usuário tentar novamente, a mesma fotografia não
    // cria duplicatas por causa de .add().
    for(const file of files){
      const variants=await buildProgressPhotoVariants(file),photoId=db.collection('progressPhotos').doc().id;
      const photoPath=await uploadCloudPhoto('progressPhotos',userId,photoId,variants.full);
      const thumbPath=photoPath?await uploadCloudPhoto('progressPhotoThumbs',userId,photoId,variants.thumb):'';
      const payload={userId,date:uploadDate,weight,createdAt:firebase.firestore.FieldValue.serverTimestamp()};
      if(photoPath){payload.photoPath=photoPath;if(thumbPath)payload.thumbPath=thumbPath;}else payload.dataUrl=variants.full;
      try{
        await cloudWrite(db.collection('progressPhotos').doc(photoId).set(payload),'enviar a foto');
      }catch(error){
        await Promise.allSettled([photoPath&&deleteCloudPhoto(photoPath),thumbPath&&deleteCloudPhoto(thumbPath)].filter(Boolean));
        throw error;
      }
      uploaded++;
      if(files.length>1&&uploaded<files.length)showToast('Enviando '+(uploaded+1)+' de '+files.length+'...');
    }
  }catch(e){failure=e;}
  try{
    if(uploaded){
      closeModal('modal-photo-upload');
      PENDING_PHOTO_WEIGHT=null;
      if(CURRENT_USER?.uid===userId){
        await loadPhotos(userId);
        renderPhotosGallery('photos-grid-el','photos-empty-el',false);
      }
    }
    if(failure){
      const partial=uploaded
        ?(uploaded===1?'1 de '+files.length+' foto foi enviada antes da falha.\n\n':uploaded+' de '+files.length+' fotos foram enviadas antes da falha.\n\n')
        :'';
      alert(partial+cloudWriteError(failure,'enviar as fotos'));
    }else{
      showToast(uploaded===1?'✓ Evidência arquivada':'✓ '+uploaded+' evidências arquivadas');
    }
  }finally{endAction('upload-photo','modal-photo-upload');}
}
async function openPhotoView(pid,readonly){
  const p=PHOTOS_CACHE.find(x=>x.id===pid);if(!p)return;
  CUR_PHOTO_ID=pid;
  document.getElementById('photo-view-title').textContent='Evidência // '+fmt(p.date);
  const img=document.getElementById('photo-view-img');
  img.removeAttribute('src');
  const src=await resolvePhotoSource(p,{full:CURRENT_USER?.role==='trainer'});
  if(!src){showToast('A fotografia não está disponível neste momento.',true);return;}
  img.src=src;
  document.getElementById('photo-view-meta').textContent=Number(p.weight)>0?'PESO REGISTRADO: '+Number(p.weight).toLocaleString('pt-BR',{maximumFractionDigits:1})+' kg':'PESO NÃO INFORMADO NESTE REGISTRO';
  document.getElementById('btn-delete-photo').style.display=(readonly||p.checkinId||p.reportId||p.questionnaireId)?'none':'block';
  openModal('modal-photo-view');
}
async function deleteCurrentPhoto(){
  if(!CUR_PHOTO_ID)return;
  const pid=CUR_PHOTO_ID;
  const record=PHOTOS_CACHE.find(item=>String(item.id)===String(pid));
  closeModal('modal-photo-view');
  showConfirm('Excluir foto','Apagar esta foto de progresso?',async function(){
    try{
      await cloudWrite(db.collection('progressPhotos').doc(pid).delete(),'excluir a foto');
      await Promise.allSettled([record?.photoPath&&deleteCloudPhoto(record.photoPath),record?.thumbPath&&deleteCloudPhoto(record.thumbPath)].filter(Boolean));
    }catch(e){alert('Erro ao excluir foto: '+cloudWriteError(e,'excluir a foto'));return;}
    await loadPhotos();
    renderPhotosGallery('photos-grid-el','photos-empty-el',false);
  });
}
function openComparePhotos(){
  if(PHOTOS_CACHE.length<2){alert('Envie ao menos duas fotos para comparar.');return;}
  const opts=PHOTOS_CACHE.map(p=>`<option value="${esc(p.id)}">${fmt(p.date)}${Number(p.weight)>0?' · '+esc(Number(p.weight).toLocaleString('pt-BR',{maximumFractionDigits:1}))+' kg':''}</option>`).join('');
  document.getElementById('select-compare-a').innerHTML=opts;document.getElementById('select-compare-b').innerHTML=opts;
  document.getElementById('select-compare-b').selectedIndex=1;document.getElementById('compare-result').style.display='none';openModal('modal-compare-photos');
}
async function runComparePhotos(){
  const aid=document.getElementById('select-compare-a').value,bid=document.getElementById('select-compare-b').value;
  if(aid===bid){alert('Selecione duas fotos diferentes.');return;}
  const a=PHOTOS_CACHE.find(x=>x.id===aid),b=PHOTOS_CACHE.find(x=>x.id===bid);if(!a||!b)return;
  const full=CURRENT_USER?.role==='trainer';const [srcA,srcB]=await Promise.all([resolvePhotoSource(a,{full}),resolvePhotoSource(b,{full})]);
  if(!srcA||!srcB){alert('Uma das fotografias não pôde ser carregada. Tente novamente com internet.');return;}
  document.getElementById('compare-img-a').src=srcA;document.getElementById('compare-label-a').textContent=fmt(a.date)+(Number(a.weight)>0?' · '+Number(a.weight).toLocaleString('pt-BR',{maximumFractionDigits:1})+' kg':'');
  document.getElementById('compare-img-b').src=srcB;document.getElementById('compare-label-b').textContent=fmt(b.date)+(Number(b.weight)>0?' · '+Number(b.weight).toLocaleString('pt-BR',{maximumFractionDigits:1})+' kg':'');
  document.getElementById('compare-result').style.display='block';
}
async function openTsPhotos(){
  if(!VIEW_STUDENT)return;
  const navigation=beginAsyncNavigation(),studentUid=VIEW_STUDENT.uid;
  await loadPhotos(studentUid);
  if(!isNavigationCurrent(navigation)||VIEW_STUDENT?.uid!==studentUid)return;
  renderPhotosGallery('ts-photos-grid','ts-photos-empty',true);
  showScreen('screen-ts-photos',navigation);
}

/* ══════════════════════════════════════════════════
   RELATÓRIOS
══════════════════════════════════════════════════ */
let QUEST_Q_COUNT=0;
let CUR_ANSWER_QUEST_ID=null;
let TS_QUEST_CACHE=[];
let MY_QUEST_CACHE=[];
let QUESTIONNAIRE_TARGET_UID=null;
let QUESTIONNAIRE_TARGET_NAME='';
let CURRENT_ANSWER_REPORT=null;
let QUESTIONNAIRE_REPORT_FILES=Array(6).fill(null);
let QUESTIONNAIRE_REPORT_PREVIEW_URLS=Array(6).fill('');

/* ── Relatório padrão (fixo) ────────────────────────────────────────
   Modelo semanal de acompanhamento. Fica agrupado em seções para o aluno
   preencher; ao salvar, transforma-se em um array plano de perguntas (compatível com
   o restante do fluxo) + um mapa `sectionAt` indicando em qual índice
   cada seção começa, usado só para exibir os títulos ao responder/ver. */
const DEFAULT_QUESTIONNAIRE_SECTIONS=[
  {title:'1. Identificação', questions:[
    'Nome Completo:',
    'Data do envio do relatório:',
    'Semana de acompanhamento (ex: Semana 2):'
  ]},
  {title:'2. Adesão ao planejamento', questions:[
    'Seguiu a dieta como prescrito?',
    'Fez refeições fora da margem prescrita nas refeições livres? Se sim, descreva o que e quantidades:',
    'Quantos litros de água em média ingeriu?'
  ]},
  {title:'3. Treinos e Cardios', questions:[
    'Realizou todas as sessões de treino durante a semana? Se não, por quê?',
    'Realizou o tempo prescrito de cardio (ou lutas, esportes no geral, atividades, etc) semanal? Se não, por quê?',
    'Avalie seu desempenho no treino de 1 a 10:',
    'Avalie a sua recuperação de um treino para outro de 1 a 10 (Dor tardia não necessariamente significa falta de recuperação):',
    'Sentiu alguma dor, desconforto ou lesão durante este período (independente da causa)?'
  ]},
  {title:'4. Peso', questions:[
    'Peso atual (em jejum, ao acordar):',
    'Peso anterior (último relatório ou feedback):'
  ]},
  {title:'5. Saúde, bem-estar e qualidade de vida/rotina', questions:[
    'Avalie seu sono de 1 a 10 (descreva se tiver tido insônia, dormido menos de 7-8 horas, sentido o sono leve ou acordado durante a madrugada):',
    'Como está a rotina (estresse, cansaço geral etc)?',
    'Nível de motivação atual?',
    'Algum comentário que tenha surgido por conta desta semana?'
  ]},
  {title:'6. Progresso visual', questions:[
    'Há alguma observação sobre seu progresso visual nesta semana? Descreva mesmo que não tenha percebido mudanças:'
  ]}
];
function buildDefaultQuestionnaire(){
  const questions=[],sectionAt={};
  DEFAULT_QUESTIONNAIRE_SECTIONS.forEach(sec=>{
    sectionAt[questions.length]=sec.title;
    sec.questions.forEach(q=>questions.push(q));
  });
  return {questions,sectionAt};
}
async function sendDefaultQuestionnaire(){
  if(!VIEW_STUDENT)return;
  const targetUid=VIEW_STUDENT.uid;
  const targetName=VIEW_STUDENT.name||'Aluno';
  const trainerUid=CURRENT_USER?.uid;
  showConfirm('Relatório semanal padrão','Enviar o relatório semanal padrão para '+targetName+'? Todas as perguntas e seis fotos serão obrigatórias.',async()=>{
    if(!beginAction('send-default-questionnaire'))return;
    const {questions,sectionAt}=buildDefaultQuestionnaire();
    try{
      if(!trainerUid||CURRENT_USER?.uid!==trainerUid||CURRENT_USER?.role!=='trainer')throw new Error('A sessão do treinador mudou. Entre novamente.');
      const draftKey='questionnaire-default-'+targetUid;
      const questionnaireId=idempotentDraftId(draftKey,'questionnaires');
      await cloudWrite(db.collection('questionnaires').doc(questionnaireId).set({studentId:targetUid,trainerId:trainerUid,questions,sectionAt,answers:null,answered:false,requiresPhotos:true,requiredPhotoCount:6,allQuestionsRequired:true,reportType:'standard',createdAt:firebase.firestore.FieldValue.serverTimestamp()}),'enviar o relatório');
      clearIdempotentDraft(draftKey);
      showToast('✓ Relatório enviado para '+targetName);
      if(VIEW_STUDENT?.uid===targetUid)await openTsQuestionnaires();
    }catch(e){ alert('Erro ao enviar relatório: '+cloudWriteError(e,'enviar o relatório')); }
    finally{endAction('send-default-questionnaire');}
  });
}

function addQuestionRow(text){
  const current=document.querySelectorAll('#quest-questions-editor .quest-q-row').length;
  if(current>=30){showToast('Limite de 30 perguntas por relatório.',true);return;}
  QUEST_Q_COUNT++;
  const el=document.getElementById('quest-questions-editor');
  const d=document.createElement('div');
  d.className='quest-q-row';
  d.innerHTML=`<input class="form-input" maxlength="1000" placeholder="Pergunta ${QUEST_Q_COUNT}" value="${esc(text||'')}"><button class="btn-rm-set" onclick="this.closest('.quest-q-row').remove()">✕</button>`;
  el.appendChild(d);
}
function openSendQuestionnaireModal(){
  if(!VIEW_STUDENT)return;
  QUESTIONNAIRE_TARGET_UID=VIEW_STUDENT.uid;
  QUESTIONNAIRE_TARGET_NAME=VIEW_STUDENT.name||'Aluno';
  document.getElementById('quest-questions-editor').innerHTML='';
  QUEST_Q_COUNT=0;
  addQuestionRow();addQuestionRow();
  openModal('modal-send-quest');
}
async function sendQuestionnaire(){
  const targetUid=QUESTIONNAIRE_TARGET_UID;
  const targetName=QUESTIONNAIRE_TARGET_NAME||'Aluno';
  const trainerUid=CURRENT_USER?.uid;
  if(!targetUid)return;
  const inputs=[...document.querySelectorAll('#quest-questions-editor input')];
  const questions=inputs.map(i=>i.value.trim()).filter(Boolean);
  if(!questions.length){alert('Adicione ao menos uma pergunta.');return;}
  if(!beginAction('send-questionnaire','modal-send-quest'))return;
  try{
    if(!trainerUid||CURRENT_USER?.role!=='trainer')throw new Error('A sessão do treinador mudou. Entre novamente.');
    const draftKey='questionnaire-custom-'+targetUid;
    const questionnaireId=idempotentDraftId(draftKey,'questionnaires');
    await cloudWrite(db.collection('questionnaires').doc(questionnaireId).set({studentId:targetUid,trainerId:trainerUid,questions,answers:null,answered:false,requiresPhotos:true,requiredPhotoCount:6,allQuestionsRequired:true,reportType:'custom',createdAt:firebase.firestore.FieldValue.serverTimestamp()}),'enviar o relatório');
    clearIdempotentDraft(draftKey);
    closeModal('modal-send-quest');
    QUESTIONNAIRE_TARGET_UID=null;QUESTIONNAIRE_TARGET_NAME='';
    showToast('✓ Relatório enviado para '+targetName);
    if(VIEW_STUDENT?.uid===targetUid)await openTsQuestionnaires();
  }catch(e){ alert('Erro ao enviar relatório: '+cloudWriteError(e,'enviar o relatório')); }
  finally{endAction('send-questionnaire','modal-send-quest');}
}
function renderQuestList(cache,listId,emptyId,fromTrainer){
  const list=document.getElementById(listId);
  const empty=document.getElementById(emptyId);
  if(!cache.length){list.innerHTML='';empty.style.display='block';return;}
  empty.style.display='none';
  list.innerHTML=cache.map(q=>{
    const d=q.createdAt?.seconds?new Date(q.createdAt.seconds*1000).toLocaleDateString('pt-BR'):'—';
    const tap=q.answered?`viewQuestionnaire('${esc(q.id)}',${fromTrainer})`:(fromTrainer?'':`openAnswerQuestionnaire('${esc(q.id)}')`);
    const photoCount=Array.isArray(q.photoIds)?q.photoIds.length:0;
    const photoLabel=q.answered?(photoCount===6?'6 fotos':photoCount?photoCount+' fotos':'histórico sem fotos'):'6 fotos obrigatórias';
    return`<div class="quest-card" onclick="${tap}">
      <div class="quest-card-top"><span class="quest-card-date">${d}</span><span class="quest-status ${q.answered?'answered':'pending'}">${q.answered?'Respondido':'Aguardando'}</span></div>
      <div class="quest-card-preview">${q.questions.length} ${q.questions.length===1?'pergunta':'perguntas'} · ${photoLabel}</div>
    </div>`;
  }).join('');
}
async function openTsQuestionnaires(){
  if(!VIEW_STUDENT)return;
  const navigation=beginAsyncNavigation(),studentUid=VIEW_STUDENT.uid;
  let questionnaires=[];
  try{
    const snap=await cloudGet(db.collection('questionnaires').where('studentId','==',studentUid),'relatórios');
    questionnaires=snap.docs.map(d=>({...d.data(),id:d.id}));
    questionnaires.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  }catch(e){questionnaires=[];}
  if(!isNavigationCurrent(navigation)||VIEW_STUDENT?.uid!==studentUid)return;
  TS_QUEST_CACHE=questionnaires;
  renderQuestList(TS_QUEST_CACHE,'ts-quest-list','ts-quest-empty',true);
  showScreen('screen-ts-quest',navigation);
}
async function checkQuestionnaires(){
  if(!CURRENT_USER||CURRENT_USER.role==='trainer')return;
  const studentUid=CURRENT_USER.uid;
  try{
    const snap=await cloudGet(db.collection('questionnaires').where('studentId','==',studentUid),'relatórios pendentes');
    let rows=snap.docs.map(doc=>({...doc.data(),id:doc.id}));
    if(rows.some(report=>report.reportType==='monthly')){await ensureReportCycleRuntime();rows=await window.TeamBullsMonthlyReports.pending(rows,studentUid);}
    const pending=rows.filter(questionnaireIsPending);
    if(CURRENT_USER?.uid!==studentUid)return;
    const banner=document.getElementById('quest-banner');if(!banner)return;
    banner.dataset.qid=pending[0]?.id||'';banner.style.display=pending.length?'block':'none';
  }catch(error){console.warn('[Team Bulls] pendências não confirmadas',error?.code||error?.message);}
}
function clearQuestionnaireReportPreviews(){
  QUESTIONNAIRE_REPORT_PREVIEW_URLS.forEach(url=>{if(url)try{URL.revokeObjectURL(url);}catch(error){}});
  QUESTIONNAIRE_REPORT_PREVIEW_URLS=Array(6).fill('');
}
function resetQuestionnaireReportPhotos(){
  clearQuestionnaireReportPreviews();
  QUESTIONNAIRE_REPORT_FILES=Array(6).fill(null);
  for(let index=0;index<6;index++){
    const input=document.getElementById('report-photo-'+index),preview=document.getElementById('report-photo-preview-'+index);
    if(input)input.value='';
    if(preview){preview.removeAttribute('src');preview.classList.remove('active');}
  }
}
function previewQuestionnaireReportPhoto(index,event){
  const file=event.target.files?.[0]||null;if(!file)return;
  if(!String(file.type||'').startsWith('image/')){alert('Escolha uma imagem válida.');event.target.value='';return;}
  if(QUESTIONNAIRE_REPORT_PREVIEW_URLS[index])try{URL.revokeObjectURL(QUESTIONNAIRE_REPORT_PREVIEW_URLS[index]);}catch(error){}
  QUESTIONNAIRE_REPORT_FILES[index]=file;
  const preview=document.getElementById('report-photo-preview-'+index),url=URL.createObjectURL(file);QUESTIONNAIRE_REPORT_PREVIEW_URLS[index]=url;
  if(preview){preview.src=url;preview.classList.add('active');}
}
function cancelQuestionnaireReport(){
  resetQuestionnaireReportPhotos();CURRENT_ANSWER_REPORT=null;CUR_ANSWER_QUEST_ID=null;closeModal('modal-answer-quest');
}
async function openAnswerQuestionnaire(qid){
  if(!qid)return;
  try{
    const doc=await cloudGet(db.collection('questionnaires').doc(qid),'relatório');
    if(!doc.exists)return;
    const q={...doc.data(),id:doc.id};
    if(q.answered){showToast('Este relatório já foi enviado.',true);return;}
    CUR_ANSWER_QUEST_ID=qid;CURRENT_ANSWER_REPORT=q;
    document.getElementById('quest-answer-form').innerHTML=q.questions.map((qt,i)=>{
      const heading=q.sectionAt&&q.sectionAt[i]?`<div class="quest-section-title">${esc(q.sectionAt[i])}</div>`:'';
      return`${heading}<div class="quest-answer-item"><label>${i+1}. ${esc(qt)} <span aria-hidden="true">*</span></label><textarea class="form-input" data-qi="${i}" required aria-required="true" rows="2" maxlength="5000" style="resize:vertical;min-height:50px"></textarea></div>`;
    }).join('');
    resetQuestionnaireReportPhotos();
    openModal('modal-answer-quest');
  }catch(e){ alert('Erro ao carregar o relatório.'); }
}
async function submitQuestionnaireAnswers(){
  const reportId=CUR_ANSWER_QUEST_ID,report=CURRENT_ANSWER_REPORT,studentUid=CURRENT_USER?.uid;
  if(!reportId||!report||!studentUid||CURRENT_USER?.role!=='student')return;
  const areas=[...document.querySelectorAll('#quest-answer-form textarea')];
  const answers=areas.map(area=>area.value.normalize('NFKC').trim());
  const missingIndex=answers.findIndex(answer=>!answer);
  if(missingIndex>=0){alert('Responda todas as perguntas antes de enviar o relatório.');areas[missingIndex]?.focus();areas[missingIndex]?.scrollIntoView({behavior:'smooth',block:'center'});return;}
  if(answers.length!==report.questions.length){alert('O relatório foi alterado. Feche e abra novamente antes de responder.');return;}
  if(QUESTIONNAIRE_REPORT_FILES.some(file=>!(file instanceof File))){alert('Envie obrigatoriamente as seis fotos: frente, costas, lado direito, lado esquerdo, frente contraída e costas contraída.');return;}
  if(!beginAction('answer-questionnaire','modal-answer-quest'))return;
  const photoIds=[],photoWrites=[],createdPaths=[];
  try{
    const reportRef=db.collection('questionnaires').doc(reportId),fresh=await cloudGet(reportRef,'verificar relatório');
    if(!fresh.exists)throw new Error('Este relatório não está mais disponível.');
    if(fresh.data().answered)throw new Error('Este relatório já foi enviado. Atualize a página para ver o histórico.');
    for(let index=0;index<6;index++){
      showToast('Preparando foto '+(index+1)+' de 6...');
      const photoId=(reportId+'-r'+(index+1)).slice(0,190),photoRef=db.collection('progressPhotos').doc(photoId);photoIds.push(photoId);
      const variants=await buildProgressPhotoVariants(QUESTIONNAIRE_REPORT_FILES[index]),photoPath=await uploadCloudPhoto('progressPhotos',studentUid,photoId,variants.full);if(photoPath)createdPaths.push(photoPath);
      const thumbPath=photoPath?await uploadCloudPhoto('progressPhotoThumbs',studentUid,photoId,variants.thumb):'';if(thumbPath)createdPaths.push(thumbPath);
      const payload={userId:studentUid,date:today(),reportId,questionnaireId:reportId,pose:CHECKIN_POSES[index],createdAt:firebase.firestore.FieldValue.serverTimestamp()};
      if(photoPath){payload.photoPath=photoPath;if(thumbPath)payload.thumbPath=thumbPath;}else payload.dataUrl=variants.full;
      photoWrites.push({ref:photoRef,payload});
    }
    const batch=db.batch();photoWrites.forEach(write=>batch.set(write.ref,write.payload));batch.update(reportRef,{answers,answered:true,answeredAt:firebase.firestore.FieldValue.serverTimestamp(),photoIds});
    try{await cloudWrite(batch.commit(),'enviar relatório e seis fotos');}
    catch(error){
      const verified=await cloudGet(reportRef,'confirmar relatório').catch(()=>null);
      if(!verified?.exists||!verified.data().answered){await Promise.allSettled(createdPaths.map(path=>deleteCloudPhoto(path)));throw error;}
    }
    resetQuestionnaireReportPhotos();CURRENT_ANSWER_REPORT=null;CUR_ANSWER_QUEST_ID=null;
    closeModal('modal-answer-quest');
    document.getElementById('quest-banner').style.display='none';
    showToast('✓ Relatório enviado com todas as respostas e 6 fotos');
    await checkQuestionnaires();
  }catch(e){await Promise.allSettled(createdPaths.map(path=>deleteCloudPhoto(path)));alert('Erro ao enviar relatório: '+cloudWriteError(e,'enviar o relatório'));}
  finally{endAction('answer-questionnaire','modal-answer-quest');}
}
async function openMyQuestionnaires(){
  if(MODE==='local'){ alert('Relatórios exigem login (recurso do modo nuvem).'); return; }
  const navigation=beginAsyncNavigation(),studentUid=CURRENT_USER.uid;
  let questionnaires=[],loadError=null;
  try{
    const snap=await cloudGet(db.collection('questionnaires').where('studentId','==',studentUid),'relatórios');
    questionnaires=snap.docs.map(d=>({...d.data(),id:d.id}));
    if(questionnaires.some(report=>report.reportType==='monthly')){await ensureReportCycleRuntime();await window.TeamBullsMonthlyReports.loadSchedule(studentUid);}
    questionnaires.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
  }catch(e){loadError=e;}
  if(!isNavigationCurrent(navigation)||CURRENT_USER?.uid!==studentUid)return;
  if(loadError){
    document.getElementById('my-quest-list').innerHTML='<div class="no-data-inline">Não foi possível consultar seus relatórios. <button class="btn-ghost" onclick="openMyQuestionnaires()">TENTAR NOVAMENTE</button></div>';
    document.getElementById('my-quest-empty').style.display='none';showScreen('screen-my-quest',navigation);return;
  }
  MY_QUEST_CACHE=questionnaires;
  renderQuestList(MY_QUEST_CACHE,'my-quest-list','my-quest-empty',false);
  showScreen('screen-my-quest',navigation);
}
async function viewQuestionnaire(qid,fromTrainer){
  const cache=fromTrainer?TS_QUEST_CACHE:MY_QUEST_CACHE;
  const q=cache.find(x=>x.id===qid);if(!q||!q.answered)return;
  const photoIds=Array.isArray(q.photoIds)?q.photoIds.slice(0,6):[];
  const photoBlock=photoIds.length?`<div class="section-header"><span class="section-label">Fotos do relatório</span></div><div class="checkin-view-photo-grid" id="questionnaire-view-photo-grid">Carregando as ${photoIds.length} fotos...</div>`:'<div class="no-data-inline">Relatório histórico anterior à obrigatoriedade de seis fotos.</div>';
  document.getElementById('quest-view-body').innerHTML=photoBlock+q.questions.map((qt,i)=>{
    const heading=q.sectionAt&&q.sectionAt[i]?`<div class="quest-section-title">${esc(q.sectionAt[i])}</div>`:'';
    return`${heading}<div class="quest-view-qa"><div class="q">${i+1}. ${esc(qt)}</div><div class="a">${esc(q.answers?.[i]||'(sem resposta)')}</div></div>`;
  }).join('');
  openModal('modal-view-quest');
  if(!photoIds.length)return;
  const photos=await Promise.all(photoIds.map(async photoId=>{try{const doc=await cloudGet(db.collection('progressPhotos').doc(photoId),'foto do relatório');if(!doc.exists)return null;const record={...doc.data(),id:doc.id};const src=await resolvePhotoSource(record,{full:CURRENT_USER?.role==='trainer'});return src?{...record,src}:null;}catch(error){return null;}}));
  const grid=document.getElementById('questionnaire-view-photo-grid');if(!grid)return;
  grid.innerHTML=photos.filter(Boolean).map((photo,index)=>`<figure><img src="${esc(photo.src)}" alt="${esc(photo.pose||CHECKIN_POSES[index]||'Foto')}"><figcaption>${esc(photo.pose||CHECKIN_POSES[index]||'Foto')}</figcaption></figure>`).join('')||'<div class="no-data-inline">As fotos não estão disponíveis neste momento.</div>';
}


/* ══════════════════════════════════════════════════
   SESSIONS RENDER
══════════════════════════════════════════════════ */
function buildSessions(e,elId,readonly,homeWid,ws){
  const el=document.getElementById(elId);
  const sessions=getSharedSessions(e,ws);
  if(!sessions.length){el.innerHTML='<div class="no-data-inline">Nenhuma sessão registrada.</div>';return;}
  const sorted=[...sessions].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  el.innerHTML=sorted.map(sess=>{
    const sets=Array.isArray(sess.sets)?sess.sets:[];
    const vol=sets.reduce((a,s)=>a+(Number(s.weight)||0)*(Number(s.reps)||0),0);
    const rows=sets.map((s,i)=>{
      const target=normalizePrescriptionSet(s);
      const inRange=target&&Number(s.reps)>=target.targetMin&&Number(s.reps)<=target.targetMax;
      const below=target&&Number(s.reps)<target.targetMin;
      return`<tr><td><span class="set-idx">${i+1}</span></td><td><span class="set-chip">${target?esc(prescribedRangeLabel(target)):'—'}</span></td><td><span class="ger-pill">${target?formatGerLevel(target.ger)+' '+renderGerMeter(target.ger):'—'}</span></td><td><span class="set-chip">${Number(s.weight)||0} kg</span></td><td><span class="set-chip ${inRange?'set-performance-ok':below?'set-performance-low':''}">${Number(s.reps)||0}×</span></td></tr>`;
    }).join('');
    // Séries de treino/exercício já excluído não têm "dono" para resolver edição/exclusão —
    // ficam visíveis (histórico preservado) mas só leitura.
    const del=(readonly||sess._archived)?'':
      `<button class="btn-icon ghost" style="width:28px;height:28px;font-size:13px;margin-right:2px"
        onclick="openEditSession(${jsArg(sess.id)})">✏️</button>
       <button class="btn-icon ghost" style="width:28px;height:28px;font-size:13px"
        onclick="deleteSession(${jsArg(sess.id)})">🗑</button>`;
    const srcBadge=sess._archived
      ?`<span style="font-size:10px;color:var(--text-muted);background:rgba(255,255,255,.06);border-radius:4px;padding:2px 7px;margin-left:5px;font-family:'DM Mono',monospace;">treino anterior</span>`
      :(homeWid&&sess._wid&&sess._wid!==homeWid)
        ?`<span style="font-size:10px;color:${esc(sess._wColor)};background:rgba(0,0,0,.2);border-radius:4px;padding:2px 7px;margin-left:5px;font-family:'DM Mono',monospace;">${esc(sess._wName)}</span>`
        :'';
    const weekBadge=sess.week?`<span class="session-week-badge">Sem. ${esc(sess.week)}</span>`:'';
    const variantBadge=sess.performedExerciseName&&normalizedName(sess.performedExerciseName)!==normalizedName(e.name)?`<span class="session-week-badge">↺ ${esc(sess.performedExerciseName)}</span>`:'';
    const modeBadge=sess.performedTechniqueMode?`<span class="session-week-badge">${sess.performedTechniqueMode==='myo'?'MP':'NORMAL'}</span>`:'';
    const noteBlock=sess.note?`<div class="session-note"><b>📝 Anotação:</b> ${esc(sess.note)}</div>`:'';
    return`<div class="session-block">
      <div class="session-header">
        <span class="session-date-badge">📅 ${fmt(sess.date)}</span>${weekBadge}${variantBadge}${modeBadge}${srcBadge}
        <div style="display:flex;align-items:center;gap:6px;margin-left:auto"><span class="session-vol">Vol: ${vol} kg</span>${del}</div>
      </div>
      <table class="sets-table"><thead><tr><th>#</th><th>Prescrito</th><th>GER</th><th>Carga</th><th>Feito</th></tr></thead><tbody>${rows}</tbody></table>
      ${noteBlock}
    </div>`;
  }).join('');
}

/* ══════════════════════════════════════════════════
   CHART
══════════════════════════════════════════════════ */
function buildChart(e,canvasId,mode,chartRef,ws){
  const cv=document.getElementById(canvasId);
  const empty=document.getElementById(canvasId==='progressChart'?'chart-empty-msg':'ts-chart-empty');
  const sessions=getSharedSessions(e,ws).filter(s=>Array.isArray(s.sets)&&s.sets.length);
  if(!sessions.length){cv.style.display='none';empty.style.display='block';return;}
  cv.style.display='block';empty.style.display='none';
  const labels=sessions.map(s=>fmt(s.date));
  const data=mode==='weight'?sessions.map(sessionMaxWeight):
    mode==='volume'?sessions.map(s=>s.sets.length):
    sessions.map(s=>Math.max(...s.sets.map(st=>Number(st.reps)||0)));
  const unit=mode==='weight'?'kg (máx)':mode==='volume'?'séries':(exerciseUsesResistedTime(e)?'seg (máx)':'reps (máx)');
  if(canvasId==='progressChart'){
    if(!miniChart||miniChart.cv!==cv)miniChart=cv.__teammsChart||(cv.__teammsChart=new MiniChart(cv));
    miniChart.render(labels,data,unit);
  }else{
    if(!tsMiniChart||tsMiniChart.cv!==cv)tsMiniChart=cv.__teammsChart||(cv.__teammsChart=new MiniChart(cv));
    tsMiniChart.render(labels,data,unit);
  }
}

function switchChart(mode){
  CHART_MODE=mode;
  ['weight','reps','volume'].forEach(m=>document.getElementById('btn-'+m).classList.toggle('active',m===mode));
  const e=getE(CUR_WORKOUT,CUR_EX);if(e)buildChart(e,'progressChart',mode,null);
}
function switchTsChart(mode){
  TS_CHART_MODE=mode;
  ['weight','reps','volume'].forEach(m=>document.getElementById('ts-btn-'+m).classList.toggle('active',m===mode));
  if(VIEW_STUDENT_EXERCISE)buildChart(VIEW_STUDENT_EXERCISE,'tsProgressChart',mode,null,VIEW_STUDENT?.workouts);
}

/* ══════════════════════════════════════════════════
   CRUD — LOCAL
══════════════════════════════════════════════════ */
function lw(id){return LOCAL_DB.workouts.find(w=>w.id===id);}
function le(wid,eid){const w=lw(wid);return w?w.exercises.find(e=>e.id===eid):null;}

function deleteWorkout(id){
  if(MODE==='local'){
    const snapshot=JSON.stringify(LOCAL_DB);
    LOCAL_DB.workouts=normalizeWorkoutCollection(LOCAL_DB.workouts.filter(w=>w.id!==id));
    if(!localSave()){LOCAL_DB=normalizeLocalDb(JSON.parse(snapshot));return;}
    renderHome();
  } else {
    cloudDeleteWorkout(id);
  }
}

async function performDeleteSession(sid){
  const sessionId=String(sid||'');
  if(!sessionId){showToast('Registro inválido.',true);return false;}
  const owner=findSessionOwner(sessionId);
  if(MODE==='local'){
    if(!owner){showToast('Registro não encontrado.',true);return false;}
    const snapshot=JSON.stringify(LOCAL_DB);
    owner.exercise.sessions=owner.exercise.sessions.filter(s=>String(s.id)!==sessionId);
    if(!localSave()){LOCAL_DB=normalizeLocalDb(JSON.parse(snapshot));showToast('Não foi possível apagar o registro.',true);return false;}
    removeSessionFromHistory(sessionId);
    removeSessionFromArchive(LOCAL_OWNER_UID||INACTIVE_UID||CURRENT_USER?.uid,sessionId);
    EDIT_SESSION_ID=null;EDIT_SESSION_WID=null;EDIT_SESSION_EID=null;
    renderExercise();showToast('Registro excluído.');return true;
  }
  if(!CURRENT_USER||CURRENT_USER.role!=='student'){showToast('Somente o aluno pode excluir o próprio registro.',true);return false;}
  if(!beginAction('delete-session-'+sessionId))return false;
  try{
    await cloudWrite(db.collection('sessions').doc(sessionId).delete(),'excluir registro');
    if(owner)owner.exercise.sessions=owner.exercise.sessions.filter(s=>String(s.id)!==sessionId);
    removeSessionFromHistory(sessionId);
    removeSessionFromArchive(CURRENT_USER.uid,sessionId);
    EDIT_SESSION_ID=null;EDIT_SESSION_WID=null;EDIT_SESSION_EID=null;
    saveCloudBackup();
    renderExercise();showToast('Registro excluído.');return true;
  }catch(e){alert(firestoreWriteMessage(e,'registro'));return false;}
  finally{endAction('delete-session-'+sessionId);}
}
function deleteSession(sid){
  const sessionId=String(sid||'');
  if(!sessionId)return;
  showConfirm('Excluir registro','Apagar definitivamente as repetições, cargas e anotações desta sessão?',()=>performDeleteSession(sessionId));
}
function deleteEditedSession(){
  const sessionId=String(EDIT_SESSION_ID||'');
  if(!sessionId){showToast('Registro não encontrado.',true);return;}
  showConfirm('Excluir registro completo','Apagar definitivamente todas as repetições, cargas e anotações desta sessão?',async()=>{
    const deleted=await performDeleteSession(sessionId);
    if(deleted)closeModal('modal-edit-session');
    return deleted;
  });
}

function deleteCurrentExercise(){
  const e=getE(CUR_WORKOUT,CUR_EX);if(!e)return;
  const wid=CUR_WORKOUT,eid=CUR_EX,exerciseName=e.name;
  const msg=MODE==='local'
    ?'Excluir "'+exerciseName+'"? Todo o histórico será apagado.'
    :'Excluir "'+exerciseName+'"? O histórico de séries fica preservado e volta a aparecer se você recriar um exercício com o mesmo nome.';
  showConfirm('Excluir exercício',msg,async()=>{
    if(!beginAction('delete-exercise-'+eid))return;
    try{
      if(MODE==='local'){
        const w=lw(wid);if(!w)return;
        const snapshot=JSON.stringify(LOCAL_DB);
        w.exercises.forEach(item=>{if(String(item.supersetExerciseId||'')===String(eid)){item.supersetExerciseId='';item.techniqueIds=normalizeExerciseTechniqueIds(item.techniqueIds).filter(id=>id!=='ss');}});
        w.exercises=w.exercises.filter(x=>x.id!==eid);
        if(!localSave()){LOCAL_DB=normalizeLocalDb(JSON.parse(snapshot));return;}
      }else{
        // Não apaga as sessões — ficam preservadas em HISTORY_BY_NAME.
        await cloudWrite(db.collection('exercises').doc(eid).delete(),'excluir exercício');
        const w=getW(wid);if(w)w.exercises=w.exercises.filter(x=>x.id!==eid);
        saveCloudBackup();
      }
      if(CUR_WORKOUT===wid)CUR_EX=null;
      if(CUR_DAY)goDay();else goWorkout();
    }catch(error){alert('Erro ao excluir exercício: '+error.message);}
    finally{endAction('delete-exercise-'+eid);}
  });
}

/* ══════════════════════════════════════════════════
   CLOUD CRUD
══════════════════════════════════════════════════ */
async function cloudDeleteWorkout(id){
  if(!beginAction('delete-workout-'+id))return;
  // Não apaga as sessões — ficam preservadas em HISTORY_BY_NAME (ver loadCloudHome),
  // e voltam a aparecer se um exercício de mesmo nome for criado depois.
  try{
    const batch=db.batch();
    const exs=await cloudGet(db.collection('exercises').where('workoutId','==',id),'exercícios do treino');
    exs.docs.forEach(ex=>batch.delete(ex.ref));
    batch.delete(db.collection('workouts').doc(id));
    await cloudWrite(batch.commit(),'salvar alterações');
    CLOUD_WORKOUTS=CLOUD_WORKOUTS.filter(w=>w.id!==id);
    saveCloudBackup();
    renderHome();
  }catch(error){alert('Erro ao excluir treino: '+error.message);}
  finally{endAction('delete-workout-'+id);}
}

/* Treinador excluindo treino/exercício do plano de um aluno (VIEW_STUDENT) */
async function deleteTsWorkout(wid){
  if(!VIEW_STUDENT)return;
  const student={...VIEW_STUDENT};
  if(!beginAction('delete-ts-workout-'+wid))return;
  try{
    // Não apaga as sessões — ficam preservadas em HISTORY_BY_NAME e voltam a
    // aparecer se você recriar um exercício de mesmo nome, mesmo em outro treino.
    const before=normalizeWorkoutCollection(VIEW_STUDENT.workouts||[]),deleted=before.find(workout=>workout.id===wid),remaining=before.filter(workout=>workout.id!==wid);
    const nextActiveId=deleted?.isActive?String(remaining[0]?.id||''):activeWorkoutId(remaining);
    const batch=db.batch();
    const exs=await cloudGet(db.collection('exercises').where('workoutId','==',wid),'exercícios do treino');
    exs.docs.forEach(ex=>batch.delete(ex.ref));
    batch.delete(db.collection('workouts').doc(wid));
    remaining.forEach((workout,index)=>batch.update(db.collection('workouts').doc(workout.id),{order:index,isActive:String(workout.id)===nextActiveId}));
    await cloudWrite(batch.commit(),'salvar alterações');
    if(VIEW_STUDENT?.uid===student.uid)await renderTrainerStudent(student);
  }catch(e){
    alert('Erro ao excluir treino: '+e.message);
  }finally{endAction('delete-ts-workout-'+wid);}
}
async function deleteTsExercise(eid){
  if(!VIEW_STUDENT||!VIEW_STUDENT_WORKOUT)return;
  const student={...VIEW_STUDENT},wid=VIEW_STUDENT_WORKOUT.id,currentDay=VIEW_STUDENT_DAY,removed=VIEW_STUDENT_WORKOUT.exercises.find(exercise=>exercise.id===eid);
  if(!beginAction('delete-ts-exercise-'+eid))return;
  try{
    // Não apaga as sessões — ficam preservadas em HISTORY_BY_NAME (mesma lógica acima).
    const batch=db.batch();batch.delete(db.collection('exercises').doc(eid));
    VIEW_STUDENT_WORKOUT.exercises.filter(exercise=>String(exercise.supersetExerciseId||'')===String(eid)).forEach(exercise=>batch.update(db.collection('exercises').doc(exercise.id),{supersetExerciseId:'',techniqueIds:normalizeExerciseTechniqueIds(exercise.techniqueIds).filter(id=>id!=='ss')}));
    if(removed){exercisesForDay(VIEW_STUDENT_WORKOUT,removed.dayName).filter(exercise=>exercise.id!==eid).forEach((exercise,index)=>batch.update(db.collection('exercises').doc(exercise.id),{order:index}));}
    await cloudWrite(batch.commit(),'salvar alterações');
    if(VIEW_STUDENT?.uid!==student.uid)return;
    await renderTrainerStudent(student);
    const w=VIEW_STUDENT.workouts.find(x=>x.id===wid);
    if(!w){goTrainerStudent();return;}
    VIEW_STUDENT_WORKOUT=w;
    const day=getWorkoutDays(w).find(item=>normalizedName(item.name)===normalizedName(currentDay));
    if(day){VIEW_STUDENT_DAY=day.name;renderTsDay();}else{VIEW_STUDENT_DAY='';renderTsWorkout(w);showScreen('screen-ts-workout');}
  }catch(e){
    alert('Erro ao excluir exercício: '+e.message);
  }finally{endAction('delete-ts-exercise-'+eid);}
}

/* ══════════════════════════════════════════════════
   MODALS
══════════════════════════════════════════════════ */
function openModal(id){
  document.getElementById(id).classList.add('open');
  if(id==='modal-workout')setWorkoutSaveStatus('');
}
function closeModal(id){
  const modal=document.getElementById(id);if(!modal)return;
  if(id==='modal-catalog-video'){const body=document.getElementById('catalog-video-body');if(body)body.innerHTML='';}
  if(id==='modal-session')resetRestTimer();
  if(id==='modal-photo-view'){const img=document.getElementById('photo-view-img');if(img)img.removeAttribute('src');}
  modal.classList.remove('open');
}

// Workout
function setWorkoutSaveStatus(message,isError=false){
  const status=document.getElementById('workout-save-status');
  if(!status)return;
  status.textContent=message;
  status.style.color=isError?'#fca5a5':'';
}
async function saveWorkoutFromButton(){
  try{await saveWorkout();}
  catch(error){
    // Inclui erros nas camadas de proteção que envolvem saveWorkout.
    if(ACTION_LOCKS.has('save-workout'))endAction('save-workout','modal-workout');
    const message='Não foi possível salvar o treino: '+String(error?.message||error);
    setWorkoutSaveStatus(message,true);
    console.error('saveWorkout',error);
  }
}
function buildColorPicker(){
  document.getElementById('color-picker-row').innerHTML=PALETTE.map(c=>
    `<div class="color-swatch ${c===SEL_COLOR?'active':''}" style="background:${c}" data-color="${c}" onclick="pickColor('${c}')"></div>`
  ).join('');
}
function pickColor(c){SEL_COLOR=c;document.querySelectorAll('.color-swatch').forEach(d=>d.classList.toggle('active',d.dataset.color===c));}
function openAddWorkoutModal(){MODAL_TARGET='self';EDIT_W=null;WORKOUT_CREATE_ID=null;SEL_COLOR=PALETTE[0];document.getElementById('modal-workout-title').textContent='Novo protocolo';document.getElementById('input-workout-name').value='';buildColorPicker();openModal('modal-workout');focusEditorField('input-workout-name',300);}
function openEditWorkout(id){const w=getW(id);if(!w)return;MODAL_TARGET='self';EDIT_W=id;WORKOUT_CREATE_ID=null;SEL_COLOR=w.color;document.getElementById('modal-workout-title').textContent='Editar protocolo';document.getElementById('input-workout-name').value=w.name;buildColorPicker();openModal('modal-workout');}

// Versões usadas pelo treinador para montar o treino do aluno (VIEW_STUDENT)
function openAddWorkoutModalTs(){if(!VIEW_STUDENT)return;MODAL_TARGET='student';EDIT_W=null;WORKOUT_CREATE_ID=null;SEL_COLOR=PALETTE[0];document.getElementById('modal-workout-title').textContent='Novo protocolo — '+VIEW_STUDENT.name;document.getElementById('input-workout-name').value='';buildColorPicker();openModal('modal-workout');focusEditorField('input-workout-name',300);}
function openEditWorkoutTs(id){if(!VIEW_STUDENT)return;const w=VIEW_STUDENT.workouts.find(x=>x.id===id);if(!w)return;MODAL_TARGET='student';EDIT_W=id;WORKOUT_CREATE_ID=null;SEL_COLOR=w.color;document.getElementById('modal-workout-title').textContent='Editar protocolo — '+VIEW_STUDENT.name;document.getElementById('input-workout-name').value=w.name;buildColorPicker();openModal('modal-workout');}

async function saveWorkout(){
  const name=document.getElementById('input-workout-name').value.trim();
  const startDate=document.getElementById('input-workout-start-date')?.value||today();
  const updateDate=document.getElementById('input-workout-update-date')?.value||addDaysIso(startDate,28);
  if(!name){setWorkoutSaveStatus('Digite o nome do treino.',true);return;}
  if(!validIsoDate(startDate)||!validIsoDate(updateDate)||updateDate<startDate){setWorkoutSaveStatus('Confira as datas do ciclo: a atualização deve ser no início ou depois.',true);return;}
  const editingWorkoutId=EDIT_W,modalTarget=MODAL_TARGET,studentUid=modalTarget==='student'?VIEW_STUDENT?.uid:null,color=SEL_COLOR;
  const targetWorkouts=MODAL_TARGET==='student'?(VIEW_STUDENT?.workouts||[]):getWorkouts();
  if(targetWorkouts.some(w=>w.id!==EDIT_W&&normalizedName(w.name)===normalizedName(name))){
    setWorkoutSaveStatus('Já existe um treino com esse nome.',true);
    return;
  }
  if(!beginAction('save-workout','modal-workout')){setWorkoutSaveStatus('Aguarde o salvamento anterior terminar.',true);return;}
  setWorkoutSaveStatus('Salvando o treino…');
  try{
    if(MODE==='cloud'){
      const targetUid=MODAL_TARGET==='student'?VIEW_STUDENT?.uid:CURRENT_USER?.uid;
      const serverWorkouts=await cloudGet(db.collection('workouts').where('userId','==',targetUid),'treinos existentes');
      if(MODAL_TARGET!==modalTarget||EDIT_W!==editingWorkoutId||(modalTarget==='student'&&VIEW_STUDENT?.uid!==studentUid))throw new Error('O aluno ou o treino aberto mudou. Abra o treino novamente e tente salvar.');
      if(editingWorkoutId&&!serverWorkouts.docs.some(doc=>doc.id===editingWorkoutId))throw new Error('Este treino não pertence ao aluno aberto ou não está mais disponível. Atualize a lista.');
      if(serverWorkouts.docs.some(d=>d.id!==EDIT_W&&normalizedName(d.data().name)===normalizedName(name))){
        setWorkoutSaveStatus('Esse nome já foi salvo em outro treino. Atualize a lista antes de tentar novamente.',true);
        if(MODAL_TARGET==='student')await renderTrainerStudent(VIEW_STUDENT);else await loadCloudHome();
        return;
      }
    }
    // Treinador montando o treino do aluno
    if(MODAL_TARGET==='student'){
      if(!VIEW_STUDENT)return;
      if(EDIT_W){
        await cloudWrite(db.collection('workouts').doc(EDIT_W).update({name,color,startDate,updateDate}),'editar treino');
        if(VIEW_STUDENT?.uid!==studentUid||EDIT_W!==editingWorkoutId)return;
        const edited=VIEW_STUDENT.workouts.find(workout=>workout.id===editingWorkoutId);
        if(edited)Object.assign(edited,{name,color,startDate,updateDate});
        if(VIEW_STUDENT_WORKOUT?.id===editingWorkoutId)Object.assign(VIEW_STUDENT_WORKOUT,{name,color,startDate,updateDate});
      }else{
        const docId=WORKOUT_CREATE_ID||(WORKOUT_CREATE_ID=stableEntityId('w',VIEW_STUDENT.uid,normalizedName(name)));
        const existing=normalizeWorkoutCollection(VIEW_STUDENT.workouts||[]),batch=db.batch();
        existing.forEach((workout,index)=>batch.update(db.collection('workouts').doc(workout.id),{order:index+1,isActive:false}));
        batch.set(db.collection('workouts').doc(docId),{userId:VIEW_STUDENT.uid,name,color:SEL_COLOR,startDate,updateDate,days:[],order:0,isActive:true,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
        await cloudWrite(batch.commit(),'salvar alterações');
      }
      WORKOUT_CREATE_ID=null;
      if(editingWorkoutId){
        const card=[...document.querySelectorAll('#ts-workout-list .workout-card')].find(item=>item.dataset.workoutId===editingWorkoutId);
        const title=card?.querySelector('.workout-card-name');if(title)title.textContent=name;
        if(card)card.style.setProperty('--wcard-color',color);
      }
      closeModal('modal-workout');
      showToast('✓ Treino salvo');
      await renderTrainerStudent(VIEW_STUDENT);
      // A leitura de retorno pode vir do cache durante uma falha temporária.
      // Preserve na tela a alteração já confirmada pela escrita no servidor.
      if(editingWorkoutId&&VIEW_STUDENT?.uid===studentUid){
        const refreshed=VIEW_STUDENT.workouts.find(workout=>workout.id===editingWorkoutId);
        if(refreshed)Object.assign(refreshed,{name,color,startDate,updateDate});
        const card=[...document.querySelectorAll('#ts-workout-list .workout-card')].find(item=>item.dataset.workoutId===editingWorkoutId);
        const title=card?.querySelector('.workout-card-name');if(title)title.textContent=name;
        if(card)card.style.setProperty('--wcard-color',color);
      }
      return;
    }
    const __localSnapshot=JSON.stringify(LOCAL_DB);
      if(MODE==='local'){
      if(EDIT_W){const w=lw(EDIT_W);if(w){w.name=name;w.color=SEL_COLOR;w.startDate=startDate;w.updateDate=updateDate;}}
      else{
        const docId=WORKOUT_CREATE_ID||(WORKOUT_CREATE_ID=uid());
        LOCAL_DB.workouts=normalizeWorkoutCollection(LOCAL_DB.workouts).map((workout,index)=>({...workout,order:index+1,isActive:false}));
        if(!LOCAL_DB.workouts.some(w=>w.id===docId))LOCAL_DB.workouts.unshift({id:docId,name,color:SEL_COLOR,startDate,updateDate,days:[],order:0,isActive:true,exercises:[]});
      }
      WORKOUT_CREATE_ID=null;
      if(!localSave()){LOCAL_DB=normalizeLocalDb(JSON.parse(__localSnapshot));throw new Error('Falha ao gravar no armazenamento local.');}showToast('✓ Treino salvo offline');closeModal('modal-workout');renderHome();
    }else{
      if(EDIT_W){
        await cloudWrite(db.collection('workouts').doc(EDIT_W).update({name,color:SEL_COLOR,startDate,updateDate}),'editar treino');
        const w=getW(EDIT_W);if(w){w.name=name;w.color=SEL_COLOR;w.startDate=startDate;w.updateDate=updateDate;}
      }else{
        const docId=WORKOUT_CREATE_ID||(WORKOUT_CREATE_ID=stableEntityId('w',CURRENT_USER.uid,normalizedName(name)));
        const existing=normalizeWorkoutCollection(CLOUD_WORKOUTS),batch=db.batch();
        existing.forEach((workout,index)=>batch.update(db.collection('workouts').doc(workout.id),{order:index+1,isActive:false}));
        batch.set(db.collection('workouts').doc(docId),{userId:CURRENT_USER.uid,name,color:SEL_COLOR,startDate,updateDate,days:[],order:0,isActive:true,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
        await cloudWrite(batch.commit(),'salvar alterações');
        CLOUD_WORKOUTS=[{id:docId,userId:CURRENT_USER.uid,name,color:SEL_COLOR,startDate,updateDate,days:[],order:0,isActive:true,exercises:[]},...existing.map((workout,index)=>({...workout,order:index+1,isActive:false}))];
      }
      WORKOUT_CREATE_ID=null;
      saveCloudBackup();
      closeModal('modal-workout');renderHome();
    }
  }catch(e){
    setWorkoutSaveStatus('Erro ao salvar treino: '+(e.code?e.code+' — ':'')+e.message,true);
    console.error(e);
  }finally{
    endAction('save-workout','modal-workout');
  }
}


// Day folders — hierarchy: protocol -> day -> exercises
function workoutForDayTarget(target){return target==='student'?VIEW_STUDENT_WORKOUT:getW(CUR_WORKOUT);}
function openAddDayModal(target='self'){
  const workout=workoutForDayTarget(target);if(!workout){showToast('Abra um protocolo primeiro.',true);return;}
  DAY_MODAL_TARGET=target;EDIT_DAY_NAME='';document.getElementById('modal-day-title').textContent='Novo dia — '+workout.name;document.getElementById('input-day-name').value='';openModal('modal-day');focusEditorField('input-day-name',180);
}
function openEditDayModal(dayName,target='self'){
  const workout=workoutForDayTarget(target),day=getWorkoutDays(workout).find(item=>normalizedName(item.name)===normalizedName(dayName));if(!workout||!day)return;
  DAY_MODAL_TARGET=target;EDIT_DAY_NAME=day.name;document.getElementById('modal-day-title').textContent='Renomear dia — '+workout.name;document.getElementById('input-day-name').value=day.name;openModal('modal-day');focusEditorField('input-day-name',180);
}
function dayListAfterRename(workout,oldName,newName){
  const days=getWorkoutDays(workout).map(day=>normalizedName(day.name)===normalizedName(oldName)?{...day,id:dayIdFromName(newName),name:newName}:day);
  if(!oldName)days.push({id:dayIdFromName(newName),name:newName,order:days.length});
  return normalizeWorkoutDays(days,[]);
}
async function saveDayFolder(){
  const workout=workoutForDayTarget(DAY_MODAL_TARGET),name=safeDayName(document.getElementById('input-day-name').value);if(!workout)return;
  if(!document.getElementById('input-day-name').value.trim()){alert('Digite o nome do dia de treino.');return;}
  const duplicate=getWorkoutDays(workout).some(day=>normalizedName(day.name)===normalizedName(name)&&normalizedName(day.name)!==normalizedName(EDIT_DAY_NAME));if(duplicate){alert('Já existe uma pasta de dia com esse nome.');return;}
  if(!beginAction('save-day','modal-day'))return;
  const oldName=EDIT_DAY_NAME,newDays=dayListAfterRename(workout,oldName,name);
  try{
    if(DAY_MODAL_TARGET==='student'){
      if(CURRENT_USER?.role!=='trainer'||!VIEW_STUDENT)return;
      const batch=db.batch();batch.update(db.collection('workouts').doc(workout.id),{days:newDays});
      if(oldName)for(const exercise of exercisesForDay(workout,oldName))batch.update(db.collection('exercises').doc(exercise.id),{dayName:name});
      await cloudWrite(batch.commit(),'salvar alterações');workout.days=newDays;if(oldName)for(const exercise of exercisesForDay(workout,oldName))exercise.dayName=name;VIEW_STUDENT_DAY=name;
      closeModal('modal-day');renderTsWorkout(workout);showToast(oldName?'✓ Pasta renomeada':'✓ Dia criado');
    }else{
      if(!canSelfManagePlan())throw new Error('Este plano é administrado pelo treinador.');
      const snapshot=JSON.stringify(LOCAL_DB);workout.days=newDays;if(oldName)for(const exercise of exercisesForDay(workout,oldName))exercise.dayName=name;
      if(!localSave()){LOCAL_DB=normalizeLocalDb(JSON.parse(snapshot));throw new Error('Falha ao gravar no aparelho.');}
      CUR_DAY=name;closeModal('modal-day');renderWorkout();showToast(oldName?'✓ Pasta renomeada':'✓ Dia criado');
    }
  }catch(error){alert('Erro ao salvar o dia: '+error.message);}finally{EDIT_DAY_NAME='';endAction('save-day','modal-day');}
}
async function deleteDayFolder(dayName,target='self'){
  const workout=workoutForDayTarget(target);if(!workout)return;
  const items=exercisesForDay(workout,dayName),fallback='Treino geral';
  if(items.length&&normalizedName(dayName)===normalizedName(fallback)){alert('A pasta Treino geral contém exercícios. Renomeie a pasta ou mova os exercícios antes de excluí-la.');return;}
  let days=getWorkoutDays(workout).filter(day=>normalizedName(day.name)!==normalizedName(dayName));
  if(items.length&&normalizedName(dayName)!==normalizedName(fallback)&&!days.some(day=>normalizedName(day.name)===normalizedName(fallback)))days.push({id:dayIdFromName(fallback),name:fallback,order:days.length});
  days=normalizeWorkoutDays(days,[]);
  if(!beginAction('delete-day'))return;
  try{
    if(target==='student'){
      if(CURRENT_USER?.role!=='trainer')return;const batch=db.batch();batch.update(db.collection('workouts').doc(workout.id),{days});
      let fallbackOrder=nextExerciseOrder(workout,fallback);for(const exercise of items){batch.update(db.collection('exercises').doc(exercise.id),{dayName:fallback,order:fallbackOrder});exercise.order=fallbackOrder++;}await cloudWrite(batch.commit(),'salvar alterações');workout.days=days;for(const exercise of items)exercise.dayName=fallback;workout.exercises=sortWorkoutExercises(workout);VIEW_STUDENT_DAY='';renderTsWorkout(workout);
    }else{
      if(!canSelfManagePlan())throw new Error('Este plano é administrado pelo treinador.');const snapshot=JSON.stringify(LOCAL_DB);workout.days=days;let fallbackOrder=nextExerciseOrder(workout,fallback);for(const exercise of items){exercise.dayName=fallback;exercise.order=fallbackOrder++;}workout.exercises=sortWorkoutExercises(workout);
      if(!localSave()){LOCAL_DB=normalizeLocalDb(JSON.parse(snapshot));throw new Error('Falha ao gravar no aparelho.');}CUR_DAY='';renderWorkout();
    }
    showToast(items.length?'✓ Pasta removida; exercícios movidos para Treino geral':'✓ Pasta removida');
  }catch(error){alert('Erro ao excluir o dia: '+error.message);}finally{endAction('delete-day');}
}
function populateExerciseDaySelect(workout,selected=''){
  const select=document.getElementById('input-exercise-day'),days=getWorkoutDays(workout);if(!select)return false;
  select.innerHTML=days.map(day=>`<option value="${esc(day.name)}">${esc(day.name)}</option>`).join('');
  if(!days.length){select.innerHTML='<option value="">Crie um dia antes de adicionar exercícios</option>';select.disabled=true;return false;}
  select.disabled=false;const match=days.find(day=>normalizedName(day.name)===normalizedName(selected))||days[0];select.value=match.name;return true;
}

function lockExerciseModalContext(target,workout,dayName=''){
  EXERCISE_MODAL_CONTEXT={
    target:target==='student'?'student':'self',
    studentUid:target==='student'?String(VIEW_STUDENT?.uid||''):String(CURRENT_USER?.uid||''),
    workoutId:String(workout?.id||''),
    dayName:safeDayName(dayName||''),
    openedAt:Date.now()
  };
  return EXERCISE_MODAL_CONTEXT;
}
function exerciseModalWorkout(){
  const context=EXERCISE_MODAL_CONTEXT;
  if(!context?.workoutId)return MODAL_TARGET==='student'?VIEW_STUDENT_WORKOUT:getW(CUR_WORKOUT);
  if(context.target==='student'){
    if(!VIEW_STUDENT||String(VIEW_STUDENT.uid)!==String(context.studentUid))return null;
    return (VIEW_STUDENT.workouts||[]).find(workout=>String(workout.id)===String(context.workoutId))
      ||(String(VIEW_STUDENT_WORKOUT?.id)===String(context.workoutId)?VIEW_STUDENT_WORKOUT:null);
  }
  return getW(context.workoutId);
}
function validateExerciseModalDay(workout,dayName){
  return !!workout&&getWorkoutDays(workout).some(day=>normalizedName(day.name)===normalizedName(dayName));
}
function syncExerciseDestinationBeforeClose(target,workout,dayName){
  if(target==='student'){
    VIEW_STUDENT_WORKOUT=workout;
    VIEW_STUDENT_DAY=dayName;
  }else{
    CUR_WORKOUT=workout?.id||CUR_WORKOUT;
    CUR_DAY=dayName;
  }
  window.TeamBullsNavigation?.syncCurrent?.();
}

// Exercise
function resetExerciseCatalogPicker(){
  SELECTED_EXERCISE_CATALOG=null;
  const groupSelect=document.getElementById('input-exercise-catalog-group');
  const itemSelect=document.getElementById('input-exercise-catalog-item');
  groupSelect.disabled=true;
  groupSelect.innerHTML='<option value="">Carregando grupos...</option>';
  itemSelect.disabled=true;
  itemSelect.innerHTML='<option value="">Selecione primeiro um grupo</option>';
  document.getElementById('exercise-catalog-help').textContent='Carregando o catálogo registrado no banco de dados...';
}
async function prepareExerciseCatalogPicker(){
  const sequence=++EXERCISE_PICKER_SEQ;
  resetExerciseCatalogPicker();
  try{
    await loadExerciseOptions();
    if(sequence!==EXERCISE_PICKER_SEQ||!document.getElementById('modal-exercise').classList.contains('open'))return;
    const groups=Array.isArray(EXERCISE_OPTIONS.groups)?EXERCISE_OPTIONS.groups:[];
    const groupSelect=document.getElementById('input-exercise-catalog-group');
    groupSelect.innerHTML='<option value="">Selecione um grupo</option>'+groups.map(group=>`<option value="${esc(group.id)}">${esc(group.name)}</option>`).join('');
    groupSelect.disabled=!groups.length;
    const exerciseCount=groups.reduce((total,group)=>total+(Array.isArray(group.items)?group.items.length:0),0);
    document.getElementById('exercise-catalog-help').textContent=groups.length
      ?exerciseCount+' exercícios em '+groups.length+' grupos, na ordem do PDF.'
      :'Nenhum exercício foi cadastrado no catálogo.';
  }catch(error){
    console.error('prepareExerciseCatalogPicker',error);
    document.getElementById('exercise-catalog-help').textContent='Não foi possível carregar o catálogo. Você ainda pode digitar o exercício manualmente.';
  }
}
function renderExerciseCatalogItems(){
  SELECTED_EXERCISE_CATALOG=null;
  const groupId=document.getElementById('input-exercise-catalog-group').value;
  const itemSelect=document.getElementById('input-exercise-catalog-item');
  const group=(EXERCISE_OPTIONS.groups||[]).find(entry=>entry.id===groupId);
  if(!group){
    itemSelect.disabled=true;
    itemSelect.innerHTML='<option value="">Selecione primeiro um grupo</option>';
    return;
  }
  itemSelect.disabled=false;
  itemSelect.innerHTML='<option value="">Selecione um exercício</option>'+group.items.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');
}
function selectCatalogExercise(){
  const groupId=document.getElementById('input-exercise-catalog-group').value;
  const itemId=document.getElementById('input-exercise-catalog-item').value;
  const group=(EXERCISE_OPTIONS.groups||[]).find(entry=>entry.id===groupId);
  const item=group?.items?.find(entry=>entry.id===itemId);
  if(!group||!item){SELECTED_EXERCISE_CATALOG=null;return;}
  SELECTED_EXERCISE_CATALOG={groupId:group.id,itemId:item.id,name:item.name};
  document.getElementById('input-exercise-name').value=item.name;
}
function syncCatalogSelectionWithName(){
  if(!SELECTED_EXERCISE_CATALOG)return;
  const typed=document.getElementById('input-exercise-name').value;
  if(normalizedName(typed)!==normalizedName(SELECTED_EXERCISE_CATALOG.name)){
    SELECTED_EXERCISE_CATALOG=null;
    document.getElementById('input-exercise-catalog-item').value='';
  }
}
async function openAddExerciseModal(){
  const workout=getW(CUR_WORKOUT);if(!workout||!getWorkoutDays(workout).length){showToast('Crie uma pasta de dia antes de adicionar exercícios.',true);return;}
  MODAL_TARGET='self';EXERCISE_CREATE_ID=null;EDIT_EXERCISE_ID=null;lockExerciseModalContext('self',workout,CUR_DAY);
  document.getElementById('modal-exercise-title').textContent='Novo exercício — '+(CUR_DAY||workout.name);
  document.getElementById('btn-save-exercise').textContent='ADICIONAR';
  document.getElementById('input-exercise-name').value='';
  document.getElementById('input-exercise-instructions').value=DEFAULT_EXERCISE_INSTRUCTIONS;
  populateExerciseDaySelect(workout,CUR_DAY);
  openModal('modal-exercise');
  await prepareExerciseCatalogPicker();
}
// Versão usada pelo treinador para adicionar um exercício ao treino do aluno.
async function openAddExerciseModalTs(){
  if(!VIEW_STUDENT_WORKOUT||!getWorkoutDays(VIEW_STUDENT_WORKOUT).length){showToast('Crie uma pasta de dia antes de adicionar exercícios.',true);return;}
  MODAL_TARGET='student';EXERCISE_CREATE_ID=null;EDIT_EXERCISE_ID=null;lockExerciseModalContext('student',VIEW_STUDENT_WORKOUT,VIEW_STUDENT_DAY);
  document.getElementById('modal-exercise-title').textContent='Novo exercício — '+(VIEW_STUDENT_DAY||VIEW_STUDENT_WORKOUT.name);
  document.getElementById('btn-save-exercise').textContent='ADICIONAR';
  document.getElementById('input-exercise-name').value='';
  document.getElementById('input-exercise-instructions').value=DEFAULT_EXERCISE_INSTRUCTIONS;
  populateExerciseDaySelect(VIEW_STUDENT_WORKOUT,VIEW_STUDENT_DAY);
  openModal('modal-exercise');
  await prepareExerciseCatalogPicker();
}


async function openEditExerciseModalTs(){
  if(!VIEW_STUDENT_EXERCISE)return;MODAL_TARGET='student';EDIT_EXERCISE_ID=VIEW_STUDENT_EXERCISE.id;EXERCISE_CREATE_ID=null;lockExerciseModalContext('student',VIEW_STUDENT_WORKOUT,VIEW_STUDENT_EXERCISE.dayName||VIEW_STUDENT_DAY);
  document.getElementById('modal-exercise-title').textContent='Editar exercício — '+(VIEW_STUDENT?.name||'aluno');document.getElementById('btn-save-exercise').textContent='SALVAR ALTERAÇÕES';
  document.getElementById('input-exercise-name').value=VIEW_STUDENT_EXERCISE.name;document.getElementById('input-exercise-instructions').value=String(VIEW_STUDENT_EXERCISE.instructions||'');populateExerciseDaySelect(VIEW_STUDENT_WORKOUT,VIEW_STUDENT_EXERCISE.dayName||VIEW_STUDENT_DAY);openModal('modal-exercise');await prepareExerciseCatalogPicker();
  const group=document.getElementById('input-exercise-catalog-group'),item=document.getElementById('input-exercise-catalog-item');if(VIEW_STUDENT_EXERCISE.catalogGroupId){group.value=VIEW_STUDENT_EXERCISE.catalogGroupId;renderExerciseCatalogItems();item.value=VIEW_STUDENT_EXERCISE.catalogItemId||'';SELECTED_EXERCISE_CATALOG={groupId:group.value,itemId:item.value,name:VIEW_STUDENT_EXERCISE.name};}
}

async function saveExercise(){
  const name=document.getElementById('input-exercise-name').value.trim();
  const dayName=safeDayName(document.getElementById('input-exercise-day').value);
  let instructions=String(document.getElementById('input-exercise-instructions').value||'').normalize('NFKC').trim().slice(0,1500);
  if(!EDIT_EXERCISE_ID&&!instructions)instructions=DEFAULT_EXERCISE_INSTRUCTIONS;
  const techniqueIds=selectedTechniqueIdsFromEditor();
  const optionalTechniqueIds=selectedOptionalTechniqueIdsFromEditor();
  const supersetExerciseId=selectedSupersetExerciseId();
  if(!name){alert('Digite o nome do exercício!');return;}
  if(techniqueIds.includes('ss')&&!supersetExerciseId){alert('Selecione o segundo exercício do Super set.');return;}
  const catalogSelection=SELECTED_EXERCISE_CATALOG&&normalizedName(SELECTED_EXERCISE_CATALOG.name)===normalizedName(name)
    ?{catalogGroupId:SELECTED_EXERCISE_CATALOG.groupId,catalogItemId:SELECTED_EXERCISE_CATALOG.itemId}
    :{catalogGroupId:'',catalogItemId:''};
  const targetWorkout=exerciseModalWorkout();
  if(!targetWorkout){alert('O protocolo aberto mudou enquanto o exercício estava sendo editado. Feche o editor e abra novamente no dia correto.');return;}
  if(!validateExerciseModalDay(targetWorkout,dayName)){alert('A pasta/dia selecionada não existe mais neste protocolo. Feche o editor e escolha novamente.');return;}
  if(techniqueIds.includes('ss')){
    const partner=(targetWorkout.exercises||[]).find(e=>String(e.id)===String(supersetExerciseId));
    const linkedSource=(targetWorkout.exercises||[]).find(e=>e.id!==EDIT_EXERCISE_ID&&String(e.supersetExerciseId||'')===String(supersetExerciseId));
    if(!partner){alert('O segundo exercício do Super set não foi encontrado.');return;}
    if(String(partner.supersetExerciseId||'')&&String(partner.supersetExerciseId)!==String(EDIT_EXERCISE_ID||'')){alert('O exercício selecionado já pertence a outro Super set.');return;}
    if(linkedSource){alert('O exercício selecionado já está conjugado com outro exercício.');return;}
  }
  if(!beginAction('save-exercise','modal-exercise'))return;
  try{
    // Treinador adicionando exercício ao treino do aluno
    if(MODAL_TARGET==='student'){
      const context=EXERCISE_MODAL_CONTEXT;
      if(!VIEW_STUDENT||!targetWorkout||String(VIEW_STUDENT.uid)!==String(context?.studentUid||VIEW_STUDENT.uid))throw new Error('O aluno ou protocolo mudou durante a edição.');
      const wid=targetWorkout.id,studentUid=String(context?.studentUid||VIEW_STUDENT.uid),wasEdit=!!EDIT_EXERCISE_ID;
      let savedExerciseId=EDIT_EXERCISE_ID,savedOrder=0;
      if(EDIT_EXERCISE_ID){
        const current=targetWorkout.exercises.find(exercise=>exercise.id===EDIT_EXERCISE_ID),changedDay=current&&normalizedName(current.dayName)!==normalizedName(dayName);
        const order=changedDay?nextExerciseOrder(targetWorkout,dayName):(hasManualOrder(current)?Number(current.order):nextExerciseOrder(targetWorkout,dayName));savedOrder=order;
        await cloudWrite(db.collection('exercises').doc(EDIT_EXERCISE_ID).update({name,dayName,order,instructions,techniqueIds,optionalTechniqueIds,supersetExerciseId,...catalogSelection}),'editar exercício');
      }
      else{const docId=EXERCISE_CREATE_ID||(EXERCISE_CREATE_ID=draftId('exercises'));savedExerciseId=docId;const order=nextExerciseOrder(targetWorkout,dayName);savedOrder=order;await cloudWrite(db.collection('exercises').doc(docId).set({userId:studentUid,workoutId:wid,name,dayName,order,instructions,techniqueIds,optionalTechniqueIds,supersetExerciseId,videoUrl:'',weeklyPlan:{},weeklyTechniquePlan:{},...catalogSelection,createdAt:firebase.firestore.FieldValue.serverTimestamp()}),'criar exercício');}
      const localWorkout=targetWorkout;
      if(localWorkout){
        const existing=localWorkout.exercises.find(exercise=>String(exercise.id)===String(savedExerciseId));
        const savedData={id:savedExerciseId,userId:studentUid,workoutId:wid,name,dayName,order:savedOrder,instructions,techniqueIds,optionalTechniqueIds,supersetExerciseId,...catalogSelection};
        if(existing)Object.assign(existing,savedData);
        else localWorkout.exercises.push({...savedData,videoUrl:'',weeklyPlan:{},sessions:[]});
        localWorkout.exercises=sortWorkoutExercises(localWorkout);
      }
      EXERCISE_CREATE_ID=null;EDIT_EXERCISE_ID=null;
      syncExerciseDestinationBeforeClose('student',localWorkout,dayName);
      closeModal('modal-exercise');
      showToast('✓ Exercício salvo');
      EXERCISE_MODAL_CONTEXT=null;
      const saved=localWorkout?.exercises.find(exercise=>String(exercise.id)===String(savedExerciseId));
      if(wasEdit&&saved){VIEW_STUDENT_EXERCISE=saved;openTsExercise(savedExerciseId);}
      else{renderTsDay();showScreen('screen-ts-day');}
      return;
    }
    const __localSnapshot=JSON.stringify(LOCAL_DB);
      if(MODE==='local'){
      const w=targetWorkout;if(!w)return;
      const docId=EXERCISE_CREATE_ID||(EXERCISE_CREATE_ID=uid());
      if(EDIT_EXERCISE_ID){const e=w.exercises.find(x=>x.id===EDIT_EXERCISE_ID);if(e){const changedDay=normalizedName(e.dayName)!==normalizedName(dayName);Object.assign(e,{name,dayName,instructions,techniqueIds,optionalTechniqueIds,supersetExerciseId,order:changedDay?nextExerciseOrder(w,dayName):(hasManualOrder(e)?Number(e.order):nextExerciseOrder(w,dayName)),...catalogSelection});}}else if(!w.exercises.some(e=>e.id===docId))w.exercises.push({id:docId,name,dayName,instructions,techniqueIds,optionalTechniqueIds,supersetExerciseId,order:nextExerciseOrder(w,dayName),sessions:[],videoUrl:'',weeklyPlan:{},weeklyTechniquePlan:{},...catalogSelection});
      EXERCISE_CREATE_ID=null;EDIT_EXERCISE_ID=null;
      if(!localSave()){LOCAL_DB=normalizeLocalDb(JSON.parse(__localSnapshot));throw new Error('Falha ao gravar no armazenamento local.');}showToast('✓ Exercício salvo offline');syncExerciseDestinationBeforeClose('self',w,dayName);closeModal('modal-exercise');EXERCISE_MODAL_CONTEXT=null;renderDay();
    }else{
      const docId=EXERCISE_CREATE_ID||(EXERCISE_CREATE_ID=draftId('exercises'));
      const w=targetWorkout,order=nextExerciseOrder(w,dayName),ownerUid=String(EXERCISE_MODAL_CONTEXT?.studentUid||CURRENT_USER.uid);
      await cloudWrite(db.collection('exercises').doc(docId).set({userId:ownerUid,workoutId:w.id,name,dayName,order,instructions,techniqueIds,optionalTechniqueIds,supersetExerciseId,videoUrl:'',weeklyPlan:{},weeklyTechniquePlan:{},...catalogSelection,createdAt:firebase.firestore.FieldValue.serverTimestamp()}),'criar exercício');
      if(w&&!w.exercises.some(e=>e.id===docId)){
        w.exercises.push({id:docId,userId:ownerUid,workoutId:w.id,name,dayName,instructions,techniqueIds,optionalTechniqueIds,supersetExerciseId,order,sessions:[],videoUrl:'',weeklyPlan:{},weeklyTechniquePlan:{},...catalogSelection});
        w.exercises=sortWorkoutExercises(w);
      }
      EXERCISE_CREATE_ID=null;
      saveCloudBackup();
      syncExerciseDestinationBeforeClose('self',w,dayName);closeModal('modal-exercise');EXERCISE_MODAL_CONTEXT=null;renderDay();
    }
  }catch(e){
    alert(e?.code==='permission-denied'?'Não foi possível salvar porque as regras do Firebase estão desatualizadas ou esta conta não está reconhecida como treinador. Publique o arquivo firestore_26_compacto.rules em Firebase Console → Firestore Database → Regras e entre novamente.':'Erro ao salvar exercício: '+(e.code?e.code+' — ':'')+e.message);
    console.error(e);
  }finally{
    endAction('save-exercise','modal-exercise');
  }
}

// Session
function openLogSessionModal(){
  SESSION_WID=CUR_WORKOUT;
  SESSION_EID=CUR_EX;
  SESSION_CREATE_ID=draftId('sessions');
  document.getElementById('input-session-date').value=today();
  document.getElementById('input-session-week').value=LAST_SESSION_WEEK;
  SESSION_EDITOR_WEEK=LAST_SESSION_WEEK;
  document.getElementById('input-session-note').value='';
  populateSessionEditorForWeek(SESSION_EDITOR_WEEK);
  const exercise=getE(SESSION_WID,SESSION_EID);populateVariantSelect(exercise,'input-session-variant','session-variant-group');
  renderOptionalTechniqueMode(exercise);
  resetRestTimer();
  openModal('modal-session');
}
function renderSessionPrescriptionSummary(exercise,week,elId){
  const el=document.getElementById(elId);if(!el)return;
  const summary=prescriptionCompactSummary(exercise,week);
  el.innerHTML=summary.rx.sets.length
    ?`<strong>Semana ${week}:</strong> ${esc(summary.reps)} · ${esc(summary.ger)}. Preencha somente o que você conseguiu realizar.`
    :`<strong>Semana ${week}:</strong> sem prescrição cadastrada. O registro continuará disponível, mas confirme a orientação com o treinador.`;
}
function populateSessionEditorForWeek(week){
  const exercise=getE(SESSION_WID,SESSION_EID);
  SET_COUNT=0;document.getElementById('sets-editor').innerHTML='';
  const rx=resolveWeekPrescription(exercise,week);
  if(rx.sets.length)rx.sets.forEach(set=>addSetRow('','',set));
  else for(let i=0;i<3;i++)addSetRow();
  renderSessionPrescriptionSummary(exercise,week,'session-prescription-summary');
}
function sessionEditorHasData(){
  return[...document.querySelectorAll('#sets-editor .performed-set-row')].some(row=>
    row.querySelector('[data-f="w"]').value!==''||row.querySelector('[data-f="r"]').value!==''
  );
}
function onSessionWeekChange(){
  const select=document.getElementById('input-session-week');
  const nextWeek=Number(select.value)||1;
  if(nextWeek===SESSION_EDITOR_WEEK)return;
  if(sessionEditorHasData()&&!window.confirm('Trocar a semana substituirá as linhas atuais pela nova prescrição. Continuar?')){
    select.value=String(SESSION_EDITOR_WEEK);return;
  }
  SESSION_EDITOR_WEEK=nextWeek;LAST_SESSION_WEEK=nextWeek;
  populateSessionEditorForWeek(nextWeek);
}
function addSetRow(weight='',reps='',prescription=null){
  if(SET_COUNT>=30){alert('Limite de 30 séries por sessão.');return;}
  SET_COUNT++;
  const target=normalizePrescriptionSet(prescription);
  const el=document.getElementById('sets-editor');const row=document.createElement('div');
  row.className='performed-set-row';
  if(target){row.dataset.targetMin=target.targetMin;row.dataset.targetMax=target.targetMax;row.dataset.ger=target.ger;}
  row.innerHTML=`<span class="set-edit-num">${SET_COUNT}</span>
    <span class="performed-target">${target?esc(prescribedRangeLabel(target))+' reps':'extra'}</span>
    <span class="performed-ger">${target?formatGerLevel(target.ger)+renderGerMeter(target.ger):'—'}</span>
    <input class="set-edit-input" type="number" placeholder="kg" min="0" step="0.5" data-f="w" value="${esc(weight)}" aria-label="Carga realizada">
    <input class="set-edit-input" type="number" placeholder="reps" min="0" max="100" step="1" data-f="r" value="${esc(reps)}" aria-label="Repetições realizadas">
    <button class="btn-rm-set" onclick="removeSet(this)">✕</button>`;
  el.appendChild(row);
}
function removeSet(btn){
  btn.closest('.performed-set-row').remove();
  document.querySelectorAll('#sets-editor .performed-set-row').forEach((row,index)=>row.querySelector('.set-edit-num').textContent=index+1);
  SET_COUNT=document.querySelectorAll('#sets-editor .performed-set-row').length;
}

/* ══════════════════════════════════════════════════
   REST TIMER (dentro do modal Registrar Sessão)
══════════════════════════════════════════════════ */
function startRestTimer(seconds){
  clearInterval(REST_INTERVAL);
  REST_TOTAL=seconds;REST_REMAINING=seconds;REST_PAUSED=false;
  document.getElementById('rest-timer-presets').style.display='none';
  document.getElementById('rest-timer-controls').style.display='grid';
  document.getElementById('rest-timer-toggle-btn').textContent='⏸ Pausar';
  document.getElementById('rest-timer-display').classList.remove('done');
  renderRestTick();
  REST_INTERVAL=setInterval(restTick,1000);
}
function restTick(){
  // Auto-limpa se o modal foi fechado (backdrop, ESC ou salvar) sem passar por resetRestTimer
  const modal=document.getElementById('modal-session');
  if(!modal||!modal.classList.contains('open')){clearInterval(REST_INTERVAL);REST_INTERVAL=null;return;}
  REST_REMAINING--;
  if(REST_REMAINING<=0){
    REST_REMAINING=0;renderRestTick();
    clearInterval(REST_INTERVAL);REST_INTERVAL=null;
    document.getElementById('rest-timer-display').classList.add('done');
    beepRestDone();
    if(navigator.vibrate)navigator.vibrate([200,100,200]);
    return;
  }
  renderRestTick();
}
function renderRestTick(){
  const m=Math.floor(REST_REMAINING/60),s=REST_REMAINING%60;
  document.getElementById('rest-timer-display').textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  const pct=REST_TOTAL?((REST_TOTAL-REST_REMAINING)/REST_TOTAL*100):0;
  document.getElementById('rest-timer-bar').style.width=pct+'%';
}
function toggleRestTimer(){
  if(REST_REMAINING<=0)return;
  if(REST_PAUSED){
    REST_PAUSED=false;
    REST_INTERVAL=setInterval(restTick,1000);
    document.getElementById('rest-timer-toggle-btn').textContent='⏸ Pausar';
  }else{
    REST_PAUSED=true;
    clearInterval(REST_INTERVAL);REST_INTERVAL=null;
    document.getElementById('rest-timer-toggle-btn').textContent='▶ Continuar';
  }
}
function resetRestTimer(){
  clearInterval(REST_INTERVAL);REST_INTERVAL=null;
  REST_REMAINING=0;REST_TOTAL=0;REST_PAUSED=false;
  const disp=document.getElementById('rest-timer-display');
  if(disp){disp.textContent='00:00';disp.classList.remove('done');}
  const bar=document.getElementById('rest-timer-bar');if(bar)bar.style.width='0%';
  const presets=document.getElementById('rest-timer-presets');if(presets)presets.style.display='grid';
  const controls=document.getElementById('rest-timer-controls');if(controls)controls.style.display='none';
}
function beepRestDone(){
  try{
    const ctx=getSharedAudioContext();if(!ctx)return;
    [0,220].forEach(delay=>{
      setTimeout(()=>{
        const osc=ctx.createOscillator(),gain=ctx.createGain();
        osc.type='sine';osc.frequency.value=880;
        osc.connect(gain);gain.connect(ctx.destination);
        gain.gain.setValueAtTime(.15,ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.18);
        osc.start();osc.stop(ctx.currentTime+.18);
      },delay);
    });
  }catch(e){/* Web Audio indisponível — falha silenciosa */}
}

function renderOptionalTechniqueMode(exercise){
  const group=document.getElementById('session-technique-mode-group'),select=document.getElementById('input-session-technique-mode');
  const optional=exerciseHasOptionalTechnique(exercise,'mp');
  if(group)group.style.display=optional?'block':'none';
  if(select)select.value=optional?'myo':'normal';
}
function selectedPerformedTechniqueMode(exercise){
  if(!exerciseHasOptionalTechnique(exercise,'mp'))return '';
  const value=document.getElementById('input-session-technique-mode')?.value;
  return value==='normal'?'normal':'myo';
}
function renderEditOptionalTechniqueMode(exercise,current=''){const group=document.getElementById('edit-session-technique-mode-group'),select=document.getElementById('edit-session-technique-mode'),optional=exerciseHasOptionalTechnique(exercise,'mp');if(group)group.style.display=optional?'block':'none';if(select)select.value=current==='normal'?'normal':'myo';}
function selectedEditPerformedTechniqueMode(exercise){if(!exerciseHasOptionalTechnique(exercise,'mp'))return '';return document.getElementById('edit-session-technique-mode')?.value==='normal'?'normal':'myo';}

async function saveSession(){
  // Usa IDs travados no momento que o modal abriu — imune a navegação durante o preenchimento
  const wid = SESSION_WID || CUR_WORKOUT;
  const eid = SESSION_EID || CUR_EX;
  if(!wid || !eid){ alert('Erro: exercício não identificado. Feche e tente novamente.'); return; }
  const date=document.getElementById('input-session-date').value;
  if(!date){alert('Selecione a data!');return;}
  const week=parseInt(document.getElementById('input-session-week').value);
  if(!week||week<1||week>8){alert('Selecione a semana de treino!');return;}
  const note=document.getElementById('input-session-note').value.trim();
  const exerciseForVariant=getE(wid,eid);const variant=selectedVariantData(exerciseForVariant,'input-session-variant');const performedTechniqueMode=selectedPerformedTechniqueMode(exerciseForVariant);
  // A prescrição/GER fica travada na linha; o aluno informa apenas o realizado.
  const rows=[...document.querySelectorAll('#sets-editor .performed-set-row')];const sets=[];
  for(const row of rows){
    const rawWeight=row.querySelector('[data-f="w"]').value.trim();
    const rawReps=row.querySelector('[data-f="r"]').value.trim();
    if(rawWeight===''&&rawReps==='')continue; // série prescrita que não foi realizada
    const w=rawWeight===''?0:parseFloat(rawWeight);
    const r=parseInt(rawReps,10);
    if(!Number.isFinite(w)||!Number.isInteger(r)||w<0||w>10000||r<0||r>100){alert('Confira a carga e as repetições das séries realizadas.');return;}
    const performed={weight:w,reps:r};
    if(row.dataset.backoff==='1')performed.backoff=true;
    const target=normalizePrescriptionSet({targetMin:row.dataset.targetMin,targetMax:row.dataset.targetMax,ger:row.dataset.ger});
    if(target)Object.assign(performed,target);
    sets.push(performed);
  }
  if(!sets.length){alert('Registre ao menos uma série realizada.');return;}
  LAST_SESSION_WEEK=week;
  if(!beginAction('save-session','modal-session'))return;
  try{
    const __localSnapshot=JSON.stringify(LOCAL_DB);
      if(MODE==='local'){
      const e=le(wid,eid);if(!e){alert('Erro: exercício não encontrado. Reabra o exercício.');return;}
      const sessionId=SESSION_CREATE_ID||uid();
      const sessionData={id:sessionId,date,week,note,sets,exerciseName:e.name,performedTechniqueMode,...variant};
      if(!e.sessions.some(s=>s.id===sessionId))e.sessions.push(sessionData);
      syncSessionToHistory(sessionData);
      saveSessionArchive(LOCAL_OWNER_UID||INACTIVE_UID||CURRENT_USER?.uid,[sessionData]);
      e.sessions.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
      SESSION_CREATE_ID=null;
      if(!localSave()){LOCAL_DB=normalizeLocalDb(JSON.parse(__localSnapshot));throw new Error('Falha ao gravar no armazenamento local.');}
      const verify=localStorage.getItem(localKeyFor());
      if(verify) showToast('✓ Sessão salva offline');
      else showToast('Erro ao salvar!',true);
    }else{
      const e=getE(wid,eid);
      const exerciseName=e?e.name:'';
      if(!e){alert('Erro: exercício não encontrado. Atualize a tela e tente novamente.');return;}
      const sessionId=SESSION_CREATE_ID||(SESSION_CREATE_ID=draftId('sessions'));
      await cloudWrite(db.collection('sessions').doc(sessionId).set({userId:CURRENT_USER.uid,workoutId:wid,exerciseId:eid,exerciseName,date,week,note,sets,performedTechniqueMode,...variant,createdAt:firebase.firestore.FieldValue.serverTimestamp()}),'salvar registro');
      const sessionData={id:sessionId,userId:CURRENT_USER.uid,workoutId:wid,exerciseId:eid,date,week,note,sets,exerciseName,performedTechniqueMode,...variant};
      if(!e.sessions.some(s=>s.id===sessionId))e.sessions.push(sessionData);
      syncSessionToHistory(sessionData);
      saveSessionArchive(CURRENT_USER.uid,[sessionData]);
      e.sessions.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
      SESSION_CREATE_ID=null;
      saveCloudBackup();
    }
    closeModal('modal-session');
    resetRestTimer();
    // Só re-renderiza se ainda estiver no mesmo exercício
    if(CUR_WORKOUT===wid && CUR_EX===eid) renderExercise();
  }catch(e){
    alert('Erro ao salvar sessão: '+(e.code?e.code+' — ':'')+e.message);
    console.error(e);
  }finally{
    endAction('save-session','modal-session');
  }
}

/* ══════════════════════════════════════════════════
   TRAINER DASHBOARD
══════════════════════════════════════════════════ */
let TRAINER_LIST_LOAD_SEQ=0;
async function renderTrainer(){
  // Garante que os catálogos globais existam no Firestore assim que o
  // treinador entrar, antes mesmo de abrir o seletor de exercícios.
  ensureGlobalCatalogs();
  const loadSeq=++TRAINER_LIST_LOAD_SEQ;
  document.getElementById('trainer-chip-name').textContent=CURRENT_USER?.name||'treinador';
  try{
    const snap=await withTimeout(db.collection('users').where('role','==','student').get(),CLOUD_READ_TIMEOUT_MS,'lista de alunos');
    const students=snap.docs.map(d=>({...d.data(),uid:d.id}));
    if(loadSeq!==TRAINER_LIST_LOAD_SEQ||CURRENT_USER?.role!=='trainer')return;
    students.sort((a,b)=>normalizedName(a.name).localeCompare(normalizedName(b.name),'pt-BR')||a.uid.localeCompare(b.uid));
    const active=students.filter(s=>s.status==='active').length;
    const inactive=students.filter(s=>s.status==='inactive').length;
    document.getElementById('trainer-stats').innerHTML=
      `<div class="stat-cell"><div class="num">${students.length}</div><div class="lbl">Arquivos</div></div>`+
      `<div class="stat-cell"><div class="num" style="color:var(--success)">${active}</div><div class="lbl">Ativos</div></div>`+
      `<div class="stat-cell"><div class="num" style="color:var(--text-muted)">${inactive}</div><div class="lbl">Pausados</div></div>`;
    const list=document.getElementById('student-list');
    const empty=document.getElementById('student-empty');
    if(!students.length){list.innerHTML='';empty.style.display='block';return;}
    empty.style.display='none';
    list.innerHTML=students.map(s=>{
      const initials=(s.name||'?').split(' ').map(n=>n[0]).slice(0,2).join('').toUpperCase();
      const isActive=s.status==='active';
      const toggleLabel=isActive?'PAUSAR':'ATIVAR';
      const toggleClass=isActive?'deactivate':'activate';
      return`<div class="student-card" data-student-uid="${esc(s.uid)}">
        <div class="student-avatar">${esc(initials)}</div>
        <div class="student-info">
          <div class="archive-file-kicker">ARQUIVO ${studentArchiveCode(s.uid)}</div>
          <div class="student-name">${esc(s.name||'Sem nome')}</div>
          <div class="student-meta">${esc(s.email||'')} <span class="badge ${isActive?'badge-active':'badge-inactive'}">${isActive?'● ativo':'○ inativo'}</span></div>
        </div>
        <div class="student-actions">
          <button class="btn-view-student" onclick="viewStudent(${jsArg(s.uid)},${jsArg(s.name||'Aluno')},${jsArg(s.email||'')},${jsArg(s.status||'active')})">ABRIR</button>
          <button class="toggle-btn ${toggleClass}" onclick="toggleStudent(${jsArg(s.uid)},${isActive})">${toggleLabel}</button>
        </div>
      </div>`;
    }).join('');
  }catch(e){
    if(loadSeq===TRAINER_LIST_LOAD_SEQ){
      console.error('renderTrainer',e);
      const list=document.getElementById('student-list');const empty=document.getElementById('student-empty');
      if(list)list.innerHTML='<div class="session-block" style="border-color:var(--warn)"><div style="color:var(--warn);font-size:13px;margin-bottom:8px">Não foi possível carregar os alunos.</div><button class="btn-add-set" onclick="renderTrainer()">TENTAR NOVAMENTE</button></div>';
      if(empty)empty.style.display='none';
    }
  }
}

async function toggleStudent(suid,isActive){
  const newStatus=isActive?'inactive':'active';
  const msg=isActive?'Pausar acesso online deste aluno?':'Reativar acesso online deste aluno?';
  showConfirm(isActive?'Pausar Aluno':'Reativar Aluno',msg,async()=>{
    await cloudWrite(db.collection('users').doc(suid).update({status:newStatus}),'alterar status do aluno');
    renderTrainer();
  });
}

async function viewStudent(suid,sname,email,status){
  const navigation=beginAsyncNavigation();
  VIEW_STUDENT={uid:suid,name:sname,email:email||'',status:status||'active'};
  await renderTrainerStudent(VIEW_STUDENT);
  if(!isNavigationCurrent(navigation)||VIEW_STUDENT?.uid!==suid)return;
  showScreen('screen-trainer-student',navigation);
}

let TRAINER_STUDENT_LOAD_SEQ=0;
async function renderTrainerStudent(s){
  if(!s)return;
  const studentUid=s.uid;
  const loadSeq=++TRAINER_STUDENT_LOAD_SEQ;
  document.getElementById('ts-title').textContent='ARQUIVO // '+s.name.toUpperCase();
  const archive=document.getElementById('ts-archive-card');
  if(archive)archive.innerHTML=`<div class="archive-file-kicker">Arquivo confidencial // ${studentArchiveCode(s.uid)}</div><div class="archive-file-name">${esc(s.name||'Aluno')}</div><div class="archive-file-meta">STATUS: ${s.status==='inactive'?'PAUSADO':'ATIVO'}${s.email?'<br>E-MAIL: '+esc(s.email):''}<br>ACESSO: NÍVEL TREINADOR</div>`;
  try{
    const structure=await fetchCloudStructure(studentUid);
    if(loadSeq!==TRAINER_STUDENT_LOAD_SEQ||VIEW_STUDENT?.uid!==studentUid)return;
    const archived=loadSessionArchive(studentUid),workouts=hydrateWorkoutSessions(normalizeWorkoutCollection(structure.workouts),archived);
    VIEW_STUDENT={...VIEW_STUDENT,workouts};
    HISTORY_BY_NAME=buildHistoryByName(archived);
    // O histórico completo é carregado depois da lista de protocolos, sem segurar a tela.
    runWhenIdle(async()=>{try{const history=await fetchCloudSessions(studentUid);if(loadSeq!==TRAINER_STUDENT_LOAD_SEQ||VIEW_STUDENT?.uid!==studentUid)return;hydrateWorkoutSessions(VIEW_STUDENT.workouts,history.sessions);HISTORY_BY_NAME=buildHistoryByName(history.sessions);if(history.recoveredSessionCount>0)showToast(`✓ ${history.recoveredSessionCount} registro${history.recoveredSessionCount===1?'':'s'} recuperado${history.recoveredSessionCount===1?'':'s'} para este aluno`);}catch(error){console.warn('Histórico do aluno mantido em cache',error);}},1800);
    const list=document.getElementById('ts-workout-list');
    const empty=document.getElementById('ts-workout-empty');
    if(!workouts.length){list.innerHTML='';empty.style.display='block';return;}
    empty.style.display='none';
    const nameCounts={};
    workouts.forEach(w=>{const key=normalizedName(w.name);nameCounts[key]=(nameCounts[key]||0)+1;});
    const duplicateCount=Object.values(nameCounts).reduce((sum,n)=>sum+Math.max(0,n-1),0);
    const duplicateWarning=duplicateCount?`<div class="session-block" style="border-color:var(--warn);margin-bottom:12px"><div style="font-size:13px;color:var(--warn);margin-bottom:8px">⚠ ${duplicateCount===1?'1 treino duplicado encontrado':duplicateCount+' treinos duplicados encontrados'}</div><button class="btn-add-set" onclick="showConfirm('Corrigir duplicatas','Unir treinos com o mesmo nome sem apagar o histórico de séries?',cleanDuplicates)">CORRIGIR DUPLICATAS</button></div>`:'';
    const currentActiveId=activeWorkoutId(workouts);
    list.innerHTML=duplicateWarning+workouts.map((w,index)=>{
      const last=lastDate(w);
      const dayCount=getWorkoutDays(w).length;
      const meta=last?'Último: '+fmt(last):dayCount+' '+(dayCount===1?'dia':'dias');
      const wid=jsArg(w.id),isActive=String(w.id)===currentActiveId;
      const orderControls=`<div class="workout-order-controls"><button class="order-btn" ${index===0?'disabled':''} onclick="event.stopPropagation();moveTrainerWorkout(${wid},-1)" title="Mover protocolo para cima">↑</button><button class="order-btn" ${index===workouts.length-1?'disabled':''} onclick="event.stopPropagation();moveTrainerWorkout(${wid},1)" title="Mover protocolo para baixo">↓</button></div>`;
      return`<div class="workout-card ${isActive?'is-active':'is-inactive'}" data-workout-id="${esc(w.id)}" style="--wcard-color:${w.color}" onclick="openTsWorkout(${wid})">
        <div class="workout-card-info"><div class="protocol-state-badge ${isActive?'active':'inactive'}">${isActive?'● TREINO ATIVO':'○ DESATIVADO'}</div><div class="workout-card-name">${esc(w.name)}</div><div class="workout-card-meta">${meta} · ${esc(v104CycleMeta(w))} · ${w.exercises.length} exerc.${isActive?' · plano atual':' · aluno mantém acesso'}</div></div>
        <div class="workout-card-actions">
          ${orderControls}
          ${isActive?'':`<button class="activate-workout-btn" onclick="event.stopPropagation();activateTrainerWorkout(${wid})" title="Definir como treino atual">ATIVAR</button>`}
          <button class="btn-icon ghost" onclick="event.stopPropagation();exportWorkoutPdfById(${wid},true)" title="Salvar PDF">PDF</button>
          <button class="btn-icon ghost" onclick="event.stopPropagation();openEditWorkoutTs(${wid})" title="Editar">✏️</button>
          <button class="btn-icon ghost" onclick="event.stopPropagation();showConfirm('Excluir treino','Excluir este treino? O histórico de séries dos exercícios fica preservado e reaparece se você recriar um exercício com o mesmo nome.',function(){deleteTsWorkout(${wid});})" title="Excluir">🗑</button>
        </div>
      </div>`;
    }).join('');
  }catch(e){
    console.error('renderTrainerStudent',e);
    if(loadSeq===TRAINER_STUDENT_LOAD_SEQ&&VIEW_STUDENT?.uid===studentUid)showToast('Não foi possível atualizar os dados do aluno.',true);
  }
}


let ACTIVE_REORDER_DRAG=null;
function bindReorderContainer(container,type,target){
  if(!container||container.dataset.reorderBound==='1')return;
  container.dataset.reorderBound='1';
  container.addEventListener('pointerdown',event=>{
    const handle=event.target.closest(`[data-drag-handle="${type}"]`);if(!handle)return;
    const selector=type==='day'?'[data-reorder-day]':'[data-reorder-exercise]';
    const card=handle.closest(selector);if(!card)return;
    event.preventDefault();event.stopPropagation();
    ACTIVE_REORDER_DRAG={container,card,type,target,pointerId:event.pointerId,moved:false};
    card.classList.add('is-dragging');document.body.classList.add('reorder-active');
    try{handle.setPointerCapture(event.pointerId);}catch(error){}
  });
  container.addEventListener('pointermove',event=>{
    const drag=ACTIVE_REORDER_DRAG;if(!drag||drag.container!==container||drag.pointerId!==event.pointerId)return;
    event.preventDefault();drag.moved=true;
    const selector=drag.type==='day'?'[data-reorder-day]':'[data-reorder-exercise]';
    const under=document.elementFromPoint(event.clientX,event.clientY)?.closest(selector);
    if(!under||under===drag.card||under.parentElement!==container)return;
    const rect=under.getBoundingClientRect(),after=event.clientY>rect.top+rect.height/2;
    container.insertBefore(drag.card,after?under.nextSibling:under);
  });
  const finish=async event=>{
    const drag=ACTIVE_REORDER_DRAG;if(!drag||drag.container!==container||drag.pointerId!==event.pointerId)return;
    event.preventDefault();event.stopPropagation();ACTIVE_REORDER_DRAG=null;
    drag.card.classList.remove('is-dragging');document.body.classList.remove('reorder-active');
    if(!drag.moved)return;
    if(drag.type==='day'){
      const names=[...container.querySelectorAll('[data-reorder-day]')].map(item=>item.dataset.reorderDay);
      await persistDayOrder(names,drag.target);
    }else{
      const ids=[...container.querySelectorAll('[data-reorder-exercise]')].map(item=>item.dataset.reorderExercise);
      await persistTrainerExerciseOrder(ids);
    }
  };
  container.addEventListener('pointerup',finish);
  container.addEventListener('pointercancel',finish);
}
async function persistDayOrder(dayNames,target='self'){
  const workout=workoutForDayTarget(target);if(!workout)return false;
  const current=getWorkoutDays(workout),lookup=new Map(current.map(day=>[normalizedName(day.name),day]));
  const ordered=[];
  for(const name of dayNames||[]){const day=lookup.get(normalizedName(name));if(day&&!ordered.includes(day))ordered.push(day);}
  for(const day of current)if(!ordered.includes(day))ordered.push(day);
  const days=ordered.map((day,index)=>({...day,order:index}));
  const actionKey='day-order-'+String(workout.id||'local');if(!beginAction(actionKey))return false;
  try{
    if(target==='student'){
      if(CURRENT_USER?.role!=='trainer')throw new Error('Somente o treinador pode alterar esta ordem.');
      await cloudWrite(db.collection('workouts').doc(workout.id).update({days}),'salvar ordem dos dias');
      workout.days=days;renderTsWorkout(workout);
    }else{
      if(!canSelfManagePlan())throw new Error('Este plano é administrado pelo treinador.');
      const snapshot=JSON.stringify(LOCAL_DB);workout.days=days;
      if(!localSave()){LOCAL_DB=normalizeLocalDb(JSON.parse(snapshot));throw new Error('Falha ao salvar no aparelho.');}
      renderWorkout();
    }
    showToast('✓ Ordem dos dias atualizada');return true;
  }catch(error){alert('Não foi possível atualizar a ordem dos dias: '+error.message);return false;}
  finally{endAction(actionKey);}
}
async function moveDayFolder(dayName,direction,target='self'){
  const workout=workoutForDayTarget(target);if(!workout)return;
  const days=getWorkoutDays(workout),index=days.findIndex(day=>normalizedName(day.name)===normalizedName(dayName)),next=index+Number(direction);
  if(index<0||next<0||next>=days.length)return;
  [days[index],days[next]]=[days[next],days[index]];
  await persistDayOrder(days.map(day=>day.name),target);
}
async function persistTrainerExerciseOrder(ids){
  const workout=VIEW_STUDENT_WORKOUT;if(!workout||CURRENT_USER?.role!=='trainer')return false;
  const items=exercisesForDay(workout,VIEW_STUDENT_DAY),lookup=new Map(items.map(item=>[String(item.id),item]));
  const ordered=[];for(const id of ids||[]){const item=lookup.get(String(id));if(item&&!ordered.includes(item))ordered.push(item);}for(const item of items)if(!ordered.includes(item))ordered.push(item);
  const key='drag-exercise-order-'+String(workout.id);if(!beginAction(key))return false;
  try{
    const batch=db.batch();ordered.forEach((item,position)=>{item.order=position;batch.update(db.collection('exercises').doc(item.id),{order:position});});
    await cloudWrite(batch.commit(),'salvar ordem dos exercícios');workout.exercises=sortWorkoutExercises(workout);renderTsDay();showToast('✓ Ordem dos exercícios atualizada');return true;
  }catch(error){alert('Não foi possível atualizar a ordem dos exercícios: '+error.message);return false;}
  finally{endAction(key);}
}

async function persistWorkoutOrder(workouts,actionKey='workout-order'){
  if(!VIEW_STUDENT||CURRENT_USER?.role!=='trainer')return false;
  const normalized=normalizeWorkoutCollection(workouts);
  if(!beginAction(actionKey))return false;
  try{
    const batch=db.batch();normalized.forEach((workout,index)=>batch.update(db.collection('workouts').doc(workout.id),{order:index,isActive:workout.isActive===true}));
    await cloudWrite(batch.commit(),'salvar alterações');VIEW_STUDENT.workouts=normalized;await renderTrainerStudent(VIEW_STUDENT);return true;
  }catch(error){alert('Não foi possível atualizar a ordem dos treinos: '+error.message);return false;}
  finally{endAction(actionKey);}
}
async function moveTrainerWorkout(wid,direction){
  const workouts=normalizeWorkoutCollection(VIEW_STUDENT?.workouts||[]),index=workouts.findIndex(workout=>workout.id===wid),next=index+Number(direction);
  if(index<0||next<0||next>=workouts.length)return;
  [workouts[index],workouts[next]]=[workouts[next],workouts[index]];
  workouts.forEach((workout,position)=>workout.order=position);
  await persistWorkoutOrder(workouts,'move-workout-'+wid);
}
async function activateTrainerWorkout(wid){
  const workouts=normalizeWorkoutCollection(VIEW_STUDENT?.workouts||[]),index=workouts.findIndex(workout=>workout.id===wid);if(index<0)return;
  const [target]=workouts.splice(index,1);workouts.unshift(target);
  workouts.forEach((workout,position)=>{workout.order=position;workout.isActive=workout.id===wid;});
  if(await persistWorkoutOrder(workouts,'activate-workout-'+wid))showToast('✓ Treino ativo atualizado');
}
async function moveTrainerExercise(eid,direction){
  const workout=VIEW_STUDENT_WORKOUT,exercise=workout?.exercises?.find(item=>item.id===eid);if(!workout||!exercise||CURRENT_USER?.role!=='trainer')return;
  const items=exercisesForDay(workout,exercise.dayName),index=items.findIndex(item=>item.id===eid),next=index+Number(direction);if(index<0||next<0||next>=items.length)return;
  [items[index],items[next]]=[items[next],items[index]];
  await persistTrainerExerciseOrder(items.map(item=>item.id));
}

function openBulkPrescriptionModal(){
  const w=VIEW_STUDENT_WORKOUT;if(!w||!(w.exercises||[]).length){showToast('Adicione exercícios antes de copiar prescrições.',true);return;}
  const source=document.getElementById('bulk-source-exercise');source.innerHTML=sortWorkoutExercises(w).map(e=>`<option value="${esc(e.id)}"${VIEW_STUDENT_EXERCISE?.id===e.id?' selected':''}>${esc(e.dayName||'Treino geral')} — ${esc(e.name)}</option>`).join('');
  document.getElementById('bulk-copy-week').value=String(TRAINER_ACTIVE_WEEK||1);document.getElementById('bulk-copy-mode').value='all';syncBulkWeekVisibility();renderBulkTargets();openModal('modal-bulk-prescription');
}
function syncBulkWeekVisibility(){document.getElementById('bulk-week-wrap').style.display=document.getElementById('bulk-copy-mode').value==='week'?'block':'none';}
function renderBulkTargets(){
  const w=VIEW_STUDENT_WORKOUT,sourceId=document.getElementById('bulk-source-exercise').value,wrap=document.getElementById('bulk-targets');
  const targets=sortWorkoutExercises(w).filter(e=>e.id!==sourceId);wrap.innerHTML=targets.map(e=>`<label class="bulk-target"><input type="checkbox" value="${esc(e.id)}"><span><b>${esc(e.name)}</b><small style="display:block;color:var(--text-muted)">${esc(e.dayName||'Treino geral')}</small></span></label>`).join('')||'<div class="plan-help">Não há outros exercícios neste treino.</div>';document.getElementById('bulk-select-all').checked=false;
}
function toggleBulkAll(checked){document.querySelectorAll('#bulk-targets input[type=checkbox]').forEach(input=>input.checked=checked);}
async function saveBulkPrescription(){
  const w=VIEW_STUDENT_WORKOUT,sourceId=document.getElementById('bulk-source-exercise').value,source=w?.exercises?.find(e=>e.id===sourceId);if(!source)return;
  const ids=[...document.querySelectorAll('#bulk-targets input:checked')].map(x=>x.value);if(!ids.length){alert('Selecione ao menos um exercício de destino.');return;}
  const mode=document.getElementById('bulk-copy-mode').value,week=Number(document.getElementById('bulk-copy-week').value)||1;
  if(!beginAction('bulk-prescription','modal-bulk-prescription'))return;
  try{
    const batch=db.batch();
    for(const id of ids){const target=w.exercises.find(e=>e.id===id);if(!target)continue;let plan=normalizeWeeklyPlan(target.weeklyPlan);
      if(mode==='all'){plan={};for(let current=1;current<=8;current++)plan['w'+current]=clonePrescriptionSets(resolveWeekPrescription(source,current).sets);}
      else plan['w'+week]=clonePrescriptionSets(resolveWeekPrescription(source,week).sets);
      target.weeklyPlan=plan;batch.update(db.collection('exercises').doc(id),{weeklyPlan:plan});
    }
    await cloudWrite(batch.commit(),'salvar alterações');closeModal('modal-bulk-prescription');if(VIEW_STUDENT_DAY)renderTsDay();else renderTsWorkout(w);showToast(mode==='all'?'✓ Semanas 1 a 8 copiadas':'✓ Semana '+week+' copiada');
  }catch(e){alert('Erro ao copiar prescrições: '+e.message);}finally{endAction('bulk-prescription','modal-bulk-prescription');}
}

function openTsWorkout(wid){
  const w=VIEW_STUDENT.workouts.find(x=>x.id===wid);
  if(!w)return;VIEW_STUDENT_WORKOUT=w;VIEW_STUDENT_DAY='';
  renderTsWorkout(w);showScreen('screen-ts-workout');
}
function renderTsWorkout(w){
  if(!w)return goTrainerStudent();syncWorkoutDays(w);
  document.getElementById('ts-workout-title').textContent='TREINO // '+w.name;
  document.getElementById('trainer-protocol-summary').innerHTML=protocolSummaryHtml(w);
  buildWeeklyBoard(w,'trainer-weekly-board',true);
  const list=document.getElementById('trainer-day-folder-list'),empty=document.getElementById('trainer-day-folder-empty'),days=getWorkoutDays(w);
  list.innerHTML=renderDayFolders(w,true);empty.style.display=days.length?'none':'block';bindReorderContainer(list,'day','student');
  const toggle=document.getElementById('trainer-overview-toggle');if(toggle)toggle.style.display=w.exercises.length?'block':'none';
  const panel=document.getElementById('trainer-workout-overview');if(panel)panel.classList.remove('open');if(toggle)toggle.textContent='▤ MOSTRAR VISÃO GERAL DAS 8 SEMANAS';
}
function openTsDay(dayName){
  const w=VIEW_STUDENT_WORKOUT,day=getWorkoutDays(w).find(item=>normalizedName(item.name)===normalizedName(dayName));if(!w||!day)return goTsWorkout();
  VIEW_STUDENT_DAY=day.name;renderTsDay();showScreen('screen-ts-day');
}
function renderTsDay(){
  const w=VIEW_STUDENT_WORKOUT;if(!w)return goTrainerStudent();const day=getWorkoutDays(w).find(item=>normalizedName(item.name)===normalizedName(VIEW_STUDENT_DAY));if(!day)return goTsWorkout();
  VIEW_STUDENT_DAY=day.name;const items=exercisesForDay(w,day.name),dayWorkout={...w,exercises:items};
  document.getElementById('ts-day-title').textContent='DIA // '+day.name;
  document.getElementById('trainer-day-summary').innerHTML=protocolSummaryHtml(w,day.name);
  buildWeeklyBoard(dayWorkout,'trainer-day-weekly-board',true);
  const list=document.getElementById('ts-exercise-list'),empty=document.getElementById('ts-day-exercise-empty');list.innerHTML=renderExerciseRows(items,true);empty.style.display=items.length?'none':'block';bindReorderContainer(list,'exercise','student');
}
function openTsExercise(eid){
  const e=VIEW_STUDENT_WORKOUT.exercises.find(x=>x.id===eid);
  if(!e)return goTsDay();VIEW_STUDENT_EXERCISE=e;
  document.getElementById('ts-exercise-title').textContent=e.name.toUpperCase();
  tsMiniChart=null;
  renderExerciseInstructions(e,'ts-exercise-instructions-box',true);
  renderExercisePrescription(e,'ts-exercise-prescription-card',TRAINER_ACTIVE_WEEK,true,true);
  buildSessions(e,'ts-sessions-list',true,VIEW_STUDENT_WORKOUT?.id,VIEW_STUDENT?.workouts);
  renderExerciseVideo(e,'ts-exercise-video-box','trainer');
  showScreen('screen-ts-exercise');
  requestAnimationFrame(()=>{ buildChart(e,'tsProgressChart',TS_CHART_MODE,null,VIEW_STUDENT?.workouts); });
}

/* ══════════════════════════════════════════════════
   FEEDBACK
══════════════════════════════════════════════════ */
function openFeedbackModal(){document.getElementById('input-feedback').value='';openModal('modal-feedback');}
async function sendFeedback(){
  const msg=document.getElementById('input-feedback').value.trim();
  if(!msg){alert('Digite uma mensagem!');return;}
  if(!VIEW_STUDENT){return;}
  if(!beginAction('send-feedback','modal-feedback'))return;
  try{
    const draftKey='feedback-'+VIEW_STUDENT.uid;
    const feedbackId=idempotentDraftId(draftKey,'feedback');
    await cloudWrite(db.collection('feedback').doc(feedbackId).set({studentId:VIEW_STUDENT.uid,trainerId:CURRENT_USER.uid,message:msg,createdAt:firebase.firestore.FieldValue.serverTimestamp(),read:false}),'enviar o feedback');
    clearIdempotentDraft(draftKey);
    closeModal('modal-feedback');
    alert('Transmissão enviada! O aluno receberá na Sala Vermelha.');
  }catch(e){alert('Erro ao enviar feedback.');}
  finally{endAction('send-feedback','modal-feedback');}
}

/* ══════════════════════════════════════════════════
   EDIT SESSION
══════════════════════════════════════════════════ */
let EDIT_SESSION_ID = null;
let EDIT_SET_COUNT  = 0;

function openEditSession(sid){
  const owner=findSessionOwner(sid);if(!owner)return;
  const sess=owner.session;
  EDIT_SESSION_ID  = sid;
  EDIT_SESSION_WID = owner.workout.id;
  EDIT_SESSION_EID = owner.exercise.id;
  document.getElementById('edit-session-date').value = sess.date;
  document.getElementById('edit-session-week').value = sess.week || 1;
  document.getElementById('edit-session-note').value = sess.note || '';
  EDIT_SET_COUNT = 0;
  const editor = document.getElementById('edit-sets-editor');
  editor.innerHTML = '';
  const rx=resolveWeekPrescription(owner.exercise,sess.week||1);
  sess.sets.forEach((s,index) => { addEditSetRow(s.weight,s.reps,normalizePrescriptionSet(s)||rx.sets[index]||null); });
  renderSessionPrescriptionSummary(owner.exercise,sess.week||1,'edit-session-prescription-summary');
  populateVariantSelect(owner.exercise,'edit-session-variant','edit-session-variant-group',sess.performedExerciseItemId,sess.performedExerciseName);
  renderEditOptionalTechniqueMode(owner.exercise,sess.performedTechniqueMode);
  openModal('modal-edit-session');
}

function addEditSetRow(weight='',reps='',prescription=null){
  if(EDIT_SET_COUNT>=30){alert('Limite de 30 séries por sessão.');return;}
  EDIT_SET_COUNT++;
  const el = document.getElementById('edit-sets-editor');
  const row=document.createElement('div');row.className='performed-set-row';
  const target=normalizePrescriptionSet(prescription);
  if(target){row.dataset.targetMin=target.targetMin;row.dataset.targetMax=target.targetMax;row.dataset.ger=target.ger;}
  row.innerHTML=`<span class="set-edit-num">${EDIT_SET_COUNT}</span>
    <span class="performed-target">${target?esc(prescribedRangeLabel(target))+' reps':'extra'}</span>
    <span class="performed-ger">${target?formatGerLevel(target.ger)+renderGerMeter(target.ger):'—'}</span>
    <input class="set-edit-input" type="number" placeholder="kg" min="0" step="0.5" data-f="w" value="${esc(weight)}" aria-label="Carga realizada">
    <input class="set-edit-input" type="number" placeholder="reps" min="0" max="100" step="1" data-f="r" value="${esc(reps)}" aria-label="Repetições realizadas">
    <button class="btn-rm-set" onclick="removeEditSet(this)">✕</button>`;
  el.appendChild(row);
}

function removeEditSet(btn){
  btn.closest('.performed-set-row').remove();
  document.querySelectorAll('#edit-sets-editor .performed-set-row').forEach((row,index)=>row.querySelector('.set-edit-num').textContent=index+1);
  EDIT_SET_COUNT=document.querySelectorAll('#edit-sets-editor .performed-set-row').length;
}
function onEditSessionWeekChange(){
  const week=Number(document.getElementById('edit-session-week').value)||1;
  const exercise=getE(EDIT_SESSION_WID||CUR_WORKOUT,EDIT_SESSION_EID||CUR_EX);if(!exercise)return;
  const actual=[...document.querySelectorAll('#edit-sets-editor .performed-set-row')].map(row=>({
    weight:row.querySelector('[data-f="w"]').value,
    reps:row.querySelector('[data-f="r"]').value
  }));
  const rx=resolveWeekPrescription(exercise,week);
  EDIT_SET_COUNT=0;document.getElementById('edit-sets-editor').innerHTML='';
  actual.forEach((set,index)=>addEditSetRow(set.weight,set.reps,rx.sets[index]||null));
  renderSessionPrescriptionSummary(exercise,week,'edit-session-prescription-summary');
}

async function saveEditSession(){
  const date = document.getElementById('edit-session-date').value;
  if(!date){ alert('Selecione a data!'); return; }
  const week = parseInt(document.getElementById('edit-session-week').value);
  if(!week||week<1||week>8){ alert('Selecione a semana de treino!'); return; }
  const note = document.getElementById('edit-session-note').value.trim();
  const rows = [...document.querySelectorAll('#edit-sets-editor .performed-set-row')];
  const sets = [];
  for(const row of rows){
    const rawWeight=row.querySelector('[data-f="w"]').value.trim();
    const rawReps=row.querySelector('[data-f="r"]').value.trim();
    if(rawWeight===''&&rawReps==='')continue;
    const w=rawWeight===''?0:parseFloat(rawWeight);
    const r=parseInt(rawReps,10);
    if(!Number.isFinite(w)||!Number.isInteger(r)||w<0||w>10000||r<0||r>100){alert('Confira a carga e as repetições das séries realizadas.');return;}
    const performed={weight:w,reps:r};
    if(row.dataset.backoff==='1')performed.backoff=true;
    const target=normalizePrescriptionSet({targetMin:row.dataset.targetMin,targetMax:row.dataset.targetMax,ger:row.dataset.ger});
    if(target)Object.assign(performed,target);
    sets.push(performed);
  }
  if(!sets.length){deleteEditedSession();return;}
  // Usa IDs travados no momento da abertura do modal
  const wid = EDIT_SESSION_WID || CUR_WORKOUT;
  const eid = EDIT_SESSION_EID || CUR_EX;
  const e = getE(wid, eid); if(!e) return;
  const variant=selectedVariantData(e,'edit-session-variant');
  const performedTechniqueMode=selectedEditPerformedTechniqueMode(e);
  const idx = e.sessions.findIndex(s => s.id === EDIT_SESSION_ID);
  if(idx === -1) return;
  if(!beginAction('edit-session','modal-edit-session'))return;
  try{
    const __localSnapshot=JSON.stringify(LOCAL_DB);
      if(MODE==='local'){
      e.sessions[idx].date = date;
      e.sessions[idx].week = week;
      e.sessions[idx].note = note;
      e.sessions[idx].sets = sets;
      e.sessions[idx].exerciseName = e.name;
      Object.assign(e.sessions[idx],variant,{performedTechniqueMode});
      e.sessions.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
      if(!localSave()){LOCAL_DB=normalizeLocalDb(JSON.parse(__localSnapshot));throw new Error('Falha ao gravar no armazenamento local.');}
    }else{
      await cloudWrite(db.collection('sessions').doc(EDIT_SESSION_ID).update({date, week, note, sets, exerciseName:e.name,performedTechniqueMode,...variant}),'editar registro');
      e.sessions[idx].date = date;
      e.sessions[idx].week = week;
      e.sessions[idx].note = note;
      e.sessions[idx].sets = sets;
      e.sessions[idx].exerciseName = e.name;
      Object.assign(e.sessions[idx],variant,{performedTechniqueMode});
      e.sessions.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
      saveCloudBackup();
    }
    const editedSession=e.sessions.find(s=>s.id===EDIT_SESSION_ID);
    syncSessionToHistory(editedSession);
    saveSessionArchive(MODE==='local'?(LOCAL_OWNER_UID||INACTIVE_UID||CURRENT_USER?.uid):CURRENT_USER?.uid,[editedSession]);
    closeModal('modal-edit-session');
    if(CUR_WORKOUT===wid && CUR_EX===eid) renderExercise();
  }catch(err){
    alert('Erro ao editar: '+err.message);
  }finally{
    endAction('edit-session','modal-edit-session');
  }
}

/* ══════════════════════════════════════════════════
   CONFIRM
══════════════════════════════════════════════════ */
function showConfirm(title,text,cb){
  document.getElementById('confirm-title').textContent=title;
  document.getElementById('confirm-text').textContent=text;
  const button=document.getElementById('confirm-ok-btn');
  button.disabled=false;
  button.textContent='CONFIRMAR';
  button.onclick=async function(){
    if(button.disabled)return;
    button.disabled=true;
    button.textContent='PROCESSANDO...';
    try{
      const completed=await cb();
      if(completed!==false)closeModal('modal-confirm');
    }catch(error){
      console.error('confirm action',error);
      alert('Não foi possível concluir a ação: '+error.message);
    }finally{
      button.disabled=false;
      button.textContent='CONFIRMAR';
    }
  };
  openModal('modal-confirm');
}

document.querySelectorAll('.modal-backdrop').forEach(bd=>{
  bd.addEventListener('click',e=>{if(e.target===bd)closeModal(bd.id);});
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape')document.querySelectorAll('.modal-backdrop.open').forEach(m=>closeModal(m.id));
  if(e.key==='Enter'&&!e.repeat){
    if(document.getElementById('modal-workout').classList.contains('open')){e.preventDefault();saveWorkout();}
    else if(document.getElementById('modal-exercise').classList.contains('open')){e.preventDefault();saveExercise();}
    else if(document.getElementById('panel-reset')?.classList.contains('active')&&document.getElementById('screen-auth').classList.contains('active')){e.preventDefault();sendPasswordReset();}
    else if(document.getElementById('panel-login').classList.contains('active')&&document.getElementById('screen-auth').classList.contains('active')){e.preventDefault();doLogin();}
  }
});
let CHART_RESIZE_FRAME=null;
window.addEventListener('resize',()=>{
  if(CHART_RESIZE_FRAME)return;
  CHART_RESIZE_FRAME=requestAnimationFrame(()=>{
    CHART_RESIZE_FRAME=null;
    if(miniChart&&CUR_EX){const e=getE(CUR_WORKOUT,CUR_EX);if(e)buildChart(e,'progressChart',CHART_MODE,null);}
    if(tsMiniChart&&VIEW_STUDENT_EXERCISE)buildChart(VIEW_STUDENT_EXERCISE,'tsProgressChart',TS_CHART_MODE,null,VIEW_STUDENT?.workouts);
  });
},{passive:true});

/* ══════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════ */

function syncSettingsUi(){
  const ids={background:'setting-bg',text:'setting-text',font:'setting-font',clickVolume:'setting-click',musicVolume:'setting-music'};for(const [key,id] of Object.entries(ids)){const el=document.getElementById(id);if(el)el.value=APP_SETTINGS[key];}
  const labels={background:'setting-bg-value',text:'setting-text-value',font:'setting-font-value',clickVolume:'setting-click-value',musicVolume:'setting-music-value'};for(const [key,id] of Object.entries(labels)){const el=document.getElementById(id);if(el)el.textContent=APP_SETTINGS[key]+'%';}
  document.getElementById('click-on')?.classList.toggle('active',!!APP_SETTINGS.clickEnabled);document.getElementById('click-off')?.classList.toggle('active',!APP_SETTINGS.clickEnabled);document.getElementById('music-on')?.classList.toggle('active',!!APP_SETTINGS.musicEnabled);document.getElementById('music-off')?.classList.toggle('active',!APP_SETTINGS.musicEnabled);
  document.getElementById('music-panel-on')?.classList.toggle('active',!!APP_SETTINGS.musicDock);document.getElementById('music-panel-off')?.classList.toggle('active',!APP_SETTINGS.musicDock);
}
function updateSettingsFromUi(){
  const val=id=>Number(document.getElementById(id)?.value);APP_SETTINGS.background=val('setting-bg')||100;APP_SETTINGS.text=val('setting-text')||100;APP_SETTINGS.font=val('setting-font')||100;APP_SETTINGS.clickVolume=Math.max(0,val('setting-click'));APP_SETTINGS.musicVolume=Math.max(0,val('setting-music'));saveAppSettings();applyAppSettings();
}
function setClickEnabled(enabled){APP_SETTINGS.clickEnabled=!!enabled;saveAppSettings();applyAppSettings();if(enabled)playSurvivalTone(120,.06);}
function setMusicEnabled(enabled){
  APP_SETTINGS.musicEnabled=!!enabled;saveAppSettings();applyAppSettings();
  if(enabled){MUSIC_USER_PAUSED=false;musicPlay();}else musicPause(true,true);
}
function setMusicPanelVisible(visible){
  APP_SETTINGS.musicDock=!!visible;saveAppSettings();applyAppSettings();
  if(visible){initLocalMusic();updateMusicUi();}
}
function resetAppSettings(){APP_SETTINGS={...SETTINGS_DEFAULTS};saveAppSettings();applyAppSettings();showToast('Configurações restauradas');}
// Para adicionar novas músicas, inclua outro objeto nesta lista; a fila aleatória se adapta automaticamente.
const MUSIC_TRACKS=[
  {id:'option-screen',url:'team-bulls-music-01-option-screen.mp3',title:'OPTION SCREEN — EXTENDED'},
  {id:'save-room',url:'team-bulls-music-02-save-room.mp3',title:'SAVE ROOM THEME — EXTENDED'},
  {id:'moment-of-relief',url:'team-bulls-music-03-moment-of-relief.mp3',title:'A MOMENT OF RELIEF — CUT & LOOPED'}
];
const MUSIC_LAST_TRACK_KEY='team_bulls_music_last_track_v9_4';
let LOCAL_MUSIC=null,MUSIC_FADE_FRAME=null,MUSIC_MONITOR=null,MUSIC_WAS_PLAYING=false;
let MUSIC_USER_PAUSED=false,MUSIC_TRANSITIONING=false,MUSIC_QUEUE=[],CURRENT_MUSIC_TRACK=null;
let MUSIC_TRANSITION_SERIAL=0;
let MUSIC_CACHE_REQUESTED=new Set(),MUSIC_ERROR_SKIPS=0;

function getMusicTargetVolume(){
  return Math.max(0,Math.min(1,(Number(APP_SETTINGS.musicVolume)||0)/100));
}
function clearMusicTransitionTimer(){
  if(MUSIC_MONITOR){clearTimeout(MUSIC_MONITOR);MUSIC_MONITOR=null;}
}
function setMusicStatus(message,type=''){
  const el=document.getElementById('music-status');if(!el)return;
  el.textContent=message;el.className='music-status'+(type?' '+type:'');
}
function formatMusicTime(seconds){
  if(!Number.isFinite(seconds)||seconds<0)return'--:--';
  const total=Math.floor(seconds),m=Math.floor(total/60),s=String(total%60).padStart(2,'0');
  return String(m).padStart(2,'0')+':'+s;
}
function musicRandom(){
  try{const values=new Uint32Array(1);crypto.getRandomValues(values);return values[0]/4294967296;}catch(e){return Math.random();}
}
function shuffleMusicTracks(items){
  const result=[...items];
  for(let i=result.length-1;i>0;i--){const j=Math.floor(musicRandom()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
function rebuildMusicQueue(avoidId=''){
  MUSIC_QUEUE=shuffleMusicTracks(MUSIC_TRACKS);
  if(MUSIC_QUEUE.length>1&&MUSIC_QUEUE[0]?.id===avoidId){
    const swapIndex=1+Math.floor(musicRandom()*(MUSIC_QUEUE.length-1));
    [MUSIC_QUEUE[0],MUSIC_QUEUE[swapIndex]]=[MUSIC_QUEUE[swapIndex],MUSIC_QUEUE[0]];
  }
}
function takeNextMusicTrack(avoidId=''){
  if(!MUSIC_QUEUE.length)rebuildMusicQueue(avoidId);
  let next=MUSIC_QUEUE.shift()||MUSIC_TRACKS[0]||null;
  if(next?.id===avoidId&&MUSIC_TRACKS.length>1){
    if(!MUSIC_QUEUE.length)rebuildMusicQueue(avoidId);
    const alternative=MUSIC_QUEUE.shift();
    if(alternative){MUSIC_QUEUE.push(next);next=alternative;}
  }
  return next;
}
function updateMusicTrackLabels(){
  const title=document.getElementById('music-track-title'),sub=document.getElementById('music-track-sub');
  if(title)title.textContent=CURRENT_MUSIC_TRACK?.title||'MÚSICA AMBIENTE';
  if(sub){
    const index=Math.max(0,MUSIC_TRACKS.findIndex(track=>track.id===CURRENT_MUSIC_TRACK?.id))+1;
    sub.textContent=CURRENT_MUSIC_TRACK?`FAIXA ${index} DE ${MUSIC_TRACKS.length} // ORDEM ALEATÓRIA`:'ORDEM ALEATÓRIA // PAINEL OPCIONAL';
  }
}
function setCurrentMusicTrack(track){
  if(!track)return false;
  CURRENT_MUSIC_TRACK=track;updateMusicTrackLabels();
  const audio=LOCAL_MUSIC||document.getElementById('local-music-player');
  if(audio&&audio.getAttribute('src')!==track.url){audio.setAttribute('src',track.url);audio.dataset.trackId=track.id;}
  return true;
}
function ensureInitialMusicTrack(){
  if(CURRENT_MUSIC_TRACK)return CURRENT_MUSIC_TRACK;
  let last='';try{last=localStorage.getItem(MUSIC_LAST_TRACK_KEY)||'';}catch(e){}
  setCurrentMusicTrack(takeNextMusicTrack(last));
  return CURRENT_MUSIC_TRACK;
}
function updateMusicUi(){
  const audio=LOCAL_MUSIC||document.getElementById('local-music-player');
  const current=document.getElementById('music-current-time'),duration=document.getElementById('music-duration'),progress=document.getElementById('music-progress'),button=document.getElementById('music-play-button');
  updateMusicTrackLabels();if(!audio)return;
  if(current)current.textContent=formatMusicTime(audio.currentTime);
  if(duration)duration.textContent=formatMusicTime(audio.duration);
  if(progress&&!progress.matches(':active'))progress.value=Number.isFinite(audio.duration)&&audio.duration>0?String(Math.round((audio.currentTime/audio.duration)*1000)):'0';
  if(button)button.textContent=audio.paused?'▶ TOCAR':'Ⅱ PAUSAR';
}
function initLocalMusic(){
  if(LOCAL_MUSIC)return LOCAL_MUSIC;
  const audio=document.getElementById('local-music-player');if(!audio)return null;
  LOCAL_MUSIC=audio;audio.volume=0;ensureInitialMusicTrack();
  audio.addEventListener('loadedmetadata',()=>{updateMusicUi();startMusicMonitor();if(audio.paused)setMusicStatus('Música pronta. Toque em ▶ para iniciar.','ready');});
  audio.addEventListener('canplay',()=>{if(audio.paused&&!MUSIC_TRANSITIONING)setMusicStatus('Música pronta. Toque em ▶ para iniciar.','ready');});
  audio.addEventListener('play',()=>{
    MUSIC_ERROR_SKIPS=0;
    try{if(CURRENT_MUSIC_TRACK)localStorage.setItem(MUSIC_LAST_TRACK_KEY,CURRENT_MUSIC_TRACK.id);}catch(e){}
    setMusicStatus('Reproduzindo música ambiente.','ready');updateMusicUi();startMusicMonitor();scheduleMusicOfflineCache(CURRENT_MUSIC_TRACK?.url);
  });
  audio.addEventListener('pause',()=>{clearMusicTransitionTimer();updateMusicUi();if(!MUSIC_TRANSITIONING&&audio.currentTime>0&&audio.currentTime<audio.duration)setMusicStatus('Música pausada.');});
  audio.addEventListener('timeupdate',updateMusicUi);
  audio.addEventListener('durationchange',()=>{updateMusicUi();startMusicMonitor();});
  audio.addEventListener('waiting',()=>{if(!MUSIC_TRANSITIONING)setMusicStatus('Carregando áudio…','loading');});
  audio.addEventListener('stalled',()=>setMusicStatus('A conexão está lenta; aguardando o áudio…','loading'));
  audio.addEventListener('error',()=>{
    setMusicStatus('Esta faixa não pôde ser aberta. Tentando a próxima…','error');updateMusicUi();
    if(APP_SETTINGS.musicEnabled&&!MUSIC_USER_PAUSED&&!MUSIC_TRANSITIONING)setTimeout(()=>transitionToNextTrack(0,1400),500);
  });
  audio.addEventListener('ended',()=>{clearMusicTransitionTimer();if(!MUSIC_TRANSITIONING)transitionToNextTrack(350,2200);});
  updateMusicUi();return audio;
}
function cancelMusicFade(){
  if(MUSIC_FADE_FRAME){cancelAnimationFrame(MUSIC_FADE_FRAME);MUSIC_FADE_FRAME=null;}
}
function fadeMusicTo(target,duration=900,onDone=null){
  const audio=initLocalMusic();if(!audio){if(onDone)onDone();return;}
  cancelMusicFade();
  const start=Number(audio.volume||0),end=Math.max(0,Math.min(1,target)),started=performance.now();
  const step=now=>{
    const p=Math.min(1,(now-started)/Math.max(1,duration));
    const eased=p*p*(3-2*p);
    audio.volume=start+(end-start)*eased;
    if(p<1)MUSIC_FADE_FRAME=requestAnimationFrame(step);
    else{MUSIC_FADE_FRAME=null;if(onDone)onDone();}
  };
  MUSIC_FADE_FRAME=requestAnimationFrame(step);
}
async function playCurrentMusicWithFade(fadeInMs=2400){
  const audio=initLocalMusic();if(!audio||!CURRENT_MUSIC_TRACK)return false;
  setMusicStatus('Preparando música ambiente…','loading');
  try{
    audio.volume=0;await audio.play();MUSIC_TRANSITIONING=false;
    fadeMusicTo(getMusicTargetVolume(),fadeInMs);return true;
  }catch(e){
    MUSIC_TRANSITIONING=false;MUSIC_ERROR_SKIPS++;
    if(MUSIC_ERROR_SKIPS<MUSIC_TRACKS.length&&APP_SETTINGS.musicEnabled&&!MUSIC_USER_PAUSED){
      setMusicStatus('Faixa indisponível. Tentando outra música…','error');setTimeout(()=>transitionToNextTrack(0,1200),500);
    }else setMusicStatus('Não foi possível iniciar as músicas. Confirme se os arquivos foram enviados ao GitHub.','error');
    updateMusicUi();return false;
  }
}
async function musicPlay(){
  const audio=initLocalMusic();if(!audio)return;
  if(!APP_SETTINGS.musicEnabled){APP_SETTINGS.musicEnabled=true;saveAppSettings();applyAppSettings();}
  MUSIC_USER_PAUSED=false;ensureInitialMusicTrack();
  if(!audio.paused){MUSIC_TRANSITIONING=false;fadeMusicTo(getMusicTargetVolume(),500);startMusicMonitor();return true;}
  MUSIC_TRANSITIONING=false;
  if(Number.isFinite(audio.duration)&&audio.duration>0&&audio.currentTime>=audio.duration-.25){await transitionToNextTrack(250,2200);return;}
  return playCurrentMusicWithFade(2400);
}
function musicPause(fade=true,markUser=true){
  const audio=initLocalMusic();if(!audio)return;
  if(markUser)MUSIC_USER_PAUSED=true;
  MUSIC_TRANSITIONING=false;
  if(fade&&!audio.paused)fadeMusicTo(0,900,()=>{audio.pause();updateMusicUi();});
  else{cancelMusicFade();audio.pause();audio.volume=0;updateMusicUi();}
}
function toggleMusicPlayback(){
  const audio=initLocalMusic();if(!audio)return;
  if(!audio.paused)musicPause(true,true);else musicPlay();
}
function restartMusic(){
  const audio=initLocalMusic();if(!audio)return;
  if(!APP_SETTINGS.musicEnabled){setMusicEnabled(true);return;}
  MUSIC_USER_PAUSED=false;MUSIC_TRANSITIONING=true;
  const resume=async()=>{
    try{audio.pause();audio.currentTime=0;audio.volume=0;await audio.play();MUSIC_TRANSITIONING=false;fadeMusicTo(getMusicTargetVolume(),2200);updateMusicUi();}
    catch(e){MUSIC_TRANSITIONING=false;setMusicStatus('Toque em ▶ para reiniciar a música.','error');}
  };
  if(audio.paused)resume();else fadeMusicTo(0,850,resume);
}
function transitionToNextTrack(fadeOutMs=1600,fadeInMs=2400){
  const audio=initLocalMusic();
  if(!audio||MUSIC_TRANSITIONING||!APP_SETTINGS.musicEnabled||MUSIC_USER_PAUSED)return Promise.resolve(false);
  clearMusicTransitionTimer();
  MUSIC_TRANSITIONING=true;
  const serial=++MUSIC_TRANSITION_SERIAL;
  return new Promise(resolve=>{
    const switchTrack=async()=>{
      if(serial!==MUSIC_TRANSITION_SERIAL){resolve(false);return;}
      cancelMusicFade();audio.pause();audio.volume=0;
      const next=takeNextMusicTrack(CURRENT_MUSIC_TRACK?.id||'');
      if(!setCurrentMusicTrack(next)){MUSIC_TRANSITIONING=false;resolve(false);return;}
      try{audio.currentTime=0;audio.load();}catch(e){}
      updateMusicUi();
      const ok=await playCurrentMusicWithFade(fadeInMs);
      if(ok)startMusicMonitor();
      resolve(ok);
    };
    if(audio.paused||fadeOutMs<=0||audio.volume<=.01)switchTrack();
    else fadeMusicTo(0,fadeOutMs,switchTrack);
  });
}
function musicNext(){
  MUSIC_USER_PAUSED=false;
  if(!APP_SETTINGS.musicEnabled){APP_SETTINGS.musicEnabled=true;saveAppSettings();applyAppSettings();}
  return transitionToNextTrack(750,2100);
}
function seekMusic(value){
  const audio=initLocalMusic();if(!audio||!Number.isFinite(audio.duration)||audio.duration<=0)return;
  audio.currentTime=(Math.max(0,Math.min(1000,Number(value)||0))/1000)*audio.duration;updateMusicUi();startMusicMonitor();
}
function startMusicMonitor(){
  clearMusicTransitionTimer();
  const audio=LOCAL_MUSIC;
  if(!audio||audio.paused||MUSIC_TRANSITIONING||!Number.isFinite(audio.duration)||audio.duration<=0)return;
  const remaining=Math.max(0,audio.duration-audio.currentTime);
  const lead=Math.min(4.2,Math.max(2.4,remaining*.018));
  const delay=Math.max(250,(remaining-lead)*1000);
  MUSIC_MONITOR=setTimeout(()=>{
    MUSIC_MONITOR=null;
    const active=LOCAL_MUSIC;
    if(!active||active.paused||MUSIC_TRANSITIONING||MUSIC_USER_PAUSED||!APP_SETTINGS.musicEnabled)return;
    transitionToNextTrack(1600,2400);
  },delay);
}
function scheduleMusicOfflineCache(url){
  if(!url||MUSIC_CACHE_REQUESTED.has(url)||!('serviceWorker' in navigator))return;
  const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
  if(connection?.saveData||/2g/.test(connection?.effectiveType||''))return;
  MUSIC_CACHE_REQUESTED.add(url);
  const send=()=>withTimeout(navigator.serviceWorker.ready,5000,'service worker para áudio')
    .then(reg=>{if(reg?.active)reg.active.postMessage({type:'CACHE_AUDIO',url});else MUSIC_CACHE_REQUESTED.delete(url);})
    .catch(()=>MUSIC_CACHE_REQUESTED.delete(url));
  if('requestIdleCallback' in window)requestIdleCallback(()=>setTimeout(send,12000),{timeout:25000});
  else setTimeout(send,20000);
}
function toggleMusicDock(minimize=false){
  const dock=document.getElementById('music-dock');if(!dock)return;
  if(minimize){dock.classList.toggle('minimized');return;}
  setMusicPanelVisible(!APP_SETTINGS.musicDock);
}
function startMusicOnFirstInteraction(event){
  document.removeEventListener('pointerdown',startMusicOnFirstInteraction,true);
  const isMusicControl=event.target?.closest?.('#music-dock,#music-on,#music-off,#music-panel-on,#music-panel-off,#setting-music,#settings-music-next,#settings-music-restart');
  if(!isMusicControl&&APP_SETTINGS.musicEnabled&&!MUSIC_USER_PAUSED)musicPlay();
}
document.addEventListener('pointerdown',startMusicOnFirstInteraction,true);
document.addEventListener('visibilitychange',()=>{
  const audio=LOCAL_MUSIC;if(!audio)return;
  if(document.hidden){MUSIC_WAS_PLAYING=!audio.paused;clearMusicTransitionTimer();if(MUSIC_WAS_PLAYING)musicPause(false,false);}
  else if(MUSIC_WAS_PLAYING&&APP_SETTINGS.musicEnabled&&!MUSIC_USER_PAUSED){MUSIC_WAS_PLAYING=false;musicPlay();}
});
window.addEventListener('online',()=>{if(ACCESS_MODE==='offline-registered')showToast('Internet disponível. Entre novamente para sincronizar.');});

/* ══════════════════════════════════════════════════
   TEAM BULLS v10.2 — INSTRUÇÕES GERAIS E TÉCNICAS
══════════════════════════════════════════════════ */
const GENERAL_INSTRUCTIONS_CACHE_KEY='team_bulls_general_instructions_v1';
const TECHNIQUE_CATALOG_CACHE_KEY='team_bulls_training_techniques_v1';
const DEFAULT_GENERAL_INSTRUCTIONS_TEXT=`Realizar 2 séries de AQUECIMENTO antes do primeiro exercício.

Realizar de 1 a 3 séries PREPARATÓRIAS antes das séries válidas e realizar pelo menos 2 séries preparatórias no primeiro exercício.

Respeite e leve à risca o G.E.R — Grau de Esforço. Com ele é medido o seu grau de intensidade, fadiga e esforço, para que o treino funcione como deve.

Faça progressão de carga sempre que conseguir, mas mantenha a execução perfeita. Não aumente a carga se ainda não a domina.

Atenção especial: alongue bem os ombros e joelhos antes dos treinos. Use a MÁXIMA AMPLITUDE em todos os exercícios.

Não enviar os vídeos das execuções pode afetar negativamente o seu progresso e desempenho. Erros simples, que poderiam ser evitados e corrigidos, muitas vezes passam despercebidos por praticantes e até atletas. Faça valer a pena o seu investimento e extraia o máximo das orientações do treinador.

Cada semana deve ser seguida de forma linear e sem alterações. Fazer qualquer mudança sem orientação do treinador resultará em menor aproveitamento do treino.

Praticantes intermediários podem variar e substituir exercícios, mas devem evitar abusar disso. Os exercícios prescritos foram pensados de forma individual; alterar exercícios em excesso prejudica o plano como um todo.

Atletas são proibidos de substituir exercícios sem autorização ou orientação do treinador, caso queiram obter o melhor resultado possível visando o palco. Atletas de outras modalidades também não devem alterar os exercícios sem orientação, pois isso pode prejudicar o desempenho geral.

Tenha uma rotina estabelecida para conseguir pelo menos 7 a 8 horas de sono todas as noites.

Veja todos os vídeos para obter todas as orientações necessárias.

EM CASO DE CANSAÇO EXTREMO, DESCANSE 2 DIAS SEGUIDOS.`;
const DEFAULT_TECHNIQUE_DEFINITIONS=[
  {id:'ss',code:'SS',name:'Super set',description:'',videoUrl:'',locked:true,order:0},
  {id:'cs',code:'CS',name:'Cluster Set',description:'',videoUrl:'',locked:true,order:1},
  {id:'mp',code:'MP',name:'Myo Reps',description:'',videoUrl:'',locked:true,order:2},
  {id:'bos',code:'BOS',name:'Back off Set',description:'',videoUrl:'',locked:true,order:3},
  {id:'rest-pause',code:'RP',name:'Rest and Pause',description:'',videoUrl:'',locked:true,order:4},
  {id:'it',code:'IT',name:'Isometria tradicional',description:'',videoUrl:'',locked:true,order:5},
  {id:'is',code:'IS',name:'Isometria de sustentação',description:'',videoUrl:'',locked:true,order:6},
  {id:'fs',code:'FS',name:'Feeder Set',description:'',videoUrl:'',locked:true,order:7},
  {id:'partial-reps',code:'RP',name:'Repetições Parciais',description:'',videoUrl:'',locked:true,order:8},
  {id:'dead-stop',code:'DP',name:'Dead Stop',description:'',videoUrl:'',locked:true,order:9},
  {id:'dcs',code:'DCS',name:'Doggcrapp Stretches',description:'',videoUrl:'',locked:true,order:10}
];
let GENERAL_INSTRUCTIONS=defaultGeneralInstructionsLibrary();
let TECHNIQUE_CATALOG=defaultTechniqueCatalog();
let INSTRUCTIONS_RETURN_SCREEN='screen-home';
let INSTRUCTIONS_FORCED=false;
let INSTRUCTIONS_PROMPT_RUNNING=false;
let EDIT_INSTRUCTION_FOLDER_ID='';
let EDIT_INSTRUCTION_ITEM_ID='';
let EDIT_TECHNIQUE_ID='';

function defaultGeneralInstructionsLibrary(){
  return{catalogVersion:1,revision:1,folders:[{id:'general',name:'Orientações gerais',active:true,locked:true,order:0,items:[{id:'general-main',title:'Instruções gerais',text:DEFAULT_GENERAL_INSTRUCTIONS_TEXT,videoUrl:'',active:true,locked:true,order:0}]}]};
}
function normalizeInstructionItem(value,index=0){
  const source=value&&typeof value==='object'?value:{};
  return{id:String(source.id||uid()).slice(0,100),title:String(source.title||'Orientação').normalize('NFKC').trim().slice(0,120)||'Orientação',text:String(source.text||'').normalize('NFKC').trim().slice(0,20000),videoUrl:String(source.videoUrl||'').trim().slice(0,2000),active:source.active!==false,locked:source.locked===true,order:Number.isFinite(Number(source.order))?Number(source.order):index};
}
function normalizeInstructionFolder(value,index=0){
  const source=value&&typeof value==='object'?value:{};
  const items=(Array.isArray(source.items)?source.items:[]).map(normalizeInstructionItem).sort((a,b)=>a.order-b.order||a.title.localeCompare(b.title,'pt-BR')).map((item,i)=>({...item,order:i}));
  return{id:String(source.id||uid()).slice(0,100),name:String(source.name||'Pasta').normalize('NFKC').trim().slice(0,80)||'Pasta',active:source.active!==false,locked:source.locked===true,order:Number.isFinite(Number(source.order))?Number(source.order):index,items};
}
function normalizeGeneralInstructions(value){
  const source=value&&typeof value==='object'?value:{};
  let folders=(Array.isArray(source.folders)?source.folders:[]).map(normalizeInstructionFolder);
  let standard=folders.find(folder=>folder.id==='general');
  if(!standard){standard=defaultGeneralInstructionsLibrary().folders[0];folders.unshift(standard);}else{
    standard={...standard,id:'general',name:standard.name||'Orientações gerais',locked:true};
    let main=standard.items.find(item=>item.id==='general-main');
    if(!main){main=defaultGeneralInstructionsLibrary().folders[0].items[0];standard.items.unshift(main);}else main={...main,id:'general-main',title:main.title||'Instruções gerais',text:main.text||DEFAULT_GENERAL_INSTRUCTIONS_TEXT,locked:true};
    standard.items=standard.items.map(item=>item.id==='general-main'?main:item);
    folders=folders.map(folder=>folder.id==='general'?standard:folder);
  }
  folders=folders.sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'pt-BR')).map((folder,i)=>({...folder,order:i,items:folder.items.sort((a,b)=>a.order-b.order||a.title.localeCompare(b.title,'pt-BR')).map((item,j)=>({...item,order:j}))}));
  return{catalogVersion:1,revision:Math.max(1,parseInt(source.revision,10)||1),folders};
}
function defaultTechniqueCatalog(){return{catalogVersion:1,revision:1,items:DEFAULT_TECHNIQUE_DEFINITIONS.map(item=>({...item}))};}
function normalizeTechniqueItem(value,index=0){
  const source=value&&typeof value==='object'?value:{};
  return{id:String(source.id||uid()).slice(0,100),code:String(source.code||'TEC').normalize('NFKC').trim().toUpperCase().slice(0,12)||'TEC',name:String(source.name||'Técnica').normalize('NFKC').trim().slice(0,100)||'Técnica',description:String(source.description||'').normalize('NFKC').trim().slice(0,12000),videoUrl:String(source.videoUrl||'').trim().slice(0,2000),locked:source.locked===true,order:Number.isFinite(Number(source.order))?Number(source.order):index};
}
function normalizeTechniqueCatalog(value){
  const source=value&&typeof value==='object'?value:{};
  const incoming=(Array.isArray(source.items)?source.items:[]).map(normalizeTechniqueItem);
  const byId=new Map(incoming.map(item=>[item.id,item]));
  for(const standard of DEFAULT_TECHNIQUE_DEFINITIONS){const stored=byId.get(standard.id);byId.set(standard.id,{...standard,...stored,id:standard.id,locked:true});}
  const items=[...byId.values()].sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'pt-BR')).map((item,index)=>({...item,order:index}));
  return{catalogVersion:1,revision:Math.max(1,parseInt(source.revision,10)||1),items};
}
function cacheGeneralInstructions(){storageSet(GENERAL_INSTRUCTIONS_CACHE_KEY,JSON.stringify(GENERAL_INSTRUCTIONS));}
function cacheTechniqueCatalog(){storageSet(TECHNIQUE_CATALOG_CACHE_KEY,JSON.stringify(TECHNIQUE_CATALOG));}
function cachedGeneralInstructions(){try{return normalizeGeneralInstructions(JSON.parse(storageGet(GENERAL_INSTRUCTIONS_CACHE_KEY)||'{}'));}catch(error){return defaultGeneralInstructionsLibrary();}}
function cachedTechniqueCatalog(){try{return normalizeTechniqueCatalog(JSON.parse(storageGet(TECHNIQUE_CATALOG_CACHE_KEY)||'{}'));}catch(error){return defaultTechniqueCatalog();}}
async function loadGeneralInstructions(){
  if(MODE==='local'||!db){GENERAL_INSTRUCTIONS=cachedGeneralInstructions();return GENERAL_INSTRUCTIONS;}
  try{const doc=await cloudGet(db.collection('trainingInstructions').doc('main'),'instruções gerais');
    if(doc.exists)GENERAL_INSTRUCTIONS=normalizeGeneralInstructions(doc.data());
    else{GENERAL_INSTRUCTIONS=defaultGeneralInstructionsLibrary();if(CURRENT_USER?.role==='trainer')await cloudWrite(db.collection('trainingInstructions').doc('main').set({...GENERAL_INSTRUCTIONS,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}),'criar instruções gerais');}
  }catch(error){console.warn('loadGeneralInstructions',error);GENERAL_INSTRUCTIONS=cachedGeneralInstructions();}
  cacheGeneralInstructions();return GENERAL_INSTRUCTIONS;
}
async function persistGeneralInstructions(){
  if(CURRENT_USER?.role!=='trainer')throw new Error('Somente o treinador pode editar as instruções.');
  GENERAL_INSTRUCTIONS=normalizeGeneralInstructions({...GENERAL_INSTRUCTIONS,revision:(GENERAL_INSTRUCTIONS.revision||1)+1});cacheGeneralInstructions();
  await cloudWrite(db.collection('trainingInstructions').doc('main').set({...GENERAL_INSTRUCTIONS,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}),'salvar instruções gerais');
}
let TECHNIQUE_CATALOG_LOAD_PROMISE=null,TECHNIQUE_CATALOG_LOADED_AT=0;
async function loadTechniqueCatalog(force=false){
  if(MODE==='local'||!db){TECHNIQUE_CATALOG=cachedTechniqueCatalog();return TECHNIQUE_CATALOG;}
  if(!force&&TECHNIQUE_CATALOG.items?.length&&Date.now()-TECHNIQUE_CATALOG_LOADED_AT<300000)return TECHNIQUE_CATALOG;
  if(!force&&TECHNIQUE_CATALOG_LOAD_PROMISE)return TECHNIQUE_CATALOG_LOAD_PROMISE;
  TECHNIQUE_CATALOG_LOAD_PROMISE=(async()=>{
    const cached=cachedTechniqueCatalog();if(cached?.items?.length)TECHNIQUE_CATALOG=cached;
    try{const doc=await cloudGet(db.collection('trainingTechniques').doc('main'),'biblioteca de técnicas');
      if(doc.exists)TECHNIQUE_CATALOG=normalizeTechniqueCatalog(doc.data());
      else{TECHNIQUE_CATALOG=defaultTechniqueCatalog();if(CURRENT_USER?.role==='trainer')await cloudWrite(db.collection('trainingTechniques').doc('main').set({...TECHNIQUE_CATALOG,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}),'criar biblioteca de técnicas');}
    }catch(error){console.warn('loadTechniqueCatalog',error);if(!TECHNIQUE_CATALOG.items?.length)TECHNIQUE_CATALOG=cachedTechniqueCatalog();}
    TECHNIQUE_CATALOG_LOADED_AT=Date.now();cacheTechniqueCatalog();return TECHNIQUE_CATALOG;
  })();
  try{return await TECHNIQUE_CATALOG_LOAD_PROMISE;}finally{TECHNIQUE_CATALOG_LOAD_PROMISE=null;}
}
async function persistTechniqueCatalog(){
  if(CURRENT_USER?.role!=='trainer')throw new Error('Somente o treinador pode editar as técnicas.');
  TECHNIQUE_CATALOG=normalizeTechniqueCatalog({...TECHNIQUE_CATALOG,revision:(TECHNIQUE_CATALOG.revision||1)+1});cacheTechniqueCatalog();
  await cloudWrite(db.collection('trainingTechniques').doc('main').set({...TECHNIQUE_CATALOG,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}),'salvar biblioteca de técnicas');
}

const ensureGlobalCatalogsV101=ensureGlobalCatalogs;
ensureGlobalCatalogs=function(){return Promise.all([ensureGlobalCatalogsV101(),loadGeneralInstructions(),loadTechniqueCatalog()]);};

function activeScreenId(){return document.querySelector('.screen.active')?.id||'screen-home';}
function instructionAckKey(){return'team_bulls_instruction_ack_'+String(CURRENT_USER?.uid||LOCAL_OWNER_UID||LOCAL_GUEST_OWNER);}
function visibleInstructionCount(){return GENERAL_INSTRUCTIONS.folders.filter(folder=>folder.active).reduce((total,folder)=>total+folder.items.filter(item=>item.active).length,0);}
async function maybePromptInitialInstructions(){
  if(INSTRUCTIONS_PROMPT_RUNNING||CURRENT_USER?.role==='trainer'||activeScreenId()!=='screen-home')return;
  INSTRUCTIONS_PROMPT_RUNNING=true;
  try{await loadGeneralInstructions();if(!visibleInstructionCount())return;const revision=String(GENERAL_INSTRUCTIONS.revision||1);if(storageGet(instructionAckKey())===revision)return;await openInstructions(true);}catch(error){console.warn('maybePromptInitialInstructions',error);}finally{INSTRUCTIONS_PROMPT_RUNNING=false;}
}
const renderHomeV101=renderHome;
renderHome=function(){const result=renderHomeV101.apply(this,arguments);setTimeout(maybePromptInitialInstructions,450);return result;};

async function openInstructions(forced=false){
  INSTRUCTIONS_RETURN_SCREEN=forced?'screen-home':activeScreenId();INSTRUCTIONS_FORCED=!!forced;await loadGeneralInstructions();renderInstructions();showScreen('screen-instructions');
}
function closeInstructionsScreen(){if(INSTRUCTIONS_FORCED){showToast('Leia e confirme as orientações para continuar.',true);return;}if(CURRENT_USER?.role==='trainer')goTrainer();else goHome();}
function acknowledgeInstructions(){storageSet(instructionAckKey(),String(GENERAL_INSTRUCTIONS.revision||1));INSTRUCTIONS_FORCED=false;goHome();}
function instructionVideoAction(url,title){if(!url)return'';return`<button class="instruction-video-btn" onclick="${MODE==='cloud'?`openCatalogVideo(${jsArg(url)},${jsArg(title)})`:`showToast('Conecte-se à internet para assistir ao vídeo.',true)`}">▶ ASSISTIR VÍDEO EXPLICATIVO</button>`;}
function renderInstructions(){
  const admin=CURRENT_USER?.role==='trainer';const folders=GENERAL_INSTRUCTIONS.folders.filter(folder=>admin||folder.active);
  document.getElementById('instructions-add-folder-btn').style.display=admin?'flex':'none';document.getElementById('instructions-back-btn').style.display=INSTRUCTIONS_FORCED?'none':'flex';document.getElementById('instructions-required-banner').style.display=INSTRUCTIONS_FORCED?'flex':'none';document.getElementById('instructions-ack-btn').style.display=INSTRUCTIONS_FORCED?'block':'none';document.getElementById('instructions-version-label').textContent='revisão '+(GENERAL_INSTRUCTIONS.revision||1);
  const host=document.getElementById('instructions-folders'),empty=document.getElementById('instructions-empty');
  const html=folders.map((folder,folderIndex)=>{const items=folder.items.filter(item=>admin||item.active);const actions=admin?`<div class="instruction-admin-actions"><button onclick="event.stopPropagation();moveInstructionFolder(${jsArg(folder.id)},-1)" ${folderIndex===0?'disabled':''}>↑</button><button onclick="event.stopPropagation();moveInstructionFolder(${jsArg(folder.id)},1)" ${folderIndex===folders.length-1?'disabled':''}>↓</button><button onclick="event.stopPropagation();openInstructionItemModal(${jsArg(folder.id)})">＋</button>${folder.locked?'':`<button onclick="event.stopPropagation();openInstructionFolderModal(${jsArg(folder.id)})">✎</button><button onclick="event.stopPropagation();deleteInstructionFolder(${jsArg(folder.id)})">🗑</button>`}<button onclick="event.stopPropagation();toggleInstructionFolder(${jsArg(folder.id)})">${folder.active?'OCULTAR':'EXIBIR'}</button></div>`:'';
    const itemHtml=items.map((item,itemIndex)=>`<article class="instruction-item ${item.active?'':'inactive'}"><div class="instruction-item-title-row"><div class="instruction-item-title">${esc(item.title)}</div>${admin?`<div class="instruction-admin-actions"><button onclick="moveInstructionItem(${jsArg(folder.id)},${jsArg(item.id)},-1)" ${itemIndex===0?'disabled':''}>↑</button><button onclick="moveInstructionItem(${jsArg(folder.id)},${jsArg(item.id)},1)" ${itemIndex===items.length-1?'disabled':''}>↓</button><button onclick="openInstructionItemModal(${jsArg(folder.id)},${jsArg(item.id)})">✎</button>${item.locked?'':`<button onclick="deleteInstructionItem(${jsArg(folder.id)},${jsArg(item.id)})">🗑</button>`}<button onclick="toggleInstructionItem(${jsArg(folder.id)},${jsArg(item.id)})">${item.active?'OCULTAR':'EXIBIR'}</button></div>`:''}</div><div class="instruction-item-text">${esc(item.text||'Sem texto cadastrado.')}</div>${instructionVideoAction(item.videoUrl,item.title)}</article>`).join('');
    return`<section class="instruction-folder ${folder.active?'':'inactive'}"><div class="instruction-folder-head"><div class="instruction-folder-icon">📁</div><div class="instruction-folder-title">${esc(folder.name)}</div>${admin?`<div class="instruction-folder-state">${folder.active?'VISÍVEL':'OCULTA'}</div>`:''}${actions}</div>${itemHtml||'<div class="no-data-inline">Pasta sem orientações.</div>'}</section>`;}).join('');
  host.innerHTML=html;empty.style.display=html?'none':'block';
}
function openInstructionFolderModal(id=''){if(CURRENT_USER?.role!=='trainer')return;EDIT_INSTRUCTION_FOLDER_ID=id;const folder=GENERAL_INSTRUCTIONS.folders.find(item=>item.id===id);document.getElementById('instruction-folder-modal-title').textContent=folder?'Editar pasta':'Nova pasta';document.getElementById('input-instruction-folder-name').value=folder?.name||'';document.getElementById('input-instruction-folder-active').value=String(folder?.active!==false);openModal('modal-instruction-folder');}
async function saveInstructionFolder(){if(!beginAction('save-instruction-folder','modal-instruction-folder'))return;try{const name=document.getElementById('input-instruction-folder-name').value.normalize('NFKC').trim().slice(0,80),active=document.getElementById('input-instruction-folder-active').value==='true';if(!name)throw new Error('Digite o nome da pasta.');const folder=GENERAL_INSTRUCTIONS.folders.find(item=>item.id===EDIT_INSTRUCTION_FOLDER_ID);if(folder){if(folder.locked)throw new Error('A pasta padrão não pode ser renomeada.');Object.assign(folder,{name,active});}else GENERAL_INSTRUCTIONS.folders.push({id:uid(),name,active,locked:false,order:GENERAL_INSTRUCTIONS.folders.length,items:[]});await persistGeneralInstructions();closeModal('modal-instruction-folder');renderInstructions();showToast('✓ Pasta salva');}catch(error){alert(error.message);}finally{endAction('save-instruction-folder','modal-instruction-folder');}}
function openInstructionItemModal(folderId,itemId=''){if(CURRENT_USER?.role!=='trainer')return;EDIT_INSTRUCTION_FOLDER_ID=folderId;EDIT_INSTRUCTION_ITEM_ID=itemId;const folder=GENERAL_INSTRUCTIONS.folders.find(item=>item.id===folderId),item=folder?.items.find(entry=>entry.id===itemId);const select=document.getElementById('input-instruction-item-folder');select.innerHTML=GENERAL_INSTRUCTIONS.folders.map(entry=>`<option value="${esc(entry.id)}">${esc(entry.name)}</option>`).join('');select.value=folderId;select.disabled=!!item?.locked;document.getElementById('instruction-item-modal-title').textContent=item?'Editar orientação':'Nova orientação';document.getElementById('input-instruction-item-title').value=item?.title||'';document.getElementById('input-instruction-item-text').value=item?.text||'';document.getElementById('input-instruction-item-video').value=item?.videoUrl||'';document.getElementById('input-instruction-item-active').value=String(item?.active!==false);openModal('modal-instruction-item');}
async function saveInstructionItem(){if(!beginAction('save-instruction-item','modal-instruction-item'))return;try{const targetFolderId=document.getElementById('input-instruction-item-folder').value,title=document.getElementById('input-instruction-item-title').value.normalize('NFKC').trim().slice(0,120),text=document.getElementById('input-instruction-item-text').value.normalize('NFKC').trim().slice(0,20000),videoUrl=document.getElementById('input-instruction-item-video').value.trim().slice(0,2000),active=document.getElementById('input-instruction-item-active').value==='true';if(!title)throw new Error('Digite o título da orientação.');if(videoUrl&&!extractYouTubeId(videoUrl))throw new Error('Use um link válido do YouTube.');const sourceFolder=GENERAL_INSTRUCTIONS.folders.find(folder=>folder.id===EDIT_INSTRUCTION_FOLDER_ID),targetFolder=GENERAL_INSTRUCTIONS.folders.find(folder=>folder.id===targetFolderId);if(!targetFolder)throw new Error('Pasta não encontrada.');let item=sourceFolder?.items.find(entry=>entry.id===EDIT_INSTRUCTION_ITEM_ID);if(item){if(item.locked&&targetFolderId!==sourceFolder.id)throw new Error('A página padrão não pode ser movida.');Object.assign(item,{title,text,videoUrl,active});if(sourceFolder.id!==targetFolder.id){sourceFolder.items=sourceFolder.items.filter(entry=>entry.id!==item.id);item.order=targetFolder.items.length;targetFolder.items.push(item);}}else targetFolder.items.push({id:uid(),title,text,videoUrl,active,locked:false,order:targetFolder.items.length});await persistGeneralInstructions();closeModal('modal-instruction-item');renderInstructions();showToast('✓ Orientação salva');}catch(error){alert(error.message);}finally{endAction('save-instruction-item','modal-instruction-item');}}
async function toggleInstructionFolder(id){const folder=GENERAL_INSTRUCTIONS.folders.find(item=>item.id===id);if(!folder||CURRENT_USER?.role!=='trainer')return;folder.active=!folder.active;try{await persistGeneralInstructions();renderInstructions();}catch(error){folder.active=!folder.active;alert(error.message);}}
async function toggleInstructionItem(folderId,itemId){const item=GENERAL_INSTRUCTIONS.folders.find(folder=>folder.id===folderId)?.items.find(entry=>entry.id===itemId);if(!item||CURRENT_USER?.role!=='trainer')return;item.active=!item.active;try{await persistGeneralInstructions();renderInstructions();}catch(error){item.active=!item.active;alert(error.message);}}
function deleteInstructionFolder(id){const folder=GENERAL_INSTRUCTIONS.folders.find(item=>item.id===id);if(!folder||folder.locked)return;showConfirm('Excluir pasta','Excluir esta pasta e todas as orientações dentro dela?',async()=>{GENERAL_INSTRUCTIONS.folders=GENERAL_INSTRUCTIONS.folders.filter(item=>item.id!==id);try{await persistGeneralInstructions();renderInstructions();}catch(error){alert(error.message);}});}
function deleteInstructionItem(folderId,itemId){const folder=GENERAL_INSTRUCTIONS.folders.find(item=>item.id===folderId),item=folder?.items.find(entry=>entry.id===itemId);if(!item||item.locked)return;showConfirm('Excluir orientação','Excluir esta orientação?',async()=>{folder.items=folder.items.filter(entry=>entry.id!==itemId);try{await persistGeneralInstructions();renderInstructions();}catch(error){alert(error.message);}});}
async function moveInstructionFolder(id,direction){const items=GENERAL_INSTRUCTIONS.folders,index=items.findIndex(item=>item.id===id),next=index+Number(direction);if(index<0||next<0||next>=items.length)return;[items[index],items[next]]=[items[next],items[index]];items.forEach((item,i)=>item.order=i);await persistGeneralInstructions();renderInstructions();}
async function moveInstructionItem(folderId,itemId,direction){const items=GENERAL_INSTRUCTIONS.folders.find(folder=>folder.id===folderId)?.items||[],index=items.findIndex(item=>item.id===itemId),next=index+Number(direction);if(index<0||next<0||next>=items.length)return;[items[index],items[next]]=[items[next],items[index]];items.forEach((item,i)=>item.order=i);await persistGeneralInstructions();renderInstructions();}

async function openTechniques(){await loadTechniqueCatalog();renderTechniques();showScreen('screen-techniques');}
function closeTechniquesScreen(){if(CURRENT_USER?.role==='trainer')goTrainer();else goHome();}
function renderTechniques(){const admin=CURRENT_USER?.role==='trainer';document.getElementById('techniques-add-btn').style.display=admin?'flex':'none';document.getElementById('techniques-list').innerHTML=TECHNIQUE_CATALOG.items.map(item=>`<div class="technique-card" onclick="openTechniqueDetail(${jsArg(item.id)})"><div class="technique-code">${esc(item.code)}</div><div class="technique-card-main"><div class="technique-card-name">${esc(item.name)}</div><div class="technique-card-summary">${esc(item.description||'Explicação a ser cadastrada pelo treinador.')}</div></div>${admin?`<div class="technique-card-actions"><button onclick="event.stopPropagation();openTechniqueEditor(${jsArg(item.id)})">✎</button>${item.locked?'':`<button onclick="event.stopPropagation();deleteTechnique(${jsArg(item.id)})">🗑</button>`}</div>`:'<div class="exercise-row-arrow">›</div>'}</div>`).join('');}
function openTechniqueDetail(id){const item=TECHNIQUE_CATALOG.items.find(entry=>entry.id===id);if(!item)return;document.getElementById('technique-detail-title').textContent=item.name;document.getElementById('technique-detail-body').innerHTML=`<div class="technique-detail-code">${esc(item.code)}</div><div class="technique-detail-text">${esc(item.description||'O treinador ainda não cadastrou a explicação desta técnica.')}</div>`;const video=document.getElementById('technique-detail-video-btn');video.style.display=item.videoUrl?'block':'none';video.onclick=()=>{closeModal('modal-technique-detail');if(MODE==='cloud')openCatalogVideo(item.videoUrl,item.name);else showToast('Conecte-se à internet para assistir ao vídeo.',true);};openModal('modal-technique-detail');}
function openTechniqueEditor(id=''){if(CURRENT_USER?.role!=='trainer')return;EDIT_TECHNIQUE_ID=id;const item=TECHNIQUE_CATALOG.items.find(entry=>entry.id===id);document.getElementById('technique-editor-title').textContent=item?'Editar técnica':'Nova técnica';document.getElementById('input-technique-code').value=item?.code||'';document.getElementById('input-technique-name').value=item?.name||'';document.getElementById('input-technique-description').value=item?.description||'';document.getElementById('input-technique-video').value=item?.videoUrl||'';openModal('modal-technique-editor');}
async function saveTechnique(){if(!beginAction('save-technique','modal-technique-editor'))return;try{const code=document.getElementById('input-technique-code').value.normalize('NFKC').trim().toUpperCase().slice(0,12),name=document.getElementById('input-technique-name').value.normalize('NFKC').trim().slice(0,100),description=document.getElementById('input-technique-description').value.normalize('NFKC').trim().slice(0,12000),videoUrl=document.getElementById('input-technique-video').value.trim().slice(0,2000);if(!code||!name)throw new Error('Preencha a sigla e o nome.');if(videoUrl&&!extractYouTubeId(videoUrl))throw new Error('Use um link válido do YouTube.');const item=TECHNIQUE_CATALOG.items.find(entry=>entry.id===EDIT_TECHNIQUE_ID);if(item)Object.assign(item,{code,name,description,videoUrl});else TECHNIQUE_CATALOG.items.push({id:uid(),code,name,description,videoUrl,locked:false,order:TECHNIQUE_CATALOG.items.length});await persistTechniqueCatalog();closeModal('modal-technique-editor');renderTechniques();showToast('✓ Técnica salva');}catch(error){alert(error.message);}finally{endAction('save-technique','modal-technique-editor');}}
function deleteTechnique(id){const item=TECHNIQUE_CATALOG.items.find(entry=>entry.id===id);if(!item||item.locked)return;showConfirm('Excluir técnica','Excluir esta técnica personalizada? Exercícios antigos manterão o identificador, mas ela deixará de aparecer na biblioteca.',async()=>{TECHNIQUE_CATALOG.items=TECHNIQUE_CATALOG.items.filter(entry=>entry.id!==id);try{await persistTechniqueCatalog();renderTechniques();}catch(error){alert(error.message);}});}

function normalizeExerciseTechniqueIds(value){if(!Array.isArray(value))return[];const out=[];for(const id of value){const clean=String(id||'').slice(0,100);if(clean&&!out.includes(clean))out.push(clean);}return out;}
function workoutContainingExercise(exercise){const sources=[VIEW_STUDENT_WORKOUT,getW(CUR_WORKOUT),...(VIEW_STUDENT?.workouts||[]),...(CLOUD_WORKOUTS||[]),...(LOCAL_DB.workouts||[])];return sources.find(workout=>(workout?.exercises||[]).some(item=>item.id===exercise?.id))||null;}
function findSupersetPartner(exercise,workout=workoutContainingExercise(exercise)){if(!exercise||!workout)return null;const own=String(exercise.supersetExerciseId||'');if(own){const direct=workout.exercises.find(item=>item.id===own);if(direct)return direct;}return workout.exercises.find(item=>String(item.supersetExerciseId||'')===String(exercise.id))||null;}
function exerciseTechniqueIds(exercise){const ids=normalizeExerciseTechniqueIds(exercise?.techniqueIds);if(findSupersetPartner(exercise)&&!ids.includes('ss'))ids.unshift('ss');return ids;}
function exerciseHasTechnique(exercise,id){return exerciseTechniqueIds(exercise).includes(id);}
function exerciseOptionalTechniqueIds(exercise){return normalizeExerciseTechniqueIds(exercise?.optionalTechniqueIds).filter(id=>id==='mp'&&exerciseHasTechnique(exercise,'mp'));}
function exerciseHasOptionalTechnique(exercise,id){return exerciseOptionalTechniqueIds(exercise).includes(id);}
function exerciseUsesResistedTime(exercise){return exerciseHasTechnique(exercise,'is');}
function techniqueItemsForExercise(exercise){const ids=exerciseTechniqueIds(exercise);return ids.map(id=>TECHNIQUE_CATALOG.items.find(item=>item.id===id)).filter(Boolean);}
function renderExerciseTechniquePanels(exercise,trainerMode=false){const techniqueHost=document.getElementById(trainerMode?'ts-exercise-techniques-box':'exercise-techniques-box'),supersetHost=document.getElementById(trainerMode?'ts-exercise-superset-box':'exercise-superset-box');if(!techniqueHost||!supersetHost||!exercise)return;const items=techniqueItemsForExercise(exercise);techniqueHost.innerHTML=items.length?`<div class="exercise-technique-panel"><div class="exercise-technique-panel-head">Técnicas aplicadas</div><div class="exercise-technique-chips">${items.map(item=>`<button class="exercise-technique-chip ${exerciseHasOptionalTechnique(exercise,item.id)?'optional':''}" onclick="openTechniqueDetail(${jsArg(item.id)})">${esc(item.code)} · ${esc(item.name)}${exerciseHasOptionalTechnique(exercise,item.id)?' · OPCIONAL':''}</button>`).join('')}</div></div>`:'';const partner=findSupersetPartner(exercise);if(partner){const open=trainerMode?`openTsExercise(${jsArg(partner.id)})`:`openExercise(${jsArg(partner.id)})`;supersetHost.innerHTML=`<div class="superset-card"><span class="superset-badge">SS</span><div class="superset-main"><div class="superset-title">Conjugado com ${esc(partner.name)}</div><div class="superset-note">Execute os dois exercícios em sequência conforme a orientação.</div></div><button class="superset-open" onclick="${open}">ABRIR</button></div>`;}else supersetHost.innerHTML='';}
const renderExerciseV101=renderExercise;
renderExercise=function(){const result=renderExerciseV101.apply(this,arguments);const exercise=getE(CUR_WORKOUT,CUR_EX);if(exercise){const repsButton=document.getElementById('btn-reps');if(repsButton)repsButton.textContent=exerciseUsesResistedTime(exercise)?'TEMPO':'REPS';loadTechniqueCatalog().then(()=>renderExerciseTechniquePanels(exercise,false));}return result;};
const openExerciseV101=openExercise;
openExercise=function(eid){const result=openExerciseV101.apply(this,arguments);const exercise=getE(CUR_WORKOUT,CUR_EX);if(exercise){const repsButton=document.getElementById('btn-reps');if(repsButton)repsButton.textContent=exerciseUsesResistedTime(exercise)?'TEMPO':'REPS';loadTechniqueCatalog().then(()=>renderExerciseTechniquePanels(exercise,false));}return result;};
const openTsExerciseV101=openTsExercise;
openTsExercise=function(eid){const result=openTsExerciseV101.apply(this,arguments);if(VIEW_STUDENT_EXERCISE){const repsButton=document.getElementById('ts-btn-reps');if(repsButton)repsButton.textContent=exerciseUsesResistedTime(VIEW_STUDENT_EXERCISE)?'TEMPO':'REPS';loadTechniqueCatalog().then(()=>renderExerciseTechniquePanels(VIEW_STUDENT_EXERCISE,true));}return result;};

async function prepareExerciseTechniquePicker(exercise,workout){
  await loadTechniqueCatalog();
  const selected=new Set(normalizeExerciseTechniqueIds(exercise?.techniqueIds));
  const optional=new Set(normalizeExerciseTechniqueIds(exercise?.optionalTechniqueIds));
  const host=document.getElementById('exercise-technique-picker');
  host.innerHTML=TECHNIQUE_CATALOG.items.map(item=>`<label class="technique-picker-option"><input type="checkbox" value="${esc(item.id)}" ${selected.has(item.id)?'checked':''} onchange="onTechniqueSelectionChange()"><span class="technique-picker-code">${esc(item.code)}</span><span class="technique-picker-name">${esc(item.name)}</span></label>`).join('');
  const pair=document.getElementById('input-superset-exercise');
  const exercises=(workout?.exercises||[]).filter(item=>item.id!==exercise?.id);
  pair.innerHTML='<option value="">Selecione o segundo exercício</option>'+exercises.map(item=>`<option value="${esc(item.id)}">${esc(item.dayName)} · ${esc(item.name)}</option>`).join('');
  pair.value=String(exercise?.supersetExerciseId||'');
  const myoToggle=document.getElementById('input-myo-optional');if(myoToggle)myoToggle.checked=optional.has('mp');
  onTechniqueSelectionChange();
}
function onTechniqueSelectionChange(){
  const ids=selectedTechniqueIdsFromEditor(),group=document.getElementById('superset-pair-group'),myoGroup=document.getElementById('myo-optional-group'),myoToggle=document.getElementById('input-myo-optional');
  if(group)group.style.display=ids.includes('ss')?'block':'none';
  if(myoGroup)myoGroup.style.display=ids.includes('mp')?'block':'none';
  if(!ids.includes('mp')&&myoToggle)myoToggle.checked=false;
}
function selectedTechniqueIdsFromEditor(){return[...document.querySelectorAll('#exercise-technique-picker input[type="checkbox"]:checked')].map(input=>input.value);}
function selectedOptionalTechniqueIdsFromEditor(){return selectedTechniqueIdsFromEditor().includes('mp')&&document.getElementById('input-myo-optional')?.checked?['mp']:[];}
function selectedSupersetExerciseId(){return selectedTechniqueIdsFromEditor().includes('ss')?String(document.getElementById('input-superset-exercise')?.value||''):'';}
const openAddExerciseModalV101=openAddExerciseModal;
openAddExerciseModal=async function(){await openAddExerciseModalV101.apply(this,arguments);await prepareExerciseTechniquePicker(null,getW(CUR_WORKOUT));};
const openAddExerciseModalTsV101=openAddExerciseModalTs;
openAddExerciseModalTs=async function(){await openAddExerciseModalTsV101.apply(this,arguments);await prepareExerciseTechniquePicker(null,VIEW_STUDENT_WORKOUT);};
const openEditExerciseModalTsV101=openEditExerciseModalTs;
openEditExerciseModalTs=async function(){await openEditExerciseModalTsV101.apply(this,arguments);await prepareExerciseTechniquePicker(VIEW_STUDENT_EXERCISE,VIEW_STUDENT_WORKOUT);};

function effectivePrescriptionSets(exercise,sets){const clean=(Array.isArray(sets)?sets:[]).map(set=>({...set}));if(exerciseHasTechnique(exercise,'bos')&&clean.length){const last=clean[clean.length-1];clean.push({...last,backoff:true});}return clean;}
function exerciseResultUnit(exercise){return exerciseUsesResistedTime(exercise)?'seg':'reps';}
function exerciseTimerPresets(exercise){const ids=new Set(exerciseTechniqueIds(exercise)),standard=[60,90,120,150,180],short=[20,25,30,35,40,45];let values=[];if(ids.has('mp')&&exerciseHasOptionalTechnique(exercise,'mp'))values=[...short,...standard];else if(ids.has('cs')||ids.has('mp')||ids.has('it'))values=[...short];else values=[...standard];if(ids.has('rest-pause'))values.push(10,15,20,...standard);if(ids.has('dcs'))values.push(20,...standard);if(ids.has('is'))values.push(35,40,45,...standard);return[...new Set(values)].sort((a,b)=>a-b);}
function timerLabel(seconds){return seconds<60?seconds+'s':seconds%60===0?(seconds/60)+' min':Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');}
function renderRestTimerPresetsForExercise(exercise){const host=document.getElementById('rest-timer-presets');if(!host)return;const items=techniqueItemsForExercise(exercise);host.innerHTML=(items.length?`<div class="timer-context">Temporizadores: ${esc(items.map(item=>item.code).join(' · '))}</div>`:'')+exerciseTimerPresets(exercise).map(seconds=>`<button onclick="startRestTimer(${seconds})">${timerLabel(seconds)}</button>`).join('');}

function prescriptionCompactSummaryV102(exercise,week){const rx=resolveWeekPrescription(exercise,week),sets=effectivePrescriptionSets(exercise,rx.sets);if(!sets.length)return{ger:'',reps:'Sem prescrição',rx:{...rx,sets}};const ranges=[...new Set(sets.map(prescribedRangeLabel))],gers=[...new Set(sets.map(set=>set.ger))],unit=exerciseResultUnit(exercise);return{ger:gers.length===1?formatGerLevel(gers[0]):'GER '+gers.map(level=>String(level).padStart(2,'0')).join('/'),reps:ranges.length===1?sets.length+'×'+ranges[0]+' '+unit:sets.length+' séries',rx:{...rx,sets}};}
prescriptionCompactSummary=prescriptionCompactSummaryV102;
renderExercisePrescription=function(exercise,elId,week,canEdit,trainerMode){const el=document.getElementById(elId);if(!el||!exercise)return;const base=resolveWeekPrescription(exercise,week),sets=effectivePrescriptionSets(exercise,base.sets),completed=(exercise.sessions||[]).filter(session=>Number(session.week)===Number(week)),unit=exerciseResultUnit(exercise);const rows=sets.length?sets.map((set,index)=>`<div class="prescription-set-row ${set.backoff?'backoff-row':''}"><span class="prescription-set-number">${index+1}ª${set.backoff?'<span class="backoff-label">BOS</span>':''}</span><span class="prescription-range">${esc(prescribedRangeLabel(set))} ${unit}${set.backoff?'<span class="backoff-label">-20% de carga</span>':''}</span><span class="ger-pill">${formatGerLevel(set.ger)} ${renderGerMeter(set.ger)}</span></div>`).join(''):'<div class="prescription-empty">Nenhuma série prescrita para esta semana.</div>';const source=base.inherited?`Herdada da semana ${base.sourceWeek}`:(base.sourceWeek?'Personalizada nesta semana':'Aguardando prescrição'),target=trainerMode?'trainer':'local',action=canEdit?`<button class="btn-primary" onclick="openPrescriptionModal(${jsArg(exercise.id)},${week},'${target}')">✎ EDITAR PRESCRIÇÃO</button>`:`<button class="btn-primary" onclick="openLogSessionModal()">REGISTRAR RESULTADO</button>`;el.innerHTML=`<div class="prescription-card"><div class="prescription-card-head"><div><div class="prescription-eyebrow">Prescrição do treinador</div><div class="prescription-title">Semana ${week}</div><div class="prescription-source">${esc(source)}</div></div><div class="week-stepper"><button onclick="changeExerciseWeek(-1,${trainerMode?'true':'false'})" ${week<=1?'disabled':''}>‹</button><span>${week}/8</span><button onclick="changeExerciseWeek(1,${trainerMode?'true':'false'})" ${week>=8?'disabled':''}>›</button></div></div><div class="prescription-set-list">${rows}</div>${exerciseHasOptionalTechnique(exercise,'mp')?'<div class="optional-technique-note"><b>MP OPCIONAL</b> — o aluno pode executar estas séries em Myo Reps ou de forma convencional.</div>':''}${completed.length?`<div class="prescription-result">✓ ${completed.length} ${completed.length===1?'sessão registrada':'sessões registradas'} nesta semana</div>`:''}<div class="prescription-actions"><button class="btn-ghost" onclick="openGerInfo()">? ESCALA GER</button>${action}</div></div>`;};

const loadPrescriptionEditorV101=loadPrescriptionEditor;
loadPrescriptionEditor=function(){loadPrescriptionEditorV101.apply(this,arguments);const exercise=getPlanEditExercise(),time=exerciseUsesResistedTime(exercise);document.getElementById('prescription-min-label').textContent=time?'Tempo mín.':'Reps mín.';document.getElementById('prescription-max-label').textContent=time?'Tempo máx.':'Reps máx.';refreshBackoffPrescriptionRow();};
function removeBackoffPrescriptionRow(){document.querySelector('#prescription-editor .plan-set-row[data-backoff="1"]')?.remove();}
function refreshBackoffPrescriptionRow(){removeBackoffPrescriptionRow();const exercise=getPlanEditExercise();if(!exerciseHasTechnique(exercise,'bos'))return;const editor=document.getElementById('prescription-editor'),normalRows=[...editor.querySelectorAll('.plan-set-row:not([data-backoff="1"])')];if(!normalRows.length)return;const source=normalRows[normalRows.length-1],template=prescriptionTemplateFromRow(source)||LAST_PRESCRIPTION_TEMPLATE,row=document.createElement('div');row.className='plan-set-row backoff-row';row.dataset.backoff='1';row.innerHTML=`<span class="set-edit-num">${normalRows.length+1}ª<span class="backoff-label">BOS</span></span><input class="set-edit-input" disabled value="${esc(template.targetMin)}"><input class="set-edit-input" disabled value="${esc(template.targetMax)}"><select class="set-edit-input" disabled><option>${formatGerLevel(template.ger)}</option></select><button class="btn-rm-set" disabled>✕</button><span class="backoff-suggestion">Série automática · -20% de carga · removida somente ao retirar a técnica BOS.</span>`;editor.appendChild(row);}
const addPrescriptionSetRowV101=addPrescriptionSetRow;
addPrescriptionSetRow=function(){removeBackoffPrescriptionRow();const result=addPrescriptionSetRowV101.apply(this,arguments);refreshBackoffPrescriptionRow();return result;};
const rememberPrescriptionRowV101=rememberPrescriptionRow;
rememberPrescriptionRow=function(row){const result=rememberPrescriptionRowV101.apply(this,arguments);refreshBackoffPrescriptionRow();return result;};
const removePrescriptionSetV101=removePrescriptionSet;
removePrescriptionSet=function(btn){removeBackoffPrescriptionRow();const result=removePrescriptionSetV101.apply(this,arguments);refreshBackoffPrescriptionRow();return result;};
const copyPreviousPrescriptionV101=copyPreviousPrescription;
copyPreviousPrescription=function(){const result=copyPreviousPrescriptionV101.apply(this,arguments);refreshBackoffPrescriptionRow();return result;};
collectPrescriptionRows=function(){const rows=[...document.querySelectorAll('#prescription-editor .plan-set-row:not([data-backoff="1"])')];if(!rows.length){alert('Adicione ao menos uma série prescrita.');return null;}const sets=[];for(const row of rows){const targetMin=parseInt(row.querySelector('[data-f="min"]').value,10),targetMax=parseInt(row.querySelector('[data-f="max"]').value,10),ger=parseInt(row.querySelector('[data-f="ger"]').value,10),normalized=normalizePrescriptionSet({targetMin,targetMax,ger});if(!normalized){alert('Confira a faixa prescrita e o GER de todas as séries.');return null;}sets.push(normalized);}return sets;};

renderSessionPrescriptionSummary=function(exercise,week,elId){const el=document.getElementById(elId);if(!el)return;const summary=prescriptionCompactSummary(exercise,week),partner=findSupersetPartner(exercise);el.innerHTML=summary.rx.sets.length?`<strong>Semana ${week}:</strong> ${esc(summary.reps)} · ${esc(summary.ger)}.${partner?` <b>Super set com ${esc(partner.name)}.</b>`:''}${exerciseHasOptionalTechnique(exercise,'mp')?' <b>Myo Reps opcional: ${esc(summary.reps)} em MP OU ${esc(summary.reps)} em séries normais.</b>':''} Preencha somente o que você conseguiu realizar.`:`<strong>Semana ${week}:</strong> sem prescrição cadastrada. O registro continuará disponível, mas confirme a orientação com o treinador.`;};
populateSessionEditorForWeek=function(week){const exercise=getE(SESSION_WID,SESSION_EID);SET_COUNT=0;document.getElementById('sets-editor').innerHTML='';const rx=resolveWeekPrescription(exercise,week),sets=effectivePrescriptionSets(exercise,rx.sets);if(sets.length)sets.forEach(set=>addSetRow('','',set));else{for(let i=0;i<3;i++)addSetRow();if(exerciseHasTechnique(exercise,'bos'))addSetRow('','',{targetMin:8,targetMax:12,ger:3,backoff:true});}document.getElementById('session-result-label').textContent=exerciseUsesResistedTime(exercise)?'Tempo':'Reps';renderSessionPrescriptionSummary(exercise,week,'session-prescription-summary');renderRestTimerPresetsForExercise(exercise);};
function renumberPerformedSetRows(){const rows=[...document.querySelectorAll('#sets-editor .performed-set-row')];rows.forEach((row,index)=>{const num=row.querySelector('.set-edit-num');if(num)num.innerHTML=`${index+1}${row.dataset.backoff==='1'?'<span class="backoff-label">BOS</span>':''}`;});SET_COUNT=rows.length;}
addSetRow=function(weight='',reps='',prescription=null){if(SET_COUNT>=30){alert('Limite de 30 séries por sessão.');return;}const exercise=getE(SESSION_WID,SESSION_EID),target=normalizePrescriptionSet(prescription),backoff=prescription?.backoff===true,time=exerciseUsesResistedTime(exercise),unit=time?'seg':'reps',el=document.getElementById('sets-editor'),row=document.createElement('div');row.className='performed-set-row'+(backoff?' backoff-row':'');if(target){row.dataset.targetMin=target.targetMin;row.dataset.targetMax=target.targetMax;row.dataset.ger=target.ger;}if(backoff)row.dataset.backoff='1';row.innerHTML=`<span class="set-edit-num"></span><span class="performed-target">${target?esc(prescribedRangeLabel(target))+' '+unit:'extra'}${backoff?'<span class="backoff-label">-20% carga</span>':''}</span><span class="performed-ger">${target?formatGerLevel(target.ger)+renderGerMeter(target.ger):'—'}</span><input class="set-edit-input" type="number" placeholder="kg" min="0" step="0.5" data-f="w" value="${esc(weight)}" aria-label="Carga realizada"><input class="set-edit-input" type="number" placeholder="${time?'seg':'reps'}" min="0" max="100" step="1" data-f="r" value="${esc(reps)}" aria-label="${time?'Tempo resistido em segundos':'Repetições realizadas'}"><button class="btn-rm-set" ${backoff?'disabled':''} onclick="removeSet(this)">✕</button>${backoff?'<div class="backoff-suggestion">Sugestão de carga: preencha as séries convencionais.</div>':''}`;row.querySelector('[data-f="w"]').addEventListener('input',updateBackoffLoadSuggestion);const existingBackoff=el.querySelector('.performed-set-row[data-backoff="1"]');if(!backoff&&existingBackoff)el.insertBefore(row,existingBackoff);else el.appendChild(row);renumberPerformedSetRows();updateBackoffLoadSuggestion();};
removeSet=function(btn){const row=btn?.closest('.performed-set-row');if(!row||row.dataset.backoff==='1')return;row.remove();renumberPerformedSetRows();updateBackoffLoadSuggestion();};
function updateBackoffLoadSuggestion(){const rows=[...document.querySelectorAll('#sets-editor .performed-set-row')],normal=rows.filter(row=>row.dataset.backoff!=='1'),last=[...normal].reverse().map(row=>parseFloat(row.querySelector('[data-f="w"]').value)).find(value=>Number.isFinite(value)&&value>0),backoff=rows.find(row=>row.dataset.backoff==='1');if(!backoff)return;const label=backoff.querySelector('.backoff-suggestion');if(!label)return;if(!last){label.textContent='Sugestão de carga: preencha as séries convencionais.';return;}const suggestion=Math.round(last*.8*2)/2;label.textContent=`Sugestão aproximada: ${suggestion.toLocaleString('pt-BR')} kg (-20% sobre ${last.toLocaleString('pt-BR')} kg). Ajuste ao peso disponível.`;}
const openLogSessionModalV101=openLogSessionModal;
openLogSessionModal=function(){const result=openLogSessionModalV101.apply(this,arguments);const exercise=getE(SESSION_WID,SESSION_EID);renderRestTimerPresetsForExercise(exercise);return result;};

function buildSessionsV102(e,elId,readonly,homeWid,ws){const el=document.getElementById(elId),sessions=getSharedSessions(e,ws),time=exerciseUsesResistedTime(e),unit=time?'s':'×';if(!sessions.length){el.innerHTML='<div class="no-data-inline">Nenhuma sessão registrada.</div>';return;}const sorted=[...sessions].sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));el.innerHTML=sorted.map(sess=>{const sets=Array.isArray(sess.sets)?sess.sets:[],vol=sets.reduce((a,s)=>a+(Number(s.weight)||0)*(Number(s.reps)||0),0),rows=sets.map((s,i)=>{const target=normalizePrescriptionSet(s),inRange=target&&Number(s.reps)>=target.targetMin&&Number(s.reps)<=target.targetMax,below=target&&Number(s.reps)<target.targetMin;return`<tr class="${s.backoff?'backoff-row':''}"><td><span class="set-idx">${i+1}${s.backoff?' BOS':''}</span></td><td><span class="set-chip">${target?esc(prescribedRangeLabel(target))+(time?'s':''):'—'}${s.backoff?'<span class="backoff-label">-20%</span>':''}</span></td><td><span class="ger-pill">${target?formatGerLevel(target.ger)+' '+renderGerMeter(target.ger):'—'}</span></td><td><span class="set-chip">${Number(s.weight)||0} kg</span></td><td><span class="set-chip ${inRange?'set-performance-ok':below?'set-performance-low':''}">${Number(s.reps)||0}${unit}</span></td></tr>`;}).join(''),del=(readonly||sess._archived)?'':`<button class="btn-icon ghost" style="width:28px;height:28px;font-size:13px;margin-right:2px" onclick="openEditSession(${jsArg(sess.id)})">✏️</button><button class="btn-icon ghost" style="width:28px;height:28px;font-size:13px" onclick="deleteSession(${jsArg(sess.id)})">🗑</button>`,srcBadge=sess._archived?`<span class="session-week-badge">treino anterior</span>`:(homeWid&&sess._wid&&sess._wid!==homeWid)?`<span class="session-week-badge">${esc(sess._wName)}</span>`:'',weekBadge=sess.week?`<span class="session-week-badge">Sem. ${esc(sess.week)}</span>`:'',variantBadge=sess.performedExerciseName&&normalizedName(sess.performedExerciseName)!==normalizedName(e.name)?`<span class="session-week-badge">↺ ${esc(sess.performedExerciseName)}</span>`:'',modeBadge=sess.performedTechniqueMode?`<span class="session-week-badge">${sess.performedTechniqueMode==='myo'?'MP':'NORMAL'}</span>`:'',noteBlock=sess.note?`<div class="session-note"><b>📝 Anotação:</b> ${esc(sess.note)}</div>`:'';return`<div class="session-block"><div class="session-header"><span class="session-date-badge">📅 ${fmt(sess.date)}</span>${weekBadge}${variantBadge}${modeBadge}${srcBadge}<div style="display:flex;align-items:center;gap:6px;margin-left:auto"><span class="session-vol">${time?'Tempo/carga':'Vol'}: ${vol}</span>${del}</div></div><table class="sets-table"><thead><tr><th>#</th><th>Prescrito</th><th>GER</th><th>Carga</th><th>${time?'Tempo':'Feito'}</th></tr></thead><tbody>${rows}</tbody></table>${noteBlock}</div>`;}).join('');}
buildSessions=buildSessionsV102;

const openEditSessionV101=openEditSession;
openEditSession=function(sid){const result=openEditSessionV101.apply(this,arguments);const exercise=getE(EDIT_SESSION_WID,EDIT_SESSION_EID),label=document.getElementById('edit-session-result-label');if(label)label.textContent=exerciseUsesResistedTime(exercise)?'Tempo':'Reps';document.querySelectorAll('#edit-sets-editor .performed-set-row').forEach((row,index)=>{const session=findSessionOwner(sid)?.session,set=session?.sets?.[index];if(set?.backoff){row.dataset.backoff='1';row.classList.add('backoff-row');const target=row.querySelector('.performed-target');if(target)target.innerHTML+='<span class="backoff-label">-20% carga</span>';}});return result;};
const addEditSetRowV101=addEditSetRow;
function renumberEditSetRows(){document.querySelectorAll('#edit-sets-editor .performed-set-row').forEach((row,index)=>{const num=row.querySelector('.set-edit-num');if(num)num.innerHTML=`${index+1}${row.dataset.backoff==='1'?'<span class="backoff-label">BOS</span>':''}`;});EDIT_SET_COUNT=document.querySelectorAll('#edit-sets-editor .performed-set-row').length;}
addEditSetRow=function(weight='',reps='',prescription=null){const before=[...document.querySelectorAll('#edit-sets-editor .performed-set-row')],result=addEditSetRowV101.apply(this,arguments),rows=[...document.querySelectorAll('#edit-sets-editor .performed-set-row')],row=rows.find(item=>!before.includes(item))||rows[rows.length-1],exercise=getE(EDIT_SESSION_WID,EDIT_SESSION_EID),backoff=prescription?.backoff===true;if(row&&exerciseUsesResistedTime(exercise)){row.querySelector('.performed-target').innerHTML=(normalizePrescriptionSet(prescription)?esc(prescribedRangeLabel(normalizePrescriptionSet(prescription)))+' seg':'extra');const input=row.querySelector('[data-f="r"]');input.placeholder='seg';input.setAttribute('aria-label','Tempo resistido em segundos');}if(row&&backoff){row.dataset.backoff='1';row.classList.add('backoff-row');const target=row.querySelector('.performed-target');if(target&&!target.querySelector('.backoff-label'))target.innerHTML+='<span class="backoff-label">-20% carga</span>';}const existingBackoff=document.querySelector('#edit-sets-editor .performed-set-row[data-backoff="1"]');if(row&&!backoff&&existingBackoff&&row!==existingBackoff)existingBackoff.parentNode.insertBefore(row,existingBackoff);renumberEditSetRows();return result;};

onEditSessionWeekChange=function(){const week=Number(document.getElementById('edit-session-week').value)||1,exercise=getE(EDIT_SESSION_WID||CUR_WORKOUT,EDIT_SESSION_EID||CUR_EX);if(!exercise)return;const actual=[...document.querySelectorAll('#edit-sets-editor .performed-set-row')].map(row=>({weight:row.querySelector('[data-f="w"]').value,reps:row.querySelector('[data-f="r"]').value,backoff:row.dataset.backoff==='1'})),rx=resolveWeekPrescription(exercise,week),targets=effectivePrescriptionSets(exercise,rx.sets);EDIT_SET_COUNT=0;document.getElementById('edit-sets-editor').innerHTML='';const count=Math.max(actual.length,targets.length);for(let index=0;index<count;index++){const source=actual[index]||{},target=targets[index]||null;addEditSetRow(source.weight||'',source.reps||'',target);const row=document.querySelector('#edit-sets-editor .performed-set-row:last-child');if(row&&(target?.backoff||source.backoff)){row.dataset.backoff='1';row.classList.add('backoff-row');}}const label=document.getElementById('edit-session-result-label');if(label)label.textContent=exerciseUsesResistedTime(exercise)?'Tempo':'Reps';renderSessionPrescriptionSummary(exercise,week,'edit-session-prescription-summary');};

const workoutPdfHtmlV101=workoutPdfHtml;
workoutPdfHtml=function(workout,studentName){let html=workoutPdfHtmlV101(workout,studentName);for(const exercise of(workout?.exercises||[])){const items=techniqueItemsForExercise(exercise);if(!items.length)continue;const needle=`<h3>${pdfEscape(exercise.name)}</h3>`;const technique=`${needle}<div class="instruction"><b>Técnicas:</b> ${items.map(item=>pdfEscape(item.code+' — '+item.name+(exerciseHasOptionalTechnique(exercise,item.id)?' (opcional)':''))).join(' · ')}</div>`;html=html.replace(needle,technique);}return html.replace(/Team Bulls v10\.1/g,'Team Bulls v10.5').replace(/Team Bulls v10\.2/g,'Team Bulls v10.5').replace(/Team Bulls v10\.3/g,'Team Bulls v10.5');};


// v10.5: writes in the prescription workflow update the in-memory model first.
// Full student reloads are reserved for navigation/recovery, avoiding repeated
// Firestore reads after every exercise save.


async function initApp(){
  if(BOOT_STARTED)return;
  BOOT_STARTED=true;startBootWatchdog();setLoadingMessage('iniciando sistema...');
  try{
    applyAppSettings();
    const restoreGuest=storageGet(OFFLINE_MODE_KEY)==='guest'||storageGet('teamms_offline_pref')==='1';
    if(restoreGuest){
      MODE='local';ACCESS_MODE='local-guest';CURRENT_USER=null;INACTIVE_NAME='';INACTIVE_UID='';
      selectLocalOwner(LOCAL_GUEST_OWNER,!storageGet('teamms_last_user_uid'));
      const eyebrow=document.getElementById('hero-eyebrow');if(eyebrow)eyebrow.textContent='// modo local independente';
      const chip=document.getElementById('user-chip-name');if(chip)chip.textContent='local';
      updateDebugBar();renderHome();showScreen('screen-home');return;
    }
    setLoadingMessage('preparando conexão...');
    const firebaseReady=await withTimeout(ensureFirebaseCore(),6500,'Firebase').catch(()=>false);
    const firebaseUnavailable=!firebaseReady||typeof firebase==='undefined';
    if(firebaseUnavailable){
      MODE='local';ACCESS_MODE='local-guest';LOCAL_OWNER_UID='';LOCAL_DB={workouts:[]};
      bootToAuth('Sem acesso ao servidor. Use sua conta offline já validada, o modo local ou tente novamente.');return;
    }
    const firebaseOK=initFirebase();
    if(firebaseOK&&CFG.firebase.apiKey!=='COLE_AQUI'){
      if(CFG.appCheckSiteKey)await withTimeout(initOptionalAppCheck(),2500,'App Check').catch(()=>false);
      setLoadingMessage('verificando sessão...');startAuthListener();
    }
    else bootToAuth('Firebase não configurado. O modo local continua disponível.');
  }catch(error){
    console.error('Falha na inicialização:',error);
    bootToAuth('O aplicativo encontrou uma falha ao iniciar. Tente corrigir a atualização; seus dados locais foram preservados.');
    window.TeamBullsRecovery?.reveal?.('Falha durante a inicialização. Use “Corrigir atualização” para remover apenas o cache antigo.');
  }
}
// O shell local inicia após o parse. Firebase é carregado sob demanda e não
// impede a tela de acesso ou o modo local de aparecerem.
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initApp,{once:true});
else initApp();
window.addEventListener('pageshow',event=>{
  if(event.persisted&&document.getElementById('screen-loading')?.classList.contains('active'))showScreen('screen-auth');
});

// ── Service Worker e atualização da PWA ──
// A partir da v10.10.9, o registro e a troca de versões são centralizados em
// update_v10_10_9.js. Manter um único gerenciador evita que um arquivo antigo
// volte a registrar um Service Worker obsoleto sobre a versão nova.

/* ══════════════════════════════════════════════════
   TEAM BULLS v10.5 — DIETAS, CICLOS, PLANILHA E DESKTOP DO ALUNO
   Camada compatível com documentos e históricos antigos.
══════════════════════════════════════════════════ */
const DIET_SECTION_DEFS=[
  {key:'importantSupplements',title:'Suplementos importantes'},
  {key:'optionalSupplements',title:'Suplementos opcionais'},
  {key:'hormonalProtocol',title:'Protocolo Hormonal'}
];
let DIET_DOCUMENT={plans:[]};
let DIET_CONTEXT={targetUid:null,trainer:false,local:false};
let CURRENT_DIET_ID='';
let EDIT_DIET_PLAN_ID='';
let EDIT_DIET_SUPPORT_SECTION='';
let EDIT_DIET_SUPPORT_ID='';
let FOOD_OPTIONS_DIET_RETURN='';

function normalizeDietMeal(meal,index=0){
  const raw=meal&&typeof meal==='object'?meal:{};
  return{id:String(raw.id||uid()),time:String(raw.time||'').slice(0,5),name:String(raw.name||('Refeição '+(index+1))).slice(0,100),items:String(raw.items||'').slice(0,5000),notes:String(raw.notes||'').slice(0,2000),doneDates:Array.isArray(raw.doneDates)?raw.doneDates.filter(value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value))).slice(-400):[]};
}
function normalizeDietSupportItem(item,index=0){
  const raw=item&&typeof item==='object'?item:{};
  return{id:String(raw.id||uid()),name:String(raw.name||'').trim().slice(0,120),dose:String(raw.dose||'').trim().slice(0,100),time:String(raw.time||'').trim().slice(0,120),notes:String(raw.notes||'').trim().slice(0,2000),order:Number.isFinite(Number(raw.order))?Math.max(0,Math.trunc(Number(raw.order))):index};
}
function normalizeDietPlan(plan,index=0){
  const raw=plan&&typeof plan==='object'?plan:{};
  const result={id:String(raw.id||uid()),name:String(raw.name||('Dieta '+(index+1))).trim().slice(0,100)||('Dieta '+(index+1)),isActive:raw.isActive===true,order:Number.isFinite(Number(raw.order))?Math.max(0,Math.trunc(Number(raw.order))):index,meals:(Array.isArray(raw.meals)?raw.meals:[]).map(normalizeDietMeal)};
  DIET_SECTION_DEFS.forEach(def=>{result[def.key]=(Array.isArray(raw[def.key])?raw[def.key]:[]).map(normalizeDietSupportItem).sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'pt-BR')).map((item,itemIndex)=>({...item,order:itemIndex}));});
  return result;
}
function normalizeDietDocument(source){
  const raw=source&&typeof source==='object'?source:{};
  let plans=Array.isArray(raw.plans)?raw.plans.map(normalizeDietPlan):[];
  if(!plans.length&&Array.isArray(raw.meals)&&raw.meals.length){
    plans=[normalizeDietPlan({id:'legacy-main-diet',name:'Dieta principal',isActive:true,order:0,meals:raw.meals},0)];
  }
  plans=plans.sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'pt-BR')).map((plan,index)=>({...plan,order:index}));
  if(plans.length&&!plans.some(plan=>plan.isActive))plans[0].isActive=true;
  if(plans.filter(plan=>plan.isActive).length>1){let found=false;plans.forEach(plan=>{if(plan.isActive&&!found)found=true;else if(plan.isActive)plan.isActive=false;});}
  return{plans};
}
function currentDiet(){return DIET_DOCUMENT.plans.find(plan=>String(plan.id)===String(CURRENT_DIET_ID))||null;}
function dietCanEdit(){return DIET_CONTEXT.local||DIET_CONTEXT.trainer;}
function cacheOwnDietDocument(targetUid,documentData){
  if(!targetUid||CURRENT_USER?.uid!==targetUid||CURRENT_USER?.role==='trainer')return;
  try{
    ensureLocalOwner(targetUid);
    LOCAL_DB={...LOCAL_DB,mealPlan:normalizeDietDocument(documentData)};
    storageSet(localKeyFor(),JSON.stringify(LOCAL_DB));
    storageSet('teamms_local_initialized_'+targetUid,'1');
  }catch(error){console.warn('cacheOwnDietDocument',error);}
}
async function loadDietDocument(targetUid=null){
  if(MODE==='local'&&!targetUid)return normalizeDietDocument(LOCAL_DB.mealPlan||{});
  const uidTarget=targetUid||CURRENT_USER?.uid;
  if(!uidTarget)return{plans:[]};
  try{
    const doc=await cloudGet(db.collection('mealPlans').doc(uidTarget),'dietas e suplementos');
    const normalized=normalizeDietDocument(doc.exists?doc.data():{});
    cacheOwnDietDocument(uidTarget,normalized);
    return normalized;
  }catch(error){
    console.error('loadDietDocument',error);
    if(uidTarget===CURRENT_USER?.uid&&LOCAL_DB?.mealPlan)return normalizeDietDocument(LOCAL_DB.mealPlan);
    return{plans:[]};
  }
}
async function persistDietDocument(){
  DIET_DOCUMENT=normalizeDietDocument(DIET_DOCUMENT);
  if(DIET_CONTEXT.local){
    LOCAL_DB.mealPlan=JSON.parse(JSON.stringify(DIET_DOCUMENT));
    if(!localSave())throw new Error('Falha ao salvar a dieta no aparelho.');
    return;
  }
  if(!DIET_CONTEXT.trainer)throw new Error('Somente o treinador pode editar a dieta.');
  const targetUid=DIET_CONTEXT.targetUid;
  if(!targetUid)throw new Error('Aluno não identificado.');
  await cloudWrite(db.collection('mealPlans').doc(targetUid).set({plans:DIET_DOCUMENT.plans,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}),'salvar dieta e suplementos');
}
function dietStatusBadge(plan){return`<span class="protocol-state-badge ${plan.isActive?'active':'inactive'}">${plan.isActive?'● DIETA ATIVA':'○ DESATIVADA'}</span>`;}
function renderDietList(listId,emptyId,trainerMode){
  const list=document.getElementById(listId),empty=document.getElementById(emptyId);if(!list)return;
  const plans=DIET_DOCUMENT.plans;
  if(!plans.length){list.innerHTML='';if(empty)empty.style.display='block';return;}
  if(empty)empty.style.display='none';
  list.innerHTML=plans.map((plan,index)=>{
    const openCall=trainerMode?`openDietDetail(${jsArg(plan.id)},true)`:`openDietDetail(${jsArg(plan.id)},false)`;
    const controls=dietCanEdit()?`<div class="diet-card-controls"><button class="order-btn" ${index===0?'disabled':''} onclick="event.stopPropagation();moveDietPlan(${jsArg(plan.id)},-1)">↑</button><button class="order-btn" ${index===plans.length-1?'disabled':''} onclick="event.stopPropagation();moveDietPlan(${jsArg(plan.id)},1)">↓</button>${plan.isActive?'':`<button class="activate-workout-btn" onclick="event.stopPropagation();activateDietPlan(${jsArg(plan.id)})">ATIVAR</button>`}<button class="btn-icon ghost" onclick="event.stopPropagation();openEditDietModal(${jsArg(plan.id)})">✎</button></div>`:'';
    return`<div class="diet-folder-card ${plan.isActive?'is-active':'is-inactive'}" onclick="${openCall}"><div class="diet-folder-main">${dietStatusBadge(plan)}<div class="diet-folder-name">${esc(plan.name)}</div><div class="diet-folder-meta">${plan.meals.length} ${plan.meals.length===1?'refeição':'refeições'} · suplementos e protocolo</div></div>${controls}<span class="exercise-row-arrow">›</span></div>`;
  }).join('');
}
async function openMeals(){
  const navigation=beginAsyncNavigation(),cloud=MODE==='cloud',targetUid=cloud?CURRENT_USER?.uid:null;
  DIET_CONTEXT={targetUid,trainer:false,local:!cloud};
  DIET_DOCUMENT=await loadDietDocument();
  if(!isNavigationCurrent(navigation))return;
  document.getElementById('meals-readonly-note').style.display=cloud?'block':'none';
  document.getElementById('meals-empty-hint').textContent=cloud?'Seu treinador ainda não montou sua dieta':'Toque em + NOVA DIETA para começar';
  renderDietList('meals-list','meals-empty',false);showScreen('screen-meals',navigation);
}
async function openTsMeals(){
  if(!VIEW_STUDENT)return;
  const navigation=beginAsyncNavigation(),targetUid=VIEW_STUDENT.uid;
  DIET_CONTEXT={targetUid,trainer:true,local:false};
  DIET_DOCUMENT=await loadDietDocument(targetUid);
  if(!isNavigationCurrent(navigation)||VIEW_STUDENT?.uid!==targetUid)return;
  renderDietList('ts-meals-list','ts-meals-empty',true);showScreen('screen-ts-meals',navigation);
}
async function openDietDetail(id,trainerMode=false){
  const plan=DIET_DOCUMENT.plans.find(item=>String(item.id)===String(id));if(!plan)return;
  CURRENT_DIET_ID=plan.id;
  const targetUid=DIET_CONTEXT.targetUid;
  const completions=MODE==='cloud'&&targetUid?await fetchCompletionsToday(targetUid):new Set();
  MEAL_COMPLETIONS_TODAY=completions;
  MEAL_PLAN_CACHE.meals=plan.meals;
  if(trainerMode){
    MEAL_CTX={listId:'ts-diet-meals-list',emptyId:'ts-diet-meals-empty',canEditContent:true,canToggleDone:false,targetUid};
    document.getElementById('ts-diet-detail-title').textContent=plan.name.toUpperCase();
    document.getElementById('ts-diet-detail-status').innerHTML=dietStatusBadge(plan)+(plan.isActive?'<span>Plano atual do aluno</span>':'<span>Dieta anterior preservada</span>');
    renderMealsList();renderDietSupportTables('ts-diet-support-tables',plan,true);showScreen('screen-ts-diet-detail');
  }else{
    const canEdit=DIET_CONTEXT.local;
    MEAL_CTX={listId:'diet-meals-list',emptyId:'diet-meals-empty',canEditContent:canEdit,canToggleDone:true,targetUid};
    document.getElementById('diet-detail-title').textContent=plan.name.toUpperCase();
    document.getElementById('diet-detail-status').innerHTML=dietStatusBadge(plan)+(plan.isActive?'<span>Siga este plano como dieta atual</span>':'<span>Dieta anterior disponível para consulta</span>');
    renderMealsList();renderDietSupportTables('diet-support-tables',plan,canEdit);showScreen('screen-diet-detail');
  }
}
function goDietList(){openMeals();}
function goTsDietList(){openTsMeals();}
function openAddDietModal(){if(!dietCanEdit())return;EDIT_DIET_PLAN_ID='';document.getElementById('modal-diet-title').textContent='Nova dieta';document.getElementById('input-diet-name').value='';document.getElementById('input-diet-active').value=DIET_DOCUMENT.plans.length?'false':'true';document.getElementById('btn-delete-diet').style.display='none';openModal('modal-diet');}
function openEditDietModal(id=CURRENT_DIET_ID){if(!dietCanEdit())return;const plan=DIET_DOCUMENT.plans.find(item=>String(item.id)===String(id));if(!plan)return;EDIT_DIET_PLAN_ID=plan.id;document.getElementById('modal-diet-title').textContent='Editar dieta';document.getElementById('input-diet-name').value=plan.name;document.getElementById('input-diet-active').value=String(plan.isActive);document.getElementById('btn-delete-diet').style.display='block';openModal('modal-diet');}
async function saveDietPlan(){
  if(!dietCanEdit()||!beginAction('save-diet','modal-diet'))return;
  const snapshot=JSON.stringify(DIET_DOCUMENT);
  try{
    const name=document.getElementById('input-diet-name').value.normalize('NFKC').trim().slice(0,100);if(!name)throw new Error('Informe o nome da dieta.');
    const active=document.getElementById('input-diet-active').value==='true';
    let plan=DIET_DOCUMENT.plans.find(item=>item.id===EDIT_DIET_PLAN_ID);
    if(plan){plan.name=name;plan.isActive=active;}else{plan=normalizeDietPlan({id:uid(),name,isActive:active,order:DIET_DOCUMENT.plans.length,meals:[]},DIET_DOCUMENT.plans.length);DIET_DOCUMENT.plans.push(plan);EDIT_DIET_PLAN_ID=plan.id;}
    if(active)DIET_DOCUMENT.plans.forEach(item=>{if(item.id!==plan.id)item.isActive=false;});
    DIET_DOCUMENT=normalizeDietDocument(DIET_DOCUMENT);await persistDietDocument();closeModal('modal-diet');
    const trainer=DIET_CONTEXT.trainer;renderDietList(trainer?'ts-meals-list':'meals-list',trainer?'ts-meals-empty':'meals-empty',trainer);showToast('✓ Dieta salva');
  }catch(error){DIET_DOCUMENT=normalizeDietDocument(JSON.parse(snapshot));alert(cloudWriteError(error,'salvar a dieta'));}
  finally{endAction('save-diet','modal-diet');}
}
function deleteCurrentDiet(){
  const id=EDIT_DIET_PLAN_ID;if(!id||!dietCanEdit())return;closeModal('modal-diet');showConfirm('Excluir dieta','Excluir esta dieta, refeições e tabelas de suplementos? Os registros de refeições concluídas permanecem no histórico.',async()=>{const before=JSON.stringify(DIET_DOCUMENT);try{DIET_DOCUMENT.plans=DIET_DOCUMENT.plans.filter(item=>item.id!==id);DIET_DOCUMENT=normalizeDietDocument(DIET_DOCUMENT);await persistDietDocument();CURRENT_DIET_ID='';const trainer=DIET_CONTEXT.trainer;renderDietList(trainer?'ts-meals-list':'meals-list',trainer?'ts-meals-empty':'meals-empty',trainer);if(trainer)showScreen('screen-ts-meals');else showScreen('screen-meals');}catch(error){DIET_DOCUMENT=normalizeDietDocument(JSON.parse(before));alert(cloudWriteError(error,'excluir a dieta'));}});
}
async function moveDietPlan(id,delta){if(!dietCanEdit())return;const plans=DIET_DOCUMENT.plans,index=plans.findIndex(item=>item.id===id),target=index+delta;if(index<0||target<0||target>=plans.length)return;[plans[index],plans[target]]=[plans[target],plans[index]];plans.forEach((item,i)=>item.order=i);try{await persistDietDocument();renderDietList(DIET_CONTEXT.trainer?'ts-meals-list':'meals-list',DIET_CONTEXT.trainer?'ts-meals-empty':'meals-empty',DIET_CONTEXT.trainer);}catch(error){showToast(cloudWriteError(error,'alterar a ordem das dietas'),true);}}
async function activateDietPlan(id){if(!dietCanEdit())return;DIET_DOCUMENT.plans.forEach(plan=>plan.isActive=plan.id===id);try{await persistDietDocument();renderDietList(DIET_CONTEXT.trainer?'ts-meals-list':'meals-list',DIET_CONTEXT.trainer?'ts-meals-empty':'meals-empty',DIET_CONTEXT.trainer);}catch(error){showToast(cloudWriteError(error,'ativar a dieta'),true);}}
function renderDietSupportTables(hostId,plan,canEdit){
  const host=document.getElementById(hostId);if(!host)return;
  host.innerHTML=DIET_SECTION_DEFS.map(def=>{
    const items=plan[def.key]||[];
    const rows=items.length?items.map(item=>`<tr${canEdit?` onclick="openEditDietSupportItem(${jsArg(def.key)},${jsArg(item.id)})" class="editable-row"`:''}><td>${esc(item.name)}</td><td>${esc(item.dose||'—')}</td><td>${esc(item.time||'—')}</td><td>${esc(item.notes||'—')}</td></tr>`).join(''):`<tr><td colspan="4" class="diet-table-empty">Nenhum item cadastrado</td></tr>`;
    return`<section class="diet-support-section"><div class="section-header"><span class="section-label">${esc(def.title)}</span>${canEdit?`<button class="diet-table-add" onclick="openAddDietSupportItem(${jsArg(def.key)})">+ ADICIONAR</button>`:''}</div><div class="diet-table-scroll"><table class="diet-support-table"><thead><tr><th>Item</th><th>Dose / quantidade</th><th>Horário / frequência</th><th>Observações</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }).join('');
}
function openAddDietSupportItem(section){if(!dietCanEdit()||!currentDiet())return;EDIT_DIET_SUPPORT_SECTION=section;EDIT_DIET_SUPPORT_ID='';const def=DIET_SECTION_DEFS.find(item=>item.key===section);document.getElementById('modal-diet-support-title').textContent='Novo item — '+(def?.title||'Tabela');['name','dose','time','notes'].forEach(field=>document.getElementById('input-diet-support-'+field).value='');document.getElementById('btn-delete-diet-support').style.display='none';openModal('modal-diet-support');}
function openEditDietSupportItem(section,id){if(!dietCanEdit()||!currentDiet())return;const item=(currentDiet()[section]||[]).find(entry=>entry.id===id);if(!item)return;EDIT_DIET_SUPPORT_SECTION=section;EDIT_DIET_SUPPORT_ID=id;const def=DIET_SECTION_DEFS.find(entry=>entry.key===section);document.getElementById('modal-diet-support-title').textContent='Editar — '+(def?.title||'Tabela');document.getElementById('input-diet-support-name').value=item.name;document.getElementById('input-diet-support-dose').value=item.dose;document.getElementById('input-diet-support-time').value=item.time;document.getElementById('input-diet-support-notes').value=item.notes;document.getElementById('btn-delete-diet-support').style.display='block';openModal('modal-diet-support');}
async function saveDietSupportItem(){
  const plan=currentDiet(),section=EDIT_DIET_SUPPORT_SECTION;if(!plan||!dietCanEdit()||!DIET_SECTION_DEFS.some(def=>def.key===section)||!beginAction('save-diet-support','modal-diet-support'))return;
  const before=JSON.stringify(DIET_DOCUMENT);
  try{
    const name=document.getElementById('input-diet-support-name').value.normalize('NFKC').trim().slice(0,120);if(!name)throw new Error('Informe o nome do item.');
    const data={name,dose:document.getElementById('input-diet-support-dose').value.normalize('NFKC').trim().slice(0,100),time:document.getElementById('input-diet-support-time').value.normalize('NFKC').trim().slice(0,120),notes:document.getElementById('input-diet-support-notes').value.normalize('NFKC').trim().slice(0,2000)};
    let item=(plan[section]||[]).find(entry=>entry.id===EDIT_DIET_SUPPORT_ID);if(item)Object.assign(item,data);else{plan[section]=plan[section]||[];plan[section].push({...data,id:uid(),order:plan[section].length});}
    await persistDietDocument();closeModal('modal-diet-support');renderDietSupportTables(DIET_CONTEXT.trainer?'ts-diet-support-tables':'diet-support-tables',plan,true);showToast('✓ Item salvo');
  }catch(error){DIET_DOCUMENT=normalizeDietDocument(JSON.parse(before));alert(cloudWriteError(error,'salvar o item'));}
  finally{endAction('save-diet-support','modal-diet-support');}
}
function deleteDietSupportItem(){const plan=currentDiet(),section=EDIT_DIET_SUPPORT_SECTION,id=EDIT_DIET_SUPPORT_ID;if(!plan||!id||!dietCanEdit())return;closeModal('modal-diet-support');showConfirm('Excluir item','Remover este item da tabela?',async()=>{const before=JSON.stringify(DIET_DOCUMENT);try{plan[section]=(plan[section]||[]).filter(item=>item.id!==id);await persistDietDocument();renderDietSupportTables(DIET_CONTEXT.trainer?'ts-diet-support-tables':'diet-support-tables',plan,true);}catch(error){DIET_DOCUMENT=normalizeDietDocument(JSON.parse(before));alert(cloudWriteError(error,'excluir o item'));}});}

// As rotinas antigas de refeição continuam sendo usadas dentro da dieta atual,
// mas a persistência passa a salvar toda a pasta da dieta e suas tabelas.
persistMealPlan=async function(){const plan=currentDiet();if(!plan)throw new Error('Abra uma dieta antes de editar as refeições.');plan.meals=MEAL_PLAN_CACHE.meals;await persistDietDocument();};

function openFoodOptionsFromDiet(){
  FOOD_OPTIONS_DIET_RETURN=DIET_CONTEXT.trainer?'trainer':'student';
  FOOD_OPTIONS_FROM=DIET_CONTEXT.trainer?'diet-trainer':'diet-student';
  showScreen('screen-food-options');
  document.getElementById('food-options-content').innerHTML='<div class="empty-state"><div class="empty-hint">Carregando...</div></div>';
  loadFoodOptions().then(renderFoodOptions);
}
const V102_GO_BACK_FOOD=goBackFromFoodOptions;
goBackFromFoodOptions=function(){if(FOOD_OPTIONS_FROM==='diet-trainer'){openDietDetail(CURRENT_DIET_ID,true);return;}if(FOOD_OPTIONS_FROM==='diet-student'){openDietDetail(CURRENT_DIET_ID,false);return;}V102_GO_BACK_FOOD();};

// Novas telas e FABs.
const V102_SHOW_SCREEN=showScreen;
showScreen=function(id,expectedToken=null){
  const result=V102_SHOW_SCREEN(id,expectedToken);if(!result)return result;
  const set=(elementId,visible)=>{const element=document.getElementById(elementId);if(element)element.style.display=visible?'flex':'none';};
  set('fab-diet-meal',id==='screen-diet-detail'&&DIET_CONTEXT.local);
  set('fab-ts-diet-meal',id==='screen-ts-diet-detail'&&DIET_CONTEXT.trainer);
  return result;
};

/* ── REGISTROS: abrir exercício e voltar ao calendário ─────────────── */
let CALENDAR_EXERCISE_RETURN=null;
let CALENDAR_OPENING_EXERCISE=false;
getCalendarMonthData=function(year,month){
  const days={},prefix=year+'-'+String(month+1).padStart(2,'0');
  for(const workout of getWorkouts())for(const exercise of(workout.exercises||[]))for(const session of(exercise.sessions||[])){
    if(!String(session.date||'').startsWith(prefix))continue;
    if(!days[session.date])days[session.date]=[];
    days[session.date].push({workoutId:workout.id,exerciseId:exercise.id,sessionId:session.id,dayName:exercise.dayName||'Treino geral',exerciseName:exercise.name,workoutName:workout.name,workoutColor:workout.color,sets:Array.isArray(session.sets)?session.sets:[]});
  }
  return days;
};
openCalDay=function(dateStr){
  const entries=(getCalendarMonthData(CAL_YEAR,CAL_MONTH)[dateStr]||[]);
  document.getElementById('cal-day-modal-title').textContent=fmt(dateStr);
  document.getElementById('cal-day-modal-body').innerHTML=entries.map(entry=>{const volume=entry.sets.reduce((sum,set)=>sum+(Number(set.weight)||0)*(Number(set.reps)||0),0);return`<button class="cal-day-entry cal-day-entry-link" style="--wcard-color:${esc(entry.workoutColor||'var(--accent)')}" onclick="openExerciseFromCalendar(${jsArg(entry.workoutId)},${jsArg(entry.exerciseId)},${jsArg(entry.dayName)},${jsArg(dateStr)})"><div class="cal-day-entry-top"><span class="cal-day-entry-ex">${esc(entry.exerciseName)}</span><span class="cal-day-entry-w">${esc(entry.workoutName)}</span></div><div class="cal-day-entry-meta">${entry.sets.length} séries · Vol: ${volume.toLocaleString('pt-BR')} kg · abrir exercício ›</div></button>`;}).join('');
  openModal('modal-cal-day');
};
const V102_OPEN_EXERCISE=openExercise;
openExercise=function(eid){if(!CALENDAR_OPENING_EXERCISE)CALENDAR_EXERCISE_RETURN=null;return V102_OPEN_EXERCISE(eid);};
function openExerciseFromCalendar(workoutId,exerciseId,dayName,dateStr){
  closeModal('modal-cal-day');CUR_WORKOUT=workoutId;CUR_DAY=dayName;CALENDAR_EXERCISE_RETURN={year:CAL_YEAR,month:CAL_MONTH,date:dateStr};CALENDAR_OPENING_EXERCISE=true;try{V102_OPEN_EXERCISE(exerciseId);}finally{CALENDAR_OPENING_EXERCISE=false;}
}
const V102_GO_DAY=goDay;
goDay=function(){if(CALENDAR_EXERCISE_RETURN){CAL_YEAR=CALENDAR_EXERCISE_RETURN.year;CAL_MONTH=CALENDAR_EXERCISE_RETURN.month;CALENDAR_EXERCISE_RETURN=null;renderCalendar();showScreen('screen-calendar');loadWeeklyCheckinState().catch(()=>{});return;}V102_GO_DAY();};

/* ── RELATÓRIO SEMANAL: perguntas + seis fotos ───────────────────── */
let WEEKLY_CHECKIN_SCHEDULE=null;
let WEEKLY_CHECKINS=[];
let WEEKLY_CHECKIN_REQUEST=null;
let WEEKLY_CHECKIN_FILES=Array(6).fill(null);
let WEEKLY_CHECKIN_PREVIEW_URLS=Array(6).fill('');
let WEEKLY_CHECKIN_STATE_UID='';
let WEEKLY_CHECKIN_LOAD_PROMISE=null;
let TRAINER_CHECKIN_SCHEDULE=null;
const CHECKIN_POSES=['Frente','Costas','Lado direito','Lado esquerdo','Frente contraída','Costas contraída'];
function addDaysIso(dateString,days){const parts=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString||''));if(!parts)return today();const date=new Date(Number(parts[1]),Number(parts[2])-1,Number(parts[3]),12);date.setDate(date.getDate()+Number(days||0));return`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function validIsoDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''));}
function checkinRequestKey(kind,dueDate,id=''){return kind==='manual'?'manual:'+String(id||dueDate):'scheduled:'+String(dueDate);}
function computeCheckinRequest(schedule,checkins){
  if(!schedule||!validIsoDate(schedule.nextDueDate))return null;
  const completed=new Set((checkins||[]).map(item=>String(item.requestKey||'')));
  if(schedule.extraRequestId&&!completed.has(checkinRequestKey('manual',schedule.extraRequestedAt,schedule.extraRequestId))){return{kind:'manual',requestId:String(schedule.extraRequestId),dueDate:String(schedule.extraRequestedAt||today()),requestKey:checkinRequestKey('manual',schedule.extraRequestedAt,schedule.extraRequestId),pending:true};}
  const interval=Math.max(1,Math.min(31,Number(schedule.intervalDays)||7));let due=String(schedule.nextDueDate);let guard=0;
  while(completed.has(checkinRequestKey('scheduled',due))&&guard++<520)due=addDaysIso(due,interval);
  return{kind:'scheduled',requestId:'',dueDate:due,requestKey:checkinRequestKey('scheduled',due),pending:due<=today()};
}
async function fetchWeeklyCheckins(studentUid){
  if(!studentUid||MODE!=='cloud')return[];
  try{const snap=await cloudGet(db.collection('weeklyCheckins').where('studentId','==',studentUid),'relatórios semanais');const list=snap.docs.map(doc=>({...doc.data(),id:doc.id}));return list.sort((a,b)=>String(b.submittedDate||'').localeCompare(String(a.submittedDate||''))||String(b.id).localeCompare(String(a.id)));}catch(error){console.error('fetchWeeklyCheckins',error);return[];}
}
async function loadWeeklyCheckinState(force=false){
  const studentUid=CURRENT_USER?.role==='student'?CURRENT_USER.uid:'';
  if(MODE!=='cloud'||!studentUid)return null;
  if(WEEKLY_CHECKIN_LOAD_PROMISE&&!force)return WEEKLY_CHECKIN_LOAD_PROMISE;
  WEEKLY_CHECKIN_LOAD_PROMISE=(async()=>{
    try{
      const [scheduleDoc,checkins]=await Promise.all([cloudGet(db.collection('checkinSchedules').doc(studentUid),'programação do relatório'),fetchWeeklyCheckins(studentUid)]);
      if(CURRENT_USER?.uid!==studentUid)return null;
      WEEKLY_CHECKIN_SCHEDULE=scheduleDoc.exists?{...scheduleDoc.data(),studentId:studentUid}:null;WEEKLY_CHECKINS=checkins;WEEKLY_CHECKIN_REQUEST=computeCheckinRequest(WEEKLY_CHECKIN_SCHEDULE,WEEKLY_CHECKINS);WEEKLY_CHECKIN_STATE_UID=studentUid;renderWeeklyCheckinCard();return WEEKLY_CHECKIN_REQUEST;
    }catch(error){console.error('loadWeeklyCheckinState',error);renderWeeklyCheckinCard(true);return null;}
    finally{WEEKLY_CHECKIN_LOAD_PROMISE=null;}
  })();
  return WEEKLY_CHECKIN_LOAD_PROMISE;
}
function renderWeeklyCheckinCard(loadError=false){
  const card=document.getElementById('weekly-checkin-card'),homeBanner=document.getElementById('weekly-checkin-home-banner');if(!card)return;
  card.style.display=MODE==='cloud'&&CURRENT_USER?.role==='student'?'block':'none';
  if(MODE!=='cloud'||CURRENT_USER?.role!=='student'){if(homeBanner)homeBanner.style.display='none';return;}
  const title=document.getElementById('weekly-checkin-title'),status=document.getElementById('weekly-checkin-status'),meta=document.getElementById('weekly-checkin-meta'),action=document.getElementById('weekly-checkin-action');
  if(loadError){title.textContent='Relatório + 6 fotos';status.textContent='OFFLINE';status.className='quest-status pending';meta.textContent='Não foi possível consultar a programação agora. Tente novamente quando a conexão estabilizar.';action.disabled=true;if(homeBanner)homeBanner.style.display='none';return;}
  if(!WEEKLY_CHECKIN_SCHEDULE||!WEEKLY_CHECKIN_REQUEST){title.textContent='Aguardando programação';status.textContent='NÃO PROGRAMADO';status.className='quest-status';meta.textContent='O treinador ainda não definiu a primeira data do relatório semanal.';action.disabled=true;if(homeBanner)homeBanner.style.display='none';return;}
  const request=WEEKLY_CHECKIN_REQUEST;title.textContent=request.kind==='manual'?'Relatório extra solicitado':'Relatório + 6 fotos';status.textContent=request.pending?'PENDENTE':'AGENDADO';status.className='quest-status '+(request.pending?'pending':'answered');meta.textContent=request.kind==='manual'?`Solicitação extra feita em ${fmt(request.dueDate)}.`:`Próxima entrega: ${fmt(request.dueDate)} · frequência de 7 dias.`;action.disabled=!request.pending;action.textContent=request.pending?'ENVIAR RELATÓRIO E 6 FOTOS':'AGUARDANDO A DATA';
  if(homeBanner){homeBanner.style.display=request.pending?'block':'none';document.getElementById('weekly-checkin-home-text').textContent=request.kind==='manual'?'Seu treinador solicitou um relatório extra com todas as perguntas e seis fotos obrigatórias.':`Seu relatório semanal de ${fmt(request.dueDate)} está pendente.`;}
}
const V102_OPEN_CALENDAR=openCalendar;
openCalendar=function(){V102_OPEN_CALENDAR();loadWeeklyCheckinState(true).catch(()=>{});};
const V102_RENDER_HOME=renderHome;
renderHome=function(){V102_RENDER_HOME();if(MODE==='cloud'&&CURRENT_USER?.role==='student')runWhenIdle(()=>loadWeeklyCheckinState(false),1800);else{const banner=document.getElementById('weekly-checkin-home-banner');if(banner)banner.style.display='none';}};
function buildWeeklyCheckinQuestions(){
  const result=buildDefaultQuestionnaire();const filtered=[],sectionAt={};
  result.questions.forEach((question,index)=>{if(/envie fotos/i.test(question))return;if(result.sectionAt[index])sectionAt[filtered.length]=result.sectionAt[index];filtered.push(question);});
  return{questions:filtered,sectionAt};
}
function openWeeklyCheckinModal(){
  if(!window.TeamBullsWeeklyReportIntegrity?.canOpenForm?.()){showToast('O relatório ainda está carregando. Aguarde e tente novamente.',true);return;}
  if(MODE!=='cloud'||CURRENT_USER?.role!=='student'){alert('O relatório semanal exige login ativo.');return;}
  if(!WEEKLY_CHECKIN_REQUEST){loadWeeklyCheckinState(true).then(request=>{if(request)openWeeklyCheckinModal();else alert('Seu treinador ainda não programou o relatório semanal.');});return;}
  const request=WEEKLY_CHECKIN_REQUEST,{questions,sectionAt}=buildWeeklyCheckinQuestions();
  document.getElementById('weekly-checkin-modal-due').textContent=(request.kind==='manual'?'Solicitação extra':'Entrega programada')+' · '+fmt(request.dueDate)+' · exatamente 6 fotos';
  document.getElementById('weekly-checkin-weight').value='';
  document.getElementById('weekly-checkin-questions').innerHTML=questions.map((question,index)=>`${sectionAt[index]?`<div class="quest-section-title">${esc(sectionAt[index])}</div>`:''}<div class="quest-answer-item"><label>${index+1}. ${esc(question)}</label><textarea class="form-input" data-weekly-question="${index}" required aria-required="true" maxlength="5000" rows="2"></textarea></div>`).join('');
  clearWeeklyCheckinPreviews();WEEKLY_CHECKIN_FILES=Array(6).fill(null);for(let i=0;i<6;i++){const input=document.getElementById('weekly-photo-'+i),preview=document.getElementById('weekly-photo-preview-'+i);if(input)input.value='';if(preview){preview.removeAttribute('src');preview.classList.remove('active');}}
  openModal('modal-weekly-checkin');
}
function clearWeeklyCheckinPreviews(){
  WEEKLY_CHECKIN_PREVIEW_URLS.forEach(url=>{if(url)try{URL.revokeObjectURL(url);}catch(error){}});
  WEEKLY_CHECKIN_PREVIEW_URLS=Array(6).fill('');
}
function previewWeeklyCheckinPhoto(index,event){
  const file=event.target.files?.[0]||null;if(!file)return;
  if(!String(file.type||'').startsWith('image/')){alert('Escolha uma imagem válida.');event.target.value='';return;}
  if(WEEKLY_CHECKIN_PREVIEW_URLS[index])try{URL.revokeObjectURL(WEEKLY_CHECKIN_PREVIEW_URLS[index]);}catch(error){}
  WEEKLY_CHECKIN_FILES[index]=file;
  const preview=document.getElementById('weekly-photo-preview-'+index),url=URL.createObjectURL(file);WEEKLY_CHECKIN_PREVIEW_URLS[index]=url;
  if(preview){preview.src=url;preview.classList.add('active');}
}
function weeklyCheckinDocId(studentUid,requestKey){return stableEntityId('weekly-checkin',studentUid,requestKey).slice(0,180);}
async function submitWeeklyCheckin(){
  const request=WEEKLY_CHECKIN_REQUEST,studentUid=CURRENT_USER?.uid;if(!request||!studentUid||CURRENT_USER?.role!=='student')return;
  const weight=Number(String(document.getElementById('weekly-checkin-weight').value||'').replace(',','.'));if(!Number.isFinite(weight)||weight<20||weight>500){alert('Informe um peso válido entre 20 e 500 kg.');return;}
  const areas=[...document.querySelectorAll('[data-weekly-question]')],answers=areas.map(area=>area.value.normalize('NFKC').trim());if(answers.some(answer=>!answer)){alert('Responda todas as perguntas do relatório semanal.');return;}
  if(WEEKLY_CHECKIN_FILES.some(file=>!(file instanceof File))){alert('Envie obrigatoriamente as seis fotos: frente, costas, lado direito, lado esquerdo, frente contraída e costas contraída.');return;}
  if(!beginAction('weekly-checkin-submit','modal-weekly-checkin'))return;
  const {questions,sectionAt}=buildWeeklyCheckinQuestions(),checkinId=weeklyCheckinDocId(studentUid,request.requestKey),photoIds=[],photoWrites=[];const createdPaths=[];
  try{
    const checkinRef=db.collection('weeklyCheckins').doc(checkinId),existingCheckin=await cloudGet(checkinRef,'verificar relatório');if(existingCheckin.exists)throw new Error('Este relatório já foi enviado. Atualize a página para ver o histórico.');
    for(let index=0;index<6;index++){
      showToast('Preparando foto '+(index+1)+' de 6...');
      const photoId=(checkinId+'-p'+(index+1)).slice(0,190),photoRef=db.collection('progressPhotos').doc(photoId);photoIds.push(photoId);
      const variants=await buildProgressPhotoVariants(WEEKLY_CHECKIN_FILES[index]),photoPath=await uploadCloudPhoto('progressPhotos',studentUid,photoId,variants.full);if(photoPath)createdPaths.push(photoPath);
      const thumbPath=photoPath?await uploadCloudPhoto('progressPhotoThumbs',studentUid,photoId,variants.thumb):'';if(thumbPath)createdPaths.push(thumbPath);
      const payload={userId:studentUid,date:today(),weight:Math.round(weight*10)/10,checkinId,pose:CHECKIN_POSES[index],createdAt:firebase.firestore.FieldValue.serverTimestamp()};if(photoPath){payload.photoPath=photoPath;if(thumbPath)payload.thumbPath=thumbPath;}else payload.dataUrl=variants.full;
      photoWrites.push({ref:photoRef,payload});
    }
    const checkinPayload={studentId:studentUid,requestKey:request.requestKey,requestKind:request.kind,dueDate:request.dueDate,submittedDate:today(),weight:Math.round(weight*10)/10,questions,sectionAt,answers,photoIds,createdAt:firebase.firestore.FieldValue.serverTimestamp()};
    const batch=db.batch();photoWrites.forEach(write=>batch.set(write.ref,write.payload));batch.set(checkinRef,checkinPayload);
    try{await cloudWrite(batch.commit(),'enviar relatório semanal e seis fotos');}
    catch(error){
      const verified=await cloudGet(checkinRef,'confirmar relatório semanal').catch(()=>null);
      if(!verified?.exists){await Promise.allSettled(createdPaths.map(path=>deleteCloudPhoto(path)));throw error;}
    }
    clearWeeklyCheckinPreviews();WEEKLY_CHECKIN_FILES=Array(6).fill(null);closeModal('modal-weekly-checkin');showToast('✓ Relatório semanal enviado com todas as respostas e 6 fotos');await loadWeeklyCheckinState(true);renderCalendar();
  }catch(error){await Promise.allSettled(createdPaths.map(path=>deleteCloudPhoto(path)));alert(cloudWriteError(error,'enviar o relatório semanal'));}
  finally{endAction('weekly-checkin-submit','modal-weekly-checkin');}
}
triggerPhotoUpload=function(){openWeeklyCheckinModal();};

async function loadTrainerCheckinSchedule(studentUid){
  if(!studentUid||CURRENT_USER?.role!=='trainer')return;
  try{
    const [doc,checkins]=await Promise.all([cloudGet(db.collection('checkinSchedules').doc(studentUid),'programação do relatório'),fetchWeeklyCheckins(studentUid)]);
    if(VIEW_STUDENT?.uid!==studentUid)return;
    TRAINER_CHECKIN_SCHEDULE=doc.exists?{...doc.data(),studentId:studentUid}:{studentId:studentUid,nextDueDate:addDaysIso(today(),7),intervalDays:7,extraRequestId:'',extraRequestedAt:''};
    document.getElementById('trainer-checkin-date').value=validIsoDate(TRAINER_CHECKIN_SCHEDULE.nextDueDate)?TRAINER_CHECKIN_SCHEDULE.nextDueDate:addDaysIso(today(),7);document.getElementById('trainer-checkin-interval').value='7';
    const state=document.getElementById('trainer-checkin-state'),help=document.getElementById('trainer-checkin-help');state.textContent=doc.exists?'PROGRAMADO':'NÃO SALVO';state.className='quest-status '+(doc.exists?'answered':'pending');const last=checkins[0];help.textContent=last?`Último relatório: ${fmt(last.submittedDate||last.dueDate)}. A próxima data pode ser alterada quando necessário.`:'Nenhum relatório recebido ainda. Salve a primeira data para iniciar a cobrança semanal.';
  }catch(error){document.getElementById('trainer-checkin-state').textContent='ERRO';document.getElementById('trainer-checkin-help').textContent='Não foi possível carregar a programação. Tente novamente.';}
}
const V102_RENDER_TRAINER_STUDENT=renderTrainerStudent;
renderTrainerStudent=async function(student){await V102_RENDER_TRAINER_STUDENT(student);if(student&&VIEW_STUDENT?.uid===student.uid)await loadTrainerCheckinSchedule(student.uid);};
async function saveTrainerCheckinSchedule(){
  const studentUid=VIEW_STUDENT?.uid,date=document.getElementById('trainer-checkin-date').value;if(!studentUid||CURRENT_USER?.role!=='trainer')return;if(!validIsoDate(date)){alert('Escolha uma data válida.');return;}
  if(!beginAction('save-checkin-schedule'))return;
  try{const previous=TRAINER_CHECKIN_SCHEDULE||{};await cloudWrite(db.collection('checkinSchedules').doc(studentUid).set({studentId:studentUid,nextDueDate:date,intervalDays:7,extraRequestId:String(previous.extraRequestId||''),extraRequestedAt:String(previous.extraRequestedAt||''),updatedBy:CURRENT_USER.uid,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}),'salvar programação do relatório');showToast('✓ Relatório semanal programado');await loadTrainerCheckinSchedule(studentUid);}catch(error){alert(cloudWriteError(error,'salvar a programação'));}finally{endAction('save-checkin-schedule');}
}
async function requestExtraWeeklyCheckin(){
  const studentUid=VIEW_STUDENT?.uid;if(!studentUid||CURRENT_USER?.role!=='trainer')return;showConfirm('Pedir relatório extra','Solicitar agora um relatório completo com seis fotos obrigatórias?',async()=>{if(!beginAction('request-extra-checkin'))return;try{const id=uid();await cloudWrite(db.collection('checkinSchedules').doc(studentUid).set({studentId:studentUid,nextDueDate:document.getElementById('trainer-checkin-date').value||addDaysIso(today(),7),intervalDays:7,extraRequestId:id,extraRequestedAt:today(),updatedBy:CURRENT_USER.uid,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}),'pedir relatório extra');showToast('✓ Solicitação extra enviada');await loadTrainerCheckinSchedule(studentUid);}catch(error){alert(cloudWriteError(error,'pedir o relatório extra'));}finally{endAction('request-extra-checkin');}});
}
function renderWeeklyCheckinHistory(items,listId){
  const list=document.getElementById(listId);if(!list)return;if(!items.length){list.innerHTML='<div class="no-data-inline">Nenhum relatório semanal enviado.</div>';return;}
  list.innerHTML=items.map(item=>{const count=Array.isArray(item.photoIds)?item.photoIds.length:6;return`<button class="weekly-checkin-history-card" onclick="viewWeeklyCheckin(${jsArg(item.id)})"><div><span>${esc(fmt(item.submittedDate||item.dueDate))}</span><strong>${item.requestKind==='manual'?'Relatório extra':'Relatório semanal'}</strong><small>${Number(item.weight)>0?esc(Number(item.weight).toLocaleString('pt-BR',{maximumFractionDigits:1}))+' kg · ':''}${count} fotos</small></div><span class="exercise-row-arrow">›</span></button>`;}).join('');
}
const V102_OPEN_TS_QUEST=openTsQuestionnaires;
openTsQuestionnaires=async function(){await V102_OPEN_TS_QUEST();if(VIEW_STUDENT){const checkins=await fetchWeeklyCheckins(VIEW_STUDENT.uid);WEEKLY_CHECKINS=checkins;renderWeeklyCheckinHistory(checkins,'ts-weekly-checkin-list');}};
const V102_OPEN_MY_QUEST=openMyQuestionnaires;
openMyQuestionnaires=async function(){await V102_OPEN_MY_QUEST();if(CURRENT_USER?.uid){const checkins=await fetchWeeklyCheckins(CURRENT_USER.uid);WEEKLY_CHECKINS=checkins;renderWeeklyCheckinHistory(checkins,'my-weekly-checkin-list');}};
async function viewWeeklyCheckin(id){
  const checkin=(WEEKLY_CHECKINS||[]).find(item=>item.id===id);if(!checkin)return;document.getElementById('weekly-checkin-view-title').textContent=(checkin.requestKind==='manual'?'Relatório extra':'Relatório semanal')+' // '+fmt(checkin.submittedDate||checkin.dueDate);
  const photoCount=Array.isArray(checkin.photoIds)?checkin.photoIds.length:6,host=document.getElementById('weekly-checkin-view-body');host.innerHTML=`<div class="photo-weight-meta">PESO: ${Number(checkin.weight||0).toLocaleString('pt-BR',{maximumFractionDigits:1})} kg</div><div class="checkin-view-photo-grid" id="checkin-view-photo-grid">Carregando ${photoCount===1?'a foto':`as ${photoCount} fotos`}...</div>`+(checkin.questions||[]).map((question,index)=>`${checkin.sectionAt&&checkin.sectionAt[index]?`<div class="quest-section-title">${esc(checkin.sectionAt[index])}</div>`:''}<div class="quest-view-qa"><div class="q">${index+1}. ${esc(question)}</div><div class="a">${esc(checkin.answers?.[index]||'(sem resposta)')}</div></div>`).join('');openModal('modal-weekly-checkin-view');
  const photos=await Promise.all((checkin.photoIds||[]).slice(0,6).map(async photoId=>{try{const doc=await cloudGet(db.collection('progressPhotos').doc(photoId),'foto do relatório');if(!doc.exists)return null;const record={...doc.data(),id:doc.id};const src=await resolvePhotoSource(record,{full:CURRENT_USER?.role==='trainer'});return src?{...record,src}:null;}catch(error){return null;}}));
  const grid=document.getElementById('checkin-view-photo-grid');if(!grid)return;grid.innerHTML=photos.filter(Boolean).map((photo,index)=>`<figure><img src="${esc(photo.src)}" alt="${esc(photo.pose||CHECKIN_POSES[index]||'Foto')}"><figcaption>${esc(photo.pose||CHECKIN_POSES[index]||'Foto')}</figcaption></figure>`).join('')||'<div class="no-data-inline">As fotos não estão disponíveis neste momento.</div>';
}

// Tabela de alimentos passa a ser um recurso central da dieta. O treinador
// continua com edição completa; alunos mantêm visualização simples.
const V102_OPEN_FOOD=openFoodOptions;
// O atalho geral mantém o comportamento original. A dieta usa explicitamente
// openFoodOptionsFromDiet(), evitando que um contexto antigo altere o botão global.
openFoodOptions=V102_OPEN_FOOD;

// Limpa dados específicos ao sair da conta para impedir mistura entre alunos.
const V102_CONFIRM_LOGOUT=confirmLogout;
confirmLogout=function(){clearWeeklyCheckinPreviews();resetQuestionnaireReportPhotos();CURRENT_ANSWER_REPORT=null;CUR_ANSWER_QUEST_ID=null;WEEKLY_CHECKIN_FILES=Array(6).fill(null);WEEKLY_CHECKIN_SCHEDULE=null;WEEKLY_CHECKINS=[];WEEKLY_CHECKIN_REQUEST=null;WEEKLY_CHECKIN_STATE_UID='';DIET_DOCUMENT={plans:[]};CURRENT_DIET_ID='';return V102_CONFIRM_LOGOUT();};


/* ══════════════════════════════════════════════════
   TEAM BULLS v10.5 — CICLOS, DIETAS VARIÁVEIS E DESKTOP DO ALUNO
   Camada retrocompatível: documentos antigos continuam válidos e são
   normalizados em memória sem apagar refeições, treinos ou históricos.
══════════════════════════════════════════════════ */
const V104_VERSION='10.5';
let CURRENT_DIET_VARIANT_ID='';
let EDIT_DIET_VARIANT_ID='';

function v104DateOr(value,fallback=today()){return validIsoDate(value)?String(value):fallback;}
function v104DateDiffDays(start,end){
  if(!validIsoDate(start)||!validIsoDate(end))return 0;
  const a=new Date(start+'T12:00:00'),b=new Date(end+'T12:00:00');
  return Math.round((b-a)/86400000);
}
function v104CycleWeek(start,date=today()){
  if(!validIsoDate(start)||!validIsoDate(date))return 1;
  return Math.max(1,Math.min(8,Math.floor(v104DateDiffDays(start,date)/7)+1));
}
function v104CycleRange(start,week){
  if(!validIsoDate(start))return'';
  const from=addDaysIso(start,(Math.max(1,Number(week)||1)-1)*7),to=addDaysIso(from,6);
  return`${fmt(from)}–${fmt(to)}`;
}
function v104CycleMeta(item){
  const start=v104DateOr(item?.startDate,''),update=v104DateOr(item?.updateDate,'');
  if(!start&&!update)return'Ciclo sem datas definidas';
  const week=start?v104CycleWeek(start,today()):1;
  return`${start?'Sem. '+week+' · início '+fmt(start):''}${start&&update?' · ':''}${update?'atualização '+fmt(update):''}`;
}
function syncWorkoutUpdateDateFromStart(){
  const start=document.getElementById('input-workout-start-date')?.value;
  const update=document.getElementById('input-workout-update-date');
  if(validIsoDate(start)&&update)update.value=addDaysIso(start,28);
}
function syncDietUpdateDateFromStart(){
  const start=document.getElementById('input-diet-start-date')?.value;
  const update=document.getElementById('input-diet-update-date');
  if(validIsoDate(start)&&update)update.value=addDaysIso(start,28);
}

/* Brilho com curva perceptual mais forte. */
adjustHex=function(hex,pct){
  const raw=hex.replace('#',''),n=parseInt(raw.length===3?raw.split('').map(c=>c+c).join(''):raw,16),p=Math.max(0.2,Math.min(1.8,Number(pct||100)/100));
  const amount=p<1?Math.pow(p,1.75):1+(p-1)*2.15;
  const c=shift=>Math.max(0,Math.min(255,Math.round(((n>>shift)&255)*amount))).toString(16).padStart(2,'0');
  return'#'+c(16)+c(8)+c(0);
};
applyAppSettings=function(){
  const root=document.documentElement.style,bg=Math.max(35,Math.min(180,Number(APP_SETTINGS.background)||100)),text=Math.max(45,Math.min(180,Number(APP_SETTINGS.text)||100));
  root.setProperty('--bg',adjustHex('#070706',bg));root.setProperty('--surface',adjustHex('#11100f',bg));root.setProperty('--card',adjustHex('#171513',bg));root.setProperty('--border',adjustHex('#342e29',bg));root.setProperty('--border-l',adjustHex('#51453a',bg));
  root.setProperty('--text',adjustHex('#e8e0d3',text));root.setProperty('--text-dim',adjustHex('#aaa095',text));root.setProperty('--text-muted',adjustHex('#766d63',text));
  root.setProperty('--font-scale',String(APP_SETTINGS.font/100));root.setProperty('--click-volume',String(APP_SETTINGS.clickVolume/100));
  root.setProperty('--ui-glow',String(Math.max(.55,Math.min(1.55,bg/100))));root.setProperty('--auth-shade',String(Math.max(.05,Math.min(.78,.58-(bg-100)/150))));
  syncSettingsUi();const dock=document.getElementById('music-dock');if(dock)dock.classList.toggle('active',!!APP_SETTINGS.musicDock);
  if(LOCAL_MUSIC){if(MUSIC_FADE_FRAME)cancelMusicFade();LOCAL_MUSIC.volume=APP_SETTINGS.musicEnabled&&!LOCAL_MUSIC.paused?getMusicTargetVolume():0;}
};

/* Desktop responsivo também para aluno e modo local. */
function syncDesktopRoleLayout(){
  const screen=document.querySelector('.screen.active')?.id||'';
  const trainer=CURRENT_USER?.role==='trainer'&&screen!=='screen-auth';
  const usable=!['screen-auth','screen-loading'].includes(screen)&&(CURRENT_USER?.role==='student'||MODE==='local'||ACCESS_MODE==='local-inactive'||ACCESS_MODE==='offline-registered');
  document.body.classList.toggle('student-desktop',!!usable&&!trainer);if(trainer)document.body.classList.remove('student-desktop');
}
const V104_SHOW_SCREEN_BASE=showScreen;
showScreen=function(){const result=V104_SHOW_SCREEN_BASE.apply(this,arguments);requestAnimationFrame(syncDesktopRoleLayout);return result;};
window.addEventListener('resize',syncDesktopRoleLayout,{passive:true});

/* Datas dos protocolos. */
const V104_OPEN_ADD_WORKOUT=openAddWorkoutModal;
openAddWorkoutModal=function(){V104_OPEN_ADD_WORKOUT();const start=today();document.getElementById('input-workout-start-date').value=start;document.getElementById('input-workout-update-date').value=addDaysIso(start,28);};
const V104_OPEN_EDIT_WORKOUT=openEditWorkout;
openEditWorkout=function(id){V104_OPEN_EDIT_WORKOUT(id);const w=getW(id);if(!w)return;const start=v104DateOr(w.startDate,today());document.getElementById('input-workout-start-date').value=start;document.getElementById('input-workout-update-date').value=v104DateOr(w.updateDate,addDaysIso(start,28));};
const V104_OPEN_ADD_WORKOUT_TS=openAddWorkoutModalTs;
openAddWorkoutModalTs=function(){V104_OPEN_ADD_WORKOUT_TS();const start=today();document.getElementById('input-workout-start-date').value=start;document.getElementById('input-workout-update-date').value=addDaysIso(start,28);};
const V104_OPEN_EDIT_WORKOUT_TS=openEditWorkoutTs;
openEditWorkoutTs=function(id){V104_OPEN_EDIT_WORKOUT_TS(id);const w=VIEW_STUDENT?.workouts?.find(item=>item.id===id);if(!w)return;const start=v104DateOr(w.startDate,today());document.getElementById('input-workout-start-date').value=start;document.getElementById('input-workout-update-date').value=v104DateOr(w.updateDate,addDaysIso(start,28));};
const V104_SAVE_WORKOUT_BASE=saveWorkout;
saveWorkout=async function(){
  const studentUid=MODAL_TARGET==='student'?VIEW_STUDENT?.uid:null,start=document.getElementById('input-workout-start-date')?.value,update=document.getElementById('input-workout-update-date')?.value;
  const editedWorkoutId=EDIT_W,wasNew=!EDIT_W,wasActive=wasNew||!!VIEW_STUDENT?.workouts?.find(item=>item.id===editedWorkoutId)?.isActive;
  await V104_SAVE_WORKOUT_BASE();
  if(studentUid&&wasActive&&validIsoDate(start)&&validIsoDate(update)&&!document.getElementById('modal-workout')?.classList.contains('open'))await v104SyncCycleSchedule(studentUid,start,update,'workout').catch(()=>{});
};
const V104_PROTOCOL_SUMMARY=protocolSummaryHtml;
protocolSummaryHtml=function(workout,dayName=''){
  const base=V104_PROTOCOL_SUMMARY(workout,dayName),start=v104DateOr(workout?.startDate,''),update=v104DateOr(workout?.updateDate,'');if(dayName||(!start&&!update))return base;
  return base+`<div class="protocol-cycle-strip"><span>SEMANA ATUAL <b>${v104CycleWeek(start,today())}/8</b></span><span>${start?esc(v104CycleRange(start,v104CycleWeek(start,today()))):'sem início'}</span><span>ATUALIZAÇÃO <b>${update?esc(fmt(update)):'não definida'}</b></span></div>`;
};
const V104_OPEN_WORKOUT=openWorkout;
openWorkout=function(id){const w=getW(id);if(w?.startDate)LAST_SESSION_WEEK=v104CycleWeek(w.startDate,today());return V104_OPEN_WORKOUT(id);};
const V104_OPEN_TS_WORKOUT=openTsWorkout;
openTsWorkout=function(id){const w=VIEW_STUDENT?.workouts?.find(item=>item.id===id);if(w?.startDate)TRAINER_ACTIVE_WEEK=v104CycleWeek(w.startDate,today());return V104_OPEN_TS_WORKOUT(id);};
const V104_OPEN_LOG_SESSION=openLogSessionModal;
openLogSessionModal=function(){const w=getW(CUR_WORKOUT);if(w?.startDate)LAST_SESSION_WEEK=v104CycleWeek(w.startDate,today());V104_OPEN_LOG_SESSION();syncSessionWeekFromDate(true);};
function syncSessionWeekFromDate(force=false){
  const w=getW(SESSION_WID||CUR_WORKOUT),date=document.getElementById('input-session-date')?.value;if(!w?.startDate||!validIsoDate(date))return;
  const next=v104CycleWeek(w.startDate,date),select=document.getElementById('input-session-week');if(!select)return;
  if(!force&&sessionEditorHasData()&&Number(select.value)!==next&&!confirm(`A data corresponde à semana ${next}. Ajustar a prescrição exibida?`))return;
  select.value=String(next);SESSION_EDITOR_WEEK=next;LAST_SESSION_WEEK=next;populateSessionEditorForWeek(next);
};

/* Cópia da prescrição para a planilha inteira. */
function v104CurrentPrescriptionSets(){
  const sets=collectPrescriptionRows();
  return Array.isArray(sets)?clonePrescriptionSets(sets):[];
}
async function v104CopyPrescriptionToAll(copyAllWeeks=false){
  const source=getPlanEditExercise(),workout=PLAN_EDIT_TARGET==='trainer'?VIEW_STUDENT_WORKOUT:getW(PLAN_EDIT_WID);if(!source||!workout)return;
  const targets=(workout.exercises||[]).filter(item=>item.id!==source.id);if(!targets.length){showToast('Não há outros exercícios neste protocolo.',true);return;}
  const week=Number(document.getElementById('input-prescription-week').value)||1,sets=v104CurrentPrescriptionSets();if(!sets.length){alert('Cadastre ao menos uma série válida antes de copiar.');return;}
  const sourcePlan=buildWeeklyPlanUpdate(source.weeklyPlan,week,sets,false);
  const materializedPlan={};
  if(copyAllWeeks){
    const temp={...source,weeklyPlan:sourcePlan};
    for(let n=1;n<=8;n++){const resolved=resolveWeekPrescription(temp,n);materializedPlan['w'+n]=clonePrescriptionSets(resolved.sets||[]);}
  }
  const sourceBefore=JSON.stringify(source.weeklyPlan||{}),targetsBefore=new Map(targets.map(item=>[item.id,JSON.stringify(item.weeklyPlan||{})]));
  try{
    if(PLAN_EDIT_TARGET==='trainer'){
      const batch=db.batch();batch.update(db.collection('exercises').doc(source.id),{weeklyPlan:sourcePlan});
      targets.forEach(target=>{const plan=copyAllWeeks?JSON.parse(JSON.stringify(materializedPlan)):{...normalizeWeeklyPlan(target.weeklyPlan),['w'+week]:clonePrescriptionSets(sets)};batch.update(db.collection('exercises').doc(target.id),{weeklyPlan:plan});});
      await cloudWrite(batch.commit(),'repassar prescrição para a planilha');
      source.weeklyPlan=sourcePlan;targets.forEach(target=>{target.weeklyPlan=copyAllWeeks?JSON.parse(JSON.stringify(materializedPlan)):{...normalizeWeeklyPlan(target.weeklyPlan),['w'+week]:clonePrescriptionSets(sets)};});
    }else{
      source.weeklyPlan=sourcePlan;targets.forEach(target=>{target.weeklyPlan=copyAllWeeks?JSON.parse(JSON.stringify(materializedPlan)):{...normalizeWeeklyPlan(target.weeklyPlan),['w'+week]:clonePrescriptionSets(sets)};});if(!localSave())throw new Error('Não foi possível salvar no aparelho.');
    }
    showToast(copyAllWeeks?'✓ As 8 semanas foram aplicadas a todos os exercícios':`✓ Semana ${week} aplicada a todos os exercícios`);
  }catch(error){
    source.weeklyPlan=JSON.parse(sourceBefore);targets.forEach(target=>{target.weeklyPlan=JSON.parse(targetsBefore.get(target.id)||'{}');});
    alert(cloudWriteError(error,'repassar a prescrição para todos os exercícios'));
  }
}
function confirmCopyCurrentWeekToAllExercises(){showConfirm('Repassar para todos',`Aplicar as séries da semana ${Number(document.getElementById('input-prescription-week').value)||1} a todos os exercícios deste protocolo?`,()=>v104CopyPrescriptionToAll(false));}
function confirmCopyAllWeeksToAllExercises(){showConfirm('Repassar planilha completa','Aplicar as 8 semanas deste exercício a todos os exercícios do protocolo? As prescrições atuais dos destinos serão substituídas.',()=>v104CopyPrescriptionToAll(true));}
function copyBulkToEntireWorksheet(){document.getElementById('bulk-select-all').checked=true;toggleBulkAll(true);saveBulkPrescription();}
const V104_OPEN_BULK=openBulkPrescriptionModal;
openBulkPrescriptionModal=function(){V104_OPEN_BULK();const all=document.getElementById('bulk-select-all');if(all){all.checked=true;toggleBulkAll(true);}};

/* Dietas com subdivisões livres e distribuição semanal. */
function normalizeDietVariant(value,index=0){
  const raw=value&&typeof value==='object'?value:{},meals=(Array.isArray(raw.meals)?raw.meals:[]).map(normalizeDietMeal);
  return{id:String(raw.id||uid()),name:String(raw.name||('Divisão '+(index+1))).trim().slice(0,100)||('Divisão '+(index+1)),daysPerWeek:Math.max(0,Math.min(7,Math.trunc(Number(raw.daysPerWeek)||0))),order:Number.isFinite(Number(raw.order))?Math.max(0,Math.trunc(Number(raw.order))):index,meals};
}
normalizeDietPlan=function(plan,index=0){
  const raw=plan&&typeof plan==='object'?plan:{},start=v104DateOr(raw.startDate,today()),update=v104DateOr(raw.updateDate,addDaysIso(start,28));
  let variants=Array.isArray(raw.variants)?raw.variants.map(normalizeDietVariant):[];
  if(!variants.length&&Array.isArray(raw.meals)&&raw.meals.length)variants=[normalizeDietVariant({id:'legacy-main-'+String(raw.id||index),name:'Plano principal',daysPerWeek:7,order:0,meals:raw.meals},0)];
  if(!variants.length)variants=[normalizeDietVariant({id:String(raw.id||('diet-'+index))+'-training',name:'Dia de treino',daysPerWeek:5,order:0,meals:[]},0),normalizeDietVariant({id:String(raw.id||('diet-'+index))+'-rest',name:'Dia sem treino',daysPerWeek:2,order:1,meals:[]},1)];
  variants=variants.sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'pt-BR')).map((item,i)=>({...item,order:i}));
  const result={id:String(raw.id||uid()),name:String(raw.name||('Dieta '+(index+1))).trim().slice(0,100)||('Dieta '+(index+1)),isActive:raw.isActive===true,order:Number.isFinite(Number(raw.order))?Math.max(0,Math.trunc(Number(raw.order))):index,startDate:start,updateDate:update,variants,meals:variants[0]?.meals||[]};
  DIET_SECTION_DEFS.forEach(def=>{result[def.key]=(Array.isArray(raw[def.key])?raw[def.key]:[]).map(normalizeDietSupportItem).sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'pt-BR')).map((item,itemIndex)=>({...item,order:itemIndex}));});return result;
};
normalizeDietDocument=function(source){
  const raw=source&&typeof source==='object'?source:{};let plans=Array.isArray(raw.plans)?raw.plans.map(normalizeDietPlan):[];
  if(!plans.length&&Array.isArray(raw.meals)&&raw.meals.length)plans=[normalizeDietPlan({id:'legacy-main-diet',name:'Dieta principal',isActive:true,order:0,meals:raw.meals},0)];
  plans=plans.sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'pt-BR')).map((plan,index)=>({...plan,order:index}));if(plans.length&&!plans.some(plan=>plan.isActive))plans[0].isActive=true;if(plans.filter(plan=>plan.isActive).length>1){let found=false;plans.forEach(plan=>{if(plan.isActive&&!found)found=true;else if(plan.isActive)plan.isActive=false;});}return{plans};
};
function currentDietVariant(){const plan=currentDiet();if(!plan)return null;let found=plan.variants.find(item=>item.id===CURRENT_DIET_VARIANT_ID);if(!found)found=plan.variants[0]||null;if(found)CURRENT_DIET_VARIANT_ID=found.id;return found;}
function v104DietDistribution(plan){const total=(plan?.variants||[]).reduce((sum,item)=>sum+Number(item.daysPerWeek||0),0);return{total,remaining:7-total};}
function renderDietVariantTabs(trainerMode=false){
  const plan=currentDiet(),host=document.getElementById(trainerMode?'ts-diet-variant-tabs':'diet-variant-tabs'),distribution=document.getElementById(trainerMode?'ts-diet-week-distribution':'diet-week-distribution');if(!plan||!host)return;
  const active=currentDietVariant();host.innerHTML=plan.variants.map((variant,index)=>`<div class="diet-variant-card ${variant.id===active?.id?'active':''}" onclick="selectDietVariant(${jsArg(variant.id)},${trainerMode})"><div><strong>${esc(variant.name)}</strong><span>${variant.daysPerWeek} ${variant.daysPerWeek===1?'dia':'dias'} por semana · ${variant.meals.length} refeições</span></div>${trainerMode?`<div class="diet-variant-actions"><button ${index===0?'disabled':''} onclick="event.stopPropagation();moveDietVariant(${jsArg(variant.id)},-1)">↑</button><button ${index===plan.variants.length-1?'disabled':''} onclick="event.stopPropagation();moveDietVariant(${jsArg(variant.id)},1)">↓</button><button onclick="event.stopPropagation();openEditDietVariantModal(${jsArg(variant.id)})">✎</button></div>`:''}</div>`).join('');
  const d=v104DietDistribution(plan);if(distribution)distribution.innerHTML=`<span>Distribuição semanal: <b>${plan.variants.map(item=>`${esc(item.name)} ${item.daysPerWeek}×`).join(' · ')}</b></span><span class="${d.total===7?'ok':'warn'}">${d.total===7?'✓ 7 dias programados':d.total<7?`Faltam ${7-d.total} dia(s)`:`Excedeu em ${d.total-7} dia(s)`}</span>`;
}
function v104ActivateVariantMeals(trainerMode){const plan=currentDiet(),variant=currentDietVariant();if(!plan||!variant)return;variant.meals=Array.isArray(variant.meals)?variant.meals:[];plan.meals=variant.meals;MEAL_PLAN_CACHE.meals=variant.meals;MEAL_CTX.listId=trainerMode?'ts-diet-meals-list':'diet-meals-list';MEAL_CTX.emptyId=trainerMode?'ts-diet-meals-empty':'diet-meals-empty';const label=document.getElementById(trainerMode?'ts-diet-meals-section-label':'diet-meals-section-label');if(label)label.textContent='Refeições — '+variant.name;renderMealsList();}
function selectDietVariant(id,trainerMode=false){CURRENT_DIET_VARIANT_ID=String(id||'');renderDietVariantTabs(trainerMode);v104ActivateVariantMeals(trainerMode);}
renderDietList=function(listId,emptyId,trainerMode){
  const list=document.getElementById(listId),empty=document.getElementById(emptyId);if(!list)return;DIET_DOCUMENT=normalizeDietDocument(DIET_DOCUMENT);const plans=DIET_DOCUMENT.plans;if(!plans.length){list.innerHTML='';if(empty)empty.style.display='block';return;}if(empty)empty.style.display='none';
  list.innerHTML=plans.map((plan,index)=>{const openCall=trainerMode?`openDietDetail(${jsArg(plan.id)},true)`:`openDietDetail(${jsArg(plan.id)},false)`,d=v104DietDistribution(plan),controls=dietCanEdit()?`<div class="diet-card-controls"><button class="order-btn" ${index===0?'disabled':''} onclick="event.stopPropagation();moveDietPlan(${jsArg(plan.id)},-1)">↑</button><button class="order-btn" ${index===plans.length-1?'disabled':''} onclick="event.stopPropagation();moveDietPlan(${jsArg(plan.id)},1)">↓</button>${plan.isActive?'':`<button class="activate-workout-btn" onclick="event.stopPropagation();activateDietPlan(${jsArg(plan.id)})">ATIVAR</button>`}<button class="btn-icon ghost" onclick="event.stopPropagation();openEditDietModal(${jsArg(plan.id)})">✎</button></div>`:'';return`<div class="diet-folder-card ${plan.isActive?'is-active':'is-inactive'}" onclick="${openCall}"><div class="diet-folder-main">${dietStatusBadge(plan)}<div class="diet-folder-name">${esc(plan.name)}</div><div class="diet-folder-meta">${plan.variants.length} divisões · ${d.total}/7 dias · atualização ${esc(fmt(plan.updateDate))}</div><div class="diet-folder-variants">${plan.variants.map(item=>`<span>${esc(item.name)} ${item.daysPerWeek}×</span>`).join('')}</div></div>${controls}<span class="exercise-row-arrow">›</span></div>`;}).join('');
};
openDietDetail=async function(id,trainerMode=false){
  DIET_DOCUMENT=normalizeDietDocument(DIET_DOCUMENT);const plan=DIET_DOCUMENT.plans.find(item=>String(item.id)===String(id));if(!plan)return;CURRENT_DIET_ID=plan.id;if(!plan.variants.some(item=>item.id===CURRENT_DIET_VARIANT_ID))CURRENT_DIET_VARIANT_ID=plan.variants[0]?.id||'';
  const targetUid=DIET_CONTEXT.targetUid,completions=MODE==='cloud'&&targetUid?await fetchCompletionsToday(targetUid):new Set();MEAL_COMPLETIONS_TODAY=completions;
  const cycle=`<span>INÍCIO <b>${esc(fmt(plan.startDate))}</b></span><span>ATUALIZAÇÃO <b>${esc(fmt(plan.updateDate))}</b></span><span>SEMANA <b>${v104CycleWeek(plan.startDate,today())}/8</b></span>`;
  if(trainerMode){MEAL_CTX={listId:'ts-diet-meals-list',emptyId:'ts-diet-meals-empty',canEditContent:true,canToggleDone:false,targetUid};document.getElementById('ts-diet-detail-title').textContent=plan.name.toUpperCase();document.getElementById('ts-diet-detail-status').innerHTML=dietStatusBadge(plan)+(plan.isActive?'<span>Plano atual do aluno</span>':'<span>Dieta anterior preservada</span>');document.getElementById('ts-diet-cycle-summary').innerHTML=cycle;renderDietVariantTabs(true);v104ActivateVariantMeals(true);renderDietSupportTables('ts-diet-support-tables',plan,true);showScreen('screen-ts-diet-detail');}
  else{const canEdit=DIET_CONTEXT.local;MEAL_CTX={listId:'diet-meals-list',emptyId:'diet-meals-empty',canEditContent:canEdit,canToggleDone:true,targetUid};document.getElementById('diet-detail-title').textContent=plan.name.toUpperCase();document.getElementById('diet-detail-status').innerHTML=dietStatusBadge(plan)+(plan.isActive?'<span>Siga este plano como dieta atual</span>':'<span>Dieta anterior disponível para consulta</span>');document.getElementById('diet-cycle-summary').innerHTML=cycle;renderDietVariantTabs(false);v104ActivateVariantMeals(false);renderDietSupportTables('diet-support-tables',plan,canEdit);showScreen('screen-diet-detail');}
};
openAddDietModal=function(){if(!dietCanEdit())return;EDIT_DIET_PLAN_ID='';document.getElementById('modal-diet-title').textContent='Nova dieta';document.getElementById('input-diet-name').value='';document.getElementById('input-diet-active').value=DIET_DOCUMENT.plans.length?'false':'true';const start=today();document.getElementById('input-diet-start-date').value=start;document.getElementById('input-diet-update-date').value=addDaysIso(start,28);document.getElementById('btn-delete-diet').style.display='none';openModal('modal-diet');};
openEditDietModal=function(id=CURRENT_DIET_ID){if(!dietCanEdit())return;const plan=DIET_DOCUMENT.plans.find(item=>String(item.id)===String(id));if(!plan)return;EDIT_DIET_PLAN_ID=plan.id;document.getElementById('modal-diet-title').textContent='Editar dieta';document.getElementById('input-diet-name').value=plan.name;document.getElementById('input-diet-active').value=String(plan.isActive);document.getElementById('input-diet-start-date').value=v104DateOr(plan.startDate,today());document.getElementById('input-diet-update-date').value=v104DateOr(plan.updateDate,addDaysIso(plan.startDate,28));document.getElementById('btn-delete-diet').style.display='block';openModal('modal-diet');};
saveDietPlan=async function(){
  if(!dietCanEdit()||!beginAction('save-diet','modal-diet'))return;const name=document.getElementById('input-diet-name').value.trim(),active=document.getElementById('input-diet-active').value==='true',startDate=document.getElementById('input-diet-start-date').value,updateDate=document.getElementById('input-diet-update-date').value;if(!name){alert('Informe o nome da dieta.');endAction('save-diet','modal-diet');return;}if(!validIsoDate(startDate)||!validIsoDate(updateDate)||updateDate<startDate){alert('Confira as datas da dieta.');endAction('save-diet','modal-diet');return;}const snapshot=JSON.stringify(DIET_DOCUMENT);
  try{let plan=DIET_DOCUMENT.plans.find(item=>item.id===EDIT_DIET_PLAN_ID);if(plan){Object.assign(plan,{name,isActive:active,startDate,updateDate});}else{plan=normalizeDietPlan({id:uid(),name,isActive:active,order:DIET_DOCUMENT.plans.length,startDate,updateDate,variants:[]},DIET_DOCUMENT.plans.length);DIET_DOCUMENT.plans.push(plan);EDIT_DIET_PLAN_ID=plan.id;}if(active)DIET_DOCUMENT.plans.forEach(item=>{if(item.id!==plan.id)item.isActive=false;});DIET_DOCUMENT=normalizeDietDocument(DIET_DOCUMENT);await persistDietDocument();closeModal('modal-diet');const trainer=DIET_CONTEXT.trainer;renderDietList(trainer?'ts-meals-list':'meals-list',trainer?'ts-meals-empty':'meals-empty',trainer);showToast('✓ Dieta salva');if(trainer&&active&&DIET_CONTEXT.targetUid)await v104SyncCycleSchedule(DIET_CONTEXT.targetUid,startDate,updateDate,'diet').catch(()=>{});}catch(error){DIET_DOCUMENT=normalizeDietDocument(JSON.parse(snapshot));alert(cloudWriteError(error,'salvar a dieta'));}finally{endAction('save-diet','modal-diet');}
};
persistMealPlan=async function(){const plan=currentDiet(),variant=currentDietVariant();if(plan&&variant){variant.meals=MEAL_PLAN_CACHE.meals;plan.meals=variant.meals;}await persistDietDocument();};
function openAddDietVariantModal(){const plan=currentDiet();if(!dietCanEdit()||!plan)return;if((plan.variants||[]).length>=12){alert('Esta dieta já atingiu o limite seguro de 12 divisões.');return;}EDIT_DIET_VARIANT_ID='';document.getElementById('modal-diet-variant-title').textContent='Nova divisão';document.getElementById('input-diet-variant-name').value='';document.getElementById('input-diet-variant-days').value='0';document.getElementById('btn-delete-diet-variant').style.display='none';openModal('modal-diet-variant');}
function openEditDietVariantModal(id){const plan=currentDiet(),variant=plan?.variants?.find(item=>item.id===id);if(!dietCanEdit()||!variant)return;EDIT_DIET_VARIANT_ID=id;document.getElementById('modal-diet-variant-title').textContent='Editar divisão';document.getElementById('input-diet-variant-name').value=variant.name;document.getElementById('input-diet-variant-days').value=String(variant.daysPerWeek);document.getElementById('btn-delete-diet-variant').style.display=plan.variants.length>1?'block':'none';openModal('modal-diet-variant');}
async function saveDietVariant(){const plan=currentDiet();if(!plan||!dietCanEdit()||!beginAction('save-diet-variant','modal-diet-variant'))return;const name=document.getElementById('input-diet-variant-name').value.trim(),days=Math.max(0,Math.min(7,Math.trunc(Number(document.getElementById('input-diet-variant-days').value)||0)));if(!name){alert('Informe o nome da divisão.');endAction('save-diet-variant','modal-diet-variant');return;}const before=JSON.stringify(DIET_DOCUMENT);try{let variant=plan.variants.find(item=>item.id===EDIT_DIET_VARIANT_ID);if(variant)Object.assign(variant,{name,daysPerWeek:days});else{variant=normalizeDietVariant({id:uid(),name,daysPerWeek:days,order:plan.variants.length,meals:[]},plan.variants.length);plan.variants.push(variant);CURRENT_DIET_VARIANT_ID=variant.id;}const total=plan.variants.reduce((sum,item)=>sum+item.daysPerWeek,0);if(total>7)throw new Error('A distribuição ultrapassa 7 dias. Reduza outra divisão antes de salvar.');await persistDietDocument();closeModal('modal-diet-variant');renderDietVariantTabs(DIET_CONTEXT.trainer);v104ActivateVariantMeals(DIET_CONTEXT.trainer);showToast('✓ Divisão salva');}catch(error){DIET_DOCUMENT=normalizeDietDocument(JSON.parse(before));alert(error.message||cloudWriteError(error,'salvar a divisão'));}finally{endAction('save-diet-variant','modal-diet-variant');}}
function deleteDietVariant(){const plan=currentDiet(),id=EDIT_DIET_VARIANT_ID;if(!plan||plan.variants.length<=1||!id)return;closeModal('modal-diet-variant');showConfirm('Excluir divisão','Excluir esta divisão e suas refeições? As outras divisões da dieta serão preservadas.',async()=>{const before=JSON.stringify(DIET_DOCUMENT);try{plan.variants=plan.variants.filter(item=>item.id!==id);CURRENT_DIET_VARIANT_ID=plan.variants[0]?.id||'';await persistDietDocument();renderDietVariantTabs(DIET_CONTEXT.trainer);v104ActivateVariantMeals(DIET_CONTEXT.trainer);}catch(error){DIET_DOCUMENT=normalizeDietDocument(JSON.parse(before));alert(cloudWriteError(error,'excluir a divisão'));}});}
async function moveDietVariant(id,delta){const plan=currentDiet(),index=plan?.variants.findIndex(item=>item.id===id),target=index+Number(delta);if(!plan||index<0||target<0||target>=plan.variants.length)return;[plan.variants[index],plan.variants[target]]=[plan.variants[target],plan.variants[index]];plan.variants.forEach((item,i)=>item.order=i);try{await persistDietDocument();renderDietVariantTabs(DIET_CONTEXT.trainer);}catch(error){showToast(cloudWriteError(error,'alterar a ordem das divisões'),true);}}
const V104_ACTIVATE_DIET_BASE=activateDietPlan;
activateDietPlan=async function(id){await V104_ACTIVATE_DIET_BASE(id);const plan=DIET_DOCUMENT.plans.find(item=>item.id===id);if(DIET_CONTEXT.trainer&&plan)await v104SyncCycleSchedule(DIET_CONTEXT.targetUid,plan.startDate,plan.updateDate,'diet').catch(()=>{});};

/* Relatórios semanais vinculados ao ciclo de treino/dieta. */
async function v104SyncCycleSchedule(studentUid,startDate,updateDate,source){
  if(!studentUid||CURRENT_USER?.role!=='trainer'||!validIsoDate(startDate)||!validIsoDate(updateDate))return;
  const ref=db.collection('checkinSchedules').doc(studentUid),doc=await cloudGet(ref,'programação do ciclo').catch(()=>null),old=doc?.exists?doc.data():{};
  const firstWeekly=addDaysIso(startDate,7),next=validIsoDate(old.nextDueDate)&&old.nextDueDate>=startDate&&old.nextDueDate<=updateDate?old.nextDueDate:firstWeekly;
  await cloudWrite(ref.set({studentId:studentUid,nextDueDate:next,intervalDays:7,cycleStartDate:startDate,cycleUpdateDate:updateDate,cycleSource:String(source||'plan').slice(0,30),extraRequestId:String(old.extraRequestId||''),extraRequestedAt:String(old.extraRequestedAt||''),updatedBy:CURRENT_USER.uid,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}),'alinhar relatórios ao ciclo');
}
const V104_LOAD_TRAINER_SCHEDULE=loadTrainerCheckinSchedule;
loadTrainerCheckinSchedule=async function(studentUid){await V104_LOAD_TRAINER_SCHEDULE(studentUid);const note=document.getElementById('trainer-cycle-link-note');if(note&&TRAINER_CHECKIN_SCHEDULE){const start=TRAINER_CHECKIN_SCHEDULE.cycleStartDate,update=TRAINER_CHECKIN_SCHEDULE.cycleUpdateDate;note.innerHTML=start&&update?`Ciclo alinhado: início <b>${esc(fmt(start))}</b> · atualização <b>${esc(fmt(update))}</b> · relatórios a cada 7 dias.`:'Defina as datas do treino ou da dieta ativa para alinhar automaticamente as semanas e relatórios.';}};
const V104_SAVE_SCHEDULE_BASE=saveTrainerCheckinSchedule;
saveTrainerCheckinSchedule=async function(){await V104_SAVE_SCHEDULE_BASE();};
const V104_RENDER_CHECKIN_CARD=renderWeeklyCheckinCard;
renderWeeklyCheckinCard=function(loadError=false){V104_RENDER_CHECKIN_CARD(loadError);const meta=document.getElementById('weekly-checkin-meta');if(!loadError&&meta&&WEEKLY_CHECKIN_SCHEDULE?.cycleUpdateDate)meta.textContent+=' · atualização do ciclo: '+fmt(WEEKLY_CHECKIN_SCHEDULE.cycleUpdateDate)+'.';};

const V104_CONFIRM_LOGOUT=confirmLogout;
confirmLogout=function(){CURRENT_DIET_VARIANT_ID='';EDIT_DIET_VARIANT_ID='';document.body.classList.remove('student-desktop');return V104_CONFIRM_LOGOUT();};
requestAnimationFrame(()=>{applyAppSettings();syncDesktopRoleLayout();});


/* Identificação final da versão e datas do ciclo no PDF. */
const V104_WORKOUT_PDF_FINAL=workoutPdfHtml;
workoutPdfHtml=function(){return V104_WORKOUT_PDF_FINAL.apply(this,arguments).replace(/Team Bulls v10\.[0-3]/g,'Team Bulls v10.5');};

/* ═══════════════════════════════════════════════
   TEAM BULLS v10.5 — CONTEXTO RESPONSIVO DA AUTENTICAÇÃO
══════════════════════════════════════════════ */
const V105_SHOW_SCREEN_BASE=showScreen;
showScreen=function(id,expectedToken=null){
  const result=V105_SHOW_SCREEN_BASE(id,expectedToken);
  if(result!==false){
    const activeId=document.querySelector('.screen.active')?.id||id||'';
    document.body.classList.toggle('auth-desktop',activeId==='screen-auth');
  }
  return result;
};
function syncAuthDesktopClass(){document.body.classList.toggle('auth-desktop',document.getElementById('screen-auth')?.classList.contains('active'));}
window.addEventListener('resize',syncAuthDesktopClass,{passive:true});
document.addEventListener('DOMContentLoaded',syncAuthDesktopClass,{once:true});


/* ═══════════════════════════════════════════════════════════════
   TEAM BULLS v10.5.8 — TÉCNICAS INDEPENDENTES POR SEMANA
   Cada exercício mantém técnicas padrão e pode sobrescrevê-las em w1..w8.
   Sem herança automática entre semanas: copiar para semanas posteriores é explícito.
═══════════════════════════════════════════════════════════════ */
function normalizeWeekTechniqueConfig(value){
  const raw=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const techniqueIds=normalizeExerciseTechniqueIds(raw.techniqueIds).slice(0,100);
  const optionalTechniqueIds=normalizeExerciseTechniqueIds(raw.optionalTechniqueIds).filter(id=>id==='mp'&&techniqueIds.includes('mp')).slice(0,20);
  const supersetExerciseId=techniqueIds.includes('ss')?String(raw.supersetExerciseId||'').slice(0,128):'';
  return{techniqueIds,optionalTechniqueIds,supersetExerciseId};
}
function normalizeWeeklyTechniquePlan(value){
  const source=value&&typeof value==='object'&&!Array.isArray(value)?value:{},out={};
  for(let week=1;week<=8;week++){
    const key='w'+week;if(!Object.prototype.hasOwnProperty.call(source,key))continue;
    out[key]=normalizeWeekTechniqueConfig(source[key]);
  }
  return out;
}
function baseExerciseTechniqueConfig(exercise){
  return normalizeWeekTechniqueConfig({techniqueIds:exercise?.techniqueIds,optionalTechniqueIds:exercise?.optionalTechniqueIds,supersetExerciseId:exercise?.supersetExerciseId});
}
function resolveWeekTechniqueConfig(exercise,week){
  const safeWeek=Math.max(1,Math.min(8,parseInt(week,10)||1)),plan=normalizeWeeklyTechniquePlan(exercise?.weeklyTechniquePlan),key='w'+safeWeek;
  if(Object.prototype.hasOwnProperty.call(plan,key))return{...plan[key],week:safeWeek,customized:true};
  return{...baseExerciseTechniqueConfig(exercise),week:safeWeek,customized:false};
}
function inferExerciseTechniqueWeek(exercise){
  const id=String(exercise?.id||'');
  if(id&&String(PLAN_EDIT_EID||'')===id&&document.getElementById('modal-prescription')?.classList.contains('open'))return Number(document.getElementById('input-prescription-week')?.value)||1;
  if(id&&String(SESSION_EID||'')===id&&document.getElementById('modal-session')?.classList.contains('open'))return Number(document.getElementById('input-session-week')?.value)||LAST_SESSION_WEEK||1;
  if(id&&String(EDIT_SESSION_EID||'')===id&&document.getElementById('modal-edit-session')?.classList.contains('open'))return Number(document.getElementById('edit-session-week')?.value)||1;
  const workout=workoutContainingExercise(exercise);
  if(workout&&VIEW_STUDENT_WORKOUT&&String(workout.id)===String(VIEW_STUDENT_WORKOUT.id))return Number(TRAINER_ACTIVE_WEEK)||1;
  if(workout&&String(workout.id)===String(CUR_WORKOUT||''))return Number(LAST_SESSION_WEEK)||1;
  return 1;
}
findSupersetPartner=function(exercise,workout=workoutContainingExercise(exercise),week=inferExerciseTechniqueWeek(exercise)){
  if(!exercise||!workout)return null;const own=String(resolveWeekTechniqueConfig(exercise,week).supersetExerciseId||'');
  if(own){const direct=workout.exercises.find(item=>String(item.id)===own);if(direct)return direct;}
  return workout.exercises.find(item=>String(resolveWeekTechniqueConfig(item,week).supersetExerciseId||'')===String(exercise.id))||null;
};
exerciseTechniqueIds=function(exercise,week=inferExerciseTechniqueWeek(exercise)){
  const ids=[...resolveWeekTechniqueConfig(exercise,week).techniqueIds];if(findSupersetPartner(exercise,workoutContainingExercise(exercise),week)&&!ids.includes('ss'))ids.unshift('ss');return ids;
};
exerciseHasTechnique=function(exercise,id,week=inferExerciseTechniqueWeek(exercise)){return exerciseTechniqueIds(exercise,week).includes(id);};
exerciseOptionalTechniqueIds=function(exercise,week=inferExerciseTechniqueWeek(exercise)){const cfg=resolveWeekTechniqueConfig(exercise,week);return cfg.optionalTechniqueIds.filter(id=>id==='mp'&&exerciseHasTechnique(exercise,'mp',week));};
exerciseHasOptionalTechnique=function(exercise,id,week=inferExerciseTechniqueWeek(exercise)){return exerciseOptionalTechniqueIds(exercise,week).includes(id);};
exerciseUsesResistedTime=function(exercise,week=inferExerciseTechniqueWeek(exercise)){return exerciseHasTechnique(exercise,'is',week);};
techniqueItemsForExercise=function(exercise,week=inferExerciseTechniqueWeek(exercise)){return exerciseTechniqueIds(exercise,week).map(id=>TECHNIQUE_CATALOG.items.find(item=>item.id===id)).filter(Boolean);};
effectivePrescriptionSets=function(exercise,sets,week=inferExerciseTechniqueWeek(exercise)){const clean=(Array.isArray(sets)?sets:[]).map(set=>({...set}));if(exerciseHasTechnique(exercise,'bos',week)&&clean.length){const last=clean[clean.length-1];clean.push({...last,backoff:true});}return clean;};
exerciseResultUnit=function(exercise,week=inferExerciseTechniqueWeek(exercise)){return exerciseUsesResistedTime(exercise,week)?'seg':'reps';};
exerciseTimerPresets=function(exercise,week=inferExerciseTechniqueWeek(exercise)){const ids=new Set(exerciseTechniqueIds(exercise,week)),standard=[60,90,120,150,180],short=[20,25,30,35,40,45];let values=[];if(ids.has('mp')&&exerciseHasOptionalTechnique(exercise,'mp',week))values=[...short,...standard];else if(ids.has('cs')||ids.has('mp')||ids.has('it'))values=[...short];else values=[...standard];if(ids.has('rest-pause'))values.push(10,15,20,...standard);if(ids.has('dcs'))values.push(20,...standard);if(ids.has('is'))values.push(35,40,45,...standard);return[...new Set(values)].sort((a,b)=>a-b);};
renderRestTimerPresetsForExercise=function(exercise,week=inferExerciseTechniqueWeek(exercise)){const host=document.getElementById('rest-timer-presets');if(!host)return;const items=techniqueItemsForExercise(exercise,week);host.innerHTML=(items.length?`<div class="timer-context">Semana ${week} · ${esc(items.map(item=>item.code).join(' · '))}</div>`:'')+exerciseTimerPresets(exercise,week).map(seconds=>`<button onclick="startRestTimer(${seconds})">${timerLabel(seconds)}</button>`).join('');};
function weekTechniqueSummary(exercise,week){const items=techniqueItemsForExercise(exercise,week);if(!items.length)return'<span class="week-technique-none">Sem técnica nesta semana</span>';return items.map(item=>`<span>${esc(item.code)}${exerciseHasOptionalTechnique(exercise,item.id,week)?' · opcional':''}</span>`).join('');}
const V1058_CHANGE_EXERCISE_WEEK=changeExerciseWeek;
changeExerciseWeek=function(delta,trainerMode){
  V1058_CHANGE_EXERCISE_WEEK(delta,trainerMode);
  const exercise=trainerMode?VIEW_STUDENT_EXERCISE:getE(CUR_WORKOUT,CUR_EX),week=trainerMode?(Number(TRAINER_ACTIVE_WEEK)||1):(Number(LAST_SESSION_WEEK)||1);
  if(exercise){renderExerciseTechniquePanels(exercise,!!trainerMode);const button=document.getElementById(trainerMode?'ts-btn-reps':'btn-reps');if(button)button.textContent=exerciseUsesResistedTime(exercise,week)?'TEMPO':'REPS';}
};
renderExerciseTechniquePanels=function(exercise,trainerMode=false){
  const week=trainerMode?(Number(TRAINER_ACTIVE_WEEK)||1):(Number(LAST_SESSION_WEEK)||1),techniqueHost=document.getElementById(trainerMode?'ts-exercise-techniques-box':'exercise-techniques-box'),supersetHost=document.getElementById(trainerMode?'ts-exercise-superset-box':'exercise-superset-box');if(!techniqueHost||!supersetHost||!exercise)return;
  const items=techniqueItemsForExercise(exercise,week);techniqueHost.innerHTML=`<div class="exercise-technique-panel"><div class="exercise-technique-panel-head">Técnicas · semana ${week}</div><div class="exercise-technique-chips">${items.length?items.map(item=>`<button class="exercise-technique-chip ${exerciseHasOptionalTechnique(exercise,item.id,week)?'optional':''}" onclick="openTechniqueDetail(${jsArg(item.id)})">${esc(item.code)} · ${esc(item.name)}${exerciseHasOptionalTechnique(exercise,item.id,week)?' · OPCIONAL':''}</button>`).join(''):'<span class="week-technique-none">Nenhuma técnica nesta semana</span>'}</div></div>`;
  const partner=findSupersetPartner(exercise,workoutContainingExercise(exercise),week);if(partner){const open=trainerMode?`openTsExercise(${jsArg(partner.id)})`:`openExercise(${jsArg(partner.id)})`;supersetHost.innerHTML=`<div class="superset-card"><span class="superset-badge">SS</span><div class="superset-main"><div class="superset-title">Semana ${week} · conjugado com ${esc(partner.name)}</div><div class="superset-note">Este vínculo de Super set vale para esta semana.</div></div><button class="superset-open" onclick="${open}">ABRIR</button></div>`;}else supersetHost.innerHTML='';
};
renderExercisePrescription=function(exercise,elId,week,canEdit,trainerMode){
  const el=document.getElementById(elId);if(!el||!exercise)return;const base=resolveWeekPrescription(exercise,week),sets=effectivePrescriptionSets(exercise,base.sets,week),completed=(exercise.sessions||[]).filter(session=>Number(session.week)===Number(week)),unit=exerciseResultUnit(exercise,week);
  const rows=sets.length?sets.map((set,index)=>`<div class="prescription-set-row ${set.backoff?'backoff-row':''}"><span class="prescription-set-number">${index+1}ª${set.backoff?'<span class="backoff-label">BOS</span>':''}</span><span class="prescription-range">${esc(prescribedRangeLabel(set))} ${unit}${set.backoff?'<span class="backoff-label">-20% de carga</span>':''}</span><span class="ger-pill">${formatGerLevel(set.ger)} ${renderGerMeter(set.ger)}</span></div>`).join(''):'<div class="prescription-empty">Nenhuma série prescrita para esta semana.</div>';
  const source=base.inherited?`Herdada da semana ${base.sourceWeek}`:(base.sourceWeek?'Personalizada nesta semana':'Aguardando prescrição'),target=trainerMode?'trainer':'local',action=canEdit?`<button class="btn-primary" onclick="openPrescriptionModal(${jsArg(exercise.id)},${week},'${target}')">✎ EDITAR PRESCRIÇÃO</button>`:`<button class="btn-primary" onclick="openLogSessionModal()">REGISTRAR RESULTADO</button>`;
  el.innerHTML=`<div class="prescription-card"><div class="prescription-card-head"><div><div class="prescription-eyebrow">Prescrição do treinador</div><div class="prescription-title">Semana ${week}</div><div class="prescription-source">${esc(source)}</div></div><div class="week-stepper"><button onclick="changeExerciseWeek(-1,${trainerMode?'true':'false'})" ${week<=1?'disabled':''}>‹</button><span>${week}/8</span><button onclick="changeExerciseWeek(1,${trainerMode?'true':'false'})" ${week>=8?'disabled':''}>›</button></div></div><div class="prescription-week-techniques"><b>TÉCNICAS DA SEMANA</b><div>${weekTechniqueSummary(exercise,week)}</div></div><div class="prescription-set-list">${rows}</div>${exerciseHasOptionalTechnique(exercise,'mp',week)?'<div class="optional-technique-note"><b>MP OPCIONAL</b> — o aluno pode executar estas séries em Myo Reps ou de forma convencional.</div>':''}${completed.length?`<div class="prescription-result">✓ ${completed.length} ${completed.length===1?'sessão registrada':'sessões registradas'} nesta semana</div>`:''}<div class="prescription-actions"><button class="btn-ghost" onclick="openGerInfo()">? ESCALA GER</button>${action}</div></div>`;
};
renderSessionPrescriptionSummary=function(exercise,week,elId){const el=document.getElementById(elId);if(!el)return;const summary=prescriptionCompactSummary(exercise,week),partner=findSupersetPartner(exercise,workoutContainingExercise(exercise),week),techniques=techniqueItemsForExercise(exercise,week);el.innerHTML=summary.rx.sets.length?`<strong>Semana ${week}:</strong> ${esc(summary.reps)} · ${esc(summary.ger)}.${techniques.length?` <b>Técnicas: ${esc(techniques.map(item=>item.code).join(' · '))}.</b>`:''}${partner?` <b>Super set com ${esc(partner.name)}.</b>`:''}${exerciseHasOptionalTechnique(exercise,'mp',week)?' <b>Myo Reps opcional: escolha MP ou séries normais.</b>':''} Preencha somente o que você conseguiu realizar.`:`<strong>Semana ${week}:</strong> sem prescrição cadastrada. O registro continuará disponível, mas confirme a orientação com o treinador.`;};
populateSessionEditorForWeek=function(week){const exercise=getE(SESSION_WID,SESSION_EID);SET_COUNT=0;document.getElementById('sets-editor').innerHTML='';const rx=resolveWeekPrescription(exercise,week),sets=effectivePrescriptionSets(exercise,rx.sets,week);if(sets.length)sets.forEach(set=>addSetRow('','',set));else{for(let i=0;i<3;i++)addSetRow();if(exerciseHasTechnique(exercise,'bos',week))addSetRow('','',{targetMin:8,targetMax:12,ger:3,backoff:true});}document.getElementById('session-result-label').textContent=exerciseUsesResistedTime(exercise,week)?'Tempo':'Reps';renderSessionPrescriptionSummary(exercise,week,'session-prescription-summary');renderRestTimerPresetsForExercise(exercise,week);renderOptionalTechniqueMode(exercise);};

function currentWeekTechniqueEditorConfig(){
  const exercise=getPlanEditExercise();if(!exercise)return null;const ids=[...document.querySelectorAll('#week-technique-picker input[type="checkbox"]:checked')].map(input=>input.value),optional=ids.includes('mp')&&document.getElementById('week-input-myo-optional')?.checked?['mp']:[],supersetExerciseId=ids.includes('ss')?String(document.getElementById('week-input-superset-exercise')?.value||''):'';
  return normalizeWeekTechniqueConfig({techniqueIds:ids,optionalTechniqueIds:optional,supersetExerciseId});
}
function renderWeekTechniqueEditor(){
  const exercise=getPlanEditExercise();if(!exercise)return;const week=Number(document.getElementById('input-prescription-week')?.value)||1,badge=document.getElementById('week-technique-week-badge');if(badge)badge.textContent='SEMANA '+week;
  loadTechniqueCatalog().then(()=>{
    const resolved=resolveWeekTechniqueConfig(exercise,week),host=document.getElementById('week-technique-picker'),source=document.getElementById('week-technique-source');if(!host)return;
    host.innerHTML=TECHNIQUE_CATALOG.items.map(item=>`<label class="technique-picker-item"><input type="checkbox" value="${esc(item.id)}" ${resolved.techniqueIds.includes(item.id)?'checked':''} onchange="onWeekTechniqueSelectionChange()"><span><b>${esc(item.code)}</b><small>${esc(item.name)}</small></span></label>`).join('')||'<div class="plan-help">Nenhuma técnica cadastrada.</div>';
    if(source)source.textContent=resolved.customized?'Configuração personalizada apenas para esta semana.':'Usando as técnicas padrão do exercício. Salvar criará uma configuração independente para esta semana.';
    const optional=document.getElementById('week-input-myo-optional');if(optional)optional.checked=resolved.optionalTechniqueIds.includes('mp');
    const workout=PLAN_EDIT_TARGET==='trainer'?VIEW_STUDENT_WORKOUT:getW(PLAN_EDIT_WID),select=document.getElementById('week-input-superset-exercise');if(select){select.innerHTML='<option value="">Selecione o segundo exercício</option>'+((workout?.exercises||[]).filter(item=>item.id!==exercise.id).map(item=>`<option value="${esc(item.id)}" ${String(resolved.supersetExerciseId)===String(item.id)?'selected':''}>${esc(item.dayName)} · ${esc(item.name)}</option>`).join(''));}
    onWeekTechniqueSelectionChange();
  }).catch(()=>{const host=document.getElementById('week-technique-picker');if(host)host.innerHTML='<div class="plan-help">Não foi possível carregar as técnicas agora.</div>';});
}
function onWeekTechniqueSelectionChange(){
  const ids=[...document.querySelectorAll('#week-technique-picker input[type="checkbox"]:checked')].map(input=>input.value),myo=document.getElementById('week-myo-optional-group'),ss=document.getElementById('week-superset-pair-group');if(myo)myo.style.display=ids.includes('mp')?'block':'none';if(ss)ss.style.display=ids.includes('ss')?'block':'none';if(!ids.includes('mp')){const box=document.getElementById('week-input-myo-optional');if(box)box.checked=false;}if(!ids.includes('ss')){const select=document.getElementById('week-input-superset-exercise');if(select)select.value='';}
  const time=ids.includes('is');document.getElementById('prescription-min-label').textContent=time?'Tempo mín.':'Reps mín.';document.getElementById('prescription-max-label').textContent=time?'Tempo máx.':'Reps máx.';refreshBackoffPrescriptionRow();
}
const V1058_LOAD_PRESCRIPTION_EDITOR=loadPrescriptionEditor;
loadPrescriptionEditor=function(){V1058_LOAD_PRESCRIPTION_EDITOR.apply(this,arguments);renderWeekTechniqueEditor();};
refreshBackoffPrescriptionRow=function(){removeBackoffPrescriptionRow();const config=currentWeekTechniqueEditorConfig()||resolveWeekTechniqueConfig(getPlanEditExercise(),Number(document.getElementById('input-prescription-week')?.value)||1);if(!config?.techniqueIds?.includes('bos'))return;const editor=document.getElementById('prescription-editor'),normalRows=[...editor.querySelectorAll('.plan-set-row:not([data-backoff="1"])')];if(!normalRows.length)return;const source=normalRows[normalRows.length-1],template=prescriptionTemplateFromRow(source)||LAST_PRESCRIPTION_TEMPLATE,row=document.createElement('div');row.className='plan-set-row backoff-row';row.dataset.backoff='1';row.innerHTML=`<span class="set-edit-num">${normalRows.length+1}ª<span class="backoff-label">BOS</span></span><input class="set-edit-input" disabled value="${esc(template.targetMin)}"><input class="set-edit-input" disabled value="${esc(template.targetMax)}"><select class="set-edit-input" disabled><option>${formatGerLevel(template.ger)}</option></select><button class="btn-rm-set" disabled>✕</button><span class="backoff-suggestion">Série automática nesta semana · -20% de carga.</span>`;editor.appendChild(row);};
function validateWeekTechniqueConfig(config){if(config.techniqueIds.includes('ss')&&!config.supersetExerciseId){alert('Selecione o segundo exercício do Super set para esta semana.');return false;}return true;}
function setWeekTechniqueConfig(plan,week,config){const out=normalizeWeeklyTechniquePlan(plan);out['w'+week]=normalizeWeekTechniqueConfig(config);return out;}
function deleteWeekTechniqueConfig(plan,week){const out=normalizeWeeklyTechniquePlan(plan);delete out['w'+week];return out;}
function buildWeekTechniquePlanUpdates(workout,source,weeks,config){
  const updates=new Map(),getPlan=exercise=>updates.has(exercise.id)?updates.get(exercise.id):normalizeWeeklyTechniquePlan(exercise.weeklyTechniquePlan),setPlan=(exercise,plan)=>updates.set(exercise.id,plan);
  for(const week of weeks){
    const normalized=normalizeWeekTechniqueConfig(config),newPartnerId=normalized.techniqueIds.includes('ss')?String(normalized.supersetExerciseId||''):'',oldRelated=(workout.exercises||[]).filter(item=>item.id!==source.id&&(String(resolveWeekTechniqueConfig(item,week).supersetExerciseId||'')===String(source.id)||String(resolveWeekTechniqueConfig(source,week).supersetExerciseId||'')===String(item.id)));
    setPlan(source,setWeekTechniqueConfig(getPlan(source),week,normalized));
    for(const item of oldRelated){if(String(item.id)===newPartnerId)continue;const old=resolveWeekTechniqueConfig(item,week),clean=normalizeWeekTechniqueConfig({...old,techniqueIds:old.techniqueIds.filter(id=>id!=='ss'),supersetExerciseId:''});setPlan(item,setWeekTechniqueConfig(getPlan(item),week,clean));}
    if(newPartnerId){const partner=(workout.exercises||[]).find(item=>String(item.id)===newPartnerId);if(partner){const pcfg=resolveWeekTechniqueConfig(partner,week),ids=pcfg.techniqueIds.includes('ss')?pcfg.techniqueIds:[...pcfg.techniqueIds,'ss'];setPlan(partner,setWeekTechniqueConfig(getPlan(partner),week,{...pcfg,techniqueIds:ids,supersetExerciseId:source.id}));}}
  }
  return updates;
}
function refreshPlanViewsAfterWeeklyTechniqueChange(exercise,week){
  if(PLAN_EDIT_TARGET==='trainer'){TRAINER_ACTIVE_WEEK=week;if(VIEW_STUDENT_WORKOUT){if(VIEW_STUDENT_DAY)renderTsDay();else renderTsWorkout(VIEW_STUDENT_WORKOUT);}if(VIEW_STUDENT_EXERCISE?.id===exercise.id){renderExercisePrescription(exercise,'ts-exercise-prescription-card',week,true,true);renderExerciseTechniquePanels(exercise,true);}}
  else{LAST_SESSION_WEEK=week;if(CUR_DAY)renderDay();else renderWorkout();if(CUR_EX===exercise.id){renderExercise();renderExerciseTechniquePanels(exercise,false);}}
}
async function persistWeekTechniqueConfiguration(config,weeks,{close=false,label='Técnicas salvas'}={}){
  const exercise=getPlanEditExercise(),workout=PLAN_EDIT_TARGET==='trainer'?VIEW_STUDENT_WORKOUT:getW(PLAN_EDIT_WID);if(!exercise||!workout||!validateWeekTechniqueConfig(config))return false;const week=weeks[0],updates=buildWeekTechniquePlanUpdates(workout,exercise,weeks,config),before=new Map([...updates.keys()].map(id=>{const item=workout.exercises.find(e=>e.id===id);return[id,JSON.stringify(item?.weeklyTechniquePlan||{})];}));
  try{
    if(PLAN_EDIT_TARGET==='trainer'){const batch=db.batch();for(const [id,plan] of updates)batch.update(db.collection('exercises').doc(id),{weeklyTechniquePlan:plan});await cloudWrite(batch.commit(),'salvar técnicas por semana');}
    for(const [id,plan] of updates){const item=workout.exercises.find(e=>e.id===id);if(item)item.weeklyTechniquePlan=plan;}if(PLAN_EDIT_TARGET!=='trainer'&&!localSave())throw new Error('Não foi possível salvar no aparelho.');
    if(close)closeModal('modal-prescription');refreshPlanViewsAfterWeeklyTechniqueChange(exercise,week);showToast('✓ '+label);return true;
  }catch(error){for(const [id,raw] of before){const item=workout.exercises.find(e=>e.id===id);if(item)item.weeklyTechniquePlan=JSON.parse(raw||'{}');}alert(cloudWriteError(error,'salvar as técnicas da semana'));return false;}
}
persistPrescription=async function(sets,replicate){
  const exercise=getPlanEditExercise();if(!exercise)return false;const config=currentWeekTechniqueEditorConfig();if(!config||!validateWeekTechniqueConfig(config))return false;const week=Number(document.getElementById('input-prescription-week').value)||1,actionKey='save-prescription-'+exercise.id;if(!beginAction(actionKey,'modal-prescription'))return false;
  const previousPlan=normalizeWeeklyPlan(exercise.weeklyPlan),weeklyPlan=buildWeeklyPlanUpdate(previousPlan,week,sets,replicate),workout=PLAN_EDIT_TARGET==='trainer'?VIEW_STUDENT_WORKOUT:getW(PLAN_EDIT_WID),techUpdates=buildWeekTechniquePlanUpdates(workout,exercise,[week],config),beforeTech=new Map([...techUpdates.keys()].map(id=>{const item=workout.exercises.find(e=>e.id===id);return[id,JSON.stringify(item?.weeklyTechniquePlan||{})];}));
  try{
    if(PLAN_EDIT_TARGET==='trainer'){const batch=db.batch();batch.update(db.collection('exercises').doc(exercise.id),{weeklyPlan,weeklyTechniquePlan:techUpdates.get(exercise.id)||normalizeWeeklyTechniquePlan(exercise.weeklyTechniquePlan)});for(const [id,plan] of techUpdates){if(id!==exercise.id)batch.update(db.collection('exercises').doc(id),{weeklyTechniquePlan:plan});}await cloudWrite(batch.commit(),'salvar prescrição e técnicas');}
    exercise.weeklyPlan=weeklyPlan;for(const [id,plan] of techUpdates){const item=workout.exercises.find(e=>e.id===id);if(item)item.weeklyTechniquePlan=plan;}if(PLAN_EDIT_TARGET!=='trainer'&&!localSave())throw new Error('Falha ao gravar no armazenamento local.');
    closeModal('modal-prescription');refreshPlanViewsAfterWeeklyTechniqueChange(exercise,week);showToast(replicate?'✓ Séries repassadas; técnicas mantidas apenas nesta semana':'✓ Séries e técnicas da semana salvas');return true;
  }catch(error){exercise.weeklyPlan=previousPlan;for(const [id,raw] of beforeTech){const item=workout.exercises.find(e=>e.id===id);if(item)item.weeklyTechniquePlan=JSON.parse(raw||'{}');}alert(cloudWriteError(error,'salvar a prescrição'));return false;}
  finally{endAction(actionKey,'modal-prescription');}
};
function confirmReplicateWeekTechniques(){const week=Number(document.getElementById('input-prescription-week').value)||1,config=currentWeekTechniqueEditorConfig();if(!config||!validateWeekTechniqueConfig(config))return;if(week>=8){persistWeekTechniqueConfiguration(config,[8],{label:'Técnicas da semana 8 salvas'});return;}showConfirm('Repassar técnicas',`Salvar as técnicas da semana ${week} e copiá-las para as semanas ${week+1} a 8? Séries e GER não serão alterados.`,()=>persistWeekTechniqueConfiguration(config,Array.from({length:9-week},(_,i)=>week+i),{label:`Técnicas salvas da semana ${week} à 8`}));}
function restoreWeekTechniquesToDefault(){const exercise=getPlanEditExercise(),workout=PLAN_EDIT_TARGET==='trainer'?VIEW_STUDENT_WORKOUT:getW(PLAN_EDIT_WID),week=Number(document.getElementById('input-prescription-week').value)||1;if(!exercise||!workout)return;showConfirm('Usar padrão do exercício',`Remover a personalização de técnicas da semana ${week} e voltar às técnicas padrão do exercício?`,async()=>{const previous=normalizeWeeklyTechniquePlan(exercise.weeklyTechniquePlan),next=deleteWeekTechniqueConfig(previous,week);try{if(PLAN_EDIT_TARGET==='trainer')await cloudWrite(db.collection('exercises').doc(exercise.id).update({weeklyTechniquePlan:next}),'restaurar técnicas padrão');exercise.weeklyTechniquePlan=next;if(PLAN_EDIT_TARGET!=='trainer'&&!localSave())throw new Error('Não foi possível salvar no aparelho.');loadPrescriptionEditor();refreshPlanViewsAfterWeeklyTechniqueChange(exercise,week);showToast('✓ Técnicas padrão restauradas nesta semana');}catch(error){exercise.weeklyTechniquePlan=previous;alert(cloudWriteError(error,'restaurar as técnicas padrão'));}});}

// Atualiza a identificação do PDF sem alterar documentos existentes.
const V1058_WORKOUT_PDF=workoutPdfHtml;
workoutPdfHtml=function(){return V1058_WORKOUT_PDF.apply(this,arguments).replace(/Team Bulls v10\.5/g,'Team Bulls v10.5.8');};

/* ═══════════════════════════════════════════════════════════════
   TEAM BULLS v10.5.9 — CORREÇÃO DAS TÉCNICAS POR SEMANA
   - interface legível e clicável;
   - salvamento explícito somente da semana atual;
   - semanas realmente independentes após a primeira gravação;
   - cópia para semanas posteriores apenas quando solicitada;
   - correção da série BOS no coletor da prescrição.
═══════════════════════════════════════════════════════════════ */
let WEEK_TECHNIQUE_RENDER_TOKEN=0;
let WEEK_TECHNIQUE_EDITOR_DIRTY=false;

function setWeekTechniqueEditorState(message='',state='idle'){
  const host=document.getElementById('week-technique-save-state');
  if(host){host.textContent=message||'Nenhuma alteração pendente.';host.dataset.state=state;}
  const button=document.getElementById('btn-save-week-techniques');
  if(button)button.classList.toggle('has-pending-changes',state==='dirty');
}
function markWeekTechniqueEditorDirty(){
  WEEK_TECHNIQUE_EDITOR_DIRTY=true;
  setWeekTechniqueEditorState('Alterações ainda não salvas nesta semana.','dirty');
}
function materializeWeeklyTechniquePlan(exercise){
  const existing=normalizeWeeklyTechniquePlan(exercise?.weeklyTechniquePlan),base=baseExerciseTechniqueConfig(exercise),out={};
  for(let week=1;week<=8;week++){
    const key='w'+week;
    out[key]=Object.prototype.hasOwnProperty.call(existing,key)?normalizeWeekTechniqueConfig(existing[key]):normalizeWeekTechniqueConfig(base);
  }
  return out;
}
function weekTechniqueConfigFromPlan(exercise,plan,week){
  const key='w'+Math.max(1,Math.min(8,Number(week)||1));
  return Object.prototype.hasOwnProperty.call(plan||{},key)?normalizeWeekTechniqueConfig(plan[key]):baseExerciseTechniqueConfig(exercise);
}

renderWeekTechniqueEditor=function(){
  const exercise=getPlanEditExercise();if(!exercise)return;
  const week=Math.max(1,Math.min(8,Number(document.getElementById('input-prescription-week')?.value)||1));
  const token=++WEEK_TECHNIQUE_RENDER_TOKEN,exerciseId=String(exercise.id||'');
  const badge=document.getElementById('week-technique-week-badge');if(badge)badge.textContent='SEMANA '+week;
  const host=document.getElementById('week-technique-picker');if(host)host.innerHTML='<div class="plan-help">Carregando biblioteca de técnicas...</div>';
  WEEK_TECHNIQUE_EDITOR_DIRTY=false;setWeekTechniqueEditorState('Carregando configuração da semana...','loading');
  loadTechniqueCatalog().then(()=>{
    const currentExercise=getPlanEditExercise(),currentWeek=Number(document.getElementById('input-prescription-week')?.value)||1;
    if(token!==WEEK_TECHNIQUE_RENDER_TOKEN||!currentExercise||String(currentExercise.id||'')!==exerciseId||currentWeek!==week)return;
    const resolved=resolveWeekTechniqueConfig(currentExercise,week),picker=document.getElementById('week-technique-picker'),source=document.getElementById('week-technique-source');if(!picker)return;
    picker.innerHTML=TECHNIQUE_CATALOG.items.map(item=>`<label class="week-technique-option ${resolved.techniqueIds.includes(item.id)?'selected':''}"><input type="checkbox" value="${esc(item.id)}" ${resolved.techniqueIds.includes(item.id)?'checked':''} onchange="onWeekTechniqueSelectionChange()"><span class="week-technique-option-code">${esc(item.code)}</span><span class="week-technique-option-name">${esc(item.name)}</span><span class="week-technique-option-check" aria-hidden="true">✓</span></label>`).join('')||'<div class="plan-help">Nenhuma técnica cadastrada.</div>';
    if(source)source.textContent=resolved.customized?'Configuração exclusiva da semana '+week+'.':'A semana '+week+' ainda usa o padrão atual do exercício. Ao salvar, ela ficará independente.';
    const optional=document.getElementById('week-input-myo-optional');if(optional)optional.checked=resolved.optionalTechniqueIds.includes('mp');
    const workout=PLAN_EDIT_TARGET==='trainer'?VIEW_STUDENT_WORKOUT:getW(PLAN_EDIT_WID),select=document.getElementById('week-input-superset-exercise');
    if(select){select.innerHTML='<option value="">Selecione o segundo exercício</option>'+((workout?.exercises||[]).filter(item=>String(item.id)!==exerciseId).map(item=>`<option value="${esc(item.id)}" ${String(resolved.supersetExerciseId)===String(item.id)?'selected':''}>${esc(item.dayName)} · ${esc(item.name)}</option>`).join(''));}
    onWeekTechniqueSelectionChange(false);
    WEEK_TECHNIQUE_EDITOR_DIRTY=false;setWeekTechniqueEditorState('Configuração carregada.','saved');
  }).catch(()=>{
    if(token!==WEEK_TECHNIQUE_RENDER_TOKEN)return;
    const picker=document.getElementById('week-technique-picker');if(picker)picker.innerHTML='<div class="plan-help">Não foi possível carregar as técnicas agora.</div>';
    setWeekTechniqueEditorState('Falha ao carregar a biblioteca de técnicas.','error');
  });
};

onWeekTechniqueSelectionChange=function(markDirty=true){
  const checked=[...document.querySelectorAll('#week-technique-picker input[type="checkbox"]:checked')],ids=checked.map(input=>input.value);
  document.querySelectorAll('#week-technique-picker .week-technique-option').forEach(label=>label.classList.toggle('selected',!!label.querySelector('input:checked')));
  const myo=document.getElementById('week-myo-optional-group'),ss=document.getElementById('week-superset-pair-group');
  if(myo)myo.style.display=ids.includes('mp')?'block':'none';
  if(ss)ss.style.display=ids.includes('ss')?'block':'none';
  if(!ids.includes('mp')){const box=document.getElementById('week-input-myo-optional');if(box)box.checked=false;}
  if(!ids.includes('ss')){const select=document.getElementById('week-input-superset-exercise');if(select)select.value='';}
  const time=ids.includes('is'),minLabel=document.getElementById('prescription-min-label'),maxLabel=document.getElementById('prescription-max-label');
  if(minLabel)minLabel.textContent=time?'Tempo mín.':'Reps mín.';
  if(maxLabel)maxLabel.textContent=time?'Tempo máx.':'Reps máx.';
  refreshBackoffPrescriptionRow();
  if(markDirty)markWeekTechniqueEditorDirty();
};

buildWeekTechniquePlanUpdates=function(workout,source,weeks,config){
  const updates=new Map();
  const getPlan=exercise=>updates.has(exercise.id)?updates.get(exercise.id):materializeWeeklyTechniquePlan(exercise);
  const setPlan=(exercise,plan)=>updates.set(exercise.id,normalizeWeeklyTechniquePlan(plan));
  const getConfig=(exercise,week)=>weekTechniqueConfigFromPlan(exercise,getPlan(exercise),week);
  for(const rawWeek of weeks){
    const week=Math.max(1,Math.min(8,Number(rawWeek)||1)),normalized=normalizeWeekTechniqueConfig(config),newPartnerId=normalized.techniqueIds.includes('ss')?String(normalized.supersetExerciseId||''):'';
    const previousSourceConfig=getConfig(source,week),previousPartnerId=String(previousSourceConfig.supersetExerciseId||'');
    // Remove o vínculo antigo da semana somente quando ele realmente mudou.
    if(previousPartnerId&&previousPartnerId!==newPartnerId){
      const oldPartner=(workout.exercises||[]).find(item=>String(item.id)===previousPartnerId);
      if(oldPartner){const oldCfg=getConfig(oldPartner,week);setPlan(oldPartner,setWeekTechniqueConfig(getPlan(oldPartner),week,{...oldCfg,techniqueIds:oldCfg.techniqueIds.filter(id=>id!=='ss'),supersetExerciseId:''}));}
    }
    // Também remove qualquer exercício que ainda aponte para a origem nesta mesma semana.
    for(const item of (workout.exercises||[])){
      if(String(item.id)===String(source.id)||String(item.id)===newPartnerId)continue;
      const itemCfg=getConfig(item,week);
      if(String(itemCfg.supersetExerciseId||'')===String(source.id))setPlan(item,setWeekTechniqueConfig(getPlan(item),week,{...itemCfg,techniqueIds:itemCfg.techniqueIds.filter(id=>id!=='ss'),supersetExerciseId:''}));
    }
    setPlan(source,setWeekTechniqueConfig(getPlan(source),week,normalized));
    if(newPartnerId){
      const partner=(workout.exercises||[]).find(item=>String(item.id)===newPartnerId);
      if(partner){
        const partnerCfg=getConfig(partner,week),partnerOldId=String(partnerCfg.supersetExerciseId||'');
        if(partnerOldId&&partnerOldId!==String(source.id)){
          const former=(workout.exercises||[]).find(item=>String(item.id)===partnerOldId);
          if(former){const formerCfg=getConfig(former,week);setPlan(former,setWeekTechniqueConfig(getPlan(former),week,{...formerCfg,techniqueIds:formerCfg.techniqueIds.filter(id=>id!=='ss'),supersetExerciseId:''}));}
        }
        const ids=partnerCfg.techniqueIds.includes('ss')?partnerCfg.techniqueIds:[...partnerCfg.techniqueIds,'ss'];
        setPlan(partner,setWeekTechniqueConfig(getPlan(partner),week,{...partnerCfg,techniqueIds:ids,supersetExerciseId:source.id}));
      }
    }
  }
  // A origem sempre é materializada nas oito semanas, garantindo independência real.
  if(!updates.has(source.id))updates.set(source.id,materializeWeeklyTechniquePlan(source));
  return updates;
};

collectPrescriptionRows=function(){
  const rows=[...document.querySelectorAll('#prescription-editor .plan-set-row:not([data-backoff="1"])')];
  if(!rows.length){alert('Adicione ao menos uma série prescrita.');return null;}
  const sets=[];
  for(const row of rows){
    const minInput=row.querySelector('[data-f="min"]'),maxInput=row.querySelector('[data-f="max"]'),gerInput=row.querySelector('[data-f="ger"]');
    if(!minInput||!maxInput||!gerInput){alert('Não foi possível ler uma das séries. Feche e abra a prescrição novamente.');return null;}
    const normalized=normalizePrescriptionSet({targetMin:parseInt(minInput.value,10),targetMax:parseInt(maxInput.value,10),ger:parseInt(gerInput.value,10)});
    if(!normalized){alert('Confira a faixa de repetições e o GER de todas as séries.');return null;}
    sets.push(normalized);
  }
  return sets;
};

async function saveCurrentWeekTechniques(){
  const week=Number(document.getElementById('input-prescription-week')?.value)||1,config=currentWeekTechniqueEditorConfig();
  if(!config||!validateWeekTechniqueConfig(config))return;
  setWeekTechniqueEditorState('Salvando técnicas da semana '+week+'...','loading');
  const saved=await persistWeekTechniqueConfiguration(config,[week],{label:'Técnicas da semana '+week+' salvas'});
  if(saved){WEEK_TECHNIQUE_EDITOR_DIRTY=false;renderWeekTechniqueEditor();}
  else setWeekTechniqueEditorState('Não foi possível salvar. Tente novamente.','error');
}
function clearCurrentWeekTechniques(){
  const week=Number(document.getElementById('input-prescription-week')?.value)||1;
  showConfirm('Remover técnicas da semana',`Deixar a semana ${week} sem nenhuma técnica? As séries, repetições e o GER não serão alterados.`,async()=>{
    setWeekTechniqueEditorState('Removendo técnicas da semana '+week+'...','loading');
    const saved=await persistWeekTechniqueConfiguration(normalizeWeekTechniqueConfig({techniqueIds:[]}),[week],{label:'Semana '+week+' salva sem técnicas'});
    if(saved){WEEK_TECHNIQUE_EDITOR_DIRTY=false;renderWeekTechniqueEditor();}
  });
}
confirmReplicateWeekTechniques=function(){
  const week=Number(document.getElementById('input-prescription-week')?.value)||1,config=currentWeekTechniqueEditorConfig();if(!config||!validateWeekTechniqueConfig(config))return;
  if(week>=8){saveCurrentWeekTechniques();return;}
  showConfirm('Copiar técnicas para as próximas semanas',`Copiar exatamente a configuração da semana ${week} para as semanas ${week+1} a 8? As técnicas já personalizadas nessas semanas serão substituídas, mas séries, repetições e GER permanecerão intactos.`,async()=>{
    setWeekTechniqueEditorState('Copiando técnicas para as próximas semanas...','loading');
    const saved=await persistWeekTechniqueConfiguration(config,Array.from({length:9-week},(_,index)=>week+index),{label:`Técnicas copiadas da semana ${week} à 8`});
    if(saved){WEEK_TECHNIQUE_EDITOR_DIRTY=false;renderWeekTechniqueEditor();}
  });
};
restoreWeekTechniquesToDefault=function(){
  const exercise=getPlanEditExercise(),week=Number(document.getElementById('input-prescription-week')?.value)||1;if(!exercise)return;
  const base=baseExerciseTechniqueConfig(exercise);
  showConfirm('Restaurar padrão nesta semana',`Aplicar as técnicas padrão do exercício somente na semana ${week}? As outras semanas não serão alteradas.`,async()=>{
    setWeekTechniqueEditorState('Restaurando o padrão da semana '+week+'...','loading');
    const saved=await persistWeekTechniqueConfiguration(base,[week],{label:'Padrão restaurado apenas na semana '+week});
    if(saved){WEEK_TECHNIQUE_EDITOR_DIRTY=false;renderWeekTechniqueEditor();}
  });
};

const V1059_PDF_VERSION=workoutPdfHtml;
workoutPdfHtml=function(){return V1059_PDF_VERSION.apply(this,arguments).replace(/Team Bulls v10\.5\.8/g,'Team Bulls v10.5.9');};

/* ═══════════════════════════════════════════════════════════════
   TEAM BULLS v10.5.11 — INSTRUÇÕES PADRÃO E NOMES REPETIDOS
   Corrige o uso indevido da semana ativa global nas oito colunas.
═══════════════════════════════════════════════════════════════ */
function weeklyTechniqueCodes(exercise,week){
  const ids=exerciseTechniqueIds(exercise,week);
  return ids.map(id=>{
    const item=TECHNIQUE_CATALOG?.items?.find(entry=>entry.id===id);
    return String(item?.code||id||'').trim().toUpperCase();
  }).filter(Boolean);
}
function weeklyTechniqueOverviewHtml(exercise,week){
  const codes=weeklyTechniqueCodes(exercise,week);
  if(!codes.length)return'<span class="weekly-technique-state none">SEM TÉCNICA</span>';
  const optional=exerciseHasOptionalTechnique(exercise,'mp',week);
  return`<span class="weekly-technique-state${optional?' optional':''}" title="${esc(codes.join(' · ')+(optional?' · Myo Reps opcional':''))}">${esc(codes.join(' · '))}${optional?' · OPC.':''}</span>`;
}

// Cada célula usa explicitamente a própria semana. Antes, BOS, IS, MP e outras
// técnicas podiam ser calculadas usando TRAINER_ACTIVE_WEEK/LAST_SESSION_WEEK.
prescriptionCompactSummary=function(exercise,week){
  const safeWeek=Math.max(1,Math.min(8,Number(week)||1));
  const rx=resolveWeekPrescription(exercise,safeWeek);
  const sets=effectivePrescriptionSets(exercise,rx.sets,safeWeek);
  if(!sets.length)return{ger:'',reps:'Sem prescrição',rx:{...rx,sets}};
  const ranges=[...new Set(sets.map(prescribedRangeLabel))];
  const gers=[...new Set(sets.map(set=>set.ger))];
  const unit=exerciseResultUnit(exercise,safeWeek);
  return{
    ger:gers.length===1?formatGerLevel(gers[0]):'GER '+gers.map(level=>String(level).padStart(2,'0')).join('/'),
    reps:ranges.length===1?sets.length+'×'+ranges[0]+' '+unit:sets.length+' séries',
    rx:{...rx,sets}
  };
};

buildWeeklyBoard=function(workout,elId,trainerMode){
  const el=document.getElementById(elId);if(!el)return;
  const exercises=sortWorkoutExercises(workout);
  if(!exercises.length){el.innerHTML='<div class="prescription-empty">Adicione exercícios para montar as semanas.</div>';return;}
  const weeks=Array.from({length:8},(_,i)=>i+1),activeWeek=trainerMode?TRAINER_ACTIVE_WEEK:LAST_SESSION_WEEK;
  const head=weeks.map(week=>`<th class="${week===activeWeek?'active-week':''}">Semana ${week}</th>`).join('');
  const rows=exercises.map(exercise=>{
    const openExerciseCall=trainerMode?`openTsWeekExercise(${jsArg(exercise.id)},${TRAINER_ACTIVE_WEEK})`:`openStudentWeekExercise(${jsArg(exercise.id)},${LAST_SESSION_WEEK})`;
    const cells=weeks.map(week=>{
      const summary=prescriptionCompactSummary(exercise,week),completed=(exercise.sessions||[]).filter(session=>Number(session.week)===week).length;
      const openWeekCall=trainerMode?`openPrescriptionModal(${jsArg(exercise.id)},${week},'trainer')`:`openStudentWeekExercise(${jsArg(exercise.id)},${week})`;
      const maxGer=summary.rx.sets.reduce((max,set)=>Math.max(max,Number(set.ger)||0),0);
      const content=summary.rx.sets.length
        ?`<span class="weekly-ger">${esc(summary.ger)}</span>${renderGerMeter(maxGer)}<span class="weekly-rx">${esc(summary.reps)}</span>${weeklyTechniqueOverviewHtml(exercise,week)}${summary.rx.inherited?`<span class="weekly-inherited">herda S${summary.rx.sourceWeek}</span>`:''}`
        :`<span class="weekly-empty">sem prescrição</span>${weeklyTechniqueOverviewHtml(exercise,week)}`;
      return`<td><button class="weekly-cell-btn${completed?' completed':''}${week===activeWeek?' active-week':''}" onclick="${openWeekCall}">${completed?`<span class="weekly-done">✓${completed>1?' '+completed:''}</span>`:''}${content}</button></td>`;
    }).join('');
    return`<tr><td><button class="weekly-exercise-name" onclick="${openExerciseCall}">${esc(exercise.name)}</button></td>${cells}</tr>`;
  }).join('');
  el.innerHTML=`<div class="weekly-plan-scroll"><table class="weekly-plan-table"><thead><tr><th>Exercício</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
};

const V10510_REFRESH_WEEK_TECHNIQUES=refreshPlanViewsAfterWeeklyTechniqueChange;
refreshPlanViewsAfterWeeklyTechniqueChange=function(exercise,week){
  V10510_REFRESH_WEEK_TECHNIQUES(exercise,week);
  // Segunda atualização no próximo frame garante que a grade aberta reflita o
  // objeto já persistido, sem manter células produzidas antes do commit.
  requestAnimationFrame(()=>{
    if(PLAN_EDIT_TARGET==='trainer'&&VIEW_STUDENT_WORKOUT){
      const target=VIEW_STUDENT_DAY?{...VIEW_STUDENT_WORKOUT,exercises:exercisesForDay(VIEW_STUDENT_WORKOUT,VIEW_STUDENT_DAY)}:VIEW_STUDENT_WORKOUT;
      buildWeeklyBoard(target,VIEW_STUDENT_DAY?'trainer-day-weekly-board':'trainer-weekly-board',true);
    }else{
      const workout=getW(CUR_WORKOUT);
      if(workout){const target=CUR_DAY?{...workout,exercises:exercisesForDay(workout,CUR_DAY)}:workout;buildWeeklyBoard(target,CUR_DAY?'student-day-weekly-board':'student-weekly-board',false);}
    }
  });
};


/* ═══════════════════════════════════════════════════════════════
   TEAM BULLS v10.5.12 — TÉCNICAS PARA TODOS OS EXERCÍCIOS DA SEMANA
   - replica as técnicas da semana atual para todo o protocolo;
   - não altera séries, repetições, GER ou outras semanas;
   - preserva os pares de Super set, que precisam continuar individuais.
═══════════════════════════════════════════════════════════════ */
function massTechniqueConfigForExercise(sourceConfig,currentConfig,isSource=false){
  const source=normalizeWeekTechniqueConfig(sourceConfig);
  if(isSource)return source;
  const current=normalizeWeekTechniqueConfig(currentConfig);
  const keepSuperset=current.techniqueIds.includes('ss')&&String(current.supersetExerciseId||'');
  const techniqueIds=source.techniqueIds.filter(id=>id!=='ss');
  if(keepSuperset)techniqueIds.push('ss');
  return normalizeWeekTechniqueConfig({
    techniqueIds:[...new Set(techniqueIds)],
    optionalTechniqueIds:source.optionalTechniqueIds.filter(id=>id!=='ss'),
    supersetExerciseId:keepSuperset?String(current.supersetExerciseId||''):''
  });
}
async function commitExerciseTechniqueUpdates(updates){
  const entries=[...updates.entries()];
  if(PLAN_EDIT_TARGET!=='trainer')return;
  // Mantém cada lote bem abaixo do limite de 500 operações do Firestore.
  for(let start=0;start<entries.length;start+=400){
    const batch=db.batch();
    for(const [id,plan] of entries.slice(start,start+400))batch.update(db.collection('exercises').doc(id),{weeklyTechniquePlan:plan});
    await cloudWrite(batch.commit(),'aplicar técnicas a todos os exercícios da semana');
  }
}
async function applyWeekTechniquesToAllExercises(){
  const source=getPlanEditExercise();
  const workout=PLAN_EDIT_TARGET==='trainer'?VIEW_STUDENT_WORKOUT:getW(PLAN_EDIT_WID);
  const week=Math.max(1,Math.min(8,Number(document.getElementById('input-prescription-week')?.value)||1));
  const sourceConfig=currentWeekTechniqueEditorConfig();
  if(!source||!workout||!sourceConfig||!validateWeekTechniqueConfig(sourceConfig))return;
  const exercises=(workout.exercises||[]).filter(item=>item&&item.id);
  if(!exercises.length){alert('Este protocolo ainda não possui exercícios.');return;}
  const updates=new Map(),before=new Map();
  for(const exercise of exercises){
    const currentPlan=materializeWeeklyTechniquePlan(exercise);
    const currentConfig=weekTechniqueConfigFromPlan(exercise,currentPlan,week);
    const nextConfig=massTechniqueConfigForExercise(sourceConfig,currentConfig,String(exercise.id)===String(source.id));
    before.set(exercise.id,JSON.stringify(exercise.weeklyTechniquePlan||{}));
    updates.set(exercise.id,setWeekTechniqueConfig(currentPlan,week,nextConfig));
  }
  setWeekTechniqueEditorState(`Aplicando técnicas da semana ${week} a ${exercises.length} exercícios...`,'loading');
  try{
    await commitExerciseTechniqueUpdates(updates);
    for(const [id,plan] of updates){const exercise=exercises.find(item=>String(item.id)===String(id));if(exercise)exercise.weeklyTechniquePlan=plan;}
    if(PLAN_EDIT_TARGET!=='trainer'&&!localSave())throw new Error('Não foi possível salvar no aparelho.');
    WEEK_TECHNIQUE_EDITOR_DIRTY=false;
    refreshPlanViewsAfterWeeklyTechniqueChange(source,week);
    renderWeekTechniqueEditor();
    showToast(`✓ Técnicas aplicadas a ${exercises.length} exercícios na semana ${week}`);
  }catch(error){
    for(const [id,raw] of before){const exercise=exercises.find(item=>String(item.id)===String(id));if(exercise)exercise.weeklyTechniquePlan=JSON.parse(raw||'{}');}
    setWeekTechniqueEditorState('Não foi possível aplicar as técnicas a todos os exercícios.','error');
    alert(cloudWriteError(error,'aplicar as técnicas a todos os exercícios da semana'));
  }
}
function confirmApplyWeekTechniquesToAllExercises(){
  const workout=PLAN_EDIT_TARGET==='trainer'?VIEW_STUDENT_WORKOUT:getW(PLAN_EDIT_WID);
  const week=Math.max(1,Math.min(8,Number(document.getElementById('input-prescription-week')?.value)||1));
  const config=currentWeekTechniqueEditorConfig();
  if(!workout||!config||!validateWeekTechniqueConfig(config))return;
  const count=(workout.exercises||[]).length;
  const hasSuperset=config.techniqueIds.includes('ss');
  const ssNote=hasSuperset?' O Super set não será criado em massa: os pares SS já existentes serão preservados e cada novo par continuará sendo configurado individualmente.':'';
  showConfirm('Aplicar técnicas a todos os exercícios',`Aplicar a configuração de técnicas da semana ${week} aos ${count} exercícios deste protocolo? Séries, repetições, GER e outras semanas não serão alterados.${ssNote}`,applyWeekTechniquesToAllExercises);
}

const V10512_PDF_VERSION=workoutPdfHtml;
workoutPdfHtml=function(){return V10512_PDF_VERSION.apply(this,arguments).replace(/Team Bulls v10\.5(?:\.\d+)?/g,'Team Bulls v10.5.12');};


/* ═══════════════════════════════════════════════════════════════
   TEAM BULLS v10.5.14 — CONSISTÊNCIA, DIAS RÁPIDOS E PERFORMANCE
   - atualiza imediatamente a visão geral após copiar prescrições;
   - permite alternar entre dias sem sair da tela de montagem;
   - adiciona política de refeição livre dentro de cada dieta;
   - evita renderizar grades pesadas enquanto estão ocultas.
═══════════════════════════════════════════════════════════════ */

const V10513_BASE_COPY_PRESCRIPTION_TO_ALL=v104CopyPrescriptionToAll;
function v10513RefreshPrescriptionBoards(workout){
  if(!workout)return;
  requestAnimationFrame(()=>{
    if(PLAN_EDIT_TARGET==='trainer'&&VIEW_STUDENT_WORKOUT&&String(VIEW_STUDENT_WORKOUT.id)===String(workout.id)){
      if(VIEW_STUDENT_DAY){
        const dayTarget={...VIEW_STUDENT_WORKOUT,exercises:exercisesForDay(VIEW_STUDENT_WORKOUT,VIEW_STUDENT_DAY)};
        buildWeeklyBoard(dayTarget,'trainer-day-weekly-board',true);
      }
      const trainerPanel=document.getElementById('trainer-workout-overview');
      if(trainerPanel?.classList.contains('open'))buildWeeklyBoard(VIEW_STUDENT_WORKOUT,'trainer-weekly-board',true);
      else if(trainerPanel)trainerPanel.dataset.boardDirty='1';
    }else{
      const current=getW(CUR_WORKOUT);
      if(current&&String(current.id)===String(workout.id)){
        if(CUR_DAY){
          const dayTarget={...current,exercises:exercisesForDay(current,CUR_DAY)};
          buildWeeklyBoard(dayTarget,'student-day-weekly-board',false);
        }
        const studentPanel=document.getElementById('student-workout-overview');
        if(studentPanel?.classList.contains('open'))buildWeeklyBoard(current,'student-weekly-board',false);
        else if(studentPanel)studentPanel.dataset.boardDirty='1';
      }
    }
  });
}
v104CopyPrescriptionToAll=async function(copyAllWeeks=false){
  const workout=PLAN_EDIT_TARGET==='trainer'?VIEW_STUDENT_WORKOUT:getW(PLAN_EDIT_WID);
  const result=await V10513_BASE_COPY_PRESCRIPTION_TO_ALL(copyAllWeeks);
  v10513RefreshPrescriptionBoards(workout);
  return result;
};

function renderTrainerDayQuickNav(){
  const host=document.getElementById('trainer-day-quick-nav'),workout=VIEW_STUDENT_WORKOUT;
  if(!host||!workout)return;
  const days=getWorkoutDays(workout);
  host.innerHTML=days.map(day=>{
    const active=normalizedName(day.name)===normalizedName(VIEW_STUDENT_DAY);
    const count=exercisesForDay(workout,day.name).length;
    return `<button class="trainer-day-quick-chip${active?' active':''}" type="button" onclick="openTsDay(${jsArg(day.name)})"><span>${esc(day.name)}</span><small>${count} ${count===1?'exercício':'exercícios'}</small></button>`;
  }).join('')+`<button class="trainer-day-quick-chip add" type="button" onclick="openAddDayModal('student')"><span>+ NOVO DIA</span><small>criar pasta</small></button>`;
  const active=host.querySelector('.trainer-day-quick-chip.active');
  if(active)requestAnimationFrame(()=>active.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'}));
}

const V10513_BOARD_TOKENS=new Map();
function scheduleWeeklyBoardRender(workout,elId,trainerMode){
  const el=document.getElementById(elId);if(!el)return;
  const token=(V10513_BOARD_TOKENS.get(elId)||0)+1;V10513_BOARD_TOKENS.set(elId,token);
  el.innerHTML='<div class="weekly-board-loading">Organizando planilha…</div>';
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    if(V10513_BOARD_TOKENS.get(elId)!==token)return;
    buildWeeklyBoard(workout,elId,trainerMode);
  }));
}

renderWorkout=function(){
  const w=getW(CUR_WORKOUT);if(!w)return goHome();syncWorkoutDays(w);
  document.getElementById('workout-screen-title').textContent='TREINO // '+w.name;
  document.getElementById('student-protocol-summary').innerHTML=protocolSummaryHtml(w);
  const list=document.getElementById('day-folder-list'),empty=document.getElementById('day-folder-empty'),days=getWorkoutDays(w);
  list.innerHTML=renderDayFolders(w,false);empty.style.display=days.length?'none':'block';bindReorderContainer(list,'day','self');
  const toggle=document.getElementById('student-overview-toggle');if(toggle)toggle.style.display=w.exercises.length?'block':'none';
  const panel=document.getElementById('student-workout-overview');if(panel){panel.classList.remove('open');panel.dataset.boardDirty='1';}
  const board=document.getElementById('student-weekly-board');if(board)board.innerHTML='<div class="weekly-board-loading">A visão geral será montada quando você abrir.</div>';
  if(toggle)toggle.textContent='▤ MOSTRAR VISÃO GERAL DAS 8 SEMANAS';
};
renderTsWorkout=function(w){
  if(!w)return goTrainerStudent();syncWorkoutDays(w);
  document.getElementById('ts-workout-title').textContent='TREINO // '+w.name;
  document.getElementById('trainer-protocol-summary').innerHTML=protocolSummaryHtml(w);
  const list=document.getElementById('trainer-day-folder-list'),empty=document.getElementById('trainer-day-folder-empty'),days=getWorkoutDays(w);
  list.innerHTML=renderDayFolders(w,true);empty.style.display=days.length?'none':'block';bindReorderContainer(list,'day','student');
  const toggle=document.getElementById('trainer-overview-toggle');if(toggle)toggle.style.display=w.exercises.length?'block':'none';
  const panel=document.getElementById('trainer-workout-overview');if(panel){panel.classList.remove('open');panel.dataset.boardDirty='1';}
  const board=document.getElementById('trainer-weekly-board');if(board)board.innerHTML='<div class="weekly-board-loading">A visão geral será montada quando você abrir.</div>';
  if(toggle)toggle.textContent='▤ MOSTRAR VISÃO GERAL DAS 8 SEMANAS';
};
toggleWorkoutOverview=function(trainerMode){
  const panel=document.getElementById(trainerMode?'trainer-workout-overview':'student-workout-overview'),button=document.getElementById(trainerMode?'trainer-overview-toggle':'student-overview-toggle');if(!panel||!button)return;
  const open=!panel.classList.contains('open');panel.classList.toggle('open',open);button.textContent=open?'▤ OCULTAR VISÃO GERAL DAS 8 SEMANAS':'▤ MOSTRAR VISÃO GERAL DAS 8 SEMANAS';
  if(open){
    const workout=trainerMode?VIEW_STUDENT_WORKOUT:getW(CUR_WORKOUT);
    if(workout){scheduleWeeklyBoardRender(workout,trainerMode?'trainer-weekly-board':'student-weekly-board',trainerMode);panel.dataset.boardDirty='0';}
  }
};
renderDay=function(){
  const w=getW(CUR_WORKOUT);if(!w)return goHome();const day=getWorkoutDays(w).find(item=>normalizedName(item.name)===normalizedName(CUR_DAY));if(!day)return goWorkout();
  CUR_DAY=day.name;const items=exercisesForDay(w,day.name),dayWorkout={...w,exercises:items};
  document.getElementById('day-screen-title').textContent='DIA // '+day.name;
  document.getElementById('student-day-summary').innerHTML=protocolSummaryHtml(w,day.name);
  const list=document.getElementById('exercise-list'),empty=document.getElementById('exercise-empty');list.innerHTML=renderExerciseRows(items,false);empty.style.display=items.length?'none':'block';
  scheduleWeeklyBoardRender(dayWorkout,'student-day-weekly-board',false);
};
renderTsDay=function(){
  const w=VIEW_STUDENT_WORKOUT;if(!w)return goTrainerStudent();const day=getWorkoutDays(w).find(item=>normalizedName(item.name)===normalizedName(VIEW_STUDENT_DAY));if(!day)return goTsWorkout();
  VIEW_STUDENT_DAY=day.name;const items=exercisesForDay(w,day.name),dayWorkout={...w,exercises:items};
  document.getElementById('ts-day-title').textContent='DIA // '+day.name;
  document.getElementById('trainer-day-summary').innerHTML=protocolSummaryHtml(w,day.name);
  renderTrainerDayQuickNav();
  const list=document.getElementById('ts-exercise-list'),empty=document.getElementById('ts-day-exercise-empty');list.innerHTML=renderExerciseRows(items,true);empty.style.display=items.length?'none':'block';bindReorderContainer(list,'exercise','student');
  scheduleWeeklyBoardRender(dayWorkout,'trainer-day-weekly-board',true);
};

function normalizeDietFreeMealPolicy(value){
  const raw=value&&typeof value==='object'?value:{};
  return{
    maxCalories:Math.max(0,Math.min(10000,Math.round(Number(raw.maxCalories)||1000))),
    mealsToReplace:Math.max(0,Math.min(10,Math.round(Number(raw.mealsToReplace)||2))),
    intervalDays:Math.max(1,Math.min(365,Math.round(Number(raw.intervalDays)||7)))
  };
}
const V10513_BASE_NORMALIZE_DIET_PLAN=normalizeDietPlan;
normalizeDietPlan=function(plan,index=0){
  const result=V10513_BASE_NORMALIZE_DIET_PLAN(plan,index);
  result.freeMealPolicy=normalizeDietFreeMealPolicy(plan?.freeMealPolicy||result.freeMealPolicy);
  return result;
};
function dietFreeMealPolicyText(policy){
  const p=normalizeDietFreeMealPolicy(policy);
  const meals=p.mealsToReplace===1?'1 refeição':`${p.mealsToReplace} refeições`;
  const interval=p.intervalDays===1?'1 dia':`${p.intervalDays} dias`;
  return `Até ${p.maxCalories.toLocaleString('pt-BR')} kcal · substituir ${meals} do dia · intervalo mínimo de ${interval}`;
}
function renderDietFreeMealPolicy(hostId,plan,canEdit=false){
  const host=document.getElementById(hostId);if(!host||!plan)return;
  const p=normalizeDietFreeMealPolicy(plan.freeMealPolicy);
  host.innerHTML=`<section class="diet-free-meal-policy"><div class="diet-free-meal-policy-icon">🍔</div><div class="diet-free-meal-policy-main"><span>REFEIÇÃO LIVRE</span><strong>${esc(dietFreeMealPolicyText(p))}</strong><small>Orientação definida pelo treinador para esta dieta.</small></div>${canEdit?`<button class="section-mini-btn" type="button" onclick="openEditDietModal(${jsArg(plan.id)})">EDITAR</button>`:''}</section>`;
}
const V10513_BASE_OPEN_ADD_DIET=openAddDietModal;
openAddDietModal=function(){
  V10513_BASE_OPEN_ADD_DIET();
  const values={
    'input-diet-free-meal-max-calories':1000,
    'input-diet-free-meal-replacements':2,
    'input-diet-free-meal-interval':7
  };
  Object.entries(values).forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.value=String(value);});
};
const V10513_BASE_OPEN_EDIT_DIET=openEditDietModal;
openEditDietModal=function(id=CURRENT_DIET_ID){
  V10513_BASE_OPEN_EDIT_DIET(id);
  const plan=DIET_DOCUMENT.plans.find(item=>String(item.id)===String(id));if(!plan)return;
  const p=normalizeDietFreeMealPolicy(plan.freeMealPolicy);
  const values={
    'input-diet-free-meal-max-calories':p.maxCalories,
    'input-diet-free-meal-replacements':p.mealsToReplace,
    'input-diet-free-meal-interval':p.intervalDays
  };
  Object.entries(values).forEach(([field,value])=>{const el=document.getElementById(field);if(el)el.value=String(value);});
};
saveDietPlan=async function(){
  if(!dietCanEdit()||!beginAction('save-diet','modal-diet'))return;
  const name=document.getElementById('input-diet-name').value.trim(),active=document.getElementById('input-diet-active').value==='true',startDate=document.getElementById('input-diet-start-date').value,updateDate=document.getElementById('input-diet-update-date').value;
  const freeMealPolicy=normalizeDietFreeMealPolicy({
    maxCalories:document.getElementById('input-diet-free-meal-max-calories')?.value,
    mealsToReplace:document.getElementById('input-diet-free-meal-replacements')?.value,
    intervalDays:document.getElementById('input-diet-free-meal-interval')?.value
  });
  if(!name){alert('Informe o nome da dieta.');endAction('save-diet','modal-diet');return;}
  if(!validIsoDate(startDate)||!validIsoDate(updateDate)||updateDate<startDate){alert('Confira as datas da dieta.');endAction('save-diet','modal-diet');return;}
  const snapshot=JSON.stringify(DIET_DOCUMENT);
  try{
    let plan=DIET_DOCUMENT.plans.find(item=>item.id===EDIT_DIET_PLAN_ID);
    if(plan)Object.assign(plan,{name,isActive:active,startDate,updateDate,freeMealPolicy});
    else{plan=normalizeDietPlan({id:uid(),name,isActive:active,order:DIET_DOCUMENT.plans.length,startDate,updateDate,variants:[],freeMealPolicy},DIET_DOCUMENT.plans.length);DIET_DOCUMENT.plans.push(plan);EDIT_DIET_PLAN_ID=plan.id;}
    if(active)DIET_DOCUMENT.plans.forEach(item=>{if(item.id!==plan.id)item.isActive=false;});
    DIET_DOCUMENT=normalizeDietDocument(DIET_DOCUMENT);await persistDietDocument();closeModal('modal-diet');
    const trainer=DIET_CONTEXT.trainer;renderDietList(trainer?'ts-meals-list':'meals-list',trainer?'ts-meals-empty':'meals-empty',trainer);showToast('✓ Dieta salva');
    if(CURRENT_DIET_ID===plan.id)renderDietFreeMealPolicy(trainer?'ts-diet-free-meal-policy':'diet-free-meal-policy',plan,trainer);
    if(trainer&&active&&DIET_CONTEXT.targetUid)await v104SyncCycleSchedule(DIET_CONTEXT.targetUid,startDate,updateDate,'diet').catch(()=>{});
  }catch(error){DIET_DOCUMENT=normalizeDietDocument(JSON.parse(snapshot));alert(cloudWriteError(error,'salvar a dieta'));}
  finally{endAction('save-diet','modal-diet');}
};
const V10513_BASE_OPEN_DIET_DETAIL=openDietDetail;
openDietDetail=async function(id,trainerMode=false){
  await V10513_BASE_OPEN_DIET_DETAIL(id,trainerMode);
  const plan=currentDiet();if(plan)renderDietFreeMealPolicy(trainerMode?'ts-diet-free-meal-policy':'diet-free-meal-policy',plan,trainerMode&&dietCanEdit());
};

/* ═══════════════════════════════════════════════════════════════
   TEAM BULLS v10.5.15 — IS E SÉRIES INTELIGENTES
   - ao adicionar IS na semana, cria 3 séries de 35–45 segundos;
   - a primeira série replica min./máx. para as demais;
   - séries seguintes continuam editáveis individualmente;
   - uma nova série copia a série imediatamente acima.
═══════════════════════════════════════════════════════════════ */

function v10515NormalPrescriptionRows(){
  return [...document.querySelectorAll('#prescription-editor .plan-set-row:not([data-backoff="1"])')];
}

function v10515RenumberPrescriptionRows(){
  const rows=v10515NormalPrescriptionRows();
  rows.forEach((row,index)=>{
    const number=row.querySelector('.set-edit-num');
    if(number)number.textContent=(index+1)+'ª';
  });
  PLAN_SET_COUNT=rows.length;
  return rows;
}

function v10515PropagateFirstSeriesField(fieldName,value){
  const rows=v10515NormalPrescriptionRows();
  if(rows.length<2)return;
  for(const row of rows.slice(1)){
    const input=row.querySelector(`[data-f="${fieldName}"]`);
    if(input)input.value=value;
  }
  // Se houver BOS, sua linha automática deve refletir a última série normal.
  refreshBackoffPrescriptionRow();
}

function v10515BindFirstSeriesReplication(){
  const rows=v10515NormalPrescriptionRows();
  const first=rows[0];
  if(!first)return;
  for(const fieldName of ['min','max']){
    const input=first.querySelector(`[data-f="${fieldName}"]`);
    if(!input||input.dataset.v10515MasterBound==='1')continue;
    input.dataset.v10515MasterBound='1';
    input.addEventListener('input',()=>v10515PropagateFirstSeriesField(fieldName,input.value));
    input.addEventListener('change',()=>v10515PropagateFirstSeriesField(fieldName,input.value));
  }
}

const V10515_BASE_ADD_PRESCRIPTION_SET_ROW=addPrescriptionSetRow;
addPrescriptionSetRow=function(targetMin,targetMax,ger){
  let result;
  if(arguments.length===0){
    // A nova série herda sempre a série imediatamente acima, e não a última
    // série tocada em outro ponto do editor.
    const rows=v10515NormalPrescriptionRows();
    const source=rows[rows.length-1]||null;
    const inherited=prescriptionTemplateFromRow(source)||LAST_PRESCRIPTION_TEMPLATE;
    result=V10515_BASE_ADD_PRESCRIPTION_SET_ROW(inherited.targetMin,inherited.targetMax,inherited.ger);
  }else result=V10515_BASE_ADD_PRESCRIPTION_SET_ROW.apply(this,arguments);
  v10515RenumberPrescriptionRows();
  v10515BindFirstSeriesReplication();
  return result;
};

removePrescriptionSet=function(button){
  const row=button?.closest?.('.plan-set-row');
  if(!row||row.dataset.backoff==='1')return;
  removeBackoffPrescriptionRow();
  row.remove();
  v10515RenumberPrescriptionRows();
  refreshBackoffPrescriptionRow();
  v10515BindFirstSeriesReplication();
};

function v10515ApplyIsometricSupportDefaults(){
  const editor=document.getElementById('prescription-editor');
  if(!editor)return;
  const first=v10515NormalPrescriptionRows()[0];
  const currentGer=parseInt(first?.querySelector('[data-f="ger"]')?.value,10);
  const ger=Number.isInteger(currentGer)?currentGer:3;
  removeBackoffPrescriptionRow();
  editor.innerHTML='';
  PLAN_SET_COUNT=0;
  LAST_PRESCRIPTION_TEMPLATE={targetMin:35,targetMax:45,ger};
  for(let index=0;index<3;index++)addPrescriptionSetRow(35,45,ger);
  refreshBackoffPrescriptionRow();
  v10515BindFirstSeriesReplication();
  const help=document.getElementById('prescription-source-help');
  if(help)help.textContent='IS adicionada: padrão ajustado para 3 séries de 35 a 45 segundos. Você ainda pode personalizar esta semana.';
}

const V10515_BASE_WEEK_TECHNIQUE_SELECTION_CHANGE=onWeekTechniqueSelectionChange;
onWeekTechniqueSelectionChange=function(markDirty=true){
  const picker=document.getElementById('week-technique-picker');
  const previousIs=picker?.dataset.v10515IsSelected==='1';
  const currentIs=!!picker?.querySelector('input[value="is"]:checked');
  const result=V10515_BASE_WEEK_TECHNIQUE_SELECTION_CHANGE.apply(this,arguments);
  if(picker)picker.dataset.v10515IsSelected=currentIs?'1':'0';
  // Na renderização inicial apenas registramos o estado; o padrão é aplicado
  // somente quando o treinador efetivamente adiciona IS nesta semana.
  if(markDirty&&currentIs&&!previousIs){
    v10515ApplyIsometricSupportDefaults();
    if(picker)picker.dataset.v10515IsDefaultsApplied='1';
    setWeekTechniqueEditorState('IS adicionada: 3 × 35–45 segundos preparados. Salve a semana para confirmar.','dirty');
  }
  if(!currentIs&&picker)picker.dataset.v10515IsDefaultsApplied='0';
  return result;
};

async function v10515PersistIsDefaultPrescription(exercise,week){
  const editorSets=v10515NormalPrescriptionRows().map(row=>normalizePrescriptionSet({
    targetMin:parseInt(row.querySelector('[data-f="min"]')?.value,10),
    targetMax:parseInt(row.querySelector('[data-f="max"]')?.value,10),
    ger:parseInt(row.querySelector('[data-f="ger"]')?.value,10)
  })).filter(Boolean);
  const sets=editorSets.length?editorSets:Array.from({length:3},()=>({targetMin:35,targetMax:45,ger:3}));
  const previousPlan=normalizeWeeklyPlan(exercise.weeklyPlan);
  const weeklyPlan=buildWeeklyPlanUpdate(previousPlan,week,sets,false);
  if(PLAN_EDIT_TARGET==='trainer'){
    await cloudWrite(db.collection('exercises').doc(exercise.id).update({weeklyPlan}),'salvar padrão da técnica IS');
  }
  exercise.weeklyPlan=weeklyPlan;
  if(PLAN_EDIT_TARGET!=='trainer'&&!localSave()){
    exercise.weeklyPlan=previousPlan;
    throw new Error('Não foi possível salvar o padrão da técnica IS no aparelho.');
  }
  const workout=PLAN_EDIT_TARGET==='trainer'?VIEW_STUDENT_WORKOUT:getW(PLAN_EDIT_WID);
  v10513RefreshPrescriptionBoards(workout);
}

saveCurrentWeekTechniques=async function(){
  const exercise=getPlanEditExercise();
  const week=Number(document.getElementById('input-prescription-week')?.value)||1;
  const config=currentWeekTechniqueEditorConfig();
  if(!exercise||!config||!validateWeekTechniqueConfig(config))return;
  const hadIs=resolveWeekTechniqueConfig(exercise,week).techniqueIds.includes('is');
  const addsIs=config.techniqueIds.includes('is')&&!hadIs;
  const picker=document.getElementById('week-technique-picker');
  if(addsIs&&picker?.dataset.v10515IsDefaultsApplied!=='1'){
    v10515ApplyIsometricSupportDefaults();
    picker.dataset.v10515IsDefaultsApplied='1';
  }
  setWeekTechniqueEditorState('Salvando técnicas da semana '+week+'...','loading');
  const saved=await persistWeekTechniqueConfiguration(config,[week],{label:'Técnicas da semana '+week+' salvas'});
  if(!saved){setWeekTechniqueEditorState('Não foi possível salvar. Tente novamente.','error');return;}
  if(addsIs){
    try{
      await v10515PersistIsDefaultPrescription(exercise,week);
      setWeekTechniqueEditorState('IS salva com 3 × 35–45 segundos.','saved');
    }catch(error){
      setWeekTechniqueEditorState('A técnica foi salva, mas a prescrição padrão não pôde ser gravada.','error');
      alert(cloudWriteError(error,'salvar o padrão 3 × 35–45 segundos da técnica IS'));
      return;
    }
  }
  WEEK_TECHNIQUE_EDITOR_DIRTY=false;
  renderWeekTechniqueEditor();
};

// Garante a regra da primeira série também ao abrir uma prescrição existente.
const V10515_BASE_LOAD_PRESCRIPTION_EDITOR=loadPrescriptionEditor;
loadPrescriptionEditor=function(){
  const result=V10515_BASE_LOAD_PRESCRIPTION_EDITOR.apply(this,arguments);
  v10515RenumberPrescriptionRows();
  v10515BindFirstSeriesReplication();
  return result;
};

const V10515_PDF_VERSION=workoutPdfHtml;
workoutPdfHtml=function(){return V10515_PDF_VERSION.apply(this,arguments).replace(/Team Bulls v10\.5(?:\.\d+)?/g,'Team Bulls v10.5.15');};

/* ═══════════════════════════════════════════════════════════════
   TEAM BULLS v10.5.16 — PROPAGAÇÃO DIRECIONAL DE TÉCNICAS
   Três ações independentes, sempre respeitando a ordem do dia:
   1) exercícios abaixo na semana atual;
   2) semanas seguintes do exercício atual;
   3) exercícios abaixo nas semanas seguintes.
   Séries, repetições e GER nunca são alterados por estas ações.
═══════════════════════════════════════════════════════════════ */
function v10516TechniquePropagationContext(){
  const source=getPlanEditExercise();
  const workout=PLAN_EDIT_TARGET==='trainer'?VIEW_STUDENT_WORKOUT:getW(PLAN_EDIT_WID);
  const week=Math.max(1,Math.min(8,Number(document.getElementById('input-prescription-week')?.value)||1));
  const config=currentWeekTechniqueEditorConfig();
  if(!source||!workout||!config||!validateWeekTechniqueConfig(config))return null;
  const dayExercises=exercisesForDay(workout,source.dayName||'Treino geral');
  const sourceIndex=dayExercises.findIndex(item=>String(item.id)===String(source.id));
  const below=sourceIndex>=0?dayExercises.slice(sourceIndex+1):[];
  return{source,workout,week,config:normalizeWeekTechniqueConfig(config),below};
}
function v10516TargetPropagationConfig(sourceConfig,currentConfig){
  const source=normalizeWeekTechniqueConfig(sourceConfig),current=normalizeWeekTechniqueConfig(currentConfig);
  const ids=source.techniqueIds.filter(id=>id!=='ss');
  let supersetExerciseId='';
  // Super set exige um par próprio. Só é preservado no destino quando ele já
  // possui um vínculo válido; nunca é criado em massa com o parceiro da origem.
  if(source.techniqueIds.includes('ss')&&current.techniqueIds.includes('ss')&&String(current.supersetExerciseId||'')){
    ids.push('ss');supersetExerciseId=String(current.supersetExerciseId||'');
  }
  return normalizeWeekTechniqueConfig({
    techniqueIds:[...new Set(ids)],
    optionalTechniqueIds:source.optionalTechniqueIds.filter(id=>ids.includes(id)),
    supersetExerciseId
  });
}
function v10516AbsorbTechniqueUpdates(shadow,aggregate,updates){
  for(const [id,plan] of updates){
    const item=(shadow.exercises||[]).find(exercise=>String(exercise.id)===String(id));
    if(item)item.weeklyTechniquePlan=plan;
    aggregate.set(id,plan);
  }
}
function v10516BuildPropagationUpdates(context,mode){
  const{source,workout,week,config,below}=context;
  const shadow={...workout,exercises:(workout.exercises||[]).map(item=>({...item,weeklyTechniquePlan:normalizeWeeklyTechniquePlan(item.weeklyTechniquePlan)}))};
  const aggregate=new Map(),shadowSource=shadow.exercises.find(item=>String(item.id)===String(source.id));
  if(!shadowSource)return aggregate;
  // O clique também salva a configuração que está aberta na origem.
  v10516AbsorbTechniqueUpdates(shadow,aggregate,buildWeekTechniquePlanUpdates(shadow,shadowSource,[week],config));
  if(mode==='source-future'||mode==='full-forward'){
    const futureWeeks=Array.from({length:Math.max(0,8-week)},(_,index)=>week+index+1);
    if(futureWeeks.length)v10516AbsorbTechniqueUpdates(shadow,aggregate,buildWeekTechniquePlanUpdates(shadow,shadowSource,futureWeeks,config));
    if(mode==='source-future')return aggregate;
  }
  const weeks=mode==='below-current'?[week]:mode==='full-forward'?Array.from({length:9-week},(_,index)=>week+index):Array.from({length:Math.max(0,8-week)},(_,index)=>week+index+1);
  for(const originalTarget of below){
    const target=shadow.exercises.find(item=>String(item.id)===String(originalTarget.id));
    if(!target)continue;
    for(const targetWeek of weeks){
      const currentPlan=materializeWeeklyTechniquePlan(target);
      const currentConfig=weekTechniqueConfigFromPlan(target,currentPlan,targetWeek);
      const targetConfig=v10516TargetPropagationConfig(config,currentConfig);
      v10516AbsorbTechniqueUpdates(shadow,aggregate,buildWeekTechniquePlanUpdates(shadow,target,[targetWeek],targetConfig));
    }
  }
  return aggregate;
}
async function v10516RunTechniquePropagation(mode){
  const context=v10516TechniquePropagationContext();if(!context)return;
  const updates=v10516BuildPropagationUpdates(context,mode);
  if(!updates.size){setWeekTechniqueEditorState('Nenhum destino disponível para esta ação.','error');return;}
  const actualById=new Map((context.workout.exercises||[]).map(item=>[String(item.id),item]));
  const before=new Map([...updates.keys()].map(id=>[String(id),JSON.stringify(actualById.get(String(id))?.weeklyTechniquePlan||{})]));
  const labels={
    'below-current':`Aplicando na semana ${context.week} aos exercícios abaixo...`,
    'source-future':'Copiando para as semanas seguintes deste exercício...',
    'below-future':'Aplicando aos exercícios abaixo nas semanas seguintes...',
    'full-forward':'Aplicando a configuração em toda a área abaixo e à frente...'
  };
  setWeekTechniqueEditorState(labels[mode]||'Aplicando técnicas...','loading');
  try{
    if(PLAN_EDIT_TARGET==='trainer')await commitExerciseTechniqueUpdates(updates);
    for(const[id,plan]of updates){const item=actualById.get(String(id));if(item)item.weeklyTechniquePlan=plan;}
    if(PLAN_EDIT_TARGET!=='trainer'&&!localSave())throw new Error('Não foi possível salvar no aparelho.');
    WEEK_TECHNIQUE_EDITOR_DIRTY=false;
    refreshPlanViewsAfterWeeklyTechniqueChange(context.source,context.week);
    renderWeekTechniqueEditor();
    const success={
      'below-current':`✓ Técnicas aplicadas a ${context.below.length} exercício(s) abaixo na semana ${context.week}`,
      'source-future':`✓ Técnicas copiadas para as semanas ${Math.min(8,context.week+1)} a 8 deste exercício`,
      'below-future':`✓ Técnicas aplicadas aos exercícios abaixo nas semanas ${Math.min(8,context.week+1)} a 8`,
      'full-forward':`✓ Configuração aplicada ao exercício atual, aos ${context.below.length} exercício(s) abaixo e às semanas ${context.week} a 8`
    };
    showToast(success[mode]||'✓ Técnicas aplicadas');
  }catch(error){
    for(const[id,raw]of before){const item=actualById.get(String(id));if(item)item.weeklyTechniquePlan=JSON.parse(raw||'{}');}
    setWeekTechniqueEditorState('Não foi possível concluir a propagação.','error');
    alert(cloudWriteError(error,'propagar as técnicas'));
  }
}
function confirmPropagateWeekTechniques(mode){
  const context=v10516TechniquePropagationContext();if(!context)return;
  if(mode!=='source-future'&&!context.below.length){alert('Não há exercícios abaixo deste exercício no dia atual.');return;}
  if((mode==='source-future'||mode==='below-future')&&context.week>=8){alert('Esta já é a semana 8. Não há semanas seguintes.');return;}
  const empty=!context.config.techniqueIds.length;
  const action=empty?'remover todas as técnicas':'copiar esta configuração de técnicas';
  const supersetNote=context.config.techniqueIds.includes('ss')?' Super set não será criado automaticamente nos outros exercícios; vínculos SS próprios já existentes serão preservados.':'';
  let title='',message='';
  if(mode==='below-current'){
    title='Aplicar aos exercícios abaixo';
    message=`Deseja ${action} nos ${context.below.length} exercício(s) abaixo, somente na semana ${context.week}? Séries, repetições e GER não serão alterados.${supersetNote}`;
  }else if(mode==='source-future'){
    title='Copiar às semanas seguintes';
    message=`Deseja ${action} neste mesmo exercício, da semana ${context.week+1} até a semana 8? A semana atual também será salva. Séries, repetições e GER não serão alterados.`;
  }else{
    title='Aplicar abaixo nas semanas seguintes';
    message=`Deseja ${action} nos ${context.below.length} exercício(s) abaixo, da semana ${context.week+1} até a semana 8? Séries, repetições e GER não serão alterados.${supersetNote}`;
  }
  showConfirm(title,message,()=>v10516RunTechniquePropagation(mode));
}


/* ═══════════════════════════════════════════════════════════════
   TEAM BULLS v10.5.17 — PROPAGAÇÃO COMPLETA COM UM CLIQUE
   Aplica a configuração aberta a todo o retângulo de progressão:
   - exercício atual, da semana atual até a semana 8;
   - exercícios abaixo, da semana atual até a semana 8.
   Configuração vazia remove as técnicas nos mesmos destinos.
═══════════════════════════════════════════════════════════════ */
let V10517_COMPLETE_PROPAGATION_RUNNING=false;
async function propagateTechniquesCompleteOneClick(){
  if(V10517_COMPLETE_PROPAGATION_RUNNING)return;
  const context=v10516TechniquePropagationContext();
  if(!context)return;
  if(!context.below.length&&context.week>=8){
    setWeekTechniqueEditorState('Não existem exercícios abaixo nem semanas seguintes para propagar.','error');
    return;
  }
  const button=document.getElementById('btn-propagate-techniques-complete');
  V10517_COMPLETE_PROPAGATION_RUNNING=true;
  if(button){button.disabled=true;button.dataset.originalText=button.textContent;button.textContent='APLICANDO...';}
  try{
    await v10516RunTechniquePropagation('full-forward');
  }finally{
    V10517_COMPLETE_PROPAGATION_RUNNING=false;
    if(button){button.disabled=false;button.textContent=button.dataset.originalText||'↘ APLICAR EM TUDO ABAIXO E À FRENTE';}
  }
}

const V10516_PDF_VERSION=workoutPdfHtml;
workoutPdfHtml=function(){return V10516_PDF_VERSION.apply(this,arguments).replace(/Team Bulls v10\.5(?:\.\d+)?/g,'Team Bulls v10.5.17');};

const V10517_PDF_VERSION=workoutPdfHtml;
workoutPdfHtml=function(){return V10517_PDF_VERSION.apply(this,arguments).replace(/Team Bulls v10\.5(?:\.\d+)?/g,'Team Bulls v10.5.17');};

/* ═══════════════════════════════════════════════════════════════
   TEAM BULLS v10.6 — AUDITORIA DE ESTABILIDADE, DESEMPENHO E SEGURANÇA
   Camada final compatível com os dados das versões anteriores.
═══════════════════════════════════════════════════════════════ */

const V106_VERSION='10.10.9';
const V106_RULES_FILE='firestore_26_compacto.rules';

/* Corrige mensagens de permissão antigas e diferencia falhas de autenticação,
   regras, conexão e cota do navegador. */
cloudWriteError=function(error,action='concluir a operação'){
  const code=String(error?.code||'');
  const message=String(error?.message||'Falha desconhecida');
  if(code.includes('permission-denied')||/missing or insufficient permissions/i.test(message)){
    return `Permissão recusada pelo Firebase ao ${action}. Confirme que ${V106_RULES_FILE} foi publicado em Firestore Database → Regras e entre novamente na conta.`;
  }
  if(code.includes('unauthenticated')||/requires recent authentication|not authenticated/i.test(message)){
    return `Sua sessão não está mais válida para ${action}. Saia da conta, entre novamente e repita a operação.`;
  }
  if(code.includes('resource-exhausted')||/quota|storage.*full|exceeded/i.test(message)){
    return `O limite de armazenamento ou de operações foi atingido ao ${action}. Aguarde alguns minutos e verifique a cota do Firebase.`;
  }
  if(code.includes('unavailable')||code.includes('deadline-exceeded')||code==='team-bulls/timeout'||/network|offline|failed to fetch|tempo esgotado/i.test(message)){
    return `O servidor não respondeu ao ${action}. Os dados em edição foram mantidos; verifique a conexão e tente novamente.`;
  }
  return (code?code+' — ':'')+message;
};

/* Carregamento de SDK com timeout real, detecção de script já carregado e
   possibilidade de nova tentativa depois de uma falha. A implementação antiga
   podia aguardar para sempre quando uma tag <script> já havia falhado. */
const V106_SDK_TIMEOUT_MS=9000;
// firebase-app carrega primeiro; auth e firestore compartilham a segunda etapa.
const FIREBASE_CORE_TIMEOUT_MS=2*V106_SDK_TIMEOUT_MS+800;
let V106_FIREBASE_READY_PROMISE=null;
loadSdkOnce=function(src,globalReady){
  if(globalReady?.())return Promise.resolve(true);
  if(SDK_LOAD_PROMISES.has(src))return SDK_LOAD_PROMISES.get(src);
  const promise=new Promise(resolve=>{
    let settled=false,created=false,poll=null,timer=null;
    const finish=ok=>{
      if(settled)return;settled=true;
      if(poll)clearInterval(poll);if(timer)clearTimeout(timer);
      if(!ok)SDK_LOAD_PROMISES.delete(src);
      resolve(!!ok);
    };
    let script=[...document.scripts].find(item=>item.src===src);
    if(!script){
      script=document.createElement('script');script.src=src;script.async=true;script.crossOrigin='anonymous';script.dataset.teamBullsSdk='1';created=true;document.head.appendChild(script);
    }
    const onLoad=()=>finish(!!globalReady?.());
    const onError=()=>{if(created&&script.isConnected)script.remove();finish(false);};
    script.addEventListener('load',onLoad,{once:true});
    script.addEventListener('error',onError,{once:true});
    poll=setInterval(()=>{if(globalReady?.())finish(true);},100);
    timer=setTimeout(()=>{if(created&&script.isConnected&&!globalReady?.())script.remove();finish(!!globalReady?.());},V106_SDK_TIMEOUT_MS);
    queueMicrotask(()=>{if(globalReady?.())finish(true);});
  });
  SDK_LOAD_PROMISES.set(src,promise);
  return promise;
};
ensureFirebaseReady=function(){
  if(auth&&db)return Promise.resolve(true);
  if(V106_FIREBASE_READY_PROMISE)return V106_FIREBASE_READY_PROMISE;
  V106_FIREBASE_READY_PROMISE=(async()=>{
    const ready=await withTimeout(ensureFirebaseCore(),FIREBASE_CORE_TIMEOUT_MS,'carregar conexão segura').catch(()=>false);
    return !!(ready&&initFirebase());
  })().finally(()=>{if(!(auth&&db))V106_FIREBASE_READY_PROMISE=null;});
  return V106_FIREBASE_READY_PROMISE;
};

/* Cache de cálculos da planilha. Evita normalizar as mesmas oito semanas
   repetidamente ao navegar, copiar técnicas ou reabrir um dia. */
const V106_PRESCRIPTION_SUMMARY_CACHE=new WeakMap();
const V106_BASE_PRESCRIPTION_SUMMARY=prescriptionCompactSummary;
prescriptionCompactSummary=function(exercise,week){
  if(!exercise||typeof exercise!=='object')return V106_BASE_PRESCRIPTION_SUMMARY(exercise,week);
  const safeWeek=Math.max(1,Math.min(8,Number(week)||1));
  let byWeek=V106_PRESCRIPTION_SUMMARY_CACHE.get(exercise);
  if(!byWeek){byWeek=new Map();V106_PRESCRIPTION_SUMMARY_CACHE.set(exercise,byWeek);}
  const previous=byWeek.get(safeWeek);
  const signature={
    weeklyPlan:exercise.weeklyPlan,
    weeklyTechniquePlan:exercise.weeklyTechniquePlan,
    techniqueIds:exercise.techniqueIds,
    optionalTechniqueIds:exercise.optionalTechniqueIds,
    supersetExerciseId:exercise.supersetExerciseId
  };
  if(previous&&previous.weeklyPlan===signature.weeklyPlan&&previous.weeklyTechniquePlan===signature.weeklyTechniquePlan&&previous.techniqueIds===signature.techniqueIds&&previous.optionalTechniqueIds===signature.optionalTechniqueIds&&previous.supersetExerciseId===signature.supersetExerciseId)return previous.result;
  const result=V106_BASE_PRESCRIPTION_SUMMARY(exercise,safeWeek);
  byWeek.set(safeWeek,{...signature,result});
  return result;
};

/* Visão geral otimizada: conta sessões uma única vez por exercício, mantém a
   leitura específica de cada semana e informa acessibilidade sem mudar o layout. */
buildWeeklyBoard=function(workout,elId,trainerMode){
  const el=document.getElementById(elId);if(!el)return;
  const exercises=sortWorkoutExercises(workout);
  if(!exercises.length){el.innerHTML='<div class="prescription-empty">Adicione exercícios para montar as semanas.</div>';el.removeAttribute('aria-busy');return;}
  const weeks=[1,2,3,4,5,6,7,8],activeWeek=trainerMode?TRAINER_ACTIVE_WEEK:LAST_SESSION_WEEK;
  const head=weeks.map(week=>`<th class="${week===activeWeek?'active-week':''}" scope="col">Semana ${week}</th>`).join('');
  const rows=exercises.map(exercise=>{
    const completedByWeek=Array(9).fill(0);
    for(const session of(exercise.sessions||[])){const value=Number(session?.week);if(value>=1&&value<=8)completedByWeek[value]++;}
    const openExerciseCall=trainerMode?`openTsWeekExercise(${jsArg(exercise.id)},${TRAINER_ACTIVE_WEEK})`:`openStudentWeekExercise(${jsArg(exercise.id)},${LAST_SESSION_WEEK})`;
    const cells=weeks.map(week=>{
      const summary=prescriptionCompactSummary(exercise,week),completed=completedByWeek[week];
      const openWeekCall=trainerMode?`openPrescriptionModal(${jsArg(exercise.id)},${week},'trainer')`:`openStudentWeekExercise(${jsArg(exercise.id)},${week})`;
      const maxGer=summary.rx.sets.reduce((max,set)=>Math.max(max,Number(set.ger)||0),0);
      const content=summary.rx.sets.length
        ?`<span class="weekly-ger">${esc(summary.ger)}</span>${renderGerMeter(maxGer)}<span class="weekly-rx">${esc(summary.reps)}</span>${weeklyTechniqueOverviewHtml(exercise,week)}${summary.rx.inherited?`<span class="weekly-inherited">herda S${summary.rx.sourceWeek}</span>`:''}`
        :`<span class="weekly-empty">sem prescrição</span>${weeklyTechniqueOverviewHtml(exercise,week)}`;
      const label=`${exercise.name}, semana ${week}, ${summary.reps}${completed?`, ${completed} registro${completed>1?'s':''}`:''}`;
      return`<td><button type="button" aria-label="${esc(label)}" class="weekly-cell-btn${completed?' completed':''}${week===activeWeek?' active-week':''}" onclick="${openWeekCall}">${completed?`<span class="weekly-done">✓${completed>1?' '+completed:''}</span>`:''}${content}</button></td>`;
    }).join('');
    return`<tr><th scope="row"><button type="button" class="weekly-exercise-name" onclick="${openExerciseCall}">${esc(exercise.name)}</button></th>${cells}</tr>`;
  }).join('');
  el.innerHTML=`<div class="weekly-plan-scroll" tabindex="0" aria-label="Planilha das oito semanas"><table class="weekly-plan-table"><thead><tr><th scope="col">Exercício</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  el.removeAttribute('aria-busy');
};

/* Renderização cancelável: múltiplas alterações rápidas produzem apenas a
   última atualização da grade. */
const V106_BOARD_FRAME_BY_ID=new Map();
scheduleWeeklyBoardRender=function(workout,elId,trainerMode){
  const el=document.getElementById(elId);if(!el)return;
  const previous=V106_BOARD_FRAME_BY_ID.get(elId);if(previous)cancelAnimationFrame(previous);
  el.setAttribute('aria-busy','true');
  if(!el.querySelector('.weekly-plan-table'))el.innerHTML='<div class="weekly-board-loading">Organizando planilha…</div>';
  const frame=requestAnimationFrame(()=>{
    V106_BOARD_FRAME_BY_ID.delete(elId);
    if(!el.isConnected)return;
    buildWeeklyBoard(workout,elId,trainerMode);
  });
  V106_BOARD_FRAME_BY_ID.set(elId,frame);
};

/* Evita renderização duplicada depois de salvar técnicas. */
refreshPlanViewsAfterWeeklyTechniqueChange=function(exercise,week){
  if(exercise&&V106_PRESCRIPTION_SUMMARY_CACHE.has(exercise))V106_PRESCRIPTION_SUMMARY_CACHE.delete(exercise);
  if(PLAN_EDIT_TARGET==='trainer'&&VIEW_STUDENT_WORKOUT){
    const dayMode=!!VIEW_STUDENT_DAY;
    const target=dayMode?{...VIEW_STUDENT_WORKOUT,exercises:exercisesForDay(VIEW_STUDENT_WORKOUT,VIEW_STUDENT_DAY)}:VIEW_STUDENT_WORKOUT;
    scheduleWeeklyBoardRender(target,dayMode?'trainer-day-weekly-board':'trainer-weekly-board',true);
    if(dayMode){const list=document.getElementById('ts-exercise-list');if(list)list.innerHTML=renderExerciseRows(exercisesForDay(VIEW_STUDENT_WORKOUT,VIEW_STUDENT_DAY),true);}
  }else{
    const workout=getW(CUR_WORKOUT);if(!workout)return;
    const dayMode=!!CUR_DAY,target=dayMode?{...workout,exercises:exercisesForDay(workout,CUR_DAY)}:workout;
    scheduleWeeklyBoardRender(target,dayMode?'student-day-weekly-board':'student-weekly-board',false);
    if(dayMode){const list=document.getElementById('exercise-list');if(list)list.innerHTML=renderExerciseRows(exercisesForDay(workout,CUR_DAY),false);}
  }
};

/* Limpeza de URLs temporárias e caches pessoais ao sair. */
function v106ReleaseMediaObjectUrls(){
  for(const url of MEDIA_OBJECT_URLS.values())try{URL.revokeObjectURL(url);}catch(error){}
  MEDIA_OBJECT_URLS.clear();PHOTO_URL_CACHE.clear();
}
const V106_BASE_SHOW_SCREEN_CLEANUP=showScreen;
showScreen=function(id,expectedToken=null){
  const result=V106_BASE_SHOW_SCREEN_CLEANUP(id,expectedToken);
  if(result!==false&&id==='screen-auth'){
    setAuthSecretsEnabled(true);
    if(!CURRENT_USER){v106ReleaseMediaObjectUrls();FREE_MEAL_LOGS=[];MEAL_PLAN_CACHE={meals:[]};MEAL_COMPLETIONS_TODAY=new Set();}
  }else if(result!==false){clearTransientAuthSecrets();setAuthSecretsEnabled(false);}
  return result;
};
window.addEventListener('pagehide',v106ReleaseMediaObjectUrls);

/* Melhora foco, leitores de tela e retorno ao controle que abriu o modal. */
const V106_MODAL_RETURN_FOCUS=new WeakMap();
const V106_BASE_OPEN_MODAL=openModal,V106_BASE_CLOSE_MODAL=closeModal;
openModal=function(id){
  const modal=document.getElementById(id);if(!modal)return;
  V106_MODAL_RETURN_FOCUS.set(modal,document.activeElement);
  modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
  V106_BASE_OPEN_MODAL(id);
  requestAnimationFrame(()=>{
    if(!shouldAutoFocusEditor())return;
    const target=modal.querySelector('input:not([type="hidden"]):not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),[tabindex="0"]');
    target?.focus?.({preventScroll:true});
  });
};
closeModal=function(id){
  const modal=document.getElementById(id),returnFocus=modal?V106_MODAL_RETURN_FOCUS.get(modal):null;
  V106_BASE_CLOSE_MODAL(id);
  if(modal){modal.removeAttribute('aria-modal');V106_MODAL_RETURN_FOCUS.delete(modal);}
  requestAnimationFrame(()=>returnFocus?.isConnected&&returnFocus.focus?.({preventScroll:true}));
};
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return;
  const modals=[...document.querySelectorAll('.modal-backdrop.open')];
  const modal=modals[modals.length-1];if(!modal)return;
  if(ACTION_LOCKS.size)return;
  if(modal.id==='modal-prescription'&&WEEK_TECHNIQUE_EDITOR_DIRTY){showToast('Salve ou descarte as alterações antes de fechar.',true);return;}
  event.preventDefault();closeModal(modal.id);
});

/* Mostra a versão real em todos os pontos visíveis sem depender de rótulos
   herdados de arquivos antigos. */
function v106ApplyVersionLabels(){
  document.documentElement.dataset.appVersion=V106_VERSION;
  document.querySelectorAll('.trainer-desktop-logo small,.student-desktop-logo small').forEach(el=>{el.textContent=el.textContent.replace(/V\d+(?:\.\d+)*/i,'V'+V106_VERSION);});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',v106ApplyVersionLabels,{once:true});else v106ApplyVersionLabels();

/* PDF final da versão auditada. */
const V106_BASE_PDF=workoutPdfHtml;
workoutPdfHtml=function(){return V106_BASE_PDF.apply(this,arguments).replace(/Team Bulls v10(?:\.5(?:\.\d+)?)?/g,'Team Bulls v10.10.9');};

window.addEventListener('pagehide',()=>{clearWeeklyCheckinPreviews();clearQuestionnaireReportPreviews();},{once:true});


/* ═══════════════════════════════════════════════════════════════════
   TEAM BULLS v10.10.9 — RELATÓRIOS FLEXÍVEIS, GUIA DE FOTOS E CICLOS
   Camada aditiva: preserva documentos anteriores e separa ajustes
   semanais da atualização completa de treino e dieta.
═══════════════════════════════════════════════════════════════════ */
const V109_VERSION='10.10.9';
const V109_RECOMMENDATION_QUESTION='Em uma escala de 0/10, o quanto você recomenda o meu trabalho para alguém? E por quê?';
const V109_PHOTO_INSTRUCTION='Tire as fotos exatamente conforme o Guia de Fotos e as orientações prescritas. Fotos fora do padrão de posição, enquadramento, distância ou iluminação prejudicam a comparação e podem comprometer a análise.';
const V109_REPORT_MODES=new Set(['full','written','photos']);
let V109_REPORT_SETTINGS=null,V109_REPORT_SETTINGS_TRAINER='';
let V109_PROTOCOL_REVIEW_SCHEDULE=null,V109_PROTOCOL_REVIEW_STUDENT='';

const V109_DEFAULT_QUESTIONNAIRE_SECTIONS=[
  {title:'1. Identificação',questions:['Nome completo:','Data do envio do relatório:','Semana de acompanhamento (ex.: Semana 2):']},
  {title:'2. Adesão ao planejamento',questions:['Seguiu a dieta como prescrito?','Fez refeições fora da margem prescrita nas refeições livres? Se sim, descreva os alimentos e as quantidades:','Quantos litros de água, em média, ingeriu por dia?']},
  {title:'3. Treinos e cardios',questions:['Realizou todas as sessões de treino durante a semana? Se não, explique o motivo:','Realizou o tempo prescrito de cardio, lutas, esportes ou outras atividades? Se não, explique o motivo:','Avalie seu desempenho nos treinos de 1 a 10:','Avalie sua recuperação de um treino para outro de 1 a 10. Dor tardia não significa necessariamente falta de recuperação:','Sentiu alguma dor, desconforto ou lesão neste período, independentemente da causa?']},
  {title:'4. Peso',questions:['Peso atual em jejum, ao acordar:','Peso anterior informado no último relatório ou feedback:']},
  {title:'5. Saúde, bem-estar e rotina',questions:['Avalie seu sono de 1 a 10 e descreva alterações como insônia, menos de 7–8 horas, sono leve ou despertares:','Como está sua rotina em relação a estresse, cansaço geral e demandas do dia a dia?','Qual é seu nível de motivação atual?','Há algum comentário relevante sobre esta semana ou sobre seu progresso visual? Descreva mesmo que não tenha percebido mudanças:']},
  {title:'6. Experiência com a consultoria',questions:[V109_RECOMMENDATION_QUESTION]}
];

buildDefaultQuestionnaire=function(){
  const questions=[],sectionAt={};
  V109_DEFAULT_QUESTIONNAIRE_SECTIONS.forEach(section=>{sectionAt[questions.length]=section.title;section.questions.forEach(question=>questions.push(question));});
  return{questions,sectionAt};
};

async function ensureReportCycleRuntime(){
  if(!window.TeamBullsMonthlyReports||!window.TeamBullsWeeklyReportIntegrity){
    const load=window.TeamBullsIntelligenceBootstrap?.load||window.TeamBullsIntelligenceSuiteLoader?.load;
    if(typeof load==='function')await load();
  }
  if(!window.TeamBullsMonthlyReports||!window.TeamBullsWeeklyReportIntegrity)throw new Error('Os relatórios ainda estão carregando. Aguarde e tente novamente.');
}
function questionnaireIsPending(report){return report?.answered!==true&&(report?.reportType!=='monthly'||window.TeamBullsMonthlyReports?.status(report)==='pending');}
function v109ReportMode(report){
  const explicit=String(report?.requestMode||'').toLowerCase();if(V109_REPORT_MODES.has(explicit))return explicit;
  if(report?.requiresPhotos===false)return'written';
  if(Array.isArray(report?.questions)&&report.questions.length===0)return'photos';
  return'full';
}
function v109ModeRequiresPhotos(mode){return mode==='full'||mode==='photos';}
function v109ModeRequiresAnswers(mode){return mode==='full'||mode==='written';}
function v109ReportModeLabel(mode){return mode==='photos'?'Somente 6 fotos':mode==='written'?'Somente relatório escrito':'Relatório completo';}
function v109ReportTrainerId(report=null){return String(report?.trainerId||CURRENT_USER?.trainerId||VIEW_STUDENT?.trainerId||CURRENT_USER?.uid||'');}
function v109AppendExtraQuestions(base,extras){
  const questions=[...base.questions],sectionAt={...base.sectionAt};
  const clean=(extras||[]).map(value=>String(value||'').normalize('NFKC').trim()).filter(Boolean).filter(value=>normalizedName(value)!==normalizedName(V109_RECOMMENDATION_QUESTION));
  if(clean.length){sectionAt[questions.length]='7. Perguntas adicionais do treinador';questions.push(...clean);}
  return{questions,sectionAt};
}
async function v109CreateQuestionnaireRequest({studentId,studentName,mode='full',questions=[],sectionAt={},reportType='standard',title=''}){
  mode=V109_REPORT_MODES.has(mode)?mode:'full';
  const trainerId=CURRENT_USER?.uid;if(!studentId||!trainerId||CURRENT_USER?.role!=='trainer')throw new Error('A sessão do treinador mudou. Entre novamente.');
  const requiresPhotos=v109ModeRequiresPhotos(mode),requiresAnswers=v109ModeRequiresAnswers(mode);
  if(requiresAnswers&&!questions.length)throw new Error('O relatório escrito precisa ter perguntas.');
  const draftKey='questionnaire-'+mode+'-'+reportType+'-'+studentId;
  const questionnaireId=idempotentDraftId(draftKey,'questionnaires');
  const payload={studentId,trainerId,questions:requiresAnswers?questions:[],sectionAt:requiresAnswers?sectionAt:{},answers:null,answered:false,requiresPhotos,requiredPhotoCount:requiresPhotos?6:0,allQuestionsRequired:requiresAnswers,requestMode:mode,reportType,title:title||v109ReportModeLabel(mode),createdAt:firebase.firestore.FieldValue.serverTimestamp()};
  await cloudWrite(db.collection('questionnaires').doc(questionnaireId).set(payload),'enviar o relatório');clearIdempotentDraft(draftKey);return questionnaireId;
}

sendDefaultQuestionnaire=async function(mode='full'){
  if(!VIEW_STUDENT)return;mode=V109_REPORT_MODES.has(mode)?mode:'full';
  const targetUid=VIEW_STUDENT.uid,targetName=VIEW_STUDENT.name||'Aluno',base=buildDefaultQuestionnaire();
  const detail=mode==='photos'?'seis fotos obrigatórias':mode==='written'?'todas as 18 perguntas obrigatórias, sem fotos':'18 perguntas e seis fotos obrigatórias';
  showConfirm(v109ReportModeLabel(mode),`Enviar para ${targetName} uma solicitação com ${detail}?`,async()=>{
    if(!beginAction('send-default-questionnaire-'+mode))return;
    try{await v109CreateQuestionnaireRequest({studentId:targetUid,studentName:targetName,mode,questions:base.questions,sectionAt:base.sectionAt,reportType:mode==='full'?'standard-extra':mode==='written'?'written-only':'photo-only'});showToast('✓ Solicitação enviada para '+targetName);if(VIEW_STUDENT?.uid===targetUid)await openTsQuestionnaires();}
    catch(error){alert('Erro ao enviar relatório: '+cloudWriteError(error,'enviar o relatório'));}
    finally{endAction('send-default-questionnaire-'+mode);}
  });
};
function requestWrittenOnlyReport(){return sendDefaultQuestionnaire('written');}
function requestPhotoOnlyReport(){return sendDefaultQuestionnaire('photos');}

openSendQuestionnaireModal=function(mode='full'){
  if(!VIEW_STUDENT)return;QUESTIONNAIRE_TARGET_UID=VIEW_STUDENT.uid;QUESTIONNAIRE_TARGET_NAME=VIEW_STUDENT.name||'Aluno';
  document.getElementById('quest-questions-editor').innerHTML='';QUEST_Q_COUNT=0;
  const select=document.getElementById('questionnaire-request-mode');if(select)select.value=V109_REPORT_MODES.has(mode)?mode:'full';
  addQuestionRow('');syncQuestionnaireModeEditor();openModal('modal-send-quest');
};
function syncQuestionnaireModeEditor(){
  const mode=document.getElementById('questionnaire-request-mode')?.value||'full',wrap=document.getElementById('questionnaire-extra-questions-wrap'),button=document.getElementById('questionnaire-send-button');
  if(wrap)wrap.style.display=mode==='photos'?'none':'block';
  if(button)button.textContent=mode==='photos'?'PEDIR SOMENTE 6 FOTOS':mode==='written'?'PEDIR SOMENTE RELATÓRIO ESCRITO':'ENVIAR RELATÓRIO + 6 FOTOS';
}
sendQuestionnaire=async function(){
  const targetUid=QUESTIONNAIRE_TARGET_UID,targetName=QUESTIONNAIRE_TARGET_NAME||'Aluno';if(!targetUid)return;
  const mode=document.getElementById('questionnaire-request-mode')?.value||'full',extras=[...document.querySelectorAll('#quest-questions-editor input')].map(input=>input.value);
  const base=buildDefaultQuestionnaire(),built=v109AppendExtraQuestions(base,extras);
  if(!beginAction('send-questionnaire','modal-send-quest'))return;
  try{await v109CreateQuestionnaireRequest({studentId:targetUid,studentName:targetName,mode,questions:built.questions,sectionAt:built.sectionAt,reportType:'custom'});closeModal('modal-send-quest');QUESTIONNAIRE_TARGET_UID=null;QUESTIONNAIRE_TARGET_NAME='';showToast('✓ Solicitação enviada para '+targetName);if(VIEW_STUDENT?.uid===targetUid)await openTsQuestionnaires();}
  catch(error){alert('Erro ao enviar relatório: '+cloudWriteError(error,'enviar o relatório'));}
  finally{endAction('send-questionnaire','modal-send-quest');}
};

renderQuestList=function(cache,listId,emptyId,fromTrainer){
  const list=document.getElementById(listId),empty=document.getElementById(emptyId);if(!list||!empty)return;
  if(!cache.length){list.innerHTML='';empty.style.display='block';return;}empty.style.display='none';
  list.innerHTML=cache.map(report=>{
    const mode=v109ReportMode(report),monthly=report.reportType==='monthly';
    const state=report.answered?'answered':monthly?(window.TeamBullsMonthlyReports?.status(report)||'loading'):'pending';
    const label=state==='answered'?'Respondido':state==='scheduled'?'Agendado':state==='superseded'?'Ciclo anterior':state==='loading'?'Atualizando':'Aguardando';
    const date=report.answered&&report.answeredAt?.seconds?new Date(report.answeredAt.seconds*1000).toLocaleDateString('pt-BR'):monthly?fmt(report.dueDate):report.createdAt?.seconds?new Date(report.createdAt.seconds*1000).toLocaleDateString('pt-BR'):'—';
    const tap=report.answered?`viewQuestionnaire(${jsArg(report.id)},${fromTrainer})`:(fromTrainer||state!=='pending'?'':`openAnswerQuestionnaire(${jsArg(report.id)})`),photoCount=Array.isArray(report.photoIds)?report.photoIds.length:0;
    const details=[];if(v109ModeRequiresAnswers(mode))details.push(`${report.questions?.length||0} perguntas obrigatórias`);if(v109ModeRequiresPhotos(mode))details.push(report.answered?`${photoCount||0} fotos`:'6 fotos obrigatórias');
    return`<div class="quest-card" onclick="${tap}"><div class="quest-card-top"><span class="quest-card-date">${esc(date)} · ${esc(monthly?'Relatório mensal completo':v109ReportModeLabel(mode))}</span><span class="quest-status ${report.answered?'answered':'pending'}">${label}</span></div><div class="quest-card-preview">${details.join(' · ')||'Solicitação registrada'}</div></div>`;
  }).join('');
};

function v109SetQuestionnaireAnswerUi(report){
  const mode=v109ReportMode(report),requiresAnswers=v109ModeRequiresAnswers(mode),requiresPhotos=v109ModeRequiresPhotos(mode);
  const written=document.getElementById('questionnaire-written-section'),photos=document.getElementById('questionnaire-photo-section'),requirements=document.getElementById('quest-answer-requirements'),button=document.getElementById('questionnaire-submit-button'),title=document.getElementById('quest-answer-title');
  if(written)written.style.display=requiresAnswers?'block':'none';if(photos)photos.style.display=requiresPhotos?'block':'none';
  if(title)title.textContent=report.reportType==='monthly'?'Relatório mensal completo':v109ReportModeLabel(mode);
  if(requirements)requirements.textContent=mode==='photos'?'Envie as seis fotos obrigatórias seguindo o guia do treinador.':mode==='written'?'Responda obrigatoriamente todas as perguntas antes de enviar.':'Todas as perguntas e as seis fotos são obrigatórias para concluir o envio.';
  if(button)button.textContent=mode==='photos'?'ENVIAR 6 FOTOS':mode==='written'?'ENVIAR RELATÓRIO ESCRITO':'ENVIAR RELATÓRIO + 6 FOTOS';
}
openAnswerQuestionnaire=async function(qid){
  if(!qid)return;
  try{const doc=await cloudGet(db.collection('questionnaires').doc(qid),'relatório');if(!doc.exists)return;const report={...doc.data(),id:doc.id};if(report.answered){showToast('Este relatório já foi enviado.',true);return;}
    await ensureReportCycleRuntime();
    if(report.studentId!==CURRENT_USER?.uid||auth?.currentUser?.uid!==CURRENT_USER?.uid)throw new Error('A sessão do aluno mudou.');
    await window.TeamBullsMonthlyReports.assertAvailable(report);
    CUR_ANSWER_QUEST_ID=qid;CURRENT_ANSWER_REPORT=report;const mode=v109ReportMode(report),form=document.getElementById('quest-answer-form');
    form.innerHTML=v109ModeRequiresAnswers(mode)?(report.questions||[]).map((question,index)=>`${report.sectionAt&&report.sectionAt[index]?`<div class="quest-section-title">${esc(report.sectionAt[index])}</div>`:''}<div class="quest-answer-item"><label>${index+1}. ${esc(question)} <span aria-hidden="true">*</span></label><textarea class="form-input" data-qi="${index}" required aria-required="true" rows="2" maxlength="5000" style="resize:vertical;min-height:50px"></textarea></div>`).join(''):'';
    resetQuestionnaireReportPhotos();v109SetQuestionnaireAnswerUi(report);openModal('modal-answer-quest');if(v109ModeRequiresPhotos(mode))await renderReportGuideBlocks(report.trainerId);
  }catch(error){alert(error?.message||'Erro ao carregar o relatório.');}
};
submitQuestionnaireAnswers=async function(){
  const reportId=CUR_ANSWER_QUEST_ID,report=CURRENT_ANSWER_REPORT,studentUid=CURRENT_USER?.uid;if(!reportId||!report||!studentUid||CURRENT_USER?.role!=='student')return;
  const mode=v109ReportMode(report),requiresAnswers=v109ModeRequiresAnswers(mode),requiresPhotos=v109ModeRequiresPhotos(mode),areas=[...document.querySelectorAll('#quest-answer-form textarea')],answers=requiresAnswers?areas.map(area=>area.value.normalize('NFKC').trim()):[];
  if(requiresAnswers){const missing=answers.findIndex(answer=>!answer);if(missing>=0){alert('Responda todas as perguntas antes de enviar o relatório.');areas[missing]?.focus();areas[missing]?.scrollIntoView({behavior:'smooth',block:'center'});return;}if(answers.length!==(report.questions||[]).length){alert('O relatório foi alterado. Feche e abra novamente antes de responder.');return;}}
  if(requiresPhotos&&QUESTIONNAIRE_REPORT_FILES.some(file=>!(file instanceof File))){alert('Envie obrigatoriamente as seis fotos: frente, costas, lado direito, lado esquerdo, frente contraída e costas contraída.');return;}
  if(!beginAction('answer-questionnaire','modal-answer-quest'))return;const photoIds=[],photoWrites=[],createdPaths=[];
  try{const reportRef=db.collection('questionnaires').doc(reportId),fresh=await cloudGet(reportRef,'verificar relatório');if(!fresh.exists)throw new Error('Este relatório não está mais disponível.');if(fresh.data().answered)throw new Error('Este relatório já foi enviado. Atualize a página para ver o histórico.');
    if(requiresPhotos)for(let index=0;index<6;index++){showToast('Preparando foto '+(index+1)+' de 6...');const photoId=(reportId+'-r'+(index+1)).slice(0,190),photoRef=db.collection('progressPhotos').doc(photoId);photoIds.push(photoId);const variants=await buildProgressPhotoVariants(QUESTIONNAIRE_REPORT_FILES[index]),photoPath=await uploadCloudPhoto('progressPhotos',studentUid,photoId,variants.full);if(photoPath)createdPaths.push(photoPath);const thumbPath=photoPath?await uploadCloudPhoto('progressPhotoThumbs',studentUid,photoId,variants.thumb):'';if(thumbPath)createdPaths.push(thumbPath);const payload={userId:studentUid,date:today(),reportId,questionnaireId:reportId,pose:CHECKIN_POSES[index],createdAt:firebase.firestore.FieldValue.serverTimestamp()};if(photoPath){payload.photoPath=photoPath;if(thumbPath)payload.thumbPath=thumbPath;}else payload.dataUrl=variants.full;photoWrites.push({ref:photoRef,payload});}
    const batch=db.batch();photoWrites.forEach(write=>batch.set(write.ref,write.payload));batch.update(reportRef,{answers,answered:true,answeredAt:firebase.firestore.FieldValue.serverTimestamp(),photoIds});
    try{await cloudWrite(batch.commit(),'enviar relatório');}catch(error){const verified=await cloudGet(reportRef,'confirmar relatório').catch(()=>null);if(!verified?.exists||!verified.data().answered){await Promise.allSettled(createdPaths.map(path=>deleteCloudPhoto(path)));throw error;}}
    resetQuestionnaireReportPhotos();CURRENT_ANSWER_REPORT=null;CUR_ANSWER_QUEST_ID=null;closeModal('modal-answer-quest');document.getElementById('quest-banner').style.display='none';showToast(mode==='photos'?'✓ Seis fotos enviadas':mode==='written'?'✓ Relatório escrito enviado':'✓ Relatório e seis fotos enviados');await checkQuestionnaires();
  }catch(error){await Promise.allSettled(createdPaths.map(path=>deleteCloudPhoto(path)));alert('Erro ao enviar relatório: '+cloudWriteError(error,'enviar o relatório'));}
  finally{endAction('answer-questionnaire','modal-answer-quest');}
};
viewQuestionnaire=async function(qid,fromTrainer){
  const cache=fromTrainer?TS_QUEST_CACHE:MY_QUEST_CACHE,report=cache.find(item=>item.id===qid);if(!report||!report.answered)return;const mode=v109ReportMode(report),photoIds=Array.isArray(report.photoIds)?report.photoIds.slice(0,6):[],parts=[];
  if(v109ModeRequiresPhotos(mode))parts.push(photoIds.length?`<div class="section-header"><span class="section-label">Fotos do relatório</span></div><div class="checkin-view-photo-grid" id="questionnaire-view-photo-grid">Carregando as ${photoIds.length} fotos...</div>`:'<div class="no-data-inline">As fotos deste relatório não estão disponíveis.</div>');
  if(v109ModeRequiresAnswers(mode))parts.push((report.questions||[]).map((question,index)=>`${report.sectionAt&&report.sectionAt[index]?`<div class="quest-section-title">${esc(report.sectionAt[index])}</div>`:''}<div class="quest-view-qa"><div class="q">${index+1}. ${esc(question)}</div><div class="a">${esc(report.answers?.[index]||'(sem resposta)')}</div></div>`).join(''));
  const title=document.getElementById('quest-view-title');if(title)title.textContent=v109ReportModeLabel(mode)+' respondido';document.getElementById('quest-view-body').innerHTML=parts.join('');openModal('modal-view-quest');if(!photoIds.length)return;
  const photos=await Promise.all(photoIds.map(async photoId=>{try{const doc=await cloudGet(db.collection('progressPhotos').doc(photoId),'foto do relatório');if(!doc.exists)return null;const record={...doc.data(),id:doc.id},src=await resolvePhotoSource(record,{full:CURRENT_USER?.role==='trainer'});return src?{...record,src}:null;}catch(error){return null;}}));const grid=document.getElementById('questionnaire-view-photo-grid');if(grid)grid.innerHTML=photos.filter(Boolean).map((photo,index)=>`<figure><img src="${esc(photo.src)}" alt="${esc(photo.pose||CHECKIN_POSES[index]||'Foto')}"><figcaption>${esc(photo.pose||CHECKIN_POSES[index]||'Foto')}</figcaption></figure>`).join('')||'<div class="no-data-inline">As fotos não estão disponíveis neste momento.</div>';
};

async function loadReportSettings(trainerId=v109ReportTrainerId(),force=false){
  trainerId=String(trainerId||'');if(!trainerId||MODE!=='cloud'||!db)return null;if(!force&&V109_REPORT_SETTINGS&&V109_REPORT_SETTINGS_TRAINER===trainerId)return V109_REPORT_SETTINGS;
  try{const doc=await cloudGet(db.collection('reportSettings').doc(trainerId),'guia geral de fotos');V109_REPORT_SETTINGS=doc.exists?{...doc.data(),trainerId}:{trainerId,photoInstruction:V109_PHOTO_INSTRUCTION,photoGuidePath:'',photoGuideName:''};V109_REPORT_SETTINGS_TRAINER=trainerId;return V109_REPORT_SETTINGS;}
  catch(error){console.warn('Guia geral de fotos indisponível',error);return{trainerId,photoInstruction:V109_PHOTO_INSTRUCTION,photoGuidePath:'',photoGuideName:''};}
}
function v109SafeGuidePath(path){const raw=String(path||'');return /^reportGuides\/[A-Za-z0-9_-]{1,128}\/photo-guide\.pdf$/.test(raw)?raw:'';}
function v109RenderGuideCard(id,settings){
  const card=document.getElementById(id);if(!card)return;
  const path=v109SafeGuidePath(settings?.photoGuidePath),name=String(settings?.photoGuideName||'Guia geral de fotos.pdf');
  card.classList.toggle('available',!!path);
  card.innerHTML=path?`<div><span>GUIA GERAL DE FOTOS (PDF)</span><small>${esc(name)}</small></div><button type="button" onclick="openReportPhotoGuide()">ABRIR PDF</button>`:`<div><span>GUIA GERAL DE FOTOS (PDF)</span><small>O treinador ainda não disponibilizou o arquivo geral.</small></div>`;
}
async function renderReportGuideBlocks(trainerId=v109ReportTrainerId()){
  const settings=await loadReportSettings(trainerId),instruction=String(settings?.photoInstruction||V109_PHOTO_INSTRUCTION);
  ['weekly-report-photo-instruction','questionnaire-report-photo-instruction','student-global-report-guide-instruction'].forEach(id=>{const element=document.getElementById(id);if(element)element.textContent=instruction;});
  ['weekly-report-guide-card','questionnaire-report-guide-card','student-global-report-guide-card'].forEach(id=>v109RenderGuideCard(id,settings));
  return settings;
}
async function openReportPhotoGuide(trainerId=''){
  const popup=window.open('about:blank','_blank');
  try{
    const owner=String(trainerId||v109ReportTrainerId(CURRENT_ANSWER_REPORT)),settings=await loadReportSettings(owner,true),path=v109SafeGuidePath(settings?.photoGuidePath);
    if(!path){popup?.close();showToast('O guia geral em PDF ainda não foi disponibilizado.',true);return;}
    const service=await withTimeout(ensureStorageService(),12000,'carregar armazenamento do guia');if(!service)throw new Error('Armazenamento indisponível.');
    const url=await withTimeout(service.ref(path).getDownloadURL(),12000,'abrir guia geral de fotos');
    if(popup){popup.opener=null;popup.location.replace(url);}else{const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.click();}
  }catch(error){popup?.close();alert('Não foi possível abrir o guia geral de fotos agora. Verifique a conexão e tente novamente.');}
}
const V10102_GUIDE_UPLOAD_TIMEOUT_MS=180000;
let V10102_GUIDE_UPLOAD_TASK=null;
function v10102FormatBytes(bytes){const value=Math.max(0,Number(bytes)||0);if(value<1024)return value+' B';if(value<1024*1024)return(value/1024).toLocaleString('pt-BR',{maximumFractionDigits:1})+' KB';return(value/(1024*1024)).toLocaleString('pt-BR',{maximumFractionDigits:1})+' MB';}
function v10102SetGuideManagerStatus(message,state='idle',progress=null){
  const status=document.getElementById('report-guide-manager-status'),bar=document.getElementById('report-guide-upload-progress'),fill=document.getElementById('report-guide-upload-progress-fill');
  if(status){status.textContent=String(message||'');status.dataset.state=state;}
  if(bar){const visible=Number.isFinite(progress);bar.style.display=visible?'block':'none';bar.setAttribute('aria-hidden',visible?'false':'true');}
  if(fill&&Number.isFinite(progress))fill.style.width=Math.max(0,Math.min(100,progress))+'%';
}
function v10102SetGuideManagerBusy(busy,label='SALVAR GUIA GERAL'){
  const button=document.getElementById('btn-save-report-guide'),input=document.getElementById('input-report-guide-pdf'),text=document.getElementById('input-report-photo-instruction'),close=document.getElementById('btn-close-report-guide-manager');
  if(button){button.disabled=!!busy;button.textContent=label;}
  if(input)input.disabled=!!busy;if(text)text.disabled=!!busy;if(close)close.disabled=!!busy;
}
function onReportGuideFileSelected(event){
  const file=event?.target?.files?.[0]||null;
  if(!file){const current=v109SafeGuidePath(V109_REPORT_SETTINGS?.photoGuidePath);v10102SetGuideManagerStatus(current?'PDF geral atual mantido. Selecione outro arquivo apenas para substituí-lo.':'Nenhum PDF selecionado.','idle');return;}
  if(file.size>25*1024*1024){event.target.value='';v10102SetGuideManagerStatus('O PDF ultrapassa o limite de segurança de 25 MB.','error');return;}
  if(!(/\.pdf$/i.test(file.name)||file.type==='application/pdf')){event.target.value='';v10102SetGuideManagerStatus('Selecione um arquivo PDF válido.','error');return;}
  v10102SetGuideManagerStatus(`Pronto para enviar: ${file.name} · ${v10102FormatBytes(file.size)}. O arquivo ficará disponível para todos os seus alunos.`,'ready');
}
function uploadReportGuidePdf(service,path,file,onProgress=()=>{}){
  return new Promise((resolve,reject)=>{
    let settled=false,task=null;
    const finish=(ok,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(V10102_GUIDE_UPLOAD_TASK===task)V10102_GUIDE_UPLOAD_TASK=null;ok?resolve(value):reject(value);};
    const timer=setTimeout(()=>{const error=new Error('O envio do PDF ultrapassou o tempo de segurança.');error.code='team-bulls/timeout';try{task?.cancel?.();}catch(cancelError){}finish(false,error);},V10102_GUIDE_UPLOAD_TIMEOUT_MS);
    try{
      task=service.ref(path).put(file,{contentType:'application/pdf',cacheControl:'private,max-age=3600'});V10102_GUIDE_UPLOAD_TASK=task;
      task.on('state_changed',snapshot=>{const total=Number(snapshot.totalBytes)||Number(file.size)||1,percent=Math.round((Number(snapshot.bytesTransferred)||0)*100/total);onProgress(Math.max(0,Math.min(100,percent)));},error=>finish(false,error),()=>finish(true,task.snapshot));
    }catch(error){finish(false,error);}
  });
}
function v10102GuideError(error){
  const code=String(error?.code||''),message=String(error?.message||'Falha desconhecida');
  if(code.includes('storage/unauthorized'))return'Permissão recusada pelo Firebase Storage. Confirme que storage_5.rules está publicado no Firebase Console.';
  if(code==='team-bulls/timeout'||code.includes('storage/canceled'))return'O envio foi interrompido por demora excessiva. Verifique a internet e tente novamente; o botão já foi liberado.';
  if(/network|retry-limit|offline/i.test(code+' '+message))return'A conexão foi interrompida durante o envio. Nenhum carregamento ficará preso; tente novamente quando a internet estabilizar.';
  return cloudWriteError(error,'salvar o guia geral de fotos');
}
async function openReportGuideManager(){
  if(CURRENT_USER?.role!=='trainer')return;
  const settings=await loadReportSettings(CURRENT_USER.uid,true),input=document.getElementById('input-report-guide-pdf');
  document.getElementById('input-report-photo-instruction').value=String(settings?.photoInstruction||V109_PHOTO_INSTRUCTION);if(input)input.value='';
  const exists=!!v109SafeGuidePath(settings?.photoGuidePath);
  v10102SetGuideManagerBusy(false,'SALVAR GUIA GERAL');
  v10102SetGuideManagerStatus(exists?'PDF geral atual: '+String(settings.photoGuideName||'Guia geral de fotos.pdf')+'. Todos os alunos vinculados já podem acessá-lo.':'Nenhum PDF geral disponibilizado. Envie uma única vez para liberar a todos os alunos.','idle');
  document.getElementById('btn-open-current-report-guide').style.display=exists?'block':'none';document.getElementById('btn-remove-report-guide').style.display=exists?'block':'none';openModal('modal-report-guide-manager');
}
function closeReportGuideManager(){if(V10102_GUIDE_UPLOAD_TASK){showToast('Aguarde o envio do PDF terminar.',true);return;}closeModal('modal-report-guide-manager');}
async function saveReportGuideSettings(){
  if(CURRENT_USER?.role!=='trainer')return;
  const trainerId=CURRENT_USER.uid,instruction=document.getElementById('input-report-photo-instruction').value.normalize('NFKC').trim(),input=document.getElementById('input-report-guide-pdf'),file=input?.files?.[0]||null;
  if(!instruction){alert('Escreva a orientação geral que será exibida aos alunos.');return;}
  if(file&&file.size>25*1024*1024){v10102SetGuideManagerStatus('O PDF ultrapassa o limite de segurança de 25 MB.','error');return;}
  if(file&&!(/\.pdf$/i.test(file.name)||file.type==='application/pdf')){v10102SetGuideManagerStatus('Selecione um arquivo PDF válido.','error');return;}
  if(!navigator.onLine){v10102SetGuideManagerStatus('É necessário estar conectado para enviar ou atualizar o guia.','error');return;}
  if(!beginAction('save-report-guide'))return;
  v10102SetGuideManagerBusy(true,file?'PREPARANDO ENVIO...':'SALVANDO ORIENTAÇÃO...');
  try{
    let path=v109SafeGuidePath(V109_REPORT_SETTINGS?.photoGuidePath),name=String(V109_REPORT_SETTINGS?.photoGuideName||'');
    if(file){
      v10102SetGuideManagerStatus('Carregando o módulo seguro de armazenamento...','uploading',0);
      const service=await withTimeout(ensureStorageService(),12000,'carregar Firebase Storage');if(!service)throw new Error('O Firebase Storage não está disponível.');
      path=`reportGuides/${trainerId.replace(/[^A-Za-z0-9_-]/g,'').slice(0,128)}/photo-guide.pdf`;
      await uploadReportGuidePdf(service,path,file,percent=>{v10102SetGuideManagerBusy(true,`ENVIANDO PDF — ${percent}%`);v10102SetGuideManagerStatus(`Enviando o guia geral para todos os alunos — ${percent}%`,'uploading',percent);});
      name=file.name.slice(0,180);v10102SetGuideManagerStatus('PDF enviado. Salvando a disponibilidade geral...','saving',100);v10102SetGuideManagerBusy(true,'FINALIZANDO...');
    }
    await cloudWrite(db.collection('reportSettings').doc(trainerId).set({trainerId,photoInstruction:instruction.slice(0,1200),photoGuidePath:path||'',photoGuideName:name||'',updatedBy:trainerId,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}),'salvar guia geral de fotos');
    V109_REPORT_SETTINGS=null;await loadReportSettings(trainerId,true);await renderReportGuideBlocks(trainerId);
    v10102SetGuideManagerStatus('Guia geral salvo. Todos os alunos vinculados podem acessá-lo na aba Relatórios.','success',100);showToast('✓ Guia geral liberado para todos os alunos');
    if(input)input.value='';document.getElementById('btn-open-current-report-guide').style.display='block';document.getElementById('btn-remove-report-guide').style.display='block';
  }catch(error){console.error('Falha no guia geral',error);v10102SetGuideManagerStatus(v10102GuideError(error),'error');alert(v10102GuideError(error));}
  finally{V10102_GUIDE_UPLOAD_TASK=null;endAction('save-report-guide');v10102SetGuideManagerBusy(false,'SALVAR GUIA GERAL');}
}
function removeReportGuidePdf(){if(CURRENT_USER?.role!=='trainer')return;showConfirm('Remover guia geral em PDF','Remover o PDF geral? Todos os alunos perderão o acesso ao arquivo, mas a orientação em texto será mantida.',async()=>{if(!beginAction('remove-report-guide'))return;try{const trainerId=CURRENT_USER.uid,path=v109SafeGuidePath(V109_REPORT_SETTINGS?.photoGuidePath);if(path){const service=await withTimeout(ensureStorageService(),12000,'carregar armazenamento');await service?.ref(path).delete().catch(()=>{});}await cloudWrite(db.collection('reportSettings').doc(trainerId).set({trainerId,photoGuidePath:'',photoGuideName:'',updatedBy:trainerId,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}),'remover guia geral em PDF');V109_REPORT_SETTINGS=null;await loadReportSettings(trainerId,true);await renderReportGuideBlocks(trainerId);v10102SetGuideManagerStatus('PDF geral removido.','success');document.getElementById('btn-open-current-report-guide').style.display='none';document.getElementById('btn-remove-report-guide').style.display='none';showToast('✓ PDF geral removido');}catch(error){alert(v10102GuideError(error));}finally{endAction('remove-report-guide');}});}

// O guia é um material permanente da consultoria. Ele é carregado sempre que
// o aluno abre a área de Relatórios, mesmo que não exista solicitação pendente.
const V10102_OPEN_MY_QUESTIONNAIRES=openMyQuestionnaires;
openMyQuestionnaires=async function(){await V10102_OPEN_MY_QUESTIONNAIRES.apply(this,arguments);if(CURRENT_USER?.role==='student'&&CURRENT_USER?.trainerId)await renderReportGuideBlocks(CURRENT_USER.trainerId);};

const V109_OPEN_WEEKLY_CHECKIN_MODAL=openWeeklyCheckinModal;
openWeeklyCheckinModal=function(){const result=V109_OPEN_WEEKLY_CHECKIN_MODAL.apply(this,arguments);if(document.getElementById('modal-weekly-checkin')?.classList.contains('open'))renderReportGuideBlocks(CURRENT_USER?.trainerId);return result;};

function v109ProtocolState(schedule,date=today()){
  if(!schedule||schedule._exists===false||!validIsoDate(schedule.startDate))return null;
  const intervalWeeks=Math.max(1,Math.min(52,Math.trunc(Number(schedule.intervalWeeks)||4))),intervalDays=intervalWeeks*7;
  const rawDays=v104DateDiffDays(schedule.startDate,date),days=Math.max(0,rawDays),elapsedCycle=rawDays<0?0:Math.floor(days/intervalDays);
  const lastCompletedCycle=Math.max(0,Math.trunc(Number(schedule.lastCompletedCycle)||0));
  const pendingCycle=elapsedCycle>lastCompletedCycle?elapsedCycle:0,nextCycle=pendingCycle||Math.max(lastCompletedCycle+1,elapsedCycle+1);
  const nextDueDate=addDaysIso(schedule.startDate,nextCycle*intervalDays),daysUntil=v104DateDiffDays(date,nextDueDate),weekNumber=rawDays<0?0:Math.floor(days/7)+1;
  return{intervalWeeks,intervalDays,elapsedCycle,lastCompletedCycle,pendingCycle,pending:pendingCycle>0,nextCycle,nextDueDate,daysUntil,weekNumber};
}
async function v109ResolveProtocolDefaultStart(studentUid){
  const candidates=[];
  for(const workout of VIEW_STUDENT?.workouts||[])if(workout?.isActive===true&&validIsoDate(workout.startDate))candidates.push(workout.startDate);
  if(validIsoDate(TRAINER_CHECKIN_SCHEDULE?.cycleStartDate))candidates.push(TRAINER_CHECKIN_SCHEDULE.cycleStartDate);
  try{const doc=await cloudGet(db.collection('mealPlans').doc(studentUid),'data inicial da dieta');if(doc.exists){for(const plan of doc.data()?.plans||[])if(plan?.isActive===true&&validIsoDate(plan.startDate))candidates.push(plan.startDate);}}catch(error){console.warn('Data inicial da dieta indisponível',error);}
  return candidates.sort()[0]||today();
}
async function loadProtocolReviewSchedule(studentUid,force=false){
  if(!studentUid||MODE!=='cloud'||!db)return null;
  if(!force&&V109_PROTOCOL_REVIEW_STUDENT===studentUid)return V109_PROTOCOL_REVIEW_SCHEDULE;
  try{
    const doc=await cloudGet(db.collection('protocolReviewSchedules').doc(studentUid),'ciclo de atualização completa');
    if(doc.exists){V109_PROTOCOL_REVIEW_SCHEDULE={studentId:studentUid,trainerId:CURRENT_USER?.role==='trainer'?CURRENT_USER.uid:CURRENT_USER?.trainerId||'',intervalWeeks:4,lastCompletedCycle:0,lastCompletedDate:'',...doc.data(),_exists:true};}
    else if(CURRENT_USER?.role==='trainer'){V109_PROTOCOL_REVIEW_SCHEDULE={studentId:studentUid,trainerId:CURRENT_USER.uid,startDate:await v109ResolveProtocolDefaultStart(studentUid),intervalWeeks:4,lastCompletedCycle:0,lastCompletedDate:'',_exists:false};}
    else V109_PROTOCOL_REVIEW_SCHEDULE=null;
    V109_PROTOCOL_REVIEW_STUDENT=studentUid;return V109_PROTOCOL_REVIEW_SCHEDULE;
  }catch(error){console.warn('Cronograma de atualização indisponível',error);return null;}
}
function renderTrainerProtocolReview(schedule){
  const state=v109ProtocolState(schedule),badge=document.getElementById('trainer-protocol-review-state'),help=document.getElementById('trainer-protocol-review-help'),next=document.getElementById('trainer-protocol-review-next'),complete=document.getElementById('trainer-protocol-review-complete');if(!badge||!help||!next)return;
  const startInput=document.getElementById('trainer-protocol-start-date'),intervalInput=document.getElementById('trainer-protocol-interval-weeks');if(startInput)startInput.value=validIsoDate(schedule?.startDate)?schedule.startDate:today();if(intervalInput)intervalInput.value=String(Math.max(1,Number(schedule?.intervalWeeks)||4));
  if(!state){badge.textContent='NÃO CONFIGURADO';badge.className='quest-status pending';help.textContent='Confirme a data exata de início e o intervalo. O padrão é uma atualização completa a cada 4 semanas.';next.textContent='Próxima atualização completa: —';if(complete)complete.disabled=true;return;}
  badge.textContent=state.pending?'ATUALIZAÇÃO PENDENTE':'EM DIA';badge.className='quest-status '+(state.pending?'pending':'answered');help.textContent=`${state.weekNumber?`Semana ${state.weekNumber} do ciclo`:'O protocolo ainda não começou'} · atualização completa a cada ${state.intervalWeeks} semanas. Ajustes semanais não reiniciam a contagem.`;
  next.innerHTML=state.pending?`Atualização completa nº ${state.pendingCycle} pendente desde <b>${esc(fmt(state.nextDueDate))}</b>.`:`Próxima atualização completa: <b>${esc(fmt(state.nextDueDate))}</b>.`;if(complete)complete.disabled=!state.pending;
}
async function loadTrainerProtocolReview(studentUid){
  const schedule=await loadProtocolReviewSchedule(studentUid,true);if(VIEW_STUDENT?.uid!==studentUid)return;renderTrainerProtocolReview(schedule);
  const note=document.getElementById('trainer-cycle-link-note');if(note)note.innerHTML='Os relatórios semanais permanecem independentes. Ajustes pontuais de treino ou dieta <b>não reiniciam</b> o ciclo da atualização completa.';
}
async function v109SyncActiveProtocolDates(studentUid,startDate,nextDueDate){
  const activeWorkouts=(VIEW_STUDENT?.workouts||[]).filter(workout=>workout?.isActive===true),workoutRefs=[];
  const mealRef=db.collection('mealPlans').doc(studentUid),mealDoc=await cloudGet(mealRef,'datas da dieta').catch(()=>null),mealData=mealDoc?.exists?mealDoc.data():null;
  const plans=Array.isArray(mealData?.plans)?mealData.plans.map(plan=>plan?.isActive===true?{...plan,startDate,updateDate:nextDueDate}:plan):null;
  if(!activeWorkouts.length&&!plans)return;
  const batch=db.batch();for(const workout of activeWorkouts){const ref=db.collection('workouts').doc(workout.id);batch.update(ref,{startDate,updateDate:nextDueDate});workoutRefs.push(workout);}if(plans)batch.update(mealRef,{plans,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
  await cloudWrite(batch.commit(),'alinhar as datas dos protocolos');for(const workout of workoutRefs){workout.startDate=startDate;workout.updateDate=nextDueDate;}if(plans&&DIET_CONTEXT?.targetUid===studentUid)DIET_DOCUMENT=normalizeDietDocument({...mealData,plans});
}
async function v109SyncProtocolMetadataToWeeklySchedule(studentUid,startDate,nextDueDate){
  try{const ref=db.collection('checkinSchedules').doc(studentUid),doc=await cloudGet(ref,'agenda semanal');if(!doc.exists)return;await cloudWrite(ref.update({cycleStartDate:startDate,cycleUpdateDate:nextDueDate,cycleSource:'protocol-review',updatedBy:CURRENT_USER.uid,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}),'registrar referência do ciclo');}catch(error){console.warn('Referência do ciclo não sincronizada na agenda semanal',error);}
}
/* Ajustes pontuais de treino/dieta não alteram a agenda semanal nem o ciclo completo. */
v104SyncCycleSchedule=async function(){return null;};
async function saveProtocolReviewSchedule(){
  const studentUid=VIEW_STUDENT?.uid;if(!studentUid||CURRENT_USER?.role!=='trainer')return;const startDate=document.getElementById('trainer-protocol-start-date').value,intervalWeeks=Math.trunc(Number(document.getElementById('trainer-protocol-interval-weeks').value));
  if(!validIsoDate(startDate)){alert('Escolha uma data de início válida.');return;}if(!Number.isInteger(intervalWeeks)||intervalWeeks<1||intervalWeeks>52){alert('Escolha um intervalo entre 1 e 52 semanas.');return;}if(!beginAction('save-protocol-review-schedule'))return;
  try{
    await ensureReportCycleRuntime();
    const previous=await loadProtocolReviewSchedule(studentUid,true)||{},lastDate=validIsoDate(previous.lastCompletedDate)?previous.lastCompletedDate:'';
    const lastCompletedCycle=lastDate?Math.max(0,Math.floor(Math.max(0,v104DateDiffDays(startDate,lastDate))/(intervalWeeks*7))):0;
    const payload={studentId:studentUid,trainerId:CURRENT_USER.uid,startDate,intervalWeeks,lastCompletedCycle,lastCompletedDate:lastDate,updatedBy:CURRENT_USER.uid,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
    await cloudWrite(db.collection('protocolReviewSchedules').doc(studentUid).set(payload,{merge:true}),'salvar ciclo de atualização');V109_PROTOCOL_REVIEW_SCHEDULE={...previous,...payload,_exists:true};V109_PROTOCOL_REVIEW_STUDENT=studentUid;
    await window.TeamBullsMonthlyReports.ensureForStudent(studentUid);
    const state=v109ProtocolState(V109_PROTOCOL_REVIEW_SCHEDULE);await v109SyncActiveProtocolDates(studentUid,startDate,state.nextDueDate);await v109SyncProtocolMetadataToWeeklySchedule(studentUid,startDate,state.nextDueDate);renderTrainerProtocolReview(V109_PROTOCOL_REVIEW_SCHEDULE);showToast('✓ Ciclo de atualização completa salvo');loadTrainerProtocolReviewAlerts().catch(()=>{});
  }catch(error){alert(cloudWriteError(error,'salvar o ciclo de atualização'));}finally{endAction('save-protocol-review-schedule');}
}
function markProtocolReviewCompleted(){
  const studentUid=VIEW_STUDENT?.uid,state=v109ProtocolState(V109_PROTOCOL_REVIEW_SCHEDULE);if(!studentUid||CURRENT_USER?.role!=='trainer'||!state)return;if(!state.pending){showToast('A próxima atualização completa ainda não venceu.',true);return;}
  showConfirm('Confirmar atualização completa',`Marcar a atualização completa nº ${state.pendingCycle} de treino e dieta como realizada? Use esta confirmação apenas após a revisão detalhada dos protocolos; ajustes semanais não entram aqui.`,async()=>{
    if(!beginAction('complete-protocol-review'))return;try{await ensureReportCycleRuntime();const payload={lastCompletedCycle:state.pendingCycle,lastCompletedDate:today(),lastCompletedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:CURRENT_USER.uid,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};await cloudWrite(db.collection('protocolReviewSchedules').doc(studentUid).update(payload),'concluir atualização completa');V109_PROTOCOL_REVIEW_SCHEDULE={...V109_PROTOCOL_REVIEW_SCHEDULE,...payload,_exists:true};await window.TeamBullsMonthlyReports.ensureForStudent(studentUid);const nextState=v109ProtocolState(V109_PROTOCOL_REVIEW_SCHEDULE);await v109SyncActiveProtocolDates(studentUid,V109_PROTOCOL_REVIEW_SCHEDULE.startDate,nextState.nextDueDate);await v109SyncProtocolMetadataToWeeklySchedule(studentUid,V109_PROTOCOL_REVIEW_SCHEDULE.startDate,nextState.nextDueDate);renderTrainerProtocolReview(V109_PROTOCOL_REVIEW_SCHEDULE);showToast('✓ Atualização completa registrada');loadTrainerProtocolReviewAlerts().catch(()=>{});}catch(error){alert(cloudWriteError(error,'registrar a atualização completa'));}finally{endAction('complete-protocol-review');}
  });
}
async function loadStudentProtocolReview(){
  const studentUid=CURRENT_USER?.role==='student'?CURRENT_USER.uid:'';if(!studentUid)return;const schedule=await loadProtocolReviewSchedule(studentUid,true);if(CURRENT_USER?.uid!==studentUid)return;const state=v109ProtocolState(schedule),banner=document.getElementById('protocol-review-home-banner'),label=document.getElementById('protocol-review-home-label'),text=document.getElementById('protocol-review-home-text');if(!banner||!state){if(banner)banner.style.display='none';return;}
  banner.style.display='block';banner.classList.toggle('is-due',state.pending);if(label)label.textContent=state.pending?'Atualização completa pendente':'Cronograma dos protocolos';if(text)text.textContent=state.pending?`A atualização completa de treino e dieta está pendente desde ${fmt(state.nextDueDate)}. Relatórios e ajustes semanais não alteram esse ciclo.`:`${state.weekNumber?`Semana ${state.weekNumber} do protocolo.`:'O protocolo ainda não começou.'} Próxima atualização completa em ${fmt(state.nextDueDate)}, a cada ${state.intervalWeeks} semanas.`;
}
function openProtocolReviewInfo(){
  const schedule=V109_PROTOCOL_REVIEW_SCHEDULE,state=v109ProtocolState(schedule),body=document.getElementById('protocol-review-info-body');if(!body)return;if(!state){body.innerHTML='<div class="no-data-inline">O treinador ainda não configurou o ciclo de atualização completa.</div>';}else body.innerHTML=`<div class="protocol-review-info-grid"><div><span>INÍCIO DO PROTOCOLO</span><strong>${esc(fmt(schedule.startDate))}</strong></div><div><span>INTERVALO</span><strong>${state.intervalWeeks} semanas</strong></div><div><span>SEMANA ATUAL</span><strong>${state.weekNumber||'Ainda não iniciado'}</strong></div><div><span>${state.pending?'PENDENTE DESDE':'PRÓXIMA ATUALIZAÇÃO'}</span><strong>${esc(fmt(state.nextDueDate))}</strong></div></div><div class="plan-help">Relatórios semanais e pequenos ajustes continuam normalmente e não reiniciam esta data. A contagem permanece ancorada no início exato do protocolo e só é concluída quando o treinador confirma uma atualização completa.</div>`;openModal('modal-protocol-review-info');
}
let V109_PENDING_PROTOCOL_STUDENTS=[];
async function loadTrainerProtocolReviewAlerts(){
  const banner=document.getElementById('trainer-protocol-alert'),text=document.getElementById('trainer-protocol-alert-text');if(!banner||CURRENT_USER?.role!=='trainer'||MODE!=='cloud'){if(banner)banner.style.display='none';return;}
  try{const snap=await cloudGet(db.collection('protocolReviewSchedules').where('trainerId','==',CURRENT_USER.uid).limit(500),'ciclos dos alunos');const due=[];snap.docs.forEach(doc=>{const schedule={...doc.data(),_exists:true},state=v109ProtocolState(schedule);if(state?.pending)due.push({studentId:doc.id,state});});V109_PENDING_PROTOCOL_STUDENTS=due.sort((a,b)=>String(a.state.nextDueDate).localeCompare(String(b.state.nextDueDate)));banner.style.display=due.length?'block':'none';if(text)text.textContent=due.length===1?'1 aluno precisa de uma atualização completa de treino e dieta. Toque para localizar.':`${due.length} alunos precisam de atualização completa de treino e dieta. Toque para localizar.`;
    document.querySelectorAll('.student-card[data-student-uid]').forEach(card=>{card.querySelector('.protocol-due-badge')?.remove();const item=due.find(row=>row.studentId===card.dataset.studentUid);if(item){const badge=document.createElement('span');badge.className='protocol-due-badge';badge.textContent='ATUALIZAÇÃO COMPLETA PENDENTE';card.querySelector('.student-info')?.appendChild(badge);}});
  }catch(error){console.warn('Alertas de atualização completa indisponíveis',error);banner.style.display='none';}
}
function focusFirstPendingProtocolReview(){const first=V109_PENDING_PROTOCOL_STUDENTS[0];if(!first)return;const card=document.querySelector(`.student-card[data-student-uid="${CSS.escape(first.studentId)}"]`);card?.scrollIntoView({behavior:'smooth',block:'center'});card?.classList.add('protocol-due-focus');setTimeout(()=>card?.classList.remove('protocol-due-focus'),1800);}

const V109_RENDER_TRAINER_STUDENT=renderTrainerStudent;
renderTrainerStudent=async function(student){await V109_RENDER_TRAINER_STUDENT(student);if(student&&VIEW_STUDENT?.uid===student.uid)await loadTrainerProtocolReview(student.uid);};
const V109_RENDER_TRAINER=renderTrainer;
renderTrainer=async function(){const result=await V109_RENDER_TRAINER.apply(this,arguments);if(CURRENT_USER?.role==='trainer')await loadTrainerProtocolReviewAlerts();return result;};
const V109_RENDER_HOME=renderHome;
renderHome=function(){const result=V109_RENDER_HOME.apply(this,arguments);if(MODE==='cloud'&&CURRENT_USER?.role==='student')runWhenIdle(()=>loadStudentProtocolReview(),900);else{const banner=document.getElementById('protocol-review-home-banner');if(banner)banner.style.display='none';}return result;};

const V109_CONFIRM_LOGOUT=confirmLogout;
confirmLogout=function(){V109_REPORT_SETTINGS=null;V109_REPORT_SETTINGS_TRAINER='';V109_PROTOCOL_REVIEW_SCHEDULE=null;V109_PROTOCOL_REVIEW_STUDENT='';return V109_CONFIRM_LOGOUT();};

function v109ApplyVersionLabels(){document.documentElement.dataset.appVersion=V109_VERSION;document.querySelectorAll('.trainer-desktop-logo small,.student-desktop-logo small').forEach(element=>{element.textContent=element.textContent.replace(/V\d+(?:\.\d+)*/i,'V'+V109_VERSION);});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',v109ApplyVersionLabels,{once:true});else v109ApplyVersionLabels();


/* ═══════════════════════════════════════════════════════════════
   TEAM BULLS v10.10.9 — GESTÃO NUTRICIONAL E FEEDBACKS
   - tabela calórica GET/VET por dieta;
   - catálogo privado de suplementos por treinador;
   - transmissões não lidas em sequência cronológica;
   - feedback extenso vinculado à atualização completa.
═══════════════════════════════════════════════════════════════ */
const V1010_VERSION='10.10.9';
function v1010EnergyValue(value){const number=Math.round(Number(value)||0);return Number.isFinite(number)?Math.max(0,Math.min(20000,number)):0;}
function normalizeDietEnergySummary(value){const raw=value&&typeof value==='object'?value:{};return{totalExpenditure:v1010EnergyValue(raw.totalExpenditure),trainingDayEnergy:v1010EnergyValue(raw.trainingDayEnergy),restDayEnergy:v1010EnergyValue(raw.restDayEnergy)};}
const V1010_NORMALIZE_DIET_PLAN_BASE=normalizeDietPlan;
normalizeDietPlan=function(plan,index=0){const result=V1010_NORMALIZE_DIET_PLAN_BASE(plan,index);result.energySummary=normalizeDietEnergySummary(plan?.energySummary||result.energySummary);return result;};
function v1010EnergyText(value){return value?`${Number(value).toLocaleString('pt-BR')} kcal/dia`:'Não informado';}
function v1010EnergyDifference(total,value){if(!total||!value)return'';const difference=value-total,sign=difference>0?'+':'';return`${sign}${difference.toLocaleString('pt-BR')} kcal em relação ao GET`;}
function renderDietEnergySummary(hostId,plan,canEdit=false){const host=document.getElementById(hostId);if(!host||!plan)return;const values=normalizeDietEnergySummary(plan.energySummary),has=values.totalExpenditure||values.trainingDayEnergy||values.restDayEnergy;host.innerHTML=`<section class="diet-energy-card"><div class="diet-energy-card-head"><span>TABELA CALÓRICA DA DIETA</span>${canEdit?`<button class="section-mini-btn" type="button" onclick="openEditDietModal(${jsArg(plan.id)})">EDITAR</button>`:''}</div>${has?`<div class="diet-energy-grid"><div class="diet-energy-metric"><span>Gasto energético total do aluno</span><strong>${esc(v1010EnergyText(values.totalExpenditure))}</strong><small>GET estimado</small></div><div class="diet-energy-metric"><span>Valor energético total — dia de treino</span><strong>${esc(v1010EnergyText(values.trainingDayEnergy))}</strong><small class="energy-difference ${values.trainingDayEnergy-values.totalExpenditure<0?'negative':'positive'}">${esc(v1010EnergyDifference(values.totalExpenditure,values.trainingDayEnergy)||'VET do dia de treino')}</small></div><div class="diet-energy-metric"><span>Valor energético total — dia sem treino</span><strong>${esc(v1010EnergyText(values.restDayEnergy))}</strong><small class="energy-difference ${values.restDayEnergy-values.totalExpenditure<0?'negative':'positive'}">${esc(v1010EnergyDifference(values.totalExpenditure,values.restDayEnergy)||'VET do dia sem treino')}</small></div></div>`:`<div class="diet-energy-empty">O treinador ainda não informou o GET e os valores energéticos desta dieta.</div>`}</section>`;}
const V1010_OPEN_ADD_DIET_BASE=openAddDietModal;
openAddDietModal=function(){V1010_OPEN_ADD_DIET_BASE();['input-diet-total-expenditure','input-diet-training-energy','input-diet-rest-energy'].forEach(id=>{const element=document.getElementById(id);if(element)element.value='';});};
const V1010_OPEN_EDIT_DIET_BASE=openEditDietModal;
openEditDietModal=function(id=CURRENT_DIET_ID){V1010_OPEN_EDIT_DIET_BASE(id);const plan=DIET_DOCUMENT.plans.find(item=>String(item.id)===String(id));if(!plan)return;const energy=normalizeDietEnergySummary(plan.energySummary),map={'input-diet-total-expenditure':energy.totalExpenditure,'input-diet-training-energy':energy.trainingDayEnergy,'input-diet-rest-energy':energy.restDayEnergy};Object.entries(map).forEach(([field,value])=>{const element=document.getElementById(field);if(element)element.value=value?String(value):'';});};
saveDietPlan=async function(){
  if(!dietCanEdit()||!beginAction('save-diet','modal-diet'))return;
  const name=document.getElementById('input-diet-name').value.trim(),active=document.getElementById('input-diet-active').value==='true',startDate=document.getElementById('input-diet-start-date').value,updateDate=document.getElementById('input-diet-update-date').value;
  const freeMealPolicy=normalizeDietFreeMealPolicy({maxCalories:document.getElementById('input-diet-free-meal-max-calories')?.value,mealsToReplace:document.getElementById('input-diet-free-meal-replacements')?.value,intervalDays:document.getElementById('input-diet-free-meal-interval')?.value});
  const energySummary=normalizeDietEnergySummary({totalExpenditure:document.getElementById('input-diet-total-expenditure')?.value,trainingDayEnergy:document.getElementById('input-diet-training-energy')?.value,restDayEnergy:document.getElementById('input-diet-rest-energy')?.value});
  if(!name){alert('Informe o nome da dieta.');endAction('save-diet','modal-diet');return;}if(!validIsoDate(startDate)||!validIsoDate(updateDate)||updateDate<startDate){alert('Confira as datas da dieta.');endAction('save-diet','modal-diet');return;}
  const snapshot=JSON.stringify(DIET_DOCUMENT);
  try{let plan=DIET_DOCUMENT.plans.find(item=>item.id===EDIT_DIET_PLAN_ID);if(plan)Object.assign(plan,{name,isActive:active,startDate,updateDate,freeMealPolicy,energySummary});else{plan=normalizeDietPlan({id:uid(),name,isActive:active,order:DIET_DOCUMENT.plans.length,startDate,updateDate,variants:[],freeMealPolicy,energySummary},DIET_DOCUMENT.plans.length);DIET_DOCUMENT.plans.push(plan);EDIT_DIET_PLAN_ID=plan.id;}if(active)DIET_DOCUMENT.plans.forEach(item=>{if(item.id!==plan.id)item.isActive=false;});DIET_DOCUMENT=normalizeDietDocument(DIET_DOCUMENT);await persistDietDocument();closeModal('modal-diet');const trainer=DIET_CONTEXT.trainer;renderDietList(trainer?'ts-meals-list':'meals-list',trainer?'ts-meals-empty':'meals-empty',trainer);showToast('✓ Dieta e tabela calórica salvas');if(CURRENT_DIET_ID===plan.id){renderDietEnergySummary(trainer?'ts-diet-energy-summary':'diet-energy-summary',plan,trainer);renderDietFreeMealPolicy(trainer?'ts-diet-free-meal-policy':'diet-free-meal-policy',plan,trainer);}if(trainer&&active&&DIET_CONTEXT.targetUid)await v104SyncCycleSchedule(DIET_CONTEXT.targetUid,startDate,updateDate,'diet').catch(()=>{});
  }catch(error){DIET_DOCUMENT=normalizeDietDocument(JSON.parse(snapshot));alert(cloudWriteError(error,'salvar a dieta'));}finally{endAction('save-diet','modal-diet');}
};
const V1010_OPEN_DIET_DETAIL_BASE=openDietDetail;
openDietDetail=async function(id,trainerMode=false){await V1010_OPEN_DIET_DETAIL_BASE(id,trainerMode);const plan=currentDiet();if(plan)renderDietEnergySummary(trainerMode?'ts-diet-energy-summary':'diet-energy-summary',plan,trainerMode&&dietCanEdit());};

const V1010_SUPPLEMENT_SECTIONS=new Set(['importantSupplements','optionalSupplements']);
let TRAINER_SUPPLEMENT_CATALOG={items:[]},TRAINER_SUPPLEMENT_CATALOG_UID='',EDIT_TRAINER_SUPPLEMENT_ID='';
function normalizeTrainerSupplementItem(value,index=0){const raw=value&&typeof value==='object'?value:{};return{id:String(raw.id||uid()).replace(/[^A-Za-z0-9_-]/g,'').slice(0,100)||uid(),name:String(raw.name||'').normalize('NFKC').trim().slice(0,120),dose:String(raw.dose||'').normalize('NFKC').trim().slice(0,100),time:String(raw.time||'').normalize('NFKC').trim().slice(0,120),notes:String(raw.notes||'').normalize('NFKC').trim().slice(0,2000),order:Number.isFinite(Number(raw.order))?Math.max(0,Math.trunc(Number(raw.order))):index};}
function normalizeTrainerSupplementCatalog(value){const raw=value&&typeof value==='object'?value:{},items=(Array.isArray(raw.items)?raw.items:[]).map(normalizeTrainerSupplementItem).filter(item=>item.name).slice(0,300).sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'pt-BR')).map((item,index)=>({...item,order:index}));return{items};}
async function loadTrainerSupplementCatalog(force=false){if(CURRENT_USER?.role!=='trainer'||!db)return{items:[]};if(!force&&TRAINER_SUPPLEMENT_CATALOG_UID===CURRENT_USER.uid)return TRAINER_SUPPLEMENT_CATALOG;try{const doc=await cloudGet(db.collection('trainerSupplementCatalog').doc(CURRENT_USER.uid),'lista privada de suplementos');TRAINER_SUPPLEMENT_CATALOG=normalizeTrainerSupplementCatalog(doc.exists?doc.data():{});TRAINER_SUPPLEMENT_CATALOG_UID=CURRENT_USER.uid;return TRAINER_SUPPLEMENT_CATALOG;}catch(error){console.warn('Lista privada de suplementos indisponível',error);showToast('Não foi possível carregar sua lista privada agora.',true);return{items:[]};}}
async function persistTrainerSupplementCatalog(){if(CURRENT_USER?.role!=='trainer')throw new Error('A lista privada pertence à conta do treinador.');TRAINER_SUPPLEMENT_CATALOG=normalizeTrainerSupplementCatalog(TRAINER_SUPPLEMENT_CATALOG);await cloudWrite(db.collection('trainerSupplementCatalog').doc(CURRENT_USER.uid).set({trainerId:CURRENT_USER.uid,items:TRAINER_SUPPLEMENT_CATALOG.items,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}),'salvar lista privada de suplementos');TRAINER_SUPPLEMENT_CATALOG_UID=CURRENT_USER.uid;}
function renderTrainerSupplementCatalog(){const host=document.getElementById('supplement-catalog-list');if(!host)return;const items=TRAINER_SUPPLEMENT_CATALOG.items||[];host.innerHTML=items.length?items.map(item=>`<article class="supplement-catalog-item"><div><strong>${esc(item.name)}</strong><span>${esc([item.dose,item.time,item.notes].filter(Boolean).join(' · ')||'Sem detalhes padrão')}</span></div><button type="button" onclick="editTrainerSupplementCatalogItem(${jsArg(item.id)})">EDITAR</button></article>`).join(''):'<div class="supplement-catalog-empty">Sua lista privada ainda está vazia. Cadastre os suplementos que você utiliza com frequência.</div>';}
function resetTrainerSupplementCatalogEditor(){EDIT_TRAINER_SUPPLEMENT_ID='';const title=document.getElementById('supplement-catalog-editor-title');if(title)title.textContent='Novo suplemento';['name','dose','time','notes'].forEach(field=>{const element=document.getElementById('input-supplement-catalog-'+field);if(element)element.value='';});const remove=document.getElementById('btn-delete-supplement-catalog');if(remove)remove.style.display='none';}
async function openSupplementCatalogManager(){if(CURRENT_USER?.role!=='trainer'){showToast('A lista privada está disponível apenas para o treinador.',true);return;}await loadTrainerSupplementCatalog();renderTrainerSupplementCatalog();resetTrainerSupplementCatalogEditor();openModal('modal-supplement-catalog');}
function editTrainerSupplementCatalogItem(id){const item=TRAINER_SUPPLEMENT_CATALOG.items.find(entry=>entry.id===id);if(!item)return;EDIT_TRAINER_SUPPLEMENT_ID=id;const title=document.getElementById('supplement-catalog-editor-title');if(title)title.textContent='Editar suplemento';['name','dose','time','notes'].forEach(field=>{const element=document.getElementById('input-supplement-catalog-'+field);if(element)element.value=item[field]||'';});const remove=document.getElementById('btn-delete-supplement-catalog');if(remove)remove.style.display='block';document.getElementById('input-supplement-catalog-name')?.focus();}
async function saveTrainerSupplementCatalogItem(){if(CURRENT_USER?.role!=='trainer'||!beginAction('save-supplement-catalog','modal-supplement-catalog'))return;try{const data=normalizeTrainerSupplementItem({id:EDIT_TRAINER_SUPPLEMENT_ID||uid(),name:document.getElementById('input-supplement-catalog-name').value,dose:document.getElementById('input-supplement-catalog-dose').value,time:document.getElementById('input-supplement-catalog-time').value,notes:document.getElementById('input-supplement-catalog-notes').value,order:TRAINER_SUPPLEMENT_CATALOG.items.length});if(!data.name)throw new Error('Informe o nome do suplemento.');const existing=TRAINER_SUPPLEMENT_CATALOG.items.findIndex(item=>item.id===EDIT_TRAINER_SUPPLEMENT_ID);if(existing>=0)TRAINER_SUPPLEMENT_CATALOG.items[existing]={...TRAINER_SUPPLEMENT_CATALOG.items[existing],...data,order:TRAINER_SUPPLEMENT_CATALOG.items[existing].order};else TRAINER_SUPPLEMENT_CATALOG.items.push(data);await persistTrainerSupplementCatalog();renderTrainerSupplementCatalog();resetTrainerSupplementCatalogEditor();populateDietSupportCatalogSelect();showToast('✓ Suplemento salvo na sua lista privada');}catch(error){alert(cloudWriteError(error,'salvar o suplemento na lista privada'));}finally{endAction('save-supplement-catalog','modal-supplement-catalog');}}
function deleteTrainerSupplementCatalogItem(){if(!EDIT_TRAINER_SUPPLEMENT_ID||CURRENT_USER?.role!=='trainer')return;showConfirm('Excluir da lista privada','Remover este suplemento da sua biblioteca? Os itens já prescritos nas dietas dos alunos serão preservados.',async()=>{const before=JSON.stringify(TRAINER_SUPPLEMENT_CATALOG);try{TRAINER_SUPPLEMENT_CATALOG.items=TRAINER_SUPPLEMENT_CATALOG.items.filter(item=>item.id!==EDIT_TRAINER_SUPPLEMENT_ID);await persistTrainerSupplementCatalog();renderTrainerSupplementCatalog();resetTrainerSupplementCatalogEditor();populateDietSupportCatalogSelect();showToast('✓ Item removido da lista privada');}catch(error){TRAINER_SUPPLEMENT_CATALOG=normalizeTrainerSupplementCatalog(JSON.parse(before));alert(cloudWriteError(error,'excluir o suplemento da lista privada'));}});}
function populateDietSupportCatalogSelect(){const select=document.getElementById('input-diet-support-catalog');if(!select)return;const current=select.value;select.innerHTML='<option value="">Escolher suplemento...</option>'+TRAINER_SUPPLEMENT_CATALOG.items.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('');if(TRAINER_SUPPLEMENT_CATALOG.items.some(item=>item.id===current))select.value=current;}
function configureDietSupportPrivateCatalog(section){const wrap=document.getElementById('diet-support-private-catalog-wrap'),allowed=CURRENT_USER?.role==='trainer'&&V1010_SUPPLEMENT_SECTIONS.has(section);if(wrap)wrap.style.display=allowed?'block':'none';const select=document.getElementById('input-diet-support-catalog');if(select)select.value='';if(allowed)loadTrainerSupplementCatalog().then(populateDietSupportCatalogSelect);}
function applyTrainerSupplementCatalogSelection(){const id=document.getElementById('input-diet-support-catalog')?.value,item=TRAINER_SUPPLEMENT_CATALOG.items.find(entry=>entry.id===id);if(!item)return;['name','dose','time','notes'].forEach(field=>{const element=document.getElementById('input-diet-support-'+field);if(element)element.value=item[field]||'';});}
const V1010_OPEN_ADD_DIET_SUPPORT_BASE=openAddDietSupportItem;
openAddDietSupportItem=function(section){V1010_OPEN_ADD_DIET_SUPPORT_BASE(section);configureDietSupportPrivateCatalog(section);};
const V1010_OPEN_EDIT_DIET_SUPPORT_BASE=openEditDietSupportItem;
openEditDietSupportItem=function(section,id){V1010_OPEN_EDIT_DIET_SUPPORT_BASE(section,id);configureDietSupportPrivateCatalog(section);};

let V1010_FEEDBACK_LOADING=false,V1010_FEEDBACK_PREFILL='general';
function v1010FeedbackType(value){return ['general','weekly_report','protocol_update'].includes(String(value))?String(value):'general';}
function v1010FeedbackLabel(data){const type=v1010FeedbackType(data?.feedbackType),title=String(data?.title||'').trim();if(title)return title;if(type==='protocol_update')return'Feedback da atualização completa';if(type==='weekly_report')return'Feedback do relatório semanal';return'Transmissão recebida // treinador';}
checkFeedback=async function(){if(!CURRENT_USER||CURRENT_USER.role==='trainer'||V1010_FEEDBACK_LOADING)return;const studentUid=CURRENT_USER.uid,banner=document.getElementById('feedback-banner');V1010_FEEDBACK_LOADING=true;try{let docs;try{const ordered=await cloudGet(db.collection('feedback').where('studentId','==',studentUid).where('read','==',false).orderBy('createdAt','asc').limit(1),'feedback pendente');docs=ordered.docs;}catch(indexError){const fallback=await cloudGet(db.collection('feedback').where('studentId','==',studentUid).limit(200),'feedback do aluno');docs=fallback.docs.filter(doc=>doc.data().read!==true).sort((a,b)=>createdMillis(a.data())-createdMillis(b.data())||String(a.id).localeCompare(String(b.id))).slice(0,1);}if(CURRENT_USER?.uid!==studentUid)return;if(!docs.length){if(banner){banner.style.display='none';banner.dataset.fid='';}return;}const doc=docs[0];showFeedbackBanner(doc.id,doc.data());}catch(error){console.warn('checkFeedback',error.code||error.message);}finally{V1010_FEEDBACK_LOADING=false;}};
showFeedbackBanner=function(fid,data){const banner=document.getElementById('feedback-banner'),label=document.getElementById('feedback-banner-label'),text=document.getElementById('feedback-banner-text');if(!banner||!text)return;const payload=typeof data==='string'?{message:data}:data||{};if(label)label.textContent=v1010FeedbackLabel(payload);text.textContent=String(payload.message||'');banner.dataset.fid=fid;banner.style.display='block';};
dismissFeedback=async function(){const banner=document.getElementById('feedback-banner');if(!banner)return;const fid=banner.dataset.fid;banner.style.display='none';banner.dataset.fid='';if(fid&&db)try{await cloudWrite(db.collection('feedback').doc(fid).update({read:true}),'marcar feedback');}catch(error){console.warn('Não foi possível marcar a transmissão como lida',error);}await checkFeedback();};
function updateFeedbackCharacterCount(){const input=document.getElementById('input-feedback'),counter=document.getElementById('feedback-character-count');if(counter)counter.textContent=`${(input?.value.length||0).toLocaleString('pt-BR')} / 30.000 caracteres`;}
function syncFeedbackEditorType(){const select=document.getElementById('input-feedback-type'),title=document.getElementById('input-feedback-title'),modalTitle=document.getElementById('modal-feedback-title'),help=document.getElementById('feedback-editor-help'),type=v1010FeedbackType(select?.value);if(type==='protocol_update'){if(title&&!title.value.trim())title.value='Feedback da atualização completa';if(modalTitle)modalTitle.textContent='Feedback extenso da atualização';if(help)help.textContent='Registre uma análise detalhada da atualização completa de treino e dieta. O aluno receberá este conteúdo na Sala Vermelha.';}else if(type==='weekly_report'){if(title&&!title.value.trim())title.value='Feedback do relatório semanal';if(modalTitle)modalTitle.textContent='Feedback do relatório semanal';if(help)help.textContent='Envie as observações referentes ao relatório semanal. Transmissões pendentes serão exibidas ao aluno em ordem cronológica.';}else{if(modalTitle)modalTitle.textContent='Enviar transmissão';if(help)help.textContent='O aluno receberá esta transmissão na Sala Vermelha. Mensagens não lidas serão exibidas em ordem, uma após a outra.';}}
openFeedbackModal=function(type='general'){if(!VIEW_STUDENT)return;V1010_FEEDBACK_PREFILL=v1010FeedbackType(type);const typeInput=document.getElementById('input-feedback-type'),title=document.getElementById('input-feedback-title'),message=document.getElementById('input-feedback');if(typeInput)typeInput.value=V1010_FEEDBACK_PREFILL;if(title)title.value='';if(message)message.value='';syncFeedbackEditorType();updateFeedbackCharacterCount();openModal('modal-feedback');};
sendFeedback=async function(){const message=document.getElementById('input-feedback').value.normalize('NFKC').trim(),type=v1010FeedbackType(document.getElementById('input-feedback-type')?.value),title=(document.getElementById('input-feedback-title')?.value||'').normalize('NFKC').trim().slice(0,160)||v1010FeedbackLabel({feedbackType:type});if(!message){alert('Digite o conteúdo do feedback.');return;}if(message.length>30000){alert('O feedback ultrapassa 30.000 caracteres.');return;}if(!VIEW_STUDENT||!beginAction('send-feedback','modal-feedback'))return;try{const draftKey='feedback-'+VIEW_STUDENT.uid,feedbackId=idempotentDraftId(draftKey,'feedback'),schedule=type==='protocol_update'?V109_PROTOCOL_REVIEW_SCHEDULE:null,state=schedule?v109ProtocolState(schedule):null;await cloudWrite(db.collection('feedback').doc(feedbackId).set({studentId:VIEW_STUDENT.uid,trainerId:CURRENT_USER.uid,title,feedbackType:type,message,protocolStartDate:type==='protocol_update'&&validIsoDate(schedule?.startDate)?schedule.startDate:'',protocolCycle:type==='protocol_update'?Math.max(0,Number(state?.pendingCycle||state?.elapsedCycle||0)):0,createdAt:firebase.firestore.FieldValue.serverTimestamp(),read:false}),'enviar o feedback');clearIdempotentDraft(draftKey);closeModal('modal-feedback');alert('Feedback enviado. Se houver outras transmissões pendentes, o aluno verá cada uma em sequência.');}catch(error){alert(cloudWriteError(error,'enviar o feedback'));}finally{endAction('send-feedback','modal-feedback');}};

const V1010_CONFIRM_LOGOUT_BASE=confirmLogout;
confirmLogout=function(){TRAINER_SUPPLEMENT_CATALOG={items:[]};TRAINER_SUPPLEMENT_CATALOG_UID='';EDIT_TRAINER_SUPPLEMENT_ID='';V1010_FEEDBACK_LOADING=false;return V1010_CONFIRM_LOGOUT_BASE();};
function v1010ApplyVersionLabels(){document.documentElement.dataset.appVersion=V1010_VERSION;document.querySelectorAll('.trainer-desktop-logo small,.student-desktop-logo small').forEach(element=>{element.textContent=element.textContent.replace(/V\d+(?:\.\d+)*/i,'V'+V1010_VERSION);});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',v1010ApplyVersionLabels,{once:true});else v1010ApplyVersionLabels();


/* ═══════════════════════════════════════════════════════════════
   TEAM BULLS v10.10.9 — PRESCRIÇÃO DE CARDIO E CRONÔMETROS
   Um único plano é acessível pelas áreas de treino e dieta.
   Cada substituição possui modalidade, duração, frequência e timer próprios.
═══════════════════════════════════════════════════════════════ */
const V10109_VERSION='10.10.9';
let CARDIO_DOCUMENT={main:null,substitutions:[]};
let CARDIO_CONTEXT={targetUid:'',trainer:false,local:false,source:'workout'};
let CURRENT_CARDIO_ITEM_ID='';
let EDIT_CARDIO_KIND='main';
let EDIT_CARDIO_ITEM_ID='';
let CARDIO_TIMER_INTERVAL=0;
const CARDIO_TIMER_MEMORY=new Map();

function normalizeCardioItem(value,index=0){
  const raw=value&&typeof value==='object'?value:{};
  const type=String(raw.type||raw.name||'').normalize('NFKC').trim().slice(0,100);
  return{id:String(raw.id||uid()).replace(/[^A-Za-z0-9_-]/g,'').slice(0,100)||uid(),type,durationMinutes:Math.max(1,Math.min(600,Math.trunc(Number(raw.durationMinutes??raw.minutes??30)||30))),daysPerWeek:Math.max(1,Math.min(7,Math.trunc(Number(raw.daysPerWeek??raw.frequency??3)||3))),notes:String(raw.notes||'').normalize('NFKC').trim().slice(0,1500),order:Number.isFinite(Number(raw.order))?Math.max(0,Math.trunc(Number(raw.order))):index};
}
function normalizeCardioDocument(value){
  const raw=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const mainSource=raw.main||raw.primary||raw.prescription||null;
  const main=mainSource?normalizeCardioItem(mainSource,0):null;
  const substitutions=(Array.isArray(raw.substitutions)?raw.substitutions:Array.isArray(raw.alternatives)?raw.alternatives:[]).map(normalizeCardioItem).filter(item=>item.type).slice(0,20).sort((a,b)=>a.order-b.order||a.type.localeCompare(b.type,'pt-BR')).map((item,index)=>({...item,order:index}));
  return{main:main&&main.type?main:null,substitutions};
}
function cardioCanEdit(){return CARDIO_CONTEXT.trainer||(CARDIO_CONTEXT.local&&canSelfManagePlan());}
function cardioOwnerKey(){return String(CARDIO_CONTEXT.targetUid||CURRENT_USER?.uid||INACTIVE_UID||LOCAL_OWNER_UID||LOCAL_GUEST_OWNER||'local').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,150);}
function cardioAllItems(){return [CARDIO_DOCUMENT.main,...CARDIO_DOCUMENT.substitutions].filter(Boolean);}
function cardioItemById(id){return cardioAllItems().find(item=>String(item.id)===String(id))||null;}
function cardioDurationText(minutes){const value=Math.max(1,Math.trunc(Number(minutes)||1)),hours=Math.floor(value/60),rest=value%60;if(!hours)return`${value} min`;return rest?`${hours} h ${rest} min`:`${hours} h`;}
function cardioFrequencyText(days){const value=Math.max(1,Math.min(7,Math.trunc(Number(days)||1)));return`${value} ${value===1?'dia':'dias'} por semana`;}
function cardioTimerStorageKey(itemId){return`teamms_cardio_timer_v10109_${cardioOwnerKey()}_${String(itemId||'').replace(/[^A-Za-z0-9_-]/g,'_')}`;}
function readCardioTimer(item){
  if(!item)return null;const key=cardioTimerStorageKey(item.id),durationSeconds=item.durationMinutes*60;let state=null;
  try{const raw=localStorage.getItem(key);if(raw)state=JSON.parse(raw);}catch(error){}
  if(!state)state=CARDIO_TIMER_MEMORY.get(key)||null;
  if(!state||Number(state.durationSeconds)!==durationSeconds)state={durationSeconds,remainingSeconds:durationSeconds,running:false,endAt:0,completedAt:0};
  if(state.running)state.remainingSeconds=Math.max(0,Math.ceil((Number(state.endAt)||0-Date.now())/1000));
  return{durationSeconds,remainingSeconds:Math.max(0,Math.min(durationSeconds,Math.trunc(Number(state.remainingSeconds)||0))),running:state.running===true,endAt:Number(state.endAt)||0,completedAt:Number(state.completedAt)||0};
}
function writeCardioTimer(item,state){if(!item||!state)return;const key=cardioTimerStorageKey(item.id),safe={durationSeconds:item.durationMinutes*60,remainingSeconds:Math.max(0,Math.min(item.durationMinutes*60,Math.trunc(Number(state.remainingSeconds)||0))),running:state.running===true,endAt:Number(state.endAt)||0,completedAt:Number(state.completedAt)||0};CARDIO_TIMER_MEMORY.set(key,safe);try{localStorage.setItem(key,JSON.stringify(safe));}catch(error){}return safe;}
function clearCardioTimer(itemId){const key=cardioTimerStorageKey(itemId);CARDIO_TIMER_MEMORY.delete(key);try{localStorage.removeItem(key);}catch(error){}}
function formatCardioClock(seconds){const safe=Math.max(0,Math.trunc(Number(seconds)||0)),hours=Math.floor(safe/3600),minutes=Math.floor((safe%3600)/60),secs=safe%60;return hours?`${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`:`${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;}
async function loadCardioDocument(targetUid=''){
  if(CARDIO_CONTEXT.local){return normalizeCardioDocument(LOCAL_DB.cardioPlan||{});}
  const uidTarget=targetUid||CURRENT_USER?.uid;if(!uidTarget)return normalizeCardioDocument({});
  try{const doc=await cloudGet(db.collection('mealPlans').doc(uidTarget),'prescrição de cardio'),data=normalizeCardioDocument(doc.exists?doc.data().cardioPlan:{});if(CURRENT_USER?.role==='student'&&CURRENT_USER.uid===uidTarget){try{ensureLocalOwner(uidTarget);LOCAL_DB={...LOCAL_DB,cardioPlan:data};storageSet(localKeyFor(),JSON.stringify(LOCAL_DB));}catch(error){}}return data;}catch(error){console.warn('loadCardioDocument',error);if(CURRENT_USER?.uid===uidTarget&&LOCAL_DB?.cardioPlan)return normalizeCardioDocument(LOCAL_DB.cardioPlan);return normalizeCardioDocument({});}
}
async function persistCardioDocument(){
  CARDIO_DOCUMENT=normalizeCardioDocument(CARDIO_DOCUMENT);
  if(CARDIO_CONTEXT.local){LOCAL_DB.cardioPlan=JSON.parse(JSON.stringify(CARDIO_DOCUMENT));if(!localSave())throw new Error('Falha ao salvar o cardio neste aparelho.');return;}
  if(!CARDIO_CONTEXT.trainer||CURRENT_USER?.role!=='trainer')throw new Error('Somente o treinador pode alterar a prescrição de cardio.');
  if(!CARDIO_CONTEXT.targetUid)throw new Error('Aluno não identificado.');
  await cloudWrite(db.collection('mealPlans').doc(CARDIO_CONTEXT.targetUid).set({cardioPlan:CARDIO_DOCUMENT,cardioUpdatedBy:CURRENT_USER.uid,cardioUpdatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}),'salvar prescrição de cardio');
}
function cardioItemCard(item,isMain,trainer){
  const selected=String(CURRENT_CARDIO_ITEM_ID)===String(item.id),index=CARDIO_DOCUMENT.substitutions.findIndex(entry=>entry.id===item.id);
  const controls=trainer?`<div class="cardio-card-actions"><button class="primary" type="button" onclick="selectCardioTimer(${jsArg(item.id)})">CRONÔMETRO</button>${!isMain?`<button type="button" ${index<=0?'disabled':''} onclick="moveCardioSubstitution(${jsArg(item.id)},-1)">↑</button><button type="button" ${index<0||index>=CARDIO_DOCUMENT.substitutions.length-1?'disabled':''} onclick="moveCardioSubstitution(${jsArg(item.id)},1)">↓</button>`:''}<button type="button" onclick="openEditCardioItem(${jsArg(isMain?'main':'substitution')},${jsArg(item.id)})">EDITAR</button></div>`:`<div class="cardio-card-actions"><button class="primary" type="button" onclick="selectCardioTimer(${jsArg(item.id)})">USAR TIMER</button></div>`;
  return`<article class="cardio-prescription-card ${isMain?'main':''} ${selected?'selected':''}"><div class="cardio-prescription-icon">${isMain?'C':'↺'}</div><div class="cardio-prescription-main"><div class="cardio-prescription-kicker">${isMain?'CARDIO PRINCIPAL':'SUBSTITUIÇÃO AUTORIZADA'}</div><div class="cardio-prescription-name">${esc(item.type)}</div><div class="cardio-metrics"><span class="cardio-metric">TEMPO <b>${esc(cardioDurationText(item.durationMinutes))}</b></span><span class="cardio-metric">FREQUÊNCIA <b>${esc(cardioFrequencyText(item.daysPerWeek))}</b></span></div>${item.notes?`<div class="cardio-prescription-notes">${esc(item.notes)}</div>`:''}</div>${controls}</article>`;
}
function cardioTimerMarkup(item){
  if(!item)return'';const state=readCardioTimer(item),progress=state.durationSeconds?Math.max(0,Math.min(100,state.remainingSeconds/state.durationSeconds*100)):0,status=state.running?'CRONÔMETRO EM ANDAMENTO':state.remainingSeconds===0?'CARDIO CONCLUÍDO':'PRONTO PARA INICIAR';
  return`<section class="cardio-timer-card" aria-label="Cronômetro de cardio"><div class="cardio-timer-head"><div><span>CRONÔMETRO PRESCRITO</span><strong>${esc(item.type)}</strong></div><div class="cardio-timer-frequency">${esc(cardioDurationText(item.durationMinutes))}<br>${esc(cardioFrequencyText(item.daysPerWeek))}</div></div><time class="cardio-timer-clock" id="cardio-timer-clock" aria-live="polite">${formatCardioClock(state.remainingSeconds)}</time><div class="cardio-timer-progress"><div id="cardio-timer-progress-fill" style="width:${progress.toFixed(2)}%"></div></div><div class="cardio-timer-status" id="cardio-timer-status">${status}</div><div class="cardio-timer-actions"><button class="start" type="button" onclick="startCardioTimer()">▶ INICIAR</button><button type="button" onclick="pauseCardioTimer()">Ⅱ PAUSAR</button><button type="button" onclick="resetCardioTimer()">↻ REINICIAR</button></div></section>`;
}
function renderCardioScreen(){
  const host=document.getElementById(CARDIO_CONTEXT.trainer?'ts-cardio-content':'cardio-content');if(!host)return;const canEdit=cardioCanEdit(),main=CARDIO_DOCUMENT.main,subs=CARDIO_DOCUMENT.substitutions;
  if(!CURRENT_CARDIO_ITEM_ID||!cardioItemById(CURRENT_CARDIO_ITEM_ID))CURRENT_CARDIO_ITEM_ID=main?.id||subs[0]?.id||'';
  const intro=`<div class="cardio-page-intro"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h3l2-5 4 10 2-5h5"/><path d="M3 5h18v14H3z"/></svg><div><strong>CARDIO PRESCRITO</strong><span>Modalidade, duração e frequência definidas individualmente. As substituições abaixo possuem tempos e cronômetros próprios.</span></div></div>`;
  const mainBlock=`<section class="cardio-section"><div class="cardio-section-head"><span>PRESCRIÇÃO PRINCIPAL</span>${canEdit?`<button type="button" onclick="${main?`openEditCardioItem('main',${jsArg(main.id)})`:`openAddCardioMain()`}">${main?'EDITAR':'＋ PRESCREVER'}</button>`:''}</div>${main?cardioItemCard(main,true,CARDIO_CONTEXT.trainer):`<div class="cardio-empty">${canEdit?'Nenhum cardio principal foi prescrito.':'O treinador ainda não prescreveu o cardio.'}${canEdit?'<button type="button" onclick="openAddCardioMain()">PRESCREVER CARDIO PRINCIPAL</button>':''}</div>`}</section>`;
  const subsBlock=`<section class="cardio-section"><div class="cardio-section-head"><span>SUBSTITUIÇÕES DE CARDIO</span>${canEdit?'<button type="button" onclick="openAddCardioSubstitution()">＋ SUBSTITUIÇÃO</button>':''}</div><div class="cardio-options-list">${subs.length?subs.map(item=>cardioItemCard(item,false,CARDIO_CONTEXT.trainer)).join(''):`<div class="cardio-empty">${canEdit?'Cadastre alternativas para os dias em que o cardio principal não puder ser realizado.':'Nenhuma substituição de cardio foi liberada.'}</div>`}</div></section>`;
  const selected=cardioItemById(CURRENT_CARDIO_ITEM_ID);host.innerHTML=intro+mainBlock+subsBlock+cardioTimerMarkup(selected);updateCardioTimerDisplay();
}
async function openCardioModule(source='workout',trainerMode=false){
  if(trainerMode&&!VIEW_STUDENT)return;const navigation=beginAsyncNavigation(),targetUid=trainerMode?VIEW_STUDENT.uid:(MODE==='cloud'?CURRENT_USER?.uid:'');CARDIO_CONTEXT={targetUid:targetUid||'',trainer:trainerMode,local:MODE==='local'&&!trainerMode,source:source==='diet'?'diet':'workout'};CARDIO_DOCUMENT=await loadCardioDocument(targetUid);if(!isNavigationCurrent(navigation))return;if(trainerMode&&VIEW_STUDENT?.uid!==targetUid)return;const note=document.getElementById('cardio-readonly-note');if(note)note.style.display=cardioCanEdit()?'none':'block';renderCardioScreen();showScreen(trainerMode?'screen-ts-cardio':'screen-cardio',navigation);ensureCardioTimerTicker();
}
function openCardioFromWorkout(trainerMode=false){return openCardioModule('workout',trainerMode);}
function openCardioFromDiet(trainerMode=false){return openCardioModule('diet',trainerMode);}
function closeCardioScreen(){
  if(CARDIO_CONTEXT.trainer){if(CARDIO_CONTEXT.source==='diet'){if(CURRENT_DIET_ID)return openDietDetail(CURRENT_DIET_ID,true);return openTsMeals();}if(VIEW_STUDENT_WORKOUT)return goTsWorkout();return goTrainerStudent();}
  if(CARDIO_CONTEXT.source==='diet'){if(CURRENT_DIET_ID)return openDietDetail(CURRENT_DIET_ID,false);return openMeals();}if(CUR_WORKOUT)return goWorkout();return goHome();
}
function selectCardioTimer(itemId){if(!cardioItemById(itemId))return;CURRENT_CARDIO_ITEM_ID=itemId;renderCardioScreen();ensureCardioTimerTicker();}
function currentCardioTimerItem(){return cardioItemById(CURRENT_CARDIO_ITEM_ID);}
function updateCardioTimerDisplay(){
  const item=currentCardioTimerItem(),clock=document.getElementById('cardio-timer-clock'),fill=document.getElementById('cardio-timer-progress-fill'),status=document.getElementById('cardio-timer-status');if(!item||!clock)return;let state=readCardioTimer(item),completedNow=false;if(state.running&&state.remainingSeconds<=0){completedNow=!state.completedAt;state={...state,running:false,endAt:0,remainingSeconds:0,completedAt:Date.now()};writeCardioTimer(item,state);}clock.textContent=formatCardioClock(state.remainingSeconds);if(fill)fill.style.width=(state.durationSeconds?state.remainingSeconds/state.durationSeconds*100:0).toFixed(2)+'%';if(status)status.textContent=state.running?'CRONÔMETRO EM ANDAMENTO':state.remainingSeconds===0?'CARDIO CONCLUÍDO':'PRONTO PARA INICIAR';if(completedNow){try{playSurvivalTone(740,.22);navigator.vibrate?.([180,90,180]);}catch(error){}showToast('✓ Tempo de cardio concluído');}}
function ensureCardioTimerTicker(){if(CARDIO_TIMER_INTERVAL)return;CARDIO_TIMER_INTERVAL=setInterval(()=>{const screen=document.querySelector('.screen.active')?.id;if(screen==='screen-cardio'||screen==='screen-ts-cardio')updateCardioTimerDisplay();},500);}
function startCardioTimer(){const item=currentCardioTimerItem();if(!item)return;let state=readCardioTimer(item);if(state.remainingSeconds<=0)state.remainingSeconds=state.durationSeconds;state.running=true;state.endAt=Date.now()+state.remainingSeconds*1000;state.completedAt=0;writeCardioTimer(item,state);ensureCardioTimerTicker();updateCardioTimerDisplay();}
function pauseCardioTimer(){const item=currentCardioTimerItem();if(!item)return;let state=readCardioTimer(item);state.running=false;state.endAt=0;writeCardioTimer(item,state);updateCardioTimerDisplay();}
function resetCardioTimer(){const item=currentCardioTimerItem();if(!item)return;writeCardioTimer(item,{durationSeconds:item.durationMinutes*60,remainingSeconds:item.durationMinutes*60,running:false,endAt:0,completedAt:0});updateCardioTimerDisplay();}
function openAddCardioMain(){if(!cardioCanEdit())return;EDIT_CARDIO_KIND='main';EDIT_CARDIO_ITEM_ID='';document.getElementById('modal-cardio-title').textContent='Prescrever cardio principal';document.getElementById('input-cardio-type').value='';document.getElementById('input-cardio-duration').value='30';document.getElementById('input-cardio-frequency').value='3';document.getElementById('input-cardio-notes').value='';document.getElementById('btn-delete-cardio-item').style.display='none';openModal('modal-cardio-item');focusEditorField('input-cardio-type',250);}
function openAddCardioSubstitution(){if(!cardioCanEdit())return;if(CARDIO_DOCUMENT.substitutions.length>=20){alert('Limite seguro de 20 substituições de cardio atingido.');return;}EDIT_CARDIO_KIND='substitution';EDIT_CARDIO_ITEM_ID='';document.getElementById('modal-cardio-title').textContent='Nova substituição de cardio';document.getElementById('input-cardio-type').value='';document.getElementById('input-cardio-duration').value=String(CARDIO_DOCUMENT.main?.durationMinutes||30);document.getElementById('input-cardio-frequency').value=String(CARDIO_DOCUMENT.main?.daysPerWeek||3);document.getElementById('input-cardio-notes').value='';document.getElementById('btn-delete-cardio-item').style.display='none';openModal('modal-cardio-item');focusEditorField('input-cardio-type',250);}
function openEditCardioItem(kind,id){if(!cardioCanEdit())return;const item=kind==='main'?CARDIO_DOCUMENT.main:CARDIO_DOCUMENT.substitutions.find(entry=>entry.id===id);if(!item)return;EDIT_CARDIO_KIND=kind==='main'?'main':'substitution';EDIT_CARDIO_ITEM_ID=item.id;document.getElementById('modal-cardio-title').textContent=EDIT_CARDIO_KIND==='main'?'Editar cardio principal':'Editar substituição de cardio';document.getElementById('input-cardio-type').value=item.type;document.getElementById('input-cardio-duration').value=String(item.durationMinutes);document.getElementById('input-cardio-frequency').value=String(item.daysPerWeek);document.getElementById('input-cardio-notes').value=item.notes;document.getElementById('btn-delete-cardio-item').style.display='block';openModal('modal-cardio-item');}
async function saveCardioItem(){
  if(!cardioCanEdit()||!beginAction('save-cardio-item','modal-cardio-item'))return;const type=document.getElementById('input-cardio-type').value.normalize('NFKC').trim(),durationMinutes=Math.trunc(Number(document.getElementById('input-cardio-duration').value)),daysPerWeek=Math.trunc(Number(document.getElementById('input-cardio-frequency').value)),notes=document.getElementById('input-cardio-notes').value.normalize('NFKC').trim();if(!type){alert('Informe o tipo de cardio.');endAction('save-cardio-item','modal-cardio-item');return;}if(!Number.isInteger(durationMinutes)||durationMinutes<1||durationMinutes>600){alert('Informe um tempo entre 1 e 600 minutos.');endAction('save-cardio-item','modal-cardio-item');return;}if(!Number.isInteger(daysPerWeek)||daysPerWeek<1||daysPerWeek>7){alert('Informe uma frequência entre 1 e 7 dias por semana.');endAction('save-cardio-item','modal-cardio-item');return;}const before=JSON.stringify(CARDIO_DOCUMENT);
  try{let item;if(EDIT_CARDIO_KIND==='main'){const old=CARDIO_DOCUMENT.main;item=normalizeCardioItem({id:old?.id||EDIT_CARDIO_ITEM_ID||uid(),type,durationMinutes,daysPerWeek,notes,order:0});CARDIO_DOCUMENT.main=item;}else{const index=CARDIO_DOCUMENT.substitutions.findIndex(entry=>entry.id===EDIT_CARDIO_ITEM_ID);item=normalizeCardioItem({id:index>=0?CARDIO_DOCUMENT.substitutions[index].id:uid(),type,durationMinutes,daysPerWeek,notes,order:index>=0?CARDIO_DOCUMENT.substitutions[index].order:CARDIO_DOCUMENT.substitutions.length});if(index>=0)CARDIO_DOCUMENT.substitutions[index]=item;else CARDIO_DOCUMENT.substitutions.push(item);}clearCardioTimer(item.id);CURRENT_CARDIO_ITEM_ID=item.id;await persistCardioDocument();closeModal('modal-cardio-item');renderCardioScreen();showToast('✓ Prescrição de cardio salva');}catch(error){CARDIO_DOCUMENT=normalizeCardioDocument(JSON.parse(before));alert(cloudWriteError(error,'salvar o cardio'));}finally{endAction('save-cardio-item','modal-cardio-item');}
}
function deleteCardioItem(){if(!cardioCanEdit()||!EDIT_CARDIO_ITEM_ID)return;const kind=EDIT_CARDIO_KIND,id=EDIT_CARDIO_ITEM_ID;closeModal('modal-cardio-item');showConfirm('Excluir cardio',kind==='main'?'Remover a prescrição principal de cardio? As substituições serão preservadas.':'Remover esta substituição de cardio?',async()=>{const before=JSON.stringify(CARDIO_DOCUMENT);try{if(kind==='main')CARDIO_DOCUMENT.main=null;else CARDIO_DOCUMENT.substitutions=CARDIO_DOCUMENT.substitutions.filter(item=>item.id!==id);clearCardioTimer(id);if(CURRENT_CARDIO_ITEM_ID===id)CURRENT_CARDIO_ITEM_ID=CARDIO_DOCUMENT.main?.id||CARDIO_DOCUMENT.substitutions[0]?.id||'';await persistCardioDocument();renderCardioScreen();showToast('✓ Cardio removido');}catch(error){CARDIO_DOCUMENT=normalizeCardioDocument(JSON.parse(before));alert(cloudWriteError(error,'excluir o cardio'));}});}
async function moveCardioSubstitution(id,delta){if(!cardioCanEdit())return;const index=CARDIO_DOCUMENT.substitutions.findIndex(item=>item.id===id),target=index+Number(delta);if(index<0||target<0||target>=CARDIO_DOCUMENT.substitutions.length)return;[CARDIO_DOCUMENT.substitutions[index],CARDIO_DOCUMENT.substitutions[target]]=[CARDIO_DOCUMENT.substitutions[target],CARDIO_DOCUMENT.substitutions[index]];CARDIO_DOCUMENT.substitutions.forEach((item,i)=>item.order=i);try{await persistCardioDocument();renderCardioScreen();}catch(error){showToast(cloudWriteError(error,'alterar a ordem dos cardios'),true);}}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateCardioTimerDisplay();},{passive:true});
const V10109_CONFIRM_LOGOUT_BASE=confirmLogout;
confirmLogout=function(){if(CARDIO_TIMER_INTERVAL){clearInterval(CARDIO_TIMER_INTERVAL);CARDIO_TIMER_INTERVAL=0;}CARDIO_DOCUMENT={main:null,substitutions:[]};CARDIO_CONTEXT={targetUid:'',trainer:false,local:false,source:'workout'};CURRENT_CARDIO_ITEM_ID='';return V10109_CONFIRM_LOGOUT_BASE();};

/* BC é uma técnica criada no catálogo pelo treinador. O alvo é uma orientação
   textual; os números já salvos continuam intactos para as outras técnicas. */
const BC_PRESCRIPTION_TARGET='Carga para 5 a 6';
function bcTechniqueId(){
  return TECHNIQUE_CATALOG?.items?.find(item=>String(item.code||'').trim().toUpperCase()==='BC')?.id||'';
}
function exerciseHasBcTechnique(exercise,week){
  const id=bcTechniqueId();
  return !!id&&!!exercise&&exerciseTechniqueIds(exercise,week).includes(id);
}
function bcSelectedInPrescriptionEditor(useSavedWeek=false){
  const exercise=getPlanEditExercise(),week=Number(document.getElementById('input-prescription-week')?.value)||1,id=bcTechniqueId();
  if(!id||!exercise)return false;
  if(useSavedWeek)return exerciseHasBcTechnique(exercise,week);
  const picker=document.getElementById('week-technique-picker');
  if(!picker?.querySelector('input[type="checkbox"]'))return exerciseHasBcTechnique(exercise,week);
  return [...picker.querySelectorAll('input[type="checkbox"]:checked')].some(input=>input.value===id);
}
function syncBcPrescriptionEditor(useSavedWeek=false){
  const modal=document.getElementById('modal-prescription'),editor=document.getElementById('prescription-editor');
  if(!modal||!editor)return;
  const selected=bcSelectedInPrescriptionEditor(useSavedWeek),minLabel=document.getElementById('prescription-min-label'),maxLabel=document.getElementById('prescription-max-label');
  modal.classList.toggle('bc-target-active',selected);
  if(selected&&minLabel)minLabel.textContent='REPETIÇÕES';
  if(!selected){
    const exercise=getPlanEditExercise(),week=Number(document.getElementById('input-prescription-week')?.value)||1,time=exercise&&exerciseUsesResistedTime(exercise,week);
    if(minLabel)minLabel.textContent=time?'Tempo mín.':'Reps mín.';
    if(maxLabel)maxLabel.textContent=time?'Tempo máx.':'Reps máx.';
  }
  editor.querySelectorAll('.plan-set-row').forEach(row=>{
    row.classList.toggle('bc-target-row',selected);
    [...row.querySelectorAll('input.set-edit-input')].slice(0,2).forEach(input=>input.classList.toggle('bc-hidden-target',selected));
    let label=row.querySelector('.bc-target-value');
    if(selected){
      if(!label){label=document.createElement('span');label.className='bc-target-value';row.insertBefore(label,row.querySelector('select')||row.querySelector('.btn-rm-set'));}
      label.textContent=BC_PRESCRIPTION_TARGET;
    }else label?.remove();
  });
}
function replaceBcRangeText(target){
  if(!target)return;
  const backoff=target.querySelector('.backoff-label')?.cloneNode(true);
  target.textContent=BC_PRESCRIPTION_TARGET;
  if(backoff)target.appendChild(backoff);
}
{
  const style=document.createElement('style');style.id='bc-prescription-target-style';
  style.textContent='#modal-prescription.bc-target-active #prescription-min-label{grid-column:2/4;text-align:center}#modal-prescription.bc-target-active #prescription-max-label,#modal-prescription.bc-target-active .bc-hidden-target{display:none!important}#modal-prescription .bc-target-value{grid-column:2/4;min-width:0;padding:8px 6px;border:1px solid var(--border);border-radius:4px;color:var(--text);font-size:11px;text-align:center}';
  document.head.appendChild(style);
}
const BC_BASE_WEEK_SELECTION=onWeekTechniqueSelectionChange;
onWeekTechniqueSelectionChange=function(){const result=BC_BASE_WEEK_SELECTION.apply(this,arguments);syncBcPrescriptionEditor();return result;};
const BC_BASE_LOAD_PRESCRIPTION=loadPrescriptionEditor;
loadPrescriptionEditor=function(){const result=BC_BASE_LOAD_PRESCRIPTION.apply(this,arguments);syncBcPrescriptionEditor(true);return result;};
const BC_BASE_ADD_PRESCRIPTION_ROW=addPrescriptionSetRow;
addPrescriptionSetRow=function(){const result=BC_BASE_ADD_PRESCRIPTION_ROW.apply(this,arguments);syncBcPrescriptionEditor();return result;};
const BC_BASE_REMOVE_PRESCRIPTION_ROW=removePrescriptionSet;
removePrescriptionSet=function(){const result=BC_BASE_REMOVE_PRESCRIPTION_ROW.apply(this,arguments);syncBcPrescriptionEditor();return result;};
const BC_BASE_COPY_PRESCRIPTION=copyPreviousPrescription;
copyPreviousPrescription=function(){const result=BC_BASE_COPY_PRESCRIPTION.apply(this,arguments);syncBcPrescriptionEditor();return result;};
const BC_BASE_REFRESH_BACKOFF=refreshBackoffPrescriptionRow;
refreshBackoffPrescriptionRow=function(){const result=BC_BASE_REFRESH_BACKOFF.apply(this,arguments);syncBcPrescriptionEditor();return result;};
const BC_BASE_COMPACT_SUMMARY=prescriptionCompactSummary;
prescriptionCompactSummary=function(exercise,week){
  const summary=BC_BASE_COMPACT_SUMMARY.apply(this,arguments);
  return summary?.rx?.sets?.length&&exerciseHasBcTechnique(exercise,week)?{...summary,reps:BC_PRESCRIPTION_TARGET}:summary;
};
const BC_BASE_RENDER_PRESCRIPTION=renderExercisePrescription;
renderExercisePrescription=function(exercise,elId,week){
  const result=BC_BASE_RENDER_PRESCRIPTION.apply(this,arguments);
  if(exerciseHasBcTechnique(exercise,week))document.getElementById(elId)?.querySelectorAll('.prescription-set-row .prescription-range').forEach(replaceBcRangeText);
  return result;
};
const BC_BASE_POPULATE_SESSION=populateSessionEditorForWeek;
populateSessionEditorForWeek=function(week){
  const result=BC_BASE_POPULATE_SESSION.apply(this,arguments),exercise=getE(SESSION_WID,SESSION_EID);
  if(exerciseHasBcTechnique(exercise,week))document.querySelectorAll('#sets-editor .performed-set-row[data-target-min] .performed-target').forEach(replaceBcRangeText);
  return result;
};
