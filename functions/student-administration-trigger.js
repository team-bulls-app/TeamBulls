'use strict';
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {getAuth}=require('firebase-admin/auth');
const {getStorage}=require('firebase-admin/storage');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {createStudentAdministration}=require('./student-administration');

const studentAdministration=createStudentAdministration({db:getFirestore(),identity:getAuth(),bucket:getStorage().bucket(),serverTimestamp:()=>FieldValue.serverTimestamp(),deleteField:()=>FieldValue.delete(),ErrorType:HttpsError});

exports.studentAdministration=onCall({region:'southamerica-east1',enforceAppCheck:true,cors:['https://team-bulls-app.github.io'],memory:'512MiB',timeoutSeconds:540,maxInstances:2},async request=>{
  try{
    const token=String(request.rawRequest.headers.authorization||'').replace(/^Bearer\s+/i,'');
    const verified=await getAuth().verifyIdToken(token,true);
    if(verified.uid!==request.auth?.uid)throw new Error('Sessão divergente');
  }catch(error){throw new HttpsError('unauthenticated','Entre novamente antes de alterar o cadastro.');}
  return studentAdministration(request);
});
