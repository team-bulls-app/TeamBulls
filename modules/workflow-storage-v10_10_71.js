/* Private, owner-scoped recovery data. Never syncs form contents to a server. */
(()=>{
  'use strict';if(window.TeamBullsWorkflowStorage)return;
  const version='10.10.71-workflowstorage1',PREFIX='team_bulls_workflow_v1_',TTL=7*86400000;
  let opening=null;const flights=new Map();
  const owner=()=>{try{return String(CURRENT_USER?.uid||((typeof MODE!=='undefined'&&MODE==='local')?(typeof LOCAL_OWNER_UID!=='undefined'&&LOCAL_OWNER_UID||'local-guest'):'')||'');}catch{return'';}};
  const allowed=scope=>!!scope?.owner&&scope.owner===owner()&&['draft','baseline','delivery','receipt'].includes(scope.kind)&&String(scope.id||'').length>0&&String(scope.id).length<=500;
  const key=scope=>JSON.stringify([scope.owner,scope.kind,String(scope.subject||''),String(scope.id)]);
  function open(){
    if(opening)return opening;
    opening=new Promise(resolve=>{if(typeof indexedDB==='undefined'){resolve(null);return;}let request,timer=setTimeout(()=>resolve(null),2000);try{request=indexedDB.open('team-bulls-workflow-v1',2);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('records')){const records=db.createObjectStore('records',{keyPath:'key'});records.createIndex('owner','owner');}if(!db.objectStoreNames.contains('recordSummaries')){const summaries=db.createObjectStore('recordSummaries',{keyPath:'key'});summaries.createIndex('owner','owner');const cursor=request.transaction.objectStore('records').openCursor();cursor.onsuccess=()=>{const item=cursor.result;if(item){summaries.put(metadata(item.value));item.continue();}};}};request.onsuccess=()=>{clearTimeout(timer);resolve(request.result);};request.onerror=request.onblocked=()=>{clearTimeout(timer);resolve(null);};}catch{clearTimeout(timer);resolve(null);}}).then(database=>{if(!database)opening=null;return database;});return opening;
  }
  function metadata(value){const copy={...value,files:(value.files||[]).map(({blob,...item})=>item)};delete copy.writes;return copy;}
  async function transaction(mode,run,summary=false){
    const database=await open();if(!database)return{available:false};
    return new Promise(resolve=>{let tx,result,timer;const finish=value=>{clearTimeout(timer);resolve(value);};try{tx=database.transaction(summary?'recordSummaries':['records','recordSummaries'],mode);timer=setTimeout(()=>{try{tx.abort();}catch{}finish({available:false});},2500);const store=tx.objectStore(summary?'recordSummaries':'records');run(store,value=>{result=value;},tx);tx.oncomplete=()=>finish({available:true,result});tx.onabort=tx.onerror=()=>finish({available:false});}catch{finish({available:false});}});
  }
  function fallbackRead(scope){try{const value=JSON.parse(localStorage.getItem(PREFIX+encodeURIComponent(key(scope)))||'null');return value?.owner===scope.owner?value:null;}catch{return null;}}
  function retained(value){const age=Date.now()-Number(value?.updatedAt||0);return Number.isFinite(age)&&age>=0&&(value.kind==='receipt'&&value.status!=='confirmed'||value.kind==='delivery'&&value.status!=='confirmed'||age<(value.kind==='draft'?90*86400000:TTL));}
  function unpack(value){if(!value)return value;return{...value,files:(value.files||[]).map(item=>item.blob instanceof ArrayBuffer?{...item,blob:new Blob([item.blob],{type:item.binaryType||item.type||'application/octet-stream'})}:item)};}
  function validRecord(value,scope){return value?.owner===scope.owner&&value.key===key(scope)&&retained(value);}
  async function get(scope){
    if(!allowed(scope))return null;
    const result=await transaction('readonly',(store,done)=>{const request=store.get(key(scope));request.onsuccess=()=>done(request.result);});
    if(!allowed(scope))return null;const value=result.result||fallbackRead(scope);return validRecord(value,scope)?unpack(value):null;
  }
  async function putNow(scope,data){
    if(!allowed(scope))return{ok:false,media:false};
    const value={...data,key:key(scope),owner:scope.owner,kind:scope.kind,subject:String(scope.subject||''),id:String(scope.id),updatedAt:Date.now()};
    let packed;try{packed={...value,files:await Promise.all((value.files||[]).map(async item=>typeof Blob!=='undefined'&&item.blob instanceof Blob?{...item,binaryType:item.blob.type,blob:await item.blob.arrayBuffer()}:item))};}catch{return{ok:false,media:false};}if(!allowed(scope))return{ok:false,media:false};
    const result=await transaction('readwrite',(store,done,tx)=>{if(!allowed(scope))return;store.put(packed);tx.objectStore('recordSummaries').put(metadata(value));done(true);});
    if(!allowed(scope))return{ok:false,media:false};
    if(result.available&&result.result){try{localStorage.removeItem(PREFIX+encodeURIComponent(key(scope)));}catch{}return{ok:true,media:true};}
    try{const light={...value,files:[],mediaRequired:!!value.files?.length||!!value.writes};delete light.writes;const json=JSON.stringify(light);if(json.length>220000)throw new Error('draft too large');localStorage.setItem(PREFIX+encodeURIComponent(key(scope)),json);return{ok:true,media:!value.files?.length&&!value.writes};}catch{return{ok:false,media:false};}
  }
  function put(scope,data){
    if(!allowed(scope))return Promise.resolve({ok:false,media:false});const id=key(scope),previous=flights.get(id)||Promise.resolve();
    const task=previous.catch(()=>{}).then(()=>putNow(scope,data)).finally(()=>{if(flights.get(id)===task)flights.delete(id);});flights.set(id,task);return task;
  }
  async function remove(scope){
    if(!allowed(scope))return false;await flights.get(key(scope))?.catch(()=>{});if(!allowed(scope))return false;
    const result=await transaction('readwrite',(store,done,tx)=>{if(allowed(scope)){store.delete(key(scope));tx.objectStore('recordSummaries').delete(key(scope));done(true);}});let fallback=false;
    try{localStorage.removeItem(PREFIX+encodeURIComponent(key(scope)));fallback=true;}catch{}return!!(result.result||fallback);
  }
  async function list(kind){
    const uid=owner();if(!uid)return[];
    const result=await transaction('readonly',(store,done)=>{const request=store.index('owner').getAll(uid);request.onsuccess=()=>done(request.result);},true);
    if(owner()!==uid)return[];const values=new Map((result.result||[]).map(value=>[value.key,value]));
    try{for(let i=0;i<localStorage.length;i++){const name=localStorage.key(i);if(!name?.startsWith(PREFIX))continue;const value=JSON.parse(localStorage.getItem(name)||'null');if(value?.owner===uid&&!values.has(value.key))values.set(value.key,value);}}catch{}
    return[...values.values()].filter(value=>value.owner===uid&&(!kind||value.kind===kind)&&retained(value)).map(unpack).sort((a,b)=>b.updatedAt-a.updatedAt);
  }
  window.TeamBullsWorkflowStorage=Object.freeze({version,owner,get,put,remove,list,ready:open});
})();
