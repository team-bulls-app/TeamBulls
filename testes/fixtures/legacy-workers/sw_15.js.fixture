/* Team Bulls v9.8.1 — recuperação do histórico de séries, ordem de protocolos/exercícios, treino ativo e áudio sob demanda. */
'use strict';
const CACHE_NAME='team-bulls-v9-8-2-auth-bg';
const AUDIO_CACHE_NAME='team-bulls-v9-5-security-audio'; // preserva os MP3 já baixados pela v9.5
const AUDIO_NAME_PATTERN=/^team-bulls-music-[a-z0-9-]+\.mp3$/i;
const ESSENTIAL_ASSETS=['./index.html','./recuperar.html','./manifest_13.json','./icon-192-v9-8.png','./icon-512-v9-8.png','./icon-maskable-192-v9-8.png','./icon-maskable-512-v9-8.png','./apple-touch-icon-v9-8.png'];
const OPTIONAL_ASSETS=['./team-bulls-auth-bg-v9-8-2.webp'];
const FIRST_NAVIGATION_TIMEOUT_MS=3000;
const RECOVERY_NAVIGATION_TIMEOUT_MS=1800;
const AUDIO_NETWORK_TIMEOUT_MS=1800;
const CSP="default-src 'self'; script-src 'self' 'unsafe-inline' https://www.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com; frame-src https://www.youtube.com https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests";

function assetUrl(path){return new URL(path,self.registration.scope).href;}
function getAudioAsset(input){
  try{
    const url=new URL(input,self.location.href);
    if(url.origin!==self.location.origin)return'';
    const name=url.pathname.split('/').pop()||'';
    return AUDIO_NAME_PATTERN.test(name)?assetUrl('./'+name):'';
  }catch(error){return'';}
}
function withSecurityHeaders(response,{html=false}={}){
  if(!response)return response;
  const headers=new Headers(response.headers);
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('Referrer-Policy','strict-origin-when-cross-origin');
  headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  if(html){
    headers.set('Content-Security-Policy',CSP);
    headers.set('X-Frame-Options','DENY');
    headers.set('Cross-Origin-Opener-Policy','same-origin');
    headers.set('Cache-Control','no-cache');
  }
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
async function fetchWithTimeout(request,timeoutMs,options={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(request,{...options,signal:controller.signal});}
  finally{clearTimeout(timer);}
}
async function cacheAsset(cache,path,required=false){
  try{
    const url=assetUrl(path);
    const response=await fetch(url,{cache:'reload'});
    if(!response.ok)throw new Error('HTTP '+response.status+' em '+path);
    await cache.put(url,response.clone());
    return true;
  }catch(error){
    console.warn('Falha ao preparar recurso',path,error);
    if(required)throw error;
    return false;
  }
}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE_NAME);
    await cacheAsset(cache,'./index.html',true);
    await Promise.allSettled(ESSENTIAL_ASSETS.filter(path=>path!=='./index.html').map(path=>cacheAsset(cache,path,false)));
    await Promise.allSettled(OPTIONAL_ASSETS.map(path=>cacheAsset(cache,path,false)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith('team-bulls-')&&![CACHE_NAME,AUDIO_CACHE_NAME].includes(key)).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message',event=>{
  const type=event.data?.type;
  if(type==='SKIP_WAITING'){event.waitUntil(self.skipWaiting());return;}
  if(type==='CLEAR_CACHES'){
    event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith('team-bulls-')).map(key=>caches.delete(key)));})());
    return;
  }
  if(type!=='CACHE_AUDIO')return;
  const asset=getAudioAsset(event.data?.url||'');
  if(!asset)return;
  event.waitUntil((async()=>{
    const cache=await caches.open(AUDIO_CACHE_NAME);
    if(await cache.match(asset))return;
    try{
      const response=await fetch(asset,{cache:'no-cache'});
      if(response.ok&&response.status===200)await cache.put(asset,response.clone());
    }catch(error){}
  })());
});

async function rangeFromCachedAudio(request,asset){
  const range=request.headers.get('range');
  if(!range)return null;
  const cached=await (await caches.open(AUDIO_CACHE_NAME)).match(asset);
  if(!cached)return null;
  const match=/bytes=(\d+)-(\d*)/.exec(range);
  if(!match)return cached;
  const buffer=await cached.arrayBuffer();
  const size=buffer.byteLength;
  if(!size)return new Response('',{status:504});
  const start=Math.min(Number(match[1])||0,Math.max(0,size-1));
  const requestedEnd=match[2]?Number(match[2]):size-1;
  const end=Math.min(Number.isFinite(requestedEnd)?requestedEnd:size-1,size-1);
  if(start>end)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
  const chunk=buffer.slice(start,end+1);
  return new Response(chunk,{status:206,headers:{
    'Content-Type':cached.headers.get('Content-Type')||'audio/mpeg',
    'Content-Length':String(chunk.byteLength),
    'Content-Range':`bytes ${start}-${end}/${size}`,
    'Accept-Ranges':'bytes',
    'Cache-Control':'public, max-age=31536000, immutable',
    'X-Content-Type-Options':'nosniff'
  }});
}

async function updateNavigationCache(request,fallbackUrl,timeoutMs){
  const response=await fetchWithTimeout(request,timeoutMs,{cache:'no-store'});
  const type=(response.headers.get('Content-Type')||'').toLowerCase();
  if(response.ok&&type.includes('text/html')){
    const cache=await caches.open(CACHE_NAME);
    await cache.put(fallbackUrl,response.clone());
  }
  return response;
}

async function navigationResponse(request,event){
  const cache=await caches.open(CACHE_NAME);
  const requestedUrl=new URL(request.url);
  const isRecovery=/\/recuperar\.html$/.test(requestedUrl.pathname);
  const fallbackUrl=assetUrl(isRecovery?'./recuperar.html':'./index.html');

  // A página de recuperação prioriza a rede para garantir que a ferramenta usada
  // para remover um cache quebrado não venha desse mesmo cache.
  if(isRecovery){
    try{return withSecurityHeaders(await updateNavigationCache(request,fallbackUrl,RECOVERY_NAVIGATION_TIMEOUT_MS),{html:true});}
    catch(error){
      const cached=await cache.match(fallbackUrl);
      if(cached)return withSecurityHeaders(cached,{html:true});
    }
  }else{
    const cached=await cache.match(fallbackUrl);
    const networkUpdate=updateNavigationCache(request,fallbackUrl,FIRST_NAVIGATION_TIMEOUT_MS).catch(()=>null);
    if(cached){
      event.waitUntil(networkUpdate.then(()=>undefined));
      return withSecurityHeaders(cached,{html:true});
    }
    const network=await networkUpdate;
    if(network)return withSecurityHeaders(network,{html:true});
  }

  return withSecurityHeaders(new Response('<!doctype html><meta charset="utf-8"><title>Team Bulls</title><body style="background:#0c0c0c;color:#eee;font-family:system-ui;padding:24px"><h1>Team Bulls</h1><p>O aplicativo está indisponível e ainda não existe uma cópia offline neste aparelho.</p><button onclick="location.reload()">Tentar novamente</button></body>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8'}}),{html:true});
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;

  const audioAsset=getAudioAsset(url.href);
  if(audioAsset){
    event.respondWith((async()=>{
      if(request.headers.has('range')){
        try{return withSecurityHeaders(await fetchWithTimeout(request,AUDIO_NETWORK_TIMEOUT_MS));}
        catch(error){return (await rangeFromCachedAudio(request,audioAsset))||new Response('',{status:504});}
      }
      const cache=await caches.open(AUDIO_CACHE_NAME);
      const cached=await cache.match(audioAsset);
      if(cached)return withSecurityHeaders(cached);
      try{
        const response=await fetch(request);
        if(response.ok&&response.status===200)await cache.put(audioAsset,response.clone());
        return withSecurityHeaders(response);
      }catch(error){return new Response('',{status:504});}
    })());
    return;
  }

  if(request.mode==='navigate'){
    event.respondWith(navigationResponse(request,event));
    return;
  }

  event.respondWith((async()=>{
    const cache=await caches.open(CACHE_NAME);
    const cached=await cache.match(request);
    const network=fetch(request).then(async response=>{
      if(response.ok&&response.status===200&&url.origin===self.location.origin)await cache.put(request,response.clone());
      return withSecurityHeaders(response);
    }).catch(()=>null);
    if(cached){event.waitUntil(network.then(()=>undefined));return withSecurityHeaders(cached);}
    return (await network)||new Response('',{status:504});
  })());
});
