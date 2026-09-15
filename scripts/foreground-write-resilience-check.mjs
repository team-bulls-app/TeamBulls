import fs from 'node:fs';
import vm from 'node:vm';

const failures=[];
const assert=(ok,message)=>{if(!ok)failures.push(message);};
const has=(text,needle,message)=>assert(text.includes(needle),message);
const lacks=(text,needle,message)=>assert(!text.includes(needle),message);
const modulePath='modules/foreground-write-resilience-v10_10_50.js';
const loaderPath='modules/intelligence-suite-loader-v10_10_42.js';
const source=fs.readFileSync(modulePath,'utf8');
const loader=fs.readFileSync(loaderPath,'utf8');
new vm.Script(source,{filename:modulePath});

has(source,"const VERSION='10.10.50-foregroundwrite1'",'Runtime de foreground está na revisão errada.');
has(loader,'foreground-write-resilience-v10_10_50.js?v=10.10.50-foregroundwrite1','Loader cloud do aluno não entrega a proteção de foreground.');
has(source,"document.addEventListener('visibilitychange'",'Runtime não detecta retorno do background.');
has(source,"ref.get({source:'server'})",'Retomada não confirma conectividade real com o servidor.');
has(source,"if(typeof db.enableNetwork==='function')",'Retomada não reabilita explicitamente a rede Firestore quando necessário.');
has(source,"Promise.resolve().then(factory)",'Write ainda pode ser criado antes do gate de retomada.');
has(source,"if(error?.code==='team-bulls/write-pending-timeout')return{status:'pending'",'Timeout de write não preserva a operação original como pendente.');
has(source,"const existing=pendingWrites.get(id)",'Operação pendente não é deduplicada por chave lógica.');
lacks(source,'setInterval(','Proteção de foreground não pode usar polling.');
lacks(source,'MutationObserver','Proteção de foreground não deve observar a árvore do DOM.');
lacks(source,"alert('Erro ao atualizar",'Novo fluxo de refeição não pode usar alert bloqueante.');
has(source,"desiredDone?ref.set({studentUid:uid,mealId:mid,date}):ref.delete()",'Refeição não usa write determinístico depois do gate.');
has(source,"const actual=await reconcileMeal(ref,mid,uid,date)",'Resultado incerto da refeição não é reconciliado com o servidor.');
has(source,"if(pendingWrites.has(writeKey))",'Duplo toque durante write incerto não está protegido.');

/* Execução simulada: a factory não pode iniciar enquanto o probe de servidor está pendente. */
let resolveProbe;
const probePromise=new Promise(resolve=>{resolveProbe=resolve;});
let writeStarts=0;
const listeners={};
const doc={
  hidden:false,
  readyState:'complete',
  addEventListener(type,handler){listeners[type]=handler;}
};
const win={
  addEventListener(){},
  dispatchEvent(){},
  __TEAM_BULLS_FOREGROUND_WRITE_RESILIENCE_101050__:false
};
const userRef={get:()=>probePromise};
const context={
  window:win,document:doc,navigator:{onLine:true},console,
  CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail;}},
  setTimeout,clearTimeout,Promise,Map,Set,Date,Error,TypeError,
  MODE:'cloud',CURRENT_USER:{uid:'student-1',role:'student'},auth:{currentUser:{uid:'student-1'}},
  db:{enableNetwork:()=>Promise.resolve(),collection:name=>({doc:id=>name==='users'?userRef:{set:()=>Promise.resolve(),delete:()=>Promise.resolve(),get:()=>Promise.resolve({exists:false})}})},
  MEAL_CTX:{targetUid:'student-1',canToggleDone:true},MEAL_PLAN_CACHE:{meals:[]},MEAL_COMPLETIONS_TODAY:new Set(),
  beginAction:()=>true,endAction:()=>{},toggleMealDone:async()=>{},today:()=> '2026-09-15',renderMealsList:()=>{},showToast:()=>{}
};
win.window=win;
Object.assign(win,{TeamBullsForegroundWriteResilience:null});
vm.runInNewContext(source,context,{filename:modulePath});
const api=context.window.TeamBullsForegroundWriteResilience;
assert(api?.version==='10.10.50-foregroundwrite1','Runtime não expõe API versionada.');
const gated=api.write('simulated',()=>{writeStarts++;return Promise.resolve('ok');},{forceProbe:true,timeoutMs:500});
await Promise.resolve();await Promise.resolve();
assert(writeStarts===0,'Factory de write iniciou antes do probe de servidor terminar.');
resolveProbe({exists:true});
const committed=await gated;
assert(writeStarts===1&&committed?.status==='committed','Write não iniciou exatamente uma vez depois do probe.');

/* Timeout não deve criar retry automático. */
let resolveSlow;
const slowPromise=new Promise(resolve=>{resolveSlow=resolve;});
let slowStarts=0;
const pending=await api.write('slow',()=>{slowStarts++;return slowPromise;},{timeoutMs:260});
assert(pending?.status==='pending','Write lento deveria permanecer pendente após o timeout local.');
assert(slowStarts===1,'Write lento foi reenviado automaticamente.');
resolveSlow(true);await slowPromise;await Promise.resolve();
assert(slowStarts===1,'Conclusão tardia disparou write duplicado.');

if(failures.length){console.error('FALHA — retomada segura de foreground\n- '+failures.join('\n- '));process.exit(1);}
console.log('APROVADO — retorno do background aquece/valida Firestore; writes seguros iniciam somente após o gate, timeout não gera retry cego e refeição reconcilia operação incerta sem alert bloqueante.');
