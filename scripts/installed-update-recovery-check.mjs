import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=name=>fs.readFileSync(name,'utf8');
const release=JSON.parse(read('version.json'));
const updater=read('update_v10_10_9.js');
const quiet={log(){},warn(){},error(){}};
const events=()=>({listeners:new Map(),addEventListener(type,fn){this.listeners.set(type,fn);},removeEventListener(type){this.listeners.delete(type);}});
function harness({htmlBuild=release.build,search='',stored=null,fetcher=async()=>new Response(JSON.stringify(release))}={}){
  const local=new Map(),session=new Map(stored?[['team-bulls-update-reload-version',stored]]:[]);
  const storage=map=>({getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)});
  const nodes=new Map();
  const node=()=>({dataset:{},hidden:true,isConnected:true,setAttribute(){},addEventListener(){},querySelector(id){if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);}});
  const document={...events(),readyState:'loading',visibilityState:'visible',body:{appendChild(){},classList:{contains:()=>false}},querySelector:selector=>selector.includes('team-bulls-build')?{content:String(htmlBuild)}:null};
  let registrations=0,updates=0;
  const reg={update:async()=>{updates++;}};
  const navigator={onLine:true,serviceWorker:{...events(),register:async()=>{registrations++;return reg;}}};
  const window={...events()};
  document.createElement=node;
  const context=vm.createContext({window,document,navigator,console:quiet,URL,URLSearchParams,AbortController,Response,
    fetch:fetcher,location:{href:'https://example.test/TeamBulls/index.html'+search,search,pathname:'/TeamBulls/index.html',hash:''},history:{replaceState(){}},
    localStorage:storage(local),sessionStorage:storage(session),setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,25)),clearTimeout,setInterval(){}});
  const ending=updater.lastIndexOf('})();');
  vm.runInContext(updater.slice(0,ending)+'window.inspectUpdate={announceCompletedUpdate,fetchLatestVersion,checkForUpdates};'+updater.slice(ending),context);
  return {window,local,session,nodes,navigator,get registrations(){return registrations;},get updates(){return updates;}};
}
const cases=[];
async function test(name,run){try{await run();console.log('PASS '+name);}catch(error){cases.push(name);console.error('FAIL '+name+': '+error.message);}}

await test('a future applied marker cannot hide a newer release',async()=>{
  const future={...release,build:release.build+1};
  const h=harness({fetcher:async()=>new Response(JSON.stringify(future))});
  h.local.set('team-bulls-applied-release',`${release.version}@${future.build}`);
  await h.window.TeamBullsUpdater.manualCheck();
  assert.equal(h.nodes.get('#team-bulls-update-title').textContent,'CORREÇÃO DO APP DISPONÍVEL');
});
await test('a requested build is not proof that the new runtime loaded',()=>{
  const future=release.build+1,key=`${release.version}@${future}`;
  const h=harness({search:`?updated=${release.version}&build=${future}`,stored:key});
  h.window.inspectUpdate.announceCompletedUpdate();
  assert.equal(h.local.has('team-bulls-applied-release'),false);
});
await test('current updater on old HTML still offers recovery',async()=>{
  const h=harness({htmlBuild:release.build-1});
  await h.window.TeamBullsUpdater.manualCheck();
  assert.notEqual(h.nodes.get('#team-bulls-update-title').textContent,'APLICATIVO ATUALIZADO');
});
await test('matching HTML and runtime confirm the completed update',()=>{
  const key=`${release.version}@${release.build}`;
  const h=harness({search:`?updated=${release.version}&build=${release.build}`,stored:key});
  h.window.inspectUpdate.announceCompletedUpdate();
  assert.equal(h.local.get('team-bulls-applied-release'),key);
});
await test('manifest failure does not prevent registration or the next attempt',async()=>{
  let calls=0;const h=harness({fetcher:async()=>{if(++calls===1)throw new Error('network');return new Response(JSON.stringify(release));}});
  await h.window.TeamBullsUpdater.manualCheck();
  assert.ok(h.registrations>0);
  await h.window.TeamBullsUpdater.manualCheck();
  assert.equal(calls,2);
});
await test('offline check releases the lock and gives visible feedback',async()=>{
  const h=harness();h.navigator.onLine=false;await h.window.TeamBullsUpdater.manualCheck();
  assert.ok(h.nodes.get('#team-bulls-update-text')?.textContent.includes('internet'));
  h.navigator.onLine=true;assert.ok(await h.window.TeamBullsUpdater.manualCheck());
});
await test('a stalled manifest request expires and can be retried',async()=>{
  let calls=0;const h=harness({fetcher:(_url,options)=>++calls>1?Promise.resolve(new Response(JSON.stringify(release))):new Promise((_,reject)=>options.signal?.addEventListener('abort',()=>reject(new Error('aborted'))))});
  const result=await Promise.race([h.window.TeamBullsUpdater.manualCheck().then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),150))]);
  assert.equal(result,true,'Manifest check must have a deadline.');
  assert.ok(await h.window.TeamBullsUpdater.manualCheck());
});

const worker=read('sw.js');
function workerHarness({quota=false,offline=false}={}){
  const writes=[],stored=new Map(),listeners=new Map();let requests=0;
  const cache={match:async key=>stored.get(String(key))?.clone(),put:async(key,response)=>{if(quota)throw new Error('QuotaExceededError');stored.set(String(key),response);writes.push(key);}};
  const self={registration:{scope:'https://example.test/TeamBulls/'},location:{origin:'https://example.test'},addEventListener:(type,fn)=>listeners.set(type,fn)};
  const context=vm.createContext({self,console:quiet,URL,Request,Response,Headers,AbortController,setTimeout,clearTimeout,caches:{open:async()=>cache},fetch:async()=>{requests++;if(offline)throw new Error('offline');return new Response('NEW HTML',{headers:{'Content-Type':'text/html'}});}});
  vm.runInContext(worker,context);
  return {context,stored,writes,get requests(){return requests;}};
}
await test('navigation without preload support fetches current HTML',async()=>{
  const h=workerHarness();h.stored.set('https://example.test/TeamBulls/index.html',new Response('OLD HTML'));
  const response=await vm.runInContext("navigationNetworkFirst(new Request('https://example.test/TeamBulls/index.html'),{})",h.context);
  assert.equal(await response.text(),'NEW HTML');assert.equal(h.requests,1);
});
await test('full cache cannot replace fresh HTML with an old page',async()=>{
  const h=workerHarness({quota:true});h.stored.set('https://example.test/TeamBulls/index.html',new Response('OLD HTML'));
  const response=await vm.runInContext("navigationNetworkFirst(new Request('https://example.test/TeamBulls/index.html'),{preloadResponse:Promise.resolve()})",h.context);
  assert.equal(await response.text(),'NEW HTML');
});
await test('offline navigation retains the existing app copy',async()=>{
  const h=workerHarness({offline:true});h.stored.set('https://example.test/TeamBulls/index.html',new Response('SAVED HTML'));
  const response=await vm.runInContext("navigationNetworkFirst(new Request('https://example.test/TeamBulls/index.html'),{})",h.context);
  assert.equal(await response.text(),'SAVED HTML');
});
assert.equal(read('sw_47.js'),worker,'Legacy worker must deliver the same recovery.');
if(cases.length)process.exitCode=1;
