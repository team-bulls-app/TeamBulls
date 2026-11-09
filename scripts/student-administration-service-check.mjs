import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const {createStudentAdministration}=createRequire(import.meta.url)('../functions/student-administration.js');
const clone=structuredClone,deletedField={__delete:true};
class ServiceError extends Error{constructor(code,message,details){super(message);this.code=code;this.details=details;}}
export function fixture(){
  const docs=new Map(),files=new Set(),accounts=new Map(),log=[];let failPath='',failWrite=false,clock=1794225600000;
  const seed=(key,value)=>docs.set(key,clone(value));
  for(const [uid,trainerId,name] of [['s','t','Ana Cadastrada'],['s2','t','Bruno Cadastrado'],['foreign','other','Outro aluno']]){
    seed('users/'+uid,{role:'student',name,email:uid+'@example.invalid',status:'active',trainerId});accounts.set(uid,{disabled:false});
    for(const [collection,field] of [['sessions','userId'],['exercises','userId'],['workouts','userId'],['feedback','studentId'],['questionnaires','studentId'],['weeklyCheckins','studentId'],['progressPhotos','userId'],['freeMealLogs','userId'],['mealCompletions','studentUid'],['workoutCompletions','studentUid'],['workoutCycleStates','studentUid'],['notifications','studentId'],['planVersions','studentId'],['auditLogs','studentId'],['studentInvites','usedBy']])seed(collection+'/'+uid,{[field]:uid,trainerId,workoutId:'w-'+uid,keep:'original'});
    for(const collection of ['mealPlans','checkinSchedules','protocolReviewSchedules','dietCalculations','studentBilling','pushDevices'])seed(collection+'/'+uid,{studentId:uid,keep:'original'});
    seed('users/'+uid+'/legacy/profile',{private:'nested data'});seed('pushDevices/'+uid+'/tokens/token',{token:'private'});seed('workouts/w-'+uid,{userId:uid});seed('exercises/legacy-'+uid,{workoutId:'w-'+uid});seed('sessions/legacy-'+uid,{workoutId:'w-'+uid});
    seed('trainerBilling/'+trainerId+'/payments/p-'+uid,{studentId:uid});seed('trainerActivity/'+trainerId+'/events/e-'+uid,{studentId:uid});seed('planTemplates/'+uid,{trainerId,snapshot:{targetUid:uid,private:'preserve other students'}});
    for(const prefix of ['progressPhotos','progressPhotoThumbs','progressPhotoOriginals','freeMealLogs','studentProfiles'])files.add(prefix+'/'+uid+'/file');files.add('paymentReceipts/'+trainerId+'/'+uid+'/receipt.jpg');
  }
  seed('users/t',{role:'trainer',name:'Treinador'});seed('users/other',{role:'trainer',name:'Outro treinador'});
  const snapshot=(key,value)=>({id:key.split('/').at(-1),ref:ref(key),exists:value!==undefined,data:()=>clone(value)});
  const read=(row,key)=>key.split('.').reduce((value,part)=>value?.[part],row);
  function ref(path,filters=null,maximum=Infinity){return{path,id:path.split('/').at(-1),doc:id=>ref(path+'/'+id),collection:name=>ref(path+'/'+name),where:(field,_op,value)=>ref(path,[...(filters||[]),[field,value]],maximum),limit:n=>ref(path,filters||[],n),get:async()=>{
    if(filters===null&&path.split('/').length%2===0)return snapshot(path,docs.get(path));
    return{docs:[...docs.entries()].filter(([key,row])=>key.startsWith(path+'/')&&!key.slice(path.length+1).includes('/')&&(filters||[]).every(([field,value])=>read(row,field)===value)).slice(0,maximum).map(([key,row])=>snapshot(key,row))};
  }};}
  function merge(target,patch){for(const [key,value] of Object.entries(patch)){if(value?.__delete)delete target[key];else if(value&&typeof value==='object'&&!Array.isArray(value))target[key]=merge(target[key]&&typeof target[key]==='object'?target[key]:{},value);else target[key]=clone(value);}return target;}
  const db={collection:name=>ref(name),runTransaction:async task=>{
    const staged=[];let wrote=false;const result=await task({get:async r=>{assert(!wrote,'Transaction reads must precede all writes');return r.get();},set:(r,p,o)=>{wrote=true;staged.push(['set',r.path,clone(p),o]);},update:(r,p)=>{wrote=true;staged.push(['set',r.path,clone(p),{merge:true}]);},delete:r=>{wrote=true;staged.push(['delete',r.path]);}});
    if(failWrite)throw Object.assign(new Error('Servidor indisponível'),{code:'unavailable'});
    for(const [kind,key,p,o] of staged){if(kind==='delete')docs.delete(key);else{let value=o?.merge?merge(clone(docs.get(key)||{}),p):clone(p);if(o?.mergeFields){value=clone(docs.get(key)||{});for(const field of o.mergeFields)value[field]=clone(p[field]);}docs.set(key,value);}log.push([kind,key]);}return result;
  },recursiveDelete:async r=>{log.push(['recursiveDelete',r.path]);if(failPath&&r.path===failPath){failPath='';throw new Error('injected storage failure');}for(const key of [...docs.keys()])if(key===r.path||key.startsWith(r.path+'/'))docs.delete(key);}};
  const service=createStudentAdministration({db,identity:{updateUser:async(uid,p)=>{if(!accounts.has(uid))throw Object.assign(new Error('missing'),{code:'auth/user-not-found'});Object.assign(accounts.get(uid),p);log.push(['disableAuth',uid]);},deleteUser:async uid=>{accounts.delete(uid);log.push(['deleteAuth',uid]);}},bucket:{getFiles:async({prefix,maxResults})=>[[...files].filter(name=>name.startsWith(prefix)).slice(0,maxResults).map(name=>({name,delete:async()=>{files.delete(name);log.push(['file',name]);}}))]},serverTimestamp:()=>clock,deleteField:()=>deletedField,ErrorType:ServiceError,now:()=>clock,newLease:()=> 'lease-'+log.length});
  const call=(action,studentUid='s',data={},actor='t',time=clock/1000)=>service({auth:{uid:actor,token:{auth_time:time}},app:{appId:'synthetic'},data:{clientVersion:'10.10.71-studentadmin1',...data,action,studentUid}});
  return{docs,files,accounts,log,service,call,seed,setFail:p=>failPath=p,setWriteFail:value=>failWrite=value,tick:ms=>clock+=ms};
}
if(process.argv[1]?.endsWith('student-administration-service-check.mjs')){
let count=0;
{
  const f=fixture();await f.call('nickname','s',{nickname:'Ani'},'s');assert.equal(f.docs.get('users/s').name,'Ana Cadastrada');assert.equal(f.docs.get('users/s').registeredName,'Ana Cadastrada');assert.equal(f.docs.get('users/s').nickname,'Ani');count++;
  await f.call('registeredName','s',{registeredName:'Ana Nome Completo'});assert.equal(f.docs.get('users/s').nickname,'Ani');await f.call('nickname','s',{nickname:''});assert.equal(f.docs.get('users/s').nickname,'');assert.equal(f.docs.get('users/s').registeredName,'Ana Nome Completo');count++;
  const before=JSON.stringify([...f.docs]);await assert.rejects(f.call('registeredName','foreign',{registeredName:'Indevido'}),e=>e.code==='permission-denied');await assert.rejects(f.call('nickname','s2',{nickname:'Indevido'},'s'),e=>e.code==='permission-denied');assert.equal(JSON.stringify([...f.docs]),before);count++;
}
{
  const f=fixture(),history=JSON.stringify([...f.docs].filter(([k])=>!k.startsWith('users/')&&!k.startsWith('trainerRosters/')));await f.call('archive');assert.equal(f.docs.get('users/s').status,'inactive');assert.equal(f.docs.get('users/s').isArchived,true);assert.equal(JSON.stringify([...f.docs].filter(([k])=>!k.startsWith('users/')&&!k.startsWith('trainerRosters/'))),history);await assert.rejects(f.call('nickname','s',{nickname:'Sem acesso'},'s'),e=>e.code==='permission-denied');await f.call('restore');assert.equal(f.docs.get('users/s').status,'active');assert.equal(f.docs.get('users/s').isArchived,false);const restored=JSON.stringify([...f.docs]);await f.call('restore');assert.equal(JSON.stringify([...f.docs]),restored,'Lost acknowledgement must allow a safe restore retry');assert.equal(JSON.stringify([...f.docs].filter(([k])=>!k.startsWith('users/')&&!k.startsWith('trainerRosters/'))),history);count++;
}
{
  const f=fixture(),data={direction:-1,requestId:'request-0001'};const result=await f.call('move','s2',data);assert.deepEqual(result.order,['s2','s']);assert.deepEqual((await f.call('move','s2',data)).order,['s2','s']);await assert.rejects(f.call('move','s',data),e=>e.code==='invalid-argument');assert.deepEqual((await f.call('preferences')).order,['s2','s']);count++;
  await f.call('archive','s2');const result2=await f.call('move','s',{direction:-1,requestId:'request-0002'});assert.deepEqual(result2.order,['s']);await assert.rejects(f.call('move','foreign',{direction:1,requestId:'request-0003'}),e=>e.code==='not-found');count++;
}
{
  const f=fixture();for(const actor of ['s','other']){await assert.rejects(f.call('archive','s',{},actor),e=>e.code==='permission-denied');await assert.rejects(f.call('move','s',{direction:1,requestId:'wrong-actor'},actor),e=>['permission-denied','not-found'].includes(e.code));}count++;
  await assert.rejects(f.service({auth:{uid:'t'},data:{action:'preferences'}}),e=>e.code==='unauthenticated');await assert.rejects(f.call('archive','../s'),e=>e.code==='invalid-argument');await assert.rejects(f.call('archive','__proto__'),e=>e.code==='invalid-argument');await assert.rejects(f.call('archive','s',{clientVersion:'old'}),e=>e.code==='failed-precondition');count++;
}
const deletion={email:'s@example.invalid',confirmation:'EXCLUIR'};
{
  const f=fixture();await f.call('archive');await f.call('delete','s',deletion);f.seed('users/s',{name:'Novo cadastro',email:'new@example.invalid',role:'student',trainerId:'other',status:'active'});const before=JSON.stringify([...f.docs]);await assert.rejects(f.call('delete','s',deletion),e=>e.code==='failed-precondition');assert.equal(JSON.stringify([...f.docs]),before,'A completed receipt must not claim to delete a reused UID or another owner profile');count++;
}
{
  const f=fixture();await assert.rejects(f.call('delete','s',deletion),e=>e.code==='failed-precondition');await f.call('archive');const before=JSON.stringify([...f.docs]);await assert.rejects(f.call('delete','s',{...deletion,email:'wrong@example.invalid'}),e=>e.code==='invalid-argument');await assert.rejects(f.call('delete','s',{...deletion,confirmation:'sim'}),e=>e.code==='invalid-argument');await assert.rejects(f.call('delete','s',deletion,'t',0),e=>e.details?.reason==='recent-login-required');assert.equal(JSON.stringify([...f.docs]),before);count++;
}
{
  const f=fixture();await f.call('archive');const otherDocs=JSON.stringify([...f.docs].filter(([key])=>key.includes('s2')||key.includes('foreign'))),otherFiles=[...f.files].filter(name=>name.includes('/s2/')||name.includes('/foreign/'));
  f.files.add('progressPhotos/s-other/file');assert.deepEqual(await f.call('delete','s',deletion),{deleted:true});assert(!f.docs.has('users/s'));assert(!f.accounts.has('s'));assert.equal(JSON.stringify([...f.docs].filter(([key])=>key.includes('s2')||key.includes('foreign'))),otherDocs);assert(otherFiles.every(name=>f.files.has(name)));assert(f.files.has('progressPhotos/s-other/file'));assert(![...f.files].some(name=>name.includes('/s/')));assert(!f.docs.has('exercises/legacy-s'));assert(!f.docs.has('pushDevices/s/tokens/token'));assert(!f.docs.has('planTemplates/s'));assert(!f.docs.has('users/s/legacy/profile'));count++;
  const receipt=[...f.docs].find(([key])=>key.startsWith('studentDeletionJobs/'))[1];assert.equal(receipt.state,'completed');assert(!Object.hasOwn(receipt,'studentUid'));assert(!Object.hasOwn(receipt,'emailHash'));assert.deepEqual(await f.call('delete','s',deletion),{deleted:true});count++;
}
{
  const f=fixture();await f.call('archive');f.setFail('sessions/s');await assert.rejects(f.call('delete','s',deletion),/injected/);assert.equal(f.docs.get('users/s').status,'inactive');assert(f.docs.get('users/s').trainerId.startsWith('!deleting:'));assert.equal(f.accounts.get('s').disabled,true);assert.equal((await f.call('preferences')).pendingDeletions[0].uid,'s');await assert.rejects(f.call('restore'),e=>e.code==='failed-precondition');assert.deepEqual(await f.call('delete','s',deletion),{deleted:true});assert.equal((await f.call('preferences')).pendingDeletions.length,0);count++;
}
{
  const f=fixture();await f.call('archive');f.seed('exercises/mixed',{userId:'foreign',workoutId:'w-s'});await assert.rejects(f.call('delete','s',deletion),e=>e.code==='failed-precondition');assert(f.docs.has('exercises/mixed'));assert(f.docs.has('users/foreign'));count++;
}
{
  const f=fixture();await f.call('archive');f.setFail('sessions/s');await assert.rejects(f.call('delete','s',deletion));const reassigned={...f.docs.get('users/s'),trainerId:'other'};f.seed('users/s',reassigned);const before=JSON.stringify([...f.docs]);await assert.rejects(f.call('delete','s',deletion),e=>e.code==='failed-precondition');assert.equal(JSON.stringify([...f.docs]),before,'A previous owner must not resume after reassignment');count++;
}
{
  const f=fixture();f.seed('users/s',{...f.docs.get('users/s'),isArchived:true,archivedBy:'t',archivedAt:123});assert.deepEqual((await f.call('preferences')).archivedIds,[],'Untrusted signup extras cannot archive a student');assert.deepEqual((await f.call('move','s2',{direction:-1,requestId:'trusted-archive-proof'})).order,['s2','s']);await f.call('nickname','s',{nickname:'Ani'},'s');assert.equal(f.docs.get('users/s').status,'active');count++;
}
console.log(`PASS ${count} administration service scenarios: canonical name/nickname, trainer ownership, archive/restore without history loss, idempotent cloud order, App Check/auth, recent login, exact confirmation, scoped full deletion, minimal receipt, failed-job resumption and mixed-owner refusal.`);

}
