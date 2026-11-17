import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

let source=fs.readFileSync('modules/student-report-submit-reconciliation-v10_10_57.js','utf8');
source=source.replace('  install();[120,500,1400].forEach(delay=>setTimeout(install,delay));',`  window.testSubmit=robustQuestionnaireSubmit;
  window.configure=(commit,get)=>{restCommit=commit;restGet=get;authHeaders=async()=>({});preparePhoto=async(file,options)=>({data:{userId:options.userId,dataUrl:file.content,...options.extra}});};`);
const fields=value=>({stringValue:value});
function environment(){
 let cycleChecks=0;
 const button={textContent:'ENVIAR RELATÓRIO + 6 FOTOS'},closed=[];
 const report={id:'report-a',studentId:'student-a',trainerId:'trainer-a',questions:['Como foi?'],reportType:'monthly',requestMode:'full'};
 const context={console,window:{addEventListener(){},TeamBullsMonthlyReports:{async assertAvailable(){cycleChecks++;}}},
   CURRENT_USER:{uid:'student-a',role:'student'},auth:{currentUser:{uid:'student-a'}},MODE:'cloud',db:{},navigator:{onLine:true},
   CUR_ANSWER_QUEST_ID:report.id,CURRENT_ANSWER_REPORT:report,File:class File{content='new-photo';},CHECKIN_POSES:['a','b','c','d','e','f'],
   document:{querySelectorAll:()=>[{value:'Bem'}],getElementById:id=>id==='questionnaire-submit-button'?button:null},
   beginAction:()=>true,endAction(){},alert(){},showToast(){},closeModal(id){closed.push(id);},resetQuestionnaireReportPhotos(){},
   ensureReportCycleRuntime:async()=>{},today:()=> '2026-09-23',CFG:{firebase:{projectId:'test-project'}},
   setTimeout(fn){queueMicrotask(fn);return 0;},clearTimeout(){}};
 context.QUESTIONNAIRE_REPORT_FILES=Array.from({length:6},()=>new context.File());
 vm.createContext(context);vm.runInContext(source.replace('  function pendingLabel(count)',"  pendingQuestionnaires=async()=>[];\n  function pendingLabel(count)"),context);
 const fresh={name:'projects/test-project/databases/(default)/documents/questionnaires/report-a',updateTime:'2026-09-23T12:00:00.000000Z',fields:{studentId:fields('student-a'),trainerId:fields('trainer-a'),questions:{arrayValue:{values:[fields('Como foi?')]}},answered:{booleanValue:false}}};
 return{context,fresh,button,closed,get cycleChecks(){return cycleChecks;}};
}

// Successful monthly send preserves exactly the existing atomic photo/answer contract.
{
 const e=environment();let saved;
 e.context.window.configure(async writes=>{saved=writes;},async()=>e.fresh);
 assert.equal(await e.context.window.testSubmit(),true);assert.equal(saved.length,7);
 assert.ok(saved.slice(0,6).every(w=>w.currentDocument.exists===false));
 assert.equal(saved.at(-1).currentDocument.updateTime,e.fresh.updateTime,'same form cannot overwrite a concurrent response');
 assert.equal(saved.at(-1).update.fields.answered.booleanValue,true);
 assert.equal(e.cycleChecks,2,'cycle is checked before photos and immediately before commit');
 assert.ok(saved.every(w=>!w.update.name.includes('protocolReviewSchedules')),'student delivery does not conclude trainer review');
}
// A definite rejection cannot become success just because another response exists.
{
 const e=environment();let reads=0;
 e.context.window.configure(async()=>{throw {definite:true,status:403};},async()=>{reads++;return e.fresh;});
 assert.equal(await e.context.window.testSubmit(),false);assert.equal(reads,1);
}
// Lost response: confirmation compares all persisted answers and all six photos.
for(const mismatch of [false,true]){
 const e=environment();let saved=null;
 e.context.window.configure(async writes=>{saved=writes;throw {definite:false};},async(collection,id)=>{
   if(!saved)return e.fresh;
   const write=saved.find(w=>w.update.name.endsWith('/'+collection+'/'+id));
   return{name:write.update.name,fields:collection==='questionnaires'?{...write.update.fields,studentId:fields('student-a')}:mismatch&&collection==='progressPhotos'?{...write.update.fields,dataUrl:fields('old-photo')}:write.update.fields};
 });
 assert.equal(await e.context.window.testSubmit(),!mismatch);
}
// A trainer reschedule during preparation cancels the send; no write is attempted.
{
 const e=environment();let checks=0,commits=0;
 e.context.window.TeamBullsMonthlyReports.assertAvailable=async()=>{if(++checks===2)throw new Error('Ciclo mudou');};
 e.context.window.configure(async()=>{commits++;},async()=>e.fresh);
 assert.equal(await e.context.window.testSubmit(),false);assert.equal(commits,0);
}
// The active user changing while photos are prepared must not submit either account.
{
 const e=environment();let commits=0;
 e.context.window.TeamBullsMonthlyReports.assertAvailable=async()=>{e.context.CURRENT_USER.uid='student-b';};
 e.context.window.configure(async()=>{commits++;},async()=>e.fresh);
 assert.equal(await e.context.window.testSubmit(),false);assert.equal(commits,0);
}
// A slow or failed commit must consult the parent first. Missing photos may
// return permission-denied under Rules 28, but that cannot trap this attempt.
{
 const e=environment();let now=0,commits=0,photoReads=0,checksFail=false;
 e.context.Date=class extends Date{static now(){return now;}};
 e.context.window.configure(async()=>{commits++;throw {definite:false};},async collection=>{
   if(collection==='progressPhotos'){photoReads++;throw {status:403};}
   if(checksFail)throw {status:503};
   return e.fresh;
 });
 assert.equal(await e.context.window.testSubmit(),false);
 assert.equal(e.button.textContent,'VERIFICAR ENVIO');
 assert.equal(photoReads,0,'An unanswered parent must not trigger any photo reads');
 now=61000;checksFail=true;
 assert.equal(await e.context.window.testSubmit(),false);
 assert.equal(commits,1,'Unavailable server is not proof of absence even after the grace period');
 checksFail=false;
 assert.equal(await e.context.window.testSubmit(),false);
 assert.equal(commits,1,'Verification can unlock Enviar, but must not upload');
 assert.equal(e.button.textContent,'ENVIAR RELATÓRIO + 6 FOTOS');
 assert(e.context.QUESTIONNAIRE_REPORT_FILES.every(file=>file instanceof e.context.File),'Draft photos must remain available');
 e.context.window.configure(async()=>{commits++;},async()=>e.fresh);
 assert.equal(await e.context.window.testSubmit(),true);
 assert.equal(commits,2);
}
// A late successful send can be recovered without touching the form’s fields.
{
 const e=environment();let writes,arrived=false,commits=0;
 e.context.window.configure(async batch=>{writes=batch;commits++;throw {definite:false};},async(collection,id)=>{
   if(!arrived)return e.fresh;
   const write=writes.find(w=>w.update.name.endsWith('/'+collection+'/'+id));
   return{name:write.update.name,fields:{...write.update.fields,...(collection==='questionnaires'?{studentId:fields('student-a')}:null)}};
 });
 assert.equal(await e.context.window.testSubmit(),false);
 arrived=true;
 e.context.QUESTIONNAIRE_REPORT_FILES=[]; // Existing attempt is checked ahead of validation.
 assert.equal(await e.context.window.testSubmit(),true);
 assert.equal(commits,1);
 assert.equal(e.context.CUR_ANSWER_QUEST_ID,null);
 assert.deepEqual(e.closed,['modal-answer-quest']);
}
// A receipt arriving after the student switches account must not clear its form.
{
 const e=environment();let release;
 e.context.window.configure(()=>new Promise(resolve=>{release=resolve;}),async()=>e.fresh);
 const pending=e.context.window.testSubmit();
 for(let i=0;i<100&&!release;i++)await Promise.resolve();
 assert.equal(typeof release,'function');
 e.context.CURRENT_USER={uid:'student-b',role:'student'};
 e.context.auth.currentUser={uid:'student-b'};
 release();
 assert.equal(await pending,false);
 assert.deepEqual(e.closed,[]);
 assert.equal(e.context.QUESTIONNAIRE_REPORT_FILES.length,6);
}
console.log('APROVADO — mensal/questionário confirma conteúdo, 6 fotos, versão do documento, ciclo e sessão.');
