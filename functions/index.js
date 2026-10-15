'use strict';
const {onDocumentCreated}=require('firebase-functions/v2/firestore');
const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {getMessaging}=require('firebase-admin/messaging');

initializeApp();
const titles=Object.freeze({weekly_report:'Relatório semanal',monthly_full:'Relatório mensal completo',weekly_diet:'Relatório semanal dieta',weekly_training:'Relatório semanal treino',extra:'Feedback extra',protocol_update:'Relatório mensal completo',general:'Feedback extra'});
const invalidToken=code=>['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(String(code||''));

exports.notifyNewFeedback=onDocumentCreated({document:'feedback/{feedbackId}',region:'southamerica-east1',memory:'256MiB',timeoutSeconds:60,maxInstances:2},async event=>{
  const feedback=event.data?.data()||{},studentId=String(feedback.studentId||''),trainerId=String(feedback.trainerId||'');
  if(!studentId||!trainerId||!event.params.feedbackId)return;
  const db=getFirestore(),user=await db.collection('users').doc(studentId).get();
  if(!user.exists||user.data().role!=='student'||user.data().status!=='active'||user.data().trainerId!==trainerId)return;
  const devices=await db.collection('pushDevices').doc(studentId).collection('tokens').get();
  if(devices.empty)return;
  const rows=devices.docs.filter(doc=>typeof doc.data().token==='string'&&doc.data().token.length>20);
  for(let offset=0;offset<rows.length;offset+=500){
    const part=rows.slice(offset,offset+500),tokens=part.map(doc=>doc.data().token);
    const result=await getMessaging().sendEachForMulticast({tokens,data:{kind:'feedback',feedbackId:String(event.params.feedbackId),feedbackType:Object.hasOwn(titles,feedback.feedbackType)?feedback.feedbackType:'extra'},webpush:{headers:{TTL:'86400',Urgency:'high'}}});
    await Promise.all(result.responses.map((response,index)=>response.success||!invalidToken(response.error?.code)?null:part[index].ref.delete()));
  }
});
