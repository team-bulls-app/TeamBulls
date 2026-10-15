import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const core=fs.readFileSync('app_v10_10_9_core.js','utf8').replace(/\r\n/g,'\n');
const config=fs.readFileSync('config_v10_7.js','utf8').replace(/\r\n/g,'\n');
const viewport=fs.readFileSync('viewport_v10_10_9.js','utf8').replace(/\r\n/g,'\n');
const between=(text,start,end)=>text.slice(text.indexOf(start),text.indexOf(end,text.indexOf(start)));
const quiet={warn(){},error(){},log(){}};
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function clock(){
  let now=0,id=0;const jobs=new Map();
  const set=(fn,ms=0,interval=0)=>{jobs.set(++id,{fn,at:now+ms,interval});return id;};
  return {setTimeout:set,clearTimeout:key=>jobs.delete(key),setInterval:(fn,ms)=>set(fn,ms,ms),clearInterval:key=>jobs.delete(key),
    requestAnimationFrame:fn=>set(fn,16),get now(){return now;},get pending(){return jobs.size;},
    async until(predicate,max=3000){
      for(let i=0;i<max;i++){
        await flush();if(predicate())return;
        const next=[...jobs].sort((a,b)=>a[1].at-b[1].at)[0];
        if(!next)break;
        const [key,job]=next;jobs.delete(key);now=job.at;
        if(job.interval)jobs.set(key,{...job,at:now+job.interval});job.fn();
      }
      await flush();assert.ok(predicate(),'A inicialização não terminou dentro do limite de eventos.');
    }
  };
}
function events(){const map=new Map();return {addEventListener:(name,fn)=>{if(!map.has(name))map.set(name,[]);map.get(name).push(fn);},dispatchEvent:event=>{for(const fn of map.get(event.type)||[])fn(event);}};}
function runtime(role='student'){
  const time=clock(),loaded=[],scripts=[],links=[],observers=[];let screen=role==='trainer'?'screen-trainer':'screen-home';
  const body={classList:{contains:name=>name==='trainer-desktop'&&role==='trainer'}},window={...events(),TeamBulls107:{}};
  const document={...events(),visibilityState:'visible',body,documentElement:{dataset:{}},
    getElementById:()=>({}),querySelector:()=>({id:screen}),
    createElement:tag=>({tag,dataset:{},remove(){this.isConnected=false;}}),
    head:{querySelector:query=>links.find(link=>query.includes(link.href)),appendChild(node){
      if(node.tag==='link'){links.push(node);return;}
      scripts.push(node);node.isConnected=true;
      time.setTimeout(()=>{loaded.push(node.src);if(node.src.includes('student-home-layout-'))window.TeamBullsStudentHomeLayout={syncHotbar(){}};node.onload?.();},node.src.includes('student-home-profile-')?1100:5);
    }}
  };
  const context=vm.createContext({window,document,navigator:{onLine:true},console:quiet,localStorage:{getItem:()=>null},CURRENT_USER:{role},MODE:'cloud',...time,
    CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},MutationObserver:class{constructor(fn){observers.push(fn);}observe(){}}});
  vm.runInContext(config,context);
  return {time,loaded,scripts,window,context,change(nextRole){role=nextRole;context.CURRENT_USER={role};screen=role==='trainer'?'screen-trainer':'screen-home';for(const fn of observers)fn();}};
}

const failures=[];
async function test(name,run){try{await run();console.log('APROVADO — '+name);}catch(error){failures.push(name);console.error('FALHA — '+name+': '+error.message);}}

await test('Home conclui carga sem navegação; retomadas não duplicam scripts nem criam loop',async()=>{
  const r=runtime();await r.time.until(()=>r.loaded.length>=4);
  for(let i=0;i<20;i++)r.window.dispatchEvent({type:'pageshow'});
  await r.time.until(()=>r.window.TeamBullsRuntimeLoader.state().complete,600);
  assert.ok(r.loaded.some(src=>src.includes('usability-checkup-')),'Suíte pós-sessão deve carregar mesmo permanecendo na Home.');
  assert.equal(r.loaded.filter(src=>src.includes('student-home-profile-')).length,1);
  assert.equal(new Set(r.loaded).size,r.loaded.length,'Eventos simultâneos não podem executar módulos duas vezes.');
  assert.ok(!r.loaded.some(src=>src.includes('trainer-workspace-')));
  assert.ok(r.loaded[0].includes('stability_')&&r.loaded[1].includes('security-hardening'));
  const count=r.loaded.length;
  for(let i=0;i<20;i++)r.window.dispatchEvent({type:'pageshow'});
  await r.time.until(()=>r.time.pending===0,100);assert.equal(r.loaded.length,count);
  r.change('trainer');await r.time.until(()=>r.window.TeamBullsRuntimeLoader.state().complete);
  assert.ok(r.loaded.some(src=>src.includes('trainer-workspace-')));
});

await test('Autorreparo não anuncia conclusão antes de carregar os recursos da sessão',async()=>{
  const r=runtime();await r.time.until(()=>r.loaded.length>=4);
  await r.window.TeamBullsRuntimeLoader.retry();
  assert.equal(r.window.TeamBullsRuntimeLoader.state().complete,false);
  await r.time.until(()=>r.window.TeamBullsRuntimeLoader.state().complete,600);
});

await test('Treinador carrega módulos sem esperar recursos exclusivos do aluno',async()=>{
  const r=runtime('trainer');await r.time.until(()=>r.window.TeamBullsRuntimeLoader.state().complete);
  assert.ok(r.loaded.some(src=>src.includes('trainer-workspace-')));
  assert.ok(!r.loaded.some(src=>src.includes('student-home-profile-')));
});

await test('Cold start permite duas etapas de SDK sem anunciar falha antecipada',async()=>{
  const time=clock(),scripts=[],window={...events()},document={...events(),getElementById:()=>null,scripts,visibilityState:'visible',
    createElement:()=>{const node={...events(),dataset:{},isConnected:true,remove(){this.isConnected=false;}};return node;},
    head:{appendChild(node){scripts.push(node);time.setTimeout(()=>{
      if(node.src.includes('firebase-app-compat'))context.firebase={initializeApp(){},apps:[]};
      if(node.src.includes('firebase-auth-compat'))context.firebase.auth=()=>({});
      if(node.src.includes('firebase-firestore-compat'))context.firebase.firestore=()=>({});
      node.dispatchEvent({type:'load'});
    },8000);}}};
  const context=vm.createContext({window,document,navigator:{onLine:true},console:quiet,queueMicrotask,...time,localStorage:{getItem:()=>null},
    cloudGet(){},initFirebase(){vm.runInContext('auth={};db={};',context);return true;}});
  vm.runInContext("let auth=null,db=null;const SDK_LOAD_PROMISES=new Map();"+between(core,'function withTimeout(', '\nfunction cloudGet(')+between(core,'async function ensureFirebaseCore(', '\nasync function ensureFirebaseReady(')+between(core,'const V106_SDK_TIMEOUT_MS=', '\n/* Cache de cálculos'),context);
  vm.runInContext(config.slice(0,config.indexOf('\n(()=>{\n  let requested=')),context);
  let result;
  vm.runInContext('ensureFirebaseReady()',context).then(value=>{result=value;});
  await time.until(()=>result!==undefined);
  assert.equal(result,true,'SDK app + auth/firestore que concluem em 16 s são válidos dentro dos limites individuais de 9 s.');
  assert.equal(time.now,16000);assert.equal(scripts.length,3,'Warmup deve compartilhar os downloads.');
});

await test('Falha inesperada ao preparar conexão libera o botão para tentar novamente',async()=>{
  const button={disabled:false,textContent:'ACESSAR SISTEMA'},errors=[];
  const context=vm.createContext({document:{getElementById:id=>id==='btn-login'?button:{value:id==='login-email'?'aluno@example.test':'senha'}},
    navigator:{onLine:true},auth:null,clearAuthError(){},showAuthError:(_,message)=>errors.push(message),
    ensureFirebaseReady:async()=>{throw new Error('bootstrap indisponível');},isNetworkLikeError:()=>false});
  vm.runInContext(between(core,'async function doLogin(', '\nasync function sendPasswordReset('),context);
  await vm.runInContext('doLogin()',context).catch(()=>{});
  assert.equal(button.disabled,false);assert.equal(button.textContent,'ACESSAR SISTEMA');assert.equal(errors.length,1);
});

await test('Leitura lenta de perfil retenta uma vez; indisponibilidade continua limitada',async()=>{
  for(const recover of [true,false]){
    const time=clock();let reads=0,result;
    const context=vm.createContext({...time,navigator:{onLine:true},PROFILE_READ_TIMEOUT_MS:2500,
      isNetworkLikeError:error=>error.code==='team-bulls/timeout',
      db:{collection:()=>({doc:()=>({get:()=>{reads++;return new Promise(resolve=>{if(recover&&reads===2)time.setTimeout(()=>resolve({exists:true}),100);});}})})}});
    vm.runInContext(between(core,'function withTimeout(', '\nfunction cloudGet(')+between(core,'async function getUserProfileWithRetry(', '\nlet AUTH_CALLBACK_SEEN='),context);
    vm.runInContext("getUserProfileWithRetry('trainer-a')",context).then(value=>{result=value;},error=>{result=error;});
    await time.until(()=>result!==undefined);
    assert.equal(reads,2,'A primeira demora transitória não deve cancelar a segunda tentativa.');
    if(recover){assert.equal(result.exists,true);assert.equal(time.now,2850);}
    else{assert.equal(result.code,'team-bulls/timeout');assert.equal(time.now,5250);}
  }
});

await test('Senha incorreta preserva validação e libera nova tentativa sem acesso offline',async()=>{
  const button={disabled:false},errors=[];let offline=0;
  const context=vm.createContext({document:{getElementById:id=>id==='btn-login'?button:{value:'valor'}},navigator:{onLine:true},
    auth:{signInWithEmailAndPassword:async()=>{throw Object.assign(new Error('senha'),{code:'auth/invalid-credential'});}},
    clearAuthError(){},showAuthError:(_,message)=>errors.push(message),startAuthListener(){},startBootWatchdog(){},setLoadingMessage(){},
    withTimeout:task=>task,isNetworkLikeError:()=>false,offlineRegisteredLogin:()=>offline++});
  vm.runInContext(between(core,'async function doLogin(', '\nasync function sendPasswordReset('),context);
  await vm.runInContext('doLogin()',context);
  assert.equal(button.disabled,false);assert.equal(offline,0);assert.deepEqual(errors,['E-mail ou senha incorretos.']);
});

await test('Falha de perfil libera tela de acesso mesmo com usuário Firebase restaurado',async()=>{
  let screen='screen-loading';const state={pending:true,phase:'validating-online-profile'};
  const context=vm.createContext({state,PAGE_STARTED_AT:Date.now(),readyAccess:()=>false,processingUid:()=> 'trainer-a',
    firebaseUser:()=>({uid:'trainer-a'}),activeScreen:()=>screen,authCallbackSeen:()=>true,knownReturningSession:()=>true,
    prepareAuthFields(){},window:{TeamBullsRecovery:{reveal(){}}},committedAccess:()=>false,
    showScreen:id=>{screen=id;return true;}});
  vm.runInContext(between(viewport,'function setPending(', '\n  function profileEmail('),context);
  vm.runInContext("function bootToAuth(){showScreen('screen-auth');}",context);
  vm.runInContext(between(viewport,'    if(!showScreen.__tbSessionStable)', '    if(!doLogin.__tbSessionStable)')+between(viewport,"    if(typeof bootToAuth==='function'", "    if(typeof authTab==='function'"),context);
  vm.runInContext("showScreen('screen-auth')",context);assert.equal(screen,'screen-loading','Durante validação, a proteção visual continua ativa.');
  vm.runInContext('bootToAuth()',context);assert.equal(screen,'screen-auth','Uma falha concluída precisa permitir nova tentativa, sem exigir fechar o app.');
});

function authFixture(){
  const pending=new Map(),screens=[],calls={subscribe:0,unsubscribe:0,profiles:0,trainer:0};
  let callback,onError;
  const auth={currentUser:null,onAuthStateChanged(next,error){calls.subscribe++;callback=next;onError=error;return()=>calls.unsubscribe++;}};
  const context=vm.createContext({auth,console:quiet,queueMicrotask,AUTH_UNSUBSCRIBE:null,AUTH_HANDLED:false,AUTH_EXPECTED_LOCAL_SIGNOUT:false,
    CURRENT_USER:null,ACCESS_MODE:'cloud-active',document:{body:{classList:{add(){},remove(){}}}},stopProfileGuard(){},startProfileGuard(){},
    setLoadingMessage(){},restoreCachedStudentAccess:()=>false,getUserProfileWithRetry:uid=>{calls.profiles++;return new Promise((resolve,reject)=>pending.set(uid,{resolve,reject}));},
    cacheUserProfile(){},updateOfflineCredentialProfile(){},configureAuthPersistence(){},showScreen:screen=>screens.push(screen),renderTrainer:()=>calls.trainer++,bootToAuth:()=>screens.push('error'),isNetworkLikeError:()=>false});
  vm.runInContext(between(core,'let AUTH_CALLBACK_SEEN=', '\n/* ══════════════════════════════════════════════════\n   SCREENS'),context);
  return {context,auth,pending,screens,calls,emit(user){auth.currentUser=user;return callback(user);},error(error){onError(error);},start(){return vm.runInContext('startAuthListener()',context);}};
}
await test('Retomar app reutiliza listener; falha real permite nova assinatura',async()=>{
  const f=authFixture();f.auth.currentUser={uid:'trainer-a'};f.start();await flush();
  for(let i=0;i<20;i++)f.start();await flush();
  assert.equal(f.calls.subscribe,1);assert.equal(f.calls.profiles,1);
  f.pending.get('trainer-a').resolve({data:()=>({role:'trainer',status:'active'})});await flush();
  for(let i=0;i<20;i++)f.start();await flush();
  assert.equal(f.calls.trainer,1);assert.equal(f.calls.subscribe,1);
  f.error(new Error('listener encerrado'));f.start();await flush();assert.equal(f.calls.subscribe,2);
});
await test('Perfil atrasado não reabre conta anterior após saída ou troca de usuário',async()=>{
  const f=authFixture();f.start();const old=f.emit({uid:'trainer-a'});await flush();
  await f.emit(null);const current=f.emit({uid:'trainer-b'});await flush();
  f.pending.get('trainer-a').resolve({data:()=>({role:'trainer'})});await old;
  assert.equal(f.context.CURRENT_USER,null);assert.equal(f.calls.trainer,0);
  f.pending.get('trainer-b').resolve({data:()=>({role:'trainer'})});await current;await flush();
  assert.equal(f.context.CURRENT_USER.uid,'trainer-b');assert.equal(f.calls.trainer,1);
});
if(failures.length)process.exitCode=1;
