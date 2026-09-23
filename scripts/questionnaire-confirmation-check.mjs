import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

let source=fs.readFileSync('modules/student-report-submit-reconciliation-v10_10_57.js','utf8');
source=source.replace('  install();[120,500,1400].forEach(delay=>setTimeout(install,delay));',`  window.testSubmit=robustQuestionnaireSubmit;
  window.configure=(commit,get)=>{restCommit=commit;restGet=get;preparePhoto=async(file,options)=>({data:{userId:options.userId,dataUrl:file.content,...options.extra}});};`);
const fields=value=>({stringValue:value});
function environment(){
 let cycleChecks=0;
 const report={id:'report-a',studentId:'student-a',trainerId:'trainer-a',questions:['Como foi?'],reportType:'monthly',requestMode:'full'};
 const context={console,window:{addEventListener(){},TeamBullsMonthlyReports:{async assertAvailable(){cycleChecks++;}}},
   CURRENT_USER:{uid:'student-a',role:'student'},auth:{currentUser:{uid:'student-a'}},MODE:'cloud',db:{},navigator:{onLine:true},
   CUR_ANSWER_QUEST_ID:report.id,CURRENT_ANSWER_REPORT:report,File:class File{content='new-photo';},CHECKIN_POSES:['a','b','c','d','e','f'],
   document:{querySelectorAll:()=>[{value:'Bem'}],getElementById:()=>null},
   beginAction:()=>true,endAction(){},alert(){},showToast(){},closeModal(){},resetQuestionnaireReportPhotos(){},
   ensureReportCycleRuntime:async()=>{},today:()=> '2026-09-23',CFG:{firebase:{projectId:'test-project'}},
   setTimeout(fn){queueMicrotask(fn);return 0;},clearTimeout(){}};
 context.QUESTIONNAIRE_REPORT_FILES=Array.from({length:6},()=>new context.File());
 vm.createContext(context);vm.runInContext(source.replace('  function pendingLabel(count)',"  pendingQuestionnaires=async()=>[];\n  function pendingLabel(count)"),context);
 const fresh={name:'projects/test-project/databases/(default)/documents/questionnaires/report-a',updateTime:'2026-09-23T12:00:00.000000Z',fields:{studentId:fields('student-a'),trainerId:fields('trainer-a'),questions:{arrayValue:{values:[fields('Como foi?')]}},answered:{booleanValue:false}}};
 return{context,fresh,get cycleChecks(){return cycleChecks;}};
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
   return{name:write.update.name,fields:mismatch&&collection==='progressPhotos'?{...write.update.fields,dataUrl:fields('old-photo')}:write.update.fields};
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
console.log('APROVADO — mensal/questionário confirma conteúdo, 6 fotos, versão do documento, ciclo e sessão.');
