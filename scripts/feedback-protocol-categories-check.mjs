import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=path=>fs.readFileSync(path,'utf8'),core=read('app_v10_10_9_core.js');
const names=['v1010FeedbackType','v1010FeedbackFields','v1010FeedbackDataType','v1010FeedbackLabel','syncFeedbackEditorType','validIsoDate'];
const declarations=names.map(name=>{const line=core.split('\n').find(line=>line.startsWith('function '+name+'('));assert(line,name);return line;}).join('\n');
const sender=core.split('\n').find(line=>line.startsWith('sendFeedback=async function(){const message='));
assert(sender,'The canonical sender must be tested');
const rules=read('firebase/firestore_28_compacto.rules');
const acceptedTypes=[...rules.match(/get\('feedbackType', 'general'\) in \[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map(match=>match[1]);
const elements=Object.fromEntries(['input-feedback-type','input-feedback-title','input-feedback','modal-feedback-title','feedback-editor-help'].map(id=>[id,{value:'',dataset:{},textContent:''}]));
const saved=[],closed=[],cleared=[],alerts=[];
let fail=false,locked=false;
const schedule={startDate:'2026-11-01',intervalWeeks:4};
const c={document:{getElementById:id=>elements[id]},console,
  CURRENT_USER:{uid:'coach',role:'trainer'},VIEW_STUDENT:{uid:'student'},
  firebase:{firestore:{FieldValue:{serverTimestamp:()=>123}}},
  db:{collection:name=>{assert.equal(name,'feedback');return{doc:id=>({set:async data=>{
    if(fail)throw new Error('offline');
    assert(acceptedTypes.includes(data.feedbackType),'The current Rules 28 must accept the stored type');
    saved.push({id,...structuredClone(data)});
  }})};}},
  V109_PROTOCOL_REVIEW_SCHEDULE:schedule,v109ProtocolState:()=>({pendingCycle:3}),
  idempotentDraftId:()=> 'stable-feedback-id',clearIdempotentDraft:key=>cleared.push(key),
  cloudWrite:async promise=>promise,cloudWriteError:error=>error.message,
  beginAction:()=>{if(locked)return false;locked=true;return true;},endAction:()=>{locked=false;},
  closeModal:id=>closed.push(id),alert:text=>alerts.push(text)};
vm.createContext(c);vm.runInContext(declarations+'\n'+sender,c);
for(const [type,label] of [['protocol_start','Início dos protocolos'],['protocol_return','Retorno aos protocolos']]){
  assert.equal(c.v1010FeedbackType(type),type);
  elements['input-feedback-type'].value=type;elements['input-feedback-title'].value='';
  elements['input-feedback'].value='Orientação de teste';c.syncFeedbackEditorType();
  assert.equal(elements['input-feedback-title'].value,label);
  assert.equal(elements['modal-feedback-title'].textContent,label);
  fail=true;const before=saved.length;await c.sendFeedback();
  assert.equal(saved.length,before);assert.equal(locked,false);
  assert.equal(elements['input-feedback-title'].value,label);
  assert.equal(elements['input-feedback'].value,'Orientação de teste');
  fail=false;await c.sendFeedback();const item=saved.at(-1);
  assert.equal(item.feedbackType,'extra');assert.equal(item.feedbackCategory,type);assert.equal(item.title,label);
  assert.equal(item.protocolCycle,0);assert.equal(item.protocolStartDate,'');
  assert.equal(item.read,false);assert.equal(item.createdAt,123);
  assert.equal(c.v1010FeedbackLabel({...item,title:''}),label,'Student fallback label must survive a reload');
  assert.equal(c.v1010FeedbackLabel({...item,title:'Título do treinador'}),'Título do treinador');
  assert.deepEqual(schedule,{startDate:'2026-11-01',intervalWeeks:4},'New feedback cannot restart the administrative cycle');
  for(const file of ['modules/trainer-feedback-archive-v10_10_37.js','modules/trainer-feedback-archive-v10_10_46.js']){
    const source=read(file),start=source.indexOf('  const typeOf='),end=source.indexOf('  const titleOf=',start);
    const labels=vm.runInNewContext(source.slice(start,end)+';({typeOf,typeLabel})');
    assert.equal(labels.typeOf(item),type);assert.equal(labels.typeLabel(item),label,'Trainer history must keep the specific category');
  }
}
assert.equal(saved.length,2);assert.equal(cleared.length,2);assert.equal(closed.length,2);
assert.equal(c.v1010FeedbackDataType({feedbackType:'extra',feedbackCategory:'untrusted'}),'extra');
assert.equal(c.v1010FeedbackDataType({feedbackType:'monthly_full',feedbackCategory:'protocol_start'}),'monthly_full');
assert.equal(c.v1010FeedbackDataType({feedbackType:'unknown',feedbackCategory:'protocol_start'}),'extra');
assert.equal(c.v1010FeedbackType('protocol_update'),'monthly_full');
assert.equal(c.v1010FeedbackType('general'),'extra');assert.equal(c.v1010FeedbackType('unknown'),'extra');
elements['input-feedback-type'].value='monthly_full';elements['input-feedback-title'].value='Título personalizado';
c.syncFeedbackEditorType();assert.equal(elements['input-feedback-title'].value,'Título personalizado','Keep custom titles when switching categories');
await c.sendFeedback();assert.equal(saved.at(-1).feedbackType,'monthly_full');
assert.equal(saved.at(-1).protocolCycle,3);assert.equal(saved.at(-1).protocolStartDate,'2026-11-01');
assert(!('feedbackCategory' in saved.at(-1)),'Existing feedback formats remain unchanged');
let onBackground;const notifications=[];
const sw={importScripts(){},URL,firebase:{initializeApp(){},messaging:()=>({onBackgroundMessage:fn=>{onBackground=fn;}})},
  self:{location:{href:'https://example.test/TeamBulls/feedback-push-sw.js'},addEventListener(){},registration:{showNotification:async(title,options)=>notifications.push({title,options})}}};
vm.runInNewContext(read('feedback-push-sw.js'),sw);
for(const [type,label] of [['protocol_start','Início dos protocolos'],['protocol_return','Retorno aos protocolos']]){
  await onBackground({data:{kind:'feedback',feedbackId:type,feedbackType:type,message:'Texto privado'}});
  assert.equal(notifications.at(-1).title,label);assert(!JSON.stringify(notifications.at(-1)).includes('Texto privado'));
}
console.log('PASS protocol feedback: current Rules 28 compatibility, titles, durable categories, save failure+retry, both histories, monthly cycle preservation and private background notifications.');
