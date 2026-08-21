/* Team Bulls v10.10.9 — ponte de migração para instalações controladas pelo antigo sw_47.js. */
'use strict';

const APP_VERSION='10.10.9';
const CACHE_REVISION='guidance2';
const CACHE_HOTFIX='audit1';
const CACHE_TAG=`${APP_VERSION.replace(/\./g,'-')}-${CACHE_REVISION}-${CACHE_HOTFIX}`;
const SHELL_CACHE=`team-bulls-shell-${CACHE_TAG}`;
const RUNTIME_CACHE=`team-bulls-runtime-${CACHE_TAG}`;
const AUDIO_CACHE_NAME='team-bulls-v9-5-security-audio';
const CACHE_PREFIX='team-bulls-';
const NETWORK_TIMEOUT_MS=2500;
const MUTABLE_NETWORK_TIMEOUT_MS=1800;
const NAVIGATION_REFRESH_TIMEOUT_MS=1800;
const AUDIO_NETWORK_TIMEOUT_MS=2500;
const SHELL_FETCH_CONCURRENCY=4;
const OPTIONAL_FETCH_CONCURRENCY=2;
const AUDIO_NAME_PATTERN=/^team-bulls-music-[a-z0-9-]+\.mp3$/i;

const REQUIRED_SHELL=[
  './index.html',
  './manifest.json',
  './version.json',
  './viewport_v10_10_9.js?v=10.10.9',
  './boot_v10.js?v=10.10.9',
  './config_v10_7.js?v=10.10.9',
  './update_v10_10_9.js?v=10.10.9',
  './app_v10_10_9_core.js?v=10.10.9',
  './modules/v107-core.js?v=10.10.9',
  './modules/v107-invites.js?v=10.10.9',
  './modules/v107-operations.js?v=10.10.9',
  './modules/stability_v10_10_9.js?v=10.10.9',
  './modules/app-update-v10_10_9.js?v=10.10.9',
  './modules/diet-scroll-fix-v10_10_9.js?v=10.10.9',
  './modules/modal-form-guard-v10_10_9.js?v=10.10.9',
  './modules/trainer-workspace-v10_10_9.js?v=10.10.9-workspace3',
  './modules/cardio-timer-fix-v10_10_9.js?v=10.10.9-cardio1',
  './modules/global-performance-v10_10_9.js?v=10.10.9-perf2',
  './modules/workout-ux-fix-v10_10_9.js?v=10.10.9-workout1',
  './modules/desktop-performance-v10_10_9.js?v=10.10.9-desktop1',
  './modules/ger-bulk-v10_10_9.js?v=10.10.9-ger1',
  './modules/prescription-actions-layout-v10_10_9.js?v=10.10.9-actions2',
  './modules/prescription-propagation-v10_10_9.js?v=10.10.9-propagation1',
  './modules/diet-delete-fix-v10_10_9.js?v=10.10.9-dietdelete1',
  './modules/student-guidance-v10_10_9-v2.js?v=10.10.9-guidance2',
  './modules/remove-stretch-planilha-v10_10_9.js?v=10.10.9-stretchremove2',
  './modules/security-hardening-v10_10_9.js?v=10.10.10-security7',
  './modules/legacy-student-link-repair-v10_10_10.js?v=10.10.10-legacy-links5',
  './modules/registration-integrity-v10_10_9.js?v=10.10.9-registration1',
  './modules/photo-quality-download-v10_10_9.js?v=10.10.9-photoquality1',
  './modules/workflow-controls-v10_10_10.js?v=10.10.10-workflow1',
  './modules/report-photo-ux-v10_10_10.js?v=10.10.10-reportphotos1',
  './modules/usability-audit-v10_10_10.js?v=10.10.10-audit1',
  './modules/modal-stack-stability-v10_10_9.js?v=10.10.9-modal2&fix=freeze1',
  './interaction_v10_10_9.js?v=10.10.9',
  './styles_v10_10_9.css?v=10.10.9',
  './recuperar.html',
  './recovery_v10.js?v=10.10.9',
  './recovery_v10.css?v=10.10.9',
  './icon-192-v9-8.png',
  './icon-512-v9-8.png',
  './icon-maskable-192-v9-8.png',
  './icon-maskable-512-v9-8.png',
  './apple-touch-icon-v9-8.png'
];
const OPTIONAL_SHELL=[
  './team-bulls-auth-bg-v9-8-2.webp',
  './team-bulls-desktop-menu-v10-5-6.webp',
  './modules/photo-guide-v10_10_9.js?v=10.10.9',
  './assets/photo-guide/page-1.png?v=10.10.9',
  './assets/photo-guide/page-2.png?v=10.10.9',
  './assets/photo-guide/page-3.png?v=10.10.9',
  './assets/photo-guide/page-4.png?v=10.10.9',
  './assets/photo-guide/page-5.png?v=10.10.9'
];
const VERSIONED_PATH_PATTERN=/(?:v\d+(?:[._-]\d+)+|_v\d+(?:_\d+)+)\.(?:js|css|json|png|webp)$/i;
const MUTABLE_PATHS=new Set([
  '/index.html','/recuperar.html','/manifest.json','/version.json','/boot_v10.js',
  '/config_v10_7.js','/recovery_v10.js','/recovery_v10.css','/modules/v107-core.js',
  '/modules/v107-invites.js','/modules/v107-operations.js'
]);
const CSP="default-src 'self'; script-src 'self' https://www.gstatic.com https://www.google.com https://www.recaptcha.net; script-src-elem 'self' https://www.gstatic.com https://www.google.com https://www.recaptcha.net; script-src-attr 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://firebasestorage.googleapis.com https://*.googleusercontent.com; media-src 'self' blob: https://firebasestorage.googleapis.com; connect-src 'self' https://www.gstatic.com https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com https://firebasestorage.googleapis.com https://firebaseappcheck.googleapis.com https://www.google.com https://www.recaptcha.net; frame-src https://www.youtube.com https://www.youtube-nocookie.com https://www.google.com https://www.recaptcha.net; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests";

function scopedUrl(path){return new URL(path,self.registration.scope).href;}
function pathWithinScope(url){
  const scopePath=new URL(self.registration.scope).pathname.replace(/\/$/,'');
  let path=url.pathname;
  if(scopePath&&path.startsWith(scopePath))path=path.slice(scopePath.length)||'/';
  return path;
}
function secureResponse(response,{html=false}={}){
  if(!response)return response;
  const headers=new Headers(response.headers);
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  headers.set('Cross-Origin-Resource-Policy','same-origin');
  headers.set('X-Permitted-Cross-Domain-Policies','none');
  headers.set('Permissions-Policy','camera=(self), microphone=(), geolocation=(), payment=(), usb=()');
  if(html){
    headers.set('Content-Security-Policy',CSP);
    headers.set('X-Frame-Options','DENY');
    headers.set('Cross-Origin-Opener-Policy','same-origin');
    headers.set('Cache-Control','no-cache, no-store, must-revalidate');
  }
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function fetchWithTimeout(request,timeoutMs=NETWORK_TIMEOUT_MS,init={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  return fetch(request,{...init,signal:controller.signal}).finally(()=>clearTimeout(timer));
}
async function fetchFresh(input){
  const request=typeof input==='string'?new Request(scopedUrl(input),{cache:'reload'}):input;
  return fetch(request,{cache:'reload'});
}
async function cacheOne(cache,path,required){
  try{
    const response=await fetchFresh(path);
    if(!response.ok)throw new Error(`HTTP ${response.status}: ${path}`);
    await cache.put(scopedUrl(path),response.clone());
    return true;
  }catch(error){
    console.warn('[Team Bulls] Não foi possível preparar',path,error);
    if(required)throw error;
    return false;
  }
}
async function cachePathsWithLimit(cache,paths,{required=false,limit=4}={}){
  const queue=Array.from(paths||[]);if(!queue.length)return true;
  let next=0;const failures=[];
  const worker=async()=>{
    while(true){
      const index=next++;if(index>=queue.length)return;
      try{await cacheOne(cache,queue[index],required);}
      catch(error){failures.push(error);}
    }
  };
  const count=Math.min(Math.max(1,Math.trunc(Number(limit)||1)),queue.length);
  await Promise.all(Array.from({length:count},worker));
  if(required&&failures.length)throw failures[0];
  return failures.length===0;
}
async function prepareShell(){
  const cache=await caches.open(SHELL_CACHE);
  await cachePathsWithLimit(cache,REQUIRED_SHELL,{required:true,limit:SHELL_FETCH_CONCURRENCY});
  await cachePathsWithLimit(cache,OPTIONAL_SHELL,{required:false,limit:OPTIONAL_FETCH_CONCURRENCY});
  return true;
}
async function broadcast(message){
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  clients.forEach(client=>client.postMessage(message));
}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    await prepareShell();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys
      .filter(key=>key.startsWith(CACHE_PREFIX)&&![SHELL_CACHE,RUNTIME_CACHE,AUDIO_CACHE_NAME].includes(key))
      .map(key=>caches.delete(key)));
    if(self.registration.navigationPreload)await self.registration.navigationPreload.enable().catch(()=>{});
    await self.clients.claim();
    await broadcast({type:'TEAM_BULLS_SW_ACTIVATED',version:APP_VERSION});
  })());
});

self.addEventListener('message',event=>{
  const type=event.data?.type;
  if(type==='SKIP_WAITING'){
    event.waitUntil(self.skipWaiting());
    return;
  }
  if(type==='GET_VERSION'){
    event.source?.postMessage?.({type:'TEAM_BULLS_VERSION',version:APP_VERSION});
    return;
  }
  if(type==='REFRESH_APP_SHELL'){
    event.waitUntil((async()=>{
      const ok=await prepareShell().then(()=>true).catch(()=>false);
      event.source?.postMessage?.({type:'TEAM_BULLS_REFRESHED',ok,version:APP_VERSION});
    })());
    return;
  }
  if(type==='CLEAR_APP_CACHES'){
    event.waitUntil((async()=>{
      const keys=await caches.keys();
      await Promise.all(keys.filter(key=>key.startsWith(CACHE_PREFIX)&&key!==AUDIO_CACHE_NAME).map(key=>caches.delete(key)));
      await prepareShell().catch(()=>false);
      event.source?.postMessage?.({type:'TEAM_BULLS_CACHES_CLEARED',version:APP_VERSION});
    })());
    return;
  }
  if(type!=='CACHE_AUDIO')return;
  const raw=String(event.data?.url||'');
  let url;
  try{url=new URL(raw,self.location.href);}catch(error){return;}
  const name=url.pathname.split('/').pop()||'';
  if(url.origin!==self.location.origin||!AUDIO_NAME_PATTERN.test(name))return;
  const asset=scopedUrl('./'+name);
  event.waitUntil((async()=>{
    const cache=await caches.open(AUDIO_CACHE_NAME);
    if(await cache.match(asset))return;
    try{
      const response=await fetch(asset,{cache:'no-cache'});
      if(response.ok)await cache.put(asset,response.clone());
    }catch(error){}
  })());
});

async function cacheHtml(response,cacheKey){
  if(!response?.ok)return response;
  const type=(response.headers.get('Content-Type')||'').toLowerCase();
  if(!type.includes('text/html'))return response;
  const cache=await caches.open(SHELL_CACHE);
  await cache.put(cacheKey,response.clone());
  return response;
}
async function refreshNavigation(request,event,fallback){
  try{
    const preload=await event.preloadResponse.catch(()=>null);
    const response=preload?.ok?preload:await fetchWithTimeout(request,NAVIGATION_REFRESH_TIMEOUT_MS,{cache:'no-store'});
    if(response?.ok)await cacheHtml(response,fallback);
  }catch(error){}
}
async function navigationCacheFirst(request,event){
  const url=new URL(request.url);
  const recovery=/\/recuperar\.html$/.test(url.pathname);
  const fallback=scopedUrl(recovery?'./recuperar.html':'./index.html');
  const cache=await caches.open(SHELL_CACHE);
  const cached=await cache.match(fallback);
  if(cached){
    event.waitUntil(refreshNavigation(request,event,fallback));
    return secureResponse(cached.clone(),{html:true});
  }
  try{
    const preload=await event.preloadResponse.catch(()=>null);
    const response=preload?.ok?preload:await fetchWithTimeout(request,NETWORK_TIMEOUT_MS,{cache:'no-store'});
    if(response?.ok)return secureResponse(await cacheHtml(response,fallback),{html:true});
  }catch(error){}
  return secureResponse(new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Team Bulls</title><body style="background:#0c0c0c;color:#eee;font-family:system-ui;padding:24px"><h1>Team Bulls</h1><p>Sem conexão e sem uma cópia offline disponível. Conecte-se e tente novamente.</p><button onclick="location.reload()">Tentar novamente</button></body>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8'}}),{html:true});
}
async function networkFirst(request,{cacheName=RUNTIME_CACHE,timeout=NETWORK_TIMEOUT_MS}={}){
  const cache=await caches.open(cacheName);
  try{
    const response=await fetchWithTimeout(request,timeout,{cache:'no-cache'});
    if(response?.ok)await cache.put(request,response.clone());
    return secureResponse(response);
  }catch(error){
    const cached=await cache.match(request,{ignoreSearch:false})||await (await caches.open(SHELL_CACHE)).match(request,{ignoreSearch:false});
    return cached?secureResponse(cached):new Response('',{status:504});
  }
}
async function cacheFirst(request,{cacheName=SHELL_CACHE}={}){
  const cache=await caches.open(cacheName);
  const cached=await cache.match(request,{ignoreSearch:false});
  if(cached)return secureResponse(cached);
  try{
    const response=await fetch(request);
    if(response?.ok)await cache.put(request,response.clone());
    return secureResponse(response);
  }catch(error){return new Response('',{status:504});}
}
async function audioResponse(request,url){
  const cache=await caches.open(AUDIO_CACHE_NAME);
  const cached=await cache.match(url.href);
  if(cached&&!request.headers.has('range'))return secureResponse(cached);
  try{
    const response=await fetchWithTimeout(request,AUDIO_NETWORK_TIMEOUT_MS);
    if(response?.ok&&!request.headers.has('range'))await cache.put(url.href,response.clone());
    return secureResponse(response);
  }catch(error){return cached?secureResponse(cached):new Response('',{status:504});}
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  const relativePath=pathWithinScope(url);
  const fileName=url.pathname.split('/').pop()||'';

  if(AUDIO_NAME_PATTERN.test(fileName)){
    event.respondWith(audioResponse(request,url));
    return;
  }
  if(request.mode==='navigate'){
    event.respondWith(navigationCacheFirst(request,event));
    return;
  }
  if(relativePath==='/version.json'){
    event.respondWith(networkFirst(request,{cacheName:SHELL_CACHE,timeout:MUTABLE_NETWORK_TIMEOUT_MS}));
    return;
  }
  /* URLs versionadas são imutáveis para aquela versão e devem sair do cache
     imediatamente. Antes, config/v107 passavam por network-first só por estarem
     em MUTABLE_PATHS, podendo acrescentar até vários segundos ao boot. */
  if(VERSIONED_PATH_PATTERN.test(fileName)||url.searchParams.has('v')){
    event.respondWith(cacheFirst(request,{cacheName:SHELL_CACHE}));
    return;
  }
  if(MUTABLE_PATHS.has(relativePath)){
    event.respondWith(networkFirst(request,{cacheName:SHELL_CACHE,timeout:MUTABLE_NETWORK_TIMEOUT_MS}));
    return;
  }
  event.respondWith(networkFirst(request,{cacheName:RUNTIME_CACHE}));
});