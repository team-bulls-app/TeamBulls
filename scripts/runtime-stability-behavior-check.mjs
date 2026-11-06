import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const read=file=>fs.readFileSync('modules/'+file,'utf8');
const quiet={warn(){},log(){},error(){}};
// Concurrent writes during resume must share one in-flight operation, scoped to
// the authenticated owner, and uncertain writes must remain pending.
{
 const c={window:{dispatchEvent(){}},document:{hidden:false,readyState:'loading',addEventListener(){}},navigator:{onLine:true},console:quiet,CustomEvent:class{},setTimeout,clearTimeout,
  MODE:'cloud',CURRENT_USER:{uid:'a'},auth:{currentUser:{uid:'a'}},db:{}};
 vm.createContext(c);vm.runInContext(read('foreground-write-resilience-v10_10_50.js'),c);
 const api=c.window.TeamBullsForegroundWriteResilience;let starts=0,resolve;
 const factory=()=>{starts++;return new Promise(r=>resolve=r);};
 const first=api.write('same',factory,{forceProbe:true,timeoutMs:250}),second=api.write('same',factory,{forceProbe:true});
 const duplicate=await second;assert.equal(duplicate.status,'pending');assert.equal(duplicate.existing,true);
 const pending=await first;assert.equal(starts,1,'One write factory during resume');assert.equal(pending.status,'pending');assert(api.isPending('same'));
 resolve('done');await pending.promise;await Promise.resolve();assert(!api.isPending('same'));
 let called=false;const changed=api.write('changed',()=>{called=true;},{forceProbe:true});c.auth.currentUser={uid:'b'};c.CURRENT_USER={uid:'b'};
 await assert.rejects(changed,/sessão mudou/);assert(!called,'Account change must stop unsent factory');
 const successful=await api.write('same',()=>42);assert.equal(successful.value,42);
 assert.equal(api.state().pendingWrites,0);
}
// Firestore terminates a failed listener. Release its handle; retry transient
// errors with bounded backoff and ignore callbacks from older subscriptions.
{
 let now=10000,reads=0,unsubscribed=0;const subscriptions=[],timers=new Map();let timerId=0;
 const c={window:{addEventListener(){}},document:{readyState:'loading',hidden:false,addEventListener(){},querySelector:()=>null},navigator:{onLine:true},console:quiet,MODE:'cloud',DIET_DOCUMENT:{plans:[]},CURRENT_USER:{uid:'a',role:'student'},
  Date:class extends Date{static now(){return now;}},setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimeout:id=>timers.delete(id),
  db:{collection:()=>({doc:id=>({onSnapshot:(next,error)=>{reads++;const sub={id,next,error};subscriptions.push(sub);return()=>{unsubscribed++;};}})})}};
 vm.createContext(c);vm.runInContext(read('student-diet-compact-live-v10_10_23.js'),c);const api=c.window.TeamBullsStudentDietCompact;
 assert(api.sync());assert.equal(reads,1);api.sync();assert.equal(reads,1);
 subscriptions[0].error({code:'unavailable'});assert.equal(unsubscribed,1);api.sync();assert.equal(reads,1,'No retry storm before cooldown');
 assert.equal(timers.size,1);const retry=[...timers.values()][0];assert.equal(retry.ms,5000);now+=5000;timers.clear();retry.fn();assert.equal(reads,2,'Automatic reconnection after terminal stream error');
 subscriptions[0].error({code:'unavailable'});assert.equal(unsubscribed,1,'Stale error cannot stop a replacement listener');
 subscriptions[1].error({code:'permission-denied'});assert.equal(timers.size,0,'No automatic retries for denied access');
 c.CURRENT_USER={uid:'b',role:'student'};assert(api.sync());assert.equal(reads,3,'Another owner must not inherit cooldown');
 subscriptions[2].next({exists:true,metadata:{fromCache:false},data:()=>({plans:[{id:'latest'}]})});assert.equal(c.DIET_DOCUMENT.plans[0].id,'latest','Recovered listener must still apply server changes');
 for(let attempt=0;attempt<4;attempt++){
   subscriptions.at(-1).error({code:'unavailable'});
   if(attempt<3){assert.equal(timers.size,1);const retry=[...timers.values()][0];assert.equal(retry.ms,5000*2**attempt);now+=retry.ms;timers.clear();retry.fn();}
   else assert.equal(timers.size,0,'Automatic recovery must stop after three retries');
 }
 c.CURRENT_USER=null;api.sync();assert.equal(reads,6);

}
// A valid empty custom-food response is cached too, preventing repeated reads
// triggered by editor mutations. Explicit refresh still requests fresh data.
{
 let requests=0,frame;const c={window:{addEventListener(){},TeamBullsDietPortions:{setCustomItems:()=>0}},document:{readyState:'loading',addEventListener(){},querySelectorAll:()=>[]},console:quiet,
  CURRENT_USER:{uid:'a',role:'trainer'},db:{collection:()=>({doc:()=>({get:async()=>{requests++;return{exists:true,data:()=>({dietPortionItems:[]})};}})})},
  requestAnimationFrame:fn=>{frame=fn;return 1;},cancelAnimationFrame(){}};
 vm.createContext(c);vm.runInContext(read('custom-food-calorie-bridge-v10_10_12.js'),c);const api=c.window.TeamBullsCustomFoodCalories;
 await api.load();await api.load();await api.load();assert.equal(requests,1,'Empty catalogs should not query on every mutation');
 await api.load(true);assert.equal(requests,2);c.CURRENT_USER={uid:'b',role:'trainer'};await api.load();assert.equal(requests,3,'Cache must be owner scoped');
}


// Concurrent catalog loads remain owner-scoped; late results cannot overwrite
// another trainer's registry. Failure cooldown prevents event-driven read storms.
{
 const pending=[],applied=[];let requests=0;
 const c={window:{addEventListener(){},TeamBullsDietPortions:{setCustomItems:items=>{applied.push(items);return items.length;}}},document:{readyState:'loading',addEventListener(){},querySelectorAll:()=>[]},console:quiet,
 CURRENT_USER:{uid:'a',role:'trainer'},db:{collection:()=>({doc:uid=>({get:()=>{requests++;return new Promise((resolve,reject)=>pending.push({uid,resolve,reject}));}})})}};
 vm.createContext(c);vm.runInContext(read('custom-food-calorie-bridge-v10_10_12.js'),c);const api=c.window.TeamBullsCustomFoodCalories;
 const a=api.load(),aDuplicate=api.load();assert.equal(requests,1,'Concurrent same-owner requests coalesce');c.CURRENT_USER={uid:'b',role:'trainer'};const b=api.load();assert.equal(requests,2);
 pending[1].resolve({exists:true,data:()=>({dietPortionItems:[{label:'Alimento B',protein:10}]})});await b;
 pending[0].resolve({exists:true,data:()=>({dietPortionItems:[{label:'Alimento A',protein:20}]})});await Promise.all([a,aDuplicate]);
 assert.equal(api.items()[0].label,'Alimento B');assert.equal(applied.at(-1)[0].label,'Alimento B');
 c.CURRENT_USER={uid:'c',role:'trainer'};const failed=api.load();pending[2].reject(new Error('offline'));await failed;
 await api.load();await api.load();assert.equal(requests,3,'Failed default reads should respect cooldown');
 const forced=api.load(true);pending[3].resolve({exists:false});await forced;assert.equal(requests,4,'Explicit refresh can retry');
}
console.log('PASS runtime stability: single in-flight write across resume, session isolation, pending-write retention, terminal-listener recovery/backoff, stale errors, denied access and empty-catalog read coalescing.');
