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

has(source,"const VERSION='10.10.50-foregroundwrite2'",'Runtime de foreground está na revisão errada.');
has(loader,'foreground-write-resilience-v10_10_50.js?v=10.10.50-foregroundwrite2','Loader cloud do aluno não entrega a proteção de foreground.');
has(source,"document.addEventListener('visibilitychange'",'Runtime não detecta retorno do background.');
has(source,"ref.get({source:'server'})",'Reconciliação de refeição não confirma o estado final com o servidor.');
lacks(source,'db.enableNetwork(','Retomada não deve forçar uma transição de rede contra listeners ativos.');
lacks(source,"const ref=db.collection('users').doc(uid)",'Retomada não deve abrir uma leitura descartável só para sondar a conexão.');
has(source,"window.addEventListener('online'",'Runtime precisa registrar a retomada do navegador sem sondagem Firestore.');
has(source,"Promise.resolve().then(factory)",'Write ainda pode ser criado antes do gate de retomada.');
has(source,"if(error?.code==='team-bulls/write-pending-timeout')return{status:'pending'",'Timeout de write não preserva a operação original como pendente.');
has(source,"const existing=pendingWrites.get(id)",'Operação pendente não é deduplicada por chave lógica.');
lacks(source,'setInterval(','Proteção de foreground não pode usar polling.');
lacks(source,'MutationObserver','Proteção de foreground não deve observar a árvore do DOM.');
lacks(source,"alert('Erro ao atualizar",'Novo fluxo de refeição não pode usar alert bloqueante.');
has(source,"desiredDone?ref.set({studentUid:uid,mealId:mid,date}):ref.delete()",'Refeição não usa write determinístico depois do gate.');
has(source,"const actual=await reconcileMeal(ref,mid,uid,date)",'Resultado incerto da refeição não é reconciliado com o servidor.');
has(source,"if(pendingWrites.has(writeKey))",'Duplo toque durante write incerto não está protegido.');

/* Execução simulada: após retorno online, a factory aguarda a transição local,
   sem enableNetwork() nem leitura de sondagem no Firestore. */
let writeStarts=0;
const listeners={},dbCalls={enableNetwork:0,userReads:0};
const doc={
  hidden:false,
  readyState:'complete',
  addEventListener(type,handler){listeners[type]=handler;}
};
const win={
  addEventListener(type,handler){listeners['window:'+type]=handler;},
  dispatchEvent(){},
  __TEAM_BULLS_FOREGROUND_WRITE_RESILIENCE_1010502__:false
};
const userRef={get:()=>{dbCalls.userReads++;return Promise.resolve({exists:true});}};
const context={
  window:win,document:doc,navigator:{onLine:true},console,
  CustomEvent:class{constructor(type,init){this.type=type;this.detail=init?.detail;}},
  setTimeout,clearTimeout,Promise,Map,Set,Date,Error,TypeError,
  MODE:'cloud',CURRENT_USER:{uid:'student-1',role:'student'},auth:{currentUser:{uid:'student-1'}},
  db:{enableNetwork:()=>{dbCalls.enableNetwork++;return Promise.resolve();},collection:name=>({doc:id=>name==='users'?userRef:{set:()=>Promise.resolve(),delete:()=>Promise.resolve(),get:()=>Promise.resolve({exists:false})}})},
  MEAL_CTX:{targetUid:'student-1',canToggleDone:true},MEAL_PLAN_CACHE:{meals:[]},MEAL_COMPLETIONS_TODAY:new Set(),
  beginAction:()=>true,endAction:()=>{},toggleMealDone:async()=>{},today:()=> '2026-09-15',renderMealsList:()=>{},showToast:()=>{}
};
win.window=win;
Object.assign(win,{TeamBullsForegroundWriteResilience:null});
vm.runInNewContext(source,context,{filename:modulePath});
const api=context.window.TeamBullsForegroundWriteResilience;
assert(api?.version==='10.10.50-foregroundwrite2','Runtime não expõe API versionada.');
listeners['window:online']();
const gated=api.write('simulated',()=>{writeStarts++;return Promise.resolve('ok');},{forceProbe:true,timeoutMs:500});
await Promise.resolve();await Promise.resolve();
assert(writeStarts===0,'Factory de write iniciou antes da transição foreground terminar.');
const committed=await gated;
assert(writeStarts===1&&committed?.status==='committed','Write não iniciou exatamente uma vez depois do gate.');
assert(dbCalls.enableNetwork===0&&dbCalls.userReads===0,'Retomada abriu operações Firestore redundantes antes da gravação real.');

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
console.log('APROVADO — retorno do background aguarda a transição do app sem alternar a rede nem sondar o Firestore; writes iniciam uma vez, timeout não gera retry cego e refeição reconcilia operação incerta com o servidor.');
